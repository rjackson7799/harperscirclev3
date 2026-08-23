# Round-16 findings — slice 5B, the app half of extraction + interpretation

**Landed verbatim, before anything is argued** (the `5faccc4` precedent).
Nothing in this file is a disposition. Every finding below is the
reviewer's own text, reproduced as written, including severity ratings
and confidence statements this session may go on to dispute. The
dispositions — accept or decline, each WITH the argument — are the next
commit and their own ADR.

**Review head:** `dd8a895` on `slice/5b-app-extraction`, base `main` @
`a9d9f43`. CI green at the review head, run `32620532301`, every step.
**Packet under review:** `docs/review/round-16-packet.md`.
**As-built record under review:** `docs/adr/0022-5b-app-extraction-deltas.md` (PROPOSED).

## How this review was commissioned

Seven independent reviewers, each given a distinct lens, read-only
access to the tree at `dd8a895`, and an explicit instruction to attack
the packet's and the ADR's claims rather than accept them. Each was told
that a clean area reported clean is a valid result and that inventing
findings is not. Each was required to quote the line it relied on and to
construct a concrete failure scenario or else downgrade the finding to
an observation.

The lenses, in the order their sections appear:

| § | Lens | Files at its centre |
|---|---|---|
| R1 | The band loader and the risk catalogue | `lib/extraction/bands.ts`, `fields.ts` |
| R2 | The provider adapter, asserted on the wire | `lib/ai/**`, `tests/ai/adapter.test.ts` |
| R3 | The render pipeline and the citation coordinate space | `lib/pipeline/render.ts`, the B2 spike |
| R4 | The worker state machine, the leases, the relay | `app/api/worker/[stage]/route.ts` |
| R5 | The member surfaces and the D15 class of defect | `inbox/page.tsx`, `senders/**` |
| R6 | The G9 corpus, the scorer, the real-key harness | `lib/eval/**`, `scripts/eval/run.ts` |
| R7 | Governance conformance — bounds, plan rows, coverage | the plan, the ADRs, `docs/coverage.md` |

R2 was additionally required to load the `claude-api` skill before
judging anything provider-shaped, per the standing rule for every
session touching `lib/ai/`.

**Findings are addressed as `R<n>/F-<m>`** — each reviewer's own
numbering is preserved rather than renumbered into one sequence, so that
"verbatim" means what it says.

---

## R1 — the band loader and the risk catalogue

*Lens: `lib/extraction/bands.ts`, `lib/extraction/fields.ts` and their
tests — "the thing that must not be wrong." Reported 11 findings, no
BLOCKERs, two MAJORs, and seven areas reported clean.*

### F-1 — The interpret arm computes `risk_class` from the catalogue directly, bypassing the band mode entirely
**Severity:** MAJOR
**Where:** `app/api/worker/[stage]/route.ts:491` (and the import at `:41`)
**Claim under test:** ADR-0022 D5 / `lib/extraction/bands.ts:178-181`: *"The all-high-risk mode is STRUCTURAL"* … *"In all-high mode this is `high` for EVERY field — that is the mode, not a bug."* TSD §6.5 / PRD §6.4: *"Until that set exists … every field is treated as high-risk."*
**What I found:** The extract arm routes through the mode — `route.ts:354`: `risk_class: effectiveRiskClass(fact.field, fact.value, bands)`. The interpret arm does not. It calls the catalogue directly:

```ts
if (kind === 'profile_fact') {
  payload.domain = p.domain;
  // §6.4: a high-risk field is high-risk however confident anyone is.
  payload.risk_class = riskClassFor(p.field ?? '', p.value);
}
```

`loadBands` is never called in `processInterpret`, and `bands`/`BandMode` never reach `draftPayloads`. The comment applies §6.4's *catalogue* rule but not §6.5's *all-high fallback* — which is the whole subject of D5. This is not cosmetic: `supabase/migrations/20260815230006_approve_proposal.sql:153-156` gates one-tap approval on exactly this value —
`if v_payload ->> 'risk_class' = 'high' and coalesce((p_edits -> 'confirm_high')::boolean, false) is not true then raise exception 'high_risk_unconfirmed'`.
So a proposal drafted `standard` is approvable **without** the high-risk confirmation, while the product is claiming to run all-high.

I verified the escape set empirically against the shipped catalogue (`effectiveRiskClass` vs `riskClassFor`, all-high mode):

