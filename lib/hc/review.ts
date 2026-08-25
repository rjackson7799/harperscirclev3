import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The review screen's data half (6B B6; slice-6 plan B6/B7; PRD §4.2.3).
 *
 * AUTHORIZATION IS RESOLVED ONCE PER REQUEST. 6A M2 began and M5 completed
 * the one-gate property: the source (the artifact route and
 * hc.log_artifact_read), the facts (hc.extractions_for), both decisions
 * (hc.approve_proposal / hc.reject_proposal), the manifest
 * (arrival_renditions_select) and the receipt (hc.receipt_for) all ask
 * `view` over all five domains of the SAME arrival. `arrivalForReview` asks
 * that question exactly once — `hc.visible_at(hc.ctx(), subject,
 * hc.all_domains(), true, 'arrival', id, null) >= 'view'`, character for
 * character the predicate the artifact route enforces — and the page
 * renders every region from the one answer. A page that asked per region
 * could disagree with itself; the DB's one-gate property deserves a
 * one-probe consumer.
 *
 * The read itself runs RLS-true on the request-role channel:
 * `arrivals_select` gates the ROW at `summary` over all five, so zero rows
 * stays the ONE shape for nonexistent, foreign, deleted, revoked and
 * below-summary alike (DEF-10). A row WITH `can_view: false` is precisely
 * AC-INBOX-8's member — summary×5, so the row and the state are theirs to
 * see, and nothing else is.
 */

export type ReviewArrival = {
  id: string;
  state: string;
  channel: string;
  sender_address: string | null;
  sender_display_name: string | null;
  received_at: string;
  subject_id: string;
  scan_verdict: string | null;
  /** THE one resolution: `view` over all five domains of this arrival —
   *  every M2/M5-unified gate answers exactly this. */
  can_view: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One extracted fact, exactly as `hc.extractions_for` returns it — seven
 *  columns, no band (Q4: a band is a property of the calibration, computed
 *  at render time from the pair, never stored on the fact). */
export type ReviewFact = {
  field: string;
  value: string;
  confidence: number;
  risk_class: string;
  citation: { page: number; bbox: [number, number, number, number] };
  model_id: string;
  prompt_version: string;
};

/**
 * The middle region's read (6B B7): `hc.extractions_for`, gated in-function
 * at the arrival's view×5 — the same one answer `arrivalForReview` resolved
 * — then filtered through `extractions_select`'s own predicate, so the
 * definer is never wider than the RLS it stands in for. Zero rows for the
 * unauthorized is the same shape as zero facts; the page only calls this
 * past `can_view`, so here zero means zero.
 */
export async function extractionsFor(
  claims: RequestClaims,
  arrivalId: string,
): Promise<ReviewFact[]> {
  if (!UUID_RE.test(arrivalId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select * from hc.extractions_for($1)', [arrivalId]);
    return r.rows.map((row) => {
      const citation = (row.citation ?? {}) as { page?: number; bbox?: number[] };
      const bbox = Array.isArray(citation.bbox) ? citation.bbox : [0, 0, 0, 0];
      return {
        field: String(row.field ?? ''),
        value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? null),
        confidence: Number(row.confidence ?? 0),
        risk_class: String(row.risk_class ?? 'high'),
        citation: {
          page: Number(citation.page ?? 1),
          bbox: [
            Number(bbox[0] ?? 0),
            Number(bbox[1] ?? 0),
            Number(bbox[2] ?? 0),
            Number(bbox[3] ?? 0),
          ] as [number, number, number, number],
        },
        model_id: String(row.model_id ?? ''),
        prompt_version: String(row.prompt_version ?? ''),
      };
    });
  });
}

export type ReviewProposal = {
  id: string;
  kind: string;
  version: number;
  payload: Record<string, unknown>;
  status: string;
  supersedes_id: string | null;
  anomaly_flags: string[];
  decided_at: string | null;
  reject_reason: string | null;
};

/**
 * The right region's read: an RLS-true select — `proposals_select` gates
 * rows at manage over the proposal's OWN taint, so a member sees exactly
 * the items they could decide, and nothing here re-implements that rule.
 */
export async function proposalsFor(
  claims: RequestClaims,
  circleId: string,
  arrivalId: string,
): Promise<ReviewProposal[]> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(arrivalId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query(
      `select id, kind::text as kind, version, payload, status, supersedes_id,
              anomaly_flags, decided_at, reject_reason
         from public.proposals
        where circle_id = $1 and arrival_id = $2
        order by created_at, id`,
      [circleId, arrivalId],
    );
    return r.rows.map((row) => ({
      id: row.id as string,
      kind: String(row.kind),
      version: Number(row.version),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      status: String(row.status),
      supersedes_id: (row.supersedes_id as string | null) ?? null,
      anomaly_flags: (row.anomaly_flags as string[] | null) ?? [],
      decided_at: row.decided_at ? String(row.decided_at) : null,
      reject_reason: (row.reject_reason as string | null) ?? null,
    }));
  });
}

