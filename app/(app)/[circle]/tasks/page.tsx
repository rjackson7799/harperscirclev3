import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * The care-circle landing (PRD §4.1.4 rule 4: care circle lands on their
 * assigned tasks). Same floor as the Timeline: a real RLS read — a
 * care-circle member's ceiling means exactly their assigned tasks
 * resolve — and the design-spec empty sentence. D8: re-homed under the
 * D3 shell; copy unchanged.
 */
export default async function TasksPage({
  params,
}: {
  params: Promise<{ circle: string }>;
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

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_on, state')
    .eq('circle_id', circle)
    .order('due_on', { ascending: true })
    .limit(50);

  return (
    <>
      <PageHeader title="Your tasks" />
      {tasks && tasks.length > 0 ? (
        <div className="choice-list">
          {tasks.map((task: { id: string; title: string; due_on: string | null }) => (
            <Card key={task.id}>
              <span className="row-title">{task.title}</span>
              {task.due_on ? <span className="meta"> · due {task.due_on}</span> : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nothing assigned to you right now.</EmptyState>
      )}
    </>
  );
}
