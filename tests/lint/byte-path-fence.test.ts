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
//
// ── 7E · ROUND 27, R1/F-1..F-3 and F-5 (ADR-0038, ACCEPTED · TAKEN(7E)) ─────
//
// Round 27 found the file proving THE TREE IT WAS WRITTEN AGAINST rather than
// the property its titles claim: four predicates, three of them literal-name
// greps, three of them shipping no negative control, each with a concrete
// ESLint-legal bypass.
//
//   R1/F-1  `asServiceRole` is ONE of three exported doors to the same
//           credential, and the predicate pins the IDENTIFIER where D1's
//           sentence claims the MODULE'S CONSUMER SET. `lib/db/**` carries
//           `no-restricted-imports: "off"`, so a two-line re-export returns
//           the full client to the whole tree with all five green.
//   R1/F-2  `fetchStorageWithin(` / `upstream.body` are two idioms of the ONE
//           file being pinned. `lib/storage/artifacts`'s byte-returning
//           readers need neither, and three route globs may import them.
//   R1/F-3  `\bcreateSignedUrl\b` cannot match `createSignedUrls` — `s` is a
//           word character, so the batch method the installed client ships is
//           invisible to the scanner that exists to forbid an unrevocable read.
//   R1/F-5  D1 credits THIS file with the next/image prohibition and the file
//           never mentions it, while `@next/next/no-img-element` makes
//           `<Image>` the lint-blessed default and proxy.ts's matcher exempts
//           `_next/image` from the `private, no-store` stamp.
//
// The remedy ADR-0026 dictates — if it can be an exact-set assertion, it must
// be — is below: the module's IMPORTERS and its EXPORT NAMES pinned to exact
// sets, the byte-returning readers' importers pinned the same way, the plural
// signed-URL form matched, and a negative control per predicate.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['app', 'lib', 'components'];

