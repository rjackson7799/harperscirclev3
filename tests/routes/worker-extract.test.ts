import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B4 · /api/worker/[stage] gains `extract` — the §4.3 sequence exactly:
// claim → COMMIT → render → provider → finalize (slice-5 plan B4; WRK-02,
// RND-01's app half, AIA-01's worker half).
//
// Test class: MOCKED ROUTE CONTRACT (call order and arguments over mocked
// wrappers). The live authority is the B9 extraction leg under the local-gate
// protocol, with the fixture server in the stack.
//
// The properties this file exists to pin:
//   · the run identity is minted AT THE CLAIM (M3: no lease without its run);
//   · the provider is never dispatched before the render bounds have passed;
//   · every §4.3 normalize exit lands its own honest state and reason;
//   · a refusal terminalizes; an OUTAGE does not — it is retried by the
//     machinery, never finalized early (the scanner precedent, verbatim);
//   · risk_class is stamped by the worker, BEFORE the call, and in
//     all-high-risk mode every field is high;
//   · attempt staging is GC'd on every non-advance and PROMOTED on advance.
// ============================================================================

const workers = {
  readPipelineWork: vi.fn(),
  archivePipelineWork: vi.fn(),
  deferPipelineWork: vi.fn(),
  sendPipelineWork: vi.fn(),
  claimStage: vi.fn(),
  finalizeStore: vi.fn(),
  finalizeScan: vi.fn(),
  finalizeExtraction: vi.fn(),
  finalizeInterpretation: vi.fn(),
  recordContextFor: vi.fn(),
  scanCacheLookup: vi.fn(),
  senderRecognised: vi.fn(),
  advanceArrival: vi.fn(),
  lookupChannel: vi.fn(),
  lookupLineage: vi.fn(),
};
vi.mock('@/lib/hc/workers', () => workers);

const storage = {
  readStagedObject: vi.fn(),
  removeStagedObject: vi.fn(),
  writeArtifactObject: vi.fn(),
  moveToQuarantine: vi.fn(),
  readArtifactBytes: vi.fn(),
  writeRenderStaging: vi.fn(),
  gcRenderStaging: vi.fn(),
  promoteRenderedPages: vi.fn(),
  artifactKey: vi.fn((c: string, a: string, sha: string) => `circle/${c}/arrival/${a}/${sha}`),
};
vi.mock('@/lib/storage/artifacts', () => storage);

const scanner = { scanBytes: vi.fn() };
vi.mock('@/lib/scan/scanner', () => scanner);

const render = { normalizeArrival: vi.fn() };
vi.mock('@/lib/pipeline/render', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, normalizeArrival: render.normalizeArrival };
});

const ai = { extractFromArrival: vi.fn() };
vi.mock('@/lib/ai/extract', () => ai);
const interpretMod = { interpretArrival: vi.fn() };
vi.mock('@/lib/ai/interpret', () => interpretMod);

// 6B B9: the engine is mocked (its real reading is tests/pipeline/ocr.test.ts's
// business); `isImageOnlySource` stays REAL so the route's class gating is the
// thing exercised, not a mock of it.
const ocr = { ocrRenderedPages: vi.fn() };
vi.mock('@/lib/pipeline/ocr', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, ocrRenderedPages: ocr.ocrRenderedPages };
});

const WORKER_KEY = 'w'.repeat(48);
const CIRCLE = '11111111-0000-4000-8000-000000000001';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const LEASE = 'lease-extract-1';
const PDF = new TextEncoder().encode('%PDF-1.7 tiny');

const PAGE = {
  page: 1,
  widthPx: 1212,
  heightPx: 1568,
  mime: 'image/png' as const,
  bytes: new Uint8Array([1, 2, 3]),
};

function msg(stage: string, overrides: Record<string, unknown> = {}) {
  return {
    msg_id: 11,
    message: { circle_id: CIRCLE, arrival_id: ARRIVAL, stage, channel: 'email', ...overrides },
  };
}

