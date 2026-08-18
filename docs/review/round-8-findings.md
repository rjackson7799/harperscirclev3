# Third-party review — round 8 findings: slice 1D derived & operational surfaces

**Reviewer:** adversarial third-party (fresh session; builder's claims treated
as inputs to verify, never as facts).
**Reviewed at:** branch `slice/1d-derived-surfaces`, evidence head `85a0870`
(SQL/test tree) / docs head `0c86a72`, base `main` @ `4c51bb2`.
**Authority order:** master plan → TSD as amended by annexes A1–A7 →
ADR-0001–0009 → Appendix A + `docs/coverage.md` (authoritative per assertion;
pending never green).
**Style:** rounds 6–7 — decision-completeness over mechanism rework. Findings
graded **blocking / minimum-pre-approval / staged / evidence**; each names its
evidence.

---

## Verdict

**Merge-ready — no blocking findings, no minimum-pre-approval items.**

The slice is correctly built and independently reproduces green across both CI
legs. The security model holds under adversarial probing: the leakproof search
split, the deferred-FK-at-commit + collapse double-belt on the log, the
reclassify authorization through `visible_at` under the R-rule, and the admin
boundary's ACL-absence posture all behave as documented, and the shipped
`admin_meta` views are clean. The M6 `visible_at` rewrite is behaviorally
equivalent to the pre-rewrite body across an 11,349-case differential fuzz well
beyond the 003/016/033 oracles. Every 1D delta is recorded in ADR-0009 / annex
A7 with a coverage row, and every staged surface has a pending row whose absent
machinery is genuinely non-callable.

Four **evidence/hardening** findings below are dispositions for the next
session (ADR-0010, the round-7 pattern), not merge blockers. The most important
is F1: the CI-2 admin-boundary walk has a real, recorded blind spot that I
confirmed is bypassable — the shipped views don't trip it, but the "probe-proven
in both directions" framing overstates the mechanical guarantee for the views
that will land later.

---

## Independent verification performed (all green)

- **Clean leg** at the `85a0870` tree: `npm run db:reset` (alone) →
  `verify-migration-state` **`migration state exact: 37 applied ==
  supabase/migrations`** → `npm run test:db` **`Files=34, Tests=899 … Result:
  PASS`** → `npm run test:concurrency` **`44/44 concurrency assertions passed`**
  → `npm run db:verify` **`No schema errors found`** (hard gate, `--fail-on
  warning`).
- **Upgrade leg** per `ci.yml`, run locally: worktree @ `4c51bb2` → base reset →
  **`exact: 31 applied`** → `npx supabase migration up` (exactly the six 1D
  migrations `120001`–`120006`) → **`exact: 37 applied`** → `test:db` **899
  PASS** → `test:concurrency` **44/44** against the upgraded database; worktree
  removed. Merge-base independently confirmed = `4c51bb27f7ec…` = the claimed
  base.
- **Red→green structure:** each red commit (`9418d23`, `731e6b1`, `dd5978d`,
  `5e4cd11`, `c7940f7`, `062b73a`) is test-file-only; each green commit carries
  its one migration plus the same-commit pin moves in 001/002/010/011/031 — the
  red→green table in the packet is faithful to `git show --stat`.
- **CI (public API):** push runs **32056816540** @ `85a0870` and **32057230511**
  @ `0c86a72` both **success**. No PR is open yet (PRs #1–#3 are the prior
  slices, closed); the `pull_request`-event run fires when the owner opens the
  PR and, because HEAD ≠ base, will run the upgrade leg I rehearsed above. `gh`
  read-only via the public API; no token extraction.
- **M6 differential equivalence (my probe):** reconstructed the pre-M6
  `visible_at` body as `hc.visible_at_old` and compared it against the shipped
  rewrite over **11,349 boundary-targeted cases** (210 subject shapes = 7
  grant-vector profiles × 3 tiers × 2 frozen × 5 caps, × 9 taint/resolved
  profiles × share-on/off × 3 owner values, + the subject-absent context) —
  **0 mismatches**. This substantiates D7's equivalence claim beyond the
  003/016/033 battery.
- **PRF-06 benchmark (my re-run):** `setup` reproduced the exact fixture
  (5000/2500/2500/1500/1000/3000/50). **Warm (25 runs): ALL BOUNDS MET.**
  **Cold: a reproducible page breach** — see F2.
