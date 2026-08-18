# The §11.4-3 walkthrough — the local gate protocol (ADR-0015 F11)

The 11-step Playwright walkthrough (`e2e/onboarding.spec.ts`) is a LOCAL
gate by deliberate decision (ADR-0014, ratified at round 10): it needs
the full live stack and real browsers, and CI carries the vitest step
instead. Round-10 finding 11 ruled the gate stays local **but stops being
informal** — this is the reproducible protocol, and every recorded gate
run follows it.

## Prerequisites (hermetic startup)

```
npx supabase start          # DB 54342 · API 54341 · Mailpit 54344
npm run db:reset            # 46 migrations, clean leg
node scripts/verify-migration-state.mjs supabase/migrations
```

- Node 22.15.0 / npm 10.9.2 (`.nvmrc`); browsers via
  `npx playwright install chromium` once.
- No `.env.local` is required: `playwright.config.ts` carries the full
  webServer env (local demo keys, `HC_DB_URL`) and starts `npm run dev`
  itself (`reuseExistingServer: true` — a dev server you already have
  running is reused, so kill stale ones when in doubt).
- Mailpit needs no configuration; the walkthrough reads verification
  mail through its API at 54344.
- Known post-reset quirk: `supabase db reset` restarts containers and
  Kong can briefly 502 the auth upstream; if the first run fails on
  auth calls, `docker restart supabase_kong_<project>` and re-run.

## The gate run

```
npx playwright test --trace on
```

- **Retained artifacts:** `--trace on` writes a trace per test into
  `test-results/`; the config additionally retains trace + screenshot on
  failure for ANY run. A recorded gate run keeps its `test-results/`
  directory (and `playwright-report/` if generated) alongside the run
  record — vault-side, since the repo ignores them.
- **Record:** SHA, date, runner, pass count, and the artifact location —
  one line in the review packet or vault status.

## Flake policy

- The budget is per-test 120 s precisely so dev-server cold compiles are
  not flakes; `workers: 1` keeps the stack serialized.
- A failed step is re-run AT MOST once, and only after classifying the
  failure from the retained trace (infrastructure — e.g. the Kong 502
  above — vs product). A product failure is never re-run to green: it is
  a finding.
- Two consecutive failed gate runs at one SHA = the gate is RED at that
  SHA, whatever a third run says.

## Scope

11 steps, §11.4 item 3: founder cold start → two subjects with divergent
situations/zips → seq-1 custodianship declarations (DB-asserted) →
abandon/resume at step 3 → completion (ADR-0011 addresses, inactive
unverified state, AC-AUTH-5 absences) → real mail-click verification →
invite at summary-only with the ceiling → invitee to Timeline in two
taps → AC-AUTH-11 → AC-PERM-3 from a live second context → AC-AUTH-10
from a second browser. The walkthrough re-runs at every head whose
`app/`, `lib/`, `e2e/` or `supabase/` tree changed (the ADR-0015 F12
binding rule); docs-only heads inherit the recorded run.
