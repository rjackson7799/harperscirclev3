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
  // The recovery link's destination comes from CONFIGURATION, never the
  // request — a forged Host must not steer where the emailed token lands
  // (reset poisoning). Local dev falls back to its own loopback origin;
  // anywhere else without config, redirectTo is omitted and GoTrue's
  // site_url allowlist is the destination — a neutered link, never a
  // poisoned one.
  const requestOrigin = new URL(req.url).origin;
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (/^https?:\/\/(localhost|127\.)/.test(requestOrigin) ? requestOrigin : undefined);
  await supabase.auth
    .resetPasswordForEmail(
      email,
      origin ? { redirectTo: `${origin}/confirm?flow=recovery` } : undefined,
    )
    .catch(() => {});

  return redirect303(req, '/reset?sent=1');
}
