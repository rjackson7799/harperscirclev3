import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import {
  FILTERS,
  circleCoordinators,
  circleSubjects,
  listTasks,
  mayClaim,
  myMembership,
  taskFilters,
  type FilterKey,
  type TaskRow,
} from '@/lib/hc/tasks';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Legend } from '@/components/ui/Legend';
import { TaskRowFacts } from '@/components/tasks/TaskRowFacts';
import { subjectAccent } from '@/lib/design/accents';
import { formatShortDate } from '@/lib/format/dates';

/**
 * Tasks — the shared work board (PRD §4.5; 7B B2; TSK-03, TSK-04).
 *
 *   · `Mine · Unassigned · Overdue · All`, and by subject. COUNTS ARE
 *     COMPUTED POST-FILTER over the rows RLS already decided, so a
 *     caregiver's counts are counts of her assigned tasks and nothing else
 *     (AC-TASK-5; §7.6: "counts are content at the margin"). The chip's
 *     count is the number of rows the chip renders — the B4 leg asserts
 *     that over the rendered tree.
 *   · Every row: subject-labelled (§4.0), its holder, its due date as a
 *     date, its snooze count, and a source that resolves or is named and
 *     never linked (AC-TASK-4).
 *   · Empty per tier (§4.5.5): "Nothing open." for a coordinator; a
 *     caregiver's first open is NEVER BLANK — one sentence naming who to
 *     expect tasks from.
 *   · Done is never deleted (§4.5.3): the closed sit apart, with who and
 *     when — the evidence of a person's contribution (§4.6.4).
 *   · A refused read is an error state (R5/F-2); a read that never answers
 *     is bounded by the page's AnswerBudget (OW-03) to a named state.
 *
 * The 7B B1 floor (OW-20) stands underneath: the columns that exist, read
 * through lib/hc/tasks in one RLS-true join, typed at the boundary.
 */

const TITLE = 'Your tasks';
const CHIP_LABEL: Record<FilterKey, string> = {
  mine: 'Mine',
  unassigned: 'Unassigned',
  overdue: 'Overdue',
  all: 'All',
};

function header() {
  return <PageHeader title={TITLE} context="Open items with their owner, due date and source." />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading your tasks is taking longer than usual. Nothing has been lost — '
          : "We couldn't load your tasks just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

/** Today as the SUBJECT's calendar day would be ideal (§13.6); the list is
 *  one page over several subjects, so the viewer's UTC day is the honest
 *  common floor for "overdue". */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function coordinatorSentence(names: string[]): string {
  const who =
    names.length === 0
      ? 'A coordinator'
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Nothing assigned to you yet — ${who} will hand you tasks here.`;
}

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/tasks`;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
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

  const filter: FilterKey = (FILTERS as readonly string[]).includes(String(sp.filter))
    ? (sp.filter as FilterKey)
    : 'all';
  const subjectParam = typeof sp.subject === 'string' ? sp.subject : null;

  return withPageBudget(
    async (budget) => {
      let rows: TaskRow[];
      let me: Awaited<ReturnType<typeof myMembership>>;
      let subjects: Awaited<ReturnType<typeof circleSubjects>>;
      try {
        [rows, me, subjects] = await Promise.all([
          budget.race(listTasks(claims, circle), 'listTasks'),
          budget.race(myMembership(claims, circle), 'myMembership'),
          budget.race(circleSubjects(claims, circle), 'circleSubjects'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`tasks: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      // The subject scope first (a page of one thread, or all), then the
      // four filters counted WITHIN it — post-filter, over what she can see.
      const scoped = subjectParam ? rows.filter((r) => r.subject_id === subjectParam) : rows;
      const sets = taskFilters(scoped, me?.id ?? null, todayIso());
      const shown = sets[filter];
      const subjectQuery = subjectParam ? `&subject=${encodeURIComponent(subjectParam)}` : '';

      const empty =
        me?.tier === 'care_circle' ? (
          <EmptyState>
            {coordinatorSentence(await budget.race(circleCoordinators(claims, circle), 'circleCoordinators'))}
          </EmptyState>
        ) : (
          <EmptyState>Nothing open.</EmptyState>
        );

      return (
        <>
          {header()}
          <nav className="filter-chips" aria-label="Show">
            {FILTERS.map((key) => (
              <a
                key={key}
                className="filter-chip"
                href={`${next}?filter=${key}${subjectQuery}`}
                aria-current={key === filter ? 'true' : undefined}
              >
                {CHIP_LABEL[key]}
                <span className="filter-count">{sets[key].length}</span>
              </a>
            ))}
          </nav>
          {subjects.length > 1 ? (
            <>
              <nav className="filter-chips" aria-label="Whose">
                <a
                  className="filter-chip"
                  href={`${next}?filter=${filter}`}
                  aria-current={subjectParam ? undefined : 'true'}
                >
                  Everyone
                </a>
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
              </nav>
              <Legend
                items={subjects.map((s) => ({ accent: subjectAccent(s.id, s.seq), label: s.first_name }))}
              />
            </>
          ) : null}

          {shown.length > 0 ? (
            <div className="choice-list">
              {shown.map((task) => (
                <Card key={task.id}>
                  <a className="row-title" href={`/${circle}/tasks/${task.id}`}>
                    {task.title}
                  </a>
                  <TaskRowFacts task={task} circle={circle} />
                  {/* 8C U1 · the claim, where the list is FOR claiming.
                      `Unassigned` is the shelf of work nobody has taken, so
                      it is the one filter where taking a task is the point;
                      on Mine, Overdue and All the row's own page carries the
                      control. `mayClaim` still decides per row — the filter
                      says "unassigned", the predicate says whether SHE may. */}
                  {filter === 'unassigned' && mayClaim(task, me) ? (
                    <form method="post" action={`/${circle}/tasks/${task.id}/claim/submit`}>
                      <Button type="submit" variant="secondary">
                        Take this on
                      </Button>
                    </form>
                  ) : null}
                </Card>
              ))}
            </div>
          ) : (
            empty
          )}

          {sets.closed.length > 0 ? (
            <section className="record-section" aria-label="Done">
              <h2>Done</h2>
              <div className="choice-list">
                {sets.closed.map((task) => (
                  <Card key={task.id}>
                    <a className="row-title" href={`/${circle}/tasks/${task.id}`}>
                      {task.title}
                    </a>
                    <p className="meta">
                      Completed by {task.completed_by_name ?? 'a member'}
                      {task.completed_at ? ` · ${formatShortDate(task.completed_at.slice(0, 10))}` : ''}
                    </p>
                    {/* AC-TASK-4 holds for the done too: every task shows its source. */}
                    <TaskRowFacts task={task} circle={circle} />
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
