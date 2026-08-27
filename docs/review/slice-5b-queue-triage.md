# The slice-5B owed queue — triage and scope

**Written 2026-08-27**, on `chore/5b-queue-count-reconciliation`, against
`main` = `4f7a9d7`. Follows ADR-0023 **D25** (the counting rule) and
**D26** (D18 item 5, ruled).

**Ceremony, ruled by the owner on 2026-08-27:** a `chore/` branch and a
normal PR, **no review round** — the `chore/process-retune` precedent.
This triage lands committed on the current branch, not held for a plan
document.

**Provenance.** The queue and its clustering are REUSED from the work that
produced D25, not re-derived. What *was* re-derived, because it is cheap
and because D25 exists precisely to teach the lesson: the 39 rows were
re-parsed out of the blob at `HEAD` — **39 OWED-class rows, 19 MAJOR · 16
MINOR · 4 OBS**, matching D25 exactly.

---

## 0. Read this before sequencing anything: the row TEXTS are 5B-era

D25 re-derived the queue's **count**. It did not re-derive the queue's
**contents**, and the contents have moved.

**32 of the 39 rows are cited by name somewhere in `lib/`, `scripts/`,
`tests/`, `app/` or ADR-0026.** The seven that are not: R2/F-2, R2/F-3,
R2/F-4, R2/F-6, R2/F-12, R4/F-12, R7/F-5. (Thirty-two, *not* the 33 of
§1 — that is the count of distinct actionable items, a different number
that happens to sit one away. They are not related, and conflating them
is precisely the move D25 exists to prevent.)

A citation is not a fix — it may be a
comment naming a known gap, a test pinning current behaviour, or the code
that caused the finding. This triage does **not** classify all 33. It
establishes something narrower and sufficient: **the row texts cannot be
read as the current state.** Three are provably stale, checked in the
tree:

| Row | D17's text | At `main` |
|---|---|---|
| **R3/F-7** | "The harness discards the citation before scoring — `Prediction` is `{field, value}` only — so nothing anywhere measures whether a bbox lands" | **False.** `lib/eval/score.ts` carries `citation`, `citationLands` scores it, `CITATION_FLOOR` = 0.90 gates signing (6B B10) |
| **R4/F-7** | "The read visibility timeout (120 s) is shorter than the extract stage (up to 300 s), so mid-flight redelivery is the *normal* case" | **False.** `lib/hc/workers.ts:251` — `READ_VT_SECONDS = LONGEST_STAGE_SECONDS + 60` = 360, attributed in-code to "6B B3 (R4/F-7)" |
| **R6/F-16** | "Re-collecting a batch throws `EEXIST` *after* the API round-trip" | **False.** `scripts/eval/run.ts:199` — "the output path is checked BEFORE any API call", attributed to "R6/F-16 (rode Q10)" |

Add D26's four: parts 1–3 of D18 item 5 were built by 6B B1/B2/B10 while
the item sat unruled.

**This is the same failure mode a third time.** D25 found a headline
integer inherited rather than derived. D26 found an owner item built past
rather than answered. This is the row texts inherited rather than
re-checked. In all three the verdicts are *procedurally* correct — ADR-0025
D6 is explicit that a session records and a round rules — but a work list
sequenced off these texts would dispatch a code session to fix things that
are already fixed.

**TASK 0, before any cluster is scheduled: a staleness pass over all 39
rows**, re-derived against `main` out of the blob, in D25's method. Its
output is a round's input, not a session's ruling.

**No verdict moves in this document.** Not one.

---

## 1. The queue as counted (D25, unchanged)

**39 rows carry owed work** = 38 strict `OWED` + 1 `OWED/OWNER` (R7/F-4).
**19 MAJOR · 16 MINOR · 4 OBS.**

    39 rows
      − 4 blocked
      = 35 actionable
      − 2 collapsed   (R3/F-3 = R4/F-4, "fix once" · R2/F-6 = R7/F-5, unread `usage`)
      = 33 distinct items

