import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { isoText, isoTextOrNull } from './rows';

// ============================================================================
// 7C C3 · the People & roles data half (PRD §4.6.1, §4.6.2, §7.5; PPL-01).
// ONE read — hc.circle_people (7A M4) — and the definer hands each caller
// exactly her own reach: a coordinator gets every member's levels and the
// open invites; anyone else gets her OWN levels, null for the rest (null is
// "not yours to know", never "hidden"), and no invites at all.
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PersonKind = 'subject' | 'member' | 'invite';

export type PersonRow = {
  kind: PersonKind;
  member_id: string | null;
  account_id: string | null;
  display_name: string;
  tier: string;
  slice: string | null;
  is_subject: boolean;
  subject_id: string | null;
  custodian_member_id: string | null;
  custodian_name: string | null;
  joined_at: string;
  invite_id: string | null;
  invite_expires_at: string | null;
  invite_status: 'pending' | 'expired' | null;
  /** subject_id → domain → level; null under a freeze, and null when the
   *  member's levels are not the caller's to know. */
  levels: Record<string, Record<string, string>> | null;
};

type PersonSql = Omit<PersonRow, 'joined_at' | 'invite_expires_at'> & {
  joined_at: Date | string;
  invite_expires_at: Date | string | null;
};

export async function circlePeople(claims: RequestClaims, circleId: string): Promise<PersonRow[]> {
  if (!UUID_RE.test(circleId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<PersonSql>(
      `select kind, member_id, account_id, display_name, tier::text as tier, slice,
              is_subject, subject_id, custodian_member_id, custodian_name,
              joined_at, invite_id, invite_expires_at, invite_status, levels
         from hc.circle_people($1)`,
      [circleId],
    );
    return r.rows.map((row) => ({
      ...row,
      joined_at: isoText(row.joined_at),
      invite_expires_at: isoTextOrNull(row.invite_expires_at),
    }));
  });
}

/**
 * Send again, step one — retire the old invite (§4.6.2: a NEW invite,
 * never a resurrected token). The invites table is DEFINER-ONLY (the
 * request role holds no grant at all — by design, since the token hash
 * lives there), so the old invite's subject scope is not the app's to
 * read: this wrapper revokes the expired invite through hc.revoke_invite
 * (coordinator-gated in-function) and hands back the address and tier
 * from hc.circle_people, and the SURFACE sends the coordinator to the
 * existing invite form prefilled — the fresh invite rides the ONE create
 * path, subjects consciously re-chosen. A non-coordinator sees no invite
 * rows at all, so "not yours" and "not there" are one refusal shape and
 * nothing moves on either.
 */
export async function retireInvite(
  claims: RequestClaims,
  circleId: string,
  inviteId: string,
): Promise<{ invited_email: string; tier: string }> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(inviteId)) throw new Error('invite_refused');
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ invited_email: string; tier: string }>(
      `select display_name as invited_email, tier::text as tier
         from hc.circle_people($1)
        where kind = 'invite' and invite_id = $2`,
      [circleId, inviteId],
    );
    if (r.rows.length !== 1) throw new Error('invite_refused');
    await q.query('select hc.revoke_invite($1)', [inviteId]);
    return r.rows[0];
  });
}
