// ============================================================================
// test:concurrency — the two-session layer (1B U10).
//
//   Case 1  PLT-02 repro: raw opposite-order row locks deadlock,
//           deterministically, under session barriers (×3, exactly one
//           40P01 each round).
//   Case 2  PLT-02 rule: the same contention through hc.approve_proposal()
//           serializes on the per-circle advisory lock (documents-first
//           order behind it) — ×10, zero deadlocks, both objects land.
//   Case 3  Growth-vs-shrink serialization (§2.6): a reclassify holding
//           the advisory lock blocks link_provenance until commit
//           (asserted from pg_locks), and the interleaved result equals
//           the serial one. Failure atomicity: an aborted link leaves no
//           partial edge.
//   Case 4  RLS-08: a revoked member's live session gets zero rows on its
//           NEXT query — same connection, no re-login.
//   Case 5  Round-6 R-rule: a freeze committing while an approval waits on
//           the per-circle lock DEFEATS the approval (freeze_active).
//   Case 6  A grant revocation committing while an approval waits defeats
//           it (authorization evaluates ctx UNDER the lock).
//   Case 7  A membership removal committing while an approval waits
//           defeats it.
//   Case 8  Taint growth racing a revision: authorization binds to the
//           version the write touches — stale-taint edit refused.
//   Case 9  The shrink path re-authorizes under the lock: a schedule-only
//           actor is refused once the taint grew.
//   Case 10 A freeze committing while a revision waits defeats it.
//
// Mechanics (session-plan pinned): two pg Clients per case; barriers are
// awaited statement completions; intended blocking is CONFIRMED from
// pg_locks (100 ms poll, 5 s bound) before release; per-case timeout 15 s;
// failure signatures distinguished by SQLSTATE (40P01 vs timeout vs
// assertion); fixtures use fresh uuids per run, are written as postgres
// under session_replication_role=replica (triggers off for setup ONLY),
// and each case cleans its circle graph afterwards in FK order.
// ============================================================================

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

const CASE_TIMEOUT_MS = 15_000;
const DOMAINS = ['memories', 'health', 'schedule', 'documents', 'finances'];

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok' : 'NOT OK'} - ${name}${ok || !detail ? '' : `  [${detail}]`}`);
}

async function connect() {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`case timeout (15 s): ${label}`)), CASE_TIMEOUT_MS)),
  ]);
}

async function waitForLockWait(admin, pid, label) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const r = await admin.query(
      `select count(*)::int as n from pg_locks where pid = $1 and not granted`, [pid]);
    if (r.rows[0].n > 0) return;
    if (Date.now() > deadline) throw new Error(`never blocked: ${label}`);
    await new Promise(res => setTimeout(res, 100));
  }
}

// --- fixtures -----------------------------------------------------------------

