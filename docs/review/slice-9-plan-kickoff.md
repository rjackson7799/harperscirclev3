# Slice 9 — Home. The plan gate.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**plan gate**. Only what is below is new. Commit this brief as
`docs/review/slice-9-plan-kickoff.md` FIRST.

## STATE — settled, do not redo

- **Slice 8 is CLOSED.** `main` = **`7cf16ec`** (PR #43, a true merge commit,
  parents `7ef2a69` + `56e8b36`; **CI on `main` SUCCESS** — run 33802384228,
  4m39s). Branch from `origin/main` @ `7cf16ec` after a fetch:
  **`docs/slice-9-plan`**.
- **Slice 9 is Home** — TSD §11.1 row 9, *"Day-one card, then the router.
  Last, because it summarises everything before it"*; PRD §4.7, AC-HOME-*.
  **No `HOME-` row exists yet** — this plan opens all of them.
- Slice 8's close-out ruled all 21 questions of rounds 28/29/30 and stamped
  **ADR-0040, ADR-0041 and ADR-0042 `accepted`** (ADR-0043; the table is
  `docs/review/slice-8-dispositions.md`). **Those are settled rulings — file a
  dissent, not a finding.**
- Ledgers: `docs/coverage.md` **281 · green 258 · review 9 · pending 14**;
  `docs/owed.md` **OPEN 1 / 25** (OW-27). Next free ADR **0044** (0039 is
  claimed by the unmerged PR #35). Slice 9's first review round is **31**.
- Evidence, merged and NOT to be re-earned: 8A `4d166c0` (76 migrations ·
  pgTAP 71 Σ 1,863 · concurrency 83/83 · `db:verify` clean) · 8B `3bd8f52`
  (p95 273 ms) · 8C `2f2c509` (gate 66/66 in 9 files · vitest 1,563/106).
  Slice 8's bound closed at **2 of ≤ 4**.
- Open, not this session's unless you rule them in: **PR #35** (ADR-0039),
  **PR #36**. NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist
  EMPTY · SIG-01 NOT absorbed (seventh slice) · G12-01 `pending` at `gate` ·
  LOG-03 never green.

## THE TASK — the plan gate. Docs-only, ONE PR.

Produce `docs/review/slice-9-plan.md` per `docs/process/slice.md` §3. It must:

1. **Set the migration bound and NAME every reserve.** The bound does not
   exist until this gate sets it; anything past it is a recorded owner
   amendment made *before a line is written*.
2. **Rule the tier per unit**, and apply the split rule — no increment may
   hold both a T1 and a T3 unit.
3. **Rule FRZ-17 / OW-27 into the bound as a NAMED M-slot, or out** — below.
4. Open slice 9's coverage rows `pending`, tagged to their increments, to be
   written by the FIRST build commit and **not** by this plan's PR.
5. Triage `docs/owed.md` and state the burn-down arithmetic, not just the cap.
6. Put the pointed questions **with recommended answers**. An unanswered
   question defaults to NOT PLANNED and the build does not start (ADR-0006).

## WHERE TO PUSH HARDEST

1. **FRZ-17 / OW-27 is the one inherited obligation, and the fix is DDL.**
   `hc.claim_task` admits at `hc.visible_at >= 'view'` and carries no freeze
   test of its own; FRZ-13's carve-out caps a non-objected-to coordinator AT
   `view` during an **unresolved** freeze — so she can claim while the circle
   is frozen. Its three siblings (`assign_task`, `complete_task`,
   `snooze_task`) each carry an explicit `state in ('open','unresolved')` test
   that no cap can lower. **The acceptance condition is the guard PLUS a pgTAP
   case pinning her refusal while her READ through the carve-out still
   resolves.** Rule it into this bound or amend it out — carrying is not a
   third option, and the row is `pending`, never green, until it lands.
2. **ADR-0043 D6 recommends this gate open with a commissioned adversarial
   pass over 8A's M1 and M2 — M2 especially**, the four-part step-up binding
   nobody outside its author has read. None of slice 8's three rounds was
   held; the stamps record that questions were RULED, not that anyone attacked
   the code. A different leg and a different session, BEFORE 9A's build.
   **Rule it in or out, on the record.**
3. **Home is the last surface and it summarises everything before it.** That
   makes it the one place a permission mistake is a *composition* across nine
   surfaces rather than one read. Decide early: day-one card and router, one
   increment or two, and what may the router say about objects the reader
   cannot open? **G12 is a redesign if found late — build the legs in.**
4. **The four `gate` rows and G12-01 do not go green here either** unless this
   gate rules otherwise with the instrument NAMED.

## TRAPS NEW TO THIS SLICE

- CI is forcing `checkout@v4`, `setup-node@v4` and `upload-artifact@v4` onto
  Node 24 (Node 20 deprecated on runners). Non-blocking today. **Decide here**
  whether the bump is slice 9's or its own chore PR.
- `docs/coverage.md`, `docs/owed.md`, `docs/adr/` and `docs/TSD.md` are read by
  `tests/lint/process.test.ts` and by **no other test in the tree** — a
  docs-only change is fully verified by that one file alone.
- The kickoff cap is 90 by `split(/\r?\n/).length` on TRACKED
  `docs/review/*kickoff.md`. Stage EXPLICIT paths, never `git add -A`.

## ⏸ AT THE PR, STOP

Owner rules the questions; status → `PLANNED — RULED`. **Then 9A's build
kickoff is its own session.**
