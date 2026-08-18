-- ============================================================================
-- 2A · M1+M8 — auth_attempts + progressive per-account throttling (TSD §5.6,
-- PRD §4.1.1/§4.1.7; AC-AUTH-12 as a test; round-9 finding 1, ADR-0013).
--
-- The contract these tests pin (as amended by round 9):
--   · public.auth_attempts — existence-blind attempt ledger keyed on
--     hc.contact_key(identifier); NO FK to accounts, by design (§5.5 never
--     enumerate). Zero request-path privileges; hc_internal writes it
--     through the definers below.
--   · hc.auth_throttle(text) → jsonb {failures, wait_seconds} — advisory,
--     never raises, EXECUTE to anon AND authenticated (sign-in runs as
--     anon; §5.7 step-up re-auth runs as authenticated and must be
--     throttled by the same counters or step-up becomes an unthrottled
--     password oracle).
--   · hc.record_auth_failure(text) → jsonb {failures} — the ONLY outcome a
--     request role may assert. A fabricated failure grants an attacker
--     nothing a real failed attempt would not (and AC-AUTH-12 boxes both);
--     success-class events are a different authority entirely.
--   · hc.record_auth_success(text) → jsonb {cleared} — round-9 finding 1:
--     success-class outcomes ('success' | 'reset_completed') are BOUND TO
--     THE CALLER'S PROVEN IDENTITY. No parameter names an account; the
--     cleared key derives from hc.uid() → accounts.email, so the only
--     throttle state a session can clear is the one its own successful
--     authentication already refutes. EXECUTE to authenticated ONLY —
--     anon can assert nothing. hc.record_auth_attempt(text, text), which
--     let any caller assert 'success' for any identifier, is GONE.
--   · The schedule (pinned here, recorded in the migration header):
--     failures counted in the TRAILING 15 MINUTES, and only those after
--     the most recent success/reset_completed; required wait from the
--     latest failure: n≤4 → 0 · 5–7 → 30 s · 8–9 → 120 s · ≥10 → 900 s.
--     900 s IS the §5.6 cap: no reachable state waits longer (AC-AUTH-12),
--     and a success-class event clears the counter instantly — the email
--     reset path consults nothing here and its completion CLEARS the
--     per-account state, so the one-hour invariant holds by arithmetic.
--
-- Privilege-closure asserts are catalog-based (has_function_privilege) —
-- ACL-denied function CALLS segfault this image (PLT-04); reds never dial
-- the crash. Fixture mutations in DO blocks, probes in separate statements.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(39);

-- ----------------------------------------------------------------------------
-- Helpers (house pattern, self-contained per file)
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid) returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_id || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  return p_id;
end $$;

