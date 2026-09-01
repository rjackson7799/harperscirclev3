import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas } from '@napi-rs/canvas';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7C · THE DOCUMENTS LEGS (slice-7 plan C6; PRD §4.3; DOC-01..04's live
// halves; AC-DOC-2/3/5/6; A11Y-11) — browser truth over the LIVE stack, from
// each person's OWN context. CI never runs browsers; this is the local
// gate's surface for the Documents increment.
//
//   · the list — rows at the member's own level, counts post-filter over the
//     rendered tree, Add a document leading to the EXISTING upload page (the
//     empty state's sentence is the vitest contract's — a shared circle
//     accumulates, and a leg that needs emptiness has a hidden precondition);
//   · the detail — sentences at summary from a summary member's LIVE
//     context, with no viewer and no control implying one; at view the pages
//     through the artifact route (the ONE byte path) with the machine-read
//     sibling per page;
//   · re-categorise — the EXACT audience named before the move, the move
//     landing, from its own fixture document so no other leg's object moves;
//   · share / unshare — one document to the caregiver, HER context gaining
//     exactly it (and not a task derived from it — AC-PERM-10), unshare in
//     ONE action and her next look losing it;
//   · A11Y-11 — the viewer at 390 px: axe, alt text, and the sibling
//     reachable by keyboard as native text is.
//
// D8's conditions hold file-wide: NO serial blocks; the founder, members and
// the processed document are MEMOIZED provisions any leg can trigger alone;
// every leg is runnable BY TITLE; afterAll closes what this spec opened.
// Fixture writes under replica role are the gate's standing concession —
// every ACT goes through the real screens and the real definers. The one
// PIPELINE drive (upload → proposals_ready) is real end to end, so the
// viewer renders pages a worker actually promoted. Never real family data.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
const WORKER_KEY = 'local-gate-worker-key-0123456789abcdef0123456789abcdef';
const stamp = Date.now();
const FOUNDER_EMAIL = `docs.founder.${stamp}@example.com`;
const PASSWORD = 'a quiet river crossing 7';
const MEMBERS = {
  dan: { email: `docs.dan.${stamp}@example.com`, name: 'Dan', tier: 'family' },
  marisol: { email: `docs.marisol.${stamp}@example.com`, name: 'Marisol', tier: 'care_circle' },
} as const;
type MemberKey = keyof typeof MEMBERS;
const MACHINE_READ_LABEL = 'machine-read — may contain errors';

// The §8.7 faint/label redundancy exemption — a11y.spec's OWN named list,
// replicated verbatim (gate r3: an axe call without it flags the shell's
// deliberately-faint labels on every page). G12 re-audits each use.
const CONTRAST_EXEMPT = ['.section-label', '.micro-meta'];
async function axeViolations(page: Page) {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);
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

type Founder = {
  context: BrowserContext;
  page: Page;
  circleId: string;
  accountId: string;
  nell: string;
};

let founderMemo: Promise<Founder> | null = null;
function theFounder(browser: Browser): Promise<Founder> {
  founderMemo ??= provisionFounder(browser);
  return founderMemo;
}

async function verifyByMail(page: Page, email: string) {
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  ).then((r) => r.json());
  const picked = (search.messages as Array<{ ID: string; To?: Array<{ Address?: string }> }>).find(
    (m) => (m.To ?? []).some((t) => t.Address === email),
  );
  if (!picked) throw new Error(`Mailpit search for ${email} found no message addressed to it`);
  const message = await fetch(`${MAILPIT}/api/v1/message/${picked.ID}`).then((r) => r.json());
  const link = String(message.Text ?? message.HTML).match(
    /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
}

async function provisionFounder(browser: Browser): Promise<Founder> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/create-account');
  await page.fill('input[name="name"]', 'Docs Founder');
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
  const verified = await query('select id, email_verified_at from public.accounts where email = $1', [
    FOUNDER_EMAIL,
  ]);
  if (!verified.rows[0]?.email_verified_at) {
    throw new Error('the verification click did not verify THIS founder — refused at the cause');
  }
  const subjects = await query('select id from public.subjects where circle_id = $1', [circleId]);
  return {
    context,
    page,
    circleId,
    accountId: verified.rows[0].id as string,
    nell: subjects.rows[0].id as string,
  };
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
  return { context, page, memberId: member.rows[0].id as string };
}

