import { configDefaults, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Explicitly deferred integration files: never report these as passed.
// Unexpected PostgreSQL use in the remaining suite fails via the setup guard.
export const databaseTests = [
  "tests/db/factories.test.ts",
  "tests/db/maintenance.test.ts",
  "tests/db/request-role.test.ts",
  "tests/db/runtime-credential.test.ts",
  "tests/hc/artifacts.test.ts",
  "tests/hc/circle.test.ts",
  "tests/hc/documents.test.ts",
  "tests/hc/home-temporal.test.ts",
  "tests/hc/inbox.test.ts",
  "tests/hc/ingest.test.ts",
  "tests/hc/invites.test.ts",
  "tests/hc/people.test.ts",
  "tests/hc/relay.test.ts",
  "tests/hc/review.test.ts",
  "tests/hc/search.test.ts",
  "tests/hc/tasks.test.ts",
  "tests/hc/throttle.test.ts",
  "tests/hc/timeline.test.ts",
  "tests/hc/upload.test.ts",
  "tests/hc/workers.test.ts",
  "tests/permissions/phrases.test.ts",
  "tests/permissions/tiers-snapshot.test.ts"
];

console.info('test:without-db: ' + databaseTests.length + ' database-dependent files deferred; this is not the complete application gate.');

export default mergeConfig(base, {
  test: {
    exclude: [...configDefaults.exclude, ...databaseTests],
    setupFiles: ['./tests/setup/without-db.ts'],
    maxWorkers: 1,
  },
});
