import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D2 · §8.7's named defect stays unwritable (A11Y-01): the prototype set
// `outline: none` on inputs and never replaced it. The build's only outline
// story is the global 2px --green :focus-visible ring (app/globals.css), so
// bare `outline: none` / `outline: 0` must appear NOWHERE in first-party
// styles — neither in a stylesheet nor in a JSX style prop.
// ============================================================================

const repo = path.resolve(__dirname, '../..');

// First-party trees that carry styles or markup. tests/ is excluded on
// purpose: fixtures (like the one below) legitimately spell the forbidden
// string.
const TREES = ['app', 'components', 'lib', 'e2e'];
const EXTENSIONS = new Set(['.css', '.ts', '.tsx', '.jsx', '.mjs']);

// Bare `outline: none` / `outline: 0` in CSS or a JSX style value
// (`outline: 'none'`, outline: "0", …). `outline: 2px solid …` stays legal.
const BARE_OUTLINE = /outline\s*:\s*(['"`]?)\s*(none|0)\s*\1\s*[;,}'"`\n]/i;

function firstPartyFiles(): string[] {
  const files: string[] = [];
  for (const tree of TREES) {
    const root = path.join(repo, tree);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!EXTENSIONS.has(path.extname(entry.name))) continue;
      files.push(path.join(entry.parentPath, entry.name));
    }
  }
  return files;
}

describe('D2 · bare outline removal is unwritable (§8.7, A11Y-01)', () => {
  it('the scanner itself flags the forbidden forms (positive control)', () => {
    expect(BARE_OUTLINE.test('input { outline: none; }')).toBe(true);
    expect(BARE_OUTLINE.test('outline:0;')).toBe(true);
    expect(BARE_OUTLINE.test("style={{ outline: 'none' }}")).toBe(true);
    expect(BARE_OUTLINE.test('style={{ outline: "0" }}')).toBe(true);
    // …and leaves the focus ring alone
    expect(BARE_OUTLINE.test('outline: 2px solid var(--green);')).toBe(false);
    expect(BARE_OUTLINE.test('outline-offset: 1px;')).toBe(false);
  });

  it('no first-party file writes a bare outline removal', () => {
    const offenders: string[] = [];
    for (const file of firstPartyFiles()) {
      if (BARE_OUTLINE.test(readFileSync(file, 'utf8'))) {
        offenders.push(path.relative(repo, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scan actually covered the stylesheet that owns the focus ring', () => {
    const files = firstPartyFiles().map((f) => path.relative(repo, f));
    expect(files).toContain(path.join('app', 'globals.css'));
  });
});
