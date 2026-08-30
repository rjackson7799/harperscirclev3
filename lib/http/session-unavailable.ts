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
 * The ONE set of headers, so nothing that answers this can drift: 503,
 * `retry-after`, and `private, no-store` because this is a per-caller
 * transient and must never be cached as though it were the answer.
 */
function unavailableHeaders(contentType: string): HeadersInit {
  return {
    'content-type': contentType,
    'retry-after': String(SESSION_UNAVAILABLE_RETRY_AFTER_S),
    'cache-control': 'private, no-store',
  };
}

/**
 * The API shape — the three routes a script calls (artifact, upload/token,
 * upload/complete) answer JSON, and the screens key off the one fact.
 */
export function sessionUnavailable(): Response {
  return new Response(JSON.stringify({ error: 'session_unavailable' }), {
    status: 503,
    headers: unavailableHeaders('application/json'),
  });
}

/**
 * The PERSON-FACING shape — 7B B1 (GTE-01, OW-11). A form route a browser
 * posted to, and the proxy in front of every gated page, answer a person,
 * not a script: the same status and headers, a page that says what happened
 * in the words components/ui/SessionUnavailable.tsx uses on-screen, and ONE
 * link back to where they were. `next` is a same-origin path the caller
 * already trusts (the page's own route); it is escaped anyway.
 */
export const SESSION_UNAVAILABLE_HEADLINE = "We couldn't check your sign-in just now.";
export const SESSION_UNAVAILABLE_BODY = 'Nothing has changed. This usually clears in a moment.';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sessionUnavailablePage(next: string): Response {
  const href = escapeHtml(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Try again in a moment</title></head>' +
    '<body><main><h1>' +
    escapeHtml(SESSION_UNAVAILABLE_HEADLINE) +
    '</h1><p>' +
    escapeHtml(SESSION_UNAVAILABLE_BODY) +
    '</p><p><a href="' +
    href +
    '">Try again</a></p></main></body></html>';
  return new Response(html, {
    status: 503,
    headers: unavailableHeaders('text/html; charset=utf-8'),
  });
}
