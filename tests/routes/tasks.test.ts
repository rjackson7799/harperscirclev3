import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7B B2 · the Tasks list (PRD §4.5.1, §4.5.5; TSK-03, TSK-04; AC-TASK-4/5).
// Built on the B1 floor (tests/routes/… at 6afffb7 pinned the columns, the
// error state, the label and the provenance; the columns pin now lives in
// tests/hc/tasks.test.ts, which reads them live) — the read moves to
// lib/hc/tasks, so the joins the rows need happen once, RLS-true.
//
//   · Mine · Unassigned · Overdue · All, and by subject — COUNTS POST-FILTER
//     over the rows the caller can see (§7.6: counts are content at the
//     margin); the active chip is aria-current;
//   · every row links to its detail, names its subject, its holder, its due
//     date as a date, its snooze count, and a source that RESOLVES (linked)
//     or is NAMED, never linked (AC-TASK-4);
//   · empty states per tier: "Nothing open." for a coordinator; a
//     caregiver's first open is NEVER BLANK — one sentence naming who to
//     expect tasks from (§4.5.5);
//   · a refused read is an error state; a read that never answers is bounded
//     by the page's AnswerBudget (D17 item 3 as code) — a named state, never
//     a spinner.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority: tests/hc/tasks.test.ts
// and the B4 record legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const tasksHc = {
  listTasks: vi.fn(),
  myMembership: vi.fn(),
  circleCoordinators: vi.fn(),
  circleSubjects: vi.fn(),
};
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const NELL = '22222222-0000-4000-8000-000000000002';
const MARCUS = '22222222-0000-4000-8000-000000000003';
const ME = '44444444-0000-4000-8000-000000000004';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };
const ARRIVAL = '55555555-0000-4000-8000-000000000005';

function task(over: Record<string, unknown>) {
  return {
    id: 'aaaaaaaa-0000-4000-8000-0000000000a0',
    circle_id: CIRCLE,
    subject_id: NELL,
    subject_name: 'Nell',
    subject_seq: 1,
    title: 'Call the pharmacy',
    detail: null,
    due_on: null,
    due_zone: null,
    status: 'open',
    owner_member_id: null,
    owner_name: null,
    assigned_at: null,
    assigned_by_name: null,
    snooze_count: 0,
    written_for_member_id: null,
    written_from_task_id: null,
    taint: ['schedule'],
    taint_resolved: true,
    source: { kind: 'none' },
    approved_at: '2026-08-20T10:00:00Z',
    approver_display_name: 'Sarah',
    completed_at: null,
    completed_by_name: null,
    can_manage: true,
    instruction: null,
    ...over,
  };
}

const ROWS = [
  task({ id: 'a-mine-overdue', title: 'Renew the parking permit', owner_member_id: ME, owner_name: 'Me', due_on: '2020-01-01', due_zone: 'America/New_York' }),
  task({
    id: 'b-unassigned',
    title: 'Call Riverbend about the follow-up',
    due_on: '2099-09-04',
    due_zone: 'America/New_York',
    snooze_count: 2,
    source: { kind: 'arrival', arrival_id: ARRIVAL, channel: 'email', label: 'Riverbend Cardiology', received_at: '2026-08-19T09:00:00Z' },
  }),
  task({ id: 'c-theirs', title: 'Book the echo', owner_member_id: 'm-ruth', owner_name: 'Ruth', subject_id: MARCUS, subject_name: 'Marcus', subject_seq: 2, source: { kind: 'arrival_unseen' } }),
  task({ id: 'd-done', title: 'Pick up the prescription', status: 'done', owner_member_id: ME, owner_name: 'Me', completed_at: '2026-08-21T10:00:00Z', completed_by_name: 'Me', source: { kind: 'written', from_task_id: 'x', written_by: 'Sarah', written_for: 'Me' } }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tasksHc.listTasks.mockResolvedValue(ROWS);
  tasksHc.myMembership.mockResolvedValue({ id: ME, tier: 'coordinator' });
  tasksHc.circleCoordinators.mockResolvedValue(['Sarah']);
  tasksHc.circleSubjects.mockResolvedValue([
    { id: NELL, first_name: 'Nell', timezone: 'America/New_York', seq: 1 },
    { id: MARCUS, first_name: 'Marcus', timezone: 'America/Chicago', seq: 2 },
  ]);
});
afterEach(() => vi.useRealTimers());

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/tasks/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }), searchParams: Promise.resolve(searchParams) }),
  );
}

/** The open rows on the page — each is a card whose title links to its detail. */
function renderedTaskLinks(html: string): string[] {
  return [...html.matchAll(new RegExp(`href="/${CIRCLE}/tasks/([^"/]+)"`, 'g'))].map((m) => m[1]);
}

