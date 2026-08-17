-- ============================================================================
-- 1C · U1 — the remaining §2.4 pipeline tables: arrival_events,
-- pipeline_leases, known_senders, extractions, plus the machinery tables the
-- state machine needs (hc.reason_codes, hc.stage_budgets, pipeline_outbox)
-- and arrivals.current_lease_id (§4.3).
--
-- Shape assertions are §2.4/§4.3 DDL verbatim plus the §2.1 conventions
-- (circle-consistent composite FKs, every FK indexed). Closure assertions:
-- everything lands FAIL-CLOSED — zero request-path privileges, zero
-- request-path policies; the §3.4 read policies are U7 (ING-02/03).
-- Constraint probes run as postgres (documented maintenance exemption).
--
-- RED (U1): every table absent — has_table fails and every probe reports
-- 42P01 (undefined_table) where the named constraint code is expected.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(40);

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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s2 uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Pipe one', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Pipe two', u1) returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'pt1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '02139', 'America/Chicago', 'clay',
          'pt2-' || substr(c2::text, 1, 8)) returning id into s2;
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s2', s2::text, true);
  perform set_config('t.a1', gen_random_uuid()::text, true);
  perform set_config('t.a2', gen_random_uuid()::text, true);
  perform set_config('t.l1', gen_random_uuid()::text, true);
  perform set_config('t.l2', gen_random_uuid()::text, true);
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (current_setting('t.a1')::uuid, c1, s1, 'upload');
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (current_setting('t.a2')::uuid, c2, s2, 'upload');
end $$;

-- ----------------------------------------------------------------------------
-- 1–8 · The tables and the §4.3 fence column exist.
-- ----------------------------------------------------------------------------
select has_table('public', 'arrival_events',  'arrival_events exists (§2.4)');
select has_table('public', 'pipeline_leases', 'pipeline_leases exists (§4.3)');
select has_table('public', 'known_senders',   'known_senders exists (§2.4)');
select has_table('public', 'extractions',     'extractions exists (§2.4)');
select has_table('public', 'pipeline_outbox', 'pipeline_outbox exists (§4.2 freeze re-enqueue)');
select has_table('hc', 'reason_codes',  'hc.reason_codes exists — the fixed enumeration (§2.4, AC-ADMIN-6)');
select has_table('hc', 'stage_budgets', 'hc.stage_budgets exists — §4.3 budgets as data');
select has_column('public', 'arrivals', 'current_lease_id',
  'arrivals carries current_lease_id — the §4.3 fence is one equality');

-- ----------------------------------------------------------------------------
-- 9–10 · The fixed enumerations are seeded.
-- ----------------------------------------------------------------------------
select is(
  pg_temp.scalar($$ select array_agg(stage || ':' || entry_state || ':' || max_attempts
                                     order by stage)::text
                    from hc.stage_budgets $$),
  '{extract:extracting:3,gate:scanned:50,interpret:extracted:3,scan:stored:4,store:received:2}',
  'stage_budgets seeds the five §4.3 stages with their entry states and attempt budgets');

select ok(coalesce(pg_temp.scalar(
  $$ select bool_and(code in (select code from hc.reason_codes))::text from
     (values ('store_budget_exhausted'), ('scan_budget_exhausted'),
             ('gate_budget_exhausted'), ('extract_budget_exhausted'),
             ('interpret_budget_exhausted'), ('cancelled_by_member'),
             ('manual_entry'), ('freeze_dismissed_requeue'), ('sweeper_requeue'),
             ('sender_unknown'), ('encrypted_pdf'), ('unsupported_mime')) v(code) $$)
  = 'true', false),
  'reason_codes seeds the normalized §4 enumeration (never a provider''s raw string)');

-- ----------------------------------------------------------------------------
-- 11–14 · arrival_events: shape, FK discipline, append-only posture.
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.arrival_events (arrival_id, circle_id, from_state, to_state, attempt)
     values (%L, %L, 'received', 'stored', 1) $$,
  current_setting('t.a1'), current_setting('t.c1')),
  'an arrival_events row is accepted with the §2.4 shape');

select throws_ok(format(
  $$ insert into public.arrival_events (arrival_id, circle_id, to_state, reason_code)
     values (%L, %L, 'stored', 'a raw provider error string') $$,
  current_setting('t.a1'), current_setting('t.c1')),
  '23503', null,
  'reason_code is FK-bound to hc.reason_codes — a raw error string cannot be stored');

