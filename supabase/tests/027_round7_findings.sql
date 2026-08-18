-- ============================================================================
-- 1C · Round-7 findings (ADR-0008): the disposition fixes, red→green.
--
--   B1 · The CAS enforces the transition GRAPH, not just the fence: every
--        advance must be a (lease-stage, from, to) row of
--        hc.arrival_transitions — a closed, seeded, append-by-migration
--        allowlist. A worker holding a valid store lease can no longer
--        request received → proposals_ready. Violations return
--        invalid_state (§4.2's defect signal: ack, raise, never retry).
--   B3 · The outbox handoff contract is CLAIM/ACK at-least-once, not
--        "exactly-once": hc.outbox_drain claims (drained_at) with a 300 s
--        reclaim window; hc.outbox_ack closes delivery; an unacked claim is
--        re-delivered, an acked row never is. The sweeper stays the
--        backstop (026:10 unchanged).
--   F5 · Intake idempotency checks request IDENTITY: a key replay returns
--        the prior id ONLY when subject/channel/parent/message-id/sender
--        agree (sender case-blind); disagreement raises
--        idempotency_conflict and writes nothing.
--   D4 · Oracle bound confirmed: an unauthorized caller cancelling a
--        CANCELLED arrival gets cancel_refused — the state diagnosis is
--        post-authorization only.
--   D5 · Budget confirmation: duplicate queue deliveries cannot burn gate
--        attempts while a lease is live (stale_lease consumes nothing).
--   D7 · The availability cliff pinned as a fact for the ADR-0008
--        analysis: manage on 4 of 5 domains sees ZERO arrival rows.
--
-- RED: 1–8 report has_table false / 42P01 / 'advanced' where invalid_state
-- is expected; 11, 13–18 report 42883 / re-delivery absent; 21–25 report
-- no_error where idempotency_conflict is expected.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(32);

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

create function pg_temp.scalar_as(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.msg_as(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := message_text;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
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

create function pg_temp.mk_lease(p_arrival uuid, p_circle uuid, p_stage text,
                                 p_attempt int, p_deadline timestamptz)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.pipeline_leases (id, arrival_id, circle_id, stage, attempt_no, deadline)
  values (v, p_arrival, p_circle, p_stage, p_attempt, p_deadline);
  update public.arrivals set current_lease_id = v where id = p_arrival;
  return v;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());  -- coordinator, manage×5
  u5 uuid := pg_temp.mk_user(gen_random_uuid());  -- member, manage on 4 of 5
  u6 uuid := pg_temp.mk_user(gen_random_uuid());  -- authenticated NON-member
  c1 uuid; s1 uuid; s1b uuid; m1 uuid; m5 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; ag uuid; p1 uuid;
  d hc.domain;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u5, 'member', 'Priya'), (u6, 'member', 'Vic');
  insert into public.circles (name, created_by) values ('Round7', u1) returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'r7-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Walter', 'recovering', '02138', 'America/New_York', 'clay',
          'r7b-' || substr(c1::text, 1, 8)) returning id into s1b;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u5, 'family', 'Priya') returning id into m5;
  foreach d in array enum_range(null::hc.domain) loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d, 'manage', u1);
    if d <> 'finances' then   -- the 4-of-5 cliff member
      insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
      values (c1, m5, s1, d, 'manage', u1);
    end if;
  end loop;

  -- graph-test arrivals (a1..a6), each with its own key
  a1 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-1');
  a2 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-2');
  a3 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-3');
  update public.arrivals set state = 'stored' where id = a3;
  a4 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-4');
  update public.arrivals set state = 'store_failed' where id = a4;
  a5 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-5');
  update public.arrivals set state = 'scanned' where id = a5;
  a6 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-6');

  -- D4 oracle target: a cancelled arrival
  a7 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-7');
  update public.arrivals set state = 'cancelled', cancelled_at = now() where id = a7;

  -- D5 gate target
  ag := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'g-8');
  update public.arrivals set state = 'scanned' where id = ag;

  -- intake-identity fixture: the canonical original + a possible parent
  p1 := hc.create_arrival(c1, s1, 'email', p_ingest_idempotency_key => 'idem-p');
  perform hc.create_arrival(c1, s1, 'email',
            p_sender_address => 'Dr@Clinic.example',
            p_message_id => 'mid-1',
            p_auth_result => 'authenticated',
            p_ingest_idempotency_key => 'idem-1');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u5', u5::text, true);
  perform set_config('t.u6', u6::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s1b', s1b::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.a2', a2::text, true);
  perform set_config('t.a3', a3::text, true);
  perform set_config('t.a4', a4::text, true);
  perform set_config('t.a5', a5::text, true);
  perform set_config('t.a6', a6::text, true);
  perform set_config('t.a7', a7::text, true);
  perform set_config('t.ag', ag::text, true);
  perform set_config('t.p1', p1::text, true);
