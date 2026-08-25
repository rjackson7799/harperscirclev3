/**
 * The answer budget: how long a route may make a person wait.
 *
 * 6B close-out · F6 (ADR-0026 D20). F5 bounded the artifact route's two
 * `fetch` calls, which is what gate run r6 had found. Gate run r7 then failed
 * leg 38 (A11Y-08 / OCR-01) with the SAME symptom one call earlier:
 *
 *     404  GET  17552ms  /api/artifact/b4cf239a…?page=1
 *     -1   GET       -1  /api/artifact/b4cf239a…?page=1&text=1   NEVER ANSWERED
 *
 * Had that hang been inside the bounded fetch it would have ANSWERED — the
 * text path returns 404 on timeout. It never answered at all, so the stall was
 * upstream of the bound, and the 17.5 s 404 (a path that returns before any
 * fetch is issued) says where: the DB reads and the signed-URL hop.
 *
 * TWO THINGS F5 GOT WRONG, AND THIS FIXES BOTH.
 *
 * ONE — THE CLASS WAS NAMED TOO NARROWLY. It is not "unbounded fetch". It is
 * UNBOUNDED NETWORK CALL IN A ROUTE A PERSON IS WAITING ON. `createSignedUrl`
 * is an outbound HTTP call that happens not to be spelled `fetch`, and a
 * request-role DB read is a round-trip to another process. Every one of them
 * can answer "no answer".
 *
 * TWO — PER-CALL BOUNDS DO NOT COMPOSE, AND THIS IS THE PART THAT MATTERS.
 * Eight awaits at ten seconds each is eighty seconds of spinner in which every
 * single call is "within bounds". The number a person experiences is the SUM,
 * so the bound has to be one budget SHARED across the whole request, spent
 * down by whatever the route does. That is the only shape in which the
 * guarantee can be stated as a sentence a person would recognise: THIS ROUTE
 * ANSWERS WITHIN FIFTEEN SECONDS, whatever goes wrong behind it.
 *
 * THE RACE IS THE GUARANTEE, as it was in F5: it holds even against a
 * transport that ignores cancellation, which is the failure this exists for.
 * What this deliberately does NOT do is cancel the work. A raced-out DB read
 * keeps running and holds its pooled connection until it finishes — the budget
 * protects THE PERSON, not the pool. The honest fix for the pool is a
 * server-side `statement_timeout` on the request-role channel, which is a
 * change to lib/hc's session setup and is OWED, not done here (ADR-0026 D20).
 * `fetchStorageWithin` keeps its AbortController for the one call where
 * cancellation is actually available.
 */

/**
 * Fifteen seconds, whole-request. Long enough that no healthy read comes near
 * it — the whole REV-02 gate leg, browser and all, runs in 12.2 s — and short
 * enough that the screen gets a named state while a person is still watching.
 */
export const ROUTE_ANSWER_BUDGET_MS = 15_000;

/** Distinguishable at the call site, so each site can name its own state. */
export class AnswerBudgetExceeded extends Error {
  constructor(
    readonly what: string,
    readonly ms: number,
  ) {
    super(`${what}: the route's ${ms} ms answer budget was spent`);
    this.name = 'AnswerBudgetExceeded';
  }
}

/** The budget's own win, distinguishable from anything `work` could yield. */
const SPENT = Symbol('answer budget spent');

export class AnswerBudget {
  private readonly ms: number;
  private readonly expiry: Promise<typeof SPENT>;
  private readonly timer: ReturnType<typeof setTimeout>;

  private constructor(ms: number) {
    this.ms = ms;
    let fire: (v: typeof SPENT) => void = () => {};
    this.expiry = new Promise<typeof SPENT>((resolve) => {
      fire = resolve;
    });
    // RESOLVES, never rejects: a rejection nobody races is an unhandled
    // rejection, and this one is deliberately created before anyone races it.
    this.timer = setTimeout(() => fire(SPENT), ms);
  }

  /** Open a budget for one request. Pair EVERY path with `clear()`. */
  static open(ms: number = ROUTE_ANSWER_BUDGET_MS): AnswerBudget {
    return new AnswerBudget(ms);
  }

  /**
   * `work`, or `AnswerBudgetExceeded` once the request's budget is spent.
   *
   * `work`'s own rejection passes straight through unchanged: a real error is
   * still a real error, and a call site that means to catch the overrun checks
   * for it by type rather than swallowing everything.
   */
  async race<T>(work: Promise<T>, what: string): Promise<T> {
    // Once the race is decided the loser is nobody's business, but a rejection
    // with no handler is an unhandled rejection. Give it one.
    work.catch(() => {});
    // `work` first: if both are already settled it wins, because work that is
    // finished should not be thrown away by a budget that expired alongside it.
    const winner = await Promise.race([work, this.expiry]);
    if (winner === SPENT) throw new AnswerBudgetExceeded(what, this.ms);
    return winner as T;
  }

  /**
   * Release the timer. A budget that outlives its own request is a handle that
   * keeps the process awake — the trap F5's timer had to be cleared out of,
   * and pinned here by its own case.
   */
  clear(): void {
    clearTimeout(this.timer);
  }
}
