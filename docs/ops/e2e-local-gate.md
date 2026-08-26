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

**Slice 6 (6B) REPAIRS the suite under ADR-0025 D8's six conditions**
(F-5: three 6A gate runs produced three disjoint failure sets, all inside
the suite's own fixtures, ordering or environment):

- **No `test.describe.serial` anywhere.** A serial block converts every
  fragile leg into a coverage hole for everything behind it —
  `ingestion.spec.ts:400`, the live half of two GREEN coverage rows, was
  skipped in all three runs behind unrelated failures. The property is
  the rule: **no failing leg may prevent another leg from executing.**
  Provisioning is memoized per spec, every ingestion/extraction leg is
  runnable BY TITLE alone, and the walkthrough's order-dependent legs
  guard their preconditions with a named expectation instead of a
  TypeError.
- **The cancel leg cancels FIRST, then drives `/api/worker/extract`
  itself.** The pipeline queue is shared and every invocation dispatches
  a batch by each MESSAGE's stage, so "catch the arrival at `extracting`
  before something drains it" is a race (run 2 lost a 108 ms window on a
  1500 ms poll). The repaired leg lets the eager chain rest the arrival
  at `extracting`, cancels, then drains the queued extract work itself
  and asserts nothing was written — §4.5 demonstrated, not raced.
- **Verification clicks verify their inputs.** Every Mailpit pick asserts
  the message is addressed to the account under test before its link is
  used, and the founder provisions assert the click verified THAT
  account — a wrong pick fails at the pick (run 3 failed three layers
  downstream of a wrong-session confirm).
- **`reuseExistingServer: false` on both webServers.** A reused server
  carries none of this config's env; run 1 adopted a peer's dev server
  and produced an INVALID run whose only symptom was a product-sounding
  string. A stale server on 3000 or 8787 now fails the gate at startup.

**Slice 6 (6B B7–B10) adds the REVIEW legs** — `e2e/review.spec.ts` — to
the same gate run, the slice's centre on the live stack:

- **review** — `Needs you` → open → the source renders through the
  artifact fence → selecting a fact highlights its cited region → the
  crop is on screen before approve activates (§6.4) → an approval lands
  through `hc.approve_proposal` → the receipt names the destination and
  the Tasks link RESOLVES (CIT-01, RCP-01 live halves);
- **reject-all** — every item rejected through the surface →
  `nothing_filed`, the AC-INBOX-4 sentence on the receipt, the original
  intact and re-readable, zero `proposal_commits` rows (DEC-01);
- **conflict** — §4.2.5's three outcomes offered with NO default;
  `use_new` supersedes live: the old value retained, marked, and named
  by its successor (CNF-02);
- **stale** — the version moves under an open screen → the approval
  refuses with the NAMED marker and the screen re-renders with what
  changed said in place; nothing lands (REV-02's live half);
- **below-cliff** — a member set to exactly summary×5 sees the row, the
  state and ONE line: no source region, no facts, no review controls,
  and the artifact answers the ghost 404 (AC-INBOX-8);
- **A11Y-07** — full keyboard operation at 390 px AND desktop: Tab
  between facts, Enter selects and MOVES FOCUS to the cited region, and
  the region returns focus to its fact;
- **A11Y-08** — a REAL image-only upload (glyphs drawn by the leg, never
  real family data) grows its `p001.txt` sibling; the screen offers it
  under §6.9's exact label, one control per page, and the transcript
  reads what the page carries (OCR-01).

The walkthrough's 11 steps, the a11y leg (grown at 6B B9 by the Care
Inbox family and recovery-surfaces audits — the R5/F-6 pinned list's
demand), the ingestion leg and the extraction leg stay the regression
instrument, unchanged.

**The targeted run (D8 condition 5).** After a repair to the suite, the
two owed legs are executed BY TITLE and recorded as a **targeted run,
never as a gate result**:

```
npx playwright test e2e/ingestion.spec.ts -g "cancel closes the member window honestly"
npx playwright test e2e/ingestion.spec.ts -g "below the cliff"
```

A round packet may not report a gate result for `e2e/ingestion.spec.ts`
until **below the cliff** has been observed executing (D8 condition 6).
Match it BY TITLE, not by line: the leg was `:400` when D8 was written,
`:574` at the start of the 6B close-out, and `:580` by the end of it —
because F7's fix added six lines of comment above it. **It drifted twice
inside one slice, and the second time was while this very paragraph was
telling you not to trust the number.** A line number in an operational
instruction goes stale silently; the title does not. (The `:400` in the D8
condition list above is HISTORY — where the leg sat when the three 6A runs
skipped it — and stays as written.)

