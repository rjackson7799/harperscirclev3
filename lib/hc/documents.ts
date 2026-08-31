import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { isoText, isoTextOrNull } from './rows';
import { SUBJECT_SEQ } from './tasks';

// ============================================================================
// 7C C2 · the Documents detail's data half (PRD §4.3.2–§4.3.5; TSD §1.3,
// §3.11). Every read rides the request-role channel: RLS and the 7A definers
// decide, never this module. The BYTES are not here — the page renders pages
// through GET /api/artifact/[id] (the ONE byte path, pinned by
// tests/lint/byte-path-fence.test.ts); this module hands the page the
// artifact_arrival_id and nothing that could become a second path.
//
// The summary/view line is drawn between TABLES (§3.4): the documents row —
// title, category, dates, the three sentences — is the summary side, and this
// module reads only that side plus the definers built for the member reads
// (hc.document_references, hc.shares_for, hc.document_audience). The view
// side (pages, facts) belongs to lib/hc/artifacts and lib/hc/review.
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** hc.doc_category, verbatim (§4.3.2's seven). */
export const DOC_CATEGORIES = [
  'medical',
  'medications',
  'insurance',
  'legal',
  'financial',
  'labs',
  'other',
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export function isDocCategory(value: string): value is DocCategory {
  return (DOC_CATEGORIES as readonly string[]).includes(value);
}

/** Category → permission domain, mirroring hc.own_domain's document arm
 *  (20260815230005:67-74; insurance/financial → finances is ADR-0005's
 *  ruling). Snapshot-pinned LIVE against hc.own_domain in
 *  tests/hc/documents.test.ts — the lib/permissions/tiers.ts discipline:
 *  the words and the grants they describe cannot drift apart. */
export const CATEGORY_DOMAIN: Record<DocCategory, string> = {
  medical: 'health',
  medications: 'health',
  labs: 'health',
  insurance: 'finances',
  financial: 'finances',
  legal: 'documents',
  other: 'documents',
};

export function categoryDomain(category: DocCategory): string {
  return CATEGORY_DOMAIN[category];
}

/** Where it came from — present when the arrival row is visible to the
 *  caller (arrivals are summary-readable at the arrival's own gate), null
 *  otherwise: linked when visible, never a dead link. */
export type DocumentSource = {
  arrival_id: string;
  channel: string;
  sender_display_name: string | null;
  sender_address: string | null;
  received_at: string | null;
};

export type DocumentDetail = {
  id: string;
  circle_id: string;
  subject_id: string;
  subject_name: string;
  subject_seq: number;
  title: string;
  category: string;
  /** ≤ 3 sentences, plain language — the summary member's whole content. */
  summary_text: string | null;
  /** The byte path's arrival: pages render through GET /api/artifact/[this]. */
  artifact_arrival_id: string;
  filed_at: string;
  approved_at: string;
  approver_display_name: string;
  taint: string[];
  taint_resolved: boolean;
  /** The arrival's view×5 — the one M2/M5-unified resolution (REV-01),
   *  asked of hc.visible_at itself. Gates the pages AND the facts: the
   *  page never calls extractionsFor below this. */
  can_view: boolean;
  /** The caller holds MANAGE on this document from their own context —
   *  hc.visible_at, the policies' own function, asked once per row. */
  can_manage: boolean;
  source: DocumentSource | null;
};

type DocumentSql = {
  id: string;
  circle_id: string;
  subject_id: string;
  subject_name: string;
  subject_seq: number;
  title: string;
  category: string;
  summary_text: string | null;
  artifact_arrival_id: string;
  filed_at: Date | string;
  approved_at: Date | string;
  approver_display_name: string;
  taint: string[];
  taint_resolved: boolean;
  can_view: boolean;
  can_manage: boolean;
  source_arrival_seen: string | null;
  source_channel: string | null;
  sender_display_name: string | null;
  sender_address: string | null;
  source_received_at: Date | string | null;
};

function toDetail(row: DocumentSql): DocumentDetail {
  return {
    id: row.id,
    circle_id: row.circle_id,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    subject_seq: Number(row.subject_seq),
    title: row.title,
    category: row.category,
    summary_text: row.summary_text,
    artifact_arrival_id: row.artifact_arrival_id,
    filed_at: isoText(row.filed_at),
    approved_at: isoText(row.approved_at),
    approver_display_name: row.approver_display_name,
    taint: row.taint,
    taint_resolved: row.taint_resolved,
    can_view: row.can_view,
    can_manage: row.can_manage,
    source:
      row.source_arrival_seen && row.source_channel
        ? {
            arrival_id: row.source_arrival_seen,
            channel: row.source_channel,
            sender_display_name: row.sender_display_name,
            sender_address: row.sender_address,
            received_at: isoTextOrNull(row.source_received_at),
          }
        : null,
  };
}

/** The detail row at the caller's own level — RLS decides, null in ONE
 *  shape (hidden and not-exists are the same null). */
export async function documentById(
  claims: RequestClaims,
  circleId: string,
  documentId: string,
): Promise<DocumentDetail | null> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(documentId)) return null;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<DocumentSql>(
      `select d.id, d.circle_id, d.subject_id, s.first_name as subject_name,
              sq.seq as subject_seq,
              d.title, d.category::text as category, d.summary_text,
              d.artifact_arrival_id, d.filed_at, d.approved_at,
              d.approver_display_name, d.taint::text[] as taint, d.taint_resolved,
              hc.visible_at(hc.ctx(), d.subject_id, hc.all_domains(), true,
                            'arrival', d.artifact_arrival_id, null) >= 'view' as can_view,
              hc.visible_at(hc.ctx(), d.subject_id, d.taint, d.taint_resolved,
                            'document', d.id, null) >= 'manage' as can_manage,
              a.id as source_arrival_seen, a.channel::text as source_channel,
              a.sender_display_name, a.sender_address,
              a.received_at as source_received_at
         from public.documents d
         join public.subjects s on s.id = d.subject_id
         join (${SUBJECT_SEQ}) sq on sq.id = d.subject_id
         left join public.arrivals a on a.id = d.source_arrival_id
        where d.circle_id = $1 and d.id = $2 and d.deleted_at is null`,
      [circleId, documentId],
    );
    return r.rows.length === 1 ? toDetail(r.rows[0]) : null;
  });
}

