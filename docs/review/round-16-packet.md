# Third-party review packet — round 16: slice 5B, the app half of extraction + interpretation

**Prepared:** 2026-08-22, at the close of the 5B build session.
**Branch:** `slice/5b-app-extraction` (pushed; PR at review start), base
`main` @ `a9d9f43`
(`a9d9f430009b96610db4a5751b152947d798875e`, the 5B build-kickoff
commit; CI run `32609469623`, completed/success, every step — the
regress terminates there per the standing rule).
**Authority:** `docs/review/slice-5-plan.md` (PLANNED–RULED; **Q1–Q9
SETTLED verbatim**, the B-rows as amended by the post-gate integration
BINDING) → TSD §6, §4.3–§4.10, §3.10, §1.9, §13.2 as amended by annexes
A5/A6/A9/A10/A11 → ADR-0017/0018/0019/0020/0021 → ADR-0006 →
`docs/coverage.md`.
**The as-built ADR for this build:** **ADR-0022** (Proposed — this round
ratifies or amends it).

---

## Addendum-first: the head ledger (the round-8 rule, from the start)

| Purpose | SHA | What moved | Status |
|---|---|---|---|
| Base (main, the 5B kickoff) | `a9d9f43` | — | CI green (`32609469623`) |
| B1 red / green | `14ef86b` / `2a20c73` | +tests · +`fixtures/g9` (28 items), the builder, the loaders, the catalogue, the corpus spec, `.gitattributes` | unit green |
| B2 spike | `70334c6` | +`scripts/spike/mupdf-spike.mjs`, `mupdf` installed | 8/8 legs PASS |
| B2 red / green | `0b2258e` / `a957770` | +tests · +`lib/pipeline/render.ts`, `page-keys.ts`, the storage lifecycle, `serverExternalPackages` | unit green |
| B3 red / green | `205d093` / `88ed484` | +tests, +the fixture server, SDK installed · +`lib/ai/**`, the two new fences | unit green |
| B4 red / green | `c51ebe0` / `911792b` | +tests · +the extract arm, `lib/extraction/bands.ts`, `readArtifactBytes`, `maxDuration` | unit green |
| B5 red / green | `6367106` / `24b6998` | +tests · +the interpret arm, the conflict conversion | unit green |
| B6 red / green | `fbac053` / `b73449d` | +tests · +the stage-2 surface, ProvenanceLine's first consumer | unit green |
| B7 red / green | `046fed2` / `d895188` | +tests · +the relay flip, `releaseDeferredWork` | unit green |
| B8 red / green | `f2fb264` / `3398f4b` | +tests · +the definer swap, **`lib/db/evidentiary.ts` DELETED**, the senders surface | unit green |
| B9 | `c933c6a` | +the G9 harness, PRF-07, the extraction gate leg, `ai-provider.md`, the TS runner | unit green |
| Coverage flip | `2b6ca52` | `docs/coverage.md` only | **CI green on the branch, run `32618352675`** |
| B6 fix red→green | `103be52` | the inbox regression the gate caught (packet Q-A) | unit green |
| **Evidence head** | **`fa90d6e`** | the gate's last two legs — a seam assumption and a claim guard, both FIXTURE fixes | **the complete evidence block below is recorded at exactly this SHA** |
| Review head | the docs-only commits after it (ADR-0022, this packet, the round-16 kickoff) | `docs/` only — the per-directory binding transfers the evidence | this packet's final SHA is the PR head |

**Per-directory tree binding (ADR-0015 F12):**

```
supabase  6ac8a1cd17110dfcf8c33852e251f2c522621661   UNCHANGED vs main a9d9f43
app       MOVED   the [stage] worker (extract + interpret), the inbox
                  stage-2 surface, the senders page + submit route, the
                  artifact route's shrunken log call
lib       MOVED   +lib/ai/** +lib/eval/** +lib/extraction/** +lib/pipeline/
                  render.ts +page-keys.ts; lib/db/evidentiary.ts DELETED
e2e       MOVED   +e2e/extraction.spec.ts
tests     MOVED   9 new files, 6 amended
scripts   MOVED   +the corpus builder, the spike, the fixture server, the
                  eval harness, PRF-07, the TS runner
fixtures  MOVED   NEW tree — the G9 corpus
docs      MOVED   coverage §5, ai-provider.md, the corpus spec, the gate
                  protocol, ADR-0022, this packet
```

