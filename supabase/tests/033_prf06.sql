-- ============================================================================
-- 1D · U6 — PRF-06: the quantitative gate breached, so the round-6 ruling
-- binds — the inline-friendly hc.visible_at rewrite lands (ADR-0006
-- F7/Q6; ADR-0009).
--
-- Measured at the 5,000-arrival realistic-fanout shape (scripts/bench/
-- prf06.mjs, warm p95 before the rewrite): page-sized record queries
-- 535–1,680 ms against the 250 ms bound; search_broad 3,490 ms against
-- 2,500 ms. Two causes, two fixes:
--
--   1 · hc.ladder resolved each rung through hc.dom() — a per-rung
--       jsonb_array_elements_text + array_agg. Rewritten as direct jsonb
--       containment ((p_s -> 'manage') @> to_jsonb(p_taint) — the
--       ADR-0002 c9-verified operator), and hc.visible_at's CTE body
--       flattened to ONE expression, so ladder and all_domains inline
--       INTO it. The top-level call cannot inline (its p_ctx argument is
--       the hoisted (select hc.ctx()) sublink, which the inliner refuses
--       to duplicate) — the residual is the bare SQL-function call, and
--       the measured bounds clear with ≥3× margin. The rule is still
--       written once: visible_at CALLS hc.ladder; 003's truth table
--       remains the binding oracle over the rewrite.
--   2 · No index served ORDER BY … LIMIT 20, so a page query filtered and
--       sorted the caller's ENTIRE visible set. Three partial page
--       indexes land; the top-N scan now stops at 20 visible rows.
--
-- RED (U6): the CTE body and dom()-ladder are in place, the page indexes
-- absent — the shape pins fail; the behaviour grid passes in BOTH states
-- (it is the equivalence guard, not a regression probe).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(12);

-- ----------------------------------------------------------------------------
-- 1–3 · The page indexes.
-- ----------------------------------------------------------------------------
select ok((select count(*) from pg_indexes
           where schemaname = 'public' and tablename = 'documents'
             and indexname = 'documents_page') = 1,
  'documents_page (circle_id, filed_at desc) where deleted_at is null — the top-N scan stops at 20 visible rows');

select ok((select count(*) from pg_indexes
           where schemaname = 'public' and tablename = 'tasks'
             and indexname = 'tasks_page') = 1,
  'tasks_page (circle_id, approved_at desc)');

select ok((select count(*) from pg_indexes
           where schemaname = 'public' and tablename = 'timeline_events'
             and indexname = 'timeline_events_page') = 1,
  'timeline_events_page (circle_id, approved_at desc)');

-- ----------------------------------------------------------------------------
-- 4–6 · The rewrite's shape, pinned from the catalog.
-- ----------------------------------------------------------------------------
select ok((select p.prosrc !~* '\mwith\M' from pg_proc p
           where p.oid = to_regprocedure(
             'hc.visible_at(jsonb, uuid, hc.domain[], boolean, hc.object_type, uuid, uuid)')),
  'visible_at is ONE expression — no CTE body, so ladder and all_domains inline into it');

select ok((select p.prosrc ~ '@>' and p.prosrc !~ 'hc\.dom' from pg_proc p
           where p.oid = to_regprocedure('hc.ladder(jsonb, hc.domain[])')),
  'ladder resolves rungs by jsonb containment (ADR-0002 c9) — no per-rung dom() aggregation');

select ok((select p.prosrc ~ 'hc\.ladder' from pg_proc p
           where p.oid = to_regprocedure(
             'hc.visible_at(jsonb, uuid, hc.domain[], boolean, hc.object_type, uuid, uuid)')),
  'the rule is still written ONCE: visible_at calls hc.ladder — the rewrite did not fork the ladder (§3.3)');

-- ----------------------------------------------------------------------------
-- 7–12 · The equivalence grid: the §3.3 clause order on a compact ctx, in
-- both states. 003 is the full oracle; this guards the rewrite in-file.
-- ----------------------------------------------------------------------------
create function pg_temp.g(p_frozen boolean, p_tier text, p_cap text)
returns jsonb language sql as $$
  select jsonb_build_object('subjects', jsonb_build_object(
    '11111111-1111-1111-1111-111111111111', jsonb_build_object(
      'c', '22222222-2222-2222-2222-222222222222',
      'member', '33333333-3333-3333-3333-333333333333',
      'tier', p_tier, 'frozen', p_frozen, 'cap', p_cap,
      'manage', '["schedule"]'::jsonb,
      'view', '["schedule","health"]'::jsonb,
      'summary', '["schedule","health","finances"]'::jsonb,
      'log', '["schedule","health","finances","documents"]'::jsonb)),
    'shares', jsonb_build_object('document',
      jsonb_build_array('44444444-4444-4444-4444-444444444444')));
$$;

select is(hc.visible_at(pg_temp.g(false, 'family', null),
  '11111111-1111-1111-1111-111111111111', '{health}', true, null, null, null),
  'view'::hc.access_level,
  'grid: the ordinary ladder — {health} ⊆ view');

select is(hc.visible_at(pg_temp.g(true, 'family', null),
  '11111111-1111-1111-1111-111111111111', '{schedule}', true, null, null, null),
  'hidden'::hc.access_level,
  'grid: frozen closes before any rung');

select is(hc.visible_at(pg_temp.g(false, 'family', null),
  '11111111-1111-1111-1111-111111111111', '{finances}', false, null, null, null),
  'hidden'::hc.access_level,
  'grid: unresolved without manage-on-five is hidden (VIS-02)');

select is(hc.visible_at(pg_temp.g(false, 'care_circle', null),
  '11111111-1111-1111-1111-111111111111', '{health}', true, 'task',
  '55555555-5555-5555-5555-555555555555', null),
  'hidden'::hc.access_level,
  'grid: the care ceiling closes a task the member does not own');

select is(hc.visible_at(pg_temp.g(false, 'family', null),
  '11111111-1111-1111-1111-111111111111', '{documents}', true, 'document',
  '44444444-4444-4444-4444-444444444444', null),
  'view'::hc.access_level,
  'grid: a share widens the ONE named object to view — {documents} sat at log');

select is(hc.visible_at(pg_temp.g(false, 'family', 'summary'),
  '11111111-1111-1111-1111-111111111111', '{health}', true, null, null, null),
  'summary'::hc.access_level,
  'grid: the FRZ-13 cap binds LAST — view least-ed down to summary');

select * from finish();
rollback;
