import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7B B1 · lib/hc/review against the LIVE stack (OW-01 — ADR-0027 D17 item 1,
// the round-18 packet's Q5: "lib/hc/review.ts has no tests/hc/ live-DB module
// test: 10 files in tests/hc/, none loads @/lib/hc/review, two route tests
// mock it out"). The FIRST item of 7B, before any new read is written on top
// of the layer — the review module is the shape every 7B read copies.
//
// What this drives, at the wrappers and never at the SQL they wrap:
//
//   - arrivalForReview resolves authorization ONCE: `can_view` is view×5
//     over the arrival; a summary×5 member gets the ROW with can_view false
//     (AC-INBOX-8); an outsider, a nonexistent id and a malformed id are ONE
//     shape — null, no throw, no oracle (DEF-10).
//   - proposalsFor returns ZERO ROWS below its gate (manage over the
//     proposal's own taint) — the same shape as "no drafts", never an error.
//   - extractions_for and receipt_for REFUSE below view×5 by name
//     (`extraction_refused`, `receipt_refused`) — the two reads whose refusal
//     is a throw, because the page only calls them past `can_view`, and a
//     throw there is a page defect, not a person's. The first run of this
//     file found the wrapper's comment claiming zero rows for the first.
//   - the two decisions ride the definers' own checks: an outsider refuses in
//     one shape, a stale version carries its NAMED marker, a replayed
//     idempotency key returns the stored result, and the receipt then names
//     what went where (RCP-01) with `visible` explicit.
//   - every `*_at` the module declares as `string` IS ISO text at the
//     boundary — round-16 R5/F-1 and the 6B close-out's class (the scanner
//     reads names; this reads the live values).
//
// Test class: LIVE-DB INTEGRATION. The arrival is created through the real
// ingest wrapper and moved to `proposals_ready` under replica role with its
// extractions and proposals inserted directly — the gate's own standing
// fixture concession (e2e/review.spec.ts fixtureTaskProposal), because the
// module under test is the READ layer, not the pipeline.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let review: typeof import('@/lib/hc/review');
let ingest: typeof import('@/lib/hc/ingest');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const MEMBER = randomUUID();
const OUTSIDER = randomUUID();
const tag = randomUUID().slice(0, 8);
const founderClaims = { sub: FOUNDER, role: 'authenticated', email: `founder.rv.${tag}@example.invalid` };
const memberClaims = { sub: MEMBER, role: 'authenticated', email: `member.rv.${tag}@example.invalid` };
const outsiderClaims = { sub: OUTSIDER, role: 'authenticated', email: `outsider.rv.${tag}@example.invalid` };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const NO_SUCH = '00000000-0000-4000-8000-000000000000';

let circleId: string;
let subjectId: string;
let arrivalId: string;
let taskProposal: string;
let secondProposal: string;

beforeAll(async () => {
  review = await import('@/lib/hc/review');
  ingest = await import('@/lib/hc/ingest');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const [id, email, name] of [
    [FOUNDER, founderClaims.email, 'Founder RV'],
    [MEMBER, memberClaims.email, 'Summary Member RV'],
    [OUTSIDER, outsiderClaims.email, 'Outsider RV'],
  ] as const) {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
      [id, email],
    );
    await raw.query(`insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`, [
      id,
      name,
    ]);
  }
  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Nell's circle",
    subjects: [
      {
        first_name: 'Nell',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `nell.rv.${tag}`,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (await raw.query('select id from public.subjects where circle_id = $1', [circleId]))
    .rows[0].id;

  // The AC-INBOX-8 member: a live family row set to EXACTLY summary×5.
  const member = await raw.query(
    `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
     values ($1, $2, 'family', 'Summary Member RV') returning id`,
    [circleId, MEMBER],
  );
  await raw.query(
    `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
     select $1, $2, $3, d, 'summary'::hc.access_level, $4
       from unnest(array['memories','health','schedule','documents','finances']::hc.domain[]) d`,
    [circleId, member.rows[0].id, subjectId, FOUNDER],
  );

  // A real arrival through the ingest wrapper, then the fixture concession:
  // moved to proposals_ready with its facts and drafts, under replica role.
  const made = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: `clinic.rv.${tag}@cardiology.example`,
    senderDisplayName: null,
    messageId: `mid-${randomUUID()}`,
    authResult: 'unauthenticated',
    authDetail: {},
    attachments: [],
  });
  arrivalId = made.parentId;
  await raw.query(`set session_replication_role = replica`);
  await raw.query(`update public.arrivals set state = 'proposals_ready', scan_verdict = 'clean' where id = $1`, [
    arrivalId,
  ]);
  await raw.query(
    `insert into public.extractions
       (arrival_id, circle_id, subject_id, field, value, confidence, risk_class, citation, model_id, prompt_version)
     values ($1, $2, $3, 'document_date', '"2026-07-12"', 0.97, 'high',
             '{"page": 1, "bbox": [0.1, 0.2, 0.3, 0.04]}', 'claude-fixture', 'hc-6b-3'),
            ($1, $2, $3, 'provider', '"Riverbend Cardiology"', 0.88, 'standard',
             '{"page": 1, "bbox": [0.1, 0.3, 0.4, 0.04]}', 'claude-fixture', 'hc-6b-3')`,
    [arrivalId, circleId, subjectId],
  );
  taskProposal = randomUUID();
  secondProposal = randomUUID();
  await raw.query(
    `insert into public.proposals
       (id, arrival_id, circle_id, subject_id, kind, version, payload, taint, taint_resolved, status, created_at)
     values ($1, $3, $4, $5, 'task', 1, '{"title": "Call Riverbend about the follow-up"}', '{schedule}', true, 'pending', now()),
            ($2, $3, $4, $5, 'task', 1, '{"title": "Book the echo"}', '{schedule}', true, 'pending', now() + interval '1 second')`,
    [taskProposal, secondProposal, arrivalId, circleId, subjectId],
  );
  await raw.query(`set session_replication_role = default`);

  return async () => {
    await raw.query(`set session_replication_role = replica`);
    await raw.query(`delete from pgmq.q_pipeline_work where message ->> 'circle_id' = $1`, [circleId]);
    await raw.query(`delete from pgmq.a_pipeline_work where message ->> 'circle_id' = $1`, [circleId]);
    for (const t of [
      'proposal_commits',
      'provenance_edges',
      'record_revisions',
      'object_shares',
      'tasks',
      'timeline_events',
      'proposals',
      'extractions',
      'pipeline_outbox',
      'arrival_events',
      'pipeline_leases',
      'arrivals',
      'known_senders',
      'access_grants',
      'access_log',
      'circle_members',
      'subjects',
    ]) {
      await raw.query(`delete from public.${t} where circle_id = $1`, [circleId]);
    }
    await raw.query('delete from public.circles where id = $1', [circleId]);
    await raw.query('delete from public.accounts where id = any($1)', [[FOUNDER, MEMBER, OUTSIDER]]);
    await raw.query('delete from auth.users where id = any($1)', [[FOUNDER, MEMBER, OUTSIDER]]);
    await raw.query(`set session_replication_role = default`);
    await raw.end();
  };
});

