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
the corpus MEETS them, so this section cannot drift into aspiration.

| Minimum | Value |
|---|---|
| Blind items labelling each banded field | **≥ 3** |
| Distinct source types per banded field | **≥ 2** |
| Blind negative examples per banded field (field genuinely absent) | **≥ 1** |
| Adjudicated ambiguous labels per partition | **≥ 1** |

As built:

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

**The honest reading of these numbers.** Four supporting items is enough
to catch a field the pipeline cannot read at all; it is **not** enough to
distinguish 0.90 precision from 0.95. Bands stated at two decimal places
against n = 4 would be false precision. Section 6 therefore proposes
bands as *floors with a stated confidence limit*, and Section 7 states
what growing the corpus would buy — again, an owner call at the gate.

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

| Field | Class | Proposed precision floor | Proposed recall floor | Note |
|---|---|---|---|---|
| `medication_name` | high | 0.98 | 0.95 | A wrong medication name is the worst single failure available here |
| `medication_dose` | high | 0.98 | 0.95 | With the §6.4 crop-on-screen rule standing regardless |
| `medication_frequency` | high | 0.95 | 0.90 | |
| `allergy_substance` | high | 0.98 | 0.95 | |
| `member_id` | high | 0.95 | 0.90 | |
| `policy_number` | high | 0.95 | 0.90 | Also an M5 stage-2 key field: a wrong value mis-files a duplicate |
| `coverage_determination` | high | 0.90 | 0.85 | Free text; normalisation is the hard part, not reading |
| `provider` | high | 0.95 | 0.90 | Also an M5 key field |
| `amount` | high | 0.95 | 0.90 | Also an M5 key field |
| `appointment_date` | high | 0.95 | 0.90 | |
| `appointment_time` | high | 0.95 | 0.90 | |
| `document_date` | standard | 0.95 | 0.95 | The only banded standard field; also an M5 key field |

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
3. **Statistical honesty.** With 4–11 blind items per field, a measured
   1.00 means "no error in a handful of tries", not "≥ 0.98 in the
   world". Signing these bands signs a **floor the pipeline must clear
   before the field ships**, and accepts that the interval around it is
   wide. §10.4's live quality signals — edit rate, refusal rate, time on
   screen — are what narrow it after G4, and PRF-06's breach-clause
   discipline is the precedent for how a later miss comes back to the
   owner rather than being absorbed.

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
