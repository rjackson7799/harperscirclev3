import { asUser } from '@/lib/db/user';
import { redirect303 } from '@/lib/auth/http';

/**
 * POST /account/sign-out-everywhere (TSD §5.5; AC-AUTH-10). GoTrue's
 * global scope destroys every session and refresh token; the E2E
 * verifies from a second browser within seconds.
 *
 * The AC-AUTH-10 access-log half is a RECORDED DDL FINDING (2B build
 * ADR): hc.log_event_types has no sign-out code and hc.log is
 * hc_internal-only — writing the entry needs a migration (event type +
 * definer), and the reserve is spent. The bound amendment is queued for
 * the round-10 gate; nothing here fakes the entry meanwhile.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  await supabase.auth.signOut({ scope: 'global' });
  return redirect303(req, '/sign-in?bye=1');
}
