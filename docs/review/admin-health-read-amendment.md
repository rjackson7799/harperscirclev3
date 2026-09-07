# OW-36: bounded health-read correction for owner decision

Status: proposed; not implemented or accepted risk. The approved contract exposes only platform_stats. ADR-0049 / OW-36 blocks Admin closure because removing direct metadata access also removes the operator's sweep-health read.

Recommendation: authorize one additional named operation, `admin_ops.read_sweep_health(uuid)`, and one corresponding server-adapter method. Return only the existing view's `kind`, `last_run_at`, `last_findings`, `runs_24h` and `findings_24h` fields, ordered by kind. Preserve the existing absence of rows; do not represent a missing sweep as healthy. No family-content fields, filters or caller-selected views.

Apply the same live registration, bound session/factor, MFA, revocation serialization and audit-before-delivery contract as platform_stats. Extend the fixed audit operation allowlist to these two operations. Keep all direct/default metadata grants revoked. Reconcile the exact EXECUTE inventory and add failing tests for the new operation before implementation. Test both permitted data and refusals, separate audit events, audit/commit failure and revocation. Do not expose a generic public query interface while sharing internal transaction plumbing.

Use the existing two unshipped draft migrations; no third migration, dependency, hosted service, deployment, operator provisioning or merge. Re-run the fresh database, existing-state upgrade, privilege and affected application tests against the corrected source. OPS-01 remains pending until its full alert-consumer acceptance is independently demonstrated; restoring an audited read alone does not prove alert delivery.

This is a scope amendment to the single-operation contract, not a proposal to accept the missing reader. All Home and launch gates retain their current status.
