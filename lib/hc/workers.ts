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

/**
 * A fact carried from the extract attempt to the interpret attempt (5B B4).
 *
 * hc_pipeline holds NO select on `extractions` (§3.10 — deliberately), so the
 * interpret worker has no read path to what the extract attempt published.
 * The direct hand-off carries them, which makes the conflict comparison
 * sharper AND cheaper: interpretation does not have to re-send page images.
 *
 * Their ABSENCE is not a different quality of answer. A re-queued interpret
 * (a resolved stage-2 duplicate, a sweeper rescue) carries no facts, and the
 * worker re-normalises the artifact and sends the document itself — the same
 * source material extraction saw. (The definer that 5B offered shipped at
 * 6A M2 as `hc.extractions_for` — gated for MEMBERS at the arrival's
 * view×5, not for hc_pipeline, so the hand-off here stays the pipeline's
 * only channel, §3.10 unchanged.)
 */
export type CarriedFact = {
  field: string;
  value: string;
  confidence: number;
  citation: { page: number; bbox: [number, number, number, number] };
};

export type PipelineMessage = {
  /** Null on relay/sweeper-originated messages whose lineage is gone;
   *  store/scan then fail closed to their bytes-missing outcome. */
  circle_id: string | null;
  arrival_id: string;
  stage: PipelineStage;
  channel: 'email' | 'upload' | null;
  /** Present only on the direct extract → interpret hand-off (above). */
  facts?: CarriedFact[];
};

export type QueuedWork = { msg_id: number; message: PipelineMessage };

/**
 * hc.claim_stage — the only way into a stage; commits standalone.
 *
 * M3: `extract` REQUIRES the run identity, because the run row is born in the
 * claim transaction — no lease exists without its run, so a timeout, kill,
 * render failure or provider error can never consume a lease unrecorded.
 * Every other stage REFUSES the pair: no stage borrows an identity it does
 * not record.
 */
