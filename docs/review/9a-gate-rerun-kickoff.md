# 9A (continued, second attempt) — the gate re-run, then the closing docs commit

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. `docs/review/9a-gate-kickoff.md` STILL STANDS — read it, do not
restate it. **This session FINISHES 9A, starting no round and no 9B.** Commit
this brief as `docs/review/9a-gate-rerun-kickoff.md` FIRST.

## STATE — settled, do not redo

- Branch **`slice/9-freeze-guard` @ `e13a8fb`**, six commits past `main` =
  **`1eab0e5`** (CI on it verified `success`). `e13a8fb` is DOCS-ONLY; the code
  head is **`efc2164`** and every product evidence claim belongs to it. Base was
  unmoved at hand-off — **re-verify with a fetch.**
- **M1 IS BUILT AND GREEN. Do not rebuild it and do not re-argue it.** The guard
  sits at `20260904120001`:138–140, ABOVE the level test at :155 — verified at
  hand-off. Migrations **77**; pgTAP files stay **71**.
- Green at `efc2164`: reset exact 77 · pgTAP **71 files Σ 1,871 PASS** ·
  concurrency 83/83 · `db:verify` clean · lint / typecheck / build clean ·
  vitest **1,563/1,563** in 106 files.
- Ledgers UNMOVED: coverage **289 rows · green 258 · review 9 · pending 22**;
  owed **OPEN 1 / 25** · TAKEN 5 · RISK 1 · CLOSED 18 · PROMOTED 6 · 31 rows.
  Both re-tallied with `tests/lint/process.test.ts`'s own parser, not by eye.
- Bound: **M1 spent, 1 of ≤ 4.** M2 CLOSED UNCONSUMED · M3 rounds 32/33 · M4
  NAMED for 9B. **Spend nothing.** Next free ADR **0045**.

## THE GATE RAN. IT IS RED, IT IS CLASSIFIED — DO NOT RE-DIAGNOSE IT

**66 legs, 9 files, 3,197 s: 62 passed · 4 unexpected · 0 flaky · 0 skipped**,
read from `.gate/e2e-run.json`. The record and all four failing traces are
preserved at `…\scratchpad\gate-efc2164\`; `.gate/` holds the rotated copy.

| Leg | 8C green | Now | Shape |
|---|---|---|---|
| a11y:537 record surfaces at 390px | 15 s | 302 s | timeout, budget 300 s |
| documents:383 DOC-02 machine-read sibling | 10 s | 425 s | timeout, budget 420 s |
| documents:460 DOC-04 share / unshare | 55 s | 421 s | timeout, budget 420 s |
| record:304 TSK-01 cross-taint | 28 s | 63 s | assertion on `main` |

**NOT a product failure and NOT a finding**, on four supports, none a bare
resource number: (1) `git diff 1eab0e5..efc2164` touches **no `app/`, no
`components/`, no `lib/` file**, so no browser surface differs from the green
run; (2) the **62 legs green in BOTH runs** cost 976 s then and 1,515 s now, a
uniform **1.55x**; (3) the one assertion failure is timing — no 500 in 1,662
requests, the assign page returned **HTTP 200 after 34.3 s** and rendered the
app's own budget-exhaustion fallback, so it saw graceful degradation and not
wrong content; (4) **clamd is ruled OUT** — 0.01 % CPU, no reload in the window.

What differed from 8C: that run had the precondition met (~1.2 GiB freed); this
one ran against VS Code 751 MB + ChatGPT 211 + WebView2 172 + Chrome 164 + Notion
100, free memory hit **158 MB**, and Windows itself failed a `Get-Process` with
`800705af` — the commit-charge limit.

## THE TASK — two things, in this order

**1. THE ONE PERMITTED RE-RUN, AND IT IS UNSPENT** (traps §1: a failed leg is
re-run once, and only after classifying it from the retained trace — the
classification above IS that work, and it is done). Have the owner free ~1.2 GiB
FIRST — ChatGPT, Edge WebView2, Chrome, Notion; **never VS Code**, which ends the
session. Then read preflight's memory line: **below 1.20 GiB, say so and STOP.**
Expect **66 legs in 9 files**. Read the tally from `.gate/e2e-run.json`, never
console text, never `$?`. **A second red in the same shape is an owner ruling.**

**2. The closing docs commit on `efc2164`'s evidence. Nothing else. Then STOP.**

- `docs/coverage.md` **FRZ-17** (line 655): `pending` → **green**, Slice cell
  `8 → 9` → **`9A`**, evidence appended. Both halves of its own GREEN WHEN are
  met and the cell must say which: the guard ABOVE the level test (below it,
  `least(result, cap)` routes around it), and the pgTAP pair WITH its control —
  `070:43` a carve-out coordinator refused under an **`unresolved`** freeze ·
  **`070:44` her READ still resolving at exactly `view`** · `070:45` the lift.
  Cite the RED at `71e3bad`: *have* `c5d4685f…` her member row, *want*
  `claim_refused`.
- `docs/owed.md`: **OW-27, OW-29, OW-30, OW-31 → `CLOSED(efc2164)`** — the 9A
  head, which is what OW-27's own acceptance cell says (*"earned at the 9A
  head"*) and where all four artifacts exist together. Each row's EVIDENCE cell
  names the commit that landed it (`71e3bad` RED · `5bd2b7b` GREEN · `efc2164`
  the `071` relabel), so the status carries the head and the evidence the commit.
  Tally line **TAKEN 5 → 1, CLOSED 18 → 22**; **OPEN stays 1 / 25** — OW-28 is
  9B's and does not move.
- Re-tally with the lint's own parser (`STATUS_IDX = 6`), never by eye, and run
  `npx vitest run tests/lint/process.test.ts` before committing.
- **Nothing else turns green.** The seven `## 9 — Home` rows stay `pending`;
  they are 9B's, and HOME-06 is never green in this slice.

## ⏸ AFTER THE DOCS COMMIT, STOP

The **round-32 packet** is its own fresh session, and **9B** after it. The owner
is sole merge authority; no session merges its own work.
