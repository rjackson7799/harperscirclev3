# ADR-0027 — round-18 dispositions: slice 6B, the Care Inbox app increment

**Status:** **ACCEPTED AS CORRECTED at owner sign-off** — round 20, ruled
2026-08-27 at head `90c99ae`; every ruling recorded in **D22**. The
dispositions record for round 18, ratified with the D15 **tally CORRECTED** to
**6 FIXED · 3 FIXED IN PART = 9** (all 9 ACCEPTED · 0 DECLINED),
**Q3/UXA-03's "the row MOVES" AMENDED away** — it *passes*, and the coverage
cell stays `pending` — and the **migration-budget amendment REJECTED at this
sign-off and TAKEN as a slice-7 scoping question**. D20 items 1–6 are each
ruled in D22. **Ratification is effective on CI green at the head that carries
D22, on both the `push` and `pull_request` events.**

> **SUPERSEDED AT THE ROUND-20 SIGN-OFF — the Status as it stood before,
> true of `4f242f5`, preserved verbatim:**
>
> **proposed — BLOCKED at sign-off.** The dispositions record for round 18.
> The owner ratifies at sign-off, which is its own session, and the merge is
> its own session after that. **Sign-off was attempted on 2026-08-26 and did
> not proceed: the 38-leg browser gate at `4f242f5` came back RED
> (`3 failed, 35 passed`), with leg 38 failing inside this round's own
> `read_timeout` path. Nothing in this ADR is ratified.** See D19 and
> `docs/review/round-19-findings.md`.

> **AMENDED AT ROUND 20 — THE CONDITION IS DISCHARGED; THE STATUS IS NOT.**
> The paragraph above is true of `4f242f5` and is preserved exactly as
> written. The gate has since been re-taken at `1066e2d` and is **GREEN,
> 38/38** (run `r5`; run `r4` is INVALID and is not a tally), and CI is green
> at `c92877b` on **both** events — run #165 `push` and run #166
> `pull_request`, each `completed` / `success`. **The blocking condition this
> Status line names is therefore discharged.** The Status line is nonetheless
> left standing as written, because the block has not been lifted by a
> ruling: D20 items 1–6 were put to the owner at round 20 and **NOT RULED**.
> **Discharging a condition is not ratification.** See D21.
>
> **AND THE RULING HAS SINCE COME (D22, 2026-08-27).** The clause above —
> *"the block has not been lifted by a ruling"* — was true when written and is
> now spent: **D20 items 1–6 are RULED and the Status line above IS stamped.**

**Deciders:** the round-18 dispositions session (owner ratifies at sign-off).

**Date:** 2026-08-25

**Context:** Round 18 reviewed slice 6B on `slice/6b-care-inbox-app`, base
`main` @ `b0cc2b6` (unmoved), against `docs/review/round-18-packet.md` and
**ADR-0026** (proposed). One review session, read-only, returned **nine
findings** — 2 MAJOR, 5 MODERATE, 2 MINOR — plus five observations, rulings on
Q1–Q5, RULING 5, a disposition of the SUITE, and a disposition of the CI gap.
Its text landed **verbatim** at `docs/review/round-18-findings.md` (`fb57d2c`)
before a word of it was argued here, per the `5faccc4` / ADR-0023 precedent,
restated at ADR-0025 and again at round 17 (`97981fd`).

**The numbering:** ADR-0026 is 6B's as-built record, so this is ADR-0027 — the
next free number against `docs/adr/` at write time, following the
`0023-slice5b-review-round-16` / `0025-slice6a-review-round-17` naming.

**The increment this document authorises: NONE in the database.** The
migration budget is **7 of ≤ 7 spent** and this round does not ask the owner to
reopen it. **The review's claim that no finding needs DDL was checked rather
than assumed** — finding by finding, against the code — and it holds. Every
fix below is app-layer, test-layer or documentation.

---

## D0 — how these dispositions were reached, and what each rule changed

Four rules governed this round. Each of them changed an outcome, which is the
only reason to write them down.

**1. A finding's ENUMERATION is re-derived, not inherited** (ADR-0025 D0
rule 1). F-1 names three DB reads. Applying its *principle* — a stall must
never be rendered as an absence — reached **two more call sites the
enumeration does not mention**: the `?text=1` path's signed-URL hop and its
byte read, both of which answered the ONE 404 and both of which the review
screen renders as *"No machine-read text is stored for this page"*. F-9(a)
names two documents carrying a stale count; there is a **third**, in
`lib/storage/fetch.ts`'s own header — the file the count is *about*. A round
that had taken either finding at its word would have shipped a partial fix and
recorded it as complete.

**2. A disposition is a RULING, and refining a reviewer's recommendation IS
the ruling** (ADR-0025 D0 rule 2). F-7 recommends teeing the vitest suite.
Executing that recommendation literally would put a tee inside `test:app` —
and **a tee masks the exit code**, which is ADR-0026 D16 item 9, already paid
for once in this slice. The substance is taken and the placement amended: a
JSON reporter, which records more than a tee would and leaves the exit code
intact. The argument is D10.

**3. A fix lands in this round when its evidence can be produced in this
round — and where a change is person-facing, that evidence is a browser leg.**
This is the line that decided fixed-now versus owed. It is not severity: F-5
is MODERATE and was fixed because one targeted leg could prove it; the
composition half of F-1 is MAJOR and is OWED because no evidence available
here could settle it. The review's own Q5 argument is the reason — *"adding
[work] to a slice with no budget left, at the end of a nine-run close-out, is
how a close-out acquires an eighth defect."*

**4. A red that was never observed is not a red.** Every pin below was driven
red before it was made green, and where a change was made before its pin was
written, **the pin was driven by reverting the change** rather than asserted
(D2). Two of this round's own red cases were themselves defective — one passed
for the wrong reason, because `toThrow(undefined)` degrades to "it threw
something" — and were corrected in the red commit rather than carried. That is
F-5's class occurring inside the round that dispositions F-5, which is exactly
why the rule is written here.

---

## D1 — ACCEPTED and FIXED: the request-role channel had no bound at either end (F-1, MAJOR, first half)

**The finding is right, and the part that matters is the part D20 recorded as
a limitation.** D20 wrote *"the budget protects THE PERSON, not the pool"* as a
footnote. It is the load-bearing half, and every element of the review's
construction was re-derived at HEAD rather than accepted:

| Claim | Re-derived |
|---|---|
| the pool is a process-wide `max: 10` | `lib/db/request-role.ts` — `new Pool({ connectionString: url, max: 10 })` and nothing else |
| `connect()` has no `connectionTimeoutMillis` | confirmed; **the pg default is `0`, which is not "a long time" but WAIT FOREVER** |
| 35 `withRequestRole` call sites across 12 `lib/hc` modules | **35 and 12 exactly**, counted at HEAD |
| exactly one route imports `AnswerBudget` | **one** — `app/api/artifact/[id]/route.ts` |
| a raced-out read holds its connection | confirmed — the client is released in a `finally` that runs only after `fn` settles |

**The failure this closes.** Storage or the DB degrades — the condition the
budget exists for. Ten artifact reads race out at 15 s; each answers promptly
and correctly, and each leaves a query running with a checked-out connection.
The pool is empty. The eleventh request is a member opening their Care Inbox,
and that page **hangs with no bound and no named state** — the F5/F6 failure
mode reappearing on every surface that has no budget, at the moment the budget
fires. The one route that was hardened is the one route that stays responsive.

**FIXED, with two bounds that are complementary rather than alternative.**
Neither is sufficient alone, which is why both landed together:

- **`connectionTimeoutMillis` (5 s)** turns an unbounded *wait* into a prompt,
  named failure. It changes nothing at all while the pool has room, which is
  why no existing case moved.
- **`statement_timeout` (30 s, SET LOCAL)** is what actually **returns** the
  leaked connection: the server kills the abandoned query instead of running
  it to completion. Without it the first bound only converts hanging forever
  into *failing* forever.

**Both numbers are DERIVED from the answer budget, and the derivation is an
assertion rather than a sentence in a header.** `statement_timeout` is
`2 × ROUTE_ANSWER_BUDGET_MS`: bounded from both ends, because a query the
route is still waiting on must never be killed under it, and a query still
running at twice the budget has already blown a fifteen-second guarantee twice
over and is serving nobody. `connectionTimeoutMillis` is
`ROUTE_ANSWER_BUDGET_MS / 3`: a connection wait at or above the budget is dead
weight, since the budget would expire before the pool ever answered. The
constants are spelled in `lib/db/request-role.ts` so the DB layer keeps no
dependency on the HTTP layer; **the test imports both modules and is where the
two are tied together**, which is this slice's own rule that a relationship
recorded as prose recurs.

**The SET LOCAL control passed before the fix and passes after**, and that is
deliberate: it passed before only because there was no bound to leave behind.
A bound that outlived its transaction would silently govern whatever ran next
on that pooled session — the same defect class in a different coat.

**What is NOT claimed, and it is the reason D17 carries an OWED item.**
Neither bound cancels work already in flight when it fires, and **neither makes
the answer budget compose across routes**. Thirty-five call sites still share
one pool and exactly one route still has a budget. What changed is that an
exhausted pool is a named, prompt failure instead of an unbounded hang, and a
leaked connection comes back in thirty seconds instead of never.

---

## D2 — ACCEPTED and FIXED: a stall was being rendered as an absence (F-1, second half)

**The review is right and the route's own standard is what convicts it.**
`noneOnOverrun` collapsed an overrun on `liveSessionClaims`,
`readableArtifact` and `readableRendition` into `notFound()`, arguing that
*"the caller learns nothing either way"*. The caller learns the one thing that
matters to them — **whether to retry** — and under the systemic stall D1
describes, every member is told their documents are **NOT FOUND** during an
availability incident: an outage rendered as data loss, to a family, about a
record they cannot afford to believe is gone.

