-- ============================================================================
-- 1B · U1 — the four §2.4 prerequisite tables pulled forward by ADR-0005 D1:
-- arrivals, proposals, approval_attempts, proposal_commits.
--
-- Shape assertions are §2.4 DDL verbatim plus the §2.1 conventions 1A applied
-- everywhere (circle-consistent composite FKs, unique (circle_id, id)).
-- Closure assertions: the four tables are FAIL-CLOSED in 1B — zero
-- request-path privileges, zero request-path policies; their §3.4 read
-- policies land in 1C (pending coverage rows). Constraint probes run as
-- postgres (the documented maintenance exemption; RLS-forced tables, but
-- constraint checks are what is under test).
--
-- RED (U1): every table absent — has_table fails and every probe reports
-- 42P01 (undefined_table) where the named constraint code is expected.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(39);

-- Probe helper: run one statement as another role, return its SQLSTATE.
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

-- Abort-safe scalar probe: dynamic execution, so a missing relation reports
-- as a failed assertion instead of aborting the whole file's transaction.
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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s2 uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Ingest one', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Ingest two', u1) returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'ing1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '02139', 'America/Chicago', 'clay',
          'ing2-' || substr(c2::text, 1, 8)) returning id into s2;
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s2', s2::text, true);
  perform set_config('t.a1', gen_random_uuid()::text, true);
  perform set_config('t.a2', gen_random_uuid()::text, true);
  perform set_config('t.p1', gen_random_uuid()::text, true);
  perform set_config('t.psup', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · The tables exist.
-- ----------------------------------------------------------------------------
select has_table('public', 'arrivals',          'arrivals exists (ADR-0005 D1)');
select has_table('public', 'proposals',         'proposals exists (ADR-0005 D1)');
select has_table('public', 'approval_attempts', 'approval_attempts exists (ADR-0005 D1)');
select has_table('public', 'proposal_commits',  'proposal_commits exists (ADR-0005 D1)');

-- ----------------------------------------------------------------------------
-- 5–8 · arrivals shape (§2.4).
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.arrivals (id, circle_id, subject_id, channel, ingest_idempotency_key)
     values (%L, %L, %L, 'upload', 'dup-key') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  'an arrival row is accepted with the minimal §2.4 shape');

select is(
  pg_temp.scalar(format(
    $$ select state::text from public.arrivals where id = %L $$,
    current_setting('t.a1'))),
  'received',
  'arrivals.state defaults to received');

select throws_ok(format(
  $$ insert into public.arrivals (circle_id, subject_id, channel)
     values (%L, %L, 'sms') $$,
  current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'channel is upload|email — sms is an enum value away, not a silent accept');

select throws_ok(format(
  $$ insert into public.arrivals (circle_id, subject_id, channel, ingest_idempotency_key)
     values (%L, %L, 'upload', 'dup-key') $$,
  current_setting('t.c1'), current_setting('t.s1')),
  '23505', null,
  'ingest idempotency is unique per circle');

-- second-circle arrival for the cross-circle probes below
select lives_ok(format(
  $$ insert into public.arrivals (id, circle_id, subject_id, channel)
     values (%L, %L, %L, 'upload') $$,
  current_setting('t.a2'), current_setting('t.c2'), current_setting('t.s2')),
  'a second-circle arrival is accepted (cross-circle fixture)');

-- ----------------------------------------------------------------------------
-- 10–16 · proposals shape (§2.4): the decision checks, the one-live index,
-- circle consistency.
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint, status)
     values (%L, %L, %L, 'task', '{}', '{schedule}', 'bogus') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'proposals.status is the closed §2.4 list');

select throws_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint, status)
     values (%L, %L, %L, 'task', '{}', '{schedule}', 'approved') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'a human decision has a human actor: approved with no decided_by is refused');

select throws_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint,
                                   status, decided_by)
     values (%L, %L, %L, 'task', '{}', '{schedule}', 'rejected', %L) $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.u1')),
  '23514', null,
  'decided_by and decided_at travel together');

select throws_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint,
                                   reject_reason)
     values (%L, %L, %L, 'task', '{}', '{schedule}', 'wrong') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'a reject_reason without a rejected status is refused');

select lives_ok(format(
  $$ insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint)
     values (%L, %L, %L, %L, 'task', '{"title":"t"}', '{schedule}') $$,
  current_setting('t.p1'), current_setting('t.a1'),
  current_setting('t.c1'), current_setting('t.s1')),
  'a pending proposal is accepted');

-- Two independent drafts of one kind from one arrival coexist: a discharge
-- summary drafting two tasks is the §4.2.9 design (separate proposals,
-- separate approvals). Each fresh draft is its own lineage root.
select lives_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
     values (%L, %L, %L, 'task', '{"title":"second draft"}', '{schedule}') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  'two independent pending drafts of one kind coexist (distinct lineage roots)');

-- Supersession: the predecessor leaves 'pending' first — while p1 is pending,
-- its lineage key (coalesce → p1) is occupied by p1 itself.
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.proposals set status = 'superseded' where id = %L $$,
  current_setting('t.p1'))), 'no_error',
  'supersession marks the predecessor before the new version arrives');

select lives_ok(format(
  $$ insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint,
                                   version, supersedes_id)
     values (%L, %L, %L, %L, 'task', '{"title":"t2"}', '{schedule}', 2, %L) $$,
  current_setting('t.psup'), current_setting('t.a1'),
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.p1')),
  'the superseding pending proposal is accepted once the predecessor has moved on');

select throws_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint,
                                   version, supersedes_id)
     values (%L, %L, %L, 'task', '{}', '{schedule}', 2, %L) $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'),
  current_setting('t.p1')),
  '23505', null,
  'one live pending head per lineage: a second pending superseder of p1 is refused');

