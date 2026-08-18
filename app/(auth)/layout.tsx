/**
 * The (auth) shell (TSD §1.7): a centered column on sand with the
 * wordmark — no nav, no chrome. Screens are cream cards (design spec §5).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-wordmark">Harper&apos;s Circle</div>
      {children}
    </div>
  );
}
