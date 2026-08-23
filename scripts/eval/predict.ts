import { validateFacts } from '@/lib/ai/extract';
import type { Prediction } from '@/lib/eval/score';

/**
 * One item's SCORED prediction — the facts the pipeline would actually
 * publish, not the facts the model returned (round-16 R6/F-6).
 *
 * `--collect` used to parse `{field, value}` straight out of the answer and
 * score it. `extractFromArrival` does not: it runs `validateFacts`, which
 * drops any fact whose field is not catalogued, whose value exceeds the P5
 * cap, whose confidence is outside [0,1], or whose citation names a page this
 * rendering does not have or a bbox that does not fit inside the page.
 *
 * Scoring the unvalidated answer biased the numbers in ONE direction, and it
 * was the unsafe one: a hallucinated-citation fact counted as a true positive
 * to the scorer while being an invisible non-event to the family. The bands
 * an owner signs would have been better than the product they describe.
 *
 * This calls the WORKER's own `validateFacts` rather than reimplementing it,
 * so the two cannot drift — the same reason §6.10 wants the eval to send what
 * the worker sends.
 *
 * `dropped` is returned rather than swallowed: a rising count is a §10.4
 * pipeline signal, and at the gate it is the difference between "the model
 * cannot read this" and "the model reads it and cites it somewhere it isn't".
 *
 * Throws on an unparseable answer — the caller records that as a FAILURE, and
 * a failure is not a skip: the item stays in the scored set and its labels
 * become missed recall.
 */
export function predictionFor(
  itemId: string,
  text: string,
  pageCount: number,
): Prediction & { dropped: number } {
  const parsed = JSON.parse(text) as { facts?: unknown };
  const { facts, dropped } = validateFacts(parsed.facts, pageCount);
  return {
    itemId,
    facts: facts.map((f) => ({ field: f.field, value: f.value })),
    dropped,
  };
}
