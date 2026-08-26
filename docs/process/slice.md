# The slice ritual

Loaded on demand, not every session — `CLAUDE.md` carries the charter, this
carries the procedure. The `slice` skill drives it and holds the templates.

**In force from slice 7.** Slice 6B finishes under the rules it started with.

---

## 1. The tiering rule

> **Review depth is set by what a defect would cost to fix in production — a
> migration and a backfill, or an edit.**

Not by slice number, not by how interesting the increment is. Declared at the
plan gate as an owner ruling, so it cannot drift mid-slice. The owner may raise
a tier mid-round, on the record, before a line is written — the same escalation
valve the migration bound already has. **A tier is never lowered mid-slice.**

| | **Tier 1 — Deep** | **Tier 2 — Standard** | **Tier 3 — Shallow** |
|---|---|---|---|
| **Trigger** | Ships a migration · changes RLS or a policy · touches `lib/ai/` · writes the access log or ledger · auth, provenance, money | Durable side effects, no schema change — workers, routes, state machines, storage, quotas | UI composition, copy, styling, timeout constants, test-only changes |
| **Review** | 3–8 lenses, each given a distinct lens, at least one from a **different model family than the author** | 1 session, attacking the three places the build names against itself | **Batched** — one single-lens pass per slice at close-out, covering all Tier 3 work together |
| **Findings** | Required, landed verbatim | Required, landed verbatim | Short, verbatim, one doc per slice |
| **Dispositions** | Full ADR | A table, not a narrative | Table appended to the slice's dispositions doc |
| **Evidence** | Full closure set + browser gate | Closure set + browser gate if person-facing | Browser gate + lint/typecheck |

### The split rule — the single biggest lever

> **An increment may not contain both a Tier 1 unit and a Tier 3 unit.** If the
> plan produces one, the plan is wrong: the Tier 1 units become their own
> increment, planned and reviewed first.

Without this, the tier of an increment is the tier of its riskiest line, and a
single migration drags a whole screen into Tier 1 — which is exactly how the
cost got here. Slice 6B was **20,001 insertions across 135 files in one
increment with one review round.** Under this rule it is three or four
increments, of which at most one carries a Tier 1 unit and the rest buy no
external round at all.

**Fail closed:** a unit whose tier has to be *argued* is Tier 1 until the owner
rules it down at the plan gate. A tier is never lowered mid-slice.

### Why the trigger is irreversibility, not surface area

A DB unit has a **mechanical oracle** — pgTAP, catalog sweeps, the two-session
concurrency layer, `db:verify`. Review's job there is falsification against a
fixed surface, and it finishes. That is why DB increments have held flat at
20–30 commits across seven of them.

An app unit has no oracle, so review substitutes for the missing one — and that
substitution scales with **surface area**, not with risk. Scaling review with
surface area is what took app increments 30 → 38 → 68 → 70+. The rule's whole
job is to stop buying a Tier 1 review for Tier 3 work.

**Why Tier 3 is batched rather than skipped.** Round 18 found two legs that were
*passing while checking less than they claimed* — a defect class the gate
structurally cannot catch, because the gate was green. One cheap adversarial
read per slice covers that class at roughly one session, against the
four-artifact fixed cost of a full round.

Point the batched pass at the two things a gate cannot see:

1. **Legs that assert less than their titles.** ADR-0027 D17 item 5 carries *"the
   one-time leg-integrity pass — 31 of 38 legs remain."* Make it recurring: each
   batched pass audits a fixed quota of unaudited legs until the backlog clears.
   A recurring quota converges; a one-time obligation is the exact shape of item
   that sat at "39 OWED" for three rounds.
2. **Person-facing copy that drifted from the spec it cites.**

**Calibration against history.** 6A was a DB increment — Tier 1 — and cost 25
commits; correct. 6B was a review screen plus a route budget — Tier 2 — and cost
70+ and is still open. DB increments have held flat at 20–30 commits across the
whole project while app increments went 30 → 38 → 68 → 70+. The rule exists to
invert exactly that.

---

## 2. The ritual

Each leg is **its own fresh session**, from a kickoff regenerated against the
current committed docs (ADR-0006). The prompt is the contract that makes context
disposable — never rely on a prior chat's memory, never reuse a stale kickoff.

