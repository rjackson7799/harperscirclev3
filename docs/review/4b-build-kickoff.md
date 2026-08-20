# 4B build kickoff — the app increment, B1–B9 (fresh session, by design)

HARPER'S CIRCLE — SLICE 4B BUILD SESSION (the app half of ingestion;
round-13 cadence). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  4A IS MERGED. PR #8 merged by the owner (merge commit `71ac794`,
  parents `8d945f8` + `5386036`, MERGE COMMIT never squash; merged tree
  verified identical to the branch head's). CI green on main at the
  merge commit (run 75, 32320712106) AND at the docs-only stamp head
  `95dab27` (run 76, 32321035352) — both confirmed via the public API,
  anonymous. ADR-0018 is Accepted — merged (owner rulings S1–S4
  verbatim in its sign-off addendum); ADR-0017 ratified as amended —
  merged. Eight migrations shipped `20260818200001`–`200008`; **M8 IS
  SPENT (8 of the owner-ruled ≤ 8) — 4B is APP-ONLY; any DDL need is a
  full STOP for an owner bound-amendment first.**
  The regression net 4B must not dent (the merged evidence, head
  `08ff72e`, F12-transferred to main): clean-leg reset exact **54**
  (seed-provisioned hc_runtime_login; both buckets from cold) · pgTAP
  **1363/1363 across 51 files** · concurrency **63/63 across 38 cases**
  (teed) · db:verify clean under --fail-on warning · vitest **279/279
  across 35 files** · local gate **16/16** (walkthrough 11/11 + a11y
  5/5) · lint/typecheck/production build clean · gitleaks no leaks.

THE TASK — build 4B (app, B1–B9) per the SETTLED plan:
  Authority: `docs/review/slice-4-plan.md` (PLANNED–RULED; Q1–Q7
  SETTLED verbatim — the build executes on those rulings, no new plan
  gate) → the B1–B9 unit map + test surface + completion recipe there →
  ADR-0018 WITH its addendum (the round-12 obligations 4B inherits) →
  TSD §5.2–§5.4, §4.3–§4.6, §1.3/§1.4/§2.12/§3.11 as amended by
  annexes A5/A6/A9 → the ops runbooks.
  1. FIRST ACTION: confirm main head (`95dab27` or later docs-only)
     and CI green AT THAT HEAD (public API, anonymous; pending never
     counts). Branch `slice/4b-app-ingestion` from it (the
     slice/2b-app-onboarding naming precedent).
  2. Build B1→B9 in order, red→green per unit, the failure signature
     in every red commit message: B1 `lib/mail/inbound.ts` (the §5.3
     verdict chain IN ORDER; forged-A-R + lookalike fixtures — G7's
     adversarial set starts here) · B2 `/api/inbound/postmark` (the
     §5.2 six steps literally; the §5.4 bounce/drop table via M3's
     enumerated outcomes; 200 BEFORE processing) · B3 upload (TUS token
     mint + `tus-js-client` — THE one approved runtime dep, Q4) · B4
     `/api/worker/[stage]` + the zero-dep clamd INSTREAM adapter
     (claim → COMMIT → work → finalize; scan_results cache-hit skips
     the scanner) · B5 RLY-01 relay + schedulers (outbox drain/ack,
     sweeper + nightly taint-sweep crons in vercel.json; the
     security-actions sweep adopts M1's claim primitive; the A.5
     worker halves as tests; **plus the inherited §11.5 quarantine
     BYTE-PURGE sweep + its deploy-checklist row — ADR-0018 F2/S1**) ·
     B6 the inbox surface (Q6's UXA-01 disposition binds; slice-3
     components composed, empty states per §8.6) · B7 the artifact
     route (the §1.3 six steps; the ONE sanctioned asServiceRole
     consumer; **RLS-10 proven at HTTP depth — 049 pre-discharged
     NOTHING, per ADR-0018**) · B8 the credential split applied (four
     call-sites onto M1's definers; maintenance module shrinks to the
     two auth.* ops; fences re-pin; sign-out calls hc.log_sign_out;
     HC_DB_URL → hc_runtime locally + the deploy row) · B9 the E2E
     ingestion leg (local gate; clamd container joins the stack — the
     protocol doc gains the prerequisite; EICAR quarantine ≠
     scan_unavailable demonstrated live).
  3. Flips earned here, recorded with refs, never early: APP-09b (B8)
     · RLY-01 (B5 — the ADR-0008 M1 production-disabled ruling lifts
     for store/scan/gate) · UXA-01 (B6, the Q6 disposition recorded) ·
     RLS-10 (B7) · the 4B halves of BAT-02/03 and
     STO/SCN/QTA/SAU/DUP/FWD/INB/UPL rows (coverage §4).
  4. At each increment head, the plan's completion recipe: clean-leg
     reset exact 54 · pgTAP 1363 · concurrency all green teed (+ new
     cases) · db:verify clean · upgrade leg green · vitest all green
     (counts exact) · local gate walkthrough 11/11 + a11y 5/5 UNCHANGED
     + the B9 leg once it exists (F12: re-run at every head whose
     app/ lib/ e2e/ supabase/ trees move) · lint/typecheck/build ·
     gitleaks clean.
  5. At the end: the 4B as-built deltas ADR is **ADR-0019** (the
     plan's "ADR-0018 (4B)" slot was consumed by the round-12
     dispositions — renumbered, not reused) · the round-13 packet in
     the round-8 shape (head ledger from the start, one-SHA evidence
     block, F12 per-directory binding, pointed questions with
     recommended answers) · the round-13 review kickoff authored (the
     round-12 precedent) · branch pushed; PR only at review start.
  ⏸ STOP at the gate: round-13 review → dispositions → owner sign-off
  → merge are each their own fresh session (ADR-0006).

