-- ============================================================================
-- 2A · M3 — the invites lifecycle: hc.create_invite · hc.revoke_invite ·
-- hc.accept_invite + hc.tier_defaults (TSD §5.10, §2.3; PRD §4.1.4–§4.1.5,
-- §7.4; AC-AUTH-4, AC-AUTH-8 DB anchor, AC-PERM-4/RLS-09, FRZ-16 legs).
--
-- The contract these tests pin:
--   · accounts.email_verified_at — a mirror of auth.users.email_confirmed_at
--     maintained by postgres-owned triggers (the auth schema is ungrantable
--     from migrations on this image, so hc_internal cannot read it; the
--     mirror is writable by NOTHING request-path and not by hc_internal).
--   · hc.create_invite(circle, email, tier, subject_ids[, note]):
--     coordinator-only; AC-AUTH-4 IN-FUNCTION (unverified inviter refused);
--     tier family|care_circle only (coordinator is granted, never invited);
--     subjects validated live-in-circle; token 32 bytes returned once,
--     stored sha256-only; 7-day expiry; ONE refusal shape (invite_refused)
--     except the named freeze_active; logged invite_issued.
--   · hc.revoke_invite(id): coordinator-only, pending-only, logged.
--   · hc.accept_invite(token): §5.10's ONE-transaction conditional UPDATE —
--     a replayed token updates zero rows, ABORTS, creates NOTHING (RLS-09);
--     bound to the invited address (case-blind, compared with explicit
--     lower() — the citext/search_path trap); membership + §7.4 tier
--     default grants in the SAME transaction, under the per-circle
--     advisory lock (R-rule: membership and grants are security state);
--     a REMOVED member reactivates their original row (the unconditional
--     unique(circle_id, account_id) is a design fact — attribution
--     continuity); a LIVE member refuses; freeze refuses BOTH legs with
--     the named freeze_active (FRZ-16 — TSD "suspends"; PRD §7.5 says
--     "voided", divergence flagged for round 9).
--   · hc.tier_defaults(tier) — THE §7.4 table AC-AUTH-8's app module
--     snapshot-tests against: family = health/schedule/memories summary +
--     documents log (finances = NO ROW, hidden by absence); care_circle =
--     schedule summary ONLY.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(37);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid, p_email text, p_confirmed boolean)
returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_email, 'x',
          case when p_confirmed then now() end, now(), now(), '{}', '{}');
  return p_id;
end $$;

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

