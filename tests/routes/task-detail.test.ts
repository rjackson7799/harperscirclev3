import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7B B2 · /[circle]/tasks/[task], the crossing screen and the four writes
// (PRD §4.5.3, §4.5.4, §4.5.6; TSK-01/02 app halves; SHR-02 app half;
// AC-TASK-1/4/6/7).
//
//   · the detail: what · who owns it · when due · where it came from, LINKED
//     when it resolves and named when not · who created it and when ·
//     completion with who and when;
//   · ASSIGN IN TWO TAPS: the people offered are exactly those with context
//     on the subject (§4.5.5 — the not-offered are named with the plain
//     reason, never as a choice); pick, then hand over;
//   · the crossing: "Marisol can't see this task. It came from …" and EXACTLY
//     two paths, both explicit, both human — the typed instruction (never
//     pre-filled) or the named share with both objects in one confirmation,
//     behind the §5.7 step-up bound to `share_object` + `task:<id>+document:<id>`;
//   · complete and snooze with the count; unassign with a coordinator's keep
//     option (AC-TASK-7).
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
  taskById: vi.fn(),
  assignCandidates: vi.fn(),
  sharesForTask: vi.fn(),
  sourceDocuments: vi.fn(),
  myMembership: vi.fn(),
  circleSubjects: vi.fn(),
  assignTask: vi.fn(),
  unassignTask: vi.fn(),
  completeTask: vi.fn(),
  snoozeTask: vi.fn(),
};
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

let stepUpCookie: string | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'hc-step-up' && stepUpCookie ? { name, value: stepUpCookie } : undefined),
  }),
}));
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
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const DOC = '66666666-0000-4000-8000-000000000006';
const ME = '44444444-0000-4000-8000-000000000004';
const MARISOL = '44444444-0000-4000-8000-000000000005';
const RUTH = '44444444-0000-4000-8000-000000000006';
const OMAR = '44444444-0000-4000-8000-000000000007';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const ROW = {
  id: TASK,
  circle_id: CIRCLE,
  subject_id: NELL,
  subject_name: 'Nell',
  subject_seq: 1,
  title: 'Follow the discharge instructions from Dr Okafor',
  detail: 'Wound care twice daily; the dressing protocol is on page 3',
  due_on: '2026-09-10',
  due_zone: 'America/New_York',
  status: 'open',
  owner_member_id: null,
  owner_name: null,
  assigned_at: null,
  assigned_by_name: null,
  snooze_count: 1,
  written_for_member_id: null,
  written_from_task_id: null,
  taint: ['schedule', 'health'],
  taint_resolved: true,
  source: { kind: 'arrival', arrival_id: ARRIVAL, channel: 'email', label: 'Riverbend Cardiology', received_at: '2026-08-19T09:00:00Z' },
  approved_at: '2026-08-20T10:00:00Z',
  approver_display_name: 'Sarah',
  completed_at: null,
  completed_by_name: null,
  can_manage: true,
  instruction: null,
};

const CANDIDATES = [
  { member_id: ME, display_name: 'Sarah', tier: 'coordinator', offered: true, can_see: true, levels_known: true },
  { member_id: MARISOL, display_name: 'Marisol', tier: 'care_circle', offered: true, can_see: false, levels_known: true },
  { member_id: RUTH, display_name: 'Ruth', tier: 'family', offered: true, can_see: true, levels_known: true },
  { member_id: OMAR, display_name: 'Omar', tier: 'family', offered: false, can_see: false, levels_known: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stepUpCookie = null;
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tasksHc.taskById.mockResolvedValue(ROW);
  tasksHc.assignCandidates.mockResolvedValue(CANDIDATES);
  tasksHc.sharesForTask.mockResolvedValue([]);
  tasksHc.sourceDocuments.mockResolvedValue([{ id: DOC, title: 'Discharge summary', filed_on: '2026-07-12' }]);
  tasksHc.myMembership.mockResolvedValue({ id: ME, tier: 'coordinator' });
  tasksHc.circleSubjects.mockResolvedValue([{ id: NELL, first_name: 'Nell', timezone: 'America/New_York', seq: 1 }]);
  tasksHc.assignTask.mockResolvedValue({ task_id: TASK, member_id: RUTH, path: 'plain', changed: true });
  tasksHc.unassignTask.mockResolvedValue({ task_id: TASK, former_member_id: RUTH, former_owner_name: 'Ruth', shares_revoked: 0, shares_kept: 0, instructions_closed: 0 });
  tasksHc.completeTask.mockResolvedValue({ task_id: TASK, status: 'done', completed_by: CLAIMS.sub, completed_at: '2026-08-21T10:00:00Z' });
  tasksHc.snoozeTask.mockResolvedValue({ task_id: TASK, due_on: '2026-09-17', due_zone: 'America/New_York', snooze_count: 2 });
});

