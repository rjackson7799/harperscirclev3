import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import {
  assignCandidates,
  myMembership,
  sharesForTask,
  taskById,
  type Candidate,
  type ShareRow,
  type TaskRow,
} from '@/lib/hc/tasks';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { SourceLine, snoozeText } from '@/components/tasks/TaskRowFacts';
import { formatDueDate, formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/tasks/[task] — task detail (PRD §4.5.3; 7B B2; TSK-01/02's app
 * halves; SHR-02's app half; AC-TASK-1/4/6/7).
 *
 * What it is · who owns it · when it's due · where it came from, LINKED when
 * it resolves and named when not · who created it and when · completion,
 * with who and when. Completed tasks are not deleted: done renders, without
 * controls, as the evidence of a person's contribution (§4.6.4).
 *
 * ASSIGN IN TWO TAPS (AC-TASK-1): pick a person, hand it over. The people
 * offered are exactly those with context on the subject (§4.5.5 — computed
 * from hc.circle_people the way hc.assign_task computes it, lib/hc/tasks
 * `selectionFor`); the not-offered are NAMED with the plain reason, never
 * as a choice. When the person picked cannot clear the task's taint the
 * submit route sends the assigner to the crossing screen (./assign) — the
 * "one extra screen on the rare assignment that crosses a domain" §4.5.6
 * argues for — and the definer re-checks the same question in-function.
 *
 * COMPLETE and SNOOZE (§4.5.4: forward only; the count shown); UNASSIGN
 * with a coordinator's keep option for exactly the shares this assignment
 * created (AC-TASK-7; SHR-02). Every write is a form to its own route;
 * every guarantee is the definer's.
 */

function header(task?: TaskRow) {
  return <PageHeader title={task?.title ?? 'Task'} />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading this task is taking longer than usual. Nothing has been lost — '
          : "We couldn't load this task just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

/** Every marker the submit routes emit is READ and rendered (R5/F-7). */
function noticeFor(sp: Record<string, string | string[] | undefined>) {
  const e = typeof sp.e === 'string' ? sp.e : null;
  if (e === 'slow') {
    return { kind: 'alert' as const, text: "That took too long to confirm. Check the task before trying again — nothing is lost." };
  }
  if (e === 'assign') return { kind: 'alert' as const, text: "That person couldn't be handed this task just now." };
  if (e === 'unassign') return { kind: 'alert' as const, text: "That couldn't be taken back just now. Please try again." };
  if (e === 'complete') return { kind: 'alert' as const, text: "That couldn't be marked done just now. Please try again." };
  if (e === 'snooze') return { kind: 'alert' as const, text: "That date couldn't be moved — a snooze moves the date forward, and needs a date." };
  if (sp.assigned === '1') {
    const path = typeof sp.path === 'string' ? sp.path : '';
    return {
      kind: 'status' as const,
      text:
        path === 'instruction'
          ? 'Handed over. They read what you wrote; the original stays as it was.'
          : path === 'share'
            ? 'Handed over, and the document shared with them.'
            : 'Handed over.',
    };
  }
  if (sp.unassigned === '1') return { kind: 'status' as const, text: 'Taken back. Whatever the assignment created was withdrawn.' };
  if (sp.done === '1') return { kind: 'status' as const, text: 'Marked done.' };
  if (sp.snoozed === '1') return { kind: 'status' as const, text: 'Moved. The snooze is counted on the task.' };
  return null;
}

function reasonNotOffered(c: Candidate, subjectName: string): string {
  return `${c.display_name} — can't see ${subjectName}'s record`;
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string; task: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, task: taskId } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/tasks/${taskId}`;
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
      let task: TaskRow | null;
      let me: Awaited<ReturnType<typeof myMembership>>;
      try {
        [task, me] = await Promise.all([
          budget.race(taskById(claims, circle, taskId), 'taskById'),
          budget.race(myMembership(claims, circle), 'myMembership'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`task: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      // Nonexistent, foreign, deleted, revoked and below-summary: ONE shape.
      if (!task) notFound();

      const open = task.status === 'open';
      const holdsIt = me !== null && task.owner_member_id === me.id;
      const mayAct = open && (task.can_manage || holdsIt);
      const notice = noticeFor(sp);

      // The controls' reads, only where the controls render.
      let candidates: Candidate[] = [];
      let shares: ShareRow[] = [];
      if (open && task.can_manage) {
        try {
          [candidates, shares] = await Promise.all([
            budget.race(assignCandidates(claims, circle, task), 'assignCandidates'),
            task.owner_member_id
              ? budget.race(sharesForTask(claims, task.id), 'sharesForTask')
              : Promise.resolve([] as ShareRow[]),
          ]);
        } catch (err) {
          if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
          console.error(`task: controls read failed: ${(err as Error).message}`);
          return loadFailed(next, false);
        }
      }
      const offered = candidates.filter((c) => c.offered);
      const notOffered = candidates.filter((c) => !c.offered);
      const keepable = shares.filter((s) => s.created_by_assignment_of === task!.id);

      return (
        <>
          {header(task)}
          {notice ? (
            <p className="field-help" role={notice.kind}>
              {notice.text}
            </p>
          ) : null}

          <Card>
            <p className="meta">
              <SubjectLabel subjectId={task.subject_id} seq={task.subject_seq} name={task.subject_name} />
              {' · '}
              {task.status === 'done' ? 'Done' : task.status === 'cancelled' ? 'Closed' : 'Open'}
            </p>
            {task.detail ? <p>{task.detail}</p> : null}

            <dl className="record-facts">
              <dt>Who owns it</dt>
              <dd>
                {task.owner_name ?? 'Unassigned'}
                {task.owner_name && task.assigned_by_name && task.assigned_at
                  ? ` — handed over by ${task.assigned_by_name} · ${formatShortDate(task.assigned_at.slice(0, 10))}`
                  : ''}
              </dd>
              <dt>When it&apos;s due</dt>
              <dd>
                {task.due_on ? formatDueDate(task.due_on) : 'No date'}
                {snoozeText(task.snooze_count) ? ` · ${snoozeText(task.snooze_count)}` : ''}
              </dd>
              <dt>Where it came from</dt>
              <dd>
                <SourceLine
                  source={task.source}
                  circle={circle}
                  approver={task.approver_display_name}
                  approvedAt={task.approved_at}
                />
              </dd>
              <dt>Who created it</dt>
              <dd>
                {task.source.kind === 'written' ? 'Written' : 'Approved'} by {task.approver_display_name} ·{' '}
                {formatShortDate(task.approved_at.slice(0, 10))}
              </dd>
              {task.completed_at ? (
                <>
                  <dt>Completed</dt>
                  <dd>
                    Completed by {task.completed_by_name ?? 'a member'} ·{' '}
                    {formatShortDate(task.completed_at.slice(0, 10))}
                  </dd>
                </>
              ) : null}
            </dl>

            {task.instruction ? (
              <p className="meta">
                {task.instruction.written_for ?? 'The holder'} reads this as:{' '}
                <a href={`/${circle}/tasks/${task.instruction.id}`}>
                  &ldquo;{task.instruction.title}&rdquo;
                </a>
                {task.instruction.status !== 'open' ? ` (${task.instruction.status})` : ''}
              </p>
            ) : null}
          </Card>

          {mayAct ? (
            <div className="record-controls">
              <form method="post" action={`${next}/complete/submit`}>
                <Button type="submit">Mark done</Button>
              </form>
              {task.due_on ? (
                <form method="post" action={`${next}/snooze/submit`}>
                  <Field label="Move the date to">
                    <Input type="date" name="due_on" min={task.due_on} required />
                  </Field>
                  <input type="hidden" name="due_zone" value={task.due_zone ?? 'UTC'} />
                  <Button type="submit" variant="secondary">
                    Snooze
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}

          {open && task.can_manage ? (
            <section className="record-section" aria-labelledby="hand-over">
              <h2 id="hand-over">{task.owner_name ? 'Hand it to someone else' : 'Hand it to someone'}</h2>
              <form method="post" action={`${next}/assign/submit`}>
                <div className="choice-list">
                  {offered.map((c) => (
                    <label key={c.member_id}>
                      <input type="radio" name="member_id" value={c.member_id} required />
                      <span>
                        {c.display_name}
                        {c.member_id === task!.owner_member_id ? ' (holds it now)' : ''}
                      </span>
                    </label>
                  ))}
                </div>
                {notOffered.length > 0 ? (
                  <p className="field-help">
                    Not offered: {notOffered.map((c) => reasonNotOffered(c, task!.subject_name)).join(' · ')}
                  </p>
                ) : null}
                <Button type="submit">{task.owner_name ? 'Hand it over instead' : 'Hand it over'}</Button>
              </form>
              {task.owner_member_id ? (
                <form method="post" action={`${next}/unassign/submit`} style={{ marginTop: 12 }}>
                  {keepable.length > 0 ? (
                    <>
                      <span className="field-label">Keep what the assignment shared?</span>
                      <div className="choice-list">
                        {keepable.map((s) => (
                          <label key={s.share_id}>
                            <input type="checkbox" name="keep_share_ids" value={s.share_id} />{' '}
                            {s.display_name} keeps what was shared on {formatShortDate(s.granted_at.slice(0, 10))}
                          </label>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <Button type="submit" variant="quiet">
                    Take it back from {task.owner_name}
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}

          <p className="meta">
            <a className="back-link" href={`/${circle}/tasks`}>
              All tasks
            </a>
          </p>
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
