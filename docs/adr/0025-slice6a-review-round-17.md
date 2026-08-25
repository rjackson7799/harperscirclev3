# ADR-0025 — round-17 dispositions: slice 6A, the Care Inbox database increment

**Status:** **ACCEPTED AS CORRECTED at owner sign-off** (D16, head
`208bda2`) — the dispositions record for round 17, ratified with **one
verdict moved**: F-1 is **FIXED IN PART** with its residue OWED to 6B,
because the sign-off found two raw Postgres classes still reachable at
the approve click and drove both live (D16 S16.2, S16.3). The corrected
tally is **3 FIXED · 1 FIXED IN PART · 1 OWED · 1 ACCEPTED · 1
ACCEPTED-NOTE = 7**. **MERGED at `d59de15`** — a MERGE COMMIT, never a
squash, parents `31a7977` + `4d4e38f`, tree `d9656a63` verified identical
to the branch head's, CI green on `main` at the merge commit (run
`32803716668`), PR #11 closed as merged. The full merge record is D16
S16.11. **M7 closes UNCONSUMED; the bound closes at 6 of ≤ 7.**

**Deciders:** the round-17 dispositions session (owner ratifies at sign-off).

**Date:** 2026-08-24

**Context:** Round 17 reviewed slice 6A on `slice/6-care-inbox`, base
`main` @ `31a7977`, against `docs/review/round-17-packet.md` and
**ADR-0024** (Proposed). One review session, read-only, returned **seven
findings** — 2 MAJOR, 3 MINOR, 2 OBSERVATION — plus a position on all
nine packet questions. Its text landed **verbatim** at
`docs/review/round-17-findings.md` (`97981fd`) before a word of it was
argued here, per the `5faccc4` / ADR-0023 precedent.

**The numbering:** ADR-0024 is 6A's as-built record, so this is ADR-0025 —
the next free number against `docs/adr/` at write time.

**The increment this document authorises:** **M6**
(`20260824120006_disposition_guards.sql`), the reserved dispositions slot.
Q2's bound closes at **6 of ≤ 7** with **M7 UNCONSUMED**.

---

## D0 — how these dispositions were reached, and what it changed

Four rules governed this round. Each changed an outcome.

**1. A finding's ENUMERATION is re-derived, not inherited.** F-1 states
its own limit — *"Medium on the completeness of my own enumeration"* —
and naming that limit is what made re-deriving it obligatory rather than
optional. Re-deriving it found **three more channels than the finding
names**, one of which is a `23502` in the exact class M1 claims to have
closed, sitting one arm over in the same function (D1, S-1). A round that
had taken F-1 at its word would have shipped a guard that closes four
channels and records seven as closed.

**2. A disposition is a RULING, and refining a reviewer's recommendation
IS the ruling.** The review recommends validating *"at the MERGE"*. This
session takes the substance and **amends the placement**, with the
argument in place: at `:478` the destination is not yet known, and
refusing payload keys the arm will never read would narrow APPROVALS
rather than crashes — which is the property that let M1 fit inside a
MINOR finding's slot. The guard lands where the destination IS known.
Agreeing with a recommendation is not the same as executing it.

**3. Severity is the REVIEWER's; a re-grade is argued, never silent.**
One re-grade here: **F-3 is graded UP from OBSERVATION to MINOR** (D4).
The review declined to take it further than an observation because it is
unreachable; this session takes it, on a precedent the review did not
cite — round-15 FINDING 2, pinned in `056`'s own header, where
`hc.list_known_senders` omitted the identical guard, was equally
unreachable, and was fixed *"on the live-actor principle, not on a live
exploit."* The house has already ruled on this shape once.

**4. Scope is declared out loud, not drifted into.** The largest thing
on the table (F-5, the gate) is the one thing this round deliberately
does NOT touch on this branch, and D8 says so at length rather than
leaving the absence to be inferred.

**What the round found that the packet and the review did not.** Five
items, all in D10. The one that matters is S-1.

---

## D1 — ACCEPTED and FIXED: the approve-time payload contract (F-1 MAJOR, packet Q-D)

**The finding.** `p_edits -> 'fields'` is merged into the payload at
`20260824120003:478` **with no type, shape or vocabulary validation at
all**, before every guard in the function, by a caller who need only be
`authenticated` and clear the gates. M1 closed the `23502` class. The
same click still reached `23514 tasks_check` — guarded on the conflict
arm at `:502` and unguarded on the ordinary arm at `:717` — and a
`22P02`/`22007` cast class that `draft_proposal` closes and
`approve_proposal` re-opens.

**Verified, and then extended.** Every channel the review names is real
and each is now driven at `064` with its raw signature quoted in the red
commit (`91fd7a9`). Re-deriving the enumeration against the five
destination tables and every payload-derived expression the function
consumes found **three more**:

| # | Channel | Reachable by | In the review? |
|---|---|---|---|
| 1 | `23514 tasks_check` | an edit supplying `due_on` alone | yes |
| 2 | `23514 temporal_shape` | **a drafted payload, no edit at all** | yes (Q-D) |
| 3 | `22P02` / `22007` — every enum, date, uuid and boolean cast on every insert arm | an edit | yes |
| 4 | **`23502 profile_facts.risk_class` on the CONFLICT arm** | **a drafted conflict, no edit at all** | **no — S-1** |
| 5 | `23503` on a payload-supplied `episode_id` | an edit | no |
| 6 | `22023` / `22P02` through `parents` | an edit | no |

**S-1 is the one that changes what the round can say.** M1's guard block
lives inside `hc.approve_proposal`'s `else` branch (`:541-550`). The
CONFLICT arm has its own guard (`:492-497`) which checks `field`, `value`
and `domain` — and **not `risk_class`**, which `use_new` writes into a
NOT NULL column at `:673`. So the `23502` class ADR-0024 records as
closed was open one arm over, in the same function, **with no edit
required**, and `059`'s header states the property as though it were not.
The failure signature is in the red commit verbatim:

```
have: ERROR:23502:null value in column "risk_class" of relation
      "profile_facts" violates not-null constraint
```

This is the same shape as F-1's own strongest point — one constraint,
one function, two answers depending on the arm — which is what made
looking for it worth the time.

**THE RULING: validate the merged payload where its DESTINATION is known,
in two halves, and state the property with no hedge.**

**The cast half** performs *exactly the casts the insert arms perform*
and converts their failure into `approval_refused`. That is complete by
construction rather than by an enumeration of date formats or a second
copy of an enum's vocabulary — the thing D2's own cast-free ordering
argument was written to avoid. The handler names three data-exception
SQLSTATEs (`invalid_text_representation`, `invalid_datetime_format`,
`datetime_field_overflow`) and **nothing else**, so a defect in the
function still surfaces as itself.

**A blanket catch was considered and REJECTED.** Wrapping the write in a
handler that maps every `22xxx`/`23xxx` to `approval_refused` would be
complete with no enumeration at all — and would swallow genuine defects,
report a bug in this function as a person's bad input, and put a
catch-all where this codebase's every other guard is named and
catalog-derived. The narrower thing is the more honest thing.

**The destination half** mirrors `tasks_check` and `temporal_shape`
clause for clause from `20260815230002:137` and `:183-186`, and tests the
one payload-derived foreign key exactly as the constraint tests it —
circle-consistent, and NOT filtered on `deleted_at`, because the foreign
key is not either.

**NON-BREAKING BY CONSTRUCTION, the M1 argument unchanged**: every
payload refused here would have raised a raw Postgres error a few
statements later. `064` cases 9 and 10 are the controls that drive it the
other way — an edit that SATISFIES the constraint still approves, and
§4.2.3's content edit still edits.

**On placement, against the review's recommendation.** "At the merge" is
right about the *cause* and wrong about the *site*: at `:478` neither
`v_obj_type` nor the conflict outcome is settled, so a guard there would
either refuse keys the arm never reads (narrowing approvals) or defer
the type question anyway. Ordering was checked rather than assumed:
nothing between `:478` and the new block casts a payload value, so no raw
class can fire ahead of it, and every consumer — `hc.own_domain`'s three
casts, the parents loop, all six insert arms — is below it.

**One channel is NAMED and NOT taken.** `{"category": null}` reaches
`hc.own_domain` with a null resolution and raises `own_domain_undeclared`
(P0001) — a *different word* at the same click, not a raw error. It stays.
It is a deliberate, named, fail-closed signal raised by a primitive
shared with `hc.draft_proposal`, and it is the very behaviour Q-C
ratifies as the correct reason `documents.category` and
`timeline_events.kind` are excluded from M1's seven. Converting it inside
`approve_proposal` would require a second copy of two enum vocabularies
in a function that now derives them from the type system. **Recorded
here rather than folded in silently** — the M1 convention, applied to
M1's own successor.

---

## D2 — ACCEPTED and FIXED, and WIDER than any finding: the edit contract

**Not a finding. A consequence of F-1's root cause that the round takes
on its own authority, and the one item in M6 that narrows an APPROVAL
rather than a crash.** It is flagged as such to the owner in D12.

F-1's mechanism is that `p_edits -> 'fields'` bypasses the drafting
contract. Validating values one by one closes the crash classes and
leaves the mechanism. Two payload keys are not values at all:

- **`parents`** drives the taint arithmetic AND the provenance edges.
  `hc.draft_proposal` validates it once — array, ≤ 20, every parent
  resolving in this circle and subject (`20260824120001:105-123`) — and
  `hc.approve_proposal` re-runs none of that after the merge.
- **`manual`** is machinery-declared. `hc.create_manual_proposal`'s own
  comment says it: *"the machinery declares the flag; a caller cannot
  unset it"* (`20260816010006:107`). At approve, an edit could **set**
  it, which nulls `source_arrival_id` at `:650` and **detaches a written
  record object from the arrival it came from**. That sentence was true
  of the drafting path and false here, and it is a record-integrity
  consequence rather than a crash, so no enumeration of error classes
  would have found it.