async function renderDetail(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/tasks/[task]/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE, task: TASK }), searchParams: Promise.resolve(searchParams) }),
  );
}

async function renderAssign(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/tasks/[task]/assign/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE, task: TASK }), searchParams: Promise.resolve(searchParams) }),
  );
}

function post(path: string, fields: Record<string, string | string[]>, cookie?: string): Request {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
  }
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: body.toString(),
  });
}
const ctx = { params: Promise.resolve({ circle: CIRCLE, task: TASK }) };

describe('B2 · the detail says what · who · when · where from · who created · completion (§4.5.3)', () => {
  it('renders every fact, the source LINKED, and the subject labelled', async () => {
    const html = await renderDetail();
    expect(html).toContain('Follow the discharge instructions from Dr Okafor');
    expect(html).toContain('Wound care twice daily');
    expect(html).toContain('class="subject-label"');
    expect(html).toContain('Nell');
    expect(html).toContain('Unassigned');
    expect(html).toContain('Thursday, September 10');
    expect(html).toMatch(/snoozed once/);
    expect(html).toContain(`href="/${CIRCLE}/inbox/${ARRIVAL}"`);
    expect(html).toContain('Riverbend Cardiology');
    expect(html).toMatch(/Approved by Sarah/);
    expect(html).toContain('August 20');
  });

  it('a source the caller cannot see is NAMED and never linked; a written instruction names its writer and reader', async () => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, source: { kind: 'arrival_unseen' } });
    let html = await renderDetail();
    expect(html).toContain('an item in the Care Inbox');
    expect(html).not.toContain(`href="/${CIRCLE}/inbox/`);

    tasksHc.taskById.mockResolvedValueOnce({
      ...ROW,
      source: { kind: 'written', from_task_id: 'x', written_by: 'Sarah', written_for: 'Marisol' },
    });
    html = await renderDetail();
    expect(html).toMatch(/Written by Sarah for Marisol/);
  });

  it('completion shows who and when; a done task renders no controls (done is terminal, never deleted)', async () => {
    tasksHc.taskById.mockResolvedValueOnce({
      ...ROW,
      status: 'done',
      owner_member_id: MARISOL,
      owner_name: 'Marisol',
      completed_at: '2026-08-21T10:00:00Z',
      completed_by_name: 'Marisol',
    });
    const html = await renderDetail();
    expect(html).toMatch(/Completed by Marisol/);
    expect(html).toContain('August 21');
    expect(html).not.toContain('/complete/submit');
    expect(html).not.toContain('/assign/submit');
    expect(html).not.toContain('/snooze/submit');
  });

  it('a foreign, nonexistent or below-summary task is notFound — one shape', async () => {
    tasksHc.taskById.mockResolvedValueOnce(null);
    await expect(renderDetail()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it("the coordinator's view of an original names the instruction its holder reads", async () => {
    tasksHc.taskById.mockResolvedValueOnce({
      ...ROW,
      owner_member_id: MARISOL,
      owner_name: 'Marisol',
      instruction: { id: 'iiiiiiii-0000-4000-8000-0000000000i1', status: 'open', title: 'Pick up the prescription', written_for: 'Marisol' },
    });
    const html = await renderDetail();
    expect(html).toContain('Marisol reads this as');
    expect(html).toContain(`href="/${CIRCLE}/tasks/iiiiiiii-0000-4000-8000-0000000000i1"`);
  });
});

describe('B2 · assign in two taps — the people offered are exactly those with context (§4.5.5)', () => {
  it('offers the offered as choices, names the not-offered with the plain reason, never as a choice', async () => {
    const html = await renderDetail();
    expect(html).toContain(`name="member_id" value="${RUTH}"`);
    expect(html).toContain(`name="member_id" value="${MARISOL}"`);
    expect(html).not.toContain(`value="${OMAR}"`);
    expect(html).toMatch(/Omar[^<]*can.t see Nell.s record/);
    // The assigner herself is a choice too (a coordinator may take it).
    expect(html).toContain(`name="member_id" value="${ME}"`);
    expect(html).toContain(`action="/${CIRCLE}/tasks/${TASK}/assign/submit"`);
  });

  it('a caregiver who holds the task sees complete, not assign; a manager sees both, and unassign when it is held', async () => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, owner_member_id: ME, owner_name: 'Me', can_manage: false });
    tasksHc.myMembership.mockResolvedValueOnce({ id: ME, tier: 'care_circle' });
    let html = await renderDetail();
    expect(html).toContain('/complete/submit');
    expect(html).not.toContain('/assign/submit');
    expect(html).not.toContain('/unassign/submit');

    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, owner_member_id: RUTH, owner_name: 'Ruth' });
    html = await renderDetail();
    expect(html).toContain('/complete/submit');
    expect(html).toContain('/assign/submit');
    expect(html).toContain('/unassign/submit');
  });

  it('unassign offers a coordinator the keep option for each share the assignment created (AC-TASK-7)', async () => {
    tasksHc.taskById.mockResolvedValueOnce({ ...ROW, owner_member_id: RUTH, owner_name: 'Ruth' });
    tasksHc.sharesForTask.mockResolvedValueOnce([
      { share_id: 'sh-1', member_id: RUTH, display_name: 'Ruth', tier: 'family', granter_name: 'Sarah', granted_at: '2026-08-20T10:00:00Z', created_by_assignment_of: TASK },
      { share_id: 'sh-foreign', member_id: RUTH, display_name: 'Ruth', tier: 'family', granter_name: 'Sarah', granted_at: '2026-08-20T10:00:00Z', created_by_assignment_of: null },
    ]);
    const html = await renderDetail();
    expect(html).toContain('name="keep_share_ids" value="sh-1"');
    expect(html).not.toContain('value="sh-foreign"');
  });

  it('the snooze form carries the subject’s zone and asks for a date', async () => {
    const html = await renderDetail();
    expect(html).toContain('name="due_on"');
    expect(html).toContain('name="due_zone" value="America/New_York"');
    expect(html).toContain(`action="/${CIRCLE}/tasks/${TASK}/snooze/submit"`);
  });

  it('the notices the routes emit are READ and rendered', async () => {
    expect(await renderDetail({ assigned: '1' })).toMatch(/role="status"/);
    expect(await renderDetail({ e: 'assign' })).toMatch(/role="alert"/);
    expect(await renderDetail({ e: 'slow' })).toMatch(/took too long/i);
  });
});

