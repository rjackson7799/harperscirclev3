-- ============================================================================
-- 1C · M5 — publication (TSD §4.5): the transition gates the write.
--
-- hc_pipeline holds NO direct DML on extractions or proposals (M1 granted
-- it nothing); it gets EXECUTE on hc.finalize_extraction and
-- hc.finalize_interpretation instead — the same move §3.7 makes for the
-- record tables, one layer down. A cancellation that wins the transition
-- means the facts were never written, rather than written and orphaned.
--
-- hc.draft_proposal is the ONE drafting path (owner-only; write_proposals
-- loops it, M6's create_manual_proposal calls it once). The 1C drafting
-- contract (APR-03/APR-09): drafted taint = own_domain ∪ parents' CURRENT
-- taints AT DRAFT — approve_proposal refuses post-draft parent growth with
-- proposal_taint_changed, and this machinery models that contract rather
-- than fighting it.
--
-- P5 caps (ADR-0006): facts ≤ 200/publication, fact value ≤ 8 KB, field ≤
-- 120 chars; proposals ≤ 50/publication, payload ≤ 64 KB (object only),
-- parents ≤ 20 (each resolving in-circle in-subject), source extraction
-- ids ≤ 200 and belonging to THIS arrival, anomaly_flags ≤ 20. Normalized
-- refusals: extraction_invalid / proposal_invalid — input-syntax shapes on
-- an owner-only path, not DEF-10 oracles.
--
-- hc.cancel_arrival (§4.5): any member who can approve — manage across the
-- arrival's fail-closed all-domain taint (ADR-0007). Order per the Q5
-- ruling: row lock → freeze (named freeze_active) → authorization
-- (cancel_refused, one shape with nonexistent) → state (cancel_invalid_
-- state, post-authorization). R-rule lock before the row lock.
-- ============================================================================

-- write_proposals / create_manual_proposal insert drafts as hc_internal.
grant insert on public.proposals to hc_internal;
create policy proposals_internal_draft on public.proposals
  for insert to hc_internal with check (true);

-- ----------------------------------------------------------------------------
-- The one drafting path.
-- ----------------------------------------------------------------------------
create function hc.draft_proposal(
  p_arrival uuid, p_circle uuid, p_subject uuid,
  p_kind hc.proposal_kind, p_payload jsonb)
returns uuid language plpgsql
set search_path = ''
as $$
declare
  v_id      uuid;
  v_parents jsonb;
  v_parent  jsonb;
  v_pr      record;
  v_taint   hc.domain[] := '{}'::hc.domain[];
  v_own     hc.domain;
  v_obj     hc.object_type;
  v_srcs    uuid[];
  v_flags   text[];
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 65536 then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  v_parents := coalesce(p_payload -> 'parents', '[]'::jsonb);
  if jsonb_typeof(v_parents) <> 'array'
     or jsonb_array_length(v_parents) > 20 then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  -- parents resolve in THIS circle and subject; their CURRENT taints join
  -- the draft (the drafting contract's parents-at-draft half)
  for v_parent in select * from jsonb_array_elements(v_parents) loop
    select * into v_pr from hc.resolve_object(
      (v_parent ->> 'type')::hc.object_type, (v_parent ->> 'id')::uuid);
    if v_pr.circle_id is null or v_pr.circle_id <> p_circle
       or v_pr.subject_id <> p_subject then
      raise exception 'proposal_invalid' using errcode = 'P0001';
    end if;
    v_taint := hc.taint_union(v_taint, v_pr.taint);
  end loop;

  if p_kind = 'conflict' then
    -- a conflict quotes existing facts: it must carry parents, and its
    -- taint is their union — invisible below BOTH (A.4)
    if jsonb_array_length(v_parents) = 0 then
      raise exception 'proposal_invalid' using errcode = 'P0001';
    end if;
  else
    v_obj := case p_kind::text
      when 'document' then 'document'::hc.object_type
      when 'task' then 'task'
      when 'timeline_event' then 'timeline_event'
      when 'profile_fact' then 'profile_fact'
      when 'episode' then 'episode'
      else null end;
    if v_obj is null
       or (p_kind = 'profile_fact' and p_payload ->> 'domain' is null) then
      raise exception 'proposal_invalid' using errcode = 'P0001';
    end if;
    v_own := hc.own_domain(v_obj,
                           (p_payload ->> 'category')::hc.doc_category,
                           (p_payload ->> 'kind')::hc.timeline_kind,
                           (p_payload ->> 'domain')::hc.domain);
    v_taint := hc.taint_union(array[v_own]::hc.domain[], v_taint);
  end if;

  if p_payload ->> 'risk_class' is not null
     and p_payload ->> 'risk_class' not in ('standard', 'high') then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  -- cited extractions must exist and belong to THIS arrival
  select coalesce(array_agg((s.v)::uuid), '{}'::uuid[]) into v_srcs
    from jsonb_array_elements_text(coalesce(p_payload -> 'source_extraction_ids', '[]'::jsonb)) s(v);
  if array_length(v_srcs, 1) > 200 then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_srcs) u(id)
             where not exists (select 1 from public.extractions e
                               where e.id = u.id and e.arrival_id = p_arrival)) then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(f.v), '{}'::text[]) into v_flags
    from jsonb_array_elements_text(coalesce(p_payload -> 'anomaly_flags', '[]'::jsonb)) f(v);
  if array_length(v_flags, 1) > 20 then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  insert into public.proposals
    (arrival_id, circle_id, subject_id, kind, payload,
     source_extraction_ids, taint, anomaly_flags)
  values
    (p_arrival, p_circle, p_subject, p_kind, p_payload,
     v_srcs, v_taint, v_flags)
  returning id into v_id;

  return v_id;
