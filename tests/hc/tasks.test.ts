import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7B B2 · lib/hc/tasks against the LIVE stack — the Tasks surface's data half
// (PRD §4.5; TSD §3.6; slice-7 plan B2; TSK-01..04's app halves; SHR-02's
// app half). Every wrapper rides the request-role channel: RLS and the 7A
// definers decide, never this module.
//
// THE CASE THE KICKOFF SAYS TO PUSH HARDEST ON — "the point of selection
// agrees with the database": `assignCandidates` computes *not offered* and
// *cannot clear the taint* from hc.circle_people's per-subject per-domain
// levels exactly as hc.assign_task's D19.7 gate and ladder will, and this
// file drives BOTH directions:
//   · a member hidden ×5 on the subject is NOT OFFERED, and assign_task
//     refuses her by every path;
//   · ONE deliberate `log` grant makes her offered, and the same assignment
//     goes through (by path 2, since she still cannot clear the taint);
//   · a member who can clear the taint is offered PLAIN, and a path supplied
//     for her is refused (the paths exist only for the crossing);
//   · a member who cannot clear it gets exactly the two human paths, and
//     path 1's instruction is hers to read while the original stays invisible.
//
// Also: the list is RLS-true (a caregiver sees her assigned tasks and nothing
// else — AC-TASK-5), `due_on` crosses the boundary as a DATE string (the pg
// date-to-Date trap), the source resolves or is named-never-linked, complete
// bridges the instruction to the original (D19.4), snooze counts, unassign
// withdraws the share.
//
// Test class: LIVE-DB INTEGRATION. Members, grants, the document and the
// tasks are fixtured under replica role (the 066 pattern); every ACT goes
// through the wrappers and the real definers.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let tasksLib: typeof import('@/lib/hc/tasks');
let stepUp: typeof import('@/lib/hc/step-up');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const tag = randomUUID().slice(0, 8);
const people = {
  sarah: { id: randomUUID(), name: 'Sarah', tier: 'coordinator' },
  marisol: { id: randomUUID(), name: 'Marisol', tier: 'care_circle' },
  ruth: { id: randomUUID(), name: 'Ruth', tier: 'family' },
  lena: { id: randomUUID(), name: 'Lena', tier: 'family' },
  omar: { id: randomUUID(), name: 'Omar', tier: 'family' },
  // 8C U1: the CLAIMANT. hc.claim_task's floor is `view`, and every person
  // above was fixtured at summary or below on the schedule domain, so no
  // existing member could take a task at all. Nadia is the one who can.
  nadia: { id: randomUUID(), name: 'Nadia', tier: 'family' },
} as const;
type Person = keyof typeof people;
const claimsOf = (p: Person) => ({
  sub: people[p].id,
  role: 'authenticated',
  email: `${p}.tk.${tag}@example.invalid`,
});
/** Claims a step-up mint accepts: a password factor within the last 300 s. */
const freshClaimsOf = (p: Person) => ({
  ...claimsOf(p),
  aal: 'aal1',
  amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
});

const member: Record<Person, string> = { sarah: '', marisol: '', ruth: '', lena: '', omar: '', nadia: '' };
let circleId: string;
let nell: string;
let marcus: string;
let arrival: string;
let dSrc: string;
let tPlain: string;
let tTainted: string;
let tMarcus: string;
/** 8C U1 · the claim's own rows, so the claim legs never inherit the
 *  assignment legs' mutations of tPlain / tTainted. */
let tClaim: string;
let tShared: string;
let tInstruction: string;