function req(stage: string) {
  return new Request(`http://local.test/api/worker/${stage}`, {
    method: 'POST',
    headers: { 'x-worker-key': WORKER_KEY },
  });
}

function ctx(stage: string) {
  return { params: Promise.resolve({ stage }) };
}

type RouteModule = {
  POST: (r: Request, c: { params: Promise<{ stage: string }> }) => Promise<Response>;
  maxDuration?: number;
  // The pure §6.3 refusal→(state, reason) mapping. Exported so the contract
  // can be asserted directly rather than inferred from a route round-trip
  // (round-16 Q-B/Q-D).
  normalizeExit?: (result: { outcome: string; reason?: string }) => {
    state: string;
    reason: string;
  } | null;
};
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => new Response('ok'));

const OK_EXTRACT = {
  outcome: 'ok' as const,
  data: {
    facts: [
      {
        field: 'medication_dose',
        value: '500 mg',
        confidence: 0.93,
        citation: { page: 1, bbox: [0.1, 0.2, 0.3, 0.04] as [number, number, number, number] },
      },
      {
        field: 'document_date',
        value: '2026-03-14',
        confidence: 0.98,
        citation: { page: 1, bbox: [0.1, 0.3, 0.3, 0.04] as [number, number, number, number] },
      },
    ],
    document: { category: 'medical', title: 'Discharge summary', summary: 'A summary.' },
  },
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  },
  modelId: 'claude-opus-5',
  promptVersion: 'hc-5b-1+abc',
  dropped: 0,
};

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  workers.readPipelineWork.mockResolvedValue([]);
  workers.archivePipelineWork.mockResolvedValue(undefined);
  workers.sendPipelineWork.mockResolvedValue(undefined);
  workers.claimStage.mockResolvedValue({
    result: 'claimed',
    leaseId: LEASE,
    attemptNo: 1,
    deadline: new Date(Date.now() + 300_000).toISOString(),
  });
  workers.finalizeExtraction.mockResolvedValue('advanced');
  workers.finalizeInterpretation.mockResolvedValue('advanced');
  workers.recordContextFor.mockResolvedValue({ profile_facts: { rows: [] } });
  workers.advanceArrival.mockResolvedValue('advanced');
  workers.lookupLineage.mockResolvedValue({ circle_id: CIRCLE, channel: 'email' });
  storage.readArtifactBytes.mockResolvedValue(PDF);
  storage.writeRenderStaging.mockResolvedValue(undefined);
  storage.gcRenderStaging.mockResolvedValue({ removed: 1 });
  storage.promoteRenderedPages.mockResolvedValue({ promoted: 1 });
  render.normalizeArrival.mockReturnValue({
    outcome: 'rendered',
    sourceClass: 'born_digital_pdf',
    pageCount: 1,
    pages: [PAGE],
    text: 'Dose: 500 mg',
  });
  ocr.ocrRenderedPages.mockResolvedValue([{ page: 1, text: 'Amoxicillin 500 mg' }]);
  ai.extractFromArrival.mockResolvedValue(OK_EXTRACT);
  interpretMod.interpretArrival.mockResolvedValue({
    outcome: 'ok',
    data: { proposals: [], anomalies: [] },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    modelId: 'claude-opus-5',
    promptVersion: 'hc-5b-1+abc',
    dropped: 0,
  });
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

describe('B4 · the route declares its own wall clock (§1.9)', () => {
  it('maxDuration is set explicitly and exceeds the 300 s extract stage clock', () => {
    expect(typeof route.maxDuration).toBe('number');
    expect(route.maxDuration!).toBeGreaterThan(300);
  });

  it('extract is a known stage now — the Q7 seam is open', async () => {
    const res = await route.POST(req('extract'), ctx('extract'));
    expect(res.status).toBe(200);
  });
});

