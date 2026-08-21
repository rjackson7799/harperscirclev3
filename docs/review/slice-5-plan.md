# Slice 5 — Extraction + interpretation: the slice plan

**Status:** **PLANNED — RULED. Q1–Q7 SETTLED 2026-08-21 at the plan
gate** (rulings recorded verbatim below; every recommendation
accepted). The 5A build (M1 the inherited-obligations batch FIRST)
runs in its own fresh session on `slice/5-extraction`. Written
2026-08-21 in the planning session; main confirmed at `dd39f42`
(`dd39f427bd06404406f0e59f11bf6172a2440d79`, the 4B merge-stamp
commit, clean, in sync with origin) with CI green at that head (run
86, 32473677474 — completed/success, the anonymous public API,
checked first per the kickoff). The plan itself landed docs-only at
`efb11ed`, **CI green on main — run 87, 32475831700, SUCCESS** (public
API, confirmed in-session); the owner then ruled in-session and the
rulings landed in this docs-only follow-up.

**Authority:** TSD §11.1 row 5 ("Extraction + interpretation (§6) —
the AI layer, proposals, conflicts, the evaluation set; needs slice
4's arrivals; blocks on G9 before any real document") → **TSD §6
whole** + §4.3–§4.10, §3.10, §2.4–§2.6, §1.8/§1.9, as amended by
annexes A5/A6/A9/A10 (the as-built state is normative) → PRD §6,
§4.2.2, §8.9, §10.4, §13.2–§13.3, Appendix B → **G9 and G3 (the two
HARD gates — §6.10 and §6.2; the gate map §11.2)** → ADR-0017 (the 4A
as-built DB contract; D8 stage-1 duplicates, D10 staging) → ADR-0018
(round-12 dispositions; X2's canonical stage-1 match and its recorded
stage-2 catcher) → ADR-0019 (the 4B as-built contract; D13 the relay's
deferral seam, D15 named gaps, D7/Q-iii and D8/Q-vi the owner-queue
DB candidates, S3 the queue ratified through the merge) → ADR-0006
(owner sole merge authority) → `docs/coverage.md` row conventions →
`docs/ops/{ingestion-deploy, runtime-db-credentials,
security-actions-worker, e2e-local-gate}.md`.

**Branch (Q7 — SETTLED):** `slice/5-extraction` for 5A (branched from
main @ `efb11ed` or later docs-only), `slice/5b-app-extraction` for 5B
at its own kickoff — the 4A/4B naming precedent. Red→green per unit,
failure signatures in every red commit, merge commit never squash.

---

## THE HARD GATES — G9/G3, and how this slice builds under them

**G9 (§6.10, the TSD's tighter reading) blocks ANY real family
document reaching a provider at all** — not merely "for a proposal a
family will see". **G3 (§6.2) blocks any real document to an AI
provider** until the four terms are answered in writing — no training
on submitted data · zero retention (ZDR **per workspace**, requested
and confirmed, never assumed) · abuse-monitoring retention stated ·
provider-side logs stated — with the recorded **`claude-fable-5`
disqualification** (it requires 30-day retention and is unavailable in
a ZDR workspace; a request 400s — §6.1). The whole slice therefore
builds and proves itself **on fixtures**, and the discipline is
structural, not aspirational:

1. **No real family document exists anywhere in the system.** Nothing
   is production-activated (slice 4's Q7 ruling stands: no real
   forwarding address exists before G4/G7), so every arrival in every
   environment is synthetic by construction.
2. **CI and the local gate never call the provider.** The adapter
   reaches its endpoint through standard base-URL config; the gate and
   CI point it at a local fixture server speaking the Messages API
   shape (the clamd-container precedent, adapted — the adapter code
   never branches on environment). No Anthropic credential exists in
   CI at all.
3. **Real-key traffic is the eval harness only**, an opt-in script run
   against the G9 corpus — labelled synthetic material (discharge
   summaries, EOBs, pill bottles, handwritten notes, phone photos at
   an angle; never a real family's record at any stage, PRD
   Appendix B) — through the Batch API at 50% price (§6.10).
4. **Hosted activation of extract/interpret against real documents is
   additionally deploy-blocked**: a new `docs/ops/ai-provider.md`
   carries the G3 rows (the four terms in writing · ZDR confirmed on
   THE workspace whose key the deploy uses · structured outputs'
   qualified technical retention confirmed for the surfaces we use ·
   the Files API never used — §6.2) and the G9 row (per-field bands
   exist and the shipped `(model_id, prompt_version)` pair matches a
   completed eval run). Until G9's bands exist, **every field is
   treated as high-risk** (§6.5) — the all-high-risk mode is slice 5's
   shipping default, not a degraded state.

**Two adapter properties are pinned as tests, not habits:** the model
allowlist is exactly §6.1's table (`claude-opus-5` for
extraction/interpretation, `claude-sonnet-5` an approved cheap-pass
candidate) with `claude-fable-5` structurally refused; and
**server-side fallbacks are never sent** (§6.8's recorded decline — a
declined request must not be silently re-routed to a model outside
G3's cleared terms, which is a deliberate deviation from the SDK
skill's own default and is recorded here so review sees it argued).

## Migration bound (Q2): **≤ 6** (M1–M5 planned + M6 reserved)

The slice-2/slice-4 shape. Every planned migration is named below with
its contents; anything past the bound is a recorded owner amendment
before a line is written. Shipped migrations are never edited;
transition-graph and seed-table changes are appends with their pgTAP
exact-set pins re-pinned in the same commit (the 2A M6 / 4A M6
pattern). Slice-4's bound closed spent at 8 of ≤ 8; this is a fresh
bound for a fresh slice (the slice-4 Q3 precedent).

## Dependency bound (Q3): **TWO argued runtime dependencies**

- **`@anthropic-ai/sdk`** — the provider client. Argued, not assumed:
  the claude-api skill (read in this planning session, its trigger
  honoured) defaults TypeScript projects to the official SDK, and the
  surface this slice uses is wide and drift-prone — typed content
  blocks and `stop_details`, structured outputs (`output_config`),
  vision blocks, prompt-caching controls, the Batch API, typed errors
  and retry/timeout semantics. Hand-rolling that (the Postmark/clamd
  zero-dep precedent) was right for tiny stable protocols; here it
  would re-implement SDK functionality against an API whose shapes
  have moved repeatedly in 2025–2026. The G3 posture survives: the SDK
  is consumed by ONE fenced adapter family (`lib/ai/`), so
  disqualifying a provider stays a swap, not a rebuild (§1.9).
- **`mupdf`** (the WASM build) — the §6.3 rasterizer: PDF pages to
  images at the source-typed resolutions, the embedded text layer of
  born-digital PDFs, and image-input normalisation, in one
  zero-native-dep package. Taken through a **verification-spike unit
  FIRST** (B2; the vault's `verification-spike` pattern): born-digital
  PDF → page images + text layer · phone-photo JPEG → 2576 px long
  edge, never below · encrypted PDF → `needs_password` · undecodable
  bytes → `unsupported_type`. Recorded alternatives if the spike
  falsifies it: `pdfium` bindings (native per-platform binaries —
  worse on the platform) · `pdfjs-dist` + a canvas backend (two
  packages). **One reserved runtime slot** contingent on that spike
  (e.g. an image library if `mupdf` cannot cover normalisation) —
  consumed only with the spike's evidence in the commit, otherwise an
  owner amendment.

Everything else stays zero-dep: the eval harness is the adapter + the
Batch API, stage-2 duplicate matching is SQL (below), the fixture
server is a test utility. Dev-dependencies: **one reserved slot** for
review dispositions (the standing precedent).

**Skills gates (build sessions):**
`supabase:supabase-postgres-best-practices` **before any DDL
authoring** · **`claude-api` before any provider-shaped code** (the
adapter, the eval harness, the fixture server — this gate is new with
this slice and stands for every session that touches `lib/ai/`) ·
`vercel:nextjs` (and the AGENTS.md `node_modules/next/dist/docs/`
guides) before route work · `frontend-design` only if 5B's small
surfaces need components the slice-3 system lacks (they should not —
compose, don't invent).

**HonuVault `patterns/` check — done in planning.** Applicable
`#portable` entries, mostly this project's own promotions already
embodied in the tree — reuse, don't reinvent:
[[transition-allowlist-as-data]] (M5's graph appends) ·
[[claim-ack-outbox]] · [[authorize-under-the-lock]] ·
[[sweep-revalidate-under-lock]] · [[idempotency-requires-identity]] ·
[[two-session-concurrency-test-layer]] ·
[[catalog-based-privilege-closure-tests]] ·
[[refuse-what-you-cannot-validate]] (the citation CHECK, the schema
bounds) · [[bounded-deferral-gates]] (the D13 seam this slice
consumes) · [[report-only-diagnostic-vs-encoded-gate]] (the §13.2
harness posture) · [[verification-spike]] (B2). Promotion candidates
at slice completion: the fixture-server-behind-base-URL provider
harness, and/or the G9 corpus-and-bands harness shape, as
`#portable`.

## The §1.9 platform-constraints check — discharged here, as required

§1.9's platform row says: *"check the duration ceiling against the
extraction budget before slice 5."* Checked: the platform's recorded
default function timeout is **300 s** — exactly §4.3's 5-minute
extract wall clock, i.e. **zero headroom** for claim, render, and
finalize around the provider call. The plan therefore requires, at
B4: (a) the extract/interpret worker routes set an **explicit
`maxDuration` above the stage wall clock** (the paid plan the
per-minute cron already requires allows raising it; the exact hosted
ceiling is verified as a deploy-checklist row — the G4-row honesty
pattern, since no code half can pin a platform limit); (b) the
provider call carries its **own client-side timeout budgeted inside
the lease deadline**, so finalize always has room to run; (c) either
way correctness never depends on the platform: a hard kill is an
expired lease — the attempt is already burned durably
(claim-before-work, §4.3) and the sweeper re-queues or terminalizes
on budget. The ceiling risks wasted attempts, never a wrong state.

---

## What exists (do not rebuild) — verified against the tree

The 1C ruling said it and slices 4A/4B completed it: **the pipeline
substrate and the operational chain through the gate are done.**
Slice 5 is the two AI stages over machinery that already runs.

- **The whole state machine, live under browser truth:** arrivals
  advance `arrive → store → scan → gate` end-to-end (ADR-0019);
  `hc.claim_stage` (durable attempt counters; **interpret's in-flight
  transition at claim** — ING-07), `hc.advance_arrival`,
  `hc.finalize_extraction` / `hc.finalize_interpretation` with
  owner-only lease-bound write halves (`hc.write_extractions` /
  `hc.write_proposals`, `20260816010005_publication.sql`) and the
  ING-08 orphan-row guarantee raced two-session; stage budgets seeded
  (extract 3 · interpret 3); the closed transition graph at 18 rows,
  exact-set pinned (ING-10).
- **The tables §6 writes already exist** (1C): `extractions` with the
  `citation_present` CHECK (an uncited fact is unstorable — §6.4),
  `model_id`/`prompt_version` columns; `proposals` with kinds incl.
  `conflict`, versioning/supersession columns, `anomaly_flags`,
  `taint`; `approval_attempts` + `proposal_commits` (§4.9's whole
  boundary); the record tables (1B) `hc.record_context_for` will
  read. **`hc.draft_proposal` already drafts conflict kinds with
  parents + union taint (ING-09); `hc.approve_proposal` still refuses
  non-object kinds — that refusal is CNF-01's pending edge, lifted
  here.**
- **The work is already enqueued and waiting (the seam, both halves
  verified in the record):** slice-4's Q7 ruling (slice-4-plan;
  restated ADR-0017 D10) rests gated arrivals at `extracting` with
  the honest label; ADR-0019 D13 has the relay **DEFER**
  extract/interpret messages (`pgmq.set_vt`, +1 h, never consumed,
  never lost) with lineage riding each message. Slice 5's workers
  read exactly those messages; the deferred backlog drains the day
  the defer branch flips.
- **Stage-1 duplicates as amended:** canonical strictly-earlier match
  (ADR-0018 X2), resolution surfaces live for every suspected CHILD
  (ADR-0019 D12). **The recorded stage-2 obligation:** the same-email
  identical-pair edge that stage 1's ordering deliberately lets both
  scan clean is caught by *"Stage-2's key-field match against filed
  documents (slice 5, §4.7 point 2)"* — ADR-0018, the tie-semantics
  record. And ADR-0017 D8: the attach-as-additional-source outcome
  "needs a filed document and refines with slices 5/6" — stage 2's
  matched target IS a filed document.
- **The worker/relay chassis:** `/api/worker/[stage]` (store · scan ·
  gate; the key/auth posture), the per-minute relay + nightly route,
  eager fire, the sweeper (stage-agnostic — its listings already
  cover the new stages), `asPipeline` (§1.7), lineage recovery
  (fail-closed, D3), `HC_WORKER_KEY` discipline.
- **The app-layer boundaries as ratified:** the storage plane module
  (D1), staging + GC surfaces, the evidentiary append (D7 — the
  hc_internal-assumption interim this slice RETIRES), the maintenance
  two-op pin, `hc_runtime` on the request path (D8), all
  fence-pinned in `tests/lint/db-fence.test.ts`.
- **The design system + inbox:** product-state labels are already
  PRD §4.2.2's fifteen strings over the 21-value enum (A9) — `Needs
  you`, `Couldn't read it`, `Needs a password`, `Looks like a
  duplicate` all render today; `ProvenanceLine.tsx` sits built and
  unconsumed (design-conformance §1: "consumed from slice 5 on" —
  disposition at Q6).
- **Verified ABSENT (the gap this slice fills):** **no
  `hc.record_context_for`** and **no `extraction_runs`** anywhere in
  `supabase/` (grep-verified this session) · no extract/interpret
  arms in `[stage]` · no `lib/ai/` · no rasterizer · no conflict
  outcome machinery (approve refuses the kind) · no stage-2 duplicate
  machinery · no eval corpus/harness · no p95 measurement harness
  (D15's named gap) · no known-senders read surface (D15) · no
  `hc.log_artifact_read` (D7's queued candidate).
- **The regression net this slice must not dent:** 54 migrations
  exact · pgTAP 1363 across 51 files · concurrency 63 assertions
  across 38 cases (teed) · vitest 431 (test:app) · local gate 24/24
  (walkthrough 11 + a11y 5 + ingestion 8) · lint/typecheck/build
  clean · `supabase/` tree `3b761d6a…` unchanged through the 4B
  merge.

---

## The increment — unit map (5A DB → round 15 → merge; 5B app → round 16, per Q1)

### 5A — the database increment (migrations M1–M6, bound ≤ 6)

| # | File | Contents | Spec |
|---|---|---|---|
| M1 | `inherited_obligations` | The owner-queue batch (the R8 precedent — inherited DB items land FIRST, before slice-5-proper work): (1) **`hc.log_artifact_read(p_arrival)`** — authenticated definer with in-function authorization, writing the §1.3 step-6 entry the artifact route today appends via the D7 hc_internal-assumption boundary; the ADR-0019 Q-iii queued candidate, retiring that interim (app half B8). (2) **The known-senders read surface** (D15's revoke-sender gap): `hc.list_known_senders(p_circle)` — live rows with accepted-by/at, the SND-02 authorization shape (coordinator/manage-gated, DEF-10), giving `hc.revoke_sender` its member surface at B8. (3) **D8's NOINHERIT** per Q4's ruling: `hc_runtime`'s two memberships re-granted `WITH INHERIT FALSE` (SET ROLE preserved — the channel is SET ROLE, not inheritance), flipping the bare-login probe from RLS-empty-zero-rows to an honest privilege refusal; `tests/db/runtime-credential.test.ts` and BAT-04's pins re-pinned same commit; `docs/ops/runtime-db-credentials.md` row updated. | ADR-0019 D7/D8/D15, Q-iii/Q-vi, S3 |
| M2 | `record_context` | **`hc.record_context_for(p_arrival)`** to §3.10's letter: hc_pipeline-only EXECUTE, owner `hc_internal`, revoked from everything else; returns ONLY the arrival's own subject's record in the arrival's own circle — current `profile_facts`, recent `timeline_events`, open tasks, documents in the same categories (§6.6's shape) — cross-subject/cross-circle unreadable **by signature**, DEF-10 one shape for nonexistent/foreign. Output bounded (a cap per section — the P5 discipline) so the interpretation prompt has a stated size, and shaped stably (deterministic ordering) so the §6.6 cache prefix is byte-stable per subject. | §3.10, §6.6 |
| M3 | `extraction_runs` | The §4.3/§6.4 run-versioning contract made structural: `extraction_runs` (arrival, model_id, prompt_version, attempt, lease-bound; a run row exists even when zero facts land — refusals/failures are countable per class, PRD §10.4) with **supersede-not-append** enforced at `hc.write_extractions` (a re-run's publication supersedes the arrival's prior facts in the same transaction — a retry cannot double a fact); `hc.reason_codes` appends the honest §6.8 exits (`provider_refusal`, `extract_budget_exhausted` if absent, `needs_password`/`unsupported_type` codes as the normalize outcomes need); `write_proposals` verified to carry `anomaly_flags` through (§6.7) and refined here if not. Exact shapes red-first at build; the CONTRACT (runs recorded, supersession total, reasons enumerated) is this row's letter. | §4.3, §6.4, §6.8; PRD §10.4 |
| M4 | `conflict_outcomes` | CNF-01's lifted refusal: `hc.approve_proposal`'s conflict arm — §4.8's three outcomes exactly. **Use the new one**: new `profile_facts` row + `superseded_at`/`superseded_by_id` on the old IN ONE transaction, both provenances intact (the `profile_facts_current` partial unique index stays the only path — no quiet overwrite exists); **keep what's there**: nothing written, proposal closes `rejected`, the conflict logged; **keep both and ask**: no fact, a drafted task instead. One proposal, one object, one transaction — `proposal_commits` unchanged; §4.9 versioning/idempotency ride as-is. pgTAP drives all three plus the version-race and double-approve edges. | §4.8, §4.9, §2.5 |
| M5 | `duplicates_stage2` | §4.7 point 2: the key-field match against FILED documents (document type, date, provider, amount, policy number — normalised SQL comparison over approved extraction values; deterministic and pgTAP-provable; the §6.1 model-assisted comparison stays a recorded G9-calibrated future refinement, not this migration), run inside `hc.finalize_extraction`'s transaction on successful publication (the D8 stage-1-in-finalize_scan precedent — the work answer still lands in full; the duplicate question is held by state). Graph appends + ING-10 re-pin same commit; **the exact state shape (reusing `duplicate_suspected` with a stage discriminant vs a distinct state) is a named red-first build decision inside this migration** — the letter is: entry after extract, the two human resolutions, `different` resumes toward interpret via a real lease + CAS + outbox re-queue (the SND-02/D8 pattern), **`same_thing` attaches the arrival to the matched document as an additional source (`provenance_edges` — the document now cites both) and files nothing new** (ADR-0017 D8's refinement lands), never auto-discarded either way. Catches ADR-0018's recorded same-email identical-pair edge — pinned by that exact scenario. | §4.7 p2; PRD §8.9; ADR-0018 |
| M6 | *(reserved)* | Round-15 dispositions/fixes — the standing precedent. | — |

**5A test plan:** pgTAP 051–055 (one file per migration; refusal
shapes, replay, privilege closure catalog-based — the segfault trap);
concurrency additions (teed): conflict approval version-race (two
coordinators, §4.9) · stage-2 resolution vs a freeze committing
mid-wait (R-rule) · re-run supersession vs cancellation (the ING-08
class extended to M3's contract) · record_context_for vs concurrent
record writes (stable read, no torn context). CI:
verify-migration-state exact counts 54 → 54+N; upgrade leg green;
db:verify clean under `--fail-on warning`.

### 5B — the app increment

| # | Unit | Contents | Spec |
|---|---|---|---|
| B1 | The G9 corpus | The labelled synthetic corpus FIRST (per Q5): discharge summaries, EOBs, pill bottles, handwritten notes, phone photos at an angle — never real family material (PRD Appendix B); per-field labels matching PRD §6.4's risk-class list; checked into the repo as fixtures. **One corpus, two consumers:** the eval harness measures per-field precision/recall against it (§6.10), and the worker/adapter tests and the fixture server serve from it — the build never invents a second, unlabelled fixture world. | §6.10; PRD §6.4, App. B |
| B2 | The rasterizer | The `mupdf` verification spike (the four legs above) THEN `lib/pipeline/render.ts` as the §6.3 rules-as-code: born-digital PDF → standard-res images + the text layer together; scans/photos/pill bottles → high-res (2576 px), **never downsampled**; email bodies text-first; `page_count` bounds enforced BEFORE rendering (200 high-res pages must never be dispatched by accident — §6.3); rendered pages staged under attempt-scoped keys, unreachable from user paths, GC'd when the lease closes as anything but `advanced` (§4.5). | §6.3, §4.5 |
| B3 | `lib/ai/` — the provider adapter | ONE fenced module family (the §1.9 one-adapter G3 posture; ESLint-fenced to the worker routes + the eval harness, the lib/hc precedent). Messages API via the SDK: **structured outputs** (`output_config.format` — a parseable object, never a JSON-shaped string; the provider's citations feature never sent, §6.4's recorded incompatibility), vision blocks per B2's rendering, **our own normalised citation geometry** `{page, bbox}` in our schema; `max_tokens` sized for thinking PLUS output (§6.1's truncation trap); the record-context prefix behind a `cache_control` breakpoint with the 512-token minimum **checked, not assumed** (§6.6); operator context as `{"role":"system"}` messages, never in the arrival's turn; source text as delimited data (§6.7); **`stop_reason` checked first — a refusal is HTTP 200** and maps to the honest terminal path, never "unsafe" copy (§6.8); **no server-side fallbacks, ever** (pinned); no Files API (pinned); the model allowlist pinned with `claude-fable-5` refused; client-side timeout inside the lease deadline (the §1.9 check); `model_id` + `prompt_version` from config, recorded on every run. | §6.1–§6.8 |
| B4 | The extract worker | `[stage]` gains `extract`: claim → COMMIT → render (B2) → provider (B3) → `hc.finalize_extraction` (facts + drafted proposals in the won transaction; M3's supersession). `risk_class` assigned **by field, before the call**, from PRD §6.4's list — the all-high-risk mode is the shipping default until G9's bands exist (§6.5); uncited facts become questions or are dropped at the pipeline (the CHECK has nowhere to hide); normalize outcomes (`needs_password`, `unsupported_type`) land their honest states; refusal/exhaustion terminalize with M3's reasons; `maxDuration` set explicitly per the §1.9 check. The P5 publication caps (≤200 facts, ≤8 KB values, ≤50 proposals) bound the schema the model is asked for — refusal-shaped, not truncation-shaped. | §4.3, §6.3–§6.5, §6.8 |
| B5 | The interpret worker | `[stage]` gains `interpret` (claim's in-flight transition — ING-07): `hc.record_context_for` (M2) → the record-aware pass (§6.6) → proposals AND conflicts drafted (§4.8's Phase-1 conflict list; a high-risk change is ALWAYS a conflict, never a quiet update), `anomaly_flags` set for injection shapes (§6.7/§4.10 defence 3) → `hc.finalize_interpretation` → `proposals_ready`. Structural guarantees restated as tests, not prose: the pipeline cannot reach another subject's record (M2's signature) and cannot act on its conclusions (§3.10's absent privilege — the blast radius of full injection success is a proposal a person must read). | §6.6–§6.7, §4.8, §3.10 |
| B6 | Stage-2 surface + copy | The §4.7 p2 member surface on the EXISTING inbox machinery (D12's resolution affordances bound to the suspected row): the stage-2 copy cites the matched FILED document (*"This looks like the discharge summary you filed on Jul 12"*), `same_thing` lands the additional-source outcome, `different` resumes; **`ProvenanceLine.tsx` takes its first consumer here if the matched-document line renders provenance (the natural fit), else its design-conformance citation moves honestly to slice 6 with the review screen — decided red-first, recorded either way (Q6).** | §4.7; PRD §8.9 |
| B7 | The relay flip + the seam consumed | D13's defer branch flips to consume: extract/interpret messages eager-fire and queue-read like every other stage; the +1 h deferred backlog drains; the sweeper's listings now advance the new stages (no sweeper change expected — stage-agnostic by construction, asserted not assumed). The Q7 seam CLOSES: a gated arrival proceeds `extracting → extracted → interpreting → proposals_ready` and the inbox label reads `Needs you`. Production activation remains G4/G7-gated throughout — nothing real exists to process. | ADR-0019 D13; §4.3 |
| B8 | Inherited surfaces + boundary retirement | The artifact route moves its access-log append onto M1's `hc.log_artifact_read` — `lib/db/evidentiary.ts` is DELETED (the D7 interim retired; evidence-before-bytes unchanged), the fence and containment pins re-pinned to the shrunken surface. The known-senders member surface (M1's read + the existing `hc.revoke_sender`): list + revoke on the inbox's sender management, composed from slice-3 components. | ADR-0019 D7/D15 |
| B9 | The eval harness, the p95 harness, the E2E leg | (1) **The G9 harness**: the corpus through the Batch API (50%), keyed `(model_id, prompt_version)`, per-field precision/recall emitted against B1's labels — the §6.10 letter: a model or prompt change is not shippable without a re-run; opt-in with a real key, never CI. (2) **The §13.2 p95 harness** (D15's named gap, discharged as far as locally possible): arrival→`proposals_ready` measured over the eager path against the fixture server — **report-only locally** (it proves OUR machinery's share of the 60 s budget; provider latency rides §4.3's lease budgets; the hosted measurement is a named `ai-provider.md` deploy row — the PRF-06 cold-leg precedent). (3) **The E2E extraction leg** under the local-gate protocol (fixture server in the gate stack, the clamd-container precedent): upload → store → scan → gate → extract → interpret → `Needs you` on screen; a refusal fixture → `Couldn't read it` with the artifact still viewable; a needs-password fixture; the stage-2 same-email pair → suspect → both resolutions live; walkthrough 11 + a11y 5 + ingestion 8 re-run UNCHANGED. | §6.10, §13.2 (PRD); ADR-0019 D15 |

**The inter-slice seam, stated (Q7).** Entry: slice 4's Q7 seam is
consumed exactly as ruled — the deferred messages are the work items,
nothing re-derives them. Exit: through slice 5 the pipeline runs
`arrive → … → proposals_ready`; **proposals REST at `pending`** — the
review screen, item-level approval and the receipt are slice 6's
(§11.1 row 6, "first point at which the loop closes"), so `Needs you`
labels a true state whose acting surface is one slice away. That is
honest for the same reason slice 4's seam was: nothing is
production-activated (G4/G7), so no family ever sees the seam; pgTAP
drives approval (including M4's conflict outcomes) end-to-end so the
machinery is proven before its surface exists. The deploy checklist
family grows `docs/ops/ai-provider.md` (the G3/G9 rows above, the
worker `maxDuration` verification, the hosted p95 row, eval-run cost
rows per §6.11).

---

## Test surface

**pgTAP (CI):** 051–055 per the 5A table — M1's probes (log entry
shape + authorization; sender-list authorization; the NOINHERIT flip
two-way), M2's signature-boundedness and shape stability, M3's
supersession totality and run accounting, M4's three outcomes + races,
M5's match rule, edges against ING-10's exact set, the ADR-0018
tie-pair scenario by name.

**Concurrency (CI, teed):** the four named 5A cases; the transient
protocol per the standing memory (tee always; case-1 40P01s are
deliberate).

**vitest (CI):** adapter contract (structured-outputs parse; refusal
mapping; the no-fallbacks and no-Files-API and model-allowlist pins;
base-URL fixture-server wiring; cache-breakpoint placement; timeout
inside lease deadline) · render rules per source type (the §6.3 table
as cases; the never-downsample floor; page_count-before-render) ·
worker order (claim→COMMIT→work→finalize; superseded-lease
publication refused) · relay flip (defer branch gone; backlog
consumed) · live-DB integration for record_context_for, conflict
outcomes, stage-2 resolution, log_artifact_read, list_known_senders ·
fence re-pins (lib/ai fenced; evidentiary module gone; the A2
allowlist unchanged). The four-class taxonomy labels every row.

**Local gate (browser truth):** the B9 extraction leg joins
`docs/ops/e2e-local-gate.md` (protocol doc gains the fixture-server
prerequisite beside clamd); walkthrough 11/11 + a11y 5/5 + ingestion
8/8 re-run UNCHANGED at every head whose `app/ lib/ e2e/ supabase/`
trees move (F12).

**What stays out, named:** the review screen, item-level approval UI,
the receipt, A11Y-07 (slice 6) · OCR §6.9 + A11Y-08 per Q6's ruling ·
SIG-01 (the runtime exists but the KMS key + ledger store are
deploy-level — stays pending, not quietly absorbed) · the §5.9
monthly-ceiling notification (slice 11, D15's record stands) · the
D11/finding-2 hop-binding code tightening (a pre-activation G7
hardening, available not required) · the two G4 deploy verification
rows (deploy-time, standing on `ingestion-deploy.md` — not
dischargeable by code) · ARC validation (Q5 of slice 4 — G7) ·
FRZ-16b, RLS-11b, SHR-02, DEL-01, ADM-01, G12-01 (their
slices/gates).

## Coverage rows to open (docs/coverage.md gains "## 5 — extraction + interpretation")

| ID | Assertion (compressed) | Layer | Status at slice end |
|---|---|---|---|
| EVD-01 | `hc.log_artifact_read` definer retires the D7 hc_internal-assumption boundary; evidence-before-bytes preserved; the evidentiary module deleted, fences re-pinned | pgTAP + app | green |
| SND-03 | Known-senders member surface: authorized list read + revoke live end-to-end (D15's gap closed) | pgTAP + app | green |
| RTC-01 | `hc_runtime` memberships INHERIT FALSE (per Q4): bare login privilege-refused, SET ROLE channel intact, BAT-04 re-pinned | pgTAP + review | green |
| CTX-01 | `hc.record_context_for`: pipeline-only, own-subject/own-circle by signature, bounded and byte-stable output | pgTAP | green |
| RUN-01 | Run versioning + supersede-not-append: a re-run cannot double a fact; zero-fact runs recorded; §6.8 reasons enumerated | pgTAP | green |
| CNF-01 | *(flip — pending since 1C)* §4.8's three conflict outcomes through `hc.approve_proposal`; supersession the only path to a current value; keep-both drafts a task | pgTAP | green (5A) |
| DUP-02 | Stage-2 duplicates: key-field match vs filed documents in the finalize transaction; the ADR-0018 same-email pair caught by name; additional-source outcome real; never auto-discarded | pgTAP + app | green |
| RND-01 | §6.3 rendering rules as code: source-typed resolution, never-downsample floor, page bounds before render, attempt-scoped staging GC'd | app | green |
| AIA-01 | The adapter contract: structured outputs, own citation geometry, refusal = honest terminal never "unsafe" copy, no fallbacks, no Files API, model allowlist with the Fable-5 refusal, operator channel + delimited data | app + review | green |
| WRK-02 | Extract/interpret workers live on the §4.3 sequence; the D13 backlog consumed; relay defer branch gone; exhaustion terminal with stated reasons | app + e2e | green |
| INJ-01 | §4.10/§6.7 in the live path: privilege absence re-proven at the worker layer; anomaly_flags set and surfaced; injected-instruction fixture lands as a flagged proposal, nothing else | pgTAP + app | green |
| EVA-01 | The G9 evaluation set: labelled corpus + per-field precision/recall keyed (model_id, prompt_version) via the Batch API; re-run required on any model/prompt change; all-high-risk until bands exist | review + harness | green (harness + corpus; the G9 GATE itself closes at owner sign-off of the bands, before any real document — never quietly) |
| PRF-07 | §13.2 arrival→proposals p95: measured over the eager path (fixture server), report-only locally, the hosted row named on ai-provider.md (D15's gap discharged to its honest local limit) | bench + review | green |
| UXA-02 | The stage-2 duplicate copy + resolution on the inbox; ProvenanceLine's first consumer recorded per Q6 | review | review |

---

## Owner decisions — SETTLED 2026-08-21 (the plan-gate rulings)

The owner ruled on the seven batched questions at the plan gate,
2026-08-21, in the planning session. Recorded verbatim; the build
executes on these:

- **Q1 — SETTLED:** **5A/5B split** — 5A (M1–M6 DB, incl. the
  inherited-obligations batch) → round-15 review → merge; then 5B
  (app B1–B9) → round-16. The 2A/2B and 4A/4B cadence.
- **Q2 — SETTLED:** Migration bound **≤ 6 as mapped** (M1
  `inherited_obligations` · M2 `record_context` · M3
  `extraction_runs` · M4 `conflict_outcomes` · M5 `duplicates_stage2`
  · M6 reserved for round-15 dispositions).
- **Q3 — SETTLED:** **Both dependencies approved as argued** —
  `@anthropic-ai/sdk` (the provider client, one fenced adapter
  family) and `mupdf` (the §6.3 rasterizer, spike-gated at B2), plus
  the one spike-contingent runtime reserve and the standing dev-dep
  reserve.
- **Q4 — SETTLED:** **D8's NOINHERIT taken now, in M1** —
  `hc_runtime`'s two memberships re-granted `WITH INHERIT FALSE`; the
  SET ROLE channel untouched; the bare-login probe flips to an honest
  privilege refusal; BAT-04 and the runtime-credential tests
  re-pinned. The round-13 owner-queue item (ADR-0019 Q-vi/S3)
  discharges here.
- **Q5 — SETTLED:** **Corpus-first, as argued** — B1 before any
  provider-shaped unit; one corpus, two consumers; the harness
  runnable from the first adapter commit; all-high-risk mode the
  shipping default until the bands exist; **the fixtures-only
  discipline ratified as the slice's standing constraint** (CI
  keyless; fixture server in the gate; the eval harness the sole
  real-key path, synthetic material only).
- **Q6 — SETTLED:** **OCR (§6.9) moves wholesale to slice 6; A11Y-08
  re-tags 5/6 → 6, recorded not dropped; ProvenanceLine per build
  truth** — first consumer at B6's stage-2 matched-document line if
  build truth fits, else its design-conformance citation moves to
  slice 6 explicitly.
- **Q7 — SETTLED:** **All three as stated** — branches
  `slice/5-extraction` / `slice/5b-app-extraction`; the exit seam
  accepted (proposals rest `pending` until slice 6's review screen;
  `Needs you` a true label; production G4/G7-gated; pgTAP proves
  approval incl. conflict outcomes before the surface exists); the
  coverage-row set as tabled (fourteen rows opening, CNF-01 flipping
  at 5A, A11Y-08 re-tagged to 6, SIG-01 explicitly NOT absorbed).

The questions as put to the owner (with the recommendations that were
accepted) are preserved below for the record.

## Owner decisions needed — the batched questions (the slice-4 Q1–Q7 pattern)

**Q1 — Increment split.** **Recommended: 5A (M1–M6 + tests) →
round-15 review → merge; then 5B (B1–B9) → round-16** — the 2A/2B and
4A/4B cadence, third time. The DB half carries the inherited
owner-queue batch and the conflict/duplicate machinery — privilege
and record-integrity changes that deserve isolated scrutiny — and
reviews cleanly alone (pgTAP drives every 5A row without a worker).
Alternative: single increment — rejected by the same precedent twice
affirmed.

**Q2 — The migration bound.** **Recommended: ≤ 6** — M1–M5 named
above with contents, M6 reserved for round-15 dispositions. Anything
past the bound is a recorded owner amendment before a line is
written.

**Q3 — The dependency bound.** **Recommended: TWO argued runtime
dependencies** — `@anthropic-ai/sdk` (the claude-api skill's
SDK-default rule for TypeScript; a wide drift-prone surface; the G3
one-adapter fence keeps the swap cheap) and `mupdf` (the §6.3
rasterizer, WASM, one package for pages + text layer + image
normalisation), the latter through B2's verification spike with ONE
spike-contingent reserve slot (consumed only with spike evidence,
else an owner amendment). Dev-dep reserve: one slot, the standing
precedent. Alternative: hand-rolled fetch adapter (zero-dep) —
rejected as re-implementing SDK functionality against a moving API;
alternative rasterizers recorded at Q3's row above.

**Q4 — D8's NOINHERIT, now or deferred again.** The owner queue
carried it as "a bound-amendment matter for a DB-opening slice"
(ADR-0019 Q-vi, S3); slice 5 IS DB-opening, so it is ripe.
**Recommended: take it now, in M1** — re-grant `hc_runtime`'s two
memberships `WITH INHERIT FALSE` (the SET ROLE channel needs
membership, not inheritance, so the request path is untouched), which
turns the bare-credential posture from "RLS answers zero rows" into
an honest privilege refusal and makes the runtime login's blast
radius the enumerated SET ROLE surface alone. Cost: a one-line role
change + the recorded probe re-pins. Alternative: defer again — free
today, but the queue item then waits for slice 6+ and the probe
stays the weaker shape another slice.

**Q5 — The G9 evaluation-set build order.** **Recommended:
corpus-first (B1 before any provider-shaped unit), one corpus for
both consumers, harness runnable from the first adapter commit,
all-high-risk mode as the shipping default until the bands exist, and
the fixture-only discipline above ratified as the slice's standing
constraint** (CI keyless; fixture server in gate; real key = eval
harness over synthetic material only; G3's written terms + G9's bands
as deploy rows before any real document ever). Alternative: build
workers first and assemble the eval set in parallel — rejected: it
invites an unlabelled second fixture world and leaves the G9 gate to
"later", which is the exact looser reading the TSD refuses.

**Q6 — OCR (§6.9) and A11Y-08; ProvenanceLine's first consumer.**
**Recommended: OCR moves wholesale to slice 6** — its consumer
(labelled machine-read text with page/citation navigation) is the
review screen's rendering surface, its mechanism (an OCR engine vs a
model transcript) deserves deciding with G9 evidence in hand, and
landing it here would add a dependency this slice doesn't otherwise
need. A11Y-08's coverage row re-tags 5/6 → 6, recorded not dropped;
prompt/schema versioning (M3) means adding a transcript field later
is a versioned change, not a worker rebuild. ProvenanceLine: B6
consumes it if the stage-2 matched-document line renders provenance
(the natural fit); if build truth says otherwise, its
design-conformance citation moves to slice 6 explicitly. Alternative:
produce transcripts in 5's extract call — rejected on cost
(§6.11: transcripts multiply output tokens at $25/MTok) and on
deciding the mechanism blind.

**Q7 — Branch names, the exit seam, and the coverage-row set.**
**Recommended: `slice/5-extraction` (5A) and `slice/5b-app-extraction`
(5B); the exit seam accepted as stated** (proposals rest `pending`
until slice 6's review screen; `Needs you` is a true label;
production stays G4/G7-gated so no family sees the seam; pgTAP proves
approval machinery including conflicts before the surface exists);
**the coverage-row set as tabled** — fourteen rows opening, CNF-01
flipping at 5A, A11Y-08 re-tagged to 6 (Q6), SIG-01 explicitly NOT
absorbed (the KMS key + ledger store are deploy-level; the row stays
pending with its slice untagged). Alternative on the seam: hold the
gate's exit closed until 6 — rejected for the same reason slice 4's
Q7 rejected it (re-editing the transition graph twice to hide an
honest state).

---

## Completion recipe (per increment) + gate cadence

**Per unit:** red commit with the failure signature in the message →
green → the unit's tests join the suite. **At each increment head:**
clean-leg reset exact-N (54 + M at 5A) · pgTAP all green · concurrency
all green (teed) · db:verify clean under `--fail-on warning` · upgrade
leg green · vitest all green (count recorded exactly) · local gate:
walkthrough 11/11 + a11y 5/5 + ingestion 8/8 UNCHANGED (+ the B9 leg
at 5B) under the protocol · lint/typecheck/production build clean ·
gitleaks clean · coverage rows flipped with refs, pendings annotated,
never early · the 5A deltas ADR (including any TSD annex the review
wants) / the 5B ADR, numbered as the cadence produces them — the
ADR-0019 renumbering note stands · review packet in the round-8 shape
(head ledger from the start, one-SHA evidence block, per-directory
tree binding per ADR-0015 F12, pointed questions with recommended
answers).

**The gate cadence, each leg its own fresh session (ADR-0006):** this
plan → owner rulings on Q1–Q7 (recorded verbatim here, status →
RULED) → 5A build red→green (M1 FIRST) → round-15 packet →
third-party review → dispositions ADR → owner sign-off → merge (never
squash) → 5B build → round-16 → dispositions → sign-off → merge.
Standing constraints throughout: main stays green · DDL only within
the owner-approved bound, shipped migrations never edited · **never
real family data — and under this slice's gates, never a real
document to a provider: fixtures only, CI keyless, the eval harness
the sole real-key path** · the dependency bound above · browser legs
local-gate only · `supabase:supabase-postgres-best-practices` before
any DDL · **`claude-api` before any provider-shaped code** · G12
still blocks the first non-founder invitee · the G4 deploy rows and
G7's hardening set stand untouched on their checklists.
