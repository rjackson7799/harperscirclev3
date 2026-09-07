/**
 * The left-nav manifest (D3, §8.3; design_spec §4). The nav renders FROM
 * this list and nothing else — only live routes are listed, and groups
 * appear as their first live route lands (never promise what isn't
 * built). Group order is design_spec §4's: primary actions ungrouped →
 * THE RECORD → CONNECTION; utility pins to the bottom. The serif flag is
 * §3's register change for the Connection items (Memories, Family Album)
 * — no live route carries it yet.
 */

export type NavGroup = 'primary' | 'record' | 'connection' | 'utility';

export interface NavEntry {
  key: string;
  label: string;
  group: NavGroup;
  /** Render in the serif nav role (design_spec §3 — Connection items). */
  serif?: boolean;
  /** Right-aligned count inside the item (design_spec §4). */
  count?: number;
  href: (circle: string) => string;
}

/** ALL-CAPS presentation comes from .section-label CSS; copy stays
 *  sentence case (§8.2 voice). */
export const GROUP_LABELS: Partial<Record<NavGroup, string>> = {
  record: 'The record',
  connection: 'Connection',
};

export const NAV_MANIFEST: NavEntry[] = [
  // 9B U3 (PRD §4.7): Home is the ROUTER, so it is the first entry — the
  // way back to "what needs me now" from anywhere in the circle.
  { key: 'home', label: 'Home', group: 'primary', href: (c) => `/${c}` },
  { key: 'inbox', label: 'Care Inbox', group: 'primary', href: (c) => `/${c}/inbox` },
  { key: 'upload', label: 'Add a document', group: 'primary', href: (c) => `/${c}/upload` },
  { key: 'tasks', label: 'Tasks', group: 'primary', href: (c) => `/${c}/tasks` },
  { key: 'invite', label: 'Invite', group: 'primary', href: (c) => `/${c}/invite` },
  { key: 'timeline', label: 'Timeline', group: 'record', href: (c) => `/${c}/timeline` },
  { key: 'documents', label: 'Documents', group: 'record', href: (c) => `/${c}/documents` },
  { key: 'people', label: 'People & roles', group: 'connection', href: (c) => `/${c}/people` },
  { key: 'account', label: 'Account', group: 'utility', href: () => '/account' },
];

/**
 * 7C C3 · NAV-01's composition half: the nav follows access per tier — a
 * COURTESY, asserted, never the mechanism (§4.0, §7.7): the gate and RLS
 * refuse a hand-constructed URL regardless of what is listed here.
 *
 *   · care_circle: Home · Tasks · Account — only the work handed to them;
 *   · family: Home · Timeline · Documents · People · Account;
 *   · coordinator: everything.
 *
 * 9B U3: HOME IS IN EVERY TIER'S LIST. The router is the surface with the
 * widest audience and each of its blocks renders only what its own caller
 * can see — a caregiver's Home is her tasks and nothing else — so hiding it
 * from a tier would hide a surface that person is entitled to, which is the
 * opposite of what this courtesy is for. (PRD §4.1.4 rule 4 is untouched: it
 * governs where an ACCEPTED INVITE lands, not what the nav offers once you
 * are inside.)
 *
 * An unknown tier (the read failed, or no membership resolved) falls back
 * to the FULL manifest: hiding is a courtesy, and a failed read must never
 * hide a surface someone is entitled to — the surfaces refuse for
 * themselves.
 */
export function navFor(tier: string | null): NavEntry[] {
  if (tier === 'care_circle') {
    return NAV_MANIFEST.filter((e) => ['home', 'tasks', 'account'].includes(e.key));
  }
  if (tier === 'family') {
    return NAV_MANIFEST.filter((e) =>
      ['home', 'timeline', 'documents', 'people', 'account'].includes(e.key),
    );
  }
  return NAV_MANIFEST;
}
