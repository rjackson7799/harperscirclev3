# Third-party review packet — round 10: slice 2 whole, at the 2B gate

**Requesting review of:** slice `2 — Auth + onboarding` WHOLE, at its 2B
gate: the merged 2A database increment (46 migrations, round-9 reviewed,
forward-fixed via M8, ADR-0011/0012/0013 Accepted-merged) **re-seen with
2B in place**, plus increment `2B — app (A1–A9)`, built on branch
`slice/2b-app-onboarding` (base `main` @ `6f57d89`, the 2A merge + docs)
with **ZERO migrations** — the spent ≤ 8 reserve held. 2B lands 18 vitest
files (121 assertions; the new CI "Application tests" step), the §11.4
item-3 Playwright walkthrough (11 steps, local gate by design), ADR-0014
(Proposed — this round ratifies or amends it), coverage §2B rows
APP-01..APP-10 + E2E-01 (APP-09b pending on an owner bound amendment;
RLS-10 stays pending), and both ADR-0013 carried contracts wired.

**Authority order:** master plan → TSD §5.5–§5.12, §1.2/§1.3/§1.7, §11.4
as amended by annexes A1–A7 → ADR-0001–0014 → Appendix A +
`docs/coverage.md` (authoritative per assertion; pending never green).

**Review style requested:** as rounds 6–9 — decision-completeness over
mechanism rework. Every open call is in ADR-0014 with its mechanism and
precedent; every deviation and every queued DDL gap is surfaced below,
un-buried, with a pointed question and a recommended answer.

**Process fixes carried forward (dispositioned, kept):** the head ledger
appears from the start (E2); verification evidence is recorded at ONE
final SHA with complete summary lines (E1/E3 — CI retains full test
output as artifacts); pointed questions carry recommended answers.

---

## What round 10 reviews

Round 9 reviewed 2A alone and returned three blocking findings; the
owner merged on dispositions (ADR-0013, the 1C round-7 precedent) with
the explicit promise that **round 10 re-sees the whole slice with 2B in
place** — the alternative (a reviewer confirmation pass before merge)
was offered and declined. This packet therefore surfaces, explicitly:

1. the round-9 dispositions (F1/F2/F3), each now load-bearing under a
   real app boundary — §"The round-9 dispositions, re-seen";
2. the two **argued declines** ADR-0013 carried for this round —
   `create_invite` outside the locked set, `revoke_sender`/
   `revoke_invite` lockless — §"The two argued declines";
3. both carried **contracts, now wired** — the F1 password-path boundary
   and the wasnt-me worker — §"Both contracts, now wired", with file and
   test pointers;
4. **ADR-0014 whole** — the request-role channel, the enumerated
   maintenance boundary, the probed GoTrue facts and the verification
   model with its TWO recorded deviations, the revocation mechanics, the
   E2E-as-local-gate decision, and the QUEUED DDL findings as owner
   bound-amendment questions.

The 2A machinery itself is unchanged since the round-9 forward fix: the
DB suites at this head are byte-for-byte the merged 46 migrations,
re-proven (evidence block below), not rebuilt.

## What 2B is (unit by unit, in build order)

- **A1 — the §5.5 config pin** (`supabase/config.toml` +
  `docs/ops/auth-config-parity.md`): email+password only; min length 10,
  NO composition rules; 720 h session timebox; recovery OTP 1800 s; TOTP
  on, passkeys off; anon/SMS/social/web3 off; GoTrue rate limits pinned
  ON (the F1 backstop). `tests/config/auth-config.test.ts` pins the toml
  exactly and asserts the parity doc names every hosted-only control
  (HIBP, per-type expiries, the Vercel WAF per-network rows). APP-01.
- **A2 — lib/db, the four factories real** (§1.7): `asUser` via
  `@supabase/ssr`; `asAdmin`/`asPipeline` as direct connections that ARE
  their NOLOGIN roles (positive + 42501 negatives, catalog-probed per
  the segfault trap); `asServiceRole` unchanged; the **request-role
  server channel** (`lib/db/request-role.ts`, D1 below); ESLint fences
  driven through the ESLint API so a stray import reds CI
  (`tests/lint/db-fence.test.ts`); the proxy session refresh pinned.
  APP-02.
