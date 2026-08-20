import { createHash, timingSafeEqual } from 'node:crypto';
import {
  advanceArrival,
  archivePipelineWork,
  claimStage,
  deferPipelineWork,
  finalizeScan,
  finalizeStore,
  lookupChannel,
  readPipelineWork,
  scanCacheLookup,
  senderRecognised,
  sendPipelineWork,
  type PipelineMessage,
  type QueuedWork,
} from '@/lib/hc/workers';
import {
  artifactKey,
  moveToQuarantine,
  readStagedObject,
  removeStagedObject,
  writeArtifactObject,
} from '@/lib/storage/artifacts';
import { scanBytes } from '@/lib/scan/scanner';
import { sniffMime } from '@/lib/pipeline/mime';

/**
 * POST /api/worker/[stage] — the pipeline workers (TSD §1.4, §4.3;
 * slice-4 plan B4; STO-01/SCN-01 app halves; the SND-01 gate). One
 * shared queue, each message dispatched by ITS stage; the [stage]
 * segment names the entry the eager caller believes is due (store ·
 * scan · gate). Auth is the security-actions posture: x-worker-key,
 * timing-safe, 503-when-unset — never open.
 *
 * Every stage is the §4.3 sequence EXACTLY: claim → COMMIT (the claim
 * statement is its own transaction) → external work → finalize. A
 * non-claimed outcome follows the §4.2 table: ack and move on —
 * redelivery, cancellation, freeze parking and supersession are the
 * machinery's to absorb, never the worker's to fight.
 *
 * Retry posture: work that FAILS (missing bytes, scanner outage) is
 * acked without finalizing — the open lease expires on its §4.3 wall
 * clock, the sweeper re-lists the arrival, and claim-exhaustion lands
 * the honest terminal state with its stated reason. The worker never
 * invents a verdict and never finalizes 'unavailable' early.
 *
 * The Q7 seam: extract/interpret messages are DEFERRED (pgmq.set_vt),
 * not consumed and not lost — slice 5's workers will read them.
 */

