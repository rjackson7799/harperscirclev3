import 'server-only';
import { withRequestRole, type RequestClaims } from '@/lib/db/request-role';
import { isoText, isoTextOrNull } from './rows';

/**
 * The Tasks surface's data half (7B B2; PRD §4.5; TSD §3.6; TSK-01..04's app
 * halves, SHR-02's app half). Everything rides the request-role channel:
 * the caller's own authority, RLS on every joined table, and the 7A
 * definers' own gates decide — never this module.
 *
 * THE ONE THING THIS MODULE COMPUTES ITSELF is the answer at the point of
 * selection (PRD §4.5.5/§4.5.6; the slice-7 plan's settled point 3): who is
 * *not offered* a task, who *cannot clear its taint* and so gets the sentence
 * and exactly two human paths, and who takes it plainly. It is computed from
 * hc.circle_people's per-subject per-domain levels EXACTLY as hc.assign_task
 * asks the same question in-function — D19.7's gate (at least one deliberate
 * log-or-higher grant on the subject) and hc.ladder over the task's taint —
 * so the interface's answer and the database's cannot disagree.
 * tests/hc/tasks.test.ts drives both directions against the live definer.
 *
 * READS ARE RLS-TRUE JOINS, not per-table round trips: `tasks_select` decides
 * the row; the subject label, the holder's name, the source arrival and the
 * approver ride the same query through each table's own policy, so a source
 * the caller may not see comes back NULL — counted (there is one), never
 * named, never linked (the receipt's discipline, §3.5). Every temporal
 * column crosses through the one named function; `due_on` is a DATE and is
 * cast to text in SQL, because node-postgres would otherwise hand back a
 * Date at local midnight — the previous UTC day, once sliced.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a task came from (AC-TASK-4): resolved when the caller can read it,
 *  NAMED BY KIND and never linked when not, its own sentence for a written
 *  instruction, and `none` for a task with no arrival behind it. */
export type TaskSource =
  | { kind: 'arrival'; arrival_id: string; channel: string; label: string; received_at: string }
  | { kind: 'arrival_unseen' }
  | { kind: 'written'; from_task_id: string; written_by: string; written_for: string | null }
  | { kind: 'none' };

export type TaskRow = {
  id: string;
  circle_id: string;
  subject_id: string;
  subject_name: string;
  /** 1 for the circle's founding subject (plum), 2… after — the accent seq. */
  subject_seq: number;
  title: string;
  detail: string | null;
  /** DATE-ONLY (§2.7), as 'YYYY-MM-DD'. */
  due_on: string | null;
  due_zone: string | null;
  status: 'open' | 'done' | 'cancelled';
  owner_member_id: string | null;
  owner_name: string | null;
  assigned_at: string | null;
  assigned_by_name: string | null;
  snooze_count: number;
  written_for_member_id: string | null;
  written_from_task_id: string | null;
  taint: string[];
  taint_resolved: boolean;
  source: TaskSource;
  approved_at: string;
  approver_display_name: string;
  completed_at: string | null;
  completed_by_name: string | null;
  /** The caller holds MANAGE on this task from their own context —
   *  hc.visible_at, the policies' own function, asked once per row. */
  can_manage: boolean;
  /** The coordinator's view of an original names its live instruction
   *  (PRD §4.5.6 path 1); null on an instruction row and for everyone who
   *  cannot see the instruction. */
  instruction: { id: string; status: string; title: string; written_for: string | null } | null;
};

type TaskSql = {
  id: string;
  circle_id: string;
  subject_id: string;
  subject_name: string;
  subject_seq: number;
  title: string;
  detail: string | null;
  due_on: string | null;
  due_zone: string | null;
  status: string;
  owner_member_id: string | null;
  owner_name: string | null;
  assigned_at: Date | string | null;
  assigned_by_name: string | null;
  snooze_count: number;
  written_for_member_id: string | null;
  written_from_task_id: string | null;
  written_for_name: string | null;
  taint: string[];
  taint_resolved: boolean;
  source_arrival_id: string | null;
  arrival_seen: string | null;
  source_channel: string | null;
  sender_display_name: string | null;
  sender_address: string | null;
  source_received_at: Date | string | null;
  approved_at: Date | string;
  approver_display_name: string;
  completed_at: Date | string | null;
  completed_by_name: string | null;
  can_manage: boolean;
  instruction: { id: string; status: string; title: string; written_for: string | null } | null;
};

