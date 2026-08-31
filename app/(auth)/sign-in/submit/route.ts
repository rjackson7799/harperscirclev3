import { asUser } from '@/lib/db/user';
import {
  consultThrottle,
  noteSuspiciousAttempts,
  recordFailure,
  recordSuccess,
} from '@/lib/hc/throttle';
import { decodeTrustedAccessToken } from '@/lib/auth/claims';
import { safeNext } from '@/lib/auth/redirect';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';

/**
 * POST /sign-in/submit — the F1 password path (ADR-0013; TSD §5.5–§5.6).
 *
 * Order is the contract: consult hc.auth_throttle BEFORE GoTrue sees the
 * password; record every outcome (failure as anon, success AS the proven
 * user); answer §4.1.7's states through byte-uniform redirects that echo
 * nothing GoTrue said. The throttle is existence-blind by 2A
 * construction, so neither the throttled nor the failed answer is an
 * oracle. `email_not_confirmed` is surfaced distinctly and safely: the
 * probed GoTrue verifies the password BEFORE its confirmation gate, so
 * that state is reachable only by the password holder (parity doc).
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const email = (fields.email ?? '').trim();
  const password = fields.password ?? '';
  const next = safeNext(fields.next, '/setup');
  const nextParam = next === '/setup' ? '' : `&next=${encodeURIComponent(next)}`;

  if (!email || !password) {
    return redirect303(req, `/sign-in?e=missing${nextParam}`);
  }

  // 7C C2 (OW-23, ruled ADR-0036 Q-B): a person's wait answers inside the
  // route budget, like every other one.
  return withRouteBudget(
    async (budget) => {
      const throttle = await budget.race(consultThrottle(email), 'consultThrottle');
      if (throttle.wait_seconds > 0) {
        return redirect303(req, `/sign-in?e=throttled&wait=${throttle.wait_seconds}${nextParam}`);
      }

      const supabase = await asUser();
      const { data, error } = await budget.race(
        supabase.auth.signInWithPassword({ email, password }),
        'signInWithPassword',
      );

      if (error || !data?.session) {
        if ((error as { code?: string } | null)?.code === 'email_not_confirmed') {
          // Password proven; the account simply is not verified yet. Not a
          // failure to record (nothing was guessed wrong) and not a state to
          // hide from the password holder.
          return redirect303(req, `/sign-in?e=unverified${nextParam}`);
        }
        await budget.race(recordFailure(email), 'recordFailure');
        await budget.race(noteSuspiciousAttempts(email), 'noteSuspiciousAttempts');
        return redirect303(req, `/sign-in?e=nomatch${nextParam}`);
      }

      await budget.race(
        recordSuccess('success', decodeTrustedAccessToken(data.session.access_token)),
        'recordSuccess',
      );
      return redirect303(req, next);
    },
    () => redirect303(req, `/sign-in?e=slow${nextParam}`),
  );
}
