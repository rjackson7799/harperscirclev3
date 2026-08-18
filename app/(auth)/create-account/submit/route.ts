import { asUser } from '@/lib/db/user';
import { bootstrapAccount, unconfirmEmail } from '@/lib/hc/accounts';
import { describeInvite } from '@/lib/hc/invites';
import { safeNext } from '@/lib/auth/redirect';
import { formFields, redirect303 } from '@/lib/auth/http';

/**
 * POST /create-account/submit (TSD §5.5; PRD §4.1.2–§4.1.3, §4.1.7).
 *
 * The settled verification model (parity doc): public signUp mints the
 * unverified founder's ONLY possible session (this GoTrue gates password
 * sign-in on confirmation unconditionally), then the boundary immediately
 * corrects autoconfirm's stamp so verification truth stays real for
 * AC-AUTH-4 and forwarding activation — strictly BEFORE the accounts
 * bootstrap, whose insert mirror reads it. The verification mail rides
 * GoTrue's resend in both branches.
 *
 * Non-enumeration: validation precedes GoTrue; fresh and already-exists
 * answer the same status + Location + body, and the "already registered"
 * distinction is delivered by mail, not by this response (§5.5). The one
 * necessarily-divergent channel — Set-Cookie on the fresh branch — is the
 * recorded §5.5 deviation (parity doc; round 10 re-sees it).
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const name = (fields.name ?? '').trim();
  let email = (fields.email ?? '').trim();
  const password = fields.password ?? '';
  let next = safeNext(fields.next, '/setup');

  // The invitee variant (PRD §4.1.4): the address is the TOKEN's, derived
  // server-side — a submitted email field is ignored, so the pre-filled,
  // not-editable address is enforcement, not decoration.
  const inviteToken = fields.invite ?? '';
  if (inviteToken) {
    const invite = await describeInvite(inviteToken);
    if (!invite || invite.state !== 'pending') {
      return redirect303(req, `/accept/${encodeURIComponent(inviteToken)}`);
    }
    email = invite.invited_email;
    next = `/accept/${inviteToken}`;
  }
  const nextParam = next === '/setup' ? '' : `&next=${encodeURIComponent(next)}`;
  const retryParams = `${nextParam}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''}`;

  if (!name) return redirect303(req, `/create-account?e=name${retryParams}`);
  if (!email.includes('@')) return redirect303(req, `/create-account?e=email${retryParams}`);
  if (password.length < 10) {
    return redirect303(req, `/create-account?e=password-length${retryParams}`);
  }

  const supabase = await asUser();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  });

  if (!error && data?.user?.id) {
    await unconfirmEmail(data.user.id);
    await bootstrapAccount(data.user.id, name);
  }
  // Both branches: for a fresh (now-unconfirmed) account this sends the
  // confirmation link; for an existing confirmed one GoTrue refuses and
  // the refusal is swallowed — the call pattern must not branch.
  await supabase.auth.resend({ type: 'signup', email }).catch(() => {});

  return redirect303(req, next);
}
