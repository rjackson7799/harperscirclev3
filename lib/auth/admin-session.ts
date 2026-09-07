import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAuthenticationAnswer } from './session-outcome';

export type AdminSessionRead =
  | { kind: 'verified-session'; identity: { sub: string; session_id: string; aal: 'aal2'; exp: number } }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (error: unknown): AdminSessionRead => ({
  kind: isAuthenticationAnswer(error) ? 'denied' : 'unavailable',
});

/**
 * Verification only, NEVER operator authorization. Family users can have MFA.
 * No consumer may release metadata before the database admission/audit commit.
 * Capture the cookie token once; verify its signature and live user with that
 * SAME token so an SDK refresh cannot splice two different session identities.
 */
export async function readAdminSession(client: SupabaseClient): Promise<AdminSessionRead> {
  try {
    const session = await client.auth.getSession();
    if (session.error) return failure(session.error);
    const token = session.data?.session?.access_token;
    if (typeof token !== 'string' || !token) return { kind: 'denied' };

    const verified = await client.auth.getClaims(token);
    if (verified.error) return failure(verified.error);
    const claims = verified.data?.claims;
    if (!claims || typeof claims.sub !== 'string' || !uuid.test(claims.sub)
      || typeof claims.session_id !== 'string' || !uuid.test(claims.session_id)
      || claims.aal !== 'aal2' || !Number.isSafeInteger(claims.exp)
      || claims.exp <= Date.now() / 1000) return { kind: 'denied' };

    const live = await client.auth.getUser(token);
    if (live.error) return failure(live.error);
    const user = live.data?.user;
    if (!user || user.id !== claims.sub
      || !user.factors?.some((factor) => factor.status === 'verified')
      || claims.exp <= Date.now() / 1000) return { kind: 'denied' };

    return { kind: 'verified-session', identity: {
      sub: claims.sub, session_id: claims.session_id, aal: 'aal2', exp: claims.exp,
    } };
  } catch {
    return { kind: 'unavailable' };
  }
}
