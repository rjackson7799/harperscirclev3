# The owed ledger

<!-- owed-cap: 25 -->
<!-- owed-schema: 1 -->

**Authoritative for what is owed.** Dispositions ADRs record the *verdict* that
made an item owed and are immutable; this file records the *fact* of where it
stands and is live.

Before this file existed, the ledger of record was ADR-0023's D17 table and
nothing ever wrote back to it. `"The slice-5B queue stays 39 OWED"` appears
verbatim in rounds 17, 18 and 19 — *even though slice 6's plan claimed to take
30 of the 39*. That is what this file is for.

---

## Why the queue grew — and it is not only that nobody wrote back

**`OWED` was never a legal disposition.** ADR-0006's blocking rule says a
finding blocks merge unless its row shows **either** an applied artifact plus a
named test **or** an explicit accepted-risk ruling with a coverage row. `OWED`
is neither. Fifty findings have been resting in a state ADR-0006 does not
define, for four rounds.

That is the real defect. A queue with no legal standing has no cap, no owner and
no exit, so of course it only grew. This file makes `OWED` legitimate — a
ledger row here *is* the blocking artifact ADR-0006 requires — and the cap and
the burn-down quota are what stop that being a loophole.

**This is an amendment to ADR-0006, not a reading of it.** It is recorded as one
in the retune ADR; nothing here takes effect by being written in this file.

---

## Rules

- **Cap: 25 OPEN.** A round may not close above it. Enforced by
  `tests/lint/process.test.ts`, which runs in CI under `npm run test:app`.
- **Burn-down quota: each slice closes at least as many items as it opens, plus
  five.** A cap alone permits sitting at 25 forever; the quota is what makes the
  ledger shrink. From 25 after triage, slices 7–11 land near zero.
- **An OPEN row with no owner slice that survives two round closes is
  auto-escalated to the owner for a kill ruling.** This is the specific
  mechanism that stops *"the slice-5B queue stays 39 OWED, unchanged by this
  round"* from happening a fourth time.
- **Every OPEN row carries an acceptance condition.** An owed item without one
  is a wish.
- **At round close, excess is FIXED, TAKEN, or KILLED.** Carrying is not a third
  option.
- **A build session may flip a row to `CLOSED` with a commit SHA** — that is a
  fact, not a verdict. Changing a *verdict* still requires a round (ADR-0025 D6).
  Recording a discrepancy in a settled ADR still means recording it and leaving
  the verdict alone.
- **Pricing rule when a slice takes intake:** *take the owed finding whose
  failure a person now reads; defer the one whose only reader is a worker.*

### Status vocabulary

| Status | Meaning |
|---|---|
| `OPEN` | Accepted, argued, scheduled, not yet taken. Counts against the cap. |
| `TAKEN(slice/unit)` | Assigned to a named unit in a live slice. Does not count against the cap. |
| `CLOSED(sha)` | Landed. Requires a resolvable commit SHA. |
| `KILLED(adr)` | Deliberately not doing it, with the argument on the record. |
| `RISK(coverage row)` | Accepted risk. Owner ruling **plus** a `coverage.md` row carrying the exposure. Never green. |
| `PROMOTED(coverage row)` | Became a named, quantified entry gate on a named slice. Leaves the ledger, stays visible as a `pending` row. |

### The four ways an item leaves OPEN

Exactly four. Anything else is carrying, and carrying is not an option above the
cap.

1. **Fixed** — applied artifact **plus a named test** → `CLOSED(sha)`. This is
   ADR-0006's blocking rule reused verbatim.
2. **Moot** — the code it describes no longer exists, verified by a named path or
   symbol check at a named head, with the check recorded → `KILLED(adr)`.
3. **Accepted risk** — an owner ruling plus a coverage row carrying the exposure
   → `RISK(row)`.
4. **Promoted to a gate** — it becomes a named, quantified entry gate on a named
   slice → `PROMOTED(row)`. This is the `bounded-deferral-gates` pattern used as
   an exit rather than as an excuse.

**The boundary with `docs/coverage.md`, stated so it cannot blur:**
`coverage.md` holds **assertions about the product** — a claim about behaviour,
green/pending/review. This file holds **work we owe** — a task. The only crossing
is rulings 3 and 4, and it is one-directional.

---

## Ledger

| ID | Origin | Sev | Claim | Acceptance condition | Status | Evidence |
|---|---|---|---|---|---|---|
| _(empty — intake below has not been triaged yet)_ | | | | | | |

**OPEN: 0 / 25.**

---

## Intake — not yet triaged

Scheduled for the **slice-7 plan gate**, so the pricing rule is applied with
slice 7's scope in hand. Counted mechanically, by item and not by occurrences of
the word:

| Source | Items | Note |
|---|---|---|
| `docs/adr/0023-slice5b-review-round-16.md` § D17 | **39** | The slice-5B queue. Frozen at 39 across rounds 17, 18 and 19. |
| `docs/adr/0025-slice6a-review-round-17.md` § D17 | **2** | F-5, and F-1's residue. Both were owed *to 6B*; verify against the 6B head before carrying them forward. |
| `docs/adr/0027-slice6b-review-round-18.md` § D17 | **9** | Items 1–9. **Item 10 is not an item** — it is a pointer to the 39 above, and must not be double-counted. |
| **Total distinct** | **50** | |

Two things to settle during triage:

1. **The 39 have never been reconciled.** Slice 6's plan priced them 30 taken /
   9 deferred, and the tally never moved. The triage must establish, per item,
   whether it landed — several are already known to have (R3/F-9, R6/F-6 and
   R8/F-1 were each found to read OWED while being FIXED). Expect the reconciled
   number to be well under 39 before a single item is killed.
2. **Round 18's item 5 becomes recurring, not one-time.** *"The one-time
   leg-integrity pass — 31 of 38 legs remain"* enters the ledger as a standing
   quota discharged by each slice's batched Tier 3 pass, per
   `docs/process/slice.md` §1. A one-time obligation is the exact shape of item
   that sat at 39 for three rounds.

Getting to the cap is therefore a **halving**, not a purge — and part of it is
arithmetic that was already true and never recorded.
