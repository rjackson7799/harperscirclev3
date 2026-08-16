-- ============================================================================
-- 1B · U2 — the record: episodes, documents, document_search_content, tasks,
-- timeline_events, profile_facts (TSD §2.5, §2.7) and their §3.4 read
-- policies. RLS-06: the Appendix A.1 five per-domain negative cases against
-- record tables, plus the five hc_admin permission-denied variants.
--
-- Fixtures are written directly as postgres: the ONLY write path for these
-- tables (hc.approve_proposal(), M6) does not exist yet, and when it does,
-- request-path write privilege remains absent — which is exactly what the
-- closure probes here assert. document_search_content carries ZERO grants
-- for every role including hc_internal until 1D (fail-closed staging).
--
-- RED (U2): tables absent — has_table ×6 fail, catalog sweeps count 0
-- conforming columns, every probe reports 42P01 where its code is expected.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(53);

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

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
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

-- Run one read as an authenticated user and return its scalar result.
-- The role switch lives INSIDE the helper: pg_temp functions are never
-- called while the session role is authenticated (this image segfaults on
-- ACL-denied function calls — ADR-0004 R2 / PLT-04; probes run as postgres).
create function pg_temp.read_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

-- Replace one member's grant set from a {domain: level} spec; absent = hidden.
create function pg_temp.regrant(p_circle uuid, p_member uuid, p_subject uuid,
                                p_by uuid, p_spec jsonb) returns void
language plpgsql as $$
declare d text; l text;
begin
  delete from public.access_grants
    where circle_id = p_circle and member_id = p_member and subject_id = p_subject;
  for d, l in select key, value from jsonb_each_text(p_spec) loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (p_circle, p_member, p_subject, d::hc.domain, l::hc.access_level, p_by);
  end loop;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- approver identity
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- the A.1 probe member
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- second-circle member
  c1 uuid; c2 uuid; s1 uuid; s2 uuid; m1 uuid; m2 uuid; mo2 uuid;
  a1 uuid := gen_random_uuid();
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Dan');
  insert into public.circles (name, created_by) values ('Record circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Other circle', u3)
    returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'rec1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'assisted living', '98101', 'America/Los_Angeles', 'clay',
          'rec2-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u3, 'coordinator', 'Dan') returning id into mo2;

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s2', s2::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.mo2', mo2::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.doc_legal', gen_random_uuid()::text, true);
  perform set_config('t.doc_med',   gen_random_uuid()::text, true);
  perform set_config('t.doc_del',   gen_random_uuid()::text, true);
  perform set_config('t.task_fin',  gen_random_uuid()::text, true);
  perform set_config('t.task_sched',gen_random_uuid()::text, true);
  perform set_config('t.tl_health', gen_random_uuid()::text, true);
  perform set_config('t.tl_mem',    gen_random_uuid()::text, true);
  perform set_config('t.ep1',       gen_random_uuid()::text, true);
  perform set_config('t.pf1',       gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · The tables exist.
-- ----------------------------------------------------------------------------
select has_table('public', 'episodes',                'episodes exists (§2.5)');
select has_table('public', 'documents',               'documents exists (§2.5)');
select has_table('public', 'document_search_content', 'document_search_content exists (§2.5)');
select has_table('public', 'tasks',                   'tasks exists (§2.5)');
select has_table('public', 'timeline_events',         'timeline_events exists (§2.5)');
select has_table('public', 'profile_facts',           'profile_facts exists (§2.5)');

-- ----------------------------------------------------------------------------
-- 7–8 · The shared block, mechanically: tenancy + provenance + taint columns
-- NOT NULL on all five record tables; approved_* carry NO default (§2.5 —
-- "there is no code path that can omit them").
-- ----------------------------------------------------------------------------
select is((
  select count(*)::int
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('documents','tasks','timeline_events','profile_facts','episodes')
    and a.attname in ('circle_id','subject_id','approved_by','approved_at',
                      'approver_display_name','taint','taint_resolved')
    and a.attnotnull and not a.attisdropped
), 35, 'the shared tenancy/provenance/taint block is NOT NULL on all five record tables (5×7)');

select is((
  select count(*)::int
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('documents','tasks','timeline_events','profile_facts','episodes')
    and a.attname in ('approved_by','approved_at','approver_display_name')
    and a.attnotnull and not a.atthasdef and not a.attisdropped
), 15, 'approved_by / approved_at / approver_display_name: NOT NULL with NO default (5×3)');

-- ----------------------------------------------------------------------------
-- Record fixtures (as postgres — see header).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.arrivals (id, circle_id, subject_id, channel)
     values (%L, %L, %L, 'upload') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'))),
  'no_error', 'fixture arrival accepted (artifact anchor for documents)');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.documents
       (id, circle_id, subject_id, title, category, summary_text,
        artifact_arrival_id, filed_at, approved_by, approved_at,
        approver_display_name, taint)
     values
       (%L, %L, %L, 'Power of attorney', 'legal', 'POA on file.',
        %L, now(), %L, now(), 'Sarah', '{documents}'),
       (%L, %L, %L, 'Discharge summary', 'medical', 'Home with follow-up.',
        %L, now(), %L, now(), 'Sarah', '{health}'),
       (%L, %L, %L, 'Old referral', 'medical', 'Superseded referral.',
        %L, now(), %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.doc_legal'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.a1'), current_setting('t.u1'),
  current_setting('t.doc_med'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.a1'), current_setting('t.u1'),
  current_setting('t.doc_del'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.a1'), current_setting('t.u1'))),
  'no_error', 'fixture documents accepted (legal / medical / to-delete)');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.tasks
       (id, circle_id, subject_id, title, due_on, due_zone,
        approved_by, approved_at, approver_display_name, taint)
     values
       (%L, %L, %L, 'Pay the invoice',    '2026-09-01', 'America/New_York',
        %L, now(), 'Sarah', '{schedule,finances}'),
       (%L, %L, %L, 'Pharmacy pickup',    '2026-09-01', 'America/New_York',
        %L, now(), 'Sarah', '{schedule}') $$,
  current_setting('t.task_fin'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1'),
  current_setting('t.task_sched'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1'))),
  'no_error', 'fixture tasks accepted (invoice-derived / plain schedule)');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.episodes
       (id, circle_id, subject_id, title,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, %L, 'Hospital stay', %L, now(), 'Sarah', '{memories}') $$,
  current_setting('t.ep1'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1'))),
  'no_error', 'fixture episode accepted');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.timeline_events
       (id, circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
        approved_by, approved_at, approver_display_name, taint)
     values
       (%L, %L, %L, 'medical', 'Follow-up scheduled', '2026-08-20', 'America/New_York',
        %L, now(), 'Sarah', '{health}'),
       (%L, %L, %L, 'memory', 'Garden afternoon', '2026-08-10', 'America/New_York',
        %L, now(), 'Sarah', '{memories}') $$,
  current_setting('t.tl_health'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1'),
  current_setting('t.tl_mem'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1'))),
  'no_error', 'fixture timeline events accepted (medical / memory)');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.profile_facts
       (id, circle_id, subject_id, field, value, risk_class,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, %L, 'medications', '"metoprolol 50mg"', 'high',
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.pf1'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1'))),
  'no_error', 'fixture profile fact accepted');

