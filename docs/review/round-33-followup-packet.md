# Round 33 follow-up review packet

**SETTLED, except outstanding proof and owner disposition:** ADR-0048 governs F-1/F-2/F-3 and all six original questions. This packet does not reopen those decisions or backdate review of already merged PR #50. Review checkpoint: **not merge-ready**. No merge, production activation or new service is proposed.

## Scope and result

Review source head: `dfed830c0eb0a278e00690eb109c9fc9a6949e11`, branch `review/round33-handoff`. The documentation commit containing this packet is the docs head, discoverable with `git log -1 -- docs/review/round-33-followup-packet.md`; only documentation changes follow the declared source head in this checkpoint. Scope is Tier 2, zero migrations and zero dependency changes.

Home now distinguishes operational failures from successful empty results, restricts the day-one card to known coordinators, and selects date-only events by local calendar day. Browser fixtures and benchmark assertions were repaired. Deployment certificate tracing and guarded local fixture access support staging. [Prepared PR body](round-33-followup-pr-body.md) describes the changes; the branch is not pushed and no follow-up PR is open.

## Acceptance reconciliation

| Item | Available proof | Still owed / disposition |
|---|---|---|
| F-1: failure, permissions, displayed state | Home regressions; staging coordinator, nonmember, Care Circle, Family and same-session removal HTTP checks; controlled database outage reached retry with normal controls before/after | Individual Supabase failure injection, timeout and populated permission variants; person-facing browser proof. **OWED** under OW-34. |
| F-2: local-day selection | Actual PostgreSQL temporal regressions, including floating and invalid-zone cases | Browser date presentation. **OWED** under OW-34. |
| F-2 / HOME-05: performance | 2,021 events/501 claimed tasks; 150 valid warm HTTP requests, p95 982 ms; all five actual DB wrappers measured | DB server diagnostic upcomingEvents p95 **297.249 ms**, over 250 ms. Mixed workload and browser proof missing. HOME-05 **pending**; no optimization migration or risk waiver inferred. |
| F-3: fixture isolation/navigation | Independent synthetic browser fixture written; completion-to-Home HTTP proof | Browser leg alone, after preceding legs, and complete nine-file gate. **OWED** under OW-34. |
| OW-35: below-cliff inbox leg | Exact arrival card and Needs you assertions written | Qualifying browser and full staging execution. **OPEN**. |

Exact recorded tallies: **3 OWED, 0 FIXED** findings; coverage **290 total: 259 green, 9 review, 22 pending**; owed ledger **35 rows: 2 OPEN, 2 TAKEN, 2 RISK, 23 CLOSED, 6 PROMOTED**. No row is promoted by this packet. Existing G4/G7, G9/G3 and GATE-01 dispositions retain their scope.

## Commit-bound evidence

| Evidence head | Result and boundary |
|---|---|
| `0d93dbb6765062bf7c42a3088add5eba875852d0` | Whole-tree lint, 1,621 application tests passed, production build including TypeScript. Historical full run, not a new full-suite claim at source head. |
| `1cf6db5` | Fixture-access change: 64 affected tests, changed-file lint and whole-tree TypeScript passed. |
| `7f1267cdf98d8b08804ff8c21bf030916e89e25f` | Benchmark safeguards: 7 tests passed after committed RED evidence; changed-file lint and whole-tree TypeScript passed. |
| `a8a4d45b5906a110fb32f30d21921f13a92c9765` | Protected staging deployment `dpl_D6jKeTX89tqQBoXVqAoXYTUjYjuS`; remote build and later HTTP behavior/load evidence. Later local fixture/benchmark tools were not deployed. |
| `dfed830c0eb0a278e00690eb109c9fc9a6949e11` | Current actual-wrapper and server execution measurements. [DB report](../ops/staging-home-database-performance.md) distinguishes caller role, transport and method. |

Verified tree bindings from full-suite head `0d93dbb` to source head `dfed830`:

| Directory | Identical tree object at both heads |
|---|---|
| app | `373ad0fb49b56f2af623bd7481bfcc4f324d4105` |
| components | `45a86b537ffe5f0708bc0d20a73e2712893e3ff4` |
| lib | `1721dae49cbf452a43f7bf1226d45e948f62b4de` |
| supabase | `7935a455915bd2840ac372502412d2efe682f615` |

`tests`, `scripts`, `e2e`, deployment configuration/certificates and docs moved after the full run. Therefore the old full-suite evidence is carried only for its declared head and these identical directories, not as whole-tree verification of the current branch. A complete final aggregate run is still required for a merge-ready candidate. Fresh gitleaks evidence is also outstanding: no local executable was found, and Docker remains stopped under the owner's resource decision. No browser assertion has executed on this host. No CI tally or launch clearance is claimed.

## Consolidated recommendations

The original six questions have answers in ADR-0048; no duplicate approval is requested. Recommend keeping this branch as a completed implementation/evidence checkpoint while the following gates remain visible:

1. Keep the browser and full ingestion gates deferred until a viable environment exists. The owner has said no more memory can be freed and no additional service should be added; do not repeat those requests.
2. Treat the measured database breach as a separate optimization planning item. A migration would require its own tier and authorization; the present evidence does not identify or approve one.
3. Do not merge on a claim of full closure. A later merge decision needs missing evidence or an explicit applicable owner disposition, plus final aggregate and secret-scan evidence. Existing delegation is not risk acceptance.

The next product feature remains unselected. Completed-founder resume routing is a candidate separate auth increment, not authorized implementation. [Working plan](../development-plan.md) owns the next sequence. No approval is needed merely to retain this checkpoint and its outstanding gates.

## Packet verification

The documentation working tree based on dfed830 passed all 29 tests in tests/lint/process.test.ts and git diff --check. These validate process/ledger invariants, not application behavior. The first sandboxed test invocation failed to spawn before assertions; the authorized single-worker invocation completed successfully. This does not replace the outstanding aggregate or gitleaks gates.