- **A6 — `lib/permissions/tiers.ts`**, built early because both doors
  consume it: THE one module rendering ceiling copy AND default grants;
  the snapshot test proves its grant table equals `hc.tier_defaults()`
  row for row LIVE (family incl. the no-finances-row absence; care
  schedule-only) and both screens render from it — copy and grants
  cannot drift (AC-AUTH-8). APP-08.
- **A3 — the (auth) surface**: sign-in · create-account · reset
  request/confirm · the wasnt-me confirmation page (GET renders,
  destruction only on explicit POST). The F1 boundary wired end to end
  (below); byte-identical non-enumeration responses (APP-04); §4.1.7
  throttle copy (level, wait, reset link).
- **A4 — the founder door**: `Step N of 4` on exactly the four step
  screens (AC-AUTH-2); step 2 writes THROUGH `hc.create_circle` with
  ADR-0011 local parts minted app-side; abandonment/resume from durable
  state (AC-AUTH-9); completion copy carries the forwarding addresses
  with the inactive+resend state when unverified, promises pinned to
  Phase 1 only (AC-AUTH-5). APP-06.
- **A5 — the invitee door**: the module ceiling BEFORE anything is
  asked; the create-account variant with the invited address derived
  from the TOKEN server-side (pre-filled, not editable, enforced);
  AC-AUTH-11 — a different identity gets no accept control, forced
  re-auth as the invited address; dead tokens name the inviter and
  create nothing; landings by tier (family → Timeline, care → tasks);
  the once-returned invite token rides a 120 s HttpOnly cookie to a
  shown-once view. APP-07.
- **A7/A8 — Account + revocation wiring**: global sign-out
  (`scope:'global'`; APP-09a) · verify-email state + resend · step-up
  re-auth (the third F1 path) · `remove_member` → immediate DB session
  revocation with the returned account id (APP-10).
- **A9 — the §11.4-3 E2E walkthrough** (`e2e/onboarding.spec.ts`,
  11 steps): founder cold start → two subjects with divergent situations
  and zips → the custodianship declarations as the circle log's seq-1
  rows (DB-asserted) → abandon-and-resume at step 3 → completion (two
  ADR-0011 addresses, unverified inactive state, no invite affordance,
  AC-AUTH-5 absences) → a real mail-click verification flipping the
  mirror and revealing the invite affordance → an invite at summary-only
  with the ceiling under the selector → the invitee path to the Timeline
  in two taps → AC-AUTH-11 → **AC-PERM-3 from Dan's LIVE second browser
  context** (sessions emptied at the store; the still-unexpired JWT
  reads NOTHING — RLS is the enforcement) → **AC-AUTH-10 from a second
  browser** (dies within seconds via the getUser page gates). E2E-01.
  This unit also added the session-liveness page gates and the CI
  "Application tests" step.

## Zero migrations — the spent reserve held

