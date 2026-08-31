import { AnswerBudget, AnswerBudgetExceeded } from './budget';

/**
 * The answer budget for a PAGE (7B B4; OW-03 — ADR-0027 D17 item 3's
 * ruling as code: "every destination page and every route they POST to
 * carries an AnswerBudget"). The artifact route's guarantee, restated for a
 * Server Component: THIS PAGE ANSWERS WITHIN FIFTEEN SECONDS, whatever goes
 * wrong behind it — with a NAMED state, never a spinner.
 *
 * `withPageBudget` opens one budget for the render, hands it to the reads,
 * and clears it on every path. The page races each read through it; an
 * overrun surfaces as `AnswerBudgetExceeded` (with the hop ledger, round-19
 * F-1) and the page renders its "taking longer than usual" state. The work
 * is NOT cancelled — the budget protects the person, not the pool (D20).
 */
export async function withPageBudget<T>(
  render: (budget: AnswerBudget) => Promise<T>,
  onOverrun: (err: AnswerBudgetExceeded) => T,
): Promise<T> {
  const budget = AnswerBudget.open();
  try {
    return await render(budget);
  } catch (err) {
    if (err instanceof AnswerBudgetExceeded) {
      console.error(`page: ${err.message}`);
      return onOverrun(err);
    }
    throw err;
  } finally {
    budget.clear();
  }
}

/** The same guard for a form route: the write is raced, and an overrun is a
 *  refusal the caller can read — never a hang, never a 500. */
export async function withRouteBudget(
  work: (budget: AnswerBudget) => Promise<Response>,
  onOverrun: (err: AnswerBudgetExceeded) => Response,
): Promise<Response> {
  return withPageBudget(work, onOverrun);
}
