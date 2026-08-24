# Round-17 findings — slice 6A, the Care Inbox database increment

**Nothing in this file is a disposition.** Every finding below is the
reviewer's own text, with its severity and its confidence stated as the
reviewer holds them, including where this session may go on to dispute
them. The dispositions — accept or decline, each WITH the argument — are
the next session and their own ADR (**0025**), and **M6 is reserved for
them**. Nothing was fixed here.

**Review head:** `874432f` on `slice/6-care-inbox`, base `main` @
`31a7977`.
**CI confirmed at the review head by this session, both events** —
push `32776339481` **success**, pull_request `32776338650` **success**.
Both `completed`; neither pending. Read anonymously from the public
Actions API at the head under review, not taken from the packet.
**Packet under review:** `docs/review/round-17-packet.md`.
**As-built record under review:** `docs/adr/0024-6a-care-inbox-db-deltas.md`
(PROPOSED).

## How this review was conducted

One session, read-only, instructed to attack the two places the build
names itself — Q7's narrowing (M2) and M3's retired foreign key — and to
form a view on the three judgement calls the packet puts explicitly
(Q-A, Q-C, Q-I). A clean area reported clean is a result; inventing
findings is not. Every finding below quotes the line it rests on and
either constructs a concrete failure or is downgraded to an observation.

**What this session could and could not run.** A peer session holds the
working tree and the Supabase stack (one live project `node` process at
review time), and `db:reset` / `test:db` / `test:concurrency` /
`test:e2e` are global and destroy a peer's in-flight run. **None of them
was run.** Every database claim below is either read from the tree or
probed against the running 67-migration database with **pure `immutable`
function calls and catalog reads that write nothing** —
`hc.visible_at(...)` takes its context as a parameter, so it can be
evaluated on a hand-built `jsonb` with no fixtures, no rows and no
transaction of consequence. Where a claim could only have been settled
by running a suite, it is marked as unverified rather than asserted.

## What was re-checked independently, and held

These are the packet's own claims, re-derived rather than accepted. All
of them stand.

| Claim | How it was checked | Result |
|---|---|---|
| The F12 tree binding | `git diff --name-only dd350ad..874432f -- . ':(exclude)docs'` | **empty** — the binding holds at the REVIEW head, not only at the packet head |
| The branch's code channel | `git diff --name-only 31a7977..874432f` | 12 files `supabase/tests`, 5 `supabase/migrations`, 1 `scripts/concurrency`, 5 `docs` — **zero** under `app/`, `lib/`, `e2e/` |
| CI at the review head | public Actions API, unauthenticated | push + pull_request both `completed`/`success` at `874432f` |
| PR #11 | public PR API | open, base `main`, head `874432f`, **17 commits / 23 files**, not merged, "DO NOT MERGE without owner sign-off" in the title |
| The gate is 29 tests | `e2e/*.spec.ts` | 5 + 5 + 8 + 11 = **29** |
| M2's predicate is `hc.log_artifact_read`'s, character for character | `20260821120001:79-82` vs `20260824120002:370` | **identical** — same five arguments, same threshold |
| M1's "seven columns", enumerated against the catalog | `pg_attribute` join over the five record tables: NOT NULL, no default, payload-derived, unguarded | **exactly seven**, and the exclusion of `documents.category` / `timeline_events.kind` is justified — `hc.own_domain` raises `own_domain_undeclared` (P0001) on a null resolution, not `23502` |
| D3's three premises | `20260816010004:50-53`; `20260816010001:61`; `supabase/tests/019:104` | all three true — `claim_stage` looks the budget up by name and proceeds; `entry_state` is NOT NULL UNIQUE; 019 pins the five stages as an ordered aggregate |
| Nothing joins `arrival_transitions` to `stage_budgets` | grep across migrations, `lib/`, `app/`, `scripts/` | only the primitive and the new terminal arm read the table — **dropping the FK strands no consumer** |
| D17's correction | all three cited sites read | `route.ts:240-247`, `worker-stage.test.ts:284`, `relay.test.ts:145-152` all read as claimed; OWED tally unchanged at 39 |
| concurrency 47 isolates the added predicate | `scripts/concurrency/run.mjs:2900-2964` | it does — the assertion requires `manage_on_taint === 'manage'` **at the moment of refusal**, so only the new predicate can be the cause |
| `finalize_extraction`'s 4-arg caller survives | `lib/hc/workers.ts:150`, pinned at `062:10` | the defaulted fifth parameter resolves the shipped call unchanged |

