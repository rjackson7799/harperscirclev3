-- ============================================================================
-- 1B · U4 — hc.guard_row() (TSD §3.7): provenance immutable; taint never
-- shrinks; the reclassify marker is row-scoped; false→true taint_resolved
-- only under the marker. Attached BEFORE UPDATE to the five record tables
-- AND proposals.
--
-- Probes run as postgres: triggers fire regardless of role or RLS, which is
-- the point — the guard is the invariant, not the privilege map (§3.7: the
-- marker is not itself the control; no request-path role holds UPDATE at
-- all, and this trigger binds even the roles that do).
--
-- RED (U4): the trigger does not exist — every refusal probe reports
-- no_error where 42501 is demanded, and the trigger inventory is empty.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(17);

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
  c1 uuid; s1 uuid; a1 uuid := gen_random_uuid();
  doc1 uuid := gen_random_uuid(); doc2 uuid := gen_random_uuid();
  task1 uuid := gen_random_uuid(); task2 uuid := gen_random_uuid();
  tl1 uuid := gen_random_uuid(); ep1 uuid := gen_random_uuid();
  pf1 uuid := gen_random_uuid(); prop1 uuid := gen_random_uuid();
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Guard circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'grd-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');

  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at,
    approver_display_name, taint)
  values (doc1, c1, s1, 'Deed', 'legal', a1, now(), u1, now(), 'Sarah', '{documents}'),
         (doc2, c1, s1, 'Statement', 'financial', a1, now(), u1, now(), 'Sarah', '{finances}');
  insert into public.tasks (id, circle_id, subject_id, title,
    approved_by, approved_at, approver_display_name, taint)
  values (task1, c1, s1, 'Pay invoice', u1, now(), 'Sarah', '{schedule,finances}'),
         (task2, c1, s1, 'File form',   u1, now(), 'Sarah', '{schedule,finances}');
  insert into public.timeline_events (id, circle_id, subject_id, kind, summary,
    occurred_on, occurred_zone, approved_by, approved_at, approver_display_name, taint)
  values (tl1, c1, s1, 'care', 'Visit', '2026-08-01', 'America/New_York',
          u1, now(), 'Sarah', '{health}');
  insert into public.episodes (id, circle_id, subject_id, title,
    approved_by, approved_at, approver_display_name, taint)
  values (ep1, c1, s1, 'Stay', u1, now(), 'Sarah', '{memories}');
  insert into public.profile_facts (id, circle_id, subject_id, field, value,
    risk_class, approved_by, approved_at, approver_display_name, taint)
  values (pf1, c1, s1, 'allergies', '"penicillin"', 'high',
          u1, now(), 'Sarah', '{health}');
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind,
    payload, taint)
  values (prop1, a1, c1, s1, 'task', '{"title":"t"}', '{schedule,finances}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.doc1', doc1::text, true);
  perform set_config('t.doc2', doc2::text, true);
  perform set_config('t.task1', task1::text, true);
  perform set_config('t.task2', task2::text, true);
  perform set_config('t.tl1', tl1::text, true);
  perform set_config('t.ep1', ep1::text, true);
  perform set_config('t.pf1', pf1::text, true);
  perform set_config('t.prop1', prop1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · The provenance quartet on documents, column by column (N2: Sarah's
-- approval cannot be turned into Dan's by an edit).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set approved_by = %L where id = %L $$,
  gen_random_uuid(), current_setting('t.doc1'))), '42501',
  'approved_by is immutable');
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set approved_at = now() + interval '1 hour' where id = %L $$,
  current_setting('t.doc1'))), '42501',
  'approved_at is immutable');
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set approver_display_name = 'Dan' where id = %L $$,
  current_setting('t.doc1'))), '42501',
  'approver_display_name is immutable');
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set source_arrival_id = %L where id = %L $$,
  gen_random_uuid(), current_setting('t.doc1'))), '42501',
  'source_arrival_id is immutable — the citation cannot be repointed');

-- ----------------------------------------------------------------------------
-- 5 · The same quartet swept across the other four record tables.
-- ----------------------------------------------------------------------------
select is((
  select coalesce(string_agg(t.tbl || '.' || t.col || '=' || t.code, ', '
                             order by t.tbl, t.col), 'all refused')
  from (
    select v.tbl, col,
           pg_temp.errcode_as('postgres', format(
             'update public.%I set %I = %s where id = %L',
             v.tbl, col,
             case col when 'approved_at' then 'now() + interval ''1 hour'''
                      when 'approver_display_name' then '''Dan'''
                      else quote_literal(gen_random_uuid()::text) || '::uuid' end,
             current_setting(v.fx))) as code
    from (values ('tasks','t.task1'), ('timeline_events','t.tl1'),
                 ('episodes','t.ep1'), ('profile_facts','t.pf1')) v(tbl, fx),
         unnest(array['approved_by','approved_at',
                      'approver_display_name','source_arrival_id']) col
  ) t
  where t.code <> '42501'
), 'all refused',
  'the quartet is immutable on tasks, timeline_events, episodes, profile_facts (16 probes)');

