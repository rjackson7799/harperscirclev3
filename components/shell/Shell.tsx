import type { ReactNode } from 'react';

/**
 * The §8.3 shell: sticky top bar → a row of left nav and main content,
 * main capped at 1240px. `container-type: inline-size` on .shell is the
 * recorded §8.3 substitution — layout responds to the shell's measured
 * width via container queries, no JS, no viewport breakpoints. The shell
 * owns the ONE <main> landmark; pages render content, not landmarks.
 */
export function Shell({
  topBar,
  nav,
  children,
}: {
  topBar: ReactNode;
  nav: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      {topBar}
      <div className="shell-body">
        {nav}
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
