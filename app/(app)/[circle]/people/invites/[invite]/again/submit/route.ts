import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { retireInvite } from '@/lib/hc/people';

/**
 * POST /[circle]/people/invites/[invite]/again/submit — send again (7C C3;
 * PRD §4.6.2). A NEW invite, never a resurrected token: the old one is
 * revoked through hc.revoke_invite (coordinator-gated in-function), and
 * the coordinator lands on the EXISTING invite form prefilled with the
 * address and tier — the fresh invite rides the one create path, its
 * subject scope consciously re-chosen (the invites table is definer-only,
 * so the old scope is not the app's to copy).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string; invite: string }> },
): Promise<Response> {
  const { circle, invite } = await ctx.params;
  const back = `/${circle}/people`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, back);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  return withRouteBudget(
    async (budget) => {
      let prefill: { invited_email: string; tier: string };
      try {
        prefill = await budget.race(retireInvite(claims, circle, invite), 'retireInvite');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `${back}?e=refused`);
      }
      return redirect303(
        req,
        `/${circle}/invite?resend=1&email=${encodeURIComponent(prefill.invited_email)}&tier=${prefill.tier}`,
      );
    },
    () => redirect303(req, `${back}?e=slow`),
  );
}
