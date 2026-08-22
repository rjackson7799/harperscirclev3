# Third-party review packet — round 15: slice 5A, the extraction + interpretation database increment

**Prepared:** 2026-08-21, at the close of the 5A build session.
**Branch:** `slice/5-extraction` (PR at review start), base `main` @
`7832d53` (`7832d5326e1dbc7460dc8bb772957a4e6a77ad82`, the 5A
build-kickoff commit; CI run 90 `32527620978`, completed/success — the
regress terminates there per the standing rule).
**Authority:** `docs/review/slice-5-plan.md` (PLANNED–RULED; **Q1–Q9
SETTLED verbatim** — Q1–Q7 at the plan gate, Q8/Q9 at the post-gate
review integration; the M-rows as amended by the integration are
BINDING) → TSD §6, §4.3–§4.10, §3.10, §2.4–§2.6 as amended by annexes
A5/A6/A9/A10 → ADR-0017/0018/0019 (the inherited items) → ADR-0006 →
`docs/coverage.md`.
**The dispositions ADR for this build:** ADR-0020 (Proposed — this
round ratifies or amends it).

## Addendum-first: the head ledger (the round-8 rule, from the start)

| Purpose | SHA | Tree relationship | Status |
|---|---|---|---|
| Base (main, the 5A kickoff) | `7832d53` | — | CI green (run 90) |
| M1 red / green | `6e37a6f` / `2d9b835` | +tests/051 · +M1 migration, 002/043 re-pins, runtime-credential re-pin, runbook rows | unit green |
| M2 red / green | `d671b3b` / `f748405` | +tests/052 · +M2, 002 re-pins | unit green |
| M3 red / green | `e317fad` / `b8dd824` | +tests/053 · +M3, 002/022/023/026 re-pins | unit green |
| M4 red / green | `97e27c3` / `1126f28` | +tests/054 · +M4, 001 event-type re-pin | unit green |
| M5 red / green | `d48f0cb` / `8301d34` | +tests/055 · +M5 **+ the Q8 enum value at M4's tail** (ADR-0020 D4), 001/002/027/046 re-pins | unit green |
| **Evidence head** | **`2eab0f3`** | concurrency cases 39–43 + the suite's five extract-claim re-pins — the LAST commit that moves `app/ lib/ tests/ supabase/ e2e/ scripts/` | **complete evidence block below recorded at exactly this SHA** |
| Review head | the docs-only commits after `2eab0f3` (coverage flips `dd8420a`, ADR-0020, this packet, the round-15 kickoff, the vault pointers) | `docs/` only — the per-directory binding below transfers the evidence | this packet's final SHA is the PR head |

**Per-directory tree binding (ADR-0015 F12), at `2eab0f3`:**

```
app      70b061b1db5d4263ce33333e2361475abb392a48   UNCHANGED vs main 7832d53
lib      b247a49fe40e861aa0477876fdb208f5b0fb1add   UNCHANGED vs main 7832d53
e2e      938662fca374fdc2733f7b0f71fce853f9405b69   UNCHANGED vs main 7832d53
tests    b546a452a63c4a496de543c995789637ff59445b   MOVED (tests/db/runtime-credential.test.ts — the Q4 NOINHERIT probe re-pins, nothing else)
supabase 4c4aefee03b41caf00aa79635367ce324106adf9   MOVED (5 migrations, 5 new pgTAP files 051–055, 8 re-pinned files 001/002/022/023/026/027/043/046)
scripts  9e6918131a1affd01c430f06b0275409d062f6d0   MOVED (concurrency cases 39–43 + the five extract-claim call sites carrying the M3 run identity)
```

The unchanged app/lib/e2e hashes are the F12 transfer argument for the
route/component surfaces; `tests/` moved (one file), so vitest was
re-run in full — and `supabase/` moved, so the FULL local gate was
re-run at the head (below). Any commit after `2eab0f3` that moves a
non-docs tree voids this packet's evidence and forces a re-run.

## What round 15 reviews

