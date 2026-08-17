-- ============================================================================
-- 1D · U1 — the search write path (TSD §2.11, §7.1; ADR-0002 claim 3).
--
-- Vectors are maintained by trigger in the same transaction as the content
-- (PRD §4.3.6): documents carry tsv_summary (title A + summary_text B and
-- NOTHING else — the §3.4 summary/view line drawn in the index); the
-- view-level text lives in document_search_content behind its own policy,
-- rebuilt from the SAME string the snippet is cut from (§7.1), in ONE
-- place (the dsc builder trigger). An edit to documents.title or
-- summary_text rebuilds the matching dsc row in the same transaction —
-- the A.5 rename regression. tasks and timeline_events carry one vector
-- because their whole rows are summary-readable (§2.11); the §2.11
-- invariant (no view-only column in a vector on a summary-readable table)
-- is pinned structurally: no column-level carve-out exists on either.
--
-- The writer allowlist for dsc is FINALIZED here (kickoff mandate,
-- REC-05 → DSC-01): hc_internal SELECT/INSERT/UPDATE exactly, nothing
-- for any request-path role, no DELETE for anyone (the document cascade
-- is the only remover). Every dsc write path originates from a documents
-- write (the sync trigger lives ON documents), so the ADR-0002 c3
-- documents-first lock order holds by construction.
--
-- RED (U1): no tsv trigger exists, dsc has zero grants and zero
-- triggers — the inventory pins (1–8) report the short lists, and every
-- vector assertion (10+) reports NULL.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(29);

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

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
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
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- manage×5 approver
  c1 uuid; s1 uuid; m1 uuid;
  a1 uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Sarah');
  insert into public.circles (name, created_by) values ('Search circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'sw-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values (a1, c1, s1, 'upload');

  -- approved extraction values — the source of dsc.extracted_text (§2.5)
  insert into public.extractions (id, arrival_id, circle_id, subject_id, field, value,
                                  confidence, risk_class, citation, model_id, prompt_version)
  values
    (e1, a1, c1, s1, 'medication', '"metoprolol 25mg daily"', 0.95, 'high',
     '{"page": 1, "bbox": [0.1, 0.1, 0.2, 0.05]}', 'fixture-model', 'v0'),
    (e2, a1, c1, s1, 'medication', '"furosemide 20mg"', 0.90, 'high',
     '{"page": 1, "bbox": [0.1, 0.2, 0.2, 0.05]}', 'fixture-model', 'v0');

  perform set_config('t.prop_doc', gen_random_uuid()::text, true);
  perform set_config('t.prop_task', gen_random_uuid()::text, true);
  perform set_config('t.prop_tl', gen_random_uuid()::text, true);
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload,
                                source_extraction_ids, taint) values
    (current_setting('t.prop_doc')::uuid, a1, c1, s1, 'document',
     jsonb_build_object('title', 'Discharge summary', 'category', 'medical',
                        'summary_text', 'Home with cardiology follow-up.'),
     array[e1, e2], '{health}'),
    (current_setting('t.prop_task')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Refill prescription', 'detail', 'Call the pharmacy line'),
     '{}', '{schedule}'),
    (current_setting('t.prop_tl')::uuid, a1, c1, s1, 'timeline_event',
     jsonb_build_object('kind', 'medical', 'summary', 'Cardiology appointment booked',
                        'occurred_on', '2026-08-14', 'occurred_zone', 'America/New_York'),
     '{}', '{health}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–5 · Trigger inventory, exact (extends the 002/011 pattern): the tsv
-- builders and the cross-table sync join the claim + guard triggers; dsc
-- carries exactly its builder — and the ONLY dsc-writing trigger lives ON
-- documents, which is the documents-first lock order by construction.
-- ----------------------------------------------------------------------------
select is((
  select coalesce(array_agg(t.tgname order by t.tgname), '{}'::name[])
  from pg_trigger t where t.tgrelid = 'public.documents'::regclass and not t.tgisinternal),
  array['hc_claim_documents','hc_guard_documents',
        'hc_sync_search_documents','hc_tsv_documents']::name[],
  'documents: claim + guard + tsv builder + dsc sync, exactly');

select is((
  select coalesce(array_agg(t.tgname order by t.tgname), '{}'::name[])
  from pg_trigger t
  where t.tgrelid = 'public.document_search_content'::regclass and not t.tgisinternal),
  array['hc_build_dsc']::name[],
  'dsc: exactly the builder trigger — vector and snippet text built from the same string in ONE place (§7.1)');

select is((
  select coalesce(array_agg(t.tgname order by t.tgname), '{}'::name[])
  from pg_trigger t where t.tgrelid = 'public.tasks'::regclass and not t.tgisinternal),
  array['hc_claim_tasks','hc_guard_tasks','hc_tsv_tasks']::name[],
  'tasks: claim + guard + tsv builder, exactly');

select is((
  select coalesce(array_agg(t.tgname order by t.tgname), '{}'::name[])
  from pg_trigger t where t.tgrelid = 'public.timeline_events'::regclass and not t.tgisinternal),
  array['hc_claim_timeline_events','hc_guard_timeline_events','hc_tsv_timeline_events']::name[],
  'timeline_events: claim + guard + tsv builder, exactly');

select is((
  select coalesce(array_agg(g.grantee || ':' || g.privilege_type
                            order by g.grantee, g.privilege_type), '{}'::text[])
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.table_name = 'document_search_content'
    and g.grantee in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin', 'hc_internal')),
  array['authenticated:SELECT',
        'hc_internal:INSERT', 'hc_internal:SELECT', 'hc_internal:UPDATE'],
  'dsc writer allowlist FINALIZED: hc_internal read/insert/update + the M2 view-level read, nothing else, DELETE for nobody (cascade is the only remover)');

-- ----------------------------------------------------------------------------
-- 6–8 · The §2.11 indexes exist; the hc_internal policy set for dsc is the
-- three write-path policies (the 002 sixty-one list grows by exactly these).
-- ----------------------------------------------------------------------------
select ok((select count(*) from pg_indexes
           where schemaname = 'public' and tablename = 'tasks'
             and indexname = 'tasks_tsv') = 1,
  'tasks_tsv GIN index exists (§2.11)');

select ok((select count(*) from pg_indexes
           where schemaname = 'public' and tablename = 'timeline_events'
             and indexname = 'timeline_tsv') = 1,
  'timeline_tsv GIN index exists (§2.11)');

select is((
  select count(*)::int from pg_policy p
  where p.polrelid = 'public.document_search_content'::regclass
    and 'hc_internal'::regrole::oid = any (p.polroles)), 3,
  'dsc hc_internal policies: select + insert + update (the greppable §3.4 reach grows by exactly three)');

-- ----------------------------------------------------------------------------
-- 9–17 · Approval builds every vector in the writing transaction.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-sw-doc')) ->> 'status' $$,
  current_setting('t.prop_doc'))), 'approved',
  'the document proposal approves (fixture control)');

