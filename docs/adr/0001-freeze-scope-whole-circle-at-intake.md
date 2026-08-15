# ADR-0001 — Freeze scope: whole circle at intake, narrowed at adjudication

**Status:** Accepted — amended by ADR-0003 (third-party review round 4)
**Date:** 2026-08-14
**Amends:** TSD §2.3 (freezes table), §3.8 (freeze semantics), §11.3 (decision table)

## Context

PRD §7.5 defines the freeze: a claimant objects, the record closes, an
adjudicator decides. The TSD as drafted froze **per subject by default**, with
`subject_id = null` available for a whole-circle freeze, and flagged the
interpretation for review — the PRD says "the record is closed" without saying
whether a two-subject circle closes both records when one subject is objected
to (TSD §11.3).

## Decision

**Intake always freezes the whole circle. Only an adjudicated finding can
narrow the freeze to a subject.**

Enforced declaratively, not procedurally:

```sql
constraint freezes_open_is_whole_circle
  check (state <> 'open' or subject_id is null)
```

An open freeze cannot name a subject, so nothing an intake path does — UI,
function parameter, manual insert — can produce a narrowed open freeze. The
adjudicator may set `subject_id` when entering a finding; an `unresolved`
finding narrowed to one subject continues the freeze on that record only.

The one-open-freeze index simplifies from per-target to per-circle
(`freezes_one_open_per_circle`), since every open freeze now covers the circle.

## Why

1. **PRD §7.5 is containment-first.** The freeze exists to stop harm while
   authority is contested. Between "froze too much for ten days" and "left the
   contested surface open," the PRD consistently chooses the former — the same
   posture as freeze-before-tier evaluation in §3.3.
2. **A claimant should not have to scope an objection.** The claimant may not
   know the circle holds two subjects, or that the conduct they are reporting
   spans both. Requiring a subject at intake makes the frightened caller do
   schema work; the adjudicator — with a 3-day contact obligation and full
   context — is the right party to narrow.
3. **Joint finances make per-subject freeze leaky.** Aging couples share
   accounts, deeds, insurance. A freeze on Nell's record that leaves Frank's
   open lets the objected-to member keep reading the couple's financial
   documents through Frank's file — the containment defeated by the household's
   own data shape.

AC-PERM-11 (no share, no grant, no role lifts a freeze) is satisfied **more
strongly** by whole-circle intake: there is no adjacent-subject surface left to
reach during the open phase at all.

## Consequences

- `freezes.subject_id` remains nullable and gains the check constraint; the
  partial unique index becomes `(circle_id) where state = 'open'`.
- `hc.request_freeze()` takes no subject parameter; adjudication functions may
  set one when entering a finding.
- pgTAP covers: the constraint refuses an open freeze with a subject; each of
  the three outcomes (`dismissed`, `upheld`, `unresolved`); an `unresolved`
  finding narrowed to one subject reopens the other subject's record.
- Slice 1A builds `freezes` in this shape from the first migration — no
  retrofit.

## Amendments — third-party review round 4 (2026-08-14, ADR-0003)

Three findings against this decision were accepted; TSD §2.3 and §3.8 carry
the applied text.

1. **A claim is not a freeze.** The one-open-freeze-per-circle index made a
   second claimant's report bounce as a uniqueness violation with no audit
   trail — losing exactly the corroborating or broader allegation an
   adjudicator most needs. `freeze_claims` is now the immutable intake
   ledger (every report recorded with a disposition: `opened_freeze`,
   `attached_to_existing`, `rate_limited`); `freezes` remains the single
   active enforcement state. PRD §7.5's "per claimant and per subject" rate
   limit is interpreted as per-claimant (`claimant_contact`) and per-circle
   — strictly stronger than per-subject, since an intake claim names no
   subject.
2. **Narrowing is declaratively bound to adjudication, not procedurally.**
   New constraints: `freezes_outcome_is_adjudicated` (no non-open state
   without complete adjudication metadata) and
   `freezes_narrowing_is_assessed` (no `subject_id` without a recorded
   `narrowing_rationale`). Mutation is exclusive to `hc.request_freeze()`
   and `hc.adjudicate_freeze()`; 1A tests direct DML and every
   non-adjudication entry point. The reviewer's fuller suggestion — an FK
   to a separate immutable finding row — was **partially adopted**: the
   claims ledger plus the metadata constraints deliver the immutability and
   binding sought, without a table whose only content would duplicate
   columns `freezes` already carries. Revisit if adjudication grows state
   of its own.
3. **Unresolved stays whole-circle by default.** The original text let a
   narrowed `unresolved` finding reopen the other subject's record
   automatically — recreating the joint-finances leak this ADR's own "Why"
   cites, because §3.1's visibility arithmetic is per subject and cannot
   close a joint document filed under the other subject. Narrowing now
   requires the adjudicator to record a cross-subject exposure assessment
   (`narrowing_rationale`), and the standard for when narrowing is
   appropriate belongs to the counsel-owned adjudication protocol (G1,
   PRD §12.10).
