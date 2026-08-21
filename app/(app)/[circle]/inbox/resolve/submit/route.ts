import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
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
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) {
    return redirect303(req, `/sign-in?next=${encodeURIComponent(`/${circle}/inbox`)}`);
  }

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
