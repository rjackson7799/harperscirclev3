import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnswerBudget,
  AnswerBudgetExceeded,
  ROUTE_ANSWER_BUDGET_MS,
  STARVATION_FLOOR_MS,
} from '@/lib/http/budget';

// ============================================================================
// ROUND-19 F-1 — THE BUDGET NAMED THE WRONG THING FOR TWO ROUNDS.
//
// Gate run r2's leg 38 logged, verbatim:
//
//     artifact: readableArtifact: the route's 15000 ms answer budget was spent
//     artifact: access-log write failed: logArtifactRead: the route's 15000 ms
//               answer budget was spent
//
// Both names were read as WHERE THE TIME WENT. They are not. The budget is
// SHARED and spent down across the whole request, so the name it carries is
// whichever call happened to be racing when the timer fired — a route that
// spends 14.9 s in hop one and 12 ms in hop two blames hop two.
//
// That mis-reading is in the record. lib/http/budget.ts's own header localises
// the stall to "the DB reads and the signed-URL hop"; ADR-0027 D19 and the
// round-19 findings carried it forward. Round 19 MEASURED those hops against
// the live stack:
//
//     readableArtifact / readableRendition / logArtifactRead
//         15-30 ms at rest, 239 ms worst at FIFTY concurrent, zero errors
//     GET /auth/v1/user through Kong
//         96-121 ms at rest, 669 ms p50 under FULL eight-core saturation
//
// Nothing there is fifteen seconds. The localisation was wrong, and being
// wrong is why round 18's fix "bounded and named the stall" and the stall
// survived it: it named the stall after the wrong hop.
//
// SO THE BUDGET HAS TO CARRY THE LEDGER, and it has to say when it was
// STARVED rather than merely late — because the §6.3 render pass blocks this
// process's event loop for 99-100% of its own duration (measured: 576 ms of
// render, ONE timer tick), and a budget implemented as setTimeout in that same
// process cannot fire while that is happening. r2's leg-38 504 took 19.5 s
// against a 15 s budget for exactly this reason.
// ============================================================================

describe('F-1 · the overrun carries the LEDGER, not just the unlucky call', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const NEVER = () => new Promise<never>(() => {});

  it('names every hop and what each one COST — the r2 shape, at its cause', async () => {
    const budget = AnswerBudget.open();
    // Hop one eats almost the whole budget and SUCCEEDS.
    const slow = budget.race(
      new Promise((r) => setTimeout(() => r('claims'), 14_900)),
      'readLiveSession',
    );
    await vi.advanceTimersByTimeAsync(14_900);
    expect(await slow).toBe('claims');

    // Hop two is instant, and is the one the timer catches.
    const doomed = budget.race(NEVER(), 'readableArtifact');
    const caught = doomed.catch((e) => e as AnswerBudgetExceeded);
    await vi.advanceTimersByTimeAsync(200);
    const err = await caught;
    budget.clear();

    expect(err).toBeInstanceOf(AnswerBudgetExceeded);
    expect(err.what).toBe('readableArtifact');
    // THE FIX: the message must make it impossible to read "readableArtifact"
    // as "the DB read is what took fifteen seconds".
    expect(err.message).toMatch(/readLiveSession/);
    expect(err.message).toMatch(/14\d{3} ?ms/);
    expect(err.ledger.map((h) => h.what)).toEqual(['readLiveSession', 'readableArtifact']);
    expect(Math.round(err.ledger[0].ms)).toBeGreaterThanOrEqual(14_800);
    expect(Math.round(err.ledger[1].ms)).toBeLessThan(1_000);
  });

  it('the hop still IN FLIGHT is in the ledger too, marked as unfinished', async () => {
    const budget = AnswerBudget.open();
    const doomed = budget.race(NEVER(), 'createSignedUrl');
    const caught = doomed.catch((e) => e as AnswerBudgetExceeded);
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS + 10);
    const err = await caught;
    budget.clear();
    expect(err.ledger).toHaveLength(1);
    expect(err.ledger[0]).toMatchObject({ what: 'createSignedUrl', finished: false });
    expect(err.message).toMatch(/createSignedUrl/);
  });

  it('a hop that FINISHED is recorded as finished, so the two are distinguishable', async () => {
    const budget = AnswerBudget.open();
    await budget.race(Promise.resolve('ok'), 'readableRendition');
    const caught = budget.race(NEVER(), 'storage read').catch((e) => e as AnswerBudgetExceeded);
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS + 10);
    const err = await caught;
    budget.clear();
    expect(err.ledger[0]).toMatchObject({ what: 'readableRendition', finished: true });
    expect(err.ledger[1]).toMatchObject({ what: 'storage read', finished: false });
  });
});

