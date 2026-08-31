import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import {
  DOC_CATEGORIES,
  documentsFor,
  isDocCategory,
  uploadArrivalsInFlight,
  type DocumentListRow,
  type InFlightRow,
} from '@/lib/hc/documents';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/documents — the list (PRD §4.3.1, §4.3.2, §4.3.7; 7C C1;
 * DOC-01's app half; AC-DOC-2's surface half).
 *
 * ONE RLS-true fetch; the category tabs' counts AND the rendered rows are
 * both computed over exactly what RLS returned, so a count can never
 * disagree with the list it captions (counts post-filter). A row is
 * title · category · date · subject, linking to the detail — no viewer
 * here and nothing that implies one; the detail decides depth.
 *
 * "Add a document" leads to the EXISTING upload page — uploading from
 * Documents is an ingestion, never a bypass (AC-DOC-2) — and an arrival
 * still in the pipeline appears as a row wearing hc.product_state's
 * §4.2.2 label, leading to the Care Inbox (§4.3.7).
 */

const CATEGORY_LABEL: Record<string, string> = {
  medical: 'Medical',
  medications: 'Medications',
  insurance: 'Insurance',
  legal: 'Legal',
  financial: 'Financial',
  labs: 'Labs',
  other: 'Other',
};

function header() {
  return <PageHeader title="Documents" />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading the documents is taking longer than usual. Nothing has been lost — '
          : "We couldn't load the documents just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/documents`;
  const supabase = await asUser();
  const gate = await gatePage(supabase, next);
  if (gate.kind === 'unavailable') {
    return (
      <>
        {header()}
        <SessionUnavailable next={next} />
      </>
    );
  }
  const claims = gate.claims;

  const category = typeof sp.category === 'string' && isDocCategory(sp.category) ? sp.category : null;
  const subject = typeof sp.subject === 'string' ? sp.subject : undefined;

  return withPageBudget(
    async (budget) => {
      let rows: DocumentListRow[];
      let inFlight: InFlightRow[];
      try {
        [rows, inFlight] = await Promise.all([
          budget.race(documentsFor(claims, circle, { subject }), 'documentsFor'),
          budget.race(uploadArrivalsInFlight(claims, circle), 'uploadArrivalsInFlight'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`documents: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      const filtered = category ? rows.filter((r) => r.category === category) : rows;
      const subjectsSeen = [...new Map(rows.map((r) => [r.subject_id, r])).values()];
      const keepSubject = subject ? `&subject=${subject}` : '';

      return (
        <>
          {header()}
          <p className="meta">
            <a href={`/${circle}/upload`}>Add a document</a>
          </p>

          {inFlight.length > 0 ? (
            <section className="record-section" aria-labelledby="arrived">
              <h2 id="arrived">In the Care Inbox</h2>
              <ul>
                {inFlight.map((a) => (
                  <li key={a.arrival_id}>
                    <a href={`/${circle}/inbox`}>
                      {a.label} · {a.subject_name} · {formatShortDate(a.received_at.slice(0, 10))}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {rows.length === 0 ? (
            <p className="meta">Nothing filed yet.</p>
          ) : (
            <>
              <nav aria-label="Category" className="chip-row">
                <a className="nav-link" href={`${next}?${keepSubject.slice(1)}`} aria-current={category === null ? 'true' : undefined}>
                  All ({rows.length})
                </a>
                {DOC_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => (
                  <a
                    key={c}
                    className="nav-link"
                    href={`${next}?category=${c}${keepSubject}`}
                    aria-current={category === c ? 'true' : undefined}
                  >
                    {CATEGORY_LABEL[c]} ({counts.get(c)})
                  </a>
                ))}
              </nav>
              {subjectsSeen.length > 1 ? (
                <nav aria-label="Subject" className="chip-row">
                  {subjectsSeen.map((s) => (
                    <a
                      key={s.subject_id}
                      className="nav-link"
                      href={`${next}?subject=${s.subject_id}${category ? `&category=${category}` : ''}`}
                      aria-current={subject === s.subject_id ? 'true' : undefined}
                    >
                      {s.subject_name}
                    </a>
                  ))}
                </nav>
              ) : null}

              <p className="meta">
                {filtered.length} document{filtered.length === 1 ? '' : 's'}
              </p>
              {filtered.length === 0 ? <p className="meta">Nothing in this view.</p> : null}
              <ul className="record-list">
                {filtered.map((d) => (
                  <li key={d.id}>
                    <a href={`/${circle}/documents/${d.id}`}>{d.title}</a>
                    <p className="meta">
                      <SubjectLabel subjectId={d.subject_id} seq={d.subject_seq} name={d.subject_name} />
                      {' · '}
                      {CATEGORY_LABEL[d.category] ?? d.category}
                      {' · '}
                      {formatShortDate(d.filed_at.slice(0, 10))}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
