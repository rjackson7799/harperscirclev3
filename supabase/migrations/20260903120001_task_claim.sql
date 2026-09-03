-- ============================================================================
-- 8A · M1 — task claim: hc.claim_task (PRD §4.5.1 "Claims, reassigns,
-- completes, snoozes, adds"; AC-TASK-1's claim half; AC-TASK-2; PRD §6.5;
-- ADR-0036 Q-D; ADR-0032 D8). docs/review/slice-8-plan.md, "Migration
-- bound (Q2)", row M1 — BINDING. Pinned by pgTAP 070, which went red before
-- this existed (28 of 40). NO SHIPPED MIGRATION IS EDITED — this migration
-- only adds: one event type, one function.
--
-- ---------------------------------------------------------------------------
-- WHAT STOOD IN THE WAY. 7A shipped hand-to-someone (hc.assign_task, manage
-- only) and close-and-snooze (hc.complete_task, hc.snooze_task); nothing let
-- a member below manage take an open task for herself. ADR-0032 D8 recorded
-- it — "Claim (self-assignment) is NOT provided … the build failed closed" —
-- and ADR-0036 Q-D ruled it to slice 8 rather than to a 7B/7C amendment.
-- ADR-0033 Q-H: "does not silently remove it". This is that function.
--
-- ---------------------------------------------------------------------------
-- THE SAFETY ARGUMENT — why this sits at view and assign_task does not.
-- assign_task moves work to SOMEONE ELSE, and §4.5.6's two human paths exist
-- because the assignee may not be able to read what she is handed: hence a
-- written-instruction row, or an explicit named share, and hence manage. A
-- claim moves work to the CALLER, and the caller must already read the task
-- at >= view through hc.visible_at on her OWN vectors (hc.ctx()), asked of
-- the task AS IT STANDS — owner_member_id null — so a care-circle member's
-- rung-4 ceiling answers exactly as tasks_select answers for her today:
-- hidden, unless a named share already widens the one object. §4.5.6's
-- taint collision cannot arise, because the claimant IS the reader. So: no
-- share row, no instruction row, no path parameter — the function takes ONE
-- argument, the task, and cannot name anyone else.
--
-- WHY view AND NOT summary (plan Q2: "summary-may-claim … rejected"):
-- summary is a title; view is the task. Work is taken by someone who can
-- read it. (complete_task's holder bar is summary because the work was
-- HANDED to her and the care ceiling is summary; nothing is handed here.)
--
-- REFUSALS ARE ONE SHAPE — claim_refused — for a non-reader, an owned task
-- (even her own: moving held work is unassign + assign and stays manage's),
-- a summary holder, a done or deleted or nonexistent task, an instruction
-- row (ADR-0033 cluster C: never assigned onward), a stranger, AND a frozen
-- circle. The freeze is deliberately NOT named here, where assign_task and
-- complete_task name it to members: it reaches this function through
-- hc.visible_at rung 2 alone — the plan's row M1, "refused under freeze
-- through the same one function" — so the refusal is not an oracle for the
-- circle's state either. (8C's surface says a freeze from what it already
-- knows: hc.circle_people carries `frozen`.)
--
-- THE WRITE is the three assignment columns — owner_member_id = the caller's
-- member row, assigned_by = the caller's own account, assigned_at — the same
-- columns assign_task writes, so unassign_task, assign_task (reassign, which
-- names her as the former holder), remove_member and complete_task read a
-- claimed task exactly as a handed one. THE LOG ENTRY is task_claimed,
-- distinct from task_assigned, with the claimant as actor AND target: the
-- log can tell "handed to you" from "you took it" — AC-TASK-2's human actor
-- either way (070:8).
--
-- Under the per-circle advisory lock (the R-rule): the row is re-read FOR
-- UPDATE and the context is read UNDER the lock, so two claimants serialise
-- and the second re-reads an owned row — one owner, one task_claimed
-- (concurrency case 55; 070:15 is the serial half). THE AI HAS NO PATH:
-- hc_pipeline holds no EXECUTE (PRD §6.5, AC-TASK-2; 070:3, 002).
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('task_claimed', 'A member took an unassigned open task for herself — the claimant is the actor, and no share or instruction was created');

-- ----------------------------------------------------------------------------
-- hc.claim_task
-- ----------------------------------------------------------------------------
create function hc.claim_task(p_task uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_task record;
  v_me uuid;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;

  -- Discovery only — the lock is keyed on the circle.
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null;
  if v_task.id is null then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;

  -- R-rule: serialise with every other record writer in this circle, then
  -- RE-READ everything under the lock, the task row itself FOR UPDATE.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_task.circle_id::text));
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null
   for update;
  if v_task.id is null or v_task.status <> 'open' then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;
  -- An instruction is what its holder reads of the original, never work of
  -- its own (ADR-0033 cluster C).
  if v_task.written_from_task_id is not null then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;

  -- The caller's OWN vectors, read under the lock, asked of the task AS IT
  -- STANDS: the current holder (null, for the task this function is for),
  -- so a care-circle member meets rung 4 exactly as tasks_select puts it to
  -- her — hidden unless a named share widens the one object. view claims;
  -- summary does not; the freeze is rung 2 and needs no name of its own.
  if hc.visible_at(hc.ctx(), v_task.subject_id, v_task.taint, v_task.taint_resolved,
                   'task', p_task, v_task.owner_member_id) < 'view' then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;

  -- Unassigned only. Hers already, or someone else's: the same refusal —
  -- moving held work is unassign + assign, and that stays manage's.
  if v_task.owner_member_id is not null then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;

  -- Her live member row in the task's circle. A reader at >= view has one;
  -- the lookup is what the assignment columns are written FROM.
  select m.id into v_me from public.circle_members m
   where m.circle_id = v_task.circle_id
     and m.account_id = v_actor
     and m.removed_at is null;
  if v_me is null then
    raise exception 'claim_refused' using errcode = 'P0001';
  end if;

  -- The claim: the columns assign_task writes, nothing else — no share, no
  -- instruction, no row.
  update public.tasks
     set owner_member_id = v_me, assigned_by = v_actor, assigned_at = v_now
   where id = p_task;

  -- AC-TASK-2: a human actor. The claimant is actor AND target, so the
  -- entry reads "you took it", not "handed to you".
  perform hc.log(v_task.circle_id, 'task_claimed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_task.subject_id,
                 p_target_member_id => v_me,
                 p_object_type => 'task', p_object_id => p_task);

  return jsonb_build_object('task_id', p_task, 'member_id', v_me,
                            'claimed_at', v_now);
end $$;

alter function hc.claim_task(uuid) owner to hc_internal;
revoke execute on function hc.claim_task(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.claim_task(uuid) to authenticated;
