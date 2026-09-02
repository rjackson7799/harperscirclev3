import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { assignCandidates, assignTask, taskById } from '@/lib/hc/tasks';
import {
  STEP_UP_COOKIE,
  STEP_UP_FOR_COOKIE,
  stepUpClearCookies,
  stepUpConfirms,
} from '@/lib/auth/step-up-cookie';

/**
 * POST /[circle]/tasks/[task]/assign/submit — hand a task over (7B B2; PRD
 * §4.5.6; AC-TASK-1/2/6). Plain, or exactly one of the two human paths:
 *
 *   · `member_id` alone: when the person can clear the taint, hc.assign_task
 *     plainly; when she cannot, NOTHING is written and the assigner is sent
 *     to the crossing screen, which is where the sentence and the two paths
 *     live (the point of selection, from hc.circle_people);
 *   · `instruction`: path 1 — the assigner's own words, trimmed; whitespace
 *     is no instruction;
 *   · `share_document`: path 2 — the §5.7 token rides the `hc-step-up`
 *     cookie the account step-up route set, bound to `share_object` +
 *     `task:<id>+document:<id>`; the definer consumes it in its own
 *     transaction; this route clears the cookie either way.
 *
 * Every guarantee is hc.assign_task's (D19.7's gate, the ladder, the paths
 * only for the crossing, the post-condition, the freeze). A refusal is ONE
 * marker, never a 500; an overrun of the answer budget is its own.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function clearStepUp(res: Response): Response {
  for (const cookie of stepUpClearCookies()) res.headers.append('set-cookie', cookie);
  return res;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string; task: string }> },
): Promise<Response> {
  const { circle, task: taskId } = await ctx.params;
  const back = `/${circle}/tasks/${taskId}`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, back);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  const fields = await formFields(req);
  const memberId = fields.member_id ?? '';
  if (!UUID_RE.test(memberId)) return redirect303(req, `${back}?e=assign`);
  const crossing = `${back}/assign?member=${memberId}`;
  const instruction = (fields.instruction ?? '').trim();
  const shareDocument = fields.share_document ?? '';

  return withRouteBudget(
    async (budget) => {
      try {
        if ('instruction' in fields) {
          // Path 1 — the assigner's own words, or nothing.
          if (!instruction) return redirect303(req, `${crossing}&e=instruction`);
          await budget.race(assignTask(claims, taskId, memberId, { instruction }), 'assignTask');
          return redirect303(req, `${back}?assigned=1&path=instruction`);
        }
        if (shareDocument) {
          // Path 2 — the token from the step-up cookie, consumed by the definer.
          if (!UUID_RE.test(shareDocument)) return redirect303(req, `${back}?e=assign`);
          // 7D · R2/F-3 + R3/F-8: the token must be FOR this task+document.
          // A token minted for another operation is not confirmation here —
          // it would buy a refusal the definer consumes nothing for, and the
          // clear below would then burn it.
          const bound = stepUpConfirms(
            cookieValue(req, STEP_UP_FOR_COOKIE),
            'share_object',
            `task:${taskId}+document:${shareDocument}`,
          );
          const token = bound ? cookieValue(req, STEP_UP_COOKIE) : null;
          if (!token) {
            return redirect303(req, `${crossing}&path=share&document=${shareDocument}&e=step-up`);
          }
          try {
            await budget.race(
              assignTask(claims, taskId, memberId, { shareDocument, stepUpToken: token }),
              'assignTask',
            );
          } catch (err) {
            if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
            return clearStepUp(redirect303(req, `${back}?e=assign`));
          }
          return clearStepUp(redirect303(req, `${back}?assigned=1&path=share`));
        }
        // Plain — unless this is the crossing, in which case nothing is
        // written and the screen with the sentence and the two paths is next.
        const task = await budget.race(taskById(claims, circle, taskId), 'taskById');
        if (!task) return redirect303(req, `${back}?e=assign`);
        const candidate = (await budget.race(assignCandidates(claims, circle, task), 'assignCandidates')).find(
          (c) => c.member_id === memberId,
        );
        if (candidate && candidate.offered && candidate.can_see === false) {
          return redirect303(req, crossing);
        }
        await budget.race(assignTask(claims, taskId, memberId, {}), 'assignTask');
        return redirect303(req, `${back}?assigned=1`);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=assign`);
      }
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
