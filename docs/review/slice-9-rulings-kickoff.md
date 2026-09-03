# Slice 9 — the plan-gate rulings.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**plan gate** (its ruling half, step 3). Only what is below is new. Commit
this brief as `docs/review/slice-9-rulings-kickoff.md` FIRST.

## STATE — settled, do not redo

- **PR #44 MERGED → `main` = `ad9d058`** (a true merge commit, parents
  `7cf16ec` + `37ff3fe`; the PR's own check passed, CI on `main` was still
  running at the merge — **confirm that run went green before you rely on
  it**). Branch from `origin/main` @ `ad9d058` after a fetch:
  **`docs/slice-9-rulings`**.
- **The plan is merged and UNRULED.** `docs/review/slice-9-plan.md` reads
  `Status: PLANNED — AWAITING RULINGS` and carries **no Owner decisions
  section**. Under ADR-0006 an unanswered pointed question defaults to NOT
  PLANNED — **no build may start until this session lands.**
- **Q1–Q9 are stated in the plan's own final section**, each with a
  recommended answer and its argument. Read them there. **They are not
  restated here, and this session does not re-argue them** — it records what
  the owner rules.
- Ledgers UNMOVED and NOT this session's: coverage **281 · green 258 · review
  9 · pending 14**; owed **OPEN 1 / 25** (OW-27). The plan puts slice 9's
  coverage rows and ledger rows in **9A's FIRST build commit**, never in a
  plan PR — that still holds. **This session writes neither.**
- Next free ADR **0044** (0039 claimed by the unmerged PR #35). Slice 9's
  first round is **31**. Migrations **76**, pgTAP **71**. The bound is not in
  force until it is ruled.
- NOT activated: G4/G7 block · G9 OPEN · G3 open · SIG-01 NOT absorbed ·
  G12-01 `pending` at `gate` · LOG-03 never green. PR #35 and PR #36 open,
  neither this session's.

## THE OWNER'S RULINGS

>>> OWNER — ANSWER HERE. Either rule Q1…Q9 one by one, or use the slice-8
>>> short form recorded in `docs/owed.md` (*"the planner's best recommendation
>>> ratified by the owner's words"*): **"go with your best recommendation for
>>> each open item"**, which ratifies all nine AS PUT. A question left blank
>>> is NOT PLANNED by ADR-0006 — say so deliberately if that is the intent.

## THE TASK — record the rulings. Docs-only, ONE PR.

1. Append **`## Owner decisions — SETTLED <date> (the plan-gate rulings)`** to
   `docs/review/slice-9-plan.md`, in the slice-8 plan's shape, recording each
   ruling **VERBATIM** — the owner's words, not a paraphrase.
2. Move the status line to **`PLANNED — RULED`**.
3. **Never rewrite the plan's body.** Where a ruling DEPARTS from the
   recommendation, the recommendation stays visible and the ruling sits
   beneath it — the amendment discipline (ADR-0025 D6; ADR-0043's
   head-index-plus-marker rule). Say how many were ruled as put and how many
   departed, and make the prose agree with the table.
4. **No coverage row, no ledger row, no ADR-0044.** Those are downstream.
5. Re-tally mechanically before claiming anything; `npm run test:app`'s
   `tests/lint/process.test.ts` is the whole verification for a docs-only
   change.

## WHERE TO PUSH HARDEST

1. **A departure is not local — trace it.** If Q1 moves 9B's tier, the
   increment shape moves. **If Q4 is ruled OUT, round 31 disappears and M2's
   reserve loses its named condition** — it must then be renamed or closed,
   because a blank reserve is the one that gets amended. If Q3 is ruled OUT,
   M1 is unconsumed and FRZ-17/OW-27 needs an owner amendment instead, and
   the row stays `pending` and never green. **Every departure is traced
   through the bound, the tiers, the round numbers and the coverage list in
   the same commit, or the plan contradicts itself.**
2. **Q7 amends a RULE, not a row.** The burn-down quota lives in
   `docs/owed.md`'s Rules section — it is neither a coverage assertion nor a
   ledger status, and the plan homes the edit in 9A's docs commit. Confirm
   that placement still holds under whatever Q7 is actually ruled; if the
   ruling changes the rule's wording, say which file carries it and when.
3. **Q8's chore PR is not this session's either.** If it is ruled to its own
   PR, name whose session and when it lands relative to 9A.

## TRAPS

- This kickoff is capped at 90 lines; the plan file is not (only
  `docs/review/*kickoff.md` is measured). Stage EXPLICIT paths, never
  `git add -A` — two untracked peer files sit in the shared tree.
- Long files go through the Write tool: a Bash heredoc past ~130 lines
  truncates with a misleading `unexpected EOF` and writes nothing.

## ⏸ AT THE PR, STOP

The owner merges (`--no-ff`). **Then, each in its OWN fresh session:** round
31 — the commissioned adversarial pass over 8A's M1 and M2, if Q4 ruled it in
— then **9A's build kickoff**, then **9B's**.
