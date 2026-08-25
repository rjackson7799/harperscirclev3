// ============================================================================
// 6B B9 · R5/F-6: the PINNED a11y/browser audit list.
//
// `/[circle]/senders` shipped a render throw precisely because it had no
// browser coverage at all — and a list that is not pinned is a list that
// stops growing. Every `app/**/page.tsx` route appears here, naming the
// browser leg that audits it (axe at WCAG 2.2 AA with contrast on, the
// 390 px pass, touch targets, no horizontal scroll — a11y.spec.ts's
// auditRoute), or carrying an honest redirect-only / OWED claim instead.
//
// tests/design/audit-manifest.test.ts derives the route set from the
// FILESYSTEM and asserts exact-set equality BOTH WAYS: a new route fails
// vitest until someone says here how it is audited; a deleted route leaves
// the list. The values are claims a round can check against the specs.
// ============================================================================

export type AuditClaim = {
  /** The browser leg that audits this route — a test title in e2e/, or an
   *  honest `redirect-only:` / `OWED:` claim a reviewer can weigh. */
  leg: string;
};

const PUBLIC_LEG = 'a11y.spec — "public routes: sign-in, create-account, reset, wasnt-me"';
const RECOVERY_LEG = 'a11y.spec — "the recovery surfaces: reset/confirm, and accept with an invalid token"';
const SETUP_LEG = 'a11y.spec — "setup steps 1–4 and completion, audited; keyboard traversal of step 1"';
const SHELL_LEG = 'a11y.spec — "the (app) shell routes and account, audited at 390px"';
const INBOX_LEG = 'a11y.spec — "the Care Inbox family: inbox, senders, upload, invite/created, audited at 390px"';

export const AUDIT_MANIFEST: Record<string, AuditClaim> = {
  '/': {
    leg: 'redirect-only: routes by session to /setup or /sign-in; no rendered surface of its own — both destinations are audited',
  },
  '/sign-in': { leg: PUBLIC_LEG },
  '/create-account': { leg: PUBLIC_LEG },
  '/reset': { leg: PUBLIC_LEG },
  '/wasnt-me': { leg: PUBLIC_LEG },
  '/reset/confirm': { leg: RECOVERY_LEG },
  '/accept/[token]': { leg: RECOVERY_LEG },
  '/setup': {
    leg: 'redirect-only: the AC-AUTH-9 resume router; no rendered surface of its own — every step it routes to is audited',
  },
  '/setup/step/1': { leg: SETUP_LEG },
  '/setup/step/2': { leg: SETUP_LEG },
  '/setup/step/3': { leg: SETUP_LEG },
  '/setup/step/4': { leg: SETUP_LEG },
  '/setup/complete': { leg: SETUP_LEG },
  '/account': { leg: SHELL_LEG },
  '/styleguide': {
    leg: 'a11y.spec — "styleguide: contrast-on axe over every composition; reduced motion stills the pulse"',
  },
  '/[circle]/timeline': { leg: SHELL_LEG },
  '/[circle]/tasks': { leg: SHELL_LEG },
  '/[circle]/invite': { leg: SHELL_LEG },
  '/[circle]/invite/created': { leg: INBOX_LEG },
  '/[circle]/inbox': { leg: INBOX_LEG },
  '/[circle]/senders': { leg: INBOX_LEG },
  '/[circle]/upload': { leg: INBOX_LEG },
  '/[circle]/inbox/[arrival]': {
    leg: 'review.spec — the review legs drive it over a live arrival: "A11Y-07: full keyboard operation…" and "A11Y-08: machine-read text…" are its accessibility halves',
  },
};
