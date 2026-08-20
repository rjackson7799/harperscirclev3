import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// B3 · lib/hc/upload against the LIVE stack: the right-to-ingest probe
// (manage over the all-domain taint — who can approve can ingest, the Q6
// audience) and the upload-channel arrival keyed to one upload attempt.
//
// Test class: LIVE-DB INTEGRATION.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let upload: typeof import('@/lib/hc/upload');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.b3.${randomUUID().slice(0, 8)}@example.invalid`;
const OUTSIDER = randomUUID();
const OUTSIDER_EMAIL = `outsider.b3.${randomUUID().slice(0, 8)}@example.invalid`;

const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };
const outsiderClaims = { sub: OUTSIDER, role: 'authenticated', email: OUTSIDER_EMAIL };

let circleId: string;
let subjectId: string;

beforeAll(async () => {
  upload = await import('@/lib/hc/upload');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const [id, email, name] of [
    [FOUNDER, FOUNDER_EMAIL, 'Founder B3'],
    [OUTSIDER, OUTSIDER_EMAIL, 'Outsider B3'],
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
    name: "Sam's circle",
    subjects: [
      {
        first_name: 'Sam',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `sam.${randomUUID().slice(0, 6)}`,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;

  return async () => {
    await raw.query(`set session_replication_role = replica`);
    for (const t of [
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

describe('B3 · the right-to-ingest probe (manage over the all-domain taint)', () => {
  it('the founder (manage×5 by construction) may ingest; the circle comes back', async () => {
    const r = await upload.canIngestForSubject(founderClaims, subjectId);
    expect(r).toEqual({ circle_id: circleId });
  });

  it('a ghost subject and a non-member answer the SAME null (no oracle)', async () => {
    expect(await upload.canIngestForSubject(founderClaims, randomUUID())).toBeNull();
    expect(await upload.canIngestForSubject(outsiderClaims, subjectId)).toBeNull();
  });
});

describe('B3 · the upload-channel arrival, keyed to one attempt', () => {
  it('creates channel=upload with measured bytes; the same attempt replays to the same id', async () => {
    const uploadId = randomUUID();
    const first = await upload.createUploadArrival({
      circleId,
      subjectId,
      byteSize: 4096,
      mimeDeclared: 'application/pdf',
      uploadId,
    });
    const row = await raw.query(
      'select channel, byte_size, ingest_idempotency_key from public.arrivals where id = $1',
      [first.arrivalId],
    );
    expect(row.rows[0].channel).toBe('upload');
    expect(Number(row.rows[0].byte_size)).toBe(4096);
    expect(row.rows[0].ingest_idempotency_key).toBe(`upload:${uploadId}`);

    const replay = await upload.createUploadArrival({
      circleId,
      subjectId,
      byteSize: 4096,
      mimeDeclared: 'application/pdf',
      uploadId,
    });
    expect(replay.arrivalId).toBe(first.arrivalId);
  });
});
