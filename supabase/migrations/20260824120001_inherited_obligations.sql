-- ============================================================================
-- 6A · M1 — the inherited-obligations batch, landing FIRST (the R8 / 5A M1
-- precedent: owner-queue DB items land before slice-proper work).
-- docs/review/slice-6-plan.md M1; ADR-0023 R4/F-12, R4/F-10. Pinned by
-- pgTAP 059, which went red before this existed (10 of 13).
--
-- NO SHIPPED MIGRATION IS EDITED. Two functions are replaced forward, each
-- with its ownership and grants restated for the replaced object (the 2A M8
-- way), and each body is the SHIPPED body with one guard added — extracted
-- from source rather than retyped, so the diff is the guard and nothing else.
--
-- ---------------------------------------------------------------------------
-- R4/F-12 — "A profile_fact with field: null is drafted and raises 23502 at
-- approval — a raw Postgres error at the moment a person clicks approve.
-- Guard where domain is already guarded."
--
-- WHERE DOMAIN IS ALREADY GUARDED is a real place, and there are two of them:
-- hc.draft_proposal:94 refuses a profile_fact whose payload carries no
-- `domain`, and hc.own_domain is fail-closed on `category` and `kind` inside
-- hc.approve_proposal's taint arithmetic. Neither guards anything else about
-- the payload's ability to satisfy the columns it is about to be written to.
-- So M1 takes BOTH branches of the plan's own sentence — "it becomes a
-- drafted proposal that is refused honestly, OR is not drafted":
--
--   1 · DRAFT TIME. `field` and `value` join `domain` in the guard that
--       already stands there, scoped exactly as that guard is scoped. The
--       unapprovable item is never drafted, so nobody is ever shown one.
--       This is the R4/F-3 precedent — a conflict with no domain is DROPPED
--       rather than drafted un-approvable.
--
--   2 · APPROVE TIME. The whole 23502 class refuses in the existing DEF-10
--       `approval_refused` shape. This half is the one that matters for rows
--       that were ALREADY drafted when the guard shipped, and it is the one
--       that makes the plan's stated property true.
--
-- THE SCOPE IS WIDER THAN THE FINDING'S LETTER, DELIBERATELY, AND HERE IS THE
-- ARGUMENT. The plan states the property as a class — "so 23502 can never
-- surface as a raw Postgres error at the moment a person clicks approve" —
-- and a class is not one column of one kind. Enumerated against
-- information_schema rather than guessed, SEVEN payload-derived columns are
-- NOT NULL, defaultless and unguarded between the payload and the insert:
--
--     profile_facts.field · profile_facts.value · profile_facts.risk_class
--     documents.title · tasks.title · timeline_events.summary · episodes.title
--
-- Guarding one and shipping six is the half-fix this project's rounds exist
-- to catch. THE WIDER GUARD IS NON-BREAKING BY CONSTRUCTION, which is why it
-- fits inside a MINOR finding's slot: every payload it refuses is a payload
-- that would have raised 23502 a few statements later. Nothing that succeeds
-- today changes, and 059 cases 3 and 11 — both PASSING ON MAIN — are the
-- controls that pin it.
--
-- ONE ADJACENT CLASS IS NAMED AND NOT TAKEN. timeline_events.temporal_shape
-- is a CHECK, so a timeline_event payload with neither `occurred_on` nor
-- `local_at` raises 23514, not 23502 — a different code, a different class,
-- and not what this finding is about. It is recorded here and carried to
-- round 17 rather than folded in silently.
--
-- ---------------------------------------------------------------------------
-- R4/F-10 — RECORDED, AND NOT TAKEN AT THIS LAYER. The finding: "A stage-2
-- duplicate always yields a silent invalid_state at interpret, which §4.2
-- says means 'raise a defect signal'. processGate warns; processInterpret
-- returns it silently. MAKE IT A WARN, OR ABSORB IT EXPLICITLY."
--
-- The plan assigns it M1 + B3. There is no DB half that does not contradict
-- a deliberate shipped pin: pgTAP 055:453-456 already asserts that exact
-- call and argues the verdict in its own message — "a stage-2 suspect cannot
-- be CLAIMED toward interpret — the wait is the machinery's answer, not a
-- queue accident". Absorbing it in hc.claim_stage would turn that pin red
-- and would say the opposite of what 5A settled.
--
-- So M1 takes the finding's OTHER remedy — "make it a warn" — which is
-- processGate's shape applied to processInterpret, and that is app-layer: it
-- lands wholly at 6B B3. 059 case 13 pins the DB behaviour as UNCHANGED so
-- the decision is visible in the suite rather than only in a document, and
-- round 17 is asked to confirm it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · hc.draft_proposal — the draft-time half. Body as 1C M5 wrote it, with
--     `field` and `value` added to the guard that already refuses a
--     domainless profile_fact.
-- ----------------------------------------------------------------------------

