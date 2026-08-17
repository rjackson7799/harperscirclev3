-- ============================================================================
-- 1C · M8 — FRZ-15's remaining machinery: the durable re-enqueue outbox arm
-- of hc.adjudicate_freeze, hc.outbox_drain, and hc.sweeper_pass (§4.2 the
-- parking block, §4.11 the sweeper).
--
-- A queue API call cannot join the adjudication transaction, so 'dismissed'
-- writes pipeline_outbox rows IN the transaction that clears the freeze —
-- one per parked (worker-state) arrival in the circle, children included.
-- 'upheld' and 'unresolved' leave arrivals parked and write nothing. If a
-- message is lost anyway, the arrival is not stranded: once no freeze is
-- open the ordinary sweeper lists it again — adjudication-committed-but-
-- delivery-failed is a delay, never a lost document.
--
-- hc.sweeper_pass, one deterministic in-database pass (the sweeper WORKER
-- that schedules it and re-enqueues is the relay's job — RLY-01, pending):
--   1 expire past-deadline open leases ('expired' distinguishes a dead
--     worker from a slow one);
--   2 move budget-spent unfrozen arrivals to their terminal state with the
--     stated reason (per-circle, under the R-rule lock, ordered by circle
--     so lock acquisition is acyclic);
--   3 list re-queueable arrivals (worker state, no live lease, budget
--     remaining) — SKIPPING frozen circles/subjects (FRZ-15);
--   4 report worker-state arrivals stuck > 24 h as a defect signal —
--     human-wait states and parked work excluded;
--   5 raise the 4-hour queue-age alert — parked work excluded, so a frozen
--     record does not read as a backlog and mask a real one.
--
-- Queue age is measured from received_at; stuck from the LAST transition
-- event (activity, not arrival age) — recorded in ADR-0007.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- adjudicate_freeze: body from M12 (round-6 form), verbatim except the
-- outbox arm on 'dismissed'. Signature unchanged (002 inventory intact).
-- ----------------------------------------------------------------------------
create or replace function hc.adjudicate_freeze(
  p_freeze_id           uuid,
  p_outcome             text,
  p_adjudicated_by      text,
  p_outcome_note        text default null,
  p_subject_id          uuid default null,
  p_narrowing_rationale text default null,
  p_contact_attempted_at timestamptz default null,
  p_objected_to_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_circle uuid;
begin
  if p_outcome not in ('dismissed', 'upheld', 'unresolved') then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  -- R-rule (round 6): discovery first — the lock keys on the circle.
  select f.circle_id into v_circle from public.freezes f where f.id = p_freeze_id;
  if v_circle is not null then
    perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));
  end if;

  update public.freezes f
     set state = p_outcome,
         subject_id = p_subject_id,
         narrowing_rationale = p_narrowing_rationale,
         adjudicated_at = now(),
         adjudicated_by = p_adjudicated_by,
         outcome_note = p_outcome_note,
         contact_attempted_at = coalesce(p_contact_attempted_at, f.contact_attempted_at),
         objected_to_member_id = case when p_outcome = 'unresolved'
                                      then p_objected_to_member_id end
   where f.id = p_freeze_id and f.state = 'open'
   returning f.circle_id into v_circle;

  if v_circle is null then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  -- 1C M8 (FRZ-15): ONLY dismissed resumes processing — and its re-enqueue
  -- is durable because it commits with the finding. Parked = sitting in a
  -- worker state; human-wait and terminal arrivals were never parked.
  if p_outcome = 'dismissed' then
    insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
    select v_circle, a.id, 'freeze_dismissed_requeue'
      from public.arrivals a
     where a.circle_id = v_circle
       and a.deleted_at is null
       and a.state = any (hc.pipeline_worker_states());
  end if;

  perform hc.log(v_circle, 'freeze_adjudicated', 'Freeze adjudication',
                 p_subject_id => p_subject_id,
                 p_detail => jsonb_build_object('outcome', p_outcome));

  return jsonb_build_object('freeze_id', p_freeze_id, 'outcome', p_outcome);
end $$;

-- ----------------------------------------------------------------------------
-- The relay's exactly-once handoff. Stage is derived from the arrival's
-- CURRENT state at drain time (the message may be old; the state is not).
-- ----------------------------------------------------------------------------
create function hc.outbox_drain(p_limit int default 100)
returns table (outbox_id uuid, arrival_id uuid, stage text)
language plpgsql security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select o.id
      from public.pipeline_outbox o
     where o.drained_at is null
     order by o.created_at
     limit greatest(coalesce(p_limit, 100), 1)
       for update skip locked
  ), marked as (
    update public.pipeline_outbox o
       set drained_at = now()
      from picked p
     where o.id = p.id
    returning o.id, o.arrival_id
  )
  select m.id, m.arrival_id,
         (select b.stage from hc.stage_budgets b, public.arrivals a
           where a.id = m.arrival_id
             and (a.state = b.entry_state or a.state = b.inflight_state))
    from marked m;
