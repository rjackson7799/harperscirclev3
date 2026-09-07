import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { completionPromises } from '@/lib/setup/completion-copy';

// ============================================================================
// 9B U1 · /[circle] — HOME, THE DAY-ONE CARD (PRD §4.7.1; AC-HOME-1; HOME-01;
// slice-9 plan Q5, Q6).
//
// "Before anything has ever arrived, Home does ONE job: get the family to
// forward something. One card, the subject's forwarding address, one
// instruction. No grid of empty cards, no '0 documents · 0 tasks · 0 events,'
// no onboarding checklist. If there are two subjects, both addresses,
// labelled."
//
// THE ORDER IS LOAD-BEARING (plan Q1). This file goes green against a tree
// where the router DOES NOT EXIST YET, and its absence set must survive the
// router's arrival in U2 — written the other way round, "nothing else" would
// be an author's list of what to exclude from a page that already has
// everything.
//
// The branch is Q5's, exactly: the day-one card is shown ONLY to a caller
// whose arrivals read SUCCEEDS AND RETURNS ZERO. A read that FAILED is not a
// read that returned nothing, and every other caller gets the router.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority is the browser leg
// and lib/hc's own live-DB suites).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

type Result = {
  data: unknown[] | null;
  error: { message: string } | null;
  /** supabase-js's exact count, when the read asked for one. */
  count?: number | null;
};
const TABLES = new Map<string, Result>();
/** Two reads can share a table and ask different questions — the arrivals
 *  the Care Inbox lists, and the ones waiting on a person. The FILTER is
 *  what tells them apart, so the mock records it. */
const FILTERED = new Map<string, Result>();
const key = (table: string, col: string, val: unknown) => `${table}:${col}=${String(val)}`;

/** supabase-js's builder is thenable at every link; the table AND the
 *  filters decide the answer, so one page can hold several reads that
 *  differ. */
function chain(table: string): Record<string, unknown> {
  const filters: string[] = [];
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle', 'gte', 'not']) {
    proxy[m] = () => proxy;
  }
  proxy.eq = (col: string, val: unknown) => {
    filters.push(key(table, col, val));
    return proxy;
  };
  const answer = (): Promise<unknown> => {
    for (const f of filters) if (FILTERED.has(f)) return Promise.resolve(FILTERED.get(f));
    return Promise.resolve(TABLES.get(table) ?? { data: [], error: null, count: 0 });
  };
  proxy.then = (...a: unknown[]) => answer().then(...(a as [never]));
  proxy.catch = (...a: unknown[]) => answer().catch(...(a as [never]));
  return proxy;
}
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({
    from: (t: string) => chain(t),
    auth: { getClaims: vi.fn(), getUser: vi.fn() },
  }),
}));

// The router's four other blocks read through the typed wrappers, each one
// the read its DESTINATION surface already makes (plan Q5; HOME-02).
const tasksHc = { myMembership: vi.fn(), listTasks: vi.fn() };
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});
const timelineHc = {
  latestEventPerSubject: vi.fn(),
  upcomingEvents: vi.fn(),
  recentEvents: vi.fn(),
};
vi.mock('@/lib/hc/timeline', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/timeline')>('@/lib/hc/timeline');
  return { ...actual, ...timelineHc };
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
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const NELL = {
  id: '22222222-0000-4000-8000-000000000002',
  first_name: 'Nell',
  situation: 'At home, with help twice a week',
  forwarding_local_part: 'nell.k7m2qp',
  forwarding_active_at: '2026-08-01T10:00:00Z',
};
const MARCUS = {
  id: '22222222-0000-4000-8000-000000000012',
  first_name: 'Marcus',
  situation: 'In hospital right now',
  forwarding_local_part: 'marcus.b4x9tt',
  forwarding_active_at: '2026-08-01T10:00:00Z',
};

async function renderHome() {
  const { default: Page } = await import('@/app/(app)/[circle]/page');
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ circle: CIRCLE }) }));
}

