import { expect, test, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
