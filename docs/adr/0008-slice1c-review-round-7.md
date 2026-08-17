# ADR-0008 — Third-party review round 7: the built 1C state machine, findings, dispositions

**Status:** Proposed (fixes built and green on `slice/1c-ingestion`; awaiting
owner sign-off and merge — DO NOT MERGE holds until then)
**Date:** 2026-08-16
**Packet reviewed:** `docs/review/round-7-packet.md` and the slice it describes
(`slice/1c-ingestion`, PR #3, base `main` @ `bfa1ad4`, reviewed build head
`198d4fd`) — against the master plan, TSD §2.4/§3.4/§4 as amended by annex
A1–A5, and ADR-0001–0007. ADR-0007 bound the design; this round reviews it
**as built**.

**Reviewer verdict:** *not merge-ready* — "unusually strong on documentation
and evidence, but several important correctness claims are broader than what
the implementation and tests currently establish." Minimum pre-approval
additions named: transition-graph enforcement, a race-safe sweeper, an honest
outbox delivery contract, and concurrency coverage for those two mechanisms.
Every named gap is dispositioned below; accepted changes were applied on the
slice branch the ADR-0006 way — red `e65c6a1` (every failure signature in the
commit message) → green `bf5c4e8` (migration `20260816010009_round7_fixes.sql`,
"M9"), CI evidence gates `cd73127` — before the owner's merge review.

## Findings and dispositions

