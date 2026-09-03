import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 8B · THE SEARCH LEGS (slice-8 plan "### 8B" unit 4; PRD §4.7.3, §4.3.6;
// TSD §7.2–§7.7; SRCH-03/04/05/06's live halves; A11Y-12) — browser truth
// over the LIVE stack, from each person's OWN context. CI never runs
// browsers; this is the local gate's surface for the Search increment.
//
//   · THE LEAK LEG FIRST — a `summary` member searches a term present ONLY
//     in a document's body and gets the SAME RENDERED SHAPE as a term
//     present nowhere (A.5's oracle, at the surface); her title term still
//     finds the document, with a snippet cut from title + summary only;
//   · at `view` the body snippet marks the term as `<mark>` STRUCTURE and
//     the OCR text is findable at weight D — never above a title at A;
//   · the caregiver's search returns her assigned task and nothing else
//     (AC-TASK-5), from a field the nav's courtesy cannot hide;
//   · a share widens the ONE named document and never the task derived
//     from it nor its sibling (AC-PERM-6, §7.6);
//   · the four §4.7.3 strings verbatim; an over-cap term refused with the
//     empty copy, never an error; the ABSENCES — no total, no autocomplete,
//     no suggestion list — over the rendered tree;
//   · A11Y-12 — the field labelled and keyboard-reachable, results as
//     headed groups, emphasis never colour alone, at 390 px.
//
// D8's conditions hold file-wide: NO serial blocks; the founder, members
// and the searchable rows are MEMOIZED provisions any leg can trigger
// alone; every leg is runnable BY TITLE; afterAll closes what this spec
// opened. Fixture rows land under replica role (the gate's standing
// concession); their VECTORS are then built by the REAL triggers through a
// no-op UPDATE in normal mode (the prf06.mjs mechanics) — nothing here
// fakes a vector, and every READ goes through the real screens from the
// reader's own session. Never real family data.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
const stamp = Date.now();
const FOUNDER_EMAIL = `search.founder.${stamp}@example.com`;
const PASSWORD = 'a quiet harbour crossing 7';
const MEMBERS = {
  // the invite's family defaults: health/schedule/memories at SUMMARY
  priya: { email: `search.priya.${stamp}@example.com`, name: 'Priya', tier: 'family' },
  // re-granted VIEW ×5 by the fixture concession (the people.spec pattern)
  dan: { email: `search.dan.${stamp}@example.com`, name: 'Dan', tier: 'family' },
  // the caregiver: schedule at summary — health HIDDEN
  marisol: { email: `search.marisol.${stamp}@example.com`, name: 'Marisol', tier: 'care_circle' },
} as const;
type MemberKey = keyof typeof MEMBERS;

const EMPTY_COPY = 'Nothing matching that, in what you can see.';
const HINT_COPY = 'Find documents, dates and tasks.';

// The §8.7 faint/label redundancy exemption — a11y.spec's OWN named list,
// replicated verbatim. G12 re-audits each use.
const CONTRAST_EXEMPT = ['.section-label', '.micro-meta'];
async function axeViolations(page: Page) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  for (const selector of CONTRAST_EXEMPT) builder = builder.exclude(selector);
  return (await builder.analyze()).violations;
}

async function query(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

/** The standing gate-fixture concession, never a product path. */
async function fixtureInsert(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('set session_replication_role = replica');
    await client.query(text, params);
  } finally {
    await client.query('set session_replication_role = default').catch(() => {});
    await client.end();
  }
}

type Founder = { context: BrowserContext; page: Page; circleId: string; accountId: string; nell: string };

let founderMemo: Promise<Founder> | null = null;
function theFounder(browser: Browser): Promise<Founder> {
  founderMemo ??= provisionFounder(browser);
  return founderMemo;
}

async function verifyByMail(page: Page, email: string) {
  const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) =>
    r.json(),
  );
  const picked = (search.messages as Array<{ ID: string; To?: Array<{ Address?: string }> }>).find((m) =>
    (m.To ?? []).some((t) => t.Address === email),
  );
  if (!picked) throw new Error(`Mailpit search for ${email} found no message addressed to it`);
  const message = await fetch(`${MAILPIT}/api/v1/message/${picked.ID}`).then((r) => r.json());
  const link = String(message.Text ?? message.HTML).match(/https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
}

