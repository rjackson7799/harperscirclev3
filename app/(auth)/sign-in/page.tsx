import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Sign in (TSD §5.5; PRD §4.1.7 states). Level copy for the throttle,
 * the wait, and the reset path — never alarm, never a permanent-sounding
 * word, and the reset link is always there (AC-AUTH-12's open door).
 */
function waitCopy(waitSeconds: number): string {
  if (waitSeconds >= 300) return 'about 15 minutes';
  if (waitSeconds >= 60) return 'a couple of minutes';
  return `${waitSeconds} seconds`;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const e = typeof params.e === 'string' ? params.e : '';
  const wait = Number(typeof params.wait === 'string' ? params.wait : '0') || 0;
  const next = typeof params.next === 'string' ? params.next : '';

  return (
    <main className="auth-card">
      <h1>Sign in</h1>

      {e === 'throttled' && (
        <p className="notice">
          After a few tries that didn&apos;t match, we ask for a short wait — {waitCopy(wait)}
          {wait > 0 ? ` (${wait} seconds)` : ''} before the next try. You can{' '}
          <a href="/reset">reset your password by email</a> at any time; that path never waits.
        </p>
      )}
      {e === 'nomatch' && (
        <p className="notice">
          That email and password didn&apos;t match. If you already have an account, you can{' '}
          <a href="/reset">reset your password by email</a>. It&apos;s the same message either
          way — we never say whether an address has an account.
        </p>
      )}
      {e === 'unverified' && (
        <div className="notice">
          Your password is right, but this account&apos;s email hasn&apos;t been confirmed yet.
          The confirmation link is in your mail — click it, then sign in here.
          <form method="post" action="/verify-email/submit" style={{ marginTop: 8 }}>
            <input type="hidden" name="next" value={next} />
            <Field label="Send the confirmation again">
              <Input type="email" name="email" required placeholder="you@example.com" />
            </Field>
            <Button type="submit" variant="secondary">
              Resend the confirmation link
            </Button>
          </form>
        </div>
      )}
      {e === 'missing' && <p className="notice">Both the email and the password are needed.</p>}
      {e === 'slow' && (
        <p className="notice">That took too long to answer. Nothing is lost — try again.</p>
      )}

      <form method="post" action="/sign-in/submit">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Email">
          <Input type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input type="password" name="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit">Sign in</Button>
      </form>

      <p className="auth-meta">
        <a href="/reset">Forgot your password?</a>
      </p>
      <p className="auth-meta">
        New here? <a href="/create-account">Create an account</a>
      </p>
    </main>
  );
}
