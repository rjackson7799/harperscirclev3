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

select plan(26);

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

select * from finish();
rollback;
