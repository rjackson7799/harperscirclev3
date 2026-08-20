import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// B2 · lib/hc/ingest against the LIVE stack. The DB semantics are
// 4A-proven (043–050); these tests prove the APP wrappers the webhook
// rides: the §5.2 step-2 resolver, the §5.4 quota answer, the M3
// lookalike, intake as ONE transaction (parent + children commit or
// nothing), pgmq enqueue on the hc_pipeline data plane, and the §5.1
// activation call (FWD-01's app half).
//
// Test class: LIVE-DB INTEGRATION (real stack, real roles — the same
// authority production holds; no mocks).
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let ingest: typeof import('@/lib/hc/ingest');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.4b.${randomUUID().slice(0, 8)}@example.invalid`;
const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };

const LOCAL_PART = `nell.${randomUUID().slice(0, 6)}`;
let circleId: string;
let subjectId: string;

beforeAll(async () => {
  ingest = await import('@/lib/hc/ingest');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();

  // Founder with a VERIFIED email (the §5.1 activation gate reads the
  // postgres-owned mirror, filled from auth.users on insert).
  await raw.query(
    `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
     values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
    [FOUNDER, FOUNDER_EMAIL],
  );
  await raw.query(
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'Founder 4B')`,
    [FOUNDER],
  );

  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Nell's circle",
    subjects: [
      {
        first_name: 'Nell',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: LOCAL_PART,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;

  // An accepted sender the lookalike check scores against.
  await raw.query(
    `insert into public.known_senders (circle_id, domain, accepted_by) values ($1, 'cardiology.org', $2)`,
    [circleId, FOUNDER],
  );

  return async () => {
    await raw.query(`set session_replication_role = replica`);
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
      'known_senders',
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

describe('B2 · the §5.2 step-2 resolver (FWD-01 half)', () => {
  it('unknown local part answers null — the defence-in-depth 550 branch', async () => {
    expect(await ingest.resolveForwarding('nobody.zzzzzz')).toBeNull();
  });

  it('a provisioned-but-inactive address resolves with forwarding_active false (drift stays visible)', async () => {
    const r = await ingest.resolveForwarding(LOCAL_PART);
    expect(r).not.toBeNull();
    expect(r!.circle_id).toBe(circleId);
    expect(r!.subject_id).toBe(subjectId);
    expect(r!.forwarding_active).toBe(false);
  });

  it('activation flips it (verified founder, live coordinator) and is idempotent', async () => {
    const first = await ingest.activateForwarding(founderClaims, subjectId);
    expect(first.activated).toBe(true);
    const again = await ingest.activateForwarding(founderClaims, subjectId);
    expect(again.activated).toBe(false);
    const r = await ingest.resolveForwarding(LOCAL_PART.toUpperCase());
    expect(r!.forwarding_active).toBe(true); // case-blind resolve
  });
});

describe('B2 · the §5.4 quota answer and the M3 lookalike', () => {
  it('a fresh circle answers ok with the per-message limits riding along', async () => {
    const q = await ingest.checkQuota(circleId, 'front-desk@cardiology.org');
    expect(q.outcome).toBe('ok');
    expect(q.monthly_ceiling_reached).toBe(false);
    expect(q.limits).toEqual({
      attachments_per_email: 20,
      file_bytes_max: 52428800,
      file_pages_max: 200,
    });
  });

  it('a near-miss on an accepted sender scores lookalike, the match named', async () => {
    const l = await ingest.senderLookalike(circleId, 'cardio1ogy.org');
    expect(l.lookalike).toBe(true);
    expect(l.similar_to).toBe('cardiology.org');
    const stranger = await ingest.senderLookalike(circleId, 'water-bill.example');
    expect(stranger.lookalike).toBe(false);
  });
});

describe('B2 · intake is ONE transaction (parent + children, or nothing)', () => {
  it('creates the parent and one child per attachment; a replay returns the same ids', async () => {
    const input = {
      circleId,
      subjectId,
      senderAddress: 'front-desk@cardiology.org',
      senderDisplayName: 'Front Desk',
      messageId: `mid-${randomUUID()}`,
      authResult: 'authenticated' as const,
      authDetail: { method: 'provider_fields' },
      attachments: [
        { contentType: 'application/pdf', contentLength: 1024 },
        { contentType: 'image/jpeg', contentLength: 2048 },
      ],
    };
    const first = await ingest.createEmailArrivals(input);
    expect(first.childIds).toHaveLength(2);

    const rows = await raw.query(
      `select id, channel, parent_arrival_id, auth_result, auth_detail, mime_declared, byte_size
       from public.arrivals where id = any($1) order by byte_size nulls first`,
      [[first.parentId, ...first.childIds]],
    );
    expect(rows.rows).toHaveLength(3);
    const parent = rows.rows.find((r) => r.parent_arrival_id === null)!;
    expect(parent.channel).toBe('email');
    expect(parent.auth_result).toBe('authenticated');
    expect(parent.auth_detail).toEqual({ method: 'provider_fields' });
    for (const child of rows.rows.filter((r) => r.parent_arrival_id !== null)) {
      expect(child.parent_arrival_id).toBe(first.parentId);
    }

    const replay = await ingest.createEmailArrivals(input);
    expect(replay.parentId).toBe(first.parentId);
    expect(new Set(replay.childIds)).toEqual(new Set(first.childIds));
  });

  it('a conflicting replay (same message id, different sender) raises and writes nothing new', async () => {
    const messageId = `mid-${randomUUID()}`;
    const base = {
      circleId,
      subjectId,
      senderAddress: 'a@one.example',
      senderDisplayName: null,
      messageId,
      authResult: 'unauthenticated' as const,
      authDetail: {},
      attachments: [],
    };
    await ingest.createEmailArrivals(base);
    await expect(
      ingest.createEmailArrivals({ ...base, senderAddress: 'b@two.example' }),
    ).rejects.toThrow(/idempotency_conflict/);
  });

  it('one over-cap child rolls the WHOLE intake back — no parent survives (§4.6, one transaction)', async () => {
    const messageId = `mid-${randomUUID()}`;
    await expect(
      ingest.createEmailArrivals({
        circleId,
        subjectId,
        senderAddress: 'front-desk@cardiology.org',
        senderDisplayName: null,
        messageId,
        authResult: 'authenticated' as const,
        authDetail: {},
        attachments: [
          { contentType: 'application/pdf', contentLength: 1024 },
          { contentType: 'application/pdf', contentLength: 52428801 }, // over the P5 cap
        ],
      }),
    ).rejects.toThrow(/arrival_invalid/);
    const orphans = await raw.query(
      `select count(*)::int as n from public.arrivals where circle_id = $1 and message_id = $2`,
      [circleId, messageId],
    );
    expect(orphans.rows[0].n).toBe(0);
  });
});

describe('B2 · the pgmq data plane (§1.4)', () => {
  it('enqueuePipeline lands one work item per arrival on pipeline_work', async () => {
    const made = await ingest.createEmailArrivals({
      circleId,
      subjectId,
      senderAddress: 'front-desk@cardiology.org',
      senderDisplayName: null,
      messageId: `mid-${randomUUID()}`,
      authResult: 'authenticated' as const,
      authDetail: {},
      attachments: [{ contentType: 'application/pdf', contentLength: 64 }],
    });
    const ids = [made.parentId, ...made.childIds];
    await ingest.enqueuePipeline(circleId, ids, 'email');
    const q = await raw.query(
      `select message from pgmq.q_pipeline_work where message ->> 'circle_id' = $1`,
      [circleId],
    );
    const queued = q.rows.map((r) => r.message.arrival_id);
    for (const id of ids) expect(queued).toContain(id);
    // the message carries the channel lineage the gate worker reads
    expect(q.rows.every((r) => r.message.channel === 'email')).toBe(true);
  });
});

describe('B2 · rate quotas bind at the wrapper (over_sender before over_circle)', () => {
  it('the 20th same-sender parent in an hour turns the outcome', async () => {
    const sender = `Clinic.${randomUUID().slice(0, 6)}@Bulk.Example`; // case variants share a budget
    for (let i = 0; i < 20; i++) {
      await ingest.createEmailArrivals({
        circleId,
        subjectId,
        senderAddress: i % 2 ? sender : sender.toLowerCase(),
        senderDisplayName: null,
        messageId: `mid-${randomUUID()}`,
        authResult: 'unauthenticated' as const,
        authDetail: {},
        attachments: [],
      });
    }
    const q = await ingest.checkQuota(circleId, sender.toUpperCase());
    expect(q.outcome).toBe('over_sender');
  }, 60_000);
});
