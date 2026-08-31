import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { redirect303 } from '@/lib/auth/http';
import { activateForwardingAfterVerification } from '@/lib/hc/ingest';

/**
 * POST /account/activate-forwarding/submit — the activation pass, offered
 * again (7B B1 · OW-18). /confirm runs it once, on the founder's
 * verification; when that pass could not run the account page says so and
 * offers this. `hc.activate_forwarding` is idempotent with per-subject quiet
 * refusals (4B B6 / FWD-01), so running it twice is the same as once, and a
 * person below the bar gets a quiet zero rather than an error. Never a
 * reason to sign anyone out: the gate's three outcomes, read.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  const gate = await gateRoute(supabase, req, '/account');
  if (gate.kind === 'refused') return gate.response;
  try {
    await activateForwardingAfterVerification(gate.claims);
  } catch (err) {
    console.error(`activate-forwarding: the pass failed: ${(err as Error).message}`);
    return redirect303(req, '/account?verified=1&forwarding=failed');
  }
  return redirect303(req, '/account?forwarding=on');
}
