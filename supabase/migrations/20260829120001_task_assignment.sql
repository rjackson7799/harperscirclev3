-- ============================================================================
-- 7A · M1 — task assignment: hc.assign_task · hc.unassign_task
-- (TSD §3.6; PRD §4.5.5, §4.5.6, §7.3; AC-TASK-2/6/7; AC-PERM-10).
-- docs/review/slice-7-plan.md, "Migration bound (Q2)", row M1 — BINDING.
-- Pinned by pgTAP 066, which went red before this existed (45 of 50).
-- NO SHIPPED MIGRATION IS EDITED — this migration only adds, and replaces
-- one trigger-function body (hc.assert_claimed) in the 2A M8 way.
--
-- ---------------------------------------------------------------------------
-- WHAT STOOD IN THE WAY. `tasks.owner_member_id`, `assigned_by`,
-- `assigned_at`, `written_for_member_id` and
-- `object_shares.created_by_assignment_of` have existed since 1B with NO
-- WRITER: `authenticated` holds SELECT alone on `tasks`, `hc.revise_object`'s
-- task allowlist is `title, detail, due_on, due_zone`, and the only place
-- `owner_member_id` was ever written is `hc.remove_member`'s side effect
-- (clearing it). No path, at any layer, let a person hand a task to anyone.
--
-- ---------------------------------------------------------------------------
-- THE ASSIGNEE'S TAINT COMES FROM HER OWN VECTORS, NEVER THE CALLER'S.
-- `hc.ctx_for(assignee_account)` is the caller-selectable identity function
-- (owner-only since 1A; it is reachable here because this body runs as
-- hc_internal), and the question is asked as SHE will meet the policy once
-- the task is hers — `p_owner_member = the assignee` — so rung 4's own-task
-- exception answers for a caregiver exactly as `tasks_select` will.
--
--   · No context on the subject at all (rung 1)  ⇒ refused, no path offered
--     (PRD §4.5.5: "the person is not offered").
--   · Clears the taint at >= summary             ⇒ a PLAIN assignment; a
--     path supplied here is REFUSED — the paths exist only for the
--     crossing, and path 1 would otherwise be a task-creation channel that
--     bypasses hc.approve_proposal.
--   · Cannot clear it                            ⇒ exactly ONE of §4.5.6's
--     two human paths, or refused.
--
-- PATH 1 — THE WRITTEN INSTRUCTION. A new `tasks` row: the TYPED sentence
-- as its title and nothing of the original (not title, not detail — a
-- caller with manage must not be able to launder tainted content through
-- the written-for row), `taint = {schedule}` only "because a person wrote it
-- knowing who would read it", `written_for_member_id` and the new
-- `written_from_task_id` set, approved by the writer, NO arrival and NO
-- proposal behind it. The due date rides along (a date is what §7.6's own
-- log-level sentence already discloses). It is NOT a provenance edge:
-- hc.link_provenance grows the child by the parent's surplus, which would
-- put {health} straight back on the copy — the whole point of path 1 is
-- that it is its own object. The ORIGINAL is assigned to her too (the
-- assignment is a fact on the original; the instruction is what she reads)
-- and keeps its taint, so it stays invisible to her: rung 4 is a ceiling
-- EXCEPTION, not a grant, and the ladder over {schedule,health} still says
-- hidden. 066:17 drives exactly that.
--
-- The instruction claims no `proposal_commits` row, so the 1B claim
-- machinery is widened by EXACTLY the instruction's shape and nothing else:
-- a second INSERT policy on `tasks` and one extra branch in
-- `hc.assert_claimed`, both requiring the pair (written_for AND
-- written_from) and NO source arrival or proposal, and the policy pinning
-- `taint = {schedule}` besides. 066:20-21 drive both edges.
--
-- PATH 2 — THE EXPLICIT NAMED SHARE. `object_shares` rows on the task AND
-- the named document, created together, both `created_by_assignment_of =
-- the task`, behind the §5.7 step-up: operation `share_object` (sharing an
-- object is on §5.7's list and assignment gets no cheaper door), target
-- `task:<id>+document:<id>` — BOTH named, so a token minted for one object
-- cannot be spent on two, and a token minted for this pair cannot be spent
-- through hc.share_object on either alone. The document must be this
-- circle's AND this subject's, and the caller must hold manage on it —
-- share_object's own bar. A live FOREIGN share on either object (one this
-- assignment did not create) is neither duplicated nor adopted: it stays
-- nobody's assignment, which is what lets unassign leave it alone.
--
-- POST-CONDITION, asserted from the assignee's LIVE vectors after the
-- writes: an assignment never yields a task its holder cannot see. If the
-- written task or the shared task is still hidden from her (no schedule
-- grant for a written task; unresolved lineage, which rung 3 hides from a
-- share), the whole call refuses and rolls back. This is what makes the
-- interface's answer (computed from hc.circle_people at 7B) and the
-- database's unable to disagree.
--
-- REASSIGN = unassign + assign in ONE transaction: every share carrying
-- `created_by_assignment_of = task` is revoked (no keep list on a reassign —
-- the new person gets their own act), the written instruction is closed,
-- the whole check re-runs against the new person, and ONE `task_reassigned`
-- entry names the former holder.
--
-- UNASSIGN revokes EXACTLY this assignment's shares — a foreign share is
-- untouched (SHR-02 one way) and a coordinator may keep one by id (SHR-02
-- the other way; keeping is a coordinator's explicit decision, and every
-- kept id must be THIS assignment's live share or the whole call refuses —
-- the remove_member precedent). It closes the written instruction
-- (`status = 'cancelled'`) and logs `task_unassigned` in the PRD §8.8 shape.
--
-- FREEZE: assignment is a widening act and refuses with the NAMED
-- `freeze_active` (PRD §7.5, "no new grants"); unassignment reduces reach
-- and is permitted (the remove_member precedent). Both run under the
-- per-circle advisory lock (the R-rule): everything authorization depends
-- on is read UNDER the lock, and the task row is locked FOR UPDATE so two
-- assignments, or an assignment and an unassignment, serialise on the row.
--
-- THE AI HAS NO PATH INTO THIS FUNCTION (PRD §6.5, AC-TASK-2): hc_pipeline
-- holds no EXECUTE, and nothing here calls anything that could. Refusals
-- are one shape per function (`assign_refused` / `unassign_refused`,
-- DEF-10), the freeze's named signature excepted.
--
-- `hc.revise_object`'s task allowlist is NOT widened (066:47).
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('task_assigned',   'A task was handed to a member by a person (plain, or by a written instruction, or by an explicit named share)'),
  ('task_reassigned', 'A task changed holder: the prior assignment''s shares revoked and its instruction closed, the new assignment made, in one transaction');

