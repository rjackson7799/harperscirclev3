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

Eight independent reviewers, each given a distinct lens, read-only
access to the tree, and an explicit instruction to attack the packet's
and the ADR's claims rather than accept them. Each was told that a clean
area reported clean is a valid result and that inventing findings is
not. Each was required to quote the line it relied on and to construct a
concrete failure scenario or else downgrade the finding to an
observation.

R1–R7 read the tree at `dd8a895`. **R8 was commissioned mid-review**,
after `6e615fe` added packet question **Q-I** — the three
already-green assertions the build session changed — which obliges the
review to form a view on all three; only one of them (the cancel leg)
was covered incidentally by the original seven. R8 read the tree at
`6e615fe`, which differs from `dd8a895` by that one docs-only commit.

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
| R8 | Q-I — the three amended green assertions | `worker-stage`/`relay` tests, `ingestion.spec.ts`, `extraction.spec.ts` |

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

## R2 — the provider adapter, asserted on the wire

*Lens: `lib/ai/**`, `tests/ai/adapter.test.ts`, `scripts/ai-fixture-server.mjs`,
`docs/ops/ai-provider.md`. This reviewer loaded the `claude-api` skill
before judging anything provider-shaped, per the standing rule. Reported
18 findings in the main pass plus two supplements, including two
BLOCKERs.*

### F-1 — The configuration-hash test is a tautology; nothing pins the hash, so §6.10 is not mechanical
**Severity:** BLOCKER
**Where:** `lib/ai/config.ts:152`, `tests/ai/adapter.test.ts:290-295`
**Claim under test:** ADR-0022 D4: "`prompt_version` ENFORCES M3's semantics… a test asserts they agree. Changing the configuration without bumping the version **reds** — §6.10's 'not shippable without a re-run', made mechanical." `config.ts:23-26` repeats it: "That is enforced rather than remembered… changing the configuration without bumping the version reds `tests/ai/adapter.test.ts`."
**What I found:** `PROMPT_VERSION` is *derived*, not declared:

```ts
export const PROMPT_VERSION: string = `${PROMPT_VERSION_NAME}+${configurationHash()}`;
```

and the test is:

```ts
expect(configurationHash()).toBe(PROMPT_VERSION.split('+')[1]);
```

`PROMPT_VERSION.split('+')[1]` **is** `configurationHash()`. The assertion compares a value to itself and cannot fail for any edit to any covered input. There is no pinned hash literal anywhere in the repo — `grep hc-5b-1` returns only `config.ts:144` and four test fixtures using fabricated hashes (`hc-5b-1+abc`, `hc-5b-1+deadbeefdeadbeef`). The suite is green (27/27) and would stay green after any schema/prompt/parameter/render edit.
**Failure scenario:** Change one word in `EXTRACT_SYSTEM_PROMPT`. `configurationHash()` changes; `PROMPT_VERSION` silently changes with it; `npx vitest run tests/ai/adapter.test.ts` passes 27/27. The deploy ships a `(model_id, prompt_version)` pair no G9 run ever measured. `loadBands` compares the running triple against the artifact and fails *closed*, so risk classes stay `high` — but the ADR's claim that the change is *caught* is false, and the ops checklist row G9-4 ("is not shippable without a re-run") has no mechanism behind it. The only thing that reds is the bands artifact, which ships empty and is therefore inert today.
**Confidence:** high — read both lines, ran the suite, and grepped for any pinned hash. A one-line `expect(configurationHash()).toBe('<literal>')` would be the fix and its absence is the defect.

---

### F-2 — The one test that claims to prove the request timeout never dispatches a request
**Severity:** MAJOR
**Where:** `tests/ai/adapter.test.ts:271-279`, `lib/ai/config.ts:83,94-101`, `lib/ai/client.ts:113-117`
**Claim under test:** Review point 7 / §1.9: "a hanging provider is cut off by OUR timeout, not by the platform"; the fixture server documents `HC-FIXTURE-HANG → no response at all, so OUR timeout is what cuts` (`scripts/ai-fixture-server.mjs:35`).
**What I found:** The test passes `deadlineIso: new Date(Date.now() + 1_500)`. `providerTimeoutMs` computes `remaining (1500) - FINALIZE_RESERVE_MS (20_000) = -18_500`, returns `0`, and `callProvider` takes the pre-dispatch branch at line 113-117 (`'no provider budget inside the lease'`). The `HC-FIXTURE-HANG` marker never reaches the server. Empirically confirmed: the test is reported as **1ms** in the verbose run (a real hang cut by a real client timeout could not be 1ms; the `it(..., 20_000)` timeout on it shows the author expected otherwise). `grep -rn HC-FIXTURE-HANG` finds the marker only in the fixture server and this one test — so the hang branch at `ai-fixture-server.mjs:271` is dead code at the gate.
**Failure scenario:** Remove `{ timeout: call.timeoutMs }` from `client.ts:133` entirely. The SDK falls back to its own default and, at `max_tokens: 24_000` non-streaming, would throw `AnthropicError('Streaming is required…')` — a different failure, but the *timeout-cuts-a-hang* property has no test that would notice its removal, and the 240s cap / 20s finalize reserve interaction is never exercised end-to-end. A provider that accepts the connection and stalls for 240s inside a 300s lease is the exact case §1.9 exists for, and it is unproven.
**Confidence:** high — arithmetic is deterministic and the 1ms runtime is direct evidence.

---

### F-3 — Three things change the wire (or the pixels) without changing the configuration hash
**Severity:** MAJOR
**Where:** `lib/ai/config.ts:108-126`, `lib/ai/extract.ts:125-128`, `lib/ai/interpret.ts:110-113`, `lib/ai/prompt.ts:76-86`, `lib/pipeline/render.ts:234-291`
**Claim under test:** ADR-0022 D4 / packet claim 5: "the hash covers schemas, parameters, prompts and the §6.3 render rules."
**What I found:** `inferenceConfiguration()` covers `prompts: {extract: EXTRACT_SYSTEM_PROMPT, interpret: INTERPRET_SYSTEM_PROMPT}` and `render: {standard_long_edge, high_long_edge, ceilings}`. It does **not** cover:

1. **The trailing user instruction.** `extract.ts:127` — `` `The source is a ${…}. Return the document's facts and its filing summary.` `` — and `interpret.ts:112` — `'Propose what a person might want done about this document.'`. These are prompt text that reaches the model on every call and materially steers it. Editing either is a prompt change with an identical hash.
2. **The delimiters.** `prompt.ts:76-86` builds `<document_text>`, `<subject_record>`, `<extracted_facts>`. The tag *names* appear in the system prompt strings (hashed) but the *wrapper functions* are not, so the two can be desynchronised silently.
3. **The actual §6.3 render encoding.** `render.ts:277` — `pixmap.asJPEG(90)` — plus the PNG/JPEG choice keyed on `sourceClass` (`render.ts:236`) and `ColorSpace.DeviceRGB`. These decide the *pixels the model sees*. `RENDER_CEILINGS` and the two long edges are hashed; the quality constant and the codec choice are not. The ADR's own justification for hashing render rules — "a citation is only meaningful against the rendering it was produced from" — applies with more force to JPEG quality than to a page-count ceiling.

**Failure scenario:** Change `asJPEG(90)` to `asJPEG(55)` to shave the render-bytes ceiling. Scanned-PDF and photo pages degrade; extraction precision on handwriting drops; the citation crop a family sees is mushier. `configurationHash()` is byte-identical, `PROMPT_VERSION` is unchanged, `loadBands` still matches the signed artifact, and the calibrated bands — signed against q90 renders — keep classifying q55 output as low-risk. This is precisely the "not shippable without a re-run" case, and it ships.
**Confidence:** high — read `inferenceConfiguration()` key by key against the three call sites.

---

### F-4 — The G9 eval harness rebuilds the request by hand, so bands are signed against a third construction site with no wire assertions
**Severity:** MAJOR
**Where:** `scripts/eval/run.ts:69-107`
**Claim under test:** ADR-0022 D4 ("the wire is the contract"); `docs/ops/ai-provider.md` G9-4 ("the shipped `(model_id, prompt_version)` pair MATCHES that run"); `config.ts:73-77` ("keeping the worker non-streaming means the eval measures the same call shape the worker uses").
**What I found:** `requestFor()` does not call `extractFromArrival` or any shared builder. It re-implements the block assembly inline — its own `imageBlocks` loop (lines 76-85), its own `delimitedDocumentText` push, and its own copy of the trailing instruction string at line 91, character-for-character duplicating `extract.ts:127`. There is no test that compares the eval's `params` to the worker's request body, and the fixture-server assertions in `tests/ai/adapter.test.ts` never touch this path. Combined with F-3, the identity that G9-4 checks (`model_id`, `prompt_version`) is blind to a divergence between the two builders.
**Failure scenario:** Someone reorders `extract.ts` so the delimited text block precedes the images (a plausible tweak — text-first often helps). The worker's wire changes; `requestFor()` still emits images-first; `configurationHash()` is unchanged; G9-4's equality check passes; the bands signed from an images-first run are applied to a text-first pipeline. Nothing in CI or the gate can see it.
**Confidence:** high — the duplication is literal and visible in both files.

---

### F-5 — Every provider error becomes `unavailable`; a permanent 400 burns the full 3-attempt / 900-second budget, and 429 has no handling at all
**Severity:** MAJOR
**Where:** `lib/ai/client.ts:135-137`, `app/api/worker/[stage]/route.ts:327-337,544-545,605-606`, `supabase/migrations/20260816010001_pipeline_tables.sql:75`
**Claim under test:** ADR-0022 D4 / packet claim: "`maxRetries: 0` is argued, not an oversight… An SDK retry loop is a second, INVISIBLE counter." Review point 2 asks specifically whether a transient rate-limit burns a durable attempt.
**What I found:** The catch is a single undifferentiated arm:

```ts
} catch (err) {
  return { outcome: 'unavailable', detail: (err as Error).message, ...stamp };
}
```

Nothing anywhere in `lib/ai` or the worker references `429`, `RateLimitError`, `retry-after`, or `Anthropic.APIError` (`grep -rn "429|RateLimitError|retry-after" lib app scripts tests` returns one unrelated hit in `tests/routes/reset.test.ts`). The claude-api skill's Client-config quick reference confirms the SDK's default `maxRetries: 2` covers 408/409/429/5xx and honours `retry-after`/`retry-after-ms` (verified in `node_modules/@anthropic-ai/sdk/client.js:707-760`), and that this is exactly what `maxRetries: 0` discards. The consequence:

- `extract` has `max_attempts = 3, lease_seconds = 300` (migration line 75).
- `unavailable` → `'extract_unavailable_retry'` → the worker still calls `archivePipelineWork(work.msg_id)` (route.ts:605), so the message is **acked**; re-queue waits for the 300s lease to expire.
- Three transient 429s = 900 seconds of wall clock and then `extract_failed` / `extract_budget_exhausted` — a permanent family-visible failure caused by rate limiting.

The mirror-image defect is worse: a **permanent** 400 (oversized body, malformed schema, an unsupported param, a ZDR-ineligible model) is also mapped to `unavailable` and therefore *retried three times over fifteen minutes* before terminalizing with a reason code that says "budget exhausted" rather than "we sent an invalid request."
**Failure scenario:** Provider returns `429` with `retry-after: 8`. Correct behaviour is to wait 8s inside the 240s call budget and succeed. Actual behaviour: three arrivals-worth of attempts consumed across 15 minutes, then `extract_failed`. The ADR's justification is sound *for timeout retries* (the skill notes wall-clock can reach `timeout × (max_retries+1)`), but it never distinguishes 429, and neither does the code. There is also no `HC-FIXTURE-429` marker, so the case cannot be exercised at the gate.
**Confidence:** high on the code paths and the budget arithmetic; the "right trade" judgement is mine, but the *absence of any 429 distinction, retry-after handling, or fixture* is factual.

---

### F-6 — §6.6's "measurement" is computed and dropped: nothing reads `usage`
**Severity:** MAJOR
**Where:** `lib/ai/client.ts:42-49,169-174`, `app/api/worker/[stage]/route.ts` (no reference)
**Claim under test:** ADR-0022 D4: "§6.6's 'checked, not assumed' is implemented as MEASUREMENT. The adapter carries `usage.cache_creation_input_tokens` and `cache_read_input_tokens` back on every call, **so whether the record prefix actually cached is observed.**"
**What I found:** Carrying is implemented; observing is not. `grep -rn "cacheReadInputTokens|cacheCreationInputTokens"` over the whole repo returns `lib/ai/client.ts` and **tests only**. `grep -n "usage" app/api/worker/[stage]/route.ts` returns nothing. `processExtract` and `processInterpret` destructure `answer.data`, `answer.dropped`, `answer.modelId`, `answer.promptVersion` — never `answer.usage`. There is no log line, no DB column, no metric, no counter. `answer.dropped` at least reaches the worker's HTTP response string (route.ts:400) and even that is only for extract — interpret's `dropped` is discarded too.
**Failure scenario:** The interpret prefix (system prompt ≈ 400 tokens + a small `<subject_record>`) falls below the 512-token minimum for a new subject with a thin record, so `cache_read_input_tokens` is `0` on every call forever. Cost lands at COST-1's high end instead of "largely cache-read at ~0.1×" (`ai-provider.md` line 168). Nobody finds out, because the number that would say so is assigned to a struct field and garbage-collected. The test at `adapter.test.ts:243-254` only asserts the *properties exist* (`toHaveProperty`), never that any consumer reads them.
**Confidence:** high — exhaustive grep plus reading both worker handlers.

---

### F-7 — The allowlist admits `claude-sonnet-5`, which cannot support the §6.7 operator channel and has a different cache minimum; the ops doc blesses it
**Severity:** MAJOR
**Where:** `lib/ai/config.ts:30`, `lib/ai/client.ts:180-185`, `lib/ai/prompt.ts:11-13`, `lib/ai/interpret.ts:20-24`, `docs/ops/ai-provider.md:41-42,92`
**Claim under test:** Review point 3 (allowlist is an allowlist; is the pinned id current?) and §6.7's operator channel.
**What I found:** The pinned model is correct — `EXTRACT_MODEL = INTERPRET_MODEL = 'claude-opus-5'` matches the claude-api skill's current-model table exactly, with no date suffix, `thinking: {type:'adaptive'}`, `output_config.effort`, and no `budget_tokens`. That half is right. The *second* allowlist entry is not:

- The skill states plainly, twice: "**Mid-conversation operator instructions** (Claude Opus 5, Claude Opus 4.8, Claude Fable 5, Claude Mythos 5; **not Claude Sonnet 5**)" and "Unsupported models return a 400 (`role 'system' is not supported on this model`)" (`typescript/claude-api/README.md`, § Mid-conversation system messages). `operatorMessages()` emits `{role:'system'}` unconditionally, and `processInterpret` **does** use it in production (route.ts:530-534, the no-facts re-queue path).
- The skill's cache-minimum table (`shared/prompt-caching.md:130-137`) gives Opus 5 = **512** tokens and Sonnet 5 = **1024**. `interpret.ts:22` asserts "Opus 5's minimum cacheable prefix is 512 tokens" — correct for Opus 5 — and `ai-provider.md` SMOKE-6 hard-codes "§6.6's 512-token minimum CHECKED against the real tokenizer." Neither is true on the other allowlisted model.
- `ai-provider.md:41-42` explicitly instructs the operator: "Confirm the shipped model is `claude-opus-5` (**or `claude-sonnet-5`**)."

No test ever calls the adapter with `claude-sonnet-5`; every wire assertion runs against Opus 5.
**Failure scenario:** An operator follows `ai-provider.md:41` and sets the shipped model to `claude-sonnet-5` (cost, capacity, or an Opus 5 incident). `assertAllowedModel` passes. Every extract call with no operator notes succeeds. Every *interpret* re-queue of a resolved stage-2 duplicate — the path that always pushes an operator note — returns HTTP 400, which the adapter maps to `unavailable` (F-5), which burns three attempts over 900s and terminalizes the arrival. The failure is model-conditional and path-conditional, so it will not appear until a re-queue happens in production.
**Confidence:** high on the skill's statements and the code paths; medium only on whether an operator would actually make the swap — but the ops doc invites it in writing.

---

### F-8 — Inline artifacts were chosen over the Files API, but the render ceiling is twice the API's request limit
**Severity:** MAJOR
**Where:** `lib/pipeline/render.ts:75`, `lib/ai/client.ts:187-199`, `docs/ops/ai-provider.md:65-73`
**Claim under test:** ADR-0022 D4 / §6.2: "the Files API — files persist until deleted and add a second retention surface. **Artifacts go inline**, so retention has one question." `ai-provider.md` §3 makes it a checklist row.
**What I found:** `RENDER_CEILINGS.maxRenderedBytes = 64 * 1024 * 1024`. `imageBlocks()` base64-encodes every page inline, which inflates by 4/3. The claude-api skill's Document & File Input quick reference states the API limit as "**32 MB request**". So any render between roughly **24 MB and 64 MB** is accepted by our own ceiling and produces a request body the provider rejects outright. The upstream upload cap is `FILE_BYTES_MAX = 52428800` (50 MB, `app/api/upload/complete/route.ts:16`), and `maxPages` is 200 at a 2576px long edge for scanned/photo sources — a ~60-page scan at ~500 KB/page already lands in the dead zone. Nothing anywhere computes the base64 size of the assembled request, and the fixture server accepts a body of any size, so the gate cannot see it.
**Failure scenario:** A 70-page scanned discharge packet renders to 30 MB of JPEG. `renderedBytes` never exceeds 64 MB so no `output_size` refusal fires. `imageBlocks` produces ~40 MB of base64. The provider returns a 400 (request too large). Per F-5 that becomes `unavailable`, burning all three attempts across 900s, and the family sees `extract_failed` with `extract_budget_exhausted` — a reason code that says "we ran out of tries" for a request that was impossible on the first one. The decision to avoid the Files API is defensible; the size budget that decision requires was never set.
**Confidence:** high on the arithmetic and the constants; medium on the exact per-page byte figures, which vary by source — but the 64 MB > 24 MB gap is unconditional.

---

### F-9 — `model_context_window_exceeded` is an unhandled `stop_reason` and lands as `provider_error`
**Severity:** MAJOR
**Where:** `lib/ai/client.ts:139-157`
**Claim under test:** `client.ts:102-108`: "One Messages request, with `stop_reason` checked FIRST… code that reads `content[0]` unconditionally breaks on exactly the case that most needs handling well."
**What I found:** The SDK's union (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:2297`) is:

```ts
export type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | 'model_context_window_exceeded';
```

