# Build — slice 8, increment 8C (Claim's surface, and the access log's cursor), round 30

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. Only what is below is new. The contract is `docs/review/slice-8-plan.md`:
"### 8C", "Coverage rows to open", *Owner decisions* Q1, Q3(b), Q5, Q6.

## STATE — settled, do not redo

- Branch `slice/8c-claim-log-app`: `git fetch`, create it from `origin/main` @
  **`d9b96ef`** — PR #41 (8B) merged 2026-09-03 (merge commit, parents `189e06c`
  + `f3836ba`), CI green on `main`. 76 migrations, 71 pgTAP files, **64 gate legs
  in 9 files**. 8C's entry condition — 8A merged — is discharged.
- **Rounds 28 and 29 did NOT run**: ADR-0040 (8A) and ADR-0041 (8B) are both
  `proposed`, unstamped, Q-A…Q-G unanswered in each. **ADR-0040's Q-A/Q-B/Q-C
  bear on unit 1's copy** (the freeze UNNAMED; *hers already* refuses; a
  caregiver claims a task shared to her by name), and its Q-G says
  `task_claimed` *"renders generically until 8C words it"* — build to the ADR's
  recommended answers and say so in the deltas doc; the rulings stay the
  owner's. OPEN: PR #35 (claims ADR-0039), PR #36. Next free ADR **0042**.
- Tier **T2** (Q1): ONE deltas doc, ONE review session (round 30); the gate runs.
- Bounds: migrations **2 of ≤ 4** spent · **M4 closed UNCONSUMED at 8B** · M3
  reserved for round-28 dispositions, which have not happened — **8C ships NO
  DDL**: `hc.claim_task` and the level-bound `hc.set_grant` already exist (8A
  M1/M2). A finding that needs DDL stops and is the owner's. Dependencies **0
  runtime** (reserve UNSPENT). `lib/ai/` untouched.
- Evidence at `d9b96ef`: reset exact **76** · pgTAP **71, Σ 1,863** ·
  concurrency **83/83** · gate **64/64 in 9 files** (1,972 s) · vitest
  **1508/105 by run** · `db:verify` clean. Coverage 280 · green 257 · review 9
  · pending 14. `docs/owed.md` **OPEN 0 / 25**, OW-26 `TAKEN(8C/unit 2)`.
- NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist EMPTY ·
  SIG-01 NOT absorbed · G12-01 pending at `gate`.

## THE TASK

Commit this kickoff as `docs/review/8c-build-kickoff.md`. Then the plan's
"### 8C" three units verbatim, **the claim route and its leg FIRST**:

1. **Claim** — the control on the Tasks list's `Unassigned` filter and on task
   detail; `POST /[circle]/tasks/[task]/claim/submit` inside `withRouteBudget`;
   both listed in `RECORD_SURFACES` and driven by `page-gate.test.ts`; **the
   refusal renders the honest sentence, not *"That couldn't be done just now."*
   for a case the surface can name.** A leg proves a `view`-level member claims
   and the task becomes hers, and that **no control is offered where the
   function would refuse**. `task_claimed` gains its own sentence in the log.
2. **OW-26** — `lib/hc/people#accessLog` gains a **`seq` cursor**; the page and
   the **printed** projection reach the same set; a test drives a circle **past
   300 rows** and asserts `seq` 1 — the custodianship declaration — is
   reachable. **LOG-01's app half is AMENDED with a marker, never rewritten**,
   to point at LOG-04. No count and no total anywhere (§7.4).
3. **The batched Tier-3 pass** (OW-05's standing quota) — **8 legs** audited
   title-against-assertion at the 8C close-out, findings recorded whether or
   not they move a verdict; it covers all three increments' Tier-3 work.

Exit: closure at ONE head (T2: vitest exact · the gate, its new total stated
exactly · lint/typecheck/build · gitleaks; DB legs only if M3 is consumed) ·
**TSK-05's app and e2e halves** and **LOG-04** flipped on legs inside the
COMPLETE run, never early · **OW-26 → `CLOSED(sha)`** · the deltas ADR **0042**
(`Status: proposed`) · PR `[DO NOT MERGE without owner sign-off]`.

## WHERE TO PUSH HARDEST

1. **What the surface may NAME against the ONE shape the function returns.**
   8A ruled every refusal one shape (ADR-0040 D2), so the surface decides from
   the row RLS already returned — owned, done, her level, the freeze — and
   never probes; and the race (someone claimed it between render and submit)
   answers honestly without inventing a cause it cannot know.
2. **The cursor reaches EVERY entry the reader may see.** Page and print the
   same set, `seq` 1 reachable past 300 rows, no total and no "more".
3. **The claim writes nothing else.** No share, no instruction — 8A proved it
   at pgTAP by SET EQUALITY, and the app half must not add one — and
   `task_claimed` names the claimant as actor.

## SLICE-SPECIFIC TRAPS

- `RECORD_SURFACES` is an EXACT set and `page-gate.test.ts` derives routes from
  the filesystem: the new route fails vitest until listed **both ways**.
- **Q5: NO new a11y row for 8C** — the control and the route are a CITATION
  inside the existing record leg's `AUDIT_MANIFEST` entry.
- The gate is **64 legs in 9 files**; state the new total exactly.
- Preflight BLOCKs once after every commit (moved HEAD) — re-run to acknowledge,
  never force; `NODE_OPTIONS=--max-old-space-size=1536`; `hc_clamd` idle first.

## ⏸ AT THE GATE, STOP

Next leg: **round 30** (Tier 2 — one review session), the dispositions table,
owner sign-off, merge commit never squash. **Rounds 28 and 29 remain unheld and
ADR-0040/0041 unstamped — slice 8's close-out must stamp both, and that is the
owner's call, not this session's.** **STOP at the gate.**
