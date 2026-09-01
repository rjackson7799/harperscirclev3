import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas } from '@napi-rs/canvas';
import pg from 'pg';

// ============================================================================
// 7C · THE PEOPLE & ROLES LEGS (slice-7 plan C6; PRD §4.6, §7.5; PPL-01..05's
// live halves; NAV-01's composition half; AC-PPL-2/3/4/6; AC-PERM-5;
// A11Y-10) — browser truth over the LIVE stack, from each person's OWN
// context.
//
//   · people — subjects as people with the custodian named; the plain line
//     BEFORE any matrix, and no matrix on the list at all;
//   · adjust — a lower posts straight through; a raise goes through the
//     §5.7 step-up; the care ceiling never OFFERS above itself;
//   · nav — a caregiver's nav is Tasks · Account, a family member's is
//     Timeline · Documents · People · Account; hiding is a courtesy and the
//     hand-built adjust URL is refused regardless;
//   · revoke — THE SENSITIVE LEG: an artifact URL fetched BEFORE the
//     revocation, the member removed through the real screen wearing the
//     honest limit in the PRD's words, the SAME URL re-fetched from the
//     REVOKED member's live context → the one 404; her sessions die; the
//     channels this slice does not reach are NAMED on the screen;
//   · the log — rendered, and PRINTED as the same filtered read;
//   · the subject's page — the declaration and the profile facts at view;
//   · A11Y-10 — the plain line first, the matrix keyboard-operable, the
//     printed log readable, at 390 px.
//
// D8's conditions hold file-wide: NO serial blocks; provisions are MEMOIZED;
// every leg runs BY TITLE; afterAll closes what this spec opened. The revoke
// leg owns a DEDICATED member (Petra) so no other leg's cast is removed
// under it. One real pipeline drive gives the pre-revocation URL real bytes.
// Never real family data.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
const WORKER_KEY = 'local-gate-worker-key-0123456789abcdef0123456789abcdef';
const stamp = Date.now();
const FOUNDER_EMAIL = `people.founder.${stamp}@example.com`;
const PASSWORD = 'a quiet river crossing 7';
const MEMBERS = {
  dan: { email: `people.dan.${stamp}@example.com`, name: 'Dan', tier: 'family' },
  marisol: { email: `people.marisol.${stamp}@example.com`, name: 'Marisol', tier: 'care_circle' },
  petra: { email: `people.petra.${stamp}@example.com`, name: 'Petra', tier: 'family' },
} as const;
type MemberKey = keyof typeof MEMBERS;

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

/** Seed `times` denials through hc.log_denied — the ONE denial writer, so
  * the collapse window and the hash chain are the real ones. Called in a
  * single transaction as the authenticated actor: the writer collapses
  * repeats of the same actor/domain/subject inside an hour into ONE row
  * whose collapsed_count is the count the page must print (AC-PPL-7).
  *
  * 7E · R6/F-10: the PPL-04 leg cited AC-PPL-7 and seeded no denial at all. */
async function fixtureDenials(
  circleId: string,
  actorAccountId: string,
  subjectId: string,
  times: number,
) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: actorAccountId, role: 'authenticated' }),
    ]);
    await client.query('set local role authenticated');
    for (let i = 0; i < times; i++) {
      await client.query(`select hc.log_denied($1::uuid, 'finances'::hc.domain, $2::uuid)`, [
        circleId,
        subjectId,
      ]);
    }
    await client.query('commit');
  } finally {
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
  await page.fill('input[name="name"]', 'People Founder');
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

type Member = { context: BrowserContext; page: Page; memberId: string; accountId: string };
const memberMemo: Partial<Record<MemberKey, Promise<Member>>> = {};
function theMember(browser: Browser, key: MemberKey): Promise<Member> {
  memberMemo[key] ??= provisionMember(browser, key);
  return memberMemo[key]!;
}

/** Invite through the real screen, accept in a fresh context. Petra — the
 *  revoke leg's dedicated member — is raised to view×5 by the standing
 *  fixture concession, so the artifact URL is HERS to fetch before the
 *  revocation; the ACT (the revoke) rides the real screen. */
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
    `select m.id, m.account_id from public.circle_members m join public.accounts a on a.id = m.account_id
      where m.circle_id = $1 and a.email = $2`,
    [f.circleId, m.email],
  );
  const memberId = member.rows[0].id as string;
  if (key === 'petra') {
    await query('delete from public.access_grants where member_id = $1 and subject_id = $2', [
      memberId,
      f.nell,
    ]);
    await query(
      `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
       select $1, $2, $3, d, 'view'::hc.access_level, $4
         from unnest(array['memories','health','schedule','documents','finances']::hc.domain[]) d`,
      [f.circleId, memberId, f.nell, f.accountId],
    );
  }
  return { context, page, memberId, accountId: member.rows[0].account_id as string };
}

