import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7B B3 · lib/hc/timeline against the LIVE stack — the Timeline's data half
// (PRD §4.4; slice-7 plan B3; TLN-01/02/03's app halves; AC-TL-2/3/4).
//
//   · listEvents is RLS-true and per subject, with a combined view where
//     every row is subject-labelled (nothing merges silently); by kind —
//     medical · care · admin, never `memory` as a filter — and by date range;
//     chronological, each temporal kind crossing the boundary in its own
//     shape (§2.7);
//   · the source resolves as far as the caller's access reaches: the
//     arrival (linked when readable, counted-never-named when not), the
//     EXTRACTION behind an AI-created event (model + prompt version, from
//     the proposal's extractions — visible at manage/view, null below), the
//     approver on every row; a manual event names the person and the date;
//   · an episode is a WRAPPER on its events and never conceals them (AC-TL-3);
//   · the creation entries — the custodianship declarations hc.create_circle
//     wrote first — are the first row of every thread (§4.4.4);
//   · add by hand is ONE action for a `view`×5 member: create_manual_proposal
//     then approve_proposal, the receipt being the event; below the cliff the
//     draft is refused (TLN-02, MNL-01's narrowing).
//
// Test class: LIVE-DB INTEGRATION (members, events, the proposal chain and the
// episode fixtured under replica role; every ACT through the wrappers).
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let tl: typeof import('@/lib/hc/timeline');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const tag = randomUUID().slice(0, 8);
const people = {
  sarah: { id: randomUUID(), name: 'Sarah', tier: 'coordinator' },
  ruth: { id: randomUUID(), name: 'Ruth', tier: 'family' },
  marisol: { id: randomUUID(), name: 'Marisol', tier: 'care_circle' },
} as const;
type Person = keyof typeof people;
const claimsOf = (p: Person) => ({ sub: people[p].id, role: 'authenticated', email: `${p}.tl.${tag}@example.invalid` });

let circleId: string;
let nell: string;
let marcus: string;
let arrival: string;
let proposal: string;
let dNell: string;
let episode: string;
const ev = { dated: randomUUID(), appt: randomUUID(), floating: randomUUID() };

