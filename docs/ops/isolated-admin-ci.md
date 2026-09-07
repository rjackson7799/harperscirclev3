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