describe('B4 · claim → COMMIT → render → provider → finalize, in that order', () => {
  it('the claim carries the RUN IDENTITY (M3: no lease without its run)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.claimStage).toHaveBeenCalledTimes(1);
    const [arrival, stage, modelId, promptVersion] = workers.claimStage.mock.calls[0];
    expect(arrival).toBe(ARRIVAL);
    expect(stage).toBe('extract');
    expect(typeof modelId).toBe('string');
    expect(modelId.length).toBeGreaterThan(0);
    expect(typeof promptVersion).toBe('string');
    expect(promptVersion.length).toBeGreaterThan(0);
  });

  it('a non-claimed outcome does no work at all', async () => {
    workers.claimStage.mockResolvedValueOnce({
      result: 'already_advanced',
      leaseId: null,
      attemptNo: null,
      deadline: null,
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(storage.readArtifactBytes).not.toHaveBeenCalled();
    expect(ai.extractFromArrival).not.toHaveBeenCalled();
    expect(workers.finalizeExtraction).not.toHaveBeenCalled();
  });

  it('the happy path publishes, promotes the pages, and hands off to interpret', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));

    expect(render.normalizeArrival).toHaveBeenCalled();
    expect(storage.writeRenderStaging).toHaveBeenCalled();
    expect(ai.extractFromArrival).toHaveBeenCalled();

    const [arrival, lease, facts, proposals] = workers.finalizeExtraction.mock.calls[0];
    expect(arrival).toBe(ARRIVAL);
    expect(lease).toBe(LEASE);
    expect(facts).toHaveLength(2);
    // The document proposal rides the SAME transaction as the facts (§4.5).
    expect(proposals.some((p: { kind: string }) => p.kind === 'document')).toBe(true);

    expect(storage.promoteRenderedPages).toHaveBeenCalledWith(CIRCLE, ARRIVAL, LEASE);
    expect(storage.gcRenderStaging).not.toHaveBeenCalled();
    const sent = workers.sendPipelineWork.mock.calls.map((c) => c[0]);
    expect(sent.some((m) => m.stage === 'interpret')).toBe(true);
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(11);
  });

  it('the rendition manifest rides finalize — page count and per-page ext from the render (6B B2)', async () => {
    // 6A M4's fifth parameter, supplied at last: the manifest is derived
    // from the SAME pages the staging writes and the promotion copies, so
    // the recorded extension can never disagree with the stored object
    // (R3/F-8), and partial promotion becomes detectable (R4/F-6).
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.finalizeExtraction).toHaveBeenCalledWith(
      ARRIVAL,
      LEASE,
      expect.any(Array),
      expect.any(Array),
      { page_count: 1, page_exts: ['png'] },
    );
  });

  it('the interpret hand-off carries the facts the attempt just published', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    const handoff = workers.sendPipelineWork.mock.calls
      .map((c) => c[0])
      .find((m) => m.stage === 'interpret');
    expect(handoff.facts).toHaveLength(2);
  });
});

describe('B4 · risk_class is the WORKER’s, stamped before the call', () => {
  it('every published fact carries risk_class, model_id and prompt_version', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    const facts = workers.finalizeExtraction.mock.calls[0][2];
    for (const fact of facts) {
      expect(fact.risk_class).toBeDefined();
      expect(fact.model_id).toBeTruthy();
      expect(fact.prompt_version).toBeTruthy();
    }
  });

  it('in all-high-risk mode even a standard field publishes as high (§6.5)', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    const facts = workers.finalizeExtraction.mock.calls[0][2];
    // document_date is `standard` in the catalogue; with no signed bands the
    // shipping default overrides it. That is the mode, not a bug.
    expect(facts.every((f: { risk_class: string }) => f.risk_class === 'high')).toBe(true);
  });

  it('the model is never asked for risk_class — it is not in what we send', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    const input = ai.extractFromArrival.mock.calls[0][0];
    expect(JSON.stringify(input)).not.toContain('risk_class');
  });
});

