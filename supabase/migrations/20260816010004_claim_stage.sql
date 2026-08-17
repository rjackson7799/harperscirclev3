-- ============================================================================
-- 1C · M4 — hc.claim_stage (TSD §4.3): the only way into a stage.
--
-- First USE of M3's 'claimed'/'exhausted' — the 55P04 split's second half.
--
-- Contract (ADR-0007): the worker's sequence is claim → COMMIT → external
-- work → finalize; the budget is claimed before the provider call, so a
-- crash after the commit has already burned the attempt. Outcomes reuse
-- hc.advance_result:
--   claimed          you own attempt N (lease_id/attempt_no/deadline set)
--   stale_lease      a LIVE lease owns the arrival — back off, ack
--   exhausted        budget spent; the terminal move ALREADY HAPPENED here,
--                    inside the same row lock the CAS family uses; the
--                    caller never reaches the provider (§4.3). Recorded
--                    delta: the TSD's "the caller moves the arrival" is
--                    implemented as claim-internal so the move cannot need
--                    a lease the caller does not hold.
--   frozen           parked; refused BEFORE any attempt bookkeeping, so a
--                    freeze consumes NO retry budget (FRZ-15). 'store' is
--                    exempt: accept-and-store continues under a freeze.
--   cancelled        discard, ack (§4.5)
--   already_advanced this stage already concluded for this arrival
--                    (redelivery; detected from the event trail)
--   invalid_state    not this stage's entry state and no record the stage
--                    ever ran — a defect signal
--
-- R-rule: per-circle taint lock before the row lock; the freeze predicate
-- evaluates under the serialization point (ADR-0006 A4 extended, ADR-0007).
-- Expiry is the moment ownership transfers: a past-deadline current lease
-- is marked 'expired' here, and the new claim moves current_lease_id, so
-- §4.2's fence returns stale_lease to the late worker no matter which
-- order they finalize in.
-- ============================================================================

create function hc.claim_stage(
  p_arrival uuid, p_stage text,
  out result hc.advance_result, out lease_id uuid,
  out attempt_no int, out deadline timestamptz)
returns record language plpgsql security definer
set search_path = ''
as $$
declare
  v_budget hc.stage_budgets%rowtype;
  v_state  hc.arrival_state;
  v_circle uuid;
  v_frozen boolean;
  v_current uuid;
  v_spent  int;
begin
  select * into v_budget from hc.stage_budgets b where b.stage = p_stage;
  if v_budget.stage is null then
    raise exception 'stage_unknown' using errcode = 'P0001';
  end if;

  -- R-rule: discovery for the lock key, then the per-circle lock BEFORE the
  -- row lock. A purged arrival has nothing to own.
  select a.circle_id into v_circle from public.arrivals a where a.id = p_arrival;
  if v_circle is null then
    result := 'invalid_state'::hc.advance_result; return;
  end if;
  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  select a.state, a.current_lease_id, hc.circle_frozen(a.circle_id, a.subject_id)
    into v_state, v_current, v_frozen
    from public.arrivals a where a.id = p_arrival for update;

  if v_state = 'cancelled' then
    result := 'cancelled'::hc.advance_result; return;
  end if;

  -- FRZ-15: parked, and parking consumes NOTHING — refused before any
  -- attempt bookkeeping. Only store proceeds (PRD §7.5 accept-and-store).
  if v_frozen and p_stage <> 'store' then
    result := 'frozen'::hc.advance_result; return;
  end if;

  if v_state <> v_budget.entry_state
     and (v_budget.inflight_state is null or v_state <> v_budget.inflight_state) then
    if exists (select 1 from public.arrival_events e
               where e.arrival_id = p_arrival
                 and e.from_state = v_budget.entry_state) then
      result := 'already_advanced'::hc.advance_result;  -- redelivery, absorbed
    else
      result := 'invalid_state'::hc.advance_result;     -- defect signal
    end if;
    return;
  end if;

  -- Expiry transfers ownership; a live lease refuses the claim.
  if v_current is not null then
    update public.pipeline_leases l
       set outcome = 'expired', closed_at = now()
     where l.id = v_current and l.closed_at is null and l.deadline <= now();
    if exists (select 1 from public.pipeline_leases l
               where l.id = v_current and l.stage = p_stage
                 and l.closed_at is null and l.deadline > now()) then
      result := 'stale_lease'::hc.advance_result; return;
    end if;
  end if;

  select coalesce(max(l.attempt_no), 0) into v_spent
    from public.pipeline_leases l
   where l.arrival_id = p_arrival and l.stage = p_stage;

  if v_spent >= v_budget.max_attempts then
    -- Exhaustion is a terminal state with a stated reason (§4.11), reached
    -- WITHOUT a provider call — the counter that survives a crash is the
    -- lease table, and it is already at the cap.
    update public.arrivals set state = v_budget.exhaust_state where id = p_arrival;
    insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                       reason_code, attempt)
    values (p_arrival, v_circle, v_state, v_budget.exhaust_state,
            v_budget.exhaust_reason, v_spent);
    result := 'exhausted'::hc.advance_result;
    attempt_no := v_spent;
    return;
  end if;

  attempt_no := v_spent + 1;
  deadline   := now() + make_interval(secs => v_budget.lease_seconds);
  insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline)
  values (p_arrival, v_circle, p_stage, attempt_no, deadline)
  returning id into lease_id;

  update public.arrivals set current_lease_id = lease_id where id = p_arrival;

  -- The declared in-flight transition happens AT claim (interpret:
  -- extracted → interpreting) so one lease spans the stage and §4.3's
  -- entry/exit table holds; a reclaim after a mid-flight death finds the
  -- inflight state and does not re-event it (ADR-0007).
  if v_budget.inflight_state is not null and v_state = v_budget.entry_state then
    update public.arrivals set state = v_budget.inflight_state where id = p_arrival;
    insert into public.arrival_events (arrival_id, circle_id, from_state, to_state, attempt)
    values (p_arrival, v_circle, v_state, v_budget.inflight_state, attempt_no);
  end if;

  result := 'claimed'::hc.advance_result;
end $$;

alter function hc.claim_stage(uuid, text) owner to hc_internal;
revoke execute on function hc.claim_stage(uuid, text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.claim_stage(uuid, text) to hc_pipeline;
