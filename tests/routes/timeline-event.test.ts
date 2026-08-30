import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7B B3 · /[circle]/timeline/[event] and the add route (PRD §4.4.3; AC-TL-2;
// TLN-02). The detail resolves the source as far as the caller's access
// reaches: an AI-created event shows the arrival, the extraction and the
// approver; a manual event shows the person and the date, and the document
// it was linked to; a source the caller cannot open is named, never linked.
// The add route is ONE action — create_manual_proposal then approve_proposal
// — landing on the event as its receipt.
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (p: string) => {
    throw new Error(`NEXT_REDIRECT ${p}`);
  },
}));

const tlHc = { eventById: vi.fn(), addManualEvent: vi.fn() };
vi.mock('@/lib/hc/timeline', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/timeline')>('@/lib/hc/timeline');
  return { ...actual, ...tlHc };
});
const tasksHc = { circleSubjects: vi.fn() };
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const NELL = '22222222-0000-4000-8000-000000000002';
const EVENT = 'eeeeeeee-0000-4000-8000-0000000000e1';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const DOC = '66666666-0000-4000-8000-000000000006';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const AI_EVENT = {
  id: EVENT,
  circle_id: CIRCLE,
  subject_id: NELL,
  subject_name: 'Nell',
  subject_seq: 1,
  kind: 'medical',
  summary: 'Discharged from Riverbend',
  when: { kind: 'date', on: '2026-07-12' },
  sort_at: '2026-07-12T12:00:00.000Z',
  episode: { id: 'ep-1', title: 'The fall and the stay at Riverbend' },
  source: { kind: 'arrival', arrival_id: ARRIVAL, channel: 'email', label: 'Riverbend Cardiology', received_at: '2026-07-13T09:00:00Z' },
  extraction: { model_id: 'claude-fixture', prompt_version: 'hc-6b-3' },
  linked_documents: [],
  approved_at: '2026-07-13T10:00:00Z',
  approver_display_name: 'Sarah',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tlHc.eventById.mockResolvedValue(AI_EVENT);
  tlHc.addManualEvent.mockResolvedValue({ event_id: EVENT, proposal_id: 'p-1', arrival_id: 'a-1' });
  tasksHc.circleSubjects.mockResolvedValue([{ id: NELL, first_name: 'Nell', timezone: 'America/New_York', seq: 1 }]);
});

async function renderEvent(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/timeline/[event]/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE, event: EVENT }), searchParams: Promise.resolve(searchParams) }),
  );
}

function post(fields: Record<string, string>): Request {
  return new Request(`http://local.test/${CIRCLE}/timeline/add/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}
const ctx = { params: Promise.resolve({ circle: CIRCLE }) };

describe('B3 · the event detail resolves its source (AC-TL-2)', () => {
  it('an AI-created event: the arrival (linked), the extraction, the approver, its subject, its date, its episode', async () => {
    const html = await renderEvent();
    expect(html).toContain('Discharged from Riverbend');
    expect(html).toContain('class="subject-label"');
    expect(html).toContain('Nell');
    expect(html).toContain('Sunday, July 12');
    expect(html).toContain(`href="/${CIRCLE}/inbox/${ARRIVAL}"`);
    expect(html).toContain('Riverbend Cardiology');
    expect(html).toMatch(/Read by AI/);
    expect(html).toContain('claude-fixture');
    expect(html).toContain('hc-6b-3');
    expect(html).toMatch(/Approved by Sarah/);
    expect(html).toContain('July 13');
    expect(html).toContain('The fall and the stay at Riverbend');
    expect(html).toContain('Medical');
  });

  it('a manual event: the person and the date, and the document it was linked to — named, and said plainly not yet openable', async () => {
    tlHc.eventById.mockResolvedValueOnce({
      ...AI_EVENT,
      source: { kind: 'manual' },
      extraction: null,
      episode: null,
      linked_documents: [{ id: DOC, title: 'Discharge summary' }],
      approved_at: '2026-07-20T18:00:00Z',
    });
    const html = await renderEvent();
    expect(html).toMatch(/Entered by Sarah on July 20/);
    expect(html).not.toMatch(/Read by AI/);
    expect(html).toContain('Discharge summary');
    expect(html).not.toContain(`href="/${CIRCLE}/documents`);
    expect(html).toMatch(/upcoming update/);
  });

  it('a source the caller cannot open is named, never linked; the read behind it is not claimed', async () => {
    tlHc.eventById.mockResolvedValueOnce({ ...AI_EVENT, source: { kind: 'arrival_unseen' }, extraction: null });
    const html = await renderEvent();
    expect(html).toContain('an item in the Care Inbox');
    expect(html).not.toContain(`href="/${CIRCLE}/inbox/`);
    expect(html).not.toMatch(/Read by AI/);
  });

  it('?added=1 is the receipt: says it was added, with its source', async () => {
    const html = await renderEvent({ added: '1' });
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/Added to the thread/);
  });

  it('nonexistent, foreign and below-summary are notFound — one shape', async () => {
    tlHc.eventById.mockResolvedValueOnce(null);
    await expect(renderEvent()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('B3 · the add route — one action, landing on the event', () => {
  it('a complete entry rides addManualEvent with the subject’s zone and lands on the event as its receipt', async () => {
    const { POST } = await import('@/app/(app)/[circle]/timeline/add/submit/route');
    const res = await POST(
      post({ subject_id: NELL, kind: 'care', summary: '  Home health started  ', occurred_on: '2026-07-20', document_id: DOC }),
      ctx,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/timeline/${EVENT}?added=1`);
    expect(tlHc.addManualEvent).toHaveBeenCalledWith(CLAIMS, CIRCLE, {
      subjectId: NELL,
      kind: 'care',
      summary: 'Home health started',
      occurredOn: '2026-07-20',
      occurredZone: 'America/New_York',
      documentId: DOC,
    });
  });

  it('an empty document is no document; whitespace is no summary; a bad date or kind never reaches the definer', async () => {
    const { POST } = await import('@/app/(app)/[circle]/timeline/add/submit/route');
    let res = await POST(post({ subject_id: NELL, kind: 'admin', summary: 'Renewed the permit', occurred_on: '2026-07-20', document_id: '' }), ctx);
    expect(tlHc.addManualEvent).toHaveBeenLastCalledWith(CLAIMS, CIRCLE, expect.not.objectContaining({ documentId: expect.anything() }));
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/timeline/${EVENT}?added=1`);

    for (const bad of [
      { subject_id: NELL, kind: 'care', summary: '   ', occurred_on: '2026-07-20' },
      { subject_id: NELL, kind: 'care', summary: 'x', occurred_on: 'July 20' },
      { subject_id: NELL, kind: 'memory', summary: 'x', occurred_on: '2026-07-20' },
      { subject_id: 'nope', kind: 'care', summary: 'x', occurred_on: '2026-07-20' },
    ]) {
      res = await POST(post(bad), ctx);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/${CIRCLE}/timeline?subject=${bad.subject_id === 'nope' ? NELL : NELL}&e=add`);
    }
    expect(tlHc.addManualEvent).toHaveBeenCalledTimes(1);
  });

  it('a refusal (below the cliff, a freeze) lands back with one marker, never a 500', async () => {
    tlHc.addManualEvent.mockRejectedValueOnce(new Error('draft_refused'));
    const { POST } = await import('@/app/(app)/[circle]/timeline/add/submit/route');
    const res = await POST(post({ subject_id: NELL, kind: 'care', summary: 'x', occurred_on: '2026-07-20' }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/timeline?subject=${NELL}&e=add`);
  });
});
