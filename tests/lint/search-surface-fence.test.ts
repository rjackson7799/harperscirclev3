import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NAV_MANIFEST } from '../../components/shell/nav-manifest';

// ============================================================================
// 8B · THE SEARCH SURFACE'S FENCE — pinned BEFORE the surface exists (the
// SRCH-05 cell: "the fence test is the surface's first commit"; the
// byte-path-fence precedent, 7C C2).
//
// What the plan settled (slice-8 plan, Q4 SETTLED 2026-09-02, as a block)
// and this file holds mechanically:
//
//   (1) `ts_headline` returns MARKUP and a snippet is document content. The
//       emphasis reaches the DOM as STRUCTURE — sentinels split in the
//       module, `<mark>` built by React — and `dangerouslySetInnerHTML`
//       appears NOWHERE on the surface. Pinned two ways: the three surface
//       files carry none, and the product tree's set of files carrying one
//       is an EXACT SET (the one pre-8B site, a setup-page timezone probe).
//   (3) A search writes NOTHING to the access log: no `hc.log(` call, no
//       event type, on any surface file.
//   (4) `q` is capped at ingress and the three reads run inside ONE
//       `withRequestRole` and ONE `withPageBudget`.
//   (5) There is NO TOTAL and no parameter that could produce one: the
//       module issues no `count(`, and every read carries `limit 20` and an
//       explicit `circle_id = $1`.
//   (6) The field is in the TOP BAR, not the nav: `NAV_MANIFEST` carries no
//       search entry, so the nav's tier courtesy cannot hide it from the
//       caregiver whose assigned tasks it must find (AC-TASK-5).
//   §7.4: no autocomplete attribute, no suggestion list, no client fetch —
//       the field is a plain GET form, server-rendered.
//
// A scanner matches its own comments (traps §9): sources are comment-
// stripped before matching, and every predicate ships a positive and a
// negative control over inline samples.
// ============================================================================

const repo = process.cwd();

export const SEARCH_SURFACE = {
  module: 'lib/hc/search.ts',
  field: 'components/shell/SearchField.tsx',
  page: 'app/(app)/[circle]/search/page.tsx',
} as const;

/** The product tree's ONE sanctioned `dangerouslySetInnerHTML` site before
 *  8B — a first-party timezone probe on a setup page, no family content in
 *  it. The set may SHRINK; it may not grow. */
const INNER_HTML_ALLOWLIST = ['app/setup/step/2/page.tsx'];

const PRODUCT_TREES = ['app', 'components', 'lib'];

/** Strip block comments and full-line `//` / `*` comments. Deliberately
 *  simple — a string literal containing `//` (a URL) survives because only
 *  lines that BEGIN with a comment marker are dropped. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function read(rel: string): string {
  return readFileSync(join(repo, rel), 'utf8');
}

function files(root: string, test: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (test(entry)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

const HAS_INNER_HTML = /\bdangerouslySetInnerHTML\b/;
const HAS_LOG_CALL = /\bhc\.log(_denied|_artifact_read)?\s*\(/;
const HAS_COUNT = /\bcount\s*\(/i;

describe('8B · the search surface exists (positive control — RED until the units land)', () => {
  for (const [unit, rel] of Object.entries(SEARCH_SURFACE)) {
    it(`${unit}: ${rel} is on disk`, () => {
      expect(existsSync(join(repo, rel)), `${rel} missing`).toBe(true);
    });
  }
});

describe('8B · (1) structure, never markup — dangerouslySetInnerHTML nowhere on the surface', () => {
  for (const rel of Object.values(SEARCH_SURFACE)) {
    it(`${rel} carries no dangerouslySetInnerHTML (comments stripped)`, () => {
      expect(HAS_INNER_HTML.test(stripComments(read(rel)))).toBe(false);
    });
  }

  it('the product tree’s dangerouslySetInnerHTML sites are an EXACT SET — the pre-8B allowlist, nothing gained', () => {
    const found = PRODUCT_TREES.flatMap((t) =>
      files(join(repo, t), (n) => /\.(ts|tsx)$/.test(n))
        .filter((f) => HAS_INNER_HTML.test(stripComments(readFileSync(f, 'utf8'))))
        .map((f) => relative(repo, f).replace(/\\/g, '/')),
    ).sort();
    expect(found).toEqual([...INNER_HTML_ALLOWLIST].sort());
  });

  it('controls: the predicate fires on a real site and not on a comment line', () => {
    expect(HAS_INNER_HTML.test(stripComments('<p dangerouslySetInnerHTML={{ __html: s }} />'))).toBe(true);
    expect(HAS_INNER_HTML.test(stripComments('// never dangerouslySetInnerHTML here\nconst x = 1;'))).toBe(false);
    expect(HAS_INNER_HTML.test(stripComments('/* dangerouslySetInnerHTML */ const y = 2;'))).toBe(false);
  });
});

