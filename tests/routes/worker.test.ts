import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// A8 · /api/worker/security-actions — the §5.11 retry sweep hardened
// (ADR-0013 F3; round-10 findings 3, 9, 15).
//
//   - Two callers, both authenticated: the deploy-time Vercel cron (GET,
//     `Authorization: Bearer ${CRON_SECRET}` — the platform's cron auth
//     shape) and the operational POST (`x-worker-key`). Either secret
//     absent from the environment disables its path with 503 — never open.
//   - The sweep is BOUNDED and ORDERED: oldest actions first (the owed
//     kill that has waited longest is the most urgent), at most one batch
//     per invocation — a large backlog defers, it cannot blow the
//     execution window. The response reports what a monitor needs:
//     drained / of / deferred / oldest_pending_age_s.
//   - Per-action isolation: one failing kill leaves its row pending for
//     the next sweep and never blocks the rest (at-least-once; completion
//     retry-safe by 2A construction; rotation idempotent — each rotation
//     lands entropy nobody holds).
// ============================================================================

const security = {
  executeWasntMe: vi.fn(),
  completeSecurityAction: vi.fn<(actionId: string) => Promise<undefined>>(async () => undefined),
  killAllSessionsAndForceReset: vi.fn<(accountId: string) => Promise<undefined>>(
    async () => undefined,
  ),
  pendingSecurityActions: vi.fn(async (): Promise<unknown[]> => []),
};
vi.mock('@/lib/hc/security-actions', () => security);

const WORKER_KEY = 'w'.repeat(48);
const CRON_SECRET = 'c'.repeat(48);

function pendingRow(id: string, ageMs: number) {
  return {
    id,
    account_id: `acct-${id}`,
    action: 'global_signout_forced_reset',
    created_at: new Date(Date.now() - ageMs).toISOString(),
  };
}

function postReq(headers: Record<string, string> = {}): Request {
  return new Request('http://local.test/api/worker/security-actions', {
    method: 'POST',
    headers,
  });
}

function getReq(headers: Record<string, string> = {}): Request {
  return new Request('http://local.test/api/worker/security-actions', {
    method: 'GET',
    headers,
  });
}

type RouteModule = {
  POST: (req: Request) => Promise<Response>;
  GET: (req: Request) => Promise<Response>;
};
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  // resetAllMocks (not clear): un-consumed mockResolvedValueOnce queues must
  // not leak between tests; defaults are re-established below.
  vi.resetAllMocks();
  security.completeSecurityAction.mockResolvedValue(undefined);
  security.killAllSessionsAndForceReset.mockResolvedValue(undefined);
  security.pendingSecurityActions.mockResolvedValue([]);
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  savedEnv.CRON_SECRET = process.env.CRON_SECRET;
  process.env.HC_WORKER_KEY = WORKER_KEY;
  process.env.CRON_SECRET = CRON_SECRET;
  route = (await import('@/app/api/worker/security-actions/route')) as RouteModule;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('A8 · both auth paths refuse before any work', () => {
  it('POST without HC_WORKER_KEY configured answers 503 — disabled, never open', async () => {
    delete process.env.HC_WORKER_KEY;
    const res = await route.POST(postReq({ 'x-worker-key': WORKER_KEY }));
    expect(res.status).toBe(503);
    expect(security.pendingSecurityActions).not.toHaveBeenCalled();
  });

  it('POST with a wrong key answers 403 and reads nothing', async () => {
    const res = await route.POST(postReq({ 'x-worker-key': 'not-the-key' }));
    expect(res.status).toBe(403);
    expect(security.pendingSecurityActions).not.toHaveBeenCalled();
  });

  it('GET (the Vercel cron path) without CRON_SECRET configured answers 503', async () => {
    delete process.env.CRON_SECRET;
    const res = await route.GET(getReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(503);
    expect(security.pendingSecurityActions).not.toHaveBeenCalled();
  });

  it('GET with a wrong bearer answers 403 and reads nothing', async () => {
    const res = await route.GET(getReq({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(403);
    expect(security.pendingSecurityActions).not.toHaveBeenCalled();
  });
});

describe('A8 · the cron path drains exactly like the keyed POST', () => {
  it('GET with the configured bearer performs the sweep', async () => {
    security.pendingSecurityActions.mockResolvedValueOnce([pendingRow('a1', 60_000)]);
    const res = await route.GET(getReq({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(security.killAllSessionsAndForceReset).toHaveBeenCalledWith('acct-a1');
    expect(security.completeSecurityAction).toHaveBeenCalledWith('a1');
    expect(res.status).toBe(200);
  });
});

describe('A8 · bounded, ordered, observable (round-10 finding 9)', () => {
  it('oldest actions drain first — the longest-owed kill is the most urgent', async () => {
    security.pendingSecurityActions.mockResolvedValueOnce([
      pendingRow('newer', 10_000),
      pendingRow('oldest', 3_600_000),
      pendingRow('middle', 600_000),
    ]);
    await route.POST(postReq({ 'x-worker-key': WORKER_KEY }));
    const order = security.killAllSessionsAndForceReset.mock.calls.map((c) => c[0]);
    expect(order).toEqual(['acct-oldest', 'acct-middle', 'acct-newer']);
  });

  it('a backlog beyond the batch bound defers, and the response says so', async () => {
    security.pendingSecurityActions.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => pendingRow(`p${i}`, (25 - i) * 1000)),
    );
    const res = await route.POST(postReq({ 'x-worker-key': WORKER_KEY }));
    expect(security.killAllSessionsAndForceReset).toHaveBeenCalledTimes(20);
    const body = (await res.json()) as Record<string, number>;
    expect(body.drained).toBe(20);
    expect(body.of).toBe(25);
    expect(body.deferred).toBe(5);
  });

  it('the oldest pending age is reported for monitoring (maximum tolerated age is an ops threshold)', async () => {
    security.pendingSecurityActions.mockResolvedValueOnce([
      pendingRow('young', 5_000),
      pendingRow('old', 3_600_000),
    ]);
    const res = await route.POST(postReq({ 'x-worker-key': WORKER_KEY }));
    const body = (await res.json()) as Record<string, number>;
    expect(body.oldest_pending_age_s).toBeGreaterThanOrEqual(3599);
    expect(body.oldest_pending_age_s).toBeLessThanOrEqual(3601);
  });

  it('an empty queue reports zeroes, not absence', async () => {
    security.pendingSecurityActions.mockResolvedValueOnce([]);
    const res = await route.POST(postReq({ 'x-worker-key': WORKER_KEY }));
    const body = (await res.json()) as Record<string, number>;
    expect(body).toMatchObject({ drained: 0, of: 0, deferred: 0, oldest_pending_age_s: 0 });
  });

  it('one failing kill leaves its row pending and never blocks the rest', async () => {
    security.pendingSecurityActions.mockResolvedValueOnce([
      pendingRow('fails', 120_000),
      pendingRow('works', 60_000),
    ]);
    security.killAllSessionsAndForceReset.mockRejectedValueOnce(new Error('gotrue down'));
    const res = await route.POST(postReq({ 'x-worker-key': WORKER_KEY }));
    const body = (await res.json()) as Record<string, number>;
    expect(body.drained).toBe(1);
    expect(security.completeSecurityAction).toHaveBeenCalledTimes(1);
    expect(security.completeSecurityAction).toHaveBeenCalledWith('works');
  });
});
