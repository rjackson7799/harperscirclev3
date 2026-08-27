# The staleness pass — all 39 owed rows, re-derived against `main`

**Written 2026-08-27**, on `chore/5b-queue-count-reconciliation`, against
`main` = `4f7a9d7`. This is **task 0** of
[`slice-5b-queue-triage.md`](./slice-5b-queue-triage.md), executed.

## The headline

**31 of the 39 owed rows are already FIXED at `main`.** The live queue is
**8 rows / 7 distinct items** (R2/F-6 = R7/F-5 collapse), not the 33 the
triage sequenced.

|  | Rows | Distinct items |
|---|---|---|
| **FIXED at `main`** (verdict not yet ruled) | **31** | — |
| **LIVE** | **8** | **7** |
| | 39 | |

Live severity: **5 MAJOR · 2 MINOR** across the 7 distinct items.

## What "FIXED at `main`" means here, exactly

It means **the defect the row describes is not present in the code at
`main`**, established by reading the code — in almost every case with an
explicit 6B attribution at the site *and* a test named for the finding.

It does **not** mean the row has been ruled. **No verdict moves in this
document.** ADR-0025 D6 governs: a session records, a round rules. Every
row below still carries `OWED` in ADR-0023 D17, and should until a round
says otherwise.

Two honest limits. This pass reads the tree; it does **not** re-run each
finding's original reproduction. And one row (R2/F-4) is **narrowed, not
binary** — recorded as live with its mitigation named.

---

## LIVE — the actual queue (8 rows, 7 items)

| Row | Sev | Why it is still live at `main` |
|---|---|---|
| **R2/F-2** | MAJOR | The leg named "a hanging provider is cut off by OUR timeout" passes `deadlineIso` of **+1.5 s**, and `providerTimeoutMs` subtracts `FINALIZE_RESERVE_MS` (20 s) → returns **0**, so the provider is never dispatched. `tests/ai/adapter.test.ts:291` + `lib/ai/config.ts:83,98`. The leg proves the no-dispatch branch, not the timeout. |
| **R2/F-3** | MAJOR | `inferenceConfiguration()` covers prompts, schema, caps and `render: {standard_long_edge, high_long_edge, ceilings}` — but **not** the JPEG quality or the codec branch. `canvas.encode('jpeg', 90)` is a hard-coded literal at `lib/pipeline/render.ts:451` and `:776`. The pixels the model sees are still not fully in the identity hash. |
| **R2/F-4** | MAJOR | **NARROWED.** `scripts/eval/run.ts:51` now imports the shared `delimitedDocumentText`, `EXTRACT_SYSTEM_PROMPT` and `EXTRACTION_SCHEMA` — so the delimiter, prompt and schema are no longer re-implemented. But `:83` still builds its own `Anthropic.ContentBlockParam[]`, so the harness remains a **second block-assembly site**. Risk reduced, finding not closed. |
| **R2/F-6** | MAJOR | `usage` is constructed at `lib/ai/client.ts:285-289` and read **nowhere** — no log, no column, no metric. The only reader is a shape assertion in a test (`toHaveProperty`). §6.6's "checked, not assumed" is still a garbage-collected struct field. |
| **R7/F-5** | MAJOR | Same as R2/F-6 — **collapses with it**. |
| **R2/F-12** | MINOR | `tests/ai/adapter.test.ts:116` still asserts `expect(raw).not.toContain('server-side-fallback')`. That string is a *header* value and the fixture records no headers, so the assertion cannot fail. All four "never on the wire" assertions still run against one request. |
| **R4/F-12** | MINOR | `lib/ai/interpret.ts:148` guards a `profile_fact` missing a **domain** (because `hc.draft_proposal` refuses it) — but `field` is taken as `str(p.field, 120)` at `:163` with **no guard**. A `profile_fact` with `field: null` is still drafted and still raises a raw `23502` at the moment a person clicks approve. |
| **R7/F-4** | MAJOR | The corpus email-label geometry — measured, argued and ruled at **ADR-0023 D26**. Stays `OWED/OWNER`; the fix is code plus a gate re-run. |

**Where they sit in the triage's clusters:** C3 (R2/F-3) · C2 (R2/F-4) ·
C9 (R2/F-6 = R7/F-5) · C11 (R2/F-2, R2/F-12) · C7 (R4/F-12) · and D26's
corpus item (R7/F-4). **Six of the eleven clusters are entirely spent:**
C1, C4, C5, C6, C8, C10.

---

## FIXED at `main` — 31 rows, with the site that establishes it

Verdicts unchanged. This is evidence for the round that rules them.

