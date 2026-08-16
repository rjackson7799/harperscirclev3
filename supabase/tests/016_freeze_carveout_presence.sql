-- ============================================================================
-- 1B · U9 — FRZ-13 (TSD §3.8, ADR-0005 D2/D5): the unresolved read-only
-- carve-out — coordinators other than the objected-to member restored at
-- a `view` CAP; everyone else stays closed; a null objected-to member
-- means NO carve-out (fail-closed). Plus hc.presence() (§3.5): existence
-- without content, bounded by log-on-every-taint-domain and the circle
-- pre-filter.
--
-- RED (U9): the column, the re-signed adjudicator, the cap plumbing and
-- presence are all absent — shape probes fail, the E2E carve-out shows
-- the 1A staging behaviour (unresolved closes everyone), presence 42883.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(24);

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

do $$
declare
  uA uuid := pg_temp.mk_user(gen_random_uuid());  -- coordinator, carved back in
  uB uuid := pg_temp.mk_user(gen_random_uuid());  -- coordinator, objected to
  uC uuid := pg_temp.mk_user(gen_random_uuid());  -- family
  cf uuid; cg uuid; ch uuid; sf uuid; sg uuid; sh uuid;
  mA uuid; mB uuid; mC uuid; mg uuid; mh uuid;
  af uuid := gen_random_uuid(); ag uuid := gen_random_uuid(); ah uuid := gen_random_uuid();
  docf uuid := gen_random_uuid(); docg uuid := gen_random_uuid(); doch uuid := gen_random_uuid();
  taskf uuid := gen_random_uuid(); taskfin uuid := gen_random_uuid();
  fz uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (uA, 'member', 'Ana'), (uB, 'member', 'Boris'), (uC, 'member', 'Cleo');
  insert into public.circles (name, created_by) values ('Carveout circle', uA)
    returning id into cf;
  insert into public.circles (name, created_by) values ('Unnamed-objection circle', uA)
    returning id into cg;
  insert into public.circles (name, created_by) values ('Dismissed circle', uA)
    returning id into ch;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (cf, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'cvo-' || substr(cf::text, 1, 8)) returning id into sf;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (cg, 'Marcus', 'aging in place', '98101', 'America/Los_Angeles', 'clay',
          'cvg-' || substr(cg::text, 1, 8)) returning id into sg;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (ch, 'Ruth', 'memory care', '60614', 'America/Chicago', 'moss',
          'cvh-' || substr(ch::text, 1, 8)) returning id into sh;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cf, uA, 'coordinator', 'Ana') returning id into mA;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cf, uB, 'coordinator', 'Boris') returning id into mB;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cf, uC, 'family', 'Cleo') returning id into mC;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cg, uA, 'coordinator', 'Ana') returning id into mg;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (ch, uA, 'coordinator', 'Ana') returning id into mh;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (cf, mA, sf, d::hc.domain, 'manage', uA),
           (cf, mB, sf, d::hc.domain, 'manage', uA),
           (cf, mC, sf, d::hc.domain, 'manage', uA),
           (cg, mg, sg, d::hc.domain, 'manage', uA),
           (ch, mh, sh, d::hc.domain, 'manage', uA);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (af, cf, sf, 'upload'), (ag, cg, sg, 'upload'), (ah, ch, sh, 'upload');
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (docf, cf, sf, 'Care plan', 'medical', af, now(), uA, now(), 'Ana', '{health}'),
         (docg, cg, sg, 'Care plan', 'medical', ag, now(), uA, now(), 'Ana', '{health}'),
         (doch, ch, sh, 'Care plan', 'medical', ah, now(), uA, now(), 'Ana', '{health}');
  insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone,
    approved_by, approved_at, approver_display_name, taint)
  values (taskf, cf, sf, 'Pharmacy pickup', '2026-09-01', 'America/New_York',
          uA, now(), 'Ana', '{schedule}'),
         (taskfin, cf, sf, 'Pay invoice', '2026-09-01', 'America/New_York',
          uA, now(), 'Ana', '{schedule,finances}');

  -- freezes: cf and cg open now (adjudicated in the probes); ch dismissed later
  insert into public.freezes (circle_id) values (cf) returning id into fz;
  perform set_config('t.fz', fz::text, true);
  insert into public.freezes (circle_id) values (cg) returning id into fz;
  perform set_config('t.fzg', fz::text, true);
  insert into public.freezes (circle_id) values (ch) returning id into fz;
  perform set_config('t.fzh', fz::text, true);

  perform set_config('t.uA', uA::text, true);
  perform set_config('t.uB', uB::text, true);
  perform set_config('t.uC', uC::text, true);
  perform set_config('t.cf', cf::text, true);
  perform set_config('t.sf', sf::text, true);
  perform set_config('t.sg', sg::text, true);
  perform set_config('t.sh', sh::text, true);
  perform set_config('t.mB', mB::text, true);
  perform set_config('t.af', af::text, true);
  perform set_config('t.docf', docf::text, true);
  perform set_config('t.docg', docg::text, true);
  perform set_config('t.doch', doch::text, true);
  perform set_config('t.taskf', taskf::text, true);
  perform set_config('t.taskfin', taskfin::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · The D2 schema: the objected-to identity, bound to unresolved only;
-- the re-signed adjudicator (old signature GONE — exact inventory).
-- ----------------------------------------------------------------------------
select has_column('public', 'freezes', 'objected_to_member_id',
  'freezes records WHO was objected to (ADR-0005 D2 — FRZ-13 needs an identity)');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.freezes (circle_id, objected_to_member_id)
     values (%L, %L) $$,
  current_setting('t.cf'), current_setting('t.mB'))), '23514',
  'an OPEN freeze cannot name an objected-to member — only an unresolved finding may (D2 check)');

