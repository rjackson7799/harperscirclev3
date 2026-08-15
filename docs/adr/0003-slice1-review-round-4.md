# ADR-0003 — Third-party review round 4: Slice 1 packet, findings, dispositions

**Status:** Accepted
**Date:** 2026-08-14
**Packet reviewed:** the build plan, the freeze-scope TSD amendment
(§2.3/§3.8, diff f97d0b5), ADR-0001, ADR-0002, against PRD v1.3 and the
full TSD. This round covers the deltas that postdate the TSD's three
review rounds, plus the slice-1 build plan.

**Reviewer verdict:** slice 1A not safe to build exactly as specified;
five minimum changes named. All five are applied (this document records
where), so the corrected 1A kernel is cleared to build.

## Findings and dispositions

| # | Severity | Finding | Disposition | Applied where |
|---|---|---|---|---|
| 1 | BLOCKER | One-open-freeze-per-circle conflates "one active freeze" with "one recorded claim"; a second claimant bounces off the unique index with no auditable intake record, and `hc.request_freeze()` (no subject param) cannot literally apply a per-subject rate limit | **Accepted.** `freeze_claims` immutable intake ledger with per-report dispositions (`opened_freeze` / `attached_to_existing` / `rate_limited`); one active enforcement freeze per circle; rate limit interpreted per-claimant + per-circle (strictly stronger than per-subject at intake) | TSD §2.3; ADR-0001 amendment 1 |
| 2 | BLOCKER | The check constraint proves an open freeze is whole-circle but not that only adjudication can narrow — one privileged UPDATE could set a non-open state plus `subject_id` with no finding | **Accepted.** New constraints `freezes_outcome_is_adjudicated` and `freezes_narrowing_is_assessed`; mutation exclusive to `hc.request_freeze()` / `hc.adjudicate_freeze()`; 1A tests direct INSERT/UPDATE and every non-adjudication entry point. FK-to-a-separate-finding-row **partially adopted** — declined for now (metadata constraints + claims ledger deliver the same binding without a duplicate-column table); revisit if adjudication grows its own state | TSD §2.3; ADR-0001 amendment 2 |
| 3 | SHOULD-FIX | Auto-reopening subject B after an `unresolved` finding narrowed to A recreates the joint-finances leak whole-circle intake exists to close; §3.1's per-subject arithmetic cannot close joint material filed under B | **Accepted** — and verified: taint is a set of *domains*, not subjects, so no containment mechanism closes cross-subject joint material. Unresolved stays whole-circle by default; narrowing requires a recorded cross-subject exposure assessment (`narrowing_rationale`); standard owned by counsel (G1) | TSD §2.3, §3.8; ADR-0001 amendment 3 |
| 4 | SHOULD-FIX | 1A cannot prove freeze guarantees whose machinery lands later (approval refusal → 1B; parking/sweeper/outbox → 1C); calling "freeze outcomes" green in 1A overstates coverage | **Accepted.** Coverage manifest staged: 1A intake/claims/transitions/RLS closure/custodian closure/narrowing invariants · 1B unresolved read-only carve-out + approval refusal · 1C parking, no retry consumption, terminal-transition refusal, outbox re-enqueue, sweeper recovery. Downstream guarantees marked `pending`, never green; each boundary safe only with downstream machinery non-callable | Build plan (session plan); docs/coverage.md convention |
| 5 | SHOULD-FIX | Documents-first lock rule lacks an enumerated, mechanically covered writer inventory across 1B–1D | **Accepted.** Allowlist of every function/trigger with write privilege on `documents` / `document_search_content`, asserted by an invariant test (no unlisted writer); every multi-table writer locks `documents` first; all `document_search_content` write paths revoked until 1D populates it | Build plan 1B/1D |
| 6 | SHOULD-FIX | Appendix A's preamble claims every assertion is a pgTAP case, contradicting the layered test pyramid; several named assertions need two sessions, HTTP, storage, or workers | **Accepted.** Preamble rewritten: `docs/coverage.md` is authoritative per assertion; layer-spanning requirements split into one assertion per layer; timing equivalence asserted nowhere (error shape and code only) | TSD Appendix A preamble |
| 7 | SHOULD-FIX | The migration boundary rule omits ADR-0002's binding enum rule (55P04) | **Accepted.** Explicit migration invariant: a migration containing `ALTER TYPE … ADD VALUE` may not use the new value; usage begins in the next migration; upgrade-path regression fixture exercises exactly this | Build plan, migration boundary rule |
| 8 | SHOULD-FIX | The six definer-function properties miss escalation surface: role membership / SET ROLE into owners, default privileges, overloads, dynamic SQL, caller-supplied identity, result-shape uniformity, schema USAGE, atomicity | **Accepted.** Invariant suite extended to the full list; `ALTER DEFAULT PRIVILEGES` revokes PUBLIC EXECUTE globally rather than relying on per-function revokes alone | Build plan, definer invariants |
| 9 | CONSIDER | Four `ctx()` InitPlans are acceptable now, but CI would not notice the count multiplying; "one call per query" is the wrong stated invariant | **Accepted as stated** — no policy-shape redesign. Invariant restated as "once per textual reference, never once per row"; 1A adds a query-specific maximum `ctx()` execution count assertion and benchmarks representative circles against the §3.12 budget | Build plan 1A completion criteria; ADR-0002 note 2 already carries the observation |

## Reviewer confirmations retained

Custodian-edge outcomes defensible · the open-state constraint edge behaves
as intended (the gap was adjudication binding, not the check) · paused 1A
and 1B boundaries fail closed under the stated conditions · no writer
inherently incompatible with documents-first ordering · the layered test
model directionally correct · four hoisted `ctx()` calls constant, not
row-proportional · inaccessible-between-migrations states fail closed ·
main-green/red-on-branch and mutation-testing sound.

## Process note

The master plan file is retained as the historical instruction set; the
binding deltas from this round live in the session plan, the TSD, and the
ADRs. Findings 5 and 6's remaining work (writer inventory contents, full
assertion-level layer map) must be settled before 1B and 1D respectively
but do not block the corrected 1A.
