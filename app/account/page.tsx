import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';

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
  const claims = await liveSessionClaims(supabase);
  const sub = claims?.sub;
  if (!sub) redirect('/sign-in?next=%2Faccount');

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

        {params.verified === '1' && (
          <p className="notice notice-positive">Your email is verified. Everything is on.</p>
        )}

        {verified ? (
          <p className="auth-meta">Email verified.</p>
        ) : (
          <div className="notice">
            Verify your email to switch on the forwarding addresses and invites. The link is in
            your mail.
            <form method="post" action="/verify-email/submit" style={{ marginTop: 8 }}>
              <input type="hidden" name="email" value={account?.email ?? ''} />
              <button type="submit" className="button-secondary">
                Resend the verification email
              </button>
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
            <button type="submit" className="button-quiet">
              Sign out everywhere
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
