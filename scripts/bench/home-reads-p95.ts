// ============================================================================
// 9B U4 — HOME's own DB reads against PRF-06's 250 ms PAGE TRIPWIRE.
//
// scripts/bench/home-p95.mjs measures the whole answer over HTTP against PRD
// §13.2 (1.5 s / 3 s). This measures the other half of HOME-05's sentence:
// the page-sized record queries the composition issues, at the layer PRF-06's
// tripwire actually governs. Comparing an HTTP figure to a DB-level bound is
// a category error, and PRF-06's own coverage row already says so — so the
// two numbers are measured by two harnesses and reported separately.
//
// It runs the REAL wrappers, never a re-typed query: lib/hc/timeline's three
// Home reads and lib/hc/tasks' listTasks, through withRequestRole as the
// caller, so what is timed is what the page issues.
//
// METHOD, PRF-06's verbatim: warm only (5 untimed passes first), 25 timed
// runs per read, nearest-rank p95. Cold is a different question and is not
// answered here.
//
// Usage (a standalone harness, so HC_DB_URL is the maintenance login — the
// runtime login cannot provision through auth; traps §3):
//   HC_DB_URL=postgresql://postgres:postgres@127.0.0.1:54342/postgres \
//     node scripts/ts-run.mjs scripts/bench/home-reads-p95.ts <circle> <account-id>
// ============================================================================

import { latestEventPerSubject, recentEvents, upcomingEvents } from '@/lib/hc/timeline';
import { listTasks, myMembership } from '@/lib/hc/tasks';

const [circle, account] = process.argv.slice(2);
if (!circle || !account) {
  console.error('usage: node scripts/ts-run.mjs scripts/bench/home-reads-p95.ts <circle> <account-id>');
  process.exit(2);
}
const claims = { sub: account, role: 'authenticated' };
const WARM = 5;
const RUNS = 25;
const PAGE_TRIPWIRE_MS = 250;

function pct(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

const reads: [string, () => Promise<unknown>][] = [
  ['myMembership', () => myMembership(claims, circle)],
  ['listTasks', () => listTasks(claims, circle)],
  ['latestEventPerSubject', () => latestEventPerSubject(claims, circle)],
  ['upcomingEvents', () => upcomingEvents(claims, circle)],
  ['recentEvents', () => recentEvents(claims, circle)],
];

const rows: { read: string; n: number; p50_ms: number; p95_ms: number; max_ms: number }[] = [];
let worst = 0;
for (const [name, run] of reads) {
  for (let i = 0; i < WARM; i++) await run();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await run();
    times.push(performance.now() - t0);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = pct(sorted, 95);
  worst = Math.max(worst, p95);
  rows.push({
    read: name,
    n: sorted.length,
    p50_ms: Math.round(pct(sorted, 50)),
    p95_ms: Math.round(p95),
    max_ms: Math.round(sorted[sorted.length - 1]),
  });
}
console.table(rows);
console.log(
  worst <= PAGE_TRIPWIRE_MS
    ? `WITHIN PRF-06's page tripwire (worst read p95 ${Math.round(worst)} ≤ ${PAGE_TRIPWIRE_MS} ms) — M4 closes UNCONSUMED on this measurement`
    : `BREACH of PRF-06's ${PAGE_TRIPWIRE_MS} ms page tripwire (worst read p95 ${Math.round(worst)} ms) — this is M4's condition; record the numbers in the red commit`,
);
process.exit(0);
