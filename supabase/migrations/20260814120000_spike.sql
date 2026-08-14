-- ============================================================================
-- STEP 2 VERIFICATION SPIKE — THROWAWAY.
-- This migration exists to answer the behavioural claims in the build plan
-- against a real Postgres 17 + Supabase stack. It is deleted after the
-- evidence is classified (see docs/adr/0002-verification-spike-results.md).
-- Nothing in here is production schema; production shapes land in slice 1A.
-- ============================================================================

create schema if not exists hc;
create schema if not exists spike;

-- Claim 8: the ladder arithmetic depends on declaration order.
create type hc.access_level as enum ('hidden','log','summary','view','manage');

-- Claim 5: ALTER TYPE ... ADD VALUE must target an enum committed by an
-- EARLIER transaction to reproduce the real migration case.
create type spike.arrival_state as enum ('received','stored','scanned');

-- ----------------------------------------------------------------------------
-- Mini documents / search-content split, mirroring TSD §7.1–§7.2 shapes.
-- Claims 1 (LEFT JOIN null-extension), 2 (InitPlan), 3 (trigger lock ordering).
-- ----------------------------------------------------------------------------

create table spike.grants_tbl (
  account_id uuid not null,
  circle_id  uuid not null,
  level      hc.access_level not null,
  primary key (account_id, circle_id)
);

-- Mirrors hc.ctx()'s shape (TSD §3.2): stable, security definer, empty
-- search_path, called as an uncorrelated scalar subquery from every policy.
create or replace function spike.ctx()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', auth.uid(),
    'circles', coalesce((select jsonb_agg(distinct g.circle_id)
                         from spike.grants_tbl g
                         where g.account_id = auth.uid()), '[]'::jsonb),
    'levels',  coalesce((select jsonb_object_agg(g.circle_id::text, g.level::text)
                         from spike.grants_tbl g
                         where g.account_id = auth.uid()), '{}'::jsonb));
$$;
revoke execute on function spike.ctx() from public, anon;
grant  execute on function spike.ctx() to authenticated;

create table spike.documents (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null,
  title        text not null,
  summary_text text,
  tsv_summary  tsvector
);

create table spike.doc_search (
  document_id      uuid primary key references spike.documents(id),
  circle_id        uuid not null,
  extracted_text   text,
  ocr_text         text,
  search_text_full text,
  tsv_full         tsvector
);

-- §7.1: the summary vector, built on the documents row itself.
create or replace function spike.documents_tsv()
returns trigger language plpgsql as $$
begin
  new.tsv_summary :=
      setweight(to_tsvector('english', coalesce(new.title,'')),        'A')
   || setweight(to_tsvector('english', coalesce(new.summary_text,'')), 'B');
  return new;
end $$;
create trigger t1_documents_tsv
  before insert or update of title, summary_text on spike.documents
  for each row execute function spike.documents_tsv();

-- §7.1: an edit to documents rebuilds the matching doc_search row in the
-- same transaction (documents -> WRITES doc_search).
create or replace function spike.documents_rebuild_search()
returns trigger language plpgsql as $$
begin
  update spike.doc_search s
     set search_text_full = new.title || ' ' || coalesce(new.summary_text,'') || ' '
                         || coalesce(s.extracted_text,'') || ' ' || coalesce(s.ocr_text,''),
         tsv_full = new.tsv_summary
                 || setweight(to_tsvector('english', coalesce(s.extracted_text,'')), 'C')
                 || setweight(to_tsvector('english', coalesce(s.ocr_text,'')),       'D')
   where s.document_id = new.id;
  return null;
end $$;
create trigger t2_documents_rebuild
  after update of title, summary_text on spike.documents
  for each row execute function spike.documents_rebuild_search();

-- §7.1: doc_search's own trigger READS documents (the reverse dependency —
-- the classic deadlock shape under test in claim 3).
create or replace function spike.doc_search_tsv()
returns trigger language plpgsql as $$
declare d record;
begin
  select title, summary_text, tsv_summary into strict d
    from spike.documents where id = new.document_id;
  new.search_text_full := d.title || ' ' || coalesce(d.summary_text,'') || ' '
                       || coalesce(new.extracted_text,'') || ' ' || coalesce(new.ocr_text,'');
  new.tsv_full := coalesce(d.tsv_summary, ''::tsvector)
               || setweight(to_tsvector('english', coalesce(new.extracted_text,'')), 'C')
               || setweight(to_tsvector('english', coalesce(new.ocr_text,'')),       'D');
  return new;
end $$;
create trigger t1_doc_search_tsv
  before insert or update of extracted_text, ocr_text on spike.doc_search
  for each row execute function spike.doc_search_tsv();

-- RLS, in the §3.4 two-clause shape: indexed pre-filter, then the level test.
alter table spike.documents enable row level security;
alter table spike.documents force  row level security;
create policy documents_select on spike.documents
for select to authenticated
using (
      (select spike.ctx() -> 'circles') @> to_jsonb(circle_id)
  and coalesce((select spike.ctx()) -> 'levels' ->> circle_id::text, 'hidden')::hc.access_level
        >= 'summary'
);

alter table spike.doc_search enable row level security;
alter table spike.doc_search force  row level security;
create policy doc_search_select on spike.doc_search
for select to authenticated
using (
      (select spike.ctx() -> 'circles') @> to_jsonb(circle_id)
  and coalesce((select spike.ctx()) -> 'levels' ->> circle_id::text, 'hidden')::hc.access_level
        >= 'view'
);

grant usage on schema spike to authenticated;
grant select on spike.documents, spike.doc_search to authenticated;

-- Committed fixture rows for the multi-session tests (claim 3) and the
-- EXPLAIN capture (claim 2). Two circles; the account below holds summary on
-- one and view on the other.
insert into spike.grants_tbl (account_id, circle_id, level) values
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000c1a01', 'summary'),
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000c1a02', 'view');

insert into spike.documents (id, circle_id, title, summary_text) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000c1a01',
   'Discharge summary', 'Nell came home Tuesday'),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000c1a02',
   'Cardiology letter', 'Follow-up in six weeks');

insert into spike.doc_search (document_id, circle_id, extracted_text) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000c1a01',
   'metoprolol 25mg twice daily'),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000c1a02',
   'ejection fraction stable');
