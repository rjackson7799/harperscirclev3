# Third-party review packet — round 12: slice 4A, the ingestion database increment

**Prepared:** 2026-08-18, at the close of the 4A build session.
**Branch:** `slice/4-ingestion` (PR to follow), base `main` @ `8d945f8`
(CI run 65, 32227569217, green — the plan-gate rulings commit; the
regress terminates there per the standing rule).
**Authority:** `docs/review/slice-4-plan.md` (PLANNED–RULED; Q1–Q7
SETTLED at the plan gate, recorded verbatim there) → ADR-0015 R8 and
standing rules F12/F14 → TSD §4, §5.1–§5.4, §2.4, §2.12, §1.3/§1.4/§1.9,
§3.10/§3.11 as amended by annexes A5/A6 → ADR-0007/0008 → ADR-0006 →
`docs/coverage.md`.
**The dispositions ADR for this build:** ADR-0017 (Proposed — this round
ratifies or amends it).

## Addendum-first: the head ledger (the round-8 rule, from the start)

| Purpose | SHA | Tree relationship | Status |
|---|---|---|---|
| Base (main, plan-gate rulings) | `8d945f8` | — | CI green (run 65) |
| M1 red | `06f37f2` | +tests/043 | red by design, signatures in message |
| M1 green | `429970f` | +M1 migration, seed.sql, 001/002 re-pins, doc row, case 33 | unit green |
| M2 red / green | `a38219a` / `2e6cdfa` | +tests/044 · +M2, 002 re-pins, case 34 | unit green |
| M3 red / green | `becd8e7` / `c3aa07e` | +tests/045 · +M3, 002 re-pins, case 35 | unit green |
| M4 red / green | `6a23644` / `4bd0657` | +tests/046 · +M4, 002 re-pins | unit green |
| M5 red / green | `3c62062` / `a061748` | +tests/047 · +M5, 001/002 re-pins | unit green |
| M6 red / green | `19b38b4` / `4e7ed8e` | +tests/048 · +M6 (incl. the claim fix), 027/002 re-pins, case 36 | unit green |
| M7 red / green | `a698ba3` / `5e840e7` | +tests/049 · +M7 | unit green |
| **Evidence head** | **`8306af8`** | full-sweep re-pins (006 signature closure, 007 freeze inventory) — the LAST commit that moves `app/ lib/ tests/ supabase/ e2e/ scripts/` | **complete evidence block below recorded at exactly this SHA** |
| Review head | the docs-only commits after `8306af8` (coverage flips, ADR-0017, this packet, the round-12 kickoff) | `docs/` only — per-directory binding below transfers the evidence | this packet's final SHA is the PR head |

**Per-directory tree binding (ADR-0015 F12), at `8306af8`:**

```
app      4c84d46a6833fd5fcee9bb7bf1ae7b27b616d00d   UNCHANGED vs main 8d945f8
lib      fddc939f594b7bf868a80dedd74193905559238c   UNCHANGED vs main 8d945f8
tests    4f3112956c111f0e27fbca92a7f7b1720f2e9104   UNCHANGED vs main 8d945f8
e2e      8db881e18b0dd989f2a494311bc825397fd56578   UNCHANGED vs main 8d945f8
supabase 7beb976ebd7f3bfca32d3c74b5e34a7c55dde3ae   MOVED (7 migrations, 7 pgTAP files, 5 re-pinned files, seed.sql)
scripts  70acb12b7d82a01436cc4b597d5fa5fca79731a4   MOVED (concurrency cases 33–36)
```

The unchanged app/lib/tests/e2e hashes are the F12 transfer argument:
the 279 vitest assertions and the walkthrough/a11y specs run against
byte-identical trees; they were re-run anyway (below) because
`supabase/` moved. Any commit after `8306af8` that moves a non-docs
tree voids this packet's evidence and forces a re-run.

## What round 12 reviews

