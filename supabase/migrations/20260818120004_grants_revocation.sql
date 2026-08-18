-- ============================================================================
-- 2A · M4 — the grant and revocation writers: hc.set_grant ·
-- hc.remove_member (TSD §5.8; PRD §4.6.3, §7.4, §7.5, §8.8; AC-PERM-5).
--
-- Revocation's whole promise (§5.8, PRD §4.6.3 "immediate") rests on the
-- reads being live: hc.ctx() re-reads these tables on every request, so
-- the writers below only have to make the state true — no cache, token or
-- session needs invalidating for READS. The sessions row of the §5.8
-- matrix is the Supabase admin API, wired at the app layer (2B), which is
-- why remove_member returns the account id.
--
-- Both writers run under the per-circle advisory lock (R-rule, annex A4):
-- grant changes and membership removal are exactly the security-state
-- transitions whose mid-wait commit must defeat in-flight record writers
-- (RAC-02's contract, now produced by real functions instead of
-- maintenance DML).
--
-- Asymmetries, all deliberate:
--   · RAISING requires a §5.7 step-up token bound to
--     'raise_grant' + member:subject:domain. LOWERING never does —
--     revocation must not be gated on re-auth friction (§5.6's spirit:
--     the dangerous direction is widening, not narrowing).
--   · A freeze refuses raises (PRD §7.5 "no new grants" — named
--     freeze_active) and PERMITS lowers: an upheld finding is executed
--     BY lowering or removing the objected-to member.
--   · 'hidden' DELETES the grant row. Absence is hidden — the same
--     representation tier defaults write, so grant_vectors needs no
--     special case.
--   · The care-circle ceiling binds structurally: a care member's level
--     never exceeds hc.tier_defaults('care_circle') for that domain
--     (schedule → summary; everything else → hidden). "This is a
--     ceiling, not a starting point — it doesn't rise" (PRD §4.1.5).
-- ============================================================================

grant update, delete on public.access_grants to hc_internal;
create policy access_grants_internal_set on public.access_grants
  for update to hc_internal using (true) with check (true);
create policy access_grants_internal_revoke on public.access_grants
  for delete to hc_internal using (true);

insert into hc.log_event_types (code, description) values
  ('member_removed',       'A membership was removed; grants deleted, shares revoked'),
  ('task_unassigned',      'An open task lost its holder at their removal (PRD §8.8)'),
  ('object_share_revoked', 'An object-level share was revoked');

-- ----------------------------------------------------------------------------
-- hc.set_grant — PRD §4.6.3: per-subject, per-domain, by a Coordinator.
-- ----------------------------------------------------------------------------
create function hc.set_grant(
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

  -- Discovery: the target member, live, with an ACCOUNT (the subject's
  -- own member row is not a grant surface — PRD §7.5 represents the
  -- subject as holder of the highest access; a coordinator does not edit
  -- that standing).
  select m.* into v_target from public.circle_members m
    where m.id = p_member_id and m.removed_at is null and m.account_id is not null;
  if v_target.id is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- The actor must be a live coordinator of the TARGET's circle.
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_target.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null
                   and m.tier = 'coordinator') then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- The subject must be live in the same circle.
  if not exists (select 1 from public.subjects s
                 where s.id = p_subject_id and s.circle_id = v_target.circle_id) then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- R-rule: this is a security-state transition; everything below binds
  -- under the lock, and a record writer waiting on it sees the new state.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_target.circle_id::text));

  v_before := coalesce((select g.level from public.access_grants g
                        where g.member_id = p_member_id
                          and g.subject_id = p_subject_id
                          and g.domain = p_domain),
                       'hidden'::hc.access_level);

  if p_level = v_before then
    -- a quiet no-op: nothing changes, nothing logs, no token demanded
    return jsonb_build_object('member_id', p_member_id, 'subject_id', p_subject_id,
                              'domain', p_domain, 'before', v_before,
                              'after', p_level, 'changed', false);
  end if;

  if p_level > v_before then
    -- The care ceiling: never above the §7.4 default for the domain.
    if v_target.tier = 'care_circle' then
      v_cap := coalesce((select t.level from hc.tier_defaults('care_circle') t
                         where t.domain = p_domain),
                        'hidden'::hc.access_level);
      if p_level > v_cap then
        raise exception 'grant_refused' using errcode = 'P0001';
      end if;
    end if;
    -- PRD §7.5: no new grants under any freeze — raises refuse, named.
    if exists (select 1 from public.freezes f
               where f.circle_id = v_target.circle_id
                 and f.state in ('open', 'unresolved')) then
      raise exception 'freeze_active' using errcode = 'P0001';
    end if;
    -- §5.7: raising a grant demands a fresh, bound step-up token.
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

  return jsonb_build_object('member_id', p_member_id, 'subject_id', p_subject_id,
                            'domain', p_domain, 'before', v_before,
                            'after', p_level, 'changed', true);
end $$;

alter function hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)
  owner to hc_internal;
revoke execute on function hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- hc.remove_member — §5.8's one transaction. A freeze does not block it:
-- removal reduces reach, and the upheld-finding flow depends on it.
-- ----------------------------------------------------------------------------
create function hc.remove_member(
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

  -- Live, account-holding target: the subject-member row is standing,
  -- not membership, and is never removable here.
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

  -- R-rule: membership removal is THE canonical security-state
  -- transition (RAC-02); everything below happens under the lock.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_target.circle_id::text));

  -- §12.7: a circle is never orphaned — the last live coordinator
  -- transfers first (checked under the lock so two removals serialize).
  if v_target.tier = 'coordinator'
     and (select count(*) from public.circle_members m
          where m.circle_id = v_target.circle_id
            and m.tier = 'coordinator'
            and m.removed_at is null
            and m.account_id is not null) <= 1 then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  -- The keep-list is an EXPLICIT decision: every named id must be this
  -- member's live share, or the whole call refuses.
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

  -- PRD §8.8: open tasks become unassigned and surface for the
  -- coordinator, labelled with who held them; completed work stays
  -- attributed. Removal and each unassignment are separate entries at
  -- the same timestamp (one transaction, one now()).
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

  return jsonb_build_object(
    'member_id', p_member_id,
    'account_id', v_target.account_id,
    'revoked_share_count', v_shares,
    'unassigned_task_count', v_tasks);
end $$;

alter function hc.remove_member(uuid, uuid[]) owner to hc_internal;
revoke execute on function hc.remove_member(uuid, uuid[])
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.remove_member(uuid, uuid[]) to authenticated;
