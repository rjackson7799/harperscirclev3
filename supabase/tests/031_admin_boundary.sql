-- ============================================================================
-- 1D · U4 — the admin boundary (TSD §3.9, §9.2; AC-ADMIN-1/-6; A.1, A.4).
--
-- hc_admin cannot read record contents because the privilege does not
-- exist. What it MAY reach is two schemas: admin_meta (read-only views —
-- counts, timings, enumerated states, opaque identifiers, owned by
-- hc_internal as the INTENTIONAL privilege bridge) and admin_ops (one
-- narrowly-granted wrapper per permitted operation — ZERO in 1D: every
-- §9.3 operation requires the §5.7-shaped step-up machinery of the auth
-- slice, so the wrappers are staged as ADM-01; an empty admin_ops is the
-- fail-closed boundary, and a wrapper accepting an unvalidatable MFA
-- token would repeat the APR-06 mistake the round-6 review killed).
--
-- The four §3.9 CI assertions live HERE, run on every migration:
--   1 · hc_admin holds no table privilege in public/hc and no usage on
--       public/hc/storage — the A.1 distinguished failure mode (42501
--       permission denied, never zero rows) is preserved on the 1D
--       surfaces.
--   2 · Transitively through pg_depend (recursing through nested views),
--       no admin_meta view reaches a content column — any column of the
--       seven content tables (any REFERENCE to those tables at all), or
--       the named columns of the mixed tables (subjects.first_name,
--       arrivals.sender_address/sender_display_name — plus, beyond the
--       §3.9 list and recorded in ADR-0009: arrivals.auth_detail and
--       arrivals.message_id (provider-verbatim, the A5 exclusion),
--       circles.name and circles.opening_context, invites.token_hash/
--       invited_email/note). The walk rejects the COLUMN whatever the
--       exposed result type — proven by an in-transaction probe view
--       (length(title)) and a nested wrapper, both caught.
--   3 · No function of ours is reachable from any admin_meta view —
--       function indirection would walk through assertion 2. Allowlist
--       empty in 1D; probe proven.
--   4 · hc_admin holds EXECUTE on nothing, anywhere; admin_ops holds
--       zero functions (moves when ADM-01 lands).
--
-- RED (U4): admin_ops absent, no views, hc_admin reaches nothing —
-- inventory and reach pins fail; the walks pass vacuously until views
-- exist, which is why the probe controls exist.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(23);

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

create function pg_temp.admin_scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute 'set local role hc_admin';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; s2 uuid; m1 uuid; m2 uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Admin probe circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'adm-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Marcus', 'aging in place', '02139', 'America/New_York', 'clay',
          'adm2-' || substr(c1::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;

  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (a1, c1, s1, 'upload'), (a2, c1, s1, 'upload');
  insert into public.arrivals (id, circle_id, subject_id, channel,
                               sender_address, sender_display_name)
  values (a3, c1, s2, 'email', 'dr@clinic.example', 'Dr. Chen');
  insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                     reason_code, attempt)
  select a1, c1, 'received', 'received', 'sweeper_requeue', 1;

  perform hc.log(c1, 'member_joined', 'Priya', u2);
  perform hc.log(c1, 'object_approved', 'Sarah', u1, s1, null,
                 'health'::hc.domain);

  perform set_config('t.u2', u2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
end $$;

-- two denials that collapse to ONE row counting TWO (M3 machinery)
select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, %L))::text
         || ':' || (hc.log_denied(%L, 'health'::hc.domain, %L))::text $$,
  current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.c1'), current_setting('t.s1'))),
  '3:3',
  'fixture control: two denials collapsed onto seq 3');

-- ----------------------------------------------------------------------------
-- 2–5 · Reach: two schemas and nothing else; no table privilege anywhere.
-- ----------------------------------------------------------------------------
select ok((select count(*) from pg_namespace where nspname = 'admin_ops') = 1,
  'admin_ops exists — one narrowly-granted wrapper per permitted operation (zero today, ADM-01)');

select ok(coalesce(
      has_schema_privilege('hc_admin', 'admin_meta', 'usage')
  and has_schema_privilege('hc_admin', 'admin_ops', 'usage')
  and not has_schema_privilege('hc_admin', 'public', 'usage')
  and not has_schema_privilege('hc_admin', 'hc', 'usage')
  and not has_schema_privilege('hc_admin', 'storage', 'usage'),
  false),
  'hc_admin resolves admin_meta and admin_ops, and CANNOT resolve public, hc or storage (§3.9)');

select is((
  select count(*)::int
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'hc') and c.relkind = 'r'
    and (   has_table_privilege('hc_admin', c.oid, 'select')
         or has_table_privilege('hc_admin', c.oid, 'insert')
         or has_table_privilege('hc_admin', c.oid, 'update')
         or has_table_privilege('hc_admin', c.oid, 'delete'))), 0,
  'CI-1: hc_admin holds NO privilege on any table in public or hc — the boundary is absence, not policy');

