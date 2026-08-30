import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { isoText, isoTextOrNull } from './rows';
import { SUBJECT_SEQ } from './tasks';
import { approveProposal } from './review';

/**
 * The Timeline's data half (7B B3; PRD §4.4; TLN-01/02/03's app halves;
 * AC-TL-2/3/4). Everything rides the request-role channel: RLS on every
 * joined table and the definers' own gates decide — never this module.
 *
 *   · One thread per subject, or the combined view — every row carries its
 *     subject, so nothing merges silently (§4.4.1, AC-TL-4).
 *   · Kinds: medical · care · admin. `memory` exists in the model and is
 *     NOT a filter in Phase 1 (§4.4.1) — `KINDS` is what the page renders,
 *     and a `memory` filter asked for by hand returns nothing.
 *   · Each temporal kind crosses the boundary in its own shape (§2.7): a
 *     date as 'YYYY-MM-DD', an appointment as local_at + zone + instant, a
 *     floating time as local_at alone. `local_at` is a naive timestamp and
 *     `occurred_on` a date, both cast to text IN SQL (the node-postgres Date
 *     trap); `instant` crosses through the one named function.
 *   · The source resolves as far as the caller's access reaches (AC-TL-2):
 *     the arrival is linked when its row is readable and counted-never-named
 *     when not; the extraction behind an AI-created event rides the
 *     proposal (manage over its taint) into `extractions` (view ×5) and is
 *     null below; a manual event — a `manual` arrival — names the person
 *     and the date from the row itself.
 *   · An episode is a wrapper: the row carries its episode's title and is
 *     still its own row (AC-TL-3). Drafting episodes is NOT this slice.
 *   · The creation entries — hc.create_circle's custodianship declarations,
 *     seq 1 and 2 — are the first row of every thread (§4.4.4).
 *   · Add by hand is ONE action for a `view`×5 member (§4.4.3, MNL-01):
 *     hc.create_manual_proposal then hc.approve_proposal, the event the receipt.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The Phase-1 filters. `memory` is deliberately absent (§4.4.1). */
export const KINDS = ['medical', 'care', 'admin'] as const;
export type Kind = (typeof KINDS)[number];

export type EventWhen =
  | { kind: 'date'; on: string }
  | { kind: 'appointment'; local_at: string; iana_zone: string; instant: string }
  | { kind: 'floating'; local_at: string }
  | { kind: 'undated' };

export type EventSource =
  | { kind: 'arrival'; arrival_id: string; channel: string; label: string; received_at: string }
  | { kind: 'arrival_unseen' }
  | { kind: 'manual' }
  | { kind: 'none' };

export type EventRow = {
  id: string;
  circle_id: string;
  subject_id: string;
  subject_name: string;
  subject_seq: number;
  kind: string;
  summary: string;
  when: EventWhen;
  /** ISO — the instant the row sorts on (the date at noon UTC, the
   *  appointment's instant, a floating time read as UTC). */
  sort_at: string | null;
  episode: { id: string; title: string } | null;
  source: EventSource;
  /** The AI read behind an AI-created event, when the caller can see the
   *  proposal (manage over its taint) and its extractions (view ×5). */
  extraction: { model_id: string; prompt_version: string } | null;
  /** The documents a manual event was linked to at entry (from the
   *  proposal's parents), when the proposal is readable. */
  linked_documents: { id: string; title: string }[];
  approved_at: string;
  approver_display_name: string;
};

type EventSql = {
  id: string;
  circle_id: string;
  subject_id: string;
  subject_name: string;
  subject_seq: number;
  kind: string;
  summary: string;
  occurred_on: string | null;
  local_at: string | null;
  iana_zone: string | null;
  instant: Date | string | null;
  is_floating: boolean;
  sort_at: Date | string | null;
  episode_id: string | null;
  episode_title: string | null;
  source_arrival_id: string | null;
  source_proposal_id: string | null;
  arrival_seen: string | null;
  source_channel: string | null;
  sender_display_name: string | null;
  sender_address: string | null;
  source_received_at: Date | string | null;
  model_id: string | null;
  prompt_version: string | null;
  linked_documents: { id: string; title: string }[] | null;
  approved_at: Date | string;
  approver_display_name: string;
};

