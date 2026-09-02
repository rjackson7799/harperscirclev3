import { asUser } from '@/lib/db/user';
import { recordSuccess } from '@/lib/hc/throttle';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';

/**
 * POST /reset/confirm/submit — completes recovery (TSD §5.5 row 3;
 * ADR-0013 F1). Requires the live recovery session the /confirm handler
 * established; sets the password and records reset_completed AS the
 * proven user — the identity-bound recorder, which clears the holder's
 * throttle state instantly (AC-AUTH-12's leave-within-the-hour path).
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const password = fields.password ?? '';

  // 7C C2 (OW-23): a person's wait answers inside the route budget.
  return withRouteBudget(
    async (budget) => {
      const supabase = await asUser();
      const { data, error } = await budget.race(supabase.auth.getClaims(), 'getClaims');
      const claims = data?.claims;
      if (error || !claims?.sub) {
        return redirect303(req, '/reset?e=session');
      }

      if (password.length < 10) {
        return redirect303(req, '/reset/confirm?e=password-length');
      }

      const { error: updateError } = await budget.race(
        supabase.auth.updateUser({ password }),
        'updateUser',
      );
      if (updateError) {
        return redirect303(req, '/reset/confirm?e=retry');
      }

      await budget.race(recordSuccess('reset_completed', { ...claims }), 'recordSuccess');
      return redirect303(req, '/setup?reset=done');
    },
    () => redirect303(req, '/reset/confirm?e=slow'),
  );
}
