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

const review = { arrivalForReview: vi.fn() };
vi.mock('@/lib/hc/review', () => review);

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

beforeEach(() => {
  vi.clearAllMocks();
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  review.arrivalForReview.mockResolvedValue(ROW);
  inbox.productStates.mockResolvedValue(new Map([[ARRIVAL, 'Needs you']]));
});

async function renderArrival(arrival: string = ARRIVAL): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/inbox/[arrival]/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE, arrival }) }),
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
