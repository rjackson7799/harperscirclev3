import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';
import { circleSubjects } from '@/lib/hc/tasks';
import { KINDS, addManualEvent, type Kind } from '@/lib/hc/timeline';

/**
 * POST /[circle]/timeline/add/submit — add by hand (7B B3; PRD §4.4.3;
 * TLN-02; MNL-01). ONE action: hc.create_manual_proposal drafts the manual
 * arrival with its proposal, hc.approve_proposal writes the event, and the
 * event is the receipt this route lands on. A date is a DATE in the
 * SUBJECT's zone (§2.7, §13.6 — "a day is the subject's day"), so the zone
 * comes from the subject row, never the form. Every guarantee is the
 * definers' (the view×5 cliff, the freeze, the payload contract). One
 * marker, never a 500.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string }> },
): Promise<Response> {
  const { circle } = await ctx.params;
  const list = `/${circle}/timeline`;
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, list);
  if (gate.kind === 'refused') return gate.response;

  const fields = await formFields(req);
  const subjectId = fields.subject_id ?? '';
  if (!UUID_RE.test(subjectId)) return redirect303(req, `${list}?e=add`);
  const failed = `${list}?subject=${subjectId}&e=add`;
  const kind = fields.kind ?? '';
  const summary = (fields.summary ?? '').trim();
  const occurredOn = fields.occurred_on ?? '';
  const documentId = (fields.document_id ?? '').trim();
  if (!(KINDS as readonly string[]).includes(kind) || !summary || !DATE_ONLY.test(occurredOn)) {
    return redirect303(req, failed);
  }
  if (documentId && !UUID_RE.test(documentId)) return redirect303(req, failed);

  return withRouteBudget(
    async (budget) => {
      try {
        const subject = (await budget.race(circleSubjects(gate.claims, circle), 'circleSubjects')).find(
          (s) => s.id === subjectId,
        );
        if (!subject) return redirect303(req, failed);
        const added = await budget.race(
          addManualEvent(gate.claims, circle, {
            subjectId,
            kind: kind as Kind,
            summary,
            occurredOn,
            occurredZone: subject.timezone,
            ...(documentId ? { documentId } : {}),
          }),
          'addManualEvent',
        );
        return redirect303(req, `${list}/${added.event_id}?added=1`);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`timeline add: refused: ${(err as Error).message}`);
        return redirect303(req, failed);
      }
    },
    () => redirect303(req, `${list}?subject=${subjectId}&e=slow`),
  );
}
