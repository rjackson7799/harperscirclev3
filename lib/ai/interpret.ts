import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { INTERPRET_EFFORT, INTERPRET_MODEL, providerTimeoutMs } from '@/lib/ai/config';
import { ANOMALY_FLAGS, INTERPRETATION_SCHEMA, P5_CAPS } from '@/lib/ai/schema';
import {
  INTERPRET_SYSTEM_PROMPT,
  delimitedDocumentText,
  delimitedFacts,
  delimitedRecord,
} from '@/lib/ai/prompt';
import { callProvider, operatorMessages, type AdapterResult } from '@/lib/ai/client';
import type { ExtractedFact } from '@/lib/ai/extract';

/**
 * The record-aware pass (slice-5 plan B3/B5; TSD §6.6, §6.7, §4.8, §3.10).
 *
 * §6.6: the record context is the same tokens on every arrival for a given
 * subject — M2 shapes it deterministically for exactly this reason — so it
 * sits FIRST, behind a `cache_control` breakpoint, ahead of the volatile
 * arrival content. Whether it actually cached is reported back in
 * `usage.cache_read_input_tokens`: Opus 5's minimum cacheable prefix is 512
 * tokens (down from 1024 on Opus 4.8), which brings small records inside the
 * range — and the minimum is not monotonic across model generations, so it is
 * MEASURED here rather than assumed.
 *
 * §3.10's boundary is re-proven at this layer, not merely inherited: a
 * conflict may only quote a fact the call was actually given. An id the
 * record context did not contain is dropped, so a model that invents or
 * guesses a uuid cannot make the pipeline point at a row it was never shown.
 */

export type DraftProposal = {
  kind: 'document' | 'task' | 'profile_fact' | 'conflict';
  title: string;
  summary: string;
  domain: string | null;
  category: string | null;
  field: string | null;
  value: string | null;
  dueOn: string | null;
  occurredOn: string | null;
  /** Verified against the record context the call was given, or null. */
  conflictsWithFactId: string | null;
  anomalyFlags: string[];
};

export type InterpretOutput = {
  proposals: DraftProposal[];
  anomalies: string[];
};

export type InterpretInput = {
  /** M2's `hc.record_context_for` payload, verbatim. */
  recordContext: unknown;
  facts: ExtractedFact[];
  documentText: string | null;
  operatorNotes: string[];
  deadlineIso: string | null;
  now?: number;
};

const KINDS = new Set(['document', 'task', 'profile_fact', 'conflict']);
const DOMAINS = new Set(['memories', 'health', 'schedule', 'documents', 'finances']);
const CATEGORIES = new Set([
  'medical',
  'medications',
  'insurance',
  'legal',
  'financial',
  'labs',
  'other',
]);
const FLAGS = new Set<string>(ANOMALY_FLAGS);

/** Every profile_fact id the call was given — the only ids a conflict may
 *  name. Read defensively: the shape is M2's, but a malformed payload must
 *  narrow the allowlist, never widen it. */
function knownFactIds(recordContext: unknown): Set<string> {
  const ids = new Set<string>();
  const facts = (recordContext as { profile_facts?: { rows?: unknown } } | null)?.profile_facts
    ?.rows;
  if (Array.isArray(facts)) {
    for (const row of facts) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;
}

export async function interpretArrival(
  input: InterpretInput,
): Promise<AdapterResult<InterpretOutput>> {
  const blocks: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: delimitedRecord(JSON.stringify(input.recordContext)),
      // §6.6: the breakpoint. Everything before and including this block is
      // the stable per-subject prefix; everything after it is this arrival.
      cache_control: { type: 'ephemeral' },
    },
    { type: 'text', text: delimitedFacts(JSON.stringify(input.facts)) },
  ];
  if (input.documentText && input.documentText.trim() !== '') {
    blocks.push({ type: 'text', text: delimitedDocumentText(input.documentText) });
  }
  blocks.push({
    type: 'text',
    text: 'Propose what a person might want done about this document.',
  });

  const result = await callProvider({
    model: INTERPRET_MODEL,
    system: INTERPRET_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: blocks }, ...operatorMessages(input.operatorNotes)],
    schema: INTERPRETATION_SCHEMA as unknown as Record<string, unknown>,
    effort: INTERPRET_EFFORT,
    timeoutMs: providerTimeoutMs(input.deadlineIso, input.now),
  });
  if (result.outcome !== 'ok') return result;

  const data = result.data as Record<string, unknown>;
  const allowedIds = knownFactIds(input.recordContext);
  const proposals: DraftProposal[] = [];
  let dropped = 0;

  const rawProposals = Array.isArray(data.proposals) ? data.proposals : [];
  for (const item of rawProposals.slice(0, P5_CAPS.maxProposals)) {
    const p = item as Record<string, unknown>;
    const kind = typeof p.kind === 'string' && KINDS.has(p.kind) ? p.kind : null;
    if (!kind) {
      dropped++;
      continue;
    }
    const conflictsWith = str(p.conflicts_with_fact_id, 64);
    if (kind === 'conflict' && (!conflictsWith || !allowedIds.has(conflictsWith))) {
      // §4.8 + §3.10: a conflict must quote an EXISTING fact, and only one
      // this call was actually shown. Anything else is dropped — the model
      // cannot reach a row it was never given.
      dropped++;
      continue;
    }
    const domain = str(p.domain, 40);
    if (kind === 'profile_fact' && (!domain || !DOMAINS.has(domain))) {
      // hc.draft_proposal refuses a profile_fact without a domain; refusing
      // it here keeps the failure a counted drop rather than a raised
      // exception that costs the whole publication.
      dropped++;
      continue;
    }
    const category = str(p.category, 40);
    proposals.push({
      kind: kind as DraftProposal['kind'],
      title: str(p.title, 200) ?? 'Proposal',
      summary: str(p.summary, 600) ?? '',
      domain: domain && DOMAINS.has(domain) ? domain : null,
      category: category && CATEGORIES.has(category) ? category : null,
      field: str(p.field, 120),
      value: str(p.value, 4000),
      dueOn: str(p.due_on, 40),
      occurredOn: str(p.occurred_on, 40),
      conflictsWithFactId: kind === 'conflict' ? conflictsWith : null,
      anomalyFlags: Array.isArray(p.anomaly_flags)
        ? p.anomaly_flags.filter((f): f is string => typeof f === 'string' && FLAGS.has(f))
        : [],
    });
  }
  if (rawProposals.length > P5_CAPS.maxProposals) {
    dropped += rawProposals.length - P5_CAPS.maxProposals;
  }

  const anomalies = Array.isArray(data.anomalies)
    ? data.anomalies.filter((f): f is string => typeof f === 'string' && FLAGS.has(f))
    : [];

  return { ...result, data: { proposals, anomalies }, dropped };
}
