# Close-out — slice 8, the rulings that were never held (rounds 28, 29, 30)

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, legs
**dispositions** then **sign-off**. Only what is below is new.

## STATE — settled, do not redo

- **Slice 8 is fully built and merged.** `main` = **`7ef2a69`** (PR #42, 8C,
  merged 2026-09-03; a true merge commit, parents `d9b96ef` + `eb56432`).
  This session branches `slice/8-closeout` from `origin/main` @ `7ef2a69`.
  CI on `main` was `in_progress` at the merge — confirm it went green.
- **NONE of slice 8's three review rounds was held.** 8A merged without round
  28, 8B without 29, 8C without 30. **ADR-0040, ADR-0041 and ADR-0042 are ALL
  `proposed`/unstamped with Q-A…Q-G open in each — twenty-one pointed
  questions.** The charter: a slice's close-out stamps them, and **an
  unanswered pointed question defaults to NOT PLANNED** (ADR-0006).
- Evidence, all merged and NOT to be re-earned: 8A `4d166c0` (76 migrations ·
  pgTAP 71 files Σ 1,863 · concurrency 83/83 · `db:verify` clean) · 8B
  `3bd8f52` (p95 273 ms) · 8C `2f2c509` (gate **66/66 in 9 files**, 1,228 s ·
  vitest **1,563 / 106 by run**). **Migration bound CLOSED at 2 of ≤ 4** —
  M3 and M4 both UNCONSUMED. Dependencies 0 runtime, reserve UNSPENT.
- Ledgers: `docs/coverage.md` **280 · green 258 · review 9 · pending 13**;
  `docs/owed.md` **OPEN 0 / 25** (OW-26 `CLOSED(2f2c509)`, OW-05
  `TAKEN(8/Tier-3 pass)`). Next free ADR **0043**.
- Still OPEN and not this session's unless ruled so: **PR #35** (ADR-0039)
  and **PR #36**.
- NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist EMPTY ·
  SIG-01 NOT absorbed (sixth slice) · G12-01 `pending` at `gate`.

## THE TASK — docs-only, Tier 3, ONE PR

1. **Rule the twenty-one questions**, quoting each as put. Every ADR carries
   its own recommended answer; accepting a recommendation is a ruling and is
   recorded as one, with WHO chose stated so it is not inferred later.
2. **Stamp ADR-0040, ADR-0041 and ADR-0042** `accepted`, each with its ruling
   date, in a new **ADR-0043 — slice 8's close-out** that carries the
   dispositions for all three rounds at once.
3. **Land the TSD §7.2 erratum** — ADR-0041 consequence 4, still owed: the
   one line at §7.2 naming the `ts_headline` departure and its options string.
4. **Disposition leg-audit F3** (`docs/review/8c-leg-audit.md`): the
   `search copy and bounds` title claims *"the four §4.7.3 strings verbatim"*
   and asserts three. ADR-0041 declared the narrowing; the title contradicts
   it. Fix the title, or rule the narrowing into the cell — not both.
5. **Reconcile the ledgers mechanically, never by eye** — the three-way
   re-tally in the `slice` skill; `npm run test:app` runs
   `tests/lint/process.test.ts`, which checks two of the three.

## WHERE TO PUSH HARDEST

1. **ADR-0042 Q-F is a live exposure, not a question of taste.** FRZ-13's
   freeze carve-out (`hc.grant_vectors`, `20260815230009`) caps a
   non-objected-to coordinator at `view` during an **unresolved** freeze —
   and `view` is exactly `hc.claim_task`'s floor, so she can take a task
   while the circle is frozen. 8A's pgTAP proves the refusal under an **open**
   freeze only (070:32–35). **Rule whether the carve-out is read-only by
   intent.** If it is, this is a coverage row plus a NAMED M-slot in a later
   slice's bound (a guard in the write definers) — never a docs-session edit,
   because a fix is DDL. If it is not, it is an allowance and wants a pgTAP
   pin saying so. Either way it does not turn green here.
2. **Three merged increments were never attacked by anyone.** If ruling from
   the recommended answers is not enough assurance for a slice that touched
   RLS-adjacent authority, say so and commission the review instead — that is
   a different leg and a different session, and it comes BEFORE the stamps.
3. **What must NOT happen quietly**: a row turning green because a question
   was ruled; a narrowing disappearing instead of being recorded; `pending`
   counting as green. A settled ruling is not a finding — file a dissent.

## SLICE-SPECIFIC TRAPS

- **Docs-only means docs-only.** `git diff --name-only origin/main..HEAD -- .
  ':(exclude)docs'` must be EMPTY at the head, and no gate is re-run.
- Coverage cells are AMENDED WITH MARKERS, never rewritten — LOG-01's app
  half at 8C is the shape to copy.
- The kickoff cap is 90 by `split(/\r?\n/).length`; `process.test.ts` enforces
  it. Stage EXPLICIT paths, never `git add -A`.
- Preflight BLOCKs once after every commit (moved HEAD) — re-run to
  acknowledge, never force.

## ⏸ AT THE PR, STOP

Owner sign-off, then a merge commit, never a squash. **Then slice 9's plan
gate is its own session.**
