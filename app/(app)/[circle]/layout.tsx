import { Shell } from '@/components/shell/Shell';
import { TopBar } from '@/components/shell/TopBar';
import { LeftNav } from '@/components/shell/LeftNav';
import { asUser } from '@/lib/db/user';
import { readLiveSession } from '@/lib/auth/session';
import { myMembership } from '@/lib/hc/tasks';

/**
 * The (app) shell (D3, §8.3): every circle-scoped screen renders inside
 * the top bar + left nav chrome. The layout reads the live session only
 * for the §4 user chip — PAGES own the signed-out redirect (the AC-AUTH-10
 * gate), so an anonymous request still renders the chrome around the
 * page's own refusal. On `unavailable` it DEGRADES — the chrome without
 * the chip — and the page inside renders the state (7B B1, GTE-01: the one
 * layout in ADR-0028 D15's enumeration).
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
  const read = await readLiveSession(supabase);
  const user =
    read.kind === 'signed-in' && read.claims.email ? { name: read.claims.email } : undefined;

  // 7C C3 (NAV-01's composition half): the nav follows access per tier — a
  // courtesy, never the mechanism. A failed read falls OPEN to the full
  // manifest: the surfaces refuse for themselves. The TIER crosses to the
  // client nav, never the entries — NavEntry.href is a function and cannot
  // cross the RSC boundary (the first 7C gate run proved it at every page).
  let tier: string | null = null;
  if (read.kind === 'signed-in') {
    try {
      tier = (await myMembership(read.claims, circle))?.tier ?? null;
    } catch (err) {
      console.error(`layout: membership read failed: ${(err as Error).message}`);
    }
  }

  return (
    <Shell topBar={<TopBar user={user} />} nav={<LeftNav circle={circle} tier={tier} />}>
      {children}
    </Shell>
  );
}
