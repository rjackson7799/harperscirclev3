import { createHash, timingSafeEqual } from 'node:crypto';
import {
  advanceArrival,
  archivePipelineWork,
  claimStage,
  deferPipelineWork,
  finalizeExtraction,
  finalizeInterpretation,
  recordContextFor,
  finalizeScan,
  finalizeStore,
  lookupChannel,
  lookupLineage,
  readPipelineWork,
  scanCacheLookup,
  senderRecognised,
  sendPipelineWork,
  type CarriedFact,
  type PipelineMessage,
  type QueuedWork,
} from '@/lib/hc/workers';
import {
  artifactKey,
  gcRenderStaging,
  moveToQuarantine,
  promoteRenderedPages,
  readArtifactBytes,
  readStagedObject,
  removeStagedObject,
  writeArtifactObject,
  writeRenderStaging,
} from '@/lib/storage/artifacts';
import { scanBytes } from '@/lib/scan/scanner';
import { sniffMime } from '@/lib/pipeline/mime';
import { normalizeArrival, type NormalizeResult } from '@/lib/pipeline/render';
import { extFor, renderStagingKey } from '@/lib/pipeline/page-keys';
import { extractFromArrival } from '@/lib/ai/extract';
import { interpretArrival, type DraftProposal } from '@/lib/ai/interpret';
import {
  EXTRACT_MODEL,
  INTERPRET_MODEL,
  PROMPT_VERSION,
  configurationHash,
} from '@/lib/ai/config';
import { effectiveRiskClass, loadBands, type BandMode } from '@/lib/extraction/bands';

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
 * 5B: the Q7 seam CLOSES. `extract` joins the dispatch table; the defer
 * branch goes with B7.
 */

/**
 * §1.9's platform check, discharged as code. The recorded platform default is
 * 300 s — exactly §4.3's extract wall clock, i.e. ZERO headroom for claim,
 * render and finalize around the provider call. This route therefore declares
 * its own ceiling ABOVE the stage clock; the hosted ceiling is verified as a
 * deploy-checklist row on docs/ops/ai-provider.md, because no code half can
 * pin a platform limit.
 *
 * Correctness never depends on either number: a hard kill is an expired
 * lease, the attempt is already burned durably (claim-before-work), and the
 * sweeper re-queues or terminalizes on budget. The ceiling risks a wasted
 * attempt, never a wrong state.
 */
export const maxDuration = 360;

/**
 * One route invocation's own budget, inside maxDuration. A batch of ten
 * 5-minute extract stages would otherwise outlive any platform ceiling, so
 * the loop stops taking NEW work when the budget is spent and leaves the rest
 * unacked — they redeliver on the visibility timeout and the next relay tick
 * picks them up. Shedding work is §4.11's posture; shedding ACCEPTANCE is not.
 */
const ROUTE_BUDGET_MS = 300_000;
const PER_MESSAGE_RESERVE_MS = 20_000;

const BATCH = 10;
const STAGES = new Set(['store', 'scan', 'gate', 'extract', 'interpret']);

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

async function resolveCircle(msg: PipelineMessage): Promise<string | null> {
  if (msg.circle_id) return msg.circle_id;
  return (await lookupLineage(msg.arrival_id))?.circle_id ?? null;
}

