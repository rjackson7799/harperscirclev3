-- ============================================================================
-- 5A · M6 — the round-15 dispositions (docs/review/round-15-findings.md;
-- ADR-0021). Three accepted findings, pinned here BEFORE the migration
-- exists (the red leg):
--
--   · FINDING 1 (HIGH) — stage-2 detection races a document committed
--     concurrently. hc.finalize_extraction asked the duplicate question
--     with NO lock held, then blocked on the per-circle taint lock inside
--     hc.advance_arrival; a matching document committing in that window
--     was invisible to the detector and the arrival advanced to
--     'extracted', silently skipping the settled stage-2 question. The
--     fix hoists the R-rule lock ABOVE the detection call, so the
--     predicate is evaluated under the same serialization point that
--     guards record publication (hc.approve_proposal takes the same key).
--     THE BEHAVIOURAL HALF IS CONCURRENCY CASE 44 — this file pins the
--     STRUCTURAL half only (one session cannot race itself).
--   · FINDING 2 (MEDIUM) — hc.list_known_senders resolved its actor with
--     `where a.id = v_actor` alone, omitting the `deleted_at is null`
--     guard hc.log_artifact_read carries. A soft-deleted account holding
--     a live coordinator membership could enumerate live accepted senders.
--     Currently UNREACHABLE (nothing in the shipped schema writes
--     accounts.deleted_at) — a latent guard, fixed on the live-actor
--     principle, not on a live exploit. See ADR-0021 D2 for the SND-02
--     family item this queues.
--   · FINDING 3 (MEDIUM) — hc.detect_stage2_duplicate narrowed the
--     arrival side to ONE document-proposal category and ONE value per
--     key field via `limit 1`, while the candidate side matched with
--     EXISTS over all of them. write_proposals admits 50 proposals with
--     no document-kind limit and write_extractions 200 facts with no
--     per-field uniqueness, so both are reachable: a second proposal or a
--     second value was silently ignored and the outcome depended on
--     payload order. The fix restores SET semantics on the arrival side.
--     The settled contract is unchanged — type + date + ≥1 corroborating
--     pair, all PRESENT on both sides, absence never wildcards, exact
--     after normalisation, most-recently-filed canonical target.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(8);

-- ----------------------------------------------------------------------------
-- Helpers (the 043/051/053/055 pattern).
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

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

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

-- ONE fact object, so a facts array can carry REPEATS of a key field
-- (write_extractions permits 200 facts with no per-field uniqueness).
create function pg_temp.f1(p_field text, p_val text) returns jsonb
language sql as $$
  select jsonb_build_object('field', p_field, 'value', to_jsonb(p_val),
           'confidence', 0.9, 'risk_class', 'standard',
           'citation', jsonb_build_object('page', 1),
           'model_id', 'm1', 'prompt_version', 'p1');
$$;

-- ONE drafted document proposal, so a proposals array can carry SEVERAL
-- (write_proposals permits 50 with no document-kind limit).
create function pg_temp.dp(p_cat text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'document',
           'payload', jsonb_build_object('title', 'Fixture doc',
                                         'category', p_cat));
$$;

-- Claim + publish as the pipeline in one step; answers the CAS result.
create function pg_temp.pub(p_arr uuid, p_facts jsonb, p_props jsonb)
returns text language plpgsql as $$
declare r record; v hc.advance_result;
begin
  select * into r from hc.claim_stage(p_arr, 'extract', 'm1', 'p1');
  if r.result <> 'claimed' then return 'claim:' || r.result::text; end if;
  v := hc.finalize_extraction(p_arr, r.lease_id, p_facts, p_props);
  return v::text;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.st(p_arr uuid) returns text language sql as $$
  select a.state::text from public.arrivals a where a.id = p_arr;
$$;

