import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The app-layer test surface (2B): config pins, lib/db factory contracts,
// the AC-AUTH-8 snapshot, and route byte-identity tests. DB-backed tests
// (tests/db/**) expect the local stack from `supabase db start` on the
// same URL convention as scripts/concurrency/run.mjs.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws outside a React Server environment by design;
      // tests import server modules directly, so it is stubbed to a no-op.
      'server-only': path.resolve(__dirname, 'tests/setup/server-only-stub.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    // One worker: DB-backed tests share the local stack's state.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
