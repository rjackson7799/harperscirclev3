import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { setAccountSlice, updateOpeningContext } from '@/lib/db/maintenance';

/**
 * The founder-door write path (PRD §4.1.3; TSD §2.3).
 *
 * Step 2 writes THROUGH hc.create_circle as the authenticated founder —
 * custodianship declarations first (AC-AUTH-6 is 2A-proven), circle,
 * subjects, coordinator membership, manage×5 grants, one transaction.
 * The two column writes the DB deliberately has no request-path for
 * (declared slice, opening context) ride the maintenance boundary with
 * ownership guards in the statement itself.
 */

export type SetupSubject = {
  first_name: string;
  situation: string;
  postal_code: string;
  timezone: string;
  accent_color: string;
  forwarding_local_part: string;
};

export type SetupCircleInput = { name: string; subjects: SetupSubject[] };

export async function createCircleFromSetup(
  claims: RequestClaims,
  input: SetupCircleInput,
): Promise<{ circle_id: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query('select hc.create_circle($1, $2::jsonb) as result', [
      input.name,
      JSON.stringify(input.subjects),
    ]);
    return { circle_id: r.rows[0].result.circle_id as string };
  });
}

/** PRD §4.1.3 step 1 / §4.1.6 "declare your slice" — accounts.slice has
 *  no request-path UPDATE; the guard is the id equality itself. */
export async function setDeclaredSlice(accountId: string, slice: string): Promise<void> {
  await setAccountSlice(accountId, slice);
}

/** PRD §4.1.3 step 3 — writable only by the founder of a circle still in
 *  setup (the guard lives in the statement, so a forged circle id writes
 *  zero rows). */
export async function setOpeningContext(
  accountId: string,
  circleId: string,
  context: string[],
): Promise<void> {
  await updateOpeningContext(accountId, circleId, context);
}
