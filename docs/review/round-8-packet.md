# Third-party review packet — round 8: the built 1D derived & operational surfaces

**Requesting review of:** slice `1D — derived & operational surfaces`,
built on branch `slice/1d-derived-surfaces` (base `main` @ `4c51bb2`),
six migrations `20260816120001`–`20260816120006`, six new pgTAP files
(028–033, +137 assertions), two new two-session cases (24–25, +2
assertions), the PRF-06 benchmark (`scripts/bench/prf06.mjs`), ADR-0009,
TSD Amendments annex A7, coverage rows SRCH-01/02, LOG-01/02, ADM-02,
LDG-01, DSC-01, TNT-08, OPS-01, PRF-04, PRF-06, RLS-11a + staged
SIG-01/DEL-01/ADM-01 and the SHR-02 retag.

**Authority order:** master plan → TSD §2.8–§2.11, §3.9, §7 as amended by
annexes A1–A7 → ADR-0001–0009 → Appendix A + `docs/coverage.md`
(authoritative per assertion; pending never green).

**Review style requested:** as rounds 6–7 — decision-completeness over
mechanism rework. Every TSD delta is in annex A7 with its ADR-0009
section; every staged surface has a pending coverage row; the pointed
questions below each carry a recommended answer.

**Round-7 process fixes carried into this packet (dispositioned, kept):**
the head ledger appears from the start (E2); the verification evidence is
recorded at ONE final SHA with complete summary lines, never a
grep-filtered chain (E1/E3 — CI additionally retains full test output as
artifacts on every run); pointed questions carry recommended answers.

---

## What 1D is

The derived-data surfaces over the 1A–1C kernel: the search write path
(tsv builders on documents/tasks/timeline_events; the dsc builder that
derives `extracted_text` from approved extraction values and builds
`tsv_full` + `search_text_full` from ONE string; the documents→dsc sync
that pays §7.1's cross-table dependency in the writing transaction) and
the search read path (the dsc view-level policy — §7.2's LEFT JOIN as the
level decision — plus the A.3 matrix through the search channel and the
A.5 search oracles); the access log's read side (the §2.8
permission-filtered family read, denial collapse behind a strict
immutability carve-out, the chain-head signing interface); the §3.9 admin
boundary (admin_meta's five hc_internal-owned views, admin_ops EMPTY by
ruling, the four CI assertions probe-proven); the §2.9 deletion-ledger
and §2.8 signature interfaces (local stand-in schema, owner-only
writers); the TNT-08 request paths (reclassify through `visible_at`
under the R-rule, scheduled sweeps recorded and alerting); and the two
performance gates — PRF-04 landed as a measured-execution regression, and
PRF-06 run, **breached, and answered by the ruled rewrite** (inline-
friendly `visible_at` + page indexes), re-measured green warm and cold.

The R-rule binds the one NEW request-path writer (reclassify);
concurrency cases 24–25 prove a mid-wait freeze and a mid-wait revocation
each defeat it.

## Migration map (6 of the ≤ 8 plan bound)

| # | File | Contents |
|---|---|---|
| M1 | `120001_search_write` | tsv builders (documents A/B; tasks A/B; timeline A); the dsc builder (extracted_text derived, ocr_text preserved, same-string tsv_full/search_text_full); documents→dsc sync trigger; tasks_tsv/timeline_tsv GIN indexes; dsc writer allowlist FINALIZED (hc_internal S/I/U, DELETE for nobody) |
| M2 | `120002_search_read` | dsc view-level read policy (EXISTS on the document at `view`) + authenticated SELECT — DSC-01 |
| M3 | `120003_access_log_read` | the §2.8 family read policy; `hc.log_denied` + the strict collapse carve-out (column-scoped UPDATE); `hc.log_chain_heads()` (owner-only, SIG-01 staged) |
| M4 | `120004_admin_boundary` | admin_ops schema (EMPTY — ADM-01 ruling); §3.9 revokes/defaults as bindable; admin_meta views platform_stats/circle_shapes/pipeline_health/stage_outcomes, hc_internal-owned, hc_admin SELECT + default ACLs |
| M5 | `120005_ledger_ops` | reclassify request path (visible_at authorization under the lock + authenticated EXECUTE); hc.sweep_runs + hc.run_taint_sweep (hc_pipeline) + admin_meta.sweep_health (OPS-01); schema ledger: tombstones (+ executed_at carve-out, hc.record_tombstone owner-only), log_head_signatures (immutable) |
| M6 | `120006_prf06_rewrite` | the PRF-06 breach clause executed: ladder → jsonb containment; visible_at → one CTE-free expression (ladder/all_domains inline in); documents_page/tasks_page/timeline_events_page partial indexes |

