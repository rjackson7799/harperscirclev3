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