describe('B4 · the §4.3 normalize exits land honest states', () => {
  it('needs_password: an encrypted PDF, with the encrypted_pdf reason', async () => {
    render.normalizeArrival.mockReturnValueOnce({ outcome: 'needs_password' });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'extracting',
      'needs_password',
      LEASE,
      'encrypted_pdf',
    );
    expect(ai.extractFromArrival).not.toHaveBeenCalled();
  });

  it('unsupported_type: undecodable bytes, with the unsupported_mime reason', async () => {
    render.normalizeArrival.mockReturnValueOnce({ outcome: 'unsupported_type' });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'extracting',
      'unsupported_type',
      LEASE,
      'unsupported_mime',
    );
    expect(ai.extractFromArrival).not.toHaveBeenCalled();
  });

  // AMENDED at round 16 (Q-B/Q-D, ADR-0023 D9/D10), argued in place. This leg
  // pinned all four ceilings onto `archive_bounds_exceeded`, which described
  // none of them and actively misdescribed the wall-clock case. M7 adds
  // `render_bounds_exceeded` and 4A already shipped `extract_timeout` /
  // `provider_timeout`, so each ceiling now lands its own reason.
  //
  // THE PROPERTY THIS LEG EXISTS FOR IS UNCHANGED and still asserted for
  // every reason: the family-facing terminal is "Couldn't read it" either
  // way, and the provider is NEVER dispatched on a bounds refusal.
  it('a bounds refusal terminalizes as Couldn’t read it — and NEVER dispatches', async () => {
    const expected: Record<string, [string, string]> = {
      page_bound: ['extract_failed', 'render_bounds_exceeded'],
      page_dimensions: ['extract_failed', 'render_bounds_exceeded'],
      output_size: ['extract_failed', 'render_bounds_exceeded'],
      wall_clock: ['extract_timeout', 'provider_timeout'],
    };
    for (const reason of ['page_bound', 'page_dimensions', 'wall_clock', 'output_size']) {
      vi.clearAllMocks();
      workers.claimStage.mockResolvedValue({
        result: 'claimed',
        leaseId: LEASE,
        attemptNo: 1,
        deadline: new Date(Date.now() + 300_000).toISOString(),
      });
      workers.advanceArrival.mockResolvedValue('advanced');
      storage.readArtifactBytes.mockResolvedValue(PDF);
      render.normalizeArrival.mockReturnValueOnce({ outcome: 'refused', reason });
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      expect(workers.advanceArrival, reason).toHaveBeenCalledWith(
        ARRIVAL,
        'extracting',
        expected[reason][0],
        LEASE,
        expected[reason][1],
      );
      expect(ai.extractFromArrival, reason).not.toHaveBeenCalled();
    }
  });

  it('every non-advance GCs the attempt’s rendered pages (§4.5)', async () => {
    render.normalizeArrival.mockReturnValueOnce({ outcome: 'needs_password' });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(storage.gcRenderStaging).toHaveBeenCalledWith(CIRCLE, ARRIVAL, LEASE);
    expect(storage.promoteRenderedPages).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 6B B9 · §6.9: machine-read text staged as the pNNN.txt siblings the
  // slice-5 exit assertion reserved. Staged into the SAME attempt prefix as
  // the pages, so promotion (which copies the prefix by name) carries them
  // with no second path and no manifest change — neither the stored
  // coordinates nor the promoted artifact moves, exactly as pinned.
  // ==========================================================================
  describe('6B B9 · §6.9 OCR — image-only sources gain their .txt siblings', () => {
    function txtStagings() {
      return storage.writeRenderStaging.mock.calls.filter((c) => String(c[0]).endsWith('.txt'));
    }

    it('a scanned PDF’s page text is staged at the reserved sibling key, as utf-8 text', async () => {
      render.normalizeArrival.mockReturnValueOnce({
        outcome: 'rendered',
        sourceClass: 'scanned_pdf',
        pageCount: 1,
        pages: [PAGE],
        text: null,
      });
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));

      expect(ocr.ocrRenderedPages).toHaveBeenCalledTimes(1);
      const staged = txtStagings();
      expect(staged).toHaveLength(1);
      expect(staged[0][0]).toBe(`render/attempt/${CIRCLE}/${ARRIVAL}/${LEASE}/p001.txt`);
      expect(new TextDecoder().decode(staged[0][1] as Uint8Array)).toBe('Amoxicillin 500 mg');
      expect(staged[0][2]).toBe('text/plain; charset=utf-8');
      // Promotion is untouched: the sibling rides the same prefix copy.
      expect(storage.promoteRenderedPages).toHaveBeenCalledWith(CIRCLE, ARRIVAL, LEASE);
    });

    it('a photo is image-only too', async () => {
      render.normalizeArrival.mockReturnValueOnce({
        outcome: 'rendered',
        sourceClass: 'photo',
        pageCount: 1,
        pages: [PAGE],
        text: null,
      });
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      expect(ocr.ocrRenderedPages).toHaveBeenCalledTimes(1);
    });

    it('a born-digital PDF is NOT machine-read — it has a text layer already', async () => {
      // The default beforeEach mock is born_digital_pdf.
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      expect(ocr.ocrRenderedPages).not.toHaveBeenCalled();
      expect(txtStagings()).toHaveLength(0);
    });

    it('an email rendition is NOT machine-read — the body IS text, and OCR of a rendering of text manufactures errors', async () => {
      render.normalizeArrival.mockReturnValueOnce({
        outcome: 'rendered',
        sourceClass: 'email_text',
        pageCount: 1,
        pages: [PAGE],
        text: 'Amoxicillin 500 mg',
      });
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      expect(ocr.ocrRenderedPages).not.toHaveBeenCalled();
    });

    it('poor confidence stages the EMPTY sibling — offered honestly, never garbage (§6.9)', async () => {
      render.normalizeArrival.mockReturnValueOnce({
        outcome: 'rendered',
        sourceClass: 'scanned_pdf',
        pageCount: 1,
        pages: [PAGE],
        text: null,
      });
      ocr.ocrRenderedPages.mockResolvedValueOnce([{ page: 1, text: '' }]);
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      const staged = txtStagings();
      expect(staged).toHaveLength(1);
      expect(new TextDecoder().decode(staged[0][1] as Uint8Array)).toBe('');
    });

    it('an engine failure never fails the answer — a reading aid is not the pipeline’s spine', async () => {
      render.normalizeArrival.mockReturnValueOnce({
        outcome: 'rendered',
        sourceClass: 'scanned_pdf',
        pageCount: 1,
        pages: [PAGE],
        text: null,
      });
      ocr.ocrRenderedPages.mockRejectedValueOnce(new Error('wasm failed to load'));
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      // The answer still publishes and promotes; the siblings are simply absent.
      expect(workers.finalizeExtraction).toHaveBeenCalled();
      expect(storage.promoteRenderedPages).toHaveBeenCalledWith(CIRCLE, ARRIVAL, LEASE);
      expect(txtStagings()).toHaveLength(0);
    });

    it('ROUND-18 F-2: an absent ENGINE is a §10.4 defect signal, not the same note as an unread page', async () => {
      // Absorbing the failure is right and stays. What was wrong is that the
      // absorption said the SAME thing for "this page could not be read" and
      // "there is no engine on this host" — and the second is D15 finding 3
      // recurring silently, which is the whole of F-2. The signal follows the
      // shape D18/R4-F-10 and R4/F-15 already established on this route.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        render.normalizeArrival.mockReturnValueOnce({
          outcome: 'rendered',
          sourceClass: 'scanned_pdf',
          pageCount: 1,
          pages: [PAGE],
          text: null,
        });
        // The real class, through the same module the route imports it from —
        // the mock spreads `actual`, so an instanceof check sees one constructor.
        const { OcrEngineUnavailable } = await import('@/lib/pipeline/ocr');
        ocr.ocrRenderedPages.mockRejectedValueOnce(
          new OcrEngineUnavailable('tesseract.js/…/index.js', '/app/node_modules/…/index.js'),
        );
        workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
        await route.POST(req('extract'), ctx('extract'));

        const lines = warn.mock.calls.map((c) => String(c[0]));
        expect(lines.some((l) => /§10\.4/.test(l) && /engine/i.test(l))).toBe(true);
        // and it still never fails the answer it aids
        expect(workers.finalizeExtraction).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });
});

