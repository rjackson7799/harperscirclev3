# Round 29 — the 8B review (Search, the surface)

Tier **T2** (plan Q1, ruled): **one reviewer session**, findings landed
VERBATIM in `docs/review/round-29-findings.md` before a word is argued, then
**one dispositions TABLE** (`docs/review/round-29-dispositions.md`), owner
sign-off, owner merge (`--no-ff`, never squash). Traps and authority order
are auto-loaded; the ritual is `docs/process/slice.md`; `slice` skill, leg
**review**, read-only. A settled ruling is a dissent, not a finding.
`pending` never counts as green.

## What you are reviewing

- Branch `slice/8b-search-app`, **PR #PR_NUMBER**, from `origin/main` @
  `189e06c` (PR #40, 8A — merged on its packet; round 28 did not run and
  none of ADR-0040's Q-A…Q-G touches search). Evidence head
  **`3bd8f52`**; every commit past it is docs-only — verify with
  `git diff --name-only 3bd8f52..HEAD -- . ':(exclude)docs'` (empty).
- The record: `docs/adr/0041-8b-search-app-deltas.md` is the deltas doc AND
  the collapsed packet — commits red→green with signatures, ten decisions,
  seven pointed questions (Q-A…Q-G) with recommended answers. An unanswered
  pointed question defaults to NOT PLANNED (ADR-0006).
- Bounds: **migrations 2 of ≤ 4, M4 UNCONSUMED** (D9: no measured PRF-06
  breach; `supabase/` untouched) · dependencies **0** · `lib/ai/` untouched.
- Evidence at `3bd8f52`: vitest **1508 / 105 by run** · lint /
  typecheck / production build solo, exit 0 · gitleaks 661 commits, no leaks
  · the browser gate **64/64 in 9 files, 1,972 s — 0 unexpected · 0 flaky · 0 skipped** (`.gate/e2e-run.json`, config-borne) ·
  the search page p95 **273 ms** against §13.2's 800 ms (D9) · prf06's
  scan legs twice, every search leg PASS (M4 UNCONSUMED; the page tripwire's flicker is Q-G). DB legs did not run: no DDL moved.
- Coverage flips at this round: SRCH-03, SRCH-04, SRCH-05, SRCH-06 and
  A11Y-12, on legs inside the COMPLETE run. `docs/owed.md` unchanged at
  OPEN 0 / 25. The TSD §7.2 erratum is sign-off's (consequence 4).
- NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist EMPTY ·
  SIG-01 NOT absorbed · G12-01 pending at `gate`.

## The three places the build names against itself — attack these first

1. **Leakproof, from a LIVE context** (`lib/hc/search.ts`; D1, D2, D7).
   §7.2 is verbatim in FROM/WHERE/ORDER/LIMIT and the LEFT JOIN is the level
   decision — find a caller for whom the rendered tree, the title column
   (Q-A), the subject-label lookup, the rank, or a snippet cut at `summary`
   tells a body-only match from an absent term; a share that widens a
   derived object; a caregiver who finds more than her assigned tasks.
2. **Structure, never markup** (D1; `splitHeadline`; the page's `<mark>`;
   `tests/lint/search-surface-fence.test.ts`). The sentinels are STX/ETX
   (Q-E): construct a document text, an OCR string or a term that makes the
   split produce a wrong span, or that reaches the DOM as an element; find
   a path the fence's exact-set pin does not cover; check `ocr_text` at
   weight D never outranks a title.
3. **Absences over the rendered tree** (D4, D5, D6; `tests/routes/search
   .test.ts`; the copy leg). No total, no withheld count, no autocomplete,
   no suggestion list, no prose answer, no composition, no `hc.log` — find
   the surface, the header, the context line (Q-C), the empty state or the
   over-cap refusal that carries a number, a suggestion, or a log write.

## Where else a defect would hide

- The widened `myMembership` (D3): the `json_agg` subselect on every circle
  screen — its cost, its RLS reach, and the placeholder for a circle whose
  subject read is partial.
- The hint always visible under the field (Q-B) and the `role="search"`
  landmark at 390 px — the wrap rule keeps DOM order; is the paint order a
  focus-order defect?
- The fixtures (D7): replica-role rows with vectors from a no-op UPDATE in
  normal mode; the share row INSERTED rather than driven (Q-D); Dan's
  view ×5 re-granted by the fixture. Is anything green only because of its
  fixture?
- The measurement (D9): the p95 is from `next start` on this host, thirty
  runs over five terms — is it the number §13.2 asks for?

## Mechanics

- Findings file: severity BLOCKER/MAJOR/MODERATE/MINOR/LOW/OBS, one row per
  finding, file:line at the head you read (cite e2e legs BY TITLE).
- You are read-only: no fixes, no reruns to green; a product failure is a
  finding. Verify counts by running vitest if you wish — never
  `db:reset`/`test:e2e` without the preflight scripts (a peer may hold the
  stack). If a finding needs DDL, say so and stop — M3/M4 are the owner's.
- The dispositions table (T2): one row per finding — FIXED(sha) /
  OWED(ledger row) / KILLED(reason) / NOTED — plus the seven Q answers, then
  the owner ballot.

**STOP after the dispositions table and the ballot: owner sign-off, the
§7.2 erratum and the merge are the owner's. 8C may run in parallel.**
