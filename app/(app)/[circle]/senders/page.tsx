import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { listKnownSenders, type KnownSender } from '@/lib/hc/inbox';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatShortDate } from '@/lib/format/dates';

/**
 * Known senders (5B B8; ADR-0019 D15's named gap; SND-03; TSD §5.3).
 *
 * `hc.revoke_sender` shipped at 4A with nowhere to call it from — the list it
 * operates on had no read. 5A M1's `hc.list_known_senders` is that read, and
 * this is the surface: who has been let in, who let them in, when, and one
 * control to undo it.
 *
 * Deliberately NOT in the left nav. NAV_MANIFEST lists only live primary
 * routes and tests/design/shell.test.tsx pins the exact set; a sixth item
 * would change the shell and the a11y surface for a management screen that
 * belongs beside the thing it manages. A sender is accepted from the Care
 * Inbox, so the list of accepted senders is linked from there.
 *
 * Everything the caller sees is the definer's answer under their own
 * authority. A refusal — foreign circle, nonexistent circle, or a member below
 * coordinator — is ONE shape, and it renders as an empty view rather than an
 * error, because "you may not see this" and "there is nothing here" must look
 * the same from outside (DEF-10; the Q6 fail-closed posture).
 */
export default async function SendersPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) redirect(`/sign-in?next=${encodeURIComponent(`/${circle}/senders`)}`);

  // 6B B6 (R5/F-7): the ?e=revoke marker the submit route emits is READ.
  const sp = await searchParams;
  const revokeFailed = sp.e === 'revoke';

  let senders: KnownSender[] = [];
  try {
    senders = await listKnownSenders(claims, circle);
  } catch {
    // One shape. The refusal never reaches the page as a message.
    senders = [];
  }

  return (
    <>
      <PageHeader
        title="Known senders"
        context="Mail from these addresses reaches the Care Inbox without being held. Anyone here was accepted by a person in this circle."
      />
      {revokeFailed ? (
        <p className="field-help" role="alert">
          That sender couldn&apos;t be removed just now. Please try again.
        </p>
      ) : null}
      {senders.length === 0 ? (
        <EmptyState>You have not accepted any senders yet.</EmptyState>
      ) : (
        <div className="choice-list">
          {senders.map((sender) => (
            <Card key={sender.id}>
              <span className="row-title">
                {sender.domain ? `Everyone at ${sender.domain}` : sender.address}
              </span>
              <p className="meta">
                Accepted by {sender.accepted_by_name} on{' '}
                {formatShortDate(sender.accepted_at.slice(0, 10))}
              </p>
              <form method="post" action={`/${circle}/senders/revoke/submit`}>
                <input type="hidden" name="sender_id" value={sender.id} />
                <Button type="submit" variant="quiet">
                  Stop accepting mail from{' '}
                  {sender.domain ? `everyone at ${sender.domain}` : 'this sender'}
                </Button>
              </form>
            </Card>
          ))}
        </div>
      )}
      <p className="meta">
        <a href={`/${circle}/inbox`}>Back to the Care Inbox</a>
      </p>
    </>
  );
}
