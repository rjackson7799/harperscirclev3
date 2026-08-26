# ADR-0028 — round-19 dispositions: the three findings from the 6B browser gate

**Status:** **proposed.** The dispositions record for round 19. The owner
ratifies at sign-off, which is its own session, and the merge is its own
session after that. **Nothing here is ratified, and ADR-0027 remains
`proposed — BLOCKED at sign-off`.**

**AMENDED BY ROUND 20**, which took the re-run D8 item 4 owed and added D11 and
D12. The gate at `1066e2d` is now **GREEN, 38/38** (D7). **That does not ratify
anything here** — a green gate discharges an owed run; it does not turn a
drafted disposition into a settled one, and D10 items 2 and 3 are still open.

**Deciders:** the round-19 fix + dispositions session (owner ratifies at
sign-off).

**Date:** 2026-08-26

**Context:** Round 19's findings did not come from a review packet. They came
from the **38-leg browser gate run `r2`**, taken at `4f242f5` during the
round-18 owner sign-off session — the run ADR-0027 D19 had recorded as OWED.
It came back **RED (`3 failed, 35 passed`, 21.6 m)**, sign-off did not proceed,
and the three failures were classified from preserved evidence and landed
**verbatim** at `docs/review/round-19-findings.md` (`7aecd80`, corrected at
`d6c2d09`) before a word of them was argued here — the `5faccc4` / ADR-0023
precedent, restated at ADR-0025, round 17 and ADR-0027.

**The numbering:** ADR-0027 is round 18's dispositions record, so this is
ADR-0028 — the next free number against `docs/adr/` at write time.

**The increment this document authorises: NONE in the database.** The
migration budget is **7 of ≤ 7 spent** and this round does not ask the owner to
reopen it. Every fix below is app-layer or test-layer. **One fix that the
round identified is NOT taken here and is escalated instead** — see D3 and D10.

---

## D0 — how these dispositions were reached, and what each rule changed

Three rules governed this round. Each changed an outcome, which is the only
reason to write them down.

**1. A FINDING'S MECHANISM IS PROVEN, NEVER INHERITED.** The brief for this
session named a leading candidate for F-2 (`enable_refresh_token_rotation`
with `refresh_token_reuse_interval = 10`) and instructed: *prove the mechanism
before fixing it.* The proof was attempted and it **refuted the candidate**
(D1). The same rule applied to F-1 overturned a localisation that three
documents were carrying (D3). A round that had taken either at its word would
have shipped a fix for a mechanism that is not there.

**2. A NAME IS A CLAIM, AND A CLAIM GETS CHECKED.** `lib/http/budget.ts`
recorded that the artifact route's stall lives in *"the DB reads and the
signed-URL hop"*. That sentence was never measured. Round 19 measured it —
those hops are **15–30 ms**, and 239 ms at fifty concurrent. The name was
wrong, and **being wrong is why round 18's fix "bounded and NAMED the stall"
and the stall survived it.** This is ADR-0027 D0 rule 1 (enumeration is
re-derived) applied to a diagnosis rather than to a finding.

**3. WHERE THE FIX EXCEEDS THE SESSION'S REMIT, SAY SO INSTEAD OF SHRINKING
THE FINDING.** The brief set this pattern for DDL: *if F-1's fix appears to
need DDL, STOP and say so — that is an owner amendment, not your call.* F-1's
product fix does not need DDL. It needs something larger: moving §6.3 render
and §6.9 OCR out of the process that serves the family's screens. It is
escalated in D10 rather than attempted, and the finding is **not** re-scoped to
match what was convenient to fix.

---

## D1 — ACCEPTED, mechanism AMENDED, the leading candidate REFUTED, and FIXED: the session gate rendered an OUTAGE as a SIGN-OUT (F-2)

**The finding.** The gate founder's session answered `401` from
`POST /api/upload/token` at roughly 22:01, about six minutes after it was
provisioned at 21:54:48. Its four calls across legs 32–35 read
`200 · 200 · 200 · 401`. Leg 35 (REV-02) died in the shared upload fixture on
`Uploading is not available for this person.`

**The candidate, and why it is REFUTED.** The findings and this session's brief
both named refresh-token rotation: concurrent refreshes outside the ten-second
`refresh_token_reuse_interval` trip GoTrue's reuse detection, which revokes the
session family — a shape that matches "three successes then an abrupt 401".
The preserved REV-02 trace refutes it on two independent grounds.

