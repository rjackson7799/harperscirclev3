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
-- NO DDL: seven `create or replace` bodies — three for cluster A here, two
-- for cluster B (`assign_task`, `unassign_task`, which cluster C then edits
-- in place), two for cluster C (`complete_task`, `revoke_share`) — no schema
-- change. Ownership,
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
