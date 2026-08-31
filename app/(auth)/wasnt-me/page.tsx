import { Button } from '@/components/ui/Button';

/**
 * The "this wasn't me" confirmation page (TSD §5.11; PRD §4.1.7).
 *
 * GET renders and does NOTHING else — corporate mail scanners pre-fetch
 * links, so no call that could consume the token happens on render.
 * Destruction rides only the explicit POST from the form below.
 */
export default async function WasntMePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  if (params.done === '1') {
    return (
      <main className="auth-card">
        <h1>Every signed-in session has been ended</h1>
        <p>
          Whoever was signed in — on any device — is signed out now, and the old password no
          longer works. Set a new one from the reset link below, using the email address this
          notice was sent to.
        </p>
        <p>
          <a href="/reset">Choose a new password</a>
        </p>
      </main>
    );
  }

  if (params.e === 'slow') {
    return (
      <main className="auth-card">
        <h1>That took too long to confirm</h1>
        <p>
          Try the link once more. If it already worked, every session is being signed out and
          the link will simply say it is no longer valid.
        </p>
      </main>
    );
  }

  if (params.e === 'link-invalid' || !token) {
    return (
      <main className="auth-card">
        <h1>This link is no longer valid</h1>
        <p>
          It may have expired — these links work for 15 minutes and only once. If you still
          want to secure the account, reset the password instead.
        </p>
        <p>
          <a href="/reset">Reset the password</a>
        </p>
      </main>
    );
  }

  return (
    <main className="auth-card">
      <h1>Was this you?</h1>
      <p>
        We noticed repeated sign-in attempts. If it wasn&apos;t you, confirm below: we&apos;ll
        end every signed-in session on every device and require a new password. Nothing happens
        until you choose.
      </p>
      <form method="post" action="/wasnt-me/submit">
        <input type="hidden" name="token" value={token} />
        <Button type="submit">End every signed-in session</Button>
      </form>
      <p className="auth-meta">If this was you, you can close this page — nothing changes.</p>
    </main>
  );
}
