-- ============================================================================
-- 7A · M4 — record reads: hc.circle_people · hc.document_references ·
-- hc.shares_for · hc.shares_for_member
-- (PRD §4.3.4, §4.3.5, §4.6.1, §4.6.2, §7.5, §8.5; AC-PPL-2/3; TSD §3.5's
-- counted-never-named discipline, hc.receipt_for's shape). docs/review/
-- slice-7-plan.md, "Migration bound (Q2)", row M4 — BINDING. Pinned by
-- pgTAP 069, which went red before this existed. NO SHIPPED MIGRATION IS
-- EDITED — this migration only adds. NO POLICY MOVES: provenance_edges and
-- object_shares keep their hc_internal-only policies, access_grants keeps
-- access_grants_select_own, invites keep zero request-path privilege. The
-- read is the function.
--
-- ---------------------------------------------------------------------------
-- WHAT STOOD IN THE WAY. A coordinator could not read another member's
-- grants through RLS (access_grants_select_own), nobody could list invites,
-- and neither provenance_edges nor object_shares had a member-facing read —
-- so "what they can see, per subject" (§4.6.1), "Invited · expires Friday"
-- (§4.6.2), "everything else in the record that references it" and "who it
-- has been shared with" (§4.3.4) could not be composed at the app layer at
-- any level of cleverness. Each gets ONE definer, filtered per row through
-- hc.visible_at, never wider than the RLS it stands in for.
--
-- ---------------------------------------------------------------------------
-- hc.circle_people(circle) — ONE circle, named by the caller: a person may
-- belong to several (§8.12) and the People surface is a page of one. Every
-- live member AND every subject-member row, subjects as people "with no
-- account attached and their custodian named beside them" (§7.5 — the
-- model, not a placeholder), tier, declared slice, joined-at, and LEVELS
-- per subject per domain as jsonb — every domain explicit, `hidden` spelled
-- out, so the ONE phrase module at 7B renders "Nell: full · Marcus: summary
-- only" from a complete fact and never infers a gap. Levels are the GRANT
-- levels (the state a coordinator set, the fact the People list is about);
-- a FROZEN circle returns the people and NO levels, because a freeze
-- suspends all interactive access and the list does not pretend otherwise.
--
-- WHO READS WHOSE LEVELS, fail closed: a coordinator reads everyone's; any
-- other member reads her own and the subjects' standing (public by §7.5)
-- and gets NULL for the rest — null, not hidden, so "not yours to know" and
-- "he has none" cannot be confused. Pending and expired invites (§4.6.2,
-- §8.5: no membership row before acceptance) appear for coordinators only;
-- accepted and revoked invites are not people. A non-member and a
-- nonexistent circle are ONE shape (people_refused).
--
-- hc.document_references(document) — every record object whose provenance
-- graph reaches the document (the 1B walk, depth 32, UNION not UNION ALL),
-- each at the CALLER's own level of the destination through that
-- destination's OWN policy predicate — tasks with their owner column, facts
-- at view, `deleted_at is null` throughout (a deleted object is not in the
-- record and is not reported). COUNTED, NEVER NAMED: object_type survives,
-- object_id and label are suppressed TOGETHER, `visible` is explicit. Gated
-- on seeing the document itself at summary; nonexistent and hidden are one
-- shape. AC-PERM-10 falls out at the read: a share on the document lifts the
-- document to view and lifts nothing derived from it.
--
-- hc.shares_for(type, id) — the live shares on an object, for a caller who
-- holds MANAGE on it: "who it has been shared with, and a control to
-- unshare" is the manage-holder's control surface, and the list of who else
-- can read a thing is not a `summary` reader's to know. An object the caller
-- cannot manage, and one that does not exist, return ZERO ROWS — never an
-- error, never an empty shape, so the two are indistinguishable and the
-- function is no existence oracle. A revoked share is absent.
--
-- hc.shares_for_member(member) — the live shares a person holds, for a live
-- coordinator of the circle or the person herself; each object at the
-- CALLER's level, counted-never-named exactly as above. Anyone else, and a
-- nonexistent member, get zero rows.
--
-- All four are STABLE definer reads; the AI role holds no EXECUTE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A member's grant levels per subject per domain, every domain explicit.
-- Owner-only, running AS the calling definer.
-- ----------------------------------------------------------------------------
create function hc.member_levels(p_circle uuid, p_member uuid)
returns jsonb language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.id::text, (
           select jsonb_object_agg(d::text, coalesce(g.level, 'hidden'::hc.access_level)::text)
             from unnest(hc.all_domains()) d
             left join public.access_grants g
               on g.member_id = p_member and g.subject_id = s.id and g.domain = d)),
         '{}'::jsonb)
    from public.subjects s
   where s.circle_id = p_circle and s.deleted_at is null;
