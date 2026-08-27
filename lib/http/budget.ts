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
 * ── ROUND-19 F-1: THAT LAST SENTENCE IS WRONG, AND BEING WRONG IS WHY THE
 *    STALL SURVIVED THE FIX THAT "BOUNDED AND NAMED" IT. ──────────────────
 *
 * Gate run r2 failed leg 38 the same way again, and logged:
 *
 *     artifact: readableArtifact: the route's 15000 ms answer budget was spent
 *     artifact: access-log write failed: logArtifactRead: ... budget was spent
 *
 * Those names were read as WHERE THE TIME WENT. They are not. This budget is
 * SHARED and spent down across the request, so the name an overrun carries is
 * whichever call was racing when the timer fired — a route that spends 14.9 s
 * in hop one and 12 ms in hop two blames HOP TWO. The paragraph above made
 * that mistake first, and ADR-0027 D19 and the round-19 findings inherited it.
 *
 * Round 19 MEASURED the accused hops against the live stack:
 *
 *     readableArtifact / readableRendition / logArtifactRead (rollback-only)
 *         15-30 ms at rest; 239 ms WORST at fifty concurrent; zero errors;
 *         connection acquire p50 0.0 ms — so D1's 5 s connect bound is not
 *         live here either, and the 500 on the text path was this budget
 *         overrunning logArtifactRead, never a connect rejection.
 *     GET /auth/v1/user through Kong (what liveSessionClaims does, twice)
 *         96-121 ms at rest; 532 ms p50 at twenty-five concurrent; 669 ms p50
 *         under FULL eight-core saturation.
 *
 * Nothing there is fifteen seconds, and full CPU saturation moves them by
 * 5-13x when the stall needs ~150x. The time is not being spent in the stack.
 *
 * WHERE IT ACTUALLY GOES. The §6.3 render pass and the §6.9 OCR pass run
 * INLINE in app/api/worker/[stage] — the same Node process that serves the
 * family's screens — and `@napi-rs/canvas` raster + PNG encode is a
 * SYNCHRONOUS NATIVE CALL. Measured on this host, one fixture page:
 *
 *     render every page @2576 + encode   work=576ms  timer ticks during: 1
 *     2576² raster + encode x10          work=3428ms timer ticks during: 0
 *
 * 99-100% of that duration, NOTHING ELSE IN THE PROCESS RUNS. Not a pg
 * callback, not a fetch callback — AND NOT THIS BUDGET'S OWN setTimeout. That
 * is why r2's leg-38 504 took 19.5 s against a 15 s budget: the guarantee is
 * implemented as a timer inside the very process that gets frozen.
 *
 * So this file now does the two things it could not do before: it carries the
 * LEDGER, so an overrun says where the time went rather than who was unlucky;
 * and it reports its own LATENESS, because a timer cannot be seconds late
 * because a socket was slow — only because nothing in this process ran.
 *
 * WHAT THIS STILL DOES NOT DO, stated rather than claimed away: it does not
 * stop the blocking. Moving §6.3 render and §6.9 OCR off the request process
 * is an architecture change, not a fix-session change, and it is OWED.
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

/**
 * How late this budget's own timer may be before lateness stops being
 * scheduler jitter and starts being evidence. A quarter of a second on a
 * fifteen-second timer is not a busy event loop; it is a stopped one.
 */
export const STARVATION_FLOOR_MS = 250;

/** What one raced call cost, and whether it ever finished. */
export type HopCost = {
  readonly what: string;
  /** Wall time from the race starting to the race being decided. */
  readonly ms: number;
  /** False for the hop the budget caught mid-flight — it is still running. */
  readonly finished: boolean;
};

function ledgerText(ledger: readonly HopCost[]): string {
  return ledger
    .map((h) => `${h.what} ${Math.round(h.ms)}ms${h.finished ? '' : ' (unfinished)'}`)
    .join(', ');
}

/** Distinguishable at the call site, so each site can name its own state. */
export class AnswerBudgetExceeded extends Error {
  /** True when the budget's timer was itself starved — see STARVATION_FLOOR_MS. */
  readonly starved: boolean;

