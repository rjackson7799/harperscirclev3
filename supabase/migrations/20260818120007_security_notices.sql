-- ============================================================================
-- 2A · M7 — revocation notices as security-class mail (TSD §5.9's explicit
-- exception; §5.8; PRD §7.5 "who is told"). Forward-fix: hc.set_grant and
-- hc.remove_member are re-created from M4 verbatim with ONE addition each —
-- the enqueue into outbound_mail (M5's queue; delivery is slice 11).
--
-- The §5.9 exception, stated so it cannot be widened by accident: a
-- revocation notice is addressed to the person whose access just ended, at
-- their VERIFIED ACCOUNT ADDRESS regardless of circle access, and carries
-- no subject, domain, or record information — it names the circle, says
-- access changed, and says who changed it. The payload here is EXACTLY
-- {circle_name, changed_by}; 041 pins the key set. Raises and no-ops
-- enqueue nothing — widening is not a revocation. An account with no
-- mirrored email (nothing to address) skips the enqueue rather than
-- failing the revocation: the access change must never be blocked by the
-- notice.
-- ============================================================================

create or replace function hc.set_grant(
  p_member_id uuid, p_subject_id uuid, p_domain hc.domain,
  p_level hc.access_level, p_step_up_token text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_target record;
  v_before hc.access_level;
  v_cap    hc.access_level;
begin
  if v_actor is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  select m.* into v_target from public.circle_members m
    where m.id = p_member_id and m.removed_at is null and m.account_id is not null;
  if v_target.id is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_target.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null
                   and m.tier = 'coordinator') then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.subjects s
                 where s.id = p_subject_id and s.circle_id = v_target.circle_id) then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_target.circle_id::text));

  v_before := coalesce((select g.level from public.access_grants g
                        where g.member_id = p_member_id
                          and g.subject_id = p_subject_id
                          and g.domain = p_domain),
                       'hidden'::hc.access_level);

  if p_level = v_before then
    return jsonb_build_object('member_id', p_member_id, 'subject_id', p_subject_id,
                              'domain', p_domain, 'before', v_before,
                              'after', p_level, 'changed', false);
  end if;

  if p_level > v_before then
    if v_target.tier = 'care_circle' then
      v_cap := coalesce((select t.level from hc.tier_defaults('care_circle') t
                         where t.domain = p_domain),
                        'hidden'::hc.access_level);
      if p_level > v_cap then
        raise exception 'grant_refused' using errcode = 'P0001';
      end if;
    end if;
    if exists (select 1 from public.freezes f
               where f.circle_id = v_target.circle_id
                 and f.state in ('open', 'unresolved')) then
      raise exception 'freeze_active' using errcode = 'P0001';
    end if;
    if p_step_up_token is null
       or not hc.consume_step_up(p_step_up_token, 'raise_grant',
                p_member_id::text || ':' || p_subject_id::text || ':' || p_domain::text,
                v_actor) then
      raise exception 'grant_refused' using errcode = 'P0001';
    end if;
  end if;

  if p_level = 'hidden' then
    delete from public.access_grants
     where member_id = p_member_id and subject_id = p_subject_id
       and domain = p_domain;
  elsif v_before = 'hidden' then
    insert into public.access_grants
      (circle_id, member_id, subject_id, domain, level, granted_by)
    values (v_target.circle_id, p_member_id, p_subject_id, p_domain, p_level, v_actor);
  else
    update public.access_grants
       set level = p_level, granted_by = v_actor, granted_at = now()
     where member_id = p_member_id and subject_id = p_subject_id
       and domain = p_domain;
  end if;

  perform hc.log(v_target.circle_id, 'grant_changed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => p_subject_id,
                 p_target_member_id => p_member_id,
                 p_domain => p_domain,
                 p_level_before => v_before,
                 p_level_after => p_level);

  -- 2A M7: §5.9's exception — a LOWER notifies the person whose access
  -- ended. Content-free by construction: the circle's name and the actor,
  -- nothing else.
  if p_level < v_before then
    insert into public.outbound_mail
      (class, template, recipient_account_id, recipient_email, payload)
    select 'security', 'access_changed', a.id, a.email,
           jsonb_build_object(
             'circle_name', (select c.name from public.circles c
                             where c.id = v_target.circle_id),
             'changed_by', v_actor_name)
    from public.accounts a
    where a.id = v_target.account_id and a.email is not null;
  end if;

  return jsonb_build_object('member_id', p_member_id, 'subject_id', p_subject_id,
                            'domain', p_domain, 'before', v_before,
                            'after', p_level, 'changed', true);
