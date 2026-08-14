-- ============================================================================
-- Postgres behavioural assumptions the architecture rests on.
--
-- Origin: the Step 2 verification spike (docs/adr/0002-verification-spike-
-- results.md). These are the assumptions that regress SILENTLY when Postgres,
-- Supabase images, extensions, or planner behaviour change — so they run on
-- every test pass, before any schema exists. Everything is created inside
-- this transaction and rolled back; no dependency on migrations.
--
-- Not covered here (and why):
--   ALTER TYPE ADD VALUE in-txn needs a previously COMMITTED enum — it is a
--     migration-authoring rule (ADR-0002 note 5), asserted by review.
--   Trigger lock ordering needs two sessions — permanent multi-session test
--     lands with the real tables in slice 1B (ADR-0002 note 3).
--   Storage/pooler behaviour needs the API and Supavisor — ADR-0002 notes
--     10 and 12.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(15);

-- ----------------------------------------------------------------------------
-- Fixture: minimal RLS'd two-table split in the §7.1/§7.2 shape.
-- ----------------------------------------------------------------------------
create schema bhv;
create type bhv.access_level as enum ('hidden','log','summary','view','manage');

create table bhv.grants_tbl (
  account_id uuid not null,
  circle_id  uuid not null,
  level      bhv.access_level not null,
  primary key (account_id, circle_id)
);

create function bhv.ctx()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'circles', coalesce((select jsonb_agg(distinct g.circle_id)
                         from bhv.grants_tbl g
                         where g.account_id = auth.uid()), '[]'::jsonb),
    'levels',  coalesce((select jsonb_object_agg(g.circle_id::text, g.level::text)
                         from bhv.grants_tbl g
                         where g.account_id = auth.uid()), '{}'::jsonb));
$$;
grant execute on function bhv.ctx() to authenticated;

create table bhv.documents (
  id          uuid primary key,
  circle_id   uuid not null,
  title       text not null,
  tsv_summary tsvector
);
create table bhv.doc_search (
  document_id uuid primary key references bhv.documents(id),
  circle_id   uuid not null,
  tsv_full    tsvector
);

alter table bhv.documents enable row level security;
alter table bhv.documents force  row level security;
create policy documents_select on bhv.documents
for select to authenticated
using (
      (select bhv.ctx() -> 'circles') @> to_jsonb(circle_id)
  and coalesce((select bhv.ctx()) -> 'levels' ->> circle_id::text, 'hidden')::bhv.access_level
        >= 'summary'
);
alter table bhv.doc_search enable row level security;
alter table bhv.doc_search force  row level security;
create policy doc_search_select on bhv.doc_search
for select to authenticated
using (
      (select bhv.ctx() -> 'circles') @> to_jsonb(circle_id)
  and coalesce((select bhv.ctx()) -> 'levels' ->> circle_id::text, 'hidden')::bhv.access_level
        >= 'view'
);
grant usage on schema bhv to authenticated;
grant select on bhv.documents, bhv.doc_search to authenticated;

-- circle 1: summary · circle 2: view, for the fixture account
insert into bhv.grants_tbl values
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000c1a01', 'summary'),
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000c1a02', 'view');
insert into bhv.documents values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000c1a01',
   'Discharge summary', to_tsvector('english', 'Discharge summary')),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000c1a02',
   'Cardiology letter', to_tsvector('english', 'Cardiology letter'));
insert into bhv.doc_search values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000c1a01',
   to_tsvector('english', 'Discharge summary metoprolol')),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000c1a02',
   to_tsvector('english', 'Cardiology letter ejection fraction'));

create function public.bhv_explain(q text) returns text
language plpgsql as $$
declare l text; o text := '';
begin
  for l in execute 'explain (costs off) ' || q loop o := o || l || E'\n'; end loop;
  return o;
end $$;
grant execute on function public.bhv_explain(text) to authenticated;

-- ----------------------------------------------------------------------------
-- The LEFT JOIN null-extension — the search-leak fix (TSD §7.2)
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from bhv.documents d
    left join bhv.doc_search sc on sc.document_id = d.id
    where coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'metoprolol')),
  0::bigint,
  'summary-level caller cannot match a term that lives only in the full vector');

select results_eq(
  $q$ select d.id, (sc.document_id is null) as null_extended
      from bhv.documents d
      left join bhv.doc_search sc on sc.document_id = d.id
      order by d.id $q$,
  $v$ values ('00000000-0000-0000-0000-00000000d001'::uuid, true),
             ('00000000-0000-0000-0000-00000000d002'::uuid, false) $v$,
  'RLS null-extends the join at summary and resolves it at view');

select is(
  (select count(*) from bhv.documents d
    left join bhv.doc_search sc on sc.document_id = d.id
    where coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'ejection')),
  1::bigint,
  'view-level caller matches full-vector content');

-- ----------------------------------------------------------------------------
-- InitPlan hoisting — one evaluation per reference, never per row (TSD §3.2)
-- ----------------------------------------------------------------------------
select matches(
  public.bhv_explain($q$
    select d.id from bhv.documents d
    left join bhv.doc_search sc on sc.document_id = d.id
    where d.circle_id = '00000000-0000-0000-0000-0000000c1a01'
      and coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'discharge') $q$),
  'InitPlan',
  '(select ctx()) hoists to an InitPlan inside the search join');

