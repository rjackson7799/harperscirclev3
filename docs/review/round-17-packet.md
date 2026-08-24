# Third-party review packet — round 17: the built slice 6A, the Care Inbox database increment

**Read this file first, top to bottom.** The head ledger is at the top by
design (round-7 E2), the tree binding is stated per directory (ADR-0015
F12), and every evidence leg below was produced at ONE declared head
rather than at a run three commits behind it (R7/F-8).

---

## Head ledger — from the start

| Purpose | SHA | Tree relationship | CI status |
|---|---|---|---|
| Base | `31a7977` | `main` — the slice-6 plan RULED, Q1–Q10 SETTLED, docs-only | **green**, run `32715475025` (23 steps, 22 success, the single `skipped` being the on-failure log capture) |
| Green build head | `dd350ad` | **11 commits from base** — five red→green pairs plus the concurrency additions | covered by the pushed-head run recorded in the addendum |
| Evidence head | `dd350ad` | **the last commit that moved a non-docs tree** — every number below was produced at this tree | idem |
| Docs head | `e0186ce` | ADR-0024, the coverage section, and the ADR-0023 D17 correction — **docs-only** | idem |
| Round-17 packet head | `6c280ec` | this file and the round-17 kickoff — **docs-only** | **green**, run `32770470394` (23 steps, 22 success, 1 skipped) |
| CI-record head | `2f4c4a6` | this file again, adding the run id above — **docs-only**, and the last commit on the branch | its own docs-only run; the evidence run is the one named on the row above |

The docs head `e0186ce` moves three files, all under `docs/`. The TREE
RELATIONSHIP is what binds a leg, and it is docs-only.

**F12 tree binding, per directory, between the evidence head and the
packet head:** `supabase/` **unchanged** · `app/` **unchanged** ·
`lib/` **unchanged** · `e2e/` **unchanged** · `scripts/` **unchanged** ·
`tests/` **unchanged** · `docs/` **moved**. So every leg below still
binds, and the local gate is not re-owed by the docs commits.

**Documents that moved AFTER the evidence head** (R7/F-9 — named, not
implied; a packet cannot name its own SHA, so the CI-record commit above
is how that is closed rather than left implicit): `docs/adr/0024-6a-care-inbox-db-deltas.md` (new),
`docs/adr/0023-slice5b-review-round-16.md` (the D17 R8/F-1 verdict
correction), `docs/coverage.md` (the `## 6` section),
`docs/review/round-17-packet.md` (this file),
`docs/review/round-17-kickoff.md`.

---

## What 6A is

**§4.9 is the first slice in which a person's click changes the record.**
6A is the half that makes the click possible. Five things stood in the
way, and each was verified against the shipped tree rather than assumed:

1. **Approval was wider than the evidence.** `hc.grant_vectors` builds
   each level cumulatively, so `hc.ladder(s, all_domains)` is the
   caller's MINIMUM across five domains — and a member with `manage` on
   ONE domain could approve a fact whose source and citation were
   invisible to them. **Demonstrated live** in pgTAP 060's red leg.
2. **No proposal could ever be rejected.** `proposals.reject_reason` and
   its two CHECKs have stood since `20260815230001:83`/`:85` with
   **nothing ever satisfying them**.
3. **No arrival could ever leave "Needs you".** `proposals_ready`
   appeared in `hc.arrival_transitions` exactly once, as a to_state, and
   never as a from_state; `filed` appeared in no row at all.
   `hc.manual_entry`'s arrivals have had no exit since 1C either.
4. **Nothing recorded what was RENDERED** — so the extension was a
   guess and partial promotion was undetectable.
5. **The receipt had no read path.** `authenticated` holds nothing on
   `proposal_commits`.

**Nothing is production-activated.** Proposals rest at `pending`, G9 is
OPEN, `BAND_ARTIFACT_ALLOWLIST` is EMPTY, G3/G4/G7 block, no credential
exists in CI or the gate. **Zero dependencies were added** — Q3's three
runtime slots are 6B installs and the dev reserve stays UNSPENT.

