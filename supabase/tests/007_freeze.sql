-- ============================================================================
-- Freeze — intake ledger, enforcement state, and their closure.
-- TSD §2.3 (as amended by ADR-0003 findings 1–3), §3.8; PRD §7.5.
--
-- Stage 1 (M5): the declarative shape — the three constraints, the one-open
-- index, the claims-disposition check — and the privilege closure: direct
-- INSERT/UPDATE/DELETE refused on both tables from EVERY request-path entry
-- point. Stage 2 (M8) appends the definer-function behaviour.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(53);

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
  c1 uuid; c2 uuid; s1 uuid; m1 uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Circle one', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Circle two', u1) returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'frz-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- The three declarative constraints (ADR-0003 findings 2 and 3).
-- RED until they land: these inserts SUCCEED in the red state — the exact
-- pre-review hazard the constraints exist to close.
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ insert into public.freezes (circle_id, subject_id)
     values (%L, %L) $$,
  current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'an OPEN freeze cannot name a subject — intake is whole-circle (freezes_open_is_whole_circle)');

select throws_ok(format(
  $$ insert into public.freezes (circle_id, state, outcome_note)
     values (%L, 'dismissed', 'no adjudication recorded') $$,
  current_setting('t.c1')),
  '23514', null,
  'no path to a non-open state without complete adjudication metadata (freezes_outcome_is_adjudicated)');

select throws_ok(format(
  $$ insert into public.freezes
       (circle_id, subject_id, state, adjudicated_at, adjudicated_by)
     values (%L, %L, 'unresolved', now(), 'adjudicator') $$,
  current_setting('t.c1'), current_setting('t.s1')),
  '23514', null,
  'narrowing without a recorded cross-subject exposure assessment is refused (freezes_narrowing_is_assessed)');

-- ----------------------------------------------------------------------------
-- One ACTIVE freeze per circle; claims are not bounded by it (finding 1).
-- ----------------------------------------------------------------------------
select lives_ok(format(
  $$ insert into public.freezes (circle_id) values (%L) $$,
  current_setting('t.c1')),
  'a whole-circle open freeze is accepted');

select throws_ok(format(
  $$ insert into public.freezes (circle_id) values (%L) $$,
  current_setting('t.c1')),
  '23505', null,
  'a second OPEN freeze in the same circle is refused (freezes_one_open_per_circle)');

select lives_ok(format(
  $$ insert into public.freezes (circle_id) values (%L) $$,
  current_setting('t.c2')),
  'the one-open bound is per circle — another circle may open');

-- ----------------------------------------------------------------------------
-- Claims-ledger shape: disposition ⟷ attachment (finding 1).
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ insert into public.freeze_claims
       (circle_id, freeze_id, claimant_contact, reason, disposition)
     select %L, f.id, 'caller@example.org', 'reason', 'rate_limited'
     from public.freezes f where f.circle_id = %L and f.state = 'open' $$,
  current_setting('t.c1'), current_setting('t.c1')),
  '23514', null,
  'a rate-limited claim attaches to nothing');

select throws_ok(format(
  $$ insert into public.freeze_claims
       (circle_id, claimant_contact, reason, disposition)
     values (%L, 'caller@example.org', 'reason', 'opened_freeze') $$,
  current_setting('t.c1')),
  '23514', null,
  'an accepted claim must attach to the freeze it opened or joined');

select lives_ok(format(
  $$ insert into public.freeze_claims
       (circle_id, freeze_id, claimant_contact, reason, disposition)
     select %L, f.id, 'caller@example.org', 'observed concerning access', 'opened_freeze'
     from public.freezes f where f.circle_id = %L and f.state = 'open' $$,
  current_setting('t.c1'), current_setting('t.c1')),
  'a well-formed claim row is accepted');

-- ----------------------------------------------------------------------------
-- Privilege closure: EVERY request-path entry point is refused on BOTH
-- tables — permission denied (42501), no policy consulted, before any
-- constraint could even speak (§2.3: "no request-path privilege").
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated',
  'select * from public.freezes'), '42501',
  'authenticated cannot SELECT freezes');
select is(pg_temp.errcode_as('authenticated', format(
  'insert into public.freezes (circle_id) values (%L)', current_setting('t.c2'))),
  '42501', 'authenticated cannot INSERT freezes');
