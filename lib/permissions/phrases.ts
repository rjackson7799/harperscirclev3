import type { AccessLevel, Domain } from './tiers';

/**
 * 7C C3 · the level→phrase module (AC-PPL-2; slice-7 plan, settled item 1).
 * ONE module maps the five levels to the words and the sentences the People
 * surface renders, so the level words and the grants they describe cannot
 * drift apart — the lib/permissions/tiers.ts discipline, and pinned the
 * same way: tests/permissions/phrases.test.ts drives this module against
 * hc.access_level and hc.tier_defaults LIVE.
 *
 * The two honest limits (settled item 1) belong to the SURFACE, not here:
 * the line says what a person sees in the record — reads, search, presence,
 * the log — never what they will or won't be notified of (RLS-11b pending),
 * and a subject's row carries the §7.5 custodianship framing, never the
 * word "authority".
 *
 * `hidden` is row ABSENCE (tiers.ts:29) and is NEVER named: a hidden
 * domain must not be implied to exist, so the line simply does not
 * mention it.
 */

/** The short word the plain line is built from. */
export const LEVEL_WORD: Record<AccessLevel, string> = {
  manage: 'full access',
  view: 'sees everything',
  summary: 'summary only',
  log: 'activity only',
};

/** What each level actually enforces — the long form for detail surfaces. */
export const LEVEL_PHRASE: Record<AccessLevel, string> = {
  manage: 'can see and change everything',
  view: 'sees everything, including the documents themselves — cannot approve',
  summary:
    'sees titles, categories, dates and the plain-language summaries — not the documents, and not what was read from them',
  log: 'sees that things exist and when they changed, nothing more',
};

export const DOMAIN_LABEL: Record<Domain, string> = {
  memories: 'memories',
  health: 'health & care',
  schedule: 'schedule',
  documents: 'documents',
  finances: 'finances',
};

/**
 * hc.access_level, ALL FIVE. `hidden` is a real value of that enum even
 * though a grant is STORED as row absence (tiers.ts:29), so this is the
 * vocabulary the adjust surface offers from and the write path validates
 * against — the ONE list, pinned against `enum_range` in
 * tests/permissions/phrases.test.ts.
 *
 * 7D · R3/F-7: it used to be re-typed in the member page and again in
 * grant/submit — a third and a fourth copy of a list with a security
 * consequence.
 */
export const GRANT_LEVELS = ['hidden', 'log', 'summary', 'view', 'manage'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

export function isGrantLevel(value: string): value is GrantLevel {
  return (GRANT_LEVELS as readonly string[]).includes(value);
}

/** hc.domain, the five — same discipline, same pin. */
export const DOMAINS: readonly Domain[] = [
  'memories',
  'health',
  'schedule',
  'documents',
  'finances',
];

export function isDomain(value: string): value is Domain {
  return (DOMAINS as readonly string[]).includes(value);
}

/**
 * The ladder's arithmetic, hidden at the floor — the same ranking
 * hc.visible_at's ladder implies, used by the adjust surface to tell a raise
 * from a lower (the definer re-decides regardless).
 *
 * 7D · R4/F-6: the key type is GrantLevel, not `string`. Under `string` an
 * absent key was a silent `undefined`, `n > undefined` is `false`, and a
 * RAISE was therefore classified as a lower and posted with
 * `stepUpToken: null`. Under GrantLevel an omission is a compile error, and
 * a caller holding a DB string has to narrow it (isGrantLevel) before it can
 * index this map at all.
 *
 * 7D · R3/F-7: the ORDER is pinned live against `enum_range`'s own order —
 * the enum pin covered key sets and never ordering, and D6's "the ceiling
 * offers NOTHING above itself" rides on this being the DB's ladder.
 */
export const LEVEL_RANK: Record<GrantLevel, number> = {
  hidden: 0,
  log: 1,
  summary: 2,
  view: 3,
  manage: 4,
};

const LEVEL_ORDER: readonly AccessLevel[] = ['manage', 'view', 'summary', 'log'];
const ALL_DOMAINS = DOMAINS;

/**
 * The plain-language line for ONE subject's levels map, §4.6.1's truth the
 * family reads ("Nell: full access · Marcus: summary only" — the caller
 * prepends the name). Null is "not yours to know" (hc.circle_people fails
 * closed below coordinator): the line is EMPTY and the surface renders
 * nothing, implying nothing.
 */
export function plainLine(levels: Record<string, string> | null | undefined): string {
  if (levels === null || levels === undefined) return '';
  const present = ALL_DOMAINS.filter((d) => {
    const level = levels[d];
    return typeof level === 'string' && level !== 'hidden' && level in LEVEL_WORD;
  });
  if (present.length === 0) return 'nothing in this record';
  const first = levels[present[0]] as AccessLevel;
  if (present.length === ALL_DOMAINS.length && present.every((d) => levels[d] === first)) {
    return LEVEL_WORD[first];
  }
  // Mixed or partial: grouped by level, each group naming its domains —
  // and the hidden ones simply not mentioned.
  return LEVEL_ORDER.filter((l) => present.some((d) => levels[d] === l))
    .map(
      (l) =>
        `${LEVEL_WORD[l]}: ${present
          .filter((d) => levels[d] === l)
          .map((d) => DOMAIN_LABEL[d])
          .join(', ')}`,
    )
    .join(' · ');
}
