import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
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
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) {
    return redirect303(req, `/sign-in?next=${encodeURIComponent(`/${circle}/inbox`)}`);
  }

  const fields = await formFields(req);
  if (!fields.arrival_id) return redirect303(req, `/${circle}/inbox?e=cancel`);
  try {
    await cancelArrival(claims, fields.arrival_id);
  } catch {
    return redirect303(req, `/${circle}/inbox?e=cancel`);
  }
  return redirect303(req, `/${circle}/inbox?cancelled=1`);
}
