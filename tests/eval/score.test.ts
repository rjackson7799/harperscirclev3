import { describe, expect, it } from 'vitest';
import { normaliseValue, scoreRun, type Prediction } from '@/lib/eval/score';
import type { CorpusItem } from '@/lib/eval/corpus';

// ============================================================================
// B9 · The G9 scorer (slice-5 plan B9; TSD §6.10; EVA-01).
//
// §6.10: **per-field precision and recall, not one global number** — the
// bands in §6.5 are per extraction type, so a global score would average a
// medication dose together with a filing date and hide exactly the failure
// that matters.
//
// Two decisions here are worth arguing rather than assuming:
//
//   · A WRONG VALUE counts as both a false positive and a false negative. It
//     is not a miss (we produced something) and not a hit (it is wrong), and
//     splitting it across both is what keeps precision and recall from each
//     flattering the other.
//   · A field with NO SUPPORT scores `null`, never 1.0. Zero over zero is not
//     perfection, and a band signed against a 1.0 that means "never tried" is
//     the exact false confidence G9 exists to prevent.
// ============================================================================

function item(over: Partial<CorpusItem> = {}): CorpusItem {
  return {
    id: 'x1',
    partition: 'blind',
    document_class: 'discharge_summary',
    source_type: 'born_digital_pdf',
    category: 'medical',
    expected_outcome: 'extracted',
    file: 'blind/x1.pdf',
    bytes: 1,
    sha256: 'a'.repeat(64),
    labels: [],
    absent_fields: [],
    notes: '',
    ...over,
  } as CorpusItem;
}

function label(field: string, value: string, over: Record<string, unknown> = {}) {
  return {
    field,
    value,
    risk_class: 'high' as const,
    page: 1,
    bbox: [0, 0, 1, 1] as [number, number, number, number],
    ...over,
  };
}

function prediction(itemId: string, facts: Array<[string, string]>): Prediction {
  return { itemId, facts: facts.map(([field, value]) => ({ field, value })) };
}

describe('B9 · normalisation matches M5’s, so a match here means a match there', () => {
  it('lower-cases and trims — and nothing else', () => {
    expect(normaliseValue('  500 MG ')).toBe('500 mg');
    expect(normaliseValue('500mg')).not.toBe('500 mg');
  });
});