beforeAll(async () => {
  tasksLib = await import('@/lib/hc/tasks');
  stepUp = await import('@/lib/hc/step-up');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const p of Object.keys(people) as Person[]) {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
      [people[p].id, claimsOf(p).email],
    );
    await raw.query(`insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`, [
      people[p].id,
      people[p].name,
    ]);
  }
  const created = await circleLib.createCircleFromSetup(claimsOf('sarah'), {
    name: "Nell's circle",
    subjects: [
      {
        first_name: 'Nell',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `nell.tk.${tag}`,
      },
      {
        first_name: 'Marcus',
        situation: 'In a nursing facility',
        postal_code: '60614',
        timezone: 'America/Chicago',
        accent_color: '#6E8F73',
        forwarding_local_part: `marcus.tk.${tag}`,
      },
    ],
  });
  circleId = created.circle_id;
  const subjects = await raw.query(
    'select id, first_name from public.subjects where circle_id = $1 order by created_at',
    [circleId],
  );
  nell = subjects.rows.find((r) => r.first_name === 'Nell').id;
  marcus = subjects.rows.find((r) => r.first_name === 'Marcus').id;
  member.sarah = (
    await raw.query('select id from public.circle_members where circle_id = $1 and account_id = $2', [
      circleId,
      people.sarah.id,
    ])
  ).rows[0].id;

  await raw.query('set session_replication_role = replica');
  for (const p of ['marisol', 'ruth', 'lena', 'omar', 'nadia'] as Person[]) {
    member[p] = (
      await raw.query(
        `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
         values ($1, $2, $3, $4) returning id`,
        [circleId, people[p].id, people[p].tier, people[p].name],
      )
    ).rows[0].id;
  }
  const grant = (p: Person, subject: string, domain: string, level: string) =>
    raw.query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [circleId, member[p], subject, domain, level, people.sarah.id],
    );
  // Marisol: the caregiver — schedule summary on Nell only.
  await grant('marisol', nell, 'schedule', 'summary');
  // Ruth: clears {schedule, health} at summary.
  await grant('ruth', nell, 'schedule', 'summary');
  await grant('ruth', nell, 'health', 'summary');
  // Lena: health VIEW, schedule hidden — path 2 works, path 1 cannot.
  await grant('lena', nell, 'health', 'view');
  // Omar: grants on MARCUS only — no context on Nell at all.
  await grant('omar', marcus, 'schedule', 'summary');
  await grant('omar', marcus, 'health', 'summary');
  // 8C U1: Nadia reads Nell's schedule at VIEW — the floor hc.claim_task
  // sets, and the only person here who meets it on a {schedule} task.
  await grant('nadia', nell, 'schedule', 'view');

  arrival = randomUUID();
  await raw.query(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, sender_display_name, sender_address)
     values ($1, $2, $3, 'email', 'filed', 'Riverbend Cardiology', 'records@riverbend.example')`,
    [arrival, circleId, nell],
  );
  dSrc = randomUUID();
  await raw.query(
    `insert into public.documents (id, circle_id, subject_id, title, category, artifact_arrival_id,
       filed_at, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'Discharge summary · Jul 12', 'medical', $4, now(), $5, now(), 'Sarah', '{health}')`,
    [dSrc, circleId, nell, arrival, people.sarah.id],
  );
  tPlain = randomUUID();
  tTainted = randomUUID();
  tMarcus = randomUUID();
  await raw.query(
    `insert into public.tasks (id, circle_id, subject_id, title, detail, due_on, due_zone, status,
       source_arrival_id, approved_by, approved_at, approver_display_name, taint)
     values
       ($1, $4, $5, 'Call the pharmacy', null, '2026-09-04', 'America/New_York', 'open',
        $7, $8, now(), 'Sarah', '{schedule}'),
       ($2, $4, $5, 'Follow the discharge instructions from Dr Okafor',
        'Wound care twice daily; the dressing protocol is on page 3', '2026-09-10', 'America/New_York',
        'open', $7, $8, now(), 'Sarah', '{schedule,health}'),
       ($3, $4, $6, 'Renew the parking permit', null, null, null, 'open',
        null, $8, now(), 'Sarah', '{schedule}')`,
    [tPlain, tTainted, tMarcus, circleId, nell, marcus, arrival, people.sarah.id],
  );
  await raw.query(
    `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
     values ($1, 'task', $2, 'document', $3)`,
    [circleId, tTainted, dSrc],
  );
  await raw.query('set session_replication_role = default');

  return async () => {
    await raw.query('set session_replication_role = replica');
    for (const t of [
      'step_up_tokens',
      'proposal_commits',
      'provenance_edges',
      'record_revisions',
      'object_shares',
      'tasks',
      'documents',
      'arrival_events',
      'arrivals',
      'access_grants',
      'access_log',
      'circle_members',
      'subjects',
    ]) {
      await raw.query(
        t === 'step_up_tokens'
          ? `delete from public.step_up_tokens where account_id = any($1)`
          : `delete from public.${t} where circle_id = $1`,
        [t === 'step_up_tokens' ? Object.values(people).map((p) => p.id) : circleId],
      );
    }
    await raw.query('delete from public.circles where id = $1', [circleId]);
    await raw.query('delete from public.accounts where id = any($1)', [Object.values(people).map((p) => p.id)]);
    await raw.query('delete from auth.users where id = any($1)', [Object.values(people).map((p) => p.id)]);
    await raw.query('set session_replication_role = default');
    await raw.end();
  };
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('B2 · listTasks is RLS-true and typed at the boundary', () => {
  it('the coordinator sees every open task, subject-labelled, with the source resolved and can_manage true', async () => {
    const rows = await tasksLib.listTasks(claimsOf('sarah'), circleId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(tPlain)).toMatchObject({
      subject_name: 'Nell',
      subject_seq: 1,
      title: 'Call the pharmacy',
      status: 'open',
      owner_member_id: null,
      snooze_count: 0,
      taint: ['schedule'],
      can_manage: true,
    });
    expect(byId.get(tMarcus)).toMatchObject({ subject_name: 'Marcus', subject_seq: 2, due_on: null });
    // The pg date trap: `due_on` is a DATE — it crosses as 'YYYY-MM-DD',
    // never as a Date shifted to the previous UTC day.
    expect(byId.get(tPlain)!.due_on).toBe('2026-09-04');
    expect(byId.get(tPlain)!.due_on).toMatch(DATE_ONLY);
    expect(byId.get(tPlain)!.approved_at).toMatch(ISO);
    // AC-TASK-4: a source that resolves — the arrival is readable to her.
    expect(byId.get(tPlain)!.source).toMatchObject({
      kind: 'arrival',
      arrival_id: arrival,
      channel: 'email',
      label: 'Riverbend Cardiology',
    });
    expect(byId.get(tMarcus)!.source).toEqual({ kind: 'none' });
  });

  it('the caregiver sees her assigned tasks and NOTHING else — nothing yet (AC-TASK-5)', async () => {
    expect(await tasksLib.listTasks(claimsOf('marisol'), circleId)).toEqual([]);
  });

  it('Ruth at summary sees the two Nell tasks she clears; the arrival behind them is named, never linked', async () => {
    const rows = await tasksLib.listTasks(claimsOf('ruth'), circleId);
    expect(rows.map((r) => r.id).sort()).toEqual([tPlain, tTainted].sort());
    // arrivals_select is summary ×5 and Ruth holds two domains: the source
    // is COUNTED (there is one) and never named or linked — the receipt's
    // discipline (§3.5).
    expect(rows.find((r) => r.id === tPlain)!.source).toEqual({ kind: 'arrival_unseen' });
    expect(rows.every((r) => r.can_manage === false)).toBe(true);
  });

  it('taskById is the same row, and null in ONE shape for foreign, nonexistent and malformed', async () => {
    const row = await tasksLib.taskById(claimsOf('sarah'), circleId, tPlain);
    expect(row?.title).toBe('Call the pharmacy');
    expect(await tasksLib.taskById(claimsOf('omar'), circleId, tPlain)).toBeNull();
    expect(await tasksLib.taskById(claimsOf('sarah'), circleId, randomUUID())).toBeNull();
    expect(await tasksLib.taskById(claimsOf('sarah'), circleId, 'nope')).toBeNull();
  });

  it('myMemberId resolves the caller in this circle; an outsider gets null', async () => {
    expect(await tasksLib.myMemberId(claimsOf('marisol'), circleId)).toBe(member.marisol);
    expect(await tasksLib.myMemberId({ sub: randomUUID(), role: 'authenticated' }, circleId)).toBeNull();
  });
});

describe('B2 · the point of selection agrees with the database (TSK-01, D19.7)', () => {
  it('assignCandidates: hidden ×5 is NOT OFFERED; cannot-clear gets the two paths; can-clear is plain', async () => {
    const task = (await tasksLib.taskById(claimsOf('sarah'), circleId, tTainted))!;
    const candidates = await tasksLib.assignCandidates(claimsOf('sarah'), circleId, task);
    const by = new Map(candidates.map((c) => [c.member_id, c]));
    // Subjects are people on the People list, never assignees.
    expect(candidates.every((c) => c.tier !== undefined)).toBe(true);
    expect(by.get(member.omar)).toMatchObject({ display_name: 'Omar', offered: false, can_see: false });
    expect(by.get(member.marisol)).toMatchObject({ display_name: 'Marisol', offered: true, can_see: false });
    expect(by.get(member.lena)).toMatchObject({ display_name: 'Lena', offered: true, can_see: false });
    expect(by.get(member.ruth)).toMatchObject({ display_name: 'Ruth', offered: true, can_see: true });
    expect(by.get(member.sarah)).toMatchObject({ display_name: 'Sarah', offered: true, can_see: true });
  });

  it('…and assign_task AGREES: the not-offered member is refused by every path, nothing written', async () => {
    const token = (
      await stepUp.mintStepUp(freshClaimsOf('sarah'), 'share_object', `task:${tTainted}+document:${dSrc}`)
    ).token;
    await expect(tasksLib.assignTask(claimsOf('sarah'), tTainted, member.omar)).rejects.toThrow(/assign_refused/);
    await expect(
      tasksLib.assignTask(claimsOf('sarah'), tTainted, member.omar, { instruction: 'Pick up the prescription' }),
    ).rejects.toThrow(/assign_refused/);
    await expect(
      tasksLib.assignTask(claimsOf('sarah'), tTainted, member.omar, { shareDocument: dSrc, stepUpToken: token }),
    ).rejects.toThrow(/assign_refused/);
    const t = await raw.query('select owner_member_id from public.tasks where id = $1', [tTainted]);
    expect(t.rows[0].owner_member_id).toBeNull();
  });

  it('the reverse: ONE deliberate `log` grant makes Omar offered, and the same path-2 assignment goes through', async () => {
    await raw.query('set session_replication_role = replica');
    await raw.query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       values ($1, $2, $3, 'memories', 'log', $4)`,
      [circleId, member.omar, nell, people.sarah.id],
    );
    await raw.query('set session_replication_role = default');
    const task = (await tasksLib.taskById(claimsOf('sarah'), circleId, tTainted))!;
    const omar = (await tasksLib.assignCandidates(claimsOf('sarah'), circleId, task)).find(
      (c) => c.member_id === member.omar,
    )!;
    expect(omar).toMatchObject({ offered: true, can_see: false });

    const token = (
      await stepUp.mintStepUp(freshClaimsOf('sarah'), 'share_object', `task:${tTainted}+document:${dSrc}`)
    ).token;
    const result = await tasksLib.assignTask(claimsOf('sarah'), tTainted, member.omar, {
      shareDocument: dSrc,
      stepUpToken: token,
    });
    expect(result.path).toBe('share');
    expect(result.share_ids).toHaveLength(2);
    // From HIS live context: the task is his to see now, and the document
    // with it (TSK-01: checked from the grantee's context). Marcus's task
    // was always his — he holds schedule on Marcus — and Nell's other task
    // still is not: the share lifts ONE named object, never the domain.
    const his = await tasksLib.listTasks(claimsOf('omar'), circleId);
    expect(his.map((r) => r.id).sort()).toEqual([tTainted, tMarcus].sort());
    expect(his.find((r) => r.id === tTainted)!.source).toMatchObject({ kind: 'arrival_unseen' });
    expect(his.some((r) => r.id === tPlain)).toBe(false);

    // SHR-02's app half: unassign withdraws exactly the assignment's shares,
    // checked from his context — the task is gone again, Marcus's stays.
    const un = await tasksLib.unassignTask(claimsOf('sarah'), tTainted);
    expect(un.shares_revoked).toBe(2);
    expect(un.former_member_id).toBe(member.omar);
    expect((await tasksLib.listTasks(claimsOf('omar'), circleId)).map((r) => r.id)).toEqual([tMarcus]);
  });

  it('can-clear is PLAIN, and a path supplied for her is refused — the paths exist only for the crossing', async () => {
    await expect(
      tasksLib.assignTask(claimsOf('sarah'), tTainted, member.ruth, { instruction: 'not needed' }),
    ).rejects.toThrow(/assign_refused/);
    const result = await tasksLib.assignTask(claimsOf('sarah'), tTainted, member.ruth);
    expect(result.path).toBe('plain');
    const hers = await tasksLib.listTasks(claimsOf('ruth'), circleId);
    expect(hers.find((r) => r.id === tTainted)?.owner_name).toBe('Ruth');
  });

  it('cannot-clear by PATH 1: the typed instruction is hers to read; the original stays invisible from her context', async () => {
    const result = await tasksLib.assignTask(claimsOf('sarah'), tTainted, member.marisol, {
      instruction: 'Pick up Nell’s new prescription at the Elm St pharmacy, before Friday.',
    });
    expect(result.path).toBe('instruction');
    expect(result.instruction_task_id).toMatch(/^[0-9a-f-]{36}$/);
    const hers = await tasksLib.listTasks(claimsOf('marisol'), circleId);
    expect(hers.map((r) => r.id)).toEqual([result.instruction_task_id]);
    expect(hers[0]).toMatchObject({
      title: 'Pick up Nell’s new prescription at the Elm St pharmacy, before Friday.',
      taint: ['schedule'],
      written_from_task_id: tTainted,
      source: { kind: 'written', written_by: 'Sarah' },
    });
    // The original: not in her list, and null by id — one shape.
    expect(hers.some((r) => r.id === tTainted)).toBe(false);
    expect(await tasksLib.taskById(claimsOf('marisol'), circleId, tTainted)).toBeNull();
    // The coordinator's view of the original names the instruction.
    const original = (await tasksLib.taskById(claimsOf('sarah'), circleId, tTainted))!;
    expect(original.owner_name).toBe('Marisol');
    expect(original.instruction).toMatchObject({ id: result.instruction_task_id, status: 'open' });
  });

  it('completing the instruction completes the ORIGINAL (D19.4); the instruction never renders as open work', async () => {
    const original = (await tasksLib.taskById(claimsOf('sarah'), circleId, tTainted))!;
    const done = await tasksLib.completeTask(claimsOf('marisol'), original.instruction!.id);
    expect(done.status).toBe('done');
    expect(done.original_task_id).toBe(tTainted);
    const after = (await tasksLib.taskById(claimsOf('sarah'), circleId, tTainted))!;
    expect(after.status).toBe('done');
    expect(after.completed_by_name).toBe('Marisol');
    expect(after.completed_at).toMatch(ISO);
    // Her list: nothing open (done is terminal, never deleted).
    const hers = await tasksLib.listTasks(claimsOf('marisol'), circleId);
    expect(hers.filter((r) => r.status === 'open')).toEqual([]);
  });
});

