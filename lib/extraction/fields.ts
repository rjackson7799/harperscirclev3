/**
 * The extraction field catalogue (TSD §6.5; PRD §6.4) — slice-5 plan B1.
 *
 * `risk_class` is **assigned by field, before the model is called**. It is
 * never derived from the model's confidence (§6.5: a model can be 0.94
 * confident about a dose and wrong) and it is never something the model
 * returns — the schema does not ask for it, and B4 stamps it on the way to
 * `hc.write_extractions`.
 *
 * Two rules make the class trustworthy rather than decorative:
 *
 *   1. **An unknown field is high-risk.** A field the catalogue has never
 *      heard of is exactly the field nobody calibrated at G9, so the code
 *      fallback is `high` — the same fail-closed posture B4 applies to the
 *      band artifact.
 *   2. **Any extracted instruction containing "stop", "start", "do not",
 *      "hold" or "discontinue" is high-risk whatever field it lands in**
 *      (§6.5's last clause). That is a rule about the VALUE, so it is
 *      evaluated per fact, on word boundaries — a substring rule would
 *      class "restarted" and "household" as instructions and make the
 *      class meaningless.
 *
 * Field names are flat snake_case. Four of them — `document_date`,
 * `provider`, `amount`, `policy_number` — are the M5 stage-2 matching
 * contract's canonical key-field names (`20260821120005`), which the
 * extraction schema emits and the G9 corpus labels; renaming one is a
 * cross-layer break, pinned in tests/extraction/fields.test.ts.
 */

export type RiskClass = 'standard' | 'high';

export type FieldSpec = {
  /** The canonical flat snake_case name the schema emits. */
  field: string;
  /** PRD §6.4's class, by field, decided here and not at inference time. */
  risk: RiskClass;
  /** Whether the G9 bands cover this field (per-field precision/recall). */
  banded: boolean;
  /** Which §6.4 clause (or filing need) puts the field in its class. */
  why: string;
};

export const EXTRACTION_FIELDS: readonly FieldSpec[] = [
  // ---- filing metadata: the standard class ---------------------------------
  { field: 'document_date', risk: 'standard', banded: true, why: 'filing metadata (M5 key field)' },
  { field: 'document_title', risk: 'standard', banded: false, why: 'filing metadata' },
  { field: 'document_summary', risk: 'standard', banded: false, why: 'filing metadata' },
  { field: 'patient_name', risk: 'standard', banded: false, why: 'not in §6.4 identity list' },
  { field: 'claim_number', risk: 'standard', banded: false, why: 'filing reference, not identity' },

  // ---- §6.4: medication name, dose, frequency and route --------------------
  { field: 'medication_name', risk: 'high', banded: true, why: '§6.4 medication' },
  { field: 'medication_dose', risk: 'high', banded: true, why: '§6.4 medication' },
  { field: 'medication_frequency', risk: 'high', banded: true, why: '§6.4 medication' },
  { field: 'medication_route', risk: 'high', banded: false, why: '§6.4 medication' },

  // ---- §6.4: allergies and adverse reactions -------------------------------
  { field: 'allergy_substance', risk: 'high', banded: true, why: '§6.4 allergies' },
  { field: 'allergy_reaction', risk: 'high', banded: false, why: '§6.4 allergies' },

  // ---- §6.4: procedure and preparation instructions ------------------------
  { field: 'procedure_instruction', risk: 'high', banded: false, why: '§6.4 procedure' },
  { field: 'procedure_preparation', risk: 'high', banded: false, why: '§6.4 procedure' },

  // ---- §6.4: lab specimen requirements -------------------------------------
  { field: 'lab_specimen_requirement', risk: 'high', banded: false, why: '§6.4 lab specimen' },

  // ---- §6.4: legal directives and the people they name ---------------------
  { field: 'directive_type', risk: 'high', banded: false, why: '§6.4 legal directives' },
  { field: 'directive_person', risk: 'high', banded: false, why: '§6.4 legal directives' },

  // ---- §6.4: beneficiary designations --------------------------------------
  { field: 'beneficiary_designation', risk: 'high', banded: false, why: '§6.4 beneficiary' },

  // ---- §6.4: payment instructions, account and routing numbers -------------
  { field: 'payment_instruction', risk: 'high', banded: false, why: '§6.4 payment' },
  { field: 'account_number', risk: 'high', banded: false, why: '§6.4 payment' },
  { field: 'routing_number', risk: 'high', banded: false, why: '§6.4 payment' },

  // ---- §6.4: identity data (SSN, member ID, DOB, tax identifiers) ----------
  { field: 'ssn', risk: 'high', banded: false, why: '§6.4 identity' },
  { field: 'member_id', risk: 'high', banded: true, why: '§6.4 identity' },
  { field: 'date_of_birth', risk: 'high', banded: false, why: '§6.4 identity' },
  { field: 'tax_id', risk: 'high', banded: false, why: '§6.4 identity' },
  // A policy number is the insurance member identifier under another name —
  // classed with member_id deliberately, and recorded as such rather than
  // left to look like an oversight. It is also an M5 key field.
  { field: 'policy_number', risk: 'high', banded: true, why: '§6.4 identity (member ID kin)' },

  // ---- §6.4: coverage determinations ---------------------------------------
  { field: 'coverage_determination', risk: 'high', banded: true, why: '§6.4 coverage' },

  // ---- §6.4: provider identities and addresses -----------------------------
  { field: 'provider', risk: 'high', banded: true, why: '§6.4 provider identity (M5 key field)' },
  { field: 'provider_address', risk: 'high', banded: false, why: '§6.4 provider identity' },

  // ---- §6.4: financial amounts and deadlines -------------------------------
  { field: 'amount', risk: 'high', banded: true, why: '§6.4 financial (M5 key field)' },
  { field: 'deadline_date', risk: 'high', banded: false, why: '§6.4 financial deadline' },

  // ---- §6.4: appointment dates and times -----------------------------------
  { field: 'appointment_date', risk: 'high', banded: true, why: '§6.4 appointment' },
  { field: 'appointment_time', risk: 'high', banded: true, why: '§6.4 appointment' },
] as const;