| # | Severity | Finding | Disposition | Applied where |
|---|---|---|---|---|
| B1 | BLOCKING | `hc.advance_arrival` enforces the fence but not the transition graph, and does not bind the lease to its stage — "a fenced state setter, not a fully enforced state machine". A worker with a valid store lease could request `received → proposals_ready` | **Accepted.** `hc.arrival_transitions` — the §4.3 stage-exit graph as DATA (14 seeded rows, append-by-migration, the `stage_budgets` pattern); the CAS fence now also binds the lease's stage, and the requested edge must be that stage's row. Red proved the reviewer's exact scenario: all five violation shapes (skip, backward, terminal revival, wrong-stage, the `received → proposals_ready` case itself) LANDED pre-fix (027:8 red: five states moved, five events written). Violations return `invalid_state` — §4.2's existing defect signal (ack, raise, never retry); a new enum label was deliberately not minted (no 55P04 surgery; D1's one-vocabulary ruling extends). Recorded decision: the seed covers the §4.3 declared exits the extant machinery can exercise; §4.7's duplicate-detection edges and the duplicate-resolution / held-mail-release re-entries **append with their machinery** (2+) — seeding rows nothing can perform would be dead allowlist | M9; 027:1–10; coverage ING-10 |
| B2 | BLOCKING | `hc.sweeper_pass` selects candidates before acquiring the per-circle lock, then terminalizes without re-reading — "a claim, finalization, cancellation, or freeze can change the row between candidate selection and terminalization; the stale `r.state` may be written into an event" | **Partially adopted, with an honest correction.** The genuine defects were real and demonstrated red: a committed CANCELLATION clobbered to `extract_failed` (case 17), claim-exhaust + sweeper wrote TWO terminal events (case 18), a committed FINALIZATION was clobbered `extracted → extract_failed` (case 20), two sweepers double-terminalized (case 21). Fixed: the candidate list is a stale HINT by design; under the per-circle lock the sweeper now takes the row lock and re-derives EVERYTHING live — state, stage-from-live-state, live lease, freeze, deletion, spent budget — then updates conditionally on the re-read state. **Honest correction (the round-6 case-5 precedent):** the claim that the sweeper "does not revalidate its … freeze status" does not reproduce — the frozen re-check under the lock shipped with M8 (case 19 GREEN pre-fix), and `v_spent` was already computed live; the stale facts were state, stage, lease and deletion. Steps 3–5 are recorded as read-only ADVISORY listings — every re-queue hint is revalidated by `hc.claim_stage`, the authoritative gate, at claim time | M9; run.mjs cases 17–21; coverage RAC-06, SWP-01 |
| B3 | BLOCKING | `hc.outbox_drain` marks rows drained in the transaction that returns them — "a relay crash after commit and before enqueue loses that particular outbox delivery … not exactly-once handoff" | **Accepted — the contract is chosen and named: CLAIM/ACK AT-LEAST-ONCE** (the reviewer's option 2). `drained_at` becomes the CLAIM timestamp; an unacked claim past a 300 s window re-delivers (a relay crash between drain-commit and enqueue delays a row, never loses it); `hc.outbox_ack` (definer #28, hc_pipeline-only) closes delivery and binds to a claim; duplicate deliveries are absorbed downstream by `claim_stage`'s `already_advanced`/`stale_lease`. "Exactly-once" is WITHDRAWN from every normative description (annex A6 supersedes ADR-0007 D10's phrase; the M8 file comment stands as history). Kill-points covered at the DB layer: claim-crash re-delivery, ack finality, double-ack idempotence, ack-without-claim, concurrent-drain disjointness (SKIP LOCKED). The ordinary sweeper remains the backstop (026:10 unchanged). End-to-end delivery through pgmq remains RLY-01 — pending, never green | M9; 027:11–18; case 22; coverage OBX-01 |
| M1 | MAJOR | RLY-01 is arguably a 1C obligation: without the relay/scheduler, dismissal enqueues nothing, sweeper results cause no retries, the 4-hour alert reaches nobody | **Partially adopted — the completion claim is NARROWED, RLY-01 stays staged.** The reviewer's distinction is adopted verbatim: 1C delivers the **database state-machine substrate**, complete and proven; the **operational ingestion pipeline is NOT complete** and 1C never claimed a running pipeline's obligations as green. Explicit production-disabled statement: no worker runtime, scheduler, or relay exists; nothing invokes these functions in production; the pipeline processes nothing until RLY-01 lands (2+). Landing RLY-01 inside 1C was considered and declined: a worker runtime is an application-tier surface with its own slice discipline, and the primitive it needed (a crash-safe handoff) is exactly what B3 built. Coverage RLY-01 stays pending — and pending never counts as green | this ADR; annex A6; coverage RLY-01 |
| M2 | MAJOR | `create_arrival` returns an existing row on key match without checking request identity — conflicting replays alias silently | **Accepted.** Identity = (subject, channel, parent, message id, sender address case-blind) must agree with the stored row, in the fast path AND the concurrent `unique_violation` path; disagreement raises the normalized `idempotency_conflict`, writing nothing. Sequential conflicts: 027:21–25 (each field); concurrent conflict: case 23 (the loser blocked on the unique index conflicts instead of aliasing; a matching concurrent replay still aliases). Recorded boundary: display name is NOT identity (stored, never matched — PRD §4.2.8); transport metadata (byte size, page count, mime, auth_result/detail) is NOT identity — a provider may legitimately re-present one message with different transport detail | M9; 027:19–26; case 23; coverage ING-11 |
| M3 | MAJOR | The packet tests selected races, not "every new writer" — sweeper, outbox, conflicting intake, cancellation-vs-exhaustion, two sweepers uncovered | **Accepted.** The writer-by-writer race matrix is now maintained (RAC-06 below and in coverage); the named holes are cases 17–23: sweeper vs cancellation / claim-exhaust / freeze / finalization, two sweepers, drain concurrency + the ack boundary, concurrent conflicting intake. Cancellation-vs-exhaustion is case 17's exact shape (a budget-spent arrival cancelled mid-wait). The general "R-rule extends to every writer" sentence is retired in favour of the matrix | run.mjs 17–23; coverage RAC-06 |
| M4 | MAJOR | The coarse RLS decision (all-domain taint) lacks an availability analysis — it "proves confidentiality posture, not product usability" | **Partially adopted.** The quantified analysis is below (§D7 availability); the cliff is now a PINNED fact (manage on 4 of 5 domains ⇒ zero arrival rows, 027:31–32). D7 approval is recorded as CONDITIONAL on UXA-01 — a pending inbox-surface entry gate carrying the reviewer's four questions (visibility matrix, coordinator diagnosis, share-based disclosure, existence representation). Confidentiality holds today; the availability cost is deliberate, measured, and gated before any member-facing surface ships | this ADR §D7; 027:31–32; coverage UXA-01 |
| M5 | MAJOR | Budget seeds lack escalation and change-control criteria; "data and move by migration" does not establish WHEN they should change | **Partially adopted.** The Q10 recommended answer is OVERTURNED (below): seeds are re-labelled **provisional operational hypotheses**. Attempt-frequency and max-elapsed math recorded (§budgets below); the demanded no-rapid-burn property is now a test (027:30 — duplicate queue deliveries against a live gate lease consume nothing); revision criteria named. Per-outcome metrics and pre-exhaustion alerting need a worker runtime and land behind OPS-01/RLY-01 | this ADR §budgets; 027:30; coverage BGT-01 |
| E1 | EVIDENCE | "26 files, 730 assertions" (body) vs "27 files, 730/730" (addendum) — internally inconsistent | **Accepted.** Reconciled: 27 files / 730 was correct at `198d4fd` (verified: the harness reports files and assertions in one line; nothing is counted differently); the body's "26" was a stale carry-over from before U8 added 026. The packet body is corrected, and the count at the post-fix head is 28 files / 762 | round-7-packet §verification |
| E2 | EVIDENCE | The reviewed head is ambiguous and partly self-referential; "a reviewer needs one immutable final SHA with complete evidence against exactly that SHA" | **Accepted.** The addendum now carries the compact head ledger (purpose / SHA / tree relationship / CI status per head) and records COMPLETED checks at the actual final head — no future-confirmable entries | round-7-packet §Addendum head ledger |
| E3 | EVIDENCE | The transient local failure remains insufficiently diagnosed — "the verification harness discarded evidence needed to classify a failure" | **Partially adopted.** CI now retains evidence unconditionally: pgTAP and concurrency output (both legs) tee'd un-grepped to log files under pipefail; supabase_db container logs captured on failure; an `always()` artifact uploads all of it (30 days). The concurrency runner already names each failing case with its observed values. Honest remainder: the past transient stays **unclassified** — retained artifacts make the NEXT occurrence classifiable, and multiple green runs are recorded as reassurance, not as classification | ci.yml (`cd73127`) |
| E4 | EVIDENCE | "Pervasive character-encoding corruption (â€”, Â§, â†') … normalize the document to UTF-8" | **Does not reproduce — declined with proof** (the round-6 case-5 precedent). Byte-level check at the reviewed head and the current head: every docs file is valid UTF-8 (`file` reports UTF-8; zero `0xC3 0xA2 0xE2 0x82 0xAC` double-encoded sequences; the packet contains 32 correctly-encoded em-dashes). The observed corruption is the classic signature of a UTF-8 file decoded as Windows-1252 in the reviewer's ingestion pipeline. No repository change; a BOM was considered and declined (GitHub and every repo tool render the files correctly; a BOM would churn every diff for a reader-side defect) | verified in the disposition session; no artifact |

## The sweeper correction, precisely (B2)

What was actually stale in M8's step 2: the loop variable's `state` (bound at
candidate-select), the stage derived from it, the no-live-lease predicate, and
`deleted_at`. What was already live: the freeze check (`hc.circle_frozen`
under the advisory lock — case 19 green pre-fix) and the spent-budget count.
The fix re-derives all of it from the row-locked read; the terminal UPDATE is
conditional on the re-read state, and the event's `from_state` is always the
live prior state. The reviewer's structural demand (advisory lock → row lock →
complete predicate re-evaluation → conditional update) is implemented exactly;
the scope of the pre-fix defect is recorded exactly.

## Rulings on the packet's ten pointed questions

| # | Question | Ruling | Consequence applied |
|---|---|---|---|
| Q1 | D1 enum extension | **Confirmed, with the reviewer's condition adopted:** `hc.advance_result` is documented as the general worker-operation result vocabulary, not strictly the six-result transition type — which is also why B1 reuses `invalid_state` instead of minting a label | annex A6 |
| Q2 | D3 claim-internal exhaustion | **Confirmed — the reviewer's condition is now satisfied:** the sweeper/claim terminal moves follow the same closed transition and concurrency invariants as the CAS (B2's re-validation; the claim's terminal literals come from `stage_budgets`; cases 17–21) | M9; cases 17–21 |
| Q3 | D4 cancellation before fence | **Confirmed; the demanded test added:** an unauthorized caller cannot use the result as an existence oracle — non-member × cancelled arrival and non-member × nonexistent id are ONE shape (`cancel_refused`); only an authorized member reaches the state diagnosis. `advance_arrival`'s own `cancelled` result is unreachable without EXECUTE (catalog-asserted, PLT-04 discipline) | 027:27–29; 020:36 |
| Q4 | D7 all-domain taint | **Confirmed CONDITIONAL** on the availability analysis — delivered below, cliff pinned as a fact, UXA-01 gates the inbox surface | §D7; 027:31–32; UXA-01 |
| Q5 | D7 proposals at manage | **Confirmed, with the reviewer's condition recorded normatively:** the 1C read model explicitly does NOT promise draft visibility at view; revisit with the inbox surface | annex A6 |
| Q6 | D6 manual documents refused | **Confirmed** | none |
| Q7 | Cancellation at `extracted` | **Confirmed** (claim-time in-flight design; the member's window must not depend on queue timing) | none |
| Q8 | Q8 discipline | **Confirmed numerically, and the reviewer's caveat adopted:** migration count is not evidence of scope or operational completeness — that question is ruled at M1 (the narrowed claim), not by the count. M9 is disposition-driven and advisory-exempt (ADR-0006 Q8/P3); 31 total | M1 ruling |
| Q9 | Staged rows | **Confirmed for PST-01, CNF-01, SND-02, FRZ-16. RLY-01: stays staged, but ONLY together with the narrowed completion claim** (M1) — the reviewer's alternative (RLY-01 lands in 1C) declined: a worker runtime is out of this slice's layer, and B3 built the crash-safe primitive it was missing | M1; coverage RLY-01 |
| Q10 | Gate budget seeds | **OVERTURNED as recommended by the reviewer:** "confirmed reasonable" is withdrawn; the seeds are provisional operational hypotheses with named revision criteria and the no-rapid-burn property proven | M5; §budgets; 027:30; BGT-01 |

## D7 availability analysis (M4)

**The rule as built:** an arrival row is visible at `summary` (extractions at
`view`) only when `hc.visible_at` clears that rung on **all five domains** —
pipeline material is unclassified, so the taint is `hc.all_domains()`,
fail-closed.

**Who sees the pipeline under normal grant shapes:**
- Founders and subject-members receive manage×5 at circle creation (CIR-04)
  — they see arrivals, extractions, and (being the manage audience) proposals.
- Any member whose grant set was narrowed below `summary` on ANY single
  domain sees **zero** pipeline rows. Pinned as a fact: manage on 4 of 5
  domains ⇒ zero arrival rows (027:31); manage×5 sees them (027:32).
- Proposals are narrower by design (manage over the draft's own taint — the
  approval audience), and the read model does not promise draft visibility at
  view (Q5).

**Coordinator diagnosis:** guaranteed for full-grant coordinators (the
creation default); NOT guaranteed for a coordinator deliberately narrowed
below summary on any domain. 1C accepts this: the Care Inbox surface does not
exist yet, no member-facing promise is being broken today, and the
"pipeline state is what the family sees" requirement binds the surface slice.

**Targeted disclosure exists:** `hc.share_object` widens ONE named arrival to
view (SHR-01 machinery) — a coordinator can deliberately show a specific
arrival to a below-cliff member without widening a domain.

**Existence leakage:** none — zero rows is indistinguishable from
nonexistence (the RLS-01 posture); `hc.arrival_auth_detail` and
`hc.cancel_arrival` refuse in one shape (DEF-10).

**The gate (UXA-01, pending, entry gate for the inbox surface):** before any
member-facing Care Inbox ships: (1) a visibility matrix by role composition
against real grant shapes; (2) a coordinator-diagnosis guarantee — either a
pipeline-status affordance not gated on all five domains, or a documented
grant-shape requirement for coordinators; (3) the representation of "an item
is processing" for members below the cliff (without existence leakage);
(4) the share-based disclosure flow. Until UXA-01 closes, D7's approval is
conditional, exactly as the reviewer asked.

## Budget seeds as provisional hypotheses (M5)

Worst-case cadence: an attempt is minted only by a claim; with no live lease,
re-queueing is driven by the sweeper (§4.11, every minute once RLY-01
schedules it), so per-arrival attempt frequency is bounded by
≈ 1/max(lease_seconds, sweeper period). Duplicate queue deliveries cannot
exceed it: while a lease is live every extra claim returns `stale_lease` and
consumes nothing — now a pinned test (027:30).

Max elapsed to a terminal state (attempts × max(lease, cadence), cadence
1 min): store 2×5 min = 10 min · scan 4×10 min = 40 min · gate 50×1 min =
50 min · extract 3×5 min = 15 min · interpret 3×5 min = 15 min. Every stage
terminalizes far inside the 4 h queue-age honesty bound; the 24 h stuck
report remains the defect backstop. Gate 50 therefore costs at most ~50
guard evaluations over ~50 min for a stuck-gate defect — noisy-queue cost
bounded, no provider spend.

**Revision rule (change control):** seeds move by migration when observed
distributions breach either criterion — (a) a stage's exhaustion rate
exceeds 1% of its arrivals over a rolling week, or (b) p95
attempts-to-success exceeds half the stage budget — both measurable from
`pipeline_leases`/`arrival_events` today; the surfacing of those metrics and
pre-exhaustion alerting are worker-runtime obligations (OPS-01/RLY-01).
Until then the seeds are **hypotheses**, recorded as such (BGT-01).

## The writer-by-writer race matrix (M3 / RAC-06)

Every writer takes the per-circle advisory lock before its row lock and
evaluates predicates under it (R-rule, annex A4); the matrix names the proof
per pair rather than restating the rule:

| Writers | Proven by |
|---|---|
| freeze vs advance / claim / manual draft | cases 13–15 (round-7 base) |
| cancel vs finalize | case 16 |
| late worker vs current worker (fence) | case 11; 020:18–24 |
| sweeper vs cancel | case 17 |
| sweeper vs claim-exhaust (= cancellation-vs-exhaustion shape) | case 18 |
| sweeper vs freeze | case 19 (confirmation) |
| sweeper vs claim+finalize | case 20 |
| sweeper vs sweeper | case 21 |
| drain vs drain; relay crash vs ack | case 22; 027:12–17 |
| intake vs intake (same key, conflicting / matching) | case 23; 027:19–25 |
| freeze adjudication (dismissal outbox) vs drain | structural: the outbox row commits WITH the finding (one transaction); the drain sees it or its absence, never a half |
| intake vs freeze | structural: intake is not freeze-gated (accept-and-store, PRD §7.5) and carries no security predicate a transition could race (ADR-0007 D2) |
| 1B writers (approve/revise/share/reclassify) | cases 2, 5–10 (round-6) |

## Merge gate

**Authority.** Unchanged (ADR-0006): the owner is the sole merge authority;
ADRs bind; `docs/coverage.md` is authoritative per assertion; **pending never
counts as green**; an unanswered item defaults to **NOT MERGED**. All ten
questions are ruled above; none remain open.

| Item | Blocks merge? | Closed by |
|---|---|---|
| B1 transition graph | Yes | M9 + 027:1–10 + ING-10 (applied, green) |
| B2 race-safe sweeper | Yes | M9 + cases 17–21 + RAC-06 (applied, green) |
| B3 outbox contract | Yes | M9 + 027:11–18 + case 22 + OBX-01 (applied, green); end-to-end delivery = RLY-01, staged |
| M2 idempotency identity | Yes | M9 + 027:19–26 + case 23 + ING-11 (applied, green) |
| M3 race matrix | Yes | cases 17–23 + RAC-06 (this ADR) |
| M1 completion claim | Yes (docs) | narrowed claim: this ADR + annex A6 + coverage RLY-01 note |
| E1 count reconciliation | Yes (evidence) | packet body corrected |
| E2 head ledger | Yes (evidence) | packet addendum ledger + full evidence at the final head |
| M4 D7 availability | No (conditional, staged) | analysis §D7 + 027:31–32 + UXA-01 pending row |
| M5 budget seeds | No (staged) | provisional label + criteria + 027:30 + BGT-01; metrics behind OPS-01/RLY-01 |
| E3 harness | No (process, applied) | ci.yml artifacts/db-logs (`cd73127`); past flake recorded as unclassified |
| E4 encoding | No | does not reproduce — byte-level proof recorded above |

**Closure evidence** for the blocking rows: the addendum's re-verification
block at the post-fix head — clean leg (reset, verifier exact 31 == 31,
pgTAP 762/762 across 28 files, concurrency 42/42, `db:verify` clean with
`--fail-on warning`), upgrade leg (base reset exact 22 → `migration up` →
exact 31 → both suites green), and green CI on both events at that head.

## Consequences

- 31 migrations total; M9 is the one disposition-driven addition (advisory-
  exempt, ADR-0006 Q8/P3). The definer inventory grows to 28
  (`hc.outbox_ack`); hc_pipeline gains EXECUTE on exactly it; the
  hc_internal policy list is unchanged at sixty-one; `hc.arrival_transitions`
  joins the hc-schema data tables (hc_internal SELECT only).
- The suite grows to 762 assertions across 28 files; the two-session layer
  to 42 assertions across 23 cases.
- TSD annex A6 records the §4.1/§4.2/§4.11 deltas normatively; ADR-0007
  D10's "exactly-once" phrasing is superseded by A6.
- 1C's completion claim reads: **database state-machine substrate complete;
  operational ingestion pipeline not complete; production-disabled until
  RLY-01.**

## Process note

Fixes landed as one red→green pair on the slice branch (red `e65c6a1`:
19/32 pgTAP failures + 6 concurrency failures, each signature in the commit
message; green `bf5c4e8`: M9 + the pinned-inventory moves in the same
commit), CI gates `cd73127`, docs in the closing commit. Rollback per
ADR-0006 P4: forward-fix only, migrations append-only, `main` untouched
until the owner's merge — a **merge commit, never squash**; the red history
is part of the record. Per the owner's standing decision, this session stops
before merge.