D18 split `storage_timeout` (504) from `rendition_page_missing` (503) on
exactly this reasoning — *"collapsing them would have the screen say 'page 3
is missing' about a page that is not missing"* — and the route's own comment
says **this route does not guess**. The DB-read arm guessed.

**And the §1.3 argument does not reach it.** 404 ≡ 403 exists so a refusal is
not an oracle: no-session, nonexistent, unauthorized and not-clean are all
**authorization** answers and must be indistinguishable. A timeout is not one.
It is decided by the clock and not by the row, so it answers identically for a
row that exists and a row that does not — **it cannot be an oracle at all.**
That is not argued in the ADR and left there; it is a case
(`tests/routes/artifact.test.ts`, *"THE NO-ORACLE CONTROL"*) that configures a
real row on one pass and `null` on the other, has both arrive long after the
budget, and asserts the two answers are byte-identical.

**FIXED.** A named `read_timeout` (504) for the three DB/session reads, and
`storage_timeout` (504) for the `?text=1` path's two storage calls. **No UI
change was needed**, which is itself the evidence that the finding is about a
sentence rather than a status: `MachineReadText` already maps 404 → `absent`
→ *"No machine-read text is stored for this page"* and every other non-ok →
`failed` → *"The machine-read text couldn't be loaded right now."* The fix
routes a stall to the true sentence through a path the screen already had.

**Three things deliberately did NOT move, each with its reason at the site:**

- **The main byte path keeps its ONE 404** on a stalled signed-URL hop and a
  stalled storage read. D18 argued that path's shape explicitly, the review
  does not attack it, and **it renders no sentence to anybody** — a broken
  image is a broken image at either status. Reversing an argued decision the
  review did not challenge would be this round exceeding its mandate.
- **Absence keeps the ONE 404 everywhere**, including the sibling's. The fix
  *separates* two facts; a fix that merged them the other way would have
  passed every pin above and been worse than the defect. It is its own case.
- **404 ≡ 403 is untouched.** The four-way byte-identity case is unchanged and
  still passes.

**One line changed before its pin was written, and the pin was DRIVEN rather
than asserted.** Removing `if (wantText) return notFound();` from the
sibling's storage-read catch was made without a preceding red. So the line was
put back: the suite went **36 passed / 1 FAILED** on exactly that case
(*expected 404 to be 504*), and removing it again returned 37/37. An assertion
that has never been observed red is a claim, not a pin — and this slice found
three of those.

---

## D3 — ACCEPTED and FIXED, with the residue stated: the §10.5 trail could record a read the route refused (F-3, MODERATE)

**Confirmed on both sides of the mechanism.** `AnswerBudget` deliberately does
not cancel the work it races (D20 says so), and `withRequestRole` runs on to
`await client.query('commit')` regardless of who is still listening. So a
raced-out `logArtifactRead` **committed** after the route had already returned
`500 unavailable` and refused the read.

Evidence-before-bytes exists so no bytes move without a trail. What happened is
the inverse: **a trail entry for bytes that never moved** — in a §10.5
evidentiary context, a record asserting that a member viewed a document they
were served a 500 for. The route's own justification does not reach it: it
argues about a write that could not be **confirmed**, and this is a write that
**succeeded unobserved**. Different facts, treated as one.

**FIXED, and the shape matters more than the fix.** The budget now exposes an
abandonment signal — **this is not cancellation**. Nothing is aborted, the work
is still allowed to finish, and a caller that ignores the signal behaves
exactly as before. The budget simply *states* that it has given up.
`logArtifactRead` checks it **after the insert and before the commit**, and the
transaction rolls back. The route still returns its 500 and still refuses the
read; what changed is that the access log no longer asserts otherwise.

**THE RESIDUE IS DECLARED, NOT CLAIMED AWAY — and it was declared in the RED
commit, before the fix was written.** The check cannot cover the commit
round-trip itself: a budget expiring inside it still lands a row. The window is
one round-trip wide instead of the whole remaining query, and closing it
completely needs two-phase commit. **This is NARROWED, NOT FIXED AT THE
CLASS**, and it says so in the module, in the test header and in coverage.md's
EVD-01 cell. This slice has already been corrected once for recording a
narrowing as a closure (ADR-0025 S16.2 on ADR-0025 D1); the correction is
applied here in advance rather than at the next round.

**Two controls are what make it a fix rather than a narrowing:** a signal that
has not fired still writes the entry, and no signal at all is unchanged. The
trail is the **default**; declining it is the narrow exception. A change that
made the log write conditional in general would have satisfied the pin and
quietly destroyed §10.5.

**The two alternatives the review offers were considered and declined, with
reasons.** Not racing the log write at all would break D20's whole sentence —
the route could then exceed fifteen seconds on the cheapest call it makes.
Making an unconfirmed entry distinguishable *in the row* wants a column, which
is DDL, and the budget is 7 of 7 with no owner amendment in hand. The review
anticipated exactly this and recommended the app-layer options for exactly this
reason.

---

## D4 — ACCEPTED and FIXED: the OCR helper validated the branch that does not run (F-2, MAJOR)