/** §6.5's last clause, verbatim. Phrases as well as words — "do not". */
export const INSTRUCTION_KEYWORDS = [
  'stop',
  'start',
  'do not',
  'hold',
  'discontinue',
] as const;

/** The fields the G9 bands cover — per-field precision/recall, never one
 *  global number (§6.10). B1's corpus spec states the support each one
 *  needs in the BLIND partition; tests/eval/corpus.test.ts asserts it. */
export const BAND_FIELDS: readonly string[] = EXTRACTION_FIELDS.filter((f) => f.banded).map(
  (f) => f.field,
);

const BY_NAME = new Map(EXTRACTION_FIELDS.map((f) => [f.field, f]));

export function isKnownField(field: string): boolean {
  return BY_NAME.has(field);
}

export function fieldSpec(field: string): FieldSpec | undefined {
  return BY_NAME.get(field);
}

/**
 * Word-boundary match over the value's text. `\b` alone would still fire
 * inside "restarted" for "start" (there IS a boundary at the 'rt|st' seam?
 * no — but "re-start" and "start-up" are real boundaries), so the guard is
 * an explicit non-letter test on both sides. Hyphens count as boundaries:
 * "do-not-resuscitate" is an instruction by anyone's reading.
 */
function containsInstruction(text: string): boolean {
  const haystack = text.toLowerCase();
  for (const keyword of INSTRUCTION_KEYWORDS) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(keyword, from);
      if (at < 0) break;
      const before = at === 0 ? '' : haystack[at - 1];
      const after = haystack[at + keyword.length] ?? '';
      const isLetter = (c: string) => c !== '' && /[a-z0-9]/.test(c);
      if (!isLetter(before) && !isLetter(after)) return true;
      from = at + 1;
    }
  }
  return false;
}

/** Flatten a jsonb-shaped value to the text the keyword rule reads. */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * The class for one extracted fact. Fail closed on both axes: an unknown
 * field is `high`, and an instruction-shaped value is `high` whatever the
 * field's own class says.
 */
export function riskClassFor(field: string, value?: unknown): RiskClass {
  const spec = BY_NAME.get(field);
  if (!spec) return 'high';
  if (spec.risk === 'high') return 'high';
  if (value !== undefined && containsInstruction(valueText(value))) return 'high';
  return 'standard';
}
