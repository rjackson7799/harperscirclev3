/**
 * THE one tier module (TSD §5.10; PRD §4.1.5, §7.4 — AC-AUTH-8).
 *
 * Renders the ceiling copy for BOTH screens (the invite screen's
 * under-selector ceiling and the accept screen's before-anything
 * description) AND carries the default grants written at acceptance.
 * The failure mode this module exists to prevent: a screen promising a
 * ceiling the grants do not implement. So:
 *
 *  - The grant table is a SNAPSHOT of hc.tier_defaults() — the ONE DB
 *    source the acceptance transaction writes (IVT-02). The AC-AUTH-8
 *    test compares them row for row; neither side can drift alone.
 *  - Both screens render ceiling copy ONLY through <TierCeiling>
 *    (lib/permissions/tier-ceiling.tsx), which emits ceilingCopy() from
 *    here. The same test pins that equality.
 *
 * Coordinator is deliberately absent: it is not an invitable tier
 * (hc.create_invite refuses it) and no screen renders a coordinator
 * ceiling; its defaults are asserted DB-side (CIR-04).
 *
 * Voice: the subject is named, never pronominalized — the DB carries no
 * gender, and the product refers to the parent by name (design spec §3).
 */

export const INVITABLE_TIERS = ['family', 'care_circle'] as const;
export type InvitableTier = (typeof INVITABLE_TIERS)[number];

export type Domain = 'memories' | 'health' | 'schedule' | 'documents' | 'finances';
export type AccessLevel = 'log' | 'summary' | 'view' | 'manage'; // hidden = row absence

export type TierGrant = { readonly domain: Domain; readonly level: AccessLevel };

export type CeilingContext = {
  /** 'they' on the invite screen (coordinator reading about the invitee);
   *  'you' on the accept screen (the invitee reading about themselves). */
  person: 'they' | 'you';
  subjectNames: readonly string[];
};

function nameList(names: readonly string[]): string {
  if (names.length === 0) return 'the record';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function possessive(names: readonly string[]): string {
  const list = nameList(names);
  return list.endsWith('s') ? `${list}'` : `${list}'s`;
}

export const TIERS: Record<
  InvitableTier,
  {
    label: string;
    defaultGrants: readonly TierGrant[];
    ceiling: (ctx: CeilingContext) => string;
  }
> = {
  family: {
    label: 'Family',
    // PRD §7.4 via hc.tier_defaults('family'): summary on health, schedule
    // and memories; log on documents; finances = NO ROW (hidden).
    defaultGrants: [
      { domain: 'health', level: 'summary' },
      { domain: 'schedule', level: 'summary' },
      { domain: 'memories', level: 'summary' },
      { domain: 'documents', level: 'log' },
    ],
    ceiling: ({ person, subjectNames }) => {
      const poss = possessive(subjectNames);
      const plural = subjectNames.length > 1;
      const timelines = plural ? 'timelines' : 'timeline';
      const doing =
        subjectNames.length === 1
          ? `how ${subjectNames[0]} is doing`
          : 'how they are doing';
      return person === 'they'
        ? `They'll start at summary only: ${poss} ${timelines}, and ${doing}. Not ${poss} documents, not anything financial. You can raise this any time.`
        : `You'll start at summary only: ${poss} ${timelines}, and ${doing}. Not ${poss} documents, not anything financial. The family can raise this any time.`;
    },
  },
  care_circle: {
    label: 'Care circle',
    // PRD §7.4 via hc.tier_defaults('care_circle'): schedule summary only.
    defaultGrants: [{ domain: 'schedule', level: 'summary' }],
    ceiling: ({ person }) =>
      person === 'they'
        ? `Only the tasks you assign them. Not documents, not finances, not family notes. This is a ceiling, not a starting point — it doesn't rise.`
        : `Only the tasks assigned to you. Not documents, not finances, not family notes. This is a ceiling, not a starting point — it doesn't rise.`,
  },
};

export function ceilingCopy(tier: InvitableTier, ctx: CeilingContext): string {
  return TIERS[tier].ceiling(ctx);
}

export function isInvitableTier(value: string): value is InvitableTier {
  return (INVITABLE_TIERS as readonly string[]).includes(value);
}
