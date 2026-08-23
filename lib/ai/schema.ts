import 'server-only';
import { EXTRACTION_FIELDS } from '@/lib/extraction/fields';

/**
 * The structured-output schemas (slice-5 plan B3; TSD §6.4, §6.7; §4.5's P5
 * publication caps).
 *
 * §6.4: the extraction call uses **structured outputs** — a parseable object
 * rather than a JSON-shaped string that occasionally isn't. Two consequences
 * are load-bearing here:
 *
 *   · **The provider's own citations feature is never sent.** It is
 *     incompatible with structured outputs (sending both returns a 400), and
 *     that settles a design question in our favour: **citation geometry is
 *     OURS** — `{page, bbox}` in normalised page coordinates, produced as
 *     fields in this schema. Citations survive a provider swap, resolve
 *     against the rendered page, and give PRD §6.4's high-risk crop-on-screen
 *     rule a region to cut.
 *   · **The P5 caps bound what is ASKED FOR**, not what is trimmed
 *     afterwards. `maxItems` on the arrays makes the answer refusal-shaped
 *     rather than truncation-shaped: a document with 400 facts comes back
 *     short and honest instead of arriving as 200 good facts and 200 silently
 *     dropped ones.
 *
 * `risk_class` is deliberately NOT in the schema. It is assigned by field,
 * before the call, from PRD §6.4's list (lib/extraction/fields.ts) — asking
 * the model for it would make the safety class a model output.
 */

/** §4.5's publication caps, restated where the schema uses them. */
export const P5_CAPS = {
  maxFacts: 200,
  maxValueBytes: 8192,
  maxProposals: 50,
} as const;

const FIELD_NAMES = EXTRACTION_FIELDS.map((f) => f.field);

const DOC_CATEGORIES = [
  'medical',
  'medications',
  'insurance',
  'legal',
  'financial',
  'labs',
  'other',
] as const;

/**
 * The kinds slice 5 can MAP. `hc.proposal_kind` also has `timeline_event` and
 * `episode`, and the DB is ready for both — but a timeline_event's own-domain
 * needs a `kind` (medical/care/admin/memory) that nothing in this schema
 * produces, and an episode is a grouping the review screen has no surface for
 * yet. Asking the model for proposals the worker would then drop wastes
 * tokens and, worse, makes the drop invisible. Recorded as slice-6 scope.
 */
const PROPOSAL_KINDS = ['document', 'task', 'profile_fact', 'conflict'] as const;

const DOMAINS = ['memories', 'health', 'schedule', 'documents', 'finances'] as const;

/** §6.7 / §4.10 defence 3: the flags a proposal sets when it references the
 *  product's own mechanics. A closed set, so the model cannot invent a
 *  reassuring-sounding flag nobody surfaces. */
export const ANOMALY_FLAGS = [
  'mentions_permissions',
  'mentions_accounts',
  'mentions_other_circles',
  'mentions_product_mechanics',
] as const;

/** §6.4: the citation the `citation_present` CHECK requires. `page` and
 *  `bbox` are both required, so an uncited fact is not expressible. */
const CITATION = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1 },
    bbox: {
      type: 'array',
      items: { type: 'number', minimum: 0, maximum: 1 },
      minItems: 4,
      maxItems: 4,
    },
  },
  required: ['page', 'bbox'],
  additionalProperties: false,
} as const;

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      maxItems: P5_CAPS.maxFacts,
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: FIELD_NAMES },
          value: { type: 'string', maxLength: 4000 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          citation: CITATION,
        },
        required: ['field', 'value', 'confidence', 'citation'],
        additionalProperties: false,
      },
    },
    document: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: DOC_CATEGORIES },
        title: { type: 'string', maxLength: 200 },
        summary: { type: 'string', maxLength: 600 },
      },
      required: ['category', 'title', 'summary'],
      additionalProperties: false,
    },
  },
  required: ['facts', 'document'],
  additionalProperties: false,
} as const;

export const INTERPRETATION_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      maxItems: P5_CAPS.maxProposals,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: PROPOSAL_KINDS },
          title: { type: 'string', maxLength: 200 },
          summary: { type: 'string', maxLength: 600 },
          domain: { type: ['string', 'null'], enum: [...DOMAINS, null] },
          category: { type: ['string', 'null'], enum: [...DOC_CATEGORIES, null] },
          field: { type: ['string', 'null'], maxLength: 120 },
          value: { type: ['string', 'null'], maxLength: 4000 },
          due_on: { type: ['string', 'null'], maxLength: 40 },
          occurred_on: { type: ['string', 'null'], maxLength: 40 },
          /**
           * §4.8: a conflict quotes an EXISTING fact, and it must name which
           * one. The id comes from the record context the call was given —
           * and the worker refuses any id that was not in it, so the model
           * cannot reach a row it was never shown (§3.10's boundary,
           * re-proven at the app layer).
           */
          conflicts_with_fact_id: { type: ['string', 'null'], maxLength: 64 },
          anomaly_flags: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', enum: ANOMALY_FLAGS },
          },
        },
        required: [
          'kind',
          'title',
          'summary',
          'domain',
          'category',
          'field',
          'value',
          'due_on',
          'occurred_on',
          'conflicts_with_fact_id',
          'anomaly_flags',
        ],
        additionalProperties: false,
      },
    },
    anomalies: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', enum: ANOMALY_FLAGS },
    },
  },
  required: ['proposals', 'anomalies'],
  additionalProperties: false,
} as const;