| Row | Landed | Evidence at `main` |
|---|---|---|
| R1/F-4 | 6B B4 | `lib/extraction/bands.ts:155` guards the `fields: null` shape; `tests/extraction/bands.test.ts:205` "fields: null fails CLOSED" |
| R1/F-6 | 6B B4 | `bands.ts:113` — a NON-DEFAULT all-high logs; `bands.test.ts:254`, `arrival.test.ts:225` |
| R1/F-7 | 6B B4 | `bands.test.ts:215` — "EVERY rejection condition has its test" |
| R2/F-5 | 6B B4 | `lib/ai/client.ts:185` status-aware arm; `HC-FIXTURE-429-ONCE` drives retry-after |
| R2/F-8 | 6B B1 | `maxRenderedBytes` re-derived from the provider request limit, **64 MiB → 21 MiB** (`lib/ai/config.ts:146`); the prompt version moved with it |
| R2/F-9 | 6B B4 | `client.ts:259` maps `model_context_window_exceeded`; `adapter.test.ts:530` |
| R2/F-14 | 6B B4 | fixture server sends **529** (`ai-fixture-server.mjs:297`); `adapter.test.ts:511` |
| R3/F-3 | 6B B3 | `lib/storage/artifacts.ts:367` — the render-staging sweep, **by prefix age**, so it reaches the orphan no lease-keyed GC could |
| R4/F-4 | 6B B3 | Same fix, "fixed ONCE" as the row itself asked |
| R3/F-4 | 6B B1 | Re-priced for `pdfjs-dist`: decode refused before it happens by `maxPageMegapixels`, canvas freed with the canvas, `task.destroy()` in `finally` (`render.ts:477`) |
| R3/F-5 | 6B B1 | `maxWallClockMs` is now **a DEADLINE, not a sample** — the render is raced and CANCELLED (`render.ts:108, 282, 463, 784`) |
| R3/F-6 | 6B B10 | `blind-discharge-multipage-01`; `corpus.test.ts:407` asserts `pageCount == 2` and that page-2 values render |
| R3/F-7 | 6B B10 | `lib/eval/score.ts` carries and scores `citation`; `CITATION_FLOOR` gates signing |
| R3/F-8 | 6B B2 | `lib/pipeline/page-keys.ts:43` — `ext` is REQUIRED on both builders; the `'png'` default is gone |
| R3/F-12 | 6B B10 | `scripts/eval/run.ts:75` and `corpus.test.ts:230` normalise with the **sniffed** mime |
| R4/F-6 | 6B B2 | `app/api/artifact/[id]/route.ts:47` — a manifest page storage lacks is REPORTED, not 404'd |
| R4/F-7 | 6B B3 | `lib/hc/workers.ts:251` — `READ_VT_SECONDS = LONGEST_STAGE_SECONDS + 60` = 360 > 300 |
| R4/F-10 | 6B B3 | `app/api/worker/[stage]/route.ts:654` — the §4.2 defect signal, `processGate`'s shape |
| R4/F-11 | 6B B3 | `route.ts:619` — `msg.facts` validated at runtime, fails CLOSED into the re-read path |
| R4/F-15 | 6B B3 | `route.ts:724` — the drop counter is READ and printed |
| R5/F-2 | 6B B6 | Per-read error injection in `inbox.test.ts:72`; an error renders an error state, never the empty state |
| R5/F-6 | 6B B9 | `tests/design/audit-manifest.test.ts` — every `app/**/page.tsx` route joins a manifest pinned to the filesystem |
| R5/F-7 | 6B B6/B8 | Every `?e=` and `?decided=` marker is read and rendered (`inbox.test.ts:712`, `senders.test.ts:63`, `arrival.test.ts:408`) |
| R5/F-8 | 6B B6 | `app/(app)/[circle]/inbox/page.tsx:305` — the Known-senders link renders in the EMPTY branch too |
| R5/F-13 | 6B B6 | The mock scaffolding's "last residue" removed and the degraded case actually driven (`inbox.test.ts:537`) |
| R6/F-4 | 6B B10 | `lib/eval/thresholds.ts` — manifest rows carry the `{high, medium}` pair `loadBands` requires, and only for fields that earned it |
| R6/F-10 | 6B B10 | `score.ts:123,151` — labels are a multiset, greedy per-label matching, support counts labels not items |
| R6/F-11 | 6B B4 | An uncalibrated field is `{kind:'uncalibrated'}`, never an unremarkable low (`bands.test.ts:199`) |
| R6/F-16 | 6B B10 | `scripts/eval/run.ts:199` — the output path is checked BEFORE any API call |
| R6/F-17 | 6B B10 | `g9-build.mjs:56` refuses code points > 0xFF at build time — and caught **two live truncations in the shipped corpus** |
| R8/F-10 | 6B | ADR-0026 D13 — the assertion is re-scoped to exactly one PUBLISHED run |

---

## What this changes

**The triage's §3 order is almost entirely spent.** It ran C8 → C5 →
C7's R4/F-12 → C1 → C11's R2/F-2 + R3/F-8. Of those, **C8, C5, C1 and
R3/F-8 are fixed**; only **R4/F-12** and **R2/F-2** survive. The order was
correct reasoning applied to stale inputs — which is the point of running
task 0 before scheduling, not after.

**The revised order**, by the same rule ("an owed finding whose failure a
PERSON now READS"):

1. **R4/F-12** — the only live row whose failure a person sees: a raw
   `23502` at the approve click. Guard `field` beside the existing
   `domain` guard in `lib/ai/interpret.ts`.
2. **R7/F-4** — the corpus label geometry (ADR-0023 D26). Blocks three
   banded fields from ever signing.
3. **R2/F-6 = R7/F-5** — read `usage`, so §6.6 is measured rather than
   asserted. One item, two rows.
4. **R2/F-3** — put the JPEG quality and codec into the configuration
   hash. A `PROMPT_VERSION` bump, deliberately taken.
5. **R2/F-2** — give the timeout leg a deadline that actually dispatches.
6. **R2/F-12** — assert the header absence against headers, and give the
   four assertions more than one request.
7. **R2/F-4** — call one block builder from both sites, or record why two
   is correct.

**Ceremony.** Seven items, five MAJOR, no DDL, and one of them (R7/F-4)
already carries its own ruling. The owner's `chore/` + normal-PR ceremony
comfortably fits this; a full slice treatment does not appear warranted at
this size.

## What this document does not do

**No verdict moves.** All 39 rows still read as D17 records them. No
coverage row flips, no pending row moves, no DDL. G4 and G7 block · G9
OPEN · `BAND_ARTIFACT_ALLOWLIST` EMPTY · SIG-01 NOT absorbed · **NOTHING
IS PRODUCTION-ACTIVATED.**
