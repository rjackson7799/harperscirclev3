import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';

/**
 * The care-circle landing (PRD §4.1.4 rule 4: care circle lands on their
 * assigned tasks). Same floor as the Timeline: a real RLS read — a
 * care-circle member's ceiling means exactly their assigned tasks
 * resolve — and the design-spec empty sentence.
 */
export default async function TasksPage({
  params,
}: {
  params: Promise<{ circle: string }>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect(`/sign-in?next=${encodeURIComponent(`/${circle}/tasks`)}`);

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_on, state')
    .eq('circle_id', circle)
    .order('due_on', { ascending: true })
    .limit(50);

  return (
    <div className="auth-shell">
      <main className="setup-card">
        <h1>Your tasks</h1>
        {tasks && tasks.length > 0 ? (
          <div className="choice-list">
            {tasks.map((task: { id: string; title: string; due_on: string | null }) => (
              <div key={task.id} className="notice">
                {task.title}
                {task.due_on ? ` · due ${task.due_on}` : ''}
              </div>
            ))}
          </div>
        ) : (
          <p className="auth-meta">Nothing assigned to you right now.</p>
        )}
      </main>
    </div>
  );
}
