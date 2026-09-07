# Admin foundation — capability and session checkpoint

September 7, 2026. Owner approved the Tier 1 boundary, metadata-access amendment and maximum two migrations after `c4a561c`. Migration usage: **2 of 2 draft files; neither deployed**. Dependencies: **0**. No reserve, deployment, operator provisioning or merge.

## What was verified

Read-only catalog inspection against the existing staging project at `2026-09-07T19:27:10Z`, source `c4a561c554ca82ec90cd26641f32bae76acadf2c`, used the established TLS-verified temporary CLI transport. The transaction was read-only and rolled back. No auth row contents were selected and no auth data or schema changed.

Both `auth.sessions` and `auth.mfa_factors` are owned by `supabase_auth_admin`; the inspected `postgres` migration role has SELECT and TRIGGER privileges on both. Sessions expose `user_id`, `factor_id`, `aal` and `not_after`; factors expose `user_id` and `status`. Both user foreign keys cascade on user deletion. There is **no factor foreign key on sessions** in the returned constraint inventory: admission must join the current verified factor, never assume a session disappears on factor removal. Secret-bearing auth columns were identified by name only and must never enter mirrors.

This is capability metadata, NOT successful trigger installation or lifecycle proof. The sanitized local report is `../admin-auth-catalog.json` relative to the repository root; the outer probe script holds no saved credential. It reads the temporary transport fields in memory and suppresses raw connection errors.

## Application unit completed

`lib/auth/admin-session.ts` verifies one captured token with both signature verification and the live-user call, matches their subjects, checks UUID session identity, aal2, token expiration and at least one currently verified factor, and returns only the identity allowlist. Operational faults are normalized to unavailable; explicit auth denials remain denied. The helper makes no database call and is not wired to a route. It deliberately returns **verified-session**, not admin authorization: a family member can have MFA. Database registration, session/factor binding and audit commit remain required before any metadata delivery.

RED baseline `a0f023e`: 13 failures and 4 passes against a fail-closed placeholder. The factor-case table was corrected to pass array values as objects rather than spread test arguments; it was not a product retry. GREEN targeted run: **28/28** across the new 17-case Admin session file and the existing 11-case session file. Whole-tree TypeScript completed successfully; changed-file ESLint completed with zero warnings. Existing Vite config-loader warnings remain. No full suite, PostgreSQL or browser pass is claimed. The earlier opt-in zero-identity factory regression remains RED until the database boundary and replacement factory can land together.

## Initial environment blocker, now resolved for SQL capability

No native PostgreSQL executable was found on PATH or in the standard installation directory; Docker remains off under the owner's instruction. The existing GitHub Actions runner now supplies a disposable Supabase database, with no additional service or hosted credentials. The approved design still requires lifecycle proof before writing either migration. Catalog permissions alone do not satisfy that prerequisite. Do not attach experimental auth triggers to the staging database the owner is using.

`scripts/probe-admin-auth-lifecycle.sql`: guarded to a disposable database named `hc_admin_probe`, transaction/timeout bounded, synthetic user only, all objects and rows rolled back. **Passed on the isolated runner at `5119e57a3129c63df90e42616b781ff87f552995`**, including trigger creation, insert/update/delete, rollback and auth-user cascades using the real auth tables. Exact log and setup-failure history: [isolated-admin-ci.md](../ops/isolated-admin-ci.md). It also enumerates remaining real GoTrue, concurrency, backfill and permission proof. Renaming a shared database to satisfy the guard is forbidden. This is a test artifact, not M1 or M2.

Real GoTrue lifecycle and concurrent revocation proof subsequently **passed at `4443b36560be881b72b59c8932ff89dd8e9f9d6b`**, with 19 assertions and six observed lock schedules. Details and the retained failed setup run are in [isolated-admin-ci.md](../ops/isolated-admin-ci.md). This is a test-only prototype, not the final authorization or audit function.

Implemented at `5573f03`: both named migrations, reconciled privilege/policy inventories, and the replacement named-read adapter. Isolated run `34159091922` passed all 1,872 database tests in 71 files, 34 Admin application/factory tests in three files, the custom admission/audit/registration-backfill boundary checks, and 19 real MFA/concurrency assertions using the implemented function. This supersedes prototype-only evidence for those named checks. A pre-existing-registration migration upgrade rehearsal, final review and any later privileged UI/browser proof remain outstanding. OW-36 records the missing audited health-reader operation and blocks closure. See ADR-0049 and the isolated CI evidence. No privileged page until its gates pass. Home's existing browser, mixed-workload and final aggregate gates remain pending; the reusable staging family tester is preserved.
