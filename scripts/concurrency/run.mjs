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
//   Case 28 2A §5.6 (as amended by round 9): two anon sessions hammering
//           one identifier concurrently — no attempt is lost, the wait
//           stays boxed at 900 s, and the account's OWN authenticated
//           success (hc.record_auth_success — identity-bound, round-9
//           finding 1) clears it for the other session immediately
//           (AC-AUTH-12 under contention).
//   Case 29 2A §5.7: two sessions racing ONE step-up token through a
//           grant raise — serialized on the circle lock, exactly one
//           PERFORMS the raise and consumes the token; the second is
//           ABSORBED by the same-level no-op (changed:false, no token
//           demanded — nothing rises), one grant_changed lands, the
//           token is consumed exactly once.
//   Case 30 Round-9 finding 2 (R-rule): a freeze committing while
//           accept_sender waits on the per-circle lock DEFEATS the
//           acceptance (freeze_active) — no sender row, no log entry,
//           the held arrival untouched, nothing re-queued.
//   Case 31 Round-9 finding 2's class, the M4/M7 writers: (a) a target-
//           member removal committing while a token-carrying set_grant
//           raise waits DEFEATS it — no grant reappears for the removed
//           member and the step-up token stays unconsumed; (b) the
//           ACTOR's own coordinator removal committing while their
//           remove_member call waits defeats it — authorization re-reads
//           under the lock (§4.6.3 immediate).
//   Case 32 Round-9 finding 3: two sessions racing ONE "this wasn't me"
//           token — exactly one consumes it, and exactly ONE durable
//           security action is enqueued for the event (UNIQUE(event_id)
//           + the conditional UPDATE, under contention).
//   Case 33 4A M1 item 5 (round-10 F9's DB half): two concurrent
//           security-action sweeps — the second claims WHILE the first's
//           claiming transaction is still open — receive DISJOINT rows
//           (FOR UPDATE SKIP LOCKED), together cover every pending row
//           (no row starved), and the first claim is oldest-first.
//   Case 34 4A M2 (the ING-08 orphan-row class extended to the new
//           finalizers, raced through the reachable mid-wait defeats —
//           member cancellation is unrepresentable at store/scan by
//           construction, cancel_invalid_state): (a) a freeze committing
//           while finalize_store waits does NOT defeat it — store is the
//           §7.5 accept-and-store carve-out, and the artifact facts land;
//           (b) a freeze committing while finalize_scan waits DEFEATS it
//           (frozen) — and writes NOTHING: no verdict, no scan_at, no
//           cache row.
//   Case 35 4A M3: quota-vs-intake, the honest contract — check-then-
//           create is deliberately unserialized (intake takes no lock,
//           ADR-0007 D2; acceptance is never lost to a rate question), so
//           two messages racing at the boundary may BOTH land; the
//           overshoot is bounded by the concurrency degree and the NEXT
//           quota answer refuses. Backpressure sheds processing, never
//           acceptance (§13.1).
//   Case 36 4A M6 (R-rule): a freeze committing while resolve_duplicate
//           waits on the per-circle lock DEFEATS it (freeze_active,
//           named) — the suspect stays parked, no gate lease survives as
//           current, no re-queue row lands.
//   Case 37 4A M8 (round-12 X2): two identical-sha copies scanned clean
//           CONCURRENTLY — exactly ONE lands duplicate_suspected and it
//           is the (received_at, id)-later copy; the canonical earliest
//           stays scanned. Detection depends on row EXISTENCE (set at
//           store), never on scan commit order, so the outcome is
//           order-independent whichever way the circle lock serializes.
//   Case 38 4A M8 (round-12 X1): an infected and a clean verdict racing
//           the same sha's scan_results row — the end state is
//           infected/expires-null in EITHER commit order (clean-first is
//           overwritten by the infected upsert; infected-first refuses
//           the clean downgrade arm). The §11.5 evidence is monotonic
//           under the race, not just sequentially.
//   Case 39 5A M4 (§4.9): two coordinators race ONE conflict proposal
//           with different outcomes — the proposal row lock serialises,
//           the first decision stands (use_new applied exactly once,
//           one commit row), the second refuses on the decided proposal.
//   Case 40 5A M4 (the ING-11 identity): ONE idempotency key raced with
//           two different outcomes — the attempts PK serialises, the
//           stored outcome stands, the different outcome refuses and
//           writes nothing.
//   Case 41 5A M5 (R-rule): a freeze committing while a STAGE-2
//           resolution waits DEFEATS it (freeze_active) — the suspect
//           stays parked, no additional-source edge, no open lease, no
//           re-queue row.
//   Case 42 5A M3 (the ING-08 class): a cancellation committing while a
//           versioned RE-RUN's finalization waits wins the swap — the
//           supersession never half-runs: run 1's facts stay live, run
//           2's rows never land, run 2's accounting closes cancelled.
//   Case 43 5A M2: hc.record_context_for racing a supersede-and-replace
//           — one statement, one snapshot: the payload always shows
//           exactly ONE current row for the field (old before the
//           commit, new after), never zero, never two.
//
//   Case 45 6A M3: two coordinators deciding the LAST two proposals of one
//           arrival simultaneously produce EXACTLY ONE terminal transition —
//           the first leaves it at "Needs you" because work remains, the
//           second terminalizes under the same circle lock.
//   Case 46 6A M3: approve versus reject on ONE proposal yields ONE decision;
//           the loser is refused, its idempotency claim rolls back with it,
//           and exactly one commit row and one terminal transition stand.
//   Case 47 6A M2 (Q7): a grant lowered while an approval WAITS defeats it
//           through the ADDED predicate ALONE — the actor still clears manage
//           on the proposal's own taint and no longer clears view across all
//           five domains on the arrival. Before Q7 this approval succeeded.
//   Case 48 6A M3 (R-rule): a freeze committing while a REJECTION waits
//           defeats it with the NAMED freeze_active signature, and burns no
//           idempotency key.
//   Case 49 6A M4 (§4.5): a cancellation committing while finalization waits
//           discards the rendition MANIFEST with the rest of the answer — the
//           manifest is the winner's record of what was rendered.
//   Case 50 7A M1: assign vs remove_member on ONE member, both orders — a
//           removal committing mid-wait defeats the assignment in the one
//           shape (the assignee re-read under the lock); an assignment that
//           lands first is UNASSIGNED by the removal (PRD §8.8).
//   Case 51 7A M3: two coordinators re-categorising ONE document to the same
//           category — the second re-reads the moved row and is a no-op:
//           one audience change, one person entry (the taint machinery's
//           own beside it).
//   Case 52 7A M1: unassign racing a coordinator's KEEP, both orders — the
//           loser arrives at a task nobody holds and refuses; the kept
//           share's state is the COMMITTED one.
//   Case 53 7A M1 (R-rule): a freeze committing while an assignment waits
//           defeats it with the named freeze_active; a path-1 instruction
//           under that freeze writes nothing.
//   Case 55 8A M1: two members claim ONE task at once — the second waits on
//           the circle lock, re-reads the row the first now holds, and
//           refuses in the one shape; one owner, one task_claimed, no
//           share, no instruction.
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
import { randomUUID, randomBytes, createHash } from 'node:crypto';

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
    // 6A M4: replica mode disables the FK cascade from arrivals, so the
    // manifest is deleted explicitly like every other pipeline row here
    `delete from public.arrival_renditions where circle_id = $1`,
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
  const r = (await admin.query(`select * from hc.claim_stage($1, 'extract', 'm1', 'p1')`, [a])).rows[0];
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
    const l2 = (await admin.query(`select * from hc.claim_stage($1, 'extract', 'm1', 'p1')`,
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
    const l2b = (await admin.query(`select * from hc.claim_stage($1, 'extract', 'm1', 'p1')`,
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
    const rc = (await s1.query(`select result::text as r from hc.claim_stage($1, 'extract', 'm1', 'p1')`,
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
    const lease = (await s1.query(`select lease_id from hc.claim_stage($1, 'extract', 'm1', 'p1')`,
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
  // The identifier is a REAL account's email: the AC-AUTH-12 exit is the
  // holder's own authenticated success (round-9 finding 1 — anon can no
  // longer assert one for anybody).
  const holder = await mkInvitee(admin, 'c28');
  try {
    await asAnon(s1);
    await asAnon(s2);

    // 10 failures from each session, interleaved concurrently. Errors are
    // collected, not thrown, so a red run reports a signature, not an abort.
    const burst = (s) => Array.from({ length: 10 }, () =>
      s.query(`select hc.record_auth_failure($1)`, [holder.email]).catch(e => e));
    const rs = await withTimeout(Promise.all([...burst(s1), ...burst(s2)]), 'case28 bursts');
    const errs = rs.filter(r => r instanceof Error);

    const t1 = await s1.query(`select hc.auth_throttle($1) as t`, [holder.email]);
    const t = t1.rows[0].t;
    const rows = await admin.query(
      `select count(*)::int as n from public.auth_attempts
       where attempt_key = hc.contact_key($1) and outcome = 'failure'`, [holder.email]);
    check('case28: twenty interleaved failures all land (no lost attempts) and the wait stays boxed at 900 s',
      errs.length === 0 && rows.rows[0].n === 20 && t.failures === 20
        && t.wait_seconds <= 900 && t.wait_seconds > 0,
      `errs=${errs.length ? errs[0].message : 0} rows=${rows.rows[0].n} failures=${t.failures} wait=${t.wait_seconds}`);

    // The AC-AUTH-12 exit under contention: the HOLDER's session records
    // its success (identity-bound — no identifier parameter exists), and
    // the anon session sees it cleared on its NEXT statement.
    await s1.query(`reset role`);
    await asUserWithEmail(s1, holder.id, holder.email);
    const suc = await s1.query(`select hc.record_auth_success('success') as r`)
      .then(r => r.rows[0].r).catch(e => e);
    const t2 = await s2.query(`select hc.auth_throttle($1) as t`, [holder.email]);
    check(`case28: the holder's own authenticated success clears the state for the other session immediately`,
      suc && suc.cleared === true
        && t2.rows[0].t.failures === 0 && t2.rows[0].t.wait_seconds === 0,
      `success=${suc instanceof Error ? suc.message : JSON.stringify(suc)} after=${JSON.stringify(t2.rows[0].t)}`);
  } finally {
    await s1.end();
    await s2.end();
    await admin.query(
      `delete from public.auth_attempts where attempt_key = hc.contact_key($1)`, [holder.email]);
    await admin.query(`delete from public.accounts where id = $1`, [holder.id]).catch(() => {});
    await admin.query(`delete from auth.users where id = $1`, [holder.id]).catch(() => {});
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

    const target = `${fx.m2}:${fx.s}:health:view`;
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

// --- case 30: a freeze racing an in-flight sender acceptance (round-9 F2) ------

async function case30(admin) {
  const fx = await mkCircle(admin, 'c30');
  const s1 = await connect();
  const s2 = await connect();
  const stranger = `stranger-${randomUUID().slice(0, 8)}@elsewhere.test`;
  const arrival = randomUUID();
  try {
    // A held arrival from the stranger, so the acceptance would release.
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `insert into public.arrivals (id, circle_id, subject_id, channel, state, sender_address)
       values ($1, $2, $3, 'email', 'held_unknown_sender', $4)`,
      [arrival, fx.c, fx.s, stranger]);
    await admin.query(`set session_replication_role = default`);

    // S1 holds the per-circle lock in an open transaction.
    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    // S2's acceptance blocks…
    await asUser(s2, fx.u1);
    const p2 = s2.query(`select hc.accept_sender($1, $2, null)`, [fx.c, stranger])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.accept_sender%', 'accept_sender backend');
    await waitForLockWait(admin, pid2, 's2 acceptance blocked');
    check('case30: the sender acceptance blocks behind the open transaction', true, '');

    // …a freeze commits mid-wait…
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);

    // …and the acceptance must SEE it: R-rule, lock before predicates.
    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case30 acceptance after freeze');
    const st = await admin.query(
      `select (select count(*)::int from public.known_senders where circle_id = $1) as senders,
              (select count(*)::int from public.access_log
               where circle_id = $1 and event_type = 'sender_accepted')             as logs,
              (select state::text from public.arrivals where id = $2)               as state,
              (select count(*)::int from public.pipeline_outbox where circle_id = $1) as outbox`,
      [fx.c, arrival]);
    const r = st.rows[0];
    check('case30: a freeze committed while the acceptance waited DEFEATS it (freeze_active; no sender row, no log entry, arrival untouched, nothing queued)',
      e2 !== null && e2.code === 'P0001' && e2.message === 'freeze_active'
        && r.senders === 0 && r.logs === 0 && r.state === 'held_unknown_sender' && r.outbox === 0,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} senders=${r.senders} logs=${r.logs} state=${r.state} outbox=${r.outbox}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await admin.query(`delete from public.known_senders where circle_id = $1`, [fx.c]).catch(() => {});
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 31: the M4/M7 writers re-authorize under the lock (round-9 F2) -------

async function case31(admin) {
  const fx = await mkCircle(admin, 'c31');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // (a) a raise with a VALID step-up token racing the TARGET's removal.
    await admin.query(
      `update public.access_grants set level = 'summary'
       where member_id = $1 and domain = 'health'`, [fx.m2]);
    const token = await mintStepUp(admin, fx.u1, 'raise_grant', `${fx.m2}:${fx.s}:health:view`);

    await withClaims(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.reclassify_taint('document', $1)`, [fx.doc]);

    await asUser(s2, fx.u1);
    const pa = s2.query(
      `select hc.set_grant($1, $2, 'health', 'view', $3)`, [fx.m2, fx.s, token])
      .then(() => null).catch(e => e);
    const pidA = await findActivePid(admin, 'select hc.set_grant%', 'set_grant backend');
    await waitForLockWait(admin, pidA, 's2 raise blocked');

    // The target's removal commits mid-wait (its committed effect, as
    // remove_member leaves it: membership closed, grants gone).
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `update public.circle_members set removed_at = now(), removed_by = $1
       where id = $2`, [fx.u1, fx.m2]);
    await admin.query(`delete from public.access_grants where member_id = $1`, [fx.m2]);
    await admin.query(`set session_replication_role = default`);

    await s1.query('commit');
    const ea = await withTimeout(pa, 'case31a raise after target removal');
    const stA = await admin.query(
      `select (select count(*)::int from public.access_grants where member_id = $1) as grants,
              (select (consumed_at is null) from public.step_up_tokens
               where token_hash = extensions.digest($2, 'sha256'))                  as unconsumed`,
      [fx.m2, token]);
    const ra = stA.rows[0];
    check('case31a: a target removal committed while a token-carrying raise waited DEFEATS it — no grant reappears for the removed member, the token stays unconsumed',
      ea !== null && ea.code === 'P0001' && ea.message === 'grant_refused'
        && ra.grants === 0 && ra.unconsumed === true,
      `err=${ea ? ea.code + ':' + ea.message : 'none'} grants=${ra.grants} unconsumed=${ra.unconsumed}`);

    // (b) remove_member racing the ACTOR's own coordinator removal.
    // A second coordinator (u3/m3) and a removable member (u4/m4).
    const u3 = randomUUID(), u4 = randomUUID();
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated',
               $2, 'x', now(), now(), now(), '{}', '{}'),
              ('00000000-0000-0000-0000-000000000000', $3::uuid, 'authenticated', 'authenticated',
               $4, 'x', now(), now(), now(), '{}', '{}')`,
      [u3, `${u3}@fixture.local`, u4, `${u4}@fixture.local`]);
    await admin.query(
      `insert into public.accounts (id, kind, display_name)
       values ($1, 'member', 'Omar'), ($2, 'member', 'Lena')`, [u3, u4]);
    const m3 = (await admin.query(
      `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
       values ($1, $2, 'coordinator', 'Omar') returning id`, [fx.c, u3])).rows[0].id;
    const m4 = (await admin.query(
      `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
       values ($1, $2, 'family', 'Lena') returning id`, [fx.c, u4])).rows[0].id;
    await admin.query(`set session_replication_role = default`);

    // Hold the per-circle lock directly this round (the first transaction
    // already exercised the real-writer hold; what is under test is the
    // CONTENDER's re-read).
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    // u3 (a live coordinator) starts removing m4…
    await asUser(s2, u3);
    const pb = s2.query(`select hc.remove_member($1)`, [m4])
      .then(() => null).catch(e => e);
    const pidB = await findActivePid(admin, 'select hc.remove_member%', 'remove_member backend');
    await waitForLockWait(admin, pidB, 's2 removal blocked');

    // …and u3's OWN coordinatorship is removed mid-wait.
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `update public.circle_members set removed_at = now(), removed_by = $1
       where id = $2`, [fx.u1, m3]);
    await admin.query(`set session_replication_role = default`);

    await s1.query('commit');
    const eb = await withTimeout(pb, 'case31b removal after actor removal');
    const stB = await admin.query(
      `select (select (removed_at is null) from public.circle_members where id = $1) as live`, [m4]);
    check('case31b: the actor\'s own removal committed while their remove_member waited DEFEATS it — authorization re-reads under the lock (§4.6.3 immediate)',
      eb !== null && eb.code === 'P0001' && eb.message === 'remove_refused'
        && stB.rows[0].live === true,
      `err=${eb ? eb.code + ':' + eb.message : 'none'} target_live=${stB.rows[0].live}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 32: two sessions racing ONE "this wasn't me" token (round-9 F3) ------

async function case32(admin) {
  const holder = await mkInvitee(admin, 'c32');
  const s1 = await connect();
  const s2 = await connect();
  const token = randomBytes(32).toString('hex');
  let eventId = null;
  try {
    eventId = (await admin.query(
      `insert into public.security_events (account_id, kind, token_hash, token_expires_at)
       values ($1, 'suspicious_signin', extensions.digest($2, 'sha256'),
               now() + interval '15 minutes')
       returning id`, [holder.id, token])).rows[0].id;

    // S1 consumes in an open transaction (row lock held)…
    await asAnon(s1);
    await s1.query('begin');
    const r1 = await s1.query(`select hc.execute_wasnt_me($1) as r`, [token])
      .then(r => r.rows[0].r).catch(e => e);

    // …S2 races the same token and blocks on the row…
    await asAnon(s2);
    const p2 = s2.query(`select hc.execute_wasnt_me($1)`, [token])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.execute_wasnt_me%', 'wasnt_me backend');
    await waitForLockWait(admin, pid2, 's2 consumption blocked on the row');

    // …the winner commits; the loser's conditional UPDATE finds zero rows.
    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case32 loser after winner commit');

    const acts = await admin.query(
      `select count(*)::int as n from public.security_actions
       where event_id = $1 and account_id = $2
         and action = 'global_signout_force_reset' and completed_at is null`,
      [eventId, holder.id]).catch(e => e);
    check('case32: exactly one session consumes the token; the loser refuses in one shape; exactly ONE durable kill action is enqueued for the event',
      !(r1 instanceof Error) && r1.account_id === holder.id
        && e2 !== null && e2.code === 'P0001' && e2.message === 'wasnt_me_refused'
        && !(acts instanceof Error) && acts.rows[0].n === 1,
      `winner=${r1 instanceof Error ? r1.message : JSON.stringify(r1)} loser=${e2 ? e2.code + ':' + e2.message : 'none'} actions=${acts instanceof Error ? acts.message : acts.rows[0].n}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await admin.query(`delete from public.security_actions where event_id = $1`, [eventId]).catch(() => {});
    await admin.query(`delete from public.security_events where id = $1`, [eventId]).catch(() => {});
    await admin.query(`delete from public.accounts where id = $1`, [holder.id]).catch(() => {});
    await admin.query(`delete from auth.users where id = $1`, [holder.id]).catch(() => {});
  }
}

// --- case 33: concurrent security-action sweeps claim disjoint rows (4A M1) ----

async function case33(admin) {
  const holder = await mkInvitee(admin, 'c33');
  const s1 = await connect();
  const s2 = await connect();
  const eventIds = [];
  const actionIds = [];
  try {
    // Six owed kills, minted oldest-first (staggered created_at).
    for (let i = 0; i < 6; i += 1) {
      const ev = (await admin.query(
        `insert into public.security_events (account_id, kind, token_hash, token_expires_at)
         values ($1, 'suspicious_signin', extensions.digest($2, 'sha256'),
                 now() + interval '15 minutes')
         returning id`, [holder.id, `c33-${i}-${randomUUID()}`])).rows[0].id;
      eventIds.push(ev);
      const act = (await admin.query(
        `insert into public.security_actions (event_id, account_id, action, created_at)
         values ($1, $2, 'global_signout_force_reset',
                 now() - interval '10 minutes' + make_interval(secs => $3))
         returning id`, [ev, holder.id, i])).rows[0].id;
      actionIds.push(act);
    }

    // S1 claims three and HOLDS its transaction open (a sweep mid-flight)…
    await s1.query(`set role hc_pipeline`);
    await s1.query('begin');
    const a = (await s1.query(
      `select id from hc.claim_security_actions(3) order by created_at`))
      .rows.map(r => r.id);

    // …S2 sweeps concurrently: SKIP LOCKED must hand it the OTHER three,
    // without blocking and without overlap.
    await s2.query(`set role hc_pipeline`);
    const b = (await withTimeout(
      s2.query(`select id from hc.claim_security_actions(3) order by created_at`),
      'case33 second sweep must not block on the first'))
      .rows.map(r => r.id);

    await s1.query('commit');

    const overlap = a.filter(x => b.includes(x));
    const union = new Set([...a, ...b]);
    check('case33: two concurrent sweeps are DISJOINT by construction (SKIP LOCKED) and together cover every pending row — none starved',
      a.length === 3 && b.length === 3 && overlap.length === 0
        && actionIds.every(x => union.has(x)),
      `a=${a.length} b=${b.length} overlap=${overlap.length} covered=${union.size}/6`);

    const leases = await admin.query(
      `select count(*)::int as n from public.security_actions
       where id = any($1::uuid[]) and claimed_until > now()`, [actionIds]);
    check('case33: the first claim took the three OLDEST (the longest-owed kills first); every claimed row carries a live lease',
      a.join(',') === actionIds.slice(0, 3).join(',') && leases.rows[0].n === 6,
      `first=${JSON.stringify(a)} expected=${JSON.stringify(actionIds.slice(0, 3))} leased=${leases.rows[0].n}/6`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await admin.query(`delete from public.security_actions where account_id = $1`, [holder.id]).catch(() => {});
    await admin.query(`delete from public.security_events where account_id = $1`, [holder.id]).catch(() => {});
    await admin.query(`delete from public.accounts where id = $1`, [holder.id]).catch(() => {});
    await admin.query(`delete from auth.users where id = $1`, [holder.id]).catch(() => {});
  }
}

// --- case 34: freeze-mid-wait against the M2 finalizers (4A) -------------------

async function case34(admin) {
  const fxa = await mkCircle(admin, 'c34a');
  const fxb = await mkCircle(admin, 'c34b');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // (a) store is the accept-and-store carve-out: a freeze committing
    // mid-wait must NOT defeat finalize_store.
    const a1 = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c34-a') as id`,
      [fxa.c, fxa.s])).rows[0].id;
    const l1 = (await admin.query(`select * from hc.claim_stage($1, 'store')`, [a1]))
      .rows[0].lease_id;
    const shaA = createHash('sha256').update('c34-body-a').digest('hex');
    const keyA = `circle/${fxa.c}/arrival/${a1}/${shaA}`;

    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fxa.c]);

    const pa = s2.query(
      `select hc.finalize_store($1, $2, $3, decode($4, 'hex'), 'application/pdf', 2048)::text as r`,
      [a1, l1, keyA, shaA]).then(r => r.rows[0].r).catch(e => e);
    const pidA = await findActivePid(admin, 'select hc.finalize_store%', 'finalize_store backend');
    await waitForLockWait(admin, pidA, 's2 finalize_store on the circle lock');

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fxa.c]);
    await s1.query('commit');

    const ra = await withTimeout(pa, 'case34a finalize_store after freeze');
    const stA = (await admin.query(
      `select a.state::text as s, a.storage_key is not null as kept
       from public.arrivals a where a.id = $1`, [a1])).rows[0];
    check('case34a: a freeze committing while finalize_store waits does NOT defeat it — §7.5 accept-and-store holds under the serialization point, facts landed',
      ra === 'advanced' && stA.s === 'stored' && stA.kept === true,
      `r=${ra instanceof Error ? ra.message : ra} state=${stA.s} kept=${stA.kept}`);

    // (b) scan is NOT exempt: a freeze committing mid-wait parks it, and
    // the lost transition writes nothing — no verdict, no cache row.
    const a2 = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c34-b') as id`,
      [fxb.c, fxb.s])).rows[0].id;
    const shaB = createHash('sha256').update('c34-body-b').digest('hex');
    await admin.query(
      `update public.arrivals
          set state = 'stored', content_sha256 = decode($2, 'hex'),
              storage_key = $3, byte_size = 10
        where id = $1`, [a2, shaB, `circle/${fxb.c}/arrival/${a2}/${shaB}`]);
    const l2 = (await admin.query(`select * from hc.claim_stage($1, 'scan')`, [a2]))
      .rows[0].lease_id;

    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fxb.c]);

    const pb = s2.query(
      `select hc.finalize_scan($1, $2, 'clean', '{}'::jsonb)::text as r`,
      [a2, l2]).then(r => r.rows[0].r).catch(e => e);
    const pidB = await findActivePid(admin, 'select hc.finalize_scan%', 'finalize_scan backend');
    await waitForLockWait(admin, pidB, 's2 finalize_scan on the circle lock');

    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fxb.c]);
    await s1.query('commit');

    const rb = await withTimeout(pb, 'case34b finalize_scan after freeze');
    const stB = (await admin.query(
      `select a.state::text as s, a.scan_verdict is null as noverdict,
              a.scan_at is null as nowhen,
              not exists (select 1 from public.scan_results r
                          where r.content_sha256 = decode($2, 'hex')) as nocache
       from public.arrivals a where a.id = $1`, [a2, shaB])).rows[0];
    check('case34b: a freeze committing while finalize_scan waits DEFEATS it (frozen) and writes NOTHING — no verdict, no scan_at, no cache row (ING-08\'s class)',
      rb === 'frozen' && stB.s === 'stored' && stB.noverdict === true
        && stB.nowhen === true && stB.nocache === true,
      `r=${rb instanceof Error ? rb.message : rb} state=${stB.s} noverdict=${stB.noverdict} nocache=${stB.nocache}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fxa.c);
    await cleanupCircle(admin, fxb.c);
  }
}

// --- case 35: quota check under concurrent intake (4A M3) ----------------------

async function case35(admin) {
  const fx = await mkCircle(admin, 'c35');
  const s1 = await connect();
  const s2 = await connect();
  const sender = 'racing@example.org';
  try {
    // Nineteen of the twenty-per-hour budget already spent.
    await admin.query(
      `insert into public.arrivals
         (circle_id, subject_id, channel, sender_address, byte_size, received_at)
       select $1, $2, 'email', $3, 100, now() - (i * interval '1 minute')
       from generate_series(1, 19) i`, [fx.c, fx.s, sender]);

    // Two webhooks race the last slot: each checks, then creates, in its
    // own transaction — deliberately unserialized (intake takes no lock).
    await s1.query(`set role hc_pipeline`);
    await s2.query(`set role hc_pipeline`);
    await s1.query('begin');
    const q1 = (await s1.query(
      `select hc.check_quota($1, $2) ->> 'outcome' as o`, [fx.c, sender])).rows[0].o;
    await s1.query(
      `select hc.create_arrival($1, $2, 'email', p_sender_address => $3,
                                p_ingest_idempotency_key => 'c35-a')`,
      [fx.c, fx.s, sender]);

    await s2.query('begin');
    const q2 = (await s2.query(
      `select hc.check_quota($1, $2) ->> 'outcome' as o`, [fx.c, sender])).rows[0].o;
    await s2.query(
      `select hc.create_arrival($1, $2, 'email', p_sender_address => $3,
                                p_ingest_idempotency_key => 'c35-b')`,
      [fx.c, fx.s, sender]);

    await s1.query('commit');
    await s2.query('commit');

    const n = (await admin.query(
      `select count(*)::int as n from public.arrivals
       where circle_id = $1 and parent_arrival_id is null
         and lower(sender_address::text) = $2`, [fx.c, sender])).rows[0].n;
    const qAfter = (await admin.query(
      `select hc.check_quota($1, $2) ->> 'outcome' as o`, [fx.c, sender])).rows[0].o;

    check('case35: quota-vs-intake — both racing messages at the boundary pass their check and BOTH land (acceptance is never lost); the overshoot is bounded and the NEXT answer refuses',
      q1 === 'ok' && q2 === 'ok' && n === 21 && qAfter === 'over_sender',
      `q1=${q1} q2=${q2} landed=${n} after=${qAfter}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 36: freeze-mid-wait defeats resolve_duplicate (4A M6, R-rule) --------

async function case36(admin) {
  const fx = await mkCircle(admin, 'c36');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // A suspect, fixture-level (the detection path is 048's; this case
    // races the RESOLUTION).
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c36-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    await admin.query(
      `update public.arrivals set state = 'duplicate_suspected',
              scan_verdict = 'clean', scan_at = now()
        where id = $1`, [a]);

    // S1 holds the per-circle lock in an open transaction…
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    // …the founder's resolution blocks on it…
    await asUser(s2, fx.u1);
    const p2 = s2.query(`select hc.resolve_duplicate($1, 'different')`, [a])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.resolve_duplicate%', 'resolve backend');
    await waitForLockWait(admin, pid2, 's2 resolution on the circle lock');

    // …a freeze commits mid-wait…
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');

    const e2 = await withTimeout(p2, 'case36 resolution after freeze');
    const st = (await admin.query(
      `select a.state::text as s,
              not exists (select 1 from public.pipeline_outbox o
                          where o.arrival_id = a.id) as noqueue,
              not exists (select 1 from public.pipeline_leases l
                          where l.arrival_id = a.id and l.closed_at is null) as nolease
       from public.arrivals a where a.id = $1`, [a])).rows[0];
    check('case36 (R-rule): a freeze committing while resolve_duplicate waits DEFEATS it (freeze_active) — the suspect stays parked, no open lease, no re-queue row',
      e2 !== null && e2.code === 'P0001' && e2.message === 'freeze_active'
        && st.s === 'duplicate_suspected' && st.noqueue === true && st.nolease === true,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} state=${st.s} noqueue=${st.noqueue} nolease=${st.nolease}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 37: canonical-original duplicates under concurrent scans (4A M8) ----

async function case37(admin) {
  const fx = await mkCircle(admin, 'c37');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const sha = createHash('sha256').update('c37-same-bytes').digest('hex');
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c37-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    const b = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c37-b') as id`,
      [fx.c, fx.s])).rows[0].id;
    // Both copies STORED before either scans (the external pass's defect
    // shape); received_at staggered explicitly so a is the canonical.
    await admin.query(
      `update public.arrivals
          set state = 'stored', content_sha256 = decode($2, 'hex'),
              storage_key = 'circle/' || circle_id || '/arrival/' || id || '/' || $2,
              byte_size = 10,
              received_at = case when id = $1 then now() - interval '1 minute'
                                 else now() end
        where id in ($1, $3)`, [a, sha, b]);
    const la = (await admin.query(`select * from hc.claim_stage($1, 'scan')`, [a]))
      .rows[0].lease_id;
    const lb = (await admin.query(`select * from hc.claim_stage($1, 'scan')`, [b]))
      .rows[0].lease_id;

    await s1.query(`set role hc_pipeline`);
    await s2.query(`set role hc_pipeline`);
    // Fire both finalizers concurrently; the per-circle lock serializes
    // them in whichever order it admits — the outcome must not depend on it.
    const pa = s1.query(
      `select hc.finalize_scan($1, $2, 'clean', '{}'::jsonb)::text as r`,
      [a, la]).then(r => r.rows[0].r).catch(e => e);
    const pb = s2.query(
      `select hc.finalize_scan($1, $2, 'clean', '{}'::jsonb)::text as r`,
      [b, lb]).then(r => r.rows[0].r).catch(e => e);
    const ra = await withTimeout(pa, 'case37 finalize_scan A');
    const rb = await withTimeout(pb, 'case37 finalize_scan B');

    const st = (await admin.query(
      `select
         (select state::text from public.arrivals where id = $1) as sa,
         (select state::text from public.arrivals where id = $2) as sb`,
      [a, b])).rows[0];
    check('case37 (round-12 X2): identical copies scanned clean concurrently — exactly ONE suspect, and it is the later copy; the canonical earliest stays scanned (order-independent by construction: detection reads row existence, not scan order)',
      ra === 'advanced' && rb === 'advanced'
        && st.sa === 'scanned' && st.sb === 'duplicate_suspected',
      `rA=${ra instanceof Error ? ra.message : ra} rB=${rb instanceof Error ? rb.message : rb} canonical=${st.sa} later=${st.sb}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 38: infected-wins under a racing clean verdict (4A M8) --------------

async function case38(admin) {
  const fx = await mkCircle(admin, 'c38');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const sha = createHash('sha256').update('c38-same-bytes').digest('hex');
    // d is the EARLIER copy (its clean scan raises no suspect and writes
    // the cache); c is the later copy whose scanner says infected.
    const d = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c38-d') as id`,
      [fx.c, fx.s])).rows[0].id;
    const c = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c38-c') as id`,
      [fx.c, fx.s])).rows[0].id;
    await admin.query(
      `update public.arrivals
          set state = 'stored', content_sha256 = decode($2, 'hex'),
              storage_key = 'circle/' || circle_id || '/arrival/' || id || '/' || $2,
              byte_size = 10,
              received_at = case when id = $1 then now() - interval '1 minute'
                                 else now() end
        where id in ($1, $3)`, [d, sha, c]);
    const ld = (await admin.query(`select * from hc.claim_stage($1, 'scan')`, [d]))
      .rows[0].lease_id;
    const lc = (await admin.query(`select * from hc.claim_stage($1, 'scan')`, [c]))
      .rows[0].lease_id;

    await s1.query(`set role hc_pipeline`);
    await s2.query(`set role hc_pipeline`);
    const pd = s1.query(
      `select hc.finalize_scan($1, $2, 'clean', '{}'::jsonb)::text as r`,
      [d, ld]).then(r => r.rows[0].r).catch(e => e);
    const pc = s2.query(
      `select hc.finalize_scan($1, $2, 'infected', '{"sig":"c38"}'::jsonb)::text as r`,
      [c, lc]).then(r => r.rows[0].r).catch(e => e);
    const rd = await withTimeout(pd, 'case38 finalize_scan clean');
    const rc = await withTimeout(pc, 'case38 finalize_scan infected');

    const row = (await admin.query(
      `select r.verdict, r.expires_at is null as retained
       from public.scan_results r where r.content_sha256 = decode($1, 'hex')`,
      [sha])).rows[0];
    check('case38 (round-12 X1): an infected and a clean verdict racing one sha — the row ends infected/expires-null in EITHER commit order (clean-first overwritten upward, infected-first immune to the downgrade arm): the §11.5 evidence is monotonic under the race',
      rd === 'advanced' && rc === 'advanced'
        && row && row.verdict === 'infected' && row.retained === true,
      `rClean=${rd instanceof Error ? rd.message : rd} rInfected=${rc instanceof Error ? rc.message : rc} verdict=${row ? row.verdict : 'MISSING'} retained=${row ? row.retained : 'MISSING'}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- 5A fixtures ---------------------------------------------------------------

// A current profile fact + a drafted CONFLICT proposal quoting it (the
// real drafting path; record-write triggers off for the fixture insert).
async function mkConflict(admin, fx, field, value) {
  await admin.query(`set session_replication_role = replica`);
  const f = (await admin.query(
    `insert into public.profile_facts
       (circle_id, subject_id, field, value, risk_class, domain, approved_by,
        approved_at, approver_display_name, taint)
     values ($1, $2, $3, to_jsonb($4::text), 'high', 'health', $5,
             now() - interval '30 days', 'Sarah', '{health}')
     returning id`,
    [fx.c, fx.s, field, value, fx.u1])).rows[0].id;
  await admin.query(`set session_replication_role = default`);
  const p = (await admin.query(
    `select hc.draft_proposal($1, $2, $3, 'conflict', jsonb_build_object(
       'field', $4::text, 'value', 'the new value', 'risk_class', 'high',
       'domain', 'health',
       'parents', jsonb_build_array(jsonb_build_object('type', 'profile_fact', 'id', $5::uuid)),
       'task', jsonb_build_object('title', 'Sort out ' || $4::text))) as id`,
    [fx.a, fx.c, fx.s, field, f])).rows[0].id;
  return { fact: f, proposal: p };
}

// --- case 39: conflict approval version race (5A M4; §4.9) --------------------

async function case39(admin) {
  const fx = await mkCircle(admin, 'c39');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const cf = await mkConflict(admin, fx, 'allergy_status', 'penicillin');

    // S1: Sarah approves USE_NEW, held open — she owns the proposal row lock.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(
      `select hc.approve_proposal($1, 1, 'c39-k1',
         '{"conflict_outcome":"use_new","confirm_high":true}'::jsonb)`,
      [cf.proposal]);

    // S2: Priya's KEEP blocks behind it (her own key)…
    await asUser(s2, fx.u2);
    const p2 = s2.query(
      `select hc.approve_proposal($1, 1, 'c39-k2',
         '{"conflict_outcome":"keep"}'::jsonb)`,
      [cf.proposal]).then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.approve_proposal%', 'approve backend');
    await waitForLockWait(admin, pid2, 's2 approval behind s1');

    // …and Sarah's decision commits first.
    await s1.query('commit');

    const e2 = await withTimeout(p2, 'case39 second coordinator');
    const st = (await admin.query(
      `select (select p.status from public.proposals p where p.id = $1) as status,
              (select count(*) from public.proposal_commits pc where pc.proposal_id = $1)::int as commits,
              (select count(*) from public.profile_facts pf
                where pf.subject_id = $2 and pf.field = 'allergy_status'
                  and pf.superseded_at is null)::int as current_rows,
              (select pf.superseded_at is not null from public.profile_facts pf
                where pf.id = $3) as old_superseded`,
      [cf.proposal, fx.s, cf.fact])).rows[0];
    check('case39 (5A M4, §4.9): two coordinators race ONE conflict — the row lock serialises, the first decision stands (use_new applied exactly once), the second refuses on the decided proposal',
      e2 !== null && e2.code === 'P0001'
        && st.status === 'approved' && st.commits === 1
        && st.current_rows === 1 && st.old_superseded === true,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} status=${st.status} commits=${st.commits} current=${st.current_rows} oldSuperseded=${st.old_superseded}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 40: same key, different outcome, raced (5A M4 — the ING-11 identity) --

async function case40(admin) {
  const fx = await mkCircle(admin, 'c40');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const cf = await mkConflict(admin, fx, 'diet_note', 'low sodium');

    // S1: Sarah's USE_NEW under key K, held open — the attempts PK row is hers.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(
      `select hc.approve_proposal($1, 1, 'c40-K',
         '{"conflict_outcome":"use_new","confirm_high":true}'::jsonb)`,
      [cf.proposal]);

    // S2: the SAME key with a DIFFERENT outcome blocks on the PK tuple…
    await asUser(s2, fx.u1);
    const p2 = s2.query(
      `select hc.approve_proposal($1, 1, 'c40-K',
         '{"conflict_outcome":"keep"}'::jsonb)`,
      [cf.proposal]).then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.approve_proposal%', 'approve backend');
    await waitForLockWait(admin, pid2, 's2 same-key approval behind s1');

    // …S1 commits, the unique violation resolves, the outcomes differ.
    await s1.query('commit');

    const e2 = await withTimeout(p2, 'case40 same-key different-outcome');
    const st = (await admin.query(
      `select (select count(*) from public.approval_attempts aa
                where aa.idempotency_key = 'c40-K')::int as attempts,
              (select aa.conflict_outcome from public.approval_attempts aa
                where aa.idempotency_key = 'c40-K') as outcome,
              (select count(*) from public.tasks t
                where t.circle_id = $1 and t.source_proposal_id = $2)::int as tasks,
              (select count(*) from public.profile_facts pf
                where pf.subject_id = $3 and pf.field = 'diet_note'
                  and pf.superseded_at is null)::int as current_rows`,
      [fx.c, cf.proposal, fx.s])).rows[0];
    check('case40 (5A M4, the ING-11 identity): one key raced with TWO outcomes — the PK serialises, the stored outcome stands (use_new), the different outcome refuses and writes NOTHING',
      e2 !== null && e2.code === 'P0001'
        && st.attempts === 1 && st.outcome === 'use_new'
        && st.tasks === 0 && st.current_rows === 1,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} attempts=${st.attempts} outcome=${st.outcome} tasks=${st.tasks} current=${st.current_rows}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 41: stage-2 resolve vs a freeze mid-wait (5A M5; R-rule) ------------

async function case41(admin) {
  const fx = await mkCircle(admin, 'c41');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // A stage-2 suspect, fixture-level, with its canonical target set
    // (the detection path is 055's; this case races the RESOLUTION).
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c41-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    await admin.query(
      `update public.arrivals
          set state = 'duplicate_suspected_stage2', scan_verdict = 'clean',
              scan_at = now(), duplicate_of_document_id = $2
        where id = $1`, [a, fx.doc]);

    // S1 holds the per-circle lock in an open transaction…
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    // …the founder's same_thing resolution blocks on it…
    await asUser(s2, fx.u1);
    const p2 = s2.query(`select hc.resolve_duplicate($1, 'same_thing')`, [a])
      .then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.resolve_duplicate%', 'resolve backend');
    await waitForLockWait(admin, pid2, 's2 stage-2 resolution on the circle lock');

    // …a freeze commits mid-wait…
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');

    const e2 = await withTimeout(p2, 'case41 stage-2 resolution after freeze');
    const st = (await admin.query(
      `select a.state::text as s,
              not exists (select 1 from public.provenance_edges e
                          where e.parent_type = 'arrival' and e.parent_id = a.id) as noedge,
              not exists (select 1 from public.pipeline_leases l
                          where l.arrival_id = a.id and l.closed_at is null) as nolease,
              not exists (select 1 from public.pipeline_outbox o
                          where o.arrival_id = a.id) as noqueue
       from public.arrivals a where a.id = $1`, [a])).rows[0];
    check('case41 (5A M5, R-rule): a freeze committing while the STAGE-2 resolution waits DEFEATS it (freeze_active) — the suspect stays parked, no additional-source edge, no open lease, no re-queue',
      e2 !== null && e2.code === 'P0001' && e2.message === 'freeze_active'
        && st.s === 'duplicate_suspected_stage2'
        && st.noedge === true && st.nolease === true && st.noqueue === true,
      `err=${e2 ? e2.code + ':' + e2.message : 'none'} state=${st.s} noedge=${st.noedge} nolease=${st.nolease} noqueue=${st.noqueue}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 42: re-run supersession vs cancellation (5A M3; the ING-08 class) ---

async function case42(admin) {
  const fx = await mkCircle(admin, 'c42');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // Run 1 publishes two facts through the REAL path…
    const w1 = await mkExtracting(admin, fx, 'c42-a');
    await admin.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb)`,
      [w1.arrival, w1.lease, JSON.stringify([
        { field: 'r1_total', value: '812', confidence: 0.9, risk_class: 'standard',
          citation: { page: 1 }, model_id: 'm1', prompt_version: 'p1' },
        { field: 'r1_provider', value: 'Mercy', confidence: 0.9, risk_class: 'standard',
          citation: { page: 1 }, model_id: 'm1', prompt_version: 'p1' },
      ])]);
    // …then the versioned re-run path: state reset, a REAL attempt-2 claim.
    await admin.query(
      `update public.arrivals set state = 'extracting', current_lease_id = null
        where id = $1`, [w1.arrival]);
    const w2 = (await admin.query(
      `select * from hc.claim_stage($1, 'extract', 'm1', 'p2')`,
      [w1.arrival])).rows[0];

    // S1: a member's cancellation, held open — it owns the row and circle locks.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.cancel_arrival($1)`, [w1.arrival]);

    // S2: the re-run's finalization (which would SUPERSEDE run 1's facts)
    // blocks behind it…
    const p2 = s2.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb) as r`,
      [w1.arrival, w2.lease_id, JSON.stringify([
        { field: 'r2_total', value: '900', confidence: 0.9, risk_class: 'standard',
          citation: { page: 1 }, model_id: 'm1', prompt_version: 'p2' },
      ])]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.finalize_extraction%', 'finalize backend');
    await waitForLockWait(admin, pid2, 's2 re-run finalize behind the cancel');

    // …and the cancellation commits first.
    await s1.query('commit');

    const r2 = await withTimeout(p2, 'case42 re-run finalize after cancel');
    const st = (await admin.query(
      `select (select array_agg(e.field order by e.field) from public.extractions e
                where e.arrival_id = $1 and e.superseded_at is null) as live,
              (select count(*) from public.extractions e
                where e.arrival_id = $1 and e.field like 'r2%')::int as r2rows,
              (select r.outcome from public.extraction_runs r where r.lease_id = $2) as run2,
              (select a.state::text from public.arrivals a where a.id = $1) as s`,
      [w1.arrival, w2.lease_id])).rows[0];
    check(`case42 (5A M3, the ING-08 class): cancellation beats the re-run — the supersession never half-runs: run 1's facts stay LIVE untouched, nothing of run 2 lands, run 2 closes cancelled`,
      r2 === 'cancelled'
        && JSON.stringify(st.live) === JSON.stringify(['r1_provider', 'r1_total'])
        && st.r2rows === 0 && st.run2 === 'cancelled' && st.s === 'cancelled',
      `r=${r2 instanceof Error ? r2.message : r2} live=${JSON.stringify(st.live)} r2rows=${st.r2rows} run2=${st.run2} state=${st.s}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 43: record_context_for vs concurrent record writes (5A M2) ----------

async function case43(admin) {
  const fx = await mkCircle(admin, 'c43');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // A current fact and an arrival for the context read.
    await admin.query(`set session_replication_role = replica`);
    const f1 = (await admin.query(
      `insert into public.profile_facts
         (circle_id, subject_id, field, value, risk_class, domain, approved_by,
          approved_at, approver_display_name, taint)
       values ($1, $2, 'bp_medication', '"v1"', 'high', 'health', $3,
               now() - interval '10 days', 'Sarah', '{health}')
       returning id`, [fx.c, fx.s, fx.u1])).rows[0].id;
    await admin.query(`set session_replication_role = default`);
    const a = (await admin.query(
      `select hc.create_arrival($1, $2, 'upload', p_ingest_idempotency_key => 'c43-a') as id`,
      [fx.c, fx.s])).rows[0].id;
    await admin.query(
      `update public.arrivals set state = 'interpreting' where id = $1`, [a]);

    // S2 opens the supersede-and-replace WITHOUT committing (triggers off:
    // fixture-grade record write, the mkCircle discipline)…
    await s2.query(`set session_replication_role = replica`);
    await s2.query('begin');
    await s2.query(
      `update public.profile_facts set superseded_at = now() where id = $1`, [f1]);
    await s2.query(
      `insert into public.profile_facts
         (circle_id, subject_id, field, value, risk_class, domain, approved_by,
          approved_at, approver_display_name, taint, supersedes_id)
       values ($1, $2, 'bp_medication', '"v2"', 'high', 'health', $3,
               now(), 'Sarah', '{health}', $4)`, [fx.c, fx.s, fx.u1, f1]);

    // …S1's pipeline read runs MID-WRITE: one statement, one snapshot.
    await s1.query(`set role hc_pipeline`);
    const mid = (await s1.query(
      `select hc.record_context_for($1) as j`, [a])).rows[0].j;
    const midRows = (mid.profile_facts.rows ?? []).filter(r => r.field === 'bp_medication');

    check('case43a (5A M2): a context read racing an uncommitted supersede-and-replace sees the PRIOR state whole — exactly one current row, the old value, never torn',
      midRows.length === 1 && JSON.stringify(midRows[0].value) === '"v1"',
      `rows=${midRows.length} value=${JSON.stringify(midRows[0]?.value)}`);

    // The write commits; the next read sees the NEW state whole.
    await s2.query('commit');
    const after = (await s1.query(
      `select hc.record_context_for($1) as j`, [a])).rows[0].j;
    const afterRows = (after.profile_facts.rows ?? []).filter(r => r.field === 'bp_medication');

    check('case43b (5A M2): after the commit the next read sees the NEW state whole — exactly one current row, the new value; no interleaving shows zero or two',
      afterRows.length === 1 && JSON.stringify(afterRows[0].value) === '"v2"',
      `rows=${afterRows.length} value=${JSON.stringify(afterRows[0]?.value)}`);
  } finally {
    await s1.query('reset role').catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s2.query(`set session_replication_role = default`).catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 44: stage-2 detection vs a document committing mid-wait -----------
//
// Round-15 finding 1 (HIGH), the behavioural half of pgTAP 056 test 1.
// hc.finalize_extraction used to ask the duplicate question with NO lock
// held and only then block on the per-circle taint lock inside
// hc.advance_arrival. A matching document committing in that window was
// invisible to the detector, so the arrival advanced to 'extracted' and
// the settled stage-2 question was skipped — a state that depended on
// transaction timing. The fix hoists the R-rule lock ABOVE detection:
// hc.approve_proposal files its document under the same key, so the
// predicate now runs on the far side of the same serialization point and
// a fresh statement snapshot sees the committed row.

async function case44(admin) {
  const fx = await mkCircle(admin, 'c44');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // The arrival about to finalize, claimed for extract so a real lease
    // and extraction run exist (the M3 mint point).
    const a = (await admin.query(
      `insert into public.arrivals (circle_id, subject_id, channel, state, sender_address)
       values ($1, $2, 'email', 'extracting', 'billing@clinic.example')
       returning id`, [fx.c, fx.s])).rows[0].id;
    const lease = (await admin.query(
      `select lease_id from hc.claim_stage($1, 'extract', 'm1', 'p1')`, [a])).rows[0].lease_id;

    // S1 holds the per-circle lock and files a MATCHING document inside
    // its open transaction — uncommitted, so S2's snapshot cannot see it.
    await s1.query('begin');
    // The fixture document is filed directly, so the DEFERRED record-claim
    // trigger (record_write_unclaimed, which fires at COMMIT) is suppressed
    // for this session exactly as mkCircle does for its baseline rows.
    await s1.query(`set session_replication_role = replica`);
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);
    const cArr = (await s1.query(
      `insert into public.arrivals (circle_id, subject_id, channel, state, sender_address)
       values ($1, $2, 'email', 'filed', 'billing@clinic.example')
       returning id`, [fx.c, fx.s])).rows[0].id;
    await s1.query(
      `insert into public.extractions (arrival_id, circle_id, subject_id, field, value,
         confidence, risk_class, citation, model_id, prompt_version)
       values ($1, $2, $3, 'document_date', '"2026-07-12"'::jsonb, 0.9, 'standard',
               '{"page": 1}'::jsonb, 'm0', 'p0'),
              ($1, $2, $3, 'provider', '"Mercy Hospital"'::jsonb, 0.9, 'standard',
               '{"page": 1}'::jsonb, 'm0', 'p0')`, [cArr, fx.c, fx.s]);
    const cDoc = (await s1.query(
      `insert into public.documents (circle_id, subject_id, title, category, summary_text,
         artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
       values ($1, $2, 'Discharge summary (Jul 12)', 'medical', 'fixture', $3,
               now(), $4, now(), 'Sarah', '{health}')
       returning id`, [fx.c, fx.s, cArr, fx.u1])).rows[0].id;

    // S2 finalizes the same-key extraction and must BLOCK on the circle lock.
    const facts = JSON.stringify([
      { field: 'document_date', value: '2026-07-12', confidence: 0.9, risk_class: 'standard',
        citation: { page: 1 }, model_id: 'm1', prompt_version: 'p1' },
      { field: 'provider', value: 'Mercy Hospital', confidence: 0.9, risk_class: 'standard',
        citation: { page: 1 }, model_id: 'm1', prompt_version: 'p1' },
    ]);
    const props = JSON.stringify([
      { kind: 'document', payload: { title: 'Fixture doc', category: 'medical' } },
    ]);
    const p2 = s2.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, $4::jsonb) as r`,
      [a, lease, facts, props]).then(r => r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.finalize_extraction%', 'finalize backend');
    await waitForLockWait(admin, pid2, 's2 finalize on the circle lock');

    // …the matching document commits mid-wait.
    await s1.query('commit');
    await s1.query(`set session_replication_role = default`);

    const r2 = await withTimeout(p2, 'case44 finalize after the document commits');
    const st = (await admin.query(
      `select a.state::text as s, a.duplicate_of_document_id as d,
              exists (select 1 from public.extractions e
                       where e.arrival_id = a.id and e.superseded_at is null) as facts_landed,
              exists (select 1 from public.extraction_runs r
                       where r.lease_id = $2 and r.outcome = 'published') as run_published
       from public.arrivals a where a.id = $1`, [a, lease])).rows[0];
    check('case44 (5A M6, round-15 finding 1): a matching document committing while finalization WAITS on the circle lock is SEEN — the arrival lands on duplicate_suspected_stage2 pointing at it, and the work answer still lands in full (facts published, run published)',
      !(r2 instanceof Error) && st.s === 'duplicate_suspected_stage2' && st.d === cDoc
        && st.facts_landed === true && st.run_published === true,
      `err=${r2 instanceof Error ? r2.message : 'none'} state=${st.s} dup=${st.d === cDoc} facts=${st.facts_landed} run=${st.run_published}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.query(`set session_replication_role = default`).catch(() => {});
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- 6A fixtures ---------------------------------------------------------------

// An arrival resting at `proposals_ready` — where slice 5 left it and where
// slice 6 picks it up — carrying `n` pending task proposals.
async function mkReviewable(admin, fx, tag, n) {
  const a = (await admin.query(
    `insert into public.arrivals (circle_id, subject_id, channel, state, storage_key)
     values ($1, $2, 'upload', 'proposals_ready', $3) returning id`,
    [fx.c, fx.s, `orig/circle/${fx.c}/arrival/${tag}`])).rows[0].id;
  const props = [];
  for (let i = 0; i < n; i++) {
    props.push((await admin.query(
      `insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
       values ($1, $2, $3, 'task', jsonb_build_object('title', $4::text), '{schedule}')
       returning id`, [a, fx.c, fx.s, `${tag} item ${i + 1}`])).rows[0].id);
  }
  return { arrival: a, proposals: props };
}

// --- case 45: the LAST two decisions, raced (6A M3) ----------------------------
//
// Two coordinators decide the last two proposals of one arrival at the same
// moment. The terminal arm runs INSIDE each deciding transaction, so the
// question is whether it can fire twice — an arrival that reached `filed`
// and then `nothing_filed`, or two terminal events for one review, would
// both be visible to a family as the record contradicting itself.

async function case45(admin) {
  const fx = await mkCircle(admin, 'c45');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const w = await mkReviewable(admin, fx, 'c45', 2);

    // S1 decides the first of the two and holds the transaction open, so it
    // owns the per-circle advisory lock hc.reject_proposal takes.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    const r1 = (await s1.query(
      `select hc.reject_proposal($1, 1, 'c45-k1', 'wrong') as r`,
      [w.proposals[0]])).rows[0].r;

    // S2 decides the LAST one and must block behind that lock.
    await asUser(s2, fx.u2);
    const p2 = s2.query(
      `select hc.reject_proposal($1, 1, 'c45-k2', 'not_important') as r`,
      [w.proposals[1]]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.reject_proposal%', 'reject backend');
    await waitForLockWait(admin, pid2, 's2 reject on the circle lock');

    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case45 second decision');

    const st = (await admin.query(
      `select (select a.state::text from public.arrivals a where a.id = $1) as s,
              (select count(*)::int from public.arrival_events e
                where e.arrival_id = $1
                  and e.to_state in ('filed', 'nothing_filed')) as terminals,
              (select count(*)::int from public.proposals p
                where p.arrival_id = $1 and p.status = 'rejected') as decided`,
      [w.arrival])).rows[0];

    check('case45 (6A M3): two coordinators deciding the LAST two proposals simultaneously produce EXACTLY ONE terminal transition — the first decision leaves the arrival at "Needs you" because work remains, the second terminalizes it under the same circle lock, and the record never contradicts itself',
      !(r2 instanceof Error)
        && r1.arrival_state === 'proposals_ready'
        && r2.arrival_state === 'nothing_filed'
        && st.s === 'nothing_filed' && st.terminals === 1 && st.decided === 2,
      `err=${r2 instanceof Error ? r2.message : 'none'} first=${r1.arrival_state} second=${r2 instanceof Error ? '-' : r2.arrival_state} state=${st.s} terminals=${st.terminals} decided=${st.decided}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 46: approve versus reject on ONE proposal (6A M3) --------------------
//
// The two decisions are mirrors and they race on the same row. Exactly one
// may land: a proposal that was both approved and rejected would put an
// object in the record with a rejection beside it in the trail.

async function case46(admin) {
  const fx = await mkCircle(admin, 'c46');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const w = await mkReviewable(admin, fx, 'c46', 1);

    // S1 approves and holds the transaction open — it owns the proposal row
    // lock (`for update`) and the per-circle advisory lock.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    const r1 = (await s1.query(
      `select hc.approve_proposal($1, 1, 'c46-approve') as r`,
      [w.proposals[0]])).rows[0].r;

    // S2 rejects the SAME proposal and blocks on the row lock.
    await asUser(s2, fx.u2);
    const p2 = s2.query(
      `select hc.reject_proposal($1, 1, 'c46-reject', 'wrong') as r`,
      [w.proposals[0]]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.reject_proposal%', 'reject backend');
    await waitForLockWait(admin, pid2, 's2 reject behind the approval');

    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case46 loser');

    const st = (await admin.query(
      `select (select p.status from public.proposals p where p.id = $1) as status,
              (select count(*)::int from public.proposal_commits c
                where c.proposal_id = $1) as commits,
              (select count(*)::int from public.approval_attempts a
                where a.proposal_id = $1) as attempts,
              (select a.state::text from public.arrivals a where a.id = $2) as s`,
      [w.proposals[0], w.arrival])).rows[0];

    check('case46 (6A M3): approve versus reject on ONE proposal yields ONE decision — the loser is refused in the approval_refused shape, its idempotency claim rolls back with it (so the key is not burned), and exactly one commit row and one terminal transition stand',
      r2 instanceof Error && /approval_refused/.test(r2.message)
        && r1.status === 'approved' && r1.arrival_state === 'filed'
        && st.status === 'approved' && st.commits === 1 && st.attempts === 1
        && st.s === 'filed',
      `loser=${r2 instanceof Error ? r2.message : `NO ERROR (${JSON.stringify(r2)})`} status=${st.status} commits=${st.commits} attempts=${st.attempts} state=${st.s}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 47: a grant lowered between render and approve (6A M2 / Q7) ---------
//
// §4.9's write-time re-check, now carrying M2's added predicate. The case is
// built so that ONLY the new predicate can refuse: the actor keeps `manage`
// on the proposal's own taint throughout, and loses `view` across all five
// domains while the approval waits on the circle lock. Before Q7 this
// approval SUCCEEDED — the actor could still approve a fact whose source and
// citation had just become invisible to them.

async function case47(admin) {
  const fx = await mkCircle(admin, 'c47');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const w = await mkReviewable(admin, fx, 'c47', 1);

    // S1 holds the circle lock and lowers the approver on the FOUR domains
    // the proposal is not tainted with. `schedule` — the task's own domain —
    // stays at manage.
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);
    await s1.query(
      `update public.access_grants set level = 'summary'
        where member_id = $1 and subject_id = $2 and domain <> 'schedule'`,
      [fx.m2, fx.s]);

    // S2 approves and blocks on that lock.
    await asUser(s2, fx.u2);
    const p2 = s2.query(
      `select hc.approve_proposal($1, 1, 'c47-k') as r`,
      [w.proposals[0]]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.approve_proposal%', 'approve backend');
    await waitForLockWait(admin, pid2, 's2 approve on the circle lock');

    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case47 approve after the grant drops');

    // The isolating assertion: manage-on-taint STILL passes, so the refusal
    // can only be the view-over-all-five predicate M2 added.
    const lv = (await admin.query(
      `select hc.visible_at(hc.ctx_for($1), $2, '{schedule}'::hc.domain[], true,
                            null, null, null)::text as manage_on_taint,
              hc.visible_at(hc.ctx_for($1), $2, hc.all_domains(), true,
                            'arrival', $3, null)::text as view_on_arrival`,
      [fx.u2, fx.s, w.arrival])).rows[0];
    const st = (await admin.query(
      `select (select p.status from public.proposals p where p.id = $1) as status,
              (select count(*)::int from public.tasks t
                where t.source_proposal_id = $1) as objects,
              (select a.state::text from public.arrivals a where a.id = $2) as s`,
      [w.proposals[0], w.arrival])).rows[0];

    check('case47 (6A M2, Q7): a grant lowered while an approval WAITS defeats it through the ADDED predicate alone — the actor still clears manage on the proposal\'s own taint and no longer clears view across all five domains on the arrival, so the source and citation went dark and the write is refused; nothing lands and the arrival stays at "Needs you"',
      r2 instanceof Error && /approval_refused/.test(r2.message)
        && lv.manage_on_taint === 'manage' && lv.view_on_arrival !== 'view'
        && st.status === 'pending' && st.objects === 0 && st.s === 'proposals_ready',
      `err=${r2 instanceof Error ? r2.message : `NO ERROR (${JSON.stringify(r2)})`} manage_on_taint=${lv.manage_on_taint} view_on_arrival=${lv.view_on_arrival} status=${st.status} objects=${st.objects} state=${st.s}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 48: a freeze committing mid-decision (the R-rule, on reject) --------
//
// The round-6 R-rule, carried to the mirror hc.reject_proposal introduces. A
// freeze suspends ALL interactive access (§3.8), and a rejection is an
// interactive act on the record, so the refusal must keep its NAMED
// signature rather than falling through to the generic post-lock one.

async function case48(admin) {
  const fx = await mkCircle(admin, 'c48');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const w = await mkReviewable(admin, fx, 'c48', 2);

    // S1 holds the circle lock and opens a freeze.
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);
    await s1.query(
      `insert into public.freezes (circle_id, state) values ($1, 'open')`, [fx.c]);

    // S2 rejects and blocks.
    await asUser(s2, fx.u1);
    const p2 = s2.query(
      `select hc.reject_proposal($1, 1, 'c48-k', 'other') as r`,
      [w.proposals[0]]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.reject_proposal%', 'reject backend');
    await waitForLockWait(admin, pid2, 's2 reject on the circle lock');

    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case48 reject after the freeze');

    const st = (await admin.query(
      `select (select p.status from public.proposals p where p.id = $1) as status,
              (select count(*)::int from public.approval_attempts a
                where a.proposal_id = $1) as attempts,
              (select a.state::text from public.arrivals a where a.id = $2) as s`,
      [w.proposals[0], w.arrival])).rows[0];

    check('case48 (6A M3, the R-rule): a freeze committing while a REJECTION waits on the per-circle lock defeats it with the NAMED freeze_active signature — the predicate evaluates under the serialization point, the proposal stays pending, and the idempotency claim rolls back so the key is not burned',
      r2 instanceof Error && /freeze_active/.test(r2.message)
        && st.status === 'pending' && st.attempts === 0
        && st.s === 'proposals_ready',
      `err=${r2 instanceof Error ? r2.message : `NO ERROR (${JSON.stringify(r2)})`} status=${st.status} attempts=${st.attempts} state=${st.s}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 49: the rendition manifest versus cancellation (6A M4 / §4.5) -------
//
// The manifest is written in finalize_extraction's transaction precisely so
// it is the WINNER's record of what was rendered. §4.5's cancel window is
// the case that proves it: a cancellation committing mid-wait must leave no
// manifest behind, or the screen would later describe pages belonging to a
// rendering that was discarded.

async function case49(admin) {
  const fx = await mkCircle(admin, 'c49');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const w = await mkExtracting(admin, fx, 'c49-a');

    // S1: a member's cancellation, held open.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.cancel_arrival($1)`, [w.arrival]);

    // S2: the worker finalizes WITH a manifest, and blocks.
    const rendition = JSON.stringify({ page_count: 3, page_exts: ['jpg', 'jpg', 'png'] });
    const p2 = s2.query(
      `select hc.finalize_extraction($1, $2, $3::jsonb, '[]'::jsonb, $4::jsonb) as r`,
      [w.arrival, w.lease, FACTS, rendition]).then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.finalize_extraction%',
      'finalize backend');
    await waitForLockWait(admin, pid2, 's2 finalize behind the cancel');

    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case49 finalize after cancel');

    const n = (await admin.query(
      `select (select count(*)::int from public.arrival_renditions r
                where r.arrival_id = $1) as renditions,
              (select count(*)::int from public.extractions e
                where e.arrival_id = $1) as facts,
              (select a.state::text from public.arrivals a where a.id = $1) as s`,
      [w.arrival])).rows[0];

    check('case49 (6A M4, §4.5): a cancellation committing while finalization WAITS discards the manifest with the rest of the answer — no rendition row, no facts, the arrival cancelled. The manifest is the WINNER\'s record of what was rendered, so a discarded attempt can never leave the screen describing pages that were thrown away',
      r2 === 'cancelled' && n.renditions === 0 && n.facts === 0 && n.s === 'cancelled',
      `r=${r2} renditions=${n.renditions} facts=${n.facts} state=${n.s}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- 7A: the four named cases (slice-7 plan, "7A test plan") ----------------

// A fresh account + live member of fx.c with the given tier and grants on
// fx.s, written as postgres under replica (the mkCircle precedent).
async function mkMember(admin, fx, name, tier, grants) {
  const u = randomUUID();
  await admin.query(`set session_replication_role = replica`);
  await admin.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated',
             $2, 'x', now(), now(), now(), '{}', '{}')`, [u, `${u}@fixture.local`]);
  await admin.query(
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`, [u, name]);
  const m = (await admin.query(
    `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
     values ($1, $2, $3, $4) returning id`, [fx.c, u, tier, name])).rows[0].id;
  for (const [domain, level] of Object.entries(grants)) {
    await admin.query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       values ($1, $2, $3, $4, $5, $6)`, [fx.c, m, fx.s, domain, level, fx.u1]);
  }
  await admin.query(`set session_replication_role = default`);
  return { u, m };
}

// --- case 50: 7A M1 — assign vs remove_member on ONE member ------------------

async function case50(admin) {
  const fx = await mkCircle(admin, 'c50');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const lena = await mkMember(admin, fx, 'Lena', 'family', { schedule: 'summary' });

    // (a) The removal commits while the assignment WAITS on the circle lock.
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);

    await asUser(s2, fx.u2);
    const pa = s2.query(`select hc.assign_task($1, $2)`, [fx.task, lena.m])
      .then(() => null).catch(e => e);
    const pidA = await findActivePid(admin, 'select hc.assign_task%', 'assign_task backend');
    await waitForLockWait(admin, pidA, 's2 assign blocked on the circle lock');

    // The removal's committed effect, as hc.remove_member leaves it.
    await admin.query(`set session_replication_role = replica`);
    await admin.query(
      `update public.circle_members set removed_at = now(), removed_by = $1 where id = $2`,
      [fx.u1, lena.m]);
    await admin.query(`delete from public.access_grants where member_id = $1`, [lena.m]);
    await admin.query(`set session_replication_role = default`);

    await s1.query('commit');
    const ea = await withTimeout(pa, 'case50a assign after the removal');
    const stA = (await admin.query(
      `select (select t.owner_member_id from public.tasks t where t.id = $1) as owner,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2 and l.event_type in ('task_assigned', 'task_reassigned')) as assigned`,
      [fx.task, fx.c])).rows[0];
    check('case50a (7A M1): a member REMOVAL committing while an assignment to her WAITS on the circle lock defeats it in the one shape — the assignee is re-read under the lock, the task stays nobody\'s, nothing is logged',
      ea !== null && ea.code === 'P0001' && ea.message === 'assign_refused'
        && stA.owner === null && stA.assigned === 0,
      `err=${ea ? ea.code + ':' + ea.message : 'none'} owner=${stA.owner} assigned=${stA.assigned}`);

    // (b) The other order: the assignment commits first, then the removal
    // UNASSIGNS (PRD §8.8) — one wins, the other reduces.
    const omar = await mkMember(admin, fx, 'Omar', 'family', { schedule: 'summary' });
    await asUser(s2, fx.u2);
    const rb = (await s2.query(`select (hc.assign_task($1, $2)) ->> 'path' as p`, [fx.task, omar.m]))
      .rows[0].p;
    await asUser(s1, fx.u1);
    const rr = (await s1.query(`select (hc.remove_member($1)) ->> 'unassigned_task_count' as n`, [omar.m]))
      .rows[0].n;
    const stB = (await admin.query(
      `select (select t.owner_member_id from public.tasks t where t.id = $1) as owner,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2 and l.event_type = 'task_unassigned') as unassigned`,
      [fx.task, fx.c])).rows[0];
    check('case50b (7A M1): in the other order the assignment lands and the removal UNASSIGNS it (PRD §8.8) — the task surfaces for the coordinator with one task_unassigned entry; either way exactly one of the two acts stands',
      rb === 'plain' && rr === '1' && stB.owner === null && stB.unassigned === 1,
      `path=${rb} unassigned_by_removal=${rr} owner=${stB.owner} unassigned_entries=${stB.unassigned}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 51: 7A M3 — two coordinators re-categorising ONE document ---------

async function case51(admin) {
  const fx = await mkCircle(admin, 'c51');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const kim = await mkMember(admin, fx, 'Kim', 'coordinator',
      { memories: 'manage', health: 'manage', schedule: 'manage', documents: 'manage', finances: 'manage' });

    // S1 (Sarah) moves the invoice financial → legal, confirmed against the
    // category she saw (ADR-0033 D19.5), and holds the transaction open.
    await asUser(s1, fx.u1);
    await s1.query('begin');
    const r1 = (await s1.query(
      `select (hc.recategorize_document($1, 'legal', 'financial')) ->> 'changed' as c`, [fx.doc])).rows[0].c;

    // S2 (Kim) makes the SAME move, confirmed against the same sentence (the
    // invoice is still financial when she reads it), and blocks on the lock.
    await asUser(s2, kim.u);
    const p2 = s2.query(`select hc.recategorize_document($1, 'legal', 'financial') as r`, [fx.doc])
      .then(r => r.rows[0].r).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.recategorize_document%', 'recategorize backend');
    await waitForLockWait(admin, pid2, 's2 recategorize blocked on the circle lock');

    await s1.query('commit');
    const r2 = await withTimeout(p2, 'case51 second move after the first commits');

    const st = (await admin.query(
      `select (select d.category::text || '/' || d.taint::text from public.documents d where d.id = $1) as doc,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2 and l.event_type = 'audience_changed'
                  and l.object_id = $1 and l.actor_account_id is not null) as person_entries,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2 and l.event_type = 'audience_changed'
                  and l.object_id = $1 and l.actor_display_name = 'Reclassification') as machine_entries`,
      [fx.doc, fx.c])).rows[0];
    check('case51 (7A M3 · ADR-0033 D19.5): two coordinators re-categorising ONE document to the same category serialise on the circle lock — the second re-reads the MOVED row, and the sentence she confirmed ("financial → legal") no longer describes it: refused with the NAMED document_changed, never silently folded into her confirmation (R2/F-6). ONE audience change, ONE person entry (plus the taint machinery\'s one), and the row reads legal/{documents}',
      r1 === 'true' && r2 instanceof Error && r2.code === 'P0001' && r2.message === 'document_changed'
        && st.doc === 'legal/{documents}' && st.person_entries === 1 && st.machine_entries === 1,
      `first=${r1} second=${r2 instanceof Error ? r2.message : JSON.stringify(r2)} doc=${st.doc} person=${st.person_entries} machine=${st.machine_entries}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 52: 7A M1 — unassign racing a coordinator's KEEP ------------------

