import { asUser } from '@/lib/db/user';
import { describeInvite } from '@/lib/hc/invites';
import { TierCeiling } from '@/lib/permissions/tier-ceiling';
import { Button } from '@/components/ui/Button';

/**
 * The accept screen (PRD §4.1.4–§4.1.5; TSD §5.10).
 *
 * Order is the spec: which circle, who invited them, which subject(s),
 * and the plain-language ceiling — BEFORE anything is asked. The ceiling
 * renders through THE one module (AC-AUTH-8). Then, and only then, the
 * action for the session state:
 *   no session          → create account (address fixed) or sign in
 *   the invited address → accept
 *   anyone else         → AC-AUTH-11: forced re-auth as the invited
 *                         address; a stale session on a shared laptop is
 *                         not consent
 * Dead tokens get §4.1.7's treatment: who invited them, ask for a new
 * one, no account created. The DB re-checks every one of these at
 * acceptance regardless — the screen is honesty, not enforcement.
 */
export default async function AcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const invite = await describeInvite(token);

  if (!invite) {
    return (
      <main className="auth-card">
        <h1>This invite is no longer valid</h1>
        <p>The link may be incomplete, or the invite may have been withdrawn.</p>
      </main>
    );
  }

  if (invite.state !== 'pending') {
    return (
      <main className="auth-card">
        <h1>
          {invite.state === 'expired' ? 'This invite has expired' : 'This invite has been used'}
        </h1>
        <p>
          {invite.inviter_name} invited you to {invite.circle_name}. Invites work once and for
          seven days — ask {invite.inviter_name} for a new one and it will arrive the same way
          this one did. No account was created.
        </p>
      </main>
    );
  }

  const supabase = await asUser();
  const { data } = await supabase.auth.getClaims();
  const sessionEmail = typeof data?.claims?.email === 'string' ? data.claims.email : '';
  const isInvitedIdentity =
    sessionEmail !== '' && sessionEmail.toLowerCase() === invite.invited_email.toLowerCase();
  const acceptPath = `/accept/${token}`;
  const signInHref = `/sign-in?next=${encodeURIComponent(acceptPath)}`;

  return (
    <main className="auth-card">
      <h1>{invite.circle_name}</h1>
      <p>
        {invite.inviter_name} is inviting you into {invite.circle_name} — the shared record for{' '}
        {invite.subject_names.join(' and ')}.
      </p>
      <p className="field-label">What you&apos;ll be able to see</p>
      <TierCeiling tier={invite.tier} person="you" subjectNames={invite.subject_names} />

      {query.e === 'refused' && (
        <p className="notice">
          That didn&apos;t go through. The invite is bound to {invite.invited_email} — make sure
          you&apos;re signed in as that address, and that the invite is still current.
        </p>
      )}
      {query.e === 'slow' && (
        <p className="notice">That took too long to answer. Nothing is lost — try again.</p>
      )}

      {isInvitedIdentity ? (
        <form method="post" action={`/accept/${token}/submit`}>
          <Button type="submit">Accept and open the record</Button>
        </form>
      ) : sessionEmail ? (
        <div>
          <p className="notice">
            This invite was sent to <strong>{invite.invited_email}</strong>. You&apos;re signed
            in as {sessionEmail}. An invite opens a family&apos;s medical and financial records,
            so accepting means signing in as the address it was sent to.
          </p>
          <p>
            <a className="button-primary" href={signInHref}>
              Sign in as {invite.invited_email}
            </a>
          </p>
        </div>
      ) : (
        <div>
          <p>
            This invite is for <span className="mono-address">{invite.invited_email}</span>.
          </p>
          <p>
            <a className="button-primary" href={`/create-account?invite=${token}`}>
              Create your account
            </a>
          </p>
          <p className="auth-meta">
            Already have an account? <a href={signInHref}>Sign in</a>
          </p>
        </div>
      )}
    </main>
  );
}