select is(pg_temp.scalar(format(
  $$ select (d.tsv_summary @@ to_tsquery('english', 'discharge & cardiology'))::text
     from public.documents d where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'tsv_summary is built at write time: title (A) and summary_text (B) both match');

select is(pg_temp.scalar(format(
  $$ select (d.tsv_summary @@ to_tsquery('english', 'metoprolol'))::text
     from public.documents d where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'false',
  'tsv_summary reaches NO extraction text — the summary/view line is drawn in the index (§2.11)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L
       and sc.circle_id = d.circle_id and sc.subject_id = d.subject_id $$,
  current_setting('t.prop_doc'))), '1',
  'the dsc row exists, circle- and subject-consistent, written in the approval transaction');

select is(pg_temp.scalar(format(
  $$ select (sc.extracted_text like '%%metoprolol 25mg daily%%'
             and sc.extracted_text like '%%furosemide 20mg%%')::text
     from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'dsc.extracted_text concatenates the approved extraction values (§2.5)');

select is(pg_temp.scalar(format(
  $$ select (sc.search_text_full =
               d.title || ' ' || coalesce(d.summary_text, '') || ' '
               || coalesce(sc.extracted_text, '') || ' ' || coalesce(sc.ocr_text, ''))::text
     from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'search_text_full is EXACTLY the §7.1 concatenation the vector is built from — the snippet source and the match source are one string');

select is(pg_temp.scalar(format(
  $$ select (sc.tsv_full = (d.tsv_summary
               || setweight(to_tsvector('english', coalesce(sc.extracted_text, '')), 'C')
               || setweight(to_tsvector('english', coalesce(sc.ocr_text, '')), 'D')))::text
     from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'tsv_full = tsv_summary ∪ extracted (C) ∪ ocr (D) — recomputed equality, not a shape guess');

select is(pg_temp.scalar(format(
  $$ select (sc.tsv_full @@ to_tsquery('english', 'metoprolol')
             and sc.tsv_full @@ to_tsquery('english', 'discharge'))::text
     from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'a view-level vector matches extraction terms AND the title — the summary branch is carried, not duplicated');

select is(pg_temp.scalar(
  $$ select count(*)::text
     from public.documents d
     left join public.document_search_content sc on sc.document_id = d.id
     where d.tsv_summary @@ websearch_to_tsquery('english', d.title)
       and (sc.document_id is null
            or not (sc.tsv_full @@ websearch_to_tsquery('english', d.title))) $$), '0',
  'the §7.1 invariant: every document findable at summary on its title is findable at view on it — zero stale second rows');

-- ----------------------------------------------------------------------------
-- 18–19 · ocr_text: weight D — findable, never outranking a human title.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ with w as (
       update public.document_search_content sc
       set ocr_text = 'scanned propranolol handwriting'
       from public.documents d
       where d.id = sc.document_id and d.source_proposal_id = %L
       returning sc.tsv_full)
     select (tsv_full @@ to_tsquery('english', 'propranolol'))::text from w $$,
  current_setting('t.prop_doc'))), 'true',
  'ocr_text joins the vector on write — a blind coordinator can locate a scanned document (§6.9)');

select is(pg_temp.scalar(format(
  $$ select (ts_rank(sc.tsv_full, to_tsquery('english', 'discharge')) >
             ts_rank(sc.tsv_full, to_tsquery('english', 'propranolol')))::text
     from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'weight D: machine-read text never outranks the human-approved title (§7.1)');

-- ----------------------------------------------------------------------------
-- 20–23 · tasks and timeline_events: one vector, whole-row summary-readable.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-sw-task')) ->> 'status' $$,
  current_setting('t.prop_task'))), 'approved',
  'the task proposal approves (fixture control)');

select is(pg_temp.scalar(format(
  $$ select (t.tsv @@ to_tsquery('english', 'refill & pharmacy'))::text
     from public.tasks t where t.source_proposal_id = %L $$,
  current_setting('t.prop_task'))), 'true',
  'tasks.tsv is built from title (A) and detail (B) in the writing transaction');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-sw-tl')) ->> 'status' $$,
  current_setting('t.prop_tl'))), 'approved',
  'the timeline proposal approves (fixture control)');

select is(pg_temp.scalar(format(
  $$ select (tl.tsv @@ to_tsquery('english', 'cardiology & appointment'))::text
     from public.timeline_events tl where tl.source_proposal_id = %L $$,
  current_setting('t.prop_tl'))), 'true',
  'timeline_events.tsv is built from summary in the writing transaction');

-- ----------------------------------------------------------------------------
-- 24–26 · The A.5 rename regression: an edit to title or summary_text
-- rebuilds BOTH the summary vector and the dsc row in the same transaction.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.revise_object('document', d.id,
               jsonb_build_object('title', 'Updated discharge letter'))) ->> 'revision_no'
     from public.documents d where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), '1',
  'the rename commits through hc.revise_object (fixture control)');