select is((
  select count(*)::int
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where n.nspname = 'admin_meta' and a.grantee = 'hc_admin'::regrole::oid
    and d.defaclobjtype = 'r'), 2,
  'future admin_meta relations inherit the hc_admin SELECT by default privilege (both creating roles) — a view added next year is granted, not forgotten');

-- ----------------------------------------------------------------------------
-- 6–11 · The views: exact inventory, hc_internal-owned (the intentional
-- bridge), hc_admin-readable, columns pinned to shapes that CANNOT carry
-- content.
-- ----------------------------------------------------------------------------
select is((
  select coalesce(array_agg(c.relname order by c.relname), '{}'::name[])
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'admin_meta' and c.relkind = 'v'),
  array['circle_shapes','pipeline_health','platform_stats','stage_outcomes']::name[],
  'admin_meta view inventory, exactly (§9.2''s remaining stats land with their machinery — ADR-0009)');

select is((
  select count(*)::int
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'admin_meta' and c.relkind = 'v'
    and c.relowner <> 'hc_internal'::regrole), 0,
  'every admin_meta view is owned by hc_internal — the privilege bridge is the named one, reviewed as such (§3.9)');

select is((
  select count(*)::int
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'admin_meta' and c.relkind = 'v'
    and not has_table_privilege('hc_admin', c.oid, 'select')), 0,
  'hc_admin reads every admin_meta view');

select is((
  select array_agg(a.attname::text order by a.attnum)
  from pg_attribute a
  where a.attrelid = to_regclass('admin_meta.circle_shapes')
    and a.attnum > 0 and not a.attisdropped),
  array['circle_id','state','created_at','subject_count','members_by_tier',
        'arrival_count','last_activity_at'],
  'circle_shapes: opaque id, enumerated state, dates and counts — the §9.2 circle-management shape, nothing else');

select is((
  select array_agg(a.attname::text order by a.attnum)
  from pg_attribute a
  where a.attrelid = to_regclass('admin_meta.platform_stats')
    and a.attnum > 0 and not a.attisdropped),
  array['circles_total','circles_last_30d','subjects_total','members_by_tier',
        'arrivals_by_channel','arrivals_by_state','approvals_total',
        'denials_total','active_members_30d'],
  'platform_stats: counts and enumerated breakdowns only');

select is((
  (select array_agg(a.attname::text order by a.attnum)
   from pg_attribute a
   where a.attrelid = to_regclass('admin_meta.pipeline_health')
     and a.attnum > 0 and not a.attisdropped)
  || (select array_agg(a.attname::text order by a.attnum)
      from pg_attribute a
      where a.attrelid = to_regclass('admin_meta.stage_outcomes')
        and a.attnum > 0 and not a.attisdropped)),
  array['state','arrivals','oldest_received_at','reason_code','events'],
  'pipeline_health + stage_outcomes: states, counts, ages, and the FIXED reason-code enumeration — never a raw provider string (§2.4)');

-- ----------------------------------------------------------------------------
-- 12–15 · CI-2 and CI-3: the transitive dependency walk, with probes
-- proving the walk actually catches what it claims to catch.
-- ----------------------------------------------------------------------------
create function pg_temp.forbidden_reached() returns int language sql as $$
  with recursive rels(oid) as (
      select c.oid
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'admin_meta' and c.relkind = 'v'
    union
      select d.refobjid
      from rels r
      join pg_rewrite rw on rw.ev_class = r.oid
      join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid
                      and d.refclassid = 'pg_class'::regclass
      join pg_class c2 on c2.oid = d.refobjid and c2.relkind = 'v'
  ),
  refs as (
    select d.refobjid, d.refobjsubid
    from rels r
    join pg_rewrite rw on rw.ev_class = r.oid
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid
                    and d.refclassid = 'pg_class'::regclass
  )
  select count(*)::int from refs
  where
    -- the seven content tables: ANY reference at all (column, whole-row
    -- via to_jsonb, or the relation itself) is forbidden
    refs.refobjid in ('public.documents'::regclass, 'public.tasks'::regclass,
                      'public.timeline_events'::regclass, 'public.profile_facts'::regclass,
                      'public.extractions'::regclass, 'public.proposals'::regclass,
                      'public.episodes'::regclass,
                      'public.document_search_content'::regclass)
    -- the mixed tables: the named content columns
    or exists (
      select 1 from pg_attribute a
      where a.attrelid = refs.refobjid and a.attnum = refs.refobjsubid
        and a.attnum > 0 and not a.attisdropped
        and ((a.attrelid = 'public.subjects'::regclass
              and a.attname = 'first_name')
          or (a.attrelid = 'public.arrivals'::regclass
              and a.attname in ('sender_address','sender_display_name',
                                'auth_detail','message_id'))
          or (a.attrelid = 'public.circles'::regclass
              and a.attname in ('name','opening_context'))
          or (a.attrelid = 'public.invites'::regclass
              and a.attname in ('token_hash','invited_email','note'))
          or (a.attrelid = 'public.access_log'::regclass
              and a.attname in ('detail','actor_display_name'))))
$$;