const EVENT_SELECT = `
  select e.id, e.circle_id, e.subject_id, s.first_name as subject_name, sq.seq as subject_seq,
         e.kind::text as kind, e.summary,
         e.occurred_on::text as occurred_on,
         to_char(e.local_at, 'YYYY-MM-DD"T"HH24:MI:SS') as local_at,
         e.iana_zone, e.instant, e.is_floating,
         coalesce((e.occurred_on::timestamp + interval '12 hours') at time zone 'UTC',
                  e.instant,
                  e.local_at at time zone 'UTC') as sort_at,
         e.episode_id, ep.title as episode_title,
         e.source_arrival_id, e.source_proposal_id, a.id as arrival_seen, a.channel::text as source_channel,
         a.sender_display_name, a.sender_address, a.received_at as source_received_at,
         x.model_id, x.prompt_version,
         (select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title) order by d.filed_at, d.id)
            from jsonb_array_elements(coalesce(p.payload -> 'parents', '[]'::jsonb)) par
            join public.documents d
              on d.id = (par ->> 'id')::uuid and par ->> 'type' = 'document' and d.deleted_at is null
         ) as linked_documents,
         e.approved_at, e.approver_display_name
    from public.timeline_events e
    join public.subjects s on s.id = e.subject_id
    join (${SUBJECT_SEQ}) sq on sq.id = e.subject_id
    left join public.episodes ep on ep.id = e.episode_id and ep.deleted_at is null
    left join public.arrivals a on a.id = e.source_arrival_id
    left join public.proposals p on p.id = e.source_proposal_id
    left join lateral (
      select x.model_id, x.prompt_version
        from public.extractions x
       where x.id = any(p.source_extraction_ids)
       order by x.created_at, x.id
       limit 1
    ) x on true
   where e.circle_id = $1 and e.deleted_at is null`;

function whenOf(row: EventSql): EventWhen {
  if (row.occurred_on) return { kind: 'date', on: row.occurred_on };
  if (row.local_at && row.is_floating) return { kind: 'floating', local_at: row.local_at };
  if (row.local_at && row.iana_zone && row.instant) {
    return { kind: 'appointment', local_at: row.local_at, iana_zone: row.iana_zone, instant: isoText(row.instant) };
  }
  return { kind: 'undated' };
}

function sourceOf(row: EventSql): EventSource {
  // hc.approve_proposal writes NO source arrival for a manual proposal
  // (20260824120006:514 — `v_source := null` when the payload is manual),
  // so an event that came through a proposal with no arrival behind it is,
  // by construction, one a person entered. An AI-drafted event always
  // carries its arrival.
  if (!row.source_arrival_id) return row.source_proposal_id ? { kind: 'manual' } : { kind: 'none' };
  if (!row.arrival_seen || !row.source_channel || !row.source_received_at) return { kind: 'arrival_unseen' };
  return {
    kind: 'arrival',
    arrival_id: row.arrival_seen,
    channel: row.source_channel,
    label:
      row.source_channel === 'email'
        ? (row.sender_display_name ?? row.sender_address ?? 'an email')
        : 'an uploaded document',
    received_at: isoText(row.source_received_at),
  };
}

function toRow(row: EventSql): EventRow {
  return {
    id: row.id,
    circle_id: row.circle_id,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    subject_seq: Number(row.subject_seq),
    kind: row.kind,
    summary: row.summary,
    when: whenOf(row),
    sort_at: isoTextOrNull(row.sort_at),
    episode: row.episode_id && row.episode_title ? { id: row.episode_id, title: row.episode_title } : null,
    source: sourceOf(row),
    extraction:
      row.model_id && row.prompt_version ? { model_id: row.model_id, prompt_version: row.prompt_version } : null,
    linked_documents: row.linked_documents ?? [],
    approved_at: isoText(row.approved_at),
    approver_display_name: row.approver_display_name,
  };
}

