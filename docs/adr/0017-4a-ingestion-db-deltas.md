# ADR-0017 — Slice 4A: the ingestion DB increment, design decisions and deltas as built

**Status:** Proposed (built and green on `slice/4-ingestion`; awaiting
third-party review round 12 and owner sign-off)
**Date:** 2026-08-18
**Scope:** Decisions made while building 4A (seven migrations,
`20260818200001`–`20260818200007`; M8 stays reserved for round-12
dispositions), per the slice-4 plan (`docs/review/slice-4-plan.md`,
PLANNED–RULED, Q1–Q7 SETTLED at the plan gate) and the session kickoff.
Authority order applied: the plan → ADR-0015 R8 and the two ops
contracts → TSD §4, §5.1–§5.4, §2.4, §2.12, §1.3/§1.4/§1.9, §3.10/§3.11
as amended by annexes A5/A6 → ADR-0007/0008 → `docs/coverage.md`. Every
divergence from the plan's letter is recorded here; nothing diverges
silently.

## D1 — The R8 batch as built (M1); the sign-out scoping decision

The five items landed exactly as specified. The one scoping decision the
plan left to build ("the TSD names the entry, not its scoping"):
`hc.log_sign_out()` writes ONE CIRCLE-LEVEL entry (subject-less,
domain-less — visible to every live member under the 1D read policy) per
LIVE membership of the actor, in deterministic circle order (one
advisory-lock acquisition order per call — the sweeper precedent). Zero
live memberships is a quiet `{logged: 0}`, never a refusal: sign-out
must not fail for having nowhere to record itself. The 043 pins:
per-membership fan-out, the removed-membership exclusion, actor =
`hc.uid()` with nothing spoofable.

