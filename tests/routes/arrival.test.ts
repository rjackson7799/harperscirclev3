import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 6B B6 · the [arrival] route — the review screen's door (slice-6 plan B6;
// PRD §4.2.3; AC-INBOX-8 as §4.4 of the plan states it).
//
// AUTHORIZATION IS RESOLVED ONCE PER REQUEST. 6A M2/M5 unified the four
// gates — the source, the facts, the decisions and the receipt all ask
// `view` over all five domains of the SAME arrival — so this page asks that
// question exactly once (`hc.visible_at`, the very predicate the artifact
// route and hc.log_artifact_read enforce) and every region renders from the
// one answer. A page that asked per region could disagree with itself; the
// DB's one-gate property deserves a one-probe consumer.
//
// AC-INBOX-8, at its honest reading (plan §4.4): the member who can open
// the arrival at all but sits below view×5 sees the ROW and the STATE — no
// source, no facts, no proposals, no controls — and ONE line saying what
// fuller access would show. Zero rows stays the one shape for nonexistent,
// foreign, deleted, revoked and below-SUMMARY alike (notFound).
//
// Test class: MOCKED ROUTE CONTRACT; the live authority is the B9 review
// legs under the local-gate protocol.
// ============================================================================

const session = { liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const review = {
  arrivalForReview: vi.fn(),
  extractionsFor: vi.fn(),
  proposalsFor: vi.fn(),
  recentRecordChange: vi.fn(),
};
vi.mock('@/lib/hc/review', () => review);

const artifacts = { readableRendition: vi.fn() };
vi.mock('@/lib/hc/artifacts', () => artifacts);

const inbox = { productStates: vi.fn() };
vi.mock('@/lib/hc/inbox', () => inbox);

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const ROW = {
  id: ARRIVAL,
  state: 'proposals_ready',
  channel: 'upload',
  sender_address: null,
  sender_display_name: null,
  received_at: '2026-08-20T10:00:00Z',
  subject_id: '22222222-0000-4000-8000-000000000002',
  scan_verdict: 'clean',
  can_view: true,
};

const FACTS = [
  {
    field: 'medication_dose',
    value: '500 mg',
    confidence: 0.93,
    risk_class: 'high',
    citation: { page: 1, bbox: [0.1, 0.2, 0.3, 0.04] as [number, number, number, number] },
    model_id: 'claude-opus-5',
    prompt_version: 'hc-6b-1+abc',
  },
  {
    field: 'document_date',
    value: '2026-03-14',
    confidence: 0.98,
    risk_class: 'high',
    citation: { page: 2, bbox: [0.1, 0.3, 0.3, 0.04] as [number, number, number, number] },
    model_id: 'claude-opus-5',
    prompt_version: 'hc-6b-1+abc',
  },
];

const PROPOSALS = [
  {
    id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    kind: 'profile_fact',
    version: 3,
    payload: { field: 'medication_dose', value: '500 mg', domain: 'health', risk_class: 'high' },
    status: 'pending',
    supersedes_id: null,
    anomaly_flags: [],
    decided_at: null,
    reject_reason: null,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-0000000000a2',
    kind: 'document',
    version: 1,
    payload: { category: 'medical', title: 'Discharge summary', summary_text: 'A summary.' },
    status: 'pending',
    supersedes_id: null,
    anomaly_flags: [],
    decided_at: null,
    reject_reason: null,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-0000000000a3',
    kind: 'conflict',
    version: 2,
    payload: { field: 'medication_dose', value: '500 mg', domain: 'health' },
    status: 'pending',
    supersedes_id: null,
    anomaly_flags: [],
    decided_at: null,
    reject_reason: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  review.arrivalForReview.mockResolvedValue(ROW);
  review.extractionsFor.mockResolvedValue(FACTS);
  review.proposalsFor.mockResolvedValue(PROPOSALS);
  review.recentRecordChange.mockResolvedValue(null);
  artifacts.readableRendition.mockResolvedValue({ page_count: 2, page_exts: ['png', 'jpg'] });
  inbox.productStates.mockResolvedValue(new Map([[ARRIVAL, 'Needs you']]));
});

async function renderArrival(
  arrival: string = ARRIVAL,
  searchParams: Record<string, string> = {},
): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/inbox/[arrival]/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE, arrival }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe('6B B6 · one resolution, four gates', () => {
  it('authorization is resolved ONCE per request', async () => {
    await renderArrival();
    expect(review.arrivalForReview).toHaveBeenCalledTimes(1);
    expect(review.arrivalForReview).toHaveBeenCalledWith(CLAIMS, CIRCLE, ARRIVAL);
  });

  it('a ghost, a foreign arrival and below-summary are ONE shape — not found', async () => {
    review.arrivalForReview.mockResolvedValueOnce(null);
    await expect(renderArrival()).rejects.toThrow();
  });

  it('a view member sees the state and can open the original', async () => {
    const html = await renderArrival();
    expect(html).toContain('Needs you');
    expect(html).toContain(`/api/artifact/${ARRIVAL}`);
  });
});

