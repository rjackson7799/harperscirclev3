import { asUser } from '@/lib/db/user';
import { redirect303 } from '@/lib/auth/http';

/**
 * POST /account/sign-out-everywhere (TSD §5.5; AC-AUTH-10). GoTrue's
 * global scope destroys every session and refresh token; the E2E
 * verifies from a second browser within seconds.
 *
 * The AC-AUTH-10 access-log half is an OWNER-AMENDED scope deferral
 * (ADR-0015 F2): hc.log_event_types has no sign-out code and hc.log is
 * hc_internal-only — writing the entry needs a migration (event type +
 * definer) past the spent reserve. The owner amended A7's 2B scope to
 * exclude it; it is a MANDATORY item of the batched bound amendment at
 * the next DB-opening slice (APP-09b stays pending until then); nothing
 * here fakes the entry meanwhile.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  await supabase.auth.signOut({ scope: 'global' });
  return redirect303(req, '/sign-in?bye=1');
}
