# Third-party review packet — round 7: the built 1C ingestion state machine

**Requesting review of:** slice `1C — ingestion state machine`, built on
branch `slice/1c-ingestion` (PR #3, base `main` @ `bfa1ad4`), eight
migrations `20260816010001`–`20260816010008`, four new pgTAP files
(019–026, +183 assertions), six new two-session cases (11–16, +7
assertions), ADR-0007, TSD Amendments annex A5, coverage rows
ING-02/03/04–09, CNL-01, SND-01, SWP-01, RAC-05, MNL-01, FRZ-15, PLT-03.

**Authority order:** master plan → TSD §2.4, §3.4, §4, A.1, A.5 as amended
by annex A1–A5 → ADR-0001–0007 → Appendix A + `docs/coverage.md`
(authoritative per assertion; pending never green).

**Review style requested:** as round 6 — decision-completeness over
mechanism rework. Every TSD delta is in annex A5 with its ADR-0007
section; every staged surface has a pending coverage row; the pointed
questions below each carry a recommended answer.

---

## What 1C is

The §4 pipeline as database machinery: the transition primitive
(`hc.advance_arrival` — fence, enumerated outcomes, audit atomicity), the
durable attempt counter (`hc.claim_stage` — budget before provider call,
expiry-transfers-ownership, exhaustion terminal inside the claim),
transition-gated publication (`hc.finalize_extraction` /
`hc.finalize_interpretation` → owner-only write halves), intake with the
P5 caps (`hc.create_arrival`), member cancellation (`hc.cancel_arrival`),
manual entry as the pinned Q12 model (`hc.create_manual_proposal` + the
flag/channel agreement trigger), the §3.4 read policies for
arrivals/extractions/proposals (ING-02/03), and FRZ-15's machinery
(freeze parking with zero budget consumption, the dismissal outbox inside
the adjudication transaction, `hc.outbox_drain`, `hc.sweeper_pass`).

The R-rule (ADR-0006) extends to every new writer; every new writer has
two-session cases proving a mid-wait freeze defeats it.

## Migration map (8 — the Q8 plan-time bound, kept)

| # | File | Contents |
|---|---|---|
| M1 | `010001_pipeline_tables` | arrival_events, pipeline_leases, known_senders, extractions, pipeline_outbox; hc.reason_codes + hc.stage_budgets (seeded); arrivals.current_lease_id; fail-closed staging + hc_internal machinery grants |
| M2 | `010002_transition_primitive` | hc.advance_result (§4.2 six verbatim); circle_frozen; advance_arrival (R-rule; cancelled-before-fence, D4); create_arrival (P5 caps, idempotent intake); sender_recognised; hc_pipeline gains schema USAGE (§3.10 opens) |
| M3 | `010003_advance_result_claim_values` | ALTER TYPE ADD VALUE 'claimed','exhausted' — and NOTHING else (the 55P04 rule; PLT-03) |
| M4 | `010004_claim_stage` | first USE of the claim pair; budgets, expiry, supersession fence, exhaustion arm, interpret's claim-time in-flight transition, freeze no-consume |
| M5 | `010005_publication` | draft_proposal (the drafting contract), write_extractions/write_proposals (owner-only, lease-bound), finalize_extraction/finalize_interpretation, cancel_arrival |
| M6 | `010006_manual_entry` | channel CHECK gains 'manual'; hc.assert_manual_flag; create_manual_proposal (MNL-01, one transaction) |
| M7 | `010007_ingestion_rls` | ING-02/03: arrivals at summary (column grant minus auth_detail/current_lease_id), extractions at view, proposals at manage-over-own-taint, hc.arrival_auth_detail |
| M8 | `010008_freeze_outbox_sweeper` | adjudicate_freeze dismissed→outbox arm (body replace, signature unchanged); outbox_drain; sweeper_pass |

## Red→green history (each red commit names its failure signatures)

| Unit | Red | Green |
|---|---|---|
| U1 tables | `ae0f011` (40/40, 42P01 family) | `818049a` |
| U2 primitive | `6c2902d` (36/36, 42883/enum-absent) | `3dcb3e6` |
| U3 ADD VALUE | `8cca0d9` (2/3, six-label list + 22P02) | `32d6832` |
| U4 claim | `61387a1` (23/24, 42883) | `f5c3e40` |
| U5 publication | `1a7ab34` (23/25, 42883) | `80df47f` |
| U6 manual | `5def7c6` (16/17, 23514 + no_error-where-mismatch) | `5da3b51` |
| U7 policies | `a2a15f9` (17/20, 42501-staging) | `4d82d80` |
| U8 outbox/sweeper | `b00d1af` (13/18, 42883 + zero-outbox) | `311c142` |
| U9 concurrency 11–16 | — (runner extension) | `96dd3fc` |

## Defects found and fixed red→green inside the slice

1. **citext `=` does not resolve under `search_path = ''`** — PG falls
   back to case-SENSITIVE text comparison. `hc.sender_recognised` would
   have silently narrowed the gate (a known sender in different case =
   held mail). Fixed with `lower(text)` comparisons; found by 020:35 red.
2. **Fence-first swallows the cancel signal** — the §4.5 cancel path
   closes the worker's lease, so a late finalization saw `stale_lease`
   instead of `cancelled` (losing the GC-staged-artifacts signal).
   `cancelled` now outranks the fence (ADR-0007 D4); found by 023:8 red.
3. **The §4.3 exhaustion sentence is unimplementable as written** — the
   caller holds no lease that could pass the fence for the terminal move.
   Moved inside `claim_stage` (ADR-0007 D3); the TSD's intent (no
   provider call) kept.

