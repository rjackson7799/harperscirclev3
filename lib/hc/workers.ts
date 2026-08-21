import 'server-only';
import { asPipeline } from '@/lib/db';

/**
 * The stage-worker wrappers (TSD §4.2–§4.3 as amended by A5/A6; slice-4
 * plan B4). Everything here is hc_pipeline authority — the enumerated
 * definers plus the pgmq data plane M2 granted. The claim runs as its
 * own statement, so it COMMITS before any external work begins (§4.3's
 * whole mechanism: a crash after the commit has already burned the
 * attempt).
 */

export type AdvanceResult =
  | 'advanced'
  | 'already_advanced'
  | 'cancelled'
  | 'frozen'
  | 'invalid_state'
  | 'stale_lease'
  | 'claimed'
  | 'exhausted';

export type StageClaim = {
  result: AdvanceResult;
  leaseId: string | null;
  attemptNo: number | null;
  deadline: string | null;
};

export type PipelineStage = 'store' | 'scan' | 'gate' | 'extract' | 'interpret';

export type PipelineMessage = {
  /** Null on relay/sweeper-originated messages whose lineage is gone;
   *  store/scan then fail closed to their bytes-missing outcome. */
  circle_id: string | null;
  arrival_id: string;
  stage: PipelineStage;
  channel: 'email' | 'upload' | null;
};

export type QueuedWork = { msg_id: number; message: PipelineMessage };

/** hc.claim_stage — the only way into a stage; commits standalone. */
export async function claimStage(arrivalId: string, stage: string): Promise<StageClaim> {
  const r = await asPipeline().query('select * from hc.claim_stage($1, $2)', [arrivalId, stage]);
  const row = r.rows[0];
  return {
    result: row.result as AdvanceResult,
    leaseId: (row.lease_id as string | null) ?? null,
    attemptNo: (row.attempt_no as number | null) ?? null,
    deadline: row.deadline ? String(row.deadline) : null,
  };
}

export type FinalizeStoreInput = {
  arrivalId: string;
  leaseId: string;
  storageKey: string;
  sha256Hex: string;
  mimeDetected: string;
  byteSize: number;
};

/** hc.finalize_store — the artifact facts commit WITH the won transition. */
export async function finalizeStore(input: FinalizeStoreInput): Promise<AdvanceResult> {
  const r = await asPipeline().query(
    `select hc.finalize_store($1, $2, $3, decode($4, 'hex'), $5, $6) as r`,
    [
      input.arrivalId,
      input.leaseId,
      input.storageKey,
      input.sha256Hex,
      input.mimeDetected,
      input.byteSize,
    ],
  );
  return r.rows[0].r as AdvanceResult;
}

/** hc.finalize_scan — the four exits from the adapter's states. */
export async function finalizeScan(
  arrivalId: string,
  leaseId: string,
  verdict: 'clean' | 'infected' | 'unavailable' | 'inconclusive',
  detail: Record<string, unknown>,
): Promise<AdvanceResult> {
  const r = await asPipeline().query('select hc.finalize_scan($1, $2, $3, $4) as r', [
    arrivalId,
    leaseId,
    verdict,
    JSON.stringify(detail ?? {}),
  ]);
  return r.rows[0].r as AdvanceResult;
}

export type CachedScan = {
  verdict: 'clean' | 'infected';
  detail: Record<string, unknown>;
  scanned_at: string;
};

/** hc.scan_cache_lookup — live rows only; an expired clean row is a miss. */
export async function scanCacheLookup(sha256Hex: string): Promise<CachedScan | null> {
  const r = await asPipeline().query(`select hc.scan_cache_lookup(decode($1, 'hex')) as r`, [
    sha256Hex,
  ]);
  return (r.rows[0]?.r as CachedScan | null) ?? null;
}

/** hc.sender_recognised — the gate's question (SND-01). */
export async function senderRecognised(arrivalId: string): Promise<boolean> {
  const r = await asPipeline().query('select hc.sender_recognised($1) as r', [arrivalId]);
  return r.rows[0].r as boolean;
}

/** hc.advance_arrival — the CAS, for the gate's two exits. */
export async function advanceArrival(
  arrivalId: string,
  from: string,
  to: string,
  leaseId: string,
  reason: string | null,
): Promise<AdvanceResult> {
  const r = await asPipeline().query('select hc.advance_arrival($1, $2, $3, $4, $5) as r', [
    arrivalId,
    from,
    to,
    leaseId,
    reason,
  ]);
  return r.rows[0].r as AdvanceResult;
}

const QUEUE = 'pipeline_work';
const READ_VT_SECONDS = 120;

/** pgmq.read — claim up to qty work items for one visibility window. */
export async function readPipelineWork(qty: number): Promise<QueuedWork[]> {
  const r = await asPipeline().query(`select msg_id, message from pgmq.read($1, $2, $3)`, [
    QUEUE,
    READ_VT_SECONDS,
    qty,
  ]);
  return r.rows.map((row) => ({
    msg_id: Number(row.msg_id),
    message: row.message as PipelineMessage,
  }));
}

