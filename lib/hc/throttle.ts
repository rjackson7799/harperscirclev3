import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The F1 password-path boundary (ADR-0013; TSD §5.6, AUT-01/02).
 *
 * Every password-verification path the app exposes — sign-in and step-up
 * re-auth — consults consultThrottle() BEFORE talking to GoTrue and
 * records its outcome through here. Recovery records reset_completed but
 * is never gated (AC-AUTH-12: the email reset path cannot be blocked).
 *
 *  - consultThrottle / recordFailure / noteSuspiciousAttempts run as anon:
 *    existence-blind by 2A construction (byte-identical for account or
 *    ghost), so nothing here is an oracle.
 *  - recordSuccess runs AS THE PROVEN USER (authenticated, the session's
 *    claims): hc.record_auth_success takes NO identifier — the only
 *    throttle state a session can clear is its own account's (round-9
 *    F1's identity binding).
 */

export type ThrottleAnswer = { failures: number; wait_seconds: number };

export async function consultThrottle(identifier: string): Promise<ThrottleAnswer> {
  return withRequestRole('anon', null, async (q) => {
    const r = await q.query('select hc.auth_throttle($1) as t', [identifier]);
    return r.rows[0].t as ThrottleAnswer;
  });
}

export async function recordFailure(identifier: string): Promise<void> {
  await withRequestRole('anon', null, (q) =>
    q.query('select hc.record_auth_failure($1)', [identifier]),
  );
}

/** §5.11's notice path — mint-on-threshold, byte-identical always. */
export async function noteSuspiciousAttempts(identifier: string): Promise<void> {
  await withRequestRole('anon', null, (q) =>
    q.query('select hc.note_suspicious_attempts($1)', [identifier]),
  );
}

export async function recordSuccess(
  kind: 'success' | 'reset_completed',
  claims: RequestClaims,
): Promise<void> {
  await withRequestRole('authenticated', claims, (q) =>
    q.query('select hc.record_auth_success($1)', [kind]),
  );
}
