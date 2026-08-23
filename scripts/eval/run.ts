// ============================================================================
// THE G9 EVALUATION HARNESS (slice-5 plan B9; TSD §6.10; EVA-01).
//
//   node scripts/ts-run.mjs scripts/eval/run.ts --submit
//   node scripts/ts-run.mjs scripts/eval/run.ts --collect <batch_id>
//   node scripts/ts-run.mjs scripts/eval/run.ts --dry-run
//
// THIS IS THE ONLY REAL-KEY PATH IN THE PROJECT. G9/G3's standing constraint
// (Q5, ratified): fixtures only, CI keyless, and the eval harness the sole
// place an Anthropic credential is ever used — over SYNTHETIC material, never
// a real family's document, at any stage.
//
// It reads the BLIND partition and nothing else. `lib/eval/blind` is
// §1.7-fenced to exactly this directory, so a prompt cannot be tuned against
// the scored set by accident — which is what makes "blind" a property of the
// tree rather than of anyone's discipline.
//
// It runs through the BATCH API at 50% of standard price (§6.10), because a
// gate you cannot afford to re-run is a gate that stops being re-run. Batch is
// also why this is two commands: submit, then collect. A batch completes
// within an hour typically and 24 hours at worst; holding a process open for
// that is how runs get lost.
//
// EVERY RUN WRITES AN IMMUTABLE MANIFEST containing the FULL configuration
// hash behind the public `(model_id, prompt_version)` pair (M3's semantics).
// That manifest — not this script's stdout — is what B4's band loader
// allowlists by digest at the G9 sign-off.
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { blindCorpus } from '@/lib/eval/blind';
import { readCorpusFile, corpusMime, type CorpusItem } from '@/lib/eval/corpus';
import { scoreRun, type Prediction } from '@/lib/eval/score';
import { normalizeArrival } from '@/lib/pipeline/render';
import {
  EXTRACT_EFFORT,
  EXTRACT_MODEL,
  MAX_TOKENS,
  PROMPT_VERSION,
  configurationHash,
  inferenceConfiguration,
} from '@/lib/ai/config';
import { EXTRACTION_SCHEMA } from '@/lib/ai/schema';
import { EXTRACT_SYSTEM_PROMPT, delimitedDocumentText } from '@/lib/ai/prompt';

const OUT_DIR = path.join(process.cwd(), 'eval', 'runs');

type Mode = 'submit' | 'collect' | 'dry-run';

function parseArgs(): { mode: Mode; batchId?: string } {
  const argv = process.argv.slice(2);
  if (argv.includes('--dry-run')) return { mode: 'dry-run' };
  const collectAt = argv.indexOf('--collect');
  if (collectAt >= 0) return { mode: 'collect', batchId: argv[collectAt + 1] };
  if (argv.includes('--submit')) return { mode: 'submit' };
  console.error('usage: run.ts --submit | --collect <batch_id> | --dry-run');
  process.exit(2);
}

/**
 * One item's request — built from the SAME schema, prompts and §6.3 render
 * rules the worker uses. That identity is the whole reason this harness is
 * TypeScript rather than a convenient script: §6.10 only means something if
 * the eval measures what production sends.
 */
function requestFor(item: CorpusItem) {
  const bytes = readCorpusFile(item);
  const normalized = normalizeArrival(bytes, corpusMime(item));
  if (normalized.outcome !== 'rendered') {
    return { skipped: normalized.outcome as string };
  }
  const content: Anthropic.ContentBlockParam[] = [];
  for (const page of normalized.pages) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: page.mime,
        data: Buffer.from(page.bytes).toString('base64'),
      },
    });
  }
  if (normalized.text && normalized.text.trim() !== '') {
    content.push({ type: 'text', text: delimitedDocumentText(normalized.text) });
  }
  content.push({
    type: 'text',
    text: `The source is a ${normalized.sourceClass.replace(/_/g, ' ')}. Return the document's facts and its filing summary.`,
  });

  return {
    params: {
      model: EXTRACT_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' as const },
      output_config: {
        effort: EXTRACT_EFFORT,
        format: { type: 'json_schema' as const, schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> },
      },
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user' as const, content }],
    },
  };
}

function manifestSkeleton(): Record<string, unknown> {
  return {
    schema_version: 1,
    // The PUBLIC identity (§6.10, M3's normative key) …
    model_id: EXTRACT_MODEL,
    prompt_version: PROMPT_VERSION,
    // … and the full configuration behind it. A change to ANY covered input
    // is a different hash, and B4 refuses a band artifact whose hash does not
    // match the running one.
    configuration_hash: configurationHash(),
    configuration: inferenceConfiguration(),
    corpus_partition: 'blind',
    sdk_version: (Anthropic as unknown as { VERSION?: string }).VERSION ?? 'unknown',
  };
}

