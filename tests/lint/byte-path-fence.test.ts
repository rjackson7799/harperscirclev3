// 7C C2 — THE BYTE PATH IS ONE PATH, PINNED BEFORE THE VIEWER EXISTS.
//
// The Documents viewer (7C) renders pages through GET /api/artifact/[id]
// (?page=N, &text=1). The temptation this fence exists to refuse: a viewer
// shortcut — a thumbnail route, a "just this once" signed URL, a second
// consumer of the service-role credential that returns bytes without the
// route's evidence-before-bytes order (§1.3).
//
// What the ESLint fence (eslint.config.mjs, pinned by tests/lint/db-fence.test.ts)
// already refuses: importing lib/db/service-role outside its allowlist. What it
// CANNOT refuse: a second route.ts added inside the allowlisted glob
// `app/api/artifact/**` — that file would import the credential legally. This
// scanner closes that hole at the filesystem: the sanctioned consumer is ONE
// FILE, named here, and the set of route files under app/api/artifact/ has
// exactly one element.
//
// Scope: app/, lib/, components/ — the product tree. Workers and scripts hold
// no service-role storage read today and would join the consumer set the
// moment they did, which is the point.
//
// A scanner matches its own comments (traps §9): sources are comment-stripped
// before matching, and the predicate ships positive and negative controls.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['app', 'lib', 'components'];

// The ONE sanctioned full asServiceRole() consumer (route doc header :13).
const SANCTIONED_ROUTE = 'app/api/artifact/[id]/route.ts';
// The defining module — declares the symbol, consumes nothing.
const DEFINING_MODULE = 'lib/db/service-role.ts';

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full.replace(/\\/g, '/');
    }
  }
}

const sourceFiles = ROOTS.flatMap((root) => [...walk(root)]);

// Comment carving: block comments whole, line comments only where `//` is
// preceded by start-of-line or whitespace — `https://…` inside a string
// survives (control 5 below proves it).
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

function filesMatching(pattern: RegExp, exclude: string[] = []): string[] {
  return sourceFiles
    .filter((file) => !exclude.includes(file))
    .filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))))
    .sort();
}

const CALLS_SERVICE_ROLE = /\basServiceRole\s*\(/;
const MINTS_SIGNED_URL = /\bcreateSignedUrl\b/;
const STREAMS_STORAGE_BODY = /\bfetchStorageWithin\s*\(|\bupstream\.body\b/;
const PUBLIC_URL = /\bgetPublicUrl\b/;

describe('7C C2 · the byte-path fence — one consumer, one route, pinned both ways', () => {
  it(`asServiceRole() is consumed by exactly one file: ${SANCTIONED_ROUTE}`, () => {
    expect(filesMatching(CALLS_SERVICE_ROLE, [DEFINING_MODULE])).toEqual([
      SANCTIONED_ROUTE,
    ]);
  });

  it('app/api/artifact/ holds exactly one route file — the ESLint allowlist glob cannot quietly grow a sibling', () => {
    const artifactRoutes = sourceFiles.filter(
      (file) => file.startsWith('app/api/artifact/') && /\/route\.tsx?$/.test(file)
    );
    expect(artifactRoutes).toEqual([SANCTIONED_ROUTE]);
  });

  it(`storage bytes are minted (createSignedUrl) in exactly one file: ${SANCTIONED_ROUTE}`, () => {
    expect(filesMatching(MINTS_SIGNED_URL)).toEqual([SANCTIONED_ROUTE]);
  });

  it('no route besides the sanctioned one streams a storage body to a client', () => {
    const streamingRoutes = filesMatching(STREAMS_STORAGE_BODY).filter((file) =>
      /\/route\.tsx?$/.test(file)
    );
    expect(streamingRoutes).toEqual([SANCTIONED_ROUTE]);
  });

  it('getPublicUrl appears nowhere in the product tree — a public URL is an unrevocable read', () => {
    expect(filesMatching(PUBLIC_URL)).toEqual([]);
  });

  // ── The scanner's own controls (traps §9) ────────────────────────────────
  it('control: a real call is caught; a comment mention is carved out', () => {
    expect(CALLS_SERVICE_ROLE.test(stripComments('const c = asServiceRole();'))).toBe(true);
    expect(
      CALLS_SERVICE_ROLE.test(stripComments('// never call asServiceRole() here'))
    ).toBe(false);
    expect(
      CALLS_SERVICE_ROLE.test(stripComments('/* asServiceRole() is fenced */'))
    ).toBe(false);
  });

  it('control: a URL inside a string survives line-comment carving', () => {
    const line = "const u = 'https://example.test/x'; asServiceRole();";
    expect(CALLS_SERVICE_ROLE.test(stripComments(line))).toBe(true);
  });

  it('control: the sanctioned route really is a consumer — the fence fails loudly if the route is renamed', () => {
    const source = stripComments(readFileSync(SANCTIONED_ROUTE, 'utf8'));
    expect(CALLS_SERVICE_ROLE.test(source)).toBe(true);
    expect(MINTS_SIGNED_URL.test(source)).toBe(true);
  });
});