4A is the DATABASE HALF of slice 4 (the Q1 ruling: 4A M1–M8 → this
round → merge; 4B app B1–B9 → round 13). Its hard entry criterion was
the ADR-0015 R8 batched bound amendment — migration 1, before any
slice-4-proper work — and its scope is the store/scan write halves the
1C substrate deliberately lacked, quotas and the lookalike check as
data + arithmetic, the product-state oracle, forwarding activation,
stage-1 duplicates, and the storage buckets' §3.11 posture. NOTHING is
production-activated: no worker runtime, relay, or scheduler exists
(RLY-01 stays pending; ADR-0008 M1's production-disabled ruling
stands), no real forwarding address exists at any provider, and the 4B
units own every route, adapter, and surface.

## The migrations (7 of ≤ 8; M8 reserved for this round's dispositions)

| # | File | What landed | pgTAP |
|---|---|---|---|
| M1 | `20260818200001_r8_bound_amendment` | The five R8 items: 'signed_out' + hc.log_sign_out (circle-level, per live membership) · the four maintenance-definer conversions (create_account, describe_invite, set_slice, set_opening_context — F7 in-function) · circle_members.relationship ≤ 120 written by create_circle on the founder's row (Q2) · hc_runtime NOLOGIN = anon+authenticated exactly (seed-provisioned local login; hosted runbook row) · hc.claim_security_actions (oldest-first, SKIP LOCKED, 5-min lease) | 043: 72 |
| M2 | `20260818200002_stage_write_halves` | hc.finalize_store (exact content-addressed key, measured-bytes P5 re-check, facts commit WITH the won transition) · hc.finalize_scan (four §1.6 verdicts → four distinct exits, never collapsed) · public.scan_results (clean 7-day freshness; infected RETAINED — §11.5) with hc.scan_cache_lookup + hc.expire_scan_results · pgmq queue `pipeline_work`, data plane only | 044: 45 |
| M3 | `20260818200003_quotas_lookalike` | hc.quota_limits (12 bounds: PRD letter + PROVISIONAL rates, BGT-01-labelled) · hc.check_quota (enumerated outcome, capacity>sender>circle, email parents, deleted excluded, one-budget canonical keys, monthly notify-not-fail, limits ride along) · hc.sender_lookalike (trgm ≥ 0.5, live rows, address-row domains, near-miss MORE suspicious) | 045: 29 |
| M4 | `20260818200004_product_state` | hc.state_rank (total distinct order, stuck-below-moving) · hc.state_label (PRD §4.2.2's fifteen strings exactly) · hc.product_state (least-advanced LIVE child over the CALLER's visible children — A.4; DEF-10 incl. the 4-of-5 cliff) | 046: 19 |
| M5 | `20260818200005_forwarding_activation` | hc.activate_forwarding (founder-verified gate on the mirror, coordinator act, freeze NAMED, idempotent, §5.1 entry) · hc.resolve_forwarding (§5.2 step 2 — the one SCOPE ADDITION, Q-A below) · 'forwarding_activated' + 'artifact_read' event types | 047: 21 |
| M6 | `20260818200006_duplicates_stage1` | The three §4.7 edges (ING-10 re-pinned) · hc.detect_duplicate (owner-only) inside a re-created finalize_scan (clean-only detection, safety answer intact) · hc.resolve_duplicate (manage-gated, freeze-first, gate-lease resume + outbox / nothing_filed with original retained) · the case-33 claim fix (Q-B below) | 048: 24 |
| M7 | `20260818200007_storage_buckets` | artifacts + quarantine, private, platform-level P5 cap; ZERO storage.objects policies — the §3.11 absence as the mechanism, catalog-pinned; exports pinned absent | 049: 6 |

## Red→green history (every red commit names its failure signatures)

Fifteen commits, one red→green pair per unit plus the full-sweep re-pin
commit — the ledger above. Red legs are engineered to report every
assertion (guarded catalog probes, jsonb field access over absent
columns, sentinel uuids), so each red commit's message carries the
complete per-test signature list rather than a first-crash abort.

## Defects found and handled inside the increment