/**
 * A subject's seq — 1 for the founding subject (plum, lib/design/accents),
 * 2… after. hc.create_circle writes every subject in ONE transaction, so
 * `created_at` ties and `id` is random; the record of the order is the
 * custodianship declarations it wrote FIRST, seq 1 and 2 (AC-AUTH-6), which
 * name each subject. Circle-level log entries are readable by every live
 * member (access_log_select), so the seq is the same for everyone.
 */
export const SUBJECT_SEQ = `
  select s2.id,
         row_number() over (
           order by (select min(l.seq) from public.access_log l
                      where l.circle_id = s2.circle_id
                        and l.event_type = 'custodianship_declared'
                        and l.detail ->> 'subject_name' = s2.first_name) nulls last,
                    s2.created_at, s2.id)::int as seq
    from public.subjects s2
   where s2.circle_id = $1 and s2.deleted_at is null`;

const TASK_SELECT = `
  select t.id, t.circle_id, t.subject_id, s.first_name as subject_name,
         sq.seq as subject_seq,
         t.title, t.detail, t.due_on::text as due_on, t.due_zone, t.status,
         t.owner_member_id, om.display_name_at_join as owner_name,
         t.assigned_at, ab.display_name_at_join as assigned_by_name,
         t.snooze_count, t.written_for_member_id, t.written_from_task_id,
         wm.display_name_at_join as written_for_name,
         t.taint::text[] as taint, t.taint_resolved,
         t.source_arrival_id, a.id as arrival_seen, a.channel::text as source_channel,
         a.sender_display_name, a.sender_address, a.received_at as source_received_at,
         t.approved_at, t.approver_display_name,
         t.completed_at, cb.display_name_at_join as completed_by_name,
         hc.visible_at(hc.ctx(), t.subject_id, t.taint, t.taint_resolved,
                       'task', t.id, t.owner_member_id) >= 'manage' as can_manage,
         (select jsonb_build_object('id', i.id, 'status', i.status, 'title', i.title,
                                    'written_for', iw.display_name_at_join)
            from public.tasks i
            left join public.circle_members iw on iw.id = i.written_for_member_id
           where i.written_from_task_id = t.id and i.deleted_at is null
           order by (i.status = 'open') desc, i.approved_at desc limit 1) as instruction
    from public.tasks t
    join public.subjects s on s.id = t.subject_id
    join (${SUBJECT_SEQ}) sq on sq.id = t.subject_id
    left join public.circle_members om on om.id = t.owner_member_id
    left join public.circle_members wm on wm.id = t.written_for_member_id
    left join public.circle_members ab
      on ab.circle_id = t.circle_id and ab.account_id = t.assigned_by and ab.subject_id is null
    left join public.circle_members cb
      on cb.circle_id = t.circle_id and cb.account_id = t.completed_by and cb.subject_id is null
    left join public.arrivals a on a.id = t.source_arrival_id
   where t.circle_id = $1 and t.deleted_at is null`;

function sourceOf(row: TaskSql): TaskSource {
  if (row.written_from_task_id) {
    return {
      kind: 'written',
      from_task_id: row.written_from_task_id,
      written_by: row.approver_display_name,
      written_for: row.written_for_name,
    };
  }
  if (!row.source_arrival_id) return { kind: 'none' };
  if (!row.arrival_seen || !row.source_channel || !row.source_received_at) {
    return { kind: 'arrival_unseen' };
  }
  const label =
    row.source_channel === 'email'
      ? (row.sender_display_name ?? row.sender_address ?? 'an email')
      : row.source_channel === 'upload'
        ? 'an uploaded document'
        : 'added by hand';
  return {
    kind: 'arrival',
    arrival_id: row.arrival_seen,
    channel: row.source_channel,
    label,
    received_at: isoText(row.source_received_at),
  };
}

