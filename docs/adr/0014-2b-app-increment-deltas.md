# ADR-0014 — 2B app increment: design deltas, boundary mechanisms, and the queued DDL findings

**Status:** Accepted at the round-10 gate, as amended (2026-08-18) —
owner rulings recorded in **ADR-0015** (round-10 dispositions: D1/D2/D4
ratified; D2 additionally carries the finding-4 threat model in
`docs/ops/runtime-db-credentials.md`; D3's two deviations accepted with
the fuller finding-5 framing; the D6 relationship narrowing amended to
carry-then-queue; the worker's invoker is now checked in). **Merged** to main at `2dc8ee8`
(PR #6; owner sign-off with the ADR-0015 ratification; CI green on main,
run 32182443779)
**Deciders:** build (owner ratifies at the gate, per ADR-0006)
**Context:** Slice 2B (app, A1–A9) built on `slice/2b-app-onboarding`
against 2A's shipped 46 migrations under the ZERO-migration constraint —
the ≤ 8 reserve is spent (ADR-0013), so every DB-shaped gap below is
either solved inside the app layer with a recorded mechanism, or queued
as a bound-amendment question for the owner at round 10. Nothing in this
increment writes DDL.

---

## D1 — The request-role server channel (`lib/db/request-role.ts`)

hc.\* is deliberately not API-exposed (PIN-01), so every hc call the app
makes rides a direct connection that assumes a request role for exactly
one transaction: `SET LOCAL ROLE anon|authenticated` + the caller's
VERIFIED JWT claims in `request.jwt.claims`, both transaction-scoped, so
the pooled session leaves every call as the connection identity with no
residue (tested both ways, success and throw). This is the channel
ADR-0013 F1 anticipated ("server-side code assuming request roles") and
the repo's own request-role simulation (pgTAP, concurrency runner) made
precedent. ESLint fences it to `lib/hc/**` — typed, narrow wrappers are
the only doorway. The channel proves REAL request authority in tests: an
anon call holds anon's catalog privileges, not the connection's.

## D2 — The maintenance boundary (`lib/db/maintenance.ts`), enumerated

The postgres/maintenance identity (DEF-07's documented exemption; the
identity the migration runner and the 2A mirror triggers already hold)
performs a CLOSED list of operations the DB deliberately gives no
request path — each one a standing round-10 question ("should this
become a definer under a bound amendment?"):

| Op | Why it exists | 2A precedent |
|---|---|---|
| `insertAccountRow` | accounts has zero request-path INSERT and 2A shipped no creation definer; sign-up must create the row | the 2A suites seed accounts exactly this way |
| `unconfirmEmail` | the verification model (D3): corrects autoconfirm's stamp where 2A put verification truth | the M3/M5 mirror reads `auth.users.email_confirmed_at` live |
| `setAccountSlice` | PRD §4.1.3 step 1 / §4.1.6; `accounts.slice` exists for exactly this write; no UPDATE grant exists | §2.3 annotates the column "declared slice" |
| `updateOpeningContext` | PRD §4.1.3 step 3 happens AFTER step 2's `create_circle` — the only writer of `opening_context`; guarded in-statement to the founder's own circle in `state='setup'` | §2.3 annotates "step 3 multi-select" |
| `describeInviteByToken` | the accept screen must show circle/inviter/subjects/ceiling BEFORE any session exists (PRD §4.1.4 item 2); invites carry zero request-path reads and no describe definer shipped | keyed STRICTLY on sha256 of the 32-byte token — the capability the mail recipient already holds; unknown ⇒ null, one shape |
| `revokeAuthSessions` | the §5.8 sessions row; the probed GoTrue (image `v2.180.x`, CLI 2.100.1) exposes **no per-user admin logout endpoint** (404) and supabase-js has none | deletes `auth.sessions` + revokes refresh tokens — the same rows GoTrue's own logout destroys |

ESLint fences the module to `lib/hc/**`; no generic query surface exists.

## D3 — The verification model (soft-for-use vs a binary GoTrue)

Empirical facts, probed against the live stack and pinned in the parity
doc (docs/ops/auth-config-parity.md):

1. This GoTrue gates the **password grant on email confirmation
   unconditionally** — `email_not_confirmed` even with confirmations
   disabled — and checks the password FIRST (wrong password answers
   `invalid_credentials`), so `email_not_confirmed` is reachable only by
   the password holder.
2. Public signUp under autoconfirm mints a session AND stamps
   `email_confirmed_at`; admin-created unconfirmed users can never
   password-sign-in; refresh works for unconfirmed users; `resend
   type=signup` delivers the confirmation mail for unconfirmed users.

Therefore create-account = **public signUp (the one unverified-capable
session mint) → immediate `unconfirmEmail` (truth restored where the 2A
mirror reads it — AC-AUTH-4/G4 stay real) → accounts bootstrap (after
the un-confirm, so the insert mirror reads NULL) → resend**. The founder
keeps a 30-day session on the signup device; setup never touches mail.

**Two recorded deviations, for round 10:**

- **§5.5 byte-identity carve-out:** fresh and already-exists answer the
  same status/Location/body, but the fresh branch necessarily carries
  its session's Set-Cookie. The alternative (no session either branch)
  makes verification hard-for-use — a §4.1.2 violation — because an
  unverified account cannot password-sign-in on this GoTrue. We chose
  the §4.1.2 letter over the last channel of §5.5's; the owner may
  re-weigh.
- **Unverified + new device:** password sign-in surfaces "confirm your
  email first" with a resend. Password-gated (fact 1), so not an oracle;
  still a narrow "hard" edge §4.1.2 does not name.

## D4 — Revocation mechanisms (§5.8; AC-PERM-3; AC-AUTH-10)

- **wasnt-me kill** = `revokeAuthSessions` + admin password rotation to
  random (forced reset; recovery stays open and unthrottled), performed
  by the POST right after `execute_wasnt_me` commits; completion via
  `hc.complete_security_action`; `/api/worker/security-actions` is the
  hc_pipeline retry sweep (key-gated; keyless = 503). ADR-0013 F3 as
  contracted.
- **remove_member** = the DB transaction, then `revokeAuthSessions` with
  the returned account id. No rotation — removal ends access, not the
  account.
- **Page-shell liveness:** local JWT validation cannot see a dead
  session, so signed-in PAGES gate through `getUser()` (server-validated
  against the session store) — that is what makes AC-AUTH-10's "within
  seconds, from a second browser" true. A still-unexpired JWT held by a
  removed member reads NOTHING regardless — RLS is the enforcement
  (proven in the walkthrough from a live second context).

## D5 — asGoTrueAdmin inside `lib/db/service-role.ts`

The GoTrue-admin surface (password rotation; admin user ops) uses the
service credential, so it lives in the ONE module the containment grep
permits, as a deliberately narrower export; `lib/auth/gotrue-admin.ts`
is its single consumer and joined the ESLint allowlist. `asServiceRole()`
itself is unchanged (still the artifact-route stub).

## D6 — Narrowings inside 2B scope, stated

- **ADR-0011 local parts** are minted app-side at step 2 as VALUES
  (`<firstname>.<6-char>`, ambiguity-free alphabet) — `subjects.
  forwarding_local_part` is NOT NULL, so step 2 must supply them;
  provider provisioning and uniqueness hardening stay slice 4.
- **Step 4 upload** renders, optional and skippable, with the upload
  affordance disabled in plain words: the operational pipeline is
  production-disabled until RLY-01 (ADR-0008 M1).
- **Invite delivery** is the copy-link path (plan design note 3): the
  once-returned token rides a 120 s HttpOnly cookie to a shown-once
  view; the invite email is slice 11. "Ask for a new one" on dead-token
  screens is copy, not a notification — slice 11's mail carries it.
- **Landings** (`/[circle]/timeline`, `/[circle]/tasks`) are the record
  surfaces' honest floors: real RLS reads + the design-spec empty
  sentence.
- **Step 1's relationship answer has no schema slot** (no column exists;
  none may be added). *Amended at round 10 (ADR-0015 F1):* asked as
  specified and now genuinely HELD — step 1 forwards it with the slice
  and step 2 carries it to the moment the circle is created — but not
  persisted; the durable column is queued below and lands as one line in
  step 2 when it exists.
- **Subject timezone** is not a PRD §4.1.3 question; it is filled from
  the browser (`Intl`) with an ET fallback — a slice-4 enrichment
  candidate (zip→tz) noted, not built.
- **Circle name** is derived from the subjects ("Nell & Marcus") — the
  founder path asks no circle-name question anywhere in the PRD.

## Queued DDL findings — owner bound-amendment questions for round 10

None of these were written; each would spend migrations past the met
bound and so needs the owner first (slice-2-plan Status):

1. **AC-AUTH-10's access-log half**: `hc.log_event_types` has no
   sign-out code and `hc.log` is hc_internal-only — the "sign out
   everywhere" access_log entry is structurally unwritable. Needs an
   event-type seed + a definer.
2. **Definer replacements for the maintenance ops** (D2's table):
   `create_account`, `describe_invite`, `set_slice`,
   `set_opening_context` are clean candidates; `unconfirmEmail` and
   `revokeAuthSessions` write `auth.*` and would stay postgres-owned
   like the mirrors.
3. Nothing else. The F1 boundary, step-up, wasnt-me, invites, grants and
   removal all ride 2A machinery as shipped.

## Consequences

- 46 migrations, unchanged; db:verify clean; both DB suites untouched
  and green.
- The app test surface at the round-10 dispositions head: **149 vitest
  assertions across 21 files** (CI step added; the draft's "119" predated
  the `9899fe0` forward fix — 121 — and the round-10 red→green added 28
  more across 3 new files: worker, maintenance-postconditions,
  vercel-cron pin), plus the 11-step Playwright walkthrough (§11.4
  item 3) green locally under the `docs/ops/e2e-local-gate.md` protocol —
  deliberately not a CI gate in 2B (ratified, Q13/ADR-0015 F11).
- Coverage gains the 2B rows (docs/coverage.md §2B); RLS-10 stays
  pending (no artifact route).
- Round 10 re-sees: ADR-0013's dispositions and both carried contracts,
  the two argued declines, D3's two deviations, D2's boundary table, and
  the queued findings above.
