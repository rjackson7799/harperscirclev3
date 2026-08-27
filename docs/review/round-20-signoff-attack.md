# Round 20 — the sign-off ATTACK on ADR-0027 and ADR-0028: COMPLETE

**THIS DOCUMENT CONTAINS NO RULINGS AND RATIFIES NOTHING.** It is preparation
for an owner sign-off, not the sign-off. ADR-0027 remains
`proposed — BLOCKED at sign-off`; ADR-0028 remains `proposed`. Every verdict
below is a *finding about the record*, and whether any of it moves a
disposition is the owner's to decide, not this document's to assume.

**Method.** ADR-0025 D16's standard: **re-derived, not read back.** Each claim
was rebuilt from primary sources and only then compared to what the document
asserts. A sign-off that rubber-stamps is worthless (ADR-0025 S16.1).

---

## Authority — three tiers, declared before anything was checked

| Tier | Source | Standing |
|---|---|---|
| **Governing** | ADR-0025 **D16**, ADR-0006 | Ratified, on this branch. **Binding.** |
| **Proposed** | `chore/process-retune` @ `116f80c` — `.claude/skills/slice/references/dispositions.md`, `docs/process/slice.md`, `docs/owed.md`, `tests/lint/process.test.ts` | **Unmerged, NOT binding.** Its own ledger says the OWED amendment does not take effect by being written there, and `slice.md` says it is *"in force from slice 7."* |
| **Voluntary** | The mechanical re-tally and every check below | Adopted **by choice**, and recorded as such rather than as procedure |

This distinction is load-bearing. Treating the unmerged branch as governing
would apply an unratified process amendment while claiming to follow existing
procedure.

---

## Heads — and the dual-head rule

| Alias | SHA | What it is |
|---|---|---|
| `PRE` | `fb57d2c` | Findings landed verbatim, nothing argued yet |
| `R18` | `4f242f5` | **ADR-0027's declared evidence head** — every *"at HEAD"* means this |
| `BASE` | `bc3bc85` | Diff base for D19's *"zero files under `supabase/`"* |
| `GATE` | `1066e2d` | The head the GREEN 38/38 gate proves |
| `NOW` | `fbc06dc` | Today's documentation head |

**Every count below was checked at `R18` AND at `NOW`.** A count right at `R18`
and wrong at `NOW` is not an ADR defect but *is* a sign-off blocker, and the two
are never conflated here.

Working tree at review start was **not clean**: `.gate/` untracked (peer
preflight state, holds `last-head`). Recorded and isolated; not evidence.

---

## 1. WHAT HELD

Stated first, because a clean area reported clean is a result and because what
held is most of the round (ADR-0025 S16.1).

### 1.1 D1's headline number is EXACT, at both heads

> *"35 `withRequestRole` call sites across 12 `lib/hc` modules — 35 and 12
> exactly, counted at HEAD"*

Re-derived by rebuilding the set from `lib/hc/*.ts` rather than reading the
table back:

| Head | Call sites | Modules |
|---|---|---|
| `R18` `4f242f5` | **35** | **12** |
| `NOW` `fbc06dc` | **35** | **12** |

`lib/hc/` holds **14** modules, so the claim entails that exactly two abstain.
They are **`rows.ts`** and **`workers.ts`**, and neither contains the symbol.
The only occurrence outside `lib/hc` is `lib/db/request-role.ts` — the
**definition site**, correctly excluded.

**This is the headline number of the document's MAJOR finding, restated three
times (D1 twice, D17 item 3), and it is right.**

### 1.2 "Exactly one route has an answer budget" — all THREE phrasings converge

The claim appears three ways, and *imports the class* ⊂ *has a budget*, so they
could have diverged. They do not:

| Predicate | `R18` | `NOW` |
|---|---|---|
| imports `AnswerBudget` | `app/api/artifact/[id]/route.ts` | same |
| references `ROUTE_ANSWER_BUDGET_MS` in `app/` | none besides | same |
| imports `lib/http/budget` | `app/api/artifact/[id]/route.ts` | same |

One route, one file, all three readings. **D17 item 3's acceptance condition is
written against a predicate that holds.**

### 1.3 D9's fetch count is EXACT — including both cited line numbers