1. **The claim primitive's plan-dependent over-claim (real, fixed).**
   `hc.claim_security_actions` first shipped as
   `id IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED)`. Concurrency case
   33 passed twice, then failed: the planner may evaluate the subplan
   per outer row; each re-execution sees the command's own
   freshly-claimed rows fail the unclaimed qual (FOR UPDATE follows the
   update chain) and locks the NEXT batch — claim(3) over six rows
   claimed all six. Fixed in M6's file (then uncommitted; M1's file
   untouched — append-only history): the candidate set materializes
   once in a CTE, never inlined with FOR UPDATE. Suite re-run twice at
   the fixed head, 61/61 both. ADR-0017 D3.
2. **The 043 privilege-closure red DIALLED THE RECORDED SEGFAULT TRAP.**
   Test 71 was first written as a live call expecting 42501; a
   function-ACL denial segfaults this image's backend, and the DB
   crashed and recovered mid-leg. Re-shaped catalog-based
   (has_function_privilege) before the green commit, per the standing
   1A rule. Recorded honestly in the M1 green message.
3. **Two legacy pins caught by the full sweep, re-pinned at `8306af8`:**
   006's closure checks named the dropped 3-arg create_circle
   signature; 007's freeze-reference inventory grew nine → ten
   (activate_forwarding legitimately closes under a freeze).

## Deviations and as-built decisions offered to this round (ADR-0017)

- **hc.resolve_forwarding added to M5's listed contents** (D7): §5.2
  step 2 has no surface without it and 4B may not add DDL. Count
  unchanged (7 of ≤ 8).
- **product_state:** cancelled children leave the rollup (with deleted);
  'received' labels 'Checking' against §13.1's looser prose (D6).
- **check_quota:** live computation over arrivals (the plan's own
  wording); the 1A circles counters stay unmaintained; email parents
  only; the unserialized check-then-create contract pinned as bounded
  overshoot (D5, case 35).
- **finalize_scan owns duplicate detection on CLEAN verdicts only**;
  the matched arrival is re-derived at render, no column stores it (D8).
- **scan_results:** infected rows retained indefinitely (expires_at
  null) as §11.5's hash+verdict evidence; clean rows 7-day (D4).
- **hc_runtime's members** pinned as a bounded set (postgres + at most
  the seeded login), exact-set on its MEMBERSHIPS — the upgrade leg
  runs without seed (D2).

## Verification evidence (recorded at `8306af8`, the evidence head)

- **Clean-leg reset:** `supabase db reset` → **53 applied == 53 files,
  exact** (verify-migration-state); seed ran (hc_runtime_login
  provisioned); both buckets created from cold — M7 is reset-safe.
- **pgTAP:** **1350/1350 across 50 files, Result: PASS** (was
  1134/43 at base; 043–049 add 216).
- **Concurrency:** **61/61 across 36 cases** (was 55/32; cases 33–36
  add 6 assertions), output teed per the standing rule. One case-3
  failure on the first post-reset run was classified INFRASTRUCTURE
  from the retained output (lock-wait discovery timed out while
  containers settled — the recorded transient class) and cleared on
  the single permitted re-run; the fixed-claim verification ran the
  suite twice more, 61/61 both.
