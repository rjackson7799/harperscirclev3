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
 * hc.set_grant — per subject, per domain (GRT-01, AC-PERM-5). LOWER never
 * needs a token; RAISE demands a fresh §5.7 token bound to
 * `member:subject:domain`, consumed in the definer's own transaction; the
 * care-circle cap is structural in-function. Every change is logged with
 * both levels by the definer.
 */
export async function setGrant(
  claims: RequestClaims,
  memberId: string,
  subjectId: string,
  domain: string,
  level: string,
  stepUpToken: string | null,
): Promise<unknown> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: unknown }>(
      `select hc.set_grant($1, $2, $3::hc.domain, $4::hc.access_level, $5) as r`,
      [memberId, subjectId, domain, level, stepUpToken],
    );
    return r.rows[0].r;
  });
}

export type MemberShareRow = {
  share_id: string;
  object_type: string;
  object_id: string | null;
  label: string | null;
  visible: boolean;
  granted_by: string;
  granter_name: string;
  granted_at: string;
  created_by_assignment_of: string | null;
};

type MemberShareSql = Omit<MemberShareRow, 'granted_at'> & { granted_at: Date | string };

/** hc.shares_for_member — what this person has been handed object by
 *  object (D19.9: the floor, except for the holder herself). */
export async function sharesForMember(
  claims: RequestClaims,
  memberId: string,
): Promise<MemberShareRow[]> {
  if (!UUID_RE.test(memberId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<MemberShareSql>(
      `select share_id, object_type::text as object_type, object_id, label, visible,
              granted_by, granter_name, granted_at, created_by_assignment_of
         from hc.shares_for_member($1)`,
      [memberId],
    );
    return r.rows.map((row) => ({ ...row, granted_at: isoText(row.granted_at) }));
  });
}

export type Contribution = {
  owns_now: { id: string; title: string }[];
  completed_count: number;
  /** null when this person has never appeared in the log the READER can
   *  see — rendered as the honest words, never a fake date. */
  last_active: string | null;
};

/** §4.6.4: plain counts and lists — what they own now, what they have
 *  completed, when they were last active. Every read is RLS-true, so the
 *  counts are over what the READER may see, which is the only honest
 *  count a filtered surface can show. */
export async function contributionFor(
  claims: RequestClaims,
  circleId: string,
  memberId: string,
): Promise<Contribution> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(memberId)) {
    return { owns_now: [], completed_count: 0, last_active: null };
  }
  return withRequestRole('authenticated', claims, async (q) => {
    const owns = await q.query<{ id: string; title: string }>(
      `select id, title from public.tasks
        where circle_id = $1 and owner_member_id = $2 and status = 'open' and deleted_at is null
        order by due_on nulls last, id
        limit 100`,
      [circleId, memberId],
    );
    const done = await q.query<{ n: number }>(
      `select count(*)::int as n from public.tasks
        where circle_id = $1 and owner_member_id = $2 and status = 'done' and deleted_at is null`,
      [circleId, memberId],
    );
    const active = await q.query<{ at: Date | string | null }>(
      `select max(l.occurred_at) as at
         from public.access_log l
         join public.circle_members m on m.id = $2
        where l.circle_id = $1 and l.actor_account_id = m.account_id`,
      [circleId, memberId],
    );
    return {
      owns_now: owns.rows,
      completed_count: Number(done.rows[0].n),
      last_active: isoTextOrNull(active.rows[0]?.at ?? null),
    };
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
