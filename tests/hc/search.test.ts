import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 8B U1 · lib/hc/search against the LIVE stack — the search surface's data
// half (PRD §4.7.3, §4.3.6; TSD §7.2–§7.7; slice-8 plan "### 8B" unit 1 and
// Q4; SRCH-03/04/05/06's module halves). Three reads on the request-role
// channel inside ONE withRequestRole: RLS decides every row, never this
// module — the LEFT JOIN on document_search_content IS the level decision
// (§7.2), and the tasks and timeline vectors are single-vector because the
// whole rows are summary-readable (§2.11).
//
// WHERE THE KICKOFF SAYS TO PUSH — leakproof, from a LIVE context:
//   · a `summary` member's BODY-ONLY term returns the SAME SHAPE as a term
//     present nowhere (A.5's oracle, now at the module boundary); her title
//     term still matches, with a snippet cut from title + summary only;
//   · a `view` member gets the body snippet — the term marked as a PART,
//     never as markup — and the OCR text is findable at weight D and never
//     outranks a title at weight A;
//   · the caregiver's search returns her assigned tasks and nothing else
//     (AC-TASK-5); a share widens the ONE named document and never the
//     task derived from it (AC-PERM-6, §7.6);
//   · a non-member, a blank term and an over-cap term all answer the same
//     empty shape; a search writes NOTHING to the access log (Q4(3)).
//
// The sentinels: ts_headline's default StartSel/StopSel are `<b>`/`</b>`
// wrapped around family content (Q4(1)). The module passes STX/ETX
// (U+0002/U+0003) — C0 controls no writer in this tree emits and no
// document text carries — and SPLITS on them here, so the page builds
// `<mark>` from parts and the string never reaches the DOM as HTML.
//
// Test class: LIVE-DB INTEGRATION. Members, grants, the rows and the
// extraction behind extracted_text are fixtured under replica role (the
// 066 pattern); the vectors are then built by the REAL triggers through a
// no-op UPDATE in normal mode (the prf06.mjs mechanics — nothing here fakes
// a vector); every read goes through the module.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let search: typeof import('@/lib/hc/search');
let tasksLib: typeof import('@/lib/hc/tasks');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const tag = randomUUID().slice(0, 8);
const people = {
  sarah: { id: randomUUID(), name: 'Sarah', tier: 'coordinator' },
  priya: { id: randomUUID(), name: 'Priya', tier: 'family' }, // summary
  dan: { id: randomUUID(), name: 'Dan', tier: 'family' }, // view
  marisol: { id: randomUUID(), name: 'Marisol', tier: 'care_circle' }, // schedule summary
  stranger: { id: randomUUID(), name: 'Stranger', tier: 'family' }, // member of nothing
} as const;
type Person = keyof typeof people;
const claimsOf = (p: Person) => ({
  sub: people[p].id,
  role: 'authenticated',
  email: `${p}.srch.${tag}@example.invalid`,
});

const member: Record<Person, string> = { sarah: '', priya: '', dan: '', marisol: '', stranger: '' };
let circleId: string;
let nell: string;
let arrival: string;
let dMed: string; // 'Discharge summary · Jul 12' — extracted 'metoprolol', OCR 'warfarin'
let dWarf: string; // 'Warfarin plan · Sep 1' — the title-weight control
let dCard: string; // 'Cardiology consult · Aug 2' — the unshared health sibling
let tMine: string; // assigned to Marisol, {schedule}
let tOpen: string; // unassigned, {schedule} — the same term
let tDerived: string; // derived from dMed, {schedule,health}
let evDischarge: string; // {health}

const EMPTY = { documents: [], events: [], tasks: [] };

function text(parts: { text: string; hit: boolean }[]): string {
  return parts.map((p) => p.text).join('');
}

