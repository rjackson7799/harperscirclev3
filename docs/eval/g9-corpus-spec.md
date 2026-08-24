# The G9 corpus spec — labels, partitions, minimum support, and the bands the owner signs

**Status:** the corpus and this spec are BUILT (slice-5 plan B1, Q5
SETTLED). **The G9 GATE ITSELF IS NOT CLOSED**: it closes when the owner
signs the per-field acceptance bands below, against a completed eval run
on the BLIND partition — before any real document reaches a provider,
never quietly. Until then the shipping default is **all-high-risk**
(TSD §6.5), and B4 loads bands only from an allowlisted eval artifact
whose configuration hash matches the running `(model_id,
prompt_version)` — a missing, stale, altered or partial artifact fails
closed to all-high.

**Authority:** TSD §6.10 (the evaluation set), §6.4 (our own citation
geometry), §6.5 (risk is not confidence) → PRD §6.4 (the bands as
product law; the high-risk field list), Appendix B (never a real
family's record, at any stage) → `docs/review/slice-5-plan.md` B1.

---

## 1. What the corpus is, and what it is not

`fixtures/g9/` is **one governed corpus with two consumers and immutable
partitions.** Every byte of it is produced by
`scripts/fixtures/g9-build.mjs` from a spec table inside that script, so
the material is reviewable as data rather than as an opaque blob drop —
and "never real family material" is true **by construction**, not by
promise. Re-running the builder is idempotent; `--check` verifies the
tree against the spec without writing.

It is **not** a rendering-quality corpus and does not pretend to be. The
photo-class fixtures are synthetic pages of dark blocks on a light
field: real JPEG framing, real EXIF, real geometry, decoded losslessly
by an ordinary decoder — which is what the pipeline's *machinery* legs
need (resolution rules, orientation-before-geometry, bbox round-trip,
the hostile ceilings). What they are not is a test of the model's
handwriting vision. **That limit is stated here rather than discovered
at the gate**: the per-field precision/recall this corpus supports
measures our extraction contract end to end on material of known
content; it does not measure Opus 5's OCR of a real pill bottle. If the
owner wants the second thing before signing bands, the corpus needs
photographed material that is *synthetic but genuinely photographic*
(printed synthetic documents, photographed) — an owner call, priced at
the G9 gate, not a build decision.

**RESTATED AT THE ROUND-16 SIGN-OFF** (owner ruling 2026-08-23; the
finding is ADR-0023 D11, the ruling is D24). The paragraph above
understates the limit, and the difference is the whole gate. The
photo-class encoder never renders a **glyph** — `paintRows` uses a row's
text only to SIZE a rectangle — so for those items the labelled value is
known to `corpus.json` and is **not present in the material at all**. A
model reading the bytes perfectly cannot return it. Measured through the
project's own `mupdf`, over the BLIND partition (page 1, `DeviceGray`):

| blind items | extractable characters | distinct gray levels |
|---|---|---|
| 4 born-digital PDF | 204–253 | 235–242 — antialiased glyphs |
| 1 scanned PDF | **0** | 40 |
| 7 photo JPEG | **0** | **7–8** — flat 8×8 blocks |

**Eight of twelve blind items carry no rendition of the values they are
labelled with.** §4 and §6 below are therefore stated against the
**READABLE SET** — the four that do — and the numbers they previously
stated (11 supporting items for `document_date`, 6 for
`medication_dose`) counted *labels*, not renditions. An honest n = 2
beats a stated n = 6 that is really n = 2; §7 prices buying the
difference, and buying it is a separate, deliberate owner decision.

---

## 2. The two partitions, and why the split is structural

| Partition | Items | Read by | Reached through |
|---|---|---|---|
| `development` | 16 | worker + adapter tests · the fixture server · prompt and schema iteration | `lib/eval/corpus.ts` |
| **`blind`** | 12 | **scored eval runs ONLY** | `lib/eval/blind.ts`, §1.7 import-fenced to the harness |

The fence is the mechanism. Nothing under `app/`, `lib/ai/`, or the
worker tests can import `lib/eval/blind`; ESLint reds and
`tests/lint/db-fence.test.ts` drives the rule through the ESLint API, so
a regression fails CI rather than shipping. Nothing here is secret — the
blind partition is checked in and reviewable. What the fence buys is
that **a prompt cannot be tuned against the scored set by accident**,
which is the exact failure Q5 rejected when it refused a second,
unlabelled fixture world.

`tests/eval/corpus.test.ts` additionally asserts that every file under
`fixtures/g9` is a manifest item: there is no third, unlabelled corpus.

---

## 3. Document classes

PRD §6.4 names the representative material; §4.3 and §6.8 name the
outcomes the pipeline must survive. Both live in the one corpus.

| Class | development | blind | Why it exists |
|---|---|---|---|
| `discharge_summary` | 3 | 3 | §6.4's first named class; born-digital and scanned |
| `eob` | 2 | 3 | The insurance/financial field family |
| `pill_bottle` | 1 | 2 | §6.3's never-downsampled row |
| `handwritten_note` | 1 | 2 | §6.3's never-downsampled row |
| `phone_photo_angled` | 1 | 2 | EXIF orientation 6 — geometry against the image **as displayed** |
| `email_body` | 1 | 0 | §6.3 row 4: text first |
| `injection_probe` | 1 | 0 | INJ-01 — extracts normally; §4.10's blast radius is a proposal |
| `refusal_probe` | 1 | 0 | §6.8 — HTTP 200 with `stop_reason: "refusal"` |
| `encrypted_pdf` | 1 | 0 | §4.3 normalize → `needs_password` |
| `undecodable` | 1 | 0 | §4.3 normalize → `unsupported_type` |
| `malformed_pdf` | 1 | 0 | Truncated mid-object: refuse cleanly |
| `pixel_bomb` | 1 | 0 | 30000×30000 declared in a few hundred bytes |
| `page_bomb` | 1 | 0 | 250 pages against PRD §13.3's 200-page bound |

The five hostile/limits classes are **development-only on purpose**:
they are not scored material, and scoring precision on a file that never
reaches the model would be meaningless.

---

## 4. Minimum support per field × source type — stated, and asserted

The manifest carries the minimums; `tests/eval/corpus.test.ts` asserts
the corpus against them, so this section cannot drift into aspiration.

| Minimum | Value |
|---|---|
| Blind items labelling each banded field | **≥ 3** |
| Distinct source types per banded field | **≥ 2** |
| Blind negative examples per banded field (field genuinely absent) | **≥ 1** |
| Adjudicated ambiguous labels per partition | **≥ 1** |

### 4.1 As built — LABELLED support

Every row here is true of `corpus.json`, and every row was, until the
round-16 review, taken to be the corpus's support. **It is not.** A label
records what the item IS; it does not establish that the item CONTAINS a
rendition a reader could return. Kept, because these are the numbers a
grown corpus has to reach.

| Banded field | Blind support | Source types | Blind negatives | Dev support |
|---|---|---|---|---|
| `document_date` | 11 | born-digital PDF, photo JPEG, scanned PDF | 1 | 9 |
| `provider` | 11 | born-digital PDF, photo JPEG, scanned PDF | 1 | 10 |
| `amount` | 4 | born-digital PDF, photo JPEG | 8 | 3 |
| `policy_number` | 4 | born-digital PDF, photo JPEG | 8 | 3 |
| `member_id` | 4 | born-digital PDF, photo JPEG | 8 | 3 |
| `coverage_determination` | 4 | born-digital PDF, photo JPEG | 8 | 3 |
| `medication_name` | 6 | born-digital PDF, photo JPEG, scanned PDF | 6 | 5 |
| `medication_dose` | 6 | born-digital PDF, photo JPEG, scanned PDF | 6 | 5 |
| `medication_frequency` | 6 | born-digital PDF, photo JPEG, scanned PDF | 6 | 5 |
| `allergy_substance` | 5 | born-digital PDF, photo JPEG, scanned PDF | 7 | 4 |
| `appointment_date` | 4 | born-digital PDF, photo JPEG, scanned PDF | 8 | 3 |
| `appointment_time` | 4 | born-digital PDF, photo JPEG, scanned PDF | 8 | 3 |

### 4.2 As built — READABLE support, which is what a run can demonstrate

**This is the table that governs.** Support counts an item only when the
labelled value is actually rendered in the bytes the model receives —
measured, not declared, by `tests/eval/corpus.test.ts` driving the
pipeline's own `normalizeArrival`. The readable blind set is four items,
**all born-digital PDF**: `blind-discharge-01`, `blind-discharge-02`,
`blind-eob-01`, `blind-eob-02`.

`max recall` is arithmetic, not a prediction: it is the best a flawless
reader could score, because the remaining supporting items contain
nothing to read.

| Banded field | Readable blind support | Source types | Readable negatives | **max recall** |
|---|---|---|---|---|
| `document_date` | 4 | 1 | 0 | **0.36** |
| `provider` | 4 | 1 | 0 | **0.36** |
| `amount` | 2 | 1 | 2 | **0.50** |
| `policy_number` | 2 | 1 | 2 | **0.50** |
| `member_id` | 2 | 1 | 2 | **0.50** |
| `coverage_determination` | 2 | 1 | 2 | **0.50** |
| `medication_name` | 2 | 1 | 2 | **0.33** |
| `medication_dose` | 2 | 1 | 2 | **0.33** |
| `medication_frequency` | 2 | 1 | 2 | **0.33** |
| `allergy_substance` | 2 | 1 | 2 | **0.40** |
| `appointment_date` | 1 | 1 | 3 | **0.25** |
| `appointment_time` | 1 | 1 | 3 | **0.25** |

### 4.3 The minimums are NOT met, and that is the honest statement

Against §4.2, and stated plainly rather than left to be discovered at the
gate:

- **≥ 3 blind items per banded field** — met by two fields of twelve
  (`document_date`, `provider`, at exactly 4). Ten fields sit at 1 or 2.
- **≥ 2 distinct source types per banded field** — met by **nothing**.
  Effective source-type coverage is **1** (born-digital PDF) for every
  banded field. §4.1's second column was satisfied entirely by items on
  which extraction is impossible.
- **≥ 1 blind negative per banded field** — met by ten of twelve;
  `document_date` and `provider` have none within the readable set.
- **≥ 1 adjudicated ambiguous label per partition** — met, unaffected.

**The consequence, which is the point of restating this:** no floor in
§6 is arithmetically reachable, so **the G9 gate cannot be closed as this
corpus stands** — not because the pipeline is bad, but because the
apparatus cannot measure it. `BAND_ARTIFACT_ALLOWLIST` stays EMPTY and
every field ships all-high-risk (§6.5's shipping default) until §7 row 1
or row 2 is bought deliberately. A gate that cannot be passed is not a
conservative gate; it is a gate that gets argued around at the meeting
where it fails, and this section exists so that meeting starts from the
arithmetic instead.

**The honest reading of these numbers.** Four supporting items is enough
to catch a field the pipeline cannot read at all; it is **not** enough to
distinguish 0.90 precision from 0.95 — and two is not enough to catch
much of anything. §6 therefore states bands as *floors with a stated
confidence limit* AND with the measurable ceiling beside them, and §7
states what growing the corpus would buy — an owner call, priced, at the
gate.

---

## 5. Negative examples, and adjudicated ambiguity

**Negative examples** are the recall half. A banded field is listed in an
item's `absent_fields` when the document genuinely does not carry it,
and the test refuses an item that both labels and disclaims the same
field. `blind-note-02` is undated on purpose — a real negative for
`document_date`, which is the case a date extractor hallucinates through.
`blind-angled-02` names no pharmacy — a real negative for `provider`.

**Ambiguity is adjudicated, not averaged.** Where a document supports two
defensible readings, the item carries an `ambiguous` entry with both
candidates, the adjudicated answer, and the rationale:

| Item | Field | Candidates | Adjudicated | Rationale |
|---|---|---|---|---|
| `dev-discharge-01` | `medication_dose` | `500 mg` · `500 mg per tablet` | `500 mg` | The label states the strength; "per tablet" is the packaging unit, which belongs to the value only when the document gives no plain strength |
| `blind-eob-01` | `amount` | `$64.25` · `$1,274.00` | `$64.25` | The family-facing amount is what the member may owe, not what the provider billed; the billed total is a separate line the schema does not ask for |

The adjudicated value is the one scored. The rejected candidate is kept
in the manifest so a future disagreement argues against a recorded
decision rather than re-deciding blind.

---

## 6. The proposed per-field acceptance bands — FOR OWNER SIGN-OFF

These are **proposals**. Nothing in the code reads them until the owner
signs and an eval run writes the artifact B4 matches against.

Per §6.10 the report is **per-field precision and recall, never one
global number**, keyed `(model_id, prompt_version)`.

**RESTATED AT THE ROUND-16 SIGN-OFF** against §4.2's readable set (owner
ruling 2026-08-23; ADR-0023 D11/D24). The floors are unchanged — they are
what the *product* requires — but each now carries the **ceiling this
corpus can demonstrate**, and where the ceiling is below the floor the
row is **UNSIGNABLE**: no eval run over this corpus can produce a number
that clears it, so signing it would be signing an arithmetic
impossibility. Every row is unsignable today. That is a statement about
the apparatus, not about the pipeline.

| Field | Class | Proposed precision floor | Proposed recall floor | Max recall (§4.2) | Signable? |
|---|---|---|---|---|---|
| `medication_name` | high | 0.98 | 0.95 | 0.33 | **NO** |
| `medication_dose` | high | 0.98 | 0.95 | 0.33 | **NO** |
| `medication_frequency` | high | 0.95 | 0.90 | 0.33 | **NO** |
| `allergy_substance` | high | 0.98 | 0.95 | 0.40 | **NO** |
| `member_id` | high | 0.95 | 0.90 | 0.50 | **NO** |
| `policy_number` | high | 0.95 | 0.90 | 0.50 | **NO** |
| `coverage_determination` | high | 0.90 | 0.85 | 0.50 | **NO** |
| `provider` | high | 0.95 | 0.90 | 0.36 | **NO** |
| `amount` | high | 0.95 | 0.90 | 0.50 | **NO** |
| `appointment_date` | high | 0.95 | 0.90 | 0.25 | **NO** |
| `appointment_time` | high | 0.95 | 0.90 | 0.25 | **NO** |
| `document_date` | standard | 0.95 | 0.95 | 0.36 | **NO** |

The per-field notes the floors were argued from stand unchanged: a wrong
`medication_name` is the worst single failure available here, and the
§6.4 crop-on-screen rule holds for `medication_dose` regardless of any
band; `policy_number`, `provider`, `amount` and `document_date` are also
M5 stage-2 key fields, where a wrong value mis-files a duplicate;
`coverage_determination` is free text, where normalisation is the hard
part, not reading.

**Three things the owner is being asked to accept, explicitly:**

1. **A band clearing does not lower a field's risk class.** Every field
   above except `document_date` is high-risk by §6.4 *regardless of
   confidence*: never pre-selected, crop on screen before approve
   activates. Bands govern the confidence *rendering* (§6.4's three
   bands), not the risk class. Signing these does not turn medication
   dose into a one-tap field.
2. **The confidence-band thresholds stay PRD §6.4's** — high ≥ 0.85,
   medium 0.60–0.85, low < 0.60 — until an eval run gives per-field
   evidence to move them. This spec proposes *acceptance floors for
   shipping a field at all*, which is a different question from where
   the rendering bands sit.
3. **Statistical honesty.** With **1–4 readable** blind items per field
   (§4.2 — not the 4–11 this section used to claim), a measured 1.00
   means "no error in one or two tries", not "≥ 0.98 in the world".
   Signing these bands signs a **floor the pipeline must clear before the
   field ships**, and accepts that the interval around it is wide. §10.4's live quality signals — edit rate, refusal rate, time on
   screen — are what narrow it after G4, and PRF-06's breach-clause
   discipline is the precedent for how a later miss comes back to the
   owner rather than being absorbed.
4. **Nothing here is signable until the ceiling clears the floor.** This
   is the round-16 addition and it is mechanical: `Signable?` above is
   `max recall ≥ recall floor`, and it is `NO` for all twelve fields. The
   next corpus increment (§7 row 1 or row 2) moves the ceiling; the
   floors do not move to meet it. Lowering a floor to what the apparatus
   can currently demonstrate would be exactly the argued-around gate this
   spec exists to prevent.

---

## 7. What growing the corpus would buy — priced, not assumed

| Change | Cost | What it buys |
|---|---|---|
| Blind items 12 → 40 (same builder, more spec rows) | ~1 h build, ~+2 MB in-tree, ~2× eval cost per run | Bands at n ≈ 12–15 per field: a real interval rather than a floor |
| Photographed synthetic documents (print, photograph, label) | Owner time; a physical loop | The only way to measure the model's *vision* rather than our contract |
| A second annotator + inter-annotator agreement | Owner time | Turns "adjudicated" into a measured agreement rate |

None of these is taken as a build decision. All three are the kind of
thing the G9 gate exists to decide with evidence in hand.

---

## 8. Working with the corpus

```
node scripts/fixtures/g9-build.mjs           # rebuild fixtures + manifest
node scripts/fixtures/g9-build.mjs --check   # verify the tree matches the spec
npx vitest run tests/eval/corpus.test.ts     # the governance assertions
```

**Adding an item** means adding a row to `SPEC` in the builder and
re-running it — never dropping a file into `fixtures/g9` by hand, which
the manifest-completeness test rejects. **Changing a blind item after
bands are signed invalidates those bands**, the same way a prompt or
model change does (§6.10): the pair `(model_id, prompt_version)` and the
eval manifest's full-configuration hash are what make that traceable.
