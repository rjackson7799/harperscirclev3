# Round 32 — the rulings. Q-A…Q-G ruled, ADR-0045 stamped, two ledger rows moved.

**Docs only. No DDL, no reserve consumed, no dependency added, nothing turns
green.** Base `origin/main` @ `e1fd0ae`, fetched and re-verified unmoved. Two
commits: the brief first, then the ADR and the ledger moves it causes.

**This PR merges nothing.** The owner is sole merge authority; no session merges
its own work; the merge is `--no-ff`.

---

## First, the thing that is not a finding: the review was never held

Round 32 **CLOSES ruled-without-review.** The owner merged PR #48 directly, as
with 8A (round 28) and 8B (round 29). **No reviewer session ran, and there is no
`round-32-findings.md`.** PR #48's diff received no third-party review at its
planned **Tier 1**.

ADR-0046 says this in its own words rather than letting the stamp imply
otherwise: the packet was ruled on the packet's own record — the tallies, the
red→green trail, the per-directory tree binding — all of which a review would
have read and **none of which it re-derived. Anything a reviewer would have
found in that diff is unfound.** ADR-0036 (round 26) is the precedent for
closing this way.

## The brief arrived with its ruling block blank — for the third time

The session's first act was to stop. Every one of the seven `→ **RULING:**`
lines terminated with nothing after it, verified with `cat -A` rather than by
eye — each ending `**RULING:**$`. The brief carries its own instruction for
exactly that case:

> Twice now a rulings brief has arrived with this block blank. **Never read a
> blank either way: put the questions back and stop.**

So no ruling was inferred from a recommendation, nothing was stamped, and the
brief was committed at `04823b6` as the record that the round opened. The owner
then ruled: **Q-A…Q-F take their recommendations.** Q-G had none to take, and is
the reason this round matters beyond slice 9.

## Q-A…Q-F — six ruled as recommended, none departing

| | Ruling | Artifact |
|---|---|---|
| **Q-A** | `hc.log_artifact_read` keeps its exemption, **by argument not threshold** — a freeze suspends *access*, never the *record* of access; refusing the write makes the read **unlogged**, which is strictly worse | D1 — none |
| **Q-B** | `002:21`'s reader clause is under-inclusive; **recorded, not fixed here** — a fix in a session that owes none is not this round's to make | D2 — **`OW-33`** |
| **Q-C** | The four task-write definers keep their different raises. **The test is the fix; the string does not move** | D3 — none |
| **Q-D** | STP-03's **marker stands**; the row is not re-led. The discrepancy between ADR-0044 D2's wording and its implementation is recorded, the verdict left alone (ADR-0025 D6) | D4 — none |
| **Q-E** | `OW-32`'s acceptance becomes a **SUBSET** condition | D5 — `OW-32` cell |
| **Q-F** | `FRZ-17` stays **single-layer**; a route-level case would assert the definer twice | D6 — none |

Q-E's rewrite is checkable rather than rhetorical: the nine files carrying 9A's
66 legs were enumerated from `.gate/e2e-run.json` at `efc2164` and written into
the row with their counts — `onboarding` 11 · `a11y` 10 · `ingestion` 8 ·
`people` 8 · `review` 7 · `record` 6 · `search` 6 · `documents` 5 · `extraction`
5 = **66**. The row now also says the thing the old cell left open: **a run green
EXCEPT in one of those nine does NOT discharge it.**

## Q-G — the one that outlives the slice

Q-G was new at this round and **carried no recommendation on purpose.** The
owner's statement — *"this computer doesn't have enough memory and we will
continue to run into issue. we need to do the best we can until we can get to a
staging environment on Vercel"* — is **intent**, and a session may not promote
intent to a ruling. It was put back with options and ruled in two parts.