select is(pg_temp.errcode_as('authenticated',
  'update public.freezes set state = ''dismissed'''), '42501',
  'authenticated cannot UPDATE freezes');
select is(pg_temp.errcode_as('authenticated',
  'delete from public.freezes'), '42501',
  'authenticated cannot DELETE freezes');
select is(pg_temp.errcode_as('authenticated',
  'select * from public.freeze_claims'), '42501',
  'authenticated cannot SELECT freeze_claims (claimant PII)');
select is(pg_temp.errcode_as('authenticated', format(
  'insert into public.freeze_claims (circle_id, claimant_contact, reason, disposition) values (%L, ''x'', ''y'', ''rate_limited'')',
  current_setting('t.c1'))), '42501',
  'authenticated cannot INSERT freeze_claims');
select is(pg_temp.errcode_as('anon',
  'select * from public.freezes'), '42501',
  'anon cannot SELECT freezes');
select is(pg_temp.errcode_as('anon',
  'select * from public.freeze_claims'), '42501',
  'anon cannot SELECT freeze_claims');
select is(pg_temp.errcode_as('hc_pipeline',
  'select * from public.freezes'), '42501',
  'hc_pipeline cannot SELECT freezes');
select is(pg_temp.errcode_as('hc_pipeline', format(
  'insert into public.freeze_claims (circle_id, claimant_contact, reason, disposition) values (%L, ''x'', ''y'', ''rate_limited'')',
  current_setting('t.c1'))), '42501',
  'hc_pipeline cannot INSERT freeze_claims');
select is(pg_temp.errcode_as('hc_admin',
  'select * from public.freezes'), '42501',
  'hc_admin cannot SELECT freezes (adjudication surfaces are admin_ops wrappers, 1D)');
select is(pg_temp.errcode_as('hc_admin',
  'update public.freezes set state = ''dismissed'', adjudicated_at = now(), adjudicated_by = ''x'''),
  '42501', 'hc_admin cannot UPDATE freezes');
select is(pg_temp.errcode_as('hc_admin',
  'delete from public.freeze_claims'), '42501',
  'hc_admin cannot DELETE freeze_claims');

-- ----------------------------------------------------------------------------
-- hc_internal's own reach is bounded: the enforcement state is never
-- deleted, and the intake ledger is append-only even for the writer role.
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('hc_internal', 'public.freezes', 'insert'),
  'hc_internal can INSERT freezes (hc.request_freeze is the only caller)');
select ok(not has_table_privilege('hc_internal', 'public.freezes', 'delete'),
  'a freeze is never deleted — no role holds the privilege');
select ok(not has_table_privilege('hc_internal', 'public.freeze_claims', 'update'),
  'the claims ledger is immutable — even hc_internal cannot UPDATE');
select ok(not has_table_privilege('hc_internal', 'public.freeze_claims', 'delete'),
  'the claims ledger is immutable — even hc_internal cannot DELETE');

-- ============================================================================
-- Stage 2 (M8): hc.request_freeze() / hc.adjudicate_freeze() — the only
-- entry points. Fresh circles per scenario; calls run as postgres (member
-- of hc_internal); function-closure assertions are catalog-based (live
-- denied calls segfault this image — see 004).
-- ============================================================================
do $$
declare
  u uuid := pg_temp.mk_user(gen_random_uuid());
  ca uuid; cb uuid; cc uuid; sa uuid;
begin
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Freeze fixture');
  insert into public.circles (name, created_by) values ('Freeze A', u) returning id into ca;
  insert into public.circles (name, created_by) values ('Freeze B', u) returning id into cb;
  insert into public.circles (name, created_by) values ('Freeze C', u) returning id into cc;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (ca, 'Nia', 's', 'z', 'UTC', 'sage', 'ffn-' || substr(ca::text, 1, 8))
    returning id into sa;
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.cb', cb::text, true);
  perform set_config('t.cc', cc::text, true);
  perform set_config('t.sa2', sa::text, true);
end $$;

-- Intake opens whole-circle and keeps the report.
select set_config('t.r1',
  hc.request_freeze(current_setting('t.ca')::uuid, 'claimant-1@example.org',
                    'observed concerning access')::text, true);

select is(current_setting('t.r1')::jsonb ->> 'disposition', 'opened_freeze',
  'first claim on a quiet circle opens a freeze');
