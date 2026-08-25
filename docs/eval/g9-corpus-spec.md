# The G9 corpus spec — labels, partitions, minimum support, and the bands the owner signs

**Status:** the corpus and this spec are BUILT (slice-5 plan B1, Q5
SETTLED), and **§7 row 1 is BOUGHT** (Q10 SETTLED 2026-08-24; built at
6B B10): the blind partition grew 12 → 40, including the email channel,
and the readable-support arithmetic below is restated against the grown
corpus. **The G9 GATE ITSELF IS NOT CLOSED**: it closes when the owner
signs the per-field acceptance bands below, against a completed eval run
on the BLIND partition — before any real document reaches a provider,
never quietly. Until then the shipping default is **all-high-risk**
(TSD §6.5), and B4 loads bands only from an allowlisted eval artifact
whose configuration hash matches the running `(model_id,
prompt_version)` — a missing, stale, altered or partial artifact fails
closed to all-high. §6.A states the mechanical rule by which a measured
number becomes a signable row at all.

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

**Eight of twelve blind items carried no rendition of the values they
were labelled with.** §4 and §6 below were therefore restated against
the **READABLE SET** — and §7 row 1 priced buying the difference.

**THE PURCHASE WAS MADE (Q10, built at 6B B10), and D11's letter is now
ENCODED IN THE MANIFEST**: every label carries a `rendered` flag —
`true` when the material carries a rendition of the value (the PDF text
layer, the email body), `false` when it does not (the photo/scanned
classes, whose encoder sizes rectangles from text and never paints a
glyph). The flag is **MEASURED**, not declared:
`tests/eval/corpus.test.ts` drives every blind item through the
pipeline's own `normalizeArrival` (with the *sniffed* mime — R3/F-12)
and fails if any flag disagrees with the rendition. The scorer excludes
`rendered: false` labels from recall — a flawless reader cannot return
them — and books a production that "matches" one as a **false
positive**: the twelve photo/scanned blind items are now pure
hallucination catchers, which is the honest job their material can do.
Max recall's arithmetic is thereby 1.0 for every banded field: the §6
floors are REACHABLE at last, and what keeps G9 closed is the gate
itself — a completed blind run, §6.A's rule, and the owner's signature.

---

## 2. The two partitions, and why the split is structural

| Partition | Items | Read by | Reached through |
|---|---|---|---|
| `development` | 16 | worker + adapter tests · the fixture server · prompt and schema iteration | `lib/eval/corpus.ts` |
| **`blind`** | **40** *(12 → 40 at the Q10 purchase, 6B B10)* | **scored eval runs ONLY** | `lib/eval/blind.ts`, §1.7 import-fenced to the harness |

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
| `discharge_summary` | 3 | 14 | §6.4's first named class; born-digital (incl. a MULTI-PAGE and a MULTI-MEDICATION item) and scanned |
| `eob` | 2 | 12 | The insurance/financial field family |
| `pill_bottle` | 1 | 3 | §6.3's never-downsampled row |
| `handwritten_note` | 1 | 3 | §6.3's never-downsampled row |
| `phone_photo_angled` | 1 | 3 | EXIF orientation 6 — geometry against the image **as displayed** |
| `email_body` | 1 | 5 | §6.3 row 4: text first — and since Q10, the primary intake channel is SCORED |
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

### 4.1 As built at the Q10 purchase — RENDERED support, which governs

**Support counts RENDERED LABELS** (D11 encoded: `rendered: true`,
measured through `normalizeArrival`), and it counts **labels, not
items** (R6/F-10 — the multi-medication item contributes two to each
medication field). The readable blind set is **28 items** across TWO
source types — born-digital PDF and email text; the twelve photo/scanned
items carry `rendered: false` labels and stand as hallucination
catchers. `tests/eval/corpus.test.ts` pins this table exactly; a number
moving there means the corpus moved, and this table moves with it in the
same commit.

| Banded field | Rendered blind support | Readable source types | Readable negatives ≥ | Max recall |
|---|---|---|---|---|
| `document_date` | 25 | 2 | 3 | **1.0** |
| `provider` | 27 | 2 | 1 | **1.0** |
| `amount` | 12 | 2 | many | **1.0** |
| `policy_number` | 12 | 2 | many | **1.0** |
| `member_id` | 12 | 2 | many | **1.0** |
| `coverage_determination` | 12 | 2 | many | **1.0** |
| `medication_name` | 14 | 2 | many | **1.0** |
| `medication_dose` | 14 | 2 | many | **1.0** |
| `medication_frequency` | 14 | 2 | many | **1.0** |
| `allergy_substance` | 13 | 2 | many | **1.0** |
| `appointment_date` | 12 | 2 | many | **1.0** |
| `appointment_time` | 12 | 2 | many | **1.0** |

Max recall is 1.0 *by construction now*: recall's denominator is
rendered labels, because a label the material carries no rendition of
is not a thing any reader — flawless or otherwise — can return, and
counting it was how every floor became unreachable. The unrendered
labels still exist, still carry their geometry, and still do work: a
produced value that "matches" one is a **false positive**, which is
precisely the failure mode a photo of flat blocks can honestly test.

### 4.2 The minimums are MET, and what still keeps the gate closed

- **≥ 3 blind items per banded field** — met by all twelve (12–27).
- **≥ 2 distinct readable source types per banded field** — met by all
  twelve: born-digital PDF plus the email channel Q6 made renderable
  and Q10 made scored.
- **≥ 1 readable blind negative per banded field** — met by all twelve
  (`provider`'s is the anonymous reminder email; `document_date`'s are
  the three undated emails).