/** Drive the workers until the arrival reaches one of `wanted`. */
async function driveTo(f: Founder, arrivalId: string, wanted: string[], timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    for (const stage of ['store', 'scan', 'gate', 'extract', 'interpret']) {
      await f.page.request.post(`/api/worker/${stage}`, { headers: { 'x-worker-key': WORKER_KEY } });
    }
    const r = await query('select state::text as s from public.arrivals where id = $1', [arrivalId]);
    last = r.rows[0]?.s ?? '(missing)';
    if (wanted.includes(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`driveTo(${arrivalId}): wanted ${wanted.join('|')}, still ${last}`);
}

type Doc = { documentId: string; arrivalId: string; pageCount: number };

/**
 * ONE real pipeline drive for the whole spec: an image-only source with
 * REAL painted glyphs (so the OCR sibling exists — A11Y-11's other half),
 * uploaded through the real screen, driven to `proposals_ready` by the
 * real workers, then FILED as a document by the fixture concession — the
 * drafting/approval dance is the review legs' business; these legs assert
 * the VIEWER over pages a worker actually promoted.
 */
let docMemo: Promise<Doc> | null = null;
function theDocument(browser: Browser): Promise<Doc> {
  docMemo ??= provisionDocument(browser);
  return docMemo;
}

async function provisionDocument(browser: Browser): Promise<Doc> {
  const f = await theFounder(browser);
  const canvas = createCanvas(1240, 900);
  const cx = canvas.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, 1240, 900);
  cx.fillStyle = '#111111';
  cx.font = '52px sans-serif';
  cx.fillText('Discharge note for Nell.', 90, 180);
  cx.fillText('Wound care twice daily.', 90, 300);
  cx.fillText('Follow up in two weeks.', 90, 420);
  const png = Buffer.from(await canvas.encode('png'));

  const before = await query(
    `select coalesce(max(received_at), now() - interval '1 day') as t
       from public.arrivals where circle_id = $1`,
    [f.circleId],
  );
  await f.page.goto(`/${f.circleId}/upload`);
  await f.page.setInputFiles('input[type="file"]', {
    name: `docs-${stamp}.png`,
    mimeType: 'image/png',
    buffer: png,
  });
  await f.page.click('button:has-text("Upload")');
  await expect(f.page.locator('[role="status"]')).toContainText('is in', { timeout: 60_000 });
  const arrival = await query(
    `select id from public.arrivals
      where circle_id = $1 and channel = 'upload' and received_at > $2
      order by received_at desc limit 1`,
    [f.circleId, before.rows[0].t],
  );
  const arrivalId = arrival.rows[0].id as string;
  expect(await driveTo(f, arrivalId, ['proposals_ready'])).toBe('proposals_ready');

  const documentId = randomUUID();
  await fixtureInsert(
    `insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
       artifact_arrival_id, source_arrival_id, filed_at, approved_by, approved_at,
       approver_display_name, taint)
     values ($1, $2, $3, 'Discharge note · Nell', 'medical',
       'Nell was discharged. Wound care continues twice daily. A follow-up is booked.',
       $4, $4, now(), $5, now(), 'Docs Founder', '{health}')`,
    [documentId, f.circleId, f.nell, arrivalId, f.accountId],
  );
  const rendition = await query(
    'select page_count from public.arrival_renditions where arrival_id = $1',
    [arrivalId],
  );
  return { documentId, arrivalId, pageCount: Number(rendition.rows[0]?.page_count ?? 1) };
}

/** A fixture document with NO pipeline behind it — the re-categorise leg's
 *  own object, so no other leg's document moves under it. */
