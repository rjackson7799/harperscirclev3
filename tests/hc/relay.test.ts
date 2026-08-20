import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// B5 · The A.5 worker-layer halves, LIVE (slice-4 plan B5; RLY-01):
//
//   KILL-BEFORE-TRANSITION — a worker that claims and dies has already
//   burned the attempt durably (§4.3: claim commits standalone); its
//   lease expiring TRANSFERS ownership, its late finalize is fenced
//   stale, and the budget exhausts to the honest terminal state.
//
//   OUTBOX-LOSS RECOVERY — the relay's claim/ack contract end-to-end
//   at app depth (OBX-01): a drained-but-unacked row is not re-drained
//   inside the window, re-delivers once the window lapses (the crash-
//   between-drain-and-enqueue story), and an acked row never returns.
//
// Test class: LIVE-DB INTEGRATION (the concurrency suite owns the
// two-session races; this file proves the APP wrappers ride them).
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let workers: typeof import('@/lib/hc/workers');
let ingest: typeof import('@/lib/hc/ingest');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.b5.${randomUUID().slice(0, 8)}@example.invalid`;
const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };

let circleId: string;
let subjectId: string;

async function mkArrival(): Promise<string> {
  const made = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: 'sender@stranger.example',
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
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'Founder B5')`,
    [FOUNDER],
  );
  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Ola's circle",
    subjects: [
      {
        first_name: 'Ola',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `ola.${randomUUID().slice(0, 6)}`,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;

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

async function expireLease(leaseId: string): Promise<void> {
  await raw.query(
    `update public.pipeline_leases set deadline = now() - interval '1 second' where id = $1`,
    [leaseId],
  );
}

describe('B5 · kill-before-transition: the attempt is burned durably', () => {
  it('a dead worker\'s expired lease transfers ownership; its late finalize is stale; the budget exhausts honestly', async () => {
    const arrival = await mkArrival();

    // Attempt 1 claims and "dies" (no finalize). The claim committed.
    const first = await workers.claimStage(arrival, 'store');
    expect(first.result).toBe('claimed');
    expect(first.attemptNo).toBe(1);

    // A live lease refuses the next claim — no double-claim window.
    const whileLive = await workers.claimStage(arrival, 'store');
    expect(whileLive.result).toBe('stale_lease');

    // Its deadline lapsing is the moment ownership TRANSFERS.
    await expireLease(first.leaseId!);
    const second = await workers.claimStage(arrival, 'store');
    expect(second.result).toBe('claimed');
    expect(second.attemptNo).toBe(2); // attempt 1 burned, durably

    // The late first worker cannot publish (§4.2's fence).
    const late = await workers.finalizeStore({
      arrivalId: arrival,
      leaseId: first.leaseId!,
      storageKey: `circle/${circleId}/arrival/${arrival}/${'0'.repeat(64)}`,
      sha256Hex: '0'.repeat(64),
      mimeDetected: 'application/pdf',
      byteSize: 10,
    });
    expect(late).toBe('stale_lease');

    // Store's budget is 2: the third claim exhausts to the stated
    // terminal — nothing was kept, and the state says so.
    await expireLease(second.leaseId!);
    const third = await workers.claimStage(arrival, 'store');
    expect(third.result).toBe('exhausted');
    const state = await raw.query('select state from public.arrivals where id = $1', [arrival]);
    expect(state.rows[0].state).toBe('store_failed');
  }, 30_000);
});

describe('B5 · outbox-loss recovery: claim/ack at-least-once, end-to-end', () => {
  it('drain claims; unacked re-delivers after the window; acked never returns', async () => {
    const arrival = await mkArrival();
    await raw.query(
      `insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
       values ($1, $2, 'sweeper_requeue')`,
      [circleId, arrival],
    );

    // Drain 1 CLAIMS the row (stage derived from the live state:
    // received ⇒ store).
    const drained = await workers.outboxDrain(100);
    const mine = drained.find((d) => d.arrivalId === arrival);
    expect(mine).toBeDefined();
    expect(mine!.stage).toBe('store');

    // A second drain inside the window does NOT re-deliver it.
    const inside = await workers.outboxDrain(100);
    expect(inside.find((d) => d.arrivalId === arrival)).toBeUndefined();

    // The relay "crashed" before ack: rewind the claim window — the row
    // re-delivers (a delay, never a loss).
    await raw.query(
      `update public.pipeline_outbox set drained_at = now() - interval '301 seconds'
       where id = $1`,
      [mine!.outboxId],
    );
    const redelivered = await workers.outboxDrain(100);
    const again = redelivered.find((d) => d.arrivalId === arrival);
    expect(again).toBeDefined();

    // Ack closes delivery; double-ack is idempotent; it never returns.
    expect(await workers.outboxAck([again!.outboxId])).toBe(1);
    expect(await workers.outboxAck([again!.outboxId])).toBe(0);
    await raw.query(
      `update public.pipeline_outbox set drained_at = now() - interval '301 seconds'
       where id = $1`,
      [again!.outboxId],
    );
    const after = await workers.outboxDrain(100);
    expect(after.find((d) => d.arrivalId === arrival)).toBeUndefined();
  }, 30_000);
});
