# ADR-0009 — Slice 1D: derived & operational surfaces — design deltas and rulings

**Status:** Proposed (accepted on merge of `slice/1d-derived-surfaces`)
**Deciders:** owner (sole merge authority, per ADR-0006)
**Date:** 2026-08-17
**Amends:** TSD §2.6, §2.8, §2.9, §3.3/§3.12, §3.9, §7.1 — normatively via
Amendments annex A7. Everything here follows the standing rule: no silent
divergence; a delta is reverted or recorded.

---

## D1 · §2.8 — the access-log read policy, concretized

§2.8 says "entries about a subject render at the reader's level on that
subject's domains" without fixing the row-level rule. As built (M3,
`access_log_select`):

- A **circle-level entry** (`subject_id is null` — membership changes,
  freeze trail) is visible to **every live member** of the circle. Freeze
  events stay readable *during* the freeze (PRD §7.5 notifies every
  member; a freeze whose own trail is invisible cannot be contested).
- An **entry about a subject** is visible iff
  `hc.visible_at(ctx, subject, {entry.domain}, true, …) ≥ log` — so
  freeze closure, the FRZ-13 cap, the care ceiling, and taint containment
  all arrive through the one function. The log is not a back door
  (030:4); a member's own denials about a hidden domain are invisible *to
  them* — fail-closed over self-visibility, deliberately.
- A subject entry with **no domain** fails closed to **all-domains**
  (the 1C arrivals precedent): custodianship declarations render only for
  readers with ≥ log on every domain.
- **Field-level rendering** (which columns to show at `log` vs `manage`)
  is an application concern; the DB rules on rows. A.4's
  "descriptions re-evaluated at read time" duty binds the app layer and
  is restated in the annex.

*Amended by ADR-0010 (round-8 F4): a domained entry with no subject fails
closed to ALL SUBJECTS — the mirror of the all-domains rule; the
`subject_id is null` branch is member-visible only when the entry is also
domain-less.*

## D2 · §2.8 — denial collapse and the "unconditionally" delta

1A's M6 staged denial collapse to 1D. As built (M3):

