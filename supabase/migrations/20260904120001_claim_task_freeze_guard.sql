-- ============================================================================
-- 9A · M1 — claim_task_freeze_guard: hc.claim_task carries the explicit
-- freeze test its three siblings carry (FRZ-17; docs/owed.md OW-27;
-- ADR-0043 D2, ruling round 30 Q-F with round 28 Q-A).
-- docs/review/slice-9-plan.md, Q2 row M1 and Q3 — BINDING. Tier 1.
-- Pinned by pgTAP 070:43–45, which went RED before this existed (43/45),
-- and by 002:21, which went RED naming hc.claim_task (21/22).
--
-- NO SHIPPED MIGRATION IS EDITED. This is a `create or replace` over the
-- same function in a NEW migration; 20260903120001 is untouched and stays
-- the record of what 8A shipped and why.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG. 20260903120001's header argued: "the freeze … reaches this
-- function through hc.visible_at rung 2 alone" and "the freeze is rung 2 and
-- needs no name of its own". Rung 2 closes an OPEN freeze for everyone. It
-- does not close an UNRESOLVED one for a coordinator who is not the
-- objected-to member: hc.grant_vectors (20260815230009) hands her
-- `frozen = false` and `cap = 'view'`, and hc.visible_at applies the cap as
-- its FINAL step — least(result, cap). `view` is exactly this function's
-- admission floor. SHE COULD TAKE A TASK WHILE THE CIRCLE WAS FROZEN.
--
-- FRZ-13's carve-out is READ-ONLY BY INTENT on three independent sources:
-- 20260815230009's own header ("the unresolved READ-ONLY carve-out"),
-- FRZ-13's coverage row (the same words), and the structure — assign_task,
-- complete_task and snooze_task each raise from an explicit
-- `state in ('open','unresolved')` test against public.freezes that never
-- consults hc.grant_vectors, so "no write under any freeze" is already
-- written out three times. This is the fourth.
--
-- ---------------------------------------------------------------------------
-- WHERE THE GUARD SITS, AND WHY THAT IS THE WHOLE FIX. Immediately after the
-- FOR UPDATE re-read and the status check, and BEFORE the level test —
-- exactly where complete_task's and snooze_task's sit (20260829120002:123
-- and :202; assign_task's is 20260829120001:253). A guard placed BELOW the
-- level test would be the same defect wearing a fix: hc.visible_at applies
-- the cap as least(…), so a capped coordinator reaches `view` and passes the
-- level test — the guard would never be consulted for the one caller it
-- exists for. Above the level test, no cap can lower it and no vector can
-- reach it, because it reads public.freezes and nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY IT STILL RAISES claim_refused AND NOT freeze_active. The siblings name
-- the freeze to members; this function deliberately does not, and that was
-- argued in 8A and PINNED by 070:32–34 — "a member at view, a member at
-- manage and a stranger meet ONE string … the refusal is not an oracle for
-- the circle's state". FRZ-17's condition is that this function "carries the
-- same explicit `state in ('open','unresolved')` TEST its three siblings
-- carry"; it does not ask for their raise, and adopting one would un-green
-- three merged TSK-05 assertions to buy a reader an oracle 8A refused her.
-- THE TEST IS THE FIX. The string is unchanged.
--
-- ---------------------------------------------------------------------------
-- THE REFUSAL SET, STATED EXACTLY (OW-31; ADR-0044 D4, round 31 F-4).
-- 20260903120001's header said "a done or deleted or nonexistent task" and
-- 070 built no soft-deleted row at all, while `cancelled` — the third value
-- tasks.status admits (20260815230002:122) and the second thing
-- `status <> 'open'` refuses — was named nowhere. Narrowing that header is
-- unavailable, because it is shipped. So this one states the set, and 070
-- now builds every member of it. ONE SHAPE, claim_refused, for:
--   · no actor, or an actor with no accounts row
--   · a task that does not exist, or is SOFT-DELETED (deleted_at not null)
--   · a task whose status is DONE or CANCELLED — anything but `open`
--   · a FROZEN circle: `open` OR `unresolved`, by the explicit test below,
--     no longer by rung 2 alone
--   · an instruction row (written_from_task_id not null; ADR-0033 cluster C)
--   · a caller below `view` on the task from her OWN vectors
--   · a task that is already held — even by her
--   · a caller with no live member row in the task's circle
-- Eight arms, one string, and nothing in the string tells them apart.
--
-- ---------------------------------------------------------------------------
-- THE INVARIANT, NOT JUST THE INSTANCE (OW-30; ADR-0044 D3, round 31 F-3).
-- This function was the only hc.* write definer in the tree admitting below
-- `manage`, so "the carve-out is read-only" held by a COINCIDENCE OF
-- THRESHOLDS. 002:21 now pins the class over pg_proc — an hc definer that
-- reads hc.visible_at and writes must test public.freezes, exempt set pinned
-- by name — so the next one fails there rather than four rounds later.
--
-- Everything else about this function is 8A's and is restated unchanged: one
-- argument, the R-rule advisory lock, the caller's OWN vectors read under the
-- lock against the task AS IT STANDS, the three assignment columns, the
-- task_claimed entry with the claimant as actor AND target, no share and no
-- instruction row by any path. The owner/revoke/grant trio is restated in
-- this same migration (the 2A M8 way): a `create or replace` keeps the
-- existing owner and ACL, but a migration that relies on that leaves the
-- privileges of a definer implicit, and 002:1/:3/:5/:6 are the exact-set pins
-- that would catch it a slice too late.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.claim_task — 8A's body, plus the freeze guard.
-- ----------------------------------------------------------------------------
create or replace function hc.claim_task(p_task uuid)
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

  -- PRD §7.5: no write under any freeze. THE FIX (FRZ-17 / OW-27). Read
  -- straight from public.freezes and never through hc.grant_vectors, so no
  -- cap and no vector can lower it — the same test, in the same place,
  -- as assign_task, complete_task and snooze_task. It sits ABOVE the level
  -- test on purpose: below it, FRZ-13's `least(result, cap)` lets a
  -- non-objected-to coordinator reach `view` and the guard is never asked.
  -- The raise stays claim_refused: 8A ruled the freeze unnameable here and
  -- 070:32–34 pin the ONE shape.
  if exists (select 1 from public.freezes f
             where f.circle_id = v_task.circle_id
               and f.state in ('open', 'unresolved')) then
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
  -- summary does not. The freeze no longer rides here.
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

-- The trio, restated (the 2A M8 way): a create-or-replace keeps the owner
-- and the ACL, and a migration that leans on that leaves a definer's
-- privileges implicit. 002:1 (owner), :3 (the definer set), :5 (no PUBLIC
-- EXECUTE) and :6 (the exact grant set) are what would otherwise catch a
-- regression here a slice late.
alter function hc.claim_task(uuid) owner to hc_internal;
revoke execute on function hc.claim_task(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.claim_task(uuid) to authenticated;
