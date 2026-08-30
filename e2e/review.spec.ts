import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

// ============================================================================
// 6B · The REVIEW legs (slice-6 plan, local gate; PRD §4.2.3–§4.2.5, §6.4;
// AC-INBOX-2/3/4/8; A11Y-07/A11Y-08; CIT-01, CNF-02, DEC-01, RCP-01, OCR-01
// live halves) — browser truth over the LIVE stack, clamd, and the Anthropic
// fixture server. CI never runs browsers; this is the local gate's surface
// for the slice's centre.
//
//   · review — `Needs you` → open → the source renders → select a fact →
//     its region highlights → the crop is on screen → approve items → the
//     receipt names every destination, LINKS the one whose surface exists,
//     and says plainly where one does not;
//   · reject-all — `Nothing filed`, the original intact and re-readable;
//   · conflict — §4.2.5's three outcomes offered with NO default; use_new
//     SUPERSEDES with the old value retained;
//   · stale — the version bumps under an open screen; the approval refuses
//     and RE-RENDERS with what changed highlighted, never a bare error;
//   · below-cliff — the summary-×5 member sees the row, the state, and ONE
//     line: no source, no facts, no controls (AC-INBOX-8);
//   · A11Y-07 — full keyboard operation at 390 px AND desktop;
//   · A11Y-08 — machine-read text, labelled with §6.9's exact words, page
//     and citation navigation over it as over native text.
//
// D8's conditions hold file-wide: NO serial blocks, the founder is a
// MEMOIZED provision any leg can trigger alone, every leg is runnable BY
// TITLE, and afterAll closes what this spec opened. Never real family data.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
const WORKER_KEY = 'local-gate-worker-key-0123456789abcdef0123456789abcdef';

const stamp = Date.now();
const FOUNDER_EMAIL = `review.founder.${stamp}@example.com`;
const FAMILY_EMAIL = `review.family.${stamp}@example.com`;
const PASSWORD = 'a quiet river crossing 7';

const CORPUS = path.join(process.cwd(), 'fixtures', 'g9', 'development');
function fixture(name: string): Buffer {
  return readFileSync(path.join(CORPUS, name));
}

/** Trailing bytes give each upload its own content sha WITHOUT changing what
 *  the document says — identical bytes would be a stage-1 duplicate. */
function unique(bytes: Buffer, tag: string): Buffer {
  return Buffer.concat([bytes, Buffer.from(`\n% hc-review ${tag} ${stamp}\n`, 'latin1')]);
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

/** A fixture write that must step around §4.9's deferred claim trigger —
 *  the standing gate-fixture concession (extraction.spec's own comment
 *  carries the full argument), never a product path. */
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
  subjectId: string;
  accountId: string;
};

let founderMemo: Promise<Founder> | null = null;

function theFounder(browser: Browser): Promise<Founder> {
  founderMemo ??= provisionFounder(browser);
  return founderMemo;
}

async function provisionFounder(browser: Browser): Promise<Founder> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/create-account');
  await page.fill('input[name="name"]', 'Review Founder');
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

  const subject = await query('select id from public.subjects where circle_id = $1', [circleId]);
  const subjectId = subject.rows[0].id as string;
  expect(subjectId).toBeTruthy();

  // Verify by the real mail click — the message asserted to be THIS
  // founder's before its link is used, the click asserted to have verified
  // THIS account (the run-3 lesson, file-wide).
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${FOUNDER_EMAIL}`)}`,
  ).then((r) => r.json());
  const picked = (
    search.messages as Array<{ ID: string; To?: Array<{ Address?: string }> }>
  ).find((m) => (m.To ?? []).some((t) => t.Address === FOUNDER_EMAIL));
  if (!picked) {
    throw new Error(`Mailpit search for ${FOUNDER_EMAIL} found no message addressed to it`);
  }
  const message = await fetch(`${MAILPIT}/api/v1/message/${picked.ID}`).then((r) => r.json());
  const link = String(message.Text ?? message.HTML).match(
    /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
  const verified = await query(
    'select id, email_verified_at from public.accounts where email = $1',
    [FOUNDER_EMAIL],
  );
  if (!verified.rows[0]?.email_verified_at) {
    throw new Error('the verification click did not verify THIS founder — refused at the cause');
  }

  return { context, page, circleId, subjectId, accountId: verified.rows[0].id as string };
}