describe('B4 · §6.8 — a refusal terminalizes, an outage does NOT', () => {
  it('a refusal lands extract_failed with provider_refusal', async () => {
    ai.extractFromArrival.mockResolvedValueOnce({
      outcome: 'refusal',
      category: 'other',
      modelId: 'claude-opus-5',
      promptVersion: 'v',
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'extracting',
      'extract_failed',
      LEASE,
      'provider_refusal',
    );
    expect(workers.finalizeExtraction).not.toHaveBeenCalled();
  });

  it('an outage finalizes NOTHING — the lease expires and the machinery retries', async () => {
    ai.extractFromArrival.mockResolvedValueOnce({
      outcome: 'unavailable',
      detail: 'overloaded',
      modelId: 'claude-opus-5',
      promptVersion: 'v',
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.advanceArrival).not.toHaveBeenCalled();
    expect(workers.finalizeExtraction).not.toHaveBeenCalled();
    expect(storage.gcRenderStaging).toHaveBeenCalled();
  });

  it('an unparseable answer is a provider_error terminal, not a half-read publication', async () => {
    ai.extractFromArrival.mockResolvedValueOnce({
      outcome: 'invalid_output',
      detail: 'bad json',
      modelId: 'claude-opus-5',
      promptVersion: 'v',
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'extracting',
      'extract_failed',
      LEASE,
      'provider_error',
    );
  });

  it('missing bytes finalize nothing — an honest retry, never an invented verdict', async () => {
    storage.readArtifactBytes.mockResolvedValueOnce(null);
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(ai.extractFromArrival).not.toHaveBeenCalled();
    expect(workers.advanceArrival).not.toHaveBeenCalled();
    expect(workers.finalizeExtraction).not.toHaveBeenCalled();
  });
});

describe('B4 · a lost CAS publishes nothing and keeps nothing', () => {
  it('finalize returning cancelled leaves no promoted pages', async () => {
    workers.finalizeExtraction.mockResolvedValueOnce('cancelled');
    workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
    await route.POST(req('extract'), ctx('extract'));
    expect(storage.promoteRenderedPages).not.toHaveBeenCalled();
    expect(storage.gcRenderStaging).toHaveBeenCalledWith(CIRCLE, ARRIVAL, LEASE);
    const sent = workers.sendPipelineWork.mock.calls.map((c) => c[0]);
    expect(sent.some((m) => m.stage === 'interpret')).toBe(false);
  });
});

// ============================================================================
// Round-16 Q-B and Q-D (ADR-0023 D9, D10) — the four render ceilings stop
// sharing one wrong reason code.
//
// `render.ts` refuses with four NAMED reasons — page_bound, page_dimensions,
// wall_clock, output_size — and normalizeExit collapsed all four onto
// `archive_bounds_exceeded`, whose description reads "Archive
// depth/entries/expansion". For a 250-page PDF that is imprecise. For a
// WALL-CLOCK overrun it records a different event than the one that happened,
// and 4A shipped `extract_timeout` + `provider_timeout` for exactly it —
// already legal edges, already seeded, and never called (R7/F-6).
//
// M7 adds `render_bounds_exceeded` for the three genuine bounds. The
// family-facing label is unchanged in every case: extract_failed and
// extract_timeout both read "Couldn't read it", which is the honest thing to
// say. What changes is that the operational tier can now tell a page bomb
// from a pixel bomb from a timeout — which is precisely the question that
// would have surfaced this round's DPI finding (R3/F-1).
// ============================================================================
describe('Q-B/Q-D · each render ceiling lands its own reason', () => {
  it('a wall-clock overrun is a TIMEOUT, not an archive breach', () => {
    expect(route.normalizeExit!({ outcome: 'refused', reason: 'wall_clock' })).toEqual({
      state: 'extract_timeout',
      reason: 'provider_timeout',
    });
  });

  it.each(['page_bound', 'page_dimensions', 'output_size'] as const)(
    'a %s refusal lands render_bounds_exceeded',
    (reason) => {
      expect(route.normalizeExit!({ outcome: 'refused', reason })).toEqual({
        state: 'extract_failed',
        reason: 'render_bounds_exceeded',
      });
    },
  );

  it('nothing maps to archive_bounds_exceeded any more — it names the archive case', () => {
    for (const reason of ['page_bound', 'page_dimensions', 'wall_clock', 'output_size'] as const) {
      expect(route.normalizeExit!({ outcome: 'refused', reason })?.reason).not.toBe(
        'archive_bounds_exceeded',
      );
    }
  });

  it('the non-refusal exits are untouched', () => {
    expect(route.normalizeExit!({ outcome: 'needs_password' })).toEqual({
      state: 'needs_password',
      reason: 'encrypted_pdf',
    });
    expect(route.normalizeExit!({ outcome: 'unsupported_type' })).toEqual({
      state: 'unsupported_type',
      reason: 'unsupported_mime',
    });
  });
});

// ============================================================================
// R2/F-6 = R7/F-5 (5B queue, step 4) — `usage` is READ. The adapter carried
// §6.6's measurement (cache_creation / cache_read tokens) back on every ok
// result and NOTHING consumed it: no log, no column, no metric — its only
// reader was a shape assertion. "Checked, not assumed" was a struct field
// that got garbage-collected. The consumption site now prints it, in the
// shape this route's other signals use, so ai-provider.md's SMOKE-6 has a
// line to evidence. NO DDL — a log line, not a column.
// ============================================================================
describe('R2/F-6 · provider usage is READ at the consumption site (§6.6, SMOKE-6)', () => {
  it('the extract arm logs the four usage counters, with the VALUES the adapter carried back', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      ai.extractFromArrival.mockResolvedValueOnce({
        ...OK_EXTRACT,
        usage: {
          inputTokens: 4321,
          outputTokens: 987,
          cacheCreationInputTokens: 613,
          cacheReadInputTokens: 1207,
        },
      });
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));

      const line = info.mock.calls.map((c) => String(c[0])).find((l) => /provider usage/.test(l));
      expect(line, 'no usage line was logged').toBeDefined();
      expect(line).toContain(`worker/extract: provider usage for arrival ${ARRIVAL}`);
      expect(line).toContain('input_tokens=4321');
      expect(line).toContain('output_tokens=987');
      expect(line).toContain('cache_creation_input_tokens=613');
      expect(line).toContain('cache_read_input_tokens=1207');
      // …and the publication is untouched by the measurement.
      expect(workers.finalizeExtraction).toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });

  it('a non-ok outcome logs NO usage — there is no measurement to report', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      ai.extractFromArrival.mockResolvedValueOnce({
        outcome: 'unavailable',
        detail: 'fixture: overloaded',
        modelId: 'claude-opus-5',
        promptVersion: 'v',
      });
      workers.readPipelineWork.mockResolvedValueOnce([msg('extract')]);
      await route.POST(req('extract'), ctx('extract'));
      expect(info.mock.calls.some((c) => /provider usage/.test(String(c[0])))).toBe(false);
    } finally {
      info.mockRestore();
    }
  });
});
