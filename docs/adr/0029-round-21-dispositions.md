# ADR-0029 — round-21 dispositions: 31 stale `OWED` verdicts, re-verified and PUT for ruling

**Status: RULED — OWNER SIGN-OFF 2026-08-27. All three ballot items
RATIFIED AS PUT.**

The verdicts have moved. **32 rows** in ADR-0023 D17 were rewritten in the
commit that stamps this line — the 31 `OWED` → `FIXED` of D2, and R7/F-4
`OWED/OWNER` → `OWED` of D3 — each carrying a pointer back here so the two
records agree about who made the change stick (the ADR-0025 D6 precedent).

The post-ruling tally was **re-derived from the rewritten table**, not
asserted from D5's prediction, and lands where D5 said it would:

> 59 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 8 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

with the residue exactly **R2/F-2 · R2/F-3 · R2/F-4 · R2/F-6 · R2/F-12 ·
R4/F-12 · R7/F-5 · R7/F-4**, and the `OWED/OWNER` class now empty. The
self-check in D5 is therefore satisfied by measurement rather than by
intent.

*(The paragraph below is the ballot as it was PUT, preserved unaltered.)*

~~**Status: PUT, NOT RULED.**~~ The rulings below are proposed on evidence
and await owner sign-off. **No verdict in ADR-0023 D17 has moved.** They
move in a second commit, after sign-off, each carrying a pointer back here
— the ADR-0025 D6 precedent.

**Head:** `main` = `1bfad9e`. **Branch:** `docs/round-21-dispositions`.

---

## Context — why this round exists