---

## Migration map — 5 of the ≤ 7 plan bound (Q2)

| # | File | What it does |
|---|---|---|
| M1 | `20260824120001_inherited_obligations` | R4/F-12 at both layers `domain` is already guarded: the draft-time guard so the unapprovable item is never drafted, and the approve-time guard so the whole `23502` class refuses in the DEF-10 shape. **R4/F-10 recorded and NOT taken here** — see Q1 |
| M2 | `20260824120002_review_boundary` | **Q7's ruling.** ONE predicate in `hc.approve_proposal` — `view` on the arrival over all five domains, in addition to `manage` on the object's taint. Plus `hc.extractions_for` (ADR-0019 Q-C), gated the same way, no band column |
| M3 | `20260824120003_decide_proposal` | `hc.reject_proposal`; the graph's two review edges; the terminal arm as a write half that CONSULTS the graph; the idempotency identity gains the DECISION |
| M4 | `20260824120004_renditions` | Q5's manifest in `finalize_extraction`'s transaction; R3/F-8 and R4/F-6 close together |
| M5 | `20260824120005_receipt` | `hc.receipt_for` — §4.2.4 as a definer read; counted, never named |
| M6 | *(reserved)* | round-17 dispositions — the standing precedent since 2A |
| M7 | *(reserved, NAMED)* | **closes UNCONSUMED** — Q8 ruled for a surface that revalidates, which needs no DDL, exactly as the plan predicted |

The tree moves **62 → 67 migrations / 59 → 64 pgTAP files**.

---

## Red→green history (each red commit names its failure signatures)

| Commit | Leg |
|---|---|
| `6e45a13` | **red M1** — 10 of 13; `ERROR:23502:null value in column "field" of relation "profile_facts"` at a person's click, plus five sibling columns |
| `d95e728` | **green M1** |
| `badb499` | **red M2** — 10 of 16; case 2's `have` is the finding itself: `{"status": "approved", "object_type": "profile_fact", …}` from a member resolving to `hidden` across five domains |
| `189503c` | **green M2** |
| `7f962af` | **red M3** — 16 of 19; the graph has no exit, no reject exists, and case 12 drives the replay hole live |
| `29e03f5` | **green M3** |
| `300a73a` | **red M4** — 14 of 15 |
| `b8b6353` | **green M4** |
| `a2f5db6` | **red M5** — 14 of 14, the whole file |
| `278f918` | **green M5** |
| `dd350ad` | the five concurrency cases (45–49) |

---

## Defects found and handled inside the slice

**1. A superseded function body, caught by a structural pin.** M4's first
build extracted `hc.finalize_extraction`'s body from `20260821120005`,
which round-15's FINDING 1 had already superseded — `20260821120006`
hoisted the per-circle advisory lock ABOVE `hc.detect_stage2_duplicate`.
Rebuilding on the stale body would have **silently reverted that fix**.
pgTAP **056 case 1** reds on exactly that ordering and caught it before
the commit. Recorded as ADR-0024 D8, with the build rule it implies.

**2. An ordered-set placement error, caught by the pin it belongs to.**
PostgreSQL sorts `receipt_for` **before** `reclassify_taint` and every
`record_*` name (`rece` < `recl` < `reco`), and 002's sets are ORDERED
array comparisons. The first placement was wrong; 002 caught it.

**3. Eleven exact-set re-pins, every one caught by the suite rather than
by inspection** — 002 (five separate sets), 027, 055, 001, 007, 023, 056.
Each landed in the SAME commit as the change that forced it. **046 needed
no re-pin, and pgTAP 061 case 3 CHECKS that** rather than claiming it.

---

## Verification evidence (local, ONE declared head: `dd350ad`)

Complete summary lines, no grep-filtered chains. Every leg below was
produced at `dd350ad`'s tree; the docs commits after it move no directory
any leg binds to (see the F12 line above).

