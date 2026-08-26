# The findings document

Lands in the repo **VERBATIM, before a word is argued** — the `5faccc4`
precedent, restated at ADR-0023 and ADR-0025. Committing the reviewer's text
unedited is what makes the disposition an argument rather than a rewrite.

Path: `docs/review/round-N-findings.md`.

## Numbering

- **Multi-lens (T1):** `R<n>/F-<m>`. Each reviewer's own numbering is
  **preserved, never renumbered into one sequence** — otherwise "verbatim" does
  not mean what it says.
- **Single-session (T2, batched T3):** plain `F-<m>`.

**Severity is the reviewer's.** The disposition may argue with it; it may not
silently restate it.

## Required shape

```markdown
> **Reviewed:** <increment>, branch `<b>` @ `<sha>`, base `main` @ `<sha>`.
> **Independently verified:** <what the reviewer checked themselves>.
> **Taken on trust:** <what they could not check>.
> **Verdict:** <one line — e.g. "approve with findings — one HIGH I would fix
> before merge">.

## What was independently verified
<The ground the findings stand on, separated from what was assumed.>

## Findings, most severe first

### F-1 — <SEVERITY> — <one-sentence claim>
**Confidence.** <high/medium/low, and CONTINGENT on what, if anything.>
**Where.** `path/to/file.ts` — function or symbol. Cite E2E legs BY TITLE.
**Claim under test.** <quoted from the packet or the ADR>
**What I found.** <the mechanism>
**Failure scenario.** <concrete inputs/state → wrong outcome>
**Why the tests miss it.** <or: they do not, and here is the one that catches it>
**What would close it.** <fix, flagged DDL-or-not>

## Confirmations
<Areas checked and found clean, named explicitly — so silence is never
ambiguous. "A clean area reported clean is a result; inventing findings is not.">

## Answers to the pointed questions
<Ratify or dissent on each, with the argument.>

## Recorded dissents and observations
<Not defects. Kept separate so they are not mistaken for them.>
```

## The two rules that decide quality

1. **Quote the line the finding rests on and construct a concrete failure — or
   downgrade it to an observation.** A finding without a failure scenario is an
   opinion with a severity attached.
2. **Mark CONTINGENT anything resting on code the package did not supply.** A
   precise contingent finding is valuable; a confident wrong one costs a round.

## Highest-yield category, from the record

**A passing test that checks less than its title claims.** Round 18 found two
(F7, F8) — a leg is green, so no gate can catch it, and the coverage row it
backs reads green on evidence that does not exist. Ask of every green claim:
*what would this assertion do if the behaviour were simply absent?*
