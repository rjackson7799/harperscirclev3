import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 8C U1 · the CLAIM — the control, the route, and the honest refusal
// (PRD §4.5.1 "Claims, reassigns, completes, snoozes, adds"; AC-TASK-1's
// claim half; AC-TASK-2; TSK-05's app half; slice-8 plan "### 8C" unit 1).
//
// 8A shipped hc.claim_task and ruled every refusal into ONE shape —
// `claim_refused`, the freeze included (ADR-0040 D2). A surface given one
// string can do one of two things: say "that couldn't be done just now" to
// everyone, or DECIDE FROM THE ROW RLS ALREADY RETURNED. This file holds it
// to the second.
//
//   · THE CONTROL IS OFFERED EXACTLY WHERE THE FUNCTION WOULD NOT REFUSE.
//     `mayClaim` mirrors the definer's gates one for one — open, unassigned,
//     not an instruction row (ADR-0033 cluster C), `visible_at >= view` on
//     the task AS IT STANDS, and a live member row. `can_view` is the SAME
//     expression the definer evaluates, computed in the SAME RLS-true query
//     that already computes `can_manage`, so the surface and the database
//     cannot disagree and the surface never probes. The freeze needs no
//     clause of its own: it is `visible_at` rung 2, so a frozen subject
//     yields `hidden` and the row never reaches the page at all.
//   · THE REFUSAL NAMES WHAT THE SURFACE CAN KNOW. The one place a claim
//     refuses with the control rendered is a RACE, and the page re-reads the
//     task on the way back: someone else holds it now, it is already hers,
//     it was closed. Those are said. What the surface cannot know it does
//     not invent — the generic sentence is the LAST arm, not the first.
//   · THE CLAIM CARRIES NOTHING ELSE. The definer takes one argument and
//     cannot name anyone else; the form posts no field, so no share and no
//     written instruction can be smuggled through the surface either
//     (ADR-0040 D3 proved it at the database by SET EQUALITY — this is the
//     app half of the same claim).
//
// Test class: MOCKED ROUTE CONTRACT (the live authority: tests/hc/tasks.test.ts
// and the record leg in e2e/record.spec.ts).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const tasksHc = {
  taskById: vi.fn(),
  listTasks: vi.fn(),
  assignCandidates: vi.fn(),
  sharesForTask: vi.fn(),
  myMembership: vi.fn(),
  circleCoordinators: vi.fn(),
  circleSubjects: vi.fn(),
  claimTask: vi.fn(),
};
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const NELL = '22222222-0000-4000-8000-000000000002';
const TASK = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const ME = '44444444-0000-4000-8000-000000000004';
const RUTH = '44444444-0000-4000-8000-000000000006';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

/** An unassigned, open, readable task — the one shape a claim is FOR. */
const ROW = {
  id: TASK,
  circle_id: CIRCLE,
  subject_id: NELL,
  subject_name: 'Nell',
  subject_seq: 1,
  title: 'Collect the dressings from the pharmacy',
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
  can_manage: false,
  can_view: true,
  instruction: null,
};

const MEMBER = { id: ME, tier: 'care_circle', subjects: [{ id: NELL, first_name: 'Nell', seq: 1 }] };

/** `mayClaim` is the REAL export — the mock factory spreads `...actual` and
 *  does not stub it. It cannot be imported at the top of the file: the
 *  import would hoist above `tasksHc` and the factory would read it
 *  uninitialised. Bound once, after the mock is in place. */