---

## Findings

### F-1 — M1 closes the `23502` class; the same click still reaches at least three other raw Postgres error classes, and one of them is guarded thirty lines away in the same function
**Severity:** MAJOR
**Where:** `supabase/migrations/20260824120003_decide_proposal.sql:478`,
`:502`, `:541-550`, `:711-717`; `20260824120001_inherited_obligations.sql:160-163`
**Claim under test:** the plan's stated property, which Q-C asks the
round to ratify and Q-D asks it to complete — *"`23502` can never
surface as a raw Postgres error at the moment a person clicks approve"*,
generalised by ADR-0024 to *"one adjacent class is NAMED and NOT taken"*
(`timeline_events.temporal_shape`).

**What I found.** The property is further from true than Q-D states, and
the reason is one line:

```sql
v_payload := v_prop.payload || coalesce(p_edits -> 'fields', '{}'::jsonb);   -- :478
```

`p_edits` is a caller-supplied `jsonb` merged into the payload **with no
type, shape or vocabulary validation at all**, before every guard in the
function, by a caller who need only be `authenticated` and clear the
gates. `hc.approve_proposal` is granted to `authenticated`
(`20260824120002:597`). What that reaches:

1. **`tasks_check` — a second `23514` class, and the asymmetry is inside
   one function.** `public.tasks` carries
   `CHECK ((due_on IS NULL) = (due_zone IS NULL))`. The conflict arm
   guards exactly that pair:

   ```sql
   or ((v_task ->> 'due_on') is null) <> ((v_task ->> 'due_zone') is null)   -- :502
   ```

   The ordinary task arm does not — it writes both straight through:

   ```sql
   (v_payload ->> 'due_on')::date, v_payload ->> 'due_zone',                 -- :717
   ```

   and M1's guard block (`:541-550`) checks only `title is null` for a
   task. So the identical constraint is guarded on one arm of one
   function and unguarded on the other.

2. **A cast class — `22P02` and `22007` — that `draft_proposal` closes
   and `approve_proposal` re-opens.** `draft_proposal` validates
   `risk_class`'s vocabulary (`20260824120001:160-163`). `approve_proposal`
   checks only `risk_class is null` (`:544`) and then casts:
   `(v_payload ->> 'risk_class')::hc.risk_class` (`:673`, `:765`),
   `(v_payload ->> 'kind')::hc.timeline_kind` (`:582`, `:728`),
   `(v_payload ->> 'category')::hc.doc_category` (`:581`, `:703`),
   `(v_payload ->> 'due_on')::date` (`:717`),
   `(v_payload ->> 'occurred_on')::date` (`:730`),
   `(v_payload ->> 'local_at')::timestamp` (`:731`),
   `(v_payload ->> 'episode_id')::uuid` (`:729`). Reproduced on the
   running database: `'bogus'::hc.risk_class` →
   `invalid input value for enum`; `'not-a-date'::date` →
   `invalid input syntax for type date`. An **edit** re-opens a class
   drafting had closed.

3. **A refusal that does not ride DEF-10.** `{"category": null}` in
   `p_edits -> 'fields'` reaches `hc.own_domain` with a null category,
   which raises `own_domain_undeclared` — a P0001, so not raw, but a
   *different word* from the `approval_refused` M1 chose for the seven
   columns, at the same click.

