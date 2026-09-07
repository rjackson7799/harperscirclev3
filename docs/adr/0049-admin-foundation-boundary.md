# ADR-0049 — audited Admin reads and live auth state

Owner authorization: after `c4a561c`, the owner replied “continue” to the explicit request to implement the proposed Admin boundary with at most two database migrations and no deployment. This authorizes the narrower metadata-access contract; it does not close Home or waive evidence.

## Decision

Replace direct `hc_admin` SELECT on metadata views, including defaults, with one individually granted `admin_ops.read_platform_stats(uuid)` operation. Its owner remains `hc_internal`; existing safe view definitions and content-dependency checks remain binding. Export, deletion, suspension, transfer, recovery operations and circle-detail reads are excluded.

Use postgres-owned, non-request-callable triggers to synchronously refresh nonsecret state for registered operators from auth sessions and MFA factors. Family identities without an operator anchor are not mirrored. Operator registration backfills existing state; revocation/removal and relevant account changes serialize on the same anchor. The reader locks the anchor before evaluating current registration, account state, session, verified bound factor and expiration. It does not lock auth rows, which would invert writer lock order. Only read-committed transactions are admitted.

The application verifies a single captured token with both signature and live-user checks. It exposes one named read method, establishes transaction-local role and identity, and returns counts only after audit commit. Database context is trusted-server input, not a cryptographic signature; compromise of the deployment credential remains outside the impersonation claim. No raw SQL/provider failures or tokens are returned or included in the audit.

The audit is append-only to the definer role. An authorization denial is returned as a value so its audit can commit. An audit/commit failure yields no application counts; an uncertain commit is not retried internally. Fresh server request IDs distinguish repeated attempts. Counts come only from the pre-existing platform_stats view. No browser route is enabled in this increment.

## Bounds and proof

Two draft, forward-only migration files consume the approved ceiling: `20260907120001_admin_auth_state.sql` and `20260907120002_admin_audited_read.sql`. No dependencies, reserve, hosted migration or production deployment. The first isolated attempt at M1 failed before any schema statement because LOCK TABLE needed an explicit transaction; both draft migrations now explicitly BEGIN/COMMIT. These files have not shipped to staging or production.

Feasibility: isolated SQL lifecycle and real MFA/concurrency prototype evidence are recorded in `docs/ops/isolated-admin-ci.md`. Application RED: eight adapter tests at `ef35700`; GREEN: 25 targeted Admin read/session tests after the replacement. Database RED at `a2fb9a8`: `unaudited_metadata_select_still_granted`. Final migration, privilege, upgrade, audit failure, concurrency and browser acceptance must be recorded separately against the final source. None is inferred from prototype success.