- **Adversarial probes:** CI-2 subid-0 residual (F1), `log_denied` subject
  validation (F3), null-subject denial visibility (F4), collapse carve-out —
  all run in rolled-back transactions or self-cleaning fixtures. Working tree
  left clean; DB healthy (one self-inflicted PLT-04 segfault during probing,
  classified below, recovered cleanly to 37 migrations).

---

## Findings

### F1 — The CI-2/CI-3 admin-boundary walk has a confirmed blind spot; "probe-proven in both directions" overstates it — **evidence / hardening**

**Evidence:** `031_admin_boundary.sql:259-353` (`forbidden_reached` /
`our_functions_reached`); ADR-0009 D4 residual clause; my probe
(`ci2_residual.sql`).

ADR-0009 D4 already records the residual: a relation-level (`refobjsubid = 0`)
dependency on a *mixed* table cannot be distinguished from a whole-row var by
`pg_depend`, and the mixed tables are guarded only by *named-column* rejection.
I confirmed this is not merely theoretical. A view

```sql
create view admin_meta.zz_wholerow as
  select s.circle_id, to_jsonb(s.*) as meta from public.subjects s;
```

returns **`forbidden_reached() = 0`** (the walk misses it — the dependency is
recorded at subid 0, and the column test matches no attnum) **and
`name_scan_hits = 0`** (the 031:23 `~* 'sender|title|…'` scan does not flag
`meta`/`circle_id`), while `to_jsonb(s.*) ->> 'first_name'` is fully readable by
`hc_admin` through the schema's default-SELECT ACL. The same escape works for
`to_jsonb(circles.*)` (whose `name`/`opening_context` are flagged columns).

The shipped five views are clean — they select specific safe columns, so
**there is no current exposure**, and the walk *does* catch the cases it
advertises (column-level derived refs like `length(title)`, function
indirection). The gap is precisely the case the in-file probes do **not**
exercise: the probes at 031:13/15 test the *catchable* column-ref path; the
*uncatchable* subid-0 whole-row path is untested because it cannot be caught by
this mechanism. So "CI-2 … probe-proven in both directions" (ADM-02) and "the
binding boundary is the set of view definitions" (M4 header) are stronger than
what the mechanical check delivers.

