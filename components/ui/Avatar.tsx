import type { ReactNode } from 'react';
import { ACCENT_VAR, type Accent } from '@/lib/design/accents';

/**
 * The §8.4 avatar: 28px circle (of the 27–29 range), the person's
 * assigned accent as fill, white initial at 600 11px, 2px cream ring.
 * The full name is the accessible name; the initial is presentational.
 * Stacks overlap at -8px (.avatar-stack).
 */
export function Avatar({ name, accent }: { name: string; accent: Accent }) {
  return (
    <span
      className="avatar"
      role="img"
      aria-label={name}
      style={{ background: ACCENT_VAR[accent] }}
    >
      <span aria-hidden="true">{(name[0] ?? '?').toUpperCase()}</span>
    </span>
  );
}

export function AvatarStack({ children }: { children: ReactNode }) {
  return <span className="avatar-stack">{children}</span>;
}
