# Home database performance — Round 33

Measured September 7, 2026 against staging `venzvdbvzjjsmouxjkzd`, using source head `dfed830c0eb0a278e00690eb109c9fc9a6949e11` and the populated manual-entry circle documented in [the HTTP report](staging-home-performance.md). No schema, policy, grant or application code changed.

## Method

The actual five Home request-role wrappers, plus the historical `listTasks` control, each received five warm-ups and 25 measured calls. Nearest-rank percentiles are reported. Connection transport used an ephemeral Supabase CLI login with verified TLS and `hc_runtime` startup role; the wrappers assumed `authenticated` with the synthetic founder's claims. A read-only preflight verified `rolbypassrls=false` and 501 visible tasks. This is not a benchmark using the deployed runtime login credential or Vercel connection pool. The maintenance role was used only to locate the known synthetic actor before caller-role verification.

A same-wrapper simple-query control measured p50 399 ms, p95 414 ms and maximum 468 ms. Wrapper timings include multiple Windows-to-Oregon round trips. A separate diagnostic instrumented the actual SELECT statements with `EXPLAIN (ANALYZE, FORMAT JSON)` after the wrapper established its role and claims. It then executed the normal statement. Its PostgreSQL execution timings exclude network and planning time; they include EXPLAIN instrumentation overhead. These diagnostics are not interchangeable with wrapper latency, and subtracting percentiles is not a valid adjustment.

| Read | Wrapper p50 / p95 / max, ms | Server execution p50 / p95 / max, ms | Planning p95, ms | Rows |
|---|---|---|---:|---:|
| myMembership | 399 / 407 / 451 | 8.022 / 11.612 / 11.650 | 1.429 | 1 |
| myOpenTasks | 520 / 557 / 564 | 117.219 / 153.238 / 153.730 | 7.726 | 4 |
| latestEventPerSubject | 625 / 659 / 672 | 229.391 / 242.521 / 299.513 | 4.845 | 2 |
| upcomingEvents | 628 / 661 / 685 | 233.657 / **297.249** / 298.519 | 6.055 | 4 |
| recentEvents | 421 / 433 / 453 | 18.553 / 19.777 / 20.570 | 5.108 | 4 |
| listTasks — control, not a Home read | 832 / 950 / 964 | 420.204 / 453.808 / 534.674 | 9.081 | 200 |

All rows have 25 measured samples in each instrument. The wrapper harness reports a 250 ms breach. The server diagnostic independently shows upcomingEvents above 250 ms at p95; network overhead alone does not explain the gap. The latest-event read is below that threshold at p95 with limited headroom. No specific index or migration remedy has been established by these measurements.

## Disposition and retained evidence

**Performance measurement completed; performance acceptance remains open.** HTTP p95 982 ms passed for this manual-entry workload, while the database tripwire did not. HOME-05 remains pending. ADR-0048 excludes an optimization migration from this follow-up; recommend a separately scoped optimization investigation before claiming full performance acceptance. Do not infer owner risk acceptance or a regression comparison against the different historical workload.

The handoff workspace retains `staging-db-measure.mjs`, `staging-db-baseline.ts`, `staging-db-server-times.ts`, `staging-db-measure.json` and `staging-db-server-times.json`. The server report includes every raw sample. Ephemeral credentials were held in process memory and excluded from reports. The CLI dry-run shell output was parsed, never executed; no database dump was taken. Mixed document/ingestion distribution, restricted-member performance, concurrent load, cold behavior and browser rendering remain unmeasured.