async function processStore(msg: PipelineMessage, origin: string, key: string): Promise<string> {
  const claim = await claimStage(msg.arrival_id, 'store');
  if (claim.result !== 'claimed') return claim.result;

  const circleId = await resolveCircle(msg);
  const bytes = circleId ? await readStagedObject(circleId, msg.arrival_id) : null;
  if (!circleId || !bytes) {
    // Nothing to keep and nothing to invent: the lease expires, the
    // machinery retries, exhaustion says store_failed honestly.
    return 'store_bytes_missing';
  }

  const sha = sha256Hex(bytes);
  const mime = sniffMime(bytes);
  const storageKey = artifactKey(circleId, msg.arrival_id, sha);
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
      circle_id: circleId,
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

  const circleId = await resolveCircle(msg);
  const bytes = circleId ? await readStagedObject(circleId, msg.arrival_id) : null;
  if (!circleId || !bytes) return 'scan_bytes_missing';

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
      const contentKey = artifactKey(circleId, msg.arrival_id, sha);
      await moveToQuarantine(contentKey, contentKey, bytes);
      await removeStagedObject(circleId, msg.arrival_id);
    } else {
      await removeStagedObject(circleId, msg.arrival_id);
      if (outcome.verdict === 'clean') {
        // A clean duplicate landed duplicate_suspected instead of
        // scanned; the gate claim absorbs that message quietly.
        await sendPipelineWork({
          circle_id: circleId,
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

/**
 * The §4.3 normalize exits, mapped to the states and reasons 5A shipped.
 *
 * ONE gap is recorded rather than papered over: a RENDER BOUNDS refusal (page
 * count, page dimensions, wall clock, output size) has no reason code of its
 * own. `archive_bounds_exceeded` is the closest that exists — "Archive
 * depth/entries/expansion over PRD §13.3 bounds" — and a 250-page PDF IS a
 * §13.3 bound, but that code's description says "Archive" and this is not
 * one. The family-facing label is right either way (`extract_failed` reads
 * "Couldn\u2019t read it", which is the honest thing to say); the alternative,
 * `unsupported_type`, reads "Unsupported file" and would tell them something
 * false about their document. The migration bound is spent, so a
 * `render_bounds_exceeded` code is OFFERED to the owner for the next
 * DB-opening slice rather than taken as a session decision.
 */
function normalizeExit(result: NormalizeResult): { state: string; reason: string } | null {
  if (result.outcome === 'needs_password') {
    return { state: 'needs_password', reason: 'encrypted_pdf' };
  }
  if (result.outcome === 'unsupported_type') {
    return { state: 'unsupported_type', reason: 'unsupported_mime' };
  }
  if (result.outcome === 'refused') {
    return { state: 'extract_failed', reason: 'archive_bounds_exceeded' };
  }
  return null;
}

async function processExtract(
  msg: PipelineMessage,
  origin: string,
  key: string,
): Promise<string> {
  // M3: the run identity is REQUIRED at the claim, so the run row is born
  // with its lease. A crash after this commit has burned the attempt AND
  // recorded it — there is no lease without its run.
  const claim = await claimStage(msg.arrival_id, 'extract', EXTRACT_MODEL, PROMPT_VERSION);
  if (claim.result !== 'claimed') return claim.result;

  const circleId = await resolveCircle(msg);
  const bytes = circleId ? await readArtifactBytes(circleId, msg.arrival_id) : null;
  if (!circleId || !bytes) {
    // Nothing to read and nothing to invent: the lease expires, the machinery
    // retries, exhaustion says extract_failed honestly.
    return 'extract_bytes_missing';
  }
  const lease = claim.leaseId!;

  // §4.6: content, never declaration. The store stage recorded a sniffed
  // type; sniffing again here needs no read privilege and cannot be stale.
  const normalized = normalizeArrival(bytes, sniffMime(bytes));
  const exit = normalizeExit(normalized);
  if (exit) {
    // Refused BEFORE any provider dispatch — the whole point of §6.3's bounds
    // being decided on the header rather than after rendering.
    const r = await advanceArrival(msg.arrival_id, 'extracting', exit.state, lease, exit.reason);
    await gcRenderStaging(circleId, msg.arrival_id, lease);
    return exit.state + ':' + r;
  }
  if (normalized.outcome !== 'rendered') return 'extract_normalize_unknown';

  // The attempt's pages live under a lease-scoped staging prefix: unreachable
  // from any user path, and unmistakably THIS attempt's work.
  for (const page of normalized.pages) {
    await writeRenderStaging(
      renderStagingKey(circleId, msg.arrival_id, lease, page.page, extFor(page.mime)),
      page.bytes,
      page.mime,
    );
  }

  const answer = await extractFromArrival({
    pages: normalized.pages,
    text: normalized.text,
    sourceClass: normalized.sourceClass,
    operatorNotes: [],
    deadlineIso: claim.deadline,
  });

  if (answer.outcome !== 'ok') {
    await gcRenderStaging(circleId, msg.arrival_id, lease);
    if (answer.outcome === 'unavailable') {
      // §6.8 / §4.3: an outage is retried BY THE MACHINERY, never finalized
      // early. The lease expires, the sweeper re-lists, and exhaustion lands
      // the terminal state with extract_budget_exhausted.
      return 'extract_unavailable_retry';
    }
    const reason = answer.outcome === 'refusal' ? 'provider_refusal' : 'provider_error';
    const r = await advanceArrival(msg.arrival_id, 'extracting', 'extract_failed', lease, reason);
    return answer.outcome + ':' + r;
  }

  // §6.5: risk_class is the WORKER's, by field, before the model was called —
  // and with no signed band artifact it is `high` for every field, which is
  // the shipping default rather than a degraded state.
  const bands = loadBands({
    running: {
      modelId: EXTRACT_MODEL,
      promptVersion: PROMPT_VERSION,
      configurationHash: configurationHash(),
    },
  });
  const facts = answer.data.facts.map((fact) => ({
    field: fact.field,
    value: fact.value,
    confidence: fact.confidence,
    risk_class: effectiveRiskClass(fact.field, fact.value, bands),
    citation: fact.citation,
    model_id: answer.modelId,
    prompt_version: answer.promptVersion,
  }));

  // The filing proposal rides the SAME transaction as the facts (§4.5): the
  // transition gates both, so a lost CAS leaves neither behind.
  const proposals = [
    {
      kind: 'document',
      payload: {
        category: answer.data.document.category,
        title: answer.data.document.title,
        summary_text: answer.data.document.summary,
      },
    },
  ];

  const r = await finalizeExtraction(msg.arrival_id, lease, facts, proposals);
  if (r !== 'advanced') {
    await gcRenderStaging(circleId, msg.arrival_id, lease);
    return r;
  }

  // Won: the attempt's pages become the arrival's pages (write-once), and the
  // hand-off carries the facts this attempt published.
  await promoteRenderedPages(circleId, msg.arrival_id, lease);
  const carried: CarriedFact[] = answer.data.facts.map((f) => ({
    field: f.field,
    value: f.value,
    confidence: f.confidence,
    citation: f.citation,
  }));
  // finalize_extraction may have exited to duplicate_suspected_stage2 instead
  // (M5 detects inside the transaction) and returns 'advanced' either way. The
  // interpret claim absorbs a speculative message quietly — the same
  // absorption the clean-duplicate gate enqueue already relies on.
  await sendPipelineWork({
    circle_id: circleId,
    arrival_id: msg.arrival_id,
    stage: 'interpret',
    channel: msg.channel ?? null,
    facts: carried,
  });
  fireWorker(origin, 'interpret', key);
  return r + ':' + facts.length + 'f' + (answer.dropped ? '/' + answer.dropped + 'dropped' : '');
}

/**
 * One current profile_fact per field, as the record context reported it.
 * Read defensively: a malformed payload must narrow what the worker will
 * treat as "already on the record", never widen it.
 */
type CurrentFact = { id: string; value: string; risk: string };

function currentFacts(context: unknown): Map<string, CurrentFact> {
  const byField = new Map<string, CurrentFact>();
  const rows = (context as { profile_facts?: { rows?: unknown } } | null)?.profile_facts?.rows;
  if (!Array.isArray(rows)) return byField;
  for (const row of rows) {
    const r = row as { id?: unknown; field?: unknown; value?: unknown; risk_class?: unknown };
    if (typeof r.id !== 'string' || typeof r.field !== 'string') continue;
    byField.set(r.field, {
      id: r.id,
      value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? null),
      risk: typeof r.risk_class === 'string' ? r.risk_class : 'high',
    });
  }
  return byField;
}

/**
 * §4.8, at the worker layer: **a change to an existing value is ALWAYS a
 * conflict, never a quiet update.**
 *
 * The prompt says so too, but a prompt is not a guarantee. Here it is
 * mechanical: a `profile_fact` proposal for a field the record already
 * carries with a DIFFERENT value is converted into a conflict quoting that
 * fact — which is also what hc.draft_proposal needs, since a conflict with
 * no parents is refused and its taint is the union of theirs. A field the
 * record does not carry stays a profile_fact. An UNCHANGED value proposes
 * nothing: a restatement is not a proposal, and putting one in front of a
 * person costs them attention they will need for the real ones.
 *
 * Kinds beyond document/task/profile_fact/conflict are dropped: the DB has
 * timeline_event and episode, but neither has a payload this slice can map
 * (a timeline_event needs a `kind` for its own-domain, which nothing here
 * produces). Recorded as slice-6 scope rather than half-mapped.
 */
const MAPPABLE_KINDS = new Set(['document', 'task', 'profile_fact', 'conflict']);

function draftPayloads(
  proposals: DraftProposal[],
  context: unknown,
  callAnomalies: string[],
  bands: BandMode,
): Array<{ kind: string; payload: Record<string, unknown> }> {
  const current = currentFacts(context);
  const drafted: Array<{ kind: string; payload: Record<string, unknown> }> = [];

  for (const p of proposals) {
    let kind: string = p.kind;
    let parentId: string | null = null;

    if (kind === 'profile_fact' && p.field) {
      const existing = current.get(p.field);
      if (existing) {
        if (existing.value === (p.value ?? '')) continue; // a restatement
        kind = 'conflict';
        parentId = existing.id;
      }
    } else if (kind === 'conflict') {
      // The adapter already refused a conflict naming an id the call was not
      // given; this re-derives the parent from the record rather than
      // trusting the value through a second hop.
      const byId = [...current.values()].find((c) => c.id === p.conflictsWithFactId);
      if (!byId) continue;
      parentId = byId.id;
    }

    if (!MAPPABLE_KINDS.has(kind)) continue;
    // A conflict needs a domain for the same reason a profile_fact does:
    // `use_new` inserts one into public.profile_facts (round-16 R4/F-3).
    if ((kind === 'profile_fact' || kind === 'conflict') && !p.domain) continue;
    if (kind === 'document' && !p.category) continue;

    const anomalyFlags = [...new Set([...callAnomalies, ...p.anomalyFlags])];
    const payload: Record<string, unknown> = {
      title: p.title,
      summary_text: p.summary,
      anomaly_flags: anomalyFlags,
    };
    if (p.field) payload.field = p.field;
    if (p.value !== null) payload.value = p.value;
    if (p.dueOn) payload.due_on = p.dueOn;
    if (p.occurredOn) payload.occurred_on = p.occurredOn;
    if (kind === 'conflict') {
      // §4.8's three outcomes each need something at APPROVAL time, and
      // hc.approve_proposal refuses without it (round-16 R4/F-3):
      //   use_new   → field, value, domain — and it INSERTS risk_class,
      //               which profile_facts declares NOT NULL;
      //   keep_both → a task object carrying a title;
      //   keep      → nothing, which is why only that one ever worked.
      // The conversion below skipped the profile_fact branch, so a drafted
      // conflict carried none of them and two of the three outcomes raised
      // `approval_refused` in front of a person.
      //
      // `domain` must come from the proposal: M2's record context carries
      // {id, field, value, risk_class} per fact and NOT the domain, so the
      // parent cannot supply it. A conflict without one is DROPPED at the
      // guard below rather than drafted un-approvable — the same posture
      // the adapter already takes ("a counted drop rather than a raised
      // exception").
      payload.domain = p.domain;
      payload.risk_class = effectiveRiskClass(p.field ?? '', p.value, bands);
      // keep_both files a task to reconcile the two readings rather than
      // choosing between them. Title only: due_on and due_zone must be BOTH
      // set or BOTH absent (the DB pairs them), and nothing here knows a due
      // date, so neither is written.
      payload.task = { title: `Reconcile ${p.field ?? 'this value'} — the document and the record disagree` };
    }
    if (kind === 'profile_fact') {
      payload.domain = p.domain;
      // §6.4: a high-risk field is high-risk however confident anyone is —
      // AND §6.5's all-high mode applies here exactly as it does on the
      // extract arm (round-16 R1/F-1). This arm used to call the catalogue
      // directly, so a standard-catalogue field could be drafted `standard`
      // while the product was running all-high, and `hc.approve_proposal`
      // gates the §6.4 confirmation on precisely this string.
      payload.risk_class = effectiveRiskClass(p.field ?? '', p.value, bands);
    }
    if (kind === 'document') payload.category = p.category;
    if (kind === 'conflict' && parentId) {
      payload.parents = [{ type: 'profile_fact', id: parentId }];
    }
    drafted.push({ kind, payload });
  }
  return drafted;
}

async function processInterpret(msg: PipelineMessage): Promise<string> {
  // ING-07: the in-flight transition (extracted → interpreting) happens AT
  // the claim, so one lease spans the stage. M3 REFUSES the run identity off
  // the extract stage — no stage borrows an identity it does not record.
  const claim = await claimStage(msg.arrival_id, 'interpret');
  if (claim.result !== 'claimed') return claim.result;
  const lease = claim.leaseId!;

  // §3.10's one narrow window. The signature cannot express another subject
  // or another circle, which is why interpretation's boundary is structural
  // rather than prompted.
  const context = await recordContextFor(msg.arrival_id);

  const carried = msg.facts ?? [];
  const operatorNotes: string[] = [];
  let documentText: string | null = null;

  if (carried.length === 0) {
    // A re-queued work item (a resolved stage-2 duplicate, a sweeper rescue)
    // carries no facts, because hc_pipeline has no read path to what the
    // extract attempt published. The document itself is always available, so
    // the pass reads THAT — and the operator channel says so plainly rather
    // than letting a thinner answer look like a normal one.
    const circleId = await resolveCircle(msg);
    const bytes = circleId ? await readArtifactBytes(circleId, msg.arrival_id) : null;
    if (bytes) {
      const normalized = normalizeArrival(bytes, sniffMime(bytes));
      if (normalized.outcome === 'rendered') documentText = normalized.text;
    }
    operatorNotes.push(
      'This work item carried no extracted facts. Read the document text below directly; do not assume a field is absent from the record because it is missing here.',
    );
  }

  const answer = await interpretArrival({
    recordContext: context,
    facts: carried,
    documentText,
    operatorNotes,
    deadlineIso: claim.deadline,
  });

  if (answer.outcome !== 'ok') {
    if (answer.outcome === 'unavailable') return 'interpret_unavailable_retry';
    const reason = answer.outcome === 'refusal' ? 'provider_refusal' : 'provider_error';
    const r = await advanceArrival(
      msg.arrival_id,
      'interpreting',
      'extract_failed',
      lease,
      reason,
    );
    return answer.outcome + ':' + r;
  }

  // The same band mode the extract arm publishes through (§6.5).
  const bands = loadBands({
    running: {
      modelId: INTERPRET_MODEL,
      promptVersion: PROMPT_VERSION,
      configurationHash: configurationHash(),
    },
  });
  const drafted = draftPayloads(answer.data.proposals, context, answer.data.anomalies, bands);
  const r = await finalizeInterpretation(msg.arrival_id, lease, drafted);
  // The exit seam (Q7): proposals REST at `pending`. Nothing is enqueued —
  // the review screen, item-level approval and the receipt are slice 6's, so
  // `Needs you` labels a true state whose acting surface is one slice away.
  return r + ':' + drafted.length + 'p';
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
  const startedAt = Date.now();
  const batch: QueuedWork[] = await readPipelineWork(BATCH);
  const processed: Array<{ arrival_id: string; stage: string; outcome: string }> = [];

  for (const work of batch) {
    const msg = work.message;
    if (Date.now() - startedAt > ROUTE_BUDGET_MS - PER_MESSAGE_RESERVE_MS) {
      // Out of budget: the rest of the batch is left UNACKED, so it
      // redelivers on the visibility timeout and the next tick takes it.
      // Nothing is lost; only this invocation stops.
      processed.push({ arrival_id: msg.arrival_id, stage: msg.stage, outcome: 'budget_deferred' });
      continue;
    }
    try {
      if (!STAGES.has(msg.stage)) {
        // Slice 5's remaining work: deferred, never consumed, never lost.
        await deferPipelineWork(work.msg_id);
        processed.push({ arrival_id: msg.arrival_id, stage: msg.stage, outcome: 'deferred' });
        continue;
      }
      let outcome: string;
      if (msg.stage === 'store') outcome = await processStore(msg, origin, key);
      else if (msg.stage === 'scan') outcome = await processScan(msg, origin, key);
      else if (msg.stage === 'extract') outcome = await processExtract(msg, origin, key);
      else if (msg.stage === 'interpret') outcome = await processInterpret(msg);
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
