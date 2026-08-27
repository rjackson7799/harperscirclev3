// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// ============================================================================
// 6B B5 · THE SIGNAL, first (Q8 SETTLED; ADR-0023 D24 ruling 3's order).
//
// The Care Inbox is a server component reading live state; without
// revalidation a member watching it sees a snapshot, and the §4.5 cancel
// control they can see may already be dead — PRD §4.2.2's promise ("we're
// reading it") would be made and then silently go stale. The signal is the
// surface telling the truth about ITSELF: the page revalidates on an
// interval BOUNDED BY ONE RELAY TICK (60 s), so `Reading` appears when
// reading begins and the cancel affordance shown is live and accurate.
//
// The ORDER is the whole ruling: the `gate → extract` eager fire lands ONLY
// after this signal exists, and the fire's own test asserts the signal is
// present — a refactor that removes the signal fails the fire's test rather
// than silently restoring a stale surface over a collapsed window.
// ============================================================================

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { InboxRevalidator } from '@/components/inbox/InboxRevalidator';
import { INBOX_REVALIDATE_SECONDS } from '@/lib/inbox/revalidate';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  refresh.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

describe('6B B5 · the arrival-received signal: the Care Inbox revalidates', () => {
  it('the interval is bounded by ONE RELAY TICK — the requirement, not a preference', () => {
    expect(INBOX_REVALIDATE_SECONDS).toBeGreaterThan(0);
    expect(INBOX_REVALIDATE_SECONDS).toBeLessThanOrEqual(60);
  });

  it('mounted, it refreshes the route every interval', () => {
    render(<InboxRevalidator />);
    expect(refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(INBOX_REVALIDATE_SECONDS * 1000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(INBOX_REVALIDATE_SECONDS * 1000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a hidden tab does not refresh — and refreshes the moment it is visible again', () => {
    render(<InboxRevalidator />);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      vi.advanceTimersByTime(INBOX_REVALIDATE_SECONDS * 1000);
    });
    expect(refresh).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('unmounting clears the interval — no refresh outlives the surface', () => {
    render(<InboxRevalidator />);
    act(() => root.unmount());
    root = createRoot(container); // afterEach unmounts a live root
    act(() => {
      vi.advanceTimersByTime(3 * INBOX_REVALIDATE_SECONDS * 1000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('the Care Inbox page MOUNTS the revalidator — the surface tells the truth about itself', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', '(app)', '[circle]', 'inbox', 'page.tsx'),
      'utf8',
    );
    expect(src).toContain('InboxRevalidator');
  });
});
