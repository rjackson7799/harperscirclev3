# Round-18 findings — slice 6B, the Care Inbox app increment

**Nothing in this file is a disposition.** Every finding below is the
reviewer's own text, with its severity and confidence as this session holds
them. The dispositions — accept or decline, each WITH the argument — are the
next session and their own ADR. **Nothing was fixed here**, and **no finding
below needs DDL**: the migration budget is 7 of ≤ 7 spent and this review
does not ask the owner to reopen it.

**Review head:** `1831926` on `slice/6b-care-inbox-app`, base `main` @
`b0cc2b6` (unmoved).
**Evidence head:** `7496cbc`. The docs-only RULE was re-checked at the review
head, not accepted: `git diff --name-only 7496cbc..HEAD` lists seven paths,
**every one under `docs/`**.
**CI confirmed at the review head by this session, both events** — push
**run 163** (`32927934474`, 257 s) and pull_request **run 164**
(`32927937726`, 241 s), both `completed` / `success`, attempt 1, at
`1831926`. Read anonymously from the public Actions API at the head under
review, not taken from the packet. Neither pending.
**PR #12** read from the public API: open, base `main`, head
`slice/6b-care-inbox-app` @ `1831926`, **not merged**, 51 commits / 117
files, `[DO NOT MERGE without owner sign-off]` in the title. No second PR
was opened.
**Packet under review:** `docs/review/round-18-packet.md`.
**As-built record under review:** `docs/adr/0026-6b-care-inbox-app-deltas.md`
(**proposed**).

## How this review was conducted

One session, read-only, instructed to attack the three places the build names
itself — F6's request budget, F2's class fix, and the OCR arrival — and to
rule on five questions the packet puts explicitly. A clean area reported clean
is a result; inventing findings is not. Every finding below quotes the line it
rests on and either constructs a concrete failure or is downgraded to an
observation.

**What this session ran and did not run.** No peer session held the tree at
review time (the only `node.exe` was Adobe Creative Cloud's known false
positive), but **no global command was run anyway** — `db:reset`, `test:db`,
`test:concurrency` and `test:e2e` were all left alone, and the browser gate
was not re-run. The kickoff declares that state settled, and CI runs 163/164
re-ran `test:db`, `test:concurrency` (twice each, counting the upgrade leg),
vitest, lint and typecheck from a cold database at this exact head, on a
machine that is not the build host. Every claim below is read from the tree,
from the public Actions API, or derived by running a regex against a literal
in `node` — nothing that writes.

**One API limit, respected:** artifact and log downloads require
authentication. **No suite tally in this document is quoted from CI**, and
none is quoted from the packet as if this session had confirmed it. Where a
number could only have been settled by running a suite, it is marked
unverified rather than asserted.

---

## What was re-checked independently, and held

These are the packet's own claims, re-derived rather than accepted.

| Claim | How it was checked | Result |
|---|---|---|
| The docs-only RULE at the review head | `git diff --name-only 7496cbc..HEAD` | 7 files, **all under `docs/`** — the rule holds where I read it, not only where it was written |
| The carry-forward reason | `git diff --name-only bc3bc85..HEAD -- supabase/` and `-- scripts/concurrency/` | **0 and 0.** The carry-forward stands on its stated ground |
| Migrations 69 exact; budget spent | `ls supabase/migrations/*.sql \| wc -l`; `git diff --name-only b0cc2b6..HEAD -- supabase/migrations/` | **69**; exactly one new migration, `20260825120001_payload_contract.sql` |
| Run 158 is not evidence about the tree | public API job/step list for runs 158 **and** 157 | Confirmed independently. 158 failed at step 8 `Start local Postgres`; steps 9–16, 19, 20 **skipped** — **no project code executed**. 157 at the **same SHA** is green across all twenty steps. The build's classification is correct and correctly bounded as *consistent with, not confirmed as* the ECR quota |
| CI runs no build and no browser gate | `.github/workflows/ci.yml`, and the 20-step list from the API | Confirmed. The twenty steps contain **no `npm run build`** and **no Playwright**. Both teed suite steps do run under `set -o pipefail` |
| §6.4 is enforced server-side, not merely in the client | `20260825120001:130-150`; `20260824120006:500`; the route | Confirmed. `hc.approve_proposal` refuses a high-risk approve without a real boolean `confirm_high`; the disabled button is a courtesy, not the gate |
| The five re-verified coverage line citations | each cited line read at HEAD | **All seven correct** — `:237` CIT-01/RCP-01, `:295` DEC-01, `:357` CNF-02, `:428` REV-02, `:462` REV-01, `:524` A11Y-07, `:583` A11Y-08. The re-verification the packet claims genuinely happened |
| AC-INBOX-3 is actually asserted over the rendered tree | `tests/routes/arrival.test.ts:204-215` | It is — one `proposal_id` per form, structurally, plus a batch-control denylist. Real, not a prose claim (but see **F-9** for where the coverage cell points) |
| Q2's `rendered` flag cannot drift under the metric | `tests/eval/corpus.test.ts:251-262`, `:264-328` | Held. The flag is asserted **equal** to what `normalizeArrival` renders, plus two exact-set pins. A rendering regression goes RED; it cannot silently shrink the recall denominator |
| F-1's residue is genuinely closed | `20260825120001:127-151`, `:345-370`; `064:21-27` | Both named classes closed, with real controls (`064:26`, `:27`) proving approvals are not narrowed. See **RULING 5** |
| `asUser()` and `ctx.params` are local | `lib/db/user.ts` | True. Cookie store + `createServerClient`; no network. The kickoff's claim about the two unraced calls is correct |