-- ----------------------------------------------------------------------------
-- 15–18 · document_search_content: circle AND subject consistent, cascade.
-- ----------------------------------------------------------------------------
select fk_ok('public', 'document_search_content',
             array['circle_id','subject_id','document_id'],
             'public', 'documents',
             array['circle_id','subject_id','id'],
  'dsc → documents pins circle AND subject — a row cannot claim a different subject (§2.5)');

select is(pg_temp.errcode_as('postgres', format(
  $$ insert into public.document_search_content
       (document_id, circle_id, subject_id, extracted_text)
     values (%L, %L, %L, 'extracted body text') $$,
  current_setting('t.doc_del'), current_setting('t.c1'), current_setting('t.s1'))),
  'no_error', 'a consistent dsc row is accepted (as postgres — no role holds the privilege)');

select is(pg_temp.errcode_as('postgres', format(
  $$ delete from public.documents where id = %L $$,
  current_setting('t.doc_del'))),
  'no_error', 'deleting the parent document succeeds');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.document_search_content where document_id = %L $$,
  current_setting('t.doc_del'))), '0',
  'the dsc row followed its document (on delete cascade)');

-- ----------------------------------------------------------------------------
-- 19–22 · profile_facts supersession: silent overwrite has no code path.
-- ----------------------------------------------------------------------------
select index_is_unique('public', 'profile_facts', 'profile_facts_current',
  'one CURRENT value per (subject, field) — profile_facts_current');

select throws_ok(format(
  $$ insert into public.profile_facts
       (circle_id, subject_id, field, value, risk_class,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'medications', '"new value"', 'high',
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  '23505', null,
  'a second CURRENT row for the same field is refused — supersede, never overwrite');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.profile_facts set superseded_at = now() where id = %L $$,
  current_setting('t.pf1'))),
  'no_error', 'the old value is superseded (retained, marked)');

select lives_ok(format(
  $$ insert into public.profile_facts
       (circle_id, subject_id, field, value, risk_class,
        approved_by, approved_at, approver_display_name, taint, supersedes_id)
     values (%L, %L, 'medications', '"metoprolol 25mg"', 'high',
             %L, now(), 'Sarah', '{health}', %L) $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1'),
  current_setting('t.pf1')),
  'the new current value lands once the old row is superseded');

