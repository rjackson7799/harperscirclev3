---
name: slice
description: Harper's Circle build-loop legs. Use when starting a slice, running a plan gate, writing a build kickoff, assembling a review packet, commissioning a third-party review, landing findings, dispositioning findings, running an owner sign-off, closing a round, or triaging the owed ledger. Triggers include "start slice N", "plan gate", "build kickoff", "the packet", "round N", "findings", "dispositions", "sign-off", "close the slice", "owed triage", "what tier is this".
---

# The slice loop

The rules live in `CLAUDE.md` (charter), `docs/process/traps.md` (this machine)
and `docs/process/slice.md` (the ritual and the tiering rule). Those are loaded
already or one read away. **This skill is the procedure and the templates** —
what to do on the leg you are actually on.

**In force from slice 7.** Slice 6B finishes under the rules it started with.

## First: name your leg

One leg per fresh session. If you cannot name your leg, you are in the wrong
session.

| Leg | Entry condition | You produce | Exit |
|---|---|---|---|
| **plan gate** | A slice number and its TSD §11 row | `docs/review/slice-N-plan.md` | Owner rules the questions; status → `PLANNED — RULED` |
| **build** | A ruled plan and a named increment | Commits, red→green per unit | Closure evidence at one declared head |
| **packet** | An increment at a green head | `docs/review/round-N-packet.md`, deltas ADR, PR + `round-N-pr-body.md` | PR open, titled `[DO NOT MERGE without owner sign-off]` |
| **review** | A packet | `docs/review/round-N-findings.md`, **verbatim** | ⏸ STOP. Fix nothing. |
| **dispositions** | Landed findings | ADR (T1) or `round-N-dispositions.md` (T2/T3) | Every finding has a verdict |
| **sign-off** | Dispositions + a mechanical re-tally | Ratification, ledger updates | Owner merges (`--no-ff`) |
| **owed triage** | A round closing over cap | `docs/owed.md` updates | OPEN ≤ 25 |

Read **one** reference file — the one for your leg. Not all of them.

- plan gate → `references/kickoff.md` (the STATE block) + `docs/process/slice.md` §3
- packet → `references/packet.md`
- review → `references/review-brief.md`
- review output → `references/findings.md`
- dispositions / sign-off → `references/dispositions.md`

## The tier, decided once

Before anything else on a plan gate: assign a tier per unit, per
`docs/process/slice.md` §1. **First YES wins, and fail closed** — a unit whose
tier must be argued is Tier 1 until the owner rules it down.

- **T1** ships a migration · changes RLS, a policy, or a definer body · touches
  `lib/ai/` · writes the access log or ledger · auth, provenance, money.
- **T2** durable side effects, no schema change — workers, routes, state
  machines, storage, quotas.
- **T3** everything else: `git revert` restores the prior product.

Then apply **the split rule**: an increment may not contain both a T1 unit and
a T3 unit. If the plan produces one, the plan is wrong — split it.

## Before you run anything destructive

`db:reset`, `test:db`, `test:e2e`, `test:concurrency` are GLOBAL and destroy a
peer session's in-flight run. They are wired to `scripts/preflight.mjs` through
npm `pre` hooks and will refuse. The override is a reason, never a bare flag:

```
HC_PREFLIGHT_FORCE="why this is safe" npm run test:e2e
```

## The re-tally, before any ratification

Round 16 shipped an ADR whose prose said "seven BLOCKERs fixed / three
escalated" where its own table said eight and two, and two rows read OWED for
fixes that had already landed. **Count the verdict column with a command, not by
eye**, then reconcile three ways:

1. the table's counts against the prose summary;
2. every OWED row against `docs/owed.md` (a row reading OWED for something
   already closed is the round-16 defect recurring);
3. the ledger's open count against the cap.

`npm run test:app` runs `tests/lint/process.test.ts`, which checks 2 and 3
mechanically.

## Anti-patterns

- **Retyping doctrine into a kickoff.** Traps and constraints are auto-loaded.
  A kickoff over 90 lines is restating something — and it is a test failure.
- **A findings doc for a T3 increment.** T3 is batched once per slice.
- **Mixing tiers in one increment.** See the split rule.
- **An owed item with no acceptance condition.** It is a wish, and the scanner
  rejects it.
- **Fixing findings in the review session.** Dispositions are their own leg.
- **Re-running a red gate to green.** A product failure is a finding.
- **Citing an E2E leg by line number.** Titles only — four of the fourteen line
  citations in `docs/coverage.md` are already stale.