---

## Findings

### F-1 — The request budget bounds one route by leaking the resource every other family surface blocks on, and that pool has no bound at all
**Severity:** MAJOR
**Confidence:** high — every element is read from the tree; the consequence is
constructed, not observed.
**Where:** `lib/db/request-role.ts:70` (the pool), `:83` (`connect()`);
`lib/http/budget.ts:33-38` (the recorded limit, `:36`); `app/api/artifact/[id]/route.ts` (the nine races).
**Claim under test:** D20's — *"this route answers within fifteen seconds,
whatever goes wrong behind it"*, with the pool exposure recorded as a limit:
*"the budget protects THE PERSON, not the pool."*

**The shape is right and I am not attacking it.** Per-call bounds genuinely
do not compose; the pinning case (four nine-second awaits that must still
answer by twenty) is the correct test; racing `createSignedUrl` because it is
an outbound call that merely is not spelled `fetch` is exactly the right
generalisation of the class D18 named too narrowly. Naming each stall's own
state instead of collapsing them is right too.

**What I am attacking is the scope of the guarantee, and the OWED item's
severity.** D20 records the pool exposure as a limitation of the budget. It is
more than that — it is the load-bearing half of the guarantee, and without it
the budget makes the app's failure mode worse rather than better:

1. A raced-out DB read **keeps running and holds its pooled connection until
   it finishes** (D20 says so; `withRequestRole` confirms it — the client is
   released in a `finally` only after `fn` resolves).
2. That pool is a **process-wide singleton at `max: 10`**
   (`request-role.ts:70`), shared by **35 `withRequestRole` call sites across
   12 `lib/hc` modules** — the inbox list, the review screen, the decide
   route, senders, invites, throttle, upload, step-up.
3. `getPool().connect()` is called with **no `connectionTimeoutMillis`**. The
   `pg` default is `0` — *wait indefinitely*.
4. **Exactly one route in the repo imports `AnswerBudget`.** I checked:
   `app/api/artifact/[id]/route.ts` is the only consumer.

**Failure scenario.** Storage or the DB degrades — the condition the budget
exists for. Ten artifact requests each race out at 15 s; each returns promptly
and correctly, and each leaves its query running with a checked-out
connection. The pool is now empty. The **eleventh** request is not an artifact
request — it is a member opening their Care Inbox. `withRequestRole` calls
`connect()`, which has no timeout, and that page **hangs with no bound and no
named state**: precisely the F5/F6 failure mode (a request that never answers
at all), reappearing on every surface that has no budget, at the moment the
budget fires. The one route that was hardened is the one route that stays
responsive.

There is a second edge in the same mechanism: because the artifact route now
*returns* instead of hanging, the browser and the person are invited to retry,
and each retry acquires another connection while the abandoned queries still
hold theirs.

**And the collapse direction is wrong here, by the route's own standard.**
`noneOnOverrun` turns an overrun on `liveSessionClaims`, `readableArtifact`
and `readableRendition` into `notFound()` — the argument being that a row the
route could not read in time is one it does not have, and the caller learns
nothing either way. But the caller *does* learn something different, and it is
the one thing that matters to them: **whether to retry.** Under the systemic
stall above, every member is told their documents are **not found** —
an availability incident rendered as though it were data loss. D18's own
principle rejects exactly this: `storage_timeout` (504) was deliberately split
from `rendition_page_missing` (503) because *"collapsing them would have the
screen say 'page 3 is missing' about a page that is not missing"*, and the
route's comment says **"this route does not guess."** The DB-read arm guesses.
The §1.3 rationale for the one-404 shape is about **authorization** — 404 ≡
403, no oracle — and a timeout is not an authorization answer, so the oracle
argument does not reach it.