**THE RULING: `p_edits -> 'fields'` carries CONTENT keys only, from a
closed, fail-closed allowlist.** §4.2.3's edit corrects a value before
you approve; it does not re-author the proposal. Fail-closed because a
payload key added by a later slice should not become editable by
accident — the same posture as `002`'s exact sets.

**It is a narrowing of behaviour and the round says so.** The shipped
suite carries exactly one `p_edits` with a `fields` object
(`054:416`, `{"value":"edited"}`), which is inside the contract, so
nothing in the tree moves. But an interface that today sends `parents`
in an edit would begin to be refused, and that is a real change rather
than a crash-shape change. It is argued on §3.7's own reasoning — the
reasoning M2 was built on — that an interface-only rule is one a second
client does not have.

---

## D3 — ACCEPTED and FIXED: Q-B, the manual-entry seam, in the ladder form

**Taken as recommended by both the packet and the review.**
`hc.create_manual_proposal` authorized on manage-over-drafted-taint alone
(`20260816010006:113`) and asked for no view×5, so after M2 a member
below view×5 could CREATE an entry they could no longer APPROVE. `060`
case 16 pinned that open **on purpose** and carried it here rather than
exempting it on a build session's authority. That was the right call and
this is the disposition it was waiting for.

**The predicate is the LADDER form** —
`hc.visible_at(ctx, subject, hc.all_domains(), true, null, null, null)
>= 'view'` — and not the arrival form, for the reason the review supplies
and this session verified against `hc.visible_at`'s rung order: the
arrival is created in the SAME transaction, so it can carry no
`object_shares` row and rung 5 is dead there. The arrival form would
refuse exactly the same people **and would read as though a share could
rescue it**. Nothing ever can.

**THE COST IS REAL, IS NOT HIDDEN, AND IS THE ROUND'S TO OWN.** This does
not only close a seam — it removes manual entry from every member below
view×5. `024:14` was a GREEN assertion saying Priya (family tier, manage
on `schedule` alone) *can* draft a manual task, and the round **inverts
it**, with the argument written at the site rather than only in a commit
message (ADR-0023 D0 rule 3). Before M2 she could draft AND approve;
M2 took the approve half and said nothing about the draft half.

**The alternative was considered and REJECTED**: exempt manual entries
from the view×5 approve gate. That would make manual entry the one path
that writes to the record without the evidence gate §3.7 exists to
enforce — and Q7 is the ruling that says the gate belongs in the
database. Closing creation keeps one rule; exempting creates two.

`064` case 16 drives the other way: manage×5 implies view×5, so the
coordinator the product actually expects to use manual entry is
untouched. A predicate that refused everyone would satisfy case 14 alone.

---

## D4 — ACCEPTED and FIXED, graded UP to MINOR: D10's liveness asymmetry (F-3)

**The finding, and a correction to its arithmetic.** F-3 says *"Four of
the five ask it of the arrival ROW; two of them never read the row"*,
which does not add up over five surfaces, and its title frames the split
as read-versus-write. The precise statement, re-derived here:

| D10's five surfaces | `visible_at` gate | `deleted_at is null` |
|---|---|---|
| `hc.extractions_for` (`20260824120002:628-631`) | yes | **yes** |
| `hc.receipt_for` (`20260824120005:103-106`) | yes | **yes** |
| `hc.approve_proposal` (`:611`) | yes | no |
| `hc.reject_proposal` (`:298`) | yes | no |
| `arrival_renditions_select` (`20260824120004:118-122`) | yes | no |

**TWO of five carried liveness and THREE did not** — and the third
without it is a READ surface, not a write one, so the split is not
read-versus-write at all. The pattern's source
`hc.log_artifact_read` (`20260821120001:79-82`) carries it, which is what
makes the three omissions omissions rather than choices. The finding is
**larger than stated**, and correcting it is what made it worth taking.

**THE RULING: take it on all three, on the round-15 precedent.** The
review offered a fork — put the check on the write paths, or make D10
state its bound — and leaned to neither. The house has already ruled on
this exact shape: round-15 FINDING 2, recorded in `056`'s own header,
fixed `hc.list_known_senders` for omitting the identical guard, noting it
was *"Currently UNREACHABLE (nothing in the shipped schema writes
`accounts.deleted_at`) — a latent guard, fixed on the live-actor
principle, not on a live exploit."* Nothing writes `arrivals.deleted_at`
either; this session re-checked `supabase/`, `lib/`, `app/` and
`scripts/` and found no writer. Same reasoning, same answer.

The two functions get `hc.log_artifact_read`'s own shape — an `EXISTS`
over `public.arrivals`, so that **zero rows is the one shape** for
nonexistent, foreign, deleted, revoked and below-cliff alike rather than
a second predicate with a second failure mode. The policy gets `ALTER
POLICY` rather than drop-and-create, so there is no window in which the
table is readable without a policy.

**The added clause is provably nothing but liveness**, which is checkable
rather than asserted: the policy's subquery runs as `authenticated` under
`arrivals_select` (`20260816010007:36-43`), whose predicate is the same
circle pre-filter and the same `visible_at` call at `summary` — and the
renditions policy already requires `view`, which is strictly stronger. So
the only thing the `EXISTS` can subtract is `deleted_at is null`.

**D10's sentence is amended in ADR-0024** rather than left to be read as
though it had always been true.

---

## D5 — ACCEPTED-NOTE: Q7's second consequence, and Q7 itself RATIFIED UNCHANGED (F-2)

**The finding is right and the outcome is right.** The added predicate
hardcodes `hc.all_domains(), true`, which makes `hc.visible_at` rung 3 —
*"unresolved or empty lineage: manage on all five, or nothing"* —
unreachable for that call, while the manage check above it still passes
`v_prop.taint_resolved` and can take rung 3. So on an unresolved-lineage
proposal a `care_circle`-tier actor holding manage×5 was allowed by the
old check and is refused by the new one — **and the refusal reason is the
care_circle ceiling (rung 4), not the view×5 ladder.** ADR-0024 D1 says
*"ONE CONSEQUENCE IS RECORDED"* and there are two.

**Q7 IS RATIFIED UNCHANGED, and the reason is that the alternative is
forbidden by Q7 itself.** The predicate is
`hc.log_artifact_read`'s character for character, which is what "it
invents no rule" means. Passing `v_prop.taint_resolved` into it instead
of `true` would make it a *different* predicate from the one the artifact
route enforces — inventing a rule at the moment the ruling says not to.
And the outcome it produces is correct on its own terms: a `care_circle`
actor with no share on the arrival genuinely cannot see the source, which
is exactly what Q7 requires. Rung 5 still rescues one who holds a share.

**What is amended is the RECORD, and it is amended in three places:**

1. **ADR-0024 D1** — two consequences, not one.
2. **`060`'s header** — the same.
3. **`060` case 6's message** — it read *"…and the new predicate did not
   disturb which refusal fires"*, which is true of that fixture, whose
   proposal has RESOLVED lineage and whose actor was already refused
   before 6A, and is not true in general. It now claims only what it
   proves.

**And the general claim is now PINNED rather than only written down.**
`064` cases 17-19 drive the divergence as pure `hc.visible_at` calls on
hand-built contexts — no fixtures, no rows, nothing written — using the
technique the review itself used to reach the finding. A record
correction that leaves nothing behind in the suite is a record correction
that drifts again.

**Latent, and stated as latent.** Nothing in the tree writes
`proposals.taint_resolved` false. `hc.guard_row:48-52` nonetheless
defends the false→true transition, so the database treats false as a
legal state, and the divergence goes live the day anything writes it.

---

## D6 — ACCEPTED and RATIFIED on the round's authority: the ADR-0023 D17 verdict correction (F-6)

**The correction is right and the authority was not the build's.** At
`e0186ce` a 6A build session flipped ADR-0023's D17 R8/F-1 row from OWED
to FIXED. This session re-read all three cited sites —
`app/api/worker/[stage]/route.ts:240-247`,
`tests/routes/worker-stage.test.ts:284`,
`tests/routes/relay.test.ts:145-152` — and the review did the same
independently. The correction is factually right, the OWED tally is
unchanged at 39, it was argued in place, and it was disclosed in the
commit subject and in the packet's "documents that moved after the
evidence head" list. Everything about how it was done is exemplary.

**None of that supplies the authority, and the review is right to say
so.** ADR-0023 is a settled dispositions record. Under ADR-0006's cadence
dispositions are their own session with owner sign-off, and the precedent
"a build session may correct a settled verdict when it is confident the
verdict is wrong" is the shape of every settled-record drift this cadence
exists to catch.

**THE RULING: the correction is RATIFIED, explicitly, here.** It now
rests on the round's authority rather than the build's. ADR-0023's D17
row carries a pointer to this ruling so the two records agree about who
made the change stick.

**THE RULE THIS SETS, stated so the next build session does not have to
guess:** a build session that finds a settled dispositions record wrong
**records the discrepancy where it will be read — the packet, and a
comment at the site — and does not move the verdict.** The next round
rules. The cost of waiting is one stale row for one round; the cost of
not waiting is a record whose verdicts can move between rounds.

---

## D7 — ACCEPTED-NOTE and FIXED: the packet's head ledger and Q-H's number (F-4, F-7)

**F-4 — the ledger names a head that is no longer last, and its PR row is
stale.** Three commits stood after `2f4c4a6`, one of them titled *"the
ledger names its own last commit."* PR #11's head was `874432f`,
17 commits / 23 files, not `9c28f7d` / 16. The facts the stale rows
assert are nonetheless true at the real head — the review confirmed both
CI events at `874432f` independently, and so did this session at its own
head — so this cost the round nothing except the exact thing the
convention exists for. That is R7/F-9's shape, in the packet written to
prevent it.