exception when others then
  perform set_config('t.u1', gen_random_uuid()::text, true);
  perform set_config('t.u5', gen_random_uuid()::text, true);
  perform set_config('t.u6', gen_random_uuid()::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.s1', gen_random_uuid()::text, true);
  perform set_config('t.s1b', gen_random_uuid()::text, true);
  perform set_config('t.a1', gen_random_uuid()::text, true);
  perform set_config('t.a2', gen_random_uuid()::text, true);
  perform set_config('t.a3', gen_random_uuid()::text, true);
  perform set_config('t.a4', gen_random_uuid()::text, true);
  perform set_config('t.a5', gen_random_uuid()::text, true);
  perform set_config('t.a6', gen_random_uuid()::text, true);
  perform set_config('t.a7', gen_random_uuid()::text, true);
  perform set_config('t.ag', gen_random_uuid()::text, true);
  perform set_config('t.p1', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The authoritative allowlist exists and is EXACTLY the §4.3 graph.
-- ----------------------------------------------------------------------------
select has_table('hc', 'arrival_transitions',
  'hc.arrival_transitions exists — the closed CAS allowlist (round-7 B1)');

-- ordered by stage, then ENUM ordinal (collation-independent)
select is(pg_temp.scalar($$
  select string_agg(t.stage || ':' || t.from_state || '>' || t.to_state, ','
                    order by t.stage, t.from_state, t.to_state)
  from hc.arrival_transitions t $$),
  'extract:extracting>extract_timeout,extract:extracting>extract_failed,'
  || 'extract:extracting>extracted,extract:extracting>needs_password,'
  || 'extract:extracting>unsupported_type,'
  || 'gate:scanned>extracting,gate:scanned>held_unknown_sender,'
  || 'gate:held_unknown_sender>extracting,'   -- 2A M6: the SND-02 release edge
  || 'interpret:interpreting>proposals_ready,'
  || 'scan:stored>quarantined,scan:stored>scan_unavailable,'
  || 'scan:stored>scan_inconclusive,scan:stored>scanned,'
  || 'store:received>store_failed,store:received>stored',
  'the seeded allowlist is exactly the §4.3 stage-exit graph — closed; §4.7 duplicate rows append with their machinery');

-- ----------------------------------------------------------------------------
-- 3–7 · Graph violations: each holds a VALID current lease, so pre-fix the
-- fence alone let every one of these through as 'advanced'.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'store', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'received', 'proposals_ready', (select id from l))::text $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.a1'))),
  'invalid_state',
  'B1: a valid store lease cannot request received → proposals_ready (the reviewer''s exact scenario)');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'store', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'received', 'scanned', (select id from l))::text $$,
  current_setting('t.a2'), current_setting('t.c1'), current_setting('t.a2'))),
  'invalid_state',
  'B1: a SKIPPED stage (received → scanned) is refused');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'scan', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'stored', 'received', (select id from l))::text $$,
  current_setting('t.a3'), current_setting('t.c1'), current_setting('t.a3'))),
  'invalid_state',
  'B1: a BACKWARD transition (stored → received) is refused');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'store', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'store_failed', 'stored', (select id from l))::text $$,
  current_setting('t.a4'), current_setting('t.c1'), current_setting('t.a4'))),
  'invalid_state',
  'B1: a TERMINAL state cannot be revived (store_failed → stored refused)');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'store', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'scanned', 'extracting', (select id from l))::text $$,
  current_setting('t.a5'), current_setting('t.c1'), current_setting('t.a5'))),
  'invalid_state',
  'B1: a WRONG-STAGE lease authorizes nothing — scanned → extracting needs a gate lease, not a store lease');

