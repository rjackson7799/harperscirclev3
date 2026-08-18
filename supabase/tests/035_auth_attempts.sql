-- ============================================================================
-- 2A · M1 — auth_attempts + progressive per-account throttling (TSD §5.6,
-- PRD §4.1.1/§4.1.7; AC-AUTH-12 as a test).
--
-- The contract these tests pin:
--   · public.auth_attempts — existence-blind attempt ledger keyed on
--     hc.contact_key(identifier); NO FK to accounts, by design (§5.5 never
--     enumerate). Zero request-path privileges; hc_internal writes it
--     through the two definers below.
--   · hc.auth_throttle(text) → jsonb {failures, wait_seconds} — advisory,
--     never raises, EXECUTE to anon AND authenticated (sign-in runs as
--     anon; §5.7 step-up re-auth runs as authenticated and must be
--     throttled by the same counters or step-up becomes an unthrottled
--     password oracle).
--   · hc.record_auth_attempt(text, text) → jsonb {failures} — outcomes
--     'failure' | 'success' | 'reset_completed'; anything else is ONE
--     refusal shape (auth_attempt_refused, DEF-10 posture).
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

select plan(33);

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

-- Run record_auth_attempt as anon n times for one key, in a DO block
-- (mutations in DO blocks; probes come separately).
create function pg_temp.record_n(p_ident text, p_outcome text, p_n int)
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  for i in 1..p_n loop
    perform hc.record_auth_attempt(p_ident, p_outcome);
  end loop;
  execute 'reset role';
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
-- 5–8 · Function surface: signatures, owner, EXECUTE set (catalog-based).
-- ----------------------------------------------------------------------------
select has_function('hc', 'auth_throttle', array['text'],
  'hc.auth_throttle(text) exists');
select has_function('hc', 'record_auth_attempt', array['text', 'text'],
  'hc.record_auth_attempt(text, text) exists');

select is(
  (select array_agg(r order by r) from unnest(array['anon', 'authenticated']) r
   where has_function_privilege(r, 'hc.auth_throttle(text)', 'execute')),
  array['anon', 'authenticated'],
  'auth_throttle: EXECUTE to anon and authenticated (sign-in AND step-up re-auth paths)');
select is(
  (select bool_or(has_function_privilege(r, 'hc.record_auth_attempt(text, text)', 'execute'))
   from unnest(array['hc_admin', 'hc_pipeline']) r),
  false,
  'record_auth_attempt: no EXECUTE for hc_admin or hc_pipeline');

-- ----------------------------------------------------------------------------
-- 9–10 · Empty history: advisory zero, never an error, callable as anon.
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
-- 11–16 · The progressive schedule, from live recording (one transaction ⇒
-- now() is fixed ⇒ the wait probe returns the FULL delay, deterministically).
-- ----------------------------------------------------------------------------
select pg_temp.record_n('sched@example.org', 'failure', 4);
set local role anon;
select is(hc.auth_throttle('sched@example.org'),
  jsonb_build_object('failures', 4, 'wait_seconds', 0),
  'failures 1–4: no delay — a mistyped password is not an incident');
reset role;

select pg_temp.record_n('sched@example.org', 'failure', 1);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 30,
  'failure 5: 30 s');
reset role;

select pg_temp.record_n('sched@example.org', 'failure', 3);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 120,
  'failure 8: 120 s');
reset role;

select pg_temp.record_n('sched@example.org', 'failure', 2);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 900,
  'failure 10: 900 s — the 15-minute box');
reset role;

select pg_temp.record_n('sched@example.org', 'failure', 30);
set local role anon;
select is((hc.auth_throttle('sched@example.org')->>'wait_seconds')::int, 900,
  'failure 40: STILL 900 s — the cap never escalates past 15 minutes (AC-AUTH-12)');
select is((hc.auth_throttle('sched@example.org')->>'failures')::int, 40,
  'the count keeps counting (the suspicious-attempt threshold reads it) while the wait stays boxed');
reset role;

-- ----------------------------------------------------------------------------
-- 17–19 · The wait decays from the LATEST failure; the window is trailing.
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
-- 20–23 · Success-class events clear the counter (the AC-AUTH-12 exit).
-- ----------------------------------------------------------------------------
select pg_temp.record_n('cleared@example.org', 'failure', 6);
select pg_temp.record_n('cleared@example.org', 'success', 1);
set local role anon;
select is(hc.auth_throttle('cleared@example.org'),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'a success clears the failure state — only the password holder can mint one');
reset role;

