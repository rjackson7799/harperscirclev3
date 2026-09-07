import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { FORWARDING_DOMAIN } from '@/lib/setup/steps';
import { completionPromises } from '@/lib/setup/completion-copy';
import { listTasks, myMembership, taskFilters, type TaskRow } from '@/lib/hc/tasks';
import {
  latestEventPerSubject,
  recentEvents,
  upcomingEvents,
  type EventRow,
} from '@/lib/hc/timeline';
import { eventWhenText } from '@/components/timeline/EventRowFacts';
import { formatShortDate } from '@/lib/format/dates';

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
type ArrivalRow = {
  id: string;
  state: string;
  received_at: string;
  channel?: string | null;
  sender_display_name?: string | null;
  sender_address?: string | null;
};

/** The top item NAMED: who it came from, in the words the Care Inbox uses.
 *  An upload has no sender and says so rather than inventing one. */
function senderLabel(row: ArrivalRow): string {
  return row.sender_display_name ?? row.sender_address ?? "Something you added";
}

/** Today as the SUBJECT calendar day would be ideal (§13.6); Home is one
 *  page over several subjects, so the viewer UTC day is the honest common
 *  floor — the tasks page own rule, and its own words. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const claims = gate.claims;

  return withPageBudget(
    async (budget) => {
      // ONE budget around the WHOLE composition (OW-03; HOME-05): five
      // budgets that each pass while the page takes six seconds is the
      // failure a budget exists to prevent.
      let arrivals: { ok: boolean; rows: ArrivalRow[] };
      let subjects: SubjectRow[];
      let review: { count: number; top: ArrivalRow | null };
      let me: Awaited<ReturnType<typeof myMembership>>;
      let tasks: TaskRow[];
      let latest: Map<string, EventRow>;
      let coming: EventRow[];
      let recent: EventRow[];
      try {
        // Every read at once, under the ONE budget. The branch cannot be
        // known before the arrivals read answers, and asking the other
        // reads afterwards would serialise the page behind it — on a
        // day-one circle they all answer empty anyway.
        [arrivals, subjects, review, me, tasks, latest, coming, recent] = await Promise.all([
          budget.race(readArrivals(supabase, circle), 'arrivals'),
          budget.race(readSubjects(supabase, circle), 'subjects'),
          budget.race(readNeedsReview(supabase, circle), 'needsReview'),
          budget.race(myMembership(claims, circle), 'myMembership'),
          budget.race(listTasks(claims, circle), 'listTasks'),
          budget.race(latestEventPerSubject(claims, circle), 'latestEventPerSubject'),
          budget.race(upcomingEvents(claims, circle), 'upcomingEvents'),
          budget.race(recentEvents(claims, circle), 'recentEvents'),
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

      // ----------------------------------------------------------------
      // THE ROUTER (§4.7.2), five blocks in the PRD's order. Each renders
      // from its destination surface's own read, and a block whose read
      // returns NOTHING renders nothing — never a zero, never a heading
      // (plan Q5). A rendered `0` is a claim about rows the caller may not
      // be entitled to enumerate; the absence of the block claims nothing.
      // ----------------------------------------------------------------
      const mine = taskFilters(tasks, me?.id ?? null, today()).mine.slice(0, 4);
      const blocks = [
        subjects.some((s) => s.situation || latest.has(s.id)),
        review.count > 0,
        mine.length > 0,
        coming.length > 0,
        recent.length > 0,
      ];

      return (
        <>
          <PageHeader title="Home" />

          {/* 1 · How each subject is — their name, where they are, and the
              most recent thing that happened on their record. What the
              family recorded, never an assessment of the parent and never
              a score (AC-HOME-3). */}
          {subjects.map((s) => {
            const event = latest.get(s.id);
            if (!s.situation && !event) return null;
            return (
              <section className="record-section" aria-labelledby={`subject-${s.id}`} key={s.id}>
                <h2 id={`subject-${s.id}`}>
                  <a href={`/${circle}/people/subject/${s.id}`}>How {s.first_name} is</a>
                </h2>
                {s.situation ? <p>{s.situation}</p> : null}
                {event ? (
                  <p className="meta">
                    Most recently on the record:{' '}
                    <a href={`/${circle}/timeline/${event.id}`}>{event.summary}</a> ·{' '}
                    {eventWhenText(event.when)}
                  </p>
                ) : null}
              </section>
            );
          })}

          {/* 2 · What needs review — the Care Inbox count, plain, with the
              top item named. The count is `proposals_ready`'s own exact
              count over the rows THIS caller can see, uncapped by any
              window, so it cannot undercount the way a page of fifty
              would. */}
          {review.count > 0 ? (
            <section className="record-section" aria-labelledby="needs-review">
              <h2 id="needs-review">
                <a href={`/${circle}/inbox`}>What needs review</a>
              </h2>
              <p>
                {review.count} {review.count === 1 ? 'item' : 'items'} in the Care Inbox.
              </p>
              {review.top ? (
                <p className="meta">
                  Most recent: {senderLabel(review.top)} ·{' '}
                  {formatShortDate(review.top.received_at.slice(0, 10))}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* 3 · My open tasks — the caller's own, with dates. */}
          {mine.length > 0 ? (
            <section className="record-section" aria-labelledby="my-tasks">
              <h2 id="my-tasks">
                <a href={`/${circle}/tasks`}>My open tasks</a>
              </h2>
              {mine.map((t) => (
                <Card key={t.id}>
                  <a className="row-title" href={`/${circle}/tasks/${t.id}`}>
                    {t.title}
                  </a>
                  <p className="meta">
                    {t.subject_name} ·{' '}
                    {t.due_on ? `due ${formatShortDate(t.due_on)}` : 'no date on it'}
                  </p>
                </Card>
              ))}
            </section>
          ) : null}

          {/* 4 · What's coming — dated items ALREADY IN THE RECORD. Not a
              calendar; Phase 1 has no calendar sync. */}
          {coming.length > 0 ? (
            <section className="record-section" aria-labelledby="whats-coming">
              <h2 id="whats-coming">
                <a href={`/${circle}/timeline`}>What&apos;s coming</a>
              </h2>
              {coming.map((e) => (
                <Card key={e.id}>
                  <a className="row-title" href={`/${circle}/timeline/${e.id}`}>
                    {e.summary}
                  </a>
                  <p className="meta">
                    {e.subject_name} · {eventWhenText(e.when)}
                  </p>
                </Card>
              ))}
            </section>
          ) : null}

          {/* 5 · Recent activity — the last few filings, with who approved
              them. A descending read of its own (lib/hc/timeline's
              recentEvents), never the tail of an ascending limit 300. */}
          {recent.length > 0 ? (
            <section className="record-section" aria-labelledby="recent-activity">
              <h2 id="recent-activity">
                <a href={`/${circle}/timeline`}>Recent activity</a>
              </h2>
              {recent.map((e) => (
                <Card key={e.id}>
                  <a className="row-title" href={`/${circle}/timeline/${e.id}`}>
                    {e.summary}
                  </a>
                  <p className="meta">
                    {e.subject_name} · approved by {e.approver_display_name} ·{' '}
                    {formatShortDate(e.approved_at.slice(0, 10))}
                  </p>
                </Card>
              ))}
            </section>
          ) : null}

          {/* A router with nothing in it says the one honest thing, and
              never the day-one card (plan Q5). */}
          {blocks.some(Boolean) ? null : (
            <p className="meta">Nothing here needs you right now.</p>
          )}
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

/**
 * What is WAITING ON A PERSON, and how many (§4.7.2's "the Care Inbox count,
 * plain, with the top item named").
 *
 * `proposals_ready` is the DB's own vocabulary for it — hc.state_label maps
 * exactly that state to *Needs you* (20260818200004:79) — so the surface
 * asks the question the database already answers rather than re-deciding it
 * app-side. The count is `count: 'exact'` over the rows RLS lets this caller
 * see, so it is neither capped by a window nor widened by one: a page of
 * fifty would undercount a busier circle, which is the OW-26 shape.
 */
async function readNeedsReview(
  supabase: Awaited<ReturnType<typeof asUser>>,
  circle: string,
): Promise<{ count: number; top: ArrivalRow | null }> {
  const { data, error, count } = await supabase
    .from('arrivals')
    .select('id, state, received_at, channel, sender_display_name, sender_address', {
      count: 'exact',
    })
    .eq('circle_id', circle)
    .eq('state', 'proposals_ready')
    .is('deleted_at', null)
    .order('received_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error(`home: needs-review read failed: ${error.message}`);
    return { count: 0, top: null };
  }
  const rows = (data ?? []) as ArrivalRow[];
  return { count: typeof count === 'number' ? count : rows.length, top: rows[0] ?? null };
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