async function mkCircle(admin, tag) {
  const ids = {
    u1: randomUUID(), u2: randomUUID(),
    c: null, s: null, m1: null, m2: null,
    a: randomUUID(), doc: randomUUID(), task: randomUUID(),
  };
  await admin.query(`set session_replication_role = replica`);
  await admin.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated',
             $2, 'x', now(), now(), now(), '{}', '{}'),
            ('00000000-0000-0000-0000-000000000000', $3::uuid, 'authenticated', 'authenticated',
             $4, 'x', now(), now(), now(), '{}', '{}')`,
    [ids.u1, `${ids.u1}@fixture.local`, ids.u2, `${ids.u2}@fixture.local`]);
  await admin.query(
    `insert into public.accounts (id, kind, display_name)
     values ($1, 'member', 'Sarah'), ($2, 'member', 'Priya')`, [ids.u1, ids.u2]);
  const c = await admin.query(
    `insert into public.circles (name, created_by) values ($1, $2) returning id`,
    [`concurrency ${tag}`, ids.u1]);
  ids.c = c.rows[0].id;
  const s = await admin.query(
    `insert into public.subjects (circle_id, first_name, situation, postal_code,
       timezone, accent_color, forwarding_local_part)
     values ($1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage', $2)
     returning id`,
    [ids.c, `cc-${String(ids.c).slice(0, 8)}-${tag}`]);
  ids.s = s.rows[0].id;
  const m1 = await admin.query(
    `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
     values ($1, $2, 'coordinator', 'Sarah') returning id`, [ids.c, ids.u1]);
  ids.m1 = m1.rows[0].id;
  const m2 = await admin.query(
    `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
     values ($1, $2, 'family', 'Priya') returning id`, [ids.c, ids.u2]);
  ids.m2 = m2.rows[0].id;
  for (const u of [ids.m1, ids.m2]) {
    for (const d of DOMAINS) {
      await admin.query(
        `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
         values ($1, $2, $3, $4, 'manage', $5)`, [ids.c, u, ids.s, d, ids.u1]);
    }
  }
  await admin.query(
    `insert into public.arrivals (id, circle_id, subject_id, channel)
     values ($1, $2, $3, 'upload')`, [ids.a, ids.c, ids.s]);
  await admin.query(
    `insert into public.documents (id, circle_id, subject_id, title, category,
       artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'Invoice', 'financial', $4, now(), $5, now(), 'Sarah', '{finances}')`,
    [ids.doc, ids.c, ids.s, ids.a, ids.u1]);
  await admin.query(
    `insert into public.tasks (id, circle_id, subject_id, title,
       approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'Baseline task', $4, now(), 'Sarah', '{schedule}')`,
    [ids.task, ids.c, ids.s, ids.u1]);
  await admin.query(`set session_replication_role = default`);
  return ids;
}

async function cleanupCircle(admin, c) {
  await admin.query(`set session_replication_role = replica`);
  const del = [
    `delete from public.access_log where circle_id = $1`,
    `delete from public.approval_attempts where proposal_id in
       (select id from public.proposals where circle_id = $1)`,
    `delete from public.proposal_commits where circle_id = $1`,
    `delete from public.provenance_edges where circle_id = $1`,
    `delete from public.record_revisions where circle_id = $1`,
    `delete from public.object_shares where circle_id = $1`,
    `delete from public.document_search_content where circle_id = $1`,
    `delete from public.timeline_events where circle_id = $1`,
    `delete from public.profile_facts where circle_id = $1`,
    `delete from public.episodes where circle_id = $1`,
    `delete from public.tasks where circle_id = $1`,
    `delete from public.documents where circle_id = $1`,
    `delete from public.proposals where circle_id = $1`,
    `delete from public.arrivals where circle_id = $1`,
    `delete from public.freeze_claims where circle_id = $1`,
    `delete from public.freezes where circle_id = $1`,
    `delete from public.access_grants where circle_id = $1`,
    `delete from public.circle_members where circle_id = $1`,
    `delete from public.subjects where circle_id = $1`,
    `delete from public.circles where id = $1`,
  ];
  for (const q of del) await admin.query(q, [c]);
  await admin.query(`set session_replication_role = default`);
}

async function asUser(client, userId) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  await client.query(`set role authenticated`);
}

// --- case 1: PLT-02 repro ----------------------------------------------------

async function case1(admin) {
  const fx = await mkCircle(admin, 'c1');
  try {
    for (let round = 1; round <= 3; round++) {
      const s1 = await connect();
      const s2 = await connect();
      try {
        await s1.query('begin');
        await s2.query('begin');
        await s1.query(`select id from public.documents where id = $1 for update`, [fx.doc]);
        await s2.query(`select id from public.tasks where id = $1 for update`, [fx.task]);
        // barrier reached: each session holds its first lock.
        const p1 = s1.query(`select id from public.tasks where id = $1 for update`, [fx.task])
          .then(() => null).catch(e => e);
        const pid1 = (await admin.query(
          `select pid from pg_stat_activity
           where query like 'select id from public.tasks%for update' and state = 'active'
           order by query_start desc limit 1`)).rows[0]?.pid;
        if (pid1) await waitForLockWait(admin, pid1, 's1 waiting on tasks');
        const p2 = s2.query(`select id from public.documents where id = $1 for update`, [fx.doc])
          .then(() => null).catch(e => e);
        const [e1, e2] = await withTimeout(Promise.all([p1, p2]), `case1 round ${round}`);
        const codes = [e1, e2].filter(Boolean).map(e => e.code);
        check(`case1 round ${round}: opposite-order raw locks deadlock — exactly one 40P01`,
          codes.length === 1 && codes[0] === '40P01',
          `codes=${JSON.stringify(codes)}`);
      } finally {
        await s1.query('rollback').catch(() => {});
        await s2.query('rollback').catch(() => {});
        await s1.end();
        await s2.end();
      }
    }
  } finally {
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 2: PLT-02 rule -----------------------------------------------------

async function case2(admin) {
  const fx = await mkCircle(admin, 'c2');
  try {
    for (let round = 1; round <= 10; round++) {
      const pA = randomUUID();
      const pB = randomUUID();
      await admin.query(`set session_replication_role = replica`);
      await admin.query(
        `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint)
         values ($1, $2, $3, $4, 'task',
                 jsonb_build_object('title', 'A' || $5::text, 'parents',
                   jsonb_build_array(jsonb_build_object('type', 'document', 'id', $6::uuid))),
                 '{schedule,finances}'),
                ($7, $2, $3, $4, 'task',
                 jsonb_build_object('title', 'B' || $5::text, 'parents',
                   jsonb_build_array(jsonb_build_object('type', 'document', 'id', $6::uuid))),
                 '{schedule,finances}')`,
        [pA, fx.a, fx.c, fx.s, String(round), fx.doc, pB]);
      await admin.query(`set session_replication_role = default`);

      const s1 = await connect();
      const s2 = await connect();
      try {
        await asUser(s1, fx.u1);
        await asUser(s2, fx.u2);
        const r = await withTimeout(Promise.all([
          s1.query(`select hc.approve_proposal($1, 1, $2)`, [pA, `k-${pA}`])
            .then(() => null).catch(e => e),
          s2.query(`select hc.approve_proposal($1, 1, $2)`, [pB, `k-${pB}`])
            .then(() => null).catch(e => e),
        ]), `case2 round ${round}`);
        const errs = r.filter(Boolean);
        const n = await admin.query(
          `select count(*)::int as n from public.proposal_commits where proposal_id in ($1, $2)`,
          [pA, pB]);
        check(`case2 round ${round}: concurrent approvals sharing a parent serialize — no 40P01, both commit`,
          errs.length === 0 && n.rows[0].n === 2,
          `errs=${JSON.stringify(errs.map(e => e.code + ':' + e.message))} commits=${n.rows[0].n}`);
      } finally {
        await s1.end();
        await s2.end();
      }
    }
  } finally {
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 3: growth vs shrink under the advisory lock ------------------------

async function case3(admin) {
  const fx = await mkCircle(admin, 'c3');
  try {
    const s1 = await connect();
    const s2 = await connect();
    try {
      // taskX draws from doc (finances); doc will be reclassified while a
      // concurrent link tries to grow from it.
      const taskX = randomUUID();
      await admin.query(`set session_replication_role = replica`);
      await admin.query(
        `insert into public.tasks (id, circle_id, subject_id, title,
           approved_by, approved_at, approver_display_name, taint)
         values ($1, $2, $3, 'Concurrent child', $4, now(), 'Sarah', '{schedule}')`,
        [taskX, fx.c, fx.s, fx.u1]);
      await admin.query(`set session_replication_role = default`);

      // S1: open transaction, reclassify the doc (category already moved) —
      // holds the per-circle advisory lock until commit.
      await s1.query(`update public.documents set category = 'legal' where id = $1`, [fx.doc]);
      await s1.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: fx.u1, role: 'authenticated' })]);
      await s1.query('begin');
      await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

      // S2: link_provenance must BLOCK on the advisory lock.
      const p2 = s2.query(`select hc.link_provenance('task', $1, 'document', $2)`,
        [taskX, fx.doc]).then(() => null).catch(e => e);
      const pid2 = (await admin.query(
        `select pid from pg_stat_activity
         where query like 'select hc.link_provenance%' and state = 'active'
         order by query_start desc limit 1`)).rows[0]?.pid;
      let blocked = false;
      if (pid2) {
        await waitForLockWait(admin, pid2, 's2 waiting on the taint advisory lock');
        blocked = true;
      }
      check('case3: link_provenance blocks on the per-circle taint lock while a shrink holds it',
        blocked, 'pg_locks never showed the wait');

      await s1.query('commit');
      const e2 = await withTimeout(p2, 'case3 link after commit');
      const t = await admin.query(`select taint::text from public.tasks where id = $1`, [taskX]);
      check('case3: the serialized interleaving equals the serial result — the child carries the RECLASSIFIED taint',
        e2 === null && t.rows[0].taint === '{schedule,documents}',
        `err=${e2?.message ?? 'none'} taint=${t.rows[0].taint}`);

      // failure atomicity: an aborted link leaves no partial edge.
      const ghost = randomUUID();
      const e3 = await s2.query(
        `select hc.link_provenance('task', $1, 'document', $2)`, [taskX, ghost])
        .then(() => null).catch(e => e);
      const edges = await admin.query(
        `select count(*)::int as n from public.provenance_edges
         where child_id = $1 and parent_id = $2`, [taskX, ghost]);
      check('case3: a refused link writes NOTHING — failure atomicity',
        e3 !== null && e3.code === 'P0001' && edges.rows[0].n === 0,
        `err=${e3?.code} edges=${edges.rows[0].n}`);
    } finally {
      await s1.query('rollback').catch(() => {});
      await s1.end();
      await s2.end();
    }
  } finally {
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 4: RLS-08 ----------------------------------------------------------

async function case4(admin) {
  const fx = await mkCircle(admin, 'c4');
  const sA = await connect();
  try {
    await asUser(sA, fx.u2);
    const before = await sA.query(
      `select count(*)::int as n from public.documents where circle_id = $1`, [fx.c]);
    check('case4: the live member reads the record', before.rows[0].n === 1,
      `rows=${before.rows[0].n}`);

    await admin.query(
      `update public.circle_members set removed_at = now(), removed_by = $2
       where id = $1`, [fx.m2, fx.u1]);

    const after = await sA.query(
      `select count(*)::int as n from public.documents where circle_id = $1`, [fx.c]);
    check(`case4 (RLS-08): the revoked member's NEXT query on the SAME connection returns zero rows`,
      after.rows[0].n === 0, `rows=${after.rows[0].n}`);
  } finally {
    await sA.end();
    await cleanupCircle(admin, fx.c);
  }
}

