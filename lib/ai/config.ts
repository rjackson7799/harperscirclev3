import 'server-only';
import { createHash } from 'node:crypto';
import { HIGH_LONG_EDGE, RENDER_CEILINGS, STANDARD_LONG_EDGE } from '@/lib/pipeline/render';
import { EXTRACTION_SCHEMA, INTERPRETATION_SCHEMA, P5_CAPS } from '@/lib/ai/schema';
import { EXTRACT_SYSTEM_PROMPT, INTERPRET_SYSTEM_PROMPT } from '@/lib/ai/prompt';

/**
 * The adapter's configuration (slice-5 plan B3; TSD §6.1, §6.10; M3's
 * `prompt_version` semantics).
 *
 * **The model allowlist is §6.1's table, and it is an ALLOWLIST.** A denylist
 * that named only `claude-fable-5` would wave through the next model nobody
 * cleared. Fable 5 is disqualified by the PRD, not by capability: it requires
 * 30-day data retention and is unavailable in a zero-retention workspace,
 * which G3 makes a hard condition — a request from such a workspace returns
 * `400 invalid_request_error` on every call. Recorded here so it is not
 * rediscovered as an upgrade path.
 *
 * **`prompt_version` names the FULL inference-and-rendering configuration**
 * (M3's pinned semantics): the output schema, the effort and token
 * parameters, the system prompts, and the §6.3 render rules. A change to any
 * covered input bumps it, because §6.10 says a model or prompt change is not
 * shippable without a G9 re-run. That is enforced rather than remembered:
 * `configurationHash()` hashes the whole configuration and the version string
 * CARRIES the hash, so changing the configuration without bumping the version
 * reds `tests/ai/adapter.test.ts`.
 */

/** §6.1's table, exactly. */
export const MODEL_ALLOWLIST = ['claude-opus-5'] as const;

/** Recorded, not merely omitted (§6.1's `claude-fable-5` note). */
export const DISQUALIFIED_MODELS = ['claude-fable-5'] as const;

export type AllowedModel = (typeof MODEL_ALLOWLIST)[number];

export function assertAllowedModel(model: string): AllowedModel {
  if ((DISQUALIFIED_MODELS as readonly string[]).includes(model)) {
    throw new Error(
      `model ${model} is disqualified by G3: it requires 30-day retention and is unavailable in a zero-retention workspace (TSD §6.1)`,
    );
  }
  if (!(MODEL_ALLOWLIST as readonly string[]).includes(model)) {
    throw new Error(`model ${model} is not in the §6.1 allowlist`);
  }
  return model as AllowedModel;
}

/** §6.1: vision on handwriting, pill bottles and photos at an angle is the
 *  whole job, and interpretation is the stage worth being careful about. */
export const EXTRACT_MODEL: AllowedModel = 'claude-opus-5';
export const INTERPRET_MODEL: AllowedModel = 'claude-opus-5';

/**
 * §6.1: `effort` starts at `high` and is swept down per stage against the G9
 * evaluation set. It starts high here because no sweep has been run — the
 * sweep needs the bands, and the bands need the gate.
 */
export const EXTRACT_EFFORT = 'high' as const;
export const INTERPRET_EFFORT = 'high' as const;

/**
 * §6.1's truncation trap: `max_tokens` caps thinking PLUS output together, so
 * sizing it around the expected JSON alone truncates mid-object.
 *
 * The arithmetic, stated so it can be checked: P5 bounds a publication at 200
 * facts; a fact serialises to roughly 60 tokens (field, value, confidence,
 * page, four bbox numbers), so the OUTPUT ceiling is ~12k tokens. Thinking on
 * a careful read of a few pages is the same order again. 24k leaves headroom
 * for both without inviting a runaway.
 *
 * Non-streaming is deliberate. The SDK recommends streaming for very large
 * `max_tokens`, and the honest reason not to here is that **the G9 eval
 * harness runs through the Batch API, which does not stream** — keeping the
 * worker non-streaming means the eval measures the same call shape the worker
 * uses. 24k is comfortably inside the SDK's non-streaming timeout scaling,
 * and our own client timeout (below) is tighter than either.
 */
export const MAX_TOKENS = 24_000;

/** How much of the lease is reserved for finalize after the provider answers
 *  — §4.3's whole point is that finalize always has room to run. */
export const FINALIZE_RESERVE_MS = 20_000;

/** An absolute cap on one provider call, independent of a generous lease. */
export const MAX_PROVIDER_TIMEOUT_MS = 240_000;

/**
 * §1.9's check, as code: the client-side timeout is budgeted INSIDE the lease
 * deadline, so a slow provider cannot consume the whole stage and leave
 * finalize with nothing. A deadline already past yields zero — the caller
 * must not dispatch at all.
 */
export function providerTimeoutMs(deadlineIso: string | null, now: number = Date.now()): number {
  if (!deadlineIso) return MAX_PROVIDER_TIMEOUT_MS;
  const remaining = new Date(deadlineIso).getTime() - now;
  if (!Number.isFinite(remaining)) return MAX_PROVIDER_TIMEOUT_MS;
  const budget = remaining - FINALIZE_RESERVE_MS;
  if (budget <= 0) return 0;
  return Math.min(budget, MAX_PROVIDER_TIMEOUT_MS);
}

/**
 * Everything `prompt_version` covers. The eval manifest stores the hash of
 * this object; `(model_id, prompt_version)` is its public identity (§6.10,
 * M3's normative key kept).
 */
export function inferenceConfiguration(): Record<string, unknown> {
  return {
    model_id: { extract: EXTRACT_MODEL, interpret: INTERPRET_MODEL },
    prompt_version: PROMPT_VERSION_NAME,
    effort: { extract: EXTRACT_EFFORT, interpret: INTERPRET_EFFORT },
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    caps: P5_CAPS,
    schema: { extraction: EXTRACTION_SCHEMA, interpretation: INTERPRETATION_SCHEMA },
    prompts: { extract: EXTRACT_SYSTEM_PROMPT, interpret: INTERPRET_SYSTEM_PROMPT },
    // §6.3's render rules are part of the configuration: a citation is only
    // meaningful against the rendering it was produced from.
    render: {
      standard_long_edge: STANDARD_LONG_EDGE,
      high_long_edge: HIGH_LONG_EDGE,
      ceilings: RENDER_CEILINGS,
    },
  };
}

/** Deterministic across processes: keys sorted, no timestamps, no randomness. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

export function configurationHash(): string {
  return createHash('sha256').update(canonical(inferenceConfiguration())).digest('hex').slice(0, 16);
}

/** The human half of the pair. The hash rides with it (below) so the two can
 *  never drift; this constant is what a person reads in a commit message. */
const PROMPT_VERSION_NAME = 'hc-5b-1';

/**
 * `<name>+<configuration hash>`. Bumping the name without the configuration
 * changing is harmless; changing the configuration without bumping is not,
 * and reds in tests/ai/adapter.test.ts — which is §6.10's "not shippable
 * without a re-run" made mechanical.
 */
export const PROMPT_VERSION: string = `${PROMPT_VERSION_NAME}+${configurationHash()}`;
