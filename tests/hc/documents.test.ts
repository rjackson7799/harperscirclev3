import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7C C2 · lib/hc/documents against the LIVE stack — the Documents detail's
// data half (PRD §4.3.2–§4.3.5; TSD §1.3, §3.11; slice-7 plan C2; DOC-02/03/04's
// app halves). Every wrapper rides the request-role channel: RLS and the 7A
// definers decide, never this module.
//
// WHERE THE KICKOFF SAYS TO PUSH — the byte path stays one path (that is the
// fence test's job, not this file's), and SHARING IS EXACTLY ONE OBJECT FOR
// EXACTLY ONE PERSON, checked from the grantee's LIVE context:
//   · before the share Marisol cannot read the document row at all;
//   · the share (behind a real §5.7 token bound to document:<id>) makes THIS
//     row hers on her next query — and the OTHER health document stays
//     invisible (AC-DOC-5: the category did not open);
//   · unshare in one action, and her next query loses it (AC-PERM-10's
//     direction);
//   · references count-never-name: a derived task she cannot see is a ROW
//     with visible=false and no label, never absent and never named.
//
// Re-categorisation is an authorization change (§4.3.2): the audience preview
// names EXACTLY the members whose level changes with both levels; the move is
// refused without manage on BOTH domains and with a stale expected category
// (the round-24 3-arg form); the moved row carries the new category AND the
// new taint, and the audience_changed log entry carries both audiences.
//
// Test class: LIVE-DB INTEGRATION. Members, grants, the arrival and the two
// documents are fixtured under replica role (the 066 pattern); every ACT goes
// through the wrappers and the real definers.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let docsLib: typeof import('@/lib/hc/documents');
let stepUp: typeof import('@/lib/hc/step-up');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const tag = randomUUID().slice(0, 8);
const people = {
  sarah: { id: randomUUID(), name: 'Sarah', tier: 'coordinator' },
  marisol: { id: randomUUID(), name: 'Marisol', tier: 'care_circle' },
  ruth: { id: randomUUID(), name: 'Ruth', tier: 'family' },
  lena: { id: randomUUID(), name: 'Lena', tier: 'family' },
} as const;
type Person = keyof typeof people;
const claimsOf = (p: Person) => ({
  sub: people[p].id,
  role: 'authenticated',
  email: `${p}.dc.${tag}@example.invalid`,
});
/** Claims a step-up mint accepts: a password factor within the last 300 s. */
const freshClaimsOf = (p: Person) => ({
  ...claimsOf(p),
  aal: 'aal1',
  amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
});

const member: Record<Person, string> = { sarah: '', marisol: '', ruth: '', lena: '' };
let circleId: string;
let nell: string;
let arrival: string;
let dMed: string; // the discharge summary — taint {health}, category medical
let dMed2: string; // a SECOND health document — AC-DOC-5's control
let tDerived: string; // a task derived from dMed — the count-never-name row