async function fixtureDocument(f: Founder, title: string): Promise<string> {
  const id = randomUUID();
  const arrival = randomUUID();
  await fixtureInsert(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, scan_verdict)
     values ($1, $2, $3, 'upload', 'filed', 'clean')`,
    [arrival, f.circleId, f.nell],
  );
  await fixtureInsert(
    `insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
       artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, $4, 'medical', 'A short note.', $5, now(), $6, now(), 'Docs Founder', '{health}')`,
    [id, f.circleId, f.nell, title, arrival, f.accountId],
  );
  return id;
}

test.describe('the 7C documents legs', () => {
  // Provisioning-heavy by design (the kickoff's own rule: budget such specs
  // in-file): the first leg to need it pays for a real founder, up to two
  // invited members, ONE real pipeline drive and the dev server's cold
  // compiles of the documents routes. Per-leg, explicit, never a retry.
  test.describe.configure({ timeout: 420_000 });

  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
    for (const m of Object.values(memberMemo)) await m?.then((x) => x.context.close()).catch(() => {});
  });

  test('documents list: rows at the member’s own level, counts post-filter over the rendered tree; Add a document is an ingestion (DOC-01, AC-DOC-2)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const d = await theDocument(browser);
    await f.page.goto(`/${f.circleId}/documents`);
    // the row, its category word and its subject, linking to the detail
    await expect(f.page.locator(`a[href="/${f.circleId}/documents/${d.documentId}"]`)).toBeVisible();
    await expect(f.page.locator('main')).toContainText('Medical');
    // the count is over the rendered rows — read both and compare
    const rows = await f.page.locator('.record-list > li').count();
    await expect(f.page.locator('main')).toContainText(`${rows} document${rows === 1 ? '' : 's'}`);
    // Add a document leads to the EXISTING upload page — an ingestion, never
    // a bypass: the control is a link to /upload, not an input here.
    await f.page.click(`main a[href="/${f.circleId}/upload"]`);
    await f.page.waitForURL('**/upload');
    await expect(f.page.locator('input[type="file"]')).toBeVisible();
  });

  test('documents detail: sentences at summary with no viewer and no control; at view the pages through the artifact route with the machine-read sibling (DOC-02)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const d = await theDocument(browser);

    // AT VIEW (the founder): every page renders through the ONE byte path.
    const artifactResponse = f.page.waitForResponse(
      (r) => r.url().includes(`/api/artifact/${d.arrivalId}?page=1`) && r.status() === 200,
    );
    await f.page.goto(`/${f.circleId}/documents/${d.documentId}`);
    await artifactResponse;
    const imgs = f.page.locator('section[aria-labelledby="the-document"] img');
    expect(await imgs.count()).toBe(d.pageCount);
    // the machine-read sibling: ONE control per page, §6.9's exact label,
    // and opening it reads the words the page actually carries
    const toggles = f.page.locator('button.review-machine-text-toggle');
    expect(await toggles.count()).toBe(d.pageCount);
    await expect(toggles.first()).toHaveText(MACHINE_READ_LABEL);
    await toggles.first().click();
    await expect(f.page.locator('pre.review-machine-text')).toContainText(/Wound care|Discharge/, {
      timeout: 20_000,
    });
    // where it came from and who approved it (AC-DOC-3)
    await expect(f.page.locator('main')).toContainText('Approved by Docs Founder');

    // AT SUMMARY (Dan, the family default — health at summary): the SAME
    // URL from HIS live context is a list of sentences and nothing more.
    const dan = await theMember(browser, 'dan');
    await dan.page.goto(`/${f.circleId}/documents/${d.documentId}`);
    await expect(dan.page.locator('main')).toContainText('Wound care continues twice daily.');
    expect(await dan.page.locator('section[aria-labelledby="the-document"]').count()).toBe(0);
    expect(await dan.page.locator('main img').count()).toBe(0);
    await expect(dan.page.locator('main')).not.toContainText(MACHINE_READ_LABEL);
    await expect(dan.page.locator('main')).not.toContainText('Share this document');
    expect(await dan.page.locator('main [disabled]').count()).toBe(0);
  });

  test('re-categorise: the audience named before the move, the move landing with its markers (DOC-03, AC-DOC-6)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    // Dan must EXIST for the audience to name him (family default: health
    // summary, finances hidden — the move out of health is his to lose).
    await theMember(browser, 'dan');
    const docId = await fixtureDocument(f, `Statement to move · ${stamp}`);

    await f.page.goto(`/${f.circleId}/documents/${docId}`);
    await f.page.check('input[name="move"][value="financial"]');
    await f.page.click('button:has-text("Preview the move")');
    await f.page.waitForURL(/\?move=financial/);
    // the EXACT audience, by name, BEFORE the move
    await expect(f.page.locator('main')).toContainText('This moves it out of health into finances.');
    await expect(f.page.locator('main')).toContainText('Dan will no longer be able to see it');
    await f.page.click('button:has-text("Move it to Financial")');
    await f.page.waitForURL(/\?moved=1/);
    await expect(f.page.locator('main')).toContainText('written in the family');
    await expect(f.page.locator('main')).toContainText('Financial');
  });

  test('share / unshare: one document to the caregiver — her context sees IT and not a task derived from it; unshare is one action and her next look loses it (DOC-04, AC-DOC-5, AC-PERM-10)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const marisol = await theMember(browser, 'marisol');
    const docId = await fixtureDocument(f, `Discharge instruction · ${stamp}`);
    // a task DERIVED from it — §7.6: the share must not propagate here
    const taskId = randomUUID();
    await fixtureInsert(
      `insert into public.tasks (id, circle_id, subject_id, title, status, approved_by, approved_at,
         approver_display_name, taint)
       values ($1, $2, $3, 'Follow the instruction', 'open', $4, now(), 'Docs Founder', '{health}')`,
      [taskId, f.circleId, f.nell, f.accountId],
    );
    await fixtureInsert(
      `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
       values ($1, 'task', $2, 'document', $3)`,
      [f.circleId, taskId, docId],
    );

    // BEFORE: from HER live context, the document is the one 404.
    const before = await marisol.page.request.get(`/${f.circleId}/documents/${docId}`);
    expect(before.status()).toBe(404);

    // The share, through the real screens: pick her, confirm it's you
    // (the §5.7 step-up), share.
    await f.page.goto(`/${f.circleId}/documents/${docId}`);
    await f.page.check(`input[name="share"][value="${marisol.memberId}"]`);
    await f.page.click('button:has-text("Share this document")');
    await f.page.waitForURL(new RegExp(`\\?share=${marisol.memberId}`));
    await f.page.fill('input[name="password"]', PASSWORD);
    await f.page.click('button:has-text("Confirm it")');
    // The step-up 303 lands on the SAME ?share= URL with the cookie now
    // live — a URL wait here would match the stale page (the leg-33 trap),
    // so the wait is for the confirm control itself.
    await expect(f.page.locator('button:has-text("Share it with Marisol")')).toBeVisible();
    await expect(f.page.locator('main')).toContainText('one document, one person');
    await f.page.click('button:has-text("Share it with Marisol")');
    await f.page.waitForURL(/\?shared=1/);

    // HER next look: the document, and ONLY the document.
    await marisol.page.goto(`/${f.circleId}/documents/${docId}`);
    await expect(marisol.page.locator('main')).toContainText(`Discharge instruction · ${stamp}`);
    // R2/F-7: the share reaches the ROW, not the arrival's bytes. These are
    // DOC-02's summary negatives, drawn again for a SHARE-HOLDER — the case a
    // summary member by grant cannot stand in for, because rung 5 lifts only
    // the share-holder. Without them the leg passes with the viewer open.
    expect(await marisol.page.locator('section[aria-labelledby="the-document"]').count()).toBe(0);
    expect(await marisol.page.locator('main img').count()).toBe(0);
    const derived = await marisol.page.request.get(`/${f.circleId}/tasks/${taskId}`);
    expect(derived.status()).toBe(404);

    // Unshare: ONE action, and her next look loses it.
    await f.page.goto(`/${f.circleId}/documents/${docId}`);
    await f.page.click('button:has-text("Unshare")');
    await f.page.waitForURL(/\?unshared=1/);
    const after = await marisol.page.request.get(`/${f.circleId}/documents/${docId}`);
    expect(after.status()).toBe(404);
  });

  test('A11Y-11: the viewer at 390px — axe clean, alt text on every page, the machine-read sibling reachable by keyboard as native text is', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const d = await theDocument(browser);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await context.addCookies(await f.context.cookies());
    try {
      await page.goto(`/${f.circleId}/documents/${d.documentId}`);
      await expect(page.locator('section[aria-labelledby="the-document"] img').first()).toBeVisible();
      // every page image carries its alt
      const imgs = page.locator('section[aria-labelledby="the-document"] img');
      for (let i = 0; i < (await imgs.count()); i++) {
        expect(((await imgs.nth(i).getAttribute('alt')) ?? '').length).toBeGreaterThan(0);
      }
      // the sibling by KEYBOARD: focus the toggle, Enter expands it
      const toggle = page.locator('button.review-machine-text-toggle').first();
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      // no horizontal scroll at 390px
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      expect(await axeViolations(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
