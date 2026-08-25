-- ============================================================================
-- 5A · M5 — stage-2 duplicates (docs/review/slice-5-plan.md M5; TSD §4.7
-- point 2; PRD §8.9; ADR-0017 D8; ADR-0018; Q8 SETTLED). The contract
-- these tests pin:
--
--   · THE STATE (Q8): a DISTINCT internal state for post-extract
--     suspects — 'duplicate_suspected_stage2' — family label stays
--     'Looks like a duplicate', its OWN state_rank row; the graph
--     encodes extracting → <state> and <state> → interpreting |
--     nothing_filed, so a stage-1 suspect resuming toward interpret is
--     GRAPH-illegal, not merely machinery-refused (the ING-10 closed-
--     graph philosophy).
--   · THE MATCHING CONTRACT (settled at the gate): candidates are the
--     SAME CIRCLE and SAME SUBJECT's filed, current documents; the
--     predicate is normalised equality on document type + date + at
--     least one corroborating field (provider / amount / policy number),
--     every contributing field PRESENT on both sides — absence never
--     wildcards; exact-after-normalisation (lower/trim; tolerance
--     windows are a BGT-01-style provisional revision by migration,
--     never silent); candidate selection deterministic — the most-
--     recently-filed match wins, ties on id; one suspect references one
--     canonical target (arrivals.duplicate_of_document_id).
--   · DETECTION runs inside hc.finalize_extraction's transaction on
--     successful publication (the D8 stage-1-in-finalize_scan
--     precedent): the work answer still lands IN FULL — facts,
--     proposals, and a PUBLISHED run — the duplicate question is held
--     by state.
--   · THE TWO HUMAN RESOLUTIONS: 'different' resumes to interpret via a
--     real lease + the CAS + an outbox re-queue (the SND-02/D8
--     pattern); 'same_thing' attaches the arrival to the matched
--     document as an ADDITIONAL SOURCE (provenance_edges — the document
--     now cites both) and files nothing new (ADR-0017 D8's refinement
--     lands). Never auto-discarded either way.
--   · THE ADR-0018 SAME-EMAIL PAIR, PINNED BY NAME: the identical pair
--     that stage 1's strictly-earlier ordering deliberately lets both
--     scan clean is caught here by the key-field match.
--   · Per-document-class FALSE-POSITIVE and FALSE-NEGATIVE fixtures:
--     same type+date different provider ⇒ no suspect · missing date ⇒
--     no suspect (absence never wildcards) · another subject's
--     identical document ⇒ no suspect · another category ⇒ no suspect ·
--     amount-corroborated with provider absent ⇒ suspect.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(23);

-- ----------------------------------------------------------------------------
-- Helpers (the 043/051/053 pattern).
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

-- Fact-array builder over the M5 canonical key fields (null = absent;
-- one summary fact keeps every publication non-empty).
create function pg_temp.fx(p_date text, p_prov text, p_amt text, p_pol text)
returns jsonb language sql as $$
  select jsonb_agg(f) from (
    select jsonb_build_object('field', x.f, 'value', to_jsonb(x.v),
             'confidence', 0.9, 'risk_class', 'standard',
             'citation', jsonb_build_object('page', 1),
             'model_id', 'm1', 'prompt_version', 'p1') as f
    from (values ('document_date', p_date), ('provider', p_prov),
                 ('amount', p_amt), ('policy_number', p_pol),
                 ('summary_note', 'fixture')) x(f, v)
    where x.v is not null) y;
$$;

-- Claim + publish as the pipeline in one step; answers the CAS result.
create function pg_temp.publish(p_arr text, p_facts jsonb, p_cat text)
returns text language plpgsql as $$
declare r record; v hc.advance_result; props jsonb;
begin
  select * into r from hc.claim_stage(p_arr::uuid, 'extract', 'm1', 'p1');
  if r.result <> 'claimed' then return 'claim:' || r.result::text; end if;
  props := case when p_cat is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object(
                  'kind', 'document',
                  'payload', jsonb_build_object('title', 'Fixture doc',
                                                'category', p_cat))) end;
  v := hc.finalize_extraction(p_arr::uuid, r.lease_id, p_facts, props);
  return v::text;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures. Rosa founds c1 with Nell + Frank. The candidate documents —