/** Everything in the record that references it — counted, never named: a
 *  log-level referent is a ROW with visible=false and id and label
 *  suppressed TOGETHER; below log it is not counted at all (ADR-0033 D2). */
export type ReferenceRow = {
  object_type: string;
  object_id: string | null;
  label: string | null;
  visible: boolean;
};

export async function documentReferences(
  claims: RequestClaims,
  documentId: string,
): Promise<ReferenceRow[]> {
  if (!UUID_RE.test(documentId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<ReferenceRow>(
      `select object_type::text as object_type, object_id, label, visible
         from hc.document_references($1)`,
      [documentId],
    );
    return r.rows;
  });
}

export type ShareRow = {
  share_id: string;
  member_id: string;
  display_name: string;
  tier: string;
  granted_by: string;
  granter_name: string;
  granted_at: string;
  created_by_assignment_of: string | null;
};

type ShareSql = Omit<ShareRow, 'granted_at'> & { granted_at: Date | string };

/** Who it has been shared with — hc.shares_for, per object, never per graph. */
export async function documentShares(
  claims: RequestClaims,
  documentId: string,
): Promise<ShareRow[]> {
  if (!UUID_RE.test(documentId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<ShareSql>(
      `select share_id, member_id, display_name, tier::text as tier,
              granted_by, granter_name, granted_at, created_by_assignment_of
         from hc.shares_for('document', $1)`,
      [documentId],
    );
    return r.rows.map((row) => ({ ...row, granted_at: isoText(row.granted_at) }));
  });
}

