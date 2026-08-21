import { asUser } from '@/lib/db/user';
import { createCircleFromSetup, setDeclaredSlice, type SetupSubject } from '@/lib/hc/circle';
import {
  RELATIONSHIPS,
  SITUATIONS,
  SLICES,
  SUBJECT_ACCENTS,
  mintForwardingLocalPart,
  randomToken6,
} from '@/lib/setup/steps';
import { formFields, redirect303 } from '@/lib/auth/http';

/**
 * Step 2's submit — the first write of the founder path (PRD §4.1.3):
 * ONE hc.create_circle call lands the circle, the subjects with their
 * divergent situations and zips, the coordinator membership, the
 * manage×5 grants and the seq-1 custodianship declarations (AC-AUTH-6,
 * 2A-proven). Forwarding local parts are minted here as ADR-0011 values
 * (`<firstname>.<6-char>`) — inactive until verification; provisioning
 * at the provider is slice 4.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return redirect303(req, '/sign-in?next=%2Fsetup');

  const fields = await formFields(req);
  const timezone = fields.timezone || 'America/New_York';

  const subjects: SetupSubject[] = [];
  for (const index of [1, 2] as const) {
    const name = (fields[`subject_name_${index}`] ?? '').trim();
    const situation = fields[`situation_${index}`] ?? '';
    const zip = (fields[`zip_${index}`] ?? '').trim();
    if (index === 2 && !name) continue;

    if (!name || !(SITUATIONS as readonly string[]).includes(situation)) {
      return redirect303(req, '/setup/step/2?e=subject');
    }
    const postalCode = zip || subjects[0]?.postal_code || '';
    if (!postalCode) return redirect303(req, '/setup/step/2?e=subject');

    subjects.push({
      first_name: name,
      situation,
      postal_code: postalCode,
      timezone,
      accent_color: SUBJECT_ACCENTS[subjects.length],
      forwarding_local_part: mintForwardingLocalPart(name, randomToken6),
    });
  }
  if (subjects.length === 0) return redirect303(req, '/setup/step/2?e=subject');

  const name =
    subjects.length === 1
      ? `${subjects[0].first_name}'s circle`
      : subjects.map((s) => s.first_name).join(' & ');

  // BAT-03: the step-1 relationship lands inside create_circle's
  // transaction (the 2B carry delivers it; the F1 one-line write).
  const relationship = RELATIONSHIPS.some((r) => r.value === fields.relationship)
    ? fields.relationship
    : undefined;
  const { circle_id } = await createCircleFromSetup(
    { ...claims },
    { name, subjects, relationship },
  );

  const slice = fields.slice ?? '';
  if (SLICES.some((s) => s.value === slice)) {
    await setDeclaredSlice({ ...claims }, slice);
  }

  return redirect303(req, `/setup/step/3?circle=${circle_id}`);
}
