// ============================================================================
// PRF-06 â€” the 1D entry gate (ADR-0006 F7/Q6, the quantitative round-6
// deferral bound): a 5,000-arrival realistic-fanout benchmark against the
// REAL schema and policies.
//
//   Bounds (p95, warm):
//     page-sized record queries        â‰¤  250 ms
//     search / count full scans        â‰¤ 2500 ms
//   Breach â‡’ the inline-friendly visible_at rewrite lands IN 1D.
//
// Shape (PRD Â§13.3 cap): one circle, 2 subjects, 7 members, 5,000
// arrivals fanning out to 2,500 documents (each with its dsc row and OCR
// text), 1,500 tasks, 1,000 timeline events; dense provenance (every task
// and event linked to 1â€“2 documents, taints transitively honest); two
// benchmark callers â€” mv (viewÃ—5: sees everything, worst-case result
// volume) and mx (manage on schedule+memories only: sees ~40%, worst-case
// scan-to-fill for page queries) â€” plus 50 object shares to mx.
//
// Fixture mechanics: rows insert under session_replication_role=replica
// (the deferred claim triggers are INSERT-only and would refuse an
// unclaimed commit); vectors are then built by the REAL 1D triggers via a
// no-op title UPDATE in normal mode, and OCR lands through the dsc
// builder the same way. Nothing here fakes a vector.
//
// Usage:
//   node scripts/bench/prf06.mjs setup            â†’ prints circle id
//   (docker restart supabase_db_â€¦ for the cold leg)
//   node scripts/bench/prf06.mjs cold  <circle>   â†’ 1 timed run per query
//   node scripts/bench/prf06.mjs warm  <circle>   â†’ 25 runs, p50/p95/p99
//   node scripts/bench/prf06.mjs cleanup <circle>
// ============================================================================

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

const DOMAINS = ['memories', 'health', 'schedule', 'documents', 'finances'];
const N_ARRIVALS = 5000;
const N_DOCS = 2500;
const N_TASKS = 1500;
const N_TL = 1000;
const WARM_RUNS = 25;

const mode = process.argv[2];
const argCircle = process.argv[3];

