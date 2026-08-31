import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D3 · The §8.3 shell (DS-03): TopBar in design_spec §4's content order,
// LeftNav driven by the nav manifest (live routes only — never promise
// what isn't built), Shell with container-query responsiveness (the §8.3
// substitution: no JS measurement, no viewport breakpoints), PageHeader
// as the page pattern's top, and the two §8.3 grids. The (app) layout
// mounts the shell around every circle-scoped screen.
// ============================================================================

const pathnameMock = vi.fn<() => string>(() => '/c-1/timeline');
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

const getClaims = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims, getUser } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  pathnameMock.mockReturnValue('/c-1/timeline');
  getClaims.mockResolvedValue({
    data: { claims: { sub: 'u-1', email: 'sarah@example.com' } },
    error: null,
  });
});

const repo = path.resolve(__dirname, '../..');
const sheet = () => readFileSync(path.join(repo, 'app/globals.css'), 'utf8');

describe('D3 · TopBar — design_spec §4 order, honest slots', () => {
  it('renders the wordmark, then the spacer; nothing promises the unbuilt', async () => {
    const { TopBar } = await import('@/components/shell/TopBar');
    const html = renderToStaticMarkup(<TopBar />);
    expect(html).toContain('Harper');
    expect(html).toContain('wordmark');
    // ask-the-record ships slice 8; feedback has no surface yet — with no
    // slot content passed, neither renders anything.
    expect(html).not.toMatch(/search|feedback/i);
    expect(html.indexOf('wordmark')).toBeLessThan(html.indexOf('topbar-spacer'));
  });

  it('a passed search slot renders between wordmark and spacer (§4 order)', async () => {
    const { TopBar } = await import('@/components/shell/TopBar');
    const html = renderToStaticMarkup(
      <TopBar search={<input type="search" aria-label="Ask the record" />} />,
    );
    const wordmark = html.indexOf('wordmark');
    const search = html.indexOf('type="search"');
    const spacer = html.indexOf('topbar-spacer');
    expect(wordmark).toBeGreaterThanOrEqual(0);
    expect(search).toBeGreaterThan(wordmark);
    expect(spacer).toBeGreaterThan(search);
  });

  it('the current user renders name with role beneath, after the spacer', async () => {
    const { TopBar } = await import('@/components/shell/TopBar');
    const html = renderToStaticMarkup(
      <TopBar user={{ name: 'sarah@example.com', role: 'Coordinator' }} />,
    );
    expect(html.indexOf('topbar-spacer')).toBeLessThan(html.indexOf('sarah@example.com'));
    expect(html.indexOf('sarah@example.com')).toBeLessThan(html.indexOf('Coordinator'));
    expect(html).toContain('micro-meta');
  });
});

describe('D3 · LeftNav — manifest-driven, live routes only', () => {
  it('renders exactly the live routes: Tasks, Invite, Timeline + Documents (THE RECORD), People (CONNECTION — its first live entry, 7C C3), Account (utility)', async () => {
    const { LeftNav } = await import('@/components/shell/LeftNav');
    const html = renderToStaticMarkup(<LeftNav circle="c-1" />);
    expect(html).toContain('href="/c-1/tasks"');
    expect(html).toContain('href="/c-1/invite"');
    expect(html).toContain('href="/c-1/timeline"');
    expect(html).toContain('href="/c-1/documents"');
    expect(html).toContain('href="/c-1/people"');
    expect(html).toContain('href="/account"');
    // Both group labels present (ALL-CAPS via .section-label CSS) — the
    // Connection group appeared the moment its first live route landed,
    // exactly as the manifest's "never promise what isn't built" rule says.
    expect(html).toContain('The record');
    expect(html).toContain('Connection');
    // Order: ungrouped primary → THE RECORD → CONNECTION; utility pinned last.
    expect(html.indexOf('/c-1/tasks')).toBeLessThan(html.indexOf('The record'));
    expect(html.indexOf('The record')).toBeLessThan(html.indexOf('/c-1/timeline'));
    expect(html.indexOf('/c-1/timeline')).toBeLessThan(html.indexOf('Connection'));
    expect(html.indexOf('Connection')).toBeLessThan(html.indexOf('/c-1/people'));
    expect(html.indexOf('/c-1/people')).toBeLessThan(html.indexOf('/account'));
    expect(html).toContain('nav-utility');
  });

  it('marks the current route with aria-current="page"', async () => {
    const { LeftNav } = await import('@/components/shell/LeftNav');
    pathnameMock.mockReturnValue('/c-1/tasks');
    const html = renderToStaticMarkup(<LeftNav circle="c-1" />);
    const tasks = /<a[^>]*href="\/c-1\/tasks"[^>]*>/.exec(html)?.[0] ?? '';
    const timeline = /<a[^>]*href="\/c-1\/timeline"[^>]*>/.exec(html)?.[0] ?? '';
    expect(tasks).toContain('aria-current="page"');
    expect(timeline).not.toContain('aria-current');
  });

  it('a serif-flagged entry renders in the serif nav role; counts sit in the right-aligned slot', async () => {
    const { LeftNav } = await import('@/components/shell/LeftNav');
    const html = renderToStaticMarkup(
      <LeftNav
        circle="c-1"
        entries={[
          {
            key: 'memories',
            label: 'Memories',
            group: 'connection',
            serif: true,
            count: 3,
            href: (c: string) => `/${c}/memories`,
          },
        ]}
      />,
    );
    expect(html).toContain('nav-item-serif');
    expect(html).toContain('Connection');
    const count = /<span[^>]*nav-count[^>]*>3<\/span>/.exec(html);
    expect(count, 'right-aligned count slot').not.toBeNull();
  });

  it('the nav landmark is labelled', async () => {
    const { LeftNav } = await import('@/components/shell/LeftNav');
    const html = renderToStaticMarkup(<LeftNav circle="c-1" />);
    expect(html).toMatch(/<nav[^>]*aria-label=/);
  });
});

