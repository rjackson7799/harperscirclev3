# Round-15 kickoff — third-party review of slice 5A (fresh session, by design)

HARPER'S CIRCLE — ROUND 15 REVIEW SESSION (slice 5A, the extraction +
interpretation database increment). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  5A IS BUILT AND GREEN on `slice/5-extraction`, branched from main @
  `7832d53` (CI run 90 green — the regress terminates there). Five
  migrations `20260821120001`–`120005` (M1 = the inherited-obligations
  batch, built FIRST per the plan; **M6 stays RESERVED for THIS
  round's dispositions** — the bound closed 5 of ≤ 6). Q1–Q9 are
  SETTLED verbatim in `docs/review/slice-5-plan.md`; the build
  executed on those rulings, no new plan gate. Red→green per unit,
  eleven build commits, every red signature in its message; evidence
  head `2eab0f3` (the last commit moving a non-docs tree), docs-only
  commits after it carry the coverage flips, ADR-0020, the round-15
  packet and this kickoff.
  Evidence at `2eab0f3`: clean-leg reset exact **59** · pgTAP
  **1489/1489 across 56 files** · concurrency **69/69 across 43
  cases** (teed; cases 39–43 are 5A's) · db:verify clean under
  --fail-on warning · upgrade leg rehearsed (54 → migration up → 59,
  both suites green on the upgraded DB) · vitest **448/448** (the
  standing net's "431" corrected — ADR-0020 D7 / packet Q-E) · local
  gate **24/24 UNCHANGED** (F12 re-run: supabase/ and tests/ moved;
  artifacts vault-side at 04-evidence/gate-2eab0f3-2026-08-21) ·
  lint/typecheck/build clean · gitleaks 277 commits no leaks · both
  CI scanner scripts exit 0.

THE TASK — the round-15 review leg, the ADR-0006/round-8 cadence:
  1. Read `docs/review/round-15-packet.md` WHOLE (head ledger first,
     the F12 tree binding, the one-SHA evidence block, the seven
     pointed questions Q-A–Q-G with recommended answers). Then
     ADR-0020 (Proposed — this round ratifies or amends), against
     `docs/review/slice-5-plan.md`'s M1–M6 rows AS AMENDED by the
     post-gate integration (Q8/Q9 verbatim there), TSD §6/§4.3–§4.10/
     §3.10/§2.4–§2.6 as amended by A5/A6/A9/A10, and the inherited
     obligations in ADR-0019 (D7/D8/D15, Q-iii/Q-vi, S3) +
     ADR-0017 D8 + ADR-0018's stage-2 record.
  2. Push the branch and open the PR at the START of this session if
     not already done; confirm CI green on the pushed head (public
     API, anonymous — gh is UNAUTHENTICATED, never device-flow;
     pending never counts). The upgrade leg (54 → migration up → 59 →
     both suites) is CI's to demonstrate.
  3. Commission/receive the adversarial third-party review of the
     packet; land findings verbatim as
     `docs/review/round-15-findings.md` (docs-only, before anything is
     argued — the 5faccc4 precedent).
  4. Dispositions: every finding accepted/declined WITH the argument,
     the ADR-0006 way; fixes red→green on the branch (**M6 is the
     reserved migration slot if DDL is needed**); the dispositions ADR
     (ADR-0021 or ADR-0020-amended, per the round's shape); coverage
     re-referenced; the §4.8 annex (packet Q-B's proposed A11) landed
     if adopted.
  ⏸ STOP at the gate: owner sign-off and the merge (never squash) are
  the owner's, each its own session unless the owner rules otherwise
  in-session (the ADR-0015 sign-off-with-merge precedent exists).

RECORDED TRAPS (the review-session subset): CI via the anonymous
  public API only · a "Start local Postgres" toomanyrequests failure
  is the ECR quota transient — re-run later, never a repo defect ·
  PowerShell: git commit -F never -m · tee concurrency output always ·
  never interrupt db reset; post-reset Kong 502 → docker restart
  supabase_kong_HarpersCirclev3 · the clamav container cold-start race
  (docker start revives) if the gate re-runs · function-ACL denial
  SEGFAULTS this image — privilege closure stays catalog-based.

CONSTRAINTS: main stays green (all work on the branch) · DDL only in
  M6 within the ruled bound · shipped migrations never edited (the
  five 5A migrations become shipped AT MERGE — during dispositions
  they are still the branch's own) · ZERO new dependencies (Q3's two
  are 5B installs) · no provider-shaped code, no lib/ai (5B, behind
  the claude-api gate) · never real family data · browser legs
  LOCAL-gate only · owner sole merge authority (ADR-0006) ·
  `supabase:supabase-postgres-best-practices` before any M6 DDL
  authoring.
