import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Reset confirm — reached from the emailed link via /confirm, holding a
 * live recovery session. One field, the plain-language floor (§4.1.7).
 */
export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const e = typeof params.e === 'string' ? params.e : '';

  return (
    <main className="auth-card">
      <h1>Choose a new password</h1>

      {e === 'password-length' && (
        <p className="notice">
          Use at least 10 characters — a short sentence works well. No digits or punctuation
          required.
        </p>
      )}
      {e === 'retry' && <p className="notice">That didn&apos;t save. Try once more.</p>}
      {e === 'slow' && (
        <p className="notice">That took too long to save. Nothing is lost — try once more.</p>
      )}

      <form method="post" action="/reset/confirm/submit">
        <Field label="New password" help="At least 10 characters.">
          <Input type="password" name="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Button type="submit">Save the new password</Button>
      </form>
    </main>
  );
}
