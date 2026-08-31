import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// 6B B8 · the decide submit route — the FIRST caller that can reach
// hc.approve_proposal / hc.reject_proposal from the app (slice-6 plan B8;
// PRD §4.2.3; AC-INBOX-4/12; ADR-0025 D16 — the payload-contract migration
// landed BEFORE this, as ruled, so the surface this route posts to cannot
// crash at a person's click).
//
// WHERE AN EDIT LANDS is Q7's smaller sibling, settled here: a corrected
// value rides `p_edits.fields` into the approved object and the
// `extractions` row is NEVER rewritten — the extraction is the honest record
// of what the model read, and this route has no path that touches it (it
// imports the two decide wrappers and nothing else).
//
// IDEMPOTENCY IS DETERMINISTIC, derived from what the person decided —
// (proposal, version, decision, outcome) — so a double-click or a browser
// re-POST replays the stored result (AC-INBOX-12's shape, actor-bound by
// the DB) instead of burning a fresh key into a refusal. A key that changed
// per request would turn every resubmit into `approval_refused`.
//
// REFUSALS: `proposal_version_changed` / `proposal_taint_changed` carry
// their NAMED markers back to the review screen, which re-renders with what
// changed highlighted (B7). Every other refusal is DEF-10's one shape and
// lands the one honest `?e=decide` marker — never a 500, never an oracle.
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const review = {
  approveProposal: vi.fn(),
  rejectProposal: vi.fn(),
};
vi.mock('@/lib/hc/review', () => review);

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const PROPOSAL = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

beforeEach(() => {
  vi.clearAllMocks();
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  review.approveProposal.mockResolvedValue({ status: 'approved', arrival_state: 'filed' });
  review.rejectProposal.mockResolvedValue({ status: 'rejected', arrival_state: 'nothing_filed' });
});

async function post(body: Record<string, string>): Promise<Response> {
  const { POST } = await import('@/app/(app)/[circle]/inbox/[arrival]/decide/submit/route');
  return POST(
    new Request(`http://local.test/${CIRCLE}/inbox/${ARRIVAL}/decide/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    }),
    { params: Promise.resolve({ circle: CIRCLE, arrival: ARRIVAL }) },
  );
}

describe('6B B8 · approve — p_edits carries exactly what the person did', () => {
  it('a bare approve with the §6.4 confirmation maps confirm_high to a REAL boolean', async () => {
    const res = await post({
      proposal_id: PROPOSAL,
      p_expected_version: '3',
      decision: 'approve',
      confirm_high: '1',
    });
    expect(review.approveProposal).toHaveBeenCalledWith(
      CLAIMS,
      PROPOSAL,
      3,
      `decide:${PROPOSAL}:v3:approve:-`,
      { confirm_high: true },
    );
    expect(res.status).toBe(303);
    const location = res.headers.get('location') ?? '';
    // RELATIVE, never absolute (the cookie trap).
    expect(location.startsWith('/')).toBe(true);
    expect(location).toBe(`/${CIRCLE}/inbox/${ARRIVAL}?decided=1`);
  });

  it('no edits, no outcome, no confirmation ⇒ p_edits is NULL, not an empty object', async () => {
    await post({ proposal_id: PROPOSAL, p_expected_version: '1', decision: 'approve' });
    expect(review.approveProposal).toHaveBeenCalledWith(
      CLAIMS,
      PROPOSAL,
      1,
      `decide:${PROPOSAL}:v1:approve:-`,
      null,
    );
  });

  it('a typed correction rides p_edits.fields — value and title, and NOTHING else', async () => {
    await post({
      proposal_id: PROPOSAL,
      p_expected_version: '3',
      decision: 'approve',
      edit_value: '250 mg',
      edit_title: 'Discharge summary (corrected)',
      confirm_high: '1',
    });
    expect(review.approveProposal).toHaveBeenCalledWith(CLAIMS, PROPOSAL, 3, expect.any(String), {
      fields: { value: '250 mg', title: 'Discharge summary (corrected)' },
      confirm_high: true,
    });
  });

  it('a whitespace-only edit is NO edit — the proposal is approved as drafted', async () => {
    await post({
      proposal_id: PROPOSAL,
      p_expected_version: '1',
      decision: 'approve',
      edit_value: '   ',
      edit_title: '',
    });
    expect(review.approveProposal).toHaveBeenCalledWith(CLAIMS, PROPOSAL, 1, expect.any(String), null);
  });

  it('a conflict outcome rides p_edits AND the idempotency identity (5A-M4)', async () => {
    await post({
      proposal_id: PROPOSAL,
      p_expected_version: '2',
      decision: 'approve',
      conflict_outcome: 'keep_both',
    });
    expect(review.approveProposal).toHaveBeenCalledWith(
      CLAIMS,
      PROPOSAL,
      2,
      `decide:${PROPOSAL}:v2:approve:keep_both`,
      { conflict_outcome: 'keep_both' },
    );
  });

  it('the key is DETERMINISTIC: the same decision twice presents the same key (AC-INBOX-12)', async () => {
    const body = {
      proposal_id: PROPOSAL,
      p_expected_version: '3',
      decision: 'approve',
      confirm_high: '1',
    };
    await post(body);
    await post(body);
    expect(review.approveProposal).toHaveBeenCalledTimes(2);
    const [first, second] = review.approveProposal.mock.calls;
    expect(first[3]).toBe(second[3]);
  });
});

describe('6B B8 · reject — §4.2.3’s optional one-tap reason', () => {
  it('a chosen reason is passed through; the vocabulary is the DB’s to enforce', async () => {
    const res = await post({
      proposal_id: PROPOSAL,
      p_expected_version: '3',
      decision: 'reject',
      reject_reason: 'already_handled',
    });
    expect(review.rejectProposal).toHaveBeenCalledWith(
      CLAIMS,
      PROPOSAL,
      3,
      `decide:${PROPOSAL}:v3:reject:-`,
      'already_handled',
    );
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox/${ARRIVAL}?decided=1`);
  });

  it('no reason chosen is NULL — one optional tap, never a required justification', async () => {
    await post({ proposal_id: PROPOSAL, p_expected_version: '3', decision: 'reject', reject_reason: '' });
    expect(review.rejectProposal).toHaveBeenCalledWith(CLAIMS, PROPOSAL, 3, expect.any(String), null);
  });
});

