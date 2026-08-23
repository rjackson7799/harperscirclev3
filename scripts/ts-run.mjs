// ============================================================================
// A zero-dependency TypeScript runner for the slice-5 harnesses (5B B9).
//
//   node scripts/ts-run.mjs scripts/eval/run.ts [args…]
//
// WHY THIS EXISTS. The G9 eval harness and the §13.2 p95 harness must send
// EXACTLY what the worker sends — §6.10's whole point is that a production
// fact traces to the eval that calibrated its field, and that is only true if
// the eval uses the same schema, the same prompts, the same parameters and the
// same §6.3 render rules. Those live in TypeScript under `lib/`. A harness
// written in plain JS would have to re-implement the request, which is the one
// thing §6.10 forbids.
//
// WHY NOT A DEPENDENCY. The slice's dev-dependency reserve is ONE slot and it
// is reserved for review dispositions (the standing precedent). Spending it
// here would pre-empt the review that has not happened yet. Node 22.15 already
// strips types (`--experimental-strip-types`); all this file adds is the two
// resolutions that stripping does not do:
//
//   1. `@/…`        → repo-relative, with the `.ts`/`.tsx` extension Node's
//                     ESM resolver requires and the alias never carries;
//   2. `server-only` → a no-op. The package deliberately resolves to a
//                     throwing module outside a react-server condition, which
//                     is correct for the app and wrong for a CLI harness that
//                     is, by construction, server-side. vitest.config.ts
//                     stubs it the same way for the same reason.
//
// It is deliberately NOT a general build step. It runs one script, in-process,
// for two operator-invoked harnesses. Nothing in CI, the app, or the test
// suite depends on it.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/ts-run.mjs <script.ts> [args…]');
  process.exit(2);
}

const hook = path.join(HERE, 'ts-resolve-hook.mjs');
const bootstrap =
  `import { register } from 'node:module';` +
  `import { pathToFileURL } from 'node:url';` +
  `register(pathToFileURL(${JSON.stringify(hook)}).href, pathToFileURL('./'));`;

const result = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--no-warnings=ExperimentalWarning',
    '--import',
    `data:text/javascript,${encodeURIComponent(bootstrap)}`,
    path.resolve(ROOT, target),
    ...process.argv.slice(3),
  ],
  { stdio: 'inherit', cwd: ROOT, env: { ...process.env, HC_TS_RUN_ROOT: ROOT } },
);
process.exit(result.status ?? 1);
