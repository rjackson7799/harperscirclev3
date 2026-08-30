# Build — slice 7, increment 7B (Tasks + Timeline, the record app increment), round 26

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md`. Invoke the
`slice` skill — leg: **build**. Only what is below is new.

## STATE — settled, do not redo

- Branch `slice/7b-record-app` (plan Q1): create it from `origin/main` @
  **`abb0398`** — PR #26, **7A merged 2026-08-30** (merge commit, parents
  `da51c00` + `aa7c827`): **74 migrations** (M1–M5), **69** pgTAP files;
  nothing under `app/`, `lib/` or `e2e/` moved in 7A.
- Merged: the plan (#23), the retune (#24, binding), 7A (#26) with ADR-0033,
  the 42 fixes and ADR-0034 (#27–#29). **Rounds 24–25 CLOSED**: 42 FIXED · 2 NOTED.
- Tier **T2** (Q3): **one deltas doc (ADR-0035, target 150 lines) + one
  dispositions TABLE**, one reviewer session. Person-facing: **the gate runs**.
- **Round numbering moved**: round 25 went to ADR-0034, so 7B's review is
  **round 26**, 7C's **27**. `docs/coverage.md` §7 and UXA-04 still say 25/26 —
  correct them in the close-out coverage commit, not before.
- Bounds: migrations **NONE** (5 of ≤ 6 spent, M6 unconsumed; nothing under
  `supabase/` moves). Dependencies **0 runtime** (13 / 15 dev at `abb0398`,
  verified), reserve UNSPENT. `PROMPT_VERSION` `hc-6b-3` does not move.
- Evidence at `abb0398` (CI green): reset exact **74** · pgTAP **69 files**,
  Σ `plan(N)` **1,809** · concurrency **54 cases / 82**, teed · vitest **982 /
  79** by run · gate **38/38** at `986ef6e`. New legs count against **38**.
- Coverage flips here: TSK-03/04, TLN-01/02/03, GTE-01, A11Y-09, NAV-01's 7B
  half, and the **app halves** of TSK-01/02 and SHR-02. RCP-02 flips at 7C.
- `docs/owed.md`: **6 OPEN of 25** (13 TAKEN · 1 RISK · 2 CLOSED). 7B holds
  **nine** TAKEN rows — OW-01, 02, 11, 15, 17, 18, 20 in **B1**; OW-03, 06 in
  **B4** — each flipped `CLOSED(sha)` by the build; quota measured at close.
- NOT activated, unchanged: G4/G7 block · G9 OPEN · G3 open · the band
  allowlist EMPTY · SIG-01 NOT absorbed · G12-01 pending. **Round 24 changed
  the functions 7B calls** (ADR-0033 D19):
  `assign_task` refuses an assignee without a deliberate `log`-or-higher grant
  (D19.7) — *not offered* is computed from `hc.circle_people` the same way; an
  instruction row is never assigned or unassigned; `complete_task` on an
  original CANCELS its instruction, on an instruction completes the original
  (D19.4), and revokes the assignment's shares (D19.6); the objected-to member
  is refused under their own finding (D19.1); `freeze_active` names members only.

## THE TASK

**B1 FIRST**: the floors made honest (`tasks/page.tsx:27` selects `state`, the
column is `status`; read `error`, render an error state never an empty one;
every row subject-labelled with its `ProvenanceLine`) and the gate fixed —
`unavailable` renders unavailable (503, `retry-after`, `private, no-store`) at
the ten pages and five form routes, never a sign-in; `confirm` never claims
success for a pass that did not run; `tests/hc/review.test.ts` and the generic
`q.query<R>` row boundary before any new read; `timestamp-boundary` extended
to the class. Then **B2 Tasks**, **B3 Timeline**, **B4** legs, manifest, the
receipt's first two links, an `AnswerBudget` on every 7B page and POST — the
plan's 7B table, verbatim (`docs/review/slice-7-plan.md`, "### 7B").

The record legs: **tasks** — assign in two taps, the sibling's source resolves
· **cross-taint** — not offered where she cannot see the subject; the sentence
and exactly two paths where she can; path 1 readable and the original invisible
FROM HER LIVE CONTEXT · **complete / snooze** with the count · **unassign**
withdraws the share, checked from her context · **timeline** — two subjects,
the switch, the combined view labelled, a manual event with its provenance, the
creation entry first · a11y: *"the record surfaces … audited at 390px"* and the
A11Y-09 keyboard leg; A11Y-07's `if (factCount > 1)` becomes an assertion.

Exit: the Tier-2 closure set at ONE declared head — reset exact 74 · pgTAP and
concurrency counted, teed · `db:verify` · upgrade leg · vitest by run · the gate's
new total (`docker stats` first; leg 38's duration recorded) · lint/typecheck/build
solo · gitleaks · coverage never early · ADR-0035 · the PR body checked in.

## WHERE TO PUSH HARDEST

1. **The point of selection agrees with the database**: build the case where
   `circle_people` offers a member `assign_task` refuses (hidden ×5 is *not
   offered*; one `log` grant is), or the reverse.
2. **The gate under an auth outage** — never a 302 to `/sign-in` on
   `unavailable`, at every page and form route, before B2 adds pages.
3. **Counts over the rendered tree, post-filter**; a caregiver's first open
   never blank; nothing merges silently; `memory` never an empty filter.

## SLICE-SPECIFIC TRAPS

- A cancelled instruction (D19.4) must not render as open work. Path 2 needs
  the §5.7 step-up bound to `share_object` + `task:<id>+document:<id>`.
- `e2e/audit-manifest.ts` is pinned both ways: a new `page.tsx` fails vitest
  until its leg is named. The gate needs a REAL `node_modules` (Turbopack
  refuses the junction); on the 8 GB host expect run-1 timeouts — one re-run.

## ⏸ AT THE GATE, STOP

Next leg: the **round-26 review** (Tier 2 — one reviewer session, a dispositions
table), owner sign-off, merge commit never squash. **STOP at the gate.**
