-- ============================================================================
-- 1C · U2 — the transition primitive (TSD §4.2) and intake (§4.1, ADR-0006 P5).
--
-- hc.advance_result is the §4.2 six-value enum VERBATIM at this boundary
-- (claim vocabulary lands in U3/U4 via the first ALTER TYPE … ADD VALUE).
-- hc.advance_arrival: fence first, enumerated outcomes, unconditional event
-- insert bound to the same row lock — the A.5 rows "advance_arrival returned
-- an undiagnosable false" and "silently skipping its event row" live here.
-- hc.create_arrival: channel-blind intake with the P5 size/shape caps.
-- hc.sender_recognised: the gate's question; display names never matched.
--
-- RED (U2): hc.advance_result absent (42704 / has_type fails); every
-- function call reports 42883 (undefined_function) where an enumerated
-- result or P0001 signature is expected.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(36);

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

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

-- Message-or-code probe: P0001 signatures are named messages (DEF-10 style).
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

-- Open a lease and make it the arrival's current one (fixture-level claim;
-- hc.claim_stage is U4).
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
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s1b uuid; s2 uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Adv one', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Adv two', u1) returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'ad1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Walter', 'recovering', '02138', 'America/New_York', 'clay',
          'ad2-' || substr(c1::text, 1, 8)) returning id into s1b;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '02139', 'America/Chicago', 'plum',
          'ad3-' || substr(c2::text, 1, 8)) returning id into s2;
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s1b', s1b::text, true);
  perform set_config('t.s2', s2::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1 · The §4.2 enum, verbatim at this boundary.
-- ----------------------------------------------------------------------------
select enum_has_labels('hc', 'advance_result',
  array['advanced','already_advanced','cancelled','frozen','invalid_state','stale_lease'],
  'hc.advance_result carries the §4.2 six, in order — claim vocabulary is U3''s ADD VALUE');

-- ----------------------------------------------------------------------------
-- 2–5 · Intake: hc.create_arrival happy path + idempotency.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('hc_pipeline', format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_sender_address => 'dr@clinic.example',
       p_sender_display_name => 'Dr. Reyes',
       p_auth_result => 'authenticated',
       p_ingest_idempotency_key => 'msg-001') $$,
  current_setting('t.c1'), current_setting('t.s1'))), 'no_error',
  'hc_pipeline creates an arrival through hc.create_arrival');

select is(pg_temp.scalar(format(
  $$ select a.state::text || ':' || a.channel || ':' ||
            (select count(*) from public.arrival_events e
              where e.arrival_id = a.id and e.from_state is null
                and e.to_state = 'received')::text
     from public.arrivals a
     where a.circle_id = %L and a.ingest_idempotency_key = 'msg-001' $$,
  current_setting('t.c1'))),
  'received:email:1',
  'the arrival lands at received with its creation event (from_state null)');

select is(pg_temp.scalar(format(
  $$ select (hc.create_arrival(%L, %L, 'email', p_ingest_idempotency_key => 'msg-001')
             = (select id from public.arrivals
                where circle_id = %L and ingest_idempotency_key = 'msg-001'))::text $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.c1'))),
  'true',
  'a re-delivered intake returns the SAME arrival id — idempotent, no second row');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrivals
     where circle_id = %L and ingest_idempotency_key = 'msg-001' $$,
  current_setting('t.c1'))),
  '1',
  'exactly one arrival survives the replay');

-- ----------------------------------------------------------------------------
-- 6–11 · Intake refusals: channels and the P5 caps, nothing written.
-- ----------------------------------------------------------------------------
select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'manual') $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'arrival_invalid',
  'create_arrival refuses the manual channel — synthetic arrivals are create_manual_proposal''s ONLY (MNL-01)');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'sms') $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'arrival_invalid',
  'create_arrival refuses sms — Phase 2 is an enum value away, not a silent accept');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'upload', p_byte_size => 52428801) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'arrival_invalid',
  'byte_size over the 50 MB PRD §13.3 bound is refused at intake');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'upload', p_page_count => 201) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'arrival_invalid',
  'page_count over the 200-page bound is refused at intake');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_auth_detail => ('{"blob": "' || repeat('x', 17000) || '"}')::jsonb) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'arrival_invalid',
  'an oversized auth_detail payload is refused at intake (P5 shape cap)');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'upload',
       p_ingest_idempotency_key => repeat('k', 201)) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'arrival_invalid',
  'an idempotency key over 200 chars is refused (the APR-07 bound, applied at intake)');

