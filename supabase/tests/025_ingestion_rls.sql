-- ============================================================================
-- 1C · U7 — ING-02/ING-03: the §3.4 read policies for the pipeline surface.
--
-- The level→table map (§3.4): SUMMARY reaches the arrival row; VIEW reaches
-- extractions and arrival.auth_detail; proposals are the approval surface —
-- MANAGE over the proposal's own taint (ADR-0007; absent from the §3.4 map,
-- pinned fail-closed to the audience that can act on them).
--
-- Pipeline material is unclassified until approved into the record, so
-- arrivals and extractions carry the FAIL-CLOSED all-domain taint in their
-- policies (ADR-0007): a member below summary/view on ANY domain sees
-- nothing — an arrival row can be an invoice or a discharge summary, and
-- the policy cannot know which yet.
--
-- RLS cannot vary by column, so auth_detail is drawn OUT of the
-- authenticated column grant (§3.4's one place the ladder shapes the
-- schema, applied inside a table via column privileges) and served at view
-- by hc.arrival_auth_detail — DEF-10 one-shape refusal.
--
-- ING-03 is A.1's paired health half: the summary member who CAN see the
-- timeline row and the arrival row gets ZERO extraction rows — both halves
-- asserted, because only asserting the first would pass a broken build.
--
-- RED (U7): summary/view reads report 42501 (privilege absent, U1's
-- fail-closed staging); the accessor probes report 42883.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(20);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.scalar_as(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.msg_as(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := message_text;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
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
  u1 uuid := pg_temp.mk_user(gen_random_uuid());  -- coordinator, manage×5
  u2 uuid := pg_temp.mk_user(gen_random_uuid());  -- family, summary×5
  u3 uuid := pg_temp.mk_user(gen_random_uuid());  -- family, view×5
  u4 uuid := pg_temp.mk_user(gen_random_uuid());  -- family, schedule manage only
                                                  -- (family tier: the taint
                                                  -- arithmetic is under test,
                                                  -- not the care_circle ceiling)
  c1 uuid; c2 uuid; s1 uuid; s2 uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; mf uuid;
  a1 uuid; a2 uuid;
  d hc.domain;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'),
    (u3, 'member', 'Marisol'), (u4, 'member', 'Dee');
  insert into public.circles (name, created_by) values ('Ing RLS', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Ing RLS 2', u1) returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'ir1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '02139', 'America/Chicago', 'clay',
          'ir2-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Marisol') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u4, 'family', 'Dee') returning id into m4;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u1, 'coordinator', 'Sarah') returning id into mf;
  foreach d in array enum_range(null::hc.domain) loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d, 'manage', u1),
           (c1, m2, s1, d, 'summary', u1),
           (c1, m3, s1, d, 'view', u1),
           (c2, mf, s2, d, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m4, s1, 'schedule', 'manage', u1);

  a1 := hc.create_arrival(c1, s1, 'email',
          p_sender_address => 'dr@clinic.example',
          p_auth_result => 'authenticated',
          p_auth_detail => '{"dmarc": "pass", "spf": "pass"}'::jsonb,
          p_ingest_idempotency_key => 'rls-1');
  a2 := hc.create_arrival(c2, s2, 'upload', p_ingest_idempotency_key => 'rls-2');
  insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
                                  confidence, risk_class, citation, model_id, prompt_version)
  values (a1, c1, s1, 'discharge_date', '"2026-08-01"', 0.9, 'standard',
          '{"page": 1}', 'm1', 'p1');
  insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
  values (a1, c1, s1, 'timeline_event',
          '{"kind":"care","summary":"Follow-up"}', '{health}'),
         (a1, c1, s1, 'task', '{"title":"Book follow-up"}', '{schedule}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.u4', u4::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.a1', a1::text, true);
exception when others then
  perform set_config('t.u1', gen_random_uuid()::text, true);
  perform set_config('t.u2', gen_random_uuid()::text, true);
  perform set_config('t.u3', gen_random_uuid()::text, true);
  perform set_config('t.u4', gen_random_uuid()::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.c2', gen_random_uuid()::text, true);
  perform set_config('t.s1', gen_random_uuid()::text, true);
  perform set_config('t.a1', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · ING-02: summary reaches the arrival ROW; auth_detail and the fence
-- column stay out of the grant, so `*` is not readable at any level.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.arrivals
     where circle_id = %L $$, current_setting('t.c1'))),
  '1',
  'ING-02: a summary member reaches the arrival row (the inbox list exists for them)');

