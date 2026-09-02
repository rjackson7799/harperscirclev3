import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { circleSubjects, type SubjectRow } from '@/lib/hc/tasks';
import {
  KINDS,
  canAddByHand,
  creationEntries,
  listEvents,
  subjectDocuments,
  type CreationEntry,
  type EventRow,
  type SubjectDocument,
} from '@/lib/hc/timeline';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Legend } from '@/components/ui/Legend';
import { ProvenanceLine } from '@/components/ui/ProvenanceLine';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { EventProvenance, KIND_LABEL, eventWhenText } from '@/components/timeline/EventRowFacts';
import { subjectAccent } from '@/lib/design/accents';
import { formatShortDate } from '@/lib/format/dates';

/**
 * The Timeline (PRD §4.4; 7B B3; TLN-01/02/03; AC-TL-2/3/4) — one
 * chronological thread for the parent's life-in-care, per subject.
 *
 *   · Two subjects, two threads: the switch, and a COMBINED view that is
 *     labelled and in which every row is subject-labelled — nothing merges
 *     silently. The default is the founding subject's thread (§4.4.1 says
 *     "the subject you were last looking at"; a Server Component cannot
 *     remember that without a cookie route, so the founding subject stands
 *     in — named in the deltas ADR).
 *   · Filters by kind — medical · care · admin; `memory` exists in the model
 *     and does NOT render as an empty filter in Phase 1 — and by date range.
 *   · The creation entry is the FIRST row of every thread (§4.4.4): the
 *     custodianship declaration hc.create_circle wrote before anything
 *     else. A subject whose record has only that entry shows it.
 *   · Episodes render as WRAPPERS if they exist and never conceal their
 *     events (AC-TL-3); drafting them is the interpretation pass's work.
 *   · Every row shows its source (AC-TL-2). Add by hand (§4.4.3) is ONE
 *     action for a member who may complete it — subject, date, kind, one
 *     line, an optional document — and the control does not exist below
 *     the cliff.
 *
 * The 7B B1 floor (OW-20) stands underneath; the reads are lib/hc/timeline's
 * RLS-true joins, and the page answers within its AnswerBudget (OW-03).
 */

const TITLE = 'Timeline';