-- ----------------------------------------------------------------------------
-- 12–13 · Multi-attachment: children inherit circle AND subject (§4.6).
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ with p as (select hc.create_arrival(%L, %L, 'email',
                  p_ingest_idempotency_key => 'parent-1') as id)
     select (hc.create_arrival(%L, %L, 'email',
              p_parent_arrival_id => (select id from p)) is not null)::text $$,
  current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.c1'), current_setting('t.s1'))),
  'true',
  'a child arrival attaches to its parent');

select is(pg_temp.errmsg(format(
  $$ select hc.create_arrival(%L, %L, 'email',
       p_parent_arrival_id => (select id from public.arrivals
                               where circle_id = %L and ingest_idempotency_key = 'parent-1')) $$,
  current_setting('t.c1'), current_setting('t.s1b'), current_setting('t.c1'))),
  'arrival_invalid',
  'a child cannot claim a different subject than its parent');

-- ----------------------------------------------------------------------------
-- 14–17 · The CAS happy path and its audit atomicity.
-- ----------------------------------------------------------------------------
do $$
declare
  a uuid; l uuid;
begin
  a := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
                         'upload', p_ingest_idempotency_key => 'cas-1');
  l := pg_temp.mk_lease(a, current_setting('t.c1')::uuid, 'store', 1, now() + interval '5 minutes');
  perform set_config('t.a', a::text, true);
  perform set_config('t.l', l::text, true);
exception when others then
  -- abort-safe red: leave resolvable-but-absent ids so probes report failures
  perform set_config('t.a', gen_random_uuid()::text, true);
  perform set_config('t.l', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'received', 'stored', %L)::text $$,
  current_setting('t.a'), current_setting('t.l'))),
  'advanced',
  'a valid current lease advances received→stored');

select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.a'))),
  'stored', 'the state moved');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrival_events
     where arrival_id = %L and from_state = 'received' and to_state = 'stored'
       and attempt = 1 $$,
  current_setting('t.a'))),
  '1',
  'the event row landed with the already-bound attempt — the audit cannot degrade to a no-op');

select is(pg_temp.scalar(format(
  $$ select outcome || ':' || (closed_at is not null)::text
     from public.pipeline_leases where id = %L $$,
  current_setting('t.l'))),
  'advanced:true',
  'the winning lease closes as advanced');

-- ----------------------------------------------------------------------------
-- 18–21 · stale_lease in all four shapes: unresolvable, non-current,
-- expired, closed — state UNCHANGED and NO event row each time (A.5).
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned', %L)::text $$,
  current_setting('t.a'), gen_random_uuid()::text)),
  'stale_lease',
  'an unresolvable p_lease returns stale_lease');

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned', %L)::text $$,
  current_setting('t.a'), current_setting('t.l'))),
  'stale_lease',
  'a CLOSED lease returns stale_lease — a worker cannot publish twice under one claim');

do $$
declare l2 uuid;
begin
  -- an expired scan lease, still marked current
  l2 := pg_temp.mk_lease(current_setting('t.a')::uuid, current_setting('t.c1')::uuid,
                         'scan', 1, now() - interval '1 second');
  perform set_config('t.l2', l2::text, true);
exception when others then
  perform set_config('t.l2', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned', %L)::text $$,
  current_setting('t.a'), current_setting('t.l2'))),
  'stale_lease',
  'an EXPIRED lease returns stale_lease — expiry is the moment ownership transfers');

select is(pg_temp.scalar(format(
  $$ select (select count(*) from public.arrival_events
             where arrival_id = %L and to_state = 'scanned')::text || ':' ||
            (select state::text from public.arrivals where id = %L) $$,
  current_setting('t.a'), current_setting('t.a'))),
  '0:stored',
  'every stale_lease left the state unchanged and wrote NO event — they cannot come apart');

-- ----------------------------------------------------------------------------
-- 22–24 · already_advanced / invalid_state / non-current lease.
-- ----------------------------------------------------------------------------
do $$
declare l3 uuid;
begin
  l3 := pg_temp.mk_lease(current_setting('t.a')::uuid, current_setting('t.c1')::uuid,
                         'scan', 2, now() + interval '10 minutes');
  perform set_config('t.l3', l3::text, true);
exception when others then
  perform set_config('t.l3', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'received', 'stored', %L)::text $$,
  current_setting('t.a'), current_setting('t.l3'))),
  'already_advanced',
  'at-least-once delivery absorbed: state already equals p_to');

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'extracting', 'extracted', %L)::text $$,
  current_setting('t.a'), current_setting('t.l3'))),
  'invalid_state',
  'a worker holding a stale view of the machine gets invalid_state, not silence');

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned', %L)::text $$,
  current_setting('t.a'), current_setting('t.l2'))),
  'stale_lease',
  'a NON-CURRENT open lease returns stale_lease — attempt 2 owns the arrival now');

