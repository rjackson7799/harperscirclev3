import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

// ============================================================================
// B4 · /api/worker/[stage] — store · scan · gate, each the §4.3 sequence
// exactly: claim → COMMIT → external work → finalize (TSD §4.3/§4.5;
// STO-01/SCN-01 app halves; the SND-01 gate machinery). Key/auth posture
// per the security-actions precedent: timing-safe, 503-when-unset.
//
// Test class: MOCKED ROUTE CONTRACT (call order over mocked wrappers);
// the live authority is tests/hc/workers.test.ts (real claims and
// finalizers) and the B9 gate leg (EICAR live).
// ============================================================================

const workers = {
  readPipelineWork: vi.fn(),
  archivePipelineWork: vi.fn(),
  deferPipelineWork: vi.fn(),
  sendPipelineWork: vi.fn(),
  claimStage: vi.fn(),
  finalizeStore: vi.fn(),
  finalizeScan: vi.fn(),
  scanCacheLookup: vi.fn(),
  senderRecognised: vi.fn(),
  advanceArrival: vi.fn(),
  lookupChannel: vi.fn(),
};
vi.mock('@/lib/hc/workers', () => workers);

const storage = {
  readStagedObject: vi.fn(),
  removeStagedObject: vi.fn(),
  writeArtifactObject: vi.fn(),
  moveToQuarantine: vi.fn(),
  artifactKey: vi.fn(
    (c: string, a: string, sha: string) => `circle/${c}/arrival/${a}/${sha}`,
  ),
};
vi.mock('@/lib/storage/artifacts', () => storage);

const scanner = { scanBytes: vi.fn() };
vi.mock('@/lib/scan/scanner', () => scanner);

const WORKER_KEY = 'w'.repeat(48);
const CIRCLE = '11111111-0000-4000-8000-000000000001';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7 tiny');
const PDF_SHA = createHash('sha256').update(PDF_BYTES).digest('hex');

function msg(stage: string, overrides: Record<string, unknown> = {}) {
  return {
    msg_id: 7,
    message: { circle_id: CIRCLE, arrival_id: ARRIVAL, stage, channel: 'email', ...overrides },
  };
}

function req(stage: string, headers: Record<string, string> = { 'x-worker-key': WORKER_KEY }) {
  return new Request(`http://local.test/api/worker/${stage}`, { method: 'POST', headers });
}

type RouteModule = {
  POST: (r: Request, ctx: { params: Promise<{ stage: string }> }) => Promise<Response>;
};
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => new Response('ok'));

function ctx(stage: string) {
  return { params: Promise.resolve({ stage }) };
}

