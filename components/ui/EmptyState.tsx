import type { ReactNode } from 'react';

/**
 * The §8.6 empty state: ONE sentence, 12.5px, no illustration, no call
 * to action. (The one exception — first-run Care Inbox and day-one Home,
 * where the forwarding address IS the content — belongs to those
 * surfaces, not this component.)
 *
 * Colour: var(--muted-text), a recorded deviation from §8.6's faint
 * (ADR-0016): an empty-state sentence is the ONLY content on screen, so
 * §8.7's redundancy exemption for faint cannot cover it, and faint on
 * card measures ~3.3:1 — below the AA target the browser axe leg
 * enforces. The quiet register survives; the words stay readable.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
