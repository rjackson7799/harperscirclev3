'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GROUP_LABELS,
  NAV_MANIFEST,
  type NavEntry,
  type NavGroup,
} from './nav-manifest';

/**
 * The left nav (§8.3; design_spec §4): cream, 1px right border, grouped
 * with ALL-CAPS labels, counts right-aligned inside the item, utility
 * pinned to the bottom. Driven by the nav manifest — live routes only.
 * Client component solely for usePathname (the active state); the
 * aria-current attribute is both the a11y truth and the styling hook.
 */
export function LeftNav({
  circle,
  entries = NAV_MANIFEST,
}: {
  circle: string;
  entries?: NavEntry[];
}) {
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
  const grouped = (group: NavGroup) => entries.filter((e) => e.group === group);
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
