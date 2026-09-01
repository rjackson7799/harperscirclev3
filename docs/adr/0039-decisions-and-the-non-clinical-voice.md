# ADR-0039 — Decisions in the record, and the product's voice outside health

**Status:** proposed — owner amendment, docs-only
**Date:** 2026-08-31
**Base:** `origin/main` @ `18c362d` (PR #33, round 26). PR #34 (slice 7C) is open and unmerged.
**Supersedes:** nothing. **Amends:** PRD §3.1, §5, §6, §12; `docs/eval/g9-corpus-spec.md` §7.

There is no round behind this ADR and no findings file. It records an **owner
amendment made before a line is written**, which is what the charter requires of
anything past a bound, and it is the artifact the owner rules on.

---

## 1. What raised it

A live scenario, not a hypothetical: a parent's air conditioning fails, three
contractors quote it, and the choice has to be made against a homeowners policy
and a warranty that may or may not still be live.

Walked through the existing loop, **the product already ingests, reads, files,
dates and finds every piece of this with no new code.** Quotes forward in and
hold at `Held · unknown sender` until a person accepts each sender (§4.2.8 —
correct, and exactly the elder-fraud case that state exists for); amounts and
expiry dates extract as **high-risk fields** under §6.4, so none is pre-selected
and the cited crop is on screen before approve activates; a quote files as
`financial` → **finances**, the policy as `insurance` → **finances**
(ADR-0005), the warranty as `other`/`legal` → **documents**; the timeline holds
the sequence as `admin`; search finds all of it, permission-filtered.

That is worth stating plainly, because the gap is narrower than it first looks.

## 2. What is missing — three things, and only three

1. **No object for an open decision with competing options.** The record is
   `document | task | timeline_event | profile_fact | episode`
   (`hc.object_type`). Three quotes are three documents in one category,
   indistinguishable from three unrelated invoices. Nothing in the model says
   *these are alternatives to one another and exactly one will be chosen*, so
   the comparison lives in the coordinator's head — which is the failure PRD §1
   opens with and the thing the product exists to end.

2. **No counterparty.** §4.6 holds people with *access*; a contractor has none
   and must never have any. `known_senders` is an ingestion-security list, not a
   record object.

3. **"The best way to proceed" is an output class the AI contract does not
   have.** §6.6's table is written about clinical claims, but the work is done
   by its right-hand column — *any statement in the product's own voice* — not
   by the word *clinical*.

## 3. The rulings

### R1 — The product never states which option to take. **RULED: it does not.**

Written into the PRD as **§6.9**, appended rather than renumbered (renumbering
§6 would break every citation into it), with additive pointers left at §6.5 and
§6.6. No existing sentence in either section was rewritten.

The restraint costs something, so §6.9 specifies what replaces it rather than
leaving consolation: the **comparison** (cited, per-cell), the **relationships**
between records (§6.8's moat, already shipping as §4.2.5 conflicts), the
**gaps** — what the record does not say, which is the highest-value output on a
decision and asserts nothing about the world — and the family's **criteria,
applied**, where *the weighting is a human input*. That last is the hinge: an
ordering against declared criteria is a comparison; an ordering against
undeclared criteria is a recommendation wearing a table's clothes. §6.9
therefore refuses to render an ordering with no criteria entered.

### R2 — The shape, when built, is a new `decision` object. **RULED.**

Not a new module, and not an extension of `episodes`. `public.episodes` is
already the right *shape* — a wrapper over record objects, AI-**proposed** and
never written, human-accepted, carrying its own provenance and taint, and
forbidden from concealing its members — but it wraps the past and has no
options, no criteria and no outcome. Overloading it would give every existing
episode row four permanently-null columns.

`decision` appends to `hc.object_type` and `hc.proposal_kind`. **That append is
cheap now and a migration-plus-backfill once the record has volume**, which is
the entire reason this is recorded at §5 today rather than discovered in Phase
2 — the same argument §5 already makes for the person profile.

N1 and N2 both hold without special pleading: a decision is *proposed*, never
written; choosing an option is a write with an approver, a date and a revision;
and the **unchosen options are retained**, because six months later *why we
picked them* is the question a sibling asks. Taint is the transitive union over
every option's sources (§7.6), so a decision over three quotes and a warranty
renders at `min(finances, documents)` — which is correct, and free.

### R3 — Scope now is docs-only. **RULED.**

Slice 7 is mid-flight and slice 8 is Search + Home. A `decision` object ships a
migration, touches taint and touches `lib/ai/` — **Tier 1** — and the migration
bound for it does not exist until a plan gate sets it.

## 4. What this deliberately does not do

- **No `property`/`household` domain.** `hc.domain` is a five-value enum pinned
  by an exact-set pgTAP assertion, `hc.all_domains()` is IMMUTABLE and
  hard-coded, and G8's ordered-pair red-team goes 20 → 30 pairs at six domains.
  That is a migration, a backfill of every taint array and a G8 re-run. The
  scenario does not need it: quotes and the policy route to finances, the
  warranty to documents, correctly, today. A family wanting to hide home
  paperwork separately from money is a real want and is not this.
- **No vendor table.** A free-text counterparty name on an option carries it
  until §12.12 is ruled. The scenario needs a comparison, not a CRM.
- **No corpus change.** Widening `fixtures/g9` re-pins §3, §4.1 and §6 in the
  same commit and is therefore code. §7 row 4 **prices** it; it is not bought.
- **No coverage rows and no owed rows.** §5 intents and §12 questions carry no
  acceptance criteria and prove nothing, so there is nothing to flip and nothing
  to owe. The 25-cap and the burn-down quota are untouched.

## 5. The one time-sensitive item

**§12.13 has a real clock on it.** G9's corpus covers the medical family and the
insurance *claims* family (`eob` → `amount`, `policy_number`, `member_id`,
`coverage_determination`). It carries no coverage-terms class, no warranty-term
class and no offer class — so every field in a policy, a warranty or a quote
ships **all-high-risk** under §6.5's shipping default. That is safe and it is
unusable at vault scale: nothing is ever pre-selected.

`BAND_ARTIFACT_ALLOWLIST` is empty and G9-1…G9-5 are all ☐, and
`g9-corpus-spec.md` §8 is explicit that **changing a blind item after bands are
signed invalidates those bands**. The cheap window is therefore open right now
and closes at the owner's signature. Priced as §7 row 4; not bought here.

## 6. Changes in this PR

| File | Change |
|---|---|
| `docs/PRD.md` §3.1 | One row — Decisions, Phase 2, marked **not a Scope v3 surface** |
| `docs/PRD.md` §5 | The Decisions intent, with its model implication |
| `docs/PRD.md` §6.5, §6.6 | Additive pointers to §6.9. No existing sentence rewritten |
| `docs/PRD.md` §6.9 | **New** — the product does not state a preference |
| `docs/PRD.md` §12 | §12.12 the counterparty · §12.13 the non-medical extraction families |
| `docs/eval/g9-corpus-spec.md` §7 | Row 4, priced not bought; the row-count sentence corrected to match |

No code, no migration, no fixture, no coverage row, no ledger row.

## 7. Ballot

| # | Item | Put |
|---|---|---|
| B1 | R1 — the product never states which option to take; §6.9 as written | RATIFY / AMEND |
| B2 | R2 — a new `decision` object, `episodes`' shape, when it is built | RATIFY / AMEND |
| B3 | R3 — docs-only now; the object goes to a plan gate, not this PR | RATIFY / AMEND |
| B4 | §12.12 and §12.13 as open questions, with the deadlines as stated | RATIFY / AMEND |
| B5 | `g9-corpus-spec.md` §7 row 4 — priced, **not** bought in this PR | RATIFY / AMEND |
| B6 | Merge order — this PR lands **after** PR #34 | RATIFY / AMEND |