**What would close it** (none of it DDL, none of it product schema):
`connectionTimeoutMillis` and a server-side `statement_timeout` on the
request-role channel — D20's own OWED item, promoted from *limitation* to
*prerequisite*; and a reconsideration of whether an overrun on the session and
row reads should keep the 404 or take a named retryable state of its own.
Until the pool is bounded, **the sentence "this route answers within fifteen
seconds" is true and the sentence a person experiences is not.**

---

### F-2 — The OCR fix validates the branch that does not run, and the branch that does run is unchecked and fails silently
**Severity:** MAJOR
**Confidence:** high on the code; medium on the deployment consequence, which
depends on a hosted layout this session cannot observe.
**Where:** `lib/pipeline/ocr.ts:123-131` (`realPathOr`), `:133-157`
(`engineLocations`); `app/api/worker/[stage]/route.ts:364-379` (the
absorption).
**Claim under test:** D15 finding 3 / D17 — *"an absolute path that exists on
disk is used, anything else falls back to the installed tree under the project
root. The fallback is what makes this independent of a particular bundler's
behaviour rather than a bet on it."*

**The narrative is excellent and the fourth attempt is the right one.** Going
back to a literal specifier, keeping the validation, and passing a thunk is
the correct resolution of D17, and the three recorded wrong turns are worth
more than the fix. I am not disputing that §6.9 works at the evidence head —
leg 38 proves it does.

**The defect is that the validation and the fallback are the wrong way
round.** `realPathOr` is:

```ts
try {
  const resolved = resolve();
  if (isAbsolute(resolved) && existsSync(resolved)) return resolved;
} catch { /* … */ }
return join(process.cwd(), 'node_modules', ...fallbackSegments);
```

`existsSync` appears **exactly once in the module** — line 126, on the
`resolve()` result. The fallback is returned **unchecked**. And by the ADR's
own recorded evidence, inside the Next bundle `require.resolve` returns a
module id, not a path — before *and after* `serverExternalPackages`
(D15: *"externalising changed WHICH id came back, not that it was an id"*).
So in the running app the guard on line 126 **fails by design** and the
**unchecked `process.cwd()` fallback is the branch that actually locates the
engine**. The module validates the branch that never runs.

That fallback carries two assumptions, neither asserted anywhere: that
`process.cwd()` is the project root, and that `node_modules` is flat beneath
it. Both are true on this host — I confirmed the two fallback paths resolve
and exist here. Neither is guaranteed under pnpm, npm workspaces, a monorepo,
or a traced serverless bundle.

**And when the assumption breaks, nothing says so.** `bootWorker()` throws
`MODULE_NOT_FOUND`, which propagates out of `ocrRenderedPages` — and the
caller absorbs it:

```ts
} catch (err) {
  console.warn(`extract: machine-read text unavailable for ${msg.arrival_id}: …`);
}
```

The comment above it — *"An engine failure is warned and absorbed: a reading
aid must never fail the answer it aids"* — is a **correct product decision**
and I would not change it. But combined with the unchecked fallback it
reproduces **F3 exactly**: §6.9's reading aid absent from the running app,
the pipeline green, and a blind coordinator with an inaccessible record. The
one instrument that caught it last time is a **local-only** browser leg
against a **local** filesystem layout. There is no leg, and no CI step, that
would catch it anywhere else.

**Failure scenario.** The app deploys to a runtime whose `cwd` is not the
project root (or whose `node_modules` is not flat). `require.resolve` returns
an id → guard fails → fallback returns an absolute path that does not exist →
`createWorker` throws → `console.warn` → every image-only arrival produces
empty `pNNN.txt` siblings → the review screen renders *"No machine-read text
is stored for this page"* for every scanned page, forever, and every test in
the repo stays green.

**What would close it:** validate the fallback with the same `existsSync` the
resolve branch gets, and make an unresolvable engine a **named** startup or
first-use condition rather than a warning — so an absent reading aid says so
somewhere a person or an alert can see. This is a few lines in
`lib/pipeline/ocr.ts`. No DDL.

---

### F-3 — A raced-out access-log write still commits, so the §10.5 trail can record a read that was refused
**Severity:** MODERATE
**Confidence:** high — mechanism read from the code on both sides.
**Where:** `app/api/artifact/[id]/route.ts` (both `logArtifactRead` races);
`lib/hc/artifacts.ts:111-116`; `lib/db/request-role.ts:85-95`.
**Claim under test:** the route's — *"a trail that could not be CONFIRMED is
not a trail"* — and §1.3 step 6's **evidence before bytes**.

The route races the access-log write and, on overrun, returns `500
unavailable` and **refuses the read**. That half is right. But `AnswerBudget`
deliberately **does not cancel the work** (D20 states this plainly), and
`logArtifactRead` runs `withRequestRole`, which continues to
`await client.query('commit')` regardless of who is still listening. So the
`artifact_read` row **lands** after the route has already refused.

