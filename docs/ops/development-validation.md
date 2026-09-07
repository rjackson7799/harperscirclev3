# Efficient validation and staging handoff

Current hosted state: the separate Supabase project has all 77 existing migrations, and the protected Vercel preview is deployed in Oregon. See [database checkpoint](staging-checkpoint.md), [deployment checkpoint](vercel-staging-checkpoint.md), and [current staging smoke evidence](staging-setup-smoke.md). Coordinator, nonmember, restricted-tier and removed-member Home HTTP checks have passed. Full browser adaptation and qualifying evidence remain pending. The inventory below is historical discovery, not a request to create more resources; the owner has explicitly deferred additional services.

This workflow follows the owner's September 6 handoff instruction to improve speed without sacrificing quality. It adds a convenience entry point; it changes no acceptance criteria, authorization, schema, dependencies, or browser gates.

## Local development

1. During a correction, run the smallest relevant regression first, capture its expected failure, then implement and run the affected tests. Database-backed tests still need the shared-stack preflight wrapper. Do not reset the database merely to start a work session.
2. At the final code head, use `npm run verify:local`. It runs lint, the full application suite, and the production build **sequentially**, stops at the first failure, and holds the existing shared-stack lease throughout. Vitest already uses one worker. `verify:local:steps` is an internal command, not a substitute for the guarded entry point.
3. The production build includes TypeScript checking. A separate `npm run typecheck` remains useful during editing, but need not repeat that work immediately before a successful build. Database, concurrency, browser, latency, and launch gates remain separate where required by the change.
4. Before a verification run, preserve any prior `.vitest/run.json` needed as evidence outside the checkout. Record the full commit, clean/dirty status, commands, exits and machine-readable test report with the run. A passing check applies to that snapshot; do not cache a pass across changes to code, dependencies, configuration, fixtures or database state.
5. A preflight refusal is a stop, not a retry loop. If only HEAD moved because of this session's own commit, inspect and acknowledge it by rerunning. Identify peer activity before proceeding; do not force past a peer lease or memory refusal. Keep builds, development servers, and browser gates from competing for this machine's memory.

The combined command intentionally does not tune Next.js internals, change memory floors, start services, install packages, or reset data. Existing individual commands remain available for failure diagnosis. A failed run is evidence: classify the failure before rerunning under the existing traps protocol.

## Staging readiness

ADR-0046 D7 already places the qualifying browser gate on Vercel staging, runnable from any host. Creating two empty projects alone will not make the current harness runnable: `playwright.config.ts` starts local servers and all nine browser files contain local database/Mailpit endpoints.

The next staging increment must prepare these items before executing the qualifying gate:

| Dependency | Required staging adaptation and proof |
|---|---|
| Isolated Supabase database and storage | Apply the reviewed migrations to a synthetic-data project; verify actual runtime-role grants and separate request, maintenance and pipeline identities per `runtime-db-credentials.md`. Never point destructive test setup at a live-user project. |
| Vercel deployment | Deploy the reviewed commit with staging-only variables and auth redirect parity. Parameterize the browser base URL and disable local web-server startup only in explicit staging mode. Record the deployed commit; verify worker invocation rather than assuming the cron configuration proves execution. |
| Authentication email | Replace local Mailpit polling with a staging email capture mechanism that preserves the actual confirmation-link flow. Avoid bypassing email verification to obtain a green test. |
| AI fixture | Supply a reachable, access-controlled synthetic Messages API fixture from the deployed app. Preserve G9/G3: no real provider key or real user content. The fixture must not become an unrestricted public service. |
| Virus scanning and ingestion | Provide a reachable scanner/worker arrangement compatible with the existing ingestion deployment contract; verify clean and EICAR paths. Supabase/Vercel provisioning does not itself supply the existing clamd dependency. |
| Test runner and evidence | Move the runner to a host with adequate memory if necessary. Adapt preflight to guard the actual staging target before enabling remote fixture writes. Preserve JSON, traces and screenshots; keep CI KEYLESS and do not silently move browser gates into CI. |

Use `auth-config-parity.md`, `ingestion-deploy.md`, `ai-provider.md`, and `runtime-db-credentials.md` as implementation inputs. Database and application provisioning are complete; the remaining fixture email, AI and scanning dependencies are deferred under the no-additional-service decision. Do not re-request hosting selection or infer authorization to buy a companion host. Lightweight staging HTTP checks run without those dependencies; a browser-only smoke can use the installed local runner when sufficient memory is available, keeping its evidence separate from the complete gate.

OW-32 and OW-34 remain pending their qualifying proof, including the required nine-file browser gate, Home fixture isolation and latency evidence. OW-35's missing assertion remains separate. This workflow does not promote any coverage row or grant merge/production approval.

## Read-only hosting inventory — September 7 UTC

Both CLIs authenticated successfully. Supabase lists an existing `HarpersCircle` project in Oregon, created December 3, 2025. Its purpose and data have NOT been inspected; the owner has been asked whether it is an older/live project or empty staging for this repository. Vercel's current `honu-vibe` team lists `harperscirclev2` at the public Harper's Circle domain. No project named for v3 staging appeared in that listing. This checkout has no `.vercel/project.json` link. No hosted settings, secrets, databases, domains or deployments were changed.

Recommended destination: a separate `harperscirclev3-staging` Vercel project and isolated synthetic Supabase project, leaving the existing public site intact. This is a proposed target name, not a provisioned resource. Confirm the Supabase project purpose before selecting its destination; confirm cost and region before creation. Do not infer that existing project credentials belong to this checkout.

The fixture portability review also found `session_replication_role = replica` in seven browser files. Their local fixture bypass is not proof that a hosted project permits the same operation. Before enabling remote test writes, verify the selected hosted identity's parameter privileges and trigger behavior. If unavailable, redesign synthetic fixture construction through supported operations in a separately classified increment; do not grant broader application privileges or disable production protections to make tests pass.

Stage work in this order: identify isolated destinations; verify migration and fixture compatibility; prepare staging runtime identities, email capture, reachable AI fixture and scanner; adapt explicit remote harness configuration and target-specific preflight; then deploy the reviewed commit and execute the recorded gate. A preliminary Home smoke check may help diagnose setup, but does not discharge the full nine-file gate. Until those dependencies are ready, changing only the base URL would produce a mixed local/remote run and is deliberately not enabled.