const BATCH = 10;
const STAGES = new Set(['store', 'scan', 'gate']);

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function fireWorker(origin: string, stage: string, key: string): void {
  void fetch(`${origin}/api/worker/${stage}`, {
    method: 'POST',
    headers: { 'x-worker-key': key },
  }).catch(() => {
    // A dropped eager fire is a delay, never a loss (§1.4).
  });
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function processStore(msg: PipelineMessage, origin: string, key: string): Promise<string> {
  const claim = await claimStage(msg.arrival_id, 'store');
  if (claim.result !== 'claimed') return claim.result;

  const bytes = await readStagedObject(msg.circle_id, msg.arrival_id);
  if (!bytes) {
    // Nothing to keep and nothing to invent: the lease expires, the
    // machinery retries, exhaustion says store_failed honestly.
    return 'store_bytes_missing';
  }

  const sha = sha256Hex(bytes);
  const mime = sniffMime(bytes);
  const storageKey = artifactKey(msg.circle_id, msg.arrival_id, sha);
  await writeArtifactObject(storageKey, bytes, mime);

  const r = await finalizeStore({
    arrivalId: msg.arrival_id,
    leaseId: claim.leaseId!,
    storageKey,
    sha256Hex: sha,
    mimeDetected: mime,
    byteSize: bytes.byteLength,
  });
  if (r === 'advanced') {
    // Staging stays until scan's definitive exit — scan needs the bytes.
    await sendPipelineWork({
      circle_id: msg.circle_id,
      arrival_id: msg.arrival_id,
      stage: 'scan',
      channel: msg.channel ?? null,
    });
    fireWorker(origin, 'scan', key);
  }
  // A lost transition leaves the content-addressed object in place:
  // write-once by construction, the winner writes the same bytes.
  return r;
}

async function processScan(msg: PipelineMessage, origin: string, key: string): Promise<string> {
  const claim = await claimStage(msg.arrival_id, 'scan');
  if (claim.result !== 'claimed') return claim.result;

  const bytes = await readStagedObject(msg.circle_id, msg.arrival_id);
  if (!bytes) return 'scan_bytes_missing';

  const sha = sha256Hex(bytes);
  const cached = await scanCacheLookup(sha);
  const outcome = cached ?? (await scanBytes(bytes));

  if (outcome.verdict === 'unavailable') {
    // An outage is retried by the machinery, never finalized early:
    // exhaustion lands scan_unavailable with its stated reason (§4.3).
    return 'scan_unavailable_retry';
  }

  const r = await finalizeScan(msg.arrival_id, claim.leaseId!, outcome.verdict, outcome.detail);
  if (r === 'advanced') {
    if (outcome.verdict === 'infected') {
      // Confirmed malware leaves the artifacts bucket entirely; the
      // quarantine bucket has no read grant for any role (§3.11).
      const contentKey = artifactKey(msg.circle_id, msg.arrival_id, sha);
      await moveToQuarantine(contentKey, contentKey, bytes);
      await removeStagedObject(msg.circle_id, msg.arrival_id);
    } else {
      await removeStagedObject(msg.circle_id, msg.arrival_id);
      if (outcome.verdict === 'clean') {
        // A clean duplicate landed duplicate_suspected instead of
        // scanned; the gate claim absorbs that message quietly.
        await sendPipelineWork({
          circle_id: msg.circle_id,
          arrival_id: msg.arrival_id,
          stage: 'gate',
          channel: msg.channel ?? null,
        });
        fireWorker(origin, 'gate', key);
      }
    }
  }
  return `${outcome.verdict}:${r}`;
}

async function processGate(msg: PipelineMessage): Promise<string> {
  const claim = await claimStage(msg.arrival_id, 'gate');
  if (claim.result !== 'claimed') {
    if (claim.result === 'invalid_state') {
      // Speculative gate messages (a clean-duplicate enqueue, a stale
      // sweep) land here; absorbed with a note, not a defect page.
      console.warn(
        `worker/gate: arrival ${msg.arrival_id} is not at the gate entry — message absorbed`,
      );
    }
    return claim.result;
  }

  // The gate is a MAIL guard (§5.3): uploads pass without a sender
  // probe. A message with no channel lineage FAILS CLOSED to the
  // sender question (AC-INBOX-7 outranks upload convenience).
  const channel = msg.channel ?? (await lookupChannel(msg.arrival_id));
  let to: 'extracting' | 'held_unknown_sender';
  let reason: string | null;
  if (channel === 'upload') {
    to = 'extracting';
    reason = null;
  } else if (await senderRecognised(msg.arrival_id)) {
    to = 'extracting';
    reason = 'sender_recognised';
  } else {
    to = 'held_unknown_sender';
    reason = 'sender_unknown';
  }

  const r = await advanceArrival(msg.arrival_id, 'scanned', to, claim.leaseId!, reason);
  if (r === 'advanced' && to === 'extracting') {
    // The Q7 seam: enqueued for slice 5's extract worker; no fire —
    // nothing consumes it yet, and the arrival RESTS at its honest label.
    await sendPipelineWork({
      circle_id: msg.circle_id,
      arrival_id: msg.arrival_id,
      stage: 'extract',
      channel,
    });
  }
  return `${to}:${r}`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ stage: string }> },
): Promise<Response> {
  const key = process.env.HC_WORKER_KEY;
  if (!key) return new Response('worker disabled', { status: 503 });
  if (!secretMatches(req.headers.get('x-worker-key'), key)) {
    return new Response('forbidden', { status: 403 });
  }

  const { stage } = await ctx.params;
  if (!STAGES.has(stage)) return new Response('unknown stage', { status: 404 });

  const origin = new URL(req.url).origin;
  const batch: QueuedWork[] = await readPipelineWork(BATCH);
  const processed: Array<{ arrival_id: string; stage: string; outcome: string }> = [];

  for (const work of batch) {
    const msg = work.message;
    try {
      if (!STAGES.has(msg.stage)) {
        // Slice 5's work: deferred, never consumed, never lost (Q7).
        await deferPipelineWork(work.msg_id);
        processed.push({ arrival_id: msg.arrival_id, stage: msg.stage, outcome: 'deferred' });
        continue;
      }
      let outcome: string;
      if (msg.stage === 'store') outcome = await processStore(msg, origin, key);
      else if (msg.stage === 'scan') outcome = await processScan(msg, origin, key);
      else outcome = await processGate(msg);
      await archivePipelineWork(work.msg_id);
      processed.push({ arrival_id: msg.arrival_id, stage: msg.stage, outcome });
    } catch (err) {
      // Not acked: the visibility timeout redelivers this one; the rest
      // of the batch is never blocked.
      console.error(`worker/${msg.stage}: ${(err as Error).message}`);
      processed.push({ arrival_id: msg.arrival_id, stage: msg.stage, outcome: 'error' });
    }
  }

  return Response.json({ stage, processed });
}
