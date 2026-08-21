import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';

// ============================================================================
// B4 · lib/hc/workers against the LIVE stack: the real claim → COMMIT →
// finalize sequence over the 4A machinery (043–050 own the DB semantics;
// this file proves the WRAPPERS carry the exact signatures and the
// worker-facing contracts: claim outcomes, the finalizers' key/sha
// shapes, the cache, the gate probes, and the pgmq data plane).
//
// Test class: LIVE-DB INTEGRATION.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let workers: typeof import('@/lib/hc/workers');
let ingest: typeof import('@/lib/hc/ingest');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.b4.${randomUUID().slice(0, 8)}@example.invalid`;
const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };

let circleId: string;
let subjectId: string;

const BYTES = Buffer.from('%PDF-1.7 live-b4');
const SHA_HEX = createHash('sha256').update(BYTES).digest('hex');

async function mkArrival(): Promise<string> {
  const made = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: 'front-desk@cardiology.org',
    senderDisplayName: null,
    messageId: `mid-${randomUUID()}`,
    authResult: 'unauthenticated',
    authDetail: {},
    attachments: [],
  });
  return made.parentId;
}

beforeAll(async () => {
  workers = await import('@/lib/hc/workers');
  ingest = await import('@/lib/hc/ingest');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  await raw.query(
    `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
     values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
    [FOUNDER, FOUNDER_EMAIL],
  );
  await raw.query(
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'Founder B4')`,
    [FOUNDER],
  );
  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Ada's circle",
    subjects: [
      {
        first_name: 'Ada',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `ada.${randomUUID().slice(0, 6)}`,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;

  return async () => {
    await raw.query(`set session_replication_role = replica`);
    await raw.query('delete from public.scan_results where content_sha256 = decode($1, $2)', [
      SHA_HEX,
      'hex',
    ]);
    await raw.query(`delete from pgmq.q_pipeline_work where message ->> 'circle_id' = $1`, [
      circleId,
    ]);
    await raw.query(`delete from pgmq.a_pipeline_work where message ->> 'circle_id' = $1`, [
      circleId,
    ]);
    for (const t of [
      'pipeline_outbox',
      'arrival_events',
      'pipeline_leases',
      'arrivals',
      'access_grants',
      'access_log',
      'circle_members',
      'subjects',
    ]) {
      await raw.query(`delete from public.${t} where circle_id = $1`, [circleId]);
    }
    await raw.query('delete from public.circles where id = $1', [circleId]);
    await raw.query('delete from public.accounts where id = $1', [FOUNDER]);
    await raw.query('delete from auth.users where id = $1', [FOUNDER]);
    await raw.query(`set session_replication_role = default`);
    await raw.end();
  };
});

describe('B4 · store → scan → gate over the real machinery', () => {
  it('runs one arrival through claim/finalize to held_unknown_sender, cache row landing on the way', async () => {
    const arrival = await mkArrival();

    // store
    const storeClaim = await workers.claimStage(arrival, 'store');
    expect(storeClaim.result).toBe('claimed');
    expect(storeClaim.attemptNo).toBe(1);
    const key = `circle/${circleId}/arrival/${arrival}/${SHA_HEX}`;
    const stored = await workers.finalizeStore({
      arrivalId: arrival,
      leaseId: storeClaim.leaseId!,
      storageKey: key,
      sha256Hex: SHA_HEX,
      mimeDetected: 'application/pdf',
      byteSize: BYTES.byteLength,
    });
    expect(stored).toBe('advanced');
    const afterStore = await raw.query(
      `select state, storage_key, mime_detected, byte_size, encode(content_sha256,'hex') as sha
       from public.arrivals where id = $1`,
      [arrival],
    );
    expect(afterStore.rows[0]).toMatchObject({
      state: 'stored',
      storage_key: key,
      mime_detected: 'application/pdf',
      sha: SHA_HEX,
    });

    // a redelivered store message absorbs cleanly
    const replayClaim = await workers.claimStage(arrival, 'store');
    expect(replayClaim.result).toBe('already_advanced');

    // scan (cache miss → the worker would call the adapter; here the
    // wrapper contract: finalize clean writes verdict + the cache row)
    expect(await workers.scanCacheLookup(SHA_HEX)).toBeNull();
    const scanClaim = await workers.claimStage(arrival, 'scan');
    expect(scanClaim.result).toBe('claimed');
    const scanned = await workers.finalizeScan(arrival, scanClaim.leaseId!, 'clean', {});
    expect(scanned).toBe('advanced');
    const cached = await workers.scanCacheLookup(SHA_HEX);
    expect(cached?.verdict).toBe('clean');

    // gate: stranger mail holds (AC-INBOX-7)
    expect(await workers.senderRecognised(arrival)).toBe(false);
    const gateClaim = await workers.claimStage(arrival, 'gate');
    expect(gateClaim.result).toBe('claimed');
    const held = await workers.advanceArrival(
      arrival,
      'scanned',
      'held_unknown_sender',
      gateClaim.leaseId!,
      'sender_unknown',
    );
    expect(held).toBe('advanced');
    const finalState = await raw.query('select state from public.arrivals where id = $1', [
      arrival,
    ]);
    expect(finalState.rows[0].state).toBe('held_unknown_sender');
  }, 30_000);

  it('finalize_store refuses a key that is not THIS arrival\'s content address', async () => {
    const arrival = await mkArrival();
    const claim = await workers.claimStage(arrival, 'store');
    await expect(
      workers.finalizeStore({
        arrivalId: arrival,
        leaseId: claim.leaseId!,
        storageKey: `circle/${circleId}/arrival/${randomUUID()}/${SHA_HEX}`,
        sha256Hex: SHA_HEX,
        mimeDetected: 'application/pdf',
        byteSize: BYTES.byteLength,
      }),
    ).rejects.toThrow(/store_invalid/);
  });
});

describe('B4 · the pgmq data plane round trip', () => {
  it('send → read → archive; the archive carries the channel lineage lookupChannel reads', async () => {
    const arrival = await mkArrival();
    await workers.sendPipelineWork({
      circle_id: circleId,
      arrival_id: arrival,
      stage: 'store',
      channel: 'email',
    });
    // drain until OUR message comes up (the shared queue may hold others)
    let mine: { msg_id: number } | undefined;
    for (let i = 0; i < 10 && !mine; i++) {
      const batch = await workers.readPipelineWork(10);
      mine = batch.find(
        (m) => m.message.arrival_id === arrival && m.message.stage === 'store',
      ) as { msg_id: number } | undefined;
      for (const other of batch) {
        if (other !== mine) await workers.deferPipelineWork(other.msg_id);
      }
    }
    expect(mine).toBeDefined();
    await workers.archivePipelineWork(mine!.msg_id);

    const inQueue = await raw.query(
      `select count(*)::int as n from pgmq.q_pipeline_work where (message ->> 'arrival_id') = $1`,
      [arrival],
    );
    expect(inQueue.rows[0].n).toBe(0);
    const inArchive = await raw.query(
      `select count(*)::int as n from pgmq.a_pipeline_work where (message ->> 'arrival_id') = $1`,
      [arrival],
    );
    expect(inArchive.rows[0].n).toBe(1);

    expect(await workers.lookupChannel(arrival)).toBe('email');
    expect(await workers.lookupChannel(randomUUID())).toBeNull();
  }, 30_000);
});
