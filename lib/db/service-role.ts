import 'server-only';
import { createClient } from '@supabase/supabase-js';

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
 * The permitted call-site list has exactly one FULL-CLIENT entry: the
 * artifact-streaming route (app/api/artifact/[id], 4B B7 — the §1.3
 * signed-URL half, created and consumed server-side). The narrower
 * shapes below (storage plane, GoTrue admin) carry their own fenced
 * consumers. Migrations are applied by the Supabase CLI over its own
 * connection — no application migration runner exists. Whether the
 * artifact route needs the full key rather than a narrowly privileged
 * storage path remains the recorded Step-2 spike question (claim 12).
 */
export function asServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('asServiceRole(): NEXT_PUBLIC_SUPABASE_URL and the service key must be set');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * asStoragePlane() — the STORAGE plane only (4B; ADR-0018 F2's sanction:
 * "a service-role storage client under the A2 allowlist discipline").
 * Same credential, deliberately narrower shape: the returned surface is
 * the storage API alone — intake staging (B2), the store worker's
 * content-addressed writes and the quarantine move (B4), the §11.5
 * quarantine byte purge (B5), upload staging (B3) and the artifact
 * route's signed-URL half (B7). M7 ships ZERO storage.objects policies
 * (049 pins the absence), so every byte in either bucket moves through
 * this plane or not at all — which is exactly what makes revocation
 * close access on the next request (AC-PPL-4). Never used for PostgREST
 * data reads, the same containment note asServiceRole() carries.
 * Consumed only through lib/storage/** (the ESLint fence's storage-module
 * block).
 */
/**
 * serviceCredential() — the raw credential VALUE for the two fenced
 * consumers that must speak protocols supabase-js does not carry (the
 * storage plane's TUS proxy forward + the upload-grant HMAC). The name
 * stays in this one module (the containment grep's whole point); the
 * value never appears in logs or responses.
 */
export function serviceCredential(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('serviceCredential(): the service key must be set');
  return key;
}

export function asStoragePlane() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('asStoragePlane(): NEXT_PUBLIC_SUPABASE_URL and the service key must be set');
  }
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client.storage;
}

/**
 * asGoTrueAdmin() — the GoTrue ADMIN surface only (2B, ADR-0013 F3 and
 * TSD §5.8's sessions row). Same credential, deliberately narrower shape:
 * the returned client is used exclusively for auth-admin operations
 * (password rotation for the forced reset; admin user updates), never for
 * PostgREST reads — data reads on this key would defeat §1.2 exactly the
 * way asServiceRole()'s containment note describes. Consumed only through
 * lib/auth/gotrue-admin.ts (the second entry on the ESLint allowlist).
 */
export function asGoTrueAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('asGoTrueAdmin(): NEXT_PUBLIC_SUPABASE_URL and the service key must be set');
  }
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client.auth.admin;
}
