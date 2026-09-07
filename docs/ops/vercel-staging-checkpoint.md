# Vercel staging checkpoint — 2026-09-07 UTC

## Subsequent Oregon deployment

The stable preview alias now points to `dpl_D6jKeTX89tqQBoXVqAoXYTUjYjuS` at `https://harperscirclev3-staging-hxedwrgzt-honu-vibe.vercel.app`, built from `a8a4d45` (same product code as the initial checkpoint). Vercel's deployment API confirms READY, preview (`target=null`), and function region **`pdx1`**. The project's `resourceConfig.functionDefaultRegions` is now `["pdx1"]`, co-locating application functions with the Oregon database. The build machine still reports `iad1`; build location is not the deployed function location.

The remote build and TypeScript passed. A new synthetic invalid sign-in returned HTTP 303 with exactly `/sign-in?e=nomatch`; the alias moved only after that check passed. Evidence: `vercel-staging-oregon-deploy.log` and `staging-oregon-sign-in.headers` in the handoff workspace. This removes an avoidable cross-region database trip; it is not a measured Home p95 result. The prior preview remains available as a rollback reference.

Browser automation could list the user's signed-in staging tab but failed to attach its debugger; the accessibility fallback and a fresh-tab attempt also failed. No browser assertion executed and no coverage status changed. The user's existing tab was left untouched; no temporary tab remained. Browser gate, fixtures, email capture and ingestion-service work remain pending.

The remainder of this document preserves the initial deployment checkpoint.

The owner authorized creating and configuring a separate Vercel staging project. This is an initial protected preview, not browser-gate completion or production readiness.

- Project: `honu-vibe/harperscirclev3-staging` (`prj_pO2dGrexFrtKINnbAa84RBG2SYqk`).
- Stable preview: `https://harperscirclev3-staging-preview.vercel.app`.
- Deployment: `dpl_AzzWMMxzXwyvN398jzh8MrrQw3ps`, READY, preview (`target=null` in Vercel's API).
- Immutable URL: `https://harperscirclev3-staging-nwgututh6-honu-vibe.vercel.app`.
- Reviewed code: `ad729b4`, with full SHA retained by the initial deployment metadata and Git history. This later checkpoint changes documentation only.
- Database: only `venzvdbvzjjsmouxjkzd`, the new Oregon staging project.
- Framework/runtime: Next.js 16.3.1, Node 22. Function region currently `iad1`; compare/co-locate with Oregon before treating latency measurements as representative.

## Configuration and credential proof

Provisioned separate `hc_runtime_login`, `hc_admin_login`, and `hc_pipeline_login` credentials with membership in their documented NOLOGIN roles. All three authenticated through the session pooler with `rolsuper=false` and `rolbypassrls=false`. The existing maintenance connection uses the staging project's `postgres` identity, as documented in `runtime-db-credentials.md`.

All four connections passed TLS certificate and hostname verification. The initial check failed with `SELF_SIGNED_CERT_IN_CHAIN`; the correction was to bundle Supabase's official public CA and set `sslmode=verify-full` plus `sslrootcert`. Certificate verification was never disabled. Runtime probes refused bare SELECT on accounts and UPDATE on auth.users with `42501`; an explicitly assumed authenticated role could resolve its granted account read.

The seven database/API settings and the canonical staging origin were stored in Vercel's preview environment as sensitive settings. No real AI-provider key, inbound-mail credential, worker key or cron secret was enabled. Temporary plaintext password, API-key and generated-role credential files were removed after transfer and verification. The one-time provisioning scripts were also removed to prevent accidental replay. `.vercelignore` excludes local secrets, CLI state and test artifacts from uploads.

Supabase auth now matches the repository's staging origin, redirect path, minimum password length 10, 30-day session timebox, 30-minute email OTP expiry, soft verification model and confirmation template. Hosted email throttling and eight-character OTP length were preserved. A subsequent CLI comparison reported API, DB, Auth and Storage configurations up to date. HIBP, WAF, custom email delivery and full auth walkthrough proof are not claimed by that comparison.

## Fresh verification and deployment correction

Changed-config ESLint passed. Vercel's remote production-mode build and TypeScript check passed (this describes the build mode, not a production deployment). The build retains the existing OCR tracing warning. No full application-suite rerun was needed for these deployment-only changes; the prior 1,621-test result remains tied to `0d93dbb`.

Vercel's first deployment unexpectedly received `target=production` despite the explicit preview option. It was confined to the newly created staging project and did not change the public Harper's Circle site. A second deployment was verified as preview; the stable preview alias was assigned to it, and the initial deployment `dpl_FoFFURBdQD7CazGVpBLRt5JzHu9P` was removed by exact ID. Do not describe the first attempt as a successful preview.

- Protected GET `/sign-in`: HTTP 200.
- Protected POST `/sign-in/submit` with one synthetic nonexistent address: HTTP 303 to `/sign-in?e=nomatch`, exercising the deployed auth-throttle/database path without creating an account or sending email.
- Anonymous request to the stable preview: redirected to Vercel authentication. Deployment protection remains enabled.
- Hosted auth-user count after smoke checks: zero.

Evidence outside the repository: `staging-connection-checks.json`, `staging-auth-config-preview.log`, `staging-auth-config-apply.log`, `staging-auth-config-readback.log`, `vercel-staging-deploy.log`, `vercel-staging-preview-deploy.log`, `staging-sign-in.html`, and `staging-invalid-sign-in.headers`.

## Remaining gates

This is HTTP smoke evidence, not a browser walkthrough. OW-32/OW-34/OW-35 remain unchanged. Complete hosted-compatible synthetic fixtures (the existing trigger-bypass approach is unavailable), email capture, reachable fixture AI and scanning services, then run the qualifying browser suite and Home latency checks. Upload/ingestion and scheduled work are not validated or operationally enabled here. No existing production project, domain or repository merge was changed, and no paid upgrade was purchased.
