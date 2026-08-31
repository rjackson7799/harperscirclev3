import {
  completeSecurityAction,
  executeWasntMe,
  killAllSessionsAndForceReset,
} from '@/lib/hc/security-actions';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';

/**
 * POST /wasnt-me/submit — the ONLY destruction path (TSD §5.11; WMN-01;
 * ADR-0013 F3). execute_wasnt_me consumes the single-use token and
 * durably enqueues the owed kill in the same transaction; this route then
 * performs the GoTrue kill IMMEDIATELY and marks completion. If the kill
 * fails here, the pending action row remains and the worker sweep
 * (app/api/worker/security-actions) retries — never a consumed token with
 * live sessions. Refusals are neutral: token validity says nothing about
 * accounts.
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const token = fields.token ?? '';

  // 7C C2 (OW-23): a person's wait answers inside the route budget.
  return withRouteBudget(
    async (budget) => {
      let result;
      try {
        result = await budget.race(executeWasntMe(token), 'executeWasntMe');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        // unknown, expired, replayed: one neutral shape (§5.11).
        return redirect303(req, '/wasnt-me?e=link-invalid');
      }

      try {
        await budget.race(killAllSessionsAndForceReset(result.account_id), 'killAllSessions');
        await budget.race(completeSecurityAction(result.action_id), 'completeSecurityAction');
      } catch {
        // The kill is durably owed (security_actions row); the sweep
        // retries — a SLOW kill included, which is why this catch alone
        // absorbs its own budget overrun: the token is consumed, the kill
        // is enqueued, and done=1 is the truthful answer.
      }

      return redirect303(req, '/wasnt-me?done=1');
    },
    () => redirect303(req, '/wasnt-me?e=slow'),
  );
}
