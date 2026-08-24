# ADR-0024 — Slice 6A: the Care Inbox DB increment, design decisions and deltas as built

**Status:** Proposed — the as-built record for round 17.
**Date:** 2026-08-24
**Scope:** Decisions made while building 6A (five migrations,
`20260824120001`–`20260824120005`; **M6 stays reserved** for round-17
dispositions and **M7 closes UNCONSUMED**, so Q2's bound stands at
**5 of ≤ 7**), per the slice-6 plan (`docs/review/slice-6-plan.md`,
PLANNED–RULED, Q1–Q10 SETTLED 2026-08-24, every recommendation accepted
as written) and the 6A build kickoff. Authority order applied: the plan
(the M-rows are BINDING) → TSD §4.9 whole, §4.2/§4.5/§4.7, §3.2–§3.4,
§3.7, §6.4 → PRD §4.2 whole, §6.4, §7.3–§7.4 → ADR-0023 (D17's owed
findings the plan takes; D24's rulings) → ADR-0019 Q-C → `docs/coverage.md`
row conventions.

**Branched from `main` @ `31a7977`** (CI green at that exact head, run
`32715475025`), per Q9.

**What this increment is.** §4.9 is the first slice in which a person's
click changes the record, and 6A is the half that makes the click
possible. Five things stood in the way and all five are gone: approval
was wider than the evidence; no proposal could be rejected at all; no
arrival could ever leave "Needs you"; nothing recorded what was
rendered; and the receipt had no read path. **Nothing here is
production-activated** — proposals still rest at `pending`, the G9 gate
stays OPEN, `BAND_ARTIFACT_ALLOWLIST` stays EMPTY, G3/G4/G7 still block,
and no credential exists in CI or the gate.

**Zero dependencies were added.** Q3's three runtime slots
(`pdfjs-dist`, `@napi-rs/canvas`, `tesseract.js`) are 6B installs; the
dev-dependency reserve stays UNSPENT through a third slice. This is the
4A/5A "added none, as ruled" precedent.

---

## The inherited obligations, discharged — and one deliberately NOT taken (M1)

The R8 / 5A M1 precedent: owner-queue DB items land FIRST, before
slice-proper work. The plan assigned two.

### R4/F-12 — taken, and taken WIDER than its letter, with the argument

**The finding:** *"A `profile_fact` with `field: null` is drafted and
raises `23502` at approval — a raw Postgres error at the moment a person
clicks approve. Guard where `domain` is already guarded."*

**"Where domain is already guarded" is a real place, and there are two of
them.** `hc.draft_proposal:94` refuses a profile_fact whose payload
carries no `domain`; `hc.own_domain` is fail-closed on `category` and
`kind` inside `hc.approve_proposal`'s taint arithmetic. Neither guards
anything else about the payload's ability to satisfy the columns it is
about to be written to. So M1 takes **both branches of the plan's own
sentence** — *"it becomes a drafted proposal that is refused honestly, OR
is not drafted"*:

1. **Draft time.** `field` and `value` join `domain` in the guard that
   already stands there, scoped exactly as that guard is scoped. The
   unapprovable item is never drafted, so nobody is ever shown one. This
   is the R4/F-3 precedent — a conflict with no domain is DROPPED rather
   than drafted un-approvable.
2. **Approve time.** The whole `23502` class refuses in the existing
   DEF-10 `approval_refused` shape. This is the half that covers rows
   already resting at `pending` when the guard shipped.

**The scope is wider than the finding's letter and that is a decision,
not an accident.** The plan states the property as a CLASS — *"so 23502
can never surface as a raw Postgres error at the moment a person clicks
approve"* — and a class is not one column of one kind. Enumerated against
`information_schema` rather than guessed, **seven** payload-derived
columns are NOT NULL, defaultless and unguarded between the payload and
the insert:

```
profile_facts.field · profile_facts.value · profile_facts.risk_class
documents.title · tasks.title · timeline_events.summary · episodes.title
```

Guarding one and shipping six is the half-fix this project's rounds exist
to catch. **The wider guard is NON-BREAKING BY CONSTRUCTION**, which is
why it fits inside a MINOR finding's slot: every payload it refuses is a
payload that would have raised `23502` a few statements later. Nothing
that succeeds today changes, and pgTAP 059 cases 3 and 11 — **both
passing on `main`** — are the controls that pin exactly that.

**One adjacent class is NAMED and NOT taken.**
`timeline_events.temporal_shape` is a CHECK, so a timeline_event payload
with neither `occurred_on` nor `local_at` raises **23514**, not 23502 — a
different code, a different class, and not what this finding is about.
Recorded here and carried to round 17 rather than folded in silently.

### R4/F-10 — RECORDED, and NOT taken at this layer

**The finding:** *"A stage-2 duplicate always yields a silent
`invalid_state` at interpret, which §4.2 says means 'raise a defect
signal'. `processGate` warns; `processInterpret` returns it silently.
Make it a warn, or absorb it explicitly."* The plan assigns it **M1 + B3**.

**There is no DB half that does not contradict a deliberate shipped
pin.** pgTAP **055:453-456** already asserts that exact call and argues
the verdict in its own message:

> *"a stage-2 suspect cannot be CLAIMED toward interpret — the wait is
> the machinery's answer, not a queue accident"*

Absorbing it in `hc.claim_stage` would turn that pin red and say the
opposite of what 5A settled. So M1 takes the finding's **other** remedy —
*"make it a warn"* — which is `processGate`'s shape applied to
`processInterpret`, and that is app-layer: it lands **wholly at 6B B3**.

pgTAP 059 case 13 pins the DB behaviour as **UNCHANGED**, so the decision
lives in the suite rather than only in this document. **Round 17 is asked
to confirm it** (question 1 below).

---

## D1 — M2: where Q7's predicate goes, and the one consequence it has

`hc.approve_proposal` gains ONE predicate:

```sql
hc.visible_at(ctx, subject, hc.all_domains(), true,
              'arrival', v_prop.arrival_id, null) >= 'view'
```

character for character the predicate `hc.log_artifact_read`
(`20260821120001:81`) and the artifact route already enforce. **It
invents no rule**; it states §6.4's rule at the layer that ENFORCES
rules, because §3.7 says access is re-checked at WRITE time and an
interface-only rule is one a second client does not have.

**Placement is a decision.** It sits immediately after the manage check,
**inside** the authorization boundary, so `proposal_version_changed` and
`proposal_taint_changed` keep their distinct shapes strictly past it, and
the refusal rides the existing `approval_refused` shape (DEF-10) so
nothing new leaks. A narrowing is safe; a widening would not be.

**The finding was demonstrated live before it was fixed.** pgTAP 060's
red leg recorded a family member holding `manage` on `health` alone
approving a high-value health fact into the record while resolving to
`hidden` over all five domains on the arrival that fact was drawn from —
`{"status": "approved", "object_type": "profile_fact", …}`. In
all-high-risk mode, this slice's only mode, that member would also have
supplied the `confirm_high` for a crop they could not possibly have seen.

**Driven BOTH ways**, which is the plan's word — a refusal alone would be
satisfied by a function that refuses everything: 060:1 asserts the
composition is real, 060:2–3 refuse and write nothing, **060:4 approves
once the same member is raised to view×5**.

**ONE CONSEQUENCE IS RECORDED RATHER THAN DESIGNED AROUND.**
`hc.create_manual_proposal` authorizes on manage-over-drafted-taint ALONE
(`20260816010006:113`) and does not ask for view×5, so a member below
view×5 can still CREATE a manual entry that they can no longer APPROVE.
The ruling says ONE predicate and says nothing about manual entry;
inventing an exemption — or narrowing a second function — is an owner
decision, not a build decision. Pinned visibly at 060:16 and put to round
17 (question 2 below).

## D2 — M2: `hc.extractions_for`'s gate, and why there is no band column

ADR-0019 Q-C's queued candidate, whose consumer is finally real: §4.2.3's
middle region has had no read path shaped for a person since 1C.

**It is gated on the ARRIVAL at the same view×5 approval now uses** —
that is the property M2 exists to establish and M5 completes. It then
filters each row through **`extractions_select`'s own predicate**, so the
definer is NEVER WIDER than the RLS it stands in for: a share that widens
one arrival cannot silently widen facts that carry no share of their own.

**No band column, by design (Q4 SETTLED).** A band is a property of the
CALIBRATION, not of the fact. Storing one would freeze one calibration
into the record and make re-calibration a data migration — the exact
mistake §6.4 avoided by owning citation geometry. The
`(model_id, prompt_version)` pair returned here IS the key that resolves
a fact to the bands that governed it, and 6B B4 computes the band at
render time from it. 060:11 pins the column set as EXACTLY seven.

**The order is `field, id` — stable and CAST-FREE, deliberately.**
`hc.write_extractions` validates only that `citation` HAS a
`page`/`offset`/`t` key (`20260816010005:175`), never that `page` is a
number, so ordering on `(citation ->> 'page')::int` would be a latent
`22P02` on a malformed citation. Document order is the screen's job (6B
B7 groups facts by kind); a stable order is the database's.