describe('B2 · snooze counts; the filters are pure over the rows', () => {
  it('snooze moves the date forward and the count shows on the row (TSK-02 app half)', async () => {
    const r = await tasksLib.snoozeTask(claimsOf('sarah'), tPlain, '2026-09-11', 'America/New_York');
    expect(r.snooze_count).toBe(1);
    const row = (await tasksLib.taskById(claimsOf('sarah'), circleId, tPlain))!;
    expect(row.due_on).toBe('2026-09-11');
    expect(row.snooze_count).toBe(1);
    await expect(
      tasksLib.snoozeTask(claimsOf('sarah'), tPlain, '2026-09-01', 'America/New_York'),
    ).rejects.toThrow(/snooze_refused/);
  });

  it('taskFilters: Mine · Unassigned · Overdue · All, counted post-filter over what the caller can see', () => {
    type R = { id: string; status: string; owner_member_id: string | null; due_on: string | null };
    const rows: R[] = [
      { id: 'a', status: 'open', owner_member_id: 'me', due_on: '2026-01-01' },
      { id: 'b', status: 'open', owner_member_id: null, due_on: '2026-12-31' },
      { id: 'c', status: 'open', owner_member_id: 'you', due_on: null },
      { id: 'd', status: 'done', owner_member_id: 'me', due_on: '2026-01-01' },
      { id: 'e', status: 'cancelled', owner_member_id: 'me', due_on: '2026-01-01' },
    ];
    const f = tasksLib.taskFilters(rows, 'me', '2026-06-15');
    expect(f.all.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(f.mine.map((r) => r.id)).toEqual(['a']);
    expect(f.unassigned.map((r) => r.id)).toEqual(['b']);
    expect(f.overdue.map((r) => r.id)).toEqual(['a']);
    // A cancelled instruction (D19.4) is never open work; done is never deleted
    // but lives outside the open filters.
    expect(f.closed.map((r) => r.id)).toEqual(['d']);
  });
});
// ============================================================================
// 8C U1 · THE CLAIM, against the LIVE definer (TSK-05's app half; AC-TASK-1's
// claim half; AC-TASK-2; ADR-0040 D1–D4).
//
// 8A pinned hc.claim_task at pgTAP (070, forty assertions). What is NOT
// pinned there is the thing 8C adds: A SURFACE THAT DECIDES WHETHER TO OFFER
// THE CONTROL. The definer answers one string for eleven refusals, so the
// surface cannot learn the reason from a failure — it must already know. It
// knows through `can_view`, the SAME `hc.visible_at(…) >= 'view'` expression
// the definer evaluates, computed in the SAME RLS-true query that already
// carries `can_manage`.
//
// So these legs do not re-prove the definer. They prove AGREEMENT: over live
// rows, from each person's own context, `mayClaim(row, me)` and the definer's
// own verdict are the same answer. A disagreement in either direction is the
// defect — a control offered that refuses is a lie to the person pressing it,
// and a control withheld where the claim would land is work she cannot take.
// ============================================================================
describe('8C U1 · the claim: the surface’s answer and the database’s are the same answer', () => {
  // The claim's rows are fixtured HERE, not in the file's beforeAll. Ruth
  // clears {schedule} at summary, so three more schedule tasks in the
  // circle from the start silently changed what "Ruth sees the two Nell
  // tasks she clears" was asserting — a fixture quietly rewriting an older
  // leg's meaning. Created when this suite starts, they are invisible to
  // every suite above and the older assertions keep the tree they had.
  beforeAll(async () => {
    tClaim = randomUUID();
    tShared = randomUUID();
    tInstruction = randomUUID();
    await raw.query('set session_replication_role = replica');
    await raw.query(
      `insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone, status,
         source_arrival_id, approved_by, approved_at, approver_display_name, taint,
         written_from_task_id, written_for_member_id)
       values
         ($1, $4, $5, 'Collect the dressings from the pharmacy', null, null, 'open',
          null, $6, now(), 'Sarah', '{schedule}', null, null),
         ($2, $4, $5, 'Sit with Nell on Thursday afternoon', null, null, 'open',
          null, $6, now(), 'Sarah', '{schedule}', null, null),
         ($3, $4, $5, 'Bring the dressings on Thursday', null, null, 'open',
          null, $6, now(), 'Sarah', '{schedule}', $1, $7)`,
      [tClaim, tShared, tInstruction, circleId, nell, people.sarah.id, member.nadia],
    );
    await raw.query('set session_replication_role = default');
  });

  /** Every live share and every instruction row in the circle — the app-half
   *  echo of ADR-0040 D3's SET EQUALITY, so a claim that quietly minted one
   *  would be caught here and not only at pgTAP. */
  async function writes() {
    const shares = await raw.query(
      'select id from public.object_shares where circle_id = $1 order by id',
      [circleId],
    );
    const instructions = await raw.query(
      'select id from public.tasks where circle_id = $1 and written_from_task_id is not null order by id',
      [circleId],
    );
    return {
      shares: shares.rows.map((r) => r.id as string),
      instructions: instructions.rows.map((r) => r.id as string),
    };
  }

  async function logFor(taskId: string) {
    const r = await raw.query(
      `select l.event_type, l.actor_display_name, l.actor_account_id, l.target_member_id
         from public.access_log l
        where l.circle_id = $1 and l.object_id = $2
        order by l.seq`,
      [circleId, taskId],
    );
    return r.rows;
  }

  it('can_view carries the definer’s OWN floor onto the row, and it is not can_manage', async () => {
    const forNadia = (await tasksLib.taskById(claimsOf('nadia'), circleId, tClaim))!;
    expect(forNadia.can_view).toBe(true);
    // view, not manage: the whole point of the claim sitting where it sits.
    expect(forNadia.can_manage).toBe(false);
    expect(tasksLib.mayClaim(forNadia, { id: member.nadia })).toBe(true);

    const forRuth = (await tasksLib.taskById(claimsOf('ruth'), circleId, tClaim))!;
    expect(forRuth.can_view).toBe(false);
    expect(tasksLib.mayClaim(forRuth, { id: member.ruth })).toBe(false);
  });

  it('a summary member is refused, and the surface offered her nothing — they AGREE', async () => {
    const row = (await tasksLib.taskById(claimsOf('ruth'), circleId, tClaim))!;
    expect(tasksLib.mayClaim(row, { id: member.ruth })).toBe(false);
    await expect(tasksLib.claimTask(claimsOf('ruth'), tClaim)).rejects.toThrow(/claim_refused/);
    const still = await raw.query('select owner_member_id from public.tasks where id = $1', [tClaim]);
    expect(still.rows[0].owner_member_id).toBeNull();
  });

  it('an INSTRUCTION row is never claimable, at any level — surface and definer agree (ADR-0033 cluster C)', async () => {
    const row = (await tasksLib.taskById(claimsOf('nadia'), circleId, tInstruction))!;
    expect(row.written_from_task_id).toBe(tClaim);
    expect(tasksLib.mayClaim(row, { id: member.nadia })).toBe(false);
    await expect(tasksLib.claimTask(claimsOf('nadia'), tInstruction)).rejects.toThrow(/claim_refused/);
  });

  it('a VIEW-level member takes the task and it becomes HERS — and nothing else is written (D3, D4)', async () => {
    const before = await writes();
    const result = await tasksLib.claimTask(claimsOf('nadia'), tClaim);
    expect(result).toMatchObject({ task_id: tClaim, member_id: member.nadia });
    expect(result.claimed_at).toEqual(expect.any(String));

    const row = await raw.query(
      'select owner_member_id, assigned_by, assigned_at from public.tasks where id = $1',
      [tClaim],
    );
    expect(row.rows[0].owner_member_id).toBe(member.nadia);
    // The claimant is the assigner: the columns assign_task writes, from her.
    expect(row.rows[0].assigned_by).toBe(people.nadia.id);
    expect(row.rows[0].assigned_at).not.toBeNull();

    // NO share and NO instruction, as SETS — not as "no new insert".
    expect(await writes()).toEqual(before);

    // task_claimed, the claimant as actor AND target, and no task_assigned.
    const entries = await logFor(tClaim);
    expect(entries.map((e) => e.event_type)).toEqual(['task_claimed']);
    expect(entries[0]).toMatchObject({
      actor_display_name: 'Nadia',
      actor_account_id: people.nadia.id,
      target_member_id: member.nadia,
    });
  });

  it('…and from HER OWN context the task now reads as hers, with the control withdrawn (Q-B)', async () => {
    const hers = (await tasksLib.taskById(claimsOf('nadia'), circleId, tClaim))!;
    expect(hers.owner_member_id).toBe(member.nadia);
    expect(hers.owner_name).toBe('Nadia');
    // Hers already REFUSES rather than no-ops, so the surface must stop
    // offering it — and does, from the same row.
    expect(tasksLib.mayClaim(hers, { id: member.nadia })).toBe(false);
    await expect(tasksLib.claimTask(claimsOf('nadia'), tClaim)).rejects.toThrow(/claim_refused/);
  });

  it('a caregiver claims a task shared to her BY NAME — the share already gives view (ADR-0040 D1/Q-C)', async () => {
    // Before the share: the care-circle ceiling (rung 4) hides it outright,
    // so there is nothing to offer and nothing to claim.
    expect(await tasksLib.taskById(claimsOf('marisol'), circleId, tShared)).toBeNull();
    await expect(tasksLib.claimTask(claimsOf('marisol'), tShared)).rejects.toThrow(/claim_refused/);

    await raw.query('set session_replication_role = replica');
    await raw.query(
      `insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
       values ($1, $2, 'task', $3, $4, $5)`,
      [circleId, nell, tShared, member.marisol, people.sarah.id],
    );
    await raw.query('set session_replication_role = default');

    const row = (await tasksLib.taskById(claimsOf('marisol'), circleId, tShared))!;
    expect(row.can_view).toBe(true);
    expect(tasksLib.mayClaim(row, { id: member.marisol })).toBe(true);

    const before = await writes();
    const result = await tasksLib.claimTask(claimsOf('marisol'), tShared);
    expect(result.member_id).toBe(member.marisol);
    // The claim widens nothing: the share that was already there is the only
    // share, and no instruction was written for her.
    expect(await writes()).toEqual(before);
    expect((await logFor(tShared)).map((e) => e.event_type)).toEqual(['task_claimed']);
  });

  it('an outsider’s claim is refused, and no row of the circle moves', async () => {
    const outsider = { sub: randomUUID(), role: 'authenticated' };
    const before = await writes();
    await expect(tasksLib.claimTask(outsider, tClaim)).rejects.toThrow(/claim_refused/);
    expect(await writes()).toEqual(before);
  });
});
