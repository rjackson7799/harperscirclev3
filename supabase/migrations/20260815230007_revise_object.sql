-- ============================================================================
-- 1B · M7 — hc.revise_object() (TSD §3.7): the one edit path. Writes the
-- record_revisions row in the same transaction; never touches the
-- provenance block or taint (those are not even addressable — the column
-- allowlist refuses before the guard would).
--
-- Allowlist (content columns only; conservative, reviewable):
--   document        title, summary_text
--   task            title, detail, due_on, due_zone
--   timeline_event  summary
--   episode         title
--   profile_fact    NOTHING — supersede-only (§2.5); category/kind changes
--                   are reclassification machinery, not edits.
--
-- Refusals: nonexistent, unauthorized, frozen and supersede-only share
-- ONE shape (revise_refused, DEF-10); a disallowed column is
-- revise_invalid_field — distinct only after the caller holds manage.
-- ============================================================================

create function hc.revise_object(
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

alter function hc.revise_object(hc.object_type, uuid, jsonb) owner to hc_internal;
revoke execute on function hc.revise_object(hc.object_type, uuid, jsonb)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.revise_object(hc.object_type, uuid, jsonb)
  to authenticated;
