import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ============================================================================
// B9 · The 4B ingestion leg (slice-4 plan B9; §11.4-4 partial; ADR-0015
// R6) under the local-gate protocol — browser truth over the LIVE stack
// plus the clamd container (docs/ops/e2e-local-gate.md carries the
// prerequisite):
//
//   founder → verified → forwarding ACTIVE (FWD-01 live) · TUS upload →
//   honest states through store/scan/gate (UPL-01) · the artifact route
//   streams the clean original with one 404 shape (RLS-10 at HTTP
//   depth) · a synthetic signed Postmark webhook from an unknown sender
//   → held_unknown_sender VISIBLE with the §5.3 verdict copy → accept →
//   release (INB-01/SAU-01/SND-02) · EICAR lands QUARANTINED, not
//   scan_unavailable — live, the §1.6 constraint demonstrated (SCN-01) ·
//   the same bytes twice → duplicate suspect → resolved by a person,
//   the relay finishing the job (DUP-01 + RLY-01 end-to-end) · cancel ·
//   a family-tier member below the cliff sees NOTHING (Q6's matrix
//   probed live).
//
// RESTRUCTURED AT 6B under ADR-0025 D8's six conditions (F-5). The
// round-17 evidence was three gate runs with three DISJOINT failure sets,
// every one inside this suite's own fixtures, ordering or environment:
//
//   1 · NO `test.describe.serial`. A serial block converts every fragile
//       leg into a coverage hole for everything behind it — `:400` (the
//       live half of two GREEN coverage rows, UXA-01 and RLS-10) was
//       skipped in all three runs behind an unrelated failure. The
//       property, not the mechanism, is the requirement: **no failing leg
//       may prevent another leg from executing.** Provisioning is a
//       MEMOIZED helper — the first leg that needs the founder provisions
//       one; a later leg reuses it; a leg whose prerequisite genuinely
//       failed fails ITSELF, with the prerequisite's error, and its
//       neighbours still run. Every leg is also runnable BY TITLE alone
//       (D8 condition 5's targeted run needs exactly that).
//   2 · The cancel leg no longer RACES a queue drain — see its own
//       comment. It drives `/api/worker/extract` itself, after cancelling.
//   3 · The verification click VERIFIES ITS INPUTS: the Mailpit message
//       is asserted to be addressed to THIS founder before its link is
//       used, and the click is asserted to have verified THIS account —
//       run 3 failed three layers downstream of a wrong-session confirm
//       (`forwarding_active_at` still null) with the actual cause
//       invisible. A wrong pick now fails AT the pick, in its own words.
//   4 · `reuseExistingServer: false` rides in playwright.config.ts: a
//       peer's dev server carries none of the gate env and the only
//       symptom is a product-sounding string three layers from its cause
//       — such a run is INVALID, not flaky.
// ============================================================================

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const MAILPIT = 'http://127.0.0.1:54344';
// Must match playwright.config.ts's webServer env.
const WORKER_KEY = 'local-gate-worker-key-0123456789abcdef0123456789abcdef';
const INBOUND_SECRET = 'local-gate-inbound-secret-0123456789abcdef0123456789';
const INBOUND_AUTH = 'Basic ' + Buffer.from(`postmark:${INBOUND_SECRET}`).toString('base64');

const stamp = Date.now();
const FOUNDER_EMAIL = `ingest.founder.${stamp}@example.com`;
const FAMILY_EMAIL = `ingest.family.${stamp}@example.com`;
const PASSWORD = 'a long walk home 7';
const SENDER = `frontdesk.${stamp}@cardiology-example.org`;

// EICAR, assembled at runtime so the repo file never carries the
// contiguous signature (a host AV would quarantine the spec itself).
const EICAR =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-' + 'ANTIVIRUS-TEST-' + 'FILE!$H+H*';

