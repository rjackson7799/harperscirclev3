# ADR-0005 — Slice 1B: cross-slice dependency resolution and design deltas

**Status:** Accepted (owner-directed process; findings dispositioned at the
round-6 gate)
**Date:** 2026-08-15
**Scope:** Decisions that must precede 1B migration 1 on
`slice/1b-record-provenance`, per the session kickoff and the master plan's
migration boundary rule. Authority order applied: master plan → TSD §2.5–§2.6,
§3.5–§3.7 (+§3.8 staged obligations; §2.4 where §3.7 needs it) → ADR-0001–0004 →
Appendix A + `docs/coverage.md`.

## D1 — Cross-slice dependency: four §2.4 tables pulled into 1B, fail-closed

**Problem.** §2.5's record tables carry FKs into §2.4 (a 1C section):
`documents.artifact_arrival_id` is `NOT NULL references arrivals(id)`; all five
record tables carry nullable `source_arrival_id` / `source_proposal_id`; and
§3.7's write path *is* §2.4 machinery — `hc.approve_proposal()` approves a row
of `proposals`, claims in `proposal_commits`, and records idempotency in
`approval_attempts`.

**Options weighed (kickoff-enumerated).**
1. *Minimal prerequisite tables pulled into 1B* — chosen.
2. *Documented temporary boundary with no invalid FK* — rejected: omitting the
   FK columns changes §2.5's table shape (a `NOT NULL` column cannot be
   deferred without deviating from the TSD DDL), and `hc.approve_proposal()`
   cannot exist at all without `proposals`. The boundary cannot be drawn
   between 1B and its own write path.
3. *Slice split* — rejected: the plan fits 9 migrations (< the 10-migration
   split threshold) and every unit keeps an independently green checkpoint.

**Decision.** Pull `arrivals`, `proposals`, `approval_attempts`,
`proposal_commits` into 1B with **full §2.4 DDL** (no placeholder shapes), the
same move 1A made for `access_log`. NOT pulled: `arrival_events`,
`known_senders`, `extractions` — no 1B table FKs them and no 1B function
touches them.

**Containment.** The four tables land RLS-enabled **and forced** in their
creating migration, with zero request-path privileges and zero request-path
policies — intentionally inaccessible until 1C lands their §3.4 read policies
(recorded as new pending coverage rows). Their only 1B writers are pgTAP
fixtures (postgres, the documented maintenance exemption) and
`hc.approve_proposal()` (`proposals.status`/decision columns,
`approval_attempts`, `proposal_commits`). No invalid FK exists at any migration
boundary. The 1C state machine (`hc.claim_stage()`, `hc.advance_arrival()`,
`hc.finalize_extraction()`, `arrival_events`, leases) remains entirely 1C.

## D2 — `freezes.objected_to_member_id`: FRZ-13 needs an identity no table stores

§3.8's `unresolved` carve-out restores read-only access to "coordinators other
than the objected-to member" — but neither the TSD §2.3 DDL nor the built
schema records *who* is objected to. The behaviour is unimplementable without
it; this is a TSD DDL gap, closed here and flagged as a pointed round-6
question.

**Decision.** Add nullable `objected_to_member_id uuid` to `freezes`, with a
circle-consistent composite FK to `circle_members (circle_id, id)` and
`check (objected_to_member_id is null or state = 'unresolved')`. It is settable
only through `hc.adjudicate_freeze()`, which gains an optional
`p_objected_to_member_id` parameter (old signature dropped in the same
migration; the 002 exact-overload inventory moves with it).

**Fail-closed default.** `unresolved` with the column NULL means *no carve-out*
— everyone stays closed, exactly the 1A staging behaviour. This also covers
PRD §7.5's "if the objected-to member is the only coordinator, the record stays
closed" arithmetically: the carve-out excludes that member, and no other
coordinator exists.

## D3 — `hc.own_domain()`: the mapping the TSD names but never pins

§2.6 requires "taint always contains the object's own domain, by construction
in `own_domain()`" without pinning the map. One `IMMUTABLE` function holds it:

| Object | Own domain |
|---|---|
| document — medical, medications, labs | health |
| document — insurance, financial | finances |
| document — legal, other | documents |
| task | schedule |
| timeline_event — medical, care | health |
| timeline_event — admin | schedule |
| timeline_event — memory | memories |
| episode | memories |
| profile_fact | payload-declared, validated against `hc.domain`; **refused if absent** (fail-closed) |

Interpretive rows — episode, timeline `admin`, profile_fact payload-declared —
are pointed round-6 questions. A.3's twenty-pair generator consumes this map as
data, so a future remapping moves the tests with it.

## D4 — `hc.guard_row()` is one generic trigger via `to_jsonb(old/new)`