**Failure scenario.** A member who clears both gates approves a `task`
proposal with `p_edits => '{"fields":{"due_on":"2026-09-01"}}'` on a
proposal whose payload carries no `due_zone`. The guard at `:541-550`
passes (`title` is present). `hc.own_domain` returns `schedule`. The
insert at `:711-717` raises **`23514 tasks_check`** — a raw Postgres
error at the moment a person clicks approve, which is the sentence
R4/F-12 was written about. Same input with
`{"fields":{"risk_class":"urgent"}}` on a `profile_fact` raises
**`22P02`** at `:673`.

**Why this is MAJOR rather than MINOR.** The user-visible consequence is
MINOR-shaped — the transaction aborts, nothing is written, no privilege
is crossed. It is MAJOR because of what the round is being asked to do
with it: Q-C asks to **ratify the scope** and Q-D asks to take one CHECK
at M6, after which the property would be recorded as established. Taking
Q-D as written closes one of at least four channels while the record
says the class is closed. That is a settled-record error, and this
cadence exists to catch those. It also cuts against M2's own argument in
the same slice: §3.7 says access is re-checked at WRITE time because
*"an interface-only rule is one a second client does not have"* — the
same reasoning applies to an interface-only assumption that the 6B form
only ever sends well-formed edits.

**Confidence.** High on the mechanism, the reachability and the two
reproduced cast errors — all read from the shipped tree and probed on
the running database. Medium on the completeness of my own enumeration:
I enumerated CHECK constraints and casts on the five destination tables,
but I did not audit `hc.revise_object` or the step-up path, which carry
their own copies of these inserts.

---

### F-2 — Q7's predicate has a second refusal channel that is not Q7's, and `060:6` states the general claim from the one fixture where it cannot fire
**Severity:** MINOR (latent)
**Where:** `supabase/migrations/20260824120002_review_boundary.sql:349`
and `:370`; `20260816120006_prf06_rewrite.sql:67-79`;
`supabase/tests/060_review_boundary.sql:283`
**Claim under test:** ADR-0024 D1 — *"ONE CONSEQUENCE IS RECORDED rather
than designed around"* — and the packet's own invitation: *"check that
the predicate cannot refuse anything that previously succeeded for a
reason other than Q7's."*

**What I found.** It can. The added predicate hardcodes its lineage
arguments:

```sql
if hc.visible_at(v_ctx, v_prop.subject_id, hc.all_domains(), true,        -- :370
                 'arrival', v_prop.arrival_id, null) < 'view' then
```

`true` and `hc.all_domains()` make `visible_at` **rung 3** — *"unresolved
or empty lineage: manage on all five, or nothing"* — unreachable for this
call. The manage check immediately above it (`:349`) still passes the
proposal's own `v_prop.taint_resolved`, so it can and does take rung 3.
Rung 3 sits **before** rung 4, the `care_circle` ceiling. So for a
`care_circle`-tier actor holding manage on all five domains, an
unresolved-lineage proposal took rung 3 and returned `manage`; the new
call skips rung 3, reaches rung 4 and returns `hidden`.

Probed directly on the running database, pure function calls, no
fixtures:

```
OLD manage-check, taint_resolved=FALSE  -> manage      (rung 3)
NEW arrival gate (all5,true,arrival)    -> hidden      (rung 4)
OLD manage-check, taint EMPTY           -> manage
OLD manage-check, resolved+health taint -> hidden      (already refused, pre-6A)
care_circle WITH an arrival share       -> manage      (rung 5 rescues it)
family tier, same grants, both calls    -> manage      (channel is tier-specific)
```

**The refusal reason is the care_circle ceiling, not the view×5 ladder.**
And `060:6` pins the opposite as a general statement:

> *"care_circle holds manage grants and still cannot approve — the §3.3
> ceiling binds the writer, and **the new predicate did not disturb which
> refusal fires**"*

That is true of the fixture it uses, whose proposal has resolved
lineage — where, as the fourth probe line shows, the actor was already
refused before 6A. The clause after the dash is the general claim, and
it is the one that does not hold.

