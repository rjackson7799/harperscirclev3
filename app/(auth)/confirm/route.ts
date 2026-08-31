import { asUser } from '@/lib/db/user';
import { redirect303 } from '@/lib/auth/http';
import { readLiveSession } from '@/lib/auth/session';
import { faultText, isAuthenticationAnswer } from '@/lib/auth/session-outcome';
import { decodeTrustedAccessToken } from '@/lib/auth/claims';
import { sessionUnavailablePage } from '@/lib/http/session-unavailable';
import { activateForwardingAfterVerification } from '@/lib/hc/ingest';
import type { RequestClaims } from '@/lib/db';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * GET /confirm — where every emailed auth link lands (TSD §5.5).
 * Handles both link styles GoTrue emits: token_hash (+type) and the PKCE
 * ?code= exchange. Establishes the session, then routes by flow:
 * recovery → the new-password form; verification → the account's
 * verified state. Failures land on the state screens with the §4.1.7
 * expired-link treatment.
 *
 * 7B B1 · OW-18 (ADR-0028 D15 item 4) — THIS ROUTE NEVER CLAIMS SUCCESS FOR
 * A PASS THAT DID NOT RUN. The founder's verification is the one lifecycle
 * moment that activates the forwarding addresses (4B B6 / FWD-01), and it
 * read the session through the two-outcome gate: an auth-server fault after
 * a successful verification became null, the activation was SKIPPED, and
 * the person landed on `?verified=1` — "Everything is on" — with nothing
 * on. The same class one step earlier: `ok = !error` on verifyOtp made a
 * dead socket read as an expired link, though the token was NOT consumed.
 *
 * The three outcomes, read at both steps:
 *   · verification FAULT ⇒ 503 with a retry of THIS link (the token stands);
 *   · verification REFUSED (an authentication answer) ⇒ link-expired;
 *   · verified ⇒ the claims come from the session GoTrue just handed back
 *     (decodeTrustedAccessToken: server-to-server, the step-up route's own
 *     trust), so no second round-trip can go unavailable; only when GoTrue
 *     returns no session is the live read made, and `unavailable` there is
 *     a retry, never success;
 *   · the activation pass THROWS ⇒ `?verified=1&forwarding=failed`, and the
 *     account page offers to run it again. Idempotent, per-subject quiet
 *     refusals — never a reason to fail the verification itself.
 */
type Verification = 'refused' | { fault: string } | { session: { access_token?: string } | null };

async function verify(
  supabase: Awaited<ReturnType<typeof asUser>>,
  tokenHash: string | null,
  type: EmailOtpType | null,
  code: string | null,
): Promise<Verification> {
  try {
    const res =
      tokenHash && type
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        : code
          ? await supabase.auth.exchangeCodeForSession(code)
          : null;
    if (!res) return 'refused';
    if (res.error) {
      return isAuthenticationAnswer(res.error) ? 'refused' : { fault: faultText(res.error) };
    }
    return { session: res.data?.session ?? null };
  } catch (err) {
    return { fault: faultText(err) };
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');
  const flow = url.searchParams.get('flow') ?? type ?? '';

  const supabase = await asUser();
  const verified = await verify(supabase, tokenHash, type, code);

  if (verified === 'refused') {
    return redirect303(req, flow === 'recovery' ? '/reset?e=session' : '/sign-in?e=link-expired');
  }
  if ('fault' in verified) {
    // The token was not consumed: the honest answer is the same link again.
    console.error(`confirm: the verification could not be made — ${verified.fault}`);
    return sessionUnavailablePage(`${url.pathname}${url.search}`);
  }
  if (flow === 'recovery') {
    return redirect303(req, '/reset/confirm');
  }

  // signup / email verification: the mirror has already flipped
  // accounts.email_verified_at via the 2A trigger. §5.1's lifecycle
  // moment rides here (4B B6/FWD-01): the founder's verification is
  // what activates the forwarding addresses.
  let claims: RequestClaims;
  if (verified.session?.access_token) {
    claims = decodeTrustedAccessToken(verified.session.access_token);
  } else {
    const read = await readLiveSession(supabase);
    if (read.kind === 'unavailable') {
      console.error(`confirm: verified, but the session could not be READ — ${read.why}`);
      return sessionUnavailablePage('/account');
    }
    if (read.kind === 'signed-out') return redirect303(req, '/sign-in?next=%2Faccount');
    claims = read.claims;
  }

  try {
    await activateForwardingAfterVerification(claims);
  } catch (err) {
    console.error(`confirm: forwarding activation pass failed: ${(err as Error).message}`);
    return redirect303(req, '/account?verified=1&forwarding=failed');
  }
  return redirect303(req, '/account?verified=1');
}
