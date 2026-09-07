import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { FORWARDING_DOMAIN } from '@/lib/setup/steps';
import { completionPromises } from '@/lib/setup/completion-copy';

/**
 * /[circle] — HOME: A ROUTER, NOT A DASHBOARD (PRD §4.7; slice-9 plan Q5/Q6;
 * HOME-01…HOME-05, A11Y-13).
 *
 * DAY ONE (§4.7.1, AC-HOME-1). Before anything has ever arrived Home does one
 * job: get the family to forward something. One card per subject carrying the
 * forwarding address, one instruction, and NOTHING ELSE — no grid of empty
 * cards, no "0 documents · 0 tasks · 0 events", no onboarding checklist, no
 * empty-state heading. Two subjects means both addresses, each labelled by
 * name.
 *
 * THE BRANCH IS A FACT ABOUT THE CALLER, NOT ABOUT THE CIRCLE (plan Q5). The
 * day-one card is shown ONLY to a caller whose arrivals read SUCCEEDS AND
 * RETURNS ZERO. A read that FAILED is not a read that returned nothing, and a
 * caller who cannot enumerate arrivals gets the router — never an instruction
 * addressed to somebody else, and never a claim about rows she is not
 * entitled to enumerate.
 *
 * The one instruction is `completionPromises.instruction` — the same words
 * the completion screen ends on, from the ONE module that holds them, so the
 * habit the product asks for cannot drift between the two screens that ask
 * for it.
 */

type SubjectRow = {
  id: string;
  first_name: string;
  situation: string | null;
  forwarding_local_part: string | null;
  forwarding_active_at: string | null;
};

/** The Care Inbox's OWN read, narrowed to what Home renders from it (plan
 *  Q5: every block reads what its destination surface reads). */
type ArrivalRow = { id: string; state: string; received_at: string };

/** §8.6: an error is an ERROR STATE, never an empty one. */
function loadFailed(next: string, slow: boolean) {
  return (
    <>
      <PageHeader title="Home" />
      <p className="field-help" role="alert">
        {slow
          ? 'This is taking longer than usual. Nothing has been lost — '
          : "We couldn't load this just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function HomePage({ params }: { params: Promise<{ circle: string }> }) {
  const { circle } = await params;
  const next = `/${circle}`;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, next);
  if (gate.kind === 'unavailable') {
    return (
      <>
        <PageHeader title="Home" />
        <SessionUnavailable next={next} />
      </>
    );
  }

  return withPageBudget(
    async (budget) => {
      // ONE budget around the WHOLE composition (OW-03; HOME-05): five
      // budgets that each pass while the page takes six seconds is the
      // failure a budget exists to prevent.
      let arrivals: { ok: boolean; rows: ArrivalRow[] };
      let subjects: SubjectRow[];
      try {
        [arrivals, subjects] = await Promise.all([
          budget.race(readArrivals(supabase, circle), 'arrivals'),
          budget.race(readSubjects(supabase, circle), 'subjects'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`home: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      const addressable = subjects.filter((s) => s.forwarding_local_part);
      // Q5's branch, exactly: SUCCEEDS AND RETURNS ZERO. And the card is
      // made OF the address — with none visible there is nothing to render,
      // so the honest line stands in rather than an empty card.
      const dayOne = arrivals.ok && arrivals.rows.length === 0 && addressable.length > 0;

      if (dayOne) {
        return (
          <>
            <PageHeader title="Home" />
            {addressable.map((s) => (
              <Card key={s.id}>
                <span className="row-title">{s.first_name}&apos;s forwarding address</span>
                <p className="mono-address">
                  {s.forwarding_local_part}@{FORWARDING_DOMAIN}
                </p>
                {/* Not decoration: an address that is not live yet bounces,
                    and an instruction that silently does not work is worse
                    than no instruction. The active address says nothing
                    extra, which is what "and nothing else" means. */}
                {s.forwarding_active_at ? null : (
                  <p className="meta">
                    Not live yet — it activates once the founder&apos;s email is verified. Until
                    then mail sent to it bounces with a readable reason; nothing is silently
                    swallowed.
                  </p>
                )}
              </Card>
            ))}
            <p>{completionPromises.instruction}</p>
          </>
        );
      }

      // The router. Its blocks arrive in U2; a router with nothing in it
      // renders one honest line of its own and never the day-one card
      // (plan Q5).
      return (
        <>
          <PageHeader title="Home" />
          <p className="meta">Nothing here needs you right now.</p>
        </>
      );
    },
    () => loadFailed(next, true),
  );
}

/**
 * The Care Inbox's own read (app/(app)/[circle]/inbox/page.tsx): parents
 * only, newest first, RLS-true. `ok` is the half Q5 turns on — an error is
 * NOT zero rows, and only a read that answered may decide day one.
 */
async function readArrivals(
  supabase: Awaited<ReturnType<typeof asUser>>,
  circle: string,
): Promise<{ ok: boolean; rows: ArrivalRow[] }> {
  const { data, error } = await supabase
    .from('arrivals')
    .select('id, state, received_at')
    .eq('circle_id', circle)
    .is('parent_arrival_id', null)
    .is('deleted_at', null)
    .order('received_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error(`home: arrivals read failed: ${error.message}`);
    return { ok: false, rows: [] };
  }
  return { ok: true, rows: (data ?? []) as ArrivalRow[] };
}

/** The subjects and their forwarding addresses — the completion screen's and
 *  the inbox first-run's own read, RLS-true. */
async function readSubjects(
  supabase: Awaited<ReturnType<typeof asUser>>,
  circle: string,
): Promise<SubjectRow[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, first_name, situation, forwarding_local_part, forwarding_active_at')
    .eq('circle_id', circle)
    .is('deleted_at', null)
    .order('first_name');
  if (error) {
    console.error(`home: subjects read failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as SubjectRow[];
}