/** Drive the workers until the arrival reaches one of `wanted`. */
async function driveTo(
  f: Founder,
  arrivalId: string,
  wanted: string[],
  timeoutMs = 120_000,
): Promise<string> {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    for (const stage of ['store', 'scan', 'gate', 'extract', 'interpret']) {
      await f.page.request.post(`/api/worker/${stage}`, {
        headers: { 'x-worker-key': WORKER_KEY },
      });
    }
    const r = await query('select state::text as s from public.arrivals where id = $1', [arrivalId]);
    last = r.rows[0]?.s ?? '(missing)';
    if (wanted.includes(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`driveTo(${arrivalId}): wanted ${wanted.join('|')}, still ${last}`);
}

async function uploadFixture(
  f: Founder,
  bytes: Buffer,
  filename: string,
  mime: string,
): Promise<string> {
  const before = await query(
    `select coalesce(max(received_at), now() - interval '1 day') as t
       from public.arrivals where circle_id = $1`,
    [f.circleId],
  );
  await f.page.goto(`/${f.circleId}/upload`);
  await f.page.setInputFiles('input[type="file"]', {
    name: filename,
    mimeType: mime,
    buffer: bytes,
  });
  await f.page.click('button:has-text("Upload")');
  await expect(f.page.locator('[role="status"]')).toContainText('is in', { timeout: 60_000 });
  const arrival = await query(
    `select id from public.arrivals
      where circle_id = $1 and channel = 'upload' and received_at > $2
      order by received_at desc limit 1`,
    [f.circleId, before.rows[0].t],
  );
  expect(arrival.rows[0]?.id).toBeTruthy();
  return arrival.rows[0].id as string;
}

/** A fresh arrival driven to `proposals_ready` — each leg provisions its
 *  own, so every leg runs alone. */
async function readyArrival(f: Founder, tag: string): Promise<string> {
  const arrival = await uploadFixture(
    f,
    unique(fixture('dev-discharge-01.pdf'), tag),
    `review-${tag}-${stamp}.pdf`,
    'application/pdf',
  );
  expect(await driveTo(f, arrival, ['proposals_ready'])).toBe('proposals_ready');
  return arrival;
}

/** A pending TASK proposal, fixtured onto an arrival so the receipt has a
 *  destination whose surface EXISTS to link (Tasks is live; the pipeline's
 *  own drafts for this fixture are facts + a document). The APPROVAL runs
 *  through the real screen and the real definer — only the drafting is the
 *  concession. */
async function fixtureTaskProposal(f: Founder, arrivalId: string, title: string): Promise<string> {
  const r = await query('select gen_random_uuid() as id');
  const id = r.rows[0].id as string;
  await query(
    `insert into public.proposals
       (id, arrival_id, circle_id, subject_id, kind, version, payload, taint, taint_resolved, status)
     values ($1, $2, $3, $4, 'task', 1, $5::jsonb, '{schedule}', true, 'pending')`,
    [id, arrivalId, f.circleId, f.subjectId, JSON.stringify({ title })],
  );
  return id;
}

test.describe('the 6B review legs', () => {
  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
  });

  test('review: source → fact → region → crop → approve → the receipt (CIT-01, RCP-01 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await readyArrival(f, 'review');
    const taskId = await fixtureTaskProposal(f, arrival, 'Call Riverbend about the follow-up');

    // `Needs you` is the actionable label on the inbox row.
    await f.page.goto(`/${f.circleId}/inbox`);
    await expect(f.page.locator('body')).toContainText('Needs you');

    // Open the review screen: the source renders through the artifact fence.
    await f.page.goto(`/${f.circleId}/inbox/${arrival}`);
    const page1 = await f.page.request.get(`/api/artifact/${arrival}?page=1`);
    expect(page1.status()).toBe(200);
    await expect(f.page.locator('.review-source img').first()).toBeVisible();

    // Select a fact → its cited region highlights IN PLACE (AC-INBOX-2).
    await f.page.locator('button.review-fact').first().click();
    await expect(f.page.locator('.review-region-highlight')).toBeVisible();

    // §6.4: the approve control is INACTIVE until the crop is on screen.
    const taskCard = f.page.locator(`[data-proposal="${taskId}"]`);
    await expect(taskCard.locator('button[value="approve"]')).toBeDisabled();
    await taskCard.locator('button.review-show-evidence').click();
    await expect(taskCard.locator('.review-crop img')).toBeVisible();
    await expect(taskCard.locator('button[value="approve"]')).toBeEnabled();

    // Approve the task through the real route and the real definer.
    await taskCard.locator('button[value="approve"]').click();
    await f.page.waitForURL('**?decided=1');
    await expect(f.page.locator('body')).toContainText('Your decision was recorded');

    // The receipt names the destination and the link RESOLVES — 7B B4: to
    // THE TASK ITSELF, not the section, and the task is ON the page it lands
    // on (the plan's B4 row: "not only that the page is 200").
    const receipt = f.page.locator('.review-receipt');
    await expect(receipt).toContainText('Call Riverbend about the follow-up');
    // The written record is real: the task exists, claimed by its commit.
    const task = await query(
      `select t.id, t.title from public.tasks t
        join public.proposal_commits c on c.object_id = t.id and c.object_type = 'task'
        where c.proposal_id = $1`,
      [taskId],
    );
    expect(task.rows[0]?.title).toBe('Call Riverbend about the follow-up');
    const taskLink = receipt.locator(`a[href="/${f.circleId}/tasks/${task.rows[0].id}"]`);
    await expect(taskLink).toBeVisible();
    const resolved = await f.page.request.get(`/${f.circleId}/tasks/${task.rows[0].id}`);
    expect(resolved.status()).toBe(200);
    expect(await resolved.text()).toContain('Call Riverbend about the follow-up');

    // The OTHER receipt shape — a destination whose surface does NOT exist
    // is NAMED and said plainly, never linked (RCP-02 stays pending; the
    // per-shape rendering is unit-pinned in tests/routes/arrival.test.ts).
    expect(await f.page.locator(`.review-receipt a[href="/${f.circleId}/documents"]`).count()).toBe(
      0,
    );
  });

  test('reject-all: `Nothing filed`, the original intact and re-readable (AC-INBOX-4, DEC-01 live)', async ({
    browser,
  }) => {
    // THE ONLY LEG IN THIS SUITE WHOSE COST SCALES WITH THE FIXTURE. It taps
    // through EVERY pending proposal the real pipeline produced, and each tap
    // is two full dev-mode page loads: the `goto` at the top of the loop and
    // the redirect the click produces. Observed at 1.3 m (r3), 1.2 m (r6) and
    // 1.4 m (r7) against Playwright's 120 s default — 60-70% of its budget on
    // every run that ever passed, which is not a margin, it is a coin toss.
    // At `r8` it lost: 2.1 m, and the trace shows why it was not the product —
    // FIFTEEN `_next/static/chunks/*` requests at status -1, the page's own
    // JavaScript never arriving, so `load` never fired and `waitForURL` timed
    // out. The artifact route answered 200 twice in the same trace (4.4 s,
    // 2.8 s) and F6's answer budget did not fire once in the entire run.
    //
    // The budget is declared HERE, on the one leg that needs it, rather than
    // raised globally: every other leg in the gate should still fail fast.
    // (And the `goto` at the top of the loop is NOT redundant — it clears the
    // `?decided=1` the previous iteration landed on. Without it the next
    // `waitForURL('**?decided=1')` matches the STALE url and returns
    // immediately, and the leg stops waiting for the navigation it exists to
    // check.)
    // 7B close-out: the same arithmetic, worse host. The fixture's pipeline
    // drafts ~12 proposals; at the ~18 s per tap the memory-bounded host now
    // delivers (two dev-mode loads each, the DB probe showing 12 pending on
    // every reject arrival), the loop alone is ~220 s — the 240 s budget the
    // 6B close-out set was 100% consumed twice at 18fbdba (245 s in gate run
    // 3; 245 s alone in a targeted run at 396c44f, the product asserting
    // nothing wrong either time). A timeout constant is the tier rule's own
    // Tier-3 example; raised to the same margin the 6B raise bought.
    test.setTimeout(420_000);

    const f = await theFounder(browser);
    const arrival = await readyArrival(f, 'rejectall');

    // Reject every pending item through the surface, one honest tap each.
    for (;;) {
      await f.page.goto(`/${f.circleId}/inbox/${arrival}`);
      const rejects = f.page.locator('button[value="reject"]');
      if ((await rejects.count()) === 0) break;
      await f.page
        .locator('select[name="reject_reason"]')
        .first()
        .selectOption('already_handled');
      await rejects.first().click();
      await f.page.waitForURL('**?decided=1');
    }

    // The terminal label is honest on the inbox…
    const state = await query('select state::text as s from public.arrivals where id = $1', [
      arrival,
    ]);
    expect(state.rows[0].s).toBe('nothing_filed');
    await f.page.goto(`/${f.circleId}/inbox/${arrival}`);
    // …the receipt says the AC-INBOX-4 sentence…
    await expect(f.page.locator('.review-receipt')).toContainText(/nothing was filed/i);
    await expect(f.page.locator('.review-receipt')).toContainText(/already handled/i);
    // …and the ORIGINAL is intact and re-readable.
    const original = await f.page.request.get(`/api/artifact/${arrival}`);
    expect(original.status()).toBe(200);
    // Nothing was written to the record.
    const written = await query(
      `select count(*)::int as n from public.proposal_commits c
        join public.proposals p on p.id = c.proposal_id
        where p.arrival_id = $1`,
      [arrival],
    );
    expect(written.rows[0].n).toBe(0);
  });

  test('conflict: three outcomes, no default; use_new SUPERSEDES with the old value retained (CNF-02 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await readyArrival(f, 'conflict');

    // The PARENT fact the record already holds — a fixture (the §4.9
    // concession), because the surface that files facts is this same slice;
    // the RESOLUTION below runs through the real screen and definer.
    const ids = await query('select gen_random_uuid() as fact, gen_random_uuid() as prop');
    const factId = ids.rows[0].fact as string;
    const propId = ids.rows[0].prop as string;
    await fixtureInsert(
      `insert into public.profile_facts
         (id, circle_id, subject_id, field, value, risk_class, domain,
          approved_by, approved_at, approver_display_name, taint)
       values ($1, $2, $3, 'medication_dose', '"500 mg"'::jsonb, 'high', 'health',
               $4, now(), 'Review Founder', array['health']::hc.domain[])`,
      [factId, f.circleId, f.subjectId, f.accountId],
    );
    await query(
      `insert into public.proposals
         (id, arrival_id, circle_id, subject_id, kind, version, payload, taint, taint_resolved, status)
       values ($1, $2, $3, $4, 'conflict', 1, $5::jsonb, array['health']::hc.domain[], true, 'pending')`,
      [
        propId,
        arrival,
        f.circleId,
        f.subjectId,
        JSON.stringify({
          field: 'medication_dose',
          value: '850 mg',
          risk_class: 'high',
          domain: 'health',
          parents: [{ type: 'profile_fact', id: factId }],
          task: { title: 'Reconcile the dose with the pharmacy' },
        }),
      ],
    );

    await f.page.goto(`/${f.circleId}/inbox/${arrival}`);
    const card = f.page.locator(`[data-proposal="${propId}"]`);

    // §4.2.5: the three outcomes are a CHOICE — offered, none pre-selected.
    for (const outcome of ['keep', 'use_new', 'keep_both']) {
      const radio = card.locator(`input[name="conflict_outcome"][value="${outcome}"]`);
      await expect(radio).toBeVisible();
      await expect(radio).not.toBeChecked();
    }

    // Choose use_new; §6.4's rule holds here too — evidence, then approve.
    await card.locator('input[name="conflict_outcome"][value="use_new"]').check();
    await card.locator('button.review-show-evidence').click();
    await expect(card.locator('.review-crop img')).toBeVisible();
    await card.locator('button[value="approve"]').click();
    await f.page.waitForURL('**?decided=1');

    // The SUPERSESSION is real and the old value is RETAINED (§2.5).
    const facts = await query(
      `select value, superseded_at is not null as superseded, superseded_by_id
         from public.profile_facts
        where subject_id = $1 and field = 'medication_dose'
        order by approved_at`,
      [f.subjectId],
    );
    expect(facts.rows.length).toBe(2);
    expect(facts.rows[0]).toMatchObject({ value: '500 mg', superseded: true });
    expect(facts.rows[0].superseded_by_id).toBeTruthy();
    expect(facts.rows[1]).toMatchObject({ value: '850 mg', superseded: false });
  });

  test('stale: the version moves under an open screen → refused, re-rendered with the change highlighted (REV-02 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await readyArrival(f, 'stale');
    await f.page.goto(`/${f.circleId}/inbox/${arrival}`);

    const firstCard = f.page.locator('.review-proposal').first();
    const proposalId = await firstCard
      .locator('input[name="proposal_id"]')
      .inputValue();

    // Arm the control while the screen is open…
    await firstCard.locator('button.review-show-evidence').click();
    await expect(firstCard.locator('.review-crop img')).toBeVisible();

    // …then the proposal moves underneath it. (A concurrent re-draft's
    // version bump, applied directly: the CONTESTED write path is pgTAP
    // 061/054's and the concurrency suite's; this leg is about what the
    // person SEES afterwards.)
    await query('update public.proposals set version = version + 1 where id = $1', [proposalId]);

    await firstCard.locator('button[value="approve"]').click();
    await f.page.waitForURL(`**?refused=version&proposal=${proposalId}`);

    // Not a bare error: the SAME screen, current state, the change said
    // in place on the item it refused.
    await expect(f.page.locator(`[data-proposal="${proposalId}"]`)).toContainText(
      /changed since you looked/i,
    );
    const decided = await query('select status from public.proposals where id = $1', [proposalId]);
    expect(decided.rows[0].status).toBe('pending'); // nothing landed
  });

  test('below-cliff: the summary-×5 member sees the row, the state, and ONE line (AC-INBOX-8 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await readyArrival(f, 'cliff');

    // Invite at family tier, then set the grants to EXACTLY summary×5 —
    // the AC-INBOX-8 member: the arrival row is theirs to see, its
    // contents are not.
    await f.page.goto(`/${f.circleId}/invite`);
    await f.page.fill('input[name="invited_email"]', FAMILY_EMAIL);
    await f.page.check('input[name="tier"][value="family"]');
    await f.page.locator('input[name="subject_ids"]').first().check();
    await f.page.click('button[type="submit"]');
    await f.page.waitForURL('**/invite/created');
    const acceptUrl = (await f.page.locator('.mono-address').textContent())!.trim();

    const familyContext = await browser.newContext();
    try {
      const familyPage = await familyContext.newPage();
      await familyPage.goto(acceptUrl.replace(/^https?:\/\/[^/]+/, ''));
      await familyPage.click('a[href*="/create-account?invite="]');
      await familyPage.fill('input[name="name"]', 'Summary Member');
      await familyPage.fill('input[name="password"]', PASSWORD);
      await familyPage.click('button[type="submit"]');
      await familyPage.waitForURL('**/accept/**');
      await familyPage.click('button[type="submit"]');
      await familyPage.waitForURL(`**/${f.circleId}/timeline`);

      const member = await query(
        `select m.id from public.circle_members m
          join public.accounts a on a.id = m.account_id
         where m.circle_id = $1 and a.email = $2`,
        [f.circleId, FAMILY_EMAIL],
      );
      const memberId = member.rows[0].id as string;
      await query('delete from public.access_grants where member_id = $1', [memberId]);
      await query(
        `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
         select $1, $2, $3, d, 'summary'::hc.access_level, $4
           from unnest(array['memories','health','schedule','documents','finances']::hc.domain[]) d`,
        [f.circleId, memberId, f.subjectId, f.accountId],
      );

      // The row and the state — what summary already grants…
      await familyPage.goto(`/${f.circleId}/inbox/${arrival}`);
      const main = (await familyPage.textContent('main')) ?? '';
      expect(main).toContain('fuller access');
      // …and nothing else: no source region, no facts, no review controls.
      expect(main).not.toContain('What we read');
      expect(main).not.toContain('What we propose');
      expect(await familyPage.locator('.review-grid').count()).toBe(0);
      expect(await familyPage.locator('button.review-fact').count()).toBe(0);
      expect(await familyPage.locator('.review-proposal').count()).toBe(0);
      expect(await familyPage.locator(`a[href="/api/artifact/${arrival}"]`).count()).toBe(0);
      const artifact = await familyPage.request.get(`/api/artifact/${arrival}`);
      expect(artifact.status()).toBe(404);
    } finally {
      await familyContext.close();
    }
  });

  test('A11Y-07: full keyboard operation — Tab between facts, Enter selects and MOVES FOCUS, at 390px and desktop', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await readyArrival(f, 'a11y07');

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      const context = await browser.newContext({
        viewport,
        storageState: await f.context.storageState(),
      });
      try {
        const page = await context.newPage();
        await page.goto(`/${f.circleId}/inbox/${arrival}`);
        await expect(page.locator('button.review-fact').first()).toBeVisible();

        // Tab reaches the FIRST fact (facts are buttons — natively in the
        // tab order), and again reaches the SECOND: Tab BETWEEN facts.
        await page.locator('button.review-fact').first().focus();
        const first = await page.evaluate(
          () => (document.activeElement as HTMLElement)?.className ?? '',
        );
        expect(first).toContain('review-fact');
        // 7B B4 (OW-06; ADR-0027 D17 item 6, D13): the guard that read
        // `if (factCount > 1)` silently skipped this leg's headline claim on
        // a thin fixture. It is an ASSERTION now — a fixture with one fact
        // goes RED here, in the leg's own words, instead of passing while
        // checking less than its title says.
        const factCount = await page.locator('button.review-fact').count();
        expect(factCount, 'A11Y-07 needs at least two facts to Tab BETWEEN').toBeGreaterThan(1);
        await page.keyboard.press('Tab');
        const second = await page.evaluate(() => ({
          className: (document.activeElement as HTMLElement)?.className ?? '',
          text: (document.activeElement as HTMLElement)?.textContent ?? '',
        }));
        expect(second.className).toContain('review-fact');

        // Enter SELECTS and moves focus to the cited region (the letter of
        // A11Y-07): the active element after Enter is the region highlight,
        // which is itself operable.
        await page.locator('button.review-fact').first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.review-region-highlight')).toBeVisible();
        const focused = await page.evaluate(
          () => (document.activeElement as HTMLElement)?.className ?? '',
        );
        expect(focused).toContain('review-region-highlight');

        // And the region returns to the fact — both directions keyboardable.
        await page.keyboard.press('Enter');
        const back = await page.evaluate(
          () => (document.activeElement as HTMLElement)?.className ?? '',
        );
        expect(back).toContain('review-fact');
      } finally {
        await context.close();
      }
    }
  });

  /**
   * §6.9's label, character for character, from PRD §4.2 (docs/PRD.md:1391)
   * and TSD §6.9 (docs/TSD.md:2177, :2501) — all three say the same string.
   * Stated HERE rather than imported from the component: a test that reads its
   * expectation out of the code under test pins nothing.
   */
  const MACHINE_READ_LABEL = 'machine-read — may contain errors';

  test('A11Y-08: machine-read text — §6.9’s exact label, per page, readable where native text is not (OCR-01 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);

    // A REAL image-only source with REAL glyphs: drawn here, uploaded as a
    // photo. Never real family data — the same synthetic posture as the
    // corpus, but with painted text so the engine has something to read.
    const canvas = createCanvas(1240, 900);
    const cx = canvas.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, 1240, 900);
    cx.fillStyle = '#111111';
    cx.font = '52px sans-serif';
    cx.fillText('Pharmacy note for Nell.', 90, 180);
    cx.fillText('Amoxicillin 500 mg twice daily.', 90, 300);
    cx.fillText('Call the front desk with questions.', 90, 420);
    const png = Buffer.from(await canvas.encode('png'));

    const arrival = await uploadFixture(f, png, `ocr-${stamp}.png`, 'image/png');
    expect(await driveTo(f, arrival, ['proposals_ready'])).toBe('proposals_ready');

    // The sibling exists in storage under the reserved stem…
    const sibling = await query(
      `select count(*)::int as n from storage.objects
        where bucket_id = 'artifacts' and name = $1`,
      [`render/circle/${f.circleId}/arrival/${arrival}/p001.txt`],
    );
    expect(sibling.rows[0].n).toBe(1);

    // …the screen offers it under §6.9's exact label, one control per page…
    await f.page.goto(`/${f.circleId}/inbox/${arrival}`);
    const toggles = f.page.locator('button.review-machine-text-toggle');
    const pages = await f.page.locator('.review-page').count();
    expect(await toggles.count()).toBe(pages);
    // ROUND-18 F-5: this used to read toContainText('may contain errors') — a
    // substring of the WARNING CLAUSE ONLY, which never checked "machine-read"
    // at all. A regression renaming the control to "AI transcript — may contain
    // errors" kept this leg green while breaking the one thing its title says
    // it exists to protect. The exact string, from the spec, is the assertion.
    await expect(toggles.first()).toHaveText(MACHINE_READ_LABEL);

    // …and opening it reads the words the page actually carries — the
    // machine-read text navigable exactly where the native text would be.
    await toggles.first().click();
    await expect(f.page.locator('.review-machine-text')).toContainText(/amoxicillin/i, {
      timeout: 15_000,
    });
    await expect(f.page.locator('.review-machine-text')).toContainText(/500\s*mg/i);
  });
});