$$;
alter function hc.member_levels(uuid, uuid) owner to hc_internal;
revoke execute on function hc.member_levels(uuid, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- One record object's label and the caller's level of it, through the
-- object's OWN policy predicate (20260815230002:290-333, hc.receipt_for's
-- discipline): deleted ⇒ no row; `need` is the policy's threshold (facts
-- read at view). Owner-only, running AS the calling definer.
-- ----------------------------------------------------------------------------
create function hc.object_label_at(p_ctx jsonb, p_type hc.object_type, p_id uuid)
returns table (label text, level hc.access_level, need hc.access_level)
language sql stable
set search_path = ''
as $$
  select d.title,
         hc.visible_at(p_ctx, d.subject_id, d.taint, d.taint_resolved, 'document', d.id, null),
         'summary'::hc.access_level
    from public.documents d
   where p_type = 'document' and d.id = p_id and d.deleted_at is null
  union all
  select t.title,
         hc.visible_at(p_ctx, t.subject_id, t.taint, t.taint_resolved, 'task', t.id, t.owner_member_id),
         'summary'
    from public.tasks t
   where p_type = 'task' and t.id = p_id and t.deleted_at is null
  union all
  select e.summary,
         hc.visible_at(p_ctx, e.subject_id, e.taint, e.taint_resolved, 'timeline_event', e.id, null),
         'summary'
    from public.timeline_events e
   where p_type = 'timeline_event' and e.id = p_id and e.deleted_at is null
  union all
  select ep.title,
         hc.visible_at(p_ctx, ep.subject_id, ep.taint, ep.taint_resolved, 'episode', ep.id, null),
         'summary'
    from public.episodes ep
   where p_type = 'episode' and ep.id = p_id and ep.deleted_at is null
  union all
  -- profile_facts read at VIEW, not summary (§3.4's level→table map)
  select pf.field,
         hc.visible_at(p_ctx, pf.subject_id, pf.taint, pf.taint_resolved, 'profile_fact', pf.id, null),
         'view'
    from public.profile_facts pf
   where p_type = 'profile_fact' and pf.id = p_id and pf.deleted_at is null;
$$;
alter function hc.object_label_at(jsonb, hc.object_type, uuid) owner to hc_internal;
revoke execute on function hc.object_label_at(jsonb, hc.object_type, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.circle_people
-- ----------------------------------------------------------------------------
create function hc.circle_people(p_circle uuid)
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
  v_frozen := exists (select 1 from public.freezes f
                      where f.circle_id = p_circle and f.state in ('open', 'unresolved'));

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
             case when v_frozen then null else hc.member_levels(p_circle, m.id) end as levels,
             0 as ord
        from public.circle_members m
        left join public.accounts a on a.id = m.account_id
        left join public.circle_members cm on cm.id = m.custodian_member_id
       where m.circle_id = p_circle and m.removed_at is null and m.subject_id is not null
      union all
      -- Members: levels for a coordinator, and for the person herself.
      select 'member', m.id, m.account_id, m.display_name_at_join, m.tier, a.slice,
             false, null, null, null, m.joined_at, null, null, null,
             case when v_frozen then null
                  when v_coord or m.id = v_me.id then hc.member_levels(p_circle, m.id)
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
    ) p
   order by p.ord, p.display_name, p.member_id, p.invite_id;
end $$;

alter function hc.circle_people(uuid) owner to hc_internal;
revoke execute on function hc.circle_people(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.circle_people(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.document_references
-- ----------------------------------------------------------------------------
create function hc.document_references(p_document uuid)
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
   order by r.otype, r.oid;
end $$;

alter function hc.document_references(uuid) owner to hc_internal;
revoke execute on function hc.document_references(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.document_references(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.shares_for
-- ----------------------------------------------------------------------------
create function hc.shares_for(p_object_type hc.object_type, p_object_id uuid)
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
   order by m.display_name_at_join, sh.id;
end $$;

alter function hc.shares_for(hc.object_type, uuid) owner to hc_internal;
revoke execute on function hc.shares_for(hc.object_type, uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.shares_for(hc.object_type, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.shares_for_member
-- ----------------------------------------------------------------------------
create function hc.shares_for_member(p_member uuid)
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
  if v_m.account_id is distinct from v_actor
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
   order by sh.object_type, sh.id;
end $$;

alter function hc.shares_for_member(uuid) owner to hc_internal;
revoke execute on function hc.shares_for_member(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.shares_for_member(uuid) to authenticated;