```
  356.2s  200  POST  15165ms  /api/upload/token
  420.9s  200  GET    2439ms  /<circle>/upload      <- the SIGNED-IN shell
  426.9s  401  POST  24307ms  /api/upload/token
```

1. **`app/(app)/[circle]/upload/page.tsx` REDIRECTS to `/sign-in` when
   `claims?.sub` is absent.** It answered **200** with the signed-in shell
   **six seconds before** the 401. GoTrue's reuse detection revokes a session
   family permanently. **A revoked session cannot un-revoke.**
2. **The refused call took 24.3 seconds.** A revoked session answers fast.
   Nothing about *"you are not signed in"* takes twenty-four seconds.

The session was live. **Reading it failed.**

**The actual cause, which is one line.** `liveSessionClaims` was
`if (error || !userData?.user) return null` — and `null` is the shape of
*"there is no session"*. Every failure of `getUser()` produced it: a refused
socket (which supabase-js wraps as `AuthRetryableFetchError`), a 5xx from Kong,
a 429 on `token_refresh` (150 per five minutes per IP, shared by every browser
context a gate runs), and anything unclassifiable. `getClaims()`'s error was
discarded outright. **Twenty call sites read that null as the signed-out
answer** — twelve pages redirect to `/sign-in`, eight routes refuse.

**This round already settled the principle one layer up.** ADR-0027 D2:
*"a session the route could not READ in time is not a session that does not
exist, and the difference is the only thing the caller needs: WHETHER TO TRY
AGAIN."* That fix bounded the **wait**. It could not name the **fault**,
because this function had already thrown the reason away — and a `getUser()`
that fails *fast* never reaches the budget at all.

**CLASSIFICATION AMENDED. The findings recorded F-2 as an INSTRUMENT defect —
"a gate-fixture session-lifetime defect, surfaced through a product route".
It is a PRODUCT defect.** There is no fixture in the mechanism. Any family, on
any auth-server hiccup, is told they are signed out of their own record. The
gate was the observer, not the cause.

**The fix.** `readLiveSession` returns three outcomes, and the rule is **ONLY
AN AUTHENTICATION ANSWER MEANS SIGNED OUT** — `AuthSessionMissingError` and a
4xx that is not 429. A fault is not an authentication answer, and neither is
silence.

| Site | Was | Is |
|---|---|---|
| `lib/auth/session.ts` | `null` for every failure, silently | `signed-in` / `signed-out` / `unavailable`, and `liveSessionClaims` keeps its two-outcome contract but LOGS the fault |
| `lib/http/session-unavailable.ts` | — | the ONE shape: `503 session_unavailable`, `retry-after: 5`, `private, no-store` |
| `api/upload/token`, `api/upload/complete` | `401 sign in first` | `503` — the 401 stays exactly as strict for the answer it is actually for |
| `api/artifact/[id]` | the ONE 404 | `503`, with its own **no-oracle control**: the fault is decided by the auth server's health and never by the row, so it answers identically for a row that exists and one that does not |
| `upload/upload-form.tsx` | *"Uploading is not available for this person."* | *"We couldn't reach your account just now."* — the old sentence is about PERMISSION and its honest reading is *stop trying* |

At `/api/upload/complete` the distinction is load-bearing: **the bytes are
already staged**, so a false "sign in first" throws away an upload that
succeeded.

**Red → green.** `tests/app/session.test.ts` 12 failed | 2 passed → 14 passed;
`tests/routes/upload.test.ts` 5 failed → 22 passed
(`expected 200 to be 503`); `tests/routes/artifact.test.ts` 8 failed → 42
passed (`expected [ 200, 404, 404, 404 ] to deeply equal [ 404, 404, 404, 404 ]`);
`tests/app/upload-form.test.tsx` 1 failed → 2 passed
(`expected 'Uploading is not available for this p…' not to match
/not available for this person/i`). Commit `4613b7c`.

**WHAT THIS FIX DOES NOT DO, AND IT MATTERS FOR READING D7.** It corrects what
the product **says**; it does not remove the **stall** that provoked the
saying. The stall is F-1's, and F-1's product fix is escalated (D3, D10). Leg
35's fixture asserts `[role="status"]` contains `'is in'` — the success
sentence — so if the auth hop stalls again at that leg, a `503` fails it
exactly as the `401` did. **The leg does not go green because a lie became
honest.** What changes is that the gate now says *the auth hop could not be
read* instead of *this founder is not signed in*, which is the difference
between one signal and a wrong one.