// Claims only, NO role switch — for owner-only definers called as postgres
// with an authenticated identity (the case-3 pattern; PLT-04 discipline).
async function withClaims(client, userId) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })]);
}

// The fired query may not have reached pg_stat_activity yet when we look
// for it — poll for the backend before polling for its lock wait.
async function findActivePid(admin, likePattern, label) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const r = await admin.query(
      `select pid from pg_stat_activity
       where query like $1 and state = 'active'
       order by query_start desc limit 1`, [likePattern]);
    if (r.rows[0]?.pid) return r.rows[0].pid;
    if (Date.now() > deadline) throw new Error(`backend never appeared: ${label}`);
    await new Promise(res => setTimeout(res, 50));
  }
}

// --- case 5: a freeze racing an in-flight approval (round-6 F1) --------------
//
// The serialization rule (ADR-0006 R-rule): security-state transitions and
// record writers serialize on the per-circle lock; a transition that commits
// while a writer waits on the lock DEFEATS the writer. Here the approval is
// already past its old pre-lock freeze check when the freeze commits — the
// fixed function re-checks under the lock and refuses.

async function case5(admin) {
  const fx = await mkCircle(admin, 'c5');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const pA = randomUUID();
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint)
       values ($1, $2, $3, $4, 'task', jsonb_build_object('title', 'Race the freeze'), '{schedule}')`,
      [pA, fx.a, fx.c, fx.s]);
    await admin.query(`set session_replication_role = default`);

    // S1 holds the per-circle lock in an open transaction.
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    // S2's approval blocks on the lock…
    await asUser(s2, fx.u2);
    const p2 = s2.query(`select hc.approve_proposal($1, 1, $2)`, [pA, `k-${pA}`])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.approve_proposal%', 'approval backend');
    await waitForLockWait(admin, pid2, 's2 approval on the circle lock');
    const blocked = true;
    check('case5: the approval blocks on the per-circle lock', blocked,
      'pg_locks never showed the wait');

    // …a freeze commits mid-flight…
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);

    // …and when the lock releases, the approval must SEE it.
    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case5 approval after freeze');
    const n = await admin.query(
      `select count(*)::int as n from public.proposal_commits where proposal_id = $1`, [pA]);
    check('case5: a freeze committed while the approval waited DEFEATS it (freeze_active, nothing written)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'freeze_active' && n.rows[0].n === 0,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} commits=${n.rows[0].n}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 6: grant revocation racing an in-flight approval -------------------
// Confirmation, not a fix: authorization already evaluates ctx() UNDER the
// lock, so a revocation committed while the approval waits is honoured.

async function case6(admin) {
  const fx = await mkCircle(admin, 'c6');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const pA = randomUUID();
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint)
       values ($1, $2, $3, $4, 'task', jsonb_build_object('title', 'Race the revocation'), '{schedule}')`,
      [pA, fx.a, fx.c, fx.s]);
    await admin.query(`set session_replication_role = default`);

    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    await asUser(s2, fx.u2);
    const p2 = s2.query(`select hc.approve_proposal($1, 1, $2)`, [pA, `k-${pA}`])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.approve_proposal%', 'approval backend');
    await waitForLockWait(admin, pid2, 's2 approval on the circle lock');

    await admin.query(`delete from public.access_grants where member_id = $1`, [fx.m2]);

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case6 approval after revocation');
    check('case6: a grant revocation committed while the approval waited DEFEATS it (approval_refused)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'approval_refused',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 7: membership removal racing an in-flight approval -----------------
// Confirmation: removed_at filters ctx() at its (post-lock) evaluation.

async function case7(admin) {
  const fx = await mkCircle(admin, 'c7');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const pA = randomUUID();
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint)
       values ($1, $2, $3, $4, 'task', jsonb_build_object('title', 'Race the removal'), '{schedule}')`,
      [pA, fx.a, fx.c, fx.s]);
    await admin.query(`set session_replication_role = default`);

    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    await asUser(s2, fx.u2);
    const p2 = s2.query(`select hc.approve_proposal($1, 1, $2)`, [pA, `k-${pA}`])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.approve_proposal%', 'approval backend');
    await waitForLockWait(admin, pid2, 's2 approval on the circle lock');

    await admin.query(
      `update public.circle_members set removed_at = now(), removed_by = $2 where id = $1`,
      [fx.m2, fx.u1]);

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case7 approval after removal');
    check('case7: a membership removal committed while the approval waited DEFEATS it (approval_refused)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'approval_refused',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 8: taint growth racing a revision (round-6 F1, the revise defect) --
// The old revise_object authorized on an UNLOCKED read, then locked the row:
// it could observe two versions of its object in one transaction and write
// under stale-taint authorization. Fixed: per-circle lock, re-read, THEN
// authorize — the schedule-only editor is refused once finances arrives.

async function case8(admin) {
  const fx = await mkCircle(admin, 'c8');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // u2 manages SCHEDULE only.
    await admin.query(
      `delete from public.access_grants where member_id = $1 and domain <> 'schedule'`,
      [fx.m2]);

    // S1: open transaction grows the task's taint from the finances parent.
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.link_provenance('task', $1, 'document', $2)`,
      [fx.task, fx.doc]);

    // S2: the schedule-only editor revises the task — must block, re-read,
    // and refuse against the GROWN taint.
    await asUser(s2, fx.u2);
    const p2 = s2.query(`select hc.revise_object('task', $1, '{"title": "stale edit"}')`,
      [fx.task]).then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.revise_object%', 'revision backend');
    await waitForLockWait(admin, pid2, 's2 revision behind the growth');
    const blocked = true;
    check('case8: the revision blocks behind the in-flight growth', blocked,
      'pg_locks never showed the wait');

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case8 revision after growth');
    const t = await admin.query(`select title from public.tasks where id = $1`, [fx.task]);
    check('case8: authorization binds to the version the write would touch — stale-taint edit refused, row unchanged',
      e2 !== null && e2.code === 'P0001' && e2.message === 'revise_refused'
        && t.rows[0].title === 'Baseline task',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} title=${t.rows[0].title}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 9: the shrink path authorizes UNDER the lock (round-6 F1) ----------
