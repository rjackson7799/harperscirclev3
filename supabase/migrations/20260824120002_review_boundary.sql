-- ============================================================================
-- 6A · M2 — the review boundary. Q7 SETTLED 2026-08-24 at the plan gate, and
-- the plan calls it "the load-bearing ruling of the set" and "the ruling most
-- worth a reviewer's attack at round 17". docs/review/slice-6-plan.md §4.4 +
-- M2; TSD §3.7, §4.9, §6.4; PRD §4.2.3, §6.4, §7.3; ADR-0019 Q-C.
-- Pinned by pgTAP 060, which went red before this existed (10 of 16).
--
-- NO SHIPPED MIGRATION IS EDITED. hc.approve_proposal is replaced forward
-- from the body M1 left (20260824120001), with ONE predicate added; the
-- extraction read is new.
--
-- ---------------------------------------------------------------------------
-- 1 · THE NARROWING — ONE PREDICATE, AND WHY IT IS IN THE DATABASE
--
-- Three regions of PRD §4.2.3's one screen read through three gates, each
-- correct and each documented at its own site, and the COMPOSITION was
-- recorded nowhere:
--
--   the source       arrivals + the artifact route   view  over ALL FIVE
--   what we read     extractions                     view  over ALL FIVE
--   what we propose  proposals + approve_proposal    manage over the
--                                                    proposal's OWN taint
--
-- hc.grant_vectors builds each level's array CUMULATIVELY, so
-- hc.ladder(s, hc.all_domains()) is the caller's MINIMUM level across five
-- domains. Therefore:
--
--   A member holding `manage` on one domain and nothing on the other four
--   can SEE a proposal tainted with that domain and can APPROVE IT — while
--   the source it cites and the extracted fact it was drawn from are both
--   invisible to them.
--
-- That is not exotic: PRD §4.2.3's own sentence invites it ("Only a member
-- with manage on the relevant domain for that subject can approve"), and
-- pgTAP 060 case 2 demonstrated it live on main — the member approved a
-- high-value health fact while resolving to `hidden` over all five domains.
--
-- In all-high-risk mode — this slice's ONLY mode, because G9 is open and
-- BAND_ARTIFACT_ALLOWLIST ships EMPTY — the contradiction is formal rather
-- than aesthetic. hc.approve_proposal already refuses a high-risk value
-- unless p_edits.confirm_high is true, and PRD §6.4 says the crop must be
-- RENDERED AND ON SCREEN before the approve control activates. So either the
-- database accepts a `confirm_high` from a person who could not possibly
-- have seen a crop, or the interface never activates the control and PRD
-- §4.2.3's sentence is false as written.
--
-- THE PREDICATE IS THE ONE THAT ALREADY EXISTS ELSEWHERE. It is character
-- for character the predicate hc.log_artifact_read enforces
-- (20260821120001:81) and the artifact route performs on its own read:
--
--   hc.visible_at(ctx, subject, hc.all_domains(), true, 'arrival', id, null)
--     >= 'view'
--
-- so this migration invents no rule; it states §6.4's rule at the layer that
-- ENFORCES rules. §3.7's discipline is that access is re-checked at WRITE
-- time, never at render time, and hc.approve_proposal is where write time
-- is: an interface-only rule is a rule that a second client, a retried
-- request, or slice 7 does not have.
--
-- A NARROWING IS SAFE; A WIDENING WOULD NOT BE. The refusal rides the
-- EXISTING `approval_refused` shape (DEF-10 — one shape for nonexistent,
-- foreign, deleted, revoked and below-cliff alike), so it leaks nothing, and
-- it is placed immediately after the manage check so it sits INSIDE the
-- authorization boundary: `proposal_version_changed` and
-- `proposal_taint_changed` keep their distinct shapes strictly past it.
--
-- WHAT WAS REJECTED, and the reason matters. Widening `extractions_select`
-- to a taint-scoped read is NOT EXPRESSIBLE: `extractions` has no taint
-- column, its rows are the facts of a whole document whose taint is not
-- resolved per row, and minting one would let a member read part of a
-- document's facts while the document's own taint says otherwise. PRD §7.3
-- is also explicit that Summary sees "not the artifact and not the extracted
-- contents". The view×5 gate on extractions is correct. It was APPROVAL that
-- was too wide.
--
-- ONE CONSEQUENCE IS RECORDED AND NOT DESIGNED AROUND (060 case 16).
-- hc.create_manual_proposal authorizes on manage-over-drafted-taint alone
-- (20260816010006:113) and does not ask for view×5, so a member below view×5
-- can still CREATE a manual entry that they can no longer APPROVE. The
-- ruling says ONE predicate and says nothing about manual entry; inventing
-- an exemption — or narrowing a second function — is an owner decision, not
-- a build decision. The seam is pinned visibly and put to round 17 with a
-- recommended answer.
--
-- ---------------------------------------------------------------------------
-- 2 · hc.extractions_for — ADR-0019 Q-C's queued candidate, whose consumer
-- is finally real. §4.2.3's middle region ("what we read") has had no read
-- path shaped for a person: `authenticated` holds `select` on `extractions`
-- and the screen would otherwise assemble facts, citations and the run's
-- (model_id, prompt_version) pair by hand at every call site.
--
-- IT IS GATED ON THE ARRIVAL, AT THE SAME view×5 APPROVAL NOW USES — which
-- is the property M2 exists to establish and M5 completes: ONE GATE ACROSS
-- THE WHOLE SURFACE, so the screen, the fact read, the artifact route and
-- the approval cannot disagree about who may see this arrival. It then
-- filters each row through `extractions_select`'s own predicate, so the
-- definer is NEVER WIDER than the RLS it stands in for — a share that widens
-- one arrival cannot silently widen facts that carry no share of their own.
--
-- NO BAND COLUMN, BY DESIGN (Q4 SETTLED). A band is a property of the
-- CALIBRATION, not of the fact. Storing one would freeze one calibration
-- into the record and make re-calibration a data migration — the exact
-- mistake §6.4 avoided by owning citation geometry. The (model_id,
-- prompt_version) pair returned here IS the key that resolves a fact to the
-- bands that governed it, and 6B B4 computes the band at render time from it.
--
-- The order is `field, id` — stable, deterministic, and free of a cast that
-- could raise: hc.write_extractions validates only that `citation` HAS a
-- page/offset/t key (20260816010005:175), never that `page` is a number, so
-- ordering on (citation ->> 'page')::int would be a latent 22P02 on a
-- malformed citation. Document order is the screen's job (6B B7 groups facts
-- by kind); a stable order is the database's.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · hc.approve_proposal — body as 6A M1 left it (20260824120001), with ONE
--     predicate added immediately after the manage check.
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

  -- 6A M2 (Q7 SETTLED 2026-08-24): AND the actor must be able to SEE THE
  -- SOURCE. Character for character the predicate hc.log_artifact_read
  -- (20260821120001:81) and the artifact route already enforce, so this
  -- invents no rule — it states §6.4's rule at the layer that enforces
  -- rules (§3.7: access is re-checked at WRITE time, never at render time).
  --
  -- Without it, hc.grant_vectors' cumulative arrays make
  -- hc.ladder(s, all_domains) a MINIMUM across five domains, so a member
  -- with manage on ONE domain approves a fact whose source and citation are
  -- invisible to them — and in all-high-risk mode, this slice's only mode,
  -- supplies a `confirm_high` for a crop they could not possibly have seen.
  --
  -- Placed INSIDE the authorization boundary, immediately after the manage
  -- check, so proposal_version_changed and proposal_taint_changed keep their
  -- distinct shapes strictly past it. A narrowing is safe; a widening would
  -- not be. Refusal rides the existing approval_refused shape (DEF-10).
  if hc.visible_at(v_ctx, v_prop.subject_id, hc.all_domains(), true,
                   'arrival', v_prop.arrival_id, null) < 'view' then
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
-- The approval boundary keeps EXACTLY the reach it had; 002's exact ACL
-- inventory is the pin that would catch any drift.
alter function hc.approve_proposal(uuid, int, text, jsonb, text)
  owner to hc_internal;