  constructor(
    readonly what: string,
    readonly ms: number,
    /**
     * ROUND-19 F-1: every hop this request raced, in order, with its cost.
     * `what` is only the LAST one, and reading it as the cause is the error
     * that let this stall survive two rounds of being "named".
     */
    readonly ledger: readonly HopCost[] = [],
    /** How late the timer fired. A socket cannot make a timer late; a frozen
     *  event loop is the only thing that can. */
    readonly lateMs: number = 0,
  ) {
    const starved = lateMs >= STARVATION_FLOOR_MS;
    super(
      `${what}: the route's ${ms} ms answer budget was spent` +
        (ledger.length ? ` — ${ledgerText(ledger)}` : '') +
        (starved
          ? `; the budget's own timer fired ${Math.round(lateMs)} ms LATE, so this ` +
            `process was BLOCKED rather than waiting — the time is not in these hops`
          : ''),
    );
    this.name = 'AnswerBudgetExceeded';
    this.starved = starved;
  }
}

/** The budget's own win, distinguishable from anything `work` could yield. */
const SPENT = Symbol('answer budget spent');

export class AnswerBudget {
  private readonly ms: number;
  private readonly expiry: Promise<typeof SPENT>;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly abandonment = new AbortController();

  /**
   * ROUND-18 F-3 (ADR-0027 D3). This budget deliberately does NOT cancel the
   * work it races — that is the guarantee, and it holds against a transport
   * that ignores cancellation. The cost is that raced-out work runs to
   * completion with nobody listening, and for a WRITE that means it commits:
   * the §10.5 trail could record a read the route had already refused with a
   * 500. Evidence before bytes, inverted — a trail entry for bytes that never
   * moved.
   *
   * So the budget says out loud when it has given up, and a write that cares
   * can decline to commit. This is NOT cancellation: nothing is aborted, the
   * work is still allowed to finish, and a caller that ignores the signal
   * behaves exactly as before. It is the difference between a write that could
   * not be CONFIRMED and a write that SUCCEEDED UNOBSERVED, which the route
   * was treating as one fact.
   */
  get abandoned(): AbortSignal {
    return this.abandonment.signal;
  }

  /** ROUND-19 F-1: what this request actually spent, hop by hop. */
  private readonly spent: HopCost[] = [];
  /** When the budget opened, so the timer can measure its OWN lateness. */
  private readonly openedAt = Date.now();
  private lateMs = 0;

  private constructor(ms: number) {
    this.ms = ms;
    let fire: (v: typeof SPENT) => void = () => {};
    this.expiry = new Promise<typeof SPENT>((resolve) => {
      fire = resolve;
    });
    // RESOLVES, never rejects: a rejection nobody races is an unhandled
    // rejection, and this one is deliberately created before anyone races it.
    this.timer = setTimeout(() => {
      // ROUND-19 F-1. A setTimeout fires late only when nothing in this
      // process ran — the §6.3 render pass blocks the loop for 99-100% of its
      // duration, and this timer is inside that same process. Capturing the
      // lateness HERE is what lets an overrun distinguish "the hop was slow"
      // from "the guarantee's own mechanism was frozen".
      //
      // ONE SAMPLE, and its limit is stated: it sees only blocking that
      // overlaps the deadline. Blocking earlier in the window still shows up
      // as inflated hop costs in the ledger, which is the other half.
      this.lateMs = Math.max(0, Date.now() - this.openedAt - ms);
      this.abandonment.abort();
      fire(SPENT);
    }, ms);
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
    const started = Date.now();
    // `work` first: if both are already settled it wins, because work that is
    // finished should not be thrown away by a budget that expired alongside it.
    const winner = await Promise.race([work, this.expiry]);
    // ROUND-19 F-1: recorded on BOTH outcomes. The hop the budget catches
    // mid-flight is the one the old message named, and on its own it says
    // nothing — its cost is meaningless without the hops that came before it.
    this.spent.push({ what, ms: Date.now() - started, finished: winner !== SPENT });
    if (winner === SPENT) {
      throw new AnswerBudgetExceeded(what, this.ms, [...this.spent], this.lateMs);
    }
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
