import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * §5.7 step-up minting (STP-01/02 are the DB proofs). Mint runs AS the
 * freshly re-authenticated user — hc.mint_step_up reads the session's
 * amr from the claims and refuses anything staler than 300 s, so the
 * claims here MUST come from the sign-in that just happened, never from
 * the long-lived cookie session. The token is returned exactly once;
 * consumption belongs to the operation definers.
 */
export async function mintStepUp(
  claims: RequestClaims,
  operation: string,
  targetRef: string | null,
): Promise<{ token: string; expires_at: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ result: { token: string; expires_at: string } }>(
      'select hc.mint_step_up($1, $2) as result',
      [operation, targetRef],
    );
    return r.rows[0].result;
  });
}
