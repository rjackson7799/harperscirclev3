import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 8B U3 · /[circle]/search — the results page (PRD §4.7.3; TSD §7.4, §7.6;
// slice-8 plan "### 8B" unit 3; settled items 1, 4, 5; SRCH-04/05/06's app
// halves; AC-HOME-4).
//
//   · inside withPageBudget: the three reads answer inside ONE AnswerBudget
//     and an overrun renders the honest slow answer (Q4(4));
//   · `q` is capped AT INGRESS: an over-cap term is refused with the
//     empty-result copy, never an error — and the module is never called;
//   · grouped by kind, each group a HEADED section, each row LABELLED BY
//     SUBJECT and linking to the object; an empty group renders NOTHING —
//     not "0 documents", which is a count (item 5);
//   · the emphasis is a <mark> BUILT BY REACT from the module's parts —
//     structure, never markup: a document's own `<b>` renders escaped;
//   · the four §4.7.3 strings verbatim; and the ABSENCES over the rendered
//     tree — no total, no count of withheld results, no "showing N of M",
//     no field of its own, no autocomplete, no listbox, no prose answer.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority: tests/hc/search
// .test.ts and the 8B search legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const searchHc = { searchRecord: vi.fn() };
vi.mock('@/lib/hc/search', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/search')>('@/lib/hc/search');
  return { ...actual, ...searchHc };
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
const MARCUS = '22222222-0000-4000-8000-000000000003';
const D1 = '66666666-0000-4000-8000-000000000006';
const T1 = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const E1 = 'eeeeeeee-0000-4000-8000-0000000000e1';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const EMPTY = { documents: [], events: [], tasks: [] };

function row(over: Record<string, unknown>) {
  return {
    kind: 'document',
    id: D1,
    subject_id: NELL,
    subject_name: 'Nell',
    subject_seq: 1,
    category: 'medical',
    title: 'Discharge summary · Jul 12',
    rank: 0.6,
    snippet: [
      { text: 'Home with ', hit: false },
      { text: 'cardiology', hit: true },
      { text: ' follow-up.', hit: false },
    ],
    ...over,
  };
}

const RESULTS = {
  documents: [row({})],
  events: [
    row({
      kind: 'timeline_event',
      id: E1,
      subject_id: MARCUS,
      subject_name: 'Marcus',
      subject_seq: 2,
      category: 'care',
      title: 'Cardiology consult booked',
      snippet: [
        { text: 'Cardiology', hit: true },
        { text: ' consult booked', hit: false },
      ],
    }),
  ],
  tasks: [
    row({
      kind: 'task',
      id: T1,
      category: null,
      title: 'Call Riverbend Cardiology',
      snippet: [
        { text: 'Call Riverbend ', hit: false },
        { text: 'Cardiology', hit: true },
      ],
    }),
  ],
};

async function renderPage(sp: Record<string, string | string[]> = {}) {
  const { default: Page } = await import('@/app/(app)/[circle]/search/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }), searchParams: Promise.resolve(sp) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  searchHc.searchRecord.mockResolvedValue(RESULTS);
});

describe('the results — grouped by kind, headed, labelled by subject, each a link', () => {
  it('three headed groups in §4.7.3 order (documents, timeline, tasks), each row linking to its object', async () => {
    const html = await renderPage({ q: 'cardiology' });
    const docs = html.indexOf('id="results-documents"');
    const tl = html.indexOf('id="results-timeline"');
    const tasks = html.indexOf('id="results-tasks"');
    expect(docs).toBeGreaterThan(-1);
    expect(tl).toBeGreaterThan(docs);
    expect(tasks).toBeGreaterThan(tl);
    expect(html).toMatch(/<section[^>]*aria-labelledby="results-documents"[^>]*>\s*<h2 id="results-documents">Documents<\/h2>/);
    expect(html).toMatch(/<h2 id="results-timeline">Timeline<\/h2>/);
    expect(html).toMatch(/<h2 id="results-tasks">Tasks<\/h2>/);
    expect(html).toContain(`href="/${CIRCLE}/documents/${D1}"`);
    expect(html).toContain(`href="/${CIRCLE}/timeline/${E1}"`);
    expect(html).toContain(`href="/${CIRCLE}/tasks/${T1}"`);
    expect(html).toContain('Discharge summary · Jul 12');
    expect(html).toContain('Call Riverbend Cardiology');
  });

  it('every row carries its SUBJECT LABEL by name (§7.6: a two-subject circle never renders an unlabelled row) and its category where the kind has one', async () => {
    const html = await renderPage({ q: 'cardiology' });
    expect(html.match(/class="subject-label"/g)?.length).toBe(3);
    expect(html).toMatch(/subject-label"[^]*?Nell<\/span>/);
    expect(html).toMatch(/subject-label"[^]*?Marcus<\/span>/);
    expect(html).toContain('Medical');
  });

  it('the module is called ONCE with the circle and the bounded term — one channel, three reads inside', async () => {
    await renderPage({ q: '  cardiology ' });
    expect(searchHc.searchRecord).toHaveBeenCalledTimes(1);
    expect(searchHc.searchRecord).toHaveBeenCalledWith(CLAIMS, CIRCLE, 'cardiology');
  });

  it('an empty group renders NOTHING — no heading, no "0 tasks" (item 5: that is a count)', async () => {
    searchHc.searchRecord.mockResolvedValue({ ...RESULTS, tasks: [], events: [] });
    const html = await renderPage({ q: 'cardiology' });
    expect(html).toContain('id="results-documents"');
    expect(html).not.toContain('results-tasks');
    expect(html).not.toContain('results-timeline');
    expect(html).not.toMatch(/\b0 (tasks|documents|events)\b/i);
  });
});

describe('SRCH-05 · the emphasis is STRUCTURE, never markup', () => {
  it('a hit part becomes a <mark> built by React; plain parts stay text; the snippet carries no <b>', async () => {
    const html = await renderPage({ q: 'cardiology' });
    expect(html).toMatch(/<p class="search-snippet">Home with <mark>cardiology<\/mark> follow-up\.<\/p>/);
    expect(html).not.toContain('<b>');
  });

  it('HTML inside a part is ESCAPED — a document that says <b> or <script> renders as those characters, never as elements', async () => {
    searchHc.searchRecord.mockResolvedValue({
      ...EMPTY,
      documents: [
        row({
          snippet: [
            { text: '<b>bold</b> ', hit: false },
            { text: 'cardiology', hit: true },
            { text: ' <script>alert(1)</script>', hit: false },
          ],
        }),
      ],
    });
    const html = await renderPage({ q: 'cardiology' });
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt; <mark>cardiology</mark> &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
  });
});

describe('SRCH-04/06 · the copy, the cap, the absences', () => {
  it('nothing in any group: the empty copy VERBATIM, and no group, no count', async () => {
    searchHc.searchRecord.mockResolvedValue(EMPTY);
    const html = await renderPage({ q: 'xylophone' });
    expect(html).toContain('<p class="empty-state">Nothing matching that, in what you can see.</p>');
    expect(html).not.toContain('<section');
    expect(html).not.toMatch(/\b\d+ (results?|matches)\b/i);
  });

  it('an over-cap term is refused AT INGRESS with the empty copy — the module is never called, nothing throws', async () => {
    const html = await renderPage({ q: 'x'.repeat(201) });
    expect(html).toContain('Nothing matching that, in what you can see.');
    expect(searchHc.searchRecord).not.toHaveBeenCalled();
    expect(html).not.toMatch(/too long|error/i);
  });

  it('a blank or absent term: the first-open hint, verbatim, and no read', async () => {
    for (const sp of [{}, { q: '   ' }, { q: ['a', 'b'] }] as Record<string, string | string[]>[]) {
      const html = await renderPage(sp);
      expect(html).toContain('Find documents, dates and tasks.');
      expect(html).not.toContain('Nothing matching that');
    }
    expect(searchHc.searchRecord).not.toHaveBeenCalled();
  });

  it('the page echoes the term as TEXT in its context line — escaped, never composed into an answer', async () => {
    searchHc.searchRecord.mockResolvedValue(EMPTY);
    const html = await renderPage({ q: '<img src=x onerror=1>' });
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('<img');
  });

  it('the ABSENCES over the rendered tree: no total, no "showing N of M", no field of its own, no autocomplete, no listbox, no "I"', async () => {
    const html = await renderPage({ q: 'cardiology' });
    expect(html).not.toMatch(/\b\d+ (results?|matches|of \d+)\b/i);
    expect(html).not.toMatch(/showing/i);
    expect(html).not.toMatch(/<input/);
    expect(html).not.toMatch(/autocomplete|datalist|role="listbox"|role="combobox"/i);
    expect(html).not.toMatch(/>I (found|think|see)\b/);
    // main's children: the header, then sections — nothing else
    expect(html).not.toMatch(/more results|load more|next page|page \d/i);
  });
});

describe('the bounds — a named state, never a spinner, never a 500', () => {
  it('an AnswerBudgetExceeded from the read renders the honest slow answer with "try again" to this search', async () => {
    const err = new Error('budget: searchRecord exceeded 15000 ms');
    err.name = 'AnswerBudgetExceeded';
    searchHc.searchRecord.mockRejectedValue(err);
    const html = await renderPage({ q: 'cardiology' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('taking longer than usual');
    expect(html).toContain(`href="/${CIRCLE}/search?q=cardiology"`);
  });

  it('a refused read is an error state with "try again", not a throw', async () => {
    searchHc.searchRecord.mockRejectedValue(new Error('permission denied for table documents'));
    const html = await renderPage({ q: 'cardiology' });
    expect(html).toContain('role="alert"');
    expect(html).toContain("couldn&#x27;t search");
    expect(html).toContain('try again');
  });

  it('signed out ⇒ the sign-in redirect carries this search as `next`', async () => {
    session.readLiveSession.mockResolvedValue({ kind: 'signed-out' });
    await expect(renderPage({ q: 'cardiology' })).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/${CIRCLE}/search?q=cardiology`)}`,
    );
  });
});