-- Run as an authenticated user carrying sub AND email claims (the accept
-- path binds on the JWT email; GoTrue signs both).
create function pg_temp.call_as(p_user uuid, p_email text, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

-- Create an invite as p_user and stash the returned token + invite id.
create function pg_temp.invite_as(
  p_user uuid, p_email text, p_circle uuid, p_invited text, p_tier text,
  p_subjects uuid[], p_slot text) returns void
language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  execute 'set local role authenticated';
  v := hc.create_invite(p_circle, p_invited, p_tier::hc.tier, p_subjects);
  execute 'reset role';
  perform set_config('t.' || p_slot,        v ->> 'token', true);
  perform set_config('t.' || p_slot || '_id', v ->> 'invite_id', true);
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures
--   c1: verified coordinator u1, family member u3, subjects s1 + s2
--   c2: UNVERIFIED coordinator u2, subject s3
--   c3: verified coordinator u4, subject s4 — frozen AFTER an invite exists
--   invitees: v1 (family door), v2 (wrong address), v3 (care door)
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid(), 'sarah@fixture.local', true);
  u2 uuid := pg_temp.mk_user(gen_random_uuid(), 'newbie@fixture.local', false);
  u3 uuid := pg_temp.mk_user(gen_random_uuid(), 'dan@fixture.local', true);
  u4 uuid := pg_temp.mk_user(gen_random_uuid(), 'frida@fixture.local', true);
  v1 uuid := pg_temp.mk_user(gen_random_uuid(), 'aunt.june@fixture.local', true);
  v2 uuid := pg_temp.mk_user(gen_random_uuid(), 'impostor@fixture.local', true);
  v3 uuid := pg_temp.mk_user(gen_random_uuid(), 'aide@fixture.local', true);
  c1 uuid; c2 uuid; c3 uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid;
  m1 uuid; m3 uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Newbie'), (u3, 'member', 'Dan'),
    (u4, 'member', 'Frida'), (v1, 'member', 'June'), (v2, 'member', 'Impostor'),
    (v3, 'member', 'Aide');

  insert into public.circles (name, created_by) values ('Invite circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Unverified circle', u2)
    returning id into c2;
  insert into public.circles (name, created_by) values ('Frozen circle', u4)
    returning id into c3;

  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values
    (c1, 'Nell',   'recovering', '02138', 'America/New_York', 'sage',
     'inv1-' || substr(c1::text, 1, 8)),
    (c1, 'Frank',  'at home',    '02138', 'America/New_York', 'clay',
     'inv2-' || substr(c1::text, 1, 8));
  select id into s1 from public.subjects where circle_id = c1 and first_name = 'Nell';
  select id into s2 from public.subjects where circle_id = c1 and first_name = 'Frank';
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'assisted living', '98101', 'America/Los_Angeles', 'clay',
          'inv3-' || substr(c2::text, 1, 8)) returning id into s3;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c3, 'Rosa', 'in memory care', '60601', 'America/Chicago', 'sage',
          'inv4-' || substr(c3::text, 1, 8)) returning id into s4;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Dan') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u2, 'coordinator', 'Newbie');
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c3, u4, 'coordinator', 'Frida');

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m1, s2, d::hc.domain, 'manage', u1),
           (c1, m3, s1, d::hc.domain, 'summary', u1);
  end loop;

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.u4', u4::text, true);
  perform set_config('t.v1', v1::text, true);
  perform set_config('t.v2', v2::text, true);
  perform set_config('t.v3', v3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.c3', c3::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s2', s2::text, true);
  perform set_config('t.s3', s3::text, true);
  perform set_config('t.s4', s4::text, true);
  perform set_config('t.m3', m3::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · The verified-email mirror (the AC-AUTH-4 ground truth)
-- ----------------------------------------------------------------------------
select has_column('public', 'accounts', 'email_verified_at',
  'accounts.email_verified_at exists — the in-reach mirror of an ungrantable schema');
select is(
  (select (a.email_verified_at is not null) from public.accounts a
   where a.id = current_setting('t.u1')::uuid),
  true, 'a confirmed auth user''s account row carries the mirror at insert');
select is(
  (select (a.email_verified_at is null) from public.accounts a
   where a.id = current_setting('t.u2')::uuid),
  true, 'an unconfirmed auth user''s account row mirrors NULL');

do $$
begin
  update auth.users set email_confirmed_at = now()
   where id = current_setting('t.u2')::uuid;
end $$;
select is(
  (select (a.email_verified_at is not null) from public.accounts a
   where a.id = current_setting('t.u2')::uuid),
  true, 'confirming the email later flows through to the mirror — verification is live, never cached');
do $$
begin
  -- restore the unverified fixture for the AC-AUTH-4 case below
  update auth.users set email_confirmed_at = null
   where id = current_setting('t.u2')::uuid;
  update public.accounts set email_verified_at = null
   where id = current_setting('t.u2')::uuid;
end $$;

-- ----------------------------------------------------------------------------
-- 5–8 · create_invite: the happy path and its row
-- ----------------------------------------------------------------------------
select pg_temp.invite_as(current_setting('t.u1')::uuid, 'sarah@fixture.local',
  current_setting('t.c1')::uuid, 'Aunt.June@Fixture.Local', 'family',
  array[current_setting('t.s1')::uuid], 'tok_fam');
select matches(current_setting('t.tok_fam'), '^[0-9a-f]{64}$',
  'create_invite returns 32 random bytes as hex, exactly once');

select is((
  select array[(i.token_hash = extensions.digest(current_setting('t.tok_fam'), 'sha256'))::text,
               lower(i.invited_email::text), i.tier::text,
               (i.subject_ids = array[current_setting('t.s1')::uuid])::text,
               (i.expires_at - i.created_at = interval '7 days')::text,
               (i.accepted_at is null and i.revoked_at is null)::text]
  from public.invites i
  where i.id = current_setting('t.tok_fam_id')::uuid),
  array['true', 'aunt.june@fixture.local', 'family', 'true', 'true', 'true'],
  'the invite row: sha256 only, address stored, tier, subjects, 7-day expiry, pending');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'invite_issued' $$,
  current_setting('t.c1'))), '1',
  'invite_issued is an access-log event (PRD §4.6.5)');

