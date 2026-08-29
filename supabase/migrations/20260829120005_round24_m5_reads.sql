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
-- NO DDL: three `create or replace` bodies, no schema change. Ownership,
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
