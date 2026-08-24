# Round-16 sign-off kickoff — slice 5B at the gate (fresh session, by design)

> **SIGNED OFF 2026-08-23 — this brief is HISTORY, and ADR-0023 D24 is the
> record.** All three open decisions were ruled: `mupdf`'s licence
> (record now, swap in slice 6), the G9 corpus (§4/§6 restated against the
> readable set), and §4.5's cancel window (signal first, then the eager
> fire). Three things below did not survive the sign-off: the disposition
> counts (**27 FIXED / 39 OWED**, not 25/41), ADR-0022's amendment list
> (**ten** claims, not five), and ADR-0023's own "seven BLOCKERs fixed,
> three escalated" (**eight fixed, two escalated**).

HARPER'S CIRCLE — SLICE 5B OWNER SIGN-OFF (the ADR-0006 gate; round 16 is
complete). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  Round 16 is DONE. Branch `slice/5b-app-extraction` @ **`5447ab6`**,
  pushed, **CI green — all 23 steps** (the only `skipped` is the on-failure log capture, which is
  correct). `main` @ `a9d9f43` has NOT moved, so the merge-base is still
  the branch base: no divergence, no conflict surface.
  · **113 findings** from eight independent adversarial lenses, landed
    VERBATIM at `docs/review/round-16-findings.md` before anything was
    argued (the 5faccc4 precedent). 10 BLOCKER / 40 MAJOR / 33 MINOR /
    30 OBSERVATION, including six entries that are verified POSITIVES.
  · **`docs/adr/0023-slice5b-review-round-16.md`** dispositions ALL 113
    in the D17 table — **25 rows FIXED** (plus one partial), 41 OWED,
    [SUPERSEDED at sign-off: **27 FIXED / 39 OWED**. Two rows still read
    OWED for fixes that had landed — R3/F-9 and R6/F-6 — corrected in
    ADR-0023 D17 with the argument, and recorded in D24.]
    3 OWNER, the rest ACCEPTED-NOTE or NOTED. Two packet recommendations
    are DECLINED on the record: **Q-B** (take it with Q-A, not queued)
    and **Q-D** (its premise was false against the shipped schema —
    `extract_timeout` was already a legal edge).
  · **ADR-0022 is AMENDED, NOT RATIFIED.** Five of its claims were
    falsified; each is corrected by a numbered disposition. [SUPERSEDED:
    **ten** claims were falsified or superseded. The five this brief did
    not know about are named in ADR-0023 D24.] The
    amendments belong IN ADR-0022 at sign-off so a future reader of the
    as-built record is not misled by it. **That is a sign-off task.**
  · **THE MIGRATION BOUND WAS AMENDED TWICE by the owner** (≤ 6 → ≤ 7 →
    ≤ 8) and closes **SPENT at 8 of ≤ 8**: M7
    (`20260823060001_round16_fixes.sql` — Q-A's grant, the
    `column_privileges` EXACT-SET invariant, `render_bounds_exceeded`)
    and M8 (`20260823070001_interpret_terminal.sql` — the interpret
    stage's failure edge). **5B is therefore NO LONGER APP-ONLY**;
    62 migrations / 59 pgTAP files.
  · Dependencies unchanged: the two Q3-approved runtime packages.
    **THE DEV-DEPENDENCY RESERVE IS STILL UNSPENT** — nothing in the
    dispositions needed it, which is the answer to Q-H.
  · Evidence at the head, ALL RE-RUN (nothing inherited by F12 this
    round, because `supabase/` moved): clean reset **exact 62** · pgTAP
    **1513 PASS across 59 files** · concurrency **70/70** (teed) ·
    `db:verify` clean · upgrade leg base→60→62 with both suites ·
    vitest **685/685 across 64 files** · typecheck + lint clean ·
    **local gate 29/29** on a clean reset, no credential in the run ·
    G9 harness dry-run 12/12, nothing sent · `g9-build.mjs --check` now
    a CI step.
  · **The true vitest baseline is 632, not the packet's 631** — measured
    in a clean worktree and corrected in ADR-0023 D16.

THE TASK — the sign-off leg:
  1. **THE PR IS OPEN: #10**
     (`https://github.com/rjackson7799/harperscirclev3/pull/10`), head
     `5447ab6`, base `main` @ `a9d9f43`, **checks success, mergeable
     state `clean`** — 63 commits, 110 files, +18,242 / −202. Its body
     is checked in at `docs/review/round-16-pr-body.md`. Re-confirm green
     at the head before acting — anonymous public API, `gh` is
     UNAUTHENTICATED, never device-flow; **pending never counts**.
  2. **THREE OWNER DECISIONS ARE OPEN AND BLOCK NOTHING ELSE IN THIS
     SESSION, BUT SHOULD BE RULED ON** (ADR-0023 D18, D11, D13, D14):
     · **`mupdf` is AGPL-3.0-or-later** and the word "licence" appears
       nowhere in the plan, ADR-0022 or the packet. Q3 approved it on
       capability grounds; both priced alternatives are permissive
       (`pdfjs-dist` Apache-2.0, PDFium BSD-3). §13's network clause is
       the term that matters for a hosted service. **Decide before slice
       6 builds more on `lib/pipeline/render.ts`.** Independently: the
       dependency bound should gain a licence column.
     · **The G9 corpus cannot pass its own gate.** 8 of 12 BLIND items
       contain NO rendition of the values they are labelled with, so no
       per-field recall floor in `docs/eval/g9-corpus-spec.md` §6 is
       arithmetically reachable, and §4's ≥2-source-type minimum is met
       entirely by items on which extraction is impossible. The
       recommendation is to restate §4/§6 against the READABLE set now
       (an honest n=2 beats a stated n=6 that is really n=2), then buy
       §7 row 1 or row 2 deliberately.
     · **§4.5's cancel window is now ~35 s** on a Care Inbox that does
       not refresh, and PRD §4.8's only arrival email ("Ready to
       review") fires at the instant cancel stops being offered. Rule on
       it **BEFORE anyone adds the missing `gate → extract` eager fire**
       — that is an obvious latency win that would silently collapse the
       window further. `tests/routes/worker-stage.test.ts:297` and
       `route.ts:236` still carry the stale "nothing consumes yet"
       comment and are deliberately held until this is ruled (R8/F-1).
  3. **Sign-off proper:** ratify or amend ADR-0023's dispositions; fold
     ADR-0022's five corrections INTO ADR-0022 [DONE — all TEN, as a head
     index plus a marker at each site, original prose preserved]; then **the merge is the
     owner's alone and is a MERGE COMMIT, NEVER SQUASH** (ADR-0006). The
     ADR-0015 sign-off-with-merge precedent exists if the owner rules
     in-session.
  4. **41 findings remain OWED** [SUPERSEDED: **39**], each argued in ADR-0023's D17 table
     with a verdict and a reason. They are NOT lost and NOT urgent —
     nothing is production-activated — but the highest-value ones for a
     slice-6 kickoff are: R2/F-5 (429/`retry-after` has no handling and
     a permanent 400 burns three attempts), R2/F-8 (the 64 MB render
     ceiling exceeds the API's 32 MB request limit), R2/F-9
     (`model_context_window_exceeded` unhandled), R3/F-3 + R4/F-4
     (attempt staging leaks on every non-graceful exit; nothing sweeps
     `render/attempt/**`), R3/F-6 + R3/F-7 (no multi-page fixture, and
     NOTHING anywhere scores whether a bbox lands on its value),
     R4/F-6 (partial promotion is permanent behind an `extracted`
     arrival), R4/F-7 (the 120 s read VT is shorter than the 300 s
     stage, so mid-flight redelivery is the normal case), R6/F-4 (the
     harness writes a manifest `loadBands` will reject as
     `artifact_partial` FOREVER), and R2/F-4 (the eval rebuilds the
     request by hand).

WHERE TO PUSH HARDEST IF ANYTHING IS RE-OPENED: ADR-0023's D17 table is
  the contract — every finding has a verdict AND an argument, and the
  arguments are what a sign-off should test, not the verdicts. The three
  most consequential fixes this round were R4/F-1 (§4.8's conflict arm
  was inert in production), R3/F-1 (a 300-dpi scan rendered below the
  standard tier because `PT_PER_PX` is mupdf's no-DPI fallback, not a
  law) and R2/F-19 (the provider adapter was binary to git). Each was
  verified by EXECUTING code, not by reading it.

RECORDED TRAPS (the sign-off subset): CI via the anonymous public API
  only; a "Start local Postgres" toomanyrequests failure is the ECR
  quota transient, never a repo defect · **TWO CLAUDE SESSIONS SHARE ONE
  WORKING TREE AND ONE SUPABASE STACK** — `db:reset`, `test:db`,
  `test:e2e` and `test:concurrency` are GLOBAL and will destroy a peer's
  in-flight run with no error on either side; check for a live peer
  `node.exe` first, and stage EXPLICIT paths, never `git add -A` ·
  run `test:db` only on a clean `db:reset` — against a database the
  live-DB vitest suites have written to, 031/039/041/053 fail with
  "Bad plan" parse errors that are drift, not defects · a stale
  `scripts/ai-fixture-server.mjs --port 8787` blocks `test:e2e` at
  startup BY DESIGN (better than silently answering from the BLIND
  partition) — identify it by start time before killing · PowerShell
  `git commit -F` never `-m` · tee concurrency output always · never
  interrupt a db reset; post-reset Kong 502 → `docker restart
  supabase_kong_HarpersCirclev3` · the clamav cold-start race (docker
  start revives) · a vitest failure under load that will not reproduce
  is an UNREPRODUCED TRANSIENT, never claimed as diagnosed.

CONSTRAINTS: repo authoritative, vault holds pointers · main stays green
  · **THE MIGRATION BOUND IS SPENT AT 8 of ≤ 8 — any further DDL is a
  NEW owner bound-amendment first** · shipped migrations never edited ·
  the dependency bound stands at the two approved runtime packages; the
  dev-dep reserve is still unspent · `claude-api` BEFORE ANY
  provider-shaped change (it stands for every session touching
  `lib/ai/`) · `supabase:supabase-postgres-best-practices` before any
  DDL authoring · `vercel:nextjs` and the AGENTS.md
  `node_modules/next/dist/docs/` guides before route work · G9/G3 stand:
  fixtures only, CI KEYLESS, the eval harness the SOLE real-key path;
  never real family data, never a real document to a provider · browser
  legs LOCAL-gate only · proposals REST at `pending` — the review screen
  is slice 6's · **owner sole merge authority, merge commit never
  squash** (ADR-0006) · pending never counts as green · an unanswered
  item defaults to NOT MERGED.