`docs/review/slice-5b-queue-staleness-pass.md` (merged in PR #13) found
that **31 of the 39 owed rows in ADR-0023 D17 describe defects that are no
longer in the tree** — almost all closed by slice 6B, which built past
them without their verdicts ever moving.

That session could not rule them, and correctly did not try. **ADR-0025 D6
is explicit:**

> a build session that finds a settled dispositions record wrong **records
> the discrepancy where it will be read — the packet, and a comment at the
> site — and does not move the verdict.** The next round rules.

This is that round. The queue-work ceremony the owner ruled on 2026-08-27
(a `chore/` branch and a normal PR, no review round) governs the **work**;
it cannot authorise moving 31 verdicts in a settled dispositions record.
Under ADR-0006's cadence dispositions are their own session with owner
sign-off, which is what this is.

---

## D0 — how the re-verification was done, so it can be re-taken

**The staleness pass is this round's evidence packet, not its authority.**
It was produced by one session reading the tree; ratifying it on trust
would be the same move D6 exists to prevent. Every one of the 31 was
therefore checked again here, and **the check deliberately targets the
code property each finding asserts — never the comment claiming a fix.**
A comment can describe a fix that is not there; the property cannot.

Two instruments:

- **Mechanical (18 rows).** A script asserting each property against the
  files at `1bfad9e` — derived constants recomputed, orderings compared by
  index, corpus facts recounted from `corpus.json`. All 18 PASS.
- **By reading (13 rows).** Where the property is not reliably expressible
  as a pattern — a guard's exact condition, a branch's placement, whether
  a fixture is dead or load-bearing — the site was read.

**Not taken: a local suite run.** `test:app` mocks the DB and would be
good evidence, but the worktree has no `node_modules` and the primary tree
shares a machine with a peer session holding the fixture-server port
(8787). **CI on this PR is the suite check**, and it is the right
instrument for it: the property checks here establish that the code does
the right thing, and CI establishes that the suite agrees.

---

## D1 — the instrument was WRONG on its first pass, and that is recorded

The first parser written for this round reported **101 D17 rows** and
`FIXED = 19`, against ADR-0023 D25's published **113** and `28`.

**D25 was right and the instrument was wrong**, in two ways:

1. The severity cell is bolded on some rows (`**BLOCKER**`) and bare on
   others (`MAJOR`). A `([A-Z]+)` severity pattern silently dropped **ten**
   rows.
2. Two rows carry **compound** verdicts — `**DECLINED (the packet's
   answer), ACCEPTED (the finding)**` and `**FIXED** (the title) /
   **ACCEPTED** (the count)`. A single-token pattern dropped both.

The corrected parser reproduces D25's eight-class tally exactly, and
asserts that agreement on every run rather than leaving it to a reader.
**This is recorded because it is the round's own near-miss:** a tally
stated from an unvalidated instrument is exactly what D25 exists to
prevent, and the first pass would have published one. The strict `OWED`
count (38) was never affected — none of the twelve dropped rows is owed —
so the queue was never at risk. The other seven classes were.

---

## D2 — the 31, re-verified at their sites

Each row: the property that had to hold, and where it holds. **M** =
mechanical, **R** = read.

| Finding | Property re-verified at `1bfad9e` | | Site |
|---|---|---|---|
| R1/F-4 | `artifact.fields === null` is checked explicitly, so the shape fails closed instead of throwing at the field loop | R | `lib/extraction/bands.ts:157-164` |
| R1/F-6 | every all-high whose reason is **not** `no_signed_artifact` emits a warning | R | `lib/extraction/bands.ts:119-125` |
| R1/F-7 | each of `artifact_partial`'s rejection conditions has its own case — six `it()` blocks, not one | R | `tests/extraction/bands.test.ts:215+` |
| R2/F-5 | the arm branches on **status**: `BadRequestError` → `permanent`; a `retry-after` that fits the lease is waited once; all else `unavailable` | R | `lib/ai/client.ts:230-244` |
| R2/F-8 | `maxRenderedBytes` is **derived**, not a literal: 21.0 MiB, base64-inflating to 28.0 MiB inside the 32 MiB request limit | M | `lib/pipeline/render.ts:111-116` |
| R2/F-9 | `model_context_window_exceeded` has its own branch and no longer falls through to "no text content" | R | `lib/ai/client.ts:263-265` |
| R2/F-14 | the fixture answers **529**, the status the arm branches on | R | `scripts/ai-fixture-server.mjs:297` |
| R3/F-3 | `sweepRenderStaging` exists and is invoked from the nightly route — by **prefix age**, so it reaches an orphan no lease-keyed GC could | M | `lib/storage/artifacts.ts` → `app/api/worker/nightly/route.ts` |
| R3/F-4 | `task.destroy()` runs in a `finally`, so teardown does not depend on the return path | M | `lib/pipeline/render.ts:476-481` |
| R3/F-5 | the in-flight render is raced and **cancelled** — `Promise.race` + `cancel()`, a deadline rather than a sample | M | `lib/pipeline/render.ts:282+` |
| R3/F-6 | a blind item carries **page-2** labels (`blind-discharge-multipage-01`), so `citation.page` is exercised past 1 | M | `fixtures/g9/corpus.json` |
| R3/F-7 | `citation` survives onto `PredictionFact`, `citationLands()` scores it, `citation_accuracy` is emitted | M | `lib/eval/score.ts`, `scripts/eval/predict.ts` |
| R3/F-8 | `ext` is a **required** positional parameter on both page-key builders; no `'png'` default exists | R | `lib/pipeline/page-keys.ts:50-69` |
| R3/F-12 | both harness and measurement normalise with `sniffMime`, as the worker does | M | `scripts/eval/run.ts`, `tests/eval/corpus.test.ts` |
| R4/F-4 | same sweep as R3/F-3 — "fixed ONCE", as the row itself asked | M | as R3/F-3 |
| R4/F-6 | a manifest-named page storage lacks returns a named `rendition_page_missing` **503**, not a 404 | R | `app/api/artifact/[id]/route.ts:54-59` |
| R4/F-7 | `READ_VT_SECONDS = LONGEST_STAGE_SECONDS + 60` = **360 s > 300 s** — the read window outlives the longest stage | M | `lib/hc/workers.ts:239-251` |
| R4/F-10 | the stage-2 suspect path raises the §4.2 defect signal instead of returning silently | R | `app/api/worker/[stage]/route.ts:654-661` |
| R4/F-11 | `msg.facts` is validated at runtime; a non-array is treated as absent and fails **closed** into the re-read path | M | `app/api/worker/[stage]/route.ts:619+` |
| R4/F-15 | `dropped` is read and printed, not discarded | M | `app/api/worker/[stage]/route.ts:724+` |
| R5/F-2 | all four reads bind `error` (`parentsError`, `childrenError`, `docError`, `subjectsError`); a refusal renders an error state | R | `app/(app)/[circle]/inbox/page.tsx:162-289` |
| R5/F-6 | the audit list is derived from the filesystem and compared exact-set both ways | M | `tests/design/audit-manifest.test.ts` |
| R5/F-7 | the page **declares `searchParams`** and renders the markers the submit routes emit | R | `app/(app)/[circle]/inbox/page.tsx:142-155` |
| R5/F-8 | `/senders` is reachable from more than the populated branch (two references) | M | `app/(app)/[circle]/inbox/page.tsx:305` |
| R5/F-13 | the `documents` fixture is **load-bearing**, driving the degraded case — no longer dead scaffolding | R | `tests/routes/inbox.test.ts:537-651` |
| R6/F-4 | the manifest carries the `{high, medium}` pair `loadBands` requires, gated on the §6 floors, the §4 support minimum and the citation floor | M | `lib/eval/thresholds.ts` |
| R6/F-10 | greedy per-label matching (`unused.splice`) and `support += labels.length` — labels are a multiset, counted as labels not items | M | `lib/eval/score.ts:123-154` |
| R6/F-11 | an uncalibrated field is its own kind, never an unremarkable low | M | `lib/extraction/bands.ts` |
| R6/F-16 | `existsSync(outFile)` precedes `batches.retrieve` by source order — the refusal happens **before** the paid round-trip | M | `scripts/eval/run.ts:199` |
| R6/F-17 | the builder throws at build time on a code point above `0xFF` | M | `scripts/fixtures/g9-build.mjs:56` |
| R8/F-10 | the assertion is scoped to `filter(o === 'published')` then `toHaveLength(1)` — the product's claim, not the shared queue's quietness | R | `e2e/extraction.spec.ts:256-268` |

**All 31 hold.** None was found to be a comment without a fix.

### Two recorded honestly

- **R5/F-13** was resolved by **using** the fixture rather than removing
  it. The finding asked for removal; the increment made it load-bearing
  and asserted. That answers the concern — a dead fixture that might
  silently serve is now a driven case — but it is not what the row asked
  for, and a reader should know that.
- **R2/F-4 is NOT in this set.** The harness now imports the shared
  delimiter, prompt and schema, but still assembles its own content-block
  array. It is **narrowed, not fixed**, and stays `OWED`.
  **AMENDED (round-23 follow-up, 2026-08-28).** Fixed at `6323ad1` (PR #19): `extractionBlocks`/`extractionCall` (lib/ai/extract.ts) and `messageParams` (lib/ai/client.ts) are the one construction site and the harness builds nothing; ruled **FIXED** at ADR-0031 (round 23), the pointer on the row accreting this narrowing. The prose above is preserved exactly as written.

---

## D3 — R7/F-4: `OWED/OWNER` → `OWED`

ADR-0023 **D26** ruled D18 item 5 and answered the owner half of R7/F-4:
parts 1–3 were superseded by 6B, and part 4 — the email label geometry —
was restated with its arithmetic and a named fix. **Nothing is left for
the owner to decide**; what remains is ordinary owed work.

D26 deliberately did not move the row, on D6's rule. This round moves it.
The class `OWED/OWNER` then has no members, which is the correct end state
for a class that existed to hold exactly one row.

---

## D4 — the four blocked rows: the blocks are LIFTED

The triage recorded four rows as blocked. All four blocks are gone, and no
row's blocked-ness was ever a verdict — this is recorded so the next
session does not re-derive it:

| Row | Was blocked on | Lifted by |
|---|---|---|
| R3/F-6 | G9 — no multi-page blind item | 6B B10: `blind-discharge-multipage-01` |
| R3/F-7 | G9 — nothing scored citations | 6B B10: `citationLands`, `CITATION_FLOOR` |
| R6/F-4 | G9 — no threshold rule | 6B B10: §6.A written, `lib/eval/thresholds.ts` |
| R7/F-4 | the owner decision in D18 item 5 | ADR-0023 D26 |

R3/F-6, R3/F-7 and R6/F-4 are among the 31 ruled FIXED in D2. R7/F-4 is
ruled in D3.

---

## D5 — the tally, RE-DERIVED

Per D25: counted **by row** over D17's Verdict column, at a **named head**,
by an instrument that reproduces D25's published tally before it is
trusted (D1). Never carried forward.

**At `1bfad9e`, before this round:**

> 38 OWED · 28 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 3 OWNER · 2 ACCEPTED ·
> 1 OWED/OWNER · 1 DECLINED-and-ACCEPTED = **113**

**After the rulings in D2 and D3:**

> 59 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 8 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

| | before | after |
|---|---|---|
| FIXED | 28 | **59** |
| strict OWED | 38 | **8** |
| OWED/OWNER | 1 | **0** |
| total | 113 | **113 — conserved** |

**The check that makes this self-verifying:** the 8 remaining `OWED` rows
must be exactly

> R2/F-2 · R2/F-3 · R2/F-4 · R2/F-6 · R2/F-12 · R4/F-12 · R7/F-5 · R7/F-4

— **6 MAJOR · 2 MINOR** as rows, or **7 distinct items / 5 MAJOR · 2
MINOR** once R2/F-6 = R7/F-5 collapses. Any other residue means a ruling
went astray.

---

## D6 — what does NOT move

- **No coverage row flips** (ADR-0025 S16.7). Ruling a finding FIXED does
  not turn a pending row green; that needs its own evidence.
- **No `pending` row moves. NO DDL** — migrations stay **69 exact**, budget
  **7 of ≤ 7 SPENT**.
- **G4 and G7 block · G9 OPEN · `BAND_ARTIFACT_ALLOWLIST` EMPTY · RCP-02
  pending tagged 7 · SIG-01 NOT absorbed · no real family data · NOTHING IS
  PRODUCTION-ACTIVATED.**
- **The 8 live rows keep their verdicts.** This round rules what the tree
  has closed; it does not touch what it has not.

---

## D7 — the ballot: what the owner is asked to rule

1. **The 31 `OWED` → `FIXED`** (D2), on the re-verification recorded there.
2. **R7/F-4 `OWED/OWNER` → `OWED`** (D3), the owner half having been
   answered by D26.
3. **The re-derived tally** (D5) as the record's new arithmetic.

On sign-off, a second commit moves the D17 verdicts, each row carrying a
pointer to this ADR so the two records agree about who made the change
stick — the ADR-0025 D6 precedent, verbatim.

**If any of the 31 is not accepted, it simply stays `OWED`** and the
arithmetic in D5 is re-derived rather than adjusted.