> *"nine call sites outside the bounded helper … the two omitted are the eager
> fires, `app/api/worker/relay/route.ts:116` and
> `app/api/worker/[stage]/route.ts:108`"*

Counting rule declared: unit = syntactic `fetch(` expression; scope `app/` +
`lib/`; the bounded helper's own implementation excluded by the claim's own
wording.

| # | Site | Class |
|---|---|---|
| 1–2 | `app/(app)/[circle]/upload/upload-form.tsx:57, :116` | awaited |
| 3 | `app/api/inbound/postmark/route.ts:211` | awaited |
| 4 | `app/api/upload/complete/route.ts:94` | awaited |
| 5–6 | `app/api/upload/tus/[[...id]]/route.ts:126, :163` | awaited |
| 7 | `lib/mail/outbound.ts:39` | awaited |
| 8 | `app/api/worker/[stage]/route.ts:108` | **eager (`void`)** |
| 9 | `app/api/worker/relay/route.ts:116` | **eager (`void`)** |

**Nine sites: seven awaited, two eager, at the exact cited lines.** The two
excluded `lib/storage/fetch.ts` occurrences are `:8` (a header comment quoting
`await fetch(signedUrl)`) and `:77` (the helper's own call, carrying
`signal: controller.signal`).

**The finding whose whole subject is a count being short is itself exactly
right.**

### 1.4 The F-n → D-section map is correct in all nine

The D-order is scrambled relative to F-order — D3↔F-3 but **D4↔F-2, D7↔F-4,
D10↔F-7** — which is precisely where a mis-map would hide. Every one of the
nine matches D15's `Where` column. Severity distribution reconciles:
**2 MAJOR + 5 MODERATE + 2 MINOR = 9**, as the header states.

### 1.5 The two vitest numbers are consistent

D10's `897/898` is the **first** run under the new reporter — the run in which
the transient finally carried a name. D19's `898/898` is the evidence after it
was budgeted. 897 passed + 1 failed = 898. **Not a contradiction.**

### 1.6 D5's OCR label is byte-exact across every site, and the fix is sound

The strongest single verification in this pass, and it is the finding whose own
subject is a test asserting a fragment.

All three cited spec line numbers are **correct**, and the label is
**byte-identical** at every site — `hex 6d616368696e652d7265616420e28094…`,
where `e28094` is UTF-8 U+2014 EM DASH. **The dash trap does not bite.**

