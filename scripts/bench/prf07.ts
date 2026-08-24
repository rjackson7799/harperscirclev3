// ============================================================================
// PRF-07 — the §13.2 arrival→proposals p95 harness (slice-5 plan B9;
// ADR-0019 D15's named gap, discharged as far as locally possible).
//
//   node scripts/ts-run.mjs scripts/bench/prf07.ts setup
//   node scripts/ts-run.mjs scripts/bench/prf07.ts cold   <circle>
//   node scripts/ts-run.mjs scripts/bench/prf07.ts warm   <circle>
//   node scripts/ts-run.mjs scripts/bench/prf07.ts concurrent <circle>
//   node scripts/ts-run.mjs scripts/bench/prf07.ts cleanup <circle>
//
// THE METHOD, STATED — because a p95 without its method is a number, not a
// measurement:
//
//   COHORTS.        One per corpus document class that reaches extraction:
//                   born-digital PDF, scanned PDF, phone photo, email body.
//                   §6.3 renders them at DIFFERENT resolutions, so pooling
//                   them would report a figure that describes no document.
//   SAMPLES.        WARM_RUNS per cohort per leg, stated in the output.
//   COLD vs WARM.   Reported SEPARATELY, never blended. Cold is the first
//                   observation after a restart (connection pools empty,
//                   mupdf's WASM module unloaded, no plan caches); warm is
//                   the steady state. A blended p95 flatters the cold path
//                   and slanders the warm one.
//   PERCENTILE.     PRF-06's method, verbatim: nearest-rank on the sorted
//                   sample, index ceil(0.95·n) − 1. Kept identical so the two
//                   benches' numbers are comparable.
//   QUEUE DEPTH.    Single (one arrival at a time) AND concurrent (a batch in
//                   flight), because §13.2's budget is a promise to a family
//                   whose mail arrives with everyone else's.
//
// WHAT IT MEASURES, AND WHAT IT CANNOT. This is REPORT-ONLY and it measures
// OUR MACHINERY'S SHARE of the 60 s budget: the pipeline against a LOCAL
// FIXTURE SERVER, with no provider in the path. Provider latency rides §4.3's
// lease budgets, and the hosted, provider-inclusive measurement is a named
// activation row on docs/ops/ai-provider.md carrying PRF-06's BREACH-CLAUSE
// discipline — a breach goes to the owner, never quietly absorbed.
//
// Prerequisites: the local stack (`supabase start`) and clamd, exactly as the
// local gate needs them. The fixture server is started in-process here.
// ============================================================================

import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { startAnthropicFixtureServer } from '../ai-fixture-server.mjs';
import { readCorpusFile, corpusItem, corpusMime } from '@/lib/eval/corpus';

const DB_URL =
  process.env.HC_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_DB_URL = DB_URL;
process.env.HC_PIPELINE_DB_URL ??= DB_URL;

/** Samples per cohort per leg. Stated, not implied. */
const WARM_RUNS = 12;
const COLD_RUNS = 1;
const CONCURRENT_DEPTH = 4;

/** §13.2's budget, for context only — this harness never gates on it. */
const BUDGET_MS = 60_000;

/** The cohorts, one per §6.3 rendering rule that reaches extraction. */
const COHORTS = [
  { name: 'born-digital PDF', item: 'dev-discharge-01' },
  { name: 'scanned PDF', item: 'dev-scanned-01' },
  { name: 'phone photo', item: 'dev-eob-02' },
  { name: 'email body', item: 'dev-email-01' },
] as const;

/** PRF-06's percentile method, verbatim: nearest-rank on the sorted sample. */
function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[index];
}

function summarise(name: string, samples: number[]): void {
  if (samples.length === 0) {
    console.log(`${name.padEnd(22)}  no samples`);
    return;
  }
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const worst = Math.max(...samples);
  console.log(
    `${name.padEnd(22)}  n=${String(samples.length).padStart(3)}  ` +
      `p50 ${p50.toFixed(0).padStart(6)} ms  p95 ${p95.toFixed(0).padStart(6)} ms  ` +
      `max ${worst.toFixed(0).padStart(6)} ms  (${((p95 / BUDGET_MS) * 100).toFixed(1)}% of the §13.2 budget)`,
  );
}

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

const FOUNDER = '5b000000-0000-4000-8000-0000000b0007';