**FIXED as the review recommends: the ledger states the RULE, not a
SHA.** A packet cannot name its own SHA, so the last row is now a
checkable invariant — *every commit after the evidence head is docs-only,
verify with `git diff --name-only <evidence-head>..HEAD -- . ':(exclude)docs'`
returning empty* — which is true at any future head and cannot go stale.
The PR row names the PR and the base and drops the head SHA and the
commit count, both of which move on every push.

**F-7 — Q-H attributes "5 of ≤ 7" to a plan that says 6 in four places.**
Correct, and the four citations are verbatim (`slice-6-plan.md:926`,
`:1165`, `:1234`, `:1291`). The plan counted M6's dispositions as spent;
the build closed at 5 because M6 was reserved and not yet spent. The
substance — M7 unconsumed, exactly as predicted — was right; the number
attributed to the plan was not.

**FIXED, and the round closes the gap rather than only correcting it:**
M6 is now spent, so **the bound closes at 6 of ≤ 7 with M7 UNCONSUMED**,
which is the plan's own number, reached by the plan's own route.

---

## D8 — OWED to 6B, and the scope decision said out loud: the gate and the serial block (F-5)

**F-5 is ACCEPTED in full, including the part that is worse than the
packet says.** All four spec files are `test.describe.serial`, so a
failure skips every remaining test in its block. The arithmetic
reproduces the packet's three "did not run" counts exactly, which is
independent corroboration that the run accounting is honest. And it
means:

- **`ingestion.spec.ts:361`** failed in run 2 and was skipped in runs 1
  and 3 — **never green at this tree**.
- **`ingestion.spec.ts:400`**, the below-the-cliff tier-visibility leg,
  was skipped in **all three runs** — **it has never executed at this
  tree at all**.

**The round adds one thing to the finding, and it makes it heavier
(S-2).** `:400` is not only "the evidence a reader would most want". It
is the LIVE half of **two coverage rows that are recorded GREEN**:
`UXA-01` (*"below-cliff = zero rows + an empty state that never asserts
the world is empty (probed LIVE from a family-tier session,
e2e/ingestion.spec.ts)"*) and `RLS-10` (*"the below-cliff member's probe
answers the ghost's exact bytes"* — the 404 byte-identity assertion at
`e2e/ingestion.spec.ts:432-434`). Both flipped at 4B on evidence that did
run then. Neither is false. But F12 binds the gate when `supabase/`
moves, and at this head that live half is **unverified**. `docs/coverage.md`
now says so on both rows. A green cell whose live evidence has not been
observed for two slices should not have to be discovered by arithmetic.

**NO FOURTH RUN, and this session did not run one.** The review ruled
against it explicitly and the reasoning holds: three runs produced three
disjoint failure sets, each diagnosed from an independent artifact, and a
fourth can only produce a fourth colour of wrong or a green that would be
read as a verdict. **The gate stands RED**, exactly as the packet and
ADR-0024 report it.

**M6 moves `supabase/`, so F12 re-owes the gate at this head, and the
round says what it is doing about that rather than leaving it implicit.**
M6 replaces `hc.approve_proposal`, `hc.reject_proposal`,
`hc.create_manual_proposal` and one policy. `grep -rn` over `lib/`,
`app/` and `e2e/` for all four names returns **two comments in
`app/api/worker/[stage]/route.ts` and zero call sites**. The review
screen is 6B. So M6 has no code channel to any of the 29 legs, by the
same evidence the packet used for the five migrations before it — and
re-running a RED gate to re-observe that it is red is the fourth run
under another name.

### THE DECISION THIS SESSION OWNS: the suite repairs land at 6B, not here

Ruled deliberately, and it is a ruling against the tempting thing.

**1. The branch's zero-code-channel property is load-bearing for the
round's own conclusion.** `git diff --name-only 31a7977..HEAD` touches
nothing under `app/`, `lib/` or `e2e/`. That fact is the argument in the
packet, in the findings, and in this document for why a RED gate does not
block a DB increment — and the review verified it *independently, by
running that diff itself*. Repairing `e2e/` here destroys the property,
and destroys it retroactively for the verification the round already
rests on.

**2. A repair landed here could not be shown green.** Verifying a suite
repair requires a gate run. The round ruled against a fourth run. So
landing repairs here means either shipping unverified suite edits into a
merge, or forcing the run the round just refused. **This alone settles
it.**

**3. The 6A/6B split is an owner ruling (Q1), not a build convenience.**
6A is the DATABASE increment; `e2e/` is app-layer. Moving app-layer work
into 6A is a plan amendment, and amendments are the owner's.

**4. These are not one-line repairs.** `:361` has ALREADY been reworked
once to be deterministic — its own comment at
`e2e/ingestion.spec.ts:355-360` explains how — and it still lost a 108 ms
window on a 1500 ms poll. A leg that has defeated one repair needs a unit
with its own red leg, not a patch smuggled into a dispositions commit.

### What is OWED, and what "done" means

Queued to **6B** as an owed item with acceptance conditions. It is a
queue entry, not a new B-row: **B1, the rasterizer swap, keeps its
plan-bound first position**, and the 6B kickoff places this alongside it.

1. **The blast radius first, ranked above the two named legs.**
   `test.describe.serial` converts every fragile leg into a coverage hole
   for everything behind it. Any repair that fixes `:361` and `:102`
   without addressing that leaves the next fragile leg free to hide the
   same seven tests. The requirement is the property, not a mechanism:
   **no failing leg may prevent another leg from executing.** How — split
   the block, make the specs independent, reorder — is 6B's call.
2. **`:361`** drives `/api/worker/extract` itself rather than racing the
   worker.
3. **`:102`** stops depending on browser session state left by another
   spec file.
4. **`reuseExistingServer: false`** for the gate — a config footgun that
   surfaces as a product-sounding string three layers from its cause, and
   which produced an INVALID run rather than a flaky one.
5. **The acceptance condition, which is the review's own and is cheaper
   than a fourth full run:** once the repairs land, execute `:361` and
   `:400` **directly by title**, so both are observed at least once, and
   record that as a **targeted run** rather than as a gate result.
6. **The round-18 packet may not report a gate result for
   `e2e/ingestion.spec.ts` until `:400` has been observed executing**,
   and must state the two coverage rows' live halves as re-verified or
   still owed.

---

## D9 — the nine packet questions, ruled

**Q-A · R4/F-10's DB half was DECLINED — CONFIRM**, and on the review's
stronger reason rather than the packet's. The packet argues that the only
DB remedy would red a settled pin (`055:453`, `059:13`), which is true.
The decisive point is one the packet leaves in a footnote: **the plan's
M1 row already states an app-layer remedy** — *"`processGate`'s shape,
applied to `processInterpret`"* (`slice-6-plan.md:920`) — so there was no
DB work in the row to decline. And there is no separate DB channel to
write a defect signal into: `invalid_state` **is** the defect signal by
this codebase's own convention (`20260816010004:84` comments it as such),
so "absorb it explicitly" in the database would mean changing what the
signal says, not adding one. The finding belongs wholly at 6B B3, where
it remains owed.

**Q-B · TAKEN at M6, in the ladder form.** See D3, including the cost.

**Q-C · RATIFY the guard's SCOPE. DO NOT ratify the property sentence.**
The enumeration is right — re-derived from `pg_attribute` by the review
and again here — and excluding `documents.category` and
`timeline_events.kind` is correct, because `hc.own_domain` fail-closes on
a null resolution with a P0001 rather than a `23502`. Non-breaking by
construction is sound and `059:11` is a real positive control. **But the
sentence "23502 can never surface as a raw Postgres error at the moment a
person clicks approve" was false in two directions at once**: it
understates the classes (F-1) and it overstates its own class (S-1, the
conflict arm). ADR-0024 is amended on both counts, and after M6 the
sentence is true as written for the first time.

**Q-D · TAKEN at M6, and NOT as one CHECK.** See D1. Taking it as a
single `temporal_shape` guard would have closed one of six channels while
the record said the class was closed — which is the settled-record error
this cadence exists to catch, committed by the very fix meant to prevent
it.

**Q-E · RATIFY the retirement of `arrival_transitions_stage_fkey`, and
RECORD the pattern departure (NOTED).** All three premises hold and the
review re-derived each: `hc.claim_stage` looks the budget up by name and
proceeds (`20260816010004:50-53`), so seeding `review` really would make
`hc.claim_stage(arrival, 'review')` a legal call for any `hc_pipeline`
worker; `entry_state` really is `not null unique`; `019:104` really pins
`hc.stage_budgets` as exactly the five §4.3 stages; and nothing anywhere
joins `arrival_transitions` to `stage_budgets`, so the FK's removal
strands no consumer. **The invariant really did stop being true.**

The review's addition is accepted and recorded: D3 presents a binary —
seed the worker table, or retire the FK — and there is a third option it
does not consider. A small closed stage-vocabulary table that BOTH tables
reference would keep referential integrity and keep the vocabulary
enumerable by query, and it is **this repo's own shipped pattern**:
`hc.reason_codes`, `hc.log_event_types` and `arrival_transitions` itself
are all seeded lookup tables, and the migration that created
`arrival_transitions` names the pattern in its own comment
(`20260816010009:42-43`). A CHECK is not enumerable, and adding a sixth
stage is now a constraint drop-and-add rather than an insert.

**NOTED rather than taken.** Building a vocabulary table now would be
new DDL for a change nobody has asked for, in a slot reserved for
dispositions, to fix an ergonomic rather than a defect. **The condition
under which it becomes the right shape is stated instead: the next time a
stage is added or the stage vocabulary needs to be read by query, that is
the migration that builds the table** — and the next author should not
read the inline CHECK as house style. Recorded in ADR-0024 D3.

**Q-F · KEEP the array — CONFIRM.** The constraints do the work the
answer claims: `page_count between 0 and 200`,
`cardinality(page_exts) = page_count`, `page_exts <@ array['png','jpg']`,
RLS enabled AND forced, and the read policy carrying the same arrival
gate as the pages. A child table buys row-level "page 3 is missing" that
6B B2 gets from the storage comparison anyway. (The policy's predicate
gains liveness at M6 — D4 — which does not touch this question.)