| Site | |
|---|---|
| `docs/PRD.md:1391` · `docs/TSD.md:2177` · `docs/TSD.md:2501` | identical |
| `docs/review/slice-6-plan.md:976, :1087` | identical |
| `components/review/ReviewScreen.tsx:133, :175` (what the app renders) | identical |
| `e2e/review.spec.ts:589` (the leg's own literal) | identical |

The fix's two structural claims also hold: the assertion is
**`toHaveText`** on the full string (`e2e/review.spec.ts:631`), not the old
`toContainText`; and the string is **typed out in the leg** at `:589` — the leg
imports **nothing** from `components/`, so it genuinely does not read its
expectation out of the code under test.

*"Four documents"* reconciles as PRD + TSD + slice-6 plan + `coverage.md`,
which quotes it at `:325` and `:488`.

### 1.7 The gate is 38 legs, proven by DISCOVERY rather than by counting strings

`npx playwright test --list` returns **`Total: 38 tests in 5 files`**, matching
the textual count (7 + 5 + 8 + 11 + 7). Every ratio in D13 — 3/38, 7/38, 31
remaining — rests on this, and it is sound. The listing independently confirms
A11Y-08 at `:591`, A11Y-07 at `:524`, REV-02 at `:428` and AC-INBOX-8 at `:462`.

### 1.8 RULING 5's migration citation does NOT contradict "nothing under `supabase/` moved"

D12 cites `20260825120001` as the residue-closing migration while D19 and D18
assert nothing under `supabase/` has moved since `BASE`. These looked
incompatible. They are not: `20260825120001_payload_contract.sql` was added in
`39fcf17`, which **is an ancestor of `bc3bc85`**. The migration predates the
diff base.

Confirmed alongside it: **69 migrations exact at both heads**, and **zero**
files changed under `supabase/` between `BASE` and `R18`, and between `BASE`
and `NOW`.

### 1.9 The strong docs-only claim holds from the GATE head

> *No committed product, test, configuration, dependency, migration or
> gate-harness path changed between `1066e2d` and the candidate head.*

Only two files have changed since the gate head, **both under `docs/`**.
`app/`, `lib/`, `components/`, `e2e/`, `tests/`, `supabase/`, `scripts/`,
`package.json`, `package-lock.json`, `playwright.config.ts`,
`vitest.config.ts` and `next.config.ts` are **all unchanged**.

**The GREEN 38/38 gate at `1066e2d` therefore remains valid evidence for the
current head.** This must be re-verified immediately before the owner decision
rather than inherited from here.

### 1.10 D10's ESLint cost-class claim holds — and a file-level check would have failed it

Exactly **two** test files construct an `ESLint` instance and load
`eslint-config-next`: `a11y-fence.test.ts` and `db-fence.test.ts`. The cost
class is real and sharp, not rhetorical. Case counts are exact: **6** and
**34**, as D10's table states.

The claim *"Both cases … read no real file in the repo"* also holds **as
stated** — it is about the two named occurrences, and the named case at
`db-fence.test.ts:69` uses `messagesFor('app/(app)/anywhere/route.ts',
"…inline source…")`, a virtual path. `db-fence.test.ts` *does* read real files,
but at `:345` and `:420`, in **different** cases.

**Recorded because it nearly produced a false finding here:** a file-level
grep flags `db-fence.test.ts` as reading repo files and would have reported a
defect that does not exist. The claim is case-level and had to be checked at
that granularity. **Q4's move from QUEUED to DIAGNOSED rests on a claim that
verifies.**

### 1.11 The slice-5B queue's "39 OWED" is internally consistent

ADR-0023's own tally reads *"39 OWED"* and *"39 findings remain OWED"*, and
ADR-0025, ADR-0027 and ADR-0028 all carry it forward unchanged. **No
contradiction among the binding documents.**

Flagged rather than ruled: the unmerged `chore/process-retune` ledger argues
the 39 may be **stale** — that nothing ever wrote back to ADR-0023's table.
That is a tier-2 claim and that branch's own round to raise. It is not a defect
in the documents under ratification.

---

## 2. CONFIRMED RECORD DEFECTS

Each is a defect in what the record *says*. Whether any moves a *verdict* is
kept as a separate question throughout, and is the owner's.

### DEFECT 1 — D15's *"2 carrying a declared remainder"* is short by two, AND is internally inconsistent

> D15: *"**Tally: 9 ACCEPTED · 9 FIXED · 0 DECLINED**, with **2 carrying a
> declared remainder** (F-3's commit-round-trip residue; F-4's row-boundary
> typing)"*

By the table's **own wording**, four rows carry a remainder:

| Row | The row's own text |
|---|---|
| **F-1** | *"ACCEPTED · FIXED (both halves), **with the composition limit OWED**"* |
| **F-2** | *"ACCEPTED · FIXED; **deployment consequence remains unobserved**, as bounded"* |
| F-3 | *"with the commit-round-trip residue declared: **narrowed, not closed**"* |
| F-4 | *"FIXED for the syntactic class; the row-boundary typing **OWED**"* |

All four are also listed as owed items in D17 (items 3, 8, 4, 2 respectively).

**No distinction between "declared remainder" and "OWED" is stated anywhere in
the document.** And the count fails on its own terms either way: it **counts
F-4's `OWED` remainder but not F-1's identically-labelled `OWED` remainder**.
Under a reading that excludes OWED items the answer would be 1; under one that
includes them it would be 4. It is not 2 under either.

### DEFECT 2 — *"9 FIXED"* over-counts, and D7's own heading says so

> D7's heading: *"## D7 — ACCEPTED and **FIXED in part, OWED in part**: the
> timestamp class has three spellings (F-4, MODERATE)"*

D15 counts F-4 inside **9 FIXED**. Its own section heading says FIXED **in
part**.

**This project already treats FIXED IN PART as a distinct verdict class.**
ADR-0025's corrected tally reads *"3 FIXED · 1 FIXED IN PART · 1 OWED ·
1 ACCEPTED · 1 ACCEPTED-NOTE = 7"* — arrived at when the round-17 sign-off
moved F-1 from FIXED to FIXED IN PART. The vocabulary exists and has been
applied once already.

D3's heading (*"ACCEPTED and FIXED, with the residue stated"*) plus its body's
*"NARROWED, NOT FIXED AT THE CLASS"* raises the same question for F-3.

**This is the ADR-0025 S16.2 class — a narrowing recorded as a closure — and
ADR-0027 L227 notes this slice has already been corrected once for exactly
that. It feeds D20 item 1 directly**, which asks the owner to ratify *"nine
ACCEPTED, nine FIXED, two carrying a declared remainder."*

### DEFECT 3 — ADR-0028 D1's *"Twenty call sites"* is 21

> *"**Twenty call sites** read that null as the signed-out answer — **twelve
> pages** redirect to `/sign-in`, **eight routes** refuse."*

Re-derived over `app/` for `liveSessionClaims(` / `readLiveSession(`, one call
per file:

| | Claimed | Re-derived |
|---|---|---|
| Total | 20 | **21** |
| Pages | 12 | **11** (10 `page.tsx` + 1 `layout.tsx`) |
| Routes | 8 | **10** |

**ADR-0028 defines no exclusion** — line 103 is the sole, unqualified
occurrence of the claim. It does not reconcile on any grouping.

**Verdict impact NOT established.** D1's fix table names only
`api/upload/token`, `api/upload/complete` and `api/artifact/[id]` as moving to
`503`, and `(auth)/confirm` and `account/sign-out-everywhere` may not "refuse"
in F-2's sense. A per-site behavioural matrix — signed-out · unavailable ·
timeout, for all 21 — is owed before anyone says whether the disposition moves.

### DEFECT 4 — ADR-0028:364 cites the wrong document

> *"Every command run **SOLO** (ADR-0027 D5: PowerShell `;` chaining reports
> only the last exit code)"*

