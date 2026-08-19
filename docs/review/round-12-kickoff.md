# Round-12 kickoff — third-party review of slice 4A (fresh session, by design)

HARPER'S CIRCLE — ROUND 12 REVIEW SESSION (slice 4A, the ingestion
database increment). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  4A IS BUILT AND GREEN on `slice/4-ingestion`, branched from main @
  `8d945f8` (CI run 65 green — the regress terminates there). Seven
  migrations `20260818200001`–`200007` (M1 = the ADR-0015 R8 batch,
  the hard entry criterion, built FIRST; M8 reserved for THIS round's
  dispositions). Red→green per unit, fifteen commits, every red
  signature in its message; evidence head `8306af8` (the last commit
  moving a non-docs tree), docs-only commits after it carry the
  coverage flips, ADR-0017, the round-12 packet and this kickoff.
  Evidence at `8306af8`: clean-leg reset exact 53 (seed provisioned
  hc_runtime_login; buckets from cold) · pgTAP 1350/1350 across 50
  files · concurrency 61/61 across 36 cases (teed; the one case-3
  post-reset flake classified infrastructure and cleared on the single
  permitted re-run) · db:verify clean under --fail-on warning · vitest
  279/279 (app/lib/tests/e2e trees byte-identical to main — the F12
  hashes in the packet) · local gate re-run at the head (F12:
  supabase/ moved) · lint/typecheck/build clean · gitleaks 209 commits
  no leaks · both CI scanner scripts exit 0.

THE TASK — the round-12 review leg, the ADR-0006/round-8 cadence:
  1. Read `docs/review/round-12-packet.md` WHOLE (head ledger first,
     the F12 tree binding, the evidence block, the seven pointed
     questions Q-A–Q-G with recommended answers). Then ADR-0017
     (Proposed — this round ratifies or amends), against
     `docs/review/slice-4-plan.md`'s M1–M7 specs and the SETTLED
     Q1–Q7 rulings, TSD §4/§5.1–§5.4/§2.12/§3.11 as amended by A5/A6,
     and ADR-0015 R8.
  2. Confirm CI green on the pushed branch head (public API,
     anonymous) — the push and PR happen at the START of this session
     if not already done; the upgrade leg (46 → migration up → 53 →
     both suites) is CI's to demonstrate.
  3. Commission/receive the adversarial third-party review of the
     packet; land findings verbatim as
     `docs/review/round-12-findings.md` (docs-only, before anything is
     argued — the 5faccc4 precedent).
  4. Dispositions: every finding accepted/declined WITH the argument,
     the ADR-0006 way; fixes red→green on the branch (M8 is the
     reserved migration slot if DDL is needed); the dispositions ADR
     (ADR-0018 or ADR-0017-amended, per the round's shape); coverage
     re-referenced.
  ⏸ STOP at the gate: owner sign-off and the merge (never squash) are
  the owner's, each its own session unless the owner rules otherwise
  in-session (the ADR-0015 sign-off-with-merge precedent exists).

RECORDED TRAPS (respect them; memory-verified):
  function-ACL denial segfaults this image — privilege closure stays
  catalog-based, never dialled (it BIT once this build; recorded in the
  M1 green message) · auth schema ungrantable from migrations · citext
  under search_path='' compares case-sensitively — lower(text) ·
  ALTER TYPE ADD VALUE split across migrations (55P04) · nested $$
  needs $wrap$; DO-block-then-probe; probe-role subqueries hit 42501 ·
  never interrupt db:reset; post-reset Kong 502 → docker restart
  supabase_kong_HarpersCirclev3 (and REST hangs keyless probes — use
  the demo apikey) · CI "Start local Postgres" toomanyrequests = ECR
  quota, re-run later · PowerShell: git commit -F, never -m · the
  IN-subquery + LIMIT + FOR UPDATE SKIP LOCKED re-execution class
  (ADR-0017 D3) — materialize locking scans in CTEs.

CONSTRAINTS: repo authoritative, vault holds pointers · main stays
  green (all work on the branch) · M8 is the ONLY remaining migration
  slot (bound ≤ 8); shipped migrations never edited · ZERO new deps
  (the reserve dev-dep slot stands) · never real family data · owner
  sole merge authority (ADR-0006) · browser legs LOCAL-gate only ·
  findings land verbatim before argument · pending never counts as
  green · an unanswered item defaults to NOT MERGED.
