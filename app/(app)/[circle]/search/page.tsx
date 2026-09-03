import { Fragment } from 'react';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { boundQuery, searchRecord, type SearchResults, type SearchRow } from '@/lib/hc/search';
import { SEARCH_HINT } from '@/components/shell/SearchField';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * /[circle]/search — the results (PRD §4.7.3; TSD §7.2–§7.7; 8B U3;
 * SRCH-04/05/06's app halves; AC-HOME-4).
 *
 * Phase 1 delivers SCOPED SEARCH, NOT ANSWERS: permission-filtered results
 * across documents, timeline and tasks, grouped by kind, labelled by
 * subject, each linking to the object. The field never composes an answer,
 * never summarises across results, and never says "I".
 *
 *   · ONE RLS-true read per relation, inside ONE withRequestRole, inside
 *     ONE AnswerBudget (Q4(4)) — an overrun renders the honest slow answer
 *     the record pages already render, never a spinner;
 *   · `q` is capped AT INGRESS (lib/hc/search#boundQuery): an over-cap
 *     term is refused with the empty-result copy, never an error, and the
 *     module is not called;
 *   · 20 per kind (the module's bound); an empty group renders NOTHING —
 *     "0 documents" is a count, and counts are post-filter and absent
 *     everywhere on this surface (§7.4): no total, no "showing N of M",
 *     no count of withheld results, no pagination;
 *   · the emphasis is a <mark> BUILT BY REACT from the module's snippet
 *     parts — structure, never markup; dangerouslySetInnerHTML appears
 *     nowhere here and tests/lint/search-surface-fence.test.ts says so;
 *   · a search writes NOTHING to the access log (Q4(3)).
 */

const EMPTY_COPY = 'Nothing matching that, in what you can see.';

const CATEGORY_LABEL: Record<string, string> = {
  // documents
  medical: 'Medical',
  medications: 'Medications',
  insurance: 'Insurance',
  legal: 'Legal',
  financial: 'Financial',
  labs: 'Labs',
  other: 'Other',
  // timeline kinds
  care: 'Care',
  admin: 'Admin',
  memory: 'Memory',
};

function hrefFor(circle: string, row: SearchRow): string {
  switch (row.kind) {
    case 'document':
      return `/${circle}/documents/${row.id}`;
    case 'task':
      return `/${circle}/tasks/${row.id}`;
    case 'timeline_event':
      return `/${circle}/timeline/${row.id}`;
  }
}

function header(q: string | null) {
  return <PageHeader title="Search" context={q ? `Results for “${q}”` : undefined} />;
}

function loadFailed(next: string, q: string | null, slow: boolean) {
  return (
    <>
      {header(q)}
      <p className="field-help" role="alert">
        {slow
          ? 'Searching is taking longer than usual. Nothing has been lost — '
          : "We couldn't search just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

function Group({ id, label, circle, rows }: { id: string; label: string; circle: string; rows: SearchRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="record-section" aria-labelledby={`results-${id}`}>
      <h2 id={`results-${id}`}>{label}</h2>
      <ul className="record-list">
        {rows.map((r) => (
          <li key={r.id}>
            <a className="action-link" href={hrefFor(circle, r)}>
              {r.title}
            </a>
            <p className="meta">
              <SubjectLabel subjectId={r.subject_id} seq={r.subject_seq} name={r.subject_name} />
              {r.category ? ` · ${CATEGORY_LABEL[r.category] ?? r.category}` : null}
            </p>
            <p className="search-snippet">
              {r.snippet.map((part, i) =>
                part.hit ? <mark key={i}>{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>,
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const sp = (await searchParams) ?? {};
  // The cap, at ingress: a blank or absent term is the first open (the
  // hint); a term that is present but unbounded is refused with the
  // empty-result copy. Neither reaches the database.
  const raw = typeof sp.q === 'string' ? sp.q : '';
  const q = boundQuery(raw);
  const next = `/${circle}/search${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  const supabase = await asUser();
  const gate = await gatePage(supabase, next);
  if (gate.kind === 'unavailable') {
    return (
      <>
        {header(q)}
        <SessionUnavailable next={next} />
      </>
    );
  }
  const claims = gate.claims;

  if (q === null) {
    return (
      <>
        {header(null)}
        {raw.trim().length > 0 ? <EmptyState>{EMPTY_COPY}</EmptyState> : <p className="meta">{SEARCH_HINT}</p>}
      </>
    );
  }

  return withPageBudget(
    async (budget) => {
      let results: SearchResults;
      try {
        results = await budget.race(searchRecord(claims, circle, q), 'searchRecord');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`search: read failed: ${(err as Error).message}`);
        return loadFailed(next, q, false);
      }
      const nothing = results.documents.length + results.events.length + results.tasks.length === 0;
      return (
        <>
          {header(q)}
          {nothing ? (
            <EmptyState>{EMPTY_COPY}</EmptyState>
          ) : (
            <>
              <Group id="documents" label="Documents" circle={circle} rows={results.documents} />
              <Group id="timeline" label="Timeline" circle={circle} rows={results.events} />
              <Group id="tasks" label="Tasks" circle={circle} rows={results.tasks} />
            </>
          )}
        </>
      );
    },
    () => loadFailed(next, q, true),
  );
}