**ADR-0027's D5 is the OCR label finding (F-5).** The PowerShell lesson lives
at **`docs/adr/0026-…:103`, inside ADR-0026's D5** — and ADR-0026:487 refers to
it as *"D5's PowerShell"* within its own namespace. **Correct cite:
ADR-0026 D5.**

**This is a symptom of a structural hazard, not an isolated slip.** ADR-0026
and ADR-0027 both number sections D1–D2x, and ADR-0027 cites ADR-0026's
sections **bare**. Ten numbers collide; `D5`, `D15` and `D17` are each used for
both documents within ADR-0027. **The ambiguity has now propagated one document
forward.** Every cross-reference must be resolved to its true document before
the claim behind it is checked.

### DEFECT 5 — D7's *"FIXED for the syntactic class"* is narrowed, not fixed at the class

The rule at `tests/lint/timestamp-boundary.test.ts:52-59` is an alternation of
three branches over one shared `TEMPORAL` pattern. Its own comment (`:44-46`)
states the class:

> *"All three produce the SAME STRING, character for character, so all three
> give the same `.slice(0, 10)` → `"Tue Aug 25"` → §2.7 refusal → the same
> render throw that took all seven review legs red at the close-out."*

**That reasoning is correct, and it does not stop at three.** The regex was
reproduced verbatim from the source and probed:

| Spelling | Result | Same string? |
|---|---|---|
| `String(row.received_at)` | **CAUGHT** | — |
| `` `${row.received_at}` `` | **CAUGHT** | — |
| `row.received_at + ''` | **CAUGHT** | — |
| `'' + row.received_at` | **MISSED** | **identical** |
| `row.received_at.toString()` | **MISSED** | **identical** |
| `[row.received_at].join('')` | **MISSED** | **identical** |
| `''.concat(row.received_at)` | **MISSED** | **identical** |
| `` row.received_at + `` `` | **MISSED** | identical |
| `` `${row.received_at ?? ''}` `` | **MISSED** | identical |