// The ONE sanctioned full asServiceRole() consumer (route doc header :13).
const SANCTIONED_ROUTE = 'app/api/artifact/[id]/route.ts';
// The defining module — declares the symbol, consumes nothing.
const DEFINING_MODULE = 'lib/db/service-role.ts';
// The module that owns the storage plane's byte-returning readers.
const STORAGE_MODULE = 'lib/storage/artifacts.ts';
// The same two, extension-less: what an import specifier resolves TO.
const SERVICE_ROLE_PATH = DEFINING_MODULE.replace(/\.ts$/, '');
const STORAGE_PATH = STORAGE_MODULE.replace(/\.ts$/, '');

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
// R1/F-3: the trailing `s?`. `\b` between `l` and `s` is not a boundary, so
// the singular-only form could not see the BATCH mint at all. Verified in
// the installed @supabase/storage-js: createSignedUrl 30, createSignedUrls 15.
const MINTS_SIGNED_URL = /\bcreateSignedUrls?\b/;
const STREAMS_STORAGE_BODY = /\bfetchStorageWithin\s*\(|\bupstream\.body\b/;
const PUBLIC_URL = /\bgetPublicUrl\b/;
// R1/F-5: the prohibition D1 credits this file with. Both forms — the
// specifier and the element — because either one alone is a name grep.
const USES_NEXT_IMAGE = /['"]next\/image['"]|<Image[\s/>]/;

// ── 7E · the IMPORT GRAPH, not the identifier (R1/F-1, R1/F-2) ─────────────
//
// `moduleImports` reads what a file actually PULLS from a module rather than
// which words appear in it: every `from '<spec>'` and every `import('<spec>')`
// whose specifier ends in the module path, with the named bindings of the
// static form captured. That is what makes the re-export bypass visible —
// `export const svc = sr` never writes `asServiceRole(`, but the import line
// above it names the module, and a module cannot be consumed without being
// imported.

/** An import specifier resolved to a repo-relative, extension-less module
 *  path. `@/lib/db/service-role` becomes `lib/db/service-role`; and
 *  `./service-role`, imported from `lib/db/reexport.ts`, becomes the same.
 *  A bare package specifier resolves to itself and so matches nothing
 *  under the walked roots.
 *
 *  Resolution is the point of the 7E rewrite. The RED matched the specifier
 *  as a STRING containing `db/service-role`, and R1/F-1's bypass is a
 *  re-export placed under `lib/db/**` — which writes `'./service-role'` and
 *  contains no `db/` at all. A string test is not an import graph. */
function resolveSpecifier(spec: string, fromFile: string): string {
  const noExt = spec.replace(/\.(?:tsx?|jsx?|mjs|cjs)$/, '');
  if (noExt.startsWith('.')) return posix.normalize(posix.join(posix.dirname(fromFile), noExt));
  return noExt.replace(/^@\//, '');
}

/** Every import of the module at repo-relative, extension-less `modulePath`
 *  in a comment-stripped `source` that lives at `fromFile`, carrying the
 *  named bindings of the `import { a, b as c }` form.
 *
 *  A default import, `import * as ns`, a bare `import '…'`, an
 *  `export * from '…'` and a dynamic `import('…')` each yield `[]` bindings
 *  and still COUNT as imports — deliberately: every one of them reaches the
 *  whole export set at once, and a module cannot be consumed without being
 *  imported. That last clause is the property ADR-0037 D1's sentence claims
 *  and the identifier grep never had. The re-export form `export { x } from
 *  '…'` is read by the named pass, so it carries its bindings like any',
 *  other import — which is exactly how the two-line bypass becomes visible. */
function moduleImports(
  source: string,
  modulePath: string,
  fromFile: string,
): { bindings: string[] }[] {
  const clean = stripComments(source);
  const found: { bindings: string[] }[] = [];
  // Both passes end their match at the closing quote of the specifier, so
  // the end offset is what keeps the second pass from re-counting the first.
  const counted = new Set<number>();

  const named = /\b(?:import|export)\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of clean.matchAll(named)) {
    counted.add(m.index! + m[0].length);
    if (resolveSpecifier(m[2], fromFile) !== modulePath) continue;
    found.push({
      bindings: m[1]
        .split(',')
        .map((b) => b.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean),
    });
  }

  const any = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const m of clean.matchAll(any)) {
    if (counted.has(m.index! + m[0].length)) continue;
    if (resolveSpecifier(m[1], fromFile) !== modulePath) continue;
    found.push({ bindings: [] });
  }
  return found;
}

/** The files under the walked roots that import `modulePath` at all — the
 *  module's CONSUMER SET, which is what ADR-0037 D1's sentence claims. */
function importersOf(modulePath: string, exclude: string[] = []): string[] {
  return sourceFiles
    .filter((file) => !exclude.includes(file))
    .filter((file) => moduleImports(readFileSync(file, 'utf8'), modulePath, file).length > 0)
    .sort();
}

/** The files that import at least one of `names` FROM `modulePath`. */
function importersOfNames(modulePath: string, names: string[], exclude: string[] = []): string[] {
  return sourceFiles
    .filter((file) => !exclude.includes(file))
    .filter((file) =>
      moduleImports(readFileSync(file, 'utf8'), modulePath, file).some((i) =>
        i.bindings.some((b) => names.includes(b)),
      ),
    )
    .sort();
}

/** Top-level export names of a module, by declaration. */
function exportNames(file: string): string[] {
  const src = stripComments(readFileSync(file, 'utf8'));
  const out = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm))
    out.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm))
    for (const b of m[1].split(','))
      if (b.trim()) out.add(b.trim().split(/\s+as\s+/).pop()!.trim());
  return [...out].sort();
}

// R1/F-1: the module's consumer set, exact. Each is fenced by ESLint to its
// own narrow shape (eslint.config.mjs) and each is a REVIEWED door; a fourth
// file here — a re-export under lib/db/**, where every import fence is `off`
// — is the two-line bypass the finding names, and it fails this list.
const SERVICE_ROLE_IMPORTERS = [
  'app/api/artifact/[id]/route.ts', // asServiceRole — the ONE full client
  'lib/auth/gotrue-admin.ts', // asGoTrueAdmin — the auth-admin shape
  'lib/storage/artifacts.ts', // asStoragePlane + serviceCredential
];

// R1/F-1's second half: a FOURTH door cannot appear unannounced. The three
// non-`asServiceRole` exports read the SAME env var and carry the SAME
// privilege — which is why pinning one identifier was never the property.
const SERVICE_ROLE_EXPORTS = [
  'asGoTrueAdmin',
  'asServiceRole',
  'asStoragePlane',
  'serviceCredential',
];

// R1/F-2: the byte-returning readers, and the raw credential for the hops
// supabase-js cannot speak. A route importing any of these can return the
// bytes with NONE of §1.3's six steps and never write `fetchStorageWithin(`
// or `upstream.body` — "a thumbnail route", the temptation named at the top
// of this file.
const BYTE_READERS = [
  'downloadObject',
  'readStagedObject',
  'readArtifactBytes',
  'storageAuthHeaders',
];