The reason it can't simply be tightened: `circle_shapes` legitimately references
`subjects`/`circles` in FROM clauses, which are *also* subid-0 dependencies —
so forbidding all subid-0 refs to mixed tables would red the shipped views
(packet defect #5 states this). The real backstop for a future whole-row view
is therefore manual review, and the exact-column-list pins (031 asserts them for
`circle_shapes` and `platform_stats` only) do not extend to `pipeline_health`,
`stage_outcomes`, `sweep_health`, or any future view.

**Recommendation (next session):** make "review of view definitions" mechanical
— snapshot `pg_get_viewdef()` for every `admin_meta` view and pin the set, so
any definition change (including a `to_jsonb` blob) trips the assertion and
forces review; and soften the "probe-proven in both directions" wording to name
the subid-0 case as the recorded, review-covered residual. Not a blocker: the
shipped surface is clean and D4 records the limit.

### F2 — PRF-06 cold "ALL BOUNDS MET" does not reproduce; the page tripwire has thin, cold-breaching margin — **evidence**

**Evidence:** my `warm`/`cold` re-runs of `scripts/bench/prf06.mjs`; ADR-0009
D7 / coverage PRF-06 ("Post-rewrite ALL BOUNDS MET warm AND cold … cold worst
1,630 ms"); PRD §13.2; `prf06.mjs:390` (cold mode exits 0 regardless).

Warm (the encoded gate, 25-run p95) reproduced **ALL BOUNDS MET** — consistent
with the packet's conclusion, absolute numbers differing by hardware/warmth
(e.g. `page_timeline`/mx 243.5 ms vs the packet's ≤216 ms). But the **cold**
leg, which the packet records as "page 10.4–157.2 ms; ALL BOUNDS MET," **did not
reproduce**: across two fresh `docker restart` + `cold` samples, `page_docs`
breached the 250 ms page tripwire at **326.1 ms** then **329.4/280.8 ms** (mv and
mx). The first page query after a cold restart pays index warm-up cost that the
250 ms tripwire is too tight to absorb on a contended host.

Materiality is limited, and I want to be precise about why this is **evidence**,
not a defect:
1. The **gate is warm p95**, and warm passes; the cold leg's own code exits 0
   on breach (it is a diagnostic, not the gate).
2. The 250 ms page bound is a self-imposed tripwire ~**6× tighter** than the PRD
   §13.2 page budget (1.5 s p95 / 3 s ceiling). A cold 329 ms page query is still
   ~4.5× inside the product's p95 target — the family never sees a slow page.
3. My environment ran three Supabase DB containers on one Docker daemon; the
   packet's host was presumably quieter. Cold single-sample variance dominates
   exactly here.

**Recommendation:** soften the coverage/ADR "cold ALL BOUNDS MET" line to
"cold warm-up can transiently exceed the 250 ms page tripwire but stays far
inside the §13.2 1.5 s page budget," and note that the "margins ≥ 3×" claim (D7)
holds for the *scan* queries that drove the rewrite, not for the page tripwire.
No code change required.

### F3 — `hc.log_denied` does not validate its caller-supplied `p_subject_id`; a bad subject aborts the request at commit with a raw FK error, not the DEF-10 shape — **evidence / hardening**

**Evidence:** `20260816120003_access_log_read.sql:86-137` (`hc.log_denied`,
EXECUTE to `authenticated`, `p_subject_id` passed straight to `hc.log`);
`20260815200006_access_log.sql:62` FK `(circle_id, subject_id) → subjects`
**DEFERRABLE INITIALLY DEFERRED** (my `fkcheck2.sql` catalog dump); my probes
`ld2.sql` / `fkcheck2.sql`.

`log_denied` gates on live membership (good) but never checks that
`p_subject_id` belongs to the circle. It relies entirely on the composite FK —
which is deferrable initially deferred. Consequences I confirmed:
- Inside a transaction, a denial with a random or **cross-circle** subject id is
  written (seqs 1–2 in `ld2.sql`); `SET CONSTRAINTS ALL IMMEDIATE` then raises
  `23503` ("Key (circle_id, subject_id)=(…) is not present in table
  subjects"). So in production the row is **not silently persisted** — the
  deferred FK fires at **commit** and rolls back the whole request. No
  cross-tenant persistence; this is not a data-leak.
- But the failure mode is (a) a **raw `23503` at commit**, not the DEF-10
  uniform `denied_log_refused` (`P0001`) that every other request-path refusal
  produces, and (b) **deferred to commit**, so a stray subject id (stale,
  cross-circle) aborts an otherwise-valid request far from the `log_denied`
  call. 030 only ever exercises valid-in-circle or null subjects, so this path
  is untested.

**Recommendation:** validate subject membership in-function (subject exists in
`p_circle_id`) and raise the uniform `denied_log_refused` shape, matching the
DEF-10 discipline the rest of the surface keeps; or record explicitly that the
route layer owns passing a valid in-circle subject and the deferred-FK-at-commit
is the accepted backstop.

### F4 — A null-subject denial that carries a domain is visible circle-wide, bypassing the per-domain `visible_at` filter — **evidence / question (ties to Q1)**

**Evidence:** `20260816120003_access_log_read.sql:43-52` (read policy: `subject_id
is null OR visible_at(...) >= 'log'`); my probe `logdenied.sql` step 2b
(`u2_sees_own_null_denial = 1, domains = health`).

The read policy makes any `subject_id IS NULL` row visible to every live member.
A denial written with a non-null `domain` but null subject —
`hc.log_denied(circle, 'health', null)`, a normal shape since `p_subject_id`
defaults to null — is therefore visible to a member with **no** health access,
which the domain-filtered branch would otherwise close. I confirmed `u2` (no
health grant) reads back its own null-subject health-domain denial. Exposure is
bounded: the row names only actor + domain, no object
(`denial_names_no_object`), and the actor is forced to self — so it reveals at
most "member X hit a denial tagged health," about themselves. This is a corner
of D1's rule rather than a leak, but it is inconsistent with the deliberate
"a member's own denials about a hidden domain are invisible to them"
fail-closed intent (D1 / 030:5).

**Recommendation:** decide whether a null-subject **denial** with a non-null
domain should be domain-filtered like a subject denial (treat null subject +
non-null domain via the all-domain fail-closed path) rather than shown to every
member — or confirm circle-wide visibility is intended for actor-only,
object-less denial rows. Folded into the Q1 answer below.

---

## Interrogation of the eight hard items (as requested)

1. **M6 rewrite equivalence & honesty.** Equivalence **confirmed** beyond the
   oracles: 11,349-case differential, 0 mismatches. The old→new operator swap is
   sound — `all_domains() <@ dom(manage)` ↔ `manage @> to_jsonb(all_domains())`
   and `taint <@ dom(rung)` ↔ `rung @> to_jsonb(taint)` are the same set
   containment (ADR-0002 c9 family); the inlined clause 3 sees the same
   normalized-taint decision the old CTE expressed; clause order 1–6 and the
   FRZ-13 last-position cap are byte-identical decisions. The "top-level call
   remains a call" claim is **honest and self-limiting** — the `p_ctx` argument
   is the hoisted `(select hc.ctx())` sublink the inliner won't duplicate; the
   win is the body, and it is recorded as such, not claimed away. No §3.3
   clause-order property weakened.
2. **§2.8 collapse carve-out.** No evidentiary mutation threads through. The
   trigger admits an UPDATE only when `to_jsonb(new) - collapsed_* =
   to_jsonb(old) - collapsed_*` (every hashed column byte-identical), `+1`
   exactly, window monotone — and the second belt (`grant update
   (collapsed_count, collapsed_until)`) means even the writer role cannot reach
   an evidentiary column. `collapsed_*` are excluded from `entry_hash` by 1A
   design, so collapse touches no hashed input: **no chain/hash oracle.** 030:17–19
   pin the bulk-rewrite / content-change / DELETE refusals; verified.
3. **§3.9 boundary.** Attacked per F1 — the CI-2/CI-3 walk catches column-refs,
   nested views and function indirection but not the subid-0 whole-row case
   (recorded residual, shipped-clean). The `admin_ops`-EMPTY ruling is sound: an
   empty schema is the fail-closed boundary, CI-4 pins it, and landing wrappers
   without §5.7 step-up would repeat APR-06. The PUBLIC-usage amendment is the
   platform's fact: `public`'s USAGE is PUBLIC-packaged and unrevokable per-role;
   the binding boundary is table/function ACL absence (A.1), and 031:3 pins **no
   direct hc_admin entry** in public's ACL. Accept.
4. **TNT-08.** `reclassify_taint` authorizes through `visible_at ≥ manage` on
   the **re-read** current taint under the per-circle lock (M5:65-80); freeze,
   FRZ-13 cap, care ceiling and containment all bind (032:2–6), the unresolved
   object needs manage-on-five (VIS-02), and DEF-10 holds through the request
   path. Cases 24–25 cover the two R-rule races the new writer introduces
   (freeze-mid-wait, revocation-mid-wait) — **sufficient** for RAC-06's new
   writer; both defeat the reclassify with `reclassify_refused` under the lock.
5. **Search split.** A.4/A.5 oracles hold: body-only-term count identity
   (029:8 — `metoprolol` count == `xylophonezzz` count == 0 for a summary
   caller), snippet provenance (029:5–6, title-match snippets the title),
   share pass-through (029:16–17), freeze closure (029:18). The dsc builder
   derives `extracted_text` purely from the source proposal's extractions in one
   place (M1:95-128); the `search_text_full`/`tsv_full` recompute-equality is
   pinned behaviorally (028:15–16), and the built §7.2 policy matches TSD §7.2
   verbatim (the LEFT JOIN as the RLS-decided level branch). The sync trigger's
   lock-order claim is **true by construction**: it fires AFTER on documents, so
   every dsc write follows a documents write in a writer already holding the
   per-circle lock — no new advisory edge (028:1–2, D8).
6. **OPS-01 as ruled vs required (F10/Q10).** F10/Q10 required *bounded* ops
   staging: scheduler identity, recording, alerting, retry, runtime bounds,
   tolerated window, failure posture. D6 delivers each — `run_taint_sweep`
   hc_pipeline-only (032:8), every run recorded in `hc.sweep_runs` with
   `clock_timestamp` ordering, `sweep_health` as the alert surface (032:13),
   idempotent-next-tick retry, over-taint posture (032:12), 24 h window. The
   worker-side paging rules are correctly one-line config staged to RLY-01. The
   gate is a DB-substrate + ruling, and that is what F10/Q10 asked to be bounded.
   Sufficient.
7. **OPS-01 vs the required** — see 6; the only thing NOT landed (worker pager
   wiring) is exactly the RLY-01-staged part, and `sweeper_pass` is
   deliberately byte-identical (its RAC-06 body untouched). Correct call.
8. **Staging calls.** None of SIG-01 / DEL-01 / ADM-01 / the SHR-02 retag is a
   1D obligation: each needs a surface that does not exist through 1D (KMS
   signer worker, deletion flow, auth-slice step-up + dual control, task
   assignment). Every interface that *could* land dark HAS: `log_chain_heads`
   and `record_tombstone` owner-only, `admin_ops` empty, `tombstones` /
   `log_head_signatures` RLS-forced with zero request reach and their
   append-only carve-outs tested (032:14–26). Staging is bounded, not open.

---

## Answers to the ten pointed questions

1. **D1 (access-log row rule).** **Accept, with a refinement (F4).** Yes —
   circle-level entries (membership/freeze trail) must be member-visible; the
   freeze's own trail has to be contestable during the freeze, and content-bearing
   subject rows all carry domains and stay `visible_at`-filtered. Refinement: a
   *denial* logged with a non-null domain but **null subject** currently rides
   the `subject_id is null` branch and is shown circle-wide, bypassing the
   domain filter (F4). Recommend domain-filtering that corner or confirming it is
   intended for actor-only, object-less rows.
2. **D2 ("unconditionally" carve-out).** **Accept.** The +1/two-column/denial-only
   increment with the column-scoped grant is a genuine double belt; no
   evidentiary mutation threads through, and collapse opens no hash/chain oracle
   (collapsed_* excluded from `entry_hash`). Collapse-by-new-row would hand the
   flood back to the log, which is what AC-PPL-7 exists to prevent.
3. **D4 (admin_ops EMPTY).** **Accept.** Every §9.3 wrapper needs §5.7's
   operation-bound step-up + dual control; an empty schema is the complete
   fail-closed boundary, CI-4 pins it, and accept-and-ignore MFA would repeat
   APR-06. Land the operations with the auth slice (ADM-01).
4. **D4 (schema-public USAGE).** **Accept.** The PUBLIC-packaged usage cannot be
   per-role revoked, and revoking PUBLIC's would break the request paths; the
   binding boundary is ACL absence (A.1), pinned by CI-1/CI-4 plus the
   no-direct-entry check (031:3). It is the platform's fact.
5. **D5 (reclassify unresolved rule).** **Accept.** Authorizing through
   `visible_at` makes an unresolved object need manage-on-five — the VIS-02
   arithmetic every other surface already uses; a laxer rule here would make the
   recompute the weakest door. 012's manage×5 restore case is unchanged;
   confirmed by the differential and cases 24–25.
6. **D6 (OPS-01 shape).** **Accept.** Every clause is either mechanical now
   (`run_taint_sweep`/`sweep_runs`/`sweep_health`, over-taint posture, 24 h
   window) or a one-line worker config recorded for RLY-01; `sweeper_pass`
   correctly stays untouched. Sufficient for the gate.
7. **D7 (rewrite honesty).** **Accept as built.** The top-level call genuinely
   cannot inline (ctx-sublink argument) and it is recorded honestly; equivalence
   is proven (11,349-case differential + oracles). One precision (F2): "margins
   ≥ 3×" is true for the scan queries that drove the rewrite, **not** for the
   page tripwire, which runs near 250 ms and breaches cold — but that tripwire is
   ~6× under the §13.2 page budget, so pursuing full inlining (splitting ctx
   per-policy, multiplying InitPlans) is not warranted.
8. **D8 (episodes/profile_facts vectors).** **Confirm.** §7.1 names three search
   relations and §2.11 four indexes; an episode is a wrapper and its members are
   individually findable. Episodes stay unsearchable in Phase 1; a future
   decision re-opens the row explicitly.
9. **D9 (retags/staging).** **Accept (none is a 1D obligation).** SHR-02 needs
   the task-assignment surface; RLS-11b needs the notification/export surfaces;
   SIG-01/DEL-01/ADM-01 need worker/deletion/auth-step-up surfaces. Each
   interface that could land dark has, and is invariant-tested. Retagging (not
   silent slipping) is the right disposition.
10. **Plan bound.** **Confirm.** 6 of ≤ 8 migrations; the PRF-06 rewrite consumed
    exactly the one slot the breach clause anticipated; M7/M8 headroom unspent.
    Discipline held.

---

## Classified: one backend crash during review (not a product defect)

While probing `log_denied`, I called a `pg_temp` wrapper as role `authenticated`
that lacked EXECUTE on it — the known PLT-04 function-ACL segfault. The backend
crashed, Postgres ran crash recovery, and the database returned **healthy at 37
migrations** with my uncommitted probe rolled back. This is the pinned-image
defect the slice already gates around (catalog probes, never live denied calls);
it was self-inflicted by my probe, is not reachable from the committed tree, and
left no residue. Recorded for completeness.

---

## Disposition note

No blocking or minimum-pre-approval items. F1–F4 are evidence/hardening
dispositions for the next session (ADR-0010), consistent with the round-7
pattern: the fixes and any TSD/ADR/coverage edits are that session's work, not
this review's. Main stays green; the working tree was left clean and all
experimental SQL was rolled back or self-cleaned.
