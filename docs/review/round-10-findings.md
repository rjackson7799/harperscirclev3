# Round 10 — third-party review findings (received 2026-08-18, verbatim)

> Reviewed: round-10 packet at head `d7d9331` (evidence head `9899fe0`;
> CI push run 32168055304, pull_request run 32170360835).
> Verdict: **not approved as written.**
> Dispositions: ADR-0015.

---

I would not approve the plan as written. It is impressively detailed, but it overstates completion in several places and recommends accepting gaps that conflict with its own stated scope.
Blocking findings
1. The step-1 relationship answer is discarded, not “held”
The PRD says the relationship and slice answers are “held until step 2 creates the circle.” However, the step-1 handler only forwards slice; it never reads or carries the relationship value:
- [step 1 submit (line 10)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/app/setup/step/1/submit/route.ts:10)
- [PRD requirement (line 219)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/docs/PRD.md:219)
The packet says the answer is “asked as specified, held, not persisted.” “Held” is factually incorrect. This is more than a missing long-term schema slot: the value disappears immediately between steps.
Recommendation: treat Q12 as a scope deviation requiring an explicit owner ruling. Separate the two decisions:
- Must it survive the step-1 → step-2 transition?
- Must it be durably persisted after circle creation?
A schema decision is only necessary for the latter.
2. A7 is incomplete against the approved slice plan
The slice plan expressly defines A7 as global sign-out plus an access_log entry:
- [slice plan A7 (line 151)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/docs/review/slice-2-plan.md:151)
- [current route (line 12)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/app/account/sign-out-everywhere/route.ts:12)
The route performs only sign-out. The packet recommends calling APP-09b pending and deferring it because it is “not load-bearing,” but it is part of A7’s declared contents. The migration-budget constraint does not automatically amend acceptance scope.
Recommendation: Q11 must ask the owner to do one of these explicitly:
- Amend 2B/A7 to remove the access-log entry from this gate; or
- Amend the migration bound and complete A7 now.
“Pending but accept the whole increment” is not decision-complete without that scope amendment.
3. The wasnt-me retry contract has no demonstrated production invoker
The packet says /api/worker/security-actions is invoked by a deploy-time cron, but there is no deployment scheduler configuration or operational evidence in the repository. The route and queue exist, but eventual execution depends on an external component that is merely described in a comment:
- [worker route (line 8)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/app/api/worker/security-actions/route.ts:8)
- [ADR worker claim (line 84)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/docs/adr/0014-2b-app-increment-deltas.md:84)
This means F3’s “delay, never a loss” conclusion is unproven in production. A durable pending action can remain pending forever.
Recommendation: require a concrete operational owner, cadence, deployment mechanism, secret provisioning procedure, monitoring/alerting, and maximum tolerated age. Until those exist, describe F3 as “durably recoverable” rather than “eventually performed.”
4. The maintenance boundary is an architectural privilege expansion, not a harmless implementation detail
Both request-role.ts and maintenance.ts connect with HC_DB_URL. The application runtime therefore possesses a credential capable of running unrestricted maintenance SQL and SET ROLE:
- [request-role credential (line 45)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/lib/db/request-role.ts:45)
- [maintenance credential (line 23)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/lib/db/maintenance.ts:23)
ESLint import fences constrain source organization, not runtime authority. Any injection, compromised dependency, arbitrary server execution, or accidental new query at this boundary inherits the maintenance credential’s blast radius. “Tests seed accounts this way” is not a production-security precedent.
Four of the six operations are already acknowledged as clean definer candidates. Those operations are load-bearing application writes, so postponing least-privilege replacements weakens the trust model of the entire app increment.
Recommendation: require a threat-model decision for the runtime maintenance credential, including:
- Exact hosted database role and grants—not merely “postgres/maintenance.”
- Whether it is a superuser or owns application/auth objects.
- Credential isolation between migrations, request-role traffic, and maintenance operations.
- Rotation and leak response.
- Why the four public-schema operations cannot be definers before acceptance.
High-priority findings
5. The create-account deviation is broader than “only Set-Cookie differs”
A fresh account receives a live session; an existing account does not. That changes more than a raw response header: following the identical redirect produces authenticated setup for one branch and an unauthenticated result for the other. The account’s resulting browser state is observably different.
The test explicitly removes set-cookie before comparing responses:
- [test snapshot filter (line 50)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/tests/routes/create-account.test.ts:50)
- [create-account flow (line 47)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/app/(auth\)/create-account/submit/route.ts:47)
Recommendation: Q8 should acknowledge the full behavioral distinction and state the threat model under which it is acceptable. The plan should not claim byte-identical non-enumeration without qualifying that authentication state and subsequent navigation differ.
6. Create-account has an unhandled partial-commit problem
The sequence crosses multiple systems without compensation:
1. GoTrue creates the user/session.
2. Direct SQL clears confirmation.
3. Direct SQL bootstraps the account.
4. Resend is attempted.
Failures after step 1 can leave:
- A user created but still falsely confirmed.
- An unconfirmed user without an accounts row.
- A live session whose application bootstrap failed.
- No verification email despite a nominally created account.
The resend call also swallows both thrown failures and returned { error } results.
Recommendation: add an explicit state/recovery matrix and failure-injection tests for each boundary. Define how repeat submission repairs every partial state and whether setup refuses a session lacking its account row.
7. Maintenance writes silently accept zero-row outcomes
setAccountSlice, updateOpeningContext, and unconfirmEmail do not inspect rowCount. For example, a forged or stale circle ID produces zero updates, but step 3 still redirects to step 4:
- [opening-context update (line 76)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/lib/db/maintenance.ts:76)
- [step-3 continuation (line 25)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/app/setup/step/3/submit/route.ts:25)
That makes an authorization refusal or invalid state indistinguishable from successful persistence at the application layer.
Recommendation: require exact affected-row postconditions and tests for stale, foreign, deleted, and already-completed entities.
8. Session revocation is not atomic
revokeAuthSessions performs session deletion and refresh-token revocation as two independent pool queries, potentially on different connections:
- [revokeAuthSessions (line 170)](/C:/Users/HCI/Desktop/Projects/HarpersCirclev3/lib/db/maintenance.ts:170)
A failure between them creates a partial result. It may still be conservatively secure in some cases, but the packet claims the operation as one coherent kill without documenting partial-state behavior.
Recommendation: use or specify a single transaction and verify the exact GoTrue tables/invariants for the pinned version. Also add a live test showing old refresh tokens cannot mint a new session after this operation.
9. Worker concurrency and backlog behavior are unspecified
The worker lists all pending actions, has no claim/lease, no limit, no ordering, and no timeout. Concurrent invocations can process and rotate the same account password repeatedly. A large backlog can exceed the route’s execution window.
Recommendation: define:
- Single-run exclusion or action claiming.
- Batch size and pagination.
- Per-action timeout.
- Retry/backoff and terminal failure policy.
- Idempotency of repeated password rotation.
- Observability for oldest pending action.
Evidence and review-quality gaps
10. Most application tests are boundary mocks, not integration proof
The tests establish call order and response shapes, but several security claims depend on mocked collaborators. The local Playwright walkthrough supplies some live coverage, yet it is neither CI-gated nor attached as reproducible machine evidence.
Recommendation: distinguish clearly among:
- Mocked route contract tests.
- Live database integration tests.
- Live GoTrue tests.
- Browser E2E tests.
Do not describe a mocked call-order assertion as proof that the full boundary works with real authority.
11. The local E2E gate is too informal for a critical acceptance artifact
“11/11 at one SHA” is useful evidence, but the plan lacks:
- A hermetic startup command.
- Seed/reset prerequisites.
- Mailpit and environment configuration.
- Retained trace/video/screenshots.
- A repeatability or flake policy.
- Verification on the actual packet head.
Recommendation: either automate it in CI or define a reproducible manual-gate protocol with retained artifacts and named reviewer attestation.
12. The evidence head is not the review head
Behavior was verified at 9899fe0, while the packet head is later. The packet argues intervening commits are docs-only, which is reasonable, but its final ledger still contains placeholders and vault-side evidence rather than a directly inspectable final-head run.
Recommendation: make review evidence mechanically bind the reviewed tree to the verified application/SQL tree—for example, recorded tree hashes or a CI path-filter assertion—not just prose saying they are unchanged.
13. ADR and packet assertion counts drift
ADR-0014 says 119 Vitest assertions, while the packet says 121. The packet acknowledges this as documentation drift, but a review packet asking ratification should not require the reviewer to decide which evidence count is authoritative.
Recommendation: reconcile evidence metadata before approval and ensure all coverage rows point to the final test inventory.
14. External GoTrue facts need a durable probe artifact
Several central decisions rest on behavior described as “probed”:
- Confirmation gating when confirmations are disabled.
- Password checked before confirmation.
- Refresh behavior for unconfirmed users.
- Lack of a usable per-user admin logout endpoint.
- Direct deletion semantics for GoTrue’s internal tables.
Those facts are version-sensitive and unusually consequential, but the packet does not point to a checked-in executable probe and expected-output fixture.
Recommendation: capture these as repeatable integration tests or a probe script against the pinned image. Re-run them on any GoTrue/Supabase upgrade.
15. The worker key contract is underspecified
A static header comparison is the entire HTTP authentication mechanism. Missing topics include secret length/entropy, rotation, timing-safe comparison, replay protection, source restriction, logging redaction, and deployment ownership.
Recommendation: define this as an operational security control, not merely “key-gated.”
Decisions the packet should force more clearly
The pointed questions often lead the reviewer toward “yes” while omitting the strongest counterargument. For a stricter gate, the reviewer should explicitly rule on:
- Whether incomplete A7 is an approved scope amendment.
- Whether discarded step-1 relationship data satisfies the PRD.
- Whether a production runtime may hold the maintenance/migration credential.
- Whether observable post-redirect authentication state is an accepted enumeration channel.
- Whether “durable but unscheduled” satisfies the wasnt-me kill contract.
- Whether local-only E2E evidence is sufficient for immediate-revocation acceptance.
- What maximum recovery time applies when GoTrue is down.
- Who owns every queued item and at which mandatory gate it must land.
No files were changed.
