import { createHash, timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import {
  evaluateSenderAuth,
  parseInbound,
  type PostmarkInboundPayload,
} from '@/lib/mail/inbound';
import {
  checkQuota,
  createEmailArrivals,
  enqueuePipeline,
  resolveForwarding,
  senderLookalike,
} from '@/lib/hc/ingest';
import { stageIntakeObject } from '@/lib/storage/artifacts';
import { sendQuotaBounce, type QuotaBounceReason } from '@/lib/mail/outbound';

/**
 * POST /api/inbound/postmark — the §5.2 six steps, literally (TSD §5.2;
 * slice-4 plan B2; INB-01):
 *
 *   1. Verify the provider's signature and the request's source.
 *      Postmark authenticates inbound webhooks with basic-auth
 *      credentials embedded in the webhook URL; the expected header is
 *      rebuilt from POSTMARK_INBOUND_SECRET and compared timing-safe.
 *      Secret unset ⇒ 503 (disabled, never open — the worker-key
 *      posture); unsigned ⇒ 401, logged. Source-IP restriction is the
 *      WAF's row on the ingestion deploy checklist.
 *   2. Resolve the recipient local part → subject. No match ⇒ blocked:
 *      the real 550 lives at the provider (the route does not exist,
 *      §5.1), so this branch is defence in depth; a resolvable-but-
 *      INACTIVE address is provisioning drift — blocked and logged,
 *      never absorbed.
 *   3. Quota (§5.4, M3's enumerated outcome + the per-message bounds):
 *      over + DMARC-aligned ⇒ a bounce the sender can read (capacity
 *      names the limit in plain words; everything else keeps working);
 *      over + unauthenticated ⇒ DROPPED — not stored, not bounced
 *      (bouncing forged mail is backscatter at the forged victim). The
 *      monthly ceiling notifies and never turns the outcome.
 *   4. Evaluate sender authentication (§5.3, the B1 adapter); the M3
 *      lookalike overrides the stored result (a near-miss on an
 *      accepted sender is MORE suspicious). The verdict is stored
 *      VERBATIM in auth_detail.
 *   5. hc.create_arrival parent + one child per attachment, ONE
 *      transaction; the intake bytes are staged durably BEFORE the 200
 *      (acceptance = rows AND bytes, §13.1 — a crash after this point
 *      delays reading, it never loses a document).
 *   6. Enqueue on pgmq; answer 200. The eager worker fire rides
 *      after() — strictly post-response, so acceptance never waits on
 *      processing; a dropped fire is the sweeper's to recover (§1.4).
 */

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function blocked(reason: string): Response {
  return Response.json({ action: 'blocked', reason }, { status: 403 });
}

const CAPACITY_TEXT =
  'This circle has reached its storage limit, so this message was not accepted. ' +
  'Reading, search, export and deletion all keep working for the family; nothing ' +
  'already sent has been deleted to make room.';

function bounceText(reason: QuotaBounceReason): string {
  if (reason === 'over_capacity') return CAPACITY_TEXT;
  if (reason === 'over_attachments') {
    return 'This message carried more attachments than this address accepts per email, so it was not accepted. Please resend with fewer attachments.';
  }
  if (reason === 'over_file_size') {
    return 'An attachment on this message is larger than this address accepts per file, so the message was not accepted. Please resend a smaller file.';
  }
  return 'This address has received more messages than it accepts in a short window, so this message was not accepted. Please try again later.';
}

export async function POST(req: Request): Promise<Response> {
  // ── 1 · signature before anything.
  const secret = process.env.POSTMARK_INBOUND_SECRET;
  if (!secret) return new Response('inbound disabled', { status: 503 });
  const expected = 'Basic ' + Buffer.from(`postmark:${secret}`).toString('base64');
  if (!secretMatches(req.headers.get('authorization'), expected)) {
    console.warn('inbound/postmark: unsigned request refused');
    return new Response('unsigned', { status: 401 });
  }

  let payload: PostmarkInboundPayload;
  try {
    payload = (await req.json()) as PostmarkInboundPayload;
  } catch {
    return new Response('malformed', { status: 400 });
  }

  try {
    const msg = parseInbound(payload);

    // ── 2 · resolve, drift visible.
    if (!msg.recipientLocalPart) return blocked('unknown_recipient');
    const resolved = await resolveForwarding(msg.recipientLocalPart);
    if (!resolved) return blocked('unknown_recipient');
    if (!resolved.forwarding_active) {
      console.warn(
        `inbound/postmark: mail reached an INACTIVE address (provisioning drift): ${msg.recipientLocalPart}`,
      );
      return blocked('inactive_address');
    }

    // ── 3 · quota, the §5.4 table.
    const quota = await checkQuota(resolved.circle_id, msg.senderAddress);
    const verdict = evaluateSenderAuth(payload, {
      authservId: process.env.HC_AUTHSERV_ID ?? '',
      trustedHop: process.env.HC_TRUSTED_HOP ?? '',
    });
    const aligned = verdict.result === 'authenticated';

    let overReason: QuotaBounceReason | null = null;
    if (quota.outcome !== 'ok') overReason = quota.outcome;
    else if (msg.attachments.length > quota.limits.attachments_per_email) {
      overReason = 'over_attachments';
    } else if (msg.attachments.some((a) => a.contentLength > quota.limits.file_bytes_max)) {
      overReason = 'over_file_size';
    }

    if (overReason) {
      if (aligned && msg.senderAddress) {
        let bounce: 'sent' | 'unsent' | 'failed';
        try {
          bounce = await sendQuotaBounce({
            to: msg.senderAddress,
            subjectAddress:
              payload.OriginalRecipient ?? payload.ToFull?.[0]?.Email ?? msg.recipientLocalPart,
            reason: overReason,
            reasonText: bounceText(overReason),
          });
        } catch (err) {
          // The refusal stands either way; a bounce-delivery failure is
          // operational noise, never a reason to make the provider retry.
          console.error(`inbound/postmark: bounce send failed: ${(err as Error).message}`);
          bounce = 'failed';
        }
        return Response.json({ action: 'bounced', reason: overReason, bounce });
      }
      // Unauthenticated over-limit mail: rejected at ingress rather than
      // stored — and never bounced (no backscatter). 200 keeps the
      // provider from retrying what we deliberately refused.
      return Response.json({ action: 'dropped', reason: overReason });
    }

    // ── 4 · the verdict, stored verbatim; lookalike overrides.
    let authResult: 'authenticated' | 'unauthenticated' | 'lookalike' = verdict.result;
    let authDetail: Record<string, unknown> = { ...verdict.detail };
    if (msg.senderDomain) {
      const lookalike = await senderLookalike(resolved.circle_id, msg.senderDomain);
      authDetail = { ...authDetail, lookalike };
      if (lookalike.lookalike) authResult = 'lookalike';
    }

    // ── 5 · parent + children, ONE transaction; then bytes, durably.
    const created = await createEmailArrivals({
      circleId: resolved.circle_id,
      subjectId: resolved.subject_id,
      senderAddress: msg.senderAddress,
      senderDisplayName: msg.senderDisplayName,
      messageId: msg.messageId,
      authResult,
      authDetail,
      attachments: msg.attachments.map((a) => ({
        contentType: a.contentType || null,
        contentLength: a.contentLength ?? null,
      })),
    });

    const parentSource = Buffer.from(
      JSON.stringify({
        subject: msg.subject,
        from: msg.senderAddress,
        message_id: msg.messageId,
        text_body: msg.textBody,
        html_body: msg.htmlBody,
        headers: payload.Headers ?? [],
      }),
      'utf8',
    );
    await stageIntakeObject(resolved.circle_id, created.parentId, parentSource, 'application/json');
    for (let i = 0; i < msg.attachments.length; i++) {
      await stageIntakeObject(
        resolved.circle_id,
        created.childIds[i],
        Buffer.from(msg.attachments[i].content, 'base64'),
        msg.attachments[i].contentType,
      );
    }

    // ── 6 · enqueue; 200 BEFORE any processing.
    const ids = [created.parentId, ...created.childIds];
    await enqueuePipeline(resolved.circle_id, ids);

    if (quota.monthly_ceiling_reached) {
      console.warn(
        `inbound/postmark: monthly processing ceiling reached for circle ${resolved.circle_id} — notify signal (PRD §4.2.8), never a refusal`,
      );
    }

    const origin = new URL(req.url).origin;
    after(async () => {
      const key = process.env.HC_WORKER_KEY;
      if (!key) return; // local default: the sweeper is the recovery story
      await fetch(`${origin}/api/worker/store`, {
        method: 'POST',
        headers: { 'x-worker-key': key },
      }).catch(() => {
        // A dropped eager fire is a delay, never a loss (§1.4).
      });
    });

    return Response.json({
      action: 'accepted',
      arrival_id: created.parentId,
      children: created.childIds.length,
      monthly_ceiling_reached: quota.monthly_ceiling_reached,
    });
  } catch (err) {
    // A refused write or failed staging must NOT answer 2xx: the provider
    // retries and the idempotent intake replays cleanly (ING-11).
    console.error(`inbound/postmark: ${(err as Error).message}`);
    return new Response('intake failed', { status: 500 });
  }
}
