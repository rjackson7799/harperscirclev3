import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Reset request (TSD §5.5 row 3). The sent state is one sentence, the
 * same for everyone — whether the address has an account is delivered by
 * mail, never by this screen (§5.5).
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const sent = params.sent === '1';
  const e = typeof params.e === 'string' ? params.e : '';

  return (
    <main className="auth-card">
      <h1>Reset your password</h1>

      {sent && (
        <p className="notice notice-positive">
          Sent. If that address has an account, a reset link is on its way — it works once and
          for 30 minutes.
        </p>
      )}
      {e === 'missing' && <p className="notice">Enter the email address you use here.</p>}
      {e === 'slow' && (
        <p className="notice">That took too long to answer. Nothing is lost — try again.</p>
      )}
      {e === 'session' && (
        <p className="notice">
          That reset link has done its 30 minutes. Request a fresh one below.
        </p>
      )}

      <form method="post" action="/reset/submit">
        <Field label="Email">
          <Input type="email" name="email" autoComplete="email" required />
        </Field>
        <Button type="submit">Email me a reset link</Button>
      </form>

      <p className="auth-meta">
        <a href="/sign-in">Back to sign in</a>
      </p>
    </main>
  );
}
