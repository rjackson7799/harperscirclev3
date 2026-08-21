import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
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
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) {
    return redirect303(req, `/sign-in?next=${encodeURIComponent(`/${circle}/inbox`)}`);
  }

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
