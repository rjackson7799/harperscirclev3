# Setup-to-Home staging smoke — 2026-09-07 UTC

Following the owner's decision to add no further service, this check used only the existing Supabase database and protected Vercel preview. It is HTTP integration evidence and parsed server-rendered HTML, not browser automation or the full gate.

Target: `dpl_D6jKeTX89tqQBoXVqAoXYTUjYjuS` / `harperscirclev3-staging-hxedwrgzt-honu-vibe.vercel.app`, deployed from `a8a4d45` in Oregon. The later local fixture-server changes are not part of this deployment.

## Fresh results

One synthetic founder at a reserved `.invalid` address was created through the actual `/create-account/submit` route, with a generated disposable password. The application session was carried between HTTP requests; no verification stamp or application permission was altered by the test.

| Request/check | Observed result |
|---|---|
| Account creation | 303 to `/setup` |
| Setup entry | 307 to step 1, then 200 |
| Step 1 submission | 303 to step 2 carrying relationship and slice |
| Step 2 submission | 303 to step 3 with a newly created circle |
| Step 3 submission | 303 to step 4 for that circle |
| Completion | 200; parsed HTML offers the exact Home link and verification form, with no invite link |
| Home | 200; parsed main content names Synthetic Nell and labels the forwarding address `Not live yet` |
| Same Home without an application session | 307 to sign-in with the requested Home path preserved |
| Read-only database check | Founder remains unverified, membership is coordinator with five grants, forwarding is inactive, arrivals count is zero |

The synthetic circle is `320eec44-7878-4e41-b384-f3d01f64702e`. Its account/circle remain as clearly synthetic staging data; session cookies and submitted password files were removed by the harness. No mailbox was polled, verification link consumed, account marked verified, uploaded document processed, or delivery success claimed. The app's normal resend attempt is not proof of email delivery.

## Evidence and limits

The handoff workspace retains `staging-setup-smoke.json`, `staging-setup-state.json`, `staging-setup-content-checks.json`, `staging-setup-completion.html`, `staging-setup-home.html`, and `staging-signed-out-home.headers`. All five parsed-HTML assertions passed. The HTTP sequence submitted known route fields directly; it did not exercise JavaScript controls, keyboard navigation, responsive layout or clicking the completion link.

This earns a narrower staging check of unverified setup, coordinator day-one Home and signed-out refusal. It does not discharge OW-32/OW-34/OW-35 or promote coverage: restricted-member variants, operational-error injection, latency and full browser evidence remain separate. No extra host, service or paid upgrade was added. Local application tests retain their existing commit-bound results; they were not rerun for this documentation-only checkpoint.

## Signed-out navigation follow-up — 2026-09-07 08:52 UTC

Six fresh read-only HTTP checks against the same immutable deployment passed: the synthetic circle's Home, Inbox, Tasks, People and Timeline, plus Home for a nonexistent circle identifier. Each returned HTTP 307 to sign-in with the exact requested path preserved, and `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. None of the response bodies contained the synthetic subject's name. The existing and nonexistent Home requests had the same redirect pattern; this limited observation is not a complete enumeration or timing audit.

Evidence: `staging-signed-out-check.json` in the handoff workspace, produced by `staging-signed-out-check.mjs`. Requests used Vercel deployment access but no application session and did not follow redirects. No account, data or credential was created or changed. This checks signed-out navigation and response caching, not authenticated restricted-member authorization. All existing open gates remain pending.

## Signed-in nonmember follow-up — 2026-09-07 09:39 UTC

Created one synthetic outsider through the actual signup route: `hc-outsider-1788773990834@example.invalid`. Signup returned 303 to setup. Without completing setup or assigning any permission, its application session requested the existing synthetic circle's Home and the nonexistent-circle Home used above.

Both returned HTTP 200 with identical parsed main text: `HomeNothing here needs you right now.` Both displayed the caller's account email in the shell, contained no Synthetic Nell text anywhere in the response HTML, rendered no forwarding-address element, and returned private/no-store cache headers. This matches Home's successful empty-read behavior for a caller without membership; it is not a claim of HTTP 403 enforcement or a complete existence/timing audit.

A separate read-only query of `auth.users`, `circle_members` and `circles`, scoped to that synthetic email, confirmed: unverified account, **zero memberships, zero circles created**. No verification stamp or permission was changed. The synthetic account remains in staging; its disposable password and cookie/form/header/body files were removed by the harness.

Evidence: handoff workspace `staging-nonmember-smoke.mjs`, `staging-nonmember-smoke.json`, and `staging-nonmember-state.sql`; database query output is retained in the task's tool record. This adds a signed-in nonmember HTTP case to the earlier coordinator and signed-out cases. It does not cover restricted member tiers, revocation, populated hidden records, operational faults, latency or browser interaction. OW-34 and the existing coverage dispositions remain pending. No product code or deployment changed.

## Restricted tiers and removal — 2026-09-07 10:00 UTC

Two complementary checks now extend the earlier nonmember case:

- `staging-tier-probe.sql` exercised active and removed `care_circle` and `family` membership fixtures in a subtransaction. Reads ran as `authenticated` with the synthetic caller's claims, not as the fixture administrator. Both active tiers resolved their live tier and the one synthetic subject; after removal, both resolved zero active memberships and zero subjects. All fixture writes were rolled back, and zero residual memberships was asserted. The hosted query passed without disabling triggers or changing schema, policies or verification stamps.
- `staging-member-home-smoke.mjs` created `hc-member-1788775233126@example.invalid` through the actual signup route, then used a narrowly scoped synthetic membership fixture for HTTP checks against the same immutable deployment. `care_circle` and `family` each returned 200 with main text `HomeHow Synthetic Nell isAt home, on their own`, no forwarding-address card, and private/no-store headers. After removal, the same signed-in session returned `HomeNothing here needs you right now.` with no subject content. All three cases passed. The fixture membership was deleted and zero remaining memberships was verified; the unverified synthetic account remains. Disposable credentials, session files and temporary SQL were removed.

This proves restricted-tier Home composition and removal for this minimal subject-only fixture over HTTP, complementing the earlier coordinator control. It does not test invitation acceptance, delivery/verification, the browser cache on revocation, or filtering populated tasks, arrivals and events. It does not discharge the full OW-34 browser requirement. Result: `staging-member-home-smoke.json` in the handoff workspace; the transactional probe's result is in the task's tool record.

## Independent browser-runner attempt — 2026-09-07 09:57 UTC

The installed local Playwright runner offers an alternative to the failed interactive-browser attachment without adding a service. A separate read-only staging smoke harness was prepared with one headless browser, an exact-origin deployment-access header, phone viewport, screenshots, overflow and WCAG checks. It does not start local web servers or claim to replace the qualifying nine-file gate.

The attempt stopped before browser launch: free memory was **501 MiB**, below the retained **1.2 GiB** browser floor. Under the shared preflight lease, the seven idle local Supabase containers were temporarily stopped without deletion to attempt to free memory, then all seven were restarted in `finally`; subsequent inspection confirmed recovery. No browser assertion ran. Evidence: `staging-browser-smoke.json` and the task tool record. The local full application suite was not rerun for these evidence-only updates.