Evidence-before-bytes is designed so no bytes move without a trail. The
inverse now happens: a trail entry exists for bytes that **never moved**. In
a §10.5 evidentiary context that is a false positive in an access log — a
record asserting a member viewed a document they were served a 500 for.

The route's own justification does not reach this case: it argues about a
write that **could not be confirmed**, and this is a write that **succeeded
unobserved**. Those are different facts and the route currently treats them as
one.

**Failure scenario.** Storage is slow, `logArtifactRead` races out at the
budget, the person sees "unavailable" and never receives a byte, and the
circle's access log gains an entry saying they read the artifact at that
moment. If a family or a coordinator is ever shown who has read a document,
they are shown something untrue.

**What would close it:** decide explicitly which way this fails and say so at
the site — either the log write is not raced (it is the cheapest of the nine
and the one whose overrun is most costly to get wrong), or the entry is
written such that an unconfirmed one is distinguishable. Either is a change to
`lib/hc/artifacts.ts` / the route. **No DDL** — but note that a fully
satisfying fix might want a column, which would need an owner amendment, so I
am deliberately recommending the app-layer options.

---

### F-4 — The timestamp class is not closed; the scanner pins one spelling of a coercion that has three byte-identical spellings
**Severity:** MODERATE
**Confidence:** high — I ran the scanner's own regex against the alternatives.
**Where:** `tests/lint/timestamp-boundary.test.ts:33`; `lib/hc/rows.ts`.
**Claim under test:** D15 finding 2 — *"Fixed at the class"* — and the
slice's headline rule, *"a lesson recorded as a comment is a lesson that will
recur … if it can be a scanner, it must be."*

Making `isoText` the one sanctioned form is right, and the scanner's honesty
about its own naming bound (`select max(changed_at) as t` hid a site) is
exactly the posture this repo asks for. But the class is defined by the
**value that reaches the surface**, not by the function that produced it, and
the scanner matches only `String(…_at)`. I ran its regex against the
alternatives:

| Form | Output | Scanner |
|---|---|---|
| `String(row.received_at)` | `"Tue Aug 25 2026 …"` | **CAUGHT** |
| `` `${row.received_at}` `` | **byte-identical** | **MISSED** |
| `row.received_at + ''` | **byte-identical** | **MISSED** |
| `row.received_at as unknown as string` | a `Date` in a `string` field | MISSED |
| `received_at: row.received_at` | a `Date` in a `string` field | MISSED |

The first two are not near-misses. A template literal and a `+ ''` produce
**the same string as `String()`**, character for character, and therefore the
same `.slice(0, 10)` → `"Tue Aug 25"` → §2.7 refusal → the same render throw
that took all seven review legs red. Three interchangeable spellings; one is
pinned.

The last two matter for a different reason worth recording: they type-check
because `RequestRoleQuery.query` returns `Promise<QueryResult>` and pg's
`QueryResult<R = any>` makes `rows: any[]`. **The root cause of R5/F-1 and of
finding 2 is `any` at the row boundary**, which is what disabled the type
system that would otherwise have objected. A scanner over one syntactic form
is a strictly weaker instrument than typing the rows, and the slice's own rule
("if it can be a mechanism, it must be") points at the stronger one.

**What would close it:** one alternation in the regex closes the two identical
spellings today — cheap, and it keeps the class claim honest. Typing
`q.query` generically is the larger, better instrument and is a reasonable
thing to queue rather than do now. Neither is DDL.

---

### F-5 — A11Y-08's leg asserts a fragment of §6.9's label while its title and its coverage cell both claim it pins the exact label — and the shipped label is not the spec's string
**Severity:** MODERATE
**Confidence:** high — both strings read at HEAD.
**Where:** `e2e/review.spec.ts:583` (title), `:618` (the assertion);
`components/review/ReviewScreen.tsx:167`; `docs/coverage.md` A11Y-08 and
OCR-01; PRD §4.2 (`docs/PRD.md:1391`), TSD §6.9 (`docs/TSD.md:2177`, `:2501`).

The leg is titled *"A11Y-08: machine-read text — §6.9's **exact label**, per
page …"*, its inline comment says *"the screen offers it under §6.9's exact
label"*, and both the A11Y-08 and OCR-01 coverage cells lean on it. The
assertion is:

```ts
await expect(toggles.first()).toContainText('may contain errors');
```

That is a substring of the **warning clause only**. It does not check
`machine-read` at all. A regression renaming the control to *"AI transcript —
may contain errors"* keeps this leg green while breaking §6.9's letter, which
is the one thing the leg's title says it exists to protect.