function header() {
  return <PageHeader title={TITLE} context="One thread per person: clinical events and ordinary days, in order." />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading the timeline is taking longer than usual. Nothing has been lost — '
          : "We couldn't load the timeline just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

/** The creation row: a true and useful first row (§4.4.4). */
function CreationRow({ entry, subject }: { entry: CreationEntry; subject: SubjectRow | undefined }) {
  return (
    <Card>
      <span className="row-title">{entry.subject_name}&apos;s record was opened</span>
      <p className="meta">
        {subject ? (
          <>
            <SubjectLabel subjectId={subject.id} seq={subject.seq} name={subject.first_name} />
            {' · '}
          </>
        ) : null}
        {formatShortDate(entry.declared_on)}
      </p>
      <ProvenanceLine>
        Custodianship declared — held by {entry.custodian} on {entry.subject_name}&apos;s behalf
      </ProvenanceLine>
    </Card>
  );
}

function EventCard({ event, circle }: { event: EventRow; circle: string }) {
  return (
    <Card>
      <a className="row-title" href={`/${circle}/timeline/${event.id}`}>
        {event.summary}
      </a>
      <p className="meta">
        <SubjectLabel subjectId={event.subject_id} seq={event.subject_seq} name={event.subject_name} />
        {' · '}
        {KIND_LABEL[event.kind] ?? event.kind}
        {' · '}
        {eventWhenText(event.when)}
      </p>
      <EventProvenance event={event} circle={circle} />
    </Card>
  );
}

/** Consecutive rows sharing an episode render inside ONE wrapper; every
 *  row stays its own card, individually openable and sourced (AC-TL-3). */
function Thread({ events, circle }: { events: EventRow[]; circle: string }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < events.length) {
    const episode = events[i].episode;
    if (!episode) {
      out.push(<EventCard key={events[i].id} event={events[i]} circle={circle} />);
      i += 1;
      continue;
    }
    const members: EventRow[] = [];
    while (i < events.length && events[i].episode?.id === episode.id) {
      members.push(events[i]);
      i += 1;
    }
    out.push(
      // 7D · R4/F-2: `id` as well as `key` — a receipt's `#episode-<id>`
      // fragment has to have something to land on, or it lands at the top
      // of the thread and the person is left to find the episode.
      <section
        key={`episode-${episode.id}-${members[0].id}`}
        id={`episode-${episode.id}`}
        className="record-episode"
        aria-label={`Episode: ${episode.title}`}
      >
        <p className="section-label">Episode · {episode.title}</p>
        <div className="choice-list">
          {members.map((e) => (
            <EventCard key={e.id} event={e} circle={circle} />
          ))}
        </div>
      </section>,
    );
  }
  return <div className="choice-list">{out}</div>;
}

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/timeline`;
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

  const kind = typeof sp.kind === 'string' && (KINDS as readonly string[]).includes(sp.kind) ? sp.kind : undefined;
  const from = typeof sp.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined;
  const to = typeof sp.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined;
  const notice = sp.e === 'add' ? "That entry couldn't be added just now. Check the date and the line, and try again." : null;

  return withPageBudget(
    async (budget) => {
      let subjects: SubjectRow[];
      try {
        subjects = await budget.race(circleSubjects(claims, circle), 'circleSubjects');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`timeline: subjects read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      // The switch's answer: a named subject, the combined view, or the
      // founding subject by default.
      const requested = typeof sp.subject === 'string' ? sp.subject : '';
      const subjectParam =
        requested === 'all' && subjects.length > 1
          ? 'all'
          : (subjects.find((s) => s.id === requested)?.id ?? subjects[0]?.id ?? 'all');
      const current = subjects.find((s) => s.id === subjectParam);

      let events: EventRow[];
      let creation: CreationEntry[];
      let addable: boolean[];
      try {
        [events, creation, addable] = await Promise.all([
          budget.race(listEvents(claims, circle, { subject: subjectParam, kind, from, to }), 'listEvents'),
          budget.race(creationEntries(claims, circle), 'creationEntries'),
          budget.race(
            Promise.all(subjects.map((s) => canAddByHand(claims, circle, s.id))),
            'canAddByHand',
          ),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`timeline: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      const addFor = subjects.filter((_, i) => addable[i]);
      const addSubject = addFor.find((s) => s.id === subjectParam) ?? addFor[0];
      let documents: SubjectDocument[] = [];
      if (addSubject) {
        try {
          documents = await budget.race(subjectDocuments(claims, circle, addSubject.id), 'subjectDocuments');
        } catch (err) {
          if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
          console.error(`timeline: documents read failed: ${(err as Error).message}`);
          documents = [];
        }
      }

      const byName = new Map(subjects.map((s) => [s.first_name, s]));
      const shownCreation =
        !from && !to && !kind
          ? creation.filter((c) => subjectParam === 'all' || byName.get(c.subject_name)?.id === subjectParam)
          : [];
      const subjectQuery = `?subject=${encodeURIComponent(subjectParam)}`;

      return (
        <>
          {header()}
          {notice ? (
            <p className="field-help" role="alert">
              {notice}
            </p>
          ) : null}

          {subjects.length > 1 ? (
            <>
              <nav className="filter-chips" aria-label="Whose thread">
                {subjects.map((s) => (
                  <a
                    key={s.id}
                    className="filter-chip"
                    href={`${next}?subject=${s.id}`}
                    aria-current={subjectParam === s.id ? 'true' : undefined}
                  >
                    {s.first_name}
                  </a>
                ))}
                <a
                  className="filter-chip"
                  href={`${next}?subject=all`}
                  aria-current={subjectParam === 'all' ? 'true' : undefined}
                >
                  Both
                </a>
              </nav>
              {subjectParam === 'all' ? (
                <p className="meta" role="status">
                  Both threads together — every entry says whose it is.
                </p>
              ) : null}
              <Legend items={subjects.map((s) => ({ accent: subjectAccent(s.id, s.seq), label: s.first_name }))} />
            </>
          ) : null}

          <nav className="filter-chips" aria-label="Kind">
            <a className="filter-chip" href={`${next}${subjectQuery}`} aria-current={kind ? undefined : 'true'}>
              All kinds
            </a>
            {KINDS.map((k) => (
              <a
                key={k}
                className="filter-chip"
                href={`${next}${subjectQuery}&kind=${k}`}
                aria-current={kind === k ? 'true' : undefined}
              >
                {KIND_LABEL[k]}
              </a>
            ))}
          </nav>

          <form method="get" action={next} className="record-controls" aria-label="Date range">
            <input type="hidden" name="subject" value={subjectParam} />
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <Field label="From">
              <Input type="date" name="from" defaultValue={from ?? ''} />
            </Field>
            <Field label="To">
              <Input type="date" name="to" defaultValue={to ?? ''} />
            </Field>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>

          {shownCreation.length === 0 && events.length === 0 ? (
            <EmptyState>Nothing on the thread yet.</EmptyState>
          ) : (
            <>
              {shownCreation.length > 0 ? (
                <div className="choice-list">
                  {shownCreation.map((entry) => (
                    <CreationRow key={`creation-${entry.seq}`} entry={entry} subject={byName.get(entry.subject_name)} />
                  ))}
                </div>
              ) : null}
              <Thread events={events} circle={circle} />
            </>
          )}

          {addSubject ? (
            <section className="record-section" aria-labelledby="add-by-hand">
              <h2 id="add-by-hand">Add something by hand</h2>
              <form method="post" action={`${next}/add/submit`}>
                <Field label="Whose thread">
                  <select name="subject_id" defaultValue={addSubject.id}>
                    {addFor.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="When">
                  <Input type="date" name="occurred_on" required />
                </Field>
                <Field label="What kind">
                  <select name="kind" defaultValue="care">
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="One line">
                  <Input type="text" name="summary" maxLength={200} required autoComplete="off" />
                </Field>
                <Field label="Linked document (optional)" help={documents.length === 0 ? 'No documents to link yet.' : undefined}>
                  <select name="document_id" defaultValue="">
                    <option value="">No document</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} · {formatShortDate(d.filed_on)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit">Add to the thread</Button>
              </form>
            </section>
          ) : null}

          {current ? null : null}
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
