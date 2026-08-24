# Round-17 kickoff — third-party review of slice 6A (fresh session, by design)

HARPER'S CIRCLE — ROUND 17 REVIEW SESSION (slice 6A, the Care Inbox
database increment). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  6A IS BUILT on `slice/6-care-inbox` — every DB leg green, the browser
  gate RED and reported as such (below) — branched from `main` @
  `31a7977` — the slice-6 plan RULED, Q1–Q10 SETTLED 2026-08-24 with
  EVERY RECOMMENDATION ACCEPTED AS WRITTEN, CI green at that exact head
  (run `32715475025`). Five migrations `20260824120001`–`120005`
  (M1 = the inherited-obligations batch, built FIRST per the plan).
  **M6 stays RESERVED for THIS round's dispositions** and **M7 closed
  UNCONSUMED** — Q8 ruled for a Care Inbox that revalidates, which needs
  no DDL, exactly as the plan predicted. The bound closes **5 of ≤ 7**.
  The build executed on the settled rulings; there was no new plan gate.
  Red→green per unit, eleven build commits, every red signature in its
  message.

  Evidence head `dd350ad` — the last commit that moved a non-docs tree.
  Docs-only commits after it carry ADR-0024, the coverage section, the
  ADR-0023 D17 correction, the round-17 packet and this kickoff.

  Evidence at `dd350ad`: clean-leg reset exact **67** · pgTAP
  **1590/1590 across 64 files** · concurrency **75/75 across 49 cases**
  (teed, zero NOT OK; cases 45–49 are 6A's) · `db:verify` clean under
  `--fail-on warning` · upgrade leg rehearsed (**62 → migration up →
  67**, both suites green ON THE UPGRADED DATABASE — which matters more
  than usual because M3 drops a constraint and M4 drops a function) ·
  vitest **689/689 across 64 files** (unchanged; 6A authors no
  app-layer unit) · lint/typecheck/production build clean · gitleaks
  **373 commits, no leaks**.

  **THE LOCAL GATE IS RED AT THIS SHA AND THE PACKET SAYS SO.** 29 tests,
  run THREE times, three DISJOINT failure sets, and NO fourth run:
  · Run 1 (18/2) was NOT HERMETIC — `reuseExistingServer: true` adopted a
    peer session’s dev server, which carried none of the config’s
    `webServer` env block, so `/api/upload/token` had no service-role key.
    INDEPENDENTLY CORROBORATED by that session from its own `.env.local`
    and request log. Both its legs passed in run 2, one in 9.1 s against
    an earlier 1.0 m timeout.
  · Run 2 (27/1/1) failed `ingestion.spec.ts:361`, the §4.5 cancel window:
    the polled state lasted **108 ms** against a **1500 ms** poll (the
    arrival’s own `arrival_events` trail is quoted in the packet).
  · Run 3 (21/1/7), fully hermetic — zero project node processes, both
    servers spawned by Playwright — failed `ingestion.spec.ts:102`
    (FWD-01) with the browser still signed in as the EXTRACTION spec’s
    founder (`extract.founder.*` while asserting on `ingest.founder.*`):
    a CROSS-SPEC SESSION LEAK, evidenced by Playwright’s own page
    snapshot. Every extraction leg passed in that run.
  All three are inside the suite’s fixtures, ordering or environment, and
  the branch touches **zero** files under `app/`, `lib/` or `e2e/`. The
  gate was NOT re-run to green. **Packet Q-I puts it to you, under both
  readings of the flake rule, and asks you to disposition the SUITE.**

  ONE UNREPRODUCED VITEST TRANSIENT is also recorded rather than
  smoothed over, and it is not a defect claim: a
  `tests/lint/db-fence.test.ts` timeout under load, where the file
  passes alone in 9.5 s against a 30 s budget and the full suite passes
  clean on re-run (689/689). **Not claimed as diagnosed.**

  Nothing is production-activated: proposals rest at `pending`, the G9
  gate is OPEN, `BAND_ARTIFACT_ALLOWLIST` is EMPTY, G3/G4/G7 all block,
  no credential exists in CI or the gate. **ZERO dependencies were
  added** — Q3's three runtime slots are 6B installs and the
  dev-dependency reserve stays UNSPENT through a third slice.

THE TASK — the round-17 review leg, the ADR-0006 / round-8 cadence:
  1. Read `docs/review/round-17-packet.md` WHOLE (head ledger first,
     the F12 per-directory tree binding, the one-SHA evidence block, and
     the NINE pointed questions Q-A–Q-I with recommended answers).
     Then ADR-0024 (**Proposed** — this round ratifies or amends),
     against `docs/review/slice-6-plan.md`'s M1–M7 rows (the M-row
     letters are BINDING) and Q1–Q10 verbatim, TSD §4.9 whole,
     §4.2/§4.5/§4.7, §3.2–§3.4, §3.7, §6.4, PRD §4.2 whole, §6.4,
     §7.3–§7.4, and the inherited obligations in ADR-0023 (D17's owed
     findings the plan takes; D24's rulings) + ADR-0019 Q-C.
  2. Push the branch and open the PR at the START of this session if not
     already done; confirm CI green on the pushed head (public API,
     anonymous — `gh` is UNAUTHENTICATED, never device-flow; **pending
     never counts as green**). A "Start local Postgres"
     `toomanyrequests` failure is the ECR Public anonymous quota on the
     runners, never a repo defect.
  3. Review the increment on its own terms. **The two places to attack
     hardest**, both named by the plan or the build rather than
     discovered late:
       · **Q7's narrowing (M2)** — the plan itself calls it "the ruling
         most worth a reviewer's attack at round 17": it was found in
         the planning session rather than inherited from a review, and
         it narrows a function seven slices depend on. 013/054 are
         re-pinned at the narrowing's own site AND run unchanged in the
         suite; concurrency 47 isolates the ADDED predicate.
       · **M3's retired foreign key** — a constraint removed
         deliberately, argued at length in ADR-0024 D3 and packet Q-E.
         Check the argument, not just the outcome.
  4. Two build-session judgement calls are put to you explicitly rather
     than buried: **R4/F-10's DB half was DECLINED** because no DB
     remedy exists that does not turn pgTAP 055:453 red (Q-A), and
     **M1's guard is WIDER than its finding's letter** (Q-C). Both are
     pinned in the suite so the decision is checkable, not merely
     asserted.
  5. **Q-I is the one that needs a ruling before anything else can be
     called done**: the local gate is RED at this SHA and the build
     session deliberately did not fix it (build sessions do not repair
     e2e legs; M6 is reserved for dispositions; a product failure is
     never re-run to green). The classification offered is a
     suite-ordering race, WITH the arrival trail that evidences it —
     reject it if the evidence does not hold.
  6. Write `docs/review/round-17-findings.md` in the standing shape —
     severity, verdict, argument — and do NOT fix anything: dispositions
     are their own session, and M6 is reserved for them.

  ⏸ STOP at the gate: round-17 findings → dispositions ADR → owner
  sign-off → merge (never squash, ADR-0006) are each their own fresh
  session. 6B follows at its own kickoff on `slice/6b-care-inbox-app`,
  with B1 — the rasterizer swap — FIRST, before any consumer exists.

STANDING TRAPS FOR THIS TREE (they cost real time if rediscovered):
  TWO CLAUDE SESSIONS SHARE ONE WORKING TREE AND ONE SUPABASE STACK —
  `db:reset`, `test:db`, `test:e2e` and `test:concurrency` are GLOBAL and
  destroy a peer's in-flight run with no error on either side. Check for
  a live peer `node.exe` FIRST and stage EXPLICIT paths, never
  `git add -A`. A dev server left running by a peer is REUSED by
  playwright (`reuseExistingServer: true`) WITHOUT the config's env
  block — kill stale ones before the gate, which is exactly what run 1
  of this slice's gate proved · run `test:db` only on a clean
  `db:reset` · a function-ACL denial SEGFAULTS this PG17 image, so
  privilege closure is CATALOG-BASED, never probed by calling as a
  denied role · `citext` operators die under `search_path=''` ·
  nested `$$` in DO blocks needs a tagged quote — and the tag must not
  appear inside the block, including in a comment · never interrupt a
  `db:reset`; a post-reset Kong 502 is
  `docker restart supabase_kong_HarpersCirclev3` · `hc_clamd` dies on a
  Docker restart and `docker start hc_clamd` revives it (the local gate
  needs it; wait for "socket found, clamd started") · tee concurrency
  output ALWAYS — case 1's `40P01`s are the deliberate PLT-02 repro ·
  PowerShell: `git commit -F`, never `-m` · Bash heredocs truncate past
  ~130 lines with a misleading `unexpected EOF` — use a file write and
  count lines after · line endings are mixed WITHIN single files
  (`002` is uniformly CRLF; new files land LF and git converts), so
  measure before building exact-string anchors and assert the match
  count before writing.
