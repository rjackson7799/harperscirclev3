// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// ============================================================================
// 6B B7 · the review screen's INTERACTION contract (PRD §4.2.3, §6.4,
// AC-INBOX-2; A11Y-07 is part of the definition of done, not a follow-up).
//
//   · Selecting a FACT highlights its cited region on the source page and
//     MOVES FOCUS to it (Enter on a fact row — fact rows are buttons, so
//     Tab reaches them and Enter activates natively).
//   · §6.4's absolute rule in the shipping mode: an item's approve control
//     is INACTIVE until its evidence — the crop for a field-backed item,
//     the source page for a document item — is rendered ON SCREEN in the
//     item's own card. Activating "Show the evidence" renders the crop and
//     ONLY THEN enables approve; `confirm_high` is what the click then
//     means.
//   · The three band states render distinctly (Q4): all-high globally,
//     banded per fact, uncalibrated per fact as an honest sentence — never
//     an unremarkable low.
// ============================================================================

import { ReviewScreen, type ReviewScreenProps } from '@/components/review/ReviewScreen';

const FACTS: ReviewScreenProps['facts'] = [
  {
    field: 'medication_dose',
    value: '500 mg',
    confidence: 0.93,
    riskClass: 'high',
    citation: { page: 1, bbox: [0.1, 0.2, 0.3, 0.04] },
    band: { kind: 'all_high' },
  },
  {
    field: 'document_date',
    value: '2026-03-14',
    confidence: 0.98,
    riskClass: 'high',
    citation: { page: 1, bbox: [0.1, 0.3, 0.3, 0.04] },
    band: { kind: 'all_high' },
  },
];

const PROPOSALS: ReviewScreenProps['proposals'] = [
  {
    id: 'p-fact',
    kind: 'profile_fact',
    version: 3,
    payload: { field: 'medication_dose', value: '500 mg', domain: 'health', risk_class: 'high' },
    status: 'pending',
  },
  {
    id: 'p-doc',
    kind: 'document',
    version: 1,
    payload: { category: 'medical', title: 'Discharge summary', summary_text: 'A summary.' },
    status: 'pending',
  },
];

function props(overrides: Partial<ReviewScreenProps> = {}): ReviewScreenProps {
  return {
    circleId: 'c-1',
    arrivalId: 'a-1',
    pageCount: 2,
    facts: FACTS,
    proposals: PROPOSALS,
    allHigh: true,
    ...overrides,
  };
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
});

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function click(el: Element | null) {
  expect(el, 'element to click').toBeTruthy();
  act(() => {
    (el as HTMLElement).click();
  });
}

describe('6B B7 · selecting a fact highlights and FOCUSES its cited region (A11Y-07, AC-INBOX-2)', () => {
  it('the region overlay appears on selection and receives focus', () => {
    render(<ReviewScreen {...props()} />);
    expect(container.querySelector('.review-region-highlight')).toBeNull();

    const fact = container.querySelector('button.review-fact');
    click(fact);

    const highlight = container.querySelector('.review-region-highlight');
    expect(highlight).toBeTruthy();
    expect(document.activeElement).toBe(highlight);
  });

  it('fact rows are buttons — Tab reaches them, Enter activates natively', () => {
    render(<ReviewScreen {...props()} />);
    const rows = container.querySelectorAll('button.review-fact');
    expect(rows.length).toBe(2);
  });
});

