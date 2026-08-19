import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D3 · The §8.2 type roles as classes (DS-02). Every role not already
// carried by an element default (h1 34 · h2 22 · body 13.5 · buttons) gets
// a class named from the §8.2 role column, pinned here declaration-by-
// declaration. Where the spec reproduces a range (meta 11.5–12 · micro
// 10.5–11), the class pins one value inside it and the comment names the
// range. Plus the §8.2 floor: NOTHING below 10px, scanned across every
// first-party font-size declaration.
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const sheet = readFileSync(path.join(repo, 'app/globals.css'), 'utf8');

/** Declarations of the FIRST block whose selector list contains `selector`. */
function block(selector: string): string {
  const re = new RegExp(
    `(^|\\n)[^{}]*${selector.replace('.', '\\.')}[^{}]*\\{([^}]*)\\}`,
  );
  const m = re.exec(sheet);
  if (!m) throw new Error(`no CSS block for ${selector}`);
  return m[2];
}

const ROLES: Array<[string, string[]]> = [
  // [selector, required declarations]
  ['.wordmark', ['font-weight: 600', 'font-size: 17px', 'letter-spacing: 0.2px']],
  ['.section-headline', ['font-weight: 500', 'font-size: 18px']],
  ['.nav-item', ['font-weight: 500', 'font-size: 13.5px']],
  ['.nav-item-serif', ['font-size: 14.5px']],
  ['.row-title', ['font-weight: 600', 'font-size: 14px', 'line-height: 1.25']],
  ['.meta', ['font-size: 12px', 'color: var(--muted-text)']],
  ['.micro-meta', ['font-size: 11px', 'color: var(--faint)']],
  [
    '.section-label',
    [
      'font-weight: 700',
      'font-size: 10.5px',
      'letter-spacing: 0.85px',
      'text-transform: uppercase',
      'color: var(--label)',
    ],
  ],
  [
    '.eyebrow',
    ['font-weight: 700', 'font-size: 10px', 'letter-spacing: 0.7px', 'text-transform: uppercase'],
  ],
  ['.badge', ['font-weight: 700', 'font-size: 10.5px']],
];

describe('D3 · §8.2 type-role classes (DS-02)', () => {
  for (const [selector, decls] of ROLES) {
    it(`${selector} carries its §8.2 spec`, () => {
      const css = block(selector);
      for (const d of decls) expect(css, `${selector} { ${d} }`).toContain(d);
    });
  }

  it('serif roles are set in Newsreader via the font variable', () => {
    for (const sel of ['.wordmark', '.section-headline', '.nav-item-serif']) {
      expect(block(sel)).toContain('var(--font-serif)');
    }
  });
});

describe('D3 · the §8.2 floor: never below 10px', () => {
  it('every first-party font-size declaration is >= 10px', () => {
    const offenders: string[] = [];
    for (const tree of ['app', 'components']) {
      const root = path.join(repo, tree);
      if (!existsSync(root)) continue;
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(css|tsx|jsx)$/.test(entry.name)) continue;
        const file = path.join(entry.parentPath, entry.name);
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/font-size:\s*([\d.]+)px/gi)) {
          if (parseFloat(m[1]) < 10) {
            offenders.push(`${path.relative(repo, file)}: ${m[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the floor scanner flags a sub-10px fixture (positive control)', () => {
    expect(/font-size:\s*([\d.]+)px/i.exec('font-size: 9.5px')?.[1]).toBe('9.5');
  });
});
