import { createHash, timingSafeEqual } from 'node:crypto';
import {
  lookupLineage,
  outboxAck,
  outboxDrain,
  sendPipelineWork,
  sweeperPass,
  type PipelineStage,
} from '@/lib/hc/workers';

/**
 * /api/worker/relay — RLY-01's scheduler heart (TSD §1.4, §4.2 as
 * amended by A6, §4.11; slice-4 plan B5). Every minute (vercel.json):
 *
 *   1. The OUTBOX leg: hc.outbox_drain claims rows → each becomes a
 *      pgmq work item (circle/channel from the archive lineage) →
 *      hc.outbox_ack closes exactly the deliveries that were enqueued.
 *      A crash between drain and enqueue leaves rows unacked and the
 *      300 s window re-delivers them — OBX-01's contract, now
 *      exercised end-to-end. A drained row whose arrival is not in a
 *      worker-entry state is STALE (the state moved on) and is acked
 *      without a send.
 *   2. The SWEEPER leg: hc.sweeper_pass performs its four §4.11 duties
 *      DB-side; its advisory requeue listing becomes work items here,
 *      revalidated by hc.claim_stage at claim time.
 *
 * The 4B stages present in a pass are eager-fired once each; extract/
 * interpret items are enqueued for slice 5's workers and never fired
 * (the Q7 seam). Two invokers, two secrets, the security-actions
 * posture: GET = the Vercel cron (CRON_SECRET), POST = the operational
 * path (HC_WORKER_KEY); either absent disables its path with 503.
 */

const FIREABLE: ReadonlySet<string> = new Set(['store', 'scan', 'gate']);

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function enqueueWithLineage(
  arrivalId: string,
  stage: PipelineStage,
): Promise<void> {
  const lineage = await lookupLineage(arrivalId);
  await sendPipelineWork({
    circle_id: lineage?.circle_id ?? null,
    arrival_id: arrivalId,
    stage,
    channel: lineage?.channel ?? null,
  });
}

async function relayPass(origin: string, workerKey: string): Promise<Response> {
  const firedStages = new Set<string>();

  // ── 1 · the outbox leg: drain → enqueue → ack, in that order.
  const drained = await outboxDrain(100);
  const ackable: string[] = [];
  for (const row of drained) {
    if (!row.stage) {
      // Stale: the arrival moved past every worker-entry state while
      // this row waited. Nothing to enqueue; close the delivery.
      ackable.push(row.outboxId);
      continue;
    }
    try {
      await enqueueWithLineage(row.arrivalId, row.stage);
      ackable.push(row.outboxId);
      if (FIREABLE.has(row.stage)) firedStages.add(row.stage);
    } catch (err) {
      // Unacked: the 300 s window re-delivers this row (OBX-01).
      console.error(`worker/relay: enqueue failed for ${row.arrivalId}: ${(err as Error).message}`);
    }
  }
  const acked = await outboxAck(ackable);

  // ── 2 · the sweeper leg: the advisory listing becomes work.
  const sweep = await sweeperPass();
  for (const item of sweep.requeue) {
    try {
      await enqueueWithLineage(item.arrival_id, item.stage);
      if (FIREABLE.has(item.stage)) firedStages.add(item.stage);
    } catch (err) {
      console.error(
        `worker/relay: requeue enqueue failed for ${item.arrival_id}: ${(err as Error).message}`,
      );
    }
  }

  for (const stage of firedStages) {
    void fetch(`${origin}/api/worker/${stage}`, {
      method: 'POST',
      headers: { 'x-worker-key': workerKey },
    }).catch(() => {
      // A dropped eager fire is a delay, never a loss (§1.4).
    });
  }

  if (sweep.queue_age_alert) {
    console.warn('worker/relay: queue age over 4 hours (§13.1) — reading is delayed');
  }
  if (sweep.stuck.length > 0) {
    console.error(`worker/relay: DEFECT SIGNAL — arrivals stuck > 24 h: ${sweep.stuck.join(', ')}`);
  }

  return Response.json({
    outbox: { drained: drained.length, acked },
    requeued: sweep.requeue.length,
    sweeper: {
      expired_leases: sweep.expired_leases,
      terminalized: sweep.terminalized.length,
      stuck: sweep.stuck.length,
      queue_age_alert: sweep.queue_age_alert,
    },
  });
}

/** The Vercel cron path: the scheduler is checked in, not a comment. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('relay disabled', { status: 503 });
  if (!secretMatches(req.headers.get('authorization'), `Bearer ${secret}`)) {
    return new Response('forbidden', { status: 403 });
  }
  const workerKey = process.env.HC_WORKER_KEY ?? '';
  return relayPass(new URL(req.url).origin, workerKey);
}

/** The operational path: manual passes and non-Vercel schedulers. */
export async function POST(req: Request): Promise<Response> {
  const key = process.env.HC_WORKER_KEY;
  if (!key) return new Response('relay disabled', { status: 503 });
  if (!secretMatches(req.headers.get('x-worker-key'), key)) {
    return new Response('forbidden', { status: 403 });
  }
  return relayPass(new URL(req.url).origin, key);
}