create or replace function hc.draft_proposal(
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
    -- 6A M1 (ADR-0023 R4/F-12): `field` and `value` join `domain` in the
    -- one guard that already stands here. profile_facts.field and .value
    -- are both NOT NULL, so a payload missing either drafted cleanly, sat
    -- in the Care Inbox looking like every other item, and raised 23502 at
    -- the moment a person clicked approve. It is not drafted now — the
    -- plan's second branch, and the R4/F-3 precedent (a conflict with no
    -- domain is DROPPED rather than drafted un-approvable).
    if v_obj is null
       or (p_kind = 'profile_fact'
           and (p_payload ->> 'domain' is null
                or p_payload ->> 'field' is null
                or p_payload -> 'value' is null)) then
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

-- ownership and grants restated for the replaced object (the 2A M8 way).
-- hc.draft_proposal is owner-only: reachable through the finalizers alone.
alter function hc.draft_proposal(uuid, uuid, uuid, hc.proposal_kind, jsonb)
  owner to hc_internal;
revoke execute on function hc.draft_proposal(uuid, uuid, uuid, hc.proposal_kind, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- 2 · hc.approve_proposal — the approve-time half. Body as 5A M4 left it
--     (20260821120004), with ONE guard added in the non-conflict arm: the
--     payload must be able to satisfy its destination's NOT NULL columns.
--     The conflict arm already guards its own three (field, value, domain
--     for use_new; the task block for keep_both) and is untouched here.
-- ----------------------------------------------------------------------------

create or replace function hc.approve_proposal(
  p_proposal_id uuid, p_expected_version int, p_idempotency_key text,
  p_edits jsonb default null, p_step_up_token text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor    uuid := hc.uid();
  v_actor_name text;
  v_prop     record;
  v_existing record;
  v_ctx      jsonb;
  v_payload  jsonb;
  v_parents  jsonb;
  v_parent   jsonb;
  v_ptaint   hc.domain[] := '{}'::hc.domain[];
  v_pr       record;
  v_own      hc.domain;
  v_own_arr  hc.domain[];
  v_taint    hc.domain[];
  v_obj_type hc.object_type;
  v_obj_id   uuid := gen_random_uuid();
  v_source   uuid;
  v_old_pf   uuid;
  v_status   text;
  v_outcome  text;
  v_task     jsonb;
  v_result   jsonb;
begin
  if v_actor is null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 2A M2 (was ROUND-6 F6): §5.7's real binding. What is presented is
  -- validated — operation- and target-bound to THIS proposal, this actor,
  -- live, unconsumed — never ignored. Null stays valid: approval is not on
  -- §5.7's required list; it validates step-up when a client presents one.
  if p_step_up_token is not null
     and not hc.consume_step_up(p_step_up_token, 'approve_proposal',
                                p_proposal_id::text, v_actor) then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- ROUND-6 AB2: key bounds before any row is written.
  if p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 200 then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 5A-M4 (Q9): the chosen conflict outcome is part of the idempotency
  -- identity. Vocabulary checked before any row is written.
  v_outcome := p_edits ->> 'conflict_outcome';
  if v_outcome is not null
     and v_outcome not in ('use_new', 'keep', 'keep_both') then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 1 · Idempotency: claim the key. A replay returns the stored result —
  -- including the AC-INBOX-12 hard case, because an attempt that failed
  -- before commit left no row behind. ROUND-6 AB1: the replay is bound to
  -- the actor who claimed the key. 5A-M4: and to the claimed OUTCOME —
  -- the same key with a different outcome conflicts, writing nothing.
  begin
    insert into public.approval_attempts
      (idempotency_key, proposal_id, expected_version, actor_id, conflict_outcome)
    values (p_idempotency_key, p_proposal_id, p_expected_version, v_actor, v_outcome);
  exception
    when unique_violation then
      select * into v_existing from public.approval_attempts
        where idempotency_key = p_idempotency_key;
      if v_existing.proposal_id = p_proposal_id
         and v_existing.actor_id = v_actor
         and v_existing.conflict_outcome is not distinct from v_outcome
         and v_existing.result is not null then
        return v_existing.result;
      end if;
      raise exception 'approval_refused' using errcode = 'P0001';
    when foreign_key_violation then
      -- a nonexistent proposal fails the attempt row's FK: same shape as
      -- unauthorized, no existence oracle
      raise exception 'approval_refused' using errcode = 'P0001';
  end;

  -- Lock the proposal row; the proposal_commits PK is the cross-session
  -- serialiser, this is the in-flight one.
  select * into v_prop from public.proposals p
    where p.id = p_proposal_id
    for update;
  if v_prop.id is null or v_prop.status <> 'pending' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- Serialize with taint growth/shrink and freeze transitions in this
  -- circle (D6, R-rule) BEFORE any predicate binds. The proposal row lock
  -- above is not part of the taint discipline: advisory holders never
  -- wait on proposal rows, so the order cannot cycle.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_prop.circle_id::text));

  -- 4 · (ordered first — see M6 header) Refuse under ANY freeze covering
  -- the circle or subject: open is whole-circle by constraint; unresolved
  -- covers its named subject or the whole circle (FRZ-14). ROUND-6: this
  -- check now runs UNDER the lock, so a freeze that commits while the
  -- approval waits keeps its NAMED signature instead of falling through
  -- to the generic post-lock authorization refusal (concurrency case 5).
  if exists (select 1 from public.freezes f
             where f.circle_id = v_prop.circle_id
               and (f.state = 'open'
                    or (f.state = 'unresolved'
                        and (f.subject_id is null or f.subject_id = v_prop.subject_id)))) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- Apply edits (edited_approved) before anything reads the payload.
  v_payload := v_prop.payload || coalesce(p_edits -> 'fields', '{}'::jsonb);
  v_status  := case when p_edits ? 'fields' then 'edited_approved' else 'approved' end;

  if v_prop.kind = 'conflict'::hc.proposal_kind then
    -- 5A-M4: the conflict arm. The outcome is REQUIRED — the choice is
    -- the decision, and it is not optional.
    if v_outcome is null then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    -- Editing a value you are declining is incoherent — refused, never
    -- accepted-and-ignored (the F6 posture).
    if v_outcome = 'keep' and p_edits ? 'fields' then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    if v_outcome = 'use_new'
       and (length(coalesce(v_payload ->> 'field', '')) not between 1 and 120
            or v_payload -> 'value' is null
            or v_payload ->> 'domain' is null) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    v_task := v_payload -> 'task';
    if v_outcome = 'keep_both'
       and (v_task is null or jsonb_typeof(v_task) <> 'object'
            or length(coalesce(v_task ->> 'title', '')) not between 1 and 500
            or ((v_task ->> 'due_on') is null) <> ((v_task ->> 'due_zone') is null)) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    v_obj_type := case v_outcome
      when 'use_new'   then 'profile_fact'::hc.object_type
      when 'keep_both' then 'task'::hc.object_type
      else null end;                       -- keep writes NOTHING
  else
    -- 5A-M4: no kind borrows the identity it does not decide.
    if v_outcome is not null then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    v_obj_type := case v_prop.kind::text
      when 'document' then 'document'::hc.object_type
      when 'task' then 'task'
      when 'timeline_event' then 'timeline_event'
      when 'profile_fact' then 'profile_fact'
      when 'episode' then 'episode'
      else null
    end;
    if v_obj_type is null then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    -- 6A M1 (ADR-0023 R4/F-12): the payload must be able to satisfy its
    -- destination's NOT NULL columns. Guarded HERE, where hc.own_domain
    -- already fail-closes `category`, `kind` and a profile_fact's `domain`
    -- immediately below — so 23502 can never surface as a RAW POSTGRES
    -- ERROR at the moment a person clicks approve. The refusal rides the
    -- existing DEF-10 shape, so nothing new leaks.
    --
    -- Seven columns, enumerated against the catalog rather than guessed;
    -- the finding named one, and shipping one would have left six siblings.
    -- v_payload already carries p_edits.fields, so an edit that SUPPLIES a
    -- missing title makes the item approvable — which is §4.2.3's
    -- edit-before-approval, not a workaround.
    --
    -- A narrowing of CRASHES, never of approvals: every payload refused
    -- here would have raised 23502 a few statements later. pgTAP 059 cases
    -- 3 and 11 pin exactly that, and both pass on main.
    if (v_obj_type = 'profile_fact'::hc.object_type
        and (v_payload ->> 'field' is null
             or v_payload -> 'value' is null
             or v_payload ->> 'risk_class' is null))
       or (v_obj_type = 'document'::hc.object_type       and v_payload ->> 'title' is null)
       or (v_obj_type = 'task'::hc.object_type           and v_payload ->> 'title' is null)
       or (v_obj_type = 'episode'::hc.object_type        and v_payload ->> 'title' is null)
       or (v_obj_type = 'timeline_event'::hc.object_type and v_payload ->> 'summary' is null) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
  end if;

  -- 2 · Re-check authorization AT WRITE TIME on the D7 union: own domain ∪
  -- drafted taint ∪ parents' CURRENT taints. A grant lowered while the
  -- review screen sat open cannot be approved against. ROUND-6 AB3:
  -- duplicate payload parents collapse here (and at the edge loop below).
  v_parents := coalesce(v_payload -> 'parents', '[]'::jsonb);
  for v_parent in select distinct value from jsonb_array_elements(v_parents) loop
    select * into v_pr from hc.resolve_object(
      (v_parent ->> 'type')::hc.object_type, (v_parent ->> 'id')::uuid);
    if v_pr.circle_id is null or v_pr.circle_id <> v_prop.circle_id
       or v_pr.subject_id <> v_prop.subject_id then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    v_ptaint := hc.taint_union(v_ptaint, v_pr.taint);
  end loop;

  -- 5A-M4: a conflict's own domain is the DECLARED one (it writes a fact
  -- or, for keep_both, a task — whose own domain joins the union); the
  -- non-conflict math is unchanged.
  if v_prop.kind = 'conflict'::hc.proposal_kind then
    v_own_arr := case when v_payload ->> 'domain' is not null
                      then array[(v_payload ->> 'domain')::hc.domain]
                      else '{}'::hc.domain[] end;
    if v_outcome = 'keep_both' then
      v_own_arr := hc.taint_union(v_own_arr,
        array[hc.own_domain('task'::hc.object_type, null, null, null)]::hc.domain[]);
    end if;
  else
    v_own := hc.own_domain(v_obj_type,
                           (v_payload ->> 'category')::hc.doc_category,
                           (v_payload ->> 'kind')::hc.timeline_kind,
                           (v_payload ->> 'domain')::hc.domain);
    v_own_arr := array[v_own]::hc.domain[];
  end if;
  v_taint := hc.taint_union(v_own_arr,
                            hc.taint_union(v_prop.taint, v_ptaint));

  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_prop.subject_id, v_taint, v_prop.taint_resolved,
                   null, null, null) < 'manage' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 3 · Nobody approves something other than what they read.
  if v_prop.version <> p_expected_version then
    raise exception 'proposal_version_changed' using errcode = 'P0001';
  end if;

  -- ROUND-6 Q4 (D7 amended): parents whose CURRENT union exceeds
  -- own ∪ drafted mean the approver did not read this audience — refuse,
  -- re-render. Distinct shape only PAST the authorization boundary, like
  -- proposal_version_changed; the union above stays as the fail-closed
  -- backstop.
  if exists (select 1 from unnest(v_ptaint) d
             where not (array[d] <@ hc.taint_union(v_own_arr, v_prop.taint))) then
    raise exception 'proposal_taint_changed' using errcode = 'P0001';
  end if;

  -- 5 · A high-risk VALUE requires explicit confirmation (PRD §6.4).
  -- 5A-M4: for conflicts this gates use_new alone — the one outcome that
  -- writes a value; declining or task-drafting approves no value.
  if (v_prop.kind <> 'conflict'::hc.proposal_kind or v_outcome = 'use_new')
     and v_payload ->> 'risk_class' = 'high'
     and coalesce((p_edits -> 'confirm_high')::boolean, false) is not true then
    raise exception 'high_risk_unconfirmed' using errcode = 'P0001';
  end if;

  -- 6 · Claim FIRST (the PK serialises concurrent approvals; the unique
  -- (object_type, object_id) forbids two proposals backing one row), then
  -- write the object WITH its provenance block — or write nothing.
  -- 5A-M4: keep claims nothing — NOTHING is written, and the absent
  -- commit row is the assertion.
  if v_obj_type is not null then
    insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
    values (p_proposal_id, v_prop.circle_id, v_obj_type, v_obj_id);
  end if;

  v_source := case when coalesce((v_payload ->> 'manual')::boolean, false)
                   then null else v_prop.arrival_id end;

  if v_prop.kind = 'conflict'::hc.proposal_kind then
    if v_outcome = 'use_new' then
      -- The profile_fact supersession path, verbatim (§2.5): the old
      -- current row is marked in the same transaction, retained, and
      -- named by the new row.
      select pf.id into v_old_pf from public.profile_facts pf
        where pf.subject_id = v_prop.subject_id
          and pf.field = v_payload ->> 'field'
          and pf.superseded_at is null
        for update;
      if v_old_pf is not null then
        update public.profile_facts set superseded_at = now() where id = v_old_pf;
      end if;
      insert into public.profile_facts
        (id, circle_id, subject_id, field, value, risk_class, domain,
         supersedes_id, source_arrival_id, source_proposal_id,
         approved_by, approved_at, approver_display_name, taint, taint_resolved)
      values
        (v_obj_id, v_prop.circle_id, v_prop.subject_id,
         v_payload ->> 'field', v_payload -> 'value',
         (v_payload ->> 'risk_class')::hc.risk_class,
         (v_payload ->> 'domain')::hc.domain,
         v_old_pf, v_source, p_proposal_id,
         v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
      if v_old_pf is not null then
        update public.profile_facts
          set superseded_by_id = v_obj_id
          where id = v_old_pf;
      end if;
    elsif v_outcome = 'keep_both' then
      -- Q9: the task IS the approval's one object — from the DRAFTED task
      -- block, UNASSIGNED (§3.6: assignment stays human and separate).
      insert into public.tasks
        (id, circle_id, subject_id, title, detail, due_on, due_zone,
         source_arrival_id, source_proposal_id,
         approved_by, approved_at, approver_display_name, taint, taint_resolved)
      values
        (v_obj_id, v_prop.circle_id, v_prop.subject_id,
         v_task ->> 'title', v_task ->> 'detail',
         (v_task ->> 'due_on')::date, v_task ->> 'due_zone',
         v_source, p_proposal_id,
         v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
    end if;
  elsif v_obj_type = 'document' then
    insert into public.documents
      (id, circle_id, subject_id, title, category, summary_text,
       artifact_arrival_id, filed_at, source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       v_payload ->> 'title', (v_payload ->> 'category')::hc.doc_category,
       v_payload ->> 'summary_text',
       v_prop.arrival_id,
       coalesce((v_payload ->> 'filed_at')::timestamptz, now()),
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'task' then
    insert into public.tasks
      (id, circle_id, subject_id, title, detail, due_on, due_zone,
       source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       v_payload ->> 'title', v_payload ->> 'detail',
       (v_payload ->> 'due_on')::date, v_payload ->> 'due_zone',
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'timeline_event' then
    insert into public.timeline_events
      (id, circle_id, subject_id, kind, summary, episode_id,
       occurred_on, occurred_zone, local_at, iana_zone, instant, is_floating,
       source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       (v_payload ->> 'kind')::hc.timeline_kind, v_payload ->> 'summary',
       (v_payload ->> 'episode_id')::uuid,
       (v_payload ->> 'occurred_on')::date, v_payload ->> 'occurred_zone',
       (v_payload ->> 'local_at')::timestamp, v_payload ->> 'iana_zone',
       (v_payload ->> 'instant')::timestamptz,
       coalesce((v_payload ->> 'is_floating')::boolean, false),
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'episode' then
    insert into public.episodes
      (id, circle_id, subject_id, title, source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id, v_payload ->> 'title',
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'profile_fact' then
    -- Supersession IS the write path (§2.5): the old current row is marked
    -- in the same transaction, retained, and named by the new row.
    select pf.id into v_old_pf from public.profile_facts pf
      where pf.subject_id = v_prop.subject_id
        and pf.field = v_payload ->> 'field'
        and pf.superseded_at is null
      for update;
    -- The old row leaves the partial unique BEFORE the new row enters it;
    -- superseded_by_id is backfilled once the new id exists (its composite
    -- FK cannot point at a row that is not yet written).
    if v_old_pf is not null then
      update public.profile_facts set superseded_at = now() where id = v_old_pf;
    end if;
    insert into public.profile_facts
      (id, circle_id, subject_id, field, value, risk_class, domain,
       supersedes_id, source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       v_payload ->> 'field', v_payload -> 'value',
       (v_payload ->> 'risk_class')::hc.risk_class,
       (v_payload ->> 'domain')::hc.domain,
       v_old_pf, v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
    if v_old_pf is not null then
      update public.profile_facts
        set superseded_by_id = v_obj_id
        where id = v_old_pf;
    end if;
  end if;

  -- provenance edges to the payload parents; the child already carries
  -- their union, so the growth delta inside link_provenance is empty.
  -- ROUND-6 AB3: distinct — a duplicate parent is one edge, not a 23505.
  -- 5A-M4: keep wrote no object, so there is no child to link.
  if v_obj_type is not null then
    for v_parent in select distinct value from jsonb_array_elements(v_parents) loop
      perform hc.link_provenance(v_obj_type, v_obj_id,
        (v_parent ->> 'type')::hc.object_type, (v_parent ->> 'id')::uuid);
    end loop;
  end if;

  -- 5A-M4: keep closes rejected — the decider is recorded either way.
  if v_prop.kind = 'conflict'::hc.proposal_kind and v_outcome = 'keep' then
    v_status := 'rejected';
  end if;

  update public.proposals
    set status = v_status, decided_by = v_actor, decided_at = now()
    where id = p_proposal_id;

  if v_prop.kind = 'conflict'::hc.proposal_kind then
    -- 5A-M4: every §4.8 outcome is one access-log event, outcome named.
    perform hc.log(v_prop.circle_id, 'conflict_resolved', v_actor_name,
                   p_actor_account_id => v_actor,
                   p_subject_id => v_prop.subject_id,
                   p_object_type => v_obj_type,
                   p_object_id => case when v_obj_type is null then null else v_obj_id end,
                   p_detail => jsonb_build_object('proposal_id', p_proposal_id,
                                                  'outcome', v_outcome,
                                                  'status', v_status));
  else
    perform hc.log(v_prop.circle_id, 'object_approved', v_actor_name,
                   p_actor_account_id => v_actor,
                   p_subject_id => v_prop.subject_id,
                   p_object_type => v_obj_type, p_object_id => v_obj_id,
                   p_detail => jsonb_build_object('proposal_id', p_proposal_id,
                                                  'status', v_status));
  end if;

  -- 7 · Record the result against the idempotency key.
  v_result := jsonb_build_object(
    'proposal_id', p_proposal_id,
    'object_type', v_obj_type,
    'object_id', case when v_obj_type is null then null else v_obj_id end,
    'status', v_status)
    || case when v_prop.kind = 'conflict'::hc.proposal_kind
            then jsonb_build_object('outcome', v_outcome)
            else '{}'::jsonb end;
  update public.approval_attempts
    set result = v_result, committed_at = now()
    where idempotency_key = p_idempotency_key;

  return v_result;
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way).
-- The approval boundary keeps EXACTLY the reach it had: hc_internal owns it,
-- authenticated executes it, nobody else holds anything. 002's exact ACL
-- inventory is the pin that would catch any drift here.
alter function hc.approve_proposal(uuid, int, text, jsonb, text)
  owner to hc_internal;
revoke execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  to authenticated;