```
document_date      all_high => high | catalogue => standard
patient_name       all_high => high | catalogue => standard
claim_number       all_high => high | catalogue => standard
document_title     all_high => high | catalogue => standard
document_summary   all_high => high | catalogue => standard
```

**Failure scenario:** Interpretation returns `{kind:'profile_fact', field:'patient_name', domain:'memories', value:'Nell Harper', …}` for a field not already on the record. `current.get('patient_name')` misses, so it stays a `profile_fact`; `riskClassFor('patient_name','Nell Harper')` → `'standard'`; the row lands in `hc.proposals` with `payload.risk_class = 'standard'`. Meanwhile the *same* arrival's extraction of the same field was stamped `'high'` by `effectiveRiskClass` — one arrival, two risk classes for one fact, differing by which table it landed in. When slice 6's approve surface calls `hc.approve_proposal`, that proposal skips `confirm_high` and is pre-selectable, in a mode that says nothing is.
**Test gap that let this through:** `tests/routes/worker-extract.test.ts:279-287` asserts the symmetric property for extractions — *"in all-high-risk mode even a standard field publishes as high (§6.5)"* — and it passes. No equivalent assertion exists for the interpret arm: `grep risk_class tests/routes/worker-interpret.test.ts` matches only the two `RECORD` fixture rows (`:76-77`); no test reads `proposals[0].payload.risk_class`. The two `profile_fact` tests (`:290`, `:313`) use `medication_dose` and `allergy_substance`, both `high` in the catalogue anyway, so the bypass is invisible.
**Confidence:** high. Confirmed by reading the call site, the absence of `loadBands` in `processInterpret`, the DB gate, and by running `effectiveRiskClass` vs `riskClassFor` against the shipped catalogue. Fix is one parameter: thread `bands` into `draftPayloads` and call `effectiveRiskClass`.

---

### F-2 — The comment names `"do-not-resuscitate"` as a case the boundary rule catches; it does not
**Severity:** MAJOR
**Where:** `lib/extraction/fields.ts:136-137` (claim), `:139-154` (`containsInstruction`), `:107-113` (`INSTRUCTION_KEYWORDS`)
**Claim under test:** Verbatim from the file: *"Hyphens count as boundaries: `"do-not-resuscitate"` is an instruction by anyone's reading."* Plus §6.5's last clause: any extracted instruction *containing* "do not" is high-risk whatever field it lands in.
**What I found:** The matcher is `haystack.indexOf(keyword, from)` over the literal keyword `'do not'` — **with a space**. Boundaries are tested only on the characters *outside* the match; nothing normalises the interior. `"do-not-resuscitate"` contains `do-not`, not `do not`, so `indexOf` returns `-1` and the loop never reaches the boundary test. The comment states the exact opposite of the behaviour, and names the one string it gets wrong.

Measured against the shipped module (`riskClassFor('document_summary', …)`):

```
"do-not-resuscitate order on file"  => standard
"DO NOT file this"                  => high
"do  not file this"                 => standard   (double space)
"do\nnot file this"                 => standard   (line break)
"DNR (do not resuscitate)"          => high
```

No test covers the hyphenated form. `tests/extraction/fields.test.ts:98` is `it.each(INSTRUCTION_KEYWORDS)` interpolating `` `Please ${keyword} this on Tuesday` `` — every case is the single-space spelling, so the phrase keyword is only ever exercised in the one form that works.
**Failure scenario:** A scanned advance-directive page yields `document_summary = "do-not-resuscitate order on file, signed 2019"`. §6.5's value rule should force `high`. It returns `standard`. Today the extract path masks this (all-high stamps everything `high` at `route.ts:354`), so the live consumer is the interpret path at `route.ts:491` — i.e. **F-1 and F-2 compound**: the one code path that reads `riskClassFor` unmediated is also the one with the keyword hole. That proposal is written `standard` and clears `approve_proposal`'s `confirm_high` gate.
**Confidence:** high. Reproduced directly against a byte-identical copy of `lib/extraction/fields.ts` (only the `server-only` import and the `@/` specifier rewritten; `diff` on `fields.ts` shows it identical).

---

### F-3 — Inflected forms of the §6.5 keywords escape, and the stated justification does not cover them
**Severity:** MINOR
**Where:** `lib/extraction/fields.ts:139-154`
**Claim under test:** §6.5 quoted in `fields.ts:18-21`: *"Any extracted instruction containing 'stop', 'start', 'do not', 'hold' or 'discontinue' is high-risk whatever field it lands in."* The narrowing is justified in-file by: *"a substring rule would class 'restarted' and 'household' as instructions and make the class meaningless."*
**What I found:** The guard tests non-letter on **both** sides. The two named false positives are excluded by the *leading* boundary alone (`restarted` → `before='e'`; `household` → `before='e'`). The *trailing* half of the test buys nothing against them and costs every inflection of the keywords themselves:

