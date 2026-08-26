import 'server-only';
import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestClaims } from '@/lib/db';

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
 * and null is the shape of "there is no session". Twenty call sites read it
 * that way: twelve pages redirect to /sign-in and eight routes refuse. So an
 * auth server that stalls, a gateway that 502s, and a rate limit each signed a
 * family out of their own record during an availability incident.
 *
 * This is the SAME defect the artifact route fixed one layer up in round 18
 * (ADR-0027 D2) — "a session the route could not READ in time is not a session
 * that does not exist, and the difference is the only thing the caller needs:
 * WHETHER TO TRY AGAIN." That fix bounded the wait. It could not tell the
 * caller WHY, because this function had already thrown the reason away.
 *
 * THE RULE: ONLY AN AUTHENTICATION ANSWER MEANS SIGNED OUT. A fault is not an
 * authentication answer, and neither is silence.
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
 * An authentication answer, or a fault? Only the first may sign anybody out.
 *
 * `AuthSessionMissingError` and a 4xx from GoTrue are the auth server telling
 * us about the session. Everything else — a fetch that failed
 * (`AuthRetryableFetchError` is what supabase-js wraps a dead socket in), a
 * 5xx from Kong or GoTrue, a 429, and anything unclassifiable — is the auth
 * server failing to tell us anything at all.
 *
 * 429 is called out because it is the most tempting to mis-file: a rate limit
 * arrives as a 4xx and reads like a refusal, but being throttled is not being
 * signed out, and `token_refresh = 150 / 5 min / IP` is shared by every
 * browser context a gate runs.
 */
function isAuthenticationAnswer(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  if (isAuthRetryableFetchError(error)) return false;
  if (isAuthApiError(error)) {
    const { status } = error;
    if (status === 429) return false;
    return status < 500;
  }
  return false;
}

function why(error: unknown): string {
  const e = error as { name?: string; status?: number; message?: string };
  return `${e?.name ?? 'Error'}${e?.status ? ` ${e.status}` : ''}: ${e?.message ?? String(error)}`;
}

/**
 * The gate, with its three outcomes intact. Callers that answer a person with
 * a status use THIS; `liveSessionClaims` below is the two-outcome shape the
 * page gates still take.
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
        : { kind: 'unavailable', why: why(res.error) };
    }
    userData = res.data;
  } catch (err) {
    return { kind: 'unavailable', why: why(err) };
  }
  if (!userData?.user) return { kind: 'signed-out' };

  // Round-trip two. Its error was being DISCARDED entirely, so a fault here
  // reached the call sites as a missing `sub` — signed-out, again.
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error && !isAuthenticationAnswer(error)) {
      return { kind: 'unavailable', why: why(error) };
    }
    const claims = data?.claims;
    if (!claims?.sub) return { kind: 'signed-out' };
    return { kind: 'signed-in', claims: { ...claims } as RequestClaims };
  } catch (err) {
    return { kind: 'unavailable', why: why(err) };
  }
}

/**
 * The two-outcome gate the twelve PAGE gates still take, unchanged in
 * contract: claims, or null. A fault still yields null here — a page has one
 * honest move and it is the sign-in redirect — but it is no longer SILENT.
 *
 * That log line is the instrument half of F-2. r2 could not say whether the
 * founder's session had been revoked or merely gone unread, because nothing
 * was written down; the round spent its budget on a refresh-token-rotation
 * hypothesis that the evidence then refuted. A gate must never have to guess
 * that again.
 *
 * OWED, and deliberately not taken here: the twelve pages themselves still
 * render an outage as a sign-in redirect. That is the same harm as the 401
 * this fixes, and the r2 gate did not observe it; changing twelve page gates
 * on an unobserved inference is a wider change than the finding supports.
 */
export async function liveSessionClaims(
  supabase: SupabaseClient,
): Promise<RequestClaims | null> {
  const read = await readLiveSession(supabase);
  if (read.kind === 'signed-in') return read.claims;
  if (read.kind === 'unavailable') {
    console.error(`session: the live session could not be READ — ${read.why}`);
  }
  return null;
}
