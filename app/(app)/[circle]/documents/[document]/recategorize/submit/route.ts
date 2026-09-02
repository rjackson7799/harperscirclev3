import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { isDocCategory, recategorizeDocument } from '@/lib/hc/documents';

/**
 * POST /[circle]/documents/[document]/recategorize/submit — the move the
 * person CONFIRMED (7C C2; PRD §4.3.2; AC-DOC-6; DOC-03's app half). The
 * page's preview named the exact before-and-after audience; this route
 * carries the category she saw (`expected_category`) so hc.recategorize_
 * document can refuse a source that changed under her feet with the NAMED
 * `document_changed` (D19.5) — rendered as its own marker, never folded
 * into a generic refusal. Category, taint, index and the audience_changed
 * entries move in the definer's ONE transaction.
 */
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
  const category = fields.category ?? '';
  const expected = fields.expected_category ?? '';
  if (!isDocCategory(category) || !isDocCategory(expected)) {
    return redirect303(req, `${back}?e=refused`);
  }

  return withRouteBudget(
    async (budget) => {
      try {
        await budget.race(
          recategorizeDocument(claims, documentId, category, expected),
          'recategorizeDocument',
        );
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        if (/document_changed/.test((err as Error).message)) {
          return redirect303(req, `${back}?e=changed`);
        }
        return redirect303(req, `${back}?e=refused`);
      }
      return redirect303(req, `${back}?moved=1`);
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
