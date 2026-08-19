// The person→accent assignment primitive (D4; §8.4, PRD §4.0). Each person
// keeps ONE accent throughout the product — the colour is that person's
// identity, not decoration — and each subject does too, which is what lets
// a two-subject circle stay legible without reading every label.
//
// Assignable accents exclude --green (the product's own voice, §8.1 rule 3)
// and --plum (reserved for the parent's own identity — a person, not a
// status). Assignment hashes the person's stable id rather than using
// roster position: a removal must never recolour everyone else.

export type PersonAccent = 'sage' | 'terracotta' | 'amber';
export type Accent = PersonAccent | 'plum';

/** The accent's fill token (avatar fills, dots). */
export const ACCENT_VAR: Record<Accent, string> = {
  plum: 'var(--plum)',
  sage: 'var(--sage)',
  terracotta: 'var(--terracotta)',
  amber: 'var(--amber)',
};

/** The accent's word token (Q2, ADR-0016) — whenever the accent carries
 *  text; plum never carries words in the built surface. */
export const ACCENT_TEXT_VAR: Record<PersonAccent, string> = {
  sage: 'var(--sage-text)',
  terracotta: 'var(--terracotta-text)',
  amber: 'var(--amber-text)',
};

const CYCLE: PersonAccent[] = ['sage', 'terracotta', 'amber'];

/** FNV-1a — small, deterministic, dependency-free. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A member's accent: stable for the id's lifetime, never plum, never
 *  green. */
export function memberAccent(memberId: string): PersonAccent {
  return CYCLE[fnv1a(memberId) % CYCLE.length];
}

/**
 * A subject's accent. The circle's founding subject (seq 1 — the parent
 * the circle exists for) is plum; a second subject keeps a stable accent
 * from the member cycle.
 */
export function subjectAccent(subjectId: string, seq: number): Accent {
  return seq === 1 ? 'plum' : memberAccent(subjectId);
}
