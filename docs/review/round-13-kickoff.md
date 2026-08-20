# Round-13 review kickoff — slice 4B, the ingestion app increment (fresh session, by design)

HARPER'S CIRCLE — ROUND-13 THIRD-PARTY REVIEW SESSION. Working
directory: `c:\Users\HCI\Desktop\Projects\HarpersCirclev3`. The
review's charge: the packet is a CLAIM SET — verify what it claims,
attack what the code COULD DO (both layers stay in the cadence,
ADR-0018's consequence), and return findings verbatim before anything
is argued.

STATE — settled, do not redo:
  The 4B build is COMPLETE on `slice/4b-app-ingestion` (base `main` @
  `3195713`, CI run 77 green, confirmed pre-branch). B1–B9 landed
  red→green, signatures in every red commit. 4B is APP-ONLY:
  `supabase/` and `scripts/` are BYTE-IDENTICAL to main (the F12
  hashes in the packet) — the migration bound stays spent at 8 of ≤ 8
  with nothing added; the pgTAP suite is untouched at 51 files, the
  concurrency suite untouched at 38 cases. Dependencies: exactly
  `tus-js-client@4.3.1` (Q4-approved); the dev-dep reserve untouched.

THE AUTHORITIES, in order:
  `docs/review/round-13-packet.md` (the claim set — head ledger,
  F12 binding, evidence block, pointed questions Q-i…Q-vi) →
  `docs/adr/0019-4b-app-ingestion-deltas.md` (Proposed — D1–D15; this
  round ratifies or amends) → `docs/review/slice-4-plan.md` (Q1–Q7
  SETTLED verbatim) → ADR-0018 + addendum (the inherited obligations:
  the §11.5 byte purge landed at B5 — verify; 049 pre-discharged
  NOTHING of RLS-10 — B7+B9 claim the proof; the F3 label rides the
  first quota revision, untouched here) → TSD §5.2–§5.4, §4.3–§4.6,
  §1.3/§1.4/§2.12/§3.11 as amended by A5/A6/A9 → `docs/coverage.md`
  §4 (the flips this build recorded: APP-09b · RLY-01 · UXA-01
  review-green with the Q6 disposition · RLS-10 · BAT-02/03 · the
  STO/SCN/QTA/SAU/DUP/FWD/INB/UPL 4B halves) → the ops runbooks
  (ingestion-deploy.md is NEW; runtime-db-credentials.md carries the
  B8 INHERIT correction; e2e-local-gate.md gained the clamd stack).

THE REVIEW SURFACE (where scrutiny pays):
  1. The §5.3 chain (lib/mail/inbound.ts): the ordering IS the
     security argument — try to defeat the trusted-hop binding, the
     authserv-id token match, the chain-stops-at-step-1 rule.
  2. The webhook's §5.4 application (Q-i: the capacity-bounce
     alignment rule) and the acceptance-durability claim (rows AND
     bytes before the 200).
  3. The worker layer's claim→COMMIT→work→finalize discipline; the
     never-finalize-unavailable posture (D5); the message-lineage
     fail-closed rules (D3/D4); the shared-queue Q7 seam.
  4. The artifact route: the one-404 discipline, evidence-before-
     bytes, the signed URL's server-side life (Q-ii: the §4.3/§1.3
     tension; Q-iii: the evidentiary boundary).
  5. The credential split (B8): the fence architecture (Q-iv), the
     runtime blast radius (tests/db/runtime-credential.test.ts), the
     two-op maintenance pin, the INHERIT correction (Q-vi).
  6. The Q6 binds on the inbox (existence leakage, the empty-state
     copy, the lookalike verdict display).
  7. The B9 leg's claims vs its assertions (EICAR live; the cliff
     probe; the relay finishing a duplicate resolution).

RECORDED TRAPS (this review's set):
  gh is UNAUTHENTICATED — CI via the anonymous public API; never
  device-flow · pending never counts as green · findings land VERBATIM
  at `docs/review/round-13-findings.md` BEFORE dispositions (the
  standing rule) · dispositions ADR = ADR-0019's ratification (amend
  in place, round-12 pattern) · any tree move outside `docs/` voids
  the packet's F12 transfer and forces a re-run · the four-class test
  taxonomy: a mocked call-order assertion is never live-authority
  proof — check each row's label honestly · never real family data ·
  vitest forks-worker spawn failure = infrastructure, one re-run ·
  never interrupt db reset; post-reset Kong 502 → docker restart
  supabase_kong_HarpersCirclev3 · the gate stack needs the clamd
  container (e2e-local-gate.md prerequisites) · PowerShell: git
  commit -F, never -m.

THE GATE CADENCE (ADR-0006 — each its own fresh session):
  this review → `round-13-findings.md` verbatim → dispositions
  (ADR-0019 ratified/amended) → owner sign-off → merge (MERGE COMMIT,
  never squash). The owner is the sole merge authority. ⏸ STOP at
  each boundary.
