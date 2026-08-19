# ADR-0018 — Slice 4A review round 12: the findings dispositions

**Status:** Proposed — dispositions recorded 2026-08-19; awaiting owner
sign-off (the round-12 gate ⏸; merge authority is the owner's alone,
ADR-0006; an unanswered item defaults to NOT MERGED).
**Deciders:** the review session (owner ratifies at the sign-off gate)
**Context:** The round-12 third-party review of slice 4A — packet
`docs/review/round-12-packet.md` at head `bc3f93c`, evidence head
`8306af8`, base `main` @ `8d945f8` — returned **approve with findings,
none blocking** (one high, one medium, two low; no code defect found;
every re-verified load-bearing claim held, including all of ADR-0017's
Consequences numbers). The findings landed VERBATIM at
`docs/review/round-12-findings.md` (commit `06b935f`) before anything
was argued, per the standing rule. Each finding's factual basis was
independently re-confirmed in this session against the tree before
disposition. Every disposition below is **docs-only** — no migration,
no test change, no non-docs tree moves — so the packet's F12
per-directory binding transfers the full `8306af8` evidence block to
this head unchanged, and **M8 stays unspent** (4A ships 7 of the
owner-ruled ≤ 8).

## Findings and dispositions

| # | Severity | Finding (compressed; verbatim text is the findings file) | Disposition |
|---|---|---|---|
| F1 | high | The plan's "finalize vs cancellation" concurrency race was substituted with freeze-mid-wait; the ruling lived only in a code comment | **Accepted.** The substitution paragraph below is the record; ADR-0017 D4 now carries the marker. No code change |
| F2 | medium | PRD §11.5's quarantine BYTE purge ("7 days · Automatically") has no named owner anywhere in the slice-4 map | **Accepted.** Owner named: 4B B5's scheduler family + the ingestion deploy checklist; SCN-01 annotated; ADR-0017 D10 extended |
| F3 | low | The monthly ceiling's computed denominator (email parents only) does not match its seeded "arrivals/month" description | **Accepted.** The parents-only denominator recorded as-built (D5 amended); the label fix rides the first BGT-01 revision migration — never M8, never an edit to a shipped file |
| F4 | low | "the four §1.6 verdicts" cites the one spec row that says three | **Accepted.** Correct citations recorded (§2.4/§4.3/PRD §4.2.2); §1.6's row reconciled in TSD annex A9; the shipped file comments stay (the F12 argument below) |

### F1 — accepted: the case-34 substitution, recorded

The plan's 4A test surface named "finalize_store/finalize_scan vs
cancellation (the ING-08 orphan-row class extended to the new
finalizers)". As built, that named race is UNREPRESENTABLE by
construction: `hc.cancel_arrival` refuses outside
`extracting/extracted/interpreting` (the §4.5/A5 letter — cancellation
is the member's window on the read, not on storage or safety;
`20260816010005_publication.sql:333`), so no member cancellation can
commit while a store/scan finalizer waits. Case 34 therefore races the
finalizers through the REACHABLE mid-wait defeat — a freeze committing
mid-wait: store survives it (the §7.5 accept-and-store carve-out; the
artifact facts land), scan is defeated by it and writes NOTHING (no
verdict, no scan_at, no cache row) — while the cancelled-state defeat
is pinned sequentially with a fixture-set state (044:24–25). The
orphan-row CLASS the plan targeted is exactly what the race pins: a
finalizer that loses its transition must write nothing. The
engineering call was right; recording it only in
`scripts/concurrency/run.mjs:109–117` was the round-11-finding-1
process miss, conceded. This paragraph is the record.

### F2 — accepted: the §11.5 quarantine byte purge gets its named owner