async function case52(admin) {
  const fx = await mkCircle(admin, 'c52');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // Lena holds health view and no schedule: the {schedule} task is a
    // crossing, so Sarah assigns it by PATH 2 naming the invoice.
    const lena = await mkMember(admin, fx, 'Lena', 'family', { health: 'view' });
    const assignPath2 = async (who) => {
      const token = await mintStepUp(admin, fx.u1, 'share_object',
        `task:${fx.task}+document:${fx.doc}`);
      await asUser(s2, fx.u1);
      const r = (await s2.query(
        `select hc.assign_task($1, $2, null, $3, $4) as r`, [fx.task, who.m, fx.doc, token]))
        .rows[0].r;
      const shares = (await admin.query(
        `select sh.id, sh.object_type::text as t from public.object_shares sh
          where sh.created_by_assignment_of = $1 and sh.member_id = $2 and sh.revoked_at is null`,
        [fx.task, who.m])).rows;
      return { path: r.path, doc: shares.find(s => s.t === 'document')?.id,
               task: shares.find(s => s.t === 'task')?.id };
    };
    const shareState = async () =>
      (await admin.query(
        `select string_agg(sh.object_type::text || ':' || (sh.revoked_at is null)::text, ',' order by sh.object_type, sh.granted_at) as s,
                (select count(*)::int from public.access_log l
                  where l.circle_id = $2 and l.event_type = 'task_unassigned') as entries
           from public.object_shares sh where sh.created_by_assignment_of = $1`,
        [fx.task, fx.c])).rows[0];

    // (a) The coordinator's KEEP commits while a plain unassign waits.
    const a = await assignPath2(lena);
    await asUser(s1, fx.u1);
    await s1.query('begin');
    await s1.query(`select hc.unassign_task($1, array[$2::uuid])`, [fx.task, a.doc]);

    await asUser(s2, fx.u2);
    const pa = s2.query(`select hc.unassign_task($1)`, [fx.task]).then(() => null).catch(e => e);
    const pidA = await findActivePid(admin, 'select hc.unassign_task%', 'unassign backend');
    await waitForLockWait(admin, pidA, 's2 plain unassign blocked behind the keep');
    await s1.query('commit');
    const ea = await withTimeout(pa, 'case52a plain unassign after the keep');
    const stA = await shareState();
    check('case52a (7A M1): a coordinator\'s unassign KEEPING the document share commits while a plain unassign waits — the second re-reads a task nobody holds and refuses; the kept share\'s state is the COMMITTED one (document live, task share revoked), one task_unassigned entry',
      a.path === 'share' && ea !== null && ea.code === 'P0001' && ea.message === 'unassign_refused'
        && stA.s === 'document:true,task:false' && stA.entries === 1,
      `path=${a.path} err=${ea ? ea.code + ':' + ea.message : 'none'} shares=${stA.s} entries=${stA.entries}`);

    // (b) The other order: the plain unassign commits while the keep waits —
    // and the SECOND cycle of the same task goes to ANOTHER person. Lena's
    // kept document share from (a) is left exactly as the coordinator left
    // it: live, still carrying this task's marker. That is the state
    // ADR-0033 cluster B is about (R1/F-2, R2/F-1, R6/F-2): this step used
    // to revoke it by hand, and without that the plain unassign below
    // revoked it as if it were Ruth's.
    const ruth = await mkMember(admin, fx, 'Ruth', 'family', { health: 'view' });
    const b = await assignPath2(ruth);
    await asUser(s1, fx.u2);
    await s1.query('begin');
    await s1.query(`select hc.unassign_task($1)`, [fx.task]);

    await asUser(s2, fx.u1);
    const pb = s2.query(`select hc.unassign_task($1, array[$2::uuid])`, [fx.task, b.doc])
      .then(() => null).catch(e => e);
    const pidB = await findActivePid(admin, 'select hc.unassign_task%', 'unassign (keep) backend');
    await waitForLockWait(admin, pidB, 's2 keep blocked behind the plain unassign');
    await s1.query('commit');
    const eb = await withTimeout(pb, 'case52b keep after the plain unassign');
    const stB = await shareState();
    check('case52b (7A M1 · ADR-0033 cluster B): in the other order the plain unassign commits and the KEEP arrives at a task nobody holds — refused whole, and the shares stand as the first unassign left them: both shares RUTH\'s cycle created revoked, LENA\'s kept document share from (a) untouched by a cycle that was not hers, a second task_unassigned entry and no third',
      b.path === 'share' && eb !== null && eb.code === 'P0001' && eb.message === 'unassign_refused'
        && stB.s === 'document:true,document:false,task:false,task:false' && stB.entries === 2,
      `path=${b.path} err=${eb ? eb.code + ':' + eb.message : 'none'} shares=${stB.s} entries=${stB.entries}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 53: 7A M1 — a freeze committing mid-assignment (the R-rule) -------

async function case53(admin) {
  const fx = await mkCircle(admin, 'c53');
  const s1 = await connect();
  const s2 = await connect();
  try {
    const lena = await mkMember(admin, fx, 'Lena', 'family', { health: 'view' });

    // (a) A plain assignment to Priya (manage×5) waits on the lock; the
    // freeze commits mid-wait.
    await s1.query('begin');
    await s1.query(`select pg_advisory_xact_lock(hashtext('taint:' || $1::text))`, [fx.c]);
    await asUser(s2, fx.u1);
    const pa = s2.query(`select hc.assign_task($1, $2)`, [fx.task, fx.m2]).then(() => null).catch(e => e);
    const pidA = await findActivePid(admin, 'select hc.assign_task%', 'assign backend');
    await waitForLockWait(admin, pidA, 's2 assign blocked on the circle lock');
    await admin.query(`insert into public.freezes (circle_id) values ($1)`, [fx.c]);
    await s1.query('commit');
    const ea = await withTimeout(pa, 'case53a assign after the freeze');

    // (b) Under the same freeze, a PATH-1 assignment (Lena cannot clear
    // {schedule}) — nothing is written: no owner, no instruction row.
    await asUser(s2, fx.u1);
    const eb = await s2.query(`select hc.assign_task($1, $2, 'Pick up the prescription')`, [fx.task, lena.m])
      .then(() => null).catch(e => e);

    const st = (await admin.query(
      `select (select t.owner_member_id from public.tasks t where t.id = $1) as owner,
              (select count(*)::int from public.tasks i where i.written_from_task_id = $1) as instructions,
              (select count(*)::int from public.object_shares sh where sh.created_by_assignment_of = $1) as shares,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2 and l.event_type in ('task_assigned', 'task_reassigned')) as entries`,
      [fx.task, fx.c])).rows[0];
    check('case53 (7A M1, the R-rule): a freeze committing while an assignment WAITS on the circle lock defeats it with the NAMED freeze_active, and under that freeze a written instruction is refused the same way — no holder, no instruction row, no share, no entry: "no new grants under any freeze" (PRD §7.5)',
      ea !== null && ea.code === 'P0001' && ea.message === 'freeze_active'
        && eb !== null && eb.code === 'P0001' && eb.message === 'freeze_active'
        && st.owner === null && st.instructions === 0 && st.shares === 0 && st.entries === 0,
      `a=${ea ? ea.code + ':' + ea.message : 'none'} b=${eb ? eb.code + ':' + eb.message : 'none'} owner=${st.owner} instructions=${st.instructions} shares=${st.shares} entries=${st.entries}`);
  } finally {
    await s1.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 54: 7A M1 · ADR-0033 R2/F-9 — path 2 racing share_object -----------

async function case54(admin) {
  const fx = await mkCircle(admin, 'c54');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // Lena holds health view and no schedule: the {schedule} task is a
    // crossing, so path 2 names the invoice. share_object is the recorded
    // R-rule exception — it takes no advisory lock — so S2's share on the
    // same (task, Lena) is INVISIBLE to S1's `not exists` and S1's insert
    // blocks on object_shares_live; when S2 commits, S1's insert collides.
    const lena = await mkMember(admin, fx, 'Lena', 'family', { health: 'view' });
    const tokShare = await mintStepUp(admin, fx.u2, 'share_object', `task:${fx.task}`);
    const tokPair = await mintStepUp(admin, fx.u1, 'share_object',
      `task:${fx.task}+document:${fx.doc}`);

    await asUser(s2, fx.u2);
    await s2.query('begin');
    await s2.query(`select hc.share_object('task', $1, $2, $3)`, [fx.task, lena.m, tokShare]);

    await asUser(s1, fx.u1);
    const p1 = s1.query(`select hc.assign_task($1, $2, null, $3, $4)`, [fx.task, lena.m, fx.doc, tokPair])
      .then(() => null).catch(e => e);
    const pid1 = await findActivePid(admin, 'select hc.assign_task%', 'assign backend');
    await waitForLockWait(admin, pid1, 's1 assign blocked on the live-share index behind the uncommitted share');
    await s2.query('commit');
    const e1 = await withTimeout(p1, 'case54 assign after the share commits');

    const st = (await admin.query(
      `select (select t.owner_member_id from public.tasks t where t.id = $1) as owner,
              (select string_agg(sh.object_type::text || ':' || (sh.created_by_assignment_of is null)::text, ',' order by sh.object_type)
                 from public.object_shares sh where sh.member_id = $2 and sh.revoked_at is null) as shares,
              (select count(*)::int from public.access_log l
                where l.circle_id = $3 and l.event_type in ('task_assigned', 'task_reassigned')) as entries,
              (select count(*)::int from public.step_up_tokens s
                where s.account_id in ($4, $5) and s.consumed_at is not null) as burnt`,
      [fx.task, lena.m, fx.c, fx.u1, fx.u2])).rows[0];
    check('case54 (7A M1 · ADR-0033 R2/F-9): path 2 racing share_object on the same (task, member) — the assignment collides on object_shares_live when the share commits and refuses in the ONE shape, assign_refused, never a raw 23505; nothing of it lands (no holder, no entry, the pair token unconsumed) and Lena keeps exactly the share S2 gave her',
      e1 !== null && e1.code === 'P0001' && e1.message === 'assign_refused'
        && st.owner === null && st.shares === 'task:true' && st.entries === 0 && st.burnt === 1,
      `err=${e1 ? e1.code + ':' + e1.message : 'none'} owner=${st.owner} shares=${st.shares} entries=${st.entries} tokens_burnt=${st.burnt}`);
  } finally {
    await s2.query('rollback').catch(() => {});
    await s1.end();
    await s2.end();
    await cleanupCircle(admin, fx.c);
  }
}

// --- case 55: 8A M1 — two members claim ONE task at once ---------------------

async function case55(admin) {
  const fx = await mkCircle(admin, 'c55');
  const s1 = await connect();
  const s2 = await connect();
  try {
    // Lena and Kim both hold schedule VIEW on Nell: either may claim the
    // {schedule} baseline task, and both try at once. hc.claim_task takes the
    // per-circle advisory lock and re-reads the row FOR UPDATE under it, so
    // the second claimant re-reads an OWNED row when the first commits.
    const lena = await mkMember(admin, fx, 'Lena', 'family', { schedule: 'view' });
    const kim = await mkMember(admin, fx, 'Kim', 'family', { schedule: 'view' });

    await asUser(s1, lena.u);
    await s1.query('begin');
    const r1 = (await s1.query(`select (hc.claim_task($1)) ->> 'member_id' as m`, [fx.task]))
      .rows[0].m;

    await asUser(s2, kim.u);
    const p2 = s2.query(`select hc.claim_task($1)`, [fx.task]).then(() => null).catch(e => e);
    const pid2 = await findActivePid(admin, 'select hc.claim_task%', 'claim_task backend');
    await waitForLockWait(admin, pid2, 's2 claim blocked on the circle lock behind s1');
    await s1.query('commit');
    const e2 = await withTimeout(p2, 'case55 second claim after the first commits');

    const st = (await admin.query(
      `select (select t.owner_member_id from public.tasks t where t.id = $1) as owner,
              (select t.assigned_by from public.tasks t where t.id = $1) as assigned_by,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2 and l.event_type = 'task_claimed') as claimed,
              (select count(*)::int from public.access_log l
                where l.circle_id = $2
                  and l.event_type in ('task_assigned', 'task_reassigned', 'object_shared')) as other,
              (select count(*)::int from public.object_shares sh where sh.circle_id = $2) as shares,
              (select count(*)::int from public.tasks t
                where t.circle_id = $2 and t.written_from_task_id is not null) as instructions`,
      [fx.task, fx.c])).rows[0];
    check('case55 (8A M1): two members claim ONE task at once — the second waits on the circle lock, re-reads the row the first now holds, and refuses in the ONE shape (claim_refused); exactly one owner (the first, assigned_by her own account), exactly one task_claimed, no task_assigned, no share, no instruction',
      r1 === lena.m
        && e2 !== null && e2.code === 'P0001' && e2.message === 'claim_refused'
        && st.owner === lena.m && st.assigned_by === lena.u
        && st.claimed === 1 && st.other === 0 && st.shares === 0 && st.instructions === 0,
      `first=${r1 === lena.m ? 'lena' : r1} second=${e2 ? e2.code + ':' + e2.message : 'none'} owner=${st.owner === lena.m ? 'lena' : st.owner} claimed=${st.claimed} other=${st.other} shares=${st.shares} instructions=${st.instructions}`);
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
  await case30(admin);
  await case31(admin);
  await case32(admin);
  await case33(admin);
  await case34(admin);
  await case35(admin);
  await case36(admin);
  await case37(admin);
  await case38(admin);
  await case39(admin);
  await case40(admin);
  await case41(admin);
  await case42(admin);
  await case43(admin);
  await case44(admin);
  await case45(admin);
  await case46(admin);
  await case47(admin);
  await case48(admin);
  await case49(admin);
  await case50(admin);
  await case51(admin);
  await case52(admin);
  await case53(admin);
  await case54(admin);
  await case55(admin);
} catch (err) {
  console.error(`RUNNER ERROR: ${err.message}`);
  failures += 1;
} finally {
  await admin.end();
}

console.log(`\n${results.length - failures}/${results.length} concurrency assertions passed`);
process.exit(failures === 0 ? 0 : 1);
