# Slice 8 — Search, and the ruled intake: the slice plan

**Status:** **PLANNED — AWAITING OWNER RULINGS. Q1–Q7 are PUT, not
settled.** Each carries the recommendation the build would execute on and
names the alternative it rejects. **An unanswered question defaults to NOT
PLANNED and the build does not start** (ADR-0006). Written 2026-09-02 in
the planning session on `docs/slice-8-plan`, branched from `origin/main`
after a fetch.

**`main` HAS MOVED since the kickoff's STATE block was written.** The
kickoff names `main` @ **`6025cfa`** (PR #34, slice 7C + round 27).
`origin/main` is now **`7e18164`** — the merge of **PR #37**, the kickoff
itself plus the ADR-0037/0038 merge stamps, merged 2026-09-02 by the owner
on top of `6025cfa`. The move is **docs-only**: `git diff --name-only
bb40021 7e18164` is seven files, all under `docs/`, and `app/`, `lib/`,
`components/`, `e2e/`, `tests/`, `supabase/` and `scripts/` are
**byte-identical to the evidence head**. Every code figure below is
therefore `bb40021`'s and is quoted as such.

**Slice 7 is DONE** — 7A, 7B, 7C, then 7E/7D and round 27's fixes; rounds
24, 25, 26 and 27 are CLOSED. Slice 8's first review is **round 28**. The
next free ADR number at this gate is **0040**: **0039 is CLAIMED by open
PR #35** (the PRD's voice), and **open PR #36** adds `docs/features.md`
and a *Candidates* row to `docs/process/slice.md`. **If either merges
before the 8A build kickoff, the ritual is re-read at that head** — this
plan is written against `docs/process/slice.md` as it stands at `7e18164`.

**Authority:** TSD §11.1 row 8 (*"Search (§7): indexed,
permission-filtered; needs records to search"*) → **PRD §4.3.6** (the
leak list) and **§4.7.3** (the field, its copy and what it must never
do) → **TSD §7 whole** (§7.1 the two vectors, §7.2 the query, §7.3 the
narrowed leakproof claim, §7.4 the deliberate absences, §7.5 isolation,
§7.6 level-appropriate results, §7.7 latency) → the acceptance criteria
**AC-DOC-1**'s search half, **AC-DOC-4**, **AC-TL-1**'s *"through
search"*, **AC-HOME-4**, and **AC-TASK-5**'s search clause. Plus the
intake slice 7 handed here **by ruling**, not by drift: **ADR-0036 Q-D**
(claim / self-assignment — *"RULED: slice 8"*), **ADR-0038 D6**'s three
named-and-stopped DDL items, **OW-26**, and slice-7 **Q4(a)**'s 6C
placement.

---

## 0. What this slice is, stated before it is planned

**§11.1 row 8 is the first slice whose database half was finished two
years of project-time before its surface.** Search's whole DB layer went
green at **1D** and has not moved since: SRCH-01 (the write path, `028:1–29
· 011:17 · 002:19–20`), SRCH-02 (the §7.2 query per rung, `029:1–18`),
DSC-01 (the `view`-level read policy, `029:2–18 · 028:5 · 002:14, 19–20 ·
010:44–48`), RLS-11a (the A.3 search channel across **all three** search
relations, `029:19–21`), PRF-04 (the InitPlan / LEFT-JOIN null-extension
regression, `029:10, 22–23`) and PRF-06 (the measured scan bounds,
`033:1–12` + `scripts/bench/prf06.mjs`). Four consequences govern every
decision below.

1. **There is no search code in `app/` or `lib/hc/` — none.** Verified
   this session: no `lib/hc/search.ts`, no `app/(app)/[circle]/search`
   route, and `NAV_MANIFEST` has no search entry. What *does* exist is a
   promise: `components/shell/TopBar.tsx` carries a `search?: ReactNode`
   slot whose docstring says *"each renders NOTHING until its surface is
   built (**search is slice 8**; feedback has no surface yet) — never
   promise what isn't built."* The slot was cut to this slice's shape
   three slices ago and has rendered nothing since. **Slice 8 fills it.**
2. **The surface is a composition over shipped, proven machinery — which
   is exactly why the risk moves from the query to the rendering.** RLS
   decides; the plan's job is to stop the *machinery around the results*
   from doing what the rows will not (PRD §4.3.6). Three of those
   machineries are app-side and none of them exists yet: the **snippet**
   (`ts_headline` returns markup by default — §"Settled before a screen"
   item 1), the **counts** (post-filter, over the rendered tree, never a
   total), and the **placeholder** (§4.7.3's copy is subject-dependent,
   and reading subjects in the shell is a second round trip on every
   screen — item 2).
3. **The ruled intake is DDL, and the DDL is small.** ADR-0036 Q-D put
   claim here explicitly (*"Not owed to 7B, not owed to 7C"*), and
   ADR-0035 D9 states the tree fact it rests on: *"No 7A function lets a
   member below manage assign a task to herself."* Re-verified this
   session at the site — `hc.assign_task` refuses the caller whose
   `hc.visible_at(... 'task', p_task, v_task.owner_member_id) < 'manage'`
   (`20260829120005:236`ff, the round-24 M5 replacement; the original at
   `20260829120001:179`). **A claim is not an assignment**, and the whole
   argument for granting it below `manage` is that it is strictly
   narrower (Q2).
4. **The AI is not in this slice, and nothing here may move the hash.**
   `PROMPT_VERSION_NAME` is `hc-6b-3` (`lib/ai/config.ts:221`) and
   `PROMPT_VERSION` is that name plus `configurationHash()` (`:229`). No
   unit below touches `lib/ai/`; the constraint is stated so a build
   session does not "tidy" something there while the G9 blind run is
   still free to submit.

---

## THE HARD GATES — G8, G12, G9 and G3, and how this slice builds under them

**G8 (§7.6, Appendix A.3) is the gate this slice is *made of*.** Every
other surface renders objects and G8 asks what the rendering leaks around
them. Search renders **matches**, and a match is itself an existence
oracle: a hit discloses that a term is in a document (TSD §7.1's own
words). RLS-11a is green at the row across all three relations; what
slice 8 adds is the **rendered-tree** half — the assertion that a
`summary` member's body-only term produces *the same observable output* as
a term present nowhere, driven from a LIVE context rather than from a
pgTAP transaction. That is A.5's search oracle, promoted from the database
to the browser.

**G12 is the final gate, not the first check** (§8.7). Search is a new
`page.tsx`, so three mechanisms fire before a human looks: the audit
manifest (`e2e/audit-manifest.ts`, derived from the filesystem by
`tests/design/audit-manifest.test.ts`) fails vitest until the route names
its leg; the page gate (`tests/app/page-gate.test.ts`) fails until the
page is listed **both ways**; and `tests/lint/answer-budget.test.ts`
fails until the tree and the surface are named in `RECORD_TREES` and
`RECORD_SURFACES` — the exact-set pin 7E added on R3/F-6. **A11Y-12 opens
`pending` tagged 8 at this gate and flips inside 8B** (Q5). G12-01 stays
`pending` at `gate`.

**G9 and G3 stand; nothing here depends on them.** The G9 gate is OPEN,
`BAND_ARTIFACT_ALLOWLIST` is EMPTY, all-high-risk is the shipping mode,
and search renders **approved objects only** — a signed band changes
nothing on this surface, by construction, for the same reason it changed
nothing on the four destinations.

**G4 and G7 still block. Nothing is production-activated.** No real family
data; fixtures only; **CI is KEYLESS**; browser legs are **LOCAL-gate
only** — no CI run can upgrade local gate evidence.

---

## What exists (do not rebuild) — verified against the tree this session

| Need | What is shipped, at `bb40021` | Gap |
|---|---|---|
| **The two vectors and their triggers** | `documents.tsv_summary` = title(A) + summary_text(B); `document_search_content.tsv_full` + `search_text_full` (the exact string the snippet is cut from); `tasks.tsv` = title(A) + detail(B); `timeline_events.tsv` = summary(A). Four GIN indexes. The `documents`-side sync trigger rebuilds the dsc row in the same transaction (`20260816120001`) | **None.** `episodes.tsv` and `profile_facts.tsv` stay unmaintained by decision (ADR-0009); §7.1 names three search relations |
| **The `view`-level read policy** | `dsc_select` — an EXISTS against `documents` requiring `view`, so the §7.2 LEFT JOIN *is* the level decision and there is no second code path (`20260816120002`) | **None** |
| **The §7.2 query, proven per rung** | `029:1–18` drives view / summary / log / hidden / non-member / care-ceiling / share / freeze, plus A.5's body-only oracle and the title-match snippet | **No caller.** Nothing in `lib/` or `app/` issues it |
| **The scan budget** | `scripts/bench/prf06.mjs` already benches `search_broad`, `search_count`, `search_narrow`, `search_ocr` and `search_tasks` against the ≤ 2,500 ms scan bound; PRF-06 records the one BREACH (3,490 ms) and the rewrite that met it | **No page-level measurement**, because there is no page |
| **The top-bar slot** | `TopBar({ search, feedback, members, user })`; `design_spec:128` fixes the §4 order — *"logo + wordmark · ask-the-record search field · (auto margin) · Feedback · avatars · user"* | **Nothing renders into `search`** |
| **The shell's per-page reads** | `app/(app)/[circle]/layout.tsx` makes exactly ONE `withRequestRole` call — `myMembership` (`lib/hc/tasks.ts:259`) — for the nav's tier courtesy, and falls OPEN on error | The §4.7.3 placeholder needs the circle's subjects. **A second call per screen is the cost this plan refuses** (item 2) |
| **Subject reads** | `circleSubjects(claims, circleId)` (`lib/hc/tasks.ts:298`) with `SUBJECT_SEQ` ordering; `hc.object_label_at` (`20260829120004:104`) | Available; the question is *where* it runs |
| **The answer budget** | `withPageBudget` / `withRouteBudget` (`lib/http/page-budget.ts:16, 36`); the scanner holds four record trees to it | The search tree does not exist, so it is not listed |
| **`private, no-store` on every page** | `proxy.ts:18` sets it on everything it passes | **None** — the search term never lands in a shared cache, and this is already true |
| **Assign / unassign / complete / snooze a task** | `hc.assign_task`, `hc.unassign_task`, `hc.complete_task`, `hc.snooze_task` (7A M1/M2, replaced at M5) | **No `hc.claim_task`.** `assign_task` requires `manage` on the task; `hc.revise_object`'s task allowlist is `title, detail, due_on, due_zone` (`20260825120001:34`), so `owner_member_id` is unaddressable through the generic patch. **No path at any layer lets a `view`-level member take an unassigned task** |
| **The access log read** | `access_log_select` (LOG-01), `hc.log_denied` collapse (LOG-02), the rendered + printable surface (PPL-04, 7C C5) | **`lib/hc/people#accessLog` is `order by seq desc limit 300` with no cursor** — OW-26 |
| **Group review of a multi-attachment arrival** | Parent + N children live since 1C/4B; each child advances independently | **No group flow** — and, measured this session, **no coverage row either** (Q3(c)) |

---

## THE THINGS THAT MUST BE SETTLED BEFORE A SCREEN IS DRAWN

### 1 — `ts_headline` returns MARKUP, and a snippet is document content

The §7.2 query calls `ts_headline('english', <text>, tsq)` with no options.
Postgres's defaults are `StartSel=<b>, StopSel=</b>` — so the column comes
back carrying HTML tags **wrapped around family content**. A React surface
has exactly two ways to render that string and both are wrong:

- escape it (the default), and the family reads `<b>metoprolol</b>`;
- `dangerouslySetInnerHTML`, and **document text becomes markup in the
  DOM**. The text concatenated into `search_text_full` includes
  `extracted_text` and `ocr_text` — machine-read strings from an
  adversary-supplied PDF (§4.10's threat, arriving through a different
  door).

**The decision: pass explicit `StartSel` / `StopSel` sentinels that cannot
occur in document text, split on them in the module, and render the
emphasis STRUCTURALLY** (a `<mark>` element built by React, never a string
inserted into the tree). `dangerouslySetInnerHTML` appears nowhere on the
surface and a scanner says so.

This is a **NAMED DEPARTURE from §7.2's literal text**, and it is named
here rather than discovered in a build session: the fourth argument
changes the *presentation* of the headline and changes **no** row, no
vector, no ranking and no text the snippet is cut from. §7.2's binding
property — *"the match and the snippet come from the same vector and the
same text"* — is untouched. **A one-line TSD erratum at §7.2** records
the options string, in the ADR-0038 D1 Q-C shape (*"the ADR binds; a
one-line PRD erratum at sign-off; no code change"*).

### 2 — The placeholder is subject-dependent, and the shell must not grow a second round trip

§4.7.3 fixes four strings, and one of them varies:

- one subject: `Search Nell's record` · two subjects: `Search the record`
- empty result: *"Nothing matching that, in what you can see."*
- first-open hint: *"Find documents, dates and tasks."*

The field lives in the shell, so the one-subject form needs the subject's
**name** on every screen in the circle. `circleSubjects` is a second
`withRequestRole` call in a layout that has one and carries **no**
`AnswerBudget` — the layout is the one site in ADR-0028 D15's enumeration
that degrades rather than refuses, and OW-03's ruling budgeted *pages and
the routes they POST to*, not it.

**The decision: widen `myMembership`'s existing single query** to return
the circle's subject display names alongside `id` and `tier` — one round
trip, unchanged, the read already inside the layout's one `try`/`catch`
that falls open on failure. The placeholder degrades to `Search the
record` when the read fails, which is true for every circle and promises
nothing. **Rejected:** a second call per screen (a per-screen cost for a
placeholder); **rejected:** shipping `Search the record` everywhere and
taking a PRD erratum (it spends the PRD's specificity to save one column).

### 3 — A search writes NOTHING to the access log, and the log's shape does not change

Verified against TSD §2.8 and the writers on disk: the only read that logs
is a **byte** read (`hc.log_artifact_read`, `20260821120001:51`), and the
only other family-visible writer is `hc.log_denied`'s collapse. Neither
§2.8 nor §4.6.5 asks for a search entry, and §7.4 forbids *"anything the
family can see about their own usage"* from carrying counts. Search
therefore adds **no** event type, **no** row, and **no** `hc.log()` call.
The `artifact_read` entry still fires when a reader opens the document
*behind* a result, exactly as it does from the Documents list.

**Named so it is not rediscovered:** at `view`, a snippet discloses
`extracted_text` / `ocr_text` with no log entry — which is precisely what
the document detail page already does for the same member (facts render at
`view`; only bytes log). The surface is not widening the log's silence, it
is inheriting it. If the owner wants search logged, that is DDL (a new
`hc.log_event_types` code) and an owner amendment, not a build decision.

### 4 — The ingress bound on `q`, and the budget around the read

The OW-24 precedent is one round old: an unbounded read that answers
*outside* the budget is raced against nothing. `q` arrives in a URL, so
there is no body to bound — but there is a length, and there is a budget.
**The decision:** `q` is capped (a stated character limit, refused with the
empty-result copy rather than an error — `websearch_to_tsquery` never
raises, and the surface must not start), the three reads run inside **one**
`withPageBudget`, and the overrun renders the same honest slow answer the
record pages already render. No unbounded hop on this surface, and the
scanner holds the tree to it.

### 5 — Counts are post-filter over the RENDERED tree, and there is no total

§7.4: no *"showing 3 of 11"*, no count of withheld results, **anywhere**.
The surface therefore renders **20 per kind**, three groups, and **no
total, no pagination and no "more"**. A group with nothing in it renders
nothing — not *"0 documents"*, which is a count. Assertions are made over
the rendered tree, the REV-02 / TSK-03 discipline, not over the module's
return value.

### 6 — Search is in the TOP BAR, so the nav's tier courtesy does not reach it

`navFor(tier)` hides Documents, Timeline and People from a `care_circle`
member as a **courtesy** (NAV-01; the surfaces refuse for themselves). The
search field is not in `NAV_MANIFEST` and must not be added to it: hiding
the field from a caregiver would be a *promise* that she has nothing to
find, and she does — her assigned tasks. **The field renders for every
member; the results obey AC-TASK-5** — a caregiver's search returns her
assigned tasks and nothing else, in filters, counts and search, which is
the acceptance criterion's own list. This is a leg, not a comment.

---

## The ruled intake, priced — not folded (Q3)

Each item's state was **re-verified at the site this session**; *home*
means the unit that takes it, *NOT THIS SLICE* means named here with its
reason and its standing home.

| Item | Verified state at `7e18164` | Priced | Recommended home |
|---|---|---|---|
| **Claim / self-assignment** (ADR-0033 Q-H → ADR-0035 D9 → **ADR-0036 Q-D: "RULED: slice 8"**) | `hc.assign_task` refuses below `manage` on the task; `revise_object`'s task allowlist excludes `owner_member_id`; no claim path at any layer | One definer + one event type + pgTAP; then one control and one route | **8A M1** (DDL, Tier 1) → **8C** (the surface) |
| **ADR-0038 D6 item 1 — `hc.shares_for` carrying the assignment task's live status** (R2/F-4's wider form) | **The honest surface already landed at 7D**: `documents/[document]/page.tsx:455-460` renders a link to `/[circle]/tasks/{created_by_assignment_of}` instead of an Unshare for assignment-created shares. D6 itself says *"the honest surface does not need it"* | Widening a definer's return type re-pins `002`'s exact sets and the M5 signature, for a column the surface does not read | **KILL, with the reason on the record.** Not deferred — deferring implies a later need that the landed fix removed |
| **ADR-0038 D6 item 2 — a level-bound step-up `target_ref`** (R3's dissent 1) | `hc.set_grant` composes `target_ref` as `member:subject:domain` and **not the level**; `rl` travels in the URL. R3: *"the app cannot fix this alone … if the owner wants level-bound step-up it is a slice-8 DDL question"* | A `create or replace` of `hc.set_grant` + the mint call site + STP-01/02 and GRT-01 re-pinned in the same commit + PPL-02's leg re-run | **TAKE — 8A M2.** The exposure is a coordinator confirming a level she did not see; the slice is already paying for a migration, and an auth binding with no home becomes permanent |
| **ADR-0038 D6 item 3 — share-includes-bytes** | Contingent on **re-ruling Q-A**, which ADR-0038 D1 RATIFIED (*"A document share reaches the ROW, not the arrival's bytes or facts"*) | Not priced — a settled ruling is not a finding | **NOT PLANNED, contingent.** It re-enters only as an owner amendment that re-opens Q-A |
| **OW-26 — the access log's cursor** (ADR-0038 D3, R4/F-3 remedy (a); MAJOR; home slice 8) | `lib/hc/people#accessLog` is `order by seq desc limit 300`; `seq` 1 — §7.5's custodianship declaration — is the FIRST row dropped. LOG-01's app half is green only in the narrower words 7E earned | A `seq` cursor on an RLS-filtered read + the printed projection reaching the same set + a >300-row fixture. **App-only**: the policy already decides | **8C** — its reader is a person reading a printable record. The pricing rule's own test |
| **6C — multi-attachment group review** (AC-INBOX-5 / AC-INBOX-13; slice-7 Q4(a): *"home a Care Inbox increment (6C) before slice 8"*) | **NOT BUILT.** And, measured this session: **there is no coverage row for AC-INBOX-5 or AC-INBOX-13** — `docs/coverage.md` cites ten AC-INBOX criteria and neither of those two. The slice-6 and slice-7 plans both say *"rows stay `pending`"*; there are no rows to stay pending | A composition over the review screen — N children as one flow, one receipt (a 6B-B7-sized unit, Tier 2) | **Q3(c).** Recommended: **DEFER with a named home, and OPEN `GRP-01` `pending` NOW** so the absence is visible for the first time |
| **OW-08/09/10/12/13/14** (six OPEN rows) | Owner-track and pipeline: the four unbounded fetches, the unobserved hosted runtime, render+OCR off the request process, the starvation heartbeat, leg 38 under load, the `HopCost` harness | Not this slice's work — but **their escalation clock has expired** (Q6) | **NOT THIS SLICE**, named; Q6 puts the clock |

---

## Migration bound (Q2): **≤ 4** (M1–M2 planned, M3 + M4 reserved and NAMED)

**Bounds are FRESH.** Slice 7 closed at **5 of ≤ 6** with M6 UNCONSUMED,
and that bound is spent and closed; it does not carry. **The migration
bound does not exist until this gate sets it.**

**Migrations on disk: 74** (`supabase/migrations`, counted this session).
**pgTAP files: 69** (`supabase/tests`, `000`–`069` with `065` unused),
Σ **1,809** at `ccd854b`.

| # | File | Contents | Closes |
|---|---|---|---|
| **M1** | `task_claim` | **`hc.claim_task(p_task uuid)`** — the caller takes an **unassigned, open** task for **herself**. Refused unless `hc.visible_at(ctx, subject, taint, taint_resolved, 'task', p_task, owner_member_id) >= 'view'`; refused if `owner_member_id is not null` (reassignment is `unassign` + `assign`, which stays `manage`'s); refused under freeze through the same one function. Writes `owner_member_id = the claimer's member row`, `assigned_by = the same account`, `assigned_at`. **New event type `task_claimed`**, distinct from `task_assigned` so the log can tell *handed to you* from *you took it* — AC-TASK-2's *"every assignment has a human actor"* is satisfied either way, and the distinction is what makes the log readable. **Why this is safe below `manage` and `assign_task` is not:** a claim creates **no** object share, writes **no** `written_for_member_id` instruction, and moves work only to a member who could already read the task. §4.5.6's taint collision cannot arise, because the claimant IS the reader. **The AI has no path into this function** (§6.5). Refusals in one shape. | AC-TASK-1's claim half; PRD §4.5.1's *"Claims, reassigns, completes, snoozes, adds"*; ADR-0036 Q-D |
| **M2** | `step_up_level_binding` | **`create or replace function hc.set_grant(...)`** composing `target_ref` as `member:subject:domain:**level**`, and the mint call site passing the level it is about to confirm. Consumed **only** if Q3(a) rules item 2 TAKEN; the ruling is quoted in the commit. STP-01/02's and GRT-01's exact-set pins are re-pinned **in the same commit**; no in-flight token can exist (nothing is production-activated). | ADR-0038 D6 item 2; R3's dissent 1 |
| **M3** | *(reserved)* | **Round-28 dispositions** — the standing precedent since 2A. Consumed only by a round's ruling. | — |
| **M4** | *(reserved, NAMED)* | **A search index, consumed ONLY on a MEASURED PRF-06 breach at the 8B head.** PRF-06 has breached once already (`search_broad` 3,490 ms against 2,500) and the breach clause is a live part of that row. 8B adds two branches the bench covers (`search_tasks`) and one it does not (timeline), over a fixture the bench does not build. If the measurement at the 8B head breaches, the exit is an index — an append, never an edit — **with the measured numbers pasted into the red commit**. If it does not, **M4 closes UNCONSUMED.** | PRF-06's breach clause; §7.7 |

**Expected close: 2 of ≤ 4** if Q3(a) TAKEs item 2 and no PRF-06 breach
appears; **1 of ≤ 4** if item 2 is deferred. **A reserve not consumed
closes UNCONSUMED, and the bound closes at what was spent.** Anything past
≤ 4 is a **recorded owner amendment made before a line is written**;
**shipped migrations are never edited** and recovery is forward-fix.

The tree moves **74 → 75 or 76** migrations and **69 → 70 or 71** pgTAP
files, one per consumed slot (`070`, `071`).
`supabase:supabase-postgres-best-practices` is loaded **before any DDL is
authored** and stands for the whole 8A build: every new function
`security definer set search_path = ''`, owner `hc_internal`, EXECUTE
revoked from `public`/`anon`/`hc_pipeline`/`hc_admin` and granted to
`authenticated` alone (`002` pins both on every migration); **privilege
closure asserted from the CATALOG, never probed by calling as a denied
role** (the PG17 segfault); the reset is clean-leg at the **exact** new
count.

**The zero-DDL alternative, priced honestly.** With no migration slice 8
still ships Search in full — its machinery is 1D's and needs nothing new.
What it does not ship is **claim**, which ADR-0036 Q-D has already ruled
to this slice and which ADR-0033 Q-H recorded as an express Tasks
requirement whose omission *"does not silently remove it"*. Deferring it a
third time (7B → 7C → here) with no DDL is the shape the owed ledger
exists to stop. **The zero-DDL exit is therefore available and is not
recommended.**

---

## Dependency bound: **0 runtime additions; the dev reserve stays UNSPENT**

`package.json` at `bb40021`, verified from the installed manifest this
session: **13 runtime · 15 dev**.

Runtime: `@anthropic-ai/sdk`, `@napi-rs/canvas`, `@supabase/ssr`,
`@supabase/supabase-js`, `@tesseract.js-data/eng`, `next`, `pg`,
`pdfjs-dist`, `react`, `react-dom`, `server-only`, `tesseract.js`,
`tus-js-client`.

**Nothing in this slice needs a package.** Ranking, matching and
snippeting are Postgres's (`websearch_to_tsquery`, `ts_rank`,
`ts_headline`); the field is a plain GET form; grouping and labels are
React. **If a build session finds it needs one, it is an owner ruling with
the licence read from the installed manifest and the command's output
pasted into the red commit** — never a build decision. The bound is stated
as zero so that *"we added one small thing"* cannot pass unnoticed. The
**dev reserve stays UNSPENT — a fifth slice running.**

---

## The increment — the split, argued (Q1)

### What the tree says

Slice 7 ran **three** increments and each bought its own round: 7A (DB,
Tier 1, round 24) · 7B (Tasks + Timeline, Tier 2, round 26) · 7C
(Documents + People & roles, Tier 1, round 27). The calibration in
`docs/process/slice.md` §1 is that DB increments hold flat at 20–30
commits because they have a mechanical oracle, and app increments blow up
because review substitutes for the missing one and **scales with surface
area**.

Slice 8's surface area is small. Search is one page, one field and one
module. Claim is one control and one route. The cursor is one module
change. **The split rule is what fixes the shape**: the claim migration is
Tier 1, the surfaces are Tier 2, and *"an increment may not contain both a
Tier 1 unit and a Tier 3 unit"* — so the DDL is its own increment,
planned and reviewed first, and the process change Q7 recommends
(**Tier 3**) may not ride with it.

### The three increments

| # | Increment | Branch | Tier | Round | Depends on |
|---|---|---|---|---|---|
| **8A** | The database increment — M1 `task_claim`, M2 `step_up_level_binding` (Q3(a)) | `slice/8-claim-db` | **Tier 1** | **28** | nothing |
| **8B** | **Search, the surface** — the module, the field, the results page, the legs | `slice/8b-search-app` | **Tier 2** | **29** | nothing (its DB half is 1D's) |
| **8C** | **Claim's surface and the access log's cursor** — the control, the route, OW-26 | `slice/8c-claim-log-app` | **Tier 2** | **30** | 8A merged |

**Why 8B does not wait for 8A.** Search depends on no migration. Ordering
it second rather than first is the split rule's *"the Tier 1 units become
their own increment, planned and reviewed first"* — not a data
dependency — and it means the slice's own row (§11.1 row 8) is not
hostage to a round on a definer.

**Why 8C is not folded into 8B.** They share no reader, no module and no
oracle: search's lens is leakage around results; 8C's is a write path
below `manage` and a paginated evidentiary record. One session attacking
both attacks neither well — the 6B shape at smaller scale.
**Alternative, and it is defensible: 8A → ONE app increment carrying
search, claim and the cursor.** It saves one round; it is the shape the
owner may prefer if the calendar matters more than the lens. It is named,
priced and not recommended.

**Fail closed.** Any unit whose tier has to be *argued* is **Tier 1 until
the owner rules it down**, and a tier is never lowered mid-slice. Two
units are argued below and both are put to the owner rather than assumed:

- **OW-26's cursor (8C).** The Tier-1 trigger is *"writes the access log
  or ledger"*. A cursor **reads** it; the policy already decides which
  rows exist and the change adds `where seq < $n` to a read that is
  filtered before it is ordered. **Recommended: Tier 2, ruled down
  explicitly.** Fail-closed default if unruled: Tier 1.
- **The preflight guard (Q7).** Test-only, so **Tier 3** — which is
  exactly why it cannot ride 8A, and why the recommendation is its own
  small PR before the 8A build kickoff (the slice-7 `chore/process-retune`
  precedent).

### 8A — the database increment — Tier 1

**M1 FIRST.** Units, each red→green with the failure signature in the red
commit:

1. **`hc.claim_task`** + `task_claimed` in `hc.log_event_types` + pgTAP
   `070_task_claim.sql`: the `view` rung claims; `summary` refused;
   an already-owned task refused; a `care_circle` member who cannot see
   the task gets the **same refusal shape** as one who can see it and is
   refused for another reason (the ordered-pair discipline — a refusal
   that discriminates is an oracle); freeze closes it; the log entry
   names the claimant as actor; **no share and no instruction row is
   created by any path through this function** (asserted, not argued).
2. **M2** (only if Q3(a) TAKEs it): `hc.set_grant`'s `target_ref` gains
   the level; `071_step_up_level.sql` drives a token minted for
   `summary` and posted for `manage` and asserts the refusal; STP-01/02
   and GRT-01 re-pinned in the same commit.
3. **Closure at the 8A head:** clean-leg reset at the **exact** new count
   (75 or 76) · pgTAP all green, files and Σ recorded **exactly** ·
   concurrency all green, **teed** · `db:verify --fail-on warning` clean
   · the upgrade leg green — **both of these have NOT RUN since 7A and
   this increment is the first since to ship DDL** · vitest recorded
   exactly, by run · **the browser gate, unconditional for Tier 1 and
   with its new total stated exactly, never as "unchanged"** (ADR-0033
   D19.14; a kickoff may not narrow it) · lint / typecheck /
   production build clean, each run solo · gitleaks clean.

### 8B — Search, the surface — Tier 2

1. **`lib/hc/search.ts`** — three reads on the request-role channel, one
   `withRequestRole`, each `limit 20`, `circle_id` explicit:
   **documents** (the §7.2 query, with the item-1 headline options and
   nothing else changed), **tasks** and **timeline_events** (single
   vector each — §2.11's *"the whole rows are summary-readable, so one
   vector leaks nothing"*). Rows carry kind, id, subject id, category
   where the kind has one, rank and the split snippet parts. The module
   returns **no total** and has no parameter that could produce one.
2. **The field** — `components/shell/SearchField.tsx`, a GET form to
   `/[circle]/search`, rendered into `TopBar`'s `search` slot by the
   circle layout; the §4.7.3 placeholder from item 2's widened query; the
   first-open hint *"Find documents, dates and tasks."*; no autocomplete
   attribute, no suggestion list, no client fetch (§7.4 — *"a decision,
   not an omission"*, and the absence is asserted).
3. **`app/(app)/[circle]/search/page.tsx`** — inside `withPageBudget`;
   `q` capped; results grouped by kind, **labelled by subject** (§7.6:
   *"every result carries its subject label … so a two-subject circle
   never renders an unlabelled row"*), each linking to the object; the
   empty copy verbatim; emphasis rendered structurally. Listed in
   `page-gate.test.ts` **both ways**, in `RECORD_TREES` **and**
   `RECORD_SURFACES`, and in `e2e/audit-manifest.ts`.
4. **`e2e/search.spec.ts`** — the legs, with the leak leg first: a
   `summary` member searches a term present **only** in a document body
   and gets *the same rendered shape* as a term present nowhere; a `view`
   member gets the body snippet and the OCR hit; the caregiver's search
   returns her assigned tasks and nothing else (AC-TASK-5); a share
   widens the one named object and no object derived from it; the empty
   copy; the a11y/390 px audit (A11Y-12). Per-file budget in the
   `record.spec` / `documents.spec` shape — **never `workers: 1`**, which
   the config already sets.
5. **The measurement.** A p95 recorded at the 8B head for the page, and
   the `prf06.mjs` scan legs re-run against the 8B fixture. **The number
   goes in the deltas doc as a number**, and a breach is M4's condition.

### 8C — Claim's surface, and the access log's cursor — Tier 2

1. **Claim** — the control on the Tasks list's `Unassigned` filter and on
   task detail; `POST /[circle]/tasks/[task]/claim/submit` inside
   `withRouteBudget`; both listed in `RECORD_SURFACES` and driven by
   `page-gate.test.ts`; the refusal renders the honest sentence, not
   *"That couldn't be done just now."* for a case the surface can name.
   A leg proves a `view`-level member claims and the task becomes hers,
   and that no control is offered where the function would refuse.
2. **OW-26** — `accessLog` gains a `seq` cursor; the page and the
   **printed** projection reach the same set; a test drives a circle
   **past 300 rows** and asserts `seq` 1 — the custodianship
   declaration — is reachable. LOG-01's app half is **amended, never
   rewritten**, to point at the new row.
3. **The batched Tier-3 pass** (OW-05's standing quota) — **8 legs**
   audited title-against-assertion at the 8C close-out, findings recorded
   whether or not they move a verdict.

---

## Coverage rows to open (`docs/coverage.md` gains "## 8 — search, and the ruled intake")

Verified this session with the process test's own parser: **267 rows ·
green 250 · review 9 · pending 8**, and **no row's Slice cell mentions 8**.
The eight `pending` are FRZ-16b, RLS-11b, SIG-01, DEL-01, ADM-01, G12-01,
UXA-03, LOG-03 (the last never green by ruling). The nine `review` are
DEF-12, VIS-09, PLT-04, MUT-01, MUT-02, MUT-03, UPG-01, UXA-01, DS-08.

| ID | Assertion (compressed) | Layer | Slice | Status at slice end |
|---|---|---|---|---|
| **TSK-05** | `hc.claim_task`: a `view`-level member takes an **unassigned, open** task for herself and no other; `summary`, an owned task, a non-reader and a frozen circle refused in ONE shape; the claim creates no share and no written instruction; `task_claimed` names the claimant as actor (AC-TASK-1 claim half, AC-TASK-2) | pgTAP + app + e2e | 8A/8C | green |
| **STP-03** | *(only if Q3(a) TAKEs D6 item 2)* Step-up binds the **level** as well as `member:subject:domain`: a token minted for `summary` does not consume against a post of `manage` for the same triple | pgTAP + app | 8A | green |
| **SRCH-03** | The surface's leakproofness: ONE RLS-true read per relation, no second code path; a `summary` member's **body-only** term returns the same rendered shape as a term present nowhere, driven from a LIVE context; a share widens the one named object through search and never an object derived from it; the care-circle ceiling holds in search (AC-DOC-4, AC-PERM-6, AC-TASK-5) | app + e2e | 8B | green |
| **SRCH-04** | The results' shape and copy: grouped by kind, **labelled by subject**, each link resolves to the object; §4.7.3's four strings verbatim; **no total, no count of withheld results, no autocomplete, no spelling correction, no prose answer and no composition across results** — asserted as ABSENCES over the rendered tree (AC-HOME-4, AC-DOC-1's search half, AC-TL-1's *"through search"*) | app + e2e | 8B | green |
| **SRCH-05** | The snippet is cut from the matched text and reaches the DOM as **structure, never markup**: explicit `ts_headline` sentinels, split in the module, `<mark>` built by React; **no `dangerouslySetInnerHTML` anywhere on the surface**, fence-tested; `ocr_text` findable at weight D and never outranking a title | app + e2e | 8B | green |
| **SRCH-06** | Latency and bounds: `q` capped at ingress and refused with the empty-result copy; the three reads inside ONE `AnswerBudget` with the overrun rendering the honest slow answer; a **measured** page p95 recorded at the 8B head against PRD §13.2, and the `prf06.mjs` scan legs re-run against the 8B fixture (§7.7) | app + bench | 8B | green |
| **A11Y-12** | The search surface audited: the field labelled and reachable, results as headed groups, emphasis not conveyed by colour alone, 390 px and keyboard | e2e | 8 | **pending** at this gate → green in 8B |
| **LOG-04** | The access log reaches **every** entry the reader may see: a `seq` cursor, the printed projection reaching the same set, `seq` 1 reachable on a circle past 300 rows (OW-26; LOG-01's app half amended to point here, never rewritten) | app + e2e | 8C | green |
| **GRP-01** | *(opened `pending` by Q3(c) — the row that does not exist today)* Multi-attachment group review: N children reviewed as one flow with one receipt; partial states presented honestly and blocking on none (AC-INBOX-5, AC-INBOX-13) | app + e2e | **6C** | **pending** — never green on the arrival shape alone |

**Rows that do NOT move:** RLS-11b (`pending`, 2+ — the notification and
export channels), FRZ-16b, DEL-01, ADM-01, **SIG-01 (still NOT absorbed,
fifth slice running)**, G12-01 (`gate`), UXA-03, LOG-03 (never green by
ruling). **SRCH-01, SRCH-02, DSC-01, RLS-11a, PRF-04 and PRF-06 stay
green at their own layers and are NOT re-earned by this slice** — the app
rows are new rows, because *"a requirement spanning layers is split into
one assertion per layer, never claimed green at a layer that cannot prove
it."* **No row flips outside a ruling; pending never counts as green.**

---

## What stays out, NAMED — the exclusion list

Nothing below is forgotten and none of it is quietly absorbed. Each has a
home.

- **Home (§11.1 row 9).** The search **field** ships in the shell because
  §4.7.3 puts it in the top bar and the slot has been reserved for it
  since slice 3 — **Home itself does not.** AC-HOME-4 is a search
  criterion and flips here; **AC-HOME-1, -2 and -3 do not move.** No
  day-one card, no router, no *"How each subject is"*, no *"What needs
  review"* count on a Home that does not exist.
- **Autocomplete, spelling correction, cross-circle search, counts of
  withheld results, a prose answer, and retrieval-augmented Q&A** (§7.4,
  §4.7.3, PRD §6.1). Decisions, not omissions — and asserted as absences
  by SRCH-04 rather than left to be true by accident.
- **Pagination, "load more", and any total.** A ranked set with no count
  has no honest pager in Phase 1; 20 per kind is the whole surface.
- **`log`-level presence in search** (§7.6). `hc.presence()` is a separate
  call with a separate return type and merging the two would put a
  snippet in front of a member entitled only to existence.
- **`episodes` and `profile_facts` as search relations.** §7.1 names
  three; their `tsv` columns stay unmaintained by ADR-0009's decision.
- **Search over arrivals or the Care Inbox.** Not record relations; the
  inbox is a queue, not the record.
- **Index-level circle isolation** (§7.5's *"wherever the engine
  permits"*). One Postgres instance means one physical GIN index;
  isolation is **by predicate**, and partitioning `documents` by circle is
  the named upgrade path, not Phase 1 work.
- **A search entry in the access log.** Named in *Settled before a
  screen* item 3; DDL and an owner amendment if ever wanted.
- **`hc.shares_for` widened** and **share-includes-bytes** — Q3(a)'s KILL
  and its contingent NOT PLANNED.
- **Multi-attachment group review (6C)** — Q3(c)'s ruling; `GRP-01`
  carries the absence.
- **OW-08, OW-09, OW-10, OW-12, OW-13, OW-14** — the four remaining
  unbounded fetches (mail, postmark inbound, the two worker fires), the
  unobserved hosted runtime, render + OCR off the request process, the
  starvation heartbeat, leg 38 under genuine load, the `HopCost` harness.
  Owner-track and pipeline; **Q6 puts their expired clock**, which is not
  the same as taking the work.
- **Admin (row 10), Notifications (row 11), export and deletion (G5, G6),
  the admin wrappers (ADM-01), the `exports` bucket.**
- **Parent login** (CIR-06 is one UPDATE, no surface), **time-boxed
  shares** (Phase 4), **caregiver ingestion** (Phase 2), **the Person
  profile as a surface** (PRD §3.3, Phase 2), **Memories / Family Album**
  (the CONNECTION group still does not render — a decision, not a stub).
- **Anything under `lib/ai/`** — by constraint, not by omission: the hash
  must not move while the G9 blind run is free to submit.
- **The G3 activation rows, the G9 blind run and its sign-off, the two G4
  deploy rows and G7's hardening set** — deploy-level and owner-track,
  untouched by this slice.

---

## G12 per increment (Q5)

**A11Y-12 opens `pending` tagged 8 at this gate and flips inside 8B**, on
the A11Y-07 precedent: a structural accessibility failure found at G12
*"is a redesign, not a fix."* The audit manifest grows mechanically —
`tests/design/audit-manifest.test.ts` derives the route set from the
filesystem and fails vitest on the new `page.tsx` until it names its leg —
so the row is the thing that makes the leg's **absence** visible, and the
manifest is the thing that makes the route's absence visible. **G12-01
stays `pending` at `gate`.**

8C adds a **control** and a **route**, not a new audited surface: the
claim control is audited by the existing record leg
(`a11y.spec — "the record surfaces: tasks and timeline, list and detail,
audited at 390px"`) and the keyboard leg A11Y-09 covers the flow. **No new
a11y row for 8C**; the claim on the Tasks list is named in that leg's
manifest entry so the claim is a citation and not an assumption.

**Alternative, rejected:** extend the existing a11y families silently and
open no row. A row is what makes a leg's absence visible — Q5's own
argument at slice 7, and it held.

---

## The owed ledger: the expired clock and the burn-down quota (Q6)

Re-derived by command this session with the process test's parser:
**`docs/owed.md` — 26 rows · OPEN 7 / 25 · TAKEN 1 · RISK 1 · CLOSED 17**,
and the OPEN set is **OW-08, OW-09, OW-10, OW-12, OW-13, OW-14, OW-26**.
The prose line and the table agree.

**Two ledger rules bear on this slice and they pull in opposite
directions.**

1. **The burn-down quota:** *"each slice closes at least as many items as
   it opens, plus five."* Slice 8 opens **0** and can close **1** —
   OW-26, the only OPEN row with a home here. **On its face the quota
   cannot be met**, and it cannot be met by any slice, because the other
   six rows are owner-track and pipeline work with no surface to ride.
2. **The escalation rule:** *"An OPEN row with no owner slice that
   survives two round closes is auto-escalated to the owner for a kill
   ruling."* The ledger's own intake note says these six went on that
   clock **from round 24**. Rounds **24, 25, 26 and 27** have closed
   since. **The clock expired at round 26 and no escalation was sought.**

**Recommended: rule them together.** The quota is met for slice 8 by
OW-26's close **plus a kill/keep ruling on the six**, taken at this gate
rather than deferred a fifth round — each row either **KILLED(adr)** with
the argument, **PROMOTED(row)** to a named quantified entry gate on a
named slice (the `bounded-deferral-gates` exit the ledger already
defines), or **kept OPEN with a fresh owner-track date**. The mechanism is
already written down; what is missing is the ruling.

**Named plainly, because it is the ledger's own failure mode:** the file
exists because *"the slice-5B queue stays 39 OWED"* appeared verbatim in
three consecutive rounds. Six rows sitting past an expired auto-escalation
clock is that shape, one size smaller.

---

## The two round-27 host traps (Q7)

Both were paid for in round 27, neither is in `docs/process/traps.md`, and
the file is **at its cap: 214 lines of content, 215 by the test's own
count** (`tests/lint/process.test.ts`, `CAPS['docs/process/traps.md'] =
215`). A row costs an eviction. **§9's rule decides both:** *"if it can be
a scanner, a manifest, or an exact-set assertion, it must be"* — which
that section says applies to this file too.

**Trap 1 — Next 16 refuses a second `next dev` in the same directory
regardless of port.** A peer's server on **3100** killed the gate before a
leg ran while `scripts/preflight.mjs` reported **SAFE**: its port table is
`{ api: 54341, db: 54342, mailpit: 54344, dev: 3000, fixture: 8787, clamd:
3310 }` (`scripts/preflight.mjs:53`) and knows nothing of 3100. **This is
mechanically checkable, and better than checkable — the lock names the
peer.** Verified in the installed package this session: Next **16.3.1**
writes `join(distDir, 'lock')` and, on failure for `next dev`, reads the
lockfile's own content and prints the running server's **PID** and
**appUrl** (`node_modules/next/dist/build/lockfile.js:87`
`parseDevServerInfo`, `:166–196` `acquireWithRetriesOrExit`).

> **Recommended: a preflight check, NOT a traps row.** `preflight --for
> e2e` reads `.next/dev/lock`, parses it, and — if the PID is live —
> refuses in the lease's own shape, **naming the peer's port and PID**,
> which is strictly more than a human-readable trap could do. No eviction;
> the cap holds. Cost: one check plus its negative test.

**Trap 2 — this host completes a 58-leg gate only with ~1.2 GB free.**
The owner closes VS Code / Chrome / ChatGPT; `NODE_OPTIONS=--max-old-space-size=1536`;
`hc_clamd` healthy near 0 % CPU first; and **a dying run clobbers
`.gate/e2e-run.json` — preserve it before any re-run.** Half of this is
already covered: traps §1 governs the diagnosis, §7 governs `hc_clamd`,
§6 governs preserving evidence.

> **Recommended: a preflight WARN plus one line in the gate protocol, and
> NO traps row.** `preflight --for e2e` reads free physical memory and
> **prints the measured number against a stated floor** as a WARN (never a
> refusal — the host's condition is the owner's call, and a hard floor
> would block a legitimate run); `docs/ops/e2e-local-gate.md` — the
> document anyone running the gate already has open — carries the
> `NODE_OPTIONS` line and the `.gate/e2e-run.json` preservation step. No
> eviction; the cap holds.

**Both changes are TEST-ONLY, therefore Tier 3, therefore they may not
ride 8A** (the split rule). **Recommended: one small PR,
`chore/preflight-dev-lock`, owner-merged before the 8A build kickoff** —
the slice-7 `chore/process-retune` precedent exactly, and it puts the
guard in place before the slice's first gate rather than after it.
**Alternative: fold both into 8B's first unit** — one fewer PR, and 8A's
gate runs unguarded, which is how round 27 lost four runs.

---

## The questions as put to the owner

**The standing rule: an unanswered question defaults to NOT PLANNED, and
the build does not start** (ADR-0006). Each question carries the
recommendation the build would execute on, and names the alternative and
why it is not recommended.

**Q1 — The split and the tiers. Recommended: THREE increments —
8A (DB, M1–M2) Tier 1 → round 28 → merge; 8B (Search) Tier 2 → round 29
→ merge; 8C (claim's surface + OW-26) Tier 2 → round 30 → merge.** On
three tree facts: (1) `hc.claim_task` does not exist and no path at any
layer lets a member below `manage` take a task, so a DB increment is not
optional and the split rule puts it first; (2) 8B depends on no
migration — its DB half went green at 1D — so search is not hostage to a
round on a definer; (3) 8B and 8C share no reader, module or oracle.
**Ruled down explicitly with this question: OW-26's cursor is Tier 2**,
not Tier 1 — it reads a log the policy has already filtered and writes
nothing; **unruled, it is Tier 1 by the fail-closed rule.**
**Alternative: 8A → ONE app increment (search + claim + cursor)** —
cheaper by a round, defensible, and it repeats 6B's shape knowingly.
Branches: `slice/8-claim-db`, `slice/8b-search-app`,
`slice/8c-claim-log-app`.

**Q2 — The migration bound. Recommended: ≤ 4** — **M1** `task_claim`
(`hc.claim_task` + the `task_claimed` event type) · **M2**
`step_up_level_binding` (consumed only if Q3(a) TAKEs D6 item 2) · **M3**
reserved for round-28 dispositions · **M4 reserved and NAMED for a search
index, consumed ONLY on a MEASURED PRF-06 breach at the 8B head with the
numbers pasted into the red commit.** Expected close **2 of ≤ 4** (or 1 if
item 2 is deferred); an unconsumed reserve closes UNCONSUMED and the bound
closes at what was spent. **With it: `hc.claim_task` requires `view` on
the task**, refuses an already-owned task, creates no share and no written
instruction — the narrowness is the safety argument. **Alternative:
`summary` may claim** — rejected: a member who cannot read the detail
cannot take on the work it describes. **Alternative: zero DDL** — priced
above; it defers ADR-0036 Q-D a third time and is not recommended.

**Q3 — The ruled intake, as a block, with three sub-rulings.**
**(a) The three ADR-0038 D6 DDL items:** item 1 (`hc.shares_for` carrying
the assignment task's live status) **KILLED with its reason** — the honest
surface landed at 7D (`documents/[document]/page.tsx:455-460`) and D6
itself says the surface does not need it; item 2 (a level-bound step-up
`target_ref`) **TAKEN as 8A M2** — the exposure is a coordinator
confirming a level she did not see, and an auth binding with no home
becomes permanent; item 3 (share-includes-bytes) **NOT PLANNED,
contingent** on an owner amendment re-opening Q-A, which ADR-0038 D1
ratified. *Alternative for item 2: DEFER to the admin slice*, whose
ADM-01 wrappers already carry operation-bound step-up — defensible,
and it buys a slice's delay on a permission binding for no saving here.
**(b) OW-26 is TAKEN into 8C** against a named unit, per the pricing rule
(*"take the owed finding whose failure a person now reads"* — the reader
is a person printing an evidentiary record). **(c) 6C — multi-attachment
group review: DEFERRED with a named home, AND `GRP-01` opened `pending`
at this gate.** The slice-6 and slice-7 plans both promised the rows would
"stay `pending`"; measured this session, **AC-INBOX-5 and AC-INBOX-13 have
no coverage row at all**, so nothing has been holding the promise. Opening
the row is what makes a third slip visible. *Alternative: take 6C as
slice 8's fourth increment* — its reader is the Care Inbox, and folding an
inbox composition into a search slice is the bending the slice-7 plan
warned about; also defensible if the owner wants it sooner.

**Q4 — The four decisions that must be settled before a screen is
drawn. Recommended: as argued above, as a block.** (1) `ts_headline` gets
explicit `StartSel`/`StopSel` sentinels, the module splits on them, React
builds the emphasis, and **`dangerouslySetInnerHTML` appears nowhere on
the surface** — recorded as a **NAMED DEPARTURE from §7.2's literal text
with a one-line TSD erratum**, because the fourth argument changes
presentation and changes no row, vector, ranking or matched text.
(2) The §4.7.3 placeholder rides a **widened `myMembership` query** — one
round trip, unchanged — and degrades to `Search the record` when the read
fails. (3) **A search writes nothing to the access log**; the
`artifact_read` entry still fires behind a result, and logging search
would be DDL and an owner amendment. (4) `q` is capped at ingress and
refused with the empty-result copy; the three reads answer inside **one**
`AnswerBudget`. **Alternative on (1): strip the default `<b>` markup in
the module** — same outcome, one more parsing step over family content,
and it leaves a default nobody chose. **Alternative on (2): a second read
per screen, or a PRD erratum dropping the one-subject placeholder** —
both spend more than the column costs.

**Q5 — G12 per increment. Recommended: A11Y-12 opens `pending` tagged 8
at this gate and flips inside 8B**; no new a11y row for 8C, whose control
and route are named inside the existing record leg's manifest entry;
**G12-01 stays `pending` at `gate`.** **Alternative: no new row, the
existing a11y families extended silently** — rejected for the reason Q5
gave at slice 7 and which held: a row is what makes a leg's absence
visible.

**Q6 — The owed ledger: the expired clock and the burn-down quota.
Recommended: rule the six owner-track rows at this gate** — OW-08, OW-09,
OW-10, OW-12, OW-13, OW-14 — each **KILLED(adr)** with the argument,
**PROMOTED(row)** to a named quantified entry gate on a named slice, or
**kept OPEN with a fresh owner-track date**; and **rule the burn-down
quota met for slice 8 by OW-26's close plus that ruling.** The rows went
on the two-round auto-escalation clock from round 24; four rounds have
closed. **Alternative: carry them a fifth round** — which the ledger's
own rules describe as not an option, and which is the shape of the failure
the file was written to end.

**Q7 — The two round-27 host traps. Recommended: NEITHER becomes a
traps.md row; both become preflight, and no eviction is spent.**
`preflight --for e2e` reads `.next/dev/lock` and refuses on a live peer
**naming its PID and appUrl** (Next 16.3.1 writes both — verified at
`node_modules/next/dist/build/lockfile.js:87, 166–196`), and prints
measured free memory against a stated floor as a **WARN**;
`docs/ops/e2e-local-gate.md` carries the `NODE_OPTIONS` line and the
`.gate/e2e-run.json` preservation step. **Both are test-only, therefore
Tier 3, therefore they may not ride 8A: recommended as one small PR,
`chore/preflight-dev-lock`, owner-merged before the 8A build kickoff** —
the `chore/process-retune` precedent. **Alternative: a traps.md row for
trap 2 against an eviction** — the cap is the pressure that pushes traps
toward automation, and spending it on something a scanner can measure is
the wrong direction. **Alternative: fold both into 8B's first unit** —
one fewer PR, and 8A's gate runs unguarded.

---

## Completion recipe (per increment) + gate cadence

**Per unit:** a red commit carrying **the failure signature in the
message** → green → the unit's tests join the suite. No unit is "done"
without both commits in the history.

**At each increment head:** clean-leg reset at the **exact** migration
count (75 or 76 at 8A) · pgTAP all green with files and Σ recorded
exactly · concurrency all green (**teed** — case 1's `40P01`s are the
deliberate PLT-02 repro) · `db:verify --fail-on warning` clean · the
upgrade leg green — **8A is the first increment since 7A to ship DDL, so
both run there** · vitest all green, counted **by run**, not by discovery
· **the local browser gate with its new total stated exactly, never as
"unchanged"** — 58 legs in 8 files today (a11y 10 · documents 5 ·
extraction 5 · ingestion 8 · onboarding 11 · people 7 · record 5 ·
review 7), and the gate is **unconditional for Tier 1** · `docker stats
--no-stream hc_clamd` and `docker logs hc_clamd --since 20m` read
**before** the gate · lint / typecheck / production build clean, each run
solo · gitleaks clean · coverage rows flipped with refs, **never early** ·
the deltas ADR · a review packet — **or, under the retune, the Tier-2
collapse for 8B and 8C.**

**The gate cadence, each leg its own fresh session (ADR-0006):** this plan
→ **owner rulings on Q1–Q7** (recorded verbatim here, status →
`PLANNED — RULED`) → **`chore/preflight-dev-lock`, owner-merged (Q7)** →
**8A build red→green (M1 FIRST)** → round-28 packet → review →
dispositions → owner sign-off → **merge (`--no-ff`, never squash)** →
**8B build** (the module and the leak leg FIRST — the surface's hardest
claim asserted before a page renders) → round 29 → dispositions →
sign-off → merge → **8C build** → round 30 → dispositions → sign-off →
merge.

**Standing constraints throughout.** Repo authoritative, the vault holds
pointers · **`main` stays green** · **the owner is sole merge authority
and no session merges its own work** · DDL only within the bound and
**shipped migrations never edited** · **every dependency argued WITH its
licence, re-verified from the installed manifest, the command's output
pasted into the red commit** · **never real family data; under G9/G3 never
a real document to a provider — fixtures only, CI KEYLESS, the eval
harness the sole real-key path** · browser legs **LOCAL-gate only** ·
`supabase:supabase-postgres-best-practices` **before any DDL authoring** ·
**`claude-api` before ANY change under `lib/ai/` — and this slice makes
none** · `vercel:nextjs` and the `node_modules/next/dist/docs/` guides
**before route work** · compose from the slice-3 system, do not invent ·
**a settled ruling is not a finding — file a dissent, not a defect** ·
**pending never counts as green** · **a session records, a round rules.**

**Slice-specific traps, beyond the standing set.** A new gated page fails
`tests/app/page-gate.test.ts` until listed **both ways**; a new leg joins
`e2e/audit-manifest.ts`; a new tree **and** its surfaces join
`RECORD_TREES` and `RECORD_SURFACES` in `tests/lint/answer-budget.test.ts`
(7E made the surface list an **exact set**, so a new page fails until it
is a decision rather than an omission). Per-file e2e budgets in the
existing shape — **never `workers: 1`**, which the config already sets.
**Cite E2E legs by TITLE, never by line number.**

---

## What this planning session measured against the kickoff

Every figure in the kickoff was treated as a prediction. **These
reproduced exactly**, at `7e18164` for docs and `bb40021` for code:
migrations **74** · pgTAP **69 files** · `package.json` **13 runtime / 15
dev** · `PROMPT_VERSION_NAME` **hc-6b-3** (`lib/ai/config.ts:221`) · gate
**58 legs in 8 files** by discovery · `docs/coverage.md` **267 rows ·
green 250 · review 9 · pending 8**, and the eight `pending` are the eight
named · `docs/owed.md` **OPEN 7 / 25** with the OPEN set exactly OW-08,
OW-09, OW-10, OW-12, OW-13, OW-14, OW-26 · next free ADR **0040**, with
**#35** holding 0039 and **#36** editing the ritual, both still open ·
Search's DB layer green at 1D (SRCH-01/02, DSC-01, RLS-11a, PRF-04,
PRF-06) with **no** surface in `app/` or `lib/hc/`.

**One thing the kickoff's STATE block got wrong, and it is the first line
of this plan:** it names `main` @ `6025cfa`. **`main` has moved to
`7e18164`** — PR #37, the kickoff itself, merged after the block was
written. The move is docs-only and no code figure changes.

**Four things the record carries that the tree contradicts or does not
carry. Recorded here; no verdict moves (ADR-0025 D6).**

1. **"AC-INBOX-5/13 stay `pending`"** (slice-6 plan's exclusion list;
   slice-7 plan Q4(a) and its exclusion list). **There is no coverage row
   for either criterion.** `docs/coverage.md` cites ten AC-INBOX criteria
   — 2, 3, 4, 6, 7, 8, 9, 12, 15 among them — and neither 5 nor 13. A
   promise that rows will stay `pending` has been made twice about rows
   that do not exist. → Q3(c) opens `GRP-01`.
2. **The six owner-track owed rows are past their auto-escalation
   clock.** `docs/owed.md`'s own intake note puts them on a two-round
   clock from round 24; rounds 24, 25, 26 and 27 have closed. No
   escalation has been sought. → Q6.
3. **`TopBar`'s `search` slot has said *"search is slice 8"* since slice
   3** and has rendered `null` on every screen since. Not a defect — a
   promise coming due, recorded because it is the one place in the tree
   that already names this slice.
4. **The §7.2 query as written cannot be rendered as written.**
   `ts_headline` with no options returns `<b>`-wrapped document text, and
   the TSD's canonical query — carried verbatim into `029` and into
   `scripts/bench/prf06.mjs` — has never had a consumer that had to put
   the result in a DOM. → Q4(1), with a one-line TSD erratum.

**One thing the kickoff left open that the tree answers:** the two
round-27 host traps do not need a traps.md eviction. Next 16.3.1's dev
lockfile carries the peer's PID and appUrl, so trap 1 becomes a preflight
refusal that names the conflict — strictly better than the trap it
replaces — and trap 2's measurable half becomes a preflight WARN. → Q7.

---

## ⏸ AT THE GATE, STOP

This plan lands as a **docs-only PR** titled
`[DO NOT MERGE without owner sign-off]`. **The owner rules Q1–Q7**, and
the rulings are recorded **verbatim** in this file with the status moved
to `PLANNED — RULED`. **An unanswered question defaults to NOT PLANNED and
the build does not start.** The next leg after the ruling is
`chore/preflight-dev-lock` if Q7 adopts it, then the **8A build kickoff**,
its own fresh session. **The owner is sole merge authority; a merge
commit, never a squash. STOP.**
