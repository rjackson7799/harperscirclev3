# Slice 10A — Admin foundation proposal

Status: **owner subsequently approved implementation with at most two migrations and no deployment after `c4a561c`**. The isolated lifecycle capability gate still applies. This is not a statement that Home is closed. Home stays unmerged; its browser, mixed-workload and full integration gates retain their recorded status. See [the ruled contract](slice-10-authorization-contract.md) and [current capability checkpoint](slice-10-capability-checkpoint.md).

## Outcome

Build the smallest useful operator surface: mandatory-MFA access to platform counts and timings, with audit records. An ordinary family session must never gain operator access, even if the middleware redirect is removed. An operator must never gain access to family record content. No real admin account or deployed Admin access is enabled by planning this increment.

## Existing foundation, verified locally

- TSD §11.1 and the ruled Slice 9 plan place Admin after Home; Notifications follows Admin.
- `lib/db/admin.ts` already uses the separate `hc_admin` connection identity.
- Migration `20260816120004_admin_boundary.sql` creates safe metadata views and deliberately leaves `admin_ops` without executable operations.
- `public.admin_users` and the admin/family identity constraints already exist. They are not proof of a working sign-in/MFA lifecycle.
- No Admin application routes were found. Current role-level metadata access alone is not proof of per-operator admission or read auditing.
- PRD §9 requires auditing reads as well as actions; TSD §9 requires both middleware and per-route checks, mandatory MFA, normalized errors and no service-role client.

## Proposed sequence

1. **Resolve and review the authorization contract.** Trace the current account-kind constraints, MFA enrollment/factor removal, session revocation, role factory and metadata grants. Specify how a verified operator identity reaches the database and is rechecked there. Decide how read auditing is enforced, including failures and repeated requests. Do not accept a request-supplied account ID or trust a UI check. Any change to direct metadata grants must be reconciled explicitly with the existing TSD and catalog tests.
2. **Commit failing boundary tests before implementation.** Cover signed-out, family, unenrolled/lower-assurance, revoked and valid operator sessions; removal of the outer route guard; content-bearing columns through nested views/functions; and normalized errors. Prove reads are audited. Identify actual PostgreSQL/MFA checks separately from mocks.
3. **Implement only the foundation and one read-only page.** Use design tokens with a visibly distinct operator shell. Show only existing platform counts/timings supported by safe metadata views. Do not expand metrics by reading family content in application code. No circle-detail route until its family-visible read-audit contract is implemented and tested.
4. **Produce a review packet before any hosted enablement.** Preserve RED/GREEN commits and exact-source evidence. Use the database-free suite for its proper subset. Schema/privilege changes additionally require the existing migration, pgTAP, upgrade, concurrency and database verification checks as applicable; unavailable checks remain blocking, never replaced by mocks. Browser proof remains a separate requirement.

## Bounds and exclusions

Classification: **Tier 1**, because this changes authorization and audit behavior. No dependency additions are proposed. The first implementation kickoff must name the exact migrations and their budget after step 1; this proposal grants **no migration allowance**, and no migration or privileged endpoint is written before that kickoff is concrete. Routine design choices can use the owner's existing delegation within the authorized increment; requirements or permission-boundary changes must be explicit.

Not included: export, deletion, coordinator transfer, suspension, password-reset administration, feedback intake, notification infrastructure, service-role access, real operator enrollment, new services, merge or production activation. The reusable family tester must never be converted to an admin identity; Admin requires a separate identity under the database constraints.

## Owner decision requested

Authorize starting the separate **Admin foundation increment**, initially its authorization contract and failing-test preparation, while Home remains unmerged with its deferred proof visible. This explicitly permits planning the next slice ahead of Home's final disposition; it does not waive Home acceptance, authorize schema changes without a bounded kickoff, or enable privileged access on staging/production.

Recommendation: approve this limited start. It advances product development without pretending that the currently unavailable Home gates have passed. If not approved, keep work within Home's existing scope.
