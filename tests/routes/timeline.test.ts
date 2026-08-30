import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7B B3 · the Timeline (PRD §4.4; TLN-01/02/03; AC-TL-2/3/4). Built on the
// B1 floor (6afffb7 pinned the columns, the error state, the label and the
// provenance; the columns pin now lives in tests/hc/timeline.test.ts, which
// reads them live) — the read moves to lib/hc/timeline.
//
//   · two subjects, two threads: a switch, and a COMBINED view that is
//     labelled and in which every row is subject-labelled — nothing merges
//     silently (§4.4.1, AC-TL-4);
//   · filters by kind — medical · care · admin; `memory` NEVER renders as an
//     empty filter — and by date range;
//   · the creation entry is the FIRST row of every thread (§4.4.4); a subject
//     with only that entry shows it; "Nothing on the thread yet." only when
//     there is truly nothing to show;
//   · an episode renders as a WRAPPER and never conceals its events (AC-TL-3);
//   · every row shows its source (AC-TL-2): the arrival linked or named, the
//     AI read, the approver; a manual event the person and the date;
//   · add by hand: the ONE control, only for a member who may complete the
//     one action (§4.4.3, TLN-02) — subject, date, kind, one line, optional
//     document — nothing pre-filled;
//   · error and budget states are named, never blank.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority: tests/hc/timeline
// .test.ts and the B4 record legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const tlHc = {
  listEvents: vi.fn(),
  creationEntries: vi.fn(),
  canAddByHand: vi.fn(),
  subjectDocuments: vi.fn(),
};
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
const MARCUS = '22222222-0000-4000-8000-000000000003';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

function event(over: Record<string, unknown>) {
  return {
    id: 'e-0',
    circle_id: CIRCLE,
    subject_id: NELL,
    subject_name: 'Nell',
    subject_seq: 1,
    kind: 'medical',
    summary: 'Discharged from Riverbend',
    when: { kind: 'date', on: '2026-07-12' },
    sort_at: '2026-07-12T12:00:00.000Z',
    episode: null,
    source: { kind: 'arrival', arrival_id: ARRIVAL, channel: 'email', label: 'Riverbend Cardiology', received_at: '2026-07-13T09:00:00Z' },
    extraction: { model_id: 'claude-fixture', prompt_version: 'hc-6b-3' },
    linked_documents: [],
    approved_at: '2026-07-13T10:00:00Z',
    approver_display_name: 'Sarah',
    ...over,
  };
}

const NELL_EVENTS = [
  event({ id: 'e-1', episode: { id: 'ep-1', title: 'The fall and the stay at Riverbend' } }),
  event({
    id: 'e-2',
    kind: 'care',
    summary: 'Home health started',
    when: { kind: 'date', on: '2026-07-20' },
    sort_at: '2026-07-20T12:00:00.000Z',
    episode: { id: 'ep-1', title: 'The fall and the stay at Riverbend' },
    source: { kind: 'manual' },
    extraction: null,
    approved_at: '2026-07-20T18:00:00Z',
  }),
  event({
    id: 'e-3',
    kind: 'admin',
    summary: 'Cardiology follow-up',
    when: { kind: 'appointment', local_at: '2026-09-04T15:00:00', iana_zone: 'America/Denver', instant: '2026-09-04T21:00:00.000Z' },
    sort_at: '2026-09-04T21:00:00.000Z',
    source: { kind: 'arrival_unseen' },
    extraction: null,
  }),
];
const MARCUS_EVENT = event({
  id: 'e-m1',
  subject_id: MARCUS,
  subject_name: 'Marcus',
  subject_seq: 2,
  kind: 'care',
  summary: 'Call from the nurse',
  when: { kind: 'floating', local_at: '2026-08-01T09:30:00' },
  sort_at: '2026-08-01T09:30:00.000Z',
  source: { kind: 'none' },
  extraction: null,
});
const CREATION = [
  { subject_name: 'Nell', custodian: 'Sarah', declared_on: '2026-07-01', occurred_at: '2026-07-01T10:00:00Z', seq: 1 },
  { subject_name: 'Marcus', custodian: 'Sarah', declared_on: '2026-07-01', occurred_at: '2026-07-01T10:00:00Z', seq: 2 },
];
const SUBJECTS = [
  { id: NELL, first_name: 'Nell', timezone: 'America/New_York', seq: 1 },
  { id: MARCUS, first_name: 'Marcus', timezone: 'America/Chicago', seq: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tasksHc.circleSubjects.mockResolvedValue(SUBJECTS);
  tlHc.listEvents.mockImplementation(async (_c: unknown, _circle: string, opts: { subject: string; kind?: string }) => {
    let rows = opts.subject === 'all' ? [...NELL_EVENTS, MARCUS_EVENT] : opts.subject === NELL ? NELL_EVENTS : opts.subject === MARCUS ? [MARCUS_EVENT] : [];
    if (opts.kind) rows = rows.filter((r) => r.kind === opts.kind);
    return rows;
  });
  tlHc.creationEntries.mockResolvedValue(CREATION);
  tlHc.canAddByHand.mockResolvedValue(true);
  tlHc.subjectDocuments.mockResolvedValue([{ id: 'd-1', title: 'Discharge summary', filed_on: '2026-07-12' }]);
});
afterEach(() => vi.useRealTimers());

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/timeline/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }), searchParams: Promise.resolve(searchParams) }),
  );
}

