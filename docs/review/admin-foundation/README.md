# Admin admission RED preparation

Source under test: `lib/db/admin.ts` and `lib/db/role-pool.ts` at `7a67c3e`; neither product file changed. Proposed contract: [../slice-10-authorization-contract.md](../slice-10-authorization-contract.md).

Historical RED command at `c4a561c` (the opt-in files are retired by the replacement adapter):

```powershell
node node_modules/vitest/vitest.mjs run --config docs/review/admin-foundation/red.config.ts
```

September 7, 2026 result: **1 expected failure, 1 diagnostic control passed**, Vitest 4.1.10, 383 ms. Failure: `promise resolved "{ rows: [ { circles_total: 7 } ] }" instead of rejecting`. The real factory reached the mocked transport without any operator identity. This establishes the legacy application path, not a database privilege failure or an externally reachable Admin endpoint. No Admin route exists yet. No database, credential or staging fixture was accessed.

The first sandboxed attempt stopped before test collection with `spawn EPERM`; it is not RED evidence. The permitted process retry produced the assertion failure above. Vite also emitted its existing future native-config-loader compatibility warning.

The replacement is covered in the regular `tests/app/admin-read.test.ts` suite: the factory exposes no arbitrary SQL interface, refuses failed session verification before connecting, and withholds results until audit commit. The obsolete diagnostic that expected the unsafe path was removed, not skipped. This is partial boundary evidence; database and browser acceptance remain separate.