// reclassify_taint checked manage-on-current-taint before acquiring the
// lock; a growth committing while it waited left the check bound to the
// narrower taint. Fixed: re-read and authorize under the lock.

async function case9(admin) {
  const fx = await mkCircle(admin, 'c9');
  const s1 = await connect();
  const s2 = await connect();
  try {
    await admin.query(
      `delete from public.access_grants where member_id = $1 and domain <> 'schedule'`,
      [fx.m2]);

    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.link_provenance('task', $1, 'document', $2)`,
      [fx.task, fx.doc]);

    // S2: schedule-only actor reclassifies the task (owner-only definer,
    // claims-only session). Pre-fix: auth passed on {schedule}, then the
    // recompute ran against the grown row.
    await withClaims(s2, fx.u2);
    const p2 = s2.query(`select hc.reclassify_taint('task', $1)`, [fx.task])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.reclassify_taint%', 'reclassify backend');
    await waitForLockWait(admin, pid2, 's2 reclassify on the circle lock');

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case9 reclassify after growth');
    check('case9: the shrink path re-authorizes under the lock — schedule-only actor refused on the grown taint',
      e2 !== null && e2.code === 'P0001' && e2.message === 'reclassify_refused',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 10: a freeze racing a revision -------------------------------------
// With revise under the per-circle lock, a freeze committed while the
// revision waits is seen at its (post-lock) authorization evaluation.

async function case10(admin) {
  const fx = await mkCircle(admin, 'c10');
  const s1 = await connect();
  const s2 = await connect();
  try {
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    await asUser(s2, fx.u2);
    const p2 = s2.query(`select hc.revise_object('task', $1, '{"title": "frozen edit"}')`,
      [fx.task]).then(() => null).catch(e => e);
    // Tolerant wait: pre-fix the revision never blocks (it commits straight
    // through), which IS the defect — the check below names it either way.
    const pid2 = await findActivePid(admin, 'select hc.revise_object%', 'revision backend');
    if (pid2) {
      try { await waitForLockWait(admin, pid2, 's2 revision on the circle lock'); }
      catch { /* not blocked — the pre-fix path */ }
    }

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case10 revision after freeze');
    const t = await admin.query(`select title from public.tasks where id = $1`, [fx.task]);
    check('case10: a freeze committed while the revision waited DEFEATS it (revise_refused, row unchanged)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'revise_refused'
        && t.rows[0].title === 'Baseline task',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} title=${t.rows[0].title}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- main --------------------------------------------------------------------

const admin = await connect();
try {
  console.log(`test:concurrency against ${DB_URL.replace(/:[^:@/]+@/, ':***@')}`);
  await case1(admin);
  await case2(admin);
  await case3(admin);
  await case4(admin);
  await case5(admin);
  await case6(admin);
  await case7(admin);
  await case8(admin);
  await case9(admin);
  await case10(admin);
} catch (err) {
  console.error(`RUNNER ERROR: ${err.message}`);
  failures += 1;
} finally {
  await admin.end();
}

console.log(`\n${results.length - failures}/${results.length} concurrency assertions passed`);
process.exit(failures === 0 ? 0 : 1);
