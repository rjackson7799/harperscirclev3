# Staging companion services — preparation checkpoint

## Owner decision: no additional service

The owner subsequently said, "i'd rather not add on another service at this point, can we proceed without it?" Work continues using Supabase and Vercel only. Do not provision the proposed Linux host or substitute another paid service. The companion-service proposal below is deferred, not awaiting purchase approval. Prioritize Home, setup, navigation and permission checks that can be run with existing infrastructure. Email delivery, synthetic AI/virus-scanning integration and the qualifying full browser gate remain pending; this decision does not waive their acceptance criteria or promote coverage. The fixture access-control implementation remains available locally and is not deployed as a hosted service.

This is fixture/test infrastructure under the owner's delegated continuation. No product authentication, RLS, migration, provider adapter or dependency changes are included. No remote fixture endpoint is enabled by this change. The existing staging preview remains on its previously verified deployment.

## Synthetic AI fixture

The existing `scripts/ai-fixture-server.mjs` now supports a dedicated `HC_FIXTURE_ACCESS_KEY` and optional `HC_FIXTURE_BIND_HOST`. Default operation remains loopback-only and keyless for local tests. Binding beyond loopback requires a configured key of at least 32 characters; an explicitly blank/short key refuses startup even on loopback. Generate at least 32 random bytes for a deployed key; never use a real provider credential.

The SDK's `x-api-key` header carries the fixture key. Missing/wrong keys receive 401 before the request body is parsed or recorded. Captured evidence excludes `x-api-key` and `authorization`, while preserving non-secret protocol headers used by adapter assertions. Only GET `/` offers unauthenticated health data when access control is configured.

For a future hosted fixture, set `HC_FIXTURE_BIND_HOST=0.0.0.0` only inside the service network behind authenticated HTTPS ingress. Set the Vercel staging `ANTHROPIC_BASE_URL` to that HTTPS endpoint and its `ANTHROPIC_API_KEY` to the dedicated fixture key only after the ingress is verified. The test server itself speaks HTTP, holds request history in memory, and deliberately supports hang/retry markers. It therefore still requires ingress request-size, concurrency and timeout limits, a bounded test-run lifecycle, and synthetic content only. It is not a public/general-purpose API.

## Remaining service plan

| Component | Required implementation before enabling the gate |
|---|---|
| Linux host | Existing host preferred if available. Otherwise a service-only 2-vCPU/4-GiB VM is a sizing starting point, not measured capacity. DigitalOcean lists this Basic size at $24/month before extras/taxes as checked September 7, 2026. No purchase is approved or made. Running browsers on the same host requires a separate memory assessment. |
| Email capture | Mailpit with authenticated TLS SMTP and protected HTTP API/UI. No outbound relay or message-release configuration. Preserve real confirmation-link verification; do not stamp accounts verified in fixture setup. Never enable accept-any authentication on exposed ports. |
| Synthetic AI | Deploy the checked-in fixture behind HTTPS with the dedicated key and ingress resource limits. Test refusal and valid protocol responses from the actual staging app. |
| Virus scanning | ClamAV remains private. The existing client uses raw TCP; a VM alone does not provide a secure Vercel-to-scanner connection. Prepare and test an authenticated encrypted bridge or a private worker placement as a separate implementation unit before enabling scanning. Do not expose clamd port 3310 publicly. |
| Database fixtures | Replace the seven files' unsupported `session_replication_role` bypass with fixtures that satisfy the real claim/provenance constraints. Do not relax application roles or triggers. |
| Runner | Preserve target-specific guards, one-worker execution, independent fixtures and full JSON/trace evidence. The in-app/Chrome automation attachment problem remains separate from these service dependencies. |

Sources: [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets), [Mailpit SMTP](https://mailpit.axllent.org/docs/configuration/smtp/), [Mailpit UI/API protection](https://mailpit.axllent.org/docs/configuration/http/). Account, region, DNS, recurring cost and server access must be selected before provisioning. The owner has been asked whether an existing Linux host is available or a new-server proposal is needed.

## Evidence

The new six-case fixture suite initially reported **1 pass / 5 failures** (RED commit `8fcc975`). After implementation, it and the existing adapter suite reported **64 passing tests**, with no provider call or shared database/browser gate. Changed-file lint and whole-project TypeScript passed after correcting a test-only header typing issue. Raw reports are `staging-fixture-red.json`, `staging-fixture-green.json`, and `staging-fixture-typecheck.log` in the handoff workspace. These results prove the local fixture boundary, not hosted availability, browser behavior, provider evaluation or launch readiness. OW-32/OW-34/OW-35 and coverage remain unchanged.
