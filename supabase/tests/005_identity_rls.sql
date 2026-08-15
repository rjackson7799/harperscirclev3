-- ============================================================================
-- Identity-table RLS — §3.4 two-clause shape on circle-scoped tables,
-- fail-closed everywhere else. Canonical fixtures, unique per test file,
-- built as postgres (superuser bypasses RLS; the assertions then run under
-- SET ROLE with request.jwt.claims, which is exactly how PostgREST arrives).
--
-- RED between M3 and M7 by design: the tables exist RLS-forced with no
-- authenticated circle policies, so every POSITIVE read below returns zero
-- rows (the fail-closed boundary state the migration rule requires); the
-- negative assertions are green from M3's revokes. M7 (hc.ctx() + policies)
-- flips the positives green with no edits here.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(16);

-- ----------------------------------------------------------------------------
-- Fixtures (fresh uuids each run; three circles, three accounts)
--   u1: coordinator of c1 (subject s1 with subject-member row, custodian m1)
--       + REMOVED member of c3 — removal must erase reach
--   u2: coordinator of c2 (subject s2) — u1 must never see c2
--   u3: account holding no membership at all
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid) returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_id || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  return p_id;
end $$;

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Run one statement as another role and report its SQLSTATE ('no_error' when
-- it succeeds). pgTAP itself stays resolvable because the pgTAP call runs as
-- postgres; only the probe switches role.
create function pg_temp.errcode_as(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := returned_sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; c3 uuid; s1 uuid; s2 uuid; m1 uuid; m2 uuid; m3 uuid;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Dan'), (u3, 'member', 'Ghost');

  insert into public.circles (name, created_by) values ('Nell''s circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Marcus''s circle', u2)
    returning id into c2;
  insert into public.circles (name, created_by) values ('Former circle', u2)
    returning id into c3;

  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York',
          'sage', 'nell-' || substr(c1::text, 1, 8))
    returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'assisted living', '98101', 'America/Los_Angeles',
          'clay', 'marcus-' || substr(c2::text, 1, 8))
    returning id into s2;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u2, 'coordinator', 'Dan') returning id into m2;
  -- u1's membership in c3, removed — must contribute nothing to reach
  insert into public.circle_members (circle_id, account_id, tier,
                                     display_name_at_join, removed_at, removed_by)
  values (c3, u1, 'family', 'Sarah', now(), u2) returning id into m3;

  -- the subject as an access holder without an account (§2.3, AC-PPL-3)
  insert into public.circle_members (circle_id, subject_id, custodian_member_id,
                                     tier, display_name_at_join)
  values (c1, s1, m1, 'coordinator', 'Nell');
  insert into public.circle_members (circle_id, subject_id, custodian_member_id,
                                     tier, display_name_at_join)
  values (c2, s2, m2, 'coordinator', 'Marcus');

  -- stash ids for the assertions below
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- Positive reads: a live member sees their circle and only theirs.
-- (RED between M3 and M7 — zero rows, the fail-closed boundary state.)
-- ----------------------------------------------------------------------------
select pg_temp.as_user(current_setting('t.u1')::uuid);

select is((select count(*)::int from public.circles), 1,
  'a member sees exactly their own live circle — foreign and removed memberships contribute nothing');
select is((select count(*)::int from public.circles
           where id = current_setting('t.c1')::uuid), 1,
  'the member''s own circle row is readable');
select is((select count(*)::int from public.subjects), 1,
  'subjects: own circle''s subject only');
select is((select count(*)::int from public.circle_members), 2,
  'circle_members: own circle''s rows (member + subject-member), nothing foreign');
select is((select count(*)::int from public.accounts), 1,
  'accounts: exactly the caller''s own row');

-- Negative reads under the same session (green from M3's fail-closed state).
select is((select count(*)::int from public.circles
           where id = current_setting('t.c2')::uuid), 0,
  'a foreign circle returns zero rows — not an error, indistinguishable from nonexistence');

-- Write attempts: the privilege itself is absent (§3.7 posture).
select throws_ok(
  $$ insert into public.circles (name, created_by)
     values ('forged', current_setting('t.u1')::uuid) $$,
  '42501', null, 'authenticated cannot INSERT circles — privilege absent');
select throws_ok(
  $$ update public.circle_members set tier = 'coordinator' $$,
  '42501', null, 'authenticated cannot UPDATE circle_members — privilege absent');
select throws_ok(
  $$ delete from public.subjects $$,
  '42501', null, 'authenticated cannot DELETE subjects — privilege absent');
select throws_ok(
  $$ select * from public.admin_users $$,
  '42501', null, 'authenticated cannot read admin_users at all');

reset role;

-- ----------------------------------------------------------------------------
-- An account with no memberships sees no circle data (present-but-empty ctx).
-- ----------------------------------------------------------------------------
select pg_temp.as_user(current_setting('t.u3')::uuid);
select is((select count(*)::int from public.circles), 0,
  'no memberships → no circles');
select is((select count(*)::int from public.subjects), 0,
  'no memberships → no subjects');
reset role;

-- ----------------------------------------------------------------------------
-- anon: revoked outright — permission denied, no policy consulted.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('anon', 'select * from public.circles'), '42501',
  'anon holds no privilege on circles');

-- ----------------------------------------------------------------------------
-- hc_admin: the Appendix A.1 distinguished failure mode — permission denied
-- for table, not an empty result. The privilege does not exist (AC-ADMIN-1).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('hc_admin', 'select * from public.circles'), '42501',
  'hc_admin: permission denied for circles — absent privilege, not empty result');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.subjects'), '42501',
  'hc_admin: permission denied for subjects');
select is(pg_temp.errcode_as('hc_admin', 'select first_name from public.subjects'), '42501',
  'hc_admin: subjects.first_name unreachable (§3.9 content boundary)');

select * from finish();
rollback;
