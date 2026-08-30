import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { assignCandidates, sourceDocuments, taskById, type SourceDocument } from '@/lib/hc/tasks';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/tasks/[task]/assign — the crossing (PRD §4.5.6; 7B B2; TSK-01's
 * app half; AC-TASK-6). "Assignment never grants, and never clears taint."
 * The assigner picked someone who cannot clear this task's taint, so the
 * interface says so AT THAT MOMENT — "Marisol can't see this task. It came
 * from Nell's discharge summary." — and offers EXACTLY two paths, both
 * explicit, both human:
 *
 *   1. WRITE WHAT THEY SHOULD SEE. The assigner types a plain instruction —
 *      the field is never pre-filled and the AI never writes it (§6.5: what
 *      is safe to reveal is a permission decision). hc.assign_task makes it
 *      its own {schedule} object with its own provenance; the original keeps
 *      its taint and stays invisible to her.
 *   2. SHARE THE SOURCE AS WELL. An explicit named share of the task AND the
 *      document, both named in one confirmation, behind the §5.7 step-up
 *      bound to `share_object` + `task:<id>+document:<id>` — a token minted
 *      for one object cannot be spent on two. The mint is the account
 *      step-up route's (a five-minute HttpOnly cookie); this screen is its
 *      first consumer.
 *
 * A person who CAN clear the taint is sent back — there is no crossing; a
 * person NOT OFFERED (no context on the subject, §4.5.5) is told so plainly
 * and given no path. hc.assign_task re-checks every one of these in-function.
 */

const STEP_UP_COOKIE = 'hc-step-up';