/** Ack = ARCHIVE, deliberately: the archive is the message lineage the
 *  gate's channel lookup reads (a_pipeline_work SELECT is granted for
 *  exactly this). */
export async function archivePipelineWork(msgId: number): Promise<void> {
  await asPipeline().query(`select pgmq.archive($1, $2::bigint)`, [QUEUE, msgId]);
}

/** Push a message out of the visible window without consuming it —
 *  the Q7 seam: extract/interpret work waits for slice 5's workers. */
export async function deferPipelineWork(msgId: number, seconds = 3600): Promise<void> {
  await asPipeline().query(`select pgmq.set_vt($1, $2::bigint, $3)`, [QUEUE, msgId, seconds]);
}

/** Enqueue one work item. */
export async function sendPipelineWork(message: PipelineMessage): Promise<void> {
  await asPipeline().query(`select pgmq.send($1, $2::jsonb)`, [QUEUE, JSON.stringify(message)]);
}

/**
 * The message lineage for a bare (relay/sweeper-originated) message: the
 * oldest queued or archived message for this arrival that carried the
 * intake facts. Unknown ⇒ null — the gate FAILS CLOSED to the sender
 * question, and store/scan report bytes-missing honestly.
 */
export async function lookupLineage(
  arrivalId: string,
): Promise<{ circle_id: string | null; channel: 'email' | 'upload' | null } | null> {
  const r = await asPipeline().query(
    `select channel, circle_id from (
       select (message ->> 'channel') as channel,
              (message ->> 'circle_id') as circle_id, msg_id
         from pgmq.q_pipeline_work
        where (message ->> 'arrival_id') = $1 and (message ->> 'channel') is not null
       union all
       select (message ->> 'channel') as channel,
              (message ->> 'circle_id') as circle_id, msg_id
         from pgmq.a_pipeline_work
        where (message ->> 'arrival_id') = $1 and (message ->> 'channel') is not null
     ) x order by x.msg_id limit 1`,
    [arrivalId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const c = row.channel as string | null;
  return {
    circle_id: (row.circle_id as string | null) ?? null,
    channel: c === 'email' || c === 'upload' ? c : null,
  };
}

/** The channel half of the lineage (the gate's question). */
export async function lookupChannel(arrivalId: string): Promise<'email' | 'upload' | null> {
  return (await lookupLineage(arrivalId))?.channel ?? null;
}

export type OutboxRow = {
  outboxId: string;
  arrivalId: string;
  stage: PipelineStage | null;
};

/** hc.outbox_drain — CLAIM, not consume (OBX-01): unacked rows past the
 *  300 s window re-deliver; stage derives from the arrival's LIVE state
 *  (null ⇒ the arrival moved on — stale, ack without work). */
export async function outboxDrain(limit: number): Promise<OutboxRow[]> {
  const r = await asPipeline().query('select * from hc.outbox_drain($1)', [limit]);
  return r.rows.map((row) => ({
    outboxId: row.outbox_id as string,
    arrivalId: row.arrival_id as string,
    stage: (row.stage as PipelineStage | null) ?? null,
  }));
}

/** hc.outbox_ack — closes delivery; binds to a claim; idempotent. */
export async function outboxAck(outboxIds: string[]): Promise<number> {
  if (outboxIds.length === 0) return 0;
  const r = await asPipeline().query('select hc.outbox_ack($1::uuid[]) as n', [outboxIds]);
  return Number(r.rows[0].n);
}

export type SweeperReport = {
  expired_leases: number;
  terminalized: Array<{ arrival_id: string; state: string }>;
  requeue: Array<{ arrival_id: string; stage: PipelineStage }>;
  stuck: string[];
  queue_age_alert: boolean;
};

/** hc.sweeper_pass — §4.11's four duties; steps 3–5 are ADVISORY
 *  listings revalidated by claim_stage at claim time. */
export async function sweeperPass(): Promise<SweeperReport> {
  const r = await asPipeline().query('select hc.sweeper_pass() as r');
  return r.rows[0].r as SweeperReport;
}

/** hc.run_taint_sweep — nightly (OPS-01/D6); recorded in hc.sweep_runs. */
export async function runTaintSweep(): Promise<number> {
  const r = await asPipeline().query('select hc.run_taint_sweep() as n');
  return Number(r.rows[0].n);
}

/** hc.expire_scan_results — the §11.5 clean-cache expiry; infected
 *  evidence rows (expires_at null) are never touched. */
export async function expireScanResults(): Promise<{ removed: number }> {
  const r = await asPipeline().query('select hc.expire_scan_results() as r');
  return r.rows[0].r as { removed: number };
}

/** hc.expire_held_mail — §5.4's 30-day expiry of unaccepted stranger mail. */
export async function expireHeldMail(): Promise<{ expired_count: number }> {
  const r = await asPipeline().query('select hc.expire_held_mail() as r');
  return r.rows[0].r as { expired_count: number };
}