// ============================================================================
// 6B B7 · the review screen — PRD §4.2.3's three regions (the slice's
// centre). The source, what we read, what we propose — composed over the ONE
// authorization answer, with §6.4's absolute rule wired into the controls:
// in all-high-risk mode (the shipping mode, and therefore the design mode)
// EVERY approve control starts INACTIVE and activates only once its
// evidence is rendered on screen; `confirm_high` is what the person's
// action then MEANS.
// ============================================================================
describe('6B B7 · the three regions render from the one answer', () => {
  it('the SOURCE region serves every manifest page through the artifact route, ext from the manifest', async () => {
    const html = await renderArrival();
    expect(html).toContain(`/api/artifact/${ARRIVAL}?page=1`);
    expect(html).toContain(`/api/artifact/${ARRIVAL}?page=2`);
  });

  it('a page the manifest names is REPORTED when missing — the screen can say it, not 404 it', async () => {
    // The route reports 503 rendition_page_missing (B2); the screen's page
    // slots carry the manifest count so the person sees "2 pages" even
    // before images resolve.
    const html = await renderArrival();
    expect(html).toMatch(/2 pages/i);
  });

  it('WHAT WE READ lists each fact with its confidence and risk, and facts are focusable (A11Y-07)', async () => {
    const html = await renderArrival();
    expect(html).toContain('medication_dose'.replace('_', ' ')); // humanised label
    expect(html).toContain('500 mg');
    expect(html).toContain('2026-03-14');
    // The fact rows are BUTTONS — natively tabbable, Enter selects.
    expect(html).toMatch(/class="[^"]*review-fact[^"]*"/);
  });

  it('WHAT WE PROPOSE renders each pending item independently', async () => {
    const html = await renderArrival();
    expect(html).toContain('Discharge summary');
    expect((html.match(/name="proposal_id"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('6B B7 · AC-INBOX-3: NO control approves more than one', () => {
  it('every decision form carries EXACTLY ONE proposal_id, and no batch control exists', async () => {
    const html = await renderArrival();
    const forms = html.split('<form').slice(1);
    for (const form of forms) {
      const body = form.slice(0, form.indexOf('</form>'));
      const ids = body.match(/name="proposal_id"/g) ?? [];
      expect(ids.length, 'one proposal per decision form').toBeLessThanOrEqual(1);
    }
    expect(html).not.toMatch(/approve all|select all|approve everything/i);
  });
});

describe('6B B7 · §6.4 in the shipping mode: the crop gates the control', () => {
  it('every approve control starts INACTIVE — the crop is not yet on screen', async () => {
    const html = await renderArrival();
    const approves = html.match(/<button[^>]*value="approve"[^>]*>/g) ?? [];
    expect(approves.length).toBeGreaterThanOrEqual(3);
    for (const b of approves) expect(b).toContain('disabled');
  });

  it('the all-high mode is rendered ONCE, globally — a silent all-high is invisible no longer (R1/F-6)', async () => {
    const html = await renderArrival();
    const notices = html.match(/high-risk until the evaluation set is signed/g) ?? [];
    expect(notices.length).toBe(1);
  });
});

describe('6B B7 · versioning and conflicts', () => {
  it('the version is rendered and rides every decision form as p_expected_version', async () => {
    const html = await renderArrival();
    expect(html).toContain('name="p_expected_version" value="3"');
    expect(html).toContain('name="p_expected_version" value="1"');
    expect(html).toContain('name="p_expected_version" value="2"');
  });

  it('a conflict offers §4.2.5&#x27;s three outcomes as a CHOICE — none pre-selected', async () => {
    const html = await renderArrival();
    for (const outcome of ['keep', 'use_new', 'keep_both']) {
      expect(html).toContain(`value="${outcome}"`);
    }
    const radios = html.match(/<input[^>]*name="conflict_outcome"[^>]*>/g) ?? [];
    expect(radios.length).toBe(3);
    for (const r of radios) expect(r).not.toContain('checked');
  });

  it('a version refusal re-renders with WHAT CHANGED highlighted, never a bare error', async () => {
    const html = await renderArrival(ARRIVAL, {
      refused: 'version',
      proposal: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    });
    expect(html).toMatch(/changed since you looked/i);
  });

  it('rejection offers §4.2.3&#x27;s bounded reasons, optionally', async () => {
    const html = await renderArrival();
    for (const reason of ['wrong', 'already_handled', 'not_important', 'other']) {
      expect(html).toContain(`value="${reason}"`);
    }
  });
});

describe('6B B7 · presence, muted, never locking (§4.2.9)', () => {
  it('says only what hc.presence knows: the record changed, nothing about who is looking', async () => {
    review.recentRecordChange.mockResolvedValueOnce('2026-08-24T10:00:00Z');
    const html = await renderArrival();
    expect(html).toMatch(/record (has )?changed/i);
    expect(html).not.toMatch(/is (in|viewing)/i);
  });
});

describe('6B B6 · AC-INBOX-8: the summary-×5 member sees the row, the state, and ONE line', () => {
  it('below view×5: no source, no facts, no controls — and the one honest line', async () => {
    review.arrivalForReview.mockResolvedValueOnce({ ...ROW, can_view: false });
    const html = await renderArrival();
    // The row and the state — what summary already grants.
    expect(html).toContain('Needs you');
    // No source…
    expect(html).not.toContain(`/api/artifact/${ARRIVAL}`);
    // …no controls of any kind…
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    // …and the one line, saying what fuller access would show without
    // asserting anything about the contents.
    expect(html).toContain('fuller access');
  });
});
