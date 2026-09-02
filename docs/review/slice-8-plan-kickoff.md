# Plan gate — slice 8, round 28

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md` (§3 sets the
bounds). Invoke the `slice` skill — leg: **plan gate**. Only what is below is new.

## STATE — settled, do not redo

- `main` @ **`6025cfa`** — PR #34 merged 2026-09-02 by the owner: a merge
  commit, parents `18c362d` + `c859d55`, tree identical to the branch head, 74
  commits. **Slice 7 is DONE** (7A, 7B, 7C, then 7E/7D, round 27's fixes);
  rounds 24–27 CLOSED. Fetch first; if `main` has moved, the plan says so.
- Evidence head `bb40021`: the gate **58/58** in ONE complete run, JSON-borne,
  58 traces · vitest **1409 / 100 files** · `next build` 78 routes · lint and
  typecheck 0. DB layer at `ccd854b` (`supabase/` byte-identical since): reset
  exact **74** · pgTAP **69 files, Σ 1,809** · concurrency **82/82**. `db:verify`
  and the upgrade leg have NOT RUN since 7A — no DDL to exercise (ADR-0038 D1).
- **Bounds are FRESH and the plan gate SETS them** (the slice-4 Q3 precedent).
  Slice 7 closed migrations 5 of ≤ 6 (M6 UNCONSUMED), dependencies 0 — 13
  runtime / 15 dev, each with its licence; the dev reserve UNSPENT four slices.
- `docs/coverage.md`: 267 rows · green **250** · review 9 · pending **8**
  (FRZ-16b, RLS-11b, SIG-01, DEL-01, ADM-01, G12-01, UXA-03, LOG-03 — the last
  ACCEPTED RISK, never green). **Search's DB layer is already green at 1D**
  (SRCH-01/02, DSC-01, RLS-11a, PRF-04, PRF-06); no surface in `app/`, `lib/hc/`.
- `docs/owed.md`: **OPEN 7 / 25** — OW-08/09/10/12/13/14 (owner-track and
  pipeline homes; not this slice unless ruled) and **OW-26** (the access log's
  cursor, home slice 8). Burn-down: slice 7 opened 3, closed 13.
- Next ADR **0040** — 0039 is CLAIMED by open PR #35 (the PRD's voice); open
  PR #36 edits `docs/process/slice.md` — re-read the ritual if either merges
  first. Review **round 28** · `PROMPT_VERSION` hc-6b-3, `lib/ai/` untouched.
  NOT activated: G4/G7 block · G9 OPEN · G3 open · allowlist EMPTY · SIG-01 no.

## THE TASK

Write `docs/review/slice-8-plan.md` — **docs-only, CI green, not code** — and
take it to the gate. `docs/review/slice-7-plan.md` is the template: pointed
questions the owner rules verbatim; bounds with every reserve NAMED; an
increment table with a tier per increment and a coverage row per unit; the owed
intake priced; a NAMED-EXCLUSION list. Exit: rulings recorded verbatim, status
→ `PLANNED — RULED`, then the 8A build kickoff in its own session.

Scope to argue — TSD §11.1 row 8 (*"Search (§7): indexed, permission-filtered;
needs records to search"*) plus what slice 7 handed here by ruling:

1. **Search, the surface** — PRD §4.3.6, §4.7.3; TSD §7. The §7.2 query AS
   WRITTEN (the LEFT JOIN is the level decision — no second code path); results
   grouped by kind, labelled by subject, each linking to the object; §4.7.3's
   exact copy; no count of withheld results, no autocomplete, no prose answer.
   Rows: AC-DOC-1's search half, AC-DOC-4's app half, AC-TL-1's *"through
   search"*, AC-HOME-4.
2. **Claim / self-assignment** — ADR-0033 Q-H → ADR-0035 D9 → ADR-0036 Q-D
   *"RULED: slice 8."* Needs DDL: no 7A function lets a member below `manage`
   take a task. Price it as a migration; Tier 1.
3. **The three DDL items ADR-0038 D6 named and stopped**: `hc.shares_for`
   carrying the assignment task's live status (R2/F-4); a level-bound step-up
   `target_ref` (R3's dissent 1); share-includes-bytes (only if Q-A is
   re-ruled). Each a question: TAKE, DEFER with a home, or KILL with a reason.
4. **OW-26** — the log is `limit 300`, no cursor, no count. Take or re-home.
5. **6C, group review (AC-INBOX-5/13)** — slice-7 Q4(a): *"home a Care Inbox
   increment (6C) before slice 8."* Not built. Place it: before 8A, inside
   slice 8, or deferred with a home — an owner ruling either way.

## WHERE TO PUSH HARDEST

1. **The leak is in the machinery, not the list** (PRD §4.3.6): no count,
   snippet or suggestion over anything RLS did not return — one RLS-true read,
   counts over the rendered tree, and a leg from a `summary` member's LIVE
   context: a body-only term returns the same empty shape as a term nowhere.
2. **PRF-06 BREACHED once** (search_broad 3,490 ms vs 2,500, then rewritten).
   The surface's `AnswerBudget` and a measured latency row belong in the plan.
3. **Any migration re-opens the full DB closure set** after two slices without
   one — reset at the exact count, pgTAP re-pinned in the same commit,
   `db:verify`, the upgrade leg. Fail closed: an argued tier is Tier 1.

## SLICE-SPECIFIC TRAPS

- A new gated page fails `tests/app/page-gate.test.ts` until listed BOTH WAYS;
  a new leg joins `AUDIT_MANIFEST`; a new tree joins `RECORD_TREES` in
  `tests/lint/answer-budget.test.ts`. Per-file e2e budgets, never `workers: 1`.
- Two round-27 host traps await a traps.md ruling (215-line cap): Next 16's
  `.next/dev/lock` refuses a second `next dev` per directory on ANY port while
  preflight says SAFE; the ~1.2 GB-free gate ceiling. A plan question, not ruled.

## ⏸ AT THE GATE, STOP

The plan lands as a docs-only PR titled `[DO NOT MERGE without owner sign-off]`.
**The owner rules the questions** — an unanswered one defaults to NOT PLANNED and
the build does not start (ADR-0006). Next leg after the ruling: the **8A build
kickoff**, its own fresh session. **STOP at the gate.**