describe('6B B8 · refusals carry their NAMED markers; everything else is one shape', () => {
  it('proposal_version_changed redirects to ?refused=version&proposal=…', async () => {
    review.approveProposal.mockRejectedValueOnce(new Error('proposal_version_changed'));
    const res = await post({ proposal_id: PROPOSAL, p_expected_version: '3', decision: 'approve' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `/${CIRCLE}/inbox/${ARRIVAL}?refused=version&proposal=${PROPOSAL}`,
    );
  });

  it('proposal_taint_changed redirects to ?refused=taint&proposal=…', async () => {
    review.approveProposal.mockRejectedValueOnce(new Error('proposal_taint_changed'));
    const res = await post({ proposal_id: PROPOSAL, p_expected_version: '3', decision: 'approve' });
    expect(res.headers.get('location')).toBe(
      `/${CIRCLE}/inbox/${ARRIVAL}?refused=taint&proposal=${PROPOSAL}`,
    );
  });

  it('every other refusal is DEF-10’s one shape — ?e=decide, never a 500, never an oracle', async () => {
    for (const message of ['approval_refused', 'freeze_active', 'high_risk_unconfirmed']) {
      review.approveProposal.mockRejectedValueOnce(new Error(message));
      const res = await post({ proposal_id: PROPOSAL, p_expected_version: '3', decision: 'approve' });
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox/${ARRIVAL}?e=decide`);
    }
  });

  it('a reject refusal lands the same one shape', async () => {
    review.rejectProposal.mockRejectedValueOnce(new Error('approval_refused'));
    const res = await post({ proposal_id: PROPOSAL, p_expected_version: '3', decision: 'reject' });
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox/${ARRIVAL}?e=decide`);
  });
});

describe('6B B8 · nothing malformed reaches the definer', () => {
  it('no session ⇒ sign-in with next back to this arrival, and nothing is decided', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const res = await post({ proposal_id: PROPOSAL, p_expected_version: '3', decision: 'approve' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(review.approveProposal).not.toHaveBeenCalled();
    expect(review.rejectProposal).not.toHaveBeenCalled();
  });

  it('a missing proposal, an unparseable version and an unknown decision each stop at the door', async () => {
    for (const body of [
      { p_expected_version: '3', decision: 'approve' },
      { proposal_id: PROPOSAL, p_expected_version: 'abc', decision: 'approve' },
      { proposal_id: PROPOSAL, p_expected_version: '3', decision: 'destroy' },
    ]) {
      const res = await post(body as Record<string, string>);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox/${ARRIVAL}?e=decide`);
    }
    expect(review.approveProposal).not.toHaveBeenCalled();
    expect(review.rejectProposal).not.toHaveBeenCalled();
  });
});