describe('B2 · the crossing screen: the sentence and EXACTLY two paths (§4.5.6)', () => {
  it('names the person and where the task came from, offers path 1 EMPTY and path 2 behind the step-up bound to the pair', async () => {
    const html = await renderAssign({ member: MARISOL });
    expect(html).toMatch(/Marisol can.t see this task\. It came from/);
    expect(html).toContain('Discharge summary');
    // Path 1: the assigner types it; nothing is pre-filled.
    expect(html).toMatch(/<textarea[^>]*name="instruction"[^>]*><\/textarea>/);
    // Path 2: both objects named in one confirmation, behind the step-up.
    expect(html).toContain('action="/account/step-up/submit"');
    expect(html).toContain('name="operation" value="share_object"');
    expect(html).toContain(`name="target_ref" value="task:${TASK}+document:${DOC}"`);
    expect(html).toContain('name="password"');
    // Exactly two paths.
    expect(html.split('class="record-path"').length - 1).toBe(2);
  });

  it('with the step-up cookie in hand, path 2 shows the confirmation of BOTH objects and the one button', async () => {
    stepUpCookie = 'tok';
    const html = await renderAssign({ member: MARISOL, path: 'share', document: DOC });
    expect(html).toMatch(/Marisol will be able to see: this task, and the Discharge summary from July 12/);
    expect(html).toContain('name="share_document"');
    expect(html).not.toContain('name="password"');
  });

  it('no document to share ⇒ path 2 says so honestly rather than offering nothing', async () => {
    tasksHc.sourceDocuments.mockResolvedValueOnce([]);
    const html = await renderAssign({ member: MARISOL });
    expect(html).toMatch(/no document/i);
    expect(html).not.toContain('name="target_ref"');
  });

  it('a person who can clear the taint is redirected back — there is no crossing', async () => {
    await expect(renderAssign({ member: RUTH })).rejects.toThrow(`NEXT_REDIRECT /${CIRCLE}/tasks/${TASK}`);
  });

  it('a person NOT offered gets the plain reason and no path', async () => {
    const html = await renderAssign({ member: OMAR });
    expect(html).toMatch(/Omar can.t be handed this/);
    expect(html).not.toContain('name="instruction"');
    expect(html).not.toContain('name="target_ref"');
  });
});