describe('B9 · per-field precision and recall', () => {
  it('an exact hit is a true positive', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg')] })],
      [prediction('x1', [['medication_dose', '500 mg']])],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose).toMatchObject({ tp: 1, fp: 0, fn: 0, precision: 1, recall: 1, support: 1 });
  });

  it('a WRONG value is both a false positive and a false negative', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg')] })],
      [prediction('x1', [['medication_dose', '250 mg']])],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose).toMatchObject({ tp: 0, fp: 1, fn: 1, precision: 0, recall: 0 });
  });

  it('a MISSED field is a false negative only', () => {
    const result = scoreRun([item({ labels: [label('medication_dose', '500 mg')] })], [prediction('x1', [])]);
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose).toMatchObject({ tp: 0, fp: 0, fn: 1 });
    expect(dose.recall).toBe(0);
    expect(dose.precision).toBeNull();
  });

  it('a field INVENTED on an item that genuinely lacks it is a false positive', () => {
    const result = scoreRun(
      [item({ labels: [], absent_fields: ['document_date'] })],
      [prediction('x1', [['document_date', '2026-03-14']])],
    );
    const date = result.fields.find((f) => f.field === 'document_date')!;
    expect(date).toMatchObject({ tp: 0, fp: 1, fn: 0 });
    expect(date.precision).toBe(0);
  });

  it('correctly NOT producing an absent field scores nothing at all', () => {
    const result = scoreRun([item({ labels: [], absent_fields: ['document_date'] })], [prediction('x1', [])]);
    const date = result.fields.find((f) => f.field === 'document_date');
    expect(date?.tp ?? 0).toBe(0);
    expect(date?.fp ?? 0).toBe(0);
    expect(date?.fn ?? 0).toBe(0);
  });

  it('a field with no support scores NULL, never 1.0', () => {
    const result = scoreRun([item({ labels: [label('medication_dose', '5 mg')] })], [prediction('x1', [['medication_dose', '5 mg']])]);
    const untouched = result.fields.find((f) => f.field === 'appointment_time');
    if (untouched) {
      expect(untouched.precision).toBeNull();
      expect(untouched.recall).toBeNull();
      expect(untouched.support).toBe(0);
    }
  });

  it('an item with NO prediction at all is all false negatives, never skipped', () => {
    // A refusal, a timeout or a crash on one item must show up as missed
    // recall. Dropping the item would quietly improve the score.
    const result = scoreRun([item({ labels: [label('provider', 'Riverbend')] })], []);
    const provider = result.fields.find((f) => f.field === 'provider')!;
    expect(provider.fn).toBe(1);
    expect(result.unscored).toEqual(['x1']);
  });

  // ==========================================================================
  // 6B B10 · R6/F-10: MULTI-VALUED support. The old scorer collapsed expected
  // labels last-wins, took predictions first-wins, and counted support once
  // per ITEM — so the first item with two medications silently halved its
  // claimed support and scored whichever value the collapse happened to keep.
  // Labels are a MULTISET; each label may be satisfied by at most one
  // produced fact; support counts LABELS.
  // ==========================================================================
  it('R6/F-10: an item with TWO medications scores both — support counts LABELS, not items', () => {
    const result = scoreRun(
      [
        item({
          labels: [label('medication_name', 'Amoxicillin'), label('medication_name', 'Warfarin')],
        }),
      ],
      [
        prediction('x1', [
          ['medication_name', 'Warfarin'],
          ['medication_name', 'Amoxicillin'],
        ]),
      ],
    );
    const name = result.fields.find((f) => f.field === 'medication_name')!;
    expect(name).toMatchObject({ tp: 2, fp: 0, fn: 0, support: 2, precision: 1, recall: 1 });
  });

  it('R6/F-10: each label is satisfied AT MOST ONCE — a duplicate production is a false positive', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_name', 'Amoxicillin')] })],
      [
        prediction('x1', [
          ['medication_name', 'Amoxicillin'],
          ['medication_name', 'Amoxicillin'],
        ]),
      ],
    );
    const name = result.fields.find((f) => f.field === 'medication_name')!;
    expect(name).toMatchObject({ tp: 1, fp: 1, fn: 0, support: 1 });
  });

  it('R6/F-10: one of two labels missed is one fn beside one tp, never an average', () => {
    const result = scoreRun(
      [
        item({
          labels: [label('medication_name', 'Amoxicillin'), label('medication_name', 'Warfarin')],
        }),
      ],
      [prediction('x1', [['medication_name', 'Amoxicillin']])],
    );
    const name = result.fields.find((f) => f.field === 'medication_name')!;
    expect(name).toMatchObject({ tp: 1, fp: 0, fn: 1, support: 2, recall: 0.5 });
  });

  // ==========================================================================
  // 6B B10 · D11's letter, encoded: a label records what the item IS;
  // `rendered: false` records that the material carries NO rendition of it
  // (the photo classes never paint a glyph). An unrendered label is EXCLUDED
  // from recall — a flawless reader cannot return it — and a production that
  // "matches" one can only be a hallucination or a leak: a false positive.
  // ==========================================================================
  it('an UNRENDERED label is no recall target — and producing its value anyway is a false positive', () => {
    const result = scoreRun(
      [item({ labels: [label('provider', 'Elmwood Drug', { rendered: false })] })],
      [prediction('x1', [['provider', 'Elmwood Drug']])],
    );
    const provider = result.fields.find((f) => f.field === 'provider')!;
    expect(provider).toMatchObject({ tp: 0, fp: 1, fn: 0, support: 0 });
  });

  it('an unrendered label NOT produced scores nothing at all — the honest non-event', () => {
    const result = scoreRun(
      [item({ labels: [label('provider', 'Elmwood Drug', { rendered: false })] })],
      [prediction('x1', [])],
    );
    const provider = result.fields.find((f) => f.field === 'provider')!;
    expect(provider).toMatchObject({ tp: 0, fp: 0, fn: 0, support: 0 });
  });

  it('scores are keyed per field across MANY items, and never averaged into one number', () => {
    const items = [
      item({ id: 'a', labels: [label('provider', 'A'), label('amount', '$1.00')] }),
      item({ id: 'b', labels: [label('provider', 'B'), label('amount', '$2.00')] }),
    ];
    const result = scoreRun(items, [
      prediction('a', [['provider', 'A'], ['amount', '$9.99']]),
      prediction('b', [['provider', 'B'], ['amount', '$2.00']]),
    ]);
    const provider = result.fields.find((f) => f.field === 'provider')!;
    const amount = result.fields.find((f) => f.field === 'amount')!;
    expect(provider.precision).toBe(1);
    expect(amount.precision).toBe(0.5);
    // No global precision is emitted: §6.10 says per-field, not one number.
    expect(result).not.toHaveProperty('precision');
  });
});

