import 'server-only';
import { unconfirmEmail as maintenanceUnconfirm } from '@/lib/db/maintenance';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { deleteAuthUser } from '@/lib/auth/gotrue-admin';

/**
 * Account-identity wrappers for the create-account boundary (TSD §2.3;
 * PRD §4.1.2) — AFTER the B8 credential split: the accounts bootstrap
 * rides hc.create_account on the request-role channel (the caller's OWN
 * row, keyed hc.uid() — no target parameter exists); only the un-confirm
 * stays on the maintenance boundary (auth.* is ungrantable from
 * migrations on this image, the recorded trap).
 */

/** hc.create_account: the caller's own row, kind member, idempotent —
 *  a replayed bootstrap changes nothing and says so. */
export async function bootstrapAccount(claims: RequestClaims, displayName: string): Promise<void> {
  await withRequestRole('authenticated', claims, (q) =>
    q.query('select hc.create_account($1) as r', [displayName]),
  );
}

/** Zero rows here is an invariant violation — the id came from the
 *  signUp that just created the user — so it refuses loudly and lets the
 *  boundary compensate (round-10 findings 6/7). */
export async function unconfirmEmail(userId: string): Promise<void> {
  const rows = await maintenanceUnconfirm(userId);
  if (rows !== 1) {
    throw new Error(`unconfirmEmail: un-confirm hit ${rows} rows for a just-created user`);
  }
}

/**
 * The create-account compensation (round-10 finding 6): when un-confirm
 * or bootstrap fails mid-flow, the just-created GoTrue user is deleted so
 * no partial state survives — no falsely-confirmed user, no session
 * without its account row — and a repeat submission starts clean. Safe by
 * construction: it is only ever called with the id signUp returned in the
 * same request, before any circle exists.
 */
export async function abortAccountCreation(userId: string): Promise<void> {
  await deleteAuthUser(userId);
}

/**
 * APP-09b's app half (4B B8; TSD §5.5): the signed_out access-log entry
 * — hc.log_sign_out, zero parameters, actor = hc.uid(), one circle-level
 * entry per live membership. Runs BEFORE the GoTrue kill so the claims
 * still authenticate the channel; zero memberships is a quiet zero.
 */
export async function logSignOut(claims: RequestClaims): Promise<{ logged: number }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.log_sign_out() as r');
    return r.rows[0].r as { logged: number };
  });
}