-- A filed, current candidate document whose own arrival carries the key
-- fields as live extractions (055's mk_candidate).
create function pg_temp.mk_candidate(
  p_circle uuid, p_subject uuid, p_title text, p_cat text, p_filed timestamptz,
  p_date text, p_prov text, p_amt text, p_pol text, p_actor uuid)
returns uuid language plpgsql as $$
declare v_arr uuid; v_doc uuid; r record;
begin
  insert into public.arrivals (circle_id, subject_id, channel, state, sender_address)
  values (p_circle, p_subject, 'email', 'filed'::hc.arrival_state,
          'billing@clinic.example')
  returning id into v_arr;
  for r in select x.f, x.v from (values ('document_date', p_date), ('provider', p_prov),
                                        ('amount', p_amt), ('policy_number', p_pol)) x(f, v)
           where x.v is not null loop
    insert into public.extractions
      (arrival_id, circle_id, subject_id, field, value, confidence, risk_class,
       citation, model_id, prompt_version)
    values (v_arr, p_circle, p_subject, r.f, to_jsonb(r.v), 0.9,
            'standard'::hc.risk_class, '{"page": 1}'::jsonb, 'm0', 'p0');
  end loop;
  insert into public.documents
    (circle_id, subject_id, title, category, summary_text, artifact_arrival_id,
     filed_at, approved_by, approved_at, approver_display_name, taint)
  values (p_circle, p_subject, p_title, p_cat::hc.doc_category, 'fixture',
          v_arr, p_filed, p_actor, now(), 'Rosa', array['health']::hc.domain[])
  returning id into v_doc;
  return v_doc;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures. Rosa founds c1 with Nell. dA is the canonical target: a
-- MEDICAL document dated 2026-07-12 from Mercy Hospital.
-- ----------------------------------------------------------------------------
do $$
declare u1 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(
    jsonb_build_object(
      'first_name', 'Nell', 'situation', 'recovering at home',
      'postal_code', '02138', 'timezone', 'America/New_York',
      'accent_color', 'sage',
      'forwarding_local_part', 'cc56-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

do $$
declare
  v_u1 uuid := current_setting('t.u1')::uuid;
  v_c1 uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid; dA uuid;
  v_names text[] := array['b','c','d','e','f'];
  v_n text; v_id uuid;
begin
  if v_c1 is null then return; end if;   -- red leg: fail cleanly
  select s.id into v_nell from public.subjects s
   where s.circle_id = v_c1 and s.first_name = 'Nell';

  dA := pg_temp.mk_candidate(v_c1, v_nell, 'Discharge summary (Jul 12)', 'medical',
        now() - interval '10 days', '2026-07-12', 'Mercy Hospital', '$1,240.00',
        null, v_u1);

  foreach v_n in array v_names loop
    insert into public.arrivals (circle_id, subject_id, channel, state, sender_address)
    values (v_c1, v_nell, 'email', 'extracting'::hc.arrival_state,
            'billing@clinic.example')
    returning id into v_id;
    perform set_config('t.ar_' || v_n, v_id::text, true);
  end loop;

  -- A live accepted sender, so the finding-2 probe can distinguish
  -- "refused" from "returned nothing".
  insert into public.known_senders (circle_id, address, accepted_by)
  values (v_c1, 'billing@clinic.example', v_u1);

  perform set_config('t.c1', v_c1::text, true);
  perform set_config('t.nell', v_nell::text, true);
  perform set_config('t.dA', dA::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1 · FINDING 1, the STRUCTURAL half: the R-rule lock is taken BEFORE the
--     duplicate question is asked. The behavioural half — a matching
--     document committing while finalization waits — is concurrency case
--     44, which one session cannot express.
-- ----------------------------------------------------------------------------
select ok(
  (select position('pg_advisory_xact_lock' in d) > 0
      and position('pg_advisory_xact_lock' in d)
            < position('detect_stage2_duplicate' in d)
   from (select pg_get_functiondef(
           'hc.finalize_extraction(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) as d) x),
  'FINDING 1: hc.finalize_extraction takes the per-circle taint lock BEFORE it asks hc.detect_stage2_duplicate — the duplicate predicate is evaluated under the same serialization point that guards publication (behavioural half: concurrency case 44)');

-- ----------------------------------------------------------------------------
-- 2–4 · FINDING 3: the arrival side reads SETS, not arbitrary firsts.
-- ----------------------------------------------------------------------------
select is(pg_temp.tq(format($sql$
  select pg_temp.pub(%L::uuid,
    jsonb_build_array(pg_temp.f1('document_date', '2026-07-12'),
                      pg_temp.f1('provider', 'Mercy Hospital')),
    jsonb_build_array(pg_temp.dp('financial'), pg_temp.dp('medical')))
    || '/' || pg_temp.st(%L::uuid) $sql$,
  current_setting('t.ar_b'), current_setting('t.ar_b'))),
  'advanced/duplicate_suspected_stage2',
  'FINDING 3a: a SECOND drafted document proposal whose category matches is honoured — the detector no longer stops at the first (write_proposals admits 50 with no document-kind limit)');

select is(pg_temp.tq(format($sql$
  select pg_temp.pub(%L::uuid,
    jsonb_build_array(pg_temp.f1('document_date', '2026-07-12'),
                      pg_temp.f1('provider', 'Mercy Hospital')),
    jsonb_build_array(pg_temp.dp('medical'), pg_temp.dp('financial')))
    || '/' || pg_temp.st(%L::uuid) $sql$,
  current_setting('t.ar_c'), current_setting('t.ar_c'))),
  'advanced/duplicate_suspected_stage2',
  'FINDING 3a (the pair): the SAME two categories in the OPPOSITE order reach the SAME outcome — detection is order-independent, not payload-order-dependent');

select is(pg_temp.tq(format($sql$
  select pg_temp.pub(%L::uuid,
    jsonb_build_array(pg_temp.f1('document_date', '2026-01-01'),
                      pg_temp.f1('document_date', '2026-07-12'),
                      pg_temp.f1('provider', 'Mercy Hospital')),
    jsonb_build_array(pg_temp.dp('medical')))
    || '/' || pg_temp.st(%L::uuid) $sql$,
  current_setting('t.ar_d'), current_setting('t.ar_d'))),
  'advanced/duplicate_suspected_stage2',
  'FINDING 3b: a REPEATED key field corroborates when ANY value matches — the candidate side already matched with EXISTS; the arrival side now does too (write_extractions admits 200 facts, no per-field uniqueness)');

-- ----------------------------------------------------------------------------
-- 5–6 · The settled contract is UNCHANGED by the fix: the false-positive
--     guard and "absence never wildcards" still hold with multi-valued
--     payloads. Green on both legs — these pin what must NOT move.
-- ----------------------------------------------------------------------------
select is(pg_temp.tq(format($sql$
  select pg_temp.pub(%L::uuid,
    jsonb_build_array(pg_temp.f1('document_date', '2026-07-12'),
                      pg_temp.f1('provider', 'Cedar Clinic'),
                      pg_temp.f1('provider', 'Elm Clinic')),
    jsonb_build_array(pg_temp.dp('medical'), pg_temp.dp('financial')))
    || '/' || pg_temp.st(%L::uuid) $sql$,
  current_setting('t.ar_e'), current_setting('t.ar_e'))),
  'advanced/extracted',
  'the FP guard survives set semantics: same type+date but NO corroborating pair equal on both sides (two providers, neither the candidate''s) ⇒ no suspect');

select is(pg_temp.tq(format($sql$
  select pg_temp.pub(%L::uuid,
    jsonb_build_array(pg_temp.f1('provider', 'Mercy Hospital')),
    jsonb_build_array(pg_temp.dp('medical'), pg_temp.dp('financial')))
    || '/' || pg_temp.st(%L::uuid) $sql$,
  current_setting('t.ar_f'), current_setting('t.ar_f'))),
  'advanced/extracted',
  'absence still never wildcards: no document_date on the arrival side ⇒ no suspect, however many categories are drafted');

-- ----------------------------------------------------------------------------
-- 7–8 · FINDING 2: the live-actor guard. Rosa is soft-deleted while her
--     coordinator membership stays live — the shape a future account-
--     deletion path must not be able to exploit.
-- ----------------------------------------------------------------------------
do $$
begin
  update public.accounts set deleted_at = now()
   where id = current_setting('t.u1')::uuid;
end $$;

select is(pg_temp.probe(current_setting('t.u1')::uuid, format($sql$
  select count(*)::text from hc.list_known_senders(%L::uuid) $sql$,
  current_setting('t.c1'))), 'ERROR:P0001',
  'FINDING 2: a SOFT-DELETED coordinator with a live membership is refused by hc.list_known_senders (sender_refused) — the live-actor guard log_artifact_read already carries, now symmetric across the read');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format($sql$
  select hc.log_artifact_read(%L::uuid)::text $sql$,
  current_setting('t.ar_b'))), 'ERROR:P0001',
  'the control: hc.log_artifact_read already refuses that same soft-deleted actor — this is the shape finding 2 asked list_known_senders to match');

select * from finish();
rollback;
