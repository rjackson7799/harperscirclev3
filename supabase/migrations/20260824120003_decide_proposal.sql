-- ============================================================================
-- 6A · M3 — THE LOOP CLOSES, AND IT CLOSES IN THE GRAPH.
-- docs/review/slice-6-plan.md M3; TSD §4.9, §4.2; PRD §4.2.2, §4.2.3,
-- AC-INBOX-4. Pinned by pgTAP 061, which went red before this existed
-- (16 of 19). NO SHIPPED MIGRATION IS EDITED.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MISSING, enumerated against the shipped schema rather than assumed:
--
--   · NO PROPOSAL COULD EVER BE REJECTED. `proposals` has carried
--     `reject_reason` with its bounded vocabulary and the two CHECKs that
--     anticipate a rejection since 1B (20260815230001:83/:85), and NOTHING
--     HAS EVER SATISFIED THEM. hc.approve_proposal writes 'rejected' for
--     exactly one case (5A M4's conflict `keep`); there was no other path.
--     A person could approve, or walk away.
--
--   · THE ARRIVAL HAD NO EXIT. `proposals_ready` appears in
--     hc.arrival_transitions EXACTLY ONCE, as a to_state
--     (20260816010009:66), and never as a from_state; `filed` appears in NO
--     transition row at all. Every arrival that reached "Needs you" stayed
--     there for ever, whatever a person did — and hc.manual_entry has been
--     creating arrivals DIRECTLY at proposals_ready since 1C
--     (20260816010006:100), which have had no exit either. This arm is
--     theirs too.
--
-- ---------------------------------------------------------------------------
-- 1 · THE STAGE COLUMN — A CONSTRAINT RETIRED DELIBERATELY, WITH ITS REASON.
--
-- `hc.arrival_transitions.stage` was `references hc.stage_budgets(stage)`,
-- and hc.stage_budgets is the WORKER budget table: entry_state (UNIQUE),
-- max_attempts, lease_seconds, exhaust_state, exhaust_reason — every column
-- NOT NULL and every one meaningless for a decision a PERSON makes. Seeding
-- a 'review' row there to satisfy the foreign key would have been actively
-- wrong, in three separate ways:
--
--   · hc.claim_stage(arrival, 'review') would become a LEGAL CALL for any
--     hc_pipeline worker — 20260816010004:50 looks the budget up by name and
--     proceeds — so a worker could take a LEASE over an arrival that is
--     waiting for a person and drive it to an invented `exhaust_state`;
--   · `entry_state` is UNIQUE, so `proposals_ready` would become a claimable
--     stage entry, and hc.outbox_drain (20260816010008:123) would begin
--     resolving a stage for arrivals that have none;
--   · pgTAP 019:98-110 pins hc.stage_budgets as EXACTLY the five §4.3
--     stages. 'review' is not a §4.3 stage. It is a stage of the LOOP.
--
-- So the foreign key is replaced by a CLOSED CHECK over the known stages.
-- The graph stays closed, seeded, append-by-migration and typo-proof; the
-- worker budget table stays exactly the five worker stages with 019
-- untouched; and no worker can ever lease a review. The invariant is not
-- weakened by accident — it is retired because it stopped being true, and
-- the CHECK carries the part of it that still is.
--
-- ---------------------------------------------------------------------------
-- 2 · THE TERMINALIZATION RULE IS SETTLED HERE, NOT IN THE APP.
--
-- An arrival terminalizes when EVERY LIVE PROPOSAL IS DECIDED — `filed` if
-- at least one closed approved/edited_approved, `nothing_filed` otherwise —
-- evaluated INSIDE THE DECIDING TRANSACTION, so the last decision and the
-- terminal transition commit together or not at all (AC-INBOX-4's letter).
-- 'superseded' and 'void' are pipeline outcomes, not undecided work, so they
-- hold nothing open. The ORIGINAL ARTIFACT IS UNTOUCHED either way:
-- `nothing_filed` files nothing and destroys nothing.
--
-- It is a WRITE HALF, not a definer — hc_internal-owned, granted to nobody,
-- reachable only from inside hc.approve_proposal and hc.reject_proposal, and
-- running AS the calling definer. That is the shipped pattern for
-- hc.draft_proposal / hc.write_extractions / hc.write_proposals, and 002's
-- SECURITY DEFINER exact set stays a boundary list rather than a function
-- list because of it.
--
-- The graph is consulted rather than trusted: the helper asks
-- hc.arrival_transitions for the edge before it moves anything, so the
-- allowlist is the authority for a person's transition exactly as it is for
-- a worker's. A fenced worker lease authorizes its OWN stage's edges, so no
-- pipeline path can file an arrival nobody decided.
--
-- The two reason codes this arm writes were seeded long ago and had never
-- been written by anything: `proposal_approved_filed` and
-- `all_proposals_rejected`. The database had been waiting for this arm.
--
-- ---------------------------------------------------------------------------
-- 3 · THE IDEMPOTENCY IDENTITY GAINS THE DECISION (the ING-11 / 5A-M4
-- pattern, extended). approval_attempts.conflict_outcome made the outcome
-- part of the identity at 5A M4; `decision` makes approve-vs-reject part of
-- it now. WITHOUT IT THERE IS A REAL HOLE, not a theoretical one: the replay
-- branch RETURNS BEFORE the pending check, so a key claimed by a rejection
-- and then presented to hc.approve_proposal would have replayed the
-- rejection's stored result to a caller who asked to approve. 061 case 12
-- drove exactly that on main and got {"status": "approved", ...}.
--
-- The column defaults to 'approve', so every attempt row written since 1B
-- keeps the meaning it always had, and no backfill is required.
--
-- ING-10's exact set (027) is re-pinned in this same commit as the append.
-- 046 needs no re-pin and 061 case 3 CHECKS that rather than claiming it:
-- `filed` and `nothing_filed` have carried their rank and their PRD §4.2.2
-- label since 1D, and this migration adds no enum value.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · The graph: a closed stage list that admits a stage no worker can lease,
--     then the two edges §4.9 has always implied and the graph never had.
-- ----------------------------------------------------------------------------
alter table hc.arrival_transitions
  drop constraint arrival_transitions_stage_fkey;

alter table hc.arrival_transitions
  add constraint arrival_transitions_stage_known
  check (stage in ('store', 'scan', 'gate', 'extract', 'interpret', 'review'));

insert into hc.arrival_transitions (stage, from_state, to_state) values
  ('review', 'proposals_ready'::hc.arrival_state, 'filed'::hc.arrival_state),
  ('review', 'proposals_ready'::hc.arrival_state, 'nothing_filed'::hc.arrival_state)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2 · The idempotency identity gains the decision. Defaulted, so every row
--     written since 1B keeps the meaning it always had.
-- ----------------------------------------------------------------------------
alter table public.approval_attempts
  add column decision text not null default 'approve'
    check (decision in ('approve', 'reject'));

-- A declined proposal is a decision on the record's own trail. 001's
-- event-type count pin is re-pinned in this same commit (22 -> 23).
insert into hc.log_event_types (code, description) values
  ('proposal_rejected', 'A person declined a proposal; the decision and its optional reason are recorded and NOTHING was written to the record');

-- ----------------------------------------------------------------------------
-- 3 · hc.terminalize_decided_arrival — the §4.9 terminal arm as a WRITE HALF
--     (owner-only, reachable from the two deciding definers alone, running AS
--     the calling definer). Returns the arrival's state as it stands after
--     the call, so a caller can report it without a second read.
-- ----------------------------------------------------------------------------
create function hc.terminalize_decided_arrival(p_arrival uuid)
returns hc.arrival_state language plpgsql
set search_path = ''
as $$
declare
  v_state    hc.arrival_state;
  v_circle   uuid;
  v_live     int;
  v_approved int;
  v_to       hc.arrival_state;
  v_reason   text;
begin
  -- The callers already hold the per-circle advisory lock (the R-rule), so
  -- this row lock cannot cycle with hc.advance_arrival, which takes the same
  -- advisory lock before the same row lock.
  select a.state, a.circle_id into v_state, v_circle
    from public.arrivals a where a.id = p_arrival for update;

  -- Only a reviewing arrival terminalizes here. Anything else — cancelled,
  -- already filed, still in the pipeline — is left exactly as it is.
  if v_state is distinct from 'proposals_ready'::hc.arrival_state then
    return v_state;
  end if;

  -- 'superseded' and 'void' are pipeline outcomes, not undecided work.
  select count(*) filter (where p.status = 'pending'),
         count(*) filter (where p.status in ('approved', 'edited_approved'))
    into v_live, v_approved
    from public.proposals p
   where p.arrival_id = p_arrival;

  if v_live > 0 then
    return v_state;                 -- work is still on it; "Needs you" holds
  end if;

  if v_approved > 0 then
    v_to     := 'filed'::hc.arrival_state;
    v_reason := 'proposal_approved_filed';
  else
    v_to     := 'nothing_filed'::hc.arrival_state;
    v_reason := 'all_proposals_rejected';
  end if;

  -- The allowlist is the authority for a person's transition exactly as it
  -- is for a worker's. A missing edge terminalizes nothing.
  if not exists (select 1 from hc.arrival_transitions t
                 where t.stage = 'review'
                   and t.from_state = v_state
                   and t.to_state = v_to) then
    return v_state;
  end if;

  update public.arrivals set state = v_to where id = p_arrival;

  -- attempt 1: a decision is a person's single act, not a leased attempt.
  insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                     reason_code, attempt)
  values (p_arrival, v_circle, v_state, v_to, v_reason, 1);

  return v_to;
end $$;

alter function hc.terminalize_decided_arrival(uuid) owner to hc_internal;
revoke execute on function hc.terminalize_decided_arrival(uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- 4 · hc.reject_proposal — approve's MIRROR. Same version refusal, same
--     idempotency identity, same write-time authorization including M2's
--     view×5 predicate (rejecting a fact you cannot read is as blind as
--     approving one), same freeze refusal, same advisory lock order.
--     It writes status/decided_by/decided_at/reject_reason and NOTHING to
--     the record: no proposal_commits row, no object, no provenance edge.
--
--     The reason is OPTIONAL (§4.2.3's "optional one-tap reason") and its
--     vocabulary is bounded IN THIS MIGRATION, matching the CHECK that has
--     stood at 20260815230001:83 since 1B.
-- ----------------------------------------------------------------------------
create function hc.reject_proposal(
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
  if hc.visible_at(v_ctx, v_prop.subject_id, hc.all_domains(), true,
                   'arrival', v_prop.arrival_id, null) < 'view' then
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
-- 5 · hc.approve_proposal — body as 6A M2 left it (20260824120002), with
--     three deltas, all of them M3's: the decision joins the idempotency
--     identity on the claim AND on the replay, and the terminal arm runs in
--     the deciding transaction before the result is built.
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
