import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D1 · The token pin (TSD §8.1, DS-01). `:root` in app/globals.css must carry
// EXACTLY the §8.1 token set — names AND values — plus the five Q2-ruled
// text-role variants (ADR-0016). A palette or radius drift reds CI here;
// values are compared lowercased (the sheet writes lowercase hex, the spec
// uppercase — same value).
// ============================================================================

const sheet = readFileSync(
  path.resolve(__dirname, '../../app/globals.css'),
  'utf8',
);

function rootTokens(css: string): Record<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('no :root block in app/globals.css');
  const tokens: Record<string, string> = {};
  for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim().toLowerCase();
  }
  return tokens;
}

// The §8.1 map, verbatim (design_spec §2 is the source of the names, per
// its §9), plus the Q2 text-role variants with the exact hexes the red run
// of tests/design/contrast.test.ts pinned at >= 4.5:1 on every permitted
// surface (ADR-0016; two candidates darkened one step — see the ADR).
const SPEC: Record<string, string> = {
  // Foundation
  '--sand': '#ede6d8',
  '--cream': '#fbf8f1',
  '--card': '#fdfbf6',
  '--white': '#ffffff',
  '--line': '#e7dfd0',
  '--line-strong': '#e1d8c7',
  '--wash': '#f0e8d9',
  '--scroll-thumb': '#d8cdb9',
  // Ink
  '--ink': '#24211b',
  '--ink-2': '#4a463d',
  '--muted': '#857e70',
  '--faint': '#9a9382',
  '--label': '#b0a891',
  // Signal — one meaning each, never decorative
  '--green': '#2f5b4e',
  '--terracotta': '#c1613c',
  '--amber': '#b98a2e',
  '--sage': '#6e8f73',
  '--plum': '#7a6e9b',
  '--google-blue': '#4285f4',
  // Tinted panel — positive/saved (§8.1 exact names, Q6)
  '--positive-bg': '#f6fbf7',
  '--positive-border': '#d6e7da',
  '--positive-label': '#6e8f73',
  '--positive-body': '#33463f',
  '--chip-sage-bg': '#e4ede7',
  // Radii
  '--r-card': '13px',
  '--r-row': '12px',
  '--r-control': '9px',
  '--r-pill': '20px',
  // Q2 text-role variants (ADR-0016) — text/badge duty only; the measured
  // accents above keep strokes, small fills, dots and tints.
  '--muted-text': '#6c665a',
  '--sage-text': '#526f5c',
  '--amber-text': '#8a671f',
  '--terracotta-text': '#a04e2d',
  '--terracotta-badge': '#ad5330',
};

describe('D1 · §8.1 token pin (DS-01)', () => {
  const tokens = rootTokens(sheet);

  it('every §8.1 token is present with its exact value', () => {
    for (const [name, value] of Object.entries(SPEC)) {
      expect(tokens[name], `token ${name}`).toBe(value);
    }
  });

  it(':root carries exactly the §8.1 set — no extras, no drifted names', () => {
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(SPEC).sort());
  });
});