beforeEach(async () => {
  vi.resetAllMocks();
  workers.readPipelineWork.mockResolvedValue([]);
  workers.archivePipelineWork.mockResolvedValue(undefined);
  workers.deferPipelineWork.mockResolvedValue(undefined);
  workers.sendPipelineWork.mockResolvedValue(undefined);
  workers.claimStage.mockResolvedValue({
    result: 'claimed',
    leaseId: 'lease-1',
    attemptNo: 1,
    deadline: new Date().toISOString(),
  });
  workers.finalizeStore.mockResolvedValue('advanced');
  workers.finalizeScan.mockResolvedValue('advanced');
  workers.scanCacheLookup.mockResolvedValue(null);
  workers.senderRecognised.mockResolvedValue(false);
  workers.advanceArrival.mockResolvedValue('advanced');
  workers.lookupChannel.mockResolvedValue(null);
  storage.readStagedObject.mockResolvedValue(PDF_BYTES);
  storage.removeStagedObject.mockResolvedValue(undefined);
  storage.writeArtifactObject.mockResolvedValue(undefined);
  storage.moveToQuarantine.mockResolvedValue(undefined);
  storage.artifactKey.mockImplementation(
    (c: string, a: string, sha: string) => `circle/${c}/arrival/${a}/${sha}`,
  );
  scanner.scanBytes.mockResolvedValue({ verdict: 'clean', detail: {} });
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  process.env.HC_WORKER_KEY = WORKER_KEY;
  vi.stubGlobal('fetch', fetchMock);
  route = (await import('@/app/api/worker/[stage]/route')) as RouteModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('B4 · auth before any work (the security-actions posture)', () => {
  it('key unset ⇒ 503 disabled, never open', async () => {
    delete process.env.HC_WORKER_KEY;
    const res = await route.POST(req('store'), ctx('store'));
    expect(res.status).toBe(503);
    expect(workers.readPipelineWork).not.toHaveBeenCalled();
  });

  it('wrong key ⇒ 403, nothing read', async () => {
    const res = await route.POST(req('store', { 'x-worker-key': 'nope' }), ctx('store'));
    expect(res.status).toBe(403);
    expect(workers.readPipelineWork).not.toHaveBeenCalled();
  });

  it('an unknown stage ⇒ 404, nothing read', async () => {
    const res = await route.POST(req('normalize'), ctx('normalize'));
    expect(res.status).toBe(404);
    expect(workers.readPipelineWork).not.toHaveBeenCalled();
  });
});

describe('B4 · store — claim → COMMIT → bytes → finalize; the chain continues', () => {
  it('the advanced path: sniffed mime, content-addressed key, scan enqueued WITH channel, eager scan fire, ack', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('store')]);
    const res = await route.POST(req('store'), ctx('store'));
    expect(res.status).toBe(200);

    expect(workers.claimStage).toHaveBeenCalledWith(ARRIVAL, 'store');
    expect(storage.readStagedObject).toHaveBeenCalledWith(CIRCLE, ARRIVAL);
    const [key, bytes, mime] = storage.writeArtifactObject.mock.calls[0];
    expect(key).toBe(`circle/${CIRCLE}/arrival/${ARRIVAL}/${PDF_SHA}`);
    expect(bytes).toBe(PDF_BYTES);
    expect(mime).toBe('application/pdf');

    const [fin] = workers.finalizeStore.mock.calls[0];
    expect(fin).toMatchObject({
      arrivalId: ARRIVAL,
      leaseId: 'lease-1',
      storageKey: key,
      sha256Hex: PDF_SHA,
      mimeDetected: 'application/pdf',
      byteSize: PDF_BYTES.byteLength,
    });

    // Staging stays until scan reaches a definitive exit (scan needs bytes).
    expect(storage.removeStagedObject).not.toHaveBeenCalled();

    const [sent] = workers.sendPipelineWork.mock.calls[0];
    expect(sent).toMatchObject({
      circle_id: CIRCLE,
      arrival_id: ARRIVAL,
      stage: 'scan',
      channel: 'email',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [fireUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(fireUrl)).toBe('http://local.test/api/worker/scan');
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(7);
  });

  it('a non-claimed result acks without touching storage (already_advanced absorbs redelivery)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('store')]);
    workers.claimStage.mockResolvedValueOnce({ result: 'already_advanced' });
    await route.POST(req('store'), ctx('store'));
    expect(storage.readStagedObject).not.toHaveBeenCalled();
    expect(workers.finalizeStore).not.toHaveBeenCalled();
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(7);
  });

  it('missing staged bytes: NO finalize, ack — the lease expires and the machinery retries toward store_failed', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('store')]);
    storage.readStagedObject.mockResolvedValueOnce(null);
    await route.POST(req('store'), ctx('store'));
    expect(workers.finalizeStore).not.toHaveBeenCalled();
    expect(storage.writeArtifactObject).not.toHaveBeenCalled();
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(7);
  });

  it('a lost transition (stale_lease) enqueues nothing further', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('store')]);
    workers.finalizeStore.mockResolvedValueOnce('stale_lease');
    await route.POST(req('store'), ctx('store'));
    expect(workers.sendPipelineWork).not.toHaveBeenCalled();
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(7);
  });
});

