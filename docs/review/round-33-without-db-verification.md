# Round 33 — verification without Docker

This tooling-only continuation implements the owner's request for faster, less disruptive development. It changes no product route, schema, authorization, dependency, staging fixture or deployment. The complete `test:app` and guarded `verify:local` commands retain their existing scope.

`npm run test:without-db` inherits the application Vitest configuration with one worker. The 22 known live-database files are listed explicitly in `vitest.without-db.config.ts` and reported as deferred at startup. Other matching test files are included automatically. A test-only pg replacement rejects Client/Pool construction with a named error, so an accidentally included database-dependent test fails rather than silently connecting. This is not a general-purpose network sandbox; existing isolated local HTTP/TCP fixture tests remain usable.

## Evidence

- RED at `dfb0b6f`: two safety expectations failed against the original PostgreSQL constructors; neither test connected to a database.
- After implementation: **1,411 tests passed in 90 files**, no failures, in **274.88 seconds**. The separate **22 database-dependent files were not executed**. The JSON report is `.vitest/without-db.json`; the handoff workspace retains `without-db-suite.log` and `without-db-red.log`.
- Whole-tree TypeScript passed. Changed-file lint initially reported one anonymous-default-export warning in the test guard; a named export value corrected it without changing guard behavior.
- No claim of improved elapsed time is made from this run. Its benefit is useful application evidence with Docker off, and explicit preservation of missing database coverage. Resource-heavy checks should continue sequentially.

These are current partial application results, not a replacement for the historical full suite or the remaining aggregate/browser gates. Real-PostgreSQL temporal proof remains separately bound to the query correction. The owner may continue exploring staging; this run did not reset or write its data. No coverage row is promoted and no merge is authorized.

The final configured pg-import probes both passed (2/2), proving the suite setup replaces actual Client/Pool imports. Final changed-file lint passed without warnings. A temporary probe initially had an invalid module path, then merged its include list too broadly; the unintended duplicate run was stopped by exact runner/process ancestry and the narrowed two-test run passed. Those harness attempts do not replace or alter the completed 1,411-test report. Temporary probe files were removed. The final guard differs from the full run only by naming its default-export object; the configured probes cover that final form.
