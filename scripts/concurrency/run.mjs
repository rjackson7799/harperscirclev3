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
//   Case 11 1C A.5 late worker, BOTH orders: attempt 1 expires, attempt 2
//           claims; only attempt 2 may publish — attempt 1 gets stale_lease
//           even when it reaches finalization first.
//   Case 12 1C A.5: claim_stage commits standalone — a rollback of the
//           worker's own transaction leaves attempt_no advanced.
//   Case 13 1C R-rule: a freeze committing while advance_arrival waits on
//           the per-circle lock parks the arrival (frozen).
//   Case 14 1C R-rule + FRZ-15: a freeze committing while claim_stage
//           waits parks the claim AND consumes no attempt.
//   Case 15 1C R-rule + MNL-01: a freeze committing while a manual draft
//           waits defeats it — neither the synthetic arrival nor the
//           proposal survives (freeze_active, one-transaction unity).
//   Case 16 1C §4.5: a cancellation committing while finalization waits
//           wins the swap — the provider's result is discarded, zero
//           extractions and zero proposals land.
//   Case 17 Round-7 B2: a cancellation committing while the sweeper waits
//           on the per-circle lock defeats terminalization — the sweeper
//           re-reads under the lock and leaves the cancelled row alone.
//   Case 18 Round-7 B2: a claim-internal exhaustion committing while the
//           sweeper waits produces exactly ONE terminal event — the
//           sweeper sees the terminal state and skips.
//   Case 19 Round-7 B2 (confirmation): a freeze committing while the
//           sweeper waits parks the arrival — the frozen re-check under
//           the lock predates round 7 and holds.
//   Case 20 Round-7 B2: a claim+finalize committing while the sweeper
//           waits must NOT be clobbered — the sweeper re-derives the
//           stage from the LIVE state and skips the extracted arrival.
//   Case 21 Round-7 B2: two sweepers over one budget-spent arrival
//           terminalize it exactly ONCE (advisory-lock serialization +
//           live re-read).
//   Case 22 Round-7 B3: concurrent drains hand out DISJOINT rows (SKIP
//           LOCKED); after the claim window only UNACKED rows re-deliver.
//   Case 23 Round-7 F5: two concurrent intakes of one key with
//           CONFLICTING identity — the loser gets idempotency_conflict,
//           never the winner's id; a matching concurrent replay still
//           aliases.
//   Case 24 1D TNT-08 (RAC-06 joins): a freeze committing while the
//           request-path reclassify waits on the per-circle lock defeats
//           it — visible_at evaluates frozen UNDER the lock.
//   Case 25 1D TNT-08: a grant revocation committing while the reclassify
//           waits defeats it — ctx evaluates under the lock (RAC-02's
//           shape, on the 1D writer).
//   Case 26 2A R-rule: a freeze committing while accept_invite waits on
//           the per-circle lock DEFEATS the acceptance (freeze_active) —
//           no membership, no grants, the invite still pending (FRZ-16's
//           racing half).
//   Case 27 2A: an invite REVOCATION committing while accept_invite waits
//           defeats it — the §5.10 conditional UPDATE re-reads under the
//           lock and updates zero rows (RLS-09's racing half).
//   Case 28 2A §5.6: two sessions hammering one identifier concurrently —
//           no attempt is lost, the wait stays boxed at 900 s, and a
//           success clears it (AC-AUTH-12 under contention).
//   Case 29 2A §5.7: two sessions racing ONE step-up token through a
//           grant raise — serialized on the circle lock, exactly one
//           PERFORMS the raise and consumes the token; the second is
//           ABSORBED by the same-level no-op (changed:false, no token
//           demanded — nothing rises), one grant_changed lands, the
//           token is consumed exactly once.
//
// Mechanics (session-plan pinned): two pg Clients per case; barriers are
// awaited statement completions; intended blocking is CONFIRMED from
// pg_locks (100 ms poll, 20 s bound) before release; per-case timeout 45 s;
// failure signatures distinguished by SQLSTATE (40P01 vs timeout vs
// assertion); fixtures use fresh uuids per run, are written as postgres
// under session_replication_role=replica (triggers off for setup ONLY),
// and each case cleans its circle graph afterwards in FK order.
// ============================================================================

import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';

const DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

// Bounds are MECHANICS, not assertions: generous enough for a loaded CI
// runner (a 5 s discovery window flaked once at 33 cases — round-7 packet),
// tight enough that a real deadlock still fails the case.
const CASE_TIMEOUT_MS = 45_000;
const DISCOVERY_MS = 20_000;
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
      setTimeout(() => rej(new Error(`case timeout (${CASE_TIMEOUT_MS / 1000} s): ${label}`)), CASE_TIMEOUT_MS)),
  ]);
}

