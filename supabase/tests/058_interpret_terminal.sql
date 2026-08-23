-- ============================================================================
-- 5B · M8 — the interpret stage's failure edge (round-16 R4/F-2; ADR-0023
-- D21). THE OWNER GRANTED A FOURTH AMENDMENT ITEM on 2026-08-23. Pinned here
-- BEFORE the migration exists (the M6 precedent, the red leg).
--
-- THE DEFECT. `hc.advance_arrival` binds the fenced lease's stage and requires
-- the edge to exist in `hc.arrival_transitions`, else it returns
-- `invalid_state`. Enumerated live, `interpret` had EXACTLY ONE edge:
--
--     interpret  interpreting -> proposals_ready
--
-- There was no failure target from `interpreting` at all. So when the
-- interpret worker met a provider refusal or an unparseable answer it called
--
--     advance_arrival(arrival, 'interpreting', 'extract_failed', lease, reason)
--
-- and got `invalid_state` back: the state never changed, the lease was never
-- closed, and the stage terminalized NOTHING. The lease then ran to its 300 s
-- deadline, the sweeper re-queued the arrival, and attempts 2 and 3 RE-CALLED
-- THE PROVIDER — three paid Opus 5 interpret passes over ~15 minutes for a
-- document that refused deterministically the first time — before exhaustion
-- finally landed `extract_failed` with `interpret_budget_exhausted`: the wrong
-- reason for what actually happened.
--
-- The route's unit test could not see it because `advanceArrival` is mocked.
--
-- WHY `extract_failed` AND NOT A NEW STATE. `hc.stage_budgets` already gives
-- interpret `exhaust_state = 'extract_failed'`, so the DATABASE already treats
-- that state as the interpret stage's terminal — the exhaustion path lands
-- there today. This migration does not invent a terminal; it lets the
-- DELIBERATE path reach the same one the involuntary path already uses. No
-- enum value is added, no family-facing label changes (`extract_failed` reads
-- "Couldn't read it", which is the honest thing to say for a refusal too), and
-- the distinction lives where it belongs: in the reason code, which is already
-- seeded as `provider_refusal` / `provider_error`.
-- ============================================================================

begin;

select plan(7);

-- ----------------------------------------------------------------------------
-- Fixtures: one circle, one subject, two arrivals parked at `extracted` so
-- the interpret stage can be claimed for real.
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid) returns uuid language plpgsql as $$
begin
  insert into auth.users (id, aud, role, email)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@t.example');
  return p_id;
end $$;

create function pg_temp.probe(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.probe_role(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  execute p_sql into v;
  reset role;
  return v;
exception when others then
  reset role;
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$ select (p_out::jsonb) ->> p_field $$;

create function pg_temp.tq(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; exception when others then v := 'ERROR:' || sqlstate; end;
  return v;
end $$;

do $$
declare u1 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc58-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

do $$
declare
  v_c1 uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid; v_id uuid; v_n text;
begin
  if v_c1 is null then return; end if;
  select s.id into v_nell from public.subjects s where s.circle_id = v_c1;
  perform set_config('t.c1', v_c1::text, true);
  foreach v_n in array array['refusal','error'] loop
    insert into public.arrivals (circle_id, subject_id, channel, state)
    values (v_c1, v_nell, 'upload', 'extracted'::hc.arrival_state)
    returning id into v_id;
    perform set_config('t.ar_' || v_n, v_id::text, true);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The edge exists, and it is the ONLY failure edge added.
-- ----------------------------------------------------------------------------
select ok(
  exists (select 1 from hc.arrival_transitions
           where stage = 'interpret' and from_state = 'interpreting'
             and to_state = 'extract_failed'),
  'R4/F-2: interpret can terminalize — interpreting -> extract_failed is a legal edge (ADR-0023 D21)');

select set_eq(
  $$ select to_state::text from hc.arrival_transitions where stage = 'interpret' $$,
  $$ values ('proposals_ready'), ('extract_failed') $$,
  'the interpret stage has exactly TWO targets: the happy path it always had, and one honest terminal');

-- ----------------------------------------------------------------------------
-- 3 · It reaches the SAME terminal exhaustion already used — no new state was
--     invented, which is why no label and no enum moved.
-- ----------------------------------------------------------------------------
select is(
  (select exhaust_state::text from hc.stage_budgets where stage = 'interpret'),
  'extract_failed',
  'the deliberate path lands where the exhaustion path already landed — hc.stage_budgets is unchanged');

-- ----------------------------------------------------------------------------
-- 4–6 · BEHAVIOURAL. A real interpret claim, then a real refusal, through
--       hc.advance_arrival as hc_pipeline — the call the worker actually makes.
-- ----------------------------------------------------------------------------
select set_config('t.lease_r',
  pg_temp.jf(pg_temp.probe_role('hc_pipeline', format(
    $sql$ select to_jsonb(c.*)::text from hc.claim_stage(%L::uuid, 'interpret') c $sql$,
    current_setting('t.ar_refusal'))), 'lease_id'), true);

select isnt(current_setting('t.lease_r', true), null,
  'the interpret stage claims (ING-07: extracted -> interpreting at the claim)');

select is(
  pg_temp.probe_role('hc_pipeline', format(
    $sql$ select hc.advance_arrival(%L::uuid, 'interpreting', 'extract_failed',
                                    %L::uuid, 'provider_refusal')::text $sql$,
    current_setting('t.ar_refusal'), current_setting('t.lease_r'))),
  'advanced',
  'a provider REFUSAL terminalizes the interpret stage instead of returning invalid_state');

select is(
  (select state::text from public.arrivals where id = current_setting('t.ar_refusal')::uuid),
  'extract_failed',
  'and the arrival actually rests there — the state moved, not just the return value');

-- ----------------------------------------------------------------------------
-- 7 · The lease is CLOSED by the same call. An open lease is what made the
--     sweeper re-queue and the provider get called twice more.
-- ----------------------------------------------------------------------------
select is(
  pg_temp.tq(format($sql$
    select (l.closed_at is not null)::text from hc.pipeline_leases l
     where l.id = %L::uuid $sql$, current_setting('t.lease_r'))),
  'true',
  'the lease closes with the transition — no open lease outlives the terminal, so nothing re-queues');

select * from finish();

rollback;