**Failure scenario.** A `care_circle` member with manage×5 on the subject
and a proposal with `taint_resolved = false`: approves on `main`,
refuses after M2, with `approval_refused` and no distinguishing signal.
**Latent, not live** — I checked every writer of `proposals.taint_resolved`
in the tree and found none that sets it false (the live table reads
`0` unresolved of `25`). But `hc.guard_row:48-52` already defends
`taint_resolved` false→true as a transition worth forbidding, so the
database treats false as a legal state; the divergence goes live the day
anything writes it. No 6A test sets it.

**Verdict on the ruling itself:** the *outcome* is right and I would
ratify Q7 unchanged. A `care_circle` actor with no share on the arrival
genuinely cannot see the source, which is exactly what Q7 says must be
required. What needs amending is the **record** — D1 says one
consequence and there are two — and `060:6`'s message, which should say
what it proves.

**Confidence.** High — the divergence is reproduced, and the rung order
is read from the shipped `visible_at` body.

---

### F-3 — D10's "one gate across the whole surface" has a liveness asymmetry: the three read surfaces require a live arrival, the two write surfaces do not
**Severity:** OBSERVATION
**Where:** `20260824120002:628-631` and `:370`; `20260824120005:103-106`;
`20260824120004:118-122`; `20260821120001:79-82`;
`20260824120003:298`, `:611`
**Claim under test:** ADR-0024 D10 — *"`hc.approve_proposal`,
`hc.reject_proposal`, `hc.extractions_for`, `public.arrival_renditions`
and `hc.receipt_for` **all ask the same question of the same arrival**."*

**What I found.** Four of the five ask it of the arrival ROW; two of them
never read the row. `hc.extractions_for` (`:628-631`), `hc.receipt_for`
(`:103-106`) and the pattern's source `hc.log_artifact_read` (`:79-82`)
all select `from public.arrivals a where a.id = … and a.deleted_at is
null and hc.visible_at(...) >= 'view'`. `hc.approve_proposal` (`:611`)
and `hc.reject_proposal` (`:298`) pass `v_prop.arrival_id` into
`visible_at` without touching `public.arrivals` at all, and the
`arrival_renditions_select` policy (`:118-122`) likewise tests
visibility without liveness.

**Failure scenario.** If an arrival is ever soft-deleted while pending
proposals remain (the FK is `on delete cascade`, which covers hard
deletes only), a member can still approve them into the record — and
then cannot read the receipt for the decision they just made, because
`hc.receipt_for` refuses on the same arrival. "You may decide it but not
see what you decided" is precisely the confusion §4.2.4's `visible` flag
exists to prevent.

**Why OBSERVATION rather than MINOR.** I could not find any writer of
`arrivals.deleted_at` anywhere in the tree, so the case is unreachable
today. Three functions nonetheless defend against it, which is what makes
the asymmetry worth recording: either the liveness check belongs on the
write paths too, or D10 should state its bound rather than claiming the
question is the same.

**Confidence.** High on the asymmetry; high that it is currently
unreachable.

---

### F-4 — The packet's head ledger names a head that is no longer last, and its PR row is stale — the R7/F-9 defect the ledger exists to prevent
**Severity:** MINOR
**Where:** `docs/review/round-17-packet.md`, the head-ledger table and the
addendum
**Claim under test:** the ledger's final row — *"CI-record head `2f4c4a6`
… **and the last commit on the branch**"* — and the addendum's
*"PR #11 … head `slice/6-care-inbox` @ `9c28f7d`, 16 commits / 23 files"*
and *"CI green on the runner at the **FINAL** head, both events … @
`9c28f7d`."*

**What I found.** Three commits stand after `2f4c4a6`: `fd1cfbd`,
`9c28f7d`, `874432f`. The ledger has no row for any of them, and one
of them — `fd1cfbd` — is titled *"the ledger names its own last
commit."* Checked against the public API rather than the packet: PR #11's
head is **`874432f`**, **17 commits / 23 files**, and `9c28f7d` is not
the final head.

The facts the stale rows assert are nonetheless **true at the real
head**, which I confirmed myself: push `32776339481` and pull_request
`32776338650`, both `success` at `874432f`; and the F12 binding holds
there too (`dd350ad..874432f` is five files, all under `docs/`). So this
costs the round nothing except the thing the convention was written for —
a reader who trusts the ledger reads a head that is three commits behind
and a PR row that is one commit and one commit-count wrong.

