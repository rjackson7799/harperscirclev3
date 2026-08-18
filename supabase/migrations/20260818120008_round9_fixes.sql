-- ============================================================================
-- 2A · M8 — round-9 forward fixes (docs/review/round-9-findings.md;
-- dispositions ADR-0013). The reserved slot, spent as the 1D precedent was.
--
-- FINDING 1 (critical): hc.record_auth_attempt(text, text) let any caller
-- holding a request role assert a SUCCESS-class outcome for any identifier,
-- clearing the victim's throttle and starving the §5.11 threshold. Latent
-- today (hc is not API-exposed — PIN-01 — and request roles are assumable
-- only server-side), but the grant encoded the wrong authority, and 2B's
-- server channel would have made it load-bearing. The split:
--   · hc.record_auth_failure(identifier) — anon + authenticated. A request
--     role may assert ONLY the outcome an attacker can already produce for
--     real (a failed attempt); AC-AUTH-12 boxes fabrication either way.
--   · hc.record_auth_success(kind) — authenticated ONLY, and IDENTITY-
--     BOUND: no identifier parameter exists; the cleared key derives from
--     hc.uid() → accounts.email (the M5 mirror). The only throttle state a
--     session can clear is the one its own successful authentication
--     already refutes — 'success' after sign-in, 'reset_completed' after
--     the recovery flow, both of which end holding a session AS the
--     account. The old two-argument form is DROPPED (never replaced across
--     a signature change — the overload inventory is an invariant).
--   2B contract (recorded in ADR-0013): the throttle is enforced only if
--   every password-verification path runs through the app boundary that
--   consults hc.auth_throttle and records outcomes; GoTrue's own rate
--   limits stay on as the backstop. These RPCs are not publicly usable
--   until that boundary lands — PIN-01 keeps them off the API surface.
--
-- FINDING 2 (high): hc.accept_sender evaluated its freeze/authorization
-- predicates and WROTE (sender row + log entry) before taking the
-- per-circle lock — annex A4 verbatim requires the lock "before any row
-- lock, with every authorization and freeze predicate evaluating under it
-- against re-read rows". A freeze committing mid-wait left an accepted
-- sender + audit entry standing inside a frozen circle (case 30's red).
-- The pre-lock hc.log call also inverted the pinned acyclic advisory
-- order (taint: before hc.log's unprefixed key) — a deadlock class, gone
-- with the reorder. The same audit found the CLASS in the M4/M7 writers:
-- set_grant and remove_member read their target and authorized the actor
-- BEFORE the lock, so a removal committing mid-wait let a token-carrying
-- raise re-grant a just-removed member (case 31a's red: removed member
-- holding a live grant) and let a just-removed coordinator's in-flight
-- removal complete (case 31b). All three are re-created with the A4
-- shape: discovery reads bind ONLY the lock key (a member row never
-- changes circles — the advance_arrival precedent); every predicate
-- re-evaluates under the lock against re-read rows. Single-session
-- behaviour and refusal shapes are unchanged (035–041 stay green).
-- create_invite and the revoke surfaces deliberately do NOT join the
-- locked set — argued in ADR-0013 (an invite is an inert claim check
-- whose redemption re-validates everything under the lock; revocations
-- reduce reach and are freeze-exempt by design).
--
-- FINDING 3 (high): hc.execute_wasnt_me consumed the single-use token and
-- returned an account id, leaving the promised session destruction to the
-- 2B caller's process memory — a crash after commit left a dead link and
-- live sessions, permanently. Now the SAME transaction that consumes the
-- token enqueues public.security_actions (UNIQUE(event_id): exactly-once
-- per event, structurally). "Token consumed" therefore implies "global
-- sign-out + forced reset durably owed". The app still performs the
-- GoTrue admin kill immediately after commit and marks completion via
-- hc.complete_security_action; a privileged worker retries stragglers
-- from hc.pending_security_actions (both hc_pipeline-only — the outbox
-- drain posture). Completion is retry-safe: a second completion reports
-- {completed:false}, never errors; an unknown id refuses loudly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F1 · The recorder split.
-- ----------------------------------------------------------------------------
drop function hc.record_auth_attempt(text, text);

create function hc.record_auth_failure(p_identifier text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := hc.contact_key(p_identifier);
begin
  if coalesce(v_key, '') = '' then
    raise exception 'auth_attempt_refused' using errcode = 'P0001';
  end if;

  delete from public.auth_attempts
   where attempt_key = v_key
     and attempted_at < now() - interval '24 hours';

  insert into public.auth_attempts (attempt_key, outcome)
  values (v_key, 'failure');

  return jsonb_build_object(
    'failures', (hc.auth_throttle(p_identifier)->>'failures')::int);
end $$;

alter function hc.record_auth_failure(text) owner to hc_internal;
revoke execute on function hc.record_auth_failure(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.record_auth_failure(text) to anon, authenticated;

create function hc.record_auth_success(p_kind text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid := hc.uid();
  v_email   text;
  v_key     text;
begin
  if p_kind is null
     or p_kind not in ('success', 'reset_completed')
     or v_account is null then
    raise exception 'auth_attempt_refused' using errcode = 'P0001';
  end if;

  -- The ONLY key this session can clear: its own account's address, from
  -- the M5 mirror. No parameter exists to aim anywhere else.
  select a.email::text into v_email
  from public.accounts a
  where a.id = v_account and a.deleted_at is null;

  v_key := hc.contact_key(coalesce(v_email, ''));
  if coalesce(v_key, '') = '' then
    raise exception 'auth_attempt_refused' using errcode = 'P0001';
  end if;

  delete from public.auth_attempts
   where attempt_key = v_key
     and attempted_at < now() - interval '24 hours';

  insert into public.auth_attempts (attempt_key, outcome)
  values (v_key, p_kind);

  return jsonb_build_object('cleared', true);
end $$;

alter function hc.record_auth_success(text) owner to hc_internal;
revoke execute on function hc.record_auth_success(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.record_auth_success(text) to authenticated;

-- ----------------------------------------------------------------------------
-- F2 · hc.accept_sender — body as M6 with the A4 order: the per-circle lock
-- FIRST (the key is the parameter; no discovery read needed), every
-- predicate under it, hc.log after taint: (the pinned acyclic order).
-- ----------------------------------------------------------------------------
create or replace function hc.accept_sender(
  p_circle_id uuid, p_address text default null, p_domain text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_domain  text := nullif(btrim(coalesce(p_domain, '')), '');
  v_sender uuid;
  v_released int := 0;
  v_lease uuid;
  v_attempt int;
  r record;
begin
  if v_actor is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  -- R-rule (annex A4, round-9 F2): acceptance changes what auto-processes
  -- — a security-state write. The lock comes before every predicate; a
  -- freeze or removal committing mid-wait binds below.
  perform pg_advisory_xact_lock(hashtext('taint:' || p_circle_id::text));

  if not exists (select 1 from public.circle_members m
                 where m.circle_id = p_circle_id and m.account_id = v_actor
                   and m.removed_at is null and m.tier = 'coordinator') then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.freezes f
             where f.circle_id = p_circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- exactly one of address / domain, mirroring the table's check
  if (v_address is null) = (v_domain is null) then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  begin
    insert into public.known_senders (circle_id, address, domain, accepted_by)
    values (p_circle_id, v_address, v_domain, v_actor)
    returning id into v_sender;
  exception when unique_violation then
    -- already accepted live: one shape
    raise exception 'sender_refused' using errcode = 'P0001';
  end;

  perform hc.log(p_circle_id, 'sender_accepted', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_detail => jsonb_build_object(
                   'sender_id', v_sender,
                   'address', v_address, 'domain', v_domain));

  -- RELEASE, same transaction, under the already-held lock (advance
  -- re-acquires it re-entrantly): per held arrival a real gate lease +
  -- the CAS.
  for r in
    select a.id from public.arrivals a
    where a.circle_id = p_circle_id
      and a.state = 'held_unknown_sender'
      and a.deleted_at is null
      and a.sender_address is not null
      and (   (v_address is not null
               and lower(a.sender_address::text) = lower(v_address))
           or (v_domain is not null
               and lower(split_part(a.sender_address::text, '@', 2)) = lower(v_domain)))
    for update
  loop
    select coalesce(max(l.attempt_no), 0) + 1 into v_attempt
      from public.pipeline_leases l where l.arrival_id = r.id;
    insert into public.pipeline_leases
      (arrival_id, circle_id, stage, attempt_no, deadline)
    values (r.id, p_circle_id, 'gate', v_attempt, now() + interval '60 seconds')
    returning id into v_lease;
    update public.arrivals set current_lease_id = v_lease where id = r.id;

    if hc.advance_arrival(r.id, 'held_unknown_sender', 'extracting',
                          v_lease, 'sender_recognised') = 'advanced' then
      v_released := v_released + 1;
      insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
      values (p_circle_id, r.id, 'sender_accepted_requeue');
    end if;
  end loop;

  return jsonb_build_object('sender_id', v_sender,
                            'released_count', v_released);
end $$;

-- ----------------------------------------------------------------------------
-- F2 · hc.set_grant — body as M7 with the A4 order: discovery binds ONLY
-- the lock key; the target re-reads and the actor re-authorizes UNDER the
-- lock, so a removal committing mid-wait defeats the raise before the
-- step-up token is consumed.
-- ----------------------------------------------------------------------------
create or replace function hc.set_grant(
  p_member_id uuid, p_subject_id uuid, p_domain hc.domain,
  p_level hc.access_level, p_step_up_token text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_circle uuid;
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

  -- Discovery for the lock key only (a member row never changes circles —
  -- the advance_arrival precedent). Liveness and authority bind below.
  select m.circle_id into v_circle from public.circle_members m
    where m.id = p_member_id;
  if v_circle is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  -- Re-read under the lock: the target member, live, with an ACCOUNT (the
  -- subject's own member row is not a grant surface — PRD §7.5 represents
  -- the subject as holder of the highest access; a coordinator does not
  -- edit that standing).
  select m.* into v_target from public.circle_members m
    where m.id = p_member_id and m.removed_at is null and m.account_id is not null;
  if v_target.id is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- The actor must be a live coordinator of the TARGET's circle — under
  -- the lock, so a removal committing mid-wait defeats this call.
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

-- ----------------------------------------------------------------------------
-- F2 · hc.remove_member — body as M7 with the same A4 order: discovery for
-- the key, target and actor re-validated under the lock (§4.6.3 immediate:
-- a coordinator removed mid-wait removes nobody).
-- ----------------------------------------------------------------------------
create or replace function hc.remove_member(
  p_member_id uuid, p_keep_share_ids uuid[] default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_circle uuid;
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

  select m.circle_id into v_circle from public.circle_members m
    where m.id = p_member_id;
  if v_circle is null then
    raise exception 'remove_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  -- Live, account-holding target, re-read under the lock: the
  -- subject-member row is standing, not membership, and is never
  -- removable here.
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

  -- §12.7: a circle is never orphaned — the last live coordinator
  -- transfers first (under the lock so two removals serialize).
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

-- ----------------------------------------------------------------------------
-- F3 · security_actions — the owed-kill queue. Zero request-path
-- privileges; hc_internal enqueues from execute_wasnt_me; the app / the
-- privileged worker drain through the two definers below as hc_pipeline.
-- ----------------------------------------------------------------------------
create table public.security_actions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null unique references public.security_events(id),
  account_id   uuid not null references public.accounts(id),
  action       text not null check (action in ('global_signout_force_reset')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index security_actions_pending on public.security_actions (created_at)
  where completed_at is null;

alter table public.security_actions enable row level security;
alter table public.security_actions force  row level security;
revoke all on public.security_actions from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert, update on public.security_actions to hc_internal;
create policy security_actions_internal on public.security_actions
  for select to hc_internal using (true);
create policy security_actions_internal_enqueue on public.security_actions
  for insert to hc_internal with check (true);
create policy security_actions_internal_complete on public.security_actions
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- F3 · hc.execute_wasnt_me — body as M5 with ONE addition: the consuming
-- transaction enqueues the owed action and returns its id, so the app can
-- kill sessions immediately and mark completion, and a crash leaves a
-- pending row the worker retries — never a consumed token with live
-- sessions.
-- ----------------------------------------------------------------------------
create or replace function hc.execute_wasnt_me(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_event   uuid;
  v_action  uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'wasnt_me_refused' using errcode = 'P0001';
  end if;

  update public.security_events e
     set token_consumed_at = now()
   where e.token_hash = extensions.digest(p_token, 'sha256')
     and e.token_expires_at > now()
     and e.token_consumed_at is null
  returning e.account_id, e.id into v_account, v_event;

  if v_account is null then
    -- unknown, expired, replayed: one shape, no oracle
    raise exception 'wasnt_me_refused' using errcode = 'P0001';
  end if;

  insert into public.security_actions (event_id, account_id, action)
  values (v_event, v_account, 'global_signout_force_reset')
  returning id into v_action;

  return jsonb_build_object('account_id', v_account, 'action_id', v_action);
end $$;

-- ownership and grants are unchanged from M5 (anon + authenticated: the
-- clicker may hold no session at all); restated for the replaced object.
alter function hc.execute_wasnt_me(text) owner to hc_internal;
revoke execute on function hc.execute_wasnt_me(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.execute_wasnt_me(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- F3 · The worker surface: list and complete, hc_pipeline only.
-- ----------------------------------------------------------------------------
create function hc.pending_security_actions()
returns setof public.security_actions
language sql stable security definer set search_path = ''
as $$
  select a.* from public.security_actions a
  where a.completed_at is null
  order by a.created_at;
$$;

alter function hc.pending_security_actions() owner to hc_internal;
revoke execute on function hc.pending_security_actions()
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.pending_security_actions() to hc_pipeline;

create function hc.complete_security_action(p_action_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_done timestamptz;
begin
  update public.security_actions a
     set completed_at = now()
   where a.id = p_action_id
     and a.completed_at is null;
  if found then
    return jsonb_build_object('completed', true);
  end if;

  select a.completed_at into v_done
  from public.security_actions a where a.id = p_action_id;
  if v_done is null then
    -- no such action: a defect signal, never a silent no-op
    raise exception 'security_action_refused' using errcode = 'P0001';
  end if;

  -- already completed: the retrying worker is safe
  return jsonb_build_object('completed', false);
end $$;

alter function hc.complete_security_action(uuid) owner to hc_internal;
revoke execute on function hc.complete_security_action(uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.complete_security_action(uuid) to hc_pipeline;