select ok(
      to_regprocedure('hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz, uuid)') is not null
  and to_regprocedure('hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz)') is null,
  'adjudicate_freeze carries p_objected_to_member_id; the old signature is dropped, not shadowed');

-- ----------------------------------------------------------------------------
-- 4–6 · The cap in the pure function: never raises, only lowers; a missing
-- key changes nothing (1A ctx shapes behave identically).
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select hc.visible_at(jsonb_build_object('subjects', jsonb_build_object(
    '11111111-1111-1111-1111-111111111111', jsonb_build_object(
      'c', '22222222-2222-2222-2222-222222222222', 'member', null, 'tier', 'coordinator',
      'frozen', false, 'cap', 'view',
      'manage', '["memories","health","schedule","documents","finances"]'::jsonb,
      'view', '["memories","health","schedule","documents","finances"]'::jsonb,
      'summary', '["memories","health","schedule","documents","finances"]'::jsonb,
      'log', '["memories","health","schedule","documents","finances"]'::jsonb)),
    'shares', '{}'::jsonb),
    '11111111-1111-1111-1111-111111111111', '{health}', true)::text $$),
  'view',
  'the cap binds a manage-holding coordinator to view — read-only means read-only');

select is(pg_temp.scalar($$
  select hc.visible_at(jsonb_build_object('subjects', jsonb_build_object(
    '11111111-1111-1111-1111-111111111111', jsonb_build_object(
      'c', '22222222-2222-2222-2222-222222222222', 'member', null, 'tier', 'coordinator',
      'frozen', false, 'cap', 'view',
      'manage', '[]'::jsonb, 'view', '[]'::jsonb,
      'summary', '["health"]'::jsonb, 'log', '["health"]'::jsonb)),
    'shares', '{}'::jsonb),
    '11111111-1111-1111-1111-111111111111', '{health}', true)::text $$),
  'summary',
  'the cap never raises — a summary holder stays at summary under the carve-out');

select is(pg_temp.scalar($$
  select hc.visible_at(jsonb_build_object('subjects', jsonb_build_object(
    '11111111-1111-1111-1111-111111111111', jsonb_build_object(
      'c', '22222222-2222-2222-2222-222222222222', 'member', null, 'tier', 'coordinator',
      'frozen', false,
      'manage', '["memories","health","schedule","documents","finances"]'::jsonb,
      'view', '["memories","health","schedule","documents","finances"]'::jsonb,
      'summary', '["memories","health","schedule","documents","finances"]'::jsonb,
      'log', '["memories","health","schedule","documents","finances"]'::jsonb)),
    'shares', '{}'::jsonb),
    '11111111-1111-1111-1111-111111111111', '{health}', true)::text $$),
  'manage',
  'no cap key ⇒ manage stays manage — 1A ctx shapes are untouched');

-- ----------------------------------------------------------------------------
-- 7–13 · E2E: unresolved NAMING the objected-to member. Ana (coordinator,
-- not objected to) is capped at view; Boris (objected to) and Cleo
-- (family) stay closed; writing stays closed for everyone (FRZ-14/§3.8).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.adjudicate_freeze(%L, 'unresolved', 'adjudicator',
       p_objected_to_member_id => %L) $$,
  current_setting('t.fz'), current_setting('t.mB'))), 'no_error',
  'the adjudicator records an unresolved finding naming the objected-to member');