// The WRITE surfaces of the pipeline — the three the ESLint fence admits to
// lib/storage on purpose (hc/db-fences-storage-consumers, -worker-routes).
// Each reads bytes to PROCESS them; none returns them to a client, and this
// list is what makes a fourth consumer a decision instead of an accident.
const BYTE_READER_IMPORTERS = [
  'app/api/upload/complete/route.ts', // the staged object, to measure and store
  'app/api/upload/tus/[[...id]]/route.ts', // the TUS forward's auth headers
  'app/api/worker/[stage]/route.ts', // scan, extract, interpret, render
];

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

// ============================================================================
// 7E · what the four literal-name predicates above cannot see (round 27,
// R1/F-1/F-2/F-3/F-5). Every assertion here is about the property the titles
// claim — the module's consumer set, its export set, the readers' consumers,
// the plural mint, the optimizer — not about the words this tree happens to
// use today.
// ============================================================================

describe('7E · the byte path pinned by its IMPORT GRAPH, not by identifiers (R1/F-1, R1/F-2)', () => {
  it(`lib/db/service-role is imported by exactly three files — a re-export under lib/db/** is the bypass this replaces (R1/F-1)`, () => {
    expect(importersOf(SERVICE_ROLE_PATH, [DEFINING_MODULE])).toEqual(SERVICE_ROLE_IMPORTERS);
  });

  it('lib/db/service-role exports exactly four names — a FOURTH door to the same credential cannot appear unannounced (R1/F-1)', () => {
    expect(exportNames(DEFINING_MODULE)).toEqual(SERVICE_ROLE_EXPORTS);
  });

  it("the storage plane's byte-returning readers are imported by exactly three pipeline WRITE routes — none of which returns the bytes (R1/F-2)", () => {
    expect(importersOfNames(STORAGE_PATH, BYTE_READERS, [STORAGE_MODULE])).toEqual(
      BYTE_READER_IMPORTERS,
    );
  });

  it('no page, component or lib wrapper imports a byte-returning reader at all — the readers stay inside the pipeline (R1/F-2)', () => {
    const outsideApi = importersOfNames(STORAGE_PATH, BYTE_READERS, [STORAGE_MODULE]).filter(
      (file) => !file.startsWith('app/api/'),
    );
    expect(outsideApi).toEqual([]);
  });

  it('next/image appears nowhere under app/, lib/ or components/ — the optimizer would BE a second byte path and a second retention surface (R1/F-5)', () => {
    expect(filesMatching(USES_NEXT_IMAGE)).toEqual([]);
  });

  // ── A negative control PER PREDICATE (traps §9) ──────────────────────────
  // Three of the four original predicates shipped none, which is exactly why
  // R1/F-3's missing `s` survived review. Each control plants the finding's
  // own failure scenario as a string and asserts the predicate catches it.

  it('control: MINTS_SIGNED_URL catches the PLURAL batch method the installed client ships (R1/F-3)', () => {
    // node_modules/@supabase/storage-js — `createSignedUrls(paths, expiresIn)`
    // returns the same bearer-in-the-URL credential the singular one does.
    expect(MINTS_SIGNED_URL.test('await plane.from(B).createSignedUrls([key], 3600);')).toBe(true);
    expect(MINTS_SIGNED_URL.test('await plane.from(B).createSignedUrl(key, 3600);')).toBe(true);
    expect(MINTS_SIGNED_URL.test('const createSignedUrlFactory = 1;')).toBe(false);
    expect(MINTS_SIGNED_URL.test(stripComments('// never createSignedUrl here'))).toBe(false);
  });

  it('control: PUBLIC_URL catches a real call, is carved out of comments, and has no plural form to miss', () => {
    expect(PUBLIC_URL.test('const { data } = plane.from(B).getPublicUrl(key);')).toBe(true);
    expect(PUBLIC_URL.test(stripComments('// getPublicUrl is forbidden'))).toBe(false);
    // R1/F-3 is about `createSignedUrls`, and this predicate is NOT the same
    // case: the installed @supabase/storage-js writes getPublicUrl 37 times
    // and ships no plural, so the singular form has nothing to miss. What it
    // must not do is fire on a longer identifier that merely begins with the
    // name — that would be a false positive fencing an innocent file.
    expect(PUBLIC_URL.test('const getPublicUrlsBanned = true;')).toBe(false);
  });

  it('control: STREAMS_STORAGE_BODY catches both idioms and is carved out of comments', () => {
    expect(STREAMS_STORAGE_BODY.test('const upstream = await fetchStorageWithin(u, ms);')).toBe(
      true,
    );
    expect(STREAMS_STORAGE_BODY.test('return new Response(upstream.body, { headers });')).toBe(
      true,
    );
    expect(
      STREAMS_STORAGE_BODY.test(stripComments('/* fetchStorageWithin() is the one hop */')),
    ).toBe(false);
  });

  it('control: USES_NEXT_IMAGE catches the specifier AND the element, and is carved out of comments (R1/F-5)', () => {
    expect(USES_NEXT_IMAGE.test("import Image from 'next/image';")).toBe(true);
    expect(USES_NEXT_IMAGE.test('<Image src={src} alt="" />')).toBe(true);
    // The two live mentions in the tree are explanatory comments; carving is
    // what keeps this assertion honest rather than merely green.
    expect(
      USES_NEXT_IMAGE.test(stripComments('// next/image would put them through an optimizer')),
    ).toBe(false);
    expect(USES_NEXT_IMAGE.test('<ImageCaption>Page 1</ImageCaption>')).toBe(false);
  });

  it('control: the import reader sees the RE-EXPORT bypass that the identifier predicate misses (R1/F-1)', () => {
    // R1/F-1, made concrete: a new file under lib/db/**, where every import
    // fence is `no-restricted-imports: "off"`, re-exporting the credential to
    // the whole tree. It writes a RELATIVE sibling specifier, which is why
    // the reader has to resolve rather than substring-match.
    const BYPASS_FILE = 'lib/db/reexport.ts';
    const bypass = [
      "import { asServiceRole as sr } from './service-role';",
      'export const svc = sr;',
    ].join('\n');
    // The shipped predicate: no paren follows the identifier, so it misses it.
    expect(CALLS_SERVICE_ROLE.test(bypass)).toBe(false);
    // The import graph: the module was imported, which is the property.
    expect(moduleImports(bypass, SERVICE_ROLE_PATH, BYPASS_FILE)).toHaveLength(1);
    expect(moduleImports(bypass, SERVICE_ROLE_PATH, BYPASS_FILE)[0].bindings).toEqual([
      'asServiceRole',
    ]);
    // And the one-line form of the same bypass, which has no import statement
    // at all — a re-export IS an import for the purpose of the consumer set.
    expect(
      moduleImports("export { asServiceRole } from './service-role';", SERVICE_ROLE_PATH, BYPASS_FILE),
    ).toEqual([{ bindings: ['asServiceRole'] }]);
    // Placed anywhere else, the same relative specifier resolves elsewhere and
    // is NOT this module — resolution discriminates where a substring cannot.
    expect(moduleImports(bypass, SERVICE_ROLE_PATH, 'lib/storage/reexport.ts')).toEqual([]);
  });

  it('control: the import reader sees a byte reader pulled into a route, and does NOT see a same-named local (R1/F-2)', () => {
    const THUMBNAIL_FILE = 'app/api/upload/preview/route.ts';
    const thumbnail = [
      "import { downloadObject } from '@/lib/storage/artifacts';",
      'export async function GET(req: Request) {',
      '  const o = await downloadObject(key);',
      '  return new Response(o!.bytes, { headers: { "content-type": o!.contentType } });',
      '}',
    ].join('\n');
    expect(
      moduleImports(thumbnail, STORAGE_PATH, THUMBNAIL_FILE).some((i) =>
        i.bindings.some((b) => BYTE_READERS.includes(b)),
      ),
    ).toBe(true);
    // A local function of the same name, imported from nowhere, is not a
    // consumer of the module — the identifier grep cannot tell these apart.
    const local = 'function downloadObject(k: string) { return null; }';
    expect(moduleImports(local, STORAGE_PATH, THUMBNAIL_FILE)).toEqual([]);
  });

  it('control: the export reader finds every declaration form, and the dynamic-import form counts as an import', () => {
    expect(exportNames(DEFINING_MODULE)).toContain('asServiceRole');
    expect(exportNames(DEFINING_MODULE)).toContain('asStoragePlane');
    const CALLER = 'app/api/artifact/[id]/route.ts';
    expect(
      moduleImports("const m = await import('@/lib/db/service-role');", SERVICE_ROLE_PATH, CALLER),
    ).toHaveLength(1);
    expect(
      moduleImports("import * as sr from '@/lib/db/service-role';", SERVICE_ROLE_PATH, CALLER),
    ).toHaveLength(1);
    expect(
      moduleImports("export * from '@/lib/db/service-role';", SERVICE_ROLE_PATH, CALLER),
    ).toHaveLength(1);
    // A sibling module of the same directory is not this module.
    expect(
      moduleImports("import { asUser } from '@/lib/db/user';", SERVICE_ROLE_PATH, CALLER),
    ).toEqual([]);
    // And the reader carves its own comments, like every predicate here.
    expect(
      moduleImports(
        "// import { asServiceRole } from '@/lib/db/service-role';",
        SERVICE_ROLE_PATH,
        CALLER,
      ),
    ).toEqual([]);
  });
});
