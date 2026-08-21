# 5A build kickoff — the database increment, M1–M6 (fresh session, by design)

HARPER'S CIRCLE — SLICE 5A BUILD SESSION (the DB half of extraction +
interpretation; round-15 cadence). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  THE PLAN IS RULED AND REVIEW-INTEGRATED. `docs/review/slice-5-plan.md`
  is PLANNED–RULED with **Q1–Q9 SETTLED verbatim** (Q1–Q7 at the gate;
  Q8/Q9 at the post-gate review integration — the "Post-gate review
  integration" section is part of the plan's letter, not commentary).
  It landed docs-only on main across three commits, each CI-green via
  the anonymous public API: `efb11ed` (run 87, 32475831700) · `561a105`
  (rulings, run 88, 32518046026) · `efcafb0` (the fourteen-finding
  integration + Q8/Q9, run 89, 32526825056). Slice 4B is merged and
  stamped (`d7f2f36` / `dd39f42`); `supabase/` tree `3b761d6a…`
  unchanged since — slice-4's bound CLOSED spent at 8 of ≤ 8. **Slice 5
  has a FRESH bound: ≤ 6 (Q2), M6 reserved for round-15 dispositions
  only.**
  The regression net 5A must not dent: clean-leg reset exact **54** ·
  pgTAP **1363/1363 across 51 files** · concurrency **63/63 across 38
  cases** (teed) · db:verify clean under --fail-on warning · vitest
  **431 (test:app)** · local gate **24/24** (walkthrough 11 + a11y 5 +
  ingestion 8) · lint/typecheck/production build clean · gitleaks
  clean.

THE TASK — build 5A (DB, M1–M6) per the SETTLED plan:
  Authority: `docs/review/slice-5-plan.md` (Q1–Q9 verbatim — the build
  executes on those rulings, no new plan gate; the M-row letters as
  amended by the post-gate integration are BINDING) → TSD §6, §4.3–
  §4.10, §3.10, §2.4–§2.6 as amended by annexes A5/A6/A9/A10 →
  ADR-0017/0018/0019 (the inherited items the plan cites) →
  `docs/coverage.md` row conventions.
  1. FIRST ACTION: confirm main head (`efcafb0` or later docs-only)
     and CI green AT THAT HEAD (public API, anonymous; pending never
     counts). Branch `slice/5-extraction` from it (Q7).
  2. SKILLS GATE before any DDL authoring, every DDL session:
     `supabase:supabase-postgres-best-practices`. (`claude-api` is
     5B's gate — 5A contains NO provider-shaped code by design.)
  3. Build M1→M6 in order, red→green per unit, the failure signature
     in every red commit message — **M1 FIRST** (the
     inherited-obligations batch): (1) `hc.log_artifact_read(p_arrival)`
     — authenticated definer, in-function authorization (ADR-0019
     Q-iii; the app-half retirement of `lib/db/evidentiary.ts` is 5B
     B8) · (2) `hc.list_known_senders(p_circle)` — the SND-02
     authorization shape, DEF-10 (D15's revoke-sender read; surface at
     5B B8) · (3) **NOINHERIT (Q4)**: `hc_runtime`'s two memberships
     re-granted WITH INHERIT FALSE — SET ROLE channel untouched;
     BAT-04 + `tests/db/runtime-credential.test.ts` probes re-pinned
     same commit (bare login = honest privilege refusal now);
     `docs/ops/runtime-db-credentials.md` row updated.
     Then M2 `record_context` (the §3.10 letter + the SETTLED inclusion
     priority: current PRD §6.4 high-risk-class facts NEVER truncated,
     truncated sections say so in the payload, per-section caps stated
     IN the migration, byte-stable ordering) · M3 `extraction_runs`
     (**the run row is BORN IN THE CLAIM TRANSACTION and CLOSES WITH
     THE LEASE — no lease consumed without its run, no open run
     outliving its lease**; supersede-not-append at write_extractions;
     the §6.8 reason codes; anomaly_flags carried; prompt_version
     names the FULL inference+render configuration) · M4
     `conflict_outcomes` (**Q9**: use-new = approved + supersession +
     commit claim on the new fact; keep = rejected, nothing written,
     no claim; keep-both = approved + **the task COMMITS as the one
     object**, unassigned; the idempotency identity INCLUDES the
     outcome — same key, different outcome ⇒ conflict, ING-11
     pattern) · M5 `duplicates_stage2` (**Q8: a DISTINCT internal
     state**, label `Looks like a duplicate`, own rank; graph encodes
     `extracting → <state>` and `<state> → interpreting |
     nothing_filed`; the SETTLED matching contract: same circle +
     subject, current filed targets, type + date + ≥1 corroborating
     field ALL PRESENT, absence never wildcards,
     exact-after-normalisation, most-recently-filed canonical target
     with id ties; detection inside finalize_extraction's transaction;
     `same_thing` = provenance_edges additional source + nothing new
     filed — ADR-0017 D8's refinement; the ADR-0018 same-email
     identical pair PINNED BY NAME; per-class FP AND FN fixtures) ·
     M6 stays RESERVED — spending it before round-15 dispositions is
     an owner amendment.
  4. Tests per the plan's 5A test plan: pgTAP 051–055 (one file per
     migration; privilege closure CATALOG-BASED — the segfault trap;
     graph/enum appends re-pin ING-10 + 046 SAME COMMIT) · **the M3
     run-accounting kill matrix case by case** (kill-before-provider,
     kill-during-provider, refusal, normalisation failure, stale
     lease, timeout — each leaves a closed run with the honest
     outcome) · concurrency 39+ (teed): conflict version race ·
     same-key-different-outcome race · stage-2 resolve vs freeze
     mid-wait (R-rule) · supersession vs cancellation (ING-08 class) ·
     record_context vs concurrent record writes.
  5. Coverage: open "## 5 — extraction + interpretation" per the
     plan's table; **flip ONLY what this layer proves** (the 4A rule):
     CNF-01 flips (pgTAP) · CTX-01, RUN-01, RTC-01, EVD-01/SND-03
     (pgTAP halves), DUP-02's pgTAP half · everything app-shaped
     stays annotated for 5B.
  6. At each increment head, the plan's completion recipe: clean-leg
     reset exact 54+N · pgTAP all green · concurrency all green teed ·
     db:verify clean under --fail-on warning · upgrade leg green ·
     vitest all green (counts exact) · local gate **24/24 UNCHANGED**
     (F12: supabase/ moves ⇒ the full gate re-runs) ·
     lint/typecheck/build · gitleaks clean.
  7. At the end: the 5A as-built deltas ADR (take the NEXT FREE number
     against docs/adr/ at write time — the ADR-0019 renumbering
     precedent; likely ADR-0020) · the round-15 packet in the round-8
     shape (head ledger from the start, one-SHA evidence block, F12
     per-directory binding, pointed questions with recommended
     answers) · the round-15 review kickoff authored (the round-12
     precedent) · branch pushed; PR only at review start.
  ⏸ STOP at the gate: round-15 review → dispositions → owner sign-off
  → merge are each their own fresh session (ADR-0006).

INHERITED OBLIGATIONS (verbatim in the plan and ADRs — read them):
  M1 discharges ADR-0019 Q-iii (log_artifact_read), D15's revoke-sender
  READ, and Q-vi/Q4's NOINHERIT · M5 lands ADR-0017 D8's
  attach-as-additional-source refinement and ADR-0018's same-email
  tie-pair catcher · the G4 deploy rows and G7's hardening set stand on
  their checklists — not 5A work · §5.9's notification stays slice 11.

RECORDED TRAPS (the DB-session set; memory-verified):
  function-ACL denial SEGFAULTS the PG17 backend — privilege closure
  stays catalog-based, never probe-by-denial · auth schema ungrantable
  from migrations (hc.uid pattern) · citext operators die under
  search_path='' — case-sensitive fallback, lower(text) throughout ·
  IN-subquery + LIMIT + FOR UPDATE SKIP LOCKED over-claims — CTE
  materialization (ADR-0017 D3's own lesson) · deferred triggers fire
  as the committing role (SECURITY DEFINER) · nested $$ in DO blocks
  needs $wrap$; JS replace $$ escape trap · CTE/volatile
  statement-snapshot rules — DO-block-then-probe fixtures · lint
  hard-gates bare enum literals · probe-role fixture subqueries hit
  42501 · never interrupt db reset; post-reset Kong 502 → docker
  restart supabase_kong_HarpersCirclev3 · WinNAT exclusion ranges eat
  the 543xx ports after reboot (elevated winnat restart + supabase
  stop/start) · clamav container cold-start race (docker start
  revives) — the local gate needs it · tee concurrency output ALWAYS
  (case-1 40P01s are the deliberate repro; a worktree reset may fail
  once after restart) · PowerShell: git commit -F, never -m · gh
  UNAUTHENTICATED (CI via the anonymous public API; never device-flow)
  · a CI "Start local Postgres" toomanyrequests failure is the ECR
  quota transient — re-run later, never a repo defect.

CONSTRAINTS: repo authoritative, vault holds pointers · main stays
  green (all work on the branch) · DDL only within the FRESH ≤ 6 bound
  (Q2); M6 reserved; shipped migrations never edited — appends re-pin
  same commit · **ZERO new dependencies in 5A** (Q3's two runtime deps
  are 5B installs — the 4A "added none, as ruled" precedent) · NO
  app-layer units (5B's; test files and the named ops-doc rows are
  fine) · no provider-shaped code, no lib/ai (5B, behind the
  claude-api gate) · never real family data · browser legs LOCAL-gate
  only · owner sole merge authority (ADR-0006) · pending never counts
  as green.
