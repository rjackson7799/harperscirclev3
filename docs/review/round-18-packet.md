# Third-party review packet — round 18: the built slice 6B, the Care Inbox app increment

**Read this file first, top to bottom.** The head ledger is at the top by
design (round-7 E2), the tree binding is stated per directory (ADR-0015
F12), and every evidence leg below was produced at ONE declared head rather
than at a run three commits behind it (R7/F-8).

**The headline, stated before anything else: the close-out gate was RED, and
it was red for three real product defects.** They are fixed, the gate is
green at the final head, and the whole sequence is in ADR-0026 D15 — including
two fixes that were wrong before the third was right. Nothing here was
re-run to green.

---

## Head ledger

A packet cannot name its own SHA (round-17 F-4: the row that tried was false
when the review read it). So the last row is a RULE, checkable at any head.

| Purpose | SHA | Tree relationship | CI |
|---|---|---|---|
| Base | `b0cc2b6` | `main` | — |
| 6B build head | `bc3bc85` | the ten B-rows + the S16.8 slot + the review legs | **never run — see below** |
| Close-out red | `15c5376` | the gate's three findings pinned as failing tests | idem |
| Close-out green | `c58a7e7` | findings 1 + 2 fixed; OCR attempt 1 | idem |
| OCR attempt 2 | `f9f7f1a` | `serverExternalPackages` — real defect, NOT the cause it claimed | idem |
| OCR attempt 3 | `1a20671` | validated resolution — **and a regression of its own** (packet §D17) | idem |
| OCR attempt 4 | `5457eaa` | the specifier back to a LITERAL — D17 | idem |
| Close-out red | `50a1a5c` | **F5** pinned — the artifact route awaits storage forever | idem |
| Close-out green | `7ecc81b` | F5 fixed — `lib/storage/fetch.ts` (D18) | idem |
| Close-out red | `76d7299`, `0eb0ad1` | **F6 + F7** pinned — nine cases that fail by HANGING, and a scanner | idem |
| Close-out green | `7373e14` | F6 + F7 fixed — `lib/http/budget.ts` (D19, D20) | idem |
| **Evidence head** | `7496cbc` | **F8 fixed — the last commit that moved a non-docs tree.** Every number below was produced at this tree, and the gate is **38 passed (7.6 m)** on it (D21) | not run at this SHA; **its code was run** — see below |
| Docs head | `740e1a6` | **docs-only** on top of the evidence head — inherits its gate run under ADR-0015 F12. `git diff --name-only 7496cbc..740e1a6` lists five files, all under `docs/` | **run 151 — SUCCESS** |

### CI — pushed on owner authority, and GREEN; what that does and does not prove

Until 2026-08-25 this section read *"CI has never run on this slice"*, and it
was true: `git ls-remote --heads origin 'slice/6b*'` returned nothing. The
owner then authorised the push. The branch is pushed and **CI run 151 at
`740e1a6` concluded `success` on attempt 1** (242 s,
`actions/runs/32910646071`).

**The run is at the docs head, not the evidence head, and that is not a
loophole.** `git diff --name-only 7496cbc..740e1a6` lists five files, every
one under `docs/`. The code tree CI compiled and tested is byte-identical to
the tree every local number was produced at.

**What run 151 proves** — independently of this machine: gitleaks, the
service-role containment and exposed-schema scanners, `db:reset` from the 69
migrations with an exact-state verify, **`test:db` (pgTAP)**,
**`test:concurrency`**, `db:verify` with warnings fatal, `test:app` (vitest),
the G9 corpus `--check`, the **upgrade leg** (base reset → increment apply →
both suites again), `lint` and `typecheck`. Both tee'd suite steps run under
`set -o pipefail`, so a green step there is a real exit-0 and not a tee
masking one.

**This retires a carry-forward argument.** `test:db` and `test:concurrency`
were carried from `bc3bc85` un-re-run, on the stated ground that no file
under `supabase/` or `scripts/concurrency/` had changed. CI ran both from a
cold database anyway — twice, counting the upgrade leg. That claim is no
longer an argument; it is a result.

**What run 151 does NOT prove, stated as plainly as the old gap was.**

1. **CI does not run the Playwright browser gate.** That is by design and the
   workflow says so. The 38-leg gate, and therefore every close-out finding
   F1–F8, remains **local evidence only**. No CI run can upgrade it.
