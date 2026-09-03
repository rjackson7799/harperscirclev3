# [DO NOT MERGE without owner sign-off] 8C — Claim's surface, and the access log's cursor (round 30)

**Tier 2.** One deltas document (**ADR-0042**, `Status: proposed`), one
dispositions table, one reviewer session. **The owner is sole merge
authority; merge with `--no-ff`, never a squash.**

**Branch** `slice/8c-claim-log-app`, from `origin/main` @ `d9b96ef` (PR #41).
**Evidence head `2f2c509`** — every commit past it docs-only.
**Migrations: NONE.** M3 was reserved for round-28 dispositions, which have
not happened; M4 closed UNCONSUMED at 8B. **The bound closes at 2 of ≤ 4.**
**Dependencies: 0 runtime, 0 dev** — the reserve UNSPENT. `supabase/` and
`lib/ai/` untouched. Nothing is production-activated.

---

## What this increment is

8A shipped `hc.claim_task` and ruled every one of its eleven refusals into
**one string** so the refusal could not become an oracle for the circle's
state. 8C is the surface for a function like that — and the only interesting
question a surface like that raises is: **what may it say, and how does it
know?**

The answer here is that it never asks. `TaskRow` gains `can_view`, which is
the definer's own `hc.visible_at(…) >= 'view'` call — same context, same
taint, the owner as the row stands — computed as one more expression in the
RLS-true join that already carried `can_manage`. `mayClaim` is then the
definer's five gates in the definer's order and **no sixth**, because a
surface that refuses more than the function does hides work a person is
entitled to take and no test would ever see it. The live legs assert
AGREEMENT in both directions rather than re-proving the definer.

The second unit closes **OW-26**, open since 7D. Its defect was not that the
log paginated badly — it was that `seq` 1, the §7.5 custodianship declaration
recording who was named custodian on the day the record was set up, **could
not be reached from the log at all.** The RED commit's signature is
`Error: the walk did not terminate`.

## The two RED signatures worth reading

```
Marisol · task claimed · Marisol · Nell · September 3
```
ADR-0040 Q-G reproduced: `task_claimed` "renders generically until 8C words
it" means the claimant is named twice, telling the reader neither that she
took the task nor that it was handed to her — the only distinction the event
type exists to carry. It now reads *"**Marisol** took an unassigned task in
Nell's record"*.

```
Error: the walk did not terminate
```
No cursor, so every page returns the newest rows again and the reader walks
forever without moving.

## Closure at ONE head — `2f2c509`

| | |
|---|---|
| **vitest** | **1,563 / 1,563 across 106 files, by run** (8B: 1,508 / 105) |
| **gate** | **66 / 66 in 9 files, 1,228 s** — 0 unexpected · 0 flaky · 0 skipped, exit 0 (was 64 in 9 files). Leg 38: passed, 11.0 s |
| **lint / typecheck / build** | exit 0 / exit 0 / exit 0, each solo |
| **gitleaks** | 668 commits, 10.44 MB, no leaks |
| **DB legs** | NOT RUN — no DDL moved; 8A's `4d166c0` figures stand (reset 76 · pgTAP 71 Σ 1,863 · concurrency 83/83 · `db:verify` clean) |
| **tree** | 17 files, +1,393 / −78 |

**Coverage:** TSK-05's app and e2e halves and **LOG-04** flip green on legs
inside the COMPLETE run. **LOG-01's app half is AMENDED with a marker
pointing at LOG-04, never rewritten.** **`docs/owed.md`: OW-26 → `CLOSED`;
OPEN 0 / 25.**

**The re-tally.** Counted with the process test's OWN parser, not by eye: **280 rows · green 258 · review 9 · pending 13** — exactly 8B's 280 / 257 / 9 / 14 with LOG-04 moved from `pending` to `green` and nothing else touched. Reconciled three ways per the ritual: the table against this prose; every ledger row against `docs/owed.md` (OW-26 the only move, `TAKEN(8C/unit 2)` → `CLOSED(2f2c509)`); and the ledger's open count against the cap — **OPEN 0 / 25**. `npm run test:app`'s `tests/lint/process.test.ts` 29/29 checks the last two mechanically.

## Where to attack

1. **`mayClaim` against `hc.claim_task`.** Is any arm missing, and is any arm
   the function does not have? The freeze is deliberately absent — ADR-0042
   D2 argues it is `visible_at` rung 2, so the row never reaches the page,
   and **corrects ADR-0040 D2's aside** that `hc.circle_people` "carries
   `frozen`" (it carries a NULL, which also means *not yours to know*).
2. **The cursor's exhaustiveness.** The walk is asserted to EQUAL the
   policy's single read, ordered and duplicate-free, and the caregiver's walk
   to be a strict subset still carrying no health entry. Does paging widen
   anything, anywhere?
3. **What the log page says about itself.** Three of 7D's R4/F-3 assertions
   are REPLACED, not extended (ADR-0042 D10 tabulates each and why). Check
   that nothing was weakened: "Everything done with the record" is now gated
   on a stricter condition than 7D's, and §7.4 is asserted as *no digit*.

## Read Q-F first

ADR-0042's **Q-F** records a database question this build may not touch:
FRZ-13's freeze carve-out caps a non-objected-to coordinator at `view` during
an **unresolved** freeze, and `view` is exactly `claim_task`'s floor — so she
can take a task while the circle is frozen. 8A's pgTAP proves the refusal
under an **open** freeze and does not exercise the carve-out. **8C ships no
DDL, so it is recorded, not fixed.**

## Also in the packet

`docs/review/8c-leg-audit.md` — OW-05's batched Tier-3 quota, **eight legs**
covering all three increments (8A contributed none — a pgTAP increment, and
that zero is a fact not an omission). Seven findings, no verdict moved: one
MINOR title defect left for this round to disposition, one defect found in
8C's own leg and **fixed pre-gate**, five observations. The record carries a
correction to itself, left visible.

## Standing

**Rounds 28 and 29 never ran. ADR-0040 and ADR-0041 are both `proposed` and
unstamped, with Q-A…Q-G open in each. Slice 8's close-out must stamp both —
that is the owner's call, not a build session's.** G4/G7 block · G9 OPEN ·
G3 open · band allowlist EMPTY · SIG-01 NOT absorbed (sixth slice running) ·
G12-01 `pending` at `gate`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
