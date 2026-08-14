-- ============================================================================
-- STEP 2 VERIFICATION SPIKE — single-session claims (1,2,4,5,6,7,8,9,11).
-- Runs entirely inside one transaction and rolls back. Claims 3, 10, 12 need
-- two sessions / the pooler / the Storage API: see scripts/spike/.
-- THROWAWAY — deleted after evidence is classified in ADR-0002.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(27);

-- ----------------------------------------------------------------------------
-- Claim 2 helper (invoker rights, so EXPLAIN sees the caller's RLS quals)
-- ----------------------------------------------------------------------------
create function public.spike_explain(q text) returns text
language plpgsql as $$
declare l text; o text := '';
begin
  for l in execute 'explain (costs off) ' || q loop o := o || l || E'\n'; end loop;
  return o;
end $$;
grant execute on function public.spike_explain(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Claims 1 & 2 — run as the fixture account: summary on circle 1, view on 2
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);
set local role authenticated;

-- 1a. A term present ONLY in extracted_text is unreachable at summary level.
--     This is the whole §7.2 search-leak fix, happy path.
select is(
  (select count(*) from spike.documents d
    left join spike.doc_search sc on sc.document_id = d.id
    where d.circle_id = '00000000-0000-0000-0000-0000000c1a01'
      and coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'metoprolol')),
  0::bigint,
  'claim 1: summary-level caller cannot match a term that lives only in extracted_text');

-- 1b. The LEFT JOIN null-extends for the summary circle and resolves for the
--     view circle, in one query.
select results_eq(
  $q$ select d.id, (sc.document_id is null) as null_extended
      from spike.documents d
      left join spike.doc_search sc on sc.document_id = d.id
      where coalesce(sc.tsv_full, d.tsv_summary)
            @@ websearch_to_tsquery('english', 'discharge OR cardiology')
      order by d.id $q$,
  $v$ values ('00000000-0000-0000-0000-00000000d001'::uuid, true),
             ('00000000-0000-0000-0000-00000000d002'::uuid, false) $v$,
  'claim 1: join null-extends at summary, resolves at view');

-- 1c. At view level, extracted-only content does match.
select is(
  (select count(*) from spike.documents d
    left join spike.doc_search sc on sc.document_id = d.id
    where coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'ejection')),
  1::bigint,
  'claim 1: view-level caller matches extracted_text');

-- 1d. Direct select on doc_search shows only the view-level circle.
select is(
  (select count(*) from spike.doc_search),
  1::bigint,
  'claim 1: RLS on doc_search admits only the view-level circle');

-- 2a/2b. (select spike.ctx()) hoists to an InitPlan inside this exact query
--        shape — once per query, not a per-row SubPlan.
select matches(
  public.spike_explain($q$
    select d.id
    from spike.documents d
    left join spike.doc_search sc on sc.document_id = d.id
    where d.circle_id = '00000000-0000-0000-0000-0000000c1a01'
      and coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'discharge') $q$),
  'InitPlan',
  'claim 2: ctx() evaluates as an InitPlan inside the search join');

select ok(
  public.spike_explain($q$
    select d.id
    from spike.documents d
    left join spike.doc_search sc on sc.document_id = d.id
    where d.circle_id = '00000000-0000-0000-0000-0000000c1a01'
      and coalesce(sc.tsv_full, d.tsv_summary)
          @@ websearch_to_tsquery('english', 'discharge') $q$)
  !~ 'SubPlan',
  'claim 2: no per-row SubPlan appears in the search join');

reset role;

-- ----------------------------------------------------------------------------
-- Claim 4 — SELECT ... INTO without STRICT leaves the variable NULL on no-match
-- ----------------------------------------------------------------------------
create function public.spike_select_into() returns text
language plpgsql as $$
declare v int;
begin
  select 1 into v where false;
  return case when v is null then 'null_no_error' else 'unexpected' end;
end $$;

select is(public.spike_select_into(), 'null_no_error',
  'claim 4: SELECT INTO on no-match sets NULL and does not raise (the stale_lease fence)');

create function public.spike_select_into_strict() returns int
language plpgsql as $$
declare v int;
begin
  select 1 into strict v where false;
  return v;
end $$;

select throws_ok('select public.spike_select_into_strict()', 'P0002', null,
  'claim 4: only INTO STRICT raises no_data_found');

-- ----------------------------------------------------------------------------
-- Claim 5 — ALTER TYPE ... ADD VALUE on a previously committed enum
-- ----------------------------------------------------------------------------
select lives_ok(
  $$alter type spike.arrival_state add value 'stale_lease'$$,
  'claim 5: ADD VALUE inside a transaction succeeds on a committed enum (PG12+)');

select throws_ok(
  $$select 'stale_lease'::spike.arrival_state$$, '55P04', null,
  'claim 5: but USING the new value in the same transaction fails (55P04)');

-- ----------------------------------------------------------------------------
-- Claim 6 — deferred constraint trigger composing with an RLS insert policy
-- ----------------------------------------------------------------------------
create table spike.claims_tbl (object_id uuid primary key);
create table spike.records_tbl (id uuid primary key, circle_id uuid not null);
alter table spike.records_tbl enable row level security;
alter table spike.records_tbl force  row level security;
create policy records_insert on spike.records_tbl
for insert to authenticated
with check (exists (select 1 from spike.claims_tbl c where c.object_id = records_tbl.id));
create function spike.records_has_claim() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from spike.claims_tbl c where c.object_id = new.id) then
    raise exception 'record % has no claim', new.id using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger t_records_claim
  after insert on spike.records_tbl
  deferrable initially deferred
  for each row execute function spike.records_has_claim();
