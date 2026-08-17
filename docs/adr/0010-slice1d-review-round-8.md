# ADR-0010 — Third-party review round 8: the built 1D surfaces, findings, dispositions

**Status:** Proposed (accepted on merge of `slice/1d-derived-surfaces`)
**Deciders:** owner (sole merge authority, per ADR-0006)
**Date:** 2026-08-17
**Packet reviewed:** `docs/review/round-8-findings.md` — the adversarial
third-party review of the slice at evidence head `85a0870` (docs `0c86a72`),
base `main` @ `4c51bb2`, against the master plan, TSD as amended by annexes
A1–A7, and ADR-0001–0009.

**Reviewer verdict:** **merge-ready — no blocking findings, no
minimum-pre-approval items.** Four **evidence/hardening** findings were left
as dispositions for this session (the round-7 → ADR-0008 pattern), each
independently reproduced by the reviewer. All four are ruled below; the
accepted fixes were applied the ADR-0006 way — red `f6668f3` (every failure
signature in the commit message) → green `c327e7e` (migration
`20260817120001_round8_fixes.sql`, "M7") — before the owner's merge review.
The reviewer's ten question-answers and eight hard-item interrogations were
read against the rulings here; no conflict arose (Q1's recommended refinement
is adopted as F4; Q7's "further inlining not warranted" is adopted under F2).

## Findings and dispositions

| # | Severity | Finding | Disposition | Applied where |
|---|---|---|---|---|
| F1 | evidence / hardening | The CI-2/CI-3 admin-boundary walk has a confirmed blind spot: a whole-row `to_jsonb(t.*)` view over a *mixed* table records only a relation-level (`refobjsubid = 0`) dependency — indistinguishable in `pg_depend` from a legitimate FROM-clause entry — and its column names trip no scan. "Probe-proven in both directions" (ADM-02) and "the binding boundary is the set of view definitions" (M4 header) overstate the mechanical guarantee | **Accepted.** The residual is now probe-CONFIRMED in the suite itself (031:24 creates the escaping view and records that the walk AND the name scan both miss it), and closed mechanically by **CI-2b** (031:25): `md5(pg_get_viewdef())` pinned for every `admin_meta` view — any definition change, a future whole-row blob included, reds the suite and forces the review the residual depends on. Wording softened in coverage ADM-02 and annex A7; the M4 header's phrase and ADR-0009 D4's "probe-proven in both directions" stand as history, superseded by this ADR's precise claim (the ADR-0008 B3 precedent — shipped migrations are never edited). Test + wording only; no migration | 031:24–25; coverage ADM-02; annex A7 |
| F2 | evidence | PRF-06's cold "ALL BOUNDS MET" does not reproduce: cold `page_docs` breached the 250 ms page tripwire (280–329 ms across two fresh restarts on the reviewer's contended host) where the packet recorded ≤ 157 ms; "margins ≥ 3×" holds for the scan queries, not the page tripwire | **Accepted — docs-only.** The encoded gate is the warm 25-run p95, which reproduces green everywhere; the cold leg is a report-only diagnostic by design (`prf06.mjs` cold mode exits 0 regardless — deliberate, now recorded). The normative claims are softened: cold warm-up can transiently exceed the 250 ms page tripwire — a self-imposed bound ~6× tighter than PRD §13.2's 1.5 s p95 page budget, which even the breaching cold sample clears ~4.5× over — and "margins ≥ 3×" is the scan-query claim that drove the rewrite. The packet's cold table stands as the record of its host. Pursuing further inlining is not warranted (reviewer Q7 concurs) | coverage PRF-06; annex A7; ADR-0009 D7 note |
| F3 | evidence / hardening | `hc.log_denied` validates its caller (live membership) but not its `p_subject_id`: a stale or cross-circle subject rides the DEFERRABLE INITIALLY DEFERRED declaration FK to COMMIT, aborting the otherwise-valid request with a raw `23503` far from the call — not the DEF-10 uniform shape. No cross-tenant persistence (the FK holds); the defect is the shape and the where. The path was untested | **Accepted — the reviewer's primary recommendation.** The function now refuses a subject that is not the circle's own at CALL time, in the SAME `denied_log_refused` shape as the stranger — nonexistent and cross-circle indistinguishable, writing nothing; the predicate mirrors the FK exactly (row existence in the circle), and the deferred FK stays as the commit-time belt. Document-and-defer was considered and declined: `log_denied` is a LANDED request-path surface (EXECUTE to `authenticated`), DEF-10 is a 1A-green invariant, and this was its one breach — a three-line check closes it. The round-5 deferral itself is untouched (it exists for `create_circle`'s declaration-precedes-subject write, not for this path). Red proved the reviewer's exact scenario including the raw `23503` via `SET CONSTRAINTS ALL IMMEDIATE` | M7; 034:1–5; coverage LOG-02 |
| F4 | evidence / question (Q1) | A null-subject denial carrying a domain rides the `subject_id is null` branch and is visible circle-wide, bypassing the per-domain filter — inconsistent with D1's deliberate "a member's own denials about a hidden domain are invisible to them" fail-closed intent. Exposure bounded (actor + domain tag, no object, no subject, empty detail) | **Accepted — domain-filtered, by the all-subjects rule.** D1's row rule is completed with the mirror of the 1C precedent: a subject entry with no DOMAIN fails closed to ALL DOMAINS (unchanged); a domained entry with no SUBJECT fails closed to ALL SUBJECTS — visible only to a reader whose level on that domain is ≥ log for EVERY live subject of the circle, through the same `hc.visible_at`, so freeze, the FRZ-13 cap and the care ceiling arrive for free; an empty subject set stays dark (fail-closed, never vacuously open — `visible_at` provably never returns null, so the quantifier has no open edge). Alternatives weighed and declined: *confirm-intent* (the incoherence is live today — `authenticated` can produce the shape; whether a member's denial is broadcast must not depend on whether the route layer happened to resolve a subject); *write-side normalization* — forcing `domain := null` when subject is null (loses the coordinator's per-domain diagnostic and coarsens collapse); *dark-to-everyone* (destroys the audit trail for full-access readers). No internal writer produces the shape — `hc.log_denied` is its only producer, so the policy change moves no existing production row class | M7; 034:6–12; coverage LOG-01; annex A7 |

## The F4 rule, precisely

The read policy (`access_log_select`, recreated by M7) is now three branches
under the membership envelope:

1. `subject_id is null and domain is null` — circle-level trail
   (membership, freeze), visible to every live member; the freeze's own
   entries stay readable under the freeze (PRD §7.5). Unchanged.
2. `subject_id is null and domain is not null` — visible iff at least one
   live subject exists AND no live subject of the circle leaves the reader
   below `log` on that domain (`not exists (… visible_at(…) < 'log')`).
   In the common one-subject circle this is exactly the subject rule; the
   subjects subquery runs under the reader's own RLS, which shows a member
   every live subject of their circle (`subjects_select`), so the
   quantification is complete — no fail-open through hidden subjects.
3. `subject_id is not null` — the reader's level on the entry's domain via
   `visible_at`, no-domain failing closed to all-domains. Unchanged.

## Verification at the disposition head

All evidence at **`c327e7e`** (the SQL/test tree head — the M7 green commit;
the docs commits that follow are docs-only and leave the SQL/test tree
unchanged, the round-8 head-ledger pattern):

- **Red → green structure:** red `f6668f3` is test-file-only (034 new; 031
  additions), 913 planned / 6 failures, each signature in the commit message
  (cross-circle subject accepted seq 3; nonexistent accepted seq 4; two
  bad-subject rows in-transaction; raw `ERROR:23503` from
  `SET CONSTRAINTS ALL IMMEDIATE`; hidden-health member reads the
  health-tagged null-subject denial; freeze leaves 2 domained null-subject
  rows visible). Green `c327e7e` carries exactly M7; **no pinned-inventory
  moves were needed** — the same-signature `CREATE OR REPLACE` preserves
  002's definer signature/owner/grant pins and the policy recreate keeps
  030:2's one-authenticated-policy count.
- **Clean leg:** `db:reset` (alone) → `verify-migration-state` **exact: 38
  applied == supabase/migrations** → `test:db` **Files=35, Tests=913 …
  Result: PASS** → `test:concurrency` **44/44** → `db:verify` **No schema
  errors found** (`--fail-on warning`).
- **Upgrade leg** (per `ci.yml`, locally): worktree @ merge-base `4c51bb2`
  (independently confirmed) → base reset → **exact: 31** → `npx supabase
  migration up` (exactly the seven 1D migrations `120001`–`120006` +
  `20260817120001`) → **exact: 38** → `test:db` **913 PASS** →
  concurrency: the first run reported **43/44** with the failing case's
  output not retained (truncated by the local runner pipe — a process
  fault of this session, recorded); two immediately-following runs with
  output retained report **44/44 and 44/44** against the same upgraded
  database. The only DB-log anomalies in the window are case 1's three
  deliberate `40P01`s per run (the PLT-02 repro). Classified per the
  ADR-0008 E3 precedent: an **unclassified transient**, consistent with the
  one prior recorded flake; CI retains full output as artifacts on every
  push, so a next occurrence is classifiable. The base reset's first
  attempt also failed transiently at container restart (empty database, the
  known interrupted-reset state) and was re-run to a clean 31 — the
  verifier arbitrated both times.
- **Push CI at the disposition docs head:** run **32078156882** @
  `d1583d2` (the ADR/coverage/annex commit atop `c327e7e`, docs-only —
  same SQL/test tree) — **success**, confirmed via the public API
  in-session. The run-id-record regress terminates the round-7 way: this
  commit changes only the run-id record, and its own push run is verified
  in-session and recorded in the vault ledger.

## Consequences

- **38 migrations** — M7 is the one disposition-driven addition
  (advisory-exempt, ADR-0006 Q8/P3; the M9-of-round-7 precedent). The 1D
  plan bound stands at **7 of ≤ 8** slice migrations; headroom one.
- pgTAP grows to **913 across 35 files** (031 +2: the residual probe and
  the CI-2b definition pin; 034 +12: the round-8 disposition file);
  concurrency unchanged at **44/44** across 25 cases (no new writer, no new
  lock path: F3's check is a plain read before the advisory lock; F4 is
  read-side only).
- The definer inventory is **unchanged at 32** (`log_denied` replaced in
  place — same signature, owner, ACL); `authenticated`'s EXECUTE set and
  the hc_internal policy list (67) are unchanged; PostgREST exposure
  unchanged (PIN-01).
- **CI-2b** joins the §3.9 CI assertions: the admin_meta view definitions
  are pinned by content hash; changing or adding a view definition requires
  a same-commit re-pin, making the D4 residual's "review of view
  definitions" mechanical rather than customary.
- Annex A7 records the §2.8 deltas normatively (the all-subjects read rule;
  `log_denied`'s call-time subject validation) and the corrected PRF-06
  wording; ADR-0009 D1/D2/D4/D7 carry pointer notes to this ADR. No other
  authority text changes.

## Process note

Fixes landed as one red→green pair on the slice branch (red `f6668f3` →
green `c327e7e`), docs in the closing commits, per ADR-0006 P4: forward-fix
only, migrations append-only, `main` untouched until the owner's merge — a
**merge commit, never squash**. F1 landed as test+wording in the red commit
(no behavior change exists to drive a red state — the probe documents, the
pin pins; the ADR-0008 E-finding precedent); F2 is docs-only. Per the
owner's standing decision, this session stops before merge.
