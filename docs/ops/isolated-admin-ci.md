# Isolated Admin database checks

The existing GitHub Actions service runs `.github/workflows/admin-capability.yml` for changes to that workflow or `scripts/probe-admin-auth-lifecycle.sql` on `review/round33-handoff`. It adds no hosting service, uses no hosted credentials, and does not run Docker on the owner's PC. There is no deploy step. The staging Vercel project's Git link was verified absent before the first push.

The job installs the lockfile-pinned tools, starts a fresh local Supabase database on the disposable runner, asserts that `auth.users` is empty, then clones that database as `hc_admin_probe`. The clone preserves Supabase's built-in extensions, owners and grants. It includes only the runner's initialized database state; it never connects to a hosted database. Connections to the runner's source database are disabled briefly during its native clone and re-enabled afterward. The entire runner is disposable on failure as well as success.

The SQL probe runs as `postgres`, not the setup-only `supabase_admin` role. Its database-name guard, lock and statement timeouts, assertions and final rollback remain active. Do not weaken an assertion to obtain a green run. The artifact retains the exact source commit and SQL output. A successful run proves only the named SQL lifecycle checks, not real GoTrue enrollment, concurrency, production parity or Admin authorization.

## Setup failures retained

- Run `34156283794`, source `77b0945`: restoring schema ownership as postgres failed because it cannot SET ROLE supabase_admin. No lifecycle assertions ran.
- Run `34156420732`, source `d3cfdc8`: the setup-only copy account needed explicit local authentication. No lifecycle assertions ran.
- Run `34156635821`, source `7fed94f`: logical restoration hit a Supabase GraphQL extension dependency. No lifecycle assertions ran. Replaced export/restore with native cloning of the pristine local database.

These are classified test-setup failures, not product RED evidence. Each correction is a separate commit. No error was suppressed and no assertions were skipped to retry.

The final push briefly failed automatic approval review over destination authorization. Read-only checks confirmed that the existing remote is the signed-in owner's repository, the branch was current, and the sole new payload was the workflow correction; automatic review approved the retry. No workaround was used.

## Verified result

[Run 34156866372](https://github.com/rjackson7799/harperscirclev3/actions/runs/34156866372) **passed** at exact source `5119e57a3129c63df90e42616b781ff87f552995`. The downloaded artifact was inspected: both triggers were created, all five assertion blocks completed, and the explicit result was `PASS: trigger creation, insert, update, delete, rollback, user cascade`, followed by final ROLLBACK. The assertion output and source ID are retained in outer workspace directory `admin-capability-34156866372`.

The environment blocker is resolved for this SQL capability test. This does not close real GoTrue enrollment/unenrollment, multi-session race checks, mirror protection, backfill or application admission/audit acceptance. No migration has been spent or deployed. The existing staging site and family tester were not involved.

## Real MFA and concurrent lifecycle proof

[Run 34157466386](https://github.com/rjackson7799/harperscirclev3/actions/runs/34157466386) passed at `4443b36560be881b72b59c8932ff89dd8e9f9d6b`. Its downloaded `admin-live-result.json` contains **19 passed assertions**: fresh-runner/loopback guards; real signup; TOTP enrollment/challenge; unverified and verified factor/session mirrors; real factor removal denying the old aal2 session; global sign-out removing mirrored sessions; and six two-connection schedules across factor deletion and session deletion. Both revocation-first and read-first commit orders were exercised, plus revocation rollback for each target. Waits were verified with `pg_blocking_pids`, not inferred from elapsed time. The old token's `getUser` request was rejected after sign-out (`staleTokenGetUserAccepted: false`); this is one observed lifecycle, not a universal token-revocation proof.

The test-only `admin_probe` schema uses an account anchor locked by synchronous auth triggers, with share locks for the simulated reader. It is a capability prototype, not the shipped Admin function. It runs only with the GitHub-hosted-runner guards and fixed loopback connections; accepts no hosted connection override; generates its own account/password/TOTP; and stores no credential in its report. Unlike the separate SQL probe, these live API changes commit within the disposable runner and disappear with that runner. No staging fixture participates.

Run `34157251786` at `4251462` failed its local-endpoint guard before signup. The CLI had treated `supabase start` after `supabase db start` as already running and left auth stopped. Fixed by starting database and auth together at `4443b36`; the assertions were unchanged. The earlier lifecycle SQL probe passed again in the corrected run. Script syntax, changed-file ESLint and service-role containment checks also passed locally.

Next implementation evidence remains separate: actual admin-registration/revocation checks, inaccessible mirrors, RLS/privilege pins, backfill, pooled-connection cleanup, audit failure/commit semantics and browser behavior. These tests establish feasibility and the serialization strategy; they do not authorize access or close those acceptance rows. Migration budget remains 0 of 2 until implementation begins.

## Implemented boundary verification

[Run 34159091922](https://github.com/rjackson7799/harperscirclev3/actions/runs/34159091922) passed at exact source `5573f0376eabe6d14d6990e4405b4e2af018d2ba`. Downloaded evidence is retained in outer workspace `admin-capability-34159091922`. The live script now calls the actual `admin_ops.read_platform_stats` implementation and its actual mirrors, replacing the prototype. All 19 lifecycle/concurrency assertions passed; stale-token getUser was rejected in this observed run. The custom boundary SQL passed admission, audit failure, registration backfill, revocation and privilege checks. The full pgTAP suite passed **1,872 tests in 71 files**. The runner also passed **34 tests in three Admin application/factory files**. These are fresh isolated-runner results, not hosted staging or browser evidence.

Retained intermediate failures: `34158215485` at `0b62cb6` rejected LOCK TABLE outside an explicit transaction; `34158552564` at `2b794e2` exposed the missing anchor UPDATE policy needed for SELECT FOR SHARE; `34158744816` at `be78d88` passed custom boundary checks but failed five stale catalog/operator assertions in the full suite. The corrected anchor policy allows lock visibility while WITH CHECK(false) denies writes. Exact grants and policies were reconciled without removing content-dependency assertions. The sweep-health operator-access gap is explicitly pending as OPS-01 / OW-36 rather than presented as satisfied by an internal-owner data check.

The two migrations remain unshipped drafts. Registration after migration is tested; migration-time backfill of a registration already present before M1 still needs its own upgrade rehearsal. Final review and OW-36 resolution remain required before closure. No Admin route, hosted migration, deployment or operator provisioning occurred.

Local follow-up on September 7, starting 10:25:58 Honolulu: `npm run test:without-db` passed **1,436 tests in 92 files**, 157.58 seconds. The runtime/test source remained at `5573f03`; documentation edits were present, including separate requirements edits excluded from this evidence checkpoint. Report: `.vitest/without-db.json`. The configured 22 database-dependent files were explicitly deferred; this result is not the full application or browser gate. Existing Vite and React test-environment warnings did not fail the run. Process-ledger checks passed within this run.
