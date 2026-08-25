import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// B9 · The 5B extraction leg (slice-5 plan B9) under the local-gate protocol —
// browser truth over the LIVE stack, the clamd container, AND the Anthropic
// FIXTURE SERVER (docs/ops/e2e-local-gate.md carries all three prerequisites;
// playwright.config.ts starts the fixture server as a second webServer).
//
// CI never calls a provider and neither does this leg. The adapter reaches its
// endpoint through standard base-URL config, so the gate points
// ANTHROPIC_BASE_URL at 127.0.0.1 and the adapter code never learns the
// difference — G9/G3's standing constraint, made a deployment fact.
//
// The legs:
//   · upload → store → scan → gate → extract → interpret → `Needs you`;
//   · a REFUSAL fixture → `Couldn't read it`, with the artifact STILL
//     VIEWABLE (§6.8: the family is never told their document was rejected as
//     unsafe, and never loses access to it);
//   · a needs-password fixture → `Needs a password`;
//   · the stage-2 pair — same provider, same date, different bytes → the
//     second is SUSPECTED, says WHY through the provenance line, and both
//     resolutions are live. It does not NAME the matched document:
//     `authenticated` holds a column-level grant on `arrivals` that 5A M5's
//     duplicate_of_document_id was never added to (ADR-0022 D15).
//
// The corpus fixtures are the B1 development partition, read from disk: the
// gate exercises the SAME bytes the unit tests do.
//
// RESTRUCTURED AT 6B under ADR-0025 D8 (F-5): no `test.describe.serial` —
// no failing leg may prevent another leg from executing — and the founder is
// a MEMOIZED provision any leg can trigger alone, with its Mailpit input and
// its verification outcome both asserted at the source (condition 3's
// discipline, applied file-wide). The founder context closes in afterAll so
// this spec leaves no session state behind for a neighbour.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
const WORKER_KEY = 'local-gate-worker-key-0123456789abcdef0123456789abcdef';

const stamp = Date.now();
const FOUNDER_EMAIL = `extract.founder.${stamp}@example.com`;
const PASSWORD = 'a long walk home 7';

const CORPUS = path.join(process.cwd(), 'fixtures', 'g9', 'development');
function fixture(name: string): Buffer {
  return readFileSync(path.join(CORPUS, name));
}

/** Trailing bytes give each upload its own content sha WITHOUT changing what
 *  the document says. Identical bytes are a STAGE-1 duplicate by design, and
 *  this leg is about stage 2. */
function unique(bytes: Buffer, tag: string): Buffer {
  return Buffer.concat([bytes, Buffer.from(`\n% hc-gate ${tag} ${stamp}\n`, 'latin1')]);
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

/**
 * A fixture write that must step around §4.9's deferred claim trigger, on ONE
 * connection so the session setting actually applies. See its call site for
 * why a gate fixture needs this and why it is never a product path.
 */
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
  await page.fill('input[name="name"]', 'Extract Founder');
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

  // Verify by the real mail click so the circle is in its production shape —
  // with the message asserted to be THIS founder's before its link is used,
  // and the click asserted to have verified THIS account (the ingestion
  // spec's run-3 lesson, applied here too).
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${FOUNDER_EMAIL}`)}`,
  ).then((r) => r.json());
  const picked = (
    search.messages as Array<{ ID: string; To?: Array<{ Address?: string }> }>
  ).find((m) => (m.To ?? []).some((t) => t.Address === FOUNDER_EMAIL));
  if (!picked) {
    throw new Error(
      `Mailpit search for ${FOUNDER_EMAIL} returned ${search.messages?.length ?? 0} message(s), none addressed to it`,
    );
  }
  const message = await fetch(`${MAILPIT}/api/v1/message/${picked.ID}`).then((r) => r.json());
  const link = String(message.Text ?? message.HTML).match(
    /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
  const verified = await query(
    'select email_verified_at from public.accounts where email = $1',
    [FOUNDER_EMAIL],
  );
  if (!verified.rows[0]?.email_verified_at) {
    throw new Error('the verification click did not verify THIS founder — refused at the cause');
  }

  return { context, page, circleId, subjectId };
}

