# ADR-0036 — Round 26 closed by owner ruling: Q-A…Q-H ruled on the record, without a reviewer session

**Status:** accepted — owner ruling, 2026-08-31.
**Authority:** the 7C kickoff's entry condition (`docs/review/7c-build-kickoff.md`,
merged to `main` at `ebba1e2`), which offered two discharge paths under
ADR-0006's default (*an unanswered pointed question defaults to NOT PLANNED,
and the build does not start*); the owner chose the second — ruling the eight
on the record in a docs commit. **Packet ruled:** ADR-0035 (7B as built, put to
round 26 with recommended answers). **Evidence head ruled on:** `716cd49`;
merge `e0a0a3c` (PR #31).

---

## What closing round 26 this way means, said plainly

Round 26 **CLOSES ruled-without-review**. Its kickoff
(`docs/review/round-26-kickoff.md`) and PR body stand as the record of what
was put; no reviewer session ran, so **PR #31's diff received no third-party
review at its planned Tier 2**. The packet was ruled on the packet's own
record — the four-run gate table, the pgTAP/vitest/concurrency tallies, the
red→green commit trail — all of which a review would have read but none of
which it re-derived. Anything a reviewer would have found in that diff
surfaces in later rounds as findings at large, and lands then as findings,
not as re-litigated rulings. This is an accepted consequence of the path,
not a claim that the review happened.

Nothing here turns a coverage row green. The two rows the round was to flip
are HELD (Q-H below), and every ruling that touches a document names the
edit, made in this same commit.

## One correction to the packet's own prose, recorded here and not edited there

ADR-0035's Q-H bullet says *"the two residual legs observed green by title."*
Its own D11 paragraph — the record — says otherwise: **tasks passed alone by
title (68 s at `396c44f`); reject-all was NOT observed green at the 7B head**
(three stops, three named mechanisms; last green at the round-24 gate,
`986ef6e`). The detailed paragraph is the record; the bullet's clause is
corrected here. The shipped ADR is not edited — this is the round-16 class
of prose-vs-table drift, caught at the re-tally and named.

---

## The rulings

**Q-A — GTE-01's e2e half. RATIFIED as recommended.** The row stays green
with the bound as written in its cell: the outage shape is unit-driven at
every site, the 45-leg gate exercises the proxy's pass-through, and the live
observation of a hosted runtime under an auth fault stays OW-09's owner
track. No edit.

**Q-B — the five auth submit routes carry no answer budget. RATIFIED as
recommended.** A ledger row is opened in this commit — **OW-23,
`TAKEN(7C/C2)`**, homed beside OW-19's upload bounds. The acceptance
condition is the row's: each of the five answers inside the route-budget
boundary, with `tests/lint/answer-budget.test.ts` holding the auth tree to
it. ADR-0035 D6's ruling for the machine callers (pipeline, workers, relay,
inbound webhook) stands unchanged.

**Q-C — the Timeline defaults to the founding subject. RATIFIED as
recommended: ACCEPT.** A cookie-backed "last looked at" is a nicety a later
slice may take; it is not a row and nothing is owed.

**Q-D — claim / self-assignment. RULED: slice 8.** The merged 7C kickoff
already closed this: 7C's migration bound is NONE, M6's named window closes
UNCONSUMED, and claim's DDL at 7C would be a recorded owner amendment — none
is made. The slice-8 plan gate takes it up; ADR-0033 Q-H → ADR-0035 D9 →
here is the trail. Not owed to 7B, not owed to 7C.

**Q-E — the creation entry is visible at `log`×5 on the subject. RATIFIED
as recommended: ACCEPT as the log's own rule.** A family default (finances
hidden) does not see the first row of the thread, and the page never claims
there is none. If PRD §4.4.4 is ever read as universal, that is a 1A ruling
to seek, not an app fix. 7C's build carries the consequence it already
names: the custodianship log rows CARRY `subject_id`.

**Q-F — RCP-01's "live RLS reads" cell. RULED: rewritten in this commit**
(the rewrite ADR-0025 D6 assigned to a round, and this ruling is the round's
act). The cell's history is OW-20's: when 6B wrote *"both live RLS reads"*,
the two linked pages selected columns that did not exist and rendered their
empty states unconditionally — the links resolved, the reads did not. The
claim became true at 7B (OW-20 CLOSED at `6afffb7`; the reads then moved
into `lib/hc` at B2/B3). The rewritten cell states exactly that, dated both
ways. RCP-02 repeats the phrase in its own explanation; that row flips
inside 7C, where its cell is rewritten against 7C evidence rather than
patched here.

**Q-G — record.spec's 300 s per-leg budget. RATIFIED as recommended:
ACCEPT** as the provisioning-heavy spec's own bound, recorded in the file —
with reject-all's 420 s (`716cd49`, T3) the same class. No edit.

**Q-H — the gate's disposition. RULED: the four-run record STANDS for the
already-executed 7B merge. No fifth run.** Four complete runs at `18fbdba`,
zero product-assertion failures in any of them, 43/45 twice, every miss a
named host mechanism from the retained traces — that record, said plainly
and never claimed as 45/45 green, is what the owner merged on and the merge
is ratified. **The next observation is 7C's unconditional Tier 1 gate**,
which runs every leg regardless; the tasks and reject-all legs' durations
and outcomes are recorded there in the D13 shape, beside leg 38's (OW-13's
discipline — never re-run to green).

**TSK-03 / TSK-04 — HELD to the 7C gate; round 27 owns the flip.** The unit
halves are proven and the leg passed by title (68 s) and 5/5 targeted, but
never inside a complete gate run at the 7B head — and every green 7B row
holds the "inside a complete run" line. The rows flip at round 27 when the
leg passes inside a complete gate run at the 7C head. Coverage flipped never
early, at the cost of nothing: the gate runs anyway.

---

## The edits this ruling makes, all in this commit

| Where | What |
|---|---|
| `docs/coverage.md` RCP-01 | The "live RLS reads" clause rewritten with OW-20's history and the 7B date it became true (Q-F) |
| `docs/coverage.md` TSK-03, TSK-04 | The flip re-homed: put to round 26 → RULED HELD to the 7C gate, round 27's to make (Q-H) |
| `docs/owed.md` | OW-23 opened, `TAKEN(7C/C2)` — the auth submit routes' budget (Q-B); the tally line re-counted |
| `docs/adr/0035-7b-record-app-deltas.md` | Status line only: marked ruled by this ADR; no D-text touched |

## What this discharges, and what it does not

The 7C entry condition is **DISCHARGED when this commit merges to `main`**
(owner merge, `--no-ff`, as ever). The 7C build session then branches
`slice/7c-sensitive-pair` from the post-merge head — docs-only past
`716cd49`, the evidence head — and starts with C2's fence. Round 27 gains
two obligations from here: the TSK-03/04 flip on gate evidence, and the
D13-shape leg records for tasks, reject-all and leg 38. G4/G7 still block ·
G9 OPEN · G3 open · the band allowlist EMPTY · SIG-01 NOT absorbed ·
`PROMPT_VERSION` does not move.