end $$;

alter function hc.outbox_drain(int) owner to hc_internal;
revoke execute on function hc.outbox_drain(int)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.outbox_drain(int) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- One sweeper pass, deterministic and idempotent.
-- ----------------------------------------------------------------------------
create function hc.sweeper_pass()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_expired int;
  v_term    jsonb := '[]'::jsonb;
  v_requeue jsonb;
  v_stuck   jsonb;
  v_alert   boolean;
  v_spent   int;
  r record;
begin
  -- 1 · expiry transfers ownership; 'expired' is a dead worker, not a slow one
  with e as (
    update public.pipeline_leases
       set outcome = 'expired', closed_at = now()
     where closed_at is null and deadline <= now()
    returning 1)
  select count(*)::int into v_expired from e;

  -- 2 · budget-spent unfrozen arrivals reach their terminal state with the
  --     stated reason. Ordered by circle: advisory locks accumulate in one
  --     deterministic order across the pass.
  for r in
    select a.id, a.circle_id, a.subject_id, a.state,
           b.stage, b.max_attempts, b.exhaust_state, b.exhaust_reason
      from public.arrivals a
      join hc.stage_budgets b
        on (a.state = b.entry_state or a.state = b.inflight_state)
     where a.deleted_at is null
       and a.state = any (hc.pipeline_worker_states())
       and not exists (select 1 from public.pipeline_leases l
                       where l.arrival_id = a.id
                         and l.closed_at is null and l.deadline > now())
     order by a.circle_id, a.id
  loop
    perform pg_advisory_xact_lock(hashtext('taint:' || r.circle_id::text));
    if hc.circle_frozen(r.circle_id, r.subject_id) then
      continue;  -- FRZ-15: parked work is skipped for age exhaustion
    end if;
    select coalesce(max(l.attempt_no), 0) into v_spent
      from public.pipeline_leases l
     where l.arrival_id = r.id and l.stage = r.stage;
    if v_spent >= r.max_attempts then
      update public.arrivals set state = r.exhaust_state where id = r.id;
      insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                         reason_code, attempt)
      values (r.id, r.circle_id, r.state, r.exhaust_state, r.exhaust_reason, v_spent);
      v_term := v_term || jsonb_build_object('arrival_id', r.id,
                                             'state', r.exhaust_state::text);
    end if;
  end loop;

  -- 3 · re-queueable: worker state, no live lease, budget remaining,
  --     not frozen (FRZ-15: skipped for re-queueing too)
  select coalesce(jsonb_agg(jsonb_build_object('arrival_id', x.id, 'stage', x.stage)
                            order by x.id), '[]'::jsonb)
    into v_requeue
    from (select a.id, a.circle_id, a.subject_id, b.stage
            from public.arrivals a
            join hc.stage_budgets b
              on (a.state = b.entry_state or a.state = b.inflight_state)
           where a.deleted_at is null
             and a.state = any (hc.pipeline_worker_states())
             and not exists (select 1 from public.pipeline_leases l
                             where l.arrival_id = a.id
                               and l.closed_at is null and l.deadline > now())
             and (select coalesce(max(l.attempt_no), 0)
                    from public.pipeline_leases l
                   where l.arrival_id = a.id and l.stage = b.stage) < b.max_attempts) x
   where not hc.circle_frozen(x.circle_id, x.subject_id);

  -- 4 · stuck > 24 h since the LAST transition: a defect signal, not
  --     routine cleanup. Human-wait states are not in worker_states;
  --     parked work is excluded explicitly.
  select coalesce(jsonb_agg(to_jsonb(y.id::text) order by y.id), '[]'::jsonb)
    into v_stuck
    from (select a.id, a.circle_id, a.subject_id
            from public.arrivals a
           where a.deleted_at is null
             and a.state = any (hc.pipeline_worker_states())
             and coalesce((select max(e.occurred_at) from public.arrival_events e
                           where e.arrival_id = a.id),
                          a.received_at) < now() - interval '24 hours') y
   where not hc.circle_frozen(y.circle_id, y.subject_id);

  -- 5 · queue age over 4 h, parked excluded (PRD §13.1's honesty bound)
  select exists (
    select 1 from public.arrivals a
     where a.deleted_at is null
       and a.state = any (hc.pipeline_worker_states())
       and a.received_at < now() - interval '4 hours'
       and not hc.circle_frozen(a.circle_id, a.subject_id))
    into v_alert;

  return jsonb_build_object(
    'expired_leases', v_expired,
    'terminalized',   v_term,
    'requeue',        v_requeue,
    'stuck',          v_stuck,
    'queue_age_alert', v_alert);
end $$;

alter function hc.sweeper_pass() owner to hc_internal;
revoke execute on function hc.sweeper_pass()
  from public, anon, authenticated, hc_admin;
grant execute on function hc.sweeper_pass() to hc_pipeline;
