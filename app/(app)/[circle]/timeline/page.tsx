import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProvenanceLine } from '@/components/ui/ProvenanceLine';
import { formatAppointment, formatFloating, formatShortDate } from '@/lib/format/dates';

/**
 * The family landing (PRD §4.1.4 rule 4: with no Weekly Brief, family
 * lands on the Timeline). The full surface is the record slices'
 * (TSD §11.1 row 7); this is its honest floor — a real RLS read of
 * timeline_events and the design-spec empty state, so an invitee lands
 * on real content the moment any exists, never on an empty dashboard.
 * D8: re-homed under the D3 shell — the layout owns the chrome and the
 * one main landmark; copy unchanged.
 *
 * 7B B1 · THE FLOOR MADE HONEST (OW-20). This page selected `title,
 * happened_on`; the columns are `summary` and §2.7's temporal shape
 * (`occurred_on` · `local_at / iana_zone / instant` · `is_floating`), so
 * every read was refused and the empty sentence rendered unconditionally.
 * Now: the columns that exist, each temporal kind rendered by its own rule
 * (§8.6 "dates are human" — a date, an appointment with its zone, a
 * floating time that says so), a refused read as an ERROR STATE (R5/F-2),
 * every row subject-labelled (AC-TL-4) and carrying its ProvenanceLine
 * (AC-TL-2's floor: the approver and the date, from the row itself). B3
 * builds the thread on this floor.
 */

type EventRow = {
  id: string;
  subject_id: string;
  kind: string;
  summary: string;
  occurred_on: string | null;
  local_at: string | null;
  iana_zone: string | null;
  instant: string | null;
  is_floating: boolean;
  approved_at: string;
  approver_display_name: string;
};

type SubjectRow = { id: string; first_name: string };

const EVENT_COLUMNS =
  'id, subject_id, kind, summary, episode_id, occurred_on, occurred_zone, ' +
  'local_at, iana_zone, instant, is_floating, source_arrival_id, ' +
  'approved_at, approver_display_name';

/** §2.7's three temporal kinds, each by its own rule — never conflated. */
export function eventWhen(e: EventRow): string {
  if (e.occurred_on) return formatShortDate(e.occurred_on);
  if (e.local_at && e.is_floating) return formatFloating(e.local_at);
  if (e.local_at && e.iana_zone && e.instant) {
    return formatAppointment({ localAt: e.local_at, ianaZone: e.iana_zone, instant: e.instant });
  }
  return 'undated';
}

function loadFailed(circle: string) {
  return (
    <>
      <PageHeader title="Timeline" />
      <p className="field-help" role="alert">
        We couldn&apos;t load the timeline just now. Nothing has been lost —{' '}
        <a href={`/${circle}/timeline`}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, `/${circle}/timeline`);
  if (gate.kind === 'unavailable') {
    return (
      <>
        <PageHeader title="Timeline" />
        <SessionUnavailable next={`/${circle}/timeline`} />
      </>
    );
  }

  const { data: eventData, error: eventsError } = await supabase
    .from('timeline_events')
    .select(EVENT_COLUMNS)
    .eq('circle_id', circle)
    .order('approved_at', { ascending: false })
    .limit(50);
  if (eventsError) {
    console.error(`timeline: read failed: ${eventsError.message}`);
    return loadFailed(circle);
  }
  const events = (eventData ?? []) as unknown as EventRow[];

  // AC-TL-4: every row names its subject. A row without its label is not
  // rendered — a refused subjects read fails the page honestly.
  const { data: subjectData, error: subjectsError } = await supabase
    .from('subjects')
    .select('id, first_name')
    .eq('circle_id', circle)
    .is('deleted_at', null);
  if (subjectsError) {
    console.error(`timeline: subjects read failed: ${subjectsError.message}`);
    return loadFailed(circle);
  }
  const subjectName = new Map(
    ((subjectData ?? []) as SubjectRow[]).map((s) => [s.id, s.first_name]),
  );

  return (
    <>
      <PageHeader title="Timeline" />
      {events.length > 0 ? (
        <div className="choice-list">
          {events.map((event) => (
            <Card key={event.id}>
              <span className="row-title">{event.summary}</span>
              <span className="meta"> · {subjectName.get(event.subject_id) ?? 'this circle'}</span>
              <span className="meta"> · {eventWhen(event)}</span>
              <ProvenanceLine>
                Approved by {event.approver_display_name} ·{' '}
                {formatShortDate(event.approved_at.slice(0, 10))}
              </ProvenanceLine>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nothing on the timeline yet.</EmptyState>
      )}
    </>
  );
}