```
"Stopping lisinopril as of 3/14"  => standard
"Stopped lisinopril"              => standard
"Starting metformin tomorrow"     => standard
"Holding warfarin until Friday"   => standard
"Discontinued as of 3/14"         => standard
"stop taking this"                => high
"re-start on Monday"              => high
```

A trailing-suffix allowance (`(s|ed|ing)?`) would catch all five while still rejecting `restarted`/`household`, so the false-positive argument does not actually require the current rule.
**Failure scenario:** `document_summary = "Discontinued as of 3/14"` → `standard`. Same live consumer as F-2 (`route.ts:491`), same downstream effect on `confirm_high`. Downgraded from MAJOR because the narrowing *is* documented as a deliberate choice — this is an incomplete justification plus an untested boundary, not a silent bug.
**Confidence:** high for the behaviour (measured); medium on whether the owner considers it in-spec, which is the disposition to ask for.

---

### F-4 — `"fields": null` throws out of `loadBands` instead of failing closed
**Severity:** MINOR
**Where:** `lib/extraction/bands.ts:135` and `:150-151`
**Claim under test:** ADR-0022 D5 and `docs/coverage.md:420`: *"lib/extraction/bands.ts fails closed on missing/altered/stale/partial/malformed/non-blind with a test for each."* `docs/ops/ai-provider.md:109-111` repeats it.
**What I found:** The shape guard is
`if (!artifact || typeof artifact !== 'object' || typeof artifact.fields !== 'object')`.
`typeof null === 'object'`, so `fields: null` passes. Execution then reaches `const row = artifact.fields[field]` at `:151` and throws. Measured:

```
fields:null   => *** THREW *** TypeError: Cannot read properties of null (reading 'document_date')
fields:[]     => {"mode":"all_high","reason":"artifact_partial"}
fields:"x"    => {"mode":"all_high","reason":"artifact_unreadable"}
top-level []  => {"mode":"all_high","reason":"artifact_unreadable"}
```

Every other malformed shape I could construct fails closed correctly; `null` is the single hole, and it is the one value `typeof` lies about.
**Failure scenario:** Post-G9, with a digest in the allowlist and `HC_BANDS_ARTIFACT` set, an artifact whose `fields` serialised as `null`. The throw lands at `route.ts:606-611` — the message is **not acked**, so the visibility timeout redelivers it. Every redelivery re-claims, re-renders, and **re-calls the provider** (the throw is at `:343`, after `extractFromArrival` at `:318`), then throws again. Result: a poison loop with repeated paid extraction calls, on *every* arrival in the fleet, until attempt budgets exhaust — not "all-high", which is what the doc promises. Graded MINOR rather than MAJOR because reachability requires an owner to have signed bytes containing `"fields": null`, which `scripts/eval/run.ts` would not produce. The falsified as-built claim is the substance here; the fix is `!artifact.fields ||` in the existing guard.
**Confidence:** high. Reproduced against a byte-identical copy of `bands.ts` (diff shows only the `server-only` and `@/` import lines changed); the redelivery path read directly at `route.ts:606-611`.

---

### F-5 — `confidenceBand` has zero consumers, zero tests, and overloads `null` with two different meanings
**Severity:** MINOR
**Where:** `lib/extraction/bands.ts:190-201`
**Claim under test:** The function's own docblock: *"Slice 6's review screen is the consumer; slice 5 **records the answer** so the pair (fact, band) is already coherent when that screen arrives."*
**What I found:** Slice 5 records nothing of the sort. A repo-wide grep for `confidenceBand` matches exactly one line — the definition at `bands.ts:190`. It is not called from `route.ts` (the fact object built at `:350-358` carries `confidence` but no band), not called from any test, and there is no column to receive it: `supabase/migrations/20260821120003_extraction_runs.sql:379-387` inserts `field, value, confidence, risk_class, citation, model_id, prompt_version, run_id` and no band. So the docblock's "records the answer" is false, and the file the packet calls *"the thing that must not be wrong"* ships an exported, entirely unexercised function.