async function setup(db: pg.Client): Promise<string> {
  const circleLib = await import('@/lib/hc/circle');
  const email = `prf07.${randomUUID().slice(0, 8)}@example.invalid`;
  await db.query(
    `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
     values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())
     on conflict (id) do nothing`,
    [FOUNDER, email],
  );
  await db.query(
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'PRF-07 bench')
     on conflict (id) do nothing`,
    [FOUNDER],
  );
  const created = await circleLib.createCircleFromSetup(
    { sub: FOUNDER, role: 'authenticated', email },
    {
      name: 'PRF-07 bench circle',
      subjects: [
        {
          first_name: 'Bench',
          situation: 'At home, on their own',
          postal_code: '02140',
          timezone: 'America/New_York',
          accent_color: '#7A6E9B',
          forwarding_local_part: `prf07.${randomUUID().slice(0, 6)}`,
        },
      ],
    },
  );
  console.log(`circle ${created.circle_id}`);
  return created.circle_id;
}

/**
 * One arrival, driven arrival → proposals_ready through the REAL wrappers and
 * the REAL worker code paths. Returns milliseconds, or null if the chain did
 * not reach proposals_ready (reported, never silently dropped from the
 * sample — a dropped failure is how a p95 lies).
 */
async function oneArrival(
  db: pg.Client,
  circleId: string,
  subjectId: string,
  cohort: (typeof COHORTS)[number],
): Promise<number | null> {
  const ingest = await import('@/lib/hc/ingest');
  const workers = await import('@/lib/hc/workers');
  const storage = await import('@/lib/storage/artifacts');
  const item = corpusItem(cohort.item);
  const bytes = uniquify(readCorpusFile(item), corpusMime(item));

  const started = performance.now();
  const made = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: 'bench@clinic.example',
    senderDisplayName: null,
    messageId: `mid-${randomUUID()}`,
    authResult: 'authenticated',
    authDetail: {},
    attachments: [],
  });
  const arrival = made.parentId;
  await storage.stageIntakeObject(circleId, arrival, bytes, corpusMime(item));

  // store
  const store = await workers.claimStage(arrival, 'store');
  if (store.result !== 'claimed') return null;
  const sha = createHash('sha256').update(bytes).digest('hex');
  await storage.writeArtifactObject(
    storage.artifactKey(circleId, arrival, sha),
    bytes,
    corpusMime(item),
  );
  if (
    (await workers.finalizeStore({
      arrivalId: arrival,
      leaseId: store.leaseId!,
      storageKey: storage.artifactKey(circleId, arrival, sha),
      sha256Hex: sha,
      mimeDetected: corpusMime(item),
      byteSize: bytes.byteLength,
    })) !== 'advanced'
  ) {
    return null;
  }

  // scan — the real scanner, against the gate stack's clamd.
  const scanner = await import('@/lib/scan/scanner');
  const scan = await workers.claimStage(arrival, 'scan');
  if (scan.result !== 'claimed') return null;
  const verdict = await scanner.scanBytes(bytes);
  if (verdict.verdict !== 'clean') {
    console.warn(`  scanner said ${verdict.verdict} — is clamd up?`);
    return null;
  }
  if (
    (await workers.finalizeScan(arrival, scan.leaseId!, 'clean', verdict.detail)) !== 'advanced'
  ) {
    return null;
  }
  await storage.removeStagedObject(circleId, arrival);

  // gate → extracting
  const gate = await workers.claimStage(arrival, 'gate');
  if (gate.result !== 'claimed') return null;
  if (
    (await workers.advanceArrival(arrival, 'scanned', 'extracting', gate.leaseId!, 'sender_recognised')) !==
    'advanced'
  ) {
    return null;
  }

  // extract + interpret through the worker route's own code, via the queue.
  await workers.sendPipelineWork({
    circle_id: circleId,
    arrival_id: arrival,
    stage: 'extract',
    channel: 'email',
  });
  // DRIVE UNTIL READY, rather than assuming two POSTs are this arrival's two
  // POSTs. The worker route reads a BATCH from the shared queue, so under
  // concurrency one caller routinely does another's work — which is exactly
  // what the real relay does and exactly why a per-arrival "call it twice"
  // model measures the harness rather than the pipeline. The loop below is
  // the honest shape: keep draining, watch THIS arrival, stop when it is
  // ready or the budget is spent.
  const route = await import('@/app/api/worker/[stage]/route');
  const key = process.env.HC_WORKER_KEY!;
  const deadline = started + BUDGET_MS;
  let state = 'extracting';
  while (performance.now() < deadline) {
    for (const stage of ['extract', 'interpret']) {
      await route.POST(
        new Request(`http://127.0.0.1/api/worker/${stage}`, {
          method: 'POST',
          headers: { 'x-worker-key': key },
        }),
        { params: Promise.resolve({ stage }) },
      );
    }
    const row = await db.query('select state::text as s from public.arrivals where id = $1', [
      arrival,
    ]);
    state = row.rows[0]?.s ?? 'gone';
    if (state === 'proposals_ready') return performance.now() - started;
    // A terminal state that is not proposals_ready is a real outcome, not a
    // slow one: stop rather than spin out the budget.
    if (!['extracting', 'extracted', 'interpreting'].includes(state)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  console.warn(`  ${cohort.name}: ended at ${state}, not proposals_ready`);
  return null;
}

/**
 * Give each sample its own content sha WITHOUT changing what the document
 * says. Identical bytes are a STAGE-1 DUPLICATE by design — hc.finalize_scan
 * lands `duplicate_suspected` on a content-sha the circle has already seen —
 * so a bench that re-sent one fixture would measure the duplicate path from
 * its second sample on and report a p95 for a chain it never ran.
 *
 * Trailing bytes are the right lever: a PDF ignores everything after %%EOF, a
 * JPEG everything after the EOI marker, and a text body gains a comment line.
 * The rendering, the text layer and the extracted facts are unchanged, which
 * is what keeps the samples comparable to each other.
 */
