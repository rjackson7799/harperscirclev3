import type { ReactNode } from 'react';

/**
 * The sticky top bar (§8.3; contents in design_spec §4 order): logo +
 * wordmark · ask-the-record search · (auto margin) · feedback · member
 * avatars · current user with role beneath. The slots exist in this API
 * so the §4 order is structural, but each renders NOTHING until its
 * surface is built (search is slice 8; feedback has no surface yet) —
 * never promise what isn't built. The logo mark is pending its measured
 * asset; the wordmark carries identity alone until then (recorded in
 * docs/review/design-conformance.md).
 */
export function TopBar({
  search,
  feedback,
  members,
  user,
}: {
  search?: ReactNode;
  feedback?: ReactNode;
  members?: ReactNode;
  user?: { name: string; role?: string };
}) {
  return (
    <header className="topbar">
      <span className="wordmark">Harper&apos;s Circle</span>
      {search ?? null}
      <div className="topbar-spacer" />
      {feedback ?? null}
      {members ?? null}
      {user ? (
        <div className="topbar-user">
          <span className="row-title">{user.name}</span>
          {user.role ? <span className="micro-meta">{user.role}</span> : null}
        </div>
      ) : null}
    </header>
  );
}
