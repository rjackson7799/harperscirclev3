import { asUser } from '@/lib/db/user';
import {
  consultThrottle,
  noteSuspiciousAttempts,
  recordFailure,
  recordSuccess,
} from '@/lib/hc/throttle';
import { mintStepUp } from '@/lib/hc/step-up';
import { decodeTrustedAccessToken } from '@/lib/auth/claims';
import { nextWithMarkers, safeNext } from '@/lib/auth/redirect';
import { formFields, redirect303 } from '@/lib/auth/http';

/**
 * POST /account/step-up/submit — the THIRD and last password path the
 * app exposes (ADR-0013 F1; TSD §5.7). Same order as sign-in: consult
 * hc.auth_throttle BEFORE GoTrue, record either outcome. The re-auth
 * mints a FRESH session whose amr hc.mint_step_up requires (≤ 300 s),
 * and the minted token rides a five-minute HttpOnly cookie to the
 * consuming operation's form — the operations that consume it (§5.7's
 * list) ship with their surfaces' slices.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  const { data: session } = await supabase.auth.getClaims();
  const email = typeof session?.claims?.email === 'string' ? session.claims.email : '';
  if (!email) return redirect303(req, '/sign-in?next=%2Faccount');

  const fields = await formFields(req);
  const password = fields.password ?? '';
  const operation = fields.operation ?? '';
  const targetRef = fields.target_ref || null;
  const next = safeNext(fields.next, '/account');

  // 7D · R3/F-2: COMPOSED, never concatenated. Every consumer's `next`
  // already carries a query, and `${next}?e=...` buried the marker inside
  // that query's last value — so the page it was addressed to never read it.
  if (!password || !operation) {
    return redirect303(req, nextWithMarkers(next, { e: 'missing' }));
  }

  const throttle = await consultThrottle(email);
  if (throttle.wait_seconds > 0) {
    return redirect303(
      req,
      nextWithMarkers(next, { e: 'throttled', wait: String(throttle.wait_seconds) }),
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    await recordFailure(email);
    await noteSuspiciousAttempts(email);
    return redirect303(req, nextWithMarkers(next, { e: 'nomatch' }));
  }

  const freshClaims = decodeTrustedAccessToken(data.session.access_token);
  await recordSuccess('success', freshClaims);
  const { token } = await mintStepUp(freshClaims, operation, targetRef);

  const response = redirect303(req, next);
  response.headers.append(
    'set-cookie',
    `hc-step-up=${token}; Path=/; Max-Age=300; HttpOnly; SameSite=Lax`,
  );
  return response;
}
