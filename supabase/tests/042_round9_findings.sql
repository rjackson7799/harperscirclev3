-- ============================================================================
-- 2A · M8 — round-9 finding 3: "this wasn't me" consumption is atomic with a
-- DURABLE security action (docs/review/round-9-findings.md; ADR-0013).
--
-- The contract these tests pin:
--   · public.security_actions — the owed-work queue. Consuming a §5.11
--     token and enqueueing the account-security action happen in ONE
--     transaction inside hc.execute_wasnt_me: "token consumed" now
--     STRUCTURALLY implies "global sign-out + forced reset is owed and
--     recorded". The 2B app performs the GoTrue admin kill immediately
--     after commit and marks completion; a crash between the two leaves a
--     pending row a privileged worker retries — never a consumed token
--     with live sessions.
--   · UNIQUE(event_id): exactly-once enqueue per security event; replays
--     abort before reaching the insert (the conditional UPDATE), and the
--     unique key makes the invariant structural, not behavioural.
--   · action is a closed enum-by-check ('global_signout_force_reset');
--     completion is retry-safe: completing twice reports {completed:false}
--     the second time and never errors — workers may crash and re-run.
--   · Zero request-path privileges on the table; the worker surface is
--     hc.pending_security_actions() / hc.complete_security_action(uuid),
--     EXECUTE to hc_pipeline ONLY (the outbox drain posture).
--
-- Privilege-closure asserts are catalog-based (has_function_privilege) —
-- ACL-denied function CALLS segfault this image (PLT-04); reds never dial
-- the crash. Fixture mutations in DO blocks, probes in separate statements.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(22);

-- ----------------------------------------------------------------------------
-- Helpers (house pattern, self-contained per file)
-- ----------------------------------------------------------------------------
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

create function pg_temp.call_as(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · Shape and boundary: the queue exists, RLS forced, zero request reach,
-- exactly-once per event structural.
-- ----------------------------------------------------------------------------
select has_table('public', 'security_actions', 'security_actions exists');

select is(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'security_actions'),
  true, 'security_actions: RLS enabled AND forced');

select is(pg_temp.errcode_as('anon', 'select * from public.security_actions'),
  '42501', 'anon cannot read security_actions');
select is(pg_temp.errcode_as('authenticated', 'select * from public.security_actions'),
  '42501', 'authenticated cannot read security_actions — owed security work is not a user surface');
select is(pg_temp.errcode_as('hc_pipeline', 'select * from public.security_actions'),
  '42501', 'hc_pipeline reaches the queue only through the two definers, never the table');

select col_is_unique('public', 'security_actions', 'event_id',
  'UNIQUE(event_id): exactly-once enqueue per security event, structurally');

-- ----------------------------------------------------------------------------
-- 7–10 · Worker surface: the two definers, hc_pipeline-only EXECUTE.
-- ----------------------------------------------------------------------------
select has_function('hc', 'pending_security_actions', array[]::name[],
  'hc.pending_security_actions() exists');
select has_function('hc', 'complete_security_action', array['uuid'],
  'hc.complete_security_action(uuid) exists');

select is(
  (select array_agg(r order by r)
   from unnest(array['anon', 'authenticated', 'hc_admin', 'hc_pipeline']) r
   where has_function_privilege(r, 'hc.pending_security_actions()', 'execute')
      or has_function_privilege(r, 'hc.complete_security_action(uuid)', 'execute')),
  array['hc_pipeline'],
  'the worker surface: EXECUTE to hc_pipeline ONLY (drain posture; request paths never see owed work)');

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   join pg_roles r on r.oid = p.proowner
   where n.nspname = 'hc'
     and p.proname in ('pending_security_actions', 'complete_security_action')
     and r.rolname = 'hc_internal'
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  2, 'both worker definers: hc_internal-owned SECURITY DEFINER with search_path pinned');

