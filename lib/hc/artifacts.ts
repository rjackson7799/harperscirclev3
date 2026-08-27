import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The artifact route's data half (slice-4 plan B7; TSD §1.3; RLS-10).
 * readableArtifact is §1.3 steps 1+2 in ONE query on the request-role
 * channel: RLS scopes the row AND hc.visible_at must clear VIEW for the
 * arrival itself (shares widen one named object; the care_circle
 * ceiling and the FRZ-13 cap apply inside visible_at). Zero rows is the
 * one shape for nonexistent, unauthorized, revoked and below-cliff —
 * the route's 404 ≡ 403 rests on this. The independent clean gate
 * (step 3) is deliberately the ROUTE's, not this query's.
 */

export type ReadableArtifact = {
  circle_id: string;
  subject_id: string;
  storage_key: string | null;
  scan_verdict: string | null;
  mime_detected: string | null;
  byte_size: number | null;
};

export async function readableArtifact(
  claims: RequestClaims,
  arrivalId: string,
): Promise<ReadableArtifact | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arrivalId)) {
    return null;
  }
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query(
      `select a.circle_id, a.subject_id, a.storage_key, a.scan_verdict,
              a.mime_detected, a.byte_size
         from public.arrivals a
        where a.id = $1
          and a.deleted_at is null
          and hc.visible_at(hc.ctx(), a.subject_id, hc.all_domains(), true,
                            'arrival', a.id, null) >= 'view'`,
      [arrivalId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      circle_id: row.circle_id as string,
      subject_id: row.subject_id as string,
      storage_key: (row.storage_key as string | null) ?? null,
      scan_verdict: (row.scan_verdict as string | null) ?? null,
      mime_detected: (row.mime_detected as string | null) ?? null,
      byte_size: row.byte_size === null ? null : Number(row.byte_size),
    };
  });
}

/**
 * The 6A M4 rendition manifest, read RLS-true on the request-role channel
 * (6B B2). `arrival_renditions_select` carries the SAME view-over-all-five
 * arrival gate the artifact route and hc.log_artifact_read enforce, so zero
 * rows is the one shape for not-rendered, foreign, deleted, revoked and
 * below-cliff alike — the manifest can never become a side channel telling
 * someone how many pages a document they cannot open has.
 */
export type ReadableRendition = {
  page_count: number;
  page_exts: string[];
};

export async function readableRendition(
  claims: RequestClaims,
  arrivalId: string,
): Promise<ReadableRendition | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arrivalId)) {
    return null;
  }
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query(
      `select page_count, page_exts from public.arrival_renditions where arrival_id = $1`,
      [arrivalId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      page_count: Number(row.page_count),
      page_exts: (row.page_exts as string[]) ?? [],
    };
  });
}

export type ArtifactReadLog = {
  claims: RequestClaims;
  arrivalId: string;
};

/**
 * §1.3 step 6 — evidence before bytes: the `artifact_read` entry, through
 * **hc.log_artifact_read** (5A M1) on the request-role channel.
 *
 * 5B B8 retires ADR-0019's D7 interim. 4B had to append as `hc_internal` over
 * the maintenance connection, because `hc.log` is deliberately
 * hc_internal-only and 4A M5 shipped the event type with no definer. That
 * boundary is DELETED; this is the definer it was recorded as a candidate for.
 *
 * The call shrank on purpose. The definer resolves the circle, the subject
 * and the actor's display name itself, and — the part the interim could not
 * do — **re-proves RLS-10's letter in-function**: the arrival must be live and
 * the caller must clear VIEW on it, with zero rows the one shape for
 * nonexistent, foreign, deleted, revoked and below-cliff alike. The route's
 * own checks are no longer the only gate; a caller who reached this wrapper
 * around them writes nothing, rather than a real entry naming themselves.
 */
/**
 * Thrown between the insert and the commit when the caller has already given
 * up. Distinguishable so a route can tell "the trail failed" from "the trail
 * was not wanted" — both refuse the read, but only one is a fault.
 */
export class ArtifactReadAbandoned extends Error {
  constructor() {
    super('logArtifactRead: the caller abandoned the read; the trail is not written');
    this.name = 'ArtifactReadAbandoned';
  }
}

/**
 * ROUND-18 F-3 (ADR-0027 D3): `abandoned` is the answer budget's signal, and
 * it is checked AFTER the insert and BEFORE the commit. If the route has
 * already refused the read, the transaction rolls back and §10.5 records
 * nothing — because the alternative is an access-log entry asserting that a
 * member viewed a document they were served a 500 for.
 *
 * THE RESIDUE, STATED RATHER THAN CLAIMED AWAY: the check cannot cover the
 * commit round-trip itself. A budget that expires inside it still lands a row.
 * The window is one round-trip wide instead of the whole remaining query;
 * closing it completely needs two-phase commit. Narrowed, not eliminated.
 *
 * With no signal, or a signal that has not fired, this is byte-for-byte the
 * call it always was — the trail is the DEFAULT and declining it is the narrow
 * exception. Both controls in tests/hc/artifacts.test.ts exist to keep it so.
 */
export async function logArtifactRead(
  log: ArtifactReadLog,
  abandoned?: AbortSignal,
): Promise<void> {
  if (!log.claims.sub) throw new Error('logArtifactRead: no actor');
  await withRequestRole('authenticated', log.claims, async (q) => {
    await q.query('select hc.log_artifact_read($1)', [log.arrivalId]);
    if (abandoned?.aborted) throw new ArtifactReadAbandoned();
  });
}
