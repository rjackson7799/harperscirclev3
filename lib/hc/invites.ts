import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { describeInviteByToken, type InviteDescription } from '@/lib/db/maintenance';
import type { InvitableTier } from '@/lib/permissions/tiers';

/**
 * The invite lifecycle wrappers (TSD §5.10; IVT-01/02/03 are the DB
 * proofs). Issuance and acceptance run as the authenticated caller —
 * coordinator-only and AC-AUTH-4 are in-function; the address binding is
 * the session's SIGNED claims, never a parameter. The describe read is
 * the maintenance-boundary pre-auth window (see lib/db/maintenance).
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

export type { InviteDescription };

export async function describeInvite(token: string): Promise<InviteDescription | null> {
  return describeInviteByToken(token);
}
