// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import axe, { type AxeResults } from 'axe-core';

// ============================================================================
// D7 · The CI axe leg (Q3 ruling, A11Y-06): every styleguide composition
// through axe in jsdom on every push. color-contrast is OFF here — jsdom
// has no layout, and D1's contrast arithmetic owns that assertion —
// everything else runs. The browser leg (e2e/a11y.spec.ts, contrast ON,
// real routes) is the R6 local gate's half of the Q3 split.
// ============================================================================

import { STYLEGUIDE_FIXTURES } from '@/app/styleguide/fixtures';

function fixtureHtml(markup: string): HTMLElement {
  // Compositions live inside the page's <main> in reality; scanning them
  // bare would trip landmark best-practice rules that aren't the point.
  const host = document.createElement('main');
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host;
}

async function scan(node: HTMLElement): Promise<AxeResults> {
  return axe.run(node, {
    rules: { 'color-contrast': { enabled: false } },
  });
}

function formatted(results: AxeResults): string {
  return results.violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes
          .map((n) => n.html)
          .join(' · ')}`,
    )
    .join('\n');
}

beforeAll(() => {
  document.body.innerHTML = '';
});

describe('D7 · axe over every styleguide composition (jsdom, contrast off)', () => {
  it('the harness bites: an unlabeled form control IS caught (positive control)', async () => {
    const host = fixtureHtml('<input type="text" name="orphan" />');
    const results = await scan(host);
    expect(results.violations.map((v) => v.id)).toContain('label');
    host.remove();
  });

  for (const fixture of STYLEGUIDE_FIXTURES) {
    it(`"${fixture.name}" has zero axe violations`, async () => {
      const host = fixtureHtml(renderToStaticMarkup(fixture.render()));
      const results = await scan(host);
      expect(results.violations, formatted(results)).toEqual([]);
      host.remove();
    });
  }
});