**Not taken, and named rather than smuggled in:** the form does **not**
auto-retry on `503`. A retry policy is a design decision the finding does not
reach, and automatic retries during an availability incident amplify the very
load that caused it. `retry-after: 5` states the server's advice and leaves the
decision where it belongs.

**OWED, and deliberately not taken.** The twelve PAGE gates still render an
outage as a sign-in redirect. Same harm; the r2 gate did not observe it, and
changing twelve page gates on an unobserved inference is wider than the finding
supports. Recorded in `lib/auth/session.ts` at its site, and in D8.

---

## D2 — ACCEPTED as a cascade, NO separate fix, and the prediction is TESTED rather than asserted (F-3)

**The finding.** Leg 36 (AC-INBOX-8) failed on the fixture's own guard — *"the
verification click did not verify THIS founder"* — with **zero non-2xx
responses in its trace**. Nothing in the product refused anything.

**Mechanism, confirmed at its site.** `e2e/review.spec.ts:38-39`:

```ts
const stamp = Date.now();
const FOUNDER_EMAIL = `review.founder.${stamp}@example.com`;
```

Playwright restarts the worker after a failure. That re-evaluates the
module, which mints a **new** `FOUNDER_EMAIL`, which forces a **fresh**
`provisionFounder` — a full create-account, four setup steps and a mail
round-trip — in the middle of a gate. The Mailpit timeline confirms it: three
`review.founder.*` addresses at 21:54:48, 22:04:14 and 22:06:19, being the
initial provision plus one per failure.

**Disposition: ACCEPTED as F-2's wake, and NOT fixed independently.** The
finding's own substance is that **one failing leg manufactures further
failures downstream**, so a gate tally over-reports the number of independent
defects. The correct response to a cascade is to remove its head, not to patch
its tail. F-2's fix removes the head.

**This is a prediction, and D7 records what the gate returned. It is a
CONDITIONAL prediction, and the condition is stated so the result cannot be
mis-read either way:**

- **If leg 35 passes and leg 36 passes** — the cascade is confirmed as F-2's
  wake and both are closed.
- **If leg 35 fails and leg 36 fails with a clean trace** — the cascade is
  still confirmed; leg 36 is telling us nothing new, because F-2's fix
  corrects the SENTENCE and not the STALL (D1), so leg 35 can still fail and
  still restart the worker.
- **If leg 35 PASSES and leg 36 fails with a clean trace** — the cascade has a
  second mechanism, and that is a finding in its own right.

Only the third outcome reopens F-3.

---

## D3 — ACCEPTED, the LOCALISATION OVERTURNED, the instrument FIXED, and the product fix ESCALATED (F-1)

**The finding stands and is not softened.** The artifact route does not answer
within its own fifteen-second budget under gate load, leg 38 has now failed
this way in gate runs `r6`, `r7` and `r2`, and round 18's F6 fix (ADR-0026 D20)
corrected the **reporting** of the stall without removing it. It is the
slice's principal open defect.

**What was accused.** `lib/http/budget.ts`'s own header localised the stall to
*"the DB reads and the signed-URL hop"*. ADR-0027 D19, the round-19 findings
and this session's brief all carried it forward.

**What the measurements say.** Every accused hop was timed against the **live
stack**, out of process, using the rollback-only probe pattern for the write so
nothing was written and no `db:reset` was needed:

| Hop | At rest | Under load |
|---|---|---|
| `readableArtifact` / `readableRendition` / `logArtifactRead` | p50 **15–20 ms** | **50 concurrent**: p50 32 ms, p90 47 ms, **max 239 ms, zero errors**; connection acquire p50 **0.0 ms** |
| `GET /auth/v1/user` through Kong (`liveSessionClaims` makes TWO) | p50 **96–121 ms** | 25 concurrent: p50 532 ms · **full 8-core saturation**: p50 669 ms, max 1162 ms |

**Not one of them is fifteen seconds.** Saturating every core moves the stack
by **5–13×**; the stall needs roughly **150×**. The time is not being spent in
the stack.

**D1 IS RULED OUT EVERYWHERE, which closes the round's open question (b).**
The brief asked whether the `500 unavailable` on the `text=1` path was D1's
5 s connect rejection surfacing through the route's catch. It is not, and
`r2`'s own server log says so verbatim:

```
[WebServer] artifact: readableArtifact: the route's 15000 ms answer budget was spent
[WebServer] artifact: access-log write failed: logArtifactRead: the route's 15000 ms answer budget was spent
```

