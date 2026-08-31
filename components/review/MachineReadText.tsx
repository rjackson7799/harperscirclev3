'use client';

import { useState } from 'react';

type MachineTextResult =
  | { kind: 'loading' }
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'absent' }
  | { kind: 'failed' };

/**
 * §6.9's machine-read text, offered per page under its exact label
 * (A11Y-08; 6B B9) — “machine-read — may contain errors”, character for
 * character as PRD §4.2 (:1391) and TSD §6.9 (:2177, :2501) spell it, and as
 * the slice-6 plan's B9 row requires “everywhere it appears”.
 *
 * ROUND-18 F-5: this used to read “Machine-read text — …”. The divergence
 * survived a whole slice because the leg whose TITLE claims to pin the exact
 * label asserted only the warning clause, so nothing ever compared the two.
 *
 * 7C C2/C6: extracted from ReviewScreen so the Documents viewer offers the
 * SAME control — one component, one label, one honest classification: a
 * page with no sibling (born-digital, email) SAYS so, never a dead link
 * (A11Y-11's “reachable as native text is” is this toggle, everywhere).
 *
 * Fetched lazily THROUGH the artifact fence — the same
 * gated, evidence-logged route the page image rides — the first time a
 * person opens it. Poor confidence arrives as an EMPTY transcript and is
 * SAID; a source with no sibling (born-digital, email) says that instead.
 */
export function MachineReadText({ arrivalId, page }: { arrivalId: string; page: number }) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<MachineTextResult | null>(null);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && result === null) {
      setResult({ kind: 'loading' });
      fetch(`/api/artifact/${arrivalId}?page=${page}&text=1`)
        .then(async (res): Promise<MachineTextResult> => {
          if (res.status === 404) return { kind: 'absent' };
          if (!res.ok) return { kind: 'failed' };
          const text = (await res.text()).trim();
          return text ? { kind: 'text', text } : { kind: 'empty' };
        })
        .catch((): MachineTextResult => ({ kind: 'failed' }))
        .then(setResult);
    }
  };

  return (
    <div className="review-machine-text-block">
      <button
        type="button"
        className="button-secondary review-machine-text-toggle"
        aria-expanded={expanded}
        onClick={toggle}
      >
        machine-read — may contain errors
      </button>
      {expanded && result ? (
        result.kind === 'loading' ? (
          <p className="micro-meta">Reading…</p>
        ) : result.kind === 'text' ? (
          <pre className="review-machine-text">{result.text}</pre>
        ) : result.kind === 'empty' ? (
          <p className="micro-meta">
            Machine reading couldn&apos;t produce reliable text for this page.
          </p>
        ) : result.kind === 'absent' ? (
          <p className="micro-meta">No machine-read text is stored for this page.</p>
        ) : (
          <p className="micro-meta">The machine-read text couldn&apos;t be loaded right now.</p>
        )
      ) : null}
    </div>
  );
}
