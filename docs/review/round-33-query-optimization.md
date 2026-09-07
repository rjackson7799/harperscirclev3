# Round 33 — upcoming-events query correction

Scope: Tier 2 continuation under ADR-0048 and the owner's instruction to continue the scoped query investigation. Zero migrations, dependencies, role/policy changes or auth changes. Only upcoming-events selection is changed; latest-event selection is measured but not expanded into this unit.

RED evidence: committed database report at `8d4681b`, source `dfed830`, has upcomingEvents server execution p95 297.249 ms against 250 ms. This is the failing performance condition, not a functional test failure manufactured to match an implementation. Original plans show permissions evaluated on 2,021 candidate events before date filtering.

Candidate: materialize PostgreSQL's current local dates once for recognized zone names. Add a conservative plain-column bound: an event must have a date at least the earliest of those local dates, or an upcoming instant. Retain the exact per-event local-date/instant predicate, original RLS and ordering. Any date eligible under the exact predicate necessarily meets the minimum-date bound. Unknown zones remain unplaced; no fixed UTC offset assumption is introduced. Materialization is statement-local, not a cache or persisted schema object.

Initial alternating experiment used three warm-ups then five measured samples per variant on the existing 2,021-event staging fixture. Both returned identical ordered IDs; original execution 227.816–235.751 ms, candidate 155.566–157.869 ms. This is candidate evidence, not a final p95 gate. Raw plans and samples remain in the handoff workspace as staging-query-plans.json and staging-query-candidate.json.

Acceptance: existing temporal regressions plus broad zone/date equivalence; a larger actual-wrapper server comparison with unchanged ordered results; affected Home/process tests, lint and typecheck. Preserve browser and mixed-workload gates. Do not carry the earlier deployment's HTTP measurements as evidence of the new query deployed.