async function connect() {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

// --- setup -------------------------------------------------------------------

async function setup(db) {
  const t0 = Date.now();
  const ids = {
    c: randomUUID(), s1: randomUUID(), s2: randomUUID(),
    uv: randomUUID(), ux: randomUUID(),
    mv: randomUUID(), mx: randomUUID(),
  };

  await db.query('begin');
  await db.query(`set local session_replication_role = replica`);

  for (const u of [ids.uv, ids.ux]) {
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated',
               'authenticated', $2, 'x', now(), now(), now(), '{}', '{}')`,
      [u, u + '@bench.local']);
    await db.query(
      `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'Bench')`,
      [u]);
  }
  await db.query(
    `insert into public.circles (id, name, created_by) values ($1, 'PRF-06 bench', $2)`,
    [ids.c, ids.uv]);
  await db.query(
    `insert into public.subjects (id, circle_id, first_name, situation, postal_code,
                                  timezone, accent_color, forwarding_local_part)
     values ($1, $3, 'BenchOne', 'recovering', '02138', 'America/New_York', 'sage', $4),
            ($2, $3, 'BenchTwo', 'aging', '02139', 'America/New_York', 'clay', $5)`,
    [ids.s1, ids.s2, ids.c,
     'b1-' + ids.s1.slice(0, 8), 'b2-' + ids.s2.slice(0, 8)]);
  await db.query(
    `insert into public.circle_members (id, circle_id, account_id, tier, display_name_at_join)
     values ($1, $3, $4, 'family', 'ViewAll'), ($2, $3, $5, 'family', 'Partial')`,
    [ids.mv, ids.mx, ids.c, ids.uv, ids.ux]);
  // five bystander members for membership realism
  for (let i = 0; i < 5; i++) {
    const u = randomUUID();
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated',
               'authenticated', $2, 'x', now(), now(), now(), '{}', '{}')`,
      [u, u + '@bench.local']);
    await db.query(
      `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'By')`, [u]);
    await db.query(
      `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
       values ($1, $2, $3, 'By')`,
      [ids.c, u, i < 3 ? 'family' : 'care_circle']);
  }

  // grants: mv viewÃ—5 on both subjects; mx manage on schedule+memories only
  for (const s of [ids.s1, ids.s2]) {
    for (const d of DOMAINS) {
      await db.query(
        `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
         values ($1, $2, $3, $4, 'view', $5)`,
        [ids.c, ids.mv, s, d, ids.uv]);
      if (d === 'schedule' || d === 'memories') {
        await db.query(
          `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
           values ($1, $2, $3, $4, 'manage', $5)`,
          [ids.c, ids.mx, s, d, ids.uv]);
      }
    }
  }

  // 5,000 arrivals
  await db.query(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, received_at)
     select gen_random_uuid(), $1,
            case when i % 2 = 0 then $2::uuid else $3::uuid end,
            case when i % 3 = 0 then 'email' else 'upload' end,
            'stored', now() - (i || ' minutes')::interval
     from generate_series(1, ${N_ARRIVALS}) i`,
    [ids.c, ids.s1, ids.s2]);

  // 2,500 documents over the five domains; every 50th carries a selective token
  await db.query(
    `create temp table bench_docs as
     select gen_random_uuid() as id, i as n,
            (array['memories','health','schedule','documents','finances'])[(i % 5) + 1]::hc.domain as dom
     from generate_series(1, ${N_DOCS}) i`);
  await db.query(
    `insert into public.documents
       (id, circle_id, subject_id, title, category, summary_text, artifact_arrival_id,
        filed_at, approved_by, approved_at, approver_display_name, taint)
     select d.id, $1,
            case when d.n % 2 = 0 then $2::uuid else $3::uuid end,
            'volume document ' || d.n
              || case when d.n % 50 = 0 then ' raretoken' else '' end,
            case d.dom when 'finances' then 'financial'::hc.doc_category
                       when 'health' then 'medical' else 'legal' end,
            'Benchmark summary sentence ' || d.n || '.',
            a.id, now() - (d.n || ' minutes')::interval,
            $4, now(), 'Bench', array[d.dom]::hc.domain[]
     from bench_docs d
     join lateral (select id from public.arrivals where circle_id = $1 limit 1) a on true`,
    [ids.c, ids.s1, ids.s2, ids.uv]);

  // 1,500 tasks + 1,000 timeline events, each with 1â€“2 document parents;
  // taints are the honest transitive union
  await db.query(
    `create temp table bench_tasks as
     select gen_random_uuid() as id, i as n,
            (select array_agg(x) from (
               select d.id as x from bench_docs d
               where d.n = ((i * 2) % ${N_DOCS}) + 1 or (i % 3 = 0 and d.n = ((i * 5) % ${N_DOCS}) + 1)
             ) p) as parents
     from generate_series(1, ${N_TASKS}) i`);
  await db.query(
    `insert into public.tasks
       (id, circle_id, subject_id, title, detail, approved_by, approved_at,
        approver_display_name, taint)
     select t.id, $1,
            case when t.n % 2 = 0 then $2::uuid else $3::uuid end,
            'volume task ' || t.n, 'benchmark detail line ' || t.n,
            $4, now(), 'Bench',
            (select array_agg(distinct dd)::hc.domain[]
             from (select 'schedule'::hc.domain as dd
                   union
                   select d.dom from bench_docs d where d.id = any (t.parents)) u)
     from bench_tasks t`,
    [ids.c, ids.s1, ids.s2, ids.uv]);
  await db.query(
    `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
     select $1, 'task', t.id, 'document', p
     from bench_tasks t, unnest(t.parents) p`,
    [ids.c]);

  await db.query(
    `create temp table bench_tl as
     select gen_random_uuid() as id, i as n,
            (select d.id from bench_docs d where d.n = ((i * 7) % ${N_DOCS}) + 1) as parent,
            (select d.dom from bench_docs d where d.n = ((i * 7) % ${N_DOCS}) + 1) as pdom
     from generate_series(1, ${N_TL}) i`);
  await db.query(
    `insert into public.timeline_events
       (id, circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
        approved_by, approved_at, approver_display_name, taint)
     select e.id, $1,
            case when e.n % 2 = 0 then $2::uuid else $3::uuid end,
            'medical', 'volume event ' || e.n, '2026-08-01', 'America/New_York',
            $4, now(), 'Bench',
            (select array_agg(distinct dd)::hc.domain[]
             from (select 'health'::hc.domain as dd union select e.pdom) u)
     from bench_tl e`,
    [ids.c, ids.s1, ids.s2, ids.uv]);
  await db.query(
    `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
     select $1, 'timeline_event', e.id, 'document', e.parent from bench_tl e`,
    [ids.c]);

  // 50 shares to mx on health documents it cannot otherwise see
  await db.query(
    `insert into public.object_shares (circle_id, subject_id, object_type, object_id,
                                       member_id, granted_by)
     select $1, dd.subject_id, 'document', dd.id, $2, $3
     from (select d.id, doc.subject_id from bench_docs d
           join public.documents doc on doc.id = d.id
           where d.dom = 'health' limit 50) dd`,
    [ids.c, ids.mx, ids.uv]);

  await db.query(`set local session_replication_role = default`);

  // vectors: built by the REAL triggers (tsv + dsc sync + dsc builder)
  await db.query(`update public.documents set title = title where circle_id = $1`, [ids.c]);
  await db.query(`update public.tasks set title = title where circle_id = $1`, [ids.c]);
  await db.query(`update public.timeline_events set summary = summary where circle_id = $1`, [ids.c]);
  // OCR text through the builder (preserved caller-supplied column)
  await db.query(
    `update public.document_search_content sc
        set ocr_text = 'scanned page mentioning metoprolol dose ' || d.n
       from bench_docs d
      where d.id = sc.document_id and d.n % 10 = 0`);

  await db.query('commit');

  const counts = await db.query(
    `select (select count(*) from public.arrivals where circle_id = $1) arrivals,
            (select count(*) from public.documents where circle_id = $1) docs,
            (select count(*) from public.document_search_content where circle_id = $1) dsc,
            (select count(*) from public.tasks where circle_id = $1) tasks,
            (select count(*) from public.timeline_events where circle_id = $1) tl,
            (select count(*) from public.provenance_edges where circle_id = $1) edges,
            (select count(*) from public.object_shares where circle_id = $1) shares`,
    [ids.c]);
  console.log(`setup done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.table(counts.rows);
  console.log(`circle: ${ids.c}`);
  console.log(`callers: mv(viewÃ—5)=${ids.uv}  mx(schedule+memories)=${ids.ux}`);
  console.log(`\nnext: docker restart supabase_db_HarpersCirclev3, then:`);
  console.log(`  node scripts/bench/prf06.mjs cold ${ids.c}`);
  console.log(`  node scripts/bench/prf06.mjs warm ${ids.c}`);
}

