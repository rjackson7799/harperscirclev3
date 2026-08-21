import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The Care Inbox's member operations (slice-4 plan B6; UXA-01's Q6
 * disposition; SND-02's member surfaces; CNL-01/DUP-01 surfaces;
 * PST-01 consumed). Everything rides the request-role channel — the
 * caller's own authority, RLS and the definers' own gates deciding,
 * never this module.
 */

export type AcceptSenderInput = { address: string } | { domain: string };

/** hc.accept_sender — coordinator-only; releases held mail from that
 *  sender in the SAME transaction (a real gate lease + the CAS + the
 *  outbox re-queue the relay drains). */
export async function acceptSender(
  claims: RequestClaims,
  circleId: string,
  input: AcceptSenderInput,
): Promise<{ sender_id: string; released_count: number }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.accept_sender($1, $2, $3) as r', [
      circleId,
      'address' in input ? input.address : null,
      'domain' in input ? input.domain : null,
    ]);
    return r.rows[0].r as { sender_id: string; released_count: number };
  });
}

/** hc.cancel_arrival — the member's window (§4.5): who can approve can
 *  cancel; freeze named first; DEF-10 one refusal shape. */
export async function cancelArrival(
  claims: RequestClaims,
  arrivalId: string,
): Promise<{ arrival_id: string; state: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.cancel_arrival($1) as r', [arrivalId]);
    return r.rows[0].r as { arrival_id: string; state: string };
  });
}

/** hc.resolve_duplicate — §4.7's two human exits; never auto-discarded. */
export async function resolveDuplicate(
  claims: RequestClaims,
  arrivalId: string,
  resolution: 'different' | 'same_thing',
): Promise<{ arrival_id: string; resolution: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.resolve_duplicate($1, $2) as r', [arrivalId, resolution]);
    return r.rows[0].r as { arrival_id: string; resolution: string };
  });
}

/**
 * hc.product_state per arrival — the PRD §4.2.2 vocabulary with the A.4
 * parent rollup, computed DB-side over the CALLER's visible children.
 * DEF-10 refusals are OMITTED from the map (savepoint-per-id, so one
 * refusal never aborts the batch): a caller below the cliff gets an
 * empty map — no error-shape oracle, no existence leak.
 */
export async function productStates(
  claims: RequestClaims,
  arrivalIds: string[],
): Promise<Map<string, string>> {
  if (arrivalIds.length === 0) return new Map();
  return withRequestRole('authenticated', claims, async (q) => {
    const labels = new Map<string, string>();
    for (const id of arrivalIds) {
      await q.query('savepoint ps');
      try {
        const r = await q.query('select hc.product_state($1) as label', [id]);
        const label = r.rows[0]?.label as string | null;
        if (label) labels.set(id, label);
      } catch {
        await q.query('rollback to savepoint ps');
      }
    }
    return labels;
  });
}
