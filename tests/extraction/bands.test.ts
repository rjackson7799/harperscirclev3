import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ALL_HIGH,
  BAND_ARTIFACT_ALLOWLIST,
  effectiveRiskClass,
  loadBands,
  type BandArtifact,
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
