import { defineConfig } from '@playwright/test';

/**
 * A9 · The E2E walkthrough harness (TSD §11.4 item 3).
 *
 * Local-first by design: it drives the real app against the running
 * `supabase start` stack (DB 54342, API 54341, Mailpit 54344), the clamd
 * container, and — from 5B — the Anthropic fixture server on 8787, and is NOT
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
    // Round-10 finding 11: every gate run leaves inspectable artifacts —
    // trace + screenshot retained on failure; a RECORDED gate run uses
    // `--trace on` per docs/ops/e2e-local-gate.md and retains the report.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // 5B B9: TWO servers. The Anthropic FIXTURE SERVER comes up first and the
  // dev server is pointed at it, so the extraction leg exercises the real
  // adapter against a local Messages-API shape and NO credential is involved
  // anywhere in the gate (G9/G3's standing constraint, made a deployment fact
  // rather than a promise).
  //
  // 6B (ADR-0025 D8 condition 4): `reuseExistingServer: false` on BOTH.
  // Reusing a server someone else started adopts it WITHOUT this config's
  // env block — the 6A gate's run 1 adopted a peer session's dev server that
  // carried no service-role key, and the only symptom was "Uploading is not
  // available for this person.", a product-sounding string three layers from
  // its cause. Such a run is INVALID, not flaky. A stale server on either
  // port now fails the gate AT STARTUP, in the config's own words, which is
  // the honest exit (docs/ops/e2e-local-gate.md: confirm the ports are free).
  webServer: [
    {
      command: 'node scripts/ai-fixture-server.mjs --port 8787',
      url: 'http://127.0.0.1:8787/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/sign-in',
    reuseExistingServer: false,
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
      // B8: the walkthrough runs with production's credential shape —
      // the request path on hc_runtime, the two-op maintenance boundary
      // and the evidentiary append on the maintenance identity.
      HC_DB_URL: 'postgresql://hc_runtime_login:postgres@127.0.0.1:54342/postgres',
      HC_MAINTENANCE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54342/postgres',
      HC_PIPELINE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54342/postgres',
      HC_WORKER_KEY: 'local-gate-worker-key-0123456789abcdef0123456789abcdef',
      POSTMARK_INBOUND_SECRET: 'local-gate-inbound-secret-0123456789abcdef0123456789',
      HC_AUTHSERV_ID: 'inbound.harperscircle.app',
      HC_TRUSTED_HOP: 'inbound.harperscircle.app',
      // B9: the canonical origin, config-first — the dev server's own
      // origin is `localhost`, which GoTrue's 127.0.0.1 allow-list
      // silently refuses (the recorded localhost/127.0.0.1 trap).
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
      // 5B B9: the adapter's STANDARD base-URL config, pointed at the fixture
      // server. The adapter never branches on environment; this is the whole
      // mechanism. The key is a placeholder string, not a credential.
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787',
      ANTHROPIC_API_KEY: 'local-gate-fixture-not-a-credential',
    },
  },
  ],
});
