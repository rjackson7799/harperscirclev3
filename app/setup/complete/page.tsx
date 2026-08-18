import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { completionPromises, custodianshipLine } from '@/lib/setup/completion-copy';
import { CopyButton } from './copy-button';
import { liveSessionClaims } from '@/lib/auth/session';

const FORWARDING_DOMAIN = 'harperscircle.app';

/**
 * All set — the completion screen (PRD §4.1.3; AC-AUTH-5: names ONLY
 * surfaces Phase 1 built — no checklist, no local resources, no brief).
 * Per subject: name, where they are, their forwarding address with a
 * copy control (ADR-0011), labelled unmistakably; inactive with the
 * one-line reason and a resend control while unverified. One invite
 * affordance, disabled with a plain reason if unverified (AC-AUTH-4's
 * surface half). The §7.5 custodianship line, saying the smaller true
 * thing. One instruction. Nothing else.
 */
export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const circleId = typeof params.circle === 'string' ? params.circle : '';

  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) redirect('/sign-in?next=%2Fsetup');
  if (!circleId) redirect('/setup');

  const [{ data: subjects }, { data: account }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, first_name, situation, forwarding_local_part')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('email, email_verified_at')
      .eq('id', claims!.sub!)
      .single(),
  ]);

  if (!subjects || subjects.length === 0) redirect('/setup');
  const verified = Boolean(account?.email_verified_at);

  return (
    <main className="setup-card">
      <h1>All set</h1>

      {subjects.map((s) => {
        const address = `${s.forwarding_local_part}@${FORWARDING_DOMAIN}`;
        return (
          <div className="subject-block" key={s.id}>
            <h2>{s.first_name}</h2>
            <p>
              {s.situation}. {s.first_name}&apos;s forwarding address:
            </p>
            <p>
              <span className="mono-address">{address}</span> <CopyButton value={address} />
            </p>
            {!verified && (
              <p className="notice">{completionPromises.inactiveReason(s.first_name)}</p>
            )}
            <p className="auth-meta">{custodianshipLine(s.first_name)}</p>
          </div>
        );
      })}

      {!verified && account?.email && (
        <form method="post" action="/verify-email/submit">
          <input type="hidden" name="email" value={account.email} />
          <button type="submit" className="button-secondary">
            Resend the verification email
          </button>
        </form>
      )}

      <div className="subject-block">
        {verified ? (
          <p>
            <a className="button-primary" href={`/${circleId}/invite`}>
              Invite someone
            </a>
          </p>
        ) : (
          <p className="auth-meta">{completionPromises.inviteDisabledReason}</p>
        )}
        <p>{completionPromises.instruction}</p>
      </div>
    </main>
  );
}