2. **CI does not run `npm run build`.** The zero-`<dynamic>`-warnings claim
   is local-only — and D17's defect (F4) was a *build-time* signal. **CI
   would not have caught F4.** This is a genuine gap in the pipeline, found
   while reading the workflow to report this run, and it is named here rather
   than left for the round to discover.

The run is fast (242 s) next to local wall-clock. That was checked rather
than assumed: run 150 on `main` (`b0cc2b6`, this branch's base) took 201 s,
and the two deltas run the right way — its upgrade leg early-exited at **1 s**
where 151's rehearsed for **37 s**, and vitest went **28 s → 43 s** on the
larger suite. ~4 minutes is this workflow's ordinary runtime on a runner; the
build host is the memory-bounded one (D14).

---

## What 6B is

6A gave the database the power to express §4.2. 6B is the slice in which a
person can finally see it: the review screen, the two decisions, the receipt,
the citation that lands on a region a human can look at, and a reading aid
for a page that has no text layer.

Every cell of the 6A/6B seam said the same thing — *"the database can now
express what §4.2 describes, and no member has yet been shown any of it."*
This slice shows it.

---

## Migration budget — 7 of ≤ 7 SPENT

The pre-authorised S16.8 slot landed BEFORE B8 as ruled:
`20260825120001_payload_contract.sql`, closed **CONSUMED** — the third
re-derivation found the top-level `p_edits` contract and `revise_object`'s
three classes, so DDL genuinely was needed. All six S16.8 conditions are
disposed. `064` runs at `plan(32)`. Migrations went 68 → 69.

**There is no remaining DDL authority of any kind.** Any further DDL needs a
fresh owner amendment stated before a line is written.

---

## Red→green history

Each red commit names its own failure signatures. See ADR-0026's commit
table for the full list; the close-out sequence is:

| Commit | What |
|---|---|
| `15c5376` | RED — three findings pinned as failing tests, signatures quoted |
| `c58a7e7` | GREEN — findings 1 + 2; OCR attempt 1 |
| `f9f7f1a` | OCR attempt 2 — `serverExternalPackages` |
| `1a20671` | OCR attempt 3 — validated resolution; **the previous commit's "real cause" claim corrected in its message rather than left standing** |
| `5457eaa` | OCR attempt 4 — the specifier back to a literal (D17) |
| `50a1a5c` → `7ecc81b` | RED → GREEN — **F5**: storage gets a bound and a name (D18) |
| `76d7299`, `0eb0ad1` → `7373e14` | RED → GREEN — **F6** the bound in the wrong place, **F7** the leg with a hidden precondition (D19, D20) |
| `7496cbc` | **F8** — the gate's thinnest leg gets a budget of its own (D21); `r8` is its red |

---

## The defects the gate found

Full narrative in ADR-0026 D15. In brief, and all three in code no browser
had ever executed:

1. **`input[type='file']` carried no touch floor** — `/upload`'s control
   measured 253×21 at 390px. It was the one visible input type
   `app/globals.css` never enumerated. Found by B9's own R5/F-6 audit legs
   the first time any browser visited that route.
2. **`String(row.received_at)` at the DB boundary** — node-pg returns a
   `Date`, so the review screen threw before rendering one fact and **all
   seven review legs went red**. This is **round-16 R5/F-1 recurring**, in
   three places, in the module written after the lesson was recorded. The
   route test never saw it because its mock supplied a correct ISO string —
   *the mock was more honest than the implementation.*
3. **§6.9's reading aid was absent from the running app** — tesseract.js
   could not spawn its worker. Took **four** attempts; the first three were
   reasonable, precedented, and wrong. See ADR-0026 D15.

**What the round should take from this:** in all three cases the rule was
already written down and nothing checked it. All three are now mechanical —
a selector-list assertion, a boundary scanner, and an externals scanner.

### And a fourth defect, made by the close-out itself (ADR-0026 D17)

Finding 3's third fix introduced a regression: a `require.resolve` on a
**variable** is unanalysable, so Turbopack emitted `Can't resolve <dynamic>`
**481–556 times per gate run**, destabilising the dev server until two review
legs timed out on a 404 from `/decide/submit` — a route unrelated to OCR.

**It was classified as environmental twice before being read correctly.** The
supporting evidence was real (7.7 GB host, commit charge 30.0–30.2 of 31.7,
`WorkerError` in the tee, a documented memory-bounded-hosts note that fit)
and none of it was the cause. The tell was a warning count that went from
**zero to hundreds at exactly the commit where the legs began failing**.

The round is invited to weigh whether the rule drawn from it belongs in the
ops doc as well as the ADR: *"the environment is unwell" is the most
comfortable diagnosis available and must be the last reached for — diff the
tree against the last passing run, and compare what the logs say now with
what they said then, before blaming a resource number that was already true
yesterday.*

---

## Verification evidence — ONE declared head (`7496cbc`)

Every command run SOLO (the B6 lesson: PowerShell `;` chaining reports only
the last exit code).

| Check | Result |
|---|---|
| `db:reset` → `verify-migration-state` | clean, **exact 69** |
| `vitest` (`test:app`) | **877 / 877** across 75 files |
| `lint` (SOLO) | clean |
| `typecheck` | clean |
| `build` | clean |
| **browser gate, 38 legs, `--trace on`, teed** | ****38 passed (7.6 m)** — `gate-6b-head-r9.txt`. Every one of the 38 legs green, including the seven review legs, leg 17 (SCN-01) and leg 38 (OCR-01)** |
| **PRF-07 bench** | report-only — see the bench section |

### Carried forward from `bc3bc85`, on a stated reason

`test:db` **1622 / 65 files PASS**, `test:concurrency` **75/75** (teed, clean
leg *and* the upgrade leg from `main b0cc2b6`: reset 68 exact → `supabase
migration up` → 69 exact), `db:verify --fail-on warning` clean, `gitleaks`
(CI-identical docker digest) 418 commits with no leaks, G9 harness dry-run
40/40 requests built and **nothing sent**.

These are **not** re-run at the close-out head, and the reason is checkable
**at the declared head, not at the one it was first written about**:
`git diff --name-only bc3bc85..7496cbc` touches only
`app/api/artifact/[id]/route.ts`, `app/globals.css`, `e2e/*.spec.ts`,
`lib/hc/*.ts`, `lib/pipeline/ocr.ts`, `lib/http/budget.ts`,
`lib/storage/fetch.ts`, `next.config.ts` and `tests/**`. Nothing under
`supabase/` moved, and nothing under `scripts/concurrency/`;
`scripts/concurrency/run.mjs` imports only `pg` and `node:crypto` and drives
SQL directly, never through `lib/hc`; pgTAP is pure SQL. Neither suite can
observe a JavaScript change.

### The gate is LOCAL

CI does not run the browser gate. Pending never counts as green. A product
failure is never re-run to green — every defect above was fixed and the head
moved, which is why this close-out took **eleven commits and eight gate runs**
(one of which, `r4`, was stopped mid-run and is not a gate result, so seven
are results) rather than one of each.

### D8 condition 6 — discharged

`e2e/ingestion.spec.ts` **"below the cliff: a family-tier member sees
NOTHING (Q6 probed live)"** — cited by title, for the reason below — was
**observed executing and passing** (46.1 s at `bc3bc85`, and again at the
declared head). A gate result for `e2e/ingestion.spec.ts` may now be
reported.

The same run discharges the live halves of **UXA-01** and **RLS-10** — the
two rows ADR-0025 D8's S-2 annotation recorded as never having been observed,
because that leg sat last in a `test.describe.serial` block and was skipped
in all three 6A runs.

**The stale pointer, recorded — and it went stale a second time mid-slice:**
D8's condition named `ingestion.spec.ts:400`. The leg was `:574` at the start
of this close-out and is `:580` at its end, because F7's fix added six lines
of comment above it. The operational instruction in
`docs/ops/e2e-local-gate.md` cites it **by title** and no longer carries a
number at all; the historical `:400` is left where it correctly describes the
6A runs. Two drifts in one slice is the argument for the rule, not an
anecdote about it.

**And a third, in `docs/coverage.md` itself.** F8's fix added 21 lines of
comment inside leg 33, which moved five review legs below it — so the line
references in the coverage citations for `CNF-02`, `REV-02`, `REV-01`,
`A11Y-07` and `A11Y-08` were stale the moment that commit landed. They were
**re-verified line by line at the evidence head** before the rows were flipped
(`:336→:357`, `:407→:428`, `:441→:462`, `:503→:524`, `:562→:583`; `CIT-01`,
`RCP-01` and `DEC-01` unmoved at `:237` and `:295`). Every one of those
citations already quotes the leg's TITLE as well, which is what makes the
drift survivable — the number is belt-and-braces, and a wrong number is worse
than none. **Three line-drifts in one slice, all in one direction: a leg that
grows pushes every leg below it, and any document that points at a line rather
than a name is wrong from that commit onward.**

---

## The PRF-07 bench (report-only)

**Report-only.** These figures are OUR MACHINERY'S share of §13.2's 60 s
budget, measured against a LOCAL FIXTURE SERVER with no provider in the path.
The hosted, provider-inclusive measurement is a named activation row on
`docs/ops/ai-provider.md` carrying PRF-06's breach-clause discipline — a breach
goes to the owner, never quietly absorbed.

**THE METHOD, STATED WITH THE NUMBERS** (PRF-06's, verbatim, because a p95
without its method is a number and not a measurement):

- **Cohorts.** One per corpus document class that reaches extraction —
  born-digital PDF, scanned PDF, phone photo, email body. §6.3 renders them at
  DIFFERENT resolutions, so pooling them would report a figure that describes
  no document. Named, never blended.
- **Samples.** 1 cold per cohort; 12 warm per cohort per leg.
- **Cold vs warm — reported SEPARATELY, never blended.** Cold is the first
  observation after a restart: pools empty, the rasterizer not yet loaded
  (pdfjs and the canvas binding since 6B B1), no plan caches. Warm is the
  steady state. A blended p95 flatters the cold path and slanders the warm one.
- **Percentile.** Nearest-rank on the sorted sample, index `ceil(0.95·n) − 1`.
  Identical to PRF-06 so the two benches' numbers are comparable.
- **Queue depth.** Single AND concurrent (depth 4), because §13.2's budget is a
  promise to a family whose mail arrives with everyone else's.
- Each sample gets its own content sha WITHOUT changing what the document says
  — identical bytes are a stage-1 duplicate by design, so a bench that re-sent
  one fixture would measure the duplicate path from its second sample on.

### COLD — n = 1 per cohort, first observation after a restart

| Cohort | p95 | share of the 60 s budget |
|---|---|---|
| born-digital PDF | 11 634 ms | 19.4% |
| scanned PDF | **17 900 ms** | **29.8%** |
| phone photo | 3 271 ms | 5.5% |
| email body | 750 ms | 1.2% |

### WARM — n = 12 per cohort

| Cohort | p50 (depth 1) | p95 (depth 1) | p50 (depth 4) | p95 (depth 4) |
|---|---|---|---|---|
| born-digital PDF | 747 ms | 3 062 ms | 2 864 ms | 4 967 ms |
| scanned PDF | 7 724 ms | 13 143 ms | 17 461 ms | **20 479 ms** |
| phone photo | 1 806 ms | 2 030 ms | 4 957 ms | 5 868 ms |
| email body | 412 ms | 639 ms | 819 ms | 1 311 ms |

**The worst figure is 20 479 ms — the scanned PDF at queue depth 4, 34.1% of
§13.2's 60 s budget.** Stated the way PRF-06 requires: **that says our
machinery leaves the provider ~40 s, not that the budget is met.** The scanned
PDF is the cohort that carries §6.9's OCR, and it is the only one whose warm
p95 moves materially with queue depth (13.1 s → 20.5 s); every other cohort
stays under 6 s at depth 4.

**Signal staleness bound: 30 s** (the Care Inbox revalidation interval; one
relay tick is 60 s) — reported by the harness alongside the figures, since
PRF-08's row is about §4.5's window rather than the pipeline's.

**A HARNESS NOTE, RECORDED BECAUSE IT COST A RUN.** `.env.local` leaves
`HC_WORKER_KEY` **empty**; the local gate supplies it (and the storage
credential) from `playwright.config.ts`'s `webServer` env. Run without them the
worker route answers `503 worker disabled`, `sendPipelineWork` is enqueued and
never drained, and every arrival sits at `extracting` until its 60 s budget
expires — which the harness then reports honestly as `no samples · N run(s)
did not reach proposals_ready` rather than as a fast zero. The bench was run in
the gate's own environment, which is the environment 38 legs pass in.

---

## Coverage rows — the fourteen, exactly as tabled

Twelve move; two are asserted unchanged. `SIG-01` is explicitly **not**
absorbed by this slice.

| Row | From | To |
|---|---|---|
| REV-01 | pgTAP half green (6A M2) | **green** |
| REV-02 | pgTAP half green (6A) | **green** |
| DEC-01 | pgTAP half green (6A M3) | **green** |
| CIT-01 | pending | **green** |
| RND-02 | 6A half green (M4) | **green** |
| RCP-01 | pgTAP half green (6A M5) | **green** |
| CNF-02 | pending | **green** |
| OCR-01 | pending | **green** |
| EVA-02 | pending | **green** |
| PRF-08 | pending | **green** (after the bench) |
| A11Y-07 | pending | **green (6B)** |
| A11Y-08 | pending | **green (6B)** |
| RCP-02 | pending | **STAYS pending, tagged 7** |
| UXA-03 | pending | **STAYS pending** — read at this gate |

**DEC-01's cell RECORDS the S16.8 residue closed at `20260825120001`
(064:21–32). RULING 5 stands: F-1's FIXED-IN-PART verdict is the round's to
move. The cell records; the round rules.**

---

## Pointed questions for round 18

### Q1 — the data package (put in these words, as required)

`@tesseract.js-data/eng` 1.0.0 is argued as **DATA FOR the Q3 engine
resolved locally — the identical bytes its CDN default serves — and NOT a
fourth argued runtime dependency.** MIT packaging; the tessdata model itself
Apache-2.0. Licences read from the installed manifests, output pasted in the
red commit.

*Recommended answer: accept as data.* The alternative is to fetch the same
bytes from a CDN at runtime, which would break the no-remote-fetch posture
B2 made a test failure.

**Owner position, recorded 2026-08-25: the recommended answer is ACCEPTED.**
`@tesseract.js-data/eng` is carried as **data for the Q3 engine**, not as a
fourth argued runtime dependency. The question still stands to round 18; it
now goes up carrying the owner's position rather than only a build session's
recommendation. A build session records; the round rules.

### Q2 — the `rendered` flag, RATIFICATION ASKED

B10 gave blind labels a measured `rendered` flag; unrendered items are
excluded from recall, matching production's behaviour as a false positive.
**This reinterprets what a blind label means.** D11's own language is what is
encoded — but a build session records and the round rules, so this is put
for ratification rather than assumed.

### Q3 — UXA-03's copy

The review screen's copy, the receipt's sentences and the refusal/staleness
language are **read at this gate**, per the UXA-01/UXA-02 pattern.

### Q4 — the fence transient, now FIVE occurrences across TWO fence files

A lint-fence test has timed out under full parallel load at **five** separate
points in this slice. Each time, the file passed when run alone and the full
suite was clean on re-run: `tests/lint/a11y-fence` at B2 and at the close-out
head (6/6 alone); `tests/lint/db-fence` at B9 and at the F5 head `7ecc81b`
(34/34 alone); and a fifth at the evidence head `7496cbc` — 876/877 on a
190.8 s run, then 877/877 twice at the same head with no code in between —
**whose identity was never captured, because that run was not teed.** All five
carry the same loaded-vs-clean duration signature. Classified, never
diagnosed, per D14.

*An earlier draft of this question read "three occurrences (B2, B9,
close-out), always 6/6 alone." That undercounted, and it filed B9 under the
wrong fence file — B9 was `db-fence` at 34/34. Corrected against ADR-0026 D14
at the head being pushed.*

