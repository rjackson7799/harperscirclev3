import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { SUBJECT_SEQ } from './tasks';

/**
 * Search's data half (8B U1; PRD §4.7.3, §4.3.6; TSD §7.2–§7.7; slice-8
 * plan "### 8B" unit 1, Q4 SETTLED 2026-09-02). Three reads on the
 * request-role channel inside ONE withRequestRole — one transaction, one
 * set of claims — and RLS decides every row, never this module:
 *
 *   · documents — TSD §7.2's query, in the order the operations happen.
 *     The LEFT JOIN on document_search_content IS the level decision and
 *     RLS makes it: a `view` caller's join resolves and both the match and
 *     the snippet come from tsv_full / search_text_full; a `summary`
 *     caller's join finds nothing, sc.* is null, and coalesce falls
 *     through to tsv_summary and title + summary_text — exactly the text
 *     she may already read. There is no second code path.
 *   · tasks and timeline_events — single-vector: the whole rows are
 *     summary-readable, so one vector leaks nothing (§2.11).
 *
 * Every read is bounded to 20 rows and carries an explicit circle_id — the
 * belt beside RLS's braces, and what keeps the index scan on the leading
 * column. There is NO total and no parameter that could produce one
 * (§7.4): counts are post-filter everywhere, and the surface renders
 * groups, never numbers.
 *
 * THE ONE NAMED DEPARTURE from §7.2's literal text (Q4(1)): ts_headline's
 * defaults wrap the match in `<b>`…`</b>` — markup around family content,
 * including machine-read text from an adversary-supplied PDF. The fourth
 * argument passes explicit StartSel/StopSel sentinels — STX and ETX, C0
 * controls no writer in this tree emits and no document text carries —
 * and `splitHeadline` turns the string into PARTS here, so the page builds
 * `<mark>` structurally and no string ever reaches the DOM as HTML. The
 * option changes the headline's presentation and no row, vector, rank or
 * text the snippet is cut from. The select list also carries the row's own
 * title (a document's title, a task's title, an event's summary) so a
 * result has a link text; that column is inside the matched text at every
 * level, so it discloses nothing the snippet does not.
 *
 * A search writes NOTHING to the access log (Q4(3)): no event type, no
 * row, no hc.log call. The artifact_read entry still fires when a reader
 * opens the document behind a result.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ingress cap on `q` (Q4(4)): an over-cap term is refused with the
 *  empty-result copy, never an error. websearch_to_tsquery never raises. */
export const SEARCH_QUERY_MAX = 200;

/** The headline sentinels — U+0002 STX / U+0003 ETX. */
export const START_SEL = '\u0002';
export const STOP_SEL = '\u0003';
export const HEADLINE_OPTIONS = `StartSel=${START_SEL}, StopSel=${STOP_SEL}`;

export type SearchKind = 'document' | 'task' | 'timeline_event';

/** One run of the snippet: plain text, or the matched term. */
export type SnippetPart = { text: string; hit: boolean };

export type SearchRow = {
  kind: SearchKind;
  id: string;
  subject_id: string;
  subject_name: string;
  subject_seq: number;
  /** A document's category, an event's kind; a task has none. */
  category: string | null;
  /** The row's own title — a document's title, a task's title, an event's
   *  summary — the link text. */
  title: string;
  rank: number;
  snippet: SnippetPart[];
};

/** Three groups, and nothing else — no total, no count of anything. */
export type SearchResults = {
  documents: SearchRow[];
  events: SearchRow[];
  tasks: SearchRow[];
};

export type SubjectName = { id: string; first_name: string; seq: number };

/** The bounded term, or null for a blank, a non-string or an over-cap
 *  value — the page renders the empty copy for null without a read. */
export function boundQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim();
  if (q.length === 0 || q.length > SEARCH_QUERY_MAX) return null;
  return q;
}

/** The sentinel-delimited headline as parts. An unbalanced sentinel
 *  degrades to plain text — never a dangling emphasis — and any stray
 *  sentinel is dropped from the text, never rendered. */
export function splitHeadline(raw: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const push = (text: string, hit: boolean) => {
    if (text.length === 0) return;
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += text;
    else parts.push({ text, hit });
  };
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf(START_SEL, i);
    if (start < 0) {
      push(raw.slice(i).split(STOP_SEL).join(''), false);
      break;
    }
    const stop = raw.indexOf(STOP_SEL, start + 1);
    if (stop < 0) {
      push(raw.slice(i, start) + raw.slice(start + 1), false);
      break;
    }
    push(raw.slice(i, start).split(STOP_SEL).join(''), false);
    push(raw.slice(start + 1, stop), true);
    i = stop + 1;
  }
  return parts;
}