function toRow(row: TaskSql): TaskRow {
  return {
    id: row.id,
    circle_id: row.circle_id,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    subject_seq: Number(row.subject_seq),
    title: row.title,
    detail: row.detail,
    due_on: row.due_on,
    due_zone: row.due_zone,
    status: row.status as TaskRow['status'],
    owner_member_id: row.owner_member_id,
    owner_name: row.owner_name,
    assigned_at: isoTextOrNull(row.assigned_at),
    assigned_by_name: row.assigned_by_name,
    snooze_count: Number(row.snooze_count),
    written_for_member_id: row.written_for_member_id,
    written_from_task_id: row.written_from_task_id,
    taint: row.taint ?? [],
    taint_resolved: row.taint_resolved,
    source: sourceOf(row),
    approved_at: isoText(row.approved_at),
    approver_display_name: row.approver_display_name,
    completed_at: isoTextOrNull(row.completed_at),
    completed_by_name: row.completed_by_name,
    can_manage: row.can_manage === true,
    instruction: row.instruction ?? null,
  };
}

/** Every task the caller can see in the circle — `tasks_select` decides;
 *  a caregiver's answer is exactly her assigned tasks (AC-TASK-5). Open
 *  first by due date (undated last), then the closed. */
export async function listTasks(claims: RequestClaims, circleId: string): Promise<TaskRow[]> {
  if (!UUID_RE.test(circleId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<TaskSql>(
      `${TASK_SELECT}
       order by (t.status <> 'open'), (t.due_on is null), t.due_on, t.approved_at, t.id
       limit 200`,
      [circleId],
    );
    return r.rows.map(toRow);
  });
}

/** One task, or null in ONE shape for foreign, nonexistent, deleted,
 *  below-summary and malformed alike (DEF-10). */
export async function taskById(
  claims: RequestClaims,
  circleId: string,
  taskId: string,
): Promise<TaskRow | null> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(taskId)) return null;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<TaskSql>(`${TASK_SELECT} and t.id = $2`, [circleId, taskId]);
    return r.rows[0] ? toRow(r.rows[0]) : null;
  });
}

/** The caller's own live member row in this circle — the `Mine` filter's
 *  key — or null for an outsider. `circle_members_select` is the gate. */
export async function myMemberId(claims: RequestClaims, circleId: string): Promise<string | null> {
  if (!UUID_RE.test(circleId)) return null;
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ id: string }>(
      `select m.id from public.circle_members m
        where m.circle_id = $1 and m.account_id = (select auth.uid())
          and m.removed_at is null and m.subject_id is null
        limit 1`,
      [circleId],
    );
    return r.rows[0]?.id ?? null;
  });
}

// ---------------------------------------------------------------------------
// The point of selection.
// ---------------------------------------------------------------------------

export type Candidate = {
  member_id: string;
  display_name: string;
  tier: string;
  /** PRD §4.5.5: a person with no context on the subject is NOT OFFERED —
   *  D19.7: no deliberate log-or-higher grant on any domain. */
  offered: boolean;
  /** Can she clear the task's taint at >= summary (hc.ladder over the
   *  taint, as she meets the policy once the task is hers)? false ⇒ the
   *  sentence and the two paths. null when her levels are not the caller's
   *  to know (circle_people fails closed below coordinator) — the database
   *  decides on submit. */
  can_see: boolean | null;
  levels_known: boolean;
};

const RANK: Record<string, number> = { hidden: 0, log: 1, summary: 2, view: 3, manage: 4 };
const ALL_DOMAINS = ['memories', 'health', 'schedule', 'documents', 'finances'];

/** The same arithmetic hc.assign_task performs in-function, over the levels
 *  hc.circle_people returns — exported so the pure half is testable. */
