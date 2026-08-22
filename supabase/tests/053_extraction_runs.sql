-- ============================================================================
-- 5A · M3 — extraction_runs: the §4.3/§6.4 run-versioning contract made
-- structural (docs/review/slice-5-plan.md M3; review finding 2's settled
-- recording point). The contract these tests pin:
--
--   · THE TABLE: §4.3's idempotency identity — unique (arrival, model_id,
--     prompt_version, attempt_no) — plus one run per lease (lease-bound),
--     outcome and closed_at travel together, RLS forced, request-path
--     roles hold nothing.
--   · BORN IN THE CLAIM TRANSACTION: hc.claim_stage gains the model/
--     prompt pair for extract claims (required there, refused elsewhere)
--     and inserts the run row with the lease — a timeout, kill, render
--     failure or provider error can never consume a lease without its
--     run row existing. No lease consumed without its run.
--   · CLOSES WITH THE LEASE: every lease-closing path — finalize's CAS,
--     worker terminal transitions, cancel, claim-path expiry, sweeper
--     expiry — closes the bound run with the honest outcome. No open run
--     outlives its lease. THE KILL MATRIX, case by case:
--       kill-before-provider  → sweeper expiry   → 'abandoned'
--       kill-during-provider  → claim-path expiry → 'abandoned'
--       provider refusal      → 'terminalized' / provider_refusal
--       normalisation failure → 'terminalized' / encrypted_pdf
--       stale lease           → the late worker publishes NOTHING; its
--                               run stays 'abandoned'; the winner's is
--                               'published'
--       timeout               → 'terminalized' / provider_timeout
--   · A run row exists even when ZERO facts land ('published', no
--     extractions) — refusals/failures countable per class (PRD §10.4).
--   · SUPERSEDE-NOT-APPEND at hc.write_extractions: a re-run's
--     publication supersedes the arrival's prior facts in the same
--     transaction — a retry cannot double a fact; rows carry run_id; a
--     fact whose model/prompt differs from its run's stamps is refused.
--   · write_proposals carries anomaly_flags through (§6.7) — verified.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(27);

-- ----------------------------------------------------------------------------
-- Helpers (the 043/051 pattern).
-- ----------------------------------------------------------------------------
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

create function pg_temp.probe(p_uid uuid, p_sql text) returns text
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