**`supabase/` is byte-identical to main.** The migration bound stays
SPENT at 6 of ≤ 6 and was never approached — 60 migrations, 57 pgTAP
files. CI confirmed it independently on the branch with its own clean
reset and exact-migration-state check rather than a hash comparison.

Every non-`supabase` tree moved, so **nothing is inherited by F12
transfer this round**: vitest, lint, typecheck, build, both scanners and
the FULL local gate were re-run at the head.

---

## What round 16 reviews

5B is the APP HALF of slice 5 (Q1's ruling: 5A M1–M6 → round 15 →
merge, done at `7893b80`; 5B app B1–B9 → this round). Nine units,
red→green, the failure signature in every red commit message.

**What the slice does now:** a gated arrival proceeds `extracting →
extracted → interpreting → proposals_ready`, the inbox reads `Needs
you`, and **proposals REST at `pending`** — the review screen,
item-level approval and the receipt are slice 6's. That seam is
unchanged and honest: nothing is production-activated, so no family sees
it.

**What it deliberately does NOT do:** call a provider. Anywhere. CI is
keyless, the local gate is keyless, and the eval harness is the sole
real-key path — over synthetic material, never a real document.

---

## The one-SHA evidence block

*(Recorded at the evidence head — the last commit moving a non-docs
tree. Anything after it is `docs/` only.)*

| Leg | Result |
|---|---|
| `supabase/` tree | `6ac8a1cd…` — **byte-identical to main**; 60 migrations, 57 pgTAP files |
| Clean-leg reset | `npm run db:reset` → `verify-migration-state.mjs`: **migration state exact: 60 applied == supabase/migrations** |
| pgTAP · concurrency · db:verify · upgrade leg | **CI, run `32618352675`, all steps success** — the authority for the DB legs this increment did not touch |
| vitest | **631 passed (631) across 62 files** — baseline was 448/53 |
| lint | clean |
| typecheck | clean |
| production build | clean, **no warnings** |
| service-role containment | OK (single permitted module) |
| exposed-schema pin | OK (public, graphql_public — hc never exposed) |
| gitleaks | CI's secret-scanning step, success |
| **Local gate** | **29/29 passed** — walkthrough 11 + a11y 5 + ingestion 8 = **24 UNCHANGED**, plus B9's 5 extraction legs |
| mupdf spike | 8/8 legs PASS — `SPIKE VERDICT: mupdf carries §6.3` |
| G9 harness dry-run | 12/12 BLIND requests build; **nothing sent** |
| PRF-07 | cold + warm(depth 1) + warm(depth 4) legs run; table in ADR-0022 D12 |

**Dependency bound:** 2 runtime deps of the 2 approved
(`@anthropic-ai/sdk` 0.120.0, `mupdf` 1.28.0). The spike-contingent
runtime reserve is **NOT consumed** (the spike did not falsify `mupdf`).
The dev-dependency reserve is **UNSPENT** — B9's harnesses run through a
40-line zero-dep TypeScript runner rather than a package, deliberately,
because that reserve is held for this round's dispositions.

---

## Where to look first

A reviewer with limited time should read, in this order:

1. **`lib/extraction/bands.ts` + `tests/extraction/bands.test.ts`** —
   the all-high-risk mode as structure. This is the thing that must not
   be wrong.
2. **`tests/ai/adapter.test.ts`** — the adapter contract, asserted on
   the request body the provider receives rather than on our source.
3. **`lib/pipeline/render.ts`** and the spike's leg 7 — the orientation
   door, and why the wrong one is a silent citation failure.
4. **`app/api/worker/[stage]/route.ts`**, `processExtract` and
   `processInterpret` — the §4.3 sequence, the exits, the GC/promote
   lifecycle.
5. **ADR-0022 D15** — the column-grant finding, the fix, and what it
   costs B6's copy. Then D6 and D7, the two other gaps the app layer
   cannot close. All are pointed questions below.

---

## The pointed questions (recommended answers attached)

### Q-A — the headline: one column grant, and an empty Care Inbox

**Found by the local gate; nothing else could have found it.**
`authenticated` holds a COLUMN-LEVEL select grant on `public.arrivals`
— 25 of its 28 columns — and 5A M5 added `duplicate_of_document_id`
without extending it. B6's first draft named that column in the inbox's
select; Postgres refused per-column, supabase-js returned an ERROR
rather than rows, and the page's own empty branch took over: **the whole
Care Inbox rendered its first-run empty state, for every caller, on
every arrival.** A 4B leg going red was the tell. Full detail in
ADR-0022 D15.