ADR-0013 left the migration count at 8 of ≤ 8. 2B writes **no DDL**:
every DB-shaped gap was either solved inside the app layer with a
recorded mechanism (ADR-0014 D2's maintenance boundary) or **queued as
an owner bound-amendment question** for this round (ADR-0014 findings;
Q11–Q12 below). `verify-migration-state` still reads 46 exact; shipped
migrations were never edited.

## The round-9 dispositions (ADR-0013), re-seen with 2B in place

- **F1 (critical — request roles could assert success-class throttle
  outcomes).** Disposed by identity binding: `record_auth_failure`
  keeps anon+authenticated; `record_auth_success` is authenticated-only
  and takes NO identifier (the cleared key derives from `hc.uid()`).
  Round 9 calibrated this as *latent* — "reachable only by server-side
  code assuming request roles." **2B built exactly that channel**
  (D1), so the disposition is now load-bearing, and it holds: the
  sign-in boundary records failures as anon and success as the proven
  session, so the app CANNOT clear a stranger's throttle even if a
  route were compromised — the capability F1 flagged does not exist to
  misuse. Wrappers proven live in `tests/hc/throttle.test.ts`
  (escalation at the 5th failure; identity-bound clearing; a
  sessionless success recording refused).
- **F2 (high — security-state writers bound predicates before the
  R-rule lock).** Disposed in M8 across the class (`accept_sender`,
  `set_grant`, `remove_member`); 2B consumes these writers as shipped
  (remove through `lib/hc/members.ts`) and adds no new DB writer —
  nothing in 2B re-opens the class. The E2E exercises the removal path
  live (step 10).
- **F3 (high — token consumption not atomic with the security
  effect).** Disposed in M8: consuming `execute_wasnt_me` durably
  enqueues the owed kill (`security_actions`, UNIQUE(event_id)).
  Round 9 said "only the 2B worker/POST can *perform* it" — 2B now
  performs it (below), completing the contract.

## The two argued declines, carried for round 10 (ADR-0013)

1. **`hc.create_invite` stays outside the locked set.** An invite row
   is an inert claim check: it grants nothing, changes no taint,
   releases nothing. Its redemption — the only consequential moment —
   re-validates EVERYTHING under the lock (freeze FRZ-16a; its own
   liveness via the conditional UPDATE, RLS-09/case 27; the address
   binding). An invite racing a freeze into existence is
   indistinguishable from one created a millisecond earlier, and
   equally suspended. 2B adds no path that changes this analysis — the
   invite screen calls `create_invite` through the request-role channel
   as the coordinator, nothing more. → Q2.
2. **`hc.revoke_sender` / `hc.revoke_invite` stay lockless.** Both
   reduce reach, are freeze-exempt by design (revocation must never be
   blocked by containment), and carry no predicate whose mid-wait
   invalidation could GRANT anything — the failure mode A4 exists to
   close. Their conditional UPDATEs are their own serialization. → Q3.

## Both contracts, now wired (the round-9 integration points)

**The F1 password-path boundary (ADR-0013's 2B acceptance criterion).**
Sign-in, step-up re-auth and recovery are the ONLY password paths the
app exposes — the route inventory contains no other route that accepts
a password:

- **Sign-in** (`app/(auth)/sign-in/submit/route.ts`): consults
  `hc.auth_throttle` BEFORE GoTrue — a positive wait short-circuits
  with §4.1.7 copy and GoTrue is never called; a failure is recorded as
  anon (driving the §5.11 notice threshold); success is recorded AS the
  proven user, no identifier (F1's identity binding, consumed as
  designed).
- **Step-up re-auth** (`app/account/step-up/submit/route.ts`): the same
  consult-record discipline — §5.7 re-auth attempts are throttled by
  the same counters.
- **Recovery** (`app/(auth)/reset/submit/route.ts` +
  `app/(auth)/reset/confirm/submit/route.ts`): NEVER throttle-gated
  (AC-AUTH-12 — the reset path is the throttle's escape hatch);
  completion records `reset_completed` identity-bound, clearing the
  ledger through the proven session.
- Wrappers: `lib/hc/throttle.ts` (fenced; proven live). GoTrue's own
  rate limits stay ON (pinned by APP-01); per-network limiting is the
  Vercel WAF at deploy time (parity doc row 7). Tests:
  `tests/routes/sign-in.test.ts` · `tests/routes/reset.test.ts` ·
  `tests/routes/account.test.ts` · `tests/hc/throttle.test.ts`
  (APP-03/APP-04). → Q4.

**The wasnt-me worker (ADR-0013 F3's app half).** The POST
(`app/(auth)/wasnt-me/submit/route.ts`) performs the kill RIGHT AFTER
`execute_wasnt_me` commits: DB session revocation + admin password
rotation to random (forced reset; recovery stays open and unthrottled),
then `hc.complete_security_action`. A GoTrue outage leaves the durable
pending row for `/api/worker/security-actions` — the key-gated
hc_pipeline retry sweep via `pending_security_actions` /
`complete_security_action` (keyless = 503). GET renders and touches
nothing; refusals are one neutral shape. Modules:
`lib/hc/security-actions.ts` · `lib/auth/gotrue-admin.ts`. Tests:
`tests/routes/wasnt-me.test.ts` (APP-05). → Q5.

## ADR-0014 whole (Proposed — this round ratifies or amends)

**D1 — the request-role server channel** (`lib/db/request-role.ts`).
hc.\* is deliberately not API-exposed (PIN-01), so every hc call rides a
direct connection assuming a request role for exactly one transaction:
`SET LOCAL ROLE anon|authenticated` + the caller's VERIFIED JWT claims
in `request.jwt.claims`, both transaction-scoped — the pooled session
leaves every call as the connection identity with no residue (tested
both ways, success and throw). This is the channel ADR-0013 F1
anticipated, with the repo's own pgTAP/concurrency simulation as
precedent. ESLint fences it to `lib/hc/**` — typed, narrow wrappers are
the only doorway; the channel proves REAL request authority (an anon
call holds anon's catalog privileges, not the connection's). → Q6.

**D2 — the maintenance boundary** (`lib/db/maintenance.ts`), a CLOSED
enumerated list on the postgres/maintenance identity (DEF-07's
documented exemption) — each op a standing definer-candidacy question:

| Op | Why it exists | 2A precedent |
|---|---|---|
| `insertAccountRow` | accounts has zero request-path INSERT and no creation definer shipped; sign-up must create the row | the 2A suites seed accounts exactly this way |
| `unconfirmEmail` | corrects autoconfirm's stamp where 2A put verification truth (D3) | the M3/M5 mirror reads `auth.users.email_confirmed_at` live |
| `setAccountSlice` | PRD §4.1.3 step 1 / §4.1.6; `accounts.slice` exists for exactly this write; no UPDATE grant exists | §2.3 annotates the column "declared slice" |
| `updateOpeningContext` | step 3 happens AFTER step 2's `create_circle`; guarded in-statement to the founder's own circle in `state='setup'` | §2.3 annotates "step 3 multi-select" |
| `describeInviteByToken` | the accept screen shows circle/inviter/subjects/ceiling BEFORE any session exists; invites carry zero request-path reads | keyed STRICTLY on sha256 of the 32-byte token — the capability the recipient already holds; unknown ⇒ null, one shape |
| `revokeAuthSessions` | the §5.8 sessions row; this GoTrue exposes NO per-user admin logout (probed 404; none in supabase-js) | deletes `auth.sessions` + revokes refresh tokens — the same rows GoTrue's own logout destroys |

ESLint fences the module to `lib/hc/**`; no generic query surface
exists. → Q7.

**D3 — the probed GoTrue facts and the verification model.** Probed
against the live stack (GoTrue image v2.180.x, CLI 2.100.1): (1) the
password grant is gated on email confirmation UNCONDITIONALLY — even
with confirmations disabled — and the password is checked FIRST, so
`email_not_confirmed` is reachable only by the password holder; (2)
public signUp under autoconfirm mints a session AND stamps
`email_confirmed_at`; admin-created unconfirmed users can never
password-sign-in; refresh works unconfirmed; `resend type=signup`
delivers for unconfirmed users. Therefore create-account = **public
signUp (the ONE unverified-capable session mint) → immediate
`unconfirmEmail` (truth restored where the 2A mirror reads it —
AC-AUTH-4/G4 stay real) → accounts bootstrap (after the un-confirm, so
the insert mirror reads NULL) → resend**. The founder keeps a 30-day
session on the signup device; setup never touches mail (§4.1.2).

**The two recorded deviations, un-buried:**

- **§5.5 byte-identity carve-out (create-account):** fresh and
  already-exists answer the same status/Location/body, but the fresh
  branch necessarily carries its session's **Set-Cookie**. The
  alternative (no session either branch) makes verification
  hard-for-use — a §4.1.2 violation, because an unverified account
  cannot password-sign-in on this GoTrue. Built as the §4.1.2 letter
  over §5.5's last channel. → Q8.
- **Unverified + new device:** password sign-in surfaces "confirm your
  email first" with a resend. Password-gated (fact 1), so not an
  oracle; still a narrow "hard" edge §4.1.2 does not name. → Q9.

**D4 — revocation mechanics.** wasnt-me kill and remove_member as wired
above (removal revokes sessions, no rotation — removal ends access, not
the account). **Page-shell liveness:** local JWT validation cannot see a
dead session, so signed-in PAGES gate through `getUser()`
(server-validated) — that is what makes AC-AUTH-10's "within seconds,
from a second browser" true; a still-unexpired JWT held by a removed
member reads NOTHING regardless — RLS is the enforcement, proven live
in walkthrough step 10. → Q10.

**D5 — asGoTrueAdmin** lives inside `lib/db/service-role.ts` (the ONE
module the containment grep permits) as a deliberately narrower export;
`lib/auth/gotrue-admin.ts` is its single consumer and joined the ESLint
allowlist; `asServiceRole()` itself is unchanged.

**D6 — narrowings, stated:** ADR-0011 local parts minted app-side at
step 2 as values (provisioning/uniqueness hardening slice 4) · step-4
upload renders disabled in plain words (pipeline production-disabled
until RLY-01) · invite delivery is the copy-link path (the invite email
is slice 11) · landings are the record surfaces' honest floors (real
RLS reads + the design-spec empty sentence) · **step 1's relationship
answer has no schema slot — asked as specified, held, not persisted;
queued** (→ Q12) · subject timezone from `Intl` with an ET fallback ·
circle name derived from the subjects (the PRD asks no circle-name
question).

**The E2E-as-local-gate decision:** the walkthrough runs against the
full live stack (`supabase start` + `next dev` + Mailpit) and is green
at build verification, deliberately NOT a CI gate in 2B; CI carries the
18-file vitest step. → Q13.

**Queued DDL findings — owner bound-amendment questions (none
written; the spent reserve held):**

1. **AC-AUTH-10's access-log half (APP-09b, pending):**
   `hc.log_event_types` has no sign-out code and `hc.log` is
   hc_internal-only — the "signed out everywhere" access_log entry is
   structurally unwritable from 2B. Needs an event-type seed + a
   definer. → Q11.
2. **Definer replacements for the D2 maintenance ops:**
   `create_account`, `describe_invite`, `set_slice`,
   `set_opening_context` are clean candidates; `unconfirmEmail` and
   `revokeAuthSessions` write `auth.*` and would stay postgres-owned
   like the mirrors. → Q7/Q11.
3. Nothing else — the F1 boundary, step-up, wasnt-me, invites, grants
   and removal all ride 2A machinery as shipped.

## Red→green history (each red commit names its failure signatures)

`8e7d2d6` docs: plan status (2A merged, 2B building) →
`14f45ba`/`1256d31` A1 red/green →
`94c4211`/`d20ef43` A2 red/green →
`83ac8d8`/`8f42eb9` A6 red/green →
`ffe7ee4`+`9178f66`/`7b76f35` A3 reds (route contracts; then the probed
GoTrue facts settling the create/wasnt-me contracts)/green →
`6932b20`/`807a1a6` A4 red/green →
`6df2eae`+`d525827`/`b571e9d` A5 reds/green →
`371f530`/`8dd3dc6` A7/A8 red/green →
`f2365d6` A9 green (walkthrough 11/11; liveness gates; CI step) →
`fbbd413` chore (gitleaks demo-JWT allowlist, scan config only) →
`2e4248b` docs (status, evidence) →
`9899fe0` **forward fix** (below) → `d86a95c` docs (run-id record).

## Defects found and handled red→green inside the increment

1. **Recovery-redirect poisoning (HIGH, commit review; forward-fixed at
   `9899fe0`).** `resetPasswordForEmail`'s `redirectTo` derived from
   `req.url`, so a forged Host could steer where the emailed recovery
   token lands. Now: configured `NEXT_PUBLIC_SITE_URL` first; local
   loopback origins may fall back to themselves; anywhere else
   unconfigured OMITS redirectTo so GoTrue's site_url allowlist decides
   — a neutered link, never a poisoned one. GoTrue's redirect allowlist
   already bounded exploitability; the derivation itself is now closed.
   Red→green: two new cases in `tests/routes/reset.test.ts` (config
   wins over the request; a forged non-local origin never reaches the
   mail link). Same class as the invite-created fix caught earlier in
   the A5 build (relative redirects — the localhost/127.0.0.1 cookie
   trap).
2. **Gitleaks vs the local demo stack:** the A9 harness pins the
   Supabase CLI's public demo JWTs (playwright webServer env,
   `.env.example`) and the jwt rule rightly flags any JWT. The
   allowlist (`fbbd413`) admits ONLY tokens whose payload opens with
   `iss=supabase-demo` — the constants every local install shares; no
   production key carries that issuer. Verified with the pinned CI
   image: 150 commits, no leaks found.

## Finding candidates recorded by this packet (docs drift; not fixed here — docs-only discipline)

1. **The parity doc's "verification model (row 6)" section and the
   `tests/config/auth-config.test.ts` header comment still describe the
   SUPERSEDED creation model** ("never uses public signUp … admin API
   with `email_confirm: false`") — the approach abandoned when probing
   showed admin-created unconfirmed users can never password-sign-in
   (D3 fact 2). The settled model (public signUp → immediate
   unconfirm) is what ADR-0014 D3, the route
   (`app/(auth)/create-account/submit/route.ts`) and its tests
   implement and prove; the drift is narrative-only, but the parity doc
   is a deploy-time checklist and must not mislead. Fix: rewrite the
   row-6 section and the test comment to the D3 model — dispositions
   ADR material, no behaviour change.
2. **ADR-0014's Consequences block says "119 vitest assertions"** —
   drafted before the `9899fe0` forward fix added two reset cases. The
   head's number is **121/121 across 18 files** (this packet and the
   plan Status record it). One-line ADR amendment at dispositions.

## Verification evidence (ONE final SHA — recorded, not re-run here)

All evidence at **`9899fe0`** (the forward-fix head; `d86a95c` and this
packet's commit are docs-only on top — the app/SQL tree is unchanged by
them):

```
Application tests (vitest)     → 18 files, 121/121   (CI "Application tests" step)
§11.4-3 Playwright walkthrough → 11/11               (local gate by design — ADR-0014)
npm run db:reset               → 46 applied == supabase/migrations, exact
npm run test:db                → Files=43, Tests=1134 — Result: PASS
npm run test:concurrency       → 55/55 across 32 cases (output teed)
npm run db:verify              → clean (hard gate, --fail-on warning)
lint · typecheck · next build  → clean
gitleaks                       → no leaks (demo-JWT allowlist scoped to iss=supabase-demo)
```

CI: push run **32166530483** @ `9899fe0` — conclusion **success**
(secret scan, containment, schema pin, clean reset, exact-state
verifier, pgTAP, concurrency, db:verify hard gate, the upgrade
rehearsal, application tests, lint, typecheck; full output retained as
artifacts). Prior head `2e4248b`: run **32165794287**, success.

## Pointed questions for round 10 (recommended answers inline)

1. **The round-9 dispositions under a real boundary.** F1's identity
   binding is now consumed by the live channel it anticipated; F2's
   locked writers are consumed unchanged; F3's owed-kill is performed.
   Do the ADR-0013 dispositions hold with 2B in place? *Recommended:
   yes — each disposition's mechanism is now exercised by the app layer
   exactly as argued, and the app tests prove the boundary uses them
   with the designed authority (anon for failures, the proven session
   for success, hc_pipeline for the sweep).*
2. **Declined extension: `create_invite` outside the locked set.**
   Accept the standing decline? *Recommended: yes — the invite row is
   an inert claim check; redemption re-validates everything under the
   lock, and 2B added no path that changes the analysis.*
3. **Declined extension: `revoke_sender`/`revoke_invite` lockless.**
   Accept? *Recommended: yes — both only reduce reach, are deliberately
   freeze-exempt, and their conditional UPDATEs are their own
   serialization; no mid-wait invalidation can GRANT anything.*
4. **The F1 boundary's completeness.** Sign-in, step-up re-auth and
   recovery as the ONLY password paths, each consulting and recording;
   recovery never throttle-gated; GoTrue limits on; WAF deploy-time.
   Is the contract discharged? *Recommended: yes — the route inventory
   is closed (no other route accepts a password), APP-03/APP-04 pin the
   order and the byte-identity, and the deploy-time WAF rows are
   checklist items in the parity doc, recorded not hidden.*
5. **The wasnt-me contract's shape.** POST-kill immediately after
   commit, completion recorded, the key-gated hc_pipeline sweep for
   stragglers. Is F3's app half discharged? *Recommended: yes — the DB
   guarantees the kill is owed; the POST performs it; the sweep makes a
   GoTrue outage a delay, never a loss; APP-05 pins GET-touches-nothing
   and the neutral refusal shape.*
6. **D1 — the request-role channel as the §1.7 delta.** Accept
   transaction-boxed `SET LOCAL ROLE` + verified claims, fenced to
   `lib/hc/**`, as the standing pattern for server-side hc access?
   *Recommended: yes — it preserves PIN-01 (hc stays off the API
   surface), carries real request authority (proven against the
   catalog), and leaves no residue on the pooled session either way.*
7. **D2 — the maintenance boundary.** Six enumerated ops on the
   postgres identity, fenced, no generic query surface. Accept as
   built, with the four clean definer candidacies queued rather than
   spent now? *Recommended: yes — each op has a 2A precedent and an
   in-statement guard; converting the four clean candidates is a
   batched bound-amendment question (Q11), not a 2B blocker, and two
   ops write `auth.*` and must stay postgres-owned regardless.*
8. **D3 deviation 1 — the fresh-branch Set-Cookie vs §5.5's last
   channel.** Built as the §4.1.2 letter (setup never blocks on mail)
   over §5.5's byte-identity on the cookie channel. Accept?
   *Recommended: yes — on this GoTrue the sessionless alternative makes
   verification hard-for-use, which §4.1.2 forbids in words; the
   status/Location/body identity is kept and the mail is requested in
   both branches, so the cookie is the ONLY divergent channel.*
9. **D3 deviation 2 — the unverified-new-device edge.** "Confirm your
   email first" + resend, reachable only by the password holder.
   Accept? *Recommended: yes — the alternative (a silent failure shape)
   would be a lie the account holder cannot act on; fact 1 makes it
   non-enumerating, and the edge dissolves the moment the founder
   clicks the link.*
10. **D4 — the revocation mechanics.** DB session kill (auth.sessions +
    refresh tokens — no per-user admin logout exists, probed) and
    getUser page gates as AC-AUTH-10's liveness mechanism. Accept?
    *Recommended: yes — the kill destroys the same rows GoTrue's own
    logout destroys; the walkthrough proves both halves live (steps
    10–11), and RLS remains the enforcement for any still-unexpired
    JWT.*
11. **The queued DDL findings — amend the bound now or at the next DB
    slice?** APP-09b (sign-out event type + definer) and the four
    definer replacements need an owner-approved amendment past the met
    ≤ 8. *Recommended: defer to ONE batched amendment at the next slice
    that opens the DB (batch: the sign-out event type + definer, the
    four clean definer replacements, the step-1 relationship slot) —
    none is load-bearing for 2B's acceptance criteria, and APP-09b's
    pending row keeps the gap visible until then.*
12. **The step-1 relationship slot.** Asked as specified, held, not
    persisted — no column exists and none may be added under the spent
    bound. Accept for 2B with the column queued in Q11's batch?
    *Recommended: yes — persisting it is a data-model question the
    owner should rule on once (which table, whose attribute), not a
    2B improvisation.*
13. **The E2E-as-local-gate decision.** The walkthrough needs the full
    live stack and is green at build verification; CI carries the
    vitest step. Accept for 2B, revisit when the app surface grows?
    *Recommended: yes — a CI walkthrough adds a flaky compound gate for
    no review-time evidence gain at this size; the recorded 11/11 with
    the local-gate label is the honest shape, and the decision is
    explicitly re-visitable.*
14. **The two docs-drift finding candidates.** Dispose both (parity-doc
    row-6 rewrite + test-comment fix; the ADR-0014 count) in the
    round-10 dispositions ADR? *Recommended: yes — both are
    narrative-only; neither touches behaviour or evidence.*

## Files

- App: `app/(auth)/**` (sign-in, create-account, reset ×2, wasnt-me,
  accept, confirm, verify-email) · `app/setup/**` (steps 1–4,
  completion) · `app/account/**` (account, step-up, sign-out-everywhere)
  · `app/(app)/[circle]/**` (invite, members/remove, timeline, tasks) ·
  `app/api/worker/security-actions/route.ts`
- Lib: `lib/db/` (index, user, admin, pipeline, service-role,
  request-role, maintenance, role-pool) · `lib/hc/` (throttle, accounts,
  circle, invites, members, security-actions, step-up) · `lib/auth/`
  (gotrue-admin, claims, session, redirect, http) ·
  `lib/permissions/tiers.ts` · `lib/setup/completion-copy.ts`
- Tests (18 vitest files): `tests/config/` · `tests/db/` · `tests/lint/`
  · `tests/app/` · `tests/permissions/` · `tests/hc/` · `tests/routes/`
  · `tests/setup/`
- E2E: `e2e/onboarding.spec.ts` (11 steps) + `playwright.config.ts`
- Config: `supabase/config.toml` (§5.5 pinned) · `.gitleaks.toml`
  (demo-JWT allowlist) · CI "Application tests" step in
  `.github/workflows/ci.yml`
- Docs: `docs/adr/0014-2b-app-increment-deltas.md` (Proposed — this
  round) · `docs/ops/auth-config-parity.md` · `docs/coverage.md` §2B ·
  `docs/review/slice-2-plan.md`
- Unchanged: `supabase/migrations/**` (46, byte-for-byte the merged 2A
  tree) · `supabase/tests/**` · `scripts/**`

## Addendum — auditability block (head ledger from the start)

| Purpose | SHA | Tree relationship | CI status |
|---|---|---|---|
| Base | `6f57d89` | `main` (2A merge `fbd1d7f` + docs; ADR-0011/0012/0013 Accepted-merged) | green on main (runs 32114061495 / 32114796686) |
| Green build head (A1–A9) | `f2365d6` | 21 red→green commits from base, zero migrations | covered by the later-head runs (app/SQL lineage unchanged) |
| Housekeeping | `fbbd413` | gitleaks demo-JWT allowlist (scan config only) | idem |
| Docs head | `2e4248b` | status + evidence, docs-only | push run **32165794287**, success |
| Forward-fix head | `9899fe0` | the reset-poisoning refusal (one route + two tests) | push run **32166530483**, success |
| Run-id record | `d86a95c` | docs-only on the verified head | covered (no app/SQL change) |
| Round-10 packet head | *(this commit)* | this file + the plan Status flip + .gitignore housekeeping, docs-only | its own push run confirmed via the public API in the packet session, recorded vault-side (the round-7/8 regress-termination pattern) |

- **Local evidence:** at `9899fe0`'s tree, quoted above (one SHA,
  complete summary lines; DB numbers identical to the merged 2A
  evidence — the tree is unchanged).
- **PR:** to be opened by the owner, base `main` @ `6f57d89`,
  **DO NOT MERGE** banner in the description — third-party round 10 →
  dispositions ADR → owner sign-off → merge commit (never squash), each
  in its own fresh session.
- **Pins:** Supabase CLI 2.100.1; image
  `public.ecr.aws/supabase/postgres:17.6.1.106`; GoTrue image v2.180.x
  (the probed facts are pinned against it); Node 22.15.0 / npm 10.9.2;
  pg 8.16.3 — no drift this increment.
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs` · `npm run test:db` ·
  `npm run test:concurrency` (teed) · `npm run db:verify` ·
  `npm run test:app` (the CI step) · `npx playwright test` (local gate,
  full stack up) · upgrade leg per `ci.yml`.
- **CI at the final verified head:** push run **32166530483** @
  `9899fe0` — success, application tests included. A "Start local
  Postgres" `toomanyrequests` failure on any run is the recorded ECR
  Public anonymous pull quota — re-run material, never a repo defect.