-- ----------------------------------------------------------------------------
-- 6–8 · Taint: never shrinks by itself; growth is ordinary.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.tasks set taint = '{schedule}' where id = %L $$,
  current_setting('t.task1'))), '42501',
  'a direct taint shrink raises 42501 (PRD §7.6) — the §3.13 regression');

select is((
  select coalesce(string_agg(t.tbl || '=' || t.code, ', ' order by t.tbl), 'all refused')
  from (
    select v.tbl,
           pg_temp.errcode_as('postgres', format(
             'update public.%I set taint = ''{}''::hc.domain[] where id = %L',
             v.tbl, current_setting(v.fx))) as code
    from (values ('documents','t.doc1'), ('tasks','t.task2'),
                 ('timeline_events','t.tl1'), ('episodes','t.ep1'),
                 ('profile_facts','t.pf1')) v(tbl, fx)
  ) t
  where t.code <> '42501'
), 'all refused',
  'emptying taint is refused on every record table');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.tasks set taint = '{schedule,finances,health}' where id = %L $$,
  current_setting('t.task1'))), 'no_error',
  'taint GROWTH is the ordinary path — the guard binds one direction only');

-- ----------------------------------------------------------------------------
-- 9–10 · The marker is row-scoped: another row''s id opens nothing.
-- ----------------------------------------------------------------------------
select set_config('hc.reclassifying', current_setting('t.task1'), true);
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.tasks set taint = '{schedule}' where id = %L $$,
  current_setting('t.task2'))), '42501',
  'a marker naming ANOTHER row does not open this one (row-scoped, §3.7)');

select set_config('hc.reclassifying', current_setting('t.task2'), true);
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.tasks set taint = '{schedule}' where id = %L $$,
  current_setting('t.task2'))), 'no_error',
  'the row''s own marker admits the one legitimate shrink path');
select set_config('hc.reclassifying', '', true);

-- ----------------------------------------------------------------------------
-- 11–13 · taint_resolved: true→false is ordinary (fail-closed direction);
-- false→true only under the marker (validated recomputation).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set taint_resolved = false where id = %L $$,
  current_setting('t.doc2'))), 'no_error',
  'true→false is not the dangerous direction — marking fail-closed is always allowed');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set taint_resolved = true where id = %L $$,
  current_setting('t.doc2'))), '42501',
  'false→true without the marker is refused — fail-closed may not be waved away');

select set_config('hc.reclassifying', current_setting('t.doc2'), true);
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set taint_resolved = true where id = %L $$,
  current_setting('t.doc2'))), 'no_error',
  'a completed recomputation (the marker) may clear fail-closed');
select set_config('hc.reclassifying', '', true);

-- ----------------------------------------------------------------------------
-- 14–15 · proposals carry the guard too (§3.7: "and to proposals") — taint
-- rules bind; columns the table does not have are simply not guarded.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.proposals set taint = '{schedule}' where id = %L $$,
  current_setting('t.prop1'))), '42501',
  'a proposal''s taint may not shrink either — the review screen shows what the write will carry');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.proposals set status = 'void' where id = %L $$,
  current_setting('t.prop1'))), 'no_error',
  'non-guarded proposal columns update normally through the guard');

-- ----------------------------------------------------------------------------
-- 16 · Ordinary content edits pass: the guard guards its columns, nothing else.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set title = 'Deed (updated)' where id = %L $$,
  current_setting('t.doc1'))), 'no_error',
  'content columns edit normally — a manual edit changes title and leaves taint exactly as it was');

-- ----------------------------------------------------------------------------
-- 17 · The trigger inventory, exactly: hc_guard_* BEFORE UPDATE on the five
-- record tables and proposals; nothing else user-defined on any of them.
-- ----------------------------------------------------------------------------
select is((
  select coalesce(array_agg(c.relname || ':' || t.tgname order by c.relname, t.tgname), '{}'::text[])
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and c.relname in ('documents','tasks','timeline_events','profile_facts',
                      'episodes','proposals','document_search_content')
), array['documents:hc_claim_documents',
         'documents:hc_guard_documents',
         'episodes:hc_claim_episodes',
         'episodes:hc_guard_episodes',
         'profile_facts:hc_claim_profile_facts',
         'profile_facts:hc_guard_profile_facts',
         'proposals:hc_guard_proposals',
         'tasks:hc_claim_tasks',
         'tasks:hc_guard_tasks',
         'timeline_events:hc_claim_timeline_events',
         'timeline_events:hc_guard_timeline_events'],
  'trigger inventory: one guard per guarded table + one claim trigger per record table; dsc carries none');

select * from finish();
rollback;