create function pg_temp.probe_role(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

-- Id extractor: null (never an abort) when the probe failed (043's jid).
create function pg_temp.jid(p_out text, p_field text) returns uuid
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then null
              else (p_out::jsonb ->> p_field)::uuid end;
$$;

-- Red-leg-friendly assertion evaluator: a query against a table that does
-- not exist yet FAILS its test instead of aborting the file.
create function pg_temp.tq(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  return v;
end $$;

-- Claim as the pipeline and return the whole record as jsonb text.
create function pg_temp.claim(p_arrival text, p_model text, p_prompt text)
returns text language sql as $$
  select pg_temp.probe_role('hc_pipeline', format(
    $sql$ select to_jsonb(c.*)::text
          from hc.claim_stage(%L::uuid, 'extract', %L, %L) c $sql$,
    p_arrival, p_model, p_prompt));
$$;

-- One well-formed fact array (model/prompt parameterised).
create function pg_temp.facts(p_model text, p_prompt text, p_f1 text, p_f2 text)
returns text language sql as $$
  select jsonb_build_array(
    jsonb_build_object('field', p_f1, 'value', 'v1', 'confidence', 0.9,
                       'risk_class', 'high',
                       'citation', jsonb_build_object('page', 1, 'bbox', jsonb_build_array(0, 0, 1, 1)),
                       'model_id', p_model, 'prompt_version', p_prompt),
    jsonb_build_object('field', p_f2, 'value', 'v2', 'confidence', 0.8,
                       'risk_class', 'standard',
                       'citation', jsonb_build_object('page', 2, 'bbox', jsonb_build_array(0, 0, 1, 1)),
                       'model_id', p_model, 'prompt_version', p_prompt))::text;
$$;

-- ----------------------------------------------------------------------------
-- Fixtures: Rosa founds c1/Nell; a fleet of arrivals resting at
-- 'extracting', one per matrix case.
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc53-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

do $$
declare
  v_c1 uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid;
  v_names text[] := array['claim','sweep','reclaim','refusal','norm','timeout',
                          'stale','zero','cancel','super','mismatch','flags'];
  v_n text; v_id uuid;
begin
  if v_c1 is null then return; end if;   -- red leg: fail cleanly
  select s.id into v_nell from public.subjects s where s.circle_id = v_c1;
  perform set_config('t.c1', v_c1::text, true);
  perform set_config('t.nell', v_nell::text, true);
  foreach v_n in array v_names loop
    insert into public.arrivals (circle_id, subject_id, channel, state)
    values (v_c1, v_nell, 'upload', 'extracting'::hc.arrival_state)
    returning id into v_id;
    perform set_config('t.ar_' || v_n, v_id::text, true);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1–8 · The surface.
-- ----------------------------------------------------------------------------
select has_table('public', 'extraction_runs',
  'extraction_runs exists — the §4.3 run-versioning contract''s table');

select ok((
  select count(*) filter (where c.contype = 'u') = 3
  from pg_constraint c where c.conrelid = to_regclass('public.extraction_runs'))
  and exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.extraction_runs') and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%closed_at%'),
  'three unique identities — §4.3''s (arrival, model, prompt, attempt), one-run-per-lease, and §2.1''s (circle_id, id) FK target — and outcome/closed_at travel together by CHECK');

select ok((
  select c.relrowsecurity and c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'extraction_runs'),
  'RLS enabled AND forced on extraction_runs');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public' and c.relname = 'extraction_runs'
    and r.rolname in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin')), 0,
  'no request-path or worker role holds ANY privilege on extraction_runs — runs are accounting, not surface');

select has_function('hc', 'claim_stage', array['uuid', 'text', 'text', 'text']::name[],
  'hc.claim_stage carries the model/prompt pair — the run is born in the claim transaction');

select ok(exists (select 1 from hc.reason_codes where code = 'provider_refusal'),
  'reason_codes gains provider_refusal — §6.8''s honest refusal exit');

select has_column('public', 'extractions', 'run_id',
  'extractions.run_id exists — every stored fact traces to its run');
select has_column('public', 'extractions', 'superseded_at',
  'extractions.superseded_at exists — supersede-not-append has a column to mean it');

-- ----------------------------------------------------------------------------
-- 9–13 · The claim half: required-there, refused-elsewhere; the run born
-- with the lease; stale claims mint nothing.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select to_jsonb(c.*)::text from hc.claim_stage(%L::uuid, 'extract') c $sql$,
  current_setting('t.ar_claim'))), 'ERROR:P0001',
  'an extract claim WITHOUT the model/prompt pair refuses — the run identity is not optional');

select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select to_jsonb(c.*)::text
        from hc.claim_stage(%L::uuid, 'store', 'claude-opus-5', 'pv1') c $sql$,
  current_setting('t.ar_claim'))), 'ERROR:P0001',
  'a NON-extract claim carrying the pair refuses — no stage borrows the identity it does not record');

select set_config('t.claim1',
  pg_temp.claim(current_setting('t.ar_claim'), 'claude-opus-5', 'pv1'), true);

select is(pg_temp.tq(format($sql$
  select ((%L = 'claimed') and exists (
    select 1 from public.extraction_runs r
    where r.arrival_id = %L::uuid and r.lease_id = %L::uuid
      and r.attempt_no = 1
      and r.model_id = 'claude-opus-5' and r.prompt_version = 'pv1'
      and r.outcome is null and r.closed_at is null))::text $sql$,
  pg_temp.jf(current_setting('t.claim1'), 'result'),
  current_setting('t.ar_claim'),
  pg_temp.jf(current_setting('t.claim1'), 'lease_id'))), 'true',
  'the claim answers claimed AND the run row exists — open, lease-bound, attempt 1, stamped with the pair at insert');

select is(pg_temp.tq(format($sql$
  select ((%L = 'stale_lease') and (
    select count(*) from public.extraction_runs r
    where r.arrival_id = %L::uuid) = 1)::text $sql$,
  pg_temp.jf(pg_temp.claim(current_setting('t.ar_claim'), 'claude-opus-5', 'pv1'),
             'result'),
  current_setting('t.ar_claim'))), 'true',
  'a claim against a LIVE lease answers stale_lease and mints NO second run');

select is(pg_temp.tq(format($sql$
  select (count(distinct l.id) = count(distinct r.id)
      and count(distinct l.id) = 1)::text
  from public.pipeline_leases l
  left join public.extraction_runs r on r.lease_id = l.id
  where l.arrival_id = %L::uuid and l.stage = 'extract' $sql$,
  current_setting('t.ar_claim'))), 'true',
  'no lease consumed without its run: extract leases and runs pair 1:1');