/** The words as a reader sees them: tags gone, entities decoded. */
function words(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One arrival in the Care Inbox: enough to leave the day-one branch. */
const ARRIVED = {
  id: '55555555-0000-4000-8000-000000000005',
  state: 'filed',
  received_at: '2026-09-01T09:00:00Z',
  channel: 'email',
  sender_display_name: 'Ridgeview Clinic',
  sender_address: 'records@ridgeview.example',
};

function event(over: Record<string, unknown> = {}) {
  return {
    id: 'eeeeeeee-0000-4000-8000-0000000000e1',
    circle_id: CIRCLE,
    subject_id: NELL.id,
    subject_name: 'Nell',
    subject_seq: 1,
    kind: 'medical',
    summary: 'Discharge summary filed',
    when: { kind: 'date', on: '2026-08-28' },
    sort_at: '2026-08-28T12:00:00Z',
    episode: null,
    source: { kind: 'none' },
    extraction: null,
    linked_documents: [],
    approved_at: '2026-08-29T10:00:00Z',
    approver_display_name: 'Sarah',
    ...over,
  };
}

function task(over: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    circle_id: CIRCLE,
    subject_id: NELL.id,
    subject_name: 'Nell',
    subject_seq: 1,
    title: 'Call the pharmacy',
    detail: null,
    due_on: '2026-09-10',
    due_zone: 'America/New_York',
    status: 'open',
    owner_member_id: '44444444-0000-4000-8000-000000000004',
    owner_name: 'Sarah',
    assigned_at: null,
    assigned_by_name: null,
    snooze_count: 0,
    written_for_member_id: null,
    written_from_task_id: null,
    taint: [],
    taint_resolved: true,
    source: { kind: 'none' },
    approved_at: '2026-08-29T10:00:00Z',
    approver_display_name: 'Sarah',
    completed_at: null,
    completed_by_name: null,
    can_manage: true,
    can_view: true,
    ...over,
  };
}

const ME = '44444444-0000-4000-8000-000000000004';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  TABLES.clear();
  FILTERED.clear();
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  TABLES.set('subjects', { data: [NELL], error: null });
  TABLES.set('arrivals', { data: [], error: null, count: 0 });
  tasksHc.myMembership.mockResolvedValue({ id: ME, tier: 'coordinator', subjects: [] });
  tasksHc.listTasks.mockResolvedValue([]);
  timelineHc.latestEventPerSubject.mockResolvedValue(new Map());
  timelineHc.upcomingEvents.mockResolvedValue([]);
  timelineHc.recentEvents.mockResolvedValue([]);
});