## Red→green history (each red commit names its failure signatures)

| Unit | Red | Green |
|---|---|---|
| U1 search write | `9418d23` (21/29 — no tsv triggers, dsc dark, no dsc row, rename unpropagated) | `c4c3782` |
| U2 search read | `731e6b1` (20/23 — 42501 on every §7.2 member query) | `ed7b04d` |
| U3 access-log read | `dd5978d` (21/24 — 42501 reads; log_denied/log_chain_heads 42883) | `6cfb10d` |
| U4 admin boundary | `5e4cd11` (9/23 — no admin_ops, no views, no reach; walk controls prove themselves in red) | `c63d8bd` |
| U5 ledger + ops | `c7940f7` (21/26 — reclassify NOT_GRANTED via catalog gate; sweep/ledger 42883/42P01) | `88026f8` |
| U6 PRF-06 | `062b73a` (5/12 shape pins + the measured breach) | `ba8ecec` |
| Concurrency 24–25 | — (runner extension, in `88026f8`) | `88026f8` |
| Docs (ADR-0009, annex A7, coverage) | — | `7ce0d9c` |

## Defects found and handled red→green inside the slice

1. **Live function-ACL denial segfaults this image (PLT-04, again).** The
   U5 red originally CALLED the not-yet-granted reclassify as
   authenticated and crashed the backend. The red now gates its live
   calls on the catalog (`NOT_GRANTED` sentinel) — the same discipline
   004/008 adopted in 1A. No production surface change.
2. **`hc.reclassify_taint` was freeze-blind and ceiling-blind** as an
   owner-only function (raw grant-vector containment). Harmless behind
   trusted callers; a hole on a request path. It now authorizes through
   `hc.visible_at` under the per-circle lock (ADR-0009 D5); a frozen
   coordinator, a capped carve-out coordinator, and a care_circle member
   at manage-level grants are all refused (032:5–6; cases 24–25).
3. **§3.9's `revoke usage on schema public from hc_admin` cannot bind**
   on this image: `public`'s USAGE flows from the PUBLIC pseudo-role and
   revoking PUBLIC's would break the request paths. The boundary that
   binds is table/function ACL absence — which is exactly what produces
   A.1's `permission denied for table` (ADR-0009 D4; 031:3–5).
4. **`now()` is transaction-stable**, so two sweep runs in one
   transaction tied on `started_at` and `sweep_health` picked an
   arbitrary "latest". `sweep_runs.started_at` defaults to
   `clock_timestamp()` (M5).
5. **The `pg_depend` walk cannot distinguish a whole-row var from a
   FROM-clause reference** on a *mixed* table (both are `refobjsubid 0`).
   Mitigation: any reference at all to the seven content tables + dsc is
   forbidden; the mixed tables are guarded by named-column rejection,
   exact view-column-list pins and a column-NAME scan; recorded as a
   known limit of the mechanical check (ADR-0009 D4).

## PRF-06 — the quantitative gate, run honestly

Benchmark: `scripts/bench/prf06.mjs` — one circle at the PRD §13.3 cap
(5,000 arrivals), 2,500 documents (each with its dsc row; every 10th
carrying OCR text; every 50th a selective token), 1,500 tasks, 1,000
timeline events, 3,000 provenance edges with transitively honest taints,
7 members, 50 object shares; two callers — `mv` (view×5) and `mx`
(manage on schedule+memories only); vectors built by the REAL triggers;
25-run warm percentiles + a cold leg (first run after
`docker restart` of the database container).

**Before the rewrite (warm p95):** page_docs 1,680 ms / page_tasks
903 ms / page_timeline 1,026 ms against the **250 ms** bound;
search_broad 3,490 ms against the **2,500 ms** bound (search_narrow
2,888 ms; search_count 2,500 ms at the line). **Both bounds breached ⇒
the ADR-0006 F7/Q6 breach clause executed.**

**After M6 (warm, 25 runs):** page p95 6.3–216.4 ms; count p95
128.9–311 ms; search p95 206.5–1,914.8 ms — **ALL BOUNDS MET**.
**Cold (first run after restart):** page 10.4–157.2 ms; scans
126.2–1,629.7 ms — **ALL BOUNDS MET**. Full tables in the two benchmark
outputs quoted in ADR-0009 D7's source runs; the script reproduces them
(`setup` → restart → `cold` → `warm` → `cleanup`).