describe('6B B7 · §6.4: the evidence gates the control', () => {
  it('approve is disabled until the item’s evidence is shown, then enables', () => {
    render(<ReviewScreen {...props()} />);
    const card = container.querySelector('[data-proposal="p-fact"]')!;
    const approve = card.querySelector('button[value="approve"]') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(card.querySelector('.review-crop')).toBeNull();

    click(card.querySelector('button.review-show-evidence'));

    expect(card.querySelector('.review-crop')).toBeTruthy();
    const after = card.querySelector('button[value="approve"]') as HTMLButtonElement;
    expect(after.disabled).toBe(false);
  });

  it('showing ONE item’s evidence does not arm another item’s control', () => {
    render(<ReviewScreen {...props()} />);
    click(
      container.querySelector('[data-proposal="p-fact"] button.review-show-evidence'),
    );
    const other = container.querySelector(
      '[data-proposal="p-doc"] button[value="approve"]',
    ) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
  });

  it('a document item’s evidence is the source page itself', () => {
    render(<ReviewScreen {...props()} />);
    const card = container.querySelector('[data-proposal="p-doc"]')!;
    click(card.querySelector('button.review-show-evidence'));
    const img = card.querySelector('.review-crop img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain('/api/artifact/a-1?page=1');
  });
});

describe('6B B9 · A11Y-08: machine-read text, labelled and offered per page', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function open(pageIndex = 0) {
    render(<ReviewScreen {...props()} />);
    const toggles = container.querySelectorAll('button.review-machine-text-toggle');
    expect(toggles.length).toBe(2); // one per page — parity with page navigation
    await act(async () => {
      (toggles[pageIndex] as HTMLElement).click();
    });
    return toggles[pageIndex] as HTMLButtonElement;
  }

  it('every page offers its machine-read text under §6.9’s exact label', () => {
    render(<ReviewScreen {...props()} />);
    const toggles = container.querySelectorAll('button.review-machine-text-toggle');
    expect(toggles.length).toBe(2);
    for (const t of Array.from(toggles)) {
      expect(t.textContent).toMatch(/machine-read( text)? — may contain errors/i);
    }
  });

  it('opening a page’s text fetches THROUGH the artifact fence and renders it', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Amoxicillin 500 mg', { status: 200 }));
    const toggle = await open(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/artifact/a-1?page=1&text=1');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.review-machine-text')?.textContent).toContain(
      'Amoxicillin 500 mg',
    );
  });

  // -------------------------------------------------------------------
  // 7D · R1/F-4 — every arm says only what THIS CLIENT OBSERVED.
  //
  // A 404 on the sibling path is produced by an absence, by an
  // authorization refusal, and by a revocation, and the client cannot tell
  // which. "No machine-read text is stored for this page." asserted a
  // STORAGE fact out of all three — on the same route whose image half
  // splits rendition_page_missing from storage_timeout at length because
  // "this route does not guess". The statuses split only where the fact is
  // a storage fact (the route's own half of R1/F-4); the WORDS change on
  // every arm, because no arm can attribute what it saw.
  // -------------------------------------------------------------------
  it('an empty transcript is SAID as what came back, never blank and never as a claim about the reading', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await open(0);
    expect(container.textContent).toMatch(/returned nothing readable/i);
    expect(container.textContent).not.toMatch(/couldn(’|')t produce reliable text/i);
  });

  it('a 404 is said as UNAVAILABILITY, not as a fact about what is stored — the client cannot know which of three answers it got', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    await open(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/artifact/a-1?page=2&text=1');
    expect(container.textContent).toMatch(/no machine-read text is available/i);
    expect(container.textContent).not.toMatch(/is stored/i);
  });

  it('a reported storage answer (503) is its own arm and still says so — the three answers stay three', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'machine_text_unreadable' }), { status: 503 }),
    );
    await open(0);
    expect(container.textContent).toMatch(/couldn(’|')t be loaded right now/i);
  });
});

describe('6B B7 · the three band states render distinctly (Q4)', () => {
  it('uncalibrated is an honest sentence per fact, never an unremarkable low', () => {
    render(
      <ReviewScreen
        {...props({
          allHigh: false,
          facts: [
            { ...FACTS[0], band: { kind: 'banded', band: 'low' } },
            { ...FACTS[1], band: { kind: 'uncalibrated' } },
          ],
        })}
      />,
    );
    expect(container.textContent).toMatch(/not calibrated/i);
    expect(container.textContent).toMatch(/low confidence/i);
  });
});