describe('B2 · Mine · Unassigned · Overdue · All — counts post-filter over the rendered tree', () => {
  it('All by default: the three open rows render, the done one sits under Done, and every chip carries its count', async () => {
    const html = await render();
    expect(renderedTaskLinks(html).slice(0, 3)).toEqual(['a-mine-overdue', 'b-unassigned', 'c-theirs']);
    expect(html).toMatch(/Mine[^0-9]*<span class="filter-count">1<\/span>/);
    expect(html).toMatch(/Unassigned[^0-9]*<span class="filter-count">1<\/span>/);
    expect(html).toMatch(/Overdue[^0-9]*<span class="filter-count">1<\/span>/);
    expect(html).toMatch(/All[^0-9]*<span class="filter-count">3<\/span>/);
    // The active chip is aria-current, and it is All.
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>All/);
    // Done is never deleted: it renders, apart, with who and when.
    expect(html).toContain('Pick up the prescription');
    expect(html).toContain('Done');
  });

  it('?filter=mine renders exactly the rows the count promised', async () => {
    const html = await render({ filter: 'mine' });
    const links = renderedTaskLinks(html);
    expect(links.filter((l) => l !== 'd-done')).toEqual(['a-mine-overdue']);
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>Mine/);
    // Counts do not move with the active chip — they describe what the
    // caller can see.
    expect(html).toMatch(/All[^0-9]*<span class="filter-count">3<\/span>/);
  });

  it('?filter=unassigned and ?filter=overdue', async () => {
    expect(renderedTaskLinks(await render({ filter: 'unassigned' })).filter((l) => l !== 'd-done')).toEqual(['b-unassigned']);
    expect(renderedTaskLinks(await render({ filter: 'overdue' })).filter((l) => l !== 'd-done')).toEqual(['a-mine-overdue']);
  });

  it('by subject: the chips appear with two subjects, and the counts are post-filter within the subject', async () => {
    const html = await render({ subject: MARCUS });
    expect(renderedTaskLinks(html).filter((l) => l !== 'd-done')).toEqual(['c-theirs']);
    expect(html).toMatch(/All[^0-9]*<span class="filter-count">1<\/span>/);
    expect(html).toMatch(/Mine[^0-9]*<span class="filter-count">0<\/span>/);
    expect(html).toContain(`href="/${CIRCLE}/tasks?subject=${NELL}"`);
    expect(html).toContain(`href="/${CIRCLE}/tasks?subject=${MARCUS}"`);
  });

  it('an unknown filter falls back to All rather than an empty world', async () => {
    const html = await render({ filter: 'nonsense' });
    expect(renderedTaskLinks(html).filter((l) => l !== 'd-done')).toHaveLength(3);
  });
});

describe('B2 · every row: subject, holder, due date, snooze count, and a source that resolves or is named', () => {
  it('renders the row facts as prose and dates as dates', async () => {
    const html = await render();
    expect(html).toContain('class="subject-label"');
    expect(html).toContain('Nell');
    expect(html).toContain('Marcus');
    expect(html).toContain('Ruth');
    expect(html).toContain('Unassigned');
    expect(html).toContain('September 4');
    expect(html).not.toContain('2099-09-04');
    expect(html).toMatch(/snoozed 2/);
  });

  it('the source: linked when it resolves; named and never linked when the caller cannot see it; a written instruction names its writer', async () => {
    const html = await render();
    expect(html).toContain(`href="/${CIRCLE}/inbox/${ARRIVAL}"`);
    expect(html).toContain('Riverbend Cardiology');
    expect(html).toContain('an item in the Care Inbox');
    expect(html).toMatch(/Written by Sarah for Me/);
    expect(html.split('class="provenance"').length - 1).toBe(4);
  });
});

describe('B2 · empty states per tier (§4.5.5)', () => {
  it('a coordinator with nothing open reads "Nothing open."', async () => {
    tasksHc.listTasks.mockResolvedValueOnce([]);
    const html = await render();
    expect(html).toContain('Nothing open.');
  });

  it("a caregiver's first open is NEVER BLANK: one sentence naming who to expect tasks from", async () => {
    tasksHc.listTasks.mockResolvedValueOnce([]);
    tasksHc.myMembership.mockResolvedValueOnce({ id: ME, tier: 'care_circle' });
    const html = await render();
    expect(html).not.toContain('Nothing open.');
    expect(html).toMatch(/Sarah will hand you tasks here/);
    expect(html).toContain('class="empty-state"');
  });

  it('two coordinators are both named', async () => {
    tasksHc.listTasks.mockResolvedValueOnce([]);
    tasksHc.myMembership.mockResolvedValueOnce({ id: ME, tier: 'care_circle' });
    tasksHc.circleCoordinators.mockResolvedValueOnce(['Sarah', 'Priya']);
    const html = await render();
    expect(html).toMatch(/Sarah and Priya will hand you tasks here/);
  });
});

describe('B2 · a refused read is an error state; a read that never answers is bounded', () => {
  it('a rejected list read renders the alert, never an empty sentence', async () => {
    tasksHc.listTasks.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Nothing open.');
  });

  it('the AnswerBudget bounds the page: a read that never resolves lands a named state within the budget', async () => {
    vi.useFakeTimers();
    tasksHc.listTasks.mockImplementationOnce(() => new Promise(() => {}));
    const rendered = render();
    await vi.advanceTimersByTimeAsync(16_000);
    const html = await rendered;
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/taking longer than usual/i);
  });
});
