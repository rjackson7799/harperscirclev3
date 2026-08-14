// STEP 2 SPIKE — claims 3 (trigger lock ordering) and 10 (advisory lock +
// set_config under transaction pooling), plus the EXPLAIN capture for the ADR.
// THROWAWAY — deleted after evidence is classified (ADR-0002).
//
// Run with the spike migration applied: node scripts/spike/multi-session.mjs
import pg from 'pg';
import { supabaseEnv, report } from './env.mjs';

const env = supabaseEnv();
const DB_URL = env.DB_URL;
// Local Supavisor transaction-mode pooler (config.toml [db.pooler]).
// Supavisor usernames are tenant-qualified; the local CLI registers the
// tenant as 'pooler-dev' (select external_id from _supavisor.tenants).
const POOLER_URL =
  env.POOLER_URL ??
  'postgresql://postgres.pooler-dev:postgres@127.0.0.1:54349/postgres';

const D1 = '00000000-0000-0000-0000-00000000d001';

const connect = async (url) => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
};

// ---------------------------------------------------------------------------
// Claim 3 — cross-table search trigger lock ordering
// ---------------------------------------------------------------------------
async function claim3() {
  // Scenario 0: two single-statement writers, opposite tables. Blocking is
  // expected; deadlock is not — each statement acquires its locks and ends.
  {
    const a = await connect(DB_URL);
    const b = await connect(DB_URL);
    try {
      const ra = a.query(
        `update spike.documents set title = 'Discharge summary' where id = $1`, [D1]);
      const rb = b.query(
        `update spike.doc_search set extracted_text = 'metoprolol 25mg twice daily'
         where document_id = $1`, [D1]);
      await Promise.all([ra, rb]);
      report(3, 'scenario 0: concurrent single-statement writers', true, 'no deadlock');
    } catch (e) {
      report(3, 'scenario 0: concurrent single-statement writers', false, e.message);
    } finally {
      await a.end(); await b.end();
    }
  }

  // Scenario 1: opposite lock orders across open transactions.
  //   B: lock doc_search row (its trigger only READS documents — no lock)
  //   A: lock documents row, trigger UPDATE doc_search -> blocks on B
  //   B: update documents -> needs A's lock -> cycle. Expect 40P01.
  {
    const a = await connect(DB_URL);
    const b = await connect(DB_URL);
    let deadlock = null;
    try {
      await b.query('begin');
      await b.query(
        `update spike.doc_search set extracted_text = 'x1' where document_id = $1`, [D1]);
      await a.query('begin');
      const aPromise = a
        .query(`update spike.documents set title = 't1' where id = $1`, [D1])
        .catch((e) => e);
      await new Promise((r) => setTimeout(r, 300)); // let A block on B
      const bResult = await b
        .query(`update spike.documents set summary_text = 's1' where id = $1`, [D1])
        .catch((e) => e);
      const aResult = await aPromise;
      deadlock = [aResult, bResult].find((r) => r?.code === '40P01') ?? null;
      report(3, 'scenario 1: opposite lock orders deadlock as predicted',
        deadlock !== null,
        deadlock ? `40P01 on ${deadlock === aResult ? 'A' : 'B'}` : 'no deadlock observed');
    } finally {
      await a.query('rollback').catch(() => {});
      await b.query('rollback').catch(() => {});
      await a.end(); await b.end();
    }
  }

  // Scenario 2: the ordering rule — every multi-statement writer touches
  // documents BEFORE doc_search. Same concurrency, no cycle.
  {
    const a = await connect(DB_URL);
    const b = await connect(DB_URL);
    try {
      await b.query('begin');
      await b.query(
        `update spike.documents set summary_text = 's2' where id = $1`, [D1]);
      await a.query('begin');
      const aPromise = a
        .query(`update spike.documents set title = 't2' where id = $1`, [D1])
        .catch((e) => e);
      await new Promise((r) => setTimeout(r, 300));
      await b.query(
        `update spike.doc_search set extracted_text = 'x2' where document_id = $1`, [D1]);
      await b.query('commit');
      const aResult = await aPromise;
      const ok = !(aResult instanceof Error);
      await a.query('commit').catch(() => {});
      report(3, 'scenario 2: documents-first ordering serialises cleanly', ok,
        ok ? 'A waited, then committed' : aResult.message);
    } finally {
      await a.end(); await b.end();
    }
  }
}