describe('B4 · scan — cache first, four exits, quarantine moves bytes', () => {
  it('a cache HIT skips the scanner entirely (clean)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    workers.scanCacheLookup.mockResolvedValueOnce({ verdict: 'clean', detail: {} });
    await route.POST(req('scan'), ctx('scan'));
    expect(scanner.scanBytes).not.toHaveBeenCalled();
    expect(workers.finalizeScan).toHaveBeenCalledWith(ARRIVAL, 'lease-1', 'clean', {});
    expect(storage.removeStagedObject).toHaveBeenCalledWith(CIRCLE, ARRIVAL);
    const [sent] = workers.sendPipelineWork.mock.calls[0];
    expect(sent).toMatchObject({ stage: 'gate', channel: 'email' });
  });

  it('a cache HIT on a KNOWN-INFECTED sha quarantines without scanning (the X1 evidence row at work)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    workers.scanCacheLookup.mockResolvedValueOnce({
      verdict: 'infected',
      detail: { signature: 'Eicar-Signature' },
    });
    await route.POST(req('scan'), ctx('scan'));
    expect(scanner.scanBytes).not.toHaveBeenCalled();
    expect(workers.finalizeScan).toHaveBeenCalledWith(ARRIVAL, 'lease-1', 'infected', {
      signature: 'Eicar-Signature',
    });
    expect(storage.moveToQuarantine).toHaveBeenCalled();
    expect(workers.sendPipelineWork).not.toHaveBeenCalled(); // no gate for quarantine
  });

  it('a cache miss scans the staged bytes; clean chains to the gate', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    await route.POST(req('scan'), ctx('scan'));
    expect(scanner.scanBytes).toHaveBeenCalledTimes(1);
    expect(workers.finalizeScan).toHaveBeenCalledWith(ARRIVAL, 'lease-1', 'clean', {});
    const [sent] = workers.sendPipelineWork.mock.calls[0];
    expect(sent).toMatchObject({ stage: 'gate' });
  });

  it('infected moves the final object to quarantine and removes staging', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    scanner.scanBytes.mockResolvedValueOnce({
      verdict: 'infected',
      detail: { signature: 'Eicar-Signature' },
    });
    await route.POST(req('scan'), ctx('scan'));
    const [fromKey, toKey, bytes] = storage.moveToQuarantine.mock.calls[0];
    expect(fromKey).toBe(`circle/${CIRCLE}/arrival/${ARRIVAL}/${PDF_SHA}`);
    expect(toKey).toBe(fromKey);
    expect(bytes).toBe(PDF_BYTES);
    expect(storage.removeStagedObject).toHaveBeenCalledWith(CIRCLE, ARRIVAL);
  });

  it('UNAVAILABLE never finalizes — the attempt burns by expiry and exhaustion lands scan_unavailable honestly', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    scanner.scanBytes.mockResolvedValueOnce({ verdict: 'unavailable', detail: { error: 'down' } });
    await route.POST(req('scan'), ctx('scan'));
    expect(workers.finalizeScan).not.toHaveBeenCalled();
    expect(storage.removeStagedObject).not.toHaveBeenCalled(); // retry needs the bytes
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(7);
  });

  it('INCONCLUSIVE is an answer, finalized as its own state — never collapsed with unavailable', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    scanner.scanBytes.mockResolvedValueOnce({
      verdict: 'inconclusive',
      detail: { error: 'size limit' },
    });
    await route.POST(req('scan'), ctx('scan'));
    expect(workers.finalizeScan).toHaveBeenCalledWith(ARRIVAL, 'lease-1', 'inconclusive', {
      error: 'size limit',
    });
    expect(storage.removeStagedObject).toHaveBeenCalledWith(CIRCLE, ARRIVAL);
    expect(workers.sendPipelineWork).not.toHaveBeenCalled();
  });

  it('missing staged bytes at scan: no verdict is invented; ack and let the machinery retry', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('scan')]);
    storage.readStagedObject.mockResolvedValueOnce(null);
    await route.POST(req('scan'), ctx('scan'));
    expect(scanner.scanBytes).not.toHaveBeenCalled();
    expect(workers.finalizeScan).not.toHaveBeenCalled();
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(7);
  });
});