-- ----------------------------------------------------------------------------
-- The instruction's origin. `written_for_member_id` has said WHO since 1B;
-- this says FROM WHAT, so unassigning the original can close the instruction
-- and the coordinator's view of the original can name it. Circle-consistent
-- (§2.1) and indexed (§3.12), like every FK in the record.
-- ----------------------------------------------------------------------------
alter table public.tasks add column written_from_task_id uuid;
alter table public.tasks
  add constraint tasks_circle_id_written_from_task_id_fkey
  foreign key (circle_id, written_from_task_id) references public.tasks (circle_id, id);
create index tasks_by_written_from on public.tasks (written_from_task_id);
-- An instruction is written FOR someone FROM something: the pair travels
-- together, so no row can wear half of it.
alter table public.tasks
  add constraint tasks_instruction_pair
  check ((written_from_task_id is null) = (written_for_member_id is null));
comment on column public.tasks.written_from_task_id is
  'PRD §4.5.6 path 1: the task this written instruction stands in for. Set with written_for_member_id, never alone. The original keeps its taint; this row carries {schedule} only.';

-- ----------------------------------------------------------------------------
-- The claim machinery, widened by exactly the instruction's shape.
-- ----------------------------------------------------------------------------
create policy tasks_internal_write_instruction on public.tasks
  for insert to hc_internal
  with check (
        written_for_member_id is not null
    and written_from_task_id is not null
    and source_arrival_id is null
    and source_proposal_id is null
    and taint = '{schedule}'::hc.domain[]
    and taint_resolved);

