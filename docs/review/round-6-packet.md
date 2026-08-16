# Round-6 review packet — slice 1B, the record & provenance kernel

**Branch:** `slice/1b-record-provenance` (PR from this branch; red→green
history preserved — every unit is a red commit naming its failure
signature followed by a green commit). Base: `main` @ `03a0c12` (1A, PR #1,
CI run 31928258175). **Do not merge**: two reviewers required (owner +
third-party round 6); findings dispositioned by ADR before merge.

**Authority applied:** master plan → TSD §2.4–§2.6, §3.5–§3.8 → ADR-0001–0005
→ Appendix A + `docs/coverage.md` (authoritative per assertion).

## 1 · The increment

Eleven migrations, `20260815230001`–`230011`:

| M | File | Contents |
|---|---|---|
| M1 | `ingestion_prereqs` | §2.4 prerequisite tables pulled forward (ADR-0005 D1), fail-closed; arrivals granted to nobody |
| M2 | `record_tables` | the five record tables + document_search_content, shared block, §2.7 temporal shapes, §3.4 read policies; dsc dark in both directions |
| M3 | `provenance_shares_revisions` | record_revisions (append-only), object_shares (revoke-only), provenance_edges (link/unlink, never update) |
| M4 | `guard_row` | one generic BEFORE UPDATE guard (D4) on the five + proposals |
| M5 | `taint_machinery` | own_domain (D3), link_provenance, propagate_taint_growth, reclassify_taint, sweep_provenance, taint_union; hc_internal UPDATE + *_internal_revise; profile_facts.domain |
| M6 | `approve_proposal` | the only writer (§3.7 verbatim signature); write grants; claim-checked insert policies; deferred claim triggers |
| M7 | `revise_object` | the one edit path; per-type allowlist; revision rows |
| M8 | `share_object_ctx` | the only share writer; CTX-07: §3.2-verbatim shares in ctx/ctx_for |
| M9 | `freeze_carveout_presence` | FRZ-13 (D2 column, re-signed adjudicator, grant_vectors cap, visible_at least(result, cap)); hc.presence() |
| M10 | `concurrency_fixes` | two U10-found defects: assert_claimed → SECURITY DEFINER; link_provenance locks BEFORE reading taints |
| M11 | `lint_temp_tables` | db:verify: walk state into per-statement CTEs; approve initializer typed |

## 2 · Verification (all green at the PR head)

- **pgTAP:** 533/533 across 18 files (`supabase/tests/000–017`).
- **test:concurrency:** 18/18 (`scripts/concurrency/run.mjs`; wired into CI
  after test:db). Cases: raw opposite-order deadlock repro ×3 (exactly one
  40P01 each); the same contention through `approve_proposal` ×10 (advisory
  lock serializes, zero deadlocks); growth-vs-shrink blocking asserted from
  `pg_locks` + serial-equivalent result + failure atomicity; RLS-08.
- **Reset legs, isolated:** (a) clean from empty — 21 migrations, exact
  `schema_migrations` == filename prefixes, both suites green. (b) upgrade —
  1A baseline (10 @ 03a0c12) materialised in a TEMP worktree, reset there,
  exact 10-version list verified, ONLY the eleven 1B migrations applied
  (`supabase migration up`), both suites green, worktree removed.
