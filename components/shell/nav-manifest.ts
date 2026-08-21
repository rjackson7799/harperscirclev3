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
  { key: 'inbox', label: 'Care Inbox', group: 'primary', href: (c) => `/${c}/inbox` },
  { key: 'upload', label: 'Add a document', group: 'primary', href: (c) => `/${c}/upload` },
  { key: 'tasks', label: 'Tasks', group: 'primary', href: (c) => `/${c}/tasks` },
  { key: 'invite', label: 'Invite', group: 'primary', href: (c) => `/${c}/invite` },
  { key: 'timeline', label: 'Timeline', group: 'record', href: (c) => `/${c}/timeline` },
  { key: 'account', label: 'Account', group: 'utility', href: () => '/account' },
];
