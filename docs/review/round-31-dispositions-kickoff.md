# Round 31's dispositions — ADR-0044, Tier 1's form.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**dispositions** — read `references/dispositions.md` and nothing else. Only what
is below is new. Commit this brief as
`docs/review/round-31-dispositions-kickoff.md` FIRST.

## STATE — settled, do not redo

- **PR #46's merge IS the entry condition — VERIFY, never assume.** Two round-31
  sessions died on an unverified merge claim; do not make it three. Branch from
  `origin/main` after a fetch: **`docs/round-31-dispositions`**. Confirm
  `main` = **`34b5c78`**, a merge commit whose **second parent is `7662898`**,
  before writing a line. If not, STOP — this leg has no entry condition.
- **Round 31 is HELD and its findings are on `main`, verbatim.** Read
  `docs/review/round-31-findings.md` and its kickoff. **You dispose; you do not
  re-review.** Four findings: **F-1 MAJOR** (the *Raise access* panel names no
  subject, no domain, no level — the four-part binding is precise about a value
  the coordinator never saw) · **F-2 MAJOR** (071:4, the `STP-03:`-labelled case
  cited FIRST in the row, passes with M2 deleted — proven by a rolled-back
  control/probe) · **F-3 MINOR** (nothing pins "no write definer admits at or
  below the FRZ-13 cap"; `claim_task` is the only one below `manage`) ·
  **F-4 MINOR** (070 builds no deleted task; `cancelled` is named nowhere).
- **Slice 9 is RULED and ADR-0043's rulings are SETTLED.** Do not re-argue Q1–Q9
  or the close-out. **FRZ-17 is ruled and is 9A's M1** — it is not yours.
- Ledgers as they stand, and this session MAY move them: coverage **281 · green
  258 · review 9 · pending 14**; owed **OPEN 1 / 25** (OW-27). Migrations **76**,
  pgTAP **71**. Next free ADR **0044** (`0039` claimed by unmerged PR #35).
- NOT activated: G4/G7 block · G9 OPEN · G3 open · G12-01 `pending` at `gate`.
  PRs #35 and #36 open, neither this session's.

## THE TASK — a verdict on every finding. Fix nothing.

Two artifacts, then ⏸ STOP:

1. **`docs/adr/0044-round-31-dispositions.md`** — the decision record, **≤ 150
   lines (T1)**. Only what a future session must OBEY. ADR-0003 dispositioned
   the whole RLS kernel in 44 lines.
2. **`docs/review/round-31-dispositions.md`** — the table, any length, every
   finding with a verdict from `FIXED · OWED · OWNER · ACCEPTED-NOTE ·
   DECLINED · NOTED`. Compound verdicts are legal and often honest.

**No code, no migration, no test is written here.** So **`FIXED` is not
available to you** — the repairs are 9A's and 9B's. Each finding lands as OWED
with a named unit, ACCEPTED-NOTE, DECLINED with the argument, or OWNER.
**Every OWED row goes to `docs/owed.md` WITH AN ACCEPTANCE CONDITION** — one
without is a wish, and the scanner rejects it. Cap **25 OPEN**; you are at 1.

**Rule the M2 reserve explicitly.** Round 31 found nothing needing DDL and says
so. A reserve not consumed **closes UNCONSUMED**, and the bound then closes at
what 9A's M1 spends — but that is a ruling someone must make in words, not an
omission. If you instead rule F-1 needs a database-side guarantee, say so and
quote the ruling; round 31 recommends against it.

## WHERE TO PUSH HARDEST

1. **F-1's home and its severity.** It is app-layer, found by a database review,
   because M2's header and ADR-0040 **D6** make the claim. **9B ships Home.**
   Decide whether the fix precedes a new surface or rides its own unit — and
   whether F-1 earns a coverage row of its own. If it is accepted rather than
   fixed, ADR-0006 wants **an owner ruling plus a never-green row carrying the
   exposure**, the FRZ-17 shape.
2. **F-2 touches a GREEN row's evidence, not its truth.** STP-03 stands on cases
   7/9/11; only the citation and the label are wrong. **Amend by MARKER, never
   rewrite** — and decide whether the test repair rides 9A's M1 commit.
3. **Round 31 DISSENTS from ADR-0043 D1** (that STP-03's app half flipped): the
   evidence proves the app *composes and confirms* the four parts, never that it
   *shows* them. **A settled ruling is not a finding** — so either let the
   dissent stand recorded, or put an owner amendment. Do not quietly re-rule it.

## TRAPS

- **This kickoff is capped at 90 lines** (`tests/lint/process.test.ts`,
  `split(/\r?\n/).length`). Stage EXPLICIT paths, never `git add -A` — two
  untracked peer files sit in the shared tree.
- **Re-tally MECHANICALLY before ratifying** (round 16's defect, three-time
  repeat): count the verdict column with a command, reconcile it against your
  own prose, reconcile every OWED row against `docs/owed.md`, and the open count
  against the cap. `statusOf` must copy `tests/lint/process.test.ts` EXACTLY —
  `cell.replace(/\*\*/g,'').split(/[\s—(]/)[0]` — or coverage reads 244/13
  instead of 258/14. `npx vitest run tests/lint/process.test.ts` is 29/29 in
  ~1.3 s; **`--reporter=basic` crashes**, use the default.
- **Nothing turns green because a question was ruled.**

## ⏸ AT THE TWO ARTIFACTS, STOP

Then, each in its OWN fresh session: **9A's build kickoff** (`slice/9-freeze-guard`;
the docs-only ledger + coverage commit FIRST, then M1 red→green) → **9B's**.
