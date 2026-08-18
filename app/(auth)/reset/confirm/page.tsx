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

      <form method="post" action="/reset/confirm/submit">
        <label className="field">
          <span className="field-label">New password</span>
          <input type="password" name="password" autoComplete="new-password" required minLength={10} />
          <span className="field-help">At least 10 characters.</span>
        </label>
        <button type="submit" className="button-primary">
          Save the new password
        </button>
      </form>
    </main>
  );
}
