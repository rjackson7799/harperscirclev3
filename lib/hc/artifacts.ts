import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { appendArtifactReadEntry } from '@/lib/db/evidentiary';

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

export type ArtifactReadLog = {
  claims: RequestClaims;
  circleId: string;
  subjectId: string;
  arrivalId: string;
};

/** §1.3 step 6 — evidence before bytes: the artifact_read entry on the
 *  evidentiary boundary (the hash chain stays intact). */
export async function logArtifactRead(log: ArtifactReadLog): Promise<void> {
  if (!log.claims.sub) throw new Error('logArtifactRead: no actor');
  await appendArtifactReadEntry({
    circleId: log.circleId,
    subjectId: log.subjectId,
    arrivalId: log.arrivalId,
    actorAccountId: log.claims.sub,
  });
}