- **Clean leg:** `npm run db:reset` → `node
  scripts/verify-migration-state.mjs supabase/migrations` →
  `migration state exact: 67 applied == supabase/migrations` →
  `npm run test:db` → `All tests successful. Files=64, Tests=1590 …
  Result: PASS` → `npm run test:concurrency` →
  `75/75 concurrency assertions passed` (teed; zero `NOT OK`) →
  `npm run db:verify` → `No schema errors found` (hard gate,
  `--fail-on warning`).
- **Upgrade leg (the `ci.yml` rehearsal, run locally):** worktree @
  `31a7977` → base reset → verifier exact **62 == 62** →
  `npx supabase migration up` (exactly the five 6A migrations, applied in
  order) → verifier exact **67 == 67** → `test:db`
  `Files=64, Tests=1590 … Result: PASS` → `test:concurrency` **75/75** —
  against the UPGRADED database, not a fresh one; worktree removed.
  This leg matters more than usual this slice: **M3 drops a constraint
  and M4 drops a function**, and neither is exercised by a from-scratch
  reset.
- **vitest:** `Test Files 64 passed (64) · Tests 689 passed (689)` —
  unchanged, because 6A authors no app-layer unit.
- **lint · typecheck · production build:** all clean.
- **gitleaks** (the digest-pinned image `ci.yml` uses, run identically):
  `373 commits scanned` · `no leaks found`.
- **Local gate (browser truth, LOCAL-only): 29 tests; RED at this SHA.**
  Run 1: 18 passed / 2 failed (NOT HERMETIC — a peer’s dev server was
  adopted; independently corroborated by that session). Run 2: 27 passed /
  1 failed / 1 did not run. Run 3, fully hermetic: 21 passed / 1 failed /
  7 did not run. **Three disjoint failure sets, none with a code channel
  from 6A**, and NO fourth run. **The total is stated exactly rather than
  as "unchanged"** (R7/F-11’s lesson): the gate is **29** tests, as it
  was — 6A adds no e2e leg, because it adds no app surface. Full detail,
  all three classifications and the evidence for each are in the section
  below.

**One unreproduced transient, recorded as such and NOT claimed as
diagnosed.** A first full `vitest` run failed one test —
`tests/lint/db-fence.test.ts:38`, *"Test timed out in 30000ms"*. The file
passes alone in **9.5 s (34/34)** against a 30 s budget, and the full
suite passes clean on re-run (**689/689**). Timeout under load.

**One environment failure, recorded because it interrupted the session.**
Docker Desktop's engine terminated mid-run — `docker ps` itself failed
and the named pipe was gone. Every DB leg above had already run and been
captured before it dropped. The engine was restarted, the stack returned
healthy, `hc_clamd` needed the recorded `docker start` revive ("socket
found, clamd started" confirmed in its log), and the remaining legs ran
after.

---

## The local gate — RED at this SHA

**THE LOCAL GATE IS RED AT THIS SHA. THREE RUNS, THREE DISJOINT FAILURE
SETS, AND NO FOURTH RUN.**

`supabase/` moved, so F12 binds the full gate (29 tests). It was run three
times and it is reported RED. Each failure was classified from evidence —
the failure string, the database, or Playwright's own page snapshot — and
never from the fact that a later run went differently.

**Run 1 — 18 passed, 2 failed** (`extraction.spec.ts:166`,
`ingestion.spec.ts:161`). Both upload-driven legs, both reporting
`Uploading is not available for this person.` — `upload-form.tsx:63`, the
branch taken when `POST /api/upload/token` returns non-OK. **NOT
HERMETIC, and therefore not a measurement of this tree.**
`playwright.config.ts` carries the full `webServer` env — the demo keys,
the service-role key, `HC_DB_URL` — but only when IT starts the server;
`reuseExistingServer: true` adopted a dev server a PEER SESSION had
started at 09:20:33 for a design review, which carried none of it, so the
route had no service-role key with which to mint a storage grant.
**Independently corroborated by the peer session that owns that server**,
from evidence this session could not see: their `.env.local` lacks
`SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_INBOUND_SECRET`,
`ANTHROPIC_BASE_URL`, `HC_AUTHSERV_ID` and `HC_TRUSTED_HOP`, and their
server's own request log shows it served the onboarding-spec traffic.
`e2e-local-gate.md` titles that section **"Prerequisites (hermetic
startup)"** and says to confirm the port is free — this run did not meet
it.

