-- ============================================================================
-- 4A · M1 — the ADR-0015 R8 batched bound amendment (the five queued items,
-- slice 4's HARD entry criterion — before any slice-4-proper work).
--
-- Authority: ADR-0015 R8 (the batch), R1 (item 1's scope ruling), R2 + the
-- slice-4 plan-gate Q2 (item 3's owner-named table), R3 (items 2 and 4),
-- round-10 F9 (item 5); docs/ops/runtime-db-credentials.md is item 2+4's
-- threat-model contract; docs/ops/security-actions-worker.md is item 5's
-- consumer. pgTAP 043 pinned every item red-first; the 002 definer/grant
-- inventories, the INV-14 snapshot and the DEF rows re-pin in this commit.
--
--   1 · APP-09b's access-log half: 'signed_out' + hc.log_sign_out() —
--       zero parameters (actor = hc.uid(), nothing spoofable), one
--       CIRCLE-LEVEL entry per live membership. The app call is 4B.
--   2 · The four maintenance-definer conversions: create_account,
--       describe_invite, set_slice, set_opening_context — the four ops
--       lib/db/maintenance.ts carried on the maintenance credential move
--       onto request-role authority. The two auth.* ops (unconfirmEmail,
--       revokeAuthSessions) STAY on the maintenance identity: auth is
--       ungrantable from migrations on this image (the recorded trap).
--   3 · circle_members.relationship (text, ≤ 120, nullable for
--       pre-existing rows) — the step-1 answer, written by
--       hc.create_circle on the founder's own membership row (F1's one
--       promised line). The signature gains p_relationship; the old
--       overload is DROPPED, never left beside it (the overload
--       inventory is an invariant — the 2A M8 precedent).
--   4 · hc_runtime — NOLOGIN, member of anon + authenticated (the
--       SET ROLE channel) and NOTHING else. Hosted: HC_DB_URL flips to a
--       dedicated LOGIN credential IN ROLE hc_runtime at deploy (the
--       runbook row); local: seed.sql provisions the login credential —
--       credentials never ride migrations.
--   5 · hc.claim_security_actions(p_limit) — the worker claim/lease
--       primitive: oldest-first, FOR UPDATE SKIP LOCKED, 5-minute claim
--       lease, so concurrent sweeps are disjoint by construction rather
--       than safe-by-idempotence alone. hc.complete_security_action and
--       hc.pending_security_actions are UNCHANGED.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · The sign-out access-log half (TSD §5.5 "plus an access_log entry").
-- ----------------------------------------------------------------------------
insert into hc.log_event_types (code, description) values
  ('signed_out', 'The member signed out of every session (TSD §5.5) — recorded once per live membership, circle-level');

create function hc.log_sign_out()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid := hc.uid();
  v_display text;
  v_n int := 0;
  r record;
begin
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select a.display_name into v_display
  from public.accounts a where a.id = v_account and a.deleted_at is null;
  if v_display is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- One circle-level entry (subject-less, domain-less: visible to every
  -- live member under the 1D read policy) per LIVE membership. Zero
  -- memberships is a quiet zero — sign-out is never refused for having
  -- nowhere to record it. Deterministic circle order: hc.log takes the
  -- per-circle chain lock, and one acquisition order per call keeps
  -- sign-out/writer lock graphs acyclic (the sweeper precedent).
  for r in
    select m.circle_id from public.circle_members m
    where m.account_id = v_account and m.removed_at is null
    order by m.circle_id
  loop
    perform hc.log(r.circle_id, 'signed_out', v_display, v_account);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('logged', v_n);
end $$;

alter function hc.log_sign_out() owner to hc_internal;
revoke execute on function hc.log_sign_out()
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.log_sign_out() to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · The four maintenance-definer conversions (R3). Each write privilege
-- lands WITH the one function that performs it (creation, ownership,
-- revoke and grants atomic within one migration — the definer-invariant
-- discipline; FORCE RLS pairs every grant with its named policy).
-- ----------------------------------------------------------------------------

-- 2a · hc.create_account — the accounts-row bootstrap (TSD §2.3). The
-- caller's OWN row, kind 'member', keyed hc.uid(): no target parameter
-- exists, so there is nothing to aim elsewhere. Idempotent: a replayed
-- bootstrap changes nothing and says so. The 2A insert mirror (postgres-
-- owned BEFORE INSERT trigger) fills email/email_verified_at from
-- auth.users regardless of the inserting role.
grant insert on public.accounts to hc_internal;
create policy accounts_internal_bootstrap on public.accounts
  for insert to hc_internal with check (true);

create function hc.create_account(p_display_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid := hc.uid();
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'account_invalid' using errcode = 'P0001';
  end if;

  insert into public.accounts (id, kind, display_name)
  values (v_account, 'member', v_name)
  on conflict (id) do nothing;

  return jsonb_build_object('account_id', v_account, 'created', found);
end $$;

alter function hc.create_account(text) owner to hc_internal;
revoke execute on function hc.create_account(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.create_account(text) to authenticated;

-- 2b · hc.describe_invite — the pre-auth accept screen's read (PRD §4.1.4
-- item 2: the screen shows which circle, who invited them, which subjects
-- and the ceiling BEFORE asking for anything — necessarily before any
-- session exists, hence anon). Keyed STRICTLY on the sha256 of the token
-- the mail recipient already holds; discloses only what their invite
-- email already said. DEF-10 one shape: malformed and unknown both
-- answer null — no oracle. (Reads ride the existing hc_internal SELECT
-- policies on invites/circles/accounts/subjects.)
create function hc.describe_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select jsonb_build_object(
    'state', case when i.accepted_at is not null then 'used'
                  when i.revoked_at  is not null then 'revoked'
                  when i.expires_at <= now()     then 'expired'
                  else 'pending' end,
    'invite_id', i.id,
    'circle_id', i.circle_id,
    'circle_name', c.name,
    'inviter_name', a.display_name,
    'invited_email', i.invited_email::text,
    'tier', i.tier,
    'subject_names', coalesce(
      (select jsonb_agg(s.first_name order by s.first_name)
       from public.subjects s where s.id = any (i.subject_ids)),
      '[]'::jsonb))
  into v
  from public.invites i
  join public.circles c on c.id = i.circle_id
  join public.accounts a on a.id = i.invited_by
  where i.token_hash = extensions.digest(p_token, 'sha256');

  return v;   -- null when unknown: byte-identical with malformed
end $$;

alter function hc.describe_invite(text) owner to hc_internal;
revoke execute on function hc.describe_invite(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.describe_invite(text) to anon, authenticated;

-- 2c · hc.set_slice — the declared slice (PRD §4.1.3 step 1). Own live
-- row only; zero rows is an invariant violation and refuses LOUDLY
-- (round-10 F7: a ghost target must be distinguishable from persistence).
grant update on public.accounts to hc_internal;
create policy accounts_internal_set_slice on public.accounts
  for update to hc_internal using (true) with check (true);

create function hc.set_slice(p_slice text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid := hc.uid();
  v_slice text := nullif(btrim(coalesce(p_slice, '')), '');
begin
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_slice is null or char_length(v_slice) > 200 then
    raise exception 'slice_invalid' using errcode = 'P0001';
  end if;

  update public.accounts
     set slice = v_slice
   where id = v_account and deleted_at is null;
  if not found then
    raise exception 'slice_refused' using errcode = 'P0001';
  end if;

  return jsonb_build_object('updated', true);
end $$;

alter function hc.set_slice(text) owner to hc_internal;
revoke execute on function hc.set_slice(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.set_slice(text) to authenticated;

-- 2d · hc.set_opening_context — step 3's write (PRD §4.1.3). The
-- ADR-0015 F7 zero-row postcondition is now IN-FUNCTION: only the
-- founder's own circle, only while still in setup — forged, stale,
-- foreign and missing ids all land in ONE loud refusal shape.
grant update on public.circles to hc_internal;
create policy circles_internal_set_opening_context on public.circles
  for update to hc_internal using (true) with check (true);

create function hc.set_opening_context(p_circle uuid, p_context text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid := hc.uid();
begin
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_circle is null or p_context is null
     or cardinality(p_context) > 20
     or exists (select 1 from unnest(p_context) x
                where coalesce(btrim(x), '') = '' or char_length(x) > 120) then
    raise exception 'opening_context_refused' using errcode = 'P0001';
  end if;

  update public.circles
     set opening_context = p_context
   where id = p_circle and created_by = v_account and state = 'setup';
  if not found then
    raise exception 'opening_context_refused' using errcode = 'P0001';
  end if;

  return jsonb_build_object('updated', true);
end $$;

alter function hc.set_opening_context(uuid, text[]) owner to hc_internal;
revoke execute on function hc.set_opening_context(uuid, text[])
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.set_opening_context(uuid, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 3 · The step-1 relationship column (R2; plan-gate Q2: circle_members,
-- the founder's membership row, written in create_circle's transaction).
-- Nullable: pre-existing rows never answered the question.
-- ----------------------------------------------------------------------------
alter table public.circle_members
  add column relationship text
  constraint circle_members_relationship_bounded
  check (char_length(relationship) <= 120);

-- The signature gains p_relationship. A signature change is never a
-- replace-beside: the old overload is dropped first (the exact-inventory
-- invariant, 002 test 2). Body otherwise identical to the round-5 form.
drop function hc.create_circle(text, jsonb, text[]);

create function hc.create_circle(
  p_name            text,
  p_subjects        jsonb,
  p_opening_context text[] default '{}',
  p_relationship    text   default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_display text;
  v_rel     text := nullif(btrim(coalesce(p_relationship, '')), '');
  v_circle  uuid;
  v_founder uuid;
  v_member  uuid;
  v_ids     uuid[] := '{}'::uuid[];
  v_n       int;
  s         jsonb;
  d         hc.domain;
begin
  v_account := hc.uid();
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select a.display_name into v_display
  from public.accounts a where a.id = v_account;
  if v_display is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- The step-1 answer is validated BEFORE anything is written (the same
  -- bound as the column CHECK, refused in the normalised shape).
  if v_rel is not null and char_length(v_rel) > 120 then
    raise exception 'invalid_relationship' using errcode = 'P0001';
  end if;

  -- The two-subject cap (PRD §2): not expressible as a table CHECK, so it
  -- is enforced here, in the one function that creates subjects in 1A,
  -- under the same per-circle advisory lock discipline later subject
  -- additions must take (§2.3 note).
  if p_subjects is null
     or jsonb_typeof(p_subjects) <> 'array'
     or jsonb_array_length(p_subjects) not between 1 and 2 then
    raise exception 'invalid_subjects' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_subjects);

  insert into public.circles (name, opening_context, created_by)
  values (p_name, p_opening_context, v_account)
  returning id into v_circle;

  perform pg_advisory_xact_lock(hashtext('circle:' || v_circle::text));

  -- Preallocate the subject identities the declarations will bind to
  -- (round-5 F1: a durable id, not a free-text name).
  for i in 1..v_n loop
    v_ids := v_ids || gen_random_uuid();
  end loop;

  -- FIRST: the custodianship declarations, seq 1 (and 2), before subjects,
  -- before the founder's membership, before grants (AC-AUTH-6) — each
  -- bound to its preallocated subject id under the deferred FK.
  for i in 1..v_n loop
    s := p_subjects -> (i - 1);
    perform hc.log(v_circle, 'custodianship_declared', v_display, v_account,
                   p_subject_id => v_ids[i],
                   p_detail => jsonb_build_object(
                     'subject_name', s ->> 'first_name',
                     'custodian', v_display,
                     'declared_on', to_char(now(), 'YYYY-MM-DD')));
  end loop;

  -- The founder's membership row carries the step-1 relationship — the
  -- one line ADR-0015 F1 promised, durable in the same transaction that
  -- creates the circle (R2/Q2).
  insert into public.circle_members
    (circle_id, account_id, tier, display_name_at_join, relationship)
  values (v_circle, v_account, 'coordinator', v_display, v_rel)
  returning id into v_founder;

  perform hc.log(v_circle, 'member_joined', v_display, v_account);

  for i in 1..v_n loop
    s := p_subjects -> (i - 1);
    insert into public.subjects
      (id, circle_id, first_name, situation, postal_code, timezone,
       accent_color, forwarding_local_part)
    values
      (v_ids[i], v_circle, s ->> 'first_name', s ->> 'situation',
       s ->> 'postal_code', s ->> 'timezone', s ->> 'accent_color',
       s ->> 'forwarding_local_part');

    insert into public.circle_members
      (circle_id, subject_id, custodian_member_id, tier, display_name_at_join)
    values
      (v_circle, v_ids[i], v_founder, 'coordinator', s ->> 'first_name')
    returning id into v_member;

    foreach d in array hc.all_domains() loop
      insert into public.access_grants
        (circle_id, member_id, subject_id, domain, level, granted_by)
      values
        (v_circle, v_founder, v_ids[i], d, 'manage', v_account),
        (v_circle, v_member,  v_ids[i], d, 'manage', v_account);
    end loop;
  end loop;

  return jsonb_build_object(
    'circle_id', v_circle,
    'founder_member_id', v_founder,
    'subject_ids', to_jsonb(v_ids));
end $$;

alter function hc.create_circle(text, jsonb, text[], text) owner to hc_internal;
revoke execute on function hc.create_circle(text, jsonb, text[], text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.create_circle(text, jsonb, text[], text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4 · The dedicated lower-privilege runtime role (R3). NOLOGIN, member of
-- anon + authenticated — the SET ROLE channel — and NOTHING else. After
-- the HC_DB_URL flip (hosted: a dedicated LOGIN credential IN ROLE
-- hc_runtime, provisioned at deploy per docs/ops/runtime-db-credentials.md;
-- local: seed.sql), the request path's blast radius is the enumerated
-- surface, and the maintenance credential remains only behind the two-op
-- module. Roles are cluster-wide and survive resets, so creation is
-- guarded and the grants are idempotent; postgres membership exists so
-- the test suites can SET ROLE into it (the 001 precedent).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'hc_runtime') then
    create role hc_runtime nologin;
  end if;
end
$$;

grant anon          to hc_runtime;
grant authenticated to hc_runtime;
grant hc_runtime    to postgres;

-- ----------------------------------------------------------------------------
-- 5 · The worker claim/lease primitive (round-10 F9's DB half). Claims
-- the OLDEST unclaimed pending rows — the longest-owed kill is the most
-- urgent — under FOR UPDATE SKIP LOCKED, so two concurrent sweeps are
-- disjoint by construction; the 5-minute claim lease makes a crashed
-- worker's rows reclaimable (a delay, never a loss). The sweep route
-- adopts it in 4B; until then the drain stays safe-by-idempotence as the
-- worker doc argues. UPDATE rides the existing hc_internal policy.
-- ----------------------------------------------------------------------------
alter table public.security_actions add column claimed_until timestamptz;

create function hc.claim_security_actions(p_limit integer)
returns setof public.security_actions
language plpgsql security definer set search_path = ''
as $$
begin
  -- The batch bound is the timeout control (the worker doc caps a sweep
  -- at 20); anything past 100 is a defect, not a bigger sweep.
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'security_action_refused' using errcode = 'P0001';
  end if;

  return query
  update public.security_actions a
     set claimed_until = now() + interval '5 minutes'
   where a.id in (
     select x.id from public.security_actions x
     where x.completed_at is null
       and (x.claimed_until is null or x.claimed_until <= now())
     order by x.created_at
     limit p_limit
     for update skip locked)
  returning a.*;
end $$;

alter function hc.claim_security_actions(integer) owner to hc_internal;
revoke execute on function hc.claim_security_actions(integer)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.claim_security_actions(integer) to hc_pipeline;
