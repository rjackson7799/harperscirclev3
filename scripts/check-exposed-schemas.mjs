/**
 * The exposed-schema pin (ADR-0004, round-5 ruling R2).
 *
 * The function-ACL segfault workaround (catalog closure assertions instead
 * of live denied calls) is safe precisely because PostgREST never exposes
 * schema hc: no request path can reach a denied hc function directly. That
 * premise must not drift silently — this asserts supabase/config.toml's
 * exposed-schema list is exactly [public, graphql_public]. Any future
 * exposure of hc is gated on a live-denial test passing or a fixed
 * platform image (ADR-0004 R2).
 */
import { readFileSync } from 'node:fs';

const EXPECTED = ['public', 'graphql_public'];

const toml = readFileSync('supabase/config.toml', 'utf8');
const match = toml.match(/^\s*schemas\s*=\s*\[([^\]]*)\]/m);

const actual = match
  ? match[1]
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
  : null;

const ok =
  Array.isArray(actual) &&
  actual.length === EXPECTED.length &&
  EXPECTED.every((s, i) => actual[i] === s);

if (!ok) {
  console.error(
    `exposed-schema pin violated — supabase/config.toml [api].schemas is ` +
      `${actual ? JSON.stringify(actual) : 'unreadable'}, expected ` +
      `${JSON.stringify(EXPECTED)}. Exposing hc is gated on a live-denial ` +
      `test or a fixed platform image (ADR-0004 R2).`
  );
  process.exit(1);
}

console.log('exposed-schema pin: OK (public, graphql_public — hc never exposed)');
