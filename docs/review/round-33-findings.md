# Round 33 — independent post-merge review of Home

> **Reviewed:** 9B, `slice/9b-home` @ `7de7dac7b50a327d0622a2a6efe41b025ac8a4f1`, implementation head `38fceca`, base `aae90d2`.
> **Current remote baseline:** PR #50 merged at `2026-09-07T06:12:44Z`; main is `de05145d85dc3263d624d86927ff05e844a2882c`. Its tracked tree is identical to the reviewed branch head. This review occurred after that merge; it does not retroactively authorize it.
> **Independently verified:** source and test inspection, exact-head public CI status, tracked-tree equality, and isolated mocked Home tests.
> **Taken on trust:** previously recorded full-suite, DB, build, secret-scan and performance results. No fresh database, browser or benchmark run.
> **Verdict:** corrections required in a follow-up. Three findings: two MAJOR product findings and one MODERATE browser-test finding. No production clearance.

## What was independently verified

- Public PR: https://github.com/rjackson7799/harperscirclev3/pull/50 — CLOSED and MERGED, not waiting to merge.
- Both exact-head CI runs completed successfully: [pull request run 34089722978](https://github.com/rjackson7799/harperscirclev3/actions/runs/34089722978) and [push run 34089719909](https://github.com/rjackson7799/harperscirclev3/actions/runs/34089719909). This verifies conclusions, not suite tallies or browser evidence.
- `git diff 7de7dac origin/main` is empty at `de05145`; `git diff 38fceca 7de7dac` is docs-only.
- The original checkout remains on `slice/9b-home`. Its three pre-existing untracked paths were left untouched: `.github/SECURITY.md`, `docs/review/kickoff-continuation-amendment.md`, and `docs/review/slice-5b-queue-kickoff.md`.
- Windows process inspection found no identifiable project dev server, Vitest, Playwright or worker process. An unqualified Codex-runtime `./server.mjs` process could not be assigned to a project from its command line; complete peer idleness is not established. No shared stack mutation was attempted.
- Existing Home mocked-route tests were copied to an external handoff harness; source code was imported from the original checkout. The only changes to existing cases were absolute source-root resolution for filesystem assertions. Three review cases were appended. Final result: **28 cases, 26 passed, 2 failed, 0 skipped**. All 25 original cases passed; the empty-state positive control passed; both new error-state expectations failed.
- Initial sandbox worker startup failed before assertions. The first expanded external-harness run had a Next navigation mock-resolution mismatch, corrected by aliasing the installed module. That harness failure is not a product finding. Earlier reports were retained separately.
- Final raw evidence: `C:/Users/HCI/Documents/ChatGPT/HarpersCircleCLD_Handoff/round33-verified-review-results.json`; harness and test source are beside it as `round33-review.config.mjs` and `round33-reproduction.test.ts`. These are review evidence, not a complete gate result.

## Findings, most severe first

### F-1 — MAJOR — failed Home reads can claim that nothing needs attention

**Confidence.** High; reproduced against the actual page with mocked Supabase responses.

**Where.** `app/(app)/[circle]/page.tsx`, `readNeedsReview` (lines 353–355), `readSubjects` (373–375), and the empty-router message (295), at the reviewed head.

**Claim under test.** HOME-05's recorded claim: “a refused read is an error state, never an empty Home.”

**What I found.** `readNeedsReview` logs any returned error and resolves `{ count: 0, top: null }`; `readSubjects` logs and resolves `[]`. Neither reaches the page's existing error handler. A service failure is indistinguishable from a successful empty read. This finding concerns operational failures; it does not overturn Q5's settled treatment of callers who cannot enumerate arrivals.

**Failure scenario.** An established circle has an arrival, other Home blocks are empty, and the needs-review query returns a statement-timeout error. Home renders “Nothing here needs you right now.” A failed subjects query with otherwise empty results produces the same message. A populated router instead silently omits the failed block. The user cannot distinguish missing data from no work.

**Why the tests miss it.** The existing error-state case rejects `myOpenTasks`, which propagates errors. It never supplies a returned Supabase error to either helper. New cases `review-count failure must not claim nothing needs attention` and `subject-read failure must render a retry state` both fail on the missing alert; the genuinely empty positive control passes.

**What would close it.** No DDL. Preserve operational failures as failures and render a retry state, without converting them into zero/empty facts. Cover both helpers and distinguish actual read failure from successful RLS-filtered emptiness. Retain the approved Q5 non-enumeration behavior until an explicit amendment. Add browser evidence before claiming person-facing closure, or obtain an explicit accepted-risk disposition.

### F-2 — MAJOR — Home invents an instant for date-only events when deciding past and future

**Confidence.** High from static SQL evaluation; not a fresh live-DB reproduction.

**Where.** `lib/hc/timeline.ts`, `SORT_AT_I`, `upcomingEvents` (324–327), and `latestEventPerSubject` (374–378).

**Claim under test.** PRD §13.6: “A local calendar date plus the subject's zone context. **Not a timestamp**”; and “A ‘day’ for a due date is the **subject's** local day, never the server's.” The new reads claim to distinguish what is coming from what has happened.

**What I found.** `upcomingEvents` uses both server `current_date` and a comparison between `now()` and a date synthesized as noon UTC. A value previously used for sorting now decides eligibility. `latestEventPerSubject` also uses server `current_date` to admit date-only events as past. Neither uses the event's `occurred_zone` or the subject's local day for these predicates.

**Failure scenario.** At `2026-09-07T18:00:00Z` (08:00 Honolulu), a Honolulu date-only event for September 7 passes `occurred_on >= current_date` on a UTC database but fails the final comparison because September 7 at noon UTC is already past. It disappears from What's coming early in its actual day. Conversely, at `2026-09-07T01:00:00Z` (September 6 at 15:00 Honolulu), an event dated September 7 can satisfy `occurred_on <= current_date` and become the latest thing that “has happened” a local day early.

**Why the tests miss it.** The new DB case uses a date 30 days ahead and events far in the past. Its assertion compares `sort_at` with `Date.now()`, which preserves the same invented-instant assumption. No local-midnight, UTC-noon or cross-zone boundary is exercised.

**What would close it.** No DDL is demonstrated necessary. Separate temporal eligibility by kind: dates against their applicable local calendar date, zoned appointments against their instant. Do not give floating times an implicit UTC zone; their placement requires explicit policy if the governing temporal contract does not settle it. Pin UTC-noon and local-midnight boundaries, both sides of UTC, and retain a same-day date through its local day. Keep sort-key convenience separate from claims about whether something has happened.

### F-3 — MODERATE — A11Y-13's day-one fixture is already populated in the complete file

**Confidence.** High from test order and fixture inspection; browser execution remains unrun.

**Where.** `e2e/a11y.spec.ts`, `ensureCircle`, `ensureDocumentRow`, and the leg titled “A11Y-13: Home audited in both states — the day-one card and the router — at 390px, headed and keyboard-operable”.

**Claim under test.** The leg's comment says: “This circle has never had an arrival.” The leg-integrity audit marks its title against assertions TRUE.

**What I found.** `ensureCircle` memoizes one circle. The preceding “the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px” leg calls `ensureDocumentRow`, which inserts a live filed arrival into that same circle and does not remove it. A11Y-13 then requests the same circle and immediately expects the day-one forwarding-address state. The configured normal file execution is one worker, with no per-leg reset or dedicated empty Home circle.

**Failure scenario.** Earlier a11y legs succeed; their worker and fixture remain alive. A11Y-13 renders the router because `readArrivals` returns the earlier filed arrival, and its first day-one assertions fail before it validates both states. A targeted run starting a fresh worker can conceal this dependency.

**Why the tests miss it.** The new browser leg has not run; route mocks reset independently. The written leg-integrity audit inspected assertions without tracing the earlier fixture mutation.

**What would close it.** No DDL. Provision an isolated synthetic circle for this leg's day-one-to-router transition. Do not delete another leg's arrivals or reorder tests to conceal the dependency. Verify the leg alone and after preceding a11y legs, then earn the complete staging gate; targeted runs are not gate results.

## Confirmations

- Home and its task/timeline wrappers retain user-scoped clients or `withRequestRole('authenticated', claims, ...)`. Both the inner ID selection and outer full select remain on the same RLS-controlled base tables; no service-role substitution or new definer was introduced. Static inspection found no widening in this change; it is not a complete authorization audit.
- Recent activity orders by filing time descending before its small limit, with a deterministic ID tie-breaker. The existing DB test uses more rows than the old ascending cap, although this review did not rerun it.
- Both access-confirmation panels derive the displayed subject/domain/level and submitted values from the same parsed variables. An unknown subject suppresses confirmation; `hidden` is explicitly described as revocation.
- Home is first in each tier's navigation. Accepted-invite routing was not changed. The completed-founder's resume loop is already Q-B, not a newly discovered regression.
- The mocked Home absence, composition, AI-import fence and budget tests passed in the isolated harness. Those passes do not prove live permissions or accessibility.

## Answers to the pointed questions — recommendations, not owner rulings

| Question | Proposed disposition | Reason / boundary |
|---|---|---|
| Q-A — query performance | Record the residual; no 9B migration. Measure on staging and plan a separate Tier-1 increment if warranted. | Page p95 and per-read p95 are different instruments. Previously measured values are not independently re-earned here; F-2 remains a correctness issue regardless of speed. |
| Q-B — founder resume | Schedule a separate, owner-ruled auth increment with a durable completion signal and resume tests. | Do not infer completion from a visit or silently alter AC-AUTH-9 in the Home follow-up. |
| Q-C — STP-04 evidence | Hold pending until its app and browser evidence both exist. | The Layer cell explicitly includes e2e. The current green app cases are insufficient for the combined claim. |
| Q-D — restricted-member day one | Amend Q5 so only coordinators receive the onboarding card; other members receive their visible router. | This is a proposed product ruling, not a defect disposition. Successful RLS-filtered zero rows must not be treated as proof that the circle is new. Preserve RLS; do not probe hidden arrival counts. |
| Q-E — browser gaps | Include F-3's fixture repair and the new completion-link navigation check in the follow-up. Give the pre-existing below-cliff gap a named test-only follow-up and acceptance condition. | F-3 is newly established. Do not silently rewrite the earlier audit or count any written leg as executed. The completed-founder branch belongs with Q-B. |
| Q-F — reviewed or ruled | Record that this independent review occurred after PR #50 merged; owner dispositions remain outstanding. | A merge proves neither that this review happened earlier nor that the six recommendations were ratified. |

## Recorded dissents and observations

- Q-D is real under the existing policies: `subjects_select` admits live circle subjects to a circle member; `arrivals_select` requires its separate visibility threshold. A care-circle member can therefore see the forwarding address and receive zero arrivals. This follows the literal approved branch and is treated as a dissent, not F-4.
- The A11Y-13 focus assertions call `.focus()`; they prove focusability, not Tab order, activation or visible focus-ring appearance. Keep that limitation explicit when evaluating A11Y-13's evidence.
- `components/shell/nav-manifest.ts` describes a caregiver's Home as her tasks and nothing else, which does not describe Q-D's current day-one branch. Correct that commentary when the owner settles Q-D, preserving the historical ruling.
- Browser-dependent coverage remains pending. G4/G7, G9/G3 and the recorded GATE-01 exposure are unchanged. No prior claim that 9A's surfaces were re-proven is made.
- Findings are supplied verbatim for disposition. No owner decisions, accepted risks, coverage flips, product fixes, push or merge were performed by this review.
