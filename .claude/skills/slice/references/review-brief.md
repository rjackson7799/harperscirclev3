# Commissioning a third-party review

Promoted from `round-15-commission-2026-08-21/round-15-review-brief.md`, which
was the best reviewer-facing doctrine in the project and was filed under
*evidence* — so it was never reused. This is the template; the round-15 file
stays where it is as that round's record.

**Lens count is set by tier** (`docs/process/slice.md` §1): T1 gets 3–8 distinct
lenses, T2 gets one, T3 is batched once per slice. Round 16 ran eight lenses at
an app increment and harvested 113 findings — that is a T1 spend on T2 work, and
it is the shape the tiering rule exists to stop.

---

## The brief

> # COMMISSIONED ADVERSARIAL REVIEW — Harper's Circle, round `<N>` (slice `<S>`)
>
> You are the **independent third-party reviewer** for round `<N>`. You were
> chosen from a **different model family than the author** deliberately: the
> author built this increment and wrote every document below, so agreement is
> worth nothing and independent falsification is worth everything.
> **This package is self-contained — assume no repository access.**

### 1. What you are reviewing

Name the increment, the branch, the base, the **evidence head** and the **docs
head**, and what is *not* in it by design.

### 2. The authority order — findings are judged against this, in order

1. `docs/review/slice-N-plan.md` — the **ruled** questions are SETTLED.
2. TSD/PRD as amended by their annexes (the as-built state is normative).
3. The inherited ADRs, named individually.
4. ADR-0006 — the review cadence; the owner is sole merge authority.

> **A settled ruling is not a finding.** If you believe a ruling is wrong, say so
> as a *recorded dissent* and label it that way — do not file it as a defect.
> The rulings were made with the trade-offs on the table.

### 3. What you should try hardest to break

> The author's own pointed questions are where they *think* the risk is.
> **The best findings are usually somewhere else.**

Hunt categories — include the ones the tier makes live:

- **Authorization** — a missing `search_path`, an in-function predicate that
  does not match the route's, a definer that trusts its caller, a privilege
  leaking through `hc_pipeline`/`hc_internal`/`hc_runtime`, a `GRANT` wider than
  argued.
- **Concurrency** — lost updates, TOCTOU between an authorization read and the
  write it guards, CAS gaps, version races, detection racing a freeze.
- **Idempotency** — can a replay write twice? Can two different outcomes both
  commit?
- **State machine** — is the graph closed? Can a row reach a forbidden state, or
  strand?
- **Data correctness** — byte-stability claims (timezone, collation, ordering
  ties, `NULL`), matching predicates (does absence ever wildcard? can it match
  across circles or subjects? can a re-run match itself?).
- **Claims the tests do not actually prove** — an assertion that would pass even
  if the behaviour were absent, or one that asserts the fixture rather than the
  function. **Round 18 found two passing legs checking less than their titles
  claimed; this category is the highest-yield one in the list.**

### 4. What is NOT in scope — name it, do not leave it implied

List the units, gates and surfaces belonging to other slices. An unlisted
surface invites a finding you will then have to decline.

### 5. What is NOT supplied — be honest about this

Name exactly what the reviewer cannot see.

> Where a finding depends on something you cannot see, **say so and mark the
> finding CONTINGENT** on that unverified assumption, rather than asserting or
> staying silent. A precise contingent finding is valuable; a confident wrong
> one is not.

### 6. Verifiable facts

Repository URL, CI run IDs at both heads, the per-directory tree binding that
transfers evidence from the evidence head to the docs head, and the recorded
closure evidence — **stated as the author's claim, not as the reviewer's to
re-run**.

> If any of those are false, that is itself a finding of the first order.

`gh` stays UNAUTHENTICATED. Per-step conclusions are readable; **suite tallies
are not** — never quote one out of CI.

### 7. Standing constraints — a violation is a finding

The migration bound and what is spent · shipped migrations are frozen · the
dependency bound, each argued **with its licence** · no real family data, ever;
no real document to a provider (G9/G3) · any migration-authoring rule in force
(e.g. a new enum value added by `ALTER TYPE … ADD VALUE` is usable only one
migration later — the recorded 55P04 rule).

### 8. How to report

Output shape is in `references/findings.md`. It lands in the repo **verbatim,
before anything is argued**.

> Do not propose dispositions or write code — dispositions are the next
> session's, by ADR-0006. Your job ends at the verdict and the findings.
>
> **⏸ STOP at the gate.**