- `hc.log_denied(circle, domain, subject?)` is the one denial writer.
  The actor is `hc.uid()` — **no account parameter exists to
  substitute** (the A.5 pattern). Live membership in the circle is
  required; a stranger and a nonexistent circle get ONE refusal shape
  (`denied_log_refused`, DEF-10). Repeats within a 1-hour window
  collapse onto the head denial row for the same (actor, domain,
  subject): `collapsed_count += 1`, `collapsed_until := now()`
  (AC-PPL-7 — a script cannot flood a family's log).
- **The §2.8 sentence "a before update or delete trigger raises
  unconditionally" is amended**: the trigger raises *unless* the change
  is exactly the denial-collapse increment — denial rows only, only the
  two presentation columns (excluded from the INV-11 hash by 1A design),
  `+1` exactly, window monotone; DELETE stays unconditional. Belt and
  braces: `hc_internal`'s UPDATE privilege is **column-scoped** to
  exactly those two columns, so privilege and trigger fail in different
  places (030:17–19).
- Callers: `authenticated` (the route layer logs the denials it
  observes). Flood exposure is bounded by the collapse window per
  (actor, domain, subject) tuple.

*Amended by ADR-0010 (round-8 F3): the named subject is validated as the
circle's own at call time in the same `denied_log_refused` shape; the
deferred declaration FK stays as the commit-time belt.*

## D3 · §2.8/§2.9 — signing and deletion-ledger interfaces; the local stand-in

- `hc.log_chain_heads()` lists each circle's `(head_seq, entry_hash)`
  for the daily signer. The signer is a worker holding KMS access —
  **staged as SIG-01** with `ledger.log_head_signatures` as its store
  (append-only, zero request-path reach). Owner-only until then: absent
  machinery is non-callable (the boundary rule).
- Schema `ledger` is the **local stand-in** for the ledger *instance*
  (§1.5: separate Postgres, own PITR lineage). The stand-in carries no
  FKs into `public` — on the real instance those tables do not exist,
  and the interface must not promise a join production cannot keep.
  Migration path: the schema's DDL is the contract; provisioning the
  instance is deployment work (2+), and G6/G11 restores rehearse against
  it.
- `hc.record_tombstone(…)` is the synchronous writer §2.9 requires —
  owner-only until the deletion surface (**DEL-01**, staged) lands.
  Tombstones are append-only except the purge job's `executed_at` mark
  (strict trigger carve-out, 032:19–20). Never content, never a title,
  never a filename — structural: no content parameter exists.

## D4 · §3.9 — the admin boundary as bindable on this platform

- **Schema `public` carries USAGE for the PUBLIC pseudo-role by image
  packaging.** A per-role revoke cannot remove it, and revoking PUBLIC's
  would break the request-path roles and PostgREST. §3.9's
  `revoke usage on schema public from hc_admin` therefore cannot bind;
  **the boundary that binds is table/function ACL absence** (CI-1/CI-4,
  031), which is precisely what produces A.1's distinguished
  `permission denied for table` — the failure mode 005 pinned in 1A and
  031 extends to dsc, access_log, arrivals, and the ledger. `hc` and
  `storage` carry no PUBLIC usage; resolution itself dies there. 031:3
  additionally pins that `public`'s ACL carries **no direct hc_admin
  entry**.
- **`admin_ops` lands EMPTY.** Every §9.3 operation requires the
  §5.7-shaped, operation-bound MFA step-up plus dual-control machinery
  of the auth slice; a wrapper accepting a token the database cannot
  validate would repeat the mistake APR-06 exists to prevent. Staged as
  **ADM-01** (wrappers + `admin_action_approvals` + `export_requests`
  and the A.5 wrapper-identity assertions land together). CI-4 pins the
  empty inventory; the pin moves when ADM-01 lands.
- **Views**: `platform_stats`, `circle_shapes`, `pipeline_health`,
  `stage_outcomes` (M4) + `sweep_health` (M5), owned by `hc_internal`
  (the intentional privilege bridge, §3.9), `hc_admin` SELECT granted
  per view and by default ACL from both creating roles. §9.2 stats not
  derivable without content-table columns or absent machinery —
  extraction success beyond reason codes, proposal rejection rates,
  invite acceptance, arrival→filed timings — land with their machinery
  (new log events or the admin app slice), **not** by widening a view's
  reach.
- **The CI-2 forbidden set is extended** beyond §3.9's list: any
  reference at all (column, whole-row, or relation) to the seven content
  tables **plus dsc**; and the named columns
  `arrivals.auth_detail`, `arrivals.message_id` (provider-verbatim, the
  A5 exclusion), `circles.opening_context` (founder free text),
  `invites.token_hash/invited_email/note`,
  `access_log.detail/actor_display_name`. The walk is probe-proven in
  both directions (a nested `length(title)` view and an `hc.presence()`
  view are caught — 031:13/15). Residual: a relation-level (`subid 0`)
  dependency on a *mixed* table cannot be distinguished from a
  whole-row var by `pg_depend` alone; mitigated by the exact
  view-column-list pins, the column-NAME scan (031:23), and review of
  view definitions — recorded as a known limit of the mechanical check.
  *ADR-0010 (round-8 F1): the residual is probe-CONFIRMED reachable
  (031:24) and the review is made mechanical by CI-2b — every view
  definition pinned by content hash (031:25); "probe-proven in both
  directions" is superseded by ADR-0010's precise claim.*

## D5 · §2.6 — the reclassify request path (TNT-08) and its hardening

`hc.reclassify_taint` becomes the re-categorisation surface's DB entry
point (EXECUTE to `authenticated`). As an owner-only function its
authorization was raw grant-vector containment — **freeze-blind and
ceiling-blind**, harmless behind trusted callers, a hole on a request
path. As built (M5) it authorizes through **`hc.visible_at` ≥ manage**,
evaluated under the per-circle lock against the re-read row (R-rule):

- an open or covering freeze refuses (`§3.8` — no security-state write
  under a freeze), the FRZ-13 cap refuses (read-only means read-only),
  the care ceiling refuses even at manage-level grants (VIS-05), and a
  share cannot help (view < manage);
- an **unresolved** object now requires manage-on-five to touch — the
  same fail-closed arithmetic as every other surface (VIS-02); 012's
  restore case (manage×5 caller) is unchanged;
- nonexistent and unauthorized keep ONE shape (`reclassify_refused`);
- **RAC-06 grows cases 24–25**: a freeze, and a grant revocation,
  committing while the request-path reclassify waits each defeat it.

Sweep scheduling's caller is D6's `hc.run_taint_sweep`; the unlink /
edge-maintenance surfaces stay owner-only (no product surface asks for
them).

## D6 · OPS-01 — the staged-machinery operations ruling (gate: LANDED)

- **Scheduler identity:** the RLY-01 worker runtime, connecting as
  `hc_pipeline` over its own credential, invoked by Vercel Cron (§1.4):
  `hc.sweeper_pass()` per minute (granted in 1C), `hc.run_taint_sweep()`
  nightly (M5; `hc_pipeline`-only — 032:8). Nothing request-facing can
  run either.
- **Recording:** every taint sweep writes an `hc.sweep_runs` row
  (started, finished, findings, counts-only detail). `sweeper_pass` is
  deliberately untouched — its RAC-06-proven body stays byte-identical;
  its observability is `pipeline_health`/`stage_outcomes`.
- **Alerting:** `admin_meta.sweep_health` is the operator surface. Alert
  rules (bound on the worker when RLY-01 lands): page on
  `last_findings > 0` or `findings_24h > 0` (a sweep finding is a defect
  signal, §2.6); page on `last_run_at` older than 24 h (window breach —
  a failed run's row rolls back with it, so a missing row IS the
  signal).
- **Retry policy:** both passes are idempotent; the next scheduled tick
  is the retry. No retry state to corrupt.
- **Bounds:** worker sets `statement_timeout = 60 s`; batch is bounded
  by Phase-1 scale (PRD §13.3 cap; the M6 rewrite gives ~0.1 s per
  thousand edges of headroom).
- **Max tolerated taint-inconsistency window: 24 h** (nightly cadence +
  the staleness alert). **Failure posture stays over-taint** — every
  detector marks `taint_resolved = false`, fail-closed availability
  cost, never exposure (032:12).

## D7 · PRF-04 and PRF-06 — the performance gates (both LANDED)

- **PRF-04** (real-schema regression): 029:22–23 pins the §7.2 query
  over a 300-row scan at **exactly six** measured `ctx()` executions —
  one per textual policy reference (documents 2, dsc prefilter 1, dsc
  visible_at 1, the EXISTS's inner documents policy 2), never per row —
  and 029:10 pins the LEFT-JOIN null-extension behaviourally (the
  summary caller's row arrives with `sc` NULL, not filtered). 000 keeps
  the synthetic spike pin.
- **PRF-06** (the round-6 quantitative bound): the benchmark
  (`scripts/bench/prf06.mjs`; 5,000 arrivals, 2,500 documents with dsc +
  OCR, 1,500 tasks, 1,000 events, 3,000 edges, 50 shares, two callers,
  warm 25-run percentiles + a cold restart leg) **breached both
  bounds** pre-rewrite — page p95 535–1,680 ms (bound 250);
  search_broad p95 3,490 ms (bound 2,500). The breach clause bound, and
  M6 landed:
  1. `hc.ladder` rewritten to per-rung jsonb containment
     (`vector @> to_jsonb(taint)` — order-insensitive superset, exactly
     `dom()`'s `<@` semantics, the ADR-0002 c9-verified operator
     family); `hc.visible_at` flattened to ONE expression (no CTE), so
     `ladder` and `all_domains` **inline into it**. The top-level call
     remains a call: its `p_ctx` argument is the hoisted
     `(select hc.ctx())` sublink, which the inliner will not duplicate —
     recorded honestly; the win is the body, not the dispatch.
  2. Page indexes `documents_page` / `tasks_page` /
     `timeline_events_page` (`circle_id, <time> desc`, partial on
     `deleted_at is null`) — ORDER BY … LIMIT stops at 20 visible rows
     instead of filtering and sorting the whole circle.
  **Post-rewrite, the GATE (warm 25-run p95) is ALL BOUNDS MET**: warm
  page p95 6–216 ms; warm search/count p95 129–1,915 ms. Full tables in
  the round-8 packet. *ADR-0010 (round-8 F2): the cold leg is a
  report-only diagnostic (its recorded worst 1,630 ms is that host's
  fact); cold warm-up can transiently exceed the 250 ms page tripwire on
  a cold or contended host while staying far inside §13.2's 1.5 s page
  budget, and the "≥ 3×" margins are the scan queries', not the page
  tripwire's.*
  **Equivalence:** clause order and the FRZ-13 cap are decision-for-
  decision identical; the binding oracles are 003's truth table (36
  cases), 016, and 033's in-file grid — all green over the rewrite. The
  rule is still written once: `visible_at` calls `hc.ladder`; `hc.dom`
  remains for its other call sites.

## D8 · §7.1/§2.11 — search-write clarifications

- `episodes.tsv` and `profile_facts.tsv` (shared-block columns) stay
  **unmaintained**: §7.1 names documents, tasks and timeline_events as
  the search relations and §2.11 defines exactly four indexes. A future
  episodes-search decision re-opens this row explicitly.
- `dsc.extracted_text` is **derived-only** — a pure function of the
  document's source proposal's extraction values, recomputed by the one
  builder on every write (the "same string, one place" property made
  mechanical). `ocr_text` is caller-supplied (the extract stage's
  writer, with RLY-01) and preserved across rebuilds.
- The documents→dsc sync trigger introduces **no new advisory-lock
  edge**: every dsc write occurs inside a writer already holding the
  per-circle taint lock (approve, revise) or the maintenance path, and
  always after the documents row write — the ADR-0002 c3
  documents-first order holds by construction (028:1–2 pin the trigger
  topology).

## D9 · Coverage retags

- **SHR-02** (assign/unassign share revocation) retagged **1C/1D → 2+**
  (the tasks surface): no task-assignment surface exists through 1D;
  `hc.assign_task`'s two §3.6 paths are meaningless without it. Not a
  named 1D gate; retagged rather than slipped silently.
- **RLS-11** splits per assertion: the **search channel is green**
  (029:19–21 — twenty generated pairs across three relations); the
  send-time notification check and export channels stay **pending
  (2+)** with their surfaces.
- New pending rows: **SIG-01** (head signing worker + KMS), **DEL-01**
  (deletion surface over the tombstone interface), **ADM-01**
  (admin_ops wrappers + step-up + dual control + the A.5
  wrapper-identity assertions).

## Consequences

- 37 migrations (31 + M1–M6); pgTAP 899 across 34 files; concurrency
  44/44 across 25 cases; `db:verify` clean.
- The definer inventory grows to 32 (`log_chain_heads`, `log_denied`,
  `record_tombstone`, `run_taint_sweep`); `authenticated` gains EXECUTE
  on exactly `log_denied` and `reclassify_taint`; `hc_pipeline` on
  exactly `run_taint_sweep`. The hc_internal policy list is
  sixty-seven. dsc's writer allowlist is FINALIZED: hc_internal
  S/I/U + the authenticated view-level read; DELETE for nobody.
- Schemas `admin_ops` and `ledger` exist; `admin_meta` holds five
  hc_internal-owned views; PostgREST exposure is unchanged (PIN-01).
