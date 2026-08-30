import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { revokeAuthSessions } from '@/lib/db/maintenance';

/**
 * Membership revocation wrappers (TSD §5.8; GRT-02 is the DB proof).
 * hc.remove_member does the one-transaction removal — grants zeroed,
 * shares revoked unless explicitly kept, tasks unassigned and logged —
 * and returns the account id FOR the session revocation this module's
 * second half performs (the §5.8 sessions row; AC-PERM-3).
 */

export async function removeMember(
  claims: RequestClaims,
  memberId: string,
  keepShareIds?: string[],
): Promise<{ account_id: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ result: { account_id: string } }>('select hc.remove_member($1, $2) as result', [
      memberId,
      keepShareIds ?? null,
    ]);
    return r.rows[0].result;
  });
}

/**
 * The sessions row: revocation at the DB (the probed GoTrue exposes no
 * per-user admin logout) — auth.sessions deleted, refresh tokens
 * revoked. RLS closure on any still-live JWT is 2A-proven (concurrency
 * case 4); the E2E verifies from a second browser context (AC-PERM-3).
 * No password rotation here — removal ends ACCESS, not the account.
 */
export async function revokeSessionsForAccount(accountId: string): Promise<void> {
  await revokeAuthSessions(accountId);
}
