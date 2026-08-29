# ADR-0022 — 5B as-built: the app half of extraction + interpretation (B1–B9)

**Status:** **AMENDED, and accepted as amended — MERGED at `c63bcae`**
(merge commit, parents `a9d9f43` + `318e2ad`; PR #10; CI green on `main`
at the merge commit, run `32694917229`). The as-built record for slice
5B, corrected at the round-16 owner sign-off on 2026-08-23.
Round 16 falsified or superseded **ten** of its claims; each is
corrected by a numbered disposition in **ADR-0023**, indexed immediately
below and marked again at the site. **The original prose is preserved
everywhere.** An as-built record that is quietly rewritten is no longer
an as-built record — the same reason round 16 disclosed the byte it had
to change in `docs/review/round-16-findings.md` rather than repairing it
silently (ADR-0023 D3).

**Deciders:** the 5B build session (owner ratifies at sign-off).

**Context:** 5B built the app half of slice 5 on
`slice/5b-app-extraction`, branched from `main` at `a9d9f43` (CI green
at that head, run `32609469623`, every step), per the SETTLED plan
`docs/review/slice-5-plan.md` — Q1–Q9 verbatim, no new plan gate — and
ADR-0020/0021 with their inherited items. **5B is APP-ONLY:**
`supabase/` is byte-identical to main, tree
`6ac8a1cd17110dfcf8c33852e251f2c522621661`, 60 migrations / 57 pgTAP
files. The migration bound stays SPENT at 6 of ≤ 6 and was never
approached. **Dependencies: exactly the two Q3-approved runtime
packages** — `@anthropic-ai/sdk` 0.120.0 and `mupdf` 1.28.0 — with the
spike-contingent runtime reserve NOT consumed (B2's spike did not
falsify `mupdf`) and the dev-dependency reserve UNSPENT.