create function pg_temp.errcode_as(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := returned_sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

-- Run as an authenticated session carrying sub + email claims (the success
-- recorder binds on the session identity, exactly as GoTrue signs it).
create function pg_temp.call_as(p_user uuid, p_email text, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- Record n failures as anon for one key, in a DO block (mutations in DO
-- blocks; probes come separately).
create function pg_temp.fail_n(p_ident text, p_n int)
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  for i in 1..p_n loop
    perform hc.record_auth_failure(p_ident);
  end loop;
  execute 'reset role';
end $$;

-- An account whose auth.users email is mirrored onto accounts.email; the
-- slot stashes the email for later probes.
create function pg_temp.mk_account(p_slot text) returns void
language plpgsql as $$
declare u uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Holder');
  perform set_config('t.' || p_slot, u::text, true);
  perform set_config('t.' || p_slot || '_email', u || '@fixture.local', true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · Shape and boundary: the table exists, RLS forced, zero request reach.
-- ----------------------------------------------------------------------------
select has_table('public', 'auth_attempts', 'auth_attempts exists');

select is(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'auth_attempts'),
  true, 'auth_attempts: RLS enabled AND forced');

select is(pg_temp.errcode_as('anon', 'select * from public.auth_attempts'),
  '42501', 'anon cannot read auth_attempts — sign-in history is not a public oracle');
select is(pg_temp.errcode_as('authenticated',
  $$ insert into public.auth_attempts (attempt_key, outcome) values ('x', 'failure') $$),
  '42501', 'authenticated cannot write auth_attempts directly — the definers are the only path');

-- ----------------------------------------------------------------------------
-- 5–10 · Function surface: the round-9 boundary. The outcome-parameter form
-- is GONE; failure recording stays a request-role surface; success recording
-- is authenticated-only and takes no identifier.
-- ----------------------------------------------------------------------------
select has_function('hc', 'auth_throttle', array['text'],
  'hc.auth_throttle(text) exists');
select hasnt_function('hc', 'record_auth_attempt', array['text', 'text'],
  'hc.record_auth_attempt(text, text) is GONE — no caller-supplied outcomes (round-9 finding 1)');
select has_function('hc', 'record_auth_failure', array['text'],
  'hc.record_auth_failure(text) exists');
select has_function('hc', 'record_auth_success', array['text'],
  'hc.record_auth_success(text) exists — kind only, never an identifier');

select is(
  (select array_agg(r order by r) from unnest(array['anon', 'authenticated']) r
   where has_function_privilege(r, 'hc.auth_throttle(text)', 'execute')
     and has_function_privilege(r, 'hc.record_auth_failure(text)', 'execute')),
  array['anon', 'authenticated'],
  'auth_throttle + record_auth_failure: EXECUTE to anon and authenticated (sign-in AND step-up re-auth paths)');
select is(
  (select array_agg(r order by r)
   from unnest(array['anon', 'authenticated', 'hc_admin', 'hc_pipeline']) r
   where has_function_privilege(r, 'hc.record_auth_success(text)', 'execute')),
  array['authenticated'],
  'record_auth_success: authenticated ONLY — anon asserts nothing success-class, ever');

-- ----------------------------------------------------------------------------
-- 11–12 · Empty history: advisory zero, never an error, callable as anon.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('anon',
  $$ select hc.auth_throttle('nobody-yet@example.org') $$),
  'no_error', 'auth_throttle callable as anon');

set local role anon;
select is(hc.auth_throttle('nobody-yet@example.org'),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'no history → failures 0, wait 0');
reset role;

-- ----------------------------------------------------------------------------
-- 13–18 · The progressive schedule, from live recording (one transaction ⇒
-- now() is fixed ⇒ the wait probe returns the FULL delay, deterministically).
-- ----------------------------------------------------------------------------
select pg_temp.fail_n('sched@example.org', 4);
set local role anon;
select is(hc.auth_throttle('sched@example.org'),
  jsonb_build_object('failures', 4, 'wait_seconds', 0),
  'failures 1–4: no delay — a mistyped password is not an incident');
reset role;

select pg_temp.fail_n('sched@example.org', 1);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 30,
  'failure 5: 30 s');
reset role;

select pg_temp.fail_n('sched@example.org', 3);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 120,
  'failure 8: 120 s');
reset role;

select pg_temp.fail_n('sched@example.org', 2);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 900,
  'failure 10: 900 s — the 15-minute box');
reset role;

select pg_temp.fail_n('sched@example.org', 30);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 900,
  'failure 40: STILL 900 s — the cap never escalates past 15 minutes (AC-AUTH-12)');
select is((hc.auth_throttle('sched@example.org')->>'failures')::int, 40,
  'the count keeps counting (the suspicious-attempt threshold reads it) while the wait stays boxed');
reset role;

-- ----------------------------------------------------------------------------
-- 19–21 · The wait decays from the LATEST failure; the window is trailing.
-- Backdated fixtures written directly as postgres (superuser, test-only).
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.auth_attempts (attempt_key, outcome, attempted_at)
  select hc.contact_key('decay@example.org'), 'failure', now() - interval '14 minutes'
  from generate_series(1, 10);