describe('B4 · gate — the SND-01 machinery; uploads pass, strangers hold', () => {
  it('recognised email advances to extracting and enqueues the extract seam (Q7: enqueued, nothing consumes yet)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('gate')]);
    workers.senderRecognised.mockResolvedValueOnce(true);
    await route.POST(req('gate'), ctx('gate'));
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'scanned',
      'extracting',
      'lease-1',
      'sender_recognised',
    );
    const [sent] = workers.sendPipelineWork.mock.calls[0];
    expect(sent).toMatchObject({ stage: 'extract' });
    expect(fetchMock).not.toHaveBeenCalled(); // no consumer to fire (Q7)
  });

  it('an unknown sender holds — AC-INBOX-7: the gate precedes extracting', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('gate')]);
    workers.senderRecognised.mockResolvedValueOnce(false);
    await route.POST(req('gate'), ctx('gate'));
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'scanned',
      'held_unknown_sender',
      'lease-1',
      'sender_unknown',
    );
    expect(workers.sendPipelineWork).not.toHaveBeenCalled();
  });

  it('an upload passes the gate without a sender probe — the gate is a MAIL guard', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('gate', { channel: 'upload' })]);
    await route.POST(req('gate'), ctx('gate'));
    expect(workers.senderRecognised).not.toHaveBeenCalled();
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'scanned',
      'extracting',
      'lease-1',
      null,
    );
  });

  it('a channel-less message consults the archive lineage; unknown lineage fails CLOSED to the sender gate', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('gate', { channel: null })]);
    workers.lookupChannel.mockResolvedValueOnce('upload');
    await route.POST(req('gate'), ctx('gate'));
    expect(workers.lookupChannel).toHaveBeenCalledWith(ARRIVAL);
    expect(workers.senderRecognised).not.toHaveBeenCalled();

    workers.readPipelineWork.mockResolvedValueOnce([msg('gate', { channel: null })]);
    workers.lookupChannel.mockResolvedValueOnce(null);
    workers.senderRecognised.mockResolvedValueOnce(false);
    await route.POST(req('gate'), ctx('gate'));
    expect(workers.senderRecognised).toHaveBeenCalledWith(ARRIVAL);
  });
});

describe('B4 · the queue is shared; the seam and mixed batches stay honest', () => {
  it('extract/interpret messages are DEFERRED, not consumed and not lost (the Q7 seam)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    const res = await route.POST(req('store'), ctx('store'));
    expect(res.status).toBe(200);
    expect(workers.deferPipelineWork).toHaveBeenCalledWith(7);
    expect(workers.archivePipelineWork).not.toHaveBeenCalled();
    expect(workers.claimStage).not.toHaveBeenCalled();
  });

  it('each message dispatches by ITS stage; the response reports outcomes', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([
      msg('store'),
      { msg_id: 8, message: { circle_id: CIRCLE, arrival_id: ARRIVAL, stage: 'gate', channel: 'upload' } },
    ]);
    const res = await route.POST(req('store'), ctx('store'));
    const body = await res.json();
    expect(body.processed).toHaveLength(2);
    expect(body.processed[0]).toMatchObject({ stage: 'store' });
    expect(body.processed[1]).toMatchObject({ stage: 'gate' });
  });

  it('one failing message leaves its work redeliverable and never blocks the rest', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('store'), msg('scan')]);
    workers.claimStage.mockRejectedValueOnce(new Error('db hiccup'));
    const res = await route.POST(req('store'), ctx('store'));
    expect(res.status).toBe(200);
    // first message NOT acked (vt redelivers); second processed normally
    expect(workers.archivePipelineWork).toHaveBeenCalledTimes(1);
  });
});
