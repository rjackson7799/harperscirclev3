import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7B · THE RECORD LEGS (slice-7 plan B4; PRD §4.4, §4.5; TSK-01..04, TLN-01..03,
// SHR-02's app half; AC-TASK-1/4/5/6/7, AC-TL-2/3/4) — browser truth over the
// LIVE stack, from each person's OWN context. CI never runs browsers; this is
// the local gate's surface for the record increment.
//
//   · tasks — assign in two taps; the sibling's source RESOLVES; counts over
//     the rendered tree; a caregiver's first open never blank;
//   · cross-taint — not offered where she cannot see the subject; the
//     sentence and EXACTLY two paths where she can; path 1 readable and the
//     original invisible FROM HER LIVE CONTEXT;
//   · complete / snooze with the count;
//   · unassign withdraws the share, checked from her context (path 2 behind
//     the §5.7 step-up, then the withdrawal);
//   · timeline — two subjects, the switch, the combined view labelled, a
//     manual event with its provenance, the creation entry first.
//
// D8's conditions hold file-wide: NO serial blocks; the founder and each
// member are MEMOIZED provisions any leg can trigger alone; every leg is
// runnable BY TITLE; afterAll closes what this spec opened. Fixture writes
// under replica role are the gate's standing concession (tasks and arrivals
// whose drafting is the pipeline's, not this increment's) — every ACT goes
// through the real screens and the real definers. Never real family data.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
const stamp = Date.now();
const FOUNDER_EMAIL = `record.founder.${stamp}@example.com`;
const PASSWORD = 'a quiet river crossing 7';
const MEMBERS = {
  dan: { email: `record.dan.${stamp}@example.com`, name: 'Dan', tier: 'family', subjects: ['Nell', 'Marcus'] },
  marisol: { email: `record.marisol.${stamp}@example.com`, name: 'Marisol', tier: 'care_circle', subjects: ['Nell'] },
  omar: { email: `record.omar.${stamp}@example.com`, name: 'Omar', tier: 'family', subjects: ['Marcus'] },
} as const;
type MemberKey = keyof typeof MEMBERS;

async function query(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

/** A fixture write that steps around §4.9's deferred claim trigger — the
 *  standing gate-fixture concession, never a product path. */
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
  marcus: string;
  arrival: string;
  document: string;
};

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
  await page.fill('input[name="name"]', 'Record Founder');
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
  await page.fill('input[name="subject_name_2"]', 'Marcus');
  await page.check('input[name="situation_2"][value="In a nursing facility"]');
  await page.fill('input[name="zip_2"]', '60614');
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
  const accountId = verified.rows[0].id as string;
  const subjects = await query('select id, first_name from public.subjects where circle_id = $1', [circleId]);
  const nell = subjects.rows.find((r) => r.first_name === 'Nell').id as string;
  const marcus = subjects.rows.find((r) => r.first_name === 'Marcus').id as string;

  // The fixture concession: one filed upload for Nell and the document filed
  // from it. Every task the legs act on cites this arrival, so "the source
  // resolves" lands on a real page (the review screen's row-and-state view).
  const arrival = randomUUID();
  const document = randomUUID();
  await fixtureInsert(
    `insert into public.arrivals (id, circle_id, subject_id, channel, state, scan_verdict)
     values ($1, $2, $3, 'upload', 'filed', 'clean')`,
    [arrival, circleId, nell],
  );
  await fixtureInsert(
    `insert into public.documents (id, circle_id, subject_id, title, category, artifact_arrival_id,
       filed_at, approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, 'Discharge summary · Jul 12', 'medical', $4, now(), $5, now(), 'Record Founder', '{health}')`,
    [document, circleId, nell, arrival, accountId],
  );
  return { context, page, circleId, accountId, nell, marcus, arrival, document };
}

/** A task, fixtured onto the founder's arrival; tainted tasks carry the
 *  provenance edge to the discharge summary (what path 2 can name). */
