# ADR-0002 — Step 2 verification spike: results and their classification

**Status:** Accepted
**Date:** 2026-08-14
**Environment:** Postgres 17.6 (Supabase local, CLI 2.100.1 pinned), Supavisor
transaction-mode pooler (local tenant `pooler-dev`), storage-api v1.54.1.
Windows 11 host, Docker Desktop 29.4.3. Node driver: pg 8.16.3.

The build plan requires every load-bearing behavioural claim in the TSD to be
verified against a real database before slice 1A, with the spike deleted and
the evidence kept. Classification per claim: **regression test** (kept in the
permanent suite), **version-pinned** (true of this stack, re-verify on
upgrade), **ADR-recorded** (this file is the evidence), or **rejected**
(TSD corrected before the dependent slice).

## Results

| # | Claim | TSD | Result | Classification |
|---|---|---|---|---|
| 1 | LEFT JOIN onto an RLS-filtered table null-extends for an excluded caller | §7.2 | **Confirmed.** A summary-level caller cannot match a term living only in `extracted_text`; the join null-extends and `coalesce` falls to `tsv_summary`; a view-level caller resolves the join | **Regression test** — rebuild against the real schema in 1D's search slice |
| 2 | `(select hc.ctx())` hoists to an InitPlan inside that join | §3.2, §7.2 | **Confirmed, with a nuance** — see note 2 | **Regression test** (assert `InitPlan` present, `SubPlan` absent) + the note is design input for §3.4 policies |
| 3 | Cross-table search trigger lock ordering | §7.1 | **Deadlock is real** (40P01 reproduced) in opposite-order multi-statement transactions; **documents-first ordering eliminates it** — see note 3 | **TSD-impacting finding** — 1B adopts a lock-ordering rule; multi-session test kept |
| 4 | `SELECT … INTO` leaves the variable NULL on no-match | §4.2 | **Confirmed.** No exception without `STRICT`; `INTO STRICT` raises `P0002` | ADR-recorded (documented Postgres semantics) |
| 5 | `ALTER TYPE … ADD VALUE` inside a migration transaction | §2.2 | **Confirmed with constraint.** ADD VALUE works in a transaction on a committed enum; **using the new value in the same transaction fails (55P04)** — an enum-extending migration must not also use the value | ADR-recorded + migration-authoring rule for 1C |
| 6 | Deferred constraint trigger composes with the RLS insert policy | §2.4, §3.7 | **Confirmed.** Policy refuses at the row (42501); deferred trigger aborts at commit-time when the claim vanished after the row passed (23514). One test artifact worth knowing: `SET CONSTRAINTS ALL IMMEDIATE` flips the mode for the rest of the transaction | **Regression test** in 1B's approval-path suite |
| 7 | `MATCH SIMPLE` composite FK accepts a NULL first column | §2.3 | **Confirmed.** NULL `account_id` skips the check; admin accounts are refused (23503) — AC-ADMIN-3 as pure constraint | ADR-recorded (documented semantics); 1A schema relies on it |
| 8 | `greatest()` / `>=` / `min()` on `hc.access_level` | §2.2, §3.3 | **Confirmed.** Comparison, `greatest()`, and `min()` aggregate all follow declaration order; ordinal sequence asserted | **Regression test** — the ordinal assertion joins 1A's suite |
| 9 | jsonb `@>` scalar containment | §3.4 | **Confirmed**, including the exact `jsonb_agg(uuid) @> to_jsonb(uuid)` pre-filter shape | ADR-recorded |
| 10 | `pg_advisory_xact_lock` + `set_config(…, true)` under transaction pooling | §1.9 | **Confirmed through real Supavisor transaction pooling.** Lock blocks a second pooled session, releases at commit; `is_local=true` config never leaked across 10 pooled transactions | **Version-pinned** — re-verify on pooler upgrade; multi-session test kept |
| 11 | `pgmq` availability | §1.4 | **Confirmed.** Extension installs, queue create/send/read round-trips | ADR-recorded |
| 12 | Storage reachable without the service-role key | §1.3 | **Yes, via storage RLS + the caller's own JWT** — and fail-closed without a policy. A custom scoped role is **not** viable — see note 12 | ADR-recorded; design input for the artifact route (slice 2+) |

## Notes and captured evidence

**Note 2 — InitPlan hoisting is per textual reference, not per query.** The §7.2
join under RLS as `authenticated` produced this plan (captured 2026-08-14,
PG 17.6):