## Mutation check (MUT-03)

`hc.advance_arrival`'s freeze clause removed in the live database ⇒
020:28–32 red by name (parking, terminal-transition refusal, park-state
integrity, dismissed-resume, narrowed-unresolved) — the whole
freeze-parking family, nothing else; restored by clean reset, suite green.

## Verification evidence (local, at the branch head)

- Clean leg: `npm run db:reset` → `verify-migration-state.mjs` exact
  **30 == 30**; `npm run test:db` **PASS (26 files, 730 assertions)**;
  `npm run test:concurrency` **33/33**; `npm run db:verify` **0 issues**
  (hard gate, `--fail-on warning`).
- Upgrade leg (CI rehearses on every run; also run locally): worktree at
  `bfa1ad4` → base reset → exact 22 → `supabase migration up` → exact 30 →
  both suites green against the upgraded database.
- Known local hazard exercised twice this session: an interrupted
  `supabase db reset` leaves an empty database; the exact-state verifier
  caught it mechanically both times (re-reset, verified, proceeded).
- CI (public API, both events at the head): run ids recorded in the
  addendum below after push.

## Pointed questions for round 7 (recommended answers inline)

1. **D1 (enum extension).** Extending `hc.advance_result` with the claim
   pair vs a second enum: is one worker vocabulary the right trade
   against a purist §4.2-verbatim type? *Recommended: yes — four of six
   labels are shared semantics, and the split exercised PLT-03 exactly as
   the plan required.*
2. **D3 (exhaustion inside the claim).** The TSD said "the caller moves
   the arrival"; the fence makes that impossible without a lease. Is the
   claim-internal terminal move acceptable, or should exhaustion mint a
   single-purpose terminal lease so the CAS performs every transition?
   *Recommended: claim-internal — it shares the row lock and event write;
   a terminal-only lease is machinery for its own sake.*
3. **D4 (cancelled outranks the fence).** Both are discard-and-ack; the
   reorder preserves the §4.5 GC signal. Any oracle cost? *Recommended:
   none — the caller is hc_pipeline, and the arrival's cancelled state is
   its own circle's fact.*
4. **D7 (all-domain taint on arrivals/extractions).** Fail-closed:
   unclassified pipeline content requires summary/view on EVERY domain.
   The alternative (per-arrival classification pre-extraction) does not
   exist yet. Accept the coarse bound until a classification lands?
   *Recommended: yes — a false-negative here is an availability cost,
   never an exposure.*
5. **D7 (proposals at manage).** The §3.4 map has no proposals row;
   manage-over-own-taint is the approval audience. Should view-level
   members see pending drafts? *Recommended: no for 1C — PRD §7.3's view
   describes the record, not the approval queue; revisit with the inbox
   surface.*
6. **D6 (manual documents refused).** A document IS its artifact; manual
   document entry would fabricate `artifact_arrival_id`. Confirm the
   upload path owns documents. *Recommended: confirm.*
7. **Cancellation at `extracted` (annex A5).** §4.5 names extracting and
   interpreting; `extracted` sits between stages under the claim-time
   in-flight design. Include it? *Recommended: yes — the member's window
   must not depend on queue timing.*
