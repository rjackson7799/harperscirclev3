# Round 32 — the rulings. No reviewer session.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**dispositions** — read `references/dispositions.md` and no other reference
file. Commit this brief as `docs/review/round-32-rulings-kickoff.md` FIRST.

## STATE — settled, do not redo, do not re-argue

- **`main` = `e1fd0ae`** — PR #48 merged `--no-ff` 2026-09-07 (parents
  `1eab0e5` + `b6efd7f`). Branch from `origin/main` AFTER a fetch. **CI on
  `e1fd0ae` was `in_progress` at the merge — confirm that run went green
  before anything else; the PR's "0 of 2 checks passed" meant PENDING.**
- **9A is built, merged and CLOSED — do not rebuild it, do not re-earn its
  evidence.** Code head `efc2164`: M1 `20260904120001_claim_task_freeze_guard` ·
  migrations **77** · pgTAP **71 files Σ 1,871 PASS** · concurrency 83/83 ·
  vitest **1,563/1,563** in 106 files.
- **ROUND 32'S REVIEW WAS NEVER HELD** — the owner merged the packet directly,
  as with 8A/round 28 and 8B/round 29. **This session writes no findings file.**
  It is the round-26 shape: closed by owner ruling, ADR-0036 the precedent.
- **`docs/adr/0045-9a-freeze-guard-deltas.md` is `proposed` and UNSTAMPED**,
  carrying **Q-A…Q-F**. Under ADR-0006 an unanswered pointed question defaults
  to NOT PLANNED and **9B's build does not start**. Clearing that is this
  session's whole purpose.
- Ledgers, by `tests/lint/process.test.ts`'s own parser, never by eye: coverage
  **289 · green 259 · review 9 · pending 21**; owed **32 rows · OPEN 2 / 25 ·
  TAKEN 1 · RISK 1 · CLOSED 22 · PROMOTED 6**.
- Bound **M1 spent, 1 of ≤ 4** · M2 CLOSED UNCONSUMED · M3 held · M4 NAMED for
  9B. **Spend nothing — this session ships no DDL.** Next free ADR **0046**.

## THE OWNER'S RULINGS — VERBATIM BELOW. A BLANK IS NOT AN ANSWER.

**Twice now a rulings brief has arrived with this block blank. Never read a
blank either way: put the questions back and stop.** ADR-0045 carries the case.

- **Q-A** `hc.log_artifact_read` exempt from `002:21` by ARGUMENT, not by
  threshold. *Recommended: KEEP the exemption.* → **RULING:**
- **Q-B** `002:21`'s reader clause (`prosrc like '%hc.visible_at(%'`) is
  UNDER-inclusive and that direction is nowhere argued. *Recommended: open an
  owed row against a named later unit; do not fix here.* → **RULING:**
- **Q-C** the four task-write definers now disagree about naming the freeze.
  *Recommended: LEAVE — the test is the fix.* → **RULING:**
- **Q-D** STP-03's citation amended by marker vs re-led. *Recommended: the
  marker stands.* → **RULING:**
- **Q-E** `OW-32` says "the 66 legs green at the 9B head", but 9B adds legs so
  that run cannot report 66. *Recommended: rule it a SUBSET condition and write
  that into the row.* → **RULING:**
- **Q-F** FRZ-17 is green at the pgTAP layer alone. *Recommended: single-layer
  stands.* → **RULING:**

## Q-G — NEW, AND IT IS THE ONE THAT OUTLIVES THE SLICE

The browser gate has not run since 8C and **this host cannot produce one**:
534 MB free against preflight's 1,229 MB floor on a fresh boot, `hc_clamd`
alone 1,001 MB, and stopping containers frees WSL memory `os.freemem()` never
sees. `OW-32` accepts a gate run at the 9B head — so **an owed row now depends
on a machine that cannot satisfy it**, with 9B's own gate mandatory on top.

The owner's stated direction, 2026-09-07: *"this computer doesn't have enough
memory and we will continue to run into issue. we need to do the best we can
until we can get to a staging environment on Vercel."* **Intent, not a ruling —
this session may not promote it to one by itself.**

**Q-G asks the owner to rule the gate's HOME** — what `OW-32` accepts if no
local gate ever runs, and whether 9B may close with browser evidence
outstanding. G9/G3 stand; CI is KEYLESS and never ran Playwright. → **RULING:**

## THE TASK — one ADR, the ledger moves it causes, then the PR

**1. `docs/adr/0046-round-32-rulings.md`** — rules **Q-A…Q-G verbatim as the
owner put them** and **stamps ADR-0045 `accepted`**, in ADR-0042's wording: the
stamp records the questions were RULED, not that a round was held. A ruling
that DEPARTS from its recommendation says so and carries a row.

**2. Only the ledger moves the rulings cause. Nothing turns green here.** Q-B
likely opens an owed row; Q-E likely rewrites `OW-32`'s acceptance cell; Q-G may
re-home it. **Cap 25 OPEN**; a row without an acceptance condition is a wish.
Re-tally with the lint's own parser (`ASSERTION_ID` filter, `STATUS_IDX = 6`)
and run `npx vitest run tests/lint/process.test.ts` before committing.

**3. The PR**, titled `[DO NOT MERGE without owner sign-off]`, body in
`docs/review/round-32-rulings-pr-body.md`. `gh pr create --body-file` works on
this token; `gh pr edit --body-file` does NOT — to edit, PATCH via
`gh api -X PATCH` and verify the length with `gh pr view`.

## ⏸ AT THE PR, STOP

**Fix nothing. Merge nothing. Build nothing.** 9B is its own fresh session and
starts only once Q-A…Q-G are ruled. The owner is sole merge authority.