async function provisionFounder(browser: Browser): Promise<Founder> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/create-account');
  await page.fill('input[name="name"]', 'Search Founder');
  await page.fill('input[name="email"]', FOUNDER_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/setup/step/1');
  await page.check('input[name="relationship"][value="daughter"]');
  await page.check('input[name="slice"][value="money-paperwork"]');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/setup/step/2**');
  await page.fill('input[name="subject_name_1"]', 'Nell');
  await page.check('input[name="situation_1"][value="At home, on their own"]');
  await page.fill('input[name="zip_1"]', '02140');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/setup/step/3**');
  const circleId = new URL(page.url()).searchParams.get('circle')!;
  await page.check('input[name="context"][value="paperwork-piling-up"]');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/setup/step/4**');
  await verifyByMail(page, FOUNDER_EMAIL);
  const verified = await query('select id, email_verified_at from public.accounts where email = $1', [FOUNDER_EMAIL]);
  if (!verified.rows[0]?.email_verified_at) {
    throw new Error('the verification click did not verify THIS founder — refused at the cause');
  }
  const subjects = await query('select id from public.subjects where circle_id = $1', [circleId]);
  return { context, page, circleId, accountId: verified.rows[0].id as string, nell: subjects.rows[0].id as string };
}

type Member = { context: BrowserContext; page: Page; memberId: string };
const memberMemo: Partial<Record<MemberKey, Promise<Member>>> = {};
function theMember(browser: Browser, key: MemberKey): Promise<Member> {
  memberMemo[key] ??= provisionMember(browser, key);
  return memberMemo[key]!;
}