function uniquify(bytes: Uint8Array, mime: string): Uint8Array {
  const marker =
    mime === 'text/plain' ? `
# hc-bench ${randomUUID()}
` : `
% hc-bench ${randomUUID()}
`;
  return new Uint8Array(Buffer.concat([Buffer.from(bytes), Buffer.from(marker, 'latin1')]));
}

async function subjectOf(db: pg.Client, circleId: string): Promise<string> {
  const r = await db.query('select id from public.subjects where circle_id = $1 limit 1', [
    circleId,
  ]);
  if (!r.rows[0]) throw new Error('no subject — run `setup` first');
  return r.rows[0].id as string;
}

async function runLeg(
  db: pg.Client,
  circleId: string,
  runs: number,
  concurrent: number,
): Promise<void> {
  const subjectId = await subjectOf(db, circleId);
  for (const cohort of COHORTS) {
    const samples: number[] = [];
    let failed = 0;
    for (let batch = 0; batch < runs; batch += concurrent) {
      const inFlight = Math.min(concurrent, runs - batch);
      const results = await Promise.all(
        Array.from({ length: inFlight }, () => oneArrival(db, circleId, subjectId, cohort)),
      );
      for (const ms of results) {
        if (ms === null) failed++;
        else samples.push(ms);
      }
    }
    summarise(cohort.name, samples);
    if (failed > 0) console.log(`${''.padEnd(22)}  ${failed} run(s) did not reach proposals_ready`);
  }
}

async function cleanup(db: pg.Client, circleId: string): Promise<void> {
  await db.query('set session_replication_role = replica');
  await db.query(
    `delete from public.scan_results where content_sha256 in
     (select content_sha256 from public.arrivals where circle_id = $1 and content_sha256 is not null)`,
    [circleId],
  );
  for (const q of ['q_pipeline_work', 'a_pipeline_work']) {
    await db.query(`delete from pgmq.${q} where message ->> 'circle_id' = $1`, [circleId]);
  }
  for (const t of [
    'proposals',
    'extractions',
    'extraction_runs',
    'pipeline_outbox',
    'arrival_events',
    'pipeline_leases',
    'arrivals',
    'known_senders',
    'access_grants',
    'access_log',
    'circle_members',
    'subjects',
  ]) {
    await db.query(`delete from public.${t} where circle_id = $1`, [circleId]);
  }
  await db.query('delete from public.circles where id = $1', [circleId]);
  await db.query('set session_replication_role = default');
  console.log('cleaned up');
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const circleArg = process.argv[3];

  process.env.HC_WORKER_KEY ??= 'prf07-bench-worker-key-0123456789abcdef0123456789ab';
  const fixture = await startAnthropicFixtureServer();
  process.env.ANTHROPIC_BASE_URL = fixture.url;
  process.env.ANTHROPIC_API_KEY = 'fixture-not-a-credential';

  const db = await connect();
  try {
    if (mode === 'setup') {
      await setup(db);
      return;
    }
    if (!circleArg) {
      console.error('usage: prf07.ts <cold|warm|concurrent|cleanup> <circle>');
      process.exit(2);
    }
    if (mode === 'cleanup') {
      await cleanup(db, circleArg);
      return;
    }

    console.log('PRF-07 · §13.2 arrival→proposals_ready · REPORT-ONLY');
    console.log(`provider: LOCAL FIXTURE SERVER at ${fixture.url} (no provider in the path)`);
    console.log(`budget for context: ${BUDGET_MS} ms · percentile: PRF-06 nearest-rank`);
    console.log('');

    if (mode === 'cold') {
      console.log(`COLD leg — ${COLD_RUNS} sample per cohort, first observation after a restart`);
      await runLeg(db, circleArg, COLD_RUNS, 1);
    } else if (mode === 'warm') {
      console.log(`WARM leg — ${WARM_RUNS} samples per cohort, single queue depth`);
      await runLeg(db, circleArg, WARM_RUNS, 1);
    } else if (mode === 'concurrent') {
      console.log(`WARM leg — ${WARM_RUNS} samples per cohort, queue depth ${CONCURRENT_DEPTH}`);
      await runLeg(db, circleArg, WARM_RUNS, CONCURRENT_DEPTH);
    } else {
      console.error('usage: prf07.ts <setup|cold|warm|concurrent|cleanup> [circle]');
      process.exit(2);
    }

    console.log('');
    console.log('These figures are OUR MACHINERY only. The hosted, provider-inclusive');
    console.log('measurement against the full 60 s budget is a named activation row on');
    console.log('docs/ops/ai-provider.md, carrying PRF-06’s breach-clause discipline.');
  } finally {
    await db.end();
    await fixture.close();
  }
}

await main();
