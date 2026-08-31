import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { resumeStep } from '@/lib/setup/steps';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';

/**
 * The resume router (AC-AUTH-9): return sends the person to the furthest
 * step they completed, derived from durable state — the circle row and
 * its opening context — never from client memory. A circle that never
 * reached step 2 has nothing here and lands on step 1, resumable
 * indefinitely (PRD §4.1.3).
 */
export default async function SetupRouter() {
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, '/setup');
  if (gate.kind === 'unavailable') {
    return (
      <main className="setup-card">
        <SessionUnavailable next="/setup" />
      </main>
    );
  }
  const sub = gate.claims.sub;

  const { data: circles } = await supabase
    .from('circles')
    .select('id, opening_context')
    .eq('created_by', sub)
    .order('created_at', { ascending: false })
    .limit(1);

  const circle = circles?.[0];
  const step = resumeStep({
    hasCircle: Boolean(circle),
    openingContext: (circle?.opening_context as string[] | undefined) ?? [],
  });

  if (step === 1) redirect('/setup/step/1');
  redirect(`/setup/step/${step}?circle=${circle!.id}`);
}
