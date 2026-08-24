# Slice-6 plan-gate kickoff — the Care Inbox (§4.9)

Written for a fresh session, by design.

HARPER'S CIRCLE — SLICE 6 PLAN GATE (§4.9, the Care Inbox: review screen,
item-level approval, the receipt. The TSD's roadmap calls it **"the wedge —
first point at which the loop closes"**). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  `main` @ **`b80ab32`**, CI green (run `32696072672`, **all 23 steps**; the
  only `skipped` is the on-failure log capture, which is correct). Slice 5B
  is **MERGED** at **`c63bcae`** — a merge commit, parents `a9d9f43` +
  `318e2ad`, merged tree verified identical to the branch head — PR #10
  closed as merged, merge SHA stamped at `00c29f1`. **Round 16 is CLOSED**:
  ADR-0023 is **ACCEPTED** and ADR-0022 is **AMENDED** with all ten of its
  falsified claims folded in (a head index keyed by section plus a marker at
  each site, the original prose preserved everywhere).
  · **Nothing is production-activated.** Proposals rest at `pending`, the
    G9 gate is OPEN, `BAND_ARTIFACT_ALLOWLIST` is EMPTY, G3/G9/G4/G7 all
    still block, and no credential exists in CI or the gate.
  · **62 migrations / 59 pgTAP files.** Slice 5's migration bound closed
    **SPENT at 8 of ≤ 8** — amended twice by the owner mid-round, for M7
    (`20260823060001_round16_fixes`) and M8
    (`20260823070001_interpret_terminal`). **Slice 6 gets a FRESH bound and
    the plan gate must SET it** — the slice-4 Q3 precedent.
  · Dependencies: `@anthropic-ai/sdk` 0.120.0 (**MIT**) and `mupdf` 1.28.0
    (**AGPL-3.0-or-later**). **The dependency bound now carries a LICENCE
    COLUMN and no dependency may be argued without one** (owner ruling
    2026-08-23, ADR-0023 D24). **The dev-dependency reserve is UNSPENT.**
  · Evidence on `main`: pgTAP **1513 PASS across 59 files** · concurrency
    **70/70** · vitest **689/689 across 64 files** · `db:verify` clean ·
    local gate **29/29** · typecheck + lint clean.
  · Next free ADR number is **0024**. Slice 6's review is **round 17**.

