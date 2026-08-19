import type { ReactNode } from 'react';
import { ACCENT_TEXT_VAR, ACCENT_VAR, type PersonAccent } from '@/lib/design/accents';

/**
 * The category badge (§8.4): tinted fill + accent text, 700, 2px 8px,
 * control radius. The fill is the §8.1 construction rule verbatim — a
 * 5% tint of the accent — via color-mix, so no unpinned hex enters the
 * token set; the words ride the Q2 text variant. 10px: §8.2's "never
 * below 10px" floor resolves the spec's 9.5–10.5 range from below.
 */
export function CategoryBadge({
  accent,
  children,
}: {
  accent: PersonAccent;
  children: ReactNode;
}) {
  return (
    <span
      className="badge category-badge"
      style={{
        background: `color-mix(in srgb, ${ACCENT_VAR[accent]} 5%, var(--white))`,
        color: ACCENT_TEXT_VAR[accent],
      }}
    >
      {children}
    </span>
  );
}