**On the 4 blocked rows — their blocks have LIFTED, and a round must say
so.** R7/F-4's owner half is answered by D26. The three blocked on G9
(R3/F-6, R3/F-7, R6/F-4) were unblocked by the 6B B10 purchase: §7 row 1
was bought, the multi-page blind item exists, citation scoring exists, and
§6.A's threshold rule is written. Their verdicts stay `OWED` until a round
rules them. Treat all four as **actionable-pending-ruling**, not blocked.

**R2/F-3 + R2/F-4 + R6/F-4 is NOT a duplicate set.** By the table's own
cross-references: R2/F-4 composes with R3/F-12 and R6/F-6 (FIXED), R2/F-3
references only D5, and R6/F-4 references D11. They are three items.

---

## 2. The eleven clusters

Rows, not items: C5 and C9 each contain one collapsed pair. 35 rows here,
plus the 4 actionable-pending-ruling above, = 39.

| # | Cluster | Rows | Sev | What it is |
|---|---|---|---|---|
| **C1** | Provider error taxonomy | R2/F-5, F-8, F-9, F-14 | 3 MAJ · 1 MIN | `maxRetries: 0` discards the SDK's 408/409/429/5xx handling and `retry-after`; the 64 MB render ceiling exceeds the API's 32 MB request limit (base64 inflates 4/3); `model_context_window_exceeded` falls through to `provider_error`; `overloaded_error` is 529, not the fixture's 503 |
| **C2** | Eval harness vs worker | R2/F-4, R3/F-12 | 1 MAJ · 1 MIN | `scripts/eval/run.ts` re-implements block assembly rather than calling the shared builder, so bands are signed from a third construction site; the harness normalises with the *declared* mime while the worker sniffs |
| **C3** | Config hash | R2/F-3 | 1 MAJ | The hash omits the trailing user instruction, the delimiter builders and `asJPEG(90)` + codec choice — the pixels the model actually sees are not in the identity |
| **C4** | Render bounds | R3/F-4, F-5 | 2 MAJ | `maxRenderedBytes` counts encoded output while the heap churns ~20 MB per pixmap with nothing destroyed; `wall_clock` is sampled between pages and `toPixmap` exposes no interrupt |
| **C5** | Staging leak + promotion | R3/F-3 **=** R4/F-4, R4/F-6 | 3 MAJ | Attempt staging leaks on every non-graceful exit — no `try/finally`, no sweeper for `render/attempt/**`; `promoteRenderedPages` runs after `finalizeExtraction` returned `advanced`, non-atomically and with no repair path |
| **C6** | Queue redelivery | R4/F-7, R8/F-10 | 1 MAJ · 1 OBS | R4/F-7 **is fixed at `main`** (§0); the live idempotence assertion is a global claim over a shared queue and should be scoped to the circle under test |
| **C7** | Fail-closed validation | R1/F-4, R4/F-11, R4/F-12 | 3 MIN | `typeof null === 'object'`, so `fields: null` passes the shape guard and throws at the field loop; `msg.facts` is trusted with no runtime validation; a `profile_fact` with `field: null` raises a raw `23502` **at the moment a person clicks approve** |
| **C8** | Member surfaces | R5/F-2, F-6, F-7, F-8, F-13 | 1 MAJ · 3 MIN · 1 OBS | Three `{ data }` destructures still drop `error`, so a refused query is indistinguishable from an empty one; `/[circle]/senders` has no browser coverage at all; every `?e=` marker is written and never read; the only link to `/senders` sits inside the non-empty branch; dead `documents` mock scaffolding remains |
| **C9** | Worker observability | R2/F-6 **=** R7/F-5, R4/F-10, F-15, R1/F-6 | 1 MAJ · 2 MIN · 1 OBS | `usage` is carried and never read, so §6.6's "checked, not assumed" is a garbage-collected struct field; a stage-2 duplicate yields a silent `invalid_state`; `answer.dropped` is discarded; `HC_BANDS_ARTIFACT` appears in one file and no ops row, so an owner can complete every G9 step and still run all-high forever |
| **C10** | Scorer semantics | R6/F-10, F-11, F-16, F-17 | 3 MIN · 1 OBS | Label/prediction collapse rules disagree and `support` counts once per item; `absent_fields` is never read and non-banded fields get `precision: 0` rows no band covers; **F-16 is fixed at `main`** (§0); the PDF writer truncates non-Latin-1 silently |
| **C11** | Gate-leg honesty | R2/F-2, F-12, R1/F-7, R3/F-8 | 1 MAJ · 3 MIN | The timeout test's 1.5 s deadline sits under `FINALIZE_RESERVE_MS` (20 s), so the request is never dispatched and the leg proves nothing; one of four absence assertions is vacuous; `artifact_partial`'s five rejection conditions have one test; `promotedPageKey`'s default ext is `png` while every photo/scan/pill promotes `.jpg` — and the contract test calls exactly that default |

