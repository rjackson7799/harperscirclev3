import { describe, expect, it } from 'vitest';
import {
  BAND_FIELDS,
  EXTRACTION_FIELDS,
  INSTRUCTION_KEYWORDS,
  isKnownField,
  riskClassFor,
} from '@/lib/extraction/fields';

// ============================================================================
// B1 · The extraction field catalogue (TSD §6.5; PRD §6.4). risk_class is
// assigned BY FIELD, before the model is called — it is never derived from
// the model's confidence, and it is never something the model returns.
//
// Two properties are the point:
//   · an UNKNOWN field is high-risk (fail closed — a field the catalogue
//     has never heard of is exactly the one nobody calibrated);
//   · any extracted instruction containing stop/start/do not/hold/
//     discontinue is high-risk WHATEVER FIELD IT LANDS IN (§6.5's last
//     clause), which is a rule about the VALUE, not the field name.
// ============================================================================

describe('B1 · the catalogue covers PRD §6.4 by name', () => {
  it('every §6.4 high-risk class has a catalogued field, classed high', () => {
    const required = [
      'medication_name',
      'medication_dose',
      'medication_frequency',
      'medication_route',
      'allergy_substance',
      'allergy_reaction',
      'procedure_instruction',
      'procedure_preparation',
      'lab_specimen_requirement',
      'directive_type',
      'directive_person',
      'beneficiary_designation',
      'payment_instruction',
      'account_number',
      'routing_number',
      'ssn',
      'member_id',
      'date_of_birth',
      'tax_id',
      'coverage_determination',
      'provider',
      'provider_address',
      'amount',
      'deadline_date',
      'appointment_date',
      'appointment_time',
    ];
    for (const field of required) {
      expect(isKnownField(field), `${field} is catalogued`).toBe(true);
      expect(riskClassFor(field), `${field} is high-risk`).toBe('high');
    }
  });

  it('the catalogue carries standard-risk fields too — the class is not decorative', () => {
    const standard = EXTRACTION_FIELDS.filter((f) => f.risk === 'standard');
    expect(standard.length).toBeGreaterThan(0);
    expect(standard.map((f) => f.field)).toContain('document_date');
  });

  it('the M5 canonical key-field names are catalogued verbatim', () => {
    // The stage-2 matching contract names these four in the migration
    // (20260821120005): the extraction schema emits them and the corpus
    // labels them. A rename here is a cross-layer break.
    for (const field of ['document_date', 'provider', 'amount', 'policy_number']) {
      expect(isKnownField(field), `${field} is catalogued`).toBe(true);
    }
  });

  it('field names are flat snake_case and unique', () => {
    const names = EXTRACTION_FIELDS.map((f) => f.field);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('every banded field is catalogued', () => {
    for (const field of BAND_FIELDS) expect(isKnownField(field)).toBe(true);
    expect(BAND_FIELDS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('B1 · risk classification fails closed', () => {
  it('an unknown field is high-risk, not standard', () => {
    expect(isKnownField('whatever_the_model_invented')).toBe(false);
    expect(riskClassFor('whatever_the_model_invented')).toBe('high');
  });

  it('a standard field with an ordinary value stays standard', () => {
    expect(riskClassFor('document_date', '2026-03-14')).toBe('standard');
  });
});

describe('B1 · §6.5 instruction keywords override the field class', () => {
  it.each(INSTRUCTION_KEYWORDS)('"%s" in the value forces high risk', (keyword) => {
    expect(riskClassFor('document_date', `Please ${keyword} this on Tuesday`)).toBe('high');
  });

  it('matches on word boundaries, not substrings', () => {
    // "restarted" and "household" contain start/hold as substrings; neither
    // is an instruction, and a substring rule would class every document as
    // high-risk and make the class meaningless.
    expect(riskClassFor('document_date', 'the visit restarted the clock')).toBe('standard');
    expect(riskClassFor('document_date', 'household contact noted')).toBe('standard');
  });

  it('is case-insensitive and reads nested values', () => {
    expect(riskClassFor('document_date', 'DO NOT file this')).toBe('high');
    expect(riskClassFor('document_date', { text: 'discontinue after Friday' })).toBe('high');
  });

  it('a high field stays high whatever the value', () => {
    expect(riskClassFor('medication_dose', '25 mg')).toBe('high');
  });
});