- **db:verify:** clean under `--fail-on warning` ("No schema errors
  found").
- **vitest:** **279/279 across 35 files** — carried green against a
  byte-identical app tree (the F12 hashes above).
- **Local gate (F12: supabase/ moved ⇒ re-run):** **16/16 passed
  (6.3 m)** — walkthrough 11/11 + a11y 5/5, UNCHANGED, first run, no
  re-runs under the flake policy. `npx playwright test --trace on` per
  `docs/ops/e2e-local-gate.md`; traces retained vault-side at
  `projects/harpers-circle/04-evidence/gate-8306af8-2026-08-18/`.
- **lint · typecheck · production build:** clean. (One corrupted
  GENERATED `.next/dev/types` artifact from an interrupted dev-server
  write was cleared; no source change.)
- **gitleaks:** 209 commits scanned, **no leaks found** (the identical
  digest-pinned image CI runs; the seed file's open local password
  included in scope).
- **check-service-role-containment / check-exposed-schemas:** both
  exit 0.
- **Upgrade leg:** **CI run 66 (32239829217), SUCCESS at `137c2fc`**
  (the docs head — public API, anonymous) — the standing job's base
  reset exact 46 → `migration up` → exact 53 → both suites, green on
  the pushed branch. The local equivalent was exercised piecemeal:
  every migration here was applied to a live 46-state database via
  `supabase migration up` in build order before its green commit.
- **Zero new dependencies** (package.json untouched; Q4's
  tus-js-client is 4B's).

## Pointed questions for round 12 (recommended answers inline)

**Q-A — The M5 resolver addition.** `hc.resolve_forwarding` was not in
the plan's M5 contents row; it landed there because B2's step 2 has no
surface without it, 4B may not add DDL, and §5.1/§5.2 are one machine.
The migration count is unchanged. **Recommend: accept as a
within-bound, within-map addition**, recorded from the moment it was
built (047's header, M5's header, ADR-0017 D7). Alternative: strike it
and spend M8 re-landing it — pure churn.

**Q-B — The claim fix's placement.** The case-33 defect was found while
M6 was in progress; the fix rode M6's then-uncommitted file as a
labelled section rather than editing committed M1 or spending the M8
reserve. **Recommend: accept** — append-only history preserved, the
reserve intact, the defect and mechanism fully recorded (ADR-0017 D3),
and the suite re-run twice at the fixed head.

**Q-C — product_state's two as-built calls** (cancelled children leave
the rollup; received → 'Checking'). **Recommend: ratify as-built**
(ADR-0017 D6's argument: a deliberate stop must not drag filed
siblings; 'Arrived' is defined as stored-and-CLEARED and received is
neither). If the reviewer wants either normative, it joins a TSD annex
with this round's dispositions.

**Q-D — The provisional numbers** (four rate rows, the monthly ceiling,
the 0.5 lookalike threshold). §4.2.8 names dimensions without numbers;
the seeds carry the BGT-01 label and revise by migration. **Recommend:
confirm the labels suffice** — the alternative (owner-ruled numbers
now) can ride any later migration without re-opening this round.

**Q-E — The quota-race contract.** check-then-create is deliberately
unserialized (intake takes no lock, D2 of ADR-0007); case 35 pins both
racers landing and the NEXT answer refusing. **Recommend: accept as the
honest §5.4 contract** — quota is an ingress rate control, not an
invariant, and acceptance is never lost to a rate question.

**Q-F — §11.5's retention reading.** Infected hash+verdict rows persist
(expires_at null); clean cache rows expire at 7 days via the sweep leg.
**Recommend: confirm** — "7 days, hash + verdict retained after" reads
as bytes-for-7-days (the bucket's, a 4B/deploy concern), evidence
retained.

**Q-G — The storage posture's assertion depth.** 049 pins §3.11 in
catalog terms (zero policies, RLS on, zero hc_* grants, platform
grants stated honestly). The HTTP-level proof (404-shape, revocation)
is RLS-10, flipping at 4B B7. **Recommend: confirm catalog depth
suffices for the DB increment** — the absence is the mechanism, and the
pin makes any future policy a red.

## Files

New: `supabase/migrations/20260818200001…200007` (7) ·
`supabase/tests/043…049` (7) · `supabase/seed.sql` ·
`docs/adr/0017-4a-ingestion-db-deltas.md` · this packet ·
`docs/review/round-12-kickoff.md`.
Modified: `supabase/tests/001, 002, 006, 007, 027` (inventory/graph
re-pins, each in its unit's commit) · `scripts/concurrency/run.mjs`
(cases 33–36) · `docs/ops/runtime-db-credentials.md` (the hc_runtime
provisioning + verification section) · `docs/coverage.md` (§4 opened;
PST-01 flipped; APP-09b annotated).
Untouched: `app/ lib/ tests/ e2e/ package.json vercel.json` — the tree
hashes above are the proof.
