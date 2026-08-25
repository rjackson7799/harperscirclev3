import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B5 · /api/worker/relay — RLY-01's app half (TSD §1.4, §4.2 as amended
// by A6, §4.11; OBX-01's consumer): hc.outbox_drain → pgmq enqueue →
// hc.outbox_ack (a crash between drain and ack re-delivers — the DB
// window; the LIVE half is tests/hc/relay.test.ts), plus the per-minute
// sweeper pass whose requeue listing becomes queue messages + eager
// fires.
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const workers = {
  outboxDrain: vi.fn(),
  outboxAck: vi.fn(),
  sweeperPass: vi.fn(),
  sendPipelineWork: vi.fn(),
  lookupLineage: vi.fn(),
  releaseDeferredWork: vi.fn(),
};
vi.mock('@/lib/hc/workers', () => workers);

const WORKER_KEY = 'w'.repeat(48);
const CRON_SECRET = 'c'.repeat(48);
const CIRCLE = '11111111-0000-4000-8000-000000000001';

function post(headers: Record<string, string> = { 'x-worker-key': WORKER_KEY }) {
  return new Request('http://local.test/api/worker/relay', { method: 'POST', headers });
}
function get(headers: Record<string, string> = { authorization: `Bearer ${CRON_SECRET}` }) {
  return new Request('http://local.test/api/worker/relay', { method: 'GET', headers });
}

type RouteModule = {
  POST: (r: Request) => Promise<Response>;
  GET: (r: Request) => Promise<Response>;
};
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => new Response('ok'));

