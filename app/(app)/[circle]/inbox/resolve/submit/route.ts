import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { resolveDuplicate } from '@/lib/hc/inbox';

/**
 * POST /[circle]/inbox/resolve/submit — §4.7's two human resolutions,
 * and only those (never auto-discarded, in either direction):
 * 'different' resumes to the gate; 'same_thing' keeps the original and
 * files nothing new.
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
  const resolution = fields.resolution;
  if (!fields.arrival_id || (resolution !== 'different' && resolution !== 'same_thing')) {
    return redirect303(req, `/${circle}/inbox?e=resolve`);
  }
  try {
    await resolveDuplicate(claims, fields.arrival_id, resolution);
  } catch {
    return redirect303(req, `/${circle}/inbox?e=resolve`);
  }
  return redirect303(req, `/${circle}/inbox?resolved=1`);
}