select is((select count(*)::int from public.freezes
           where circle_id = current_setting('t.ca')::uuid and state = 'open'), 1,
  'exactly one open enforcement row');
select ok((select subject_id is null from public.freezes
           where circle_id = current_setting('t.ca')::uuid and state = 'open'),
  'the open freeze is whole-circle (subject_id null)');
select is((select count(*)::int from public.freeze_claims
           where freeze_id = (current_setting('t.r1')::jsonb ->> 'freeze_id')::uuid
             and claimant_contact = 'claimant-1@example.org'
             and disposition = 'opened_freeze'), 1,
  'the report itself is recorded in the intake ledger');
select ok(exists (select 1 from public.access_log
                  where circle_id = current_setting('t.ca')::uuid
                    and event_type = 'freeze_requested'),
  'the freeze request is an access-log event (PRD §7.5 Recorded)');

-- ADR-0003 finding 1: the second claimant ATTACHES — never a unique
-- violation, never a swallowed report.
select set_config('t.r2',
  hc.request_freeze(current_setting('t.ca')::uuid, 'claimant-2@example.org',
                    'corroborating report')::text, true);

select is(current_setting('t.r2')::jsonb ->> 'disposition', 'attached_to_existing',
  'a second claimant during an open adjudication attaches');
select is(current_setting('t.r2')::jsonb ->> 'freeze_id',
          current_setting('t.r1')::jsonb ->> 'freeze_id',
  '…to the SAME enforcement freeze');
select is((select count(*)::int from public.freeze_claims
           where freeze_id = (current_setting('t.r1')::jsonb ->> 'freeze_id')::uuid), 2,
  'both reports live in the ledger — the corroborating allegation is kept');
select ok(exists (select 1 from public.access_log
                  where circle_id = current_setting('t.ca')::uuid
                    and event_type = 'freeze_claim_recorded'),
  'the attaching claim is logged');

-- Per-claimant rate limit (3 per circle per 30 days; constants recorded
-- for round-5 review).
select lives_ok(format(
  $$ select hc.request_freeze(%L::uuid, 'claimant-1@example.org', 'again'),
            hc.request_freeze(%L::uuid, 'claimant-1@example.org', 'and again') $$,
  current_setting('t.ca'), current_setting('t.ca')),
  'the claimant''s second and third reports are accepted (attach)');
select is((hc.request_freeze(current_setting('t.ca')::uuid,
                             'claimant-1@example.org', 'fourth')) ->> 'disposition',
  'rate_limited', 'the fourth report inside the window is rate-limited');
select is((select count(*)::int from public.freeze_claims
           where circle_id = current_setting('t.ca')::uuid
             and claimant_contact = 'claimant-1@example.org'
             and disposition = 'rate_limited' and freeze_id is null), 1,
  'the rate-limited report is still recorded, attached to nothing');

-- Per-circle rate limit (10 per 30 days, strictly stronger than
-- per-subject at whole-circle intake).
do $$
declare i int;
begin
  for i in 1..10 loop
    perform hc.request_freeze(current_setting('t.cb')::uuid,
                              'cb-contact-' || i || '@example.org', 'report ' || i);
  end loop;
end $$;
select is((hc.request_freeze(current_setting('t.cb')::uuid,
                             'cb-contact-11@example.org', 'eleventh')) ->> 'disposition',
  'rate_limited', 'the eleventh distinct claimant in the window hits the circle bound');
select is((select count(*)::int from public.freeze_claims
           where circle_id = current_setting('t.cb')::uuid), 11,
  'every report that reached the service has a ledger row, limited ones included');

-- Adjudication: uniform error shapes, constraint-bound narrowing.
select throws_ok(format(
  $$ select hc.adjudicate_freeze(%L::uuid, 'dismissed', 'adjudicator') $$,
  gen_random_uuid()),
  'P0001', null,
  'adjudicating a nonexistent freeze raises the normalised error');
select throws_ok(format(
  $$ select hc.adjudicate_freeze(
       (select id from public.freezes where circle_id = %L::uuid and state = 'open'),
       'unresolved', 'adjudicator', null, %L::uuid, null) $$,
  current_setting('t.ca'), current_setting('t.sa2')),
  '23514', null,
  'narrowing through the FUNCTION without a rationale is still refused by the constraint');