**Q-G · CONFIRM the framing.** The bound is stated honestly and stated in
the migration where a reviewer can check it, and the review did check it:
each destination is looked up through its own policy predicate reproduced
from `20260815230002:290-333`, `deleted_at is null` included,
`profile_facts` at `view` where the other four read `summary`,
`owner_member_id` passed for tasks. `063:5-6` drive it both ways. **The
packet's own note is the important half and is carried forward as OWED:
RCP-01's app half must not over-claim at 6B.**

**Q-H · CONFIRM, with the count corrected.** See D7. Five were spent at
the packet's head; **six are spent now**, with M7 UNCONSUMED — which is
what the plan predicted in four places.

**Q-I · THE GATE IS RED, under both readings, and the round dispositions
the SUITE.** See D8, including the scope decision and the six acceptance
conditions. The packet's refusal to use run 1's reclassification to
upgrade the colour is right and is the posture this round endorses. One
thing the round records in the packet's favour, because the review is
right that it is worth saying: **"three disjoint failure sets" is
corroborated by mechanism, not merely asserted** — the serial-block
semantics reproduce all three "did not run" counts exactly, which means
the run accounting is honest even where the conclusion drawn from it was
incomplete.

---

## D10 — what this round found that the review and the packet did not

Recorded separately so it is not read as the review's work, and so the
next round can see what a dispositions session is for.

- **S-1 · A `23502` in the class ADR-0024 records as CLOSED**, on
  `hc.approve_proposal`'s conflict arm, reachable with no edit at all.
  Fixed at M6, driven at `064:5`. **D1.**
- **S-2 · Two GREEN coverage rows rest on a leg that has never executed
  at this tree.** `UXA-01` and `RLS-10` both name
  `e2e/ingestion.spec.ts:400`'s live probe. Annotated on both rows;
  carried into D8's acceptance conditions. **D8.**
- **S-3 · F-3's own arithmetic is wrong, and the finding is bigger than
  it says.** Two of D10's five surfaces carry liveness, not four; three
  lack it, and the third is a READ surface, so the asymmetry is not
  read-versus-write. **D4.**
- **S-4 · A provenance channel with no error class.** An edit setting
  `manual` detaches a written record object from its source arrival —
  falsifying `hc.create_manual_proposal`'s own comment. No enumeration of
  raw error classes would have found it. **D2.**
- **S-5 · `059`'s header miscounts the property it pins**: "SIX" over a
  list of seven, and "shipping five" where the arithmetic is six.
  ADR-0024 and the packet both say seven. Corrected at the site, with the
  scope amendment beside it.

---

## D11 — `docs/coverage.md`

