# Round 32 — the 9A packet

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**packet** — read `references/packet.md` and no other reference file. Commit
this brief as `docs/review/round-32-kickoff.md` FIRST.

## STATE — settled, do not redo, do not re-argue

- Branch **`slice/9-freeze-guard` @ `f05afa3`**, nine commits past `main` =
  **`1eab0e5`**. Base was unmoved at hand-off — **re-verify with a fetch.**
- **The evidence head is `efc2164`.** Every product claim belongs to it; the
  four commits above it are docs-only (`e13a8fb`, `5259180`, `319f558`,
  `f05afa3`).
- **9A IS BUILT AND CLOSED. Do not rebuild it, do not fix anything, do not
  re-earn its evidence.** M1 = `20260904120001_claim_task_freeze_guard`: the
  explicit `state in ('open', 'unresolved')` test against `public.freezes`,
  read straight from the table and placed ABOVE the level test (:138–140
  against :155). Migrations **77**; pgTAP files **71**.
- Green at `efc2164`: reset exact 77 · pgTAP **71 files Σ 1,871 PASS** ·
  concurrency 83/83 · `db:verify` clean · lint / typecheck / build clean ·
  vitest **1,563/1,563** in 106 files.
- Ledgers: coverage **289 rows · green 259 · review 9 · pending 21**; owed
  **OPEN 2 / 25** · TAKEN 1 · RISK 1 · CLOSED 22 · PROMOTED 6 · 32 rows. Both
  re-tallied with `tests/lint/process.test.ts`'s own parser, never by eye.
- Bound: **M1 spent, 1 of ≤ 4.** M2 CLOSED UNCONSUMED · M3 held for rounds
  32/33 · M4 NAMED for 9B. **Spend nothing.** Next free ADR **0045**.
- **Tier 1** — 9A ships a migration and changes a definer body.

## THE GATE IS DEFERRED BY OWNER RULING — DECLARE IT, DO NOT RUN IT

Slice-9 plan **Q10** (owner amendment, 2026-09-06, at `f05afa3`) defers 9A's
66-leg browser gate into **9B's** run. `docs/owed.md` **OW-32** OPEN carries the
debt; acceptance is the 66 legs green in 9 files at the 9B head.

**The packet's evidence block must say the gate is UNRUN** — never imply it
passed, never leave it to be noticed — and attach the classified red: the
2026-09-04 run, **66 legs, 62 passed · 4 unexpected · 0 flaky · 0 skipped**,
ruled host starvation on four supports, its record and all four traces
preserved in session `67ba45f7…`'s scratchpad under `gate-efc2164/`.
**Do not re-diagnose it and do not re-run it.** The host cannot meet
preflight's 1.20 GiB floor with a session open: 534 MB free on a fresh boot
with the stack up and `hc_clamd` down, and `hc_clamd` alone holds 1,001 MB.

## THE TASK — three artifacts, then STOP

**1. `docs/review/round-32-packet.md`** at `efc2164`: what changed, what it
asserts, and what a reviewer should attack first — the guard's PLACEMENT above
the level test (below it, FRZ-13's `least(result, cap)` routes around it);
`002:21`'s catalog-driven freeze invariant and its EXEMPT set, where
`hc.log_artifact_read` is pinned exempt by ARGUMENT and not by threshold (its
only write is an audit append recording a PERMITTED read; refusing it would
make the read UNLOGGED); and the `071` relabel, whose evidence is a probe
rather than a passing test.

**2. The deltas ADR — `docs/adr/0045-*.md`**, `proposed`, carrying what 9A
changed since ADR-0044 and the pointed questions the reviewer is to rule.
**An unanswered pointed question defaults to NOT PLANNED** (ADR-0006).

**3. The PR**, titled `[DO NOT MERGE without owner sign-off]`, body in
`docs/review/round-32-pr-body.md`. `gh pr edit --body-file` FAILS on this
token — PATCH via `gh api -X PATCH` and verify the length with `gh pr view`.

## ⏸ AT THE PR, STOP

**Fix nothing. Merge nothing. Hold no review.** The review is its own fresh
session and its findings land VERBATIM before anything is argued. The owner is
sole merge authority; no session merges its own work.
