import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import type { InvitableTier } from '@/lib/permissions/tiers';

/**
 * The invite lifecycle wrappers (TSD §5.10; IVT-01/02/03 are the DB
 * proofs). Issuance and acceptance run as the authenticated caller —
 * coordinator-only and AC-AUTH-4 are in-function; the address binding is
 * the session's SIGNED claims, never a parameter. Since B8 the describe
 * read rides hc.describe_invite on the ANON channel — the pre-auth
 * accept screen's read, keyed strictly on the token, DEF-10 one-shape
 * null — and the maintenance boundary is out of this module entirely.
 */

export type CreateInviteInput = {
  circle_id: string;
  invited_email: string;
  tier: InvitableTier;
  subject_ids: string[];
  note?: string;
};

export async function createInvite(
  claims: RequestClaims,
  input: CreateInviteInput,
): Promise<{ invite_id: string; token: string; expires_at: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.create_invite($1, $2, $3::hc.tier, $4::uuid[], $5) as result', [
      input.circle_id,
      input.invited_email,
      input.tier,
      input.subject_ids,
      input.note ?? null,
    ]);
    return r.rows[0].result;
  });
}

export async function revokeInvite(claims: RequestClaims, inviteId: string): Promise<void> {
  await withRequestRole('authenticated', claims, (q) =>
    q.query('select hc.revoke_invite($1)', [inviteId]),
  );
}

export async function acceptInvite(
  claims: RequestClaims,
  token: string,
): Promise<{ circle_id: string; tier: InvitableTier; member_id: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.accept_invite($1) as result', [token]);
    return r.rows[0].result;
  });
}

export type InviteDescription = {
  state: 'pending' | 'used' | 'revoked' | 'expired';
  invite_id: string;
  circle_id: string;
  circle_name: string;
  inviter_name: string;
  invited_email: string;
  tier: 'family' | 'care_circle';
  subject_names: string[];
};

/** hc.describe_invite on the anon channel: malformed and unknown both
 *  answer null — byte-identical, no oracle. */
export async function describeInvite(token: string): Promise<InviteDescription | null> {
  return withRequestRole('anon', null, async (q) => {
    const r = await q.query('select hc.describe_invite($1) as r', [token]);
    return (r.rows[0]?.r as InviteDescription | null) ?? null;
  });
}