-- ----------------------------------------------------------------------------
-- 23–29 · §2.7 temporal shapes; task checks; circle consistency.
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.timeline_events
       (circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'care', 'Date-only entry', '2026-08-01', 'America/New_York',
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  'temporal: date-only shape accepted');

select lives_ok(format(
  $$ insert into public.timeline_events
       (circle_id, subject_id, kind, summary, local_at, iana_zone, instant,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'medical', 'Appointment entry',
             '2026-09-03 14:00', 'America/New_York', '2026-09-03 18:00+00',
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  'temporal: appointment shape (all three columns) accepted');

select lives_ok(format(
  $$ insert into public.timeline_events
       (circle_id, subject_id, kind, summary, local_at, is_floating,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'care', 'Floating entry', '2026-09-04 09:00', true,
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  'temporal: floating shape (marked, zoneless) accepted');

select throws_ok(format(
  $$ insert into public.timeline_events
       (circle_id, subject_id, kind, summary, occurred_on, local_at,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'care', 'Conflated shapes', '2026-08-01', '2026-08-01 10:00',
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  '23514', null,
  'temporal: conflating date-only with a timestamp is refused (temporal_shape)');

select throws_ok(format(
  $$ insert into public.tasks
       (circle_id, subject_id, title, due_on,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'Zoneless due date', '2026-09-01',
             %L, now(), 'Sarah', '{schedule}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  '23514', null,
  'a due date without the subject''s zone is refused (§2.5 check)');

select throws_ok(format(
  $$ insert into public.tasks
       (circle_id, subject_id, title, status,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'Bad status', 'someday',
             %L, now(), 'Sarah', '{schedule}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1')),
  '23514', null,
  'tasks.status is the closed list');

select throws_ok(format(
  $$ insert into public.tasks
       (circle_id, subject_id, title, owner_member_id,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'Cross-circle owner', %L,
             %L, now(), 'Sarah', '{schedule}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.mo2'),
  current_setting('t.u1')),
  '23503', null,
  'a task''s owner must be a member of the task''s OWN circle (composite FK)');

select throws_ok(format(
  $$ insert into public.timeline_events
       (circle_id, subject_id, kind, summary, occurred_on, occurred_zone, episode_id,
        approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'care', 'Cross-circle episode', '2026-08-01', 'America/Los_Angeles', %L,
             %L, now(), 'Sarah', '{health}') $$,
  current_setting('t.c2'), current_setting('t.s2'), current_setting('t.ep1'),
  current_setting('t.u1')),
  '23503', null,
  'an event cannot join another circle''s episode (composite FK)');

-- ----------------------------------------------------------------------------
-- 30–38 · RLS-06 — Appendix A.1, the five per-domain negatives (G2), each
-- with its distinguishing control. u2's grants are rebuilt per case.
-- ----------------------------------------------------------------------------

-- A.1 case 1 · Finances withheld: the invoice-derived task does not exist.
select pg_temp.regrant(current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
  current_setting('t.s1')::uuid, current_setting('t.u1')::uuid,
  '{"memories":"manage","health":"manage","schedule":"manage","documents":"manage"}');
select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.tasks where id = %L $$,
  current_setting('t.task_fin'))), '0',
  'A.1 finances: the schedule task derived from an invoice returns zero rows');
select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.tasks where id = %L $$,
  current_setting('t.task_sched'))), '1',
  'A.1 finances control: the plain schedule task IS visible — the zero above is the taint, not a broken config');

-- A.1 case 2 · Health at summary: the timeline row returns BY DESIGN; the
-- paired halves (extractions, artifact) are 1C/HTTP pending rows.
select pg_temp.regrant(current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
  current_setting('t.s1')::uuid, current_setting('t.u1')::uuid,
  '{"memories":"summary","health":"summary","schedule":"summary","documents":"summary","finances":"summary"}');
select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.timeline_events where id = %L $$,
  current_setting('t.tl_health'))), '1',
  'A.1 health: the discharge-derived event IS readable at summary — by design (PRD §7.3)');
select is(pg_temp.read_as(current_setting('t.u2')::uuid,
  'select count(*)::text from public.profile_facts'), '0',
  'A.1 health, the view boundary: profile_facts returns nothing at summary (§3.4 level→table map)');

-- A.1 case 3 · Documents withheld: a hand-carried id resolves to nothing.
select pg_temp.regrant(current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
  current_setting('t.s1')::uuid, current_setting('t.u1')::uuid,
  '{"memories":"manage","health":"manage","schedule":"manage","finances":"manage"}');
select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.doc_legal'))), '0',
  'A.1 documents: the legal document does not exist for a caller lacking the domain');