-- ----------------------------------------------------------------------------
-- 25–26 · reason codes travel; raw strings cannot.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned', %L, 'sender_recognised')::text $$,
  current_setting('t.a'), current_setting('t.l3'))),
  'advanced',
  'an enumerated reason code is accepted on the transition');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'gate', 1, now() + interval '1 minute') as id)
     select hc.advance_arrival(%L, 'scanned', 'extracting',
                               (select id from l), 'ECONNRESET from provider xyz')::text $$,
  current_setting('t.a'), current_setting('t.c1'), current_setting('t.a'))),
  'ERROR:23503',
  'a raw provider error string is REFUSED by the reason_codes FK — metadata costume closed');

-- ----------------------------------------------------------------------------
-- 27–31 · Freeze: accept-and-store stays open; everything else parks;
-- the TERMINAL transition is refused too (A.5, FRZ-15's pgTAP half).
-- ----------------------------------------------------------------------------
do $$
declare a2 uuid; l uuid;
begin
  a2 := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
                          'upload', p_ingest_idempotency_key => 'frz-1');
  perform set_config('t.a2', a2::text, true);
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
exception when others then
  perform set_config('t.a2', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'store', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'received', 'stored', (select id from l))::text $$,
  current_setting('t.a2'), current_setting('t.c1'), current_setting('t.a2'))),
  'advanced',
  'under a freeze, mail is still accepted and STORED — nothing is lost (PRD §7.5)');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'scan', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'stored', 'scanned', (select id from l))::text $$,
  current_setting('t.a2'), current_setting('t.c1'), current_setting('t.a2'))),
  'frozen',
  'the pipeline does not advance past stored under a freeze — the arrival is PARKED');

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scan_unavailable',
       (select current_lease_id from public.arrivals where id = %L))::text $$,
  current_setting('t.a2'), current_setting('t.a2'))),
  'frozen',
  'the TERMINAL transition is refused by the same predicate — parking, never failing (A.5)');

select is(pg_temp.scalar(format(
  $$ select state::text || ':' ||
       (select count(*) from public.arrival_events
        where arrival_id = %L and to_state not in ('received','stored'))::text
     from public.arrivals where id = %L $$,
  current_setting('t.a2'), current_setting('t.a2'))),
  'stored:0',
  'the parked arrival sits at stored with no further events');

do $$
begin
  perform hc.adjudicate_freeze(f.id, 'dismissed', 'Adjudicator R.',
                               p_outcome_note => 'no basis')
  from public.freezes f
  where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open';
exception when others then null;  -- abort-safe red
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned',
       (select current_lease_id from public.arrivals where id = %L))::text $$,
  current_setting('t.a2'), current_setting('t.a2'))),
  'advanced',
  'ONLY dismissed resumes processing — the same lease advances once the freeze clears');

-- ----------------------------------------------------------------------------
-- 32–33 · unresolved parks; a NARROWED unresolved parks the named subject
-- and releases the other (per-subject arithmetic, §3.8).
-- ----------------------------------------------------------------------------
do $$
declare a3 uuid; a4 uuid; f uuid; m uuid;
begin
  -- one arrival per subject in c1, both stored
  a3 := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
                          'upload', p_ingest_idempotency_key => 'nar-1');
  a4 := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1b')::uuid,
                          'upload', p_ingest_idempotency_key => 'nar-2');
  update public.arrivals set state = 'stored' where id in (a3, a4);
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid)
    returning id into f;
  perform hc.adjudicate_freeze(f, 'unresolved', 'Adjudicator R.',
                               p_outcome_note => 'continuing',
                               p_subject_id => current_setting('t.s1')::uuid,
                               p_narrowing_rationale => 'no joint material identified');
  perform set_config('t.a3', a3::text, true);
  perform set_config('t.a4', a4::text, true);
exception when others then
  perform set_config('t.a3', gen_random_uuid()::text, true);
  perform set_config('t.a4', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'scan', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'stored', 'scanned', (select id from l))::text $$,
  current_setting('t.a3'), current_setting('t.c1'), current_setting('t.a3'))),
  'frozen',
  'a narrowed unresolved finding keeps the NAMED subject''s arrivals parked (upheld/unresolved never resume)');

