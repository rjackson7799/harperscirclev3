import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7B B1 · the Tasks floor made honest (OW-20; the slice-7 plan's measurement
// 1: "the two pages select columns that do not exist and render their empty
// state unconditionally … the links resolve to pages that cannot render a
// row"). Before a single new read is written on top of it:
//
//   · the page selects the columns that EXIST — `status`, never `state`;
//   · a read error is an ERROR STATE (R5/F-2's lesson, applied to the place
//     it was not): role="alert", "couldn't load", never the empty sentence;
//   · every row is subject-labelled — PRD §4.0 "there is no unlabelled
//     state" (AC-TL-4's discipline carried to Tasks);
//   · every row carries its ProvenanceLine — design spec §7: "a fact without
//     a visible source is a bug".
//
// Test class: MOCKED ROUTE CONTRACT (the live authority is the B4 record legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ from, auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const SUBJECT = '22222222-0000-4000-8000-000000000002';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

type Row = Record<string, unknown>;
let tasks: Row[] = [];
let subjects: Row[] = [];
let readErrors: { tasks?: string; subjects?: string } = {};
const selected: Record<string, string[]> = {};

function chain(table: string, result: Row[], error: { message: string } | null) {
  const p = Promise.resolve(error ? { data: null, error } : { data: result, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['eq', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'neq']) {
    proxy[m] = vi.fn(() => proxy);
  }
  proxy.select = vi.fn((columns: string) => {
    (selected[table] ??= []).push(columns);
    return proxy;
  });
  proxy.then = p.then.bind(p);
  proxy.catch = p.catch.bind(p);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tasks = [];
  subjects = [{ id: SUBJECT, first_name: 'Nell', created_at: '2026-08-01T00:00:00Z' }];
  readErrors = {};
  for (const k of Object.keys(selected)) delete selected[k];
  from.mockImplementation((table: string) => {
    if (table === 'tasks') return chain(table, tasks, readErrors.tasks ? { message: readErrors.tasks } : null);
    if (table === 'subjects') {
      return chain(table, subjects, readErrors.subjects ? { message: readErrors.subjects } : null);
    }
    return chain(table, [], null);
  });
});

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/tasks/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }), searchParams: Promise.resolve(searchParams) }),
  );
}

const TASK: Row = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  circle_id: CIRCLE,
  subject_id: SUBJECT,
  title: 'Call Riverbend about the follow-up',
  detail: null,
  due_on: '2026-09-04',
  due_zone: 'America/New_York',
  status: 'open',
  owner_member_id: null,
  snooze_count: 0,
  written_for_member_id: null,
  written_from_task_id: null,
  source_arrival_id: null,
  source_proposal_id: null,
  approved_by: CLAIMS.sub,
  approved_at: '2026-08-20T10:00:00Z',
  approver_display_name: 'Sarah',
  completed_by: null,
  completed_at: null,
};

describe('B1 · the floor selects the columns that exist', () => {
  it('asks for `status`, never `state` (the column that was never there)', async () => {
    await render();
    const columns = (selected.tasks ?? []).join(' ');
    expect(columns).toMatch(/\bstatus\b/);
    expect(columns).not.toMatch(/\bstate\b/);
  });
});

describe('B1 · an error is an ERROR STATE, never an empty one (R5/F-2 at the place it was not)', () => {
  it('a refused tasks read renders the alert and never the empty sentence', async () => {
    readErrors.tasks = 'permission denied for column state';
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/couldn&#x27;t load/i);
    expect(html).not.toContain('Nothing assigned');
    expect(html).not.toContain('Nothing open');
  });

  it('a refused subjects read is the same honest state — a row without its label is not rendered', async () => {
    tasks = [TASK];
    readErrors.subjects = 'boom';
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Call Riverbend');
  });
});

describe('B1 · every row is subject-labelled and carries its provenance', () => {
  it('a row names its subject and shows where it came from', async () => {
    tasks = [TASK];
    const html = await render();
    expect(html).toContain('Call Riverbend about the follow-up');
    // §4.0: no unlabelled state — the subject's name is on the row.
    expect(html).toContain('Nell');
    // design spec §7: the provenance line, on the row.
    expect(html).toContain('class="provenance"');
    expect(html).toContain('Sarah');
    // §8.6 dates are human: the due date renders as a date, never raw ISO.
    expect(html).toContain('September 4');
    expect(html).not.toContain('2026-09-04');
  });

  it('the empty state stays one sentence when there is genuinely nothing', async () => {
    const html = await render();
    expect(html).toContain('class="empty-state"');
    expect(html).not.toContain('role="alert"');
  });
});