beforeAll(async () => {
  docsLib = await import('@/lib/hc/documents');
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
        forwarding_local_part: `nell.dc.${tag}`,
      },
    ],
  });
  circleId = created.circle_id;
  nell = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;
  member.sarah = (
    await raw.query('select id from public.circle_members where circle_id = $1 and account_id = $2', [
      circleId,
      people.sarah.id,
    ])
  ).rows[0].id;

  await raw.query('set session_replication_role = replica');
  for (const p of ['marisol', 'ruth', 'lena'] as Person[]) {
    member[p] = (
      await raw.query(
        `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
         values ($1, $2, $3, $4) returning id`,
        [circleId, people[p].id, people[p].tier, people[p].name],
      )
    ).rows[0].id;
  }
  const grant = (p: Person, domain: string, level: string) =>
    raw.query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [circleId, member[p], nell, domain, level, people.sarah.id],
    );
  // Marisol: the caregiver — schedule summary only; health is HIDDEN.
  await grant('marisol', 'schedule', 'summary');
  // Ruth: health at summary — reads the row, loses it if the document moves out.
  await grant('ruth', 'health', 'summary');
  // Lena: health at view, schedule at LOG — the derived task (taint
  // {schedule,health}) sits at her min = log: counted, never named
  // (ADR-0033 D2: below log the referent is not even counted).
  await grant('lena', 'health', 'view');
  await grant('lena', 'schedule', 'log');

  arrival = randomUUID();
  await raw.query(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, sender_display_name, sender_address)
     values ($1, $2, $3, 'email', 'filed', 'Riverbend Cardiology', 'records@riverbend.example')`,
    [arrival, circleId, nell],
  );
  dMed = randomUUID();
  dMed2 = randomUUID();
  await raw.query(
    `insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
       artifact_arrival_id, source_arrival_id, filed_at, approved_by, approved_at,
       approver_display_name, taint)
     values
       ($1, $3, $4, 'Discharge summary · Jul 12', 'medical',
        'Nell was discharged after observation. Wound care continues twice daily. Follow-up is booked.',
        $5, $5, now(), $6, now(), 'Sarah', '{health}'),
       ($2, $3, $4, 'Cardiology consult · Aug 2', 'medical',
        'A routine consult. No change to the plan.',
        $5, $5, now(), $6, now(), 'Sarah', '{health}')`,
    [dMed, dMed2, circleId, nell, arrival, people.sarah.id],
  );
  tDerived = randomUUID();
  await raw.query(
    `insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone, status,
       source_arrival_id, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'Follow the discharge instructions', '2026-09-10', 'America/New_York',
       'open', $4, $5, now(), 'Sarah', '{schedule,health}')`,
    [tDerived, circleId, nell, arrival, people.sarah.id],
  );
  await raw.query(
    `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
     values ($1, 'task', $2, 'document', $3)`,
    [circleId, tDerived, dMed],
  );
  await raw.query('set session_replication_role = default');

  return async () => {
    await raw.query('set session_replication_role = replica');
    for (const t of [
      'step_up_tokens',
      'provenance_edges',
      'object_shares',
      'record_revisions',
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
    await raw.query(`delete from public.circles where id = $1`, [circleId]);
    await raw.query(`delete from public.accounts where id = any($1)`, [
      Object.values(people).map((p) => p.id),
    ]);
    await raw.query(`delete from auth.users where id = any($1)`, [
      Object.values(people).map((p) => p.id),
    ]);
    await raw.query('set session_replication_role = default');
    await raw.end();
  };
});

describe('documentById — the detail row at the caller own level, null in one shape', () => {
  it('the coordinator reads the full row: title, category, sentences, source, approver, the byte-path arrival', async () => {
    const d = await docsLib.documentById(claimsOf('sarah'), circleId, dMed);
    expect(d).not.toBeNull();
    expect(d!.title).toBe('Discharge summary · Jul 12');
    expect(d!.category).toBe('medical');
    expect(d!.summary_text).toMatch(/twice daily/);
    expect(d!.subject_id).toBe(nell);
    expect(d!.artifact_arrival_id).toBe(arrival);
    expect(d!.approver_display_name).toBe('Sarah');
    expect(typeof d!.approved_at).toBe('string');
    expect(typeof d!.filed_at).toBe('string');
    expect(d!.source).not.toBeNull();
    expect(d!.source!.channel).toBe('email');
    expect(d!.source!.sender_display_name).toBe('Riverbend Cardiology');
    expect(d!.taint).toEqual(['health']);
    expect(d!.subject_seq).toBe(1);
    // the coordinator: view×5 on the arrival, manage on the document —
    // hc.visible_at itself answered, once per row.
    expect(d!.can_view).toBe(true);
    expect(d!.can_manage).toBe(true);
  });

  it('the category→domain module agrees with hc.own_domain for all seven — pinned live, the tiers.ts discipline', async () => {
    for (const c of docsLib.DOC_CATEGORIES) {
      const r = await raw.query(
        `select hc.own_domain('document', $1::hc.doc_category, null, null)::text as d`,
        [c],
      );
      expect(`${c}:${docsLib.categoryDomain(c)}`).toBe(`${c}:${r.rows[0].d}`);
    }
  });

  it('a summary member reads the row — the summary/view line is drawn between TABLES, and this table is hers; neither viewer nor controls are hers', async () => {
    const d = await docsLib.documentById(claimsOf('ruth'), circleId, dMed);
    expect(d).not.toBeNull();
    expect(d!.summary_text).toMatch(/twice daily/);
    expect(d!.can_view).toBe(false);
    expect(d!.can_manage).toBe(false);
  });

  it('a member hidden on the domain gets null — the same null as not-exists, from her live context', async () => {
    expect(await docsLib.documentById(claimsOf('marisol'), circleId, dMed)).toBeNull();
  });

  it('a malformed id is null before the database is touched', async () => {
    expect(await docsLib.documentById(claimsOf('sarah'), circleId, 'not-a-uuid')).toBeNull();
    expect(await docsLib.documentById(claimsOf('sarah'), 'not-a-uuid', dMed)).toBeNull();
  });
});

describe('documentReferences — everything in the record that references it, counted never named', () => {
  it('the coordinator sees the derived task as a visible, labelled row', async () => {
    const refs = await docsLib.documentReferences(claimsOf('sarah'), dMed);
    const task = refs.find((r) => r.object_type === 'task' && r.object_id === tDerived);
    expect(task).toBeDefined();
    expect(task!.visible).toBe(true);
    expect(task!.label).toMatch(/discharge instructions/i);
  });

  it('a log-level member gets a ROW with visible=false, NO label and NO id — counted, never named (D2: id and label suppressed together)', async () => {
    const refs = await docsLib.documentReferences(claimsOf('lena'), dMed);
    const task = refs.find((r) => r.object_type === 'task');
    expect(task).toBeDefined();
    expect(task!.visible).toBe(false);
    expect(task!.label).toBeNull();
    expect(task!.object_id).toBeNull();
  });
});

describe('shareDocument / documentShares / unshareDocument — one object, one person, one action', () => {
  let shareId: string;

  it('before any share, the grantee-to-be cannot read the row (the control)', async () => {
    expect(await docsLib.documentById(claimsOf('marisol'), circleId, dMed)).toBeNull();
  });

  it('the share requires the live §5.7 token bound to document:<id> — a missing token is refused', async () => {
    await expect(
      docsLib.shareDocument(claimsOf('sarah'), dMed, member.marisol, null),
    ).rejects.toThrow(/share_refused/);
  });

  it('with the token, the share lands and is visible on the document with the granter named', async () => {
    const minted = await stepUp.mintStepUp(freshClaimsOf('sarah'), 'share_object', `document:${dMed}`);
    const r = await docsLib.shareDocument(claimsOf('sarah'), dMed, member.marisol, minted.token);
    expect(r.object_id).toBe(dMed);
    expect(r.member_id).toBe(member.marisol);
    const shares = await docsLib.documentShares(claimsOf('sarah'), dMed);
    const s = shares.find((row) => row.member_id === member.marisol);
    expect(s).toBeDefined();
    expect(s!.granter_name).toBe('Sarah');
    expect(typeof s!.granted_at).toBe('string');
    shareId = s!.share_id;
  });

  it("the grantee's NEXT query reads THIS document — and the OTHER health document stays invisible (AC-DOC-5)", async () => {
    const shared = await docsLib.documentById(claimsOf('marisol'), circleId, dMed);
    expect(shared).not.toBeNull();
    expect(shared!.title).toBe('Discharge summary · Jul 12');
    expect(await docsLib.documentById(claimsOf('marisol'), circleId, dMed2)).toBeNull();
  });

  it('a member who is neither granter nor coordinator cannot revoke it', async () => {
    await expect(docsLib.unshareDocument(claimsOf('ruth'), shareId)).rejects.toThrow(
      /revoke_refused|share_refused/,
    );
  });

  it("unshare is ONE action, and the grantee's next query loses the object", async () => {
    const r = await docsLib.unshareDocument(claimsOf('sarah'), shareId);
    expect(r.share_id).toBe(shareId);
    expect(await docsLib.documentById(claimsOf('marisol'), circleId, dMed)).toBeNull();
  });
});

describe('documentAudience / recategorizeDocument — an audience change, named before it is made', () => {
  it('the preview names EXACTLY the members whose level changes, with both levels (medical → financial)', async () => {
    const rows = await docsLib.documentAudience(claimsOf('sarah'), dMed, 'financial');
    const byMember = new Map(rows.map((r) => [r.member_id, r]));
    const ruth = byMember.get(member.ruth);
    expect(ruth).toBeDefined();
    expect(ruth!.display_name).toBe('Ruth');
    expect(ruth!.before).toBe('summary');
    expect(ruth!.after).toBe('hidden');
    const lena = byMember.get(member.lena);
    expect(lena).toBeDefined();
    expect(lena!.before).toBe('view');
    expect(lena!.after).toBe('hidden');
    // Marisol's level does not change (hidden → hidden): not in the audience.
    expect(byMember.has(member.marisol)).toBe(false);
  });

  it('the move is refused without manage on BOTH domains, and nothing changes', async () => {
    await expect(
      docsLib.recategorizeDocument(claimsOf('ruth'), dMed, 'financial', 'medical'),
    ).rejects.toThrow(/recategorize_refused/);
    const still = await docsLib.documentById(claimsOf('sarah'), circleId, dMed);
    expect(still!.category).toBe('medical');
  });

  it('a stale expected category is refused with the NAMED document_changed (D19.5: the preview binds the move)', async () => {
    await expect(
      docsLib.recategorizeDocument(claimsOf('sarah'), dMed, 'financial', 'insurance'),
    ).rejects.toThrow(/document_changed/);
  });

  it('the move rewrites category AND taint in one transaction, and the log entry carries both audiences', async () => {
    const r = await docsLib.recategorizeDocument(claimsOf('sarah'), dMed, 'insurance', 'medical');
    expect(r.document_id).toBe(dMed);
    expect(r.changed).toBe(true);
    const moved = await docsLib.documentById(claimsOf('sarah'), circleId, dMed);
    expect(moved!.category).toBe('insurance');
    // insurance → finances is ADR-0005's ruling (hc.own_domain,
    // 20260815230005:71), standing since 1B.
    expect(moved!.taint).toEqual(['finances']);
    // Ruth held health summary; insurance is the documents domain — her next
    // query loses the row, from her live context.
    expect(await docsLib.documentById(claimsOf('ruth'), circleId, dMed)).toBeNull();
    // TWO entries is the pinned shape (068:19, ADR-0032 D6): the person's
    // entry carrying both audiences by name, and the machinery's own beside
    // it — the count is two, stated.
    const logged = await raw.query(
      `select detail from public.access_log
        where circle_id = $1 and event_type = 'audience_changed' and object_id = $2`,
      [circleId, dMed],
    );
    expect(logged.rowCount).toBe(2);
    const personEntry = logged.rows.find((r) => r.detail?.category_before !== undefined);
    expect(personEntry).toBeDefined();
    expect(personEntry!.detail.category_before).toBe('medical');
    expect(personEntry!.detail.category_after).toBe('insurance');
    expect(personEntry!.detail.audience_before).toBeDefined();
    expect(personEntry!.detail.audience_after).toBeDefined();
  });
});

describe('shareCandidates — offered, and the definer decides', () => {
  it('lists the circle members for the share control; the caller herself included is a rendering choice, not a permission', async () => {
    const rows = await docsLib.shareCandidates(claimsOf('sarah'), circleId);
    const names = rows.map((r) => r.display_name);
    expect(names).toContain('Marisol');
    expect(names).toContain('Ruth');
    expect(await docsLib.shareCandidates(claimsOf('sarah'), 'not-a-uuid')).toEqual([]);
  });
});