Both are `AnswerBudgetExceeded`. A connect rejection is a different throw with
a different message, and the probe measures acquire at **0.0 ms** under fifty
concurrent. **ADR-0027 D19's suspicion of D1 is settled NEGATIVE.**

**THE NAME WAS THE DEFECT.** The budget is SHARED and spent down across the
request, so an overrun carries the name of whichever call was racing when the
timer fired. **A route that spends 14.9 s in hop one and 12 ms in hop two
blames HOP TWO.** `readableArtifact` was never a claim about where the time
went, and reading it as one is why the stall survived a fix that "named" it.

**Where the time actually goes.** The §6.3 render pass and the §6.9 OCR pass
run **inline in `app/api/worker/[stage]`** — the same Node process that serves
the family's screens — and `@napi-rs/canvas` raster + PNG encode is a
**synchronous native call**. Measured on this host with a 20 ms heartbeat
running throughout:

| Work | Timer ticks during | Longest block |
|---|---|---|
| control: idle 2 s | 71 | 38 ms |
| 2576² raster + PNG encode ×1 | **0** | 307 ms |
| 2576² raster + PNG encode ×4 | **0** | 1739 ms |
| 2576² raster + PNG encode ×10 | **0** | 3428 ms |
| real pdfjs render of a fixture page + encode | **1** | 576 ms (**99 % blocked**) |

**Zero ticks.** For 99–100 % of that work nothing else in the process runs — no
pg callback, no fetch callback, **and not the answer budget's own
`setTimeout`.** That is why `r2`'s leg-38 504 took **19.5 s against a 15 s
budget**: the guarantee is a timer inside the very process that gets frozen.
It is also why leg 35's `/api/upload/token` took 15.2 s and 24.3 s — a route
whose entire body is two auth round-trips the probe clocks at ~100 ms each.

**What was FIXED here — the budget stops lying about the cause.**

- **`HopCost` ledger.** Every raced call records what it cost and whether it
  finished, and the overrun carries the whole ledger:
  `readableArtifact: … budget was spent — readLiveSession 14900ms,
  readableArtifact 100ms (unfinished)`.
- **Starvation.** The timer measures its own lateness. A socket cannot make a
  `setTimeout` seconds late; only a frozen loop can. Past
  `STARVATION_FLOOR_MS` the message says so: *"the budget's own timer fired
  4500 ms LATE, so this process was BLOCKED rather than waiting — the time is
  not in these hops."* Its limit is stated in the file: one sample, so it sees
  only blocking that overlaps the deadline; blocking earlier in the window
  shows up as inflated hop costs in the ledger instead.
- **The header no longer carries the false localisation.** It carries the
  measurements and says which sentence was wrong.

**Red → green.** `tests/http/budget.test.ts` 5 failed | 4 passed → 9 passed
(`expected 'readableArtifact: the route's 15000 …' to match /readLiveSession/`).
The four that passed from the start are the guarantees F5/F6/D3 already won;
they had to keep passing, and they did. Commit `6aa6c6d`.

**WHAT THIS DOES NOT DO, stated rather than claimed away: it does not remove
the stall.** See D10.

---

## D4 — what this round corrected in its own source documents

**1. `docs/review/round-19-findings.md` — the `text=1` answer.** The findings
record `500 GET …&text=1 → unavailable`. The preserved browser trace shows
status **−1, NEVER ANSWERED**, exactly as in `r6`/`r7`; the leg's own page
snapshot still reads *"Reading…"*. The 500 is real, but it is in the **server**
log, not the browser's — the test's fifteen-second `toContainText` expired at
about 15 s and the context was torn down before the route's own budget could
answer at ~19.5 s. Both halves matter: the route did answer 500, and **the
caller never saw it.**

**2. `lib/http/budget.ts` — the localisation.** Overturned by measurement in
D3. Corrected at its site.

**3. ADR-0027 D19 — the D1 discriminator.** Recorded as *"the re-run is its
discriminator"*. It ran, and the answer is negative. D3.

**4. The findings' classification of F-2.** Amended from instrument to
product. D1.

None of these invalidate the documents. They are the round doing to its own
record what D0 rule 2 requires of any claim.

---

## D5 — how the measurements were taken, so they can be re-taken

Every number in D3 came from a standalone probe against the **running local
stack** — no `db:reset`, no writes, no gate.

