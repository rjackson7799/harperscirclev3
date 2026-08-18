import 'server-only';
import { Pool } from 'pg';

/**
 * The maintenance boundary — the ENUMERATED identity writes 2A left to
 * the app layer (each with the 2A precedent that sanctions it), running
 * as the connection identity the migration runner and mirror triggers
 * already use (DEF-07's documented maintenance exemption).
 *
 * This module is deliberately narrow and closed:
 *  - No generic query surface. Every export is one named operation with
 *    one parameterized statement and a spec pointer.
 *  - ESLint fences imports to lib/hc/**; the operations are consumed
 *    through typed wrappers only.
 *  - Anything that CAN ride a definer function does (the request-role
 *    channel); an operation lands here only when the DB deliberately has
 *    no request-path privilege for it and 2B may not add DDL (the spent
 *    migration reserve, slice-2-plan Status). Each entry is a standing
 *    round-10 question: "should this become a definer under a bound
 *    amendment?" — recorded in the 2B build ADR.
 */

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let pool: Pool | undefined;

function db(): Pool {
  if (!pool) {
    const url =
      process.env.HC_DB_URL ??
      (process.env.NODE_ENV === 'production' ? undefined : LOCAL_DEFAULT);
    if (!url) throw new Error('maintenance boundary: HC_DB_URL is not set');
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

/**
 * The accounts-row bootstrap at create-account (TSD §2.3).
 *
 * public.accounts has zero request-path INSERT privilege by design and 2A
 * shipped no creation definer; the 2A suite seeds accounts exactly this
 * way (the auth.users row exists first — GoTrue admin createUser — then
 * the accounts row; the M3/M5 mirror trigger fills email columns on
 * insert). Idempotent: a replayed bootstrap changes nothing.
 */
export async function insertAccountRow(userId: string, displayName: string): Promise<void> {
  await db().query(
    `insert into public.accounts (id, kind, display_name)
     values ($1, 'member', $2)
     on conflict (id) do nothing`,
    [userId, displayName],
  );
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
export async function unconfirmEmail(userId: string): Promise<void> {
  await db().query('update auth.users set email_confirmed_at = null where id = $1', [userId]);
}

/**
 * DB-level session revocation (TSD §5.8 sessions row) — the fallback half
 * of the GoTrue admin kill. supabase-js exposes no per-user admin logout;
 * where the REST admin logout endpoint is unavailable, revocation deletes
 * the auth.sessions rows and revokes refresh tokens — the same rows
 * GoTrue's own logout destroys (RLS closure on any still-live JWT is
 * separately proven: concurrency case 4).
 */
export async function revokeAuthSessions(userId: string): Promise<void> {
  await db().query('delete from auth.sessions where user_id = $1', [userId]);
  await db().query('update auth.refresh_tokens set revoked = true where user_id = $1::text', [
    userId,
  ]);
}
