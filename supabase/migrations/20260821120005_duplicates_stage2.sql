-- ============================================================================
-- 5A · M5 — stage-2 duplicates (docs/review/slice-5-plan.md M5; TSD §4.7
-- point 2; PRD §8.9; ADR-0017 D8; ADR-0018's recorded stage-2
-- obligation; Q8 SETTLED). The enum value itself landed at the tail of
-- 20260821120004 (the ADR-0002 note-5 rule: a new enum value is usable
-- only one migration later); every USE lands here.
--
-- THE STATE (Q8): 'duplicate_suspected_stage2' — a DISTINCT internal
-- state for post-extract suspects. Family label stays 'Looks like a
-- duplicate'; its own state_rank row sits with the human-wait states
-- BELOW the worker states, so a waiting question surfaces in the parent
-- rollup. The graph gains exactly three edges — extracting → <state>
-- and <state> → interpreting | nothing_filed — so a stage-1 suspect
-- resuming toward interpret is GRAPH-illegal, not merely machinery-
-- refused (ING-10's closed-graph philosophy; the 27/046/048 pins
-- re-pin in this commit).
--
-- THE MATCHING CONTRACT (settled at the gate, not here): candidates are
-- the SAME CIRCLE and SAME SUBJECT's filed, current documents
-- (deleted_at is null); the predicate is normalised equality on
-- document type + date + at least one corroborating field (provider /
-- amount / policy number), every contributing field PRESENT on both
-- sides — ABSENCE NEVER WILDCARDS; exact-after-normalisation
-- (lower(btrim(·)) over the scalar text — tolerance windows are a
-- BGT-01-style provisional revision by migration, never silent);
-- candidate selection deterministic — the most-recently-filed match
-- wins, ties on id; ONE suspect references ONE canonical target
-- (arrivals.duplicate_of_document_id). The canonical key-field names —
-- 'document_date', 'provider', 'amount', 'policy_number' — are part of
-- this contract: B4's extraction schema emits them and the G9 corpus
-- labels them. The arrival side reads the PUBLICATION PAYLOADS (this
-- transaction's facts + the drafted document proposal's category); the
-- candidate side reads the filed document's own arrival's LIVE
-- extractions — normalised SQL over approved extraction values,
-- deterministic and pgTAP-provable. The §6.1 model-assisted comparison
-- stays a recorded G9-calibrated future refinement.
--
-- DETECTION runs inside hc.finalize_extraction's transaction on
-- successful publication (the D8 stage-1-in-finalize_scan precedent):
-- the work answer still lands IN FULL — facts, proposals, and a
-- PUBLISHED run (the close trigger learns the new success exit) — the
-- duplicate question is held by STATE.
--
-- THE TWO HUMAN RESOLUTIONS (hc.resolve_duplicate gains its stage-2
-- arm; the stage-1 arms are verbatim): 'different' resumes to interpret
-- via a real lease + the CAS + an outbox re-queue (the SND-02/D8
-- pattern); 'same_thing' attaches the arrival to the matched document
-- as an ADDITIONAL SOURCE — the document now cites both — and files
-- nothing new (ADR-0017 D8's refinement lands). Never auto-discarded,
-- in either direction. The edge is inserted directly rather than
-- through hc.link_provenance, deliberately: link_provenance restricts
-- endpoints to record types and propagates taint GROWTH, and the
-- attested second copy of an already-filed document carries no new
-- information class — the edge records citation provenance, not an
-- audience change. The canonical-target pointer is retained after
-- resolution as the trace of the question that was asked.
-- ============================================================================

insert into hc.arrival_transitions (stage, from_state, to_state) values
  ('extract', 'extracting',                 'duplicate_suspected_stage2'),
  ('gate',    'duplicate_suspected_stage2', 'interpreting'),
  ('gate',    'duplicate_suspected_stage2', 'nothing_filed');

insert into hc.reason_codes (code, description) values
  ('duplicate_same_thing_attached', 'The member confirmed the same document; attached to the filed original as an additional source — nothing new filed');

alter table public.arrivals
  add column duplicate_of_document_id uuid,
  add foreign key (circle_id, duplicate_of_document_id)
    references public.documents (circle_id, id);
create index arrivals_by_duplicate_of_document
  on public.arrivals (duplicate_of_document_id);

-- ----------------------------------------------------------------------------
-- The detector — owner-only, non-definer (the detect_duplicate/write-
-- halves pattern): reachable ONLY from inside finalize_extraction,
-- already running as hc_internal. Returns the canonical document id, or
-- null.
-- ----------------------------------------------------------------------------
create function hc.detect_stage2_duplicate(
  p_arrival uuid, p_circle uuid, p_subject uuid, p_facts jsonb, p_proposals jsonb)
returns uuid
language sql stable
set search_path = ''
as $$
  with me as (
    select
      (select lower(btrim(f.value -> 'value' #>> '{}'))
       from jsonb_array_elements(p_facts) f
       where f.value ->> 'field' = 'document_date' limit 1) as ddate,
      (select lower(btrim(f.value -> 'value' #>> '{}'))
       from jsonb_array_elements(p_facts) f
       where f.value ->> 'field' = 'provider' limit 1) as prov,
      (select lower(btrim(f.value -> 'value' #>> '{}'))
       from jsonb_array_elements(p_facts) f
       where f.value ->> 'field' = 'amount' limit 1) as amt,
      (select lower(btrim(f.value -> 'value' #>> '{}'))
       from jsonb_array_elements(p_facts) f
       where f.value ->> 'field' = 'policy_number' limit 1) as pol,
      (select p.value -> 'payload' ->> 'category'
       from jsonb_array_elements(p_proposals) p
       where p.value ->> 'kind' = 'document'
         and p.value -> 'payload' ? 'category' limit 1) as cat
  )
  select d.id
  from me, public.documents d
  where me.cat is not null                  -- type PRESENT on the arrival side
    and me.ddate is not null                -- date PRESENT on the arrival side
    and d.circle_id = p_circle and d.subject_id = p_subject
    and d.deleted_at is null
    and d.artifact_arrival_id <> p_arrival  -- a re-run never matches itself
    and d.category::text = me.cat           -- type equal
    and exists (                            -- date PRESENT on the candidate AND equal
      select 1 from public.extractions e
      where e.arrival_id = d.artifact_arrival_id
        and e.superseded_at is null and e.field = 'document_date'
        and lower(btrim(e.value #>> '{}')) = me.ddate)
    and exists (                            -- ≥1 corroborating pair, PRESENT both sides
      select 1
      from (values ('provider', me.prov), ('amount', me.amt),
                   ('policy_number', me.pol)) c(f, v)
      join public.extractions e
        on e.arrival_id = d.artifact_arrival_id
       and e.superseded_at is null and e.field = c.f
      where c.v is not null
        and lower(btrim(e.value #>> '{}')) = c.v)
  order by d.filed_at desc, d.id desc       -- most-recently-filed, ties on id
  limit 1;
$$;

alter function hc.detect_stage2_duplicate(uuid, uuid, uuid, jsonb, jsonb)
  owner to hc_internal;
revoke execute on function hc.detect_stage2_duplicate(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.finalize_extraction — body as M3 left it, with the detection asked
-- of the publication payloads BEFORE the CAS chooses the exit. The work
-- answer lands in full either way.
-- ----------------------------------------------------------------------------
create or replace function hc.finalize_extraction(
  p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_circle uuid; v_subject uuid;
  v_dup uuid;
  v_to hc.arrival_state := 'extracted'::hc.arrival_state;
  v_reason text;
begin
  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  v_dup := hc.detect_stage2_duplicate(p_arrival, v_circle, v_subject,
                                      coalesce(p_facts, '[]'::jsonb),
                                      coalesce(p_proposals, '[]'::jsonb));
  if v_dup is not null then
    v_to := 'duplicate_suspected_stage2'::hc.arrival_state;
    v_reason := 'duplicate_key_fields';
  end if;

  v := hc.advance_arrival(p_arrival, 'extracting', v_to, p_lease, v_reason);
  if v <> 'advanced' then
    return v;                    -- cancelled / frozen / already: nothing below runs
  end if;
  -- Reached only on a won transition; commits with it or not at all.
  if v_dup is not null then
    update public.arrivals set duplicate_of_document_id = v_dup
     where id = p_arrival;
  end if;
  perform hc.write_extractions(p_arrival, p_lease, coalesce(p_facts, '[]'::jsonb));
  perform hc.write_proposals(p_arrival, p_lease, coalesce(p_proposals, '[]'::jsonb));
  return 'advanced'::hc.advance_result;
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way).
alter function hc.finalize_extraction(uuid, uuid, jsonb, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- The run trigger learns the second SUCCESS exit: a suspect publication
-- is a successful extraction, not a failure class.
-- ----------------------------------------------------------------------------
create or replace function hc.close_extraction_run() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_state hc.arrival_state;
begin
  if new.closed_at is null or old.closed_at is not null then
    return new;
  end if;
  if not exists (select 1 from public.extraction_runs r
                 where r.lease_id = new.id and r.closed_at is null) then
    return new;   -- not an extract lease, or already closed
  end if;

  -- On 'advanced' the arrivals row was updated (and its event inserted)
  -- earlier in THIS transaction, under the same row lock — the state read
  -- here is the transition's to_state.
  select a.state into v_state from public.arrivals a where a.id = new.arrival_id;

  update public.extraction_runs r
     set closed_at = new.closed_at,
         outcome = case
           when new.outcome = 'advanced'
                and v_state in ('extracted'::hc.arrival_state,
                                'duplicate_suspected_stage2'::hc.arrival_state)
             then 'published'
           when new.outcome = 'advanced' then 'terminalized'
           when new.outcome = 'expired'  then 'abandoned'
           when new.outcome = 'cancelled' then 'cancelled'
           when new.outcome = 'failed'   then 'failed'
           when new.outcome = 'frozen'   then 'frozen'
           else 'terminalized' end,
         reason_code = case
           when new.outcome = 'advanced'
                and v_state not in ('extracted'::hc.arrival_state,
                                    'duplicate_suspected_stage2'::hc.arrival_state) then
             (select e.reason_code from public.arrival_events e
              where e.arrival_id = new.arrival_id
                and e.attempt = new.attempt_no
                and e.from_state = 'extracting'::hc.arrival_state
                and e.to_state = v_state
              order by e.occurred_at desc
              limit 1)
           else null end
   where r.lease_id = new.id and r.closed_at is null;

  return new;
end $$;
alter function hc.close_extraction_run() owner to hc_internal;

-- ----------------------------------------------------------------------------
-- hc.resolve_duplicate — the member surface gains its stage-2 arm; the
-- stage-1 arms are verbatim (4A M6). One function, one authority shape,
-- two suspect states.
-- ----------------------------------------------------------------------------
create or replace function hc.resolve_duplicate(p_arrival uuid, p_resolution text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_circle uuid; v_subject uuid; v_state hc.arrival_state;
  v_frozen boolean; v_doc uuid;
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
         hc.circle_frozen(a.circle_id, a.subject_id), a.duplicate_of_document_id
    into v_subject, v_state, v_frozen, v_doc
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
  if v_state not in ('duplicate_suspected', 'duplicate_suspected_stage2') then
    raise exception 'resolve_invalid_state' using errcode = 'P0001';
  end if;

  -- A real lease + the CAS edge (the SND-02 release precedent).
  select coalesce(max(l.attempt_no), 0) + 1 into v_attempt
    from public.pipeline_leases l where l.arrival_id = p_arrival;
  insert into public.pipeline_leases
    (arrival_id, circle_id, stage, attempt_no, deadline)
  values (p_arrival, v_circle, 'gate', v_attempt, now() + interval '60 seconds')
  returning id into v_lease;
  update public.arrivals set current_lease_id = v_lease where id = p_arrival;

  if v_state = 'duplicate_suspected' then
    -- Stage 1 (4A M6, verbatim): different resumes to the GATE.
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
  else
    -- 5A M5: stage 2 — different resumes to INTERPRET (the record-aware
    -- pass never ran; the facts are published and waiting).
    if p_resolution = 'different' then
      v := hc.advance_arrival(p_arrival, 'duplicate_suspected_stage2', 'interpreting',
                              v_lease, 'duplicate_resolved_different');
      if v <> 'advanced' then
        raise exception 'resolve_refused' using errcode = 'P0001';
      end if;
      insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
      values (v_circle, p_arrival, 'duplicate_resolved_different');
    else
      -- ADR-0017 D8's refinement: attach as an ADDITIONAL SOURCE and file
      -- nothing new. A suspect without its canonical target is a defect.
      if v_doc is null then
        raise exception 'resolve_refused' using errcode = 'P0001';
      end if;
      v := hc.advance_arrival(p_arrival, 'duplicate_suspected_stage2', 'nothing_filed',
                              v_lease, 'duplicate_same_thing_attached');
      if v <> 'advanced' then
        raise exception 'resolve_refused' using errcode = 'P0001';
      end if;
      -- Direct edge, deliberately (see header): the attested second copy
      -- of an already-filed document carries no new information class —
      -- provenance is recorded, the audience does not change.
      insert into public.provenance_edges
        (circle_id, child_type, child_id, parent_type, parent_id)
      values (v_circle, 'document'::hc.object_type, v_doc,
              'arrival'::hc.object_type, p_arrival)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object('arrival_id', p_arrival, 'resolution', p_resolution);
end $$;

-- ownership and grants restated for the replaced object.
alter function hc.resolve_duplicate(uuid, text) owner to hc_internal;
revoke execute on function hc.resolve_duplicate(uuid, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.resolve_duplicate(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- state_rank / state_label — TOTAL over the 22 states (the 046 guard
-- extends). The suspect ranks with the human-wait states, below the
-- worker states, so a waiting question surfaces in the parent rollup;
-- the ranks above it shift by one (nothing stores a rank durably — the
-- 046 pins re-pin in this commit). The family label is stage 1's,
-- verbatim: the distinction is internal (Q8).
-- ----------------------------------------------------------------------------
create or replace function hc.state_rank(p hc.arrival_state) returns int
language sql immutable parallel safe as $$
  select case p
    when 'store_failed'               then 1
    when 'received'                   then 2
    when 'quarantined'                then 3
    when 'scan_unavailable'           then 4
    when 'scan_inconclusive'          then 5
    when 'stored'                     then 6
    when 'scanning'                   then 7
    when 'held_unknown_sender'        then 8
    when 'scanned'                    then 9
    when 'unsupported_type'           then 10
    when 'needs_password'             then 11
    when 'extract_timeout'            then 12
    when 'extract_failed'             then 13
    when 'duplicate_suspected'        then 14
    when 'duplicate_suspected_stage2' then 15
    when 'extracting'                 then 16
    when 'extracted'                  then 17
    when 'interpreting'               then 18
    when 'proposals_ready'            then 19
    when 'nothing_filed'              then 20
    when 'filed'                      then 21
    when 'cancelled'                  then 22
  end;
$$;

create or replace function hc.state_label(p hc.arrival_state) returns text
language sql immutable parallel safe as $$
  select case p
    when 'received'                   then 'Checking'
    when 'stored'                     then 'Checking'
    when 'scanning'                   then 'Checking'
    when 'store_failed'               then 'Couldn''t store it'
    when 'quarantined'                then 'Held · not safe to open'
    when 'scan_unavailable'           then 'Held · we couldn''t check it'
    when 'scan_inconclusive'          then 'Held · we couldn''t check it'
    when 'scanned'                    then 'Arrived'
    when 'held_unknown_sender'        then 'Held · unknown sender'
    when 'unsupported_type'           then 'Unsupported file'
    when 'needs_password'             then 'Needs a password'
    when 'extract_timeout'            then 'Couldn''t read it'
    when 'extract_failed'             then 'Couldn''t read it'
    when 'duplicate_suspected'        then 'Looks like a duplicate'
    when 'duplicate_suspected_stage2' then 'Looks like a duplicate'
    when 'extracting'                 then 'Reading'
    when 'extracted'                  then 'Reading'
    when 'interpreting'               then 'Reading'
    when 'proposals_ready'            then 'Needs you'
    when 'nothing_filed'              then 'Nothing filed'
    when 'filed'                      then 'Filed'
    when 'cancelled'                  then 'Cancelled'
  end;
$$;

-- ownership and grants restated for the replaced objects (046's shape).
alter function hc.state_rank(hc.arrival_state)  owner to hc_internal;
alter function hc.state_label(hc.arrival_state) owner to hc_internal;
revoke execute on function hc.state_rank(hc.arrival_state)
  from public, anon, hc_pipeline, hc_admin;
revoke execute on function hc.state_label(hc.arrival_state)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.state_rank(hc.arrival_state)  to authenticated;
grant execute on function hc.state_label(hc.arrival_state) to authenticated;