/** §4.7.3's placeholder: one subject names her; two, none, or a failed read
 *  say "the record" — true for every circle, promising nothing. */
export function placeholderFor(subjects: SubjectName[] | null | undefined): string {
  if (subjects && subjects.length === 1) return `Search ${subjects[0].first_name}'s record`;
  return 'Search the record';
}

type DocumentSql = {
  id: string;
  subject_id: string;
  category: string;
  title: string;
  snippet: string;
  rank: number | string;
};
type TaskSql = { id: string; subject_id: string; title: string; snippet: string; rank: number | string };
type EventSql = {
  id: string;
  subject_id: string;
  kind: string;
  title: string;
  snippet: string;
  rank: number | string;
};
type SubjectSql = { id: string; first_name: string; seq: number | string };

// TSD §7.2, verbatim in FROM / WHERE / ORDER / LIMIT; the headline's fourth
// argument and the title column are the two additions named above.
const DOCUMENTS_SQL = `
  with q as (select websearch_to_tsquery('english', $2) as tsq)
  select d.id, d.subject_id, d.category, d.title,
         ts_headline('english',
                     coalesce(sc.search_text_full,
                              d.title || ' ' || coalesce(d.summary_text,'')),
                     (select tsq from q), $3) as snippet,
         ts_rank(coalesce(sc.tsv_full, d.tsv_summary), (select tsq from q)) as rank
  from public.documents d
  left join public.document_search_content sc on sc.document_id = d.id
  where d.circle_id = $1
    and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q)
  order by rank desc
  limit 20`;

// tasks.tsv = title (A) + detail (B); the snippet is cut from the same text.
const TASKS_SQL = `
  with q as (select websearch_to_tsquery('english', $2) as tsq)
  select t.id, t.subject_id, t.title,
         ts_headline('english', t.title || ' ' || coalesce(t.detail, ''),
                     (select tsq from q), $3) as snippet,
         ts_rank(t.tsv, (select tsq from q)) as rank
  from public.tasks t
  where t.circle_id = $1
    and t.tsv @@ (select tsq from q)
  order by rank desc, t.id
  limit 20`;

// timeline_events.tsv = summary (A); the snippet is the summary.
const EVENTS_SQL = `
  with q as (select websearch_to_tsquery('english', $2) as tsq)
  select e.id, e.subject_id, e.kind::text as kind, e.summary as title,
         ts_headline('english', e.summary, (select tsq from q), $3) as snippet,
         ts_rank(e.tsv, (select tsq from q)) as rank
  from public.timeline_events e
  where e.circle_id = $1
    and e.tsv @@ (select tsq from q)
  order by rank desc, e.id
  limit 20`;

// The subject label every row carries (§7.6, PRD §4.0): the circle's
// subjects in founding order, read once in the same transaction.
const SUBJECTS_SQL = `
  select s.id, s.first_name, sq.seq
    from public.subjects s join (${SUBJECT_SEQ}) sq on sq.id = s.id`;

/**
 * The three groups for one bounded term in one circle, each row labelled
 * by subject. Answers the empty shape — without touching the database —
 * for a malformed circle or an unbounded term.
 */
export async function searchRecord(
  claims: RequestClaims,
  circleId: string,
  raw: unknown,
): Promise<SearchResults> {
  const q = boundQuery(raw);
  if (!UUID_RE.test(circleId) || q === null) return { documents: [], events: [], tasks: [] };
  const params = [circleId, q, HEADLINE_OPTIONS];
  return withRequestRole('authenticated', claims, async (db) => {
    const [docs, tasks, events, subjects] = await Promise.all([
      db.query<DocumentSql>(DOCUMENTS_SQL, params),
      db.query<TaskSql>(TASKS_SQL, params),
      db.query<EventSql>(EVENTS_SQL, params),
      db.query<SubjectSql>(SUBJECTS_SQL, [circleId]),
    ]);
    const label = new Map<string, { name: string; seq: number }>();
    for (const s of subjects.rows) label.set(s.id, { name: s.first_name, seq: Number(s.seq) });
    const row = (
      kind: SearchKind,
      r: { id: string; subject_id: string; title: string; snippet: string; rank: number | string },
      category: string | null,
    ): SearchRow => {
      const subject = label.get(r.subject_id);
      return {
        kind,
        id: r.id,
        subject_id: r.subject_id,
        subject_name: subject?.name ?? '',
        subject_seq: subject?.seq ?? 0,
        category,
        title: r.title,
        rank: Number(r.rank),
        snippet: splitHeadline(r.snippet),
      };
    };
    return {
      documents: docs.rows.map((r) => row('document', r, r.category)),
      events: events.rows.map((r) => row('timeline_event', r, r.kind)),
      tasks: tasks.rows.map((r) => row('task', r, null)),
    };
  });
}

