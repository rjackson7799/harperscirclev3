# The features file — candidates, and nothing else

<!-- features-schema: 1 -->

> **This file binds nothing.** It is not the PRD, not an ADR, not
> `docs/coverage.md` and not `docs/owed.md`. Nothing written here is planned,
> scheduled, owed, or promised. **A session that builds from this file has
> skipped every gate the charter has.**

## Why it exists

Ideas arrive from real use — a parent's air conditioning fails, a will needs
updating, a house needs to be made safe — and until now there was nowhere for
them to go. They ended up in ADR prose, in a chat, or nowhere.

Each of the neighbouring files already has a job, and none of them is this one:

| File | Holds | Binds |
|---|---|---|
| `docs/PRD.md` §4 | Phase 1 surfaces, built | Yes — with acceptance criteria |
| `docs/PRD.md` §5 | Phase 2/3 intents that **are** planned | Yes — keeps the data model honest |
| `docs/PRD.md` §12 | Open questions about things **already in scope**, each with a deadline | Yes — a deadline is an obligation |
| `docs/coverage.md` | What is proven, per assertion | Yes — authoritative |
| `docs/owed.md` | Findings that **block a merge** | Yes — a row is ADR-0006's blocking artifact |
| **this file** | Candidates that are in none of the above | **No** |

## Why it has no cap, and why that is not the old mistake

`docs/owed.md` opens with the diagnosis of the 39-OWED failure: *"A queue with no
legal standing has no cap, no owner and no exit, so of course it only grew."*
That is the right lesson and it does not transfer unchanged.

An owed item **blocks a merge**, so an uncapped owed queue is a growing pile of
unresolved blockers — which is why that file is capped at 25 and carries a
burn-down quota. A candidate here **blocks nothing**. Capping it would only force
the deletion of ideas at an arbitrary number, which is not a discipline, it is
amnesia.

What this file needs instead is that **an entry can never be mistaken for a
commitment**. Two mechanisms do that work: the banner at the top, and the exit.

## The exit — the only two ways an entry leaves

