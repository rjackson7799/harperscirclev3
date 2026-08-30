-- ============================================================================
-- M5 (round-24 dispositions, ADR-0033) — the M4 reads stop disclosing
-- existence at `hidden`.
--
-- ADR-0033 D2 / D13 cluster A — R4/F-1 (BLOCKER), R1/F-1, R4/F-2, R6/F-1.
-- Four lenses, one mechanism: `hc.object_label_at` applies no level floor and
-- `need` is `summary`, so `hidden` and `log` were handled identically. A row
-- was emitted for every existing descendant, with `object_type` in the clear.
-- `hidden` means the object does not exist for that caller "in any surface,
-- in any count" (PRD §7.3/§7.6); `log` is the first rung allowed to show
-- presence. "Counted, never named" was right — it was just applied one rung
-- too low.
--
-- ADR-0033 D19.9 — the floor binds every reader EXCEPT a person reading her
-- OWN share. She was logged and notified when it was created (§4.3.5), so
-- counting it tells her nothing she does not already have. A coordinator
-- reading someone else's shares is a different reader and takes the floor.
--
-- ADR-0033 D19.12 — a kept share on a REMOVED member is not live, so
-- `shares_for` gains the `removed_at is null` term `shares_for_member`
-- already had (R4/F-5: the two reads disagreed about the same share).
--
-- NO DDL: nine `create or replace` bodies — three for cluster A here, two
-- for cluster B (`assign_task`, `unassign_task`, which clusters C and E then
-- edit in place), two for cluster C (`complete_task`, `revoke_share`), two
-- for cluster E (`snooze_task`, `recategorize_document`) — no schema change.
-- Clusters D (D19.1: unassign_task, revoke_share), G (D19.7: assign_task)
-- and R2/F-9 (assign_task's unique_violation arm) edit those bodies in
-- place, marked. The M3 audience cluster (F, D19.3,
-- D19.5, D19.10) re-creates `recategorize_document` with a third parameter
-- and `document_audience` with a sixth column (drop + create: the signature
-- moved, the schema did not), and adds two functions -
-- `document_taint_walk_under` (owner-only) and `document_audience_derived`.
-- The M4 cluster (D19.8, D19.11) replaces `circle_people` and adds
-- `member_levels_frozen` (owner-only). Ownership,
-- revocations and grants are RESTATED — a replaced body does not restate them
-- for you, and 002's definer invariants read the catalog.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.document_references — the floor, in the WHERE
-- ----------------------------------------------------------------------------
create or replace function hc.document_references(p_document uuid)
returns table (object_type hc.object_type, object_id uuid, label text, visible boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ctx jsonb := hc.ctx();
  v_doc record;
begin
  -- The gate: the document itself, through documents_select's own
  -- predicate. Nonexistent, foreign, deleted and hidden are one shape.
  select d.id into v_doc from public.documents d
   where d.id = p_document
     and d.deleted_at is null
     and (v_ctx -> 'circles') @> to_jsonb(d.circle_id)
     and hc.visible_at(v_ctx, d.subject_id, d.taint, d.taint_resolved,
                       'document', d.id, null) >= 'summary';
  if v_doc.id is null then
    raise exception 'references_refused' using errcode = 'P0001';
  end if;

  return query
  with recursive down(otype, oid, depth) as (
      select 'document'::hc.object_type, p_document, 0
    union
      select e.child_type, e.child_id, dn.depth + 1
        from public.provenance_edges e
        join down dn on dn.otype = e.parent_type and dn.oid = e.parent_id
       where dn.depth < 32
  ), refs as (
    select distinct dn.otype, dn.oid from down dn where dn.depth > 0
  )
  select r.otype,
         -- counted, never named: id and label suppressed TOGETHER
         case when x.level >= x.need then r.oid end,
         case when x.level >= x.need then x.label end,
         (x.level >= x.need)
    from refs r
    join lateral hc.object_label_at(v_ctx, r.otype, r.oid) x on true
   -- ADR-0033 D2 (cluster A): the FLOOR. Below `log` the object does not
   -- exist for this caller, so it is not counted either. A `log` holder keeps
   -- the unnamed row; `summary` and above keep the named one.
   where x.level >= 'log'
   order by r.otype, r.oid;
end $$;

alter function hc.document_references(uuid) owner to hc_internal;
revoke execute on function hc.document_references(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.document_references(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.shares_for — a removed member's share is not live (D19.12)
-- ----------------------------------------------------------------------------
create or replace function hc.shares_for(p_object_type hc.object_type, p_object_id uuid)
returns table (
  share_id uuid, member_id uuid, display_name text, tier hc.tier,
  granted_by uuid, granter_name text, granted_at timestamptz,
  created_by_assignment_of uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ctx jsonb := hc.ctx();
  v_obj record;
  v_owner uuid;
begin
  -- Zero rows, never an error: nonexistent and unmanageable are the same
  -- silence.
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null or not ((v_ctx -> 'circles') @> to_jsonb(v_obj.circle_id)) then
    return;
  end if;
  if p_object_type = 'task' then
    select t.owner_member_id into v_owner from public.tasks t where t.id = p_object_id;
  end if;
  if hc.visible_at(v_ctx, v_obj.subject_id, v_obj.taint, v_obj.taint_resolved,
                   p_object_type, p_object_id, v_owner) < 'manage' then
    return;
  end if;

  return query
  select sh.id, sh.member_id, m.display_name_at_join, m.tier,
         sh.granted_by, a.display_name, sh.granted_at, sh.created_by_assignment_of
    from public.object_shares sh
    join public.circle_members m on m.id = sh.member_id
    join public.accounts a on a.id = sh.granted_by
   where sh.object_type = p_object_type and sh.object_id = p_object_id
     and sh.revoked_at is null
     -- ADR-0033 D19.12: a kept share on a REMOVED member is not live. Without
     -- this the object read listed a share the person read refused (R4/F-5).
     and m.removed_at is null
   order by m.display_name_at_join, sh.id;
end $$;

alter function hc.shares_for(hc.object_type, uuid) owner to hc_internal;
revoke execute on function hc.shares_for(hc.object_type, uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.shares_for(hc.object_type, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.shares_for_member — the floor, EXCEPT for the holder herself (D19.9)
-- ----------------------------------------------------------------------------
create or replace function hc.shares_for_member(p_member uuid)
returns table (
  share_id uuid, object_type hc.object_type, object_id uuid, label text,
  visible boolean, granted_by uuid, granter_name text, granted_at timestamptz,
  created_by_assignment_of uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_ctx jsonb := hc.ctx();
  v_m record;
  v_self boolean;
begin
  if v_actor is null then
    return;
  end if;
  select m.* into v_m from public.circle_members m
   where m.id = p_member and m.removed_at is null;
  if v_m.id is null then
    return;
  end if;
  -- The person herself, or a live coordinator of her circle. Anyone else:
  -- zero rows.
  v_self := v_m.account_id is not distinct from v_actor;
  if not v_self
     and not exists (select 1 from public.circle_members c
                     where c.circle_id = v_m.circle_id
                       and c.account_id = v_actor
                       and c.removed_at is null
                       and c.tier = 'coordinator') then
    return;
  end if;

  return query
  select sh.id, sh.object_type,
         case when x.level >= x.need then sh.object_id end,
         case when x.level >= x.need then x.label end,
         coalesce(x.level >= x.need, false),
         sh.granted_by, a.display_name, sh.granted_at, sh.created_by_assignment_of
    from public.object_shares sh
    join public.accounts a on a.id = sh.granted_by
    left join lateral hc.object_label_at(v_ctx, sh.object_type, sh.object_id) x on true
   where sh.member_id = p_member and sh.revoked_at is null
     -- ADR-0033 D19.9: the holder reading her OWN list keeps every row — she
     -- was told when each was created (§4.3.5). Every other reader — a
     -- coordinator included — takes cluster A's floor, and a deleted object
     -- (no `object_label_at` row, so a NULL level) falls below it.
     and (v_self or coalesce(x.level, 'hidden'::hc.access_level) >= 'log')
   order by sh.object_type, sh.id;
end $$;

alter function hc.shares_for_member(uuid) owner to hc_internal;
revoke execute on function hc.shares_for_member(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.shares_for_member(uuid) to authenticated;

-- ============================================================================
-- CLUSTER B (ADR-0033 D3 / D13 / D14) — a share a coordinator KEPT is
-- revoked by the task's next assignment cycle. R1/F-2, R2/F-1, R3/F-2,
-- R6/F-2 (MAJOR).
--
-- `created_by_assignment_of` names the TASK, not the assignment cycle. The
-- unassign loop's keep left the marker set, and the reassign loop had no
-- keep list at all ("the new person gets their own act"), so a share Lena
-- kept in one cycle was indistinguishable from a share Ruth's cycle created,
-- and the next unassign or reassign of the same task revoked it — an access
-- reduction nobody asked for, logged in Lena's name.
--
-- The ruling (D19, R1's remedy): BOTH revoke loops are keyed on the former
-- holder — `and sh.member_id = v_former` — so "this assignment's shares"
-- means this task's marker AND held by the person being unassigned. It fixes
-- reassign and unassign symmetrically and preserves provenance (the marker is
-- never cleared). R6's marker-clearing is NOT taken; R2/F-1's DDL variant
-- (an assignment identity on `object_shares`) is DECLINED.
--
-- A consequence, pinned at 066:60: a kept share is its holder's, so the
-- holder's OWN later cycle on the same task still ends it.
--
-- Both bodies below are M1's VERBATIM with that one predicate added to each
-- loop (and the two design comments corrected), plus cluster C's marked
-- additions: the instruction guard in each (R2/F-4, R6/F-6) and, in
-- assign_task, the unconditional closure of the original's open
-- instructions (R2/F-8). Ownership, revocations and grants are RESTATED,
-- as above.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.assign_task
-- ----------------------------------------------------------------------------
create or replace function hc.assign_task(
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
  v_sub jsonb;
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
  -- ADR-0033 cluster C (R2/F-4, R6/F-6): an INSTRUCTION is what its holder
  -- reads of the original, not a task of its own. It is never assigned
  -- onward - its lifecycle is the original's. One shape.
  if v_task.written_from_task_id is not null then
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

  -- ADR-0033 cluster E (R1/F-6, R2/F-3): the caller is a live member of THIS
  -- circle BEFORE the freeze is named - set_grant's order. A stranger, a
  -- removed member and a nonexistent id are one shape; the named signature
  -- is for members (PRD S7.5: "cannot be done quietly" - to members).
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_task.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null) then
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
  -- ADR-0033 D19.7 (cluster G - R3/F-1, R6/F-4): "context on the subject"
  -- is AT LEAST ONE DELIBERATE log-or-higher GRANT. The subject key that
  -- grant_vectors manufactures for every live member (empty arrays when she
  -- holds nothing) is not context, so the gate asks her LADDER, not the
  -- key's presence: the old test was dead for every live member, and path 2
  -- could hand a task and a document to someone hidden on every domain.
  v_ctx_a := hc.ctx_for(v_member.account_id);
  v_sub := v_ctx_a -> 'subjects' -> v_task.subject_id::text;
  if v_sub is null
     or coalesce(jsonb_array_length(v_sub -> 'manage'), 0)
        + coalesce(jsonb_array_length(v_sub -> 'view'), 0)
        + coalesce(jsonb_array_length(v_sub -> 'summary'), 0)
        + coalesce(jsonb_array_length(v_sub -> 'log'), 0) = 0 then
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
  -- the new person's act. No keep list on a reassign — and none is needed:
  -- the loop is keyed on the FORMER HOLDER (ADR-0033 cluster B), so a share
  -- a coordinator kept for someone else in an earlier cycle is not this
  -- assignment's and is never touched here.
  v_former := v_task.owner_member_id;
  if v_former is not null then
    select m.display_name_at_join into v_former_name
      from public.circle_members m where m.id = v_former;
    for r in
      update public.object_shares sh
         set revoked_at = v_now
       where sh.created_by_assignment_of = p_task
         and sh.member_id = v_former
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
  end if;
  -- The original's open instructions close on EVERY assignment, whoever the
  -- former holder was (ADR-0033 R2/F-8): remove_member clears the holder and
  -- leaves the instruction open, and a closure keyed on a former holder
  -- never reached it. Keyed on written_from_task_id instead.
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
    -- ADR-0033 R2/F-9: hc.share_object is the recorded R-rule exception (no
    -- advisory lock), so a share it inserts and has not yet committed is
    -- invisible to the `not exists` below and the insert here blocks on
    -- object_shares_live, then fails with a raw 23505 when it commits. The
    -- one shape holds: unique_violation becomes assign_refused, and the whole
    -- call - the token burn included - rolls back with it.
    begin
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
    exception when unique_violation then
      raise exception 'assign_refused' using errcode = 'P0001';
    end;
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
                   'instructions_closed', case when v_former is not null or v_closed > 0 then v_closed end)));

  return jsonb_strip_nulls(jsonb_build_object(
    'task_id', p_task, 'member_id', p_member, 'path', v_path, 'changed', true,
    'instruction_task_id', v_instr,
    'share_ids', case when v_path = 'share'
                      then jsonb_strip_nulls(jsonb_build_array(v_sh_task, v_sh_doc)) end,
    'former_member_id', v_former,
    'shares_revoked', case when v_former is not null then v_revoked end,
    'instructions_closed', case when v_former is not null or v_closed > 0 then v_closed end));
end $$;

alter function hc.assign_task(uuid, uuid, text, uuid, text) owner to hc_internal;
revoke execute on function hc.assign_task(uuid, uuid, text, uuid, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.assign_task(uuid, uuid, text, uuid, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- hc.unassign_task
-- ----------------------------------------------------------------------------
create or replace function hc.unassign_task(p_task uuid, p_keep_share_ids uuid[] default null)
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
  -- ADR-0033 cluster C (R2/F-4, R6/F-6): an instruction is never unassigned
  -- by itself - unassigning the ORIGINAL closes it (below). One shape.
  if v_task.written_from_task_id is not null then
    raise exception 'unassign_refused' using errcode = 'P0001';
  end if;
  -- ADR-0033 D19.1 (cluster D - R1/F-5, R6 Q-F): the objected-to member is
  -- NOT "a live coordinator" during their own freeze. "All interactive
  -- access suspended" (PRD S7.5) includes reduction: the door that lets a
  -- live coordinator reduce under a freeze is closed to the member the
  -- finding names, on any open/unresolved freeze of this circle. One shape.
  if exists (select 1 from public.freezes f
             join public.circle_members m on m.id = f.objected_to_member_id
             where f.circle_id = v_task.circle_id
               and f.state in ('open', 'unresolved')
               and m.account_id = v_actor) then
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

  -- EXACTLY this assignment's shares: created_by_assignment_of = this task
  -- AND held by the former holder (ADR-0033 cluster B — the marker names the
  -- task, not the cycle, and a share kept for someone else in an earlier
  -- cycle stays theirs), live, not kept. A foreign share never matches
  -- (SHR-02).
  for r in
    update public.object_shares sh
       set revoked_at = v_now
     where sh.created_by_assignment_of = p_task
       and sh.member_id = v_former
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

-- ============================================================================
-- CLUSTER C (ADR-0033 D6 / D7 / D13 / D14 / D19.2 / D19.4 / D19.6) - the
-- guards, and "the ORIGINAL is the work". R1/F-3(b,c), R1/F-4, R2/F-4,
-- R2/F-5, R2/F-7, R2/F-8, R2/F-10, R6/F-5, R6/F-6.
--
-- The two bodies below are M2's (complete_task) and M3's (revoke_share)
-- VERBATIM with marked additions; assign_task and unassign_task above carry
-- their marked additions in place.
--
--   * An INSTRUCTION row is never p_task to assign_task or unassign_task:
--     "the assignment is a fact on the original; the instruction is what
--     she reads" (R2/F-4, R6/F-6). One shape each.
--   * D19.4 - the ORIGINAL is the work. complete_task on an original
--     cancels its open instructions the way unassign_task closes them;
--     complete_task on an instruction completes the original with the
--     instruction's actor, and the original gets its own task_completed
--     entry naming the instruction (R1/F-4, R2/F-5).
--   * D19.6 - completion revokes the assignment's shares: the assignment
--     is over, so its grants end with it (R2/F-7). Cluster B's meaning:
--     the original's marker AND held by its holder.
--   * D19.2 - revoke_share refuses a share a LIVE assignment created;
--     withdrawal goes through unassign_task or ends with completion. A
--     KEPT share is an ordinary share again and stays revocable (R6/F-5,
--     R2/F-10).
--   * R2/F-8 - assign_task closes the original's open instructions
--     unconditionally, so the orphan remove_member leaves is closed by the
--     next assignment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.complete_task
-- ----------------------------------------------------------------------------
create or replace function hc.complete_task(p_task uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_task record;
  v_now timestamptz := now();
  v_owner_name text;
  v_orig_id uuid;
  v_orig_owner uuid;
  v_orig_owner_name text;
  v_work uuid;
  v_holder uuid;
  v_revoked int := 0;
  v_closed int := 0;
  r record;
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

  -- ADR-0033 cluster E (R1/F-6, R2/F-3): the caller is a live member of THIS
  -- circle BEFORE the freeze is named - set_grant's order. A stranger, a
  -- removed member and a nonexistent id are one shape; the named signature
  -- is for members (PRD S7.5: "cannot be done quietly" - to members).
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_task.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null) then
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

  -- ADR-0033 D19.4 / D19.6 (cluster C - R1/F-4, R2/F-5, R2/F-7): THE
  -- ORIGINAL IS THE WORK. Completing an INSTRUCTION completes the original
  -- it was written from, with the instruction's actor; completing an
  -- ORIGINAL closes its open instructions the way unassign_task does, never
  -- leaving one open in a caregiver's list; and either way the assignment's
  -- shares end with the work - "this assignment's" in cluster B's sense:
  -- the original's marker AND held by its holder. The original is locked
  -- under the circle lock this call already holds.
  if v_task.written_from_task_id is not null then
    select t.id, t.owner_member_id into v_orig_id, v_orig_owner
      from public.tasks t
     where t.id = v_task.written_from_task_id
       and t.deleted_at is null and t.status = 'open'
     for update;
    if v_orig_id is not null then
      update public.tasks
         set status = 'done', completed_by = v_actor, completed_at = v_now
       where id = v_orig_id;
      select m.display_name_at_join into v_orig_owner_name
        from public.circle_members m where m.id = v_orig_owner;
      v_work := v_orig_id;
      v_holder := v_orig_owner;
    end if;
  else
    v_work := p_task;
    v_holder := v_task.owner_member_id;
  end if;
  if v_work is not null then
    for r in
      update public.tasks i
         set status = 'cancelled'
       where i.written_from_task_id = v_work
         and i.status = 'open'
         and i.deleted_at is null
      returning i.id
    loop
      v_closed := v_closed + 1;
    end loop;
    for r in
      update public.object_shares sh
         set revoked_at = v_now
       where sh.created_by_assignment_of = v_work
         and sh.member_id = v_holder
         and sh.revoked_at is null
      returning sh.object_type, sh.object_id, sh.member_id
    loop
      v_revoked := v_revoked + 1;
      perform hc.log(v_task.circle_id, 'object_share_revoked', v_actor_name,
                     p_actor_account_id => v_actor,
                     p_subject_id => v_task.subject_id,
                     p_target_member_id => r.member_id,
                     p_object_type => r.object_type, p_object_id => r.object_id,
                     p_detail => jsonb_build_object('assignment_of', v_work,
                                                    'completed', true));
    end loop;
  end if;

  select m.display_name_at_join into v_owner_name
    from public.circle_members m where m.id = v_task.owner_member_id;

  perform hc.log(v_task.circle_id, 'task_completed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_task.subject_id,
                 p_target_member_id => v_task.owner_member_id,
                 p_object_type => 'task', p_object_id => p_task,
                 p_detail => jsonb_strip_nulls(jsonb_build_object(
                   'owner_member_id', v_task.owner_member_id,
                   'owner_name', v_owner_name,
                   'original_task_id', v_orig_id,
                   'instructions_closed', v_closed,
                   'shares_revoked', v_revoked)));
  if v_orig_id is not null then
    -- The original's own entry: completed through its instruction.
    perform hc.log(v_task.circle_id, 'task_completed', v_actor_name,
                   p_actor_account_id => v_actor,
                   p_subject_id => v_task.subject_id,
                   p_target_member_id => v_orig_owner,
                   p_object_type => 'task', p_object_id => v_orig_id,
                   p_detail => jsonb_strip_nulls(jsonb_build_object(
                     'owner_member_id', v_orig_owner,
                     'owner_name', v_orig_owner_name,
                     'via_instruction_task_id', p_task,
                     'instructions_closed', v_closed,
                     'shares_revoked', v_revoked)));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'task_id', p_task, 'status', 'done',
    'completed_by', v_actor, 'completed_at', v_now,
    'original_task_id', v_orig_id,
    'instructions_closed', v_closed, 'shares_revoked', v_revoked));
end $$;

alter function hc.complete_task(uuid) owner to hc_internal;
revoke execute on function hc.complete_task(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.complete_task(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- hc.revoke_share — unshare in one action.
-- ----------------------------------------------------------------------------
create or replace function hc.revoke_share(p_share_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_share record;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  select sh.* into v_share from public.object_shares sh
   where sh.id = p_share_id and sh.revoked_at is null;
  if v_share.id is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  -- R-rule: a share is security state; revoke it under the circle lock and
  -- re-read.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_share.circle_id::text));
  select sh.* into v_share from public.object_shares sh
   where sh.id = p_share_id and sh.revoked_at is null
   for update;
  if v_share.id is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  -- ADR-0033 D19.1 (cluster D - R1/F-5, R6 Q-F): the objected-to member is
  -- NOT "a live coordinator" during their own freeze. "All interactive
  -- access suspended" (PRD S7.5) includes reduction: the door that lets a
  -- live coordinator reduce under a freeze is closed to the member the
  -- finding names, on any open/unresolved freeze of this circle. One shape.
  if exists (select 1 from public.freezes f
             join public.circle_members m on m.id = f.objected_to_member_id
             where f.circle_id = v_share.circle_id
               and f.state in ('open', 'unresolved')
               and m.account_id = v_actor) then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;
  -- The granter, or a live coordinator of the circle. No freeze check:
  -- revocation reduces reach.
  if v_share.granted_by <> v_actor
     and not exists (select 1 from public.circle_members m
                     where m.circle_id = v_share.circle_id
                       and m.account_id = v_actor
                       and m.removed_at is null
                       and m.tier = 'coordinator') then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  -- ADR-0033 D19.2 (cluster C - R6/F-5, R2/F-10): a share a LIVE assignment
  -- created is not revocable on its own - withdrawing it would leave the
  -- holder with a task she cannot see, and AC-TASK-5's post-condition is a
  -- standing invariant, not a moment. Withdrawal goes through unassign_task
  -- (or ends with completion). A KEPT share - its task no longer held by
  -- this member, or closed - is an ordinary share again and revocable
  -- here: "revocable in one action" (S4.3.5) still holds for it. One shape.
  -- (M3's header sentence "the assignment stands" is superseded by this.)
  if v_share.created_by_assignment_of is not null
     and exists (select 1 from public.tasks t
                 where t.id = v_share.created_by_assignment_of
                   and t.deleted_at is null
                   and t.status = 'open'
                   and t.owner_member_id = v_share.member_id) then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  update public.object_shares set revoked_at = v_now where id = p_share_id;

  perform hc.log(v_share.circle_id, 'object_share_revoked', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_share.subject_id,
                 p_target_member_id => v_share.member_id,
                 p_object_type => v_share.object_type, p_object_id => v_share.object_id,
                 p_detail => jsonb_strip_nulls(jsonb_build_object(
                   'share_id', p_share_id,
                   'granted_by', v_share.granted_by,
                   'created_by_assignment_of', v_share.created_by_assignment_of)));

  return jsonb_build_object('share_id', p_share_id, 'member_id', v_share.member_id,
                            'object_type', v_share.object_type,
                            'object_id', v_share.object_id, 'revoked_at', v_now);
end $$;

alter function hc.revoke_share(uuid) owner to hc_internal;
revoke execute on function hc.revoke_share(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.revoke_share(uuid) to authenticated;

-- ============================================================================
-- CLUSTER E (ADR-0033 D13 / D14) - the freeze is named to MEMBERS. R1/F-6,
-- R2/F-3.
--
-- All four widening/lifecycle writers raised the NAMED freeze_active before
-- the caller was known to be anyone: an account outside the circle holding
-- a task or document id learned that the object exists and that the circle
-- is frozen (an existing id answered freeze_active, a nonexistent one the
-- generic refusal), and on a done task the stranger got the generic shape
-- while on an open one the named one - an open/done oracle on top of the
-- freeze oracle. set_grant authorises the actor first and names the freeze
-- only after (round9_fixes :288-294, :326-331); these four now do the same:
-- a live-membership-in-THIS-circle check precedes the freeze predicate.
-- Members still meet the named signature (PRD S7.5 tells members); a
-- stranger, a removed member and a nonexistent id are one shape.
--
-- RESIDUAL, recorded: a live MEMBER holding nothing on the object still
-- meets freeze_active for an existing id and the generic refusal for a
-- nonexistent one (R1/F-6's probe P2a). Under a freeze hc.visible_at is
-- hidden for everyone (rung 2), so the object-level authorisation cannot
-- precede the freeze without ignoring the freeze; the ruling took
-- set_grant's shape, whose "authorisation" is membership and tier.
--
-- assign_task and complete_task carry the check in place above; the two
-- bodies below are M2's (snooze_task) and M3's (recategorize_document)
-- VERBATIM with the same marked addition - recategorize_document then
-- carries the M3 audience cluster's marked edits in place (F, D19.3, D19.5)
-- and is re-created with its third parameter.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.snooze_task
-- ----------------------------------------------------------------------------
create or replace function hc.snooze_task(p_task uuid, p_due_on date, p_due_zone text)
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

  -- ADR-0033 cluster E (R1/F-6, R2/F-3): the caller is a live member of THIS
  -- circle BEFORE the freeze is named - set_grant's order. A stranger, a
  -- removed member and a nonexistent id are one shape; the named signature
  -- is for members (PRD S7.5: "cannot be done quietly" - to members).
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_task.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null) then
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

-- ----------------------------------------------------------------------------
-- hc.recategorize_document — the move.
-- ----------------------------------------------------------------------------
-- ADR-0033 D19.5 (R2/F-6): the signature gains p_expected_category, so the
-- 2-argument form goes - an overload left behind would be a door around
-- the binding. drop + create or replace (idempotent on a re-run); ownership
-- and grants restated below.
drop function if exists hc.recategorize_document(uuid, hc.doc_category);
create or replace function hc.recategorize_document(p_document uuid, p_category hc.doc_category,
                                         p_expected_category hc.doc_category)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_doc record;
  v_ctx jsonb;
  v_own_old hc.domain;
  v_own_new hc.domain;
  v_taint_before hc.domain[];
  v_taint_after  hc.domain[];
  v_before jsonb;
  v_after  jsonb;
  v_gained jsonb;
  v_lost   jsonb;
  v_res    jsonb;
  v_resolved_before boolean;
  v_resolved_after  boolean;
  v_derived_before  jsonb;
  v_derived         jsonb;
begin
  if v_actor is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null;
  if v_doc.id is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  -- R-rule: the taint lock (growth and shrink serialise here), then the
  -- re-read FOR UPDATE, then every authorization under the lock.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_doc.circle_id::text));
  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null
   for update;
  if v_doc.id is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  -- ADR-0033 cluster E (R1/F-6, R2/F-3): the caller is a live member of THIS
  -- circle BEFORE the freeze is named - set_grant's order. A stranger, a
  -- removed member and a nonexistent id are one shape; the named signature
  -- is for members (PRD S7.5: "cannot be done quietly" - to members).
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_doc.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null) then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.freezes f
             where f.circle_id = v_doc.circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  v_own_old := hc.own_domain('document', v_doc.category, null, null);
  v_own_new := hc.own_domain('document', p_category, null, null);

  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                   'document', p_document, null) < 'manage'
     or not ((v_ctx -> 'subjects' -> v_doc.subject_id::text -> 'manage')
             @> to_jsonb(array[v_own_new])) then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  -- ADR-0033 D19.5 (R2/F-6): the sentence the person confirmed BINDS the
  -- move. A category that changed under her feet refuses with the NAMED
  -- document_changed (the proposal_version_changed shape) - after the gate,
  -- so a caller the gate refuses learns nothing about the category.
  if v_doc.category <> p_expected_category then
    raise exception 'document_changed' using errcode = 'P0001';
  end if;

  if p_category = v_doc.category then
    return jsonb_build_object('document_id', p_document, 'category', p_category,
                              'domain', v_own_new, 'changed', false);
  end if;

  -- The audience BEFORE, from every member's own vectors, read before any
  -- row moves.
  v_taint_before := v_doc.taint;
  -- ADR-0033 cluster F (R2/F-2, R6/F-3): the BEFORE flag is kept apart from
  -- the after flag - the old body overwrote v_doc.taint_resolved with the
  -- after-state and fed it to both sides of gained/lost, so an unresolved
  -- document's entry named as `lost` people its own audience_before said
  -- never had it.
  v_resolved_before := v_doc.taint_resolved;

  -- ADR-0033 D19.3 (R1/F-3a): the derived objects whose HOLDERS change
  -- level are named in the person's entry. Snapshot every open, held
  -- descendant task with its taint as it stands, before any row moves.
  select coalesce(jsonb_agg(jsonb_build_object(
           'object_type', 'task', 'object_id', t.id,
           'holder_member_id', t.owner_member_id,
           'holder_name', m.display_name_at_join,
           'holder_account', m.account_id,
           'taint', to_jsonb(t.taint), 'resolved', t.taint_resolved)), '[]'::jsonb)
    into v_derived_before
    from (
      with recursive down(otype, oid, depth) as (
          select 'document'::hc.object_type, p_document, 0
        union
          select e.child_type, e.child_id, dn.depth + 1
            from public.provenance_edges e
            join down dn on dn.otype = e.parent_type and dn.oid = e.parent_id
           where dn.depth < 32
      )
      select distinct dn.oid from down dn where dn.otype = 'task' and dn.depth > 0
    ) w
    join public.tasks t on t.id = w.oid and t.deleted_at is null and t.status = 'open'
                        and t.owner_member_id is not null
    join public.circle_members m on m.id = t.owner_member_id
                                and m.removed_at is null and m.account_id is not null;
  select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'name', r.display_name,
                                               'tier', r.tier, 'level', r.before)
                            order by r.display_name, r.member_id)
                  filter (where r.before > 'hidden'), '[]'::jsonb)
    into v_before
    from hc.document_audience_rows(p_document, v_taint_before, v_doc.taint_resolved,
                                   v_taint_before, v_doc.taint_resolved) r;

  -- The category, with title and summary_text in the SET list so the 1D
  -- builders fire: tsv_summary and the document_search_content row are
  -- rebuilt in THIS transaction (§4.3.6).
  update public.documents
     set category = p_category, title = title, summary_text = summary_text
   where id = p_document;

  -- The domain moved: the ONE shrinking path recomputes this document and
  -- every descendant to a fixed point. Together, or not at all.
  if v_own_old <> v_own_new then
    v_res := hc.reclassify_taint('document', p_document);
    if not coalesce((v_res ->> 'completed')::boolean, false) then
      raise exception 'recategorize_refused' using errcode = 'P0001';
    end if;
  end if;
  select d.taint, d.taint_resolved into v_taint_after, v_resolved_after
    from public.documents d where d.id = p_document;

  -- The audience AFTER, from the taint as it now stands.
  select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'name', r.display_name,
                                               'tier', r.tier, 'level', r.after)
                            order by r.display_name, r.member_id)
                  filter (where r.after > 'hidden'), '[]'::jsonb),
         coalesce(jsonb_agg(r.display_name order by r.display_name, r.member_id)
                  filter (where r.before = 'hidden' and r.after > 'hidden'), '[]'::jsonb),
         coalesce(jsonb_agg(r.display_name order by r.display_name, r.member_id)
                  filter (where r.before > 'hidden' and r.after = 'hidden'), '[]'::jsonb)
    into v_after, v_gained, v_lost
    from hc.document_audience_rows(p_document, v_taint_before, v_resolved_before,
                                   v_taint_after, v_resolved_after) r;

  -- D19.3: the held descendants whose holder's level changed, from the
  -- snapshot to the taint as it now stands, each from the holder's OWN
  -- vectors.
  select coalesce(jsonb_agg(jsonb_build_object(
           'object_type', 'task', 'object_id', (e ->> 'object_id')::uuid,
           'holder_member_id', (e ->> 'holder_member_id')::uuid,
           'holder_name', e ->> 'holder_name',
           'before', b.lvl, 'after', a.lvl)
           order by e ->> 'holder_name', e ->> 'object_id'), '[]'::jsonb)
    into v_derived
    from jsonb_array_elements(v_derived_before) e
    join public.tasks t on t.id = (e ->> 'object_id')::uuid
    cross join lateral (
      select hc.visible_at(hc.ctx_for((e ->> 'holder_account')::uuid), t.subject_id,
               coalesce((select array_agg(x::hc.domain) from jsonb_array_elements_text(e -> 'taint') x),
                        '{}'::hc.domain[]),
               (e ->> 'resolved')::boolean, 'task', t.id, t.owner_member_id) as lvl) b
    cross join lateral (
      select hc.visible_at(hc.ctx_for((e ->> 'holder_account')::uuid), t.subject_id,
               t.taint, t.taint_resolved, 'task', t.id, t.owner_member_id) as lvl) a
   where b.lvl <> a.lvl;

  -- The person's entry: both audiences, by name (§4.3.2).
  perform hc.log(v_doc.circle_id, 'audience_changed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_doc.subject_id,
                 p_object_type => 'document', p_object_id => p_document,
                 p_detail => jsonb_build_object(
                   'category_before', v_doc.category, 'category_after', p_category,
                   'domain_before', v_own_old, 'domain_after', v_own_new,
                   'taint_before', to_jsonb(v_taint_before),
                   'taint_after',  to_jsonb(v_taint_after),
                   'audience_before', v_before, 'audience_after', v_after,
                   'gained', v_gained, 'lost', v_lost,
                   'derived', v_derived));

  return jsonb_build_object(
    'document_id', p_document, 'category', p_category, 'domain', v_own_new,
    'changed', true,
    'taint_before', to_jsonb(v_taint_before), 'taint_after', to_jsonb(v_taint_after),
    'gained', jsonb_array_length(v_gained), 'lost', jsonb_array_length(v_lost),
    'gained_names', v_gained, 'lost_names', v_lost,
    'derived', v_derived);
