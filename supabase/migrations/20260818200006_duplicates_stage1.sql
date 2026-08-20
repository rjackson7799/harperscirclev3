-- ============================================================================
-- 4A · M6 — stage-1 duplicates (slice-4 plan M6; TSD §4.7 point 1;
-- PRD §8.9; pgTAP 048 pinned every shape red-first; ING-10's exact-set
-- pin in 027 re-pins in this commit — the 2A M6 append pattern).
--
-- The §4.7 edges append WITH their machinery, exactly as ADR-0008 B1
-- recorded: the post-scan human-wait entry and the two resolution
-- exits. Detection is the CHEAP check only (exact content_sha256 against
-- non-deleted arrivals in the circle — the same file forwarded twice);
-- stage-2's key-field match against filed documents is slice 5's.
--
-- The check runs INSIDE finalize_scan's transaction (the plan's ruling):
-- only CLEANED content reaches the duplicate question — a quarantined
-- copy is quarantined, not politely deduplicated — and the safety answer
-- still lands in full (scan_verdict/scan_at/cache); the duplicate
-- question is held by the STATE.
--
-- hc.resolve_duplicate is the member surface: manage-gated like cancel,
-- R-rule lock, freeze-first NAMED (the Q5 order), DEF-10 one-shape
-- refusals with the honest state diagnosis reserved for authorized
-- callers (the Q3 precedent). 'different' resumes to the gate through a
-- real gate lease + the CAS + an outbox re-queue (the SND-02 release
-- precedent); 'same_thing' terminalizes nothing_filed with reason
-- duplicate_of_arrival — the original RETAINED and readable. Never
-- auto-discarded, in either direction; the attach-as-additional-source
-- outcome needs a filed document and refines with slices 5/6.
-- ============================================================================

insert into hc.arrival_transitions (stage, from_state, to_state) values
  ('scan', 'stored',              'duplicate_suspected'),
  ('gate', 'duplicate_suspected', 'scanned'),
  ('gate', 'duplicate_suspected', 'nothing_filed');

insert into hc.reason_codes (code, description) values
  ('duplicate_resolved_different', 'The member said this is different; resumed to the sender gate'),
  ('duplicate_of_arrival',         'The member confirmed the same thing; nothing filed — the original remains readable');

-- ----------------------------------------------------------------------------
-- hc.detect_duplicate — owner-only, non-definer (the write-halves
-- pattern): reachable ONLY from inside finalize_scan, already running as
-- hc_internal. Returns the matched arrival id, or null.
-- ----------------------------------------------------------------------------
create function hc.detect_duplicate(p_arrival uuid, p_circle uuid, p_sha bytea)
returns uuid
language sql stable
set search_path = ''
as $$
  select a.id
  from public.arrivals a
  where a.circle_id = p_circle
    and a.content_sha256 = p_sha
    and a.id <> p_arrival
    and a.deleted_at is null
  order by a.received_at
  limit 1;
$$;