**Failure scenario.** A reviewer who takes the ledger at its word reviews
`2f4c4a6`, and the CI evidence they check is for a head that is not the
one the owner will merge. That is R7/F-9 exactly.

**Recommendation** (not a disposition): a packet cannot name its own SHA,
so the last row should state the **rule** instead of a SHA — *"every
commit after the evidence head is docs-only; verify with
`git diff --name-only <evidence-head>..HEAD -- . ':(exclude)docs'`
returning empty"* — which is checkable at any future head and cannot go
stale. Same for the PR row: name the PR and the base, not the head SHA
and the commit count, both of which move on every push.

**Confidence.** High — all of it is mechanical.

---

### F-5 — Two gate legs have never been observed passing at this tree, and one of them has never executed at all. It is the suite's below-the-cliff visibility leg, and the packet does not report it
**Severity:** MAJOR
**Where:** `e2e/ingestion.spec.ts:101` (`test.describe.serial`), `:361`,
`:400`; the packet's three-run section
**Claim under test:** the packet's account of the gate — *"Run 2 — 27
passed, 1 failed, 1 did not run … Run 3 — 21 passed, 1 failed, 7 did not
run"* — and its conclusion that the failures are *"every one of them
inside the suite's own fixtures, ordering or environment."*

**What I found.** All four spec files are `test.describe.serial`
(`ingestion.spec.ts:101`, `extraction.spec.ts:124`, `a11y.spec.ts:123`,
`onboarding.spec.ts:42`), so a failure **skips every remaining test in
its block**. That explains the packet's counts exactly — and it means the
counts carry information the packet does not draw out:

| Run | Failed | Skipped behind it |
|---|---|---|
| 1 | `extraction:166`, `ingestion:161` | the 6 ingestion legs after `:161`, incl. `:361` and `:400` |
| 2 | `ingestion:361` | 1 — `:400`, the only leg after it |
| 3 | `ingestion:102` | the 7 after it, incl. `:361` and `:400` |

So across all three runs:

- **`ingestion.spec.ts:361`** (the §4.5 cancel window) failed in run 2
  and was skipped in runs 1 and 3. **Never green at this tree.**
- **`ingestion.spec.ts:400`** — *"below the cliff: a family-tier member
  sees NOTHING (Q6 probed live)"* — was skipped in **all three runs**.
  **It has never executed at this tree at all.**

The packet says *"Every extraction leg passed, including both that failed
in run 1"*, which is true and load-bearing. It does not say that two
ingestion legs were never observed green, and that one of them never ran.

**Why this matters more than the colour.** 6A's entire subject is
narrowing an access-control predicate — Q7 adds `view` over five domains
to `hc.approve_proposal`, and M2/M4/M5 extend the same gate to the fact
read, the manifest policy and the receipt. `:400` is the one browser leg
that probes tier-based invisibility live. Its DDL neighbours moved this
slice. It is not evidence of a defect that it did not run — it is the
absence of the evidence a reader would most want, and it is invisible in
a "RED, three disjoint failure sets" summary. `describe.serial` converts
one fragile leg into a coverage hole for everything behind it, which is a
sharper statement of the suite finding than "two legs are fragile."

**Failure scenario.** The round accepts RED-with-no-code-channel,
dispositions the two named fragile legs at 6B, and `:400` is repaired
into a suite where it still never runs because `:102` or `:161` fails
first. The tier-visibility assertion stays unexecuted across two more
slices without anyone stating it.

**On a fourth run: I rule against it, explicitly.** The build session
was right not to run one and I am not ordering one. Three runs produced
three disjoint failure sets, each diagnosed from an independent
artifact — the database's own `arrival_events` for the 108 ms window,
Playwright's own page snapshot for the session leak, a peer session's
`.env.local` and request log for the adopted server. A fourth run cannot
re-classify any of those; it can only produce a fourth colour of wrong or
a green that would be read as a verdict, which is running to green. What
I would ask for instead, at the disposition, is **narrower and cheaper
than a fourth full run**: once the suite fixes land, execute `:361` and
`:400` directly by title so that both are observed at least once, and
record that as a targeted run rather than a gate result.

