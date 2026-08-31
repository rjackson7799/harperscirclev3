import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { completeTask } from '@/lib/hc/tasks';

/**
 * POST /[circle]/tasks/[task]/complete/submit — mark done (7B B2; PRD
 * §4.5.3; TSK-02's app half). hc.complete_task decides who may (the holder
 * at summary, or manage), and the ORIGINAL is the work (D19.4): completing
 * an instruction completes its original with this actor; completing an
 * original cancels its instructions; completion revokes the assignment's
 * shares (D19.6). Done is terminal and never deleted. One marker, never a 500.
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
        await budget.race(completeTask(gate.claims, taskId), 'completeTask');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=complete`);
      }
      return redirect303(req, `${back}?done=1`);
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