-- ----------------------------------------------------------------------------
-- 8 · Refusals mutate nothing: states unchanged, no transition events.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select (select string_agg(a.state::text, ',' order by a.ingest_idempotency_key)
             from public.arrivals a
             where a.id in (%L, %L, %L, %L, %L)) || '|' ||
            (select count(*)
             from public.arrival_events e
             where e.arrival_id in (%L, %L, %L, %L, %L)
               and e.from_state is not null)::text $$,
  current_setting('t.a1'), current_setting('t.a2'), current_setting('t.a3'),
  current_setting('t.a4'), current_setting('t.a5'),
  current_setting('t.a1'), current_setting('t.a2'), current_setting('t.a3'),
  current_setting('t.a4'), current_setting('t.a5'))),
  'received,received,stored,store_failed,scanned|0',
  'B1: every graph refusal left the state untouched and wrote NO event');

-- ----------------------------------------------------------------------------
-- 9–10 · Controls: legal stage-bound transitions still advance.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'store', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'received', 'stored', (select id from l))::text $$,
  current_setting('t.a6'), current_setting('t.c1'), current_setting('t.a6'))),
  'advanced',
  'control: the store lease still advances received → stored');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'scan', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'stored', 'scanned', (select id from l))::text $$,
  current_setting('t.a6'), current_setting('t.c1'), current_setting('t.a6'))),
  'advanced',
  'control: the scan lease still advances stored → scanned');

-- ----------------------------------------------------------------------------
-- 11–18 · The outbox contract: claim/ack at-least-once (round-7 B3).
-- ----------------------------------------------------------------------------
select has_function('hc', 'outbox_ack', array['uuid[]'],
  'hc.outbox_ack exists — delivery has an acknowledgment');

do $$
declare o1 uuid; o3 uuid;
begin
  insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
  values (current_setting('t.c1')::uuid, current_setting('t.a6')::uuid,
          'freeze_dismissed_requeue')
  returning id into o1;
  insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
  values (current_setting('t.c1')::uuid, current_setting('t.a5')::uuid,
          'sweeper_requeue')
  returning id into o3;
  perform set_config('t.o1', o1::text, true);
  perform set_config('t.o3', o3::text, true);
exception when others then
  perform set_config('t.o1', gen_random_uuid()::text, true);
  perform set_config('t.o3', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select count(*)::text from hc.outbox_drain(10) d
     where d.outbox_id in (%L, %L) $$,
  current_setting('t.o1'), current_setting('t.o3'))),
  '2',
  'control: the drain claims both undrained rows');

do $$
begin
  update public.pipeline_outbox set drained_at = now() - interval '10 minutes'
   where id = current_setting('t.o1')::uuid;
end $$;

select is(pg_temp.scalar(format(
  $$ select count(*)::text from hc.outbox_drain(10) d where d.outbox_id = %L $$,
  current_setting('t.o1'))),
  '1',
  'B3: an UNACKED claim past the 300 s window is RE-DELIVERED — a relay crash after drain cannot lose the row');

select is(pg_temp.scalar(format(
  $$ select hc.outbox_ack(array[%L::uuid])::text $$, current_setting('t.o1'))),
  '1',
  'B3: hc.outbox_ack closes the delivery (returns the acked count)');