/** Drive the workers until the arrival reaches one of `wanted`. The relay does
 *  this on a timer in production; here it is explicit so the leg is fast. */
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

test.describe('the 5B extraction leg', () => {
  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
  });

  test('founder → verified circle (the leg’s fixture)', async ({ browser }) => {
    const f = await theFounder(browser);
    expect(f.circleId).toBeTruthy();
    expect(f.subjectId).toBeTruthy();
  });

  test('upload → extract → interpret → `Needs you` on screen (WRK-02 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await uploadFixture(
      f,
      unique(fixture('dev-discharge-01.pdf'), 'happy'),
      `discharge-${stamp}.pdf`,
      'application/pdf',
    );
    const state = await driveTo(f, arrival, [
      'proposals_ready',
      'extract_failed',
      'unsupported_type',
    ]);
    expect(state).toBe('proposals_ready');

    // The facts and the drafted proposals landed in the SAME transaction.
    const facts = await query(
      `select count(*)::int as n, count(*) filter (where risk_class = 'high')::int as high
         from public.extractions where arrival_id = $1 and superseded_at is null`,
      [arrival],
    );
    expect(facts.rows[0].n).toBeGreaterThan(0);
    // §6.5: with no signed bands, EVERY field publishes high-risk.
    expect(facts.rows[0].high).toBe(facts.rows[0].n);

    const runs = await query(
      `select outcome::text as o, model_id, prompt_version, closed_at
         from public.extraction_runs where arrival_id = $1`,
      [arrival],
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].o).toBe('published');
    expect(runs.rows[0].closed_at).not.toBeNull();
    expect(runs.rows[0].model_id).toBeTruthy();
    expect(runs.rows[0].prompt_version).toBeTruthy();

    const proposals = await query(
      `select count(*)::int as n from public.proposals where arrival_id = $1 and status = 'pending'`,
      [arrival],
    );
    expect(proposals.rows[0].n).toBeGreaterThan(0);

    // The promoted rendering is per-arrival and write-once.
    const promoted = await query(
      `select count(*)::int as n from storage.objects
        where bucket_id = 'artifacts' and name like $1`,
      [`render/circle/${f.circleId}/arrival/${arrival}/%`],
    );
    expect(promoted.rows[0].n).toBeGreaterThan(0);

    await f.page.goto(`/${f.circleId}/inbox`);
    await expect(f.page.locator('body')).toContainText('Needs you');
  });

  test('a refusal lands `Couldn’t read it` — and the artifact stays viewable (§6.8)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const arrival = await uploadFixture(
      f,
      unique(fixture('dev-refusal-01.pdf'), 'refusal'),
      `refusal-${stamp}.pdf`,
      'application/pdf',
    );
    const state = await driveTo(f, arrival, ['extract_failed', 'proposals_ready']);
    expect(state).toBe('extract_failed');

    const reason = await query(
      `select reason_code from public.arrival_events
        where arrival_id = $1 and to_state = 'extract_failed' order by occurred_at desc limit 1`,
      [arrival],
    );
    expect(reason.rows[0].reason_code).toBe('provider_refusal');

    await f.page.goto(`/${f.circleId}/inbox`);
    const body = f.page.locator('body');
    await expect(body).toContainText("Couldn't read it");
    // The family is NEVER told their document was rejected as unsafe.
    await expect(body).not.toContainText(/unsafe/i);

    // …and the original is still theirs to open.
    const artifact = await f.page.request.get(`/api/artifact/${arrival}`);
    expect(artifact.status()).toBe(200);
  });

  test('an encrypted PDF lands `Needs a password`, never a failure', async ({ browser }) => {
    const f = await theFounder(browser);
    const arrival = await uploadFixture(
      f,
      unique(fixture('dev-encrypted-01.pdf'), 'locked'),
      `locked-${stamp}.pdf`,
      'application/pdf',
    );
    const state = await driveTo(f, arrival, [
      'needs_password',
      'extract_failed',
      'unsupported_type',
    ]);
    expect(state).toBe('needs_password');
    await f.page.goto(`/${f.circleId}/inbox`);
    await expect(f.page.locator('body')).toContainText('Needs a password');
  });

  // Titled for what it ACTUALLY exercises (round-16 R7/F-11, R8/F-8): it
  // drives `different`. `same_thing` is covered by tests/routes/inbox.test.ts
  // for the surface and pgTAP 055/056 for the transition — a title claiming
  // both is how a later reader concludes this leg proved something it did not.
  test('the stage-2 pair: suspected, CITED by name, and `different` resumes (DUP-02)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    // Same provider, same document_date, DIFFERENT bytes — stage 1's sha
    // match cannot see this; M5's key-field predicate can.
    const first = await uploadFixture(
      f,
      unique(fixture('dev-discharge-01.pdf'), 'dup-a'),
      `dup-a-${stamp}.pdf`,
      'application/pdf',
    );
    expect(await driveTo(f, first, ['proposals_ready'])).toBe('proposals_ready');

    // File the first one, so there is a FILED document to match against.
    //
    // Under `session_replication_role = replica`, deliberately, and the
    // refusal it steps around is the POINT: a raw insert into a record table
    // answers `record_write_unclaimed`, because §4.9's deferred trigger
    // demands the write be claimed through `proposal_commits`. There is no
    // approval SURFACE until slice 6, so a gate fixture cannot file a
    // document the honest way yet. This is the same technique the PRF-06
    // bench and the live suites use for fixture rows, and it is a FIXTURE
    // concession, never a product path — the guard it suspends is exactly
    // what makes "nothing is filed without a person approving it" true.
    await fixtureInsert(
      `insert into public.documents
         (circle_id, subject_id, title, category, summary_text, artifact_arrival_id, filed_at,
          approved_by, approved_at, approver_display_name, taint)
       select $1, $2, 'Discharge summary', 'medical', 'Filed by the gate leg.', $3, now(),
              a.id, now(), a.display_name, array['health']::hc.domain[]
         from public.accounts a
        where a.display_name = 'Extract Founder' limit 1`,
      [f.circleId, f.subjectId, first],
    );

    const second = await uploadFixture(
      f,
      unique(fixture('dev-discharge-02.pdf'), 'dup-b'),
      `dup-b-${stamp}.pdf`,
      'application/pdf',
    );
    const state = await driveTo(f, second, ['duplicate_suspected_stage2', 'proposals_ready']);
    expect(state).toBe('duplicate_suspected_stage2');

    await f.page.goto(`/${f.circleId}/inbox`);
    const body = f.page.locator('body');
    await expect(body).toContainText('Looks like a duplicate');
    // AMENDED at round 16, and the GATE is what forced it — this leg pinned
    // the generic copy and went red the moment Q-A landed, which is the leg
    // doing its job. M7 grants `duplicate_of_document_id`, so the §4.7 p2
    // copy now NAMES the filed document, which is what the plan's B6 row
    // asked for and what ADR-0022 D15 recorded as owed.
    await expect(body).toContainText('This looks like the discharge summary you filed on');
    // The WHY still renders as provenance (Q6's first consumer) — and it no
    // longer claims `provider` matched, because the detector requires
    // category + date + ≥1 OF provider / amount / policy_number (R5/F-5).
    await expect(f.page.locator('.provenance')).toHaveCount(1);
    await expect(body).toContainText('at least one detail read from this document');

    // `different` resumes to interpret, through a real lease + CAS + outbox.
    await f.page.locator(`form:has(input[value="${second}"]) button[value="different"]`).click();
    await f.page.waitForURL('**/inbox**');
    const resumed = await driveTo(f, second, ['proposals_ready', 'interpreting']);
    expect(['proposals_ready', 'interpreting']).toContain(resumed);
  });
});