**Confidence.** High on the mechanism and on the arithmetic — the
serial-block semantics reproduce the packet's three "did not run" counts
exactly, which is also independent corroboration that the packet's
numbers are honest. I did not run the gate.

---

### F-6 — A build session amended a settled ADR's verdict column. The correction is right; the authority is this round's
**Severity:** MINOR
**Where:** `docs/adr/0023-slice5b-review-round-16.md`, D17 table row F-1,
changed at `e0186ce`
**Claim under test:** the correction itself — *"this row read OWED while
D24 ruling 3 records the same work as done … All three sites re-verified
at `main` before the flip."*

**What I found.** The correction is factually right. I read all three
cited sites: `app/api/worker/[stage]/route.ts:240-247` records the ruling
rather than a gap; `tests/routes/worker-stage.test.ts:284` reads *"the
extract fire is HELD (ADR-0023 D24)"*; `tests/routes/relay.test.ts:145-152`
carries R8/F-5's honest limit. The OWED tally is unchanged at 39, so no
arithmetic moves. It was disclosed in the commit subject and named in the
packet's "documents that moved after the evidence head" list.

**What I would still flag.** ADR-0023 is a settled dispositions record.
Flipping a **MAJOR** finding's verdict from OWED to FIXED inside it is a
change to the record, made by a build session, between rounds. Everything
about how it was done is exemplary — argued in place, re-verified,
disclosed, tally-neutral — and none of that supplies the authority.
Under ADR-0006's cadence, dispositions are their own session with owner
sign-off.

**Failure scenario.** Not a technical one. The precedent is that a build
session may correct a settled verdict when it is confident the verdict is
wrong, which is the shape of every settled-record drift this cadence
catches.

**Recommendation:** ratify the correction explicitly in ADR-0025, so it
rests on the round's authority rather than the build's.

**Confidence.** High.

---

### F-7 — Q-H attributes a number to the plan that the plan does not state
**Severity:** OBSERVATION
**Where:** packet Q-H; `docs/review/slice-6-plan.md:926`, `:1165`,
`:1234`, `:1291`
**Claim under test:** *"The bound closed at 5 of ≤ 7 with M7 UNCONSUMED,
**as the plan predicted**."*

**What I found.** The plan predicted **6 of ≤ 7**, in four places, all
saying so with M7 unconsumed: *"M7 is NOT consumed and the bound closes
at 6 of ≤ 7"* (`:926`). The plan counted M6's dispositions as spent. The
build closes at 5 because M6 is reserved and not yet spent; it becomes 6
when the dispositions land. The substance — M7 unconsumed, exactly as
predicted — is right; the number attributed to the plan is not the
plan's.

**Recommendation:** confirm Q-H with the count stated as *"5 spent, 6
expected once M6 carries the round-17 dispositions"*, which is both what
happened and what the plan said.

**Confidence.** High — four verbatim citations.

---

## Positions on the packet's nine questions

**Q-A · R4/F-10's DB half was DECLINED. Was that right? — CONFIRM, and
for a stronger reason than the packet gives.** The packet argues that the
only DB remedy would red a settled pin. I checked the pin: `055:453`
does assert exactly that call and does argue the verdict in its own
message, and `059:13` pins the behaviour as unchanged. But the decisive
point is one the packet leaves in a footnote — **the plan's M1 row (2)
already states an app-layer remedy**: *"`processGate`'s shape, applied to
`processInterpret`"* (`slice-6-plan.md:920`). There was no DB work in the
row to decline. And there is no separate DB channel to write a defect
signal into: `invalid_state` **is** the defect signal by this codebase's
own convention — `20260816010004:84` literally comments
`result := 'invalid_state' -- defect signal` — so "absorb it explicitly"
in the database would mean changing what the signal says, not adding one.
The finding belongs wholly at 6B B3.

