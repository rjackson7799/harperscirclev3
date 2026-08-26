# Round-18 kickoff — third-party review of slice 6B (fresh session, by design)

HARPER'S CIRCLE — ROUND 18 REVIEW SESSION (slice 6B, the Care Inbox
**app** increment — the slice in which a person can finally SEE §4.2).
Working directory: `c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  6B IS BUILT on `slice/6b-care-inbox-app`, branched from `main` @
  `b0cc2b6` — which is round 17's merge (ADR-0025, **ACCEPTED AS
  CORRECTED at owner sign-off**, merged at `d59de15`). The **ten B-rows
  B1–B10** of `docs/review/slice-6-plan.md` shipped red→green per unit,
  plus the **S16.8 slot** and the seven review legs. The B-row letters
  are BINDING. Every red signature is in its commit message; the full
  unit ledger is ADR-0026's "The commits" table.

  **THE HEADLINE, AND IT IS NOT THE GREEN: the close-out gate was RED,
  and it was red for real product defects — EIGHT of them, F1–F8.** It
  took NINE gate runs to get to green. Two fixes were WRONG before the
  third was right (F5 bounded the wrong thing; F6 found the bound was in
  the wrong PLACE and that per-call bounds do not compose). One defect
  was classified as ENVIRONMENTAL TWICE before being found to be a
  regression this slice's own close-out introduced (F4 / **D17**).
  **Nothing was re-run to green.** The whole sequence is ADR-0026 D15 and
  D17–D21, written with the wrong turns left in.

  Evidence head **`7496cbc`** — the last commit that moved a non-docs
  tree. Docs-only commits after it carry ADR-0026, the coverage rows, the
  gate-doc and design-conformance corrections, the round-18 packet and
  this kickoff. **The packet does not name its own SHA** (round-17 F-4;
  the packet tried once during close-out and was false ten minutes
  later — the correction is recorded in it). The RULE, checkable at
  whatever head you read: `git diff --name-only 7496cbc..HEAD` lists only
  paths under `docs/`.

  Evidence at `7496cbc`, every command run SOLO:
  **browser gate `r9` = 38 passed (7.6 m)** — a fully green gate ·
  vitest **877/877 across 75 files** · lint · typecheck · production
  build all clean, **zero `<dynamic>` resolution warnings** (that count
  is D17's own signal, and it is why it is quoted).

  CARRIED FORWARD from `bc3bc85` ON A STATED REASON, re-checked at the
  final head rather than asserted: `git diff --name-only bc3bc85..HEAD`
  touches **ZERO** files under `supabase/` and **ZERO** under
  `scripts/concurrency/`. So `test:db` **1622/65 PASS** ·
  `test:concurrency` **75/75** + the upgrade leg · `db:verify
  --fail-on warning` clean · gitleaks **418 commits, no leaks** · G9
  dry-run **40/40 built, nothing sent** — ALL STAND, not re-run.
  **Re-verify that diff yourself before accepting the carry-forward.**

  **CI IS GREEN, AND THIS IS THE FIRST 6B SLICE STATE IN WHICH THAT IS
  TRUE.** The branch had never been pushed until 2026-08-25; it was
  pushed on owner authority during close-out. Runs **151** (`740e1a6`),
  **152** (`49a6bfd`) and **153** (`628f286`) each concluded `success` on
  attempt 1. CI runs `test:db` and `test:concurrency` from a cold
  database — twice per run, counting the upgrade leg — so the
  carry-forward above is corroborated by a machine that is not the build
  host. **CI does NOT run the browser gate** (local by design) and **CI
  does NOT run `npm run build`** — which means **CI would not have caught
  F4**, a build-time signal. That gap is named in the packet and in
  ADR-0026 rather than left for you to discover; it is a defect in the
  pipeline, and whether it is yours to disposition is your call.

  Migrations **69 exact**. **The migration budget is 7 of ≤ 7 SPENT** —
  there is NO remaining DDL authority. Any disposition of yours that
  needs DDL requires a fresh owner amendment stated before a line is
  written. The S16.8 slot consumed the last one: `20260825120001` closes
  **ADR-0025 F-1's OWED residue** (064:21–32), and **DEC-01's coverage
  cell RECORDS that closure — the cell records, the round rules.** F-1's
  FIXED-IN-PART verdict is YOURS to move, not the build session's
  (RULING 5). `PROMPT_VERSION` is `hc-6b-1+35dad2ec988dad6f`.

  **FOURTEEN coverage rows moved.** Twelve to green — A11Y-07, A11Y-08,
  REV-01, REV-02, DEC-01, CIT-01, RND-02, RCP-01, CNF-02, OCR-01, EVA-02,
  PRF-08. Two ASSERTED UNCHANGED and read at this gate: **RCP-02 stays
  pending, tagged 7** and **UXA-03 stays pending**. **SIG-01 is NOT
  absorbed.**

  **PRF-07 is REPORT-ONLY**, PRF-06's method verbatim (cold n=1 and warm
  n=12 reported SEPARATELY, four cohorts named, nearest-rank p95). Worst
  figure **20 479 ms — scanned PDF at queue depth 4 = 34.1%** of §13.2's
  60 s budget. Stated as PRF-06 requires: **that says our machinery
  leaves the provider ~40 s, NOT that the budget is met.**

  Nothing is production-activated: **G4 and G7 still block**, the **G9
  GATE STAYS OPEN** — slice 6 does not close it, and scoring being honest
  is not the same as bands being signed — `BAND_ARTIFACT_ALLOWLIST` stays
  **EMPTY**, and the **slice-5B queue stays 39 OWED**. **No real family
  data** anywhere.

  RECORDED AS OWED, NOT DONE — do not read these as hidden, they are in
  ADR-0026 D18/D20/D16/D14 and the packet: `statement_timeout` on the
  request-role channel (**F6's budget protects THE PERSON, not the pool —
  a raced-out DB read keeps its pooled connection**); a bound on the
  artifact route's **BODY STREAM** (the budget covers headers only, and
  `r7`'s evidence was a request that never answered at all); **seven**
  unbounded outbound fetches in `app/` and `lib/`; the fence transient,
  now **FIVE occurrences across TWO fence files in one slice**, still
  CLASSIFIED and NOT diagnosed — **and the fifth cannot even be NAMED,
  because that run was not teed** (the corrective is that the full vitest
  suite gets teed the way `test:concurrency` already is).

THE TASK — the round-18 review leg, the ADR-0006 / round-8 cadence:
  1. Read `docs/review/round-18-packet.md` WHOLE (head ledger first —
     note its last row is a RULE, not a SHA — then the one-head evidence
     block, the fourteen coverage rows, the PRF-07 bench with its method,
     and the FIVE pointed questions Q1–Q5 with recommended answers).
     Then **ADR-0026 (Status: proposed — this round ratifies or amends)**,
     against `docs/review/slice-6-plan.md`'s **B1–B10 rows verbatim (the
     letters are BINDING)** and the slice-6 plan's Q rulings; TSD §4.9
     whole, §6.3, §6.4, §6.5, §6.9, §6.10, §4.5, §8.7, §8.8, §13.2;
     PRD §4.2 WHOLE (especially §4.2.3, §4.2.4, §4.2.5, §4.2.9), §6.4,
     §10.4, §13.4, §13.5; **AC-INBOX-2 / 3 / 4 / 8 / 9**; and the
     inherited obligations in **ADR-0025** (round 17's dispositions, and
     F-1's residue that 6B took) and **ADR-0023**'s standing queue.
  2. **A PR may or may not be open by the time you read this — CHECK,
     never assume, and never open a second one.** If one is open it
     carries `[DO NOT MERGE without owner sign-off]` in its title, as
     every PR on this repo since #5 does; its body is committed at
     `docs/review/round-18-pr-body.md`. **Every CI run this branch has
     ever had concluded `success` on attempt 1** (runs 151 onward).
     **Re-confirm CI yourself on whatever head you review**, public
     API, anonymous — `gh` is **UNAUTHENTICATED**, never device-flow;
     **pending never counts as green**. Two API facts that
     will cost you time otherwise: a `toomanyrequests` failure at "Start
     local Postgres" is the **ECR Public anonymous quota** on the
     runners, never a repo defect; and **artifact and log downloads 401**
     — you can read per-step conclusions and durations, you can NEVER
     read suite tallies out of CI, so do not quote one as if you had.
  3. Review the increment on its own terms. **The three places to attack
     hardest**, all named by the build rather than discovered late:
       · **F6's request budget** (`lib/http/budget.ts`, D20). Nine calls
         raced under ONE budget; only `ctx.params` and `asUser()` are
         unraced, both local. The claim is that per-call bounds DO NOT
         COMPOSE and one budget is the correct shape. **Attack the
         shape, not the symptom** — and note the budget protects the
         person while the POOL is still unprotected, by the build's own
         admission.
       · **F2's class fix** (`lib/hc/rows.ts` + a scanner, D15). A
         `String(row.received_at)` on a node-pg Date turned all seven
         review legs red. **This is round-16 R5/F-1 RECURRING** — a
         lesson already written down as prose and not made mechanical.
         The question for you is not whether the instance is fixed. It
         is whether **the class** is, and whether a scanner is the right
         instrument.
       · **The OCR arrival** (B9 / D9, and D17). Four attempts.
         `serverExternalPackages` was a real defect that was NOT the
         cause it claimed; `resolveInstalled()` was validated and
         introduced a regression of its own; the specifier went back to
         a LITERAL. Check the argument, not just that §6.9 now works.
  4. Judgement calls put to you explicitly rather than buried:
       · **Q1 carries an OWNER POSITION** (recorded 2026-08-25:
         `@tesseract.js-data/eng` accepted as DATA for the Q3 engine, not
         a fourth argued runtime dependency). **A position is not a
         disposal.** It is yours to rule on, and the build session says
         so in the packet.
       · **Q2 asks RATIFICATION**, not agreement: B10 gave blind labels a
         measured `rendered` flag and excludes unrendered items from
         recall. **This reinterprets what a blind label means.** D11's
         own language is what is encoded — but a build session records
         and the round rules.
       · **Q5 names the gap that let F2 through**: `lib/hc/review.ts` has
         no `tests/hc/` live-DB module test. This slice does not close
         it.
  5. **The ruling that gates everything else is about the SUITE, not a
     leg.** The gate is GREEN — and that green cost nine runs, and **F8
     found that leg 33 had been running at 60–70% of its 120 s budget on
     EVERY run it ever passed**, while **F7 found leg 17 passed only on
     the first run after a storage reset** (it counted EICAR's fixed sha
     across the WHOLE bucket). Both were passing legs that were checking
     less than they claimed. **A green suite that contains legs like
     those is the thing to disposition** — not the eight defects, which
     the gate did catch. ADR-0026 D15 argues the defects reaching the
     gate is the gate WORKING. **Attack that argument.**
  6. Write `docs/review/round-18-findings.md` in the standing shape —
     severity, verdict, argument — and **do NOT fix anything**:
     dispositions are their own session, and **there is no migration
     budget left to spend on them** (7 of ≤ 7). If a finding needs DDL,
     say so and stop; the amendment is the owner's.

  ⏸ STOP at the gate: round-18 findings → dispositions ADR → owner
  sign-off → merge (**a MERGE COMMIT, never a squash**, ADR-0006) are
  each their own fresh session. **The owner is sole merge authority.**
  `main` is unmoved at `b0cc2b6`, so git will offer a fast-forward —
  `--no-ff` is what stops it.

STANDING TRAPS FOR THIS TREE (they cost real time if rediscovered):
  **THE F4 LESSON, and it is the most expensive one in this slice:**
  *"the environment is unwell"* is the most comfortable diagnosis
  available and must be the LAST reached for, not the first. Before
  using it: diff the tree against the last run that PASSED, and count
  what the logs say NOW versus THEN. **A signal that changed with the
  code outranks a resource number that was already true yesterday.**
  This host IS memory-bounded (7.7 GB, ~0.4 GB free with Docker up),
  which is exactly why the excuse was available twice.

  **A leg that passes only on the first run after a reset is not a
  passing leg** — it is a leg with a hidden precondition (F7). When a leg
  fails on a re-run and passed before, check whether the FIXTURE
  accumulated before blaming the code, and **do not `db:reset` before a
  run meant to PROVE such a fix.**

  `waitForURL` DEFAULTS TO `waitUntil:'load'`. When a leg times out on
  `waitForURL`, **read the network log for a request with status -1
  BEFORE** suspecting the route under test. That rule classified both F6
  and F8 correctly · **a navigation that looks redundant may be
  load-bearing** — leg 33's `goto` clears the previous iteration's
  `?decided=1`; remove it and the next `waitForURL` matches the STALE url
  and returns immediately, leaving the leg green while checking nothing
  (D21) · **PRESERVE THE TRACE BEFORE ANY RE-RUN** — Playwright wipes
  `test-results/` at the start of every run · **a tee masks the exit
  code** (`playwright | tee` exits 0 when red) — read the tally from the
  OUTPUT, and a run with no "N passed" tally is NOT a gate result ·
  **AFTER ANY INTERRUPTED GATE, kill the orphans BEFORE re-running**:
  stopping Playwright kills the parent and its `webServer` children
  SURVIVE (`Get-CimInstance Win32_Process -Filter "name='node.exe'"`);
  while a run is ALIVE those same processes are NOT orphans, so check the
  playwright PID first, and **never poll a PID with `tasklist` + grep** —
  it reports "exited" for a demonstrably live process; use
  `Get-Process -Id`.

  **LINE NUMBERS DRIFT — three times in this slice, always one
  direction. CITE E2E LEGS BY TITLE.** If a doc must carry a number,
  re-verify it at the final head before trusting it.

  TWO CLAUDE SESSIONS SHARE ONE WORKING TREE AND ONE SUPABASE STACK —
  `db:reset`, `test:db`, `test:e2e` and `test:concurrency` are GLOBAL and
  destroy a peer's in-flight run with no error on either side. Check for
  a live peer `node.exe` COMMAND LINE first (Adobe's "Creative Cloud"
  `node.exe` is a known false positive) and **stage EXPLICIT paths, never
  `git add -A`** · a dev server left running by a peer is REUSED by
  Playwright WITHOUT the config's env block · **standalone harnesses need
  the GATE's env**: `.env.local` leaves `HC_WORKER_KEY` and
  `CRON_SECRET` EMPTY with no service credential (empty worker key →
  `503 worker disabled` → arrivals stuck at `extracting`), and
  `playwright.config.ts`'s `webServer` block is the source of truth — do
  NOT pass `.env.local`'s `HC_DB_URL` (restricted runtime login →
  `permission denied for schema auth`, 42501) · **stack ports are 5434x**
  (api 54341, db 54342, studio 54343, Mailpit 54344, pooler 54349), NOT
  the 5432x defaults.

  Run `test:db` only on a clean `db:reset` · **never interrupt a
  `db:reset`** — an interrupted one leaves an EMPTY database · a
  post-reset Kong 502 is `docker restart supabase_kong_HarpersCirclev3` ·
  `hc_clamd` dies on a Docker restart and `docker start hc_clamd` revives
  it (the local gate needs it; wait for "socket found, clamd started") ·
  a function-ACL denial **SEGFAULTS** this PG17 image, so privilege
  closure is CATALOG-BASED, never probed by calling as a denied role ·
  `citext` operators die under `search_path=''` · nested `$$` in DO
  blocks needs a tagged quote whose tag does not appear inside the block,
  comments included · **tee `test:concurrency` ALWAYS** — case 1's
  `40P01`s are the deliberate PLT-02 repro.

  **A SCANNER MATCHES ITS OWN COMMENTS** — every scanner in this repo
  carves out comment lines and has negative tests; a scanner is
  first-class code · **MEASURE LINE ENDINGS WITH NODE ONLY** — Git Bash's
  `grep`/`sed`/`od` strip `\r` and disagree with each other AND with the
  truth; repo SOURCE is pure LF, `docs/coverage.md` is wholly CRLF (519),
  and git's "LF will be replaced by CRLF" warning on commit is autocrlf
  noise · `grep -P` is UNAVAILABLE in this locale · PowerShell:
  **`git commit -F`, never `-m`** · **Bash heredocs truncate past ~130
  lines** with a misleading parse error and nothing written — write the
  file and count the lines after · assert the match count before writing
  any exact-string replacement.