grant select, insert on spike.records_tbl to authenticated;
grant select on spike.claims_tbl to authenticated;

insert into spike.claims_tbl values ('00000000-0000-0000-0000-00000000c1a1');

set local role authenticated;

-- 6a. The policy refuses at the ROW.
select throws_ok(
  $$insert into spike.records_tbl values
      ('00000000-0000-0000-0000-00000000badd', gen_random_uuid())$$,
  '42501', null,
  'claim 6: RLS insert policy refuses an unclaimed row at row time');

-- 6b/6c. A claimed row passes the policy and satisfies the deferred trigger.
select lives_ok(
  $$insert into spike.records_tbl values
      ('00000000-0000-0000-0000-00000000c1a1', gen_random_uuid())$$,
  'claim 6: claimed insert passes the RLS policy');

select lives_ok(
  $$set constraints all immediate$$,
  'claim 6: deferred trigger is satisfied when the claim still exists');

-- 6d. The trigger catches at (effective) commit what the policy passed at row
--     time: claim deleted after the insert. Re-defer first — test 6c's SET
--     CONSTRAINTS ALL IMMEDIATE changed the mode for the rest of the txn.
reset role;
set constraints all deferred;
insert into spike.claims_tbl values ('00000000-0000-0000-0000-00000000c1a2');
set local role authenticated;
insert into spike.records_tbl values
  ('00000000-0000-0000-0000-00000000c1a2', gen_random_uuid());
reset role;
delete from spike.claims_tbl where object_id = '00000000-0000-0000-0000-00000000c1a2';

select throws_ok(
  $$set constraints all immediate$$, '23514', null,
  'claim 6: deferred trigger aborts when the claim vanished after the row passed the policy');

-- ----------------------------------------------------------------------------
-- Claim 7 — MATCH SIMPLE composite FK with a NULL first column
-- ----------------------------------------------------------------------------
create table spike.accounts2 (id uuid primary key, kind text not null, unique (id, kind));
create table spike.members2 (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid,
  account_kind text not null default 'member' check (account_kind = 'member'),
  foreign key (account_id, account_kind) references spike.accounts2 (id, kind));
insert into spike.accounts2 values
  ('00000000-0000-0000-0000-00000000ac01', 'member'),
  ('00000000-0000-0000-0000-00000000ac02', 'admin');

select lives_ok(
  $$insert into spike.members2 (account_id) values (null)$$,
  'claim 7: NULL first column skips the composite FK check entirely (the subject-member row)');

select lives_ok(
  $$insert into spike.members2 (account_id)
    values ('00000000-0000-0000-0000-00000000ac01')$$,
  'claim 7: a member account satisfies the composite FK');

select throws_ok(
  $$insert into spike.members2 (account_id)
    values ('00000000-0000-0000-0000-00000000ac02')$$,
  '23503', null,
  'claim 7: an admin account has no (id, member) row — AC-ADMIN-3 as a constraint');

-- ----------------------------------------------------------------------------
-- Claim 8 — the ladder arithmetic on hc.access_level
-- ----------------------------------------------------------------------------
select ok('view'::hc.access_level >= 'summary'::hc.access_level,
  'claim 8: >= follows declaration order');

select is(greatest('summary'::hc.access_level, 'view'::hc.access_level),
  'view'::hc.access_level,
  'claim 8: greatest() picks the higher rung');

select is((select min(l) from unnest(
    array['view','log','manage']::hc.access_level[]) l),
  'log'::hc.access_level,
  'claim 8: min() aggregate works on the enum (§3.1 containment)');

select is(enum_range(null::hc.access_level)::text[],
  array['hidden','log','summary','view','manage'],
  'claim 8: the ordinal sequence is exactly as declared');

-- ----------------------------------------------------------------------------
-- Claim 9 — jsonb @> scalar containment (every policy pre-filter)
-- ----------------------------------------------------------------------------
select ok('["a","b"]'::jsonb @> '"a"'::jsonb,
  'claim 9: a jsonb array contains a bare scalar string');

select ok(
  (select jsonb_agg(x) from (values
     ('00000000-0000-0000-0000-000000000001'::uuid)) v(x))
  @> to_jsonb('00000000-0000-0000-0000-000000000001'::uuid),
  'claim 9: jsonb_agg(uuid) @> to_jsonb(uuid) — the exact §3.4 pre-filter shape');

select ok(not ('["a","b"]'::jsonb @> '"c"'::jsonb),
  'claim 9: containment is false for an absent scalar');

-- ----------------------------------------------------------------------------
-- Claim 11 — pgmq availability on the pinned local stack
-- ----------------------------------------------------------------------------
select lives_ok($$create extension if not exists pgmq$$,
  'claim 11: pgmq extension is installable');

select lives_ok($$select pgmq.create('spike_q')$$,
  'claim 11: a queue can be created');

select is(
  (select (pgmq.read('spike_q', 30, 1)).message
     from (select pgmq.send('spike_q', '{"n":1}'::jsonb)) s),
  '{"n":1}'::jsonb,
  'claim 11: send/read round-trips a message');

select * from finish();
rollback;