**And the weak assertion is currently masking a real divergence.** §6.9 and
PRD §4.2 both specify the label **"machine-read — may contain errors"**. The
screen renders **"Machine-read text — may contain errors"**. In substance this
is fine — it labels the text as machine-read and carries the warning — and I
would not block on the wording. But it means that if the leg were strengthened
to assert what its title claims, **it would fail**, which is exactly how you
can tell the assertion was never doing that job.

**This is the F7/F8 class, third instance, and it was found at the round
rather than by the close-out** — which is the substance of the suite
disposition below.

**What would close it:** assert the full label string, and either align the
copy with §6.9's letter or record the deviation in
`docs/review/design-conformance.md` §2 the way the other deviations are
recorded. No DDL.

---

### F-6 — PRF-07's coverage cell still carries the 5B figure after this slice tripled it with the same method, on a rasterizer this slice deleted
**Severity:** MODERATE
**Confidence:** high.
**Where:** `docs/coverage.md` PRF-07 (row tagged `5B`).

The cell reads: *"RUN and recorded: worst warm p95 **6866 ms** (phone photo,
depth 4) — **~11%** of §13.2's 60 s budget, which says our machinery leaves
the provider **~53 s**."*

This slice re-ran PRF-07's own bench, with PRF-06's method verbatim, at the
evidence head, and measured **20 479 ms — scanned PDF at depth 4 = 34.1%**,
leaving the provider **~40 s**. The worst cohort changed too (phone photo →
scanned PDF). I checked: **neither the figure nor the percentage appears
anywhere in `docs/coverage.md`.** PRF-08's cell was updated; PRF-07's was not.

The 5B number does not merely lag — it describes machinery **this slice
removed**. B1 replaced the rasterizer (`mupdf` → `pdfjs-dist` +
`@napi-rs/canvas`) and B9 added OCR, and those are precisely the two changes
that move the scanned-PDF cohort. A reader of coverage.md — which is the
document the round rules from — is told our machinery uses ~11% of the budget
when this slice's own evidence says 34.1%.

I accept that PRF-07 is not one of the fourteen rows the packet tables, and
that its row is not *claimed* to have moved. That is the point: the slice
measured PRF-07's own quantity and did not carry the result back to PRF-07's
cell. This is the same class the slice names three times about line numbers —
*a document that points at a stale number is wrong from that commit onward.*

**What would close it:** annotate PRF-07's cell with the 6B re-measurement and
its cohort, keeping the 5B figure as history the way the `:400` pointer was
kept. No DDL.

---

### F-7 — Q4's own corrective is recorded as prose, which is the failure mode this slice's headline rule names
**Severity:** MODERATE (low as a defect, high as a precedent)
**Confidence:** high — checked in `package.json` and the ops doc.
**Where:** `package.json` (`test:app`: `vitest run`);
`docs/ops/e2e-local-gate.md`.

The fence transient is now **five occurrences across two fence files in one
slice**, and the fifth **cannot be named because that run was not teed**. The
packet's recommendation — *"tee the full vitest suite the way
`test:concurrency` already is, so that the next one arrives with a name"* — is
correct and I endorse it.

It has not been done. `test:app` is bare `vitest run`; there is no tee, no
`--reporter=…` to a file, and `docs/ops/e2e-local-gate.md` contains no
instruction to tee it. (CI does not close this either: its vitest step is
un-teed, and the retained-artifact step uploads only `pgtap-*.log`,
`concurrency-*.log` and `db-*.log`. In any case the transient is
load-dependent and local; a differently-parallel runner is not where it will
be caught.)

So the **sixth occurrence will arrive unnamed exactly as the fifth did**, and
ADR-0026's own closing rule is: *"a lesson recorded as a comment is a lesson
that will recur. If it can be a scanner, a manifest, or an exact-set
assertion, it must be."* This is one line of `package.json` or one line of the
ops doc.

**What would close it:** make the tee mechanical before the next full-suite
run. No DDL.

---

### F-8 — Both documents the round is asked to ratify open by understating their own headline by five
**Severity:** MINOR
**Confidence:** certain.
**Where:** `docs/review/round-18-packet.md:9` and `:146`;
`docs/adr/0026-6b-care-inbox-app-deltas.md:16`.

The packet's second paragraph: *"the close-out gate was RED, and it was red
for **three** real product defects."* Its §"The defects the gate found":
*"and all **three** in code no browser had ever executed."* ADR-0026's opening:
*"the close-out gate found **three** product defects."*

Their own bodies say otherwise — the packet's red→green table runs F5, F6, F7,
F8; ADR-0026's Consequences says *"it bought **eight** defects"* and enumerates
them; the PR body's title and first line say **eight**; the kickoff's headline
says **EIGHT**. The `three` framing is the pre-F5 draft left in the two places
a reader reaches first.