export type ListOptions = {
  /** A subject id, or 'all' for the combined view. */
  subject: string;
  kind?: string;
  /** 'YYYY-MM-DD' bounds, inclusive, on the event's own day. */
  from?: string;
  to?: string;
};

/** The thread — chronological, RLS-true, every row subject-labelled. */
export async function listEvents(
  claims: RequestClaims,
  circleId: string,
  opts: ListOptions,
): Promise<EventRow[]> {
  if (!UUID_RE.test(circleId)) return [];
  if (opts.subject !== 'all' && !UUID_RE.test(opts.subject)) return [];
  if (opts.kind !== undefined && !(KINDS as readonly string[]).includes(opts.kind)) return [];
  const params: unknown[] = [circleId];
  const where: string[] = [];
  if (opts.subject !== 'all') {
    params.push(opts.subject);
    where.push(`e.subject_id = $${params.length}`);
  }
  if (opts.kind) {
    params.push(opts.kind);
    where.push(`e.kind = $${params.length}::hc.timeline_kind`);
  }
  if (opts.from && DATE_ONLY.test(opts.from)) {
    params.push(opts.from);
    where.push(`coalesce(e.occurred_on, (e.instant at time zone coalesce(e.iana_zone, 'UTC'))::date, e.local_at::date) >= $${params.length}::date`);
  }
  if (opts.to && DATE_ONLY.test(opts.to)) {
    params.push(opts.to);
    where.push(`coalesce(e.occurred_on, (e.instant at time zone coalesce(e.iana_zone, 'UTC'))::date, e.local_at::date) <= $${params.length}::date`);
  }
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<EventSql>(
      `${EVENT_SELECT}${where.map((w) => ` and ${w}`).join('')}
       order by sort_at asc nulls last, e.approved_at asc, e.id
       limit 300`,
      params,
    );
    return r.rows.map(toRow);
  });
}

/** One event, or null in ONE shape for foreign, nonexistent, deleted,
 *  below-summary and malformed alike. */
export async function eventById(claims: RequestClaims, circleId: string, eventId: string): Promise<EventRow | null> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(eventId)) return null;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<EventSql>(`${EVENT_SELECT} and e.id = $2`, [circleId, eventId]);
    return r.rows[0] ? toRow(r.rows[0]) : null;
  });
}

export type CreationEntry = {
  subject_name: string;
  custodian: string;
  /** 'YYYY-MM-DD' as declared. */
  declared_on: string;
  occurred_at: string;
  seq: number;
};

/**
 * The custodianship declarations hc.create_circle wrote FIRST (AC-AUTH-6) —
 * circle-level log entries, readable by every live member — "the first thing
 * on every timeline, and a true and useful first row" (§4.4.4).
 */
export async function creationEntries(claims: RequestClaims, circleId: string): Promise<CreationEntry[]> {
  if (!UUID_RE.test(circleId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{
      subject_name: string;
      custodian: string;
      declared_on: string;
      occurred_at: Date | string;
      seq: number;
    }>(
      `select l.detail ->> 'subject_name' as subject_name,
              coalesce(l.detail ->> 'custodian', l.actor_display_name) as custodian,
              l.detail ->> 'declared_on' as declared_on,
              l.occurred_at, l.seq
         from public.access_log l
        where l.circle_id = $1 and l.event_type = 'custodianship_declared'
        order by l.seq`,
      [circleId],
    );
    return r.rows.map((row) => ({
      subject_name: row.subject_name,
      custodian: row.custodian,
      declared_on: row.declared_on ?? isoText(row.occurred_at).slice(0, 10),
      occurred_at: isoText(row.occurred_at),
      seq: Number(row.seq),
    }));
  });
}

const RANK: Record<string, number> = { hidden: 0, log: 1, summary: 2, view: 3, manage: 4 };
const ALL_DOMAINS = ['memories', 'health', 'schedule', 'documents', 'finances'];