-- dA (medical, older), dA2 (medical, NEWER — the deterministic winner),
-- dF (Frank's identical one) — each filed from its own arrival whose
-- live extractions carry the key fields.
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
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
      'forwarding_local_part', 'cc55-nell-' || substr(gen_random_uuid()::text, 1, 8)),
    jsonb_build_object(
      'first_name', 'Frank', 'situation', 'aging in place',
      'postal_code', '02138', 'timezone', 'America/New_York',
      'accent_color', 'clay',
      'forwarding_local_part', 'cc55-frank-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

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

do $$
declare
  v_u1 uuid := current_setting('t.u1')::uuid;
  v_c1 uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid; v_frank uuid;
  dA uuid; dA2 uuid; dF uuid;
  v_names text[] := array['b','c','d','e','g','h','i'];
  v_n text; v_id uuid;
begin
  if v_c1 is null then return; end if;   -- red leg: fail cleanly
  select s.id into v_nell  from public.subjects s where s.circle_id = v_c1 and s.first_name = 'Nell';
  select s.id into v_frank from public.subjects s where s.circle_id = v_c1 and s.first_name = 'Frank';

  -- ADR-0018's first email, FILED: the canonical target.
  dA := pg_temp.mk_candidate(v_c1, v_nell, 'Discharge summary (Jul 12)', 'medical',
        now() - interval '10 days', '2026-07-12', 'Mercy Hospital', '$1,240.00', null, v_u1);
  -- A second, NEWER match for the determinism pin.
  dA2 := pg_temp.mk_candidate(v_c1, v_nell, 'Discharge summary (refiled)', 'medical',
         now() - interval '2 days', '2026-07-12', 'Mercy Hospital', '$1,240.00', null, v_u1);
  -- Frank's identical document — the SAME-SUBJECT scope must exclude it.
  dF := pg_temp.mk_candidate(v_c1, v_frank, 'Frank''s discharge summary', 'medical',
        now() - interval '1 day', '2026-06-01', 'Mercy Hospital', '$99.00', null, v_u1);

  foreach v_n in array v_names loop
    insert into public.arrivals (circle_id, subject_id, channel, state, sender_address)
    values (v_c1, v_nell, 'email', 'extracting'::hc.arrival_state,
            'billing@clinic.example')
    returning id into v_id;
    perform set_config('t.ar_' || v_n, v_id::text, true);
  end loop;

  perform set_config('t.c1', v_c1::text, true);
  perform set_config('t.nell', v_nell::text, true);
  perform set_config('t.frank', v_frank::text, true);
  perform set_config('t.dA', dA::text, true);
  perform set_config('t.dA2', dA2::text, true);
  perform set_config('t.dF', dF::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · The surface: the Q8 state, its graph, rank and label; the
-- canonical-target column; the detector's closure.
-- ----------------------------------------------------------------------------
select enum_has_labels('hc', 'arrival_state',
  array['received','store_failed','stored',
        'scanning','quarantined','scan_unavailable','scan_inconclusive','scanned',
        'extracting','extract_timeout','extract_failed','cancelled','extracted',
        'interpreting','proposals_ready',
        'held_unknown_sender','needs_password','duplicate_suspected',
        'filed','nothing_filed','unsupported_type',
        'duplicate_suspected_stage2'],
  'hc.arrival_state gains duplicate_suspected_stage2 — Q8''s DISTINCT internal state, appended last (append-only-safe)');

select is(pg_temp.tq($sql$
  select ((select count(*) from hc.arrival_transitions) = 24
    and exists (select 1 from hc.arrival_transitions
                where stage = 'extract' and from_state = 'extracting'
                  and to_state = 'duplicate_suspected_stage2')
    and exists (select 1 from hc.arrival_transitions
                where stage = 'gate' and from_state = 'duplicate_suspected_stage2'
                  and to_state = 'interpreting')
    and exists (select 1 from hc.arrival_transitions
                where stage = 'gate' and from_state = 'duplicate_suspected_stage2'
                  and to_state = 'nothing_filed'))::text $sql$), 'true',
  -- AMENDED at round 16 (5B M8): 21 -> 22, and again at 6A M3: 22 -> 24.
  -- This leg pins that M5 added EXACTLY its three Q8 edges, and it still
  -- does — all three are asserted by name below and none is touched. The
  -- COUNT moved twice for reasons that are not M5's: 5B M8 added
  -- interpret's failure edge (R4/F-2, ADR-0023 D21), and 6A M3 added the
  -- LOOP's two exits (review: proposals_ready → filed | nothing_filed),
  -- without which every arrival that reached "Needs you" stayed there for
  -- ever. Both are pinned BY NAME elsewhere — 058 and 061 — and the count
  -- here keeps the graph closed against anything unnamed.
  'the closed graph grows by EXACTLY the three Q8 edges: extracting → <state> and <state> → interpreting | nothing_filed (24 rows after 5B M8 and 6A M3)');

select ok((
  select count(*) = 22 and count(distinct hc.state_rank(x)) = 22
     and bool_and(hc.state_rank(x) is not null)
     and bool_and(hc.state_label(x) is not null)
  from unnest(enum_range(null::hc.arrival_state)) x),
  'state_rank and state_label stay TOTAL and rank stays injective over all 22 states — the 046 guard extends');

select is(pg_temp.tq($sql$
  select (hc.state_label('duplicate_suspected_stage2'::hc.arrival_state)
            = 'Looks like a duplicate'
      and hc.state_rank('duplicate_suspected_stage2'::hc.arrival_state)
            < hc.state_rank('extracting'::hc.arrival_state))::text $sql$), 'true',
  'the family label stays "Looks like a duplicate" (Q8) and the suspect ranks BELOW the worker states — a waiting question surfaces in the parent rollup');

select has_column('public', 'arrivals', 'duplicate_of_document_id',
  'arrivals.duplicate_of_document_id exists — one suspect references ONE canonical target');

create temp view fn_exec as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(exists (select 1 from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hc' and p.proname = 'detect_stage2_duplicate')
      and not exists (select 1 from fn_exec
                      where proname = 'detect_stage2_duplicate'
                        and rolname in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin')),
  'hc.detect_stage2_duplicate exists, owner-only — reachable ONLY from inside finalize_extraction (the detect_duplicate precedent)');

-- ----------------------------------------------------------------------------
-- 7–10 · THE ADR-0018 SAME-EMAIL PAIR, BY NAME: the identical second
-- email — values differing only in case and whitespace — is caught by
-- the key-field match; the work answer lands in full.
-- ----------------------------------------------------------------------------
select set_config('t.pub_b', pg_temp.publish(current_setting('t.ar_b'),
  pg_temp.fx('2026-07-12', '  MERCY hospital ', '$1,240.00', null), 'medical'), true);

select is(pg_temp.tq(format($sql$
  select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_b'))), 'duplicate_suspected_stage2',
  'THE ADR-0018 SAME-EMAIL PAIR: the identical second email — which stage 1''s strictly-earlier ordering deliberately let scan clean — is caught by the key-field match, exact-after-normalisation (case and whitespace differ)');

select is(pg_temp.tq(format($sql$
  select a.duplicate_of_document_id::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_b'))), current_setting('t.dA2'),
  'the canonical target is stored on the arrival — and it is the MOST-RECENTLY-FILED match (dA2, not the older dA)');

select ok(
  pg_temp.tq(format($sql$
    select count(*)::text from public.extractions e
    where e.arrival_id = %L::uuid and e.superseded_at is null $sql$,
    current_setting('t.ar_b'))) = '4'
  and pg_temp.tq(format($sql$
    select count(*)::text from public.proposals p
    where p.arrival_id = %L::uuid and p.status = 'pending' $sql$,
    current_setting('t.ar_b'))) = '1',
  'the work answer lands IN FULL — facts and the drafted proposal are written; the duplicate question is held by STATE, not by discarding work');

select is(pg_temp.tq(format($sql$
  select r.outcome from public.extraction_runs r
  join public.pipeline_leases l on l.id = r.lease_id
  where r.arrival_id = %L::uuid
  order by r.attempt_no desc limit 1 $sql$,
  current_setting('t.ar_b'))), 'published',
  'the run closes PUBLISHED — a suspect publication is a successful extraction, not a failure class');

-- ----------------------------------------------------------------------------
-- 11–14 · The FALSE-POSITIVE fixtures, per class: the predicate never
-- fires on absence, near-misses, other subjects or other categories.
-- ----------------------------------------------------------------------------
select set_config('t.pub_c', pg_temp.publish(current_setting('t.ar_c'),
  pg_temp.fx('2026-07-12', 'Other Clinic', null, null), 'medical'), true);
select is(pg_temp.tq(format($sql$
  select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_c'))), 'extracted',
  'FP · same type + date but a DIFFERENT provider and no other corroborating pair ⇒ no suspect');

select set_config('t.pub_d', pg_temp.publish(current_setting('t.ar_d'),
  pg_temp.fx(null, 'Mercy Hospital', '$1,240.00', null), 'medical'), true);
select is(pg_temp.tq(format($sql$
  select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_d'))), 'extracted',
  'FP · NO document date on the arrival ⇒ no suspect — absence never wildcards, however well the rest matches');

select set_config('t.pub_e', pg_temp.publish(current_setting('t.ar_e'),
  pg_temp.fx('2026-06-01', 'Mercy Hospital', '$99.00', null), 'medical'), true);
select is(pg_temp.tq(format($sql$
  select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_e'))), 'extracted',
  'FP · an identical match on ANOTHER SUBJECT''s filed document ⇒ no suspect — same circle AND same subject, by construction');

select set_config('t.pub_g', pg_temp.publish(current_setting('t.ar_g'),
  pg_temp.fx('2026-07-12', 'Mercy Hospital', '$1,240.00', null), 'insurance'), true);
select is(pg_temp.tq(format($sql$
  select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_g'))), 'extracted',
  'FP · the same key fields proposed under ANOTHER CATEGORY ⇒ no suspect — document type is a required contributor');

-- ----------------------------------------------------------------------------
-- 15–16 · The FALSE-NEGATIVE guard and determinism.
-- ----------------------------------------------------------------------------
select set_config('t.pub_h', pg_temp.publish(current_setting('t.ar_h'),
  pg_temp.fx('2026-07-12', null, '$1,240.00', null), 'medical'), true);
select ok(
  pg_temp.tq(format($sql$
    select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
    current_setting('t.ar_h'))) = 'duplicate_suspected_stage2',
  'FN guard · type + date + a matching AMOUNT with provider absent ⇒ suspect — one corroborating pair suffices; an absent field neither blocks nor wildcards');

select set_config('t.pub_i', pg_temp.publish(current_setting('t.ar_i'),
  pg_temp.fx('2026-07-12', 'mercy hospital', null, null), 'medical'), true);
select is(pg_temp.tq(format($sql$
  select a.duplicate_of_document_id::text from public.arrivals a where a.id = %L::uuid $sql$,
  current_setting('t.ar_i'))), current_setting('t.dA2'),
  'DETERMINISM · with two candidates matching, the most-recently-filed wins (ties break on id) — one canonical target, always the same one');

-- ----------------------------------------------------------------------------
-- 17–19 · Resolution: DIFFERENT resumes to interpret through a real
-- lease + the CAS + the outbox (the SND-02/D8 pattern).
-- ----------------------------------------------------------------------------
select set_config('t.res_b', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.resolve_duplicate(%L, 'different')::text $sql$,
  current_setting('t.ar_b'))), true);

select ok(
  pg_temp.jf(current_setting('t.res_b'), 'resolution') = 'different'
  and pg_temp.tq(format($sql$
    select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
    current_setting('t.ar_b'))) = 'interpreting'
  and pg_temp.tq(format($sql$
    select count(*)::text from public.pipeline_outbox o
    where o.arrival_id = %L::uuid
      and o.reason_code = 'duplicate_resolved_different' $sql$,
    current_setting('t.ar_b'))) = '1',
  'DIFFERENT: the arrival resumes to interpreting through the CAS and the outbox re-queue lands in the SAME transaction');

select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select result::text from hc.claim_stage(%L::uuid, 'interpret') $sql$,
  current_setting('t.ar_b'))), 'claimed',
  'the resumed arrival is claimable for interpret — the resume is REAL, not cosmetic');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.resolve_duplicate(%L, 'different')::text $sql$,
  current_setting('t.ar_c'))), 'ERROR:P0001',
  'an arrival that is NOT a stage-2 suspect refuses resolution — the honest state diagnosis is reserved for suspects');

-- ----------------------------------------------------------------------------
-- 20 · Resolution: SAME_THING attaches the additional source and files
-- nothing new (ADR-0017 D8's refinement lands).
-- ----------------------------------------------------------------------------
select set_config('t.docs_before', pg_temp.tq(format($sql$
  select count(*)::text from public.documents d where d.circle_id = %L::uuid $sql$,
  current_setting('t.c1'))), true);
select set_config('t.res_h', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.resolve_duplicate(%L, 'same_thing')::text $sql$,
  current_setting('t.ar_h'))), true);

select ok(
  pg_temp.jf(current_setting('t.res_h'), 'resolution') = 'same_thing'
  and pg_temp.tq(format($sql$
    select a.state::text from public.arrivals a where a.id = %L::uuid $sql$,
    current_setting('t.ar_h'))) = 'nothing_filed'
  and pg_temp.tq(format($sql$
    select count(*)::text from public.provenance_edges e
    where e.child_type = 'document'::hc.object_type and e.child_id = %L::uuid
      and e.parent_type = 'arrival'::hc.object_type and e.parent_id = %L::uuid $sql$,
    current_setting('t.dA2'), current_setting('t.ar_h'))) = '1'
  and pg_temp.tq(format($sql$
    select count(*)::text from public.documents d where d.circle_id = %L::uuid $sql$,
    current_setting('t.c1'))) = current_setting('t.docs_before'),
  'SAME_THING: the matched document gains the arrival as an ADDITIONAL SOURCE (the document now cites both) and NOTHING new is filed — the arrival rests nothing_filed, never auto-discarded');

-- ----------------------------------------------------------------------------
-- 21–23 · Graph-illegality and the refusal shapes.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select result::text from hc.claim_stage(%L::uuid, 'interpret') $sql$,
  current_setting('t.ar_i'))), 'invalid_state',
  'a stage-2 suspect cannot be CLAIMED toward interpret — the wait is the machinery''s answer, not a queue accident');

do $$
declare v_arr uuid := current_setting('t.ar_i')::uuid;
        v_c uuid := current_setting('t.c1')::uuid;
        v_lease uuid; v_att int;
begin
  select coalesce(max(l.attempt_no), 0) + 1 into v_att
    from public.pipeline_leases l where l.arrival_id = v_arr;
  insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline)
  values (v_arr, v_c, 'gate', v_att, now() + interval '60 seconds')
  returning id into v_lease;
  update public.arrivals set current_lease_id = v_lease where id = v_arr;
  perform set_config('t.lease_i', v_lease::text, true);
exception when others then null;
end $$;

select is(pg_temp.probe_role('hc_pipeline', format(
  $sql$ select hc.advance_arrival(%L::uuid, 'duplicate_suspected_stage2',
                                  'scanned', %L::uuid)::text $sql$,
  current_setting('t.ar_i'), current_setting('t.lease_i'))), 'invalid_state',
  'a stage-2 suspect cannot take stage 1''s exit — the two suspect states are DISTINCT and their graphs do not cross (Q8)');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.resolve_duplicate(%L, 'merge')::text $sql$,
  current_setting('t.ar_i'))), 'ERROR:P0001',
  'the resolution vocabulary is closed: different and same_thing are the only words');

select * from finish();
rollback;
