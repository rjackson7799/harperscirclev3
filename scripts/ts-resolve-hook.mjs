// The module-resolution half of scripts/ts-run.mjs (5B B9). See that file for
// why this exists rather than a dependency.

import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.env.HC_TS_RUN_ROOT ?? process.cwd();

/** `server-only` resolves to a THROWING module outside a react-server
 *  condition — correct for the app, wrong for a server-side CLI harness. */
const SERVER_ONLY_STUB = 'data:text/javascript,export{};';

/** A FILE, not merely a path that exists: `@/lib/db` is a directory AND a
 *  module (lib/db/index.ts), and answering with the directory is an EISDIR
 *  the moment the loader tries to read it. */
function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function withExtension(base) {
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    base,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: SERVER_ONLY_STUB, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const resolved = withExtension(path.join(ROOT, specifier.slice(2)));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }
  // A relative import between two of our own TypeScript modules also arrives
  // without an extension when it came from an alias-resolved parent.
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentDir = path.dirname(fileURLToPathSafe(context.parentURL));
    const resolved = withExtension(path.resolve(parentDir, specifier));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }
  return next(specifier, context);
}

function fileURLToPathSafe(url) {
  try {
    return new URL(url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  } catch {
    return ROOT;
  }
}
