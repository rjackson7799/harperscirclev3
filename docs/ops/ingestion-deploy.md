# Ingestion — the deploy checklist (slice 4; Q7's checklist family; ADR-0018 F2)

Nothing in slice 4 is production-activated by code alone: no real
forwarding address exists before the G4 activation path runs against a
real deploy, and G7 blocks activation until its abuse set is
demonstrated. This checklist is what a real deploy provisions and
verifies, row by row. The security-actions rows live in
[`security-actions-worker.md`](security-actions-worker.md); the
`hc_runtime` credential flip is
[`runtime-db-credentials.md`](runtime-db-credentials.md)'s table — both
referenced here, not duplicated.

## Provisioning rows

| Row | What | Verification |
|---|---|---|
| Postmark server | An inbound server (raw MIME + full headers ON) and an outbound server; `POSTMARK_SERVER_TOKEN` set (the §5.4 aligned-bounce sender; unset = bounces recorded `unsent`) | A test send answers 200; the inbound server shows the webhook URL |
| Inbound webhook secret | `POSTMARK_INBOUND_SECRET` (≥ 32 random bytes); the webhook URL carries it as basic auth: `https://postmark:<secret>@<host>/api/inbound/postmark` | An unsigned POST answers 401; a signed probe answers per §5.2 |
| **Inbound payload fields** | The B1 adapter prefers provider out-of-band verdict fields (`SpfResult`/`DkimResult`/`DmarcResult`) and falls back to authserv-id-anchored header parsing. **VERIFY the live payload's actual field names against `lib/mail/inbound.ts` before G4 activation** — the adapter contract was built to the TSD's letter, not to a live payload | Send a real message through the inbound server; diff the JSON against the adapter's `PostmarkInboundPayload` |
| Authserv anchors | `HC_AUTHSERV_ID` (our authserv-id, exactly) + `HC_TRUSTED_HOP` (the receiving MTA host bound in the Received trace). Unset = the header path fails closed | The B1 fixtures' genuine-chain shape matches a live message's headers |
| **Auth redirect allow-list** | The dashboard's Redirect URLs must include `<site>/confirm*` — GoTrue SILENTLY drops an un-listed `emailRedirectTo` and falls back to the site root, killing the §5.1 activation pass on /confirm (the B9 finding, twice). Local parity: `additional_redirect_urls` in config.toml, pinned by tests/config/auth-config.test.ts | Click a real verification mail on the deployed site; the browser must land on `/confirm?flow=signup` and `forwarding_active_at` must flip |
| **Site origin + confirmation template** | `NEXT_PUBLIC_SITE_URL` = the canonical origin (every auth mail's link origin rides it via `emailLinkOrigin`; blank = honestly unconfigured, loopback fallback in dev only). The hosted confirmation template must send `token_hash` to `/confirm` (the server-side verification shape) — the default template's `#fragment` tokens never reach a server route (B9 layer 3). Local parity: `supabase/templates/confirmation.html` bound in config.toml | The verification mail's link contains `token_hash=` and points at `<site>/confirm`; no `#access_token` fragment |
| A-R strip posture | The inbound MTA strips or renames incoming `Authentication-Results` before adding its own (§5.3 step 3) — provider-side configuration, recorded here because no code half can pin it | A message sent WITH a forged A-R arrives without it (or renamed) |
| Webhook source restriction | The provider's webhook source IPs allowlisted at the WAF (the parity doc's per-network rows) | A POST from elsewhere is refused at the edge |
| clamd endpoint | `CLAMD_HOST` / `CLAMD_PORT` → a private ClamAV container reachable from the workers; nothing persisted provider-side (§1.6) | The EICAR string through `/api/worker/scan` lands `quarantined`, NOT `scan_unavailable` (the B9 leg, live) |
| Pipeline worker key | `HC_WORKER_KEY` (≥ 32 random bytes, distinct from `CRON_SECRET`) — gates the eager fires and the operational POST paths | POST with the key answers 200; without, 403; unset, 503 |
| Cron rows | `vercel.json`: relay `* * * * *` · nightly `0 3 * * *` · security-actions `*/10 * * * *`; `CRON_SECRET` set; the per-minute cadence needs a paid plan (the Hobby floor is recorded as insufficient) | The first relay invocation answers 200 with zeroed counts |
| pgmq | The `pipeline_work` queue ships in M2 (migration, not provisioning) — nothing to create at deploy | `select count(*) from pgmq.q_pipeline_work` runs |
| hc_runtime flip | The 4B B8 unit: provision `hc_runtime_login`, flip `HC_DB_URL`, verify the role flags — the full table is in `runtime-db-credentials.md` | That table's three probes |
| **Quarantine byte purge (§11.5; ADR-0018 F2)** | The nightly route purges quarantined BYTES at 7 days (hash + verdict retained forever in `scan_results` — the X1 safety-monotonic row). Owner: `/api/worker/nightly` → `purgeQuarantineOlderThan(7)`. If the platform grows a bucket-lifecycle rule, it may replace the sweep — remove the sweep only WITH the rule in place | After a quarantined test object ages past 7 days, the nightly response counts it purged; `scan_results` still holds the infected row |

## Monitoring rows

- Relay response per minute: `queue_age_alert` true = reading is delayed
  over the §13.1 4-hour bound — notify the coordinator surface, page if
  sustained. `stuck > 0` = a DEFECT signal (§4.11), page.
- Nightly response: `taint_findings > 0` pages (OPS-01);
  `errors` non-empty pages.
- Postmark inactive-address blocks (`inactive_address` in the webhook
  log) = provisioning drift between `forwarding_active_at` and the
  provider's routes — reconcile immediately.
- The §5.4 monthly-ceiling signal is logged by the webhook
  (`monthly_ceiling_reached`) — the coordinator notification surface is
  a recorded pending until the notification templates land (§5.9's
  slice); the signal is never a refusal either way.
