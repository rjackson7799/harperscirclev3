'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { INBOX_REVALIDATE_SECONDS } from '@/lib/inbox/revalidate';

/**
 * The arrival-received signal (6B B5; Q8 SETTLED — the signal FIRST, then
 * the `gate → extract` eager fire, never the reverse; D24 ruling 3).
 *
 * The Care Inbox is a server component reading live state. This makes the
 * surface tell the truth about ITSELF: `router.refresh()` re-renders the
 * server component with fresh data every `INBOX_REVALIDATE_SECONDS` (half a
 * relay tick), so `Reading` appears when reading begins and the §4.5 cancel
 * affordance shown is live and accurate — never a control that is already
 * dead. A hidden tab does not poll; it refreshes the moment it is visible
 * again, so the first paint after a tab switch is honest too.
 *
 * Renders nothing. Needs no DDL — which is why 6A's M7 closed UNCONSUMED.
 */
export function InboxRevalidator() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const id = setInterval(tick, INBOX_REVALIDATE_SECONDS * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router]);
  return null;
}