- **The DB hops** replicate `withRequestRole` exactly: same pool shape
  (`max: 10`, `connectionTimeoutMillis: 5000`), `begin` → `set local
  statement_timeout` → `set local role authenticated` → `set_config
  request.jwt.claims` → the query. Acquire and SQL are timed **separately**,
  which is what shows the pool is not the bottleneck. `hc.log_artifact_read`
  is driven inside `begin … rollback`, so the §10.5 trail is never written —
  the rollback-only probe pattern.
- **Realness check:** every probe asserts `rows = 1`. A probe that silently
  returned zero rows would measure a permission failure and call it speed.
- **The auth hop** is the literal request supabase-js issues, against a
  throwaway confirmed user created and used only for the probe.
- **The load** is a bounded CPU burner across all eight cores, with an idle
  **control before and a recovery sample after** — 121 ms → 669 ms → 126 ms —
  so the degradation is attributable rather than assumed.
- **The blocking** is a 20 ms `setInterval` whose tick timestamps are kept; the
  metric is the **widest gap between ticks**, i.e. how long nothing else in the
  process ran.

---

## D6 — every finding, dispositioned

| # | Severity | Finding | Disposition |
|---|---|---|---|
| **F-1** | MAJOR | the artifact route's `read_timeout` fires under gate load | **ACCEPTED. Localisation OVERTURNED** (not the DB reads, not the signed-URL hop, not D1). **Instrument FIXED** (ledger + starvation). **Product fix ESCALATED** — D3, D10 |
| **F-2** | MODERATE → **PRODUCT** | the gate founder's session becomes 401 | **ACCEPTED, mechanism AMENDED, candidate REFUTED, FIXED** — D1 |
| **F-3** | MINOR | a failed leg re-provisions the founder | **ACCEPTED as F-2's cascade. No separate fix, and CLOSED** — `r3` resolved the prediction on its first branch: legs 35 **and** 36 both passed (D2, D7) |

---

## D7 — evidence at ONE declared head

Every command run **SOLO** (ADR-0027 D5: PowerShell `;` chaining reports only
the last exit code).

| Check | Result |
|---|---|
| `vitest` (`test:app`) | **929 / 929** across **78 files** (was 898 / 75 at `4f242f5`) |
| `lint` (SOLO) | clean |
| `typecheck` (SOLO) | clean |
| `db:reset` / `test:db` / `test:concurrency` | **NOT re-run, on the ADR-0027 D19 reason, re-checked**: this round touches **zero** files under `supabase/` and **zero** under `scripts/concurrency/`. Migrations **69 exact**. Neither suite can observe a JavaScript change |
| **browser gate (38 legs)** | **see below** |

### The gate, run `r3`, TAKEN at `6aa6c6d` — and it is RED

Taken at `6aa6c6d`. HEAD is now `21c60bd`; **the only delta is
`docs/coverage.md`**, which no leg reads. Single worker, `retries = 0`, so an
`x` is an outright failure and never a flake retry. **Tally read from the run's
own output, never from an exit code — a tee masks it** (ADR-0026 D16 item 9):

```
  2 failed
  36 passed (18.4m)
```

**THE GATE IS RED. It is a DIFFERENT red, and the difference is the evidence.**

**All three of `r2`'s failures passed.**

| Leg | Title | `r2` | `r3` |
|---|---|---|---|
| 35 | REV-02 — stale version under an open screen | **FAILED** (the false 401) | **passed** |
| 36 | AC-INBOX-8 — the below-cliff member | **FAILED** (cascade) | **passed** |
| 38 | A11Y-08 / OCR-01 — machine-read text | **FAILED** (504 + 500) | **passed** |

**Leg 38 passing is NOT a claim that F-1 is fixed, and must not be read as
one.** Round 19 changed the artifact route's *diagnosis*, not the
event-loop-blocking work that causes the stall (D3). The stall is
load-dependent and intermittent — it failed leg 38 in `r6`, `r7` and `r2`, and
this host was quieter. **A leg that passes on a quieter host is not a stall
that is gone.** F-1 stays OPEN and D10's decision stands unchanged.

**The two new failures, classified from their retained traces rather than
assumed:**

| Leg | Signal | Class |
|---|---|---|
| 32 (CIT-01 / RCP-01) | `Test timeout of 120000ms exceeded` waiting for `**?decided=1`. **The trace holds ZERO non-2xx/3xx responses**; its final `POST …/decide/submit` is status **−1, never answered**, and the page snapshot is a bare `alert` | resource |
| 33 (AC-INBOX-4 / DEC-01) | `net::ERR_INSUFFICIENT_RESOURCES` on `page.goto`, **before any assertion ran** | resource |

