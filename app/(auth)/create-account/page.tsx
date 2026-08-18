/**
 * Create account (PRD §4.1.3 row 1): name, email, password — and the
 * value proposition and privacy statement ON this screen, not in a
 * footer. Password guidance is plain language (§4.1.7): ten characters,
 * checked against known breached lists, no composition demands.
 */
export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const e = typeof params.e === 'string' ? params.e : '';
  const next = typeof params.next === 'string' ? params.next : '';

  return (
    <main className="auth-card">
      <h1>Create your account</h1>
      <p>
        One place for everything about the person you look after — mail, papers, appointments
        and the people helping — with every decision written down.
      </p>

      {e === 'password-length' && (
        <p className="notice">
          Use at least 10 characters — a short sentence works well. We don&apos;t require
          digits or punctuation, and we check it against lists of passwords that have leaked
          elsewhere.
        </p>
      )}
      {e === 'name' && <p className="notice">Tell us your name — it&apos;s how the family sees you.</p>}
      {e === 'email' && <p className="notice">That email address doesn&apos;t look complete.</p>}

      <form method="post" action="/create-account/submit">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="field">
          <span className="field-label">Your name</span>
          <input type="text" name="name" autoComplete="name" required />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" name="password" autoComplete="new-password" required minLength={10} />
          <span className="field-help">At least 10 characters. A short sentence works well.</span>
        </label>
        <button type="submit" className="button-primary">
          Create account
        </button>
      </form>

      <p className="auth-meta">
        Privacy, in one paragraph: what you put here belongs to your family. We never sell it,
        never advertise against it, and every access to it is written into a log your family
        can read and print. An account left unverified with content in it is warned and then
        removed after 30 days.
      </p>
      <p className="auth-meta">
        Already have an account? <a href="/sign-in">Sign in</a>
      </p>
    </main>
  );
}
