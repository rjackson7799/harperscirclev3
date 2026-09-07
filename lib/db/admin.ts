import 'server-only';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAdminSession } from '@/lib/auth/admin-session';

export type AdminRead =
  | { kind: 'ok'; stats: Record<string, unknown> }
  | { kind: 'denied' | 'unavailable' };
let pool: Pool | undefined;

async function readPlatformStats(authClient: SupabaseClient): Promise<AdminRead> {
  const session = await readAdminSession(authClient);
  if (session.kind !== 'verified-session') return { kind: session.kind };
  let connection: PoolClient | undefined;
  let failed = false;
  try {
    if (!pool) {
      const connectionString = process.env.HC_ADMIN_DB_URL;
      if (!connectionString) return { kind: 'unavailable' };
      pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
    }
    connection = await pool.connect();
    await connection.query('begin');
    await connection.query('set local role hc_admin');
    await connection.query("set local statement_timeout = '10s'");
    await connection.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(session.identity)]);
    const result = await connection.query('select admin_ops.read_platform_stats($1) as result', [randomUUID()]);
    const answer = result.rows[0]?.result;
    // Never return a result whose audit commit failed or is indeterminate.
    await connection.query('commit');
    if (answer?.kind === 'ok' && answer.stats && typeof answer.stats === 'object' && !Array.isArray(answer.stats)) {
      return { kind: 'ok', stats: answer.stats };
    }
    return { kind: answer?.kind === 'denied' ? 'denied' : 'unavailable' };
  } catch {
    failed = true;
    if (connection) await connection.query('rollback').catch(() => {});
    return { kind: 'unavailable' };
  } finally {
    connection?.release(failed);
  }
}

/** No SQL strings or caller-supplied identity enter this factory's interface. */
export function asAdmin() {
  return { readPlatformStats };
}