## D3 — M3: a foreign key RETIRED, and why seeding the worker table would have been worse

**This is the build decision the plan's M-row did not foresee, and it is
the one most worth a reviewer's attention after Q7.**

The plan binds M3 to append `('review', 'proposals_ready', 'filed')` and
`('review', 'proposals_ready', 'nothing_filed')` to
`hc.arrival_transitions`. That table's `stage` column was
`references hc.stage_budgets(stage)`, and **`hc.stage_budgets` is the
WORKER budget table**: `entry_state` (UNIQUE), `max_attempts`,
`lease_seconds`, `exhaust_state`, `exhaust_reason` — every column NOT
NULL and every one meaningless for a decision a PERSON makes.

Seeding a `review` row there to satisfy the foreign key would have been
actively wrong in three separate ways:

1. **`hc.claim_stage(arrival, 'review')` would become a LEGAL CALL for
   any `hc_pipeline` worker.** `20260816010004:50` looks the budget up by
   name and proceeds, so a worker could take a LEASE over an arrival that
   is waiting for a person and drive it to an invented `exhaust_state`.
2. **`entry_state` is UNIQUE**, so `proposals_ready` would become a
   claimable stage entry, and `hc.outbox_drain` (`20260816010008:123`)
   would begin resolving a stage for arrivals that have none.
