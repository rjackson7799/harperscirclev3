/**
 * The founder door's fixed vocabulary and step logic (PRD §4.1.3).
 * Options are the PRD lists verbatim; values are their stable slugs.
 */

export const RELATIONSHIPS = [
  { value: 'daughter', label: 'Daughter' },
  { value: 'son', label: 'Son' },
  { value: 'spouse-partner', label: 'Spouse or partner' },
  { value: 'in-law', label: 'Daughter-in-law or son-in-law' },
  { value: 'other-family', label: 'Other family' },
  { value: 'friend-neighbour', label: 'Friend or neighbour' },
] as const;

export const SLICES = [
  { value: 'appointments-medical', label: 'Appointments & medical' },
  { value: 'money-paperwork', label: 'Money & paperwork' },
  { value: 'day-to-day-house', label: 'Day-to-day & the house' },
  { value: 'visits-calls', label: 'Visits & calls' },
  { value: 'everything', label: 'A bit of everything' },
] as const;

export const SITUATIONS = [
  'At home, on their own',
  'At home, with help coming in',
  'At home, with family',
  'In assisted living',
  'In memory care',
  'In a nursing facility',
  'In hospital right now',
  'Somewhere else',
] as const;

export const OPENING_CONTEXT = [
  { value: 'a-hospital-stay-or-discharge', label: 'A hospital stay or a discharge' },
  { value: 'a-fall-or-new-diagnosis', label: 'A fall or a new diagnosis' },
  { value: 'paperwork-piling-up', label: 'Paperwork piling up' },
  { value: 'a-move-or-change', label: 'A move, or a change in where they live' },
  { value: 'sharing-the-load', label: 'Sharing the load with family' },
  { value: 'getting-organised', label: 'Getting organised before something happens' },
] as const;

/** Subject accents (design spec §2): plum is a person, sage is calm —
 *  never terracotta (attention) or green (the product's voice). */
export const SUBJECT_ACCENTS = ['#7A6E9B', '#6E8F73'] as const;

/**
 * AC-AUTH-9 — resume lands on the furthest step, derived ONLY from state
 * that survives abandonment: steps 1–2 write nothing until step 2 creates
 * the circle, so no circle ⇒ step 1; step 3's write is the opening
 * context, so an empty context ⇒ step 3; otherwise step 4 (optional and
 * skippable — the completion screen is not a step, AC-AUTH-2).
 */
export function resumeStep(state: { hasCircle: boolean; openingContext: string[] }): 1 | 3 | 4 {
  if (!state.hasCircle) return 1;
  if (state.openingContext.length === 0) return 3;
  return 4;
}

/** AC-AUTH-2's other half, pinned as a constant the completion screen
 *  imports nothing from: the indicator renders on steps 1–4 only. */
export const completionStepIndicatorAbsent = true;

/** ADR-0011: `<firstname>.<6-char token>` — readable aloud, unguessable.
 *  Allocation semantics beyond the value (uniqueness at the provider,
 *  provisioning) are slice-4 work; slice 2 mints only the column value. */
export function mintForwardingLocalPart(firstName: string, randomSource: () => string): string {
  const base = firstName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'circle'}.${randomSource()}`;
}

export function randomToken6(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/i ambiguity
  let out = '';
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function StepIndicator({ n }: { n: 1 | 2 | 3 | 4 }) {
  return <div className="step-indicator">Step {n} of 4</div>;
}
