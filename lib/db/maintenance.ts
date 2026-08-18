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
 * The declared slice (PRD §4.1.3 step 1, §4.1.6). accounts.slice exists
 * for exactly this write (§2.3) and no request-path UPDATE on accounts
 * exists; 2A's precedent is the same free-text column the schema
 * annotates "declared slice". Scoped to the single account id.
 */
export async function setAccountSlice(accountId: string, slice: string): Promise<void> {
  await db().query(
    'update public.accounts set slice = $2 where id = $1 and deleted_at is null',
    [accountId, slice],
  );
}

/**
 * The opening context (PRD §4.1.3 step 3). circles.opening_context exists
 * for this multi-select ("step 3 multi-select" in the 1A DDL) but
 * hc.create_circle — step 2's writer — is its only request-path writer,
 * and step 3 happens after step 2 by construction. The guard is in the
 * statement: only the founder's own circle, only while still in setup.
 */
export async function updateOpeningContext(
  accountId: string,
  circleId: string,
  context: string[],
): Promise<void> {
  await db().query(
    `update public.circles
        set opening_context = $3
      where id = $2 and created_by = $1 and state = 'setup'`,
    [accountId, circleId, context],
  );
}

export type InviteDescription = {
  state: 'pending' | 'used' | 'revoked' | 'expired';
  invite_id: string;
  circle_id: string;
  circle_name: string;
  inviter_name: string;
  invited_email: string;
  tier: 'family' | 'care_circle';
  subject_names: string[];
};

/**
 * The accept screen's pre-auth window (PRD §4.1.4 item 2: the screen
 * shows which circle, who invited them, which subjects and the ceiling
 * BEFORE asking for anything — necessarily before any session exists).
 * The DB deliberately gives invites zero request-path reads and 2A
 * shipped no describe definer, so this read rides the maintenance
 * boundary, keyed STRICTLY on the sha256 of the 32-byte token — the
 * capability the mail recipient already holds, disclosing only what
 * their invite email already said. Unknown token ⇒ null, one shape.
 */
export async function describeInviteByToken(token: string): Promise<InviteDescription | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await db().query(
    `select i.id, i.circle_id, i.invited_email::text as invited_email, i.tier::text as tier,
            i.expires_at, i.accepted_at, i.revoked_at,
            c.name as circle_name, a.display_name as inviter_name,
            coalesce((select array_agg(s.first_name order by s.first_name)
                        from public.subjects s where s.id = any(i.subject_ids)), '{}') as subject_names
       from public.invites i
       join public.circles c on c.id = i.circle_id
       join public.accounts a on a.id = i.invited_by
      where i.token_hash = extensions.digest($1, 'sha256')`,
    [token],
  );
  const row = r.rows[0];
  if (!row) return null;
  const state = row.accepted_at
    ? 'used'
    : row.revoked_at
      ? 'revoked'
      : new Date(row.expires_at).getTime() <= Date.now()
        ? 'expired'
        : 'pending';
  return {
    state,
    invite_id: row.id,
    circle_id: row.circle_id,
    circle_name: row.circle_name,
    inviter_name: row.inviter_name,
    invited_email: row.invited_email,
    tier: row.tier,
    subject_names: row.subject_names,
  };
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
