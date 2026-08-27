import { describe, expect, it } from 'vitest';
import {
  BAND_DEFAULTS,
  CITATION_FLOOR,
  FIELD_FLOORS,
  bandRowsFor,
} from '@/lib/eval/thresholds';
import type { FieldScore } from '@/lib/eval/score';

// ============================================================================
// 6B B10 · R6/F-4: THE THRESHOLD RULE, WRITTEN DOWN AND MECHANICAL.
//
// The harness used to write a manifest whose per-field rows were
// {precision, recall, support, tp, fp, fn} — and loadBands requires
// {precision, recall, high, medium}, so every artifact it produced was
// rejected as `artifact_partial` FOREVER, indistinguishable at the call site
// from the shipping default. And nobody had written down how a measured
// number becomes a threshold, so the first signable artifact would have been
// improvised at the meeting.
//
// The rule (docs/eval/g9-corpus-spec.md §6.A is the prose authority; this
// module is its arithmetic):
//
//   · The FLOORS GATE ENTRY. A field's row carries the {high, medium} pair
//     only when its measured precision and recall clear the §6 floors, its
//     support clears the §4 minimum, and its citation accuracy is measured
//     and clears the citation floor (R3/F-7's teeth: perfect values with
//     wrong boxes cannot sign).
//   · The PAIR ITSELF IS PRD §6.4's DEFAULTS — high ≥ 0.85, medium ≥ 0.60.
//     Moving a pair off the defaults is a per-field owner decision on
//     per-field evidence, never a computation this rule performs.
//   · An artifact is SIGNABLE only when EVERY banded field cleared. An
//     unsignable manifest omits the pairs it did not earn, so loadBands'
//     own artifact_partial guard fails it closed to all-high — enforcement
//     stays where it always was.
// ============================================================================

function fieldScore(field: string, over: Partial<FieldScore> = {}): FieldScore {
  return {
    field,
    tp: 10,
    fp: 0,
    fn: 0,
    precision: 1,
    recall: 1,
    support: 10,
    citation_hits: 10,
    citation_misses: 0,
    citation_accuracy: 1,
    ...over,
  };
}

const FIELDS = Object.keys(FIELD_FLOORS);
const MIN_SUPPORT = 3;

function allClear(): FieldScore[] {
  return FIELDS.map((f) => fieldScore(f));
}

describe('6B B10 · the floors are the spec’s §6 table, mirrored exactly', () => {
  it('every banded field has a floor pair, and the argued rows read as argued', () => {
    expect(FIELDS).toHaveLength(12);
    expect(FIELD_FLOORS.medication_name).toEqual({ precision: 0.98, recall: 0.95 });
    expect(FIELD_FLOORS.medication_dose).toEqual({ precision: 0.98, recall: 0.95 });
    expect(FIELD_FLOORS.allergy_substance).toEqual({ precision: 0.98, recall: 0.95 });
    expect(FIELD_FLOORS.coverage_determination).toEqual({ precision: 0.9, recall: 0.85 });
    expect(FIELD_FLOORS.document_date).toEqual({ precision: 0.95, recall: 0.95 });
  });

  it('the pair is PRD §6.4’s and the citation floor is stated', () => {
    expect(BAND_DEFAULTS).toEqual({ high: 0.85, medium: 0.6 });
    expect(CITATION_FLOOR).toBe(0.9);
  });
});

describe('6B B10 · the rule: floors gate entry, defaults are the pair', () => {
  it('a run that clears everything is SIGNABLE, every row carrying the default pair', () => {
    const out = bandRowsFor(allClear(), MIN_SUPPORT);
    expect(out.signable).toBe(true);
    expect(out.unsignable).toEqual({});
    for (const field of FIELDS) {
      expect(out.rows[field]).toMatchObject({
        precision: 1,
        recall: 1,
        high: BAND_DEFAULTS.high,
        medium: BAND_DEFAULTS.medium,
      });
    }
  });

  it('precision below the floor withholds the pair and names the reason', () => {
    const fields = allClear().map((f) =>
      f.field === 'medication_name' ? { ...f, precision: 0.97 } : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.signable).toBe(false);
    expect(out.unsignable.medication_name).toContain('precision_below_floor');
    expect(out.rows.medication_name).not.toHaveProperty('high');
  });

  it('recall below the floor is its own named reason', () => {
    const fields = allClear().map((f) =>
      f.field === 'document_date' ? { ...f, recall: 0.9 } : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.unsignable.document_date).toContain('recall_below_floor');
  });

  it('R3/F-7’s teeth: PERFECT values with WRONG boxes cannot sign', () => {
    const fields = allClear().map((f) =>
      f.field === 'amount'
        ? { ...f, citation_hits: 0, citation_misses: 10, citation_accuracy: 0 }
        : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.signable).toBe(false);
    expect(out.unsignable.amount).toContain('citation_below_floor');
    expect(out.rows.amount.precision).toBe(1); // the honest columns stay
    expect(out.rows.amount).not.toHaveProperty('high');
  });

  it('an UNMEASURED citation is not a clean bill — no evidence is not good evidence', () => {
    const fields = allClear().map((f) =>
      f.field === 'provider'
        ? { ...f, citation_hits: 0, citation_misses: 0, citation_accuracy: null }
        : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.unsignable.provider).toContain('citation_unmeasured');
  });

  it('support below the §4 minimum withholds the pair — n=2 signs nothing', () => {
    const fields = allClear().map((f) =>
      f.field === 'appointment_time' ? { ...f, support: 2 } : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.unsignable.appointment_time).toContain('support_below_minimum');
  });

  it('a null measurement (nothing produced, nothing to find) is unsignable, never defaulted', () => {
    const fields = allClear().map((f) =>
      f.field === 'member_id' ? { ...f, precision: null, recall: null } : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.unsignable.member_id).toContain('no_measurement');
  });

  it('ONE failing field makes the whole artifact unsignable — loadBands’ artifact_partial is the enforcement', () => {
    const fields = allClear().map((f) =>
      f.field === 'appointment_date' ? { ...f, recall: 0.5 } : f,
    );
    const out = bandRowsFor(fields, MIN_SUPPORT);
    expect(out.signable).toBe(false);
    // Eleven rows carry pairs; the twelfth does not; loadBands refuses the
    // whole artifact as partial — which is exactly the fail-closed we want.
    const withPairs = Object.values(out.rows).filter((r) => 'high' in r);
    expect(withPairs).toHaveLength(11);
  });
});