select pg_temp.record_n('cleared@example.org', 'failure', 5);
set local role anon;
select is((hc.auth_throttle('cleared@example.org')->>'wait_seconds')::int, 30,
  'failures after a success count fresh from zero');
reset role;

select pg_temp.record_n('reset@example.org', 'failure', 12);
select pg_temp.record_n('reset@example.org', 'reset_completed', 1);
set local role anon;
select is(hc.auth_throttle('reset@example.org'),
  jsonb_build_object('failures', 0, 'wait_seconds', 0),
  'a completed email reset clears the state — the §5.6 recovery path, never blocked, always an exit');
reset role;

do $$
declare v jsonb;
begin
  execute 'set local role anon';
  v := hc.record_auth_attempt('counted@example.org', 'failure');
  execute 'reset role';
  perform set_config('t.counted', v->>'failures', true);
end $$;
select is(current_setting('t.counted')::int, 1,
  'record_auth_attempt returns the running failure count for the caller''s threshold logic');

-- ----------------------------------------------------------------------------
-- 24–26 · Existence-blind and canonical: the answer never depends on whether
-- an account exists, and spelling variants share one budget (hc.contact_key).
-- ----------------------------------------------------------------------------
do $$
declare u uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Real');
  perform set_config('t.real_email', u || '@fixture.local', true);
end $$;

select pg_temp.record_n(current_setting('t.real_email'), 'failure', 5);
select pg_temp.record_n('ghost-no-account@example.org', 'failure', 5);
set local role anon;
select is(hc.auth_throttle(current_setting('t.real_email')),
          hc.auth_throttle('ghost-no-account@example.org'),
  'identical histories → byte-identical answers, account or no account (§5.5 never enumerate)');
reset role;

select pg_temp.record_n('Case@Example.org', 'failure', 3);
select pg_temp.record_n('  case@example.org  ', 'failure', 2);
set local role anon;
select is((hc.auth_throttle('CASE@EXAMPLE.ORG')->>'failures')::int, 5,
  'case and whitespace variants share ONE budget (hc.contact_key, the FRZ-07 precedent)');
reset role;

select is(
  (select count(distinct attempt_key)::int from public.auth_attempts
   where attempt_key = hc.contact_key('Case@Example.org')),
  1, 'the stored key is canonical — no per-spelling rows');

-- ----------------------------------------------------------------------------
-- 27–29 · Refusals: ONE shape, and nothing written by a refused call.
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ select hc.record_auth_attempt('x@example.org', 'lockout') $$,
  'P0001', 'auth_attempt_refused',
  'unknown outcome: one refusal shape (there is no lockout outcome, by design)');
select throws_ok(
  $$ select hc.record_auth_attempt('   ', 'failure') $$,
  'P0001', 'auth_attempt_refused',
  'blank identifier refused — no anonymous global bucket exists');
select is((select count(*)::int from public.auth_attempts
           where outcome not in ('failure', 'success', 'reset_completed')), 0,
  'no refused outcome ever reached the table');

-- ----------------------------------------------------------------------------
-- 30–31 · AC-AUTH-12 as a property: an adversarial 200-attempt history spread
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
-- 32–33 · Hygiene: both definers owned by hc_internal with a pinned
-- search_path, and same-key rows older than 24 h are pruned on write.
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   join pg_roles r on r.oid = p.proowner
   where n.nspname = 'hc'
     and p.proname in ('auth_throttle', 'record_auth_attempt')
     and r.rolname = 'hc_internal'
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  2, 'both functions: hc_internal-owned SECURITY DEFINER with search_path pinned');

do $$
begin
  insert into public.auth_attempts (attempt_key, outcome, attempted_at)
  values (hc.contact_key('stale@example.org'), 'failure', now() - interval '25 hours');
end $$;
select pg_temp.record_n('stale@example.org', 'failure', 1);
select is(
  (select count(*)::int from public.auth_attempts
   where attempt_key = hc.contact_key('stale@example.org')
     and attempted_at < now() - interval '24 hours'),
  0, 'rows older than 24 h for the key are pruned on the next write — the ledger is a window, not an archive');

select * from finish();
rollback;