-- ----------------------------------------------------------------------------
-- 14 · Kill-before-provider: the worker dies; the SWEEPER expires the
-- lease; the run closes 'abandoned'.
-- ----------------------------------------------------------------------------
select set_config('t.sweep1',
  pg_temp.claim(current_setting('t.ar_sweep'), 'claude-opus-5', 'pv1'), true);
update public.pipeline_leases set deadline = now() - interval '1 second'
 where id = pg_temp.jid(current_setting('t.sweep1'), 'lease_id');
select pg_temp.probe_role('hc_pipeline', 'select hc.sweeper_pass()::text');

select is(pg_temp.tq(format($sql$
  select (exists (
    select 1 from public.extraction_runs r
    where r.lease_id = %L::uuid
      and r.outcome = 'abandoned' and r.closed_at is not null))::text $sql$,
  pg_temp.jf(current_setting('t.sweep1'), 'lease_id'))), 'true',
  'KILL-BEFORE-PROVIDER: sweeper expiry closes the run as abandoned — the attempt was burned durably, and the books say so');

-- ----------------------------------------------------------------------------
-- 15 · Kill-during-provider: the worker dies mid-call; the NEXT CLAIM
-- expires the lease in its own transaction; old run abandoned, new run open.
-- ----------------------------------------------------------------------------
select set_config('t.rc1',
  pg_temp.claim(current_setting('t.ar_reclaim'), 'claude-opus-5', 'pv1'), true);
update public.pipeline_leases set deadline = now() - interval '1 second'
 where id = pg_temp.jid(current_setting('t.rc1'), 'lease_id');
select set_config('t.rc2',
  pg_temp.claim(current_setting('t.ar_reclaim'), 'claude-opus-5', 'pv1'), true);

select is(pg_temp.tq(format($sql$
  select ((%L = 'claimed')
    and exists (select 1 from public.extraction_runs r
                where r.lease_id = %L::uuid and r.outcome = 'abandoned')
    and exists (select 1 from public.extraction_runs r
                where r.lease_id = %L::uuid
                  and r.attempt_no = 2 and r.outcome is null))::text $sql$,
  pg_temp.jf(current_setting('t.rc2'), 'result'),
  pg_temp.jf(current_setting('t.rc1'), 'lease_id'),
  pg_temp.jf(current_setting('t.rc2'), 'lease_id'))), 'true',
  'KILL-DURING-PROVIDER: the reclaim expires the dead lease (run → abandoned) and opens attempt 2 with its own run');

-- ----------------------------------------------------------------------------
-- 16–18 · The honest worker terminals: refusal, normalisation failure,
-- timeout — each closes the run 'terminalized' with the §6.8 reason.
-- ----------------------------------------------------------------------------
select set_config('t.rf1',
  pg_temp.claim(current_setting('t.ar_refusal'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.advance_arrival(%L::uuid, 'extracting', 'extract_failed',
                                  %L::uuid, 'provider_refusal')::text $sql$,
  current_setting('t.ar_refusal'), pg_temp.jf(current_setting('t.rf1'), 'lease_id')));
select is(pg_temp.tq(format($sql$
  select (exists (
    select 1 from public.extraction_runs r
    where r.lease_id = %L::uuid
      and r.outcome = 'terminalized' and r.reason_code = 'provider_refusal'))::text $sql$,
  pg_temp.jf(current_setting('t.rf1'), 'lease_id'))), 'true',
  'REFUSAL: a declined request is an honest terminal — run terminalized / provider_refusal, countable per class (PRD §10.4)');

select set_config('t.nm1',
  pg_temp.claim(current_setting('t.ar_norm'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.advance_arrival(%L::uuid, 'extracting', 'needs_password',
                                  %L::uuid, 'encrypted_pdf')::text $sql$,
  current_setting('t.ar_norm'), pg_temp.jf(current_setting('t.nm1'), 'lease_id')));
select is(pg_temp.tq(format($sql$
  select (exists (
    select 1 from public.extraction_runs r
    where r.lease_id = %L::uuid
      and r.outcome = 'terminalized' and r.reason_code = 'encrypted_pdf')
    and (select a.state from public.arrivals a
         where a.id = %L::uuid) = 'needs_password')::text $sql$,
  pg_temp.jf(current_setting('t.nm1'), 'lease_id'),
  current_setting('t.ar_norm'))), 'true',
  'NORMALISATION FAILURE: needs_password lands with its reason on the closed run — the honest state, no provider consulted');

select set_config('t.tm1',
  pg_temp.claim(current_setting('t.ar_timeout'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.advance_arrival(%L::uuid, 'extracting', 'extract_timeout',
                                  %L::uuid, 'provider_timeout')::text $sql$,
  current_setting('t.ar_timeout'), pg_temp.jf(current_setting('t.tm1'), 'lease_id')));
select is(pg_temp.tq(format($sql$
  select (exists (
    select 1 from public.extraction_runs r
    where r.lease_id = %L::uuid
      and r.outcome = 'terminalized' and r.reason_code = 'provider_timeout'))::text $sql$,
  pg_temp.jf(current_setting('t.tm1'), 'lease_id'))), 'true',
  'TIMEOUT: the worker''s own deadline exit closes the run terminalized / provider_timeout');

-- ----------------------------------------------------------------------------
-- 19–20 · Stale lease: the superseded worker publishes NOTHING; the books
-- keep both attempts honestly.
-- ----------------------------------------------------------------------------
select set_config('t.stA',
  pg_temp.claim(current_setting('t.ar_stale'), 'claude-opus-5', 'pv1'), true);
update public.pipeline_leases set deadline = now() - interval '1 second'
 where id = pg_temp.jid(current_setting('t.stA'), 'lease_id');
select set_config('t.stB',
  pg_temp.claim(current_setting('t.ar_stale'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, %L::jsonb, '[]'::jsonb)::text $sql$,
  current_setting('t.ar_stale'), pg_temp.jf(current_setting('t.stB'), 'lease_id'),
  pg_temp.facts('claude-opus-5', 'pv1', 'b_fact_1', 'b_fact_2')));

select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, %L::jsonb, '[]'::jsonb)::text $sql$,
  current_setting('t.ar_stale'), pg_temp.jf(current_setting('t.stA'), 'lease_id'),
  pg_temp.facts('claude-opus-5', 'pv1', 'a_fact_1', 'a_fact_2'))),
  'stale_lease',
  'STALE LEASE: the late worker''s finalize answers stale_lease — it publishes nothing, however late it arrives');

