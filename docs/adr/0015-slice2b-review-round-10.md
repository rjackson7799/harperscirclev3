# ADR-0015 — Third-party review round 10: slice 2 whole at the 2B gate, findings, dispositions

**Status:** Accepted — eight owner rulings recorded in the dispositions
session (2026-08-18); merge sign-off remains its own session (ADR-0006)
**Deciders:** owner (sole merge authority)
**Date:** 2026-08-18
**Packet reviewed:** `docs/review/round-10-findings.md` — the adversarial
third-party review of the round-10 packet (`docs/review/round-10-packet.md`,
head `d7d9331`, evidence head `9899fe0`) covering slice 2 WHOLE at its 2B
gate, against the master plan, TSD as amended, ADR-0001–0014 and coverage.

**Reviewer verdict:** **not approved as written** — 15 findings (4
blocking, 5 high, 6 evidence/review-quality) plus a decision list the
packet "should force more clearly". No finding disputes a 2A mechanism or
reproduces a data breach; the blocking findings are one factual
overstatement (F1 "held"), one scope-completeness gap (F2), one
operational gap (F3) and one architectural-privilege ruling demanded
(F4). **All 15 are accepted in whole or in part below — none is declined
outright** — and the two docs-drift candidates the packet itself recorded
are disposed with them. Applied the ADR-0006/ADR-0013 way, zero DDL (the
spent ≤ 8 reserve holds; nothing here re-opens the 2A tree):

| Commit | What |
|---|---|
| `5faccc4` | findings verbatim (docs-only, before anything argued) |
| `07c26b8` | **RED** — 19 failing tests + 1 failing suite across 5 files; every failure signature in the message |
| `197d3e9` | **GREEN** — findings 1, 3, 6, 7, 8, 9, 15 closed in the app/config layer; 149/149 |
| `f93e451` | the finding-14 probe artifact (`scripts/probe-gotrue.mjs`), first live run 6/6 |
| `15e5aaf` | lint-warning cleanup (test mock typing) |
| `4874d4b` | docs-drift disposition (F13 + both packet candidates); **the evidence head** |

## The eight owner rulings (recorded verbatim from the dispositions session)

| # | Question | Ruling |
|---|---|---|
| R1 | A7/APP-09b: amend scope or amend the bound? | **Amend A7's 2B scope**: the access-log entry is explicitly excluded from this gate and joins the mandatory batch (below). APP-09b stays pending — the gap stays visible |
| R2 | Step-1 relationship: survive step 1→2? persist? | **Carry now, persist later**: the app-layer carry lands this session (PRD "held" becomes the letter); the durable column joins the batch, where the owner names its table |
| R3 | May the production runtime hold the maintenance credential? | **Accepted for 2B** with the threat model recorded (`docs/ops/runtime-db-credentials.md`); the four definer conversions + a dedicated lower-privilege runtime role join the batch |
| R4 | The F3 invoker | **Check in the cron**: vercel.json + the route's CRON_SECRET path + the ops runbook, this session; F3 re-described (below) |
| R5 | Q8/Q9 — the two D3 deviations | **Accepted with the full framing**: the fresh-branch cookie IS an account-existence oracle observable as post-redirect authentication state; accepted as a rate-limited channel chosen over blocking setup on mail. Q9's password-gated edge accepted |
| R6 | Q13 — the E2E gate | **Local gate, formalized**: protocol doc + retained artifacts (`docs/ops/e2e-local-gate.md`); CI automation declined at this app size, re-visitable |
| R7 | Packet Q1–Q7, Q10, Q14 | **Ratified as recommended** (Q7 subject to R3; Q14 executed at `4874d4b`) |
| R8 | Where the queued items land | **The next slice that opens the DB, as a HARD entry criterion**: its migration 1 is the batched amendment, before that slice's own work. Owner: the project owner |

## Findings and dispositions