export function selectionFor(
  levels: Record<string, string> | null | undefined,
  taint: string[],
  taintResolved: boolean,
): { offered: boolean; can_see: boolean | null; levels_known: boolean } {
  if (!levels) return { offered: true, can_see: null, levels_known: false };
  const rank = (d: string) => RANK[levels[d] ?? 'hidden'] ?? 0;
  // D19.7: context on the subject is at least one deliberate grant at log
  // or higher, on any domain.
  const offered = ALL_DOMAINS.some((d) => rank(d) >= RANK.log);
  if (!offered) return { offered: false, can_see: false, levels_known: true };
  // hc.visible_at rung 3: unresolved or empty lineage ⇒ manage on all five,
  // or nothing. Rung 6: the ladder — min over the taint, at >= summary.
  const canSee =
    !taintResolved || taint.length === 0
      ? ALL_DOMAINS.every((d) => rank(d) >= RANK.manage)
      : taint.every((d) => rank(d) >= RANK.summary);
  return { offered, can_see: canSee, levels_known: true };
}

/**
 * Who may be offered THIS task, with the sentence decided at the point of
 * selection (TSK-01's app half). hc.circle_people gives a coordinator every
 * member's levels; anyone else gets her own and NULL for the rest, and a
 * null here is "not yours to know", never "hidden" — the candidate is
 * offered and hc.assign_task decides.
 */
export async function assignCandidates(
  claims: RequestClaims,
  circleId: string,
  task: Pick<TaskRow, 'subject_id' | 'taint' | 'taint_resolved'>,
): Promise<Candidate[]> {
  if (!UUID_RE.test(circleId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{
      member_id: string;
      display_name: string;
      tier: string;
      levels: Record<string, Record<string, string>> | null;
    }>(
      `select p.member_id, p.display_name, p.tier::text as tier, p.levels
         from hc.circle_people($1) p
        where p.kind = 'member'
        order by p.display_name, p.member_id`,
      [circleId],
    );
    return r.rows.map((row) => ({
      member_id: row.member_id,
      display_name: row.display_name,
      tier: row.tier,
      ...selectionFor(row.levels?.[task.subject_id] ?? null, task.taint, task.taint_resolved),
    }));
  });
}

// ---------------------------------------------------------------------------
// The writes — the 7A definers, reached for the first time from a surface.
// ---------------------------------------------------------------------------

export type AssignResult = {
  task_id: string;
  member_id: string;
  path: 'plain' | 'instruction' | 'share';
  changed: boolean;
  instruction_task_id?: string;
  share_ids?: string[];
  former_member_id?: string;
  shares_revoked?: number;
  instructions_closed?: number;
};

/**
 * hc.assign_task — plain, or exactly one of §4.5.6's two human paths. The
 * instruction is what the ASSIGNER typed (never pre-filled, never the AI's);
 * path 2 carries the §5.7 token bound to `share_object` +
 * `task:<id>+document:<id>`, consumed in the definer's own transaction.
 */
export async function assignTask(
  claims: RequestClaims,
  taskId: string,
  memberId: string,
  opts: { instruction?: string; shareDocument?: string; stepUpToken?: string } = {},
): Promise<AssignResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: AssignResult }>('select hc.assign_task($1, $2, $3, $4, $5) as r', [
      taskId,
      memberId,
      opts.instruction ?? null,
      opts.shareDocument ?? null,
      opts.stepUpToken ?? null,
    ]);
    return r.rows[0].r;
  });
}

export type UnassignResult = {
  task_id: string;
  former_member_id: string;
  former_owner_name: string;
  shares_revoked: number;
  shares_kept: number;
  instructions_closed: number;
};

/** hc.unassign_task — revokes exactly this assignment's shares (a
 *  coordinator's keep list survives), closes the instruction (AC-TASK-7). */
export async function unassignTask(
  claims: RequestClaims,
  taskId: string,
  keepShareIds?: string[],
): Promise<UnassignResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: UnassignResult }>('select hc.unassign_task($1, $2) as r', [
      taskId,
      keepShareIds && keepShareIds.length > 0 ? keepShareIds : null,
    ]);
    return r.rows[0].r;
  });
}

export type CompleteResult = {
  task_id: string;
  status: 'done';
  completed_by: string;
  completed_at: string;
  original_task_id?: string;
  instructions_closed?: number;
  shares_revoked?: number;
};

/** hc.complete_task — the ORIGINAL is the work (D19.4): completing an
 *  instruction completes its original; completing an original cancels its
 *  instructions; completion revokes the assignment's shares (D19.6). */