beforeAll(async () => {
  tl = await import('@/lib/hc/timeline');
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
      { first_name: 'Nell', situation: 'At home, on their own', postal_code: '02140', timezone: 'America/New_York', accent_color: '#7A6E9B', forwarding_local_part: `nell.tl.${tag}` },
      { first_name: 'Marcus', situation: 'In a nursing facility', postal_code: '60614', timezone: 'America/Chicago', accent_color: '#6E8F73', forwarding_local_part: `marcus.tl.${tag}` },
    ],
  });
  circleId = created.circle_id;
  const subjects = await raw.query('select id, first_name from public.subjects where circle_id = $1', [circleId]);
  nell = subjects.rows.find((r) => r.first_name === 'Nell').id;
  marcus = subjects.rows.find((r) => r.first_name === 'Marcus').id;

  await raw.query('set session_replication_role = replica');
  const member: Record<string, string> = {};
  for (const p of ['ruth', 'marisol'] as Person[]) {
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
  await grant('ruth', nell, 'health', 'summary');
  await grant('ruth', nell, 'schedule', 'summary');
  await grant('marisol', nell, 'schedule', 'summary');

  arrival = randomUUID();
  await raw.query(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, sender_display_name, sender_address)
     values ($1, $2, $3, 'email', 'filed', 'Riverbend Cardiology', 'records@riverbend.example')`,
    [arrival, circleId, nell],
  );
  const extraction = randomUUID();
  await raw.query(
    `insert into public.extractions (id, arrival_id, circle_id, subject_id, field, value, confidence, risk_class, citation, model_id, prompt_version)
     values ($1, $2, $3, $4, 'document_date', '"2026-07-12"', 0.97, 'high', '{"page": 1, "bbox": [0.1, 0.2, 0.3, 0.04]}', 'claude-fixture', 'hc-6b-3')`,
    [extraction, arrival, circleId, nell],
  );
  proposal = randomUUID();
  await raw.query(
    `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, version, payload, source_extraction_ids, taint, taint_resolved, status, decided_by, decided_at)
     values ($1, $2, $3, $4, 'timeline_event', 1, '{"kind": "medical", "summary": "Discharged from Riverbend"}', $5, '{health}', true, 'approved', $6, now())`,
    [proposal, arrival, circleId, nell, [extraction], people.sarah.id],
  );
  dNell = randomUUID();
  await raw.query(
    `insert into public.documents (id, circle_id, subject_id, title, category, artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'Discharge summary · Jul 12', 'medical', $4, now(), $5, now(), 'Sarah', '{health}')`,
    [dNell, circleId, nell, arrival, people.sarah.id],
  );
  episode = randomUUID();
  await raw.query(
    `insert into public.episodes (id, circle_id, subject_id, title, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'The fall and the stay at Riverbend', $4, now(), 'Sarah', '{health}')`,
    [episode, circleId, nell, people.sarah.id],
  );
  await raw.query(
    `insert into public.timeline_events (id, circle_id, subject_id, kind, summary, episode_id,
       occurred_on, occurred_zone, local_at, iana_zone, instant, is_floating,
       source_arrival_id, source_proposal_id, approved_by, approved_at, approver_display_name, taint)
     values
       ($1, $4, $5, 'medical', 'Discharged from Riverbend', $7, '2026-07-12', 'America/New_York', null, null, null, false,
        $8, $9, $10, now() - interval '3 days', 'Sarah', '{health}'),
       ($2, $4, $5, 'admin', 'Cardiology follow-up', null, null, null, '2026-09-04 15:00:00', 'America/Denver', '2026-09-04T21:00:00Z', false,
        null, null, $10, now() - interval '2 days', 'Sarah', '{schedule}'),
       ($3, $4, $6, 'care', 'Call from the nurse', null, null, null, '2026-08-01 09:30:00', null, null, true,
        null, null, $10, now() - interval '1 day', 'Sarah', '{health}')`,
    [ev.dated, ev.appt, ev.floating, circleId, nell, marcus, episode, arrival, proposal, people.sarah.id],
  );
  await raw.query('set session_replication_role = default');

  return async () => {
    await raw.query('set session_replication_role = replica');
    for (const t of [
      'proposal_commits', 'provenance_edges', 'record_revisions', 'object_shares', 'tasks', 'timeline_events',
      'episodes', 'documents', 'proposals', 'extractions', 'arrival_events', 'arrivals',
      'access_grants', 'access_log', 'circle_members', 'subjects',
    ]) {
      await raw.query(`delete from public.${t} where circle_id = $1`, [circleId]);
    }
    await raw.query('delete from public.circles where id = $1', [circleId]);
    await raw.query('delete from public.accounts where id = any($1)', [Object.values(people).map((p) => p.id)]);
    await raw.query('delete from auth.users where id = any($1)', [Object.values(people).map((p) => p.id)]);
    await raw.query('set session_replication_role = default');
    await raw.end();
  };
});

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('B3 · listEvents: per subject, combined and labelled, by kind and date, chronological', () => {
  it("Nell's thread: two events in order, each temporal kind in its own shape, the episode a wrapper", async () => {
    const rows = await tl.listEvents(claimsOf('sarah'), circleId, { subject: nell });
    expect(rows.map((r) => r.id)).toEqual([ev.dated, ev.appt]);
    expect(rows[0]).toMatchObject({
      subject_name: 'Nell',
      subject_seq: 1,
      kind: 'medical',
      summary: 'Discharged from Riverbend',
      when: { kind: 'date', on: '2026-07-12' },
      episode: { id: episode, title: 'The fall and the stay at Riverbend' },
    });
    expect(rows[1].when).toEqual({
      kind: 'appointment',
      local_at: '2026-09-04T15:00:00',
      iana_zone: 'America/Denver',
      instant: '2026-09-04T21:00:00.000Z',
    });
    expect(rows[1].episode).toBeNull();
    expect(rows[0].approved_at).toMatch(ISO);
  });

  it('the combined view carries BOTH subjects, every row labelled — nothing merges silently', async () => {
    const rows = await tl.listEvents(claimsOf('sarah'), circleId, { subject: 'all' });
    expect(rows.map((r) => r.id)).toEqual([ev.dated, ev.floating, ev.appt]);
    expect(rows.map((r) => r.subject_name)).toEqual(['Nell', 'Marcus', 'Nell']);
    expect(rows[1]).toMatchObject({ subject_seq: 2, when: { kind: 'floating', local_at: '2026-08-01T09:30:00' } });
  });

  it('by kind and by date range; `memory` is not a filter', async () => {
    expect((await tl.listEvents(claimsOf('sarah'), circleId, { subject: 'all', kind: 'admin' })).map((r) => r.id)).toEqual([ev.appt]);
    expect(
      (await tl.listEvents(claimsOf('sarah'), circleId, { subject: 'all', from: '2026-08-01', to: '2026-08-31' })).map((r) => r.id),
    ).toEqual([ev.floating]);
    expect(tl.KINDS).toEqual(['medical', 'care', 'admin']);
    expect(await tl.listEvents(claimsOf('sarah'), circleId, { subject: 'all', kind: 'memory' })).toEqual([]);
  });

  it('RLS-true: Ruth sees Nell at summary and nothing of Marcus; the caregiver sees no thread at all', async () => {
    const ruth = await tl.listEvents(claimsOf('ruth'), circleId, { subject: 'all' });
    expect(ruth.map((r) => r.id)).toEqual([ev.dated, ev.appt]);
    expect(await tl.listEvents(claimsOf('marisol'), circleId, { subject: 'all' })).toEqual([]);
  });
});

describe('B3 · the source resolves as far as access reaches (AC-TL-2)', () => {
  it('the coordinator sees the arrival (linked), the extraction and the approver', async () => {
    const row = (await tl.eventById(claimsOf('sarah'), circleId, ev.dated))!;
    expect(row.source).toMatchObject({ kind: 'arrival', arrival_id: arrival, channel: 'email', label: 'Riverbend Cardiology' });
    expect(row.extraction).toEqual({ model_id: 'claude-fixture', prompt_version: 'hc-6b-3' });
    expect(row.approver_display_name).toBe('Sarah');
  });

  it('Ruth at summary: the arrival counted-never-named, the extraction not hers to see, the approver still named', async () => {
    const row = (await tl.eventById(claimsOf('ruth'), circleId, ev.dated))!;
    expect(row.source).toEqual({ kind: 'arrival_unseen' });
    expect(row.extraction).toBeNull();
    expect(row.approver_display_name).toBe('Sarah');
  });

  it('eventById: null in ONE shape for foreign, nonexistent and malformed', async () => {
    expect(await tl.eventById(claimsOf('marisol'), circleId, ev.dated)).toBeNull();
    expect(await tl.eventById(claimsOf('sarah'), circleId, randomUUID())).toBeNull();
    expect(await tl.eventById(claimsOf('sarah'), circleId, 'nope')).toBeNull();
  });
});

describe('B3 · the creation entry is the first thing on every thread (§4.4.4)', () => {
  it('both custodianship declarations, in order, readable by every member', async () => {
    const entries = await tl.creationEntries(claimsOf('sarah'), circleId);
    expect(entries.map((e) => [e.subject_name, e.custodian])).toEqual([
      ['Nell', 'Sarah'],
      ['Marcus', 'Sarah'],
    ]);
    expect(entries[0].occurred_at).toMatch(ISO);
    expect(entries[0].declared_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("…under the log's own rule: a declaration is a SUBJECT entry with no domain, visible at log on all five and hidden below (ADR-0009)", async () => {
    // FOUND BY THE FIRST LIVE RUN. The declaration carries the subject it
    // names, so access_log_select fails it closed to all five domains: Ruth
    // (summary on health and schedule, hidden on the rest) does not see the
    // first row of Nell's thread. Not a defect — the log's settled rule —
    // but a bound the page must render honestly (no creation row for her,
    // never a claim that there is none). One deliberate `log` on each of the
    // other three makes it hers to see.
    expect(await tl.creationEntries(claimsOf('ruth'), circleId)).toEqual([]);
    await raw.query('set session_replication_role = replica');
    const ruth = (
      await raw.query('select id from public.circle_members where circle_id = $1 and account_id = $2', [
        circleId,
        people.ruth.id,
      ])
    ).rows[0].id;
    await raw.query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       select $1, $2, $3, d, 'log'::hc.access_level, $4
         from unnest(array['memories','documents','finances']::hc.domain[]) d`,
      [circleId, ruth, nell, people.sarah.id],
    );
    await raw.query('set session_replication_role = default');
    const now = await tl.creationEntries(claimsOf('ruth'), circleId);
    expect(now.map((e) => e.subject_name)).toEqual(['Nell']);
  });
});