end $$;

alter function hc.draft_proposal(uuid, uuid, uuid, hc.proposal_kind, jsonb)
  owner to hc_internal;
revoke execute on function hc.draft_proposal(uuid, uuid, uuid, hc.proposal_kind, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- §4.5 write halves — owner-only, reachable ONLY through the finalizers.
-- p_lease is carried for the §4.5 signature; the fence already ran in the
-- same transaction's advance, and a lost CAS means these never execute.
-- ----------------------------------------------------------------------------
create function hc.write_extractions(p_arrival uuid, p_lease uuid, p_facts jsonb)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_circle uuid; v_subject uuid; v_fact jsonb;
begin
  if p_facts is null or jsonb_typeof(p_facts) <> 'array'
     or jsonb_array_length(p_facts) > 200 then
    raise exception 'extraction_invalid' using errcode = 'P0001';
  end if;

  -- the lease must be THIS arrival's — never accepted-and-ignored (the F6
  -- posture). The fence itself already ran in this transaction's advance.
  if not exists (select 1 from public.pipeline_leases l
                 where l.id = p_lease and l.arrival_id = p_arrival) then
    raise exception 'extraction_invalid' using errcode = 'P0001';
  end if;

  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  for v_fact in select * from jsonb_array_elements(p_facts) loop
    if jsonb_typeof(v_fact) <> 'object'
       or length(coalesce(v_fact ->> 'field', '')) not between 1 and 120
       or v_fact -> 'value' is null
       or pg_column_size(v_fact -> 'value') > 8192
       or not (coalesce(v_fact -> 'citation', '{}'::jsonb) ? 'page'
               or coalesce(v_fact -> 'citation', '{}'::jsonb) ? 'offset'
               or coalesce(v_fact -> 'citation', '{}'::jsonb) ? 't')
       or pg_column_size(coalesce(v_fact -> 'citation', '{}'::jsonb)) > 4096
       or length(coalesce(v_fact ->> 'model_id', '')) not between 1 and 200
       or length(coalesce(v_fact ->> 'prompt_version', '')) not between 1 and 200 then
      raise exception 'extraction_invalid' using errcode = 'P0001';
    end if;
    insert into public.extractions
      (arrival_id, circle_id, subject_id, field, value, confidence,
       risk_class, citation, model_id, prompt_version)
    values
      (p_arrival, v_circle, v_subject,
       v_fact ->> 'field', v_fact -> 'value',
       (v_fact ->> 'confidence')::numeric(4,3),
       (v_fact ->> 'risk_class')::hc.risk_class,
       v_fact -> 'citation',
       v_fact ->> 'model_id', v_fact ->> 'prompt_version');
  end loop;
end $$;