The tree is FIXED and green — the page no longer selects the column,
suspects come from the STATE alone, both resolutions still render — and
a regression guard asserts on the SELECT STRING, because a render
assertion cannot tell "no arrivals" from "the query was refused", which
is exactly how this passed a green unit suite.

**What is still owed is one line of DDL:**

```sql
grant select (duplicate_of_document_id) on public.arrivals to authenticated;
```

Until it lands, the stage-2 copy says WHY the match happened rather than
WHICH document it matched — so B6's plan row ("copy cites the matched
FILED document") is **partially met, and recorded as such**, not quietly
declared done.

**Recommended: TAKE IT as a bound amendment at the round-16
dispositions** — the M6-shaped precedent, one migration, no new
surface. It is one grant on a column the member surface demonstrably
needs, the column-level grant is deliberate and should be EXTENDED
rather than replaced by a table grant, and deferring it leaves a
shipped feature half-built for a slice.

**And a second question inside it:** the class of defect — a migration
adds a column, a member surface reads it, the grant is never re-pinned —
has no test at the DB layer today. A pgTAP invariant asserting that
every column a member surface selects is granted would close it. Worth
the reviewer's opinion on whether that belongs in the same disposition.

### Q-B — `render_bounds_exceeded`: a reason code that does not exist

A page bomb or a pixel bomb lands `extract_failed` +
`archive_bounds_exceeded`. The state and the family-facing label
("Couldn't read it") are right; the code's description says "Archive
depth/entries/expansion" and this is not an archive. The alternative
inside the bound, `unsupported_type`, reads **"Unsupported file"** and
would tell a family something false about their document.

**Recommended: QUEUE IT.** Add `render_bounds_exceeded` at the next
DB-opening slice rather than amending a bound the owner closed. The
mis-description is operational-tier only — no family-facing string is
wrong today, and no state is wrong. The alternative (amend to ≤ 7 and
add the code now) buys a more accurate operational label for a full
migration evidence leg.

### Q-C — `hc.extractions_for(p_arrival)`: the interpret read path

`hc_pipeline` has no `SELECT` on `extractions`, so the interpret worker
cannot read what the extract attempt published. 5B carries the facts on
the work item; a re-queued interpret re-normalises the document and
reads that instead, with the operator note saying the facts were absent.

**Recommended: QUEUE IT, and accept the current behaviour as correct.**
The bare path is not wrong — it reads the same source material — it is
merely more expensive for image-only sources. A one-function definer at
the next DB-opening slice makes both paths identical. Nothing here needs
fixing before merge.

### Q-D — `extract_timeout` is currently unreachable

A provider timeout is a RETRY (the scanner precedent: an outage is never
finalized early), and exhaustion lands `extract_failed` with
`extract_budget_exhausted`. Nothing produces the `extract_timeout`
state, which 4A shipped in the graph.

