-- ============================================================================
-- 1C · U4 — hc.claim_stage (TSD §4.3): the durable attempt counter.
--
-- The budget is claimed BEFORE the external work: expiry transfers
-- ownership; a live lease refuses a second claim; exhaustion is a terminal
-- state with a stated reason reached WITHOUT a provider call; a freeze
-- consumes NO retry budget (FRZ-15). The interpret stage's declared
-- in-flight transition (extracted → interpreting) happens at claim, so one
-- lease spans the stage and §4.3's entry/exit table holds (ADR-0007).
--
-- The commit-standalone property ("claim → COMMIT → work") is the WORKER's
-- calling pattern — proven in the two-session layer, not here.
--
-- RED (U4): every claim probe reports 42883 (undefined_function).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(24);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.errmsg(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return 'no_error';
exception when others then
  get stacked diagnostics v := message_text;
  return v;
end $$;

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

-- claim + force-expire the resulting lease (dead-worker simulation)
create function pg_temp.claim_and_expire(p_arrival uuid, p_stage text) returns text
language plpgsql as $$
declare r record;
begin
  select * into r from hc.claim_stage(p_arrival, p_stage);
  if r.result::text = 'claimed' then
    update public.pipeline_leases set deadline = now() - interval '1 second'
     where id = r.lease_id;
  end if;
  return r.result::text;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Claim one', u1) returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'cl1-' || substr(c1::text, 1, 8)) returning id into s1;
  a1 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'clm-1');
  a2 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'clm-2');
  a3 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'clm-3');
  a4 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'clm-4');
  a5 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'clm-5');
  update public.arrivals set state = 'stored'    where id = a2;  -- for scan budget
  update public.arrivals set state = 'extracted' where id = a3;  -- for interpret
  update public.arrivals set state = 'scanned'   where id = a4;  -- for gate flow
  update public.arrivals set state = 'stored'    where id = a5;  -- for freeze cases
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.a2', a2::text, true);
  perform set_config('t.a3', a3::text, true);
  perform set_config('t.a4', a4::text, true);
  perform set_config('t.a5', a5::text, true);
exception when others then
  perform set_config('t.u1', gen_random_uuid()::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.s1', gen_random_uuid()::text, true);
  perform set_config('t.a1', gen_random_uuid()::text, true);
  perform set_config('t.a2', gen_random_uuid()::text, true);
  perform set_config('t.a3', gen_random_uuid()::text, true);
  perform set_config('t.a4', gen_random_uuid()::text, true);
  perform set_config('t.a5', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · The happy claim: attempt 1, deadline from the stage budget, the
-- fence column moves, and the claimed lease advances.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select result::text || ':' || attempt_no::text || ':' ||
            (lease_id is not null)::text || ':' ||
            (deadline between now() + interval '4 minutes' and now() + interval '6 minutes')::text
     from hc.claim_stage(%L, 'store') $$,
  current_setting('t.a1'))),
  'claimed:1:true:true',
  'a fresh arrival claims store attempt 1 with the §4.3 wall clock');

select is(pg_temp.scalar(format(
  $$ select (a.current_lease_id = l.id)::text
     from public.arrivals a
     join public.pipeline_leases l on l.arrival_id = a.id and l.stage = 'store' and l.attempt_no = 1
     where a.id = %L $$,
  current_setting('t.a1'))),
  'true',
  'the claim moves current_lease_id — ownership is one equality');

select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(%L, 'store') $$,
  current_setting('t.a1'))),
  'stale_lease',
  'a second claim while attempt 1 is LIVE is refused — no supersession before expiry');

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'received', 'stored',
       (select current_lease_id from public.arrivals where id = %L))::text $$,
  current_setting('t.a1'), current_setting('t.a1'))),
  'advanced',
  'the claimed lease advances through the CAS — claim and fence speak the same id');

-- ----------------------------------------------------------------------------
-- 5 · Redelivery after the stage concluded: already_advanced, not a defect.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(%L, 'store') $$,
  current_setting('t.a1'))),
  'already_advanced',
  'a re-delivered message for a concluded stage acks out as already_advanced');

-- ----------------------------------------------------------------------------
-- 6–9 · Expiry transfers ownership; the superseded lease cannot publish.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select pg_temp.claim_and_expire(%L, 'scan') $$,
  current_setting('t.a2'))),
  'claimed',
  'scan attempt 1 claims, then dies past its deadline (simulated)');

select is(pg_temp.scalar(format(
  $$ select result::text || ':' || attempt_no::text from hc.claim_stage(%L, 'scan') $$,
  current_setting('t.a2'))),
  'claimed:2',
  'a claim past the deadline supersedes: attempt_no advances DURABLY');

select is(pg_temp.scalar(format(
  $$ select outcome from public.pipeline_leases
     where arrival_id = %L and stage = 'scan' and attempt_no = 1 $$,
  current_setting('t.a2'))),
  'expired',
  'the dead worker''s lease is marked expired — distinguishable from a slow one');

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned',
       (select id from public.pipeline_leases
        where arrival_id = %L and stage = 'scan' and attempt_no = 1))::text $$,
  current_setting('t.a2'), current_setting('t.a2'))),
  'stale_lease',
  'the superseded attempt cannot publish — ownership transferred at expiry (A.5 pgTAP half)');

-- ----------------------------------------------------------------------------
-- 10–13 · Budget exhaustion: terminal state, stated reason, no provider call,
-- and the counter that survives crashes.
-- ----------------------------------------------------------------------------
do $$
begin
  -- attempt 2's worker also dies (test 7 left it live)
  update public.pipeline_leases set deadline = now() - interval '1 second'
   where arrival_id = current_setting('t.a2')::uuid
     and stage = 'scan' and closed_at is null;
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select pg_temp.claim_and_expire(%L, 'scan') || ':' ||
            pg_temp.claim_and_expire(%L, 'scan') $$,
  current_setting('t.a2'), current_setting('t.a2'))),
  'claimed:claimed',
  'attempts 3 and 4 claim and die — four of four spent, every one durably recorded');