**Run 2 — 27 passed, 1 failed, 1 did not run.** The stale server was
killed and Playwright spawned its own. **Both run-1 legs passed**
(`ingestion.spec.ts:161` in **9.1 s** against its earlier 1.0 m timeout),
which is what confirms run 1's classification rather than merely
asserting it. A DIFFERENT leg failed — `ingestion.spec.ts:361`, the §4.5
cancel window: `wanted extracting, still unsupported_type`. Evidenced
from the arrival's own `public.arrival_events`:

```
scanned    -> extracting                          19:42:56.219993+00
extracting -> unsupported_type  unsupported_mime  19:42:56.327759+00
```

The state that leg polls for existed for **108 milliseconds**; it polls
every **1500 ms**. The verdict is `normalizeArrival`'s judgement of the
leg's OWN deliberately-malformed three-line PDF fixture.

**Run 3 — 21 passed, 1 failed, 7 did not run.** Fully hermetic: **zero**
project node processes before starting (the peer stood down entirely),
stack and `hc_clamd` healthy, clean `db:reset`, verifier exact **67**,
both servers spawned by Playwright. **Every extraction leg passed,
including both that failed in run 1.** A THIRD, different leg failed —
`ingestion.spec.ts:102` (FWD-01), with `forwarding_active_at` still null.
Evidenced from **Playwright's own page snapshot at the moment of
failure**, which shows the browser signed in as

```
extract.founder.1787603230839@example.com
```

while the leg asserts on `ingest.founder.<stamp>`'s subject. **That is a
cross-spec session leak**: the extraction spec's founder was still
authenticated when the ingestion spec navigated to its verification link,
so the confirm route ran for the wrong account and the ingestion
founder's subject was never activated.

**What the three runs say together.** Three runs, three DISJOINT failure
sets, every one of them inside the e2e suite's own fixtures, ordering or
environment — and **this branch has no code channel to any of them**:
`git diff --name-only 31a7977..dd350ad` is **12 files in
`supabase/tests`, 5 in `supabase/migrations`, 1 in `scripts/concurrency`,
and nothing else** — zero under `app/`, `lib/` or `e2e/`. The DDL that
did change is not on the `extracting -> unsupported_type` edge and is
nowhere near forwarding activation.

**So the increment's DB evidence is green and its browser gate is RED,
and this ADR says both.** The gate was NOT re-run to green: it was run
three times, went a different colour of wrong each time, and is reported
as it stands. **A fourth run would be re-running to green and was not
attempted.**

**This is a FINDING FOR ROUND 17, and it is about the SUITE.** Two legs
of `ingestion.spec.ts` are fragile by construction — one samples a 108 ms
window on a 1500 ms poll, one depends on browser session state left by a
different spec file — and a third failure mode is a config footgun
(`reuseExistingServer: true` silently dropping the env block, surfacing
as a product-sounding string three layers from its cause). The build
session does not repair e2e legs and M6 is reserved for dispositions.

---

## Pointed questions for round 17 (recommended answers inline)

**Q-A · R4/F-10's DB half was DECLINED. Was that right?**
The plan assigns the finding to **M1 + B3**. But pgTAP **055:453-456**
already pins the stage-2 suspect's interpret `invalid_state` and argues
the verdict in its own message — *"the wait is the machinery's answer,
not a queue accident"*. Absorbing it in `hc.claim_stage` would turn a
settled 5A pin red to satisfy a MINOR finding. M1 therefore takes the
finding's OTHER stated remedy — *"make it a warn"* — which is
`processGate`'s shape applied to `processInterpret`, and that is
app-layer: it lands wholly at 6B B3. pgTAP 059 case 13 pins the DB
behaviour as UNCHANGED so the decision lives in the suite.
**Recommended: CONFIRM.**

