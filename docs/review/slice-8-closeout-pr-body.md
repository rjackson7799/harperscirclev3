# Slice 8's close-out — rounds 28, 29 and 30 ruled at once

**Docs-only. Tier 3 as a change. No gate re-run, no product evidence
re-earned.** Branched from `origin/main` @ `7ef2a69` (PR #42, 8C); CI on `main`
confirmed green at that merge — run 33798214755, success, 4m16s.

Slice 8 shipped three increments and **none of its three review rounds was
held**: 8A merged without round 28, 8B without 29, 8C without 30. Twenty-one
pointed questions stood open across three `proposed` ADRs. Under ADR-0006 an
unanswered pointed question defaults to NOT PLANNED, so leaving them open was
not a neutral state — it was a silent ruling nobody made. This PR rules them.

| Artifact | What it is |
|---|---|
| `docs/adr/0043-slice-8-closeout.md` | The decision record. **150 lines, at the Tier-1 cap** (a Tier-1 round and two Tier-2 rounds stamped at once) |
| `docs/review/slice-8-dispositions.md` | The **21-row table**, each question quoted as it was put |
| ADR-0040 / 0041 / 0042 | Status lines stamped **`accepted` 2026-09-03**, each carrying its attribution |
| `docs/TSD.md` §7.2 | The **erratum**, owed since 8B |
| `docs/coverage.md` | **FRZ-17** opened; four cells amended with markers |
| `docs/owed.md` | **OW-27** opened |

**Counted with `tests/lint/process.test.ts`'s own parser, never by eye:** 21
rows, **7 per round**, **18 ruled AS RECOMMENDED**, **3 departing**.

---

## ⚠ The three departures — read these before the rest

### 1. `30/Q-F` — FRZ-13's freeze carve-out reaches a WRITE definer

**Ruled: the carve-out is read-only BY INTENT, so `hc.claim_task` writing
through it is a defect, not an allowance.**

`hc.grant_vectors` (`20260815230009`) gives a coordinator who is **not** the
objected-to member, under an **`unresolved`** freeze, `frozen = false` and
`cap = 'view'`. `hc.visible_at` applies the cap as `least(…)`. `view` is
exactly `hc.claim_task`'s admission floor. **She can take a task while the
circle is frozen.**

ADR-0042 recorded the question. **Two things this close-out adds, verified
from the source rather than taken from the ADR:**

- **The exposure is ONE function, not a family.** ADR-0042 flags
  *"`complete_task`'s holder bar is `summary`, which a `view` cap also
  clears"* as adjacent and unverified. It does not clear it, because it is
  never reached: `complete_task` raises `freeze_active` **before** it calls
  `hc.may_act_on_task`. `assign_task` and `snooze_task` likewise. All three
  carry an explicit `state in ('open','unresolved')` test against
  `public.freezes` that never consults `grant_vectors`, so no cap can lower
  it. This **shrinks** the row.
- **It reaches `claim_task` alone *because* of round 28's Q-A.** ADR-0040 D2
  routed the freeze through `visible_at` rung 2 *alone*, which is precisely
  the rung the carve-out sets to `false`. **Two questions, one defect.**

Intent is settled by three independent sources: `20260815230009`'s own header
(*"the unresolved **read-only** carve-out"*), FRZ-13's coverage row (the same
words), and the three siblings' explicit guards. No test caught it because
`070_task_claim.sql` opens its freeze with the `state` default `'open'`
(`20260815200005`:20), so 070:32–35 never exercises the carve-out.

**Carried, not fixed — a fix is DDL and this session ships none:**
`docs/coverage.md` **FRZ-17** (`pending`, never green, carrying the exposure
and what bounds it) · `docs/owed.md` **OW-27** (`OPEN`, its acceptance
condition naming the guard *and* the pgTAP pin) · **a NAMED M-slot in slice
9's migration bound**, which slice 9's plan gate sets. Not `RISK(row)` — an
accepted risk is one nothing turns green, and this one is meant to be fixed.

*What bounds it today:* nothing is production-activated (G4/G7 block); the
actor must already be a coordinator of that circle and not the objected-to
member; the write is confined to the three assignment columns plus one
`task_claimed` entry, with no share and no instruction row by any path
(SET EQUALITY at 070:10–11, 23–24, 36–38); and it is reversible by
`unassign_task`. It is bounded by **no test**, which is what FRZ-17 carries.

### 2. `28/Q-A` — the refusal string accepted, the mechanism not

The one-shape `claim_refused` **stands** — it is what keeps the refusal from
being an oracle for the circle's state, and 070:32–35 proves three different
callers meet one string under a freeze. Two things are **not** accepted: the
recommendation's second clause (*"8C's surface says the freeze from
`hc.circle_people`'s `frozen`"*), which 8C had already corrected — there is no
such column, and under a freeze the task never reaches a page; and the
**mechanism**, rung 2 as the only freeze test, which is FRZ-17's root cause.

### 3. `30/Q-G` — leg-audit F3: the cell, not the title

