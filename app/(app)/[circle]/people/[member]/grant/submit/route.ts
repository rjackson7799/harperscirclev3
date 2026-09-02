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
      // 7D · R3/F-4: null is NOT hidden, and this route does not GUESS.
      // `hc.circle_people` returns a null inner map where the level is not
      // the caller's to read — a freeze, or a caller below coordinator — and
      // treating that as `hidden` made every change look like a RAISE, so
      // the LOWER that is a freeze's own remedy was charged the password
      // hc.set_grant deliberately refuses to charge for revocation.
      // `null` here means UNKNOWABLE, and it is a third answer, not a level.
      let current: GrantLevel | null = null;
      try {
        const rows = await budget.race(circlePeople(claims, circle), 'circlePeople');
        const person = rows.find((r) => r.kind === 'member' && r.member_id === memberId);
        if (!person) return redirect303(req, `${back}?e=refused`);
        const held = person.levels?.[subjectId]?.[domain];
        current = typeof held === 'string' && isGrantLevel(held) ? held : null;
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=refused`);
      }

      // Three answers, not two: a raise, a lower, and "cannot be told from
      // here". Only a KNOWN raise is bounced for a token; the unknown case
      // posts through with whatever token is in hand and lets the definer
      // decide — it refuses a tokenless raise itself, and under a freeze it
      // refuses a raise with a token too.
      const raising = current !== null && LEVEL_RANK[level] > LEVEL_RANK[current];
      const token = current !== null && !raising ? null : cookieValue(req, STEP_UP_COOKIE);
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
        return token ? clearStepUp(res) : res;
      }
      const res = redirect303(req, `${back}?changed=1`);
      return token ? clearStepUp(res) : res;
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
