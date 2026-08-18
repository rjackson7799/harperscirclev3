import {
  completeSecurityAction,
  killAllSessionsAndForceReset,
  pendingSecurityActions,
} from '@/lib/hc/security-actions';

/**
 * POST /api/worker/security-actions — the §5.11 retry sweep (ADR-0013 F3;
 * TSD §1.7 worker shape). Drains hc.pending_security_actions: any consumed
 * wasnt-me token whose immediate kill did not complete (crash, GoTrue
 * outage) gets its global sign-out + forced reset performed here, then
 * marked complete — hc_pipeline only, retry-safe by 2A construction.
 *
 * Invocation: the deploy-time cron (the sweeper cadence, §1.4) with the
 * worker key. Absent the key config the route is disabled, never open.
 */
export async function POST(req: Request): Promise<Response> {
  const key = process.env.HC_WORKER_KEY;
  if (!key) return new Response('worker disabled', { status: 503 });
  if (req.headers.get('x-worker-key') !== key) {
    return new Response('forbidden', { status: 403 });
  }

  const pending = await pendingSecurityActions();
  const results: { id: string; done: boolean }[] = [];
  for (const action of pending) {
    try {
      await killAllSessionsAndForceReset(action.account_id);
      await completeSecurityAction(action.id);
      results.push({ id: action.id, done: true });
    } catch {
      // Leave pending; the next sweep retries (at-least-once posture).
      results.push({ id: action.id, done: false });
    }
  }
  return Response.json({ drained: results.filter((r) => r.done).length, of: pending.length });
}