This is not pedantry in this repo's terms: ADR-0026 is the document being
ratified, its opening paragraph is what a future session carries away, and the
packet opens by warning about exactly this class (round-17 F-4 — a document
that was false by the time the review read it). Both are one-sentence
corrections.

---

### F-9 — Two OWED-list scoping inaccuracies, in the document that records the lesson about scoping this class too narrowly
**Severity:** MINOR
**Confidence:** high.
**Where:** ADR-0026 D18 (the seven-fetch tally); `docs/coverage.md` REV-02.

**(a) The unbounded-fetch count is nine, not seven.** D18 and the packet say
*"seven outbound `fetch` calls in `app/` and `lib/` are still unbounded"* and
enumerate them (postmark inbound, `upload/complete`, two TUS hops, outbound
mail, two client-side upload calls). At HEAD there are **nine** `fetch(` call
sites outside the bounded helper. The two omitted are the eager fires —
`app/api/worker/relay/route.ts:116` and
`app/api/worker/[stage]/route.ts:108` — both `void fetch(…).catch(…)`.

**Excluding them is defensible**: nobody waits on them, so they are outside
D20's corrected class ("a route a person is waiting on"). But they are
unbounded outbound fetches with no signal, and D18's own text says undici's
~300 s floor *"is not a bound"* — so they are a resource question even though
no person waits. The finding is that they are **omitted silently** from a
count stated as a count, in the very document whose D20 records that this
class was scoped too narrowly the first time.

**(b) REV-02's coverage cell points at the wrong file for AC-INBOX-3.** The
cell says the rendered-tree assertion that no control approves more than one
proposal *"rides the same leg"* — `e2e/review.spec.ts:428`. I read that leg in
full: it asserts the version refusal, the in-place re-render and that nothing
landed. There is **no batch-control assertion in it**. The assertion is real
and is good — it is at `tests/routes/arrival.test.ts:204-215` — but a reader
following the citation will not find it.

**What would close both:** state the fetch count as nine with the two
fire-and-forget calls named and excluded on that stated ground; re-point
REV-02's citation. No DDL.

---

## The rulings this round was asked to make

### RULING 5 — ADR-0025 F-1 moves from FIXED-IN-PART to **FIXED**

Both residue classes ADR-0025 D16 named are closed, and I checked each rather
than accepting the cell:

- **`22P02` on the conflict arm's `domain`** — the cast is now performed for
  **every** outcome (`20260825120001:345-370`), not `use_new` alone, and
  converted to `approval_refused`. Driven at `064:21` (`keep`) and `064:22`
  (`keep_both`) — including the arm the file previously did not exercise, and
  reachable **with no edit at all**, which was the sharp part of the original
  finding.
- **`22023` on `confirm_high`** — a top-level type check
  (`20260825120001:147-150`), driven at `064:23`.

Plus two contract closures the residue's conditions asked for — a non-object
`p_edits` (`064:24`) and an unknown top-level key (`064:25`), both fail-closed
and both placed **before any row is written** — and, critically, **controls
proving approvals were not narrowed**: `064:26` (a well-formed `keep_both`
still commits its task) and `064:27` (a real boolean `confirm_high` still
approves the high-risk item). A residue fix without those controls would be a
narrowing dressed as a fix; these are there.

This ruling rests on pgTAP evidence that this session did not re-run. It is
corroborated by CI runs 163/164, which ran `test:db` from a cold database at
this head, twice counting the upgrade leg — and nothing under `supabase/` has
moved since `bc3bc85`, which I verified. **DEC-01's cell recorded; the round
rules: F-1 is FIXED.**

### Q1 — `@tesseract.js-data/eng` as DATA: **accept**, agreeing with the owner's position

The alternative is to fetch the same bytes from a CDN at runtime, which B2
made a test failure on purpose, and the no-remote-fetch posture is the thing
worth protecting. The package is the engine's own data, resolved locally, the
identical bytes the library's `lstmOnly` default names. Accepting it as data
for the Q3 engine rather than as a fourth argued runtime dependency is the
right call. I note it is not a free acceptance — **F-2 is the cost**: the
resolution path this creates is the one that is unchecked.

### Q2 — the `rendered` flag: **ratify**

The encoding matches D11's language, and the hazard I went looking for is
closed. My concern was that a **measured** flag can move under its own metric:
if a rendering regression stopped painting a glyph, `rendered` would flip to
false, the label would leave the recall denominator, and recall would improve
because the product got worse. It cannot happen quietly —
`tests/eval/corpus.test.ts:251-262` asserts the manifest's flag **equals** what
`normalizeArrival` actually renders, label by label, and two exact-set pins
(the 28 carrying items, the unreadable set) sit behind it. A rendering
regression goes RED. Excluding unrendered labels from recall is also
substantively right: a label the material carries no rendition of cannot be
returned by any reader, so counting it as a miss would measure the corpus's
labelling ambition rather than the model — and booking a "match" against one
as a false positive is the correct treatment of what can only be a
hallucination or a leak. **Ratified.**

