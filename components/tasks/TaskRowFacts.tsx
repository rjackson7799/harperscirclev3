import { ProvenanceLine } from '@/components/ui/ProvenanceLine';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { formatShortDate } from '@/lib/format/dates';
import type { TaskRow, TaskSource } from '@/lib/hc/tasks';

/**
 * The facts a task row carries wherever it renders (the list and the
 * detail): its subject (§4.0), its holder, its due date as a DATE (§8.6),
 * its snooze count (§4.5.4 — "a task snoozed four times is a signal the
 * family should be able to see"), and its provenance (design spec §7).
 */

export function snoozeText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? 'snoozed once' : `snoozed ${count} times`;
}

/**
 * Where it came from (AC-TASK-4): linked when the caller can see the
 * arrival, NAMED BY KIND and never linked when not — the receipt's
 * discipline (§3.5) — the writer and reader for a written instruction, and
 * the approver for a task with nothing behind it.
 */
export function SourceLine({ source, circle, approver, approvedAt }: {
  source: TaskSource;
  circle: string;
  approver: string;
  approvedAt: string;
}) {
  const approved = `approved by ${approver} · ${formatShortDate(approvedAt.slice(0, 10))}`;
  if (source.kind === 'arrival') {
    const from =
      source.channel === 'manual'
        ? `Added by hand by ${approver} · ${formatShortDate(approvedAt.slice(0, 10))}`
        : `From ${source.label} · ${formatShortDate(source.received_at.slice(0, 10))}`;
    return (
      <ProvenanceLine>
        <a href={`/${circle}/inbox/${source.arrival_id}`}>{from}</a>
        {source.channel === 'manual' ? null : ` · ${approved}`}
      </ProvenanceLine>
    );
  }
  if (source.kind === 'arrival_unseen') {
    return <ProvenanceLine>From an item in the Care Inbox · {approved}</ProvenanceLine>;
  }
  if (source.kind === 'written') {
    return (
      <ProvenanceLine>
        Written by {source.written_by}
        {source.written_for ? ` for ${source.written_for}` : ''}, from a task they can&apos;t see
      </ProvenanceLine>
    );
  }
  return <ProvenanceLine>Approved by {approver} · {formatShortDate(approvedAt.slice(0, 10))}</ProvenanceLine>;
}

export function TaskRowFacts({ task, circle }: { task: TaskRow; circle: string }) {
  const snooze = snoozeText(task.snooze_count);
  return (
    <>
      <p className="meta">
        <SubjectLabel subjectId={task.subject_id} seq={task.subject_seq} name={task.subject_name} />
        {' · '}
        {task.owner_name ?? 'Unassigned'}
        {task.due_on ? ` · due ${formatShortDate(task.due_on)}` : ''}
        {snooze ? ` · ${snooze}` : ''}
      </p>
      <SourceLine
        source={task.source}
        circle={circle}
        approver={task.approver_display_name}
        approvedAt={task.approved_at}
      />
    </>
  );
}