const pdfBytes = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n%%EOF\n`);

async function query(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function pollState(
  arrivalId: string,
  wanted: string[],
  timeoutMs = 90_000,
): Promise<string> {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    const r = await query('select state from public.arrivals where id = $1', [arrivalId]);
    last = r.rows[0]?.state ?? '(missing)';
    if (wanted.includes(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`pollState(${arrivalId}): wanted ${wanted.join('|')}, still ${last}`);
}

/** A transition that HAPPENED, from the event log — for states that are
 *  transient by design, where sampling `arrivals.state` races whatever
 *  drains the queue next (the exact race that defeated the cancel leg's
 *  first determinism repair). An event row never un-happens. */
async function pollEvent(arrivalId: string, toState: string, timeoutMs = 90_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await query(
      'select count(*)::int as n from public.arrival_events where arrival_id = $1 and to_state = $2',
      [arrivalId, toState],
    );
    if (r.rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`pollEvent(${arrivalId}): no ${toState} transition recorded`);
}

// ---------------------------------------------------------------------------
// Provisioning — memoized, so the suite pays for it once, any leg can run
// alone, and a failed prerequisite reports ITSELF into every dependent leg
// instead of silently skipping them.
// ---------------------------------------------------------------------------

type Founder = {
  context: BrowserContext;
  page: Page;
  circleId: string;
  subjectId: string;
  localPart: string;
  /** Captured BEFORE the verification click — §5.1's "not before". */
  forwardingActiveBeforeVerify: unknown;
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
  await page.fill('input[name="name"]', 'Ingest Founder');
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

  const subject = await query(
    'select id, forwarding_local_part::text as lp, forwarding_active_at from public.subjects where circle_id = $1',
    [circleId],
  );
  const subjectId = subject.rows[0].id as string;
  const localPart = subject.rows[0].lp as string;
  const forwardingActiveBeforeVerify = subject.rows[0].forwarding_active_at;

  // Verify via the real mail click; the confirm route runs the activation
  // pass (B6's FWD-01 wiring). D8 condition 3: the INPUT is verified before
  // it is used — the picked message must be addressed to THIS founder, so a
  // stale or foreign Mailpit message fails here, in its own words, not
  // three layers downstream at forwarding_active_at.
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${FOUNDER_EMAIL}`)}`,
  ).then((r) => r.json());
  expect(search.messages.length).toBeGreaterThan(0);
  const picked = (
    search.messages as Array<{ ID: string; To?: Array<{ Address?: string }> }>
  ).find((m) => (m.To ?? []).some((t) => t.Address === FOUNDER_EMAIL));
  if (!picked) {
    throw new Error(
      `Mailpit search for ${FOUNDER_EMAIL} returned ${search.messages.length} message(s), none addressed to it — the run-3 wrong-message shape, refused at the pick`,
    );
  }
  const message = await fetch(`${MAILPIT}/api/v1/message/${picked.ID}`).then((r) => r.json());
  const link = String(message.Text ?? message.HTML).match(
    /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);

  // …and the OUTCOME is verified against THIS account: `verifyOtp`
  // establishes a session for whatever account the token belongs to, so a
  // wrong link would sign in someone else and every later leg would fail
  // obliquely. DB truth, not page text.
  const verified = await query(
    'select email_verified_at from public.accounts where email = $1',
    [FOUNDER_EMAIL],
  );
  if (!verified.rows[0]?.email_verified_at) {
    throw new Error(
      'the verification click did not verify THIS founder — a wrong-session confirm (the run-3 leak shape), refused at the cause',
    );
  }

  return { context, page, circleId, subjectId, localPart, forwardingActiveBeforeVerify };
}

/** The one 404 body every unauthorized/unknown artifact read answers with —
 *  memoized so the byte-identity assertions all compare against the same
 *  observation. */
let ghostMemo: Promise<string> | null = null;
function ghost404(f: Founder): Promise<string> {
  ghostMemo ??= (async () => {
    const ghost = await f.page.request.get(`/api/artifact/${randomUUID()}`);
    expect(ghost.status()).toBe(404);
    return ghost.text();
  })();
  return ghostMemo;
}

/** Upload bytes through the real TUS form; returns the arrival id. */
async function uploadArrival(f: Founder, bytes: Buffer, filename: string): Promise<string> {
  const before = await query(
    `select coalesce(max(received_at), now() - interval '1 day') as t
       from public.arrivals where circle_id = $1`,
    [f.circleId],
  );
  await f.page.goto(`/${f.circleId}/upload`);
  await f.page.setInputFiles('input[type="file"]', {
    name: filename,
    mimeType: 'application/pdf',
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

function inboundPayload(f: Founder, overrides: Record<string, unknown>, sender: string = SENDER) {
  return {
    FromFull: { Email: sender, Name: 'Front Desk' },
    OriginalRecipient: `${f.localPart}@harperscircle.app`,
    MessageID: `e2e-${randomUUID()}`,
    Subject: 'Papers',
    TextBody: 'Attached.',
    Headers: [],
    Attachments: [],
    ...overrides,
  };
}

async function postInbound(f: Founder, payload: unknown) {
  return f.page.request.post('/api/inbound/postmark', {
    headers: { authorization: INBOUND_AUTH, 'content-type': 'application/json' },
    data: payload,
  });
}

async function postAttachment(f: Founder, name: string, content: Buffer, sender: string = SENDER) {
  const res = await postInbound(
    f,
    inboundPayload(
      f,
      {
        Attachments: [
          {
            Name: name,
            ContentType: 'application/pdf',
            ContentLength: content.byteLength,
            Content: content.toString('base64'),
          },
        ],
      },
      sender,
    ),
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.action).toBe('accepted');
  const parentId = body.arrival_id as string;
  const child = await query('select id from public.arrivals where parent_arrival_id = $1', [
    parentId,
  ]);
  return { parentId, childId: child.rows[0].id as string };
}

/** The sender accepted, whichever leg needs it first: the INB leg performs
 *  and ASSERTS the flow; a leg running without it (a targeted run, or the
 *  INB leg having failed) provisions the acceptance minimally. */
async function ensureAcceptedSender(f: Founder): Promise<void> {
  const known = await query(
    'select count(*)::int as n from public.known_senders where circle_id = $1 and revoked_at is null',
    [f.circleId],
  );
  if (known.rows[0].n > 0) return;
  const { childId } = await postAttachment(f, 'provision-sender.pdf', pdfBytes('provision-sender'));
  await pollState(childId, ['held_unknown_sender']);
  await f.page.goto(`/${f.circleId}/inbox`);
  await f.page.click('button:has-text("accept this sender")');
  await f.page.waitForURL('**/inbox?accepted=1');
  await pollState(childId, ['extracting'], 15_000);
}

test.describe('the 4B ingestion leg', () => {
  test.afterAll(async () => {
    if (founderMemo) await founderMemo.then((f) => f.context.close()).catch(() => {});
  });

  test('founder → verified → forwarding ACTIVE (FWD-01 live)', async ({ browser }) => {
    const f = await theFounder(browser);
    expect(f.forwardingActiveBeforeVerify).toBeNull(); // §5.1: not before verification

    const after = await query(
      'select forwarding_active_at from public.subjects where id = $1',
      [f.subjectId],
    );
    expect(after.rows[0].forwarding_active_at).not.toBeNull();
    const logged = await query(
      `select count(*)::int as n from public.access_log
        where circle_id = $1 and event_type = 'forwarding_activated'`,
      [f.circleId],
    );
    expect(logged.rows[0].n).toBe(1);
  });

  test('TUS upload → store → scan → gate: honest states end at Reading (UPL-01 live)', async ({
    browser,
  }) => {
    // REWORKED WITH THE 6B B5 FIRE, in the same unit that lit it: the eager
    // chain no longer RESTS at `extracting` — gate fires extract, extract
    // fires interpret, and for a valid document the honest end state is
    // `Needs you`. `Reading` is now a moment, not a plateau, so the moment
    // is asserted from the EVENT LOG (it never un-happens) and the end
    // state from the surface.
    const f = await theFounder(browser);
    const valid = readFileSync(
      path.join(process.cwd(), 'fixtures', 'g9', 'development', 'dev-discharge-01.pdf'),
    );
    const bytes = Buffer.concat([valid, Buffer.from(`\n% hc-gate upl-01 ${stamp}\n`, 'latin1')]);
    const arrival = await uploadArrival(f, bytes, `discharge-${stamp}.pdf`);

    // Reading BEGAN — §4.2.2's promise, made true the moment it is made.
    await pollEvent(arrival, 'extracting');
    // …and the whole eager chain finishes without a single manual drive.
    await pollState(arrival, ['proposals_ready']);

    await f.page.goto(`/${f.circleId}/inbox`);
    const main = (await f.page.textContent('main')) ?? '';
    expect(main).toContain('Uploaded document');
    expect(main).toContain('Needs you');
  });

  test('the artifact route streams the clean original; unknown ids share the shape (RLS-10 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const bytes = pdfBytes('artifact-route');
    const arrival = await uploadArrival(f, bytes, `artifact-${stamp}.pdf`);
    // The artifact is stored at `store` and clean-gated after `scan`; the
    // event log is the stable observation (post-B5, later states are the
    // eager chain's to race through).
    await pollEvent(arrival, 'scanned');

    const res = await f.page.request.get(`/api/artifact/${arrival}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(res.headers()['cache-control']).toBe('private, no-store');
    expect(Buffer.from(await res.body()).equals(bytes)).toBe(true);

    const entry = await query(
      `select count(*)::int as n from public.access_log
        where circle_id = $1 and event_type = 'artifact_read' and object_id = $2`,
      [f.circleId, arrival],
    );
    expect(entry.rows[0].n).toBe(1); // §1.3 step 6, live

    expect(await ghost404(f)).toBeTruthy(); // one 404 body, memoized for the probes below
  });

  test('unknown sender → held VISIBLE with the §5.3 verdict; accepting releases it (INB/SAU/SND live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const { parentId, childId } = await postAttachment(f, 'papers.pdf', pdfBytes('held'));

    // store → scan (clean) → gate HOLDS: fail-closed to a person.
    await pollState(childId, ['held_unknown_sender']);
    await pollState(parentId, ['held_unknown_sender']);

    const page = f.page;
    await page.goto(`/${f.circleId}/inbox`);
    const main = (await page.textContent('main')) ?? '';
    expect(main).toContain('Held · unknown sender');
    expect(main).toContain("we couldn't confirm this came from them");
    expect(main).toMatch(/expires on/i); // the §5.4 30-day warning

    await page.click('button:has-text("accept this sender")');
    await page.waitForURL('**/inbox?accepted=1');

    // Release is in accept_sender's OWN transaction — both rows move.
    await pollState(childId, ['extracting'], 15_000);
    await pollState(parentId, ['extracting'], 15_000);
    const known = await query(
      `select count(*)::int as n from public.known_senders
        where circle_id = $1 and revoked_at is null`,
      [f.circleId],
    );
    expect(known.rows[0].n).toBe(1);
  });

  test('EICAR lands QUARANTINED — not scan_unavailable: the live four-state proof (SCN-01)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    const { childId: eicarChildId } = await postAttachment(
      f,
      'invoice.pdf',
      Buffer.from(EICAR, 'latin1'),
    );

    const state = await pollState(eicarChildId, ['quarantined', 'scan_unavailable']);
    expect(state).toBe('quarantined'); // the demonstration: verdict, not outage

    const row = await query(
      `select scan_verdict, encode(content_sha256, 'hex') as sha from public.arrivals where id = $1`,
      [eicarChildId],
    );
    expect(row.rows[0].scan_verdict).toBe('infected');

    // §11.5: the evidence row is retained and unexpiring (X1).
    const evidence = await query(
      `select verdict, expires_at from public.scan_results where content_sha256 = decode($1, 'hex')`,
      [row.rows[0].sha],
    );
    expect(evidence.rows[0]).toMatchObject({ verdict: 'infected', expires_at: null });

    // The bytes left the artifacts bucket for the no-read-grant quarantine.
    const buckets = await query(
      `select bucket_id, count(*)::int as n from storage.objects
        where name like '%' || $1 group by bucket_id`,
      [row.rows[0].sha],
    );
    expect(buckets.rows).toEqual([expect.objectContaining({ bucket_id: 'quarantine', n: 1 })]);

    // Not releasable by any read path.
    const refused = await f.page.request.get(`/api/artifact/${eicarChildId}`);
    expect(refused.status()).toBe(404);
    expect(await refused.text()).toBe(await ghost404(f));

    // The inbox says the honest thing.
    await f.page.goto(`/${f.circleId}/inbox`);
    expect((await f.page.textContent('main')) ?? '').toContain('Held · not safe to open');
  });

  test('the same bytes twice → suspect → a person resolves → the relay finishes (DUP-01 + RLY-01 live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    await ensureAcceptedSender(f);

    // First copy from the accepted sender flows through the gate and rests
    // at extracting; the SAME bytes again are a stage-1 sha duplicate.
    const dupBytes = pdfBytes('dup-pair');
    await postAttachment(f, 'papers-once.pdf', dupBytes);
    const { childId: dupChildId } = await postAttachment(f, 'papers-again.pdf', dupBytes);

    await pollState(dupChildId, ['duplicate_suspected']);

    const page = f.page;
    await page.goto(`/${f.circleId}/inbox`);
    const main = (await page.textContent('main')) ?? '';
    expect(main).toContain('Looks like a duplicate');
    await page.click('button:has-text("different")');
    await page.waitForURL('**/inbox?resolved=1');
    await pollState(dupChildId, ['scanned'], 15_000);

    // RLY-01 end-to-end: the resolve wrote an outbox row; one relay pass
    // drains it, enqueues the gate work and fires the worker. The
    // `extracting` transition is asserted from the EVENT LOG — the state
    // itself is transient once workers are draining, and an event row
    // never un-happens.
    const relay = await f.page.request.post('/api/worker/relay', {
      headers: { 'x-worker-key': WORKER_KEY },
    });
    expect(relay.status()).toBe(200);
    await pollEvent(dupChildId, 'extracting');
  });

  // 6B REWORK (ADR-0025 D8 condition 2) — the FOURTH life of this leg, each
  // on the record: the first borrowed a leftover arrival; the second made
  // its own but raced the shared queue's drains (run 2 lost a 108 ms window
  // on a 1500 ms poll); the third rested on the Q7 seam — and then B5's
  // eager fire, landing in this same increment, closed that seam for every
  // gate-fired path. The one route INTO the §4.5 window with no eager fire
  // is the accept-sender RELEASE (held → extracting in accept's own
  // transaction, nothing fired), which is also the §4.5 story at its most
  // real: mail a person had to admit, cancelled before the machinery read
  // it. The leg still CANCELS FIRST and then drives `/api/worker/extract`
  // ITSELF — the cancel beat the reading, and the machinery honours it by
  // absorbing the queued work and writing NOTHING.
  test('cancel closes the member window honestly (§4.5 live)', async ({ browser }) => {
    const f = await theFounder(browser);
    // A distinct sender, so this leg's mail HOLDS whatever its siblings
    // accepted — and a BODILESS email (no attachments), so the PARENT is
    // the one arrival: the inbox row, the cancel form and the queued
    // extract work all name the same id. The body carries readable content,
    // so what the cancel beats is a read that would otherwise have
    // completed to proposals.
    const cancelSender = `records.${stamp}@cardiology-example.org`;
    const res = await postInbound(
      f,
      inboundPayload(
        f,
        { TextBody: 'Amoxicillin 500 mg twice daily. Call the front desk with questions.' },
        cancelSender,
      ),
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('accepted');
    const target = body.arrival_id as string;
    await pollState(target, ['held_unknown_sender']);

    // The person admits the sender; the release lands the arrival at
    // `extracting` in accept_sender's OWN transaction — queued, unfired
    // (the release is the one route into the window with no eager fire).
    await f.page.goto(`/${f.circleId}/inbox`);
    await f.page.click('button:has-text("accept this sender")');
    await f.page.waitForURL('**/inbox?accepted=1');
    expect(await pollState(target, ['extracting'], 15_000)).toBe('extracting');

    // The person cancels while the window is open.
    await f.page.goto(`/${f.circleId}/inbox`);
    await f.page
      .locator(`form[action$="/inbox/cancel/submit"]:has(input[value="${target}"])`)
      .locator('button')
      .click();
    await f.page.waitForURL('**/inbox?cancelled=1');
    const cancelled = await query(
      `select state::text as s from public.arrivals where id = $1`,
      [target],
    );
    expect(cancelled.rows[0].s).toBe('cancelled');

    // THEN the leg drives the extract worker itself (D8 condition 2): the
    // queued message meets a cancelled arrival, the claim refuses, and
    // nothing is written — the §4.5 guarantee, demonstrated rather than
    // implied by the absence of a race.
    const drive = await f.page.request.post('/api/worker/extract', {
      headers: { 'x-worker-key': WORKER_KEY },
    });
    expect(drive.status()).toBe(200);
    const afterDrive = await query(
      `select
         (select state::text from public.arrivals where id = $1) as s,
         (select count(*)::int from public.extractions where arrival_id = $1) as facts,
         (select count(*)::int from public.proposals where arrival_id = $1) as proposals`,
      [target],
    );
    expect(afterDrive.rows[0]).toEqual({ s: 'cancelled', facts: 0, proposals: 0 });
  });

  test('below the cliff: a family-tier member sees NOTHING (Q6 probed live)', async ({
    browser,
  }) => {
    const f = await theFounder(browser);
    // The probe needs a REAL arrival whose artifact EXISTS — its own, so
    // this leg runs alone (the targeted-run condition) and the family 404
    // below is authorization, never absence.
    const cliffBytes = pdfBytes('below-cliff');
    const probeArrival = await uploadArrival(f, cliffBytes, `cliff-${stamp}.pdf`);
    // Stored + clean-gated is all the probe needs; the event log is the
    // stable observation post-B5.
    await pollEvent(probeArrival, 'scanned');
    const founderSees = await f.page.request.get(`/api/artifact/${probeArrival}`);
    expect(founderSees.status()).toBe(200);

    // Invite at family tier (summary-only start — far below manage×5).
    const page = f.page;
    await page.goto(`/${f.circleId}/invite`);
    await page.fill('input[name="invited_email"]', FAMILY_EMAIL);
    await page.check('input[name="tier"][value="family"]');
    await page.locator('input[name="subject_ids"]').first().check();
    await page.click('button[type="submit"]');
    await page.waitForURL('**/invite/created');
    const acceptUrl = (await page.locator('.mono-address').textContent())!.trim();

    const familyContext = await browser.newContext();
    try {
      const familyPage = await familyContext.newPage();
      await familyPage.goto(acceptUrl.replace(/^https?:\/\/[^/]+/, ''));
      await familyPage.click(`a[href*="/create-account?invite="]`);
      await familyPage.fill('input[name="name"]', 'Family Member');
      await familyPage.fill('input[name="password"]', PASSWORD);
      await familyPage.click('button[type="submit"]');
      await familyPage.waitForURL('**/accept/**');
      await familyPage.click('button[type="submit"]');
      await familyPage.waitForURL(`**/${f.circleId}/timeline`);

      // The inbox: zero rows, no processing affordance, no existence leak —
      // the empty state shows the caller's view, never the world's.
      await familyPage.goto(`/${f.circleId}/inbox`);
      const main = (await familyPage.textContent('main')) ?? '';
      expect(main).not.toContain('Uploaded document');
      expect(main).not.toContain('Held');
      expect(main).not.toContain('accept this sender');

      // And the artifact of a REAL arrival answers the ghost's exact bytes.
      const probe = await familyPage.request.get(`/api/artifact/${probeArrival}`);
      expect(probe.status()).toBe(404);
      expect(await probe.text()).toBe(await ghost404(f));
    } finally {
      await familyContext.close();
    }
  });
});
