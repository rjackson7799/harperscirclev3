# Round-15 sign-off kickoff — owner sign-off and merge (fresh session, by design)

HARPER'S CIRCLE — SLICE 5A SIGN-OFF SESSION (the round-15 gate's last
leg). Working directory: `c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  5A is BUILT, GREEN, ROUND-15 REVIEWED and DISPOSITIONED on
  `slice/5-extraction` (base `main` @ `7832d53`, CI run 90
  `32527620978` — the regress terminates there). **PR #9 is OPEN**
  (https://github.com/rjackson7799/harperscirclev3/pull/9, base `main`,
  not draft).
  · The commissioned review (`docs/review/round-15-findings.md`,
    verbatim at `793f670`) was taken from **GPT 5.6 Sol** — a
    different model family than the author, deliberately — against a
    self-contained package with no repository access assumed. It
    returned **three findings (1 HIGH, 2 MEDIUM)**, **all seven
    pointed questions Q-A–Q-G RATIFIED**, and three recorded
    observations. No question was amended, so **ADR-0020 is ratified
    as written**.
  · **All three findings ACCEPTED and FIXED red→green**: red `e3ecffe`
    (pgTAP 056 four assertions + concurrency case 44 failing, every
    signature in the message, the four passing assertions named with
    the reason each is not vacuous) → green `a0f194b` (**M6**,
    `20260821120006_round15_fixes`). Dispositions with the argument for
    each: **ADR-0021** (`fb8202d`, citations corrected at `93f9ada`).
    F1 (HIGH): the R-rule per-circle lock HOISTED above stage-2
    detection — the premise was verified against the tree first
    (`advance_arrival` was one of the definitions the reviewer could
    not see). F2: the live-actor guard added to
    `hc.list_known_senders`, with the severity premise CORRECTED —
    nothing writes `accounts.deleted_at`, so the scenario is currently
    unreachable. F3: set semantics on the detector's arrival side; the
    reviewer's publication-boundary alternative DECLINED with the
    argument. **M6 IS SPENT — 6 of the owner-ruled ≤ 6, no reserve
    remains**; further 5A DDL is an owner bound-amendment.
  · TSD gains **annex A11** (Q-B: §4.8's "drafted" task reconciled
    with Q9's committed-object behaviour — the A9/A10 way, shipped
    sections reconciled in the annex, never edited in place).
    `docs/coverage.md` §5 re-referenced; **no row flips** on the
    dispositions — each finding strengthens a row already carrying its
    5A half.
  EVIDENCE HEAD `a0f194b` (the last non-docs commit; docs-only after
  it — F12 transfers): clean-leg reset **exact 60** (54 + 5 + M6) ·
  pgTAP **1497/1497 across 57 files** · concurrency **70/70 across 44
  cases** teed (case 44 is F1's behavioural pin) · db:verify clean
  under --fail-on warning · vitest **448/448 across 53 files** ·
  local gate **24/24 UNCHANGED (4.0 m)** — walkthrough 11/11 + a11y
  5/5 + ingestion 8/8, F12 re-run because `supabase/` and `scripts/`
  moved · lint/typecheck/production build clean · both scanner scripts
  exit 0.
  **One honesty note, recorded in ADR-0021 and NOT to be re-litigated:**
  vitest's FIRST run at this head reported 447/448 immediately after
  the reset and the concurrency suite (178 s against a normal ~54 s).
  Two local re-runs were clean and CI's own vitest step passed. The
  failing test was never identified before it stopped reproducing, so
  it stands recorded as an unreproduced transient — consistent with the
  recorded forks-worker class — explicitly NOT claimed as diagnosed.
  CI: **run `32563296549` (push) SUCCESS** and **run `32564837815`
  (pull_request) SUCCESS**, both at `93f9ada`, both confirmed against
  the anonymous public API. Every step green in each, including the
  clean reset, exact-state verify, both DB suites, schema lint, vitest,
  secret scanning, both scanners, and the **upgrade leg (base reset,
  increment apply, both suites)** WITH M6 in the chain.

THE TASK — the sign-off leg (ADR-0006: the owner is sole merge
authority; an unanswered item defaults to NOT MERGED):
  1. FIRST ACTION: confirm the branch head (this kickoff's commit or a
     later docs-only) and CI green AT THAT HEAD — public API,
     anonymous; `gh` is UNAUTHENTICATED, never device-flow. Pending
     never counts as green. Opening/updating the PR fires a
     `pull_request` run distinct from the `push` run — confirm the one
     at the head you are signing off.
  2. The owner reads, in order: the findings file → **ADR-0021** (the
     dispositions, each with its argument) → ADR-0020 (ratified as
     written) → the round-15 packet → TSD annex A11 → coverage §5 —
     then RULES: sign-off recorded (ADR-0021's status flips to Accepted
     with the ruling verbatim; the ADR-0016 sign-off-addendum pattern),
     or amendments come back as a new dispositions leg. **NOTE: with M6
     spent, any DDL amendment is first an owner bound-amendment.**
  3. **THE ONE OPEN OWNER DECISION, carried forward deliberately —
     ADR-0021 D2's scope call.** `hc.accept_sender` and
     `hc.revoke_sender` (`20260818120006:77`, `:170`) share the exact
     unguarded actor lookup that finding 2 reported against
     `hc.list_known_senders`; they are 4A-era SHIPPED surfaces and they
     are WRITES, not reads. This session fixed only the 5A-owned read
     and QUEUED the family audit rather than widen a 5A dispositions
     migration into 4A authorization surfaces on a currently
     unreachable scenario. The owner rules one of:
       (a) **QUEUE it** (the session's recommendation) — the audit
           rides with the account-deletion path whenever that is
           designed, and the bound stays closed at 6 of ≤ 6; or
       (b) **AMEND the bound to ≤ 7** and fix the family in M7 before
           merge — cheap in code (one predicate each, same shape as
           M6's) but it reopens a bound the owner already closed.
     Either way the ruling is recorded verbatim in the ADR-0021
     sign-off addendum.
  4. THE MERGE IS THE OWNER'S OWN ACT — **merge commit, NEVER SQUASH**
     (the thirteen red→green commits carry every failure signature in
     their messages; squashing destroys the evidence the ADRs cite) —
     in-session only if the owner rules so (the ADR-0015
     sign-off-with-merge precedent). After it: confirm CI green on
     `main` at the merge commit (public API); update ADR-0021/0020
     status lines with the merge SHA (the ADR-0014/0016 pattern).
  5. After the merge lands green: **5B (app, B1–B9) is next** — its own
     plan-gated session on `slice/5b-app-extraction`, round-16 cadence.
     5B inherits, from the plan and this round: the two argued
     dependency installs (Q3 — `@anthropic-ai/sdk` and `mupdf`, the
     latter behind B2's verification spike FIRST) · the `claude-api`
     skill gate before ANY provider-shaped code · the D13 deferred
     backlog to drain at B7 · EVD-01's app half and SND-03's member
     surface at B8 · DUP-02's stage-2 surface at B6 · and the G9/G3
     hard gates, under which the whole slice stays fixtures-only, CI
     keyless, with the eval harness the sole real-key path.

TRAPS (this leg touches no DB — the short list):
  PowerShell: git commit -F, never -m · CI checks via the anonymous
  public API only · a CI "Start local Postgres" toomanyrequests
  failure is the ECR quota transient — re-run later, never a repo
  defect · merge commit never squash (GitHub remembers the last method
  used — check it before clicking) · main stays green.

CONSTRAINTS: repo authoritative, vault holds pointers · owner sole
  merge authority (ADR-0006) · pending never counts as green · an
  unanswered item defaults to NOT MERGED · shipped migrations never
  edited · the migration bound is SPENT (6 of ≤ 6) — any further 5A
  DDL is an owner bound-amendment first · never real family data, and
  under slice 5's gates never a real document to a provider.