**Q-B · Q7 opens a manual-entry seam. Close it at M6?**
`hc.create_manual_proposal` authorizes on manage-over-drafted-taint alone
(`20260816010006:113`) and does not ask for view×5, so after M2 a member
below view×5 can CREATE a manual entry they can no longer APPROVE. The
ruling says ONE predicate and says nothing about manual entry; inventing
an exemption — or narrowing a second function — is an owner decision, not
a build decision, so the seam is pinned at 060:16 rather than closed.
**Recommended: narrow `hc.create_manual_proposal` to the same view×5 at
M6.** One predicate, one function, and it makes "you cannot create what
you cannot approve" true.

**Q-C · M1's guard is WIDER than R4/F-12's letter. Ratify the scope?**
The finding names `profile_fact`/`field`; the plan states the property as
a class (*"23502 can never surface as a raw Postgres error at the moment
a person clicks approve"*); enumerated against `information_schema` there
are **seven** such columns. The wider guard is **non-breaking by
construction** — every payload it refuses would have raised `23502` a few
statements later — and 059 cases 3 and 11, **both passing on `main`**,
are the controls that pin exactly that.
**Recommended: RATIFY**, and take Q-D with it.

**Q-D · One adjacent class was NAMED and not taken.**
`timeline_events.temporal_shape` is a CHECK, so a payload with neither
`occurred_on` nor `local_at` still raises a raw **23514** at a person's
click — a different code, a different class, and not this finding's.
**Recommended: take it at M6** with the same guard block, because the
property the plan states is not fully true while it stands.

**Q-E · M3 RETIRED a foreign key. Ratify?**
`hc.arrival_transitions.stage` referenced `hc.stage_budgets`, the WORKER
budget table. Seeding a `review` row there would have made
`hc.claim_stage(arrival, 'review')` a **legal call for any hc_pipeline
worker** (`20260816010004:50` looks the budget up by name and proceeds),
would have made `proposals_ready` a claimable `entry_state` (it is
UNIQUE) that `hc.outbox_drain` then resolves, and would have red
019:98-110, which pins that table as exactly the five §4.3 stages. The FK
is replaced by a closed CHECK; 061:2 drives a typo to `23514`.
**Recommended: RATIFY.** The invariant was retired because it stopped
being true, and the CHECK carries the part that still is.

**Q-F · Is `arrival_renditions.page_exts text[]` the right shape?**
The array keeps the manifest one write-once row and makes count/extension
agreement a CHECK; a per-page child table would make "page 3 is missing"
a row-level fact instead. 6B B2 compares the manifest to storage either
way, and the array is bounded at 200 by PRD §13.3.
**Recommended: KEEP the array.**

**Q-G · `hc.receipt_for`'s filter is real but NARROW — is that stated
honestly enough?** The arrival gate (view×5) is strictly stronger than
the `summary` threshold four of the five record tables read at, so a
caller who clears the gate clears every ORDINARY destination. The filter
bites only through unresolved lineage (`visible_at` rung 3), a deleted
destination, and caps that refuse the gate anyway. This is stated **in
the migration header**, and 063:5–6 drive it both ways so a filter that
merely blanked a column would fail.
**Recommended: CONFIRM the framing** — and note it as the reason RCP-01's
app half must not over-claim at 6B.

**Q-H · The bound closed at 5 of ≤ 7 with M7 UNCONSUMED, as the plan
predicted.** M6 stays reserved for this round's dispositions.
**Recommended: CONFIRM**, and spend M6 on Q-B and Q-D if both are taken.

**Q-I · THE LOCAL GATE IS RED AT THIS SHA. How should the round take it,
and will it disposition the SUITE?** Three runs, three disjoint failure
sets — run 1 not hermetic (a peer’s dev server adopted by
`reuseExistingServer: true`, corroborated by that session’s own
`.env.local` and request log), run 2 the §4.5 cancel leg losing a 108 ms
race it polls for every 1500 ms, run 3 the FWD-01 leg running against a
browser still signed in as the EXTRACTION spec’s founder. Every one is
inside the suite’s fixtures, ordering or environment; the branch touches
**zero** files under `app/`, `lib/` or `e2e/`.

**Two readings of the rule, and the round should pick one rather than
letting the build session pick for it.** Strictly, *"two consecutive
failed gate runs at one SHA = the gate is RED, whatever a third run
says"* — and three runs failed, so it is RED either way. On the other
reading, run 1 was never a gate run at all: `e2e-local-gate.md` titles
its own setup section **"Prerequisites (hermetic startup)"**, and a run
that adopted a foreign, differently-configured server did not measure
this tree. **This packet reports RED under BOTH readings** and does not
use the reclassification to upgrade the colour.

**Recommended: accept the DB evidence as green, record the browser gate
as RED, and open a round-17 finding against the SUITE** — make
`ingestion.spec.ts:361` drive `/api/worker/extract` itself rather than
depending on the extract worker not having run yet; isolate browser
session state between spec files so `ingestion.spec.ts:102` cannot run
as another spec’s founder; and consider `reuseExistingServer: false`
for the gate, since adopting a foreign server surfaces as a
product-sounding string three layers from its cause. **The gate was not
re-run to green and a fourth run was not attempted.**

## Coverage rows

`docs/coverage.md` gains `## 6 — the Care Inbox` with **twelve rows
opening**, per Q9's tabled set. Only what this layer proves is flipped
(the 4A/5A rule): the pgTAP halves of **REV-01, REV-02, DEC-01, RCP-01**
and **M4's half of RND-02**. Everything app-shaped is annotated for 6B
and named as owed. **A11Y-07 and A11Y-08 do not move** — they flip with
the screen at 6B. **RCP-02 opens `pending` tagged 7**, never green on a
criterion half met. **SIG-01 is still NOT absorbed** — third slice
running.

---

## Addendum — auditability block

- **Local evidence:** at `dd350ad`'s tree, quoted verbatim above (one
  head, complete summary lines).
