import { createHash, timingSafeEqual } from 'node:crypto';
import { expireHeldMail, expireScanResults, runTaintSweep } from '@/lib/hc/workers';
import { purgeQuarantineOlderThan } from '@/lib/storage/artifacts';

/**
 * /api/worker/nightly — the scheduler family's daily legs (RLY-01;
 * slice-4 plan B5), each isolated so one failure never blocks the rest:
 *
 *   1. hc.run_taint_sweep — OPS-01/D6's ruling made real: the nightly
 *      provenance sweep, recorded in hc.sweep_runs (admin_meta.
 *      sweep_health pages on findings > 0 or last_run_at > 24 h).
 *   2. hc.expire_scan_results — PRD §11.5's clean-cache expiry; the
 *      infected evidence rows (expires_at null) are never touched.
 *   3. hc.expire_held_mail — §5.4's 30-day expiry of unaccepted
 *      stranger mail, warned in the inbox first.
 *   4. The §11.5 quarantine BYTE purge (ADR-0018 F2's named owner):
 *      quarantined malware bytes out at 7 days; hash + verdict retained.
 *
 * Auth: the security-actions posture (GET = Vercel cron with
 * CRON_SECRET; POST = operational with HC_WORKER_KEY; unset ⇒ 503).
 */

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function nightlyPass(): Promise<Response> {
  const errors: string[] = [];

  let taint: number | null = null;
  try {
    taint = await runTaintSweep();
  } catch (err) {
    errors.push('taint_sweep');
    console.error(`worker/nightly: taint sweep failed: ${(err as Error).message}`);
  }

  let scanCacheRemoved: number | null = null;
  try {
    scanCacheRemoved = (await expireScanResults()).removed;
  } catch (err) {
    errors.push('scan_cache_expiry');
    console.error(`worker/nightly: scan-cache expiry failed: ${(err as Error).message}`);
  }

  let heldExpired: number | null = null;
  try {
    heldExpired = (await expireHeldMail()).expired_count;
  } catch (err) {
    errors.push('held_mail_expiry');
    console.error(`worker/nightly: held-mail expiry failed: ${(err as Error).message}`);
  }

  let quarantinePurged: number | null = null;
  try {
    quarantinePurged = (await purgeQuarantineOlderThan(7)).removed;
  } catch (err) {
    errors.push('quarantine_purge');
    console.error(`worker/nightly: quarantine byte purge failed: ${(err as Error).message}`);
  }

  if (taint !== null && taint > 0) {
    console.error(`worker/nightly: TAINT SWEEP FINDINGS: ${taint} (page-worthy, OPS-01)`);
  }

  return Response.json({
    taint_findings: taint,
    scan_cache_removed: scanCacheRemoved,
    held_expired: heldExpired,
    quarantine_bytes_purged: quarantinePurged,
    errors,
  });
}

/** The Vercel cron path. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('nightly disabled', { status: 503 });
  if (!secretMatches(req.headers.get('authorization'), `Bearer ${secret}`)) {
    return new Response('forbidden', { status: 403 });
  }
  return nightlyPass();
}

/** The operational path. */
export async function POST(req: Request): Promise<Response> {
  const key = process.env.HC_WORKER_KEY;
  if (!key) return new Response('nightly disabled', { status: 503 });
  if (!secretMatches(req.headers.get('x-worker-key'), key)) {
    return new Response('forbidden', { status: 403 });
  }
  return nightlyPass();
}
