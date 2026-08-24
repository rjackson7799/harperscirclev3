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

function label(field: string, value: string) {
  return { field, value, risk_class: 'high' as const, page: 1, bbox: [0, 0, 1, 1] as [number, number, number, number] };
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