describe('F-1 · the budget says when it was STARVED rather than merely spent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const NEVER = () => new Promise<never>(() => {});

  it('a timer that fires ON TIME reports no starvation', async () => {
    const budget = AnswerBudget.open();
    const caught = budget.race(NEVER(), 'hop').catch((e) => e as AnswerBudgetExceeded);
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS + 5);
    const err = await caught;
    budget.clear();
    expect(err.lateMs).toBeLessThan(STARVATION_FLOOR_MS);
    expect(err.starved).toBe(false);
    expect(err.message).not.toMatch(/blocked/i);
  });

  it('a timer that fires LATE says the PROCESS WAS BLOCKED — the leg-38 signature', async () => {
    // r2's leg 38: a 15 s budget that answered at 19.5 s. A setTimeout cannot
    // be 4.5 s late because a socket is slow; it is late because nothing in
    // this process ran. That is a DIFFERENT fact from "the read was slow", and
    // it is the one that points at the §6.3 render pass rather than the DB.
    const opened = Date.now();
    const budget = AnswerBudget.open();
    const caught = budget.race(NEVER(), 'readableArtifact').catch((e) => e as AnswerBudgetExceeded);
    // The clock jumps 19.5 s while no timer gets to run — a frozen loop.
    vi.setSystemTime(opened + 19_500);
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS + 5);
    const err = await caught;
    budget.clear();
    expect(err.starved).toBe(true);
    expect(err.lateMs).toBeGreaterThanOrEqual(4_000);
    expect(err.message).toMatch(/blocked/i);
    // And it must not read as though the hop is what took the time.
    expect(err.message).toMatch(/LATE/);
  });
});

describe('F-1 · everything the budget already guaranteed still holds', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('work that is already settled WINS a budget that expired alongside it', async () => {
    const budget = AnswerBudget.open();
    const done = budget.race(Promise.resolve('bytes'), 'hop');
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS + 100);
    expect(await done).toBe('bytes');
    budget.clear();
  });

  it("work's OWN rejection passes straight through, unchanged", async () => {
    const budget = AnswerBudget.open();
    const boom = new Error('a real fault');
    await expect(budget.race(Promise.reject(boom), 'hop')).rejects.toBe(boom);
    budget.clear();
  });

  it('abandoned() fires when the budget is spent, and not before', async () => {
    const budget = AnswerBudget.open();
    expect(budget.abandoned.aborted).toBe(false);
    budget.race(NEVERP(), 'hop').catch(() => {});
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS + 5);
    expect(budget.abandoned.aborted).toBe(true);
    budget.clear();
  });

  it('clear() releases the timer so a budget cannot outlive its request', async () => {
    const budget = AnswerBudget.open();
    budget.clear();
    // Nothing left to fire: advancing past the budget must not abort.
    await vi.advanceTimersByTimeAsync(ROUTE_ANSWER_BUDGET_MS * 2);
    expect(budget.abandoned.aborted).toBe(false);
  });
});

function NEVERP(): Promise<never> {
  return new Promise<never>(() => {});
}
