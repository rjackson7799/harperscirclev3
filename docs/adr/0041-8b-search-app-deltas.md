# ADR-0041 — Slice 8B: Search, the surface — deltas as built, and the round-29 packet

**Status:** proposed — the 8B build record, put to round 29 (**Tier 2**, ruled at
the plan gate, Q1: this one document plus one dispositions table, one reviewer
session attacking the three places named below).
**Branch:** `slice/8b-search-app`, from `origin/main` @ `189e06c` (PR #40, 8A,
merged 2026-09-03 on its packet — round 28 did NOT run; ADR-0040 stays
`proposed` and its Q-A…Q-G are the owner's, none touching search; Q1: 8B does
not wait).
**Date:** 2026-09-03. **Evidence head:** `3bd8f52` — every commit past it
docs-only.
**Scope:** the plan's "### 8B" five units verbatim, the module and the leak leg
FIRST. **Migrations: NONE — 2 of ≤ 4 stands; M4 closes UNCONSUMED** (D9: no
measured PRF-06 breach at this head; `supabase/` untouched). **Dependencies: 0
runtime, 0 dev** (13 / 15, the reserve UNSPENT). `lib/ai/` untouched;
`PROMPT_VERSION` does not move. Nothing is production-activated.
**Authority:** the plan (the "### 8B" units and Q4's block BINDING) → PRD
§4.7.3, §4.3.6, §7.3–§7.6 → TSD §7.2–§7.7, §2.11 → ADR-0038 D1 (the erratum
shape) → ADR-0033 D19 / ADR-0028 D15 (the gate's outcomes, the budget) →
`docs/coverage.md`. The TSD §7.2 erratum lands at round-29 sign-off
(consequence 4), not here.

---

## The commits (red → green per unit, the signature in every red)

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| the kickoff (docs-only, FIRST) | — | `55b1907` | 90 lines by the process test's split, at the cap; `process.test.ts` 29/29 |
| U1 `lib/hc/search` + the fence + `myMembership` widened | `f75d481` | `474d129` | `Cannot find package '@/lib/hc/search'`; the surface fence 16 of its 20 cases red (`lib/hc/search.ts missing: expected false to be true`, ENOENT ×12) — the red and green commit messages say "of 24" and "15/24": a miscount, corrected here (the fence is 20 cases: 16 red before U1, 10 after U1, 4 after U2, 0 after U3) |
| U2 `SearchField` + the layout + CSS | `f0f6d87` | `9733c12` | 10 of 10: `Cannot find package '@/components/shell/SearchField'` ×4; the layout `to contain 'placeholder="Search Nell&#x27;s record"'` / `'action="/c-1/search"'` ×6 |
| U3 the page (tests) | `5818b86` | `779ad9e` | 14 of 14: `Cannot find package '@/app/(app)/[circle]/search/page'` |
| U4 `e2e/search.spec.ts`, the leak leg FIRST | `f065c28` | (green in `779ad9e`'s targeted run; the record is the gate below) | targeted run 0/1: `expect(locator).toBeVisible() failed … element(s) not found` at the coordinator's positive control — the page was Next's `404 · This page could not be found.` |
| U5 the measurement | — | `3bd8f52` | a number, not a test (D9) |

---

## D1 — TSD §7.2 verbatim in FROM / WHERE / ORDER / LIMIT, with two named additions to the select list

`lib/hc/search#DOCUMENTS_SQL` is §7.2's text: the `with q` CTE over
`websearch_to_tsquery`, the `LEFT JOIN document_search_content` that RLS
decides, `coalesce(sc.tsv_full, d.tsv_summary) @@`, `ts_rank` over the same
coalesce, `where d.circle_id = $1`, `order by rank desc limit 20`. Two things
are added to the SELECT list and nothing else changes:

1. **The Q4(1) departure, as ruled**: `ts_headline`'s fourth argument,
   `StartSel=U+0002, StopSel=U+0003` (`HEADLINE_OPTIONS`), so the headline
   carries STX/ETX around the match instead of `<b>`/`</b>`. Probed on the
   stack before a line was written: the sentinels come through byte-exact
   and `websearch_to_tsquery` raises nothing on junk (NOTICEs only).
   `splitHeadline` turns the string into `{ text, hit }` PARTS in the module;
   an unbalanced sentinel degrades to plain text and a stray one is dropped,
   never rendered; a document's own `<b>` or `<script>` stays text. The page
   maps a hit part to `<mark>` and a plain part to text — React escapes both
   — and `tests/lint/search-surface-fence.test.ts` pins
   `dangerouslySetInnerHTML` absent from the three surface files AND pins
   the product tree's set of files that carry one as an EXACT SET (the one
   pre-8B site, `app/setup/step/2/page.tsx`'s timezone probe).
2. **The row's own title** (`d.title`; a task's `t.title`; an event's
   `e.summary`) so a result has a link text. The column is inside the text
   the vector was built from at every level (title is weight A of
   `tsv_summary`), so it discloses nothing the snippet does not. Named here
   because the plan's words were "nothing else changed" — **Q-A**.

Tasks and timeline events are single-vector (`t.tsv`, `e.tsv`), each `limit
20` with `circle_id = $1`, the snippet cut from the same text the vector was
built from (title + detail; summary). The fence counts `withRequestRole(`
exactly once, `limit 20` exactly three times, `circle_id = $1` at least
three times, and `count(` never.

## D2 — the subject label is a fourth statement in the same transaction

§7.6: every result carries its subject label. Rather than join `subjects`
into §7.2's FROM, the module reads the circle's subjects once
(`SUBJECTS_SQL`, the `SUBJECT_SEQ` ordering every record module uses) inside
the same `withRequestRole` and labels rows from the map. `subjects_select`
admits every live member of the circle, so the map cannot miss for a caller
who has any row at all; the `''` fallback exists for the type and is not a
rendered state.

## D3 — the placeholder rides the ONE membership read; the field is for every member

`myMembership` gained `subjects: { id, first_name, seq }[]` by a `json_agg`
subselect on its one query — one round trip, unchanged in count. The layout
computes `placeholderFor(me?.subjects)`: one subject → `Search Nell's
record`; two, none, a failed read or an older row shape → `Search the
record`. The field renders for every member (settled item 6: not in
`NAV_MANIFEST`, the fence asserts it), labelled by a visually-hidden
`<label>` ("Search"), with the §4.7.3 hint *Find documents, dates and tasks.*
under it as `aria-describedby`. **The hint is always under the field**,
not revealed on first focus — a focus-only reveal needs client code or a
CSS `:focus-within` trick that hides the description from the paint until
it is needed; the always-visible line is the honest reading of "first-open
hint under the field" without a script (§7.4: no client behaviour). **Q-B**.

## D4 — `q` is capped at ingress; one budget; blank is the hint, over-cap is the empty copy

`boundQuery` trims and returns null for a blank, a non-string (`?q=a&q=b`)
or a term over 200 characters. The page distinguishes the two nulls: a blank
or absent term is the first open and renders the hint; a term that is
present but unbounded is refused with *Nothing matching that, in what you
can see.* Neither reaches the database (the mocked contract asserts the
module is not called; the live test asserts the access log is unchanged).
The three reads answer inside ONE `withPageBudget`; the overrun renders
"Searching is taking longer than usual … try again" to this search's own
URL; a refused read renders "We couldn't search just now". `q` is echoed
as TEXT in the page's context line (*Results for "q"*) — React-escaped,
proven with `<img src=x onerror=1>` — and nowhere else. **Q-C**.

## D5 — the absences are assertions, three ways

No total, no count of withheld results, no "showing N of M", no field of the
page's own, no autocomplete attribute, no datalist, no listbox/combobox, no
prose answer: asserted over the rendered tree in `tests/routes/search
.test.ts`, over the source in the fence, and over the live DOM in the copy
leg (`main`'s children are exactly a header and headed sections; every
result link resolves 200). An empty group renders nothing — no heading, no
"0 tasks".

## D6 — a search writes nothing to the access log (Q4(3))

No event type, no row, no `hc.log` call: the fence forbids the call on the
surface; the live module test counts `access_log` for the circle across
every read and finds it unchanged. `artifact_read` still fires behind a
result when the document is opened, exactly as from the Documents list.

## D7 — the fixtures: real triggers build the vectors; the share row is fixtured

Rows in `tests/hc/search.test.ts` and `e2e/search.spec.ts` land under
replica role (the standing concession); their VECTORS are then built by the
real triggers — a no-op `update … set title = title` in normal mode fires
`hc_tsv_*`, the dsc sync and the dsc builder, and `ocr_text` lands through
the builder — the prf06 mechanics; nothing fakes a vector. The body text at
weight C rides a fixtured `extractions` + `proposals` pair behind
`documents.source_proposal_id`, so `extracted_text` is what the builder
concatenates. Two narrowings, named: (a) the share leg INSERTS the
`object_shares` row rather than driving the share screen — DOC-04's leg
already proves the screen; this leg proves search honours the row — **Q-D**;
(b) the `view` member is the invite's family default re-granted `view` ×5 by
the fixture (the people.spec pattern), because no screen grants view ×5 in
one act.

## D8 — A11Y-12's leg lives in `e2e/search.spec.ts`

The coverage cell written at 8A said `e2e/a11y.spec.ts`. The leg needs
searchable rows and three members, which are this spec's fixtures, so it
lives here and `AUDIT_MANIFEST` cites it by title; the coverage flip says so.
Built INTO the surface: the visually-hidden label, the `role="search"`
landmark, the headed sections, `mark` at weight 600 with an underline (never
colour alone), `input[type='search']` on the shared 44 px rule.

## D9 — the measurement, and M4 UNCONSUMED

**The page.** `scripts/bench/search-p95.mjs` against the production build
(`next build` then `next start` on port 3000 with playwright.config's env
block, the local stack), signed in through `/sign-in/submit` as the search
spec's founder, over her one-subject circle holding the spec's rows; the
control asserted a rendered group before a single request was timed; one
untimed warm hit per term, then **30 runs × 5 terms = 150 timed requests**:

| term | p50 | p95 | max |
|---|---|---|---|
| discharge | 138 ms | 273 ms | 468 ms |
| warfarin | 131 ms | 359 ms | 370 ms |
| cardiology | 130 ms | 346 ms | 380 ms |
| zqpharm | 128 ms | 207 ms | 293 ms |
| metoprolol | 133 ms | 203 ms | 368 ms |
| **all 150** | **132 ms** | **273 ms** | **468 ms** (p99 380) |

**p95 273 ms against PRD §13.2's 800 ms; the 2 s ceiling held at every
request** — measured on the 8 GB host with the stack and Docker up. It is
the whole answer (the gate, the three reads inside one budget, the render),
not the query alone, and it is a small-circle number: the spec's circle
holds three documents, three tasks and one event.

**The scan legs.** `prf06.mjs` — the 5,000-arrival, 2,500-document fixture
at the §13.3 cap, 25 warm runs per query per caller — re-run at this head
(no DDL moved since 8A; the search relations and indexes are 1D's):

Two passes, both kept: run 1 overlapped the typecheck's start on the same
host; run 2 on the quiet host (p95, ms; bound 2,500 for every scan leg):

| leg | mv run 1 | mv run 2 | mx run 1 | mx run 2 |
|---|---|---|---|---|
| search_broad | 1,886 | 853 | 583 | 401 |
| search_count | 1,320 | 884 | 865 | 426 |
| search_narrow | 955 | 1,164 | 839 | 732 |
| search_ocr | 980 | 885 | 494 | 535 |
| search_tasks | 341 | 161 | 185 | 198 |

**Every search scan leg PASSES its bound in both runs; there is no measured
PRF-06 breach on the search legs at the 8B head, so M4 — a search index —
closes UNCONSUMED and the migration bound stands at 2 of ≤ 4.** Both
records are kept (`evidence/prf06-warm-run{1,2}.log`).

**The page tripwire, not a search leg, named rather than absorbed.** Each
run reported ONE breach of the 250 ms PAGE tripwire, on a different leg:
run 1 `page_timeline`/mx at p50 353 / p95 571 (0 visible rows — the
scan-to-fill worst case; 197 ms in run 2); run 2 `page_docs`/mx at p50 196
/ p95 270 (52 ms in run 1). Every other page leg sat at 10–102 ms p95.
Round 8 saw the same leg at 243 ms warm and 280–329 ms cold and ruled the
tripwire's excursions inside PRD §13.2's 1.5 s page budget on a cold or
contended host; that is what these are. No DDL moved since 8A, the page
legs are 1D's `visible_at` over rows the caller cannot see, and a search
index would not touch them — so they are not M4's condition; they are
recorded here for the round — **Q-G**.

## D10 — the gate, and the host

ONE complete run at the final head, on the first attempt — `npm run test:e2e`
through `scripts/preflight.mjs`, the moved-HEAD block acknowledged by the
re-run (`f065c28 → 3bd8f52`), VERDICT SAFE at **0.21 GiB free** (below the
1.20 GiB floor the runbook names; the 8A gate completed at 241 MiB, and this
one is the second data point that the floor is a warning), `hc_clamd` at
0.01 % CPU with only routine SelfChecks in its log, ports 3000/8787 free, no
dev lock, no peer process, `NODE_OPTIONS=--max-old-space-size=1536` as the
runbook prescribes.

`.gate/e2e-run.json` (config-borne, rotated aside by preflight before the
command started, never a CLI override): **expected 64 · unexpected 0 · flaky 0
· skipped 0 · 1,972 s (32.9 min)** — 64 specs in 9 files: a11y 10 · documents
5 · extraction 5 · ingestion 8 · onboarding 11 · people 7 · record 5 · review 7
· **search 6**. The six search legs ran last, inside the run: the leak leg
1.7 min (it pays the spec's provisioning), view 29 s, the caregiver 29 s, the
share 31 s, copy and bounds 25 s, A11Y-12 29 s. Leg 38 (AC-PERM-3, the
D13-observed leg): passed, 15.5 s — OW-13's discipline, EXE-02's cell, at no
cost. No leg died on spawn; nothing was re-run; the console tally was never
read (traps §4). The per-test traces (`test-results/`, 193 MB) and the JSON
are copied to the vault at `projects/harpers-circle/04-evidence/round-29-gate-3bd8f52/`.

The whole pre-8B suite (58 legs) passed under the shell that now carries the
search field on every circle screen — the four a11y audit legs at 390 px, the
keyboard legs whose Tab order now meets the field first, NAV-01's leg for the
caregiver whose nav hides Documents.

## Evidence at ONE declared head — `3bd8f52`

- **Head:** `3bd8f52` on `slice/8b-search-app`; every commit past it is
  docs-only (`git diff --name-only 3bd8f52..HEAD -- . ':(exclude)docs'` is empty).
- **Tree binding** (`git diff --stat 189e06c..3bd8f52`): 16 files, +2,418 / −9 —
  `app/(app)/[circle]/layout.tsx` (+17/−9), `app/(app)/[circle]/search/page.tsx`
  (174), `app/globals.css` (+66), `components/shell/SearchField.tsx` (45),
  `lib/hc/search.ts` (245), `lib/hc/tasks.ts` (+31), `e2e/search.spec.ts` (570),
  `e2e/audit-manifest.ts` (+10), `scripts/bench/search-p95.mjs` (95), five test
  files and two pins, the kickoff. **Nothing under `supabase/` or `lib/ai/`.**
- **DB legs: NOT RUN — no DDL moved.** Reset exact 76 · pgTAP 71 files Σ 1,863
  · concurrency 83/83 · `db:verify` clean · the upgrade leg green stand at
  8A's `4d166c0` (ADR-0040 D8).
- **vitest:** `npm run test:app` — **1508 passed / 1508 across 105 files, by
  run** (`.vitest/run.json`; 8A's head: 1439 / 101). The new files:
  `tests/hc/search.test.ts` 22 (live) · `tests/lint/search-surface-fence.test.ts`
  20 · `tests/design/search-field.test.tsx` 10 ·
  `tests/routes/search.test.ts` 14; `tests/app/page-gate.test.ts` now 78.
- **lint / typecheck / production build, each solo:** exit 0 / exit 0 / exit 0
  — 76 app routes in `.next/app-path-routes-manifest.json`, `/[circle]/search`
  among them.
- **gitleaks** (the CI-identical, digest-pinned container): 661 commits
  scanned, 10.33 MB, **no leaks found**.
- **The gate:** D10 — **64/64 in 9 files, 1,972 s, 0 unexpected · 0 flaky ·
  0 skipped.**
- **The measurement:** D9 — the page p95 **273 ms**; prf06's scan legs twice,
  every search leg PASS; **M4 UNCONSUMED**.
- **Coverage:** SRCH-03, SRCH-04, SRCH-05, SRCH-06 and A11Y-12 flip green at
  this head on legs inside the complete run (the § 8 header carries the 8B
  paragraph). `docs/owed.md` **OPEN 0 / 25**, unchanged.

## Pointed questions, with recommended answers (the packet, collapsed)

- **Q-A** The select list carries the row's title beside §7.2's five columns.
  Recommended: ACCEPT as the second named departure, recorded in the same
  one-line erratum at sign-off (consequence 4) — the title is weight A of
  the matched vector at every level.
- **Q-B** The hint is always under the field, not revealed on first focus.
  Recommended: ACCEPT; a focus-only reveal is client behaviour §7.4 refuses.
- **Q-C** The page echoes the term in its context line. Recommended: ACCEPT
  — text, escaped, never composed; strike it if the round reads it as a
  composition.
- **Q-D** The share leg fixtures the `object_shares` row. Recommended:
  ACCEPT with DOC-04's leg as the screen's proof; or OWE a screen-driven
  variant if the round wants the share act inside this spec.
- **Q-E** STX/ETX as sentinels: "cannot occur in document text" is a
  property of the writers (no extractor or OCR path emits C0 controls) plus
  the module's strip-on-stray, not a database constraint. Recommended:
  ACCEPT; a `check` refusing C0 controls in the text columns would be DDL.
- **Q-F** The rank tie-break: §7.2 orders documents by rank alone (kept
  verbatim); tasks and events add `, id`. Recommended: ACCEPT.
- **Q-G** The 250 ms PAGE tripwire flickered once per prf06 run on a different
  page leg each time (D9: `page_timeline`/mx 571 → 197 ms; `page_docs`/mx 52
  → 270 ms), every search scan leg passing both times. Recommended: NOTE it
  as round 8's cold-or-contended pattern, no row and no ledger item — or OWE a
  quiet-host cold+warm pass if the round wants the tripwire re-baselined.

## What is NOT claimed

A search index (M4 UNCONSUMED) · the TSD §7.2 erratum (sign-off) · a
two-subject placeholder driven in a browser (vitest and the live module
test carry it; the e2e circle has one subject) · a screen-driven share
inside this spec (Q-D) · the caregiver's claim surface, `task_claimed`'s
sentence, LOG-04 (8C) · the four `gate` rows, GRP-01 (never green here) ·
G4/G7 block, G9 OPEN, the band allowlist EMPTY, SIG-01 NOT absorbed ·
LOG-03 never green.