-- ----------------------------------------------------------------------------
-- Fixture: an account with a live suspicious_signin event whose plaintext
-- token we hold (direct insert as postgres — 039 owns the mint path).
-- ----------------------------------------------------------------------------
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated',
          'authenticated', u || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Holder');
  perform set_config('t.u', u::text, true);
  perform set_config('t.token', encode(extensions.gen_random_bytes(32), 'hex'), true);
  insert into public.security_events
    (account_id, kind, token_hash, token_expires_at)
  values (u, 'suspicious_signin',
          extensions.digest(current_setting('t.token'), 'sha256'),
          now() + interval '15 minutes');
  perform set_config('t.event',
    (select e.id::text from public.security_events e where e.account_id = u), true);
end $$;

-- ----------------------------------------------------------------------------
-- 11–15 · Consume ⇒ enqueue, atomically, exactly once; replays add nothing.
-- ----------------------------------------------------------------------------
do $$
declare v jsonb;
begin
  execute 'set local role anon';
  v := hc.execute_wasnt_me(current_setting('t.token'));
  execute 'reset role';
  perform set_config('t.res', v::text, true);
end $$;

select is(current_setting('t.res')::jsonb ->> 'account_id',
  current_setting('t.u'),
  'execute_wasnt_me still returns the account for the app''s immediate kill attempt');

select is(
  (select count(*)::int from public.security_actions a
   where a.event_id = current_setting('t.event')::uuid
     and a.account_id = current_setting('t.u')::uuid
     and a.action = 'global_signout_force_reset'
     and a.completed_at is null),
  1, 'the SAME call durably enqueued the owed action — consumed-with-nothing-owed is unrepresentable');

select is(
  (current_setting('t.res')::jsonb ->> 'action_id')::uuid,
  (select a.id from public.security_actions a
   where a.event_id = current_setting('t.event')::uuid),
  'the caller learns the action id — the app completes it right after its own kill attempt');

select is(pg_temp.call_as('anon', format(
  $$ select hc.execute_wasnt_me(%L)::text $$, current_setting('t.token'))),
  'ERROR:P0001:wasnt_me_refused',
  'replay refused — the conditional UPDATE, unchanged');

select is(
  (select count(*)::int from public.security_actions
   where event_id = current_setting('t.event')::uuid),
  1, 'a refused replay enqueued NOTHING — still exactly one owed action for the event');

-- ----------------------------------------------------------------------------
-- 16–20 · The worker leg: pending lists it, completion is retry-safe.
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('t.action',
    (select a.id::text from public.security_actions a
     where a.event_id = current_setting('t.event')::uuid), true);
end $$;

select is(pg_temp.call_as('hc_pipeline',
  $$ select count(*)::text from hc.pending_security_actions() $$),
  '1', 'the worker sees exactly the pending action');

select is(pg_temp.call_as('hc_pipeline', format(
  $$ select (hc.complete_security_action(%L)) ->> 'completed' $$,
  current_setting('t.action'))),
  'true', 'completion records the performed kill');

select is(
  (select (a.completed_at is not null) from public.security_actions a
   where a.id = current_setting('t.action')::uuid),
  true, 'completed_at is set');

select is(pg_temp.call_as('hc_pipeline', format(
  $$ select (hc.complete_security_action(%L)) ->> 'completed' $$,
  current_setting('t.action'))),
  'false', 'completing again reports false and never errors — worker retries are safe');

select is(pg_temp.call_as('hc_pipeline',
  $$ select count(*)::text from hc.pending_security_actions() $$),
  '0', 'nothing pending after completion');

-- ----------------------------------------------------------------------------
-- 21–22 · Refusal edges: unknown action id; refused tokens enqueue nothing.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as('hc_pipeline', format(
  $$ select hc.complete_security_action(%L)::text $$, gen_random_uuid())),
  'ERROR:P0001:security_action_refused',
  'an unknown action id refuses in one shape — a defect signal, not a silent no-op');

select is(
  (select count(*)::int from public.security_actions), 1,
  'refused execute calls (replay, garbage) never created an action row');

select * from finish();
rollback;