| # | Severity | Finding (compressed; verbatim text is the findings file) | Disposition |
|---|---|---|---|
| F1 | blocking | The step-1 relationship answer is discarded, not "held" — the handler forwards only slice; the packet's "held" was factually incorrect | **Accepted.** The packet's word was wrong and is superseded by this ADR. Fix (R2): step 1 validates and forwards BOTH answers; step 2 carries the relationship to the moment `create_circle` runs — "held until step 2 creates the circle" is now literally true. Durable persistence needs a column the PRD's own step-2 Writes row never named; it is queued in the batch (R8), and the write lands as one line when it exists. Red→green in `tests/setup/founder-door.test.ts` |
| F2 | blocking | A7 is incomplete against the slice plan (global sign-out + access_log entry); "pending but accept" is not decision-complete without a scope ruling | **Accepted as a process finding.** The reviewer is right that a migration-budget constraint does not amend acceptance scope by itself — only the owner does. R1 now does, explicitly: A7's 2B scope excludes the access-log entry; the entry is a mandatory batch item (R8); APP-09b stays pending. The route comment and slice plan record the amendment |
| F3 | blocking | The wasnt-me retry contract has no demonstrated production invoker — "delay, never a loss" unproven; a pending action can stay pending forever | **Accepted.** The scheduler is now IN the tree (R4): `vercel.json` cron `*/10` (pinned by `tests/config/vercel-cron.test.ts`), the route's GET path authenticating Vercel's `Bearer ${CRON_SECRET}` shape, and the full ops contract — cadence, secret provisioning, 30-minute maximum tolerated pending age, monitoring on `oldest_pending_age_s`, deploy checklist — in `docs/ops/security-actions-worker.md`. Claim re-worded as the reviewer directed: durable at consume, performed at POST, re-performed within 10 minutes once `CRON_SECRET` is provisioned at deploy; "durably recoverable" until that provisioning moment |
| F4 | blocking | The maintenance boundary is an architectural privilege expansion: the runtime holds a credential capable of maintenance SQL and SET ROLE; fences constrain source, not runtime authority | **Accepted as a required ruling; the ruling is R3.** Every factual claim is conceded — the threat model (`docs/ops/runtime-db-credentials.md`) states the exact identities local and hosted, the deploy-time verification of the hosted role's flags/grants, credential isolation as it exists (distinct admin/pipeline/service credentials; CLI-run migrations), rotation and leak response, the honest blast radius of a runtime compromise, and why the four clean definer candidates wait (DDL past the spent bound re-opening 2A pins mid-dispositions). The definers + a dedicated lower-privilege runtime role are batch items (R8). "Definers before acceptance" **declined by owner ruling**, with the argument recorded there |
| F5 | high | The create-account deviation is broader than "only Set-Cookie differs" — post-redirect authentication state differs; the test filters set-cookie before comparing | **Accepted — the framing was understated, and this ADR adopts the reviewer's.** The cookie is an account-existence oracle whose observable is downstream navigation (fresh → authenticated setup; existing → sign-in bounce). Threat model (R5): the oracle costs one signup attempt per probe, boxed by GoTrue's signup rate limits (pinned ON, APP-01) and the WAF per-network rows; the alternative (no session either branch) blocks every fresh founder on mail — the §4.1.2 violation. Accepted as the letter-of-§4.1.2 over §5.5's last channel, now with the distinction stated wherever the claim appears. The set-cookie filter in the test is the correct mechanics for pinning the *other* channels byte-identical; the packet's prose was the defect, not the test |
| F6 | high | Create-account has an unhandled partial-commit problem across GoTrue and direct SQL; resend errors swallowed | **Accepted.** The flow now compensates: a failure in un-confirm or bootstrap deletes the just-created user (sessions die with it — probe F5's deletion semantics) and answers a neutral retry; an abort failure fails LOUDLY. The state matrix: (a) un-confirm fails → abort → clean retry; (b) bootstrap fails → abort → clean retry; (c) abort also fails → 500, logged, residual = a falsely-confirmed or account-row-less user whose repeat signUp answers `user_already_exists` — operational, surfaced, and the only state needing hands; (d) resend fails → logged (never shaped into the response — the call pattern still never branches), the founder's resend control covers it. Failure-injection tests for each boundary in `tests/routes/create-account.test.ts`. "Setup refuses a session lacking its account row" is answered structurally: the compensation makes that state unmintable by this flow, and `hc.create_circle` refuses such a session at the first write regardless |
| F7 | high | Maintenance writes silently accept zero-row outcomes; step 3 redirects to step 4 on a forged circle id | **Accepted.** `setAccountSlice`/`updateOpeningContext`/`unconfirmEmail` now report row counts; `setDeclaredSlice` and the hc `unconfirmEmail` refuse a zero loudly (invariant violations); `setOpeningContext` returns the outcome and step 3 REFUSES the advance (forged, stale, foreign and missing ids all land back on step 3 with the notice). Live postcondition tests against ghost targets in `tests/db/maintenance.test.ts`; route refusals in `founder-door.test.ts` |
| F8 | high | Session revocation is two independent pool queries — partial states possible; GoTrue table invariants unverified; no live token test | **Accepted.** `revokeAuthSessions` is one transaction (tokens revoked first, then sessions deleted). The invariant verification the reviewer asked for, done and pinned: this GoTrue's `refresh_tokens_session_id_fkey` is ON DELETE CASCADE (session-bound tokens die with their session; the UPDATE covers session-less tokens). The live proof that a revoked/cascaded token cannot mint: probe F5 — `refresh_token_not_found` after the exact revocation statements, run against the pinned image |
| F9 | high | Worker concurrency/backlog unspecified — no claim, limit, ordering, timeout; repeated rotation | **Accepted in the app half; the DB half queued.** The sweep now drains oldest-first, capped at 20/run (backlog defers — never blows the window; 120/hour drain floor), per-action isolation kept, and reports `drained/of/deferred/oldest_pending_age_s`. Concurrent-sweep safety is argued, not waved: revocation idempotent, double rotation = two random passwords with the same forced-reset outcome, completion retry-safe by 2A construction. A claim/lease primitive needs DDL → batch item (R8). Retry/backoff = the 10-minute cadence; terminal failures = the age alert (no silent drop state exists). Contract: `docs/ops/security-actions-worker.md` |
| F10 | evidence | Mocked boundary tests described as integration proof | **Accepted.** Coverage §2B now opens with the four-way taxonomy (mocked route contracts · live-DB integration · live-GoTrue probe · browser E2E) and each row names its class; no mocked call-order assertion is described as live-authority proof anywhere the claim appears. The live tiers grew this round: `tests/db/maintenance.test.ts` (live DB) and the probe (live GoTrue) |
| F11 | evidence | The local E2E gate is too informal — no protocol, no retained artifacts, no flake policy, not verified at the packet head | **Accepted in part (R6).** The gate stays local (CI automation declined at this size — a compound flaky gate for no review-time evidence gain; re-visitable as the surface grows) but is now formal: `docs/ops/e2e-local-gate.md` (hermetic startup, seed/reset prereqs, Mailpit/env, the `--trace on` gate run, retained artifacts, the classify-then-rerun-once flake policy, the two-strikes red rule) and `playwright.config.ts` retains trace+screenshot on failure for every run. "Not verified at the packet head" is closed for this round by re-running 11/11 at the evidence head `4874d4b` |
| F12 | evidence | The evidence head is not the review head; binding is prose, not mechanical | **Accepted.** The binding is now mechanical and demonstrated in this round's addendum: per-directory tree hashes (`git rev-parse <sha>:<dir>`) for `app lib tests supabase e2e scripts` at the evidence head and the final head — equal hashes transfer evidence, an unequal hash forces a re-run (this session re-ran the app suite and walkthrough when `tests/`/`app/` moved, and re-ran nothing on pure-`docs/` commits, exactly per the rule). Recorded as the standing packet rule |
| F13 | evidence | ADR-0014 says 119 assertions, the packet 121 — the reviewer must not adjudicate evidence counts | **Accepted.** Reconciled at `4874d4b`: ADR-0014's Consequences now records the lineage (draft 119 → 121 at the forward fix → **149/21 at this head**) and every count in the dispositions docs is the final inventory |
| F14 | evidence | The probed GoTrue facts need a durable, executable probe artifact | **Accepted.** `scripts/probe-gotrue.mjs` (committed `f93e451`): six facts asserted live against the pinned image with PASS/FAIL and observed values — confirmation gates the password grant unconditionally; password checked first; refresh works unconfirmed; no per-user admin logout (404); the DB kill leaves old refresh tokens unable to mint (+ the cascade rule); resend accepted for unconfirmed. First runs: 6/6, twice (pre- and post-reset). The parity doc's re-run-on-upgrade rule: a FAIL re-opens ADR-0014 D3, never gets patched around |
| F15 | evidence | The worker key contract is underspecified (entropy, rotation, timing-safety, replay, redaction, ownership) | **Accepted.** Both secrets now compare timing-safe and length-blind (sha256 → `timingSafeEqual`); the operational control table — entropy ≥ 32 random bytes, distinct secrets per path, rotation, leak response with the bounded blast radius argued (the key can only perform already-owed kills), replay stance, logging redaction, source restriction — is `docs/ops/security-actions-worker.md` |
| D1 | drift | Parity doc row 6 + auth-config test header describe the superseded admin-API creation model | **Accepted** (packet candidate 1; Q14). Rewritten to the settled signUp-then-unconfirm model at `4874d4b`, with the probe as the standing citation |
| D2 | drift | ADR-0014 "119 assertions" vs the packet's 121 | **Accepted** (packet candidate 2; Q14) — folded into F13's reconciliation |

## The mandatory batch (R8) — one bound amendment, hard entry criterion of the next DB-opening slice

1. `hc.log_event_types` sign-out code + the access-log definer (APP-09b;
   R1).
2. Definer replacements for the four clean maintenance ops:
   `create_account`, `describe_invite`, `set_slice`,
   `set_opening_context` (R3).
3. The step-1 relationship column — the owner names the table at the
   batch (R2).
4. A dedicated lower-privilege runtime DB role (credential split; R3).
5. The worker claim/lease primitive (F9's DB half).

`unconfirmEmail` and `revokeAuthSessions` write `auth.*` and stay on the
maintenance identity like the mirrors, whatever the batch does. Until the
batch lands, coverage row APP-09b stays **pending** as the visible marker.

## The packet's pointed questions — the record (R7)

Q1 (round-9 dispositions hold under the real boundary) · Q2/Q3 (the two
argued declines stand) · Q4 (the F1 password-path boundary is discharged)
· Q5 (the wasnt-me contract shape — now with the checked-in invoker) ·
Q6 (D1 request-role channel) · Q7 (D2 boundary as built, under R3's
threat model) · Q10 (D4 revocation mechanics — now one transaction with
the cascade fact pinned): **all ratified as the packet recommended.**
Q8/Q9 = R5 with the fuller framing. Q11 = R1 + R8. Q12 = R2. Q13 = R6.
Q14 executed. The reviewer's remaining decision-list items: the maximum
recovery time when GoTrue is down is the worker doc's 30-minute tolerated
age on a 10-minute cadence; every queued item's owner and gate is R8.

## Verification at the disposition head

All evidence at **`4874d4b`** (the drift-disposition commit; every commit
after it is `docs/` only — the per-directory tree binding is recorded in
the packet addendum):

- App tests (vitest): **149/149 across 21 files** (was 121/18 at
  `9899fe0`; the red leg added the worker, maintenance-postcondition and
  vercel-cron files and the compensation/hold cases).
- §11.4-3 walkthrough: **11/11**, re-run at this head under the
  `e2e-local-gate.md` protocol.
- GoTrue probe: **6/6 facts hold** (run twice: pre- and post-reset).
- Clean-leg reset: **46 applied == files, exact**; pgTAP **1134/1134
  across 43 files**; concurrency **55/55 across 32 cases** (teed);
  `db:verify` clean under `--fail-on warning` — the 2A machinery is
  byte-for-byte the merged tree (`supabase/` hash unchanged all session).
- `lint` · `typecheck` · `next build`: clean.

## Consequences

- The migration count stays **8 of ≤ 8** — nothing in round 10 wrote
  DDL; the batch (R8) is the one sanctioned future amendment.
- The round-10 packet carries an ADDENDUM superseding its acceptance
  recommendation with this ADR's dispositions, per the round-9 precedent.
- Coverage §2B: the test-class taxonomy added; APP-09b re-annotated to
  the R1 scope amendment; rows touched by the fixes re-referenced.
- The standing evidence rule going forward: packets bind their evidence
  with per-directory tree hashes (F12), and any GoTrue/Supabase upgrade
  re-runs the probe before anything else (F14).
