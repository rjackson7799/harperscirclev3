import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProvenanceLine } from '@/components/ui/ProvenanceLine';
import { formatShortDate } from '@/lib/format/dates';

/**
 * The care-circle landing (PRD §4.1.4 rule 4: care circle lands on their
 * assigned tasks). Same floor as the Timeline: a real RLS read — a
 * care-circle member's ceiling means exactly their assigned tasks
 * resolve — and the design-spec empty sentence. D8: re-homed under the
 * D3 shell; copy unchanged.
 *
 * 7B B1 · THE FLOOR MADE HONEST (OW-20). Until now this page selected
 * `state` — a column `tasks` has never had — so PostgREST refused every
 * read, the refusal was never looked at, and the empty sentence rendered
 * unconditionally: a floor that could not render a row, linked from a
 * receipt that said it was live. Now: the columns that exist, a refused
 * read as an ERROR STATE (R5/F-2, applied to the place it was not), every
 * row subject-labelled (§4.0: no unlabelled state) and carrying its
 * ProvenanceLine (design spec §7). B2 builds the surface on this floor.
 */

type TaskRow = {
  id: string;
  subject_id: string;
  title: string;
  due_on: string | null;
  status: string;
  approved_at: string;
  approver_display_name: string;
};

type SubjectRow = { id: string; first_name: string };

const TASK_COLUMNS =
  'id, subject_id, title, due_on, status, owner_member_id, snooze_count, ' +
  'written_for_member_id, written_from_task_id, source_arrival_id, ' +
  'approved_at, approver_display_name, completed_at';

function loadFailed(circle: string) {
  return (
    <>
      <PageHeader title="Your tasks" />
      <p className="field-help" role="alert">
        We couldn&apos;t load your tasks just now. Nothing has been lost —{' '}
        <a href={`/${circle}/tasks`}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function TasksPage({
  params,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, `/${circle}/tasks`);
  if (gate.kind === 'unavailable') {
    return (
      <>
        <PageHeader title="Your tasks" />
        <SessionUnavailable next={`/${circle}/tasks`} />
      </>
    );
  }

  const { data: taskData, error: tasksError } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('circle_id', circle)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(50);
  if (tasksError) {
    console.error(`tasks: read failed: ${tasksError.message}`);
    return loadFailed(circle);
  }
  const tasks = (taskData ?? []) as unknown as TaskRow[];

  // §4.0: every row belongs to a subject and says so. A row without its
  // label is not rendered — a refused subjects read fails the page honestly.
  const { data: subjectData, error: subjectsError } = await supabase
    .from('subjects')
    .select('id, first_name')
    .eq('circle_id', circle)
    .is('deleted_at', null);
  if (subjectsError) {
    console.error(`tasks: subjects read failed: ${subjectsError.message}`);
    return loadFailed(circle);
  }
  const subjectName = new Map(
    ((subjectData ?? []) as SubjectRow[]).map((s) => [s.id, s.first_name]),
  );

  return (
    <>
      <PageHeader title="Your tasks" />
      {tasks.length > 0 ? (
        <div className="choice-list">
          {tasks.map((task) => (
            <Card key={task.id}>
              <span className="row-title">{task.title}</span>
              <span className="meta"> · {subjectName.get(task.subject_id) ?? 'this circle'}</span>
              {task.due_on ? <span className="meta"> · due {formatShortDate(task.due_on)}</span> : null}
              <ProvenanceLine>
                Approved by {task.approver_display_name} · {formatShortDate(task.approved_at.slice(0, 10))}
              </ProvenanceLine>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nothing assigned to you right now.</EmptyState>
      )}
    </>
  );
}