**Recommended: ACCEPT, and record it.** The retry posture is the
important half and it is right. Making the state reachable means
teaching exhaustion which failure was last — DDL on
`hc.stage_budgets`, and a more complicated exhaustion contract for a
distinction the family never sees (both labels read "Couldn't read
it"). Prefer the honest note over the mechanism.

### Q-E — proposals carry no `source_extraction_ids`

`hc.write_proposals` passes them through verbatim, and the worker cannot
learn the ids the same transaction is about to mint. So a proposal
references its facts by field name, not by id.

**Recommended: ACCEPT for slice 5; it is slice 6's to close.** The
consumer is the review screen, which does not exist yet. Whoever builds
it will know what shape it needs, and guessing now risks a column that
gets rebuilt.

### Q-F — the fixture server cannot prove vision, and says so

For an image-only source the fixture server returns NO facts, on
purpose. The gate leg therefore uses born-digital material for the happy
path, and image extraction is measured only by the G9 harness against
the BLIND partition with a real key.

**Recommended: RATIFY the split as designed.** The fixture server proves
our machinery; the eval harness proves the model. Making the fixture
server "recognise" images would require it to render and hash the
corpus, which is a second source of truth about what a document says —
Q5's rejected second fixture world in a new costume.

### Q-G — the corpus measures the contract, not the vision

`docs/eval/g9-corpus-spec.md` §1 and §7 state it plainly: these
synthetic fixtures measure our extraction contract end to end on
material of known content; they do not measure Opus 5's reading of a
real pill bottle. With 4–11 blind items per field, a measured 1.00 means
"no error in a handful of tries".

**Recommended: RATIFY the spec as written, and treat corpus growth as a
G9-gate decision, not a build one.** §7 prices the three options
(more generated items · photographed synthetic documents · a second
annotator). The owner should choose with the first eval run's numbers in
hand.

### Q-H — the TypeScript runner instead of a dev-dependency

`scripts/ts-run.mjs` is ~40 lines over Node 22's own type stripping. The
alternative was spending the dev-dep reserve on a TS runner.

**Recommended: RATIFY.** The reserve is one slot held for review
dispositions; spending it before the review would pre-empt exactly this
round. If the reviewer would rather have a maintained package, that is a
disposition this round can make — and the reserve is still there for it.

---

## What this round does NOT cover (named, per the plan)

- **The review screen, item-level approval, the receipt, A11Y-07** —
  slice 6. Proposals rest at `pending` by design.
- **OCR (§6.9) and A11Y-08** — moved wholesale to slice 6 by Q6.
- **The G9 gate itself.** EVA-01 is green for the harness, the corpus
  and the spec, and the row says in the same cell that the GATE IS OPEN.
  It closes at owner sign-off of the bands, against a completed BLIND
  run, before any real document.
- **G3's four terms, G4's deploy rows, G7's hardening set** — all
  deploy-level, all on their checklists.
  `docs/ops/ai-provider.md` is new and opens by saying nothing on it is
  done.
- **SIG-01** — the KMS key and ledger store stay deploy-level; the row
  stays pending, not quietly absorbed.
- **SND-02's live-actor family audit** — rides with the account-deletion
  path (ADR-0021 S2), not with 5B.
- **§5.9's monthly-ceiling notification** — slice 11.
- **G12** — still blocks the first non-founder invitee.

---

## The gate run

```
npx playwright test --trace on          →  29 passed (7.4m)
```

Run at `fa90d6e`, on a clean `npm run db:reset` (exact 60), against the
full stack: Supabase, the `hc_clamd` container, and — new this slice —
the Anthropic fixture server on 8787, started by Playwright as a second
`webServer` with `ANTHROPIC_BASE_URL` pointed at it. **No credential is
involved anywhere in the run.**

| Spec | Legs | Status |
|---|---|---|
| `onboarding.spec.ts` | 11 | UNCHANGED |
| `a11y.spec.ts` | 5 | UNCHANGED |
| `ingestion.spec.ts` | 8 | UNCHANGED in count; ONE leg amended, argued below |
| `extraction.spec.ts` | 5 | NEW (B9) |

**24/24 UNCHANGED holds**, and the amendment inside it is worth the
reviewer's attention rather than a footnote:

**`ingestion.spec.ts`'s cancel leg was AMENDED, and the slice is why.**
§4.5's cancel window is `extracting | extracted | interpreting`, and
until 5B nothing consumed those states — every arrival that spec drove
simply RESTED at `extracting`, so "click the first cancel form on the
inbox" always found one. The pipeline now continues to
`proposals_ready`, where cancel is correctly no longer offered: the work
is done and the proposals are waiting for a person. **The product is
right; the leg's assumption was the seam.** It now makes its own
in-window arrival and binds the click to that arrival's form.

**Three gate runs were needed, and each found something real** — which
is the argument for the gate rather than an embarrassment:

1. *"Process from config.webServer exited early."* The fixture server's
   CLI guard compared `import.meta.url` to a hand-built `file://`
   string, which NEVER matches on Windows (`file:///C:/…`). It exited 0
   with no output and Playwright could only report the symptom.
2. **The column-grant finding** — packet Q-A, ADR-0022 D15. A 4B leg
   going red was the tell.
3. The two fixture problems above: the cancel leg's seam assumption,
   and `record_write_unclaimed` when a gate fixture tried to insert a
   record row directly — §4.9's deferred claim trigger doing exactly
   its job, since there is no approval SURFACE until slice 6.

**Artifacts:** `test-results/` retained at the run (traces per test via
`--trace on`), vault-side per the protocol.

**Flake policy observed:** no failed leg was re-run to green. Each
failure was classified from its output first, and every one turned out
to be a real defect in the code or in a fixture's assumption — none was
infrastructure, and none was re-run without a fix in between.