| # | Step | Artifact | Session |
|---|---|---|---|
| 1 | Plan-gate kickoff | `docs/review/slice-N-plan-kickoff.md` | prior/owner → fresh planner |
| 2 | Write the plan (docs-only, CI green — **not code**) | `docs/review/slice-N-plan.md` | planning |
| 3 | **Owner rulings**, recorded verbatim; status → `PLANNED — RULED` | edits to the plan | owner |
| 4 | Build kickoff, per increment | `docs/review/Na-build-kickoff.md` | prior/owner → fresh builder |
| 5 | Build red→green per unit, failure signature in every red commit | commits | build |
| 6 | Close-out evidence at the increment head | tee'd run logs | build |
| 7 | Flip coverage rows — **never early** | `docs/coverage.md` | build |
| 8 | Deltas ADR (`Status: proposed`) | `docs/adr/NNNN-*-deltas.md` | build |
| 9 | Review packet | `docs/review/round-N-packet.md` | build |
| 10 | PR, body checked into the tree | `docs/review/round-N-pr-body.md` | build |
| 11 | Round kickoff | `docs/review/round-N-kickoff.md` | build/owner → fresh reviewer |
| 12 | **Findings, landed VERBATIM before a word is argued** | `docs/review/round-N-findings.md` | reviewer (read-only) |
| 13 | Dispositions | ADR (T1) or `round-N-dispositions.md` (T2/T3) | dispositions |
| 14 | Owner sign-off | ratification section + ledger updates | owner |
| 15 | **Merge** — `--no-ff`, SHA stamped back into the ADR | merge commit | **owner only** |

**Tier 2 collapses steps 8–13** into one deltas doc plus one dispositions table.
**Tier 3 skips 9–13 per increment**, and takes the batched pass once at step 6.

### Step 6 — the closure evidence set

Clean-leg reset at the exact migration count · pgTAP green with the count
recorded exactly · concurrency green (**teed**) · `db:verify --fail-on warning`
clean · upgrade leg green · vitest count recorded exactly · **the local browser
gate with its new total stated exactly, never as "unchanged"** ·
lint/typecheck/production build clean · gitleaks clean · coverage rows flipped.

### The narrative

The dispositions record holds the decision and its consequences. It does **not**
hold the story of the round — that is what `round-N-pr-body.md` is for, and it
is already written, already checked in, and already read. **Target for a Tier 1
dispositions ADR: 150 lines.** ADR-0003 dispositioned the review of the entire
RLS permission kernel in 44.

The vault build log is not revived. It stopped on 2026-08-17 because its content
migrated into these artifacts, which are richer and live in the authoritative
repo.

---

## 3. Bounds, set at the plan gate

| Bound | Rule |
|---|---|
| **Migration** | A number. Reserves NAMED, not blank — an unnamed reserve is the one that gets amended. Past the bound is an owner amendment before a line is written. |
| **Dependency** | Runtime slots, each argued **with its licence**, re-verified from the installed manifest. Dev-dependency reserve tracked separately. |
| **Tier** | Per increment, an owner ruling. |
| **Named exclusions** | An unlisted surface is out of scope by construction. |
| **Owed intake** | How many ledger items this slice TAKES, priced against its own scope — *take the owed finding whose failure a person now reads; defer the one whose only reader is a worker.* |
| **Coverage rows** | Which rows the slice opens, and at what status. |

---

## 4. What the reviewer is told

Invariant across tiers; only the lens count changes.

1. **Read-only. Fix nothing** — dispositions are their own session.
2. **Attack the packet's and the ADR's claims rather than accept them.**
3. **A clean area reported clean is a result; inventing findings is not.**
4. Quote the line a finding rests on and construct a concrete failure — or
   downgrade it to an observation.
5. Re-confirm CI yourself, anonymously (`gh` stays UNAUTHENTICATED). You may read
   per-step conclusions but **never suite tallies** out of CI.
6. Attack the places the build session nominates against itself, and rule on the
   packet's pointed questions.
7. **If a finding needs DDL, say so and stop** — the amendment is the owner's.
8. Assume no repo access: the package must be self-contained, and anything not
   supplied is named, with a **CONTINGENT** finding class for claims resting on
   unseen code.
9. **⏸ STOP at the gate.**

Findings are addressed `R<n>/F-<m>` when multi-lens — each reviewer's own
numbering preserved, never renumbered, so that *verbatim* means what it says —
and plain `F-<m>` when single-session. Severity is the reviewer's.

---

## 5. FIXED vs OWED

**Not severity — evidence availability.** A fix lands in this round when its
evidence can be produced in this round; where a change is person-facing, that
evidence is a browser leg. A MODERATE finding gets fixed because one targeted
leg can prove it; a MAJOR one is owed because no evidence available here can
settle it.

Every owed item carries an **acceptance condition** — an owed item without one
is a wish. It goes to `docs/owed.md`, which is capped at **25 OPEN**.

**ADRs record verdicts and are immutable. `docs/owed.md` records facts and is
live.** A build session may flip a ledger row to `CLOSED` with a commit SHA,
because "this landed at `abc1234`" is a fact. Changing a *verdict* still requires
a round (ADR-0025 D6). That split is what lets the queue burn down without
touching anyone's authority.

When amending an as-built record, **never rewrite it**: a head index plus a
marker at each site, with the original prose preserved everywhere.

**Re-tally every disposition table mechanically before ratifying.** Round 16
shipped an ADR whose prose said "seven BLOCKERs fixed / three escalated" where
its own table said eight and two. `tests/lint/process.test.ts` now checks this.
