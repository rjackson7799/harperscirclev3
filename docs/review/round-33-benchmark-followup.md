# Round 33 benchmark tooling follow-up

Verbatim findings against `8db89d5`:

1. `scripts/bench/home-reads-p95.ts` measures four current Home request-role reads plus a historical control, but omits `myMembership`, added to Home in this follow-up. Its worst-read result therefore excludes part of the current composition.
2. `scripts/bench/home-p95.mjs` validates the requested Home state only once, before warm-up. Warm-up responses are unchecked, and timed responses check status only. Home deliberately returns HTTP 200 for its retry state, so a later failure can be recorded as successful latency.

Implementation scope under the owner's delegated evidence work: retain the current Tier-2 follow-up; change benchmark tooling and isolated mocked regression tests only. No application, auth, policy, schema, dependency or hosting changes. First reproduce both gaps, then include the current membership read and require the expected Home state on every warm-up and timed response. A failed sample invalidates the run rather than being discarded or timed as success. Keep existing sample counts and percentile method. Benchmark output must not claim to close an owner decision automatically.

Representative hosted performance remains a separate execution gate: the existing large-fixture builder uses `session_replication_role=replica`, unavailable on hosted Supabase. Do not weaken triggers or substitute the small smoke fixture for the representative fixture. Tooling regression tests prove measurement behavior, not latency.

## Applied correction and evidence

RED `76834ed`: seven mocked cases, two positive controls passed and five failed. Four invalid HTTP 200 responses incorrectly resolved; the membership mock was called zero times rather than the expected five warm-ups plus 25 samples. The cases cover a retry during warm-up, a retry during timing, a sign-in landing, and the wrong Home branch.

GREEN: all seven cases pass after the correction. Both valid Home modes retain the original five warm-ups and requested timed sample count. A synthetic 400 ms membership read now contributes to the reported DB breach. HTTP validation happens after response-body timing, so validation work is not added to the measured duration. Changed-file ESLint and whole-tree TypeScript passed; no application suite or hosted benchmark was rerun for these test-tooling changes.

Evidence in the handoff workspace: `round33-benchmark-red.json`, `round33-benchmark-green.json`, and the task's lint/typecheck result. Both tooling findings are corrected at their tested layer. HOME-05 and OW-34 remain pending actual representative measurement; these mocked durations are deliberately synthetic. The benchmark output no longer purports to close M4 or authorize a migration by itself.
