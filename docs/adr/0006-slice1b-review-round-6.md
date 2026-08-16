# ADR-0006 — Third-party review round 6: the built 1B kernel, findings, dispositions

**Status:** Accepted (owner-directed process; owner merge sign-off pending —
this round stops before merge)
**Date:** 2026-08-16
**Packet reviewed:** `docs/review/round-6-packet.md` and the slice branch it
describes (`slice/1b-record-provenance`, PR #2 @ `cad6151`, base `main` @
`03a0c12`) — eleven migrations, the record/provenance/taint kernel, both test
layers, coverage manifest — against the master plan, TSD §2.4–§2.6 and
§3.5–§3.8, and ADR-0001–0005. ADR-0005 bound the design; this round reviews
it **as built**.

**Reviewer verdict:** *not approvable yet* — substantial implementation and
testing effort, but not decision-complete: an authorization-race family
untested, no explicit merge criteria, a knowingly divergent specification,
under-audited evidence, and several understated staged surfaces. Every named
gap is dispositioned below; accepted changes are applied on the slice branch
(red `cb91936` → green `04f6949`, migration `20260815230012_round6_fixes.sql`;
CI gates `c733fb8`) before the owner's merge review.

## The serialization rule (R-rule)

The round's central demand was "a defined serialization rule" for security
state racing writes. It is now defined, implemented, and tested:

> **Every record writer** (`approve_proposal`, `revise_object`), **the taint
> machinery** (`link_provenance`, `propagate_taint_growth`,
> `reclassify_taint`) **and every freeze writer** (`request_freeze`,
> `adjudicate_freeze`) take
> `pg_advisory_xact_lock(hashtext('taint:' || circle_id))`, and **every
> authorization or freeze predicate evaluates under that lock**, against the
> row versions the write will touch. Therefore: a security-state transition
> (freeze, grant change, membership removal) that commits before a writer's
> predicate evaluation — **including one that commits while the writer waits
> on the lock** — always defeats the writer; a transition that commits after
> the predicates bind completes behind the write, and binds at the next
> evaluation (RLS-08's next-query contract, generalised to writers); no
> writer may observe two versions of its object within one transaction.

Recorded exception: `hc.share_object()` stays single-snapshot. A share grants
at most `view`, is inert under any freeze (clause 2 and the FRZ-13 cap bind at
the grantee's next evaluation), and the granter's authorization binds at its
own statement — the outcome of any race is the serial history
share-then-transition. Advisory-lock order stays acyclic:
`freeze:` → `taint:` → `hc.log()`'s unprefixed per-circle key; nothing
acquires them in another order.

Declined half: row-locking `access_grants` / `circle_members` inside writers.
Transitions bind at the next predicate evaluation — the same contract RLS-08
pins for reads — and the tests prove a revocation committed mid-wait defeats
the writer (cases 6–7). Grant-management definers arrive in later slices and
adopt the R-rule lock when they land.

## Findings and dispositions

| # | Severity | Finding | Disposition | Applied where |
|---|---|---|---|---|
| F1 | HIGH | Authorization and freeze checks vulnerable to concurrent state changes: approve checks freezes before the lock; revise authorizes before its row lock; share authorizes unlocked; reclassify authorizes before its lock; RLS-08 proves only next-query binding | **Partially adopted.** The R-rule (above) defined, implemented and tested. Genuine defects fixed: revise authorized on an unlocked read and could write under stale-taint authorization (case 8 red: `title=stale edit`); reclassify authorized pre-lock (case 9 red); revise held no per-circle lock so a mid-flight freeze missed it (case 10 red). **Honest correction:** the claimed freeze-race write escape in approve does not exist — authorization already evaluated ctx under the lock, so the write could never commit (case 5 red records `commits=0` pre-fix); the real defect was the swallowed FRZ-14 signature (`approval_refused` instead of `freeze_active`), now fixed by moving the freeze check under the lock. Freeze writers join the lock so freeze-vs-writer is a total order. Declined: row-locking grants/membership (rule half two; cases 6–7 prove mid-wait revocation and removal already defeat the writer). Share: recorded exception with rationale | M12; run.mjs cases 5–10; 018:14; ADR-0006 R-rule |
| F2 | HIGH | No explicit merge acceptance matrix: which findings block, who owns decisions, what evidence closes | **Accepted.** This ADR's merge gate (below): ownership, blocking rules, per-item artifacts and tests, closure evidence, default-reject for unanswered items | ADR-0006 §Merge gate |
| F3 | HIGH | The authoritative TSD knowingly disagrees with the implementation (D2/D5); "decide later" too weak | **Accepted.** The TSD absorbs the deltas NOW: a normative **Amendments** annex in `docs/TSD.md` supersedes the quoted clauses of §2.3, §2.6, §3.2 and §3.7 in place, each pointing at its ADR. One authoritative description of the security contract exists at merge; ADR-0005's deferral clause is discharged | docs/TSD.md §Amendments |
| F4 | MED | "All green at the PR head" not auditable: no head SHA, PR link, run ids, tool versions, image digest, commands | **Accepted.** The round-6 addendum carries the reviewed head, PR number, both CI run ids, pinned tool versions and image, the exact command per verification leg, and outputs | round-6-packet §Addendum |
| F5 | MED | Upgrade-path verification described but not enforced in CI; db:verify absent from CI | **Accepted.** CI now runs: exact migration-state verification after the clean reset (two-way, `scripts/verify-migration-state.mjs`); `db:verify` with `--fail-on warning` (a hard gate — the parked warning retired with F6); the full upgrade rehearsal — worktree at merge-base, base reset, exact base list, increment apply, exact head list, both suites re-run | ci.yml; scripts/verify-migration-state.mjs |
| F6 | MED | The unused `p_step_up_token` understated: an exposed function accepts and ignores a security-sensitive parameter | **Accepted, with a mechanism.** A non-null token is now **refused** (`approval_refused`) — fail-closed until §5.7's binding can validate it; a client cannot learn to treat token submission as validated authentication because the database refuses it outright. Proven no 1B operation requires step-up: high-risk approval requires explicit confirmation only (PRD §6.4, `confirm_high` — 013:19–20); the §3.7 signature stays verbatim; db:verify's dispositioned warning retires because the parameter is now used | M12; 018:1–2; TSD annex A3 |
| F7 | MED | Performance evidence too narrow for the 5,000-arrival capacity claim; deferral could become indefinite | **Partially adopted.** The deferral is now **bounded by a quantitative 1D entry gate** (PRF-06, pending): a 5,000-arrival realistic-fanout benchmark (dense provenance, multiple memberships and shares, warm and cold cache, p95/p99 over ≥20 runs) with page-sized record queries p95 ≤ 250 ms (the 1A identity-table gate) and search/count full scans p95 ≤ 2.5 s; breach ⇒ the inline-friendly `visible_at` rewrite lands in 1D before 1D closes. Running that matrix now is 1D scope; the deterministic counter invariant (ctx executions == textual references) remains the load-bearing regression gate | coverage.md PRF-06 |
| F8 | MED | D7 lacks a product-consistency decision: union prevents escalation but not semantic staleness | **Accepted — the reviewer's rule adopted.** Parents whose CURRENT union exceeds own ∪ drafted refuse with `proposal_taint_changed` (a post-authorization shape, exactly like `proposal_version_changed`): re-render, then approve what is displayed. The D7 union stays as the fail-closed backstop underneath. D7's interim clause is amended | M12; 018:9–13; TSD annex A3 |
| F9 | MED | Manual-entry provenance unresolved: the test proves a null `source_arrival_id`, not an end-to-end model | **Partially adopted.** The model is **pinned now as the binding 1C design**: a manual entry creates a SYNTHETIC arrival with an explicit manual channel (option 1), written by 1C's proposal-creation machinery in the same transaction as its proposal; `proposals.arrival_id` stays NOT NULL (§2.4 DDL unchanged); the payload `manual` flag must agree with the arrival's channel — that contradiction constraint lands with the machinery that can create the state, because no proposal-creation path exists in 1B at all (fixtures only). Recorded as MNL-01, pending 1C, never green until then | ADR-0006 Q12; coverage.md MNL-01 |
| F10 | MED | Staged owner-only machinery (`reclassify_taint`, `sweep_provenance`) lacks operational boundaries | **Partially adopted.** 1B posture recorded: no production invoker exists (no request-path caller, no client, `hc` not PostgREST-exposed); both are idempotent by construction (reclassify is a fixed-point recompute from current rows; sweep a read-mostly detector that only marks); failure posture is over-taint / `taint_resolved = false` — fail-closed, an availability cost, never an exposure. The operational contract is a **1D entry gate** (OPS-01, pending): scheduler identity, retry policy, alerting on sweep findings > 0, batch/runtime bounds, and a maximum tolerated inconsistency window (≤ 24 h once scheduling exists) | coverage.md OPS-01; ADR-0006 Q10 |

### Packet-quality findings

| # | Finding | Disposition |
|---|---|---|
| P1 | Verified facts, proposals, deviations and blockers blur together | **Accepted** — this ADR separates them structurally (R-rule = decided; findings table = dispositioned; merge gate = blocking status; pending rows = staged) |
| P2 | Every pointed question needs a recommended answer and consequences | **Accepted** — rulings table below; each ruling names its applied consequence |
| P3 | Migration-count rationale (plan said nine, result is eleven) | **Accepted** — ruled at Q8: the 10-migration threshold is a **plan-time split criterion**, advisory for verification- and disposition-driven increments; it is neither obsolete nor breached-in-spirit. Now twelve; future slices plan ≤ 8 to reserve headroom |
| P4 | No rollback/forward-fix strategy | **Accepted** — §Process: migrations are append-only and per-file transactional; recovery is forward-fix migrations, never down-migrations; pre-merge, `main` is untouched and the branch is abandonable; post-merge defects land as their own red→green migration (the M10/M12 precedent); the CI upgrade leg proves the increment applies to the shipped base on every run |
| P5 | Missing abuse cases | **Partially adopted.** Landed: replay-by-another-actor (018:4), idempotency-key length/emptiness (018:5–6), duplicate parents (018:7–8), share-vs-transition (018:14, cases 5–10). Already pinned: self-edge and cycles (TNT-01, 012:21–25), cross-circle/cross-subject endpoints (TNT-01). Declined for 1B: oversized/malformed payload JSON — no HTTP surface exists (`hc` unexposed, PIN-01) and payload authoring is 1C's machinery; 1C's intake owns payload size/shape caps (noted at ING-02). Post-authorization cast errors on the caller's own edits are accepted non-oracle shapes (DEF-10 protects existence/authorization, not input syntax) |
| P6 | Migration interruption checks at each boundary | **Declined, with rationale.** The CLI applies each migration file in one transaction, so an interrupted run halts AT a boundary — and every boundary is a state some green checkpoint already occupied: the red→green unit discipline kept each migration's boundary independently green on the branch, the clean leg exercises boundary 22, and the CI upgrade leg exercises boundary 10 on every run. A 22-way per-prefix suite re-run buys no new safety for its cost. The known platform hazard (an interrupt mid-`db reset` leaving an empty database) is a reset-tool behaviour, not a boundary defect, and the exact-state verifier now catches it mechanically |
| P7 | Sign-offs and dispositions in the repository, not PR conversation | **Accepted** — dispositions live in ADRs (this file); reviewer confirmations are retained below; the owner's sign-off is recorded by the merge commit itself, per the gate |

## Rulings on the packet's twelve pointed questions

| # | Question | Ruling | Consequence applied |
|---|---|---|---|
| Q1 | D1 cross-slice boundary; ING-02/03 completeness | **Confirmed.** The four §2.4 tables with full DDL, fail-closed, arrivals granted to nobody is the right boundary (the write path cannot exist without them); ING-02/03 correctly capture 1C's remaining obligations | none |
| Q2 | D2 `objected_to_member_id` — should the TSD absorb it? | **Yes.** Absorbed now (F3): annex A1 amends §2.3's freezes DDL with the column, its composite FK, its check, and the fail-closed null semantics | docs/TSD.md annex A1 |
| Q3 | D3 own_domain interpretive rows | **Confirmed as mapped**: episode → memories; timeline `admin` → schedule; profile_fact payload-declared, refused if absent. The A.3 generator consumes the map as data, so a future remap moves the matrix with it | none |
| Q4 | D7: union vs refuse-on-drift | **Refuse-on-drift adopted** (= F8, the reviewer's recommendation): `proposal_taint_changed`, post-authorization, union kept as backstop | M12; 018:9–13; annex A3 |
| Q5 | §3.7 check order (freeze before visibility) | **Confirmed** — the named FRZ-14 signature must not be swallowed, and the member's own ctx already carries `frozen`. Strengthened: the freeze check now also runs UNDER the R-rule lock so the named signature survives the race (case 5) | M12 |
| Q6 | Per-row `visible_at` cost — optimize now or 1D? | **1D, behind a quantitative gate** (= F7): PRF-06 numbers; breach ⇒ the rewrite is 1D work, not deferrable past it | coverage.md PRF-06 |
| Q7 | Growth-path serialization cost (D6) | **Confirmed and extended**: the R-rule adds revise and the freeze writers to the same per-circle lock; serializing per-circle writes remains the accepted cost at PRD §13.3 scale (writes are human-paced; freezes are rare) | M12; annex A4 |
| Q8 | Eleven migrations vs the 10-migration guideline | **Advisory for post-plan increments** (= P3). The threshold is a plan-time split criterion; M10/M11 were verification-driven and M12 is disposition-driven — none retro-split a shipped-shape slice. Future slices plan ≤ 8 | recorded |
| Q9 | U10 honest-red note | **Confirmed and extended**: the round-6 red records that the freeze race never escaped as a write (`commits=0`) — the two-session layer caught a *signature* defect where pgTAP could see nothing at all. The layer is doing exactly its job | run.mjs case 5 |
| Q10 | Reclassify caller staging (TNT-08) | **Confirmed**: owner-only through 1B; the re-categorisation surface and sweep scheduling land in 1D **behind OPS-01** (= F10) — staging is acceptable, an unbounded staging is not | coverage.md OPS-01 |
| Q11 | Duplicate-share refusal vs idempotent re-share | **Refusal retained for 1B.** DEF-10 uniformity holds; the granter-side oracle is bounded (it requires manage on the object, and an idempotent success would disclose the same end state). Revisit with the unassign/revocation surface (SHR-02) when a client exists to prefer idempotency | none |
| Q12 | Manual entry vs `proposals.arrival_id NOT NULL` | **Model pinned** (= F9): synthetic arrival, explicit manual channel, created with the proposal in one transaction by 1C's machinery; §2.4 DDL unchanged; flag-vs-channel consistency constraint lands with that machinery | coverage.md MNL-01 |

## Merge gate (F2)

**Authority.** The owner is the sole merge authority; third-party review
informs, ADRs bind, `docs/coverage.md` is authoritative per assertion, and
**pending never counts as green**. The "two reviewers" of the packet are the
third-party round (this disposition) and the owner's own review at sign-off —
the merge commit records the second approval. All D1–D7 deltas are ruled
above (Q1–Q7, F8); no delta merges unruled.

**Blocking rule.** A finding blocks merge unless its row shows either an
applied artifact plus a named test, or an explicit accepted-risk/staged
ruling with a coverage row. An unanswered question defaults to **not merged**.
All twelve questions are answered above; none remain open.

**Closure evidence.** The addendum's re-verification block at the post-fix
head: clean leg (exact 22, 547/547 pgTAP, 26/26 concurrency, db:verify hard
gate), upgrade leg (exact 10 → exact 22, both suites), lint, typecheck, and
green CI on both events at that head.

| Item | Blocks merge? | Closed by |
|---|---|---|
| F1 race family | Yes | M12 + cases 5–10 + 018 (applied, green) |
| F2 merge matrix | Yes | this section |
| F3 TSD divergence | Yes | TSD Amendments annex (normative) |
| F4 auditability | Yes | addendum evidence block |
| F5 CI gates | Yes | ci.yml upgrade leg + db:verify + exact-state check |
| F6 step-up token | Yes | M12 refusal + 018:1–2 |
| F8 / Q4 drift | Yes | M12 + 018:9–13 |
| F7 / Q6 perf gate | No (staged) | PRF-06 pending row — 1D entry gate |
| F9 / Q12 manual entry | No (staged) | MNL-01 pending row — model pinned, 1C implements |
| F10 / Q10 ops bounds | No (staged) | OPS-01 pending row — 1D entry gate |
| P1–P7 | P6 declined; rest process | this ADR + addendum |

## Reviewer confirmations retained

Strong implementation and testing evidence acknowledged · fail-closed
behaviour on walk failure confirmed good (over-taint, never exposure) ·
the two-session layer's discoveries (deferred-trigger role, lock-then-read)
validated as real defects pgTAP could not see · red→green history with
signatures in red commits acknowledged · the packet's twelve questions judged
pointed and answerable — the round's demand was decision-completeness, not
rework of the mechanism.

## Process note

Fixes landed as one red→green pair on the slice branch: red `cb91936` (nine
018 failures and four concurrency failures, each signature in the commit
message), green `04f6949` (M12 + the two drafted-union fixtures + the probe
hardening), CI gates `c733fb8`, docs in the closing commit. Re-verification
and the auditability block live in the packet addendum. Rollback strategy per
P4: forward-fix only; migrations append-only; `main` untouched until the
owner's merge, which will be a **merge commit, never squash** — the red
signatures are part of the record. Per the owner's standing decision, **this
session stops before merge**: the merge and the 1C kickoff wait for the
owner's sign-off on the fixed branch.
