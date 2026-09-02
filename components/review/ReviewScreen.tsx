'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
// §6.9's machine-read control lives in ./MachineReadText since 7C C2/C6 —
// ONE component, one exact label, one honest classification, shared with
// the Documents viewer ("everywhere it appears").
import { MachineReadText } from './MachineReadText';

/**
 * PRD §4.2.3's review screen — the three regions, as ONE client component
 * over data the page resolved under its ONE authorization answer (6B B7).
 *
 *   THE SOURCE      — every promoted page, served through the artifact
 *                     route's fence (?page=N, ext from the 6A M4 manifest);
 *                     the selected fact's cited region highlighted IN PLACE.
 *   WHAT WE READ    — each fact with its citation, §6.5 risk and Q4's
 *                     three-state band; fact rows are BUTTONS, so Tab
 *                     reaches them and Enter selects (A11Y-07), and
 *                     selection MOVES FOCUS to the cited region.
 *   WHAT WE PROPOSE — each pending item independently: Approve · Edit ·
 *                     Reject, one proposal per form, and NO control
 *                     anywhere that touches more than one (AC-INBOX-3 —
 *                     the table made it structural; this screen's only job
 *                     is to not smuggle a batch control back).
 *
 * §6.4'S ABSOLUTE RULE, IN THE ONLY MODE THIS SCREEN HAS EVER RUN: every
 * approve control starts INACTIVE. "Show the evidence" renders the item's
 * crop — cropRect's fractions as pure CSS (R3/F-13: the first production
 * consumer) — inside the item's own card, and only then does approve
 * activate. `confirm_high` is what the enabled click MEANS: the person had
 * the evidence on screen when they decided. One item's evidence never arms
 * another's control.
 *
 * Deliberately JS-gated in the SAFE direction: without JS the controls stay
 * inactive; nothing can be approved unseen.
 */

export type ReviewBand =
  | { kind: 'all_high' }
  | { kind: 'banded'; band: 'high' | 'medium' | 'low' }
  | { kind: 'uncalibrated' };

export type ReviewScreenFact = {
  field: string;
  value: string;
  confidence: number;
  riskClass: string;
  citation: { page: number; bbox: [number, number, number, number] };
  band: ReviewBand;
};

export type ReviewScreenProposal = {
  id: string;
  kind: string;
  version: number;
  payload: Record<string, unknown>;
  status: string;
};

export type ReviewScreenProps = {
  circleId: string;
  arrivalId: string;
  pageCount: number;
  facts: ReviewScreenFact[];
  proposals: ReviewScreenProposal[];
  allHigh: boolean;
  refused?: { kind: 'version' | 'taint'; proposalId: string } | null;
};

function fieldLabel(field: string): string {
  return field.replace(/_/g, ' ');
}

function proposalTitle(p: ReviewScreenProposal): string {
  const payload = p.payload as { field?: string; value?: unknown; title?: string };
  if (p.kind === 'document') return String(payload.title ?? 'File this document');
  if (p.kind === 'conflict') {
    return `${fieldLabel(String(payload.field ?? 'a value'))} changed`;
  }
  if (p.kind === 'task') return String(payload.title ?? 'A task');
  return `${fieldLabel(String(payload.field ?? 'a value'))}: ${String(payload.value ?? '')}`;
}

/**
 * A normalised bbox cut as pure CSS. `translate` percentages are relative
 * to the IMAGE itself, so the offsets need no page aspect ratio; only the
 * frame's height does, and it arrives with the image's own dimensions.
 */
