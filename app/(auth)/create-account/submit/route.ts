import { asUser } from '@/lib/db/user';
import { abortAccountCreation, bootstrapAccount, unconfirmEmail } from '@/lib/hc/accounts';
import { describeInvite } from '@/lib/hc/invites';
import { emailLinkOrigin, safeNext } from '@/lib/auth/redirect';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';

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

  // 7C C2 (OW-23): a person's wait answers inside the route budget. An
  // overrun that lands after signUp still runs the round-10 compensation
  // (the catch below aborts, THEN rethrows the budget error), so e=slow
  // never strands a half-made account; an overrun inside signUp itself
  // leaves at most the already-exists-unconfirmed class ADR-0015
  // enumerates, which a repeat submission handles.
  return withRouteBudget(
    async (budget) => {
      const supabase = await asUser();
      // The B9 fix: GoTrue's default confirmation link self-verifies at the
      // API and redirects to the site ROOT — /confirm (where the §5.1
      // forwarding-activation pass rides, B6/FWD-01) never ran. Both mails
      // land on /confirm?flow=signup; the origin follows the reset flow's
      // config-first rule (emailLinkOrigin — never the Host header).
      const linkOrigin = emailLinkOrigin(req);
      const confirmRedirect = linkOrigin ? `${linkOrigin}/confirm?flow=signup` : undefined;
      const { data, error } = await budget.race(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            ...(confirmRedirect ? { emailRedirectTo: confirmRedirect } : {}),
          },
        }),
        'signUp',
      );

      if (!error && data?.user?.id) {
        // The fresh branch crosses two systems; a failure after signUp must
        // not strand a partial state (round-10 finding 6). Compensation: the
        // just-created user is deleted — sessions die with it — so a repeat
        // submission starts clean. If even the abort fails, the route fails
        // LOUDLY; the residual states are enumerated in ADR-0015.
        try {
          await budget.race(unconfirmEmail(data.user.id), 'unconfirmEmail');
          // B8: the bootstrap rides hc.create_account as the fresh session's
          // OWN claims — keyed hc.uid(), no target parameter to aim elsewhere.
          await budget.race(
            bootstrapAccount({ sub: data.user.id, role: 'authenticated', email }, name),
            'bootstrapAccount',
          );
        } catch (cause) {
          console.error('create-account: flow failed after signUp; aborting the half-made account', cause);
          await abortAccountCreation(data.user.id);
          if ((cause as Error).name === 'AnswerBudgetExceeded') throw cause;
          return redirect303(req, `/create-account?e=retry${retryParams}`);
        }
      }
      // Both branches: for a fresh (now-unconfirmed) account this sends the
      // confirmation link; for an existing confirmed one GoTrue refuses —
      // the call pattern must not branch and the RESPONSE never reflects the
      // outcome, but a refusal is surfaced to the server log, not swallowed
      // (round-10 finding 6).
      const resent = await budget.race(
        supabase.auth
          .resend({
            type: 'signup',
            email,
            ...(confirmRedirect ? { options: { emailRedirectTo: confirmRedirect } } : {}),
          })
          .catch((err: unknown) => ({ error: err })),
        'resend',
      );
      if (resent?.error) {
        console.error('create-account: verification resend failed', resent.error);
      }

      return redirect303(req, next);
    },
    () => redirect303(req, `/create-account?e=slow${retryParams}`),
  );
}
