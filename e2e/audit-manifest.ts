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
// 7B B4 (slice-7 plan, G12 per increment): the record surfaces' own audit
// leg, over LIVE rows — list and detail, at 390px — plus the A11Y-09
// keyboard leg for the filters and the assign flow.
const RECORD_LEG =
  'a11y.spec — "the record surfaces: tasks and timeline, list and detail, audited at 390px"; keyboard: "A11Y-09: the filters and the assign flow, keyboard-operable end to end, at 390px and desktop"';
// 7C C2/C6 (slice-7 plan, G12 per increment): the documents viewer's own
// leg — sentences at summary, the pages through the artifact route at view,
// the machine-read sibling — plus A11Y-11's keyboard/390px half.
//
// 7E · R6/F-8, the record half (ACCEPTED-NOTE, a correction and not work):
// this citation used to promise "page navigation by keyboard through the ONE
// artifact route". The viewer STACKS its pages — no pager, no next/previous,
// no page list — so that clause had no target and never did. It is struck
// here rather than answered by building a pager to satisfy a sentence.
//
// 7E · R6/F-6: the title below is now the leg's actual one, verbatim;
// tests/design/audit-manifest.test.ts asserts it appears in a spec.
const DOCS_DETAIL_LEG =
  'documents.spec — "documents detail: sentences at summary with no viewer and no control; at view the pages through the artifact route with the machine-read sibling (DOC-02)"; keyboard: "A11Y-11: the viewer at 390px — axe clean, alt text on every page, the machine-read sibling reachable by keyboard as native text is"';

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
  '/[circle]/timeline': { leg: `${SHELL_LEG} (empty); ${RECORD_LEG}` },
  '/[circle]/tasks': { leg: `${SHELL_LEG} (empty); ${RECORD_LEG}` },
  '/[circle]/tasks/[task]': { leg: RECORD_LEG },
  '/[circle]/documents': {
    leg:
      'documents.spec — "documents list: rows at the member’s own level, counts post-filter over the rendered tree; Add a document is an ingestion (DOC-01, AC-DOC-2)"; a11y.spec — "the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px"',
  },
  '/[circle]/documents/[document]': { leg: DOCS_DETAIL_LEG },
  '/[circle]/people': {
    leg:
      'people.spec — "people: subjects as people with custodians named; the plain line before any matrix (PPL-01, AC-PPL-2/3)"; keyboard/390px: "A11Y-10: the plain line first; the matrix keyboard-operable; meaning never by colour; the printed log readable"; a11y.spec — "the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px"',
  },
  '/[circle]/people/log': {
    leg:
      'people.spec — "the access log rendered and printed (PPL-04, AC-PPL-5/7)" with a print-media snapshot; A11Y-10’s "printed log readable" half covers it; a11y.spec — "the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px"',
  },
  '/[circle]/people/subject/[subject]': {
    leg:
      'people.spec — "the subject’s page: the custodianship declaration and the profile facts at view (Q4(b), RCP-02’s profile link)"; a11y.spec — "the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px"',
  },
  '/[circle]/people/[member]': {
    leg:
      'people.spec — "adjust: a raise through step-up, a lower without; the care ceiling never offered above (PPL-02, AC-PERM-5)" and "revoke: the pre-revocation URL leg with the honest limit in the PRD’s words (PPL-03, AC-PPL-4)"; A11Y-10 covers the matrix keyboard pass',
  },
  '/[circle]/timeline/[event]': { leg: RECORD_LEG },
  '/[circle]/tasks/[task]/assign': {
    leg: 'record.spec — "cross-taint: not offered where she cannot see the subject; the sentence and exactly two paths where she can; path 1 readable and the original invisible FROM HER LIVE CONTEXT (TSK-01, AC-TASK-6)" drives it over a live crossing; axe runs inside that leg',
  },
  '/[circle]/invite': { leg: SHELL_LEG },
  '/[circle]/invite/created': { leg: INBOX_LEG },
  '/[circle]/inbox': { leg: INBOX_LEG },
  '/[circle]/senders': { leg: INBOX_LEG },
  '/[circle]/upload': { leg: INBOX_LEG },
  '/[circle]/inbox/[arrival]': {
    leg:
      'review.spec — the review legs drive it over a live arrival: "A11Y-07: full keyboard operation — Tab between facts, Enter selects and MOVES FOCUS, at 390px and desktop" and "A11Y-08: machine-read text — §6.9’s exact label, per page, readable where native text is not (OCR-01 live)" are its accessibility halves',
  },
};
