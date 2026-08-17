-- ============================================================================
-- 1D · M1 — the search write path (TSD §2.11, §7.1; ADR-0002 claim 3).
--
-- Vectors are maintained by trigger in the same transaction as the content,
-- the taint and the category (PRD §4.3.6: "index membership is synchronous
-- with access"):
--
--   documents.tsv_summary   title (A) + summary_text (B), NOTHING else —
--                           the §3.4 summary/view line drawn in the index.
--   dsc                     the view-level branch: extracted_text (C) and
--                           ocr_text (D) joined to the document's own
--                           summary vector, with search_text_full holding
--                           EXACTLY the string tsv_full was built from —
--                           the snippet must be cut from the text that was
--                           matched (§7.1). Built in ONE place: the dsc
--                           builder trigger.
--   tasks.tsv               title (A) + detail (B) — the whole row is
--   timeline_events.tsv     summary (A)             summary-readable
--                           (§3.4), so one vector leaks nothing (§2.11).
--
-- episodes.tsv and profile_facts.tsv (the shared-block columns) stay
-- unmaintained: §7.1 names documents, tasks and timeline_events as the
-- search relations and §2.11 defines exactly four indexes. Recorded in
-- ADR-0009.
--
-- The cross-table dependency is paid explicitly (§7.1): an edit to
-- documents.title or summary_text fires hc_sync_search_documents, which
-- rebuilds the matching dsc row IN the same transaction — without it a
-- renamed document stops being findable at view while staying findable at
-- summary (A.5). The sync trigger lives ON documents, so every dsc write
-- follows a documents write in the writer's transaction: the ADR-0002
-- claim-3 documents-first lock order holds by construction, and no new
-- advisory-lock edge exists (the writers that reach here — approve,
-- revise — already hold the per-circle taint lock, annex A4).
--
-- Writer allowlist FINALIZED (REC-05 → DSC-01, kickoff mandate):
-- hc_internal gains SELECT/INSERT/UPDATE on dsc with the three named
-- policies; no request-path role holds anything; DELETE is granted to
-- NOBODY — the document cascade is the only remover. The read policy for
-- authenticated is M2's (the table stays read-dark this migration — the
-- §2.1 boundary rule: between creation and policies, intentionally
-- inaccessible).
--
-- No backfill: documents/tasks/timeline_events are writable only through
-- hc.approve_proposal since 1B, no production environment exists, and
-- both CI reset legs run schema-only — no pre-M1 row can exist outside a
-- rolled-back test transaction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Builders. Plain trigger functions (invoker security — they run inside
-- writers that already passed authorization; guard_row precedent), owned
-- by hc_internal, search_path pinned, fully qualified.
-- ----------------------------------------------------------------------------

create function hc.tsv_documents() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tsv_summary :=
       setweight(to_tsvector('english', coalesce(new.title, '')),        'A')
    || setweight(to_tsvector('english', coalesce(new.summary_text, '')), 'B');
  return new;
end $$;

create function hc.tsv_tasks() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tsv :=
       setweight(to_tsvector('english', coalesce(new.title, '')),  'A')
    || setweight(to_tsvector('english', coalesce(new.detail, '')), 'B');
  return new;
end $$;

create function hc.tsv_timeline_events() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tsv := setweight(to_tsvector('english', coalesce(new.summary, '')), 'A');
  return new;
end $$;

-- The dsc builder: every content column of the row is derived HERE, from
-- the parent document and the approved extraction values, so the vector
-- and the snippet source cannot come apart (§7.1 "built from the SAME
-- string, in one place"). extracted_text is a pure function of the
-- document's source proposal (extractions are append-only and
-- source_extraction_ids is fixed at draft), ordered deterministically.
-- ocr_text is caller-supplied (the extract stage's writer lands with
-- RLY-01; null until then) and preserved across rebuilds.
create function hc.build_dsc() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_doc record;
begin
  select d.title, d.summary_text, d.tsv_summary, d.source_proposal_id
    into v_doc
  from public.documents d
  where d.id = new.document_id;

  if not found then
    -- let the FK raise the honest error
    return new;
  end if;

  new.extracted_text := (
    select string_agg(e.value #>> '{}', ' ' order by e.created_at, e.id)
    from public.proposals pr
    join public.extractions e on e.id = any (pr.source_extraction_ids)
    where pr.id = v_doc.source_proposal_id);

  new.search_text_full :=
       v_doc.title || ' ' || coalesce(v_doc.summary_text, '') || ' '
    || coalesce(new.extracted_text, '') || ' ' || coalesce(new.ocr_text, '');

  new.tsv_full :=
       coalesce(v_doc.tsv_summary, ''::tsvector)
    || setweight(to_tsvector('english', coalesce(new.extracted_text, '')), 'C')
    || setweight(to_tsvector('english', coalesce(new.ocr_text, '')),       'D');

  return new;
end $$;

-- The cross-table sync (§7.1): title/summary edits rebuild the dsc row in
-- the writer's transaction. The upsert's no-op DO UPDATE deliberately
-- fires hc_build_dsc, which recomputes every derived column.
create function hc.sync_search_content() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.document_search_content (document_id, circle_id, subject_id)
  values (new.id, new.circle_id, new.subject_id)
  on conflict (document_id)
  do update set document_id = excluded.document_id;
  return null;
end $$;

alter function hc.tsv_documents()        owner to hc_internal;
alter function hc.tsv_tasks()            owner to hc_internal;
alter function hc.tsv_timeline_events()  owner to hc_internal;
alter function hc.build_dsc()            owner to hc_internal;
alter function hc.sync_search_content()  owner to hc_internal;

revoke execute on function
  hc.tsv_documents(), hc.tsv_tasks(), hc.tsv_timeline_events(),
  hc.build_dsc(), hc.sync_search_content()
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- Triggers. tsv builders BEFORE (they set NEW); the sync AFTER (it writes
-- a second table once the documents row is in place). Alphabetical order
-- among same-event BEFORE triggers puts hc_guard before hc_tsv on UPDATE,
-- which is correct: the guard rejects before any derived work runs.
-- ----------------------------------------------------------------------------
create trigger hc_tsv_documents
  before insert or update of title, summary_text on public.documents
  for each row execute function hc.tsv_documents();

create trigger hc_sync_search_documents
  after insert or update of title, summary_text on public.documents
  for each row execute function hc.sync_search_content();

create trigger hc_tsv_tasks
  before insert or update of title, detail on public.tasks
  for each row execute function hc.tsv_tasks();

create trigger hc_tsv_timeline_events
  before insert or update of summary on public.timeline_events
  for each row execute function hc.tsv_timeline_events();

create trigger hc_build_dsc
  before insert or update on public.document_search_content
  for each row execute function hc.build_dsc();

-- ----------------------------------------------------------------------------
-- The §2.11 indexes that were not created with their tables in 1B.
-- ----------------------------------------------------------------------------
create index tasks_tsv    on public.tasks           using gin (tsv);
create index timeline_tsv on public.timeline_events using gin (tsv);

-- ----------------------------------------------------------------------------
-- The dsc writer allowlist, finalized: hc_internal alone, no DELETE.
-- ----------------------------------------------------------------------------
grant select, insert, update on public.document_search_content to hc_internal;

create policy dsc_internal on public.document_search_content
  for select to hc_internal using (true);
create policy dsc_internal_write on public.document_search_content
  for insert to hc_internal with check (true);
create policy dsc_internal_update on public.document_search_content
  for update to hc_internal using (true) with check (true);
