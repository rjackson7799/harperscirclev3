import { asUser } from '@/lib/db/user';
import { gateRoute } from '@/lib/auth/gate';
import { formFields, redirect303 } from '@/lib/auth/http';
import { acceptSender } from '@/lib/hc/inbox';
import { senderDomain } from '@/lib/mail/inbound';

/**
 * POST /[circle]/inbox/accept-sender/submit — SND-02's member surface
 * (§5.3: acceptance is per circle, revocable, effective immediately;
 * the release of held mail rides hc.accept_sender's own transaction).
 * Address mode accepts exactly this sender; domain mode trusts the
 * whole sending domain. Every refusal (non-coordinator, freeze,
 * already accepted) lands back in ONE shape.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ circle: string }> },
): Promise<Response> {
  const { circle } = await ctx.params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): signed-out 303s to sign-in; unavailable answers 503.
  const gate = await gateRoute(supabase, req, `/${circle}/inbox`);
  if (gate.kind === 'refused') return gate.response;
  const claims = gate.claims;

  const fields = await formFields(req);
  const address = (fields.address ?? '').trim();
  if (!address) return redirect303(req, `/${circle}/inbox?e=accept`);

  try {
    if (fields.mode === 'domain') {
      const domain = senderDomain(address);
      if (!domain) return redirect303(req, `/${circle}/inbox?e=accept`);
      await acceptSender(claims, circle, { domain });
    } else {
      await acceptSender(claims, circle, { address });
    }
  } catch {
    return redirect303(req, `/${circle}/inbox?e=accept`);
  }
  return redirect303(req, `/${circle}/inbox?accepted=1`);
}