let mayClaim: typeof import('@/lib/hc/tasks').mayClaim;
beforeAll(async () => {
  ({ mayClaim } = await import('@/lib/hc/tasks'));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tasksHc.taskById.mockResolvedValue(ROW);
  tasksHc.listTasks.mockResolvedValue([ROW]);
  tasksHc.assignCandidates.mockResolvedValue([]);
  tasksHc.sharesForTask.mockResolvedValue([]);
  tasksHc.myMembership.mockResolvedValue(MEMBER);
  tasksHc.circleCoordinators.mockResolvedValue(['Sarah']);
  tasksHc.circleSubjects.mockResolvedValue([
    { id: NELL, first_name: 'Nell', timezone: 'America/New_York', seq: 1 },
  ]);
  tasksHc.claimTask.mockResolvedValue({
    task_id: TASK,
    member_id: ME,
    claimed_at: '2026-09-03T10:00:00Z',
  });
});

async function renderDetail(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/tasks/[task]/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE, task: TASK }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

async function renderList(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/tasks/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

function post(): Request {
  return new Request(`http://local.test/${CIRCLE}/tasks/${TASK}/claim/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: '',
  });
}
const ctx = { params: Promise.resolve({ circle: CIRCLE, task: TASK }) };

async function claimRoute() {
  return (await import('@/app/(app)/[circle]/tasks/[task]/claim/submit/route')).POST;
}

const CLAIM_ACTION = `/${CIRCLE}/tasks/${TASK}/claim/submit`;

// ---------------------------------------------------------------------------
// 1. The predicate — the definer's gates, one for one.
// ---------------------------------------------------------------------------
describe('8C U1 · mayClaim mirrors hc.claim_task’s gates and adds none of its own', () => {
  const me = { id: ME };

  it('an open, unassigned, readable task with a live member row: YES', () => {
    expect(mayClaim(ROW, me)).toBe(true);
  });

  it.each([
    ['already hers (ADR-0040 D4/Q-B: refuses, never a quiet no-op)', { owner_member_id: ME }],
    ['held by someone else', { owner_member_id: RUTH }],
    ['done — terminal, never claimed', { status: 'done' as const }],
    ['cancelled', { status: 'cancelled' as const }],
    ['an instruction row (ADR-0033 cluster C)', { written_from_task_id: 'aaaaaaaa-0000-4000-8000-0000000000a9' }],
    ['below view — her level, or the freeze at visible_at rung 2', { can_view: false }],
  ])('%s: NO', (_why, over) => {
    expect(mayClaim({ ...ROW, ...over }, me)).toBe(false);
  });

  it('an outsider with no live member row: NO — the definer looks that row up too', () => {
    expect(mayClaim(ROW, null)).toBe(false);
  });

  it('view is the floor, not manage — a caregiver at view claims where can_manage is false', () => {
    expect(ROW.can_manage).toBe(false);
    expect(mayClaim(ROW, me)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The control, over the RENDERED tree.
// ---------------------------------------------------------------------------
describe('8C U1 · the control is offered EXACTLY where the function would not refuse', () => {
  it('task detail offers it on an unassigned open task the caller can see', async () => {
    const html = await renderDetail();
    expect(html).toContain(`action="${CLAIM_ACTION}"`);
    expect(html).toContain('Take this on');
  });

  it('the form posts NOTHING but the submit — no member, no instruction, no document (ADR-0040 D3)', async () => {
    const html = await renderDetail();
    const form = html.slice(html.indexOf(`action="${CLAIM_ACTION}"`));
    const body = form.slice(0, form.indexOf('</form>'));
    expect(body).not.toContain('<input');
    expect(body).not.toContain('<select');
    expect(body).not.toContain('<textarea');
  });

  it.each([
    ['it is already hers', { owner_member_id: ME, owner_name: 'Me' }],
    ['someone else holds it', { owner_member_id: RUTH, owner_name: 'Ruth' }],
    ['it is done', { status: 'done' as const, completed_at: '2026-08-21T10:00:00Z', completed_by_name: 'Ruth' }],
    ['it is an instruction row', { written_from_task_id: 'aaaaaaaa-0000-4000-8000-0000000000a9' }],
    ['she is below view on it', { can_view: false }],
  ])('task detail offers NO control when %s', async (_why, over) => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, ...over });
    const html = await renderDetail();
    expect(html).not.toContain(`action="${CLAIM_ACTION}"`);
  });

  it('task detail offers no control to someone with no live membership', async () => {
    tasksHc.myMembership.mockResolvedValueOnce(null);
    const html = await renderDetail();
    expect(html).not.toContain(`action="${CLAIM_ACTION}"`);
  });

  it('the Tasks list carries it on the Unassigned filter', async () => {
    const html = await renderList({ filter: 'unassigned' });
    expect(html).toContain(`action="${CLAIM_ACTION}"`);
    expect(html).toContain('Take this on');
  });

  it('the Unassigned filter offers nothing where the function would refuse', async () => {
    tasksHc.listTasks.mockResolvedValueOnce([{ ...ROW, can_view: false }]);
    const html = await renderList({ filter: 'unassigned' });
    expect(html).not.toContain(`action="${CLAIM_ACTION}"`);
  });
});

// ---------------------------------------------------------------------------
// 3. The route.
// ---------------------------------------------------------------------------
describe('8C U1 · POST /[circle]/tasks/[task]/claim/submit', () => {
  it('claims and returns to the task, marked — the definer is called with the TASK ALONE', async () => {
    const POST = await claimRoute();
    const res = await POST(post(), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?claimed=1`);
    expect(tasksHc.claimTask).toHaveBeenCalledTimes(1);
    expect(tasksHc.claimTask).toHaveBeenCalledWith(CLAIMS, TASK);
  });

  it('a refusal is ONE marker and never a 500 — the shape the definer returns', async () => {
    tasksHc.claimTask.mockRejectedValueOnce(new Error('claim_refused'));
    const POST = await claimRoute();
    const res = await POST(post(), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=claim`);
  });

  it('a read that never answers is the SLOW marker, not the refusal marker (OW-03)', async () => {
    tasksHc.claimTask.mockImplementationOnce(() => new Promise(() => {}));
    const POST = await claimRoute();
    const res = await POST(post(), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=slow`);
  }, 20_000);

  it('an unavailable session is refused by the gate, never treated as a claim', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'unavailable' });
    const POST = await claimRoute();
    const res = await POST(post(), ctx);
    expect(res.status).not.toBe(303);
    expect(tasksHc.claimTask).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. The refusal SAYS what the surface can know.
