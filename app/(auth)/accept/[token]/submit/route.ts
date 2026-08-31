import { asUser } from '@/lib/db/user';
import { acceptInvite } from '@/lib/hc/invites';
import { redirect303 } from '@/lib/auth/http';
import { withRouteBudget } from '@/lib/http/page-budget';

/**
 * POST /accept/[token]/submit (TSD §5.10). One DB transaction decides
 * everything — the conditional UPDATE, the address binding from the
 * SIGNED session claims, the freeze, the tier grants (IVT-02). Landing
 * follows §4.1.4 rule 4: family → the Timeline, care circle → their
 * tasks; nobody lands on an empty dashboard.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  // 7C C2 (OW-23): a person's wait answers inside the route budget.
  return withRouteBudget(
    async (budget) => {
      const supabase = await asUser();
      const { data } = await budget.race(supabase.auth.getClaims(), 'getClaims');
      const claims = data?.claims;
      if (!claims?.sub) {
        return redirect303(req, `/sign-in?next=${encodeURIComponent(`/accept/${token}`)}`);
      }

      try {
        const result = await budget.race(acceptInvite({ ...claims }, token), 'acceptInvite');
        const landing =
          result.tier === 'care_circle'
            ? `/${result.circle_id}/tasks`
            : `/${result.circle_id}/timeline`;
        return redirect303(req, landing);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        return redirect303(req, `/accept/${token}?e=refused`);
      }
    },
    () => redirect303(req, `/accept/${encodeURIComponent(token)}?e=slow`),
  );
}
