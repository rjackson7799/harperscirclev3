import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B5 · /api/worker/nightly — the scheduler family's daily legs (RLY-01;
// OPS-01/D6: hc.run_taint_sweep nightly; PRD §11.5: the clean-cache
// expiry AND the quarantine BYTE purge — ADR-0018 F2's named owner —
// bytes out at 7 days, hash + verdict retained forever; §5.4: the
// 30-day held-mail expiry).
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const workers = {
  runTaintSweep: vi.fn(),
  expireScanResults: vi.fn(),
  expireHeldMail: vi.fn(),
};
vi.mock('@/lib/hc/workers', () => workers);

const storage = { purgeQuarantineOlderThan: vi.fn() };
vi.mock('@/lib/storage/artifacts', () => storage);

const WORKER_KEY = 'w'.repeat(48);
const CRON_SECRET = 'c'.repeat(48);

function post(headers: Record<string, string> = { 'x-worker-key': WORKER_KEY }) {
  return new Request('http://local.test/api/worker/nightly', { method: 'POST', headers });
}
function get(headers: Record<string, string> = { authorization: `Bearer ${CRON_SECRET}` }) {
  return new Request('http://local.test/api/worker/nightly', { method: 'GET', headers });
}

type RouteModule = {
  POST: (r: Request) => Promise<Response>;
  GET: (r: Request) => Promise<Response>;
};
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  vi.resetAllMocks();
  workers.runTaintSweep.mockResolvedValue(0);
  workers.expireScanResults.mockResolvedValue({ removed: 0 });
  workers.expireHeldMail.mockResolvedValue({ expired_count: 0 });
  storage.purgeQuarantineOlderThan.mockResolvedValue({ removed: 0 });
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  savedEnv.CRON_SECRET = process.env.CRON_SECRET;
  process.env.HC_WORKER_KEY = WORKER_KEY;
  process.env.CRON_SECRET = CRON_SECRET;
  route = (await import('@/app/api/worker/nightly/route')) as RouteModule;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('B5 · gated like every worker', () => {
  it('POST 503 unset / 403 wrong; GET the same for the cron secret; nothing runs', async () => {
    delete process.env.HC_WORKER_KEY;
    expect((await route.POST(post())).status).toBe(503);
    process.env.HC_WORKER_KEY = WORKER_KEY;
    expect((await route.POST(post({ 'x-worker-key': 'no' }))).status).toBe(403);
    delete process.env.CRON_SECRET;
    expect((await route.GET(get())).status).toBe(503);
    expect(workers.runTaintSweep).not.toHaveBeenCalled();
    expect(storage.purgeQuarantineOlderThan).not.toHaveBeenCalled();
  });
});

describe('B5 · the four nightly legs, each reported', () => {
  it('runs the taint sweep, the scan-cache expiry, the held-mail expiry and the §11.5 BYTE purge at 7 days', async () => {
    workers.runTaintSweep.mockResolvedValueOnce(3);
    workers.expireScanResults.mockResolvedValueOnce({ removed: 5 });
    workers.expireHeldMail.mockResolvedValueOnce({ expired_count: 2 });
    storage.purgeQuarantineOlderThan.mockResolvedValueOnce({ removed: 1 });

    const res = await route.GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      taint_findings: 3,
      scan_cache_removed: 5,
      held_expired: 2,
      quarantine_bytes_purged: 1,
    });
    expect(storage.purgeQuarantineOlderThan).toHaveBeenCalledWith(7);
  });

  it('one failing leg never blocks the others; the failure is named in the response', async () => {
    workers.runTaintSweep.mockRejectedValueOnce(new Error('sweep failed'));
    const res = await route.POST(post());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taint_findings).toBeNull();
    expect(body.errors).toContain('taint_sweep');
    expect(workers.expireScanResults).toHaveBeenCalled();
    expect(storage.purgeQuarantineOlderThan).toHaveBeenCalled();
  });
});
