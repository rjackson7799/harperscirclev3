import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
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

const CLEAN_PDF = Buffer.from(`%PDF-1.4\n% ingestion-leg ${stamp}\n%%EOF\n`);
const HELD_PDF = Buffer.from(`%PDF-1.4\n% held-then-released ${stamp}\n%%EOF\n`);

let founderContext: BrowserContext;
let founderPage: Page;
let circleId = '';
let subjectId = '';
let localPart = '';
let uploadArrivalId = '';
let heldChildId = '';
let heldParentId = '';
let ghost404 = '';

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

function inboundPayload(overrides: Record<string, unknown>) {
  return {
    FromFull: { Email: SENDER, Name: 'Front Desk' },
    OriginalRecipient: `${localPart}@harperscircle.app`,
    MessageID: `e2e-${randomUUID()}`,
    Subject: 'Papers',
    TextBody: 'Attached.',
    Headers: [],
    Attachments: [],
    ...overrides,
  };
}

async function postInbound(payload: unknown) {
  return founderPage.request.post('/api/inbound/postmark', {
    headers: { authorization: INBOUND_AUTH, 'content-type': 'application/json' },
    data: payload,
  });
}

test.describe.serial('the 4B ingestion leg', () => {
  test('founder → verified → forwarding ACTIVE (FWD-01 live)', async ({ browser }) => {
    founderContext = await browser.newContext();
    const page = (founderPage = await founderContext.newPage());
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
    circleId = new URL(page.url()).searchParams.get('circle')!;
    await page.check('input[name="context"][value="paperwork-piling-up"]');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/setup/step/4**');

    const subject = await query(
      'select id, forwarding_local_part::text as lp, forwarding_active_at from public.subjects where circle_id = $1',
      [circleId],
    );
    subjectId = subject.rows[0].id;
    localPart = subject.rows[0].lp;
    expect(subject.rows[0].forwarding_active_at).toBeNull(); // §5.1: not before verification

    // Verify via the real mail click; the confirm route runs the
    // activation pass (B6's FWD-01 wiring).
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${FOUNDER_EMAIL}`)}`,
    ).then((r) => r.json());
    expect(search.messages.length).toBeGreaterThan(0);
    const message = await fetch(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`).then((r) =>
      r.json(),
    );
    const link = String(message.Text ?? message.HTML).match(
      /https?:\/\/[^\s"'<>]+(?:verify|confirm)[^\s"'<>]*/,
    )?.[0];
    expect(link).toBeTruthy();
    await page.goto(link!);

    const after = await query(
      'select forwarding_active_at from public.subjects where id = $1',
      [subjectId],
    );
    expect(after.rows[0].forwarding_active_at).not.toBeNull();
    const logged = await query(
      `select count(*)::int as n from public.access_log
        where circle_id = $1 and event_type = 'forwarding_activated'`,
      [circleId],
    );
    expect(logged.rows[0].n).toBe(1);
  });

  test('TUS upload → store → scan → gate: honest states end at Reading (UPL-01 live)', async () => {
    const page = founderPage;
    await page.goto(`/${circleId}/upload`);
    await page.setInputFiles('input[type="file"]', {
      name: `discharge-${stamp}.pdf`,
      mimeType: 'application/pdf',
      buffer: CLEAN_PDF,
    });
    await page.click('button:has-text("Upload")');
    await expect(page.locator('[role="status"]')).toContainText('is in', { timeout: 60_000 });

    const arrival = await query(
      `select id from public.arrivals where circle_id = $1 and channel = 'upload'`,
      [circleId],
    );
    expect(arrival.rows).toHaveLength(1);
    uploadArrivalId = arrival.rows[0].id;

    // The eager chain (upload complete → store → scan via clamd → gate;
    // uploads PASS the gate) rests at extracting — the Q7 seam.
    await pollState(uploadArrivalId, ['extracting']);

    await page.goto(`/${circleId}/inbox`);
    const main = (await page.textContent('main')) ?? '';
    expect(main).toContain('Uploaded document');
    expect(main).toContain('Reading');
  });

  test('the artifact route streams the clean original; unknown ids share the shape (RLS-10 live)', async () => {
    const res = await founderPage.request.get(`/api/artifact/${uploadArrivalId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(res.headers()['cache-control']).toBe('private, no-store');
    expect(Buffer.from(await res.body()).equals(CLEAN_PDF)).toBe(true);

    const entry = await query(
      `select count(*)::int as n from public.access_log
        where circle_id = $1 and event_type = 'artifact_read' and object_id = $2`,
      [circleId, uploadArrivalId],
    );
    expect(entry.rows[0].n).toBe(1); // §1.3 step 6, live

    const ghost = await founderPage.request.get(`/api/artifact/${randomUUID()}`);
    expect(ghost.status()).toBe(404);
    ghost404 = await ghost.text();
  });

  test('unknown sender → held VISIBLE with the §5.3 verdict; accepting releases it (INB/SAU/SND live)', async () => {
    const res = await postInbound(
      inboundPayload({
        Attachments: [
          {
            Name: 'papers.pdf',
            ContentType: 'application/pdf',
            ContentLength: HELD_PDF.byteLength,
            Content: HELD_PDF.toString('base64'),
          },
        ],
      }),
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('accepted');
    heldParentId = body.arrival_id;

    const child = await query(
      'select id from public.arrivals where parent_arrival_id = $1',
      [heldParentId],
    );
    heldChildId = child.rows[0].id;

    // store → scan (clean) → gate HOLDS: fail-closed to a person.
    await pollState(heldChildId, ['held_unknown_sender']);
    await pollState(heldParentId, ['held_unknown_sender']);

    const page = founderPage;
    await page.goto(`/${circleId}/inbox`);
    const main = (await page.textContent('main')) ?? '';
    expect(main).toContain('Held · unknown sender');
    expect(main).toContain("we couldn't confirm this came from them");
    expect(main).toMatch(/expires on/i); // the §5.4 30-day warning

    await page.click('button:has-text("accept this sender")');
    await page.waitForURL('**/inbox?accepted=1');

    // Release is in accept_sender's OWN transaction — both rows move.
    await pollState(heldChildId, ['extracting'], 15_000);
    await pollState(heldParentId, ['extracting'], 15_000);
    const known = await query(
      `select count(*)::int as n from public.known_senders
        where circle_id = $1 and revoked_at is null`,
      [circleId],
    );
    expect(known.rows[0].n).toBe(1);
  });

  test('EICAR lands QUARANTINED — not scan_unavailable: the live four-state proof (SCN-01)', async () => {
    const res = await postInbound(
      inboundPayload({
        Attachments: [
          {
            Name: 'invoice.pdf',
            ContentType: 'application/pdf',
            ContentLength: EICAR.length,
            Content: Buffer.from(EICAR, 'latin1').toString('base64'),
          },
        ],
      }),
    );
    expect(res.status()).toBe(200);
    const parentId = (await res.json()).arrival_id as string;
    const child = await query('select id from public.arrivals where parent_arrival_id = $1', [
      parentId,
    ]);
    const eicarChildId = child.rows[0].id as string;

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
    const refused = await founderPage.request.get(`/api/artifact/${eicarChildId}`);
    expect(refused.status()).toBe(404);
    expect(await refused.text()).toBe(ghost404);

    // The inbox says the honest thing.
    await founderPage.goto(`/${circleId}/inbox`);
    expect((await founderPage.textContent('main')) ?? '').toContain('Held · not safe to open');
  });

  test('the same bytes twice → suspect → a person resolves → the relay finishes (DUP-01 + RLY-01 live)', async () => {
    const res = await postInbound(
      inboundPayload({
        Attachments: [
          {
            Name: 'papers-again.pdf',
            ContentType: 'application/pdf',
            ContentLength: HELD_PDF.byteLength,
            Content: HELD_PDF.toString('base64'),
          },
        ],
      }),
    );
    const parentId = (await res.json()).arrival_id as string;
    const child = await query('select id from public.arrivals where parent_arrival_id = $1', [
      parentId,
    ]);
    const dupChildId = child.rows[0].id as string;

    await pollState(dupChildId, ['duplicate_suspected']);

    const page = founderPage;
    await page.goto(`/${circleId}/inbox`);
    const main = (await page.textContent('main')) ?? '';
    expect(main).toContain('Looks like a duplicate');
    await page.click('button:has-text("different")');
    await page.waitForURL('**/inbox?resolved=1');
    await pollState(dupChildId, ['scanned'], 15_000);

    // RLY-01 end-to-end: the resolve wrote an outbox row; one relay pass
    // drains it, enqueues the gate work and fires the worker.
    const relay = await founderPage.request.post('/api/worker/relay', {
      headers: { 'x-worker-key': WORKER_KEY },
    });
    expect(relay.status()).toBe(200);
    await pollState(dupChildId, ['extracting']);
  });

  // 5B AMENDS this leg, and the reason is the slice: §4.5's cancel window is
  // `extracting | extracted | interpreting`, and until 5B NOTHING consumed
  // those states — every arrival this spec had driven simply RESTED at
  // `extracting`, so "click the first cancel form on the inbox" always found
  // one. Now the pipeline continues to `proposals_ready`, where cancel is
  // correctly no longer offered: the work is done and proposals are waiting
  // for a person. The product is right; the leg's assumption was the seam.
  //
  // So the leg now MAKES its own in-window arrival instead of borrowing a
  // leftover. The gate stage enqueues extract without firing it, so an
  // arrival driven to `extracting` stays there until something drains the
  // queue — which makes this deterministic rather than a race.
  test('cancel closes the member window honestly (§4.5 live)', async () => {
    const page = founderPage;
    const CANCEL_PDF = Buffer.from(`%PDF-1.4\n% cancel-leg ${stamp}\n%%EOF\n`);
    await page.goto(`/${circleId}/upload`);
    await page.setInputFiles('input[type="file"]', {
      name: `cancel-${stamp}.pdf`,
      mimeType: 'application/pdf',
      buffer: CANCEL_PDF,
    });
    await page.click('button:has-text("Upload")');
    await expect(page.locator('[role="status"]')).toContainText('is in', { timeout: 60_000 });

    const made = await query(
      `select id from public.arrivals
        where circle_id = $1 and channel = 'upload'
        order by received_at desc limit 1`,
      [circleId],
    );
    const target = made.rows[0].id as string;
    for (const stage of ['store', 'scan', 'gate']) {
      await page.request.post(`/api/worker/${stage}`, {
        headers: { 'x-worker-key': WORKER_KEY },
      });
    }
    expect(await pollState(target, ['extracting'])).toBe('extracting');

    await page.goto(`/${circleId}/inbox`);
    await page
      .locator(`form[action$="/inbox/cancel/submit"]:has(input[value="${target}"])`)
      .locator('button')
      .click();
    await page.waitForURL('**/inbox?cancelled=1');
    const cancelled = await query(
      `select state::text as s from public.arrivals where id = $1`,
      [target],
    );
    expect(cancelled.rows[0].s).toBe('cancelled');
  });

  test('below the cliff: a family-tier member sees NOTHING (Q6 probed live)', async ({
    browser,
  }) => {
    // Invite at family tier (summary-only start — far below manage×5).
    const page = founderPage;
    await page.goto(`/${circleId}/invite`);
    await page.fill('input[name="invited_email"]', FAMILY_EMAIL);
    await page.check('input[name="tier"][value="family"]');
    await page.locator('input[name="subject_ids"]').first().check();
    await page.click('button[type="submit"]');
    await page.waitForURL('**/invite/created');
    const acceptUrl = (await page.locator('.mono-address').textContent())!.trim();

    const familyContext = await browser.newContext();
    const familyPage = await familyContext.newPage();
    await familyPage.goto(acceptUrl.replace(/^https?:\/\/[^/]+/, ''));
    await familyPage.click(`a[href*="/create-account?invite="]`);
    await familyPage.fill('input[name="name"]', 'Family Member');
    await familyPage.fill('input[name="password"]', PASSWORD);
    await familyPage.click('button[type="submit"]');
    await familyPage.waitForURL('**/accept/**');
    await familyPage.click('button[type="submit"]');
    await familyPage.waitForURL(`**/${circleId}/timeline`);

    // The inbox: zero rows, no processing affordance, no existence leak —
    // the empty state shows the caller's view, never the world's.
    await familyPage.goto(`/${circleId}/inbox`);
    const main = (await familyPage.textContent('main')) ?? '';
    expect(main).not.toContain('Uploaded document');
    expect(main).not.toContain('Held');
    expect(main).not.toContain('accept this sender');

    // And the artifact of a REAL arrival answers the ghost's exact bytes.
    const probe = await familyPage.request.get(`/api/artifact/${uploadArrivalId}`);
    expect(probe.status()).toBe(404);
    expect(await probe.text()).toBe(ghost404);
    await familyContext.close();
  });
});
