// ============================================================================
// 8B U5 — the search PAGE's p95 against PRD §13.2 (search: p95 800 ms,
// ceiling 2 s; TSD §7.7). SRCH-06's "a MEASURED page p95 recorded at the 8B
// head" — a number in the deltas doc, and M4's ONLY condition is a measured
// PRF-06 breach (the scan legs in prf06.mjs), not this.
//
// What it measures: the whole answer — the gate, the three reads inside one
// withRequestRole inside one AnswerBudget, the render — from a signed-in
// member's session over HTTP, against a running server (the production
// build, `next start`, on the local stack with playwright.config's env
// block; a dev server's number includes compiles and is not the record).
//
// Usage:
//   node scripts/bench/search-p95.mjs <email> <password> <circle-id>
//     BASE_URL=http://127.0.0.1:3000   RUNS=30   TERMS=discharge,warfarin,...
//
// The account must exist with a real password (an e2e founder, provisioned
// through the real screens), and the circle should hold searchable rows —
// the script REFUSES a measurement over an empty answer, because a p95 over
// "nothing matching" measures nothing.
// ============================================================================

import { request } from '@playwright/test';

const [email, password, circle] = process.argv.slice(2);
if (!email || !password || !circle) {
  console.error('usage: node scripts/bench/search-p95.mjs <email> <password> <circle-id>');
  process.exit(2);
}
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const runs = Number(process.env.RUNS ?? 30);
const terms = (process.env.TERMS ?? 'discharge,warfarin,cardiology,zqpharm,metoprolol').split(',');
const P95_TARGET_MS = 800;
const CEILING_MS = 2000;

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

const ctx = await request.newContext({ baseURL: base });
try {
  const signIn = await ctx.post('/sign-in/submit', { form: { email, password }, maxRedirects: 0 });
  const location = signIn.headers()['location'] ?? '';
  if (signIn.status() !== 303 || /[?&]e=/.test(location)) {
    throw new Error(`sign-in refused: ${signIn.status()} ${location}`);
  }
  // Control: the answer is over real rows, from this member's context.
  const control = await ctx.get(`/${circle}/search?q=${encodeURIComponent(terms[0])}`);
  const body = await control.text();
  if (control.status() !== 200) throw new Error(`control: ${control.status()}`);
  if (!/results-(documents|timeline|tasks)/.test(body)) {
    throw new Error(`control: "${terms[0]}" rendered no group — refusing to measure an empty answer`);
  }
  if (/name="q"/.test(body) === false) throw new Error('control: the search field is not in the chrome');

  // Warm: one hit per term, untimed.
  for (const t of terms) await ctx.get(`/${circle}/search?q=${encodeURIComponent(t)}`);

  const times = [];
  const perTerm = new Map(terms.map((t) => [t, []]));
  for (let i = 0; i < runs; i++) {
    for (const t of terms) {
      const t0 = performance.now();
      const res = await ctx.get(`/${circle}/search?q=${encodeURIComponent(t)}`);
      await res.text();
      const dt = performance.now() - t0;
      if (res.status() !== 200) throw new Error(`"${t}": ${res.status()}`);
      times.push(dt);
      perTerm.get(t).push(dt);
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = pct(sorted, 50);
  const p95 = pct(sorted, 95);
  const p99 = pct(sorted, 99);
  const max = sorted[sorted.length - 1];
  console.log(`search page · ${base} · ${runs} runs × ${terms.length} terms = ${times.length} timed requests (warm)`);
  console.table(
    [...perTerm.entries()].map(([term, ts]) => {
      const s = [...ts].sort((a, b) => a - b);
      return { term, n: s.length, p50_ms: Math.round(pct(s, 50)), p95_ms: Math.round(pct(s, 95)), max_ms: Math.round(s[s.length - 1]) };
    }),
  );
  console.log(
    `ALL  p50 ${Math.round(p50)} ms · p95 ${Math.round(p95)} ms · p99 ${Math.round(p99)} ms · max ${Math.round(max)} ms`,
  );
  const verdict =
    p95 <= P95_TARGET_MS
      ? `WITHIN §13.2 (p95 ${Math.round(p95)} ≤ ${P95_TARGET_MS} ms; ceiling ${CEILING_MS} ms ${max <= CEILING_MS ? 'held' : 'BREACHED by max'})`
      : `BREACH of §13.2's p95 target (${Math.round(p95)} > ${P95_TARGET_MS} ms) — record it; M4 is conditioned on prf06's SCAN legs, not on this`;
  console.log(verdict);
} finally {
  await ctx.dispose();
}
