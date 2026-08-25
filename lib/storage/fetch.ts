/**
 * Bounded reads of Supabase Storage.
 *
 * 6B close-out · F5 (ADR-0026 D18). The browser gate at 5457eaa (r6) came
 * back 37/1, and the one was not the behaviour under test: REV-02 refused
 * correctly and promptly, and the leg still failed because
 * `GET /api/artifact/<id>?page=1` never answered at all — the route was
 * blocked inside a bare `await fetch(signedUrl)`, with no AbortSignal and no
 * timeout, for the whole remaining 106 s of the leg. The page never reached
 * `load`; a person would have watched a review screen spin with nothing said.
 *
 * Node's undici floor (~300 s headers timeout) is not a bound — it is five
 * minutes of spinner. A bound is a number this codebase chose on purpose.
 *
 * The rule this generalises is already ADR-0026's, earned three times over
 * in this slice: WHERE A VALUE CROSSES A BOUNDARY THE BUILD DOES NOT
 * CONTROL — a bundler, a driver, a worker spawn — resolve it and then CHECK
 * THE ANSWER. An outbound HTTP call to storage is exactly such a boundary,
 * and "no answer" is one of the answers it can give.
 *
 * Scope, recorded honestly: this bounds the artifact route's two reads,
 * which is what the gate found. Seven other outbound `fetch` calls in
 * `app/` and `lib/` are still unbounded (postmark inbound, upload/complete,
 * the two TUS proxy hops, outbound mail, and the two client-side upload
 * calls). They are OWED, not fixed — see ADR-0026 D18.
 *
 * AND THAT SCOPE WAS DRAWN IN THE WRONG PLACE — gate run r7 said so, one
 * commit later. The route's other seven awaits are network calls too, and
 * per-call bounds do not compose besides. This helper is now one participant
 * in `lib/http/budget.ts`'s whole-request budget rather than the route's only
 * bound; it keeps its AbortController because this is the one call where
 * cancellation is actually available. See ADR-0026 D20 (F6).
 */

/**
 * Ten seconds. A promoted page is a small image one local hop away; a read
 * that has not answered in ten seconds is not slow, it is stuck, and the
 * screen is better served by a named state than by a longer wait.
 */
export const STORAGE_FETCH_TIMEOUT_MS = 10_000;

/** Distinguishable at the call site, so the caller can name the state. */
export class StorageFetchTimeout extends Error {
  constructor(readonly ms: number) {
    super(`storage did not answer within ${ms} ms`);
    this.name = 'StorageFetchTimeout';
  }
}

/**
 * `fetch`, with an answer guaranteed within `ms`.
 *
 * The race is the GUARANTEE — it holds even against a transport that ignores
 * cancellation entirely, which is the failure this exists for. The abort is
 * the COURTESY: it releases the socket instead of leaving it to undici's
 * five-minute floor. Both matter, and neither substitutes for the other.
 *
 * The timer is always cleared, including on the ordinary fast path: a bound
 * that outlives its own request is a handle that keeps the process awake.
 */
export async function fetchStorageWithin(
  url: string,
  init: RequestInit = {},
  ms: number = STORAGE_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const attempt = fetch(url, { ...init, signal: controller.signal });
  // Once the race is decided the loser is nobody's business, but an abort
  // rejection with no handler is an unhandled rejection. Give it one.
  attempt.catch(() => {});

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new StorageFetchTimeout(ms));
    }, ms);
  });

  try {
    return await Promise.race([attempt, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
