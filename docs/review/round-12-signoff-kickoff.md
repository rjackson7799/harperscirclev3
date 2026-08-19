# Round-12 sign-off kickoff — owner sign-off and merge (fresh session, by design)

HARPER'S CIRCLE — SLICE 4A SIGN-OFF SESSION (the round-12 gate's last
leg). Working directory: `c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  4A is BUILT, GREEN, and ROUND-12 REVIEWED TWICE on
  `slice/4-ingestion` (base `main` @ `8d945f8`):
  · The commissioned review (`docs/review/round-12-findings.md`,
    verbatim at `06b935f`): approve with findings, none blocking —
    all four dispositioned docs-only at `0b5b792` (**ADR-0018**);
    Q-A–Q-G ratified, Q-C/Q-F conditions executed (TSD annex A9; the
    §11.5 byte-purge owner named at 4B B5 + deploy checklist).
  · The owner-commissioned EXTERNAL pass (the findings-file addendum,
    verbatim at `f5189b4`): **two REAL blockers** — the scan_results
    conflict arm could downgrade retained infected evidence (X1);
    detect_duplicate could suspect every identical copy, no original
    (X2). Both accepted and FIXED red→green: red `dc1e0ba` (pgTAP 050,
    8/13 failing, signatures in the message) → green `08ff72e`
    (**M8**, `20260818200008_round12_fixes`: the infected-wins conflict
    arm; the canonical strictly-earlier (received_at, id) match; the
    048 fixture re-pin same commit). Dispositions: the ADR-0018
    addendum (incl. the F2-premise correction and Q-F re-confirmed AT
    the fix). **M8 IS SPENT — 8 of the owner-ruled ≤ 8, no reserve
    remains**; further 4A DDL is an owner bound-amendment.
  EVIDENCE HEAD `08ff72e` (the last non-docs commit; docs-only after
  it — F12 transfers): clean-leg reset **exact 54** (seed provisioned
  hc_runtime_login; both buckets from cold; piecemeal upgrade leg
  53 → migration up → 54) · pgTAP **1363/1363 across 51 files** ·
  concurrency **63/63 across 38 cases** teed (37–38 new; the one
  vitest forks-worker spawn failure on the first attempt was
  classified infrastructure — the file never ran — and cleared on the
  single permitted re-run) · db:verify clean under --fail-on warning ·
  vitest **279/279 across 35 files** · local gate **16/16 (5.9 m)**
  first run, traces vault-side at
  `projects/harpers-circle/04-evidence/gate-08ff72e-2026-08-19/` ·
  lint/typecheck/production build clean · gitleaks (digest-pinned
  image) **218 commits, no leaks** · both scanner scripts exit 0.
  ADR-0017 ratified as amended (round-12 markers, the superseded
  Consequences); the packet carries its round-12 addendum superseding
  "M8 reserved" and the old evidence block.
  CI: **run 70 (32291897199) SUCCESS at `be1328b`** (public API,
  anonymous, confirmed in the review session after the push) — the
  clean reset, both DB suites, db:verify, the upgrade leg
  (46 → migration up → 54 → both suites), secret scanning and both
  scanners, all green WITH M8 in the chain. This recording commit is
  itself docs-only (the run-66/68 precedent); the sign-off session
  still confirms the run at the FINAL head first, per task 1.

THE TASK — the sign-off leg (ADR-0006: the owner is sole merge
authority; an unanswered item defaults to NOT MERGED):
  1. FIRST ACTION: confirm the branch head (this kickoff's commit or a
     later docs-only) and CI green AT THAT HEAD — public API, anonymous:
     api.github.com/repos/rjackson7799/harperscirclev3/actions/runs?branch=slice/4-ingestion.
     Pending never counts as green. The upgrade leg (46 → migration up
     → 54 → both suites) is CI's to demonstrate at this head.
  2. PR: if not yet open (gh was unauthenticated in the build AND
     review sessions — run `gh auth login` first, or open by hand),
     open it: base `main`, head `slice/4-ingestion`, title
     "Slice 4A: ingestion DB increment (M1 = the R8 batch) - round-12
     review". NEVER merge it as part of opening it.
  3. The owner reads, in order: the findings file WITH its external
     addendum → ADR-0018 WITH its addendum → ADR-0017 as amended →
     TSD annex A9 → the packet's round-12 addendum → coverage §4 —
     then RULES: sign-off recorded (ADR-0018's status flips to Accepted
     with the ruling verbatim; the ADR-0016 sign-off-addendum pattern),
     or amendments come back as a new dispositions leg (NOTE: with M8
     spent, any DDL amendment is first an owner bound-amendment).
  4. THE MERGE IS THE OWNER'S OWN ACT — merge commit, NEVER SQUASH —
     in-session only if the owner rules so (the ADR-0015
     sign-off-with-merge precedent). After it: confirm CI green on
     `main` at the merge commit (public API); update ADR-0018/0017
     status lines with the merge SHA (the ADR-0014/0016 pattern).
  5. After the merge lands green: 4B (app, B1–B9) is next — its own
     plan-gated session, round-13 cadence. 4B inherits the sharpened
     obligations recorded in ADR-0018 + addendum: the quarantine
     byte-purge sweep + deploy-checklist row (B5) · the first quota
     revision fixes the monthly label/denominator · 049 pre-discharges
     nothing of RLS-10 (B7 proves the route at HTTP depth) · the
     same-email identical-pair edge rests on stage-2 (slice 5, §4.7
     point 2), recorded in the ADR-0018 addendum.

TRAPS (this leg touches no DB — the short list):
  PowerShell: git commit -F, never -m · CI checks via the public API,
  anonymous · a CI "Start local Postgres" toomanyrequests failure is
  the ECR quota transient — re-run later, never a repo defect · merge
  commit never squash · main stays green.

CONSTRAINTS: repo authoritative, vault holds pointers · owner sole
  merge authority (ADR-0006) · pending never counts as green · an
  unanswered item defaults to NOT MERGED · shipped migrations never
  edited · the migration bound is SPENT (8 of ≤ 8) — any further 4A
  DDL is an owner bound-amendment first.
