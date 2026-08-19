'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

/**
 * §8.5: "At most one pulsing element on screen — its whole job is to be
 * the only one. A rule this easy to break in a component tree is not a
 * rule unless something checks it." This is the check: pulsing elements
 * register through usePulse(); a second CONCURRENT registration throws
 * in development and logs once in production; unmounting unregisters.
 */

type PulseRegistry = { register: (id: string) => () => void };

const PulseContext = createContext<PulseRegistry | null>(null);

// Module-level: production logs ONCE per load, not once per screen.
let warnedInProduction = false;

export function PulseProvider({ children }: { children: ReactNode }) {
  const active = useRef<string | null>(null);

  const registry = useMemo<PulseRegistry>(
    () => ({
      register(id: string) {
        if (active.current !== null && active.current !== id) {
          const message =
            `<PulseProvider>: at most ONE pulsing element per screen (§8.5) — ` +
            `"${id}" tried to register while "${active.current}" is pulsing.`;
          if (process.env.NODE_ENV !== 'production') {
            throw new Error(message);
          }
          if (!warnedInProduction) {
            console.warn(message);
            warnedInProduction = true;
          }
          return () => {};
        }
        active.current = id;
        return () => {
          if (active.current === id) active.current = null;
        };
      },
    }),
    [],
  );

  return (
    <PulseContext.Provider value={registry}>{children}</PulseContext.Provider>
  );
}

/** Register this component's pulse for the lifetime of its mount. Using a
 *  pulse class without a surrounding <PulseProvider> is a build error in
 *  development — the rule needs its checker. */
export function usePulse(id: string): void {
  const registry = useContext(PulseContext);
  if (registry === null && process.env.NODE_ENV !== 'production') {
    throw new Error(
      `usePulse("${id}"): no <PulseProvider> above this component — the §8.5 single-pulse rule has nothing to check it.`,
    );
  }
  useEffect(() => registry?.register(id), [registry, id]);
}