`hc.create_account` is idempotent-by-replay (`on conflict do nothing`,
reported as `created:false`) — the maintenance wrapper's contract
carried onto request-role authority. `hc.set_opening_context` folds the
ADR-0015 F7 zero-row postcondition IN-FUNCTION: forged, stale, foreign
and missing circle ids land in ONE loud refusal shape.
`hc.describe_invite` answers null for malformed and unknown tokens alike
(DEF-10's one shape at the pre-auth boundary). The four converted
call-sites still ride `lib/db/maintenance.ts` until 4B (B8) — the module
shrink and the fence re-pin are app-layer work; the definers exist and
are pinned now.

## D2 — hc_runtime's two-way pin tolerates the seeded login (M1 item 4)

`hc_runtime` is NOLOGIN, member of `anon` + `authenticated` and nothing
else (two-way exact, BAT-04). Its MEMBERS are pinned as a bounded set
rather than an exact one: `postgres` (required — the test suites SET
ROLE through it, the 001 precedent) plus at most `hc_runtime_login` (the
seed-provisioned local credential). Exact-set pinning would fail the
upgrade leg, which runs `migration up` without seed — the login role's
presence is allowed, never required. Hosted provisioning and its
verification checklist: `docs/ops/runtime-db-credentials.md` (the
`HC_DB_URL` flip itself is 4B B8).

## D3 — The claim primitive's IN-subquery defect, found and fixed in-slice

`hc.claim_security_actions` first shipped (M1) as
`id IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED)`. Concurrency case 33
passed twice and then failed: the planner may evaluate that subplan PER
OUTER ROW, and each re-execution sees the command's own freshly-claimed
rows fail the unclaimed qual (`FOR UPDATE` follows the update chain to
the command's own new versions) and locks the NEXT batch — `claim(3)`
over six pending rows claimed ALL SIX under one plan shape. The fix (a
`create or replace` in M6, the file then uncommitted; M1's file
untouched — append-only history): the candidate set materializes ONCE
in a CTE, which Postgres never inlines when it contains `FOR UPDATE`,
so the locking scan runs exactly once and the batch bound is a bound.
043's behavioural pins were already correct and stayed green across the
fix; the suite was re-run twice at the fixed head (61/61 both).
Recorded because it is the exact failure class the two-session layer
exists to catch: plan-dependent, invisible to sequential tests.

## D4 — The store/scan write halves (M2): the D9 shape, one delta each

`hc.finalize_store` and `hc.finalize_scan` follow `finalize_extraction`
exactly (the CAS transition FIRST, in the same transaction; facts commit
with the won transition or not at all; a lost transition writes
NOTHING — the ING-08 orphan class extended, pinned in 044 and raced in
case 34). Decisions inside the shape:

- **store_failed needs no finalizer.** Nothing was kept ⇒ nothing to
  write; the graph has carried `received → store_failed` since M9 (1C),
  and the naked CAS is the honest edge. The worker's failure path is
  `advance_arrival` directly.
- **The key shape is verified against THIS arrival's identity** —
  `circle/<circle>/arrival/<arrival>/<sha256>` exactly; a worker cannot
  park bytes under another circle's or arrival's address. Measured
  bytes re-check the P5 cap; the declared size never grandfathers the
  real one. `byte_size` is OVERWRITTEN with the measured value (one
  column; measurement is ground truth — §2.4's column comments hold).
- **Scan caching is definitive-verdicts-only.** `unavailable` /
  `inconclusive` are not facts about the bytes and are never cached.
  Clean rows carry 7-day freshness (`expires_at`); infected rows are
  RETAINED (`expires_at` null) — `scan_results` doubles as PRD §11.5's
  malware hash+verdict retention, with `hc.expire_scan_results()` as
  the sweep leg (clean-expired deleted, evidence kept) and
  `hc.scan_cache_lookup()` as the 4B worker's cache-hit read (live rows
  only — an expired clean verdict is a miss, never a stale fact).
- **The pgmq queue** `pipeline_work` is created by the migration
  runner; `hc_pipeline` receives the DATA plane only (send/read family
  + the two queue tables; grants enumerated by a catalog-driven DO
  block over the installed overloads). The control plane
  (create/drop/purge) is deliberately not granted — pinned 044:45.

## D5 — Quotas as data + arithmetic (M3); the honest quota-race contract

`hc.quota_limits` follows the `stage_budgets` pattern. The PRD-stated
rows are §13.3's letter; the four RATE rows and the monthly ceiling are
PROVISIONAL OPERATIONAL HYPOTHESES (the BGT-01 precedent) — §4.2.8
names the dimensions without numbers, and the seeds (20/h · 100/d per
sender; 60/h · 300/d per circle; 2,000/month notify) are starting
points revised by migration, never silently. Decisions:

- **Messages are EMAIL PARENTS.** A 25-attachment mail is one message
  (children never count toward rate); uploads are authenticated,
  P5-capped, and outside §5.4's mail-quota scope.
- **Capacity computes LIVE over arrivals** (the plan's own ruling —
  "computing over arrivals via the existing indexes"); the 1A
  `circles.arrivals_count`/`bytes_used` counters stay unmaintained and
  unread. Deleted arrivals never count: nothing is deleted to make
  room, so nothing deleted eats the room.
- **Precedence** over_capacity > over_sender > over_circle; the monthly
  ceiling is a notify-not-fail boolean riding the same answer; the
  per-message bounds ride along so the webhook never re-derives policy.
- **The check-then-create race is deliberately unserialized** (intake
  takes no lock, D2 of ADR-0007; acceptance is never lost to a rate
  question). Case 35 pins the honest contract: two racers at the
  boundary may both land, the overshoot is bounded by the concurrency
  degree, and the NEXT answer refuses. Quota is an ingress rate
  control, not an invariant.
- **`hc.sender_lookalike`** compares pg_trgm similarity ≥ 0.5
  (provisional threshold, same BGT-01 label) against LIVE known
  senders — domain rows AND the domains of address rows; exact match is
  recognition; `lower(text)` throughout (the SND-01 citext trap).

## D6 — product_state (M4): rank order, the cancelled-child rule, 'received' = Checking

- **Rank rule:** ascending progress; at each pipeline phase, STUCK
  states (failed/held/waiting on a person) rank below that phase's
  MOVING states — the family sees the child that is furthest behind,
  and stuck-at-a-point is behind moving-past-it. Ranks are distinct
  (total order); 046 fails on a 22nd enum value without a rank or
  label (the all_domains precedent).
- **Live children only:** the rollup excludes deleted AND cancelled
  children — a member's deliberate stop must not drag three filed
  siblings to "Cancelled". No live children ⇒ the parent's own state.
  (TSD §4.4's sketch excluded only deleted; the cancelled exclusion is
  this build's decision, pinned 046:16.)
- **'received' maps to 'Checking'** (accepted, not yet cleared, not
  renderable) — the honest pre-clearance label. PRD §13.1's looser
  prose ("still shows in the inbox as Arrived the entire time") reads
  as "visibly exists", not as the §4.2.2 'Arrived' state, whose
  definition is "stored and CLEARED"; the states table is the
  vocabulary authority. Flagged for round 12 as a candidate wording
  reconciliation, not a behaviour question.
- **A.4 held:** the rollup computes over the CALLER's visible children
  only; DEF-10 one shape for nonexistent/unauthorized/below-cliff
  (the 027:31 manage-on-four-of-five cliff carried to this oracle,
  pinned with non-member real-vs-ghost byte-identity).

## D7 — Forwarding activation (M5) + the §5.2 resolver — the one scope addition

`hc.activate_forwarding` is coordinator-performed, gated on the
FOUNDER's `email_verified_at` (the postgres-owned mirror — AC-AUTH-4's
ground truth), R-rule-locked with a NAMED `freeze_active` refusal
(activation enables ingestion; a freeze suspends exactly that),
idempotent, logged per §5.1 (subject-bound `forwarding_activated`).
`email_unverified` is a NAMED refusal for authorized callers — an
expected product state whose next step is the verify mail; unauthorized
and nonexistent stay one shape. Deactivation stays with DEL-01 — named,
not dropped.

**The scope addition:** `hc.resolve_forwarding(p_local_part)`,
hc_pipeline-only — §5.2 step 2's read (local part → circle/subject +
active flag; case-blind; unknown/deleted one null shape; an INACTIVE
address resolves with `forwarding_active=false` so provisioning drift is
visible). The plan's M5 row did not list it; without it B2 has no
resolution surface and 4B may not add DDL. It rides M5 because §5.1 and
§5.2 are one machine. The migration COUNT is unchanged (7 of ≤ 8);
flagged as a pointed question for round 12.

`artifact_read` also joins `hc.log_event_types` here (the §1.3 step-6
entry), so the 4B artifact route needs no DDL to log.

## D8 — Stage-1 duplicates (M6): detection at scan, resolution shapes

The three §4.7 edges appended WITH their machinery, exactly as ADR-0008
B1's recorded decision said they would; ING-10's exact-set pin (027)
re-pinned same commit (the 2A M6 pattern). Decisions:

- **Detection runs inside `finalize_scan`, on CLEAN verdicts only**
  (the plan's ruling): only cleared content reaches the duplicate
  question — a quarantined copy is quarantined, not politely
  deduplicated. The safety answer still lands in full (verdict,
  scan_at, cache); the duplicate question is held by the STATE.
- **The match is the letter of §4.7 point 1:** exact `content_sha256`
  against NON-DELETED arrivals in the circle (cancelled copies still
  match — "you already have this one" is true and a person resolves
  it). The matched arrival is re-derived at render from the sha
  (deterministic); no column stores it.
- **Resolution:** manage-gated like cancel; freeze-first named (Q5);
  the honest `resolve_invalid_state` diagnosis reserved for authorized
  callers (Q3). 'different' resumes to the gate through a real gate
  lease + the CAS edge + an outbox re-queue in the same transaction
  (the SND-02 release precedent). 'same_thing' terminalizes
  `nothing_filed` with reason `duplicate_of_arrival`, the original
  RETAINED — never auto-discarded in either direction; there is no
  'discard' resolution. The attach-as-additional-source outcome needs a
  filed document and refines with slices 5/6.

## D9 — Storage buckets (M7): the absence is the mechanism, platform grants stated

`artifacts` and `quarantine` land private with the platform-level P5
cap. NOTHING ELSE is created: the platform grants anon/authenticated
broad `storage.objects` table privileges by default (its API model —
grants present, policies decide), so with RLS enabled the policy
ABSENCE is §3.11's whole mechanism. 049 pins the absences in catalog
terms (zero policies for anyone; zero hc_* grants; `exports` absent —
it waits for its slice) and reds if any policy or grant ever appears.
TUS token minting and the artifact route are 4B; the buckets exist so
those units need no DDL.

## D10 — Staged surfaces named, never silently dropped (unchanged from the plan)

RLY-01 (relay + schedulers), UXA-01's surface (built to the ratified Q6
disposition), RLS-10 (the artifact route), APP-09b's app half, INB-01,
UPL-01, SAU-01's chain, B8's credential flip — all 4B (B1–B9). The
inter-slice seam stands as ruled (Q7): gated arrivals will rest at
`extracting` until slice 5's workers; production activation stays
G4/G7-gated. Extraction/interpretation and stage-2 duplicates are
slice 5; CNF-01, A11Y-07/08, SIG-01, FRZ-16b, RLS-11b, SHR-02, DEL-01,
ADM-01, G12-01 stay with their slices/gates.

## Consequences

- **53 migrations total; 4A added exactly the planned 7** (M8 reserve
  intact — the one in-slice fix rode M6's file before its commit, per
  D3, and consumed nothing).
- The definer inventory grows 49 → 65 (+16: the batch's six, the two
  finalizers, the cache pair, the quota pair, product_state, the
  activation pair, resolve_duplicate); `state_rank`/`state_label`/
  `detect_duplicate` are deliberately NOT definers (pure vocabulary and
  an owner-only write-half helper).
- The hc_internal policy list grows 89 → 97; the INV-14 snapshot gains
  accounts INSERT/UPDATE, circles UPDATE, subjects UPDATE, quota_limits
  SELECT, and scan_results S/I/U/D (DELETE is the retention sweep's —
  the auth_attempts pruning precedent).
- `hc.log_event_types` grows 18 → 21 (signed_out, forwarding_activated,
  artifact_read); `hc.reason_codes` +2; `hc.arrival_transitions`
  15 → 18 rows.
- The pgTAP suite grows to 50 files (043–049 join); the two-session
  layer to 61 assertions across 36 cases (33–36 join).
- No TSD annex: no normative TSD text moved — the §4.4 cancelled-child
  exclusion and the 'received'→Checking mapping are as-built decisions
  recorded HERE and offered to round 12; if the reviewer wants them
  normative, they join a future annex with the dispositions.
- Zero new dependencies (Q4's tus-js-client is a 4B concern; 4A added
  none, as ruled).
