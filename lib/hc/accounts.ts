import 'server-only';
import { insertAccountRow, unconfirmEmail as maintenanceUnconfirm } from '@/lib/db/maintenance';
import { deleteAuthUser } from '@/lib/auth/gotrue-admin';

/**
 * Account-identity wrappers for the create-account boundary (TSD §2.3;
 * PRD §4.1.2). The writes ride the maintenance boundary; see
 * lib/db/maintenance for why each exists and the ADR-0015 queued
 * definer-candidacy each one carries.
 */

export async function bootstrapAccount(userId: string, displayName: string): Promise<void> {
  await insertAccountRow(userId, displayName);
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