What changed and what did not: `hc.ladder` tests rungs by jsonb
containment; `hc.visible_at` is one CTE-free expression that CALLS
ladder (the rule stays written once); the top-level call cannot inline
because its argument is the hoisted ctx sublink — recorded, not claimed
away. Clause order 1–6 and the FRZ-13 last-position cap are
decision-identical; the 003 truth table (36 cases), 016, and 033's grid
are the binding oracles, all green over the rewrite.

## Mutation posture

The 1B/1C mutation checks (MUT-01/02/03) stand as recorded. The 1D
equivalent is structural: the M6 rewrite is itself the mutation risk this
slice carries, and its oracle is the full 003/016/033 battery plus every
RLS suite in the tree (899 assertions ran green over it, twice — clean
and upgraded legs). The CI-2/CI-3 admin walks carry in-file probe
controls (031:13/15) so the walk cannot silently rot.

## Verification evidence (local, ONE final SHA)

All local evidence below was produced at the tree of **`7ce0d9c`**
(the docs head; SQL/test tree identical to green head `ba8ecec` — the
packet commit this file lands in is docs-only on top). Complete summary
lines, no grep-filtered chains:

- **Clean leg:** `npm run db:reset` → verifier
  `migration state exact: 37 applied == supabase/migrations` →
  `npm run test:db` → `Files=34, Tests=899 … Result: PASS` →
  `npm run test:concurrency` → `44/44 concurrency assertions passed` →
  `npm run db:verify` → `No schema errors found` (hard gate,
  `--fail-on warning`).
- **Upgrade leg (the ci.yml rehearsal, run locally):** worktree @
  `4c51bb2` → base reset → verifier exact **31 == 31** →
  `npx supabase migration up` (exactly the six 1D migrations) → verifier
  exact **37 == 37** → `test:db` `Files=34, Tests=899 … Result: PASS` →
  `test:concurrency` `44/44` — against the upgraded database; worktree
  removed.
- **Interrupted-reset hazard:** hit TWICE this session (chained batteries
  whose resets were moved to background at a timeout boundary;
  `schema_migrations` absent both times); the exact-state verifier caught
  both mechanically — re-reset foreground, verified exact, full battery
  re-run green. The storage-api health flap also reproduced (reset exits
  1 after the database work completes); the verifier plus a full suite
  run distinguished it from a real interruption, as recorded in 1C.
- **One backend crash, classified:** the U5 red's live ACL-denied
  function call segfaulted the backend — the KNOWN pinned-image defect
  (PLT-04), not new breakage; the red was restructured to catalog-gated
  probes and the crash is not reachable from the committed tree.
- **CI (public API, both events at the final head):** run ids recorded
  in the addendum below after push.

## Pointed questions for round 8 (recommended answers inline)

1. **D1 (access-log row rule).** Circle-level entries visible to every
   live member; subject entries at ≥ log on the entry's domain; null
   domain ⇒ all-domain fail-closed. A denied member cannot see their own
   denial about a hidden domain. Is member-visibility of circle-level
   rows (including the freeze trail, during the freeze) the right read
   of §2.8 + PRD §7.5? *Recommended: yes — the freeze's own trail must
   be contestable; content-bearing rows all carry domains.*
2. **D2 (the "unconditionally" carve-out).** The denial-collapse
   increment is the ONE admissible mutation, strict (+1, two unhashed
   columns, denial rows only), with a column-scoped UPDATE grant as the
   second belt. Accept the §2.8 amendment? *Recommended: yes — the
   alternative (collapse-by-new-row) makes the flood the log's problem
   again, which is what AC-PPL-7 exists to prevent.*
3. **D4 (admin_ops EMPTY).** Every §9.3 wrapper needs §5.7's
   operation-bound step-up and dual control; landing wrappers that
   accept-and-ignore MFA tokens would repeat the APR-06 defect class.
   Accept the ADM-01 staging with CI-4 pinning the empty inventory?
   *Recommended: yes — the boundary is complete without the operations;
   the operations are not safe without the auth slice.*
4. **D4 (schema-public USAGE).** The PUBLIC-packaged usage on `public`
   cannot be revoked per-role; the binding boundary is ACL absence,
   pinned as CI-1/CI-4 plus the no-direct-entry check. Accept as the
   §3.9 amendment? *Recommended: yes — it is the platform's fact, and
   the A.1 failure mode it produces is the one the tests always pinned.*
