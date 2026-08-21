import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { logSignOut } from '@/lib/hc/accounts';
import { redirect303 } from '@/lib/auth/http';

/**
 * POST /account/sign-out-everywhere (TSD §5.5; AC-AUTH-10 — BOTH
 * halves as of 4B B8, APP-09b): the signed_out access-log entry rides
 * hc.log_sign_out FIRST (zero parameters, actor = hc.uid(), one
 * circle-level entry per live membership — the claims must still
 * authenticate the channel, so the entry precedes the kill), then
 * GoTrue's global scope destroys every session and refresh token; the
 * E2E verifies from a second browser within seconds.
 *
 * Sign-out is never refused: a failed log entry is surfaced to the
 * operational log and the kill proceeds — the member's control over
 * their own sessions outranks the trail's completeness, and the DB half
 * (043) already pins that zero memberships log a quiet zero.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  try {
    const claims = await liveSessionClaims(supabase);
    if (claims?.sub) await logSignOut(claims);
  } catch (err) {
    console.error(`sign-out-everywhere: signed_out entry failed: ${(err as Error).message}`);
  }
  await supabase.auth.signOut({ scope: 'global' });
  return redirect303(req, '/sign-in?bye=1');
}
