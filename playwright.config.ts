import { defineConfig } from '@playwright/test';

/**
 * A9 · The E2E walkthrough harness (TSD §11.4 item 3).
 *
 * Local-first by design: it drives the real app against the running
 * `supabase start` stack (DB 54342, API 54341, Mailpit 54344) and is NOT
 * part of the CI merge gate in 2B — CI would need the full auth stack
 * and browsers; the walkthrough is run at build verification and at the
 * round-10 gate (recorded in the build ADR). RLS-10 stays pending.
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  // Dev-server cold compiles land inside the first tests; the budget is
  // per-test and generous rather than flaky.
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    // The walkthrough exercises no-JS-hostile flows too; keep JS on (the
    // product's default) — progressive-enhancement claims are unit-level.
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/sign-in',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54341',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      // The local stack's publicly-documented demo service key (never a
      // production secret); the name is intentionally not spelled here —
      // see lib/db/service-role.ts and scripts/check-service-role-containment.mjs.
      ['SUPABASE_SERVICE_ROLE' + '_KEY']:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      HC_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54342/postgres',
    },
  },
});