### Q3 / UXA-03 — copy read at this gate: **pass, with F-5's wording note**

The review screen's copy is plain, honest and free of the failure modes this
project keeps naming. *"This item changed since you looked — your decision was
not applied"* says what happened and what did not. The rejection vocabulary
(*"It's wrong" · "Already handled" · "Not important" · "Something else"*) is
bounded and human. The receipt sentences (*"Rejected — nothing was written." ·
"Approved and written to the record." · "Superseded by a newer reading of this
document."*) each say a fact rather than a mood. The OCR absence states
*"No machine-read text is stored for this page"* rather than implying failure,
and the load failure is distinguished from it. **UXA-03 reads green** on
everything except the §6.9 label string, which F-5 covers. I would keep the
row pending only if the round wants the label aligned first; otherwise it can
move.

### Q4 — the fence transient: **queue for diagnosis, and see F-7**

Agreed that five occurrences of one shape across two files stop being noise. I
have nothing to add to the diagnosis. My finding is narrower and it is about
the corrective, not the transient: the corrective has not been made
mechanical, so the sixth arrives unnamed too.

### Q5 — `lib/hc/review.ts` has no live-DB module test: **agreed, and it should not close here**

The gap is correctly named and correctly left open. I want to record *why* I
think leaving it open is right rather than a deferral: the module's boundary
is now pinned by a scanner and by seven browser legs, and the specific defect
that escaped (F2) is closed at the class. Adding a `tests/hc/` module test to
a slice with no budget left, at the end of a nine-run close-out, is how a
close-out acquires an eighth defect. **Queue it as the first item of the next
slice's owed work**, where F-4's stronger instrument (typing the row boundary)
naturally belongs with it.

### The suite disposition — ADR-0026 D15's argument, attacked

D15 argues that eight defects reaching the close-out gate is **the gate
working**. That argument is half right, and the half it gets wrong is the half
this round was asked to rule on.

**Where it is right:** F1, F2 and F3 were in code no browser had ever
executed, were invisible to a green suite, and the gate found each of them the
first time real execution crossed the gap. The browser gate earned its
existence in this slice, and R5/F-6's pinned manifest earned its existence
twice.

**Where it fails.** Three of the eight — F4, F6 and F8 — were surfaced by runs
that existed only to confirm a previous fix, and F4 was a **regression the
close-out itself introduced**. A gate that catches defects the close-out
created is evidence that the close-out was churning; it is not evidence that
the gate is well-calibrated. Those are different claims and D15 collapses
them.

**And the disqualifying part is F7 and F8 themselves.** Leg 17 could only pass
on the first gate run after a storage reset. Leg 33 ran at 60–70% of its 120 s
budget on **every run it ever passed**. Both were green for the entire slice
while checking less than they claimed. **I then found a third at this review**
— F-5, where A11Y-08's leg asserts a fragment of the label its own title says
it pins. That is three of thirty-eight legs, ~8%, and **all three were found
by accident** — two by a run that happened to go red, one by a reviewer
reading the assertion against its title. There is no mechanism in this repo
that looks for the fourth.

**So the honest statement is:** the gate caught what it caught, and this slice
has **no measurement of what it missed**. The three known instances are the
only available estimate of the miss rate, and it is not zero.

**My recommended disposition.** Accept the green gate as evidence for the
product at this head — it is real, it is the strongest evidence the slice has,
and `r9` is a genuine 38/38. But **do not accept it as evidence that the suite
is a trustworthy instrument**, and attach a standing obligation: a **one-time
leg-integrity pass over all 38 legs**, reading each leg's title and coverage
citation against what it actually asserts. I specifically do **not** recommend
a scanner for this. D21 declined to build a scanner for "legs whose cost scales
with fixture size" on the ground that it would be a rule with one instance
written to look rigorous, and that judgement was **correct**. The same
reasoning applies here: title-versus-assertion is a reading task, not a
pattern-matching one, and a regex that tried it would produce exactly the
false confidence D21 refused to manufacture.

### The CI gap — yes, disposition it, and the packet's framing understates the fix

The packet names the gap honestly and invites the round to decide whether it
is ours. **It is.** Adding `npm run build` to `ci.yml` is not DDL, not product
code, and F4 cost two gate runs and two misdiagnoses on a build-time signal.

**But adding the build step would not, by itself, have caught F4.**
`Can't resolve <dynamic>` is a **warning**. A build that emits it 556 times
still exits 0, and a CI step that only runs `npm run build` would have gone
green through the whole of D17. The fix has to be the step **plus** an
assertion that the resolution-warning count is zero — which is exactly the
signal ADR-0026 says was the tell, and exactly the quantity the evidence
table already quotes. **I did not run a build to confirm the exit code**
(the tree is shared and `.next/` is shared state), so I state that as a bound
rather than a result: if `next build` does fail on it, the step alone
suffices; if it does not, the step alone is theatre.

---

## Observations — not findings

1. **`realPathOr`'s comment is the best writing in the slice.** The three
   killed hypotheses, including the binding-name one, are worth more than the
   fix. F-2 does not detract from that; it is the same rule applied one level
   deeper than the author applied it.
2. **The line-drift discipline worked.** Three drifts were recorded and the
   fourth did not happen: all seven cited leg lines are exactly right at this
   head, and every citation carries its title as well. The belt-and-braces
   convention is doing its job and should stay.
3. **`docs/coverage.md` carries two rows for `REV-01` and two for `CTX-01`.**
   Both predate 6B, and a `grep -m1` for either returns the older row. Not
   this slice's defect; worth an id-uniqueness assertion whenever coverage.md
   next gets mechanical attention.
4. **AC-INBOX-3's batch denylist is three phrases** (`approve all|select
   all|approve everything`). The structural half — at most one `proposal_id`
   per form — is the real guarantee and is sound, so this is a note, not a
   finding.
5. **The `r4`/`r5` misdiagnosis entry belongs in the transients list**, and
   keeping it there as the counter-example is the right editorial call. It is
   the most useful paragraph in ADR-0026 for a future session.

---

## What this review did not cover

- **The browser gate was not re-run.** Every claim about `r9` (38 passed,
  7.6 m) is the build's, not this session's. No CI run can upgrade it.
- **No suite tally in this document is confirmed by this session** — not
  vitest's 877/877, not `test:db`'s 1622/65, not `test:concurrency`'s 75/75.
  CI ran all of them green at this head, but log and artifact reads are
  authenticated and the tallies are not readable anonymously.
- **The PRF-07 bench was not re-run.** F-6 is about where its result was
  recorded, not about whether the numbers are right.
- **`npm run build` was not run** — see the CI-gap ruling for why, and for the
  bound that leaves.
- **The hosted/deployed runtime was not observed**, which is why F-2's
  consequence is stated as a scenario over an unchecked assumption rather than
  as an observed failure.

---

## Summary

| # | Severity | Finding | Needs DDL |
|---|---|---|---|
| F-1 | **MAJOR** | The request budget's guarantee does not compose across the app; the pool it leaks into is `max: 10` with no connect timeout, and only one route has a budget | no |
| F-2 | **MAJOR** | `realPathOr` validates the branch the bundle never takes; the branch it does take is unchecked and its failure is absorbed with a `console.warn` | no |
| F-3 | MODERATE | A raced-out `logArtifactRead` still commits — the §10.5 trail can record a read the route refused | no |
| F-4 | MODERATE | The timestamp scanner pins one of three byte-identical coercions; the class is narrowed, not closed | no |
| F-5 | MODERATE | A11Y-08's leg asserts a fragment of §6.9's label its title claims to pin — and the shipped label is not the spec's string | no |
| F-6 | MODERATE | PRF-07's coverage cell still carries the 5B figure this slice tripled and superseded | no |
| F-7 | MODERATE | Q4's own corrective (tee the vitest suite) is prose, not a mechanism | no |
| F-8 | MINOR | Packet and ADR-0026 both open saying "three defects" where their bodies, the PR body and the kickoff say eight | no |
| F-9 | MINOR | The OWED fetch count is nine, not seven; REV-02's cell cites the wrong file for AC-INBOX-3 | no |

**Rulings:** **ADR-0025's F-1** (round 17's, not this table's) → **FIXED**,
per RULING 5. Q1 → **accept as data**. Q2 →
**ratify**. Q3/UXA-03 → **pass**, with F-5's note. Q4 → **queue**, see F-7.
Q5 → **agreed, stays open**. The suite → **green accepted as product
evidence; not accepted as instrument trust**, with a one-time leg-integrity
pass and explicitly **no** scanner. The CI build gap → **ours**, and the fix
is the step **plus** a zero-warning assertion.

**Nothing here was fixed, and nothing here needs the migration budget
reopened.** The gate stands: dispositions ADR → owner sign-off → merge
(**a merge commit, never a squash**), each its own session. `main` is unmoved
at `b0cc2b6`, so git will offer a fast-forward — `--no-ff` is what stops it.
