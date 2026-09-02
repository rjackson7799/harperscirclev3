import { describeInvite } from '@/lib/hc/invites';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Create account (PRD §4.1.3 row 1): name, email, password — and the
 * value proposition and privacy statement ON this screen, not in a
 * footer. Password guidance is plain language (§4.1.7): ten characters,
 * checked against known breached lists, no composition rules.
 *
 * The invitee variant (§4.1.4): with ?invite=<token>, the invited
 * address is displayed fixed — three typed fields become two — and the
 * submit derives the address from the token server-side, so the fixed
 * display is enforcement, not decoration.
 */
export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const e = typeof params.e === 'string' ? params.e : '';
  const next = typeof params.next === 'string' ? params.next : '';
  const inviteToken = typeof params.invite === 'string' ? params.invite : '';
  const invite = inviteToken ? await describeInvite(inviteToken) : null;
  const invitedEmail = invite?.state === 'pending' ? invite.invited_email : '';

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
      {e === 'slow' && (
        <p className="notice">That took too long to answer. Nothing is lost — try again.</p>
      )}
      {e === 'email' && <p className="notice">That email address doesn&apos;t look complete.</p>}
      {e === 'retry' && (
        <p className="notice">
          Something went wrong on our side and nothing was saved. Please try again — the same
          details are fine.
        </p>
      )}

      <form method="post" action="/create-account/submit">
        {next && <input type="hidden" name="next" value={next} />}
        {invitedEmail && <input type="hidden" name="invite" value={inviteToken} />}
        <Field label="Your name">
          <Input name="name" autoComplete="name" required />
        </Field>
        {invitedEmail ? (
          <div className="field">
            <span className="field-label">Email</span>
            <span className="mono-address">{invitedEmail}</span>
            <span className="field-help">
              The invite is bound to this address, so it can&apos;t be changed here.
            </span>
          </div>
        ) : (
          <Field label="Email">
            <Input type="email" name="email" autoComplete="email" required />
          </Field>
        )}
        <Field label="Password" help="At least 10 characters. A short sentence works well.">
          <Input type="password" name="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Button type="submit">Create account</Button>
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