select pg_temp.invite_as(current_setting('t.u1')::uuid, 'sarah@fixture.local',
  current_setting('t.c1')::uuid, 'aide@fixture.local', 'care_circle',
  array[current_setting('t.s1')::uuid, current_setting('t.s2')::uuid], 'tok_care');
select matches(current_setting('t.tok_care'), '^[0-9a-f]{64}$',
  'a care-circle invite covering both subjects mints');

-- ----------------------------------------------------------------------------
-- 9–14 · create_invite refusals: ONE shape; freeze named
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u2')::uuid, 'newbie@fixture.local', format(
  $$ select hc.create_invite(%L, 'x@fixture.local', 'family', array[%L::uuid])::text $$,
  current_setting('t.c2'), current_setting('t.s3'))),
  'ERROR:P0001:invite_refused',
  'AC-AUTH-4: no invite can be issued from an unverified account — enforced in-function, not in the form');

select is(pg_temp.call_as(current_setting('t.u3')::uuid, 'dan@fixture.local', format(
  $$ select hc.create_invite(%L, 'x@fixture.local', 'family', array[%L::uuid])::text $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'ERROR:P0001:invite_refused',
  'a family-tier member cannot invite — only a Coordinator (PRD §4.1.5)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, 'sarah@fixture.local', format(
  $$ select hc.create_invite(%L, 'x@fixture.local', 'family', array[%L::uuid])::text $$,
  current_setting('t.c2'), current_setting('t.s3'))),
  'ERROR:P0001:invite_refused',
  'a coordinator of ANOTHER circle is a stranger here — same shape, no oracle');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, 'sarah@fixture.local', format(
  $$ select hc.create_invite(%L, 'x@fixture.local', 'coordinator', array[%L::uuid])::text $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'ERROR:P0001:invite_refused',
  'coordinator is granted, never invited (PRD §7.4) — the tier is not mintable');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, 'sarah@fixture.local', format(
  $$ select hc.create_invite(%L, 'x@fixture.local', 'family', array[%L::uuid])::text $$,
  current_setting('t.c1'), current_setting('t.s3'))),
  'ERROR:P0001:invite_refused',
  'a subject from another circle refuses — subjects are validated live-in-circle');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, 'sarah@fixture.local', format(
  $$ select hc.create_invite(%L, 'x@fixture.local', 'family', '{}'::uuid[])::text $$,
  current_setting('t.c1'))),
  'ERROR:P0001:invite_refused',
  'an invite covering no subject refuses — there is nothing it would grant');

-- ----------------------------------------------------------------------------
-- 15–16 · FRZ-16, create leg: freeze suspends invite creation
-- ----------------------------------------------------------------------------
select pg_temp.invite_as(current_setting('t.u4')::uuid, 'frida@fixture.local',
  current_setting('t.c3')::uuid, 'late.uncle@fixture.local', 'family',
  array[current_setting('t.s4')::uuid], 'tok_frozen');
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c3')::uuid);
end $$;
select is(pg_temp.call_as(current_setting('t.u4')::uuid, 'frida@fixture.local', format(
  $$ select hc.create_invite(%L, 'another@fixture.local', 'family', array[%L::uuid])::text $$,
  current_setting('t.c3'), current_setting('t.s4'))),
  'ERROR:P0001:freeze_active',
  'FRZ-16: an open freeze suspends invite creation, with the named signature');
select is(pg_temp.call_as(current_setting('t.v1')::uuid, 'late.uncle@fixture.local', format(
  $$ select hc.accept_invite(%L)::text $$, current_setting('t.tok_frozen'))),
  'ERROR:P0001:freeze_active',
  'FRZ-16: an outstanding invite is not acceptable under the freeze — suspended at circle level');
select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.circle_members
     where circle_id = %L and account_id = %L $$,
  current_setting('t.c3'), current_setting('t.v1'))), '0',
  'the refused acceptance created nothing');