- **≥ 1 adjudicated ambiguous label per partition** — met, unchanged.

**What keeps G9 closed is now the GATE, not the arithmetic**: a
completed blind run over this corpus, §6.A's mechanical rule, and the
owner's signature on the result. `BAND_ARTIFACT_ALLOWLIST` stays EMPTY
until that happens, and every field ships all-high-risk (§6.5).

**The honest statistical reading stands.** Twelve to twenty-seven
supporting labels put a real interval around a measured number — that
is what the purchase bought — but a measured 1.00 at n = 12 is still
"no error in twelve tries", not "≥ 0.98 in the world". §10.4's live
quality signals are what narrow it after G4.

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

**RESTATED AT THE Q10 PURCHASE (6B B10).** The floors are unchanged —
they are what the *product* requires, and the round-16 rule that "the
floors do not move to meet the apparatus" held in both directions: the
apparatus moved to meet them. With §4.1's arithmetic every ceiling is
1.0, so every row is **REACHABLE**; none is SIGNED, and §6.A states the
mechanical rule by which a run's numbers earn a signable row.

| Field | Class | Proposed precision floor | Proposed recall floor | Max recall (§4.1) | Reachable? |
|---|---|---|---|---|---|
| `medication_name` | high | 0.98 | 0.95 | 1.0 | yes — unsigned |
| `medication_dose` | high | 0.98 | 0.95 | 1.0 | yes — unsigned |
| `medication_frequency` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `allergy_substance` | high | 0.98 | 0.95 | 1.0 | yes — unsigned |
| `member_id` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `policy_number` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `coverage_determination` | high | 0.90 | 0.85 | 1.0 | yes — unsigned |
| `provider` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `amount` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `appointment_date` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `appointment_time` | high | 0.95 | 0.90 | 1.0 | yes — unsigned |
| `document_date` | standard | 0.95 | 0.95 | 1.0 | yes — unsigned |

### 6.A The threshold rule — how a measured number becomes a band (R6/F-4)

Written HERE, before any run can produce a signable artifact, because
the alternative was discovering at the sign-off meeting that the
harness's rows were rejected by `loadBands` as `artifact_partial`
forever and improvising the rule under pressure.
`lib/eval/thresholds.ts` is this section's arithmetic;
`tests/eval/thresholds.test.ts` pins the mirror.

1. **The floors gate entry.** A field's manifest row carries the
   `{high, medium}` pair `loadBands` requires **only** when the run's
   measured numbers clear every one of:
   - `precision ≥` its §6 precision floor;
   - `recall ≥` its §6 recall floor;
   - `support ≥` the §4 minimum (3 rendered blind labels);
   - `citation accuracy ≥ 0.90`, **measured** — at least nine of ten
     value-hits must land their bbox on the labelled region (same page,
     intersection at least half the smaller box). This is R3/F-7's
     teeth: a model with perfect values and uniformly wrong boxes
     cannot sign, because the box is what a person is shown before
     approving. An UNMEASURED citation accuracy does not pass — no
     evidence is not good evidence.
2. **The pair itself is PRD §6.4's defaults** — `high ≥ 0.85`,
   `medium ≥ 0.60` — for every field that clears. The rule never
   computes a threshold from the measurements: moving a pair off the
   defaults is a per-field OWNER decision on per-field
   confidence-vs-accuracy evidence, recorded at the gate.
3. **An artifact is signable only when EVERY banded field cleared.** An
   unsignable manifest omits the pairs it did not earn, and `loadBands`'
   own `artifact_partial` guard fails it closed to all-high —
   enforcement stays exactly where it always was, and a partly-good run
   cannot ship as a partly-calibrated product (the half-calibrated state
   §6.5 forbids).
4. **Signing is still the owner's act**: the run's digest enters
   `BAND_ARTIFACT_ALLOWLIST` in the sign-off commit, with the ADR
   recording the numbers signed against. Nothing in this rule closes
   the gate; it makes what the gate reads mechanical.

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
| ~~Blind items 12 → 40 (same builder, more spec rows)~~ **BOUGHT — Q10, built at 6B B10** | was: ~1 h build, ~+2 MB in-tree, ~2× eval cost per run (landed at ~+0.8 MB) | Bands at n = 12–27 per field: a real interval rather than a floor — delivered as §4.1 |
| Photographed synthetic documents (print, photograph, label) | Owner time; a physical loop | The only way to measure the model's *vision* rather than our contract. **Still out (Q10 kept row 2 out)** |
| A second annotator + inter-annotator agreement | Owner time | Turns "adjudicated" into a measured agreement rate |

Rows 2 and 3 remain owner decisions at the gate, with evidence in hand.

---

## 8. Working with the corpus

```
node scripts/fixtures/g9-build.mjs           # rebuild fixtures + manifest
node scripts/fixtures/g9-build.mjs --check   # verify the tree matches the spec
npx vitest run tests/eval/corpus.test.ts     # the governance assertions
```

**Adding an item** means adding a row to `SPEC` in the builder and
re-running it — never dropping a file into `fixtures/g9` by hand, which
the manifest-completeness test rejects. **The PDF writer refuses
non-Latin-1 text loudly** (R6/F-17; the guard's first run caught two
live truncations in the shipped corpus — a curly apostrophe and an
em-dash silently mangled to control bytes): transliterate, or extend
the writer first. **Changing a blind item after
bands are signed invalidates those bands**, the same way a prompt or
model change does (§6.10): the pair `(model_id, prompt_version)` and the
eval manifest's full-configuration hash are what make that traceable.
