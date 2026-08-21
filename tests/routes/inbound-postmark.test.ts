import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B2 · /api/inbound/postmark — the §5.2 six steps LITERALLY, the §5.4
// bounce/drop table via M3's enumerated outcomes, and 200 BEFORE any
// processing (INB-01; QTA-01 app half).
//
// Test class: MOCKED ROUTE CONTRACT — call order and refusal shapes over
// mocked wrappers; the live authority is tests/hc/ingest.test.ts (DB) and
// the B9 gate leg (browser truth). A mocked order assertion is never
// described as live-authority proof.
//
//   1. Verify the provider's signature and source. Unsigned ⇒ 401.
//      Secret unconfigured ⇒ 503 — disabled, never open.
//   2. Resolve local part → subject. No match ⇒ blocked (the 550 lives
//      at the provider; this branch is defence in depth). An inactive
//      address is provisioning DRIFT — blocked and visible, never
//      absorbed.
//   3. Quota (§5.4): aligned ⇒ readable bounce · unauthenticated ⇒
//      DROPPED, never bounced (no backscatter) · capacity ⇒ bounce
//      naming the limit. The monthly ceiling NOTIFIES, never refuses.
//   4. Verdict evaluated (§5.3, B1's adapter), stored verbatim;
//      lookalike via M3 overrides the stored result.
//   5. hc.create_arrival parent + one child per attachment, ONE
//      transaction; bytes staged durably BEFORE the 200.
//   6. Enqueue; eager worker fire rides after() — strictly post-response.
// ============================================================================

const calls: string[] = [];

const ingest = {
  resolveForwarding: vi.fn(),
  checkQuota: vi.fn(),
  senderLookalike: vi.fn(),
  createEmailArrivals: vi.fn(),
  enqueuePipeline: vi.fn(),
  activateForwarding: vi.fn(),
};
vi.mock('@/lib/hc/ingest', () => ingest);

const storage = { stageIntakeObject: vi.fn() };
vi.mock('@/lib/storage/artifacts', () => storage);

const outbound = { sendQuotaBounce: vi.fn() };
vi.mock('@/lib/mail/outbound', () => outbound);

const afterCallbacks: Array<() => unknown> = [];
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    afterCallbacks.push(fn);
  },
}));

const SECRET = 's'.repeat(48);
const WORKER_KEY = 'w'.repeat(48);
const AUTH = 'Basic ' + Buffer.from(`postmark:${SECRET}`).toString('base64');

const RESOLVED = {
  circle_id: '11111111-0000-4000-8000-000000000001',
  subject_id: '22222222-0000-4000-8000-000000000002',
  forwarding_active: true,
};
const LIMITS = { attachments_per_email: 20, file_bytes_max: 52428800, file_pages_max: 200 };
const QUOTA_OK = { outcome: 'ok', monthly_ceiling_reached: false, limits: LIMITS };

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    FromFull: { Email: 'front-desk@cardiology.org', Name: 'Front Desk' },
    OriginalRecipient: 'nell.a7f3k2@harperscircle.app',
    MessageID: 'mid-b2-0001',
    Subject: 'Discharge summary',
    TextBody: 'Attached.',
    Headers: [],
    Attachments: [
      { Name: 'summary.pdf', ContentType: 'application/pdf', ContentLength: 6, Content: 'JVBERi0=' },
    ],
    DmarcResult: { Result: 'pass' }, // provider fields: aligned by default
    ...overrides,
  };
}