```
Nested Loop Left Join
  Filter: (COALESCE(sc.tsv_full, d.tsv_summary) @@ '''discharg'''::tsquery)
  InitPlan 1 -> Result
  InitPlan 2 -> Result
  InitPlan 3 -> Result
  InitPlan 4 -> Result
  ->  Seq Scan on documents d
        Filter: ((circle_id = '…'::uuid) AND ((InitPlan 1).col1 @> to_jsonb(circle_id))
                 AND ((COALESCE((((InitPlan 2).col1 -> 'levels') ->> (circle_id)::text),
                      'hidden'))::hc.access_level >= 'summary'))
  ->  Index Scan using doc_search_pkey on doc_search sc
        Index Cond: (document_id = d.id)
        Filter: (((InitPlan 3).col1 @> to_jsonb(circle_id)) AND (…>= 'view'))
```

Hoisting works exactly as §3.2 claims — no per-row `SubPlan` anywhere. But each
*textual reference* to `(select hc.ctx())` becomes its own InitPlan: two
policies × two references each = four `ctx()` evaluations per query. Still O(1)
per query rather than O(rows), so the §3.2 performance argument stands; the
§3.12 volume check in 1A should simply count `ctx()` executions per query as
reference-count, not 1. If it ever matters, the fix is fewer textual references
per policy, not a different mechanism.

**Note 3 — the deadlock and its rule.** Reproduced with the §7.1 trigger pair
(documents-edit trigger *writes* `document_search_content`; the search row's
own trigger *reads* `documents`):

- Two concurrent **single-statement** writers (one per table): safe. Blocking
  only, no cycle — the read side takes no row lock.
- Two **multi-statement transactions** taking the tables in opposite orders:
  deadlock, reliably (40P01; the documents-side transaction was the victim).
- Same concurrency with both transactions touching **`documents` first**:
  serialises cleanly.

**Rule adopted for slice 1B:** any transaction that writes both `documents` and
`document_search_content` must take its first lock on `documents`. In practice:
pipeline/approval functions update the parent document row (or select it
`for update`) before writing search content. The multi-session test that
demonstrates both the failure and the rule is kept as a permanent concurrency
test.

**Note 5 — migration rule.** A migration may `ALTER TYPE … ADD VALUE` on a
live enum inside its transaction, but any migration that also *uses* the new
value (seed rows, function bodies that are executed, defaults being evaluated)
must be split into two migrations. Relevant to `stale_lease` in slice 1C.

**Note 12 — the service-role exception can shrink, on one condition.** Against
storage-api v1.54.1 (the same binary the platform runs):

- Service key uploads and signs: baseline works (HTTP 200).
- An `authenticated` JWT with **no** storage policy is refused (HTTP 400) —
  storage is fail-closed by default.
- An `authenticated` JWT **plus a `storage.objects` select policy** mints a
  30-second signed URL (HTTP 200) and the URL streams the bytes — **signed-URL
  creation authorizes through RLS on `storage.objects` with the caller's own
  token.** No service key involved.
- A custom Postgres role carried as the JWT `role` claim is **rejected**
  (storage-api's own internal writes hit RLS as that role:
  `"new row violates row-level security policy"`). Scoped custom roles are not
  a supported path on this storage-api version.

Implication, deferred to the artifact-route slice: the route could hold zero
service-role capability for reads **if** `storage.objects` carries a select
policy that encodes the same visibility rule the route enforces (e.g. calling
`hc.visible_at()` by object path). That trades the service-role exception for
a second authorization surface that must stay in step with §3.3 — exactly the
two-code-paths shape §7.2 avoids for search. Decide when the artifact route is
built; the mechanism is now proven either way. The §1.3 30-second server-side
signed URL design works unchanged under both options.

**Note on local storage health (operational, Windows).** The storage-api
container reported unhealthy with empty logs on first boot while three local
Supabase stacks ran concurrently; on a subsequent start it came up healthy in
seconds. First-boot slowness racing the CLI's health window, not an
incompatibility. If it recurs: `supabase start --ignore-health-check`, wait,
verify with `docker ps`.

**Note 10 — SET ROLE through the pooler, observed.** On this stack a
`SET ROLE` issued outside a transaction was still in effect for a later
statement on the same pooled client — server-connection state visibly survives
checkout boundaries. That is the two-sided hazard (leak in, leak out) that
makes §1.9's own-credential connections the right call: nothing in this design
may rely on `SET ROLE` behaviour through transaction pooling in either
direction.
