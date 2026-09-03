# Build — slice 8, increment 8A (the database increment: claim + the level-bound step-up), round 28

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. Only what is below is new. The contract is `docs/review/slice-8-plan.md`:
"Migration bound (Q2)", "### 8A", "Coverage rows to open", "The owed ledger (Q6)", *Owner decisions*.

## STATE — settled, do not redo

- Branch `slice/8-claim-db`: `git fetch`, create it from `origin/main` @
  **`ccb4804`** — PR #39 merged 2026-09-02 (merge commit, parents `d583f0c` +
  `81cccb0`). `main` MOVED since the plan (`d583f0c` → `ccb4804`): only
  `scripts/`, `tests/lint/` and `docs/` moved; `supabase/`, `lib/`, `app/` and
  `e2e/` are byte-identical to the evidence head **`bb40021`**.
- Merged: the slice-8 plan (PR #38, **PLANNED — RULED**, Q1–Q7 SETTLED
  2026-09-02); `chore/preflight-dev-lock` (PR #39, Tier 3). OPEN, touching nothing
  here: PR #35 (claims **ADR-0039**), PR #36 (edits `slice.md`); next free ADR **0040**.
- Tier **T1**, ruled (Q1); the gate is unconditional (D19.14), total exact.
- Bounds: migrations **0 of ≤ 4** spent — M1 `task_claim` · M2
  `step_up_level_binding` (**Q3(a) SETTLED: TAKEN**, consumed with the ruling
  quoted in its commit) · M3 reserved for round-28 dispositions · M4 NAMED for
  a search index on a MEASURED PRF-06 breach at the 8B head. Expected close
  **2 of ≤ 4**: 74 → 76 migrations, pgTAP `070`/`071`. Dependencies **0
  runtime** (13/15 dev, reserve UNSPENT). `PROMPT_VERSION` does not move.
- Evidence at `bb40021`: reset exact **74** · pgTAP **69 files, Σ 1,809** ·
  concurrency **82/82** (54 cases), teed · gate **58/58 in 8 files** (0
  failed/flaky/skipped, 1,766 s, `.gate/e2e-run.json`) · vitest at `ccb4804`
  **1436 in 101 files by run** · **`db:verify` and the upgrade leg have NOT
  RUN since 7A** — both run here. Coverage at the plan: 267 rows · green 250 ·
  review 9 · pending 8. `docs/owed.md`: **7 OPEN of 25** (OW-08/09/10/12/13/14/26).
- NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist EMPTY ·
  SIG-01 NOT absorbed · G12-01 pending at `gate`.

## THE TASK

Commit this kickoff as `docs/review/8a-build-kickoff.md`. **First commit,
docs-only:** `docs/coverage.md` gains `## 8 — search, and the ruled intake`
with the plan's **13 rows verbatim** in §7's seven columns — TSK-05, STP-03,
SRCH-03..06, LOG-04 (`pending`, homed as the plan says), A11Y-12 `pending` 8,
GRP-01 `pending` **6C**, DEP-01 / EXE-01 / EXE-02 / BND-01 `pending` at Slice
**`gate`**; `docs/owed.md`: OW-26 → `TAKEN(8C)`, OW-09 → `PROMOTED(DEP-01)`,
OW-14 → `PROMOTED(EXE-01)`, OW-10/12/13 → `PROMOTED(EXE-02)`, OW-08 →
`PROMOTED(BND-01)` → **OPEN 0 / 25**, quoting *Owner decisions* Q3 and Q6.
`npm run test:app` validates both. Nothing turns green.

**M1 `task_claim` FIRST** — the plan's Q2 row verbatim: `hc.claim_task(p_task
uuid)` takes an unassigned, open task for the caller at `>= 'view'` through
`hc.visible_at`; refuses an owned task, `summary`, a non-reader and a frozen
circle in ONE shape; writes `owner_member_id`, `assigned_by`, `assigned_at`;
logs **`task_claimed`** with the claimant as actor; creates no share and no
instruction row; the AI has no path. `070_task_claim.sql` carries "### 8A"
unit 1's cases as ordered pairs, plus a concurrency case: two members claim
one task at once — one owner, one `task_claimed`. **M2**: `create or replace
function hc.set_grant` composing `target_ref` as `member:subject:domain:level`;
the mint site (`lib/hc/step-up.ts`, reached from the grant submit route)
passes the level it is about to confirm; `071_step_up_level.sql` mints for
`summary`, posts for `manage`, asserts the refusal.

Exit: closure at ONE head (the plan's "Completion recipe") · TSK-05 and STP-03
flipped at the **pgTAP layer only**, never early · **ADR-0040** (`Status:
proposed`) · the round-28 packet · PR `[DO NOT MERGE without owner sign-off]`.

## WHERE TO PUSH HARDEST

1. **The refusal does not discriminate.** Non-reader, owned, `summary`, frozen
   — one shape, driven as pairs; a refusal that differs is an oracle.
2. **No share, no instruction — asserted as SET EQUALITY** of shares and
   instruction rows before/after every path, never as the absence of an
   INSERT. `visible_at` runs on the claimant's OWN taint vectors.
3. **M2 binds completely and breaks nothing live:** a lower-level token cannot
   consume for a higher post; STP-01/02, GRT-01 and PPL-02's leg still hold.

## SLICE-SPECIFIC TRAPS

- Exact-set pins re-pinned IN the DDL commit: `001_schema_invariants` pins the
  `hc.log_event_types` code set (`task_claimed` widens it), `002` pins EXECUTE
  on every definer, `036_step_up` pins `target_ref` four times.
- Three migrations define `hc.set_grant`; the last `create or replace` wins,
  and a replaced body must restate every later ALTER (SECURITY DEFINER).
- Preflight now **BLOCKs on any live `next dev` in this directory** — stop the
  peer, never force; below **1.2 GiB free** the gate dies on spawn, not on
  assertions (`docs/ops/e2e-local-gate.md`, Prerequisites). `test:db` only on
  a clean `db:reset` at the **exact** new count (76).

## ⏸ AT THE GATE, STOP

Next leg: the **round-28 packet**, a Tier-1 third-party review, dispositions
(ADR-0040), owner sign-off, merge commit never squash. 8B does not wait for
this merge; 8C does. **STOP at the gate.**
