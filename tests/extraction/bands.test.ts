import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ALL_HIGH,
  BAND_ARTIFACT_ALLOWLIST,
  confidenceBand,
  effectiveRiskClass,
  loadBands,
  type BandArtifact,
  type BandMode,
} from '@/lib/extraction/bands';
import { BAND_FIELDS } from '@/lib/extraction/fields';

// ============================================================================
// B4 · The all-high-risk mode is STRUCTURAL, not configured (slice-5 plan B4;
// TSD §6.5; PRD §6.4; EVA-01).
//
// High-risk is the CODE-LEVEL FALLBACK. Calibrated bands load only from an
// allowlisted eval artifact whose configuration hash matches the running
// (model_id, prompt_version), and a MISSING, STALE, ALTERED or PARTIAL
// artifact fails closed to all-high. There is a test for each of those four
// shapes, because "fails closed" is a claim about what happens when
// something goes wrong, and the only way to know is to make it go wrong.
//
// A config accident can never enable bands G9 did not sign.
// ============================================================================

const RUNNING = {
  modelId: 'claude-opus-5',
  promptVersion: 'hc-5b-1+deadbeefdeadbeef',
  configurationHash: 'deadbeefdeadbeef',
};

let dir: string | null = null;

function tempArtifact(artifact: unknown): { file: string; sha256: string } {
  dir = dir ?? mkdtempSync(path.join(tmpdir(), 'hc-bands-'));
  const file = path.join(dir, `bands-${Math.random().toString(16).slice(2)}.json`);
  const body = JSON.stringify(artifact, null, 2);
  writeFileSync(file, body);
  return { file, sha256: createHash('sha256').update(body).digest('hex') };
}