/**
 * §4.2.9's presence, saying ONLY what `hc.presence` knows — existence
 * without content: ids, dates and types of the subject's record objects.
 * The most recent change is the honest concurrent-review signal ("the
 * record changed"), and nothing here can claim to know who is looking.
 */
export async function recentRecordChange(
  claims: RequestClaims,
  subjectId: string,
): Promise<string | null> {
  if (!UUID_RE.test(subjectId)) return null;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select max(changed_at) as t from hc.presence($1)', [subjectId]);
    return r.rows[0]?.t ? String(r.rows[0].t) : null;
  });
}

/**
 * The two decisions (6B B8) — the FIRST app callers that can reach the
 * decide definers. Both ride the request-role channel: the caller's own
 * authority, the definers' write-time re-check (M2's view×5 predicate, the
 * version gate, §6.4's confirmation) and the 6B payload contract decide —
 * never this module. `p_edits` carries exactly what the person did; the
 * `extractions` row is NEVER touched from here (Q7's smaller sibling: the
 * extraction is the honest record of what the model read).
 */
export async function approveProposal(
  claims: RequestClaims,
  proposalId: string,
  expectedVersion: number,
  idempotencyKey: string,
  edits: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.approve_proposal($1, $2, $3, $4) as r', [
      proposalId,
      expectedVersion,
      idempotencyKey,
      edits === null ? null : JSON.stringify(edits),
    ]);
    return r.rows[0].r as Record<string, unknown>;
  });
}

/** hc.reject_proposal — nothing is written to the record; the absent
 *  proposal_commits row is the assertion. The reason is §4.2.3's optional
 *  one tap, and its vocabulary is the DB's to enforce. */
export async function rejectProposal(
  claims: RequestClaims,
  proposalId: string,
  expectedVersion: number,
  idempotencyKey: string,
  reason: string | null,
): Promise<Record<string, unknown>> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.reject_proposal($1, $2, $3, $4) as r', [
      proposalId,
      expectedVersion,
      idempotencyKey,
      reason,
    ]);
    return r.rows[0].r as Record<string, unknown>;
  });
}

/** One §4.2.4 receipt row, exactly as `hc.receipt_for` returns it.
 *  `visible` is EXPLICIT — "you may not see this" and "there is nothing
 *  here" are the two sentences a receipt must never confuse — and an
 *  invisible destination keeps its `object_type` but never its name, its
 *  id or a handle (counted, never named). */
export type ReceiptRow = {
  proposal_id: string;
  status: string;
  reject_reason: string | null;
  object_type: string | null;
  object_id: string | null;
  label: string | null;
  visible: boolean;
};

export async function receiptFor(claims: RequestClaims, arrivalId: string): Promise<ReceiptRow[]> {
  if (!UUID_RE.test(arrivalId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select * from hc.receipt_for($1)', [arrivalId]);
    return r.rows.map((row) => ({
      proposal_id: row.proposal_id as string,
      status: String(row.status),
      reject_reason: (row.reject_reason as string | null) ?? null,
      object_type: row.object_type ? String(row.object_type) : null,
      object_id: (row.object_id as string | null) ?? null,
      label: (row.label as string | null) ?? null,
      visible: row.visible === true,
    }));
  });
}

export async function arrivalForReview(
  claims: RequestClaims,
  circleId: string,
  arrivalId: string,
): Promise<ReviewArrival | null> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(arrivalId)) return null;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query(
      `select a.id, a.state::text as state, a.channel::text as channel,
              a.sender_address, a.sender_display_name, a.received_at,
              a.subject_id, a.scan_verdict::text as scan_verdict,
              hc.visible_at(hc.ctx(), a.subject_id, hc.all_domains(), true,
                            'arrival', a.id, null) >= 'view' as can_view
         from public.arrivals a
        where a.id = $1
          and a.circle_id = $2
          and a.deleted_at is null`,
      [arrivalId, circleId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      state: row.state as string,
      channel: row.channel as string,
      sender_address: (row.sender_address as string | null) ?? null,
      sender_display_name: (row.sender_display_name as string | null) ?? null,
      received_at: String(row.received_at),
      subject_id: row.subject_id as string,
      scan_verdict: (row.scan_verdict as string | null) ?? null,
      can_view: row.can_view === true,
    };
  });
}
