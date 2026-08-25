-- ============================================================================
-- 6B · THE PRE-AUTHORISED SLOT — the approve-time payload-contract residue.
-- ADR-0025 D16 S16.8: ONE migration slot, pre-authorised at the round-17
-- owner sign-off for THIS residue only; it does not reopen M7, and slice 6's
-- Q2 bound closes at 7 of ≤ 7 with this file. Landed BEFORE B8 — the decide
-- route is the first caller that can reach these functions from the app, and
-- it must land on a surface that cannot crash at a person's click.
--
-- Pinned by pgTAP 064 cases 21-32, which went RED before this existed (9 of
-- 12; the two ruled signatures live in the red run's `have:` lines):
--
--     ERROR:22P02:invalid input value for enum hc.domain: "bogus"   (21, 22)
--     ERROR:22023:cannot cast jsonb string to type boolean          (23)
--
-- THE SIX S16.8 CONDITIONS, disposed:
--   1 · red first, both signatures quoted — 064 cases 21/23, previous commit.
--   2 · the conflict arm's `domain` cast covered for EVERY outcome — the
--       taint math casts it under keep, keep_both AND use_new, and the cast
--       half covered use_new alone. Closed by performing the cast for every
--       outcome (the same by-construction argument as M6's cast half).
--   3 · 064 gains keep_both cases — 22 (malformed, refuses) and 26 (well-
--       formed CONTROL, still commits its task).
--   4 · p_edits' TOP-LEVEL keys contracted — object shape, closed key set
--       {fields, conflict_outcome, confirm_high}, confirm_high a boolean.
--       The third re-derivation REFUTED the scalar-p_edits CRASH candidate
--       by driving it (it refuses today as high_risk_unconfirmed — the wrong
--       word for a malformed shape, not a raw error) and found the unknown-
--       key case SILENTLY IGNORED — 064:25 drove a rogue approval red.
--   5 · the enumeration re-derived a THIRD time, from EVERY payload-derived
--       cast expression in the function rather than from the insert arms
--       (the frame that produced the miss twice). Findings: the two known,
--       plus condition 4's top-level contract. The parents loop's casts are
--       draft-guarded (20260824120001:105-123) and D2-fenced (`parents` is
--       not an editable key), which is the recorded posture, not a new gap.
--   6 · hc.revise_object and the step-up path audited against D1.
--       hc.consume_step_up and mint are CLEAN — the token is digested, never
--       cast. hc.reject_proposal is CLEAN — it authorizes on the row's own
--       taint and consumes no payload. hc.revise_object carries its own
--       copies of the record-table writes and had the SAME classes open at
--       its click, all three driven live before 064:28-30 pinned them:
--       23502 through a {key: null} patch, 22007 through the due_on cast,
--       23514 through the due pair. Guarded below in the D1 way — mirrored
--       from the catalog and the shipped constraint, never guessed.
--
-- The slot therefore closes CONSUMED: conditions 4 and 6 found residue that
-- needs DDL, which is exactly the question the third re-derivation existed
-- to answer.
--
-- NO SHIPPED MIGRATION IS EDITED. Two functions are replaced forward; every
-- body is EXTRACTED from the LAST migration that replaced it — ADR-0024
-- D8's build rule:
--
--     hc.approve_proposal   20260824120006:60-700
--     hc.revise_object      20260815230012:342-461
--
-- No new objects, no new grants: the 002-family exact-set pins do not move.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · hc.approve_proposal — two deltas: the top-level p_edits contract
--     (before any row is written, like the vocabulary check it joins) and
--     the conflict arm's domain cast performed for every outcome.
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

  -- 6B S16.8 (ADR-0025 D16, the pre-authorised slot): THE TOP-LEVEL p_edits
  -- CONTRACT. D2 contracted `p_edits -> 'fields'` and left the level above
  -- it open three ways, found by the sign-off's amendment and the build's
  -- third re-derivation: `confirm_high` is cast jsonb→boolean at the §6.4
  -- gate below (a string raised 22023 at a person's click — 064:23 drove
  -- it); a p_edits that is not an object was answered as
  -- high_risk_unconfirmed, the wrong word for a malformed shape (064:24 —
  -- the refuted-crash candidate, contracted anyway); and an unknown
  -- top-level key was SILENTLY IGNORED on the one function that writes the
  -- record (064:25 drove the rogue approval red). Fail-closed like D2's
  -- allowlist, and placed with the vocabulary check it joins: shape checked
  -- before any row is written.
  if p_edits is not null then
    if jsonb_typeof(p_edits) <> 'object' then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_object_keys(p_edits) k
               where k not in ('fields', 'conflict_outcome', 'confirm_high')) then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    if p_edits ? 'confirm_high'
       and jsonb_typeof(p_edits -> 'confirm_high') <> 'boolean' then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
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
      -- 6B S16.8 (S16.2 closed IN FULL): the taint math below casts the
      -- payload's domain for EVERY outcome — keep and keep_both included,
      -- neither of which passes through the use_new guard — so the cast is
      -- performed here for every outcome too, by the same by-construction
      -- argument as the rest of this block. Reachable with NO edit at all:
      -- draft_proposal's conflict branch never validates a conflict
      -- payload's domain. 064:21-22 drove 22P02 under keep AND keep_both
      -- before this line existed.
      perform (v_payload ->> 'domain')::hc.domain;
      if v_outcome = 'use_new' then
        perform (v_payload ->> 'risk_class')::hc.risk_class;
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
  -- 6B S16.8: the cast below can no longer raise 22023 — the top-level
  -- contract above admits `confirm_high` only as a jsonb boolean.
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
-- 2 · hc.revise_object — the condition-6 findings, guarded in the D1 way.
--     Body from 20260815230012:342-461; three additions, nothing else moves.
-- ----------------------------------------------------------------------------

create or replace function hc.revise_object(
  p_object_type hc.object_type, p_object_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_obj record;
  v_ctx jsonb;
  v_allowed text[];
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_rev int;
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  -- Discovery only — the lock is keyed on the circle.
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  v_allowed := case p_object_type
    when 'document' then array['title','summary_text']
    when 'task' then array['title','detail','due_on','due_zone']
    when 'timeline_event' then array['summary']
    when 'episode' then array['title']
    else '{}'::text[]        -- profile_fact: supersede-only
  end;
  if cardinality(v_allowed) = 0 then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  -- R-rule: serialize with growth/shrink and freeze transitions, then
  -- RE-READ — everything the authorization depends on is read under the
  -- lock, against the version this write will touch.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_obj.circle_id::text));
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  -- The care-circle ceiling needs the owner column where it exists.
  if p_object_type = 'task' then
    select t.owner_member_id into v_owner from public.tasks t where t.id = p_object_id;
  end if;

  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_obj.subject_id, v_obj.taint, v_obj.taint_resolved,
                   p_object_type, p_object_id, v_owner) < 'manage' then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'revise_invalid_field' using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'revise_invalid_field' using errcode = 'P0001';
    end if;
  end loop;

  -- 6B S16.8 condition 6 (ADR-0025 D16): the SAME classes, at THIS click.
  -- This function carries its own copies of the record-table writes, and
  -- the condition-6 audit found M1/D1's classes open here — 23502 through a
  -- {key: null} patch on a NOT NULL column, 22007 through the one
  -- payload-derived cast this function performs, 23514 through the due pair
  -- (guarded inside the task branch below, where the row's current values
  -- are in hand). All three driven live before 064:28-30 pinned them; the
  -- controls at 064:31-32 drive the other direction — the guards narrow
  -- crashes, never corrections.
  --
  -- The NOT NULL set is read from the catalog, not guessed: of every column
  -- the allowlists name, exactly four refuse NULL — documents.title,
  -- tasks.title, episodes.title, timeline_events.summary. `title` reaches
  -- three tables and all three declare it NOT NULL, so no per-type branch;
  -- a null pass-through on every OTHER key stays legal (it clears the
  -- nullable column, which is what the update arms already do with it).
  if (p_patch ? 'title' and jsonb_typeof(p_patch -> 'title') = 'null')
     or (p_patch ? 'summary' and jsonb_typeof(p_patch -> 'summary') = 'null') then
    raise exception 'revise_invalid_field' using errcode = 'P0001';
  end if;
  if p_patch ? 'due_on' then
    -- The D1 cast-half technique at this function's one cast: perform the
    -- cast the update arm performs, name the data-exception SQLSTATEs and
    -- nothing else — a defect here still surfaces as itself.
    begin
      perform (p_patch ->> 'due_on')::date;
    exception when invalid_text_representation
                or invalid_datetime_format
                or datetime_field_overflow then
      raise exception 'revise_invalid_field' using errcode = 'P0001';
    end;
  end if;

  -- One row, one type; the row lock also serialises revision numbering.
  if p_object_type = 'document' then
    select to_jsonb(d) into v_before from public.documents d
      where d.id = p_object_id for update;
    update public.documents set
      title        = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
      summary_text = case when p_patch ? 'summary_text' then p_patch ->> 'summary_text' else summary_text end
      where id = p_object_id;
    select to_jsonb(d) into v_after from public.documents d where d.id = p_object_id;
  elsif p_object_type = 'task' then
    select to_jsonb(t) into v_before from public.tasks t
      where t.id = p_object_id for update;
    -- 6B S16.8 condition 6: `tasks_check` mirrored from the shipped
    -- constraint — (due_on IS NULL) = (due_zone IS NULL) — over the values
    -- this update will leave behind, exactly as the approve arms mirror it.
    -- Checked HERE, after the FOR UPDATE read, so "current" means the row
    -- version this write touches.
    if ((case when p_patch ? 'due_on' then p_patch ->> 'due_on'
              else v_before ->> 'due_on' end) is null)
       <> ((case when p_patch ? 'due_zone' then p_patch ->> 'due_zone'
                 else v_before ->> 'due_zone' end) is null) then
      raise exception 'revise_invalid_field' using errcode = 'P0001';
    end if;
    update public.tasks set
      title    = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
      detail   = case when p_patch ? 'detail' then p_patch ->> 'detail' else detail end,
      due_on   = case when p_patch ? 'due_on' then (p_patch ->> 'due_on')::date else due_on end,
      due_zone = case when p_patch ? 'due_zone' then p_patch ->> 'due_zone' else due_zone end
      where id = p_object_id;
    select to_jsonb(t) into v_after from public.tasks t where t.id = p_object_id;
  elsif p_object_type = 'timeline_event' then
    select to_jsonb(e) into v_before from public.timeline_events e
      where e.id = p_object_id for update;
    update public.timeline_events set
      summary = case when p_patch ? 'summary' then p_patch ->> 'summary' else summary end
      where id = p_object_id;
    select to_jsonb(e) into v_after from public.timeline_events e where e.id = p_object_id;
  elsif p_object_type = 'episode' then
    select to_jsonb(ep) into v_before from public.episodes ep
      where ep.id = p_object_id for update;
    update public.episodes set
      title = case when p_patch ? 'title' then p_patch ->> 'title' else title end
      where id = p_object_id;
    select to_jsonb(ep) into v_after from public.episodes ep where ep.id = p_object_id;
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_rev
    from public.record_revisions r
    where r.object_type = p_object_type and r.object_id = p_object_id;

  insert into public.record_revisions
    (circle_id, object_type, object_id, revision_no, changed_by,
     changer_display_name, before, after)
  values
    (v_obj.circle_id, p_object_type, p_object_id, v_rev, v_actor,
     v_actor_name, v_before, v_after);

  return jsonb_build_object('object_type', p_object_type,
                            'object_id', p_object_id, 'revision_no', v_rev);
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way).
alter function hc.revise_object(hc.object_type, uuid, jsonb)
  owner to hc_internal;
revoke execute on function hc.revise_object(hc.object_type, uuid, jsonb)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.revise_object(hc.object_type, uuid, jsonb)
  to authenticated;
