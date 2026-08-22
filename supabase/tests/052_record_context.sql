-- ============================================================================
-- 5A · M2 — hc.record_context_for(p_arrival): §3.10's letter with the
-- SETTLED inclusion priority (docs/review/slice-5-plan.md M2; §6.6;
-- PRD §6.4). The contract these tests pin:
--
--   · SURFACE: hc_pipeline-only EXECUTE (owner hc_internal, revoked from
--     everything else — §3.10 verbatim); SECURITY DEFINER, STABLE.
--   · SIGNATURE-BOUNDEDNESS: the one parameter is the arrival; circle and
--     subject derive from its row — a cross-subject or cross-circle read
--     is not expressible. DEF-10: nonexistent and deleted arrivals land
--     in ONE refusal shape.
--   · SHAPE (§6.6): the subject's current profile_facts · recent
--     timeline_events · open tasks · documents in the same categories as
--     the arrival's own pending document proposals — that subject, that
--     circle, nothing else.
--   · INCLUSION PRIORITY (settled at the gate, not here): current facts
--     in PRD §6.4's high-risk classes are NEVER truncated and never lose
--     their place to merely-recent standard rows; the remaining sections
--     cap by recency; A TRUNCATED SECTION SAYS SO in the payload
--     (truncated + omitted — §6.8's honest limits: interpretation is
--     never handed a partial record presented as complete).
--   · BYTE-STABILITY: deterministic ordering and deterministic timestamp
--     rendering; the subject-record sections are byte-identical across
--     arrivals of the same subject (the §6.6 cache-prefix property) —
--     only the documents section may vary, and only with the arrival's
--     own proposal categories.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(24);

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