**AMENDED (index: Context).** The APP-ONLY paragraph above is SUPERSEDED.
The owner amended the migration bound twice during the round — to ≤ 7
(ADR-0023 D20, for Q-A's grant, the `column_privileges` exact-set
invariant and Q-B's `render_bounds_exceeded`) and then to ≤ 8 (D21/D23,
for the interpret stage's missing failure edge). **M7 and M8 landed, the
bound closes SPENT at 8 of ≤ 8, the tree is 62 migrations / 59 pgTAP
files, and `supabase/` is no longer byte-identical to main** — so the
ADR-0015 F12 per-directory binding no longer transfers the DB legs from
CI, and they were re-run (ADR-0023 D22, D23). The dependency sentence
stands exactly as written, and the dev-dependency reserve is still
UNSPENT.

**The numbering:** ADR-0021 was the round-15 dispositions, so this is
ADR-0022 — the next free number at write time, per the ADR-0019
renumbering precedent.

---

## AMENDED AT SIGN-OFF — the index of what round 16 falsified

Read this before trusting any single section below. **ADR-0023's own
"Status of ADR-0022" paragraph named five of these; the sign-off found
four more** — D2's spike score, D7, D10 and D12. The largest of those is
D10's "the seam is consumed", and it is the one a reader is most likely
to ACT on, because it reads as permission to add the missing eager fire.

| Section | The claim | What is actually true | Corrected by |
|---|---|---|---|
| **Context** | "5B is APP-ONLY … 60 migrations / 57 pgTAP files … the bound stays SPENT at 6 of ≤ 6" | The owner amended the bound twice, to ≤ 7 then ≤ 8. M7 and M8 landed; **62 migrations / 59 pgTAP files**, bound SPENT at 8 of ≤ 8, `supabase/` no longer byte-identical to main | ADR-0023 D20, D21, D23 |
| **D1** | "The partitions are a property of the tree, not of anyone's discipline" | There were **three** ways around the fence: it guarded a two-line wrapper while `lib/eval/corpus` re-exported `corpusManifest()` unfenced; ESLint registers no `ImportExpression` handler, so the dynamic import walked past it; and the fixture server read the corpus as DATA with no partition filter — which no import rule can reach. True as written again from `ef67a83` | ADR-0023 D7 |
| **D2** | "all eight PASS, so the spike-contingent runtime reserve is not consumed" | **7/8.** Leg 5 contains no assertion and passes unconditionally, and it is the leg whose criterion ("refuses cleanly") is NOT met — mupdf repairs. The reserve conclusion is unaffected; the score was over-stated | ADR-0023 R7/F-3 |
| **D2** finding 3 | "Page geometry is POINTS at 96 dpi on the image path, so a page point is 0.75 stored pixels" | That is mupdf's **no-declared-resolution fallback**, not a property of the image path. A 300-dpi scan reported 617×824 and rendered 3.1× below its own resolution, saying `rendered` | ADR-0023 D2 |
| **D3** | "a photo is never rendered below [the high tier]"; `page_dimensions` as "80 Mpx of DECLARED geometry" | Both rode on the same constant: photos declaring a dpi were downsampled, and the ceiling scaled as `80 Mpx × (dpi/96)²` — the corpus's own 900 Mpx bomb was accepted at 600 dpi | ADR-0023 D2 |
| **D4** | "§6.6's 'checked, not assumed' is implemented as MEASUREMENT"; "`prompt_version` ENFORCES M3's semantics … a test asserts they agree"; "The allowlist is an ALLOWLIST" | `usage` is carried and **never read** — no log, no column, no metric. The version test compared a value to itself and could not fail. The allowlist admitted `claude-sonnet-5`, which the adapter's unconditional system message cannot use | ADR-0023 R2/F-6, D5, D6 **AMENDED (round-23 follow-up, 2026-08-28):** `usage` is READ since `80e9a75` (PR #19) — R2/F-6 ruled **FIXED** at ADR-0031 (round 23); the original sentence is true again. |
| **D7** | "a render-bounds refusal has no reason code of its own" | **Closed.** M7 seeds `render_bounds_exceeded` and the four named ceilings now map distinctly — wall clock to `extract_timeout`/`provider_timeout`, the other three to the new code. It was also worse than recorded: a wall-clock overrun was being persisted as an archive breach | ADR-0023 D9, D10, D20 |
| **D8** | "§4.8's conflict rule is MECHANICAL, not prompted … enforced TWICE" | Both enforcement points guarded an **empty set**: the definer returns its facts under `profile_facts` and both consumers read `.facts`, so no conflict could be emitted at all in production. §4.8's conflict arm was **inert** | ADR-0023 D1 |
| **D10** | "the seam is consumed" | True of interpret, **false of the gate leg**: `gate → extract` has no eager fire and no trigger writes an outbox row on `scanned → extracting`, so extraction waits for the once-a-minute relay tick. That is where §4.5's ~35 s cancel window comes from | ADR-0023 D14, D24 |
| **D12** | "`scripts/ts-run.mjs` is ~40 lines"; "The scorer emits **no global number at all**"; "the SOLE real-key path" | **126 lines across two files**, the second being a `module.register` resolver hook. The scorer *reports* no global number — it is one line of arithmetic away in the artifact. And `lib/ai/client.ts` reads the key in production, so "sole real-key path" means "the only path ever run against a real credential today" | ADR-0023 R7/F-12, R6/F-9, R6/F-12 |
| **D15** | the three withheld columns; "nothing else in 5B selects an ungranted column"; the fix "NOT taken here" | Two of the three named columns are wrong: `duplicate_of_arrival_id` **does not exist**, `ingest_idempotency_key` is **granted**, and `auth_detail` — the one withholding with a real security rationale — was omitted. Measured live: 25 of 28 granted, withheld `auth_detail`, `current_lease_id`, `duplicate_of_document_id`. The app-side guard read only `.select()` strings while Postgres checks **every** referenced column. And the grant itself **landed** in M7 | ADR-0023 D8, R5/F-3, R5/F-4, D20 |

Eleven rows, ten claims: D2 appears twice because its two errors are
independent, and D3's row is the same defect as D2's second with a
different consequence.

**What round 16 did NOT falsify is worth saying too.** The remaining
detail of this record held up under eight adversarial lenses, and six
findings were verified POSITIVES: the orientation door (R3/F-10), the
`serverExternalPackages` pin (R3/F-11), the deferral threshold's
derivation (R4/F-13), the storage prefix namespaces (R4/F-14), the
definer swap dropping no check (R5/F-11), and the harness's
manifest-completeness walk, which a reviewer tried to defeat and could
not (R6/F-14).

## D1 — B1: one governed corpus, and the partitions are STRUCTURAL

Q5 ruled corpus-first. `fixtures/g9` is 28 items — 16 development, 12
BLIND — and **every byte is generated by
`scripts/fixtures/g9-build.mjs` from a spec table inside that script**,
so the material is reviewable as data and "never real family material"
is true by construction rather than by promise.

Two from-scratch encoders, zero dependencies: a PDF writer with a real
xref and a real Helvetica text layer (so born-digital fixtures carry
the text layer §6.3 passes alongside the images), and a baseline
grayscale JPEG writer using flat 8×8 blocks with a quantiser of 8, so a
block's quantised DC is exactly `p − 128` and the decode is **lossless**.
Verified through a real decoder: the painted 226/34/150 levels read back
exactly, no warnings.

Two encoder bugs were found by DECODING rather than by reading the code,
and both are recorded because they are the kind that look fine forever:
a one-symbol AC Huffman table is legal on paper and rejected in practice
("Corrupt JPEG data: bad Huffman code"), and the canonical Huffman code
was never incremented inside the per-length loop, so every symbol shared
code 0 and the scan decoded as flat gray.

**The partitions are a property of the tree, not of anyone's
discipline.** `lib/eval/blind` is §1.7-fenced to `scripts/eval/**` and
`tests/eval/**`; the worker, the adapter, and even `tests/ai` cannot
reach it. `tests/eval/corpus.test.ts` additionally asserts the manifest
IS the corpus — every file under `fixtures/g9` is a manifest item — so
there is no unlabelled second fixture world, which is the exact failure
Q5 refused.

`.gitattributes` turns `text=auto` OFF for the tree. Caught before the
first commit: git would have CRLF-converted the PDFs, the email body and
the `.bin` on a Windows checkout and every recorded digest would have
missed.

**`docs/eval/g9-corpus-spec.md` states its own limits** rather than
leaving them to be found at the gate: these fixtures measure our
extraction CONTRACT on material of known content, **not the model's
vision** on a real pill bottle; and with 4–11 blind items per field a
measured 1.00 means "no error in a handful of tries", not a calibrated
interval. Growing the corpus is priced there as an owner call.

**AMENDED (index: D1).** "The partitions are a property of the tree,
not of anyone's discipline" was FALSE when written — there were three
ways around the fence, found independently by two lenses: the fence
guarded a two-line wrapper while `lib/eval/corpus` re-exported
`corpusManifest()` unfenced; ESLint's `no-restricted-imports` registers
no `ImportExpression` handler, so the dynamic form walked past it; and
the fixture server read the corpus as DATA with no partition filter,
which no import rule can reach. Nothing in the tree did any of these —
the breach was of the guarantee, not of the behaviour — but the
guarantee was the whole argument for trusting a band. **It is true as
written again from `ef67a83`** (ADR-0023 D7): `lib/eval/manifest.ts`
holds the full manifest and is fenced, `corpusItem()` can no longer name
a partition, a `no-restricted-syntax` rule closes the dynamic form, and
the server test drives the real matcher with every blind item's own
label values.

## D2 — B2: the spike did not falsify mupdf, and it changed the code

The plan required a verification spike BEFORE the install was treated as
settled. `scripts/spike/mupdf-spike.mjs` runs the eight named legs; all
eight PASS, so **the spike-contingent runtime reserve is not consumed**
and the recorded alternatives (`pdfium` bindings, `pdfjs-dist` + canvas)
stay unused.

Three findings, each of which changed something:

1. **The orientation path is a CHOICE, not a default.** `new
   mupdf.Image(bytes)` reports the STORED frame with EXIF ignored;
   `Document.openDocument(bytes, 'image/jpeg')` reports the DISPLAYED
   frame with orientation applied. §6.4's citation space is the page as
   a person SEES it, so `lib/pipeline/render.ts` only ever opens
   documents. The spike's falsification control measured the difference
   at **36.3 vs 220.4** mean sample value over the same citations —
   load-bearing, not cosmetic.
2. **mupdf REPAIRS a truncated PDF rather than refusing it.** The plan's
   leg expected a clean refusal; what mupdf does is repair the xref and
   hand back a real document. That is safer than a crash and it is a
   behaviour B2 OWNS rather than inherits: the honest exit for genuinely
   unreadable bytes is `openDocument` throwing, and a repaired document
   is processed like any other.
3. **Page geometry is POINTS at 96 dpi** on the image path, so a page
   point is 0.75 stored pixels. The conversion happens once, at the
   boundary, which is why every §6.3 rule can be stated in pixels.

Legs 3, 4 and 6 all answer from the HEADER, before any decode. That is
what makes "abort BEFORE any provider dispatch" a property of the code
path rather than an ordering someone has to remember.

**AMENDED (index: D2, both rows).** Two corrections, the second of them
the round's most consequential product finding.

- **"all eight PASS" should read 7/8.** Leg 5 contains no assertion and
  passes unconditionally, and it is the leg whose plan criterion —
  malformed input "refuses cleanly" — is NOT met: mupdf repairs.
  Finding 2 below records that behaviour honestly, which is why this is a
  scoring correction rather than a new fact; the reserve-not-consumed
  conclusion is unaffected, but it rested on a count that was over-stated
  (R7/F-3). The honest hostile-input posture is **"malformed input is
  repaired and processed"**.
- **Finding 3 is FALSIFIED.** "Page geometry is POINTS at 96 dpi on the
  image path" is mupdf's fallback for an image declaring NO resolution —
  not a property of the path. mupdf sizes an image page as
  `pixels × 72 / declared_resolution`, and every flatbed and every phone
  "Scan to JPEG" writes that tag. Measured: a 1928×2576 source declaring
  300 dpi reports 617×824 and rendered at **824** — 3.1× below its own
  resolution and below even the standard tier — with `outcome: rendered`,
  no ceiling fired and nothing logged. So a family scanning a discharge
  summary got a page the model could not read well, and it surfaced as an
  ordinary model miss. Fixed at `2a8f1c7`; `PT_PER_PX` survives only
  where it is right, on a PDF page (ADR-0023 D2).

## D3 — B2: resolution is a floor in BOTH directions, and the ceilings have names

§6.3's table is the code. A born-digital page is never rendered at the
high tier (downsampling it is free — the text layer carries the
characters — and 3× the tokens is exactly the wrong economy), and a
photo is never rendered below it.

The four ceilings are named values that refuse with named reasons:
`page_bound` (PRD §13.3's 200 pages, from `countPages()`),
`page_dimensions` (80 Mpx of DECLARED geometry, from the header),
`wall_clock`, `output_size`.

**The rendered-page lifecycle**: attempt staging is lease-scoped
(`render/attempt/<circle>/<arrival>/<lease>/pNNN`), GC'd on every
non-advance including a lost CAS; promotion on `advanced` writes
per-arrival, write-once keys with no lease in them. **The slice-5 exit
assertion is a test**: a normalised bbox names the same FRACTION of the
page at any resolution, and §6.9's machine-read text lands as a SIBLING
sharing the page's stem (`p003.png` gains `p003.txt`) — so neither the
stored coordinates nor the promoted artifact changes when slice 6
arrives, and Q6's deferral cannot force rework.

The key builders live in `lib/pipeline/page-keys.ts` rather than in the
fenced storage module. `lib/storage` is §1.7-fenced to the pipeline
surfaces and **tests are not on that allowlist, by existing design** —
every test in the tree reaches the database through raw `pg`. Rather
than punch a test-shaped hole in a fence, the pure string builders got
their own unfenced module and `lib/storage` imports them.

`next.config.ts` names `mupdf` in `serverExternalPackages`: it resolves
its own `.wasm` through Node's `require`/`fs` at runtime, and bundled
into the RSC graph that resolution breaks — the extract worker's first
render would fail in production while every local test stayed green.

**AMENDED (index: D3).** Both halves of this section rode on the
constant D2's note corrects. **"a photo is never rendered below [the high
tier]" was false** for any raster declaring a dpi, and `page_dimensions`
bounded nothing stable: the effective ceiling scaled as
`80 Mpx × (dpi/96)²`, so the corpus's own 900 Mpx decompression bomb was
**accepted and decoded** once its header claimed 600 dpi — a hostile-input
ceiling that a hostile input could raise. Fixed at `2a8f1c7` by reading
the true raster dimensions from the header (JPEG SOF, skipping C4/C8/CC;
PNG IHDR; GIF logical screen descriptor) before any decode, and orienting
them to the displayed frame using the page's own bounds (ADR-0023 D2, and
R3/F-2 for the ceiling).