function writeManifest(name: string, body: Record<string, unknown>): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  const json = `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(file, json, { flag: 'wx' });
  const digest = createHash('sha256').update(json).digest('hex');
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
  console.log(`sha256 ${digest}`);
  return digest;
}

async function main(): Promise<void> {
  const { mode, batchId } = parseArgs();
  const items = blindCorpus().filter((i) => i.expected_outcome === 'extracted');
  console.log(`G9 harness · BLIND partition · ${items.length} scorable items`);
  console.log(`model ${EXTRACT_MODEL} · prompt_version ${PROMPT_VERSION}`);

  if (mode === 'dry-run') {
    // Everything except the credential. Proves the corpus renders and the
    // requests build, which is the half that breaks silently.
    let ok = 0;
    for (const item of items) {
      const built = requestFor(item);
      if ('skipped' in built) {
        console.log(`  SKIP ${item.id}: ${built.skipped}`);
        continue;
      }
      ok++;
    }
    console.log(`${ok}/${items.length} requests build; NOTHING was sent.`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY is not set. This harness is the SOLE real-key path (G9/G3);\n' +
        'it is never run in CI and never sees a real family document.',
    );
    process.exit(2);
  }
  const client = new Anthropic();

  if (mode === 'submit') {
    const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [];
    for (const item of items) {
      const built = requestFor(item);
      if ('skipped' in built) {
        console.log(`  SKIP ${item.id}: ${built.skipped}`);
        continue;
      }
      requests.push({
        custom_id: item.id,
        params: built.params as unknown as Anthropic.Messages.Batches.BatchCreateParams.Request['params'],
      });
    }
    const batch = await client.messages.batches.create({ requests });
    console.log(`batch ${batch.id} · ${batch.processing_status}`);
    console.log(`collect with: node scripts/ts-run.mjs scripts/eval/run.ts --collect ${batch.id}`);
    return;
  }

  // ── collect ───────────────────────────────────────────────────────────────
  if (!batchId) {
    console.error('--collect needs a batch id');
    process.exit(2);
  }
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status !== 'ended') {
    console.log(`batch ${batchId} is ${batch.processing_status} — not ready`);
    process.exit(1);
  }

  const predictions: Prediction[] = [];
  const failures: Array<{ id: string; reason: string }> = [];
  for await (const result of await client.messages.batches.results(batchId)) {
    // Results arrive in ANY order — keyed by custom_id, never by position.
    if (result.result.type !== 'succeeded') {
      failures.push({ id: result.custom_id, reason: result.result.type });
      continue;
    }
    const message = result.result.message;
    if (message.stop_reason === 'refusal') {
      failures.push({ id: result.custom_id, reason: 'refusal' });
      continue;
    }
    if (message.stop_reason === 'max_tokens') {
      failures.push({ id: result.custom_id, reason: 'truncated' });
      continue;
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      const parsed = JSON.parse(text) as { facts?: Array<{ field: string; value: string }> };
      predictions.push({
        itemId: result.custom_id,
        facts: (parsed.facts ?? []).map((f) => ({ field: f.field, value: f.value })),
      });
    } catch {
      failures.push({ id: result.custom_id, reason: 'invalid_output' });
    }
  }

  // A failure is NOT a skip. The item stays in the scored set and its labels
  // become missed recall — a refusal that quietly left the denominator would
  // make the bands better than the pipeline.
  const score = scoreRun(items, predictions);

  const digest = writeManifest(`${batchId}.json`, {
    ...manifestSkeleton(),
    batch_id: batchId,
    request_counts: batch.request_counts,
    items: items.length,
    scored: predictions.length,
    failures,
    fields: Object.fromEntries(
      score.fields.map((f) => [
        f.field,
        {
          precision: f.precision,
          recall: f.recall,
          support: f.support,
          tp: f.tp,
          fp: f.fp,
          fn: f.fn,
        },
      ]),
    ),
    unscored: score.unscored,
  });

  console.log('');
  console.log('field                     precision  recall  support');
  for (const f of score.fields) {
    const p = f.precision === null ? '    —' : f.precision.toFixed(3);
    const r = f.recall === null ? '    —' : f.recall.toFixed(3);
    console.log(`${f.field.padEnd(24)}  ${p.padStart(8)}  ${r.padStart(6)}  ${String(f.support).padStart(7)}`);
  }
  if (failures.length > 0) {
    console.log('');
    console.log(`${failures.length} item(s) produced nothing and are counted as MISSED, not skipped:`);
    for (const f of failures) console.log(`  ${f.id}: ${f.reason}`);
  }
  console.log('');
  console.log('The G9 GATE does not close here. An owner reads these numbers against');
  console.log('docs/eval/g9-corpus-spec.md §6, signs the bands, and records the sign-off');
  console.log('in an ADR — and the same commit adds this digest to');
  console.log(`BAND_ARTIFACT_ALLOWLIST in lib/extraction/bands.ts:  ${digest}`);
}

await main();
