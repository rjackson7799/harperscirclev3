import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contrastRatio } from '@/lib/design/contrast';

// ============================================================================
// D1 · The §8.7 contrast assertion over the token pairs (A11Y-04). WCAG 2.2
// AA: every token pair that carries words at text size holds >= 4.5:1 (none
// of the system's text sizes qualifies as WCAG "large"). Ratios are computed
// from the live :root values, so a palette drift reds here with the measured
// number in the failure.
//
// RED STATE (this commit): the permitted-pair table is §8.7 as written —
// the base accents carrying their text roles. The measured palette fails
// six of them (≈3.0–4.2:1); this is the conflict the §11.4-2 pre-pass
// caught and Q2 rules on.
//
// Exemptions asserted nowhere, recorded here: `--faint`/`--label` are
// reserved for text that repeats information available elsewhere (§8.7's
// redundancy rule — A11Y-04 binds the exemption to that rule);
// `--positive-label` is the tinted-panel accent-as-label under the same
// rule; `--line` on white at rest (≈1.3:1 vs 1.4.11's 3:1) is the Q2(c2)
// disposition — a named G12 audit item in ADR-0016, darker-border fallback
// preserved.
// ============================================================================

const sheet = readFileSync(
  path.resolve(__dirname, '../../app/globals.css'),
  'utf8',
);

function token(name: string): string {
  const root = /:root\s*\{([^}]*)\}/.exec(sheet);
  if (!root) throw new Error('no :root block in app/globals.css');
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(root[1]);
  if (!m) throw new Error(`token ${name} missing from :root`);
  return m[1].trim();
}

// [text token, surface token, where §8 uses the pair]
const PERMITTED_PAIRS: Array<[string, string, string]> = [
  // The pairs the measured palette already clears
  ['--ink', '--card', 'headlines, primary values (§8.1)'],
  ['--ink-2', '--card', 'card body (§8.2)'],
  ['--ink-2', '--wash', 'secondary button (§8.4)'],
  ['--white', '--green', 'primary button (§8.4)'],
  ['--green', '--sand', 'links on the page plane (§8.8)'],
  ['--green', '--card', 'links inside cards (§8.8)'],
  ['--green', '--cream', 'wordmark, active nav (§8.3)'],
  ['--positive-body', '--positive-bg', 'positive panel body (§8.1)'],
  // Text roles as §8.7 names them against the measured accents
  ['--muted', '--card', 'meta 11.5–12px, secondary copy (§8.2)'],
  ['--muted', '--sand', 'page-pattern context line (§8.3)'],
  ['--muted', '--white', 'quiet button 12px (§8.4)'],
  ['--white', '--terracotta', 'count badge 700 10.5px (§8.4)'],
  ['--terracotta', '--sand', 'link hover (§8.8)'],
  ['--sage', '--card', 'tag-chip text against a card (§8.4)'],
  ['--sage', '--chip-sage-bg', 'tag chip on its own fill (§8.4)'],
  ['--amber', '--card', 'due dates (§8.6)'],
];

describe('D1 · §8.7 contrast over the permitted token pairs (A11Y-04)', () => {
  for (const [fg, bg, where] of PERMITTED_PAIRS) {
    it(`${fg} on ${bg} >= 4.5:1 — ${where}`, () => {
      const ratio = contrastRatio(token(fg), token(bg));
      expect(
        ratio,
        `${fg} ${token(fg)} on ${bg} ${token(bg)} measures ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