- **PROMOTED(adr)** — it becomes a PRD §5 intent or a §12 open question, **ruled
  by an ADR**, and is plannable at a plan gate only after that.
  **ADR-0039 is the worked precedent**: the AC-repair scenario produced PRD §5's
  *Decisions* intent, §6.9, and §12.12/§12.13, in a docs-only owner amendment made
  before a line was written. *(Ruled 2026-09-01 on PR #35; pending merge behind
  PR #34 at the time of writing.)*
- **KILLED(reason)** — deliberately not doing it, with the argument on the record.

There is no third way, and "carrying" is fine here — carrying is the file's
normal state. That is precisely what distinguishes it from the ledger.

## Status vocabulary

Deliberately **not** `docs/owed.md`'s, so the two can never be read as one queue.

| Status | Meaning |
|---|---|
| `CANDIDATE` | Written down. Argued only as far as it needed to be to be worth writing down. |
| `SHAPED` | Enough design exists that a plan gate could price it. Still not planned. |
| `PROMOTED(adr)` | Left this file. Lives in the PRD now, under the named ADR. |
| `KILLED(reason)` | Deliberately not doing it. |

IDs are `FEAT-<n>`, assigned in intake order, **never reused and never
renumbered** — a handle for citation, not a rank and not a priority.

## The entry template

**What it is** · **the scenario that raised it** · **what already exists** ·
**what it would cost** · **open questions** · **status**.

The cost line is the one that earns its keep. An idea with no cost written next
to it is how a backlog becomes a wish list.

---

# Entries

## FEAT-01 — Projects

**Status:** `CANDIDATE`

**What it is.** A container a *person* declares for a one-time piece of work —
replace the air conditioning, get the will updated, move Mom to assisted
living — which then accumulates documents, tasks, timeline events and decisions,
carries a **status** (`active` / `paused` / `archived`) and a **category**, and
can be referred back to a year later.

**The scenario that raised it.** A parent's AC failed. Three contractors quoted
it; the choice ran against a homeowners policy and a warranty that might still
have been live; several family members were involved; it produced a handful of
tasks. Six months later the question *"who did we use, and why?"* has no place to
be answered from.

**What already exists.** More than it looks like, and it is worth being precise,
because the gap is narrower than the ask implies. The record ingests, reads,
files, dates and finds every artifact in that scenario today: quotes hold at
`Held · unknown sender` until a person accepts each sender (§4.2.8), amounts and
expiry dates extract as high-risk fields (§6.4), a quote files `financial` →
finances, the policy `insurance` → finances (ADR-0005), the warranty
`other`/`legal` → documents, and the timeline carries the sequence as `admin`.

What does not exist is the container. Tasks, documents and timeline events are
tied together by **search and nothing else**. There is no status axis anywhere in
the record — `tasks.status` is `open | done | cancelled`, which is a task's
lifecycle, not a project's — and no category axis outside `hc.doc_category`,
which is load-bearing for permissions and must not be reused here.

**What it would cost.** Tier 1 by the charter's own trigger: a migration, new
RLS, and taint. Three constraints are known already and are the reason this entry
exists rather than a straight "build it":

1. **Membership is not provenance, and conflating them breaks the permission
   model.** Taint is the transitive union over `provenance_edges` (§7.6). If
   membership were an edge in that table, every item in a project would inherit
   every other item's domains. A project holding three quotes (finances), the
   policy (finances), a warranty (documents) and a task *"let the installer in on
   Tuesday"* (schedule) would render that task at
   `min(schedule, finances, documents)` — and the caregiver who needs to open the
   door sees **nothing**, because the project she is helping with also contains
   the family's insurance policy.

   That is not a defect in taint. Taint is right. **Being in the same container as
   a financial document does not mean you were derived from it.**

   The shipped precedent gets this correct and should be copied exactly:
   `public.timeline_events` carries a plain `episode_id` foreign key
   (`supabase/migrations/20260815230002_record_tables.sql:161`), **not** a
   provenance edge. The container computes its taint **from** its members; members
   inherit nothing **from** the container. Flow goes up, never down. A project
   would need the same, generalised to four member types — a join table shaped
   like `provenance_edges` but explicitly without its semantics.

2. **A project category must never become a permission domain.** Document
   category → domain is load-bearing (§4.3.2, ADR-0005), and a category axis that
   *looks* like a domain will eventually be wired to one by someone who has not
   read this. The category here is a label for the family, and nothing else reads
   it.

3. **Status is a genuinely new axis.** Nothing in the record has an
   active/paused/archived lifecycle. `archived` in particular needs its meaning
   pinned against §11.5's retention matrix and against soft-delete: archiving is
   **not** deleting, an archived project's members stay in the record and stay
   searchable, and nothing about archiving may start a purge clock.

**Open questions.**

- **Q1 — Do the four containers unify?** The PRD would then carry four: `episodes`
  (shipped, AI-proposed, retrospective, over timeline events), **Checklists**
  (§5, Phase 2), **Decisions** (§5, Phase 2, ADR-0039) and **Projects**. They nest
  rather than compete — a project contains a decision, may be driven by a
  checklist, and an episode is the same story told backwards from the timeline. An
  episode is the AI recognising a container *after the fact*; a project is a
  person declaring one *up front*.

  > **Deadline: before any Phase-2 container is built.** Zero of the three
  > unbuilt containers exists in code today, which makes this the cheap moment.
  > Once Checklists ships, unifying them is a migration and a backfill. This is
  > the whole reason FEAT-01 is written down now rather than when it is wanted.

- **Q2 — Subject-scoped or circle-scoped?** The AC serves the house, not Nell or
  Marcus. See **FEAT-03**; they are the same question and should be ruled together.
- **Q3 — Who may create, pause and archive one**, when a project spans domains the
  actor holds at different levels? The natural answer — manage on every domain in
  the project's taint — makes a project harder to archive than to create, which may
  be correct and is certainly surprising.
- **Q4 — Does a project appear on the timeline?** A project is not an event, but
  *"the AC was replaced"* is. Probably a timeline event references the project
  rather than the project rendering as one.

**Related:** FEAT-03 (scope), FEAT-04 (a project is one answer to *"what needs
attention"*), PRD §5 *Decisions* and *Checklists*, ADR-0039.

---

## FEAT-02 — A property / household domain

**Status:** `CANDIDATE`

**What it is.** A sixth permission domain for the home itself — repairs, the
deed, contractor paperwork, utilities — separable from **finances**, where
insurance and financial documents live today.

**The scenario that raised it.** The same AC repair. A family may reasonably want
a sibling to see the house's paperwork without seeing the bank statements, and
today those are one domain.

**What already exists.** The five domains route the AC scenario **correctly**
without this: quotes and the policy are finances, the warranty is documents. The
want is separability, not correctness — which is exactly why it is a candidate and
not a defect.

**What it would cost.** Named in ADR-0039 §4, which ruled it out of that
amendment while recording the want verbatim: *"A family wanting to hide home
paperwork separately from money is a real want and is not this."* The cost:
`hc.domain` is a five-value enum pinned by an exact-set pgTAP assertion,
`hc.all_domains()` is `IMMUTABLE` with the five hard-coded, every taint array in
the record needs backfilling, and **G8's ordered-pair red-team goes from 20 pairs
to 30** — each needing a named derived object and a test that it does not cross.

**Open questions.** Whether the want is better served by object-level shares
(§4.3.5), which already exist and already do "one named thing for one named
person", than by a sixth domain that every future feature must then reason about.

---

## FEAT-03 — Circle-scoped record objects

**Status:** `CANDIDATE`

**What it is.** A record object that belongs to the **circle** rather than to one
subject.

**The scenario that raised it.** The house. The AC serves both parents; so does
the roof, the deed and the utility account. FEAT-01 has nowhere to put a project
that is not about one person.

**What already exists.** Nothing, and the model is actively against it: every
record table is `(circle_id, subject_id)` with **`subject_id NOT NULL`** —
`episodes`, `documents`, `tasks`, `timeline_events`, `profile_facts`, without
exception. Grants are keyed `(member, subject, domain, level)` and §7.1 states
flatly that **there is no circle-wide access level**.

**What it would cost.** More than a nullable column. A circle-scoped object has no
subject to key a grant on, so it needs an answer to *"who can see it"* that the
permission model does not currently have — and §7.1's "no circle-wide access
level" exists on purpose. It also cuts against PRD §4.1.3's deliberate
anti-household ruling: *"situation and location are properties of a subject, not
of a household"*, which was a correction of a prototype bug, not an oversight.

**Open questions.** Whether the cheaper answer is that a household project simply
**names both subjects** — visible to a member who can see either, or only one, and
that choice is itself the question. That would need no new scope concept at all.

**Related:** FEAT-01 Q2. Rule them together.

---

## FEAT-04 — A standing review across the whole record

**Status:** `CANDIDATE`

**What it is.** A recurring sweep over everything already filed, surfacing what
needs attention: a policy lapsing, a warranty ending, a registration expiring, a
follow-up window with nothing booked against it.

**The scenario that raised it.** Stated directly by the owner: these judgements
*"should be made on all items in the Vault — homeowners insurance, warranties
etc."*

**What already exists.** Half of it, at the wrong moment. §4.3.3 has the AI *"flag
expirations and renewal windows as proposed tasks with real dates"* — but that
happens **at ingestion**, once, as a document is read. Nothing ever looks at the
filed record again. A policy read in March whose renewal falls in November
produced its task in March or not at all.

The Weekly Brief (§5, Phase 2) is adjacent and not the same thing: it reports
*what changed*, and this is about **what did not change and should have**.

**What it would cost.** A scheduled sweep, which means a worker, per-member
scoping (§7.6 taint applies to anything it surfaces), and — the hard part —
**idempotence**: a sweep that proposes the same task every week is worse than no
sweep. It also has to respect N1: a sweep proposes, a person approves. It writes
nothing.

**Open questions.** Whether this is a surface at all or simply the Weekly Brief
grown a second section. Probably the latter, which would make this a **§5
amendment to Weekly Brief** rather than anything new — and if so it is cheap and
should be ruled early, because the brief's model implication is already written.

---

## FEAT-05 — The counterparty as an entity

**Status:** `CANDIDATE` — cross-reference only

**What it is.** A first-class record for a party the family deals with and who
has no access: a contractor, an adjuster, a claims examiner, a facility's
admissions office.

**Why it is only a cross-reference.** **PRD §12.12 already carries this as an open
question** — *"Does a counterparty become an entity, or stay a name on a decision
option plus a provider fact?"* — with a deadline of *before the decision object's
schema is frozen*. The question is promoted; the entity *answer* is the candidate.

This entry exists so the idea is findable from here, and it **must not be argued
in this file**. §12.12 is where it is settled. If it is ever answered "entity",
this row is `PROMOTED` by that ADR; if answered "a name plus a fact", it is
`KILLED` by the same one.

**Related:** FEAT-01 (a project's counterparties), PRD §12.12, ADR-0039.
