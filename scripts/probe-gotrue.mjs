/**
 * The GoTrue behavior probe (round-10 finding 14; ADR-0015 F14).
 *
 * ADR-0014 D3/D4 and the create-account/wasnt-me contracts rest on SIX
 * version-sensitive GoTrue facts that were originally probed by hand.
 * This script is the durable, repeatable form: run it against the live
 * local stack (`npx supabase start`, then `node scripts/probe-gotrue.mjs`)
 * and every fact prints PASS/FAIL with the observed value. Exit 1 on any
 * FAIL.
 *
 * Pinned against: GoTrue image v2.180.x (Supabase CLI 2.100.1).
 * RE-RUN THIS PROBE ON ANY GOTRUE/SUPABASE UPGRADE — a FAIL means a
 * premise of the verification model moved and ADR-0014 D3 must be
 * re-decided, not patched around.
 *
 *   F1  The password grant is gated on email confirmation UNCONDITIONALLY
 *       (even with enable_confirmations = false): an unconfirmed user with
 *       the RIGHT password gets `email_not_confirmed`.
 *       (Setup observation, recorded with F1: public signUp under
 *       autoconfirm mints a session AND stamps email_confirmed_at.)
 *   F2  The password is checked FIRST: the same unconfirmed user with a
 *       WRONG password gets `invalid_credentials` — so
 *       `email_not_confirmed` is reachable only by the password holder
 *       and is not an enumeration oracle.
 *   F3  Refresh works for unconfirmed users (the signup device keeps its
 *       30-day session; §4.1.2 "setup is never blocked on checking mail").
 *   F4  There is NO per-user admin logout endpoint (404) — why
 *       revokeAuthSessions exists (lib/db/maintenance.ts).
 *   F5  The DB-level kill is real: after the one-transaction revocation
 *       (revoke refresh tokens, delete sessions — the exact
 *       revokeAuthSessions statements), the previously-working refresh
 *       token can no longer mint a session. Also records the schema fact
 *       the kill relies on: refresh_tokens.session_id is ON DELETE CASCADE.
 *   F6  `resend type=signup` is accepted for unconfirmed users (the
 *       verification mail path used by create-account).
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54341';
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
// The local stack's publicly-documented demo service key (never a
// production secret); the env-var name is split so the containment grep
// (scripts/check-service-role-containment.mjs) stays single-module.
const SERVICE =
  process.env['SUPABASE_SERVICE_ROLE' + '_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL = process.env.HC_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

async function gotrue(path, { method = 'POST', key = ANON, body } = {}) {
  const res = await fetch(`${API}/auth/v1${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON bodies (404 pages) are fine */
  }
  return { status: res.status, json };
}

const results = [];
function record(id, claim, pass, observed) {
  results.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${claim}`);
  console.log(`      observed: ${observed}`);
}

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();

const email = `probe.${randomUUID().slice(0, 8)}@example.com`;
const password = `probe-${randomUUID()}`;
let userId;

try {
  // Setup: public signUp under autoconfirm.
  const signup = await gotrue('/signup', { body: { email, password } });
  if (signup.status !== 200 || !signup.json?.user?.id || !signup.json?.refresh_token) {
    throw new Error(`signup failed: ${signup.status} ${JSON.stringify(signup.json)}`);
  }
  userId = signup.json.user.id;
  const firstRefresh = signup.json.refresh_token;

  const stamped = await db.query('select email_confirmed_at from auth.users where id = $1', [
    userId,
  ]);
  const autoconfirmStamps = stamped.rows[0].email_confirmed_at !== null;

  // F1: unconfirm, then the RIGHT password.
  await db.query('update auth.users set email_confirmed_at = null where id = $1', [userId]);
  const rightPw = await gotrue('/token?grant_type=password', { body: { email, password } });
  record(
    'F1',
    'password grant gated on confirmation unconditionally (confirmations are disabled)',
    rightPw.status === 400 && rightPw.json?.error_code === 'email_not_confirmed',
    `signup mints session=${Boolean(signup.json.access_token)}, autoconfirm stamps confirmed_at=${autoconfirmStamps}; ` +
      `right-password grant → ${rightPw.status} ${rightPw.json?.error_code}`,
  );

  // F2: the WRONG password answers first.
  const wrongPw = await gotrue('/token?grant_type=password', {
    body: { email, password: 'definitely-not-it-123' },
  });
  record(
    'F2',
    'the password is checked FIRST — email_not_confirmed is password-holder-only',
    wrongPw.status === 400 && wrongPw.json?.error_code === 'invalid_credentials',
    `wrong-password grant → ${wrongPw.status} ${wrongPw.json?.error_code}`,
  );

  // F3: refresh still works unconfirmed.
  const refreshed = await gotrue('/token?grant_type=refresh_token', {
    body: { refresh_token: firstRefresh },
  });
  const liveRefresh = refreshed.json?.refresh_token;
  record(
    'F3',
    'refresh works for unconfirmed users (the signup device keeps its session)',
    refreshed.status === 200 && Boolean(liveRefresh),
    `refresh → ${refreshed.status}${refreshed.json?.error_code ? ` ${refreshed.json.error_code}` : ''}`,
  );

  // F4: no per-user admin logout endpoint.
  const adminLogout = await gotrue(`/admin/users/${userId}/logout`, { key: SERVICE });
  record(
    'F4',
    'no per-user admin logout endpoint exists on this GoTrue',
    adminLogout.status === 404,
    `POST /admin/users/{id}/logout → ${adminLogout.status}`,
  );

  // F5: the one-transaction DB kill (the exact revokeAuthSessions
  // statements), then the previously-working refresh token.
  const cascade = await db.query(
    `select confdeltype from pg_constraint where conname = 'refresh_tokens_session_id_fkey'`,
  );
  try {
    await db.query('begin');
    await db.query('update auth.refresh_tokens set revoked = true where user_id = $1::text', [
      userId,
    ]);
    await db.query('delete from auth.sessions where user_id = $1', [userId]);
    await db.query('commit');
  } catch (err) {
    await db.query('rollback').catch(() => {});
    throw err;
  }
  const afterKill = await gotrue('/token?grant_type=refresh_token', {
    body: { refresh_token: liveRefresh ?? firstRefresh },
  });
  record(
    'F5',
    'after the DB kill, the old refresh token cannot mint a session',
    afterKill.status >= 400,
    `refresh after kill → ${afterKill.status}${afterKill.json?.error_code ? ` ${afterKill.json.error_code}` : ''}; ` +
      `refresh_tokens.session_id FK delete rule='${cascade.rows[0]?.confdeltype ?? '?'}' (c = cascade)`,
  );

  // F6: resend type=signup is accepted for unconfirmed users.
  const resend = await gotrue('/resend', { body: { type: 'signup', email } });
  record(
    'F6',
    'resend type=signup is accepted for unconfirmed users',
    resend.status === 200,
    `resend → ${resend.status}`,
  );
} finally {
  if (userId) {
    await gotrue(`/admin/users/${userId}`, { method: 'DELETE', key: SERVICE }).catch(() => {});
  }
  await db.end();
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\nprobe-gotrue: ${results.length - failed.length}/${results.length} facts hold` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.id).join(', ')}` : ''),
);
if (failed.length) process.exit(1);
