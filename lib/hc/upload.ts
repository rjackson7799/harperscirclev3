import 'server-only';
import { asPipeline } from '@/lib/db';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The upload path's wrappers (TSD §2.12, §1.8; slice-4 plan B3; UPL-01).
 *
 * Right to ingest = MANAGE over the all-domain taint — the same bar as
 * approve/cancel/resolve, and the Q6 audience by design: who can approve
 * can ingest, and an uploader can always see what they uploaded. Decided
 * at build (the plan left the level to PRD §4.2), recorded in ADR-0019.
 * The probe runs on the REQUEST-ROLE channel: RLS and hc.visible_at
 * evaluate exactly as they do everywhere else, so nonexistent,
 * unauthorized and below-cliff callers all land in the same zero-row
 * shape — no oracle.
 */

export type IngestRight = { circle_id: string };

export async function canIngestForSubject(
  claims: RequestClaims,
  subjectId: string,
): Promise<IngestRight | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjectId)) {
    return null;
  }
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query(
      `select s.circle_id
         from public.subjects s
        where s.id = $1
          and s.deleted_at is null
          and hc.visible_at(hc.ctx(), s.id, hc.all_domains(), true) >= 'manage'`,
      [subjectId],
    );
    return r.rows[0] ? { circle_id: r.rows[0].circle_id as string } : null;
  });
}

export type UploadArrivalInput = {
  circleId: string;
  subjectId: string;
  byteSize: number;
  mimeDeclared: string | null;
  uploadId: string;
};

/** §5.2's create, upload channel: keyed to ONE upload attempt (a
 *  completion retry replays to the same arrival; a re-upload of the same
 *  bytes is a NEW arrival — the §4.7 duplicate machinery owns that
 *  question, never the idempotency key). */
export async function createUploadArrival(
  input: UploadArrivalInput,
): Promise<{ arrivalId: string }> {
  const r = await asPipeline().query(
    `select hc.create_arrival(
       $1, $2, 'upload', null, null, null, null, null, null, $3, $4, null, $5) as id`,
    [
      input.circleId,
      input.subjectId,
      input.mimeDeclared,
      input.byteSize,
      `upload:${input.uploadId}`,
    ],
  );
  return { arrivalId: r.rows[0].id as string };
}