**Q-B · The manual-entry seam — TAKE IT at M6, with one implementation
note.** Verified: `hc.create_manual_proposal` authorizes on
`hc.visible_at(hc.ctx(), p_subject_id, v_taint, true, null, null, null)
>= 'manage'` (`20260816010006:113`) and asks for no view×5, and the seam
is genuinely pinned at `060:16`. The note: the arrival is created **in
the same transaction**, so it can carry no `object_shares` row and
`visible_at`'s share rung is dead there. The predicate to add is the
**ladder form** — `hc.visible_at(ctx, subject, hc.all_domains(), true,
null, null, null) >= 'view'` — not the arrival form. The arrival form
would also work, but it would read as though a share could rescue it and
nothing ever can.

**Q-C · M1's wider guard — RATIFY the scope, and do not let the
ratification carry the property statement.** The enumeration is right: I
re-derived it from `pg_attribute` and got exactly those seven columns,
and the exclusion of `documents.category` and `timeline_events.kind` is
correct because `hc.own_domain` fail-closes on a null resolution with a
P0001 rather than a `23502`. Non-breaking by construction is sound —
every payload the guard refuses would have raised `23502` a few
statements later, and `059:11` is a real positive control (one object
type, but the argument does not depend on the control). **Ratify the
guard. Do not ratify the sentence "23502 can never surface as a raw
Postgres error at the moment a person clicks approve" as though it closed
the class of raw errors** — see F-1.

**Q-D · The named-and-not-taken 23514 — TAKE IT at M6, but not as one
CHECK.** `timeline_events.temporal_shape` is real and Q-D is right that
the property is not true while it stands. It is also not the only one.
`tasks_check` is a second `23514` of the same shape, already guarded on
the conflict arm of the same function and unguarded on the ordinary arm,
and the unvalidated `p_edits` merge reaches a `22P02`/`22007` cast class
as well (F-1). M6 should either cover all of it or the ADR should restate
the property as *"`23502` and these named CHECKs"* rather than *"no raw
Postgres error at approve."* My recommendation is to cover it: validate
`p_edits -> 'fields'` at the merge, which closes all four channels in one
place rather than one CHECK at a time.

**Q-E · M3 RETIRED a foreign key — RATIFY. I checked the argument, not
the outcome, and all three premises hold.** `hc.claim_stage` really does
`select * into v_budget from hc.stage_budgets b where b.stage = p_stage`
and proceed unless the row is absent (`20260816010004:50-53`), so seeding
`review` really would make `hc.claim_stage(arrival, 'review')` a legal
call for any `hc_pipeline` worker. `entry_state` really is
`not null unique` (`20260816010001:61`). `019:104` really does pin
`hc.stage_budgets` as an ordered aggregate of exactly the five stages, so
seeding would red it. And nothing anywhere joins `arrival_transitions` to
`stage_budgets`, so the FK's removal strands no consumer — I checked
migrations, `lib/`, `app/` and `scripts/`, and only the transition
primitive and the new terminal arm read the table. The invariant really
did stop being true.

**One thing the argument does not consider, and should have.** D3
presents a binary: seed the worker table, or retire the FK. There is a
third option — a small closed stage-vocabulary table that **both**
`hc.stage_budgets` and `hc.arrival_transitions` reference — which keeps
referential integrity, keeps the vocabulary enumerable by query, and
keeps the repo's own shipped pattern. That pattern is not incidental:
`hc.reason_codes`, `hc.log_event_types` and `hc.arrival_transitions`
itself are all seeded lookup tables, and the migration that created
`arrival_transitions` names the pattern in its own comment — *"the
`hc.stage_budgets` pattern: `hc` schema, seeded, append-by-migration"*
(`20260816010009:42-43`). A CHECK is not enumerable, and adding a sixth
stage is now a constraint drop-and-add rather than an insert. The
migration's comment calls the result *"closed, seeded, append-by-migration
and typo-proof"*; three of those four still hold, and the stage
vocabulary is no longer append-by-data. **Ratify the retirement** — the
safety argument is correct and the alternative D3 rejects really is
worse — and record the pattern departure so the next author does not read
an inline CHECK as the house style.

