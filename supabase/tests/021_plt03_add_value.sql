-- ============================================================================
-- 1C · U3 — PLT-03: the first ALTER TYPE … ADD VALUE migration and the
-- 55P04 upgrade-path fixture (ADR-0002 c5/note 5; ADR-0003 f7).
--
-- M3 ADDs 'claimed' and 'exhausted' to hc.advance_result and uses NEITHER —
-- usage begins in M4 (hc.claim_stage). The migration-file split is the
-- review half; this file is the runtime half: the labels exist in order and
-- are usable once committed, and the platform rule that forced the split is
-- probed LIVE against the real enum (the probe label rolls back with the
-- test transaction).
--
-- The CI upgrade rehearsal (base reset → migration up → both suites) proves
-- the ADD VALUE increment applies to the shipped base on every run.
--
-- RED (U3): label list is the M2 six; casting 'claimed' reports 22P02.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(3);

-- 1 · The post-M3 inventory, order-sensitive.
select enum_has_labels('hc', 'advance_result',
  array['advanced','already_advanced','cancelled','frozen','invalid_state',
        'stale_lease','claimed','exhausted'],
  'hc.advance_result carries the §4.2 six plus the M3 claim vocabulary, in order');

-- 2 · The committed labels are USABLE — the whole point of the two-migration
--     split (an enum value is unusable in the transaction that adds it).
select lives_ok(
  $$ select 'claimed'::hc.advance_result, 'exhausted'::hc.advance_result $$,
  'claimed/exhausted cast cleanly once their ADD VALUE migration has committed');

-- 3 · The 55P04 rule itself, live against the real enum: a value added in
--     THIS transaction cannot be used in it. Rolls back with the file.
select ok(true, 'placeholder replaced below') where false;
alter type hc.advance_result add value 'plt03_probe';
select throws_ok(
  $$ select 'plt03_probe'::hc.advance_result $$,
  '55P04', null,
  '55P04: a new enum value is unusable in the transaction that adds it — the migration that ADDs must not USE');

select * from finish();
rollback;
