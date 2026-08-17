-- ============================================================================
-- 1C · U8 — FRZ-15's remaining halves (§4.2 parking block, §4.11 sweeper):
--
--   · dismissal writes the outbox IN the adjudication transaction, covering
--     every parked (worker-state) arrival in the circle including children;
--     upheld and unresolved write NOTHING (they leave arrivals parked);
--   · hc.outbox_drain hands each row to the relay exactly once;
--   · the sweeper skips frozen arrivals for BOTH re-queueing and age
--     exhaustion; parked time consumes no attempt;
--   · a lost outbox message is a delay, not a lost document: once no freeze
--     is open the ordinary sweeper lists the arrival again;
--   · exhaustion via the sweeper is a terminal state with a stated reason;
--   · stuck (>24 h in a worker state) is a defect signal that excludes
--     human-wait states and parked work; queue-age alerts exclude parked.
--
-- The relay itself (outbox → pgmq) is a worker: RLY-01 stays pending.
--
-- RED (U8): dismissal writes no outbox rows (0 where counts expected);
-- hc.outbox_drain / hc.sweeper_pass probes report 42883.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(18);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s2 uuid;
  ap uuid; ac uuid; ah uuid; at2 uuid; ax uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Frz pipe', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Frz pipe 2', u1) returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'fp1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '02139', 'America/Chicago', 'clay',
          'fp2-' || substr(c2::text, 1, 8)) returning id into s2;

  -- c1: a parked PARENT (stored) with a parked CHILD (extracting), one
  -- human-wait arrival (proposals_ready), one terminal (filed).
  ap := hc.create_arrival(c1, s1, 'email', p_ingest_idempotency_key => 'fpp-1');
  update public.arrivals set state = 'stored' where id = ap;
  ac := hc.create_arrival(c1, s1, 'email', p_parent_arrival_id => ap,
                          p_ingest_idempotency_key => 'fpc-1');
  update public.arrivals set state = 'extracting' where id = ac;
  ah := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'fph-1');
  update public.arrivals set state = 'proposals_ready' where id = ah;
  at2 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'fpt-1');
  update public.arrivals set state = 'filed' where id = at2;
  -- c2: a control arrival, parked state but never frozen
  ax := hc.create_arrival(c2, s2, 'upload', p_ingest_idempotency_key => 'fpx-1');
  update public.arrivals set state = 'stored' where id = ax;

  insert into public.freezes (circle_id) values (c1);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.ap', ap::text, true);
  perform set_config('t.ac', ac::text, true);
  perform set_config('t.ah', ah::text, true);
  perform set_config('t.at', at2::text, true);
  perform set_config('t.ax', ax::text, true);
exception when others then
  perform set_config('t.u1', gen_random_uuid()::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.c2', gen_random_uuid()::text, true);
  perform set_config('t.s1', gen_random_uuid()::text, true);
  perform set_config('t.ap', gen_random_uuid()::text, true);
  perform set_config('t.ac', gen_random_uuid()::text, true);
  perform set_config('t.ah', gen_random_uuid()::text, true);
  perform set_config('t.at', gen_random_uuid()::text, true);
  perform set_config('t.ax', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · The sweeper honours parking while the freeze is open.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select (r.pass -> 'requeue')::text
  from (select hc.sweeper_pass() as pass) r $$),
  format('[{"stage": "scan", "arrival_id": "%s"}]', current_setting('t.ax')),
  'FRZ-15: the sweeper re-queues ONLY the unfrozen circle''s arrival — parked work is skipped');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.pipeline_leases
     where arrival_id in (%L, %L) $$,
  current_setting('t.ap'), current_setting('t.ac'))),
  '0',
  'FRZ-15: parked time consumed no attempt — no lease was ever minted for the frozen pair');

select is(pg_temp.scalar(format(
  $$ select (select state::text from public.arrivals where id = %L) || ':' ||
            (select state::text from public.arrivals where id = %L) $$,
  current_setting('t.ap'), current_setting('t.ac'))),
  'stored:extracting',
  'the parked pair sits untouched — no terminal transition, no exhaustion (A.5)');

-- ----------------------------------------------------------------------------
-- 4–6 · Dismissal: the outbox rows are written IN the adjudication
-- transaction, for parked arrivals only, children included.
-- ----------------------------------------------------------------------------
do $$
begin
  perform hc.adjudicate_freeze(f.id, 'dismissed', 'Adjudicator R.',
                               p_outcome_note => 'no basis')
  from public.freezes f
  where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open';
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.pipeline_outbox
     where circle_id = %L and reason_code = 'freeze_dismissed_requeue'
       and drained_at is null $$,
  current_setting('t.c1'))),
  '2',
  'dismissal enqueued the parked parent AND its child — durable, same transaction (§4.2)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.pipeline_outbox
     where arrival_id in (%L, %L) $$,
  current_setting('t.ah'), current_setting('t.at'))),
  '0',
  'human-wait and terminal arrivals were never parked by the freeze — no outbox rows for them');

select is(pg_temp.scalar(format(
  $$ with f as (insert into public.freezes (circle_id) values (%L) returning id),
          adj as (select hc.adjudicate_freeze((select id from f), 'upheld', 'Adjudicator R.',
                                              p_outcome_note => 'substantiated'))
     select (select count(*) from adj)::text $$,
  current_setting('t.c2'))) || ':' ||
  pg_temp.scalar(format(
  $$ select count(*)::text from public.pipeline_outbox where circle_id = %L $$,
  current_setting('t.c2'))),
  '1:0',
  'upheld writes NO outbox rows — upheld and unresolved leave arrivals parked (§4.2)');

