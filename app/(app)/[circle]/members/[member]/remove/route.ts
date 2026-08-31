import { asUser } from '@/lib/db/user';
import { removeMember, revokeSessionsForAccount } from '@/lib/hc/members';
import { redirect303 } from '@/lib/auth/http';

/**
 * POST /[circle]/members/[member]/remove (TSD §5.8; AC-PERM-3). The DB
 * does the removal in one transaction under the R-rule lock (GRT-02);
 * this route then closes the sessions channel immediately with the
 * returned account id. A DB refusal (last coordinator, non-coordinator,
 * unknown member — one shape) revokes nothing. The People surface
 * arrives with slice 7; until then this is the wiring the E2E drives.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ circle: string; member: string }> },
): Promise<Response> {
  const { circle, member } = await params;
  const supabase = await asUser();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    return redirect303(req, `/sign-in?next=${encodeURIComponent(`/${circle}/timeline`)}`);
  }

  // 7C C4: the People surface posts one checkbox PER share (no-JS forms
  // cannot compose a comma list), so every value is collected; the old
  // comma-separated single-field contract the E2E drove still parses.
  const form = await req.formData();
  const keepValues = form
    .getAll('keep_share_ids')
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .filter(Boolean);
  const keepShares = keepValues.length > 0 ? keepValues : undefined;

  try {
    const { account_id } = await removeMember({ ...claims }, member, keepShares);
    await revokeSessionsForAccount(account_id);
    return redirect303(req, `/${circle}/timeline?removed=1`);
  } catch {
    return redirect303(req, `/${circle}/timeline?e=refused`);
  }
}