select is(pg_temp.scalar(format(
  $$ select result::text || ':' || attempt_no::text || ':' || (lease_id is null)::text
     from hc.claim_stage(%L, 'scan') $$,
  current_setting('t.a2'))),
  'exhausted:4:true',
  'the fifth claim is refused as exhausted — the caller never reaches the provider');

select is(pg_temp.scalar(format(
  $$ select a.state::text || ':' ||
            (select count(*) from public.pipeline_leases l
             where l.arrival_id = a.id and l.stage = 'scan')::text
     from public.arrivals a where a.id = %L $$,
  current_setting('t.a2'))),
  'scan_unavailable:4',
  'exhaustion is a TERMINAL state (scan_unavailable) and no fifth lease exists');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrival_events
     where arrival_id = %L and to_state = 'scan_unavailable'
       and reason_code = 'scan_budget_exhausted' and attempt = 4 $$,
  current_setting('t.a2'))),
  '1',
  'the terminal move carries its stated, enumerated reason (§4.11)');

-- ----------------------------------------------------------------------------
-- 14 · Post-exhaustion redelivery acks out.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(%L, 'scan') $$,
  current_setting('t.a2'))),
  'already_advanced',
  'a message re-delivered after exhaustion acks out as already_advanced');

-- ----------------------------------------------------------------------------
-- 15–17 · The interpret stage's claim-time transition, and reclaim after a
-- mid-flight death.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(%L, 'interpret') $$,
  current_setting('t.a3'))) || ':' ||
  pg_temp.scalar(format(
  $$ select state::text from public.arrivals where id = %L $$,
  current_setting('t.a3'))),
  'claimed:interpreting',
  'claiming interpret moves extracted → interpreting AT claim (§4.3 entry/exit holds, one lease spans the stage)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrival_events
     where arrival_id = %L and from_state = 'extracted' and to_state = 'interpreting'
       and attempt = 1 $$,
  current_setting('t.a3'))),
  '1',
  'the in-flight transition is evented like any other');

do $$
begin
  -- the interpret-1 worker dies mid-flight: state stays interpreting
  update public.pipeline_leases set deadline = now() - interval '1 second'
   where arrival_id = current_setting('t.a3')::uuid
     and stage = 'interpret' and attempt_no = 1;
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select result::text || ':' || attempt_no::text || ':' ||
            (select count(*) from public.arrival_events
             where arrival_id = %L and to_state = 'interpreting')::text
     from hc.claim_stage(%L, 'interpret') $$,
  current_setting('t.a3'), current_setting('t.a3'))),
  'claimed:2:1',
  'a worker dying mid-interpret leaves state=interpreting; attempt 2 reclaims WITHOUT a duplicate transition event');

-- ----------------------------------------------------------------------------
-- 18–20 · FRZ-15: a freeze consumes NO retry budget; store still claims.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(%L, 'scan') $$,
  current_setting('t.a5'))),
  'frozen',
  'a claim on a parked arrival returns frozen — the worker acks and exits');

select is(pg_temp.scalar(format(
  $$ with r1 as (select * from hc.claim_stage(%L, 'scan')),
          r2 as (select * from hc.claim_stage(%L, 'scan'))
     select (select count(*) from public.pipeline_leases
             where arrival_id = %L and stage = 'scan')::text $$,
  current_setting('t.a5'), current_setting('t.a5'), current_setting('t.a5'))),
  '0',
  'repeated claims under the freeze consume NOTHING — time parked is not time spent failing (FRZ-15)');

select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(
       hc.create_arrival(%L, %L, 'upload', p_ingest_idempotency_key => 'clm-frz-store'),
       'store') $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'claimed',
  'the store stage still claims under a freeze — mail is accepted and stored (PRD §7.5)');

do $$
begin
  perform hc.adjudicate_freeze(f.id, 'dismissed', 'Adjudicator R.',
                               p_outcome_note => 'no basis')
  from public.freezes f
  where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open';
exception when others then null;
end $$;

-- ----------------------------------------------------------------------------
-- 21–24 · Gate integration, cancelled, unknown stage, closure.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ with c as (select * from hc.claim_stage(%L, 'gate'))
     select (select result::text from c) || ':' ||
            hc.advance_arrival(%L, 'scanned', 'extracting',
                               (select lease_id from c), 'sender_recognised')::text $$,
  current_setting('t.a4'), current_setting('t.a4'))),
  'claimed:advanced',
  'the gate claims and advances scanned → extracting with its enumerated reason');

do $$
begin
  update public.arrivals set state = 'cancelled', cancelled_at = now()
   where id = current_setting('t.a4')::uuid;
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select result::text from hc.claim_stage(%L, 'extract') $$,
  current_setting('t.a4'))),
  'cancelled',
  'a cancelled arrival cannot be claimed — the worker discards and acks (§4.5)');

select is(pg_temp.errmsg(format(
  $$ select * from hc.claim_stage(%L, 'render') $$,
  current_setting('t.a1'))),
  'stage_unknown',
  'an unknown stage name is a worker defect, refused by name');

select is(pg_temp.scalar($$
  select (has_function_privilege('hc_pipeline', 'hc.claim_stage(uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'hc.claim_stage(uuid, text)', 'execute')
      and not has_function_privilege('hc_admin', 'hc.claim_stage(uuid, text)', 'execute'))::text $$),
  'true',
  'claim_stage is hc_pipeline''s entry point and nobody else''s (catalog-asserted, PLT-04)');

select * from finish();
rollback;
