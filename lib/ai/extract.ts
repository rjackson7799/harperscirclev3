import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_EFFORT, EXTRACT_MODEL, providerTimeoutMs } from '@/lib/ai/config';
import { EXTRACTION_SCHEMA, P5_CAPS } from '@/lib/ai/schema';
import {
  EXTRACT_SYSTEM_PROMPT,
  delimitedDocumentText,
  extractUserInstruction,
} from '@/lib/ai/prompt';
import {
  callProvider,
  imageBlocks,
  operatorMessages,
  type AdapterResult,
  type ProviderRequest,
} from '@/lib/ai/client';
import { isKnownField } from '@/lib/extraction/fields';
import type { RenderedPage, SourceClass } from '@/lib/pipeline/render';

/**
 * The extraction call (slice-5 plan B3; TSD §6.3–§6.5, §6.8).
 *
 * Vision blocks per B2's rendering, the text layer as delimited data, our own
 * normalised citation geometry in our own schema. The model's answer is then
 * VALIDATED here rather than trusted: structured outputs guarantee a
 * parseable object, not a truthful one, and `extractions.citation`'s CHECK
 * means an uncited fact is unstorable anyway — so a fact whose citation does
 * not resolve is dropped AT THE PIPELINE, with nowhere to hide (§6.4).
 */

export type ExtractedFact = {
  field: string;
  value: string;
  confidence: number;
  citation: { page: number; bbox: [number, number, number, number] };
};

export type ExtractOutput = {
  facts: ExtractedFact[];
  document: { category: string; title: string; summary: string };
};

export type ExtractInput = {
  pages: RenderedPage[];
  text: string | null;
  sourceClass: SourceClass;
  /** §6.7's operator channel — never the arrival's turn. */
  operatorNotes: string[];
  /** The lease deadline; the client timeout is budgeted inside it (§1.9). */
  deadlineIso: string | null;
  now?: number;
};

function isFiniteIn(n: unknown, lo: number, hi: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
}

/**
 * A fact survives only if every part of it is real: a field the catalogue
 * knows, a value inside P5's byte cap, a confidence in range, and a citation
 * that names a page THIS rendering has and a box that fits inside it.
 *
 * Refusing an out-of-range page is not pedantry — a citation that points past
 * the document is exactly the hallucination the crop-on-screen rule exists to
 * catch, and catching it here means it never reaches a person at all.
 */
export function validateFacts(
  raw: unknown,
  pageCount: number,
): { facts: ExtractedFact[]; dropped: number } {
  if (!Array.isArray(raw)) return { facts: [], dropped: 0 };
  const facts: ExtractedFact[] = [];
  let dropped = 0;
  for (const item of raw.slice(0, P5_CAPS.maxFacts)) {
    const fact = item as Record<string, unknown>;
    const citation = fact.citation as Record<string, unknown> | undefined;
    const bbox = citation?.bbox as unknown;
    const ok =
      typeof fact.field === 'string' &&
      isKnownField(fact.field) &&
      typeof fact.value === 'string' &&
      Buffer.byteLength(fact.value, 'utf8') <= P5_CAPS.maxValueBytes &&
      isFiniteIn(fact.confidence, 0, 1) &&
      !!citation &&
      typeof citation.page === 'number' &&
      Number.isInteger(citation.page) &&
      citation.page >= 1 &&
      // pageCount 0 means a text-only source: page 1 is the only legal page.
      citation.page <= Math.max(1, pageCount) &&
      Array.isArray(bbox) &&
      bbox.length === 4 &&
      bbox.every((n) => isFiniteIn(n, 0, 1)) &&
      (bbox[0] as number) + (bbox[2] as number) <= 1.0001 &&
      (bbox[1] as number) + (bbox[3] as number) <= 1.0001 &&
      (bbox[2] as number) > 0 &&
      (bbox[3] as number) > 0;
    if (!ok) {
      dropped++;
      continue;
    }
    const b = bbox as number[];
    facts.push({
      field: fact.field as string,
      value: fact.value as string,
      confidence: fact.confidence as number,
      citation: { page: citation!.page as number, bbox: [b[0], b[1], b[2], b[3]] },
    });
  }
  if (Array.isArray(raw) && raw.length > P5_CAPS.maxFacts) {
    dropped += raw.length - P5_CAPS.maxFacts;
  }
  return { facts, dropped };
}

const CATEGORIES = new Set([
  'medical',
  'medications',
  'insurance',
  'legal',
  'financial',
  'labs',
  'other',
]);

/** What an extraction request is built FROM: B2's rendering, exactly as the
 *  worker and the G9 harness both receive it from `normalizeArrival`. */
export type ExtractionSource = Pick<ExtractInput, 'pages' | 'text' | 'sourceClass'>;

/**
 * THE ONE construction site for an extraction request's user turn (round-16
 * R2/F-4, 5B queue step 4). `scripts/eval/run.ts` used to assemble these same
 * three steps by hand beside the worker's copy, so the bands would have been
 * signed from a request equal to production's only by inspection. Now the
 * harness calls this and builds nothing.
 */
export function extractionBlocks(source: ExtractionSource): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (source.pages.length > 0) blocks.push(...imageBlocks(source.pages));
  // §6.3: born-digital PDFs pass the text layer ALONGSIDE the page images —
  // the text carries the characters, the image carries the geometry.
  if (source.text && source.text.trim() !== '') {
    blocks.push({ type: 'text', text: delimitedDocumentText(source.text) });
  }
  // The user-turn instruction lives in lib/ai/prompt.ts and is a covered
  // input of the identity hash (R2/F-3's residue) — never a literal here.
  blocks.push({ type: 'text', text: extractUserInstruction(source.sourceClass) });
  return blocks;
}

/**
 * The extraction call as the worker makes it, minus the timeout (that is the
 * lease's business, not the request's). `extractFromArrival` dispatches this
 * through `callProvider`; the harness puts the same object through
 * `messageParams` and submits it. One call, two dispatchers.
 */
export function extractionCall(source: ExtractionSource, operatorNotes: string[]): ProviderRequest {
  return {
    model: EXTRACT_MODEL,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: extractionBlocks(source) }, ...operatorMessages(operatorNotes)],
    schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    effort: EXTRACT_EFFORT,
  };
}

export async function extractFromArrival(
  input: ExtractInput,
): Promise<AdapterResult<ExtractOutput>> {
  const result = await callProvider({
    ...extractionCall(input, input.operatorNotes),
    timeoutMs: providerTimeoutMs(input.deadlineIso, input.now),
  });
  if (result.outcome !== 'ok') return result;

  const data = result.data as Record<string, unknown>;
  const { facts, dropped } = validateFacts(data.facts, input.pages.length);
  const doc = (data.document ?? {}) as Record<string, unknown>;
  const category = typeof doc.category === 'string' && CATEGORIES.has(doc.category)
    ? doc.category
    : 'other';

  return {
    ...result,
    data: {
      facts,
      document: {
        category,
        title: typeof doc.title === 'string' ? doc.title.slice(0, 200) : 'Document',
        summary: typeof doc.summary === 'string' ? doc.summary.slice(0, 600) : '',
      },
    },
    dropped,
  };
}