Separately, `null` is returned for two incompatible reasons — all-high mode (`:195`) and a field with no thresholds (`:197`) — with no way for a caller to tell them apart. 20 of the 32 catalogued fields are unbanded, including §6.4 high-risk ones (`ssn`, `account_number`, `routing_number`, `date_of_birth`, `tax_id`, `medication_route`, `allergy_reaction`, `procedure_instruction`, …), so even a fully calibrated deployment returns `null` for most fields. Measured in calibrated mode:

```
banded field, conf 0.9   => high
UNBANDED (ssn), 0.99     => null
UNBANDED (ssn), 0.01     => null
all_high mode, 0.99      => null
```

**Failure scenario:** I cannot construct a live one — there is no consumer to mislead. The concrete defects are the false as-built claim in the docblock and the untested surface. A slice-6 consumer writing `band ?? 'high'` or `if (!band) renderAsQuestion()` would be reading an ambiguous value, which is why the two cases should be distinguishable before that screen is written.
**Confidence:** high on the facts (grep + migration read + measurement); the ambiguity is a forward risk, not a present defect.

---

### F-6 — `HC_BANDS_ARTIFACT` is documented nowhere, and the `ai-provider.md` row the code cites does not exist
**Severity:** MINOR
**Where:** `lib/extraction/bands.ts:86-88` (claim), `:90-93` (the reader); `docs/ops/ai-provider.md:99-106` (the G9 rows)
**Claim under test:** `bands.ts:86-88`: *"it makes shipping the artifact an explicit deploy decision (**an `ai-provider.md` row at the G9 gate**) rather than a file that happens to be in the tree."*
**What I found:** `grep -r HC_BANDS_ARTIFACT` over the whole repo returns **one file**: `lib/extraction/bands.ts`. It is absent from `docs/ops/ai-provider.md`, from ADR-0022, from every env example, and there is no central env schema to catch it. The G9 checklist rows G9-1…G9-4 cover the BLIND run, the sign-off ADR, the allowlist digest, and the `(model_id, prompt_version)` match — none mentions setting the artifact path.
**Failure scenario:** An owner completes G9 exactly as `ai-provider.md` instructs: BLIND run, sign-off ADR, digest into `BAND_ARTIFACT_ALLOWLIST`, configuration matched. `HC_BANDS_ARTIFACT` is unset, so `configuredArtifactPath()` returns `null` and `loadBands` returns `allHigh('artifact_missing')` at `:117` — forever, with no log line, no metric, and no surface anywhere that reports the band mode or its reason (`route.ts:343` discards everything but the value). The gate reads closed on the checklist while the pipeline runs all-high. The direction is safe; the observability is nil and the checklist is incomplete.
**Confidence:** high. Verified by grep across the repo and by reading the G9 table.

---

### F-7 — `artifact_partial`'s numeric branches are untested; only the missing-field branch has a test
**Severity:** MINOR
**Where:** `lib/extraction/bands.ts:150-163`; `tests/extraction/bands.test.ts:122-128`
**Claim under test:** ADR-0022 D5 and the packet: *"There is a test for each failure shape."*
**What I found:** All seven `AllHighReason` values do have at least one test — I checked each. But `artifact_partial` has five distinct rejection conditions and only one is exercised: `delete artifact.fields[BAND_FIELDS[0]]` at `:124`. The four numeric guards (`!(row.high > row.medium)`, `!(row.medium >= 0)`, `!(row.high <= 1)`, `typeof !== 'number'`) have no test at all. I ran them by hand against the shipped module and **all four are correct**:

```
high=1e400 (Infinity)   => artifact_partial      high="0.9" (string)  => artifact_partial
high=medium             => artifact_partial      medium=1e400         => artifact_partial
high=-1, medium=-2      => artifact_partial      medium=-0            => CALIBRATED (correct: -0 >= 0)
```

NaN is caught transitively (`NaN > NaN` is false), and `medium > 1` is impossible given `medium < high <= 1`. So this is a coverage finding, not a correctness one — but in the file the packet singles out as "must not be wrong," a branch with no test is a branch a refactor can silently invert.
**Failure scenario:** None today. Deleting `!(row.high <= 1)` from the guard leaves the entire suite green (29/29 pass, verified), which is the concrete cost.
**Confidence:** high.

---

