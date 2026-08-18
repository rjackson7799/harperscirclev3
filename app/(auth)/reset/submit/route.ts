import { asUser } from '@/lib/db/user';
import { formFields, redirect303 } from '@/lib/auth/http';

/**
 * POST /reset/submit — the recovery request (TSD §5.5 row 3; §5.6).
 *
 * Never throttle-gated: AC-AUTH-12 forbids blocking the email reset path,
 * so no hc.auth_throttle consult happens here (GoTrue's own mail rate
 * limits are the backstop). GoTrue silent-skips unknown addresses; this
 * route surfaces one answer for everyone.
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const email = (fields.email ?? '').trim();
  if (!email) return redirect303(req, '/reset?e=missing');

  const supabase = await asUser();
  const origin = new URL(req.url).origin;
  await supabase.auth
    .resetPasswordForEmail(email, { redirectTo: `${origin}/confirm?flow=recovery` })
    .catch(() => {});

  return redirect303(req, '/reset?sent=1');
}
