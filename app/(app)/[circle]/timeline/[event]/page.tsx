import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { eventById, type EventRow } from '@/lib/hc/timeline';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { KIND_LABEL, eventWhenText } from '@/components/timeline/EventRowFacts';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/timeline/[event] — the event, with its source resolved
 * (PRD §4.4.1 "opens an event to see its source and everything linked to
 * it"; AC-TL-2; 7B B3). An AI-created event shows the ARRIVAL (linked when
 * the caller can open it, named when not), the EXTRACTION (the model and
 * prompt version that read it — when the proposal and its extractions are
 * the caller's to see) and the APPROVER. A manual event shows the person and
 * the date, and the document it was linked to — named; its page opens with
 * Documents (7C), and the receipt's discipline says so rather than linking
 * to a page that does not exist.
 */

function header(event?: EventRow) {
  return <PageHeader title={event?.summary ?? 'Timeline'} />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow ? 'Loading this entry is taking longer than usual. ' : "We couldn't load this entry just now. "}
        Nothing has been lost — <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string; event: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, event: eventId } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/timeline/${eventId}`;
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

  return withPageBudget(
    async (budget) => {
      let event: EventRow | null;
      try {
        event = await budget.race(eventById(claims, circle, eventId), 'eventById');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`timeline event: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      if (!event) notFound();

      const approvedOn = formatShortDate(event.approved_at.slice(0, 10));
      return (
        <>
          {header(event)}
          {sp.added === '1' ? (
            <p className="field-help" role="status">
              Added to the thread — here it is, with its source.
            </p>
          ) : null}
          <Card>
            <p className="meta">
              <SubjectLabel subjectId={event.subject_id} seq={event.subject_seq} name={event.subject_name} />
              {' · '}
              {KIND_LABEL[event.kind] ?? event.kind}
            </p>
            <dl className="record-facts">
              <dt>When</dt>
              <dd>{eventWhenText(event.when, true)}</dd>
              {event.episode ? (
                <>
                  <dt>Part of</dt>
                  <dd>{event.episode.title}</dd>
                </>
              ) : null}
              <dt>Where it came from</dt>
              <dd>
                {event.source.kind === 'manual' ? (
                  <>Entered by {event.approver_display_name} on {approvedOn}</>
                ) : event.source.kind === 'arrival' ? (
                  <>
                    <a href={`/${circle}/inbox/${event.source.arrival_id}`}>
                      From {event.source.label} · {formatShortDate(event.source.received_at.slice(0, 10))}
                    </a>
                  </>
                ) : event.source.kind === 'arrival_unseen' ? (
                  <>From an item in the Care Inbox that your access doesn&apos;t open</>
                ) : (
                  <>Approved by {event.approver_display_name} · {approvedOn}</>
                )}
              </dd>
              {event.extraction ? (
                <>
                  <dt>How it was read</dt>
                  <dd>
                    Read by AI — {event.extraction.model_id} · {event.extraction.prompt_version}
                  </dd>
                </>
              ) : null}
              {event.source.kind !== 'manual' ? (
                <>
                  <dt>Who approved it</dt>
                  <dd>
                    Approved by {event.approver_display_name} · {approvedOn}
                  </dd>
                </>
              ) : null}
              {event.linked_documents.length > 0 ? (
                <>
                  <dt>Linked to</dt>
                  <dd>
                    {event.linked_documents.map((d) => (
                      <span key={d.id}>
                        <strong>{d.title}</strong> — its page opens in an upcoming update.{' '}
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
          </Card>
          <p className="meta">
            <a href={`/${circle}/timeline?subject=${event.subject_id}`}>Back to {event.subject_name}&apos;s thread</a>
          </p>
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
