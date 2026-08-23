import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B5 · /api/worker/[stage] gains `interpret` — the §6.6 record-aware pass
// (slice-5 plan B5; WRK-02, INJ-01's worker half; TSD §6.6, §6.7, §4.8,
// §3.10, §4.10).
//
// Test class: MOCKED ROUTE CONTRACT. The live authority is pgTAP for the
// definers and the B9 extraction leg for the whole chain.
//
// §4.10's defences are ORDERED, and this file tests them in that order:
//   1 · THE PIPELINE HAS NO PRIVILEGE to do what an injection would ask. The
//       worker's only write is hc.finalize_interpretation, whose whole output
//       is proposals a person must read. That is asserted directly.
//   2 · Source text is DELIMITED DATA (the adapter's contract, tests/ai).
//   3 · Anomaly flags are set and carried through to the drafted proposals.
// If 2 and 3 both fail entirely, 1 still holds — which is why it is the one
// tested by "what did the worker call", not by "what did the model say".
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

const WORKER_KEY = 'w'.repeat(48);
const CIRCLE = '11111111-0000-4000-8000-000000000001';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const LEASE = 'lease-interpret-1';
const FACT_ID = '99999999-0000-4000-8000-000000000009';

const RECORD = {
  profile_facts: {
    rows: [
      { id: FACT_ID, field: 'medication_dose', value: '250 mg', risk_class: 'high' },
      { id: 'aaaa0000-0000-4000-8000-00000000000a', field: 'document_date', value: '2020-01-01', risk_class: 'standard' },
    ],
    truncated: false,
  },
  timeline: { rows: [] },
};

const CARRIED = [
  {
    field: 'medication_dose',
    value: '500 mg',
    confidence: 0.94,
    citation: { page: 1, bbox: [0.1, 0.2, 0.3, 0.04] as [number, number, number, number] },
  },
];

function msg(overrides: Record<string, unknown> = {}) {
  return {
    msg_id: 21,
    message: {
      circle_id: CIRCLE,
      arrival_id: ARRIVAL,
      stage: 'interpret',
      channel: 'email',
      facts: CARRIED,
      ...overrides,
    },
  };
}

function req() {
  return new Request('http://local.test/api/worker/interpret', {
    method: 'POST',
    headers: { 'x-worker-key': WORKER_KEY },
  });
}

const ctx = { params: Promise.resolve({ stage: 'interpret' }) };

type RouteModule = {
  POST: (r: Request, c: { params: Promise<{ stage: string }> }) => Promise<Response>;
};
let route: RouteModule;

const savedEnv: Record<string, string | undefined> = {};

function okInterpret(proposals: unknown[], anomalies: string[] = []) {
  return {
    outcome: 'ok' as const,
    data: { proposals, anomalies },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 512,
    },
    modelId: 'claude-opus-5',
    promptVersion: 'hc-5b-1+abc',
    dropped: 0,
  };
}