async function fixtureTask(
  f: Founder,
  title: string,
  taint: string[],
  opts: { dueOn?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await fixtureInsert(
    `insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone, status, source_arrival_id,
       approved_by, approved_at, approver_display_name, taint)
     values ($1, $2, $3, $4, $5, $6, 'open', $7, $8, now(), 'Record Founder', $9::hc.domain[])`,
    [id, f.circleId, f.nell, title, opts.dueOn ?? null, opts.dueOn ? 'America/New_York' : null, f.arrival, f.accountId, taint],
  );
  if (taint.includes('health')) {
    await fixtureInsert(
      `insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
       values ($1, 'task', $2, 'document', $3)`,
      [f.circleId, id, f.document],
    );
  }
  return id;
}

type Member = { context: BrowserContext; page: Page; memberId: string };
const memberMemo: Partial<Record<MemberKey, Promise<Member>>> = {};
function theMember(browser: Browser, key: MemberKey): Promise<Member> {
  memberMemo[key] ??= provisionMember(browser, key);
  return memberMemo[key]!;
}

/** Invite through the real screen for the named subjects, accept in a fresh
 *  context, and — for Dan — raise the family default to summary ×5 so the
 *  arrival behind his task is his to open (the below-cliff leg's concession). */
async function provisionMember(browser: Browser, key: MemberKey): Promise<Member> {
  const f = await theFounder(browser);
  const m = MEMBERS[key];
  await f.page.goto(`/${f.circleId}/invite`);
  await f.page.fill('input[name="invited_email"]', m.email);
  await f.page.check(`input[name="tier"][value="${m.tier}"]`);
  const boxes = f.page.locator('input[name="subject_ids"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    const label = ((await box.locator('xpath=..').textContent()) ?? '').trim();
    if ((m.subjects as readonly string[]).some((s) => label.includes(s))) await box.check();
    else if (await box.isChecked()) await box.uncheck();
  }
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
    await query('delete from public.access_grants where member_id = $1 and subject_id = $2', [memberId, f.nell]);
    await query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       select $1, $2, $3, d, 'summary'::hc.access_level, $4
         from unnest(array['memories','health','schedule','documents','finances']::hc.domain[]) d`,
      [f.circleId, memberId, f.nell, f.accountId],
    );
  }
  return { context, page, memberId };
}

/** The open rows rendered in the FIRST list on the Tasks page (the Done
 *  section is its own list). */
function openRows(page: Page) {
  return page.locator('main .choice-list').first().locator('a.row-title');
}

async function chipCount(page: Page, label: string): Promise<number> {
  const chip = page.locator('nav[aria-label="Show"] a.filter-chip', { hasText: label });
  return Number(await chip.locator('.filter-count').textContent());
}

test.describe('the 7B record legs', () => {
  // Each leg may pay for the memoized provisions it is first to need — a
  // founder with two subjects and up to three invited members, every one of
  // them a real create-account → invite → accept flow — plus dev-mode cold
  // compiles of the six new routes. On the 8 GB host that is more than the
  // config's 120 s per leg (the first targeted run: two legs timed out at
  // their final assertions with every product step behind them green). The
  // budget here is per leg and explicit; it is not a retry.
  test.describe.configure({ timeout: 300_000 });

  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
    for (const m of Object.values(memberMemo)) await m?.then((x) => x.context.close()).catch(() => {});
  });

  test('tasks: assign in two taps; the sibling’s source resolves; counts over the rendered tree; a caregiver’s first open never blank (TSK-03, TSK-04, AC-TASK-1/4/5)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const dan = await theMember(browser, 'dan');
    const marisol = await theMember(browser, 'marisol');
    const task = await fixtureTask(f, `Call the pharmacy about the refill ${stamp}`, ['schedule'], { dueOn: '2099-09-04' });

    // The caregiver's first open: never blank — one sentence naming who to
    // expect tasks from, or a task she already holds. Never nothing.
    await marisol.page.goto(`/${f.circleId}/tasks`);
    const marisolMain = (await marisol.page.textContent('main')) ?? '';
    expect(marisolMain).toContain('Your tasks');
    expect(marisolMain.includes('will hand you tasks here') || (await openRows(marisol.page).count()) > 0).toBe(true);

    // The founder's list: every chip's count is the number of rows it renders.
    await f.page.goto(`/${f.circleId}/tasks?subject=${f.nell}`);
    expect(await chipCount(f.page, 'All')).toBe(await openRows(f.page).count());
    expect(await chipCount(f.page, 'Unassigned')).toBeGreaterThanOrEqual(1);
    await f.page.goto(`/${f.circleId}/tasks?filter=unassigned&subject=${f.nell}`);
    expect(await chipCount(f.page, 'Unassigned')).toBe(await openRows(f.page).count());
    // §4.0: every row is subject-labelled, by name.
    await expect(f.page.locator('main .choice-list').first().locator('.subject-label').first()).toContainText('Nell');

    // Two taps: pick Dan, hand it over.
    await f.page.goto(`/${f.circleId}/tasks/${task}`);
    await f.page.check(`input[name="member_id"][value="${dan.memberId}"]`);
    await f.page.click('button:has-text("Hand it over")');
    await f.page.waitForURL('**?assigned=1');
    await expect(f.page.locator('main')).toContainText('Dan');

    // From Dan's LIVE context: his list counts it under Mine, and the source
    // resolves — the link lands on the arrival's page and the page is about
    // that arrival.
    await dan.page.goto(`/${f.circleId}/tasks?filter=mine`);
    expect(await chipCount(dan.page, 'Mine')).toBe(await openRows(dan.page).count());
    expect(await chipCount(dan.page, 'Mine')).toBeGreaterThanOrEqual(1);
    await dan.page.goto(`/${f.circleId}/tasks/${task}`);
    const source = dan.page.locator(`a[href="/${f.circleId}/inbox/${f.arrival}"]`).first();
    await expect(source).toBeVisible();
    const resolved = await dan.page.request.get(`/${f.circleId}/inbox/${f.arrival}`);
    expect(resolved.status()).toBe(200);
    expect(await resolved.text()).toContain('Uploaded document');
  });

  test('cross-taint: not offered where she cannot see the subject; the sentence and exactly two paths where she can; path 1 readable and the original invisible FROM HER LIVE CONTEXT (TSK-01, AC-TASK-6)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const marisol = await theMember(browser, 'marisol');
    const omar = await theMember(browser, 'omar');
    const task = await fixtureTask(f, `Follow the discharge instructions ${stamp}`, ['schedule', 'health']);

    await f.page.goto(`/${f.circleId}/tasks/${task}`);
    // Omar holds nothing on Nell: NOT OFFERED — named with the reason, never a
    // radio. Marisol (schedule summary) is offered.
    expect(await f.page.locator(`input[name="member_id"][value="${omar.memberId}"]`).count()).toBe(0);
    await expect(f.page.locator('main')).toContainText(/Not offered:[^]*Omar/);
    await f.page.check(`input[name="member_id"][value="${marisol.memberId}"]`);
    await f.page.click('button:has-text("Hand it over")');

    // The crossing: the sentence at that moment, and EXACTLY two paths.
    await f.page.waitForURL('**/assign?member=*');
    await expect(f.page.locator('main')).toContainText(/Marisol can.t see this task\. It came from/);
    await expect(f.page.locator('main')).toContainText('Discharge summary');
    expect(await f.page.locator('.record-path').count()).toBe(2);
    // The instruction field is EMPTY — the AI never writes it, and neither
    // does the page.
    expect(await f.page.locator('textarea[name="instruction"]').inputValue()).toBe('');
    // The crossing screen is audited where it is reached (the manifest's claim).
    const axe = await new AxeBuilder({ page: f.page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.section-label')
      .exclude('.micro-meta')
      .analyze();
    expect(axe.violations, axe.violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);

    // Path 1: the assigner's own words.
    const instruction = `Pick up Nell’s new prescription at the Elm St pharmacy, before Friday. ${stamp}`;
    await f.page.fill('textarea[name="instruction"]', instruction);
    await f.page.click('button:has-text("Write it for Marisol")');
    await f.page.waitForURL('**?assigned=1&path=instruction');

    // FROM HER LIVE CONTEXT: the instruction is hers to read; the original
    // is invisible — not in her list, and 404 by URL.
    await marisol.page.goto(`/${f.circleId}/tasks?filter=mine`);
    await expect(openRows(marisol.page).filter({ hasText: instruction })).toHaveCount(1);
    await marisol.page.locator('a.row-title', { hasText: instruction }).click();
    await expect(marisol.page.locator('main')).toContainText(instruction);
    await expect(marisol.page.locator('main')).toContainText(/Written by Record Founder for Marisol/);
    const original = await marisol.page.request.get(`/${f.circleId}/tasks/${task}`);
    expect(original.status()).toBe(404);
    expect(await marisol.page.locator(`a[href="/${f.circleId}/tasks/${task}"]`).count()).toBe(0);
  });

  test('complete / snooze with the count (TSK-02, AC-TASK-2)', async ({ browser }) => {
    const f = await theFounder(browser);
    const task = await fixtureTask(f, `Renew the parking permit ${stamp}`, ['schedule'], { dueOn: '2099-01-10' });

    await f.page.goto(`/${f.circleId}/tasks/${task}`);
    await f.page.fill('input[name="due_on"]', '2099-01-17');
    await f.page.click('button:has-text("Snooze")');
    await f.page.waitForURL('**?snoozed=1');
    await expect(f.page.locator('main')).toContainText('snoozed once');
    await expect(f.page.locator('main')).toContainText('January 17');

    await f.page.click('button:has-text("Mark done")');
    await f.page.waitForURL('**?done=1');
    await expect(f.page.locator('main')).toContainText(/Completed by Record Founder/);
    expect(await f.page.locator('button:has-text("Mark done")').count()).toBe(0);

    // Done is never deleted: it sits apart on the list, with who and when.
    await f.page.goto(`/${f.circleId}/tasks?subject=${f.nell}`);
    await expect(f.page.locator('section[aria-label="Done"]')).toContainText(`Renew the parking permit ${stamp}`);
  });

  test('unassign withdraws the share, checked from her context (SHR-02, AC-TASK-7; path 2 behind the §5.7 step-up)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const marisol = await theMember(browser, 'marisol');
    const task = await fixtureTask(f, `Wound care per the discharge protocol ${stamp}`, ['schedule', 'health']);

    await f.page.goto(`/${f.circleId}/tasks/${task}`);
    await f.page.check(`input[name="member_id"][value="${marisol.memberId}"]`);
    await f.page.click('button:has-text("Hand it over")');
    await f.page.waitForURL('**/assign?member=*');

    // Path 2: the named share, behind the step-up bound to the pair.
    await expect(f.page.locator(`input[name="target_ref"][value="task:${task}+document:${f.document}"]`)).toHaveCount(1);
    await f.page.fill('input[name="password"]', PASSWORD);
    await f.page.click('button:has-text("Confirm and share with Marisol")');
    await f.page.waitForURL('**&path=share&document=*');
    await expect(f.page.locator('main')).toContainText(/Marisol will be able to see: this task, and the Discharge summary/);
    await f.page.click('button:has-text("Share and hand over")');
    await f.page.waitForURL('**?assigned=1&path=share');

    // From HER context: the ORIGINAL is hers now (the share lifts the two
    // named objects), and the database says two live shares.
    const seen = await marisol.page.request.get(`/${f.circleId}/tasks/${task}`);
    expect(seen.status()).toBe(200);
    expect(await seen.text()).toContain(`Wound care per the discharge protocol ${stamp}`);
    const live = await query(
      `select count(*)::int as n from public.object_shares where created_by_assignment_of = $1 and revoked_at is null`,
      [task],
    );
    expect(live.rows[0].n).toBe(2);

    // Take it back: the assignment's shares are withdrawn — from her
    // context the task is gone; the database says zero live.
    await f.page.goto(`/${f.circleId}/tasks/${task}`);
    await f.page.click('button:has-text("Take it back from Marisol")');
    await f.page.waitForURL('**?unassigned=1');
    const gone = await marisol.page.request.get(`/${f.circleId}/tasks/${task}`);
    expect(gone.status()).toBe(404);
    const after = await query(
      `select count(*)::int as n from public.object_shares where created_by_assignment_of = $1 and revoked_at is null`,
      [task],
    );
    expect(after.rows[0].n).toBe(0);
  });

  // 8C U1 · TSK-05's e2e half (AC-TASK-1's claim half, AC-TASK-2). 8A put
  // the claim at `view` and ruled every refusal into ONE string, so the
  // browser truth this leg is for is not "the definer works" — 070 pins
  // that — but that A PERSON AT VIEW CAN TAKE WORK FROM HER OWN SCREEN, and
  // that the screen offers the control nowhere the definer would refuse.
  //
  // Dan is raised to VIEW on Nell's schedule by fixture. That is the file's
  // standing concession (provisionMember already rewrites his grants the
  // same way) and it is what makes him the claimant: the family default is
  // summary, which is a title and not the task.
  test('claim: a view-level member takes an unassigned task from her own screen, and no control is offered where the function would refuse (TSK-05, AC-TASK-1/2)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const dan = await theMember(browser, 'dan');
    const marisol = await theMember(browser, 'marisol');
    await query(
      `update public.access_grants set level = 'view'
        where member_id = $1 and subject_id = $2 and domain = 'schedule'`,
      [dan.memberId, f.nell],
    );
    const mine = await fixtureTask(f, `Collect the dressings ${stamp}`, ['schedule']);
    const held = await fixtureTask(f, `Sit with Nell on Thursday ${stamp}`, ['schedule']);
    await query('update public.tasks set owner_member_id = $1, assigned_by = $2, assigned_at = now() where id = $3', [
      dan.memberId,
      f.accountId,
      held,
    ]);

    // FROM DAN'S OWN CONTEXT. The Unassigned filter carries the control;
    // the task he already holds does not — "hers already" refuses at the
    // database (ADR-0040 D4/Q-B), so the surface must not offer it either.
    await dan.page.goto(`/${f.circleId}/tasks?filter=unassigned&subject=${f.nell}`);
    const claimForm = dan.page.locator(`form[action="/${f.circleId}/tasks/${mine}/claim/submit"]`);
    await expect(claimForm).toBeVisible();
    expect(await dan.page.locator(`form[action="/${f.circleId}/tasks/${held}/claim/submit"]`).count()).toBe(0);

    // The claim itself, through the real route.
    await dan.page.goto(`/${f.circleId}/tasks/${mine}`);
    await dan.page.click('button:has-text("Take this on")');
    await dan.page.waitForURL('**?claimed=1');
    await expect(dan.page.locator('main')).toContainText("It's yours now.");
    // IT BECAME HERS: the holder is Dan, and the control is gone from the
    // very page that offered it a moment ago.
    await expect(dan.page.locator('.record-facts')).toContainText('Dan');
    expect(await dan.page.locator('button:has-text("Take this on")').count()).toBe(0);
    await dan.page.goto(`/${f.circleId}/tasks?filter=mine&subject=${f.nell}`);
    await expect(openRows(dan.page).filter({ hasText: `Collect the dressings ${stamp}` })).toHaveCount(1);

    // NO SHARE AND NO INSTRUCTION — the app half of ADR-0040 D3, read from
    // the database rather than inferred from the screen.
    const spill = await query(
      `select (select count(*) from public.object_shares where object_id = $1) as shares,
              (select count(*) from public.tasks where written_from_task_id = $1) as instructions`,
      [mine],
    );
    expect(Number(spill.rows[0].shares)).toBe(0);
    expect(Number(spill.rows[0].instructions)).toBe(0);

    // THE CAREGIVER IS OFFERED NOTHING. Marisol's ceiling (rung 4) hides an
    // unassigned task from her entirely, so there is no control to press and
    // the hand-built URL is refused by the definer, not by the screen.
    await marisol.page.goto(`/${f.circleId}/tasks?filter=unassigned&subject=${f.nell}`);
    expect(await marisol.page.locator('form[action*="/claim/submit"]').count()).toBe(0);
    const forced = await marisol.page.request.post(`/${f.circleId}/tasks/${held}/claim/submit`);
    expect(forced.url()).toContain('e=claim');
    const owner = await query('select owner_member_id from public.tasks where id = $1', [held]);
    expect(owner.rows[0].owner_member_id).toBe(dan.memberId);

    // THE LOG SAYS WHICH IT WAS. task_claimed exists so the record can tell
    // "handed to you" from "you took it" (ADR-0040 D4); the family's log is
    // where that distinction has to be legible (Q-G).
    await f.page.goto(`/${f.circleId}/people/log`);
    await expect(f.page.locator('.log-entries li', { hasText: 'took an unassigned task' }).first()).toContainText('Dan');
  });

  test('timeline: two subjects, the switch, the combined view labelled, a manual event with its provenance, the creation entry first (TLN-01/02/03, AC-TL-2/4)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);

    // The creation entry is the FIRST row of every thread.
    await f.page.goto(`/${f.circleId}/timeline?subject=${f.nell}`);
    const cards = f.page.locator('main .choice-list .card');
    await expect(cards.first()).toContainText(/Nell.s record was opened/);
    await expect(cards.first()).toContainText('held by Record Founder');
    await expect(f.page.locator('main')).not.toContainText(/Marcus.s record was opened/);

    // The switch.
    await f.page.click(`nav[aria-label="Whose thread"] a[href="/${f.circleId}/timeline?subject=${f.marcus}"]`);
    await f.page.waitForURL(`**?subject=${f.marcus}`);
    await expect(f.page.locator('main .choice-list .card').first()).toContainText(/Marcus.s record was opened/);

    // The combined view is LABELLED, and every row is subject-labelled.
    await f.page.click(`nav[aria-label="Whose thread"] a[href="/${f.circleId}/timeline?subject=all"]`);
    await f.page.waitForURL('**?subject=all');
    await expect(f.page.locator('main')).toContainText('Both threads together');
    await expect(f.page.locator('main')).toContainText('every entry says whose it is');
    const labels = f.page.locator('main .choice-list .card .subject-label');
    expect(await labels.count()).toBe(await f.page.locator('main .choice-list .card').count());

    // `memory` never renders as an empty filter.
    expect(await f.page.locator('nav[aria-label="Kind"] a[href*="kind=memory"]').count()).toBe(0);

    // Add by hand: ONE action, the receipt is the event, provenanced
    // "entered by that person, on that date".
    const line = `Home health nurse started weekly visits ${stamp}`;
    await f.page.selectOption('select[name="subject_id"]', f.nell);
    await f.page.fill('input[name="occurred_on"]', '2026-08-15');
    await f.page.selectOption('select[name="kind"]', 'care');
    await f.page.fill('input[name="summary"]', line);
    await f.page.click('button:has-text("Add to the thread")');
    await f.page.waitForURL('**/timeline/*?added=1');
    await expect(f.page.locator('main')).toContainText('Added to the thread');
    await expect(f.page.locator('main')).toContainText(line);
    await expect(f.page.locator('main')).toContainText(/Entered by Record Founder on/);
    await expect(f.page.locator('main')).toContainText('Saturday, August 15');

    // Back on the thread: after the creation row, in its place, with its line.
    await f.page.goto(`/${f.circleId}/timeline?subject=${f.nell}`);
    const all = f.page.locator('main .choice-list .card');
    await expect(all.first()).toContainText(/Nell.s record was opened/);
    await expect(all.filter({ hasText: line })).toHaveCount(1);
    // §4.4.3: "entered by that person, on that date" — the date of ENTRY
    // (today), while the row's own date is the event's (August 15). The first
    // targeted run asserted August 15 here and the product was right.
    await expect(all.filter({ hasText: line })).toContainText('August 15');
    await expect(all.filter({ hasText: line }).locator('.provenance')).toContainText(/Entered by Record Founder on /);
  });
});