select is(pg_temp.scalar_as(current_setting('t.u2')::uuid, format(
  $$ select state::text || ':' || channel || ':' || (sender_address is not null)::text
     from public.arrivals where circle_id = %L $$, current_setting('t.c1'))),
  'received:email:true',
  'the granted columns carry the honest §4.4 surface: state, channel, sender');

select is(pg_temp.scalar_as(current_setting('t.u2')::uuid,
  'select auth_detail::text from public.arrivals limit 1'),
  'ERROR:42501',
  'auth_detail is OUT of the column grant — the summary/view line drawn inside the table (§3.4)');

select is(pg_temp.scalar_as(current_setting('t.u1')::uuid,
  'select * from public.arrivals limit 1') || ':' ||
  pg_temp.scalar_as(current_setting('t.u1')::uuid,
  'select current_lease_id::text from public.arrivals limit 1'),
  'ERROR:42501:ERROR:42501',
  'select * fails for EVERYONE — auth_detail and the fence column are not in any grant');

-- ----------------------------------------------------------------------------
-- 5–7 · The fail-closed all-domain taint: below summary-on-five, nothing;
-- foreign circles, nothing; zero rows, never an error.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar_as(current_setting('t.u4')::uuid, format(
  $$ select count(*)::text from public.arrivals where circle_id = %L $$,
  current_setting('t.c1'))),
  '0',
  'a schedule-only member sees NO arrival rows — unclassified content spans every domain (ADR-0007)');

select is(pg_temp.scalar_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.arrivals where circle_id = %L $$,
  current_setting('t.c2'))),
  '1',
  'positive control: the coordinator reads their OTHER circle''s arrival through the same policy');

select is(pg_temp.scalar_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.arrivals where circle_id = %L $$,
  current_setting('t.c2'))),
  '0',
  'a foreign circle returns zero rows — indistinguishable from nonexistence (RLS-01 shape)');

-- ----------------------------------------------------------------------------
-- 8–10 · ING-03: the A.1 paired half. The SAME summary member who can see
-- the arrival row gets ZERO extraction rows; view resolves them.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar_as(current_setting('t.u2')::uuid, format(
  $$ select (select count(*) from public.arrivals where circle_id = %L)::text || ':' ||
            (select count(*) from public.extractions where circle_id = %L)::text $$,
  current_setting('t.c1'), current_setting('t.c1'))),
  '1:0',
  'ING-03 both halves: summary reaches the arrival row AND zero extractions — the pair, in one member');

select is(pg_temp.scalar_as(current_setting('t.u3')::uuid, format(
  $$ select field || '=' || (value #>> '{}')
     from public.extractions where circle_id = %L $$,
  current_setting('t.c1'))),
  'discharge_date=2026-08-01',
  'the view member resolves the extracted contents (§3.4: view reaches extractions)');

select is(pg_temp.scalar_as(current_setting('t.u4')::uuid, format(
  $$ select count(*)::text from public.extractions where circle_id = %L $$,
  current_setting('t.c1'))),
  '0',
  'view on ONE domain is not view on unclassified content — all-domain taint binds extractions too');

-- ----------------------------------------------------------------------------
-- 11–13 · Proposals: the approval audience, per-proposal taint.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.proposals where circle_id = %L $$,
  current_setting('t.c1'))),
  '2',
  'manage-on-five reads both pending proposals (the review surface)');

select is(pg_temp.scalar_as(current_setting('t.u4')::uuid, format(
  $$ select kind::text from public.proposals where circle_id = %L $$,
  current_setting('t.c1'))),
  'task',
  'manage-on-schedule reads the schedule-tainted draft ONLY — the health conflict is not theirs to see');

select is(pg_temp.scalar_as(current_setting('t.u3')::uuid, format(
  $$ select count(*)::text from public.proposals where circle_id = %L $$,
  current_setting('t.c1'))),
  '0',
  'view members read NO proposals — reading a draft is the approval audience''s surface (ADR-0007)');