describe('HOME-01 · day one — one instruction, the forwarding address, and NOTHING ELSE', () => {
  it('renders the instruction and the address, labelled by the subject name', async () => {
    const text = words(await renderHome());
    expect(text).toContain('Nell');
    expect(text).toContain('nell.k7m2qp@harperscircle.app');
    expect(text).toContain(completionPromises.instruction);
  });

  it('two subjects: BOTH addresses, each labelled by name', async () => {
    TABLES.set('subjects', { data: [NELL, MARCUS], error: null });
    const text = words(await renderHome());
    expect(text).toContain('Nell');
    expect(text).toContain('nell.k7m2qp@harperscircle.app');
    expect(text).toContain('Marcus');
    expect(text).toContain('marcus.b4x9tt@harperscircle.app');
    // ONE instruction, not one per subject.
    expect(text.split(completionPromises.instruction).length - 1).toBe(1);
  });

  // The assertion AC-HOME-1 actually makes is a set of ABSENCES, and it is
  // written here against a tree where the router does not exist — so U2's
  // job is to keep it true, not to be excluded from it by hand.
  it('AND NOTHING ELSE: no card grid, no zero, no checklist, no empty-state heading', async () => {
    TABLES.set('subjects', { data: [NELL, MARCUS], error: null });
    const html = await renderHome();
    const text = words(html);
    // No number the family did not put there themselves: a bare count of
    // anything is what "0 documents · 0 tasks · 0 events" is made of.
    const numeric = text.split(/\s+/).filter((t) => /^\d+$/.test(t.replace(/[·.,]/g, '')));
    expect(numeric, `bare numbers rendered on the day-one screen: ${numeric.join(', ')}`).toEqual(
      [],
    );
    // No onboarding checklist.
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('<ol');
    expect(html).not.toContain('type="checkbox"');
    // No second heading of any kind: the page has its one title, and no
    // empty-state heading under it.
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('<h3');
    // And none of the router's blocks.
    for (const block of [
      'What needs review',
      'My open tasks',
      "What's coming",
      'Recent activity',
      'How Nell is',
    ]) {
      expect(text).not.toContain(block);
    }
  });

  // Q5, the day-one branch: a fact about what the CALLER can see is not a
  // fact about the CIRCLE, and a read that failed is not a read that
  // returned nothing.
  // The honest line itself is the ROUTER's, and it is asserted where it
  // belongs — in U2's "a block whose read returns nothing" case, with every
  // read empty. Here the claim is only the one this case is about: a failed
  // read never produces the day-one card.
  it('a caller whose arrivals read FAILED is never shown the day-one card', async () => {
    TABLES.set('arrivals', { data: null, error: { message: 'permission denied' } });
    const text = words(await renderHome());
    expect(text).not.toContain(completionPromises.instruction);
    expect(text).not.toContain('nell.k7m2qp@harperscircle.app');
  });

  it('a caller whose arrivals read returns rows is never shown the day-one card', async () => {
    TABLES.set('arrivals', {
      data: [
        {
          id: '55555555-0000-4000-8000-000000000005',
          state: 'needs_review',
          received_at: '2026-09-01T09:00:00Z',
        },
      ],
      error: null,
    });
    const text = words(await renderHome());
    expect(text).not.toContain(completionPromises.instruction);
    expect(text).not.toContain('nell.k7m2qp@harperscircle.app');
  });

  // The card is made OF the address: with none to show there is no card to
  // render, and the page says the honest thing instead of an empty one.
  it('no visible forwarding address means no card at all — never an empty one', async () => {
    TABLES.set('subjects', { data: [], error: null });
    const text = words(await renderHome());
    expect(text).not.toContain(completionPromises.instruction);
    expect(text).toContain('Nothing here needs you right now.');
  });

  // An address that is not live yet bounces. Saying so is not decoration:
  // it is the difference between an instruction that works and one that
  // silently does not.
  it('an address that is not live yet says so, and an active one says nothing extra', async () => {
    TABLES.set('subjects', { data: [{ ...NELL, forwarding_active_at: null }], error: null });
    expect(words(await renderHome())).toMatch(/not live yet/i);
    TABLES.set('subjects', { data: [NELL], error: null });
    expect(words(await renderHome())).not.toMatch(/not live yet/i);
  });
});
// ============================================================================
// 9B U2 · THE ROUTER — the five §4.7.2 blocks (HOME-02, HOME-03, HOME-04;
// plan Q5).
//
// Each block renders from its DESTINATION SURFACE'S OWN READ, and a block
// whose read returns nothing renders NOTHING — never a zero, never a
// heading. A rendered `0` is not neutral: "What needs review: 0" shown to a
// member who cannot see the Care Inbox is a claim about rows she is not
// entitled to enumerate, on the surface with the widest audience. The
// absence of the block claims nothing.
//
// HOME-01's absence set above must survive this file. It is not repeated
// here; it is the same file, and it stays green.
// ============================================================================
describe('HOME-02/04 · the router — five blocks, each from its destination surface own read', () => {
  beforeEach(() => {
    // Past day one: the Care Inbox has something in it. It is FILED, so
    // nothing is waiting on a person — the review block's own read asks a
    // different question of the same table, and each case that wants one
    // says so.
    TABLES.set('arrivals', { data: [ARRIVED], error: null, count: 1 });
    FILTERED.set('arrivals:state=proposals_ready', { data: [], error: null, count: 0 });
  });

  it('how each subject is: the name, where they are, and the most recent thing on their record — recorded, never assessed', async () => {
    TABLES.set('subjects', { data: [NELL, MARCUS], error: null });
    timelineHc.latestEventPerSubject.mockResolvedValue(
      new Map([[NELL.id, event({ summary: 'Discharge summary filed' })]]),
    );
    const text = words(await renderHome());
    expect(text).toContain('How Nell is');
    expect(text).toContain('At home, with help twice a week');
    expect(text).toContain('Discharge summary filed');
    // The second subject gets her own block, and no event of her own is
    // not an assessment of anything.
    expect(text).toContain('How Marcus is');
    expect(text).toContain('In hospital right now');
  });

  it('what needs review: the count, plain, with the top item NAMED and the Care Inbox linked', async () => {
    FILTERED.set('arrivals:state=proposals_ready', {
      data: [ARRIVED],
      error: null,
      count: 3,
    });
    const html = await renderHome();
    const text = words(html);
    expect(text).toContain('What needs review');
    expect(text).toMatch(/\b3\b/);
    expect(text).toContain('Ridgeview Clinic');
    expect(html).toContain(`href="/${CIRCLE}/inbox"`);
  });

  it('my open tasks: the CALLER own open tasks, with their dates, and never anybody else', async () => {
    tasksHc.listTasks.mockResolvedValue([
      task({ title: 'Call the pharmacy', owner_member_id: ME, due_on: '2026-09-10' }),
      task({ id: 'aaaaaaaa-0000-4000-8000-0000000000a2', title: 'Book the follow-up', owner_member_id: 'someone-else', due_on: '2026-09-11' }),
      task({ id: 'aaaaaaaa-0000-4000-8000-0000000000a3', title: 'Already done', owner_member_id: ME, status: 'done' }),
    ]);
    const text = words(await renderHome());
    expect(text).toContain('My open tasks');
    expect(text).toContain('Call the pharmacy');
    expect(text).toContain('September 10');
    expect(text).not.toContain('Book the follow-up');
    expect(text).not.toContain('Already done');
  });

  it("what's coming: dated items ALREADY IN THE RECORD, and not a calendar", async () => {
    timelineHc.upcomingEvents.mockResolvedValue([
      event({ id: 'eeeeeeee-0000-4000-8000-0000000000e2', summary: 'Cardiology follow-up', when: { kind: 'date', on: '2026-09-20' } }),
    ]);
    const text = words(await renderHome());
    expect(text).toContain("What's coming");
    expect(text).toContain('Cardiology follow-up');
    expect(text).toContain('September 20');
  });

  it('recent activity: the last few filings, WITH WHO APPROVED THEM', async () => {
    timelineHc.recentEvents.mockResolvedValue([
      event({ id: 'eeeeeeee-0000-4000-8000-0000000000e3', summary: 'Blood results filed', approver_display_name: 'Dan' }),
    ]);
    const text = words(await renderHome());
    expect(text).toContain('Recent activity');
    expect(text).toContain('Blood results filed');
    expect(text).toContain('Dan');
  });

  it('the five blocks render in the §4.7.2 order', async () => {
    TABLES.set('subjects', { data: [NELL], error: null });
    FILTERED.set('arrivals:state=proposals_ready', { data: [ARRIVED], error: null, count: 1 });
    tasksHc.listTasks.mockResolvedValue([task({ owner_member_id: ME })]);
    timelineHc.latestEventPerSubject.mockResolvedValue(new Map([[NELL.id, event()]]));
    timelineHc.upcomingEvents.mockResolvedValue([event({ id: 'eeeeeeee-0000-4000-8000-0000000000e2', summary: 'Cardiology follow-up' })]);
    timelineHc.recentEvents.mockResolvedValue([event({ id: 'eeeeeeee-0000-4000-8000-0000000000e3', summary: 'Blood results filed' })]);
    const text = words(await renderHome());
    const order = ['How Nell is', 'What needs review', 'My open tasks', "What's coming", 'Recent activity'].map(
      (t) => text.indexOf(t),
    );
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  // The rule that buys HOME-01 and HOME-02 at once.
  it('a block whose read returns nothing renders NOTHING — never a zero, never a heading', async () => {
    TABLES.set('subjects', { data: [], error: null });
    const html = await renderHome();
    const text = words(html);
    for (const block of ['How ', 'What needs review', 'My open tasks', "What's coming", 'Recent activity']) {
      expect(text).not.toContain(block);
    }
    expect(html).not.toContain('<h2');
    const numeric = text.split(/\s+/).filter((t) => /^\d+$/.test(t.replace(/[·.,]/g, '')));
    expect(numeric, `bare numbers rendered by an empty router: ${numeric.join(', ')}`).toEqual([]);
    expect(text).toContain('Nothing here needs you right now.');
  });

  it('an empty Care Inbox renders no review block at all — not "0"', async () => {
    FILTERED.set('arrivals:state=proposals_ready', { data: [], error: null, count: 0 });
    timelineHc.recentEvents.mockResolvedValue([event()]);
    const text = words(await renderHome());
    expect(text).not.toContain('What needs review');
    // and the block that DOES have something still renders
    expect(text).toContain('Recent activity');
  });

  // Q5's other half: a caller who cannot enumerate arrivals gets the router
  // and its honest line — never the day-one card, never an instruction
  // addressed to the coordinator.
  it('a caller whose arrivals read FAILED still gets the blocks she CAN see', async () => {
    TABLES.set('arrivals', { data: null, error: { message: 'permission denied' } });
    timelineHc.recentEvents.mockResolvedValue([event()]);
    const text = words(await renderHome());
    expect(text).toContain('Recent activity');
    expect(text).not.toContain(completionPromises.instruction);
    expect(text).not.toContain('What needs review');
  });
});

// ============================================================================
// HOME-03 · no number on Home is model-computed or an assessment.
// Two halves: the FENCE (lib/ai has no import path to this surface, walked
// transitively — not just asserted) and the ABSENCE SET over the rendered
// tree (no chart, score, trend, ratio or progress indicator).
// ============================================================================
describe('HOME-03 · every number is a count of rows the caller can see', () => {
  it('lib/ai has NO import path to the Home surface — the whole reachable graph, walked', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { dirname, join, resolve } = await import('node:path');
    const root = process.cwd();
    const resolveSpec = (spec: string, from: string): string | null => {
      let base: string;
      if (spec.startsWith('@/')) base = join(root, spec.slice(2));
      else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
      else return null; // a package, not our tree
      for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        if (existsSync(base + ext)) return base + ext;
      }
      return existsSync(base) ? base : null;
    };
    const seen = new Set<string>();
    const stack = [join(root, 'app/(app)/[circle]/page.tsx')];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const next = resolveSpec(m[1], file);
        if (next && !seen.has(next)) stack.push(next);
      }
    }
    const ai = [...seen].filter((f) => /[\\/]lib[\\/]ai[\\/]/.test(f));
    expect(ai, `Home reaches the provider adapter: ${ai.join(', ')}`).toEqual([]);
    // A positive control: the walk really did walk.
    expect(seen.size).toBeGreaterThan(5);
  });

  it('no chart, score, trend, ratio or progress indicator in the rendered tree', async () => {
    TABLES.set('arrivals', { data: [ARRIVED], error: null, count: 1 });
    FILTERED.set('arrivals:state=proposals_ready', { data: [ARRIVED], error: null, count: 2 });
    tasksHc.listTasks.mockResolvedValue([task({ owner_member_id: ME })]);
    timelineHc.latestEventPerSubject.mockResolvedValue(new Map([[NELL.id, event()]]));
    timelineHc.recentEvents.mockResolvedValue([event()]);
    const html = await renderHome();
    for (const forbidden of ['<svg', '<canvas', '<progress', '<meter', 'role="progressbar"', 'width: ', 'chart', '%']) {
      expect(html.toLowerCase(), `Home renders "${forbidden}"`).not.toContain(forbidden);
    }
    const text = words(html);
    for (const word of ['score', 'trend', 'progress', 'average', 'out of']) {
      expect(text.toLowerCase(), `Home says "${word}"`).not.toContain(word);
    }
  });
});