// ============================================================================
// 6B B10 · R3/F-7: CITATION CORRECTNESS IS MEASURED. The harness used to
// discard the citation before scoring — Prediction was {field, value} only —
// so nothing anywhere measured whether a bbox lands on its value, and a
// model with perfect values and uniformly wrong boxes scored 1.00. Boxes are
// what this slice RENDERS (the crop a person must see before approving), so
// the box is part of the answer.
//
// The measurement is separate from precision/recall on purpose: reading and
// citing are different failures with different fixes. What stops the
// perfect-values-wrong-boxes run from signing is the THRESHOLD RULE
// (lib/eval/thresholds.ts): a field whose citation accuracy misses its floor
// is unsignable no matter what its value columns say.
//
// LANDING: same page, and the intersection covers at least HALF THE SMALLER
// of the two boxes — tolerant of a tighter or looser crop, intolerant of a
// box that is mostly somewhere else.
// ============================================================================
describe('6B B10 · the citation half: does the bbox land on its value? (R3/F-7)', () => {
  const cited = (
    itemId: string,
    facts: Array<[string, string, { page: number; bbox: [number, number, number, number] }?]>,
  ): Prediction => ({
    itemId,
    facts: facts.map(([field, value, citation]) => ({ field, value, citation })),
  });

  const LABEL_BOX = { page: 1, bbox: [0.1, 0.2, 0.3, 0.05] as [number, number, number, number] };

  it('a value hit whose box overlaps the labelled region is a citation HIT', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg', LABEL_BOX)] })],
      [
        cited('x1', [
          ['medication_dose', '500 mg', { page: 1, bbox: [0.12, 0.21, 0.2, 0.04] }],
        ]),
      ],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose).toMatchObject({ tp: 1, citation_hits: 1, citation_misses: 0 });
    expect(dose.citation_accuracy).toBe(1);
  });

  it('a PERFECT value cited somewhere else entirely is a citation MISS — 1.00 stops being clean', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg', LABEL_BOX)] })],
      [
        cited('x1', [
          ['medication_dose', '500 mg', { page: 1, bbox: [0.7, 0.8, 0.2, 0.05] }],
        ]),
      ],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose.precision).toBe(1); // the value IS right…
    expect(dose).toMatchObject({ citation_hits: 0, citation_misses: 1 });
    expect(dose.citation_accuracy).toBe(0); // …and the evidence points nowhere.
  });

  it('the RIGHT box on the WRONG page is a miss — page is part of the citation', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg', { page: 2, bbox: [0.1, 0.2, 0.3, 0.05] })] })],
      [
        cited('x1', [
          ['medication_dose', '500 mg', { page: 1, bbox: [0.1, 0.2, 0.3, 0.05] }],
        ]),
      ],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose).toMatchObject({ citation_hits: 0, citation_misses: 1 });
  });

  it('a hit with NO citation at all is a miss — evidence a person cannot see is not evidence', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg', LABEL_BOX)] })],
      [prediction('x1', [['medication_dose', '500 mg']])],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose).toMatchObject({ citation_hits: 0, citation_misses: 1 });
  });

  it('a field with NO measurable hits reads null, never 1.0 — the scorer’s own zero-over-zero rule', () => {
    const result = scoreRun(
      [item({ labels: [label('medication_dose', '500 mg', LABEL_BOX)] })],
      [prediction('x1', [])],
    );
    const dose = result.fields.find((f) => f.field === 'medication_dose')!;
    expect(dose.citation_accuracy).toBeNull();
  });
});