describe('B3 · add by hand — ONE action for a view×5 member (TLN-02)', () => {
  it('the coordinator adds a dated care event with a linked document; the event is provenanced entered by her, on that date', async () => {
    const added = await tl.addManualEvent(claimsOf('sarah'), circleId, {
      subjectId: nell,
      kind: 'care',
      summary: 'Home health nurse started weekly visits',
      occurredOn: '2026-08-15',
      occurredZone: 'America/New_York',
      documentId: dNell,
    });
    expect(added.event_id).toMatch(/^[0-9a-f-]{36}$/);
    const row = (await tl.eventById(claimsOf('sarah'), circleId, added.event_id))!;
    expect(row).toMatchObject({
      kind: 'care',
      summary: 'Home health nurse started weekly visits',
      when: { kind: 'date', on: '2026-08-15' },
      source: { kind: 'manual' },
      approver_display_name: 'Sarah',
    });
    expect(row.linked_documents).toEqual([{ id: dNell, title: 'Discharge summary · Jul 12' }]);
    // It joins the thread in its place.
    const rows = await tl.listEvents(claimsOf('sarah'), circleId, { subject: nell });
    expect(rows.map((r) => r.id)).toEqual([ev.dated, added.event_id, ev.appt]);
  });

  it('below the cliff the draft is refused and nothing is written', async () => {
    await expect(
      tl.addManualEvent(claimsOf('ruth'), circleId, {
        subjectId: nell,
        kind: 'care',
        summary: 'nope',
        occurredOn: '2026-08-16',
        occurredZone: 'America/New_York',
      }),
    ).rejects.toThrow(/draft_refused/);
    const n = await raw.query(`select count(*)::int as n from public.arrivals where circle_id = $1 and channel = 'manual'`, [circleId]);
    expect(n.rows[0].n).toBe(1);
  });

  it('canAddByHand mirrors the cliff from the caller’s own levels', async () => {
    expect(await tl.canAddByHand(claimsOf('sarah'), circleId, nell)).toBe(true);
    expect(await tl.canAddByHand(claimsOf('ruth'), circleId, nell)).toBe(false);
    expect(await tl.canAddByHand(claimsOf('marisol'), circleId, nell)).toBe(false);
  });
});