export async function completeTask(claims: RequestClaims, taskId: string): Promise<CompleteResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: CompleteResult }>('select hc.complete_task($1) as r', [taskId]);
    return r.rows[0].r;
  });
}

export type SnoozeResult = { task_id: string; due_on: string; due_zone: string; snooze_count: number };

/** hc.snooze_task — forward only, the count on the row, one revision row
 *  naming the actor (§4.5.4). */
export async function snoozeTask(
  claims: RequestClaims,
  taskId: string,
  dueOn: string,
  dueZone: string,
): Promise<SnoozeResult> {
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ r: SnoozeResult }>('select hc.snooze_task($1, $2::date, $3) as r', [
      taskId,
      dueOn,
      dueZone,
    ]);
    return r.rows[0].r;
  });
}

// ---------------------------------------------------------------------------
// The reads beside the controls.
// ---------------------------------------------------------------------------

export type ShareRow = {
  share_id: string;
  member_id: string;
  display_name: string;
  tier: string;
  granter_name: string;
  granted_at: string;
  created_by_assignment_of: string | null;
};

/** hc.shares_for('task', id): the live shares on a task for a MANAGE-holder
 *  — the keep list a coordinator chooses from at unassign — and zero rows,
 *  never an error, for everyone else (D7). */
export async function sharesForTask(claims: RequestClaims, taskId: string): Promise<ShareRow[]> {
  if (!UUID_RE.test(taskId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{
      share_id: string;
      member_id: string;
      display_name: string;
      tier: string;
      granter_name: string;
      granted_at: Date | string;
      created_by_assignment_of: string | null;
    }>(`select * from hc.shares_for('task', $1)`, [taskId]);
    return r.rows.map((row) => ({
      share_id: row.share_id,
      member_id: row.member_id,
      display_name: row.display_name,
      tier: String(row.tier),
      granter_name: row.granter_name,
      granted_at: isoText(row.granted_at),
      created_by_assignment_of: row.created_by_assignment_of,
    }));
  });
}

export type SourceDocument = { id: string; title: string; filed_on: string };

/** The documents filed from the arrival a task came from — what path 2 can
 *  name ("the discharge summary from Jul 12"). RLS-true: a document the
 *  caller cannot see is not offered to be shared. */
export async function sourceDocuments(
  claims: RequestClaims,
  circleId: string,
  arrivalId: string,
): Promise<SourceDocument[]> {
  if (!UUID_RE.test(circleId) || !UUID_RE.test(arrivalId)) return [];
  return withRequestRole('authenticated', claims, async (q) => {
    const r = await q.query<{ id: string; title: string; filed_on: string }>(
      `select d.id, d.title, (d.filed_at at time zone 'UTC')::date::text as filed_on
         from public.documents d
        where d.circle_id = $1 and d.deleted_at is null
          and (d.artifact_arrival_id = $2 or d.source_arrival_id = $2)
        order by d.filed_at, d.id`,
      [circleId, arrivalId],
    );
    return r.rows.map((row) => ({ id: row.id, title: row.title, filed_on: row.filed_on }));
  });
}

// ---------------------------------------------------------------------------
// The filters — pure, over the rows RLS already decided, so the counts the
// page shows are counted post-filter over what the caller can see
// (AC-TASK-5, PRD §7.6 "counts are content at the margin").
// ---------------------------------------------------------------------------

export type FilterKey = 'mine' | 'unassigned' | 'overdue' | 'all';
export const FILTERS: readonly FilterKey[] = ['mine', 'unassigned', 'overdue', 'all'];

export function taskFilters<
  T extends { status: string; owner_member_id: string | null; due_on: string | null },
>(rows: readonly T[], myMemberId: string | null, today: string) {
  const open = rows.filter((r) => r.status === 'open');
  return {
    all: open,
    mine: open.filter((r) => myMemberId !== null && r.owner_member_id === myMemberId),
    unassigned: open.filter((r) => r.owner_member_id === null),
    overdue: open.filter((r) => r.due_on !== null && r.due_on < today),
    /** Done is terminal and never deleted (§4.5.3); a cancelled instruction
     *  (D19.4) is not open work and not a record of contribution either. */
    closed: rows.filter((r) => r.status === 'done'),
  };
}
