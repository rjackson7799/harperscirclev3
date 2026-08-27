import 'server-only';
import type { BandThresholds } from '@/lib/extraction/bands';
import type { FieldScore } from '@/lib/eval/score';

/**
 * THE THRESHOLD RULE (6B B10; R6/F-4; docs/eval/g9-corpus-spec.md §6.A is
 * the prose authority, this module is its arithmetic).
 *
 * The harness used to write manifest rows of {precision, recall, support,
 * tp, fp, fn} — and `loadBands` requires {precision, recall, high, medium},
 * so every artifact it produced was rejected as `artifact_partial` FOREVER,
 * indistinguishable at the call site from the shipping default. And nobody
 * had written down how a measured number becomes a threshold, so the first
 * signable artifact would have been improvised at the meeting where the
 * gate failed.
 *
 * The rule, mechanical:
 *
 *   1. THE FLOORS GATE ENTRY. A field's manifest row carries the
 *      {high, medium} pair only when its measured precision and recall
 *      clear the §6 floors, its support clears the §4 minimum, and its
 *      citation accuracy is MEASURED and clears CITATION_FLOOR — R3/F-7's
 *      teeth: a model with perfect values and uniformly wrong boxes cannot
 *      sign, because the box is what a person is shown before approving.
 *   2. THE PAIR ITSELF IS PRD §6.4's DEFAULTS — high ≥ 0.85, medium ≥ 0.60.
 *      This rule never computes a threshold from the measurements; moving a
 *      pair off the defaults is a per-field OWNER decision on per-field
 *      evidence (confidence-vs-accuracy, not precision), recorded at the
 *      gate.
 *   3. AN ARTIFACT IS SIGNABLE only when EVERY banded field cleared. An
 *      unsignable manifest omits the pairs it did not earn, and `loadBands`'
 *      own `artifact_partial` guard fails it closed to all-high —
 *      enforcement stays exactly where it always was.
 */

/** PRD §6.4's confidence-band thresholds — the pair every cleared field
 *  carries until an owner moves it on per-field evidence. */
export const BAND_DEFAULTS: BandThresholds = { high: 0.85, medium: 0.6 };

/** The citation-accuracy floor a field must clear to sign (R3/F-7): at
 *  least nine of ten value-hits must land their box on the labelled
 *  region. Below this, the crop a person is shown is routinely wrong,
 *  and §6.4's evidence-before-approval rule is decorative. */
export const CITATION_FLOOR = 0.9;

/** The §6 acceptance floors, mirrored from docs/eval/g9-corpus-spec.md —
 *  what the PRODUCT requires before a field ships at all. The spec table
 *  is the authority; tests/eval/thresholds.test.ts pins the mirror. */
export const FIELD_FLOORS: Record<string, { precision: number; recall: number }> = {
  medication_name: { precision: 0.98, recall: 0.95 },
  medication_dose: { precision: 0.98, recall: 0.95 },
  medication_frequency: { precision: 0.95, recall: 0.9 },
  allergy_substance: { precision: 0.98, recall: 0.95 },
  member_id: { precision: 0.95, recall: 0.9 },
  policy_number: { precision: 0.95, recall: 0.9 },
  coverage_determination: { precision: 0.9, recall: 0.85 },
  provider: { precision: 0.95, recall: 0.9 },
  amount: { precision: 0.95, recall: 0.9 },
  appointment_date: { precision: 0.95, recall: 0.9 },
  appointment_time: { precision: 0.95, recall: 0.9 },
  document_date: { precision: 0.95, recall: 0.95 },
};

export type BandRow = {
  precision: number | null;
  recall: number | null;
  support: number;
  tp: number;
  fp: number;
  fn: number;
  citation_accuracy: number | null;
  /** Present ONLY when the field cleared every floor — the shape loadBands
   *  requires, withheld from a row that did not earn it. */
  high?: number;
  medium?: number;
};

export type BandRows = {
  rows: Record<string, BandRow>;
  /** True only when EVERY banded field cleared. */
  signable: boolean;
  /** field → the named reasons it did not clear. Empty when signable. */
  unsignable: Record<string, string[]>;
};

export function bandRowsFor(fields: FieldScore[], minSupport: number): BandRows {
  const rows: Record<string, BandRow> = {};
  const unsignable: Record<string, string[]> = {};

  for (const [field, floors] of Object.entries(FIELD_FLOORS)) {
    const f = fields.find((s) => s.field === field);
    const reasons: string[] = [];
    if (!f || f.precision === null || f.recall === null) {
      reasons.push('no_measurement');
    } else {
      if (f.precision < floors.precision) reasons.push('precision_below_floor');
      if (f.recall < floors.recall) reasons.push('recall_below_floor');
    }
    if ((f?.support ?? 0) < minSupport) reasons.push('support_below_minimum');
    if (f && f.citation_accuracy === null) reasons.push('citation_unmeasured');
    else if (f && f.citation_accuracy !== null && f.citation_accuracy < CITATION_FLOOR) {
      reasons.push('citation_below_floor');
    }
    if (!f) {
      rows[field] = {
        precision: null,
        recall: null,
        support: 0,
        tp: 0,
        fp: 0,
        fn: 0,
        citation_accuracy: null,
      };
      unsignable[field] = reasons;
      continue;
    }
    const row: BandRow = {
      precision: f.precision,
      recall: f.recall,
      support: f.support,
      tp: f.tp,
      fp: f.fp,
      fn: f.fn,
      citation_accuracy: f.citation_accuracy,
    };
    if (reasons.length === 0) {
      row.high = BAND_DEFAULTS.high;
      row.medium = BAND_DEFAULTS.medium;
    } else {
      unsignable[field] = reasons;
    }
    rows[field] = row;
  }

  return { rows, signable: Object.keys(unsignable).length === 0, unsignable };
}