describe('D3 · Shell + PageHeader', () => {
  it('Shell composes topbar → nav → one main, in that order', async () => {
    const { Shell } = await import('@/components/shell/Shell');
    const html = renderToStaticMarkup(
      <Shell topBar={<header className="topbar" />} nav={<nav className="left-nav" />}>
        <p>content</p>
      </Shell>,
    );
    expect(html.indexOf('topbar')).toBeLessThan(html.indexOf('left-nav'));
    expect(html.indexOf('left-nav')).toBeLessThan(html.indexOf('<main'));
    expect(html).toContain('shell-main');
    expect(html.match(/<main/g)?.length).toBe(1);
    expect(html).toContain('content');
  });

  it('PageHeader renders the 34px serif title and one muted context line', async () => {
    const { PageHeader } = await import('@/components/shell/PageHeader');
    const html = renderToStaticMarkup(
      <PageHeader title="Timeline" context="Everything the circle has recorded." />,
    );
    expect(html).toMatch(/<h1[^>]*>Timeline<\/h1>/);
    expect(html).toContain('page-context');
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('page-context'));
  });

  it('PageHeader without context renders no empty paragraph', async () => {
    const { PageHeader } = await import('@/components/shell/PageHeader');
    const html = renderToStaticMarkup(<PageHeader title="Tasks" />);
    expect(html).not.toContain('page-context');
  });
});

describe('D3 · the (app)/[circle] layout mounts the shell', () => {
  it('wraps children in Shell with TopBar and LeftNav, user chip from live claims', async () => {
    const { default: Layout } = await import('@/app/(app)/[circle]/layout');
    const html = renderToStaticMarkup(
      await Layout({
        children: <p>page-body</p>,
        params: Promise.resolve({ circle: 'c-1' }),
      }),
    );
    expect(html).toContain('topbar');
    expect(html).toContain('left-nav');
    expect(html).toContain('href="/c-1/timeline"');
    expect(html).toContain('page-body');
    expect(html).toContain('sarah@example.com');
  });

  it('with no live session the shell still renders (pages own the redirect)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    const { default: Layout } = await import('@/app/(app)/[circle]/layout');
    const html = renderToStaticMarkup(
      await Layout({
        children: <p>page-body</p>,
        params: Promise.resolve({ circle: 'c-1' }),
      }),
    );
    expect(html).toContain('page-body');
    expect(html).not.toContain('sarah@example.com');
  });
});

describe('D3 · the §8.3 CSS: container queries, grids, shell metrics', () => {
  it('.shell is an inline-size container capped at no width (main caps at 1240)', () => {
    const css = sheet();
    expect(css).toMatch(/\.shell[^{]*\{[^}]*container-type: inline-size/);
    expect(css).toMatch(/\.shell-main[^{]*\{[^}]*max-width: 1240px/);
  });

  it('responsiveness is container queries on the §8.3 900px boundary — no viewport media queries for layout', () => {
    const css = sheet();
    expect(css).toContain('@container (max-width: 899px)');
    expect(css).toContain('@container (min-width: 900px)');
    // The only @media in first-party CSS stays prefers-reduced-motion.
    const medias = css.match(/@media[^{]+/g) ?? [];
    expect(medias.every((m) => m.includes('prefers-reduced-motion'))).toBe(true);
  });

  it('the browsing grid is repeat(auto-fill, minmax(324px, 1fr)) at 14px gap', () => {
    const css = sheet();
    const grid = /\.grid-browsing\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(grid).toContain('repeat(auto-fill, minmax(324px, 1fr))');
    expect(grid).toContain('gap: 14px');
  });

  it('the working grid is main + rail at 20px gap, single column under the boundary', () => {
    const css = sheet();
    const grid = /\.grid-working\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(grid).toContain('gap: 20px');
    const narrow = /@container \(max-width: 899px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(narrow).toMatch(/\.grid-working[^{]*\{[^}]*grid-template-columns: 1fr/);
  });

  it('top bar and left nav carry the §8.3 metrics', () => {
    const css = sheet();
    const topbar = /\.topbar\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(topbar).toContain('position: sticky');
    expect(topbar).toContain('padding: 11px 20px');
    expect(topbar).toContain('background: var(--cream)');
    expect(topbar).toContain('border-bottom: 1px solid var(--line)');
    const nav = /\.left-nav\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(nav).toContain('padding: 16px 12px');
    expect(nav).toContain('gap: 2px');
    expect(nav).toContain('background: var(--cream)');
    expect(nav).toContain('border-right: 1px solid var(--line)');
  });

  it('nav rows clear the 44px touch floor and use the control radius', () => {
    const css = sheet();
    const link = /\.nav-link\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(link).toContain('min-height: 44px');
    expect(link).toContain('border-radius: var(--r-control)');
  });
});