export type ShareResult = {
  object_type: string;
  object_id: string;
  member_id: string;
};

/**
 * hc.share_object — one object, one person, never the domain, never derived
 * objects (§4.3.5). Requires the live §5.7 token bound to `document:<id>`,
 * consumed in the definer's own transaction; a null token is passed through
 * so the refusal is the definer's, in its one shape.
 */
export async function shareDocument(
  claims: RequestClaims,
  documentId: string,
  memberId: string,
  stepUpToken: string | null,
): Promise<ShareResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: ShareResult }>(
      `select hc.share_object('document', $1, $2, $3) as r`,
      [documentId, memberId, stepUpToken],
    );
    return r.rows[0].r;
  });
}

export type UnshareResult = {
  share_id: string;
  member_id: string;
  object_type: string;
  object_id: string;
  revoked_at: string;
};

/** hc.revoke_share — unshare in ONE action; the grantee loses the object on
 *  her next query. The granter or a live coordinator; the definer decides. */
export async function unshareDocument(
  claims: RequestClaims,
  shareId: string,
): Promise<UnshareResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: UnshareResult }>(`select hc.revoke_share($1) as r`, [shareId]);
    return r.rows[0].r;
  });
}

/** One member whose level changes if the document moves — both levels for a
 *  coordinator; below coordinator the levels are NULL and `change` carries
 *  the direction only (D19.10: rendered as undisclosed, never as a hidden
 *  grant). */
export type AudienceRow = {
  member_id: string;
  display_name: string;
  tier: string;
  before: string | null;
  after: string | null;
  change: string;
};

/** hc.document_audience — the exact before-and-after audience, by name,
 *  BEFORE the move (§4.3.2: explicit confirmation, not a generic warning). */
export async function documentAudience(
  claims: RequestClaims,
  documentId: string,
  toCategory: DocCategory,
): Promise<AudienceRow[]> {
  if (!UUID_RE.test(documentId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<AudienceRow>(
      `select member_id, display_name, tier::text as tier,
              before::text as before, after::text as after, change
         from hc.document_audience($1, $2::hc.doc_category)`,
      [documentId, toCategory],
    );
    return r.rows;
  });
}

export type RecategorizeResult = {
  document_id: string;
  category: string;
  domain: string;
  changed: boolean;
  taint_before?: string[];
  taint_after?: string[];
  gained?: number;
  lost?: number;
  gained_names?: string[];
  lost_names?: string[];
};

/**
 * hc.recategorize_document (the round-24 3-arg form): the category the
 * person SAW binds the move — a source that changed under her feet refuses
 * with the named `document_changed`. Category, taint, index and the
 * audience_changed entry move in ONE transaction, or not at all.
 */
export async function recategorizeDocument(
  claims: RequestClaims,
  documentId: string,
  toCategory: DocCategory,
  expectedCategory: DocCategory,
): Promise<RecategorizeResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: RecategorizeResult }>(
      `select hc.recategorize_document($1, $2::hc.doc_category, $3::hc.doc_category) as r`,
      [documentId, toCategory, expectedCategory],
    );
    return r.rows[0].r;
  });
}

export type ShareCandidate = {
  member_id: string;
  display_name: string;
  tier: string;
};

/** The share control's member list, from hc.circle_people — offered, and
 *  hc.share_object decides on submit (the assignCandidates discipline;
 *  levels are not consulted here because a share's gate is the ACTOR's
 *  manage, not the grantee's level). */
export async function shareCandidates(
  claims: RequestClaims,
  circleId: string,
): Promise<ShareCandidate[]> {
  if (!UUID_RE.test(circleId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<ShareCandidate>(
      `select p.member_id, p.display_name, p.tier::text as tier
         from hc.circle_people($1) p
        where p.kind = 'member'
        order by p.display_name, p.member_id`,
      [circleId],
    );
    return r.rows;
  });
}