- **lint · typecheck:** clean. **db:verify:** one dispositioned warning —
  `approve_proposal.p_step_up_token` unused (§3.7 signature verbatim;
  step-up binding is §5.7's obligation in the auth slice).
- **Mutation evidence:**
  - guard_row shrink-guard removed → 011 cases 6, 7, 9, 14 red by name
    (taint shrink ×2, row-scoped marker, proposals shrink); restored, green.
  - `tasks_internal_write` with_check dropped → 013:31 red; 013:30 (the
    deferred-trigger branch) STAYS green — the two controls are independent,
    which is their point; restored, green.
- **Privilege snapshot:** two-way exact (002); zero PUBLIC grants on tables
  or functions; anon/hc_pipeline/hc_admin hold nothing new.

## 3 · Inventories (pinned in 002; exact, two-way)

- **Functions:** 32 in `hc` (002 test 2 enumerates every identity).
- **SECURITY DEFINER:** exactly 15 (002 test 3) — the 1A six + approve,
  revise, share, presence, link, propagate, reclassify, sweep,
  assert_claimed (M10 disposition below).
- **EXECUTE to authenticated:** ctx, create_circle, approve_proposal,
  revise_object, share_object, presence + the four pure policy functions.
  ctx_for/grant_vectors and all machinery: owner-only.
- **hc_internal policies:** exactly 46, named (002 test 13). Asymmetric
  bounds: revisions append-only; shares revoke-only; edges link/unlink
  never update; freezes never deleted; record tables no DELETE for anyone.
- **Writer allowlist (begins, catalog-based):** documents =
  {authenticated SELECT; hc_internal SELECT, INSERT, UPDATE} exactly, from
  `information_schema.role_table_grants`; dsc = ZERO rows for our five
  roles; trigger inventory from `pg_trigger`: documents = {claim, guard},
  dsc = {} (002 tests 19–20; per-table triggers also pinned in 011:17).

## 4 · Performance (PG 17.6 pinned image)

- Every textual `(select hc.ctx())` is an InitPlan; record policies show
  two InitPlans, zero SubPlans (008:10–11).
- **The O(rows) tripwire is the instrumented counter:** ctx executed
  exactly 2× over a 2,000-row tasks scan (== textual references; the
  per-row catastrophe would be ~4,000) — 008:12.
- Wall clock RECORDED, not gated: 2,000-row tasks scan ≈ 951 ms quiet,
  up to 3.6 s under parallel-suite load (1:4 dev-box variance — an
  absolute bound flaked, see pointed question 6). 1A identity-table
  gates unchanged (< 250 ms, passing).

## 5 · Pointed questions for round 6

1. **ADR-0005 D1 (cross-slice):** four §2.4 tables pulled into 1B with full
   DDL, fail-closed, arrivals granted to nobody. Is the boundary drawn
   right, and are the 1C pending rows (ING-02/03) complete?
2. **ADR-0005 D2:** `freezes.objected_to_member_id` — a TSD §2.3 DDL gap
   closed in-slice (FRZ-13 is unimplementable without the identity).
   Null ⇒ no carve-out (fail-closed). Should the TSD absorb the column?
3. **ADR-0005 D3:** the own_domain map — interpretive rows: episode →
   memories; timeline 'admin' → schedule; profile_fact payload-declared
   (materialised as `profile_facts.domain`, nullable until approval
   enforces it). Confirm or remap.
4. **ADR-0005 D7:** approve-time taint = own ∪ drafted ∪ parents' CURRENT
   union, with manage checked on the union. Alternative: refuse outright
   when parents grew past the drafted taint (version-bump semantics)?
5. **§3.7 check order:** freeze runs before the visibility re-check so
   FRZ-14 keeps its named signature (visible_at returns hidden under a
   freeze and would swallow it). Confirm the reveal is acceptable (the
   member's own ctx already carries `frozen`).
6. **Per-row visible_at cost:** ~0.5 ms/row (non-inlined nested SQL
   functions: CTE body + dom/ladder). Fine at PRD §13.3 scale for pages;
   full-scan surfaces (search, 1D) may want an inline-friendly rewrite.
   The counter invariant is the load-bearing gate. Optimize in 1D or now?
7. **Growth-path serialization cost (D6):** every approval takes the
   per-circle advisory lock, serializing writes per circle. Accepted at
   design scale; confirm.
8. **Eleven migrations vs the 10-migration plan guideline:** M10/M11 are
   verification-driven fixes (concurrency defects; lint). Accept, or
   should future slices reserve headroom?
9. **U10 honest-red note:** the concurrency runner's red is the raw-SQL
   deadlock repro plus two REAL defects it discovered (assert_claimed
   fired as the committing role — invisible to rollback-only pgTAP;
   link_provenance read taints before locking). The mutation evidence in
   §2 carries the negative proofs for RLS-08/case-2.
10. **Reclassify caller staging (TNT-08):** reclassify/sweep are
    owner-only in 1B; the re-categorisation surface and sweep scheduling
    land with 1D. Confirm the staging.
11. **share_object duplicate-share refusal** uses the uniform
    `share_refused` shape (the granter can see the object but cannot read
    object_shares). Acceptable, or should re-sharing be idempotent?
12. **Manual entry** (§3.7): the record row's `source_arrival_id` is null
    via a payload flag, but §2.4 proposals still require an `arrival_id`.
    The manual-entry proposal's arrival remains a 1C/2 surface question.

## 6 · Where everything is

- Coverage: `docs/coverage.md` (1B rows green with test refs; staged rows
  pending — never green).
- Decisions: `docs/adr/0005-1b-cross-slice-and-design-deltas.md` (D1–D7).
- Tests: `supabase/tests/009–017` new; 001/002/007/008/010–016 extended.
- Concurrency: `scripts/concurrency/run.mjs`; CI: `.github/workflows/ci.yml`.
- Red signatures: in each `test(1b): … red` commit message on the branch.
