import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { claimTask } from '@/lib/hc/tasks';

/**
 * POST /[circle]/tasks/[task]/claim/submit — take an unassigned task on
 * (8C U1; PRD §4.5.1; AC-TASK-1's claim half; AC-TASK-2; TSK-05's app half).
 *
 * The route READS NO FORM. hc.claim_task takes one argument and cannot name
 * anyone else, and there is nothing this surface could usefully add: no
 * member to pick (the claimant is the caller), no instruction to write, no
 * document to share. A body would be the beginning of a path ADR-0040 D3
 * pins shut by SET EQUALITY at the database, so none is parsed here either.
 *
 * The definer decides, on the caller's own vectors, under the circle's
 * advisory lock — so two claimants serialise and the second meets an owned
 * row. One marker back, never a 500; the PAGE turns that marker into a
 * sentence, because the page has the task row and can say which case it was.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string; task: string }> },
): Promise<Response> {
  const { circle, task: taskId } = await ctx.params;
  const back = `/${circle}/tasks/${taskId}`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, back);
  if (gate.kind === 'refused') return gate.response;

  return withRouteBudget(
    async (budget) => {
      try {
        await budget.race(claimTask(gate.claims, taskId), 'claimTask');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=claim`);
      }
      return redirect303(req, `${back}?claimed=1`);
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