All five marked *identical* were evaluated, not reasoned about: each returns
`"Tue Aug 25 2026 02:00:00 GMT-1000 (…)"`, whose first ten characters are
`"Tue Aug 25"` — **the exact input the file's own comment says produces the
§2.7 refusal.** Branch 3 is operand-ordered, so merely reversing it escapes.

**Scope stated honestly, because it bears on verdict impact.** This is a defect
in the **CLAIM**, not in current behaviour: the corpus scan comes back empty
and no shipped site uses a missed spelling. The rule is a good rule that holds
the corpus today. What is wrong is *"FIXED for the syntactic class"* — the
class has at least eight members and the rule closes three.

The file **does** declare an honest bound, but a different one: *"it reads the
NAME. A query that aliases a moment to something else hides the type from it."*
That is the aliasing bound. **The incompleteness of the alternation across
spellings it does not name is nowhere acknowledged.**

**This compounds DEFECT 2.** D15 counts F-4 inside "9 FIXED"; D7's own heading
already says "FIXED **in part**"; and now the *"syntactic class"* half of even
that partial claim is itself narrowed rather than closed. The honest phrasing
is the one D3 uses about F-3: **narrowed, not closed.**

---

## 3. CONFIRMED CONTRADICTION

### UXA-03 — the record says the row moves; the row did not move

| Where | What it says |
|---|---|
| D12 (`:653`) | *"Q3 / UXA-03 — PASS, and **the row MOVES**."* |
| D15 (`:781`) | *"Q3/UXA-03 → **passes, and the row moves**."* |
| D16 (`:807`) | *"**No row is flipped to green on this round's authority.** … UXA-03 passes per D12"* — and UXA-03 is **absent from D16's seven-row table** |
| **`docs/coverage.md:491`** | **`\| UXA-03 \| … \| review \| 6B \| `**pending**` \| …`** |

D16 attempts to hold both: the row passes without the cell flipping.
**D20 item 2 asks the owner to ratify the Q1–Q5 rulings *"including UXA-03
passing"*** — a state the authoritative record does not carry.

