import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// 6B close-out · a package this code RESOLVES BY PATH must not be bundled.
//
// Next bundles dependencies used in Server Components and Route Handlers.
// Inside that bundle `require.resolve(...)` does not return a filesystem
// path — it returns a module id. The close-out gate watched tesseract.js be
// handed
//   "[project]/node_modules/tesseract.js/src/worker-script/node/index.js
//    [app-route] (ecmascript)"
// and refuse it: "The worker script or module filename must be an absolute
// path". §6.9's reading aid was absent from the running app as a result.
//
// `serverExternalPackages` is the documented opt-out (Next 16,
// next.config.js/serverExternalPackages.md: "opt-out ... and use native
// Node.js require"). The project already relies on it for `pdfjs-dist` and
// `@napi-rs/canvas`, whose resource directories resolve the same way —
// which is exactly why lib/pipeline/render.ts's identical
// `nodeRequire.resolve('pdfjs-dist/package.json')` works and ocr.ts's did
// not. The rule was known; it simply was not CHECKED when B9 added a
// dependency of the same shape.
//
// So: every first-party `require.resolve('<pkg>...')` must name a package
// that is external — either listed in next.config.ts or on Next's own
// built-in list.
//
// Test class: STATIC SCAN (no DB, no network, no bundler).
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const TREES = ['lib', 'app', 'components'];
const EXTENSIONS = new Set(['.ts', '.tsx']);

// `require.resolve('x')` / `nodeRequire.resolve("x")` — any identifier ending
// in `require`, so the local alias in render.ts is caught too. `path.resolve`
// is excluded by requiring the `require` suffix on the receiver.
const RESOLVE_CALL = /\b(?:[A-Za-z_$][\w$]*)?[Rr]equire\.resolve\(\s*['"]([^'"]+)['"]/g;

/** 'tesseract.js/src/worker-script/node/index.js' -> 'tesseract.js'
 *  '@tesseract.js-data/eng/package.json'          -> '@tesseract.js-data/eng' */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

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

/** The packages named in next.config.ts's serverExternalPackages array. */
function declaredExternals(): string[] {
  const source = readFileSync(path.join(repo, 'next.config.ts'), 'utf8');
  const m = /serverExternalPackages\s*:\s*\[([^\]]*)\]/.exec(source);
  if (!m) return [];
  return Array.from(m[1].matchAll(/['"]([^'"]+)['"]/g), (x) => x[1]);
}

/** Next's own auto-external list, read from the installed package so it
 *  tracks the version in the tree rather than a copy that rots here. */
function builtinExternals(): string[] {
  const file = path.join(repo, 'node_modules/next/dist/lib/server-external-packages.jsonc');
  if (!existsSync(file)) return [];
  const stripped = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  try {
    const parsed: unknown = JSON.parse(stripped);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

describe('6B · a package resolved by path is never bundled', () => {
  it('the extractor reads a specifier down to its package name', () => {
    expect(packageOf('tesseract.js/src/worker-script/node/index.js')).toBe('tesseract.js');
    expect(packageOf('@tesseract.js-data/eng/package.json')).toBe('@tesseract.js-data/eng');
    expect(packageOf('pdfjs-dist/package.json')).toBe('pdfjs-dist');
    expect(packageOf('pdfjs-dist')).toBe('pdfjs-dist');
  });

  it('the scanner finds the call sites it exists for (positive control)', () => {
    const hits = Array.from(
      "const root = path.dirname(nodeRequire.resolve('pdfjs-dist/package.json'));".matchAll(
        RESOLVE_CALL,
      ),
    );
    expect(hits).toHaveLength(1);
    expect(packageOf(hits[0][1])).toBe('pdfjs-dist');
    // …and leaves path.resolve alone.
    expect(Array.from("path.resolve(__dirname, '../..')".matchAll(RESOLVE_CALL))).toHaveLength(0);
  });

  it('next.config.ts still declares the externals the renderer depends on', () => {
    const declared = declaredExternals();
    expect(declared).toContain('pdfjs-dist');
    expect(declared).toContain('@napi-rs/canvas');
  });

  it('every package first-party code resolves BY PATH is external', () => {
    const external = new Set([...declaredExternals(), ...builtinExternals()]);
    const offenders: string[] = [];

    for (const file of firstPartyFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const hit of source.matchAll(RESOLVE_CALL)) {
        const pkg = packageOf(hit[1]);
        if (!external.has(pkg)) {
          offenders.push(`${path.relative(repo, file)}  resolves '${hit[1]}'  -> ${pkg}`);
        }
      }
    }

    expect(
      offenders,
      'add these to serverExternalPackages in next.config.ts — inside the bundle, require.resolve returns a module id, not a path',
    ).toEqual([]);
  });
});
