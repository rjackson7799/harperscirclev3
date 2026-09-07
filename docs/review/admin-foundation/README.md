# Admin admission RED preparation

Source under test: `lib/db/admin.ts` and `lib/db/role-pool.ts` at `7a67c3e`; neither product file changed. Proposed contract: [../slice-10-authorization-contract.md](../slice-10-authorization-contract.md).

Run explicitly from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run --config docs/review/admin-foundation/red.config.ts
```

September 7, 2026 result: **1 expected failure, 1 diagnostic control passed**, Vitest 4.1.10, 383 ms. Failure: `promise resolved "{ rows: [ { circles_total: 7 } ] }" instead of rejecting`. The real factory reached the mocked transport without any operator identity. This establishes the legacy application path, not a database privilege failure or an externally reachable Admin endpoint. No Admin route exists yet. No database, credential or staging fixture was accessed.

The first sandboxed attempt stopped before test collection with `spawn EPERM`; it is not RED evidence. The permitted process retry produced the assertion failure above. Vite also emitted its existing future native-config-loader compatibility warning.

These opt-in tests deliberately live outside the ordinary `tests/**` include. Home's suite is not silently made red by an unapproved authorization amendment. This is test preparation, not complete Admin coverage. The diagnostic control pins the old path only for this baseline and must be removed when the replacement is implemented. At implementation, move the admission regression to the regular suite, test the selected public adapter's normalized refusal, and add all cases in the contract matrix before claiming GREEN. Do not turn this expected failure into a skipped or expected-to-fail acceptance test.
