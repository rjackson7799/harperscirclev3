import 'server-only';

/**
 * asServiceRole() — production credential of last resort (TSD §1.2, §1.3).
 *
 * This is the ONLY module in the repository permitted to read
 * SUPABASE_SERVICE_ROLE_KEY. CI asserts the variable name appears nowhere
 * else in application code (scripts/check-service-role-containment.mjs).
 *
 * The containment is layered so no single bypass works:
 *  - the key is read here and only here (CI grep);
 *  - `server-only` makes bundling this module into client code a build error;
 *  - `lib/db/index.ts` does not re-export it — importing it is a deliberate,
 *    reviewable act, not something a barrel hands out.
 *
 * The permitted call-site list has exactly one entry: the artifact-streaming
 * route (app/api/artifact/[id]). Migrations are applied by the Supabase CLI
 * over its own connection — no application migration runner exists. Whether
 * even the artifact route needs the full service-role key, rather than a
 * narrowly privileged storage path, is a Step 2 spike question (claim 12).
 */
export function asServiceRole(): never {
  throw new Error('asServiceRole(): not implemented until the artifact route lands (TSD §1.3)');
}