// ---------------------------------------------------------------------------
describe('8C U1 · the refusal names the case the surface can name (ADR-0040 D2’s consequence)', () => {
  it('someone else got there first — said, and the holder named as the page already names them', async () => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, owner_member_id: RUTH, owner_name: 'Ruth' });
    const html = await renderDetail({ e: 'claim' });
    expect(html).toContain('Ruth took that on first.');
    expect(html).not.toContain("That couldn't be taken on just now");
  });

  it('it is already hers — said plainly, not as a failure of the system', async () => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, owner_member_id: ME, owner_name: 'Me' });
    const html = await renderDetail({ e: 'claim' });
    expect(html).toContain('That task is already yours.');
  });

  it('it closed underneath her — said', async () => {
    tasksHc.taskById.mockResolvedValueOnce({
      ...ROW,
      status: 'done',
      completed_at: '2026-08-21T10:00:00Z',
      completed_by_name: 'Ruth',
    });
    const html = await renderDetail({ e: 'claim' });
    expect(html).toContain('That task was marked done before you took it on.');
  });

  it('and ONLY where it cannot know does it fall back to the generic sentence', async () => {
    const html = await renderDetail({ e: 'claim' });
    expect(html).toContain("That couldn't be taken on just now.");
  });

  it('the success marker is its own sentence', async () => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, owner_member_id: ME, owner_name: 'Me' });
    const html = await renderDetail({ claimed: '1' });
    expect(html).toContain("It's yours now.");
  });

  it('the slow marker still reads as the wait it is, not as a refusal', async () => {
    const html = await renderDetail({ e: 'slow' });
    expect(html).toContain('took too long to confirm');
  });
});
