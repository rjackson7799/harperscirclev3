import 'server-only';
import { Pool, type PoolClient, type QueryResult } from 'pg';

/**
 * Shared machinery for the two direct-connection role factories (asAdmin,
 * asPipeline — TSD §1.2, §1.9). hc_admin and hc_pipeline are NOLOGIN by
 * design (1A), so each factory connects with a deploy-provided credential
 * and pins EVERY session to its role before any caller SQL runs. The trust
 * boundary is the role's privileges (and their absence), never the
 * credential: even on the local maintenance URL, nothing outside the role's
 * reach is reachable through a factory.
 */

export interface RoleDb {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  /** Multi-statement work on one pinned session (worker drains). */
  withSession<T>(fn: (q: RoleDb) => Promise<T>): Promise<T>;
}

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

export function makeRoleFactory(role: 'hc_admin' | 'hc_pipeline', envVar: string): () => RoleDb {
  let pool: Pool | undefined;

  function getPool(): Pool {
    if (!pool) {
      const url =
        process.env[envVar] ??
        (process.env.NODE_ENV === 'production' ? undefined : LOCAL_DEFAULT);
      if (!url) throw new Error(`${role} factory: ${envVar} is not set`);
      pool = new Pool({ connectionString: url, max: 5 });
    }
    return pool;
  }

  async function withPinnedSession<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
      // `role` is a module-fixed literal, never input.
      await client.query(`set role ${role}`);
      return await fn(client);
    } finally {
      await client.query('reset role').catch(() => {});
      client.release();
    }
  }

  return () => ({
    query: (text, params) => withPinnedSession((c) => c.query(text, params)),
    withSession: (fn) =>
      withPinnedSession((c) =>
        fn({
          query: (text, params) => c.query(text, params),
          withSession: () => {
            throw new Error('withSession: already inside a pinned session');
          },
        }),
      ),
  });
}
