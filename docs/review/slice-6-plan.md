# Slice 6 — The Care Inbox: the slice plan

**Status:** **PLANNED — RULED. Q1–Q10 SETTLED 2026-08-24 at the plan
gate** (rulings recorded verbatim below; **every recommendation
accepted** — the slice-5 `561a105` pattern). The 6A build (M1
`inherited_obligations` FIRST) runs in its own fresh session on
`slice/6-care-inbox`; 6B follows at its own kickoff on
`slice/6b-care-inbox-app`, with B1 — the rasterizer swap — first. **An
unanswered question would have defaulted to NOT PLANNED; none was left
unanswered.** Written 2026-08-23 in the planning session against `main` @
`692c182` (the slice-6 plan-gate kickoff, checked in docs-only), whose
parent `b80ab32` carries CI green at run `32696072672` — all 23 steps,
the single `skipped` being the on-failure log capture. Slice 5B is
MERGED at `c63bcae` (parents `a9d9f43` + `318e2ad`), PR #10 closed as
merged, merge SHA stamped at `00c29f1`. Round 16 is CLOSED: ADR-0023
ACCEPTED, ADR-0022 AMENDED with all ten falsified claims folded in.
Slice 6's review is **round 17**; the next free ADR number is **0024**.

**Authority:** TSD §11.1 row 6 (*"Care Inbox (§4.9) — review screen,
item-level approval, the receipt. The wedge. First point at which the
loop closes"*) → **TSD §4.9 whole**, plus §4.2/§4.4/§4.5/§4.6/§4.7,
§6.3–§6.5, §6.9, §8.7, §3.2–§3.4, §3.7, §1.3, §1.9 → **PRD §4.2 whole**
(§4.2.2 states, §4.2.3 the three-region screen, §4.2.4 the receipt,
§4.2.5 conflicts, §4.2.6 multi-attachment, §4.2.7 empty/loading/error,
§4.2.9 concurrent and stale review, §4.2.10 AC-INBOX-1…16), §6.1–§6.4,
§7.3–§7.4, §13.4–§13.5 → **G9 and G3 (both still OPEN)** and **G12**
(§11.2) → **ADR-0023** (round-16 dispositions: D11 the corpus, D12 the
email row, D13 the AGPL question, D14 the cancel window, D17's 39 OWED
findings, D24's four sign-off rulings and the slice-6 queue) → **ADR-0022
as amended** (the 5B as-built record, ten claims corrected in place) →
ADR-0019 D7/D13/D15 and Q-C/Q-E (the queued DB candidates whose consumer
is this slice) → ADR-0021, ADR-0018, ADR-0017 D8 → **ADR-0006** (owner
sole merge authority; merge commit never squash) → `docs/coverage.md` row
conventions → `docs/eval/g9-corpus-spec.md` as amended at sign-off →
`docs/ops/{ai-provider, ingestion-deploy, runtime-db-credentials,
security-actions-worker, e2e-local-gate}.md`.

**Branch (Q9):** `slice/6-care-inbox` for 6A (branched from `main` @
`692c182` or later docs-only), `slice/6b-care-inbox-app` for 6B at its
own kickoff — the 4A/4B and 5A/5B naming precedent, fourth time.
Red→green per unit, the failure signature in every red commit message,
merge commit never squash.

---

## 0. What this slice is, stated before it is planned

**§4.9 is the first slice in which a person's click changes the record.**
Everything before it moved bytes and drafted intentions; this one commits
them. Three consequences govern every decision below.

1. **The machinery is largely shipped and the SURFACE is not.**
   `proposal_commits` has existed since 1B (`20260815230001`),
   `hc.approve_proposal` since 1B (`20260815230006`), the conflict arm
   since 5A M4 (`20260821120004`), and `approval_attempts`, proposal
   versioning, write-time re-check and the one-proposal-one-object table
   all with them. pgTAP 013, 052, 054 and 055/056 drive them today. What
   has never existed is the review screen, the receipt, item-level
   granularity in an interface, or **any read path shaped for a person
   rather than for a worker.**
2. **The interpretation half has never been exercised end to end by a
   human.** §4.8's conflict arm only started working at round 16's
   `c15d764` (ADR-0023 D1 — *"the single most important sentence in this
   document"*). Everything downstream of a conflict proposal is proven by
   pgTAP and by nothing else.
3. **All-high-risk is the shipping mode, and therefore the DESIGN mode.**
   G9 is open, `BAND_ARTIFACT_ALLOWLIST` ships EMPTY, and §6.5 says the
   interface must be able to run in all-high-risk mode from the first
   arrival. In that mode PRD §6.4's absolute rule — *the crop must be
   rendered and on screen before the approve control becomes active* —
   applies to **every field of every fact**. The review screen is not a
   screen with a high-risk path bolted on; the high-risk path is the only
   path it will ever have run.

---

## THE HARD GATES — G9, G3 and G12, and how this slice builds under them

**G9 is still OPEN and slice 6 does not close it.** ADR-0023 D24 ruling 2
restated `docs/eval/g9-corpus-spec.md` §4/§6 against the READABLE set,
and the numbers are now measured rather than declared: **4 of 12 blind
items carry a readable rendition**, all of one source type; §4.3 states
plainly that the minimums are NOT met — two fields of twelve clear ≥ 3
items, **nothing** clears ≥ 2 source types, effective source-type
coverage is **1** for every banded field; §6 carries a `Signable?` column
reading **NO twelve times of twelve**, because max recall (0.25–0.50)
sits below the lowest floor (0.85). `tests/eval/corpus.test.ts` asserts
the shortfall itself — 22 minimum-misses — and **goes RED when the corpus
grows. That red is the signal to re-pin the numbers in the same commit as
the ADR recording the change, never to loosen them. A floor is not
lowered to meet an apparatus.**

**What would actually open G9 — five conditions, all of them, in
writing.** The plan states them because a gate nobody has written down is
a gate that gets argued around at the meeting where it fails:

1. **A corpus whose blind items are readable.** Every banded field clears
   §4's minimums — ≥ 3 blind items across ≥ 2 source types — counted in
   **§4.2 readable support**, not §4.1 labelled support. §7 row 1 (blind
   12 → 40, ~1 h build, ~+2 MB in tree, ~2× eval cost per run) or §7 row 2
   (photographed synthetic documents; owner time and a physical loop) is
   the purchase. **This is Q10.**
2. **An email item in the BLIND partition** (ADR-0023 D12): today there
   is none, on the channel the forwarding address exists to serve. This
   is unbuyable until Q6 settles §6.3's email row, because until then
   there is no rendering for an email item's labels to sit against.
3. **A written rule for how a measured number becomes a threshold**
   (R6/F-4). The harness emits `{precision, recall, support, tp, fp, fn}`;
   `loadBands` requires `high`/`medium` per field. Today the signed digest
   would fail closed as `artifact_partial` **forever**, indistinguishable
   at the call site from the shipping default. Nobody has written the
   rule down. **Until it is written, no run can produce a signable
   artifact, however good the numbers are.**
4. **Citation correctness measured** (R3/F-7). The harness discards the
   citation before scoring — `Prediction` is `{field, value}` only — so a
   model with perfect values and uniformly wrong boxes scores **1.00**.
   **Boxes are what this slice renders.** Signing bands on a run in which
   citation correctness was never measured would calibrate the wrong
   thing for the exact consumer being built, and multi-page geometry is
   exercised by nothing (R3/F-6: every corpus item is single-page, so
   `citation.page` is always 1).
5. **A completed BLIND run keyed to the shipped `(model_id,
   prompt_version)` pair**, with per-field precision and recall meeting
   §6's floors, and the owner's signature on the bands — never as a side
   effect of a green coverage row.

Conditions 3 and 4 are **slice-6 work and are priced below**: both are
about the consumer this slice builds. Conditions 1 and 2 are owner
purchases. Condition 5 is the gate itself.

**G3 is unchanged and slice 6 adds no provider surface.** The one design
choice that would have added one — producing OCR transcripts from the
model — was rejected at the slice-5 gate (Q6) on cost and on deciding the
mechanism blind, and this plan keeps that rejection: §6.9's OCR is
produced by a local engine (Q3), never by a provider call. **The
fixtures-only discipline stands unchanged: CI KEYLESS, the fixture server
in the local gate, the eval harness the only path ever RUN against a real
credential, synthetic material only, never real family data, never a real
document to a provider.** Nothing in this slice is production-activated:
G4/G7 still block the forwarding address, so no family ever sees any seam
this plan leaves open.

**G12 becomes live work here, which it has not been since slice 3.**
A11Y-07 (full keyboard operation of the review screen: Tab between facts,
Enter selects and moves focus to the cited region, logical focus order
across the three regions) and A11Y-08 (OCR *"machine-read — may contain
errors"* labelling with page and citation navigation parity) both sit
`pending` tagged **6** in `docs/coverage.md` — A11Y-08 re-tagged 5/6 → 6
by the slice-5 gate's Q6 ruling, recorded not dropped. §8.7's own words:
**G12 is the final gate, not the first check — a structural failure found
at G12 is a redesign, not a fix.** Both rows are therefore built with the
screen, not after it, and both are e2e legs in the local gate.

---

## Migration bound (Q2): **≤ 7** (M1–M5 planned, M6 + M7 reserved and NAMED)

Slice 5's bound closed **SPENT at 8 of ≤ 8**, amended twice mid-round by
the owner. **Slice 6 gets a FRESH bound and this gate sets it** — the
slice-4 Q3 precedent, restated at the slice-5 gate and restated again
here. Every planned migration is named below with its contents; anything
past the bound is a recorded owner amendment **before a line is written**.
**Shipped migrations are never edited**; transition-graph and seed-table
changes are appends with their pgTAP exact-set pins re-pinned in the same
commit (the 2A M6 / 4A M6 / 5A M5 pattern). The tree stands at **62
migrations / 59 pgTAP files**; CI's `verify-migration-state` exact count
moves 62 → 62+N with the increment.

**Five migrations are named with their contents in the unit map below**
— M1 `inherited_obligations` · M2 `review_boundary` · M3
`decide_proposal` · M4 `renditions` · M5 `receipt` — and two slots are
reserved. **Both reserves are NAMED rather than blank**, which is the
slice-5 lesson: an unnamed reserve is the one that gets amended.

- **M6 — round-17 dispositions.** The standing precedent since 2A.
- **M7 — the arrival-received signal's DB half, contingent on Q8.** If
  the owner's answer to Q8 is a surface that revalidates (the
  recommendation), M7 is **not consumed** and the bound closes at **6 of
  ≤ 7**. If the answer needs a durable signal row or an outbox event, M7
  is where it lands, consumed only with the Q8 ruling quoted in the
  commit message; otherwise an owner amendment. **The plan
  over-provisions by one slot deliberately** — the direction to err,
  given slice 5's bound was amended twice mid-round and still closed
  SPENT.

## Dependency bound (Q3): **≤ 3 runtime slots, one of which REMOVES an AGPL obligation**

**The licence column is now a plan-format rule** (owner ruling
2026-08-23; the finding is ADR-0023 D13/R7-F-1, the ruling is D24). **No
dependency is argued anywhere in this project without its licence in the
same argument.** Round 16 found 20 mentions of `mupdf` across four
governance documents and **zero** mentions of its licence, while both
alternatives the slice-5 plan priced were permissive — the licence was a
differentiator between the compared options and it was priced out of the
comparison silently. This table exists so that cannot recur.

**Current runtime state** (verified from the installed manifests):

| Package | Version | Licence | Posture after slice 6 |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.120.0 | **MIT** | **stays** — permissive, no obligation |
| `mupdf` | 1.28.0 | **AGPL-3.0-or-later** | **REMOVED** — D24 ruling 1 |

**Proposed, with licences read from the npm registry in this planning
session and REQUIRED to be re-verified from the installed manifest before
any code imports them** (the D13 command, `node -e
"console.log(require('./node_modules/<pkg>/package.json').license)"`, its
output pasted into the red commit that adds the package):

| # | Package | Version | Licence | What it buys | Slot |
|---|---|---|---|---|---|
| 1 | `pdfjs-dist` | 6.2.108 | **Apache-2.0** | §6.3's rasterizer: page geometry, page images, the born-digital text layer | **replacement** |
| 2 | `@napi-rs/canvas` | 1.0.8 | **MIT** | the raster backend `pdfjs-dist` renders into; prebuilt N-API binaries, no node-gyp toolchain | **replacement** |
| 3 | `tesseract.js` | 7.0.0 | **Apache-2.0** | §6.9's OCR engine — image-only sources, WASM, no native build | **new** |

**The arithmetic, stated exactly rather than flatteringly: the argued
runtime set goes from TWO to FOUR.** One package is removed and three are
added — `@anthropic-ai/sdk` stays, `mupdf` leaves, and `pdfjs-dist`,
`@napi-rs/canvas` and `tesseract.js` arrive. The bound above is **three
ADDITIONS**, not a total. **The count goes up by two and the licence
posture strictly improves**, and both halves of that sentence belong in
the argument: a plan that reported "two become three" would be doing to
this bound what round 16 caught being done to `mupdf`'s licence.

**Recorded alternatives, priced rather than dismissed.** `@hyzyla/pdfium`
2.1.13 is **MIT** *as a binding* — and **the binding's licence is not the
engine's**: PDFium itself ships under BSD-3-Clause plus Apache-2.0
components, and it arrives as per-platform native binaries, which is the
packaging objection the slice-5 plan already recorded against `pdfium`
and which is worse on this project's platform. `canvas` (node-canvas)
3.2.3 is **MIT** but needs a native toolchain; `@napi-rs/canvas` is the
same licence with prebuilt binaries, so it is preferred on packaging
alone. **`pdf-to-img` 6.2.0 (MIT) is explicitly rejected**: it is a
convenience wrapper over exactly the two packages above and would hide
the geometry decisions D2 proved this project must own — a 300-dpi scan
rendered at 617×824 and said `rendered`, and no wrapper would have made
that visible.

**Everything else stays zero-dep, and the plan says which temptations
were refused.** The crop-on-screen affordance needs no imaging library:
`cropRect` already computes the pixel rectangle from a normalised
`{page, bbox}` (`lib/pipeline/render.ts:395`, resolution-independent and
clamped, pinned by `tests/pipeline/render.test.ts`), and the browser cuts
the crop from the promoted page with CSS transforms or a canvas draw. No
split-pane library, no virtual-scroller, no state-management package, no
form library — the review screen composes from the slice-3 system
(§8.4's components; `frontend-design` is the gate if it needs a primitive
the system lacks, and it should not). **Dev-dependency reserve: ONE slot,
still UNSPENT through two slices** (the standing precedent; ADR-0023 D15
Q-H). Nothing in this plan needs it.

## The platform check for THIS slice — discharged here

§1.9's platform row was discharged for slice 5 against the extraction
budget (300 s default function timeout vs §4.3's 5-minute wall clock).
**Slice 6's platform exposure is different and smaller, and it is stated
so review can check it rather than trust it:**

- **No new serving surface.** Promoted page images are served through the
  EXISTING `app/api/artifact/[id]` route — already clean-gated,
  already evidence-before-bytes, already `view`-gated in-definer by
  `hc.log_artifact_read` (`20260821120001`). Slice 6 adds a page
  parameter to a route that already streams bytes; it does not add a
  second byte path, and the fence stays uniform.
- **The one real platform question is Q8's signal.** A Care Inbox that
  tells the truth about `Reading` needs a revalidation mechanism, and the
  choice between router-refresh-on-interval, a streamed update and a
  short-poll has a per-request cost that is a platform question, not a
  UI preference. The plan sets the **requirement** — the surface must
  never present a cancel control that is already dead, and the state
  shown must be no more than one relay tick stale — and leaves the
  mechanism to build truth under `vercel:nextjs` and the AGENTS.md
  `node_modules/next/dist/docs/` guides. **Whatever is chosen is
  measured, not assumed:** PRF-07's harness already exists and gains the
  signal's staleness as a reported number.
- **390px is the primary review device** (PRD §13.4, §8.8). The three
  regions stack there. That is a design constraint on the screen, not a
  platform ceiling, and it is an e2e leg rather than a review note.

---

## What exists (do not rebuild) — verified against the tree this session

**The approval boundary is shipped and proven. The read path for a
person is not.** That sentence is the whole shape of this slice, and
everything below is the evidence for it.

**Shipped and load-bearing — do not rebuild:**

- **`hc.approve_proposal`** (1B `20260815230006`, hardened at 2A M2, the
  conflict arm at 5A M4 `20260821120004`). Verified in the tree: the
  idempotency key is claimed BEFORE any row is written and is bound to
  the actor **and to the chosen conflict outcome**; `p_expected_version`
  refuses with `proposal_version_changed`; parents whose current union
  exceeds own ∪ drafted refuse with `proposal_taint_changed`; a
  `pg_advisory_xact_lock` on the circle serializes against taint growth
  and freeze; **a high-risk value refuses with `high_risk_unconfirmed`
  unless `p_edits.confirm_high` is true**; and the write-time
  authorization check is `hc.visible_at(ctx, subject, v_taint,
  taint_resolved, …) >= 'manage'` over the object's OWN taint. §4.8's
  three outcomes all run.
- **`proposal_commits`** (1B `20260815230001`): `proposal_id` primary
  key **and** `unique (object_type, object_id)` — one proposal writes at
  most one object and one object is backed by at most one proposal, **as
  a table, not an API shape** (AC-INBOX-3, PRD §6.2). Item-level
  granularity is already structural; the interface's job is to not
  smuggle a batch control past it, which is an assertion, not a build.
- **`approval_attempts`** (1B): `idempotency_key` primary key, `result`
  and `committed_at` for the AC-INBOX-12 hard case.
- **The record tables are readable by members at their own taint**
  (`20260815230002`): `documents`/`tasks`/`timeline_events`/`episodes` at
  `>= summary`, `profile_facts` at `>= view`, each through the two-clause
  §3.4 policy shape. **The receipt's destinations can be read.**
- **The pipeline runs end to end** through `proposals_ready`, and
  `Needs you` is a true label (5B B7). The stage-2 duplicate surface, the
  accept-sender release, the §4.5 cancel affordance and the 4-hour
  queue-age notice are all live on `app/(app)/[circle]/inbox/page.tsx`.
- **The rendering exists and promotes.** `lib/pipeline/render.ts` is
  §6.3 as code with the D2 geometry correction; `promoteRenderedPages`
  (`lib/storage/artifacts.ts:306`) copies the attempt's pages to
  `render/circle/<circle>/arrival/<arrival>/pNNN.<ext>` write-once on
  `advanced`; `cropRect` turns a normalised bbox into a pixel rectangle
  and is pinned resolution-independent. **`cropRect` has no production
  consumer — slice 6 is it** (R3/F-13).
- **Two destination surfaces already resolve.** `tasks/page.tsx` and
  `timeline/page.tsx` are real RLS reads with the design-spec empty
  state — *"the honest floor"* of slice 7's surfaces. A receipt link to a
  created task or timeline event lands on the thing itself **today**.
- **`ProvenanceLine.tsx`** took its first consumer at 5B B6 (UXA-02,
  Q6 first branch). The review screen is its second.

**Verified ABSENT — the gap this slice fills** (each grep-verified
against the tree in this planning session):

- **No review screen, no receipt, no per-fact anything.** `app/(app)/`
  holds inbox, senders, invite, members, tasks, timeline, upload — and no
  arrival detail route at all. There is no `[arrival]` segment anywhere.
- **No `hc.extractions_for`** — ADR-0019 Q-C's queued candidate, still
  named in `lib/hc/workers.ts:44` and still not in `supabase/`.
- **No read path to `proposal_commits`.** The grants are
  `select, insert … to hc_internal` and the two policies are
  `…_internal` / `…_internal_claim`. **`authenticated` holds nothing on
  the table §4.2.4's receipt is a read of.** The receipt cannot be built
  at the app layer today, at any level of cleverness.
- **No rendition manifest.** `arrivals.page_count` is the *source* page
  count set at arrive (nullable, bounded 0–200). **Nothing anywhere
  records how many pages were RENDERED, how many were PROMOTED, or with
  which extension.** `promotedPageKey`'s only callers are tests.
- **No edit path for an extracted value.** `authenticated` holds
  `select` on `extractions` and nothing else; `insert`/`update` are
  `hc_internal`'s. PRD §4.2.3's *"values are editable in place; editing a
  fact before approval is a first-class action"* has nowhere to write.
- **No OCR anywhere** (§6.9): no engine, no `.txt` sibling produced, no
  labelling. `promotedPageTextKey` reserves the key shape and nothing
  writes it.
- **No `gate → extract` eager fire**, deliberately — `fireWorker` runs
  for scan (`route.ts:157`), gate (`:201`) and interpret (`:427`) and
  never for extract, and the comment at `route.ts:242` now records the
  owner's ruling rather than a gap.
- **No presence indicator** (§4.9's *"presence, not locking"*), no
  rejection-reason capture (§4.2.3's optional one-tap reason feeding
  §10), no multi-attachment group review (§4.2.6, AC-INBOX-13).

**The regression net this slice must not dent** (evidence on `main`):
**62 migrations exact** · pgTAP **1513 PASS across 59 files** ·
concurrency **70/70** (teed) · vitest **689/689 across 64 files** ·
`db:verify` clean under `--fail-on warning` · local gate **29/29** ·
typecheck, lint and production build clean · gitleaks clean.

---

## THE FOUR THINGS THAT MUST BE SETTLED BEFORE THE REVIEW SCREEN IS WRITTEN

The kickoff names three. **This session found a fourth, and it is the
largest of them.** Each is cheap now and expensive after, for the same
reason: each is a contract the screen will encode the moment it is
written, and re-deciding it afterwards means re-deciding it in three
places instead of one.

### 4.1 — `confidenceBand`'s `null` means two different things (Q4)

**The finding** (ADR-0023 R1/F-5, ACCEPTED-NOTE): `confidenceBand`
(`lib/extraction/bands.ts:190`) has no consumer, no test, and a docblock
that says *"slice 5 records the answer"* — which is false; **nothing
records a band.** Slice 6 is its consumer.

**The ambiguity, read off the function:** `null` is returned when
`mode.mode === 'all_high'` — *no band exists for anything, by design* —
**and** when `mode.bands[field]` is missing in an otherwise calibrated
run — *this field was never calibrated while its neighbours were.* Those
are not the same fact and they must not render the same way. R6/F-11
already shows the second is reachable: non-banded fields get artifact
rows with `precision: 0` that no band covers.

**Recommended — three states, not a nullable one, and no band column on
the fact:**

1. `confidenceBand` returns a **discriminated result** —
   `{ kind: 'all_high' }` · `{ kind: 'banded', band: 'high'|'medium'|'low' }`
   · `{ kind: 'uncalibrated' }` — so the caller cannot collapse what the
   function knows. The screen renders all-high **once, globally** (*"we
   are reading everything as high-risk until the evaluation set is
   signed"*), and renders `uncalibrated` **per fact**, honestly, as a
   field this run did not calibrate — never as an unremarkable low band.
2. **The band is computed at render time and is NOT stored on the
   extraction row.** `extractions` carries `confidence`, `risk_class`,
   `model_id` and `prompt_version` and deliberately no band column. A
   band is a property of the *calibration*, not of the fact; storing it
   would freeze one calibration into the record and make re-calibration a
   data migration — the exact mistake §6.4 avoided by owning citation
   geometry. The `(model_id, prompt_version)` pair on the row is already
   the key that resolves a fact to the bands that governed it.
3. The docblock stops claiming slice 5 records anything, and says what is
   true: slice 6 computes the band at render time from the run's pair.

**Alternative — add a `band` column at M-something and have the worker
write it — REJECTED** for reason 2, and because it would make every
band re-run a backfill over `extractions`.

### 4.2 — `promotedPageKey`'s default extension is wrong for the majority (Q5)

**The finding** (ADR-0023 R3/F-8, OWED): `promotedPageKey`'s `ext`
parameter defaults to `'png'`, and the contract test calls exactly that
default — while `extFor(mime)` returns `'jpg'` for `image/jpeg`, which is
every photo, every scan and every pill bottle. **The exported builder
encodes the wrong answer for the majority of arrivals, and slice 6 is
what hits it**, because slice 6 is the first caller that has to turn a
citation into a URL.

**The finding is smaller than the hole under it.** Fixing the default
alone would be a one-line change that leaves the real problem intact:
**the review screen has no way to learn a page's extension at all.**
`promoteRenderedPages` copies whatever names the staging prefix held —
so the ext is correct *in storage* and recorded *nowhere*. The screen can
only guess, or list a storage prefix per render, and neither is a
contract. Worse, **listing cannot distinguish "this document has three
pages" from "page three was never promoted"** — which is exactly
R4/F-6's permanent partial promotion, the failure the screen is the
display surface for.

**Recommended — delete the default, and give the pages a manifest (M4):**

1. **`ext` becomes a required parameter** of `promotedPageKey`. No call
   site can guess, the contract test asserts both extensions, and the
   wrong answer stops being expressible.
2. **A rendition row is written in the SAME transaction as
   `hc.finalize_extraction`** — the arrival, the page count the render
   produced, and the extension per page. It is written on the won
   transition, so it exists exactly when the facts that cite it exist,
   and a cancelled or superseded attempt writes nothing (the §4.5
   discipline, unchanged).
3. **Promotion becomes verifiable, which closes R4/F-6.** The screen
   compares the manifest to the objects present and can therefore *say*
   "page 3 of this document is missing" instead of rendering a citation
   to a 404. And because the manifest exists, a **repair path** is
   expressible for the first time: re-render and re-promote the missing
   pages against the recorded shape, rather than leaving an `extracted`
   arrival permanently citing pages that have no artifact.

**One migration closes two owed findings and unblocks the screen's
central affordance.** That is the argument for M4 being real DB work
rather than a convenience, and it is a substantial part of the argument
for Q1's split.

### 4.3 — §6.3's email row: facts cite a rendering that is never produced (Q6)

**The finding** (ADR-0023 D12, from R7/F-4 — *"the finding R7 nominates
as the most valuable it produced"*): TSD §6.3 row 4 reads **"Email body |
Text, with the rendered message as a second source"**. `render.ts`'s
header docstring reproduces the table with the second half deleted, and
**the code matches the altered row**: `pages: []`, text only. The corpus
spec propagated the same truncation; the corpus manifest preserved the
full clause.

**Verified in the tree this session, and it is worse than a docstring
drift.** `lib/ai/schema.ts:84` declares `required: ['page', 'bbox']` —
**an email-body fact cannot be expressed without a bbox**, and
`validateFacts` has an explicit "pageCount 0 means text-only: page 1 is
the only legal page" branch that still requires one. So every email fact
is stored with `{page: 1, bbox: […]}` **against a rendering that was
never produced and never promoted**, and `cropRect(pages[0], bbox)` for
an email arrival is `cropRect(undefined, bbox)`. §6.4's crop is
unsatisfiable for the whole email class, which means **PRD §6.4's
high-risk rule — the crop on screen before approve activates — cannot be
met for email at all.** In all-high-risk mode, which is this slice's only
mode, that is *every fact of every email arrival*. The BLIND partition
additionally has **no email item at all**, so no banded field has any
email evidence.

**Recommended — RENDER THE MESSAGE, honouring §6.3 as written.**

- **Email is the channel the forwarding address exists to serve.**
  Amending the TSD row down would make §6.4's crop, PRD §6.4's high-risk
  rule and AC-INBOX-2 *permanently* unsatisfiable for the product's
  primary intake channel. That is a product amendment wearing a spec
  correction's clothes, and it should not be taken by default because
  the code drifted first.
- **The cost is low against the swap already happening.** Q3 replaces
  the rasterizer this slice regardless; rendering a sanitised message
  body to a page image is what the canvas backend does. It is a new unit,
  not a new capability.
- **It closes the corpus's email gap.** With a rendering, an email item
  can carry labels that live in the bytes the model is given — which is
  precisely what D11 found the corpus lacks — so §7 row 1's purchase can
  include the channel that matters most.

**The safety cost is real and is named as a unit, not a footnote.**
Rendering an email body means rendering untrusted content. PRD §4.2.8
requires links **inert — never auto-fetched, never previewed, never
resolved for a title**. The rendition is therefore produced from a
**sanitised, resource-free** document: no remote fetch of any kind (no
images, no stylesheets, no fonts, no `srcset`, no `@import`), no script
execution, no redirect following, and a hard byte and dimension ceiling
before any decode — the §4.6 bounded-decompression stance carried to
message rendering. **A network call attempted during an email render is a
test failure, asserted, not a code-review note.**

**A TSD annex is owed EITHER WAY** — the as-built record truncated §6.3's
row, so whichever way Q6 rules, A12 records it: that `render.ts` now
implements the full row, or that the row is deliberately narrowed and
what that costs. **`docs/coverage.md`'s RND-01 cell stops reading "the
table row by row" until this is settled** (ADR-0023 D12's instruction).

### 4.4 — THE FOURTH: the review screen's three regions have three different authorization gates (Q7)

**Found in this planning session, reading the shipped RLS against PRD
§4.2.3. Not a round-16 finding.**

**Each gate is deliberate and is documented AT THE SITE**, and this
finding does not claim otherwise: 1C M7's header
(`20260816010007_ingestion_rls.sql:1–23`) states the §3.4 level→table map
and its reasoning — *"pipeline material is unclassified until approved
into the record: arrivals and extractions evaluate `hc.visible_at` over
`hc.all_domains()` (fail-closed; an arrival can be an invoice or a
discharge summary and the policy cannot know which yet)"*, and
*"proposals read at MANAGE over the proposal's own taint … the approval
audience is the fail-closed choice."* Each sentence is right.

**What is recorded nowhere is the COMPOSITION** — what those three
correct gates do when they meet on one screen. PRD §4.2.3 specifies one
screen with three regions, and the tree gates them at three different
levels:

| Region (PRD §4.2.3) | Read through | Gate, as shipped |
|---|---|---|
| **The source** — the original rendered, and the crop | `arrivals` + `app/api/artifact/[id]` + `hc.log_artifact_read` | `visible_at(ctx, subject, **all five domains**, true, 'arrival', …) >= 'view'` — `20260821120001:81`, and the route's own read |
| **What we read** — extracted facts + citations | `extractions` | `visible_at(ctx, subject, **all five domains**, true, 'extraction', …) >= 'view'` — `20260816010007:55` |
| **What we propose** — the approvable items | `proposals`, then `hc.approve_proposal` | `visible_at(ctx, subject, **the proposal's own taint**, taint_resolved, …) >= 'manage'` — `20260816010007:68`, and the write-time check at `20260821120004:249` |

And the list that leads to the screen is a fourth gate: `arrivals_select`
requires `>= 'summary'` over **all five domains** (`20260816010007:42`).

**The one mechanism that widens does not reach the middle region.** 1C
M7's header notes that *"an object share on one arrival can widen exactly
that arrival to view, as everywhere else"* — `hc.visible_at`'s clause 5.
But a share is keyed `(object_type, object_id)`, and `extractions_select`
passes `'extraction', id`. **A share on the arrival widens the arrival
and cannot widen its extractions.** So the escape hatch that exists for
the source region does not exist for the facts, and the composition below
is not reachable-around.

**The arithmetic is decided by `hc.grant_vectors`, which builds each
level's array cumulatively** (`level >= 'manage'`, `>= 'view'`, and so on
— `20260815200007`), so `hc.ladder(s, all_domains)` returns the caller's
**minimum level across all five domains**. Therefore:

> **A member holding `manage` on one domain and `summary` on the other
> four can SEE a proposal tainted with that domain, and can APPROVE it —
> while both the source it cites and the extracted fact it was drawn from
> are invisible to them.**

That composition is not exotic. **PRD §4.2.3's own sentence invites it**
— *"Only a member with `manage` on the relevant domain for that subject
can approve"* — and PRD §7.4 says a Family member's tier can be raised by
a Coordinator or the parent. The screen renders an empty middle region, a
dark left region, and a fully live right region.

**In all-high-risk mode — this slice's only mode — the contradiction is
formal, not aesthetic.** `hc.approve_proposal` already refuses a
high-risk value with `high_risk_unconfirmed` unless `p_edits.confirm_high`
is true. PRD §6.4 says the crop must be **rendered and on screen** before
approve activates. So the database will accept a `confirm_high` from a
person who could not possibly have seen a crop, or the interface will
never activate the control and PRD §4.2.3's sentence is false as written.
**AC-INBOX-2 fails for that member too**: there is no citation to
display. This is the kind of thing §11.2 puts behind G2 and G8 — a
visibility rule that reads correctly in each of three places and is wrong
in composition.

**Recommended — narrow approval to match the evidence, in the DATABASE,
not only in the interface:**

1. **`hc.approve_proposal` gains one check**: the actor must clear
   `visible_at(ctx, subject, hc.all_domains(), true, 'arrival',
   arrival_id, null) >= 'view'` — the *same* predicate the artifact route
   and `hc.log_artifact_read` already enforce — **in addition to**
   `manage` over the object's taint. A narrowing is safe; a widening
   would not be. It refuses in the existing `approval_refused` shape
   (DEF-10: one shape for nonexistent, foreign, deleted, revoked and
   below-cliff alike), so it leaks nothing.
2. **PRD §4.2.3's sentence becomes true as written**, in the only way it
   can be: *only a member with `manage` on the relevant domain **and who
   can read the source** can approve.* That is not an addition to §6.4 —
   it is §6.4's rule stated at the layer that enforces rules.
3. **The interface hides rather than disables** (§4.2.3's word is
   *absent*, not disabled), with the one line explaining who can — but
   the hiding is now a rendering of a database refusal, not the only
   thing standing between a half-blind approver and the record.
4. **AC-INBOX-8 gets its honest reading and a test.** A "summary-level
   member" who can open an arrival at all is one holding `summary` on all
   five domains — the Family *default* (summary ×3, `documents` at log,
   `finances` hidden) resolves to `hidden` and sees nothing, which is the
   recorded UXA-01 cliff. So AC-INBOX-8's subject is a hand-raised
   summary-×5 member: they see the row and the state, no source, no
   facts, no proposals, no controls, and one line. **That is satisfiable
   and it is not what the acceptance criterion's wording implies**, so
   the plan states it rather than letting an e2e leg quietly redefine it.

**Alternative — widen `extractions_select` to a taint-scoped read —
REJECTED, and the reason matters.** `extractions` has no taint column:
its rows are the facts of a whole document whose taint is not resolved
per row, so a taint-scoped predicate is **not expressible** without
minting one, and minting one would let a member read part of a document's
facts while the document's own taint says otherwise. PRD §7.3 is also
explicit that Summary sees *"not the artifact and not the extracted
contents."* **The `view`-×5 gate on extractions is correct. It is
approval that is too wide.**

**Alternative — enforce it only in the interface — REJECTED.** §3.7's
rule is that access is re-checked at write time, never at render time,
and `hc.approve_proposal` is where write time is. An interface-only rule
is a rule that a second client, a retried request, or slice 7 does not
have.

---

## The two ORDERED rulings from round 16, priced as work

### The arrival-received signal, THEN the `gate → extract` eager fire (Q8)

**Owner ruling D24(3), verbatim in effect:** the eager fire stays
**FORBIDDEN** until an arrival-received signal exists — *a Care Inbox
that revalidates, or a "we're reading it" notice at `Reading`* — so PRD
§4.2.2's promise is true at the moment it is made. **They are a PAIR and
slice 6 takes them in that order: the signal, then the fire.**

**Why the order is the whole ruling.** Taking the fire first is an
obvious latency win that **collapses §4.5's ~35 s window to seconds with
no test failing** (D14's table: 0–60 s of relay dead time, mean 30 s;
extract itself 1.4–6.9 s; `extracted → interpreting` sub-second). The
Care Inbox is a plain server component with no revalidation, so a member
watching it sees a stale snapshot and the cancel button they can see may
already be dead — and PRD §4.8's only arrival email fires at *"Ready to
review"*, the precise instant cancel stops being offered.

**Recommended shape for the signal: the surface tells the truth about
itself.** The Care Inbox revalidates so that `Reading` appears when
reading begins and the cancel affordance is live and accurate. Argued
against the alternative: a notification is PRD §4.8's set, which §11.1
row 11 places in slice 11 *because send-time authorization must be
written once against a complete event set, not eleven times* — building
one email here would pre-empt that decision for the sake of one state.
Revalidation needs **no DDL**, which is why **M6 is expected to close
UNCONSUMED**.

**The ordering is enforced by tests, not by intention.** The fire's unit
lands only after the signal's unit is green, and the fire's own test
asserts the signal is present — so a future refactor that removes the
signal fails the fire's test rather than silently restoring the gap. The
three comments that currently record the withholding
(`app/api/worker/[stage]/route.ts:242`,
`tests/routes/worker-stage.test.ts`, `tests/routes/relay.test.ts`) are
rewritten **in the same commit as the behaviour**, never before it.

**And the window is measured after, not asserted.** PRF-07's harness
reports the new median; if the fire does not close the window it was
supposed to, that is a number in the packet rather than a claim.

### Migrating `lib/pipeline/render.ts` off `mupdf` (Q3, built at B1)

**Owner ruling D24(1):** record now, **swap in slice 6**, before slice 6
builds further on `render.ts`, *"because it gets more expensive every
slice it waits."* AGPL-3.0-or-later §13's network clause is the term that
matters for a hosted service, and `mupdf` is imported server-side in the
request path.

**Priced as B1 — the FIRST unit of the app increment, before anything
consumes it.** Three reasons it is B1 and not a separate increment:

1. **It is app-layer and authors no DDL**, so it cannot ride 6A.
2. **It has a test suite already.** RND-01's 26 cases in
   `tests/pipeline/render.test.ts` plus the eight-leg spike
   (`scripts/spike/mupdf-spike.mjs`) are the acceptance criteria, and
   they are the ones that caught D2's geometry defect. The swap is a
   **replacement under an existing red/green net**, which is the cheapest
   shape a dependency change can have.
3. **Every consumer added first makes it harder.** The review screen is
   about to become `cropRect`'s first production consumer (R3/F-13).
   Swapping before that consumer exists is the whole point of the
   ruling; swapping after it would mean re-proving geometry against a
   screen as well as against a test.

**The acceptance bar is the spike's, re-run and honestly scored.**
R7/F-3 corrected the mupdf spike's own score to **7 of 8 with leg 5
FALSIFIED** — malformed input is *repaired and processed*, not refused —
so the replacement's spike is scored against the corrected bar and its
**hostile-input posture is recorded as what it is**, whichever way the
new engine behaves. Legs: born-digital PDF → page images + text layer ·
phone-photo JPEG → 2576 px long edge, never below · encrypted PDF →
`needs_password` · undecodable bytes → `unsupported_type` · malformed
PDF → the honest verdict, refused or repaired, **recorded either way** ·
**EXIF orientation normalised before geometry** (the door D2 proved must
stay shut) · **true stored pixels read from the header**, never a
no-resolution fallback (D2's exact defect; a 300-dpi scan must not render
at 617×824 and say `rendered`) · **`{page, bbox}` round-trips to the
visible crop.** The four ceilings (page count, page dimensions, wall
clock, output size) keep their named reasons through `normalizeExit`.

**Two owed findings ride the swap because the swap is where they are
cheap.** **R3/F-4** — `maxRenderedBytes` bounds encoded output while the
WASM heap churned ~20 MB per pixmap with nothing `destroy()`ed (measured:
3.5 MB counted against a 463 MB process peak) — is re-priced against the
new engine's actual allocation, so *"the memory bound with a name"*
bounds the right quantity. **R3/F-5** — `wall_clock` sampled between
pages, `toPixmap` exposing no interrupt, the final page never checked,
and a test passing `maxWallClockMs: 0` that cannot distinguish a deadline
from a sample — is re-priced the same way, and its test is rewritten to
assert a deadline.

---

## The 39 owed findings — priced, not inherited

ADR-0023 D24 tallies **39 OWED** in the D17 table. **A mechanical count
of the table's rows returns 40, and the reconciliation is a stale row
this plan records rather than works around.**

> **R8/F-1's row still reads OWED and its work is DONE.** D24 ruling 3
> states that *"R8/F-1's held comments are corrected rather than left
> describing a gap"* and names the three sites; all three are verified
> correct at `main` — `app/api/worker/[stage]/route.ts:242` records the
> withholding and why, `tests/routes/worker-stage.test.ts:298` no longer
> claims "nothing consumes yet", and `tests/routes/relay.test.ts:152-155`
> carries the forward-compat limit R8/F-5 asked for. **This is the third
> instance of the defect the sign-off caught twice** — R3/F-9 and R6/F-6
> both "read OWED and is FIXED" because the row was written before the
> ruling and never revisited. The sweep missed the third. **The row is
> corrected in ADR-0024 at the round-17 dispositions, and the count
> stands at 39** — which is what D24's own tally says.

**The rule this plan uses to dispose of all 39, stated before the
table so it can be argued with:**

> **Slice 6 takes an owed finding whose failure a PERSON now READS, and
> defers the one whose only reader is a worker.**

§4.9 is the first slice with a human in the loop. A wrong reason code, a
missing page, a band that means two things, a blank inbox that should
have been an error — all of those stop being log lines here and start
being sentences a family reads. That is a principled boundary rather
than a convenient one, and it lands **30 taken · 9 deferred**, of which
two of the nine become slice-6 work the moment Q10 is answered yes.

### Taken in this slice (30), and where

| Finding | What it is | Lands at |
|---|---|---|
| **R3/F-8** | `promotedPageKey` defaults to `png`; the majority promote `.jpg` | **M4 + B2** (Q5) — the default is deleted, the ext comes from the manifest |
| **R4/F-6** | Partial promotion is permanent: an `extracted` arrival citing pages with no artifact, non-atomic, no repair path | **M4 + B2** (Q5) — the manifest makes it detectable, and detectable makes it repairable |
| **R3/F-3 + R4/F-4** | Attempt staging leaks on every non-graceful exit; nothing sweeps `render/attempt/**`; the prefix is keyed by a lease id that exists only in the dead invocation's stack, so **the orphan is unreachable by construction** — up to 64 MB of a family's rendered medical pages, outside any future DEL-01 cascade | **B3** — one fix: the nightly route sweeps `render/attempt/**` by prefix age, which needs no lease id. Named on `ingestion-deploy.md` |
| **R4/F-7** | The 120 s read visibility timeout is shorter than the 300 s extract stage, so **mid-flight redelivery is the NORMAL case**, and the second reader archives the in-flight message unconditionally | **B3** — `READ_VT_SECONDS` is raised past the longest stage; `releaseDeferredWork`'s threshold is *derived* from it (R4/F-13, verified positive) so it cannot drift |
| **R5/F-2** | Three `{ data }` destructures still drop `error` — a non-UUID circle segment returns **200 with a blank Care Inbox today**; a DB blip shows a forty-item family its first-run empty state | **B6** — the amplifier behind ADR-0022 D15, on the surface this slice rewrites. An error is an error state, never an empty one |
| **R5/F-13** | Dead `documents` mock scaffolding remains from the RED draft — *"it would silently serve fixtures to the one query shape most likely to reintroduce D15"* | **B6** — and it stops being latent here, because the receipt adds real `documents` reads |
| **R5/F-6 · F-7 · F-8** | `/[circle]/senders` has **no browser coverage at all** (which is why D4's render throw shipped); every `?e=` marker the submit routes emit is written and never read; the only link to the surface sits inside the non-empty branch | **B6 + B9** — every app route joins a **pinned** audit list, the `?e=` markers get read and rendered, and the link moves to the shared branch |
| **R4/F-12** | A `profile_fact` with `field: null` is drafted and raises **`23502` at approval — a raw Postgres error at the moment a person clicks approve** | **M1** — squarely this slice's: it is the click that this slice builds |
| **R4/F-10** | A stage-2 duplicate yields a silent `invalid_state` at interpret, which §4.2 says must raise a defect signal | **M1 + B3** — warn like `processGate` does, or absorb it explicitly |
| **R4/F-11** | `msg.facts` is trusted with no runtime validation: a non-array skips **both** the artifact re-read and the operator note — the thin-answer-that-looks-normal D6 rules out | **B3** |
| **R4/F-15** | `processInterpret` discards `answer.dropped` — *"under D1's defect every conflict was dropped and the counter that would have said so was never printed"* | **B3** — and the count reaches §10.4 |
| **R1/F-4** | `typeof null === 'object'`, so `fields: null` passes the shape guard and throws at the field loop — the one malformed shape that does not fail closed, landing in an unacked-redelivery poison loop | **B4** |
| **R1/F-6** | `HC_BANDS_ARTIFACT` appears in one file and no ops row; an owner can complete every G9 step and still run all-high forever with no log line saying so | **B4 + `ai-provider.md`** — and the screen now *renders* the mode, so a silent all-high becomes visible to a person, not only to a log |
| **R1/F-7** | `artifact_partial` has five rejection conditions and one test — *"in the file the packet calls 'must not be wrong', an untested branch is one a refactor can invert"* | **B4** |
| **R6/F-11** | `absent_fields` is never read; non-banded fields get artifact rows with `precision: 0` that no band covers | **B4** — this is Q4's `uncalibrated` state, arriving from the other end |
| **R2/F-5 + R2/F-14** | No 429/`retry-after` arm — a transient rate limit burns three durable attempts over 900 s and a permanent 400 is retried three times and then labelled **"budget exhausted"**; and `overloaded_error` is HTTP **529**, not the 503 the fixture returns | **B4** — taken because **slice 6 is the first slice in which a person READS that label.** *"Couldn't read it — it ran out of retries"* on a rate limit is a lie told to a family. The lease stays the only counter; the arm is status-aware, not a retry loop. F-14 lands with it because it is load-bearing the moment F-5 is fixed |
| **R2/F-8** | `maxRenderedBytes` is 64 MB; the API limit is **32 MB per request** and inline base64 inflates by 4/3, so renders between ~24 MB and 64 MB are accepted by our ceiling and rejected by the provider — then mislabelled per F-5 | **B1** — the rasterizer swap re-sets the size budget by necessity, so this is where it is free |
| **R2/F-9** | `model_context_window_exceeded` is in the SDK's `StopReason` union and unhandled; it falls through to "no text content" → `provider_error`. At 200 pages × ~4784 tokens the state is reachable by a document PRD §13.3 permits | **B4** — rides F-5's status-aware arm; a person reads this one too |
| **R3/F-4 + R3/F-5** | The memory bound counts the wrong quantity (3.5 MB counted against a 463 MB peak); `wall_clock` is sampled between pages with no interrupt and the final page is never checked, and its test cannot distinguish a deadline from a sample | **B1** — re-priced against the new engine's real allocation, and the test rewritten to assert a deadline |
| **R3/F-6 + R3/F-7** | Every corpus item is single-page and the text layer is concatenated with no page markers, so **`citation.page` is always 1**; and the harness discards the citation before scoring, so **NOTHING anywhere measures whether a bbox lands on its value** — a model with perfect values and uniformly wrong boxes scores **1.00** | **B10** — G9 conditions 3 and 4. **Boxes are what this slice renders**, so this is not inherited work, it is this slice's own calibration |
| **R6/F-4** | The harness writes a manifest `loadBands` rejects as `artifact_partial` **FOREVER**, indistinguishable from the shipping default at the call site — and **nobody has written down how a measured number becomes a threshold** | **B10** — the rule is written, in the spec, before any run can produce a signable artifact |
| **R6/F-10** | Expected labels collapse last-wins, predictions first-wins, `support` counts once per item — the first multi-valued item silently halves claimed support and scores the wrong one | **B10** — §7's growth is exactly what surfaces it |
| **R7/F-4** | §6.3's email row (D12) | **Q6 + M4 + B2** |
| **R8/F-10** | The live idempotence assertion is a global claim over a shared queue; it holds today by file ordering and teardown | **B9** — scoped to the circle under test, in the suite this slice adds cases to |

### Deferred (9), each with the reason

**All nine are provider-adapter or eval-harness hygiene whose only reader
is a worker or a build script.** Taking them here would open `lib/ai/`
under the `claude-api` gate for work whose consumer is the extract worker
— the wrong slice — and would spend round-17's attention on a surface
this round cannot exercise.

- **R2/F-2** (the timeout fixture's 1.5 s deadline is under
  `FINALIZE_RESERVE_MS`, so the request is never dispatched and the
  `HC-FIXTURE-HANG` branch is dead code at the gate) · **R2/F-4**
  (`scripts/eval/run.ts` re-implements block assembly instead of calling
  the shared builder) · **R2/F-6 = R7/F-5** (`usage` is carried and never
  read; §6.6's "checked, not assumed" is a garbage-collected struct
  field) · **R2/F-12** (one of four absence assertions is vacuous; all
  four run only against the extract path).
- **R2/F-3** — the configuration hash omits the trailing user
  instruction, the delimiter builders and `asJPEG(90)`, so **the pixels
  the model sees can change with an identical hash.** Deferred from the
  screen, **and NAMED AS A PRE-CONDITION OF Q10**: together with R2/F-4,
  a band signed from a third construction site, behind a hash that does
  not cover the pixels, is a band signed against something other than
  what shipped. They are not slice-6 work; they are **G9-purchase
  work**, and the plan says so rather than letting them ride a screen.
- **R3/F-12** (the harness normalises with the *declared* mime while the
  worker sniffs — agrees on today's 28 fixtures, latent) — rides Q10.
- **R6/F-16** (re-collecting a batch throws `EEXIST` *after* the API
  round-trip — **the one command that costs money to produce**) and
  **R6/F-17** (the PDF writer truncates non-Latin-1 silently, so the
  next non-Latin-1 label is a silent mislabel rather than a build
  failure) — **these two become slice-6 work the moment Q10 is answered
  yes**, because both are defects in the act of growing the corpus.

---

## The increment — the split, argued (Q1)

**Recommended: 6A (DB, M1–M7) → round 17 → merge; then 6B (app, B1–B10)
→ round 18.** The 2A/2B, 4A/4B and 5A/5B cadence, fourth time. **The
argument, not the preference, is below — including the case against.**

### The case for ONE increment, stated at its strongest

§4.9's machinery is shipped. `proposal_commits` since 1B,
`hc.approve_proposal` since 1B, the conflict arm since 5A M4, versioning
and idempotency and write-time re-check with them, all driven by pgTAP
013/052/054/055. The kickoff's own framing is that *"what has never
existed is the SURFACE, the receipt, or item-level granularity"* — and a
surface is app work. A DB increment for a surface slice risks minting
exactly what ADR-0023 D15 Q-E ratified NOT minting: `source_extraction_ids`
was deferred **because "the shape depends on what the review screen needs,
and guessing now mints a column that gets rebuilt."** Splitting DB-first
is the shape most likely to reproduce that mistake.

**That argument is right about the risk and wrong about the facts.**

### What the tree says — four things the app layer cannot do

Verified by grep against all 62 migrations in this planning session:

1. **The loop cannot close, by construction.** Across all five
   `insert into hc.arrival_transitions` blocks in the tree,
   `proposals_ready` appears **exactly once — as a `to_state`**
   (`20260816010009:66`, `interpret · interpreting → proposals_ready`)
   and **never as a `from_state`**; and **`'filed'` appears in no
   transition row at all.** `filed` is an enum value with a `state_rank`
   (21) and a product label (*"Filed"*) that **nothing can reach**.
   `proposals_ready` is, in the graph, a terminal state — and
   `hc.manual_entry` has been creating arrivals directly into it since 1C
   (`20260816010006:100`), so manual entries have had no exit either.
   §4.2.2's `Filed` and `Nothing filed` — and **AC-INBOX-4** with them —
   are unreachable today, and by ING-10's own closed-graph philosophy
   they must become reachable by **graph DDL**, not by machinery that
   refuses a state the graph still permits.
2. **A proposal cannot be rejected.** The only writer of
   `status = 'rejected'` anywhere in `supabase/` is
   `hc.approve_proposal`'s conflict `keep` arm (`20260821120004:427`).
   `proposals.reject_reason` exists with a CHECK binding it to
   `status = 'rejected'`, and **nothing can ever satisfy it.** §4.2.3's
   Approve · Edit · **Reject**, and the one-tap reason feeding §10, have
   no write path.
3. **The receipt has no read path.** `proposal_commits` grants are
   `select, insert … to hc_internal`; its two policies are internal-only;
   `authenticated` holds nothing. §4.2.4's receipt *is* a read of that
   table joined to the destinations. No amount of app-layer care produces
   it.
4. **Approval is wider than evidence** — Q7's finding, above. Fixing it
   is one predicate inside `hc.approve_proposal`, and §3.7's rule is that
   access is re-checked **at write time**, which is a place only DDL
   reaches.

**None of these four is a guess about what the screen needs.** Each is a
gap between what the spec requires and what the database permits, and
each is decidable from the spec alone. That is the exact opposite of
Q-E's mistake, and it is the line this plan draws:

> **6A takes only what the screen cannot decide and must not guess. Anything
> whose SHAPE depends on the screen's design stays out of 6A** — Q-E's
> `source_extraction_ids` stays deferred, and any grouping, ordering or
> denormalisation convenience is app-layer composition over the grants
> that already exist, or it waits for M6.

### Why not three increments

A third increment (6A DB · 6B screen · 6C receipt + OCR + a11y) is
rejected: the receipt is the **same transaction boundary as approval**,
so a review boundary between them would cut through one guarantee; and
A11Y-07 must be designed **into** the screen, not added after it — §8.7's
own words are that a structural accessibility failure found at G12 *"is a
redesign, not a fix."* Three rounds for one TSD section is more cadence
than the work carries.

### The condition under which one increment would have been right

Stated so the owner can rule the other way with the argument in hand:
**if Q7 resolves to "no DB change — the interface hides the control", and
if the owner accepts a `filed`/`nothing_filed` arm driven by app code
against an unchanged graph, then 6A shrinks to the receipt grant and the
rendition manifest, and a single increment is defensible.** This plan
recommends against both, for the reasons at §4.4 and at point 1 above —
but the split follows from those rulings rather than standing on
precedent alone, and it should.

### 6A — the database increment (migrations M1–M7, bound ≤ 7)

| # | File | Contents | Spec |
|---|---|---|---|
| M1 | `inherited_obligations` | The owed-DB batch, landing FIRST (the R8 / 5A M1 precedent). (1) **R4/F-12**: a `profile_fact` payload with `field: null` is guarded where `domain` is already guarded, so `23502` can never surface as a raw Postgres error at the moment a person clicks approve — it becomes a drafted proposal that is refused honestly, or is not drafted. (2) **R4/F-10**: a stage-2 duplicate reaching interpret raises the §4.2 defect signal instead of returning `invalid_state` silently — `processGate`'s shape, applied to `processInterpret`. | ADR-0023 R4/F-10, R4/F-12 |
| M2 | `review_boundary` | **Q7's ruling.** `hc.approve_proposal` gains ONE predicate: the actor must clear `hc.visible_at(hc.ctx(), subject, hc.all_domains(), true, 'arrival', arrival_id, null) >= 'view'` — the same predicate `hc.log_artifact_read` and the artifact route already enforce — **in addition to** `manage` over the object's taint. Refusal rides the existing `approval_refused` shape (DEF-10), so nothing leaks. **Plus `hc.extractions_for(p_arrival)`** — ADR-0019 Q-C's queued candidate, whose consumer is now real: the review screen's fact read, gated at the SAME `view`-on-all-five as `extractions_select`, returning field, value, confidence, `risk_class`, citation, `model_id` and `prompt_version` in a stable order. **No band column, by design (Q4):** the band is a property of the calibration, not of the fact. pgTAP drives the narrowing two ways — a manage-on-taint actor WITHOUT view×5 is refused, the same actor WITH it succeeds — and the existing 013/054 approval cases are re-pinned so the narrowing cannot silently break them. | §3.7, §4.9, §6.4; PRD §6.4, §7.3; ADR-0019 Q-C |
| M3 | `decide_proposal` | **The loop closes here, and it closes in the GRAPH.** (1) **`hc.reject_proposal(p_proposal_id, p_expected_version, p_idempotency_key, p_reason)`** — the mirror of approve: same versioning refusal, same idempotency identity through `approval_attempts`, same write-time authorization, writing `status='rejected'`, `decided_by`, `decided_at` and `reject_reason` (the CHECKs at `20260815230001:83`/`:85` already anticipate exactly this and nothing has ever satisfied them), **no `proposal_commits` row, nothing to the record.** The reason vocabulary is §4.2.3's — `wrong · already handled · not important · other` — bounded in the migration, feeding PRD §10. (2) **The terminal arm**: `hc.arrival_transitions` gains `('review', 'proposals_ready', 'filed')` and `('review', 'proposals_ready', 'nothing_filed')`, with **ING-10's exact-set pin and 046's rank/label guard re-pinned in the same commit** (the 2A M6 / 4A M6 / 5A M5 append discipline). The rule that drives them is settled HERE, not in the app: an arrival terminalizes when **every live proposal is decided** — `filed` if at least one closed `approved`/`edited_approved`, `nothing_filed` otherwise — evaluated inside the deciding transaction so the last decision and the terminal transition commit together or not at all. **AC-INBOX-4's letter**, and the original artifact is untouched by either outcome. pgTAP drives: reject-all ⇒ `nothing_filed` · approve-one-reject-rest ⇒ `filed` · the last-decision race between two coordinators ⇒ exactly one terminal transition · a superseded proposal does not hold the arrival open. | §4.9, §4.2; PRD §4.2.2, §4.2.3, AC-INBOX-4 |
| M4 | `renditions` | **Q5's manifest.** A rendition row written **in the same transaction as `hc.finalize_extraction`** — arrival, page count as RENDERED, extension per page — so it exists exactly when the facts that cite it exist, and a cancelled or superseded attempt writes nothing (§4.5, unchanged). Readable by `authenticated` at the SAME `view`-on-all-five gate as the pages themselves, so the screen and the artifact route cannot disagree. **This closes R4/F-6**: partial promotion becomes *detectable* (manifest vs objects present) and therefore *repairable* — a missing page is named on screen rather than served as a 404, and a re-render/re-promote path is expressible against a recorded shape for the first time. **And it closes R3/F-8** by making the extension a fact rather than a default. If Q6 rules RENDER, the email rendition is the same row shape — which is the point: an email arrival stops being the one class with no rendering to cite. | §6.3, §6.4, §4.5; ADR-0023 R3/F-8, R4/F-6 |
| M5 | `receipt` | **`hc.receipt_for(p_arrival)`** — §4.2.4's receipt as a definer read, because `proposal_commits` has no member grant and should not get a blanket one: the function returns, for one arrival the caller can see, each committed proposal's object type, object id, and the destination's own display fields, **filtered by the caller's own visibility of each destination** (a task the caller cannot see is counted, never named — the §3.5 log-level discipline). Rejected proposals are returned as decided-and-not-written, so *"nothing filed"* is a statement the receipt can make rather than an absence it implies. Authorization is the arrival's `view`-on-all-five, matching M2 — **one gate across the whole surface** is the property this migration exists to establish. | §4.9, §2.4, §3.5; PRD §4.2.4, AC-INBOX-9 |
| M6 | *(reserved)* | Round-17 dispositions — the standing precedent since 2A. | — |
| M7 | *(reserved, NAMED)* | **Q8's DB half, contingent.** If the owner's answer to Q8 is the recommended one — a Care Inbox that revalidates — **M7 is NOT consumed and the bound closes at 6 of ≤ 7.** If the answer needs a durable signal row or an outbox event, M7 is where it lands, consumed only with the Q8 ruling quoted in the commit message; otherwise an owner amendment. **The plan over-provisions by one slot deliberately**, which is the direction to err given slice 5's bound was amended twice mid-round. | Q8; ADR-0023 D14/D24(3) |

**6A test plan.** pgTAP **059–063**, one file per migration — refusal
shapes, replay, privilege closure catalog-based (the segfault trap:
function-ACL denial segfaults this Postgres image, so closure is asserted
from the catalog, never by calling as a denied role). The named cases:

- **M2's narrowing, driven both ways** — a manage-on-taint actor WITHOUT
  `view`×5 refused in the `approval_refused` shape; the same actor WITH
  it succeeds; a coordinator (manage×5, therefore view×5) unaffected. The
  existing 013/054 approval cases re-pinned in the same commit so the
  narrowing cannot silently break what already passes.
- **M3's terminal arm**, case by case — reject-all ⇒ `nothing_filed` ·
  approve-one ⇒ `filed` · a superseded proposal does not hold the arrival
  open · the graph refuses `proposals_ready → filed` from any stage other
  than `review` · **ING-10's exact set and 046's rank/label guard
  re-pinned in the same commit as the append.**
- **M3's reject idempotency** — the same key replays; the same key with a
  different *decision* conflicts and writes nothing (the ING-11 / 5A-M4
  identity pattern, extended to reject).
- **M4's atomicity** — a cancelled attempt writes no rendition; a
  superseded lease's rendition is not published; the manifest's page
  count matches what `finalize_extraction` was handed.
- **M5's filtering** — a destination the caller cannot see is COUNTED and
  never NAMED; the receipt of an all-rejected arrival says so.

**Concurrency additions (CI, teed** — the standing transient protocol:
tee always, case-1 `40P01`s are the deliberate repro**):** two
coordinators deciding the LAST two proposals simultaneously ⇒ exactly one
terminal transition · approve vs reject on one proposal ⇒ one decision,
one `approval_attempts` row, the loser refused · a grant lowered between
render and approve ⇒ `approval_refused` (§4.9's write-time re-check,
now including M2's `view` predicate) · a freeze committing mid-decision
(the R-rule) · rendition write vs cancellation (M4 against §4.5).

**CI:** `verify-migration-state` exact counts 62 → 62+N · upgrade leg
green · `db:verify` clean under `--fail-on warning`.

### 6B — the app increment

| # | Unit | Contents | Spec |
|---|---|---|---|
| B1 | **The rasterizer swap** | **FIRST, before any consumer** (D24 ruling 1). `mupdf` out, `pdfjs-dist` + `@napi-rs/canvas` in, each licence re-verified from its installed manifest and the output pasted into the red commit. Acceptance is the spike's eight legs re-run against the **corrected 7/8 bar** (R7/F-3: leg 5 FALSIFIED — malformed input is repaired, not refused — so the new engine's hostile-input posture is RECORDED as whatever it is, never scored as a pass it did not earn), plus RND-01's 26 existing cases green unchanged. **True stored pixels read from the header** (D2's exact defect — a 300-dpi scan must never render at 617×824 and say `rendered`), **EXIF orientation normalised before geometry** (the door D2 proved must stay shut), `{page, bbox}` round-tripping to the visible crop. Rides: **R2/F-8** (the size budget re-set against the API's 32 MB request limit, not our 64 MB output ceiling — inline base64 inflates 4/3), **R3/F-4** (the memory bound made to count the quantity that actually grows), **R3/F-5** (a real deadline, and a test that can tell a deadline from a sample). | §6.3; D24(1); ADR-0023 R2/F-8, R3/F-4, R3/F-5, R7/F-3 |
| B2 | **The rendered source, contracted** | M4's manifest consumed: `promotedPageKey`'s `ext` becomes REQUIRED and comes from the manifest (**R3/F-8**); the artifact route gains a page parameter under its existing clean-gate + evidence-before-bytes discipline (no second byte path, the fence stays uniform); a page named by the manifest and absent from storage is **reported, not 404'd** (**R4/F-6**). **If Q6 rules RENDER**: the email body's sanitised, resource-free rendition joins §6.3's table as code — **no remote fetch of any kind** (images, stylesheets, fonts, `srcset`, `@import`), no script, no redirect following, byte and dimension ceilings before any decode. **A network call attempted during an email render is a TEST FAILURE**, asserted, not a review note (PRD §4.2.8's inert-links rule, carried to rendering). | §6.3, §6.4, §1.3; PRD §4.2.8; Q5, Q6 |
| B3 | **The pipeline owed batch** | The staging sweep — the nightly route sweeps `render/attempt/**` by **prefix age**, which needs no lease id and therefore reaches the orphan that is *"unreachable by construction"* (**R3/F-3 + R4/F-4**, fixed once); the row is named on `ingestion-deploy.md`. `READ_VT_SECONDS` raised past the longest stage so mid-flight redelivery stops being the normal case (**R4/F-7**), with `releaseDeferredWork`'s derived threshold asserted to move with it (R4/F-13). `msg.facts` validated at runtime (**R4/F-11**). `answer.dropped` read, logged and counted to §10.4 (**R4/F-15**). The stage-2 defect signal (**R4/F-10**, app half of M1). | §4.5, §4.11, §2.12; PRD §10.4 |
| B4 | **The band consumer** | **Q4's ruling as code.** `confidenceBand` returns the three-state discriminated result; the screen renders `all_high` **once, globally** and `uncalibrated` **per fact**, honestly (**R6/F-11** arrives here from the other end). The band-mode is **logged and rendered**, so a silent all-high is visible to a person and not only to a log line nobody reads, and `HC_BANDS_ARTIFACT` gains its `ai-provider.md` row (**R1/F-6**). `fields: null` fails closed instead of poison-looping (**R1/F-4**); `artifact_partial`'s five conditions each get a test (**R1/F-7**). And the reason-code arm: status-aware 429/`retry-after` handling with the lease still the only counter, `overloaded_error` at **529**, and `model_context_window_exceeded` mapped honestly (**R2/F-5, F-9, F-14**) — **taken here because slice 6 is the first slice in which a person READS the label.** | §6.5, §6.8; PRD §6.4, §10.4 |
| B5 | **The signal, THEN the fire** | **Q8, in that order, as two commits.** (1) The Care Inbox tells the truth about itself: `Reading` appears when reading begins, and the cancel affordance shown is live and accurate — never a control that is already dead. (2) ONLY THEN `fireWorker(origin, 'extract', key)` joins scan, gate and interpret, and the three comments recording the withholding are rewritten **in the same commit as the behaviour**. The fire's own test asserts the signal is present, so a later refactor that removes the signal fails the fire's test rather than silently restoring the gap. PRF-07 reports the new median rather than the plan asserting it. | §4.5; PRD §4.2.2; D24(3) |
| B6 | **The Care Inbox, hardened + the arrival route** | The list surface this slice inherits stops lying: the three `{ data }` destructures read `error` and render an **error state, never an empty one** (**R5/F-2** — a non-UUID circle segment returns 200 with a blank Care Inbox *today*; a DB blip shows a forty-item family its first-run empty state). Dead `documents` mock scaffolding removed before the receipt adds real `documents` reads (**R5/F-13**). Every `?e=` marker the submit routes emit is READ and rendered (**R5/F-7**), and the `/senders` link moves to the shared branch so whatever empties `parents` cannot also remove the path to the surface governing who may write (**R5/F-8**). Then the new `[arrival]` route: authorization resolved ONCE per request into the four gates M2 unified, and the summary-member case rendered per **AC-INBOX-8** as §4.4 states it. | PRD §4.2.1, §4.2.7; ADR-0023 R5/F-2, F-7, F-8, F-13 |
| B7 | **The review screen** — §4.2.3's three regions | **The slice's centre, and A11Y-07 is part of its definition of done, not a follow-up** (§8.7: a structural accessibility failure found at G12 *"is a redesign, not a fix"*). **The source**: the promoted pages, page navigation, and the crop cut with `cropRect` — its first production consumer (R3/F-13). **What we read**: `hc.extractions_for`'s facts grouped by kind, each with its citation, its `risk_class` and Q4's three-state band treatment; selecting a fact highlights its cited region, selecting a region scrolls to the facts drawn from it. **What we propose**: each item independently **Approve · Edit · Reject**, and **NO control anywhere that approves more than one** (AC-INBOX-3 — asserted as a test over the rendered tree, because `proposal_commits` already makes it structurally true and the interface's only job is to not smuggle it back). Conflicts render §4.2.5's three outcomes as a choice, never a default. Versioning: `version` rendered, submitted as `p_expected_version`, and a `proposal_version_changed` / `proposal_taint_changed` refusal **re-renders with what changed highlighted** rather than showing an error. Presence, muted, not locking — `hc.presence(p_subject)` already exists at subject grain, and **the copy says what the function knows** (*"Dan is in Nell's record"*), never more. All-high-risk is the mode: **every** approve control stays inactive until its crop is on screen, and `confirm_high` is what the person's action means. 390 px stacks the regions (§8.8, PRD §13.4). | PRD §4.2.3, §4.2.5, §4.2.9, §6.4, AC-INBOX-2/3/8; TSD §4.9, §6.4, §6.5, §8.7 |
| B8 | **Editing, the receipt, and the loop closing** | **Where an edit lands is Q7's smaller sibling and is settled here:** a corrected value rides `p_edits` into the approved object and **the `extractions` row is never rewritten** — the extraction is the honest record of *what the model read*, and rewriting it would destroy the `(model_id, prompt_version)` trace the G9 eval calibrated, turning every re-calibration into a backfill. The edit is recorded on the commit, so the receipt can say a value was corrected. Then §4.2.4's receipt over `hc.receipt_for`: what went where, with links that **resolve** for tasks and timeline (both surfaces are live) and that **say plainly** where a destination surface does not exist yet — never a dead link, never a silent omission. `hc.reject_proposal` and M3's terminal arm consumed: reject-all lands `Nothing filed` with the original intact and re-readable (**AC-INBOX-4**), one approval lands `Filed`. | PRD §4.2.3, §4.2.4, AC-INBOX-4/9; TSD §4.9, §6.4 |
| B9 | **OCR (§6.9), A11Y-08, and the audit list pinned** | OCR for image-only sources through `tesseract.js`, written as the `p003.txt` siblings the slice-5 exit assertion reserved — **so neither the stored coordinates nor the promoted artifact changes, exactly as pinned.** Labelled **"machine-read — may contain errors"** everywhere it appears; **page and citation navigation work over it exactly as over native text** (A11Y-08's parity); where confidence is poor it says so rather than presenting garbage as text. **OCR is never an approved fact and never provenance** — it is stored on the artifact, not in `extractions`, and the citation still resolves to a region of the image (§6.9's letter). Plus: **every app route joins a PINNED a11y/browser audit list** (**R5/F-6** — `/senders` shipped a render throw precisely because it had no browser coverage at all, and a list that is not pinned is a list that stops growing), and the live idempotence assertion is scoped to the circle under test (**R8/F-10**). | §6.9, §8.7; PRD §13.5; ADR-0023 R5/F-6, R8/F-10 |
| B10 | **The corpus, and what would open G9** | **G9 conditions 3 and 4, which are this slice's own calibration and not inherited work.** (a) **The threshold rule written down** (**R6/F-4**): how a measured `{precision, recall, support, tp, fp, fn}` becomes the `high`/`medium` pair `loadBands` requires — in `g9-corpus-spec.md`, before any run can produce a signable artifact, because today the signed digest would fail closed as `artifact_partial` FOREVER and be indistinguishable from the shipping default. (b) **Citation correctness measured** (**R3/F-7**): `Prediction` carries the citation, and the scorer reports whether a bbox lands on its value — *"boxes are what this slice renders"*, and a model with perfect values and uniformly wrong boxes must stop scoring 1.00. (c) **A multi-page fixture** (**R3/F-6**), so `citation.page` is exercised at all and the image-order↔page-number correspondence is tested rather than assumed. (d) Multi-valued support counted correctly (**R6/F-10**). **If Q10 is answered YES**, §7 row 1's growth lands here — with an EMAIL item, which Q6 makes possible — and **R6/F-16 + R6/F-17 come with it**, because both are defects in the act of growing the corpus. **`tests/eval/corpus.test.ts` goes RED on growth by design: the red is the signal to re-pin in the same commit as the ADR recording the change, never to loosen. A floor is not lowered to meet an apparatus.** | §6.10; ADR-0023 D11, D24(2), R3/F-6, R3/F-7, R6/F-4, R6/F-10 |

**The inter-slice seam, stated honestly (Q9).** **Entry:** proposals
rest at `pending` exactly as slice 5's Q7 seam left them; `Needs you`
becomes an actionable label rather than a true-but-inert one, and nothing
re-derives the work. **Exit — and it is a partial exit, said plainly:**

- **The loop CLOSES for the record.** A person approves, the object is
  written, `proposal_commits` claims it, the arrival reaches `Filed` or
  `Nothing filed`. That is §11.1 row 6's whole claim and it is met.
- **AC-INBOX-9 is only partly satisfiable and gets a `pending` row rather
  than a green one.** *"The receipt links to every destination and each
  link resolves to the created object."* Tasks and Timeline resolve today
  — both surfaces are live RLS reads. **Documents and profile facts have
  no surface at all**; they are §11.1 row 7's. So the receipt **names
  every destination and links the two that exist**, and says plainly that
  the others open in the next slice. **Never a dead link, never a silent
  omission, and never a green coverage row for a criterion half met** —
  the SIG-01 precedent, which slice 5 refused to absorb and this one
  refuses too.
- **AC-INBOX-5 and AC-INBOX-13 (multi-attachment group review) are
  NAMED-EXCLUDED**, below, with their reason.
- **Production activation remains G4/G7-gated throughout**, so no family
  sees any of this. **The G9 gate stays OPEN** and all-high-risk stays the
  mode — which is why the screen is designed for that mode rather than
  degraded into it.

The deploy-checklist family grows: `ai-provider.md` gains R1/F-6's
band-mode row; `ingestion-deploy.md` gains B3's staging-sweep row;
`e2e-local-gate.md` gains the review-screen and OCR legs.

---

## Test surface

**pgTAP (CI):** **059–063**, one file per planned migration (extending to
064/065 only if M6/M7 are consumed) — M2's narrowing driven both
ways with 013/054 re-pinned in the same commit · M3's terminal arm case
by case, with **ING-10's exact set and 046's rank/label guard re-pinned
alongside the graph append** · M3's reject idempotency including the
same-key-different-decision refusal · M4's atomicity against cancellation
and supersession · M5's count-never-name filtering. Privilege closure
**catalog-based throughout** — a function-ACL denial segfaults this
Postgres image, so closure is read from the catalog and never probed by
calling as a denied role.

**Concurrency (CI, teed):** the five named 6A cases. The standing
transient protocol applies unchanged: **tee always**, and case-1 `40P01`s
in the DB log are the deliberate repro, not a defect.

**vitest (CI):** the rasterizer swap against RND-01's existing 26 cases
plus the corrected spike bar · the rendition manifest and the
required-`ext` contract (both extensions asserted; the old default
unrepresentable) · **an email render that attempts a network call fails
the test** · `confidenceBand`'s three states, each rendered distinctly ·
the band-mode log and the fail-closed shapes with one test per rejection
condition · the status-aware provider arm (429 with `retry-after`, 529,
`model_context_window_exceeded`, and a permanent 400 that does NOT burn
three attempts) · the inbox's error-vs-empty distinction driven by an
injected query error · **a rendered-tree assertion that no control
approves more than one proposal** · version- and taint-refusal
re-rendering · `hc.extractions_for` / `hc.reject_proposal` /
`hc.receipt_for` against the live DB · fence re-pins (the `lib/eval/blind`
partition fence and the `lib/hc` / storage-plane fences unchanged and
asserted). The four-class taxonomy labels every row.

**Local gate (browser truth, LOCAL-only — never CI):** the
`e2e-local-gate.md` protocol gains the review legs, with the
fixture-server prerequisite already in place beside clamd. New legs:
**review** — arrival at `Needs you` → open → source renders → select a
fact → its region highlights → the crop is on screen → approve one item
→ the receipt names it and the link resolves · **reject-all** →
`Nothing filed`, original still viewable · **conflict** → the three
outcomes offered, `use_new` supersedes and the old value is still
readable · **stale** → a second session bumps the version, the first
approval refuses and re-renders with the change highlighted ·
**below-cliff** → the summary-×5 member sees the row, no source, no
facts, no controls, one line · **A11Y-07** — full keyboard operation:
Tab between facts, Enter selects and moves focus to the cited region,
logical focus order across the three regions, at 390 px and at desktop ·
**A11Y-08** — OCR labelled, and page/citation navigation working over
machine-read text exactly as over native text. **walkthrough 11/11 +
a11y 5/5 + ingestion 8/8 + the extraction leg re-run UNCHANGED** at every
head whose `app/ lib/ e2e/ supabase/` trees move (F12), with the gate's
new total stated exactly rather than as "unchanged".

**The two-session trap governs every one of these.** `db:reset`,
`test:db`, `test:e2e` and `test:concurrency` are GLOBAL and destroy a
peer session's in-flight run with no error on either side. Check for a
live peer `node.exe` first — a `next dev` and a fixture server on 8787
were up throughout the 5B sign-off **and are up now** — and stage
EXPLICIT paths, never `git add -A`. Run `test:db` only on a clean
`db:reset` or 031/039/041/053 fail with "Bad plan" drift that is not a
defect. A stale `ai-fixture-server.mjs --port 8787` blocks `test:e2e` at
startup BY DESIGN; identify it by start time before killing anything.

---

## Coverage rows to open (`docs/coverage.md` gains "## 6 — the Care Inbox")

| ID | Assertion (compressed) | Layer | Slice | Status at slice end |
|---|---|---|---|---|
| REV-01 | **One authorization gate across the review screen**: approval narrowed to require `view` on the arrival IN THE DATABASE as well as `manage` on the object's taint (Q7), so no member can approve a fact whose source and citation are invisible to them; the summary-×5 member sees the row, no source, no facts, no controls, one line (AC-INBOX-8) | pgTAP + app + e2e | 6A/6B | green |
| REV-02 | **Item-level approval, in the interface as well as the database**: no control approves more than one proposal (AC-INBOX-3, asserted over the rendered tree); `version` rendered and submitted, a version or taint refusal re-renders with the change highlighted; idempotency keyed per attempt; access re-checked at write time (AC-INBOX-12) | pgTAP + app + e2e | 6A/6B | green |
| DEC-01 | **The loop closes in the GRAPH**: `hc.reject_proposal` with §4.2.3's bounded reason vocabulary; `proposals_ready → filed \| nothing_filed` appended with ING-10's exact set and 046's guard re-pinned in the same commit; reject-all ⇒ `Nothing filed` with the original intact and re-readable (AC-INBOX-4); the last-decision race yields exactly one terminal transition | pgTAP + app + e2e | 6A/6B | green |
| CIT-01 | **A citation resolves to a region a person can see**: `cropRect` in production, the crop on screen before the approve control activates for EVERY field in all-high-risk mode (PRD §6.4, §6.5), selecting a fact highlights its region and selecting a region scrolls to its facts (AC-INBOX-2) | app + e2e | 6B | green |
| RND-02 | **The rasterizer is permissively licensed and the rendition is a fact**: `mupdf` (AGPL-3.0-or-later) removed and `lib/pipeline/render.ts` migrated to `pdfjs-dist` + `@napi-rs/canvas` (Apache-2.0 + MIT), licences verified from the installed manifests, the spike re-run against the corrected 7/8 bar; the rendition manifest written in `finalize_extraction`'s transaction; `promotedPageKey`'s `ext` required; partial promotion DETECTED and reported rather than served as a 404 | app + review | 6A/6B | green |
| RCP-01 | **The receipt**: `hc.receipt_for` names every destination of an approved arrival, counts what the caller cannot see and never names it, states rejected-and-not-written, and links the destinations whose surfaces exist | pgTAP + app + e2e | 6A/6B | green |
| RCP-02 | *(staged forward)* **AC-INBOX-9 in full** — every receipt link resolves to the created object, including Documents and profile facts | app + e2e | **7** | **pending** — Documents and People & roles are §11.1 row 7's; the receipt names them and says so today, and the row is NOT absorbed |
| CNF-02 | **§4.8's three outcomes through the SURFACE** — the app half of CNF-01, whose conflict arm only began working at round 16's `c15d764` and has never been exercised by a human: the choice is offered with no default, `use_new` supersedes with both provenances readable, `keep_both` commits the task as the approval's one object | app + e2e | 6B | green |
| OCR-01 | **§6.9 — a reading aid, never a fact**: OCR for image-only sources as `pNNN.txt` siblings (the slice-5 exit assertion honoured — neither stored coordinates nor promoted artifacts change), labelled "machine-read — may contain errors", never in `extractions`, never provenance, poor confidence stated rather than garbage presented | app + e2e | 6B | green |
| A11Y-07 | *(flip — pending since slice 3)* Full keyboard operation of the review screen incl. citation navigation: Tab between facts, Enter selects and moves focus to the cited region, logical focus order across the three regions | e2e | **6** | **green (6B)** |
| A11Y-08 | *(flip — re-tagged 5/6 → 6 at the slice-5 gate)* OCR labelling + page/citation navigation parity over machine-read text | app + e2e | **6** | **green (6B)** |
| EVA-02 | **What would open G9, made mechanical**: the threshold rule WRITTEN — how a measured number becomes a band (R6/F-4) — citation correctness SCORED so a model with perfect values and wrong boxes can no longer score 1.00 (R3/F-7), a multi-page fixture so `citation.page` is exercised at all (R3/F-6), multi-valued support counted correctly (R6/F-10) | review + harness | 6B | green (the conditions; **the G9 GATE ITSELF STAYS OPEN** — it closes only at owner sign-off of bands against a completed BLIND run, and Q10's purchase is what makes any band reachable) |
| PRF-08 | **§4.5's window measured, not asserted**: the arrival-received signal's staleness and the post-fire median reported by the PRF-07 harness, report-only locally, the hosted row named on `ai-provider.md` | bench + review | 6B | green |
| UXA-03 | The review screen's copy, the receipt's sentences and the refusal/staleness language read at the round-18 gate (the UXA-01/UXA-02 pattern) | review | 6B | review |

---

## What stays out, NAMED — the exclusion list

Nothing below is forgotten, and none of it is quietly absorbed. Each has
a home.

- **Multi-attachment group review (AC-INBOX-5, AC-INBOX-13; PRD §4.2.6,
  TSD §4.6).** The parent + N children shape is BUILT and live — parents
  report their least-advanced visible child today. What slice 6 excludes
  is the **group review experience**: four children reviewed as one flow
  with one receipt at the end. **Why:** it is a composition over a review
  screen that does not exist yet, and designing the group before the
  single is how the single gets bent to fit. The single-arrival screen is
  the unit that must be right. **Home:** a named row in the slice-7
  plan's inherited-obligations batch, with AC-INBOX-5/13 staying
  `pending` — never green on the strength of the arrival shape alone.
- **The four destination surfaces** — Documents, the full Timeline, the
  full Tasks surface, People & roles (§11.1 row 7). RCP-02 above holds
  AC-INBOX-9's remainder.
- **The §5.9 monthly-ceiling notification and PRD §4.8's eight emails**
  (slice 11). Q8's signal is deliberately NOT an email, for the reason
  §11.1 gives: send-time authorization must be written once against a
  complete event set.
- **SIG-01** — the runtime exists; the KMS key and ledger store are
  deploy-level. Stays `pending`, still not absorbed, third slice running.
- **The nine deferred owed findings**, listed above with reasons —
  R2/F-2, F-3, F-4, F-6(=R7/F-5), F-12 · R3/F-12 · R6/F-16, F-17.
  **R2/F-3 and R2/F-4 are named PRE-CONDITIONS of Q10**, not of this
  slice.
- **§7 row 2 of the corpus spec** — photographed synthetic documents,
  *"the only way to measure the model's vision rather than our
  contract"*. Owner time and a physical loop; out even if Q10 buys row 1.
- **The G3 activation rows** on `ai-provider.md` (the four written terms,
  ZDR per workspace, the §4.2.2 cancellation confirmation, the
  pre-activation live smoke test) — deploy-level, not dischargeable by
  code, untouched by this slice.
- **The two G4 deploy verification rows** and **G7's hardening set**
  (ARC validation, the D11/finding-2 hop-binding tightening) — their
  checklists, unchanged.
- **FRZ-16b, RLS-11b, SHR-02, DEL-01, ADM-01, G12-01** — their slices and
  gates. **DEL-01 is named specifically** because B3's staging sweep and
  M4's renditions both create bytes that a future deletion cascade must
  reach; the sweep is not a substitute for the cascade and does not
  pretend to be.
- **Compliance by offering Corresponding Source, and a commercial
  licence from Artifex** — both remain available if the rasterizer
  migration costs more than priced, and either would be a fresh owner
  ruling (D24 ruling 1's words, kept).

---

## Owner decisions — SETTLED 2026-08-24 (the plan-gate rulings)

The owner ruled on the ten batched questions at the plan gate,
2026-08-24, in session. **Every recommendation was accepted as written.**
Recorded verbatim; the build executes on these. The questions as put,
with the alternatives that were rejected, are preserved below for the
record (the slice-5 `561a105` pattern).

- **Q1 — SETTLED:** **The 6A/6B split, as argued** — 6A (M1–M7 DB,
  the inherited-obligations batch FIRST) → round-17 review → merge; then
  6B (app B1–B10, the rasterizer swap FIRST) → round 18. Taken on the
  four tree facts, not on the 2A/4A/5A precedent: the graph carries no
  row out of `proposals_ready` and none into `filed`; no proposal can be
  rejected; the receipt has no read path; approval is wider than
  evidence.
- **Q2 — SETTLED:** **Migration bound ≤ 7 as mapped** — M1
  `inherited_obligations` · M2 `review_boundary` · M3 `decide_proposal` ·
  M4 `renditions` · M5 `receipt` · M6 reserved for round-17 dispositions
  · M7 reserved and NAMED for Q8's DB half. **Because Q8 ruled as
  recommended, M7 is expected to close UNCONSUMED at 6 of ≤ 7** — and
  the over-provisioned slot is deliberate, not an invitation to spend it.
  Anything past the bound is a recorded owner amendment before a line is
  written; shipped migrations are never edited.
- **Q3 — SETTLED:** **All three dependency slots approved as argued,
  with the licence column** — `mupdf` 1.28.0 (AGPL-3.0-or-later) **OUT**;
  `pdfjs-dist` 6.2.108 (Apache-2.0) + `@napi-rs/canvas` 1.0.8 (MIT) **IN**
  as §6.3's rasterizer; `tesseract.js` 7.0.0 (Apache-2.0) **IN** for
  §6.9's OCR. **The argued runtime set goes from TWO to FOUR and the
  bound is three ADDITIONS, not a total.** Every licence is re-verified
  from the installed manifest before any import, with the command's
  output pasted into the red commit that adds the package; a manifest
  licence differing from the argued one is a fresh owner ruling, not a
  build decision. The dev-dependency reserve stays UNSPENT.
- **Q4 — SETTLED:** **`confidenceBand` returns three states, and no band
  is ever stored on a fact** — `all_high` · `banded` · `uncalibrated`,
  computed at render time from the run's `(model_id, prompt_version)`
  pair. A band is a property of the calibration, not of the fact.
- **Q5 — SETTLED:** **`promotedPageKey`'s default is deleted AND the
  pages get a manifest (M4)** — `ext` required, the rendition row written
  in `finalize_extraction`'s transaction. R3/F-8 and R4/F-6 close
  together, and partial promotion becomes detectable and therefore
  repairable.
- **Q6 — SETTLED:** **RENDER the message as a second source**, honouring
  §6.3 as written rather than amending the row down. The rendition is
  sanitised and resource-free; **a network call attempted during an email
  render is a test failure.** A12 is owed either way, and RND-01's cell
  stops reading "the table row by row" until it lands.
- **Q7 — SETTLED:** **Approval narrows in the DATABASE** — one added
  predicate in `hc.approve_proposal` requiring `view` on the arrival over
  all five domains, the same one the artifact route and
  `hc.log_artifact_read` already enforce, refusing in the existing
  `approval_refused` shape. §3.7's write-time rule is the reason; an
  interface-only rule is one a second client does not have. The gate on
  `extractions` is correct and is not widened.

- **Q8 — SETTLED:** **The Care Inbox revalidates — the signal, THEN the
  eager fire**, in that order, never the reverse (D24 ruling 3's order,
  now with its shape). No DDL, so **M7 closes unconsumed**; slice 11's
  notification set is not pre-empted. **The ordering is enforced by
  tests, not intention:** the fire's own test asserts the signal is
  present, so a later refactor that removes the signal fails the fire's
  test. PRF-08 reports the resulting median rather than the plan
  asserting it.
- **Q9 — SETTLED:** **All three as stated** — branches
  `slice/6-care-inbox` (6A) and `slice/6b-care-inbox-app` (6B); **the
  exit seam accepted as a PARTIAL exit, said plainly** (the loop closes
  for the record; AC-INBOX-9 is only partly satisfiable until Documents
  and People & roles land in slice 7, so the receipt names every
  destination, links the two that exist, and says so — **RCP-02 stays
  `pending` tagged 7, never green on a criterion half met**, the SIG-01
  precedent for the third slice running); **the coverage-row set as
  tabled** — fourteen rows, twelve opening, A11Y-07 and A11Y-08 flipping
  green, SIG-01 still explicitly NOT absorbed.
- **Q10 — SETTLED:** **Buy §7 row 1 — blind 12 → 40, INCLUDING an email
  item** (which Q6's ruling makes possible), at unit B10. **§7 row 2
  stays OUT** (owner time and a physical loop). **R6/F-16 and R6/F-17
  come with the purchase**, being defects in the act of growing the
  corpus — F-16 breaks the one command that costs money to produce.
  **R2/F-3 and R2/F-4 stand as named PRE-CONDITIONS of any signed band**,
  not as slice-6 units: a band signed from a third construction site,
  behind a hash that does not cover the pixels the model sees, is a band
  signed against something other than what shipped. **Slice 6 does not
  close G9** — it closes at owner sign-off of bands against a completed
  BLIND run, never as a side effect of a green row.

**Three consequences of the rulings, recorded so nothing is inferred
later:**

1. **The migration bound is expected to close at 6 of ≤ 7.** Q8 needs no
   DDL, so M7 is not consumed. A build session that finds it needs M7
   anyway is finding something this gate did not foresee, and that is an
   owner amendment with its reason stated — not a slot that was always
   going to be spent.
2. **Q7's narrowing is the load-bearing ruling of the set**, because it
   is the one that makes PRD §4.2.3's own sentence true as written and
   PRD §6.4's crop rule satisfiable in the mode this slice actually
   ships in. It is also the ruling most worth a reviewer's attack at
   round 17: it was found in the planning session rather than inherited
   from a review, and it narrows a function that seven slices depend on.
   **The 013/054 approval cases are re-pinned in the same commit** so the
   narrowing cannot silently break what already passes.
3. **Nothing here activates anything.** Proposals still rest at
   `pending` until 6B ships the surface; the G9 gate stays OPEN and
   `BAND_ARTIFACT_ALLOWLIST` stays EMPTY; G3/G4/G7 all still block; no
   credential exists in CI or the gate. All-high-risk remains the
   shipping mode, which is why the screen is designed for it rather than
   degraded into it.

## The questions as put to the owner — preserved for the record

**All ten were SETTLED on 2026-08-24 and every recommendation was
accepted; the rulings are above.** This section is kept unchanged from
the pre-gate draft — the recommendations as they were argued, and the
alternatives as they were rejected — so a future reader can see what the
owner was choosing between rather than only what was chosen (the slice-5
precedent, where the questions were preserved beneath the rulings for
exactly this reason).

**The standing rule, which did not have to be exercised here:** an
unanswered question defaults to NOT PLANNED, and the build does not
start. Each question below carries the recommendation the build now
executes on, and each names the alternative and why it was not
recommended.

**Q1 — The increment split.** **Recommended: 6A (M1–M7 DB) → round 17 →
merge; then 6B (B1–B10 app) → round 18.** Not on precedent — on four
things verified in the tree that the app layer cannot do: the transition
graph has **no row out of `proposals_ready` and no row into `filed`**, so
the loop cannot close by construction; **no proposal can be rejected**
(the only writer of `'rejected'` is the conflict `keep` arm, while
`reject_reason` sits behind a CHECK nothing can satisfy); **the receipt
has no read path** (`proposal_commits` grants nothing to
`authenticated`); and **approval is wider than evidence** (Q7). None of
those is a guess about the screen's needs — each is a gap between the
spec and the database, decidable from the spec alone, which is the
opposite of the mistake ADR-0023 D15 Q-E warns about. **Alternative:
one increment** — defensible only if Q7 rules "no DB change" and the
terminal arm is driven by app code against an unchanged graph; both are
argued against above, and the split follows the rulings rather than the
precedent.

**Q2 — The migration bound. Recommended: ≤ 7** — M1 `inherited_obligations`
· M2 `review_boundary` · M3 `decide_proposal` · M4 `renditions` · M5
`receipt` · M6 reserved for round-17 dispositions · **M7 reserved and
NAMED for Q8's DB half, consumed only if Q8's ruling needs DDL.** If Q8
rules as recommended the bound closes at **6 of ≤ 7** and the plan will
have over-provisioned by one slot — the direction to err, given slice 5's
bound was amended twice mid-round and still closed SPENT at 8 of ≤ 8.
Anything past the bound is a recorded owner amendment before a line is
written; shipped migrations are never edited.

**Q3 — The dependency bound, with licences. Recommended: ≤ 3 runtime
slots, one of them a REPLACEMENT that removes an AGPL obligation.**
`mupdf` 1.28.0 (**AGPL-3.0-or-later**) OUT; `pdfjs-dist` 6.2.108
(**Apache-2.0**) + `@napi-rs/canvas` 1.0.8 (**MIT**) IN as §6.3's
rasterizer; `tesseract.js` 7.0.0 (**Apache-2.0**) for §6.9's OCR. **The
bound is three ADDITIONS, not a total: the argued runtime set goes from
TWO to FOUR** — one package removed, three added — **and the licence
posture strictly improves.** Both halves belong in the argument; a plan
reporting "two become three" would be doing to this bound what round 16
caught being done to `mupdf`'s licence. **Every
licence above was read from the npm registry in this planning session and
MUST be re-verified from the installed manifest** (`node -e
"console.log(require('./node_modules/<pkg>/package.json').license)"` —
D13's own command) with the output pasted into the red commit that adds
the package; a manifest licence differing from the argued one is a fresh
owner ruling, not a build decision. **Alternatives priced and rejected:**
`@hyzyla/pdfium` 2.1.13 is MIT *as a binding* and **the binding's licence
is not the engine's** (PDFium is BSD-3 plus Apache-2.0 components) and it
ships per-platform native binaries — the packaging objection the slice-5
plan already recorded; `canvas` 3.2.3 is the same MIT licence needing a
native toolchain; `pdf-to-img` 6.2.0 (MIT) is a wrapper over exactly
these packages and would hide the geometry decisions D2 proved this
project must own. **Dev-dependency reserve: one slot, still UNSPENT.**

**Q4 — `confidenceBand`'s `null`, before the screen reads it.**
**Recommended: three states, not a nullable one — and no band column on
the fact.** Return `{kind:'all_high'}` · `{kind:'banded', band}` ·
`{kind:'uncalibrated'}`, so the screen can render all-high once globally
and an uncalibrated field honestly per fact (which is R6/F-11 arriving
from the other end). **The band is computed at render time from the run's
`(model_id, prompt_version)` pair and is never stored**: a band is a
property of the calibration, not of the fact, and storing it would freeze
one calibration into the record and make every re-calibration a backfill
over `extractions` — the mistake §6.4 already avoided by owning citation
geometry. The docblock stops claiming slice 5 records anything.
**Alternative: a `band` column written by the worker — rejected** for
exactly that reason.

**Q5 — `promotedPageKey`'s `png` default, and the hole under it.**
**Recommended: delete the default AND give the pages a manifest (M4).**
`ext` becomes required so the wrong answer stops being expressible; a
rendition row written in `finalize_extraction`'s transaction records the
rendered page count and the extension per page. **This is not a
convenience — it is what makes R4/F-6 detectable**: today the screen
cannot tell "this document has three pages" from "page three was never
promoted", which is the permanent partial promotion the screen is the
display surface for. One migration, two owed findings, and the screen's
central affordance unblocked. **Alternative: fix the default alone and
list the storage prefix — rejected**, because listing is not a contract
and cannot distinguish absence from completeness.

**Q6 — §6.3's email row (ADR-0023 D12).** **Recommended: RENDER the
message as a second source, honouring §6.3 as written.** Email facts are
stored today with `{page:1, bbox:[…]}` against a rendering that is never
produced — `lib/ai/schema.ts:84` makes `page` and `bbox` both required,
so an email fact **cannot be expressed without one** — and `cropRect` for
an email arrival is called with `pages[0]` where `pages` is `[]`. §6.4's
crop, PRD §6.4's high-risk rule and AC-INBOX-2 are therefore all
unsatisfiable for the whole email class, and in all-high-risk mode that
is every fact of every email arrival. **Amending the row down would make
that permanent for the product's primary intake channel** — a product
amendment wearing a spec correction's clothes, taken by default because
the code drifted first. The render is cheap against the rasterizer swap
already happening, and it is what lets the BLIND partition finally hold
an email item. **The safety cost is real and is a unit, not a footnote:**
the rendition is produced from a sanitised, resource-free document — no
remote fetch of any kind, no script, no redirect following, byte and
dimension ceilings before any decode — and **a network call attempted
during an email render is a test failure**, per PRD §4.2.8's inert-links
rule. **Alternative: amend the TSD row** — recorded as available, and it
is the cheaper answer today and the more expensive one afterwards.
**Either way A12 is owed**, because the as-built record truncated the row
and `docs/coverage.md`'s RND-01 cell must stop reading "the table row by
row" until this is settled (D12's instruction).

**Q7 — THE FOURTH, found in this planning session: the review screen's
three regions have three different authorization gates.** The source
needs `view` on **all five** domains (the artifact route and
`hc.log_artifact_read`); the extracted facts need `view` on **all five**
(`extractions_select`); the proposals need `manage` on **the proposal's
own taint** (`proposals_select`, and the write-time check in
`hc.approve_proposal`). Because `hc.grant_vectors` builds each level's
array cumulatively, `hc.ladder(s, all_domains)` is the caller's minimum
across all five — so **a member with `manage` on one domain and `summary`
on the other four can approve a proposal whose source and cited fact are
both invisible to them.** PRD §4.2.3's own sentence invites exactly that
composition, and in all-high-risk mode the contradiction is formal:
`hc.approve_proposal` will accept a `confirm_high` from a person who
could not have seen a crop, or the control never activates and §4.2.3 is
false as written. **Recommended: narrow approval in the DATABASE** — one
added predicate requiring `view` on the arrival, the same one the
artifact route already enforces, refusing in the existing
`approval_refused` shape. A narrowing is safe; §3.7's rule is that access
is re-checked at write time, and an interface-only rule is one a second
client does not have. **Alternative: widen `extractions_select` to a
taint-scoped read — rejected**, because `extractions` has no taint column
and minting one would let a member read part of a document's facts while
the document's own taint says otherwise; PRD §7.3 is also explicit that
Summary sees *"not the artifact and not the extracted contents."* **The
`view`×5 gate on extractions is correct; it is approval that is too
wide.** **Alternative: interface-only — rejected** for the §3.7 reason.

**Q8 — the arrival-received signal, and the ORDER.** The owner has
already ruled the order (D24 ruling 3): **the signal, THEN the `gate →
extract` eager fire, never the reverse.** What is open is the signal's
SHAPE. **Recommended: the Care Inbox revalidates** — `Reading` appears
when reading begins and the cancel affordance shown is live and accurate,
so PRD §4.2.2's promise is true at the moment it is made. It needs no
DDL (which is why M7 is expected to close unconsumed), and it does not
pre-empt slice 11. **Alternative: a "we're reading it" email — rejected**
for §11.1's stated reason: send-time authorization must be written once
against a complete event set, not eleven times, and building one email
here decides that for the sake of one state. **The ordering is enforced
by tests, not intention:** the fire's own test asserts the signal is
present, so a later refactor that removes the signal fails the fire's
test rather than silently restoring a ~35 s window's collapse to seconds
with nothing failing. PRF-08 reports the resulting median rather than
this plan asserting it.

**Q9 — Branch names, the exit seam, and the coverage-row set.**
**Recommended: `slice/6-care-inbox` (6A) and `slice/6b-care-inbox-app`
(6B)**, the 4A/4B–5A/5B naming, fourth time. **The exit seam accepted as
stated:** the loop CLOSES for the record — approve, write, commit,
`Filed`/`Nothing filed` — while **AC-INBOX-9 is only partly satisfiable**
because Documents and profile facts have no surface until slice 7. The
receipt therefore names every destination, links the two that exist
(Tasks and Timeline are live RLS reads today), and **says plainly** where
the others open — never a dead link, never a silent omission, and
**RCP-02 stays `pending` tagged 7 rather than green on a criterion half
met** (the SIG-01 precedent, third slice running). **The coverage-row set
as tabled** — **fourteen rows: twelve opening** (RCP-02 among them at
`pending` tagged 7, UXA-03 at `review`) **and two flipping green,
A11Y-07 and A11Y-08**, with SIG-01 still explicitly NOT absorbed.

**Q10 — §7's corpus purchase: in this slice, or after it?**
**Recommended: buy §7 row 1 (blind 12 → 40, ~1 h build, ~+2 MB in tree,
~2× eval cost per run) as unit B10, INCLUDING an email item — and leave
§7 row 2 out.** Slice 6 owes G9 conditions 3 and 4 regardless (the
threshold rule and citation scoring), because both are about the consumer
this slice builds; row 1 is the cheap half of the rest, and Q6's ruling
is what makes an email item possible at all. **If yes, R6/F-16 and
R6/F-17 come with it** — both are defects in the act of growing the
corpus, and F-16 breaks the one command that costs money to produce.
**R2/F-3 and R2/F-4 are PRE-CONDITIONS of any signed band and are named
as such, not folded into the screen**: a band signed from a third
construction site, behind a hash that does not cover the pixels the model
sees, is a band signed against something other than what shipped.
**Slice 6 does not close G9 either way**, and the plan says so up front:
the gate closes at owner sign-off of bands against a completed BLIND run,
never as a side effect of a green row. **Alternative: defer the purchase
entirely** — then `tests/eval/corpus.test.ts` stays green on a corpus
that cannot pass its own gate, and the arithmetic in §4.3 stays true for
another slice.

---

## Completion recipe (per increment) + gate cadence

**Per unit:** a red commit carrying **the failure signature in the
message** → green → the unit's tests join the suite. No unit is "done"
without both commits in the history.

**At each increment head:** clean-leg reset exact-N (62 + M at 6A) ·
pgTAP all green with the count recorded exactly · concurrency all green
(**teed**) · `db:verify` clean under `--fail-on warning` · upgrade leg
green · vitest all green (count recorded exactly) · **local gate:
walkthrough 11/11 + a11y 5/5 + ingestion 8/8 + the extraction leg
UNCHANGED, plus the new review legs — the new total stated exactly, never
as "unchanged"** (R7/F-11's lesson: the round-16 gate was 29/29 with a
leg deliberately amended, and saying so beat asserting a constant) ·
lint/typecheck/production build clean · gitleaks clean · coverage rows
flipped with refs and pendings annotated, **never early** · the deltas
ADR (**ADR-0024** for 6A, numbered as the cadence produces them) · a
review packet in the round-8 shape: head ledger from the start, a
one-SHA evidence block whose legs come from the **declared head** and not
from a run three commits behind it (R7/F-8), per-directory tree binding
(ADR-0015 F12), the ledger's last row naming every document that moved
after the evidence head (R7/F-9), and pointed questions with recommended
answers.

**The gate cadence, each leg its own fresh session (ADR-0006):** this
plan → **owner rulings on Q1–Q10** (recorded verbatim here, status →
RULED) → 6A build red→green (**M1 FIRST** — the inherited batch, the 5A
precedent) → round-17 packet → third-party review → dispositions ADR →
owner sign-off → **merge (never squash)** → 6B build (**B1 FIRST** — the
rasterizer swap, before any consumer exists) → round 18 → dispositions →
sign-off → merge.

**Standing constraints throughout.** Repo authoritative, the vault holds
pointers · **main stays green** · DDL only within the owner-approved
bound, **shipped migrations never edited** · **every dependency argued
WITH its licence, verified from the installed manifest** · **never real
family data, and under G9/G3 never a real document to a provider:
fixtures only, CI KEYLESS, the eval harness the sole real-key path over
synthetic material** · browser legs **LOCAL-gate only** ·
`supabase:supabase-postgres-best-practices` **before any DDL authoring**
· **`claude-api` before ANY change under `lib/ai/`** (it stands for every
session touching that directory, and B4 touches it) · `vercel:nextjs` and
the AGENTS.md `node_modules/next/dist/docs/` guides **before route work**
· `frontend-design` only if the review screen needs a primitive the
slice-3 system lacks — **compose, don't invent** · **pending never counts
as green** · G12 still blocks the first non-founder invitee, and A11Y-07
/ A11Y-08 are built **into** the screen rather than after it · G4's
deploy rows and G7's hardening set stand untouched on their checklists ·
**owner sole merge authority, merge commit never squash.**

**The transient protocol, unchanged and still binding.** A vitest failure
under load that will not reproduce is an **UNREPRODUCED TRANSIENT**,
never claimed as diagnosed. A "Start local Postgres" `toomanyrequests` CI
failure is the ECR Public anonymous quota, never a repo defect. Never
interrupt a `db:reset`; a post-reset Kong 502 is
`docker restart supabase_kong_HarpersCirclev3`. Line endings are mixed
**within** single files and fresh worktrees check out CRLF — measure
before building exact-string anchors, and assert the match count before
writing.