// ============================================================================
// 9B U4 · HOME-05's app half — ONE budget around the WHOLE composition, and
// the overrun rendering the honest slow answer (PRD §13.2; OW-03's ruling).
//
// Five budgets that each pass while the page takes six seconds is the exact
// failure a budget exists to prevent, which is why the assertion is on ONE.
// The p95 itself is MEASURED at the 9B head by scripts/bench/home-p95.mjs and
// recorded in the deltas ADR — a number nothing here can assert.
// ============================================================================
describe('HOME-05 · one budget, and a named state rather than a spinner', () => {
  it('an AnswerBudgetExceeded from ANY of the eight reads renders the honest slow answer', async () => {
    // The REAL class: withPageBudget catches by instance, and a look-alike
    // is (correctly) rethrown — a page must not be fooled by a name.
    const { AnswerBudgetExceeded } = await import('@/lib/http/budget');
    timelineHc.recentEvents.mockRejectedValue(new AnswerBudgetExceeded('recentEvents', 15_000));
    const html = await renderHome();
    expect(html).toContain('role="alert"');
    expect(html).toContain('taking longer than usual');
    expect(html).toContain(`href="/${CIRCLE}"`);
  });

  it('a refused read is an ERROR STATE with "try again" — never a throw, never an empty Home', async () => {
    tasksHc.listTasks.mockRejectedValue(new Error('permission denied for table tasks'));
    const html = await renderHome();
    expect(html).toContain('role="alert"');
    expect(html).toContain('try again');
    // and it is NOT mistaken for day one
    expect(html).not.toContain('harperscircle.app');
  });

  it('signed out ⇒ the sign-in redirect carries Home as `next`', async () => {
    session.readLiveSession.mockResolvedValue({ kind: 'signed-out' });
    await expect(renderHome()).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/${CIRCLE}`)}`,
    );
  });

  it('every read is RACED through the one budget — none escapes it', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(app)/[circle]/page.tsx', 'utf8');
    expect(src.match(/withPageBudget\(/g)?.length, 'exactly ONE budget').toBe(1);
    // Eight reads, eight races: the day-one branch and the five blocks.
    expect(src.match(/budget\.race\(/g)?.length).toBe(8);
    // Nothing awaits a read outside the race.
    expect(src).not.toMatch(/await\s+(readArrivals|readSubjects|readNeedsReview|listTasks|myMembership|recentEvents|upcomingEvents|latestEventPerSubject)\(/);
  });
});

// ============================================================================
// A11Y-13 · Home's structure, built INTO the surface (design_spec §8.7; G12 is
// the final gate, not the first check — a structural failure found there is a
// redesign, not a fix).
//
// The browser half — axe at WCAG 2.2 AA, 390 px, keyboard — is the a11y.spec
// leg. What is assertable over the rendered tree is here: the landmark
// structure, every block headed and its heading BOUND to its section, and no
// meaning carried by colour alone.
// ============================================================================
describe('A11Y-13 · landmark structure and headed blocks, over the rendered tree', () => {
  beforeEach(() => {
    TABLES.set('arrivals', { data: [ARRIVED], error: null, count: 1 });
    FILTERED.set('arrivals:state=proposals_ready', { data: [ARRIVED], error: null, count: 2 });
    tasksHc.listTasks.mockResolvedValue([task({ owner_member_id: ME })]);
    timelineHc.latestEventPerSubject.mockResolvedValue(new Map([[NELL.id, event()]]));
    timelineHc.upcomingEvents.mockResolvedValue([event({ id: 'eeeeeeee-0000-4000-8000-0000000000e2' })]);
    timelineHc.recentEvents.mockResolvedValue([event({ id: 'eeeeeeee-0000-4000-8000-0000000000e3' })]);
  });

  it('every block is a section whose aria-labelledby names its own heading', async () => {
    const html = await renderHome();
    const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(labelled.length).toBeGreaterThanOrEqual(5);
    for (const id of labelled) {
      expect(html, `no heading carries id="${id}"`).toContain(`id="${id}"`);
    }
    // One h1 (the page's own), and every other block heading an h2 — never a
    // level skipped, never a heading standing outside its section.
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).not.toContain('<h3');
  });

  it('the day-one card is reachable and labelled — the address is text, not an image or a bare mono blob', async () => {
    TABLES.set('arrivals', { data: [], error: null, count: 0 });
    const html = await renderHome();
    expect(html).toContain('forwarding address');
    expect(html).toContain('nell.k7m2qp@harperscircle.app');
    expect(html).not.toContain('<img');
  });

  it('nothing on Home carries meaning by colour alone — every emphasis is a word', async () => {
    const html = await renderHome();
    expect(html).not.toMatch(/style="[^"]*color/i);
    expect(html).not.toMatch(/class="[^"]*\b(red|green|amber|danger|warning|success)\b/i);
  });
});
