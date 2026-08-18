import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestClaims } from '@/lib/db';

/**
 * The page gate (AC-AUTH-10, AC-PERM-3). getClaims() validates a JWT
 * locally — fast, but a global sign-out or an admin revocation must bite
 * "within seconds, verified from a second browser", and a stateless
 * check can't see a dead session. So signed-in PAGES gate through
 * getUser(), which GoTrue validates against the live session store; the
 * claims ride along for the request-role channel. Record data never
 * relies on this — RLS is the enforcement (§5.5) — this closes the
 * page-shell channel at the session store.
 */
export async function liveSessionClaims(
  supabase: SupabaseClient,
): Promise<RequestClaims | null> {
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user) return null;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  return claims?.sub ? ({ ...claims } as RequestClaims) : null;
}
