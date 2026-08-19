import type { ReactNode } from 'react';

/**
 * The tag chip (§8.4): sage chip fill with sage words on the Q2 text
 * variant, 600 10.5px, 3px 9px, radius 11px.
 */
export function TagChip({ children }: { children: ReactNode }) {
  return <span className="tag-chip">{children}</span>;
}