This is the ADR-0025 S16.5b class (*"D15's sentence is true of M6 and false of
the branch"*). Which of D12 and D16 is wrong is the owner's to settle.

---

## 4. UNSTATED AMBIGUITY — not a defect

**D8's five vs D13's three.** D8 (`:454`): *"eight across nine runs, the first
three from run one, the other **five** from the runs that were meant to
**confirm** each previous fix."* D13 (`:685`): *"**Three of the eight** — F4,
F6 and F8 — were surfaced by runs that **existed only to confirm** a previous
fix."*

These are reconcilable: *"meant to confirm"* is a wider predicate than
*"existed only to confirm."* **The document never states the distinction**, so
a reader comparing the two numbers cannot tell which is which. Recorded as a
record-clarity finding. It is **not** inflated into a defect.

---

## 5. RECORD CORRECTIONS — no verdict moves

### 5.1 Three stale line citations in `docs/coverage.md`, all confirmed

Each was resolved against the working tree and against Playwright's own
listing:

| Citation | What is actually there | Correct target |
|---|---|---|
| `e2e/ingestion.spec.ts:400` | **a blank line** | the *"below the cliff"* leg is at **`:580`** |
| `e2e/ingestion.spec.ts:432-434` | the **EICAR quarantine** assertions, a different leg | — |
| `e2e/review.spec.ts:583` | a `/**` comment-block opener | A11Y-08 is at **`:591`** |

Every one of these cells also names its leg **by title**, so the target is
recoverable and no assertion is lost. **Repairs must be title-first**, with the
line number as a head-specific convenience — A11Y-08's own cell already records
that its line moved `:583 → :591` and calls it *"the fourth line drift this
slice."*

### 5.2 ADR-0028's `:432` carries a sentence its own document later supersedes

`docs/adr/0028-…:432` reads *"…and **the 6B slice does not merge.**"* That was
conditional on the two unreproduced resource failures, and round 20's re-run
discharged them — recorded in the same document's own later D7 addendum.

**The sentence is true of `r3` and false of the slice today**, and its site
carries no marker. This is the ADR-0025 S16.5b shape. Under the amendment rule
the correct treatment is **a marker at the site with the original prose
preserved — never a rewrite.**

The same applies to ADR-0027's status line and D20 item 7, which read
`BLOCKED at sign-off` and *"nothing to ratify at this head."* Both are true of
`4f242f5`; both have had their **condition** discharged by the green gate at
`1066e2d`.

### 5.3 A vocabulary observation supporting DEFECT 2

`"FIXED in part"` appears **exactly once** in ADR-0027 — D7's own heading — and
`"FIXED IN PART"` in the ADR-0025 capitalisation appears **nowhere**. The
verdict class the round-17 sign-off established is used in a heading and then
never reflected in the tally that counts that heading's finding.

---

## 6. THE UN-ATTACKABLE SURFACE — and one piece of good news

Flagged so the owner knows where the documents cannot be held to account:
D6's re-measurement (only its arithmetic and its inferences are checkable) ·
D11's zero-warning build · all severity gradings and ruling text · D4's
*"deployment consequence UNOBSERVED"* (correct and honest by construction) ·
the header's finding-by-finding DDL assurance · D10's and D11's counterfactuals
· D19's leg-38 causal linkage, which is inference over evidence and is the sole
basis for the sentence that blocked sign-off.

**ADR-0028 D3's measurements are NOT reproduced here, deliberately.** The
scratchpad harnesses are gone. Rebuilding them without a manifest — service
versions, warm-up, sample count, concurrency, pool-state reset, raw-output
preservation, acceptable variance — would produce numbers without reproducing
the causal conditions, and round 20 established that the causal condition is
event-loop blocking rather than CPU scarcity. Any future attempt that cannot
control those must report **"method corroborated"**, never *"measurement
reproduced."*

**Good news on the evidence base.** The r1/r2 host observations were expected
to be un-attackable testimony resting on a scratchpad. They are not: round 20
preserved the artifacts outside the repo and outside TEMP —
`hc-gate-evidence/round18-r2` (84 MB, 46 files) and `round19-r3` (9 MB).
**Leg 35/36/38's classification is checkable evidence.**

---

## 7. THE AUDIT, SUMMARISED

| | Count | |
|---|---|---|
| **HELD** | **11** | including all three headline counts, the byte-exact label, the 38-leg proof and the docs-only claim |
| **Confirmed record defects** | **5** | two of them verdict-bearing (DEFECTS 1, 2, compounded by 5) |
| **Confirmed contradiction** | **1** | UXA-03 |
| **Record corrections, no verdict** | **5** | three stale citations, one superseded sentence, one vocabulary gap |
| **Unstated ambiguity** | **1** | D8 vs D13, deliberately not inflated |
| **Accepted on reasoning** | ~7 classes | named in §6 rather than folded in with the verified |

**The documents are substantially sound.** Every load-bearing enumeration in
ADR-0027 — 35 across 12, exactly one budgeted route, nine fetches split seven
and two, 38 legs, 69 migrations — is exactly right, re-derived rather than read
back. D5's fix verifies byte-for-byte. D10's cost-class diagnosis holds at the
granularity it was actually claimed at.

**What is wrong is concentrated in the bookkeeping**, and it lands squarely on
the one thing D20 item 1 asks the owner to ratify: the tally. *"9 FIXED · 2
carrying a declared remainder"* is wrong in both halves, D7's own heading
contradicts it, and DEFECT 5 shows that even F-4's partial claim overstates.

**What is owed before the rulings can be complete**

1. The **behavioural matrix** for all 21 session sites — signed-out ·
   unavailable · timeout — which decides whether DEFECT 3 moves ADR-0028 D1's
   disposition or is a record correction only.
2. The **corrected tally**, once the owner rules on what F-1, F-3 and F-4's
   verdicts actually are.

---

## 8. What this audit does NOT do

- It **rules on nothing.** No verdict moves here.
- It does not establish whether DEFECT 3 changes ADR-0028 D1's disposition —
  the behavioural matrix is owed first.
- It does not touch `docs/coverage.md`. **No coverage row flips at a sign-off**
  (round 15's rule, ADR-0025 S16.7).
- It does not push, merge, or run the browser gate. The gate is GREEN at
  `1066e2d`, the permitted re-run is spent, and re-running can only lose that.
- It does not reproduce ADR-0028 D3's measurements — see §6.
