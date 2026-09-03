# [DO NOT MERGE without owner sign-off] Slice 8A — claim + the level-bound step-up, the database increment

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash — `git merge --no-ff`.** An unanswered item defaults to NOT MERGED. **Round 28 has not run**; the packet is `docs/review/round-28-packet.md` (Tier 1 — the full closure set), and the deltas ADR that is its spine is `docs/adr/0040-8a-claim-db-deltas.md` (`Status: proposed`). The review kickoff is `docs/review/round-28-kickoff.md`.

### What this branch delivers

The plan's "### 8A" (`docs/review/slice-8-plan.md`, Q1–Q7 SETTLED 2026-09-02), from `origin/main` @ `ccb4804` (PR #39, the Q7 precondition), red→green per unit with the failure signature in every red commit. **Migrations: 2 of ≤ 4** — M1 `20260903120001_task_claim`, M2 `20260903120002_step_up_level_binding` (**the consumed reserve, Q3(a), its ruling quoted in `05faed4`**); M3 stays reserved for this round's dispositions, M4 reserved and NAMED for a measured PRF-06 breach at the 8B head. **Dependencies: 0** (13/15 dev, the reserve UNSPENT). `PROMPT_VERSION` hc-6b-3 does not move. Nothing is production-activated.

- **FIRST, docs-only — the ruled intake (`4bdbdbd`).** `docs/coverage.md` gains `## 8 — search, and the ruled intake` with the plan's thirteen rows verbatim, every one `pending`; `docs/owed.md` goes **OPEN 7 → 0 / 25** by OW-26 `TAKEN(8C/unit 2)` and six `PROMOTED` exits (OW-09 → DEP-01, OW-14 → EXE-01, OW-10/12/13 → EXE-02, OW-08 → BND-01), each quoting *Owner decisions* Q3(b)/Q6. `process.test.ts` 29/29.
- **M1 `hc.claim_task(p_task)`** — ONE argument. The caller takes an unassigned, open task for herself at `>= view` through `hc.visible_at` on her OWN vectors, asked of the task AS IT STANDS — a caregiver meets rung 4 exactly as `tasks_select` does today, hidden unless a named share already widens the one object. Owned (even hers), `summary`, a non-reader, done, an instruction row, a stranger and a **frozen circle** refuse in ONE shape, eleven refusals joined outside the statement; **no share and no instruction by any path, asserted as SET EQUALITY before/after**; `task_claimed` names the claimant as actor and target; a claimed task is a handed task to `assign_task` (reassign names her as the former holder) and `complete_task`; the AI has no path. pgTAP 070 (40), concurrency 55 (two claimants at once — one owner, one entry). 001/002 re-pinned in the green commit.
- **M2 `hc.set_grant`** — `target_ref` composed as `member:subject:domain:level`, the 2A body byte-for-byte with one composition changed and ownership/grants restated. A token minted for `summary` does not consume against a post of `manage` for the same triple and is left UNCONSUMED; the pre-8A three-part token is refused, not tolerated; `view` cannot buy `manage`. pgTAP 071 (14); 038's five raise cases, 041, concurrency 29/31 and the live people test re-pinned in the same commit. **The app half:** `people/[member]/page.tsx` asks for the password FOR the level and `grant/submit/route.ts` confirms the cookie against the same four parts before handing the token over — a token for another level is not bound, not sent, not burned (`tests/routes/member-detail.test.ts` 28/28; the PPL-02 leg drives it inside the gate).

**Coverage:** two rows flip at this head, **at the pgTAP layer only** — TSK-05 (app + e2e halves owed to 8C) and STP-03 (its app half built and recorded, not claimed — Q-F); GRT-01, STP-01, STP-02 amended with a marker, never rewritten; eleven § 8 rows stay `pending` as opened. **`docs/owed.md`: OPEN 0 / 25 · TAKEN 2 · RISK 1 · CLOSED 17 · PROMOTED 6.**

### Evidence, at ONE declared head — `4d166c0`

Every commit past it is docs-only (`git diff --name-only 4d166c0..HEAD -- . ':(exclude)docs'` returns empty; per-directory tree binding in the packet; `e2e/` byte-identical to base). Clean-leg reset **exact 76** · pgTAP **71 files, Σ 1,863, PASS** · concurrency **83/83** across 55 cases (teed) · **`db:verify` clean** and **the upgrade leg green** (74 → `migration up` → 76, then 1,863 + 83/83 on the UPGRADED database — both NOT RUN since 7A, both run here) · vitest **1439 across 101 files** by run · lint / typecheck / production build solo: exit 0 / exit 0 / exit 0 (78 routes, compiled in 21.4 s) · gitleaks (the CI-identical container): 651 commits scanned, no leaks found · **the browser gate 58/58 in 8 files, 1,284 s — 0 unexpected · 0 flaky · 0 skipped**, `.gate/e2e-run.json` config-borne, no CLI override, unconditional for Tier 1.

### What is NOT claimed

A claim surface, leg or log sentence (8C) · STP-03's app half as its flip (Q-F) · search and every SRCH row, A11Y-12 (8B) · OW-26's cursor (8C) · the four `gate` rows, never green this slice (Q6) · GRP-01 (6C) · a named freeze on a claim (Q-A) · G4/G7 block, G9 OPEN, the band allowlist EMPTY, SIG-01 NOT absorbed · LOG-03 never green.

### The seven pointed questions (recommended answers in ADR-0040 and the packet)

Q-A the freeze unnamed on a claim — one shape through `visible_at`, as ruled · Q-B *hers already* refuses rather than no-ops · Q-C a caregiver claims a task shared to her by name, because the share already gives `view` · Q-D the binding REPLACED, no compatibility arm · Q-E the case-55 commit's tally at M1, the head's re-runs the record · Q-F STP-03's app half — built and driven, recorded not flipped · Q-G `task_claimed` renders generically until 8C words it.

### After this round

Findings VERBATIM in `docs/review/round-28-findings.md` (fresh session, Tier 1 lenses), dispositions, owner sign-off, `--no-ff`. **8B does not wait for this merge; 8C does.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