select throws_ok(format(
  $$ insert into public.arrival_events (arrival_id, circle_id, to_state)
     values (%L, %L, 'stored') $$,
  current_setting('t.a2'), current_setting('t.c1')),
  '23503', null,
  'an event cannot claim another circle''s arrival (circle-consistent composite FK)');

select ok(coalesce(
      not has_table_privilege('hc_internal', to_regclass('public.arrival_events'), 'update')
  and not has_table_privilege('hc_internal', to_regclass('public.arrival_events'), 'delete'),
  false),
  'arrival_events is append-only: UPDATE and DELETE absent even for the writer role');

-- ----------------------------------------------------------------------------
-- 15–18 · pipeline_leases: the durable attempt counter's shape.
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.pipeline_leases (id, arrival_id, circle_id, stage, attempt_no, deadline)
     values (%L, %L, %L, 'extract', 1, now() + interval '5 minutes') $$,
  current_setting('t.l1'), current_setting('t.a1'), current_setting('t.c1')),
  'a lease row is accepted with the §4.3 shape');

select throws_ok(format(
  $$ insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline)
     values (%L, %L, 'extract', 1, now()) $$,
  current_setting('t.a1'), current_setting('t.c1')),
  '23505', null,
  'attempt_no is unique per (arrival, stage) — the budget cannot be double-claimed');

select throws_ok(format(
  $$ insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline, outcome)
     values (%L, %L, 'extract', 2, now(), 'succeeded') $$,
  current_setting('t.a1'), current_setting('t.c1')),
  '23514', null,
  'lease outcome is the closed §4.3 list');

select throws_ok(format(
  $$ insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline)
     values (%L, %L, 'extract', 1, now()) $$,
  current_setting('t.a2'), current_setting('t.c1')),
  '23503', null,
  'a lease cannot claim another circle''s arrival (circle-consistent composite FK)');

-- ----------------------------------------------------------------------------
-- 19 · The fence column is itself circle-consistent: an arrival cannot point
-- at another circle's lease.
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ update public.arrivals set current_lease_id = %L where id = %L $$,
  current_setting('t.l1'), current_setting('t.a2')),
  '23503', null,
  'current_lease_id is circle-consistent — a cross-circle fence is unrepresentable');

-- ----------------------------------------------------------------------------
-- 20–24 · extractions: citation_present is structural (PRD §6.4).
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
                                     confidence, risk_class, citation, model_id, prompt_version)
     values (%L, %L, %L, 'discharge_date', '"2026-08-01"', 0.92, 'standard',
             '{"page": 1, "bbox": [0.1, 0.2, 0.3, 0.4]}', 'm1', 'p1') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  'a cited extraction is accepted');

select throws_ok(format(
  $$ insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
                                     confidence, risk_class, citation, model_id, prompt_version)
     values (%L, %L, %L, 'medication', '"50mg"', 0.99, 'high',
             '{"source": "somewhere"}', 'm1', 'p1') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'citation_present: an uncited fact cannot be stored, so it cannot be rendered');

select throws_ok(format(
  $$ insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
                                     confidence, risk_class, citation, model_id, prompt_version)
     values (%L, %L, %L, 'x', '1', 1.5, 'standard', '{"page": 1}', 'm1', 'p1') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'confidence is bounded 0..1');

select throws_ok(format(
  $$ insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
                                     confidence, risk_class, citation, model_id, prompt_version)
     values (%L, %L, %L, 'x', '1', 0.5, 'standard', '{"page": 1}', 'm1', 'p1') $$,
  current_setting('t.a2'), current_setting('t.c1'), current_setting('t.s1')),
  '23503', null,
  'an extraction cannot claim another circle''s arrival');

select throws_ok(format(
  $$ insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
                                     confidence, risk_class, citation, model_id, prompt_version)
     values (%L, %L, %L, 'x', '1', 0.5, 'standard', '{"page": 1}', 'm1', 'p1') $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s2')),
  '23503', null,
  'an extraction cannot claim another circle''s subject');

-- ----------------------------------------------------------------------------
-- 25–28 · known_senders: exactly one of address/domain; live uniqueness.
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ insert into public.known_senders (circle_id, address, domain, accepted_by)
     values (%L, 'dr@clinic.example', 'clinic.example', %L) $$,
  current_setting('t.c1'), current_setting('t.u1')),
  '23514', null,
  'known_senders: address and domain are mutually exclusive');