do $$
begin
  update public.pipeline_outbox set drained_at = now() - interval '10 minutes'
   where id = current_setting('t.o1')::uuid;
end $$;

select is(pg_temp.scalar(format(
  $$ select count(*)::text from hc.outbox_drain(10) d where d.outbox_id = %L $$,
  current_setting('t.o1'))),
  '0',
  'B3: an ACKED row is never re-delivered');

select is(pg_temp.scalar(format(
  $$ select hc.outbox_ack(array[%L::uuid])::text $$, current_setting('t.o1'))),
  '0',
  'B3: a double ack is idempotent (0 rows the second time)');

do $$
declare o4 uuid; v int;
begin
  insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
  values (current_setting('t.c1')::uuid, current_setting('t.a6')::uuid,
          'sweeper_requeue')
  returning id into o4;
  perform set_config('t.o4', o4::text, true);
  begin
    v := hc.outbox_ack(array[o4]);
    perform set_config('t.ack4', v::text, true);
  exception when others then
    perform set_config('t.ack4', 'ERROR:' || sqlstate, true);
  end;
exception when others then
  perform set_config('t.o4', gen_random_uuid()::text, true);
  perform set_config('t.ack4', 'ERROR:' || sqlstate, true);
end $$;

select is(current_setting('t.ack4') || ':' ||
  pg_temp.scalar(format(
  $$ select count(*)::text from hc.outbox_drain(10) d where d.outbox_id = %L $$,
  current_setting('t.o4'))),
  '0:1',
  'B3: ack binds to a CLAIM — a never-drained row acks 0 and is still delivered by the next drain');

select is(pg_temp.scalar($$
  select (has_function_privilege('hc_pipeline', 'hc.outbox_ack(uuid[])', 'execute')
      and not has_function_privilege('authenticated', 'hc.outbox_ack(uuid[])', 'execute')
      and not has_function_privilege('hc_admin', 'hc.outbox_ack(uuid[])', 'execute'))::text $$),
  'true',
  'B3: outbox_ack is an hc_pipeline entry point only (catalog-asserted, PLT-04)');

-- ----------------------------------------------------------------------------
-- 19–26 · Intake identity (round-7 F5): the key replays ONLY for the same
-- request.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select (hc.create_arrival(%L, %L, 'email',
               p_sender_address => 'Dr@Clinic.example',
               p_message_id => 'mid-1',
               p_auth_result => 'authenticated',
               p_ingest_idempotency_key => 'idem-1')
             = (select id from public.arrivals
                where circle_id = %L and ingest_idempotency_key = 'idem-1'))::text $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.c1'))),
  'true',
  'an IDENTICAL replay returns the prior id (idempotency kept)');

select is(pg_temp.scalar(format(
  $$ select (hc.create_arrival(%L, %L, 'email',
               p_sender_address => 'dr@clinic.EXAMPLE',
               p_message_id => 'mid-1',
               p_auth_result => 'authenticated',
               p_ingest_idempotency_key => 'idem-1')
             = (select id from public.arrivals
                where circle_id = %L and ingest_idempotency_key = 'idem-1'))::text $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.c1'))),
  'true',
  'sender comparison is case-blind — a case-variant address is the SAME request');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_sender_address => 'Dr@Clinic.example',
       p_message_id => 'mid-OTHER',
       p_auth_result => 'authenticated',
       p_ingest_idempotency_key => 'idem-1') $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'idempotency_conflict',
  'F5: the same key with a DIFFERENT message id is a conflict, not a silent alias');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_sender_address => 'Dr@Clinic.example',
       p_message_id => 'mid-1',
       p_auth_result => 'authenticated',
       p_ingest_idempotency_key => 'idem-1') $$,
  current_setting('t.c1'), current_setting('t.s1b'))),
  'idempotency_conflict',
  'F5: the same key with a DIFFERENT subject is a conflict');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'upload',
       p_sender_address => 'Dr@Clinic.example',
       p_message_id => 'mid-1',
       p_auth_result => 'authenticated',
       p_ingest_idempotency_key => 'idem-1') $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'idempotency_conflict',
  'F5: the same key with a DIFFERENT channel is a conflict');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_parent_arrival_id => %L,
       p_sender_address => 'Dr@Clinic.example',
       p_message_id => 'mid-1',
       p_auth_result => 'authenticated',
       p_ingest_idempotency_key => 'idem-1') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.p1'))),
  'idempotency_conflict',
  'F5: the same key with a DIFFERENT parent is a conflict');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_sender_address => 'other@elsewhere.example',
       p_message_id => 'mid-1',
       p_auth_result => 'authenticated',
       p_ingest_idempotency_key => 'idem-1') $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'idempotency_conflict',
  'F5: the same key with a DIFFERENT sender is a conflict');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrivals
     where circle_id = %L and ingest_idempotency_key = 'idem-1' $$,
  current_setting('t.c1'))),
  '1',
  'F5: every conflict wrote NOTHING — one arrival survives under the key');