end $$;
set local role anon;
select is((hc.auth_throttle('decay@example.org')->>'wait_seconds')::int, 60,
  '10 failures 14 min ago: 900 − 840 = 60 s remain');
reset role;

do $$
begin
  insert into public.auth_attempts (attempt_key, outcome, attempted_at)
  select hc.contact_key('lapsed@example.org'), 'failure', now() - interval '16 minutes'
  from generate_series(1, 10);
end $$;
set local role anon;
select is(hc.auth_throttle('lapsed@example.org'),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'failures older than the trailing 15 minutes contribute nothing');
select is(hc.auth_throttle('never@example.org'),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'an untouched key stays clean while neighbours are throttled');
reset role;

-- ----------------------------------------------------------------------------
-- 22–27 · Success-class events clear the counter (the AC-AUTH-12 exit) —
-- through the REAL identity-bound path, and ONLY for the session's own key.
-- ----------------------------------------------------------------------------
select pg_temp.mk_account('holder');
select pg_temp.fail_n(current_setting('t.holder_email'), 6);
select is(pg_temp.call_as(current_setting('t.holder')::uuid,
  current_setting('t.holder_email'),
  $$ select (hc.record_auth_success('success')) ->> 'cleared' $$),
  'true',
  'a session that authenticated AS the account clears it — the only mint is the password itself');
set local role anon;
select is(hc.auth_throttle(current_setting('t.holder_email')),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'the success cleared the failure state');
reset role;

select pg_temp.fail_n(current_setting('t.holder_email'), 5);
set local role anon;
select is((hc.auth_throttle(current_setting('t.holder_email'))->>'wait_seconds')::int, 30,
  'failures after a success count fresh from zero');
reset role;

select pg_temp.mk_account('resetter');
select pg_temp.fail_n(current_setting('t.resetter_email'), 12);
select is(pg_temp.call_as(current_setting('t.resetter')::uuid,
  current_setting('t.resetter_email'),
  $$ select (hc.record_auth_success('reset_completed')) ->> 'cleared' $$),
  'true',
  'a completed email reset clears the state — the §5.6 recovery path, never blocked, always an exit');
set local role anon;
select is(hc.auth_throttle(current_setting('t.resetter_email')),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'the reset_completed event cleared the state');
reset role;

-- The round-9 crux: another authenticated session CANNOT clear a foreign
-- key — there is no parameter to aim, so its success lands on its own key.
select pg_temp.mk_account('victim');
select pg_temp.mk_account('attacker');
select pg_temp.fail_n(current_setting('t.victim_email'), 6);
do $wrap$
begin
  perform pg_temp.call_as(current_setting('t.attacker')::uuid,
    current_setting('t.attacker_email'),
    $$ select hc.record_auth_success('success')::text $$);
end $wrap$;
set local role anon;
select is((hc.auth_throttle(current_setting('t.victim_email'))->>'failures')::int, 6,
  'round-9 finding 1: a stranger''s authenticated success clears NOTHING for the victim — identity-bound, no identifier parameter');
reset role;

-- ----------------------------------------------------------------------------
-- 28–29 · The failure recorder returns the running count; existence-blind.
-- ----------------------------------------------------------------------------
do $$
declare v jsonb;
begin
  execute 'set local role anon';
  v := hc.record_auth_failure('counted@example.org');
  execute 'reset role';
  perform set_config('t.counted', v->>'failures', true);
end $$;
select is(current_setting('t.counted')::int, 1,
  'record_auth_failure returns the running failure count for the caller''s threshold logic');

select pg_temp.fail_n('ghost-no-account@example.org', 5);
set local role anon;
select is(hc.auth_throttle(current_setting('t.holder_email')),
          hc.auth_throttle('ghost-no-account@example.org'),
  'identical histories → byte-identical answers, account or no account (§5.5 never enumerate)');
reset role;

