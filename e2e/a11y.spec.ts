import { expect, test, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// D7 · The browser a11y leg (Q3 ruling; ADR-0015 R6 local gate; A11Y-03/
// 06 + DS-03). Browser truth the jsdom leg cannot see: per existing
// route — axe at WCAG 2.2 AA with COLOR-CONTRAST ON, the 390px
// phone-primary pass (§8.8) with no horizontal scroll, the ≥44px
// touch-target audit including every × glyph, reduced-motion emulation
// asserting no running infinite animation, and keyboard traversal of
// sign-in and a setup step (Tab order, visible ring, Enter submits).
//
// Runs under the local-gate protocol (docs/ops/e2e-local-gate.md) — CI
// does not run browsers (ADR-0014/R6). Never real family data.
//
// RESTRUCTURED AT 6B under ADR-0025 D8 (F-5): no `test.describe.serial` —
// no failing leg may prevent another leg from executing. The account and
// the circle are MEMOIZED provisions with self-sufficient fallbacks, so
// each audit leg runs alone (the targeted-run condition) and a failed
// prerequisite reports itself into dependents instead of skipping them.
// ============================================================================

const PHONE = { width: 390, height: 844 };

// §8.7's OWN exemption, bound to the redundancy rule (A11Y-04):
// --faint/--label are reserved for text that repeats information
// available elsewhere, so the label/faint ROLES are excluded from the
// automated contrast scan. G12 re-audits each concrete use against the
// redundancy claim — the exclusion list is deliberately short and named.
// .step-indicator left the list at the O1 sign-off ruling (ADR-0016): it
// is the sole carrier of step position, so the exemption's redundancy
// condition is not met — it now renders --muted-text and is scanned.
const CONTRAST_EXEMPT = ['.section-label', '.micro-meta'];

async function expectNoAxeViolations(page: Page) {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);
  for (const selector of CONTRAST_EXEMPT) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const formatted = results.violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .map((n) => n.html)
          .join('\n  ')}`,
    )
    .join('\n');
  expect(results.violations, formatted).toEqual([]);
}

async function expectTouchTargets(page: Page) {
  const offenders = await page.evaluate(() => {
    // Round-11 High-2: anchors styled as buttons are standalone CTAs
    // (no WCAG 2.5.8 inline exception) and a label wrapping a radio/
    // checkbox is the very target the carve-out below defers to — both
    // are measured here, not merely floor-pinned in the sheet.
    const selectors =
      'button, [role="button"], select, a[class*="button-"], .nav-link, .chip-dismiss, label:has(input[type="radio"]), label:has(input[type="checkbox"]), input:not([type="hidden"])';
    const out: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(selectors),
    )) {
      const type = el.getAttribute('type');
      // A radio/checkbox nested in its label: the LABEL is the target.
      if ((type === 'radio' || type === 'checkbox') && el.closest('label'))
        continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // not rendered
      if (r.height < 44 || r.width < 44) {
        out.push(
          `${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.width)}×${Math.round(r.height)} "${(el.textContent ?? '').trim().slice(0, 24)}"`,
        );
      }
    }
    return out;
  });
  expect(offenders).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function auditRoute(page: Page, path: string) {
  await page.goto(path);
  await expectNoAxeViolations(page);
  await expectTouchTargets(page);
  await expectNoHorizontalScroll(page);
}

const MAILPIT = 'http://127.0.0.1:54344';
const stamp = Date.now();
const EMAIL = `a11y.e2e.${stamp}@example.com`;
const PASSWORD = 'a quiet morning walk 7';
let circleId = '';

/** Click the confirmation link out of Mailpit (the walkthrough's
 *  pattern): a fresh PASSWORD sign-in of an unverified account is
 *  refused unconditionally (the probed GoTrue fact, ADR-0014 D3), so
 *  the audit legs verify the account first — they are about operability,
 *  not the verification state machine. The message is asserted to be
 *  THIS account's before its link is used (the run-3 lesson). */
async function verifyByMail(page: Page) {
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL}`)}`,
  ).then((r) => r.json());
  expect(search.messages.length).toBeGreaterThan(0);
  const picked = (
    search.messages as Array<{ ID: string; To?: Array<{ Address?: string }> }>
  ).find((m) => (m.To ?? []).some((t) => t.Address === EMAIL));
  if (!picked) {
    throw new Error(`Mailpit search for ${EMAIL} returned no message addressed to it`);
  }
  const message = await fetch(
    `${MAILPIT}/api/v1/message/${picked.ID}`,
  ).then((r) => r.json());
  const link = String(message.Text ?? message.HTML).match(
    /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
}

/** The verified account, provisioned once — by whichever leg needs it
 *  first — in a throwaway context so no leg's own page carries state it
 *  did not make. */
let accountMemo: Promise<void> | null = null;
function ensureAccount(browser: Browser): Promise<void> {
  accountMemo ??= (async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto('/create-account');
      await page.fill('input[name="name"]', 'Avery');
      await page.fill('input[name="email"]', EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/setup/step/1');
      await verifyByMail(page);
    } finally {
      await context.close();
    }
  })();
  return accountMemo;
}

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** The circle, for legs that audit (app) shell routes: reuses the one the
 *  setup-steps leg drove, or — running alone, or after that leg failed —
 *  drives setup itself, resume-aware, without audits. */
async function ensureCircle(browser: Browser): Promise<string> {
  if (circleId) return circleId;
  await ensureAccount(browser);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page);
    await page.goto('/setup');
    for (let hops = 0; hops < 6 && !circleId; hops++) {
      await page.waitForURL('**/setup/**');
      const url = new URL(page.url());
      const fromQuery = url.searchParams.get('circle');
      if (fromQuery) circleId = fromQuery;
      if (url.pathname.endsWith('/step/1')) {
        await page.check('input[name="relationship"][value="daughter"]');
        await page.check('input[name="slice"][value="money-paperwork"]');
        await page.click('button[type="submit"]');
      } else if (url.pathname.endsWith('/step/2')) {
        await page.fill('input[name="subject_name_1"]', 'Nell');
        await page.check('input[name="situation_1"][value="At home, on their own"]');
        await page.fill('input[name="zip_1"]', '02140');
        await page.click('button[type="submit"]');
      } else if (url.pathname.endsWith('/step/3')) {
        await page.check('input[name="context"][value="paperwork-piling-up"]');
        await page.click('button[type="submit"]');
      } else {
        break; // step 4 / complete: the circle exists and is captured
      }
    }
    if (!circleId) throw new Error('ensureCircle: setup did not yield a circle id');
    return circleId;
  } finally {
    await context.close();
  }
}

test.use({ viewport: PHONE }); // §8.8: phone is the primary review device

test.describe('the D7 browser a11y leg', () => {
  test('public routes: sign-in, create-account, reset, wasnt-me', async ({
    page,
  }) => {
    for (const path of ['/sign-in', '/create-account', '/reset', '/wasnt-me']) {
      await auditRoute(page, path);
    }
  });

  test('keyboard: sign-in is fully operable — Tab order, visible ring, Enter submits', async ({
    browser,
    page,
  }) => {
    // The account must exist for Enter to land somewhere honest.
    await ensureAccount(browser);

    await page.goto('/sign-in');
    const ringOnActive = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          name: el.getAttribute('name') ?? el.tagName.toLowerCase(),
          outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
        };
      });

    await page.keyboard.press('Tab');
    let focused = await ringOnActive();
    // Tab from the top: the first field reached is email (links may
    // precede in DOM order on some screens — walk until a field).
    for (let hops = 0; focused && focused.name !== 'email' && hops < 6; hops++) {
      await page.keyboard.press('Tab');
      focused = await ringOnActive();
    }
    expect(focused?.name).toBe('email');
    expect(focused?.outline).toBe('2px solid rgb(47, 91, 78)');
    await page.keyboard.type(EMAIL);

    await page.keyboard.press('Tab');
    focused = await ringOnActive();
    expect(focused?.name).toBe('password');
    expect(focused?.outline).toBe('2px solid rgb(47, 91, 78)');
    await page.keyboard.type(PASSWORD);

    await page.keyboard.press('Enter');
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  });

  test('setup steps 1–4 and completion, audited; keyboard traversal of step 1', async ({
    browser,
    page,
  }) => {
    await ensureAccount(browser);
    await signIn(page);
    await page.goto('/setup');
    await page.waitForURL('**/setup/step/1');

    await expectNoAxeViolations(page);
    await expectTouchTargets(page);
    await expectNoHorizontalScroll(page);

    // Positive control (round-11 High-2): the deferred-to choice labels
    // exist here, so the widened audit measured real boxes above.
    expect(
      await page.locator('label:has(input[type="radio"])').count(),
    ).toBeGreaterThan(0);

    // Keyboard: Tab reaches the first choice; the ring is visible on it.
    await page.keyboard.press('Tab');
    const onChoice = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return el ? { type: el.type, inLabel: !!el.closest('label') } : null;
    });
    expect(onChoice?.type).toBe('radio');
    expect(onChoice?.inLabel).toBe(true);

    await page.check('input[name="relationship"][value="daughter"]');
    await page.check('input[name="slice"][value="money-paperwork"]');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/2**');
    await expectNoAxeViolations(page);
    await expectTouchTargets(page);
    await expectNoHorizontalScroll(page);

    await page.fill('input[name="subject_name_1"]', 'Nell');
    await page.check('input[name="situation_1"][value="At home, on their own"]');
    await page.fill('input[name="zip_1"]', '02140');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/3**');
    circleId = new URL(page.url()).searchParams.get('circle')!;
    await expectNoAxeViolations(page);
    await expectTouchTargets(page);
    await expectNoHorizontalScroll(page);

    await page.check('input[name="context"][value="paperwork-piling-up"]');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/4**');
    await expectNoAxeViolations(page);
    await expectTouchTargets(page);
    await expectNoHorizontalScroll(page);

    await page.click('a[href*="/setup/complete"]');
    await page.waitForURL('**/setup/complete**');
    await expectNoAxeViolations(page);
    await expectTouchTargets(page);
    await expectNoHorizontalScroll(page);

    // Positive control (round-11 High-2): the standalone button-styled
    // <a> CTA exists here, so the widened audit measured it above.
    expect(await page.locator('a[class*="button-"]').count()).toBeGreaterThan(
      0,
    );
  });

  test('the (app) shell routes and account, audited at 390px', async ({
    browser,
    page,
  }) => {
    const circle = await ensureCircle(browser);
    await signIn(page);

    for (const path of [
      `/${circle}/timeline`,
      `/${circle}/tasks`,
      `/${circle}/invite`,
      '/account',
    ]) {
      await auditRoute(page, path);
    }
  });

  // 6B B9 (R5/F-6): the routes the pinned audit list found UNAUDITED —
  // senders shipped a render throw precisely because no browser ever
  // visited it. Each is audited in a real, reachable state: the inbox and
  // senders in their first-run states, upload as the live form,
  // invite/created in its no-invite state.
  test('the Care Inbox family: inbox, senders, upload, invite/created, audited at 390px', async ({
    browser,
    page,
  }) => {
    const circle = await ensureCircle(browser);
    await signIn(page);

    for (const path of [
      `/${circle}/inbox`,
      `/${circle}/senders`,
      `/${circle}/upload`,
      `/${circle}/invite/created`,
    ]) {
      await auditRoute(page, path);
    }
  });

  // 6B B9 (R5/F-6): the recovery surfaces, audited in the states a person
  // actually reaches without a fixture token: reset/confirm asking for its
  // code, and accept refusing an invalid invitation honestly.
  test('the recovery surfaces: reset/confirm, and accept with an invalid token', async ({
    page,
  }) => {
    await auditRoute(page, '/reset/confirm');
    await auditRoute(page, '/accept/not-a-real-token');
  });

  // ==========================================================================
  // 7B B4 (slice-7 plan, G12 per increment; A11Y-09). The record surfaces are
  // audited over LIVE rows — list and detail — because an empty list audits
  // nothing: a task and an event are fixtured onto the a11y circle (the
  // gate's standing replica-role concession), and the keyboard leg drives
  // the filters and the assign flow end to end at 390px AND desktop.
  // ==========================================================================
  const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
  async function query(text: string, params: unknown[] = [], replica = false) {
    const client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    try {
      if (replica) await client.query('set session_replication_role = replica');
      return await client.query(text, params);
    } finally {
      await client.end();
    }
  }

  let recordMemo: Promise<{ taskId: string; eventId: string }> | null = null;
  function ensureRecordRows(browser: Browser): Promise<{ taskId: string; eventId: string }> {
    recordMemo ??= (async () => {
      const circle = await ensureCircle(browser);
      const account = await query('select id from public.accounts where email = $1', [EMAIL]);
      const subject = await query('select id from public.subjects where circle_id = $1 order by created_at limit 1', [circle]);
      const accountId = account.rows[0].id as string;
      const subjectId = subject.rows[0].id as string;
      const taskId = randomUUID();
      const eventId = randomUUID();
      await query(
        `insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone, status,
           approved_by, approved_at, approver_display_name, taint)
         values ($1, $2, $3, 'Call the pharmacy about the refill', '2099-09-04', 'America/New_York', 'open',
                 $4, now(), 'Avery', '{schedule}')`,
        [taskId, circle, subjectId, accountId],
        true,
      );
      await query(
        `insert into public.timeline_events (id, circle_id, subject_id, kind, summary, occurred_on, occurred_zone,
           approved_by, approved_at, approver_display_name, taint)
         values ($1, $2, $3, 'care', 'Home health nurse started weekly visits', '2026-08-15', 'America/New_York',
                 $4, now(), 'Avery', '{health}')`,
        [eventId, circle, subjectId, accountId],
        true,
      );
      return { taskId, eventId };
    })();
    return recordMemo;
  }

  // ── 7E · R6/F-5 (ADR-0038, ACCEPTED · TAKEN(7E)) ────────────────────────
  //
  // This spec was not in the 7C diff, and its shell pass iterates four
  // routes, none of them Documents. `expectTouchTargets` appears zero times
  // in either 7C spec. So `/[circle]/documents` had no browser accessibility
  // coverage at all, `/people/subject/[subject]` never saw axe, and
  // `/people/log` was visited only for a print visibility check — while the
  // three people pages that ARE audited are held to axe's 24×24 target-size
  // floor rather than the project's own 44 px.
  //
  // Ruled FIX rather than the OWED option: C6 is BINDING, the manifest is
  // what a reviewer reads to check C6, and this round already produced a
  // real 44 px failure on the `.action-link` class the Documents list
  // carries three of.
  let docMemo: Promise<{ documentId: string; subjectId: string }> | null = null;
  function ensureDocumentRow(
    browser: Browser,
  ): Promise<{ documentId: string; subjectId: string }> {
    docMemo ??= (async () => {
      const circle = await ensureCircle(browser);
      const account = await query('select id from public.accounts where email = $1', [EMAIL]);
      const subject = await query(
        'select id from public.subjects where circle_id = $1 order by created_at limit 1',
        [circle],
      );
      const accountId = account.rows[0].id as string;
      const subjectId = subject.rows[0].id as string;
      const documentId = randomUUID();
      const arrivalId = randomUUID();
      await query(
        `insert into public.arrivals (id, circle_id, subject_id, channel, state, scan_verdict)
         values ($1, $2, $3, 'upload', 'filed', 'clean')`,
        [arrivalId, circle, subjectId],
        true,
      );
      await query(
        `insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
           artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
         values ($1, $2, $3, 'Discharge summary · 12 Jul', 'medical',
                 'Wound care continues twice daily.', $4, now(), $5, now(), 'Avery', '{health}')`,
        [documentId, circle, subjectId, arrivalId, accountId],
        true,
      );
      return { documentId, subjectId };
    })();
    return docMemo;
  }

  test('the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px', async ({
    browser,
    page,
  }) => {
    // FOUR routes, each audited three ways (axe with contrast on, the 44 px
    // touch-target pass, no horizontal scroll) — the same size as the shell
    // pass, which this file's default 120 s has been observed to hold only
    // sometimes: in two consecutive runs on this host the shell leg took 116 s
    // and then 25 s, and four legs timed out at ~123 s. An audit leg must not
    // be decided by which end of that spread it lands on, so this one names
    // its own budget rather than inheriting the default.
    test.setTimeout(300_000);
    const circle = await ensureCircle(browser);
    const { subjectId } = await ensureDocumentRow(browser);
    await signIn(page);
    for (const path of [
      `/${circle}/documents`,
      `/${circle}/people`,
      `/${circle}/people/subject/${subjectId}`,
      `/${circle}/people/log`,
    ]) {
      await auditRoute(page, path);
    }
    // Positive control: the audits ran over a real row, not an empty state,
    // and over the .action-link class the round-27 44 px catch landed on —
    // auditRoute's touch-target pass is the project's floor, not axe's.
    await page.goto(`/${circle}/documents`);
    expect(await page.locator('main .record-list > li').count()).toBeGreaterThan(0);
    expect(await page.locator('main a.action-link').count()).toBeGreaterThan(0);
    // …and the log renders entries, so its audit was over content.
    await page.goto(`/${circle}/people/log`);
    expect(await page.locator('.log-entries li').count()).toBeGreaterThan(0);
  });

  test('the record surfaces: tasks and timeline, list and detail, audited at 390px', async ({
    browser,
    page,
  }) => {
    const circle = await ensureCircle(browser);
    const { taskId, eventId } = await ensureRecordRows(browser);
    await signIn(page);
    for (const path of [
      `/${circle}/tasks`,
      `/${circle}/tasks/${taskId}`,
      `/${circle}/timeline`,
      `/${circle}/timeline/${eventId}`,
    ]) {
      await auditRoute(page, path);
    }
    // Positive control: the audits ran over real rows, not empty states.
    await page.goto(`/${circle}/tasks`);
    expect(await page.locator('main .choice-list a.row-title').count()).toBeGreaterThan(0);
    // §8.7: the subject label carries the NAME, never colour alone.
    await expect(page.locator('main .subject-label').first()).toContainText('Nell');
  });

  test('A11Y-09: the filters and the assign flow, keyboard-operable end to end, at 390px and desktop', async ({
    browser,
  }) => {
    const circle = await ensureCircle(browser);
    const { taskId } = await ensureRecordRows(browser);
    const active = (page: Page) =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          className: el.className,
          name: el.getAttribute('name') ?? '',
          text: (el.textContent ?? '').trim(),
          outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
        };
      });
    /** Tab until the active element satisfies `until`, or fail in its own words. */
    async function tabTo(page: Page, until: (a: NonNullable<Awaited<ReturnType<typeof active>>>) => boolean, what: string) {
      for (let hops = 0; hops < 40; hops++) {
        await page.keyboard.press('Tab');
        const a = await active(page);
        if (a && until(a)) return a;
      }
      throw new Error(`Tab never reached ${what}`);
    }

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        await signIn(page);

        // The filters: Tab reaches a chip, the ring is visible, Enter follows it.
        await page.goto(`/${circle}/tasks`);
        const chip = await tabTo(page, (a) => a.className.includes('filter-chip') && a.text.startsWith('Mine'), 'the Mine chip');
        expect(chip.outline).toBe('2px solid rgb(47, 91, 78)');
        await page.keyboard.press('Enter');
        await page.waitForURL('**filter=mine**');
        await expect(page.locator('a.filter-chip[aria-current="true"]')).toContainText('Mine');

        // The assign flow: Tab to the person, Space selects, Tab to the
        // button, Enter hands it over — two taps, none of them a pointer.
        await page.goto(`/${circle}/tasks/${taskId}`);
        await tabTo(page, (a) => a.name === 'member_id', 'the first person offered');
        await page.keyboard.press('Space');
        expect(await page.locator('input[name="member_id"]:checked').count()).toBe(1);
        const button = await tabTo(page, (a) => a.tag === 'button' && /Hand it over/.test(a.text), 'the hand-over button');
        expect(button.outline).toBe('2px solid rgb(47, 91, 78)');
        await page.keyboard.press('Enter');
        await page.waitForURL('**?assigned=1');
        await expect(page.locator('[role="status"]')).toContainText('Handed over');
      } finally {
        await context.close();
      }
    }
  });

  test('styleguide: contrast-on axe over every composition; reduced motion stills the pulse', async ({
    page,
  }) => {
    await auditRoute(page, '/styleguide');

    // Positive control: the pulse IS running without the preference…
    const runningBefore = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              a.effect?.getTiming().iterations === Infinity,
          ).length,
    );
    expect(runningBefore).toBeGreaterThan(0);

    // …and the ONE reduced-motion query stills everything (A11Y-02).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const runningAfter = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              a.effect?.getTiming().iterations === Infinity,
          ).length,
    );
    expect(runningAfter).toBe(0);
    await page.emulateMedia({ reducedMotion: null });
  });
});