-- ----------------------------------------------------------------------------
-- 27–29 · D4 oracle bound (confirmation): the cancelled diagnosis is
-- post-authorization; an outsider cannot read existence from it.
-- ----------------------------------------------------------------------------
select is(pg_temp.msg_as(current_setting('t.u6')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, current_setting('t.a7'))),
  'cancel_refused',
  'D4: a NON-member cancelling a cancelled arrival gets cancel_refused — no existence oracle');

select is(pg_temp.msg_as(current_setting('t.u6')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, gen_random_uuid())),
  'cancel_refused',
  'D4: nonexistent and unauthorized are ONE shape (DEF-10)');

select is(pg_temp.msg_as(current_setting('t.u1')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, current_setting('t.a7'))),
  'cancel_invalid_state',
  'D4: only an AUTHORIZED member reaches the state diagnosis');

-- ----------------------------------------------------------------------------
-- 30 · D5 budget confirmation: duplicate deliveries cannot burn the gate.
-- ----------------------------------------------------------------------------
do $$
declare r1 text; r2 text; r3 text; r4 text;
begin
  select result::text into r1 from hc.claim_stage(current_setting('t.ag')::uuid, 'gate');
  select result::text into r2 from hc.claim_stage(current_setting('t.ag')::uuid, 'gate');
  select result::text into r3 from hc.claim_stage(current_setting('t.ag')::uuid, 'gate');
  select result::text into r4 from hc.claim_stage(current_setting('t.ag')::uuid, 'gate');
  perform set_config('t.gate', r1 || ':' || r2 || ':' || r3 || ':' || r4, true);
exception when others then
  perform set_config('t.gate', 'ERROR:' || sqlstate, true);
end $$;

select is(current_setting('t.gate') || '|' ||
  pg_temp.scalar(format(
  $$ select count(*)::text from public.pipeline_leases
     where arrival_id = %L and stage = 'gate' $$, current_setting('t.ag'))),
  'claimed:stale_lease:stale_lease:stale_lease|1',
  'D5: rapid duplicate deliveries burn NOTHING while the gate lease is live — one lease, one attempt');

-- ----------------------------------------------------------------------------
-- 31–32 · D7 availability cliff, pinned for the ADR-0008 analysis.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar_as(current_setting('t.u5')::uuid, format(
  $$ select count(*)::text from public.arrivals where circle_id = %L $$,
  current_setting('t.c1'))),
  '0',
  'D7: manage on 4 of 5 domains sees ZERO arrival rows — the availability cliff is a pinned fact');

select is(pg_temp.scalar_as(current_setting('t.u1')::uuid, format(
  $$ select (count(*) > 0)::text from public.arrivals where circle_id = %L $$,
  current_setting('t.c1'))),
  'true',
  'D7: the full-grant coordinator sees the pipeline — diagnosis capability exists at manage×5');

select * from finish();
rollback;
