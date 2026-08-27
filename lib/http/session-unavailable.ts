/**
 * ROUND-19 F-2 — the answer for "we could not read your session", as
 * distinct from "you are not signed in".
 *
 * Gate run r2's leg 35 died on `401 sign in first` from /api/upload/token,
 * 24.3 seconds after asking and six seconds after the same session rendered a
 * signed-in page. The session was live. A 401 is a statement about the CALLER
 * — that they are not who they say they are — and here it was false; the true
 * fact was about the auth server, which had not answered.
 *
 * The distinction is the artifact route's own (ADR-0027 D2), and it is the
 * only thing the caller actually needs: WHETHER TO TRY AGAIN. A 401 says no,
 * go and sign in. This says yes, in a moment.
 *
 * 503 rather than 504 deliberately: this covers a refused socket and a 502
 * from the gateway as well as a stall, and only some of those are timeouts.
 * `retry-after` is the machine-readable half of the same sentence.
 */

/**
 * Five seconds. Long enough that a retry is not simply the same instant of the
 * same incident, short enough that the person watching has not yet decided the
 * product is broken. It is a hint, not a bound — nothing enforces it.
 */
export const SESSION_UNAVAILABLE_RETRY_AFTER_S = 5;

/**
 * The ONE shape, so the three routes that can hit it cannot drift apart and
 * the screens can key off a single fact. `private, no-store` because this is a
 * per-caller transient and must never be cached as though it were the answer.
 */
export function sessionUnavailable(): Response {
  return Response.json(
    { error: 'session_unavailable' },
    {
      status: 503,
      headers: {
        'retry-after': String(SESSION_UNAVAILABLE_RETRY_AFTER_S),
        'cache-control': 'private, no-store',
      },
    },
  );
}
