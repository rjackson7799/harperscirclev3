/**
 * The enforceable half of the service-role boundary (TSD §1.2, plan Step 1).
 *
 * Asserts that the string SUPABASE_SERVICE_ROLE_KEY appears in exactly one
 * application module: lib/db/service-role.ts. ESLint import rules are
 * bypassable by re-export, dynamic import, or constructing a client
 * elsewhere; the credential name is not.
 *
 * Scans git-tracked files only, excluding docs/ (specification text may
 * name the variable) and this script itself.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NEEDLE = 'SUPABASE_SERVICE_ROLE' + '_KEY'; // split so this file never matches raw greps
const ALLOWED = new Set(['lib/db/service-role.ts']);

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.startsWith('docs/'))
  .filter((f) => f !== 'scripts/check-service-role-containment.mjs')
  .filter((f) => !/\.(png|jpe?g|gif|ico|webp|woff2?|pdf)$/i.test(f));

const offenders = [];
for (const file of tracked) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes(NEEDLE) && !ALLOWED.has(file)) offenders.push(file);
}

if (offenders.length > 0) {
  console.error(
    `service-role containment violated — ${NEEDLE} referenced outside lib/db/service-role.ts:`
  );
  for (const f of offenders) console.error(`  ${f}`);
  process.exit(1);
}

console.log('service-role containment: OK (single permitted module)');
