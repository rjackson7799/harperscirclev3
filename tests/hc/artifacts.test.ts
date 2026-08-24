import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';

// ============================================================================
// B7 · lib/hc/artifacts against the LIVE stack: the §1.3 steps-1+2 read
// (RLS + hc.visible_at ≥ view in ONE query — nonexistent, unauthorized
// and revoked callers share one null), and the artifact_read access-log
// append on the evidentiary boundary (hc.log's chain, seq intact).
//
// Test class: LIVE-DB INTEGRATION.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let artifacts: typeof import('@/lib/hc/artifacts');
let ingest: typeof import('@/lib/hc/ingest');
let workers: typeof import('@/lib/hc/workers');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.b7.${randomUUID().slice(0, 8)}@example.invalid`;
const OUTSIDER = randomUUID();
const OUTSIDER_EMAIL = `outsider.b7.${randomUUID().slice(0, 8)}@example.invalid`;
const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };
const outsiderClaims = { sub: OUTSIDER, role: 'authenticated', email: OUTSIDER_EMAIL };

let circleId: string;
let subjectId: string;
let cleanArrival: string;
let rawArrival: string;

const BYTES = Buffer.from('%PDF-1.7 artifact-b7');
const SHA = createHash('sha256').update(BYTES).digest('hex');

beforeAll(async () => {
  artifacts = await import('@/lib/hc/artifacts');
  ingest = await import('@/lib/hc/ingest');
  workers = await import('@/lib/hc/workers');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const [id, email, name] of [
    [FOUNDER, FOUNDER_EMAIL, 'Founder B7'],
    [OUTSIDER, OUTSIDER_EMAIL, 'Outsider B7'],
  ] as const) {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
      [id, email],
    );
    await raw.query(
      `insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`,
      [id, name],
    );
  }
  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Ida's circle",
    subjects: [
      {
        first_name: 'Ida',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `ida.${randomUUID().slice(0, 6)}`,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;

  // One clean, stored arrival; one still-raw arrival.
  const a = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: 'sender@clinic.example',
    senderDisplayName: null,
    messageId: `mid-${randomUUID()}`,
    authResult: 'unauthenticated',
    authDetail: {},
    attachments: [],
  });
  cleanArrival = a.parentId;
  const store = await workers.claimStage(cleanArrival, 'store');
  await workers.finalizeStore({
    arrivalId: cleanArrival,
    leaseId: store.leaseId!,
    storageKey: `circle/${circleId}/arrival/${cleanArrival}/${SHA}`,
    sha256Hex: SHA,
    mimeDetected: 'application/pdf',
    byteSize: BYTES.byteLength,
  });
  const scan = await workers.claimStage(cleanArrival, 'scan');
  await workers.finalizeScan(cleanArrival, scan.leaseId!, 'clean', {});

  const b = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: 'sender@clinic.example',
    senderDisplayName: null,
    messageId: `mid-${randomUUID()}`,
    authResult: 'unauthenticated',
    authDetail: {},
    attachments: [],
  });
  rawArrival = b.parentId;

  return async () => {
    await raw.query(`set session_replication_role = replica`);
    await raw.query('delete from public.scan_results where content_sha256 = decode($1, $2)', [
      SHA,
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
    await raw.query('delete from public.accounts where id = any($1)', [[FOUNDER, OUTSIDER]]);
    await raw.query('delete from auth.users where id = any($1)', [[FOUNDER, OUTSIDER]]);
    await raw.query(`set session_replication_role = default`);
    await raw.end();
  };
});

describe('B7 · readableArtifact — steps 1+2 in one RLS-true query', () => {
  it('the founder reads the clean row: key, verdict, mime, size', async () => {
    const row = await artifacts.readableArtifact(founderClaims, cleanArrival);
    expect(row).toMatchObject({
      circle_id: circleId,
      subject_id: subjectId,
      storage_key: `circle/${circleId}/arrival/${cleanArrival}/${SHA}`,
      scan_verdict: 'clean',
      mime_detected: 'application/pdf',
    });
  });

  it('a not-yet-scanned arrival comes back WITHOUT a verdict — the route\'s independent clean gate refuses it', async () => {
    const row = await artifacts.readableArtifact(founderClaims, rawArrival);
    expect(row).not.toBeNull();
    expect(row!.scan_verdict).toBeNull();
    expect(row!.storage_key).toBeNull();
  });

  it('nonexistent and unauthorized share ONE null (404 ≡ 403 at the data layer)', async () => {
    expect(await artifacts.readableArtifact(founderClaims, randomUUID())).toBeNull();
    expect(await artifacts.readableArtifact(outsiderClaims, cleanArrival)).toBeNull();
  });
});

describe('B7 · the artifact_read entry (5B B8: now hc.log_artifact_read)', () => {
  it('appends to the hash chain with the actor and the arrival named', async () => {
    const before = await raw.query(
      `select coalesce(max(seq), 0)::int as seq from public.access_log where circle_id = $1`,
      [circleId],
    );
    await artifacts.logArtifactRead({ claims: founderClaims, arrivalId: cleanArrival });
    const entry = await raw.query(
      `select seq, event_type, actor_account_id, subject_id, object_type, object_id,
              prev_hash is not null as chained, entry_hash is not null as hashed
       from public.access_log
       where circle_id = $1 and event_type = 'artifact_read'
       order by seq desc limit 1`,
      [circleId],
    );
    expect(entry.rows).toHaveLength(1);
    expect(entry.rows[0]).toMatchObject({
      event_type: 'artifact_read',
      actor_account_id: FOUNDER,
      subject_id: subjectId,
      object_type: 'arrival',
      object_id: cleanArrival,
      chained: true,
      hashed: true,
    });
    expect(Number(entry.rows[0].seq)).toBe(Number(before.rows[0].seq) + 1);
  });
});

// ============================================================================
// 5B B8 · What the definer buys that the interim did not (EVD-01).
//
// The 4B boundary appended AS hc_internal on the maintenance connection, with
// the route's own authorization the only gate — the write itself asked
// nothing. hc.log_artifact_read re-proves RLS-10's letter IN-FUNCTION: the
// arrival must be live and the caller must clear VIEW on it. So a caller who
// could somehow reach the wrapper without the route's checks now writes
// NOTHING, where before they would have written a real entry naming
// themselves.
// ============================================================================

describe('5B B8 · the definer re-proves authorization in-function', () => {
  it('an unauthorized caller writes no entry at all', async () => {
    const before = await raw.query(
      `select count(*)::int as n from public.access_log
        where circle_id = $1 and event_type = 'artifact_read'`,
      [circleId],
    );
    await expect(
      artifacts.logArtifactRead({ claims: outsiderClaims, arrivalId: cleanArrival }),
    ).rejects.toThrow();
    const after = await raw.query(
      `select count(*)::int as n from public.access_log
        where circle_id = $1 and event_type = 'artifact_read'`,
      [circleId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('a nonexistent arrival refuses in the same shape as a foreign one (DEF-10)', async () => {
    await expect(
      artifacts.logArtifactRead({ claims: founderClaims, arrivalId: randomUUID() }),
    ).rejects.toThrow(/artifact_refused/);
  });
});