**Q-F · `page_exts text[]` — KEEP the array.** Verified the constraints
do the work the answer claims: `page_count between 0 and 200`,
`cardinality(page_exts) = page_count`, `page_exts <@ array['png','jpg']`
(`20260824120004:109-116`), RLS enabled **and** forced (`:108-109`), and
the read policy carries the same view×5 arrival gate as the pages
(`:118-122`). A child table buys row-level "page 3 is missing" that 6B B2
gets from the storage comparison anyway.

**Q-G · `hc.receipt_for`'s narrow filter — CONFIRM the framing.** The
bound is stated honestly and it is stated in the migration where a
reviewer can check it. I checked it: each destination is looked up
through its own policy predicate reproduced from `20260815230002:290-333`,
`deleted_at is null` included, `profile_facts` at `view` where the other
four read `summary`, `owner_member_id` passed for tasks. The arrival gate
really does dominate the ordinary destinations, so the filter really does
bite only through unresolved lineage, deletion and caps. `063:5-6` drive
it both ways. Confirm — and the packet's own note is the important half:
RCP-01's app half must not over-claim at 6B.

**Q-H · The bound — CONFIRM, with the count corrected.** See F-7. Five
spent, M7 unconsumed as predicted, six expected once M6 carries the
dispositions. Spending M6 on Q-B and Q-D is right; Q-D should be spent as
described above rather than as one CHECK.

**Q-I · THE GATE IS RED. — RED stands, under both readings, and the
round should disposition the SUITE.** I agree with the packet's posture
and with its refusal to use the run-1 reclassification to upgrade the
colour. I confirmed independently that the branch has no code channel:
`git diff --name-only 31a7977..874432f` is 12 files in `supabase/tests`,
5 in `supabase/migrations`, 1 in `scripts/concurrency`, 5 in `docs`, and
nothing under `app/`, `lib/` or `e2e/` — and the F12 binding holds at the
review head, not just at `dd350ad`. **No fourth run**, ruled explicitly
in F-5.

The three suite remedies the packet proposes are right as far as they go:
drive `/api/worker/extract` from `:361` rather than racing the worker,
isolate browser session state between spec files, and consider
`reuseExistingServer: false` for the gate. I would add a fourth, and rank
it first: **`test.describe.serial` turns every fragile leg into a
coverage hole for everything behind it**, and that — not the two named
legs — is why `ingestion.spec.ts:400` has never executed at this tree
(F-5). Any disposition that fixes `:361` and `:102` without addressing
the blast radius of a serial block leaves the next fragile leg free to
hide the same seven tests.

One thing the round should record while accepting RED: **the packet's
"three disjoint failure sets" is corroborated by mechanism, not just by
assertion.** The serial-block semantics reproduce all three "did not run"
counts exactly. That is a point in the packet's favour and it is worth
saying, because it means the run accounting is honest even where the
conclusion drawn from it is incomplete.

---

## What this review did not verify

Stated so the next session does not read silence as coverage.

- **No suite was run.** pgTAP 1590/1590, concurrency 75/75, vitest
  689/689, `db:verify`, the upgrade leg, lint, typecheck, build and
  gitleaks are taken from the packet at `dd350ad` and were **not**
  re-run — a peer session held the shared tree and stack, and every one
  of those commands is global and destructive. The tree binding that
  makes them still apply at the review head **was** re-derived and holds.
- **The browser gate was not run**, and no fourth run was ordered.
- **`hc.revise_object` and the step-up path** carry their own copies of
  the record-table inserts and were not audited against F-1.
- **Runs 2 and 3's classifications** rest on the artifacts the packet
  quotes. I checked that the arithmetic and the serial-block mechanism
  are consistent with them; I did not reproduce the failures.
- **The e2e fixture code** was read only for its structure — describe
  mode, test titles and ordering — not reviewed for correctness.
