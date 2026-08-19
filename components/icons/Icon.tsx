import type { ReactNode } from 'react';

/**
 * The §8.4 icon base — the conventions, pinned: inline SVG on a 24×24
 * viewBox, fill="none", stroke-width 1.6 (1.7–1.8 for the smallest),
 * round caps and joins, rendered at 13–16px. Stroke is currentColor so
 * the icon inherits nav state; hard-code a stroke only where the icon
 * carries its own meaning. Line-drawn and geometric — never filled,
 * never duotone.
 *
 * Product glyphs land with their surfaces (YAGNI) — this base is the
 * contract they land on. Decorative by default; pass `label` when the
 * icon is the only content of a control… though §8.7 wants the LABEL on
 * the control itself (the D2 lint floor enforces that).
 */
export function Icon({
  size = 14,
  strokeWidth = 1.6,
  label,
  children,
}: {
  /** Rendered size, 13–16px per §8.4. */
  size?: 13 | 14 | 15 | 16;
  /** 1.6 standard; 1.7–1.8 for the smallest render sizes. */
  strokeWidth?: 1.6 | 1.7 | 1.8;
  label?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {children}
    </svg>
  );
}
