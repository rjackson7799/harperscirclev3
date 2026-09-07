# V3 staging database checkpoint — 2026-09-07 UTC

The owner created a separate project and supplied its URL after explicitly choosing a new v3 database. This checkpoint records initialization of that staging target with existing migrations, not a new schema increment or production activation.

- Project: **HarpersCirclev3 Staging**, Oregon.
- Reference: `venzvdbvzjjsmouxjkzd`.
- URL: `https://venzvdbvzjjsmouxjkzd.supabase.co`.
- Source: clean `review/round33-handoff` at `bffb06c6a1627e5659fcf2d09060efff64078585`.
- Only the isolated handoff checkout was linked. The old Supabase project and Vercel public site were untouched.

## Before initialization

Read-only metadata showed PostgreSQL 17.6, zero application tables, zero auth users and zero storage buckets. All four required extensions were available. The automatic-RLS event trigger `ensure_rls` was enabled. The maintenance identity resolved to `postgres`: not a superuser, with role creation and RLS bypass privileges.

The migration dry run listed 77 pending migrations. A SHA-256 manifest of their exact contents was preserved before applying them. `supabase db push --linked --yes` applied those existing migrations successfully; no seed was requested and no shipped migration was edited.

## Fresh verification

| Check | Result |
|---|---|
| Applied migration history | 77 entries; latest `20260904120001` |
| Public tables | 36, all with RLS enabled |
| Storage buckets | `artifacts` and `quarantine`, both private |
| Runtime role memberships | Exactly `anon` and `authenticated`, both `inherit=false` |
| Auth users | Still zero |
| Representative grants | Authenticated SELECT on arrival ID and service-role SELECT on arrivals present |
| Database function lint | `public`, `hc`, `admin_meta`: exit 0, no schema errors, warning failure threshold enabled |

These are catalog and function-lint checks, not pgTAP, browser, latency or launch proof. The original full application result remains tied to `0d93dbb`; it was not run against this new hosted database. Coverage and owed verdicts remain unchanged.

## Remaining setup

The hosted maintenance identity cannot set `session_replication_role`. Seven browser files contain a local trigger-bypass fixture path. Remote fixture writes must remain disabled until those paths have a supported hosted implementation; broadening runtime privileges is not the remedy.

Next: provision and verify separate runtime credentials per `runtime-db-credentials.md`; prepare the separate Vercel staging project and auth redirects; provide email capture, a reachable synthetic AI fixture and scanner; adapt target-specific browser configuration/preflight; execute the required browser and latency proof. No Vercel project, deployment, external email service, scanner or application credential was provisioned in this checkpoint. The full gate remains pending under OW-32/OW-34, with OW-35's repaired assertions still unrun.

Local handoff evidence: `staging-baseline.json`, `staging-migration-manifest.json`, `staging-migration-apply.log`, `staging-verification.json`, and `staging-db-lint.log`. They are retained outside the repository in the handoff workspace. No credentials are embedded in this document.