5A is the DATABASE HALF of slice 5 (the Q1 ruling: 5A M1–M6 →
this round → merge; 5B app B1–B9 → round 16). Its first unit was the
inherited-obligations batch (the R8 precedent — the ADR-0019
owner-queue DB items land before slice-5-proper work), and its scope is
the §3.10 pipeline read, the §4.3/§6.4 run-versioning contract, CNF-01's
lifted conflict refusal on Q9's exact rows, and stage-2 duplicates on
Q8's distinct state. **No provider-shaped code, no lib/ai, no app-layer
units exist in this increment, by design** (Q5's fixtures-only
discipline; the claude-api gate is 5B's). Nothing is
production-activated; the D13 deferred seam stays deferred until 5B B7.

## The migrations (5 of ≤ 6; M6 reserved for this round's dispositions)

| # | File | What landed | pgTAP |
|---|---|---|---|
| M1 | `20260821120001_inherited_obligations` | `hc.log_artifact_read` (Q-iii: authenticated definer, in-function authorization on the route's exact visible_at predicate, DEF-10, the §1.3 step-6 entry through hc.log) · `hc.list_known_senders` (D15: live rows + acceptor name, SND-02 coordinator authority, deterministic order) · Q4's NOINHERIT (both hc_runtime memberships WITH INHERIT FALSE; SET kept; bare login honestly 42501) | 051: 29 |
| M2 | `20260821120002_record_context` | `hc.record_context_for` to §3.10's letter: hc_pipeline-only, circle+subject derived from the arrival (cross-subject not expressible), DEF-10; the §6.6 shape with the SETTLED inclusion priority (high-risk never truncated; per-section caps stated in the migration; {truncated, omitted} everywhere); byte-stable (deterministic ordering, UTC ISO rendering, the naive temporal key; subject-record sections identical across a subject's arrivals) | 052: 24 |
| M3 | `20260821120003_extraction_runs` | The §4.3 identity table (arrival, model, prompt, attempt / one-run-per-lease / §2.1 composites); the run BORN in claim_stage's transaction (signature gains the pair — required at the mint point, refused elsewhere); CLOSED with the lease by trigger (every closer, present and future); supersede-not-append + run_id provenance + stamp coherence at write_extractions; 'provider_refusal' joins §6.8's reasons; prompt_version semantics pinned | 053: 27 (the kill matrix at 14–19) |
| M4 | `20260821120004_conflict_outcomes` | The conflict arm on Q9's exact rows: use_new (approved + supersession + commit on the NEW fact) · keep (rejected + decider, NOTHING written, no commit) · keep_both (the drafted TASK commits as the one object, unassigned, no second approval); the outcome-bearing idempotency identity (approval_attempts.conflict_outcome, ING-11); high-risk confirm gates use_new alone; 'conflict_resolved' log events; **+ the Q8 enum value at the file's tail** (the 55P04 rule — ADR-0020 D4) | 054: 23 |
| M5 | `20260821120005_duplicates_stage2` | Q8's distinct state (label unchanged, own rank, the three graph edges exactly — a wrong resume GRAPH-illegal); the settled matching contract as `hc.detect_stage2_duplicate` (type+date+≥1 corroborating pair ALL PRESENT, absence never wildcards, lower/btrim normalisation, most-recently-filed canonical target on `arrivals.duplicate_of_document_id`); detection inside finalize_extraction with the work answer landing IN FULL (facts, proposals, a PUBLISHED run); resolve_duplicate's stage-2 arm ('different' → interpreting via real lease + CAS + outbox; 'same_thing' → the DIRECT additional-source edge + nothing_filed) | 055: 23 (the ADR-0018 same-email pair by name) |

## Red→green history

Eleven build commits — one red→green pair per unit plus the concurrency
commit — the ledger above. Red legs are engineered to report every
assertion (the tq evaluator over absent tables, jid null-extractors,
guarded DO fixtures), so each red commit's message carries the complete
failure-signature list; the vacuous-pass tests on each red leg are
named in the messages too.

## The one-SHA evidence block — everything below recorded at `2eab0f3`

- **Clean leg:** `supabase db reset` → `verify-migration-state` exact
  **59 applied == supabase/migrations** (54 + 5).
- **pgTAP:** **1489/1489 across 56 files** — the 5A files 051–055
  (29+24+27+23+23 = 126 new assertions) plus every prior file green
  after the re-pins.
- **Concurrency:** **69/69 assertions across 43 cases**, teed
  (`concurrency-clean.log`, vault) — the five 5A cases 39–43 (conflict
  version race · same-key-different-outcome · stage-2 resolve vs
  freeze · re-run supersession vs cancellation · record_context vs
  concurrent writes) plus the 63-assertion baseline re-confirmed.
- **db:verify:** clean under `--fail-on warning` (the one authoring
  warning — a bare enum literal in finalize_extraction — was caught by
  this gate in-session and fixed before commit).
- **Upgrade leg (rehearsed locally, CI repeats it):** worktree at the
  merge-base `7832d53` → reset → verify exact 54 → `supabase migration
  up` applies exactly the five increments → verify exact 59 → pgTAP
  1489/56 AND concurrency 69/69 green against the UPGRADED database
  (`pgtap-upgrade.log` / `concurrency-upgrade.log`, vault).
- **vitest:** **448/448 across 53 files** (`test:app`). **The standing
  net's "431" is corrected here** — 431 echoes ADR-0019's mid-build
  line; round-13's packet records 442 at `d6a6a22` and the round-13→14
  dispositions brought main to 448, verified against a clean `7832d53`
  worktree (ADR-0020 D7). 448 is the number the net carries forward.
- **Local gate (F12 — supabase/ and tests/ moved ⇒ the full gate
  re-ran):** **24 passed** — walkthrough 11/11 + a11y 5/5 + ingestion
  8/8, UNCHANGED — 2026-08-21, local runner (Windows 11 / Docker
  Desktop, the lean-stack protocol), `npx playwright test --trace on`
  against the 59-migration clean leg with the clamd container live.
  Artifacts:
  `HonuVault/projects/harpers-circle/04-evidence/gate-2eab0f3-2026-08-21/`
  (gate-5a.log + both suites' clean and upgrade logs + test-results/).
- **lint / typecheck / production build:** clean (`eslint` silent;
  `next typegen && tsc --noEmit` clean; `next build` completes).
- **gitleaks:** digest-pinned CI image over the full history — **277
  commits scanned, no leaks found**.
- **CI scanner scripts:** `check-exposed-schemas` OK (hc never
  exposed) · `check-service-role-containment` OK (single permitted
  module).

## The pointed questions (recommended answers attached)

**Q-A — M2's "same categories" reading.** §6.6's sketch says "documents
in the same categories" without naming whose categories. Built as: the
categories of the arrival's OWN pending `'document'` proposals — the
extraction pass's filing intent, the only deterministic in-DB reading,
and the one that makes the section honestly arrival-dependent while
every other section stays subject-stable (the cache-prefix property,
pinned in 052). **Recommend: ratify.** Alternative — all categories the
subject has ever filed — rejected: it deadens the section (every
document always) and breaks nothing the prefix property needs.

**Q-B — keep_both's task copy, and §4.8's "drafted" annex.** Q9 ruled
the task COMMITS as the approval's one object; the build sources its
copy from the DRAFTED payload's `task` block and REFUSES a taskless
keep_both (the DB invents no words — refuse-what-you-cannot-validate).
The promised annex reconciliation: **propose annex A11** — §4.8's
"Keep both and ask: no fact written; a task is drafted instead" reads
as-built: *"no fact is written; the conflict's drafted task commits as
the approval's one object (unassigned — §3.6)."* **Recommend: ratify
the build + adopt the annex.**

**Q-C — same_thing's DIRECT provenance edge (ADR-0020 D6).**
`hc.link_provenance` refuses arrival endpoints and propagates taint
growth; the resolution inserts the document ← arrival edge directly,
argued: an attested second copy of the already-filed document carries
no new information class, so the edge records citation provenance
without narrowing the document's audience. **Recommend: ratify.**
Alternative — extend link_provenance with arrival endpoints and a
no-growth flag — rejected: widening a general primitive for one
attested case, and a no-growth flag on a growth-propagating primitive
is a footgun.

**Q-D — the enum-append placement (ADR-0020 D4).** Q8's value rides the
tail of M4's file (5A's own unshipped migration) because the recorded
55P04 rule makes a value usable only one migration later and a
dedicated value-file would have spent M6 — reserved by Q2's letter for
THIS round. **Recommend: ratify** (the bound closes 5 of ≤ 6, M6
intact). Alternative — spend M6 as the value-migration — rejected: it
converts a naming nicety into a bound amendment.

**Q-E — the regression-net correction (ADR-0020 D7).** The net's
"vitest 431" is a stale echo; the true count at the 5A base is 448,
verified against a clean base worktree. **Recommend: adopt 448 as the
standing number** — no test vanished; the archaeology is recorded.

**Q-F — the NOINHERIT posture, stronger than the runbook anticipated
(ADR-0020, M1).** After the flip the bare login cannot even RESOLVE
schema hc, so the runbook's catalog probe itself answers 42501; the
vitest probe was re-pinned to expect that and to read the catalog fact
over the channel. **Recommend: ratify the re-pinned probe shape** —
the stronger refusal is the point of Q4, not a side effect to paper
over.

**Q-G — high-risk confirmation scoped to use_new (ADR-0020 D3).**
PRD §6.4's confirmation discipline is about approving a VALUE; `keep`
approves nothing and `keep_both` commits a task, so demanding
`confirm_high` there would gate a refusal on a comparison nobody is
making — while `use_new` keeps the full §6.4 letter. **Recommend:
ratify.** Alternative — confirm on every conflict outcome — rejected:
it teaches people to click confirmations that confirm nothing.

## What this round does NOT cover (named, per the plan)

The 5B units B1–B9 (corpus, rasterizer spike, adapter, workers, relay
flip, stage-2 surface, eval/p95 harnesses, the E2E extraction leg) —
round 16's. The G4 deploy rows and G7's hardening set stand on their
checklists. OCR and A11Y-08 are slice 6's (Q6). SIG-01 stays pending,
not absorbed (Q7). §5.9's notification stays slice 11. `Needs you`'s
acting surface (the review screen) is slice 6's — the Q7 exit seam,
accepted at the gate.
