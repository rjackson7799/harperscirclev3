import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { unshareDocument } from '@/lib/hc/documents';

/**
 * POST /[circle]/documents/[document]/unshare/submit — unshare in ONE action
 * (7C C2; PRD §4.3.5; DOC-04). hc.revoke_share decides (the granter or a
 * live coordinator; an assignment-created share on an open held task goes
 * through unassign instead — D19.2); the grantee loses the object on her
 * next query. A refusal is ONE marker, never a 500.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const shareId = fields.share_id ?? '';
  if (!UUID_RE.test(shareId)) return redirect303(req, `${back}?e=refused`);

  return withRouteBudget(
    async (budget) => {
      try {
        await budget.race(unshareDocument(claims, shareId), 'unshareDocument');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=refused`);
      }
      return redirect303(req, `${back}?unshared=1`);
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