The kickoff put two alternatives: *"Fix the title, or rule the narrowing into
the cell — not both."* **The cell is taken.** Editing `e2e/search.spec.ts` is a
code change in a docs-only session that re-runs no gate, and `AUDIT_MANIFEST`
cites the leg BY TITLE, so a title change is two files plus a gate run to put a
run behind the new citation. `docs/coverage.md` is authoritative **per
assertion**, so **SRCH-04's cell** now says what is true: the browser leg
renders **three** of §4.7.3's four strings; `Search the record` is unreachable
from that leg's one-subject fixture and is proven at the **unit** layer in four
places. ADR-0006-legal as an applied artifact plus named tests. The audit's
recommended title is recorded for the next increment that touches the spec.
**The departure is that the title is left standing**, and it is stated rather
than quietly absorbed.

---

## The re-tally, three ways

**Nothing turned green because a question was ruled.** The tally moves by
exactly one row, and that row opens `pending`.

| | Before (`7ef2a69`) | After | Why |
|---|---|---|---|
| coverage rows | 280 | **281** | FRZ-17 opened |
| green | 258 | **258** | **unchanged** |
| review | 9 | **9** | unchanged |
| pending | 13 | **14** | FRZ-17, never green |
| `owed.md` OPEN | 0 / 25 | **1 / 25** | OW-27 |

1. **The table against the prose** — ADR-0043 says *"Eighteen of twenty-one
   were ruled AS RECOMMENDED; three departed"*; the table says 18 / 3. Agree.
2. **Every OWED row against `docs/owed.md`** — two rows carry an OWED verdict
   (28/Q-A, 30/Q-F) and both point at **OW-27**, correctly, because they are
   one defect seen twice. No row reads OWED for something already closed.
3. **The ledger's open count against the cap** — 27 rows, OPEN **1 / 25**, the
   prose line agreeing with the table, every OPEN row carrying an acceptance
   condition. **The burn-down quota is still MET, with one to spare:** slice 8
   opens 1 and takes 7 out of `OPEN`; 7 ≥ 1 + 5.

`tests/lint/process.test.ts` **29/29** (it checks 2 and 3 mechanically).

## Also landed

- **The TSD §7.2 erratum**, owed since 8B (ADR-0041 consequence 4). One
  erratum in the PRD's established shape, naming **both** departures —
  `ts_headline`'s `StartSel=U+0002, StopSel=U+0003` and the row's own title in
  the select list — with FROM/WHERE/ORDER/LIMIT confirmed verbatim and **the
  code block not rewritten**.
- **STP-03's app half FLIPPED** on 28/Q-F, on evidence already standing at
  `4d166c0`. **Its status word does not move** — the row was already green on
  its pgTAP half — so nothing turns green because a question was ruled; what
  changes is that the `app` half of its declared layer is now claimed rather
  than only recorded.
- **Four cells amended with markers, never rewritten** (LOG-01's 8C marker is
  the shape): **TSK-05** (its *"a FROZEN circle … refused in ONE shape"*
  narrowed to an **OPEN** freeze; the row stays green on the pgTAP evidence it
  has), **FRZ-13**, **STP-03**, **SRCH-04**.
- **The migration bound CLOSES at 2 of ≤ 4** — M3 and M4 both UNCONSUMED.

## The dissent this close-out files

**A stamp records that the questions were RULED. It does not record that a
review was held, and ADR-0043 D6 refuses to let the two be read as the same
thing later.**

The close-out files a dissent rather than blocking, because nothing is
production-activated and leaving the record `proposed` indefinitely is itself a
defect. But **ruling a Tier-1 increment from its own author's recommended
answers is not the deep review the tier exists to require** — the charter sets
depth by what a defect costs in production, *a migration and a backfill*, and
8A shipped two, one of them the step-up token binding.

**This session is the evidence.** One sitting over 8A's SQL produced FRZ-17 and
corrected ADR-0042's own adjacent-risk note. A finding rate above zero in the
first hour is a poor argument for stopping.

**Recommended: slice 9 opens with a commissioned adversarial pass over 8A's M1
and M2 — M2 especially, the four-part step-up binding that replaced a shipped
composition and that nobody outside its author has read.** FRZ-17 is the named
entry point. The owner's call at slice 9's plan gate.

## Verification

- **Docs-only, verified:** `git diff --name-only origin/main..HEAD -- .
  ':(exclude)docs'` is **EMPTY**. Explicit paths staged; the two untracked
  files in the tree (`.github/SECURITY.md`,
  `docs/review/slice-5b-queue-kickoff.md`) predate this session and are not
  this branch's.
- `tests/lint/process.test.ts` **29 / 29**.
- **The full vitest suite was NOT re-run, and is not claimed.**
  `docs/coverage.md`, `docs/owed.md`, `docs/adr/` and `docs/TSD.md` are read by
  that one test and by no other in the tree (grepped), so a live suite run
  would add no information about this change while risking a false red and a
  peer collision on the shared stack.
- No gate run. No migration. No dependency. Nothing production-activated.

## ⏸ Not this session's

PR #35 (ADR-0039) and PR #36, both still open · a fix for FRZ-17 (DDL,
slice 9) · a corrected leg title · a held review · G4/G7 block · G9 OPEN · G3
open · the band allowlist EMPTY · SIG-01 NOT absorbed, a sixth slice · G12-01
`pending` at `gate` · LOG-03 never green. **Slice 9's plan gate is its own
session.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