create or replace function hc.assert_claimed() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  n jsonb := to_jsonb(new);
begin
  -- 7A M1: a written instruction (TSD §3.6 path 1) is a person's own
  -- sentence, not an approved proposal, and claims no commit row. The
  -- exemption is the pair AND no source — anything narrower is still a
  -- record write and still needs its claim. tasks_internal_write_instruction
  -- is the other half (it additionally pins the taint).
  if tg_argv[0] = 'task'
     and (n ->> 'written_for_member_id') is not null
     and (n ->> 'written_from_task_id') is not null
     and (n ->> 'source_arrival_id') is null
     and (n ->> 'source_proposal_id') is null then
    return new;
  end if;

  if not exists (select 1 from public.proposal_commits pc
                 where pc.object_type = tg_argv[0]::hc.object_type
                   and pc.object_id = (n ->> 'id')::uuid) then
    raise exception 'record_write_unclaimed' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way);
-- it stays a definer (002's set) and granted to nobody.
alter function hc.assert_claimed() owner to hc_internal;
revoke execute on function hc.assert_claimed()
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.assign_task
-- ----------------------------------------------------------------------------
create function hc.assign_task(
  p_task uuid, p_member uuid,
  p_instruction text default null,
  p_share_document uuid default null,
  p_step_up_token text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_task record;
  v_member record;
  v_doc record;
  v_ctx jsonb;
  v_ctx_a jsonb;
  v_path text;
  v_now timestamptz := now();
  v_former uuid;
  v_former_name text;
  v_instr uuid;
  v_sh_task uuid;
  v_sh_doc uuid;
  v_revoked int := 0;
  v_closed int := 0;
  r record;
begin
  if v_actor is null then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- Exactly one path, or none; an empty instruction is no instruction.
  if p_instruction is not null and p_share_document is not null then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;
  if p_instruction is not null and btrim(p_instruction) = '' then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- Discovery only — the lock is keyed on the circle.
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null;
  if v_task.id is null then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- R-rule: serialise with grant changes, removals, freezes and every other
  -- record writer in this circle; then RE-READ everything under the lock,
  -- the task row itself FOR UPDATE.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_task.circle_id::text));
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null
   for update;
  if v_task.id is null or v_task.status <> 'open' then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- The assignee: live, account-holding, this circle. A subject-member row
  -- has nobody to do the work.
  select m.* into v_member from public.circle_members m
   where m.id = p_member
     and m.circle_id = v_task.circle_id
     and m.removed_at is null
     and m.account_id is not null;
  if v_member.id is null then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- PRD §7.5: no new grants under any freeze — handing a task to someone
  -- is a widening act, and the refusal is NAMED (set_grant's raise arm).
  if exists (select 1 from public.freezes f
             where f.circle_id = v_task.circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- The CALLER: manage on the task, from the caller's own context, read
  -- under the lock (PRD §7.3: manage can assign; view cannot change
  -- others' items).
  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_task.subject_id, v_task.taint, v_task.taint_resolved,
                   'task', p_task, v_task.owner_member_id) < 'manage' then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- Already hers: a quiet no-op (the set_grant precedent) — unless a path
  -- was supplied, which is a crossing that is not happening.
  if v_task.owner_member_id = p_member then
    if p_instruction is not null or p_share_document is not null then
      raise exception 'assign_refused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('task_id', p_task, 'member_id', p_member,
                              'path', 'plain', 'changed', false);
  end if;

  -- THE ASSIGNEE'S OWN VECTORS, never the caller's. No context on the
  -- subject at all ⇒ refused, no path offered (PRD §4.5.5).
  v_ctx_a := hc.ctx_for(v_member.account_id);
  if v_ctx_a -> 'subjects' -> v_task.subject_id::text is null then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- Can she clear the taint? Asked as she will meet the policy once the task
  -- is hers (owner = her), so the care-circle own-task rung answers here
  -- exactly as tasks_select will.
  if hc.visible_at(v_ctx_a, v_task.subject_id, v_task.taint, v_task.taint_resolved,
                   'task', p_task, p_member) >= 'summary' then
    if p_instruction is not null or p_share_document is not null then
      -- the paths exist only for the crossing
      raise exception 'assign_refused' using errcode = 'P0001';
    end if;
    v_path := 'plain';
  elsif p_instruction is not null then
    v_path := 'instruction';
  elsif p_share_document is not null then
    v_path := 'share';
  else
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- Path 2's two bars come BEFORE any write: the §5.7 token bound to the
  -- pair (consumption is in-transaction, so a later refusal rolls the burn
  -- back), then the document — this circle, THIS subject, and manage on it.
  if v_path = 'share' then
    if p_step_up_token is null
       or not hc.consume_step_up(p_step_up_token, 'share_object',
                'task:' || p_task::text || '+document:' || p_share_document::text,
                v_actor) then
      raise exception 'assign_refused' using errcode = 'P0001';
    end if;
    select * into v_doc from hc.resolve_object('document', p_share_document);
    if v_doc.circle_id is null
       or v_doc.circle_id <> v_task.circle_id
       or v_doc.subject_id <> v_task.subject_id then
      raise exception 'assign_refused' using errcode = 'P0001';
    end if;
    if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                     'document', p_share_document, null) < 'manage' then
      raise exception 'assign_refused' using errcode = 'P0001';
    end if;
  end if;

  -- REASSIGN: close what the previous assignment created (AC-TASK-7) before
  -- the new person's act. No keep list on a reassign.
  v_former := v_task.owner_member_id;
  if v_former is not null then
    select m.display_name_at_join into v_former_name
      from public.circle_members m where m.id = v_former;
    for r in
      update public.object_shares sh
         set revoked_at = v_now
       where sh.created_by_assignment_of = p_task
         and sh.revoked_at is null
      returning sh.object_type, sh.object_id, sh.member_id
    loop
      v_revoked := v_revoked + 1;
      perform hc.log(v_task.circle_id, 'object_share_revoked', v_actor_name,
                     p_actor_account_id => v_actor,
                     p_subject_id => v_task.subject_id,
                     p_target_member_id => r.member_id,
                     p_object_type => r.object_type, p_object_id => r.object_id,
                     p_detail => jsonb_build_object('assignment_of', p_task));
    end loop;
    for r in
      update public.tasks i
         set status = 'cancelled'
       where i.written_from_task_id = p_task
         and i.status = 'open'
         and i.deleted_at is null
      returning i.id
    loop
      v_closed := v_closed + 1;
    end loop;
  end if;

  -- The assignment itself: a fact on the original, whichever path.
  update public.tasks
     set owner_member_id = p_member, assigned_by = v_actor, assigned_at = v_now
   where id = p_task;

  if v_path = 'instruction' then
    -- The typed sentence and NOTHING of the original (066:15).
    insert into public.tasks
      (circle_id, subject_id, title, due_on, due_zone,
       owner_member_id, assigned_by, assigned_at,
       written_for_member_id, written_from_task_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_task.circle_id, v_task.subject_id, btrim(p_instruction),
       v_task.due_on, v_task.due_zone,
       p_member, v_actor, v_now,
       p_member, p_task,
       v_actor, v_now, v_actor_name, '{schedule}'::hc.domain[], true)
    returning id into v_instr;

  elsif v_path = 'share' then
    -- Both shares together; a live FOREIGN share on either object is left
    -- exactly as it is — it is not this assignment's to revoke (SHR-02).
    insert into public.object_shares
      (circle_id, subject_id, object_type, object_id, member_id, granted_by,
       created_by_assignment_of)
    select v_task.circle_id, v_task.subject_id, 'task', p_task, p_member, v_actor, p_task
     where not exists (select 1 from public.object_shares sh
                        where sh.object_type = 'task' and sh.object_id = p_task
                          and sh.member_id = p_member and sh.revoked_at is null)
    returning id into v_sh_task;
    insert into public.object_shares
      (circle_id, subject_id, object_type, object_id, member_id, granted_by,
       created_by_assignment_of)
    select v_task.circle_id, v_task.subject_id, 'document', p_share_document, p_member,
           v_actor, p_task
     where not exists (select 1 from public.object_shares sh
                        where sh.object_type = 'document' and sh.object_id = p_share_document
                          and sh.member_id = p_member and sh.revoked_at is null)
    returning id into v_sh_doc;
    if v_sh_task is not null then
      perform hc.log(v_task.circle_id, 'object_shared', v_actor_name,
                     p_actor_account_id => v_actor,
                     p_subject_id => v_task.subject_id,
                     p_target_member_id => p_member,
                     p_object_type => 'task', p_object_id => p_task,
                     p_detail => jsonb_build_object('assignment_of', p_task));
    end if;
    if v_sh_doc is not null then
      perform hc.log(v_task.circle_id, 'object_shared', v_actor_name,
                     p_actor_account_id => v_actor,
                     p_subject_id => v_task.subject_id,
                     p_target_member_id => p_member,
                     p_object_type => 'document', p_object_id => p_share_document,
                     p_detail => jsonb_build_object('assignment_of', p_task));
    end if;
  end if;

  -- POST-CONDITION: she sees it now, from her own LIVE vectors re-read
  -- after the writes. Otherwise the whole call refuses and rolls back.
  v_ctx_a := hc.ctx_for(v_member.account_id);
  if v_path = 'instruction' then
    if hc.visible_at(v_ctx_a, v_task.subject_id, '{schedule}'::hc.domain[], true,
                     'task', v_instr, p_member) < 'summary' then
      raise exception 'assign_refused' using errcode = 'P0001';
    end if;
  elsif hc.visible_at(v_ctx_a, v_task.subject_id, v_task.taint, v_task.taint_resolved,
                      'task', p_task, p_member) < 'summary' then
    raise exception 'assign_refused' using errcode = 'P0001';
  end if;

  -- AC-TASK-2: a human actor, every time.
  perform hc.log(v_task.circle_id,
                 case when v_former is null then 'task_assigned' else 'task_reassigned' end,
                 v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_task.subject_id,
                 p_target_member_id => p_member,
                 p_object_type => 'task', p_object_id => p_task,
                 p_detail => jsonb_strip_nulls(jsonb_build_object(
                   'path', v_path,
                   'instruction_task_id', v_instr,
                   'shared_document_id', case when v_path = 'share' then p_share_document end,
                   'share_ids', case when v_path = 'share'
                                     then jsonb_strip_nulls(jsonb_build_array(v_sh_task, v_sh_doc)) end,
                   'former_owner_member_id', v_former,
                   'former_owner_name', v_former_name,
                   'shares_revoked', case when v_former is not null then v_revoked end,
                   'instructions_closed', case when v_former is not null then v_closed end)));

  return jsonb_strip_nulls(jsonb_build_object(
    'task_id', p_task, 'member_id', p_member, 'path', v_path, 'changed', true,
    'instruction_task_id', v_instr,
    'share_ids', case when v_path = 'share'
                      then jsonb_strip_nulls(jsonb_build_array(v_sh_task, v_sh_doc)) end,
    'former_member_id', v_former,
    'shares_revoked', case when v_former is not null then v_revoked end,
    'instructions_closed', case when v_former is not null then v_closed end));
