# Round 19 — findings from the 6B browser gate at `4f242f5`

**Origin.** These findings do not come from a review packet. They come from
the **38-leg browser gate run (`r2`)** taken at the round-18 final head during
the round-18 **owner sign-off** session, which is the run ADR-0027 D19 declared
OWED. The gate came back **RED**, so sign-off did not proceed and nothing in
ADR-0027 was ratified.

**Head.** `slice/6b-care-inbox-app` @ `4f242f5`, base `main` @ `b0cc2b6`
(unmoved). Tree clean at the time of the run and at the time of writing.

**Tally, read from the run's own output and not from an exit code** (a tee
masks the exit code, D16 item 9):

```
  3 failed
  35 passed (21.6m)
```

**Evidence is preserved OUTSIDE the repository**, at
`…/scratchpad/gate-r2-failures-preserved/` — three `error-context.md`, three
screenshots, three `trace.zip`, and the verbatim run log
(`gate-round18-r2-FINAL.txt`). This is not a convenience. A peer session began
its own Playwright run at **22:11:20**, roughly seventy seconds after the copy
completed, and `test-results/` is wiped at the start of every run. **The
preserved set is the only surviving record of this gate.**

---

## F-1 — MAJOR — the artifact route's new `read_timeout` fires under gate load, and the machine-read-text path 500s behind it

**Leg.** `A11Y-08: machine-read text — §6.9's exact label, per page, readable
where native text is not (OCR-01 live)` — cited by title; line numbers drift.

**What the leg reported.** `expect(locator).toContainText(/amoxicillin/i)`
against `.review-machine-text`: **element(s) not found**, 15 s timeout.

**What actually happened**, from the preserved trace with the response bodies
read out of `resources/`:

```
504 GET /api/artifact/{id}?page=1         → {"error":"read_timeout"}
500 GET /api/artifact/{id}?page=1&text=1  → unavailable
```

`read_timeout` is **the 504 this round introduced** in
`app/api/artifact/[id]/route.ts` — the D18 signal that "a stall is no longer
rendered as an absence". The signal is behaving as designed in the narrow
sense: a stall is being named rather than served as an absence. **The finding
is that the stall exists at all, and that the `text=1` path answers 500
`unavailable` rather than any named signal.** With no page bytes and no text,
`.review-machine-text` never renders, and the leg cannot find it.

**Why the targeted run did not catch it.** ADR-0027 D19 records A11Y-08 driven
both ways, passing at **45.8 s** against the aligned copy. That run exercised
one leg with nothing else loading the route. The stall appears only after
roughly twenty minutes of accumulated gate load. **The full gate is the only
instrument that could have caught this**, which is the argument for owing one.

**This is a product failure.** It is not to be re-run to green. No third run
can turn this head green.

**AND IT IS RECURRING — `r2` is not the first gate run leg 38 has failed this
way.** `lib/http/budget.ts`'s own header records the same leg failing in gate
runs `r6` and `r7`:

```
404  GET  17552ms  /api/artifact/b4cf239a…?page=1
-1   GET       -1  /api/artifact/b4cf239a…?page=1&text=1   NEVER ANSWERED
```

Round 18's F6 fix (ADR-0026 D20) **bounded and named** that stall, which is why
`r2` reports an honest `504 read_timeout` at the 15 s budget instead of a
17.5 s `404` that lies about absence. **The fix corrected the REPORTING of the
stall; it did not remove the stall**, and leg 38 still fails. That — not the
504 itself — is the finding.

**The 504's mechanism IS established, and it is not D1.** The 504 is the
route's own answer budget being spent — `ROUTE_ANSWER_BUDGET_MS = 15_000` in
`lib/http/budget.ts`. D1's `POOL_CONNECT_TIMEOUT_MS = 5_000` is a different
timeout at a different magnitude, and a connect rejection *throws* rather than
stalls, so it is **not** what produced the 504. ADR-0027 D19's suspicion of D1
is therefore **not** confirmed by leg 38, and this document's first reading of
it — that the discriminator had "returned positive" — **is corrected here.**

**What remains open is narrower, and better localised.** `budget.ts` already
names where the stall lives: *"the DB reads and the signed-URL hop"*. Round 19
owes (a) what makes that path exceed 15 s under gate load when the whole leg
costs 45.8 s in isolation, and (b) whether the **500 `unavailable`** on the
`text=1` path is D1's 5 s connect rejection surfacing through the route's
catch — which is the one place D1 is still live.

---

## F-2 — MODERATE — the gate founder's session becomes 401 roughly six minutes after provisioning

**Leg.** `stale: the version moves under an open screen → refused, re-rendered
with the change highlighted (REV-02 live)`.

**The leg never reached its REV-02 assertions.** It failed inside the shared
upload fixture, on `[role="status"]` — expected `is in`, received
`Uploading is not available for this person.`, which is `upload-form.tsx:63`,
the branch taken when `POST /api/upload/token` answers non-OK.

**What the trace shows.** The founder's browser context spans legs 32–35, and
its four `POST /api/upload/token` calls read:

```
200 OK · 200 OK · 200 OK · 401 Unauthorized
```

The session was provisioned at 21:54:48 and was refused at roughly 22:01.

**What this is NOT.** It is not the ADR-0024 non-hermetic condition: that was
`reuseExistingServer: true` adopting a peer's dev server with no service-role
key, and `playwright.config.ts` now sets `reuseExistingServer: false` on **both**
servers (the ADR-0025 D8 condition 4 fix), so the mechanism cannot recur. It is
also not plain token expiry: `jwt_expiry = 3600`, and six minutes is not an
hour. **And a 401 is not connection-shaped**, so it does not implicate D1.

**Leading candidate, not yet proven.** `enable_refresh_token_rotation = true`
with `refresh_token_reuse_interval = 10`. Concurrent refreshes outside that
ten-second window trip GoTrue's reuse detection, which revokes the session
family — a shape that matches "three successes then an abrupt 401" exactly.
Note that A11Y-07 clones `storageState` into two further contexts, so session
sharing across contexts demonstrably exists in this spec.

**Classification.** Instrument — a gate-fixture session-lifetime defect,
surfaced through a product route. Not a product assertion failure. It is
recorded here rather than re-run, because the mechanism is not yet named.

---

## F-3 — MINOR — a failed leg re-provisions the founder, and the re-provision can itself fail

**Leg.** `below-cliff: the summary-×5 member sees the row, the state, and ONE
line (AC-INBOX-8 live)`.

**Reported.** `the verification click did not verify THIS founder — refused at
the cause` — the fixture's own guard, thrown when `email_verified_at` is still
null after the Mailpit verification link is clicked.

**Its trace contains ZERO non-2xx responses.** Nothing in the product refused
anything.

**Mechanism.** Playwright restarts the worker after a test failure. That
re-evaluates the module-level `const stamp = Date.now()`, which mints a **new**
`FOUNDER_EMAIL`, which forces a **fresh** `provisionFounder` — a full
create-account, four setup steps, and a mail round-trip — in the middle of a
gate. Confirmed by the Mailpit timeline: three `review.founder.*` addresses at
21:54:48, 22:04:14 and 22:06:19, being the initial provision plus one per
failure, with the third matching leg 38's own page snapshot.

**Why it is a finding and not just noise.** It means **one failing leg
manufactures further failures downstream**, so a gate tally over-reports the
number of independent defects. Leg 36 is leg 35's wake. Any future gate triage
must collapse cascades before counting.

---

## What was RULED OUT, by evidence rather than by assumption

The F4 lesson: *"the environment is unwell"* is the most comfortable diagnosis
available and must be the last one reached for. Each of these was checked.

| Candidate | Status | How it was checked |
|---|---|---|
| A peer session contaminating `r2` | **RULED OUT** | The Mailpit timeline across the run is strictly sequential — a11y 21:48 → extract 21:50 → ingest 21:51 → onboarding 21:53 → review 21:54 — with no foreign traffic interleaved. The peer run began at 22:11:20, **after** `r2` finished. |
| The 882 MB production `.next/` left by this round's own `npm run build` | **CLEARED** | Deleted before `r2`; `r2` started clean and still failed. |
| Host memory exhaustion (the `r1` mechanism) | **NOT PRESENT** | 1004 MB free of 7931 during `r2`, against 148 MB when `r1` died. No `ERR_INSUFFICIENT_RESOURCES`, no `spawn UNKNOWN`, no `Thread failed to start` anywhere in `r2`. |
| `reuseExistingServer` adopting a peer's dev server (ADR-0024) | **CANNOT RECUR** | `playwright.config.ts` sets `reuseExistingServer: false` on both servers. |

**Every failure in `r2` is application-level** — a 504 with a named body, a
500, a 401, and a fixture guard — which is the opposite of `r1`, where no leg
failed on anything reachable from application code. **A signal that changed
with the code outranks a resource number that was already true yesterday**, and
in `r2` the signals changed with the code.

---

## Also settled by this run (not a finding)

**ADR-0027 D13 / D17 item 6 — A11Y-07's conditional assertion.** The round
recorded that `Tab between facts`, the leg's headline claim, sits inside
`if (factCount > 1)` and queued it as possibly-silently-skipped. **It is not
being skipped.** `matchItem` returns an item only at `bestScore >= 2`;
`extractionAnswer` filters labels by that same predicate; `dev-discharge-01`
carries **10** labels; and the page maps facts 1:1 onto `button.review-fact`.
A matched fixture therefore yields ≥ 2 facts *by construction*. Leg 37 passed
with the branch live.

**The defect is latent, not active** — and it stays queued on that corrected
basis. The assertion is still conditional, so a future fixture change could
still silence the leg's headline claim without failing it.

---

## Status

**Nothing here is dispositioned.** This document is the record of what the gate
returned, classified from preserved evidence, and no more. Dispositions are
their own session, as they were for round 18.

**ADR-0027 stays `proposed`. The 6B slice does not merge at `4f242f5`.**