-- ----------------------------------------------------------------------------
-- 7–9 · The drain: exactly once, stage derived from state.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select coalesce(string_agg(d.stage, ',' order by d.stage), 'empty')
  from hc.outbox_drain(10) d $$),
  'extract,scan',
  'the relay drains both rows: stored → scan, extracting → extract (stage from state)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.pipeline_outbox
     where circle_id = %L and drained_at is null $$,
  current_setting('t.c1'))),
  '0',
  'draining marks the rows — the outbox empties');

select is(pg_temp.scalar($$
  select count(*)::text from hc.outbox_drain(10) $$),
  '0',
  'a second drain returns nothing — exactly-once handoff to the relay');

-- ----------------------------------------------------------------------------
-- 10 · Lost-message recovery: the messages are gone (drained) and nothing
-- was enqueued — the ordinary sweeper still finds both parked arrivals.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select count(*)::text
     from jsonb_array_elements(hc.sweeper_pass() -> 'requeue') e
     where e ->> 'arrival_id' in (%L, %L) $$,
  current_setting('t.ap'), current_setting('t.ac'))),
  '2',
  'adjudication-committed-but-delivery-lost is a DELAY: the sweeper lists both once no freeze is open (A.5)');

-- ----------------------------------------------------------------------------
-- 11–13 · Sweeper exhaustion: terminal with a stated reason; frozen skipped.
-- ----------------------------------------------------------------------------
do $$
declare i int; r record;
begin
  -- burn the child's extract budget: three claims, each expiring
  for i in 1..3 loop
    select * into r from hc.claim_stage(current_setting('t.ac')::uuid, 'extract');
    update public.pipeline_leases set deadline = now() - interval '1 second'
     where id = r.lease_id;
  end loop;
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ with f as (insert into public.freezes (circle_id) values (%L) returning 1)
     select (hc.sweeper_pass() -> 'terminalized')::text $$,
  current_setting('t.c1'))),
  '[]',
  'a frozen circle''s budget-spent arrival is NOT age-exhausted — the sweeper skips parked work for exhaustion too');

do $$
begin
  perform hc.adjudicate_freeze(f.id, 'dismissed', 'Adjudicator R.',
                               p_outcome_note => 'no basis')
  from public.freezes f
  where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open';
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select (select count(*) from jsonb_array_elements(hc.sweeper_pass() -> 'terminalized') e
             where e ->> 'arrival_id' = %L)::text || ':' ||
            (select state::text from public.arrivals where id = %L) $$,
  current_setting('t.ac'), current_setting('t.ac'))),
  '1:extract_failed',
  'once unfrozen, the sweeper moves the budget-spent arrival to its terminal state (§4.11)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrival_events
     where arrival_id = %L and to_state = 'extract_failed'
       and reason_code = 'extract_budget_exhausted' and attempt = 3 $$,
  current_setting('t.ac'))),
  '1',
  'the sweeper''s terminal move carries the stated, enumerated reason');

-- ----------------------------------------------------------------------------
-- 14–16 · Stuck report and queue age: defect signals that exclude
-- human-wait states and parked work.
-- ----------------------------------------------------------------------------
do $$
begin
  -- the parent has now been "in flight" for 25 hours
  update public.arrivals set received_at = now() - interval '25 hours'
   where id in (current_setting('t.ap')::uuid, current_setting('t.ah')::uuid);
  update public.arrival_events set occurred_at = now() - interval '25 hours'
   where arrival_id in (current_setting('t.ap')::uuid, current_setting('t.ah')::uuid);
exception when others then null;
end $$;

select is(pg_temp.scalar(format(
  $$ select (select count(*) from jsonb_array_elements_text(hc.sweeper_pass() -> 'stuck') e
             where e.value = %L)::text || ':' ||
            (select count(*) from jsonb_array_elements_text(hc.sweeper_pass() -> 'stuck') e
             where e.value = %L)::text $$,
  current_setting('t.ap'), current_setting('t.ah'))),
  '1:0',
  'a worker-state arrival stuck 25 h is a DEFECT SIGNAL; a human-wait arrival never is (§4.11)');

select is(pg_temp.scalar($$
  select (hc.sweeper_pass() ->> 'queue_age_alert') $$),
  'true',
  'queue age over 4 h raises the alert (the 25 h parent is unfrozen and unprocessed)');

select is(pg_temp.scalar(format(
  $$ with f as (insert into public.freezes (circle_id) values (%L) returning 1)
     select (hc.sweeper_pass() ->> 'queue_age_alert') || ':' ||
            (hc.sweeper_pass() -> 'stuck')::text $$,
  current_setting('t.c1'))),
  'false:[]',
  'parked work is EXCLUDED from queue-age and stuck signals — a frozen record must not mask a real backlog');

-- ----------------------------------------------------------------------------
-- 17–18 · Idempotence and closure.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select ((hc.sweeper_pass() -> 'terminalized') = '[]'::jsonb)::text $$),
  'true',
  'the sweeper is idempotent — a second pass terminalizes nothing new');

select is(pg_temp.scalar($$
  select (has_function_privilege('hc_pipeline', 'hc.sweeper_pass()', 'execute')
      and has_function_privilege('hc_pipeline', 'hc.outbox_drain(int)', 'execute')
      and not has_function_privilege('authenticated', 'hc.sweeper_pass()', 'execute')
      and not has_function_privilege('authenticated', 'hc.outbox_drain(int)', 'execute')
      and not has_function_privilege('hc_admin', 'hc.sweeper_pass()', 'execute'))::text $$),
  'true',
  'sweeper and drain are hc_pipeline entry points only (catalog-asserted, PLT-04)');

select * from finish();
rollback;
