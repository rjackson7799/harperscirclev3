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

type Result = { data: unknown[] | null; error: { message: string } | null };
const TABLES = new Map<string, Result>();

/** supabase-js's builder is thenable at every link; the TABLE decides the
 *  answer, so one page can hold several reads that differ. */
function chain(table: string): Record<string, unknown> {
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle', 'gte', 'not']) {
    proxy[m] = () => proxy;
  }
  const answer = (): Promise<unknown> =>
    Promise.resolve(TABLES.get(table) ?? { data: [], error: null });
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  TABLES.clear();
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  TABLES.set('subjects', { data: [NELL], error: null });
  TABLES.set('arrivals', { data: [], error: null });
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
  it('a caller whose arrivals read FAILED is never shown the day-one card', async () => {
    TABLES.set('arrivals', { data: null, error: { message: 'permission denied' } });
    const text = words(await renderHome());
    expect(text).not.toContain(completionPromises.instruction);
    expect(text).not.toContain('nell.k7m2qp@harperscircle.app');
    expect(text).toContain('Nothing here needs you right now.');
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