// --- queries -----------------------------------------------------------------

function queries(circle) {
  const q72 = (term) => `
    with q as (select websearch_to_tsquery('english', '${term}') as tsq)
    select d.id,
           ts_headline('english',
             coalesce(sc.search_text_full, d.title || ' ' || coalesce(d.summary_text, '')),
             (select tsq from q)) as snippet,
           ts_rank(coalesce(sc.tsv_full, d.tsv_summary), (select tsq from q)) as rank
    from public.documents d
    left join public.document_search_content sc on sc.document_id = d.id
    where d.circle_id = '${circle}'
      and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q)
    order by rank desc limit 20`;
  const q72count = (term) => `
    with q as (select websearch_to_tsquery('english', '${term}') as tsq)
    select count(*)
    from public.documents d
    left join public.document_search_content sc on sc.document_id = d.id
    where d.circle_id = '${circle}'
      and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q)`;
  return [
    // page-sized (bound: p95 â‰¤ 250 ms)
    ['page_docs',      'page',   `select id, title, category, filed_at, subject_id
                                  from public.documents
                                  where circle_id = '${circle}' and deleted_at is null
                                  order by filed_at desc limit 20`],
    ['page_tasks',     'page',   `select id, title, status, due_on, subject_id
                                  from public.tasks
                                  where circle_id = '${circle}' and deleted_at is null
                                  order by approved_at desc limit 20`],
    ['page_timeline',  'page',   `select id, kind, summary, occurred_on, subject_id
                                  from public.timeline_events
                                  where circle_id = '${circle}' and deleted_at is null
                                  order by approved_at desc limit 20`],
    // full scans (bound: p95 â‰¤ 2500 ms)
    ['count_docs',     'scan',   `select count(*) from public.documents
                                  where circle_id = '${circle}' and deleted_at is null`],
    ['count_tasks',    'scan',   `select count(*) from public.tasks
                                  where circle_id = '${circle}' and deleted_at is null`],
    ['search_broad',   'scan',   q72('volume')],
    ['search_count',   'scan',   q72count('volume')],
    ['search_narrow',  'scan',   q72('raretoken')],
    ['search_ocr',     'scan',   q72('metoprolol')],
    ['search_tasks',   'scan',   `with q as (select websearch_to_tsquery('english', 'volume') as tsq)
                                  select id, title, ts_rank(tsv, (select tsq from q)) as rank
                                  from public.tasks
                                  where circle_id = '${circle}' and tsv @@ (select tsq from q)
                                  order by rank desc limit 20`],
  ];
}

