import { asUser } from '@/lib/db/user';
import { redirect303 } from '@/lib/auth/http';
import { liveSessionClaims } from '@/lib/auth/session';
import { activateForwardingAfterVerification } from '@/lib/hc/ingest';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * GET /confirm — where every emailed auth link lands (TSD §5.5).
 * Handles both link styles GoTrue emits: token_hash (+type) and the PKCE
 * ?code= exchange. Establishes the session, then routes by flow:
 * recovery → the new-password form; verification → the account's
 * verified state. Failures land on the state screens with the §4.1.7
 * expired-link treatment.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const flow = url.searchParams.get('flow') ?? type ?? '';

  const supabase = await asUser();

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    return redirect303(req, flow === 'recovery' ? '/reset?e=session' : '/sign-in?e=link-expired');
  }
  if (flow === 'recovery') {
    return redirect303(req, '/reset/confirm');
  }
  // signup / email verification: the mirror has already flipped
  // accounts.email_verified_at via the 2A trigger. §5.1's lifecycle
  // moment rides here (4B B6/FWD-01): the founder's verification is
  // what activates the forwarding addresses — idempotent, per-subject
  // quiet refusals, never a reason to fail the verification itself.
  try {
    const claims = await liveSessionClaims(supabase);
    if (claims?.sub) await activateForwardingAfterVerification(claims);
  } catch (err) {
    console.error(`confirm: forwarding activation pass failed: ${(err as Error).message}`);
  }
  return redirect303(req, '/account?verified=1');
}
