'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GROUP_LABELS,
  navFor,
  type NavEntry,
  type NavGroup,
} from './nav-manifest';

/**
 * The left nav (§8.3; design_spec §4): cream, 1px right border, grouped
 * with ALL-CAPS labels, counts right-aligned inside the item, utility
 * pinned to the bottom. Driven by the nav manifest — live routes only.
 * Client component solely for usePathname (the active state); the
 * aria-current attribute is both the a11y truth and the styling hook.
 *
 * 7C C3 (NAV-01's composition half): the LAYOUT hands this component the
 * caller's TIER — a string, because `NavEntry.href` is a function and a
 * function cannot cross the RSC boundary as a prop (the first gate run
 * proved it at every circle page) — and the composition is computed HERE,
 * from the same navFor the vitest pins drive. `entries` stays for tests
 * and previews; when both are given, entries wins.
 */
export function LeftNav({
  circle,
  tier = null,
  entries,
}: {
  circle: string;
  tier?: string | null;
  entries?: NavEntry[];
}) {
  const resolved = entries ?? navFor(tier);
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const item = (entry: NavEntry) => {
    const href = entry.href(circle);
    return (
      <Link
        key={entry.key}
        href={href}
        className={`nav-link ${entry.serif ? 'nav-item-serif' : 'nav-item'}`}
        aria-current={isActive(href) ? 'page' : undefined}
      >
        {entry.label}
        {entry.count !== undefined ? (
          <span className="nav-count meta">{entry.count}</span>
        ) : null}
      </Link>
    );
  };

  // Manifest order within each group; groups appear only when they have a
  // live entry.
  const grouped = (group: NavGroup) => resolved.filter((e) => e.group === group);
  const labeled: NavGroup[] = ['record', 'connection'];

  return (
    <nav className="left-nav" aria-label="Sections">
      {grouped('primary').map(item)}
      {labeled.map((group) => {
        const members = grouped(group);
        if (members.length === 0) return null;
        return (
          <div key={group} style={{ display: 'contents' }}>
            <div className="section-label nav-group-label">
              {GROUP_LABELS[group]}
            </div>
            {members.map(item)}
          </div>
        );
      })}
      {grouped('utility').length > 0 ? (
        <div className="nav-utility">{grouped('utility').map(item)}</div>
      ) : null}
    </nav>
  );
}
