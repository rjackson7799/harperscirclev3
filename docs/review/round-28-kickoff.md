# Review — slice 8, round 28 (the 8A database increment: claim + the level-bound step-up)

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md`. Invoke the
`slice` skill — leg: **review**, read-only. Only what is below is new.

## STATE — settled, do not redo

- Branch `slice/8-claim-db`; base `origin/main` @ `ccb4804` (PR #39, the Q7
  precondition). Evidence head **`4d166c0`**; the docs head is the branch
  tip, and every commit after `4d166c0` is docs-only — verify with
  `git diff --name-only 4d166c0..HEAD -- . ':(exclude)docs'` (empty).
- Merged so far: the slice-8 plan (PR #38, RULED Q1–Q7), the chore (PR #39).
  **8A is BUILT and NOT merged.** PR #35 (ADR-0039) and #36 may still be open.
- Tier: **T1**, ruled at the plan gate (Q1) — 3–8 lenses, at least one from
  a different model family than the author.
- Bounds: migrations **2 of ≤ 4** spent (M1 `task_claim` · M2
  `step_up_level_binding`, the consumed reserve, Q3(a)); M3 RESERVED for
  this round's dispositions; M4 RESERVED and NAMED (a MEASURED PRF-06
  breach at the 8B head). Dependencies **0**, dev reserve UNSPENT.
- Evidence at `4d166c0`: reset exact **76** · pgTAP **1,863 across 71
  files** · concurrency **83/83 across 55 cases** (teed) · `db:verify`
  clean · upgrade leg **74 → 76**, both suites on the upgraded DB · vitest
  **1439 across 101 files** · lint/typecheck/build clean · gitleaks 651 commits scanned, no leaks found · browser
  gate **58/58 in 8 files, 1,284 s — 0 unexpected · 0 flaky · 0 skipped** (config-borne JSON; `e2e/` byte-identical to base).
- Coverage rows moved: `## 8` opened at `4bdbdbd` (13 rows, all pending);
  **TSK-05 and STP-03 green at the pgTAP layer only**; GRT-01, STP-01,
  STP-02 amended with a marker. `docs/owed.md`: **OPEN 0 / 25** (OW-26
  TAKEN(8C/unit 2), six PROMOTED).
- NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist EMPTY ·
  SIG-01 NOT absorbed · G12-01 pending · `PROMPT_VERSION` unmoved.

## THE TASK

Read `docs/review/round-28-packet.md`, then ADR-0040, then the two
migrations, pgTAP 070 and 071, the 001/002/038 re-pins, concurrency case
55, and the two app files under `people/[member]`. Attack the packet's and
the ADR's claims; rule on the seven pointed questions Q-A–Q-G with the
author's recommendations in front of you. Land findings VERBATIM in
`docs/review/round-28-findings.md` in `references/findings.md`'s shape,
addressed `R<n>/F-<m>` per lens. **Fix nothing.** A clean area reported
clean is a result. If a finding needs DDL, say so and stop — M3 is the
owner's.

## WHERE TO PUSH HARDEST

1. **The refusal does not discriminate** (`20260903120001`, 070:13–35).
   Construct a caller for whom the string, the timing, or a side effect
   tells owned from hidden from frozen — 070:31 and 34 claim one string.
2. **No share, no instruction — as set equality** (070:10–11, 23–24,
   36–38). Find a path through `claim_task` that mints, marks or revokes a
   share, or opens/closes an instruction; the shared-task claim (070:22) is
   the likeliest place.
3. **The claimant's OWN vectors, as the task STANDS** (070:17–22): a member
   who claims what `tasks_select` would hide from her, or who cannot read
   what she just claimed (070:12, 25).
4. **M2 binds completely and breaks nothing live** (`20260903120002`, 071;
   038 re-pinned; the page and route): a token that crosses levels, a
   lower that now demands a token, an in-flight token the ruling forgot,
   or a page/route disagreement on the four-part string.
5. **The two argued lines**: the freeze unnamed (Q-A) and *hers already*
   refused (Q-B); and whether STP-03's app half is earned by the PPL-02 leg
   inside the complete run (Q-F).

## SLICE-SPECIFIC TRAPS

- `hc.visible_at` holds no `authenticated` EXECUTE and an ACL denial
  segfaults this PG17 image: 070 reads levels as postgres through
  `hc.ctx_for`; do the same in any probe.
- 041 single-file on a shared database aborts on `outbound_mail` residue —
  drift, not a defect; the clean-leg run is the record (ADR-0040 D8).
- The case-55 commit's 83/83 was measured on the M1-only database (Q-E).

## ⏸ AT THE GATE, STOP

Next leg: **dispositions (ADR-0041)** in a fresh session, then owner
sign-off. The owner is sole merge authority — merge commit, never squash.
**8B does not wait for this merge; 8C does. STOP at the gate.**
