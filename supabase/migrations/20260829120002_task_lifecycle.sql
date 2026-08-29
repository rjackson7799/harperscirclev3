-- ============================================================================
-- 7A · M2 — task lifecycle: hc.complete_task · hc.snooze_task
-- (PRD §4.5.1, §4.5.3, §4.5.4, §4.6.4, §7.3; AC-TASK-1's second half,
-- AC-TASK-2). docs/review/slice-7-plan.md, "Migration bound (Q2)", row M2
-- — BINDING. Pinned by pgTAP 067, which went red before this existed.
-- NO SHIPPED MIGRATION IS EDITED — this migration only adds.
--
-- ---------------------------------------------------------------------------
-- WHAT STOOD IN THE WAY. `status`, `completed_by`, `completed_at` and
-- `snooze_count` have existed since 1B with no writer: `hc.revise_object`'s
-- task allowlist is `title, detail, due_on, due_zone`, and `status` is
-- written only by hc.remove_member's side effects and by M1's instruction
-- closure. §4.6.4's counts ("what they have completed") could never become
-- true facts.
--
-- ---------------------------------------------------------------------------
-- WHO MAY COMPLETE, AND THE ONE ARGUED LINE. PRD §7.3 says `view` "can
-- complete work assigned to them" and `manage` can change anything in the
-- domain. This function lets:
--   · the HOLDER close the work she was handed, at any level at which she
--     can SEE it as its holder (>= summary);
--   · a manage-holder close it for anyone, or close work nobody holds.
-- The holder's bar is `summary` rather than §7.3's `view`, and the reason
-- is the care ceiling: a caregiver's ceiling is `schedule: summary` and her
-- whole slice is "her assigned tasks" (PRD §7.4). A `view` bar would make
-- every task handed to a caregiver — and every path-1 instruction, which
-- exists so she can ACT — one she could read and never finish, and it would
-- make the family tier's default (schedule: summary) unable to close a task
-- handed to a sibling, which is AC-TASK-1's own sentence. §7.3's table
-- describes what each level SEES; what the holder may DO with work handed
-- to her is decided here, recorded here, and put to round 24 as a pointed
-- question. A non-holder below manage is refused whatever her level ("view
-- … cannot change others' items"), so nothing widens beyond the holder.
--
-- SNOOZE moves the date FORWARD and records that it did (§4.5.4: "by whom
-- and how many times"): due_on/due_zone, snooze_count + 1, ONE
-- record_revisions row per snooze naming the actor, and a task_snoozed
-- entry with both dates and the count. An earlier date is an edit, not a
-- snooze, and goes through hc.revise_object; a task with no date has no
-- date to move; the due pair travels together so `tasks_check` never
-- reaches a person as a raw 23514 (the 6B S16.8 discipline).
--
-- Both run under the per-circle advisory lock (the R-rule), re-read the
-- task FOR UPDATE, and refuse under a freeze with the NAMED freeze_active —
-- a freeze suspends ALL interactive access (§3.8), and neither verb is a
-- reduction. Done is terminal: a completed task is never deleted (§4.5.3,
-- §4.6.4), stays readable, and cannot be completed or snoozed again.
-- Refusals are one shape per function (DEF-10). The AI role holds no
-- EXECUTE (AC-TASK-2). `hc.revise_object`'s allowlist is NOT widened.
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('task_completed', 'A task was marked done by its holder or a manage-holder'),
  ('task_snoozed',   'A task''s due date was moved forward; the count of snoozes is on the row');

-- ----------------------------------------------------------------------------
-- The one authorization, written once for both verbs: the caller's live
-- member row in the task's circle; then holder-at-summary or manage.
-- Owner-only (no EXECUTE for anyone): a write half in the 6A terminalize
-- pattern, running AS the calling definer.
-- ----------------------------------------------------------------------------
create function hc.may_act_on_task(
  p_task_circle uuid, p_subject uuid, p_taint hc.domain[], p_resolved boolean,
  p_task uuid, p_owner uuid, p_actor uuid)
returns boolean language plpgsql stable
set search_path = ''
as $$
declare
  v_ctx jsonb := hc.ctx();
  v_level hc.access_level;
  v_me uuid;
begin
  v_level := hc.visible_at(v_ctx, p_subject, p_taint, p_resolved, 'task', p_task, p_owner);
  if v_level >= 'manage' then
    return true;
  end if;
  select m.id into v_me from public.circle_members m
   where m.circle_id = p_task_circle and m.account_id = p_actor and m.removed_at is null;
  return p_owner is not null and v_me = p_owner and v_level >= 'summary';
end $$;

alter function hc.may_act_on_task(uuid, uuid, hc.domain[], boolean, uuid, uuid, uuid)
  owner to hc_internal;
revoke execute on function hc.may_act_on_task(uuid, uuid, hc.domain[], boolean, uuid, uuid, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.complete_task
-- ----------------------------------------------------------------------------
create function hc.complete_task(p_task uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_task record;
  v_now timestamptz := now();
  v_owner_name text;
begin
  if v_actor is null then
    raise exception 'complete_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'complete_refused' using errcode = 'P0001';
  end if;

  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null;
  if v_task.id is null then
    raise exception 'complete_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_task.circle_id::text));
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null
   for update;
  if v_task.id is null or v_task.status <> 'open' then
    raise exception 'complete_refused' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.freezes f
             where f.circle_id = v_task.circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  if not hc.may_act_on_task(v_task.circle_id, v_task.subject_id, v_task.taint,
                            v_task.taint_resolved, p_task, v_task.owner_member_id,
                            v_actor) then
    raise exception 'complete_refused' using errcode = 'P0001';
  end if;

  update public.tasks
     set status = 'done', completed_by = v_actor, completed_at = v_now
   where id = p_task;

  select m.display_name_at_join into v_owner_name
    from public.circle_members m where m.id = v_task.owner_member_id;

  perform hc.log(v_task.circle_id, 'task_completed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_task.subject_id,
                 p_target_member_id => v_task.owner_member_id,
                 p_object_type => 'task', p_object_id => p_task,
                 p_detail => jsonb_strip_nulls(jsonb_build_object(
                   'owner_member_id', v_task.owner_member_id,
                   'owner_name', v_owner_name)));

  return jsonb_build_object('task_id', p_task, 'status', 'done',
                            'completed_by', v_actor, 'completed_at', v_now);
end $$;

alter function hc.complete_task(uuid) owner to hc_internal;
revoke execute on function hc.complete_task(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.complete_task(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.snooze_task
-- ----------------------------------------------------------------------------
create function hc.snooze_task(p_task uuid, p_due_on date, p_due_zone text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_task record;
  v_before jsonb;
  v_after jsonb;
  v_rev int;
begin
  if v_actor is null then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;

  -- The due pair travels together, and a snooze needs a date to move to.
  if p_due_on is null or p_due_zone is null or btrim(p_due_zone) = '' then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;

  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null;
  if v_task.id is null then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_task.circle_id::text));
  select t.* into v_task from public.tasks t
   where t.id = p_task and t.deleted_at is null
   for update;
  if v_task.id is null or v_task.status <> 'open' then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.freezes f
             where f.circle_id = v_task.circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  if not hc.may_act_on_task(v_task.circle_id, v_task.subject_id, v_task.taint,
                            v_task.taint_resolved, p_task, v_task.owner_member_id,
                            v_actor) then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;

  -- A snooze moves the date FORWARD. No date, or an earlier one, is an
  -- edit — hc.revise_object's business, with its own revision.
  if v_task.due_on is null or p_due_on <= v_task.due_on then
    raise exception 'snooze_refused' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_task);
  update public.tasks
     set due_on = p_due_on, due_zone = p_due_zone, snooze_count = snooze_count + 1
   where id = p_task;
  select to_jsonb(t) into v_after from public.tasks t where t.id = p_task;

  -- "by whom and how many times" (§4.5.4): one revision per snooze, the
  -- revise_object numbering.
  select coalesce(max(r.revision_no), 0) + 1 into v_rev
    from public.record_revisions r
   where r.object_type = 'task' and r.object_id = p_task;
  insert into public.record_revisions
    (circle_id, object_type, object_id, revision_no, changed_by,
     changer_display_name, before, after)
  values
    (v_task.circle_id, 'task', p_task, v_rev, v_actor, v_actor_name, v_before, v_after);

  perform hc.log(v_task.circle_id, 'task_snoozed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_task.subject_id,
                 p_target_member_id => v_task.owner_member_id,
                 p_object_type => 'task', p_object_id => p_task,
                 p_detail => jsonb_build_object(
                   'from_due_on', v_task.due_on, 'to_due_on', p_due_on,
                   'from_due_zone', v_task.due_zone, 'to_due_zone', p_due_zone,
                   'snooze_count', v_task.snooze_count + 1,
                   'revision_no', v_rev));

  return jsonb_build_object('task_id', p_task, 'due_on', p_due_on,
                            'due_zone', p_due_zone,
                            'snooze_count', v_task.snooze_count + 1,
                            'revision_no', v_rev);
end $$;

alter function hc.snooze_task(uuid, date, text) owner to hc_internal;
revoke execute on function hc.snooze_task(uuid, date, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.snooze_task(uuid, date, text) to authenticated;
