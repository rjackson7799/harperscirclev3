# 9B — Home. Tier 2, round 33. [DO NOT MERGE without owner sign-off]

**Base:** `origin/main` = `aae90d2` (PR #49, `--no-ff`, parents `e1fd0ae` +
`1846404`). **Evidence head:** `38fceca`; everything above it is docs-only.
**The packet:** `docs/review/round-33-packet.md`. **The deltas:**
`docs/adr/0047-9b-home-deltas.md`, whose **D9** carries the six pointed
questions.

**This PR merges nothing and fixes nothing.** The owner is sole merge
authority, no session merges its own work, and the merge is `--no-ff`.

## What shipped, in the order the plan ruled

`OW-28`'s unit **first** (ADR-0044 D1), then the plan's four. Every unit is
red→green with the failure signature in the red commit.

- **`OW-28`** — both *Raise access* panels now name what they confirm: the
  grantee, the **subject by display name**, `DOMAIN_LABEL[rd]` and
  `LEVEL_WORD[rl]`, all from the ONE phrase module. `rl=hidden` reads as **the
  revocation it is**. A subject the page cannot name is not confirmed blind.
  **Validation was not the fix and none was added** — the crafted `target_ref`
  was always well-formed. Six cases assert the WORDS **both ways**, including a
  crafted `rs`/`rd`/`rl` rendering *finances* and *full access*.
- **Day one** — one instruction, the forwarding address, both addresses
  labelled on a two-subject circle, **and nothing else**, asserted as ABSENCES
  against a tree where the router did not exist yet. It is still green,
  unchanged, after the router landed — which is the whole reason Q1 ordered the
  units.
- **The router** — the five §4.7.2 blocks, each from its destination surface's
  own read, each rendering **nothing** when its read is empty. Never a zero:
  a `0` on Home is a claim about rows the caller may not be entitled to
  enumerate.
- **The nav and the routing** — Home first, in **every** tier's nav, with the
  argument beside the code. The founder's post-setup destination is repointed;
  the accepted-invite landing is **not**, because PRD §4.1.4 rule 4 forbids it
  in those words.
- **Bounds and a11y** — one `withPageBudget` around the whole composition, the
  measured p95, and A11Y-13's legs.

## The p95 was measured, it breached, and the breach was a read SHAPE

At **2,021 timeline events · 501 tasks · 302 arrivals**, production build under
`next start`, 150 warm timed requests:

| | p50 | p95 | p99 | max | |
|---|---|---|---|---|---|
| first | 1787 ms | **2797 ms** | 4713 ms | 5452 ms | **BREACH** of §13.2 |
| after | 431 ms | **628 ms** | 758 ms | 932 ms | **WITHIN**, ceiling held |

Each read had wrapped `EVENT_SELECT` and ordered the wrapper, paying five
joins, a lateral and a `jsonb_agg` for every event in the circle before taking
four; and Home asked `listTasks` for 200 rows to render at most four. The ids
are now chosen by a cheap query over the base table — **the row policy decides
visibility exactly as it does for the full read, so nothing widens** — and the
expensive select runs for those ids alone.

**M4 closes UNCONSUMED** and the bound closes at **1 of ≤ 4**. Two reads remain
over PRF-06's **250 ms DB-level** tripwire (`latestEventPerSubject` 657 ms,
`myOpenTasks` 399 ms); that is **Q-A**, put to the owner rather than paid for
with a migration slot no session may spend — a migration is a Tier-1 trigger,
and only the owner may raise a tier.

## The gate is UNRUN, and the packet says so first

`preflight --for e2e` at the 9B head: **0.36 GiB free against the 1.20 GiB
floor**, `hc_clamd` down, **BLOCKED**. It was **not** forced: at a third of the
floor the legs die on spawn rather than on assertions, which is a red traps §1
forbids diagnosing as anything, and the cost is a wiped `test-results/` and a
destabilised stack a peer shares. **ADR-0046 D7b is exactly this case** — 9B
may close with browser evidence outstanding. **Nothing here claims a leg
passed, and no document says 9A's surfaces were re-proven.**

## Evidence

**vitest 1,603 / 1,603** in 544 files (1,563 at 9A's head) · **lint** clean,
whole tree · **typecheck** clean · **production build** clean with `/[circle]`
in the routes manifest · **gitleaks** 709 commits, no leaks · **CI on `main` @
`aae90d2` GREEN** (run `34082125537` re-run to `success`, discharging the
kickoff's ECR item) · **no DDL**, so the DB legs stand at 9A's figures and are
not restated.

## The ledgers

```
COVERAGE rows: 290 {"green":260,"review":9,"pending":21}
OWED rows: 33 cap: 25 {"CLOSED":23,"RISK":2,"TAKEN":1,"PROMOTED":6,"OPEN":1}
```

**One row flips and only one can — `HOME-05`**, whose app and bench halves are
both this session's to earn. HOME-01, HOME-02, HOME-04, A11Y-13 and STP-04 stay
`pending`: their app halves are earned and their legs are written, but the gate
did not run and **pending never counts as green**. `OW-28` closes at `c83eb80`.
`OW-05` stays `TAKEN`, its pass discharged — eight legs, three findings, none
moving a verdict — and its stale arithmetic re-derived: **68 legs in 9 files**
against a cell that says 38.

## The six pointed questions (ADR-0047 D9)

**Q-A** the DB-level tripwire residual · **Q-B** the resume router's
finished-setup branch · **Q-C** whether `STP-04` flips on its app half when its
own GREEN WHEN names a test and its Layer names e2e · **Q-D** the day-one branch
for a `care_circle` member on a busy circle — **filed as a dissent, with NO
recommendation**, because Q5's literal words produce the harm Q5's own argument
names · **Q-E** the two leg gaps the audit found · **Q-F** whether 9B is
reviewed or ruled.

**An unanswered pointed question defaults to NOT PLANNED (ADR-0006).**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
