import 'server-only';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

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
 * The connection credential (HC_DB_URL) is the RUNTIME credential —
 * since B8, a login IN ROLE hc_runtime whose whole authority is
 * membership in anon + authenticated (locally the seed-provisioned
 * hc_runtime_login; hosted the deploy-provisioned login,
 * docs/ops/runtime-db-credentials.md). The request path's blast radius
 * is the enumerated surface; the maintenance credential lives behind
 * its own two-op module on HC_MAINTENANCE_DB_URL and never rides here.
 */

export type RequestRole = 'anon' | 'authenticated';

/** Verified JWT payload — always the OUTPUT of signature verification,
 *  never request-supplied JSON. Passed whole into request.jwt.claims so
 *  hc functions read exactly what PostgREST would have set (amr, aal and
 *  the rest ride along untyped). */
export type RequestClaims = {
  sub?: string;
  role?: string;
  email?: string;
  session_id?: string;
  aal?: string;
  [claim: string]: unknown;
};

/**
 * THE ROW BOUNDARY IS TYPED — 7B B1, OW-02 (ADR-0027 D17 item 2, F-4's larger
 * half). pg's `QueryResult<R = any>` made `rows: any[]`, which is the root of
 * round-16 R5/F-1 and of ADR-0028 D15 item 2's class: a `Date` that satisfied
 * a declared `string` because `any` satisfies everything, and broke the first
 * consumer that sliced it.
 *
 * The default row type is now `BoundaryRow` — every column `unknown` until
 * the caller SAYS what it is. A bare `received_at: row.received_at` in a
 * typed return no longer compiles; a wrapper names its row type
 * (`q.query<{ id: string; accepted_at: Date }>`) and crosses each temporal
 * column through the ONE named function (`lib/hc/rows.ts#isoText`), or reads a
 * single value with an explicit, single assertion. The double assertion
 * `as unknown as T` is the one escape a type cannot refuse; the boundary
 * scanner (`tests/lint/timestamp-boundary.test.ts`) forbids it in this layer.
 * `tests/db/request-role-rows.types.ts` is the type pin, run by `tsc`.
 */
export type BoundaryRow = Record<string, unknown>;

export interface RequestRoleQuery {
  query<R extends QueryResultRow = BoundaryRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
}

// The local default is the seed-provisioned runtime login (B8's flip):
// dev and the walkthrough run with production's blast-radius shape.
const LOCAL_DEFAULT = 'postgresql://hc_runtime_login:postgres@127.0.0.1:54342/postgres';

/**
 * THE CHANNEL’S TWO BOUNDS — round-18 F-1 (MAJOR), ADR-0027 D1.
 *
 * D20 bounded the artifact route at fifteen seconds and recorded the pool as
 * a LIMITATION: "the budget protects THE PERSON, not the pool." It is the
 * load-bearing half. A raced-out read keeps running and holds its connection;
 * this pool is process-wide and shared by every lib/hc wrapper — the inbox
 * list, the review screen, the decide route, senders, invites, throttle,
 * upload, step-up; and exactly ONE route in the repo has an answer budget. So
 * the hardened route stayed responsive by spending the resource every other
 * family surface blocks on, and `connect()` had NO connectionTimeoutMillis —
 * whose pg default is 0, which is not "a long time" but WAIT FOREVER. The
 * eleventh request, a member opening their Care Inbox, hung with no bound and
 * no named state: the F5/F6 mode reappearing wherever the budget is not.
 *
 * Both numbers are DERIVED from the answer budget, and
 * tests/db/request-role.test.ts asserts the derivation so neither can drift
 * into a magic number. They are spelled here rather than imported so the DB
 * layer keeps no dependency on the HTTP layer; the test imports both and is
 * where the two are tied together.
 */

/**
 * Five seconds — ROUTE_ANSWER_BUDGET_MS / 3. A connection wait at or above
 * the budget is dead weight: the budget would expire before the pool ever
 * answered, and the wait would bound nothing. A connection this pool cannot
 * hand over in five seconds is a pool under a systemic stall, and the honest
 * answer to the caller is a prompt, named failure rather than a hang.
 */
export const POOL_CONNECT_TIMEOUT_MS = 5_000;

/**
 * Thirty seconds — 2 × ROUTE_ANSWER_BUDGET_MS. This is what actually RETURNS
 * a leaked connection: the server kills the abandoned query instead of running
 * it to completion. Without it the connect bound only converts hanging forever
 * into failing forever.
 *
 * The value is derived from both ends. A query the route is STILL WAITING ON
 * must never be killed under it, so it sits strictly above the budget; and a
 * query still running at twice the budget has already blown a fifteen-second
 * guarantee twice over and is serving nobody.
 *
 * SET LOCAL, like the role and the claims: a bound that outlived its own
 * transaction would silently govern whatever ran next on that pooled session.
 */
export const REQUEST_ROLE_STATEMENT_TIMEOUT_MS = 30_000;

/** The pool’s options, exported so the bound is pinnable rather than buried
 *  in a constructor call. getPool() is BUILT from this. */
export function poolConfig(): { max: number; connectionTimeoutMillis: number } {
  return { max: 10, connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS };
}

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const url =
      process.env.HC_DB_URL ??
      (process.env.NODE_ENV === 'production' ? undefined : LOCAL_DEFAULT);
    if (!url) {
      throw new Error('request-role channel: HC_DB_URL is not set');
    }
    pool = new Pool({ connectionString: url, ...poolConfig() });
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
    // Round-18 F-1: the server-side half of the bound, set BEFORE the role
    // switch so it is established by the connection identity, and SET LOCAL so
    // it dies with the transaction. This is what returns a connection whose
    // caller has already given up — the answer budget deliberately does not
    // cancel the work it races.
    await client.query(`set local statement_timeout = ${REQUEST_ROLE_STATEMENT_TIMEOUT_MS}`);
    // `role` is one of two literals from the check above — never input.
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      claims ? JSON.stringify(claims) : '',
    ]);
    const result = await fn({
      query: <R extends QueryResultRow = BoundaryRow>(text: string, params?: unknown[]) =>
        client.query<R>(text, params),
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
