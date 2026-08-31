import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { revokeSender } from '@/lib/hc/inbox';

/**
 * POST /[circle]/senders/revoke/submit — the second half of D15's gap
 * (5B B8; SND-03). `hc.revoke_sender` decides; this route only carries the
 * caller's identity to it and comes back.
 *
 * Every redirect is RELATIVE. An absolute one would move the browser between
 * `localhost` and `127.0.0.1` and silently drop the session cookie — the trap
 * this codebase has already paid for once.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string }> },
): Promise<Response> {
  const { circle } = await ctx.params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): signed-out 303s to sign-in; unavailable answers 503.
  const gate = await gateRoute(supabase, req, `/${circle}/senders`);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  const fields = await formFields(req);
  if (!fields.sender_id) {
    return redirect303(req, `/${circle}/senders?e=revoke`);
  }
  try {
    await revokeSender(claims, fields.sender_id);
  } catch {
    // DEF-10: one shape. Not authorized, already revoked and never existed
    // all come back the same way, and none of them is a 500.
    return redirect303(req, `/${circle}/senders?e=revoke`);
  }
  return redirect303(req, `/${circle}/senders?revoked=1`);
}