function eventLinks(html: string): string[] {
  return [...html.matchAll(new RegExp(`href="/${CIRCLE}/timeline/([^"?/]+)"`, 'g'))].map((m) => m[1]);
}

describe('B3 · two subjects, two threads, a switch, and a labelled combined view', () => {
  it("defaults to the founding subject's thread, with the switch and the creation entry FIRST", async () => {
    const html = await render();
    expect(tlHc.listEvents).toHaveBeenCalledWith(CLAIMS, CIRCLE, expect.objectContaining({ subject: NELL }));
    expect(eventLinks(html)).toEqual(['e-1', 'e-2', 'e-3']);
    // The switch: each subject and the combined view, the active one aria-current.
    expect(html).toContain(`href="/${CIRCLE}/timeline?subject=${NELL}"`);
    expect(html).toContain(`href="/${CIRCLE}/timeline?subject=${MARCUS}"`);
    expect(html).toContain(`href="/${CIRCLE}/timeline?subject=all"`);
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>Nell/);
    // §4.4.4: the creation entry is the first row — before any event.
    const creation = html.indexOf("Nell&#x27;s record was opened");
    expect(creation).toBeGreaterThan(-1);
    expect(creation).toBeLessThan(html.indexOf('Discharged from Riverbend'));
    expect(html).toContain('held by Sarah');
    expect(html).toContain('July 1');
    // Only Nell's creation entry on Nell's thread.
    expect(html).not.toContain("Marcus&#x27;s record was opened");
  });

  it('the combined view is LABELLED and every row carries its subject — nothing merges silently (AC-TL-4)', async () => {
    const html = await render({ subject: 'all' });
    expect(eventLinks(html)).toEqual(['e-1', 'e-2', 'e-m1', 'e-3']);
    expect(html).toMatch(/Both threads/);
    expect(html).toMatch(/every entry says whose it is/i);
    expect(html.split('class="subject-label"').length - 1).toBeGreaterThanOrEqual(4);
    expect(html).toContain('Marcus');
    // Both creation entries, in founding order, first.
    expect(html.indexOf("Nell&#x27;s record was opened")).toBeLessThan(html.indexOf("Marcus&#x27;s record was opened"));
    expect(html.indexOf("Marcus&#x27;s record was opened")).toBeLessThan(html.indexOf('Discharged from Riverbend'));
  });

  it("Marcus's thread by the switch", async () => {
    const html = await render({ subject: MARCUS });
    expect(eventLinks(html)).toEqual(['e-m1']);
    expect(html).toContain("Marcus&#x27;s record was opened");
    expect(html).not.toContain("Nell&#x27;s record was opened");
  });

  it('a single-subject circle renders no switch', async () => {
    tasksHc.circleSubjects.mockResolvedValueOnce([SUBJECTS[0]]);
    tlHc.creationEntries.mockResolvedValueOnce([CREATION[0]]);
    const html = await render();
    expect(html).not.toContain('?subject=all');
  });
});