### F-8 — `BAND_ARTIFACT_ALLOWLIST` is `readonly` only to the type checker
**Severity:** OBSERVATION
**Where:** `lib/extraction/bands.ts:75`
**Claim under test:** *"The allowlist is a list of DIGESTS, checked into the repo. Bands are enabled by a commit."*
**What I found:** `export const BAND_ARTIFACT_ALLOWLIST: readonly string[] = []`. `readonly` is erased at compile time and the array is not frozen. Measured: `Object.isFrozen(...)` → `false`; `push()` succeeds and `loadBands({running})` then advances past the `:113` early return to the path check.
**Failure scenario:** Cannot construct a realistic one — mutating it requires code execution inside the server bundle, at which point the attacker can call `loadBands` with an explicit `allowlist` anyway. Stated as an OBSERVATION because a one-word `Object.freeze` is what makes "checked-in list" true at runtime as well as in the type system, and this module's stated posture is defence-in-depth.
**Confidence:** high on the fact, low that it matters in isolation.

---

### F-9 — Nothing bounds the artifact read, and it happens synchronously on every arrival
**Severity:** OBSERVATION
**Where:** `lib/extraction/bands.ts:119-127`; called from `app/api/worker/[stage]/route.ts:343`
**Claim under test:** Q2 of the review brief — ordering and bounds.
**What I found:** The **ordering is correct and worth saying so**: `createHash(...).update(bytes)` at `:126` runs before `JSON.parse` at `:131`, so bytes are authenticated before they are interpreted — the right way round. What is missing is any bound: `readFileSync(file)` at `:121` reads an operator-supplied absolute path fully into memory with no `statSync` size check, and there is no caching, so post-G9 every extract does a blocking read plus a full sha256 on the request path. Node's own `ERR_FS_FILE_TOO_LARGE` is the only ceiling, and it is caught into `artifact_missing`.
**Failure scenario:** No realistic one at the shipped state — `:113` returns before any I/O while the allowlist is empty. Post-G9, `HC_BANDS_ARTIFACT` pointed at a large file or a FIFO would block the worker; both require operator misconfiguration of an undocumented variable (F-6). Downgraded to OBSERVATION on that basis.
**Confidence:** high on the code; low on reachability.

---

### F-10 — `precision`/`recall` are declared and never validated; thresholds are accepted anywhere in [0,1]
**Severity:** OBSERVATION
**Where:** `lib/extraction/bands.ts:48` (the type), `:150-163` (the only validation)
**Claim under test:** `docs/eval/g9-corpus-spec.md` §6: the per-field floors are *"a floor the pipeline must clear before the field ships"*; item 2 there says *"the confidence-band thresholds stay PRD §6.4's — high ≥ 0.85, medium 0.60–0.85."*
**What I found:** `BandArtifact.fields[*]` declares `precision` and `recall`, and `loadBands` reads neither. Nor does it relate `high`/`medium` to PRD §6.4's numbers. Measured, all three calibrate cleanly:

```
precision=0, recall=0, high=0.85/medium=0.6  => CALIBRATED
precision/recall absent entirely             => CALIBRATED
high=1e-7, medium=0                          => CALIBRATED {"high":1e-7,"medium":0}
```

The last one bands every fact `high` — PRD §6.4's *"Pre-selected, one tap"* rendering — at any confidence above a ten-millionth.
**Failure scenario:** Requires an owner to sign an artifact carrying those numbers. The corpus spec pre-empts most of this itself (§6: *"These are proposals. Nothing in the code reads them until the owner signs"*), so this is a stated gap, not a hidden one. Raising it because the mechanical guard is what the rest of this module is *for*, and a `precision >= floor` check per banded field is cheap; the floors are already tabulated in the spec.
**Confidence:** high on the behaviour, and the corpus spec explicitly acknowledges the non-enforcement.

---

### F-11 — `confidenceBand` resolves prototype keys as thresholds
**Severity:** OBSERVATION
**Where:** `lib/extraction/bands.ts:196-197`
**What I found:** `bands` is built as `{}` at `:149`, so `mode.bands[field]` walks `Object.prototype`. `confidenceBand('constructor', 0.99, mode)` and `confidenceBand('toString', 0.99, mode)` both return `'low'` rather than `null` — the truthiness check at `:197` passes on the inherited function, then both `>=` comparisons against `undefined` are false. `loadBands` itself is safe here: `BAND_FIELDS` contains no name colliding with `Object.prototype`, and a `__proto__`-poisoned artifact correctly returned `artifact_partial` when I tried it.
**Failure scenario:** Not constructible. Field names reaching any consumer are gated by `isKnownField` in `lib/ai/extract.ts:69`, `constructor` is not catalogued, and `confidenceBand` has no consumers (F-5). The accidental outcome (`'low'`) is also the safe direction. `Object.create(null)` or `Object.hasOwn` closes it.
**Confidence:** high on the behaviour, and I state plainly that I could not construct an exploit.

