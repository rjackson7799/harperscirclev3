import 'server-only';
import { withRequestRole } from '@/lib/db/request-role';
import { revokeAuthSessions } from '@/lib/db/maintenance';
import { asPipeline } from '@/lib/db';
import { rotatePasswordToRandom } from '@/lib/auth/gotrue-admin';

/**
 * The §5.11 security-action wrappers (TSD §5.11; WMN-01; ADR-0013 F3).
 *
 * execute_wasnt_me consumes the single-use token AND durably enqueues the
 * owed kill in the same transaction; the app then PERFORMS the kill
 * immediately and marks completion. A crash between those two leaves a
 * pending row hc.pending_security_actions surfaces for the worker sweep —
 * never a consumed token with live sessions.
 */

export type WasntMeResult = { account_id: string; action_id: string };

/** Anon channel: the clicker may hold no session at all (§5.11). */
export async function executeWasntMe(token: string): Promise<WasntMeResult> {
  return withRequestRole('anon', null, async (q) => {
    const r = await q.query('select hc.execute_wasnt_me($1) as result', [token]);
    return r.rows[0].result as WasntMeResult;
  });
}

/**
 * The kill itself, both halves in one place — the only module where the
 * fences let the maintenance boundary (DB session revocation; the probed
 * GoTrue has no per-user admin logout endpoint) meet the service-fenced
 * password rotation. Sessions die first (immediacy), then the rotation
 * forces the reset; the email recovery path stays open and unthrottled.
 */
export async function killAllSessionsAndForceReset(accountId: string): Promise<void> {
  await revokeAuthSessions(accountId);
  await rotatePasswordToRandom(accountId);
}

/** hc_pipeline only — the outbox-drain posture (retry-safe: a second
 *  completion reports {completed:false}, an unknown id refuses loudly). */
export async function completeSecurityAction(actionId: string): Promise<void> {
  await asPipeline().query('select hc.complete_security_action($1)', [actionId]);
}

export type PendingSecurityAction = {
  id: string;
  account_id: string;
  action: string;
  created_at: string;
};

/** hc_pipeline only — the retry sweep's work list. */
export async function pendingSecurityActions(): Promise<PendingSecurityAction[]> {
  const r = await asPipeline().query('select * from hc.pending_security_actions()');
  return r.rows as PendingSecurityAction[];
}