alter function hc.detect_duplicate(uuid, uuid, bytea) owner to hc_internal;
revoke execute on function hc.detect_duplicate(uuid, uuid, bytea)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.finalize_scan — body as M2 with ONE addition: a clean verdict with
-- a live exact match exits stored → duplicate_suspected (reason
-- duplicate_sha256) instead of scanned. Everything else is unchanged —
-- the four verdicts never collapse, the cache half still runs (the
-- bytes ARE clean; being a second copy does not un-clean them).
-- ----------------------------------------------------------------------------
create or replace function hc.finalize_scan(
  p_arrival uuid, p_lease uuid, p_verdict text, p_detail jsonb default '{}'::jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_to hc.arrival_state;
  v_reason text;
  v_circle uuid;
  v_sha bytea;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if p_verdict is null
     or p_verdict not in ('clean', 'infected', 'unavailable', 'inconclusive')
     or length(v_detail::text) > 16384 then
    raise exception 'scan_invalid' using errcode = 'P0001';
  end if;

  select case p_verdict when 'clean'        then 'scanned'::hc.arrival_state
                        when 'infected'     then 'quarantined'::hc.arrival_state
                        when 'unavailable'  then 'scan_unavailable'::hc.arrival_state
                        else 'scan_inconclusive'::hc.arrival_state end,
         case p_verdict when 'infected'     then 'scan_infected'
                        when 'unavailable'  then 'scan_provider_unavailable'
                        when 'inconclusive' then 'scan_inconclusive'
                        else null end
    into v_to, v_reason;

  -- §4.7 point 1, in this transaction: a CLEAN second copy is a
  -- question for a person, not a fact for the pipeline.
  select a.circle_id, a.content_sha256 into v_circle, v_sha
  from public.arrivals a where a.id = p_arrival;
  if p_verdict = 'clean' and v_sha is not null
     and hc.detect_duplicate(p_arrival, v_circle, v_sha) is not null then
    v_to := 'duplicate_suspected'::hc.arrival_state;
    v_reason := 'duplicate_sha256';
  end if;

  v := hc.advance_arrival(p_arrival, 'stored', v_to, p_lease, v_reason);
  if v <> 'advanced' then
    return v;
  end if;

  update public.arrivals
     set scan_verdict = p_verdict, scan_at = now()
   where id = p_arrival
  returning content_sha256 into v_sha;

  if p_verdict in ('clean', 'infected') and v_sha is not null then
    insert into public.scan_results (content_sha256, verdict, detail, scanned_at, expires_at)
    values (v_sha, p_verdict, v_detail, now(),
            case when p_verdict = 'clean' then now() + interval '7 days' end)
    on conflict (content_sha256) do update
      set verdict = excluded.verdict, detail = excluded.detail,
          scanned_at = excluded.scanned_at, expires_at = excluded.expires_at;
  end if;

  return 'advanced'::hc.advance_result;
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way).
alter function hc.finalize_scan(uuid, uuid, text, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_scan(uuid, uuid, text, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_scan(uuid, uuid, text, jsonb) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- hc.resolve_duplicate — the member surface.
-- ----------------------------------------------------------------------------
create function hc.resolve_duplicate(p_arrival uuid, p_resolution text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_circle uuid; v_subject uuid; v_state hc.arrival_state;
  v_frozen boolean;
  v_attempt int; v_lease uuid;
  v hc.advance_result;
begin
  if v_actor is null then
    raise exception 'resolve_refused' using errcode = 'P0001';
  end if;

  select a.circle_id into v_circle from public.arrivals a where a.id = p_arrival;
  if v_circle is null then
    raise exception 'resolve_refused' using errcode = 'P0001';
  end if;

  -- R-rule: the per-circle lock before the row lock; freeze and
  -- authorization evaluate under the serialization point.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  select a.subject_id, a.state,
         hc.circle_frozen(a.circle_id, a.subject_id)
    into v_subject, v_state, v_frozen
    from public.arrivals a where a.id = p_arrival for update;

  -- Freeze first (the Q5 order): the named signature is not swallowed.
  if v_frozen then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- Who can approve can resolve: manage across the fail-closed
  -- all-domain taint — the cancel precedent.
  if hc.visible_at(hc.ctx(), v_subject, hc.all_domains(), true,
                   'arrival', p_arrival, null) < 'manage' then
    raise exception 'resolve_refused' using errcode = 'P0001';
  end if;

  if p_resolution is null or p_resolution not in ('different', 'same_thing') then
    raise exception 'resolve_refused' using errcode = 'P0001';
  end if;

  -- Only an authorized member reaches the state diagnosis (Q3).
  if v_state <> 'duplicate_suspected' then
    raise exception 'resolve_invalid_state' using errcode = 'P0001';
  end if;

  -- A real gate lease + the CAS edge (the SND-02 release precedent).
  select coalesce(max(l.attempt_no), 0) + 1 into v_attempt
    from public.pipeline_leases l where l.arrival_id = p_arrival;
  insert into public.pipeline_leases
    (arrival_id, circle_id, stage, attempt_no, deadline)
  values (p_arrival, v_circle, 'gate', v_attempt, now() + interval '60 seconds')
  returning id into v_lease;
  update public.arrivals set current_lease_id = v_lease where id = p_arrival;

  if p_resolution = 'different' then
    v := hc.advance_arrival(p_arrival, 'duplicate_suspected', 'scanned',
                            v_lease, 'duplicate_resolved_different');
    if v <> 'advanced' then
      raise exception 'resolve_refused' using errcode = 'P0001';
    end if;
    -- Re-queue in the SAME transaction: the relay hands the gate its work.
    insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
    values (v_circle, p_arrival, 'duplicate_resolved_different');
  else
    v := hc.advance_arrival(p_arrival, 'duplicate_suspected', 'nothing_filed',
                            v_lease, 'duplicate_of_arrival');
    if v <> 'advanced' then
      raise exception 'resolve_refused' using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object('arrival_id', p_arrival, 'resolution', p_resolution);
end $$;

alter function hc.resolve_duplicate(uuid, text) owner to hc_internal;
revoke execute on function hc.resolve_duplicate(uuid, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.resolve_duplicate(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- FIX (found by concurrency case 33 at this unit's head, plan-dependent):
-- hc.claim_security_actions used `id IN (SELECT … LIMIT n FOR UPDATE SKIP
-- LOCKED)`. The planner may evaluate that subplan PER OUTER ROW; each
-- re-execution sees the rows the command itself just claimed fail the
-- unclaimed qual (FOR UPDATE follows the update chain to the command's
-- own new versions) and locks the NEXT batch — a claim(3) over six
-- pending rows claimed ALL SIX on one plan shape and exactly three on
-- another. The candidate set must materialize ONCE: a CTE containing
-- FOR UPDATE is never inlined, so the locking scan runs exactly once and
-- the batch bound is a bound. Behaviour is otherwise identical; the 043
-- pins and the worker contract are unchanged.
-- ----------------------------------------------------------------------------
create or replace function hc.claim_security_actions(p_limit integer)
returns setof public.security_actions
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'security_action_refused' using errcode = 'P0001';
  end if;

  return query
  with claimed as (
    select x.id from public.security_actions x
    where x.completed_at is null
      and (x.claimed_until is null or x.claimed_until <= now())
    order by x.created_at
    limit p_limit
    for update skip locked
  )
  update public.security_actions a
     set claimed_until = now() + interval '5 minutes'
    from claimed
   where a.id = claimed.id
  returning a.*;
end $$;

-- ownership and grants restated for the replaced object.
alter function hc.claim_security_actions(integer) owner to hc_internal;
revoke execute on function hc.claim_security_actions(integer)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.claim_security_actions(integer) to hc_pipeline;
