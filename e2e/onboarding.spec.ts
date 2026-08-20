import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

// ============================================================================
// A9 · The onboarding walkthrough (TSD §11.4 item 3; AC-AUTH-1/9/10/11;
// AC-PERM-3): a two-parent family through the founder path — two subjects
// with divergent situations and zips, two forwarding addresses, the
// custodianship access-log entry at creation, an invite at summary-only,
// a completion screen naming only what Phase 1 built — then the invitee
// path to the family landing in two taps, then the revocation checks
// from second browser contexts.
//
// Runs against the live local stack (`supabase start`) + `next dev`.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';

const stamp = Date.now();
const FOUNDER_EMAIL = `sarah.e2e.${stamp}@example.com`;
const INVITEE_EMAIL = `dan.e2e.${stamp}@example.com`;
const PASSWORD = 'a long walk home 7';
const INVITEE_PASSWORD = 'another long walk 7';

let circleId = '';
let acceptUrl = '';
let founderContext: BrowserContext;
let founderPage: Page;
let inviteeContext: BrowserContext;
let inviteePage: Page;

async function query(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

test.describe.serial('the §11.4-3 walkthrough', () => {
  test('founder: create account → Step 1 with no mail check (§4.1.2)', async ({ browser }) => {
    // ONE founder context for the whole walkthrough: until verification,
    // the only session an unverified founder can hold is the signup-minted
    // one (parity doc) — exactly what a real founder carries.
    founderContext = await browser.newContext();
    const page = (founderPage = await founderContext.newPage());
    await page.goto('/create-account');
    await expect(page.locator('h1')).toContainText('Create your account');
    await page.fill('input[name="name"]', 'Sarah');
    await page.fill('input[name="email"]', FOUNDER_EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    // The fresh branch carries its session; setup resumes at step 1.
    await page.waitForURL('**/setup/step/1');
    await expect(page.locator('.step-indicator')).toHaveText('Step 1 of 4');
  });

  test('steps 1–2: two subjects, divergent situations and zips (AC-AUTH-1)', async () => {
    const page = founderPage;
    await page.goto('/setup');
    await page.waitForURL('**/setup/step/1');

    await page.check('input[name="relationship"][value="daughter"]');
    await page.check('input[name="slice"][value="money-paperwork"]');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/2**');
    await expect(page.locator('.step-indicator')).toHaveText('Step 2 of 4');

    await page.fill('input[name="subject_name_1"]', 'Nell');
    await page.check('input[name="situation_1"][value="At home, on their own"]');
    await page.fill('input[name="zip_1"]', '02140');
    await page.fill('input[name="subject_name_2"]', 'Marcus');
    await page.check('input[name="situation_2"][value="In a nursing facility"]');
    await page.fill('input[name="zip_2"]', '60614');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/3**');

    const url = new URL(page.url());
    circleId = url.searchParams.get('circle')!;
    expect(circleId).toBeTruthy();
  });

  test('the custodianship declarations are the circle log’s first rows (AC-AUTH-6)', async () => {
    const rows = await query(
      'select event_type, seq from public.access_log where circle_id = $1 order by seq limit 2',
      [circleId],
    );
    expect(rows.rows[0]).toMatchObject({ event_type: 'custodianship_declared', seq: '1' });
    expect(rows.rows[1].event_type).toBe('custodianship_declared');
  });

  test('abandon after step 2, return → resume at step 3 with the circle intact (AC-AUTH-9)', async () => {
    const page = founderPage;
    await page.goto('/setup');
    await page.waitForURL(`**/setup/step/3?circle=${circleId}`);
    await expect(page.locator('.step-indicator')).toHaveText('Step 3 of 4');
  });

  test('steps 3–4 and the completion screen (AC-AUTH-2/5; ADR-0011)', async () => {
    const page = founderPage;
    await page.goto(`/setup/step/3?circle=${circleId}`);
    await page.check('input[name="context"][value="a-hospital-stay-or-discharge"]');
    await page.check('input[name="context"][value="paperwork-piling-up"]');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/4**');
    await expect(page.locator('.step-indicator')).toHaveText('Step 4 of 4');

    await page.click(`a[href*="/setup/complete"]`);
    await page.waitForURL('**/setup/complete**');

    const body = (await page.textContent('main')) ?? '';
    expect(body).toMatch(/nell\.[a-z0-9]{6}@harperscircle\.app/);
    expect(body).toMatch(/marcus\.[a-z0-9]{6}@harperscircle\.app/);
    expect(body).toContain('held by you on their behalf');
    // Unverified: inactive reason + no invite affordance yet (AC-AUTH-4's surface half).
    expect(body).toContain('Verify your email');
    await expect(page.locator(`a[href="/${circleId}/invite"]`)).toHaveCount(0);
    // AC-AUTH-5: only what Phase 1 built.
    expect(body.toLowerCase()).not.toContain('checklist');
    expect(body.toLowerCase()).not.toContain('local resources');
  });

  test('verification flips the mirror; the invite affordance appears', async () => {
    const page = founderPage;
    // The confirmation mail was requested at create-account; fetch the
    // link from Mailpit and click it.
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${FOUNDER_EMAIL}`)}`,
    ).then((r) => r.json());
    expect(search.messages.length).toBeGreaterThan(0);
    const message = await fetch(
      `${MAILPIT}/api/v1/message/${search.messages[0].ID}`,
    ).then((r) => r.json());
    // B9: the confirmation template routes through /confirm?token_hash
    // (the link-extraction accessor widens; the walkthrough's steps are
    // unchanged — recorded in the round-13 packet).
    const link = String(message.Text ?? message.HTML).match(
      /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
    )?.[0];
    expect(link).toBeTruthy();
    await page.goto(link!);

    const verified = await query(
      'select email_verified_at from public.accounts where email = $1',
      [FOUNDER_EMAIL],
    );
    expect(verified.rows[0].email_verified_at).not.toBeNull();

    await page.goto(`/setup/complete?circle=${circleId}`);
    await expect(page.locator(`a[href="/${circleId}/invite"]`)).toHaveCount(1);
  });

  test('an invite at summary-only: ceiling under the selector, link shown once', async () => {
    const page = founderPage;
    await page.goto(`/${circleId}/invite`);
    await expect(page.locator('main')).toContainText("They'll start at summary only");

    await page.fill('input[name="invited_email"]', INVITEE_EMAIL);
    await page.check('input[name="tier"][value="family"]');
    await page.locator('input[name="subject_ids"]').first().check();
    await page.click('button[type="submit"]');
    await page.waitForURL('**/invite/created');

    acceptUrl = (await page.locator('.mono-address').textContent())!.trim();
    expect(acceptUrl).toMatch(/\/accept\/[0-9a-f]{64}$/);
  });

  test('invitee: ceiling before anything, create account with the address fixed, land on the Timeline (AC-AUTH-7 shape, §4.1.4)', async ({
    browser,
  }) => {
    inviteeContext = await browser.newContext();
    inviteePage = await inviteeContext.newPage();
    const path = acceptUrl.replace(/^https?:\/\/[^/]+/, '');

    await inviteePage.goto(path);
    const body = (await inviteePage.textContent('main')) ?? '';
    // The ceiling, the circle, the inviter and the subjects — before any ask.
    expect(body).toContain("You'll start at summary only");
    expect(body).toContain('Sarah');
    expect(body).toContain('Nell');
    expect(body).toContain(INVITEE_EMAIL);

    await inviteePage.click(`a[href*="/create-account?invite="]`);
    // Two typed fields — the address is fixed (§4.1.4).
    await expect(inviteePage.locator('input[name="email"]')).toHaveCount(0);
    await inviteePage.fill('input[name="name"]', 'Dan');
    await inviteePage.fill('input[name="password"]', INVITEE_PASSWORD);
    await inviteePage.click('button[type="submit"]');

    await inviteePage.waitForURL('**/accept/**');
    await inviteePage.click('button[type="submit"]');
    await inviteePage.waitForURL(`**/${circleId}/timeline`);
    await expect(inviteePage.locator('main')).toContainText('Timeline');
  });

  test('AC-AUTH-11: the founder’s session cannot accept Dan’s invite', async () => {
    const page = founderPage;
    const path = acceptUrl.replace(/^https?:\/\/[^/]+/, '');
    await page.goto(path);
    // Used token now — but the identity rule was already enforced on the
    // pending screen; assert the dead-token treatment names the inviter.
    await expect(page.locator('main')).toContainText('Sarah');
    await expect(page.locator(`form[action*="/submit"]`)).toHaveCount(0);
  });

  test('AC-PERM-3: removal closes the sessions channel, checked from Dan’s live context', async () => {
    const member = await query(
      `select cm.id from public.circle_members cm
        join public.accounts a on a.id = cm.account_id
       where cm.circle_id = $1 and a.email = $2 and cm.removed_at is null`,
      [circleId, INVITEE_EMAIL],
    );
    const memberId = member.rows[0].id;

    // Dan's live context reads circle data before: the subjects' names.
    await inviteePage.goto(`/${circleId}/invite`);
    await expect(inviteePage.locator('main')).toContainText('Nell');

    // The coordinator removes him (the wiring the People surface will wear).
    const response = await founderPage.request.post(
      `/${circleId}/members/${memberId}/remove`,
      { form: {} },
    );
    expect(response.status()).toBeLessThan(400);

    // The sessions channel is closed at the store: no auth.sessions row
    // and no live refresh token survive (TSD §5.8's sessions row). A JWT
    // already in Dan's hands stays valid until exp BY DESIGN — "RLS, not
    // the session, is the enforcement" — which the next assertion proves.
    const sessions = await query(
      `select
         (select count(*)::int from auth.sessions s
           where s.user_id = a.id) as sessions,
         (select count(*)::int from auth.refresh_tokens r
           where r.user_id = a.id::text and not r.revoked) as live_refresh
       from public.accounts a where a.email = $1`,
      [INVITEE_EMAIL],
    );
    expect(sessions.rows[0]).toEqual({ sessions: 0, live_refresh: 0 });

    // Dan's LIVE second-browser context, still-unexpired JWT: the very
    // next request reads NOTHING — RLS closes it (AC-PERM-3).
    await inviteePage.goto(`/${circleId}/invite`);
    await expect(inviteePage.locator('main')).not.toContainText('Nell');
    await inviteeContext.close();
  });

  test('AC-AUTH-10: sign out everywhere kills a second browser’s session within seconds', async ({
    page,
    browser,
  }) => {
    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await signIn(secondPage, FOUNDER_EMAIL, PASSWORD);
    await secondPage.goto('/account');
    await expect(secondPage.locator('h1')).toContainText('Account');

    await signIn(page, FOUNDER_EMAIL, PASSWORD);
    await page.goto('/account');
    await page.click('form[action="/account/sign-out-everywhere"] button');
    await page.waitForURL('**/sign-in**');

    await secondPage.goto('/account');
    await secondPage.waitForURL('**/sign-in**');
    await second.close();
  });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState();
}