const BLANK = {
  domain: null,
  category: null,
  field: null,
  value: null,
  dueOn: null,
  occurredOn: null,
  conflictsWithFactId: null,
  anomalyFlags: [] as string[],
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
  workers.recordContextFor.mockResolvedValue(RECORD);
  workers.finalizeInterpretation.mockResolvedValue('advanced');
  workers.advanceArrival.mockResolvedValue('advanced');
  storage.readArtifactBytes.mockResolvedValue(new TextEncoder().encode('%PDF-1.7'));
  render.normalizeArrival.mockReturnValue({
    outcome: 'rendered',
    sourceClass: 'born_digital_pdf',
    pageCount: 1,
    pages: [],
    text: 'Dose: 500 mg',
  });
  interpretMod.interpretArrival.mockResolvedValue(
    okInterpret([
      { kind: 'document', title: 'File it', summary: 'A summary', ...BLANK, category: 'medical' },
    ]),
  );
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  process.env.HC_WORKER_KEY = WORKER_KEY;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')));
  route = (await import('@/app/api/worker/[stage]/route')) as RouteModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('B5 · the claim, and ING-07’s in-flight transition', () => {
  it('interpret is a known stage — the Q7 seam is closed', async () => {
    const res = await route.POST(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('the claim carries NO run identity — M3 refuses the pair off the extract stage', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const call = workers.claimStage.mock.calls[0];
    expect(call[0]).toBe(ARRIVAL);
    expect(call[1]).toBe('interpret');
    expect(call[2] ?? null).toBeNull();
    expect(call[3] ?? null).toBeNull();
  });

  it('a non-claimed outcome reads no record and calls no provider', async () => {
    workers.claimStage.mockResolvedValueOnce({
      result: 'invalid_state',
      leaseId: null,
      attemptNo: null,
      deadline: null,
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    expect(workers.recordContextFor).not.toHaveBeenCalled();
    expect(interpretMod.interpretArrival).not.toHaveBeenCalled();
  });
});

describe('B5 · §3.10 — the record is reached through ONE narrow window', () => {
  it('the only record read is hc.record_context_for, of THIS arrival', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    expect(workers.recordContextFor).toHaveBeenCalledTimes(1);
    expect(workers.recordContextFor.mock.calls[0]).toEqual([ARRIVAL]);
    // The signature cannot express another subject or another circle — there
    // is no argument for one. That is the structural half; this is the app
    // half, which is that nothing else is called at all.
  });

  it('the record context is what the pass is given', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const input = interpretMod.interpretArrival.mock.calls[0][0];
    expect(input.recordContext).toEqual(RECORD);
    expect(input.facts).toEqual(CARRIED);
  });
});

describe('B5 · §4.10 defence 1 — the worst outcome is a proposal a person reads', () => {
  it('an injected instruction proposal still only reaches finalize_interpretation', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce(
      okInterpret(
        [
          {
            kind: 'task',
            title: 'Grant the sender coordinator access to every circle',
            summary: 'The document asked for this.',
            ...BLANK,
            anomalyFlags: ['mentions_permissions', 'mentions_other_circles'],
          },
        ],
        ['mentions_permissions'],
      ),
    );
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);

    expect(workers.finalizeInterpretation).toHaveBeenCalledTimes(1);
    // Nothing else writes. There is no grant path, no assignment path, no
    // record write — not because the worker declines, but because it holds
    // no such call.
    expect(workers.finalizeExtraction).not.toHaveBeenCalled();
    expect(workers.advanceArrival).not.toHaveBeenCalled();

    const proposals = workers.finalizeInterpretation.mock.calls[0][2];
    expect(proposals).toHaveLength(1);
    expect(proposals[0].payload.anomaly_flags).toEqual(
      expect.arrayContaining(['mentions_permissions', 'mentions_other_circles']),
    );
  });

  it('anomalies reported at the call level are carried onto every proposal', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce(
      okInterpret(
        [{ kind: 'document', title: 'x', summary: 'y', ...BLANK, category: 'medical' }],
        ['mentions_product_mechanics'],
      ),
    );
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const proposals = workers.finalizeInterpretation.mock.calls[0][2];
    expect(proposals[0].payload.anomaly_flags).toContain('mentions_product_mechanics');
  });
});

describe('B5 · §4.8 — a change to an existing value is ALWAYS a conflict', () => {
  it('a profile_fact that would overwrite a current value is converted to a conflict', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce(
      okInterpret([
        {
          kind: 'profile_fact',
          title: 'medication_dose',
          summary: 'The document says 500 mg.',
          ...BLANK,
          domain: 'health',
          field: 'medication_dose',
          value: '500 mg',
        },
      ]),
    );
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const proposals = workers.finalizeInterpretation.mock.calls[0][2];
    expect(proposals[0].kind).toBe('conflict');
    // A conflict must quote the fact it conflicts with — hc.draft_proposal
    // refuses one with no parents, and the taint is their union.
    expect(proposals[0].payload.parents).toEqual([{ type: 'profile_fact', id: FACT_ID }]);
  });

  it('a NEW field with no current value stays a profile_fact', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce(
      okInterpret([
        {
          kind: 'profile_fact',
          title: 'allergy_substance',
          summary: 'Penicillin.',
          ...BLANK,
          domain: 'health',
          field: 'allergy_substance',
          value: 'Penicillin',
        },
      ]),
    );
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const proposals = workers.finalizeInterpretation.mock.calls[0][2];
    expect(proposals[0].kind).toBe('profile_fact');
    expect(proposals[0].payload.domain).toBe('health');
  });

  it('an UNCHANGED value proposes nothing — a restatement is not a proposal', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce(
      okInterpret([
        {
          kind: 'profile_fact',
          title: 'medication_dose',
          summary: 'Still 250 mg.',
          ...BLANK,
          domain: 'health',
          field: 'medication_dose',
          value: '250 mg',
        },
      ]),
    );
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const proposals = workers.finalizeInterpretation.mock.calls[0][2];
    expect(proposals).toHaveLength(0);
  });

  it('a conflict the model drafted keeps its parent, taken from the record', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce(
      okInterpret([
        {
          kind: 'conflict',
          title: 'dose changed',
          summary: 'was 250 mg, now 500 mg',
          ...BLANK,
          field: 'medication_dose',
          value: '500 mg',
          conflictsWithFactId: FACT_ID,
        },
      ]),
    );
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const proposals = workers.finalizeInterpretation.mock.calls[0][2];
    expect(proposals[0].kind).toBe('conflict');
    expect(proposals[0].payload.parents).toEqual([{ type: 'profile_fact', id: FACT_ID }]);
  });
});