**This is the `r1` signature, and it is the OPPOSITE of `r2`'s.** ADR-0027 D19
recorded `ERR_INSUFFICIENT_RESOURCES` on `page.goto` at `r1`'s legs 9 and 11 as
*"Chromium refusing to allocate, before any assertion ran"* — a category that
exists **before the product is exercised**. In `r2` every failure was
application-level: a 504 with a named body, a 500, a 401 and a fixture guard.
In `r3` neither failure is reachable from anything application code can
produce.

**The host condition was recorded BEFORE the run rather than reconstructed
after it**, which is the only way the F4 lesson can be applied honestly:
**599 MB free of 7931**, against `r2`'s 1004 MB and `r1`'s 148 MB; `.next/`
carried **no `BUILD_ID`** (a dev cache, not the 882 MB production build that
contaminated `r1`); Memory Compression **38 MB** against `r1`'s 615 MB. **The
headroom was named as tight at launch and the run was taken anyway.** That
judgement is on the record here rather than discovered afterwards.

**These are UNREPRODUCED TRANSIENTS. They are not claimed as diagnosed, and
they are not dismissed.** The standing rule permits one re-run after
classification from the trace; that re-run is **OWED**, on a host with
`r2`-level headroom. Until it is taken, `r3` is a RED gate with two
unreproduced resource failures, and **the 6B slice does not merge.**

**And two failures here are at most ONE independent defect.** Leg 32 precedes
leg 33, and F-3's mechanism (D2) means leg 32's failure restarts the worker and
re-provisions the founder for leg 33 — so leg 33 may be leg 32's wake. That the
cascade shape reappears in a run where F-3's own legs passed is evidence *for*
F-3's mechanism, not against it.

**F-3's conditional prediction (D2) is RESOLVED on its FIRST branch:** leg 35
passed **and** leg 36 passed. The cascade is confirmed as F-2's wake, and F-3
is **CLOSED**.

### The permitted re-run, taken at round 20 — `r4` INVALID, `r5` GREEN

D8 item 4 owed exactly one re-run, after classification from the trace, on a
host with headroom. Round 20 took it. **Two runs were started and only the
second is a gate result.**

**Run `r4` is INVALID and is not a tally.** Launched at `1066e2d` on
2026-08-26T07:54:58-10:00 with **887 MB free / 90 MB Memory Compression**
recorded in the log header *before* the first leg. The Docker engine
(`com.docker.backend`) died within seconds of launch, taking all eight
containers with it: the first `AuthRetryableFetchError: fetch failed` /
`status: 0` appears on the line **immediately after leg 1's `ok`**, and every
leg from 2 onward ran against a dead backend, most expiring at exactly the
120 s test timeout. `playwright.config.ts` already states the doctrine for a
run whose backend is not the config's — **such a run is INVALID, not flaky.**
It observed nothing about the product, so it can neither raise a finding nor
spend the permitted re-run. Preserved at `round20-r4/` as `run-INVALID.log`
plus a `README-INVALID.md` naming why its `2 ok / 13 x` must never be cited.
The cause was environmental and is recorded in D11.

**Run `r5` is the re-run, and it is GREEN.** Taken at the same head,
`1066e2d`, launched 2026-08-26T09:07:28-10:00 after the engine was recovered
and `hc_clamd` revived. Pre-launch state recorded BEFORE the run:
**747 MB free of 7931, Memory Compression 122 MB**, 8/8 containers, and
auth · REST · Mailpit each verified **HTTP 200 through Kong** at launch. The
launcher was written to **abort rather than run without a healthy `hc_clamd`**,
and an engine watchdog polled every 30 s throughout.

```
  38 passed (5.1m)
```

**Four independent corroborations, because a green gate deserves more scrutiny
than a red one, not less:**

| Check | Result |
|---|---|
| JSON reporter (never console text — ADR-0026 D16 item 9) | 38 tests, `{"expected":38}`, `errors[] = 0` |
| Failure marks in the log (a failed leg is `x  N`, ONE `x`) | **38 `ok`, 0 `x`** |
| Engine watchdog across the whole run | **8/8 containers at every sample, 0 invalid markers**; free RAM oscillated 379–1052 MB |
| Mailpit provisioning sequence | **8 recipients, strictly a11y → extract → ingest → onboarding → review** |

**The Mailpit sequence is the corroboration that does not depend on reading the
console at all.** It shows exactly **ONE** `review.founder.*` address. In `r2`
there were **three** (21:54:48, 22:04:14, 22:06:19) — F-3's cascade
re-provisioning after each failure. One address is proof that no leg failed and
no worker restarted, arrived at independently of the tally.