select is(pg_temp.tq(format($sql$
  select (exists (select 1 from public.extraction_runs r
                  where r.lease_id = %L::uuid and r.outcome = 'abandoned')
    and exists (select 1 from public.extraction_runs r
                where r.lease_id = %L::uuid and r.outcome = 'published')
    and (select array_agg(e.field order by e.field)
         from public.extractions e
         where e.arrival_id = %L::uuid
           and e.superseded_at is null) = array['b_fact_1', 'b_fact_2'])::text $sql$,
  pg_temp.jf(current_setting('t.stA'), 'lease_id'),
  pg_temp.jf(current_setting('t.stB'), 'lease_id'),
  current_setting('t.ar_stale'))), 'true',
  'the winner''s run is published, the loser''s stays abandoned, and ONLY the winner''s facts are live');

-- ----------------------------------------------------------------------------
-- 21 · Zero facts is still a run: a SUCCESS with nothing found is
-- recorded and countable (PRD §10.4).
-- ----------------------------------------------------------------------------
select set_config('t.z1',
  pg_temp.claim(current_setting('t.ar_zero'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb)::text $sql$,
  current_setting('t.ar_zero'), pg_temp.jf(current_setting('t.z1'), 'lease_id')));
select is(pg_temp.tq(format($sql$
  select (exists (select 1 from public.extraction_runs r
                  where r.lease_id = %L::uuid and r.outcome = 'published')
    and not exists (select 1 from public.extractions e
                    where e.arrival_id = %L::uuid))::text $sql$,
  pg_temp.jf(current_setting('t.z1'), 'lease_id'),
  current_setting('t.ar_zero'))), 'true',
  'ZERO FACTS: the run closes published with no extractions — a quiet document is a recorded outcome, not a missing row');

-- ----------------------------------------------------------------------------
-- 22 · Cancellation mid-extract closes the run 'cancelled'.
-- ----------------------------------------------------------------------------
select set_config('t.cx1',
  pg_temp.claim(current_setting('t.ar_cancel'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.cancel_arrival(%L)::text $sql$, current_setting('t.ar_cancel')));
select is(pg_temp.tq(format($sql$
  select r.outcome from public.extraction_runs r
  where r.lease_id = %L::uuid $sql$,
  pg_temp.jf(current_setting('t.cx1'), 'lease_id'))),
  'cancelled',
  'CANCELLATION: the member''s cancel closes the worker''s run as cancelled — the lease and its accounting close together');

-- ----------------------------------------------------------------------------
-- 23–24 · Supersede-not-append: a re-run''s publication supersedes the
-- arrival''s prior facts in the same transaction.
-- ----------------------------------------------------------------------------
select set_config('t.sp1',
  pg_temp.claim(current_setting('t.ar_super'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, %L::jsonb, '[]'::jsonb)::text $sql$,
  current_setting('t.ar_super'), pg_temp.jf(current_setting('t.sp1'), 'lease_id'),
  pg_temp.facts('claude-opus-5', 'pv1', 'r1_fact_1', 'r1_fact_2')));
-- the versioned re-run path (a future prompt bump re-queues the arrival):
-- fixture-level state reset, then a REAL claim and a REAL publication.
update public.arrivals
   set state = 'extracting'::hc.arrival_state, current_lease_id = null
 where id = current_setting('t.ar_super')::uuid;
select set_config('t.sp2',
  pg_temp.claim(current_setting('t.ar_super'), 'claude-opus-5', 'pv2'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, %L::jsonb, '[]'::jsonb)::text $sql$,
  current_setting('t.ar_super'), pg_temp.jf(current_setting('t.sp2'), 'lease_id'),
  pg_temp.facts('claude-opus-5', 'pv2', 'r2_fact_1', 'r2_fact_2')));

