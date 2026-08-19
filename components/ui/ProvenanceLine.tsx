import type { ReactNode } from 'react';

/**
 * The §8.6 provenance line — the interface half of N2: anything the AI
 * produced shows where it came from, in muted 11–12px beneath or beside
 * the value. A fact without a visible source is a bug. Consumed from
 * slice 5 on; the middle dot separates source clauses (§8.2 voice).
 */
export function ProvenanceLine({ children }: { children: ReactNode }) {
  return <p className="provenance">{children}</p>;
}
