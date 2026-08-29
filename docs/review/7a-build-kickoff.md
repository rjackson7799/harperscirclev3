# Build — slice 7, increment 7A (the database increment), round 24

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md`. Invoke the
`slice` skill — leg: **build**. Only what is below is new.

## STATE — settled, do not redo

- Branch `slice/7-destinations`: create it from `origin/main` @ **`ba80ec0`**
  (PR #24, the refreshed retune; merge commit, parents `75f6b1c` + `4ff90d7`).
  `main` MOVED since the plan was written (`7fdca4e` → `75f6b1c` → `ba80ec0`);
  nothing under `supabase/`, `lib/` or `app/` moved with it.
- Merged so far: the slice-7 plan (PR #23, **PLANNED — RULED**, Q1–Q6 SETTLED
  2026-08-28) and the process retune (PR #24). **The retune binds this build.**
- Tier for this increment: **T1**, ruled by the owner at the plan gate (Q3).
- Bounds: migrations **0 of ≤ 6** spent — M1 `task_assignment` · M2
  `task_lifecycle` · M3 `document_audience` · M4 `record_reads` · M5 reserved
  for round-24 dispositions · M6 NAMED for ADR-0027 D17 item 4's DDL exit
  **and NOT taken** (Q2: the window ACCEPTED). Expected close **5 of ≤ 6**.
  Dependencies **0 runtime**, dev reserve UNSPENT. `summary_text` stays `summary`.
- Evidence at the last green head, `ba80ec0` (CI): reset exact **69** · pgTAP
  **65 files**, Σ `plan(N)` = **1,622** by discovery · concurrency **49 cases**
  green, teed · vitest **982 / 79 files** by run · `db:verify` clean ·
  lint/typecheck/build clean · browser gate **38/38**, last run at PR #19
  (`3c39e23`), none since (ADR-0031: #20 changed no byte on the wire).
- Coverage rows moved by the plan: SHR-02 re-tagged **7** (pending);
  A11Y-09/10/11 opened pending tagged 7. This increment opens "## 7 — the
  four destinations" per the plan's table, flips **SHR-02 at the pgTAP layer
  only** (app half is 7B), and opens **LOG-03** never green. Nothing else.
- `docs/owed.md`: **6 OPEN of 25** (13 TAKEN · 1 RISK · 2 CLOSED). 7A takes no
  ledger row; OW-04's LOG-03 row opens here.
- NOT activated: G4/G7 block · G9 OPEN · G3 open · `BAND_ARTIFACT_ALLOWLIST`
  EMPTY · SIG-01 NOT absorbed · G12-01 pending. `PROMPT_VERSION`
  `hc-6b-3+ff1435280a36f8eb` does not move — no 7A unit touches `lib/ai/`.

## THE TASK

M1–M4 red→green per unit, **M1 `task_assignment` FIRST** (SHR-02, the oldest
pending row this slice reaches). The migration plan is the plan's Q2 table,
verbatim (`docs/review/slice-7-plan.md`, "Migration bound (Q2)"):
`hc.assign_task` / `hc.unassign_task` (M1) · `hc.complete_task` /
`hc.snooze_task` (M2) · `hc.document_audience` / `hc.recategorize_document` /
`hc.revoke_share` (M3) · `hc.circle_people` / `hc.document_references` /
`hc.shares_for` / `hc.shares_for_member` (M4). Every function `security
definer set search_path = ''`, owner `hc_internal`, EXECUTE to `authenticated`
alone, privilege closure asserted from the catalog.

pgTAP **066–069**, one file per migration, the named cases of the plan's "7A
test plan": M1's two paths driven both ways, unassign revoking exactly the
assignment's shares, the AI role holding no EXECUTE · M2's owner at `view`,
non-owner at `summary` refused, snooze's revision row naming the actor · M3's
both-domains refusal, the one-transaction move, the both-audience log entry ·
M4's count-never-name, coordinator-only invites, a frozen circle → members and
no levels. Concurrency, **the four named 7A cases**: assign vs `remove_member`
on one member · two coordinators re-categorising one document · unassign
racing a coordinator's keep · a freeze committing mid-assignment.

Exit: closure evidence at ONE declared head (reset exact 69 + N · pgTAP
counted exactly · concurrency teed · `db:verify` · upgrade leg · vitest by run
· the gate's total stated exactly if `app/ lib/ e2e/` moved), coverage rows
flipped never early, **ADR-0032** the deltas ADR (`Status: proposed`, target
150 lines), the round-24 packet, the PR titled
`[DO NOT MERGE without owner sign-off]`.

## WHERE TO PUSH HARDEST

1. **M1's taint computation.** The assignee's taint comes from HER OWN
   vectors, never the caller's; path 1's `{schedule}`-only copy is visible at
   `summary` and the original stays invisible to her. Construct the failure: a
   caller with `manage` leaking the original through the written-for row.
2. **`unassign_task` revokes exactly its shares — both ways.** A kept share
   survives; a foreign share (not `created_by_assignment_of = task`) is
   untouched. SHR-02 has been pending since 1D on exactly this.
3. **M3's one transaction.** Category, taint, `tsv_summary` and the
   `document_search_content` row move together or not at all, and the
   `audience_changed` entry carries BOTH audiences.

## SLICE-SPECIFIC TRAPS

- `hc.revise_object`'s task allowlist (`title, detail, due_on, due_zone`) is
  NOT widened; `status` and `owner_member_id` stay unaddressable through it.
- 064 pins `plan(32)` and 002 pins EXECUTE on every migration — re-pin the
  exact sets in the same commit as the DDL, never a commit later.

## ⏸ AT THE GATE, STOP

Next leg: the **round-24 packet** (`references/packet.md`), then a Tier-1
third-party review, dispositions (**ADR-0033**), owner sign-off. The owner is
sole merge authority — merge commit, never squash. **STOP at the gate.**
