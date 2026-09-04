# 9A (continued) — the browser gate, then the closing docs commit

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. Only what is below is new. **This session FINISHES 9A. It does not
start a round and it does not start 9B.** Commit this brief as
`docs/review/9a-gate-kickoff.md` FIRST.

## STATE — settled, do not redo

- Branch **`slice/9-freeze-guard` @ `efc2164`**, five commits past `main` =
  **`1eab0e5`** (a merge whose second parent is `d801778`; **CI on it verified
  `success`**). Base was unmoved at hand-off — **re-verify with a fetch.**
- **M1 IS BUILT AND GREEN. Do not rebuild it and do not re-argue it.**
  `20260904120001_claim_task_freeze_guard`: a `create or replace` over
  `hc.claim_task` adding the explicit `state in ('open','unresolved')` test
  against `public.freezes`, placed ABOVE the level test. `20260903120001` is
  untouched. Migrations 76 -> **77**; pgTAP files stay **71**.
- Already earned at `efc2164`, all green: reset exact **77** · pgTAP **71 files
  Sigma 1,871 PASS** · concurrency **83/83** · `db:verify` clean · lint /
  typecheck / build clean · vitest **1,563/1,563** in 106 files.
- **THE BROWSER GATE IS THE ONLY THING MISSING.** The prior attempt reached leg
  **7 of 66** and starved: `[WebServer] Error: Connection terminated due to
  connection timeout` at `lib/db/request-role.ts:158` (`getPool().connect()`),
  with **237 MB free against preflight's own 1.20 GiB floor**. That is the
  recorded host ceiling — **not a product failure and not a finding**; no
  product assertion failed. `.gate/e2e-run.json` was never written, so there is
  no gate record to preserve. **That run may still be alive: check for it and
  for orphaned `webServer` children before re-running** (traps section 2), and
  check the stack lease `%TEMP%\hc-stack-54342.lock`.
- Ledgers at `efc2164`: coverage **289 rows · green 258 · review 9 · pending
  22**; owed **OPEN 1 / 25** (OW-28 only, 9B's) · TAKEN 5 · RISK 1 · CLOSED 18 ·
  PROMOTED 6 · 31 rows.
- Bound: **M1 spent, 1 of <= 4.** M2 CLOSED UNCONSUMED (ADR-0044 D6) · M3
  reserved for rounds 32/33 · M4 reserved and NAMED for 9B. **Spend nothing.**
- Next free ADR **0045**. NOT activated: G4/G7 block · G9 OPEN · G3 open ·
  G12-01 `pending` at `gate`. PRs #35 and #36 open, neither yours.

## THE TASK — two things, in this order

**1. The browser gate at `efc2164`, UNCONDITIONALLY** (ADR-0033 D19.14: a
kickoff may not narrow the evidence set, and this one does not). Ask the owner
to close VS Code and Chrome FIRST, then read preflight's memory line: **if it
still reports below 1.20 GiB, say so and STOP** rather than burning thirty
minutes on a run that will die on spawn. Expect **66 legs in 9 files** — 9A
changes no surface, so 8C's count should stand. Read the tally from
`.gate/e2e-run.json`, never from console text and never from `$?`.

**2. The closing docs commit at that head. Nothing else. Then STOP.**

- `docs/coverage.md` **FRZ-17**: `pending` -> **green**, Slice cell `8 -> 9` ->
  **`9A`**, evidence appended. Both halves of its own GREEN WHEN are met and the
  cell must say which: the guard ABOVE the level test (below it,
  `least(result, cap)` routes around it), and the pgTAP pair WITH its control —
  `070:43` a carve-out coordinator refused under an **`unresolved`** freeze ·
  **`070:44` her READ still resolving at exactly `view`** · `070:45` the lift.
  Cite the RED at `71e3bad`: *have* her member row, *want* `claim_refused`.
- `docs/owed.md`: **OW-27, OW-29, OW-30, OW-31 -> `CLOSED(<the 9A head sha>)`**;
  tally line **TAKEN 5 -> 1, CLOSED 18 -> 22**, and **OPEN stays 1 / 25** —
  OW-28 is 9B's and does not move.
- Re-tally with `tests/lint/process.test.ts`'s own parser, never by eye
  (`STATUS_IDX = 6`), and run `npx vitest run tests/lint/process.test.ts`
  before committing.
- **Nothing else turns green.** The seven `## 9 — Home` rows stay `pending`;
  they are 9B's, and HOME-06 is never green in this slice.

## WHAT THE BUILD FOUND, THAT YOU INHERIT

1. **`002:21` caught a function no finding had named** — `hc.log_artifact_read`
   also admits at `>= 'view'` and writes. It is pinned EXEMPT with an argument
   rather than a threshold: its only write is an `hc.log` audit append recording
   a PERMITTED read, and refusing it under a freeze would not stop the read, it
   would make the read UNLOGGED. If round 32 disputes that, it is an argument,
   not a defect.
2. **`007:52` is a shipped exact-set pin and it caught the build** — 19 -> 20.
   It rides M1's own commit, which was deliberately amended so that no commit in
   this history is red on a shipped pin; the message says so plainly.
3. **The OW-29 probe's whole-file form misleads, and `071`'s header now says
   so.** Cases 7 and 11 look non-discriminating there only because 4 and 9
   escalating turns their posts into LOWERS, which need no token. Probe from the
   fixture.

## AFTER THE DOCS COMMIT, STOP

The **round-32 packet** is its own fresh session, and **9B** after it. The owner
is sole merge authority; no session merges its own work.