end $$;

create or replace function hc.remove_member(
  p_member_id uuid, p_keep_share_ids uuid[] default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_target record;
  v_keep uuid[] := coalesce(p_keep_share_ids, '{}'::uuid[]);
  v_now timestamptz := now();
  v_shares int := 0;
  v_tasks int := 0;
  r record;
begin
  if v_actor is null then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  select m.* into v_target from public.circle_members m
    where m.id = p_member_id and m.removed_at is null and m.account_id is not null;
  if v_target.id is null then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_target.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null
                   and m.tier = 'coordinator') then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_target.circle_id::text));

  if v_target.tier = 'coordinator'
     and (select count(*) from public.circle_members m
          where m.circle_id = v_target.circle_id
            and m.tier = 'coordinator'
            and m.removed_at is null
            and m.account_id is not null) <= 1 then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  if exists (select 1 from unnest(v_keep) k
             where not exists (select 1 from public.object_shares sh
                               where sh.id = k and sh.member_id = p_member_id
                                 and sh.revoked_at is null)) then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  update public.circle_members
     set removed_at = v_now, removed_by = v_actor
   where id = p_member_id;

  delete from public.access_grants where member_id = p_member_id;

  for r in
    update public.object_shares sh
       set revoked_at = v_now
     where sh.member_id = p_member_id
       and sh.revoked_at is null
       and not (sh.id = any (v_keep))
    returning sh.object_type, sh.object_id
  loop
    v_shares := v_shares + 1;
    perform hc.log(v_target.circle_id, 'object_share_revoked', v_actor_name,
                   p_actor_account_id => v_actor,
                   p_target_member_id => p_member_id,
                   p_object_type => r.object_type, p_object_id => r.object_id);
  end loop;

  for r in
    update public.tasks t
       set owner_member_id = null, assigned_by = null, assigned_at = null
     where t.owner_member_id = p_member_id
       and t.status = 'open'
       and t.deleted_at is null
    returning t.id, t.subject_id
  loop
    v_tasks := v_tasks + 1;
    perform hc.log(v_target.circle_id, 'task_unassigned', v_actor_name,
                   p_actor_account_id => v_actor,
                   p_subject_id => r.subject_id,
                   p_object_type => 'task', p_object_id => r.id,
                   p_detail => jsonb_build_object(
                     'former_owner_member_id', p_member_id,
                     'former_owner_name', v_target.display_name_at_join));
  end loop;

  perform hc.log(v_target.circle_id, 'member_removed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_target_member_id => p_member_id,
                 p_detail => jsonb_build_object(
                   'removed_display_name', v_target.display_name_at_join,
                   'shares_revoked', v_shares,
                   'shares_kept', cardinality(v_keep),
                   'tasks_unassigned', v_tasks));

  -- 2A M7: §5.9's exception — the removed person is owed this message at
  -- their account address, regardless of the access that just ended.
  insert into public.outbound_mail
    (class, template, recipient_account_id, recipient_email, payload)
  select 'security', 'membership_removed', a.id, a.email,
         jsonb_build_object(
           'circle_name', (select c.name from public.circles c
                           where c.id = v_target.circle_id),
           'changed_by', v_actor_name)
  from public.accounts a
  where a.id = v_target.account_id and a.email is not null;

  return jsonb_build_object(
    'member_id', p_member_id,
    'account_id', v_target.account_id,
    'revoked_share_count', v_shares,
    'unassigned_task_count', v_tasks);
end $$;
