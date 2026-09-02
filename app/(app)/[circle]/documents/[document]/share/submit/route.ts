import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { shareDocument } from '@/lib/hc/documents';
import {
  STEP_UP_COOKIE,
  STEP_UP_FOR_COOKIE,
  stepUpClearCookies,
  stepUpConfirms,
} from '@/lib/auth/step-up-cookie';

/**
 * POST /[circle]/documents/[document]/share/submit — share ONE document with
 * ONE person (7C C2; PRD §4.3.5; AC-DOC-5). The §5.7 token rides the
 * `hc-step-up` cookie the account step-up route set, bound to
 * `document:<id>`; hc.share_object consumes it in its own transaction and
 * holds every rule (the actor's manage, one object, never the domain, never
 * derived objects, the log entry). This route clears the cookie either way.
 * A refusal is ONE marker, never a 500; a budget overrun is its own.
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
  ctx: { params: Promise<{ circle: string; document: string }> },
): Promise<Response> {
  const { circle, document: documentId } = await ctx.params;
  const back = `/${circle}/documents/${documentId}`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, back);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  const fields = await formFields(req);
  const memberId = fields.member_id ?? '';
  if (!UUID_RE.test(documentId) || !UUID_RE.test(memberId)) {
    return redirect303(req, `${back}?e=refused`);
  }
  // 7D · R2/F-3 + R3/F-8: the token must be FOR this share. A token minted
  // for another operation (or another document) is not confirmation here —
  // hc.share_object would refuse it, consuming nothing, and the old code
  // then cleared the cookie anyway and burned an unrelated step-up. It is
  // not sent, it is not cleared, and the caller is asked for the password
  // she was always going to be asked for.
  const bound = stepUpConfirms(
    cookieValue(req, STEP_UP_FOR_COOKIE),
    'share_object',
    `document:${documentId}`,
  );
  const token = bound ? cookieValue(req, STEP_UP_COOKIE) : null;
  if (!token) return redirect303(req, `${back}?share=${memberId}&e=step-up`);

  return withRouteBudget(
    async (budget) => {
      try {
        await budget.race(shareDocument(claims, documentId, memberId, token), 'shareDocument');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return clearStepUp(redirect303(req, `${back}?e=refused`));
      }
      return clearStepUp(redirect303(req, `${back}?shared=1`));
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
