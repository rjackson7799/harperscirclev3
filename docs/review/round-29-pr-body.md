# [DO NOT MERGE without owner sign-off] Slice 8B — Search, the surface

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash — `git merge --no-ff`.** An unanswered item defaults to NOT MERGED. **Round 29 has not run**; the reviewer's kickoff is `docs/review/round-29-kickoff.md`, and the deltas doc that doubles as the Tier-2 packet is `docs/adr/0041-8b-search-app-deltas.md` (`Status: proposed`).

### What this branch delivers

The plan's "### 8B" five units verbatim (`docs/review/slice-8-plan.md`, Q1–Q7 SETTLED 2026-09-02), from `origin/main` @ `189e06c` (PR #40, 8A — merged on its packet; round 28 did not run and nothing in ADR-0040's open questions touches search), red→green per unit with the failure signature in every red commit, **the module and the leak leg FIRST**. **Migrations: NONE — the bound stands at 2 of ≤ 4 and M4 closes UNCONSUMED** (no measured PRF-06 breach at this head; `supabase/` untouched). **Dependencies: 0** (13/15 dev, the reserve UNSPENT). `lib/ai/` untouched; `PROMPT_VERSION` does not move. Nothing is production-activated.

- **U1 — `lib/hc/search`.** TSD §7.2 verbatim in FROM / WHERE / ORDER / LIMIT, the LEFT JOIN on `document_search_content` the level decision RLS makes; tasks and timeline single-vector; each read `limit 20` with an explicit `circle_id`; ONE `withRequestRole`; the subject label from the same transaction. **The Q4(1) departure as ruled:** `ts_headline`'s sentinels are STX/ETX and `splitHeadline` turns the string into PARTS in the module — a document's own `<b>` stays text; the row's title rides the select list so a result has a link text (Q-A). No total, no `count(`, no `hc.log`. `myMembership` WIDENED to carry the subjects from its one query (Q4(2)). Live: `tests/hc/search.test.ts` 22/22 — summary body-only ≡ nowhere, the title term's snippet from title + summary only, the view member's marked part, OCR at weight D never above a title, the caregiver's assigned task and nothing else, a share widening ONE document and never the derived task, the access log unchanged across every read.
- **U2 — `SearchField`.** A plain GET form in `TopBar`'s slot for EVERY member (not in `NAV_MANIFEST`): a bound visually-hidden label, the hint *Find documents, dates and tasks.* as its description, no autocomplete attribute, no datalist, no client fetch; the §4.7.3 placeholder — `Search Nell's record` / `Search the record` — from the layout's ONE membership read, `Search the record` on a failed read. `tests/design/search-field.test.tsx` 10/10.
- **U3 — `/[circle]/search`.** Inside `withPageBudget`; `q` capped at ingress (200) and refused with the empty copy, a blank term the hint, neither reaching the database; three headed groups labelled by subject, each row a link; an empty group renders nothing; `<mark>` built by React from the parts, `dangerouslySetInnerHTML` nowhere — `tests/lint/search-surface-fence.test.ts` pins the surface AND the product tree's set of such sites as an exact set. Listed both ways in `page-gate.test.ts`, in `RECORD_TREES`/`RECORD_SURFACES`, and in `AUDIT_MANIFEST`. `tests/routes/search.test.ts` 14/14.
- **U4 — `e2e/search.spec.ts`, six legs, the leak leg first.** Summary body-only ≡ nowhere from HER live context; the `<mark>` structure and OCR at weight D at view; the caregiver's task and nothing else from a field the nav cannot hide; the share widening ONE document and never the derived task nor the sibling; the four strings verbatim, the over-cap refusal, the absences over the DOM, every link resolving; A11Y-12 at 390 px — labelled, Tab reaches it, Enter submits, headed groups, `mark` weight + underline, axe, the 44 px floor, no horizontal scroll. Per-file budget 420 s; never `workers: 1`.
- **U5 — the measurement.** `scripts/bench/search-p95.mjs` over the production build: the page p95 **273 ms** (p50 132 · p99 380 · max 468; 150 warm requests over 5 terms from a signed-in founder) against §13.2's 800 ms, the 2 s ceiling held. prf06's scan legs re-run: twice at this head — every search scan leg PASS in both (`search_broad` mv 1,886 → 853 ms against 2,500); the 250 ms page tripwire flickered on a different page leg each run, recorded as ADR-0041 Q-G. **M4 UNCONSUMED.**

**Coverage:** SRCH-03, SRCH-04, SRCH-05, SRCH-06 and A11Y-12 flip green on legs inside the COMPLETE gate run at this head. `docs/owed.md`: **OPEN 0 / 25**, unchanged. The TSD §7.2 erratum (one line, the options string and the title column) lands at round-29 sign-off, not here (consequence 4).

### Evidence, at ONE declared head — `3bd8f52`

Every commit past it is docs-only (`git diff --name-only 3bd8f52..HEAD -- . ':(exclude)docs'` returns empty). vitest **1508 / 1508 across 105 files by run** · lint / typecheck / production build solo: exit 0 / exit 0 / exit 0 (76 app routes) · gitleaks (the CI-identical container): 661 commits scanned, no leaks found · **the browser gate **64/64 in 9 files, 1,972 s — 0 unexpected · 0 flaky · 0 skipped**** — `.gate/e2e-run.json` config-borne, no CLI override · the search page p95 **273 ms** (§13.2: 800 ms; ceiling 2 s) · prf06 scan legs re-run twice, every search leg PASS, M4 UNCONSUMED. **DB legs did not run: no DDL moved** (reset/pgTAP/concurrency/db:verify/upgrade stand at 8A's `4d166c0` figures — 76 · 71/Σ 1,863 · 83/83 · clean · green).

### What is NOT claimed

A search index (M4 UNCONSUMED) · the §7.2 erratum (sign-off) · a two-subject placeholder driven in a browser (the module test and vitest carry it) · a screen-driven share inside the search spec (Q-D; DOC-04's leg is the screen's proof) · the claim surface, `task_claimed`'s sentence, LOG-04 (8C) · the four `gate` rows and GRP-01 (never green here) · G4/G7 block, G9 OPEN, the band allowlist EMPTY, SIG-01 NOT absorbed · LOG-03 never green.

### The seven pointed questions (recommended answers in ADR-0041)

Q-A the title column beside §7.2's five · Q-B the hint always under the field · Q-C the term echoed as text in the context line · Q-D the share leg's fixtured row · Q-E STX/ETX as sentinels, a writer property not a constraint · Q-F the tie-break on tasks and events · Q-G the page tripwire's flicker in prf06, not a search leg — NOTE or a quiet-host re-baseline.

### After this round

Findings VERBATIM in `docs/review/round-29-findings.md` (one fresh reviewer session, Tier 2), the dispositions table, owner sign-off with the §7.2 erratum, `--no-ff`. **8C (`slice/8c-claim-log-app`) may run in parallel from `189e06c`.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
