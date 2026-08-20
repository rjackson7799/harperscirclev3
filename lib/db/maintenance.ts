import 'server-only';
import { Pool } from 'pg';

/**
 * The maintenance boundary AFTER the B8 credential split (ADR-0015
 * R3/R8; BAT-02; docs/ops/runtime-db-credentials.md) — the ENUMERATED
 * auth.* writes and NOTHING else. The four public-schema ops this module
 * carried through 2B/3 (create-account bootstrap, declared slice,
 * opening context, the invite describe) moved onto M1's definers through
 * the request-role channel; what remains is exactly what auth-schema
 * ungrantability forces here (the recorded PG17-image trap: auth is
 * ungrantable from migrations, so no definer can exist).
 *
 * The credential is HC_MAINTENANCE_DB_URL — deliberately NOT HC_DB_URL,
 * which authenticates as hc_runtime after the flip and can never reach
 * auth.*. This module stays deliberately narrow and closed: no generic
 * query surface, one named operation per export, ESLint-fenced to
 * lib/hc/**.
 */

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let pool: Pool | undefined;

function db(): Pool {
  if (!pool) {
    const url =
      process.env.HC_MAINTENANCE_DB_URL ??
      (process.env.NODE_ENV === 'production' ? undefined : LOCAL_DEFAULT);
    if (!url) throw new Error('maintenance boundary: HC_MAINTENANCE_DB_URL is not set');
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

/**
 * The signup un-confirm (PRD §4.1.2; docs/ops/auth-config-parity.md).
 *
 * The probed GoTrue gates the password grant on email confirmation
 * unconditionally, so the only session an unverified founder can hold is
 * the signup-minted one — which autoconfirm mints by ALSO stamping
 * email_confirmed_at. This operation corrects autoconfirm's lie in the
 * one place 2A put verification truth (auth.users.email_confirmed_at,
 * read live by the postgres-owned mirror): the founder keeps the session,
 * AC-AUTH-4 and forwarding activation stay gated on a REAL confirmation
 * click. Runs before the accounts bootstrap so the insert mirror reads
 * the corrected value.
 */
export async function unconfirmEmail(userId: string): Promise<number> {
  const r = await db().query('update auth.users set email_confirmed_at = null where id = $1', [
    userId,
  ]);
  return r.rowCount ?? 0;
}

/**
 * DB-level session revocation (TSD §5.8 sessions row) — the fallback half
 * of the GoTrue admin kill. supabase-js exposes no per-user admin logout;
 * where the REST admin logout endpoint is unavailable, revocation deletes
 * the auth.sessions rows and revokes refresh tokens — the same rows
 * GoTrue's own logout destroys (RLS closure on any still-live JWT is
 * separately proven: concurrency case 4).
 *
 * ONE transaction (round-10 finding 8): both halves commit together or
 * not at all — a failure between them can no longer strand a partial
 * kill. Tokens are revoked BEFORE the session delete because the pinned
 * GoTrue's refresh_tokens.session_id FK is ON DELETE CASCADE — the
 * UPDATE covers any token not bound to a session, the DELETE cascades
 * the rest, and the ordering keeps both statements meaningful. Live
 * proof that a revoked/cascaded token cannot mint a session:
 * scripts/probe-gotrue.mjs, fact 5.
 */
export async function revokeAuthSessions(userId: string): Promise<void> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query('update auth.refresh_tokens set revoked = true where user_id = $1::text', [
      userId,
    ]);
    await client.query('delete from auth.sessions where user_id = $1', [userId]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
