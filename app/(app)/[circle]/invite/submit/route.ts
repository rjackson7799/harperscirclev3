import { asUser } from '@/lib/db/user';
import { createInvite } from '@/lib/hc/invites';
import { isInvitableTier } from '@/lib/permissions/tiers';
import { redirect303 } from '@/lib/auth/http';

/**
 * POST /[circle]/invite/submit (TSD §5.10). hc.create_invite decides
 * everything — coordinator-only, AC-AUTH-4, freeze, live subjects — in
 * one transaction, and returns the token EXACTLY ONCE. Slice 2 delivers
 * by copy-link (plan design note 3; the invite email is slice 11), so
 * the token rides a short-lived HttpOnly cookie to the created view —
 * never a URL, which would put it in logs and history.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ circle: string }> },
): Promise<Response> {
  const { circle } = await params;
  const supabase = await asUser();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    return redirect303(req, `/sign-in?next=${encodeURIComponent(`/${circle}/invite`)}`);
  }

  const form = await req.formData();
  const invitedEmail = String(form.get('invited_email') ?? '').trim();
  const tier = String(form.get('tier') ?? '');
  const subjectIds = form.getAll('subject_ids').filter((v): v is string => typeof v === 'string');
  const note = String(form.get('note') ?? '').trim() || undefined;

  if (!invitedEmail || !isInvitableTier(tier) || subjectIds.length === 0) {
    return redirect303(req, `/${circle}/invite?e=refused`);
  }

  let token: string;
  try {
    ({ token } = await createInvite(
      { ...claims },
      { circle_id: circle, invited_email: invitedEmail, tier, subject_ids: subjectIds, note },
    ));
  } catch {
    return redirect303(req, `/${circle}/invite?e=refused`);
  }

  const response = redirect303(req, `/${circle}/invite/created`);
  response.headers.append(
    'set-cookie',
    `hc-invite-token=${token}; Path=/${circle}/invite; Max-Age=120; HttpOnly; SameSite=Lax`,
  );
  return response;
}