// ---------------------------------------------------------------------------
// Claim 10 — pg_advisory_xact_lock + set_config(..., true) through Supavisor
// transaction pooling
// ---------------------------------------------------------------------------
async function claim10() {
  let c1, c2;
  try {
    c1 = await connect(POOLER_URL);
    c2 = await connect(POOLER_URL);
  } catch (e) {
    report(10, 'pooler reachable', false, `${POOLER_URL} :: ${e.message}`);
    return;
  }

  try {
    // Advisory lock is transaction-scoped and visible across pooled clients.
    await c1.query('begin');
    await c1.query('select pg_advisory_xact_lock(424242)');
    const blocked = await c2.query(
      'select pg_try_advisory_xact_lock(424242) as got');
    report(10, 'xact advisory lock blocks a second pooled session',
      blocked.rows[0].got === false);
    await c1.query('commit');
    await c2.query('begin');
    const freed = await c2.query(
      'select pg_try_advisory_xact_lock(424242) as got');
    report(10, 'xact advisory lock releases at commit — no session affinity needed',
      freed.rows[0].got === true);
    await c2.query('rollback');

    // set_config(..., is_local => true) stays inside its transaction.
    await c1.query('begin');
    await c1.query(`select set_config('hc.spike_marker', 'present', true)`);
    const inside = await c1.query(
      `select current_setting('hc.spike_marker', true) as v`);
    await c1.query('commit');
    let leaked = false;
    for (let i = 0; i < 5; i++) {
      const r1 = await c1.query(
        `select current_setting('hc.spike_marker', true) as v`);
      const r2 = await c2.query(
        `select current_setting('hc.spike_marker', true) as v`);
      if (r1.rows[0].v === 'present' || r2.rows[0].v === 'present') leaked = true;
    }
    report(10, 'set_config is_local=true visible inside its transaction',
      inside.rows[0].v === 'present');
    report(10, 'set_config is_local=true leaks to NO later pooled transaction',
      !leaked);

    // The hazard the TSD designs around: SET ROLE has no transaction to live in.
    await c1.query('set role authenticated').catch(() => {});
    const who = await c1.query('select current_user as u');
    report(10, `SET ROLE across pooled statements observed as current_user=${who.rows[0].u}`,
      null, 'own-credential connections (TSD §1.9) avoid relying on this either way');
    await c1.query('reset role').catch(() => {});
  } finally {
    await c1.end().catch(() => {});
    await c2.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// EXPLAIN capture for the ADR — the §7.2 join under RLS as authenticated
// ---------------------------------------------------------------------------
async function explainCapture() {
  const c = await connect(DB_URL);
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true)`);
    await c.query('set local role authenticated');
    const plan = await c.query(`explain (costs off)
      select d.id
      from spike.documents d
      left join spike.doc_search sc on sc.document_id = d.id
      where d.circle_id = '00000000-0000-0000-0000-0000000c1a01'
        and coalesce(sc.tsv_full, d.tsv_summary)
            @@ websearch_to_tsquery('english', 'discharge')`);
    await c.query('rollback');
    console.log('\n--- EXPLAIN (RLS as authenticated, §7.2 join) ---');
    for (const row of plan.rows) console.log(row['QUERY PLAN']);
    console.log('--- end EXPLAIN ---\n');
  } finally {
    await c.end();
  }
}

const versions = await (async () => {
  const c = await connect(DB_URL);
  const v = await c.query('show server_version');
  await c.end();
  return v.rows[0].server_version;
})();
console.log(`postgres ${versions} · DB ${DB_URL.replace(/:[^:@]+@/, ':***@')} · pooler ${POOLER_URL.replace(/:[^:@]+@/, ':***@')}`);

await claim3();
await claim10();
await explainCapture();
console.log('multi-session spike complete');