**No row flips on a disposition** (the ADR-0023 D19 rule: a disposition
records what a layer proves, and M6 proves nothing new about a product
criterion — it removes ways for a person's click to crash). What moves is
annotation:

- **`REV-01` / `DEC-01`** gain the M6 property in their pgTAP halves: the
  approve-time payload contract and the edit contract, with `064` named.
- **`MNL-01`** gains Q-B's narrowing and its cost — manual entry now
  requires view×5 — because a reader of that row must not be surprised by
  it at 6B.
- **`UXA-01` and `RLS-10`** are annotated with S-2: green from 4B, live
  half **not observed at the 6A head**, owed at 6B under D8.
- The `## 6` section header records the bound closing at 6 of ≤ 7.

---

## D12 — what the owner is being asked to decide

1. **Ratify these dispositions**, and with them ADR-0024 **as amended**
   (D1's property sentence, D1's ONE CONSEQUENCE, D3's pattern
   departure, D10's liveness, the bound at 6 of ≤ 7).
2. **The one behaviour narrowing that is not a crash fix: D2's edit
   contract.** Everything else in M6 converts a raw Postgres error into
   `approval_refused` or closes an unreachable latent gap. D2 refuses
   edits that today succeed. Nothing in the tree sends one; a future
   client could. Named here so ratification is informed rather than
   implied.
3. **D3's cost: manual entry now requires view×5.** A below-cliff member
   loses it entirely rather than losing only the approve half M2 took.
   The rejected alternative — exempting manual entry from the approve
   gate — is on the record in D3 if the owner prefers it.
4. **D8's scope decision** — the suite repairs land at 6B and this branch
   keeps its zero-code-channel property. If the owner wants them here
   instead, that is a plan amendment AND it re-opens the fourth-run
   question, because a repair that cannot be run cannot be shipped.
5. **D6's rule for build sessions**: record a settled-record discrepancy,
   do not correct it; the next round rules.
6. **M7 stays CLOSED.** It was not needed and was not touched.

Nothing here activates anything. Proposals still rest at `pending`, G9
stays OPEN, `BAND_ARTIFACT_ALLOWLIST` stays EMPTY, G3/G4/G7 still block,
no credential exists in CI or the gate, and **zero dependencies were
added** — the dev reserve is unspent through a third slice.

---

## D13 — every finding, dispositioned

Verdicts, per ADR-0023's vocabulary: **FIXED** (red→green on this branch)
· **OWED** (accepted, argued, scheduled, not fixed here) · **OWNER**
(escalated) · **ACCEPTED-NOTE** (accepted as a record correction; no code
change) · **DECLINED** (with the argument) · **NOTED** (a verified
positive or an observation needing nothing).

Severity is the **reviewer's**. The one re-grade is argued in D4.

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | MAJOR | **FIXED** → **FIXED IN PART** (D16) | The mechanism, the reachability and all three named channels verified; the enumeration re-derived and found short by three, one of which (S-1) is a `23502` in the class M1 records as closed. Closed at the destination rather than at the literal merge, with the placement argument in D1. Red `91fd7a9` → green `b324e95`. One channel NAMED and not taken: `own_domain_undeclared`, with the reason. |
| F-2 | MINOR (latent) | **ACCEPTED-NOTE** | The divergence is real and reproduced. Q7 RATIFIED UNCHANGED — passing `v_prop.taint_resolved` would make it a different predicate from `hc.log_artifact_read`'s, which is the rule-inventing Q7 forbids. Record amended in three places, and the general claim is now PINNED at `064:17-19` rather than only written down. |
| F-3 | OBS → **MINOR** | **FIXED** | Graded UP with the argument (D0 rule 3): the round-15 FINDING 2 precedent already settled that an unreachable liveness omission is fixed on principle. Taken on all three surfaces. The finding's own arithmetic is corrected and the asymmetry is larger than stated (S-3). D10's sentence amended in ADR-0024. |
| F-4 | MINOR | **FIXED** | Mechanical and correct; the facts it asserts are true at the real head, which the review and this session each confirmed independently. Fixed as recommended — the ledger states a checkable RULE instead of a SHA, and the PR row drops the two fields that move on every push. |
| F-5 | MAJOR | **OWED** (6B) | Accepted in full, and made heavier: `:400` is the live half of TWO green coverage rows (S-2), now annotated. No fourth run — the review's ruling, endorsed. The scope decision is D8's and is ruled against landing repairs here, on four arguments of which the second is decisive. Six acceptance conditions, the blast radius ranked first. |
| F-6 | MINOR | **ACCEPTED** | Ratified explicitly on the round's authority, all three sites re-read here as well. The rule it sets for build sessions is stated in D6 so the next one need not guess. ADR-0023's D17 row carries a pointer back. |
| F-7 | OBS | **FIXED** | Four verbatim citations, all correct. Corrected as recommended AND closed: M6 is spent, so the bound is now 6 of ≤ 7 — the plan's own number by the plan's own route. |

> **CORRECTED AT SIGN-OFF (D16 S16.7).** F-1's verdict moves to **FIXED
> IN PART · residue OWED (6B)**: the six channels this table's argument
> enumerates are closed and driven at `064`, but the CLASS is narrowed
> rather than closed — two more are reachable at the approve click and
> both were driven live at `208bda2`. The original row and its argument
> are preserved above; the corrected tally is **3 FIXED · 1 FIXED IN
> PART · 1 OWED · 1 ACCEPTED · 1 ACCEPTED-NOTE = 7**. F-3's verdict does
> NOT move — S16.4 corrects D4's argument, not its fix.

**Tally, mechanically from the table: 4 FIXED · 1 OWED · 1 ACCEPTED ·
1 ACCEPTED-NOTE = 7.** Zero DECLINED, zero OWNER-escalated, zero
BLOCKER. Every finding was taken in some form; none was accepted without
an argument this session could make on its own.

**The nine questions: 5 CONFIRM (Q-A, Q-F, Q-G, Q-H, Q-I) · 2 TAKEN at
M6 (Q-B, Q-D) · 2 RATIFIED with an amendment (Q-C's scope with its
property sentence amended; Q-E's retirement with the pattern departure
recorded).**

**The slice-5B queue is unchanged at 39 OWED**; nothing in this round
moves it. F-5 and Q-G's RCP-01 note are added to the **6B** queue, along
with R4/F-10 (Q-A), which was already there.

---

## D14 — evidence at ONE declared head

**Evidence head: `b324e95`** — the last commit that moves a non-docs
tree. Every leg below was produced at that tree.

**F12 tree binding, per directory, between the evidence head and this
document's head:** `supabase/` **unchanged** · `app/` **unchanged** ·
`lib/` **unchanged** · `e2e/` **unchanged** · `scripts/` **unchanged** ·
`tests/` **unchanged** · `docs/` **moved**. The rule, so this is
checkable at any later head rather than only at the one it was written
at: **every commit after the evidence head is docs-only** — verify with
`git diff --name-only b324e95..HEAD -- . ':(exclude)docs'` returning
empty.

- **Clean leg:** `npm run db:reset` →
  `node scripts/verify-migration-state.mjs supabase/migrations` →
  `migration state exact: 68 applied == supabase/migrations` →
  `npm run test:db` → `All tests successful. Files=65, Tests=1610 …
  Result: PASS` → `npm run test:concurrency` →
  `75/75 concurrency assertions passed` (teed; zero `NOT OK`) →
  `npm run db:verify` → `No schema errors found` (hard gate,
  `--fail-on warning`).
- **Upgrade leg (the `ci.yml` rehearsal, run locally):** worktree @
  `31a7977` → base reset → verifier exact **62 == 62** →
  `npx supabase migration up` (the six 6A migrations, in order) →
  verifier exact **68 == 68** → `test:db`
  `Files=65, Tests=1610 … Result: PASS` → `test:concurrency` **75/75** —
  against the UPGRADED database; worktree removed. It matters again this
  increment: M6 replaces three functions whose earlier definitions are
  applied first in this path and are never applied at all in a
  from-scratch reset.
- **vitest:** `Test Files 64 passed (64) · Tests 689 passed (689)` —
  unchanged, because M6 authors no app-layer unit.
- **lint · typecheck · production build:** all clean
  (`✓ Compiled successfully in 19.1s`).
- **gitleaks** (the digest-pinned image `ci.yml` uses, run identically):
  `382 commits scanned` · `no leaks found`.
- **Local gate (browser truth, LOCAL-only): RED, unchanged, and NOT
  RE-RUN.** See D8 for the full argument: the round ruled against a
  fourth run, M6 has no code channel to any of the 29 legs
  (`grep -rn` over `lib/`, `app/`, `e2e/` for all four M6 objects returns
  two comments and zero call sites), and re-running a RED gate to
  re-observe that it is red is the fourth run under another name.

**One unreproduced transient, recorded as such and NOT claimed as
diagnosed.** A first full `vitest` run failed one test —
`tests/lint/a11y-fence.test.ts`, *"Test timed out in 30000ms"*. The file
passes alone in **5.98 s (6/6)** against a 30 s budget, and the full
suite passes clean on re-run (**689/689**). It is the same shape as the
transient 6A recorded on `tests/lint/db-fence.test.ts` and it is recorded
the same way: a timeout under load, not a diagnosis.

**One environment failure, recorded because it interrupted the session.**
Docker Desktop's Linux engine wedged mid-run: every bind mount failed
with `mkdir /run/desktop/mnt/host/c: file exists`, which is not specific
to the Supabase CLI — a bare `docker run -v` reproduced it. `docker
desktop restart` hung in `starting` for ~20 minutes; the fix was killing
the Docker processes, `wsl --shutdown` (the `docker-desktop` distro was
the only one, and already Stopped) and relaunching. The stack came back
healthy, `hc_clamd` needed the recorded `docker start` revive, and every
leg above ran after. **No leg was captured before the wedge**, so nothing
here is evidence from a broken environment.

**CI on the runner, BOTH events, read by this session from the public
Actions API, unauthenticated** (the round-8 convention). `gh` is
unauthenticated here and device-flow is out of bounds, so these are read
anonymously at the SHA, never taken from a badge:

· **push** run **32791520674** @ `f291a01` — **success**
· **pull_request** run **32791524619** @ `f291a01` — **success**

Both `completed`; neither pending. `f291a01` is the head that carries
ADR-0025 and the four amended records; the evidence head `b324e95` is two
commits behind it and binds by the docs-only rule above. Secret scanning,
service-role containment, the schema pin, the clean reset, the exact-state
verifier, pgTAP, concurrency, `db:verify` under `--fail-on warning`,
vitest, the G9 generator check, the FULL upgrade rehearsal with M6 in the
chain, lint and typecheck all green on the runner.

**PR #11**, read from the public PR API at the same moment: **open**, not
merged, base `main`, head branch `slice/6-care-inbox`, **DO NOT MERGE
without owner sign-off** in the title and the body. Following F-4's own
lesson, this row names the PR and the base and not the head SHA or the
commit count, both of which move on every push. GitHub's "Able to merge"
is mechanical — it means no conflicts, not that ADR-0006 is satisfied.

**CI DOES NOT RUN THE BROWSER GATE**; a green badge on PR #11 is not
evidence about the gate, which is RED.

*(This section names its own commit's parent, not itself: a document
cannot name its own SHA. The commit that adds this section is docs-only
and its own two runs are the last word — verifiable by the rule above.)*

---

## D15 — the standing pins and traps this round did NOT move

Stated so silence is not read as coverage.

- **Exact-set pins `001`, `002`, `007`, `023`, `027`, `055`, `056` did
  not move**, and that is a fact rather than an omission: M6 adds no
  function, no signature, no grant, no enum value, no transition and no
  `hc_internal` policy. It replaces three existing functions and alters
  one `authenticated` policy. `002`'s SECURITY DEFINER set stays at
  seventy-two and its `hc_internal` policy list at one hundred three.
- **`hc.revise_object` and the step-up path were NOT audited against
  D1.** The review names this gap explicitly and this session did not
  close it: they carry their own copies of the record-table inserts, and
  whether the payload contract belongs there too is a real question this
  round did not answer. **Queued to 6B** with F-5.
- **The browser gate was not run** and no fourth run was ordered.
- **Runs 1-3's classifications** are the packet's, corroborated by
  mechanism (D9, Q-I), not reproduced.
- **The e2e fixture code** was read for structure only.

---

## D16 — THE OWNER SIGN-OFF: the rulings, and the three defects the sign-off found in THIS document

**Session:** the round-17 owner sign-off, ADR-0006's cadence, the
ADR-0021 S1–S4 / ADR-0023 D24 shape. **Head signed off: `208bda2`.**

**A sign-off that rubber-stamps is worthless.** ADR-0023 D24 found four
defects inside the round-16 dispositions document itself and that is the
bar this session was held to. It attacked the five places D12 and the
session brief name as most likely wrong, re-derived D2's allowlist and
D1's cast set from the artifact rather than reading the dispositions
back, and drove every claim it could reach against the shipped database.

**What it could run, and what it wrote.** No peer session held the tree
(the only live `node.exe` was Adobe Creative Cloud's — the recorded false
positive), and the 68-migration stack was healthy. Every probe below ran
inside a transaction that ends in `ROLLBACK`: **the sign-off wrote
nothing, moved no migration and reset no database.** Nothing under
`supabase/`, `app/`, `lib/`, `e2e/`, `scripts/` or `tests/` moved in this
session, so D14's legs bind unchanged and were not re-run for show.

---

### S16.1 — the five places attacked, and what HELD

Stated first, because a clean area reported clean is a result and because
what held is most of the round.

**D2's edit-key allowlist is EXACTLY RIGHT — re-derived, not read back.**
The allowlist at `20260824120006:211-219` was ignored and the closed set
was rebuilt from the six insert arms (`:530`, `:549`, `:561`, `:574`,
`:585`, `:601`, `:622`) and from `hc.draft_proposal`
(`20260824120001:85-191`). The independent derivation is **21 content
keys**; D2's list is **21 keys**; they are the same 21. **No key is
wrongly omitted and none is wrongly included.** Three further checks the
brief asked for:

- `manual` and `parents` are correctly ABSENT, and the two the D2 prose
  does not name — `source_extraction_ids` and `anomaly_flags` — are also
  correctly absent (S16.5).
- `risk_class` is in the list, so an edit can set it; the drafting
  contract's vocabulary check (`20260824120001:158-161`) is **not**
  re-run at approve, but `hc.risk_class` is exactly
  `{standard, high}` at the catalog, so the enum cast closes precisely
  what drafting closed. No gap.
- Editing `domain` **cannot lower the authorization bar**. `v_taint` is
  `hc.taint_union(v_own_arr, v_prop.taint, v_ptaint)` (`:434-435`), and
  the drafted taint is inside that union — so an edited domain can only
  ADD to the set the manage check runs against, never subtract.

**D1's destination half is exact, both directions.** `tasks_check` and
`temporal_shape` are mirrored clause for clause from
`20260815230002:137` and `:183-186`; the episode reference is tested
exactly as the constraint tests it — the catalog reads
`FOREIGN KEY (circle_id, episode_id) REFERENCES episodes(circle_id, id)`
and the guard tests `e.circle_id = v_prop.circle_id and e.id = …`,
unfiltered on `deleted_at` because the foreign key is not either. It is
the **only** payload-derived foreign key on any insert arm — the other
two references (`supersedes_id`, `artifact_arrival_id`) are function-
derived, not payload-derived. Excluding the conflict arm is right: its
`keep_both` guard has tested the due pair since 5A M4 (`:250-254`).

**D1's ordering claim holds for the region it names.** Nothing between
the merge at `:223` and the cast block at `:317` casts a payload value —
re-read expression by expression. Every check in that region is
`is null`, `length`, `jsonb_typeof` or an enum-column cast on
`v_prop.kind`.

**D15 is verified, not accepted — and against the catalog rather than the
prose.** M6's complete DDL is three `create or replace function` on
EXISTING signatures, their owner/revoke/grant restatements (the 2A M8
way — restating, not adding), and one `alter policy`. No new function, no
new signature, no new grant, no new enum value, no new transition, no new
`hc_internal` policy. At the live 68-migration database: **SECURITY
DEFINER in `hc` = 72** and **`hc_internal` policies = 103**, which are
`002`'s two pinned numbers unchanged. And the file-level claim is true as
scoped: `git diff --name-only 97981fd..b324e95` — M6's own red→green
pair — touches the migration, `024`, `059`, `060` and `064` and **none of
the seven pin files**.

**D8's scope ruling is UPHELD, and both of its mechanical claims re-ran
clean at THIS head.** `git diff --name-only 31a7977..HEAD` is 14
`supabase/tests`, 6 `supabase/migrations`, 1 `scripts/concurrency`, 7
`docs` — **nothing under `app/`, `lib/` or `e2e/`**. And M6's four
objects across `app/`, `lib/`, `e2e/` return **two comments in
`app/api/worker/[stage]/route.ts:521` and `:550`, and zero call sites** —
no `.rpc(` by string either. D8's second argument is the decisive one and
it is correct: a suite repair landed here could not be shown green
without the fourth run the round refused, so landing it would mean
shipping unverified suite edits into a merge. Upheld.

**D3 is cleanly executed.** The LADDER form shipped
(`20260824120006:939-940`), not the arrival form; `024:14` was inverted
with the argument written **at the site** rather than only in a commit
message; and `024:16`'s exact count moved 3 → 2 **in the same commit as
the change that forced it**, which is the discipline rule honoured rather
than cited.

**D13's arithmetic is internally correct** as the round wrote it:
4 + 1 + 1 + 1 = 7, and 5 + 2 + 2 = 9.

---

### S16.2 — DEFECT 1, and it MOVES A VERDICT: D1's cast half is short by one expression, and the gap is driven by an ALLOWLISTED edit key

**D1 rules that the cast half performs *"exactly the casts the insert
arms perform"* and is therefore *"complete by construction rather than by
an enumeration"*. Checked expression by expression, both directions, the
claim is true of the insert arms and the property it is offered for is
false — because one payload-derived cast is not on an insert arm.**

`hc.approve_proposal`'s conflict branch casts the payload's `domain` in
the TAINT MATH, for every outcome:

```sql
    v_own_arr := case when v_payload ->> 'domain' is not null
                      then array[(v_payload ->> 'domain')::hc.domain]     -- :421
                      else '{}'::hc.domain[] end;
```

The cast block casts `domain` **only under `v_outcome = 'use_new'`**
(`:320-323`). Under `keep_both` it casts `(v_task ->> 'due_on')::date`
and nothing else; under `keep` it casts nothing. The destination half is
fenced by `if v_prop.kind <> 'conflict'` (`:368`) and never runs. So on
the conflict arm, `:421` is reached with an uncast payload value.

**`domain` is in D2's own allowlist**, so an edit drives it. Driven
against the shipped database, rollback-only, with the raw signature:

```
A · conflict keep_both, edit sets a bogus `domain` (an ALLOWLISTED key)
    ERROR:22P02:invalid input value for enum hc.domain: "bogus"

A2 · CONTROL, same shape, a REAL domain — still approves
    {"status": "edited_approved", "outcome": "keep_both",
     "object_type": "task", "arrival_state": "proposals_ready"}
```

The control is what makes it a defect rather than a refusal: the path is
otherwise fully live and ends in a written record object.

**And it does not need an edit.** `hc.draft_proposal`'s conflict branch
(`20260824120001:125-131`) requires non-empty `parents` and **returns
before the `own_domain` cast at `:153`** — a conflict payload's `domain`
is never validated or cast at draft time. So a conflict resting at
`pending` with a malformed `domain` raises the same class under **every**
outcome, `keep` included, with no edit at all:

```
drafted conflict, malformed `domain`, outcome KEEP, NO EDIT AT ALL
    ERROR:22P02:invalid input value for enum hc.domain: "bogus"
```

**That is S-1's shape exactly, one expression over from S-1's own site** —
a raw class on the conflict arm, reachable with no edit, in the function
the round had just finished re-deriving.

**Why the round missed it, in the round's own words.** D1's ordering
paragraph enumerates what sits below the guard as *"`hc.own_domain`'s
three casts, the parents loop, all six insert arms"*. The conflict
branch's `v_own_arr` cast is in none of those three sets: it is not
`hc.own_domain` (that is the `else` branch, `:428-431`), not the parents
loop, and not an insert arm. The cast set was derived from the INSERT
ARMS and the enumeration inherited that frame — which is D0 rule 1's own
failure mode, committed by the disposition written to apply it.

**The suite could not have caught it.** `064` drives conflicts at
`use_new` only (`:339`); there is **no `keep_both` case in the file at
all**. The one arm whose cast coverage is incomplete is the one arm the
new pgTAP file does not exercise.

**It fires BEFORE the authorization boundary.** `:421` sits above the
manage check (`:437`) and the M2/M6 arrival gate (`:472-479`), so the
refusal an unauthorized caller would otherwise get is replaced by a
Postgres error. No privilege is crossed and nothing is written — the
transaction aborts — so the user-visible consequence is the same
MINOR-shaped one F-1 itself was graded on. It is recorded at its true
size and no larger.

---

### S16.3 — DEFECT 2: D2's edit contract fences `p_edits -> 'fields'` and leaves its siblings unvalidated

`p_edits` is caller-supplied `jsonb` and D2 closes exactly one of its
keys. A sibling key is cast without validation:

```sql
     and coalesce((p_edits -> 'confirm_high')::boolean, false) is not true then   -- :500
```

`jsonb -> boolean` raises on any non-boolean. Driven on a high-risk
proposal held by an authorized approver, rollback-only:

```
B · high-risk proposal, p_edits.confirm_high is a jsonb STRING
    ERROR:22023:cannot cast jsonb string to type boolean
```

`22023` is a class D1's table does not name. This is **pre-existing and
not introduced by M6** — so were all six channels D1 enumerates. It is
recorded because D1's table is offered as an enumeration of what a
person's click can still reach, and it is short by this one. Every
`confirm_high` in the shipped suite is a proper boolean (`013:336`,
`054:224/278/286/395/404`), so nothing in the tree is red and no pin
moves.

`conflict_outcome`, the other top-level key, is clean: it is read with
`->>` and vocabulary-checked at `:116-119` before any row is written.

---

### S16.4 — DEFECT 3: D4's equivalence claim is FALSE as stated, and it is the kind of claim D4 says is checkable

**D4 rules:** *"the only thing the `EXISTS` can subtract is
`deleted_at is null`"*, on the ground that the subquery runs under
`arrivals_select` at `summary` while the renditions policy already
requires `view`.

**Tested rather than accepted, and it does not hold.** The two predicates
do not read the same subject. `arrivals_select`
(`20260816010007_ingestion_rls.sql:37-45`) tests `hc.visible_at(…, a.subject_id, …)` — the
**ARRIVAL's** subject. `arrival_renditions_select`
(`20260824120006:971-978`) tests `hc.visible_at(…, subject_id, …)` — the
**MANIFEST's** subject. The composite foreign key pins only the circle:

```sql
foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade,
foreign key (circle_id, subject_id) references public.subjects  (circle_id, id)
```

Nothing ties `arrival_renditions.subject_id` to `arrivals.subject_id`.
And `hc.visible_at` never reads the arrival row — `p_object_id` feeds
rungs 4 and 5 only (`20260816120006:73-86`) — so it cannot supply the
tie either. Driven, rollback-only, on a manifest whose subject differs
from its arrival's:

```
the renditions clause on the MANIFEST subject S2  -> view      (passes)
the arrivals clause on the ARRIVAL  subject S1    -> hidden    (fails)
arrivals visible to Mira                          -> 0
THE TEST: manifest rows visible to Mira under M6  -> 0
CONTROL: arrivals visible to the owner (manage×5) -> 1
```

Before M6 that manifest was visible — the pre-filter passes and the
`view` clause returns `view`. After M6 it is not. **The `EXISTS`
subtracted a row on a ground that is not `deleted_at is null`.**

**Latent, safe in direction, and recorded at that size.** The only writer,
`hc.write_rendition` (`20260824120004:179-188`), copies `a.subject_id`
from the arrival, so no shipped row can carry a mismatch. The change is a
NARROWING, so it can hide a manifest and can never reveal one — **no
privilege is crossed and F-3's fix is not in question.** What is wrong is
the ARGUMENT: D4 offers a proof and the property it rests on is enforced
by a single writer's discipline, not by the schema. That is S-3's shape —
a claim stated more strongly than the artifact supports — in the
disposition that found S-3.

---

### S16.5 — two record corrections, neither of which moves a verdict

**S16.5a · D2's machinery-key list is short by two.** D2 names `parents`
and `manual` as the keys an edit must not re-author. `hc.draft_proposal`
validates two more payload keys that `hc.approve_proposal` never
re-validates: **`source_extraction_ids`** (≤ 200, every id belonging to
THIS arrival, `20260824120001:166-175`) and **`anomaly_flags`** (≤ 20,
`:177-181`). Both are correctly excluded from the allowlist and both are
inert at approve — they are stored in their own columns and the approve
path never reads them from the payload — so the exclusion is right and
costless. The ruling is unaffected; the count in the prose is not four.

**S16.5b · D15's sentence is true of M6 and false of the branch.**
*"Exact-set pins `001`, `002`, `007`, `023`, `027`, `055`, `056` did not
move"* — **all seven moved on this branch**, at M1–M5. D15's heading
scopes it (*"this round"*) and M6's own pair moves none of them, so the
claim is right as scoped and wrong as quoted. Stated here because a
sentence that survives being lifted out of its heading is the kind that
becomes a settled-record error two rounds later.

---

### S16.6 — THE RULINGS, recorded verbatim

**RULING 1 — on D12(1), ratification.**
*The round-17 dispositions are **RATIFIED AS CORRECTED**. Every finding's
disposition stands as argued except F-1's verdict, which moves to FIXED
IN PART with its residue OWED to 6B (RULING 7). ADR-0024 is **RATIFIED
AS AMENDED**, and its round-17 amendment list is SHORT BY ONE: a sixth
site is added at the sign-off for the closing sentence of amendment site
1, which claims a property the sign-off has falsified.*

**RULING 2 — on D12(2), D2's edit contract, the one narrowing of an
APPROVAL.**
*The edit contract is **RATIFIED AS SHIPPED**. §4.2.3's edit corrects a
value; it does not re-author the proposal, and `parents` and `manual` are
correctly outside it — `manual` most of all, because an edit that set it
detached a written record object from its source arrival and no
enumeration of error classes would have found that. The allowlist was
re-derived independently and is exactly right. The narrowing is accepted
knowingly: nothing in the tree sends a refused key, a future client
could, and §3.7's own reasoning — that an interface-only rule is one a
second client does not have — is the reasoning that settles it. The
contract is ratified with the defect at S16.3 recorded against its
BOUNDARY, not against its content: it fences `p_edits -> 'fields'` and
its sibling keys are not fenced.*

**RULING 3 — on D12(3), Q-B's cost.**
*Q-B is **TAKEN as shipped, in the ladder form, and the cost is
ACCEPTED**. Manual entry now requires view×5 and a below-cliff member
loses it entirely rather than losing only the approve half M2 took. The
rejected alternative — exempting manual entry from the approve gate — is
**REJECTED again here, on the round's own reasoning**: it would make
manual entry the one path that writes to the record without the evidence
gate §3.7 exists to enforce, and Q7 is the ruling that puts that gate in
the database. Closing creation keeps one rule; exempting creates two.
`024:14` was a GREEN assertion and inverting it is accepted as a real
product change, not a test repair — it is on the record at the site, in
`MNL-01`, and in this ruling. `064:16` is the control that keeps the
coordinator the product actually expects to use manual entry untouched.*

**RULING 4 — on D12(4), D8's scope decision.**
*D8 is **UPHELD IN FULL**. The suite repairs land at 6B and this branch
keeps its zero-code-channel property, which was re-verified at `208bda2`
and not merely inherited. D8's second argument is decisive on its own: a
repair landed here could not be shown green without the fourth run the
round refused, so it would mean shipping unverified suite edits into a
merge. **No fourth run is ordered by this sign-off either.** The gate
stands RED, `ingestion.spec.ts:361` was never green at this tree and
`:400` has never executed at it, and the six acceptance conditions stand
as written — the `test.describe.serial` blast radius ranked first, and
`:361` and `:400` executed BY TITLE and recorded as a TARGETED RUN rather
than as a gate result.*

**RULING 5 — on D12(5), D6's rule for build sessions.**
*D6's rule is **ADOPTED as standing practice**: a build session that
finds a settled dispositions record wrong **records the discrepancy where
it will be read — the packet, and a comment at the site — and does not
move the verdict**. The next round rules. The `e0186ce` correction to
ADR-0023's D17 R8/F-1 row is **RATIFIED on this round's authority**, its
three sites having been re-read by the review, by the round and once more
here; the OWED tally is unchanged at 39.*

**RULING 6 — on Q-E's NOTED pattern departure.**
*Q-E's retirement of `arrival_transitions_stage_fkey` is **RATIFIED**,
and the pattern departure is **NOTED, not repaid now**, with the
condition recorded as the round states it: **the next time a stage is
added, or the stage vocabulary needs to be read by query, that is the
migration that builds the closed stage-vocabulary table** both
`hc.stage_budgets` and `hc.arrival_transitions` reference. Until then the
inline CHECK is a departure from this repo's shipped lookup-table pattern
and **the next author must not read it as house style**.*

**RULING 7 — on D12(6), M7, and where the residue goes.**
***M7 STAYS CLOSED at this sign-off, and the S16.2 / S16.3 residue is
OWED to 6B.*** *There is no reserved migration slot left; any DDL is an
owner amendment and this session does not take one on its own authority.
The residue is crash-shape, not privilege — the transaction aborts,
nothing is written, no gate is crossed — which is the same class F-1 was
graded on, and it is unreachable from the shipped tree today: no client
sends `p_edits`, and no shipped writer produces a conflict payload with a
malformed `domain`. **The owner may amend this**, and S16.8 states what
the amendment would cost.*

---

### S16.7 — the CORRECTED TALLY, and what moves in the records

**F-1's verdict moves. `FIXED` → `FIXED IN PART · residue OWED (6B)`.**
The six channels the round enumerated are closed and each is driven at
`064`; the CLASS is narrowed, not closed. Two channels remain, both
demonstrated live at this head with their raw signatures quoted.

| Tally | As the round wrote it (D13) | **As corrected at sign-off** |
|---|---|---|
| FIXED | 4 (F-1, F-3, F-4, F-7) | **3** (F-3, F-4, F-7) |
| FIXED IN PART | — | **1** (F-1) |
| OWED | 1 (F-5) | 1 (F-5) |
| ACCEPTED | 1 (F-6) | 1 (F-6) |
| ACCEPTED-NOTE | 1 (F-2) | 1 (F-2) |
| **Total** | **7** | **7** |

Zero DECLINED, zero OWNER-escalated, zero BLOCKER — unchanged. **The
nine questions are unchanged at 5 CONFIRM · 2 TAKEN · 2 RATIFIED-with-an-
amendment**, with one correction inside Q-C: the sentence *"after M6 the
sentence is true as written for the first time"* is true of `23502`,
which is what that sentence says, and must not be read as the wider
property — the wider property is what S16.2 and S16.3 falsify.

**F-3's verdict does NOT move.** The liveness guard is on all three
surfaces and works; S16.4 is a correction to D4's argument, not to its
fix.

**Records amended by this sign-off:**

1. **ADR-0025 D13** — the F-1 row carries the moved verdict and a pointer
   here; the original text is preserved beside it (the ADR-0023 D3 rule).
2. **ADR-0024, a SIXTH amendment site** — amendment site 1's closing
   sentence (*"M6 closes all six at the destination and the sentence
   above is true as written for the first time"*) is corrected in place,
   and the head's amendment list says five where it is now six.
3. **`docs/coverage.md` `DEC-01`** — the cell asserts the cast half
   *"performs exactly the casts the inserts perform"*, which is true and
   is not the property the cell is offered for. Annotated with the
   residue and its owed status.
4. **`docs/coverage.md` `REV-01`** — annotated with S16.4: the manifest
   policy's added clause is not provably liveness alone.

**No coverage row FLIPS**, and the ADR-0023 D19 rule is why: a sign-off
records what a layer proves, and nothing here proves anything new about a
product criterion. `MNL-01`, `UXA-01` and `RLS-10` are untouched by this
sign-off and stand as D11 left them.

---

### S16.8 — what is OWED to 6B after this sign-off

The 6B queue gains one entry; **B1, the rasterizer swap, keeps its
plan-bound first position** and the 6B kickoff places these alongside it.
The slice-5B queue is **unchanged at 39 OWED**.

**NEW · the approve-time payload contract's residue (S16.2, S16.3).**
Acceptance conditions, in the D8 shape:

1. **Red first, with both raw signatures quoted** —
   `ERROR:22P02:invalid input value for enum hc.domain: "bogus"` and
   `ERROR:22023:cannot cast jsonb string to type boolean`.
2. **The conflict arm's `domain` cast is covered for EVERY outcome**, not
   for `use_new` alone — and the fix is derived from *every payload-
   derived cast expression in the function*, not from the insert arms,
   which is the frame that produced the miss.
3. **`064` gains a `keep_both` case.** The file has none, and that is why
   the arm whose coverage was incomplete was the arm the suite did not
   exercise.
4. **`p_edits`'s top-level keys are contracted**, or the contract's bound
   is stated where D2 states its scope. `confirm_high` is the live one;
   `conflict_outcome` is already clean.
5. **The enumeration is re-derived a third time.** It has now been short
   twice — the review's by three, the round's by two — and each re-
   derivation was worth the time.
6. **`hc.revise_object` and the step-up path are audited against D1**,
   which this round explicitly did not do and which this sign-off did not
   do either. They carry their own copies of the record-table inserts.

**Carried forward unchanged from D8 and D13:** F-5's six suite-repair
conditions; R4/F-10 (Q-A) at B3; Q-G's RCP-01 app-half caution; and the
`hc.revise_object` / step-up audit, which now appears above with the
residue it belongs to.

> **AMENDED IMMEDIATELY AFTER THE MERGE — the six conditions above owed
> 6B work 6B was not budgeted to do, and did not say so.** Conditions
> 1–4 all require replacing `hc.approve_proposal`, which is a migration.
> **Slice 6's migration bound closed at 6 of ≤ 7 with M7 UNCONSUMED**, so
> at the moment this section was written 6B had **no slot** for the very
> thing it was being handed. An obligation and a bound that disagree is
> the settled-record shape this cadence exists to catch, and the sign-off
> committed it in the act of recording what it found.
>
> **THE OWNER AMENDMENT, stated as one, 2026-08-25.** The plan already
> names this mechanism for exactly this case: *"A build session that
> finds it needs M7 anyway is finding something this gate did not
> foresee, and that is an owner amendment with its reason stated"*
> (`slice-6-plan.md:1234-1238`). The residue **is** something the gate
> did not foresee — it was found at sign-off, after the gate ruled.
>
> **ONE migration slot is pre-authorised at 6B, NAMED and BOUNDED**, on
> Q2's own terms — *"the over-provisioned slot is deliberate, not an
> invitation to spend it"*:
>
> 1. **It is for the approve-time payload contract ONLY** — the residue
>    at S16.2 and S16.3, plus whatever condition 6's `hc.revise_object` /
>    step-up audit finds **in that same class**. Any other DDL at 6B is a
>    **fresh** owner amendment, stated before a line is written.
> 2. **It does NOT reopen M7.** M7 closed UNCONSUMED and 6A's bound
>    stands at **6 of ≤ 7** as the record of what 6A spent. This is 6B's
>    own first migration, numbered in 6B's sequence.
> 3. **It lands BEFORE or WITH B8, never after.** B8 writes the first
>    caller that can reach the channel; a caller shipped ahead of the fix
>    would open, for one unit, exactly the window this whole finding is
>    about. **B1 keeps its plan-bound first position** regardless.
> 4. **It closes UNCONSUMED if condition 5's third re-derivation finds
>    nothing needing DDL** — and that outcome is a result, not a failure.
> 5. **The six conditions above bind it unchanged**, red leg included.
>
> **Nothing else about the queue moves**, and this pre-authorisation is
> not a licence: it is the one collision the sign-off could see, resolved
> where it will be read rather than left for a build session to meet
> mid-slice and rationalise.

---

### S16.9 — evidence at the sign-off head

**Head: `208bda2`.** Nothing under `supabase/`, `app/`, `lib/`, `e2e/`,
`scripts/` or `tests/` moved in this session — the sign-off's every probe
ran inside a `ROLLBACK` — so **D14's legs bind unchanged and were
deliberately not re-run**. Per directory, between D14's evidence head and
this one: `supabase/` unchanged · `app/` unchanged · `lib/` unchanged ·
`e2e/` unchanged · `scripts/` unchanged · `tests/` unchanged · `docs/`
moved. Verified by D14's own rule —
`git diff --name-only b324e95..HEAD -- . ':(exclude)docs'` returns
**empty**.

**Re-verified at this head by this session, from the catalog and the
tree:** 68 migrations applied · SECURITY DEFINER in `hc` = **72** ·
`hc_internal` policies = **103** · `git diff --name-only 31a7977..HEAD`
touches **nothing** under `app/`, `lib/` or `e2e/` · M6's four objects
appear in `app/`/`lib/`/`e2e/` as **two comments and zero call sites**.

**CI on the runner, BOTH events, read anonymously from the public Actions
API at this exact head** (the round-8 convention; `gh` is unauthenticated
and device-flow is out of bounds):

· **push** run **32791900459** @ `208bda2` — **success**
· **pull_request** run **32791904586** @ `208bda2` — **success**

Both `completed`; neither pending.

**PR #11**, read from the public PR API at the same moment: **open**, not
merged, base `main`, head branch `slice/6-care-inbox`, **DO NOT MERGE
without owner sign-off** in the title.

**The commit that CARRIES D16 was confirmed too, so the sign-off does not
rest on its own parent alone.** `8449812` is docs-only — it moves
`docs/adr/0024`, `docs/adr/0025` and `docs/coverage.md` and nothing
else — and its two runs were read at the SHA from the same public API:

· **push** run **32801783514** @ `8449812` — **success**
· **pull_request** run **32801786947** @ `8449812` — **success**

*(A document cannot name its own SHA, so this section names the head it
signed off and the commit that carried it. The one commit after `8449812`
adds only these six lines and is docs-only by the same rule — verify with
`git diff --name-only b324e95..HEAD -- . ':(exclude)docs'` returning
empty, which is D14's rule and holds at every head on this branch.)*

**THE LOCAL GATE IS RED and was NOT RUN.** No fourth run was ordered by
the round and none is ordered here. `ingestion.spec.ts:361` was never
green at this tree; `:400` has never executed at it. **CI DOES NOT RUN
THE BROWSER GATE** — the two green runs above are not evidence about it.

---

### S16.10 — THE MERGE: authorised, and why M7 still stays closed

**The sign-off put TWO decisions to the owner and the owner returned
both to the sign-off's own recommendation, 2026-08-24.** Both are
resolved here, with the argument, before either is acted on.

**DECISION A — M7 STAYS CLOSED, and the residue stays OWED to 6B.**
RULING 7 is confirmed rather than reversed, and one fact found while
resolving it is decisive and was not in hand when the ruling was written:

**The residue is not reachable by any client.** `supabase/config.toml:15`
exposes `schemas = ["public", "graphql_public"]` — **`hc` is not
exposed**, so `hc.approve_proposal` cannot be called over PostgREST by
`authenticated` or by anyone else. Checked against the catalog rather
than the config alone: **zero** functions in `public` or `graphql_public`
reference `hc.` at all, so no wrapper re-exposes it. And `app/`, `lib/`
and `e2e/` hold **two comments and zero call sites**. The channel opens
only when a server-side caller is written, and that caller is **6B B8** —
the app half of `DEC-01`, which is the exact row the residue is owed
against. **The fix is owed to the slice that first makes it reachable.**

Three further reasons, each sufficient alone:

1. **There is no precedent for a sign-off authoring DDL.** ADR-0023 D24 —
   the precedent this session was held to — records its own evidence leg
   as *"documentation, two comment repairs and one new test block"* and
   states plainly: *"The migration bound stays SPENT at 8 of ≤ 8 — this
   leg authored no DDL and needed none."* A sign-off fixes source; a
   dispositions slot fixes schema.
2. **It would breach RULING 5 one section later.** RULING 5 adopts D6's
   rule as standing practice: a session that finds a settled record wrong
   records the discrepancy and does not move it on its own authority. A
   sign-off that authored the migration it had just ruled on would be
   both the author and the ratifier of unreviewed DDL — the precise shape
   D6 exists to forbid.
3. **The bound closes where the plan said it would.** 6 of ≤ 7 with M7
   UNCONSUMED is the plan's own number in four places, reached by the
   plan's own route. Spending M7 on a channel no client can reach would
   buy nothing and would cost the one number the round got exactly right.

**DECISION B — THE MERGE IS AUTHORISED**, on the ADR-0015
sign-off-with-merge precedent, and is performed in this session. It is
recorded in S16.11 as it happened.

**It is a MERGE COMMIT, never a squash** (ADR-0006), so all six red→green
pairs and the docs commits stay reachable from `main`; the merged tree is
verified IDENTICAL to the branch head's; both parents and the tree hash
are recorded; CI is confirmed green on `main` AT THE MERGE COMMIT before
the merge is called done; PR #11 closes as merged; and the merge record
lands in S16.11 and in ADR-0024's Status line.

**F-1 remains FIXED IN PART across the merge, and that is deliberate.**
`main` takes a MAJOR whose class is narrowed rather than closed, with
both residual signatures quoted in this document and in `DEC-01`, and
with six acceptance conditions at 6B (S16.8). A verdict carried honestly
into `main` is worth more than one closed by DDL no round has read.

**Nothing is production-activated by this sign-off.** Proposals rest at
`pending`, G9 stays OPEN, `BAND_ARTIFACT_ALLOWLIST` stays EMPTY, G3/G4/G7
still block, no credential exists in CI or the gate, and **zero
dependencies were added** — the dev reserve is unspent through a third
slice.

---

### S16.11 — THE MERGE, stamped after the fact (the 4A `95dab27` pattern)

**PR #11 merged as a MERGE COMMIT, never a squash** (ADR-0006):
**`d59de15`**, parents **`31a7977`** (`main`, **unmoved through the whole
round** — 24 ahead, 0 behind at the merge) + **`4d4e38f`** (the branch
head). The merged tree is verified **IDENTICAL** to `4d4e38f`'s — both
**`d9656a63`** — and `git diff d59de15 slice/6-care-inbox` is empty.
**25 commits, 28 files.**

**Every commit this document cites is reachable from `main`**, checked
mechanically rather than asserted: `git rev-list 31a7977..4d4e38f --not
HEAD` returns **0**. All six red→green pairs survive as pairs —
`6e45a13`→`d95e728` (M1), `badb499`→`189503c` (M2), `7f962af`→`29e03f5`
(M3), `300a73a`→`b8b6353` (M4), `a2f5db6`→`278f918` (M5),
`91fd7a9`→`b324e95` (M6) — so **every failure signature these ADRs quote
survives in the history rather than only in prose.** That is the whole
reason ADR-0006 forbids the squash.

**CI green on `main` AT THE MERGE COMMIT: run `32803716668`**, read
anonymously from the public Actions API at `d59de15`. **23 steps, and the
only non-success is the on-failure database-log capture, skipped as
designed.**

**One honest note about that run, because round 17 penalised exactly this
kind of imprecision (F-4).** On a push to `main` the upgrade leg is a
**DELIBERATE no-op**: `git merge-base HEAD origin/main` equals `HEAD`, so
it prints *"HEAD is the base — no increment to rehearse"* and exits 0
(`.github/workflows/ci.yml:89-91`, which says so in its own comment). The
rehearsal that matters therefore comes from the **branch head**, run
**`32803042083`** @ `4d4e38f`, where step 16 — *"Upgrade leg — base
reset, increment apply, both suites"* — ran and reported **success**
against the base `31a7977`, applying all six 6A migrations in order.
**Both runs are cited because neither alone covers the claim.**

**PR #11 read back from the public PR API after the merge:** state
**closed**, `merged: true`, `merge_commit_sha` **`d59de15`**, merged at
`2026-08-25T03:03:27Z`. GitHub recorded the merge commit, not a squash.

**No evidence leg was re-run at the merge, and the reason is tree
identity, not convenience.** The merged tree is byte-identical to the
branch head's (`d9656a63` = `d9656a63`), so every leg in D14 and S16.9
binds unchanged — clean reset, exact verifier at 68, pgTAP
`Files=65, Tests=1610 PASS`, concurrency 75/75, `db:verify` under
`--fail-on warning`, the upgrade rehearsal, vitest 689/689, lint,
typecheck, build and gitleaks. Re-running them at an identical tree would
be evidence of nothing.

**THE GATE IS STILL RED and `main` knows it.** `ingestion.spec.ts:361`
was never green at this tree; `:400` has never executed at it; both are
owed re-observation BY TITLE at 6B under D8's six conditions, and
`UXA-01` and `RLS-10` carry the annotation on `main` now. **CI does not
run the browser gate**, so run `32803716668` is not evidence about it.

**Round 17 closes. Slice 6A is on `main`, with F-1 at FIXED IN PART and
its residue owed to 6B B8.** The slice-5B queue is unchanged at **39
OWED**; the 6B queue carries F-5's six conditions, the payload-contract
residue's six, R4/F-10 (Q-A), Q-G's RCP-01 caution, and the
`hc.revise_object` / step-up audit. **B1, the rasterizer swap, keeps its
plan-bound first position.** `M7 closes UNCONSUMED and the bound closes
at 6 of ≤ 7` — the plan's own number, by the plan's own route.
