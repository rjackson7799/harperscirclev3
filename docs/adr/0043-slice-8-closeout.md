# ADR-0043 — Slice 8's close-out: rounds 28, 29 and 30 ruled at once, and ADR-0040/0041/0042 stamped

**Status:** proposed — put to the owner as the slice-8 close-out. **Docs-only,
Tier 3 as a change** (`git revert` restores the prior product; no gate is
re-run). **The size cap taken is the Tier 1 cap of 150, not Tier 3's 60**,
this being the decision record for a Tier-1 round and two Tier-2 rounds at
once; the twenty-one-row disposition table lives where tables live,
`docs/review/slice-8-dispositions.md` (ADR-0038's split, and the skill's).
**Branch:** `slice/8-closeout`, from `origin/main` @ `7ef2a69` (PR #42, 8C,
merged 2026-09-03; CI on `main` CONFIRMED green — run 33798214755, success).
**Date:** 2026-09-03. **Authority:** CLAUDE.md (an unanswered pointed question
defaults to NOT PLANNED — ADR-0006; a settled ruling is not a finding; an
accepted risk is a ruling plus a never-green row) → `docs/process/slice.md` →
`docs/review/slice-8-closeout-kickoff.md` → ADR-0040, ADR-0041, ADR-0042.
**No migration. No dependency. Nothing production-activated.**

---

## D1 — The three stamps

Slice 8 merged all three of its increments **without any of its review rounds
being held**: 8A without round 28, 8B without 29, 8C without 30. Twenty-one
pointed questions stood open across three `proposed` ADRs. Under ADR-0006 an
unanswered pointed question defaults to NOT PLANNED, so leaving them open was
not a neutral state — it was a silent ruling nobody made.

| ADR | Increment | Tier | Round | Questions | Stamp |
|---|---|---|---|---|---|
| **ADR-0040** | 8A — claim + the level-bound step-up (M1, M2) | **1** | 28 | Q-A…Q-G | **`accepted` 2026-09-03** |
| **ADR-0041** | 8B — Search, the surface | 2 | 29 | Q-A…Q-G | **`accepted` 2026-09-03** |
| **ADR-0042** | 8C — claim's surface, the log's cursor | 2 | 30 | Q-A…Q-G | **`accepted` 2026-09-03** |

**Who ruled.** Every verdict was reached by the close-out session on the
owner's standing instruction in the brief — *"accepting a recommendation is a
ruling and is recorded as one, with WHO chose stated so it is not inferred
later."* **The owner ratifies by merging the PR that carries this file.** Each
ADR's status line carries that attribution, and says that `accepted` records
that the questions were ruled — **not** that an adversarial review was held
(D6). **Eighteen of twenty-one were ruled AS RECOMMENDED; three departed** —
28/Q-A, 30/Q-F and 30/Q-G, each marked **⚠ DEPARTS** in the table.

## D2 — The defect this close-out found: FRZ-13's carve-out reaches `hc.claim_task`

**Ruled: the carve-out is read-only BY INTENT, so a claim through it is a
defect, not an allowance.** `hc.grant_vectors` (`20260815230009`) gives a
coordinator who is not the objected-to member, under an **`unresolved`**
freeze, `frozen = false` and `cap = 'view'`; `hc.visible_at` applies the cap as
`least(…)`; and `view` is exactly `hc.claim_task`'s floor — **she can take a
task while the circle is frozen.** Intent is settled by three independent
sources, and the exposure is bounded to **one function, not a family**:
`assign_task`, `complete_task` and `snooze_task` each raise `freeze_active`
from an explicit `state in ('open','unresolved')` test that no cap can lower,
which also answers ADR-0042's own *"adjacent and NOT verified"* worry in the
safe direction. It reaches `claim_task` alone **because** ADR-0040 D2 routed
that freeze through `visible_at` rung 2 (28/Q-A) — the refusal *string* stands,
the *mechanism* is what this row carries. **Two questions, one defect.** No
test caught it because `070_task_claim.sql` opens its freeze with the `state`
default `'open'`, so 070:32–35 never exercises the carve-out. The argument in
full — verified from the source, not taken from the ADR, with every citation —
is in the dispositions file and in FRZ-17's own cell.

**Carried as:** `docs/coverage.md` § 8 **FRZ-17**, `pending`, never green until
the guard lands · `docs/owed.md` **OW-27**, `OPEN`, its acceptance condition
naming the guard and the pgTAP pin · **a NAMED M-slot in slice 9's migration
bound**, which slice 9's plan gate sets. Not `RISK(row)`: an accepted risk is
one nothing turns green, and this one is meant to be fixed. A fix is DDL and
this session ships none.

## D3 — TSD §7.2's erratum, landed

