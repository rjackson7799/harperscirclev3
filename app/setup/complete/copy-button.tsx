'use client';

import { Button } from '@/components/ui/Button';

/** The address copy control (PRD §4.1.3) — progressive enhancement over
 *  a selectable mono address; without JS the address is still there to
 *  select and copy by hand. */
export function CopyButton({ value }: { value: string }) {
  return (
    <Button
      variant="secondary"
      aria-label={`Copy ${value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
      }}
    >
      Copy
    </Button>
  );
}