async function waitForLockWait(admin, pid, label) {
  const deadline = Date.now() + DISCOVERY_MS;
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
    // explicit pipeline deletes: replica mode disables the internal
    // FK-cascade triggers, so "cascade from arrivals" does NOT happen here
    `delete from public.pipeline_outbox where circle_id = $1`,
    `delete from public.arrival_events where circle_id = $1`,
    `delete from public.pipeline_leases where circle_id = $1`,
    `delete from public.extractions where circle_id = $1`,
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
    `delete from public.invites where circle_id = $1`,
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
  const deadline = Date.now() + DISCOVERY_MS;
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

// --- 1C fixtures ---------------------------------------------------------------

// an arrival at 'extracting' with a claimed extract lease, via the machinery
async function mkExtracting(admin, fx, key) {
  const a = (await admin.query(
    `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => $3) as id`,
    [fx.c, fx.s, key])).rows[0].id;
  await admin.query(`update public.arrivals set state = 'extracting' where id = $1`, [a]);
  const r = (await admin.query(`select * from hc.claim_stage($1, 'extract')`, [a])).rows[0];
  return { arrival: a, lease: r.lease_id };
}

const FACTS = JSON.stringify([{
  field: 'total', value: '812', confidence: 0.9, risk_class: 'standard',
  citation: { page: 1 }, model_id: 'm1', prompt_version: 'p1',
}]);

// --- case 11: late worker, both orders (1C A.5) --------------------------------

async function case11(admin) {
  const fx = await mkCircle(admin, 'c11');
  try {
    // Round A: the superseded worker reaches finalization FIRST.
    let w = await mkExtracting(admin, fx, 'c11-a');
    await admin.query(
      `update public.pipeline_leases set deadline = now() - interval '1 second'
       where id = $1`, [w.lease]);
    const l2 = (await admin.query(`select * from hc.claim_stage($1, 'extract')`,
      [w.arrival])).rows[0].lease_id;
    const rA1 = (await admin.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [w.arrival, w.lease, FACTS])).rows[0].r;
    const rA2 = (await admin.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [w.arrival, l2, FACTS])).rows[0].r;
    const nA = (await admin.query(
      `select count(*)::int as n from public.extractions where arrival_id = $1`,
      [w.arrival])).rows[0].n;
    check('case11 order A: the expired attempt finalizing FIRST gets stale_lease; attempt 2 publishes once',
      rA1 === 'stale_lease' && rA2 === 'advanced' && nA === 1,
      `a1=${rA1} a2=${rA2} extractions=${nA}`);

    // Round B: attempt 2 publishes first; the late worker comes back after.
    w = await mkExtracting(admin, fx, 'c11-b');
    await admin.query(
      `update public.pipeline_leases set deadline = now() - interval '1 second'
       where id = $1`, [w.lease]);
    const l2b = (await admin.query(`select * from hc.claim_stage($1, 'extract')`,
      [w.arrival])).rows[0].lease_id;
    const rB2 = (await admin.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [w.arrival, l2b, FACTS])).rows[0].r;
    const rB1 = (await admin.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [w.arrival, w.lease, FACTS])).rows[0].r;
    const nB = (await admin.query(
      `select count(*)::int as n from public.extractions where arrival_id = $1`,
      [w.arrival])).rows[0].n;
    check('case11 order B: attempt 2 publishes; the late worker still gets stale_lease, nothing doubles',
      rB2 === 'advanced' && rB1 === 'stale_lease' && nB === 1,
      `a2=${rB2} a1=${rB1} extractions=${nB}`);
  } finally {
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 12: the claim commits standalone (1C A.5) ----------------------------

async function case12(admin) {
  const fx = await mkCircle(admin, 'c12');
  const s1 = await connect();
  try {
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c12-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    // the worker's calling pattern: claim (autocommit) → begin work → CRASH
    const r = (await s1.query(`select * from hc.claim_stage($1, 'store')`, [a])).rows[0];
    await s1.query('begin');
    await s1.query(`select 1`); // provider work would happen here
    await s1.query('rollback');
    const n = (await admin.query(
      `select count(*)::int as n, max(attempt_no)::int as att
       from public.pipeline_leases where arrival_id = $1 and stage = 'store'`,
      [a])).rows[0];
    check('case12: claim_stage committed standalone — the rolled-back worker still burned attempt 1',
      r.result === 'claimed' && n.n === 1 && n.att === 1,
      `claim=${r.result} leases=${n.n} attempt=${n.att}`);
  } finally {
    await s1.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 13: freeze vs advance mid-wait (1C R-rule) ---------------------------

async function case13(admin) {
  const fx = await mkCircle(admin, 'c13');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c13-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    await admin.query(`update public.arrivals set state = 'scanned' where id = $1`, [a]);
    const lease = (await admin.query(`select * from hc.claim_stage($1, 'gate')`, [a]))
      .rows[0].lease_id;

    // S1 holds the per-circle lock in an open transaction.
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    // S2's advance blocks on the lock…
    const p2 = s2.query(
      `select hc.advance_arrival($1, 'scanned', 'extracting', $2, 'sender_recognised') as r`,
      [a, lease]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.advance_arrival%', 'advance backend');
    await waitForLockWait(admin, pid2, 's2 advance on the circle lock');

    // …a freeze commits mid-wait…
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');

    const r2 = await withTimeout(p2, 'case13 advance after freeze');
    const st = (await admin.query(`select state::text as s from public.arrivals where id = $1`,
      [a])).rows[0].s;
    check('case13 (R-rule): a freeze committed while the advance waited PARKS it — frozen, state unchanged',
      r2 === 'frozen' && st === 'scanned', `r=${r2} state=${st}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 14: freeze vs claim mid-wait consumes NOTHING (1C R-rule, FRZ-15) ----

async function case14(admin) {
  const fx = await mkCircle(admin, 'c14');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c14-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    await admin.query(`update public.arrivals set state = 'stored' where id = $1`, [a]);

    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    const p2 = s2.query(`select result::text as r from hc.claim_stage($1, 'scan')`, [a])
      .then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select result::text as r from hc.claim_stage%',
      'claim backend');
    await waitForLockWait(admin, pid2, 's2 claim on the circle lock');

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');

    const r2 = await withTimeout(p2, 'case14 claim after freeze');
    const n = (await admin.query(
      `select count(*)::int as n from public.pipeline_leases where arrival_id = $1`,
      [a])).rows[0].n;
    check('case14 (FRZ-15): a freeze committed while the claim waited parks it — frozen, NO attempt consumed',
      r2 === 'frozen' && n === 0, `r=${r2} leases=${n}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 15: freeze vs manual draft mid-wait (1C R-rule, MNL-01) --------------

async function case15(admin) {
  const fx = await mkCircle(admin, 'c15');
  const s1 = await connect();
  const s2 = await connect();
  try {
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    await asUser(s2, fx.u1);
    const p2 = s2.query(
      `select hc.create_manual_proposal($1, $2, 'task', '{"title":"race the freeze"}')`,
      [fx.c, fx.s]).then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.create_manual_proposal%',
      'manual draft backend');
    await waitForLockWait(admin, pid2, 's2 manual draft on the circle lock');

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');

    const e2 = await withTimeout(p2, 'case15 draft after freeze');
    const n = (await admin.query(
      `select (select count(*) from public.arrivals
               where circle_id = $1 and channel = 'manual')::int as a,
              (select count(*) from public.proposals where circle_id = $1)::int as p`,
      [fx.c])).rows[0];
    check('case15 (MNL-01): a freeze committed while the draft waited DEFEATS it — freeze_active, neither row survives',
      e2 !== null && e2.code === 'P0001' && e2.message === 'freeze_active'
        && n.a === 0 && n.p === 0,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} arrivals=${n.a} proposals=${n.p}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 16: cancellation racing finalization (1C §4.5, A.5) ------------------

async function case16(admin) {
  const fx = await mkCircle(admin, 'c16');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const w = await mkExtracting(admin, fx, 'c16-a');

    // S1: a member's cancellation, held open — it owns the row and circle locks.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.cancel_arrival($1)`, [w.arrival]);

    // S2: the worker's finalization blocks behind it…
    const p2 = s2.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [w.arrival, w.lease, FACTS]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.finalize_extraction%',
      'finalize backend');
    await waitForLockWait(admin, pid2, 's2 finalize behind the cancel');

    // …and the cancellation commits first.
    await s1.query('commit');

    const r2 = await withTimeout(p2, 'case16 finalize after cancel');
    const n = (await admin.query(
      `select (select count(*) from public.extractions where arrival_id = $1)::int as e,
              (select count(*) from public.proposals   where arrival_id = $1)::int as p,
              (select state::text from public.arrivals where id = $1) as s`,
      [w.arrival])).rows[0];
    check('case16 (§4.5): cancellation wins the swap — the late result is DISCARDED, nothing lands',
      r2 === 'cancelled' && n.e === 0 && n.p === 0 && n.s === 'cancelled',
      `r=${r2} extractions=${n.e} proposals=${n.p} state=${n.s}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- round-7 fixtures ----------------------------------------------------------

// an arrival at 'extracting' whose extract budget is spent: `spent` closed,
// expired leases — the sweeper-terminalization candidate shape
async function mkSpentExtract(admin, fx, key, spent = 3) {
  const a = (await admin.query(
    `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => $3) as id`,
    [fx.c, fx.s, key])).rows[0].id;
  await admin.query(`update public.arrivals set state = 'extracting' where id = $1`, [a]);
  for (let i = 1; i <= spent; i++) {
    await admin.query(
      `insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no,
         deadline, outcome, closed_at)
       values ($1, $2, 'extract', $3, now() - interval '1 minute', 'expired', now())`,
      [a, fx.c, i]);
  }
  return a;
}

async function waitForLockWaitN(admin, likePattern, n, label) {
  const deadline = Date.now() + DISCOVERY_MS;
  for (;;) {
    const r = await admin.query(
      `select count(*)::int as n from pg_locks l
       join pg_stat_activity s on s.pid = l.pid
       where s.query like $1 and not l.granted`, [likePattern]);
    if (r.rows[0].n >= n) return;
    if (Date.now() > deadline) throw new Error(`never blocked ×${n}: ${label}`);
    await new Promise(res => setTimeout(res, 100));
  }
}

// --- case 17: sweeper vs cancellation (round-7 B2) -----------------------------

async function case17(admin) {
  const fx = await mkCircle(admin, 'c17');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const a = await mkSpentExtract(admin, fx, 'c17-a');

    // S1: a member's cancellation, held open — it owns the circle lock.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.cancel_arrival($1)`, [a]);

    // S2: the sweeper blocks on the circle lock…
    const p2 = s2.query(`select hc.sweeper_pass() as r`)
      .then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.sweeper_pass%', 'sweeper backend');
    await waitForLockWait(admin, pid2, 's2 sweeper on the circle lock');

    // …and the cancellation commits first.
    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case17 sweeper after cancel');

    const n = (await admin.query(
      `select (select state::text from public.arrivals where id = $1) as s,
              (select count(*) from public.arrival_events
               where arrival_id = $1 and to_state = 'extract_failed')::int as ex,
              (select count(*) from public.arrival_events
               where arrival_id = $1 and to_state = 'cancelled')::int as cn`,
      [a])).rows[0];
    check('case17 (B2): a cancellation committed while the sweeper waited DEFEATS terminalization — cancelled stands, no exhaust event',
      !(r2 instanceof Error) && n.s === 'cancelled' && n.ex === 0 && n.cn === 1,
      `r=${r2 instanceof Error ? r2.message : 'ok'} state=${n.s} exhaust_events=${n.ex} cancel_events=${n.cn}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 18: sweeper vs claim-internal exhaustion (round-7 B2) ----------------

async function case18(admin) {
  const fx = await mkCircle(admin, 'c18');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const a = await mkSpentExtract(admin, fx, 'c18-a');

    // S1: a claim that EXHAUSTS inside its own row lock, held open.
    await s1.query('begin');
    const rc = (await s1.query(`select result::text as r from hc.claim_stage($1, 'extract')`,
      [a])).rows[0].r;

    // S2: the sweeper blocks on the circle lock…
    const p2 = s2.query(`select hc.sweeper_pass() as r`)
      .then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.sweeper_pass%', 'sweeper backend');
    await waitForLockWait(admin, pid2, 's2 sweeper on the circle lock');

    // …the exhaustion commits first.
    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case18 sweeper after claim-exhaust');

    const n = (await admin.query(
      `select (select state::text from public.arrivals where id = $1) as s,
              (select count(*) from public.arrival_events
               where arrival_id = $1 and to_state = 'extract_failed')::int as ex`,
      [a])).rows[0];
    check('case18 (B2): claim-exhaust committed while the sweeper waited — exactly ONE terminal event, never two',
      rc === 'exhausted' && !(r2 instanceof Error) && n.s === 'extract_failed' && n.ex === 1,
      `claim=${rc} r=${r2 instanceof Error ? r2.message : 'ok'} state=${n.s} exhaust_events=${n.ex}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 19: sweeper vs freeze (round-7 confirmation) -------------------------
// The frozen re-check under the per-circle lock predates round 7 (M8 shipped
// it); this case CONFIRMS it holds mid-wait rather than fixing it.

async function case19(admin) {
  const fx = await mkCircle(admin, 'c19');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const a = await mkSpentExtract(admin, fx, 'c19-a');

    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    const p2 = s2.query(`select hc.sweeper_pass() as r`)
      .then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.sweeper_pass%', 'sweeper backend');
    await waitForLockWait(admin, pid2, 's2 sweeper on the circle lock');

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case19 sweeper after freeze');

    const n = (await admin.query(
      `select (select state::text from public.arrivals where id = $1) as s,
              (select count(*) from public.arrival_events
               where arrival_id = $1 and to_state = 'extract_failed')::int as ex`,
      [a])).rows[0];
    check('case19 (FRZ-15 confirmation): a freeze committed while the sweeper waited PARKS the budget-spent arrival',
      !(r2 instanceof Error) && n.s === 'extracting' && n.ex === 0,
      `r=${r2 instanceof Error ? r2.message : 'ok'} state=${n.s} exhaust_events=${n.ex}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 20: sweeper vs claim+finalize (round-7 B2, the clobber) --------------

async function case20(admin) {
  const fx = await mkCircle(admin, 'c20');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // spent 2 of 3: attempt 3 is claimable
    const a = await mkSpentExtract(admin, fx, 'c20-a', 2);

    // S1: claim attempt 3 AND finalize, both uncommitted — the worker's
    // whole win happens while the sweeper is queued behind the lock.
    await s1.query('begin');
    const lease = (await s1.query(`select lease_id from hc.claim_stage($1, 'extract')`,
      [a])).rows[0].lease_id;
    const rf = (await s1.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [a, lease, FACTS])).rows[0].r;

    // S2: the sweeper's candidate list was built from the committed state
    // (extracting, no live lease, spent 2) — it blocks on the circle lock…
    const p2 = s2.query(`select hc.sweeper_pass() as r`)
      .then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.sweeper_pass%', 'sweeper backend');
    await waitForLockWait(admin, pid2, 's2 sweeper on the circle lock');

    // …and the worker's win commits first: spent is now 3, state extracted.
    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case20 sweeper after finalize');

    const n = (await admin.query(
      `select (select state::text from public.arrivals where id = $1) as s,
              (select count(*) from public.arrival_events
               where arrival_id = $1 and to_state = 'extract_failed')::int as ex,
              (select count(*) from public.extractions where arrival_id = $1)::int as fx`,
      [a])).rows[0];
    check('case20 (B2): a finalization committed while the sweeper waited is NOT clobbered — extracted stands, facts kept',
      rf === 'advanced' && !(r2 instanceof Error) && n.s === 'extracted' && n.ex === 0 && n.fx === 1,
      `finalize=${rf} r=${r2 instanceof Error ? r2.message : 'ok'} state=${n.s} exhaust_events=${n.ex} extractions=${n.fx}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 21: two sweepers, one terminalization (round-7 B2) -------------------

async function case21(admin) {
  const fx = await mkCircle(admin, 'c21');
  const s1 = await connect();
  const s2 = await connect();
  const s3 = await connect();
  try {
    const a = await mkSpentExtract(admin, fx, 'c21-a');

    // S1 holds the circle lock; BOTH sweepers build their candidate lists
    // and queue behind it.
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    const p2 = s2.query(`select hc.sweeper_pass() as r`)
      .then(r => r.rows[0].r).catch(e => e);
    const p3 = s3.query(`select hc.sweeper_pass() as r`)
      .then(r => r.rows[0].r).catch(e => e);
    await waitForLockWaitN(admin, 'select hc.sweeper_pass%', 2, 'both sweepers queued');

    await s1.query('commit');
    const [r2, r3] = await withTimeout(Promise.all([p2, p3]), 'case21 both sweepers');

    const n = (await admin.query(
      `select (select state::text from public.arrivals where id = $1) as s,
              (select count(*) from public.arrival_events
               where arrival_id = $1 and to_state = 'extract_failed')::int as ex`,
      [a])).rows[0];
    const term = [r2, r3]
      .filter(r => !(r instanceof Error))
      .flatMap(r => r.terminalized ?? [])
      .filter(t => t.arrival_id === a).length;
    check('case21 (B2): two sweepers terminalize a spent arrival exactly ONCE — one event, one report',
      n.s === 'extract_failed' && n.ex === 1 && term === 1,
      `state=${n.s} exhaust_events=${n.ex} reported=${term}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await s3.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 22: drain concurrency + the ack boundary (round-7 B3) ----------------

async function case22(admin) {
  const fx = await mkCircle(admin, 'c22');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // the drain is GLOBAL by design — start from an empty outbox so the
    // case is deterministic (earlier runs' replica-mode cleanup could not
    // cascade-delete outbox rows; see cleanupCircle)
    await admin.query(`delete from public.pipeline_outbox`);

    // three undrained outbox rows, oldest first
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await admin.query(
        `insert into public.pipeline_outbox (circle_id, arrival_id, reason_code, created_at)
         values ($1, $2, 'sweeper_requeue', now() - make_interval(secs => $3))
         returning id`, [fx.c, fx.a, 30 - i]);
      ids.push(r.rows[0].id);
    }
    await admin.query(`update public.arrivals set state = 'stored' where id = $1`, [fx.a]);

    // S1 claims two rows and HOLDS the transaction open; S2's concurrent
    // drain must skip the locked rows and take only the third.
    await s1.query('begin');
    const d1 = (await s1.query(`select outbox_id from hc.outbox_drain(2)`)).rows
      .map(r => r.outbox_id);
    const d2 = (await s2.query(`select outbox_id from hc.outbox_drain(10)`)).rows
      .map(r => r.outbox_id);
    await s1.query('commit');
    const disjoint = d1.length === 2 && d2.length === 1
      && !d1.includes(d2[0]) && ids.every(i => [...d1, ...d2].includes(i));
    check('case22 (B3): concurrent drains hand out DISJOINT rows — SKIP LOCKED, no double claim',
      disjoint, `d1=${JSON.stringify(d1)} d2=${JSON.stringify(d2)}`);

    // Crash boundary: ack S1's two rows; expire every claim window; only
    // the UNACKED row re-delivers.
    const ack = await admin.query(`select hc.outbox_ack($1::uuid[]) as n`, [d1])
      .then(r => r.rows[0].n).catch(e => e);
    await admin.query(
      `update public.pipeline_outbox set drained_at = now() - interval '10 minutes'
       where id = any($1::uuid[])`, [ids]);
    const redelivered = (await s2.query(`select outbox_id from hc.outbox_drain(10)`)).rows
      .map(r => r.outbox_id);
    check('case22 (B3): after the claim window, ONLY the unacked row re-delivers — the ack is the delivery boundary',
      ack === 2 && redelivered.length === 1 && redelivered[0] === d2[0],
      `ack=${ack instanceof Error ? ack.message : ack} redelivered=${JSON.stringify(redelivered)}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 23: concurrent conflicting intake (round-7 F5) -----------------------

async function case23(admin) {
  const fx = await mkCircle(admin, 'c23');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // S1 inserts the key and holds its transaction open.
    await s1.query('begin');
    const winner = (await s1.query(
      `select hc.create_arrival($1, $2, 'email', p_message_id => 'm-1',
         p_ingest_idempotency_key => 'race-k') as id`, [fx.c, fx.s])).rows[0].id;

    // S2's CONFLICTING intake of the same key blocks on the unique index…
    const p2 = s2.query(
      `select hc.create_arrival($1, $2, 'email', p_message_id => 'm-2',
         p_ingest_idempotency_key => 'race-k') as id`, [fx.c, fx.s])
      .then(r => r.rows[0].id).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.create_arrival%', 'intake backend');
    await waitForLockWait(admin, pid2, 's2 intake on the unique key');

    // …the winner commits, and the loser must CONFLICT, not alias.
    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case23 loser after winner commit');

    const n = (await admin.query(
      `select count(*)::int as n,
              max(message_id) as mid
       from public.arrivals
       where circle_id = $1 and ingest_idempotency_key = 'race-k'`, [fx.c])).rows[0];
    check(`case23 (F5): the concurrent CONFLICTING replay raises idempotency_conflict — never the winner's id`,
      r2 instanceof Error && r2.code === 'P0001' && r2.message === 'idempotency_conflict'
        && n.n === 1 && n.mid === 'm-1',
      `r=${r2 instanceof Error ? r2.code + ':' + r2.message : 'id:' + r2} rows=${n.n} mid=${n.mid}`);

    // A MATCHING concurrent replay still aliases to the winner.
    const alias = await s2.query(
      `select hc.create_arrival($1, $2, 'email', p_message_id => 'm-1',
         p_ingest_idempotency_key => 'race-k') as id`, [fx.c, fx.s])
      .then(r => r.rows[0].id).catch(e => e);
    check('case23 (F5): a MATCHING replay still returns the winner — idempotency survives the identity check',
      alias === winner, `alias=${alias instanceof Error ? alias.message : alias}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 24: 1D TNT-08 — a freeze racing the request-path reclassify --------
// M5 made hc.reclassify_taint a request-path writer (EXECUTE to
// authenticated, visible_at authorization). The R-rule binds it: a freeze
// committing while the reclassify waits on the per-circle lock defeats it
// — visible_at evaluates frozen under the lock (RAC-06 joins).

async function case24(admin) {
  const fx = await mkCircle(admin, 'c24');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // S1: open transaction holds the circle's taint lock.
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.link_provenance('task', $1, 'document', $2)`,
      [fx.task, fx.doc]);

    // S2: the manage×5 coordinator reclassifies AS AUTHENTICATED — the 1D
    // request path — and blocks on the lock.
    await asUser(s2, fx.u1);
    const p2 = s2.query(`select hc.reclassify_taint('document', $1)`, [fx.doc])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.reclassify_taint%', 'reclassify backend');
    await waitForLockWait(admin, pid2, 's2 reclassify on the circle lock');

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case24 reclassify after freeze');
    check('case24 (TNT-08): a freeze committed while the request-path reclassify waited DEFEATS it (reclassify_refused)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'reclassify_refused',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 25: 1D TNT-08 — a grant revocation racing the reclassify -----------
// ctx evaluates UNDER the lock: a revocation committed mid-wait means the
// authorization sees the revoked state, exactly as RAC-02 proved for
// approvals.

async function case25(admin) {
  const fx = await mkCircle(admin, 'c25');
  const s1 = await connect();
  const s2 = await connect();
  try {
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.link_provenance('task', $1, 'document', $2)`,
      [fx.task, fx.doc]);

    // S2: u2 (manage×5 in the fixture) reclassifies the document as
    // authenticated, and blocks.
    await asUser(s2, fx.u2);
    const p2 = s2.query(`select hc.reclassify_taint('document', $1)`, [fx.doc])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.reclassify_taint%', 'reclassify backend');
    await waitForLockWait(admin, pid2, 's2 reclassify on the circle lock');

    await admin.query(`delete from public.access_grants where member_id = $1`, [fx.m2]);

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case25 reclassify after revocation');
    check('case25 (TNT-08): a revocation committed while the reclassify waited DEFEATS it — ctx evaluates under the lock',
      e2 !== null && e2.code === 'P0001' && e2.message === 'reclassify_refused',
      `err=${e2 ? e2.code + ':' + e2.message : 'none'}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- 2A helpers ----------------------------------------------------------------

// The accept path binds on the JWT email claim; GoTrue signs both.
async function asUserWithEmail(client, userId, email) {
  await client.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: userId, role: 'authenticated', email })]);
  await client.query(`set role authenticated`);
}

async function asAnon(client) {
  await client.query(`set role anon`);
}

// Mint a step-up token on a freshly re-authenticated session (§5.7).
async function mintStepUp(admin, userId, operation, target) {
  await admin.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({
      sub: userId, role: 'authenticated', aal: 'aal1',
      amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
    })]);
  await admin.query(`set role authenticated`);
  const r = await admin.query(
    `select (hc.mint_step_up($1, $2)) ->> 'token' as t`, [operation, target]);
  await admin.query(`reset role`);
  await admin.query(`select set_config('request.jwt.claims', '', false)`);
  return r.rows[0].t;
}

// Seed a pending invite directly (issuance is M3's; these cases race the
// ACCEPTANCE). Returns the plaintext token.
async function seedInvite(admin, fx, email) {
  const token = randomBytes(32).toString('hex');
  await admin.query(`set session_replication_role = replica`);
  await admin.query(
    `insert into public.invites (circle_id, token_hash, invited_email, tier,
       subject_ids, invited_by, expires_at)
     values ($1, extensions.digest($2, 'sha256'), $3, 'family',
             array[$4]::uuid[], $5, now() + interval '7 days')`,
    [fx.c, token, email, fx.s, fx.u1]);
  await admin.query(`set session_replication_role = default`);
  return token;
}

async function mkInvitee(admin, tag) {
  const id = randomUUID();
  const email = `invitee-${tag}-${id.slice(0, 8)}@fixture.local`;
  await admin.query(`set session_replication_role = replica`);
  await admin.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated',
             'authenticated', $2, 'x', now(), now(), now(), '{}', '{}')`, [id, email]);
  await admin.query(`set session_replication_role = default`);
  // triggers ON for the accounts insert: the M3/M5 mirror fills email columns
  await admin.query(
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'June')`,
    [id]);
  return { id, email };
}

// --- case 26: a freeze racing an in-flight invite acceptance (FRZ-16) ----------

async function case26(admin) {
  const fx = await mkCircle(admin, 'c26');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const inv = await mkInvitee(admin, 'c26');
    const token = await seedInvite(admin, fx, inv.email);

    // S1 holds the per-circle lock in an open transaction.
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    // S2's acceptance blocks on the lock…
    await asUserWithEmail(s2, inv.id, inv.email);
    const p2 = s2.query(`select hc.accept_invite($1)`, [token])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.accept_invite%', 'accept backend');
    await waitForLockWait(admin, pid2, 's2 acceptance on the circle lock');
    check('case26: the acceptance blocks on the per-circle lock', true, '');

    // …a freeze commits mid-wait…
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);

    // …and the acceptance must SEE it when the lock releases.
    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case26 acceptance after freeze');
    const st = await admin.query(
      `select (select count(*)::int from public.circle_members
               where circle_id = $1 and account_id = $2)      as members,
              (select count(*)::int from public.access_grants g
               join public.circle_members m on m.id = g.member_id
               where m.circle_id = $1 and m.account_id = $2)  as grants,
              (select count(*)::int from public.invites
               where circle_id = $1 and accepted_at is not null) as accepted`,
      [fx.c, inv.id]);
    const r = st.rows[0];
    check('case26: a freeze committed while the acceptance waited DEFEATS it (freeze_active; no membership, no grants, invite still pending)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'freeze_active'
        && r.members === 0 && r.grants === 0 && r.accepted === 0,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} members=${r.members} grants=${r.grants} accepted=${r.accepted}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 27: an invite revocation racing an in-flight acceptance --------------

async function case27(admin) {
  const fx = await mkCircle(admin, 'c27');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const inv = await mkInvitee(admin, 'c27');
    const token = await seedInvite(admin, fx, inv.email);

    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    await asUserWithEmail(s2, inv.id, inv.email);
    const p2 = s2.query(`select hc.accept_invite($1)`, [token])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.accept_invite%', 'accept backend');
    await waitForLockWait(admin, pid2, 's2 acceptance on the circle lock');

    // the coordinator revokes while the acceptance waits
    await admin.query(
      `update public.invites set revoked_at = now()
       where circle_id = $1 and revoked_at is null and accepted_at is null`, [fx.c]);

    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case27 acceptance after revocation');
    const st = await admin.query(
      `select (select count(*)::int from public.circle_members
               where circle_id = $1 and account_id = $2) as members`, [fx.c, inv.id]);
    check('case27: a revocation committed while the acceptance waited DEFEATS it — the §5.10 conditional UPDATE re-reads under the lock, zero rows, nothing created',
      e2 !== null && e2.code === 'P0001' && e2.message === 'invite_refused'
        && st.rows[0].members === 0,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} members=${st.rows[0].members}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 28: the throttle under two-session contention (AC-AUTH-12) -----------

async function case28(admin) {
  const s1 = await connect();
  const s2 = await connect();
  const ident = `race-${randomUUID().slice(0, 8)}@fixture.local`;
  try {
    await asAnon(s1);
    await asAnon(s2);

    // 10 failures from each session, interleaved concurrently.
    const burst = (s) => Array.from({ length: 10 }, () =>
      s.query(`select hc.record_auth_attempt($1, 'failure')`, [ident]));
    await withTimeout(Promise.all([...burst(s1), ...burst(s2)]), 'case28 bursts');

    const t1 = await s1.query(`select hc.auth_throttle($1) as t`, [ident]);
    const t = t1.rows[0].t;
    const rows = await admin.query(
      `select count(*)::int as n from public.auth_attempts
       where attempt_key = hc.contact_key($1) and outcome = 'failure'`, [ident]);
    check('case28: twenty interleaved failures all land (no lost attempts) and the wait stays boxed at 900 s',
      rows.rows[0].n === 20 && t.failures === 20 && t.wait_seconds <= 900 && t.wait_seconds > 0,
      `rows=${rows.rows[0].n} failures=${t.failures} wait=${t.wait_seconds}`);

    // The AC-AUTH-12 exit under contention: one success clears, and the
    // other session sees it cleared on its NEXT statement.
    await s1.query(`select hc.record_auth_attempt($1, 'success')`, [ident]);
    const t2 = await s2.query(`select hc.auth_throttle($1) as t`, [ident]);
    check('case28: a success from one session clears the state for the other immediately',
      t2.rows[0].t.failures === 0 && t2.rows[0].t.wait_seconds === 0,
      `after=${JSON.stringify(t2.rows[0].t)}`);
  } finally {
    await s1.end();
    await s2.end();
    await admin.query(
      `delete from public.auth_attempts where attempt_key = hc.contact_key($1)`, [ident]);
  }
}

// --- case 29: two sessions racing ONE step-up token through a raise ------------

async function case29(admin) {
  const fx = await mkCircle(admin, 'c29');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // m2's health starts BELOW the target so the call is a genuine raise.
    await admin.query(
      `update public.access_grants set level = 'summary'
       where member_id = $1 and domain = 'health'`, [fx.m2]);

    const target = `${fx.m2}:${fx.s}:health`;
    const token = await mintStepUp(admin, fx.u1, 'raise_grant', target);

    await asUser(s1, fx.u1);
    await asUser(s2, fx.u1);
    // The racers serialize on the circle lock. One PERFORMS the raise and
    // consumes the token; the other re-reads view=view and is ABSORBED by
    // the same-level no-op (changed:false, no token demanded — nothing
    // rises). The properties that matter: the token is consumed exactly
    // once, one grant_changed lands, and the level lands once.
    const raise = (s) => s.query(
      `select hc.set_grant($1, $2, 'health', 'view', $3) as r`, [fx.m2, fx.s, token])
      .then(res => res.rows[0].r).catch(e => e);
    const [r1, r2] = await withTimeout(Promise.all([raise(s1), raise(s2)]), 'case29 raises');

    const outcomes = [r1, r2].map(r => (r && r.changed !== undefined) ? r.changed : `ERR:${r?.code}`);
    const performed = outcomes.filter(o => o === true).length;
    const absorbed  = outcomes.filter(o => o === false).length;
    const level = await admin.query(
      `select level::text as l from public.access_grants
       where member_id = $1 and domain = 'health'`, [fx.m2]);
    const consumed = await admin.query(
      `select (consumed_at is not null) as c from public.step_up_tokens
       where token_hash = extensions.digest($1, 'sha256')`, [token]);
    const logs = await admin.query(
      `select count(*)::int as n from public.access_log
       where circle_id = $1 and event_type = 'grant_changed'
         and domain = 'health' and level_after = 'view'`, [fx.c]);
    check('case29: ONE racer performs the raise and consumes the token; the other is absorbed as a no-op; one grant_changed, the level lands once',
      performed === 1 && absorbed === 1 && level.rows[0].l === 'view'
        && consumed.rows[0].c === true && logs.rows[0].n === 1,
      `outcomes=${JSON.stringify(outcomes)} level=${level.rows[0].l} consumed=${consumed.rows[0].c} logs=${logs.rows[0].n}`);
  } finally {
    await s1.end();
    await s2.end();
    await admin.query(`reset role`).catch(() => {});
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
  await case11(admin);
  await case12(admin);
  await case13(admin);
  await case14(admin);
  await case15(admin);
  await case16(admin);
  await case17(admin);
  await case18(admin);
  await case19(admin);
  await case20(admin);
  await case21(admin);
  await case22(admin);
  await case23(admin);
  await case24(admin);
  await case25(admin);
  await case26(admin);
  await case27(admin);
  await case28(admin);
  await case29(admin);
} catch (err) {
  console.error(`RUNNER ERROR: ${err.message}`);
  failures += 1;
} finally {
  await admin.end();
}

console.log(`\n${results.length - failures}/${results.length} concurrency assertions passed`);
process.exit(failures === 0 ? 0 : 1);