- **PR:** to be opened by the owner — `gh` is UNAUTHENTICATED in the
  build session and device-flow is out of bounds. Base `main` @
  `31a7977`, **DO NOT MERGE** banner in the description.
- **Pins:** no drift this slice — Supabase CLI as pinned, image
  `public.ecr.aws/supabase/postgres:17.6.1.106`, Node 22.15.0 /
  npm 10.9.2.
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs supabase/migrations` ·
  `npm run test:db` · `npm run test:concurrency` (teed) ·
  `npm run db:verify` · the upgrade leg per `ci.yml` (worktree at base,
  base reset, exact list, `supabase migration up`, exact list, both
  suites) · `npm run test:app` · `npm run lint` · `npm run typecheck` ·
  `npm run build` · gitleaks via the digest-pinned image ·
  `npx playwright test --trace on`.
- **A standing transient to expect in CI:** a "Start local Postgres"
  `toomanyrequests` failure is the ECR Public anonymous quota on the
  runners, never a repo defect — re-run later.
- **CI at the pushed head:** push run **32770470394** @ `6c280ec` —
  conclusion **success**, 23 steps, 22 success, the single `skipped`
  being the on-failure log capture (the same shape as the base run at
  `31a7977`). Secret scanning, service-role containment, the schema pin,
  the clean reset, the exact-state verifier, pgTAP, concurrency,
  db:verify under --fail-on warning, vitest, the G9 generator check, the
  FULL upgrade rehearsal, lint and typecheck all green on the runner.
  The **pull_request** run fires when the owner opens the PR; its id is
  confirmable via the public API then.
