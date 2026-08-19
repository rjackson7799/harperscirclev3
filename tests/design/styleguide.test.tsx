import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// Q4 · The dev-gated /styleguide route: every component in composition —
// D7's axe fixture, the human review surface for the four §8.1 colour
// rules, and the reference future slices build against. notFound() in
// production, pinned here.
// ============================================================================

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Q4 · /styleguide is dev-only', () => {
  it('production gets notFound()', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: Page } = await import('@/app/styleguide/page');
    expect(() => Page()).toThrowError('NEXT_NOT_FOUND');
  });

  it('development renders every fixture composition', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { default: Page } = await import('@/app/styleguide/page');
    const { STYLEGUIDE_FIXTURES } = await import('@/app/styleguide/fixtures');
    const html = renderToStaticMarkup(Page());
    for (const fixture of STYLEGUIDE_FIXTURES) {
      expect(html, `fixture "${fixture.name}" rendered`).toContain(fixture.name);
    }
  });
});

describe('Q4 · the fixtures cover the component inventory', () => {
  it('every D4 component composition is present', async () => {
    const { STYLEGUIDE_FIXTURES } = await import('@/app/styleguide/fixtures');
    const names = STYLEGUIDE_FIXTURES.map((f) => f.name);
    for (const required of [
      'Card',
      'Card with eyebrow',
      'Count badge',
      'Category badge',
      'Tag chip',
      'Removable chip',
      'Buttons',
      'Field and input',
      'Composed control',
      'Avatars',
      'Legend',
      'Icon conventions',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('every fixture renders non-empty static markup', async () => {
    const { STYLEGUIDE_FIXTURES } = await import('@/app/styleguide/fixtures');
    for (const fixture of STYLEGUIDE_FIXTURES) {
      const html = renderToStaticMarkup(fixture.render());
      expect(html.length, `fixture "${fixture.name}"`).toBeGreaterThan(0);
    }
  });
});