THE TASK — write `docs/review/slice-6-plan.md` and take it to the gate.
**Not code.** `docs/review/slice-5-plan.md` is the template: pointed
questions the owner rules verbatim, bounds set explicitly, an increment
table with a coverage row per increment, and a NAMED-EXCLUSION list. The
plan lands **docs-only with CI green**; the build sessions are separate
(ADR-0006).

  1. **Decide and argue the split.** Slice 5 ran 5A (DB) then 5B (app) with
     a review round each. Does §4.9 need that, or is it one increment? The
     deliverable is the ARGUMENT, not the preference.

  2. **THREE THINGS MUST BE SETTLED BEFORE THE REVIEW SCREEN IS WRITTEN.**
     Each is cheap now and expensive after:
     · **`confidenceBand`'s `null` means two different things** (ADR-0023
       R1/F-5) — no consumer, no test, and its docblock's "slice 5 records
       the answer" is false. **Slice 6 IS the consumer.** Resolve the
       ambiguity before the screen reads it, not after.
     · **`promotedPageKey`'s default extension is `png`** (R3/F-8) while
       every photo/scan/pill-bottle promotes as `.jpg`, and the contract
       test calls exactly that default. The exported builder encodes the
       wrong answer for the majority of arrivals, and slice 6 is what hits
       it.
     · **§6.3's email row** (ADR-0023 D12). Email facts are stored with a
       `{page, bbox}` against a rendering that is **never produced**, so
       §6.4's crop-on-screen — the high-risk affordance this slice exists to
       build — is **unsatisfiable for the whole email class**. Render the
       message as a second source, or amend the TSD row. Email is the
       channel the forwarding address exists to serve.

  3. **Two owner rulings from round 16 are slice-6 work, and one is ORDERED:**
     · **The arrival-received signal, THEN the `gate → extract` eager fire**
       — in that order, never the reverse. The fire is currently FORBIDDEN
       and three comments say so (`route.ts`, `worker-stage.test.ts`,
       `relay.test.ts`). Taking it first collapses §4.5's ~35 s cancel
       window to seconds **with no test failing**, on a Care Inbox that does
       not revalidate, while PRD §4.8's only arrival email fires at the
       instant cancel stops being offered.
     · **Migrate `lib/pipeline/render.ts` off `mupdf`** (AGPL-3.0-or-later;
       §13's network clause is the term that matters for a hosted service)
       to `pdfjs-dist` + canvas (Apache-2.0) or `pdfium` bindings (BSD-3) —
       **before slice 6 builds further on it**, because the swap gets harder
       with every slice that does. Price it as an increment, with its
       licence column.

  4. **Inherited by ruling at the slice-5 gate (Q6):** **OCR (§6.9) moves
     WHOLESALE to slice 6**, and **A11Y-08** with it — OCR "machine-read —
     may contain errors" labelling plus page/citation navigation parity over
     machine-read text. **A11Y-07 is also slice 6's**: full keyboard
     operation of the review screen, Tab between facts, Enter selects and
     moves focus to the cited region. Both rows sit `pending` in
     `docs/coverage.md` tagged **6**.

  5. **39 findings are OWED** in ADR-0023's D17 table, each with a verdict
     AND an argument — none production-facing, because nothing is
     production-activated. Price the ones this slice touches rather than
     inheriting them silently:
     · **R4/F-6** — partial promotion is permanent: `promoteRenderedPages`
       runs AFTER `finalizeExtraction` returned `advanced`, non-atomically,
       with no repair path, so an `extracted` arrival can cite pages that
       have no artifact. The review screen is what displays those citations.
     · **R3/F-3 + R4/F-4** — attempt staging leaks on every non-graceful
       exit; nothing sweeps `render/attempt/**`, and the prefix is keyed by
       a lease id that exists only in the dead invocation's stack, so the
       orphan is unreachable by construction. Up to 64 MB of a family's
       rendered medical pages, outside any future DEL-01 cascade.
     · **R4/F-7** — the 120 s read visibility timeout is shorter than the
       300 s extract stage, so mid-flight redelivery is the NORMAL case and
       the second reader archives the in-flight message unconditionally.
     · **R5/F-2** — three `{ data }` destructures still drop `error`. A
       non-UUID circle segment returns **200 with a blank Care Inbox
       today**, and a DB blip shows a forty-item family its first-run empty
       state. This is the amplifier behind ADR-0022 D15.
     · **R5/F-6 / F-7 / F-8** — `/[circle]/senders` has **no browser
       coverage at all** (which is why it shipped throwing on every
       non-empty list), every `?e=` marker the submit routes emit is written
       and never read, and the only link to the surface sits inside the
       non-empty branch.
     · **R6/F-4** — the harness writes a manifest `loadBands` rejects as
       `artifact_partial` **FOREVER**, indistinguishable from the shipping
       default at the call site, and **nobody has written down how a
       measured number becomes a threshold.** Must be settled with the
       corpus.
     · **R2/F-5 / F-8 / F-9** — no 429/`retry-after` handling and a
       permanent 400 burns three attempts; the 64 MB render ceiling exceeds
       the API's 32 MB request limit; `model_context_window_exceeded` is
       unhandled.
     · **R3/F-6 + R3/F-7** — every corpus item is single-page and the text
       layer is concatenated with no page markers, so `citation.page` is
       always 1; and the harness discards the citation before scoring, so
       **NOTHING anywhere measures whether a bbox lands on its value.** A
       model with perfect values and uniformly wrong boxes scores 1.00 —
       and boxes are what this slice renders.

  6. **The G9 gate is arithmetically closed, and the plan should say what
     would open it.** `docs/eval/g9-corpus-spec.md` §4.2/§4.3 now state the
     measured truth: **4 of 12 blind items carry a readable rendition**, all
     of one source type, so max recall is 0.25–0.50 against a lowest floor
     of 0.85 and `Signable?` reads **NO** twelve times of twelve. §7 row 1
     or row 2 is an owner purchase. `tests/eval/corpus.test.ts` goes RED
     when the corpus grows — **that red is the signal to re-pin the numbers
     in the same commit as the ADR recording the change, never to loosen
     them.** A floor is not lowered to meet an apparatus.

WHERE TO PUSH HARDEST: §4.9 is the first slice where a person's click
  CHANGES THE RECORD — and almost all of the machinery under it is already
  shipped. `proposal_commits` has existed since **1B**
  (`20260815230001_ingestion_prereqs`), `hc.approve_proposal` since
  **1B** (`20260815230006`), and the conflict arm since **5A M4**. What has
  never existed is the SURFACE, the receipt, or item-level granularity. Read what is already shipped
  before designing on top of it — pgTAP 013 (`approve_proposal`), 054
  (conflict outcomes), 052 (`record_context_for`) — and note that §4.8's
  conflict arm only started working at round 16's `c15d764`, so the
  interpretation half has never been exercised end to end by a human.

RECORDED TRAPS: **TWO CLAUDE SESSIONS SHARE ONE WORKING TREE AND ONE
  SUPABASE STACK** — `db:reset`, `test:db`, `test:e2e` and
  `test:concurrency` are GLOBAL and destroy a peer's in-flight run with no
  error on either side; check for a live peer `node.exe` first (a `next dev`
  and a fixture server on 8787 were up throughout the 5B sign-off), and
  stage EXPLICIT paths, never `git add -A` · run `test:db` only on a clean
  `db:reset`, or 031/039/041/053 fail with "Bad plan" parse errors that are
  drift, not defects · a stale `scripts/ai-fixture-server.mjs --port 8787`
  blocks `test:e2e` at startup BY DESIGN (better than silently answering
  from the BLIND partition) — identify it by start time before killing ·
  PowerShell `git commit -F` never `-m` · tee concurrency output always ·
  never interrupt a db reset; post-reset Kong 502 → `docker restart
  supabase_kong_HarpersCirclev3` · the clamav cold-start race (docker start
  revives) · a vitest failure under load that will not reproduce is an
  UNREPRODUCED TRANSIENT, never claimed as diagnosed · a "Start local
  Postgres" `toomanyrequests` CI failure is the ECR Public anonymous quota
  transient, never a repo defect · **Bash heredocs truncate past ~130
  lines**, reporting a misleading `unexpected EOF` at a line inside your own
  content — split long writes · **line endings are mixed WITHIN single
  files** (`docs/adr/0023-*.md` holds 1183 CRLF and 192 LF lines) and fresh
  worktrees check out CRLF — measure the file before building exact-string
  anchors, and assert the match count before writing.

CONSTRAINTS: repo authoritative, vault holds pointers · main stays green ·
  **the slice-6 migration bound does not exist until the gate sets it**, and
  shipped migrations are never edited · **every dependency argued WITH its
  licence** · `claude-api` BEFORE ANY change under `lib/ai/` (it stands for
  every session touching that directory) ·
  `supabase:supabase-postgres-best-practices` before any DDL authoring ·
  `vercel:nextjs` and the AGENTS.md `node_modules/next/dist/docs/` guides
  before route work · G9/G3 stand: fixtures only, CI KEYLESS, the eval
  harness the only path ever RUN against a real credential; never real
  family data, never a real document to a provider · browser legs LOCAL-gate
  only · **owner sole merge authority, merge commit never squash**
  (ADR-0006) · pending never counts as green · **an unanswered pointed
  question defaults to NOT PLANNED, and the build does not start.**