end $$;

alter function hc.assign_task(uuid, uuid, text, uuid, text) owner to hc_internal;
revoke execute on function hc.assign_task(uuid, uuid, text, uuid, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.assign_task(uuid, uuid, text, uuid, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- hc.unassign_task
-- ----------------------------------------------------------------------------
create function hc.unassign_task(p_task uuid, p_keep_share_ids uuid[] default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_task record;
  v_keep uuid[] := coalesce(p_keep_share_ids, '{}'::uuid[]);
  v_now timestamptz := now();
  v_former uuid;
  v_former_name text;
  v_revoked int := 0;
  v_closed int := 0;
  r record;
begin
  if v_actor is null then
    raise exception 'unassign_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'unassign_refused' using errcode = 'P0001';
  end if;

  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null;
  if v_task.id is null then
    raise exception 'unassign_refused' using errcode = 'P0001';
  end if;

  -- R-rule, then the re-read FOR UPDATE. No freeze check: unassignment
  -- reduces reach (the remove_member precedent).
  perform pg_advisory_xact_lock(hashtext('taint:' || v_task.circle_id::text));
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null
   for update;
  if v_task.id is null or v_task.status <> 'open' or v_task.owner_member_id is null then
    raise exception 'unassign_refused' using errcode = 'P0001';
  end if;

  -- Manage on the task, from the caller's own context under the lock. A
  -- freeze hides the task from EVERYONE (rung 2, and the FRZ-13 cap for the
  -- carved-out coordinator), yet unassignment REDUCES reach — so under a
  -- freeze a live coordinator may still perform it: the remove_member
  -- precedent (an upheld finding is executed by reducing), and set_grant's
  -- lower arm. Nobody else, and nothing wider.
  if hc.visible_at(hc.ctx(), v_task.subject_id, v_task.taint, v_task.taint_resolved,
                   'task', p_task, v_task.owner_member_id) < 'manage'
     and not (exists (select 1 from public.freezes f
                      where f.circle_id = v_task.circle_id
                        and f.state in ('open', 'unresolved'))
              and exists (select 1 from public.circle_members m
                          where m.circle_id = v_task.circle_id
                            and m.account_id = v_actor
                            and m.removed_at is null
                            and m.tier = 'coordinator')) then
    raise exception 'unassign_refused' using errcode = 'P0001';
  end if;

  -- Keeping a share past its assignment is a COORDINATOR's explicit
  -- decision (AC-TASK-7), and every kept id must be THIS assignment's live
  -- share, or the whole call refuses.
  if cardinality(v_keep) > 0 then
    if not exists (select 1 from public.circle_members m
                   where m.circle_id = v_task.circle_id
                     and m.account_id = v_actor
                     and m.removed_at is null
                     and m.tier = 'coordinator') then
      raise exception 'unassign_refused' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_keep) k
               where not exists (select 1 from public.object_shares sh
                                 where sh.id = k
                                   and sh.created_by_assignment_of = p_task
                                   and sh.revoked_at is null)) then
      raise exception 'unassign_refused' using errcode = 'P0001';
    end if;
  end if;

  v_former := v_task.owner_member_id;
  select m.display_name_at_join into v_former_name
    from public.circle_members m where m.id = v_former;

  update public.tasks
     set owner_member_id = null, assigned_by = null, assigned_at = null
   where id = p_task;

  -- EXACTLY this assignment's shares: created_by_assignment_of = this task,
  -- live, not kept. A foreign share never matches (SHR-02).
  for r in
    update public.object_shares sh
       set revoked_at = v_now
     where sh.created_by_assignment_of = p_task
       and sh.revoked_at is null
       and not (sh.id = any (v_keep))
    returning sh.object_type, sh.object_id, sh.member_id
  loop
    v_revoked := v_revoked + 1;
    perform hc.log(v_task.circle_id, 'object_share_revoked', v_actor_name,
                   p_actor_account_id => v_actor,
                   p_subject_id => v_task.subject_id,
                   p_target_member_id => r.member_id,
                   p_object_type => r.object_type, p_object_id => r.object_id,
                   p_detail => jsonb_build_object('assignment_of', p_task));
  end loop;

  -- The written instruction is closed, never deleted (§4.5.3).
  for r in
    update public.tasks i
       set status = 'cancelled'
     where i.written_from_task_id = p_task
       and i.status = 'open'
       and i.deleted_at is null
    returning i.id
  loop
    v_closed := v_closed + 1;
  end loop;

  perform hc.log(v_task.circle_id, 'task_unassigned', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_task.subject_id,
                 p_target_member_id => v_former,
                 p_object_type => 'task', p_object_id => p_task,
                 p_detail => jsonb_build_object(
                   'former_owner_member_id', v_former,
                   'former_owner_name', v_former_name,
                   'shares_revoked', v_revoked,
                   'shares_kept', cardinality(v_keep),
                   'instructions_closed', v_closed));

  return jsonb_build_object(
    'task_id', p_task,
    'former_member_id', v_former,
    'former_owner_name', v_former_name,
    'shares_revoked', v_revoked,
    'shares_kept', cardinality(v_keep),
    'instructions_closed', v_closed);
end $$;

alter function hc.unassign_task(uuid, uuid[]) owner to hc_internal;
revoke execute on function hc.unassign_task(uuid, uuid[])
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.unassign_task(uuid, uuid[]) to authenticated;
