import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { snoozeTask } from '@/lib/hc/tasks';

/**
 * POST /[circle]/tasks/[task]/snooze/submit — move the date forward (7B B2;
 * PRD §4.5.4; TSK-02's app half). A date is a DATE (§2.7): 'YYYY-MM-DD' and
 * the subject's zone, together, or nothing reaches the definer.
 * hc.snooze_task refuses an earlier date and counts every snooze, with one
 * revision row naming the actor. One marker, never a 500.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string; task: string }> },
): Promise<Response> {
  const { circle, task: taskId } = await ctx.params;
  const back = `/${circle}/tasks/${taskId}`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, back);
  if (gate.kind === 'refused') return gate.response;

  const fields = await formFields(req);
  const dueOn = fields.due_on ?? '';
  const dueZone = (fields.due_zone ?? '').trim();
  if (!DATE_ONLY.test(dueOn) || !dueZone) return redirect303(req, `${back}?e=snooze`);

  return withRouteBudget(
    async (budget) => {
      try {
        await budget.race(snoozeTask(gate.claims, taskId, dueOn, dueZone), 'snoozeTask');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=snooze`);
      }
      return redirect303(req, `${back}?snoozed=1`);
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
