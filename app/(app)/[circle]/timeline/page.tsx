import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * The family landing (PRD §4.1.4 rule 4: with no Weekly Brief, family
 * lands on the Timeline). The full surface is the record slices'
 * (TSD §11.1 row 7); this is its honest floor — a real RLS read of
 * timeline_events and the design-spec empty state, so an invitee lands
 * on real content the moment any exists, never on an empty dashboard.
 * D8: re-homed under the D3 shell — the layout owns the chrome and the
 * one main landmark; copy unchanged.
 */
export default async function TimelinePage({
  params,
}: {
  params: Promise<{ circle: string }>;
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

  const { data: events } = await supabase
    .from('timeline_events')
    .select('id, title, happened_on')
    .eq('circle_id', circle)
    .order('happened_on', { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader title="Timeline" />
      {events && events.length > 0 ? (
        <div className="choice-list">
          {events.map((event: { id: string; title: string; happened_on: string }) => (
            <Card key={event.id}>
              <span className="row-title">{event.title}</span>
              <span className="meta"> · {event.happened_on}</span>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nothing on the timeline yet.</EmptyState>
      )}
    </>
  );
}