**Confirmed at the code, and the confirmation is one line.** `existsSync`
appeared **exactly once** in `lib/pipeline/ocr.ts` — on the `resolve()` result.
The fallback was returned **unchecked**. And by ADR-0026's own recorded
evidence, inside the Next bundle `require.resolve` returns a **module id**, not
a path, before *and* after `serverExternalPackages` (D15: *"externalising
changed WHICH id came back, not that it was an id"*). So in the running app the
guard failed **by design** and the unchecked `process.cwd()` fallback was the
branch that actually located the engine. **The module validated the branch that
never runs.**

That fallback carries two assumptions asserted nowhere: that `process.cwd()` is
the project root, and that `node_modules` is flat beneath it. Both are true on
this host. Neither is guaranteed under pnpm, npm workspaces, a monorepo, or a
traced serverless bundle. And when the assumption breaks, `bootWorker()` throws
`MODULE_NOT_FOUND`, which the worker route absorbs with a `console.warn` — so
§6.9's reading aid is absent from the running app, the pipeline is green, a
blind coordinator has an inaccessible record, and **every test in the repo
stays green**. That is D15 finding 3 reproduced exactly.

**FIXED in two parts.**

**One — the helper checks the answer it actually returns.** The fallback gets
the same `existsSync` the resolve branch always had, and an engine that is
nowhere raises a named `OcrEngineUnavailable` carrying **both** candidates:
what `require.resolve` returned, and where the fallback looked. That is
precisely the information D15 finding 3 cost four attempts to recover, and it
is now in the error rather than in a future session's head. This is
**ADR-0026's own second rule turned on the module that earned it**: *where a
value crosses a boundary the build does not control, resolve it and then CHECK
THE ANSWER.* The helper checked the bundler's answer and not its own.

**Two — an absent ENGINE is a §10.4 defect signal, not the same note as an
unread page.** The absorption is **correct and is untouched** — a reading aid
must never fail the answer it aids, and `finalizeExtraction` still runs. What
changed is that *"this page could not be read"* and *"there is no engine on
this host, so no arrival will be machine-read until it is fixed"* are no longer
the same sentence. It takes the signal shape this route already uses at the
interpret gate (R4/F-10) and for `answer.dropped` (R4/F-15).

**The control is the half that proves this is not a narrowing.** The branch the
bundle actually takes — a module id, so `isAbsolute` declines it exactly as it
does inside Turbopack — must still fall back and still find the engine. That
case uses a real Turbopack-shaped id
(`[project]/node_modules/…/index.js [app-rsc]`) rather than an invented string,
and asserts the returned path both **is absolute and exists**. A "fix" that
made the fallback stricter in a way that broke the live branch would have
passed every other pin.

**What is not closed, stated plainly.** The signal is a `console.warn`, because
that is what a §10.4 signal *is* on this route today; making it alertable is a
platform concern and not this slice's. And **F-2's deployment consequence
remains UNOBSERVED** — no hosted runtime has been looked at, exactly as the
review bounds its own claim. What is closed is that the failure can no longer
be a plausible-looking wrong path handed to `createWorker` and lost in a
warning that says nothing distinguishable.

---

## D5 — ACCEPTED and FIXED: the label, and the assertion that claimed to pin it (F-5, MODERATE)

**Both halves confirmed, and the second was proven live rather than argued.**
The leg is titled *"A11Y-08: machine-read text — §6.9's **exact label**, per
page …"*, its inline comment says the same, and both the A11Y-08 and OCR-01
coverage cells lean on it. It asserted `toContainText('may contain errors')` —
a substring of the **warning clause only**, which never checked `machine-read`
at all. A regression renaming the control to *"AI transcript — may contain
errors"* keeps it green while breaking the one thing its title says it exists
to protect.

**And the weak assertion was masking a real divergence.** PRD §4.2
(`docs/PRD.md:1391`), TSD §6.9 (`docs/TSD.md:2177`) and TSD's §8.7 table
(`:2501`) all specify **"machine-read — may contain errors"**. The screen
rendered **"Machine-read text — may contain errors"**. The slice-6 plan's B9
row, which is binding, says labelled *"machine-read — may contain errors"*
**everywhere it appears**.

**The review's sharpest claim about F-5 is now an observation, not a
prediction.** Strengthening the assertion and running the leg against the
shipped copy:

```
14 × locator resolved to <button … class="review-machine-text-toggle">
     Machine-read text — may contain errors</button>
   - unexpected value "Machine-read text — may contain errors"
1 failed
```

Then, with the copy aligned: `1 passed (45.8 s)`. Same leg, same head but for
one string, opposite colour. **That is the discrimination the old assertion
never had**, and it is how you can tell it was never doing that job.

**ACCEPTED and the copy ALIGNED rather than the deviation recorded.** The
alternative — recording it in `design-conformance.md` §2 — would leave four
documents describing a string the app does not render, to keep two words.
Aligning makes all four true with one edit and makes the leg's title true at
the same time. I am not claiming the old wording was bad; *"Machine-read text"*
arguably reads better on a button, which is presumably why it was written. But
this round's entire posture is that **a document pointing at a stale fact is
wrong from that commit onward** — F-6, F-8 and F-9 are all that class — and the
spec is the document here.

**The assertion is now `toHaveText` on the full string, and the string is typed
out IN THE LEG** rather than imported from the component. A test that reads its
expectation out of the code under test asserts only that the code equals
itself; that is how this one passed for a whole slice.

---

## D6 — ACCEPTED and FIXED: PRF-07's cell quotes a number about machinery this slice deleted (F-6, MODERATE)

**Confirmed, and the review understates it slightly in one direction and is
exactly right in the other.** PRF-07's cell reads *"worst warm p95 6866 ms
(phone photo, depth 4) — ~11% of §13.2's 60 s budget, which says our machinery
leaves the provider ~53 s."* This slice re-ran **PRF-07's own bench, with
PRF-06's method verbatim**, at the evidence head, and measured **20 479 ms —
scanned PDF at depth 4 = 34.1%**, leaving the provider **~40 s**. Neither
figure nor percentage appeared anywhere in `docs/coverage.md`; PRF-08's cell
was updated and PRF-07's was not.

**The cohort change is the part that makes this more than a stale number.** The
worst cohort moved from phone photo to **scanned PDF**, and B1 replaced the
rasterizer (`mupdf` → `pdfjs-dist` + `@napi-rs/canvas`) while B9 added OCR —
precisely the two changes that move the scanned-PDF cohort. So the 5B figure
does not merely lag: **it describes machinery this slice removed.** A reader of
coverage.md, which is the document the round rules from, was told our machinery
uses ~11% of the budget when this slice's own evidence says 34.1%.

**The review's own concession is accepted and is the point.** PRF-07 is not one
of the fourteen rows the packet tables and its row is not *claimed* to have
moved — which is exactly how it went stale. The slice measured PRF-07's own
quantity and did not carry the result back to PRF-07's cell.

**FIXED**: both numbers now stand in the cell, the 6B measurement as current
and the 5B one labelled as history — the same principle as the `:400` pointer
(ADR-0026 D16 item 8). A superseded measurement is a record; an unlabelled one
is a lie. Still report-only, still local; the hosted row stays on
`ai-provider.md`.

---

## D7 — ACCEPTED and FIXED in part, OWED in part: the timestamp class has three spellings (F-4, MODERATE)

**Confirmed by running the scanner's own regex against the alternatives.** The
class is defined by the **value that reaches the surface**, not by the function
that produced it, and the scanner matched only `String(…_at)`:

| Form | Output | Scanner, before |
|---|---|---|
| `String(row.received_at)` | `"Tue Aug 25 2026 …"` | CAUGHT |
| `` `${row.received_at}` `` | **byte-identical** | MISSED |
| `row.received_at + ''` | **byte-identical** | MISSED |

The first two are not near-misses. All three produce the same string character
for character, so all three give the same `.slice(0, 10)` → `"Tue Aug 25"` →
§2.7 refusal → **the same render throw that took all seven review legs red**.
Three interchangeable spellings; one was pinned, and D15 finding 2 recorded it
as *"fixed at the class"*.

**FIXED for the syntactic class**: the rule is now an alternation of three
branches over one shared `TEMPORAL` pattern, built with `new RegExp` so the
branches read one per line.

> **CORRECTED AT THE ROUND-20 SIGN-OFF (D22, ruling on the corrected tally).**
> Preserved as written. **"FIXED for the syntactic class" OVERSTATES even the
> partial claim.** The rule at `tests/lint/timestamp-boundary.test.ts:52-59`
> is an alternation of **three** branches and closes **three** spellings; at
> least **five more** were evaluated and produce the byte-identical string this
> file's own comment says causes the §2.7 refusal — `'' + x`, `x.toString()`,
> `[x].join('')`, `''.concat(x)`, `\`${x ?? ''}\``.
> **Ruled wording: "FIXED for three named spellings; the class has at least
> eight members" — narrowed, not closed**, the same phrasing D3 already uses of
> F-3. **F-4 is not demoted below FIXED IN PART:** the corpus scan is empty, no
> shipped site uses a missed spelling, and the rule holds the corpus today.
> **The defect is in the CLAIM, not in the behaviour.**

**Branch 2 is anchored to the WHOLE interpolation, and that is the design
decision.** A looser rule matching a temporal name anywhere inside a template
would fire on every log line and key builder in the DB layer, and **a scanner
nobody can leave switched on is not a mechanism.** `${isoText(row.received_at)}`
does not match because the expression starts with `isoText(`;
`` `circle/${id}/arrival/${x}` `` does not match because neither interpolation
is a temporal name. The negative control is as long as the positive one, on
this repo's own recorded ground that **a scanner is first-class code and needs
its own negative tests** (ADR-0026 D16 item 11).

**AND THE CORPUS SCAN COMES BACK EMPTY**, which is stated rather than left to
be inferred: the widened rule finds **no offenders** in `lib/hc` or `lib/db`.
Nothing was found; the class is simply wider than it was.

**OWED, and the review is right that it is the larger half.**
`row.received_at as unknown as string` and a bare `received_at: row.received_at`
**type-check**, because `RequestRoleQuery.query` returns `Promise<QueryResult>`
and pg's `QueryResult<R = any>` makes `rows: any[]`. **The root cause of R5/F-1
and of D15 finding 2 is `any` at the row boundary**, and no alternation reaches
those two forms. A scanner over syntactic forms is a strictly weaker instrument
than typing the rows. Typing `q.query` generically is **OWED** (D17), alongside
Q5's `lib/hc/review.ts` module test, where the review correctly says it
naturally belongs.

---

## D8 — ACCEPTED and FIXED: both documents the round must ratify understate their own headline (F-8, MINOR)

**Confirmed at all three citations.** `round-18-packet.md:9` said *"it was red
for **three** real product defects"*; its §"The defects the gate found" said
*"all **three** in code no browser had ever executed"*; `0026-…:16` said *"the
close-out gate found **three** product defects."* Their own bodies say
otherwise — the packet's red→green table runs F5, F6, F7, F8; ADR-0026's
Consequences says *"it bought **eight** defects"* and enumerates them; the PR
body and the kickoff both say eight.

**The "three" is a real and useful number attached to the wrong thing.** It is
what the **first** gate run returned, and all three were in code no browser had
ever executed. What was wrong was attaching D15's count to the whole close-out.

**FIXED in the documents themselves, not only here** — the ADR-0025 D7
precedent, where the round-17 dispositions corrected the packet's head ledger in
place. Both openings now carry both numbers with the distinction that makes them
true: **eight across nine runs**, the first three from run one (D15), the other
five from the runs that were meant to **confirm** each previous fix (D17–D21).
The packet's section heading becomes *"The FIRST three defects the gate found"*
for the same reason.

**This is not pedantry in this repo's terms**, and the review says why: ADR-0026
is the document being ratified, its opening paragraph is what a future session
carries away, and the packet opens by warning about exactly this class
(round-17 F-4 — a document that was false by the time the review read it).

---

## D9 — ACCEPTED and FIXED, and the round found a third site: the OWED fetch count and REV-02's citation (F-9, MINOR)

**(a) The count is nine, and it was nine.** D18 says *"seven outbound `fetch`
calls in `app/` and `lib/` are still unbounded"* and enumerates them. At HEAD
there are **nine** call sites outside the bounded helper; the two omitted are
the eager fires, `app/api/worker/relay/route.ts:116` and
`app/api/worker/[stage]/route.ts:108`, both `void fetch(…).catch(…)`.

**Excluding them is defensible and they stay excluded**: nobody awaits them, so
they fall outside D20's corrected class (*"a route a person is waiting on"*).
What was wrong is that they were omitted **silently** from a number stated as a
count — in the very document whose D20 records that this class was scoped too
narrowly the first time. The count is now nine, with the two named, the ground
for excluding them stated, and D18's own observation applied to them: undici's
~300 s floor *"is not a bound"*, so they remain a resource question even though
no person waits.

**AND A THIRD SITE THE REVIEW DID NOT NAME.** The same "seven" stood in
`lib/storage/fetch.ts`'s own header — **the file the tally is about**. It is
corrected there too, with a note that a number stated in three places goes stale
in three places. This is D0 rule 1 doing its work: the finding's enumeration was
re-derived, and it was short.

**(b) REV-02's citation pointed at the wrong file.** The cell said the
rendered-tree assertion that no control approves more than one proposal *"rides
the same leg"* — `e2e/review.spec.ts:428`. That leg asserts the version refusal,
the in-place re-render and that nothing landed; **there is no batch-control
assertion in it.** The assertion is real and is good — `tests/routes/arrival.test.ts`,
*"6B B7 · AC-INBOX-3: NO control approves more than one"* / *"every decision form
carries EXACTLY ONE proposal_id, and no batch control exists"* (`:204-215`) —
and it is structural (at most one `proposal_id` per `<form>`) plus a
batch-control denylist. **FIXED**: re-pointed, by title as well as by line.

**`docs/review/round-18-findings.md` is NOT touched.** It quotes D18's "seven"
correctly as what D18 said, it landed verbatim, and review text is not edited by
the round that answers it.

---

## D10 — ACCEPTED with the recommendation AMENDED, FIXED — and Q4 moves from QUEUED to DIAGNOSED (F-7)

**The finding is right.** `test:app` was bare `vitest run`, `docs/ops/e2e-local-gate.md`
said nothing about recording it, and CI's vitest step was un-teed with only
`pgtap-*`, `concurrency-*` and `db-*` retained. Q4's own corrective was prose,
which is the failure mode ADR-0026's closing rule names. **The sixth occurrence
would have arrived unnamed exactly as the fifth did.**

**THE RECOMMENDATION IS AMENDED, AND THE ARGUMENT IS THIS REPO'S OWN SCAR
TISSUE.** "Tee the vitest suite" executed literally puts a tee inside
`test:app` — and **a tee reports *tee's* exit status, so a red suite exits 0**
(ADR-0026 D16 item 9, the same family as D5's PowerShell `;` lesson). Curing one
recording gap by opening a worse one is not a fix. So:

```
test:app = vitest run --reporter=default --reporter=json
                      --outputFile=.vitest/run.json
```

Every invocation, local and CI, records every case's **name, duration and
failure message**, with the exit code untouched — verified at **exit 1** on a
deliberately failed case, with all three present in the file. CI additionally
tees the console text under `set -o pipefail` (where a worker that dies without
reporting a case shows up) and retains `vitest-app.log`, `.vitest/run.json` and
`build.log`.

### And it worked on its first run, twice — so Q4 is DIAGNOSED

The first full run under the new mechanism came back **897/898**, and for the
first time in seven occurrences the failure had a **name**:

| | file | case | duration |
|---|---|---|---|
| occurrence 6 | `tests/lint/db-fence.test.ts` | *"an app route importing service-role reds"* | **85 660 ms** |
| occurrence 7 | `tests/lint/a11y-fence.test.ts` | *"an unlabeled icon-only button reds, at error severity"* | **88 462 ms** |

**THE DIAGNOSIS.** `vitest.config.ts` sets `testTimeout: 30_000`. These are
vitest **per-case timeouts**, reported with the case's declaration site as the
stack — which is exactly why six earlier occurrences read as *"it went red
once"* and were filed as noise. The fence files are among the only cases in the
whole suite that construct an `ESLint` instance and load `eslint-config-next`,
which puts them in a different **cost class** from every other case:

| | |
|---|---|
| `a11y-fence` **alone** | 6 passed in **6.57 s** |
| `db-fence` **alone** | 34 passed in **12.33 s** |
| one case, full parallel run under `pool: 'forks'` | **85–88 s** |

That is the recorded *"6/6 alone"* / *"34/34 alone"* shape, **explained**. It is
load-dependent because it is contention over a fork-local config load; it
alternates between the two files because it lands on whichever fence file's
first ESLint call meets peak load; and it never reproduced on demand because
nothing about the code decides it.

**AND MY OWN CHANGES CANNOT REACH IT — by construction, not by assertion.** Both
cases drive ESLint over **virtual paths with inline source**; they read no real
file in the repo. That check was run *before* the word "transient" was used,
because *"the environment is unwell"* is the most comfortable diagnosis
available (D17) and this is precisely where it would have been reached for.

**THE FIX IS D21'S, ONE SUITE OVER.** The two files whose cost genuinely differs
declare their own budget (`vi.setConfig({ testTimeout: 180_000 })`) rather than
the global one being raised — **every other case in the suite should still fail
fast.** That is exactly D21's ruling about the gate's one fixture-scaled leg, and
the reasoning transfers without modification.

**No red→green pin, deliberately, for D21's reason:** the red is the recorded
run with its duration and its message, and the proof is the run that follows. A
pin asserting *"this file must be slow"* would pin the defect rather than the
fix.

**This exceeds what F-7 asks and what Q4's disposition proposed**, and it is
recorded as such. F-7 asks only that the corrective be made mechanical; Q4's
disposition was *"queue for diagnosis"*. The mechanism produced the diagnosis
within one run, so deferring it would have been deferring something already in
hand.

---

## D11 — ACCEPTED: the CI gap is ours, and the review is right that the packet understated the fix

**Both halves accepted.** Adding `npm run build` to `ci.yml` is not DDL, not
product code, and F4 cost two gate runs and two misdiagnoses on a **build-time**
signal CI could not see.

**And the step alone would not have caught F4.** `Can't resolve <dynamic>` is a
**warning**: a build that emits it 556 times still exits 0, and a CI step that
only ran `npm run build` would have gone green through the whole of D17. The
fix is the step **plus a zero-resolution-warning assertion** — which is exactly
the signal ADR-0026 names as the tell, and exactly the quantity its evidence
table already quotes.

**FIXED as the review specifies**, both parts, with the grep failing the step
and printing the offending lines.

**The review states as a BOUND that it did not run a build** (shared tree,
shared `.next/`). **This session did.** `npm run build` at this head emits
**zero** `Can't resolve` and zero warning lines of any kind — so the new step
goes green on arrival rather than on a promise, and the review's open question
(*"if `next build` does fail on it, the step alone suffices; if it does not, the
step alone is theatre"*) is answered: **the step alone would have been theatre,
and the assertion is what makes it a gate.**

---

## D12 — RULING 5 RATIFIED, and the five questions ruled

**RULING 5 — ADR-0025's F-1 moves FIXED-IN-PART → FIXED. RATIFIED.** The review
checked each residue class rather than accepting DEC-01's cell, and this round
ratifies on that basis:

- **`22P02` on the conflict arm's `domain`** — the cast is now performed for
  **every** outcome (`20260825120001:345-370`), not `use_new` alone, and
  converted to `approval_refused`. Driven at `064:21` (`keep`) and `064:22`
  (`keep_both`) — **including the arm the file previously did not exercise**,
  and reachable **with no edit at all**, which was the sharp part of the
  original finding.
- **`22023` on `confirm_high`** — a top-level type check
  (`20260825120001:147-150`), driven at `064:23`.
- Two contract closures placed **before any row is written** (`064:24`, `:25`).
- **The controls that make it a fix rather than a narrowing**: `064:26` (a
  well-formed `keep_both` still commits its task) and `064:27` (a real boolean
  `confirm_high` still approves the high-risk item). ADR-0025 S16.2's own
  warning was that a residue fix without controls is a narrowing dressed as a
  fix; these are there.

**The ruling rests on pgTAP evidence that neither the review nor this session
re-ran, and that is stated rather than glossed.** It is corroborated by CI runs
163/164 running `test:db` from a cold database at the review head, and by
nothing under `supabase/` having moved since `bc3bc85` — re-checked, not
assumed.

**Q1 — `@tesseract.js-data/eng` as DATA: ACCEPTED**, agreeing with the review
and with the owner's recorded position. The alternative is fetching the same
bytes from a CDN at runtime, which B2 made a test failure on purpose, and the
no-remote-fetch posture is the thing worth protecting. The review's note that
this is **not a free acceptance — F-2 is its cost** is exactly right, and D4 is
that cost paid.

**Q2 — the `rendered` flag: RATIFIED.** The hazard the review went looking for
is the right one (a *measured* flag can move under its own metric: a rendering
regression flips `rendered` to false, the label leaves the recall denominator,
and recall improves because the product got worse) and it is closed by
`tests/eval/corpus.test.ts:251-262` asserting the manifest's flag **equals**
what `normalizeArrival` renders, with two exact-set pins behind it. A rendering
regression goes RED; it cannot shrink the denominator quietly.

**Q3 / UXA-03 — PASS, and the row MOVES.** The review reads the copy green on
everything except the §6.9 label string, and says it would keep the row pending
*"only if the round wants the label aligned first"*. **The label is aligned
(D5), so the condition the review attached is satisfied and UXA-03 passes on
this round's authority.**

> **AMENDED AT THE ROUND-20 SIGN-OFF (D22, ruling on D20 item 2).** The prose
> above is preserved as written. **"and the row MOVES" is STRUCK; "UXA-03
> passes" STANDS.** The exit condition the review attached is met and the pass
> is real — but no coverage row flips at a sign-off (ADR-0025 S16.7) and a
> `pending` row cannot move at all. **UXA-03's cell at `docs/coverage.md:491`
> remains `pending`,** which is what D16 said all along; D12 and D15 were the
> documents in error, and this is the audit's one confirmed contradiction.

**Q4 — the transient: DIAGNOSED, not queued.** See D10. The review's own
finding was narrower than the question — it is about the corrective, not the
transient — and it is by fixing the corrective that the transient got named.

**Q5 — `lib/hc/review.ts` has no live-DB module test: AGREED, stays OPEN.** The
review's reason for leaving it open is better than the finding: the module's
boundary is now pinned by a scanner and by seven browser legs, the specific
defect that escaped (D15 finding 2) is closed at the class, and *"adding a
`tests/hc/` module test to a slice with no budget left, at the end of a
nine-run close-out, is how a close-out acquires an eighth defect."* **Queued as
the first item of the next slice's owed work** (D17), where F-4's stronger
instrument naturally belongs with it.

---

## D13 — THE SUITE: green ACCEPTED as product evidence, NOT accepted as instrument trust

**The review's disposition is accepted in full, and its attack on D15's
argument is correct.**

**Where D15 is right**, and it should not be lost: F1, F2 and F3 were in code no
browser had ever executed, were invisible to a green suite, and the gate found
each of them the first time real execution crossed the gap. **The browser gate
earned its existence in this slice**, and R5/F-6's pinned manifest earned its
twice.

**Where D15 fails.** Three of the eight — F4, F6 and F8 — were surfaced by runs
that existed only to confirm a previous fix, and **F4 was a regression the
close-out itself introduced**. A gate that catches defects the close-out created
is evidence that the close-out was churning; it is not evidence that the gate is
well-calibrated. Those are different claims and D15 collapses them.

**And the disqualifying part is F7, F8 and F-5.** Leg 17 could only pass on the
first gate run after a storage reset. Leg 33 ran at 60–70% of its 120 s budget
on **every run it ever passed**. Leg 38 asserted a fragment of the label its own
title says it pins. **Three of thirty-eight legs, ~8%, all three found by
accident** — two by a run that happened to go red, one by a reviewer reading an
assertion against its title. There is no mechanism in this repo that looks for
the fourth.

**RULED: the green gate is accepted as evidence FOR THE PRODUCT at this head.
It is NOT accepted as evidence that the suite is a trustworthy instrument.** The
honest statement is the review's: the gate caught what it caught, and this slice
has **no measurement of what it missed**. Three known instances are the only
available estimate of the miss rate, and it is not zero.

**The one-time leg-integrity pass is ACCEPTED as a standing obligation**, and
**no scanner** — the review is right, and right for D21's reason. D21 declined a
scanner for "legs whose cost scales with fixture size" because it would be a
rule with one instance written to look rigorous. Title-versus-assertion is a
**reading task**, not a pattern-matching one, and a regex attempting it would
manufacture exactly the false confidence D21 refused.

**A DOWN-PAYMENT WAS MADE RATHER THAN ONLY PROMISED, and it found something.**
This round read all seven of the slice's own review legs, title and coverage
citation against actual assertions. Six are faithful. The seventh is **A11Y-07**:

> its title is *"full keyboard operation — **Tab between facts**, Enter selects
> and MOVES FOCUS"*, and the Tab-between-facts half sits inside
> `if (factCount > 1)`. If the fixture ever yields a single fact, **the leg's
> headline claim silently does not execute and the leg stays green.**

That is the same shape as leg 17's hidden precondition (D19) — a leg whose
meaning is conditional on a fixture it does not assert. **It is recorded here
and queued, not fixed**, and the reason is D0 rule 3: the honest fix is to
assert the precondition so a thin fixture goes RED, and whether that makes the
leg flaky is a question only repeated gate runs can answer. Changing it on the
strength of one reading, at the end of this round, is how a close-out acquires
an eighth defect. **OWED (D17), with the finding stated so the next session
starts from evidence rather than from a promise to look.**

**Seven of thirty-eight are now read. Thirty-one remain.**

---

## D14 — what this round found that the review and the packet did not

1. **A third site of the "seven fetches" tally**, in `lib/storage/fetch.ts`'s
   own header — the file the count is about (D9).
2. **Two call sites F-1's enumeration does not name** — the `?text=1` path's
   signed-URL hop and byte read — reachable by applying the finding's principle
   rather than its list, and rendering the same wrong sentence (D2).
3. **The fence transient's mechanism** — a per-case `testTimeout: 30_000`
   exceeded by a fork-local `eslint-config-next` load under parallel
   contention. Seven occurrences across one slice had been classified as noise
   (D10).
4. **A11Y-07's conditional half** — the fourth instance of the F7/F8/F-5 class,
   found by the leg-integrity down-payment the suite disposition asks for
   (D13).
5. **Two defective red cases of this round's own**, corrected in their red
   commits: one passed for the wrong reason because `toThrow(undefined)`
   degrades to "it threw something"; one reached for a class at module top
   level where `vi.mock` hoisting had not yet built the mock (D0 rule 4).

---

## D15 — every finding, dispositioned

| # | Severity | Disposition | Where |
|---|---|---|---|
| **F-1** | **MAJOR** | **ACCEPTED · FIXED** (both halves), with the composition limit OWED | D1, D2 |
| **F-2** | **MAJOR** | **ACCEPTED · FIXED**; deployment consequence remains unobserved, as bounded | D4 |
| F-3 | MODERATE | **ACCEPTED · FIXED**, with the commit-round-trip residue declared: **narrowed, not closed** | D3 |
| F-4 | MODERATE | **ACCEPTED · FIXED** for the syntactic class; the row-boundary typing **OWED** | D7 |
| F-5 | MODERATE | **ACCEPTED · FIXED** — assertion strengthened, copy aligned to the spec | D5 |
| F-6 | MODERATE | **ACCEPTED · FIXED** | D6 |
| F-7 | MODERATE | **ACCEPTED · recommendation AMENDED · FIXED**, and Q4 **DIAGNOSED** | D10 |
| F-8 | MINOR | **ACCEPTED · FIXED** in both documents | D8 |
| F-9 | MINOR | **ACCEPTED · FIXED**, both halves, plus a third site the review did not name | D9 |

**Tally: 9 ACCEPTED · 9 FIXED · 0 DECLINED**, with **2 carrying a declared
remainder** (F-3's commit-round-trip residue; F-4's row-boundary typing) and
**1 fixed with its recommendation amended** (F-7).

> **CORRECTED AT THE ROUND-20 SIGN-OFF (D22, rulings on D20 item 1 and on the
> corrected tally).** The sentence above is preserved as written and is
> **wrong in both halves.** Four rows carry a declared remainder, not two —
> and the count of two included F-4's `OWED` remainder while excluding F-1's
> identically-labelled one, so it was not 2 under *either* reading.
> Separately, `9 FIXED` counted F-4, whose own D7 heading reads *"ACCEPTED
> and **FIXED in part, OWED in part**."*
>
> **The distinction the count needed, now ruled:** a **fix remainder** (part
> of the fix was never built) → **FIXED IN PART**; a **verification
> remainder** (the fix is whole, its consequence unobserved) → **FIXED**, with
> the observation OWED.
>
> **CORRECTED TALLY: 6 FIXED · 3 FIXED IN PART = 9. All 9 ACCEPTED ·
> 0 DECLINED.** F-1, F-3 and F-4 move to **FIXED IN PART** (fix remainders).
> **F-2 stays FIXED** — D17 item 8's remainder is a verification remainder
> (*"Done when: a hosted runtime has been looked at"*); nothing is unbuilt,
> something is unseen. F-5, F-6, F-8, F-9 unchanged; **F-7 keeps its amended
> recommendation.** 6 + 3 = 9 = the finding count = the ACCEPTED count, and
> each of the four remainders already has an acceptance condition in D17 —
> items 3, 8, 4 and 2 respectively. **No finding is wholly OWED.**

**Nothing was DECLINED, and that deserves a sentence rather than silence.**
Three things were nonetheless refused, each with its argument at the site:
F-7's recommendation as literally written (a tee inside `test:app`, D10); the
main byte path's ONE 404, which F-1's principle would reach but which the
review does not attack and D18 argued explicitly (D2); and F-3's row-column
option, which is DDL against an exhausted budget (D3).

**Rulings:** ADR-0025's F-1 → **FIXED** (RULING 5 ratified). Q1 →
**accepted as data**. Q2 → **ratified**. Q3/UXA-03 → **passes, and the row
moves**. Q4 → **diagnosed**. Q5 → **agreed, stays open**. The suite → **green
accepted as product evidence, not as instrument trust**, with a one-time
leg-integrity pass and explicitly **no scanner**. The CI build gap → **ours**,
fixed as the step **plus** the zero-warning assertion.

> **AMENDED AT THE ROUND-20 SIGN-OFF (D22, ruling on D20 item 2).** Preserved
> as written. In the Q3/UXA-03 entry above, **"and the row moves" is STRUCK**
> for the reason given at D12's site: the row does not move, and cannot.
> **"passes" stands.** Every other ruling in this paragraph is RATIFIED AS
> WRITTEN.

---

## D16 — what moves in `docs/coverage.md`

Seven cells, seven lines. **519 CRLF / 0 bare LF before and after, measured
with node** — the patch asserted the count on the way in and again on the way
out and would have refused to write if either moved. ADR-0026 D16 item 10 is
the reason: Git Bash's `grep`, `sed` and `od` operate in text mode, strip `\r`
before you ever see it, and disagree with each other **and** with the truth.

| Row | What moves |
|---|---|
| **PRF-07** | F-6 — the 6B re-measurement (20 479 ms / 34.1% / ~40 s, scanned PDF at depth 4) recorded; the 5B figure kept and **labelled as history** |
| **REV-02** | F-9(b) — AC-INBOX-3's rendered-tree assertion re-pointed to `tests/routes/arrival.test.ts:204-215`, by title as well as line |
| **A11Y-08** | F-5 — the exact-label assertion, the copy alignment, both colours of the targeted run, and the leg line re-verified at the final head (**`:583` → `:591`**) |
| **OCR-01** | F-5 and F-2 — the label, and the engine resolution checked on the branch that actually runs |
| **DEC-01** | **RULING 5** — ADR-0025's F-1 moves FIXED-IN-PART → FIXED, with drivers and both controls named |
| **RLS-10** | F-1/D2 — a stall is no longer rendered as an absence; 404 ≡ 403 untouched; the no-oracle property **pinned rather than argued** |
| **EVD-01** | F-3 — a refused read leaves no trail, with the residue recorded as **narrowed, not closed** |

**No row is flipped to green on this round's authority.** Every cell records a
change to something already green, or records a ruling. UXA-03 passes per D12,
which is the row's own stated exit condition being met.

**A11Y-08's line moved and that is the fourth line drift in this slice** — the
label constant added by F-5's red pushed the leg from `:583` to `:591`. The
belt-and-braces convention the review commends (observation 2) is what made it
survivable: **every citation carries its title**, and the number is re-verified
at the final head rather than trusted.

---

## D17 — OWED, and what "done" means for each

Carried forward to the next slice's owed queue. Each has an acceptance
condition, because an owed item without one is a wish.

1. **Q5 — `lib/hc/review.ts` has no `tests/hc/` live-DB module test.** *Done
   when:* a module test of the kind `tests/hc/inbox.test.ts` gives the inbox
   layer exists against the live stack. **First item**, per the review.
2. **F-4's larger half — type the row boundary.** `RequestRoleQuery.query`
   returns `Promise<QueryResult>` and pg's `QueryResult<R = any>` makes
   `rows: any[]`, which is the root cause of R5/F-1 and of D15 finding 2.
   *Done when:* `q.query` is generic and the two type-checking escapes
   (`as unknown as string`, and a bare `received_at: row.received_at`) fail to
   compile. Belongs with item 1.
3. **F-1's composition limit.** Thirty-five `withRequestRole` call sites across
   12 `lib/hc` modules share one pool, and **exactly one route has an answer
   budget**. D1 bounds the pool; it does not make the budget compose. *Done
   when:* the surfaces a person waits on carry a budget, or a documented ruling
   says which do not and why.
4. **F-3's residue.** The abandonment check cannot cover the commit round-trip.
   *Done when:* either the window is closed (two-phase commit, or a column
   marking an unconfirmed entry — **DDL, needs an owner amendment**) or a
   ruling records that a one-round-trip window is accepted.
5. **The one-time leg-integrity pass — 31 of 38 legs remain.** Title and
   coverage citation read against actual assertions. **Explicitly NOT a
   scanner** (D13). *Done when:* every leg has been read once and the findings
   recorded whether or not they move a verdict.
6. **A11Y-07's conditional half** (D13). *Done when:* the `if (factCount > 1)`
   guard is an assertion, so a thin fixture goes RED instead of silently
   skipping the leg's headline claim — and the leg has run enough times to show
   whether the fixture is stable.
7. **The nine unbounded outbound fetches** (D9), seven awaited and two eager.
   Unchanged from D18's queue except that the count is now honest.
8. **F-2's deployment consequence is UNOBSERVED.** *Done when:* a hosted
   runtime has been looked at. No local instrument can close this.
9. **RCP-02 stays pending, tagged 7.** Documents and People & roles do not
   exist.
10. **The slice-5B queue stays 39 OWED**, unchanged by this round. **[AMENDED 2026-08-27 → ADR-0023 D25: this "39" is the strict-`OWED` row count at `9682081`; at `main` = `4f7a9d7` it is **38 strict `OWED` + 1 `OWED/OWNER` (R7/F-4)**. Prose preserved.]**

---

## D18 — the standing pins and gates this round did NOT move

Stated because they are the constraints most easily forgotten, and because a
dispositions round is exactly where they would be forgotten.

- **Nothing is production-activated.** **G4 and G7 still block.**
- **The G9 gate STAYS OPEN.** Slice 6 does not close it.
- **`BAND_ARTIFACT_ALLOWLIST` stays EMPTY.**
- **SIG-01 is explicitly NOT absorbed.**
- **RCP-02 stays pending, tagged 7.**
- **The slice-5B queue stays 39 OWED.** **[AMENDED 2026-08-27 → ADR-0023 D25: this "39" is the strict-`OWED` row count at `9682081`; at `main` = `4f7a9d7` it is **38 strict `OWED` + 1 `OWED/OWNER` (R7/F-4)**. Prose preserved.]**
- **The migration budget is 7 of ≤ 7 SPENT.** No DDL was written, none was
  needed, and **69 migrations exact** is unchanged — nothing under `supabase/`
  has moved since `bc3bc85`.
- **No real family data** anywhere. The A11Y-08 leg's image is drawn by the
  leg itself; the corpus is builder-generated.
- **`main` is unmoved at `b0cc2b6`**, and **PR #12 stays open, NOT merged**,
  with `[DO NOT MERGE without owner sign-off]` in its title. No second PR was
  opened.

---

## D19 — evidence at ONE declared head, and the ONE thing that is NOT established

Every command run SOLO (D5's lesson: PowerShell `;` chaining reports only the
last exit code).

| Check | Result |
|---|---|
| `vitest` (`test:app`) | **898 / 898** across **75 files** |
| `lint` (SOLO) | clean |
| `typecheck` | clean |
| `build` | clean — **zero `Can't resolve`, zero warning lines of any kind** (run precisely because D11 needs the CI step to go green on arrival) |
| targeted: A11Y-08 by title, against the OLD copy | **1 FAILED** — *unexpected value "Machine-read text — may contain errors"* |
| targeted: A11Y-08 by title, against the aligned copy | **1 passed (45.8 s)** — a TARGETED run, never a gate result |
| `db:reset` / `test:db` / `test:concurrency` | **NOT re-run, on a stated reason** — see below |
| **browser gate (38 legs)** | **RED at this head — `3 failed, 35 passed (21.6m)`, run `r2`. See below.** |

**`test:db` and `test:concurrency` are not re-run, and the reason is checked
rather than asserted.** `git diff --name-only bc3bc85..HEAD` still touches
**ZERO** files under `supabase/` and **ZERO** under `scripts/concurrency/`.
Migrations are **69 exact**. `scripts/concurrency/run.mjs` imports only `pg`
and `node:crypto` and drives SQL directly, never through `lib/hc`; pgTAP is
pure SQL. **Neither suite can observe a JavaScript change**, and every change
this round made is JavaScript, TypeScript, YAML or Markdown.

### The browser gate, run `r1`: attempted, INTERRUPTED, recorded as interrupted

This round changed `app/`, `lib/`, `components/` and `e2e/`, so the branch's
38-leg gate must be re-established at the new head. **It was attempted and it
did not produce a result.** Recorded here in full rather than quietly dropped,
per the flake policy's own instruction.

The run was **stopped at leg 18 of 38** after five legs failed. **Not one of
them failed on a product assertion.** Four independent signals, all of them
resource exhaustion, none of them something application code can produce:

| Signal | Where |
|---|---|
| `net::ERR_INSUFFICIENT_RESOURCES` on `page.goto` | legs 9 and 11, from the preserved `error-context.md` — **Chromium refusing to allocate**, before any assertion ran |
| `Error: spawn UNKNOWN`, `errno: -4094` | the dev server, *"Failed to generate static paths for /[circle]/upload"* |
| `Thread failed to start` | **PowerShell**, in a separate process, while measuring the host |
| **148 MB free of 7931 MB**, 615 MB in Memory Compression | the host, measured after killing every repo-owned node process |

**THIS IS NOT THE D17 EXCUSE, AND THE DIFFERENCE IS CHECKABLE.** D17's rule is
that *"the environment is unwell"* must be the LAST diagnosis reached for, and
that **a signal that changed with the code outranks a resource number that was
already true yesterday**. Applied here:

- **No leg failed on an assertion about product behaviour.** The failures are
  `page.goto` refusing to navigate and a dev server unable to spawn — the
  categories of failure that exist *before* the product is exercised.
- **The legs that did run and could fail on product behaviour, passed** — legs
  1–8, 10, 13–15 and **17**, including the artifact route's own RLS-10 leg
  (leg 15, 12.3 s) and the §6.8 refusal leg (leg 10, 1.4 m).
- **`ERR_INSUFFICIENT_RESOURCES` and `spawn UNKNOWN` are not reachable from
  anything this round wrote.** No change here spawns a process or allocates in
  the browser.
- The host baseline is a **recorded standing trap** (~0.4 GB free with Docker
  up). At the time of the run it was **148 MB** — worse than baseline, with
  nothing of this session's still running.

**One contaminant was mine and has been removed.** This session ran
`npm run build` (for D11's evidence), which left an **882 MB production
`.next/`** that Playwright's `next dev` then shared. That is a candidate cause
independent of the memory pressure, it was introduced by this round, and it is
named here rather than left for the re-run to trip over. `.next/` has been
deleted; the re-run starts from a clean dev build.

**A second candidate is also mine and the re-run is its discriminator.** D1
sets `connectionTimeoutMillis: 5000`. A connect that previously waited now
*rejects* at five seconds, and a dev-mode server under gate load on a
memory-starved host is exactly where that could bite. **No evidence currently
implicates it** — the observed failures are browser- and OS-level, upstream of
any DB connect — but it is the one change this round made whose failure mode is
load-dependent, and it is written down here so the next session tests it rather
than rediscovers it.

### Run `r2` — TAKEN at `4f242f5`, and RED

The gate was re-run at the final head with `.next/` deleted, on a host with
**1004 MB free of 7931** (`r1` died at 148 MB). It ran to completion, single
worker, and reported its own tally:

```
  3 failed
  35 passed (21.6m)
```

**The condition this section set has been met, and the answer is RED.** The
gate at `4f242f5` is no longer "not taken": it was taken, it produced a
tally, and three legs failed.

Artifacts are preserved **outside the repo**, at
`…/scratchpad/gate-r2-failures-preserved/` — all three `error-context.md`,
the screenshots, the `trace.zip`s, and the verbatim run log. That mattered: a
peer session started its own Playwright run at **22:11:20**, ~70 seconds after
the copy completed, and `test-results/` is wiped at the start of every run.
**The preserved set is the only surviving record of this gate.**

| Leg | Title | Classification |
|---|---|---|
| **38** | A11Y-08 — machine-read text (OCR-01) | **PRODUCT — this round's own new code** |
| **35** | REV-02 — stale version under an open screen | instrument: session lifetime, via a product route |
| **36** | AC-INBOX-8 — the below-cliff member | cascade of leg 35, not independent |

**Leg 38 is a product failure and is NOT to be re-run to green.** From its
preserved trace, with the response bodies read out of `resources/`:

```
504 GET /api/artifact/{id}?page=1         → {"error":"read_timeout"}
500 GET /api/artifact/{id}?page=1&text=1  → unavailable
```

`read_timeout` is **the 504 this round introduced** — `app/api/artifact/[id]/route.ts`,
the D18 signal that "a stall is no longer rendered as an absence". It fired
under gate load; the machine-read-text path then returned 500; so
`.review-machine-text` never rendered, which is precisely the element the leg
reported as not found. The targeted A11Y-08 run passed at 45.8 s because
nothing else was loading that route — **the full gate is the only instrument
that could have caught this, which is the whole argument for owing one.**

**Leg 35 never reached its REV-02 assertions.** It failed inside the shared
upload fixture. The founder's browser context spans legs 32–35, and its four
`POST /api/upload/token` calls read **200, 200, 200, 401**: the session went
bad roughly six minutes after provisioning. `jwt_expiry = 3600` rules out
plain expiry; refresh-token rotation with `refresh_token_reuse_interval = 10`
is the leading candidate. **A 401 is not connection-shaped.**

**Leg 36 is leg 35's wake, not an independent failure.** Its trace contains
**zero** non-2xx responses. Playwright restarts the worker after a failure,
which re-evaluates the module-level `stamp = Date.now()`, so a *fresh* founder
was provisioned whose verification click left `email_verified_at` null.

### What `r2` settles, and what it overturns

- **Peer contamination during `r2`: RULED OUT, by evidence rather than by
  assumption.** The Mailpit timeline across the run is strictly sequential —
  a11y 21:48 → extract 21:50 → ingest 21:51 → onboarding 21:53 → review
  21:54 — with no foreign traffic interleaved anywhere. The three
  `review.founder.*` addresses are the one initial provision plus the two
  worker restarts, and the third matches leg 38's own page snapshot. The peer
  run began at 22:11:20, **after** `r2` had finished.
- **The 882 MB `.next/` contaminant is CLEARED.** It was deleted, `r2`
  started clean, and `r2` still failed.
- **D1's discriminator returned NEGATIVE for the 504, on a checked mechanism.**
  This section said that if `r2` showed connection-shaped failures under load,
  `connectionTimeoutMillis: 5000` was the first thing to suspect. Leg 35's 401
  is not connection-shaped. **And leg 38's 504 is the route's OWN answer budget
  — `ROUTE_ANSWER_BUDGET_MS = 15_000` — being spent, not D1's
  `POOL_CONNECT_TIMEOUT_MS = 5_000`**: different timeout, different magnitude,
  and a connect rejection throws rather than stalls. D1 stays live in exactly
  one place — the **500 `unavailable`** on the `text=1` path, which is where a
  connect rejection would surface. Round 19 owes that.
- **Leg 38's stall is RECURRING, and F6 renamed it rather than removed it.**
  `lib/http/budget.ts`'s header records the same leg failing in gate runs `r6`
  and `r7` (`404 GET 17552ms`, text path never answered). This round's fix made
  the stall honest — a named 504 instead of a 404 that lies about absence — and
  that is a real improvement. **The stall itself survived it.**
- **D13 is SETTLED — and more strongly than a trace sample could settle it.**
  The `if (factCount > 1)` guard in A11Y-07 **does** run: `matchItem` returns
  an item only at `bestScore >= 2`, `extractionAnswer` filters labels by that
  same predicate, and `dev-discharge-01` carries **10** labels — so a matched
  fixture yields ≥ 2 facts *by construction*, and the page maps them 1:1 onto
  `button.review-fact`. The leg's headline claim **is** exercised today.
  **The defect is latent, not active.** It stays queued (D17 item 6) on that
  corrected basis: the assertion is still conditional, and a future fixture
  change could still silence it without failing.

**WHAT IS OWED BEFORE SIGN-OFF, restated now that the gate has been taken:**

> **A full 38-leg browser gate at the final head, GREEN.** That gate has now
> been taken at `4f242f5` and it is **RED — `3 failed, 35 passed`**. This
> round's other product evidence — vitest, lint, typecheck, build — remains
> real and green, and **does not substitute for the gate**. **Sign-off does
> not proceed on this head, and ADR-0027 stays `proposed`.**

**The flake policy's two-run rule does not rescue this.** That rule makes a
gate RED after two consecutive failed runs at one SHA; it has never made a
single failed run green. `r1` was interrupted and counts in neither
direction. **Leg 38 is a product failure, and a product failure is never
re-run to green** — so no third run can turn this head green. The defect has
to be fixed. Round 19 is opened for it:
`docs/review/round-19-findings.md`.

---

## D20 — what the owner is being asked to decide

1. **Ratify or amend the nine dispositions** in D15 — nine ACCEPTED, nine
   FIXED, two carrying a declared remainder, one with its recommendation
   amended.
2. **Ratify RULING 5** (ADR-0025's F-1 → FIXED) and the Q1–Q5 rulings in D12,
   including **UXA-03 passing** on the condition the review itself attached.
3. **Ratify the suite disposition** (D13): the green gate is product evidence,
   not instrument trust, and the one-time leg-integrity pass is a standing
   obligation with **no scanner** — 7 of 38 legs read, 31 remaining.
4. **Ratify ADR-0026** as corrected by D8 and D9, or amend it further.
5. **Note that D10 and D11 exceed what was asked** — Q4 was queued for
   diagnosis and got one; the CI gap was invited to be dispositioned and got a
   step plus an assertion, with the build actually run to prove the step goes
   green. Both are the round's own judgement and are the owner's to reverse.
6. **Decide whether item 4 of D17 warrants a migration-budget amendment** at
   the next slice. It is the only owed item that may need DDL, and this round
   deliberately did not ask.

7. **The 38-leg browser gate has been TAKEN at `4f242f5`, and it is RED**
   (D19): `3 failed, 35 passed (21.6m)`. Run `r1` was interrupted and counts
   in neither direction; run `r2` ran to completion and reported a tally.
   **Leg 38 (A11Y-08) failed inside this round's own new `read_timeout` path,
   which makes it a product failure — and a product failure is never re-run to
   green.** There is therefore **nothing to ratify at this head**: decisions
   1–6 above stand as drafted, but none of them can be ratified until the gate
   is green. **Pending never counts as green, and neither does red.**

> **AMENDED AT ROUND 20 — THE GATE IS GREEN AND ITEM 7’S CONDITION IS
> DISCHARGED.** Item 7 is preserved exactly as written and is true of
> `4f242f5`. The permitted re-run was taken at round 20 at `1066e2d`: run
> `r4` died with the Docker engine within seconds of launch and is
> **INVALID** — its `2 ok / 13 x` is not a tally and must never be cited —
> and run `r5` is the re-run, **GREEN, `38 passed (5.1m)`**, corroborated
> four ways (ADR-0028 D7). Only `docs/` has changed between `1066e2d` and
> this head, so the green proves this head. **"Nothing to ratify at this
> head" no longer holds — and yet nothing is ratified**, because decisions
> 1–6 were put to the owner at round 20 and came back **NOT RULED**. The
> gate stopped being the obstacle; the ruling is now the obstacle. See D21.
>
> **AND THE RULING HAS SINCE COME (D22, 2026-08-27).** *"Nothing is
> ratified"* was true when written. **Items 1–6 are now ratified** — as
> CORRECTED, as AMENDED, as WRITTEN, as CORRECTED, UPHELD, and REJECTED-here /
> TAKEN-for-slice-7 respectively. **The ruling is no longer the obstacle
> either; only the merge remains, and it is the owner's own session.**

**⏸ THE GATE.** Dispositions ADR → **owner sign-off** → merge (**a MERGE
COMMIT, never a squash**, ADR-0006) are each their own fresh session. **The
owner is sole merge authority.** `main` is unmoved at `b0cc2b6`, so git will
offer a fast-forward — **`--no-ff` is what stops it.**


---

## D21 — round 20: what was PUT to the owner, and what was NOT ruled

**Nothing in this ADR is ratified.** The Status line above is unchanged and
still reads `proposed — BLOCKED at sign-off`. This section records what round
20 changed and what it did not, so that the markers in this document point
somewhere.

### What changed — evidence, and only evidence

| Fact | Verified at round 20 |
|---|---|
| The 38-leg browser gate | **GREEN, `38 passed (5.1m)`** at `1066e2d`, run `r5`. Run `r4` is INVALID — the Docker engine died mid-run — and its `2 ok / 13 x` is not a tally and must never be cited (ADR-0028 D7) |
| Does that green prove this head? | **Yes.** `git diff --name-only 1066e2d HEAD` outside `docs/` is **EMPTY** |
| The branch | **PUSHED.** `origin/slice/6b-care-inbox-app` == `c92877b` |
| CI | **GREEN at `c92877b` on BOTH events** — run #165 `push`, run #166 `pull_request`, each `status=completed` / `conclusion=success`, read anonymously |
| **D11's CI step** | `Build, and ZERO resolution warnings` **RAN FOR THE FIRST TIME AND PASSED — 17 s on each event** (step 19 of 21). Green-on-arrival is now observed, not predicted |
| The upgrade leg | **39 s** (`push`) / **38 s** (`pull_request`) — it genuinely rehearsed the increment rather than taking the ~1 s `HEAD == base` early exit |

**Every row above is an observation. Not one of them is a ratification.**

### What was PUT — and what came back

D20 items 1–6 were put to the owner at round 20, together with two separable
consequences argued in `docs/review/round-20-signoff-packet.md`: the ADR-0028
F-2 disposition move (§1.7(b)) and the corrected tally (§3).

**The owner did not rule on any of them. The ballot is OPEN.**

> **SUPERSEDED AT THE ROUND-20 SIGN-OFF (D22).** True when written, and
> preserved as written. **The ballot is now CLOSED: the owner ruled all eleven
> items on 2026-08-27 at head `90c99ae`.** Every "PUT · NOT RULED" in the
> table below is now **RULED** — see **D22** for ADR-0027's six and
> `ADR-0028` **D15** for ADR-0028's three. The paragraph below about
> ADR-0006's default is likewise spent: the default was never invoked because
> the questions were, in the end, answered.

| Item | Status at the close of round 20 |
|---|---|
| D20 item 1 — the nine dispositions in D15 | **PUT · NOT RULED** |
| D20 item 2 — RULING 5 and Q1–Q5 in D12 | **PUT · NOT RULED** |
| D20 item 3 — the suite disposition in D13 | **PUT · NOT RULED** |
| D20 item 4 — ADR-0026 as corrected by D8 and D9 | **PUT · NOT RULED** |
| D20 item 5 — that D10 and D11 exceed what was asked | **PUT · NOT RULED** |
| D20 item 6 — D17 item 4 and the migration budget | **PUT · NOT RULED** |
| D20 item 7 — *"nothing to ratify at this head"* | **CONDITION DISCHARGED** by `r5`, marked at its site. Never a decision item |

**The §2 verdicts in the round-20 packet are PROPOSALS written by that session
and they remain proposals.** None has been adopted, by default or otherwise.
Recording a proposal as a ruling would be a false historical record, which is
the exact failure this procedure exists to prevent.

### Why ADR-0006's default was NOT invoked

ADR-0006's default is *unanswered → NOT PLANNED*. It is deliberately **not**
applied here, because applying it would **close** a sign-off that was never
held: it would convert six open questions into six settled negatives on the
strength of nobody having answered them. **This section closes nothing.** The
default remains available to whoever does close the sign-off.

### What the obstacle now is

The gate was the obstacle at round 19. It is not the obstacle now. **The
obstacle is the ruling.** A plain-language statement of each open item, written
for a reader who does not carry this round's context, is at
`docs/review/round-20-owner-brief.md`.

**Unchanged and standing:** G4 and G7 block · G9 OPEN ·
`BAND_ARTIFACT_ALLOWLIST` EMPTY · slice-5B queue **39 OWED** · RCP-02 pending
tagged 7 · SIG-01 NOT absorbed · migrations **69 exact**, budget **7 of ≤ 7
SPENT** · `docs/coverage.md` untouched — **no row flipped, UXA-03 still
`pending`** · `main` unmoved at `b0cc2b6` · PR #12 open, **NOT merged** · no
real family data · **NOTHING IS PRODUCTION-ACTIVATED.**

**AMENDED (5B-queue reconciliation, 2026-08-27 — see ADR-0023 D25).** This
"39" is the strict-`OWED` row count of ADR-0023 D17 **as it stood at
`9682081`**. `R8/F-1` moved `OWED` → `FIXED` at `e0186ce` and the tally was
never re-derived. At `main` = `4f7a9d7` the table holds **38 strict `OWED`**;
the queue is **38 strict `OWED` + 1 `OWED/OWNER` (R7/F-4) = 39 rows carrying
owed work**, that 1 owner-blocked. The integer is unchanged — **its referent
is not.** The prose above is preserved exactly as written.


---

## D22 — ROUND-20 OWNER SIGN-OFF: the rulings on D20 items 1–6

**Ruled by the owner on 2026-08-27, against head `90c99ae`.** This section is
the record of what was decided. It is not a proposal and it does not argue —
the arguments are in `docs/review/round-20-signoff-packet.md` §2 and §3, which
remain **proposals** and are cited here only as the reasoning the rulings
adopted.

**How the ruling was taken, stated plainly.** The owner ruled the six
bookkeeping items (D20 items 1–5, and ADR-0028 D10 items 2–4) **as a block**,
on the explicit basis of trusting the round-20 audit's independent verification
of the arithmetic; and ruled **D20 item 6** and **the corrected tally** as
separate, individually-stated decisions. **Every ruling matched the packet's
proposed verdict — but a proposal is not self-ratifying, and none of these was
in force until it was ruled.**

### The rulings

| # | D20 item | **RULING** |
|---|---|---|
| 1 | The nine dispositions in D15 | **RATIFIED AS CORRECTED** |
| 2 | RULING 5 and the Q1–Q5 rulings in D12 | **RATIFIED AS AMENDED** |
| 3 | The suite disposition in D13 | **RATIFIED AS WRITTEN**, one consequence recorded |
| 4 | ADR-0026 as corrected by D8 and D9 | **RATIFIED AS CORRECTED**, and a convention **ADOPTED** |
| 5 | That D10 and D11 exceed what was asked | **UPHELD IN FULL** — neither reversed |
| 6 | Whether D17 item 4 warrants a migration-budget amendment | **REJECTED** at this sign-off · **TAKEN** as a slice-7 scoping question |
| 7 | *"nothing to ratify at this head"* | Not a decision item. **Condition DISCHARGED**, marked at its site |

**Item 1 — RATIFIED AS CORRECTED.** The nine dispositions stand: **9 ACCEPTED ·
0 DECLINED** is exactly right, the F-n → D-section map is correct in all nine,
and the severity distribution reconciles at 2 + 5 + 2. **The tally sentence
does not stand** and is corrected at its site in D15. No finding's *substance*
moves and nothing that was fixed becomes unfixed.

**Item 2 — RATIFIED AS AMENDED.** RULING 5 (ADR-0025's F-1 → FIXED) and
Q1, Q2, Q4 and Q5 are **RATIFIED AS WRITTEN**. **Q3/UXA-03 is AMENDED**: the
words *"and the row MOVES"* / *"and the row moves"* are **STRUCK** at both
sites; **"UXA-03 passes" STANDS.** D16 was right and D12 and D15 were wrong.
**UXA-03's cell at `docs/coverage.md:491` stays `pending`** — no row flips at
a sign-off and a `pending` row cannot move at all (ADR-0025 S16.7).

**Item 3 — RATIFIED AS WRITTEN, with one consequence recorded.** The 38-leg
denominator rests on **discovery** (`playwright test --list` → *Total: 38 tests
in 5 files*), so every ratio in D13 is sound. The green gate is **product
evidence, not instrument trust**; the one-time leg-integrity pass remains a
standing obligation; there is explicitly **no scanner**; 7 of 38 legs read,
**31 remaining**. **The consequence, now executed:** the GREEN 38/38 gate at
`1066e2d` upgrades exactly two *"the full-gate result stays owed"* clauses —
**UXA-01 and RLS-10** — from targeted-run evidence to **gate evidence**,
annotated at both cells in `docs/coverage.md`. **No row flipped and no cell
changed colour.**

**Item 4 — RATIFIED AS CORRECTED, and a convention ADOPTED.** D9's correction
is the round's strongest-verified number: **nine fetch call sites, seven
awaited and two eager**, at the exact cited lines, with the two
`lib/storage/fetch.ts` occurrences correctly excluded. D8's correction of both
documents' understated headlines holds. **ADOPTED: every cross-ADR citation
carries its document number** — `ADR-0026 D5`, never a bare `D5`. The
mis-cite at `ADR-0028` D7's opening is marked at its site. **The bare
citations already inside ADR-0027 are NOT rewritten** — the convention binds
new text.

**Item 5 — UPHELD IN FULL.** Neither D10 nor D11 is reversed. D10's diagnosis
verifies at the granularity it was claimed at — **two test files construct an
`ESLint` instance and load `eslint-config-next`, with 6 and 34 cases** — a
file-level check nearly produced a false finding against it, and did not.
**D11's honesty note is now spent:** the CI step it added, `Build, and ZERO
resolution warnings`, **has run and passed — 17 s on each event, step 19 of
21, at `c92877b` and again at `90c99ae`.** Its green-on-arrival is no longer
predicted; it is observed.

**Item 6 — REJECTED at this sign-off; TAKEN as a slice-7 scoping question.**
No migration-budget amendment is granted. **The budget stays 7 of ≤ 7 SPENT
and migrations stay 69 exact.** Three reasons, and the owner ruled with all
three stated: the **zero-DDL exit has never been evaluated** — D17 item 4
offers two exits and only one needs DDL, and *"a ruling records that a
one-round-trip window is accepted"* costs no budget; granting headroom at a
sign-off would reopen a closed budget in the session least equipped to scope
it; and D20 item 6's own wording — *"this round deliberately did not ask"* —
records that the round declined to make the case. **This forecloses nothing:**
the question is live at slice 7, where it can be decided by someone who has
scoped what the DDL would actually be.

### The corrected tally — RULED

> **Tally: 6 FIXED · 3 FIXED IN PART = 9. All 9 ACCEPTED · 0 DECLINED.**
>
> **Four rows carry a declared remainder** — F-1, F-2, F-3, F-4 — of which
> **three are fix remainders** (F-1, F-3, F-4, each now **FIXED IN PART**) and
> **one is a verification remainder** (F-2, which **stays FIXED** because the
> fix is whole and only its consequence is unobserved).
>
> **One fixed with its recommendation amended** (F-7).

The distinction this rests on — **fix remainder → FIXED IN PART**,
**verification remainder → FIXED with the observation OWED** — is stated
nowhere in the original document and is **ADOPTED at this sign-off**, because
the corrected tally cannot be written without it. Collapsing the two is what
produced the wrong count. **F-4's claim is additionally narrowed** to *"FIXED
for three named spellings; the class has at least eight members"* — marked at
D7's site.

**The re-tally shape is borrowed VOLUNTARILY** from the ratified ADR-0025
precedent on this branch. `chore/process-retune` is **UNMERGED and NOT
BINDING** — its own ledger says so and its `slice.md` says it is in force from
slice 7 — and nothing here is adopted from it.

### What this sign-off did NOT do

- **No coverage row flipped and no cell changed colour.** UXA-03 stays
  `pending`. UXA-01 and RLS-10 gained a ROUND-20 evidence annotation only.
- **No DDL.** Migrations **69 exact**, budget **7 of ≤ 7 SPENT**.
- **No product, test, config, migration or gate-harness code was touched** —
  which is what keeps the GREEN 38/38 gate at `1066e2d` valid for this head.
  Three OWED items are owed *because* of this constraint (see D15 of ADR-0028).
- **No merge.** The owner is sole merge authority and merge is its own session
  — **a MERGE COMMIT, never a squash** (ADR-0006). `main` is unmoved at
  `b0cc2b6`, so git will offer a fast-forward; **`--no-ff` is what stops it.**
- **No standing gate moved:** G4 and G7 still block · G9 STAYS OPEN ·
  `BAND_ARTIFACT_ALLOWLIST` EMPTY · slice-5B queue **39 OWED** · RCP-02
  pending tagged 7 · SIG-01 NOT absorbed · no real family data ·
  **NOTHING IS PRODUCTION-ACTIVATED.**

**AMENDED (5B-queue reconciliation, 2026-08-27 — see ADR-0023 D25).** This
"39" is the strict-`OWED` row count of ADR-0023 D17 **as it stood at
`9682081`**. `R8/F-1` moved `OWED` → `FIXED` at `e0186ce` and the tally was
never re-derived. At `main` = `4f7a9d7` the table holds **38 strict `OWED`**;
the queue is **38 strict `OWED` + 1 `OWED/OWNER` (R7/F-4) = 39 rows carrying
owed work**, that 1 owner-blocked. The integer is unchanged — **its referent
is not.** The prose above is preserved exactly as written.

**Effectiveness.** Ratification is effective on **CI green at the head that
carries this section, on both the `push` and `pull_request` events.** CI
cannot be green at a head the ruling commit has not yet created, and
*"docs-only"* is not *"cannot affect CI"* — process lint reads documentation.
