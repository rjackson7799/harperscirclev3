import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BAND_FIELDS, riskClassFor, type RiskClass } from '@/lib/extraction/fields';

/**
 * The confidence bands, and why loading them is the interesting part
 * (slice-5 plan B4; TSD §6.5, §6.10; PRD §6.4; EVA-01).
 *
 * §6.5: **until the G9 set exists, every field is treated as high-risk.** The
 * plan makes that structural rather than configured — "high-risk is the
 * code-level fallback; calibrated bands load ONLY from an allowlisted eval
 * artifact whose configuration hash matches the running (model_id,
 * prompt_version) manifest, and a missing, stale, altered or partial artifact
 * fails closed to all-high."
 *
 * Four properties do the work:
 *
 *   1. **The allowlist is a list of DIGESTS, checked into the repo.** Bands
 *      are enabled by a commit that records the exact bytes an owner signed,
 *      not by a file appearing at a path. An altered artifact is a different
 *      digest, so tampering fails closed rather than succeeding quietly.
 *   2. **The artifact must match the running configuration**, on all three of
 *      model, prompt version and configuration hash — §6.10's "a model or
 *      prompt change is not shippable without a re-run", enforced.
 *   3. **Partial is refused wholesale.** One banded field short and NO field
 *      gets bands. Half-calibrated is the state where someone believes the
 *      numbers most and deserves them least.
 *   4. **The artifact must name the BLIND partition.** A score measured on
 *      the development set is not a band; B1's whole partition discipline
 *      exists to make that distinction real, and it would be pointless if
 *      the loader accepted either.
 *
 * The G9 gate itself closes at owner sign-off of the bands, against a
 * completed BLIND run, before any real document — never quietly, and never
 * as a side effect of a deploy.
 */

export type BandThresholds = { high: number; medium: number };

export type BandArtifact = {
  model_id: string;
  prompt_version: string;
  configuration_hash: string;
  generated_at: string;
  corpus_partition: string;
  fields: Record<string, { precision: number; recall: number; high: number; medium: number }>;
};

export type BandMode =
  | { mode: 'all_high'; reason: AllHighReason }
  | { mode: 'calibrated'; bands: Record<string, BandThresholds>; artifact: BandArtifact };

export type AllHighReason =
  | 'no_signed_artifact'
  | 'artifact_missing'
  | 'artifact_unreadable'
  | 'artifact_not_allowlisted'
  | 'artifact_stale'
  | 'artifact_partial'
  | 'artifact_not_blind';

/** The shipping default, as a value so callers can name it. */
export const ALL_HIGH: BandMode = { mode: 'all_high', reason: 'no_signed_artifact' };

/**
 * The sha256 of every eval artifact an owner has signed at the G9 gate.
 *
 * **EMPTY, deliberately.** G9 has not signed anything: slice 5 ships in
 * all-high-risk mode, which §6.5 calls the shipping default rather than a
 * degraded state. Adding a digest here is the act of opening the gate, and it
 * belongs in the same commit as the ADR that records the sign-off.
 */
export const BAND_ARTIFACT_ALLOWLIST: readonly string[] = [];

/**
 * Where the signed artifact lives, if anywhere: an ABSOLUTE path, supplied by
 * deploy configuration.
 *
 * Absolute-only is not fussiness. A project-relative default resolved through
 * `process.cwd()` makes the bundler trace the whole repository into the
 * server output — Turbopack says so out loud ("Dynamic filesystem access
 * causes tracing of the whole project"), and the whole repository includes
 * `fixtures/g9`. Requiring an absolute path keeps the worker's bundle to the
 * worker, and it makes shipping the artifact an explicit deploy decision
 * (an `ai-provider.md` row at the G9 gate) rather than a file that happens to
 * be in the tree.
 */
export function configuredArtifactPath(): string | null {
  const configured = process.env.HC_BANDS_ARTIFACT;
  return configured && configured.length > 0 ? configured : null;
}

export type RunningIdentity = {
  modelId: string;
  promptVersion: string;
  configurationHash: string;
};

export type LoadBandsOptions = {
  running: RunningIdentity;
  allowlist?: readonly string[];
  artifactPath?: string;
};

function allHigh(reason: AllHighReason): BandMode {
  return { mode: 'all_high', reason };
}

export function loadBands(options: LoadBandsOptions): BandMode {
  const mode = resolveBands(options);
  // 6B B4 (R1/F-6): a NON-DEFAULT all-high says so out loud. The shipping
  // default — nothing signed, nothing configured — is the mode, not an
  // event, and stays quiet. But every OTHER all-high reason means an owner
  // completed G9 steps (a digest in the allowlist, a path in the deploy)
  // and the artifact still did not load: without this line that state is
  // indistinguishable from the default at every call site, forever.
  if (mode.mode === 'all_high' && mode.reason !== 'no_signed_artifact') {
    console.warn(
      `bands: ALL-HIGH fallback where a signed artifact was expected — reason ${mode.reason} ` +
        `(HC_BANDS_ARTIFACT=${options.artifactPath ?? configuredArtifactPath() ?? '(unset)'}); ` +
        `every field publishes high until this is resolved`,
    );
  }
  return mode;
}