function req(body: unknown, headers: Record<string, string> = { authorization: AUTH }): Request {
  return new Request('http://local.test/api/inbound/postmark', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

type RouteModule = { POST: (r: Request) => Promise<Response> };
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => new Response('ok'));

beforeEach(async () => {
  vi.resetAllMocks();
  calls.length = 0;
  afterCallbacks.length = 0;
  ingest.resolveForwarding.mockImplementation(async () => {
    calls.push('resolve');
    return RESOLVED;
  });
  ingest.checkQuota.mockImplementation(async () => {
    calls.push('quota');
    return QUOTA_OK;
  });
  ingest.senderLookalike.mockImplementation(async () => {
    calls.push('lookalike');
    return { lookalike: false, similar_to: null };
  });
  ingest.createEmailArrivals.mockImplementation(async () => {
    calls.push('create');
    return { parentId: 'p-1', childIds: ['c-1'] };
  });
  ingest.enqueuePipeline.mockImplementation(async () => {
    calls.push('enqueue');
  });
  storage.stageIntakeObject.mockImplementation(async () => {
    calls.push('stage');
  });
  outbound.sendQuotaBounce.mockImplementation(async () => {
    calls.push('bounce');
  });
  for (const k of [
    'POSTMARK_INBOUND_SECRET',
    'HC_AUTHSERV_ID',
    'HC_TRUSTED_HOP',
    'HC_WORKER_KEY',
  ]) {
    savedEnv[k] = process.env[k];
  }
  process.env.POSTMARK_INBOUND_SECRET = SECRET;
  process.env.HC_AUTHSERV_ID = 'inbound.harperscircle.app';
  process.env.HC_TRUSTED_HOP = 'inbound.harperscircle.app';
  process.env.HC_WORKER_KEY = WORKER_KEY;
  vi.stubGlobal('fetch', fetchMock);
  route = (await import('@/app/api/inbound/postmark/route')) as RouteModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('B2 · step 1 — signature before anything', () => {
  it('secret unconfigured ⇒ 503, disabled never open; nothing touched', async () => {
    delete process.env.POSTMARK_INBOUND_SECRET;
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it('missing or wrong credentials ⇒ 401, nothing touched', async () => {
    for (const headers of [
      {},
      { authorization: 'Basic ' + Buffer.from('postmark:wrong').toString('base64') },
      { authorization: 'Bearer nope' },
    ] as Record<string, string>[]) {
      const res = await route.POST(req(basePayload(), headers));
      expect(res.status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('malformed JSON ⇒ 400 after the signature check', async () => {
    const res = await route.POST(req('{not json'));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('B2 · step 2 — resolve, and the drift branches', () => {
  it('unknown local part ⇒ blocked; quota never consulted', async () => {
    ingest.resolveForwarding.mockImplementationOnce(async () => {
      calls.push('resolve');
      return null;
    });
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ action: 'blocked', reason: 'unknown_recipient' });
    expect(calls).toEqual(['resolve']);
  });

  it('an inactive address is provisioning drift — blocked, visible, never absorbed', async () => {
    ingest.resolveForwarding.mockImplementationOnce(async () => {
      calls.push('resolve');
      return { ...RESOLVED, forwarding_active: false };
    });
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ action: 'blocked', reason: 'inactive_address' });
    expect(calls).toEqual(['resolve']);
  });

  it('no recipient at all ⇒ blocked the same way', async () => {
    const res = await route.POST(
      req(basePayload({ OriginalRecipient: undefined, ToFull: [] })),
    );
    expect(res.status).toBe(403);
    expect(ingest.resolveForwarding).not.toHaveBeenCalled();
  });
});

describe('B2 · step 3 — the §5.4 bounce/drop table', () => {
  it('over quota + DMARC-aligned ⇒ a bounce the sender can read; nothing stored', async () => {
    ingest.checkQuota.mockImplementationOnce(async () => {
      calls.push('quota');
      return { ...QUOTA_OK, outcome: 'over_sender' };
    });
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: 'bounced', reason: 'over_sender' });
    expect(outbound.sendQuotaBounce).toHaveBeenCalledTimes(1);
    expect(ingest.createEmailArrivals).not.toHaveBeenCalled();
    expect(storage.stageIntakeObject).not.toHaveBeenCalled();
  });

  it('over quota + unauthenticated ⇒ DROPPED — not stored, not bounced, no backscatter', async () => {
    ingest.checkQuota.mockImplementationOnce(async () => {
      calls.push('quota');
      return { ...QUOTA_OK, outcome: 'over_sender' };
    });
    const res = await route.POST(
      req(basePayload({ DmarcResult: { Result: 'fail' } })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: 'dropped', reason: 'over_sender' });
    expect(outbound.sendQuotaBounce).not.toHaveBeenCalled();
    expect(ingest.createEmailArrivals).not.toHaveBeenCalled();
  });

  it('over capacity + aligned ⇒ the bounce names the limit in plain words', async () => {
    ingest.checkQuota.mockImplementationOnce(async () => {
      calls.push('quota');
      return { ...QUOTA_OK, outcome: 'over_capacity' };
    });
    const res = await route.POST(req(basePayload()));
    expect(await res.json()).toMatchObject({ action: 'bounced', reason: 'over_capacity' });
    const [args] = outbound.sendQuotaBounce.mock.calls[0];
    expect(String(args.reasonText)).toMatch(/storage limit/i);
  });

  it('too many attachments rides the same table (aligned ⇒ bounce)', async () => {
    ingest.checkQuota.mockImplementationOnce(async () => {
      calls.push('quota');
      return { ...QUOTA_OK, limits: { ...LIMITS, attachments_per_email: 1 } };
    });
    const res = await route.POST(
      req(
        basePayload({
          Attachments: [
            { Name: 'a.pdf', ContentType: 'application/pdf', ContentLength: 3, Content: 'AAA=' },
            { Name: 'b.pdf', ContentType: 'application/pdf', ContentLength: 3, Content: 'AAA=' },
          ],
        }),
      ),
    );
    expect(await res.json()).toMatchObject({ action: 'bounced', reason: 'over_attachments' });
    expect(ingest.createEmailArrivals).not.toHaveBeenCalled();
  });

  it('a single over-size file rides the same table (unauthenticated ⇒ drop)', async () => {
    const res = await route.POST(
      req(
        basePayload({
          DmarcResult: { Result: 'fail' },
          Attachments: [
            {
              Name: 'big.pdf',
              ContentType: 'application/pdf',
              ContentLength: 52428801,
              Content: 'AAA=',
            },
          ],
        }),
      ),
    );
    expect(await res.json()).toMatchObject({ action: 'dropped', reason: 'over_file_size' });
    expect(outbound.sendQuotaBounce).not.toHaveBeenCalled();
  });

  it('the monthly ceiling NOTIFIES and never turns the outcome', async () => {
    ingest.checkQuota.mockImplementationOnce(async () => {
      calls.push('quota');
      return { ...QUOTA_OK, monthly_ceiling_reached: true };
    });
    const res = await route.POST(req(basePayload()));
    const body = await res.json();
    expect(body.action).toBe('accepted');
    expect(body.monthly_ceiling_reached).toBe(true);
  });
});

describe('B2 · steps 4–6 — verdict verbatim, one transaction, 200 before processing', () => {
  it('the happy path runs the six steps in order and accepts', async () => {
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ action: 'accepted', arrival_id: 'p-1', children: 1 });
    expect(calls).toEqual(['resolve', 'quota', 'lookalike', 'create', 'stage', 'stage', 'enqueue']);
  });

  it('the verdict is stored VERBATIM (§5.2 step 4): result + detail reach create', async () => {
    await route.POST(req(basePayload()));
    const [input] = ingest.createEmailArrivals.mock.calls[0];
    expect(input.authResult).toBe('authenticated');
    expect(input.authDetail.method).toBe('provider_fields');
    expect(input.senderAddress).toBe('front-desk@cardiology.org');
    expect(input.messageId).toBe('mid-b2-0001');
    expect(input.attachments).toEqual([
      { contentType: 'application/pdf', contentLength: 6 },
    ]);
  });

  it('a lookalike domain overrides the stored result — MORE suspicious, never less (§5.3)', async () => {
    ingest.senderLookalike.mockImplementationOnce(async () => {
      calls.push('lookalike');
      return { lookalike: true, similar_to: 'cardiology.org' };
    });
    await route.POST(req(basePayload({ FromFull: { Email: 'desk@cardio1ogy.org', Name: '' } })));
    const [input] = ingest.createEmailArrivals.mock.calls[0];
    expect(input.authResult).toBe('lookalike');
    expect(input.authDetail.lookalike).toMatchObject({ similar_to: 'cardiology.org' });
  });

  it('bytes are staged durably BEFORE the 200 — parent source + each attachment', async () => {
    await route.POST(req(basePayload()));
    expect(storage.stageIntakeObject).toHaveBeenCalledTimes(2);
    const staged = storage.stageIntakeObject.mock.calls.map((c) => c[1]);
    expect(staged).toContain('p-1');
    expect(staged).toContain('c-1');
  });

  it('the eager worker fire is strictly POST-response (after()), keyed, and a dropped fire is only a delay', async () => {
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing fired before the response
    for (const cb of afterCallbacks) await cb();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('http://local.test/api/worker/store');
    expect((init.headers as Record<string, string>)['x-worker-key']).toBe(WORKER_KEY);
  });

  it('without a worker key the fire is skipped silently — the sweeper is the recovery story', async () => {
    delete process.env.HC_WORKER_KEY;
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(200);
    for (const cb of afterCallbacks) await cb();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a staging failure surfaces as 500 — Postmark retries, intake replays idempotently', async () => {
    storage.stageIntakeObject.mockRejectedValueOnce(new Error('storage down'));
    const res = await route.POST(req(basePayload()));
    expect(res.status).toBe(500);
    expect(ingest.enqueuePipeline).not.toHaveBeenCalled();
  });
});