-- ----------------------------------------------------------------------------
-- 18–23 · accept_invite: the family door (case-blind address binding)
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.v2')::uuid, 'impostor@fixture.local', format(
  $$ select hc.accept_invite(%L)::text $$, current_setting('t.tok_fam'))),
  'ERROR:P0001:invite_refused',
  'AC-AUTH-11 DB half: a session signed in as a DIFFERENT address cannot accept — the token is bound to the invited address');
select is(pg_temp.scalar(format(
  $$ select (i.accepted_at is null)::text from public.invites i
     where i.id = %L $$, current_setting('t.tok_fam_id'))), 'true',
  'the mismatched attempt did NOT consume the invite — the right person can still accept');

select is(pg_temp.call_as(current_setting('t.v1')::uuid, 'AUNT.JUNE@fixture.LOCAL', format(
  $$ select (hc.accept_invite(%L)) ->> 'tier' $$, current_setting('t.tok_fam'))),
  'family',
  'the invited address accepts — case-blind, compared with explicit lower() (the citext trap)');

select is(pg_temp.scalar(format(
  $$ select (m.removed_at is null and m.tier = 'family')::text
     from public.circle_members m
     where m.circle_id = %L and m.account_id = %L $$,
  current_setting('t.c1'), current_setting('t.v1'))), 'true',
  'the membership row exists, live, at the invited tier');

select is(pg_temp.scalar(format(
  $$ select array_agg(g.domain::text || ':' || g.level::text order by g.domain)::text
     from public.access_grants g
     join public.circle_members m on m.id = g.member_id
     where m.circle_id = %L and m.account_id = %L $$,
  current_setting('t.c1'), current_setting('t.v1'))),
  '{memories:summary,health:summary,schedule:summary,documents:log}',
  'the family defaults, EXACTLY §7.4 (enum order): health/schedule/memories summary, documents log — and NO finances row (hidden is absence)');

select is(pg_temp.scalar(format(
  $$ select (i.accepted_at is not null and i.accepted_by = %L)::text
     from public.invites i where i.id = %L $$,
  current_setting('t.v1'), current_setting('t.tok_fam_id'))), 'true',
  'the invite records who accepted and when');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'invite_accepted' $$,
  current_setting('t.c1'))), '1',
  'invite_accepted is an access-log event');

-- ----------------------------------------------------------------------------
-- 24–26 · RLS-09 / AC-PERM-4: replay creates NOTHING
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.v2')::uuid, 'aunt.june@fixture.local', format(
  $$ select hc.accept_invite(%L)::text $$, current_setting('t.tok_fam'))),
  'ERROR:P0001:invite_refused',
  'RLS-09: a replayed token updates zero rows and the transaction aborts — one shape, no oracle');
select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.circle_members
     where circle_id = %L and account_id = %L $$,
  current_setting('t.c1'), current_setting('t.v2'))), '0',
  'RLS-09: the replay created no membership');
select is(pg_temp.scalar(format(
  $$ select (i.accepted_by = %L)::text from public.invites i where i.id = %L $$,
  current_setting('t.v1'), current_setting('t.tok_fam_id'))), 'true',
  'RLS-09: the original acceptance is untouched by the replay');

-- ----------------------------------------------------------------------------
-- 27–29 · The care door, and the §7.4 pins AC-AUTH-8 hangs from
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.v3')::uuid, 'aide@fixture.local', format(
  $$ select (hc.accept_invite(%L)) ->> 'tier' $$, current_setting('t.tok_care'))),
  'care_circle', 'the care-circle door accepts');

select is(pg_temp.scalar(format(
  $$ select array_agg(g.domain::text || ':' || g.level::text
                      order by g.subject_id, g.domain)::text
     from public.access_grants g
     join public.circle_members m on m.id = g.member_id
     where m.circle_id = %L and m.account_id = %L $$,
  current_setting('t.c1'), current_setting('t.v3'))),
  '{schedule:summary,schedule:summary}',
  'care-circle defaults, EXACTLY §7.4: schedule summary per covered subject and nothing else — the ceiling starts as it means to go on');

select is(
  (select array_agg(t.domain::text || ':' || t.level::text order by t.domain)
   from hc.tier_defaults('family') t),
  array['memories:summary', 'health:summary', 'schedule:summary', 'documents:log'],
  'hc.tier_defaults(family) IS the §7.4 row (enum order) — the ONE source AC-AUTH-8''s app module snapshots against');

