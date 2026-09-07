# Round 33 — upcoming-events query correction

Scope: Tier 2 continuation under ADR-0048 and the owner's instruction to continue the scoped query investigation. Zero migrations, dependencies, role/policy changes or auth changes. Only upcoming-events selection is changed; latest-event selection is measured but not expanded into this unit.

RED evidence: committed database report at `8d4681b`, source `dfed830`, has upcomingEvents server execution p95 297.249 ms against 250 ms. This is the failing performance condition, not a functional test failure manufactured to match an implementation. Original plans show permissions evaluated on 2,021 candidate events before date filtering.

Candidate: materialize PostgreSQL's current local dates once for recognized zone names. Add a conservative plain-column bound: an event must have a date at least the earliest of those local dates, or an upcoming instant. Retain the exact per-event local-date/instant predicate, original RLS and ordering. Any date eligible under the exact predicate necessarily meets the minimum-date bound. Unknown zones remain unplaced; no fixed UTC offset assumption is introduced. Materialization is statement-local, not a cache or persisted schema object.

Initial alternating experiment used three warm-ups then five measured samples per variant on the existing 2,021-event staging fixture. Both returned identical ordered IDs; original execution 227.816–235.751 ms, candidate 155.566–157.869 ms. This is candidate evidence, not a final p95 gate. Raw plans and samples remain in the handoff workspace as staging-query-plans.json and staging-query-candidate.json.

Acceptance: existing temporal regressions plus broad zone/date equivalence; a larger actual-wrapper server comparison with unchanged ordered results; affected Home/process tests, lint and typecheck. Preserve browser and mixed-workload gates. Do not carry the earlier deployment's HTTP measurements as evidence of the new query deployed.

## Implementation and measured result

Controls and performance-failure binding were committed first at `23dc71d`. Query correction: **`fdd3eee128aeb13c681ba30e7177e9a912b0010f`**. The 14 actual-PostgreSQL temporal tests passed before and after the correction. Three of these test five date offsets for every recognized zone at UTC-day and DST boundaries, comparing actual selection with expected date eligibility. Existing invalid-zone, fallback-zone, floating and instant cases also passed. The affected Home/process suites passed 61 tests; changed-file ESLint and whole-tree TypeScript passed. Tests ran against the working tree committed unchanged as fdd3eee; the paired benchmark ran at that clean commit.

On the same staging fixture and authenticated caller, five warm-up pairs followed by 25 timed pairs alternated execution order. Both variants used the actual wrapper transaction; the baseline replaced only the changed selection fragment with its source at `8d4681b`. PostgreSQL EXPLAIN ANALYZE execution times are reported, not network-inclusive wrapper or HTTP times. Each pair additionally executed both full SELECTs and compared complete ordered rows; **all 30 pairs were identical**.

| Variant | Measured samples | Server p50 | Server p95 | Maximum |
|---|---:|---:|---:|---:|
| Original | 25 | 234.322 ms | 293.872 ms | 305.473 ms |
| Corrected | 25 | 157.114 ms | **175.567 ms** | 176.250 ms |

The paired p95 improvement is approximately 40%. The corrected query meets 250 ms for this warm founder/manual-entry diagnostic. Plan evidence shows date filtering at the event scan and fewer rows passed onward, retaining the same visible_at permission predicate. Time-zone enumeration still occurs once per statement. No index, policy, privilege, database function or stored data changed.

Raw evidence: `staging-query-final.ts/mjs/json` in the handoff workspace; the JSON retains all samples and final plans. Connection safeguards and transport limitations match the [database report](../ops/staging-home-database-performance.md). This does not prove restricted-tier performance, cold/concurrent load, the original mixed workload, new deployed HTTP latency or browser behavior. HOME-05 and OW-34 retain those remaining requirements; no complete finding closure is inferred.

Production build at fdd3eee completed successfully, including TypeScript and all 36 static pages. It retains the existing dynamic-filesystem tracing warning in unchanged lib/pipeline/ocr.ts. No deployment occurred. The final documentation checkpoint changes docs only from this source head.