select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select ((hc.ctx() -> 'subjects' -> %L ->> 'frozen')::boolean is false
         and (hc.ctx() -> 'subjects' -> %L ->> 'cap') = 'view')::text $$,
  current_setting('t.sf'), current_setting('t.sf'))), 'true',
  'Ana''s ctx: not frozen, capped at view (FRZ-13)');

select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.docf'))), '1',
  'Ana reads the record again — the carve-out restores reading');

select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"title": "edited under freeze"}')::text $$,
  current_setting('t.taskf'))), 'ERROR:P0001:revise_refused',
  'Ana cannot edit — the cap holds her below manage (read-only, §3.8)');

select is(pg_temp.call_as(current_setting('t.uB')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.docf'))), '0',
  'Boris — the objected-to coordinator — stays closed out');

select is(pg_temp.call_as(current_setting('t.uC')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.docf'))), '0',
  'Cleo — family — stays closed: the carve-out is coordinators only');

select is(pg_temp.call_as(current_setting('t.uB')::uuid, format(
  $$ select ((hc.ctx() -> 'subjects' -> %L ->> 'frozen')::boolean is true)::text $$,
  current_setting('t.sf'))), 'true',
  'Boris''s ctx says frozen — his reading never resumed');

-- ----------------------------------------------------------------------------
-- 14–15 · Unresolved WITHOUT a named member: no carve-out, everyone closed
-- (fail-closed default; also PRD''s only-coordinator-is-objected-to case).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.adjudicate_freeze(%L, 'unresolved', 'adjudicator') $$,
  current_setting('t.fzg'))), 'no_error',
  'an unresolved finding with no named member is recorded');

select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.docg'))), '0',
  'no named objected-to member ⇒ NO carve-out — the fail-closed default holds');

-- ----------------------------------------------------------------------------
-- 16–17 · Dismissed clears everything: no flag, no cap.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.adjudicate_freeze(%L, 'dismissed', 'adjudicator') $$,
  current_setting('t.fzh'))), 'no_error',
  'the third freeze is dismissed');

select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select ((select count(*) from public.documents where id = %L) = 1
         and (hc.ctx() -> 'subjects' -> %L ->> 'cap') is null)::text $$,
  current_setting('t.doch'), current_setting('t.sh'))), 'true',
  'dismissed: full access restored, no cap in the ctx');

-- ----------------------------------------------------------------------------
-- 18–24 · hc.presence() (§3.5): ids and dates and nothing else.
-- ----------------------------------------------------------------------------
select ok(to_regprocedure('hc.presence(uuid)') is not null,
  'hc.presence(subject) exists');
select ok(coalesce(
  has_function_privilege('authenticated', to_regprocedure('hc.presence(uuid)'), 'execute'),
  false),
  'EXECUTE granted to authenticated — log level is served ONLY here');

-- Ana (capped at view ≥ log) sees presence rows for the schedule task…
select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select count(*)::text from hc.presence(%L) p
     where p.object_type = 'task' and p.id = %L $$,
  current_setting('t.sf'), current_setting('t.taskf'))), '1',
  'presence: existence and dates for an object the caller clears at log-or-above');

select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select p.dated_on::text from hc.presence(%L) p
     where p.object_type = 'task' and p.id = %L $$,
  current_setting('t.sf'), current_setting('t.taskf'))), '2026-09-01',
  'presence: the date is the payload — "something is due Friday"');

-- …and no title column EXISTS in the return type.
select is(pg_temp.call_as(current_setting('t.uA')::uuid, format(
  $$ select p.title::text from hc.presence(%L) p limit 1 $$,
  current_setting('t.sf'))), 'ERROR:42703:column p.title does not exist',
  'presence returns ids and dates and NOTHING else — no title column exists to leak');

-- Boris (frozen) gets nothing at all.
select is(pg_temp.call_as(current_setting('t.uB')::uuid, format(
  $$ select count(*)::text from hc.presence(%L) $$,
  current_setting('t.sf'))), '0',
  'presence under a freeze: nothing — clause 2 runs before the ladder');

-- An arbitrary foreign subject: the circle pre-filter (§3.5) yields zero.
select is(pg_temp.call_as(current_setting('t.uB')::uuid, format(
  $$ select count(*)::text from hc.presence(%L) $$,
  current_setting('t.sg'))), '0',
  'presence with an arbitrary p_subject outside the caller''s circles returns nothing (§3.5 pre-filter)');

select * from finish();
rollback;