describe('B3 · filters: by kind (never `memory`) and by date range', () => {
  it('kind chips are medical · care · admin, and memory does not render as an empty filter', async () => {
    const html = await render();
    for (const k of ['medical', 'care', 'admin']) expect(html).toContain(`href="/${CIRCLE}/timeline?subject=${NELL}&kind=${k}"`);
    expect(html).not.toContain('kind=memory');
    expect(html).not.toMatch(/>Memories?</);
  });

  it('?kind=care asks the module for care and marks the chip', async () => {
    const html = await render({ kind: 'care' });
    expect(tlHc.listEvents).toHaveBeenCalledWith(CLAIMS, CIRCLE, expect.objectContaining({ subject: NELL, kind: 'care' }));
    expect(eventLinks(html)).toEqual(['e-2']);
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>Care/);
  });

  it('an unknown kind is ignored rather than becoming an empty filter', async () => {
    await render({ kind: 'memory' });
    expect(tlHc.listEvents).toHaveBeenCalledWith(CLAIMS, CIRCLE, expect.not.objectContaining({ kind: 'memory' }));
  });

  it('the date range rides a GET form and reaches the module', async () => {
    const html = await render({ from: '2026-07-01', to: '2026-07-31' });
    expect(tlHc.listEvents).toHaveBeenCalledWith(CLAIMS, CIRCLE, expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }));
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
    expect(html).toContain('value="2026-07-01"');
  });
});

describe('B3 · every row: its source, its date by its own kind, and the episode as a WRAPPER', () => {
  it('sources: the arrival linked with the AI read and the approver; a manual event the person and the date; unseen named, never linked', async () => {
    const html = await render();
    expect(html).toContain(`href="/${CIRCLE}/inbox/${ARRIVAL}"`);
    expect(html).toContain('Riverbend Cardiology');
    expect(html).toMatch(/read by AI/);
    expect(html).toMatch(/approved by Sarah/);
    expect(html).toMatch(/Entered by Sarah on July 20/);
    expect(html).toContain('an item in the Care Inbox');
    expect(html.split('class="provenance"').length - 1).toBe(3);
  });

  it('dates: a date, an appointment with its zone, a floating time that says so', async () => {
    const html = await render({ subject: 'all' });
    expect(html).toContain('July 12');
    expect(html).toMatch(/September 4 · 3:00 PM MDT/);
    expect(html).toContain('(no time zone given)');
    expect(html).not.toContain('2026-07-12');
  });

  it('an episode wraps its events and conceals none of them (AC-TL-3)', async () => {
    const html = await render();
    expect(html).toContain('The fall and the stay at Riverbend');
    expect(html).toMatch(/<section[^>]*aria-label="Episode: The fall and the stay at Riverbend"/);
    // Both member events are still individually rendered, inside the wrapper.
    const wrapper = html.slice(html.indexOf('aria-label="Episode:'));
    expect(wrapper).toContain('Discharged from Riverbend');
    expect(wrapper).toContain('Home health started');
    expect(eventLinks(html)).toContain('e-1');
    expect(eventLinks(html)).toContain('e-2');
  });
});

describe('B3 · add by hand — the one control, only for a member who may complete the one action (TLN-02)', () => {
  it('renders subject, date, kind, one line and an optional document — nothing pre-filled — posting to the add route', async () => {
    const html = await render();
    expect(html).toContain(`action="/${CIRCLE}/timeline/add/submit"`);
    expect(html).toContain('name="subject_id"');
    expect(html).toContain('name="occurred_on"');
    expect(html).toContain('name="kind"');
    expect(html).toContain('name="summary"');
    expect(html).toContain('name="document_id"');
    expect(html).toContain('Discharge summary');
    expect(html).not.toMatch(/name="summary"[^>]*value="/);
    // Kinds offered: the three; never memory.
    expect(html).toMatch(/<option value="medical"/);
    expect(html).not.toMatch(/<option value="memory"/);
  });

  it('below the cliff there is no control at all', async () => {
    tlHc.canAddByHand.mockResolvedValue(false);
    const html = await render();
    expect(html).not.toContain('/timeline/add/submit');
  });

  it('the add route’s markers are read and rendered', async () => {
    expect(await render({ e: 'add' })).toMatch(/role="alert"/);
  });
});

describe('B3 · empty, error and budget states are named', () => {
  it('a subject with only a creation entry shows that entry, not the empty sentence', async () => {
    tlHc.listEvents.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain("Nell&#x27;s record was opened");
    expect(html).not.toContain('Nothing on the thread yet.');
  });

  it('nothing at all ⇒ "Nothing on the thread yet."', async () => {
    tlHc.listEvents.mockResolvedValue([]);
    tlHc.creationEntries.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain('Nothing on the thread yet.');
  });

  it('a refused read is an alert; a read that never answers is bounded to a named state', async () => {
    tlHc.listEvents.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));
    expect(await render()).toContain('role="alert"');

    vi.useFakeTimers();
    tlHc.listEvents.mockImplementationOnce(() => new Promise(() => {}));
    const rendered = render();
    await vi.advanceTimersByTimeAsync(16_000);
    const html = await rendered;
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/taking longer than usual/i);
  });
});