revoke execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · hc.extractions_for — §4.2.3's middle region, gated on the ARRIVAL at
--     the same view×5 approval now uses, and never wider than
--     extractions_select. The shape follows hc.arrival_auth_detail
--     (20260816010007:75): a gated definer read, one refusal word, no actor
--     bookkeeping — this reads, it does not write a trail (hc.log_artifact_read
--     owns the §1.3 step-6 entry, and the artifact route calls it).
-- ----------------------------------------------------------------------------
create function hc.extractions_for(p_arrival uuid)
returns table (
  field          text,
  value          jsonb,
  confidence     numeric,
  risk_class     hc.risk_class,
  citation       jsonb,
  model_id       text,
  prompt_version text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ctx     jsonb := hc.ctx();
  v_subject uuid;
begin
  -- The arrival gate: live, and the caller clears VIEW over all five domains
  -- on it. Nonexistent, foreign, deleted and below-cliff are ONE shape.
  select a.subject_id into v_subject
    from public.arrivals a
   where a.id = p_arrival
     and a.deleted_at is null
     and hc.visible_at(v_ctx, a.subject_id, hc.all_domains(), true,
                       'arrival', a.id, null) >= 'view';
  if v_subject is null then
    raise exception 'extraction_refused' using errcode = 'P0001';
  end if;

  -- Each row re-proves extractions_select's own predicate, so the definer
  -- cannot return a fact the caller could not have read through RLS.
  return query
  select e.field, e.value, e.confidence, e.risk_class,
         e.citation, e.model_id, e.prompt_version
    from public.extractions e
   where e.arrival_id = p_arrival
     and hc.visible_at(v_ctx, e.subject_id, hc.all_domains(), true,
                       'extraction', e.id, null) >= 'view'
   order by e.field, e.id;
end $$;

alter function hc.extractions_for(uuid) owner to hc_internal;
revoke execute on function hc.extractions_for(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.extractions_for(uuid) to authenticated;
