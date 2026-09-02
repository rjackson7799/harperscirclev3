import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { circlePeople, setGrant } from '@/lib/hc/people';
import {
  LEVEL_RANK,
  isDomain,
  isGrantLevel,
  type GrantLevel,
} from '@/lib/permissions/phrases';

/**
 * POST /[circle]/people/[member]/grant/submit — adjust one level (7C C4;
 * PRD §4.6.3; PPL-02's app half; AC-PERM-5). LOWERING posts straight
 * through; a RAISE demands the §5.7 token from the `hc-step-up` cookie,
 * bound to `member:subject:domain` and consumed by hc.set_grant in its
 * own transaction — this route only tells raise from lower (the same
 * arithmetic the definer re-runs) and clears the cookie either way. The
 * ceiling, the coordinator gate and the log entry with both levels are
 * all the definer's.
 */
const STEP_UP_COOKIE = 'hc-step-up';
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
  res.headers.append('set-cookie', `${STEP_UP_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string; member: string }> },
): Promise<Response> {
  const { circle, member: memberId } = await ctx.params;
  const back = `/${circle}/people/${memberId}`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, back);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  // 7D · R3/F-7: the vocabularies are the phrase module's, not a fourth
  // hand-typed copy — and the guards NARROW, so `level` can index the ladder
  // (R4/F-6: under `Record<string, number>` an unknown key was `undefined`
  // and `n > undefined` is `false`, which classified a raise as a lower).
  const fields = await formFields(req);
  const subjectId = fields.subject_id ?? '';
  const domain = fields.domain ?? '';
  const level = fields.level ?? '';
  if (!UUID_RE.test(subjectId) || !isDomain(domain) || !isGrantLevel(level)) {
    return redirect303(req, `${back}?e=refused`);
  }

  return withRouteBudget(
    async (budget) => {
      let current: GrantLevel = 'hidden';
      try {
        const rows = await budget.race(circlePeople(claims, circle), 'circlePeople');
        const person = rows.find((r) => r.kind === 'member' && r.member_id === memberId);
        if (!person) return redirect303(req, `${back}?e=refused`);
        // Fail CLOSED on a level this app does not know: `hidden` is the
        // floor, so anything else reads as a raise and the token is demanded.
        // (The DISPLAY may not do this — null is "not yours to know" there,
        // R3/F-4 — but on the write path the floor is the safe default.)
        const held = person.levels?.[subjectId]?.[domain];
        current = typeof held === 'string' && isGrantLevel(held) ? held : 'hidden';
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=refused`);
      }

      const raising = LEVEL_RANK[level] > LEVEL_RANK[current];
      const token = raising ? cookieValue(req, STEP_UP_COOKIE) : null;
      if (raising && !token) {
        // Three params — a colon-joined triple in the next is refused by
        // safeNext as scheme-shaped (gate r3).
        return redirect303(req, `${back}?rs=${subjectId}&rd=${domain}&rl=${level}&e=step-up`);
      }

      try {
        await budget.race(setGrant(claims, memberId, subjectId, domain, level, token), 'setGrant');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        const res = redirect303(req, `${back}?e=refused`);
        return raising ? clearStepUp(res) : res;
      }
      const res = redirect303(req, `${back}?changed=1`);
      return raising ? clearStepUp(res) : res;
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