function CropView({
  src,
  bbox,
  alt,
}: {
  src: string;
  bbox: [number, number, number, number];
  alt: string;
}) {
  const [bx, by, bw, bh] = bbox;
  const [pageRatio, setPageRatio] = useState<number | null>(null);
  const frameStyle =
    pageRatio !== null && bw > 0 && bh > 0
      ? { aspectRatio: `${bw} / ${bh * pageRatio}` }
      : undefined;
  return (
    <div className="review-crop-frame" style={frameStyle}>
      {/* Deliberately a plain <img>: these bytes are PRIVATE medical pages
          served no-store through the authenticated artifact route, and
          next/image would put them through an optimizer cache — exactly the
          second byte path and second retention surface the fence forbids. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          width: bw > 0 ? `${100 / bw}%` : '100%',
          transform: `translate(${-bx * 100}%, ${-by * 100}%)`,
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0) setPageRatio(img.naturalHeight / img.naturalWidth);
        }}
      />
    </div>
  );
}

export function ReviewScreen({
  circleId,
  arrivalId,
  pageCount,
  facts,
  proposals,
  allHigh,
  refused = null,
}: ReviewScreenProps) {
  const [selectedFact, setSelectedFact] = useState<number | null>(null);
  const [evidenceShown, setEvidenceShown] = useState<ReadonlySet<string>>(new Set());
  const highlightRef = useRef<HTMLButtonElement | null>(null);
  const factRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // A11Y-07: Enter on a fact selects it AND moves focus to the cited
  // region, so a keyboard user lands where a pointer user's eye does.
  useEffect(() => {
    if (selectedFact === null) return;
    const el = highlightRef.current;
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    el.focus();
  }, [selectedFact]);

  const pageUrl = (page: number) => `/api/artifact/${arrivalId}?page=${page}`;
  const selected = selectedFact === null ? null : facts[selectedFact];

  const showEvidence = (id: string) => {
    setEvidenceShown((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const evidenceFor = (p: ReviewScreenProposal) => {
    const payload = p.payload as { field?: string };
    const fact = payload.field ? facts.find((f) => f.field === payload.field) : undefined;
    if (fact) {
      return (
        <CropView
          src={pageUrl(fact.citation.page)}
          bbox={fact.citation.bbox}
          alt={`The cited region for ${fieldLabel(fact.field)}, page ${fact.citation.page}`}
        />
      );
    }
    // A document-shaped item's evidence is the source itself.
    return (
      <CropView src={pageUrl(1)} bbox={[0, 0, 1, 1]} alt="Page 1 of the original document" />
    );
  };

  const pending = proposals.filter((p) => p.status === 'pending');
  const decided = proposals.filter((p) => p.status !== 'pending');

  return (
    <div>
      {allHigh ? (
        <p className="field-help" role="status">
          We&apos;re reading everything as high-risk until the evaluation set is signed —
          every item needs its evidence on screen before it can be approved.
        </p>
      ) : null}

      <div className="review-grid">
        <section className="review-source" aria-label="The source">
          <h2>The source</h2>
          <p className="meta">
            {pageCount} page{pageCount === 1 ? '' : 's'}
          </p>
          {pageCount === 0 ? (
            <p className="field-help">
              The rendering isn&apos;t ready yet — the original is still the source of
              truth.
            </p>
          ) : null}
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
            <div className="review-page" key={page} id={`review-page-${page}`}>
              {/* A plain <img> on purpose — see CropView's note: private
                  no-store bytes must not enter an optimizer cache. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pageUrl(page)} alt={`Page ${page} of the original`} />
              {selected && selected.citation.page === page ? (
                // A BUTTON, so the region a selection lands on is itself
                // operable: activating it returns focus to the fact
                // (region → facts, the reverse of facts → region).
                <button
                  type="button"
                  ref={highlightRef}
                  className="review-region-highlight"
                  aria-label={`Cited region for ${fieldLabel(selected.field)} — press to return to the fact`}
                  style={{
                    left: `${selected.citation.bbox[0] * 100}%`,
                    top: `${selected.citation.bbox[1] * 100}%`,
                    width: `${selected.citation.bbox[2] * 100}%`,
                    height: `${selected.citation.bbox[3] * 100}%`,
                  }}
                  onClick={() => {
                    if (selectedFact !== null) factRefs.current[selectedFact]?.focus();
                  }}
                />
              ) : null}
              {/* A11Y-08: the page's machine-read text, in the page's own
                  slot so page navigation and text navigation are ONE order. */}
              <MachineReadText arrivalId={arrivalId} page={page} />
            </div>
          ))}
        </section>

        <section className="review-facts" aria-label="What we read">
          <h2>What we read</h2>
          {facts.length === 0 ? (
            <p className="meta">No fields were read from this document.</p>
          ) : null}
          {facts.map((fact, i) => (
            <div className="review-fact-item" key={`${fact.field}-${i}`}>
              <button
                type="button"
                className="review-fact"
                aria-pressed={selectedFact === i}
                ref={(el) => {
                  factRefs.current[i] = el;
                }}
                onClick={() => setSelectedFact(i)}
              >
                <span className="row-title">{fieldLabel(fact.field)}</span>
                <span className="review-fact-value">{fact.value}</span>
                <span className="micro-meta">
                  page {fact.citation.page} · confidence {Math.round(fact.confidence * 100)}%
                  {fact.riskClass === 'high' ? ' · high-risk' : ''}
                </span>
              </button>
              {fact.band.kind === 'banded' ? (
                <span className="badge">{fact.band.band} confidence</span>
              ) : null}
              {fact.band.kind === 'uncalibrated' ? (
                <p className="micro-meta">
                  This field was not calibrated in this run — treat it as unverified.
                </p>
              ) : null}
            </div>
          ))}
        </section>

        <section className="review-proposals" aria-label="What we propose">
          <h2>What we propose</h2>
          {pending.length === 0 ? (
            <p className="meta">Nothing is waiting on you for this item.</p>
          ) : null}
          {pending.map((p) => {
            const armed = evidenceShown.has(p.id);
            const payload = p.payload as { field?: string; value?: unknown; title?: string };
            return (
              <div className="card review-proposal" data-proposal={p.id} key={p.id}>
                <span className="row-title">{proposalTitle(p)}</span>
                {refused && refused.proposalId === p.id ? (
                  <p className="notice" role="alert">
                    This item changed since you looked — your decision was not applied, and
                    what&apos;s shown here is current. Decide again from what you see now.
                  </p>
                ) : null}

                <button
                  type="button"
                  className="button-secondary review-show-evidence"
                  onClick={() => showEvidence(p.id)}
                >
                  Show the evidence
                </button>
                {armed ? <div className="review-crop">{evidenceFor(p)}</div> : null}

                <form
                  method="post"
                  action={`/${circleId}/inbox/${arrivalId}/decide/submit`}
                  className="review-decision"
                >
                  <input type="hidden" name="proposal_id" value={p.id} />
                  <input type="hidden" name="p_expected_version" value={p.version} />
                  {armed ? <input type="hidden" name="confirm_high" value="1" /> : null}

                  {p.kind === 'conflict' ? (
                    <fieldset className="review-conflict">
                      {/* §4.2.5: three outcomes as a CHOICE — no default. */}
                      <legend className="micro-meta">
                        The record and this document disagree. What should happen?
                      </legend>
                      <label>
                        <input type="radio" name="conflict_outcome" value="keep" required /> Keep
                        what the record says
                      </label>
                      <label>
                        <input type="radio" name="conflict_outcome" value="use_new" required /> Use
                        what this document says
                      </label>
                      <label>
                        <input type="radio" name="conflict_outcome" value="keep_both" required />{' '}
                        Keep both — file a task to reconcile them
                      </label>
                    </fieldset>
                  ) : null}

                  {p.kind === 'profile_fact' || p.kind === 'conflict' ? (
                    <label className="field">
                      <span className="field-label">Correct the value first (optional)</span>
                      <input
                        type="text"
                        name="edit_value"
                        defaultValue=""
                        placeholder={String(payload.value ?? '')}
                      />
                    </label>
                  ) : null}
                  {p.kind === 'document' ? (
                    <label className="field">
                      <span className="field-label">Correct the title first (optional)</span>
                      <input
                        type="text"
                        name="edit_title"
                        defaultValue=""
                        placeholder={String(payload.title ?? '')}
                      />
                    </label>
                  ) : null}

                  <label className="field">
                    <span className="field-label">If rejecting, say why (optional)</span>
                    <select name="reject_reason" defaultValue="">
                      <option value="">No reason</option>
                      <option value="wrong">It&apos;s wrong</option>
                      <option value="already_handled">Already handled</option>
                      <option value="not_important">Not important</option>
                      <option value="other">Something else</option>
                    </select>
                  </label>

                  <div className="review-decision-buttons">
                    <Button type="submit" name="decision" value="approve" disabled={!armed}>
                      Approve
                    </Button>{' '}
                    <Button type="submit" name="decision" value="reject" variant="quiet">
                      Reject
                    </Button>
                  </div>
                  {!armed ? (
                    <p className="micro-meta">
                      Show the evidence first — nothing is approved unseen.
                    </p>
                  ) : null}
                </form>
              </div>
            );
          })}
          {decided.map((p) => (
            <div className="card review-proposal" data-proposal={p.id} key={p.id}>
              <span className="row-title">{proposalTitle(p)}</span>
              <p className="meta">
                {p.status === 'rejected'
                  ? 'Rejected — nothing was written.'
                  : p.status === 'approved' || p.status === 'edited_approved'
                    ? 'Approved and written to the record.'
                    : p.status === 'superseded'
                      ? 'Superseded by a newer reading of this document.'
                      : 'No longer applicable.'}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
