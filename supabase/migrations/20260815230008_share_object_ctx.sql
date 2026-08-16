-- ============================================================================
-- 1B · M8 — hc.share_object() (TSD §2.5, §3.6) and CTX-07: the ctx `shares`
-- placeholder replaced with the §3.2-VERBATIM subquery over object_shares,
-- in BOTH hc.ctx() and hc.ctx_for().
--
-- hc.share_object() is the ONLY writer of object_shares, and it validates
-- in ONE transaction (§2.5): the object exists; its circle_id and
-- subject_id equal the share's; the grantee is a live member of that
-- circle; the granter can currently see the object at manage. Every
-- refusal — nonexistent, cross-circle, dead grantee, insufficient granter,
-- duplicate live share — is ONE shape (share_refused, DEF-10).
--
-- Share revocation surfaces (unassign, PRD §4.5.6) are 1C/1D machinery;
-- in 1B revocation is reachable only via the maintenance path, and the
-- partial unique + ctx filters already honour it.
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('object_shared', 'One named object shared with one named member');

create function hc.share_object(
  p_object_type hc.object_type, p_object_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_obj record;
  v_grantee record;
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  select * into v_grantee from public.circle_members m
    where m.id = p_member_id
      and m.circle_id = v_obj.circle_id
      and m.removed_at is null;
  if v_grantee.id is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  if p_object_type = 'task' then
    select t.owner_member_id into v_owner from public.tasks t where t.id = p_object_id;
  end if;

  if hc.visible_at(hc.ctx(), v_obj.subject_id, v_obj.taint, v_obj.taint_resolved,
                   p_object_type, p_object_id, v_owner) < 'manage' then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  begin
    insert into public.object_shares
      (circle_id, subject_id, object_type, object_id, member_id, granted_by)
    values
      (v_obj.circle_id, v_obj.subject_id, p_object_type, p_object_id,
       p_member_id, v_actor);
  exception when unique_violation then
    raise exception 'share_refused' using errcode = 'P0001';
  end;

  perform hc.log(v_obj.circle_id, 'object_shared', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_obj.subject_id,
                 p_target_member_id => p_member_id,
                 p_object_type => p_object_type, p_object_id => p_object_id);

  return jsonb_build_object('object_type', p_object_type,
                            'object_id', p_object_id, 'member_id', p_member_id);
end $$;

alter function hc.share_object(hc.object_type, uuid, uuid) owner to hc_internal;
revoke execute on function hc.share_object(hc.object_type, uuid, uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.share_object(hc.object_type, uuid, uuid)
  to authenticated;

-- ----------------------------------------------------------------------------
-- CTX-07: the §3.2-verbatim shares subquery replaces the 1A placeholder.
-- Everything above the shares key is byte-identical to M7/1A.
-- ----------------------------------------------------------------------------
create or replace function hc.ctx()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', hc.uid(),
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = hc.uid() and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(hc.uid()) s), '{}'::jsonb),
    'shares', coalesce((
      select jsonb_object_agg(o.object_type::text, o.ids)
      from (select sh.object_type, jsonb_agg(sh.object_id) as ids
            from public.object_shares sh
            join public.circle_members m on m.id = sh.member_id
            where m.account_id = hc.uid() and sh.revoked_at is null
              and m.removed_at is null
            group by sh.object_type) o), '{}'::jsonb));
$$;

create or replace function hc.ctx_for(p_account uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', p_account,
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = p_account and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(p_account) s), '{}'::jsonb),
    'shares', coalesce((
      select jsonb_object_agg(o.object_type::text, o.ids)
      from (select sh.object_type, jsonb_agg(sh.object_id) as ids
            from public.object_shares sh
            join public.circle_members m on m.id = sh.member_id
            where m.account_id = p_account and sh.revoked_at is null
              and m.removed_at is null
            group by sh.object_type) o), '{}'::jsonb));
$$;
