import { createHash, timingSafeEqual } from 'node:crypto';
import {
  completeSecurityAction,
  killAllSessionsAndForceReset,
  pendingSecurityActions,
} from '@/lib/hc/security-actions';

/**
 * /api/worker/security-actions — the §5.11 retry sweep (ADR-0013 F3;
 * round-10 findings 3, 9, 15; ops contract:
 * docs/ops/security-actions-worker.md). Drains hc.pending_security_actions:
 * any consumed wasnt-me token whose immediate kill did not complete
 * (crash, GoTrue outage) gets its global sign-out + forced reset performed
 * here, then marked complete — hc_pipeline only, retry-safe by 2A
 * construction, rotation idempotent (each lands entropy nobody holds).
 *
 * Two callers, two secrets, both timing-safe, either absent = that path
 * answers 503 (disabled, never open):
 *   - GET  — the checked-in Vercel cron (vercel.json), which invokes with
 *            `Authorization: Bearer ${CRON_SECRET}` (the platform's shape).
 *   - POST — the operational path, `x-worker-key: ${HC_WORKER_KEY}`.
 *
 * The sweep is BOUNDED and ORDERED (finding 9): oldest first — the
 * longest-owed kill is the most urgent — at most BATCH_LIMIT per run, so
 * a backlog defers instead of blowing the execution window; concurrent
 * sweeps are safe (completion is retry-safe; a double rotation is two
 * random passwords, the same forced-reset outcome). The response carries
 * what a monitor needs: drained / of / deferred / oldest_pending_age_s.
 */

const BATCH_LIMIT = 20;

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  // Hash both sides so the comparison is constant-time AND length-blind.
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function drain(): Promise<Response> {
  const pending = await pendingSecurityActions();
  const ordered = [...pending].sort(
    (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime(),
  );
  const oldestAgeS = ordered.length
    ? Math.max(0, Math.round((Date.now() - new Date(ordered[0].created_at).getTime()) / 1000))
    : 0;
  const batch = ordered.slice(0, BATCH_LIMIT);

  let drained = 0;
  for (const action of batch) {
    try {
      await killAllSessionsAndForceReset(action.account_id);
      await completeSecurityAction(action.id);
      drained += 1;
    } catch {
      // Leave pending; the next sweep retries (at-least-once posture).
    }
  }
  return Response.json({
    drained,
    of: pending.length,
    deferred: ordered.length - batch.length,
    oldest_pending_age_s: oldestAgeS,
  });
}

/** The Vercel cron path (finding 3): the scheduler is checked in, not a comment. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('worker disabled', { status: 503 });
  if (!secretMatches(req.headers.get('authorization'), `Bearer ${secret}`)) {
    return new Response('forbidden', { status: 403 });
  }
  return drain();
}

/** The operational path: manual sweeps and non-Vercel schedulers. */
export async function POST(req: Request): Promise<Response> {
  const key = process.env.HC_WORKER_KEY;
  if (!key) return new Response('worker disabled', { status: 503 });
  if (!secretMatches(req.headers.get('x-worker-key'), key)) {
    return new Response('forbidden', { status: 403 });
  }
  return drain();
}