/**
 * The §4.4.3 control is shown only to a member who may complete the ONE
 * action — `view` over all five domains of the subject, the same cliff
 * hc.create_manual_proposal enforces (6A M6, ADR-0025 D3). Read from the
 * caller's OWN levels, which hc.circle_people always returns to her.
 */
export async function canAddByHand(claims: RequestClaims, circleId: string, subjectId: string): Promise<boolean> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(subjectId)) return false;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ levels: Record<string, Record<string, string>> | null }>(
      `select p.levels from hc.circle_people($1) p
        where p.kind = 'member' and p.account_id = (select auth.uid())`,
      [circleId],
    );
    const mine = r.rows[0]?.levels?.[subjectId];
    if (!mine) return false;
    return ALL_DOMAINS.every((d) => (RANK[mine[d] ?? 'hidden'] ?? 0) >= RANK.view);
  });
}

export type SubjectDocument = { id: string; title: string; filed_on: string };

/** The documents of ONE subject the caller can see — what a manual event
 *  may be linked to (§4.4.3 "optionally a linked document"). RLS-true. */
export async function subjectDocuments(
  claims: RequestClaims,
  circleId: string,
  subjectId: string,
): Promise<SubjectDocument[]> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(subjectId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ id: string; title: string; filed_on: string }>(
      `select d.id, d.title, (d.filed_at at time zone 'UTC')::date::text as filed_on
         from public.documents d
        where d.circle_id = $1 and d.subject_id = $2 and d.deleted_at is null
        order by d.filed_at desc, d.id
        limit 100`,
      [circleId, subjectId],
    );
    return r.rows.map((row) => ({ id: row.id, title: row.title, filed_on: row.filed_on }));
  });
}

export type ManualEventInput = {
  subjectId: string;
  kind: Kind;
  summary: string;
  occurredOn: string;
  occurredZone: string;
  documentId?: string;
};

/**
 * Add by hand as ONE action (§4.4.3; TLN-02): hc.create_manual_proposal
 * drafts the synthetic manual arrival WITH its proposal in one transaction
 * (MNL-01), then hc.approve_proposal writes the event — the same definer
 * every AI-drafted event goes through, so the write-time re-check, the
 * payload contract and the claim machinery all hold. The event id is the
 * receipt. Provenance falls out of the rows: `channel = 'manual'`,
 * `approved_by` the person, `approved_at` the moment.
 */
export async function addManualEvent(
  claims: RequestClaims,
  circleId: string,
  input: ManualEventInput,
): Promise<{ event_id: string; proposal_id: string; arrival_id: string }> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(input.subjectId)) throw new Error('draft_refused');
  if (!(KINDS as readonly string[]).includes(input.kind)) throw new Error('proposal_invalid');
  if (!DATE_ONLY.test(input.occurredOn) || !input.occurredZone.trim()) throw new Error('proposal_invalid');
  const summary = input.summary.trim();
  if (!summary) throw new Error('proposal_invalid');
  const payload: Record<string, unknown> = {
    kind: input.kind,
    summary,
    occurred_on: input.occurredOn,
    occurred_zone: input.occurredZone,
  };
  if (input.documentId) {
    if (!UUID_RE.test(input.documentId)) throw new Error('proposal_invalid');
    payload.parents = [{ type: 'document', id: input.documentId }];
  }
  const drafted = await withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: { arrival_id: string; proposal_id: string } }>(
      `select hc.create_manual_proposal($1, $2, 'timeline_event', $3::jsonb) as r`,
      [circleId, input.subjectId, JSON.stringify(payload)],
    );
    return r.rows[0].r;
  });
  await approveProposal(claims, drafted.proposal_id, 1, `manual:${drafted.proposal_id}`, null);
  const eventId = await withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ id: string }>(
      `select e.id from public.timeline_events e where e.source_proposal_id = $1 and e.deleted_at is null`,
      [drafted.proposal_id],
    );
    return r.rows[0]?.id ?? null;
  });
  if (!eventId) throw new Error('approval_refused');
  return { event_id: eventId, proposal_id: drafted.proposal_id, arrival_id: drafted.arrival_id };
}
