-- ============================================================================
-- 6A · M6 — THE ROUND-17 DISPOSITIONS. docs/review/round-17-findings.md,
-- docs/review/round-17-packet.md Q-A–Q-I, ADR-0025. The standing precedent
-- since 2A: the round's accepted findings land in the slice's reserved slot,
-- with the argument, and never on a build session's own authority.
--
-- Pinned by pgTAP 064, which went RED before this existed (13 of 20).
-- Q2's bound closes at 6 of ≤ 7 with M7 UNCONSUMED — which is the number the
-- plan predicted in four places (round-17 F-7).
--
-- NO SHIPPED MIGRATION IS EDITED. Three functions are replaced forward and
-- one policy is altered. Every body is EXTRACTED from the LAST migration that
-- replaced it — ADR-0024 D8's build rule, which the 056 structural pin caught
-- being broken once already this slice — and substituted with asserted
-- single-match anchors, so each diff is the delta and nothing else:
--
--     hc.approve_proposal        20260824120003:352-843
--     hc.reject_proposal         20260824120003:212-343
--     hc.create_manual_proposal  20260816010006:60-126
--
-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION IS FOR, in one sentence per disposition.
--
-- D1 · F-1 (MAJOR) + Q-D — THE APPROVE-TIME PAYLOAD CONTRACT. `p_edits ->
--      'fields'` was merged into the payload with no validation at all,
--      before every guard in the function, so a person's click still reached
--      six raw Postgres classes that M1's guard does not cover:
--      23514 `tasks_check` (guarded on the conflict arm and NOT the ordinary
--      one), 23514 `temporal_shape` (Q-D's named class), 22P02 and 22007
--      through every cast the insert arms perform, 23503 on a payload-supplied
--      `episode_id`, and — found re-deriving the review's own enumeration,
--      which it marked medium-confidence — 23502 on
--      `profile_facts.risk_class` from the CONFLICT arm, which is the class
--      M1 states it closed, open one arm over in the same function.
--      The validation lands where the DESTINATION IS KNOWN rather than at the
--      literal merge: at :478 v_obj_type is not yet settled, and refusing
--      keys an arm will never read would narrow APPROVALS rather than
--      crashes, which is the property that let M1 fit inside a MINOR slot.
--
-- D2 · THE EDIT CONTRACT. An edit corrects a value; it does not re-author the
--      proposal. A closed, fail-closed allowlist of content keys, which also
--      restores the drafting contract's coverage over everything an edit does
--      not touch — `parents` and `manual` most of all.
--
-- D3 · Q-B — the manual-entry seam, closed in the LADDER form.
--
-- D4 · F-3 — the liveness asymmetry in D10, closed on three surfaces.
--
-- Q7 ITSELF IS RATIFIED UNCHANGED (ADR-0025 D5). F-2 is a correction to the
-- RECORD — D1 says one consequence and there are two — and it needs no DDL:
-- the predicate asks for exactly what Q7 says must be required.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · hc.approve_proposal — five deltas, all of them M6's: the edit contract,
--     the conflict arm's missing NOT NULL, the cast half, the destination
--     half, the parents shape, and the arrival's liveness.
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
  v_arrival_state hc.arrival_state;   -- 6A M3: the terminal arm
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
      (idempotency_key, proposal_id, expected_version, actor_id, conflict_outcome,
       decision)
    values (p_idempotency_key, p_proposal_id, p_expected_version, v_actor, v_outcome,
            'approve');
  exception
    when unique_violation then
      select * into v_existing from public.approval_attempts
        where idempotency_key = p_idempotency_key;
      -- 6A M3: the DECISION is part of the identity. This branch returns
      -- BEFORE the pending check below, so without the comparison a key
      -- claimed by hc.reject_proposal would replay a REJECTION's stored
      -- result to a caller who asked to approve (061 case 12 drove exactly
      -- that on main and got {"status": "approved", ...}).
      if v_existing.proposal_id = p_proposal_id
         and v_existing.actor_id = v_actor
         and v_existing.decision = 'approve'
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

  -- 6A M6 (ADR-0025 D2, round-17 F-1): THE EDIT CONTRACT, stated before the
  -- merge because the merge is what reaches everything else. §4.2.3's edit
  -- CORRECTS A VALUE; it does not re-author the proposal. `p_edits -> 'fields'`
  -- was merged with no type, shape or vocabulary validation at all, by a
  -- caller who need only be `authenticated` and clear the gates.
  --
  -- The allowlist is CONTENT keys and it is fail-closed: a payload key added
  -- by a later slice is not editable until someone says it is. What it closes
  -- that a per-value check could not:
  --   · `parents` drives the taint arithmetic AND the provenance edges, and
  --     the drafting contract validated it once (20260824120001:105-123) —
  --     an edit that re-authors it would have to re-run that validation, and
  --     the loop below re-runs none of it (22023 on a non-array, 22P02 on a
  --     bad type or id).
  --   · `manual` is MACHINERY-DECLARED — "the machinery declares the flag; a
  --     caller cannot unset it" (20260816010006:107) — and an edit that set
  --     it nulled `source_arrival_id` below, detaching a written record
  --     object from the arrival it came from. That sentence was true of the
  --     drafting path and false here.
  -- This is the ONE half of M6 that narrows an APPROVAL rather than a crash,
  -- and it is put to the owner as such (ADR-0025 D12).
  if p_edits ? 'fields' then
    if jsonb_typeof(p_edits -> 'fields') <> 'object' then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_object_keys(p_edits -> 'fields') k
               where k not in ('field', 'value', 'risk_class', 'domain',
                               'title', 'detail', 'summary', 'summary_text',
                               'category', 'filed_at',
                               'due_on', 'due_zone', 'task',
                               'kind', 'episode_id', 'occurred_on',
                               'occurred_zone', 'local_at', 'iana_zone',
                               'instant', 'is_floating')) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
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
    -- 6A M6 (ADR-0025 D1): `risk_class` joins this guard. M1 closed the
    -- 23502 class in the `else` branch below and this arm writes the same
    -- NOT NULL column at its own insert, so the class M1 states it closed was
    -- open ONE ARM OVER, in this function, with no edit required. Found
    -- re-deriving F-1's enumeration for the disposition; pinned at 064:5.
    if v_outcome = 'use_new'
       and (length(coalesce(v_payload ->> 'field', '')) not between 1 and 120
            or v_payload -> 'value' is null
            or v_payload ->> 'risk_class' is null
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

  -- 6A M6 (ADR-0025 D1, round-17 F-1 + Q-D): THE APPROVE-TIME PAYLOAD
  -- CONTRACT — the cast half. M1 closed 23502; the same click still reached
  -- 22P02 and 22007 through every cast the insert arms perform. The guard
  -- PERFORMS EXACTLY THOSE CASTS and converts their failure into the refusal,
  -- so it is complete by construction rather than by an enumeration of
  -- formats or a second copy of an enum's vocabulary. The handler names the
  -- three data-exception SQLSTATEs and NOTHING else: a defect in this
  -- function still surfaces as itself.
  --
  -- Placed here because both arms have settled v_obj_type and neither has
  -- cast anything yet — hc.own_domain's three casts are below, the insert
  -- arms' are further below, and the destination half beneath this one reads
  -- `is_floating` as a boolean, which is safe only after this block.
  begin
    perform coalesce((v_payload ->> 'manual')::boolean, false);
    if v_prop.kind = 'conflict'::hc.proposal_kind then
      if v_outcome = 'use_new' then
        perform (v_payload ->> 'risk_class')::hc.risk_class,
                (v_payload ->> 'domain')::hc.domain;
      elsif v_outcome = 'keep_both' then
        perform (v_task ->> 'due_on')::date;
      end if;
    else
      -- hc.own_domain takes all three on every kind, so all three are cast
      -- on every kind — exactly as the call below does it.
      perform (v_payload ->> 'category')::hc.doc_category,
              (v_payload ->> 'kind')::hc.timeline_kind,
              (v_payload ->> 'domain')::hc.domain;
      case v_obj_type
        when 'profile_fact'::hc.object_type then
          perform (v_payload ->> 'risk_class')::hc.risk_class;
        when 'document'::hc.object_type then
          perform (v_payload ->> 'filed_at')::timestamptz;
        when 'task'::hc.object_type then
          perform (v_payload ->> 'due_on')::date;
        when 'timeline_event'::hc.object_type then
          perform (v_payload ->> 'episode_id')::uuid,
                  (v_payload ->> 'occurred_on')::date,
                  (v_payload ->> 'local_at')::timestamp,
                  (v_payload ->> 'instant')::timestamptz,
                  (v_payload ->> 'is_floating')::boolean;
        else null;                        -- episodes cast nothing
      end case;
    end if;
  exception when invalid_text_representation
              or invalid_datetime_format
              or datetime_field_overflow then
    raise exception 'approval_refused' using errcode = 'P0001';
  end;

  -- 6A M6 (ADR-0025 D1): THE DESTINATION HALF — the CHECK constraints and the
  -- one payload-derived FOREIGN KEY, mirrored from the shipped DDL rather
  -- than invented. `tasks_check` is the asymmetry F-1 names: the conflict
  -- arm has guarded that pair since 5A M4 (:502 in the source migration) and
  -- the ordinary arm wrote it straight through. `temporal_shape` is Q-D's
  -- named-and-not-taken class, reproduced clause for clause from
  -- 20260815230002:183-186. The episode FK is the only payload-derived
  -- reference on any insert arm, and it is tested exactly as the constraint
  -- tests it — circle-consistent, and NOT filtered on deleted_at, because the
  -- foreign key is not either.
  --
  -- NON-BREAKING BY CONSTRUCTION, the M1 argument unchanged: every payload
  -- refused here would have raised a raw Postgres error a few statements
  -- later. 064 cases 9 and 10 are the controls that drive it the other way.
  if v_prop.kind <> 'conflict'::hc.proposal_kind then
    if (v_obj_type = 'task'::hc.object_type
        and ((v_payload ->> 'due_on') is null) <> ((v_payload ->> 'due_zone') is null))
       or (v_obj_type = 'timeline_event'::hc.object_type
           and not (
                ((v_payload ->> 'occurred_on') is not null
                 and (v_payload ->> 'local_at') is null
                 and not coalesce((v_payload ->> 'is_floating')::boolean, false))
             or ((v_payload ->> 'local_at') is not null
                 and (v_payload ->> 'iana_zone') is not null
                 and (v_payload ->> 'instant') is not null
                 and not coalesce((v_payload ->> 'is_floating')::boolean, false))
             or ((v_payload ->> 'local_at') is not null
                 and (v_payload ->> 'iana_zone') is null
                 and coalesce((v_payload ->> 'is_floating')::boolean, false)))) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    if v_obj_type = 'timeline_event'::hc.object_type
       and (v_payload ->> 'episode_id') is not null
       and not exists (select 1 from public.episodes e
                       where e.circle_id = v_prop.circle_id
                         and e.id = (v_payload ->> 'episode_id')::uuid) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
  end if;

  -- 2 · Re-check authorization AT WRITE TIME on the D7 union: own domain ∪
  -- drafted taint ∪ parents' CURRENT taints. A grant lowered while the
  -- review screen sat open cannot be approved against. ROUND-6 AB3:
  -- duplicate payload parents collapse here (and at the edge loop below).
  v_parents := coalesce(v_payload -> 'parents', '[]'::jsonb);
  -- 6A M6 (ADR-0025 D2): the shape the drafting contract asserts
  -- (20260824120001:107-111) asserted here too. `parents` is not an editable
  -- key, so this can only fire on a row that reached `pending` some other
  -- way — which is exactly the population M1's approve-time half exists for.
  if jsonb_typeof(v_parents) <> 'array' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;
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
  -- 6A M6 (ADR-0025 D4, round-17 F-3): AND THE ARRIVAL IS LIVE. D10 claimed
  -- five surfaces ask the same question of the same arrival; two of them —
  -- hc.extractions_for and hc.receipt_for — asked it of the arrival ROW, with
  -- the `deleted_at is null` their shared source hc.log_artifact_read carries
  -- (20260821120001:79-82), and three never read the row at all. Zero rows is
  -- the ONE shape for nonexistent, foreign, deleted, revoked and below-cliff
  -- alike, which is why this is an EXISTS rather than a second predicate.
  --
  -- Unreachable today: nothing in the tree writes arrivals.deleted_at. Taken
  -- on the ROUND-15 FINDING 2 precedent (056's header) — hc.list_known_senders
  -- omitted the same guard, was equally unreachable, and was fixed "on the
  -- live-actor principle, not on a live exploit". A narrowing is safe; the
  -- alternative was a record that says the question is the same when it is not.
  if not exists (select 1 from public.arrivals a
                 where a.id = v_prop.arrival_id
                   and a.deleted_at is null
                   and hc.visible_at(v_ctx, v_prop.subject_id, hc.all_domains(), true,
                                     'arrival', a.id, null) >= 'view') then
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

  -- 6A M3 · THE TERMINAL ARM, in THIS transaction. An arrival terminalizes
  -- when every LIVE proposal is decided — filed if at least one closed
  -- approved/edited_approved, nothing_filed otherwise — so the last decision
  -- and the terminal transition commit together or not at all (AC-INBOX-4).
  v_arrival_state := hc.terminalize_decided_arrival(v_prop.arrival_id);

  -- 7 · Record the result against the idempotency key.
  v_result := jsonb_build_object(
    'proposal_id', p_proposal_id,
    'object_type', v_obj_type,
    'object_id', case when v_obj_type is null then null else v_obj_id end,
    'status', v_status,
    'arrival_state', v_arrival_state::text)
    || case when v_prop.kind = 'conflict'::hc.proposal_kind
            then jsonb_build_object('outcome', v_outcome)
            else '{}'::jsonb end;
  update public.approval_attempts
    set result = v_result, committed_at = now()
    where idempotency_key = p_idempotency_key;

  return v_result;
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way).
alter function hc.approve_proposal(uuid, int, text, jsonb, text)
  owner to hc_internal;
revoke execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · hc.reject_proposal — ONE delta: the same liveness. D6's argument
--     applied to F-3 — rejecting a fact you cannot read is as blind as
--     approving one, and a source you cannot see is a fact you cannot read.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
create or replace function hc.reject_proposal(
  p_proposal_id uuid, p_expected_version int, p_idempotency_key text,
  p_reason text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor      uuid := hc.uid();
  v_actor_name text;
  v_prop       record;
  v_existing   record;
  v_ctx        jsonb;
  v_arrival_state hc.arrival_state;
  v_result     jsonb;
begin
  if v_actor is null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 200 then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- §4.2.3's vocabulary, checked before any row is written. NULL is valid:
  -- the reason is one optional tap, not a required justification.
  if p_reason is not null
     and p_reason not in ('wrong', 'already_handled', 'not_important', 'other') then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 1 · Claim the key. Identity is (proposal, actor, DECISION) — the same
  -- key presented for the opposite decision conflicts and writes nothing.
  begin
    insert into public.approval_attempts
      (idempotency_key, proposal_id, expected_version, actor_id, decision)
    values (p_idempotency_key, p_proposal_id, p_expected_version, v_actor, 'reject');
  exception
    when unique_violation then
      select * into v_existing from public.approval_attempts
        where idempotency_key = p_idempotency_key;
      if v_existing.proposal_id = p_proposal_id
         and v_existing.actor_id = v_actor
         and v_existing.decision = 'reject'
         and v_existing.result is not null then
        return v_existing.result;
      end if;
      raise exception 'approval_refused' using errcode = 'P0001';
    when foreign_key_violation then
      -- a nonexistent proposal fails the attempt row's FK: same shape as
      -- unauthorized, no existence oracle (DEF-10)
      raise exception 'approval_refused' using errcode = 'P0001';
  end;

  select * into v_prop from public.proposals p
    where p.id = p_proposal_id
    for update;
  if v_prop.id is null or v_prop.status <> 'pending' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- R-rule, approve's order exactly: the per-circle lock before the freeze
  -- predicate and before the terminal arm's row lock.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_prop.circle_id::text));

  if exists (select 1 from public.freezes f
             where f.circle_id = v_prop.circle_id
               and (f.state = 'open'
                    or (f.state = 'unresolved'
                        and (f.subject_id is null or f.subject_id = v_prop.subject_id)))) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- 2 · Write-time authorization (§3.7). A decision is a write, so both
  -- halves of M2's boundary apply: manage over the proposal's own taint, and
  -- view over the arrival across all five domains.
  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_prop.subject_id, v_prop.taint, v_prop.taint_resolved,
                   null, null, null) < 'manage' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;
  -- 6A M6 (ADR-0025 D4, round-17 F-3): AND THE ARRIVAL IS LIVE. D10 claimed
  -- five surfaces ask the same question of the same arrival; two of them —
  -- hc.extractions_for and hc.receipt_for — asked it of the arrival ROW, with
  -- the `deleted_at is null` their shared source hc.log_artifact_read carries
  -- (20260821120001:79-82), and three never read the row at all. Zero rows is
  -- the ONE shape for nonexistent, foreign, deleted, revoked and below-cliff
  -- alike, which is why this is an EXISTS rather than a second predicate.
  --
  -- Unreachable today: nothing in the tree writes arrivals.deleted_at. Taken
  -- on the ROUND-15 FINDING 2 precedent (056's header) — hc.list_known_senders
  -- omitted the same guard, was equally unreachable, and was fixed "on the
  -- live-actor principle, not on a live exploit". A narrowing is safe; the
  -- alternative was a record that says the question is the same when it is not.
  if not exists (select 1 from public.arrivals a
                 where a.id = v_prop.arrival_id
                   and a.deleted_at is null
                   and hc.visible_at(v_ctx, v_prop.subject_id, hc.all_domains(), true,
                                     'arrival', a.id, null) >= 'view') then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 3 · Nobody decides about something other than what they read. Distinct
  -- shape only PAST the authorization boundary, exactly as approve does it.
  if v_prop.version <> p_expected_version then
    raise exception 'proposal_version_changed' using errcode = 'P0001';
  end if;

  -- 4 · The decision. NOTHING is written to the record — the absent
  -- proposal_commits row is the assertion (061 case 7).
  update public.proposals
     set status = 'rejected', decided_by = v_actor, decided_at = now(),
         reject_reason = p_reason
   where id = p_proposal_id;

  -- 5 · The terminal arm, in THIS transaction.
  v_arrival_state := hc.terminalize_decided_arrival(v_prop.arrival_id);

  perform hc.log(v_prop.circle_id, 'proposal_rejected', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id       => v_prop.subject_id,
                 p_detail           => jsonb_build_object(
                                         'proposal_id', p_proposal_id,
                                         'reason', p_reason,
                                         'arrival_state', v_arrival_state::text));

  v_result := jsonb_build_object(
    'proposal_id',   p_proposal_id,
    'status',        'rejected',
    'reject_reason', p_reason,
    'arrival_state', v_arrival_state::text);

  update public.approval_attempts
     set result = v_result, committed_at = now()
   where idempotency_key = p_idempotency_key;

  return v_result;
end $$;

alter function hc.reject_proposal(uuid, int, text, text) owner to hc_internal;
revoke execute on function hc.reject_proposal(uuid, int, text, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.reject_proposal(uuid, int, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3 · hc.create_manual_proposal — ONE delta: Q-B's view×5, so "you cannot
--     create what you cannot approve" is true rather than recommended.
-- ----------------------------------------------------------------------------

create or replace function hc.create_manual_proposal(
  p_circle_id uuid, p_subject_id uuid, p_kind hc.proposal_kind, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_arrival uuid;
  v_proposal uuid;
  v_taint hc.domain[];
begin
  if v_actor is null then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  -- a manual document has no artifact to cite; every other kind drafts
  if p_kind not in ('task', 'timeline_event', 'profile_fact', 'episode') then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  -- identity: the subject must exist in the circle — one shape with
  -- unauthorized (DEF-10)
  if not exists (select 1 from public.subjects s
                 where s.id = p_subject_id and s.circle_id = p_circle_id) then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  -- R-rule: the per-circle lock before any predicate; freeze and
  -- authorization evaluate under the serialization point.
  perform pg_advisory_xact_lock(hashtext('taint:' || p_circle_id::text));

  -- Freeze first (Q5 order): no ingestion processing under a freeze (§3.8).
  if hc.circle_frozen(p_circle_id, p_subject_id) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- The synthetic arrival and its proposal, one transaction (MNL-01).
  -- proposals_ready: the entry waits for approval like any other draft;
  -- no worker stage ever owns it.
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (p_circle_id, p_subject_id, 'manual', 'proposals_ready')
  returning id into v_arrival;

  insert into public.arrival_events (arrival_id, circle_id, to_state, reason_code, attempt)
  values (v_arrival, p_circle_id, 'proposals_ready', 'manual_entry', 1);

  -- the machinery declares the flag; a caller cannot unset it
  v_proposal := hc.draft_proposal(v_arrival, p_circle_id, p_subject_id, p_kind,
                                  coalesce(p_payload, '{}'::jsonb)
                                    || jsonb_build_object('manual', true));

  -- Authorize on the DRAFTED union — the same predicate approval re-runs.
  -- A refusal aborts the transaction: arrival, event and draft all vanish.
  select p.taint into v_taint from public.proposals p where p.id = v_proposal;
  if hc.visible_at(hc.ctx(), p_subject_id, v_taint, true, null, null, null) < 'manage' then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  -- 6A M6 (ADR-0025 D3, round-17 Q-B): AND view over all five domains, the
  -- same thing the decision now requires. 060 case 16 pinned this seam OPEN
  -- on purpose and carried it to the round: after M2 a member below view×5
  -- could CREATE a manual entry they could no longer APPROVE, and an entry
  -- nobody can decide is an item that sits in the Care Inbox forever.
  --
  -- THE LADDER FORM, not the arrival form, and the difference is not
  -- cosmetic: the arrival is created in THIS transaction, so it can carry no
  -- object_shares row and hc.visible_at's share rung (5) is dead here. The
  -- arrival form would refuse the same people and would read as though a
  -- share could rescue it. Nothing ever can.
  if hc.visible_at(hc.ctx(), p_subject_id, hc.all_domains(), true,
                   null, null, null) < 'view' then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  return jsonb_build_object('arrival_id', v_arrival, 'proposal_id', v_proposal);
end $$;

alter function hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)
  owner to hc_internal;
revoke execute on function hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 4 · arrival_renditions_select — the third surface F-3 names, and the only
--     one of the three that is a POLICY rather than a function. It tested
--     visibility without liveness, so a soft-deleted arrival's page count
--     stayed readable to a member whose artifact, facts and receipt all
--     refuse it.
--
--     ALTER POLICY rather than drop-and-create: there is no window in which
--     the table is readable without a policy.
--
--     The added clause is EXACTLY liveness and nothing more, and that is
--     checkable rather than asserted: the subquery runs as `authenticated`
--     under `arrivals_select` (20260816010007:36-43), whose predicate is the
--     same circle pre-filter and the same visible_at call at `summary` — and
--     this policy already requires `view`, which is strictly stronger. So the
--     only thing the EXISTS can subtract is `deleted_at is null`.
-- ----------------------------------------------------------------------------
alter policy arrival_renditions_select on public.arrival_renditions
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and exists (select 1 from public.arrivals a
              where a.id = arrival_id and a.deleted_at is null)
  and hc.visible_at((select hc.ctx()), subject_id, hc.all_domains(), true,
                    'arrival', arrival_id, null) >= 'view'
);