select throws_ok(format(
  $$ insert into public.known_senders (circle_id, accepted_by) values (%L, %L) $$,
  current_setting('t.c1'), current_setting('t.u1')),
  '23514', null,
  'known_senders: one of address/domain is required');

select is(pg_temp.scalar(format(
  $$ with a as (insert into public.known_senders (circle_id, address, accepted_by)
                values (%L, 'dr@clinic.example', %L) returning 1),
          b as (insert into public.known_senders (circle_id, address, accepted_by)
                values (%L, 'DR@CLINIC.EXAMPLE', %L) returning 1)
     select '1' $$,
  current_setting('t.c1'), current_setting('t.u1'),
  current_setting('t.c1'), current_setting('t.u1'))),
  'ERROR:23505',
  'one live row per sender per circle — citext, so case variants collide');

select lives_ok(format(
  $$ with r as (update public.known_senders set revoked_at = now()
                where circle_id = %L and address = 'dr@clinic.example' returning 1)
     insert into public.known_senders (circle_id, address, accepted_by)
     select %L, 'dr@clinic.example', %L $$,
  current_setting('t.c1'), current_setting('t.c1'), current_setting('t.u1')),
  'a revoked sender can be re-accepted — the unique index is live-rows-only');

-- ----------------------------------------------------------------------------
-- 29–30 · pipeline_outbox shape.
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
     values (%L, %L, 'freeze_dismissed_requeue') $$,
  current_setting('t.c1'), current_setting('t.a1')),
  'an outbox row is accepted (durable re-enqueue, §4.2)');

select throws_ok(format(
  $$ insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
     values (%L, %L, 'freeze_dismissed_requeue') $$,
  current_setting('t.c1'), current_setting('t.a2')),
  '23503', null,
  'an outbox row cannot cross circles');

-- ----------------------------------------------------------------------------
-- 31–39 · FAIL-CLOSED: zero request-path reach until U7's read policies.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated', 'select * from public.arrival_events'), '42501',
  'authenticated cannot select arrival_events (never a member surface)');
select is(pg_temp.errcode_as('authenticated', 'select * from public.pipeline_leases'), '42501',
  'authenticated cannot select pipeline_leases');
select is(pg_temp.errcode_as('authenticated', 'select * from public.known_senders'), '42501',
  'authenticated cannot select known_senders (accept surface is a later slice)');
select is(pg_temp.errcode_as('authenticated', 'select * from public.extractions'), 'no_error',
  'authenticated reads extractions through U7''s view-level policy (this memberless probe sees zero rows)');
select is(pg_temp.errcode_as('authenticated', 'select * from public.pipeline_outbox'), '42501',
  'authenticated cannot select pipeline_outbox');
select is(pg_temp.errcode_as('authenticated', 'select * from hc.stage_budgets'), '42501',
  'authenticated cannot read stage budgets');
select is(pg_temp.errcode_as('hc_pipeline', 'select * from public.extractions'), '42501',
  'hc_pipeline holds NO direct DML on extractions — §4.5: publication is finalize_extraction only');
select is(pg_temp.errcode_as('hc_pipeline',
  format($$ insert into public.arrival_events (arrival_id, circle_id, to_state)
            values (%L, %L, 'stored') $$,
         current_setting('t.a1'), current_setting('t.c1'))), '42501',
  'hc_pipeline cannot write events directly — transitions go through hc.advance_arrival');
select is(pg_temp.errcode_as('hc_admin', 'select * from public.extractions'), '42501',
  'hc_admin cannot reach extractions (AC-ADMIN-1 posture)');

-- ----------------------------------------------------------------------------
-- 40 · DELETE granted to nobody on every pipeline table; the enumeration
-- tables are read-only even for the writer role.
-- ----------------------------------------------------------------------------
select ok(coalesce(
      not has_table_privilege('hc_internal', to_regclass('public.arrival_events'),  'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.pipeline_leases'), 'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.known_senders'),   'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.extractions'),     'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.pipeline_outbox'), 'delete')
  and not has_table_privilege('hc_internal', to_regclass('public.arrivals'),        'delete')
  and not has_table_privilege('hc_internal', to_regclass('hc.reason_codes'),        'insert')
  and not has_table_privilege('hc_internal', to_regclass('hc.stage_budgets'),       'insert')
  and not has_table_privilege('hc_internal', to_regclass('hc.reason_codes'),        'update')
  and not has_table_privilege('hc_internal', to_regclass('hc.stage_budgets'),       'update'),
  false),
  'DELETE absent everywhere; the fixed enumerations are append-by-migration only');

select * from finish();
rollback;