-- ----------------------------------------------------------------------------
-- 30–33 · Expiry, revocation, live-member and reactivation edges
-- ----------------------------------------------------------------------------
select pg_temp.invite_as(current_setting('t.u1')::uuid, 'sarah@fixture.local',
  current_setting('t.c1')::uuid, 'expired@fixture.local', 'family',
  array[current_setting('t.s1')::uuid], 'tok_exp');
do $$
begin
  -- keep the invites_check (expires_at > created_at) satisfied while
  -- pushing the whole life into the past
  update public.invites
     set created_at = now() - interval '8 days',
         expires_at = now() - interval '1 day'
   where id = current_setting('t.tok_exp_id')::uuid;
end $$;
select is(pg_temp.call_as(current_setting('t.v2')::uuid, 'expired@fixture.local', format(
  $$ select hc.accept_invite(%L)::text $$, current_setting('t.tok_exp'))),
  'ERROR:P0001:invite_refused',
  'an expired token is dead — 7 days is the whole life (PRD §4.1.7)');

select pg_temp.invite_as(current_setting('t.u1')::uuid, 'sarah@fixture.local',
  current_setting('t.c1')::uuid, 'revoked@fixture.local', 'family',
  array[current_setting('t.s1')::uuid], 'tok_rev');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, 'sarah@fixture.local', format(
  $$ select (hc.revoke_invite(%L)) ->> 'invite_id' $$,
  current_setting('t.tok_rev_id'))),
  current_setting('t.tok_rev_id'),
  'a coordinator revokes a pending invite');
select is(pg_temp.call_as(current_setting('t.v2')::uuid, 'revoked@fixture.local', format(
  $$ select hc.accept_invite(%L)::text $$, current_setting('t.tok_rev'))),
  'ERROR:P0001:invite_refused',
  'a revoked token is dead');

select is(pg_temp.call_as(current_setting('t.u3')::uuid, 'dan@fixture.local', format(
  $$ select hc.revoke_invite(%L)::text $$, current_setting('t.tok_fam_id'))),
  'ERROR:P0001:invite_refused',
  'a family member cannot revoke, and an accepted invite cannot be revoked — one shape covers both');

-- ----------------------------------------------------------------------------
-- 34–36 · A live member cannot double-join; a removed member REACTIVATES
-- ----------------------------------------------------------------------------
select pg_temp.invite_as(current_setting('t.u1')::uuid, 'sarah@fixture.local',
  current_setting('t.c1')::uuid, 'dan@fixture.local', 'family',
  array[current_setting('t.s1')::uuid], 'tok_dan');
select is(pg_temp.call_as(current_setting('t.u3')::uuid, 'dan@fixture.local', format(
  $$ select hc.accept_invite(%L)::text $$, current_setting('t.tok_dan'))),
  'ERROR:P0001:invite_refused',
  'a LIVE member accepting a fresh invite refuses — membership is not stackable');

do $$
begin
  update public.circle_members
     set removed_at = now(), removed_by = current_setting('t.u1')::uuid
   where id = current_setting('t.m3')::uuid;
  delete from public.access_grants where member_id = current_setting('t.m3')::uuid;
end $$;
select pg_temp.invite_as(current_setting('t.u1')::uuid, 'sarah@fixture.local',
  current_setting('t.c1')::uuid, 'dan@fixture.local', 'family',
  array[current_setting('t.s1')::uuid], 'tok_dan2');
select is(pg_temp.call_as(current_setting('t.u3')::uuid, 'dan@fixture.local', format(
  $$ select (hc.accept_invite(%L)) ->> 'member_id' $$,
  current_setting('t.tok_dan2'))),
  current_setting('t.m3'),
  'a REMOVED member re-invited reactivates their ORIGINAL member row — attribution continuity under the unconditional unique');
select is(pg_temp.scalar(format(
  $$ select (m.removed_at is null and m.removed_by is null and m.tier = 'family')::text
     from public.circle_members m where m.id = %L $$,
  current_setting('t.m3'))), 'true',
  'the reactivated row is live again, tier from the NEW invite, removal marks cleared');

select * from finish();
rollback;