alter function hc.write_extractions(uuid, uuid, jsonb) owner to hc_internal;
revoke execute on function hc.write_extractions(uuid, uuid, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

create function hc.write_proposals(p_arrival uuid, p_lease uuid, p_proposals jsonb)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_circle uuid; v_subject uuid; v_prop jsonb;
begin
  if p_proposals is null or jsonb_typeof(p_proposals) <> 'array'
     or jsonb_array_length(p_proposals) > 50 then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  -- the lease must be THIS arrival's — never accepted-and-ignored (F6).
  if not exists (select 1 from public.pipeline_leases l
                 where l.id = p_lease and l.arrival_id = p_arrival) then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  for v_prop in select * from jsonb_array_elements(p_proposals) loop
    if jsonb_typeof(v_prop) <> 'object' or v_prop -> 'payload' is null then
      raise exception 'proposal_invalid' using errcode = 'P0001';
    end if;
    perform hc.draft_proposal(p_arrival, v_circle, v_subject,
                              (v_prop ->> 'kind')::hc.proposal_kind,
                              -- top-level source_extraction_ids joins the payload
                              (v_prop -> 'payload')
                                || case when v_prop ? 'source_extraction_ids'
                                        then jsonb_build_object('source_extraction_ids',
                                                                v_prop -> 'source_extraction_ids')
                                        else '{}'::jsonb end);
  end loop;
end $$;

alter function hc.write_proposals(uuid, uuid, jsonb) owner to hc_internal;
revoke execute on function hc.write_proposals(uuid, uuid, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- §4.5 verbatim: the conditional transition runs FIRST, in this transaction.
-- ----------------------------------------------------------------------------
create function hc.finalize_extraction(
  p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare v hc.advance_result;
begin
  v := hc.advance_arrival(p_arrival, 'extracting', 'extracted', p_lease);
  if v <> 'advanced' then
    return v;                    -- cancelled / frozen / already: nothing below runs
  end if;
  -- Reached only on a won transition; commits with it or not at all.
  perform hc.write_extractions(p_arrival, p_lease, coalesce(p_facts, '[]'::jsonb));
  perform hc.write_proposals(p_arrival, p_lease, coalesce(p_proposals, '[]'::jsonb));
  return 'advanced'::hc.advance_result;
end $$;

alter function hc.finalize_extraction(uuid, uuid, jsonb, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb) to hc_pipeline;

-- The same gate, one stage later (§4.3 interpret: interpreting →
-- proposals_ready). Named in ADR-0007; the TSD shows only the extract-stage
-- finalizer and states the one-transaction principle generically.
create function hc.finalize_interpretation(
  p_arrival uuid, p_lease uuid, p_proposals jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare v hc.advance_result;
begin
  v := hc.advance_arrival(p_arrival, 'interpreting', 'proposals_ready', p_lease);
  if v <> 'advanced' then
    return v;
  end if;
  perform hc.write_proposals(p_arrival, p_lease, coalesce(p_proposals, '[]'::jsonb));
  return 'advanced'::hc.advance_result;
end $$;

alter function hc.finalize_interpretation(uuid, uuid, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_interpretation(uuid, uuid, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_interpretation(uuid, uuid, jsonb) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- §4.5 cancellation: a first-class transition, available to any member who
-- can approve.
-- ----------------------------------------------------------------------------
create function hc.cancel_arrival(p_arrival uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_circle uuid; v_subject uuid; v_state hc.arrival_state;
  v_current uuid; v_frozen boolean; v_attempt int;
begin
  if v_actor is null then
    raise exception 'cancel_refused' using errcode = 'P0001';
  end if;

  select a.circle_id into v_circle from public.arrivals a where a.id = p_arrival;
  if v_circle is null then
    raise exception 'cancel_refused' using errcode = 'P0001';
  end if;
  -- R-rule: the per-circle lock before the row lock; freeze and
  -- authorization evaluate under the serialization point.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  select a.subject_id, a.state, a.current_lease_id,
         hc.circle_frozen(a.circle_id, a.subject_id)
    into v_subject, v_state, v_current, v_frozen
    from public.arrivals a where a.id = p_arrival for update;

  -- Freeze first (the Q5 order): the named signature is not swallowed.
  if v_frozen then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- Who can approve can cancel: manage across the arrival's fail-closed
  -- all-domain taint (ADR-0007 — pipeline material is unclassified until
  -- approved into the record).
  if hc.visible_at(hc.ctx(), v_subject, hc.all_domains(), true,
                   'arrival', p_arrival, null) < 'manage' then
    raise exception 'cancel_refused' using errcode = 'P0001';
  end if;

  -- extracted sits between the extract and interpret stages; a member's
  -- cancellation window must not depend on queue timing (ADR-0007).
  if v_state not in ('extracting', 'extracted', 'interpreting') then
    raise exception 'cancel_invalid_state' using errcode = 'P0001';
  end if;

  update public.arrivals
     set state = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_arrival;

  select l.attempt_no into v_attempt
    from public.pipeline_leases l where l.id = v_current;

  insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                     reason_code, attempt)
  values (p_arrival, v_circle, v_state, 'cancelled',
          'cancelled_by_member', coalesce(v_attempt, 1));

  update public.pipeline_leases
     set outcome = 'cancelled', closed_at = now()
   where id = v_current and closed_at is null;

  return jsonb_build_object('arrival_id', p_arrival, 'state', 'cancelled');
end $$;

alter function hc.cancel_arrival(uuid) owner to hc_internal;
revoke execute on function hc.cancel_arrival(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.cancel_arrival(uuid) to authenticated;