---

## 3. The order

The slice-6 plan's own rule governs: **"an owed finding whose failure a
PERSON now READS"** comes first.

1. **C8 — member surfaces.** The only cluster whose failures a member or
   an owner sees on a screen today. R5/F-2 leads it: a refused query
   rendering as "nothing here" is the failure that hides every other one.
2. **C5 — staging leak + promotion.** Unbounded storage growth on every
   non-graceful exit, and a partial promotion that is permanent. Costs
   accrue while it waits.
3. **C7's R4/F-12 alone**, pulled forward out of its cluster: it is the
   one MINOR whose failure surfaces as a raw Postgres error **in front of
   a person, at the approve click**. Its two siblings stay in place.
4. **C1 — provider error taxonomy.** Four rows, one shape, and the retry
   posture is the difference between a transient blip and a lost arrival.
5. **C11's R2/F-2 + R3/F-8.** A leg that proves nothing and a default
   that disagrees with every caller — both cheap, both currently
   *reporting* success.

Then, in any order the session finds efficient: C11's remainder, C9, C10,
C2, C3, C4, C6.

**C4 is flagged for the staleness pass first.** Both rows describe `mupdf`
heap and interrupt behaviour, and `render.ts` migrated to `pdfjs-dist` +
`@napi-rs/canvas` at 6B B1. They may be spent, transformed, or untouched —
nobody has looked.

---

## 4. What the work needs

- **A 38-leg browser gate re-run** for anything touching C8, C5, C7 or the
  app routes. Reserve it once, at the end, not per cluster.
- **NO DDL anywhere in this queue.** Migrations stay **69 exact**, budget
  **7 of ≤ 7 SPENT**. Any item that appears to need DDL stops and goes to
  the owner.
- **D26's owed fix** (the email label geometry) rides with C10, and is
  **byte-governed**: `.gitattributes` sets `fixtures/g9/** -text`,
  `corpus.json` records a sha256 per item, and `lib/eval/corpus.ts`
  re-hashes on every read. Regenerate through
  `node scripts/fixtures/g9-build.mjs` and verify with `--check` — never
  hand-edit a label.
- **Five 6B code items are still OWED** in ADR-0028 D15 and are *not* part
  of these 33: `lib/auth/session.ts:32-33`, `lib/http/budget.ts`,
  `tests/lint/timestamp-boundary.test.ts` (3 of ≥ 8 spellings),
  `app/(auth)/confirm/route.ts:45`, and the unbounded `api/upload/*`
  routes. Each needs a gate re-run or an explicit owner ruling.

---

## 5. What this document does not do

No verdict moves. No coverage row flips (ADR-0025 S16.7). No pending row
moves. No DDL. G4 and G7 block · **G9 OPEN** · `BAND_ARTIFACT_ALLOWLIST`
**EMPTY** · RCP-02 pending tagged 7 · SIG-01 **NOT** absorbed · no real
family data · **NOTHING IS PRODUCTION-ACTIVATED.**

`chore/process-retune` is **UNMERGED and NOT BINDING**; it comes into
force from slice 7 by its own `slice.md`, and this queue is deliberately
not coupled to it.
