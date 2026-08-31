import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7C C1 · /[circle]/documents — the list (PRD §4.3.1, §4.3.2, §4.3.7;
// DOC-01's app half; AC-DOC-2's surface half; settled item 2's list side).
//
//   · by category (the seven) and by subject, at the member's own level —
//     ONE RLS-true fetch, and BOTH the tab counts and the filtered rows are
//     computed over exactly what RLS returned (counts post-filter);
//   · a row is title · category · date · subject, linking to the detail —
//     no viewer, no byte path, nothing that implies one;
//   · "Add a document" leads to the EXISTING upload page — uploading from
//     Documents is an ingestion, never a bypass (AC-DOC-2);
//   · an arrival in flight appears as a row wearing hc.product_state's
//     §4.2.2 label and leads to the Care Inbox (§4.3.7);
//   · empty: "Nothing filed yet." — true whenever nothing is FILED, even
//     while something has arrived;
//   · `documents` joins NAV_MANIFEST under THE RECORD.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority:
// tests/hc/documents.test.ts and the C6 documents legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const docsHc = {
  documentsFor: vi.fn(),
  uploadArrivalsInFlight: vi.fn(),
};
vi.mock('@/lib/hc/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/documents')>('@/lib/hc/documents');
  return { ...actual, ...docsHc };
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
const D2 = '66666666-0000-4000-8000-000000000007';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const ROWS = [
  {
    id: D1,
    subject_id: NELL,
    subject_name: 'Nell',
    subject_seq: 1,
    title: 'Discharge summary · Jul 12',
    category: 'insurance',
    filed_at: '2026-07-12T15:00:00Z',
  },
  {
    id: D2,
    subject_id: MARCUS,
    subject_name: 'Marcus',
    subject_seq: 2,
    title: 'Cardiology consult · Aug 2',
    category: 'medical',
    filed_at: '2026-08-02T15:00:00Z',
  },
];

async function renderPage(sp: Record<string, string> = {}) {
  const { default: Page } = await import('@/app/(app)/[circle]/documents/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE }),
      searchParams: Promise.resolve(sp),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  docsHc.documentsFor.mockResolvedValue([...ROWS]);
  docsHc.uploadArrivalsInFlight.mockResolvedValue([]);
});

describe('the list — rows at the member own level, one fetch, counts post-filter', () => {
  it('every row is title · category · subject, linking to the detail; the count is the rendered rows; no viewer anywhere', async () => {
    const html = await renderPage();
    expect(html).toContain('Discharge summary · Jul 12');
    expect(html).toContain(`href="/${CIRCLE}/documents/${D1}"`);
    expect(html).toContain(`href="/${CIRCLE}/documents/${D2}"`);
    expect(html).toContain('Insurance');
    expect(html).toContain('Medical');
    expect(html).toMatch(/2 documents/);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/api/artifact/');
  });

  it('the category tabs carry post-filter counts and the active one narrows the rendered rows without touching the counts', async () => {
    const html = await renderPage({ category: 'medical' });
    // one call — the counts and the rows come from the same RLS answer
    expect(docsHc.documentsFor).toHaveBeenCalledTimes(1);
    expect(html).toContain('Cardiology consult · Aug 2');
    expect(html).not.toContain(`href="/${CIRCLE}/documents/${D1}"`);
    expect(html).toMatch(/Medical \(1\)/);
    expect(html).toMatch(/Insurance \(1\)/);
    expect(html).toMatch(/1 document\b/);
  });

  it('a subject filter narrows server-side — the ONE fetch carries it, and the live test holds the narrowing', async () => {
    await renderPage({ subject: NELL });
    expect(docsHc.documentsFor).toHaveBeenCalledWith(CLAIMS, CIRCLE, { subject: NELL });
  });

  it('an unknown category param is ignored, never an error', async () => {
    const html = await renderPage({ category: 'secrets' });
    expect(html).toContain('Discharge summary · Jul 12');
    expect(html).toContain('Cardiology consult · Aug 2');
  });
});

describe('adding, arriving, empty', () => {
  it('"Add a document" leads to the existing upload page — an ingestion, never a bypass', async () => {
    const html = await renderPage();
    expect(html).toContain(`href="/${CIRCLE}/upload"`);
    expect(html).toMatch(/Add a document/);
  });

  it("an arrival in flight is a row wearing hc.product_state's label, leading to the Care Inbox", async () => {
    docsHc.uploadArrivalsInFlight.mockResolvedValue([
      { arrival_id: ARRIVAL, subject_id: NELL, subject_name: 'Nell', label: 'Arrived', received_at: '2026-08-31T09:00:00Z' },
    ]);
    const html = await renderPage();
    expect(html).toContain('Arrived');
    expect(html).toContain(`href="/${CIRCLE}/inbox"`);
  });

  it('"Nothing filed yet." whenever nothing is FILED — even while something has arrived', async () => {
    docsHc.documentsFor.mockResolvedValue([]);
    docsHc.uploadArrivalsInFlight.mockResolvedValue([
      { arrival_id: ARRIVAL, subject_id: NELL, subject_name: 'Nell', label: 'Arrived', received_at: '2026-08-31T09:00:00Z' },
    ]);
    const html = await renderPage();
    expect(html).toContain('Nothing filed yet.');
    expect(html).toContain('Arrived');
  });
});

describe('the nav', () => {
  it('documents joins NAV_MANIFEST under THE RECORD', async () => {
    const { NAV_MANIFEST } = await import('@/components/shell/nav-manifest');
    const entry = NAV_MANIFEST.find((e) => e.key === 'documents');
    expect(entry).toBeDefined();
    expect(entry!.group).toBe('record');
    expect(entry!.href('x')).toBe('/x/documents');
  });
});