select ok(
  public.bhv_explain($q$
    select d.id from bhv.documents d
    left join bhv.doc_search sc on sc.document_id = d.id
    where d.circle_id = '00000000-0000-0000-0000-0000000c1a01'
      and coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'discharge') $q$)
  !~ 'SubPlan',
  'no per-row SubPlan appears in the search join');

reset role;

-- ----------------------------------------------------------------------------
-- SELECT ... INTO on no-match: NULL, not an exception (TSD §4.2 lease fence)
-- ----------------------------------------------------------------------------
create function public.bhv_select_into() returns text
language plpgsql as $$
declare v int;
begin
  select 1 into v where false;
  return case when v is null then 'null_no_error' else 'unexpected' end;
end $$;
select is(public.bhv_select_into(), 'null_no_error',
  'SELECT INTO on no-match sets NULL and does not raise');

-- ----------------------------------------------------------------------------
-- Deferred constraint trigger composing with an RLS insert policy (TSD §2.4, §3.7)
-- ----------------------------------------------------------------------------
create table bhv.claims_tbl (object_id uuid primary key);
create table bhv.records_tbl (id uuid primary key, circle_id uuid not null);
alter table bhv.records_tbl enable row level security;
alter table bhv.records_tbl force  row level security;
create policy records_insert on bhv.records_tbl
for insert to authenticated
with check (exists (select 1 from bhv.claims_tbl c where c.object_id = records_tbl.id));
create function bhv.records_has_claim() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from bhv.claims_tbl c where c.object_id = new.id) then
    raise exception 'record % has no claim', new.id using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger t_records_claim
  after insert on bhv.records_tbl
  deferrable initially deferred
  for each row execute function bhv.records_has_claim();
grant select, insert on bhv.records_tbl to authenticated;
grant select on bhv.claims_tbl to authenticated;

insert into bhv.claims_tbl values ('00000000-0000-0000-0000-00000000c1a1');
set local role authenticated;

select throws_ok(
  $$insert into bhv.records_tbl values
      ('00000000-0000-0000-0000-00000000badd', gen_random_uuid())$$,
  '42501', null,
  'RLS insert policy refuses an unclaimed row at row time');

select lives_ok(
  $$insert into bhv.records_tbl values
      ('00000000-0000-0000-0000-00000000c1a1', gen_random_uuid())$$,
  'claimed insert passes the RLS policy');

reset role;
set constraints all deferred;
insert into bhv.claims_tbl values ('00000000-0000-0000-0000-00000000c1a2');
set local role authenticated;
insert into bhv.records_tbl values
  ('00000000-0000-0000-0000-00000000c1a2', gen_random_uuid());
reset role;
delete from bhv.claims_tbl where object_id = '00000000-0000-0000-0000-00000000c1a2';

select throws_ok(
  $$set constraints all immediate$$, '23514', null,
  'deferred trigger aborts when the claim vanished after the row passed the policy');

-- ----------------------------------------------------------------------------
-- MATCH SIMPLE composite FK (TSD §2.3 subject-member row, AC-ADMIN-3)
-- ----------------------------------------------------------------------------
create table bhv.accounts (id uuid primary key, kind text not null, unique (id, kind));
create table bhv.members (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid,
  account_kind text not null default 'member' check (account_kind = 'member'),
  foreign key (account_id, account_kind) references bhv.accounts (id, kind));
insert into bhv.accounts values
  ('00000000-0000-0000-0000-00000000ac01', 'member'),
  ('00000000-0000-0000-0000-00000000ac02', 'admin');

select lives_ok(
  $$insert into bhv.members (account_id) values (null)$$,
  'NULL first column skips the composite FK check (the subject-member row)');

select throws_ok(
  $$insert into bhv.members (account_id)
    values ('00000000-0000-0000-0000-00000000ac02')$$,
  '23503', null,
  'an admin account has no (id, member) row — AC-ADMIN-3 as a constraint');

-- ----------------------------------------------------------------------------
-- The ladder arithmetic (TSD §2.2, §3.3)
-- ----------------------------------------------------------------------------
select ok('view'::bhv.access_level >= 'summary'::bhv.access_level,
  'access_level >= follows declaration order');

select is((select min(l) from unnest(
    array['view','log','manage']::bhv.access_level[]) l),
  'log'::bhv.access_level,
  'min() aggregate works on the enum');

-- ----------------------------------------------------------------------------
-- jsonb @> scalar containment — every policy pre-filter (TSD §3.4)
-- ----------------------------------------------------------------------------
select ok(
  (select jsonb_agg(x) from (values
     ('00000000-0000-0000-0000-000000000001'::uuid)) v(x))
  @> to_jsonb('00000000-0000-0000-0000-000000000001'::uuid),
  'jsonb_agg(uuid) @> to_jsonb(uuid) — the policy pre-filter shape');

-- ----------------------------------------------------------------------------
-- pgmq availability on the pinned stack (TSD §1.4)
-- ----------------------------------------------------------------------------
select lives_ok($$create extension if not exists pgmq$$,
  'pgmq extension is installable on the pinned image');

select * from finish();
rollback;