8. **Q8 discipline.** Planned 8, built 8. Confirm the headroom rule held.
9. **Staged rows.** RLY-01 (relay/scheduler workers), PST-01
   (product_state + parent-rollup oracle), CNF-01 (conflict outcomes),
   SND-02 (sender accept/revoke + held-mail release), FRZ-16 retag to 2+.
   Any of these actually 1C obligations? *Recommended: no — each needs a
   surface (worker runtime, inbox UI, auth slice) that does not exist.*
10. **Gate budget seeds (D5).** store 2 / scan 4 / gate 50 / extract 3 /
    interpret 3, lease clocks 300/600/60/300/300 s. The gate's 50 is a
    guard-never-fails allowance with the sweeper's 24 h defect signal as
    the real detector. Reasonable seeds? *Recommended: yes; they are data
    and move by migration.*

## Files

- Migrations: `supabase/migrations/20260816010001…010008_*.sql`
- Tests: `supabase/tests/019…026_*.sql` (+ pinned-inventory updates in
  001, 002, 007, 009, 011, 013, 019, 020 — each moved in the same green
  commit as the migration that changed the fact it pins)
- Concurrency: `scripts/concurrency/run.mjs` cases 11–16
- Docs: `docs/adr/0007-1c-ingestion-design-deltas.md`, TSD annex A5,
  `docs/coverage.md` (1C section + staged rows)

---

## Addendum — auditability block

- **Reviewed build head:** `198d4fd`
  (`198d4fdb1f650a7dd9fd3da6501a827a9eab29cc`) — 18 red→green commits
  from base `main` @ `bfa1ad4` plus the docs commit; this addendum lands
  as a docs-only commit on top (the round-6 `5499c3c` precedent).
- **CI, push event @ `198d4fd`:** run **31990555583** — conclusion
  **success** (secret scan, containment, schema pin, clean reset,
  exact-state verifier, pgTAP, concurrency, db:verify hard gate, the
  full upgrade rehearsal, lint, typecheck).
- **PR: #3** — https://github.com/rjackson7799/harperscirclev3/pull/3,
  opened by the owner (gh was unauthenticated in the build session;
  raw-token extraction is out of bounds), base `main` @ `bfa1ad4`,
  **DO NOT MERGE** banner in the description.
- **CI, both events at the PR-opened head `30b3f79`:** push run
  **31990775900** — success; pull_request run **31991091966** — success.
  (Push at the build head `198d4fd`: run 31990555583, success.)
- **One CI flake, recorded and fixed:** the docs-only addendum commit
  `efba888` (tree-identical SQL) failed its pull_request run
  **31991291130** in the two-session layer — the same layer that passed
  at `198d4fd` and `30b3f79` and locally 4+ times. Cause class: the
  runner's 5 s pg_stat_activity/pg_locks discovery bounds under load
  (the 1C cases doubled the lock-wait sequences). Fix: discovery bounds
  20 s, per-case timeout 45 s — mechanics, not assertions; a real
  deadlock still fails. Both-event runs at the fixed head are recorded
  below; the merge session re-verifies the final head as always.
- **CI, both events at the fixed head `9890795`:** push run
  **31991564826** — success; pull_request run **31991568425** — success.
  This record lands as the final docs-only commit; its own re-triggered
  runs are confirmable via the public API and the merge session
  re-verifies the final head regardless.
- **Local evidence at `198d4fd`:** clean leg — reset, verifier exact
  **30 == 30**, pgTAP **730/730** (27 files, 9 s), concurrency
  **33/33**, `db:verify` **No schema errors found** (hard gate); upgrade
  leg — worktree @ `bfa1ad4`, base reset, exact **22**, `supabase
  migration up`, exact **30**, both suites green against the upgraded
  database, worktree removed. One transient local FAIL was observed on a
  test:db run that overlapped foreground work (the PRF wall-clock
  tripwires' documented 1:4 load variance is the suspected surface — the
  grep-filtered chain swallowed the per-test detail); two immediately
  subsequent quiet full runs and the CI run at the same tree are green.
  Recorded rather than hidden.
- **Interrupted-reset hazard:** hit twice this session; the exact-state
  verifier caught both mechanically (re-reset, verified, proceeded) —
  the ADR-0006 F5 gate doing its job locally.
- **Pins:** Supabase CLI 2.100.1; image
  `public.ecr.aws/supabase/postgres:17.6.1.106`; Node 22.15.0 / npm
  10.9.2; pg 8.16.3.
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs supabase/migrations` ·
  `npm run test:db` · `npm run test:concurrency` · `npm run db:verify` ·
  upgrade leg per `ci.yml` (worktree at merge-base, base reset, exact
  list, `supabase migration up`, exact list, both suites).
