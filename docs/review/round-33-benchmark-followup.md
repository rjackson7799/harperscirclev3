# Round 33 benchmark tooling follow-up

Verbatim findings against `8db89d5`:

1. `scripts/bench/home-reads-p95.ts` measures four current Home request-role reads plus a historical control, but omits `myMembership`, added to Home in this follow-up. Its worst-read result therefore excludes part of the current composition.
2. `scripts/bench/home-p95.mjs` validates the requested Home state only once, before warm-up. Warm-up responses are unchecked, and timed responses check status only. Home deliberately returns HTTP 200 for its retry state, so a later failure can be recorded as successful latency.

Implementation scope under the owner's delegated evidence work: retain the current Tier-2 follow-up; change benchmark tooling and isolated mocked regression tests only. No application, auth, policy, schema, dependency or hosting changes. First reproduce both gaps, then include the current membership read and require the expected Home state on every warm-up and timed response. A failed sample invalidates the run rather than being discarded or timed as success. Keep existing sample counts and percentile method. Benchmark output must not claim to close an owner decision automatically.

Representative hosted performance remains a separate execution gate: the existing large-fixture builder uses `session_replication_role=replica`, unavailable on hosted Supabase. Do not weaken triggers or substitute the small smoke fixture for the representative fixture. Tooling regression tests prove measurement behavior, not latency.