`callProvider` branches on `refusal` and `max_tokens` and falls through for everything else. `model_context_window_exceeded` therefore reaches the text-join, produces empty or partial text, and returns `invalid_output: 'no text content'` (or, worse, a partial-JSON parse failure). `processExtract` maps that to `reason = 'provider_error'` → `extract_failed`. There is also no `messages.count_tokens` preflight anywhere in `lib/ai` or `scripts/eval`, and no reconciliation between `RENDER_CEILINGS.maxPages = 200` and the 1M context window: at the high tier the skill puts a 2576px image at up to ~4784 tokens, so 200 pages is ~957k input tokens before the system prompt, the text layer, and `max_tokens: 24_000`.
**Failure scenario:** A 200-page scanned PDF (permitted by PRD §13.3 and `maxPages`) is submitted. The request is at or over the context window. The response comes back with `stop_reason: 'model_context_window_exceeded'`, empty content. The adapter reports `invalid_output` / "no text content"; the worker records `provider_error`. An operator reading the reason code has no way to learn the request was too large, and there is no `truncated`-style honest terminal path for it — which is the same category of failure §6.1's truncation trap exists to prevent.
**Confidence:** high that the stop reason is unhandled and mislabeled; medium on the exact page count that triggers it (the token-per-image figure is the skill's stated maximum).

---
### F-10 — `ANTHROPIC_LOG=debug` writes the full request body — document text and base64 pages — to console; the key is redacted, the document is not
**Severity:** MAJOR
**Where:** `lib/ai/client.ts:83-87`
**Claim under test:** Review point 9 (secret handling), and §6.2's "artifacts go inline, so retention has one question."
**What I found:** Good news first: the SDK **does** redact credentials — `node_modules/@anthropic-ai/sdk/internal/utils/log.js:91-101` maps `authorization`, `api-key`, `x-api-key`, `cookie`, `set-cookie` to `'***'`. I could not construct any path by which the API key reaches a log, an error message, or a test artifact. CI is genuinely keyless (`.github/workflows/ci.yml` runs `npm run test:app` → `vitest run` with no Anthropic secret; `playwright.config.ts:73` uses the literal `local-gate-fixture-not-a-credential`; `scripts/eval/run.ts:158` is the only real-key path and hard-exits without one).

The body is a different story. `formatRequestDetails` deletes only `details.options['headers']` — `details.options` is the `FinalRequestOptions` and **retains `body`** (call site: `client.js:690-696`, `options` passed through from `client.js:518`). `logLevel` is resolved from `process.env.ANTHROPIC_LOG` (`client.js:108-112`) and `logger` defaults to `console`. `client()` at `lib/ai/client.ts:83-87` passes neither `logger` nor `logLevel`, so a single environment variable on the hosted function turns every extract request — the delimited document text plus every page as base64 — into a console line, i.e. into the platform's log store.
**Failure scenario:** An operator debugging DUR-1 or a provider incident sets `ANTHROPIC_LOG=debug` on the worker function. Every subsequent arrival's full contents are written to platform logs with whatever retention the platform has, entirely outside G3's four terms and outside the "one retention question" §6.2 claims. One line — `logLevel: 'warn'` or an explicit no-op logger in the client constructor — closes it.
**Confidence:** high on the SDK mechanics (read the redaction function and both call sites); it is latent rather than live, since it requires the env var to be set.

---

### F-11 — Nothing guards `ANTHROPIC_BASE_URL` in production; the property that makes CI keyless makes production redirectable
**Severity:** MAJOR
**Where:** `lib/ai/client.ts:78-88`
**Claim under test:** `client.ts:14-19` / ADR D13: "**The adapter never branches on environment.** … That is what makes 'CI never calls the provider' a deployment fact rather than a code path someone could take by mistake."
**What I found:** `const baseURL = process.env.ANTHROPIC_BASE_URL ?? ''` is read unconditionally, in every environment, with no assertion that it is unset (or Anthropic's host) when a real key is present. The same lever that points the gate at `127.0.0.1:8787` points production anywhere. There is no test asserting that a production-shaped config refuses a non-Anthropic base URL, and G3's entire premise is that a family's document reaches exactly one cleared endpoint. Related: the SDK also honours `ANTHROPIC_CUSTOM_HEADERS` from the environment (`client.js:117-127`), so "never branches on environment" is not quite true of the composed system either.
**Failure scenario:** `ANTHROPIC_BASE_URL` is set on the production function — copied from a local `.env`, inherited from a preview environment, or set by anyone with deploy-env access. Every extract request, containing a family's discharge summary and a valid Anthropic key in the `x-api-key` header, is sent to that host. Nothing logs it, nothing tests it, and the pipeline reports normal outcomes if the host answers in the Messages shape. A guard of the form "if a real key is configured, `ANTHROPIC_BASE_URL` must be unset" costs three lines and is the difference between "deployment fact" and "convention".
**Confidence:** high on the code; the exploitability depends on who holds deploy-env access, which I did not assess.

---

### F-12 — The four "absence" assertions run only against the extract request, and one of them is vacuous because the fixture records no headers
**Severity:** MINOR
**Where:** `tests/ai/adapter.test.ts:93-117`, `scripts/ai-fixture-server.mjs:266`
**Claim under test:** ADR-0022 D4: "Never on the wire, and absent rather than configured off" — `fallbacks`, Files API, citations, `budget_tokens`.
**What I found:** Three of the four are real body assertions and would catch a regression on the extract path (`not.toHaveProperty('fallbacks')`, `not.toContain('file_id')`, `not.toContain('budget_tokens')`). Two gaps:

1. `expect(raw).not.toContain('server-side-fallback')` (line 99) is vacuous. That string is a **beta header** value (`anthropic-beta: server-side-fallback-2026-07-01`); in the TS SDK `betas: [...]` on `client.beta.messages.create` becomes a header, never a body key. `raw` is `Buffer.concat(chunks)` — the body only — and `requests.push({ url: req.url, raw, body })` at `ai-fixture-server.mjs:266` **records no headers at all**. The assertion cannot fail whether or not the beta is enabled.
2. Every one of the four assertions is made after `await extractFromArrival(...)`. Nothing asserts any absence for `interpretArrival`, and nothing asserts any of them for `scripts/eval/run.ts`'s separately-built request (F-4) — the one the bands are actually signed from.

**Failure scenario:** Someone follows the claude-api skill's default-on advice and switches `interpret.ts` to `client.beta.messages.create` with `betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'`. The extract-path assertions are untouched, the interpret path has no assertions, and the header-string check is blind by construction. The suite stays green; §6.8's recorded decline is silently re-routed to a model outside G3's cleared terms.
**Confidence:** high — the fixture's `requests.push` line is unambiguous.

---

### F-13 — The fixture server never rejects anything, so "asserted on the wire" only proves absence-by-substring, never acceptance
**Severity:** MINOR
**Where:** `scripts/ai-fixture-server.mjs:246-314`
**Claim under test:** Review point 8; ADR D13: "a real protocol, spoken locally."
**What I found:** The server validates nothing. It does not check `x-api-key` (any request, keyless, succeeds), does not check `anthropic-version`, does not validate `output_config.format.schema` against anything, does not enforce `max_tokens` limits, does not reject `budget_tokens` on an Opus 5 model, does not reject `citations` alongside `output_config.format`, does not reject `{role:'system'}` for a Sonnet-5 model id, does not enforce a body-size limit, and does not enforce the 4-breakpoint `cache_control` cap. It parses JSON, records it, and answers. Consequently:

- **Structured-output enforcement is entirely unproven at the gate.** `extractionAnswer`/`interpretationAnswer` construct their own object and ignore `EXTRACTION_SCHEMA` completely. Whether `type: ['string','null']` union types and `enum: [...DOMAINS, null]` in `INTERPRETATION_SCHEMA` (`schema.ts:133-134`) are even accepted by the real structured-outputs validator is untested — that is exactly what `ai-provider.md` SMOKE-3 defers to a live smoke test, so the gap is acknowledged, but the ADR's "the wire is the contract" framing overstates what the gate can show.
- The only class of defect these tests can catch is "a string we forbade appeared in the body." They cannot catch "what we send is malformed," which is the larger risk surface.

**Failure scenario:** Add `citations: {enabled: true}` to a hypothetical future `document` block. `not.toContain('"citations"')` catches it. Now instead change `CITATION.bbox` to `prefixItems` (2020-12 syntax) — the fixture happily answers, all 27 tests pass, and the real API 400s on the first production call.
**Confidence:** high — I read the whole handler; there is no validation branch other than JSON-parseability.

---

### F-14 — The fixture's "provider-outage shape" is HTTP 503; the provider's `overloaded_error` is 529
**Severity:** MINOR
**Where:** `scripts/ai-fixture-server.mjs:276-285`
**Claim under test:** The header comment: "`HC-FIXTURE-503` → an `overloaded_error`, the **provider-outage shape**."
**What I found:** The fixture returns `503` with `{type:'error', error:{type:'overloaded_error'}}`. Anthropic's `overloaded_error` is HTTP **529**; 503 is not a status the Messages API emits. The two are indistinguishable to *this* adapter only because `maxRetries: 0` collapses all statuses into one catch arm — which means the fixture's infidelity is masked by the very defect in F-5.
**Failure scenario:** If `maxRetries` were ever raised, or if status-aware handling were added per F-5, tests written against 503 would validate behaviour for a status the provider never sends while leaving 529 (and 429) unexercised. Today it is cosmetic; it becomes load-bearing the moment error handling is differentiated.
**Confidence:** high on the status codes (claude-api skill `shared/error-codes.md` / standard Anthropic semantics); the impact is contingent, hence MINOR.

---

### F-15 — `config.ts`'s stated reason for `MAX_TOKENS = 24_000` is factually wrong about the SDK
**Severity:** MINOR
**Where:** `lib/ai/config.ts:73-79`
**Claim under test:** "24k is comfortably inside the SDK's non-streaming timeout scaling, and our own client timeout (below) is tighter than either."
**What I found:** The opposite is true. `node_modules/@anthropic-ai/sdk/client.js:783-791`:

```js
const expectedTime = (maxTime * maxTokens) / 128000;   // maxTime = 60 min
if (expectedTime > defaultTime /* 10 min */ …) throw new Errors.AnthropicError('Streaming is required…')
```

The threshold is `600000 × 128000 / 3600000 = 21,333` tokens. At `max_tokens: 24_000` the SDK **would throw** `AnthropicError('Streaming is required for operations that may take longer than 10 minutes')`. The code survives only because `messages.js:29-34` skips the check entirely when an explicit `timeout` is supplied — and `client.ts:133` always supplies one. So the guard is bypassed rather than satisfied. The skill's own guidance ("For non-streaming requests, default to ~16000 (keeps responses under SDK HTTP timeouts)") points the same way.
**Failure scenario:** No live failure today. But the SDK's threshold exists because a 24k-token non-streaming generation can plausibly run past 10 minutes, while our hard cap is 240s — so a heavy `effort: 'high'` extraction that the SDK would consider legitimately long is cut at 240s, mapped to `unavailable` (F-5), and burns an attempt. Nothing measures how often that happens (PRF-07 runs against the fixture with no provider in the path — `ai-provider.md:136`). Downgraded to MINOR because I cannot construct the input that proves the 240s overrun without a live key.
**Confidence:** high on the SDK arithmetic (read the function); low on the operational frequency.

---

### F-16 — One cache test asserts against the previous test's request, not its own
**Severity:** OBSERVATION
**Where:** `tests/ai/adapter.test.ts:232-241`
**Claim under test:** "the volatile arrival content comes AFTER the breakpoint."
**What I found:** The `it` body makes no adapter call. It reads `lastBody()` — `server.requests.at(-1)` — which is whatever the *previous* test (line 218) left behind. `server.reset()` exists on the fixture handle but is never called anywhere in the suite. The assertion is real only under strictly sequential, non-skipped, non-shuffled execution.
**Failure scenario:** Cannot construct a wrong *outcome* under the current runner configuration — vitest runs `it`s in file order by default. Add `--shuffle`, `it.concurrent`, or a `.skip` on the preceding test and this one silently asserts against an extract request that has no `cache_control` at all (`breakAt` would be `-1`, and `expect(-1).toBeGreaterThanOrEqual(0)` would then red — so it fails loudly rather than passing wrongly). Downgraded to OBSERVATION accordingly.
**Confidence:** high on the mechanism; the failure mode is noisy, not silent.

---

### F-17 — The image-only path is untested end-to-end at the gate, which is honest but leaves specific code unexercised
**Severity:** OBSERVATION
**Where:** `scripts/ai-fixture-server.mjs:17-28,119-146`, `lib/ai/extract.ts:57-103`
**Claim under test:** ADR D13 / the fixture header: "For an IMAGE-ONLY source it returns no facts, on purpose… it proves our MACHINERY, never the model's VISION."
**What I found:** The disclosure is accurate and the reasoning is sound — `matchItem` requires `bestScore >= 2` matches against *text* in the request, so a scanned PDF or phone photo with no text layer always routes to the empty-facts branch. What the header does not say is which of *our* code that leaves untested. Concretely, `validateFacts`' page-bound check — `citation.page <= Math.max(1, pageCount)`, the one `extract.ts:53-55` calls "exactly the hallucination the crop-on-screen rule exists to catch" — can only fire on facts, and facts only arrive on text-bearing sources, where `pageCount` is the born-digital render. The multi-page, high-tier, image-only geometry path (the case where a page-number hallucination is most likely) never produces a fact at the gate. Same for the `dropped` counter on the vision path.
**Failure scenario:** I cannot construct a wrong outcome — the gate correctly declines to fake vision, and `ai-provider.md` §4 SMOKE-3 defers this to the live smoke test. Recorded as an OBSERVATION so the reviewer knows the specific validators that ride on the untested path, rather than treating "machinery proven" as covering all of it.
**Confidence:** high.

---

### F-18 (revised) — The API key is used as a `Map` key in an unbounded module-level cache
**Severity:** OBSERVATION
**Where:** `lib/ai/client.ts:80`
**Claim under test:** Review point 9 (can a key leak into a log, an error, a trace, or an artifact).
**What I found:** `const key = \`${baseURL}\0${apiKey}\`` and `clients.set(key, existing)`. The credential is held in plaintext as a `Map` key for the process lifetime, with no eviction. Nothing in this repo enumerates the map, and the SDK redacts headers in its own logs (F-10), so I could not construct a leak path.

**Correction to the reported literal:** my earlier draft of this finding quoted the cache key as `` `${baseURL} ${apiKey}` ``. The separator is in fact a NUL byte (see F-19); the Read tool rendered it as a space. The substance is unchanged.
**Failure scenario:** None constructible from this codebase — it would require a heap snapshot, a debugger dump, or a future diagnostic that serialises the map. Downgraded to OBSERVATION. Hashing the key (or keying on `baseURL` alone, since the process only ever has one credential) removes the surface for free.
**Confidence:** high that the pattern is present; low that it is exploitable here.

---

### F-19 — `lib/ai/client.ts` contains a NUL byte, so git treats the adapter as a binary file: undiffable in review, invisible to ripgrep, and outside CI's secret scan
**Severity:** BLOCKER
**Where:** `lib/ai/client.ts:80`, introduced in `88ed484 feat(5B B3): GREEN - lib/ai, the one fenced adapter family`
**Claim under test:** ADR-0022 D4, the framing claim for the entire slice: "Most of `tests/ai/adapter.test.ts` asserts the request body the provider actually receives, rather than our own source — **a grep over `lib/ai` would pass while the wire carried something else.**"
**What I found:** Line 80 is not `` `${baseURL} ${apiKey}` `` as it renders in an editor. `od -c` on the committed blob:

```
{   b   a   s   e   U   R   L   }  \0   $   {   a   p   i   K   e   y   }
```

The separator is a literal **NUL byte (0x00)** embedded in the source. `lib/ai/client.ts` is the only NUL-bearing file among all tracked `*.ts`, `*.tsx`, `*.mjs`, `*.sql` files in the repo (checked exhaustively via `git ls-files` + `grep -qP '\x00'`). Every text-oriented tool therefore classifies the adapter as binary:

- `git show 88ed484 --stat -- lib/ai/client.ts` → `lib/ai/client.ts | Bin 0 -> 7268 bytes` / `1 file changed, 0 insertions(+), 0 deletions(-)`. **The commit that introduced the entire provider adapter has no diff.** Every future change to it renders as "Binary files differ" in `git diff`, `gh pr diff`, and the GitHub PR review UI.
- `rg "maxRetries" lib/ai/` → **no output, exit 1.** Ripgrep silently skips it. This is what the Grep tool, most editor searches, and any reviewer's `rg` use by default.
- `grep -rn "maxRetries" lib/ai/` → `Binary file lib/ai/client.ts matches` — a match with no line and no content.
- `git grep -n "maxRetries" -- lib/ai/` → same.
- CI's secret scan is `gitleaks detect -s /repo` (`.github/workflows/ci.yml:19-23`) — the git-history mode, which parses `git log` patches. A binary blob yields no patch content, so **the adapter's contents are excluded from the repo's only secret scanner.**

The ADR is right that source-grepping is a weaker guarantee than wire assertions. It is right for a reason it did not intend: a grep over `lib/ai` does not merely pass — it cannot see the file that builds every request.
**Failure scenario:** Someone opens a PR changing `maxRetries: 0` to `maxRetries: 2`, or adds `fallbacks: 'default'` and the beta header, or swaps the model. GitHub renders the file as "Binary files a/lib/ai/client.ts and b/lib/ai/client.ts differ." A reviewer sees no lines to review. The wire assertions in F-12 cover only the extract path and one of them is vacuous, so the test suite does not compensate. Separately: any credential accidentally committed into this specific file would not be caught by CI's gitleaks step. Functionally the NUL is harmless (lint, typecheck and all 27 tests are green, and a NUL is arguably a *better* cache-key separator than a space since it cannot occur in a URL or key) — the defect is entirely one of review and scanning integrity, which is exactly what this slice's central claim rests on. The fix is one character.
**Confidence:** high — every behaviour above was executed and its output is quoted verbatim; the NUL is verified present in the committed blob at HEAD, not just the working tree.

---

### F-20 — `scripts/check-service-role-containment.mjs` is unaffected, but no scanner reads the adapter as text
**Severity:** OBSERVATION
**Where:** `.github/workflows/ci.yml:19-23,33`
**Claim under test:** Review point 9 (secret handling), and the project rule that CI is keyless with the eval harness as the sole real-key path.
**What I found:** The keyless posture itself is sound and verified (F-10): CI runs `vitest run` with no Anthropic secret, `playwright.config.ts:73` uses a literal non-credential, `scripts/eval/run.ts:158` hard-exits without a key, and the SDK redacts `x-api-key` from its own logs. The repo's second scanner, `node scripts/check-service-role-containment.mjs`, reads files through Node's `fs`, which returns NUL-bearing content as a normal string — so that check still sees `client.ts`. The gap is narrower than it first looks but real: **gitleaks, the one scanner whose job is finding committed credentials, is the one that cannot read this file** (F-19). No constructible leak exists today; the observation is that the safety net has a file-shaped hole in it, in the one file that holds a credential in memory.
**Confidence:** high on the tooling behaviour; OBSERVATION rather than a finding because no secret is present to be missed.

---

## R3 — the render pipeline and the citation coordinate space

*Lens: `lib/pipeline/render.ts`, `page-keys.ts`, `lib/storage/artifacts.ts`,
the B2 spike, `next.config.ts`. Reported 13 findings including two
BLOCKERs, and confirmed the orientation claim holds.*

### F-1 — `PT_PER_PX = 0.75` is not a constant of mupdf; page geometry is `72 / declared-dpi`, so any photo or scan carrying a resolution tag is silently rendered far below its tier
**Severity:** BLOCKER
**Where:** `lib/pipeline/render.ts:113` and `:141`; consumed at `:254` and `:261-262`
**Claim under test:** ADR D2 finding 3 — "Page geometry is POINTS at 96 dpi on the image path, so a page point is 0.75 stored pixels. The conversion happens once, at the boundary." D3 — "a photo is never rendered below [the high tier]." `render.ts:19-22` — "downsampling a phone photo of a pill bottle is exactly the wrong economy."
**What I found:** mupdf's image-document handler derives page bounds as `pixels × 72 / declared_resolution`, falling back to 96 dpi **only when the image declares no resolution at all**. 0.75 is that fallback, not a property of the image path. Every JPEG in `fixtures/g9` — development *and* blind — carries no JFIF APP0 and no resolution tag (I dumped the segment table for all 12: `segs=FFdb,FFc0,FFc4,FFc4,FFda`, and the two angled ones add only an orientation-carrying `FFe1`). That is the sole reason `0.75` looks like a law.

Measured on the byte-identical 1928×2576 `dev-pill-01.jpg` with only a density header added:

```
no APP0 (fixture)  bounds=1446.0x1932.0pt  declaredPx=1928x2576  -> RENDERED 1928x2576
JFIF  72 dpi       bounds=1928.0x2576.0pt  declaredPx=2571x3435  -> RENDERED 1928x2576
JFIF 150 dpi       bounds= 925.4x1236.5pt  declaredPx=1234x1649  -> RENDERED 1235x1649
JFIF 300 dpi       bounds= 462.7x 618.2pt  declaredPx= 617x824   -> RENDERED  617x824
JFIF 600 dpi       bounds= 231.4x 309.1pt  declaredPx= 308x412   -> RENDERED  309x412
```

And identically through Exif (`XResolution` + `ResolutionUnit=inch`), which is what real cameras and scanners actually write:

```
Exif XResolution=300dpi  declaredPx=617x824  -> RENDERED 617x824 (source is 1928x2576)
```

`declaredPixels()` is genuinely called once, and `scale` is computed from points directly at `:264`, so there is no double conversion and no off-by-0.75 — the arithmetic is self-consistent. The constant it converts with is simply wrong for any image that states its resolution.
**Failure scenario:** A family photographs or scans a discharge summary at 300 dpi (every flatbed and every "Scan to PDF/JPEG" phone app defaults to 200–300 dpi and writes the tag). `normalizeArrival` computes `declared = 617×824`, `nativeLong = 824`, `targetLong = min(2576, 824) = 824`, and renders the page at **617×824 — a 3.1× downsample of a 2576-px source**, i.e. below even `STANDARD_LONG_EDGE`. `outcome` is `rendered`, no ceiling fires, nothing is logged. The image dispatched to the provider is one-tenth the pixel area §6.3 promised; a 9-pt dose line on a pill-bottle label is unreadable. The bbox arithmetic still self-consistently names the right fraction of the page, so the failure surfaces only as low confidence or a missing/misread `medication_dose` — indistinguishable from an ordinary model miss. At 600 dpi it is 309×412.
**Confidence:** high — reproduced directly against `node_modules/mupdf` 1.28.0 for both JFIF and Exif density paths, using an unmodified corpus fixture with only the header prepended. Confirmable by adding one density-tagged JPEG to `fixtures/g9` and asserting `longEdge(page) === HIGH_LONG_EDGE`; it will be 824.

---

### F-2 — the `page_dimensions` ceiling is computed on a number the uploader controls independently of pixel count; 18 header bytes turn a refused 900 Mpx bomb into a full decode
**Severity:** BLOCKER
**Where:** `lib/pipeline/render.ts:254` (`(declared.w * declared.h) / 1e6 > ceilings.maxPageMegapixels`), fed by `:141`
**Claim under test:** `render.ts:65-71` — "The page-dimension ceiling, in megapixels of DECLARED geometry… a decompression bomb — 900 Mpx declared behind a few hundred bytes — does not [clear it]." ADR D2 — "Legs 3, 4 and 6 all answer from the HEADER, before any decode. That is what makes 'abort BEFORE any provider dispatch' a property of the code path."
**What I found:** the number read from the header is `pixels × 72 / declared_dpi / 0.75`, so the effective ceiling scales as `80 Mpx × (dpi/96)²`. The guard is header-only as claimed, but the header field it depends on is attacker-chosen and unrelated to decode cost. Measured against the project's own `dev-pixelbomb-01.jpg` (376 bytes, 30000×30000):

```
dpi=none  declaredPx=30000x30000  Mpx=900.0  page_dimensions refusal? true
dpi=300   declaredPx= 9600x9600   Mpx= 92.2  page_dimensions refusal? true
dpi=600   declaredPx= 4800x4800   Mpx= 23.0  page_dimensions refusal? false
   -> DECODED AND RENDERED 2576x2576 in 3480 ms, 78367 out bytes, rss=132MB
```

The identical bomb the corpus was built to refuse is accepted and rendered once its JFIF APP0 says 600 dpi. `maxPageMegapixels` is the only guard between the bomb and the decoder — `output_size` (`:283`) is checked on the *encoded* result, after the decode, and `wall_clock` (`:242`) is not checked again until the next page.
**Failure scenario:** an uploader (the upload path is member-reachable via the TUS proxy) posts a few-hundred-byte JPEG declaring 60000×60000 px at 600 dpi → `declared = 9600×9600 = 92 Mpx`… set 1200 dpi and it is 23 Mpx → passes → mupdf decodes. In my run the flat-field bomb cost 3.5 s and 132 MB because mupdf DCT-subsamples; a high-entropy bomb defeats subsampling and costs proportionally more, with no wall-clock check able to interrupt it (F-5). Repeat across a batch of 10 messages in one invocation and the worker OOMs or hits `maxDuration`, burning ten attempts.
**Confidence:** high for the guard bypass (measured end to end). Medium on the worst-case cost, because mupdf's subsampling softens flat bombs — confirming the upper bound needs a crafted high-entropy fixture, but the bypass itself does not depend on that.

---

### F-3 — attempt staging leaks on every exit that is not one of the four coded branches: throw, `maxDuration` kill, and a partially-completed promotion. Nothing sweeps `render/attempt/**`
**Severity:** MAJOR
**Where:** `app/api/worker/[stage]/route.ts:310-317` (unguarded write loop), `:381` (promote), `:606-611` (outer catch); `lib/storage/artifacts.ts:306-326`
**Claim under test:** ADR D3 — "attempt staging is lease-scoped…, **GC'd on every non-advance including a lost CAS**"; `artifacts.ts:276-277` — "a lease that closed as anything but `advanced` leaves nothing behind."
**What I found:** `gcRenderStaging` is called from exactly four places (`route.ts:304, 328, 375`, plus the pre-staging refusal path). There is no `try/finally` around the staged region, and the outer handler is:

```ts
} catch (err) {
  console.error(`worker/${msg.stage}: ${(err as Error).message}`);
  processed.push({ arrival_id: msg.arrival_id, stage: msg.stage, outcome: 'error' });
}
```

— no GC. The prefix is keyed by `leaseId`, which exists only in the dead invocation's stack; the retry claims a *new* lease and writes to a *different* prefix, so the orphan is unreachable by construction. A whole-tree grep for `render/attempt` and `gcRenderStaging` finds no sweeper, no scheduled job, and no migration touching those keys.

Leaking exits: (a) `writeRenderStaging` throws mid-loop; (b) `extractFromArrival`/`loadBands`/`finalizeExtraction` throws; (c) the platform kills the invocation at `maxDuration = 360` during render or the provider call; (d) `promoteRenderedPages` throws.

(d) is the worst. `promoteRenderedPages` copies keys one at a time and only removes staging *after the whole loop* (`artifacts.ts:324`). It runs **after** `finalizeExtraction` returned `advanced`, so if it throws at page 5 of 12: pages 1–4 are promoted, 5–12 are not, staging is not removed, the message is never archived, it redelivers, `claimStage` returns non-`claimed` (the arrival has already left `extracting`), and `processExtract` returns at `:285` without ever retrying the promotion. The arrival is permanently `extracted` with a **partial page set** and permanently orphaned staging.
**Failure scenario:** a 40-page born-digital PDF; a transient storage 5xx on the 5th `copy` inside `promoteRenderedPages`. Result: `render/circle/<c>/arrival/<a>/` holds p001–p004 only; `render/attempt/<c>/<a>/<lease>/` holds all 40 forever; the extraction rows and their citations reference pages 5–40 that have no artifact. Slice 6's review screen has nothing to crop for a citation on page 12 — an "evidence before bytes" surface with no bytes.
**Confidence:** high — the control flow is direct and there is no `finally` and no sweeper anywhere in the tree.

---

### F-4 — `maxRenderedBytes` is documented as "the memory bound with a name" but bounds the wrong quantity by two orders of magnitude; nothing is ever `destroy()`ed
**Severity:** MAJOR
**Where:** `lib/pipeline/render.ts:74-75`, `:270-285`
**Claim under test:** `render.ts:74` — "The accumulated rendered-output ceiling: the memory bound with a name."
**What I found:** the counter accumulates `encoded.byteLength` only. The dominant allocations — the `Document`, each `Page`, and each `Pixmap` (up to 2576×2576×3 ≈ 20 MB decoded) — live in the Emscripten heap and are freed only when the JS GC eventually runs a `FinalizationRegistry` callback (`node_modules/mupdf/dist/mupdf.js:494-513`); mupdf's own source comments that this "may help the GC and FinalizationRegistry out when processing many documents without a pause". `render.ts` calls `.destroy()` on nothing. Measured, driving the exact `open → loadPage → toPixmap → asJPEG` sequence 60 times (well inside the 200-page bound):

```
after  10 page renders: encoded held=0.6MB   process rss=287MB
after  30 page renders: encoded held=1.8MB   process rss=217MB
after  60 page renders: encoded held=3.5MB   process rss=463MB
```

3.5 MB counted against a 64 MB ceiling while the process peaked at 463 MB. Two secondary gaps in the same accounting: the check at `:283` runs *after* the page is encoded and added, so the true peak is `ceiling + one page`; and the `text` layer accumulated at `:215-224` is bounded by nothing at all, then goes on the wire whole (`lib/ai/prompt.ts:76-78` does not truncate).
**Failure scenario:** a 180-page scanned PDF at the high tier. `maxRenderedBytes` may never trip (JPEG-90 of a scan is ~300 KB/page → 54 MB), while the transient WASM heap churns 180 × ~20 MB. On a serverless function with a 1–2 GB limit the invocation OOMs mid-render: the attempt is already burned durably at the claim, staging leaks (F-3), and the family sees an attempt consumed with no state change.
**Confidence:** medium-high. The 463 MB peak is measured; the exact OOM threshold depends on the deployed function's memory setting, which no code half pins. Confirmable by running `normalizeArrival` against a 200-page fixture under `--max-old-space-size` at the production memory limit.

---

### F-5 — `wall_clock` is sampled between pages, never a deadline; one page runs unbounded and the final page is never checked at all
**Severity:** MAJOR
**Where:** `lib/pipeline/render.ts:152`, `:242`, `:296`
**Claim under test:** ADR D3 — "The four ceilings are named values that refuse with named reasons: …`wall_clock`…"; `render.ts:72` — "The whole normalize step's wall clock, budgeted inside the stage's."
**What I found:** `outOfTime()` is evaluated only at the top of each loop iteration (`:205`, `:216`, `:242`). `page.toPixmap()` is a synchronous WASM call, and the JS binding exposes no cookie/abort parameter — `toPixmap(matrix, colorspace, alpha, showExtras, usage, box)` in `node_modules/mupdf/dist/mupdf.js:2225` has no interrupt argument. So once a page render begins, the 90 s budget cannot be enforced; the ceiling is a between-pages sample, not a deadline. There is also no check after the loop (`:296` returns directly), so total elapsed can exceed `maxWallClockMs` by a full page render and still return `rendered`.

The test that "proves" the ceiling (`tests/pipeline/render.test.ts:133-136`) passes `maxWallClockMs: 0`, which trips the very first sample — it cannot distinguish a deadline from a sample.
**Failure scenario:** a single-page PDF with a pathological content stream (deep clip nesting, large shading mesh) or the F-2 bomb. `pageCount = 1`, so the loop's one `outOfTime()` check passes at t=0, `toPixmap` runs for minutes, the platform kills the invocation at `maxDuration = 360`, and `wall_clock` never fires. The named ceiling is not the thing that stops it.
**Confidence:** high on the mechanism (code plus the binding signature). Medium on the magnitude, since I did not build a pathological single-page PDF — the F-2 bomb is the closest evidence at 3.5 s for 376 bytes.

---

### F-6 — the citation's PAGE coordinate has zero coverage and no anchor: every corpus item is single-page, the text layer is concatenated with no page markers, and the images go on the wire unlabelled
**Severity:** MAJOR
**Where:** `lib/pipeline/render.ts:207` and `:218` (`whole += doc.loadPage(i).toStructuredText().asText()`); `lib/ai/client.ts:188-199` (`imageBlocks`)
**Claim under test:** `render.ts:79` — "1-indexed, matching §6.4's `{page, bbox}` citation geometry"; the prompt's "Give a citation: the 1-indexed page, and a bbox…" (`lib/ai/prompt.ts:36-38`).
**What I found:** three things compound.

1. `imageBlocks` emits a bare sequence of image blocks with no interleaved text naming the page. The model must infer "page N = Nth image" from position alone.
2. For a born-digital PDF the text layer is appended *after* all images as one undelimited string — `whole += …asText()` with nothing between pages. A value the model reads from the text layer has no page anchor whatsoever.
3. `validateFacts` (`lib/ai/extract.ts:75-79`) range-checks `1 ≤ page ≤ pageCount` and nothing more.

And there is no coverage: I enumerated `fixtures/g9/corpus.json` — **all 28 items are single-page**; every labelled item has `labelPages=[1]`. The only multi-page fixture is `dev-pagebomb-01` (250 pages), which is refused before rendering. So `citation.page` is always 1, the range check is always trivially satisfied, and the image-order↔page-number correspondence is exercised by nothing in the tree.
**Failure scenario:** a 6-page EOB, born-digital. The model reads `amount` from the undelimited text layer and reports `{page: 1, bbox: […]}` because page 1 is where the header was. `validateFacts` accepts it (1 ≤ 6). The fact is stored with a well-formed citation. Slice 6 crops `p001.png` at that bbox and shows a region of page 1 that does not contain the amount — the reviewer sees a confident number under a crop that does not support it. This is precisely the "wrong door … every bbox lands in the wrong place and nothing errors" failure, one coordinate over from the orientation door that *was* closed.
**Confidence:** high on the absence of coverage and of page markers (both verified directly). Medium on how often a given model actually mis-attributes — that is exactly what a multi-page fixture would measure and no fixture does.

---

### F-7 — the G9 eval harness discards the citation before scoring, so nothing anywhere measures whether a bbox lands on its value
**Severity:** MAJOR
**Where:** `lib/eval/score.ts:34-37`; `scripts/eval/run.ts:219-222`
**Claim under test:** ADR D3's slice-5 exit assertion, and §6.4's "crop-on-screen" premise that a citation is a region a person could look at and see the value.
**What I found:** the corpus carries a labelled bbox per field (`lib/eval/corpus.ts:44-46`, "against the page AS DISPLAYED — EXIF orientation already applied"), and the harness throws it away:

```ts
export type Prediction = { itemId: string; facts: Array<{ field: string; value: string }> };
```

`scripts/eval/run.ts:219-222` parses `{ field, value }` only. `grep -rn "citation" lib/eval scripts/eval` returns two comments and no code; `score.ts` never mentions `bbox`. The only geometric assertion in the whole suite is `tests/eval/corpus.test.ts:111` — "every citation is a real region of a real page" — which validates the *corpus's own labels*, not the model's output. The only runtime guard is `validateFacts`'s range check (`0 ≤ bbox ≤ 1`, `x+w ≤ 1.0001`), which a bbox of `[0,0,1,1]` or a bbox on the wrong half of the page passes identically to a correct one.

So the gate that signs the bands measures value accuracy only. A model whose values are perfect and whose boxes are uniformly offset — or F-6's wrong page — scores 1.00.
**Failure scenario:** any regression that shifts geometry (a tier change, a future crop/pad step, a provider swap, F-1's DPI collapse changing what the model can see) is invisible to G9. The band artifact is signed on a run in which citation correctness was never measured, and the first person to discover it is a family member in slice 6's review screen looking at a crop that does not show the value.
**Confidence:** high — verified by reading the `Prediction` type, the harness's parse, and the absence of `citation`/`bbox` in `score.ts`.

---

### F-8 — `promotedPageKey`'s default extension is `png`, which is wrong for the majority of arrivals; write-once rests on regex-matching an upstream error message
**Severity:** MINOR
**Where:** `lib/pipeline/page-keys.ts:57-64` and `:67-73`; `lib/storage/artifacts.ts:318-322`
**Claim under test:** ADR D3 — "promotion on `advanced` writes per-arrival, write-once keys"; the slice-6 seam "`p003.png` gains `p003.txt`".
**What I found:** `render.ts:236` renders **JPEG for everything except born-digital PDFs** — i.e. every photo, pill bottle, note and scanned PDF promotes as `pNNN.jpg`. `promotedPageKey(circle, arrival, page)` defaults to `'png'`, and the test that pins the contract calls exactly that three-argument form (`tests/pipeline/render.test.ts:222`). `promotedPageTextKey` has no ext at all, so the "sibling sharing the stem" assertion (`:235`, `text.startsWith(page.slice(0, page.lastIndexOf('.')))`) is only ever checked against the png variant. Nothing in the promoted record says which extension a given arrival used, and `hc_pipeline` cannot read `arrivals`, so slice 6 must list the prefix rather than build the key — the exported builder is a trap rather than the contract the module claims to be.

Separately, write-once is real (`storage-js`'s `copy` sends no `x-upsert`, `node_modules/@supabase/storage-js/dist/index.mjs:982-992`, so a duplicate destination 409s) but is implemented by `!/exists|duplicate/i.test(error.message)`. A wording change upstream converts a benign duplicate into a throw, which lands in F-3(d)'s unrecoverable partial-promotion path.
**Failure scenario:** slice 6 calls `promotedPageKey(c, a, 3)` for a phone-photo arrival, gets `…/p003.png`, and 404s — every citation on a photo, scan or pill bottle has no image. Caught at build time in slice 6, not in production, hence MINOR — but the exported default and its test actively encode the wrong answer.
**Confidence:** high.

---

### F-9 — the four named refusal reasons are collapsed to one persisted reason, so no ceiling can be told from another after the fact
**Severity:** MINOR
**Where:** `app/api/worker/[stage]/route.ts:270-272`
**Claim under test:** ADR D3 — "The four ceilings are named values that refuse with **named reasons**: `page_bound`…, `page_dimensions`…, `wall_clock`, `output_size`."
**What I found:** `RefusalReason` is discarded at the worker boundary: `if (result.outcome === 'refused') return { state: 'extract_failed', reason: 'archive_bounds_exceeded' };` — all four map to one string. ADR D7 owns half of this (the *name* is wrong for a PDF), but not the half that matters operationally: the names exist only inside `render.ts` and never reach the durable record, so a 250-page document, a pixel bomb, a wall-clock overrun and a 64 MB output are indistinguishable in the arrivals table. Given F-1 and F-2, "how often does `page_dimensions` fire, and on what?" is exactly the question that would have surfaced the DPI bug, and it is unanswerable from the record.
**Failure scenario:** a fleet-wide symptom (families' scans being refused after a phone OS update starts writing a different density tag) shows up as an undifferentiated rise in `archive_bounds_exceeded` with no way to attribute it. Not a wrong outcome for any single arrival — hence MINOR.
**Confidence:** high; D7 documents the naming half and the mapping site is explicit.

---

### F-10 — the orientation choice IS exclusive in production code, and all 8 spike legs pass at this HEAD; leg 7's control is real but scoped to mupdf, and leg 6 is tautological with respect to its fixture
**Severity:** OBSERVATION
**Where:** `scripts/spike/mupdf-spike.mjs:195`, `:240`, `:181-182`
**Claim under test:** "§6.4's citation space is the page as a person SEES it, so `render.ts` only ever opens documents."
**What I found:** the exclusivity holds. A tree-wide grep for `new mupdf.Image`, `mupdf.Image(` and any other decode entry point finds `mupdf.Document.openDocument` at `render.ts:172` as the sole production decode path; `new mupdf.Image` appears **only** in `scripts/spike/mupdf-spike.mjs:195` and `:240`, and `scripts/bench/prf07.ts` mentions mupdf only in a comment. No fallback, error handler, or shared test helper constructs an `Image`. The regression guard for the code path is `tests/pipeline/render.test.ts:152-160` (`expect(page.heightPx).toBeGreaterThan(page.widthPx)` on `dev-angled-01`), which would red if the door were swapped.

I ran the spike at HEAD: all 8 legs PASS, verdict "mupdf carries §6.3", and leg 8 reproduces the ADR's numbers exactly — "the same citations mean **36.3** on the displayed frame vs **220.4** on the stored frame". The control is not a tautology: it compares two genuinely different framings of the same normalised boxes and both fixtures are DeviceGray, so the channel comparison is apples-to-apples. Two honest limits worth stating rather than treating the number as broader than it is: (a) the control proves a property of *mupdf*, not of `render.ts` — the spike deliberately does not import the module, so it cannot regress-guard the code path (the vitest above does); (b) leg 6's `mp > MAX_PAGE_MEGAPIXELS` assertion at `:181-182` uses the same fixed `PT_PER_PX = 0.75`, so it validates the ceiling against exactly the one input class — a density-free JPEG — for which the constant is correct. That is the tautology, and F-2 is what it hides.
**Failure scenario:** none for the orientation claim; it holds as written.
**Confidence:** high — grep plus a clean spike run at dd8a895, and `npx vitest run tests/pipeline/render.test.ts` is 22/22 green.

---

### F-11 — `serverExternalPackages` is correct, the test would fail if the entry were removed, and no other dependency needs the same treatment
**Severity:** OBSERVATION
**Where:** `next.config.ts:18`; `tests/config/next-config.test.ts:30-36`
**Claim under test:** D3 — "`next.config.ts` names `mupdf` in `serverExternalPackages`."
**What I found:** verified all three parts. The entry is present. The test imports the real `next.config` and asserts `expect(external).toContain('mupdf')`, so deleting the entry reds it — it is a genuine pin, though it pins the config value only and nothing exercises the runtime consequence it describes. On the "any other dependency" question: `node_modules/next/dist/lib/server-external-packages.jsonc` contains `pg` (line 67), as the comment claims, alongside `canvas` and `sharp`; the remaining runtime deps are `@anthropic-ai/sdk`, `@supabase/ssr`, `@supabase/supabase-js`, `react`, `react-dom`, `server-only`, `tus-js-client` — all pure JS with no native or wasm asset resolution. `mupdf` is the only addition needed.
**Failure scenario:** none constructed; the claim holds.
**Confidence:** high.

---

### F-12 — the eval harness re-implements the request assembly and normalizes with the DECLARED mime while production sniffs, so "the eval measures what production sends" is true only by inspection
**Severity:** MINOR
**Where:** `scripts/eval/run.ts:70-91`
**Claim under test:** `run.ts:63-67` — "One item's request — built from the SAME schema, prompts and §6.3 render rules the worker uses. That identity is the whole reason this harness is TypeScript."
**What I found:** two divergences from the production path. (1) The image blocks are built inline (`content.push({ type: 'image', source: {…} })`) rather than by calling `imageBlocks` from `lib/ai/client.ts` — the shapes match today, but nothing binds them, and the whole argument for the harness being TypeScript is that they cannot drift. (2) The harness calls `normalizeArrival(bytes, corpusMime(item))` — a filename-extension lookup (`lib/eval/corpus.ts:157-162`) — while the worker calls `normalizeArrival(bytes, sniffMime(bytes))` (`route.ts:301`). They agree on the current 28 fixtures, so this is latent rather than active.
**Failure scenario:** a future fixture whose extension and magic bytes disagree, or a change to either mime path, silently makes the scored eval measure a different render than production performs. No current fixture triggers it — hence MINOR.
**Confidence:** high on the divergence; low that it bites at this HEAD.

---

### F-13 — `cropRect` — the one function that converts a citation into pixels — has no production consumer, and the interpret stage re-renders whole documents to recover text it then discards the pages of
**Severity:** OBSERVATION
**Where:** `lib/pipeline/render.ts:307-317`; `app/api/worker/[stage]/route.ts:525-531`
**Claim under test:** D3's "a normalised bbox names the same FRACTION of the page at any resolution" as the slice-5 exit assertion.
**What I found:** a tree-wide grep for `cropRect` finds it in `tests/pipeline/render.test.ts` only. That is defensible for slice 5 (slice 6 is its consumer), but it means the resolution-independence assertion is exercised entirely against `fake(800,1000)` / `fake(3200,4000)` literals (`:191-192`) — two numbers divided by two numbers — plus one real-render clamp check. Combined with F-7 (nothing scores real citations) and F-6 (no multi-page fixture), the coordinate space's end-to-end correctness rests on no measurement at all; the round-trip evidence is leg 8 of a standalone spike that does not import the module.

Separately, `processInterpret` calls `normalizeArrival` a second time on a fact-free re-queue purely to obtain `normalized.text` — for a 150-page born-digital PDF that renders and JPEG/PNG-encodes all 150 pages and throws every one away, inside a stage whose lease clock is already running, and if that second normalize refuses (F-5's per-page sampling makes it plausible) `documentText` silently becomes `null` while the operator note still asserts "Read the document text below directly."
**Failure scenario:** for the re-render, a sweeper-rescued interpret on a large born-digital PDF spends most of its lease re-rendering pages nobody reads and can exhaust the attempt. Not a wrong outcome, so OBSERVATION.
**Confidence:** high on both mechanisms; the re-render's cost is arithmetic from F-4's measurements, not separately timed.

---

## R4 — the worker state machine, the leases, the relay

*Lens: `app/api/worker/[stage]/route.ts` (`processExtract` and
`processInterpret`), `app/api/worker/relay/route.ts`, `lib/hc/workers.ts`.
Reported 15 findings including one BLOCKER, and confirmed
`releaseDeferredWork` holds on every axis D10 claims.*

### F-1 — The record context is read under the wrong key: `context.facts` vs the definer's `profile_facts`. D8's entire mechanism is inert.
**Severity:** BLOCKER
**Where:** `app/api/worker/[stage]/route.ts:412` and `lib/ai/interpret.ts:80`, against `supabase/migrations/20260821120002_record_context.sql:238`
**Claim under test:** D8 — "`draftPayloads` converts a `profile_fact` for a field the record already carries with a DIFFERENT value into a conflict quoting that fact; an UNCHANGED value proposes nothing at all; §3.10's boundary is enforced TWICE." §4.8: "A change to any high-risk field (PRD §6.4) is always a conflict, never a quiet update."
**What I found:** `hc.record_context_for` returns its facts section under `profile_facts`:
```sql
  return jsonb_build_object(
    'circle_id', v_circle, 'subject_id', v_subject,
    'profile_facts', v_facts,
```
Both consumers read `facts`:
- route.ts:412 `const rows = (context as { facts?: { rows?: unknown } } | null)?.facts?.rows;` → `undefined` → `if (!Array.isArray(rows)) return byField;` returns an **empty Map** on every call.
- interpret.ts:80 `const facts = (recordContext as { facts?: { rows?: unknown } } | null)?.facts?.rows;` → `allowedIds` is an **empty Set** on every call.

`profile_facts` appears nowhere in `lib/`, `app/`, `tests/` or `scripts/` (grep is empty). Verified live against the running DB: `record_context_for`'s body contains `'profile_facts', v_facts` and does **not** contain `'facts', v_facts`; pgTAP pins the top-level key set as `array['circle_id','documents','open_tasks','profile_facts','subject_id','timeline_events']` (`supabase/tests/052_record_context.sql:350`). Every unit test invents the shape instead (`tests/routes/worker-interpret.test.ts:73` `RECORD = { facts: { rows: [...] } }`, `tests/routes/worker-extract.test.ts` `recordContextFor.mockResolvedValue({ facts: { rows: [] } })`), which is why 69/69 pass.

Four consequences, all live:
1. `current.get(p.field)` is always `undefined`, so **no `profile_fact` is ever converted to a conflict**.
2. The restatement suppression at route.ts:461 never fires, so restatements are always proposed.
3. `allowedIds.has(conflictsWith)` is always false (interpret.ts:139), so **every model-drafted conflict is dropped**, and route.ts:469's `find` over an empty map drops any survivor. **The pipeline cannot emit a `conflict` proposal at all.**
4. A dose change therefore reaches review as a plain `profile_fact`, and `hc.approve_proposal`'s non-conflict branch (`20260821120004_conflict_outcomes.sql:382-410`) **silently supersedes the current row** — the exact quiet update §4.8 and AC-INBOX-6 exist to forbid.
**Failure scenario:** Record holds `medication_dose = "250 mg"` (high risk). A discharge summary says 500 mg. Interpretation proposes `{kind:'profile_fact', field:'medication_dose', value:'500 mg', domain:'health'}`. `currentFacts` is empty → it stays a `profile_fact` → drafted → the reviewer sees "medication_dose: 500 mg" with no indication the record says 250 mg, no old value, no both-provenances, and none of §4.8's three outcomes. Approving supersedes the 250 mg row.
**Confidence:** high. Confirmed against the live database body and the pgTAP key pin; the key string `profile_facts` is absent from all TypeScript.

---

### F-2 — `interpreting → extract_failed` is not in the transition graph: the interpret failure exit is a no-op
**Severity:** MAJOR
**Where:** `app/api/worker/[stage]/route.ts:547-553`; graph at `supabase/migrations/20260816010009_round7_fixes.sql:52-66`
**Claim under test:** §4.3's interpret row and the ADR's "a refusal terminalizes"; `tests/routes/worker-interpret.test.ts:407` "a refusal terminalizes with provider_refusal".
**What I found:** `hc.advance_arrival` closed the graph at round 7 — it binds the fenced lease's `stage` and requires the edge to exist in `hc.arrival_transitions`, else `return 'invalid_state'`. Queried live, the only interpret edge is `interpret interpreting -> proposals_ready`. The route calls `advanceArrival(arrivalId, 'interpreting', 'extract_failed', lease, reason)` on a lease whose stage is `interpret` → the graph check fails → `invalid_state`, returned **before** the state update and before the lease is closed. The route returns `'refusal:invalid_state'` and archives the message.
So a provider refusal or an unparseable answer at interpret: (a) does not terminalize, (b) leaves the lease open to its 300 s deadline, (c) is re-queued by the sweeper, (d) **re-calls the provider on attempts 2 and 3**, and (e) finally lands `extract_failed` with `interpret_budget_exhausted` rather than `provider_refusal`/`provider_error`. The test does not catch it because `advanceArrival` is mocked to return `'advanced'`.
**Failure scenario:** A document trips the model's refusal path deterministically. Attempts 1–3 each burn a full Opus 5 `effort: high` interpret call (3× the cost, and §6.11 prices interpretation at $0.02–0.05/arrival), each separated by a 300 s lease expiry plus sweeper latency (~15+ min to terminalize). The reason code stored is wrong, so the operational tier cannot distinguish a refusal from a budget burn.
**Confidence:** high. `hc.arrival_transitions` enumerated live; the graph check at `20260816010009_round7_fixes.sql:128-133` is unconditional.

---

### F-3 — A converted conflict carries neither `domain` nor `risk_class` (nor a `task` block): `use_new` and `keep_both` are both un-approvable
**Severity:** MAJOR
**Where:** `app/api/worker/[stage]/route.ts:488-496`; consumer at `supabase/migrations/20260821120004_conflict_outcomes.sql:177-182` and `:293-316`
**Claim under test:** D8 — the conversion produces "what `hc.draft_proposal` needs, since a conflict with no parents is refused".
**What I found:** `draftPayloads` writes `domain` and `risk_class` only inside `if (kind === 'profile_fact')` (route.ts:488-492). When a `profile_fact` is converted at route.ts:462 (`kind = 'conflict'`), that block is skipped, so the drafted conflict payload has `{title, summary_text, anomaly_flags, field, value, parents}` and **no `domain`, no `risk_class`, no `task`**. Model-drafted conflicts get the same treatment. `hc.draft_proposal`'s conflict branch only checks `parents ≥ 1`, so the draft succeeds — the failure is deferred to approval:
```sql
    if v_outcome = 'use_new'
       and (length(coalesce(v_payload ->> 'field', '')) not between 1 and 120
            or v_payload -> 'value' is null
            or v_payload ->> 'domain' is null) then
      raise exception 'approval_refused' using errcode = 'P0001';
```
`keep_both` likewise requires `v_payload -> 'task'` to be an object with a title. Neither is ever present. Only the `keep` outcome (writes nothing) works. Additionally `risk_class` is `NOT NULL` on `profile_facts` and the §6.4 high-risk confirmation gate is a string test (`v_payload ->> 'risk_class' = 'high'`) that would silently pass on a NULL — a latent trap if someone adds `domain` without `risk_class`.
**Failure scenario:** Once F-1 is fixed, a dose-change conflict is drafted correctly and the reviewer clicks "Use the new one" → `approval_refused` (P0001) with no actionable message. The only outcome §4.8 defines that changes the record is unreachable for every conflict the pipeline can produce.
**Confidence:** high. Payload construction read line by line; the approval preconditions are explicit `raise exception`s.

---

### F-4 — Attempt staging leaks on every throw and on every platform kill; nothing sweeps `render/attempt/…`
**Severity:** MAJOR
**Where:** `app/api/worker/[stage]/route.ts:311-317` (staging writes), `:592-612` (the catch); `lib/storage/artifacts.ts:281-297`
**Claim under test:** §4.5 — "Large intermediate artifacts … are staged under an attempt-scoped Storage key … and garbage-collected when the lease closes as anything other than `advanced`"; ADR "attempt staging is GC'd on every non-advance".
**What I found:** `gcRenderStaging` is only ever called from the three graceful branches (route.ts:304, 328, 375). Every non-graceful exit skips it and there is **no other consumer of `renderStagingPrefix`** anywhere in the codebase (grep confirms only `gcRenderStaging` and `promoteRenderedPages`, both lease-scoped and worker-driven). `app/api/worker/nightly/route.ts` sweeps only the quarantine bucket. So a leak is permanent for:
- `writeRenderStaging` throwing partway through the page loop (route.ts:311-317);
- `assertAllowedModel` throwing out of `callProvider` (it sits *outside* the try at `lib/ai/client.ts:110`);
- `finalizeExtraction` throwing on a DB error (route.ts:373);
- `promoteRenderedPages` throwing (route.ts:381) — its `remove(keys)` at `lib/storage/artifacts.ts:324` never runs;
- `gcRenderStaging`'s own `remove` rejecting (`lib/storage/artifacts.ts:294` is not inside the try);
- the platform killing the function mid-provider-call — the case §4.3 exists for.
The POST catch (route.ts:607-612) logs and moves on; the leaked prefix names a lease id no future attempt will ever reproduce.
**Failure scenario:** A storage blip during the staging loop of a 200-page scan. Up to `RENDER_CEILINGS.maxRenderedBytes` = 64 MB of rendered page images of a family's medical document sit at `render/attempt/<circle>/<arrival>/<lease>/` forever — no expiry, no owner, and outside the promoted-prefix shape any future DEL-01 storage cascade would target.
**Confidence:** high for the leak; medium on the exact frequency (depends on storage/provider error rates).

---

### F-5 — Extracted fact values (SSN, member_id, DOB, doses) are written verbatim into `pgmq.a_pipeline_work`, which is never pruned and is outside every deletion path
**Severity:** MAJOR
**Where:** `app/api/worker/[stage]/route.ts:382-398`; `lib/hc/workers.ts:235-240` ("Ack = ARCHIVE, deliberately")
**Claim under test:** D6 — "The extract → interpret hand-off therefore carries the facts on the work item, which is also cheaper." PRD §4.2: "An arrival that produced **nothing filed** … deletes cleanly: artifact, extractions, proposals, gone at purge."
**What I found:** the hand-off puts `CarriedFact[]` — `{field, value, confidence, citation}` — on the pgmq message, and the worker's ack is `pgmq.archive`, deliberately, because `lookupLineage` reads the archive. Nothing anywhere prunes `pgmq.a_pipeline_work`: grep over `supabase/`, `lib/`, `app/`, `scripts/` finds only the grant, the `lookupLineage` query, and a bench script. The nightly job does not touch it. The fields carried include the §6.4 high-risk classes the catalogue defines — `ssn`, `member_id`, `date_of_birth`, `account_number`, `routing_number`, `medication_dose` (`lib/extraction/fields.ts:52-103`). So after an arrival is soft-deleted and purged at 30 days, and after `extractions` rows are gone, a verbatim copy of the same values remains in the queue archive indefinitely, unreachable by the deletion ledger (§2.9) and by any tombstone replay.
**Failure scenario:** A member deletes an arrival that filed nothing (PRD §4.2's "deletes cleanly"). `arrivals`, `extractions` and `proposals` purge at 30 days. `pgmq.a_pipeline_work` still holds `{"field":"ssn","value":"123-45-6789",…}`. The promise is broken silently, and a restore-with-tombstone-replay does not repair it because the ledger has no record of a queue payload.
**Confidence:** high on the mechanism; the severity rating assumes DEL-01 will ship as specified, which is the point — this must be closed before it does, not after.

---

### F-6 — `promoteRenderedPages` is non-atomic with no repair path: a partial promotion is permanent behind an `extracted` arrival
**Severity:** MAJOR
**Where:** `lib/storage/artifacts.ts:306-326`; called at `app/api/worker/[stage]/route.ts:381`
**Claim under test:** "Won: the attempt's pages become the arrival's pages (write-once)"; §4.5's promoted rendering is what slice 6's review screen crops citations from.
**What I found:** promotion runs **after** `finalizeExtraction` returned `advanced` — the transaction has already published the facts and the citations and moved the arrival to `extracted`. The loop copies key by key and throws on the first non-"exists" error:
```ts
    const { error } = await store.from(ARTIFACTS).copy(key, target);
    if (error && !/exists|duplicate/i.test(error.message)) {
      throw new Error(`promoteRenderedPages: ${error.message}`);
    }
```
The throw propagates to the POST catch, the message is left unacked, and on redelivery `claimStage('extract')` sees state `extracted` with an `extracting`-from event present → `already_advanced` → the route returns immediately. **Nothing re-attempts promotion.** The arrival is `extracted` with, say, 149 of 200 promoted pages, and the staging copies are also leaked (F-4). The same throw also loses the interpret hand-off (route.ts:392) — recoverable via the sweeper's `extracted` requeue, but only on the bare, factless path.
**Failure scenario:** A 200-page born-digital PDF; storage rejects the copy at page 150 (rate limit, transient 5xx). Extraction published a fact citing `{page: 175, bbox: …}`. Slice 6's review screen resolves that citation against `render/circle/<c>/arrival/<a>/p175.png`, which does not exist and never will. The high-risk crop-on-screen rule silently has nothing to crop.
**Confidence:** high on the mechanism and the absence of a repair path; medium on likelihood.

---

### F-7 — The read visibility timeout (120 s) is shorter than the extract stage (up to 300 s); the second reader archives the in-flight message
**Severity:** MAJOR
**Where:** `lib/hc/workers.ts:220` `const READ_VT_SECONDS = 120;`; `app/api/worker/[stage]/route.ts:605` `await archivePipelineWork(work.msg_id);`
**Claim under test:** D10 — "a read hides 120s, D13 deferred an hour, the threshold sits between them"; §4.2 — "At-least-once delivery is safe. A re-delivered message returns `already_advanced`."
**What I found:** the numbers do not compose. `hc.stage_budgets` gives extract `lease_seconds = 300`; `providerTimeoutMs` budgets the call at up to `min(deadline - now - 20s, 240s)`; `RENDER_CEILINGS.maxWallClockMs` adds up to 90 s of rendering before that. So a normal in-flight extract routinely outlives its own 120 s visibility window, and the relay fires `/api/worker/extract` every 60 s (`vercel.json`). Redelivery mid-flight is therefore the **normal case**, not the exceptional one.
The second reader claims, correctly gets `stale_lease` (F-7 is not a double-provider-call bug — claim-before-work holds), and then unconditionally runs `await archivePipelineWork(work.msg_id)` at route.ts:605 — the archive branch is not conditioned on the outcome. **The in-flight message is archived out from under the worker that still holds the lease.** pgmq's own redelivery guarantee for that unit of work is destroyed; if the first worker is then killed, recovery depends entirely on the sweeper noticing the expired lease a minute later.
**Failure scenario:** t=0 worker A reads msg 42, claims attempt 1 (deadline t=300), renders, dispatches. t=120 msg 42 becomes visible. t=125 the relay's fire causes worker B to read msg 42, get `stale_lease`, and archive it. t=200 the platform kills worker A mid-call. The queue now contains nothing for this arrival; the lease sits open until t=300; the sweeper re-lists it on the next pass. Net: an extra route invocation and claim round-trip per tick per in-flight message, and the queue's redelivery path silently doing no work.
**Confidence:** high. `READ_VT_SECONDS`, `lease_seconds`, `MAX_PROVIDER_TIMEOUT_MS` and `maxWallClockMs` all read directly; the unconditional archive is one line.

---

### F-8 — The route budget cannot keep an invocation inside `maxDuration`
**Severity:** MINOR
**Where:** `app/api/worker/[stage]/route.ts:80`, `:89-90`, `:585`
**Claim under test:** "One route invocation's own budget, inside maxDuration… the loop stops taking NEW work when the budget is spent."
**What I found:** the guard is `Date.now() - startedAt > ROUTE_BUDGET_MS - PER_MESSAGE_RESERVE_MS` = 280 000 ms. A single extract stage can occupy up to the lease's 300 s. So the last message may start at t=279.9 s and finish at t≈580 s, against `maxDuration = 360`. `PER_MESSAGE_RESERVE_MS` is 20 s where the worst-case message is 300 s; the reserve is sized for a finalize, not for a stage. The recovery story the comment gives (expired lease, attempt already burned, sweeper re-queues) is correct, so this costs a wasted attempt and a wasted provider call rather than a wrong state — but the arithmetic does not do what the comment says it does.
**Failure scenario:** A batch of ten fast extracts (~55 s each). Messages 1–5 complete by t=275. The guard passes, message 6 starts, its provider call runs long, the platform kills at t=360. Message 6's attempt is burned and its provider call is paid for with nothing to show; its staging leaks (F-4).
**Confidence:** high on the arithmetic; the hosted `maxDuration` ceiling itself is an unverified checklist row (`docs/ops/ai-provider.md` DUR-1).

---

### F-9 — Q-D's unreachable list is incomplete: at least five more states/codes have no producer
**Severity:** MINOR
**Where:** `docs/review/round-16-packet.md:211-225`; `supabase/migrations/20260816010001_pipeline_tables.sql:30-53`, `:93`
**Claim under test:** Q-D — "Nothing produces the `extract_timeout` state." (named as the only one)
**What I found:** `extract_timeout` is genuinely unreachable — verified: an SDK timeout throws out of `client().messages.create` and is caught at `lib/ai/client.ts:135-137` as `{outcome:'unavailable'}`, which the worker maps to `'extract_unavailable_retry'` with no `advanceArrival` (route.ts:329-334). Q-D's reasoning holds. But the list is short by:
- `provider_timeout` (reason code) — the companion to `extract_timeout`; grep finds producers only in pgTAP `053`;
- `storage_write_failed` — no producer at all; `writeArtifactObject` throws and the route's catch turns it into an unacked redelivery, so store exhausts with `store_budget_exhausted` instead;
- `sweeper_requeue` — no producer; the sweeper's requeue is a read-only advisory listing that writes no `arrival_events` row;
- `scanning` (arrival state) — no `→ scanning` edge in `hc.arrival_transitions` (enumerated live) and `stage_budgets` gives scan `inflight_state = null`;
- `pipeline_leases.outcome = 'failed'` and hence `extraction_runs.outcome = 'failed'` — the `close_extraction_run` trigger reads `new.outcome = 'failed'` but nothing ever writes it (confirmed live: no `hc` function writes that value);
- and, per F-2, `provider_refusal` / `provider_error` are unreachable *at the interpret stage* specifically.
**Failure scenario:** Not a runtime failure — an accuracy defect in the packet that hides a set of dead branches from the owner's decision. Downgraded to MINOR on that basis.
**Confidence:** high; each producer set was grepped across `supabase/migrations`, `lib/`, `app/`, and the transition graph was enumerated against the live database.

---

### F-10 — A stage-2 duplicate always produces a silent `invalid_state` at interpret
**Severity:** MINOR
**Where:** `app/api/worker/[stage]/route.ts:388-399`, `:506-507`
**Claim under test:** "finalize_extraction may have exited to duplicate_suspected_stage2 instead … The interpret claim absorbs a speculative message quietly — the same absorption the clean-duplicate gate enqueue already relies on."
**What I found:** it is not the same absorption. For a stage-2 exit the arrival is at `duplicate_suspected_stage2`, which is neither interpret's `entry_state` (`extracted`) nor its `inflight_state` (`interpreting`), and there is no `arrival_events` row with `from_state = 'extracted'` — so `hc.claim_stage`'s disambiguation returns `invalid_state`, not `already_advanced`. §4.2's table says `invalid_state` means "raise a defect signal". `processGate` does exactly that (`console.warn` at route.ts:210); `processInterpret` returns it silently at line 507. So every stage-2 duplicate emits an untraceable `invalid_state` plus a wasted queue message and a wasted eager fire.
**Failure scenario:** Any arrival that M5 detects as a stage-2 duplicate. Harmless to state, but it makes `invalid_state` background noise, which is exactly what §4.2 says it must not become.
**Confidence:** high on the claim path; medium on whether the owner considers the silence a defect versus a deliberate omission.

---

### F-11 — `msg.facts` is trusted with no runtime validation, and a non-array value produces the "thinner answer that looks normal" D6 rules out
**Severity:** MINOR
**Where:** `app/api/worker/[stage]/route.ts:515-534`
**Claim under test:** D6 — "the operator note SAYS the facts were absent so a thinner answer never looks like a normal one."
**What I found:** `const carried = msg.facts ?? [];` then `if (carried.length === 0)`. Nothing validates that `msg.facts` is an array or that its elements have the `CarriedFact` shape — the type annotation on `PipelineMessage` is erased at runtime and `pgmq.read` hands back raw jsonb. If `facts` is present but not an array (`{}`, a string, `null`-in-array), `carried.length` is `undefined`, `undefined === 0` is false, so the worker **skips both the artifact re-read and the operator note** and sends the malformed value straight to `delimitedFacts(JSON.stringify(input.facts))` (`lib/ai/interpret.ts:105`). That is precisely the silent thin answer.
Two adjacent bounds are also absent: the hand-off has no size cap — `P5_CAPS.maxFacts` 200 × the schema's `maxLength: 4000` value ≈ 800 KB of jsonb per message — and `lookupLineage` (`lib/hc/workers.ts:304-320`) sequentially scans both `pgmq.q_pipeline_work` and the never-pruned `pgmq.a_pipeline_work` on `message ->> 'arrival_id'`. Verified live: the only indexes on those tables are `msg_id` (pk), `vt`, and `archived_at` — no index on `message`. So 5B makes an already-unindexed growing scan carry ~800 KB rows.
**Failure scenario:** Malformed-facts case requires a buggy or future producer, so it is defensive rather than currently reachable — the size/scan half is reachable today on any fact-dense document. Both are MINOR on that basis.
**Confidence:** high on the code and the index inventory (queried live); low that the malformed shape occurs in the current build.

---

### F-12 — A `profile_fact` proposal with a null `field` or `value` is drafted and then fails at approval against NOT NULL columns
**Severity:** MINOR
**Where:** `app/api/worker/[stage]/route.ts:475-486`; `lib/ai/interpret.ts:147-153`; `supabase/migrations/20260815230002_record_tables.sql:204-205`
**Claim under test:** the adapter's own comment — "hc.draft_proposal refuses a profile_fact without a domain; refusing it here keeps the failure a counted drop rather than a raised exception."
**What I found:** the guard is asymmetric. `INTERPRETATION_SCHEMA` requires `field` and `value` on every proposal item but permits `null` for both (`type: ['string','null']`), because a `document` or `task` proposal has neither. The adapter drops a `profile_fact` with a bad `domain` (interpret.ts:147) but not one with `field: null` or `value: null`. `draftPayloads` checks only `!p.domain` (route.ts:476). `hc.draft_proposal` checks only `p_payload ->> 'domain' is null`. But `profile_facts.field` and `profile_facts.value` are both `not null`, and `hc.approve_proposal`'s profile_fact branch inserts `v_payload ->> 'field'` / `v_payload -> 'value'` directly.
**Failure scenario:** The model returns `{kind:'profile_fact', domain:'health', field:null, value:'no more aspirin'}`. It is drafted, sits at `pending`, renders on the review screen, and the coordinator's approval raises `23502 null value in column "field"` — a raw Postgres error at the moment a person clicks approve, with no `approval_refused` shape to render.
**Confidence:** medium-high — the code path is certain; whether a compliant model ever emits it is not.

---

### F-13 — `releaseDeferredWork` checks out on every axis the ADR claims, with one cosmetic gap
**Severity:** OBSERVATION
**Where:** `lib/hc/workers.ts:275-291`; `app/api/worker/relay/route.ts:70-79`
**Claim under test:** D10 — "bounded, idempotent, and best-effort — a release that throws never costs the pass"; the threshold "sits between them".
**What I found:** all four hold. The threshold is `READ_VT_SECONDS + 180` = 300 s, strictly between the 120 s read window (180 s of margin) and the 3600 s deferral (3300 s of margin), and it is *derived* from `READ_VT_SECONDS` so a reconfiguration of the read window carries it along. Bounded: `limit $2` with a 200 default. Idempotent: the steady state selects nothing. The try/catch at relay/route.ts:74-79 wraps both the call and the `firedStages.add`, so a throw genuinely costs nothing. At the boundary, the last 300 s of a deferral is simply not releasable, which is harmless. The one gap: `if (released > 0) firedStages.add('extract')` never adds `'interpret'` — harmless only because the `[stage]` path segment is cosmetic (the route reads one shared queue and dispatches on `msg.stage` at route.ts:600-604), so firing `extract` picks up released interpret work anyway. Worth stating out loud, since the code reads as if the segment selected work.
**Confidence:** high; the live test at `tests/hc/relay.test.ts:250-285` exercises the read-vs-defer separation directly.

---

### F-14 — `readArtifactBytes`'s prefix cannot collide with a staged or promoted render, but a transient storage error is indistinguishable from missing bytes
**Severity:** OBSERVATION
**Where:** `lib/storage/artifacts.ts:343-356`; `lib/pipeline/page-keys.ts:35-63`
**Claim under test:** D6 — "`readArtifactBytes` lists that prefix … More than one object under the prefix returns null rather than picking one at random."
**What I found:** the namespaces are disjoint and the claim holds. The source prefix is `circle/<c>/arrival/<a>`; staged pages are `render/attempt/<c>/<a>/<lease>/`; promoted pages are `render/circle/<c>/arrival/<a>/`; intake staging is `intake/<c>/<a>` and `intake/upload/…`. The three `render/`-rooted families share no root with `circle/`, so a staged render from a previous attempt cannot be mistaken for the source. Truncation is handled correctly by construction: `limit: 4` with `objects.length !== 1 → null` means five-or-more also returns null. Zero objects returns null. Folder entries are filtered by `e.id !== null`.
The one soft edge: `if (error) return null;` conflates a transient storage error with "no bytes", so a storage outage burns extract attempts at the same rate as a genuinely missing object — three attempts over ~15 minutes and the arrival is permanently `extract_failed`. The scan stage draws that distinction (`unavailable` → retry without finalizing); extract does not, though the retry posture happens to produce the same shape here.
**Confidence:** high on the namespaces; the conflation is a design observation, not a defect I can construct a wrong-state scenario from.

---

### F-15 — `processInterpret` discards `answer.dropped`
**Severity:** OBSERVATION
**Where:** `app/api/worker/[stage]/route.ts:557-562`
**Claim under test:** `lib/ai/client.ts:57-59` — "Items the model returned that our own validation refused. Counted, not hidden: a rising number is a pipeline signal (PRD §10.4)."
**What I found:** `processExtract` surfaces it (`route.ts:400` appends `'/Ndropped'`); `processInterpret` returns `r + ':' + drafted.length + 'p'` and never reads `answer.dropped`, nor the count of proposals `draftPayloads` itself skipped at route.ts:461/471/474-477. This matters more than it looks given F-1: today **every** conflict is dropped, and the counter that was supposed to make that visible is not printed anywhere at the interpret stage.
**Confidence:** high.

---

## R5 — the member surfaces and the D15 class of defect

*Lens: `app/(app)/[circle]/inbox/page.tsx`, `senders/**`, the artifact
route, and the amended `ingestion.spec.ts` leg. Reported 13 findings
including one BLOCKER, and independently re-verified the ADR's
"nothing else selects an ungranted column" claim rather than accepting
it.*

### F-1 — The senders page throws on every non-empty list: `accepted_at` is a `Date`, not a string
**Severity:** BLOCKER
**Where:** `app/(app)/[circle]/senders/page.tsx:66` (with `lib/hc/inbox.ts:103` and `:111`)
**Claim under test:** ADR-0022 D11 / coverage SND-03: "the pair is live at `/[circle]/senders`… list + revoke live end-to-end (D15's gap closed)", flipped to **green**.
**What I found:** The page renders

```tsx
{formatShortDate(sender.accepted_at.slice(0, 10))}
```

`accepted_at` is declared `string` in `KnownSender`, but the value is produced by `select * from hc.list_known_senders($1)` over the **node-pg** request-role channel (`lib/hc/inbox.ts:111`, `r.rows as KnownSender[]` — a blind cast). `hc.list_known_senders` declares `accepted_at timestamptz` (`supabase/migrations/20260821120001_inherited_obligations.sql:111`). node-pg's default parser for OID 1184 returns a JavaScript `Date`, and this repo installs no `setTypeParser` override anywhere (`grep setTypeParser` → zero hits; `new Pool({ connectionString, max: 10 })` in `lib/db/request-role.ts:70` passes no `types`).

I confirmed this against the **live local database**, calling the real definer through the same `set local role authenticated` + `request.jwt.claims` channel the page uses:

```
accepted_at ctor: Date | typeof slice: undefined
PAGE EXPRESSION THROWS: row.accepted_at.slice is not a function
```

The `try/catch` at `senders/page.tsx:42-47` wraps only `listKnownSenders`; the `.slice` is inside the JSX map, outside it. There is no `error.tsx` anywhere under `app/` (`find app -name error.tsx` → nothing), so the throw reaches the framework boundary.

**Why both test layers missed it — this is D15's exact failure mode repeating in the same slice:**
- `tests/routes/senders.test.ts:43` mocks `accepted_at: '2026-07-12T09:30:00Z'` — a **string**. Every render assertion passes.
- `tests/hc/inbox.test.ts:273` is the live-DB leg, and it asserts only `expect(mine!.accepted_at).toBeTruthy()`. A `Date` is truthy.
- `grep -rn "senders" e2e/` returns one unrelated SQL count in `ingestion.spec.ts:250`. **No e2e or a11y leg ever opens `/[circle]/senders`** (`e2e/a11y.spec.ts:252-259` audits `/timeline`, `/tasks`, `/invite`, `/account` only). The local gate that caught D15 never visited this route.

**Failure scenario:** A coordinator in a circle with ≥1 live `known_senders` row navigates to `/[circle]/senders` → `TypeError: sender.accepted_at.slice is not a function` during render → 500 / framework error page. The page "works" only in the zero-senders empty state and in the refusal state — i.e. exactly the two paths the tests exercise. SND-03's revoke half is therefore **unreachable through the surface it shipped on**, which is the gap the row claims to have closed.
**Confidence:** high — reproduced against the live DB through the real definer and the real driver, not inferred. `select accepted_at::text` in the definer, or `String(row.accepted_at)` / `new Date(...).toISOString()` at the boundary, would confirm the fix.

---

### F-2 — The mechanism that emptied the Care Inbox is untouched: three `{ data }` destructures still drop `error`
**Severity:** MAJOR
**Where:** `app/(app)/[circle]/inbox/page.tsx:102`, `:121`, `:169`
**Claim under test:** ADR-0022 D15: "**The fix, inside the bound:** the page stops selecting the column; suspects come from the STATE alone." The ADR treats the ungranted column as the defect.
**What I found:** The column was the *trigger*. The *defect* is that a refused query is indistinguishable from an empty one, and all three call sites still swallow it:

```ts
const { data: parentData } = await supabase.from('arrivals').select(...)   // :102
const parents = (parentData ?? []) as ArrivalRow[];                        // :112
const { data: childData } = await supabase.from('arrivals').select(...)    // :121
const { data: subjectData } = await supabase.from('subjects').select(...)  // :169
```

`error` is never bound at any of the three. B6's fix removed one input to the bug and left the amplifier in place. By contrast the same file's sibling route checks it properly — `app/api/artifact/[id]/route.ts:70`: `if (error || !data?.signedUrl) { console.error(...); return notFound(); }`.

Related, in the 5B-new surfaces: `senders/page.tsx:44` is a bare `catch { senders = []; }` and `senders/revoke/submit/route.ts:32` is a bare `catch { … ?e=revoke }`. Both are documented as DEF-10 one-shape, and that is correct for *authorization* refusals — but a bare catch cannot tell an authorization refusal from a pool exhaustion, a dropped connection, or the `TypeError` in F-1's class. Nothing is logged at any of them.

**Failure scenario:** Three concrete ones, all reachable today with no code change:
1. **Any future ungranted column** in `arrivals`/`subjects` — the D15 outcome verbatim, on a different column.
2. **A non-UUID circle segment.** `.eq('circle_id', circle)` with `circle = "foo"` raises `22P02 invalid input syntax for type uuid`; `parentData` is undefined → `parents = []` → the empty branch runs the `subjects` query, which raises the same error → `subjects = []`. `/foo/inbox` returns **200 with the Care Inbox header and a blank body**, not a 404.
3. **A database outage or a pool exhaustion.** A family whose inbox holds forty items is shown the *first-run* state: "Anything sent here shows up in this inbox." That is the page asserting a fact about the world that it does not know — the precise thing the file's own header comment (`:14-19`) says the empty state must never do.
**Confidence:** high — the code is quoted verbatim; scenario 2 follows directly from PostgREST's uuid cast and needs no assumption about grants.

---

### F-3 — D15's "the grant is deliberate" argument names three columns, and two of them are wrong
**Severity:** MAJOR
**Where:** `docs/adr/0022-5b-app-extraction-deltas.md:460-464`
**Claim under test:** "**The column-level grant is deliberate** (a member reads 25 of 28 columns; `duplicate_of_arrival_id`, the lease pointer and the idempotency key are withheld), so the answer is to extend it by one column, not to replace it with a table grant."
**What I found:** The 25-of-28 count is right. The list of what is withheld is not. Queried live against `information_schema.column_privileges`:

```
total columns: 28   granted to authenticated: 25
WITHHELD: auth_detail, current_lease_id, duplicate_of_document_id
```

- `duplicate_of_arrival_id` **does not exist**. `grep -rn duplicate_of_arrival_id` over the whole repo returns exactly one hit: this ADR line. (`duplicate_of_arrival` is a *reason code* in `20260818200006_duplicates_stage1.sql`, which is likely the source of the confusion.)
- `ingest_idempotency_key` is **granted** — it is in the grant list at `supabase/migrations/20260816010007_ingestion_rls.sql:33`, and I confirmed live that `select ingest_idempotency_key from public.arrivals` as `authenticated` is **ALLOWED**.
- `auth_detail` — the one withholding with an actual security rationale, spelled out in the same migration's header (`:17-20`: *"auth_detail (and the internal fence column current_lease_id) stay OUT of the authenticated column grant — so `select *` refuses for every member… auth_detail is served at view by hc.arrival_auth_detail"*) — is **omitted from the ADR's list entirely**.

So the sentence that carries the "extend by one, don't replace with a table grant" recommendation is evidence-free: it did not check the grant it is reasoning about.
**Failure scenario:** The owner reads D15 to decide the bound amendment. The ADR tells them the withheld set is a nonexistent pointer, a lease id, and an idempotency key — three columns that are all either non-existent or already readable — and does not mention `auth_detail`. An owner reasoning from that list has no reason to believe a table-wide `grant select on public.arrivals to authenticated` costs anything, and that grant would expose the verbatim DMARC/SPF/DKIM verdict blob that `hc.arrival_auth_detail` exists specifically to gate at VIEW under a DEF-10 shape. The ADR's recommendation happens to be right; its stated reason is not, and the reason is what survives into the amendment decision.
**Confidence:** high — verified live against `information_schema.column_privileges` and against the grant DDL.

---

### F-4 — The regression guard is a one-literal denylist over `.select()` strings; `where`/`order` references are equally refused and invisible to it
**Severity:** MAJOR
**Where:** `tests/routes/inbox.test.ts:405-425`
**Claim under test:** "The regression guard added with the fix therefore asserts on the SELECT STRING — a render assertion cannot distinguish 'no arrivals' from 'the query was refused'." (ADR D15; test comment at `:406-412`.)
**What I found:** The guard collects `proxy.select.mock.calls` and asserts, per string, `expect(select).not.toContain('duplicate_of_document_id')`. That is a **denylist of one literal**, and it inspects **only** the `.select()` argument.

PostgreSQL checks column privilege on every referenced column, not just the target list. Proven live as `authenticated`:

```
SELECT list            -> REFUSED: permission denied for table arrivals
WHERE only             -> REFUSED: permission denied for table arrivals   (where duplicate_of_document_id is null)
ORDER BY only          -> REFUSED: permission denied for table arrivals   (order by duplicate_of_document_id)
auth_detail WHERE      -> REFUSED
current_lease_id ORDER -> REFUSED
ingest_idem SELECT     -> ALLOWED
```

So `.eq('duplicate_of_document_id', x)`, `.is('duplicate_of_document_id', null)` and `.order('duplicate_of_document_id')` each reproduce the D15 outcome **exactly**, and the guard's proxy records those on `eq`/`is`/`order` mocks that the assertion never reads. It is also scoped to one test file's `from` mock, so it says nothing about `senders/page.tsx`, `tasks`, `timeline`, `invite`, `upload`, `account`, or `setup` — and nothing about `auth_detail` or `current_lease_id` on the inbox itself.

The guard's *form* is right (asserting on the query, not the render). Its *predicate* is the instance, not the class — which is the thing D15 §2 explicitly says needs closing.

**Failure scenario:** A slice-6 change adds "sort duplicates last" as `.order('duplicate_of_document_id', { nullsFirst: false })`. `tests/routes/inbox.test.ts` stays green (the string never appears in a `.select()` argument), the whole arrivals query is refused per F-4's live proof, `parents = []` per F-2, and every caller's Care Inbox renders the first-run empty state again. Identical blast radius, identical green suite.
**Confidence:** high — the privilege behaviour is measured, not assumed; the guard's scope is read directly from the assertion.

---

### F-5 — The stage-2 provenance line names `provider` as the matching field when the match may have been made on amount or policy number
**Severity:** MAJOR
**Where:** `app/(app)/[circle]/inbox/page.tsx:264-267`
**Claim under test:** ADR D9: "the suspicion is downstream of AI-extracted values — `document_date`, `provider` and `amount` are exactly what M5 matched on — so it is provenance in §8.6's sense… it is honest about what we know."
**What I found:** The rendered string is a flat conjunction:

> "Matched on the document type, date and provider read from this document"

`hc.detect_stage2_duplicate` (`supabase/migrations/20260821120005_duplicates_stage2.sql:104-127`) does **not** require provider. It requires category equal, `document_date` equal, and then:

```sql
and exists (                            -- ≥1 corroborating pair, PRESENT both sides
  select 1
  from (values ('provider', me.prov), ('amount', me.amt),
               ('policy_number', me.pol)) c(f, v)
  join public.extractions e … and e.field = c.f
  where c.v is not null and lower(btrim(e.value #>> '{}')) = c.v)
```

**≥1 of three**, disjunctively. The coverage row for DUP-02 states the contract correctly ("type + date + ≥1 corroborating field"); the member-facing copy states it as a three-way conjunction that includes the one field that may not have participated.

There is no test on the *truth* of this sentence — `tests/routes/inbox.test.ts:434` asserts only that the substring renders, and `e2e/extraction.spec.ts` asserts `toHaveCount(1)` on `.provenance`. Both fixtures happen to be same-provider discharge summaries.

**Failure scenario:** Two EOBs for the same person, same `category`, same `document_date`, matching `amount` `412.00`, from **different** providers (or with `provider` absent on one side — the extractor publishes what it finds). The predicate fires on the amount pair. The family reads "Matched on the document type, date and **provider** read from this document" and — with no way to see *which* document was matched (D15) — reasonably concludes the two came from the same provider. They click "Same thing — add it as another source", the second EOB is filed as an additional source on the first document (`insert into public.provenance_edges` at `:340-344`) and **nothing new is filed**. A distinct bill from a distinct provider is silently absorbed. The provenance line is load-bearing for that decision precisely *because* the matched document cannot be named, which makes an over-specific claim worse here than it would be elsewhere.
**Confidence:** high on the mismatch between copy and predicate (both quoted). Medium on the severity, which depends on how often the amount/policy arm fires alone in practice — the G9 corpus would answer that.

---

### F-6 — `/[circle]/senders` has no a11y and no browser coverage at all, while D11 cites "the a11y surface" as the reason it is not in nav
**Severity:** MINOR
**Where:** `e2e/a11y.spec.ts:245-263`; `docs/adr/0022-5b-app-extraction-deltas.md:334-338`
**Claim under test:** D11: "deliberately not a sixth nav item — `NAV_MANIFEST` lists only live primary routes and `tests/design/shell.test.tsx` pins the exact set, so a sixth would change the shell and **the a11y surface** for a management screen."
**What I found:** The nav half checks out — `components/shell/nav-manifest.ts:31-38` lists exactly six entries, none of them `senders`, and `tests/design/shell.test.tsx:75-91` pins the set with positive assertions plus `expect(html).not.toMatch(/connection/i)`. The link at `inbox/page.tsx:206` is a plain `<a href>` inside the `(app)` layout — keyboard-reachable in DOM order, and `app/globals.css:85` gives `a` a color with no `text-decoration: none` reset, so it stays underlined.

The problem is what the a11y argument buys. `e2e/a11y.spec.ts` audits `/${circleId}/timeline`, `/${circleId}/tasks`, `/${circleId}/invite`, `/account`, `/styleguide`, and the public/setup routes. **Neither `/senders` nor `/inbox` is in any list.** So 5B added a member-facing route that receives zero axe/contrast/touch-target/390px coverage, and the ADR's justification for keeping it out of nav — that a sixth item would "change the a11y surface" — protects a surface the new page was never measured against in the first place. Nothing pins the audit route list, so the omission is silent.

Nothing here is unreachable-but-indexed: `proxy.ts:43`'s matcher covers the path and the page redirects to `/sign-in` without claims, and there is no `robots.txt`/`sitemap` in the repo.
**Failure scenario:** Cannot construct a concrete user-visible failure without running axe on the route, which needs the gate stack. Downgraded to MINOR on that basis — the finding is the coverage hole and the ADR resting an argument on it, not a proven violation.
**Confidence:** high on the coverage gap (route lists read directly); no claim made about an actual WCAG failure.

---

### F-7 — A failed revoke is completely silent: the `?e=revoke` marker is never read by any page
**Severity:** MINOR
**Where:** `app/(app)/[circle]/senders/revoke/submit/route.ts:28`, `:35`, `:37`; `app/(app)/[circle]/senders/page.tsx:31-35`
**Claim under test:** "a refusal redirects with an error marker, never a 500" (`tests/routes/senders.test.ts:136-141`, asserting `location` contains `e=`).
**What I found:** The route redirects to `/${circle}/senders?e=revoke` (or `?revoked=1`). `SendersPage` takes only `{ params }` — it declares no `searchParams` prop and reads no query string. `grep -rn searchParams app/` lists eleven pages that do; neither `senders/page.tsx` nor `inbox/page.tsx` is among them. Every marker these submit routes emit — `?e=revoke`, `?revoked=1`, and the 4B set `?accepted=1`, `?e=accept`, `?cancelled=1`, `?resolved=1`, `?e=resolve`, `?e=cancel` — is written and never rendered. The test asserts the redirect *URL*, which is real, and infers a user-visible outcome that does not exist.

Authorization itself is sound end to end, and this part of the lens comes back clean: `hc.revoke_sender` (`20260818120006_sender_surfaces.sql:158-196`) re-checks live coordinator membership **inside the definer** under `search_path = ''` — the route carries identity and nothing else, so the page's own gating is not the only check. Revoke is idempotent-by-refusal: the `update … and k.revoked_at is null` returns no row on a second call and raises the same `sender_refused` as foreign/nonexistent/non-coordinator, so a double-revoke cannot double-log. CSRF: no route-level token or origin check on this route or on any of the three 4B submit routes it copies — protection rests entirely on `@supabase/ssr`'s `sameSite: "lax"` default (`node_modules/@supabase/ssr/dist/main/utils/constants.js:6`), which nothing in this repo pins or asserts.

**Failure scenario:** Two coordinators, A and B. B revokes sender S. A's page is stale, A clicks revoke on S → `hc.revoke_sender` finds no live row → `sender_refused` → bare `catch` → 303 to `?e=revoke`. A's browser reloads a page that reads no query string, and S is genuinely gone from the re-read list. A sees success. That case is benign. The one that is not: A's *session* has lost coordinator tier (removed, or tier downgraded) between page load and click. Identical refusal, identical redirect, and the list re-read now returns `sender_refused` → `catch` → `senders = []` → A sees "You have not accepted any senders yet." A revoke that was refused for authorization reads as an emptied list. §5.3's guarantee is that acceptance is "revocable"; nothing on this surface can tell a coordinator that a revoke did not happen.
**Confidence:** high — every element quoted from source; the marker-never-read fact is a direct consequence of the props signature.

---

### F-8 — The route to the senders surface exists only when the arrivals query returns rows
**Severity:** MINOR
**Where:** `app/(app)/[circle]/inbox/page.tsx:202-207` (inside the `parents.length > 0` return, after the early return at `:165-197`)
**Claim under test:** D11: "linked from the Care Inbox and deliberately not a sixth nav item… a management screen that belongs beside the thing it manages."
**What I found:** `grep -rn "/senders" app/ components/` returns exactly one link, and it is emitted only in the non-empty branch. The first-run branch (`:176-196`) renders the forwarding addresses and nothing else. So reachability of the *management* surface is coupled to the result of an unrelated *data* query rather than to the route's existence — and per F-2 that query returns `[]` on refusal as readily as on emptiness.
**Failure scenario:** The compound of F-2 and this: whatever empties `parents` (an ungranted column, a bad circle segment, a DB blip, a caller below the RLS cliff) simultaneously removes the only path to `/[circle]/senders`, including the ability to revoke a sender. During exactly the D15 outage the packet describes, a coordinator could neither read their inbox nor reach the surface that governs who may write to it. An `<a>` in the shared branch, or in the layout, decouples them.
**Confidence:** high on the coupling (one grep, one branch). The scenario is compound rather than standalone, which is why this is MINOR.

---

### F-9 — ADR and page comment quote a Postgres error string Postgres does not emit
**Severity:** OBSERVATION
**Where:** `docs/adr/0022-5b-app-extraction-deltas.md:429-431`; mirrored at `app/(app)/[circle]/inbox/page.tsx:35-36` and `tests/routes/inbox.test.ts:375`
**Claim under test:** "Postgres refused per-column… Selecting that column here is refused (**\"permission denied for column\"**)."
**What I found:** Measured live as `authenticated` against this exact table and column, the message is:

```
permission denied for table arrivals
```

PostgreSQL's executor reports the *relation* when a per-column ACL check fails on a table where the role holds some column privileges — `permission denied for column …` comes from a different check path. Identical text for `auth_detail` and `current_lease_id`.
**Failure scenario:** No user-visible failure. Operationally: an on-call engineer following the ADR and grepping logs for `permission denied for column` during the next instance of this class finds nothing, and the log line they *would* find looks like a total table-privilege loss rather than one missing column — a materially more alarming and misleading diagnosis.
**Confidence:** high — measured directly.

---

### F-10 — The amended `ingestion.spec.ts` cancel leg is honest; it trades one global assertion for a stronger binding one
**Severity:** OBSERVATION
**Where:** `e2e/ingestion.spec.ts:349-397` (vs `git show a9d9f43:e2e/ingestion.spec.ts`)
**Claim under test:** Packet: the amendment is worth attention — did the assertion weaken under cover of "the seam moved"?
**What I found:** The stated reason holds up. §4.5's cancel window is `extracting | extracted | interpreting` (`inbox/page.tsx:59`); before 5B nothing consumed those states, so every arrival rested at `extracting` and `.first()` always found a cancel form. 5B's workers drive to `proposals_ready`, where cancel is correctly not offered. The premise is real, not a cover story.

On the assertions:
- **Stronger:** old `.locator('form[action$="/inbox/cancel/submit"]').first()` → new `:has(input[value="${target}"])`. The old form could not tell you *which* arrival got cancelled; the new one proves the affordance binds to the intended row — which is the same class of defect the B9 gate found for duplicate children.
- **Weaker in one respect:** old `select count(*) … where state = 'cancelled'` → `expect(1)` was a whole-circle invariant that would have caught an over-cancel or a leaked cancel from an earlier leg. New `select state where id = $1` → `expect('cancelled')` checks only the target. Nothing else in the file re-establishes the "exactly one" property.
- Neutral: the leg now manufactures its own in-window arrival by POSTing `/api/worker/{store,scan,gate}` with the worker key. That is still the real pipeline, and it makes the leg deterministic rather than order-dependent.

**Failure scenario:** Cannot construct a real one. A regression that cancelled *both* the target and a bystander would now pass, but I have no path that produces it — `cancelArrival` takes a single `arrival_id` from a hidden input. Recorded as an OBSERVATION rather than a finding: adding `and state = 'cancelled'` as a circle-wide count alongside the target check would restore the lost half at zero cost.
**Confidence:** high — both versions read in full.

---

### F-11 — The artifact route's shrunken log call drops nothing; every former check survives (verified line by line)
**Severity:** OBSERVATION
**Where:** `app/api/artifact/[id]/route.ts:51-64`; `lib/hc/artifacts.ts:77-82`; `supabase/migrations/20260821120001_inherited_obligations.sql:51-99`
**Claim under test:** D11: "the definer buys something the interim could not… the route's own checks are no longer the only gate." Lens item 5: is anything formerly checked in the route now checked nowhere?
**What I found:** Nothing dropped. Route-side, steps 1-5 are byte-identical to main — `readableArtifact` (RLS + `hc.visible_at ≥ 'view'` + `deleted_at is null`) at `:52`, the independent `scan_verdict !== 'clean' || !storage_key` gate at `:56`, evidence-before-bytes ordering at `:59-64` with a failed log still returning 500, the service-role signed URL with its `error` **checked** at `:70`, and the pass-through headers. The only diff is the argument list and a log string.

Every check the deleted `lib/db/evidentiary.ts` performed has a counterpart inside `hc.log_artifact_read`:

| old `appendArtifactReadEntry` | `hc.log_artifact_read` |
|---|---|
| actor id supplied by caller (spoofable in principle) | `v_actor := hc.uid()` — not a parameter (`:56`) |
| `display_name … where deleted_at is null`, throw if missing | same, raises `artifact_refused` (`:66-72`) |
| circle/subject supplied by caller | re-read from the row (`:79-81`) |
| *(nothing)* | **new:** `deleted_at is null` + `hc.visible_at(…) >= 'view'` re-proven in-function (`:80-82`) |
| `hc.log(…)` chain append | identical call, `p_object_type => 'arrival'` (`:88-92`) |

The strengthening is real and the test at `tests/hc/artifacts.test.ts` counts `access_log` rows across a refused call rather than merely asserting a throw. `ReadableArtifact.circle_id`/`subject_id`/`byte_size` are now unread by the route — dead fields, not a dropped check.
**Failure scenario:** None found. Recorded so the lens item is answered rather than silently passed over.
**Confidence:** high.

---

### F-12 — I could not falsify "nothing else in 5B selects an ungranted column" — but the ADR's own verification method is not reproducible from the repo
**Severity:** OBSERVATION
**Where:** `docs/adr/0022-5b-app-extraction-deltas.md:465-471`
**Claim under test:** "**Nothing else in 5B selects an ungranted column**, verified against `information_schema.column_privileges`."
**What I found:** The claim holds. I enumerated it independently rather than trusting it.

`grep -rn "\.select(" app/ lib/` returns eleven call sites, all pre-existing except the three in the inbox:

| site | columns | table grant |
|---|---|---|
| `inbox/page.tsx:104` | `id, state, channel, sender_address, sender_display_name, auth_result, scan_verdict, received_at` + filters `circle_id, parent_arrival_id, deleted_at` + order `received_at` | all 12 in the 25-column grant ✓ |
| `inbox/page.tsx:123` | `id, parent_arrival_id, state` + same filters | ✓ |
| `inbox/page.tsx:171` | `subjects`: `id, first_name, forwarding_local_part, forwarding_active_at` | `subjects` has a **table-wide** grant (`20260815200003:135-137`) ✓ |
| `invite`, `tasks`, `timeline`, `upload`, `account`, `setup/*` | `subjects`/`tasks`/`timeline_events`/`accounts`/`circles` | all table-wide (`20260815230002:265-268`, `20260815200003:135`) ✓ |

Raw SQL on the request-role channel: `grep -rn "from public\." lib/hc/*.ts` returns three sites. `lib/hc/artifacts.ts:33-39` selects `circle_id, subject_id, storage_key, scan_verdict, mime_detected, byte_size` and filters on `id, deleted_at` — all granted. `ingest.ts:79` and `upload.ts:30` hit `subjects` (table grant). No `withRequestRole('anon', …)` path touches `arrivals`.

`grant select (` appears **exactly once** in the entire migration tree (`20260816010007_ingestion_rls.sql:29`), so `arrivals` is the only table where this class can bite at all.

**Failure scenario:** None — the claim is true as of HEAD. The observation is about durability, and the ADR itself flags it (§2: "the class of defect… has no test today at the DB layer"). Two things worth the owner's attention that the ADR does not say: (a) a pgTAP invariant over `column_privileges` closes the *DB* half but not the *app* half — the app-side denylist in F-4 is what would have to become an allowlist derived from the grant; and (b) any such invariant must cover `where`/`order` column references, not just target lists, per the live measurements in F-4.
**Confidence:** high — enumerated exhaustively, not sampled.

---

### F-13 — Dead `documents` scaffolding and one vacuous assertion left in the B6 test file
**Severity:** OBSERVATION
**Where:** `tests/routes/inbox.test.ts:50`, `:70`, `:73`, `:459`, `:481-489`
**Claim under test:** D9: "A test refuses stage-1 copy on a stage-2 row"; "A test drives a `nothing_filed` arrival and asserts no affordance renders." Both of those are genuinely present and correct (`:473-479` and `:491-497`).
**What I found:** Residue from the RED draft that did select the matched document. `let documents: Row[] = []` (`:50`), its reset (`:70`), and the `if (table === 'documents') return chain(documents)` branch (`:73`) are unreachable — the page never calls `.from('documents')`, which is the entire point of the fix. `:459` passes `duplicate_of_document_id: null` in a parent fixture the page cannot read. And `:481-489`, "the affordance never depends on naming the match", asserts the same two substrings as `:437-446` against the same fixture — a comment, not a test.
**Failure scenario:** None. The concern is the `documents` mock branch specifically: it is a live handler for a query the guard at `:405` cannot see (that guard checks `.select()` strings, and an embedded `documents(...)` or a separate `.from('documents')` read would be served fixtures by this branch and pass). Removing it would make the mock fail loudly on the one query shape most likely to reintroduce D15.
**Confidence:** high.

---

## R6 — the G9 corpus, the scorer, and the real-key harness

*Lens: `lib/eval/**`, `scripts/fixtures/g9-build.mjs`, `scripts/eval/run.ts`,
`docs/eval/g9-corpus-spec.md`, the §1.7 fences. Reported 17 findings
including two BLOCKERs, and closes with a direct answer to Q-G: this
reviewer would not sign bands against the apparatus as it stands.*

### F-1 — 8 of the 12 BLIND items contain no rendition of the values they are labelled with; every proposed recall floor in §6 is arithmetically unreachable
**Severity:** BLOCKER
**Where:** `scripts/fixtures/g9-build.mjs:393-413` (`paintRows`), `scripts/fixtures/g9-build.mjs:146` (`buildScannedPdf`), `docs/eval/g9-corpus-spec.md:165-178` (the proposed bands)
**Claim under test:** §1 — "the per-field precision/recall this corpus supports measures our extraction contract end to end **on material of known content**"; §4 — "Blind items labelling each banded field ≥ 3 / Distinct source types per banded field ≥ 2", asserted by `tests/eval/corpus.test.ts`.
**What I found:** the photo/scanned encoder never renders any glyph. `paintRows` uses `row.text` only for a rectangle width (`const bw = Math.max(4, Math.min(widthBlocks - LEFT * 2, Math.ceil(row.text.length / 2)))`), and the painter is a pure lookup of three flat levels:

```js
const level = (bx, by) => {
  for (const m of marks) { if (bx >= m.x && bx < m.x + m.w && by >= m.y && by < m.y + m.h) return INK; }
  if (by === 1 || by === heightBlocks - 2) return RULE;
  return BG;
};
```

I decoded `fixtures/g9/blind/blind-pill-01.jpg` through the project's own mupdf: **0 characters of text, 8 distinct gray levels** (226/150/34 plus rescale artefacts). By contrast `fixtures/g9/blind/blind-eob-01.pdf` yields 248 characters (`"EXPLANATION OF BENEFITS … Provider: Summit Orthopaedics …"`). So the labelled string `Elmwood Drug` exists in `corpus.json` and nowhere in the bytes the model is given.

Of the 12 blind items only 4 (`blind-discharge-01/02`, `blind-eob-01/02`, all `born_digital_pdf`) carry any readable rendition. Measured against the manifest:

| field | stated support / src types | **readable** support / src types | max achievable recall | proposed floor |
|---|---|---|---|---|
| document_date | 11 / 3 | 4 / 1 | 0.36 | 0.95 |
| provider | 11 / 3 | 4 / 1 | 0.36 | 0.90 |
| amount | 4 / 2 | 2 / 1 | 0.50 | 0.90 |
| policy_number | 4 / 2 | 2 / 1 | 0.50 | 0.90 |
| member_id | 4 / 2 | 2 / 1 | 0.50 | 0.90 |
| coverage_determination | 4 / 2 | 2 / 1 | 0.50 | 0.85 |
| medication_name | 6 / 3 | 2 / 1 | 0.33 | 0.95 |
| medication_dose | 6 / 3 | 2 / 1 | 0.33 | 0.95 |
| medication_frequency | 6 / 3 | 2 / 1 | 0.33 | 0.90 |
| allergy_substance | 5 / 3 | 2 / 1 | 0.40 | 0.95 |
| appointment_date | 4 / 3 | **1** / 1 | 0.25 | 0.90 |
| appointment_time | 4 / 3 | **1** / 1 | 0.25 | 0.90 |

The `≥ 2 source types` minimum that `tests/eval/corpus.test.ts:153-157` asserts is satisfied entirely by items on which extraction is impossible. Effective source-type coverage is **1** for every banded field.
**Failure scenario:** the owner funds a real Batch run. A perfectly compliant model — obeying `EXTRACT_SYSTEM_PROMPT`'s "If you cannot point to where a value appears, DO NOT RETURN IT" — returns nothing for the 8 image-only items and everything correctly for the 4 readable ones. Every field lands between 0.25 and 0.36 recall. Nothing clears any floor; the gate cannot be closed, and the run's cost buys no information about which fields are actually weak. The alternative outcome is worse: a model that guesses through the blank rectangles produces FPs (`row.fp++`, `score.ts:103`) and the run reports a precision collapse that describes the fixtures, not the pipeline.
**Confidence:** high. Confirmed by decoding two blind fixtures with the repo's own mupdf and by tabulating `fixtures/g9/corpus.json`. The one thing that would change the arithmetic is if §6's floors are meant to be read as "over readable items only" — nothing in §4, §6 or `score.ts` says so, and `run.ts:138` scores all 12.

---

### F-2 — The BLIND partition fence is bypassable through the unfenced corpus module: `itemsIn('blind')` is a public export
**Severity:** BLOCKER
**Where:** `lib/eval/corpus.ts:111-124`, `eslint.config.mjs:67-71`
**Claim under test:** D1 — "**The partitions are a property of the tree, not of anyone's discipline.** `lib/eval/blind` is §1.7-fenced to `scripts/eval/**` and `tests/eval/**`; the worker, the adapter, and even `tests/ai` cannot reach it."
**What I found:** `lib/eval/blind.ts` is a two-line wrapper — `export function blindCorpus(): CorpusItem[] { return itemsIn('blind'); }` — over an export of the module that is *not* fenced at all. `lib/eval/corpus.ts` exports both `itemsIn(partition: CorpusPartition)` and `corpusManifest()`, and the latter returns `{ … items: CorpusItem[] }` containing all 28 items with every label. The fence group is `["**/eval/blind", "**/lib/eval/blind"]`; no pattern names `lib/eval/corpus`.

I verified this against the real config with `eslint --stdin --stdin-filename`:

| probe, from `lib/ai/prompt.ts` | result |
|---|---|
| `import { blindCorpus } from '@/lib/eval/blind'` | **error** (fence fires) |
| `import type { CorpusItem } from '@/lib/eval/blind'` | **error** |
| `export * from '@/lib/eval/blind'` | **error** |
| `import { itemsIn } from '@/lib/eval/corpus'; export const x = () => itemsIn('blind')` | **clean** |
| `import { corpusManifest } from '@/lib/eval/corpus'; … .items.filter(i => i.partition === 'blind')` | **clean** |

The same probe from `app/(app)/page.tsx` is also clean (only an unused-var warning). The fence blocks the literal specifier and nothing behind it.
**Failure scenario:** during prompt iteration someone writes, in `lib/ai/prompt.ts` or a `tests/ai` helper, `const hard = corpusManifest().items.filter(i => i.labels.some(l => l.field === 'medication_dose'))` to assemble "every dose example we have". Eleven of those are blind items. The prompt is then tuned against the scored set, ESLint stays green, `npm run lint` passes, `tests/lint/db-fence.test.ts` passes (it only probes the literal `@/lib/eval/blind` specifier, lines 234-272), and the bands the owner later signs are measured on the development set — the exact failure the partition exists to prevent, reported as prevented.
**Confidence:** high. Reproduced against the checked-in `eslint.config.mjs`. The fix is mechanical (drop `itemsIn`/`corpusManifest` from the public surface of `corpus.ts`, or fence `**/eval/corpus` and give the development half its own wrapper), which is why I am filing it as a blocker rather than a design note.

---

### F-3 — `no-restricted-imports` does not cover dynamic `import()`; the tree already contains a fence-crossing dynamic import
**Severity:** MAJOR
**Where:** `eslint.config.mjs:126-143`, `node_modules/eslint/lib/rules/no-restricted-imports.js:816-823`, `scripts/bench/prf07.ts:147`
**Claim under test:** D1/§2 — the fence is "the mechanism"; a regression "fails CI rather than shipping".
**What I found:** the core rule's visitor registers only three node types:

```js
return { ImportDeclaration: checkNode, ExportNamedDeclaration(node) {…}, ExportAllDeclaration: checkNode };
```

There is no `ImportExpression` handler and no `CallExpression`/`require` handler. Confirmed empirically: `export async function x() { const m = await import('@/lib/eval/blind'); return m.blindCorpus(); }` from `lib/ai/prompt.ts` lints **clean**, while the static form errors.

This is not hypothetical in this repo: `scripts/bench/prf07.ts:147` does `const storage = await import('@/lib/storage/artifacts');`. `scripts/bench/**` has no exemption block in `eslint.config.mjs`, and `fenceStoragePlane` names `**/lib/storage/**` — the static form of that line would red. The harness family is already relying, deliberately or not, on the dynamic-import hole.
**Failure scenario:** any surface that wants the blind labels writes `await import('@/lib/eval/blind')` instead of a static import. Lint green, `db-fence.test.ts` green (it feeds static-import text), fence defeated. Combined with F-2 there are two independent bypasses of a control the ADR describes as structural.
**Confidence:** high. Verified against the installed ESLint rule source and by probe.

---

### F-4 — The harness writes a manifest the band loader can never accept: no `high`/`medium` per field, so the printed digest fails closed forever
**Severity:** MAJOR
**Where:** `scripts/eval/run.ts:234-255` and `:270-273`; `lib/extraction/bands.ts:42-49`, `:150-163`
**Claim under test:** D12 — the harness writes "an immutable manifest carrying the full configuration behind the public pair, and printing **the digest an owner allowlists at sign-off**"; `run.ts:273` prints "the same commit adds this digest to `BAND_ARTIFACT_ALLOWLIST` in `lib/extraction/bands.ts`".
**What I found:** the harness emits, per field, `{ precision, recall, support, tp, fp, fn }`. The loader requires, per field:

```js
if (!row || typeof row.high !== 'number' || typeof row.medium !== 'number' ||
    !(row.high > row.medium) || !(row.medium >= 0) || !(row.high <= 1)) {
  return allHigh('artifact_partial');
}
```

`high` and `medium` are the §6.4 rendering thresholds; the harness never produces them and nothing in the tree, the spec, or the ADR documents how they are derived from precision/recall. `BandArtifact` also declares `generated_at`, which the harness never writes (unchecked, so harmless). `tests/extraction/bands.test.ts:53` builds its fixture artifact **by hand** with `{ precision: 0.97, recall: 0.95, high: 0.85, medium: 0.6 }`, so the harness→loader seam is never exercised anywhere.
**Failure scenario:** the owner runs `--collect`, reads the table, signs the bands, and adds the printed sha256 to `BAND_ARTIFACT_ALLOWLIST` in the sign-off commit exactly as `run.ts:273` instructs. `loadBands` then returns `{ mode: 'all_high', reason: 'artifact_partial' }` on every request — the gate is "closed" in the ADR and open in the code, silently, because `artifact_partial` is indistinguishable from the shipping default at the call site. The only way out is to hand-edit the "immutable" manifest to add thresholds, which changes its digest and breaks the allowlist entry that was just signed.
**Confidence:** high. Both shapes read directly; the mismatch is unconditional.

---

### F-5 — "Every byte is generated by the builder" is verified by no test in CI
**Severity:** MAJOR
**Where:** `.github/workflows/ci.yml:67-68` and `:110-114`; `tests/eval/corpus.test.ts:50-66`; `scripts/fixtures/g9-build.mjs:1300-1320` (`--check`)
**Claim under test:** D1 — "every byte is generated by `scripts/fixtures/g9-build.mjs` from a spec table inside that script, so … 'never real family material' is true **by construction** rather than by promise."
**What I found:** CI runs `npm run test:app`, `npm run lint`, `npm run typecheck`, the DB suites and the upgrade leg. It does **not** run `node scripts/fixtures/g9-build.mjs --check`, which is the only thing that compares the tree against the spec table. `tests/eval/corpus.test.ts` asserts two weaker things: (a) each manifest item's bytes hash to the manifest's own `sha256`, and (b) each on-disk file appears in the manifest. Both are self-consistency checks against `corpus.json`, not against the builder.

I did run `--check` locally: `corpus matches the spec`, exit 0 — the corpus is currently regenerable and the builder is deterministic (no `Date`, no `Math.random`, no env reads, forward-slash manifest paths, sorted-by-construction output). The defect is that nothing keeps it that way.
**Failure scenario:** a contributor replaces `fixtures/g9/blind/blind-note-01.jpg` with a photograph of a real prescription label — the exact thing the corpus exists to make impossible — and updates that item's `sha256` and `bytes` in `corpus.json` so the two agree. `tests/eval/corpus.test.ts` passes all 16 assertions. `npm run lint` and `npm run typecheck` pass. Nothing in CI notices; the drift is only visible to a human running `--check` by hand, or reading a 58 KB binary diff (which `.gitattributes` correctly marks `binary`, so the diff shows nothing). "True by construction" reduces to "true if someone remembers to run the checker."
**Confidence:** high. `--check` is documented in `docs/eval/g9-corpus-spec.md:220` and absent from `ci.yml`; I read both.

---

### F-6 — The eval scores raw model output; the worker's `validateFacts` drop is never applied, so the reported numbers are better than the pipeline delivers
**Severity:** MAJOR
**Where:** `scripts/eval/run.ts:218-227` vs `lib/ai/extract.ts:57-103`, `:141`
**Claim under test:** `scripts/ts-run.mjs:6-12` and D12 — "§6.10 only means something if the eval sends what the WORKER sends"; `run.ts:63-68` — "the eval measures what production sends".
**What I found:** the harness's collect path is:

```js
const parsed = JSON.parse(text) as { facts?: Array<{ field: string; value: string }> };
predictions.push({ itemId: result.custom_id, facts: (parsed.facts ?? []).map((f) => ({ field: f.field, value: f.value })) });
```

Production does not do that. `extractFromArrival` runs `validateFacts(data.facts, input.pages.length)`, which **drops** any fact whose `field` is not in the catalogue, whose value exceeds `P5_CAPS.maxValueBytes`, whose `confidence` is outside [0,1], or — the load-bearing one — whose citation names a page this rendering does not have or a bbox that does not fit inside the page. It also truncates at `P5_CAPS.maxFacts`.

So the eval measures the request shape faithfully (I compared block assembly line-by-line against `extractFromArrival`; `operatorNotes` is `[]` at `app/api/worker/[stage]/route.ts:323`, so its omission is not a divergence) and then scores a *different object* than the one the pipeline publishes.
**Failure scenario:** the model returns `{"field":"medication_dose","value":"20 mg","confidence":0.9,"citation":{"page":2,"bbox":[…]}}` for `blind-discharge-01`, a one-page render. The eval normalises `"20 mg" === "20 mg"` and books a **true positive**; `medication_dose` reports 1.00 precision and 1.00 recall. In production `validateFacts` drops that fact (`citation.page <= Math.max(1, pageCount)` fails), the family never sees the dose, and real recall is 0. The bias is one-directional and in the unsafe direction: hallucinated-citation facts and over-cap facts inflate the eval and are invisible in the pipeline. `dropped` is counted in production as a §10.4 signal (`extract.ts:59`) and is not measured by the gate at all.
**Confidence:** high. Both code paths read in full; the omission is unconditional.

---

### F-7 — The fixture server can answer from BLIND labels: `matchItem` iterates the whole manifest with no partition filter
**Severity:** MAJOR
**Where:** `scripts/ai-fixture-server.mjs:43-46` (`loadCorpus`), `:84-99` (`matchItem`), `:119-146` (`extractionAnswer`)
**Claim under test:** D13 and §2 — the fixture server is a *development-partition* consumer (`g9-corpus-spec.md:51`); the fence means "a prompt cannot be tuned against the scored set by accident".
**What I found:** `loadCorpus` reads `fixtures/g9/corpus.json` whole — all 28 items — and `matchItem` scans `for (const item of corpus.items)` with only `expected_outcome !== 'extracted' || labels.length === 0` as a filter. Partition is never consulted. `extractionAnswer` then returns `item.labels.filter(l => text.includes(l.value))` verbatim, complete with the corpus's own `citation: { page, bbox }`.

The `.mjs` also sits outside the fence family entirely — it reads the manifest as data, so no import restriction applies to it at all.

Today no caller sends it a blind item (`prf07.ts:61-66` uses four `dev-*` cohorts), so this is a latent leak rather than an active one, and the Batch-API shape means an accidental `--submit` against it dies at `--collect` (`processing_status !== 'ended'` → exit 1). But the guarantee the ADR states is structural, and here it is not: one line — `if (item.partition !== 'development') continue;` — is missing, and the whole point of D1 is that this kind of thing is not left to a caller's choice of item id.
**Failure scenario:** an e2e or worker test is written against a blind item for coverage reasons (nothing prevents it: `corpusItem('blind-eob-01')` is reachable per F-2 and lints clean). The fixture server answers it with a perfect, perfectly-cited set of facts, the test goes green, and the "happy path" the gate stack demonstrates is self-fulfilling on scored material.
**Confidence:** high for the code fact; medium for the exploit path, since it requires someone to name a blind id — which F-2 makes easy and nothing blocks.

---
### F-8 — The matcher is exact string equality after `lower(btrim())`; several banded fields have failure modes on both sides
**Severity:** MINOR
**Where:** `lib/eval/score.ts:59-62`, `:100-105`
**Claim under test:** §6 proposes 0.85–0.98 precision floors, with `coverage_determination` noted as "Free text; **normalisation is the hard part**, not reading".
**What I found:** the rule is exactly `value.trim().toLowerCase()` and nothing else, applied as `===`. This is defensible — `EXTRACT_SYSTEM_PROMPT` says "Quote the document's own value. Do not normalise, convert, round, expand an abbreviation", and I verified every blind label is a verbatim substring of its own document line — but the concrete failure set is real:

- **Dates.** Label `2026-01-08` (`blind-eob-01`). `January 8, 2026` → both FP and FN. Under-reports.
- **Amounts.** Label `$64.25`. `64.25` (currency symbol dropped) → both FP and FN. And `blind-eob-01` deliberately carries `$1,274.00` on a second line as the adjudicated-away candidate, so the field is one comma from a 0.00.
- **Free text.** `coverage_determination` labels are `Covered in network` / `Partially covered`. `covered, in network` or `in-network` → miss. §6 asks the owner to sign 0.90 precision on a field whose scoring is a string compare.
- **Punctuation.** `Denied — out of network` (dev partition) contains U+2014; a hyphen mismatches.
- **Times** survive: `10:15 AM` → `10:15 am` matches after lowercasing.

Over-loose failure is not present — the matcher errs strict throughout.
**Failure scenario:** a model that reads every document correctly but writes dates in prose scores 0.00 on `document_date` — the field with the widest support (11) and the tightest recall floor (0.95). The owner reads that as "the pipeline cannot read dates" and holds a shippable field back, or (worse) the number is reconciled by loosening the matcher after the fact, which is how a band gets tuned to the answer.
**Confidence:** high on the rule; medium on the impact, since the prompt's verbatim instruction does most of the work on this corpus.

---

### F-9 — The "no global number" property is real in the emitted object and one line of arithmetic away in the artifact
**Severity:** MINOR
**Where:** `lib/eval/score.ts:39-57`, `:116-128`; `scripts/eval/run.ts:241-253`
**Claim under test:** D12 and `score.ts:10-12` — "This module therefore emits no global figure at all — **not even as a convenience, because a convenience is what gets quoted.**"
**What I found:** literally true — `RunScore` has no aggregate field, and `tests/eval/score.test.ts:135` pins `expect(result).not.toHaveProperty('precision')`. But `FieldScore` exports `tp`, `fp`, `fn` per field and `run.ts` writes all three into the signed artifact, so `Σtp / (Σtp + Σfp)` is a micro-averaged global precision available to any reader of the artifact — including a spreadsheet at a sign-off meeting. The absence is a stylistic guard, not a structural one; the ADR's framing ("emits no global number at all") reads stronger than what the artifact permits.
**Failure scenario:** cannot construct a code-level failure — the numbers are correct and per-field, and publishing tp/fp/fn is right (it is what makes `support` auditable). Downgraded accordingly. The finding is that D12's claim should be stated as "reports no global number", because the artifact does not prevent one.
**Confidence:** high.

---

### F-10 — Expected labels collapse last-wins, predictions collapse first-wins: a repeated field silently under-counts support
**Severity:** MINOR
**Where:** `lib/eval/score.ts:83-91`
**Claim under test:** `support` is "How many blind items labelled this field — the n behind the numbers" (`score.ts:48-49`), the n the owner reads when judging how much a 1.00 is worth.
**What I found:** the two maps disagree on which duplicate survives:

```js
for (const labelled of item.labels) expectedByField.set(labelled.field, labelled.value);   // LAST wins
…
if (!producedByField.has(fact.field)) producedByField.set(fact.field, fact.value);          // FIRST wins
```

`support` is then incremented once per item per field, so an item with two `medication_name` labels contributes 1 to support and scores only the second one. No current blind item repeats a banded field, so nothing is wrong today — but a two-medication discharge summary is the most obvious next spec row (§7 prices exactly that growth), and it would silently halve the corpus's own claimed support while scoring the wrong one of the pair.
**Failure scenario:** cannot construct one against the corpus as built; it is a latent defect that fires on the first multi-valued item. The asymmetry is undocumented and the two halves are three lines apart, which is what makes it worth recording.
**Confidence:** high on the code; the scenario is prospective by construction.

---

### F-11 — `absent_fields` is never read by the scorer, and the artifact carries rows for fields nobody proposed bands on
**Severity:** MINOR
**Where:** `lib/eval/score.ts:93-113`; `scripts/fixtures/g9-build.mjs:1233` (`absentBandFields(labelled)`)
**Claim under test:** §5 — "**Negative examples** are the recall half. A banded field is listed in an item's `absent_fields` when the document genuinely does not carry it"; the manifest's `blind_negatives_per_field` minimum.
**What I found:** `scoreRun` never touches `item.absent_fields`. A produced-but-unlabelled field is booked FP by the `else if (produced !== undefined)` branch regardless of whether the corpus actually claims absence. That is currently equivalent for banded fields — the builder's `absentBandFields(labelled, except = [])` declares *every* unlabelled banded field absent, so the corpus is never silent about one — but it is not equivalent for the ~15 non-banded catalogue fields (`patient_name`, `claim_number`, `medication_route`, …), which are neither labelled on every item nor listed in `absent_fields`. `bump(field)` creates a row for any field the model names, so those rows land in the signed artifact next to the banded ones.
**Failure scenario:** the model returns `medication_route: "by mouth"` for `blind-discharge-03` (scanned; `dischargeLines`' route line is not in its row set). The scorer books an FP for a field the corpus makes no claim about, and the artifact grows a `medication_route` row with `precision: 0` that no band covers. `loadBands` ignores it (`bands.ts:150` iterates `BAND_FIELDS`), so the harm is to what a person reads at sign-off, not to the loader.
**Confidence:** high.

---

### F-12 — "THIS IS THE ONLY REAL-KEY PATH IN THE PROJECT" is not accurate: `lib/ai/client.ts` reads `ANTHROPIC_API_KEY`
**Severity:** OBSERVATION
**Where:** `scripts/eval/run.ts:8-11`; `lib/ai/client.ts:78-90`
**Claim under test:** D12 — "The G9 harness is the SOLE real-key path"; `run.ts:8` — "THIS IS THE ONLY REAL-KEY PATH IN THE PROJECT."
**What I found:** a repo-wide `git grep ANTHROPIC_API_KEY` returns six sites. Four are literal non-credentials (`playwright.config.ts:73`, `scripts/bench/prf07.ts:348`, `tests/ai/adapter.test.ts:37/43`), one is the harness's guard (`run.ts:158`), and one is `lib/ai/client.ts:79` — `const apiKey = process.env.ANTHROPIC_API_KEY ?? ''`, the production adapter the worker route dispatches through. In a deployed environment that is, necessarily, a real key. The correct statement is "the only path in this repository that is ever *run* against a real credential today, and the only one that ever touches the corpus" — which is what the surrounding prose means and not what the sentence says.
**Failure scenario:** none technical. It is a documentation-precision issue on a sentence a reviewer is being asked to rely on: read literally, it asserts the deployed worker does not hold a credential.
**Confidence:** high.

---

### F-13 — `--dry-run` genuinely cannot send; the manifest records no endpoint
**Severity:** OBSERVATION
**Where:** `scripts/eval/run.ts:53-61`, `:142-165`, `:109-123`
**Claim under test:** D12 — "`--dry-run` does everything except the credential — verified 12/12 requests build, nothing sent."
**What I found:** verified. `parseArgs` tests `--dry-run` **first**; the dry-run branch builds every request and `return`s at line 155, strictly before the `if (!process.env.ANTHROPIC_API_KEY)` check at 158 and before `new Anthropic()` at 165. I ran it: `12/12 requests build; NOTHING was sent.` A mistyped flag (`--dryrun`) matches nothing and falls to `console.error(usage); process.exit(2)` — it cannot silently send. The only foot-gun is `--submit --dry-run=true`, where the malformed flag is ignored and `--submit` wins; that requires typing both.

The gap worth recording: `manifestSkeleton()` captures `model_id`, `prompt_version`, `configuration_hash`, the full `configuration`, `corpus_partition` and `sdk_version` — but **not `ANTHROPIC_BASE_URL`**. A run is therefore not self-describing about which endpoint answered it. In practice `scripts/ai-fixture-server.mjs` does not speak the Batch API (`--submit` would print `batch undefined` and `--collect` would exit 1), so the accidental-fixture-run scenario dies before writing an artifact — which is why this is an observation and not a finding.
**Failure scenario:** none constructible against the current fixture server. Recording the base URL in the manifest costs one line and closes the question for any future fixture that does speak Batch.
**Confidence:** high; the dry-run behaviour is confirmed by execution, the Batch-shape mismatch by reading `scripts/ai-fixture-server.mjs`'s single `messageEnvelope` response path.

---

### F-14 — `tests/eval/corpus.test.ts`'s manifest-completeness walk is genuinely exhaustive
**Severity:** OBSERVATION
**Where:** `tests/eval/corpus.test.ts:40-47`, `:59-66`
**Claim under test:** D1 — "`tests/eval/corpus.test.ts` additionally asserts the manifest IS the corpus — every file under `fixtures/g9` is a manifest item — so there is no unlabelled second fixture world."
**What I found:** I tried to defeat it and could not. `walk` recurses on `statSync(full).isDirectory()` and `readdirSync` returns dotfiles, so a `.hidden.pdf` at any depth is caught. Only the exact relative path `corpus.json` is exempted, so a directory named `corpus.json/` or a `development/corpus.json` is caught. A manifest item with a partition other than `development`/`blind` drops out of `all` and its on-disk file fails `claimed.has(file)`. A `file` escaping the root (`development/../../x.pdf`) passes the `startsWith` check at line 86 but breaks `expect(onDisk.length).toBe(claimed.size)`. Case differences on Windows are preserved by `path.relative` and caught. An empty directory contributes nothing and passes silently — harmless.

The only file that can be added without failing this test is one that is also added to the manifest with a matching digest — which is precisely F-5.
**Failure scenario:** none. Recorded as a verified positive, so the finding list is not read as blanket doubt.
**Confidence:** high.

---

### F-15 — `ts-run.mjs`: no request-shape divergence attributable to the runner; two behavioural gaps worth naming
**Severity:** OBSERVATION
**Where:** `scripts/ts-run.mjs:33-64`, `scripts/ts-resolve-hook.mjs:38-54`; `vitest.config.ts:9-16`
**Claim under test:** D12/`ts-run.mjs:6-12` — the runner exists so "the eval sends what the worker sends".
**What I found:** the runner reproduces the two things that matter. `@/…` resolution tries `.ts`, `.tsx`, bare, `/index.ts`, `/index.tsx` — the same order `moduleResolution: "bundler"` with `paths: {"@/*": ["./*"]}` yields, and the same shape `vitest.config.ts` gets from its `@` alias. `server-only` is stubbed to `data:text/javascript,export{};`, matching `tests/setup/server-only-stub.ts`. Everything under `lib/` that the harness pulls is plain ESM-compatible TypeScript, so Node 22.15's stripping suffices; the dry-run ran clean end to end, including mupdf.

Two gaps I could not turn into a defect but would not want unstated:
1. The hook returns URLs without a `format`, leaving module-kind to Node's detection. `package.json` has no `"type": "module"`, so `.ts` files are ESM only by content detection. It works today; it is an implicit dependency on `--experimental-detect-module` semantics, on a flag the file itself notes is experimental.
2. Under `ts-run` the harness loads `@anthropic-ai/sdk` through Node's `node`/`import` conditions; the worker loads it through Next 16's bundler and its `react-server` condition. I could not find a request-serialisation difference between the two entry points, so I am not claiming one.

The actual "the eval sends what the worker sends" defect is not in the runner — it is F-6, in what the eval does with the answer.
**Failure scenario:** none constructible; downgraded to observation.
**Confidence:** medium — I verified resolution behaviour by execution and by reading both configs, but I did not diff the SDK's condition-resolved entry points byte for byte.

---

### F-16 — Re-collecting a batch crashes on `flag: 'wx'` after the results have been consumed
**Severity:** MINOR
**Where:** `scripts/eval/run.ts:125-134`, `:199-234`
**Claim under test:** D12 — "EVERY RUN WRITES AN IMMUTABLE MANIFEST."
**What I found:** `writeFileSync(file, json, { flag: 'wx' })` is the right immutability mechanism, but it fires *after* `client.messages.batches.results(batchId)` has been streamed and `scoreRun` has completed. A second `--collect` on the same id throws `EEXIST` out of `main()` with no handler, after the API round-trip. There is no `--out` override and no "already collected, here it is" path.
**Failure scenario:** the owner runs `--collect abc123`, the terminal scrolls, they re-run to re-read the table. The process throws an unhandled `EEXIST` and prints no scores; the numbers are only recoverable by opening `eval/runs/abc123.json` by hand. Minor, but this is the one command in the project that costs money to produce and it has no idempotent read.
**Confidence:** high.

---

### F-17 — The PDF writer silently truncates non-Latin-1 text; no blind label is affected today
**Severity:** OBSERVATION
**Where:** `scripts/fixtures/g9-build.mjs:53-55` (`esc`), `:65-70` (`assemblePdf`'s `Buffer.from(body, 'latin1')`)
**Claim under test:** D1 — the PDF writer produces "a real Helvetica text layer, so born-digital fixtures have the text layer §6.3 passes alongside the page images".
**What I found:** `esc` escapes only `\`, `(`, `)`, and every string reaches the file through `Buffer.from(str, 'latin1')`, which truncates each code unit to its low byte. `dev-discharge-02`'s line `Re-issued at the family's request.` contains U+2019, which lands in the PDF as byte `0x19` — an undefined WinAnsi glyph. `dev-angled-01`'s `Denied — out of network` (U+2014 → `0x14`) is a *label value*, but that item is a photo, so it is painted as a rectangle rather than written as text. I checked every born-digital label value in both partitions: all are ASCII, so no scored label is currently corrupted.
**Failure scenario:** the next spec row with an en dash, a curly quote or an accented provider name in a born-digital PDF gets a label the document does not contain, and that field scores 0 with no visible cause. A `throw` on any code point > 0xFF in `esc` would make it a build failure instead of a silent one.
**Confidence:** high on the mechanism; the current corpus is clean, hence observation.

---

### R6's judgment on Q-G

**No. I would not sign confidence bands against this apparatus as it stands**, and the reason is not the limits §1 and §7 state — it is a limit they do not state.

§1 and §7 are, on their own terms, unusually honest documents. Naming the corpus as a contract test rather than a vision test, pricing corpus growth in the same table as what it buys, and saying out loud that "a measured 1.00 means 'no error in a handful of tries'" is better discipline than most eval suites carry. If the corpus were what §1 describes, I would sign floors with a stated wide interval and require the §10.4 live signals to narrow them.

But §1 describes material that does not exist. It says the corpus measures "our extraction contract end to end **on material of known content**." The content is known to `corpus.json`; it is not in the material. Eight of twelve blind items are flat gray rectangles with zero glyphs (F-1) — the labelled string is in the manifest and nowhere in the bytes. That is a different claim from "not a test of the model's handwriting vision." It means those items are pure recall sinks, and it means the §4 minimums the corpus test enforces — ≥3 blind items and ≥2 source types per banded field — are satisfied by items on which extraction is impossible. Real coverage is 1 source type and 1–4 items per field, and every recall floor §6 proposes is unreachable by arithmetic, before a single request is sent. A gate that cannot be passed is not a conservative gate; it is a gate that will be argued around at the meeting where it fails.

Second, the partition discipline that gives the numbers their meaning is not structural. `blindCorpus()` is a wrapper over `itemsIn('blind')`, exported from an unfenced module that any file in the tree may import (F-2), and dynamic `import()` walks past the fence entirely (F-3). "A property of the tree, not of anyone's discipline" is exactly what it is not. Nothing in the tree suggests anyone *has* tuned against the blind set — but the whole argument for trusting these bands is that we would not have to take that on trust.

Third, even a clean run cannot close the gate: the harness writes an artifact the band loader rejects as `artifact_partial` on every field (F-4), and the eval scores facts the pipeline would drop (F-6), biasing the numbers upward in the direction that matters — a hallucinated citation is a true positive to the scorer and an invisible non-event to the family.

What I would require before signing, in order:

1. **Blind items whose bytes actually contain their labels.** Either render text into the JPEG/scanned path, or shrink the blind set to items that carry a readable rendition and restate §4's support table against *that* number. If the honest answer is 4 readable born-digital items, §4 should say 4 and §6's floors should be withdrawn until §7's row 1 or row 2 is bought. I would rather sign a floor against an honest n=2 than a floor against a stated n=6 that is really n=2.
2. **A fence that holds.** Remove `itemsIn`/`corpusManifest` from `lib/eval/corpus`'s public surface (or fence `**/eval/corpus` and give the development half its own accessor), and add an `ImportExpression` check — the existing `db-fence.test.ts` harness can drive both. Add `if (item.partition !== 'development') continue;` to the fixture server's `matchItem`.
3. **`g9-build.mjs --check` as a CI step.** It exists, it passes, it takes seconds, and it is the only thing standing between "generated by construction" and "generated, we're fairly sure."
4. **One end-to-end seam test** that takes the harness's real manifest shape through `loadBands` and asserts what comes out — plus a documented derivation of `high`/`medium` from the measured precision/recall, because right now no one has written down how a signed number becomes a threshold.
5. **`validateFacts` applied in `--collect`**, so the scored object is the published object.

Items 2–5 are days of work on a codebase that is otherwise carefully built. Item 1 is the owner call §7 already prices, and it is the one that decides whether this gate produces a number worth a family's trust. Until it is answered, the correct posture is the one the code already ships: `BAND_ARTIFACT_ALLOWLIST` empty, all-high-risk, nothing pre-selected.

---

## R7 — governance conformance: bounds, plan rows, coverage, the inherited obligations

*Lens: the packet, ADR-0022, `docs/review/slice-5-plan.md`, `docs/coverage.md`,
ADR-0019/0020/0021, ADR-0006, and the TSD sections the packet names.
Reported 14 findings including two BLOCKERs, and closes with a position
on each of Q-A through Q-H.*

### F-1 — The `mupdf` dependency is AGPL-3.0-or-later, and no governance document anywhere says so
**Severity:** BLOCKER
**Where:** `package-lock.json` (`node_modules/mupdf` → `"license": "AGPL-3.0-or-later"`); `docs/review/slice-5-plan.md:130–141` (the Q3 argument); `docs/adr/0022-5b-app-extraction-deltas.md:16–20`
**Claim under test:** Q3 SETTLED: "**Both dependencies approved as argued**". The plan argues `mupdf` on capability grounds only — "the §6.3 rasterizer … in one zero-native-dep package" — and prices the alternatives (`pdfium` bindings, `pdfjs-dist` + canvas) on packaging and platform, never on licence. The packet and ADR both record the bound as cleanly honoured: "exactly the two Q3-approved runtime packages".
**What I found:**
```
$ node -e "console.log(require('./node_modules/mupdf/package.json').license)"
AGPL-3.0-or-later
$ grep -rn -i "agpl|licen[cs]e" docs/ --include=*.md
docs/PRD.md:1322:| **12.1** | **Local resources data.** Licensed directory, ... |
```
That PRD row is about a resources directory, not about dependencies. Across `docs/review/slice-5-plan.md`, `docs/adr/0022-*.md`, `docs/review/round-16-packet.md`, `docs/review/5b-build-kickoff.md` and `docs/ops/ai-provider.md` there are 20 mentions of `mupdf` and **zero** mentions of its licence. `mupdf` is imported directly by `lib/pipeline/render.ts:2` — server-side, in the request path of a hosted service. AGPL §13's network clause is the term that matters for a SaaS; Artifex dual-licenses MuPDF precisely because of it. The recorded alternatives are both permissive (`pdfjs-dist` Apache-2.0; PDFium BSD-3), so the licence question is a *differentiator* between the options the plan priced, and it was priced out of the comparison silently.
**Failure scenario:** The owner ratified a dependency bound believing the only open question was whether the spike falsified the package. A future reader of ADR-0022 reads "exactly the two Q3-approved runtime packages" and concludes the dependency posture is fully governed. It is not: the product may be obliged to offer Corresponding Source to every family that interacts with it over the network, or to buy a commercial licence from Artifex — a decision with cost and IP consequences that has never reached the owner, and that gets harder to reverse with every slice built on `lib/pipeline/render.ts`.
**Confidence:** High on the fact (the licence string is in the lockfile and the installed package). High that it is unrecorded. Medium on the legal consequence — confirmed by counsel or by an Artifex commercial-licence quote; either way the *governance* defect (a material term absent from a bound the owner approved) stands independently.

---

### F-2 — The BLIND partition is not fenced from the fixture server; Q5's "read by scored eval runs ONLY" is deviated from, and D1 claims the opposite
**Severity:** BLOCKER
**Where:** `scripts/ai-fixture-server.mjs:84–98`; `lib/eval/corpus.ts:126–129`; `docs/adr/0022-5b-app-extraction-deltas.md:51–58`
**Claim under test:** Q5 SETTLED requires "a **BLIND EVALUATION partition** … read by scored eval runs ONLY — never by prompt development". ADR-0022 D1 asserts this is achieved structurally: "**The partitions are a property of the tree, not of anyone's discipline.** `lib/eval/blind` is §1.7-fenced to `scripts/eval/**` and `tests/eval/**`; the worker, the adapter, and even `tests/ai` cannot reach it."
**What I found:** The fence is an ESLint `no-restricted-imports` rule over the *module path* `**/eval/blind`. The corpus itself is a plain JSON file, and the shipped fixture server — the adapter's counterparty in vitest *and* in the local gate, i.e. exactly the prompt/schema-iteration surface — loads it directly and iterates **every** item with no partition filter:
```js
// scripts/ai-fixture-server.mjs:44
const file = path.join(root, 'fixtures', 'g9', 'corpus.json');
// :84
function matchItem(corpus, text) {
  for (const item of corpus.items) {
    if (item.expected_outcome !== 'extracted' || item.labels.length === 0) continue;
```
`blind-*` items are `expected_outcome: "extracted"` with labels, so they are live match candidates. Nothing in the ESLint config reaches a `readFileSync` of a JSON path. `lib/eval/corpus.ts:126–129` compounds it by asserting the false half in a docstring: "The development partition: worker/adapter tests, **the fixture server**, prompt and schema iteration. Never the scored set." The fixture server does not use `lib/eval/corpus.ts` at all.
**Failure scenario:** A developer tuning the extraction prompt against the fixture server can — with no lint error, no test failure, no reviewer signal — feed blind material and read back blind labels. When the owner later signs bands at the G9 gate, they will believe those numbers were measured on a set the prompt never saw. The whole point of Q5's partition ruling is that the reported bands are not measured on their own development set; today that is a convention, and ADR-0022 tells the owner it is a structure. (No current test or gate leg *does* feed blind material — the breach is of the guarantee, not of the current tree.)
**Confidence:** High. Confirmed by reading the fixture server and the ESLint config; a one-line partition filter in `matchItem`, or a manifest split into two files, would close it.

---

### F-3 — "8/8 legs PASS" includes one leg that cannot fail, and it is the leg whose plan criterion is not met
**Severity:** MAJOR
**Where:** `scripts/spike/mupdf-spike.mjs:142–171`; `docs/review/round-16-packet.md:25,105`; `docs/adr/0022-5b-app-extraction-deltas.md:71–80,89–93`
**Claim under test:** The packet records the B2 spike twice as "**8/8 legs PASS** — `SPIKE VERDICT: mupdf carries §6.3`", and both the packet and ADR use that verdict to conclude "the spike did not falsify `mupdf`" and therefore "the spike-contingent runtime reserve is **NOT consumed**". The plan's B2 row names the leg: "malformed/truncated PDFs **refuse cleanly**".
**What I found:** `leg(n, name, fn)` marks `ok: true` unless `fn` throws (`:39–48`). Seven of the eight legs contain `assert()` calls. Leg 5 contains **none** — it is a `try/catch` that assigns a descriptive string on either branch and returns it:
```js
leg(5, 'malformed / truncated PDF refuses cleanly', () => {
  ...
  outcome = `REPAIRED rather than refused: countPages=${pages}` + ...
  } catch (err) { outcome = `openDocument threw: ${err.message...}`; }
  return outcome;
});
```
So leg 5 passes unconditionally, and it passed while recording that the plan's criterion is false: mupdf repairs a truncated PDF and hands back a real document with real pages, which the pipeline then renders and dispatches. ADR D2 discloses the behaviour honestly ("The plan's leg expected a clean refusal; what mupdf does is repair the xref") but scores it as a pass and argues it as "safer than a crash".
**Failure scenario:** A future reader sees "8/8 PASS" and treats the spike as having exhaustively cleared the package against the plan's own criteria. It did not: one criterion was silently redefined from "refuses cleanly" to "does not crash", and the redefinition is the only reason the leg passes. The Q3 reserve-not-consumed conclusion — a bound-consumption decision — rests on that count. Separately, "malformed input is repaired and processed rather than refused" is a hostile-input posture change that no coverage row records.
**Confidence:** High. Re-running the spike with `assert(threw, ...)` in leg 5 would show 7/8 with leg 5 FALSIFIED.

---

### F-4 — §6.3's email row was truncated in the as-built record; email-body facts cite a page that is never rendered, and the BLIND partition contains no email item
**Severity:** MAJOR
**Where:** `lib/pipeline/render.ts:16,154–166`; `lib/ai/extract.ts:78–80`; `docs/eval/g9-corpus-spec.md:80`; `docs/coverage.md:416` (RND-01, green)
**Claim under test:** TSD §6.3's normative table, row 4: "| Email body | **Text, with the rendered message as a second source** | — |". RND-01 is flipped green as "§6.3 rendering rules as code … the table row by row". Nothing in the packet's exclusion list mentions email rendering.
**What I found:** `render.ts`'s header docstring reproduces §6.3's table with the second half of row 4 deleted, and presents the altered table as the rule:
```
 *   | email body                      | text (no page images)    | —         |
```
The code matches the altered row (`:154–166`): `pages: []`, `text` only. The corpus spec propagated the same truncation (`§3`: "`email_body` | 1 | 0 | §6.3 row 4: **text first**"), while the corpus manifest itself preserved the full clause — `fixtures/g9/corpus.json`, `dev-email-01.notes`: "An email body: text first, **the rendered message as a second source** (§6.3 row 4)."
Three consequences, none recorded anywhere:
1. `validateFacts(raw, input.pages.length)` (`lib/ai/extract.ts:78–80`) has an explicit branch — "pageCount 0 means a text-only source: page 1 is the only legal page" — and then *requires* a 4-number normalised `bbox`. So every email-body fact is stored with `{page:1, bbox:[…]}` **against a rendering that was never produced and never promoted**. §6.4's "a citation resolves against the rendered page, which is the artifact the review screen shows and the artifact the crop is cut from" is unsatisfiable for that whole source class, and PRD §6.4's high-risk rule ("the crop must be rendered and on screen before the approve control becomes active") therefore cannot be met for it in slice 6.
2. The G9 corpus's labels for `dev-email-01` carry line-fraction bboxes on page 1 — ground truth that assumes the rendering the renderer does not make.
3. The BLIND partition has **zero** email items:
```
blind source types: ["born_digital_pdf","scanned_pdf","photo_jpeg"]
dev source types:   ["born_digital_pdf","photo_jpeg","email_text","scanned_pdf"]
```
The spec explains why five hostile classes are development-only; it gives no reason for `email_body`'s blind count of 0, and §4's per-field support table lists no email source type for any banded field.
**Failure scenario:** This is the deliverable that is in neither the delivered set nor the named-exclusion set. A future reader of RND-01 and the corpus spec concludes §6.3 was implemented row by row and that the G9 bands cover the product's source types. Neither is true for **email — the channel the forwarding address exists to serve**. Slice 6 will discover mid-build that it has no artifact to crop for email arrivals, and the owner will sign bands at G9 that were measured on zero email evidence.
**Confidence:** High on all three facts. Confirmed by reading `render.ts`, `extract.ts`, the spec, and the manifest partition counts.

---

### F-5 — "§6.6's 'checked, not assumed' is implemented as MEASUREMENT" — the measurement is returned to nothing
**Severity:** MAJOR
**Where:** `docs/adr/0022-5b-app-extraction-deltas.md:163–169`; `lib/ai/client.ts` (`ProviderUsage`); `docs/coverage.md:417` (AIA-01, green)
**Claim under test:** ADR D4: "**§6.6's 'checked, not assumed' is implemented as MEASUREMENT.** The adapter carries `usage.cache_creation_input_tokens` and `cache_read_input_tokens` back on every call, **so whether the record prefix actually cached is observed.**" AIA-01's coverage cell repeats it: "the cache telemetry carried back so §6.6's 512-token minimum is **MEASURED not assumed**."
**What I found:** Nothing reads it.
```
$ grep -rn "cacheReadInputTokens|cacheCreationInputTokens" --include=*.ts --include=*.tsx --include=*.mjs .
lib/ai/client.ts (binary — the definition)
tests/ai/adapter.test.ts:252-253:  expect(result.usage).toHaveProperty(...)
tests/routes/worker-extract.test.ts:132,133,175,176  (fixture values)
tests/routes/worker-interpret.test.ts:130,131         (fixture values)
```
`app/api/worker/[stage]/route.ts` never touches `answer.usage`; nothing persists it, logs it, or compares it to 512. The only production assertion is `toHaveProperty` — that a field exists. The build's own honest record is elsewhere: `docs/ops/ai-provider.md:92` carries `SMOKE-6` as an **unchecked pre-activation box** — "§6.6's 512-token minimum CHECKED against the real tokenizer, not assumed | ☐". So the checklist correctly defers the check, while the ADR and the coverage row tell the owner it is already implemented.
**Failure scenario:** This is prose doing work the code is not. A future reader — or the owner at the G9/G3 gate — believes cache behaviour is being observed in production and that §6.11's cost model ("interpretation … record context largely cache-read at ~0.1×") rests on evidence. It rests on a value that is computed and discarded. If the prefix never caches, interpretation costs ~10× the modelled figure and nothing in the system says so.
**Confidence:** High. A single `console`/telemetry write or a threshold assertion would make the claim true; today there is neither.

---

### F-6 — Q-D's recommended answer rests on a premise the shipped schema contradicts: reaching `extract_timeout` needs no DDL
**Severity:** MAJOR
**Where:** `docs/review/round-16-packet.md` Q-D; `docs/adr/0022-5b-app-extraction-deltas.md` D14.3; `app/api/worker/[stage]/route.ts:264–273`; `supabase/migrations/20260816010009_round7_fixes.sql:63`; `supabase/migrations/20260816010001_pipeline_tables.sql:45`
**Claim under test:** Q-D: "**Recommended: ACCEPT, and record it.** … Making the state reachable means teaching exhaustion which failure was last — **DDL on `hc.stage_budgets`**, and a more complicated exhaustion contract for a distinction the family never sees."
**What I found:** Both halves of the vocabulary are already shipped and already granted:
```sql
-- 20260816010009_round7_fixes.sql:63
('extract',   'extracting',   'extract_timeout'),
-- 20260816010001_pipeline_tables.sql:45
('provider_timeout',  'The provider call exceeded the stage wall clock'),
```
`extracting → extract_timeout` is a legal edge in `hc.arrival_transitions`, and `provider_timeout` is a seeded `reason_code`. The app can call `advanceArrival(id,'extracting','extract_timeout',lease,'provider_timeout')` today. `grep -rn "provider_timeout" app/ lib/ tests/ e2e/ scripts/` returns **nothing** — the code is simply never called. Worse, the case that most obviously *is* a timeout is currently mislabelled: `render.ts` refuses with `reason: 'wall_clock'` (`:157,205,216,242`) and `normalizeExit` maps every refusal — wall clock included — to `{ state: 'extract_failed', reason: 'archive_bounds_exceeded' }` (`route.ts:271`). So a render that ran out of wall clock is recorded as an archive-bounds failure, not as the timeout state 4A shipped for exactly it.
**Failure scenario:** The owner is asked to accept a permanent gap on the stated grounds that closing it costs a migration and a "more complicated exhaustion contract". It costs neither. If Q-D is accepted as recommended, a shipped, granted, tested state and a shipped reason code stay dead indefinitely, and the operational tier keeps calling a wall-clock timeout an archive-bounds breach — which also weakens Q-B's separate case, since Q-B and Q-D are two symptoms of the same unmapped refusal set.
**Confidence:** High. The migration rows are quoted above from the tree the packet certifies as byte-identical to main.

---

### F-7 — `lib/ai/client.ts` contains a raw NUL byte, so git treats it as binary: it is invisible to diff review and excluded from the gitleaks patch scan
**Severity:** MAJOR
**Where:** `lib/ai/client.ts` byte 3613 (line 80); `.github/workflows/ci.yml:19–23`; `docs/review/round-16-packet.md:103`
**Claim under test:** The packet's evidence block records "| gitleaks | CI's secret-scanning step, success |" as one leg of the one-SHA block, and the kickoff directs the reviewer to push hardest on "`tests/ai/adapter.test.ts` — … that `maxRetries: 0` is argued rather than accidental".
**What I found:** The diffstat reports the module as binary:
```
$ git diff --stat a9d9f43..dd8a895 -- lib/ai/client.ts
 lib/ai/client.ts | Bin 0 -> 7268 bytes
```
The cause is one literal NUL used as a cache-key separator:
```js
const key = `${baseURL} ${apiKey}`;   // written as a raw 0x00, not an escape
```
```
$ tr -d -c '\000' < lib/ai/client.ts | wc -c
1
$ git check-attr -a lib/ai/client.ts
lib/ai/client.ts: text: auto
```
Two consequences. (a) The single most G3-relevant file in the slice — the one that constructs the provider client, reads `ANTHROPIC_API_KEY`, sets `maxRetries: 0`, and decides what is and is not on the wire — **does not appear in any `git diff` or PR review surface**. (b) CI runs `gitleaks detect -s /repo`, i.e. git-history mode over `git log -p` patches; binary files produce "Binary files differ" with no content lines, so this file's contents are not scanned. The packet's gitleaks leg therefore does not cover the file that handles the API key.
**Failure scenario:** A reviewer following the kickoff's instructions cannot see the code they are told to interrogate. A secret pasted into this file at any future point passes CI's secret scan silently. The fix is one character (`\0` or ` ` as an escape), which restores both diffability and scanning.
**Confidence:** High on the NUL, the binary classification, and the diff invisibility. Medium-high on the gitleaks consequence — confirmed by running `gitleaks detect` vs `gitleaks detect --no-git` and comparing findings on a seeded secret in this file.

---

### F-8 — The one-SHA evidence block's CI-sourced legs cite a run three commits behind the evidence head, and a green run at the actual PR head goes uncited
**Severity:** MINOR
**Where:** `docs/review/round-16-packet.md:33–35, 98, 103`
**Claim under test:** The block is headed "*(Recorded at the evidence head — the last commit moving a non-docs tree. Anything after it is `docs/` only.)*" with the evidence head declared as `fa90d6e`. Two legs inside it are sourced from CI: "pgTAP · concurrency · db:verify · upgrade leg | **CI, run `32618352675`, all steps success**" and "gitleaks | CI's secret-scanning step, success".
**What I found:** Run `32618352675` is at `2b6ca52`. Two commits that move non-docs trees land *after* it:
```
fa90d6e  e2e/extraction.spec.ts, e2e/ingestion.spec.ts   (+ docs)
103be52  app/…/inbox/page.tsx, e2e/, scripts/, tests/     (+ docs)
```
So the gitleaks leg presented as "recorded at `fa90d6e`" was in fact run before `app/`, `e2e/`, `scripts/` and `tests/` last moved. Independently, the public API shows a run the packet never mentions:
```
id 32620532301  head_sha dd8a895…  completed  success
```
CI **is** green at the PR head — the substance is fine; the packet under-cites its own strongest evidence and over-attributes a stale run to a later SHA.
**Failure scenario:** The one-SHA block is the mechanism the whole review cadence trusts. If a leg inside it can be sourced from a SHA three commits back without saying so, the block stops meaning "all of this was true at once" and a future reader cannot tell which legs actually bind. Here it is harmless; the precedent is not.
**Confidence:** High — both run IDs and their head SHAs verified against the anonymous GitHub API.

---
### F-9 — The head ledger's last row misstates what moved after the evidence head
**Severity:** MINOR
**Where:** `docs/review/round-16-packet.md:37`
**Claim under test:** "| Review head | the docs-only commits after it (**ADR-0022, this packet, the round-16 kickoff**) | `docs/` only — the per-directory binding transfers the evidence |"
**What I found:**
```
$ git diff --name-only fa90d6e..dd8a895
docs/coverage.md
docs/review/round-16-kickoff.md
docs/review/round-16-packet.md
```
ADR-0022 is named but did **not** move after the evidence head — it was created at `103be52` and amended at `fa90d6e`, both non-docs commits. `docs/coverage.md` **did** move after the evidence head and is not named — and the change was substantive: it is the commit that rewrote DUP-02 and UXA-02 from "copy citing the FILED document by title and filed date" to "the copy says WHY … not WHICH document". The `dd8a895` commit message ("ADR-0022, the round-16 packet, and the round-16 review kickoff") also omits the coverage edit.
**Failure scenario:** A future auditor reconstructing the F12 binding from the ledger would look for a coverage flip at `2b6ca52` and find a coverage row that no longer says what CI validated there, with no ledger row explaining the gap. The F12 binding still holds (docs-only), so nothing is broken — but the ledger stops being a reliable index of what changed when, which is its only job.
**Confidence:** High.

---

### F-10 — DUP-02's coverage status reads `green` while its own evidence cell says the B6 row is "partially met"
**Severity:** MINOR
**Where:** `docs/coverage.md:415`
**Claim under test:** The packet promises the partial is "**recorded as such**, not quietly declared done."
**What I found:** It is recorded — in prose, at the end of a 900-character evidence cell: "B6's 'cites the matched FILED document' is therefore **partially met and recorded as such**, pending one line of DDL". But the row's **Status** column, the field every scan and summary reads, is the bare word `green`. Compare the two rows that got this right in the same table: EVA-01's status column carries its caveat inline — "green (harness + corpus + spec; **the G9 GATE ITSELF IS OPEN** …)" — and PRF-07's reads "green (report-only, as ruled)". DUP-02 had the same option and did not take it.
**Failure scenario:** A reader scanning the Status column — the intended use of a status column — sees an unqualified `green` on a row whose product behaviour is one DDL line short of its plan text. If Q-A is deferred rather than taken, that mismatch persists across slices with nothing but a buried sentence marking it.
**Confidence:** High. The remedy the same document already uses twice: `green (stage-2 copy partially met — see Q-A)`.

---

### F-11 — "24/24 UNCHANGED holds" is asserted about a suite with an amended leg, and a gate test title still claims a citation the product cannot make
**Severity:** MINOR
**Where:** `docs/review/round-16-packet.md:316` and the gate table above it; `e2e/extraction.spec.ts:253`
**Claim under test:** The plan's B9 row and the completion recipe require "walkthrough 11/11 + a11y 5/5 + ingestion 8/8 re-run **UNCHANGED**". The packet's gate table is honest in the cell ("UNCHANGED in count; ONE leg amended, argued below") and then states in bold: "**24/24 UNCHANGED holds**".
**What I found:** The bold sentence is the one a reader carries away, and it is not what the plan asked for — the plan's criterion is about the legs, not their count. The amendment itself is well argued (the cancel leg's assumption was the seam 5B closed) and I do not dispute accepting it; I dispute stating the plan criterion as met. Separately, the new gate leg's title still advertises a capability D15 removed:
```js
test('the stage-2 pair: suspected, cited, and both resolutions live (DUP-02)', ...)
```
Its body asserts `'already filed for this person'` and `.provenance` count 1 — it never checks a document title or filed date, and a comment three lines below says naming the matched document "needs a column grant `authenticated` does not hold".
**Failure scenario:** "24/24 UNCHANGED" plus a green leg named "…cited…" is the shape a future reader uses to conclude B6's citation shipped. Both statements are individually defensible and jointly misleading.
**Confidence:** High.

---

### F-12 — Q-H's "~40 lines" names one of two files totalling 126
**Severity:** OBSERVATION
**Where:** `docs/adr/0022-5b-app-extraction-deltas.md:378`; `docs/review/round-16-packet.md` Q-H; `scripts/ts-run.mjs`, `scripts/ts-resolve-hook.mjs`
**Claim under test:** "`scripts/ts-run.mjs` is ~40 lines over Node 22's own type stripping, adding only the `@/` alias and a `server-only` no-op."
**What I found:**
```
  64 scripts/ts-run.mjs
  62 scripts/ts-resolve-hook.mjs
 126 total     (74 non-comment, non-blank)
```
The resolve hook — the half that actually implements the alias and the `server-only` shim — is never named in the ADR or the packet. The size is still small and the argument for not spending the reserve still holds; the figure quoted to the reviewer is roughly a third of the artefact.
**Failure scenario:** Q-H asks the reviewer to weigh ~40 lines of bespoke tooling against a maintained package. The honest input to that trade is 126 lines across two files, one of them a `module.register` resolver hook — a category of code that breaks on Node minor upgrades.
**Confidence:** High.

---

### F-13 — Six new transitive runtime packages arrive with the SDK, and `zod` flips `dev` → `devOptional`
**Severity:** OBSERVATION
**Where:** `package-lock.json` diff `a9d9f43..dd8a895`
**Claim under test:** "**Dependency bound:** 2 runtime deps of the 2 approved … The dev-dependency reserve is **UNSPENT**."
**What I found:** The direct-dependency bound is honoured exactly — two runtime additions, zero devDependency additions, and no `overrides`/`resolutions` block exists in `package.json` at either end. The transitive tail is worth naming: `@babel/runtime`, `json-schema-to-ts`, `ts-algebra`, `standardwebhooks`, `@stablelib/base64`, `fast-sha256` all enter the **production** tree via `@anthropic-ai/sdk`. Two of them (`standardwebhooks`, `fast-sha256`) exist to verify provider webhooks, a feature this product does not use. Separately `zod` flips `"dev": true` → `"devOptional": true`, meaning the SDK's optional peer is now being satisfied by a dev-tree copy; `grep -rn "from 'zod'" lib/ app/ scripts/` returns nothing, so no runtime path depends on it and `npm ci --omit=dev` is safe today.
**Failure scenario:** None immediate. Recorded because "two runtime deps" is the sentence the owner will remember, and the production dependency surface actually grew by eight packages including a webhook-signature library — relevant to the same supply-chain reasoning that made the Postmark/clamd zero-dep precedent worth having.
**Confidence:** High.

---

### F-14 — Two items from the plan's own "What stays out, named" list are absent from the packet's exclusion list
**Severity:** OBSERVATION
**Where:** `docs/review/slice-5-plan.md:365–374` vs `docs/review/round-16-packet.md` "What this round does NOT cover"
**Claim under test:** The packet's exclusion list is presented as complete: "What this round does NOT cover (**named, per the plan**)".
**What I found:** Cross-checking the plan's list item by item, ten of twelve are carried across. Two are not named anywhere in the packet: **ARC validation** (slice-4 Q5 — G7) and **the D11/finding-2 hop-binding code tightening** ("a pre-activation G7 hardening, available not required"). Both are arguably swept up by the packet's "G3's four terms, G4's deploy rows, **G7's hardening set** — all deploy-level, all on their checklists", but neither is named, and the plan named them individually precisely so they would not dissolve into a category. ADR-0021's recorded observation 2 (conflict replay is narrower than full request equivalence, "recorded here so the question is findable when the 5B approval surface is built") is likewise not carried forward — defensibly, since the approval surface is slice 6's, but the packet does not say so.
**Failure scenario:** Items that survive by being named in a list stop surviving when the list summarises them. Low risk here — both have live checklist homes — but the packet's claim of completeness against the plan is not quite true.
**Confidence:** High on the omissions; medium on whether they matter, since "G7's hardening set" plausibly covers both.

---

### R7's positions on Q-A – Q-H

**Q-A — the column grant, and a pgTAP grant invariant.** **Agree on the grant; amend the framing, and take the second half too.** Spending an owner bound-amendment on one line of DDL is the right call, but not for the reason given. The packet argues it as "a shipped feature half-built for a slice" — a product-completeness argument, which is the weaker one. The real argument is that the *cause* is still live: 5A M5 added a column to a table with a 25-of-28 column-level grant and nothing re-pinned it, and the only reason anyone knows is that a browser leg went red. Deferring means shipping a slice knowing the grant list and the table have drifted, which is a correctness fact about the permission model, not a copy nicety. Extending by one column rather than replacing with a table grant is plainly right — `duplicate_of_arrival_id`, the lease pointer and the idempotency key are withheld on purpose. On the second half: **yes, and it belongs in the same disposition, not a later one.** But specify it properly, because "every column a member surface selects" is not mechanically knowable from the DB — the select lists live in TypeScript string literals. The pgTAP invariant that *is* mechanical, and that would have caught this, is the inverse: assert that the column-grant set on each member-readable `public` table equals a checked-in expected set, so **any** future migration that adds a column to `public.arrivals` reds until someone decides whether members may read it. That is the `hc.log_event_types` / ING-10 exact-set pattern this project already uses everywhere, applied to `information_schema.column_privileges`. Pair it with the app-side guard the fix already added (asserting on the SELECT string), and the class is closed from both ends. One caveat the packet should carry: the regression guard as built asserts on a select *string*, which will not survive the select list being refactored into a constant — the pgTAP pin is what makes it durable.

**Q-B — `render_bounds_exceeded`.** **Disagree with QUEUE; amend to take it with Q-A.** The recommendation is priced as "a more accurate operational label for a full migration evidence leg" — but Q-A is already opening a migration, and F-6 shows the same mapping site has a second, worse defect in it: a wall-clock render refusal is currently recorded as `archive_bounds_exceeded`, which is not merely imprecise but categorically wrong. The bounds refusals are four distinct causes (`page_bound`, `page_dimensions`, `wall_clock`, `output_size`) collapsed onto one code that describes none of them. If the amendment is being spent anyway, adding one `reason_codes` row is an insert into a seed table with a pgTAP exact-set re-pin — the 2A M6 / 4A M6 pattern, already routine here — and it costs the same evidence leg Q-A's grant costs. Queueing it means the operational tier lies about the most common hostile-input outcome for at least another slice.

**Q-C — `hc.extractions_for(p_arrival)`.** **Agree, with one amendment to the record.** The behaviour is genuinely correct: re-normalising and re-reading the document is the same source material, the operator note says the facts were absent, and nothing is silently degraded. Queue the definer. The amendment is that the ADR frames the cost as merely "more expensive for image-only sources" — for a re-queued interpret it also means a **second provider dispatch** of full-resolution page images for a document that has already been read once, under G3's cost and retention posture, on a path (sweeper rescue, resolved stage-2 duplicate) that fires without a person asking for it. That is worth one sentence in the record so the queue item is priced honestly when the next DB-opening slice ranks it.

**Q-D — `extract_timeout` unreachable.** **Disagree.** See F-6. The recommendation's load-bearing premise — "Making the state reachable means teaching exhaustion which failure was last — DDL on `hc.stage_budgets`" — is false against the tree the packet certifies. `('extract','extracting','extract_timeout')` is already a legal edge and `provider_timeout` is already a seeded reason code; the app can reach the state today with no DDL at all. And the case that most deserves it is already mis-mapped: `render.ts`'s `wall_clock` refusal lands `extract_failed`/`archive_bounds_exceeded`. I would not accept the gap; I would map the wall-clock refusal to `extract_timeout`/`provider_timeout` as an app-layer fix (red→green, inside every bound), and keep the exhaustion contract exactly as it is. The packet is right that the family never sees the difference — but "the family never sees it" is an argument about copy, not about whether the operational tier should record what happened, and this project has consistently ruled the other way (`scan_infected` never collapsed with `scan_unavailable` is the same distinction).

**Q-E — proposals carry no `source_extraction_ids`.** **Agree, unreservedly.** This is the one deferral in the set that is a genuine design choice rather than a gap. The consumer does not exist, the shape depends on what the review screen needs, and `hc.write_proposals` passing them through verbatim means the seam is already in the right place. Guessing now would mint a column that gets rebuilt. Accept for slice 5 and let slice 6 specify it.

**Q-F — the fixture server cannot prove vision.** **Agree on the split; the argument is sound and the implementation is not.** The reasoning is exactly right: making the fixture server "recognise" images would require it to render and hash the corpus, which is a second source of truth about what a document says — Q5's rejected second fixture world in a new costume. Ratify the design. But the ratification should be conditional on F-2: the fixture server as built reads `fixtures/g9/corpus.json` directly and matches against **all 28 items including the blind partition**, so the partition discipline that makes this split safe is a convention, not the structure D1 claims. Fix the fixture server to filter to `partition === 'development'` before ratifying, and the answer to Q-F becomes true as stated.

**Q-G — the corpus measures the contract, not the vision.** **Agree, with one addition to the limits the owner is being asked to accept.** Ratifying the spec as written and treating corpus growth as a G9-gate decision is right, and §1 and §7 are unusually honest — stating "a measured 1.00 means no error in a handful of tries" before anyone can quote it is the correct instinct. The addition: §7 prices three growth options and none of them is the one F-4 exposes. The BLIND partition contains **zero email-body items**, so no banded field has any email evidence at all, and §3's table records the `0` without the explanation it gives for the five hostile classes. Email is the forwarding-address channel — the product's primary intake. Before the owner signs bands, the spec should either add blind email items or state plainly, in §1's limits, that the signed bands do not cover email bodies. That is a one-line spec change and a builder spec row; it should not wait for the gate.

**Q-H — the TypeScript runner instead of a dev-dependency.** **Agree, with the figure corrected.** The reasoning is the strongest in the packet: the reserve is one slot held for review dispositions, and spending it before the review would pre-empt exactly this round. Ratify. Two corrections for the record: it is 126 lines across two files, not "~40 lines" in one (F-12), and the unnamed half is a `module.register` resolver hook — the component most likely to break on a Node upgrade. Given F-1 and Q-A both plausibly want the reserve this round, I would not spend it on a TS runner; I would spend it on nothing, keep `ts-run.mjs`, and add the resolve hook to the ADR's description so the next session knows what it is maintaining.

---
