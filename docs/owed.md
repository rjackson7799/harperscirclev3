# The owed ledger

<!-- owed-cap: 25 -->
<!-- owed-schema: 1 -->

**Authoritative for what is owed.** Dispositions ADRs record the *verdict* that
made an item owed and are immutable; this file records the *fact* of where it
stands and is live.

Before this file existed, the ledger of record was ADR-0023's D17 table and
nothing ever wrote back to it. `"The slice-5B queue stays 39 OWED"` appears
verbatim in rounds 17, 18 and 19 — *even though slice 6's plan claimed to take
30 of the 39*. That is what this file is for.

---

## Why the queue grew — and it is not only that nobody wrote back

**`OWED` was never a legal disposition.** ADR-0006's blocking rule says a
finding blocks merge unless its row shows **either** an applied artifact plus a
named test **or** an explicit accepted-risk ruling with a coverage row. `OWED`
is neither. Fifty findings have been resting in a state ADR-0006 does not
define, for four rounds.

That is the real defect. A queue with no legal standing has no cap, no owner and
no exit, so of course it only grew. This file makes `OWED` legitimate — a
ledger row here *is* the blocking artifact ADR-0006 requires — and the cap and
the burn-down quota are what stop that being a loophole.

**This is an amendment to ADR-0006, not a reading of it.** It is recorded as one
in the retune ADR; nothing here takes effect by being written in this file.

*(Written at `1066e2d`, round 19/20, when the fifty were live. Rounds 21–23
then reconciled ADR-0023's table by ruling, not by ledger — the intake note
below carries the arithmetic.)*

---

## Rules

- **Cap: 25 OPEN.** A round may not close above it. Enforced by
  `tests/lint/process.test.ts`, which runs in CI under `npm run test:app`.
- **Burn-down quota: each slice closes at least as many items as it opens, plus
  five.** A cap alone permits sitting at 25 forever; the quota is what makes the
  ledger shrink. It opened at 6 OPEN on 2026-08-29; the quota keeps it falling.
- **An OPEN row with no owner slice that survives two round closes is
  auto-escalated to the owner for a kill ruling.** This is the specific
  mechanism that stops *"the slice-5B queue stays 39 OWED, unchanged by this
  round"* from happening a fourth time.
- **Every OPEN row carries an acceptance condition.** An owed item without one
  is a wish.
- **At round close, excess is FIXED, TAKEN, or KILLED.** Carrying is not a third
  option.
- **A build session may flip a row to `CLOSED` with a commit SHA** — that is a
  fact, not a verdict. Changing a *verdict* still requires a round (ADR-0025 D6).
  Recording a discrepancy in a settled ADR still means recording it and leaving
  the verdict alone.
- **Pricing rule when a slice takes intake:** *take the owed finding whose
  failure a person now reads; defer the one whose only reader is a worker.*

### Status vocabulary

| Status | Meaning |
|---|---|
| `OPEN` | Accepted, argued, scheduled, not yet taken. Counts against the cap. |
| `TAKEN(slice/unit)` | Assigned to a named unit in a live slice. Does not count against the cap. |
| `CLOSED(sha)` | Landed. Requires a resolvable commit SHA. |
| `KILLED(adr)` | Deliberately not doing it, with the argument on the record. |
| `RISK(coverage row)` | Accepted risk. Owner ruling **plus** a `coverage.md` row carrying the exposure. Never green. |
| `PROMOTED(coverage row)` | Became a named, quantified entry gate on a named slice. Leaves the ledger, stays visible as a `pending` row. |

IDs are `OW-<n>`, assigned in intake order and never reused or renumbered — a
handle for citation, not a rank and not a severity. The `Sev` column is the
reviewer's severity of the *parent finding*; `n/a` marks an item that came from
a sign-off, a packet question or a measurement rather than a finding.

### The four ways an item leaves OPEN

Exactly four. Anything else is carrying, and carrying is not an option above the
cap.