beforeAll(async () => {
  search = await import('@/lib/hc/search');
  tasksLib = await import('@/lib/hc/tasks');
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
        forwarding_local_part: `nell.srch.${tag}`,
      },
    ],
  });
  circleId = created.circle_id;
  nell = (await raw.query('select id from public.subjects where circle_id = $1', [circleId])).rows[0].id;
  member.sarah = (
    await raw.query('select id from public.circle_members where circle_id = $1 and account_id = $2', [
      circleId,
      people.sarah.id,
    ])
  ).rows[0].id;

  await raw.query('set session_replication_role = replica');
  for (const p of ['priya', 'dan', 'marisol'] as Person[]) {
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
  await grant('priya', 'health', 'summary');
  await grant('priya', 'schedule', 'summary');
  await grant('dan', 'health', 'view');
  await grant('dan', 'schedule', 'view');
  await grant('marisol', 'schedule', 'summary'); // health HIDDEN — the care ceiling

  arrival = randomUUID();
  await raw.query(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, sender_display_name, sender_address)
     values ($1, $2, $3, 'email', 'filed', 'Riverbend Cardiology', 'records@riverbend.example')`,
    [arrival, circleId, nell],
  );
  // The extraction behind extracted_text (weight C): an approved value the
  // dsc builder concatenates — the body text a summary member never sees.
  const extraction = randomUUID();
  const proposal = randomUUID();
  await raw.query(
    `insert into public.extractions (id, arrival_id, circle_id, subject_id, field, value,
       confidence, risk_class, citation, model_id, prompt_version)
     values ($1, $2, $3, $4, 'medication', '"metoprolol 25mg daily"', 0.95, 'high',
             '{"page": 1, "bbox": [0.1, 0.1, 0.2, 0.05]}', 'fixture-model', 'v0')`,
    [extraction, arrival, circleId, nell],
  );
  await raw.query(
    `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload,
       source_extraction_ids, taint, status, decided_by, decided_at)
     values ($1, $2, $3, $4, 'document', '{"title": "Discharge summary"}', array[$5::uuid],
             '{health}', 'approved', $6, now())`,
    [proposal, arrival, circleId, nell, extraction, people.sarah.id],
  );
  dMed = randomUUID();
  dWarf = randomUUID();
  dCard = randomUUID();
  await raw.query(
    `insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
       artifact_arrival_id, source_arrival_id, source_proposal_id, filed_at, approved_by,
       approved_at, approver_display_name, taint)
     values
       ($1, $4, $5, 'Discharge summary · Jul 12', 'medical', 'Home with cardiology follow-up.',
        $6, $6, $7, now(), $8, now(), 'Sarah', '{health}'),
       ($2, $4, $5, 'Warfarin plan · Sep 1', 'medications', 'A short note.',
        $6, $6, null, now(), $8, now(), 'Sarah', '{health}'),
       ($3, $4, $5, 'Cardiology consult · Aug 2', 'medical', 'A routine consult.',
        $6, $6, null, now(), $8, now(), 'Sarah', '{health}')`,
    [dMed, dWarf, dCard, circleId, nell, arrival, proposal, people.sarah.id],
  );
  tMine = randomUUID();
  tOpen = randomUUID();
  tDerived = randomUUID();
  await raw.query(
    `insert into public.tasks (id, circle_id, subject_id, title, detail, status, owner_member_id,
       assigned_by, assigned_at, approved_by, approved_at, approver_display_name, taint)
     values
       ($1, $4, $5, 'Call the pharmacy about zqpharm', 'Ask about the refill.', 'open', $6, $7, now(),
        $7, now(), 'Sarah', '{schedule}'),
       ($2, $4, $5, 'Refill zqpharm at Riverbend', null, 'open', null, null, null,
        $7, now(), 'Sarah', '{schedule}'),
       ($3, $4, $5, 'Follow the discharge instructions', null, 'open', null, null, null,
        $7, now(), 'Sarah', '{schedule,health}')`,
    [tMine, tOpen, tDerived, circleId, nell, member.marisol, people.sarah.id],
  );
  await raw.query(
    `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
     values ($1, 'task', $2, 'document', $3)`,
    [circleId, tDerived, dMed],
  );
  evDischarge = randomUUID();
  await raw.query(
    `insert into public.timeline_events (id, circle_id, subject_id, kind, summary, occurred_on,
       occurred_zone, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'medical', 'Discharge follow-up booked with cardiology', '2026-08-15',
             'America/New_York', $4, now(), 'Sarah', '{health}')`,
    [evDischarge, circleId, nell, people.sarah.id],
  );
  await raw.query('set session_replication_role = default');

  // The vectors, built by the REAL triggers (tsv + dsc sync + dsc builder):
  // a no-op UPDATE in normal mode, then the OCR text through the builder.
  await raw.query('update public.documents set title = title where circle_id = $1', [circleId]);
  await raw.query('update public.tasks set title = title where circle_id = $1', [circleId]);
  await raw.query('update public.timeline_events set summary = summary where circle_id = $1', [circleId]);
  await raw.query(
    `update public.document_search_content set ocr_text = 'scanned page mentions warfarin' where document_id = $1`,
    [dMed],
  );

  return async () => {
    await raw.query('set session_replication_role = replica');
    for (const t of [
      'object_shares',
      'provenance_edges',
      'tasks',
      'timeline_events',
      'documents',
      'proposals',
      'extractions',
      'arrivals',
      'access_grants',
      'access_log',
      'circle_members',
      'subjects',
    ]) {
      await raw.query(`delete from public.${t} where circle_id = $1`, [circleId]);
    }
    await raw.query(`delete from public.circles where id = $1`, [circleId]);
    await raw.query(`delete from public.accounts where id = any($1)`, [Object.values(people).map((p) => p.id)]);
    await raw.query(`delete from auth.users where id = any($1)`, [Object.values(people).map((p) => p.id)]);
    await raw.query('set session_replication_role = default');
    await raw.end();
  };
});

describe('the fixture (control): the vectors were built by the real triggers', () => {
  it('dMed has a dsc row whose search_text_full carries the extracted body AND the OCR text', async () => {
    const r = await raw.query(
      'select search_text_full, tsv_full is not null as v from public.document_search_content where document_id = $1',
      [dMed],
    );
    expect(r.rows[0].v).toBe(true);
    expect(r.rows[0].search_text_full).toMatch(/metoprolol 25mg daily/);
    expect(r.rows[0].search_text_full).toMatch(/warfarin/);
  });
});

describe('splitHeadline — the sentinels become PARTS, never markup (Q4(1))', () => {
  it('splits a headline into plain and hit parts, in order, with the sentinels consumed', () => {
    const { START_SEL, STOP_SEL, splitHeadline } = search;
    expect(splitHeadline(`Home with ${START_SEL}cardiology${STOP_SEL} follow-up.`)).toEqual([
      { text: 'Home with ', hit: false },
      { text: 'cardiology', hit: true },
      { text: ' follow-up.', hit: false },
    ]);
  });

  it('two hits, a hit at each edge, and no hit at all', () => {
    const { START_SEL, STOP_SEL, splitHeadline } = search;
    expect(splitHeadline(`${START_SEL}a${STOP_SEL} and ${START_SEL}b${STOP_SEL}`)).toEqual([
      { text: 'a', hit: true },
      { text: ' and ', hit: false },
      { text: 'b', hit: true },
    ]);
    expect(splitHeadline('nothing marked')).toEqual([{ text: 'nothing marked', hit: false }]);
    expect(splitHeadline('')).toEqual([]);
  });

  it('an unbalanced sentinel degrades to PLAIN TEXT — never to a dangling emphasis, never to markup', () => {
    const { START_SEL, STOP_SEL, splitHeadline } = search;
    expect(splitHeadline(`open ${START_SEL}forever`)).toEqual([{ text: 'open forever', hit: false }]);
    expect(splitHeadline(`stray${STOP_SEL} close`)).toEqual([{ text: 'stray close', hit: false }]);
  });

  it('HTML in the SOURCE text stays text: <b> from a document is a part, not an element', () => {
    const { START_SEL, STOP_SEL, splitHeadline } = search;
    expect(splitHeadline(`<b>bold</b> ${START_SEL}hit${STOP_SEL} <script>x</script>`)).toEqual([
      { text: '<b>bold</b> ', hit: false },
      { text: 'hit', hit: true },
      { text: ' <script>x</script>', hit: false },
    ]);
  });

  it('the sentinels are C0 controls, and the options string names exactly them', () => {
    expect(search.START_SEL).toBe('\u0002');
    expect(search.STOP_SEL).toBe('\u0003');
    expect(search.HEADLINE_OPTIONS).toBe('StartSel=\u0002, StopSel=\u0003');
  });
});

describe('boundQuery — the ingress cap (Q4(4)): a bounded term or null, never an error', () => {
  it('trims; a blank, a non-string and an over-cap term are null', () => {
    const { boundQuery, SEARCH_QUERY_MAX } = search;
    expect(boundQuery('  metoprolol ')).toBe('metoprolol');
    expect(boundQuery('')).toBeNull();
    expect(boundQuery('   ')).toBeNull();
    expect(boundQuery(undefined)).toBeNull();
    expect(boundQuery(['a', 'b'])).toBeNull();
    expect(boundQuery('x'.repeat(SEARCH_QUERY_MAX))).toHaveLength(SEARCH_QUERY_MAX);
    expect(boundQuery('x'.repeat(SEARCH_QUERY_MAX + 1))).toBeNull();
    expect(SEARCH_QUERY_MAX).toBe(200);
  });

  it('searchRecord answers the empty shape for an unbounded term and a malformed circle WITHOUT touching the database', async () => {
    const before = await raw.query('select count(*)::int as n from public.access_log');
    expect(await search.searchRecord(claimsOf('sarah'), circleId, 'x'.repeat(201))).toEqual(EMPTY);
    expect(await search.searchRecord(claimsOf('sarah'), circleId, '   ')).toEqual(EMPTY);
    expect(await search.searchRecord(claimsOf('sarah'), 'not-a-uuid', 'discharge')).toEqual(EMPTY);
    const after = await raw.query('select count(*)::int as n from public.access_log');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe('the coordinator — three kinds, each row labelled, ranked and cut from its own text', () => {
  it('discharge: the document, the derived task and the event, in three groups; every row carries kind · id · subject · rank · parts', async () => {
    const r = await search.searchRecord(claimsOf('sarah'), circleId, 'discharge');
    expect(r.documents.map((d) => d.id)).toEqual([dMed]);
    expect(r.tasks.map((t) => t.id)).toEqual([tDerived]);
    expect(r.events.map((e) => e.id)).toEqual([evDischarge]);
    const doc = r.documents[0];
    expect(doc).toMatchObject({
      kind: 'document',
      id: dMed,
      subject_id: nell,
      subject_name: 'Nell',
      subject_seq: 1,
      category: 'medical',
      title: 'Discharge summary · Jul 12',
    });
    expect(typeof doc.rank).toBe('number');
    expect(doc.snippet.some((p) => p.hit && /^discharge$/i.test(p.text))).toBe(true);
    expect(text(doc.snippet)).not.toMatch(/[\u0002\u0003<>]/);
    expect(r.tasks[0]).toMatchObject({ kind: 'task', category: null, title: 'Follow the discharge instructions' });
    expect(r.events[0]).toMatchObject({ kind: 'timeline_event', category: 'medical', subject_name: 'Nell' });
    expect(r.events[0].snippet.some((p) => p.hit)).toBe(true);
  });

  it('the result carries NO total and no count of anything — three arrays and nothing else', async () => {
    const r = await search.searchRecord(claimsOf('sarah'), circleId, 'discharge');
    expect(Object.keys(r).sort()).toEqual(['documents', 'events', 'tasks']);
  });

  it('a junk term never raises: unbalanced quotes and operators answer the empty shape', async () => {
    expect(await search.searchRecord(claimsOf('sarah'), circleId, '"unbalanced & | ! ( the')).toEqual(EMPTY);
  });
});

describe('SRCH-03 · leakproof, from each person’s live context', () => {
  it('summary: a BODY-ONLY term is the same shape as a term present nowhere (A.5, at the module boundary)', async () => {
    const body = await search.searchRecord(claimsOf('priya'), circleId, 'metoprolol');
    const nowhere = await search.searchRecord(claimsOf('priya'), circleId, 'xylophonezzz');
    expect(body).toEqual(EMPTY);
    expect(body).toEqual(nowhere);
    // the OCR-only term too — weight D is still the view branch
    expect(await search.searchRecord(claimsOf('priya'), circleId, 'warfarin')).toEqual(
      // the title-weight control is hers by TITLE; the OCR-only document is not
      expect.objectContaining({ documents: [expect.objectContaining({ id: dWarf })] }),
    );
  });

  it('summary: a title term matches through tsv_summary, and the snippet is cut from title + summary ONLY', async () => {
    const r = await search.searchRecord(claimsOf('priya'), circleId, 'cardiology');
    expect(r.documents.map((d) => d.id).sort()).toEqual([dCard, dMed].sort());
    for (const d of r.documents) {
      expect(text(d.snippet)).not.toMatch(/metoprolol|warfarin/);
      expect(d.snippet.some((p) => p.hit && /cardiology/i.test(p.text))).toBe(true);
    }
    // §7.6: the whole rows are summary-readable — the task and the event are hers
    expect((await search.searchRecord(claimsOf('priya'), circleId, 'discharge')).tasks.map((t) => t.id)).toEqual([
      tDerived,
    ]);
  });

  it('view: the body term is a hit, marked as a PART cut from search_text_full (SRCH-05)', async () => {
    const r = await search.searchRecord(claimsOf('dan'), circleId, 'metoprolol');
    expect(r.documents.map((d) => d.id)).toEqual([dMed]);
    const hit = r.documents[0].snippet.find((p) => p.hit);
    expect(hit?.text).toMatch(/^metoprolol$/i);
    expect(text(r.documents[0].snippet)).toMatch(/metoprolol 25mg daily/);
  });

  it('view: OCR text is findable at weight D and NEVER outranks a title at weight A', async () => {
    const r = await search.searchRecord(claimsOf('dan'), circleId, 'warfarin');
    expect(r.documents.map((d) => d.id)).toEqual([dWarf, dMed]);
    expect(r.documents[0].rank).toBeGreaterThan(r.documents[1].rank);
    expect(text(r.documents[1].snippet)).toMatch(/scanned page mentions warfarin/);
  });

  it('the caregiver: her assigned task and nothing else — the unassigned twin, the health rows, the sibling are all absent (AC-TASK-5)', async () => {
    const r = await search.searchRecord(claimsOf('marisol'), circleId, 'zqpharm');
    expect(r.tasks.map((t) => t.id)).toEqual([tMine]);
    expect(r.documents).toEqual([]);
    expect(r.events).toEqual([]);
    expect(await search.searchRecord(claimsOf('marisol'), circleId, 'discharge')).toEqual(EMPTY);
    expect(await search.searchRecord(claimsOf('marisol'), circleId, 'cardiology')).toEqual(EMPTY);
  });

  it('a share widens the ONE named document through search — at view — and never the task derived from it nor the sibling', async () => {
    await raw.query('set session_replication_role = replica');
    const share = (
      await raw.query(
        `insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
         values ($1, $2, 'document', $3, $4, $5) returning id`,
        [circleId, nell, dMed, member.marisol, people.sarah.id],
      )
    ).rows[0].id;
    await raw.query('set session_replication_role = default');
    try {
      const r = await search.searchRecord(claimsOf('marisol'), circleId, 'discharge');
      expect(r.documents.map((d) => d.id)).toEqual([dMed]);
      expect(r.tasks).toEqual([]); // tDerived, {schedule,health}: health is still hidden
      expect(r.events).toEqual([]);
      // the share lifts THIS object to view: the body term is hers now
      const body = await search.searchRecord(claimsOf('marisol'), circleId, 'metoprolol');
      expect(body.documents.map((d) => d.id)).toEqual([dMed]);
      // the sibling health document stays absent
      expect((await search.searchRecord(claimsOf('marisol'), circleId, 'cardiology')).documents.map((d) => d.id)).toEqual([dMed]);
    } finally {
      await raw.query('set session_replication_role = replica');
      await raw.query('delete from public.object_shares where id = $1', [share]);
      await raw.query('set session_replication_role = default');
    }
    expect(await search.searchRecord(claimsOf('marisol'), circleId, 'discharge')).toEqual(EMPTY);
  });

  it('a non-member answers the empty shape — indistinguishable from an empty circle', async () => {
    expect(await search.searchRecord(claimsOf('stranger'), circleId, 'discharge')).toEqual(EMPTY);
  });

  it('a search writes NOTHING to the access log (Q4(3)) — the count is unchanged across every read above', async () => {
    const before = await raw.query('select count(*)::int as n from public.access_log where circle_id = $1', [circleId]);
    await search.searchRecord(claimsOf('sarah'), circleId, 'discharge');
    await search.searchRecord(claimsOf('dan'), circleId, 'metoprolol');
    await search.searchRecord(claimsOf('marisol'), circleId, 'zqpharm');
    const after = await raw.query('select count(*)::int as n from public.access_log where circle_id = $1', [circleId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe('myMembership, WIDENED (Q4(2)) — the subjects ride the one existing query', () => {
  it('returns id · tier · the circle’s subjects in founding order, from one round trip', async () => {
    const me = await tasksLib.myMembership(claimsOf('sarah'), circleId);
    expect(me).toEqual({
      id: member.sarah,
      tier: 'coordinator',
      subjects: [{ id: nell, first_name: 'Nell', seq: 1 }],
    });
  });

  it('the caregiver reads her own membership with the same subjects; an outsider is null', async () => {
    const me = await tasksLib.myMembership(claimsOf('marisol'), circleId);
    expect(me?.tier).toBe('care_circle');
    expect(me?.subjects.map((s) => s.first_name)).toEqual(['Nell']);
    expect(await tasksLib.myMembership(claimsOf('stranger'), circleId)).toBeNull();
  });

  it('placeholderFor: one subject names her; two, none, or a failed read say "the record" (§4.7.3)', () => {
    const { placeholderFor } = search;
    expect(placeholderFor([{ id: 'a', first_name: 'Nell', seq: 1 }])).toBe("Search Nell's record");
    expect(
      placeholderFor([
        { id: 'a', first_name: 'Nell', seq: 1 },
        { id: 'b', first_name: 'Marcus', seq: 2 },
      ]),
    ).toBe('Search the record');
    expect(placeholderFor([])).toBe('Search the record');
    expect(placeholderFor(null)).toBe('Search the record');
  });
});