end $$;

alter function hc.recategorize_document(uuid, hc.doc_category, hc.doc_category)
  owner to hc_internal;
revoke execute on function hc.recategorize_document(uuid, hc.doc_category, hc.doc_category)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.recategorize_document(uuid, hc.doc_category, hc.doc_category)
  to authenticated;


-- ============================================================================
-- THE M3 AUDIENCE CLUSTER (ADR-0033 D4 / D19.3 / D19.5 / D19.10) - R1/F-3(a),
-- R2/F-2, R2/F-6, R4/F-3, R6/F-3.
--
--   * F - a separate v_resolved_before (above, in recategorize_document):
--     an unresolved document's entry no longer names as `lost` people its own
--     audience_before says never had it.
--   * D19.5 - the preview binds the move: recategorize_document takes
--     p_expected_category and refuses a changed source with the NAMED
--     document_changed (above).
--   * D19.10 - below coordinator, only gained/lost: the before/after level
--     pair is a coordinator's fact (access_grants_select_own withholds it from
--     everyone else), so document_audience hands a non-coordinator the
--     member's name and the DIRECTION (`change`: gained / lost / changed)
--     with both levels NULL - the UI renders null as UNDISCLOSED, never as a
--     hidden grant (R6's Q-C rider). The column is new, so the function is
--     re-created.
--   * D19.3 - the preview and the person's entry NAME the derived objects
--     whose HOLDERS change level. hc.document_taint_walk_under is the pure
--     predictor: reclassify_taint's own fixed point over the descendants,
--     with the document's taint as document_taint_under predicts it, WITHOUT
--     writing. hc.document_audience_derived projects it onto the open, held
--     descendant tasks whose holder's level moves, labelled at the CALLER's
--     level through object_label_at (counted, never named, cluster A's
--     floor), behind the same gate as the preview.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.document_taint_walk_under - the pure predictor. Owner-only.
-- ----------------------------------------------------------------------------
create or replace function hc.document_taint_walk_under(p_document uuid, p_category hc.doc_category)
returns table (object_type hc.object_type, object_id uuid,
               taint_before hc.domain[], resolved_before boolean, taint_after hc.domain[])
language plpgsql stable
set search_path = ''
as $$
declare
  c_depth constant int := 32;
  v_map jsonb;
  v_pass int := 0;
  v_changed int;
  v_key text;
  v_want hc.domain[];
  v_have hc.domain[];
  r record;
begin
  -- the moved document itself, as document_taint_under predicts it
  v_map := jsonb_build_object('document:' || p_document::text,
                              to_jsonb(hc.document_taint_under(p_document, p_category)));
  -- reclassify_taint's fixed point: own domain UNION the parents' taint,
  -- predicted where a parent is in the affected set, stored otherwise.
  loop
    v_pass := v_pass + 1;
    v_changed := 0;
    for r in
      with recursive down(otype, oid, depth) as (
          select 'document'::hc.object_type, p_document, 0
        union
          select e.child_type, e.child_id, dn.depth + 1
            from public.provenance_edges e
            join down dn on dn.otype = e.parent_type and dn.oid = e.parent_id
           where dn.depth < c_depth
      )
      select dn.otype, dn.oid from down dn
       where dn.depth > 0
       group by dn.otype, dn.oid
      having min(dn.depth) < c_depth
       order by case dn.otype when 'document' then 0 when 'episode' then 1
                     when 'profile_fact' then 2 when 'task' then 3 else 4 end,
                dn.oid
    loop
      v_key := r.otype::text || ':' || r.oid::text;
      select hc.taint_union(
               array[o.own]::hc.domain[],
               coalesce((select hc.taint_union_agg(
                           case when v_map ? (e.parent_type::text || ':' || e.parent_id::text)
                                then (select array_agg(x::hc.domain)
                                        from jsonb_array_elements_text(
                                               v_map -> (e.parent_type::text || ':' || e.parent_id::text)) x)
                                else p2.taint end)
                         from public.provenance_edges e
                         join lateral hc.resolve_object(e.parent_type, e.parent_id) p2 on true
                        where e.child_type = r.otype and e.child_id = r.oid),
                        '{}'::hc.domain[]))
        into v_want
        from hc.resolve_object(r.otype, r.oid) o;
      if v_want is null then
        continue;   -- a deleted node: resolve_object returns no row
      end if;
      v_have := case when v_map ? v_key
                     then (select array_agg(x::hc.domain) from jsonb_array_elements_text(v_map -> v_key) x)
                     end;
      if v_have is null or v_want is distinct from v_have then
        v_map := v_map || jsonb_build_object(v_key, to_jsonb(v_want));
        v_changed := v_changed + 1;
      end if;
    end loop;
    exit when v_changed = 0 or v_pass >= c_depth;
  end loop;

  return query
    select split_part(mp.k, ':', 1)::hc.object_type,
           split_part(mp.k, ':', 2)::uuid,
           o.taint, o.taint_resolved,
           (select array_agg(x::hc.domain) from jsonb_array_elements_text(mp.v) x)
      from jsonb_each(v_map) mp(k, v)
      join lateral hc.resolve_object(split_part(mp.k, ':', 1)::hc.object_type,
                                     split_part(mp.k, ':', 2)::uuid) o on true
     where mp.k <> 'document:' || p_document::text;
end $$;

alter function hc.document_taint_walk_under(uuid, hc.doc_category) owner to hc_internal;
revoke execute on function hc.document_taint_walk_under(uuid, hc.doc_category)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.document_audience - the preview, re-created with `change` (D19.10).
-- M3's body VERBATIM plus v_coord and the sixth column.
-- ----------------------------------------------------------------------------
drop function if exists hc.document_audience(uuid, hc.doc_category);
create or replace function hc.document_audience(p_document uuid, p_category hc.doc_category)
returns table (member_id uuid, display_name text, tier hc.tier,
               before hc.access_level, after hc.access_level, change text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_ctx jsonb := hc.ctx();
  v_new hc.domain[];
  v_coord boolean;
begin
  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null;
  if v_doc.id is null then
    raise exception 'audience_refused' using errcode = 'P0001';
  end if;

  -- THE MOVE'S GATE: manage over the document as it stands, AND manage on
  -- the destination domain (§4.3.2's fourth rule).
  if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                   'document', p_document, null) < 'manage'
     or not ((v_ctx -> 'subjects' -> v_doc.subject_id::text -> 'manage')
             @> to_jsonb(array[hc.own_domain('document', p_category, null, null)])) then
    raise exception 'audience_refused' using errcode = 'P0001';
  end if;

  -- ADR-0033 D19.10 (R4/F-3): the level pair is a coordinator's fact.
  v_coord := exists (select 1 from public.circle_members m
                     where m.circle_id = v_doc.circle_id
                       and m.account_id = hc.uid()
                       and m.removed_at is null
                       and m.tier = 'coordinator');

  -- The recompute restores `resolved` when it completes, so the AFTER side
  -- is read as resolved: an unresolved document opening up IS an audience
  -- change (rung 3 hid it from everyone below manage×5).
  v_new := hc.document_taint_under(p_document, p_category);
  return query
    select r.member_id, r.display_name, r.tier,
           case when v_coord then r.before end,
           case when v_coord then r.after end,
           case when r.before = 'hidden' then 'gained'
                when r.after = 'hidden' then 'lost'
                else 'changed' end
      from hc.document_audience_rows(p_document, v_doc.taint, v_doc.taint_resolved,
                                     v_new, true) r
     where r.before <> r.after
     order by r.display_name, r.member_id;
end $$;

alter function hc.document_audience(uuid, hc.doc_category) owner to hc_internal;
revoke execute on function hc.document_audience(uuid, hc.doc_category)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.document_audience(uuid, hc.doc_category) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.document_audience_derived - the derived objects whose holders change
-- level under the proposed category (D19.3), behind the preview's gate.
-- ----------------------------------------------------------------------------
create or replace function hc.document_audience_derived(p_document uuid, p_category hc.doc_category)
returns table (object_type hc.object_type, object_id uuid, label text,
               holder_member_id uuid, holder_name text,
               before hc.access_level, after hc.access_level, change text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_ctx jsonb := hc.ctx();
  v_coord boolean;
begin
  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null;
  if v_doc.id is null then
    raise exception 'audience_refused' using errcode = 'P0001';
  end if;
  -- the preview's gate, verbatim
  if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                   'document', p_document, null) < 'manage'
     or not ((v_ctx -> 'subjects' -> v_doc.subject_id::text -> 'manage')
             @> to_jsonb(array[hc.own_domain('document', p_category, null, null)])) then
    raise exception 'audience_refused' using errcode = 'P0001';
  end if;
  v_coord := exists (select 1 from public.circle_members m
                     where m.circle_id = v_doc.circle_id
                       and m.account_id = hc.uid()
                       and m.removed_at is null
                       and m.tier = 'coordinator');

  return query
    select w.object_type, w.object_id,
           case when x.level >= x.need then x.label end,
           t.owner_member_id, m.display_name_at_join,
           case when v_coord then b.lvl end,
           case when v_coord then a.lvl end,
           case when b.lvl = 'hidden' then 'gained'
                when a.lvl = 'hidden' then 'lost'
                else 'changed' end
      from hc.document_taint_walk_under(p_document, p_category) w
      join public.tasks t
        on w.object_type = 'task' and t.id = w.object_id
       and t.deleted_at is null and t.status = 'open' and t.owner_member_id is not null
      join public.circle_members m
        on m.id = t.owner_member_id and m.removed_at is null and m.account_id is not null
      cross join lateral (
        select hc.visible_at(hc.ctx_for(m.account_id), t.subject_id,
                             w.taint_before, w.resolved_before, 'task', t.id, t.owner_member_id) as lvl) b
      cross join lateral (
        select hc.visible_at(hc.ctx_for(m.account_id), t.subject_id,
                             w.taint_after, true, 'task', t.id, t.owner_member_id) as lvl) a
      left join lateral hc.object_label_at(v_ctx, 'task'::hc.object_type, t.id) x on true
     where b.lvl <> a.lvl
     order by m.display_name_at_join, t.id;
end $$;

alter function hc.document_audience_derived(uuid, hc.doc_category) owner to hc_internal;
revoke execute on function hc.document_audience_derived(uuid, hc.doc_category)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.document_audience_derived(uuid, hc.doc_category) to authenticated;

-- ============================================================================
-- THE M4 CLUSTER (ADR-0033 D19.8 / D19.11) - R3/F-7, R4/F-4.
--
--   * D19.8 - outstanding invites are ABSENT under a freeze, matching PRD
--     S7.5's "voided": the invite branch takes a freeze term. 069:15's
--     `kind <> 'invite'` exclusion goes.
--   * D19.11 - the People list is frozen PER SUBJECT, as grant_vectors
--     scopes it, not circle-wide: a finding narrowed to Marcus must not
--     blank Nell's levels. An open freeze, or a finding not narrowed to a
--     subject, still blanks everything (the whole `levels` is null, as
--     before); a narrowed finding blanks that subject's entry alone
--     (hc.member_levels_frozen, owner-only, below).
--
-- hc.circle_people is M4's VERBATIM with the marked edits. Ownership,
-- revocations and grants restated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hc.member_levels_frozen - member_levels with each subject a finding is
-- narrowed to blanked (its entry null), the rest as they stand. Owner-only,
-- running AS the calling definer. A circle-wide freeze is handled by the
-- caller (the whole object is null then), so this sees only the narrowed
-- findings.
-- ----------------------------------------------------------------------------
create or replace function hc.member_levels_frozen(p_circle uuid, p_member uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
           e.key,
           case when exists (select 1 from public.freezes f
                             where f.circle_id = p_circle
                               and f.state = 'unresolved'
                               and f.subject_id = e.key::uuid)
                then null else e.value end),
         '{}'::jsonb)
    from jsonb_each(hc.member_levels(p_circle, p_member)) e;
$$;
alter function hc.member_levels_frozen(uuid, uuid) owner to hc_internal;
revoke execute on function hc.member_levels_frozen(uuid, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

create or replace function hc.circle_people(p_circle uuid)
returns table (
  kind               text,
  member_id          uuid,
  account_id         uuid,
  display_name       text,
  tier               hc.tier,
  slice              text,
  is_subject         boolean,
  subject_id         uuid,
  custodian_member_id uuid,
  custodian_name     text,
  joined_at          timestamptz,
  invite_id          uuid,
  invite_expires_at  timestamptz,
  invite_status      text,
  levels             jsonb
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_me record;
  v_coord boolean;
  v_frozen boolean;
  v_frozen_all boolean;
begin
  if v_actor is null then
    raise exception 'people_refused' using errcode = 'P0001';
  end if;
  -- The caller's own live membership in THIS circle. A non-member and a
  -- nonexistent circle are one shape.
  select m.* into v_me from public.circle_members m
   where m.circle_id = p_circle and m.account_id = v_actor and m.removed_at is null;
  if v_me.id is null then
    raise exception 'people_refused' using errcode = 'P0001';
  end if;
  v_coord := v_me.tier = 'coordinator';
  -- ANY freeze of the circle: outstanding invites are absent under it
  -- (ADR-0033 D19.8 - PRD S7.5 "voided"; R3/F-7).
  v_frozen := exists (select 1 from public.freezes f
                      where f.circle_id = p_circle and f.state in ('open', 'unresolved'));
  -- A CIRCLE-WIDE freeze blanks every level: an open freeze, or a finding
  -- not narrowed to a subject. A finding narrowed to ONE subject blanks
  -- that subject's levels alone (ADR-0033 D19.11 - the People list is
  -- frozen PER SUBJECT, as grant_vectors scopes it; R4/F-4).
  v_frozen_all := exists (select 1 from public.freezes f
                          where f.circle_id = p_circle
                            and (f.state = 'open'
                                 or (f.state = 'unresolved' and f.subject_id is null)));

  return query
  select p.kind, p.member_id, p.account_id, p.display_name, p.tier, p.slice,
         p.is_subject, p.subject_id, p.custodian_member_id, p.custodian_name,
         p.joined_at, p.invite_id, p.invite_expires_at, p.invite_status, p.levels
    from (
      -- Subjects as people: the highest access to their own record, their
      -- custodian named beside them (§7.5).
      select 'subject'::text as kind, m.id as member_id, m.account_id,
             m.display_name_at_join as display_name, m.tier, a.slice,
             true as is_subject, m.subject_id, m.custodian_member_id,
             cm.display_name_at_join as custodian_name, m.joined_at,
             null::uuid as invite_id, null::timestamptz as invite_expires_at,
             null::text as invite_status,
             case when v_frozen_all then null else hc.member_levels_frozen(p_circle, m.id) end as levels,
             0 as ord
        from public.circle_members m
        left join public.accounts a on a.id = m.account_id
        left join public.circle_members cm on cm.id = m.custodian_member_id
       where m.circle_id = p_circle and m.removed_at is null and m.subject_id is not null
      union all
      -- Members: levels for a coordinator, and for the person herself.
      select 'member', m.id, m.account_id, m.display_name_at_join, m.tier, a.slice,
             false, null, null, null, m.joined_at, null, null, null,
             case when v_frozen_all then null
                  when v_coord or m.id = v_me.id then hc.member_levels_frozen(p_circle, m.id)
                  else null end,
             1
        from public.circle_members m
        left join public.accounts a on a.id = m.account_id
       where m.circle_id = p_circle and m.removed_at is null and m.subject_id is null
      union all
      -- Open invites, coordinators only: pending, or expired and re-sendable.
      select 'invite', null, null, i.invited_email::text, i.tier, null,
             false, null, null, null, i.created_at, i.id, i.expires_at,
             case when i.expires_at > now() then 'pending' else 'expired' end,
             null,
             2
        from public.invites i
       where v_coord and i.circle_id = p_circle
         and i.accepted_at is null and i.revoked_at is null
         and not v_frozen   -- ADR-0033 D19.8: voided under a freeze, so absent
    ) p
   order by p.ord, p.display_name, p.member_id, p.invite_id;
end $$;

alter function hc.circle_people(uuid) owner to hc_internal;
revoke execute on function hc.circle_people(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.circle_people(uuid) to authenticated;

