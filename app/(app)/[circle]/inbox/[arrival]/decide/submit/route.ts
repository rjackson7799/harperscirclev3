import { liveSessionClaims } from '@/lib/auth/session';
import { asUser } from '@/lib/db/user';
import { formFields, redirect303 } from '@/lib/auth/http';
import { approveProposal, rejectProposal } from '@/lib/hc/review';

/**
 * POST /[circle]/inbox/[arrival]/decide/submit — the review screen's one
 * write path (6B B8; PRD §4.2.3). Every guarantee is the definers': the
 * write-time re-check (M2's view×5), the version gate, §6.4's confirmation,
 * the freeze refusal and the 6B payload contract all live in
 * hc.approve_proposal / hc.reject_proposal — this route only carries what
 * the person did, faithfully.
 *
 * `p_edits` is exactly the person's action: a typed correction as
 * `fields.{value,title}` (whitespace-only is NO edit), the chosen conflict
 * outcome, and `confirm_high` as a REAL boolean (the payload contract
 * refuses anything else). Nothing → NULL, never `{}` — an approve with no
 * edits must stay `approved`, not `edited_approved`.
 *
 * THE IDEMPOTENCY KEY IS DETERMINISTIC over (proposal, version, decision,
 * outcome): a double-click or a browser re-POST presents the SAME key and
 * replays the stored result (AC-INBOX-12, actor-bound by the DB). A key
 * minted per request would turn every resubmit into a refusal.
 *
 * Refusals: `proposal_version_changed` / `proposal_taint_changed` carry
 * their NAMED markers back so B7 re-renders with what changed highlighted;
 * everything else is DEF-10's one `?e=decide` shape — never a 500, never an
 * error-shape oracle.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string; arrival: string }> },
): Promise<Response> {
  const { circle, arrival } = await ctx.params;
  const back = `/${circle}/inbox/${arrival}`;
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) {
    return redirect303(req, `/sign-in?next=${encodeURIComponent(back)}`);
  }

  const fields = await formFields(req);
  const proposalId = fields.proposal_id;
  const version = Number.parseInt(fields.p_expected_version ?? '', 10);
  const decision = fields.decision;
  if (!proposalId || !Number.isInteger(version) || (decision !== 'approve' && decision !== 'reject')) {
    return redirect303(req, `${back}?e=decide`);
  }

  const outcome = fields.conflict_outcome || undefined;
  const key = `decide:${proposalId}:v${version}:${decision}:${outcome ?? '-'}`;

  try {
    if (decision === 'approve') {
      const editFields: Record<string, string> = {};
      if (fields.edit_value?.trim()) editFields.value = fields.edit_value.trim();
      if (fields.edit_title?.trim()) editFields.title = fields.edit_title.trim();
      const edits: Record<string, unknown> = {};
      if (Object.keys(editFields).length > 0) edits.fields = editFields;
      if (outcome) edits.conflict_outcome = outcome;
      if (fields.confirm_high === '1') edits.confirm_high = true;
      await approveProposal(
        claims,
        proposalId,
        version,
        key,
        Object.keys(edits).length > 0 ? edits : null,
      );
    } else {
      await rejectProposal(claims, proposalId, version, key, fields.reject_reason || null);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('proposal_version_changed')) {
      return redirect303(req, `${back}?refused=version&proposal=${proposalId}`);
    }
    if (message.includes('proposal_taint_changed')) {
      return redirect303(req, `${back}?refused=taint&proposal=${proposalId}`);
    }
    return redirect303(req, `${back}?e=decide`);
  }
  return redirect303(req, `${back}?decided=1`);
}
