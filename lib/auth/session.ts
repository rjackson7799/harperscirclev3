import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestClaims } from '@/lib/db';
import { faultText, isAuthenticationAnswer } from './session-outcome';

/**
 * The page gate (AC-AUTH-10, AC-PERM-3). getClaims() validates a JWT
 * locally — fast, but a global sign-out or an admin revocation must bite
 * "within seconds, verified from a second browser", and a stateless
 * check can't see a dead session. So signed-in PAGES gate through
 * getUser(), which GoTrue validates against the live session store; the
 * claims ride along for the request-role channel. Record data never
 * relies on this — RLS is the enforcement (§5.5) — this closes the
 * page-shell channel at the session store.
 *
 * ROUND-19 F-2 — AND IT MUST NOT RENDER AN OUTAGE AS A SIGN-OUT.
 *
 * Gate run r2 refused the founder's upload with `401 sign in first` at 22:01,
 * six minutes after the session was provisioned. It was not revoked and it had
 * not expired (jwt_expiry = 3600). SIX SECONDS EARLIER the same session
 * rendered /upload at 200 — a page that REDIRECTS when claims are null — and a
 * revoked session cannot un-revoke. What the trace actually shows is the shape
 * of the fault: the refused call took 24.3 SECONDS. Nothing about "you are not
 * signed in" takes twenty-four seconds; that is a read that could not be made,
 * answered as a fact about the reader.
 *
 * The collapse was one line — `if (error || !userData?.user) return null` —
 * and null is the shape of "there is no session". ADR-0028 D15 counted the
 * sites that read it that way: TWENTY-ONE — 3 refuse with a status (the
 * artifact route, upload/token, upload/complete) · 10 pages redirect to
 * /sign-in · 5 form routes redirect exactly as the pages do · 1 layout
 * degrades · 2 do not gate at all. So an auth server that stalls, a gateway
 * that 502s, and a rate limit each signed a family out of their own record
 * during an availability incident.
 *
 * [7B B1 · OW-15: this paragraph read "Twenty call sites … twelve pages
 * redirect to /sign-in and eight routes refuse" until D15 corrected the
 * enumeration; the product code did not follow until now.]
 *
 * This is the SAME defect the artifact route fixed one layer up in round 18
 * (ADR-0027 D2) — "a session the route could not READ in time is not a session
 * that does not exist, and the difference is the only thing the caller needs:
 * WHETHER TO TRY AGAIN." That fix bounded the wait. It could not tell the
 * caller WHY, because this function had already thrown the reason away.
 *
 * THE RULE: ONLY AN AUTHENTICATION ANSWER MEANS SIGNED OUT. A fault is not an
 * authentication answer, and neither is silence. The classifier lives in
 * ./session-outcome.ts so the request proxy can share it.
 */

/**
 * What reading the live session actually established. Three outcomes, because
 * there are three facts — and the third one is the one r2 could not name.
 */
export type SessionRead =
  /** The auth server vouched for a live session. */
  | { kind: 'signed-in'; claims: RequestClaims }
  /** The auth server ANSWERED, and the answer is that there is no session. */
  | { kind: 'signed-out' }
  /** No answer. Retryable, says nothing about whoever is asking. */
  | { kind: 'unavailable'; why: string };

/**
 * THE gate, with its three outcomes intact — and, since 7B B1, the ONLY gate.
 *
 * `liveSessionClaims` — the two-outcome shape the twelve, then ten, page
 * gates took: claims, or null, with `unavailable` collapsed onto null — is
 * GONE (OW-11, ADR-0028 D8 item 2). Its own comment had recorded the debt:
 * "the twelve pages themselves still render an outage as a sign-in redirect
 * … the same harm as the 401 this fixes … a wider change than the finding
 * supports." Round 24 changed the functions 7B calls and 7B adds pages to
 * the gate, so the gate is fixed once, before any new page uses it. Pages
 * and form routes now go through lib/auth/gate.ts (`gatePage`, `gateRoute`),
 * which read all three outcomes and cannot drop the third by construction;
 * tests/app/page-gate.test.ts pins every site on disk to that.
 */
export async function readLiveSession(supabase: SupabaseClient): Promise<SessionRead> {
  // Round-trip one: the live session store. A throw here is a fault by
  // definition — the client raises rather than returns only when something
  // outside its own error taxonomy went wrong.
  let userData: { user?: unknown } | null | undefined;
  try {
    const res = await supabase.auth.getUser();
    if (res.error) {
      return isAuthenticationAnswer(res.error)
        ? { kind: 'signed-out' }
        : { kind: 'unavailable', why: faultText(res.error) };
    }
    userData = res.data;
  } catch (err) {
    return { kind: 'unavailable', why: faultText(err) };
  }
  if (!userData?.user) return { kind: 'signed-out' };

  // Round-trip two. Its error was being DISCARDED entirely, so a fault here
  // reached the call sites as a missing `sub` — signed-out, again.
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error && !isAuthenticationAnswer(error)) {
      return { kind: 'unavailable', why: faultText(error) };
    }
    const claims = data?.claims;
    if (!claims?.sub) return { kind: 'signed-out' };
    return { kind: 'signed-in', claims: { ...claims } as RequestClaims };
  } catch (err) {
    return { kind: 'unavailable', why: faultText(err) };
  }
}