**First observed** in the 6B close-out gate run at `bc3bc85`:
`ingestion.spec.ts` "below the cliff: a family-tier member sees
NOTHING (Q6 probed live)" ran and PASSED (46.1 s), discharging condition 6
and, in the same run, the live half of UXA-01 and RLS-10 — the two rows
ADR-0025 D8's S-2 annotation recorded as never having been observed.

## Prerequisites (hermetic startup)

```
npx supabase start          # DB 54342 · API 54341 · Mailpit 54344
npm run db:reset            # clean leg — exact 69 migrations (6A merged + the 6B slot)
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

- **`npm run db:reset` expects exact 69 migrations at 6B** (the 6A
  increment merged; 6B's one pre-authorised migration slot is SPENT —
  `20260825120001_payload_contract.sql`, the S16.8 residue — and no
  other 6B unit touches `supabase/`).

- Node 22.15.0 / npm 10.9.2 (`.nvmrc`); browsers via
  `npx playwright install chromium` once.
- No `.env.local` is required: `playwright.config.ts` carries the full
  webServer env (local demo keys, `HC_DB_URL`) and starts BOTH servers
  itself. **`reuseExistingServer: false` (6B, ADR-0025 D8 condition 4):**
  a server already on 3000 or 8787 fails the gate at startup — kill stale
  ones first; an adopted server carries none of the config's env and
  produces an INVALID run, not a flaky one.
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
- **Do NOT `db:reset` before a run that is meant to prove a fix to a leg
  that accumulates fixture.** A leg that passes only on the first run after a
  reset is not a passing leg — it is a leg with a hidden precondition, and a
  reset hides it again. 6B's leg 17 counted EICAR's (fixed) sha across the
  whole `quarantine` bucket and so asserted "no gate run has ever run
  before": green at `r6`, red at `r7`, and the difference was a `db:reset`,
  not the code. When a leg fails on a re-run and passed before, **check
  whether the FIXTURE accumulated before blaming the code**
  (ADR-0026 D19). `tests/lint/e2e-fixture-scope.test.ts` now catches the
  shape mechanically.
- An **interrupted** run is not a gate result and is not one of those two —
  but it must be RECORDED as interrupted, with the reason, rather than
  quietly dropped. Stopping a run whose environment has already been
  diagnosed as broken is legitimate; stopping one because its legs are
  failing is not, and the difference is whether you can name the mechanism.

### The vitest suite records itself — read the record, not your memory

**Round-18 F-7.** The fence transient (`a11y-fence`, `db-fence`: the file
fails inside the full parallel run and passes 6/6 or 34/34 alone) has now hit
**six times across two fence files in one slice**, and the fifth could not be
NAMED because that run was not recorded. Q4 queued the transient for
diagnosis; a diagnosis needs data from the occurrence, and the occurrence is
load-dependent, local, and does not reproduce on demand.

So `npm run test:app` writes **`.vitest/run.json`** on every invocation —
every case's name, its **duration**, and its failure message. Nothing to
remember and nothing to opt into.

**It is a reporter, NOT a tee, and that is deliberate.** A tee reports *tee's*
exit status, so a red suite exits 0 — this repo has already paid for that
lesson once (ADR-0026 D16 item 9), and the corrective for one recording gap
must not open a worse one. The JSON reporter leaves the exit code intact:
verified at **exit 1** on a deliberately failed case, with that case's name,
duration and message all present in the file.

**When a fence file goes red, read three things before touching anything:**

1. `.vitest/run.json` → the failing case's **duration**. The signature of this
   transient is a *duration blowout*, not a logic failure: occurrence six was
   `db-fence` → *"an app route importing service-role reds"* at **85 660 ms**
   while the other 65 cases passed.
2. The same file **alone** (`npx vitest run tests/lint/db-fence.test.ts`). If
   it is green in ~12 s, that is the recorded shape, not a defect.
3. Whether anything you changed can reach it at all. These cases drive ESLint
   through its API; a change to neither the ESLint config nor the fenced
   imports cannot make one fail on logic.

Then re-run **once** and record the outcome — including that it passed.
**A transient that is never written down is a transient that is diagnosed
from memory the sixth time.**

### After ANY interrupted run: kill the orphans first

Stopping Playwright kills the parent — **its `webServer` children survive.**
The 6B close-out left five (`next dev` plus its `start-server` at 474 MB,
the fixture server on 8787, the test CLI, a worker) holding ~546 MB and both
ports. Because `reuseExistingServer: false`, those orphans fail the NEXT run
at startup, which reads as a fresh mystery unless you know to look:

```
# PowerShell — find them, then Stop-Process the ones under this repo
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Select-Object ProcessId, CommandLine
```

Then confirm 3000 and 8787 are free before re-running. On a memory-bounded
host this is also the cheapest memory you will ever reclaim.

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