**D7a — the gate's home moves off this machine.** `OW-32`'s acceptance re-homes
from *"the 9B head"* to the same nine files green against a **Vercel staging
deployment, runnable from any host.** Recorded as an **owner amendment**, made
before a line of 9B is written. **What this does not touch:** G4 and G7 still
block — nothing is production-activated, and a staging target is pre-production.
**G9 and G3 stand unchanged: fixtures only, CI remains KEYLESS.** Nothing here
authorises CI to run Playwright, and no CI run can upgrade local gate evidence.

**D7b — 9B may close with browser evidence outstanding, as an accepted risk.**
The host has failed preflight's 1.20 GiB floor on every attempt including after
a reboot: 534 MB free against a 1,229 MB floor, `hc_clamd` alone 1,001 MB.
Blocking 9B on that is blocking it on hardware. So `OW-32` moves **`OPEN` →
`RISK(GATE-01)`** — the charter's own shape, *an owner ruling plus a never-green
coverage row carrying the exposure.*

**The debt is not forgiven; it stops blocking and becomes permanently visible.**
`GATE-01` opens `pending` and **nothing in slice 9 turns it green.** D7 also
does not re-diagnose the 2026-09-04 red — that classification stands and the one
permitted re-run (traps §1) is **UNSPENT** — and it does not license any
document to say 9A's surfaces were re-proven. That prohibition survives the
re-home verbatim, and is written into `GATE-01`'s own cell.

## The ledger, re-tallied mechanically

Counted with `tests/lint/process.test.ts`'s **own parser** (`ASSERTION_ID`
filter, `STATUS_IDX = 6`; the owed side header-indexed the same way), copied out
and run at the docs head, **never by eye**:

```
COVERAGE rows: 290 {"green":259,"review":9,"pending":22}
OWED rows: 33 cap: 25 {"CLOSED":22,"RISK":2,"TAKEN":1,"PROMOTED":6,"OPEN":2}
```

- **coverage 289 → 290 · green 259 → 259 (unchanged) · review 9 → 9 · pending
  21 → 22.** One new row, `GATE-01`, opening `pending` and never green.
- **owed 32 → 33 rows · RISK 1 → 2.** **The OPEN count does not move: 2 / 25** —
  `OW-32` leaves `OPEN` exactly as `OW-33` enters it, so the two rulings that
  touch this ledger cancel in the cap and change it everywhere else.
- **`OW-33` opens with no owner slice, deliberately.** 9B cannot take it without
  a plan amendment no session may make, and inventing a home to satisfy the
  ledger would be the wish the acceptance-condition rule exists to refuse. It
  starts the **two-round escalation clock** at this close — the ledger's own
  mechanism for exactly this.
- **The burn-down quota is not gamed.** A `RISK` row is not a discharge and is
  counted as one nowhere in the file.
- **Bound unmoved: M1 spent, 1 of ≤ 4.** M2 CLOSED UNCONSUMED · M3 held · M4
  NAMED for 9B. Next free ADR **0047**.

## Evidence

- `npx vitest run tests/lint` — **13 files, 194 passed (194)**, at the head of
  this branch. `tests/lint/process.test.ts` alone: **29 passed (29)**.
- **CI on `e1fd0ae` confirmed before anything else**, as the brief required:
  run `34076627404`, `completed` / `success`, event `push`. The PR page's *"0 of
  2 checks passed"* meant **PENDING**, not failed.
- **No product evidence is re-earned and none is claimed.** This round ran no
  gate, no pgTAP, no concurrency suite, and touched no code. 9A's evidence head
  is still `efc2164` and is not restated here as if re-proven.

## What this unblocks

With Q-A…Q-F ruled, **ADR-0006's NOT PLANNED default is discharged and 9B's
build may start** — its own fresh session, from `main` after this merges, with
`OW-28`'s unit ordered **FIRST** (ADR-0044 D1, Tier 2).

**Two things are now the owner's, not a session's:** standing up the Vercel
staging environment D7a names, and `OW-33`'s home if slice 10 does not take it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