**What this SETTLES.** Legs 32 (CIT-01 / RCP-01) and 33 (AC-INBOX-4 / DEC-01)
**passed, at 14.6 s and 37.2 s.** They were classified from their traces as the
`r1` resource class and are now **confirmed UNREPRODUCED TRANSIENTS — they are
not findings, and under the standing rule they are not re-run again.** They did
not reproduce on a host **tighter than `r2`'s** (747 MB against 1004 MB), which
strengthens the classification rather than merely failing to refute it.
**D8 item 4 is DISCHARGED.**

**What this does NOT settle, stated rather than claimed away.**

- **F-1 stays OPEN.** Leg 38 passed at 7.9 s, but it has now passed in `r3` and
  `r5` and failed in `r6`, `r7` and `r2`. D7 already ruled on exactly this
  shape: **a leg that passes on a quieter host is not a stall that is gone.**
  The stall is load-dependent and two passes do not close it.
- **The new ledger never fired.** Grepping `r5` for `AnswerBudgetExceeded`, a
  `HopCost` ledger line or a starvation message returns **zero matches** — no
  budget was overrun anywhere in the run. That is a **null result, not a
  confirmation.** It means the instrument D3 landed has still **not observed the
  mechanism in the running app**, which is precisely the prerequisite D10 item 1
  named for the product fix. The prerequisite remains **unmet**.
- **The runtime drop is cascades, not a quiet host.** `r5` ran 5.1 m against
  `r3`'s 18.4 m and `r2`'s 21.6 m. `r3`'s two failures each cost a 120 s timeout
  plus a worker restart and a full founder re-provision, which accounts for the
  gap: `r3`'s 36 passing legs took roughly what `r5`'s 38 did. **`r5` was not a
  dramatically quieter host than `r3`** — it was a host with no cascades. The
  difference must not be read as evidence about F-1 either way.

**`1066e2d` now carries a GREEN 38-leg gate.** It is the first in the slice's
recorded history — `r6`, `r7`, `r1`, `r2` and `r3` were all red. What that
unlocks is a sign-off question and not this document's to answer.

---

## D8 — OWED

| # | Item | Why it is owed rather than done |
|---|---|---|
| 1 | **Move §6.3 render and §6.9 OCR off the request process** | The product half of F-1. An architecture change to the pipeline's execution model — see D10 |
| 2 | **The twelve PAGE gates still render an outage as a sign-in redirect** | Same harm as F-2's 401; unobserved by `r2`, and twelve page gates is wider than the finding supports (D1) |
| 3 | **The starvation sample is one sample** | It sees only blocking that overlaps the deadline. A heartbeat across the whole window would see all of it, at the cost of a second timer per request |
| 4 | ~~`r3`'s two resource failures re-run once~~ | **DISCHARGED at round 20.** Run `r5` is GREEN, 38/38; legs 32 and 33 passed at 14.6 s and 37.2 s on a host TIGHTER than `r2`'s. Confirmed transients, not findings, and not re-run again (D7) |
| 5 | **Leg 38's pass re-observed under genuine load** | STILL OWED, and round 20 did not discharge it. It has now passed at `r3` and `r5` and failed at `r6`, `r7` and `r2`. Two passes do not close a load-dependent stall, and F-1's product fix is owed regardless (item 1) |
| 5a | **The `HopCost` ledger observed firing in the running app** | NEW at round 20. `r5` overran no budget anywhere — zero `AnswerBudgetExceeded`, zero ledger lines, zero starvation messages. The instrument D3 landed has still never reported on a live stall, and D10 item 1 named exactly that as its prerequisite |
| 6 | The ten items ADR-0027 D17 already owed | Unchanged by this round |
| 7 | The slice-5B queue | **39 OWED**, unchanged |

---

## D9 — the standing pins and gates this round did NOT move

**G4 and G7 still block. The G9 gate STAYS OPEN. `BAND_ARTIFACT_ALLOWLIST`
stays EMPTY. The slice-5B queue stays 39 OWED. RCP-02 stays pending tagged 7.
SIG-01 is NOT absorbed. No real family data anywhere. Migrations 69 exact,
budget 7 of ≤ 7 spent. NOTHING IS PRODUCTION-ACTIVATED.**

---

## D10 — what the owner is being asked to decide

**1. THE ONE THAT MATTERS: authorise moving §6.3 render and §6.9 OCR out of
the request process.**