1. **Fixed** — applied artifact **plus a named test** → `CLOSED(sha)`. This is
   ADR-0006's blocking rule reused verbatim.
2. **Moot** — the code it describes no longer exists, verified by a named path or
   symbol check at a named head, with the check recorded → `KILLED(adr)`.
3. **Accepted risk** — an owner ruling plus a coverage row carrying the exposure
   → `RISK(row)`.
4. **Promoted to a gate** — it becomes a named, quantified entry gate on a named
   slice → `PROMOTED(row)`. This is the `bounded-deferral-gates` pattern used as
   an exit rather than as an excuse.

**The boundary with `docs/coverage.md`, stated so it cannot blur:**
`coverage.md` holds **assertions about the product** — a claim about behaviour,
green/pending/review. This file holds **work we owe** — a task. The only crossing
is rulings 3 and 4, and it is one-directional.

---

## Ledger

Populated 2026-08-29 at the retune refresh against `main` = `75f6b1c`, from the
slice-7 plan's priced table (Q4, SETTLED 2026-08-28). Every `TAKEN` home is the
plan's; every acceptance condition is the originating ADR's, restated where the
ADR only implied it. File:line citations were re-verified at `7fdca4e` by the
plan gate and are cited from there; a build session re-verifies at its own head.

| ID | Origin | Sev | Claim | Acceptance condition | Status | Evidence |
|---|---|---|---|---|---|---|
| OW-01 | ADR-0027 D17 item 1 (packet Q5) | n/a | `lib/hc/review.ts` has no `tests/hc/` live-DB module test: 10 files in `tests/hc/`, none loads `@/lib/hc/review`, two route tests mock it out | A module test of the `tests/hc/inbox.test.ts` kind runs against the live stack and drives the review layer's refusal shapes; **first item** of 7B B1, before any new read is written on top of it | CLOSED(6027e7a) | 7B B1: `tests/hc/review.test.ts`, 10 cases live — the FIRST commit of the build; its first run found the wrapper claiming zero rows for `extractionsFor` where the definer raises `extraction_refused` (the comment corrected, the live shape pinned) |
| OW-02 | ADR-0027 D17 item 2 (F-4, larger half) | MODERATE | `RequestRoleQuery.query` returns `Promise<QueryResult>` with `rows: any[]` — the root of R5/F-1 and of ADR-0028 D15 item 2's class | `q.query<R>` is generic and the two escapes (`as unknown as string`; a bare `received_at: row.received_at`) fail to compile | CLOSED(6cb0f38) | 7B B1: `RequestRoleQuery.query<R extends QueryResultRow = BoundaryRow>`; `tests/db/request-role-rows.types.ts` is the type pin `tsc` runs (a bare `accepted_at: row.accepted_at` no longer compiles — RED at fbe8ffc as TS2578/TS2558); `as unknown as` on a temporal column is refused by the boundary scanner (branch 8, f0d34a2); seven wrappers named their row types |
| OW-03 | ADR-0027 D17 item 3 (F-1's composition limit) | MAJOR | 35 `withRequestRole` sites across 12 `lib/hc` modules share one pool and exactly one route carries an `AnswerBudget` | Every destination page and every route they POST to carries an `AnswerBudget` (7B B4; 7C likewise); the ruling for the rest — pipeline, workers, auth forms — is recorded in the 7B deltas ADR | CLOSED(c8234c0) | 7B B2–B4: every 7B page renders inside `withPageBudget` and every 7B POST inside `withRouteBudget` (`lib/http/page-budget.ts`, 7933e24 / 3c3c6fb); `tests/lint/answer-budget.test.ts` holds the record trees to it (c8234c0). The ruling for the rest — pipeline, workers, inbound, auth forms — is ADR-0035 D6 |
| OW-04 | ADR-0027 D17 item 4 (F-3's residue) | MODERATE | The artifact route's abandonment check cannot cover the `artifact_read` entry's commit round-trip: one round-trip's worth of refused reads can be recorded as reads | RULED: the one-round-trip window is ACCEPTED, no DDL, M6 unconsumed; the log errs toward *over*-reporting a read a family member did not complete, the safe direction for a log whose purpose is to show who saw what. Carried by LOG-03, never green | RISK(LOG-03) | plan Q2, SETTLED 2026-08-28. LOG-03 OPENED at 7A (`docs/coverage.md` § 7, `pending` — ACCEPTED RISK, never green); the row carries the exposure and this ledger row carries the ruling |
| OW-05 | ADR-0027 D17 item 5 (D13) | n/a | The leg-integrity pass — title and coverage citation read against actual assertions — has covered **19 of 38 legs; 19 remain** (7 before round 27, plus **R6's twelve**, audited title-against-assertion at round 27 — ADR-0038 D3 — of which five were found wanting). Explicitly NOT a scanner. **7E's OWN eight are recorded and deliberately NOT added here:** several are the same legs read a second time AFTER 7E rewrote them, which answers *did the fix hold?* and is not another slice of the backlog — `docs/review/7e-leg-audit.md`, whose tally is eight legs audited, six findings recorded, none moving a verdict, no new ledger row | Recurring, never one-time: each batched Tier-3 pass audits a fixed quota (8 legs per close-out — 24 of the 31 by slice end) until the backlog clears, findings recorded whether or not they move a verdict | TAKEN(7/Tier-3 pass) | plan Q3/Q4: *"item 5 as the quota"*; `docs/process/slice.md` §1 |
| OW-06 | ADR-0027 D17 item 6 (D13) | n/a | A11Y-07's `if (factCount > 1)` guard silently skips the leg's headline claim on a thin fixture instead of failing | The guard is an assertion (a thin fixture goes RED) and the leg has run enough times to show the fixture is stable | CLOSED(c8234c0) | 7B B4: `e2e/review.spec.ts` A11Y-07 — `expect(factCount).toBeGreaterThan(1)`; the fixture's stability is what the gate shows (the closure run in ADR-0035) |
| OW-07 | ADR-0027 D17 item 7 (F-9 / D9) — the upload-path five | MINOR | Of the nine unbounded outbound fetches, five sit on the upload path: the two client calls, the two TUS hops, `upload/complete`'s fire | Each of the five carries a bound (time and size) with a test that names it; PRD §4.3.7 — Documents walks straight into these routes | CLOSED(f1cfc33) | 7C C2: each of the five carries its named time bound (the client mint 15 s / completion 60 s with honest 504 copy; the TUS hops 120 s with the chunk arithmetic stated; the eager fire 10 s) and the size bound is the TUS creation's Upload-Length refusal — the pre-read bound — plus the ingress caps; `tests/routes/upload.test.ts` names sites 3–5 behaviorally, `tests/lint/answer-budget.test.ts` sites 1–2 · **AMENDED BY RULING (ADR-0038 D3, round 27 — RATIFIED 2026-08-31):** this row **STANDS CLOSED**. Re-read against its own acceptance condition, R5 CONFIRMED that all five named hops carry their bounds; R5/F-1's unbounded ingress read is a **sixth** hop this row never named, and it is carried by **OW-24** — not by reopening this one. |
| OW-08 | ADR-0027 D17 item 7 — the other four | MINOR | `lib/mail/outbound.ts:39` (slice 11's channel), `postmark/route.ts:211`, `worker/relay/route.ts:116`, `worker/[stage]/route.ts:109` are unbounded. The tree's own split at `lib/storage/fetch.ts:21-33` (*"7 awaited / 2 eager"*, ratified ADR-0027 D22 item 4) is wrong at the site — two of the "awaited" sit inside `after(…)`; the split is 5/4. Measured at the plan gate, no verdict moved | Each of the four carries a bound with a named test — the three pipeline fires in the pipeline's execution-model increment (with OW-10), the mail channel in slice 11; the `fetch.ts` comment is corrected in the first increment that touches the file | OPEN | plan Q4: NOT THIS SLICE, named; plan *"What stays out"* |
| OW-09 | ADR-0027 D17 item 8 (F-2) | MAJOR | F-2's deployment consequence is UNOBSERVED: no hosted runtime has been looked at, and no local instrument can close this | A hosted runtime has been looked at under an auth-server fault and the observation recorded — date, runtime, what the page gate did | OPEN | plan Q4: NOT THIS SLICE — owner track |
| OW-10 | ADR-0028 D8 item 1 (F-1, product half) | MAJOR | §6.3 render and §6.9 OCR run on the request process; the stall F-1 found is a consequence of the pipeline's execution model. Ruled NOT PLANNED at round 20 (*gate first*); no line exists | Render and OCR run off the request process, in their own increment, with OW-14's harness as its prerequisite; leg 38 passes under D13's named load condition | OPEN | ADR-0028 D11, D15 item 1; plan: NOT THIS SLICE — owner-held, home its own increment |
| OW-11 | ADR-0028 D8 item 2 (F-2, PRODUCT) | MODERATE | 10 page gates render an auth-server outage as a sign-in redirect (D15's corrected enumeration of 21 sites: 3 refuse with a status · 5 form routes redirect · 2 do not gate · 1 layout degrades · 10 pages redirect) | `liveSessionClaims`'s `unavailable` stops collapsing to `null`; the ten pages and five form routes render or answer *unavailable* rather than redirecting, with a leg per shape | CLOSED(0a8bafc) | 7B B1: `liveSessionClaims` DELETED; `lib/auth/gate.ts` gatePage / gateRoute read all three outcomes; the ten pages render `SessionUnavailable`, the five form routes and `proxy.ts` answer 503 + retry-after + private,no-store; `tests/app/page-gate.test.ts` drives every site on disk and pins the set both ways (RED e4385cf: 24 failed / 29 passed) |
| OW-12 | ADR-0028 D8 item 3 (F-1) | MAJOR | The starvation sample is one sample: it sees only blocking that overlaps the deadline | A heartbeat across the whole request window reports stalls that do not overlap the deadline, at the cost of one more timer per request; lands with OW-10 | OPEN | plan: NOT THIS SLICE, with item 1 |
| OW-13 | ADR-0028 D8 item 5 (F-1) | MAJOR | Leg 38 has passed at `r3`/`r5` and failed at `r6`/`r7`/`r2`; two passes do not close a load-dependent stall | Every 7B/7C gate run records leg 38's duration and outcome in the D13 table's shape, never re-run to green; closes when it passes under D13's genuine-load condition, or when OW-10 lands | OPEN | ADR-0028 D8 item 5; plan Q4 (*"observation, not work"* — recorded, not assigned) |
| OW-14 | ADR-0028 D8 item 5a (F-1) | MAJOR | The `HopCost` ledger has never been seen firing on a live stall; three round-20 attempts narrowed the reproduction condition (D13) without discharging it | The harness D13 names — a concurrent in-process render + OCR overlapping an authenticated artifact read — exists, and the ledger's first live report is recorded | OPEN | ADR-0028 D13; plan: NOT THIS SLICE — owner track, OW-10's prerequisite |
| OW-15 | ADR-0028 D15 item 1 | n/a | `lib/auth/session.ts:32-33` and `:138-141` carry the wrong enumeration (*"twelve pages … eight routes"*) in product code | Both comments state D15's 21-site enumeration; lands inside the gate fix, no comment-only gate re-run | CLOSED(0a8bafc) | 7B B1: `lib/auth/session.ts` states D15's 21-site enumeration in both comment blocks, the wrong twelve/eight preserved under a marker; `app/api/upload/token/route.ts`'s stale mention corrected |
| OW-16 | ADR-0028 D15 item 2 | n/a | `lib/http/budget.ts:52-55` states the overturned localisation as fact; the round-20 qualifier *"UNCONFIRMED IN THE RUNNING APP"* is absent (the `ROUND-19 F-1` marker at `:16-17` predates the ruling) | The sentence is MARKED with the qualifier, never rewritten, in the increment that touches the file | CLOSED(f1cfc33) | 7C C2: the ROUND-20 QUALIFIER block sits above `budget.ts`'s localisation sentence — marked, never rewritten — and `tests/lint/answer-budget.test.ts` pins the qualifier string |
| OW-17 | ADR-0028 D15 item 3 | n/a | `tests/lint/timestamp-boundary.test.ts:52-59` closes 3 of ≥ 8 spellings of the timestamp-at-the-boundary class; `:113-114` still claims three is the class | The scanner covers the class (`.toString()`, `toISOString` on an `_at`, `Date(` wrapping, JSON round-trips, template fragments, `+ ""` variants) with a negative test per spelling — the new surfaces render dates on every row | CLOSED(f0d34a2) | 7B B1: `tests/lint/timestamp-boundary.test.ts` — eight branches (`String()`, template fragment, `+ literal` both sides, `.to*String()` incl. `.toISOString()`, `Date(` wrapping, `JSON.stringify`, `as unknown as`), one positive and one negative control per spelling; RED 755beb5 (6 of 15); the corpus scan clean over lib/hc + lib/db incl. the two new modules |
| OW-18 | ADR-0028 D15 item 4 | n/a | `app/(auth)/confirm/route.ts:45`: on `unavailable`, `liveSessionClaims` → `null` → activation skipped → the `?verified=1` success page; a one-shot lifecycle effect is lost silently | The three outcomes are read; on `unavailable` the route renders a retry, never success — the gate fix's mechanism | CLOSED(0a8bafc) | 7B B1: `app/(auth)/confirm/route.ts` classifies verifyOtp / exchange errors (a fault ⇒ 503 retry of THIS link, the token stands); claims from the session GoTrue handed back (decodeTrustedAccessToken); no session + unavailable ⇒ 503 retry, never verified=1; an activation throw ⇒ `?verified=1&forwarding=failed` and `/account/activate-forwarding/submit` offers the idempotent pass again; `tests/routes/confirm.test.ts` 10 cases |
| OW-19 | ADR-0028 D15 item 5 | n/a | `api/upload/token` and `api/upload/complete` `await req.json()` with no size or `content-length` bound and no answer budget; `complete` bounds only MEASURED staged bytes post-download; the 24.3 s `r2` call was `upload/token` | A `content-length`/JSON-size cap and an `AnswerBudget` on both; the upload channel gains a per-file pre-read bound like the mail path's | CLOSED(f1cfc33) | 7C C2: both routes cap ingress at 4 KiB (`lib/http/bounded-json` — declared content-length first, actual text the backstop; 413 BEFORE any parse or probe) and answer inside `withRouteBudget` with every hop raced; the TUS creation refuses a missing or over-cap Upload-Length before a byte lands; `tests/routes/upload.test.ts` + the scanner · **AMENDED BY RULING (ADR-0038 D3, round 27 — RATIFIED 2026-08-31):** this row **STANDS CLOSED** — its acceptance condition (a size cap, an `AnswerBudget` on both, the per-file pre-read bound) is CONFIRMED by R5 in every part. What is FALSIFIED is this cell's evidence phrase *"with every hop raced"*: `boundedJsonText`'s `req.text()` runs before the budget opens and is raced against nothing (R5/F-1). The phrase is struck-and-preserved, never rewritten (ADR-0025 D6); the unclosed work is **OW-24**. · **RE-READ at the 7E/7D close-out (2026-09-02):** the evidence phrase *"answer inside `withRouteBudget` with every hop raced"* above was FALSE of the ingress hop when written and is **true as of head `bb40021`** — the sixth hop OW-24 named now answers inside the budget. The row's own acceptance condition was CONFIRMED by R5 itself and this row stays CLOSED(f1cfc33); amended, never rewritten (ADR-0025 D6) |
| OW-20 | slice-7 plan, *"What this planning session measured"* point 1 (2026-08-28) | n/a | `app/(app)/[circle]/tasks/page.tsx:27` selects `state` (the column is `status`); `timeline/page.tsx:29` selects `title, happened_on` (the columns are `summary` and the §2.7 temporal shape). Both render their empty state unconditionally, contradicting RCP-01's *"live RLS reads"* cell and the receipt's own comment | The two pages select the columns that exist, read `error` and render an error state — never an empty one — and a leg proves a row renders; RCP-01's cell is rewritten by round 24, not by a build session (ADR-0025 D6) | CLOSED(6afffb7) | 7B B1: both floors select the columns that exist, read `error` and render an error state, label every row and carry its ProvenanceLine (`tests/routes/tasks.test.ts`, `tests/routes/timeline.test.ts`, RED 9a2bf95: 8 of 10); B2/B3 then moved the reads to lib/hc; the record legs prove rows render live. RCP-01's cell is round 26's to rewrite (ADR-0025 D6) |
| OW-21 | ADR-0025 D8 (F-5), owed to 6B | MAJOR | All four spec files are `test.describe.serial`; `ingestion.spec.ts:400` had never executed at the 6A head, leaving the live half of UXA-01 and RLS-10 unverified; six suite-repair conditions | Verified at the 6B head before carrying, as the intake note required: the 38-leg gate ran GREEN 38/38 at `1066e2d` (run `r5`, ADR-0028 D7; ratified at D15 item 4), executing every serial block end to end. Not carried | CLOSED(1066e2d) | ADR-0028 D7 `r5`; D15 item 4 |
| OW-22 | ADR-0025 S16.8 (F-1's residue: the approve-time payload contract, S16.2/S16.3), owed to 6B | MAJOR | `hc.approve_proposal`'s payload-derived casts uncovered for every conflict outcome; `064` had no `keep_both` case; `p_edits`'s top-level keys uncontracted | Verified at the 6B head before carrying: `20260825120001_payload_contract.sql` landed (`de804e8` RED → `39fcf17` GREEN, ADR-0026 D7 — all six S16.8 conditions disposed, `064` at `plan(32)`); F-1 ruled FIXED-IN-PART → FIXED at ADR-0027 RULING 5, ratified. Not carried | CLOSED(39fcf17) | ADR-0026 D7; ADR-0027 RULING 5 |
| OW-23 | ADR-0035 D6 (Q-B), ruled ADR-0036 | n/a | The five auth form submit routes are a person's wait and carry no `AnswerBudget` — D6 budgeted every 7B page and POST and ruled the machine callers out, leaving the auth forms to this row | Each of the five auth submit routes answers inside the route-budget boundary and `tests/lint/answer-budget.test.ts` holds the auth tree to it, the way it holds the record trees | CLOSED(f1cfc33) | 7C C2: all SEVEN auth submits on disk answer inside `withRouteBudget` with their waits raced (D6 said five; the class is held — the OW-17 precedent, said in the scanner), every route's `e=slow` marker READ by its page (R5/F-7), create-account's overrun running the round-10 compensation first, wasnt-me's kill absorbing its own overrun deliberately |
| OW-24 | ADR-0038 D3 (R5/F-1) | MAJOR | `boundedJsonText`'s `req.text()` runs BEFORE `withRouteBudget` opens on both upload routes (token `:40` vs `:56`, complete `:51` vs `:74`) and is raced against nothing: a chunked body with no `Content-Length`, dribbled, neither 413s nor 504s. A **sixth** hop, named by neither OW-07 (whose five all carry bounds) nor OW-19 (whose size cap holds) — both of those stay CLOSED | The ingress read answers inside the route's own `AnswerBudget`, or carries its own independent deadline, on both routes, with a route test that a slow or chunked body is refused in bounded time; and OW-19's evidence text plus DOC-05's cell stop saying *"every hop raced"* until it is true | CLOSED(bb40021) | ADR-0038 D3, RATIFIED 2026-08-31. The finding is `docs/review/round-27-findings.md` R5/F-1, re-verified at `ccd854b` by the dispositions session; the verdict and its argument are `docs/review/round-27-dispositions.md` §2 · **CLOSED at the 7E/7D close-out (2026-09-02), head `bb40021`.** Both halves met: `boundedJsonText` moved INSIDE `withRouteBudget` on both upload routes and raced as `boundedJsonText`, so a body that never ends takes the route's own overrun — `{refused:'slow'}` at 504 — with the size half untouched and still 413-before-parse; the route test drives a no-content-length body whose `text()` never resolves and asserts the bounded answer on BOTH routes (`tests/routes/upload.test.ts`, "the ingress read is raced too"); and DOC-05 now says the phrase is true for the first time rather than asserting it flatly. Green inside the COMPLETE 58/58 gate run at `bb40021`. **The budget does not CANCEL the read** — that is the documented posture (`lib/http/budget.ts`: it protects the person, not the pool), and what is now guaranteed is the sentence the route already claimed |
| OW-25 | ADR-0038 D1 (Q-E; ADR-0037 D11) | n/a | The gate's machine-readable record is flag-borne: `playwright.config.ts` sets no `reporter` and no JSON output path, and its `trace: 'retain-on-failure'` means a config-borne green run retains **no** per-test traces by design | `reporter` and the JSON output path are IN `playwright.config.ts`, **and** the trace question is settled on the record — either `trace: 'on'` is pinned with the disk cost accepted, or the config states that a green run carries no per-test traces and why that is acceptable; discharged by a gate run whose JSON record is produced with no CLI override | CLOSED(bb40021) | ADR-0038 D1 Q-E, RATIFIED 2026-08-31 — the condition WIDENED from the packet's reporter/JSON wording on R5's finding that `retain-on-failure` reintroduces the same evidentiary gap at the next complete green. Lands before the closure gate so that run's own record is config-borne, not flag-borne · **CLOSED at the 7E/7D close-out (2026-09-02), head `bb40021`.** The config half landed at `6992913`: `playwright.config.ts` carries `reporter: [['list'], ['json', { outputFile: '.gate/e2e-run.json' }]]` and `trace: 'on'` with the disk cost accepted and NAMED. The last clause needed a run: the COMPLETE **58/58** gate at `bb40021` produced `.gate/e2e-run.json` (0 failed · 0 flaky · 0 skipped · 1766 s) from a bare `playwright test` with **no CLI override**, and retained **58 traces for 58 legs — including every green one**, which is precisely Q-E's WIDENED clause and what `retain-on-failure` could never have produced |
| OW-26 | ADR-0038 D3 (R4/F-3, remedy (a)) | MAJOR | The access log is one `order by seq desc limit 300` with no cursor and no count; `seq` 1 is §7.5's custodianship declaration and is the FIRST row dropped, on the surface whose purpose is a complete printable record | The log reaches every entry the reader may see — a `seq` cursor or equivalent — the printed projection reaches the same set, and a test drives a circle past 300 rows | OPEN | ADR-0038 D3, RATIFIED 2026-08-31. The DISCLOSURE half (R4/F-3 remedy (b)) is TAKEN to 7D and is UXA-04's flip condition; this row is the durable fix, home **slice 8**. PPL-04 and LOG-01's app half carry the exposure meanwhile |

**OPEN: 7 / 25.** TAKEN 1 · RISK 1 · CLOSED 17 · 26 rows. Re-tallied by
`tests/lint/process.test.ts`, which also checks that this line agrees with the
table.

---

## Intake — triaged at the slice-7 plan gate; the note this replaces was wrong

Triaged 2026-08-28 at the slice-7 plan gate (Q4 SETTLED — `docs/review/slice-7-plan.md`,
*"The inherited obligations, priced"*) and written into the table above on
2026-08-29 against `main` = `75f6b1c`. The intake note written at `1066e2d`
said *"ADR-0023 D17 § 39"* and *"Total distinct 50"*; both were true when
written and false by the time this file could bind. Counted by ROW at a named
head, under ADR-0023 D25's rule:

| Source | Items | Note |
|---|---|---|
| `docs/adr/0023-slice5b-review-round-16.md` § D17 | **0** | The slice-5B queue is CLOSED. The history in one line: **39** strict `OWED` at `9682081` (D24) → **38 + 1** `OWED/OWNER` at `4f7a9d7` (D25: R8/F-1 flipped at `e0186ce` and the tally was never re-derived) → **8** after ADR-0029 (round 21: 31 stale rows ruled FIXED, R7/F-4 unblocked) → **6** after ADR-0030 (round 22) → **0** after ADR-0031 (round 23, sign-off at `7b203b2`). The 3 `OWNER` rows — R6/F-1, R7/F-1, R8/F-3 — are owner decisions, not owed work: D25 rule 4's spirit (a row's class is its operative token, and theirs is not `OWED`). They do not enter this ledger. |
| `docs/adr/0025-slice6a-review-round-17.md` § D8 and § S16.8 | **2 → 0** | F-5 and F-1's residue were owed *to 6B*, and 6B discharged both — OW-21, OW-22, `CLOSED` with the evidence. The note this replaces cited *"§ D17"*; ADR-0025 has no D17 — its owed sections are D8 and S16.8. |
| `docs/adr/0027-slice6b-review-round-18.md` § D17 | **8 items · 9 rows** | Items 1–8 → OW-01 … OW-09. Item 7 is two rows because the plan gave its two halves different homes (7C, and NOT THIS SLICE). Item 9 is RCP-02, a coverage row and not owed work; item 10 was a pointer to the 39 above and is now a pointer to 0. |
| `docs/adr/0028-slice6b-round-19-dispositions.md` § D8 | **5** | Items 1, 2, 3, 5, 5a → OW-10 … OW-14. Item 4 DISCHARGED at round 20; items 6 and 7 are pointers to ADR-0027 D17 and ADR-0023 D17. |
| `docs/adr/0028-slice6b-round-19-dispositions.md` § D15 | **5** | Items 1–5 → OW-15 … OW-19, the round-20 sign-off's consequences. |
| `docs/review/slice-7-plan.md`, measured at the gate | **1** | The two floors → OW-20. A measurement with no verdict; it is here because it is work with a named home, and the boundary rule puts work here and assertions in `coverage.md`. |
| **Total** | **22 rows** | 6 OPEN · 13 TAKEN · 1 RISK · 2 CLOSED |

The two things the old note said had to be settled during triage:

1. **"The 39 have never been reconciled."** They were — by three rounds
   (ADR-0029, ADR-0030, ADR-0031), each verdict moved by a round and not by a
   session, exactly as ADR-0025 D6 requires. The reconciled number was not
   *"well under 39"*; it was zero. The 6B build had fixed 31 of them without
   any record moving, which is the defect this file exists to end.
2. **"Round 18's item 5 becomes recurring, not one-time."** Done: OW-05 is
   `TAKEN(7/Tier-3 pass)` as a standing quota, per `docs/process/slice.md` §1.

The ledger therefore opens **below** the cap, not at it: 6 OPEN against 25. The
burn-down quota is measured at slice 7's close against these 6 plus whatever
rounds 24–26 open. Every OPEN row is owner-held or owner-track work with its
home named; none has a slice to take it, so each is on the two-round escalation
clock from round 24.