ADR-0041's consequence 4, owed since 8B and discharged here. §7.2 gains **one
erratum** in the PRD's established shape (ADR-0038 Q-C's two sites), naming
**both** departures because both are 29/Q-A's *"same one-line erratum"*:
`ts_headline`'s fourth argument `StartSel=U+0002, StopSel=U+0003`, so the
headline reaches the module as sentinels rather than `<b>` markup; and the
row's own title in the select list, as link text disclosing nothing the snippet
does not (weight A of the matched vector at every level). FROM, WHERE, ORDER
and LIMIT are the spec text verbatim, and **the code block is not rewritten** —
the erratum sits beneath it, the amendment discipline (ADR-0025 D6).

## D4 — Leg-audit F3: the narrowing goes into the cell; the title is not edited

The kickoff put two alternatives — *"Fix the title, or rule the narrowing into
the cell — not both"*. **The cell is taken.** `e2e/search.spec.ts` belongs to a
merged increment; editing it is a code change in a docs-only session that
re-runs no gate, and `AUDIT_MANIFEST` cites the leg BY TITLE, so a title change
is two files plus a gate run to put a run behind the new citation.
`docs/coverage.md` is authoritative **per assertion**, so the marker there is
what a reviewer is bound by: **SRCH-04's browser leg renders THREE of §4.7.3's
four strings**; `Search the record` is unreachable from that leg's one-subject
fixture and is proven at the unit layer in four places. ADR-0006-legal as an
applied artifact plus named tests. The audit's recommended title is recorded
for the next increment that touches the spec. **No ledger row** — the assertion
is fully covered, so an item here would be a wish.

## D5 — What moved in the ledgers, and what deliberately did not

**Nothing turned green because a question was ruled.** The coverage tally moves
by exactly one row, and that row opens `pending`:

| | Before (`7ef2a69`) | After | Why |
|---|---|---|---|
| rows | 280 | **281** | FRZ-17 opened |
| green | 258 | **258** | **unchanged** |
| review | 9 | **9** | unchanged |
| pending | 13 | **14** | FRZ-17, never green |
| `owed.md` OPEN | 0 / 25 | **1 / 25** | OW-27 |

Four cells are **AMENDED WITH MARKERS, never rewritten** (LOG-01's 8C marker is
the shape): **TSK-05**, its *"a FROZEN circle … refused in ONE shape"* narrowed
to an **OPEN** freeze and pointing at FRZ-17, the row staying green on the
pgTAP evidence it has · **STP-03**, the app half FLIPPED on 28/Q-F on evidence
already at `4d166c0`, **its status word not moving** because the row was
already green on its pgTAP half · **SRCH-04**, D4's narrowing · **FRZ-13**, a
pointer to FRZ-17 so a reader starting at the carve-out is not the last to
know. Not touched, each for a reason: LOG-01 and LOG-04 (8C settled them) ·
GRP-01 and the four `gate` rows (never green in this slice, the plan's Q6) ·
LOG-03 (`RISK`) · G12-01 · **OW-05 stays `TAKEN(8/Tier-3 pass)`**, its quota
being recurring and the leg backlog not clear.

## D6 — What a stamp does NOT mean, and the dissent that goes with it

**Three merged increments were attacked by nobody.** A stamp records that the
questions were ruled; it does **not** record that a review was held, and this
ADR refuses to let the two be read as the same thing later.

The close-out **files a dissent rather than blocking**, because nothing is
production-activated and leaving the record `proposed` indefinitely is itself a
defect. Recorded so it cannot be lost: **ruling a Tier-1 increment from its own
author's recommended answers is not the deep review the tier exists to
require**, and this session is the evidence — one sitting over 8A's SQL
produced FRZ-17 and corrected ADR-0042's adjacent-risk note. **Recommended:
slice 9 opens with a commissioned adversarial pass over M1 and M2 — M2
especially, the four-part step-up binding that replaced a shipped composition
and that nobody outside its author has read.** FRZ-17 is the named entry point;
the owner's call at slice 9's plan gate.

## D7 — The bound, and what is NOT claimed

**The migration bound CLOSES at 2 of ≤ 4** — M1 and M2 consumed at 8A, **M3 and
M4 both UNCONSUMED**, a reserve not consumed closing at what was spent.
Dependencies 0 runtime, 0 dev, the reserve UNSPENT; `lib/ai/` untouched;
`PROMPT_VERSION` `hc-6b-3` unmoved. NOT claimed: any product evidence
re-earned (8A `4d166c0`, 8B `3bd8f52`, 8C `2f2c509` stand as merged) · any
gate re-run · a fix for FRZ-17 (DDL, slice 9) · a corrected leg title (D4) · a
held review (D6) · PR #35 (ADR-0039) and PR #36, both open and neither this
session's · G4/G7 block · G9 OPEN · G3 open · the band allowlist EMPTY ·
SIG-01 NOT absorbed, a sixth slice · G12-01 `pending` at `gate` · LOG-03 never
green. **Slice 9's plan gate is its own session.**