-- ----------------------------------------------------------------------------
-- 30–31 · Canonical keys: spelling variants share one budget (hc.contact_key).
-- ----------------------------------------------------------------------------
select pg_temp.fail_n('Case@Example.org', 3);
select pg_temp.fail_n('  case@example.org  ', 2);
set local role anon;
select is((hc.auth_throttle('CASE@EXAMPLE.ORG')->>'failures')::int, 5,
  'case and whitespace variants share ONE budget (hc.contact_key, the FRZ-07 precedent)');
reset role;

select is(
  (select count(distinct attempt_key)::int from public.auth_attempts
   where attempt_key = hc.contact_key('Case@Example.org')),
  1, 'the stored key is canonical — no per-spelling rows');

-- ----------------------------------------------------------------------------
-- 32–34 · Refusals: ONE shape, and nothing written by a refused call.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.holder')::uuid,
  current_setting('t.holder_email'),
  $$ select hc.record_auth_success('lockout')::text $$),
  'ERROR:P0001:auth_attempt_refused',
  'unknown success kind: one refusal shape (there is no lockout outcome, by design)');
select throws_ok(
  $$ select hc.record_auth_failure('   ') $$,
  'P0001', 'auth_attempt_refused',
  'blank identifier refused — no anonymous global bucket exists');
select is(pg_temp.errcode_as('authenticated',
  $$ select hc.record_auth_success('success') $$),
  'P0001',
  'an authenticated session with no identity claims clears nothing — one refusal shape');

-- ----------------------------------------------------------------------------
-- 35 · The ledger never holds an unknown outcome.
-- ----------------------------------------------------------------------------
select is((select count(*)::int from public.auth_attempts
           where outcome not in ('failure', 'success', 'reset_completed')), 0,
  'no refused outcome ever reached the table');

-- ----------------------------------------------------------------------------
-- 36–37 · AC-AUTH-12 as a property: an adversarial 200-attempt history spread
-- over 30 minutes can never push the wait past 900 s; once the latest failure
-- is older than 15 minutes the wait is exactly 0. No third-party sequence
-- reaches a state the holder cannot leave within the hour.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.auth_attempts (attempt_key, outcome, attempted_at)
  select hc.contact_key('adversary@example.org'), 'failure',
         now() - (i * 13 % 1800) * interval '1 second'
  from generate_series(1, 200) i;
end $$;
set local role anon;
select cmp_ok((hc.auth_throttle('adversary@example.org')->>'wait_seconds')::int,
  '<=', 900,
  'AC-AUTH-12: 200 adversarial failures over 30 minutes cannot exceed the 900 s box');
reset role;

do $$
begin
  update public.auth_attempts
     set attempted_at = now() - interval '15 minutes 1 second'
   where attempt_key = hc.contact_key('adversary@example.org')
     and attempted_at > now() - interval '15 minutes 1 second';
end $$;
set local role anon;
select is((hc.auth_throttle('adversary@example.org')->>'wait_seconds')::int, 0,
  'AC-AUTH-12: the moment the latest failure ages past 15 minutes, the wait is 0');
reset role;

-- ----------------------------------------------------------------------------
-- 38–39 · Hygiene: all three definers owned by hc_internal with a pinned
-- search_path, and same-key rows older than 24 h are pruned on write.
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   join pg_roles r on r.oid = p.proowner
   where n.nspname = 'hc'
     and p.proname in ('auth_throttle', 'record_auth_failure', 'record_auth_success')
     and r.rolname = 'hc_internal'
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  3, 'all three functions: hc_internal-owned SECURITY DEFINER with search_path pinned');

do $$
begin
  insert into public.auth_attempts (attempt_key, outcome, attempted_at)
  values (hc.contact_key('stale@example.org'), 'failure', now() - interval '25 hours');
end $$;
select pg_temp.fail_n('stale@example.org', 1);
select is(
  (select count(*)::int from public.auth_attempts
   where attempt_key = hc.contact_key('stale@example.org')
     and attempted_at < now() - interval '24 hours'),
  0, 'rows older than 24 h for the key are pruned on the next write — the ledger is a window, not an archive');

select * from finish();
rollback;