select is(pg_temp.scalar(format(
  $$ with l as (select pg_temp.mk_lease(%L, %L, 'scan', 1, now() + interval '5 minutes') as id)
     select hc.advance_arrival(%L, 'stored', 'scanned', (select id from l))::text $$,
  current_setting('t.a4'), current_setting('t.c1'), current_setting('t.a4'))),
  'advanced',
  'the OTHER subject''s record reopens with the narrowing — per-subject arithmetic');

-- ----------------------------------------------------------------------------
-- 34 · Cancellation wins at the CAS (fixture-level; the member surface is U5).
-- ----------------------------------------------------------------------------
do $$
declare l uuid;
begin
  update public.arrivals set state = 'cancelled', cancelled_at = now()
   where id = current_setting('t.a')::uuid;
  -- a fresh open lease, so the fence passes and the CANCELLED diagnosis is
  -- what is under test rather than stale_lease
  l := pg_temp.mk_lease(current_setting('t.a')::uuid, current_setting('t.c1')::uuid,
                        'interpret', 1, now() + interval '5 minutes');
  perform set_config('t.lc', l::text, true);
exception when others then
  perform set_config('t.lc', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.advance_arrival(%L, 'stored', 'scanned', %L)::text $$,
  current_setting('t.a'), current_setting('t.lc'))),
  'cancelled',
  'a cancelled arrival cannot be advanced — the in-flight result is discarded (§4.5)');

-- ----------------------------------------------------------------------------
-- 35–36 · Sender recognition (gate input) and privilege closure.
-- ----------------------------------------------------------------------------
do $$
declare v1 uuid; v2 uuid; v3 uuid;
begin
  insert into public.known_senders (circle_id, address, accepted_by)
  values (current_setting('t.c1')::uuid, 'dr@clinic.example', current_setting('t.u1')::uuid);
  insert into public.known_senders (circle_id, domain, accepted_by)
  values (current_setting('t.c1')::uuid, 'hospital.example', current_setting('t.u1')::uuid);
  v1 := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid, 'email',
          p_sender_address => 'DR@CLINIC.EXAMPLE', p_ingest_idempotency_key => 'snd-1');
  v2 := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid, 'email',
          p_sender_address => 'billing@Hospital.Example', p_ingest_idempotency_key => 'snd-2');
  v3 := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid, 'email',
          p_sender_address => 'stranger@elsewhere.example',
          p_sender_display_name => 'dr@clinic.example', p_ingest_idempotency_key => 'snd-3');
  perform set_config('t.sa1', v1::text, true);
  perform set_config('t.sa2', v2::text, true);
  perform set_config('t.sa3', v3::text, true);
exception when others then
  perform set_config('t.sa1', gen_random_uuid()::text, true);
  perform set_config('t.sa2', gen_random_uuid()::text, true);
  perform set_config('t.sa3', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.sender_recognised(%L)::text || ':' ||
            hc.sender_recognised(%L)::text || ':' ||
            hc.sender_recognised(%L)::text $$,
  current_setting('t.sa1'), current_setting('t.sa2'), current_setting('t.sa3'))),
  'true:true:false',
  'address and domain match case-blind; a display name WEARING a known address never matches (PRD §4.2.8)');

select is(pg_temp.scalar($$
  select (has_function_privilege('hc_pipeline',
            'hc.advance_arrival(uuid, hc.arrival_state, hc.arrival_state, uuid, text)', 'execute')
      and has_function_privilege('hc_pipeline',
            'hc.create_arrival(uuid, uuid, text, uuid, text, text, text, text, jsonb, text, bigint, int, text)', 'execute')
      and has_function_privilege('hc_pipeline', 'hc.sender_recognised(uuid)', 'execute')
      and not has_function_privilege('authenticated',
            'hc.advance_arrival(uuid, hc.arrival_state, hc.arrival_state, uuid, text)', 'execute')
      and not has_function_privilege('authenticated',
            'hc.create_arrival(uuid, uuid, text, uuid, text, text, text, text, jsonb, text, bigint, int, text)', 'execute')
      and not has_function_privilege('hc_admin', 'hc.sender_recognised(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'hc.circle_frozen(uuid, uuid)', 'execute')
      and not has_function_privilege('hc_pipeline', 'hc.circle_frozen(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'hc.pipeline_worker_states()', 'execute'))::text $$),
  'true',
  'EXECUTE closure: the three pipeline entry points are hc_pipeline''s; helpers are owner-only (catalog-asserted, PLT-04)');

select * from finish();
rollback;
