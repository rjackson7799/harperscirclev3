import { cookies, headers } from 'next/headers';
import { CopyButton } from '@/app/setup/complete/copy-button';

/**
 * The one-time invite link view (slice-2 delivery is copy-link; the
 * invite email is slice 11). The token arrives in a 120-second HttpOnly
 * cookie from the submit — it was returned by the DB exactly once and is
 * shown here exactly once; a revisit after the cookie dies shows the
 * plain explanation, and a lost link means issuing a fresh invite.
 */
export default async function InviteCreatedPage({
  params,
}: {
  params: Promise<{ circle: string }>;
}) {
  const { circle } = await params;
  const store = await cookies();
  const token = store.get('hc-invite-token')?.value ?? '';

  if (!token) {
    return (
      <div className="auth-card">
        <h1>That link has left the building</h1>
        <p>
          For safety the invite link is shown only once, right after it&apos;s created. If it
          wasn&apos;t copied, issue a fresh invite — the old one simply goes unused and
          expires in seven days.
        </p>
        <p>
          <a className="button-primary" href={`/${circle}/invite`}>
            Create another invite
          </a>
        </p>
      </div>
    );
  }

  // Origin comes from configuration, never from the request: a Host
  // header is caller-supplied, and this URL carries the invite token.
  // The host fallback exists for local dev only.
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const host = (await headers()).get('host') ?? '';
  const localHost = /^(localhost|127\.)/.test(host) ? `http://${host}` : '';
  const origin = configured ?? localHost;
  const acceptPath = origin ? `${origin}/accept/${token}` : `/accept/${token}`;

  return (
    <div className="auth-card">
      <h1>Hand them this link</h1>
      <p>
        It works once, for seven days, and only for the address you named. Send it the way
        you&apos;d actually reach them — text, email, however your family talks.
      </p>
      <p>
        <span className="mono-address">{acceptPath}</span> <CopyButton value={acceptPath} />
      </p>
      <p className="auth-meta">
        This is the only time the link is shown. The invite email itself arrives with a later
        slice; until then, you are the delivery.
      </p>
    </div>
  );
}
