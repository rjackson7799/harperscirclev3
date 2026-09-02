import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_MANIFEST } from '../../e2e/audit-manifest';

// ============================================================================
// 6B B9 · R5/F-6: every app route joins a PINNED audit list.
//
// `/[circle]/senders` shipped a render throw precisely because it had no
// browser coverage at all — and a list that is not pinned is a list that
// stops growing. This pin derives the route set from the FILESYSTEM (every
// `app/**/page.tsx`, route groups stripped) and asserts exact-set equality
// with e2e/audit-manifest.ts, so a new route FAILS THIS TEST until someone
// says, in the manifest, which browser leg audits it — or names it
// redirect-only, which is itself a reviewable claim.
//
// The manifest's VALUES are honest too: a route may claim an existing leg,
// or carry an OWED marker naming the unit that lands its audit — a claim of
// coverage that does not exist yet must say so where a reviewer will read it.
// ============================================================================

function pageRoutes(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name === 'page.tsx') {
        const rel = relative(root, dir).split(sep).filter(Boolean);
        const segments = rel.filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));
        out.push('/' + segments.join('/'));
      }
    }
  };
  walk(root);
  return out.sort();
}

// ── 7E · R6/F-6 (ADR-0038, ACCEPTED · TAKEN(7E)) ────────────────────────────
//
// The manifest's VALUES were prose nobody checked. Two of the five citations
// R6 read were substantively wrong: the documents-list entry still described
// the PRE-BUILD leg and promised "Nothing filed yet.", which D12.2 moved to
// vitest, and the A11Y-11 citation named a claim no leg makes.
//
// `npx playwright test -g "<manifest title>"` returns ZERO legs for such a
// citation — which reads identically to "the leg was deleted", defeating the
// exact method (title against assertion) that found round 18's class and
// this round's five. ADR-0026: if it can be an exact-set assertion, it must
// be. Every quoted fragment must appear VERBATIM in some e2e/*.spec.ts.
const SPEC_DIR = join(process.cwd(), 'e2e');
const SPEC_SOURCES = readdirSync(SPEC_DIR)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => readFileSync(join(SPEC_DIR, f), 'utf8'))
  .join('\n');

describe('6B B9 · the audit list is PINNED to the filesystem (R5/F-6)', () => {
  const routes = pageRoutes(join(process.cwd(), 'app'));
  const listed = Object.keys(AUDIT_MANIFEST).sort();

  it('every app route appears in the audit manifest — a new route cannot ship unaudited silently', () => {
    const missing = routes.filter((r) => !(r in AUDIT_MANIFEST));
    expect(
      missing,
      `routes with page.tsx but no audit-manifest entry (add them to e2e/audit-manifest.ts with the leg that audits them): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the manifest names no route that does not exist — deleted surfaces leave the list', () => {
    const stale = listed.filter((r) => !routes.includes(r));
    expect(
      stale,
      `audit-manifest entries with no page.tsx behind them: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  it('every leg title the manifest QUOTES exists verbatim in a spec (R6/F-6)', () => {
    const quoted: { route: string; title: string }[] = [];
    for (const [route, claim] of Object.entries(AUDIT_MANIFEST)) {
      // Only claims that cite a spec; redirect-only and OWED claims are
      // prose a reviewer weighs, and name no leg to look for.
      if (!/\.spec\s+—/.test(claim.leg)) continue;
      for (const m of claim.leg.matchAll(/"([^"]+)"/g)) {
        quoted.push({ route, title: m[1] });
      }
    }
    // A positive control: if the extraction ever stops finding titles this
    // assertion would pass over an empty list, which is the failure mode it
    // exists to prevent.
    expect(quoted.length).toBeGreaterThan(5);
    const missing = quoted
      .filter((q) => !SPEC_SOURCES.includes(q.title))
      .map((q) => `${q.route} cites a leg no spec declares: "${q.title}"`);
    expect(
      missing,
      `audit-manifest citations matching no e2e leg title:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every entry says HOW the route is audited — a leg, or an honest owed/redirect claim', () => {
    for (const [route, claim] of Object.entries(AUDIT_MANIFEST)) {
      expect(claim.leg, `${route} has an empty audit claim`).toBeTruthy();
      expect(typeof claim.leg).toBe('string');
    }
  });
});
