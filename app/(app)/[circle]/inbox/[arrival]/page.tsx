import { notFound, redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { arrivalForReview } from '@/lib/hc/review';
import { productStates } from '@/lib/hc/inbox';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatShortDate } from '@/lib/format/dates';

/**
 * The arrival detail route (6B B6; PRD §4.2.3's screen opens here — B7
 * fills its three regions; AC-INBOX-8).
 *
 * AUTHORIZATION IS RESOLVED ONCE, at the top, into the one question every
 * 6A-unified gate asks: `view` over all five domains of THIS arrival
 * (lib/hc/review.arrivalForReview — the artifact route's own predicate).
 * Every region below renders from that single answer, so the screen can
 * never disagree with the database about who may see this arrival.
 *
 * The zero-row shape is notFound — nonexistent, foreign, deleted, revoked
 * and below-summary are indistinguishable here exactly as they are at the
 * artifact route (DEF-10).
 *
 * AC-INBOX-8, as the plan's §4.4 states it: the summary-×5 member sees the
 * ROW and the STATE — which summary already grants them on the list — and
 * ONE line saying what fuller access would show. §4.2.3's word is *absent*:
 * no source, no facts, no proposals, no controls. The hiding renders a
 * database refusal (M2's write-time predicate), never the only gate.
 */
export default async function ArrivalPage({
  params,
}: {
  params: Promise<{ circle: string; arrival: string }>;
}) {
  const { circle, arrival } = await params;
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) {
    redirect(`/sign-in?next=${encodeURIComponent(`/${circle}/inbox/${arrival}`)}`);
  }

  // THE one resolution (M2/M5's unified gate, asked once).
  const row = await arrivalForReview(claims, circle, arrival);
  if (!row) notFound();

  const labels = await productStates(claims, [row.id]);
  const label = labels.get(row.id) ?? '—';
  const title =
    row.channel === 'email'
      ? (row.sender_display_name ? `${row.sender_display_name} · ` : '') +
        (row.sender_address ?? 'unknown sender')
      : 'Uploaded document';

  return (
    <>
      <PageHeader title={title} context={`Received ${formatShortDate(row.received_at.slice(0, 10))} · ${label}`} />

      {!row.can_view ? (
        // AC-INBOX-8's one line: what fuller access would show, asserting
        // nothing about the contents.
        <p className="field-help">
          You can follow this item&apos;s progress here. Reviewing what it contains needs
          fuller access to this person&apos;s record — a coordinator in this circle can
          review it, or can raise your access.
        </p>
      ) : (
        <>
          {row.scan_verdict === 'clean' ? (
            <p className="meta">
              <a href={`/api/artifact/${row.id}`}>Open the original</a>
            </p>
          ) : null}
        </>
      )}

      <p className="meta">
        <a href={`/${circle}/inbox`}>Back to the Care Inbox</a>
      </p>
    </>
  );
}