**Five occurrences of one shape, one of which cannot even be named, is itself
a finding.** Recommended: queue it for diagnosis rather than a sixth
classification, and tee the full vitest suite the way `test:concurrency`
already is, so that the next one arrives with a name.

### Q5 — `lib/hc/review.ts` has no live-DB module test

Its boundary is pinned by a static scanner and by seven e2e legs, but it has
no `tests/hc/` integration test of the kind `tests/hc/inbox.test.ts` gives
the inbox layer. **That gap is what let finding 2 through**, and this slice
does not close it.

---

## What is NOT claimed

- **Nothing is production-activated.** G4 and G7 still block.
- **The G9 gate STAYS OPEN.** Slice 6 does not close it. Scoring being
  honest is not the same as bands being signed.
- **`BAND_ARTIFACT_ALLOWLIST` stays EMPTY.**
- **The slice-5B queue stays 39 OWED.**
- **RCP-02** is staged forward to row 7: Documents and People & roles do not
  exist. The receipt names every destination and 6B links only the two that
  resolve.
- **No real family data** was used anywhere.

---

## Merge

Owner is sole merge authority. **Merge commit, never squash.**

The two things this section previously listed as owed are done: the branch is
pushed, and **CI run 151 is green** on a code tree identical to the evidence
head. Both happened on explicit owner authority, not on a build session's
initiative. **The merge itself has not been made and is not the build
session's to make.**
