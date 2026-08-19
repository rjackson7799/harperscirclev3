// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// ============================================================================
// D5 · <PulseProvider> (§8.5): "at most one pulsing element on screen —
// its whole job is to be the only one. A rule this easy to break in a
// component tree is not a rule unless something checks it." The contract,
// both modes: a second CONCURRENT registration throws in development and
// logs once in production; unregistering on unmount frees the slot.
//
// Order note: the development-mode tests run first — stubbing
// NODE_ENV=production before React's first jsdom mount would evaluate
// dev-only runtime modules to empty shells (harness trap).
// ============================================================================

import { PulseProvider, usePulse } from '@/components/motion/PulseProvider';

function Pulse({ id }: { id: string }) {
  usePulse(id);
  return <span className="pulse-amber">{id}</span>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

describe('D5 · PulseProvider in development: the second pulse throws', () => {
  it('one pulse registers cleanly', () => {
    render(
      <PulseProvider>
        <Pulse id="due-today" />
      </PulseProvider>,
    );
    expect(container.textContent).toContain('due-today');
  });

  it('a second concurrent pulse throws with both ids named', () => {
    expect(() =>
      render(
        <PulseProvider>
          <Pulse id="due-today" />
          <Pulse id="needs-review" />
        </PulseProvider>,
      ),
    ).toThrowError(/one puls/i);
  });

  it('unregister on unmount frees the slot for the next screen', () => {
    render(
      <PulseProvider>
        <Pulse id="due-today" />
      </PulseProvider>,
    );
    render(<PulseProvider>{null}</PulseProvider>);
    expect(() =>
      render(
        <PulseProvider>
          <Pulse id="needs-review" />
        </PulseProvider>,
      ),
    ).not.toThrow();
    expect(container.textContent).toContain('needs-review');
  });
});

describe('D5 · PulseProvider in production: log once, never throw', () => {
  it('a second and third concurrent pulse warn exactly once and render on', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <PulseProvider>
        <Pulse id="a" />
        <Pulse id="b" />
        <Pulse id="c" />
      </PulseProvider>,
    );
    expect(container.textContent).toContain('c');
    const pulseWarnings = warn.mock.calls.filter((c) =>
      String(c[0]).match(/puls/i),
    );
    expect(pulseWarnings.length).toBe(1);
  });
});