select lives_ok(format(
  $$ select hc.adjudicate_freeze(
       (select id from public.freezes where circle_id = %L::uuid and state = 'open'),
       'unresolved', 'adjudicator', 'joint exposure weighed',
       %L::uuid, 'cross-subject exposure assessed: no joint material') $$,
  current_setting('t.ca'), current_setting('t.sa2')),
  'a narrowed unresolved finding with a recorded assessment is accepted');
select ok(exists (select 1 from public.freezes
                  where circle_id = current_setting('t.ca')::uuid
                    and state = 'unresolved'
                    and subject_id = current_setting('t.sa2')::uuid),
  'the finding narrowed to the named subject');
select throws_ok(format(
  $$ select hc.adjudicate_freeze(
       (select id from public.freezes where circle_id = %L::uuid),
       'dismissed', 'adjudicator') $$,
  current_setting('t.ca')),
  'P0001', null,
  'an already-adjudicated freeze raises the SAME normalised error as a nonexistent one');
select ok(exists (select 1 from public.access_log
                  where circle_id = current_setting('t.ca')::uuid
                    and event_type = 'freeze_adjudicated'),
  'the finding is an access-log event');

-- Lifecycle on a quiet circle: dismissal ends the freeze; the record can
-- be frozen again by a NEW claimant; the dismissed-prior claimant cannot.
select lives_ok(format(
  $$ select hc.request_freeze(%L::uuid, 'claimant-z@example.org', 'first report') $$,
  current_setting('t.cc')),
  'cC: claimant Z opens');
select lives_ok(format(
  $$ select hc.adjudicate_freeze(
       (select id from public.freezes where circle_id = %L::uuid and state = 'open'),
       'dismissed', 'adjudicator', 'unfounded') $$,
  current_setting('t.cc')),
  'cC: dismissed finding entered');
select is((select count(*)::int from public.freezes
           where circle_id = current_setting('t.cc')::uuid and state = 'open'), 0,
  'dismissal leaves no open freeze');
select is((hc.request_freeze(current_setting('t.cc')::uuid,
                             'claimant-fresh@example.org', 'new concern')) ->> 'disposition',
  'opened_freeze',
  'after a finding, a NEW claimant can freeze again (one-open bounds only OPEN)');
select is((hc.request_freeze(current_setting('t.cc')::uuid,
                             'claimant-z@example.org', 'repeat')) ->> 'disposition',
  'rate_limited',
  'a claimant whose prior claim was adjudicated unfounded is refused and logged (PRD §7.5)');

-- The writer inventory is exactly the enumerated set — no other function
-- reaches the freeze tables (mutation exclusivity, §2.3).
select is(
  (select coalesce(array_agg(p.proname order by p.proname), '{}'::name[])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hc' and p.prosrc like '%public.freezes%'),
  array['adjudicate_freeze','grant_vectors','request_freeze']::name[],
  'exactly three hc functions reference freezes: the two writers and the flag reader');
select is(
  (select coalesce(array_agg(p.proname order by p.proname), '{}'::name[])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hc' and p.prosrc like '%public.freeze_claims%'),
  array['request_freeze']::name[],
  'hc.request_freeze() is the only writer of the intake ledger');

-- Closure (catalog; live denied calls segfault this image — see 004).
select ok(
      not has_function_privilege('authenticated', 'hc.request_freeze(uuid,text,text,text)', 'execute')
  and not has_function_privilege('hc_pipeline',   'hc.request_freeze(uuid,text,text,text)', 'execute')
  and not has_function_privilege('hc_admin',      'hc.request_freeze(uuid,text,text,text)', 'execute'),
  'no request-path role can execute hc.request_freeze()');
select ok(
      not has_function_privilege('authenticated', 'hc.adjudicate_freeze(uuid,text,text,text,uuid,text,timestamptz)', 'execute')
  and not has_function_privilege('hc_pipeline',   'hc.adjudicate_freeze(uuid,text,text,text,uuid,text,timestamptz)', 'execute')
  and not has_function_privilege('hc_admin',      'hc.adjudicate_freeze(uuid,text,text,text,uuid,text,timestamptz)', 'execute'),
  'no request-path role can execute hc.adjudicate_freeze()');

select * from finish();
rollback;
