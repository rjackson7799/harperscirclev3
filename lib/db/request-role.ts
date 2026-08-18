import 'server-only';
import { Pool, type PoolClient, type QueryResult } from 'pg';

/**
 * The request-role server channel (TSD §1.2/§1.3; ADR-0013 F1).
 *
 * hc.* is deliberately not API-exposed — PIN-01 pins PostgREST to
 * [public, graphql_public] — so every hc call the app makes rides a direct
 * connection that ASSUMES a request role (anon | authenticated) for exactly
 * one transaction, with the caller's VERIFIED JWT claims in
 * request.jwt.claims. hc functions then evaluate exactly as they would
 * behind PostgREST: hc.uid() reads the claims, EXECUTE grants bind, RLS
 * binds. This is the channel ADR-0013 F1 anticipated ("server-side code
 * assuming request roles") and it is what makes the F1 throttle contract
 * implementable at the app boundary.
 *
 * Containment:
 *  - `set local role` + `set_config(..., is_local => true)` scope both the
 *    role and the claims to the transaction, so the pooled session leaves
 *    every call as the connection identity with no residue — success or
 *    throw. There is no code path that runs caller SQL outside the assumed
 *    role.
 *  - The closed role set is checked at runtime; nothing here can assume
 *    hc_internal, hc_admin, hc_pipeline or the connection identity.
 *  - Import is fenced by ESLint to lib/hc/** (the typed wrappers), so a
 *    surface never talks to this channel directly.
 *
 * The connection credential (HC_DB_URL) is the maintenance identity the
 *  migration runner and test harnesses already use; hosted it is the
 * project's direct/pooler URL. The credential's own authority is never
 * exposed through this module.
 */

export type RequestRole = 'anon' | 'authenticated';

/** Verified JWT payload — always the OUTPUT of signature verification,
 *  never request-supplied JSON. */
export type RequestClaims = {
  sub?: string;
  role?: string;
  email?: string;
  session_id?: string;
  aal?: string;
  amr?: { method: string; timestamp: number }[];
  [claim: string]: unknown;
};

export interface RequestRoleQuery {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
}

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const url =
      process.env.HC_DB_URL ??
      (process.env.NODE_ENV === 'production' ? undefined : LOCAL_DEFAULT);
    if (!url) {
      throw new Error('request-role channel: HC_DB_URL is not set');
    }
    pool = new Pool({ connectionString: url, max: 10 });
  }
  return pool;
}

export async function withRequestRole<T>(
  role: RequestRole,
  claims: RequestClaims | null,
  fn: (q: RequestRoleQuery) => Promise<T>,
): Promise<T> {
  if (role !== 'anon' && role !== 'authenticated') {
    throw new Error(`withRequestRole: not a request role: ${String(role)}`);
  }
  const client: PoolClient = await getPool().connect();
  try {
    await client.query('begin');
    // `role` is one of two literals from the check above — never input.
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      claims ? JSON.stringify(claims) : '',
    ]);
    const result = await fn({
      query: (text, params) => client.query(text, params),
    });
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