beforeEach(async () => {
  vi.resetAllMocks();
  workers.outboxDrain.mockResolvedValue([]);
  workers.outboxAck.mockResolvedValue(0);
  workers.sweeperPass.mockResolvedValue({
    expired_leases: 0,
    terminalized: [],
    requeue: [],
    stuck: [],
    queue_age_alert: false,
  });
  workers.sendPipelineWork.mockResolvedValue(undefined);
  workers.lookupLineage.mockResolvedValue({ circle_id: CIRCLE, channel: 'email' });
  workers.releaseDeferredWork.mockResolvedValue(0);
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  savedEnv.CRON_SECRET = process.env.CRON_SECRET;
  process.env.HC_WORKER_KEY = WORKER_KEY;
  process.env.CRON_SECRET = CRON_SECRET;
  vi.stubGlobal('fetch', fetchMock);
  route = (await import('@/app/api/worker/relay/route')) as RouteModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('B5 · both invokers, both gated (the security-actions posture)', () => {
  it('POST: key unset ⇒ 503; wrong ⇒ 403; nothing drained', async () => {
    delete process.env.HC_WORKER_KEY;
    expect((await route.POST(post())).status).toBe(503);
    process.env.HC_WORKER_KEY = WORKER_KEY;
    expect((await route.POST(post({ 'x-worker-key': 'nope' }))).status).toBe(403);
    expect(workers.outboxDrain).not.toHaveBeenCalled();
  });

  it('GET (the Vercel cron): secret unset ⇒ 503; wrong bearer ⇒ 403', async () => {
    delete process.env.CRON_SECRET;
    expect((await route.GET(get())).status).toBe(503);
    process.env.CRON_SECRET = CRON_SECRET;
    expect((await route.GET(get({ authorization: 'Bearer wrong' }))).status).toBe(403);
    expect(workers.outboxDrain).not.toHaveBeenCalled();
  });
});

describe('B5 · the outbox leg: drain → enqueue → ack, at-least-once', () => {
  it('drained rows become queue messages with their archive lineage, then ack — in that order', async () => {
    const order: string[] = [];
    workers.outboxDrain.mockImplementationOnce(async () => {
      order.push('drain');
      return [
        { outboxId: 'ob-1', arrivalId: 'a-1', stage: 'gate' },
        { outboxId: 'ob-2', arrivalId: 'a-2', stage: 'extract' },
      ];
    });
    workers.sendPipelineWork.mockImplementation(async (m: { arrival_id: string }) => {
      order.push(`send:${m.arrival_id}`);
    });
    workers.outboxAck.mockImplementation(async (ids: string[]) => {
      order.push(`ack:${ids.sort().join(',')}`);
      return ids.length;
    });

    const res = await route.POST(post());
    expect(res.status).toBe(200);
    expect(order).toEqual(['drain', 'send:a-1', 'send:a-2', 'ack:ob-1,ob-2']);

    const sent = workers.sendPipelineWork.mock.calls.map((c) => c[0]);
    expect(sent[0]).toMatchObject({
      circle_id: CIRCLE,
      arrival_id: 'a-1',
      stage: 'gate',
      channel: 'email',
    });
    expect(sent[1]).toMatchObject({ arrival_id: 'a-2', stage: 'extract' });
  });

  it('a drained row whose arrival moved on (null stage) is acked WITHOUT a send — stale, not work', async () => {
    workers.outboxDrain.mockResolvedValueOnce([
      { outboxId: 'ob-3', arrivalId: 'a-3', stage: null },
    ]);
    await route.POST(post());
    expect(workers.sendPipelineWork).not.toHaveBeenCalled();
    expect(workers.outboxAck).toHaveBeenCalledWith(['ob-3']);
  });

  it('a failed enqueue leaves that row UNACKED — the 300 s window re-delivers it (OBX-01)', async () => {
    workers.outboxDrain.mockResolvedValueOnce([
      { outboxId: 'ob-4', arrivalId: 'a-4', stage: 'gate' },
      { outboxId: 'ob-5', arrivalId: 'a-5', stage: 'gate' },
    ]);
    workers.sendPipelineWork.mockRejectedValueOnce(new Error('pgmq down'));
    const res = await route.POST(post());
    expect(res.status).toBe(200);
    expect(workers.outboxAck).toHaveBeenCalledWith(['ob-5']);
  });

  // 5B B7 AMENDS this row. The 4B seam was "extract/interpret are enqueued
  // and never fired, because nothing consumes them". Both are consumed now,
  // so the assertion inverts: every stage present in a pass is fired once,
  // extract and interpret included. Amending it rather than deleting it keeps
  // the flip legible where the seam was recorded.
  //
  // The limit recorded at round-16 sign-off (R8/F-5, D14/D24) CLOSED at
  // 6B B5: the eager `gate → extract` fire landed BEHIND its
  // arrival-received signal (the Care Inbox revalidates), so extraction no
  // longer waits for the once-a-minute queue tick. The extract case below,
  // once forward-compat, now pins live behaviour — the relay remains the
  // recovery path for a dropped fire (§1.4: a dropped eager fire is a
  // delay, never a loss).
  it('EVERY stage present in the pass is eager-fired once each — the seam is consumed', async () => {
    workers.outboxDrain.mockResolvedValueOnce([
      { outboxId: 'ob-6', arrivalId: 'a-6', stage: 'gate' },
      { outboxId: 'ob-7', arrivalId: 'a-7', stage: 'gate' },
      { outboxId: 'ob-8', arrivalId: 'a-8', stage: 'extract' },
    ]);
    await route.POST(post());
    const fired = fetchMock.mock.calls.map((c) => String((c as unknown as [string])[0]));
    expect(fired.sort()).toEqual([
      'http://local.test/api/worker/extract',
      'http://local.test/api/worker/gate',
    ]);
  });
});

describe('B5 · the sweeper leg: the advisory listing becomes work', () => {
  it('requeue rows are enqueued with lineage and their stages fired; the response carries the §4.11 signals', async () => {
    workers.sweeperPass.mockResolvedValueOnce({
      expired_leases: 2,
      terminalized: [{ arrival_id: 'a-t', state: 'store_failed' }],
      requeue: [
        { arrival_id: 'a-9', stage: 'store' },
        { arrival_id: 'a-10', stage: 'scan' },
      ],
      stuck: ['a-stuck'],
      queue_age_alert: true,
    });
    const res = await route.POST(post());
    const body = await res.json();
    expect(body.sweeper).toMatchObject({
      expired_leases: 2,
      queue_age_alert: true,
    });
    expect(body.requeued).toBe(2);
    const sent = workers.sendPipelineWork.mock.calls.map((c) => c[0]);
    expect(sent).toEqual([
      expect.objectContaining({ arrival_id: 'a-9', stage: 'store', circle_id: CIRCLE }),
      expect.objectContaining({ arrival_id: 'a-10', stage: 'scan', circle_id: CIRCLE }),
    ]);
    const fired = fetchMock.mock.calls.map((c) => String((c as unknown as [string])[0]));
    expect(fired).toContain('http://local.test/api/worker/store');
    expect(fired).toContain('http://local.test/api/worker/scan');
  });

  it('unknown lineage still requeues — null circle/channel, the worker fails closed downstream', async () => {
    workers.lookupLineage.mockResolvedValueOnce(null);
    workers.sweeperPass.mockResolvedValueOnce({
      expired_leases: 0,
      terminalized: [],
      requeue: [{ arrival_id: 'a-11', stage: 'gate' }],
      stuck: [],
      queue_age_alert: false,
    });
    await route.POST(post());
    const [sent] = workers.sendPipelineWork.mock.calls[0];
    expect(sent).toMatchObject({
      arrival_id: 'a-11',
      stage: 'gate',
      circle_id: null,
      channel: null,
    });
  });
});

// ============================================================================
// 5B B7 · The relay flip, and D13's backlog (slice-5 plan B7; ADR-0019 D13;
// WRK-02).
//
// D13 had the worker DEFER extract/interpret messages (pgmq.set_vt, +1 h),
// never consumed and never lost, because slice 5's workers did not exist. They
// do now. The defer branch is gone from the pipeline vocabulary (B4/B5), the
// relay fires the new stages like any other — and the backlog those deferrals
// built is RELEASED rather than waited out: a message pushed an hour into the
// future would otherwise sit there for up to an hour after the seam closed,
// which is a delay with no reason left behind it.
// ============================================================================

describe('5B B7 · the deferred backlog is released, not waited out', () => {
  it('a relay pass releases deferred pipeline work before it drains anything', async () => {
    workers.releaseDeferredWork.mockResolvedValueOnce(3);
    const res = await route.POST(post());
    expect(res.status).toBe(200);
    expect(workers.releaseDeferredWork).toHaveBeenCalled();
    const body = await res.json();
    expect(body.released).toBe(3);
  });

  it('releasing nothing is the steady state, and says so quietly', async () => {
    workers.releaseDeferredWork.mockResolvedValueOnce(0);
    const res = await route.POST(post());
    const body = await res.json();
    expect(body.released).toBe(0);
  });

  it('a release failure never costs the pass — the backlog waits out its vt instead', async () => {
    workers.releaseDeferredWork.mockRejectedValueOnce(new Error('pgmq hiccup'));
    const res = await route.POST(post());
    expect(res.status).toBe(200);
    // The outbox and sweeper legs still ran.
    expect(workers.outboxDrain).toHaveBeenCalled();
    expect(workers.sweeperPass).toHaveBeenCalled();
  });
});

describe('5B B7 · the sweeper is stage-agnostic — ASSERTED, not assumed', () => {
  it('a requeue listing naming extract or interpret is enqueued and fired', async () => {
    workers.sweeperPass.mockResolvedValueOnce({
      expired_leases: 2,
      terminalized: [],
      requeue: [
        { arrival_id: 'a-ex', stage: 'extract' },
        { arrival_id: 'a-in', stage: 'interpret' },
      ],
      stuck: [],
      queue_age_alert: false,
    });
    await route.POST(post());
    const sent = workers.sendPipelineWork.mock.calls.map((c) => c[0]);
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ arrival_id: 'a-ex', stage: 'extract' }),
        expect.objectContaining({ arrival_id: 'a-in', stage: 'interpret' }),
      ]),
    );
    const fired = fetchMock.mock.calls.map((c) => String((c as unknown as [string])[0]));
    expect(fired).toContain('http://local.test/api/worker/extract');
    expect(fired).toContain('http://local.test/api/worker/interpret');
  });
});
