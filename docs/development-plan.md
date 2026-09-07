# Harper's Circle — working development plan

Updated September 7, 2026. This is the current execution order for the Round 33 handoff. Requirements, ADRs, coverage and the owed ledger retain their authority; this plan links them rather than replacing them. Routine work is delegated. Merge, production activation and new schema/authorization increments retain their existing gates.

## Objective and current position

Finish Home's follow-up before adding features. Product corrections are implemented. Staging now has permission, removal, retry-state and substantial manual-entry workload HTTP evidence. Home p95 was 982 ms across 150 valid responses for that workload. The three original findings remain evidence-owed; no complete closeout or launch clearance is claimed.

## Ordered work

| Order | Work | Completion condition | Status |
|---|---|---|---|
| 1 | Finish available Home performance evidence | Measure all five current request-role reads using the actual wrappers, caller permissions and a documented populated fixture; report the 250 ms DB tripwire separately from HTTP latency. Record workload limits and any breach before proposing optimization. | Complete for the manual-entry diagnostic. Query-only correction fdd3eee reduced upcomingEvents server p95 to 175.567 ms; all paired rows matched. Protected staging deployment and six HTTP checks passed; 150 requests measured p95 1,018 ms for the zero-owned-task probe. Mixed-workload and browser acceptance remain open. See docs/ops/staging-query-rollout.md. |
| 2 | Reconcile Home acceptance | Map every F-1/F-2/F-3 and OW-34/OW-35 requirement to a test, measured result or explicitly unresolved gate. Finish feasible populated permission/error checks only where they close a named gap. | Reconciled in docs/review/round-33-followup-packet.md; browser and other named gaps remain explicit. |
| 3 | Prepare the final Home review packet | Refresh the PR description, diff review, exact-commit validation matrix, coverage and owed dispositions. Preserve historical test results as historical. Run affected checks; run final aggregate checks only when required and feasible. | Review checkpoint prepared in docs/review/round-33-followup-packet.md. Native secret scan passed at 5412644 (746 commits, no leaks). Not merge-ready: browser, mixed-workload and final aggregate evidence remain outstanding. |
| 4 | Obtain the owner closeout decision | Present one concrete packet identifying merge readiness and any remaining decisions. Unmet gates require proof or an explicit applicable owner disposition; agent delegation does not create risk acceptance. | Packet available; recommend retaining checkpoint without merging. No repetitive approval request while deferred environment gates remain unchanged. |
| 5 | Plan the next product increment | Select the next requirement from the governing product plan and approve its scope/tier before implementation. Completed-founder resume routing is a documented candidate requiring a separate auth increment, not an already approved feature. | After Home's disposition. |

If step 1 produces a DB breach, record it and complete the review packet; do not silently expand this zero-migration follow-up into an optimization migration. If a step is blocked, continue independent named work and carry its precise blocker into the packet.

## Deferred gates — do not repeatedly retry

| Gate | What would permit resumption |
|---|---|
| Actual browser interaction, accessibility, responsive layout and fixture-isolation runs | A workable runner with adequate resources. The owner has said no more memory can be freed; do not repeatedly request app closures or recheck unchanged memory. HTTP proof does not substitute for this gate. |
| Full nine-file browser/ingestion gate | Compatible fixtures plus its documented email-capture, AI-fixture and scanning dependencies. No additional service or subscription is authorized. Resume only when the environment or owner decision changes. |
| Original mixed document/ingestion performance workload | A supported fixture path for that distribution. The manual-entry result is useful current evidence, not an identical replacement. |
| Production and launch | Existing G4/G7 and other launch criteria, followed by explicit owner authorization. |

## Execution cadence

Work one named unit at a time: requirement/acceptance → failing regression when correcting behavior → implementation → targeted verification → evidence and disposition. Batch documentation and review at meaningful checkpoints; do not create a new checkpoint merely to stop and request “continue.” Keep working through the authorized order, with concise progress updates. Pause for a genuine blocker, completed scope or a critical approval; bundle decisions into a concrete packet where possible.

Preserve the original checkout's protected files. Use the isolated `review/round33-handoff` branch. Avoid broad retesting after evidence-only changes, run resource-heavy checks sequentially, and keep all credentials out of source and reports. Use existing Supabase/Vercel staging; no production deployment or merge.

## Evidence map

- [Home review dispositions](review/round-33-dispositions.md): original findings and remaining acceptance.
- [Staging behavior evidence](ops/staging-setup-smoke.md): setup, coordinator/nonmember/restricted-tier/removal cases and controlled runtime outage.
- [Hosted Home performance](ops/staging-home-performance.md): fixture construction, raw sample references and workload limits.
- [Benchmark tooling correction](review/round-33-benchmark-followup.md): seven regression cases and measurement safeguards.
- [Prepared PR description](review/round-33-followup-pr-body.md): reviewable change summary.
- [Delegated decisions](adr/0048-round33-followup-decisions.md), [coverage](coverage.md), and [owed ledger](owed.md): governing decisions and status.

Owner exploration is active: preserve the reusable tester and synthetic circle. See docs/ops/staging-exploration.md. Use the native Windows secret scanner documented in docs/ops/round33-secret-scan.md; Docker is not required for that check.

Local verification now has an optional npm run test:without-db path: 1,411 tests in 90 files passed, with 22 database-dependent files explicitly deferred. Its pg guard prevents accidental PostgreSQL construction; this is partial application evidence, not completion of the full gate. See docs/review/round-33-without-db-verification.md. No staging reset is needed while the owner explores.