3. **pgTAP 019:98-110 pins `hc.stage_budgets` as EXACTLY the five §4.3
   stages.** `review` is not a §4.3 stage. It is a stage of the LOOP.

So the foreign key is replaced by a **closed CHECK** over the known
stages. The graph stays closed, seeded, append-by-migration and
typo-proof (061:2 drives a typo to `23514`); the worker budget table
stays exactly the five worker stages with 019 untouched; and no worker
can ever lease a review. **The invariant is not weakened by accident — it
is retired because it stopped being true**, and the CHECK carries the
part of it that still is.

## D4 — M3: the terminal arm is a WRITE HALF that CONSULTS the graph

`hc.terminalize_decided_arrival` is hc_internal-owned, granted to nobody,
reachable only from inside the two deciding definers, and runs AS the
calling definer — the shipped pattern for `hc.draft_proposal` /
`hc.write_extractions` / `hc.write_proposals`. **002's SECURITY DEFINER
exact set therefore stays a BOUNDARY list rather than a function list.**

It **asks `hc.arrival_transitions` for the edge before it moves
anything**, so the allowlist is the authority for a person's transition
exactly as it is for a worker's. 061:18 proves the other direction: a
worker holding a VALID `interpret` lease cannot drive
`proposals_ready → filed`, because a fenced lease authorizes its OWN
stage's edges and this edge is a person's. **No pipeline path can file an
arrival nobody decided.**