function header() {
  return <PageHeader title="Hand it over" />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow ? 'This is taking longer than usual. ' : "We couldn't load this just now. "}
        Nothing has been lost — <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function AssignPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string; task: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, task: taskId } = await params;
  const sp = (await searchParams) ?? {};
  const memberId = typeof sp.member === 'string' ? sp.member : '';
  const back = `/${circle}/tasks/${taskId}`;
  const here = `${back}/assign?member=${encodeURIComponent(memberId)}`;
  const supabase = await asUser();
  const gate = await gatePage(supabase, here);
  if (gate.kind === 'unavailable') {
    return (
      <>
        {header()}
        <SessionUnavailable next={here} />
      </>
    );
  }
  const claims = gate.claims;

  return withPageBudget(
    async (budget) => {
      let task;
      try {
        task = await budget.race(taskById(claims, circle, taskId), 'taskById');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`assign: read failed: ${(err as Error).message}`);
        return loadFailed(here, false);
      }
      if (!task || !task.can_manage || task.status !== 'open') notFound();

      let candidate;
      let documents: SourceDocument[] = [];
      try {
        const candidates = await budget.race(assignCandidates(claims, circle, task), 'assignCandidates');
        candidate = candidates.find((c) => c.member_id === memberId);
        if (candidate && task.source.kind === 'arrival') {
          documents = await budget.race(sourceDocuments(claims, circle, task.source.arrival_id), 'sourceDocuments');
        }
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`assign: candidates read failed: ${(err as Error).message}`);
        return loadFailed(here, false);
      }
      if (!candidate) notFound();
      // No crossing: she can see it. The submit route hands it over plainly.
      if (candidate.can_see !== false) redirect(back);

      if (!candidate.offered) {
        return (
          <>
            {header()}
            <p className="field-help" role="alert">
              {candidate.display_name} can&apos;t be handed this. They can&apos;t see {task.subject_name}
              &apos;s record at all — a coordinator would have to give them some access first.
            </p>
            <p className="meta">
              <a href={back}>Back to the task</a>
            </p>
          </>
        );
      }

      // What the sentence names as the source: the document when it resolves
      // (PRD's own example), the arrival's label otherwise.
      const source =
        documents[0]?.title ??
        (task.source.kind === 'arrival' ? task.source.label : `an item in ${task.subject_name}'s record`);
      const chosenDoc = typeof sp.document === 'string' ? documents.find((d) => d.id === sp.document) : undefined;
      const stepUp = (await cookies()).get(STEP_UP_COOKIE)?.value ?? null;
      const confirming = sp.path === 'share' && chosenDoc !== undefined && stepUp !== null;
      const stepUpFailed = typeof sp.e === 'string' ? sp.e : null;

      return (
        <>
          {header()}
          <p role="status">
            <strong>
              {candidate.display_name} can&apos;t see this task. It came from {source}.
            </strong>{' '}
            Handing it over never grants access by itself. You can do one of two things.
          </p>
          {stepUpFailed === 'instruction' ? (
            <p className="field-help" role="alert">
              Write what they should see first — an empty instruction is no instruction.
            </p>
          ) : null}
          {stepUpFailed === 'step-up' ? (
            <p className="field-help" role="alert">
              Confirm your password to share the document — that confirmation lasts five minutes.
            </p>
          ) : null}
          {stepUpFailed === 'nomatch' || stepUpFailed === 'throttled' || stepUpFailed === 'missing' ? (
            <p className="field-help" role="alert">
              That password didn&apos;t match. Try again.
            </p>
          ) : null}

          <div className="record-path">
            <Card>
              <h2>1 · Write what they should see</h2>
              <p className="meta">
                It becomes its own item, in your words, with its own source — <em>written by you, for{' '}
                {candidate.display_name}</em>. The original stays as it is, and stays out of their view.
              </p>
              <form method="post" action={`${back}/assign/submit`}>
                <input type="hidden" name="member_id" value={candidate.member_id} />
                <label className="field">
                  <span className="field-label">The instruction, in plain words</span>
                  <textarea name="instruction" rows={3} required></textarea>
                </label>
                <Button type="submit">Write it for {candidate.display_name}</Button>
              </form>
            </Card>
          </div>

          <div className="record-path">
            <Card>
              <h2>2 · Share the source as well</h2>
              {documents.length === 0 ? (
                <p className="meta">
                  There&apos;s no document behind this task that you can share, so this path isn&apos;t open here.
                  Path 1 still is.
                </p>
              ) : confirming ? (
                <form method="post" action={`${back}/assign/submit`}>
                  <p>
                    {candidate.display_name} will be able to see: this task, and the {chosenDoc.title} from{' '}
                    {formatShortDate(chosenDoc.filed_on)}.
                  </p>
                  <p className="meta">One deliberate act, logged, and it can be taken back.</p>
                  <input type="hidden" name="member_id" value={candidate.member_id} />
                  <input type="hidden" name="share_document" value={chosenDoc.id} />
                  <Button type="submit">Share and hand over</Button>
                </form>
              ) : (
                <form method="post" action="/account/step-up/submit">
                  <p className="meta">
                    An explicit share of the task <em>and</em> the document, both named, logged, and revocable.
                    Sharing needs your password again.
                  </p>
                  {documents.length > 1 ? (
                    <div className="choice-list">
                      {documents.map((d, i) => (
                        <label key={d.id}>
                          <input type="radio" name="document" value={d.id} defaultChecked={i === 0} />{' '}
                          {d.title} · {formatShortDate(d.filed_on)}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p>
                      {documents[0].title} · {formatShortDate(documents[0].filed_on)}
                    </p>
                  )}
                  <input type="hidden" name="operation" value="share_object" />
                  <input
                    type="hidden"
                    name="target_ref"
                    value={`task:${task.id}+document:${(chosenDoc ?? documents[0]).id}`}
                  />
                  <input
                    type="hidden"
                    name="next"
                    value={`${here}&path=share&document=${(chosenDoc ?? documents[0]).id}`}
                  />
                  <Field label="Your password">
                    <Input type="password" name="password" autoComplete="current-password" required />
                  </Field>
                  <Button type="submit" variant="secondary">
                    Confirm and share with {candidate.display_name}
                  </Button>
                </form>
              )}
            </Card>
          </div>

          <p className="meta">
            <a href={back}>Back to the task without handing it over</a>
          </p>
        </>
      );
    },
    () => loadFailed(here, true),
  );
}
