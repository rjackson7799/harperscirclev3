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

export type PredictionFact = {
  field: string;
  value: string;
  /** §6.4's {page, bbox} — carried so the citation half can be measured
   *  (6B B10, R3/F-7). Absent on a hit counts as a citation MISS: evidence
   *  a person cannot see is not evidence. */
  citation?: { page: number; bbox: [number, number, number, number] };
};

export type Prediction = {
  itemId: string;
  facts: PredictionFact[];
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
  /** How many RENDERED blind labels this field has — the n behind the
   *  numbers. Counts LABELS, not items (R6/F-10): a two-medication item
   *  contributes two. */
  support: number;
  /** The citation half (R3/F-7), measured on value-hits whose label carries
   *  geometry: did the predicted bbox LAND on the labelled region? */
  citation_hits: number;
  citation_misses: number;
  /** hits / (hits + misses); null when no hit was measurable — never 1.0
   *  for "never tried" (the same zero-over-zero rule as precision). */
  citation_accuracy: number | null;
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

/**
 * R3/F-7's landing predicate: same page, and the intersection covers at
 * least HALF THE SMALLER of the two boxes — tolerant of a tighter or looser
 * crop, intolerant of a box that is mostly somewhere else.
 */
function citationLands(
  citation: PredictionFact['citation'],
  label: { page: number; bbox: [number, number, number, number] },
): boolean {
  if (!citation || citation.page !== label.page) return false;
  const [ax, ay, aw, ah] = citation.bbox;
  const [bx, by, bw, bh] = label.bbox;
  const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  const inter = ix * iy;
  const smaller = Math.min(aw * ah, bw * bh);
  return smaller > 0 && inter >= smaller / 2;
}

export function scoreRun(items: CorpusItem[], predictions: Prediction[]): RunScore {
  const byItem = new Map(predictions.map((p) => [p.itemId, p]));
  const counts = new Map<
    string,
    { tp: number; fp: number; fn: number; support: number; chits: number; cmisses: number }
  >();
  const bump = (field: string) => {
    let row = counts.get(field);
    if (!row) {
      row = { tp: 0, fp: 0, fn: 0, support: 0, chits: 0, cmisses: 0 };
      counts.set(field, row);
    }
    return row;
  };
  for (const field of BAND_FIELDS) bump(field);

  const unscored: string[] = [];

  for (const item of items) {
    const predicted = byItem.get(item.id);
    if (!predicted) unscored.push(item.id);

    // 6B B10 (R6/F-10 + D11's letter): labels are a MULTISET, and only
    // RENDERED labels are recall targets — a label the material carries no
    // rendition of (rendered: false) cannot be returned by any reader, so
    // it never counts as a miss; a production that "matches" it can only be
    // a hallucination or a leak, and falls through to the false-positive
    // arm below exactly like a production on an absent field.
    const expectedByField = new Map<string, Array<{ value: string; page: number; bbox: [number, number, number, number] }>>();
    for (const labelled of item.labels) {
      if (labelled.rendered === false) continue;
      const list = expectedByField.get(labelled.field) ?? [];
      list.push({ value: labelled.value, page: labelled.page, bbox: labelled.bbox });
      expectedByField.set(labelled.field, list);
    }

    const producedByField = new Map<string, PredictionFact[]>();
    for (const fact of predicted?.facts ?? []) {
      const list = producedByField.get(fact.field) ?? [];
      list.push(fact);
      producedByField.set(fact.field, list);
    }

    const fields = new Set([...expectedByField.keys(), ...producedByField.keys()]);
    for (const field of fields) {
      const row = bump(field);
      const labels = expectedByField.get(field) ?? [];
      row.support += labels.length;

      // Greedy per-label matching: each label is satisfied by AT MOST ONE
      // produced fact of the same normalised value (R6/F-10 — a duplicate
      // production is a false positive, and the first multi-valued item no
      // longer halves its claimed support).
      const unused = [...(producedByField.get(field) ?? [])];
      for (const label of labels) {
        const at = unused.findIndex((f) => normaliseValue(f.value) === normaliseValue(label.value));
        if (at >= 0) {
          const [fact] = unused.splice(at, 1);
          row.tp++;
          // The citation half (R3/F-7), measured on the hit.
          if (citationLands(fact.citation, label)) row.chits++;
          else row.cmisses++;
        } else {
          row.fn++;
        }
      }
      // Everything left over was produced where the material offers no
      // matching rendered value — absent fields and unrendered labels alike.
      row.fp += unused.length;
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
      citation_hits: row.chits,
      citation_misses: row.cmisses,
      citation_accuracy: row.chits + row.cmisses === 0 ? null : row.chits / (row.chits + row.cmisses),
    }))
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));

  return { fields, unscored, items: items.length };
}