function resolveBands(options: LoadBandsOptions): BandMode {
  const allowlist = options.allowlist ?? BAND_ARTIFACT_ALLOWLIST;
  if (allowlist.length === 0) return allHigh('no_signed_artifact');

  const file = options.artifactPath ?? configuredArtifactPath();
  // No path configured, or a relative one: nothing to load, fail closed.
  if (!file || !path.isAbsolute(file)) return allHigh('artifact_missing');

  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    return allHigh('artifact_missing');
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  if (!allowlist.includes(digest)) return allHigh('artifact_not_allowlisted');

  let artifact: BandArtifact;
  try {
    artifact = JSON.parse(bytes.toString('utf8')) as BandArtifact;
  } catch {
    return allHigh('artifact_unreadable');
  }
  // `typeof null === 'object'` — without the null check a `fields: null`
  // artifact walks past this guard and THROWS at the field loop, the one
  // malformed shape that did not fail closed (R1/F-4; in the worker that
  // throw is an unacked-redelivery poison loop).
  if (
    !artifact ||
    typeof artifact !== 'object' ||
    typeof artifact.fields !== 'object' ||
    artifact.fields === null
  ) {
    return allHigh('artifact_unreadable');
  }

  if (artifact.corpus_partition !== 'blind') return allHigh('artifact_not_blind');

  if (
    artifact.model_id !== options.running.modelId ||
    artifact.prompt_version !== options.running.promptVersion ||
    artifact.configuration_hash !== options.running.configurationHash
  ) {
    return allHigh('artifact_stale');
  }

  const bands: Record<string, BandThresholds> = {};
  for (const field of BAND_FIELDS) {
    const row = artifact.fields[field];
    if (
      !row ||
      typeof row.high !== 'number' ||
      typeof row.medium !== 'number' ||
      !(row.high > row.medium) ||
      !(row.medium >= 0) ||
      !(row.high <= 1)
    ) {
      return allHigh('artifact_partial');
    }
    bands[field] = { high: row.high, medium: row.medium };
  }

  return { mode: 'calibrated', bands, artifact };
}

/**
 * The class one fact publishes with.
 *
 * In all-high mode this is `high` for EVERY field — that is the mode, not a
 * bug: PRD §6.4's rendering consequences (never pre-selected, crop on screen
 * before approve activates) apply to everything until the bands are signed.
 *
 * In calibrated mode the catalogue decides again — and §6.4's high-risk list
 * still overrides confidence entirely, because risk is not confidence.
 */
export function effectiveRiskClass(field: string, value: unknown, mode: BandMode): RiskClass {
  if (mode.mode === 'all_high') return 'high';
  return riskClassFor(field, value);
}

/**
 * PRD §6.4's three rendering bands, as a DISCRIMINATED result (Q4 SETTLED at
 * the slice-6 gate; 6B B4 is the change). The review screen computes this at
 * RENDER time from the run's `(model_id, prompt_version)` pair — nothing
 * stores a band on a fact, because a band is a property of the CALIBRATION,
 * not of the fact, and storing one would freeze a calibration into the
 * record and make every re-calibration a data migration.
 *
 * Three states, because `null` used to mean two different facts at once:
 *
 *   · `all_high` — no band exists for ANYTHING, by design. §6.5's shipping
 *     mode; the screen renders it ONCE, globally.
 *   · `banded` — this field's calibrated band for this confidence.
 *   · `uncalibrated` — the run is calibrated and THIS field is not in it
 *     (R6/F-11's reachable state: non-banded fields get artifact rows no
 *     band covers). Rendered per fact, honestly — never as an unremarkable
 *     low.
 */
export type ConfidenceBandResult =
  | { kind: 'all_high' }
  | { kind: 'banded'; band: 'high' | 'medium' | 'low' }
  | { kind: 'uncalibrated' };

export function confidenceBand(
  field: string,
  confidence: number,
  mode: BandMode,
): ConfidenceBandResult {
  if (mode.mode === 'all_high') return { kind: 'all_high' };
  const thresholds = mode.bands[field];
  if (!thresholds) return { kind: 'uncalibrated' };
  if (confidence >= thresholds.high) return { kind: 'banded', band: 'high' };
  if (confidence >= thresholds.medium) return { kind: 'banded', band: 'medium' };
  return { kind: 'banded', band: 'low' };
}
