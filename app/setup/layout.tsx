/**
 * The founder-door shell (PRD §4.1.3): same quiet column as (auth) — the
 * shell with nav arrives with the record surfaces.
 */
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-wordmark">Harper&apos;s Circle</div>
      {children}
    </div>
  );
}
