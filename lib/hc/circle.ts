import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';

/**
 * The founder-door write path (PRD §4.1.3; TSD §2.3) — AFTER the B8
 * credential split (ADR-0015 R3/R8; BAT-02/BAT-03): every write here
 * rides the REQUEST-ROLE channel onto M1's definers. The maintenance
 * boundary no longer appears in this module; the postconditions the 2B
 * wrappers enforced app-side (round-10 F7) live IN-FUNCTION now.
 */

export type SetupSubject = {
  first_name: string;
  situation: string;
  postal_code: string;
  timezone: string;
  accent_color: string;
  forwarding_local_part: string;
};

export type SetupCircleInput = {
  name: string;
  subjects: SetupSubject[];
  /** The step-1 answer (BAT-03): written on the founder's membership row
   *  inside hc.create_circle's transaction — the F1 one-line write. */
  relationship?: string;
};

export async function createCircleFromSetup(
  claims: RequestClaims,
  input: SetupCircleInput,
): Promise<{ circle_id: string }> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ result: { circle_id: string } }>(
      `select hc.create_circle($1, $2::jsonb, '{}', $3) as result`,
      [input.name, JSON.stringify(input.subjects), input.relationship ?? null],
    );
    return { circle_id: r.rows[0].result.circle_id };
  });
}

/** PRD §4.1.3 step 1 / §4.1.6 "declare your slice" — hc.set_slice on the
 *  caller's OWN row (keyed hc.uid(); nothing to aim elsewhere). A ghost
 *  or deleted caller refuses loudly in-function (round-10 F7). */
export async function setDeclaredSlice(claims: RequestClaims, slice: string): Promise<void> {
  await withRequestRole('authenticated', claims, (q) =>
    q.query('select hc.set_slice($1) as r', [slice]),
  );
}

/** PRD §4.1.3 step 3 — hc.set_opening_context: the founder's own
 *  in-setup circle, the F7 zero-row postcondition IN-FUNCTION (forged,
 *  stale, foreign and missing ids refuse in one shape). The wrapper
 *  reports the refusal as false so the route refuses the advance. */
export async function setOpeningContext(
  claims: RequestClaims,
  circleId: string,
  context: string[],
): Promise<boolean> {
  try {
    await withRequestRole('authenticated', claims, (q) =>
      q.query('select hc.set_opening_context($1, $2) as r', [circleId, context]),
    );
    return true;
  } catch (err) {
    if (/opening_context_refused|not_authenticated/.test((err as Error).message)) return false;
    throw err;
  }
}
