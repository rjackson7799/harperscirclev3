import type { ReactNode } from 'react';

/**
 * The §8.4 card: card surface, 1px line border, the card radius, 17px
 * padding (of the 16–18 range). NO shadow — borders do that work. A
 * clickable card gets `cursor: pointer` and nothing else: no hover lift,
 * no shadow bloom.
 */
export function Card({
  clickable = false,
  children,
}: {
  clickable?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clickable ? 'card card-clickable' : 'card'}>{children}</div>
  );
}
