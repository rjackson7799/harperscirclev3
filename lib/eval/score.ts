import 'server-only';
import { BAND_FIELDS } from '@/lib/extraction/fields';
import type { CorpusItem } from '@/lib/eval/corpus';

/**
 * The G9 scorer (slice-5 plan B9; TSD §6.10; EVA-01).
 *
 * §6.10: **per-field precision and recall, not one global number.** The bands
 * in §6.5 are per extraction type, so a global score would average a
 * medication dose together with a filing category and hide exactly the
 * failure that matters most. This module therefore emits no global figure at
 * all — not even as a convenience, because a convenience is what gets quoted.
 *
 * Three decisions are argued rather than assumed:
 *
 *   1. **A wrong value is BOTH a false positive and a false negative.** It is
 *      not a miss — we produced something — and not a hit. Counting it once
 *      would let precision and recall flatter each other; counting it twice
 *      is what makes a systematically-misread field visible in both numbers.
 *   2. **A field with no support scores `null`, never 1.0.** Zero over zero is
 *      not perfection. A band signed against a 1.0 that means "never tried" is
 *      the exact false confidence the gate exists to prevent.
 *   3. **An item with no prediction at all is scored as missed, never
 *      skipped.** A refusal, a timeout or a crash on one document must show up
 *      as lost recall; dropping it would quietly improve the score, and the
 *      ids are listed so the reason can be chased.
 *
 * Normalisation is `lower(btrim(...))` — deliberately M5's, so "a match here"
 * and "a match in the stage-2 duplicate predicate" mean the same thing. It is
 * NOT lenient about internal spacing or units: "500mg" is not "500 mg". A
 * looser comparison would report a precision the pipeline does not have.
 */

export type Prediction = {
  itemId: string;
  facts: Array<{ field: string; value: string }>;
};

export type FieldScore = {
  field: string;
  tp: number;
  fp: number;
  fn: number;
  /** null when nothing was produced for this field at all. */
  precision: number | null;
  /** null when the corpus offered nothing to find. */
  recall: number | null;
  /** How many blind items labelled this field — the n behind the numbers. */
  support: number;
};

export type RunScore = {
  fields: FieldScore[];
  /** Items no prediction arrived for. Counted as missed, and NAMED. */
  unscored: string[];
  items: number;
};

/** M5's normalisation, verbatim: `lower(btrim(·))`. Nothing more. */
export function normaliseValue(value: string): string {
  return value.trim().toLowerCase();
}

export function scoreRun(items: CorpusItem[], predictions: Prediction[]): RunScore {
  const byItem = new Map(predictions.map((p) => [p.itemId, p]));
  const counts = new Map<string, { tp: number; fp: number; fn: number; support: number }>();
  const bump = (field: string) => {
    let row = counts.get(field);
    if (!row) {
      row = { tp: 0, fp: 0, fn: 0, support: 0 };
      counts.set(field, row);
    }
    return row;
  };
  for (const field of BAND_FIELDS) bump(field);

  const unscored: string[] = [];

  for (const item of items) {
    const predicted = byItem.get(item.id);
    if (!predicted) unscored.push(item.id);

    const expectedByField = new Map<string, string>();
    for (const labelled of item.labels) expectedByField.set(labelled.field, labelled.value);

    const producedByField = new Map<string, string>();
    for (const fact of predicted?.facts ?? []) {
      // First value wins: a model that emits a field twice has already told
      // us something, and silently taking the last would hide it.
      if (!producedByField.has(fact.field)) producedByField.set(fact.field, fact.value);
    }

    const fields = new Set([...expectedByField.keys(), ...producedByField.keys()]);
    for (const field of fields) {
      const row = bump(field);
      const expected = expectedByField.get(field);
      const produced = producedByField.get(field);
      if (expected !== undefined) row.support++;

      if (expected !== undefined && produced !== undefined) {
        if (normaliseValue(expected) === normaliseValue(produced)) row.tp++;
        else {
          row.fp++;
          row.fn++;
        }
      } else if (expected !== undefined) {
        row.fn++;
      } else if (produced !== undefined) {
        // Produced where the corpus says the field is genuinely absent — the
        // negative examples exist precisely to catch this.
        row.fp++;
      }
    }
  }

  const fields: FieldScore[] = [...counts.entries()]
    .map(([field, row]) => ({
      field,
      tp: row.tp,
      fp: row.fp,
      fn: row.fn,
      precision: row.tp + row.fp === 0 ? null : row.tp / (row.tp + row.fp),
      recall: row.tp + row.fn === 0 ? null : row.tp / (row.tp + row.fn),
      support: row.support,
    }))
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));

  return { fields, unscored, items: items.length };
}
