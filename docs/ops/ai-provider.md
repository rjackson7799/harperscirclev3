# AI provider activation — the G3/G9 deploy checklist

**Status: NOTHING ON THIS CHECKLIST IS DONE.** Slice 5 builds and proves the
AI layer entirely on fixtures. No Anthropic credential exists in CI; the only
real-key path in the project is the G9 eval harness, over synthetic material.
This file is what must be true — in writing, with evidence linked — **before
extract or interpret is activated against a real family document**.

**Authority:** TSD §6.1, §6.2, §6.3, §6.8, §6.10, §6.11, §1.9, §13.2 → PRD
§11.2 (G3, G9), §4.2.2, §13.2 → `docs/review/slice-5-plan.md` (Q5, and the
post-gate integration's findings 1 and 9) → ADR-0019 D15 (the p95 gap) →
`docs/ops/ingestion-deploy.md` (the G4/G7 rows this sits beside).

A row is DONE when its evidence is linked here — a document, a ticket, a
console screenshot, a recorded run — not when someone remembers being told.

---

## 1 · G3 — the four terms, in writing

G3 is **exactly four terms** (§6.2). A provider that will not answer the last
three is disqualified regardless of its training clause.

| # | Term | What to obtain | Evidence |
|---|---|---|---|
| G3-1 | No training on submitted data | Confirmed in the commercial terms, not relied on as a default | ☐ |
| G3-2 | Zero retention of requests and uploaded files | **ZDR requested and CONFIRMED on the specific workspace whose key the deploy uses.** ZDR is configured per WORKSPACE, not per organisation — a ZDR org can opt one workspace into 30-day retention | ☐ |
| G3-3 | What abuse monitoring retains, and for how long | Stated explicitly. A default-retention exception for trust-and-safety review is normal and must be written down: it is the one path by which a family's discharge summary could persist outside our control | ☐ |
| G3-4 | What provider-side logs hold | Stated explicitly. Metadata-only is the expected answer; get it written | ☐ |

**G3-2a — feature-level ZDR.** ZDR eligibility varies by feature, and
**structured outputs in particular carry a qualified technical retention**
(§6.2). Confirm it for the surfaces we actually use — Messages with
`output_config.format`, vision blocks, prompt caching, and the Batch API — not
as a blanket property of the account. ☐

**G3-2b — the model is inside the cleared terms.** `claude-fable-5` requires
30-day retention and is unavailable in a ZDR workspace; a request from one
returns `400 invalid_request_error` on every call (§6.1). It is refused
structurally in `lib/extraction/../ai/config.ts` and pinned in
`tests/ai/adapter.test.ts`. Confirm the shipped model is `claude-opus-5` — the ONLY allowlisted
model, because the adapter sends §6.7's `{role:'system'}` operator
channel unconditionally and Claude Sonnet 5 does not support it —
and that whatever ships is the one the terms name. ☐

---

## 2 · Beside G3, not part of it — §4.2.2 cancellation

**This row is required and evidence-linked, and it is NOT a fifth G3 term.**
PRD §11.2's G3 row says "confirmed"; TSD §6.2 records the deliberate
reconciliation — the four terms ARE the gate, and cancellation is held beside
it as the §4.2.2 operational requirement. Both are honoured by listing it
here, separately.

| Row | What to obtain | Evidence |
|---|---|---|
| CANCEL-1 | What happens to a request **already dispatched** when we abandon it — including disconnect and client-timeout behaviour, and any retention that results | ☐ |

§4.5 already guarantees no write on our side: a cancelled arrival discards at
the CAS and the worker's client timeout is budgeted inside the lease. This
row bounds what the PROVIDER does with the computation, which is the half we
cannot see.

---

## 3 · No Files API

Artifacts go **inline as base64** in the request, so the only retention
question is the one G3 already asks. Files persist until deleted and would add
a second retention surface to reason about (§6.2).

| Row | Check | Evidence |
|---|---|---|
| FILES-1 | The shipped adapter sends no file reference. Pinned at `tests/ai/adapter.test.ts` ("no Files API"), asserted against the request body the provider actually receives | ☐ confirm the pin is green at the deployed SHA |

---

## 4 · The pre-activation LIVE smoke test

Neither the CI fixture server nor the Batch-API eval harness proves this path.
The fixture server speaks the shape; the Batch API is asynchronous and
differently plumbed. **Before activation, run the EXACT worker adapter's
synchronous Messages request against the cleared workspace, on synthetic
material only**, and assert every one of:

| # | Assertion | Evidence |
|---|---|---|
| SMOKE-1 | The returned `model` is the allowlisted one that was requested | ☐ |
| SMOKE-2 | `stop_reason` is handled first, and a refusal maps to the honest terminal path | ☐ |
| SMOKE-3 | The structured output parses against `EXTRACTION_SCHEMA` | ☐ |
| SMOKE-4 | The ZDR-eligible feature COMBINATION works together: structured outputs + vision + a `cache_control` breakpoint in one request | ☐ |
| SMOKE-5 | No fallback and no file parameters are present on the wire | ☐ |
| SMOKE-6 | `usage.cache_creation_input_tokens` / `cache_read_input_tokens` are populated — §6.6's 512-token minimum CHECKED against the real tokenizer, not assumed | ☐ · **BLOCKED BY R2/F-6 (recorded 2026-08-28).** At `main`, `usage` is built in `lib/ai/client.ts:285-289` and read NOWHERE — no log, no column, no metric — so this row cannot be evidenced by anything but eyeballing a response. R2/F-6 = R7/F-5 is an OWED item in ADR-0023 D17 and is this row's prerequisite, not a coincidence. **MARKER (2026-08-28, round-23 follow-up): the block is LIFTED.** `usage` is READ at both worker consumption sites since `80e9a75` (PR #19, merged `3c39e23`): `app/api/worker/[stage]/route.ts` logs `worker/<stage>: provider usage for arrival … input_tokens= output_tokens= cache_creation_input_tokens= cache_read_input_tokens= prefix_cache=` on every ok result — R2/F-6 = R7/F-5 ruled **FIXED** at ADR-0031 (round 23). **The box stays ☐:** ticking it is the owner's act at activation, reading a real response in the platform log (Playwright's default `stdout: 'ignore'` keeps this info-level line out of the gate log, so its absence there is not evidence). The prose before this marker is preserved exactly as written. |

Use a development-partition fixture. **Never a real document**, at this step or
any other before G9 closes.

---

## 5 · G9 — the bands

| # | Row | Evidence |
|---|---|---|
| G9-1 | A completed eval run exists on the **BLIND** partition: `node scripts/ts-run.mjs scripts/eval/run.ts --submit` then `--collect <batch>` | ☐ · **SEQUENCING (recorded 2026-08-28): R2/F-3 MUST LAND BEFORE THIS RUN.** It puts the JPEG quality and codec choice into `inferenceConfiguration()` — §6.3 render rules are a covered input — which moves `configurationHash()` and therefore `PROMPT_VERSION`. G9-4 below refuses a run whose pair does not match what ships, so a batch submitted before R2/F-3 lands is money spent on an unshippable manifest. **MARKER (2026-08-28, round-23 follow-up): the sequencing condition is MET.** R2/F-3 landed in full — the codec and quality at `a69bb0e` (PR #19, merged `3c39e23`) and the user-turn instructions + delimiters at `2b0b76a` (PR #20, merged `2a652bd`) — and was ruled **FIXED** at ADR-0031 (round 23). **The shipped pair is `hc-6b-3+ff1435280a36f8eb`**; a batch submitted now is against what ships, and G9-4 is what holds it there. The box stays ☐. The prose before this marker is preserved exactly as written. |
| G9-2 | The owner has read the per-field precision/recall against `docs/eval/g9-corpus-spec.md` §6 and **signed the bands**, recorded in an ADR | ☐ |
| G9-3 | The run manifest's digest is in `BAND_ARTIFACT_ALLOWLIST` (`lib/extraction/bands.ts`) **in the same commit as the sign-off ADR** | ☐ |
| G9-4 | The shipped `(model_id, prompt_version)` pair MATCHES that run. A change to the model, the prompts, the schema, the parameters or the §6.3 render rules is a different configuration hash and **is not shippable without a re-run** (§6.10) | ☐ |
| G9-5 | **`HC_BANDS_ARTIFACT`** (6B B4; ADR-0023 R1/F-6) — the ABSOLUTE path the signed artifact is deployed at, set on the worker. Unset = the artifact never loads whatever the allowlist says, and until this row existed that state had **no ops row and no log line** — an owner could complete every G9 step and still run all-high forever, silently. `loadBands` now WARNS on every non-default all-high (a digest allowlisted or a path configured, and the artifact still refused, with the reason named); the review screen renders the mode (6B B7), so a silent all-high is visible to a person and not only to a log | After deploy, the worker logs carry NO `bands: ALL-HIGH fallback` line, and the review screen does not show the global all-high notice |

Until G9-2 is signed, the pipeline runs **all-high-risk**, which §6.5 calls the
shipping default rather than a degraded state. That is structural, not
configured: `loadBands` fails closed on a missing, stale, altered, partial,
malformed or non-blind artifact, with a test for each shape — and since 6B B4
a non-default all-high says so in the worker log (R1/F-6).

---

## 6 · Platform — the §1.9 duration check

§1.9's recorded platform default is **300 s**, which is exactly §4.3's extract
wall clock — zero headroom for claim, render and finalize around the provider
call. The worker route declares `maxDuration = 360` and budgets its own batch
loop inside that.

| # | Row | Evidence |
|---|---|---|
| DUR-1 | The hosted plan actually permits the declared `maxDuration`. No code half can pin a platform limit; verify it on the deployed function | ☐ |
| DUR-2 | The per-minute relay cron is live and firing the new stages | ☐ |

Correctness never depends on either number: a hard kill is an expired lease,
the attempt is already burned durably (claim-before-work), and the sweeper
re-queues or terminalizes on budget. The ceiling risks a wasted attempt, never
a wrong state.

---

## 7 · PRF-07 — the hosted, provider-inclusive p95

The local harness (`scripts/bench/prf07.ts`) is **report-only** and measures
OUR MACHINERY'S share against a fixture server, with no provider in the path.
The recorded local run at 5B (method in the script header: cohorts per
document class, PRF-06 nearest-rank, cold and warm reported separately):

| Cohort | cold p95 | warm p95, depth 1 | warm p95, depth 4 |
|---|---|---|---|
| born-digital PDF | 5430 ms | 3645 ms | 3061 ms |
| scanned PDF | 2162 ms | 3708 ms | 5406 ms |
| phone photo | 2487 ms | 5140 ms | 6866 ms |
| email body | 1436 ms | 1417 ms | 1511 ms |

n = 1 cold, 12 warm per cohort. The worst figure is ~11% of §13.2's 60 s
budget — which says our machinery leaves the provider ~53 s, not that the
budget is met.

| # | Row | Evidence |
|---|---|---|
| PRF-07-H | Re-measure **hosted and provider-inclusive**, against the full 60 s §13.2 budget, on real infrastructure | ☐ |

**This row carries PRF-06's breach-clause discipline: a breach goes to the
owner, never quietly absorbed.** If the hosted p95 exceeds the budget, that is
a finding for a decision — not a number to re-run until it passes.

---

## 8 · §6.11 — cost

Order-of-magnitude, from §6.11, so a bill can be checked rather than trusted.

| Row | Figure | Evidence |
|---|---|---|
| COST-1 | Extraction ~$0.04–0.12 per arrival; interpretation ~$0.02–0.05 (record context largely cache-read at ~0.1×) | ☐ confirm against the first month |
| COST-2 | A full eval run over the BLIND partition, through the Batch API at 50% — record the ACTUAL cost of the first run so the re-run price is known before §6.10 forces one | ☐ |
| COST-3 | §5.9's monthly processing ceiling notification is **slice 11** and is NOT covered by this checklist. The ceiling is a real control; until it ships, cost is watched by a person | ☐ acknowledged |

---

## 9 · What this checklist does NOT cover

- **G1/G15's fuller vendor review** — security and confidentiality controls,
  personnel access, subprocessors and residency, incident notification,
  deletion from replicas and backups, legal-process disclosure, audit
  evidence. §6.2 is explicit that four terms are the gate, not the diligence.
- **G4/G7** — the deploy and hardening rows on `ingestion-deploy.md`. Nothing
  is production-activated until those stand too.
- **G12** — still blocks the first non-founder invitee.