## D4 — B3: the adapter contract is asserted ON THE WIRE

`lib/ai/` is six modules and ONE fence. Most of `tests/ai/adapter.test.ts`
asserts the **request body the provider actually receives**, against a
local fixture server, rather than our own source — a grep over `lib/ai`
would pass while the wire carried something else.

**Never on the wire, and absent rather than configured off:**
`fallbacks` (§6.8's recorded decline — a deliberate deviation from the
claude-api skill's own default-on advice for Opus 5, because a declined
request must not be silently re-routed to a model outside G3's cleared
terms), the Files API (§6.2 — one retention question, not two), the
provider's citations feature (§6.4 — a 400 against structured outputs,
and our geometry survives a provider swap), `budget_tokens` (removed on
Opus 5).

**`maxRetries: 0` is argued, not an oversight.** §4.3 gives every stage
ONE durable attempt counter — the lease table — and the whole mechanism
depends on a crash after the claim having burned the attempt. An SDK
retry loop is a second, INVISIBLE counter that spends the stage's wall
clock without the lease learning anything.

**The allowlist is an ALLOWLIST.** A denylist naming only
`claude-fable-5` would wave through the next model nobody cleared, so an
unknown model is refused too, and both are tested.

**§6.6's "checked, not assumed" is implemented as MEASUREMENT.** The
adapter carries `usage.cache_creation_input_tokens` and
`cache_read_input_tokens` back on every call, so whether the record
prefix actually cached is observed. Opus 5's minimum is not monotonic
across model generations, which is precisely why assuming is the wrong
verb.

