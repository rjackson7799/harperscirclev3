# ADR-0031 — round-23 dispositions: the five Step-4 rows, and an `OWED` class that reaches zero

**Status: PUT, NOT RULED.** Proposed on evidence, awaiting owner sign-off.
**No verdict in ADR-0023 D17 has moved.** They move in a second commit,
after sign-off, each carrying a pointer back here — the ADR-0025 D6
precedent, as rounds 21 and 22 did.

**Head:** `main` = `2a652bd`. **Branch:** `docs/round-23-dispositions`.

---

## Context — the same-day round, for the reason ADR-0030 gave

Round 22 left the queue at six rows — five distinct items, R2/F-6 = R7/F-5
collapsing — and named them as Step 4's entire scope. Step 4 ran the same
day. Every one of the six is fixed and merged:

| Row | Fixed by | Merged |
|---|---|---|
| **R2/F-2** | the timeout leg dispatches; two legs, one per branch | `12840ac` (PR #19, `3c39e23`) |
| **R2/F-12** | the fixture records request headers; every absence runs on both dispatchers | `29e5c9e` (PR #19, `3c39e23`) |
| **R2/F-6 = R7/F-5** | `usage` is READ — the worker logs the four counters at both consumption sites | `80e9a75` (PR #19, `3c39e23`) |
| **R2/F-4** | ONE construction site — the harness builds through the worker's own builders | `6323ad1` (PR #19, `3c39e23`) |
| **R2/F-3** | the JPEG codec and quality join the identity (`hc-6b-1 → hc-6b-2`) | `a69bb0e` (PR #19, `3c39e23`) |
| **R2/F-3**, the residue | the user-turn instructions and the delimiters join the identity (`hc-6b-2 → hc-6b-3`) | `2b0b76a` (PR #20, `2a652bd`) |

Both were build sessions and neither moved a verdict, correctly. So D17
now asserts `OWED` for six rows the tree has fixed, and ADR-0030's own
closing sentence — *"D17 and the tree now agree"* — was true at `cfaa7d8`
and false again at `3c39e23`, one day later. That is not a defect in
ADR-0030; it is the condition ADR-0030 exists to name, recurring on
schedule. The remedy is the same: a round close enough behind the work to
rule, while the evidence is one `git show` away.

One thing is different this time, and it is recorded rather than folded.
R2/F-3's row names **three** omissions from the configuration hash — *"the
trailing user instruction, the delimiter builders, and `asJPEG(90)` + the
codec choice"* — and Step 4 covered the third. Ruling the row `FIXED` on a
third of what it says, or carrying the other two outside D17, is the drift
pattern D25 was written against. The owner ruled that the residue be fixed
FIRST, while a second hash move is still free (no G9 run exists; after one,
the same fix costs a paid re-run), and that this round then rule the row on
the whole of its text. PR #20 is that fix. This round opens on it.

---

## D1 — how the re-verification was done

As rounds 21 and 22 did: **the property each finding asserts, at its site,
in the code — never the commit message claiming a fix.** A merged PR is
evidence that someone said so; the site is evidence that it is so. Every
bullet below names a `file:line` at `2a652bd`.

The tally instrument is the D25 row-parser, validated before it is trusted
(the ADR-0029 D1 near-miss): it reproduces D25's published eight-class
tally at `4f7a9d7` (28 · 38 · 21 · 19 · 3 · 2 · 1 · 1 = 113) with the bolded
severity cells and the two compound verdicts handled, and it is run against
the table at `2a652bd` before and after the rewrite in the sign-off commit.

**Not taken: a fresh browser gate.** PR #19 carried the 38-leg gate (38/38
on its second run; the first run's seven onboarding failures were a clamd
signature reload starving the DB pool on the 8 GB host, traced in the PR
body and re-run clean), and CI is green on `3c39e23` and `2a652bd`. PR #20
changes no byte on the wire. Nothing here changes code, so there is nothing
new to gate.

---

## D2 — R2/F-2: the hang leg is dispatched, and OUR timeout is what cuts it

**The property:** the leg that claims *"a hanging provider is cut off by
OUR timeout"* must actually reach the fixture's `HC-FIXTURE-HANG` arm, and
the cut must land at the budget — not at a platform limit minutes away and
not at the no-budget guard.

**Verified at `2a652bd`:**
- `tests/ai/adapter.test.ts:402-415` — the no-dispatch branch has its own
  leg: a deadline of +1.5 s is inside `FINALIZE_RESERVE_MS`, the outcome is
  `unavailable` with detail `no provider budget inside the lease`, and the
  fixture's request log **does not grow**.
- `tests/ai/adapter.test.ts:417-442` — the hang leg's deadline is
  `FINALIZE_RESERVE_MS + 1_500`, so the budget is 1.5 s and the request IS
  dispatched: the request log grows by one carrying the marker, the detail
  matches `/timed out/i` (the SDK's "Request timed out."), and the elapsed
  time lands at the budget (≥ 1 450 ms, < 6.5 s).
- `lib/ai/client.ts:227` (the `timeoutMs <= 0` guard) and `:243`
  (`{ timeout: remainingMs }` on every dispatch) — the two branches the two
  legs separate.

**Recorded:** the deadline is 1.5 s past the reserve, not the +240 s the
triage suggested — a dispatched hang runs its whole budget, and 220 s is not
a unit test; it is the same branch at a cost the suite can pay. The commit
proved the leg RED four ways (deadline shrunk back → the fixture was never
contacted; `{timeout}` removed → the SAME failure in 24 ms, which is D7's
story; a platform-sized 600 s timeout → the leg times out at 20 s; the
no-dispatch guard removed → the reserve leg fails on the detail).

**PROPOSED: `OWED` → `FIXED`.**

---

## D3 — R2/F-12: the fallback absence can fail, on both dispatchers

**The property:** an absence asserted over the wire must be asserted over
the surface that would carry the thing — `server-side-fallback` is an
`anthropic-beta` **header** value, so the header set must be recorded and
the assertion made against it; and the four "never on the wire" absences
must run against an interpret request as well as an extract one.

**Verified at `2a652bd`:**
- `scripts/ai-fixture-server.mjs:310` — each recorded request carries
  `headers` (node's lower-cased names) beside `raw` and `body`.
- `tests/ai/adapter.test.ts:123-184` — the block runs its four absences via
  `describe.each` over BOTH dispatchers (`:148`); `lastHeaders()` (`:140`)
  refuses an unrecorded or empty header set outright; the fallback leg
  (`:149-163`) first proves the set is real (`anthropic-version` present),
  then asserts `anthropic-beta` carries no `server-side-fallback` and that
  no header name or value mentions a fallback; the Files API leg (`:165`)
  sweeps the headers for a files-api beta.

**Recorded:** probed before deciding the fix — configured exactly as
`lib/ai/client.ts` builds it, the SDK sends `anthropic-version`,
`x-api-key`, the `x-stainless-*` family and content headers, and **no
`anthropic-beta` header at all**. That is why the leg proves the set is
real before asserting an absence over it: an absence over nothing is the
defect this row named. The commit's RED (b) — `defaultHeaders:
{ 'anthropic-beta': 'server-side-fallback-2026-07-01' }` injected into the
client constructor — failed both fallback legs and was reverted; it is the
commit's evidence, not re-run here.

**PROPOSED: `OWED` → `FIXED`.**

---

## D4 — R2/F-6 = R7/F-5: `usage` has a reader

**The property:** the four counters the adapter carries back on every ok
result — and above all §6.6's measurement, `cache_creation_input_tokens` /
`cache_read_input_tokens` — must be CONSUMED somewhere a person can read,
so that "checked, not assumed" is a fact about the running worker and
`ai-provider.md`'s SMOKE-6 row has something to evidence.

**Verified at `2a652bd`:**
- `app/api/worker/[stage]/route.ts:210-238` — `logProviderUsage(stage,
  arrivalId, usage)`: one `console.info` line, `worker/<stage>: provider
  usage for arrival <id> — input_tokens= output_tokens=
  cache_creation_input_tokens= cache_read_input_tokens= prefix_cache=`
  (the last derived from the two counters: `none | write | read |
  write+read`), in the `worker/<stage>: …` shape of this route's other
  signals.
- `route.ts:443` (the extract arm) and `:745` (the interpret arm) — called
  immediately after each arm's not-ok exits, so a failure logs no
  measurement.
- `tests/routes/worker-extract.test.ts:682-728` and
  `tests/routes/worker-interpret.test.ts:722-773` — the line carries the
  VALUES the adapter returned (4321/987/613/1207 and 2048/311/0/1536,
  distinct from the mocks' zeros), `prefix_cache=read` and `=none` are
  derived correctly, and a non-ok outcome logs nothing.

**Recorded:** the row said *"no log, no column, no metric"*. This is the
log — deliberately not a column (**NO DDL**; 69 exact, 7 of ≤ 7 spent) and
`info`, not `warn`, because a measurement is not a defect signal and the
gate's fixture always answers zeros. SMOKE-6's box stays **☐**: ticking it
is the owner's act at activation, reading a real response. One capture
fact for whoever reads that row next: `playwright.config.ts` sets no
`stdout:` on its webServers, so Playwright's default (`stdout: 'ignore'`)
keeps this line OUT of the gate log — 0 hits on a 38-green run, and Next's
own "Ready in" is absent for the same reason. The deployed worker's
platform log captures stdout; that is where SMOKE-6 is read.

**PROPOSED: R2/F-6 `OWED` → `FIXED`; R7/F-5 `OWED` → `FIXED`, with it.**

---

## D5 — R2/F-4: ONE construction site

**The property:** the G9 harness must send what the worker sends BY
CONSTRUCTION — the same code building the blocks and the same code
building the envelope — not by two hands writing the same six fields.

**Verified at `2a652bd`:**
- `lib/ai/extract.ts:127-164` — `ExtractionSource`, `extractionBlocks()`
  (images, the delimited text layer if any, the user-turn instruction) and
  `extractionCall()` (the call minus its timeout); `:170` —
  `extractFromArrival` dispatches `{ ...extractionCall(input, notes),
  timeoutMs }`.
- `lib/ai/client.ts:158-181` — `ProviderRequest` and `messageParams()`,
  THE Messages envelope; `:233` and `:243` — `callProvider` sends exactly
  it.
- `scripts/eval/run.ts:81-92` — `requestFor` is normalize →
  `messageParams(extractionCall(normalized, []))` and builds nothing; the
  hand-built blocks, the hand-built envelope and the `as unknown as` cast
  on the batch params are gone.
- `tests/ai/adapter.test.ts:705-739` — `messageParams(extractionCall(input,
  []))` deep-equals the body the fixture received from
  `extractFromArrival(input)`; the builder is the same three steps with and
  without a text layer; and `run.ts` carries no `type: 'image'`,
  `max_tokens:`, `output_config:` or `delimitedDocumentText(` literal.

**Recorded:** round 21 wrote *"R2/F-4 is NOT in this set … narrowed, not
fixed, and stays `OWED`"* (ADR-0029 D2). That was right then; the pointer
on the row accretes it. Compared line by line before deciding: the blocks
were the same three steps and the envelope the same six fields, so the
shapes did not need to differ and the fix is one builder, not two recorded
reasons. The only shape that genuinely differs is the Batch API's
`{custom_id, params}` wrapper, and it is the provider's. The interpret
dispatcher still assembles its own blocks inline (`lib/ai/interpret.ts`),
but no second dispatcher builds an interpret request, so the row's defect
has no interpret analogue. This commit did not move the hash: it is code,
not configuration, and the dry-run reported the unchanged pair.

**PROPOSED: `OWED` → `FIXED`.**

---

## D6 — R2/F-3: everything the model sees is a covered input

**The property:** `inferenceConfiguration()` — and therefore
`configurationHash()` and `PROMPT_VERSION` — must cover every input that
changes what the model is given: the encoding the pixels leave through,
the sentence each dispatcher appends to the user turn, and the delimiters
that mark the data. The row named all three.

**Verified at `2a652bd`:**
- `lib/pipeline/render.ts:81-83` — `PNG_CODEC`, `JPEG_CODEC`,
  `JPEG_QUALITY` are named exports; `:466`, `:757`, `:843` — every encode
  site uses them and none carries its own literal
  (`tests/pipeline/render.test.ts:182-195` asserts exactly two
  `encode(JPEG_CODEC, JPEG_QUALITY)` and two `encode(PNG_CODEC)`, and no
  `encode('jpeg', <digit>` anywhere).
- `lib/ai/config.ts:171-174` — `render.encoding = { lossless: 'png',
  continuous_tone: { codec: 'jpeg', quality: 90 } }` (PR #19).
- `lib/ai/prompt.ts:84-92` — `EXTRACT_USER_INSTRUCTION_TEMPLATE`,
  `extractUserInstruction()`, `INTERPRET_USER_INSTRUCTION`: the ONE home
  of the two sentences; `lib/ai/extract.ts:146` and
  `lib/ai/interpret.ts:114` read them from there and carry no literal.
- `lib/ai/config.ts:152-160` — `prompts.user_turn { extract, interpret }`
  and `prompts.delimiters { document_text, subject_record,
  extracted_facts }`, the latter as each builder's output on a placeholder
  so the exact wrapping bytes are hashed (PR #20).
- `lib/ai/config.ts:221` — `PROMPT_VERSION_NAME = 'hc-6b-3'`, with both
  bumps and both owner rulings recorded in the docblock above it;
  `tests/ai/adapter.test.ts:497-505` — `PINNED = 'ff1435280a36f8eb'` and
  the pair `hc-6b-3+ff1435280a36f8eb`; `tests/ai/adapter.test.ts:751-764`
  and `:777-832` — the encoding and the user turn are in the render and
  prompts blocks, and the hashed template IS the last content block each
  dispatcher puts on the wire.

**Recorded:** the hash moved twice for this row — `35dad2ec988dad6f →
8ccb04d886cc1b6f` (`hc-6b-1 → hc-6b-2`, PR #19) and `8ccb04d886cc1b6f →
ff1435280a36f8eb` (`hc-6b-2 → hc-6b-3`, PR #20) — and the name moved with
it both times, each an owner decision asked and taken on 2026-08-28 (over
keeping the name, and over `hc-6c-1` the first time). `hc-6b-2` existed one
day and nothing ran against it. Both moves are §6.10 identity changes and
neither is DDL. **What the model sees is unchanged by either:** the
rendered pixels were proven byte-identical between pristine `6584000` and
PR #19's tree (sha256 of every encoded page of the development corpus,
16/16), and PR #20 moved two sentences and three tags to a new home without
changing a byte on the wire — every existing wire assertion held as written.
No G9 run existed at either move, so none was wasted; **any future eval run
is against `hc-6b-3+ff1435280a36f8eb`**, and `ai-provider.md`'s G9-1
sequencing condition ("R2/F-3 MUST LAND BEFORE THIS RUN") is now met in
full.

**PROPOSED: `OWED` → `FIXED`.**

---

## D7 — R2/F-15's accepted correction, carried out (recorded, not ruled)

R2/F-15 (`ACCEPTED-NOTE`, round 16) said `config.ts`'s reason for
`MAX_TOKENS = 24_000` was backwards — the SDK's non-streaming threshold is
~21 333 and its guard is *bypassed* by supplying an explicit timeout, not
satisfied — and that *"the comment must stop claiming the opposite of the
SDK's behaviour."* The comment never changed. Step 4 re-proved the row
without looking for it: R2/F-2's RED (b), with `{ timeout }` deleted from
`callProvider`, failed in 24 ms without contacting the fixture, because SDK
0.120.0's `_calculateNonstreamingTimeout` throws *"Streaming is required
for operations that may take longer than 10 minutes"* (675 s > 600 s) and
the adapter maps that to `unavailable`. The explicit timeout is what makes
the worker dispatch at all.

`lib/ai/config.ts:93-104` (PR #20, `8ee2e79`) now says exactly that. The
row is already `ACCEPTED-NOTE` and stays so; nothing moves. Recorded here
so the next reader of R2/F-15 finds the correction carried out rather than
merely accepted.

---

## D8 — the tally, re-derived

Counted by row over D17's Verdict column at a named head, with the parser
validated against ADR-0023 D25's published tally before it is trusted.
Never carried forward.

**At `2a652bd`, before this round:**

> 61 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 6 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

**After the rulings in D2–D6:**

> 67 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 0 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

**Self-check:** the residual `OWED` set must be **EMPTY**. The six edits are
61 + 6 = 67; the other five classes must not move; any member left in
`OWED` means a ruling went astray. The `OWED` class has had members since
D17 was written at round 16; this is the first tally at which it has none.

---

## D9 — what does NOT move

No coverage row flips (ADR-0025 S16.7) · no `pending` row moves · **NO
DDL**, migrations 69 exact, budget 7 of ≤ 7 SPENT · G4 and G7 block · **G9
OPEN** · `BAND_ARTIFACT_ALLOWLIST` EMPTY · RCP-02 pending tagged 7 ·
SIG-01 NOT absorbed · no real family data · **NOTHING IS
PRODUCTION-ACTIVATED.**

R2/F-3's two hash moves are §6.10 identity changes, not DDL and not
activation. SMOKE-6's box stays unticked. The three `OWNER` rows, the
`ACCEPTED-NOTE` rows and every other class are untouched: this round rules
what the tree has closed and nothing else.

---

## D10 — the ballot

1. **R2/F-2 `OWED` → `FIXED`** (D2), noting the deadline is 1.5 s past the
   reserve rather than the +240 s the triage suggested.
2. **R2/F-12 `OWED` → `FIXED`** (D3), noting the client sends no
   `anthropic-beta` at all, so the leg proves the header set is real before
   asserting over it.
3. **R2/F-6 `OWED` → `FIXED`** (D4), noting it is a log line and not a
   column, and SMOKE-6 stays unticked.
4. **R7/F-5 `OWED` → `FIXED`** (D4), with R2/F-6.
5. **R2/F-4 `OWED` → `FIXED`** (D5), accreting round 21's "narrowed, not
   fixed" on the row.
6. **R2/F-3 `OWED` → `FIXED`** (D6), on the whole of the row's text — the
   residue closed at PR #20, the hash moved twice and the name with it.
7. **The re-derived tally** (D8) as the record's new arithmetic — an `OWED`
   class of zero.

On sign-off a second commit moves all six D17 verdicts, each carrying a
pointer here. If any is not accepted it stays `OWED` and D8 is re-derived
rather than adjusted.