describe('B1 · arrivalForReview resolves authorization ONCE (the M2/M5 one-gate property)', () => {
  it('the coordinator gets the row with can_view TRUE and an ISO received_at', async () => {
    const row = await review.arrivalForReview(founderClaims, circleId, arrivalId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(arrivalId);
    expect(row!.state).toBe('proposals_ready');
    expect(row!.channel).toBe('email');
    expect(row!.subject_id).toBe(subjectId);
    expect(row!.scan_verdict).toBe('clean');
    expect(row!.can_view).toBe(true);
    // R5/F-1's class, read live: the declared string IS ISO, not String(Date).
    expect(row!.received_at).toMatch(ISO);
  });

  it('the summary×5 member gets the ROW and can_view FALSE (AC-INBOX-8) — the row is hers, the contents are not', async () => {
    const row = await review.arrivalForReview(memberClaims, circleId, arrivalId);
    expect(row).not.toBeNull();
    expect(row!.can_view).toBe(false);
  });

  it('an outsider, a nonexistent id and a malformed id are ONE shape: null, no throw (DEF-10)', async () => {
    expect(await review.arrivalForReview(outsiderClaims, circleId, arrivalId)).toBeNull();
    expect(await review.arrivalForReview(founderClaims, circleId, NO_SUCH)).toBeNull();
    expect(await review.arrivalForReview(founderClaims, NO_SUCH, arrivalId)).toBeNull();
    expect(await review.arrivalForReview(founderClaims, circleId, 'not-a-uuid')).toBeNull();
    expect(await review.arrivalForReview(founderClaims, 'nope', arrivalId)).toBeNull();
  });
});

describe('B1 · the two region reads return ZERO ROWS below their gates, never an error', () => {
  it('extractionsFor: seven typed columns for view×5; below the gate the definer REFUSES by name — the wrapper does not launder that into "no facts"', async () => {
    const facts = await review.extractionsFor(founderClaims, arrivalId);
    expect(facts.map((f) => f.field).sort()).toEqual(['document_date', 'provider']);
    const date = facts.find((f) => f.field === 'document_date')!;
    expect(date.value).toBe('2026-07-12');
    expect(date.confidence).toBeCloseTo(0.97, 3);
    expect(date.risk_class).toBe('high');
    expect(date.citation).toEqual({ page: 1, bbox: [0.1, 0.2, 0.3, 0.04] });
    expect(date.model_id).toBe('claude-fixture');
    expect(date.prompt_version).toBe('hc-6b-3');

    // FOUND BY THIS TEST'S FIRST RUN: the wrapper's comment said "zero rows for
    // the unauthorized is the same shape as zero facts"; hc.extractions_for
    // raises  (20260824120002). The live shape is pinned
    // here and the comment corrected — the page calls this only past
    // can_view, so a throw here is a PAGE defect, and swallowing it into []
    // would hide exactly that.
    await expect(review.extractionsFor(memberClaims, arrivalId)).rejects.toThrow(/extraction_refused/);
    await expect(review.extractionsFor(outsiderClaims, arrivalId)).rejects.toThrow(/extraction_refused/);
    expect(await review.extractionsFor(founderClaims, 'not-a-uuid')).toEqual([]);
  });

  it('proposalsFor: rows in creation order at manage over the taint; [] for the summary member', async () => {
    const drafts = await review.proposalsFor(founderClaims, circleId, arrivalId);
    expect(drafts.map((p) => p.id)).toEqual([taskProposal, secondProposal]);
    expect(drafts[0]).toMatchObject({
      kind: 'task',
      version: 1,
      payload: { title: 'Call Riverbend about the follow-up' },
      status: 'pending',
      supersedes_id: null,
      anomaly_flags: [],
      decided_at: null,
      reject_reason: null,
    });
    expect(await review.proposalsFor(memberClaims, circleId, arrivalId)).toEqual([]);
    expect(await review.proposalsFor(outsiderClaims, circleId, arrivalId)).toEqual([]);
  });

  it('recentRecordChange: null while the subject has no record object; null for an outsider', async () => {
    expect(await review.recentRecordChange(founderClaims, subjectId)).toBeNull();
    expect(await review.recentRecordChange(outsiderClaims, subjectId)).toBeNull();
    expect(await review.recentRecordChange(founderClaims, 'nope')).toBeNull();
  });

  it('receiptFor REFUSES below view×5 — the one read whose refusal is a throw, because the page calls it only past can_view', async () => {
    await expect(review.receiptFor(memberClaims, arrivalId)).rejects.toThrow(/receipt_refused/);
    await expect(review.receiptFor(outsiderClaims, arrivalId)).rejects.toThrow(/receipt_refused/);
    expect(await review.receiptFor(founderClaims, 'not-a-uuid')).toEqual([]);
  });
});

describe('B1 · the two decisions ride the definers — refusal shapes, the version marker, the replay, the receipt', () => {
  const key = `decide:${randomUUID()}`;

  it('an outsider is refused in ONE shape; a stale version carries its NAMED marker', async () => {
    await expect(review.approveProposal(outsiderClaims, taskProposal, 1, key, null)).rejects.toThrow(
      /approval_refused/,
    );
    await expect(review.approveProposal(founderClaims, taskProposal, 2, key, null)).rejects.toThrow(
      /proposal_version_changed/,
    );
    // Nothing landed on either refusal.
    const n = await raw.query('select count(*)::int as n from public.tasks where circle_id = $1', [circleId]);
    expect(n.rows[0].n).toBe(0);
  });

  it('the approval lands the task, claimed by its commit; the SAME key replays the stored result (AC-INBOX-12)', async () => {
    const first = await review.approveProposal(founderClaims, taskProposal, 1, key, null);
    expect(first.status).toBe('approved');
    const again = await review.approveProposal(founderClaims, taskProposal, 1, key, null);
    expect(again).toEqual(first);

    const task = await raw.query(
      `select t.title from public.tasks t
         join public.proposal_commits c on c.object_id = t.id and c.object_type = 'task'
        where c.proposal_id = $1`,
      [taskProposal],
    );
    expect(task.rows[0]?.title).toBe('Call Riverbend about the follow-up');

    // The record now has an object, so presence has a moment — and it is ISO.
    expect(await review.recentRecordChange(founderClaims, subjectId)).toMatch(ISO);
    // The decided proposal's decided_at is ISO at the boundary too.
    const drafts = await review.proposalsFor(founderClaims, circleId, arrivalId);
    expect(drafts.find((p) => p.id === taskProposal)!.decided_at).toMatch(ISO);
  });

  it('the rejection writes nothing and the receipt then names what went where, `visible` explicit (RCP-01)', async () => {
    const rejected = await review.rejectProposal(
      founderClaims,
      secondProposal,
      1,
      `${key}:reject`,
      'already_handled',
    );
    expect(rejected.status).toBe('rejected');

    const receipt = await review.receiptFor(founderClaims, arrivalId);
    const byId = new Map(receipt.map((r) => [r.proposal_id, r]));
    expect(byId.get(taskProposal)).toMatchObject({
      status: 'approved',
      reject_reason: null,
      object_type: 'task',
      label: 'Call Riverbend about the follow-up',
      visible: true,
    });
    expect(byId.get(taskProposal)!.object_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(byId.get(secondProposal)).toMatchObject({
      status: 'rejected',
      reject_reason: 'already_handled',
      object_type: null,
      object_id: null,
      label: null,
      visible: false,
    });
    const commits = await raw.query(
      'select count(*)::int as n from public.proposal_commits where proposal_id = $1',
      [secondProposal],
    );
    expect(commits.rows[0].n).toBe(0);
  });
});
