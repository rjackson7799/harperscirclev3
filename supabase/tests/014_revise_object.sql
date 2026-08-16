-- ============================================================================
-- 1B · U7 — hc.revise_object() (TSD §3.7): edits go through one function
-- that writes the record_revisions row in the same transaction and NEVER
-- touches the provenance block or taint. Column allowlist per type;
-- profile_facts are supersede-only (no revise path at all, §2.5).
--
-- RED (U7): the function does not exist — 42883 everywhere.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(13);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s2 uuid; m1 uuid; m2 uuid; m3 uuid; mf uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid();
  pf1 uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Marisol');
  insert into public.circles (name, created_by) values ('Revise circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Revise frozen', u1)
    returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'rev-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '98101', 'America/Los_Angeles', 'clay',
          'revf-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'care_circle', 'Marisol') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u1, 'coordinator', 'Sarah') returning id into mf;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m2, s1, d::hc.domain, 'summary', u1),
           (c1, m3, s1, d::hc.domain, 'manage', u1),
           (c2, mf, s2, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (a1, c1, s1, 'upload'), (a2, c2, s2, 'upload');
  insert into public.freezes (circle_id) values (c2);

  insert into public.tasks (id, circle_id, subject_id, title, detail,
    approved_by, approved_at, approver_display_name, taint)
  values (t1, c1, s1, 'Original title', 'original detail',
          u1, now(), 'Sarah', '{schedule}');
  insert into public.tasks (id, circle_id, subject_id, title,
    approved_by, approved_at, approver_display_name, taint)
  values (t2, c2, s2, 'Frozen-circle task', u1, now(), 'Sarah', '{schedule}');
  insert into public.profile_facts (id, circle_id, subject_id, field, value,
    risk_class, domain, approved_by, approved_at, approver_display_name, taint)
  values (pf1, c1, s1, 'allergies', '"penicillin"', 'high', 'health',
          u1, now(), 'Sarah', '{health}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.t1', t1::text, true);
  perform set_config('t.t2', t2::text, true);
  perform set_config('t.pf1', pf1::text, true);
end $$;

-- 1–2 · Shape.
select ok(to_regprocedure('hc.revise_object(hc.object_type, uuid, jsonb)') is not null,
  'hc.revise_object(type, id, patch) exists');
select ok(coalesce(
  has_function_privilege('authenticated',
    to_regprocedure('hc.revise_object(hc.object_type, uuid, jsonb)'), 'execute'),
  false),
  'EXECUTE granted to authenticated — editing is a member act');

-- 3–5 · The edit and its revision trail.
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.revise_object('task', %L, '{"title": "Renamed title"}')) ->> 'revision_no' $$,
  current_setting('t.t1'))), '1',
  'a manage-holding member edits; the first revision is number 1');

select is(pg_temp.scalar(format(
  $$ select (r.before ->> 'title' = 'Original title'
             and r.after ->> 'title' = 'Renamed title'
             and r.changer_display_name = 'Sarah')::text
     from public.record_revisions r
     where r.object_type = 'task' and r.object_id = %L and r.revision_no = 1 $$,
  current_setting('t.t1'))), 'true',
  'the revision row captures before, after, and who — in the same transaction (N2)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.revise_object('task', %L, '{"detail": "updated detail"}')) ->> 'revision_no' $$,
  current_setting('t.t1'))), '2',
  'the second edit is revision 2 — history is a sequence, not a pile');

-- 6–8 · What the function will not touch.
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"approved_by": "%s"}')::text $$,
  current_setting('t.t1'), gen_random_uuid())), 'ERROR:P0001:revise_invalid_field',
  'the provenance block is not even addressable — refused at the allowlist, before the guard');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"taint": ["schedule"]}')::text $$,
  current_setting('t.t1'))), 'ERROR:P0001:revise_invalid_field',
  'taint is never an editable column — a manual edit leaves taint exactly as it was (PRD §7.6)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('profile_fact', %L, '{"value": "peanuts"}')::text $$,
  current_setting('t.pf1'))), 'ERROR:P0001:revise_refused',
  'profile facts are supersede-only — "use the new one" supersedes, it does not update (§2.5)');

-- 9–12 · Who may not.
select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"title": "sneaky"}')::text $$,
  current_setting('t.t1'))), 'ERROR:P0001:revise_refused',
  'a summary-level member cannot edit — manage is re-checked at write time');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"title": "ghost"}')::text $$,
  gen_random_uuid())), 'ERROR:P0001:revise_refused',
  'a nonexistent object refuses with the SAME shape (DEF-10)');

select is(pg_temp.call_as(current_setting('t.u3')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"title": "ceiling"}')::text $$,
  current_setting('t.t1'))), 'ERROR:P0001:revise_refused',
  'care_circle cannot edit an unassigned task — the §3.3 ceiling holds for writes');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"title": "frozen edit"}')::text $$,
  current_setting('t.t2'))), 'ERROR:P0001:revise_refused',
  'a freeze closes editing with everything else — visible_at returns hidden, manage fails');

-- 13 · The object's title actually changed and nothing else moved.
select is(pg_temp.scalar(format(
  $$ select (title = 'Renamed title' and detail = 'updated detail'
             and taint = '{schedule}' and approver_display_name = 'Sarah')::text
     from public.tasks where id = %L $$,
  current_setting('t.t1'))), 'true',
  'the edit landed; provenance and taint are exactly as approved');

select * from finish();
rollback;
