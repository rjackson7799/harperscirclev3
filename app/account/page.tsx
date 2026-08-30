import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { Button } from '@/components/ui/Button';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';

/**
 * Account (PRD §4.1.6, narrowed by the kickoff): the verify-email state
 * with its resend control — "Verify your email to switch on the
 * forwarding addresses", visible not modal (§4.1.2) — and sign out
 * everywhere. Export, deletion, change-password and leave-circle arrive
 * with their own slices (coverage DEL-01/G5).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, '/account');
  if (gate.kind === 'unavailable') {
    return (
      <div className="auth-shell">
        <div className="auth-wordmark">Harper&apos;s Circle</div>
        <main className="auth-card">
          <h1>Account</h1>
          <SessionUnavailable next="/account" />
        </main>
      </div>
    );
  }
  const sub = gate.claims.sub;

  const { data: account } = await supabase
    .from('accounts')
    .select('email, email_verified_at, display_name')
    .eq('id', sub)
    .single();

  const verified = Boolean(account?.email_verified_at);

  return (
    <div className="auth-shell">
      <div className="auth-wordmark">Harper&apos;s Circle</div>
      <main className="auth-card">
        <h1>Account</h1>
        <p>
          {account?.display_name} · <span className="mono-address">{account?.email}</span>
        </p>

        {params.verified === '1' && params.forwarding !== 'failed' && (
          <p className="notice notice-positive">Your email is verified. Everything is on.</p>
        )}
        {/* 7B B1 · OW-18: "everything is on" is claimed only when the
            activation pass ran. When it did not, say what is on and what is
            not, and offer the pass again — it is idempotent. */}
        {params.verified === '1' && params.forwarding === 'failed' && (
          <div className="notice" role="alert">
            Your email is verified. Switching on the forwarding addresses didn&apos;t finish just
            now — nothing is lost, and you can try again.
            <form method="post" action="/account/activate-forwarding/submit" style={{ marginTop: 8 }}>
              <Button type="submit" variant="secondary">
                Switch on the forwarding addresses
              </Button>
            </form>
          </div>
        )}
        {params.forwarding === 'on' && (
          <p className="notice notice-positive">The forwarding addresses are on.</p>
        )}

        {verified ? (
          <p className="auth-meta">Email verified.</p>
        ) : (
          <div className="notice">
            Verify your email to switch on the forwarding addresses and invites. The link is in
            your mail.
            <form method="post" action="/verify-email/submit" style={{ marginTop: 8 }}>
              <input type="hidden" name="email" value={account?.email ?? ''} />
              <Button type="submit" variant="secondary">
                Resend the verification email
              </Button>
            </form>
          </div>
        )}

        <div className="subject-block">
          <h2>Sign out everywhere</h2>
          <p>
            Ends every session on every device, including this one, within seconds. Sign back
            in with your password.
          </p>
          <form method="post" action="/account/sign-out-everywhere">
            <Button type="submit" variant="quiet">
              Sign out everywhere
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