create function pg_temp.our_functions_reached() returns int language sql as $$
  with recursive rels(oid) as (
      select c.oid
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'admin_meta' and c.relkind = 'v'
    union
      select d.refobjid
      from rels r
      join pg_rewrite rw on rw.ev_class = r.oid
      join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid
                      and d.refclassid = 'pg_class'::regclass
      join pg_class c2 on c2.oid = d.refobjid and c2.relkind = 'v'
  )
  select count(*)::int
  from rels r
  join pg_rewrite rw on rw.ev_class = r.oid
  join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid
                  and d.refclassid = 'pg_proc'::regclass
  join pg_proc p on p.oid = d.refobjid
  join pg_namespace pn on pn.oid = p.pronamespace
  where pn.nspname in ('hc', 'public', 'admin_meta', 'admin_ops')
$$;

select is(pg_temp.forbidden_reached(), 0,
  'CI-2: transitively through nested views, NO admin_meta view reaches a content column — or the content tables at all');

-- the probe: a derived form (length(title)) still registers the COLUMN
-- dependency, and the admin_meta wrapper reaches it only THROUGH a nested
-- view in another schema — so a hit proves both the column test and the
-- recursion.
do $$
begin
  execute 'create view public.zz_probe as
             select length(d.title) as tlen from public.documents d';
  execute 'create view admin_meta.zz_nested as select * from public.zz_probe';
end $$;

select ok(pg_temp.forbidden_reached() >= 1,
  'CI-2 control: an admin_meta wrapper of a nested public view exposing only length(title) is caught — the walk recurses and rejects the column, whatever the result type');

do $$
begin
  execute 'drop view admin_meta.zz_nested';
  execute 'drop view public.zz_probe';
end $$;

select is(pg_temp.our_functions_reached(), 0,
  'CI-3: no function of ours is reachable from any admin_meta view — function indirection cannot walk through CI-2');

do $$
begin
  if (select count(*) from pg_namespace where nspname = 'admin_meta') = 1 then
    execute 'create view admin_meta.zz_fnprobe as
               select p.id from hc.presence(null) p';
  end if;
end $$;

select ok(pg_temp.our_functions_reached() >= 1,
  'CI-3 control: a probe view calling hc.presence() is caught');

do $$
begin
  if to_regclass('admin_meta.zz_fnprobe') is not null then
    execute 'drop view admin_meta.zz_fnprobe';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 16–17 · CI-4: EXECUTE on nothing; admin_ops empty until ADM-01.
-- ----------------------------------------------------------------------------
select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('hc', 'public', 'admin_meta', 'admin_ops')
    -- extension-owned functions (this file's own pgtap install) are not
    -- ours and carry PUBLIC execute by their packaging
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                      and d.refclassid = 'pg_extension'::regclass
                      and d.deptype = 'e')
    and has_function_privilege('hc_admin', p.oid, 'execute')), 0,
  'CI-4: hc_admin holds EXECUTE on nothing of OURS — admin_ops entry points are granted individually when ADM-01 lands');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'admin_ops'), 0,
  'admin_ops holds ZERO functions — every §9.3 wrapper needs the auth slice''s step-up machinery (ADM-01, ADR-0009)');

-- ----------------------------------------------------------------------------
-- 18–20 · A.1: the distinguished failure mode on the 1D surfaces —
-- permission denied, never zero rows.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('hc_admin', $$ select * from public.document_search_content $$),
  '42501', 'hc_admin on dsc: permission denied — no policy consulted (A.1)');

select is(pg_temp.errcode_as('hc_admin', $$ select * from public.access_log $$),
  '42501', 'hc_admin on access_log: permission denied — the family''s log is the family''s (A.1)');

select is(pg_temp.errcode_as('hc_admin', $$ select * from public.arrivals $$),
  '42501', 'hc_admin on arrivals: permission denied — filenames and senders have no admin path (A.1)');

-- ----------------------------------------------------------------------------
-- 21–23 · The views work, and say only what §9.2 permits.
-- ----------------------------------------------------------------------------
select is(pg_temp.admin_scalar(format(
  $$ select subject_count::text || ':' || arrival_count::text
         || ':' || (members_by_tier ->> 'coordinator')
     from admin_meta.circle_shapes where circle_id = %L $$,
  current_setting('t.c1'))), '2:3:1',
  'circle_shapes: the fixture circle renders as counts — two subjects, three arrivals, one coordinator');

select is(pg_temp.admin_scalar(
  $$ select (arrivals_by_channel ->> 'upload') || ':' || (arrivals_by_channel ->> 'email')
         || ':' || denials_total::text
     from admin_meta.platform_stats $$), '2:1:2',
  'platform_stats: channels count 2 uploads + 1 email; denials_total counts the COLLAPSED total (2), not the single row');

select is((
  select count(*)::int
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'admin_meta' and c.relkind = 'v'
    and a.attnum > 0 and not a.attisdropped
    and a.attname ~* 'sender|title|email|first_name|display_name|summary|detail|note|filename'), 0,
  'no admin_meta column NAME even suggests content — the sender of the email arrival is structurally unreachable (§9.2 costume cases)');

select * from finish();
rollback;
