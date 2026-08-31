import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { unassignTask } from '@/lib/hc/tasks';

/**
 * POST /[circle]/tasks/[task]/unassign/submit — take a task back (7B B2;
 * AC-TASK-7; SHR-02's app half). hc.unassign_task revokes exactly this
 * assignment's shares and closes its written instruction; a coordinator's
 * `keep_share_ids` names the ones that survive — every kept id must be this
 * assignment's live share or the whole call refuses. One marker, never a 500.
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

  const form = await req.formData();
  const keep = form.getAll('keep_share_ids').filter((v): v is string => typeof v === 'string' && v.length > 0);

  return withRouteBudget(
    async (budget) => {
      try {
        await budget.race(unassignTask(gate.claims, taskId, keep), 'unassignTask');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=unassign`);
      }
      return redirect303(req, `${back}?unassigned=1`);
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