async function provisionMember(browser: Browser, key: MemberKey): Promise<Member> {
  const f = await theFounder(browser);
  const m = MEMBERS[key];
  await f.page.goto(`/${f.circleId}/invite`);
  await f.page.fill('input[name="invited_email"]', m.email);
  await f.page.check(`input[name="tier"][value="${m.tier}"]`);
  const boxes = f.page.locator('input[name="subject_ids"]');
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
  await f.page.click('button[type="submit"]');
  await f.page.waitForURL('**/invite/created');
  const acceptUrl = (await f.page.locator('.mono-address').textContent())!.trim();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(acceptUrl.replace(/^https?:\/\/[^/]+/, ''));
  await page.click('a[href*="/create-account?invite="]');
  await page.fill('input[name="name"]', m.name);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/accept/**');
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${f.circleId}/**`);
  const member = await query(
    `select m.id from public.circle_members m join public.accounts a on a.id = m.account_id
      where m.circle_id = $1 and a.email = $2`,
    [f.circleId, m.email],
  );
  const memberId = member.rows[0].id as string;
  if (key === 'dan') {
    // VIEW ×5 — the level at which the dsc join resolves (§7.2).
    await query('delete from public.access_grants where member_id = $1 and subject_id = $2', [memberId, f.nell]);
    await query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       select $1, $2, $3, d, 'view'::hc.access_level, $4
         from unnest(array['memories','health','schedule','documents','finances']::hc.domain[]) d`,
      [f.circleId, memberId, f.nell, f.accountId],
    );
  }
  return { context, page, memberId };
}

type Rows = { dMed: string; dWarf: string; dCard: string; tMine: string; tOpen: string; tDerived: string; event: string };
let rowsMemo: Promise<Rows> | null = null;
function theRows(browser: Browser): Promise<Rows> {
  rowsMemo ??= provisionRows(browser);
  return rowsMemo;
}

/**
 * The searchable record: three health documents (one with an approved
 * extraction — the body text at weight C — and OCR text at weight D), three
 * tasks (one assigned to the caregiver, one unassigned twin, one derived
 * from the discharge document) and one event. Inserted under replica role,
 * then the VECTORS built by the real triggers through a no-op UPDATE in
 * normal mode, and the OCR text through the dsc builder.
 */
async function provisionRows(browser: Browser): Promise<Rows> {
  const f = await theFounder(browser);
  const marisol = await theMember(browser, 'marisol');
  const arrival = randomUUID();
  const extraction = randomUUID();
  const proposal = randomUUID();
  const rows: Rows = {
    dMed: randomUUID(),
    dWarf: randomUUID(),
    dCard: randomUUID(),
    tMine: randomUUID(),
    tOpen: randomUUID(),
    tDerived: randomUUID(),
    event: randomUUID(),
  };
  await fixtureInsert(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, scan_verdict)
     values ($1, $2, $3, 'upload', 'filed', 'clean')`,
    [arrival, f.circleId, f.nell],
  );
  await fixtureInsert(
    `insert into public.extractions (id, arrival_id, circle_id, subject_id, field, value, confidence,
       risk_class, citation, model_id, prompt_version)
     values ($1, $2, $3, $4, 'medication', '"metoprolol 25mg daily"', 0.95, 'high',
             '{"page": 1, "bbox": [0.1, 0.1, 0.2, 0.05]}', 'fixture-model', 'v0')`,
    [extraction, arrival, f.circleId, f.nell],
  );
  await fixtureInsert(
    `insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, source_extraction_ids,
       taint, status, decided_by, decided_at)
     values ($1, $2, $3, $4, 'document', '{"title": "Discharge summary"}', array[$5::uuid], '{health}',
             'approved', $6, now())`,
    [proposal, arrival, f.circleId, f.nell, extraction, f.accountId],
  );
  await fixtureInsert(
    `insert into public.documents (id, circle_id, subject_id, title, category, summary_text, artifact_arrival_id,
       source_arrival_id, source_proposal_id, filed_at, approved_by, approved_at, approver_display_name, taint)
     values
       ($1, $4, $5, $9, 'medical', 'Home with cardiology follow-up.', $6, $6, $7, now(), $8, now(), 'Search Founder', '{health}'),
       ($2, $4, $5, $10, 'medications', 'A short note.', $6, $6, null, now(), $8, now(), 'Search Founder', '{health}'),
       ($3, $4, $5, $11, 'medical', 'A routine consult.', $6, $6, null, now(), $8, now(), 'Search Founder', '{health}')`,
    [
      rows.dMed,
      rows.dWarf,
      rows.dCard,
      f.circleId,
      f.nell,
      arrival,
      proposal,
      f.accountId,
      `Discharge summary · ${stamp}`,
      `Warfarin plan · ${stamp}`,
      `Cardiology consult · ${stamp}`,
    ],
  );
  await fixtureInsert(
    `insert into public.tasks (id, circle_id, subject_id, title, detail, status, owner_member_id, assigned_by,
       assigned_at, approved_by, approved_at, approver_display_name, taint)
     values
       ($1, $4, $5, 'Call the pharmacy about zqpharm', 'Ask about the refill.', 'open', $6, $7, now(), $7, now(), 'Search Founder', '{schedule}'),
       ($2, $4, $5, 'Refill zqpharm at Riverbend', null, 'open', null, null, null, $7, now(), 'Search Founder', '{schedule}'),
       ($3, $4, $5, 'Follow the discharge instructions', null, 'open', null, null, null, $7, now(), 'Search Founder', '{schedule,health}')`,
    [rows.tMine, rows.tOpen, rows.tDerived, f.circleId, f.nell, marisol.memberId, f.accountId],
  );
  await fixtureInsert(
    `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
     values ($1, 'task', $2, 'document', $3)`,
    [f.circleId, rows.tDerived, rows.dMed],
  );
  await fixtureInsert(
    `insert into public.timeline_events (id, circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
       approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'medical', 'Discharge follow-up booked with cardiology', '2026-08-15', 'America/New_York',
             $4, now(), 'Search Founder', '{health}')`,
    [rows.event, f.circleId, f.nell, f.accountId],
  );
  // The vectors, by the REAL triggers (normal mode): tsv builders, the dsc
  // sync, the dsc builder — then the OCR text through the builder.
  await query('update public.documents set title = title where circle_id = $1', [f.circleId]);
  await query('update public.tasks set title = title where circle_id = $1', [f.circleId]);
  await query('update public.timeline_events set summary = summary where circle_id = $1', [f.circleId]);
  await query(`update public.document_search_content set ocr_text = 'scanned page mentions warfarin' where document_id = $1`, [
    rows.dMed,
  ]);
  return rows;
}

/** The rendered SHAPE of a search from one person's context: main's
 *  markup with the term itself normalised out, so two terms can be
 *  compared as trees. */
async function shapeOf(page: Page, circleId: string, term: string): Promise<string> {
  await page.goto(`/${circleId}/search?q=${encodeURIComponent(term)}`);
  const html = await page.locator('main').innerHTML();
  return html.split(term).join('TERM');
}

test.describe('the 8B search legs', () => {
  // Provisioning-heavy by design (the documents.spec precedent, 420 s): the
  // first leg to need it pays for a real founder, three invited members
  // and the dev server's cold compile of the search route. Per-leg,
  // explicit, never a retry — and never `workers: 1`, which the config
  // already sets.
  test.describe.configure({ timeout: 420_000 });

  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
    for (const m of Object.values(memberMemo)) await m?.then((x) => x.context.close()).catch(() => {});
  });

  test('search leak: at summary a body-only term renders the SAME shape as a term present nowhere; a title term finds the document with a snippet cut from title + summary (SRCH-03, AC-DOC-4)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const rows = await theRows(browser);
    const priya = await theMember(browser, 'priya');

    // Positive control first: the body term IS in the record — the
    // coordinator finds it — so the summary member's emptiness is the
    // filter, not an absence.
    await f.page.goto(`/${f.circleId}/search?q=metoprolol`);
    await expect(f.page.locator(`main a.action-link[href="/${f.circleId}/documents/${rows.dMed}"]`)).toBeVisible();

    // THE LEAK LEG: from HER live context, body-only ≡ nowhere.
    const body = await shapeOf(priya.page, f.circleId, 'metoprolol');
    const nowhere = await shapeOf(priya.page, f.circleId, 'xylophonezzz');
    expect(body).toBe(nowhere);
    expect(body).toContain(EMPTY_COPY);
    expect(body).not.toContain('record-section');
    expect(body).not.toContain('<mark');
    // and an OCR-only term too ('scanned' lives only in ocr_text) — weight D
    // is the view branch
    const ocr = await shapeOf(priya.page, f.circleId, 'scanned');
    expect(ocr).toBe(nowhere);

    // Her title term still matches through tsv_summary, and the snippet is
    // cut from title + summary ONLY — never a word of the body.
    await priya.page.goto(`/${f.circleId}/search?q=discharge`);
    const doc = priya.page.locator(`main li:has(a.action-link[href="/${f.circleId}/documents/${rows.dMed}"])`);
    await expect(doc).toBeVisible();
    await expect(doc.locator('.search-snippet mark').first()).toHaveText(/discharge/i);
    await expect(doc.locator('.search-snippet')).not.toContainText(/metoprolol|warfarin/i);
    // 'warfarin' finds the TITLE document for her, not the OCR one
    await priya.page.goto(`/${f.circleId}/search?q=warfarin`);
    await expect(priya.page.locator(`main a.action-link[href="/${f.circleId}/documents/${rows.dWarf}"]`)).toBeVisible();
    expect(await priya.page.locator(`main a.action-link[href="/${f.circleId}/documents/${rows.dMed}"]`).count()).toBe(0);
  });

  test('search at view: the body snippet marks the term as <mark> structure and the OCR text is findable at weight D, never above a title (SRCH-05)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const rows = await theRows(browser);
    const dan = await theMember(browser, 'dan');

    await dan.page.goto(`/${f.circleId}/search?q=metoprolol`);
    const doc = dan.page.locator(`main li:has(a.action-link[href="/${f.circleId}/documents/${rows.dMed}"])`);
    await expect(doc).toBeVisible();
    // STRUCTURE: the emphasis is an element, built by React from the
    // module's parts — the snippet's markup carries no <b> and no escaped
    // sentinel, and the mark's text is exactly the term.
    const mark = doc.locator('.search-snippet mark');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText(/^metoprolol$/i);
    expect(await doc.locator('.search-snippet').innerHTML()).not.toMatch(/<b>|&lt;b&gt;/);
    await expect(doc.locator('.search-snippet')).toContainText('metoprolol 25mg daily');

    // The OCR term: findable — and the title-weight document ranks ABOVE it.
    await dan.page.goto(`/${f.circleId}/search?q=warfarin`);
    const links = dan.page.locator('main section[aria-labelledby="results-documents"] a.action-link');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute('href', `/${f.circleId}/documents/${rows.dWarf}`);
    await expect(links.nth(1)).toHaveAttribute('href', `/${f.circleId}/documents/${rows.dMed}`);
    await expect(
      dan.page.locator(`main li:has(a[href="/${f.circleId}/documents/${rows.dMed}"]) .search-snippet`),
    ).toContainText('scanned page mentions');
    // every result is labelled by subject (§7.6)
    for (const label of await dan.page.locator('main .record-list li .subject-label').all()) {
      await expect(label).toContainText('Nell');
    }
  });

  test('search for the caregiver: her assigned task and nothing else — the field renders outside the nav’s courtesy (SRCH-03, AC-TASK-5)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const rows = await theRows(browser);
    const marisol = await theMember(browser, 'marisol');

    await marisol.page.goto(`/${f.circleId}/tasks`);
    // The nav's courtesy hides Documents from her; the FIELD is not in the
    // nav and renders anyway (settled item 6).
    expect(await marisol.page.locator(`nav.left-nav a[href="/${f.circleId}/documents"]`).count()).toBe(0);
    await expect(marisol.page.locator('form[role="search"] input[name="q"]')).toBeVisible();

    await marisol.page.fill('form[role="search"] input[name="q"]', 'zqpharm');
    await marisol.page.press('form[role="search"] input[name="q"]', 'Enter');
    await marisol.page.waitForURL(/\/search\?q=zqpharm/);
    const tasks = marisol.page.locator('main section[aria-labelledby="results-tasks"] .record-list > li');
    await expect(tasks).toHaveCount(1);
    await expect(tasks.first().locator('a.action-link')).toHaveAttribute('href', `/${f.circleId}/tasks/${rows.tMine}`);
    expect(await marisol.page.locator(`main a[href="/${f.circleId}/tasks/${rows.tOpen}"]`).count()).toBe(0);
    expect(await marisol.page.locator('main section[aria-labelledby="results-documents"]').count()).toBe(0);
    expect(await marisol.page.locator('main section[aria-labelledby="results-timeline"]').count()).toBe(0);
    // the health rows: the same shape as nothing
    await marisol.page.goto(`/${f.circleId}/search?q=discharge`);
    await expect(marisol.page.locator('main')).toContainText(EMPTY_COPY);
    expect(await marisol.page.locator('main .record-list').count()).toBe(0);
  });

  test('search after a share: the one named document widens, never the task derived from it nor the sibling (SRCH-03, AC-PERM-6)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const rows = await theRows(browser);
    const marisol = await theMember(browser, 'marisol');

    // BEFORE: from her context the document is not in the record she sees.
    await marisol.page.goto(`/${f.circleId}/search?q=discharge`);
    expect(await marisol.page.locator(`main a[href="/${f.circleId}/documents/${rows.dMed}"]`).count()).toBe(0);

    const share = randomUUID();
    await fixtureInsert(
      `insert into public.object_shares (id, circle_id, subject_id, object_type, object_id, member_id, granted_by)
       values ($1, $2, $3, 'document', $4, $5, $6)`,
      [share, f.circleId, f.nell, rows.dMed, marisol.memberId, f.accountId],
    );
    try {
      // HER next look: the one document — at view, so the body term is hers
      // too — and NOT the task derived from it, NOT the sibling.
      await marisol.page.goto(`/${f.circleId}/search?q=discharge`);
      const docs = marisol.page.locator('main section[aria-labelledby="results-documents"] .record-list > li');
      await expect(docs).toHaveCount(1);
      await expect(docs.first().locator('a.action-link')).toHaveAttribute('href', `/${f.circleId}/documents/${rows.dMed}`);
      expect(await marisol.page.locator('main section[aria-labelledby="results-tasks"]').count()).toBe(0);
      expect(await marisol.page.locator(`main a[href="/${f.circleId}/tasks/${rows.tDerived}"]`).count()).toBe(0);
      await marisol.page.goto(`/${f.circleId}/search?q=metoprolol`);
      await expect(marisol.page.locator(`main a[href="/${f.circleId}/documents/${rows.dMed}"]`)).toBeVisible();
      await marisol.page.goto(`/${f.circleId}/search?q=cardiology`);
      await expect(marisol.page.locator(`main a[href="/${f.circleId}/documents/${rows.dMed}"]`)).toBeVisible();
      expect(await marisol.page.locator(`main a[href="/${f.circleId}/documents/${rows.dCard}"]`).count()).toBe(0);
      // the link RESOLVES to the object she was given
      const res = await marisol.page.request.get(`/${f.circleId}/documents/${rows.dMed}`);
      expect(res.status()).toBe(200);
    } finally {
      await fixtureInsert('delete from public.object_shares where id = $1', [share]);
    }
    // AFTER: her next look loses it.
    await marisol.page.goto(`/${f.circleId}/search?q=discharge`);
    await expect(marisol.page.locator('main')).toContainText(EMPTY_COPY);
  });

  test('search copy and bounds: the four §4.7.3 strings verbatim; an over-cap term is refused with the empty copy, never an error; no total, no autocomplete, no suggestion list (SRCH-04, SRCH-06)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    await theRows(browser);

    // The field: the one-subject placeholder and the hint, verbatim.
    await f.page.goto(`/${f.circleId}/tasks`);
    const field = f.page.locator('form[role="search"] input[name="q"]');
    await expect(field).toHaveAttribute('placeholder', "Search Nell's record");
    await expect(f.page.locator('#search-hint')).toHaveText(HINT_COPY);
    // the absences, over the rendered tree (§7.4)
    expect(await f.page.locator('form[role="search"] [autocomplete]').count()).toBe(0);
    expect(await f.page.locator('datalist, [role="listbox"], [role="combobox"], [aria-autocomplete]').count()).toBe(0);

    // The empty copy, verbatim; and no count of anything.
    await f.page.goto(`/${f.circleId}/search?q=xylophonezzz`);
    await expect(f.page.locator('main .empty-state')).toHaveText(EMPTY_COPY);
    expect(await f.page.locator('main .record-list').count()).toBe(0);

    // An over-cap term: refused with the SAME copy, status 200, never an error.
    const long = 'a'.repeat(201);
    const res = await f.page.request.get(`/${f.circleId}/search?q=${long}`);
    expect(res.status()).toBe(200);
    await f.page.goto(`/${f.circleId}/search?q=${long}`);
    await expect(f.page.locator('main .empty-state')).toHaveText(EMPTY_COPY);

    // A results page: no total, no "showing N of M", no prose answer — main
    // is a header, headed groups, and nothing else.
    await f.page.goto(`/${f.circleId}/search?q=discharge`);
    await expect(f.page.locator('main section[aria-labelledby="results-documents"] .record-list > li').first()).toBeVisible();
    const mainText = (await f.page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(mainText).not.toMatch(/\b\d+\s+(results?|matches|of\s+\d+)\b/i);
    expect(mainText).not.toMatch(/\bshowing\b/i);
    const kinds = await f.page.locator('main > *').evaluateAll((els) => els.map((e) => e.tagName.toLowerCase()));
    expect(new Set(kinds)).toEqual(new Set(['header', 'section']));
    // every result link RESOLVES
    for (const href of await f.page.locator('main .record-list a.action-link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      const r = await f.page.request.get(href!);
      expect(r.status(), href!).toBe(200);
    }
  });

  test('A11Y-12: the search field labelled and keyboard-reachable, results as headed groups, emphasis as <mark> not colour alone, at 390px', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const rows = await theRows(browser);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto('/sign-in');
      await page.fill('input[name="email"]', FOUNDER_EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

      // KEYBOARD: from the top of a record page, Tab reaches the field — the
      // first focusable in the chrome — and Enter submits the GET form.
      await page.goto(`/${f.circleId}/tasks`);
      await page.locator('body').focus();
      let landed = false;
      for (let i = 0; i < 8 && !landed; i++) {
        await page.keyboard.press('Tab');
        landed = await page.evaluate(() => document.activeElement?.getAttribute('name') === 'q');
      }
      expect(landed, 'Tab reaches the search field within eight stops').toBe(true);
      // LABELLED: an accessible name from the bound label, not the placeholder.
      await expect(page.getByRole('searchbox', { name: 'Search' })).toBeFocused();
      await page.keyboard.type('warfarin');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/search\?q=warfarin/);

      // HEADED GROUPS: each group is a section labelled by its heading.
      const sections = page.locator('main section[aria-labelledby]');
      expect(await sections.count()).toBeGreaterThan(0);
      for (const section of await sections.all()) {
        const id = await section.getAttribute('aria-labelledby');
        await expect(section.locator(`h2#${id}`)).toBeVisible();
      }
      await expect(page.locator(`main a.action-link[href="/${f.circleId}/documents/${rows.dWarf}"]`)).toBeVisible();

      // EMPHASIS NOT BY COLOUR ALONE: the element is a <mark>, and its weight
      // and underline carry the meaning beside the wash.
      const mark = page.locator('main .search-snippet mark').first();
      await expect(mark).toBeVisible();
      const style = await mark.evaluate((el) => {
        const s = getComputedStyle(el);
        return { weight: s.fontWeight, decoration: s.textDecorationLine };
      });
      expect(Number(style.weight)).toBeGreaterThanOrEqual(600);
      expect(style.decoration).toContain('underline');

      // 390 px: axe clean with the named exemption, the 44 px floor on the
      // field and every result link, no horizontal scroll.
      expect(await axeViolations(page)).toEqual([]);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('input[name="q"], main a.action-link'))) {
          const r = el.getBoundingClientRect();
          if (r.height < 44 || r.width < 44) out.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        return out;
      });
      expect(small).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // the empty state audits clean too
      await page.goto(`/${f.circleId}/search?q=xylophonezzz`);
      await expect(page.locator('main .empty-state')).toHaveText(EMPTY_COPY);
      expect(await axeViolations(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