describe('B2 · the four writes ride the wrappers with relative PRG redirects', () => {
  it('assign, plain: the candidate can see it ⇒ hc.assign_task with no path, back with assigned=1', async () => {
    const { POST } = await import('@/app/(app)/[circle]/tasks/[task]/assign/submit/route');
    const res = await POST(post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: RUTH }), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?assigned=1`);
    expect(tasksHc.assignTask).toHaveBeenCalledWith(CLAIMS, TASK, RUTH, {});
  });

  it('assign, the crossing: the candidate cannot see it and no path was chosen ⇒ the crossing screen, nothing written', async () => {
    const { POST } = await import('@/app/(app)/[circle]/tasks/[task]/assign/submit/route');
    const res = await POST(post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: MARISOL }), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}/assign?member=${MARISOL}`);
    expect(tasksHc.assignTask).not.toHaveBeenCalled();
  });

  it('assign by path 1: the typed instruction, whitespace-only is no instruction', async () => {
    const { POST } = await import('@/app/(app)/[circle]/tasks/[task]/assign/submit/route');
    tasksHc.assignTask.mockResolvedValueOnce({ task_id: TASK, member_id: MARISOL, path: 'instruction', changed: true, instruction_task_id: 'i-1' });
    let res = await POST(
      post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: MARISOL, instruction: '  Pick up the prescription  ' }),
      ctx,
    );
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?assigned=1&path=instruction`);
    expect(tasksHc.assignTask).toHaveBeenCalledWith(CLAIMS, TASK, MARISOL, { instruction: 'Pick up the prescription' });

    res = await POST(post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: MARISOL, instruction: '   ' }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}/assign?member=${MARISOL}&e=instruction`);
  });

  it('assign by path 2: the share rides the step-up cookie into the definer and the cookie is cleared; without it, back to the step-up', async () => {
    const { POST } = await import('@/app/(app)/[circle]/tasks/[task]/assign/submit/route');
    tasksHc.assignTask.mockResolvedValueOnce({ task_id: TASK, member_id: MARISOL, path: 'share', changed: true, share_ids: ['s1', 's2'] });
    let res = await POST(
      post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: MARISOL, share_document: DOC }, 'hc-step-up=tok-123; other=x'),
      ctx,
    );
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?assigned=1&path=share`);
    expect(tasksHc.assignTask).toHaveBeenCalledWith(CLAIMS, TASK, MARISOL, { shareDocument: DOC, stepUpToken: 'tok-123' });
    expect(res.headers.get('set-cookie')).toMatch(/hc-step-up=;.*Max-Age=0/);

    res = await POST(post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: MARISOL, share_document: DOC }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}/assign?member=${MARISOL}&path=share&document=${DOC}&e=step-up`);
  });

  it('a refusal lands back with one marker; a missing member never reaches the definer', async () => {
    const { POST } = await import('@/app/(app)/[circle]/tasks/[task]/assign/submit/route');
    tasksHc.assignTask.mockRejectedValueOnce(new Error('assign_refused'));
    let res = await POST(post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, { member_id: RUTH }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=assign`);
    res = await POST(post(`/${CIRCLE}/tasks/${TASK}/assign/submit`, {}), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=assign`);
    expect(tasksHc.assignTask).toHaveBeenCalledTimes(1);
  });

  it('unassign carries the keep list; complete and snooze ride their wrappers', async () => {
    const unassign = await import('@/app/(app)/[circle]/tasks/[task]/unassign/submit/route');
    let res = await unassign.POST(post(`/${CIRCLE}/tasks/${TASK}/unassign/submit`, { keep_share_ids: ['sh-1', 'sh-2'] }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?unassigned=1`);
    expect(tasksHc.unassignTask).toHaveBeenCalledWith(CLAIMS, TASK, ['sh-1', 'sh-2']);

    const complete = await import('@/app/(app)/[circle]/tasks/[task]/complete/submit/route');
    res = await complete.POST(post(`/${CIRCLE}/tasks/${TASK}/complete/submit`, {}), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?done=1`);
    expect(tasksHc.completeTask).toHaveBeenCalledWith(CLAIMS, TASK);

    const snooze = await import('@/app/(app)/[circle]/tasks/[task]/snooze/submit/route');
    res = await snooze.POST(post(`/${CIRCLE}/tasks/${TASK}/snooze/submit`, { due_on: '2026-09-17', due_zone: 'America/New_York' }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?snoozed=1`);
    expect(tasksHc.snoozeTask).toHaveBeenCalledWith(CLAIMS, TASK, '2026-09-17', 'America/New_York');

    res = await snooze.POST(post(`/${CIRCLE}/tasks/${TASK}/snooze/submit`, { due_on: 'not a date', due_zone: 'America/New_York' }), ctx);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=snooze`);
    expect(tasksHc.snoozeTask).toHaveBeenCalledTimes(1);
  });

  it('every refusal is one marker per verb, never a 500', async () => {
    tasksHc.completeTask.mockRejectedValueOnce(new Error('complete_refused'));
    tasksHc.snoozeTask.mockRejectedValueOnce(new Error('snooze_refused'));
    tasksHc.unassignTask.mockRejectedValueOnce(new Error('unassign_refused'));
    const complete = await import('@/app/(app)/[circle]/tasks/[task]/complete/submit/route');
    expect((await complete.POST(post(`/${CIRCLE}/tasks/${TASK}/complete/submit`, {}), ctx)).headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=complete`);
    const snooze = await import('@/app/(app)/[circle]/tasks/[task]/snooze/submit/route');
    expect((await snooze.POST(post(`/${CIRCLE}/tasks/${TASK}/snooze/submit`, { due_on: '2026-09-17', due_zone: 'x' }), ctx)).headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=snooze`);
    const unassign = await import('@/app/(app)/[circle]/tasks/[task]/unassign/submit/route');
    expect((await unassign.POST(post(`/${CIRCLE}/tasks/${TASK}/unassign/submit`, {}), ctx)).headers.get('location')).toBe(`/${CIRCLE}/tasks/${TASK}?e=unassign`);
  });
});