function completeArtifact(overrides: Partial<BandArtifact> = {}): BandArtifact {
  return {
    model_id: RUNNING.modelId,
    prompt_version: RUNNING.promptVersion,
    configuration_hash: RUNNING.configurationHash,
    generated_at: '2026-08-22T00:00:00Z',
    corpus_partition: 'blind',
    fields: Object.fromEntries(
      BAND_FIELDS.map((f) => [f, { precision: 0.97, recall: 0.95, high: 0.85, medium: 0.6 }]),
    ),
    ...overrides,
  };
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('B4 · the shipping default is all-high, and it is the CODE fallback', () => {
  it('with no signed artifact in the allowlist, bands are all-high', () => {
    const result = loadBands({ running: RUNNING, allowlist: [], artifactPath: '/nowhere.json' });
    expect(result).toEqual({ mode: 'all_high', reason: 'no_signed_artifact' });
  });

  it('the shipped allowlist is EMPTY — G9 has not signed anything yet', () => {
    // If this ever fails without an owner sign-off recorded in an ADR, the
    // gate was opened by a commit rather than by a decision.
    expect(BAND_ARTIFACT_ALLOWLIST).toEqual([]);
  });

  it('the default load, with no arguments beyond the running identity, is all-high', () => {
    expect(loadBands({ running: RUNNING }).mode).toBe('all_high');
  });

  it('a RELATIVE artifact path is refused — the bundler must not trace the repo', () => {
    // A project-relative path resolved through process.cwd() makes Turbopack
    // trace the whole repository into the server output, fixtures and all.
    const result = loadBands({
      running: RUNNING,
      allowlist: ['0'.repeat(64)],
      artifactPath: 'eval/bands/current.json',
    });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_missing' });
  });
});

describe('B4 · each failure shape fails CLOSED, and says which shape it was', () => {
  it('MISSING: an allowlisted artifact that is not on disk', () => {
    const result = loadBands({
      running: RUNNING,
      allowlist: ['0'.repeat(64)],
      artifactPath: path.join(tmpdir(), 'hc-bands-does-not-exist.json'),
    });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_missing' });
  });

  it('ALTERED: a well-formed artifact whose bytes are not the allowlisted ones', () => {
    const { file } = tempArtifact(completeArtifact());
    const result = loadBands({ running: RUNNING, allowlist: ['0'.repeat(64)], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_not_allowlisted' });
  });

  it('STALE: allowlisted bytes, but the configuration has moved on', () => {
    const { file, sha256 } = tempArtifact(
      completeArtifact({ configuration_hash: 'a-different-hash' }),
    );
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_stale' });
  });

  it('STALE: the same configuration hash but a different model is still stale', () => {
    const { file, sha256 } = tempArtifact(completeArtifact({ model_id: 'claude-sonnet-5' }));
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_stale' });
  });

  it('PARTIAL: one banded field missing means NO field gets bands', () => {
    const artifact = completeArtifact();
    delete artifact.fields[BAND_FIELDS[0]];
    const { file, sha256 } = tempArtifact(artifact);
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_partial' });
  });

  it('MALFORMED: bytes that are allowlisted but not an artifact', () => {
    dir = dir ?? mkdtempSync(path.join(tmpdir(), 'hc-bands-'));
    const file = path.join(dir, 'garbage.json');
    writeFileSync(file, 'not json');
    const sha256 = createHash('sha256').update('not json').digest('hex');
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_unreadable' });
  });

  it('a BLIND-partition artifact is required — a development-set score is not a band', () => {
    const { file, sha256 } = tempArtifact(completeArtifact({ corpus_partition: 'development' }));
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_not_blind' });
  });
});

describe('B4 · a complete, matching, allowlisted artifact calibrates — and only then', () => {
  it('every banded field gets its bands', () => {
    const { file, sha256 } = tempArtifact(completeArtifact());
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result.mode).toBe('calibrated');
    if (result.mode !== 'calibrated') return;
    for (const field of BAND_FIELDS) {
      expect(result.bands[field]).toEqual({ high: 0.85, medium: 0.6 });
    }
  });
});

// ============================================================================
// 6B B4 · Q4 SETTLED as code, and the loader's untested branches tested.
//
// Q4: `confidenceBand` returns a DISCRIMINATED result — `all_high` (no band
// exists for anything, by design) · `banded` · `uncalibrated` (this field was
// never calibrated while its neighbours were, R6/F-11's reachable state) —
// so a caller cannot collapse what the function knows into one nullable.
// The band is computed at RENDER time from the run's (model_id,
// prompt_version) pair and never stored on the fact.
//
// R1/F-4: `typeof null === 'object'`, so `fields: null` passed the shape
// guard and THREW at the field loop — the one malformed shape that did not
// fail closed, and in the worker that throw is an unacked-redelivery poison
// loop. R1/F-7: `artifact_partial` had five rejection conditions and ONE
// test — in the file the packet called "must not be wrong", an untested
// branch is one a refactor can invert. R1/F-6: an owner can complete every
// G9 step and still run all-high forever with no log line saying so.
// ============================================================================

function calibratedMode(): BandMode {
  const { file, sha256 } = tempArtifact(completeArtifact());
  return loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
}

describe('6B B4 · confidenceBand returns THREE states (Q4)', () => {
  it('all-high is its OWN state — global by design, never a nullable collapse', () => {
    expect(confidenceBand('medication_dose', 0.99, ALL_HIGH)).toEqual({ kind: 'all_high' });
  });

  it('a calibrated field bands by its thresholds', () => {
    const mode = calibratedMode();
    expect(confidenceBand('medication_dose', 0.9, mode)).toEqual({ kind: 'banded', band: 'high' });
    expect(confidenceBand('medication_dose', 0.7, mode)).toEqual({
      kind: 'banded',
      band: 'medium',
    });
    expect(confidenceBand('medication_dose', 0.2, mode)).toEqual({ kind: 'banded', band: 'low' });
  });

  it('a field the run never calibrated is UNCALIBRATED — honestly, never an unremarkable low (R6/F-11)', () => {
    const mode = calibratedMode();
    expect(confidenceBand('provider_phone_number', 0.9, mode)).toEqual({ kind: 'uncalibrated' });
  });
});

describe('6B B4 · fields: null fails CLOSED (R1/F-4)', () => {
  it('typeof null === "object" must not walk the shape guard into the field loop', () => {
    const { file, sha256 } = tempArtifact(
      completeArtifact({ fields: null as unknown as BandArtifact['fields'] }),
    );
    const result = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(result).toEqual({ mode: 'all_high', reason: 'artifact_unreadable' });
  });
});

describe('6B B4 · artifact_partial: EVERY rejection condition has its test (R1/F-7)', () => {
  function partialWith(mutate: (fields: BandArtifact['fields']) => void): BandMode {
    const artifact = completeArtifact();
    mutate(artifact.fields);
    const { file, sha256 } = tempArtifact(artifact);
    return loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
  }
  const PARTIAL = { mode: 'all_high', reason: 'artifact_partial' };
  const FIELD = BAND_FIELDS[0];

  it('a banded field MISSING from the artifact', () => {
    expect(partialWith((f) => delete f[FIELD])).toEqual(PARTIAL);
  });
  it('`high` not a number', () => {
    expect(
      partialWith((f) => (f[FIELD].high = 'high' as unknown as number)),
    ).toEqual(PARTIAL);
  });
  it('`medium` not a number', () => {
    expect(
      partialWith((f) => (f[FIELD].medium = null as unknown as number)),
    ).toEqual(PARTIAL);
  });
  it('`high` not strictly above `medium`', () => {
    expect(
      partialWith((f) => {
        f[FIELD].high = 0.6;
        f[FIELD].medium = 0.6;
      }),
    ).toEqual(PARTIAL);
  });
  it('`medium` below zero', () => {
    expect(partialWith((f) => (f[FIELD].medium = -0.1))).toEqual(PARTIAL);
  });
  it('`high` above one', () => {
    expect(partialWith((f) => (f[FIELD].high = 1.2))).toEqual(PARTIAL);
  });
});

describe('6B B4 · a NON-DEFAULT all-high is logged (R1/F-6)', () => {
  it('a configured-but-refused artifact says so out loud instead of silently shipping all-high', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      loadBands({
        running: RUNNING,
        allowlist: ['0'.repeat(64)],
        artifactPath: path.join(tmpdir(), 'hc-bands-not-there.json'),
      });
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes('artifact_missing')),
      ).toBe(true);

      // …and the SHIPPING DEFAULT stays quiet: all-high with nothing signed
      // and nothing configured is the mode, not an event.
      warn.mockClear();
      loadBands({ running: RUNNING, allowlist: [] });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('B4 · risk_class under each mode', () => {
  it('ALL-HIGH: every field is high, whatever the catalogue says', () => {
    expect(effectiveRiskClass('document_date', '2026-03-14', ALL_HIGH)).toBe('high');
    expect(effectiveRiskClass('medication_dose', '500 mg', ALL_HIGH)).toBe('high');
  });

  it('CALIBRATED: the catalogue decides again — but §6.4 high fields stay high', () => {
    const { file, sha256 } = tempArtifact(completeArtifact());
    const mode = loadBands({ running: RUNNING, allowlist: [sha256], artifactPath: file });
    expect(effectiveRiskClass('document_date', '2026-03-14', mode)).toBe('standard');
    expect(effectiveRiskClass('medication_dose', '500 mg', mode)).toBe('high');
    // §6.5's instruction rule survives calibration: it is about the value.
    expect(effectiveRiskClass('document_date', 'do not file before Friday', mode)).toBe('high');
  });
});
