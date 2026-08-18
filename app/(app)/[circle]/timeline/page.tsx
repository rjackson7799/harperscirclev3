import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';

/**
 * The family landing (PRD §4.1.4 rule 4: with no Weekly Brief, family
 * lands on the Timeline). The full surface is the record slices'
 * (TSD §11.1 row 7); this is its honest floor — a real RLS read of
 * timeline_events and the design-spec empty state, so an invitee lands
 * on real content the moment any exists, never on an empty dashboard.
 */
export default async function TimelinePage({
  params,
}: {
  params: Promise<{ circle: string }>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect(`/sign-in?next=${encodeURIComponent(`/${circle}/timeline`)}`);

  const { data: events } = await supabase
    .from('timeline_events')
    .select('id, title, happened_on')
    .eq('circle_id', circle)
    .order('happened_on', { ascending: false })
    .limit(50);

  return (
    <div className="auth-shell">
      <main className="setup-card">
        <h1>Timeline</h1>
        {events && events.length > 0 ? (
          <div className="choice-list">
            {events.map((event: { id: string; title: string; happened_on: string }) => (
              <div key={event.id} className="notice">
                {event.title} · {event.happened_on}
              </div>
            ))}
          </div>
        ) : (
          <p className="auth-meta">Nothing on the timeline yet.</p>
        )}
      </main>
    </div>
  );
}
