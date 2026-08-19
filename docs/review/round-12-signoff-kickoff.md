# Round-12 sign-off kickoff — owner sign-off and merge (fresh session, by design)

HARPER'S CIRCLE — SLICE 4A SIGN-OFF SESSION (the round-12 gate's last
leg). Working directory: `c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  4A is BUILT, GREEN, and ROUND-12 REVIEWED on `slice/4-ingestion`
  (base `main` @ `8d945f8`). Evidence head `8306af8` (pgTAP 1350/1350 ·
  concurrency 61/61 · vitest 279/279 · local gate 16/16 · db:verify
  clean · clean-leg exact 53 · gitleaks clean · both scanners exit 0);
  every commit after it is docs-only, so the packet's F12 per-directory
  binding transfers that evidence block to the head unchanged.
  The review: `docs/review/round-12-findings.md` (received 2026-08-19,
  landed VERBATIM at `06b935f` before argument) — **approve with
  findings, NONE BLOCKING** (1 high / 1 medium / 2 low; no code defect;
  every re-verified claim held). Dispositions at `0b5b792`
  (**ADR-0018**): all four findings ACCEPTED with the argument,
  docs-only; Q-A–Q-G ratified per the reviewer's verdicts with the Q-C
  and Q-F conditions EXECUTED (TSD annex A9; the §11.5 byte-purge owner
  named at 4B B5 + deploy checklist). ADR-0017 ratified as amended.
  **M8 UNSPENT** — 4A stands at 7 of the owner-ruled ≤ 8.
  CI: runs 65 (`main` base) / 66 / 67 SUCCESS, and **run 68
  (32276689979) SUCCESS at the kickoff head `b5e7348`** — public API,
  anonymous, confirmed in the review session after the push. This
  recording commit is itself docs-only (the run-66 precedent at
  `bc3f93c`); the sign-off session still confirms the run at the FINAL
  head first, per task 1.

THE TASK — the sign-off leg (ADR-0006: the owner is sole merge
authority; an unanswered item defaults to NOT MERGED):
  1. FIRST ACTION: confirm the branch head (this kickoff's commit or a
     later docs-only) and CI green AT THAT HEAD — public API, anonymous:
     api.github.com/repos/rjackson7799/harperscirclev3/actions/runs?branch=slice/4-ingestion.
     Pending never counts as green.
  2. PR: if not yet open (gh was unauthenticated in the build AND
     review sessions — run `gh auth login` first, or open by hand),
     open it: base `main`, head `slice/4-ingestion`, title
     "Slice 4A: ingestion DB increment (M1 = the R8 batch) - round-12
     review". NEVER merge it as part of opening it.
  3. The owner reads, in order: the findings file → ADR-0018 → ADR-0017
     as amended (the D4/D5 markers, D10) → TSD annex A9 → coverage §4 —
     then RULES: sign-off recorded (ADR-0018's status flips to Accepted
     with the ruling verbatim; the ADR-0016 sign-off-addendum pattern),
     or amendments come back as a new dispositions leg.
  4. THE MERGE IS THE OWNER'S OWN ACT — merge commit, NEVER SQUASH —
     in-session only if the owner rules so (the ADR-0015
     sign-off-with-merge precedent). After it: confirm CI green on
     `main` at the merge commit (public API); update ADR-0018/0017
     status lines with the merge SHA (the ADR-0014/0016 pattern).
  5. After the merge lands green: 4B (app, B1–B9) is next — its own
     plan-gated session, round-13 cadence. 4B inherits three sharpened
     obligations recorded in ADR-0018's Consequences: the quarantine
     byte-purge sweep + deploy-checklist row (B5) · the first quota
     revision fixes the monthly label/denominator · 049 pre-discharges
     nothing of RLS-10 (B7 proves the route at HTTP depth).

TRAPS (this leg touches no DB — the short list):
  PowerShell: git commit -F, never -m · CI checks via the public API,
  anonymous · a CI "Start local Postgres" toomanyrequests failure is
  the ECR quota transient — re-run later, never a repo defect · merge
  commit never squash · main stays green.

CONSTRAINTS: repo authoritative, vault holds pointers · owner sole
  merge authority (ADR-0006) · pending never counts as green · an
  unanswered item defaults to NOT MERGED · shipped migrations never
  edited · M8 stays the slice's reserved slot (owner matter if ever
  spent).
