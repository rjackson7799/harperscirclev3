# Review — slice 7, round 24 (the 7A database increment)

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md`. Invoke the
`slice` skill — leg: **review**, read-only. Only what is below is new.

## STATE — settled, do not redo

- Branch `slice/7-destinations`; base `origin/main` @ `da51c00` (PR #25 —
  MOVED one docs-only merge past the `ba80ec0` the build kickoff named).
  Evidence head **`4cc3aa0`**; the docs head is the branch tip, and every
  commit after `4cc3aa0` is docs-only — verify with
  `git diff --name-only 4cc3aa0..HEAD -- . ':(exclude)docs'` (empty).
- Merged so far: the slice-7 plan (PR #23, RULED), the retune (PR #24), the
  7A kickoff (PR #25). **7A is BUILT and NOT merged.**
- Tier: **T1**, ruled at the plan gate (Q3) — 3–8 lenses, at least one from
  a different model family than the author.
- Bounds: migrations **4 of ≤ 6** spent (M1 `task_assignment` · M2
  `task_lifecycle` · M3 `document_audience` · M4 `record_reads`); M5
  RESERVED for this round's dispositions; M6 UNCONSUMED (Q2). Dependencies
  **0 of 0**, dev reserve UNSPENT.
- Evidence at `4cc3aa0`: reset exact **73** · pgTAP **1,761/1,761 across 69
  files** · concurrency **81/81 across 53 cases** (teed) · upgrade leg
  **69 → 73**, both suites on the upgraded DB · `db:verify` clean · vitest
  **982/982 across 79 files** · lint/typecheck/build clean (zero `Can't
  resolve`) · gitleaks 505 commits clean · browser gate **38 legs, NOT RUN
  at this head** (none of `app/ lib/ e2e/` moved — packet Q-G).
- Coverage rows moved: `## 7` opened (21 rows); pgTAP halves of TSK-01,
  TSK-02, DOC-03, DOC-04 and **SHR-02** green, app halves owed; LOG-03 opened
  never green. RCP-02, A11Y-09/10/11 unmoved.
- `docs/owed.md`: **6 OPEN of 25**; 7A took no ledger row; OW-04 names LOG-03.
- NOT activated: G4/G7 block · G9 OPEN · G3 open · `BAND_ARTIFACT_ALLOWLIST`
  EMPTY · SIG-01 NOT absorbed · G12-01 pending · `PROMPT_VERSION`
  `hc-6b-3+ff1435280a36f8eb` unmoved.
- Two vitest transients at the DOCS head (a hang; a 10 s live-DB hook
  timeout), the third run clean — recorded in the packet, not diagnosed.

## THE TASK

Read `docs/review/round-24-packet.md`, then ADR-0032, then the four
migrations and pgTAP 066–069 and concurrency cases 50–53. Attack the
packet's and the ADR's claims; rule on the eight pointed questions Q-A–Q-H
with the author's recommendations in front of you. Land findings VERBATIM in
`docs/review/round-24-findings.md` in `references/findings.md`'s shape,
addressed `R<n>/F-<m>` per lens. **Fix nothing.** A clean area reported
clean is a result. If a finding needs DDL, say so and stop — M5 is the
owner's.

## WHERE TO PUSH HARDEST

1. **M1's post-condition and the assignee's own vectors** (`20260829120001`,
   066:6–31). Construct a caller with manage who leaks the original through
   the written-for row, or an assignee who ends up holding a task she cannot
   see — 066:15/17/24 claim neither is possible.
2. **SHR-02 both ways** (066:32–45, concurrency 52): a share `unassign_task`
   revokes that it did not create, or a kept share that does not survive.
3. **M3's one transaction** (`20260829120003`, 068:12–19): a state where
   category, taint, the derived task and the dsc row disagree after a
   refusal — and whether the second `audience_changed` entry (Q-D) is a
   defect or a record.
4. **M4 never wider than RLS** (`20260829120004`, 069): a level, a name or
   a handle `circle_people` / `document_references` / `shares_for*` return
   that the policies would refuse — especially the null-vs-hidden line (Q-C)
   and zero-rows-not-error (Q-E).
5. **The two argued authorization lines**: the holder at `summary` (Q-A)
   and claim absent (Q-H).

## SLICE-SPECIFIC TRAPS

- `hc.reclassify_taint` writes its own `audience_changed` entry with actor
  "Reclassification"; count person entries by `actor_account_id`.
- 069's red commit message overstates its run (ADR-0032 D10); the green
  commit and the packet carry the correction — do not re-derive it.

## ⏸ AT THE GATE, STOP

Next leg: **dispositions (ADR-0033)** in a fresh session, then owner
sign-off. The owner is sole merge authority — merge commit, never squash.
**STOP at the gate.**
