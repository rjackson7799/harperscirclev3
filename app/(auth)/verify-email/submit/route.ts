import { asUser } from '@/lib/db/user';
import { emailLinkOrigin, safeNext } from '@/lib/auth/redirect';
import { formFields, redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';

/**
 * POST /verify-email/submit — the resend control (PRD §4.1.2: "a resend
 * control", surfaced on the unverified sign-in state and on Account).
 * One answer for everyone: GoTrue swallows unknown and already-confirmed
 * addresses, and so does this route (§5.5).
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const email = (fields.email ?? '').trim();
  const next = safeNext(fields.next, '');
  const back = next ? `&next=${encodeURIComponent(next)}` : '';

  // 7C C2 (OW-23): a person's wait answers inside the route budget.
  return withRouteBudget(
    async (budget) => {
      if (email) {
        const supabase = await asUser();
        // B9 fix: the resent link lands on /confirm too, so the §5.1
        // activation pass runs on whichever mail the founder clicks.
        const linkOrigin = emailLinkOrigin(req);
        await budget.race(
          supabase.auth
            .resend({
              type: 'signup',
              email,
              ...(linkOrigin
                ? { options: { emailRedirectTo: `${linkOrigin}/confirm?flow=signup` } }
                : {}),
            })
            .catch(() => {}),
          'resend',
        );
      }
      return redirect303(req, `/sign-in?e=unverified&resent=1${back}`);
    },
    () => redirect303(req, `/sign-in?e=slow${back}`),
  );
}