async function callers(db, circle) {
  const r = await db.query(
    `select m.account_id, m.display_name_at_join
     from public.circle_members m
     where m.circle_id = $1 and m.display_name_at_join in ('ViewAll', 'Partial')`,
    [circle]);
  const mv = r.rows.find(x => x.display_name_at_join === 'ViewAll')?.account_id;
  const mx = r.rows.find(x => x.display_name_at_join === 'Partial')?.account_id;
  if (!mv || !mx) throw new Error('benchmark callers not found â€” run setup first');
  return { mv, mx };
}

async function timedRun(db, user, sql) {
  await db.query('begin');
  await db.query(`select set_config('request.jwt.claims',
    json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [user]);
  await db.query('set local role authenticated');
  const t0 = process.hrtime.bigint();
  const r = await db.query(sql);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  await db.query('rollback');
  return { ms, rows: r.rowCount ?? 0, val: r.rows?.[0]?.count };
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

async function bench(db, circle, runs, label) {
  const { mv, mx } = await callers(db, circle);
  const out = [];
  for (const [name, kind, sql] of queries(circle)) {
    for (const [cal, user] of [['mv', mv], ['mx', mx]]) {
      const times = [];
      let rows = 0, val;
      for (let i = 0; i < runs; i++) {
        const r = await timedRun(db, user, sql);
        times.push(r.ms); rows = r.rows; val = r.val;
      }
      times.sort((a, b) => a - b);
      const p50 = pct(times, 50), p95 = pct(times, 95), p99 = pct(times, 99);
      const bound = kind === 'page' ? 250 : 2500;
      const ok = p95 <= bound;
      out.push({
        query: name, caller: cal, kind,
        rows: val !== undefined ? Number(val) : rows,
        p50: +p50.toFixed(1), p95: +p95.toFixed(1), p99: +p99.toFixed(1),
        bound, verdict: ok ? 'PASS' : 'BREACH',
      });
    }
  }
  console.log(`\nPRF-06 ${label} (${runs} run${runs > 1 ? 's' : ''}/query/caller)`);
  console.table(out);
  const breaches = out.filter(x => x.verdict === 'BREACH');
  console.log(breaches.length === 0
    ? `\nPRF-06 ${label}: ALL BOUNDS MET`
    : `\nPRF-06 ${label}: ${breaches.length} BREACH(ES) â€” the inline-friendly visible_at rewrite is due in 1D`);
  return breaches.length;
}

async function cleanup(db, circle) {
  await db.query('begin');
  await db.query(`set local session_replication_role = replica`);
  for (const t of ['provenance_edges', 'object_shares', 'document_search_content',
                   'timeline_events', 'tasks', 'documents', 'arrival_events',
                   'pipeline_leases', 'arrivals', 'access_log', 'access_grants',
                   'freeze_claims', 'freezes', 'circle_members', 'subjects', 'invites']) {
    await db.query(`delete from public.${t} where circle_id = $1`, [circle]);
  }
  await db.query(`delete from public.circles where id = $1`, [circle]);
  await db.query('commit');
  console.log('benchmark circle removed');
}

// --- main --------------------------------------------------------------------

const db = await connect();
try {
  if (mode === 'setup') await setup(db);
  else if (mode === 'cold' && argCircle) process.exitCode = await bench(db, argCircle, 1, 'COLD (first run after restart)') ? 0 : 0;
  else if (mode === 'warm' && argCircle) process.exitCode = (await bench(db, argCircle, WARM_RUNS, 'WARM')) === 0 ? 0 : 1;
  else if (mode === 'cleanup' && argCircle) await cleanup(db, argCircle);
  else {
    console.log('usage: node scripts/bench/prf06.mjs setup | cold <circle> | warm <circle> | cleanup <circle>');
    process.exitCode = 2;
  }
} finally {
  await db.end();
}