/** ONE real pipeline drive: the pre-revocation URL must serve real bytes. */
let arrivalMemo: Promise<string> | null = null;
function theArrival(browser: Browser): Promise<string> {
  arrivalMemo ??= provisionArrival(browser);
  return arrivalMemo;
}

async function provisionArrival(browser: Browser): Promise<string> {
  const f = await theFounder(browser);
  const canvas = createCanvas(1240, 900);
  const cx = canvas.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, 1240, 900);
  cx.fillStyle = '#111111';
  cx.font = '52px sans-serif';
  cx.fillText('A note for Nell.', 90, 180);
  const png = Buffer.from(await canvas.encode('png'));
  const before = await query(
    `select coalesce(max(received_at), now() - interval '1 day') as t
       from public.arrivals where circle_id = $1`,
    [f.circleId],
  );
  await f.page.goto(`/${f.circleId}/upload`);
  await f.page.setInputFiles('input[type="file"]', {
    name: `people-${stamp}.png`,
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
  const until = Date.now() + 120_000;
  let last = '';
  while (Date.now() < until) {
    for (const stage of ['store', 'scan', 'gate', 'extract', 'interpret']) {
      await f.page.request.post(`/api/worker/${stage}`, { headers: { 'x-worker-key': WORKER_KEY } });
    }
    const r = await query('select state::text as s from public.arrivals where id = $1', [arrivalId]);
    last = r.rows[0]?.s ?? '(missing)';
    if (last === 'proposals_ready') return arrivalId;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`provisionArrival: wanted proposals_ready, still ${last}`);
}

test.describe('the 7C people legs', () => {
  // Provisioning-heavy by design (the kickoff's rule: budget such specs
  // in-file): a real founder, up to three invited members and one real
  // pipeline drive. Per-leg, explicit, never a retry.
  test.describe.configure({ timeout: 420_000 });

  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
    for (const m of Object.values(memberMemo)) await m?.then((x) => x.context.close()).catch(() => {});
  });

  test('people: subjects as people with custodians named; the plain line before any matrix (PPL-01, AC-PPL-2/3)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    await theMember(browser, 'dan');
    await f.page.goto(`/${f.circleId}/people`);
    // the subject, as a person, custodian named — §7.5's framing, and
    // never the word the product cannot honestly use
    await expect(f.page.locator('main')).toContainText('highest access to their own record');
    await expect(f.page.locator('main')).not.toContainText(/authority/i);
    // 7E · R6/F-4: the WHOLE clause, name tied to the slot. The old
    // assertion was toContainText('custodian') — the label word, which
    // renders beside the `?? 'named at setup'` fallback whether or not a
    // custodian resolved, so AC-PPL-3 (a subject has a NAMED custodian) was
    // unproven while PPL-01 was green.
    await expect(f.page.locator('main')).toContainText(/custodian:\s*People Founder/);
    await expect(f.page.locator('main')).not.toContainText('named at setup');
    // the plain line, per subject, before any matrix — and NO matrix here
    await expect(f.page.locator('main')).toContainText(/Nell: /);
    expect(await f.page.locator('main table').count()).toBe(0);
    expect(await f.page.locator('main input[type="checkbox"]').count()).toBe(0);
    // 7E · R6/F-3: the matrix four files away is neither a table nor a
    // checkbox — it is <form action=".../grant/submit"> → <label> → <input
    // type="radio" name="level">. Asserting the absence of a table and a
    // checkbox asserts the absence of a shape the product never had; paste
    // the member page's block onto this list and both halves stay green
    // while PPL-01's "the list page holds no matrix at all" is false on the
    // shipped surface. These assert the shape that actually exists.
    expect(await f.page.locator('main input[name="level"]').count()).toBe(0);
    expect(await f.page.locator('main form[action*="/grant/submit"]').count()).toBe(0);
    // limit (1), said on screen
    await expect(f.page.locator('main')).toContainText('what each person can see in the record');
  });

  test('adjust: a raise through step-up, a lower without; the care ceiling never offered above (PPL-02, AC-PERM-5)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const dan = await theMember(browser, 'dan');
    const marisol = await theMember(browser, 'marisol');

    // LOWER, no token: Dan's health summary → activity only.
    await f.page.goto(`/${f.circleId}/people/${dan.memberId}`);
    const healthForm = f.page.locator('form:has(input[name="domain"][value="health"])');
    await healthForm.locator('input[name="level"][value="log"]').check();
    await healthForm.locator('button:has-text("Change")').click();
    await f.page.waitForURL(/\?changed=1/);

    // RAISE, through the step-up: back to summary.
    const healthForm2 = f.page.locator('form:has(input[name="domain"][value="health"])');
    await healthForm2.locator('input[name="level"][value="summary"]').check();
    await healthForm2.locator('button:has-text("Change")').click();
    await f.page.waitForURL(/e=step-up/);
    await f.page.fill('input[name="password"]', PASSWORD);
    await f.page.click('button:has-text("Confirm it")');
    await expect(f.page.locator('button:has-text("Raise it")')).toBeVisible();
    await f.page.click('button:has-text("Raise it")');
    await f.page.waitForURL(/\?changed=1/);
    await expect(
      f.page
        .locator('form:has(input[name="domain"][value="health"])')
        .locator('input[name="level"][value="summary"]'),
    ).toBeChecked();

    // THE CEILING: Marisol's page offers nothing above it, no other domain,
    // and says it is a ceiling.
    await f.page.goto(`/${f.circleId}/people/${marisol.memberId}`);
    await expect(f.page.locator('main')).toContainText(/ceiling/i);
    expect(await f.page.locator('input[name="level"][value="view"]').count()).toBe(0);
    expect(await f.page.locator('input[name="level"][value="manage"]').count()).toBe(0);
    expect(await f.page.locator('form:has(input[name="domain"][value="health"])').count()).toBe(0);
  });

  test('nav follows access — a caregiver’s nav is Tasks · Account, a family member’s is Timeline · Documents · People · Account; the hand-built URL is refused regardless (NAV-01)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const dan = await theMember(browser, 'dan');
    const marisol = await theMember(browser, 'marisol');

    await marisol.page.goto(`/${f.circleId}/tasks`);
    const marisolNav = marisol.page.locator('nav.left-nav a');
    const marisolHrefs = await marisolNav.evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href')),
    );
    expect(marisolHrefs).toEqual([`/${f.circleId}/tasks`, '/account']);

    await dan.page.goto(`/${f.circleId}/timeline`);
    const danHrefs = await dan.page
      .locator('nav.left-nav a')
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
    expect(danHrefs).toEqual([
      `/${f.circleId}/timeline`,
      `/${f.circleId}/documents`,
      `/${f.circleId}/people`,
      '/account',
    ]);

    // hiding is a courtesy — the hand-built ADJUST URL refuses for itself
    const handBuilt = await marisol.page.request.get(`/${f.circleId}/people/${dan.memberId}`);
    expect(handBuilt.status()).toBe(404);
  });

  test('revoke: the pre-revocation URL leg with the honest limit in the PRD’s words (PPL-03, AC-PPL-4)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const petra = await theMember(browser, 'petra');
    const arrivalId = await theArrival(browser);

    // The URL, ISSUED AND FETCHED BEFORE THE REVOCATION, from Petra's own
    // live context — real bytes through the one path.
    const artifactUrl = `/api/artifact/${arrivalId}?page=1`;
    const preFetch = await petra.page.request.get(artifactUrl);
    expect(preFetch.status()).toBe(200);
    // §4.6.3's cached-responses channel, asserted where it BITES: the
    // reading path's response says `private, no-store` for itself — the
    // one URL whose caching could outlive a revocation. (Page responses:
    // the dev server rewrites cache-control after the proxy — gate r3
    // read `no-cache, must-revalidate` — so the page half is pinned at
    // the unit level, tests/app/proxy.test.ts, and by the prod default.)
    expect(preFetch.headers()['cache-control']).toBe('private, no-store');

    // The revocation, through the real screen — wearing the honest limit
    // IN THOSE WORDS at the moment of revocation, and NAMING the channels
    // this slice does not reach.
    await f.page.goto(`/${f.circleId}/people/${petra.memberId}?remove=1`);
    await expect(f.page.locator('main')).toContainText(
      "a file already downloaded to someone's device cannot be recalled",
    );
    await expect(f.page.locator('main')).toContainText(/notification and export channels/i);
    await f.page.click('button:has-text("Remove Petra")');
    await f.page.waitForURL(/removed=1/);

    // THE SAME URL, from HER live context → the one 404.
    const postFetch = await petra.page.request.get(artifactUrl);
    expect(postFetch.status()).toBe(404);
    // and her sessions are closed: the next page she loads refuses.
    await petra.page.goto(`/${f.circleId}/timeline`);
    await petra.page.waitForURL(/\/sign-in/);
  });

  test('the access log rendered and printed (PPL-04, AC-PPL-5/7)', async ({ browser }) => {
    const f = await theFounder(browser);
    // 7E · R6/F-10: the leg cited AC-PPL-7 and seeded NO denial, so the
    // clause about counted-never-named had nothing to be true of. Seven
    // denials through the one writer collapse into ONE row counted seven.
    await fixtureDenials(f.circleId, f.accountId, f.nell, 7);
    await f.page.goto(`/${f.circleId}/people/log`);
    // entries exist from circle creation onward; each is a sentence
    const entries = f.page.locator('.log-entries li');
    expect(await entries.count()).toBeGreaterThan(0);
    await expect(f.page.locator('main')).toContainText('People Founder');
    // AC-PPL-7: the denial is COUNTED and never NAMED. The count is read
    // from the sentence itself, and the phrase stays the unnamed one.
    const denial = f.page.locator('.log-entries li', { hasText: 'tried to open something' });
    // The WHOLE shape, anchored: actor, the UNNAMED phrase, the subject,
    // the domain, the collapsed count, the date — and nothing else. The
    // domain belongs here: AC-PPL-5's sentence is who did what, to whom, on
    // which subject, IN WHICH DOMAIN, when. What must never appear is the
    // OBJECT, and an anchored whole-text match forbids one anywhere in the
    // sentence — which a negative on any single word cannot.
    await expect(denial.first()).toHaveText(
      /^People Founder tried to open something in Nell.s finances · 7 times · .+$/,
    );
    // PRINTED: the same filtered read — the chrome hides, the entries stay.
    // The CONTROL first: isVisible() is a non-retrying one-shot that returns
    // false for a NON-EXISTENT element as readily as a hidden one, so
    // renaming the nav class would have made this leg report that print
    // hides chrome it never saw. Assert the nav exists and is visible on
    // screen BEFORE asserting print hides it.
    const nav = f.page.locator('nav.left-nav');
    await expect(nav).toBeVisible();
    await f.page.emulateMedia({ media: 'print' });
    try {
      expect(await nav.isVisible()).toBe(false);
      expect(await entries.first().isVisible()).toBe(true);
      // the denial survives the print sheet too — the printed projection is
      // the same filtered read, never a narrower one.
      expect(await denial.first().isVisible()).toBe(true);
    } finally {
      await f.page.emulateMedia({ media: 'screen' });
    }
  });

  test('the subject’s page: the custodianship declaration and the profile facts at view (Q4(b), RCP-02’s profile link)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    await fixtureInsert(
      `insert into public.profile_facts (id, circle_id, subject_id, field, value, risk_class,
         approved_by, approved_at, approver_display_name, taint)
       values (gen_random_uuid(), $1, $2, 'date_of_birth', '"1941-03-02"', 'high', $3, now(),
               'People Founder', '{health}')
       on conflict do nothing`,
      [f.circleId, f.nell, f.accountId],
    );
    await f.page.goto(`/${f.circleId}/people/subject/${f.nell}`);
    await expect(f.page.locator('main')).toContainText("Nell's record, held on their behalf");
    await expect(f.page.locator('main')).toContainText('custodian');
    await expect(f.page.locator('main')).toContainText('Custodianship declared');
    await expect(f.page.locator('main')).toContainText('date of birth');
    await expect(f.page.locator('main')).toContainText('1941-03-02');
    await expect(f.page.locator('main')).toContainText('high');
  });

  test('A11Y-10: the plain line first; the matrix keyboard-operable; meaning never by colour; the printed log readable — at 390px', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const dan = await theMember(browser, 'dan');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await context.addCookies(await f.context.cookies());
    try {
      // the list: axe clean at 390, no horizontal scroll
      await page.goto(`/${f.circleId}/people`);
      await expect(page.locator('main')).toContainText(/Nell: /);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      expect(await axeViolations(page)).toEqual([]);

      // the matrix, by keyboard: focus a level radio and move the selection
      // with the arrow keys — meaning carried by the checked state and its
      // WORD, never by colour alone.
      await page.goto(`/${f.circleId}/people/${dan.memberId}`);
      const scheduleForm = page.locator('form:has(input[name="domain"][value="schedule"])');
      // 7E · R6/F-1: read the checked value BEFORE the key, and assert both
      // MOVEMENT and SELECTION after. The old leg read nothing before and
      // compared nothing after — `focusedValue.length > 0` was satisfied by
      // the .focus() on the previous line, so giving the radios unique
      // `name`s would destroy the radiogroup, make ArrowDown do nothing, and
      // leave the leg green over a matrix that is not keyboard-operable.
      const radios = scheduleForm.locator('input[name="level"]');
      const names = await scheduleForm
        .locator('input[type="radio"]')
        .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))]);
      expect(names).toEqual(['level']);
      const before = await scheduleForm.locator('input[name="level"]:checked').inputValue();
      await scheduleForm.locator('input[name="level"]:checked').focus();
      await page.keyboard.press('ArrowDown');
      const focusedValue = await page.evaluate(
        () => (document.activeElement as HTMLInputElement | null)?.value ?? '',
      );
      // the focus MOVED to a different option…
      expect(focusedValue).not.toBe(before);
      // …and in a radiogroup the selection follows it, which is what makes
      // the matrix operable rather than merely focusable.
      const afterChecked = await scheduleForm
        .locator('input[name="level"]:checked')
        .inputValue();
      expect(afterChecked).toBe(focusedValue);

      // 7E · R6/F-9: meaning never by colour. The clause had NO assertion
      // behind it — only a comment — and axe cannot stand in: 1.4.1 is not
      // machine-checkable and is not in the rule set axe runs. Restyle the
      // levels as swatches with the word in a `title` and nothing would
      // fail. This is the exact-set check: every offered radio carries its
      // OWN word, rendered as text, from LEVEL_OPTION_WORD.
      //
      // LEVEL_OPTION_WORD is `{ ...LEVEL_WORD, hidden: 'Nothing' }`, private
      // to app/(app)/[circle]/people/[member]/page.tsx; e2e specs import no
      // app module, so the mapping is mirrored here and any drift fails.
      const LEVEL_OPTION_WORD: Record<string, string> = {
        manage: 'full access',
        view: 'sees everything',
        summary: 'summary only',
        log: 'activity only',
        hidden: 'Nothing',
      };
      const rendered = await radios.evaluateAll((els) =>
        els.map((e) => ({
          value: (e as HTMLInputElement).value,
          word: (e.closest('label')?.textContent ?? '').trim(),
        })),
      );
      expect(rendered.length).toBeGreaterThan(1);
      expect(rendered.map((r) => r.word)).toEqual(
        rendered.map((r) => LEVEL_OPTION_WORD[r.value]),
      );
      expect(await axeViolations(page)).toEqual([]);

      // the printed log: readable — entries visible under print media
      await page.goto(`/${f.circleId}/people/log`);
      await page.emulateMedia({ media: 'print' });
      expect(await page.locator('.log-entries li').first().isVisible()).toBe(true);
      await page.emulateMedia({ media: 'screen' });
    } finally {
      await context.close();
    }
  });
});
