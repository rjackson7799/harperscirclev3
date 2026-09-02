/**
 * 7D · R2/F-3 + R3/F-8 — the §5.7 step-up cookie, and WHAT IT IS FOR.
 *
 * hc.mint_step_up binds every token to an `operation` and a `target_ref`,
 * and hc.consume_step_up matches BOTH exactly, so a token genuinely cannot
 * cross operations at the database. The app did not carry that binding: one
 * cookie name, `hc-step-up`, held whatever token was minted last, and three
 * surfaces treated its mere PRESENCE as confirmation.
 *
 * What that cost, on the record:
 *
 *   · a coordinator holding a live `raise_grant` token opened a document and
 *     was shown "Share it with Marisol" with no password at all — the form
 *     that only renders once identity is proven — and the click dead-ended
 *     at "That couldn't be done just now.", while the honest `e=step-up`
 *     copy sat there unreachable (R2/F-3);
 *   · and the route then CLEARED the cookie, so her unrelated step-up was
 *     burned by a refusal the database had not consumed anything for
 *     (R3/F-8's second half — consume_step_up's UPDATE never touched the
 *     row, because operation and target_ref did not match).
 *
 * The remedy is the readable companion the disposition names: the token
 * stays exactly where it was, HttpOnly, and a second HttpOnly cookie says
 * what it is FOR. A surface asks `stepUpConfirms(...)` with its own
 * operation and its own target_ref — the same two values the definer will
 * match on — so the app's belief and the database's rule are the same
 * sentence, and a token for another operation is simply not confirmation
 * here. It is not authorization: the definer still decides. It is the app no
 * longer claiming a proof it does not hold.
 *
 * SAID PLAINLY: the companion is NOT a security control and nothing rests on
 * it. A client that forges it only causes the app to hand a token to a
 * definer that will refuse it — exactly what happened before this existed.
 * The authorization is hc.consume_step_up's exact match on operation and
 * target_ref, and that is unchanged.
 */

export const STEP_UP_COOKIE = 'hc-step-up';
export const STEP_UP_FOR_COOKIE = 'hc-step-up-for';

/** Five minutes, the mint's own window (§5.7). */
const MAX_AGE = 300;

/**
 * What the token is for, in a form a cookie value may carry verbatim.
 *
 * NOT URLSearchParams: its serialisation turns `+` into a space on the way
 * back, and a target_ref like `task:<id>+document:<id>` is exactly the shape
 * that carries one. `encodeURIComponent` leaves `+` alone (it escapes it),
 * and `.` is the separator because no operation name contains one.
 */
export function stepUpFor(operation: string, targetRef: string | null): string {
  return `${encodeURIComponent(operation)}.${encodeURIComponent(targetRef ?? '')}`;
}

/** The pair the mint hands back: the token, and what it is for. */
export function stepUpSetCookies(
  token: string,
  operation: string,
  targetRef: string | null,
): string[] {
  return [
    `${STEP_UP_COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`,
    `${STEP_UP_FOR_COOKIE}=${stepUpFor(operation, targetRef)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`,
  ];
}

/** Both cleared together — a token with no purpose is not a step-up. */
export function stepUpClearCookies(): string[] {
  return [
    `${STEP_UP_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    `${STEP_UP_FOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  ];
}

/**
 * Does the cookie in hand confirm THIS operation on THIS target? The same
 * two values hc.consume_step_up matches on, asked before anything is offered
 * or posted. A missing companion is NOT confirmation — fail closed.
 */
export function stepUpConfirms(
  forValue: string | null | undefined,
  operation: string,
  targetRef: string | null,
): boolean {
  if (typeof forValue !== 'string' || forValue === '') return false;
  const expected = stepUpFor(operation, targetRef);
  if (forValue === expected) return true;
  // Two readers, two encodings: `cookies()` hands back the raw value, while
  // a route's own cookie parser decodes it once. Both are the same cookie,
  // so both are the same answer.
  try {
    return decodeURIComponent(expected) === forValue;
  } catch {
    return false;
  }
}
