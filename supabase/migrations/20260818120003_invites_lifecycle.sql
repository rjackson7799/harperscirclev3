-- ============================================================================
-- 2A · M3 — the invites lifecycle (TSD §5.10, §2.3; PRD §4.1.4–§4.1.5,
-- §7.4; AC-AUTH-4, AC-AUTH-8's DB anchor, AC-PERM-4/RLS-09, FRZ-16).
--
-- Four pieces:
--   1. accounts.email_verified_at — the AC-AUTH-4 ground truth, mirrored
--      from auth.users.email_confirmed_at by postgres-owned triggers. The
--      auth schema is superuser-owned on this image and migrations cannot
--      grant on it (the recorded 1A trap behind hc.uid()), so hc_internal
--      cannot read email_confirmed_at directly; postgres can. The mirror
--      column is writable by NOTHING request-path and not by hc_internal —
--      only the two triggers below.
--   2. hc.tier_defaults(tier) — PRD §7.4 as ONE relation. AC-AUTH-8's app
--      module (lib/permissions/tiers.ts, 2B) snapshot-tests against this,
--      so the ceiling copy and the grants it describes cannot diverge.
--      "Hidden" is the ABSENCE of a row (grant vectors treat no-row as
--      hidden); family's finances therefore does not appear.
--   3. hc.create_invite / hc.revoke_invite — coordinator-only issuance
--      with AC-AUTH-4 enforced in-function; sha256-only tokens (§2.3);
--      7-day expiry; ONE refusal shape (invite_refused) with the named
--      freeze_active exception (FRZ-16 — TSD §2.3 "suspends"; PRD §7.5
--      says "voided"; divergence flagged for round-9).
--   4. hc.accept_invite — §5.10's ONE-transaction conditional UPDATE: a
--      replayed token updates zero rows and the transaction aborts,
--      creating nothing (AC-PERM-4/RLS-09). Bound to the invited address
--      (compared with explicit lower(): citext operators fall back to
--      case-sensitive under search_path='' — the recorded trap). The
--      membership and the §7.4 tier grants land in the SAME transaction,
--      under the per-circle advisory lock (R-rule/annex A4: membership
--      and grants are security state; a freeze committing mid-wait
--      defeats the acceptance). A REMOVED member reactivates their
--      ORIGINAL row — the unconditional unique(circle_id, account_id) is
--      a design fact, and reactivation preserves attribution continuity
--      (N2: the same actor id keeps naming the same person).
-- ============================================================================

alter table public.accounts add column email_verified_at timestamptz;

-- ----------------------------------------------------------------------------
-- The mirror triggers. Both functions are postgres-owned SECURITY DEFINER
-- (postgres reads auth and, locally superuser / hosted BYPASSRLS, writes
-- through FORCE RLS); EXECUTE revoked from everything — trigger firing
-- does not consult EXECUTE, so the functions are reachable by nothing
-- else. In public, not hc: DEF-01 pins every hc function hc_internal-owned.
-- ----------------------------------------------------------------------------
create function public.hc_mirror_email_verified_on_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.email_verified_at := (select u.email_confirmed_at
                            from auth.users u where u.id = new.id);
  return new;
end $$;
revoke execute on function public.hc_mirror_email_verified_on_account()
  from public, anon, authenticated, hc_pipeline, hc_admin;

create trigger accounts_mirror_email_verified
  before insert on public.accounts
  for each row execute function public.hc_mirror_email_verified_on_account();

create function public.hc_mirror_email_verified_on_confirm()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.accounts
     set email_verified_at = new.email_confirmed_at
   where id = new.id;
  return null;
end $$;
revoke execute on function public.hc_mirror_email_verified_on_confirm()
  from public, anon, authenticated, hc_pipeline, hc_admin;

create trigger users_mirror_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.hc_mirror_email_verified_on_confirm();

-- ----------------------------------------------------------------------------
-- hc.tier_defaults — PRD §7.4, one relation, the AC-AUTH-8 anchor.
-- ----------------------------------------------------------------------------
create function hc.tier_defaults(p_tier hc.tier)
returns table (domain hc.domain, level hc.access_level)
language sql immutable parallel safe
as $$
  select d.domain, d.level
  from (values
    ('coordinator'::hc.tier, 'memories'::hc.domain,  'manage'::hc.access_level),
    ('coordinator'::hc.tier, 'health'::hc.domain,    'manage'::hc.access_level),
    ('coordinator'::hc.tier, 'schedule'::hc.domain,  'manage'::hc.access_level),
    ('coordinator'::hc.tier, 'documents'::hc.domain, 'manage'::hc.access_level),
    ('coordinator'::hc.tier, 'finances'::hc.domain,  'manage'::hc.access_level),
    ('family'::hc.tier,      'health'::hc.domain,    'summary'::hc.access_level),
    ('family'::hc.tier,      'schedule'::hc.domain,  'summary'::hc.access_level),
    ('family'::hc.tier,      'memories'::hc.domain,  'summary'::hc.access_level),
    ('family'::hc.tier,      'documents'::hc.domain, 'log'::hc.access_level),
    ('care_circle'::hc.tier, 'schedule'::hc.domain,  'summary'::hc.access_level)
  ) d(tier, domain, level)
  where d.tier = p_tier;
$$;
alter function hc.tier_defaults(hc.tier) owner to hc_internal;
revoke execute on function hc.tier_defaults(hc.tier)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.tier_defaults(hc.tier) to authenticated;

-- ----------------------------------------------------------------------------
-- The invite writes, granted with the functions that perform them. invites
-- carried ZERO privileges through 1A–1D by design; the lifecycle is the
-- first and only reach. circle_members gains hc_internal UPDATE solely for
-- reactivation.
-- ----------------------------------------------------------------------------
grant select, insert, update on public.invites to hc_internal;
create policy invites_internal on public.invites
  for select to hc_internal using (true);
create policy invites_internal_issue on public.invites
  for insert to hc_internal with check (true);
create policy invites_internal_decide on public.invites
  for update to hc_internal using (true) with check (true);

grant update on public.circle_members to hc_internal;
create policy circle_members_internal_reactivate on public.circle_members
  for update to hc_internal using (true) with check (true);

insert into hc.log_event_types (code, description) values
  ('invite_issued',   'An invite was issued to a named address at a named tier'),
  ('invite_accepted', 'An invite was accepted; membership and tier grants written'),
  ('invite_revoked',  'A pending invite was revoked by a coordinator');

-- ----------------------------------------------------------------------------
-- hc.create_invite — coordinator-only; AC-AUTH-4 in-function; FRZ-16.
-- ----------------------------------------------------------------------------
create function hc.create_invite(
  p_circle_id uuid, p_invited_email text, p_tier hc.tier,
  p_subject_ids uuid[], p_note text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor    uuid := hc.uid();
  v_actor_name text;
  v_verified timestamptz;
  v_member   uuid;
  v_subjects uuid[];
  v_email    text := btrim(coalesce(p_invited_email, ''));
  v_token    text;
  v_invite   uuid;
  v_expires  timestamptz := now() + interval '7 days';
begin
  if v_actor is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;
  select a.display_name, a.email_verified_at into v_actor_name, v_verified
    from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- Live coordinator of THIS circle — checked before anything else so a
  -- stranger probing circle ids learns nothing, not even freeze state.
  select m.id into v_member from public.circle_members m
    where m.circle_id = p_circle_id and m.account_id = v_actor
      and m.removed_at is null and m.tier = 'coordinator';
  if v_member is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- AC-AUTH-4: no invite from an unverified account. An outbound invite in
  -- this person's name is an impersonation surface until the mailbox is
  -- proven (PRD §4.1.2). Same shape — the form knows its own state.
  if v_verified is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- FRZ-16: a freeze suspends invites at circle level — open, or
  -- unresolved however narrowed (PRD §7.5: "no invites" in unresolved).
  if exists (select 1 from public.freezes f
             where f.circle_id = p_circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- Coordinator is granted, never invited (PRD §7.4).
  if p_tier not in ('family', 'care_circle') then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  if v_email = '' or position('@' in v_email) = 0 or length(v_email) > 320
     or length(coalesce(p_note, '')) > 500 then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- Subjects: non-empty, deduplicated, every one live in THIS circle.
  select array_agg(distinct x) into v_subjects
    from unnest(coalesce(p_subject_ids, '{}'::uuid[])) x;
  if v_subjects is null
     or (select count(*) from public.subjects s
         where s.circle_id = p_circle_id and s.id = any (v_subjects))
        <> cardinality(v_subjects) then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invites
    (circle_id, token_hash, invited_email, tier, subject_ids, note,
     invited_by, expires_at)
  values
    (p_circle_id, extensions.digest(v_token, 'sha256'), v_email, p_tier,
     v_subjects, p_note, v_actor, v_expires)
  returning id into v_invite;

  perform hc.log(p_circle_id, 'invite_issued', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_detail => jsonb_build_object(
                   'invite_id', v_invite, 'invited_email', v_email,
                   'tier', p_tier, 'subject_count', cardinality(v_subjects)));

  return jsonb_build_object('invite_id', v_invite, 'token', v_token,
                            'expires_at', v_expires);
end $$;

alter function hc.create_invite(uuid, text, hc.tier, uuid[], text) owner to hc_internal;
revoke execute on function hc.create_invite(uuid, text, hc.tier, uuid[], text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.create_invite(uuid, text, hc.tier, uuid[], text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- hc.revoke_invite — coordinator-only, pending-only. Revocation REDUCES
-- reach, so a freeze does not block it.
-- ----------------------------------------------------------------------------
create function hc.revoke_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_circle uuid;
  v_email text;
begin
  if v_actor is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name
    from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  update public.invites i
     set revoked_at = now()
   where i.id = p_invite_id
     and i.accepted_at is null
     and i.revoked_at is null
     and exists (select 1 from public.circle_members m
                 where m.circle_id = i.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null
                   and m.tier = 'coordinator')
  returning i.circle_id, i.invited_email::text into v_circle, v_email;

  if v_circle is null then
    -- nonexistent, foreign, non-coordinator, already accepted, already
    -- revoked: one shape (DEF-10)
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  perform hc.log(v_circle, 'invite_revoked', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_detail => jsonb_build_object('invite_id', p_invite_id,
                                                'invited_email', v_email));

  return jsonb_build_object('invite_id', p_invite_id);
end $$;

alter function hc.revoke_invite(uuid) owner to hc_internal;
revoke execute on function hc.revoke_invite(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.revoke_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.accept_invite — §5.10 verbatim: ONE transaction, conditional UPDATE,
-- replay aborts creating nothing. Membership + §7.4 grants under the
-- R-rule lock.
-- ----------------------------------------------------------------------------
create function hc.accept_invite(p_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_email text;
  v_inv   record;
  v_mem   record;
  v_member uuid;
begin
  if v_actor is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name
    from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- The session's address, from the SIGNED claims — never a parameter.
  v_email := lower(btrim(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    '')));
  if v_email = '' or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- Discovery only; every state predicate belongs to the conditional
  -- UPDATE below, and the freeze binds under the lock.
  select i.* into v_inv from public.invites i
    where i.token_hash = extensions.digest(p_token, 'sha256');
  if v_inv.id is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- R-rule (annex A4): membership and grants are security state.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_inv.circle_id::text));

  -- FRZ-16: suspended under any freeze, named signature (a valid-token
  -- holder was invited by this circle; the fact of the freeze is what the
  -- product tells every member anyway).
  if exists (select 1 from public.freezes f
             where f.circle_id = v_inv.circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- §5.10's single-use anchor: the conditional UPDATE. A replayed,
  -- revoked or expired token updates ZERO rows and everything aborts.
  update public.invites i
     set accepted_at = now(), accepted_by = v_actor
   where i.id = v_inv.id
     and i.accepted_at is null
     and i.revoked_at is null
     and i.expires_at > now();
  if not found then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- Address binding AFTER the claim: a mismatch aborts the transaction,
  -- rolling the claim back — the invited person can still accept
  -- (AC-AUTH-11's DB half; explicit lower(), the citext trap).
  if lower(v_inv.invited_email::text) <> v_email then
    raise exception 'invite_refused' using errcode = 'P0001';
  end if;

  -- Membership: live refuses; removed REACTIVATES the original row
  -- (attribution continuity under the unconditional unique); absent
  -- inserts.
  select m.id, m.removed_at into v_mem from public.circle_members m
    where m.circle_id = v_inv.circle_id and m.account_id = v_actor;
  if v_mem.id is not null and v_mem.removed_at is null then
    raise exception 'invite_refused' using errcode = 'P0001';
  elsif v_mem.id is not null then
    update public.circle_members
       set removed_at = null, removed_by = null,
           tier = v_inv.tier, display_name_at_join = v_actor_name
     where id = v_mem.id;
    v_member := v_mem.id;
  else
    insert into public.circle_members
      (circle_id, account_id, tier, display_name_at_join)
    values (v_inv.circle_id, v_actor, v_inv.tier, v_actor_name)
    returning id into v_member;
  end if;

  -- The §7.4 defaults, per covered subject, in the SAME transaction.
  -- granted_by is the INVITER: the coordinator who defined this ceiling.
  begin
    insert into public.access_grants
      (circle_id, member_id, subject_id, domain, level, granted_by)
    select v_inv.circle_id, v_member, s, t.domain, t.level, v_inv.invited_by
    from unnest(v_inv.subject_ids) s
    cross join hc.tier_defaults(v_inv.tier) t;
  exception when unique_violation or foreign_key_violation then
    -- stale grants on an improperly-removed row, or a subject deleted
    -- since issuance: refuse whole, write nothing
    raise exception 'invite_refused' using errcode = 'P0001';
  end;

  perform hc.log(v_inv.circle_id, 'invite_accepted', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_target_member_id => v_member,
                 p_detail => jsonb_build_object('invite_id', v_inv.id,
                                                'tier', v_inv.tier));
  perform hc.log(v_inv.circle_id, 'member_joined', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_target_member_id => v_member);

  return jsonb_build_object(
    'circle_id', v_inv.circle_id, 'member_id', v_member,
    'tier', v_inv.tier, 'subject_ids', to_jsonb(v_inv.subject_ids));
end $$;

alter function hc.accept_invite(text) owner to hc_internal;
revoke execute on function hc.accept_invite(text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.accept_invite(text) to authenticated;
