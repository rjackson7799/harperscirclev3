import { readdirSync, statSync } from 'node:fs';
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

  it('every entry says HOW the route is audited — a leg, or an honest owed/redirect claim', () => {
    for (const [route, claim] of Object.entries(AUDIT_MANIFEST)) {
      expect(claim.leg, `${route} has an empty audit claim`).toBeTruthy();
      expect(typeof claim.leg).toBe('string');
    }
  });
});
