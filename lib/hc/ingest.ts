import 'server-only';
import { asPipeline } from '@/lib/db';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The intake wrappers the inbound webhook rides (TSD §5.2; slice-4 plan
 * B2). Everything here is hc_pipeline authority except activation, which
 * is the member's own act on the request-role channel (§5.1; FWD-01's
 * app half). The DB semantics are 4A-proven (043–050); these wrappers
 * add types and the ONE-transaction intake boundary, nothing else.
 */

export type ForwardingResolution = {
  circle_id: string;
  subject_id: string;
  forwarding_active: boolean;
};

/** §5.2 step 2: local part → circle/subject, active flag DISTINCT so
 *  provisioning drift stays visible. Unknown/deleted ⇒ null, one shape. */
export async function resolveForwarding(localPart: string): Promise<ForwardingResolution | null> {
  const r = await asPipeline().query('select hc.resolve_forwarding($1) as r', [localPart]);
  return (r.rows[0]?.r as ForwardingResolution | null) ?? null;
}

export type QuotaOutcome = 'ok' | 'over_sender' | 'over_circle' | 'over_capacity';

export type QuotaAnswer = {
  outcome: QuotaOutcome;
  monthly_ceiling_reached: boolean;
  limits: {
    attachments_per_email: number;
    file_bytes_max: number;
    file_pages_max: number;
  };
};

/** §5.4 as one enumerated answer — the webhook never re-derives policy. */
export async function checkQuota(circleId: string, sender: string | null): Promise<QuotaAnswer> {
  const r = await asPipeline().query('select hc.check_quota($1, $2) as r', [circleId, sender]);
  return r.rows[0].r as QuotaAnswer;
}

export type LookalikeAnswer = { lookalike: boolean; similar_to: string | null };

/** §5.3: a near-miss on an accepted sender is MORE suspicious than a
 *  stranger; the match is named for the verdict detail. */
export async function senderLookalike(circleId: string, domain: string): Promise<LookalikeAnswer> {
  const r = await asPipeline().query('select hc.sender_lookalike($1, $2) as r', [circleId, domain]);
  return r.rows[0].r as LookalikeAnswer;
}

/** §5.1: the member-side activation flip (verified founder is the gate,
 *  read DB-side from the postgres-owned mirror; idempotent). */
export async function activateForwarding(
  claims: RequestClaims,
  subjectId: string,
): Promise<{ activated: boolean; active_at: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.activate_forwarding($1) as r', [subjectId]);
    return r.rows[0].r as { activated: boolean; active_at: string };
  });
}

/**
 * §5.1's lifecycle moment, wired at email verification (FWD-01 app
 * half): every not-yet-active subject THIS caller can see gets an
 * activation attempt. Refusals are per-subject and quiet — activation
 * itself enforces the gates (live coordinator, the founder's verified
 * mirror, no live freeze) and is idempotent; a subject the caller may
 * not activate refuses without disturbing the rest. Provider-side route
 * creation is the deploy checklist's row (docs/ops/ingestion-deploy.md).
 */
export async function activateForwardingAfterVerification(
  claims: RequestClaims,
): Promise<{ activated: number }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const subjects = await q.query(
      `select s.id from public.subjects s
        where s.deleted_at is null and s.forwarding_active_at is null`,
    );
    let activated = 0;
    for (const row of subjects.rows as { id: string }[]) {
      await q.query('savepoint fa');
      try {
        const r = await q.query('select hc.activate_forwarding($1) as r', [row.id]);
        if ((r.rows[0].r as { activated: boolean }).activated) activated += 1;
      } catch {
        await q.query('rollback to savepoint fa');
      }
    }
    return { activated };
  });
}

export type EmailAttachmentMeta = {
  contentType: string | null;
  contentLength: number | null;
};

export type EmailArrivalInput = {
  circleId: string;
  subjectId: string;
  senderAddress: string | null;
  senderDisplayName: string | null;
  messageId: string | null;
  authResult: 'authenticated' | 'unauthenticated' | 'lookalike';
  authDetail: unknown;
  attachments: EmailAttachmentMeta[];
};

export type EmailArrivals = { parentId: string; childIds: string[] };

/**
 * §5.2 step 5: the parent + one child per attachment, in ONE transaction
 * (§4.6 — five rows or none). Idempotency keys derive from the provider
 * message id, so a webhook redelivery replays to the same rows; the
 * identity check inside hc.create_arrival raises idempotency_conflict on
 * a disagreeing replay, and the transaction boundary here guarantees a
 * refused child takes the parent down with it.
 */
export async function createEmailArrivals(input: EmailArrivalInput): Promise<EmailArrivals> {
  return asPipeline().withSession(async (q) => {
    await q.query('begin');
    try {
      const parent = await q.query(
        `select hc.create_arrival(
           $1, $2, 'email', null, $3, $4, $5, $6, $7, null, null, null, $8) as id`,
        [
          input.circleId,
          input.subjectId,
          input.senderAddress,
          input.senderDisplayName,
          input.messageId,
          input.authResult,
          JSON.stringify(input.authDetail ?? {}),
          input.messageId ? `email:${input.messageId}` : null,
        ],
      );
      const parentId = parent.rows[0].id as string;

      const childIds: string[] = [];
      for (let i = 0; i < input.attachments.length; i++) {
        const att = input.attachments[i];
        const child = await q.query(
          `select hc.create_arrival(
             $1, $2, 'email', $3, $4, $5, $6, $7, null, $8, $9, null, $10) as id`,
          [
            input.circleId,
            input.subjectId,
            parentId,
            input.senderAddress,
            input.senderDisplayName,
            input.messageId,
            input.authResult,
            att.contentType,
            att.contentLength,
            input.messageId ? `email:${input.messageId}:${i}` : null,
          ],
        );
        childIds.push(child.rows[0].id as string);
      }

      await q.query('commit');
      return { parentId, childIds };
    } catch (err) {
      await q.query('rollback').catch(() => {});
      throw err;
    }
  });
}

/** §5.2 step 6 / §1.4: one work item per arrival on the pgmq data plane.
 *  The message carries the CHANNEL lineage the gate worker reads (B4);
 *  duplicate deliveries are absorbed downstream (claim_stage). */
export async function enqueuePipeline(
  circleId: string,
  arrivalIds: string[],
  channel: 'email' | 'upload',
): Promise<void> {
  if (arrivalIds.length === 0) return;
  await asPipeline().withSession(async (q) => {
    for (const id of arrivalIds) {
      await q.query(`select pgmq.send('pipeline_work', $1::jsonb)`, [
        JSON.stringify({ circle_id: circleId, arrival_id: id, stage: 'store', channel }),
      ]);
    }
  });
}