-- ----------------------------------------------------------------------------
-- 14–16 · auth_detail at view, through the one accessor (DEF-10 shapes).
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar_as(current_setting('t.u3')::uuid, format(
  $$ select hc.arrival_auth_detail(%L) ->> 'dmarc' $$, current_setting('t.a1'))),
  'pass',
  'ING-02: view reaches auth_detail — through hc.arrival_auth_detail, not a second policy');

select is(pg_temp.msg_as(current_setting('t.u2')::uuid, format(
  $$ select hc.arrival_auth_detail(%L) $$, current_setting('t.a1'))) || ':' ||
  pg_temp.msg_as(current_setting('t.u3')::uuid, format(
  $$ select hc.arrival_auth_detail(%L) $$, gen_random_uuid()::text)),
  'arrival_refused:arrival_refused',
  'below-view and nonexistent share ONE shape (DEF-10)');

select is(pg_temp.scalar($$
  select (has_function_privilege('authenticated', 'hc.arrival_auth_detail(uuid)', 'execute')
      and not has_function_privilege('hc_admin', 'hc.arrival_auth_detail(uuid)', 'execute')
      and not has_function_privilege('hc_pipeline', 'hc.arrival_auth_detail(uuid)', 'execute'))::text $$),
  'true',
  'the accessor is a member surface only (catalog-asserted, PLT-04)');

-- ----------------------------------------------------------------------------
-- 17 · A freeze closes the pipeline surface like everything else.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
exception when others then null;
end $$;

select is(pg_temp.scalar_as(current_setting('t.u1')::uuid, format(
  $$ select (select count(*) from public.arrivals where circle_id = %L)::text || ':' ||
            (select count(*) from public.extractions where circle_id = %L)::text || ':' ||
            (select count(*) from public.proposals where circle_id = %L)::text $$,
  current_setting('t.c1'), current_setting('t.c1'), current_setting('t.c1'))),
  '0:0:0',
  'an open freeze closes arrivals, extractions and proposals for the coordinator too (AC-PERM-11)');

-- ----------------------------------------------------------------------------
-- 18 · hc_admin: privilege absent, no policy consulted (A.1 admin variants).
-- ----------------------------------------------------------------------------
create function pg_temp.errcode_admin(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute 'set local role hc_admin';
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := returned_sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

select is(
  pg_temp.errcode_admin('select id from public.arrivals') || ':' ||
  pg_temp.errcode_admin('select id from public.extractions') || ':' ||
  pg_temp.errcode_admin('select id from public.proposals'),
  '42501:42501:42501',
  'hc_admin gets permission denied on all three — the privilege is absent, no policy consulted (AC-ADMIN-1)');

-- ----------------------------------------------------------------------------
-- 19–20 · The §3.4 two-clause shape holds the PRF discipline: exactly two
-- ctx InitPlans, zero SubPlans, on the new policies.
-- ----------------------------------------------------------------------------
create function pg_temp.plan_of(p_sql text) returns text language plpgsql as $$
declare v text := ''; l text;
begin
  for l in execute 'explain (format text) ' || p_sql loop
    v := v || l || e'\n';
  end loop;
  return v;
end $$;
grant execute on function pg_temp.plan_of(text) to authenticated;

create function pg_temp.count_nodes(p_text text, p_kind text) returns int
language sql as $$
  select regexp_count(p_text, '\n\s*' || p_kind || ' \d')
$$;

select set_config('t.plan_arrivals',
  pg_temp.scalar_as(current_setting('t.u2')::uuid,
    $$ select pg_temp.plan_of('select id, state from public.arrivals') $$), true);
select set_config('t.plan_proposals',
  pg_temp.scalar_as(current_setting('t.u1')::uuid,
    $$ select pg_temp.plan_of('select id, kind from public.proposals') $$), true);

select ok(
      pg_temp.count_nodes(current_setting('t.plan_arrivals'), 'InitPlan') = 2
  and pg_temp.count_nodes(current_setting('t.plan_arrivals'), 'SubPlan') = 0,
  'arrivals policy: two textual ctx references → two InitPlans, zero SubPlans (PRF-01 shape)');

select ok(
      pg_temp.count_nodes(current_setting('t.plan_proposals'), 'InitPlan') = 2
  and pg_temp.count_nodes(current_setting('t.plan_proposals'), 'SubPlan') = 0,
  'proposals policy: two textual ctx references → two InitPlans, zero SubPlans');

select * from finish();
rollback;