5. **D5 (reclassify semantics change).** Authorizing through
   `visible_at` means an UNRESOLVED object needs manage-on-five to
   reclassify (previously: manage on its recorded taint). This is the
   VIS-02 arithmetic; 012's restore case (manage×5 caller) is unchanged.
   Accept the stricter unresolved rule? *Recommended: yes — an
   unresolved lineage IS the all-domain case everywhere else; a laxer
   rule here would make the recompute the weakest door.*
6. **D6 (OPS-01 shape).** Nightly taint sweep + per-minute pipeline
   sweeper under hc_pipeline; alerting via an admin view (findings > 0,
   staleness > 24 h) with the worker's pager duty landing with RLY-01;
   `sweeper_pass` deliberately not instrumented (its RAC-06-proven body
   stays untouched; pipeline observability lives in
   pipeline_health/stage_outcomes). Sufficient for the gate?
   *Recommended: yes — every OPS-01 clause is either mechanical now or a
   one-line worker config recorded for RLY-01.*
7. **D7 (the rewrite's honesty).** The top-level `visible_at` call does
   not inline (ctx-sublink argument); the measured margins are ≥ 3×
   at the §13.3 cap. Accept "inline-friendly" as built rather than
   pursuing full inlining (which would require splitting ctx into
   per-policy arguments)? *Recommended: yes — the bounds are the gate,
   the margins are wide, and the split would multiply InitPlans per
   policy for no measured need.*
8. **D8 (episodes/profile_facts vectors).** The shared-block tsv columns
   stay unmaintained; §7.1 names three search relations and §2.11 four
   indexes. Confirm episodes stay unsearchable in Phase 1.
   *Recommended: confirm — an episode is a wrapper; its members are
   individually findable.*
9. **D9 (retags/staging).** SHR-02 → the tasks surface (2+); RLS-11
   split (search green; notification/export with their surfaces);
   SIG-01/DEL-01/ADM-01 staged. Any of these actually 1D obligations?
   *Recommended: no — each needs a surface (worker runtime, deletion
   flow, auth-slice step-up) that does not exist; each interface that
   could land dark HAS landed dark and invariant-tested.*
10. **Plan bound.** Planned ≤ 8 migrations, built 6 (M7/M8 headroom
    unspent; the PRF-06 rewrite consumed one slot exactly as the breach
    clause anticipated). Confirm the discipline held.

## Files

- Migrations: `supabase/migrations/20260816120001…120006_*.sql`
- Tests: `supabase/tests/028…033_*.sql` (+ pinned-inventory moves in
  001, 002, 010, 011, 031 — each moved in the same green commit as the
  migration that changed the fact it pins)
- Concurrency: `scripts/concurrency/run.mjs` cases 24–25
- Benchmark: `scripts/bench/prf06.mjs`
- Docs: `docs/adr/0009-1d-derived-surfaces-deltas.md`, TSD annex A7,
  `docs/coverage.md` (1D section + gate flips + staged rows)

---

## Addendum — auditability block (head ledger from the start, round-7 E2)

| Purpose | SHA | Tree relationship | CI status |
|---|---|---|---|
| Base | `4c51bb2` | `main` (round-7 merge + docs) | green (runs 32006873526 / 32007302630, recorded in ADR-0008 block) |
| Green build head | `ba8ecec` | 12 red→green commits from base | covered by the final-head runs (same SQL tree) |
| Docs head | `7ce0d9c` | ADR-0009 + annex A7 + coverage, docs-only | idem |
| Round-8 packet head | *(this commit)* | this file, docs-only | both-event run ids recorded below after push |

- **Local evidence:** at `7ce0d9c`'s tree, quoted verbatim above (one
  SHA, complete summary lines).
- **PR:** to be opened by the owner (gh is unauthenticated in the build
  session; raw-token extraction is out of bounds), base `main` @
  `4c51bb2`, **DO NOT MERGE** banner in the description.
- **Pins:** Supabase CLI 2.100.1; image
  `public.ecr.aws/supabase/postgres:17.6.1.106`; Node 22.15.0 / npm
  10.9.2; pg 8.16.3 — no drift this slice.
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs supabase/migrations` ·
  `npm run test:db` · `npm run test:concurrency` · `npm run db:verify` ·
  upgrade leg per `ci.yml` (worktree at merge-base, base reset, exact
  list, `supabase migration up`, exact list, both suites) · benchmark
  `node scripts/bench/prf06.mjs setup|cold|warm|cleanup`.
- **CI at the final head (filled after push):** _push run: TBD ·
  pull_request run (after the owner opens the PR): TBD._
