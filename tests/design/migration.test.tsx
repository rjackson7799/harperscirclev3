import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D8 · The migration (DS-07): every 2B screen + the (app) stubs onto the
// system — CSS-and-composition ONLY, copy and route contracts
// byte-untouched. Three structural pins:
//   1. The (app)/[circle] stubs no longer bring their own shell — the D3
//      layout owns the chrome and the ONE <main>; a page rendering
//      .auth-shell or <main> under it is a regression.
//   2. Raw <button className="button-*"> is unwritable in app/ — the
//      Button component is the single writer of button classes on
//      <button> (links styled as buttons stay <a>, deliberately).
//   3. The stubs' empty sentences render through <EmptyState>.
// Plus functional renders of the migrated stubs with the 2B copy intact.
// ============================================================================

const repo = path.resolve(__dirname, '../..');

function pageSources(root: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const entry of readdirSync(path.join(repo, root), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue;
    const file = path.join(entry.parentPath, entry.name);
    out.push([path.relative(repo, file), readFileSync(file, 'utf8')]);
  }
  return out;
}

describe('D8 · the (app)/[circle] stubs live under the shell', () => {
  it('no page under app/(app)/[circle] renders its own shell or <main>', () => {
    const offenders: string[] = [];
    for (const [file, source] of pageSources('app/(app)/[circle]')) {
      if (file.endsWith('layout.tsx')) continue;
      if (source.includes('auth-shell') || source.includes('auth-wordmark')) {
        offenders.push(`${file}: brings its own shell`);
      }
      if (source.includes('<main')) {
        offenders.push(`${file}: renders <main> under the layout's <main>`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('D8 · Button is the single writer of button classes in app/', () => {
  it('no raw <button className="button-…"> remains in any screen', () => {
    const offenders: string[] = [];
    for (const [file, source] of pageSources('app')) {
      if (/<button[\s\S]{0,200}?className="button-/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Functional renders of the migrated stubs (the invite screen keeps its
// own contract test in tests/routes/invite-screen.test.ts).
// ---------------------------------------------------------------------------

const getClaims = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims, getUser }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({
    data: { claims: { sub: 'u-1', email: 'sarah@example.com' } },
    error: null,
  });
});

// 7B B1 (OW-20): the floors now read the columns that EXIST and read
// `error`, so the chain resolves the supabase-js shape whatever the page
// calls on it, per table. (The pins below used to hand the timeline
// `title, happened_on` rows — the columns the page asked for and the table
// never had — which is exactly the defect OW-20 names.)
function tableReturning(rows: unknown[]) {
  const p = Promise.resolve({ data: rows, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'single']) proxy[m] = () => proxy;
  proxy.then = p.then.bind(p);
  proxy.catch = p.catch.bind(p);
  return proxy;
}
const SUBJECTS = [{ id: 's-1', first_name: 'Nell', created_at: '2026-07-01T00:00:00Z' }];

describe('D8 · the migrated stubs render the system with the 2B copy intact', () => {
  it('timeline, empty: PageHeader + EmptyState, the sentence unchanged', async () => {
    from.mockImplementation((t: string) => tableReturning(t === 'subjects' ? SUBJECTS : []));
    const { default: Page } = await import('@/app/(app)/[circle]/timeline/page');
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ circle: 'c-1' }) }),
    );
    expect(html).toMatch(/<h1[^>]*>Timeline<\/h1>/);
    expect(html).toContain('empty-state');
    expect(html).toContain('Nothing on the timeline yet.');
    expect(html).not.toContain('auth-shell');
  });

  it('timeline, with events: rows are cards with summary · a human date (§8.6)', async () => {
    from.mockImplementation((t: string) =>
      tableReturning(
        t === 'subjects'
          ? SUBJECTS
          : [
              {
                id: 'e-1',
                subject_id: 's-1',
                kind: 'care',
                summary: 'Nell moved to Denver General',
                occurred_on: '2026-07-12',
                local_at: null,
                iana_zone: null,
                instant: null,
                is_floating: false,
                approved_at: '2026-07-13T09:00:00Z',
                approver_display_name: 'Sarah',
              },
            ],
      ),
    );
    const { default: Page } = await import('@/app/(app)/[circle]/timeline/page');
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ circle: 'c-1' }) }),
    );
    expect(html).toContain('card');
    expect(html).toContain('Nell moved to Denver General');
    expect(html).toContain('July 12');
  });

  it('tasks, empty: PageHeader + EmptyState, the sentence unchanged', async () => {
    from.mockImplementation((t: string) => tableReturning(t === 'subjects' ? SUBJECTS : []));
    const { default: Page } = await import('@/app/(app)/[circle]/tasks/page');
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ circle: 'c-1' }) }),
    );
    expect(html).toMatch(/<h1[^>]*>Your tasks<\/h1>/);
    expect(html).toContain('empty-state');
    expect(html).toContain('Nothing assigned to you right now.');
  });
});