select throws_ok(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
     values (%L, %L, %L, 'document', '{}', '{documents}') $$,
  current_setting('t.a2'), current_setting('t.c1'), current_setting('t.s1')),
  '23503', null,
  'a proposal cannot claim another circle''s arrival (circle-consistent composite FK)');

-- ----------------------------------------------------------------------------
-- 17–18 · approval_attempts: the idempotency anchor.
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.approval_attempts (idempotency_key, proposal_id, expected_version, actor_id)
     values ('idem-1', %L, 1, %L) $$,
  current_setting('t.p1'), current_setting('t.u1')),
  'an approval attempt is recorded against its key');

select throws_ok(format(
  $$ insert into public.approval_attempts (idempotency_key, proposal_id, expected_version, actor_id)
     values ('idem-1', %L, 1, %L) $$,
  current_setting('t.p1'), current_setting('t.u1')),
  '23505', null,
  'the idempotency key is the primary key — exactly one row survives');

-- ----------------------------------------------------------------------------
-- 19–22 · proposal_commits: one proposal ⟷ at most one object, as a table.
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
     values (%L, %L, 'task', '11111111-1111-1111-1111-111111111111') $$,
  current_setting('t.p1'), current_setting('t.c1')),
  'a claim is accepted for an approved proposal');

select throws_ok(format(
  $$ insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
     values (%L, %L, 'task', '22222222-2222-2222-2222-222222222222') $$,
  current_setting('t.p1'), current_setting('t.c1')),
  '23505', null,
  'ONE object per proposal: a second claim under the same proposal is refused (PK)');

select throws_ok(format(
  $$ insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
     values (%L, %L, 'task', '11111111-1111-1111-1111-111111111111') $$,
  current_setting('t.psup'), current_setting('t.c1')),
  '23505', null,
  'ONE proposal per object: a second proposal claiming the same row is refused');

select throws_ok(format(
  $$ insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
     values (%L, %L, 'task', '33333333-3333-3333-3333-333333333333') $$,
  current_setting('t.psup'), current_setting('t.c2')),
  '23503', null,
  'a claim cannot cross circles (circle-consistent composite FK)');

-- ----------------------------------------------------------------------------
-- 23–35 · FAIL-CLOSED: zero request-path reach until 1C's read policies.
-- The privilege must be ABSENT (42501 before any policy is consulted).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated', 'select * from public.arrivals'), '42501',
  'authenticated cannot select arrivals (1C stages the §3.4 read policy)');
select is(pg_temp.errcode_as('authenticated', 'select * from public.proposals'), '42501',
  'authenticated cannot select proposals');
select is(pg_temp.errcode_as('authenticated', 'select * from public.approval_attempts'), '42501',
  'authenticated cannot select approval_attempts');
select is(pg_temp.errcode_as('authenticated', 'select * from public.proposal_commits'), '42501',
  'authenticated cannot select proposal_commits');

select is(pg_temp.errcode_as('authenticated',
  format($$ insert into public.arrivals (circle_id, subject_id, channel)
            values (%L, %L, 'upload') $$,
         current_setting('t.c1'), current_setting('t.s1'))), '42501',
  'authenticated cannot insert arrivals');
select is(pg_temp.errcode_as('authenticated',
  format($$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
            values (%L, %L, %L, 'task', '{}', '{schedule}') $$,
         current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'))), '42501',
  'authenticated cannot insert proposals');
select is(pg_temp.errcode_as('authenticated',
  $$ insert into public.approval_attempts (idempotency_key, proposal_id, expected_version, actor_id)
     values ('x', gen_random_uuid(), 1, gen_random_uuid()) $$), '42501',
  'authenticated cannot insert approval_attempts');
select is(pg_temp.errcode_as('authenticated',
  $$ insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
     values (gen_random_uuid(), gen_random_uuid(), 'task', gen_random_uuid()) $$), '42501',
  'authenticated cannot insert proposal_commits');

select is(pg_temp.errcode_as('anon', 'select * from public.arrivals'), '42501',
  'anon holds nothing on arrivals');
select is(pg_temp.errcode_as('hc_pipeline', 'select * from public.proposals'), '42501',
  'hc_pipeline holds nothing on proposals until 1C grants its boundary');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.arrivals'), '42501',
  'hc_admin holds nothing on arrivals (AC-ADMIN-1 posture)');
select is(pg_temp.errcode_as('hc_pipeline',
  $$ insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
     values (gen_random_uuid(), gen_random_uuid(), 'task', gen_random_uuid()) $$), '42501',
  'hc_pipeline cannot claim commits — approval is a member act, never a pipeline one');
select is(pg_temp.errcode_as('hc_admin',
  $$ update public.proposals set status = 'void' $$), '42501',
  'hc_admin cannot touch proposals');

-- ----------------------------------------------------------------------------
-- 36 · DELETE is granted to nobody at all on the four tables — including
-- hc_internal (the §3.7 posture extended to the write path's own tables).
-- 1C M1 grants hc_internal select/insert/update on arrivals (the state
-- machine's writer role, ADR-0007); DELETE stays absent everywhere.
-- ----------------------------------------------------------------------------
select ok(coalesce(
      not has_table_privilege('hc_internal', to_regclass('public.arrivals'),          'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.proposals'),         'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.approval_attempts'), 'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.proposal_commits'),  'delete')
  and     has_table_privilege('hc_internal', to_regclass('public.arrivals'),          'update')
  and     has_table_privilege('hc_internal', to_regclass('public.arrivals'),          'insert'),
  false),
  'DELETE absent for hc_internal on all four; arrivals writable ONLY by the definer role since 1C M1');

select * from finish();
rollback;
