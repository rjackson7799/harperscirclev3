import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 8B U2 · THE SEARCH FIELD in the top bar (PRD §4.7.3; design_spec §4's
// order — "logo + wordmark · ask-the-record search field · (auto margin)";
// slice-8 plan "### 8B" unit 2; settled items 2 and 6; SRCH-04's field
// half; A11Y-12's "labelled and reachable").
//
//   · a plain GET form to /[circle]/search — no client fetch, no
//     suggestion list, no autocomplete attribute (§7.4: "a decision, not an
//     omission", asserted as ABSENCES over the rendered tree);
//   · the §4.7.3 placeholder — `Search Nell's record` for one subject,
//     `Search the record` for two — from the WIDENED myMembership query the
//     layout ALREADY makes (item 2: never a second call per screen), and
//     `Search the record` when that read fails: true for every circle;
//   · the first-open hint under the field, verbatim: "Find documents, dates
//     and tasks." — the input's accessible description;
//   · labelled: a <label> bound to the input, so the field has an
//     accessible name that is not its placeholder;
//   · in the TOP BAR for EVERY member (item 6): the nav's tier courtesy
//     hides Documents from a caregiver; the field is not in NAV_MANIFEST
//     and renders for her too, because her assigned tasks are findable.
//
// Test class: RENDERED TREE (renderToStaticMarkup); the layout's reads are
// mocked at the module boundary.
// ============================================================================

vi.mock('next/navigation', () => ({
  usePathname: () => '/c-1/timeline',
}));

const getClaims = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims, getUser } }),
}));

const tasksHc = { myMembership: vi.fn() };
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

const NELL = { id: 's-1', first_name: 'Nell', seq: 1 };
const MARCUS = { id: 's-2', first_name: 'Marcus', seq: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getClaims.mockResolvedValue({
    data: { claims: { sub: 'u-1', email: 'sarah@example.com' } },
    error: null,
  });
  tasksHc.myMembership.mockResolvedValue({ id: 'm-1', tier: 'coordinator', subjects: [NELL] });
});

async function renderLayout() {
  const { default: Layout } = await import('@/app/(app)/[circle]/layout');
  return renderToStaticMarkup(
    await Layout({ children: <p>page-body</p>, params: Promise.resolve({ circle: 'c-1' }) }),
  );
}

describe('SearchField — a plain GET form, labelled, with the hint', () => {
  it('renders role="search", method GET to /[circle]/search, one named input `q` of type search', async () => {
    const { SearchField } = await import('@/components/shell/SearchField');
    const html = renderToStaticMarkup(<SearchField circle="c-1" placeholder="Search the record" />);
    expect(html).toMatch(/<form[^>]*role="search"/);
    expect(html).toMatch(/<form[^>]*method="get"/i);
    expect(html).toMatch(/<form[^>]*action="\/c-1\/search"/);
    expect(html).toMatch(/<input[^>]*type="search"/);
    expect(html).toMatch(/<input[^>]*name="q"/);
    expect(html).toContain('placeholder="Search the record"');
  });

  it('the input has an accessible NAME from a bound <label>, and the hint as its DESCRIPTION, verbatim', async () => {
    const { SearchField } = await import('@/components/shell/SearchField');
    const html = renderToStaticMarkup(<SearchField circle="c-1" placeholder="Search the record" />);
    const id = /<input[^>]*\bid="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}"`);
    const describedBy = /<input[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>Find documents, dates and tasks\\.<`));
  });

  it('the absences (§7.4): no autocomplete attribute, no datalist, no list binding, no script, no client fetch', async () => {
    const { SearchField } = await import('@/components/shell/SearchField');
    const html = renderToStaticMarkup(<SearchField circle="c-1" placeholder="Search the record" />);
    expect(html).not.toMatch(/autocomplete/i);
    expect(html).not.toMatch(/<datalist|\blist=/);
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/role="listbox"|role="combobox"|aria-autocomplete/);
  });

  it('the input carries the same cap the page enforces at ingress (maxlength 200)', async () => {
    const { SearchField } = await import('@/components/shell/SearchField');
    const html = renderToStaticMarkup(<SearchField circle="c-1" placeholder="Search the record" />);
    expect(html).toMatch(/<input[^>]*maxlength="200"/i);
  });
});

describe('the (app)/[circle] layout — the field in TopBar’s slot, the placeholder from the ONE membership read', () => {
  it('one subject: `Search Nell’s record`, rendered between the wordmark and the spacer', async () => {
    const html = await renderLayout();
    expect(html).toContain('placeholder="Search Nell&#x27;s record"');
    expect(html).toContain('action="/c-1/search"');
    const wordmark = html.indexOf('wordmark');
    const field = html.indexOf('search-field');
    const spacer = html.indexOf('topbar-spacer');
    expect(field).toBeGreaterThan(wordmark);
    expect(spacer).toBeGreaterThan(field);
    // ONE read: the layout made exactly the call it already made
    expect(tasksHc.myMembership).toHaveBeenCalledTimes(1);
  });

  it('two subjects: `Search the record`', async () => {
    tasksHc.myMembership.mockResolvedValue({ id: 'm-1', tier: 'coordinator', subjects: [NELL, MARCUS] });
    const html = await renderLayout();
    expect(html).toContain('placeholder="Search the record"');
  });

  it('the read FAILS: the field still renders, saying `Search the record` — true for every circle, promising nothing', async () => {
    tasksHc.myMembership.mockRejectedValue(new Error('pool exhausted'));
    const html = await renderLayout();
    expect(html).toContain('placeholder="Search the record"');
    expect(html).toContain('action="/c-1/search"');
  });

  it('a membership WITHOUT the widened column (an older shape) still yields `Search the record`', async () => {
    tasksHc.myMembership.mockResolvedValue({ id: 'm-1', tier: 'family' });
    const html = await renderLayout();
    expect(html).toContain('placeholder="Search the record"');
  });

  it('the caregiver: the nav hides Documents (the courtesy) and the field renders anyway (item 6, AC-TASK-5)', async () => {
    tasksHc.myMembership.mockResolvedValue({ id: 'm-1', tier: 'care_circle', subjects: [NELL] });
    const html = await renderLayout();
    expect(html).not.toContain('href="/c-1/documents"');
    expect(html).toContain('href="/c-1/tasks"');
    expect(html).toContain('action="/c-1/search"');
    expect(html).toContain('placeholder="Search Nell&#x27;s record"');
  });

  it('signed out: the chrome still carries the field (pages own the redirect; the gated page refuses for itself)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    const html = await renderLayout();
    expect(html).toContain('action="/c-1/search"');
    expect(html).toContain('placeholder="Search the record"');
    expect(tasksHc.myMembership).not.toHaveBeenCalled();
  });
});
