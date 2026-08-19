import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D7 · The §8.7 44px touch floor, in the sheet (A11Y-03's CI half): every
// interactive CONTROL class carries min-height: 44px, so the browser
// audit (e2e/a11y.spec.ts — the truth-teller, measuring real boxes at
// 390px) audits a system that was built to pass, not patched after.
// design_spec §8 claims the prototype's buttons clear 44 — the seed's
// secondary/quiet pills and inputs measured ~29–40px, so the build makes
// the claim true here (recorded in design-conformance.md). Inline text
// links are exempt (WCAG 2.5.8's inline exception).
// ============================================================================

const sheet = readFileSync(
  path.resolve(__dirname, '../../app/globals.css'),
  'utf8',
);

function block(selector: string): string {
  const re = new RegExp(
    `(^|\\n)[^{}]*${selector.replace(/[.[\]']/g, (c) => `\\${c}`)}[^{}]*\\{([^}]*)\\}`,
  );
  const m = re.exec(sheet);
  if (!m) throw new Error(`no CSS block for ${selector}`);
  return m[2];
}

describe('D7 · every control class carries the 44px floor', () => {
  for (const selector of [
    '.button-primary',
    '.button-secondary',
    '.button-quiet',
    '.nav-link',
    '.chip-dismiss',
  ]) {
    it(`${selector} min-height 44px`, () => {
      expect(block(selector)).toContain('min-height: 44px');
    });
  }

  it('text inputs and selects carry the floor on the shared element rule', () => {
    const m = /input\[type='text'\][^{]*\{([^}]*)\}/.exec(sheet);
    expect(m, 'the shared input rule').not.toBeNull();
    expect(m![1]).toContain('min-height: 44px');
  });

  it('choice rows keep the floor the seed already had', () => {
    expect(block('.choice-list label')).toContain('min-height: 44px');
  });
});