---

## Areas I attacked and found clean

**Nothing at BLOCKER severity.** I could not construct any path to calibrated bands an owner never signed.

- **Q1 — option-parameter and env reachability: CLEAN.** `loadBands` has exactly one non-test caller, `app/api/worker/[stage]/route.ts:343`, and it passes only `running` — neither `allowlist` nor `artifactPath`. `configuredArtifactPath()` is exported but called only at `bands.ts:115`. Crucially the ordering makes the env var inert: `if (allowlist.length === 0) return allHigh('no_signed_artifact')` at `:113` runs **before** any path or env is consulted, so `HC_BANDS_ARTIFACT` cannot enable bands while the checked-in allowlist is empty — measured. The relative-path refusal at `:117` also holds. The one soft spot is that no `tests/lint/db-fence.test.ts` rule fences `lib/extraction/bands.ts` the way `lib/ai` and `lib/eval/blind` are fenced, so nothing mechanically stops a future module from passing an `allowlist` override; that is a forward risk, not a present defect.
- **Q2 — check ordering: CLEAN and deliberately right.** Digest before parse (`:126` before `:131`); empty-allowlist before I/O; blind-partition before identity; identity before per-field. Bounds are the gap, covered in F-9.
- **Q3 — numeric validation: CLEAN.** All of NaN, ±Infinity, negative `medium`, `high > 1`, `medium > high`, `high === medium`, and non-number types are correctly rejected, verified by execution. `medium > 1` is unreachable by construction. The only accepted oddity is `medium: -0`, which is correct. The gaps are coverage (F-7) and semantic floors (F-10), not correctness.
- **Q4 — `effectiveRiskClass` in all-high mode: CLEAN at `bands.ts:179`** (`if (mode.mode === 'all_high') return 'high'` is unconditional and precedes everything). The defect is that the interpret arm never calls it — F-1.
- **Q5 — `BAND_FIELDS` vs the extractor: CLEAN.** `lib/ai/schema.ts:36` derives the schema's field enum from `EXTRACTION_FIELDS`, and `lib/ai/extract.ts:69` re-gates every fact on `isKnownField`, so no uncatalogued field survives to be classified. The 12-of-32 banded split is intentional (`fields.ts:118-120` filters `banded`), and no risk-class guarantee depends on `BAND_FIELDS` — `riskClassFor` covers all 32 and returns `high` for anything else. The `null`-band ambiguity for the 20 unbanded fields is folded into F-5.
- **Q6 — the empty-allowlist test is load-bearing.** `tests/extraction/bands.test.ts:73`, `expect(BAND_ARTIFACT_ALLOWLIST).toEqual([])`, fails on any added digest; it cannot be satisfied trivially. One provenance gap worth naming: it asserts the *value*, not that the value is a literal. Changing `bands.ts:75` to read from `process.env` would keep CI green (unset in tests) while letting production enable bands — and given `configuredArtifactPath()` already establishes an env-reading precedent two lines below, that is the shape of a future regression this test would not catch.
- **Q7 — §6.4/§6.5 honoured: CLEAN on the field-class axis.** Every one of PRD §6.4's named high-risk classes is catalogued and classed `high` (`fields.ts:52-103`, pinned by `tests/extraction/fields.test.ts:26-57`), risk is never derived from confidence, and `risk_class` is absent from `EXTRACTION_SCHEMA` so the model is never asked for it (`schema.ts:31`, asserted at `tests/routes/worker-extract.test.ts:289-294`). The claim *"§6.4's high-risk list still overrides confidence entirely"* holds in `effectiveRiskClass` — the catalogue is consulted with no reference to any band. The failures are on the §6.5 **value** axis (F-2, F-3) and in the one caller that skips the mode (F-1).
- `tests/extraction/bands.test.ts` and `tests/extraction/fields.test.ts` are green at HEAD: **2 files, 29 tests passed**.

**R1 supplement (returned after the main report):** the background grep
finished and corroborates F-6 with no change to the report:
`HC_BANDS_ARTIFACT` occurs in exactly one source file —
`lib/extraction/bands.ts` — plus `.next/` build artifacts, which are only
compiled copies of that same module. The `docs/ops/ai-provider.md` grep
returned a single hit, line 105 (`BAND_ARTIFACT_ALLOWLIST` in row G9-3);
there is no row anywhere on the G9 checklist for the artifact path,
confirming that the code comment at `bands.ts:86-88` cites an
`ai-provider.md` row that does not exist.

---
