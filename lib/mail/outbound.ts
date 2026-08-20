import 'server-only';

/**
 * The outbound half of the mail adapter — the ONE template 4B needs
 * (TSD §5.4's aligned-bounce; the full 8-template/3-class §1.6 surface
 * stays with its slices). Zero-dep: a plain POST to the provider's email
 * API. The bounce is only ever sent to a DMARC-ALIGNED sender — the
 * webhook's §5.4 table is the sole caller and drops unauthenticated mail
 * without reply (no backscatter).
 *
 * POSTMARK_SERVER_TOKEN unset (every environment before the G4
 * activation gate — no real forwarding address exists, so no real sender
 * can be owed a bounce) ⇒ the send is skipped and reported 'unsent';
 * the refusal itself already happened at the webhook. The deploy
 * checklist provisions the token with the Postmark server.
 */

export type QuotaBounceReason =
  | 'over_sender'
  | 'over_circle'
  | 'over_capacity'
  | 'over_attachments'
  | 'over_file_size';

export type QuotaBounce = {
  /** The aligned sender the §5.4 table says may be answered. */
  to: string;
  /** The forwarding address the message was sent to. */
  subjectAddress: string;
  reason: QuotaBounceReason;
  /** The §5.4 letter: a reason the sender can read; capacity names the
   *  limit in plain words. */
  reasonText: string;
};

export async function sendQuotaBounce(bounce: QuotaBounce): Promise<'sent' | 'unsent'> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) return 'unsent';
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: process.env.POSTMARK_BOUNCE_FROM ?? 'no-reply@harperscircle.app',
      To: bounce.to,
      Subject: `Your message to ${bounce.subjectAddress} could not be delivered`,
      TextBody: bounce.reasonText,
      MessageStream: 'outbound',
    }),
  });
  if (!res.ok) throw new Error(`sendQuotaBounce: provider answered ${res.status}`);
  return 'sent';
}
