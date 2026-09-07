// ============================================================================
// 9B U4 — HOME's page p95 against PRD §13.2 (a record surface: p95 1.5 s,
// ceiling 3 s) and PRF-06's 250 ms DB-level page tripwire. HOME-05's "a
// MEASURED page p95 recorded at the 9B head" — a number in the deltas doc,
// never an assertion in a test.
//
// M4 — the reserved and NAMED migration slot for one composed Home read
// definer — is consumed ONLY on a MEASURED breach here, with the numbers
// pasted into the red commit (slice-9 plan Q2). The script reports measurements;
// fixture validity, gate closure and migration authorization require disposition.
//
// WHAT IT MEASURES: the whole answer over HTTP from a signed-in member's own
// session — the gate, the EIGHT reads inside one AnswerBudget (three through
// supabase-js, five through withRequestRole), the render. Against a running
// server: the PRODUCTION build under `next start`, on the local stack, with
// playwright.config's webServer env block. A dev server's number includes
// compiles and is not the record (the search-p95 rule, kept verbatim).
//
// It refuses to measure the wrong thing. Home has TWO states and they cost
// differently, so the mode is explicit and the script checks it got the one
// it was asked for:
//   MODE=router (default) — the five §4.7.2 blocks; refuses if the page
//                           renders the day-one card instead.
//   MODE=day-one          — the forwarding-address card; refuses if a block
//                           heading is present.
//
// Usage:
//   node scripts/bench/home-p95.mjs <email> <password> <circle-id>
//     BASE_URL=http://127.0.0.1:3000   RUNS=150   MODE=router
// ============================================================================

import { request } from '@playwright/test';

const [email, password, circle] = process.argv.slice(2);
if (!email || !password || !circle) {
  console.error('usage: node scripts/bench/home-p95.mjs <email> <password> <circle-id>');
  process.exit(2);
}
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const runs = Number(process.env.RUNS ?? 150);
const mode = process.env.MODE ?? 'router';
if (mode !== 'router' && mode !== 'day-one') {
  console.error(`MODE must be "router" or "day-one" (got ${mode})`);
  process.exit(2);
}
// PRD §13.2, the record-surface row. PRF-06's 250 ms is a DB-level page
// tripwire measured by prf06.mjs, not by this HTTP number; it is printed
// alongside so the two are never confused for one another.
const P95_TARGET_MS = 1500;
const CEILING_MS = 3000;
const PRF06_PAGE_TRIPWIRE_MS = 250;

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

const ctx = await request.newContext({ baseURL: base });
function assertHome(body, status, sample) {
  if (status !== 200) throw new Error(`${sample}: ${status}`);
  const hasBlocks = /aria-labelledby="(needs-review|my-tasks|whats-coming|recent-activity|subject-)/.test(body);
  const hasCard = /forwarding address/.test(body);
  if (mode === 'router' && (!hasBlocks || hasCard)) {
    throw new Error(`${sample}: expected the populated Home router; measurement invalid`);
  }
  if (mode === 'day-one' && (!hasCard || hasBlocks)) {
    throw new Error(`${sample}: expected day-one Home; measurement invalid`);
  }
}
try {
  const signIn = await ctx.post('/sign-in/submit', { form: { email, password }, maxRedirects: 0 });
  const location = signIn.headers()['location'] ?? '';
  if (signIn.status() !== 303 || /[?&]e=/.test(location)) {
    throw new Error(`sign-in refused: ${signIn.status()} ${location}`);
  }

  // CONTROL: the answer is the state we were asked to measure, over real
  // rows, from this member's own context.
  const control = await ctx.get(`/${circle}`);
  const body = await control.text();
  assertHome(body, control.status(), 'control');

  // Warm, untimed.
  for (let i = 0; i < 5; i++) {
    const res = await ctx.get(`/${circle}`);
    assertHome(await res.text(), res.status(), `warm-up ${i}`);
  }

  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = await ctx.get(`/${circle}`);
    const body = await res.text();
    const dt = performance.now() - t0;
    assertHome(body, res.status(), `run ${i}`);
    times.push(dt);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = pct(sorted, 50);
  const p95 = pct(sorted, 95);
  const p99 = pct(sorted, 99);
  const max = sorted[sorted.length - 1];
  console.log(`home page (${mode}) · ${base} · ${times.length} timed requests (warm)`);
  console.log(
    `ALL  p50 ${Math.round(p50)} ms · p95 ${Math.round(p95)} ms · p99 ${Math.round(p99)} ms · max ${Math.round(max)} ms`,
  );
  console.log(
    p95 <= P95_TARGET_MS
      ? `WITHIN §13.2 (p95 ${Math.round(p95)} ≤ ${P95_TARGET_MS} ms; ceiling ${CEILING_MS} ms ${max <= CEILING_MS ? 'held' : 'BREACHED by max'}) — record fixture and reviewed commit; no automatic gate closure`
      : `BREACH of §13.2's p95 target (${Math.round(p95)} > ${P95_TARGET_MS} ms) — record the measurement for disposition; no migration is authorized by this output`,
  );
  console.log(
    `PRF-06's ${PRF06_PAGE_TRIPWIRE_MS} ms page tripwire is a DB-level number measured by scripts/bench/prf06.mjs — it is NOT this HTTP figure, and the two are not compared here.`,
  );
} finally {
  await ctx.dispose();
}