INHERITED OBLIGATIONS (ADR-0018 + addendum — verbatim there, read it):
  the §11.5 quarantine byte-purge sweep + deploy-checklist row land at
  B5 · the first quota revision fixes the monthly label/denominator
  (recorded, not 4B work unless revising quotas) · 049 pre-discharges
  nothing of RLS-10 — B7 proves the route at HTTP depth · the
  same-email identical-pair edge rests on stage-2 (slice 5, §4.7
  point 2).

RECORDED TRAPS (the app-session set; memory-verified):
  NODE_ENV stubs poison jsx runtimes on lazy TSX imports — order
  tests, never stub development · a vitest forks-worker SPAWN failure
  is infrastructure — one classified re-run permitted · the
  eslint-config-next plugin redefine guard (rules-only blocks) ·
  scanner tests match their own comments · REDIRECTS ARE RELATIVE
  (the localhost/127.0.0.1 cookie trap) · hc.* rides the request-role
  channel, privileged ops the maintenance boundary, both fenced to
  lib/hc · replica-role teardown in harnesses · the gitleaks demo-JWT
  allowlist · confirmation gates the password grant UNCONDITIONALLY;
  AC-AUTH-10 needs getUser gates · never interrupt db reset; post-reset
  Kong 502 → docker restart supabase_kong_HarpersCirclev3 · tee
  concurrency output always · PowerShell: git commit -F, never -m ·
  gh UNAUTHENTICATED (CI via the anonymous public API; do not retry
  device-flow) · a CI "Start local Postgres" toomanyrequests failure
  is the ECR quota transient — re-run later, never a repo defect ·
  vercel:nextjs + the AGENTS.md node_modules/next/dist/docs guides
  BEFORE route/scaffold work (this Next.js differs from training
  data) · frontend-design only if the inbox needs what slice-3 lacks
  (compose, don't invent).

CONSTRAINTS: repo authoritative, vault holds pointers · main stays
  green (all work on the branch) · THE MIGRATION BOUND IS SPENT —
  supabase/migrations untouched; DDL ⇒ STOP, owner bound-amendment ·
  dependencies: exactly `tus-js-client` (runtime, Q4-approved) + the
  one reserved dev-dep slot — nothing else without an owner amendment ·
  shipped migrations never edited · never real family data · browser
  legs LOCAL-gate only · owner sole merge authority (ADR-0006) ·
  pending never counts as green.
