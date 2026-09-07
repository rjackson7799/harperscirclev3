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