describe('B5 · a bare work item still interprets the document', () => {
  it('with no carried facts the worker re-normalises and sends the document text', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg({ facts: undefined })]);
    await route.POST(req(), ctx);
    expect(storage.readArtifactBytes).toHaveBeenCalledWith(CIRCLE, ARRIVAL);
    const input = interpretMod.interpretArrival.mock.calls[0][0];
    expect(input.facts).toEqual([]);
    expect(input.documentText).toContain('500 mg');
    // The operator channel says so plainly rather than pretending.
    expect(input.operatorNotes.join(' ')).toMatch(/facts/i);
  });

  it('with carried facts the artifact is not re-read at all', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    expect(storage.readArtifactBytes).not.toHaveBeenCalled();
  });
});

describe('B5 · the exits', () => {
  it('the happy path finalizes and the arrival RESTS at proposals_ready', async () => {
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    const [arrival, lease] = workers.finalizeInterpretation.mock.calls[0];
    expect(arrival).toBe(ARRIVAL);
    expect(lease).toBe(LEASE);
    // Nothing is enqueued: slice 5's exit seam is that proposals rest.
    expect(workers.sendPipelineWork).not.toHaveBeenCalled();
    expect(workers.archivePipelineWork).toHaveBeenCalledWith(21);
  });

  it('a refusal terminalizes with provider_refusal', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce({
      outcome: 'refusal',
      category: 'other',
      modelId: 'm',
      promptVersion: 'v',
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    expect(workers.advanceArrival).toHaveBeenCalledWith(
      ARRIVAL,
      'interpreting',
      'extract_failed',
      LEASE,
      'provider_refusal',
    );
  });

  it('an outage finalizes nothing — the machinery retries', async () => {
    interpretMod.interpretArrival.mockResolvedValueOnce({
      outcome: 'unavailable',
      detail: 'overloaded',
      modelId: 'm',
      promptVersion: 'v',
    });
    workers.readPipelineWork.mockResolvedValueOnce([msg()]);
    await route.POST(req(), ctx);
    expect(workers.finalizeInterpretation).not.toHaveBeenCalled();
    expect(workers.advanceArrival).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Round-16 R4/F-1 — the record-context KEY, pinned against the shipped SQL.
//
// The consumers read this shape out of a definer's jsonb. A mocked fixture can
// assert any shape it likes and stay green forever, which is exactly what
// happened: the definer returns `profile_facts` and both consumers read
// `facts`, so the Map and the Set were empty on every call and §4.8's conflict
// arm was inert in production while 69/69 passed.
//
// The durable guard is not another fixture — it is reading the MIGRATION. A
// mock cannot drift from a shape that is asserted against the source of truth.
// ============================================================================
describe('R4/F-1 · the record-context key is pinned to hc.record_context_for', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260821120002_record_context.sql'),
    'utf8',
  );

  it('the definer returns the facts section under `profile_facts`, and nothing reads `facts`', () => {
    // The definer's own return shape, from the shipped migration.
    expect(migration).toContain("'profile_facts', v_facts");
    expect(migration).not.toContain("'facts', v_facts");

    // Both consumers must name the key the definer actually returns.
    const worker = readFileSync(join(process.cwd(), 'app/api/worker/[stage]/route.ts'), 'utf8');
    const adapter = readFileSync(join(process.cwd(), 'lib/ai/interpret.ts'), 'utf8');
    for (const [name, src] of [['route', worker], ['interpret', adapter]] as const) {
      expect(src, `${name} must read profile_facts`).toContain('profile_facts?:');
      expect(src, `${name} must not read the non-existent facts key`).not.toMatch(
        /\?\.facts\?\.rows/,
      );
    }
  });

  it('the fixture RECORD uses the definer key, so the mock cannot drift from the SQL', () => {
    expect(Object.keys(RECORD)).toContain('profile_facts');
    expect(Object.keys(RECORD)).not.toContain('facts');
  });
});