select is(pg_temp.scalar(format(
  $$ select (d.tsv_summary @@ to_tsquery('english', 'letter'))::text
     from public.documents d where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'tsv_summary follows the rename in the same transaction');

select is(pg_temp.scalar(format(
  $$ select (sc.search_text_full like 'Updated discharge letter %%'
             and sc.tsv_full @@ to_tsquery('english', 'letter'))::text
     from public.document_search_content sc
     join public.documents d on d.id = sc.document_id
     where d.source_proposal_id = %L $$,
  current_setting('t.prop_doc'))), 'true',
  'the dsc row is rebuilt in the SAME transaction — a renamed document stays findable at view (A.5, §7.1)');

-- ----------------------------------------------------------------------------
-- 27–29 · Closure: request-path roles still cannot write dsc; no column
-- carve-out exists on the single-vector tables (§2.11's invariant that no
-- view-only column can hide on a summary-readable row).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated',
  $$ update public.document_search_content set ocr_text = 'x' $$), '42501',
  'authenticated cannot write dsc — the allowlist is hc_internal alone');

select is(pg_temp.errcode_as('hc_pipeline',
  $$ insert into public.document_search_content (document_id, circle_id, subject_id)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$), '42501',
  'hc_pipeline cannot write dsc — extraction text lands only through the documents-first writer');

select is((
  select count(*)::int from pg_attribute a
  where a.attrelid in ('public.tasks'::regclass, 'public.timeline_events'::regclass)
    and not a.attisdropped and a.attacl is not null), 0,
  'no column-level grant carve-out on tasks or timeline_events — their whole rows are summary-readable, so the single vector leaks nothing (§2.11)');

select * from finish();
rollback;