This is F-1's product fix and this session did not take it. The reasoning is
the same shape as the DDL rule the brief set:

- **It is an architecture change**, not a fix. `@napi-rs/canvas` handles cannot
  cross a thread boundary, so the whole pdfjs + canvas render moves, taking
  with it the engine-location resolution that ADR-0027 D4 has just finished
  fighting.
- **It cannot be validated without a gate**, and a 38-leg gate is a
  twenty-one-minute instrument.
- **Doing it before the ledger has confirmed the mechanism in the running app
  would repeat round 18's exact mistake** — fix first, discover the name was
  wrong afterwards. The ledger is the prerequisite. That is why it landed
  first, and why the gate at this head is the evidence the decision needs.

**2. Ratify or reject the amendment of F-2 from instrument to product**, and
with it the refutation of the refresh-token-rotation candidate (D1).

**3. Ratify or reject the overturning of the stall's localisation** (D3),
which contradicts a sentence in `lib/http/budget.ts`, ADR-0027 D19 and the
round-19 findings.

**4. Note that ADR-0027 is still `proposed — BLOCKED at sign-off`.** Round 19
does not unblock it. It removes one of the three failures at its cause, proves
a second is that failure's wake, and hands the third a correct name.

---

## D11 — round 20: what was put to the owner, and what was ruled

**D10 item 1 was put to the owner and RULED. It is NOT PLANNED this round —
gate first.** The build was therefore **not started**, and no line of the
architecture change was written.

This is a **recorded owner ruling on the build question**, not a ratification
of anything in this document. **ADR-0028 remains `proposed` in full**, ADR-0027
remains `proposed — BLOCKED at sign-off`, and the nine round-18 dispositions
and three round-19 dispositions remain **DRAFTED, not ratified**. The ruling
is narrower than the ADR-0006 default it displaces: the default is *unanswered
→ NOT PLANNED*; here the question was answered.

**The ruling's own reasoning is now corroborated.** D10 item 1's third stated
reason was that building before the ledger confirms the mechanism in the
running app would repeat round 18's mistake. `r5` overran no budget anywhere,
so **the ledger has still never fired on a live stall** (D8 item 5a). The
prerequisite the escalation named is unmet, and holding was the correct call on
the evidence rather than merely a cautious one.

**Items 2 and 3 of D10 were NOT put and remain open for sign-off** — the
amendment of F-2 from instrument to product, and the overturning of the stall's
localisation. Both are ratification questions and belong to the owner's own
session.

## D12 — the environmental defect round 20 paid for, and the trap it earns

**Run `r4` was lost to a Docker engine death, and the cause was advice given in
this build loop, not a product fault.** Reaching gate headroom on this 7.9 GB
host meant closing applications; the closure list named Docker Desktop's window
as safe on the reading that the engine survives it. **On Windows it does not —
quitting Docker Desktop stops the Linux engine**, and with it all eight
containers the gate requires. The stack was verified 8-healthy at 07:43 and was
dead by 07:55.

**The general shape, which is what makes it a trap rather than an anecdote:
freeing memory for the gate and keeping the stack up for the gate point in
OPPOSITE directions on this host.** `vmmemWSL` is the single largest consumer
(2.9 GB) and is also the least closeable thing on the machine.

Recovery required the documented sequence — kill Docker, `wsl --shutdown`,
relaunch — because `docker desktop restart` does not clear the wedge, and
`hc_clamd` had to be revived separately, both exactly as `docs/process/traps.md`
and the cross-project notes already record.

**Two mitigations were built in round 20 and both are now proven, so they
belong in the harness rather than in a brief:**

1. **The launcher waits for `hc_clamd` to report healthy and ABORTS rather than
   starting the gate without it.** A gate that starts before the scan socket is
   up fails ingestion legs for environmental reasons and costs a full run.
2. **An engine watchdog polls container count and free RAM every 30 s for the
   whole run.** `r4` took an hour to reveal itself; with the watchdog the same
   death is caught in seconds and the run is marked INVALID at a known
   timestamp, so which legs were observed against a live stack is never a
   reconstruction.

**Both are OWED into `scripts/` and into the traps file**, and neither is in
this repository yet — they lived in round 20's launcher. Recorded here so the
next session inherits them rather than re-paying for them. Note that
`docs/process/traps.md` does not exist on `slice/6b-care-inbox-app`; it lives on
the peer branch `chore/process-retune`, which is where the trap entry has to
land.
