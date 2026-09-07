# Round 33 — post-merge dispositions

Authority: ADR-0048 records the owner's delegation verbatim and distinguishes the agent's decisions from owner-selected answers. Original findings at `06e82f4` are unchanged. PR #50 was already merged before this review; this follow-up does not backdate sign-off.

| Finding | Verdict | Applied artifact and test | Remaining acceptance |
|---|---|---|---|
| F-1 — failed reads become empty success | OWED | `db2bb76`: operational Supabase failures propagate to Home's retry state; known permission refusal retains its separate semantics. `tests/routes/home.test.ts` covers subjects, review count and arrivals, with positive empty-state and visible-content controls. | Code applied; person-facing closure is still owed under OW-34. Stage operational-failure and tier scenarios; no complete FIXED claim. |
| F-2 — date-only UTC cutoff | OWED | `c28eb42`: calendar-date eligibility uses recorded/subject zone; appointments use instants; floating values do not imply known past/future. `tests/hc/home-temporal.test.ts` executes the actual selection SQL against synthetic read-only PostgreSQL rows. Existing timeline tests additionally verify retained access to floating records. | Current latency and browser behavior remain OW-34. Historical p95 is not a benchmark of changed queries. |
| F-3 — populated day-one browser fixture | OWED | `271b06d`: A11Y-13 owns its synthetic account/circle, asserts initial zero arrivals and seeds only its own router state. The completion leg now clicks through to Home. | OW-34: execute alone, after earlier a11y legs, and in the complete staging gate. Written tests are not green evidence. |

Tally: **3 OWED, 0 FIXED**. This records outstanding proof, not an assertion that the product patches are absent. All three share OW-34's explicit current follow-up/staging acceptance unit. No new risk was accepted. This is an implementation checkpoint, not round closure or a claim that the burn-down quota has been satisfied.

## Pointed questions

Q-A through Q-F are decided in ADR-0048. Q-D's day-one card is coordinator-only, using the existing live membership read; no RLS or auth-state change. Q-B's durable completion signal remains a separate auth increment. Q-E's pre-existing below-cliff gap is OW-35 with a named acceptance condition. STP-04 remains pending. The actual review is post-merge.

## Coverage and ledger

HOME-05 is pending again because the new membership read and temporal predicates require a current benchmark. Its old measurements remain explicitly historical. No coverage row is promoted: 290 total, 259 green, 9 review, 22 pending.

Ledger after intake: 35 rows, OPEN 2 of 25, TAKEN 2, RISK 2, CLOSED 23, PROMOTED 6. OW-34 owns follow-up staging proof; OW-35 owns the pre-existing inbox test gap. G4/G7, G9/G3 and GATE-01 remain unchanged.

## Fresh verification

- Full application suite at `ba61b99`: **1,620 passed, 0 failed**, 109 file results. The earlier run's one floating-event expectation was corrected to ADR-0048 and the record's continued readability asserted.
- Final defensive zone guard at `845eb0b`: **85 targeted tests passed**, covering Home, real-PostgreSQL temporal selection, live timeline reads and process records. This includes eleven temporal cases. The complete suite was not rerun after this last guard; the affected suites were.
- Whole-tree lint passed before the final guard; changed-file lint passed afterward. Standard Turbopack production build, including TypeScript, passed at `845eb0b`.
- Build reports a tracing warning in unchanged `lib/pipeline/ocr.ts`. The locked offline install reports existing engine-range warnings for jsdom/undici against the project's Node 22.15 pin. No dependency or lockfile changes were made.
- Original source checkout remains at `7de7dac` with its same three untracked paths. No push, merge or deployment was performed. No browser run, new p95 or complete DB migration gate is claimed.

Raw evidence lives in the handoff folder: `round33-final-app-suite.json`, `round33-final-targeted.json`, and `round33-final-build.log`. Red reports remain alongside them. Follow-up product head is `845eb0b`; later changes to these records are documentation-only.

## Subsequent full verification — workflow follow-up

At clean commit `0d93dbb6765062bf7c42a3088add5eba875852d0`, `npm run verify:local` exited 0: whole-tree lint, **1,621 passed / 0 failed / 0 pending** application tests (140.36 seconds), then production build including TypeScript. The existing preflight lease guarded the sequential run. This is fresh verification including the final zone guard; earlier results above remain historical. Raw evidence is retained in the handoff workspace as `round33-workflow-suite.json` and `round33-workflow-verification.log`. The later commit recording this paragraph changes documentation only. Browser, latency, OW-34 and OW-35 dispositions are unchanged; no hosted run or coverage promotion is claimed.

## Current closeout checkpoint — subsequent staging work

The existing protected Supabase/Vercel staging setup now has HTTP evidence for unverified setup-to-Home, coordinator day-one display, signed-out redirects and cache headers, signed-in nonmember isolation, Care Circle/Family router display, and removal using the same session. See `docs/ops/staging-setup-smoke.md` for exact fixtures, deployment, cleanup and limits. These later results supersede the absence of hosted checks in the historical paragraphs above, without changing their commit-bound local results.

| Remaining acceptance | Current disposition |
|---|---|
| F-1 operational failure | Application regression proof exists. Controlled hosted request-role database outage now reaches the retry state, with normal-preview controls before/after; individual Supabase error injections and timeout/browser proof remain pending. Minimal restricted-tier and removed-member HTTP composition passed; populated permission variants remain pending. |
| F-2 temporal correctness and performance | Real-PostgreSQL temporal regression proof exists. Benchmark tooling includes membership and rejects wrong-state samples. Fresh hosted manual-entry workload: 2,021 events/501 claimed tasks, 150 valid HTTP samples, p95 982 ms; see `../ops/staging-home-performance.md`. DB-only tripwire, mixed-workload and browser date proof remain pending. |
| F-3 fixture isolation and navigation | Completion-to-Home HTTP passed, but isolated/after-prior-legs/full-gate browser execution remains pending. |
| OW-35 | The inbox assertion is written; qualifying browser execution remains pending. |
| Browser runner | Independent local runner prepared; memory guard stopped before launch at 501 MiB. No assertion executed. Existing interactive attachment failure is a separate limitation. |
| Full ingestion/email gate | Companion dependencies remain deferred by the owner's no-additional-service decision. This is not an acceptance waiver. |

Tally remains **3 OWED, 0 FIXED**, with no coverage promotion, owner merge or production activation. No new service is required for the narrow browser smoke; the full nine-file gate still has the documented additional dependencies. The owner has deferred further memory troubleshooting. Follow `../development-plan.md` for the current execution order: available performance/evidence work, then one consolidated Home review packet. Do not repeatedly retry the browser gate without a changed environment.

## Consolidated review checkpoint

See round-33-followup-packet.md for the current acceptance matrix and commit bindings. DB measurement is now complete at dfed830: upcomingEvents server execution p95 297.249 ms breaches 250 ms; HTTP p95 remains 982 ms for the manual-entry workload. Performance acceptance, mixed-workload and browser evidence remain owed. Exact tallies remain 3 OWED / 0 FIXED; coverage 290 total / 259 green / 9 review / 22 pending; ledger 35 rows / 2 OPEN / 2 TAKEN / 2 RISK / 23 CLOSED / 6 PROMOTED. No owner disposition is inferred.