The rule itself is settled in the DATABASE, not the app: an arrival
terminalizes when every LIVE proposal is decided — `filed` if at least
one closed `approved`/`edited_approved`, `nothing_filed` otherwise —
evaluated inside the deciding transaction, so the last decision and the
terminal transition commit together or not at all (AC-INBOX-4's letter).
`superseded` and `void` are pipeline outcomes and hold nothing open
(061:16). The original artifact is untouched either way (061:19).

**The two reason codes it writes were seeded long ago and had never been
written by anything**: `proposal_approved_filed` and
`all_proposals_rejected`. The database had been waiting for this arm.

## D5 — M3: the idempotency identity gains the DECISION, closing a real hole

`approval_attempts.conflict_outcome` made the outcome part of the
identity at 5A M4; `decision` makes approve-versus-reject part of it now.

**Without it there is a REAL hole, not a theoretical one.** The replay
branch **returns BEFORE the pending check**, so a key claimed by a
rejection and then presented to `hc.approve_proposal` would have replayed
the rejection's stored result to a caller who asked to approve. pgTAP 061
case 12 drove exactly that on `main` and got
`{"status": "approved", …}`.

The column **defaults to `'approve'`**, so every attempt row written
since 1B keeps the meaning it always had and no backfill is required.

## D6 — M3: reject's shape — the reason is OPTIONAL, the vocabulary is bounded here

`hc.reject_proposal` is approve's mirror: same version refusal, same
idempotency identity, same freeze refusal, same advisory-lock order, and
the same write-time authorization **including M2's view×5 predicate** —
rejecting a fact you cannot read is as blind as approving one (061:10).

It writes `status`, `decided_by`, `decided_at` and `reject_reason` — the
columns 1B has carried since `20260815230001:83` **with nothing to
satisfy them** — and **NOTHING to the record**: no `proposal_commits`
row, no object, no provenance edge (061:7).

The reason is **OPTIONAL** (§4.2.3's *"optional one-tap reason"*) and its
vocabulary is bounded **in the migration**, matching the CHECK that has
stood since 1B. Both results — approve's and reject's — gained
`arrival_state`, so 6B can report the terminal without a second read;
every existing consumer reads by key, never by whole-object equality, so
the addition is non-breaking.

## D7 — M4: the manifest's shape, and a signature DROPPED rather than overloaded

`public.arrival_renditions` is §2.1 throughout — circle-consistent
composite FKs, every FK indexed, RLS enabled AND forced in the creating
migration. **The primary key is the arrival**: one manifest per arrival,
write-once, exactly like the promotion it describes (062:15).

**It is VALIDATED, not merely stored.** A manifest that cannot describe a
rendering would make partial promotion undetectable again from the other
direction, so the page count must agree with the per-page extensions
(062:5) and the extension vocabulary is closed to what the renderer
actually produces — `PageExt = 'png' | 'jpg'`,
`lib/pipeline/page-keys.ts:29` (062:7).

**The signature change is a DROP-and-replace, and the reason is
mechanical.** `hc.finalize_extraction` gains a fifth parameter defaulting
to null. Creating it ALONGSIDE the 4-argument function would make every
4-argument call ambiguous (*"function is not unique"*), and
`lib/hc/workers.ts:150` still makes one. With only the new function
present, that shipped call resolves unchanged and writes no manifest —
**which is the 6A/6B seam, stated as a test rather than a comment**
(062:10). 6A authors NO app-layer unit, so nothing passes a manifest yet;
6B B2 supplies it.

## D8 — M4: a defect the SUITE caught, worth recording because it nearly shipped

The first build of M4 extracted `hc.finalize_extraction`'s body from
`20260821120005`, which is **SUPERSEDED**: `20260821120006` (round-15
FINDING 1) hoisted the per-circle advisory lock ABOVE
`hc.detect_stage2_duplicate` so the duplicate predicate evaluates under
the same serialization point that guards publication.

Rebuilding on the stale body would have **silently reverted that fix**.
pgTAP **056 case 1** reds on exactly that ordering — a structural pin
over `pg_get_functiondef` — and caught it before it was committed.

**The lesson is a build rule, not a one-off:** when a function body is
carried forward, it must be taken from the LAST migration that replaced
it, and the way to be sure is a structural pin that reads the shipped
schema. Every body in this increment was extracted from source and
substituted with an asserted single-match anchor rather than retyped, so
each diff is the delta and nothing else — but extraction from the WRONG
source is a failure mode that discipline does not catch. The pin did.

## D9 — M5: counted-never-named, and the HONEST BOUND on the filter

`hc.receipt_for` is a definer read because `public.proposal_commits`
holds **no member privilege at all** (`20260815230001:150`):
`authenticated` holds nothing on the table §4.2.4's receipt is a read of,
so the receipt could not be built at the app layer at any level of
cleverness — and it should not get a blanket grant either, being the
one-proposal-one-object claim itself (AC-INBOX-3, PRD §6.2).

**Counted, never named** (§3.5's discipline): a destination the caller
cannot see is still REPORTED, with its type and WITHOUT its name or a
handle, both suppressed together so one cannot leak the other. `visible`
is returned **explicitly** rather than inferred from a null, because *"you
may not see this"* and *"there is nothing here"* are the two sentences a
receipt must never confuse.

**The honest bound on that filter is recorded IN the migration**, so a
reviewer can check it rather than assume it does more than it does. The
arrival gate is view-over-all-five, which is **strictly stronger** than
the `summary` threshold the four record tables read at and exactly the
`view` threshold `profile_facts` reads at (§3.4's level→table map). So a
caller who clears the gate at all clears every ORDINARY destination, and
the filter bites only through the rungs that do not depend on the domain
ladder: **unresolved lineage** (`hc.visible_at` rung 3), a **deleted**
destination, and the care_circle ceiling / FRZ-13 cap, both of which
refuse the arrival gate anyway. That is a NARROW set. Saying so is the
point — and 063:5–6 drive it **both ways**, so a filter that merely
blanked a column would fail.

**Never wider than the RLS it stands in for**: each destination is looked
up through its OWN policy predicate, reproduced from
`20260815230002:290-333` — `deleted_at is null` included, the object's
own `taint`/`taint_resolved` rather than the arrival's,
`owner_member_id` for tasks (the care_circle own-task carve-out), and
`profile_facts`' `view` where the other four read `summary`.

It reports **DECISIONS**: `approved`, `edited_approved` and `rejected` —
exactly the statuses that carry a `decided_by`, which is the 1B CHECK's
own definition of a human decision (`20260815230001:79`).

## D10 — ONE GATE ACROSS THE WHOLE SURFACE, as a property rather than an intention

M2 began it and M5 completes it. `hc.approve_proposal`,
`hc.reject_proposal`, `hc.extractions_for`, `public.arrival_renditions`
and `hc.receipt_for` **all ask the same question of the same arrival** —
`view` over all five domains, the predicate `hc.log_artifact_read` and
the artifact route already enforced. The screen, the fact read, the
manifest, the decision and the receipt cannot disagree about who may see
this arrival. 060:13, 062:11–12 and 063:12–13 assert it from three
different surfaces with the same member.

## D11 — Suite re-pins forced by the increment (all same-commit)

The ING-10 exact-set discipline working as designed. **Every one of these
was caught by the suite, not by inspection**, which is the argument for
keeping exact sets exact:

| Pin | Moved | Migration |
|---|---|---|
| `002` function inventory | +`extractions_for`, +`reject_proposal`, +`terminalize_decided_arrival`, +`receipt_for`, +`write_rendition`, `finalize_extraction` signature | M2–M5 |
| `002` SECURITY DEFINER set | sixty-nine → **seventy-two** (the write halves join the inventory and NOT this set) | M2, M3, M5 |
| `002` EXECUTE grant set | +3 (`extractions_for`, `reject_proposal`, `receipt_for` — all `authenticated`) | M2, M3, M5 |
| `002` table-privilege inventory | +3 (`arrival_renditions`) | M4 |
| `002` hc_internal policy list | one hundred one → **one hundred three** | M4 |
| `027` ING-10 transition allowlist | +2 (`review:proposals_ready>filed \| nothing_filed`) | M3 |
| `055` closed-graph row count | 22 → **24** | M3 |
| `001` `hc.log_event_types` count | 22 → **23** (`proposal_rejected`) | M3 |
| `007` freeze-referent set | ten → **eleven** (`reject_proposal` inherits approve's freeze refusal) | M3 |
| `023` EXECUTE closure | the new `finalize_extraction` signature; `write_rendition` asserted owner-only | M4 |
| `056` structural R-rule pin | the new signature | M4 |

**046 needed NO re-pin, and 061 case 3 CHECKS that rather than claiming
it**: `filed` and `nothing_filed` have carried their rank and their PRD
§4.2.2 label since 1D, and this increment adds no enum value.

**One ordering trap for the next author:** PostgreSQL sorts `receipt_for`
**before** `reclassify_taint` and every `record_*` name (`rece` < `recl`
< `reco`), and 002's sets are ORDERED array comparisons. The first
placement was wrong and the pin caught it.

## D12 — The bound, and the regression net as built

**Q2's bound closes at 5 of ≤ 7 for this increment.** M6 stays reserved
for round-17 dispositions (the standing precedent since 2A). **M7 closes
UNCONSUMED** because Q8 ruled for a Care Inbox that revalidates, which
needs no DDL — exactly as the plan predicted, so the over-provisioned
slot was not spent.

The tree moves **62 → 67 migrations / 59 → 64 pgTAP files**.

| Leg | At `main` `31a7977` | At the 6A head |
|---|---|---|
| migrations (clean leg, exact) | 62 | **67** |
| pgTAP | 1513 across 59 files | **1590 across 64 files** |
| concurrency (teed) | 70/70 | **75/75** |
| `db:verify --fail-on warning` | clean | **clean** |
| upgrade leg | green | **green** (1590/1590 + 75/75 on a DB migrated UP from 62) |
| vitest | 689 across 64 files | **689 across 64 files** (6A adds no app unit) |
| lint · typecheck · production build | clean | **clean** |
| gitleaks | clean | **clean** (373 commits scanned) |
| local gate (browser, LOCAL-only) | 29/29 | **RED at this SHA — three runs, three disjoint failure sets, none with a code channel from 6A** (see below) |

**One unreproduced transient, recorded as such.** A first full `vitest`
run failed one test — `tests/lint/db-fence.test.ts:38`, *"Test timed out
in 30000ms"*. The file passes alone in 9.5 s (34/34) and the full suite
passes clean on re-run (689/689). It is an **UNREPRODUCED TRANSIENT**, a
timeout under load, and is **not claimed as diagnosed**.

**One environment failure, recorded because it interrupted the run.**
Docker Desktop's engine terminated mid-session — `docker ps` itself
failed and the pipe was gone. Every DB leg above had already run and been
captured before it dropped. The engine was restarted, the stack came back
healthy, `hc_clamd` needed the recorded `docker start` revive, and the
legs that remained (gitleaks, the upgrade leg, the local gate) ran after.

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

## Questions for round 17, with recommended answers

**1. R4/F-10's DB half — was declining it right?** The plan assigns the
finding to **M1 + B3**, but pgTAP 055:453 pins the stage-2 suspect's
interpret `invalid_state` as deliberate machinery in its own message.
M1 therefore takes the finding's other remedy and leaves the whole fix to
6B B3, pinning the DB behaviour as unchanged at 059:13.
**Recommended: CONFIRM.** Absorbing it in `hc.claim_stage` would turn a
settled pin red to satisfy a MINOR finding, and the finding's own text
offers the remedy taken.

**2. The manual-entry seam Q7 opens.** After M2's narrowing a member
below view×5 can CREATE a manual entry (`hc.create_manual_proposal` asks
only for manage over the drafted taint) and can no longer APPROVE it.
**Recommended: narrow `hc.create_manual_proposal` to the same view×5 at
M6**, so the one-gate property covers the one surface that can still
manufacture an undecidable item. It is one predicate in one function and
it makes "you cannot create what you cannot approve" true.

**3. The 23514 class M1 named and did not take.**
`timeline_events.temporal_shape` is a CHECK, so a timeline_event payload
with neither `occurred_on` nor `local_at` still raises a raw
`23514` at a person's click. **Recommended: take it at M6** with the same
guard block, since the property the plan states — no raw Postgres error
at approve — is not fully true while it stands.

**4. Was retiring `arrival_transitions_stage_fkey` the right call?**
D3 argues it at length. **Recommended: RATIFY.** The alternative makes
`hc.claim_stage(arrival, 'review')` legal for any worker and reds 019.

**5. Is `arrival_renditions`' `page_exts text[]` the right shape**, or
should a per-page child table carry the extension? The array keeps the
manifest one write-once row and makes the count/extension agreement a
CHECK; a child table would make "page 3 is missing" a row-level fact.
**Recommended: KEEP the array** — 6B B2 compares the manifest to storage
regardless, and a 200-element bounded array needs no join.