-- ----------------------------------------------------------------------------
-- Fixtures: c1 with TWO subjects (Nell + Frank — same-circle isolation);
-- c2 with Ivy (cross-circle isolation). Record rows land as postgres.
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
      'forwarding_local_part', 'cc52-nell-' || substr(gen_random_uuid()::text, 1, 8)),
    jsonb_build_object(
      'first_name', 'Frank', 'situation', 'aging in place',
      'postal_code', '02138', 'timezone', 'America/New_York',
      'accent_color', 'clay',
      'forwarding_local_part', 'cc52-frank-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

select set_config('t.c2res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Ivy''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Ivy', 'situation', 'aging in place',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'moss',
    'forwarding_local_part', 'cc52-ivy-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

do $$
declare
  v_u1   uuid := current_setting('t.u1')::uuid;
  v_c1   uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_c2   uuid := (pg_temp.jf(current_setting('t.c2res'), 'circle_id'))::uuid;
  v_nell uuid; v_frank uuid; v_ivy uuid;
  a1 uuid; a1b uuid; a2 uuid; a3 uuid; a4 uuid; a_gone uuid;
  i int;
begin
  if v_c1 is null or v_c2 is null then return; end if;  -- red leg: fail cleanly
  select s.id into v_nell  from public.subjects s where s.circle_id = v_c1 and s.first_name = 'Nell';
  select s.id into v_frank from public.subjects s where s.circle_id = v_c1 and s.first_name = 'Frank';
  select s.id into v_ivy   from public.subjects s where s.circle_id = v_c2 and s.first_name = 'Ivy';

  -- Arrivals: a1/a1b (Nell, medical proposal) · a2 (Nell, insurance
  -- proposal) · a3 (Nell, no document proposal) · a4 (Ivy) · a_gone.
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (v_c1, v_nell, 'upload', 'interpreting'::hc.arrival_state) returning id into a1;
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (v_c1, v_nell, 'upload', 'interpreting'::hc.arrival_state) returning id into a1b;
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (v_c1, v_nell, 'upload', 'interpreting'::hc.arrival_state) returning id into a2;
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (v_c1, v_nell, 'upload', 'interpreting'::hc.arrival_state) returning id into a3;
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (v_c2, v_ivy, 'upload', 'interpreting'::hc.arrival_state) returning id into a4;
  insert into public.arrivals (circle_id, subject_id, channel, state, deleted_at)
  values (v_c1, v_nell, 'upload', 'interpreting'::hc.arrival_state, now()) returning id into a_gone;

  insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
  values
    (a1,  v_c1, v_nell, 'document'::hc.proposal_kind,
     jsonb_build_object('title', 'Discharge summary', 'category', 'medical'), '{}'::hc.domain[]),
    (a1b, v_c1, v_nell, 'document'::hc.proposal_kind,
     jsonb_build_object('title', 'Visit summary', 'category', 'medical'), '{}'::hc.domain[]),
    (a2,  v_c1, v_nell, 'document'::hc.proposal_kind,
     jsonb_build_object('title', 'EOB', 'category', 'insurance'), '{}'::hc.domain[]);

  -- profile_facts: 3 high-risk · 208 standard (approved_at desc by number:
  -- std_fact_001 newest) · one superseded · one deleted · Frank sentinel.
  insert into public.profile_facts
    (circle_id, subject_id, field, value, risk_class, approved_by, approved_at,
     approver_display_name, taint)
  values
    (v_c1, v_nell, 'medication_lisinopril_dose', '"10mg daily"'::jsonb,
     'high'::hc.risk_class, v_u1, now() - interval '400 days', 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_nell, 'allergy_penicillin', '"anaphylaxis"'::jsonb,
     'high'::hc.risk_class, v_u1, now() - interval '500 days', 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_nell, 'directive_healthcare_proxy', '"Rosa"'::jsonb,
     'high'::hc.risk_class, v_u1, now() - interval '600 days', 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_frank, 'frank_secret_med', '"private"'::jsonb,
     'high'::hc.risk_class, v_u1, now(), 'Rosa', '{}'::hc.domain[]);

  for i in 1..208 loop
    insert into public.profile_facts
      (circle_id, subject_id, field, value, risk_class, approved_by, approved_at,
       approver_display_name, taint)
    values (v_c1, v_nell, 'std_fact_' || lpad(i::text, 3, '0'),
            to_jsonb(i), 'standard'::hc.risk_class, v_u1,
            now() - (i || ' minutes')::interval, 'Rosa', '{}'::hc.domain[]);
  end loop;

  insert into public.profile_facts
    (circle_id, subject_id, field, value, risk_class, approved_by, approved_at,
     approver_display_name, taint, superseded_at)
  values (v_c1, v_nell, 'std_superseded', '"old"'::jsonb, 'standard'::hc.risk_class,
          v_u1, now(), 'Rosa', '{}'::hc.domain[], now());
  insert into public.profile_facts
    (circle_id, subject_id, field, value, risk_class, approved_by, approved_at,
     approver_display_name, taint, deleted_at)
  values (v_c1, v_nell, 'std_deleted', '"gone"'::jsonb, 'standard'::hc.risk_class,
          v_u1, now(), 'Rosa', '{}'::hc.domain[], now());

  -- timeline_events: the three temporal shapes (named, newest) + 105
  -- old filler + Frank sentinel. Recency key = coalesce(local_at,
  -- occurred_on::timestamp) — naive, deterministic.
  insert into public.timeline_events
    (circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
     approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_nell, 'medical'::hc.timeline_kind, 'EVT-DATE-AUG01',
          date '2026-08-01', 'America/New_York',
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  insert into public.timeline_events
    (circle_id, subject_id, kind, summary, local_at, iana_zone, instant,
     approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_nell, 'medical'::hc.timeline_kind, 'EVT-TIMED-AUG10',
          timestamp '2026-08-10 09:00', 'America/New_York',
          timestamptz '2026-08-10 13:00+00',
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  insert into public.timeline_events
    (circle_id, subject_id, kind, summary, local_at, is_floating,
     approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_nell, 'care'::hc.timeline_kind, 'EVT-FLOAT-AUG05',
          timestamp '2026-08-05 12:00', true,
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  for i in 1..105 loop
    insert into public.timeline_events
      (circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
       approved_by, approved_at, approver_display_name, taint)
    values (v_c1, v_nell, 'admin'::hc.timeline_kind, 'FILLER-' || lpad(i::text, 3, '0'),
            date '2020-01-01' + i, 'America/New_York',
            v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  end loop;
  insert into public.timeline_events
    (circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
     approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_frank, 'medical'::hc.timeline_kind, 'FRANK-EVT',
          date '2026-08-15', 'America/New_York',
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);

  -- tasks: three open (due asc, one dateless), one done, one cancelled,
  -- one deleted, one Frank.
  insert into public.tasks (circle_id, subject_id, title, due_on, due_zone,
                            approved_by, approved_at, approver_display_name, taint)
  values
    (v_c1, v_nell, 'TASK-EARLY', date '2026-09-01', 'America/New_York',
     v_u1, now(), 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_nell, 'TASK-LATE', date '2026-10-01', 'America/New_York',
     v_u1, now(), 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_nell, 'TASK-NODATE', null, null,
     v_u1, now(), 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_frank, 'FRANK-TASK', null, null,
     v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  insert into public.tasks (circle_id, subject_id, title, status, completed_by,
                            completed_at, approved_by, approved_at,
                            approver_display_name, taint)
  values (v_c1, v_nell, 'TASK-DONE', 'done', v_u1, now(),
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  insert into public.tasks (circle_id, subject_id, title, status,
                            approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_nell, 'TASK-CANCELLED', 'cancelled',
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  insert into public.tasks (circle_id, subject_id, title, deleted_at,
                            approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_nell, 'TASK-DELETED', now(),
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);

  -- documents: two live medical (filed desc), one deleted medical, one
  -- insurance, one Frank medical.
  insert into public.documents (circle_id, subject_id, title, category,
                                summary_text, artifact_arrival_id, filed_at,
                                approved_by, approved_at, approver_display_name, taint)
  values
    (v_c1, v_nell, 'DOC-MED-NEW', 'medical'::hc.doc_category, 'newest',
     a1, now() - interval '1 day', v_u1, now(), 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_nell, 'DOC-MED-OLD', 'medical'::hc.doc_category, 'older',
     a1, now() - interval '10 days', v_u1, now(), 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_nell, 'DOC-INS', 'insurance'::hc.doc_category, 'eob',
     a1, now() - interval '2 days', v_u1, now(), 'Rosa', '{}'::hc.domain[]),
    (v_c1, v_frank, 'FRANK-DOC', 'medical'::hc.doc_category, 'frank',
     a1, now() - interval '1 day', v_u1, now(), 'Rosa', '{}'::hc.domain[]);
  insert into public.documents (circle_id, subject_id, title, category,
                                summary_text, artifact_arrival_id, filed_at,
                                deleted_at,
                                approved_by, approved_at, approver_display_name, taint)
  values (v_c1, v_nell, 'DOC-MED-DELETED', 'medical'::hc.doc_category, 'gone',
          a1, now() - interval '3 days', now(),
          v_u1, now(), 'Rosa', '{}'::hc.domain[]);

  perform set_config('t.c1', v_c1::text, true);
  perform set_config('t.c2', v_c2::text, true);
  perform set_config('t.nell', v_nell::text, true);
  perform set_config('t.frank', v_frank::text, true);
  perform set_config('t.ivy', v_ivy::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.a1b', a1b::text, true);
  perform set_config('t.a2', a2::text, true);
  perform set_config('t.a3', a3::text, true);
  perform set_config('t.a4', a4::text, true);
  perform set_config('t.gone', a_gone::text, true);
end $$;

-- Materialise the payloads once (as postgres — the EXECUTE surface is
-- asserted from the catalog; one live hc_pipeline probe below proves the
-- granted path runs). Red leg: the table stays empty, tests fail cleanly.
create temp table ctx (name text primary key, j jsonb);
do $$ begin
  insert into ctx values
    ('a1',      hc.record_context_for(current_setting('t.a1')::uuid)),
    ('a1again', hc.record_context_for(current_setting('t.a1')::uuid)),
    ('a1b',     hc.record_context_for(current_setting('t.a1b')::uuid)),
    ('a2',      hc.record_context_for(current_setting('t.a2')::uuid)),
    ('a3',      hc.record_context_for(current_setting('t.a3')::uuid)),
    ('a4',      hc.record_context_for(current_setting('t.a4')::uuid));
exception when others then null;
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · The surface: §3.10's letter.
-- ----------------------------------------------------------------------------
select has_function('hc', 'record_context_for', array['uuid']::name[],
  'hc.record_context_for(p_arrival) exists — the §3.10 pipeline read');

create temp view fn_exec as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(exists (select 1 from fn_exec where proname = 'record_context_for'
                                          and rolname = 'hc_pipeline')
      and not exists (select 1 from fn_exec where proname = 'record_context_for'
                                              and rolname in ('anon', 'authenticated', 'hc_admin')),
  'EXECUTE is hc_pipeline ONLY — no request-path or admin role reads the record through it (catalog-asserted; the segfault trap forbids dialling)');

select ok((
  select p.prosecdef and p.provolatile = 's'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc' and p.proname = 'record_context_for'),
  'SECURITY DEFINER and STABLE — one read, no writes, as §3.10 sketches');

-- ----------------------------------------------------------------------------
-- 4–5 · DEF-10: nonexistent and deleted arrivals land in ONE shape.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline',
  format($$ select hc.record_context_for(%L)::text $$, gen_random_uuid())),
  'ERROR:P0001', 'a nonexistent arrival refuses in the normalised shape');
select is(pg_temp.probe_role('hc_pipeline',
  format($$ select hc.record_context_for(%L)::text $$, current_setting('t.gone'))),
  'ERROR:P0001', 'a deleted arrival refuses in the SAME shape');

-- ----------------------------------------------------------------------------
-- 6–8 · The shape: exact keys; scoping ids; the live hc_pipeline path.
-- ----------------------------------------------------------------------------
select is((
  select array_agg(k order by k) from jsonb_object_keys(
    (select j from ctx where name = 'a1')) k),
  array['circle_id', 'documents', 'open_tasks', 'profile_facts',
        'subject_id', 'timeline_events'],
  'the payload carries exactly the §6.6 sections plus its scoping ids');

select is(pg_temp.jf(pg_temp.probe_role('hc_pipeline',
  format($$ select hc.record_context_for(%L)::text $$, current_setting('t.a1'))),
  'subject_id'), current_setting('t.nell'),
  'the granted path runs LIVE as hc_pipeline, and the subject is the arrival''s own');

select is((select j ->> 'circle_id' from ctx where name = 'a1'),
  current_setting('t.c1'),
  'the circle is the arrival''s own — both ids derived, neither expressible as input');

-- ----------------------------------------------------------------------------
-- 9–12 · profile_facts: the SETTLED inclusion priority.
-- ----------------------------------------------------------------------------
select is((
  select count(*)::int from jsonb_array_elements(
    (select j from ctx where name = 'a1') -> 'profile_facts' -> 'rows') r
  where r ->> 'risk_class' = 'high'), 3,
  'every current HIGH-RISK fact is present — allergies, medications, directives never lose their place');

select ok((
  select (s -> 'truncated')::boolean = true
     and (s ->> 'omitted')::int = 8
     and (select count(*) from jsonb_array_elements(s -> 'rows') r
          where r ->> 'risk_class' = 'standard') = 200
  from (select (select j from ctx where name = 'a1') -> 'profile_facts' as s) x),
  'standard facts cap at 200 BY RECENCY and the section says so: truncated=true, omitted=8 — never a partial record presented as complete');

select ok((
  select jsonb_path_exists(s, '$.rows[*].field ? (@ == "std_fact_001")')
     and jsonb_path_exists(s, '$.rows[*].field ? (@ == "std_fact_200")')
     and not jsonb_path_exists(s, '$.rows[*].field ? (@ == "std_fact_201")')
     and not jsonb_path_exists(s, '$.rows[*].field ? (@ == "std_fact_208")')
  from (select (select j from ctx where name = 'a1') -> 'profile_facts' as s) x),
  'the omitted standard facts are exactly the OLDEST — recency decides, position does not');

select ok((
  select not jsonb_path_exists(s, '$.rows[*].field ? (@ == "std_superseded")')
     and not jsonb_path_exists(s, '$.rows[*].field ? (@ == "std_deleted")')
  from (select (select j from ctx where name = 'a1') -> 'profile_facts' as s) x),
  'superseded and deleted facts are absent — CURRENT means current');

-- ----------------------------------------------------------------------------
-- 13 · Ordering inside the facts section is deterministic (field asc).
-- ----------------------------------------------------------------------------
select ok((
  select bool_and(ordered) from (
    select (lag(r ->> 'field') over (order by idx)) is null
        or (lag(r ->> 'field') over (order by idx)) < (r ->> 'field') as ordered
    from jsonb_array_elements(
      (select j from ctx where name = 'a1') -> 'profile_facts' -> 'rows')
      with ordinality t(r, idx)) y),
  'fact rows are ordered by field asc — a stable surface, byte-stable per subject');

-- ----------------------------------------------------------------------------
-- 14–15 · Same-circle and cross-circle isolation, by signature.
-- ----------------------------------------------------------------------------
select ok((
  select not (j::text like '%frank_secret_med%')
     and not (j::text like '%FRANK-EVT%')
     and not (j::text like '%FRANK-TASK%')
     and not (j::text like '%FRANK-DOC%')
  from ctx where name = 'a1'),
  'NOTHING of the other subject in the same circle appears — cross-subject is not expressible');

select ok((
  select (j ->> 'subject_id') = current_setting('t.ivy')
     and not (j::text like '%std_fact_%')
     and not (j::text like '%DOC-MED%')
  from ctx where name = 'a4'),
  'a foreign circle''s arrival reads ITS OWN subject''s (empty) record — nothing of Nell crosses the circle');

-- ----------------------------------------------------------------------------
-- 16–17 · timeline_events: recency order (the naive deterministic key),
-- the cap, and the honest truncation flag.
-- ----------------------------------------------------------------------------
select is((
  select string_agg(r ->> 'summary', ',' order by idx)
  from (select r, idx from jsonb_array_elements(
          (select j from ctx where name = 'a1') -> 'timeline_events' -> 'rows')
          with ordinality t(r, idx)
        where idx <= 3) y),
  'EVT-TIMED-AUG10,EVT-FLOAT-AUG05,EVT-DATE-AUG01',
  'recent first, across all three temporal shapes (naive local recency key — deterministic, no TZ dependence)');

select ok((
  select jsonb_array_length(s -> 'rows') = 100
     and (s -> 'truncated')::boolean = true
     and (s ->> 'omitted')::int = 8
  from (select (select j from ctx where name = 'a1') -> 'timeline_events' as s) x),
  'the timeline caps at 100 by recency and says so: truncated=true, omitted=8');

-- ----------------------------------------------------------------------------
-- 18–19 · open tasks: open ONLY, due-date order, honest flag when under cap.
-- ----------------------------------------------------------------------------
select is((
  select string_agg(r ->> 'title', ',' order by idx)
  from jsonb_array_elements(
    (select j from ctx where name = 'a1') -> 'open_tasks' -> 'rows')
    with ordinality t(r, idx)),
  'TASK-EARLY,TASK-LATE,TASK-NODATE',
  'open tasks only, due_on asc with dateless last — done, cancelled and deleted are absent');

select ok((
  select (s -> 'truncated')::boolean = false and (s ->> 'omitted')::int = 0
  from (select (select j from ctx where name = 'a1') -> 'open_tasks' as s) x),
  'a section under its cap says truncated=false, omitted=0 — honesty in both directions');

-- ----------------------------------------------------------------------------
-- 20–22 · documents: the arrival''s own proposal categories, current rows,
-- filed_at desc; no proposal → empty, deterministic, never an error.
-- ----------------------------------------------------------------------------
select ok((
  select (s -> 'categories') = '["medical"]'::jsonb
     and (select string_agg(r ->> 'title', ',' order by idx)
          from jsonb_array_elements(s -> 'rows') with ordinality t(r, idx))
         = 'DOC-MED-NEW,DOC-MED-OLD'
  from (select (select j from ctx where name = 'a1') -> 'documents' as s) x),
  'documents = the SAME categories as the arrival''s pending document proposals, filed_at desc — the deleted and off-category rows absent');

select ok((
  select (s -> 'categories') = '["insurance"]'::jsonb
     and (select string_agg(r ->> 'title', ',' order by idx)
          from jsonb_array_elements(s -> 'rows') with ordinality t(r, idx))
         = 'DOC-INS'
  from (select (select j from ctx where name = 'a2') -> 'documents' as s) x),
  'a different arrival''s categories select different documents — the one arrival-dependent section');

select ok((
  select (s -> 'categories') = '[]'::jsonb
     and (s -> 'rows') = '[]'::jsonb
     and (s -> 'truncated')::boolean = false
  from (select (select j from ctx where name = 'a3') -> 'documents' as s) x),
  'no document proposal → empty categories and rows, deterministically — never an error');

-- ----------------------------------------------------------------------------
-- 23–24 · Byte-stability: identical calls identical; the subject-record
-- sections identical ACROSS arrivals of the same subject (§6.6''s cache
-- prefix); only documents may differ, and only with the categories.
-- ----------------------------------------------------------------------------
select ok((
  select (select j::text from ctx where name = 'a1')
       = (select j::text from ctx where name = 'a1again')
    and (select j::text from ctx where name = 'a1') is not null),
  'the same arrival renders byte-identically on every call');

select ok((
  select a.j - 'documents' = b.j - 'documents'
     and a.j - 'documents' = c.j - 'documents'
     and a.j -> 'documents' <> c.j -> 'documents'
  from (select j from ctx where name = 'a1')  a,
       (select j from ctx where name = 'a1b') b,
       (select j from ctx where name = 'a2')  c),
  'the subject-record sections are byte-stable across the subject''s arrivals — only documents varies, and only with the arrival''s own categories');

select * from finish();
rollback;