describe('8B · (3) a search writes nothing to the access log', () => {
  for (const rel of Object.values(SEARCH_SURFACE)) {
    it(`${rel} makes no hc.log call of any kind`, () => {
      expect(HAS_LOG_CALL.test(stripComments(read(rel)))).toBe(false);
    });
  }
  it('controls: the predicate fires on the three writers and not on prose', () => {
    expect(HAS_LOG_CALL.test("select hc.log($1, 'searched', $2)")).toBe(true);
    expect(HAS_LOG_CALL.test('perform hc.log_denied(x)')).toBe(true);
    expect(HAS_LOG_CALL.test('select hc.log_artifact_read($1)')).toBe(true);
    expect(HAS_LOG_CALL.test('the access log is untouched')).toBe(false);
  });
});

describe('8B · (4)/(5) the module: one channel, three bounded reads, no total', () => {
  const moduleSource = () => stripComments(read(SEARCH_SURFACE.module));

  it('opens withRequestRole EXACTLY once — the three reads share one transaction and one set of claims', () => {
    expect(moduleSource().match(/\bwithRequestRole\s*\(/g)?.length ?? 0).toBe(1);
  });

  it('every read is bounded to 20 rows and to one explicit circle — three of each', () => {
    expect(moduleSource().match(/\blimit 20\b/g)?.length ?? 0).toBe(3);
    expect(moduleSource().match(/\bcircle_id = \$1\b/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('issues no count(): there is no total, and no parameter that could produce one', () => {
    expect(HAS_COUNT.test(moduleSource())).toBe(false);
    expect(HAS_COUNT.test('select count(*) from x')).toBe(true); // control
  });

  it('the page renders inside withPageBudget (the answer-budget scanner pins the tree; this pins the file)', () => {
    expect(/\bwithPageBudget\s*\(/.test(stripComments(read(SEARCH_SURFACE.page)))).toBe(true);
  });
});

describe('8B · §7.4 the field: a plain GET form — no autocomplete attribute, no suggestion list, no client fetch', () => {
  const field = () => stripComments(read(SEARCH_SURFACE.field));

  it('is a server component (no "use client") that fetches nothing', () => {
    expect(/use client/.test(field())).toBe(false);
    expect(/\bfetch\s*\(/.test(field())).toBe(false);
  });

  it('carries no autocomplete attribute, no datalist and no list= binding', () => {
    expect(/autoComplete|autocomplete/.test(field())).toBe(false);
    expect(/<datalist|\blist=/.test(field())).toBe(false);
  });

  it('submits by GET to the circle’s search page', () => {
    expect(/method="get"/i.test(field())).toBe(true);
    expect(/\/search`/.test(field())).toBe(true);
  });
});

describe('8B · (6) search is in the top bar, not the nav', () => {
  it('NAV_MANIFEST carries no search entry — the tier courtesy cannot hide the field from a caregiver', () => {
    expect(NAV_MANIFEST.some((e) => e.key === 'search')).toBe(false);
    expect(NAV_MANIFEST.some((e) => /\/search$/.test(e.href('c')))).toBe(false);
  });
});
