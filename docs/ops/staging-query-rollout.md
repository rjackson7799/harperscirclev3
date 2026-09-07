# Query optimization — staging rollout

September 7, 2026. Source **`e012b07f26b3ae71c9712c63a8de70b4a4189902`**, containing query correction `fdd3eee`. Deployment **`dpl_6ixP78EytVqCzy1LrvidFnSy4kMB`**, immutable URL `https://harperscirclev3-staging-8kjmzwf7y-honu-vibe.vercel.app`. Vercel API verified READY, preview (`target=null`), the existing staging project and function region `pdx1`. Local production build and affected checks are recorded in the [query correction](../review/round-33-query-optimization.md).

The deployment upload manifest excluded environment files, CLI state, local test output and dependencies/build output. No environment credentials, database definitions, RLS policies or production project settings changed. The previous preview `dpl_D6jKeTX89tqQBoXVqAoXYTUjYjuS` remains the rollback reference.

## Fixture and method

Reuse of synthetic load circle `349ac6a1-d96c-4c21-b6e2-5cd33f7cee8b` preserved its 2,021 events and 501 tasks. A fresh synthetic account established a session through actual signup. Its temporary membership tested Care Circle and Family with no subject grants, then coordinator with copies of the known synthetic founder's subject grants. This administrative fixture setup does not validate the invitation, grant or step-up user flows. Verification stamps and the original founder's credentials, membership, grants and task ownership were not changed.

The probe owns **zero tasks**. Accordingly, its HTTP result is a separate workload from the earlier founder's 501-owned-task result and must not be presented as a controlled before/after page-latency improvement. The database paired comparison remains the evidence for the query improvement.

HTTP checks use an in-memory Playwright API request context, not a browser. Existing Vercel protection bypass is confined to the verified preview origin. Each timed request includes body receipt and must return a successful populated router with subject/upcoming/recent sections, private/no-store caching and no error or forwarding card. Five warm-ups precede 150 timed requests; invalid responses abort, rather than becoming fast samples. Nearest-rank percentiles are used.

## Permission evidence and harness corrections

Signed-out access redirected to sign-in (307); the authenticated nonmember saw the empty state without a subject name. Care Circle and Family each saw two subjects but zero events, matching actual authenticated RLS queries. The coordinator with explicit grants saw 2,021 events, including 1,023 upcoming events, and the corresponding Home sections. These checks cover this fixture's grant combinations, not all possible sharing/grant states.

Two initial harness attempts stopped before timing and cleaned up their memberships. The first incorrectly expected event sections for Care Circle; a rollback-only probe confirmed zero permitted events and two subjects. The second gave a coordinator only membership, without subject grants; RLS correctly returned zero events. The final fixture added explicit synthetic subject grants. Both failed reports are retained, and no application change was made to satisfy those incorrect fixture expectations.

## Completion evidence

All six behavior checks passed: signed-out, authenticated nonmember, Care Circle, Family, coordinator with explicit grants, and removed member using the same session. Removal restored the empty state without the subject name or an error alert. The temporary membership was deleted and zero remaining memberships verified; its grants cascade on membership deletion. Disposable sessions and passwords were discarded, the temporary SQL file removed, and synthetic unverified accounts retained without membership. The known synthetic founder and load records were preserved.

| Warm HTTP metric | Result |
|---|---:|
| Valid timed requests | 150 / 150 |
| p50 | 876 ms |
| p95 | **1,018 ms** |
| p99 | 1,057 ms |
| Maximum | 1,191 ms |

For this workload, p95 met 1,500 ms and all timed requests stayed below 3,000 ms. These are HTTP measurements, not rendering, cold-cache or concurrency tests. Browser, accessibility, mixed document/ingestion workload and full nine-file gate remain pending. No finding or coverage row is promoted by these HTTP checks.

After all checks and cleanup passed, the stable alias `https://harperscirclev3-staging-preview.vercel.app` was switched from `dpl_D6jKeTX89tqQBoXVqAoXYTUjYjuS` to the new preview. API readback verified the exact target and staging project. Anonymous `/sign-in` access returned 302 to Vercel authentication, confirming deployment protection remains in effect. The old preview was retained. No production alias or repository merge changed. Before/after evidence: `staging-query-alias-before.json` and `staging-query-alias-after.json`.

Evidence in the handoff workspace: `staging-query-upload-manifest.json`, `staging-query-deployment.json`, `staging-query-http.mjs/json`, `staging-query-http-first-attempt.json`, `staging-query-http-second-attempt.json`, and `staging-query-care-proof.sql/json`. Credentials and cookies are not retained in these reports.
