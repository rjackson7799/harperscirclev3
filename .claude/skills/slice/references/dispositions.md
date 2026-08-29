# Dispositions, and the ADR split

An ADR of 1,098 lines is doing three jobs. Split by **who must obey the result**.

| Job | Home | Size |
|---|---|---|
| **Decision record** — what a future session must obey | `docs/adr/NNNN-*.md` | **≤ 150 lines (T1) · ≤ 60 (T2/T3)** |
| **Disposition table** — every finding, with a verdict | `docs/review/round-N-dispositions.md` | any length; it is a table |
| **Narrative** — the wrong turns, the nine gate runs | `docs/review/round-N-pr-body.md` | already written, already read |

ADR-0003 dispositioned the review of the entire RLS kernel in 44 lines. Most of
a 1,000-line ADR is "what we fixed and why" — nobody must obey that.

**The build log is not revived.** It died on 2026-08-17 because its content
migrated into these artifacts, which live in the authoritative repo. The PR body
is the narrative's home.

## Verdicts

`FIXED` · `OWED` (accepted, argued, scheduled, not fixed here) · `OWNER`
(escalated) · `ACCEPTED-NOTE` (record correction, no code change) · `DECLINED`
(with the argument) · `NOTED` (verified positive or observation).

Compound verdicts are legal and often honest: *"ACCEPTED · FIXED, with the
composition limit OWED."*

## FIXED vs OWED is evidence, not severity

> A fix lands in this round when its evidence can be produced in this round —
> and where a change is person-facing, that evidence is a browser leg.

A MODERATE finding gets fixed because one targeted leg proves it; a MAJOR one is
owed because no evidence available here settles it. Say which, per row.

## Every OWED row goes to the ledger

`docs/owed.md`, with an **acceptance condition** — *an owed item without one is
a wish.* Capped at 25 OPEN, and the cap is a test.

`OWED` was never a legal disposition under ADR-0006's blocking rule (applied
artifact + named test, **or** accepted-risk with a coverage row). The ledger row
is what makes it legal; the cap and the burn-down quota stop that being a
loophole. Recorded as an amendment to ADR-0006, not as a reading of it.

## Re-tally mechanically before ratifying

Round 16 shipped an ADR whose prose said *"seven BLOCKERs fixed / three
escalated"* where its table said eight and two, **and** two rows read OWED for
fixes that had landed. Both were caught by luck.

1. Count the verdict column **with a command**, not by eye.
2. Reconcile against the prose summary.
3. Reconcile every OWED row against `docs/owed.md` — a row reading OWED for
   something already closed is that defect recurring. It has now recurred three
   times (R3/F-9, R6/F-6, R8/F-1).
4. Reconcile the ledger's open count against the cap.

`npm run test:app` covers 3 and 4. Steps 1 and 2 are still yours.

## Amending an as-built record

**Never rewrite it.** A head index plus a marker at each site; the original
prose stands. A build session that finds a settled record wrong **records the
discrepancy and leaves the verdict alone** (ADR-0025 D6); the next round rules.

One exception: flipping a `docs/owed.md` row to `CLOSED` with a commit SHA is a
*fact*, not a verdict, and a build session may do it. That split is what lets
the queue burn down without touching anyone's authority.