export async function claimStage(
  arrivalId: string,
  stage: string,
  modelId: string | null = null,
  promptVersion: string | null = null,
): Promise<StageClaim> {
  const r = await asPipeline().query('select * from hc.claim_stage($1, $2, $3, $4)', [
    arrivalId,
    stage,
    modelId,
    promptVersion,
  ]);
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

/** 6A M4's manifest shape, supplied by the worker at 6B B2: the rendered
 *  page count and the per-page extension, derived from the SAME pages the
 *  staging writes and the promotion copies — never from a default. */
export type RenditionManifest = { page_count: number; page_exts: string[] };

/**
 * hc.finalize_extraction — §4.5's one transaction: the conditional transition
 * runs FIRST and gates everything below it, so a lost CAS publishes nothing.
 * M5's stage-2 detection runs inside it, which is why 'advanced' can mean
 * either `extracted` or `duplicate_suspected_stage2`. 6A M4 added the fifth
 * parameter (the rendition manifest, written on the won transition); 6B B2
 * supplies it — the seam 062 case 10 pinned, closed from the app side.
 */
export async function finalizeExtraction(
  arrivalId: string,
  leaseId: string,
  facts: unknown[],
  proposals: unknown[],
  rendition: RenditionManifest | null = null,
): Promise<AdvanceResult> {
  const r = await asPipeline().query(
    'select hc.finalize_extraction($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) as r',
    [
      arrivalId,
      leaseId,
      JSON.stringify(facts),
      JSON.stringify(proposals),
      rendition === null ? null : JSON.stringify(rendition),
    ],
  );
  return r.rows[0].r as AdvanceResult;
}

/** hc.finalize_interpretation — the same gate, one stage later. */
export async function finalizeInterpretation(
  arrivalId: string,
  leaseId: string,
  proposals: unknown[],
): Promise<AdvanceResult> {
  const r = await asPipeline().query(
    'select hc.finalize_interpretation($1, $2, $3::jsonb) as r',
    [arrivalId, leaseId, JSON.stringify(proposals)],
  );
  return r.rows[0].r as AdvanceResult;
}

/**
 * hc.record_context_for — §3.10's one narrow window onto the record. It
 * returns ONLY the arrival's own subject's record in the arrival's own
 * circle; cross-subject and cross-circle reads are not expressible in the
 * signature, which is why interpretation's boundary is structural rather
 * than prompted.
 */
export async function recordContextFor(arrivalId: string): Promise<unknown> {
  const r = await asPipeline().query('select hc.record_context_for($1) as r', [arrivalId]);
  return r.rows[0].r as unknown;
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

/**
 * Ack = ARCHIVE, deliberately: the archive is the message lineage the gate's
 * channel lookup reads (a_pipeline_work SELECT is granted for exactly this).
 *
 * The values are STRIPPED first (round-16 R4/F-5). The extract → interpret
 * hand-off carries `facts` — {field, value, …} over the §6.4 high-risk
 * classes, `ssn` and `date_of_birth` among them — and nothing prunes
 * `a_pipeline_work`. Without this, an arrival that filed NOTHING could be
 * soft-deleted and purged at 30 days exactly as PRD §4.2 promises, while a
 * verbatim copy of the same values sat in the queue archive forever, outside
 * the §2.9 deletion ledger and outside any tombstone replay.
 *
 * `lookupLineage` reads only `channel` and `circle_id`, so the facts are dead
 * weight the moment the message is acked. Dropping them at the ack keeps the
 * lineage the gate needs and retains nothing the deletion path cannot reach.
 * One statement, in the same call, so no ack path can forget it.
 */
export async function archivePipelineWork(msgId: number): Promise<void> {
  const q = asPipeline();
  await q.query(`update pgmq.q_pipeline_work set message = message - 'facts' where msg_id = $1`, [
    msgId,
  ]);
  await q.query(`select pgmq.archive($1, $2::bigint)`, [QUEUE, msgId]);
}

/** Push a message out of the visible window without consuming it. 5B: the
 *  Q7 seam is closed, so the only caller left is the unknown-stage branch —
 *  a message this build does not recognise is still never lost. */
export async function deferPipelineWork(msgId: number, seconds = 3600): Promise<void> {
  await asPipeline().query(`select pgmq.set_vt($1, $2::bigint, $3)`, [QUEUE, msgId, seconds]);
}

/**
 * 5B B7: release work that D13 deferred, instead of waiting out its vt.
 *
 * The seam pushed extract/interpret messages an hour into the future while
 * nothing consumed them. Those workers exist now, so a message still sitting
 * in the future is a delay with no reason left behind it. This pulls the
 * visibility timeout back to zero for any INVISIBLE message whose stage this
 * build actually handles — bounded per pass, and idempotent once the backlog
 * is empty (the steady state selects nothing).
 *
 * Deliberately narrow on two axes.
 *
 * Only stages this build dispatches — a message it does not understand is
 * still never resurrected.
 *
 * And only messages hidden FAR into the future. pgmq gives an in-flight read
 * and a deliberate deferral exactly the same shape: a `vt` in the future. The
 * two are separated by HOW far — a read hides for READ_VT_SECONDS (120 s),
 * D13 deferred for an hour — so the threshold sits well above the read window
 * and comfortably below the deferral. Without it, a release could hand a
 * message another worker is holding to a second reader.
 *
 * Even then nothing could go wrong twice: claim-before-work means a second
 * reader's hc.claim_stage answers `stale_lease` before any external call. The
 * threshold buys the wasted claim, not the correctness.
 */
const DEFERRAL_THRESHOLD_SECONDS = READ_VT_SECONDS + 180;

export async function releaseDeferredWork(limit = 200): Promise<number> {
  const r = await asPipeline().query(
    `with deferred as (
       select msg_id from pgmq.q_pipeline_work
        where vt > now() + make_interval(secs => $4)
          and (message ->> 'stage') = any ($1::text[])
        order by msg_id
        limit $2
     )
     select count(*)::int as n
       from deferred, lateral pgmq.set_vt($3, deferred.msg_id, 0)`,
    [['extract', 'interpret'], limit, QUEUE, DEFERRAL_THRESHOLD_SECONDS],
  );
  return Number(r.rows[0]?.n ?? 0);
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
