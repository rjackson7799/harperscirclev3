import { asUser } from '@/lib/db/user';
import { setOpeningContext } from '@/lib/hc/circle';
import { OPENING_CONTEXT } from '@/lib/setup/steps';
import { redirect303 } from '@/lib/auth/http';

/**
 * Step 3's submit (PRD §4.1.3): the opening context lands on the circle.
 * The write is guarded in the statement itself — only the caller's own
 * circle, only while still in setup — and the guard is a POSTCONDITION,
 * not a hope (round-10 finding 7): a forged, stale or missing circle id
 * writes zero rows and REFUSES the advance, so an authorization refusal
 * is never indistinguishable from persistence.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return redirect303(req, '/sign-in?next=%2Fsetup');

  const form = await req.formData();
  const circleId = String(form.get('circle_id') ?? '');
  const allowed = new Set<string>(OPENING_CONTEXT.map((o) => o.value));
  const context = form
    .getAll('context')
    .filter((v): v is string => typeof v === 'string' && allowed.has(v));

  if (!circleId) return redirect303(req, '/setup/step/3?e=circle');

  const wrote = await setOpeningContext(claims.sub, circleId, context);
  if (!wrote) {
    return redirect303(req, `/setup/step/3?circle=${encodeURIComponent(circleId)}&e=circle`);
  }
  return redirect303(req, `/setup/step/4?circle=${encodeURIComponent(circleId)}`);
}
