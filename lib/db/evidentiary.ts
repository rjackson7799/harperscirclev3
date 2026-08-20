import 'server-only';
import { Pool } from 'pg';

/**
 * The evidentiary boundary (4B B7; TSD §1.3 step 6, §2.8, §10.5) — ONE
 * named operation: the artifact_read access-log append.
 *
 * Why it exists: hc.log is deliberately hc_internal-only (the per-circle
 * hash chain is written by the definer family and nothing else), and 4A
 * M5 shipped the 'artifact_read' event type with NO definer — the write
 * path is the maintenance connection identity assuming hc_internal for
 * exactly one statement (`grant hc_internal to postgres` is 001's
 * documented exemption; the same identity the migration runner and the
 * 2A mirror triggers ride). The maintenance-module discipline applies
 * verbatim: no generic query surface, one parameterized statement, an
 * ESLint fence to lib/hc/**, and the actor's display name is read
 * inside the same transaction — nothing caller-spoofable.
 *
 * BAT-02's pin is untouched: lib/db/maintenance.ts still holds exactly
 * the two auth.* ops. This module is its own boundary with its own
 * fence, recorded as a 4B delta (ADR-0019) and a standing candidate for
 * a definer (hc.log_artifact_read) at the next DB-opening slice.
 *
 * The credential rides HC_MAINTENANCE_DB_URL once B8 flips HC_DB_URL to
 * hc_runtime (hc_runtime cannot reach hc.log — by design); until the
 * flip both names resolve to the same local URL.
 */

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let pool: Pool | undefined;

function db(): Pool {
  if (!pool) {
    const url =
      process.env.HC_MAINTENANCE_DB_URL ??
      process.env.HC_DB_URL ??
      (process.env.NODE_ENV === 'production' ? undefined : LOCAL_DEFAULT);
    if (!url) throw new Error('evidentiary boundary: HC_MAINTENANCE_DB_URL is not set');
    pool = new Pool({ connectionString: url, max: 3 });
  }
  return pool;
}

export type ArtifactReadEntry = {
  circleId: string;
  subjectId: string;
  arrivalId: string;
  actorAccountId: string;
};

/**
 * §1.3 step 6: the artifact_read entry, appended through hc.log so the
 * per-circle hash chain stays intact. The actor's display name comes
 * from the accounts row in the SAME transaction; a missing live account
 * refuses loudly — bytes never move without a real actor on the trail.
 */
export async function appendArtifactReadEntry(entry: ArtifactReadEntry): Promise<void> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query('set local role hc_internal');
    const actor = await client.query(
      'select display_name from public.accounts where id = $1 and deleted_at is null',
      [entry.actorAccountId],
    );
    const displayName = actor.rows[0]?.display_name as string | undefined;
    if (!displayName) {
      throw new Error('appendArtifactReadEntry: no live account for the reading actor');
    }
    await client.query(
      `select hc.log($1, 'artifact_read', $2,
                     p_actor_account_id => $3,
                     p_subject_id       => $4,
                     p_object_type      => 'arrival',
                     p_object_id        => $5)`,
      [entry.circleId, displayName, entry.actorAccountId, entry.subjectId, entry.arrivalId],
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