The obligation: quarantined malware BYTES purge automatically at 7
days; hash + verdict retained (PRD §11.5). The DB half is landed and
pinned (infected `scan_results` rows at `expires_at` null — the
retained evidence; 044:31,44; `hc.expire_scan_results` deliberately
never touches them). The byte half is hereby NAMED, not silently
dropped: **4B B5 (RLY-01's scheduler family) owns the quarantine
byte-purge sweep leg** — the storage deletion is an app/worker-layer
call (a service-role storage client under the A2 allowlist discipline,
or a platform bucket-lifecycle rule if the provider grows one), and B5
is where the schedulers land — **and the ingestion deploy checklist
gains the row** (the plan's Q7 checklist family). Until 4B no bytes
exist to purge (uploads are 4B; M7 ships empty buckets), so nothing is
currently violated. SCN-01's coverage row carries the annotation;
ADR-0017 D10's staged-surfaces list now names it.

### F3 — accepted: the monthly denominator recorded as it is

`hc.check_quota`'s monthly signal counts EMAIL PARENTS ONLY — the month
count rides the rates query (`parent_arrival_id is null and channel =
'email'`, `20260818200003:89–103`, compared at :119) — while the seeded
description reads "arrivals/month" and §4.2.8 frames the ceiling as
processing cost (children and uploads are processing units). D5 is
amended to say so explicitly. The number is PROVISIONAL and notify-only
(BGT-01); when the rates are first revisited BY MIGRATION, that
revision either re-scopes the denominator to processing units or
re-labels the row — starting from this true record either way. The
label alone spends no migration slot: shipped migrations are never
edited, and M8 is not spent on a description string.

### F4 — accepted: the citation drift closed at source

The four-state scanner contract's homes are §2.4's `scan_verdict`
CHECK, §4.3's stage table, and PRD §4.2.2's internal states; TSD §1.6's
swap-cost row said three (`clean | infected | unavailable`) and was the
one wrong place to cite. TSD annex A9 reconciles §1.6's row to the
four-state contract, closing the drift at source. The shipped citations
in M2's file comment and 044's header STAY: editing a comment in
`supabase/` would move a non-docs tree, void the packet's evidence
under F12, and force a full re-run — for zero behavioural value. The
record here and the annex are the correction.

## The pointed questions — ratified per the review

| Q | Reviewer's verdict | Disposition |
|---|---|---|
| Q-A | ACCEPT the M5 resolver addition | Ratified as recommended — within-bound, within-map, surfaced from the moment it was built (047's header, M5's header, D7, the packet) |
| Q-B | ACCEPT the claim fix's placement | Ratified — append-only preserved, the reserve intact; D3 stays the prominent finding aid, as the reviewer noted a migration-title scan will not surface it |
| Q-C | RATIFY AS-BUILT, with the annex condition | Ratified; the condition EXECUTED — TSD annex A9 records the §4.4 as-built contract (caller-visible children, cancelled-child exclusion, DEF-10), the received→'Checking' mapping, and the §13.1 wording reconciliation |
| Q-D | CONFIRM the labels suffice | Ratified; F3's string attached — the first revision starts from a true label |
| Q-E | ACCEPT the quota-race contract | Ratified — the letter of ADR-0007 D2 and PRD §13.1 ("backpressure sheds processing, never acceptance"); case 35 pins the honest bounded-overshoot contract |
| Q-F | CONFIRM the DB reading, conditional on the byte-purge owner | Ratified; the condition EXECUTED — F2 names the owner |
| Q-G | CONFIRM catalog depth for the DB increment | Ratified; the reviewer's 4B note stands as a recorded obligation: **049 pre-discharges NOTHING of RLS-10** — the artifact route's own discipline is 4B B7's proof, at HTTP depth |

## What this round changed (all docs-only)

- `docs/review/round-12-findings.md` — landed verbatim first (`06b935f`).
- This ADR.
- TSD annex **A9** (the Q-C condition + F4's §1.6 reconciliation).
- ADR-0017: status → ratified-as-amended at round 12; the D4/D5
  markers; D10 names the byte purge.
- `docs/coverage.md`: the §4 header re-referenced to this round;
  SCN-01 carries the byte-purge owner; QTA-01 carries the F3 marker.

## Verification at the disposition head

Every commit after `8306af8` (the evidence head) remains docs-only —
verified per commit — so the packet's F12 binding transfers the full
evidence block (pgTAP 1350/1350 · concurrency 61/61 · vitest 279/279 ·
local gate 16/16 · db:verify clean · clean-leg exact 53 · gitleaks
clean · both scanners exit 0) to this head unchanged; nothing forced a
re-run. CI at the pushed dispositions head is recorded in the sign-off
kickoff once the run completes — pending never counts as green.

## Consequences

- 4A stands at **7 migrations of the owner-ruled ≤ 8; M8 was not
  needed and stays reserved** — the bound's remaining slot through the
  slice; any later spend is an owner matter.
- ADR-0017 is ratified as amended. The round-12 gate now waits on
  **owner sign-off and the merge (never squash)** — each its own fresh
  session unless the owner rules otherwise in-session (the ADR-0015
  sign-off-with-merge precedent).
- Obligations this round sharpened for 4B, so its plan inherits them
  explicitly: the quarantine byte-purge sweep + deploy-checklist row
  (F2, rides B5) · the first quota revision fixes the monthly
  label/denominator (F3) · 049 pre-discharges nothing of RLS-10 — B7
  proves the route's discipline at HTTP depth (Q-G's note).

---

# Addendum — the external-pass dispositions (2026-08-19, same session)

After the dispositions above landed (`0b5b792`), the owner commissioned
a second, external pass. It returned **two blockers** plus a pushback on
F2's premise and a changed Q-F answer — landed verbatim FIRST as the
findings-file addendum (`f5189b4`), then verified against the tree, then
dispositioned here. Both blockers were REAL. **M8 — the reserved
dispositions slot — is spent on them**, red→green: red `dc1e0ba` (pgTAP
050, 8/13 failing, signatures in the message) → green `08ff72e`
(`20260818200008_round12_fixes`). The migration bound stands at
**8 of the owner-ruled ≤ 8; the reserve is gone** — any further 4A DDL
is an owner bound-amendment before a line is written.

## X1 — accepted, BLOCKER: the malware evidence could be downgraded

Verified exactly as claimed: `finalize_scan`'s `scan_results` upsert was
unconditional (`M6:122–124`), so a later clean verdict for a sha
replaced a RETAINED infected row and handed it a 7-day expiry — after
which `hc.expire_scan_results` would have deleted the §11.5 evidence
entirely, and the 4B cache-hit path could have treated known-infected
bytes as clean. The reviewer's framing is adopted wholesale: the row is
**immutable malware evidence when infected, a refreshable cache when
clean**. M8's fix guards the conflict arm — an existing infected row is
untouchable by clean (verdict, expiry, AND detail); clean → infected
always lands; infected → infected refreshes the evidence; clean → clean
refreshes freshness. Pinned: 050:1–8 (including the cache-lookup answer
and the untouched detail) and concurrency case 38 (infected/clean racing
one sha ends infected/expires-null in EITHER commit order).

## X2 — accepted, BLOCKER: every copy could be the duplicate

Verified exactly as claimed: `detect_duplicate` matched ANY other live
same-sha copy (`M6:48–55`), so two identical copies both stored before
either scanned each saw the other and BOTH landed
`duplicate_suspected` — no original retained, circular matched-arrival
derivations, sequential, no race required. M8 adopts the reviewer's
canonicalization: the match is **strictly earlier live copies in
(received_at, id) row order** — of N identical live copies exactly one
(the earliest) is never a suspect, every suspect's match points at an
earlier arrival, and the outcome is scan-order-independent. Pinned:
050:9–13 (the pair, the triple scanned in reverse order, the
detect-asymmetry probe, the deleted-copy guard) and concurrency case 37.

**The tie semantics, recorded honestly.** `received_at` defaults to
`now()`, which is fixed per transaction — one email's children (the
same-transaction creations) tie and break on `id`: arbitrary but
DETERMINISTIC, which is what canonicalization requires. One narrow edge
rides that: an identical same-email pair can BOTH scan clean with no
suspect raised when the id-earlier child is stored only after the
id-later child already scanned (detection sees no strictly-earlier row
either time). Stage-2's key-field match against filed documents
(slice 5, §4.7 point 2) is the recorded catcher for that edge; stage 1's
contract is the cross-arrival "same file forwarded twice", which the
ordering serves exactly.

**The 048 re-pin (same commit, the 2A M6 pattern):** five of 048's 24
assertions (7, 9, 11, 13–14) assumed creation order = received order,
which the fixture world's single transaction made a uuid coin-flip under
the canonical rule — nondeterministic per run, unacceptable. 048's
`mk_received` now staggers `received_at` strictly monotonically (a temp
sequence), restoring every original assertion verbatim; 050 covers the
tie world explicitly.

## The F2-premise pushback — accepted

The reviewer is right: this ADR's F2 disposition said the infected
hash+verdict evidence was "landed and pinned" — at `0b5b792` that was
FALSE as stated (the pins covered the insert shape, not the overwrite
guard). The sentence is true only as of M8's monotonic conflict arm, and
F2 should be read through this addendum: the DB half of §11.5 is landed,
pinned (050:1–8, case 38), and now actually immutable. The byte-purge
owner assignment (4B B5 + the deploy checklist) stands unchanged.

## Q-F — re-answered as the external pass required

The external reviewer's "do not confirm the DB reading yet" was correct
at `0b5b792` and is accepted. With M8 landed, the condition is
discharged: infected hash+verdict rows are retained AND unoverwritable,
clean rows are a 7-day cache, the byte purge has its named owner.
**Q-F now stands CONFIRMED at `08ff72e`**, on the evidence, not on the
intention. Q-A–Q-E and Q-G stand as dispositioned above (the external
pass concurred).

## Verification at the fixed head `08ff72e` (the new evidence head)

- Clean-leg reset: **exact 54 == files** (verify-migration-state); seed
  provisioned `hc_runtime_login`; both buckets from cold; the piecemeal
  upgrade leg exercised (53-state + `migration up` → 54 → 050 green).
- pgTAP: **1363/1363 across 51 files** (was 1350/50; 050 adds 13).
- Concurrency: **63/63 across 38 cases**, teed (cases 37–38 new).
- db:verify: clean under `--fail-on warning`.
- vitest: **279/279 across 35 files** — the first attempt hit a
  forks-worker SPAWN failure on `axe.test.tsx` (the file never ran, no
  assertion failed); classified infrastructure, cleared on the single
  permitted re-run.
- Local gate: **16/16 (5.9 m)** — walkthrough 11/11 + a11y 5/5, first
  run, no re-runs; traces vault-side at
  `projects/harpers-circle/04-evidence/gate-08ff72e-2026-08-19/`.
- lint · typecheck · production build: clean.
- gitleaks (the identical digest-pinned image CI runs): **218 commits
  scanned, no leaks found**.
- Both CI scanner scripts: exit 0.
- CI at the pushed head: recorded in the sign-off kickoff once the run
  completes — pending never counts as green.

## Consequences of the addendum

- **M8 is SPENT** (8 of ≤ 8): ADR-0017's "M8 reserve intact" Consequence
  is superseded; 54 migrations total; the pgTAP suite is 51 files; the
  two-session layer 63 assertions across 38 cases.
- The external pass earned its keep: two real blockers survived a
  verification-heavy first review — the commissioned review verified
  what the packet CLAIMED; the external pass attacked what the code
  COULD DO. Both layers stay in the cadence.
- The gate is unchanged: owner sign-off and the merge (never squash)
  are the owner's, ADR-0006.