§3.7 attaches the guard to the five record tables **and `proposals`**, which
has taint but not the provenance quartet; a column-literal plpgsql body would
raise "record has no field" at runtime there. The body therefore reads
`to_jsonb(old)`/`to_jsonb(new)` and guards exactly the columns present:
provenance quartet immutability where present; taint-never-shrinks; false→true
`taint_resolved` only under the marker; the marker row-scoped to `new.id` —
§3.7 semantics verbatim, column presence data-driven.

## D5 — ctx / grant_vectors contract extension for FRZ-13; CTX-07 verbatim shares

`hc.grant_vectors()` gains a `cap` output column: `'view'` **only** when the
covering freeze is `unresolved` AND the caller's membership in that circle is
`coordinator` AND `member_id <> objected_to_member_id` AND the column is set —
in which case `frozen` is emitted false for that caller; every other freeze
shape leaves `frozen` true / `cap` null. `hc.ctx()` subjects entries gain a
`'cap'` key; `hc.visible_at()` (same signature, body replaced) applies
`least(result, coalesce(cap, 'manage'))` as the **final** step — after
share-widening, so the cap binds shares too. A missing key coalesces to
`manage` (1A ctx shapes behave identically); `frozen` keeps its
`coalesce(…, true)` fail-closed cast. `hc.approve_proposal()` refuses under
the carve-out independently (FRZ-14 checks the `freezes` table at write time,
open **and** unresolved), so read-only means read-only even if a stale ctx is
replayed.

The ctx `shares` placeholder (1A d2, CTX-06) is replaced with the §3.2-VERBATIM
subquery over `object_shares` in **both** `hc.ctx()` and `hc.ctx_for()`
(CTX-07).

## D6 — New definer inventory, grants, and the lock discipline

All new functions owned by `hc_internal`, `search_path = ''`, PUBLIC / anon /
`hc_pipeline` / `hc_admin` revoked (the 1A deny-by-default ACLs already cover
defaults; explicit revokes stay in the creating migration):

| Function | EXECUTE | Notes |
|---|---|---|
| `hc.own_domain(…)` | authenticated (pure) | mapping table, D3 |
| `hc.guard_row()` | trigger only | D4 |
| `hc.approve_proposal(…)` | authenticated | §3.7 signature verbatim; internal manage re-check |
| `hc.revise_object(…)` | authenticated | manage re-check; revisions row in-transaction |
| `hc.share_object(…)` | authenticated | §2.5 validation, one transaction |
| `hc.presence(uuid)` | authenticated | §3.5; ids/dates only |
| `hc.link_provenance(…)` | owner-only | called by approve_proposal; tests as postgres |
| `hc.propagate_taint_growth(…)` | owner-only | §2.6 growth, delta-only |
| `hc.reclassify_taint(…)` | owner-only in 1B | caller surface staged (pointed question) |
| `hc.sweep_provenance()` | owner-only | detector 3; scheduling is ops, staged |

**Lock discipline.** Every growth path (`link_provenance`,
`propagate_taint_growth` call sites) and the shrink path (`reclassify_taint`)
take `pg_advisory_xact_lock(hashtext('taint:' || circle_id::text))` so
growth-vs-shrink serialize per circle (§2.6). The advisory lock is acquired
BEFORE any row lock, and multi-table writers lock `documents` first (PLT-02,
ADR-0002 n3). Serializing per-circle writes is an accepted cost at PRD §13.3
scale; flagged as a pointed question.

## D7 — Approve-time taint is the fail-closed union

At approval, the object's taint is
`own_domain ∪ proposal.taint ∪ ⋃ parents.taint` (parents from
`payload.parents`, validated by `link_provenance`), and the write-time `manage`
re-check runs against **that same union** — never the possibly-stale drafted
taint alone. A parent whose taint grew between drafting and approval therefore
widens the approval requirement rather than slipping under it. Pointed
question: whether re-render-on-wider-taint should instead refuse outright
(version-bump semantics); refusing at manage-on-union is the fail-closed
interim.

## Consequences

- 1C's ingestion slice inherits four already-built tables and adds only its
  state machine, events, leases, and read policies (new pending coverage rows
  record this).
- The 002 invariant suite's inventories (functions, SECURITY DEFINER set,
  grants, policies, snapshot) grow in the same green commits as the migrations
  that change them; the writer allowlist for `documents` /
  `document_search_content` begins here (catalog-based:
  `information_schema.role_table_grants` + `pg_trigger`).
- TSD §2.3 (freezes DDL) and §3.2 (grant_vectors contract) have recorded
  deltas; the TSD text itself is not edited mid-slice — round 6 dispositions
  whether the TSD absorbs D2/D5 wording.