select is(pg_temp.tq(format($sql$
  select (array_agg(e.field order by e.field))::text
  from public.extractions e
  where e.arrival_id = %L::uuid and e.superseded_at is null $sql$,
  current_setting('t.ar_super'))),
  '{r2_fact_1,r2_fact_2}',
  'SUPERSEDE-NOT-APPEND: after the re-run exactly the new facts are live — a retry cannot double a fact');

select is(pg_temp.tq(format($sql$
  select ((select count(*) = 2 and bool_and(e.run_id = (
             select r.id from public.extraction_runs r where r.lease_id = %L::uuid))
           from public.extractions e
           where e.arrival_id = %L::uuid and e.superseded_at is not null)
      and (select bool_and(e.run_id = (
             select r.id from public.extraction_runs r where r.lease_id = %L::uuid))
           from public.extractions e
           where e.arrival_id = %L::uuid and e.superseded_at is null))::text $sql$,
  pg_temp.jf(current_setting('t.sp1'), 'lease_id'),
  current_setting('t.ar_super'),
  pg_temp.jf(current_setting('t.sp2'), 'lease_id'),
  current_setting('t.ar_super'))), 'true',
  'the superseded rows stay, stamped with run 1; the live rows carry run 2 — provenance survives supersession');

-- ----------------------------------------------------------------------------
-- 25 · A fact whose model/prompt differs from its run''s stamps is refused.
-- ----------------------------------------------------------------------------
select set_config('t.mm1',
  pg_temp.claim(current_setting('t.ar_mismatch'), 'claude-opus-5', 'pv1'), true);
select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, %L::jsonb, '[]'::jsonb)::text $sql$,
  current_setting('t.ar_mismatch'), pg_temp.jf(current_setting('t.mm1'), 'lease_id'),
  pg_temp.facts('claude-sonnet-5', 'pv1', 'mm_fact_1', 'mm_fact_2'))),
  'ERROR:P0001',
  'a fact stamped with a DIFFERENT model than its run refuses — the recorded configuration is the identity, not a suggestion');

-- ----------------------------------------------------------------------------
-- 26 · write_proposals carries anomaly_flags through (§6.7) — verified.
-- ----------------------------------------------------------------------------
select set_config('t.fl1',
  pg_temp.claim(current_setting('t.ar_flags'), 'claude-opus-5', 'pv1'), true);
select pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, %L::jsonb)::text $sql$,
  current_setting('t.ar_flags'), pg_temp.jf(current_setting('t.fl1'), 'lease_id'),
  '[{"kind":"task","payload":{"title":"Injected chore","anomaly_flags":["references_permissions","product_mechanics"]}}]'));
select is(pg_temp.tq(format($sql$
  select p.anomaly_flags::text from public.proposals p
  where p.arrival_id = %L::uuid $sql$,
  current_setting('t.ar_flags'))),
  '{references_permissions,product_mechanics}',
  'anomaly_flags ride the publication into the proposals row — §6.7''s signal is not dropped at the boundary');

-- ----------------------------------------------------------------------------
-- 27 · The standing invariant, swept globally: no open run outlives its
-- lease; every run has its lease.
-- ----------------------------------------------------------------------------
select is(pg_temp.tq($sql$
  select count(*)::text
  from public.extraction_runs r
  left join public.pipeline_leases l on l.id = r.lease_id
  where l.id is null
     or (r.closed_at is null and l.closed_at is not null)
     or (r.closed_at is not null and r.outcome is null) $sql$), '0',
  'INVARIANT: every run is lease-bound and no open run outlives a closed lease — the books balance');

select * from finish();
rollback;
