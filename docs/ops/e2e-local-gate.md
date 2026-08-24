# The §11.4-3 walkthrough — the local gate protocol (ADR-0015 F11)

The 11-step Playwright walkthrough (`e2e/onboarding.spec.ts`) is a LOCAL
gate by deliberate decision (ADR-0014, ratified at round 10): it needs
the full live stack and real browsers, and CI carries the vitest step
instead. Round-10 finding 11 ruled the gate stays local **but stops being
informal** — this is the reproducible protocol, and every recorded gate
run follows it.

**Slice 3 (D7, Q3 ruling) adds the browser a11y leg** —
`e2e/a11y.spec.ts` — to the same gate run: per existing route, axe at
WCAG 2.2 AA with color-contrast ON (the jsdom CI leg runs contrast OFF;
D1's arithmetic owns the token pairs), the 390px phone-primary pass with
no horizontal scroll, the ≥44px touch-target audit including every ×
glyph, reduced-motion emulation asserting no running infinite animation
(with the positive control that the styleguide pulse runs WITHOUT the
preference), and keyboard traversal of sign-in and setup step 1. The
§8.7 `--faint`/`--label` redundancy exemption is a named exclusion list
in the spec (`CONTRAST_EXEMPT`) — G12 re-audits each use. One
`npx playwright test --trace on` runs both specs; the walkthrough's 11
steps stay the regression instrument, the a11y leg is this slice's new
surface.

**Slice 4 (B9) adds the ingestion leg** — `e2e/ingestion.spec.ts` — to
the same gate run: founder → verified → forwarding active (FWD-01),
the TUS upload through store/scan/gate to its honest label (UPL-01),
the artifact route streaming the clean original with ONE 404 shape
(RLS-10 at HTTP depth), the synthetic signed webhook → held → accept →
release (INB-01/SAU-01/SND-02), EICAR quarantined ≠ scan_unavailable
LIVE (SCN-01), the duplicate suspect resolved by a person with the
relay finishing the job (DUP-01 + RLY-01), cancel, and the Q6 cliff
probed from a family-tier member's live session. The walkthrough's 11
steps and the a11y leg stay the regression instrument, unchanged.

**Slice 5 (5B B9) adds the extraction leg** — `e2e/extraction.spec.ts` — to
the same gate run: upload → store → scan → gate → extract → interpret →
`Needs you` on screen (WRK-02), with the run row published and every
field high-risk because no bands are signed; a REFUSAL fixture →
`Couldn't read it` with the artifact **still viewable** and the word
"unsafe" nowhere on the page (§6.8); an encrypted fixture → `Needs a
password`; and the stage-2 pair — same provider, same date, different
bytes — suspected, citing the FILED document through `ProvenanceLine`,
with both resolutions live (DUP-02). The walkthrough's 11 steps, the
a11y leg and the ingestion leg stay the regression instrument,
unchanged.

**The gate stack gains a third container-shaped prerequisite: the
Anthropic FIXTURE SERVER.** `playwright.config.ts` starts it as a second
`webServer` on 8787 and points the dev server's `ANTHROPIC_BASE_URL` at
it, so the extraction leg exercises the real adapter against a local
Messages-API shape and **no credential is involved anywhere in the
gate** — G9/G3's standing constraint as a deployment fact rather than a
promise. If port 8787 is taken, the gate fails at startup rather than
silently reaching for a provider.

## Prerequisites (hermetic startup)

```
npx supabase start          # DB 54342 · API 54341 · Mailpit 54344
npm run db:reset            # clean leg — exact 59 migrations (5A)
node scripts/verify-migration-state.mjs supabase/migrations
docker run -d --name hc_clamd -p 3310:3310 clamav/clamav:stable
                            # the B9 gate stack's scanner (§1.6): wait
                            # for "socket found, clamd started" in
                            # `docker logs hc_clamd` (~1–3 min first
                            # run) or the EICAR leg reads unavailable
                            # 5B: the Anthropic fixture server needs no
                            # command here — playwright starts it as a
                            # second webServer on 8787. Confirm the port
                            # is free; `node scripts/ai-fixture-server.mjs`
                            # runs it by hand if you want to watch it.
```

- **`npm run db:reset` expects exact 60 migrations at 5B** (the 5A
  increment merged; 5B is app-only and touches nothing under
  `supabase/`).

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
- Memory-bounded hosts (≤ 8 GB with Docker Desktop): start the stack
  LEAN or the run degrades uniformly (~3×) and legs die by timeout at
  whatever step is heaviest —
  `supabase start -x "studio,meta,realtime,edge-runtime,functions,analytics,vector" --ignore-health-check`.
  **In PowerShell the `-x` list MUST be quoted**: unquoted commas
  split it into separate arguments and every exclusion silently
  fails (the full stack starts and nothing warns). The degradation
  signature is successful responses arriving after ~90 s with zero
  DB lock involvement — classify against available RAM before
  blaming a leg.

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
