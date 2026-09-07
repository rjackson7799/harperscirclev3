# Home performance — hosted manual-entry workload

Measured September 7, 2026 UTC against protected preview `dpl_D6jKeTX89tqQBoXVqAoXYTUjYjuS`, built from `a8a4d45b5906a110fb32f30d21921f13a92c9765`, with functions in `pdx1`. The deployed Home contains the Round 33 error, membership and temporal corrections. Subsequent local benchmark-tooling changes do not change that deployed application. No new deployment or service was created for this measurement.

## Fixture construction and checks

Dedicated synthetic circle `349ac6a1-d96c-4c21-b6e2-5cd33f7cee8b`, created through actual signup/setup, has two subjects, **2,021 date-only events, 501 open tasks claimed by the founder, and 2,522 filed manual arrivals with approved proposals and matching commit records**. Dates span past and upcoming local dates; both subjects use Pacific/Honolulu. The founder remains unverified and forwarding remains inactive.

The event/task volumes match the historical Home benchmark's counts; the workload does not reproduce its arrival count or full document/provenance mix. Every object was drafted and approved using existing `hc.create_manual_proposal` and `hc.approve_proposal` functions as the authenticated founder. Tasks were claimed through `hc.claim_task`. Batches committed only after `SET CONSTRAINTS ALL IMMEDIATE` succeeded. No trigger, policy, verification stamp or role definition was changed.

A prior rollback-only probe established both controls: an unclaimed direct record insert is rejected, and the supported event/task creation path satisfies the claim constraints. Post-run queries found zero unclaimed objects, all proposals approved, all arrivals filed, and unchanged verification/forwarding restrictions.

The synthetic fixture remains in staging for inspection. Its session stayed in memory and was disposed, the disposable password was not retained, and the temporary SQL file was removed. No real family data, uploaded documents, AI calls or email verification were involved.

## Method and fresh result

One signed-in coordinator session, issued by actual signup, made sequential HTTP requests from the local Windows host to the immutable Vercel preview. Existing deployment access was scoped to that request context. Each request included full response-body receipt in its timing; no CLI launch was inside the timed interval. There was one initial control, five untimed warm-ups, then **150 timed requests**. Every response had to be HTTP 200 and contain the subject, tasks, upcoming and recent-activity blocks, without an error alert or forwarding card. An invalid response would abort the run, not be discarded. Percentiles use nearest rank.

| Metric | Result |
|---|---:|
| Warm p50 | 921 ms |
| Warm p95 | **982 ms** |
| Warm p99 | 997 ms |
| Warm maximum | 1,018 ms |
| Valid timed responses | 150 / 150 |
| Initial untimed control | 2,531 ms |

For this workload, warm p95 met PRD §13.2's **1,500 ms** target, and every timed request remained below the **3,000 ms** ceiling. The initial control is reported separately; it is not a deliberately cold-cache benchmark. These are end-to-end HTTP timings, not browser rendering or database-only timings.

## Evidence and remaining gates

The handoff workspace retains `staging-home-load.mjs`, `staging-home-load.json` (all raw samples), `staging-home-load-verify.sql/json`, and `staging-manual-fixture-probe.sql`. The task record includes the constraint probe, batch progress and read-only deployment metadata.

This supplies fresh hosted Home evidence for a substantial manual-entry workload. It does **not** establish PRF-06's separate 250 ms database-query threshold, the original mixed document/ingestion workload, restricted-member performance, concurrent load, cold behavior or browser validation. HOME-05 remains pending its remaining acceptance; no migration is authorized, no production gate is changed, and no finding is promoted to fully closed by this result.
