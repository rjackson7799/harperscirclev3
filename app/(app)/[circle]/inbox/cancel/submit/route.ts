import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { cancelArrival } from '@/lib/hc/inbox';

/**
 * POST /[circle]/inbox/cancel/submit — §4.5's member window: any member
 * who can approve can cancel; the guarantee (nothing persisted, nothing
 * shown) is hc.cancel_arrival's, never this route's. One refusal shape.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string }> },
): Promise<Response> {
  const { circle } = await ctx.params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): signed-out 303s to sign-in; unavailable answers 503.
  const gate = await gateRoute(supabase, req, `/${circle}/inbox`);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  const fields = await formFields(req);
  if (!fields.arrival_id) return redirect303(req, `/${circle}/inbox?e=cancel`);
  try {
    await cancelArrival(claims, fields.arrival_id);
  } catch {
    return redirect303(req, `/${circle}/inbox?e=cancel`);
  }
  return redirect303(req, `/${circle}/inbox?cancelled=1`);
}
