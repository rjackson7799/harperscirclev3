import { describe, expect, it } from 'vitest';
import { predictionFor } from '@/scripts/eval/predict';

// ============================================================================
// Round-16 R6/F-6 — the eval must score what the PIPELINE publishes.
//
// `--collect` parsed the model's answer as `{field, value}` and scored that.
// Production does not: `extractFromArrival` runs `validateFacts`, which DROPS
// any fact whose field is not in the catalogue, whose value exceeds the P5
// cap, whose confidence is outside [0,1], or — the load-bearing one — whose
// citation names a page the rendering does not have or a bbox that does not
// fit inside the page.
//
// So the eval scored a DIFFERENT OBJECT than the one a family would ever see,
// and the bias runs one way: a hallucinated-citation fact is a TRUE POSITIVE
// to the scorer and an invisible non-event in the pipeline. The bands an
// owner signs would be better than the product.
//
// §6.10 only means anything if the eval measures the published answer.
// ============================================================================
describe('R6/F-6 · the scored prediction is the published prediction', () => {
  const CITE = { page: 1, bbox: [0.1, 0.1, 0.2, 0.05] };

  it('keeps a well-formed fact — WITH its citation (6B B10, R3/F-7: the box is part of the answer)', () => {
    const p = predictionFor(
      'blind-eob-01',
      JSON.stringify({
        facts: [{ field: 'amount', value: '$64.25', confidence: 0.9, citation: CITE }],
      }),
      1,
    );
    // The pin moved WITH the change that forced it: the scorer now measures
    // whether the bbox lands on its value, so predictionFor must stop
    // discarding the citation validateFacts already validated.
    expect(p.facts).toEqual([{ field: 'amount', value: '$64.25', citation: CITE }]);
    expect(p.dropped).toBe(0);
  });

  it('DROPS a fact citing a page the rendering does not have', () => {
    const p = predictionFor(
      'blind-discharge-01',
      JSON.stringify({
        facts: [
          {
            field: 'medication_dose',
            value: '20 mg',
            confidence: 0.9,
            citation: { ...CITE, page: 2 },
          },
        ],
      }),
      1, // a one-page render
    );
    // In production the family never sees this dose. The eval must not book
    // it as a true positive.
    expect(p.facts).toEqual([]);
    expect(p.dropped).toBe(1);
  });

  it('DROPS a field the catalogue does not know', () => {
    const p = predictionFor(
      'blind-eob-01',
      JSON.stringify({
        facts: [{ field: 'invented_field', value: 'x', confidence: 0.9, citation: CITE }],
      }),
      1,
    );
    expect(p.facts).toEqual([]);
    expect(p.dropped).toBe(1);
  });

  it('counts the drops rather than hiding them — §10.4 is a signal', () => {
    const p = predictionFor(
      'blind-eob-01',
      JSON.stringify({
        facts: [
          { field: 'amount', value: '$64.25', confidence: 0.9, citation: CITE },
          { field: 'amount', value: 'x', confidence: 5, citation: CITE },
          { field: 'nope', value: 'x', confidence: 0.9, citation: CITE },
        ],
      }),
      1,
    );
    expect(p.facts).toHaveLength(1);
    expect(p.dropped).toBe(2);
  });

  it('an unparseable answer is a failure, not an empty success', () => {
    expect(() => predictionFor('blind-eob-01', 'not json', 1)).toThrow();
  });
});