select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.doc_med'))), '1',
  'A.1 documents control: the medical document (health taint) IS visible');

-- A.1 case 4 · Schedule withheld: the count is 0, never "0 of 2".
select pg_temp.regrant(current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
  current_setting('t.s1')::uuid, current_setting('t.u1')::uuid,
  '{"memories":"manage","health":"manage","documents":"manage","finances":"manage"}');
select is(pg_temp.read_as(current_setting('t.u2')::uuid,
  $$ select count(*)::text from public.tasks where due_on = '2026-09-01' $$), '0',
  'A.1 schedule: counts are post-filter — 0, with two matching tasks in the table');

-- A.1 case 5 · Memories withheld: the domain is live from day one.
select pg_temp.regrant(current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
  current_setting('t.s1')::uuid, current_setting('t.u1')::uuid,
  '{"health":"manage","schedule":"manage","documents":"manage","finances":"manage"}');
select is(pg_temp.read_as(current_setting('t.u2')::uuid,
  $$ select count(*)::text from public.timeline_events where kind = 'memory' $$), '0',
  'A.1 memories: memory events return zero rows (Phase-1 model, Phase-3 surface)');

-- deleted_at: a soft-deleted row leaves every read path.
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set deleted_at = now() where id = %L $$,
  current_setting('t.doc_med'))),
  'no_error', 'soft-delete the medical document');
select pg_temp.regrant(current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
  current_setting('t.s1')::uuid, current_setting('t.u1')::uuid,
  '{"memories":"manage","health":"manage","schedule":"manage","documents":"manage","finances":"manage"}');
select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.doc_med'))), '0',
  'a soft-deleted document is gone from the read path (deleted_at pre-filter)');

-- ----------------------------------------------------------------------------
-- 39–43 · The same five, against hc_admin: permission denied for table —
-- the privilege is absent, no policy is consulted (A.1, AC-ADMIN-1).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('hc_admin', 'select * from public.documents'), '42501',
  'hc_admin: permission denied for documents');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.tasks'), '42501',
  'hc_admin: permission denied for tasks');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.timeline_events'), '42501',
  'hc_admin: permission denied for timeline_events');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.profile_facts'), '42501',
  'hc_admin: permission denied for profile_facts');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.episodes'), '42501',
  'hc_admin: permission denied for episodes');

-- ----------------------------------------------------------------------------
-- 44–48 · document_search_content: ZERO reach for every role until 1D.
-- Write paths revoked is the 1B invariant; reads are staged with them.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated',
  $$ select * from public.document_search_content $$), '42501',
  'dsc: authenticated cannot even select until 1D lands the view-level policy');
select is(pg_temp.errcode_as('authenticated',
  $$ insert into public.document_search_content (document_id, circle_id, subject_id)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$), '42501',
  'dsc: authenticated cannot insert');
select is(pg_temp.errcode_as('hc_pipeline',
  $$ insert into public.document_search_content (document_id, circle_id, subject_id)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$), '42501',
  'dsc: hc_pipeline cannot insert — extraction lands its text only through 1D''s allowlisted writer');
select is(pg_temp.errcode_as('hc_admin',
  $$ update public.document_search_content set extracted_text = 'x' $$), '42501',
  'dsc: hc_admin cannot update');
select ok(coalesce(
      not has_table_privilege('hc_internal', to_regclass('public.document_search_content'), 'select')
  and not has_table_privilege('hc_internal', to_regclass('public.document_search_content'), 'insert')
  and not has_table_privilege('hc_internal', to_regclass('public.document_search_content'), 'update')
  and not has_table_privilege('hc_internal', to_regclass('public.document_search_content'), 'delete'),
  false),
  'dsc: hc_internal holds NOTHING — the writer allowlist for this table is empty until 1D');

-- ----------------------------------------------------------------------------
-- 49–51 · Record-table write closure for request-path roles (§3.7 begins).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated',
  $$ insert into public.documents (circle_id, subject_id, title, category,
                                   artifact_arrival_id, filed_at, approved_by,
                                   approved_at, approver_display_name, taint)
     values (gen_random_uuid(), gen_random_uuid(), 'forged', 'legal',
             gen_random_uuid(), now(), gen_random_uuid(), now(), 'x', '{documents}') $$),
  '42501', 'authenticated cannot INSERT documents — the privilege does not exist');
select is(pg_temp.errcode_as('authenticated',
  $$ update public.tasks set title = 'renamed' $$), '42501',
  'authenticated cannot UPDATE tasks');
select is(pg_temp.errcode_as('authenticated',
  $$ delete from public.timeline_events $$), '42501',
  'authenticated cannot DELETE timeline_events — deletion is an update nobody request-path can make');

select * from finish();
rollback;