**`prompt_version` ENFORCES M3's semantics** rather than describing
them: it is `<name>+<configuration hash>`, the hash covers schemas,
parameters, prompts and the §6.3 render rules, and a test asserts they
agree. Changing the configuration without bumping the version reds —
§6.10's "not shippable without a re-run", made mechanical.

**AMENDED (index: D4).** Three claims in this section were falsified,
and each one made the adapter sound stricter than it was.

- **"§6.6's 'checked, not assumed' is implemented as MEASUREMENT" is
  false.** `usage.cache_creation_input_tokens` and
  `cache_read_input_tokens` are carried back and **never read** — no log
  line, no column, no metric; the struct field is garbage-collected.
  `docs/ops/ai-provider.md`'s SMOKE-6 already held the real check as an
  unticked box, so the checklist was honest and this sentence was not
  (R2/F-6, OWED; the `docs/coverage.md` AIA-01 cell is corrected in
  ADR-0023 D19).
  **AMENDED (round-23 follow-up, 2026-08-28).** `usage` is READ since `80e9a75` (PR #19): the worker logs the four counters at both consumption sites, and R2/F-6 = R7/F-5 was ruled **FIXED** at ADR-0031 (round 23). The original sentence this amendment corrected is true again; the amendment is preserved exactly as written.
- **"`prompt_version` ENFORCES M3's semantics … a test asserts they
  agree" had no mechanism behind it.** The test read
  `expect(configurationHash()).toBe(PROMPT_VERSION.split('+')[1])` — a
  value compared to itself, unfailable for any edit to any covered input,
  and `ai-provider.md`'s G9-4 row rested on the same nothing. Fixed at
  `07fdacd`, which pins the hash to a literal and pins `PROMPT_VERSION`
  to `hc-5b-1+<that literal>` so the pair cannot drift. What was lost was
  the DETECTION, not the guard: `loadBands` fails closed with an empty
  allowlist, so a drifted version could never have enabled bands
  (ADR-0023 D5).
- **The allowlist admitted a model the adapter cannot use.**
  `claude-sonnet-5` was on it while `operatorMessages()` emits a
  mid-conversation `{role:'system'}` UNCONDITIONALLY — unsupported on
  Sonnet 5, so a 400 mapped to `unavailable`, burning all three durable
  attempts across ~15 minutes and terminalising the arrival; the
  512-token cache assertion was wrong for it too. Narrowed to
  `['claude-opus-5']` at `07fdacd`, with the ops doc saying why
  (ADR-0023 D6). The *form* of the argument here — an allowlist, never a
  denylist — was right and is unchanged.

## D5 — B4: the run identity at the claim, and bands that fail closed

`[stage]` gains `extract` on the §4.3 sequence. The claim carries
`(model_id, prompt_version)` because M3 REQUIRES them: no lease exists
without its run.

**The all-high-risk mode is STRUCTURAL.** `lib/extraction/bands.ts`
loads calibrated bands only from an artifact whose **sha256 is in a
checked-in allowlist** — so bands are enabled by a commit recording the
exact bytes an owner signed, not by a file appearing at a path — and
only when model, prompt version AND configuration hash all match the
running ones, the artifact names the BLIND partition, and EVERY banded
field is present. There is a test for each failure shape, because "fails
closed" is a claim about what happens when something goes wrong and the
only way to know is to make it go wrong. `BAND_ARTIFACT_ALLOWLIST` ships
EMPTY and a test asserts it: if that changes without a sign-off ADR, the
G9 gate was opened by a commit rather than by a decision.

The artifact path is **absolute-only**. A project-relative default
resolved through `process.cwd()` made Turbopack trace the whole
repository into the server output — `fixtures/g9` included — and the
build said so out loud.

## D6 — B4/B5: two DB gaps the app layer cannot close, recorded not papered over

**Neither is a defect in 5A; both are consequences of §3.10 doing its
job.** `hc_pipeline` holds no `SELECT` on any table in `public`, which
is exactly the boundary that makes an injection's blast radius a
proposal. Two things fall out of it:

1. **The worker cannot read back `arrivals.storage_key`.** It does not
   need to: the §2.12 key is content-addressed under a per-arrival
   prefix, so `readArtifactBytes` lists that prefix, and §4.6's rule —
   content, never declaration — makes re-sniffing the bytes a BETTER
   answer than a stored column. More than one object under the prefix
   returns null rather than picking one at random.
2. **The interpret worker cannot read this arrival's `extractions`.**
   The extract → interpret hand-off therefore carries the facts on the
   work item, which is also cheaper (interpretation does not re-send
   page images). Their ABSENCE is not a different quality of answer: a
   re-queued interpret — a resolved stage-2 duplicate, a sweeper rescue
   — re-normalises the artifact and reads the DOCUMENT, the same source
   material extraction saw, and the operator note SAYS the facts were
   absent so a thinner answer never looks like a normal one.

**A tiny definer `hc.extractions_for(p_arrival)` would make (2) a
non-issue** and is offered to the owner as a queue item for the next
DB-opening slice (the ADR-0019 D15 mechanism). It is NOT taken here: the
migration bound is spent, and DDL is an owner bound-amendment first.

## D7 — B4: a render-bounds refusal has no reason code of its own

A page bomb or a pixel bomb currently lands `extract_failed` with
`archive_bounds_exceeded`. The STATE is right and the family-facing
label is right — `extract_failed` reads "Couldn't read it", which is the
honest thing to say — but that code's description is "Archive
depth/entries/expansion over PRD §13.3 bounds" and a 250-page PDF is not
an archive.

The alternative available inside the bound, `unsupported_type`, reads
**"Unsupported file"** and would tell a family something FALSE about
their document, so it was rejected. A `render_bounds_exceeded` code is
**offered to the owner** as a bound-amendment or a next-slice queue
item; it is recorded in the code at the mapping site and raised as a
pointed question rather than taken as a session decision.

**AMENDED (index: D7) — THIS GAP IS CLOSED.** The owner granted the
bound amendment and **M7 seeds `render_bounds_exceeded`**, so a
render-bounds refusal has a reason code of its own and the four named
ceilings now map distinctly: a wall-clock overrun to
`extract_timeout`/`provider_timeout` (a state and a code 4A shipped and
nothing had ever called), the other three to the new code. The gap was
also **worse than this section records** — `normalizeExit` collapsed all
four named reasons, so a render that ran out of **wall clock** was
persisted as an archive-bounds breach: the operational tier recording a
different event than the one that happened, and "how often does
`page_dimensions` fire, and on what?" — exactly the question that would
have surfaced D2's DPI defect — unanswerable from the record
(ADR-0023 D9, D10, D20).

## D8 — B5: §4.8's conflict rule is MECHANICAL, not prompted

The prompt says a change to an existing value is a conflict. The prompt
is not a guarantee. `draftPayloads` converts a `profile_fact` proposal
for a field the record already carries with a DIFFERENT value into a
conflict quoting that fact — which is also what `hc.draft_proposal`
needs, since a conflict with no parents is refused and its taint is the
union of its parents'. A field the record does not carry stays a
`profile_fact`. **An UNCHANGED value proposes nothing at all**: a
restatement is not a proposal, and putting one in front of a person
spends attention they will need for the real ones.

§3.10's boundary is enforced TWICE — the adapter drops a conflict naming
an id the call was not given, and the worker re-derives the parent from
the record context rather than trusting the value through a second hop.

**Scope stated rather than half-built:** the interpretation schema asks
only for `document`, `task`, `profile_fact` and `conflict`.
`hc.proposal_kind` also has `timeline_event` and `episode` and the DB is
ready for both, but a `timeline_event`'s own-domain needs a `kind`
nothing here produces. Asking for proposals the worker would silently
drop wastes tokens and hides the drop.

**AMENDED (index: D8) — THE MOST CONSEQUENTIAL CORRECTION IN THIS
DOCUMENT.** "MECHANICAL, not prompted" described code that could not run,
and "§3.10's boundary is enforced TWICE" described two enforcement points
guarding an **empty set**. `hc.record_context_for` returns its facts
section under `profile_facts` (migration `20260821120002`, pinned by
pgTAP `052:350`); both TypeScript consumers read `.facts`. The Map in
`currentFacts()` and the Set in `knownFactIds()` were therefore empty on
every call in production, so:

- no `profile_fact` was ever converted to a conflict — §4.8's rule that a
  change to an existing value is ALWAYS a conflict was **inert**;
- the restatement suppression never fired;
- **every** model-drafted conflict was dropped by the allowlist, so the
  pipeline could not emit a `conflict` proposal at all;
- a dose change therefore reached review as a plain `profile_fact`, where
  `hc.approve_proposal`'s non-conflict branch **silently supersedes** the
  current row — the quiet update §4.8 and AC-INBOX-6 exist to forbid.

The unit fixtures invented the shape (`RECORD = { facts: { rows: … } }`),
which is why a green suite could not see it: a mocked fixture asserting a
shape the database does not return is a test of the fixture. Fixed
`5337064` RED → `c15d764` GREEN — the RED corrected the fixtures rather
than adding a test, and the production defect reproduced exactly as
`expected 'profile_fact' to be 'conflict'`. The durable guard reads the
**shipped migration**, so a mock cannot drift from the source of truth
(ADR-0023 D1).

## D9 — B6: Q6 decided on its FIRST branch, on narrower evidence than expected

**ProvenanceLine takes its first consumer at B6.** The stage-2 line
shows where the suspicion came from, and the suspicion is downstream of
AI-extracted values — `document_date`, `provider` and `amount` are
exactly what M5 matched on — so it is provenance in §8.6's sense.
**The design-conformance citation stays in slice 5**; it does not move to
slice 6. Decided red-first, as ruled.

**What it cannot say is WHICH document, and that is D15's finding, not a
design choice.** The plan's B6 row says the copy cites the matched FILED
document. A member has no read path to `arrivals.duplicate_of_document_id`
— see D15 — so the copy says *why* the match happened rather than *what*
it matched. That is the provenance a person actually needs in order to
decide, and it is honest about what we know; the naming half is one line
of DDL away and is a round-16 pointed question.

Stage 2 is a different question from stage 1 and the copy says so:
`same_thing` reads "add it as another source", because that is what it
does. A test refuses stage-1 copy on a stage-2 row.

**Round-15 observation 3 is honoured structurally**, and the finding
strengthens it: the affordance is gated on the STATE, which is also the
only thing a member can read. A test drives a `nothing_filed` arrival and
asserts no affordance renders. Keying on a pointer members cannot even
read was never going to work.

## D10 — B7: the seam is consumed, and D13's backlog is RELEASED

The relay's `FIREABLE` set gains extract and interpret. D13's deferred
messages are not waited out: `releaseDeferredWork` pulls the visibility
timeout back at the head of each pass, bounded, idempotent, and
best-effort — a release that throws never costs the pass.

**The live test found something worth fixing.** pgmq gives an in-flight
read and a deliberate deferral EXACTLY the same shape — a `vt` in the
future — so the first draft could have made a message another worker was
holding visible to a second reader. They are separated by HOW FAR: a
read hides for 120 s, D13 deferred for an hour, and the threshold now
sits between them. Nothing could have published twice either way
(claim-before-work means a second reader gets `stale_lease` before any
external call), so the threshold buys the wasted claim, not the
correctness — recorded that way rather than implying the fence was
load-bearing for safety.

Verified live: the first run of the release SQL as `hc_pipeline`
returned **11** — the real D13 backlog this machine had accumulated.

The 4B seam rows in both suites were AMENDED rather than deleted, in two
steps as each half landed. Keeping the row where the seam was recorded
is what makes the flip legible a year from now.

**AMENDED (index: D10) — "the seam is consumed" is TRUE OF INTERPRET
AND FALSE OF THE GATE LEG.** `fireWorker` is called for scan, gate and
interpret and **never for extract**, and no trigger writes a
`pipeline_outbox` row on `scanned → extracting`. Extraction therefore
begins only on the relay's once-a-minute cron tick, which is where
§4.5's cancel window comes from: **median ≈ 35 s**, most of it dead time,
on a Care Inbox that does not revalidate — while PRD §4.8's only arrival
email ("Ready to review") fires at the instant cancel stops being
offered. PRD §4.2.2 lists cancel as one of three things a family can do
at Reading, and nothing tells them Reading is happening (ADR-0023 D14).

**The owner ruled on it at sign-off: SIGNAL FIRST, THEN THE EAGER FIRE**
(ADR-0023 D24). The eager fire is an obvious latency win and it is
**HELD** — taking it first would collapse the window to seconds with no
test failing. The two stale comments the finding named
(`tests/routes/worker-stage.test.ts`, `route.ts`) are corrected under that
ruling rather than left describing a gap, and the relay leg now records
that an `extract` outbox row reaches it from no in-branch producer.

## D11 — B8: the D7 interim is DELETED, and the definer is a strengthening

`lib/db/evidentiary.ts` is gone, and the fence entry went with it —
a fence naming a deleted module looks like protection and is nothing at
all, so a test asserts the file's absence.

**The definer buys something the interim could not.** The 4B boundary
appended as `hc_internal` with the ROUTE's checks as the only gate; the
write itself asked nothing. `hc.log_artifact_read` re-proves RLS-10's
letter IN-FUNCTION, so a caller who reached the wrapper around the route
now writes NOTHING — asserted by counting `access_log` rows across a
refused call. The route's call shrank to `(claims, arrivalId)` because
the definer resolves the rest itself; passing values a definer ignores
reads like a contract and is decoration.

SND-03: `hc.revoke_sender` shipped at 4A with nowhere to call it from.
The pair is live at `/[circle]/senders`, **linked from the Care Inbox
and deliberately not a sixth nav item** — `NAV_MANIFEST` lists only live
primary routes and `tests/design/shell.test.tsx` pins the exact set, so
a sixth would change the shell and the a11y surface for a management
screen that belongs beside the thing it manages.

## D12 — B9: the harnesses, and the runner that avoids spending the reserve

**The G9 harness is the SOLE real-key path**, over the BLIND partition,
through the Batch API, writing an immutable manifest carrying the full
configuration behind the public pair, and printing the digest an owner
allowlists at sign-off. `--dry-run` does everything except the
credential — verified 12/12 requests build, nothing sent.

The scorer emits **no global number at all**, not even as a convenience,
because a convenience is what gets quoted. A wrong value counts as both
FP and FN; a field with no support scores `null`, never 1.0; an item
that produced nothing is scored as MISSED and NAMED.

**PRF-07 was RUN, not merely written.** The method is in the script
header. Recorded (n = 1 cold, 12 warm per cohort; PRF-06 nearest-rank):

| Cohort | cold p95 | warm p95 d1 | warm p95 d4 |
|---|---|---|---|
| born-digital PDF | 5430 ms | 3645 ms | 3061 ms |
| scanned PDF | 2162 ms | 3708 ms | 5406 ms |
| phone photo | 2487 ms | 5140 ms | 6866 ms |
| email body | 1436 ms | 1417 ms | 1511 ms |

The worst figure is ~11% of §13.2's 60 s budget — **which says our
machinery leaves the provider ~53 s, not that the budget is met.** The
hosted, provider-inclusive row is on `docs/ops/ai-provider.md` carrying
PRF-06's breach-clause discipline.

**The bench found two things, both product-correct and bench-wrong.**
Re-sending one fixture measured the DUPLICATE path from the second
sample on, because identical bytes are a stage-1 duplicate by design;
the bench now appends trailing bytes so each sample has its own sha and
the same content. And at queue depth 4, "call the worker twice for my
arrival" measured the HARNESS, because the route reads a BATCH from the
shared queue — which is exactly what the relay does — so the bench now
drives until ready and watches its own arrival.

**The runner.** The harnesses are TypeScript because §6.10 only means
something if the eval sends what the WORKER sends. `scripts/ts-run.mjs`
is ~40 lines over Node 22's own type stripping, adding only the `@/`
alias and a `server-only` no-op. **The dev-dependency reserve is one
slot held for review dispositions; spending it here would pre-empt a
review that has not happened.**

**AMENDED (index: D12).** Three figures here are wrong in the same
direction — each makes the machinery sound smaller or stricter than it
is.

- **"`scripts/ts-run.mjs` is ~40 lines"** — it is **126 lines across two
  files**, and the unnamed half is `scripts/ts-resolve-hook.mjs`, a
  `module.register` resolver hook: the component most likely to break on
  a Node upgrade (R7/F-12). The Q-H conclusion is unaffected and the
  **dev-dependency reserve remains UNSPENT** — nothing in the round-16
  dispositions needed it.
- **"The scorer emits no global number at all"** should read **reports**
  no global number. The property is real in the emitted object and one
  line of arithmetic away in the artifact (R6/F-9).
- **"The G9 harness is the SOLE real-key path"** is literally false —
  `lib/ai/client.ts` reads `ANTHROPIC_API_KEY` in production. The
  surrounding prose means "the only path ever RUN against a real
  credential today", which is what it should say (R6/F-12).

**And one condition attached to the next section is now MET:** the
fixture server iterated all 28 items when this was written, with no
partition filter, so a gate-stack server could answer from BLIND labels
complete with their citation geometry. It is a property rather than a
convention from `ef67a83` (ADR-0023 D7, Q-F).

## D13 — B9: the fixture server, and what it deliberately cannot prove

`scripts/ai-fixture-server.mjs` answers from the TEXT it is given:
corpus labels whose values appear in the request become the facts, with
the corpus's own citation geometry. **For an IMAGE-ONLY source it
returns no facts, on purpose,** and says so in its header: it proves our
MACHINERY, never the model's VISION. Pretending otherwise would be Q5's
rejected "unlabelled second fixture world" wearing a different hat.

It joins the gate stack as a second Playwright `webServer` on 8787 with
`ANTHROPIC_BASE_URL` pointed at it. The adapter never branches on
environment; the gate's key is the literal string
`local-gate-fixture-not-a-credential`. **No credential is involved
anywhere in CI or the gate** — G9/G3's standing constraint as a
deployment fact rather than a promise.

## D14 — Named gaps and owner-queue items, recorded not dropped

1. **`render_bounds_exceeded`** — a reason code for D7's mapping. Next
   DB-opening slice, or a bound amendment.
2. **`hc.extractions_for(p_arrival)`** — D6(2)'s read path.
3. **`extract_timeout` is currently unreached.** A provider timeout is a
   RETRY (the scanner precedent), and exhaustion lands `extract_failed`
   with `extract_budget_exhausted`, so nothing produces the
   `extract_timeout` state. Options are offered at the round-16 packet;
   changing `stage_budgets.exhaust_state` is DDL.
4. **Proposals carry no `source_extraction_ids`.** `hc.write_proposals`
   passes them through verbatim and the worker has no way to learn the
   ids the same transaction is about to mint. The link between a
   proposal and the facts it cites is therefore by field name until a
   DB surface exists.
5. **§5.9's monthly-ceiling notification stays slice 11.** Until it
   ships, cost is watched by a person — stated on `ai-provider.md`.
6. **SND-02's live-actor family audit** rides with the account-deletion
   path (ADR-0021 S2), NOT with 5B.
7. **`grant select (duplicate_of_document_id)`** — D15. Until it lands,
   the stage-2 copy says why rather than what.

## D15 — THE FINDING: a column-level grant, and an empty Care Inbox

**The local gate caught this, and nothing else could have.**

`authenticated` holds a **COLUMN-LEVEL** select grant on
`public.arrivals` — 25 of its 28 columns, enumerated — and 5A M5 added
`duplicate_of_document_id` without extending it. B6's first draft named
that column in the inbox's select. Postgres refused per-column,
supabase-js returned an ERROR rather than rows, and the page's own
`parents.length === 0` branch took over: **the entire Care Inbox
rendered its first-run empty state, for every caller, on every
arrival** — not merely for stage-2 rows.

The tell was a 4B leg going red: `e2e/ingestion.spec.ts`'s TUS upload
test expected "Uploaded document" and got the forwarding-address empty
state, while the arrival existed in the database with a null parent, a
null `deleted_at`, and the founder a live coordinator.

**Why the unit suite could not see it.** The route tests mock the
supabase client, so a refused query and an empty circle are the same two
lines of fixture. The regression guard added with the fix therefore
asserts on the SELECT STRING — a render assertion cannot distinguish "no
arrivals" from "the query was refused", which is precisely how this
passed a green suite.

**The fix, inside the bound:** the page stops selecting the column;
suspects come from the STATE alone. The affordance is untouched.

**The fix that is NOT taken here** is one line of DDL:

```sql
grant select (duplicate_of_document_id) on public.arrivals to authenticated;
```

The migration bound is spent at 6 of ≤ 6, so this is an owner
bound-amendment, not a session decision. It is the round-16 headline
pointed question.

**Two things worth the reviewer's attention beyond the fix:**

1. **The column-level grant is deliberate** (a member reads 25 of 28
   columns; `duplicate_of_arrival_id`, the lease pointer and the
   idempotency key are withheld), so the answer is to extend it by one
   column, not to replace it with a table grant.
2. **Nothing else in 5B selects an ungranted column**, verified against
   `information_schema.column_privileges`. But the class of defect —
   a migration adds a column, a member surface reads it, the grant is
   never re-pinned — has no test today at the DB layer. A pgTAP
   invariant asserting that every column a member surface selects is
   granted would close it, and is worth the reviewer's opinion.

**AMENDED (index: D15).** Two of the three withheld columns named
above are wrong, and the app-side guard is narrower than this section
claims. Measured live against `information_schema.column_privileges`:
**28 columns, 25 granted to `authenticated`; withheld `auth_detail`,
`current_lease_id`, `duplicate_of_document_id`.** So
`duplicate_of_arrival_id` **does not exist** — the string appears exactly
once in the repository, in the line above — `ingest_idempotency_key` is
**granted, not withheld**, and `auth_detail`, the one withholding with a
real security rationale (spelled out in `20260816010007`'s own header: it
gates the verbatim DMARC/SPF/DKIM verdict blob), was omitted entirely. An
owner reading the original list would have concluded that a table-wide
grant costs nothing, and it would expose exactly what
`hc.arrival_auth_detail` exists to gate at VIEW (R5/F-3).

The regression guard was also a **denylist of one literal** over
`.select()` strings, while Postgres checks column privilege on **every
referenced column** — proven live: a SELECT list, a WHERE-only reference
and an ORDER BY-only reference are each refused, so `.eq()`, `.is()` and
`.order('duplicate_of_document_id')` reproduce this finding and the guard
read none of them. It is an ALLOWLIST over every clause from `7c86c38`,
checked against the same exact set pgTAP 057 pins from the DB side
(R5/F-4). Postgres also says `permission denied for table arrivals`, not
`for column` — an on-call engineer grepping the quoted string finds
nothing (R5/F-9).

**And the one line of DDL "NOT taken here" was taken.** The owner granted
the bound amendment; M7 carries the grant, the `column_privileges`
EXACT-SET invariant this section asked for — specified the mechanical way
round, as an expected-set assertion per member-readable table, because
"every column a member surface selects" is not knowable from the DB — and
Q-B's reason code. §4.7's p2 copy now reads *"This looks like the
discharge summary you filed on July 12."* (ADR-0023 D8, D20).

## Consequences

- The pipeline runs `arrive → … → proposals_ready` end to end, on
  fixtures, with no provider and no credential anywhere in CI or the
  gate.
- **The exit seam is honest and unchanged:** proposals REST at
  `pending`. The review screen, item-level approval and the receipt are
  slice 6's, so `Needs you` labels a true state whose acting surface is
  one slice away.
- **The G9 gate is OPEN.** Every field publishes high-risk, which §6.5
  calls the shipping default rather than a degraded state, and the band
  loader cannot be talked out of it by a config accident.
- **G3/G9/G4/G7 all still block production activation.**
  `docs/ops/ai-provider.md` exists and opens by saying nothing on it is
  done.
- ~~The migration bound stays spent at 6 of ≤ 6; `supabase/` is
  byte-identical to main at tree `6ac8a1cd…`.~~ **SUPERSEDED (index:
  Context): the bound was amended twice by the owner and closes SPENT at
  8 of ≤ 8 — M7 `20260823060001_round16_fixes.sql`, M8
  `20260823070001_interpret_terminal.sql`. 62 migrations / 59 pgTAP
  files, and `supabase/` is no longer byte-identical to main.**
