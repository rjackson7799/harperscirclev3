import { Shell } from '@/components/shell/Shell';
import { TopBar } from '@/components/shell/TopBar';
import { LeftNav } from '@/components/shell/LeftNav';
import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';

/**
 * The (app) shell (D3, §8.3): every circle-scoped screen renders inside
 * the top bar + left nav chrome. The layout reads the live session only
 * for the §4 user chip — PAGES own the signed-out redirect (the AC-AUTH-10
 * gate), so an anonymous request still renders the chrome around the
 * page's own refusal.
 */
export default async function CircleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ circle: string }>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  const user = claims?.email ? { name: claims.email } : undefined;

  return (
    <Shell topBar={<TopBar user={user} />} nav={<LeftNav circle={circle} />}>
      {children}
    </Shell>
  );
}
