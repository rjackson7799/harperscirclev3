-- ============================================================================
-- 1B · U8 — hc.share_object() (TSD §2.5, §3.6) and CTX-07: the ctx `shares`
-- placeholder replaced with the §3.2-VERBATIM subquery over object_shares,
-- in BOTH hc.ctx() and hc.ctx_for().
--
-- RED (U8): share_object absent (42883) and ctx() still returns the
-- 1A placeholder '{}' — the CTX-07 population probes fail.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(16);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

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

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
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

-- 2A M2: sharing requires §5.7 step-up. Mint on a freshly re-authenticated
-- session, bound to 'share_object' + 'type:id'. A REFUSED share rolls its
-- consumption back (the call_as exception block), so refusal cases prove
-- the predicate under test, not a missing token.
create function pg_temp.mint_share(p_user uuid, p_target text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  v := hc.mint_step_up('share_object', p_target) ->> 'token';
  execute 'reset role';
  return v;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- manage×5, granter
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- documents-hidden grantee
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- member to be removed
  u4 uuid := pg_temp.mk_user(gen_random_uuid());   -- other-circle member
  c1 uuid; c2 uuid; s1 uuid; s2 uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  doc1 uuid := gen_random_uuid(); td uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'),
    (u3, 'member', 'Dan'), (u4, 'member', 'Maya');
  insert into public.circles (name, created_by) values ('Share circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Other circle', u4)
    returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'shr-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '98101', 'America/Los_Angeles', 'clay',
          'shr2-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Dan') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u4, 'coordinator', 'Maya') returning id into m4;
  foreach d in array array['memories','health','schedule','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m2, s1, d::hc.domain, 'manage', u1),
           (c1, m3, s1, d::hc.domain, 'manage', u1);
  end loop;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (a1, c1, s1, 'upload'), (a2, c2, s2, 'upload');

  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc1, c1, s1, 'Power of attorney', 'legal', a1, now(), u1, now(), 'Sarah',
          '{documents}');
  insert into public.tasks (id, circle_id, subject_id, title,
    approved_by, approved_at, approver_display_name, taint)
  values (td, c1, s1, 'Derived from the POA', u1, now(), 'Sarah', '{schedule}');
  perform hc.link_provenance('task', td, 'document', doc1);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.m3', m3::text, true);
  perform set_config('t.m4', m4::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.doc1', doc1::text, true);
  perform set_config('t.td', td::text, true);
end $$;

-- 1–2 · Shape (4-arg since 2A M2 — §5.7 requires step-up before sharing).
select ok(to_regprocedure('hc.share_object(hc.object_type, uuid, uuid, text)') is not null,
  'hc.share_object(type, id, member, step_up_token) exists');
select ok(coalesce(
  has_function_privilege('authenticated',
    to_regprocedure('hc.share_object(hc.object_type, uuid, uuid, text)'), 'execute'),
  false),
  'EXECUTE granted to authenticated — sharing is a member act');

-- 3–5 · The share, and the row it writes.
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.share_object('document', %L, %L, %L)) ->> 'object_id' $$,
  current_setting('t.doc1'), current_setting('t.m2'),
  pg_temp.mint_share(current_setting('t.u1')::uuid,
                     'document:' || current_setting('t.doc1')))),
  current_setting('t.doc1'),
  'a manage-holding granter shares one named object with one named person');

select is(pg_temp.scalar(format(
  $$ select (sh.circle_id = %L and sh.subject_id = %L and sh.granted_by = %L
             and sh.revoked_at is null)::text
     from public.object_shares sh
     where sh.object_type = 'document' and sh.object_id = %L and sh.member_id = %L $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1'),
  current_setting('t.doc1'), current_setting('t.m2'))), 'true',
  'the share stores circle AND subject, so agreement is checkable without resolving the polymorph (§2.5)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'object_shared' $$,
  current_setting('t.c1'))), '1',
  'the share is an access-log event');

-- 6–7 · CTX-07: the shares key is populated, per the §3.2 body.
select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select ((hc.ctx() -> 'shares' -> 'document') @> to_jsonb(%L::uuid))::text $$,
  current_setting('t.doc1'))), 'true',
  'CTX-07: hc.ctx() shares carries the granted object id under its type key');

select is(pg_temp.scalar(format(
  $$ select ((hc.ctx_for(%L) -> 'shares' -> 'document') @> to_jsonb(%L::uuid))::text $$,
  current_setting('t.u2'), current_setting('t.doc1'))), 'true',
  'CTX-07: hc.ctx_for() carries the identical shares — one body, two keys');

-- 8–9 · The share works end to end, and does NOT propagate.
select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.doc1'))), '1',
  'the documents-hidden grantee reads the ONE shared document through the policy (§3.3 clause 5)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.tasks where id = %L $$,
  current_setting('t.td'))), '0',
  'the task derived from the shared document is NOT reachable — no propagation code exists (AC-PERM-10)');

-- 10–13 · Validation refusals, one shape — each presented a VALID token,
-- so the refusal is the predicate's, never the token's.
select set_config('t.ghost', gen_random_uuid()::text, true);
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.share_object('document', %L, %L, %L)::text $$,
  current_setting('t.ghost'), current_setting('t.m2'),
  pg_temp.mint_share(current_setting('t.u1')::uuid,
                     'document:' || current_setting('t.ghost')))),
  'ERROR:P0001:share_refused',
  'a nonexistent object refuses');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.share_object('document', %L, %L, %L)::text $$,
  current_setting('t.doc1'), current_setting('t.m4'),
  pg_temp.mint_share(current_setting('t.u1')::uuid,
                     'document:' || current_setting('t.doc1')))),
  'ERROR:P0001:share_refused',
  'a grantee from another circle refuses — circle agreement is validated, not assumed');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select hc.share_object('task', %L, %L, %L)::text $$,
  current_setting('t.td'), current_setting('t.m3'),
  pg_temp.mint_share(current_setting('t.u2')::uuid,
                     'task:' || current_setting('t.td')))),
  'ERROR:P0001:share_refused',
  'a granter who cannot currently see the object at manage cannot share it');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.circle_members set removed_at = now() where id = %L $$,
  current_setting('t.m3'))), 'no_error',
  'fixture: Dan''s membership is removed');

-- 14 · A removed member's shares contribute nothing (§3.2 verbatim filters).
select is(pg_temp.call_as(current_setting('t.u3')::uuid,
  $$ select (hc.ctx() -> 'shares')::text $$), '{}',
  'a removed membership contributes no shares — the §3.2 join filters removed_at');

-- 15–16 · Revocation closes the door on the next evaluation.
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.object_shares set revoked_at = now()
     where object_id = %L and member_id = %L and revoked_at is null $$,
  current_setting('t.doc1'), current_setting('t.m2'))), 'no_error',
  'fixture: the share is revoked');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.doc1'))), '0',
  'the revoked share grants nothing on the very next query — ctx is per statement');

select * from finish();
rollback;
