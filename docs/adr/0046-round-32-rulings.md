# ADR-0046 — Round 32 closed by owner ruling: Q-A…Q-G ruled on the record, without a reviewer session

**Status:** accepted — owner ruling, 2026-09-06.
**Authority:** `docs/review/round-32-rulings-kickoff.md`, committed at `04823b6`
before anything was argued. It put ADR-0045's Q-A…Q-F plus a new **Q-G** under
ADR-0006's default — *an unanswered pointed question defaults to NOT PLANNED,
and the build does not start* — and the owner ruled them on the record in a docs
commit. **The round-26 shape** (ADR-0036) is the precedent.
**Packet ruled:** ADR-0045, 9A as built. **Evidence head:** `efc2164`; merge
`e1fd0ae` (PR #48), CI run `34076627404` `completed` / `success`.
**Narrative:** `docs/review/round-32-rulings-pr-body.md`.

---

## What closing round 32 this way means, said plainly

Round 32 **CLOSES ruled-without-review**. The owner merged PR #48 directly, as
with 8A (round 28) and 8B (round 29), so **no reviewer session ran and there is
no `round-32-findings.md`.** PR #48's diff received no third-party review at its
planned **Tier 1**. The packet was ruled on its own record — the tallies, the
red→green commit trail, the per-directory tree binding — which a review would
have read and none of which it re-derived. **Anything a reviewer would have
found in that diff is unfound**, and this ADR does not pretend otherwise.

**Nothing turns green because a question was ruled.** Six of the seven below are
the recommendation as put; the seventh carried none and is the one that changes
the project's shape.

## D1 · Q-A — AS RECOMMENDED. `hc.log_artifact_read` keeps its exemption.

By **argument, not threshold**. A freeze suspends interactive *access*; it has
never suspended the *record* of access. Refusing this write would not prevent the
read — it would make the read **unlogged**, strictly worse for the accountability
the FRZ-13 carve-out depends on. `002:22` pins the exempt set by name beside its
reason, so a second exemption is a deliberate edit, not drift. No artifact moves.

## D2 · Q-B — AS RECOMMENDED. The residual is recorded, not fixed here.

`002:21`'s **reader** clause (`prosrc like '%hc.visible_at(%'`) is
under-inclusive and, unlike the writer clause, that direction is argued nowhere:
a future definer resolving its level through a helper, a view, or a definer of
its own — never typing `hc.visible_at(` — writes at `view` and falls outside the
invariant **silently**, the exact failure mode OW-30 was opened to end. The fix is
test-only (no DDL, no bound) but needs its own red, and **a fix in a session that
owes none is not this round's to make.** Opens **`OW-33`**.

## D3 · Q-C — AS RECOMMENDED. The four task-write definers keep their different raises.

`assign_task`, `complete_task` and `snooze_task` raise `freeze_active`;
`claim_task` raises `claim_refused`, 8A having ruled the freeze unnameable there
with `070:32–34` pinning the ONE shape. **The test is the fix; the string does
not move.** FRZ-17 asked for the sibling *test*, not the sibling *raise*, and
adopting `freeze_active` would un-green three merged TSK-05 assertions to buy a
reader an oracle 8A explicitly refused her. `claim_task` is also the only one of
the four reachable from below `manage`, so the asymmetry tracks a real
difference rather than an oversight.

## D4 · Q-D — AS RECOMMENDED. STP-03's marker stands; the row is not re-led.

ADR-0044 D2 said the citation is *"re-led with `071:9`"*; the implementation
amended by marker instead. **The marker is sufficient.** Rewriting a green row's
evidence cell is the edit class the amend-by-marker convention exists to prevent
— a row's history is the record of what each slice shipped (ADR-0025 D6). The
discrepancy between D2's wording and its implementation is **recorded here and
the verdict left alone**, which is what that rule requires.

## D5 · Q-E — AS RECOMMENDED. `OW-32`'s acceptance is a SUBSET condition.

9B ships HOME-01…HOME-05 and A11Y-13, each landing legs, so its run reports
**more** than 66 legs in **more** than 9 files. Read literally the old cell can
never be satisfied by the run it names; read loosely any green run satisfies it,
which is not an acceptance condition at all. It now reads: **the nine files
carrying 9A's 66 legs are all green within the qualifying run, whose own total is
higher by the new legs.** The nine are enumerable at `efc2164` and are written
into the row with their counts — `onboarding` 11 · `a11y` 10 · `ingestion` 8 ·
`people` 8 · `review` 7 · `record` 6 · `search` 6 · `documents` 5 · `extraction`
5, summing to 66. **A run green EXCEPT in one of those nine does NOT discharge
`OW-32`**, and the row says so.

## D6 · Q-F — AS RECOMMENDED. `FRZ-17` stays single-layer.

pgTAP is the whole of it. The route calls the definer and receives the ONE
refusal shape TSK-05's app half already asserts over the rendered tree; a
route-level case would assert the definer twice. **No reviewer named a rendered
difference an app case would catch** — none was asked, the review not having been
held — and if one ever is, it belongs to `OW-32`, not a second FRZ-17 half.

## D7 · Q-G — RULED. The browser gate's home moves off this machine.

**Q-G carried no recommendation**, deliberately: the owner's statement — *"this
computer doesn't have enough memory… we need to do the best we can until we can
get to a staging environment on Vercel"* — was **intent, and a session may not
promote intent to a ruling.** It was put back and ruled in two parts.

**D7a — the gate's HOME is a Vercel staging deployment.** `OW-32`'s acceptance
re-homes from *"the 9B head"* to the same nine files' 66 legs green against a
**Vercel staging deployment, runnable from any host.** This is an **owner
amendment**, made before a line of 9B is written, and recorded as one: G4 and G7
still block — *nothing is production-activated* — and a staging environment is a
pre-production target that does not breach them. **G9 and G3 stand unchanged:
fixtures only, CI remains KEYLESS.** Nothing here authorises CI to run
Playwright or lets a CI run upgrade local gate evidence.

**D7b — 9B MAY close with browser evidence outstanding, as an accepted risk.**
The host has failed preflight's 1.20 GiB floor on every attempt, including after
a reboot: 534 MB free against a 1,229 MB floor, `hc_clamd` alone 1,001 MB.
Blocking 9B on that is blocking it on hardware. `OW-32` moves **`OPEN` →
`RISK(GATE-01)`** — the charter's own shape for an accepted risk: *an owner
ruling plus a never-green coverage row carrying the exposure.* **`GATE-01` opens
`pending` and is NEVER GREEN**; nothing in slice 9 turns it. The debt becomes
permanently visible instead of blocking, and discharges only at D7a's run.

**What D7 does NOT do.** It does not re-diagnose the 2026-09-04 red — that
classification stands, the one permitted re-run (traps §1) UNSPENT — and it does
not license any document to say 9A's surfaces were re-proven; that prohibition
survives the re-home verbatim.

## D8 · The ledger moves, and only the ones the rulings cause

`docs/coverage.md`: **`GATE-01` opens `pending`, Slice `gate`, never green** —
the D7b exposure. **289 → 290 rows · green 259 → 259 (unchanged) · review 9 → 9
· pending 21 → 22.**

`docs/owed.md`: **`OW-32`** acceptance rewritten (D5's subset, D7a's home) and
**`OPEN` → `RISK(GATE-01)`**; **`OW-33`** opens `OPEN` for D2's residual, homed
**NOT THIS SLICE** — the next increment that adds or changes an `hc.*`
`SECURITY DEFINER`, slice 10 the expected earliest — on the two-round escalation
clock from this close. **32 → 33 rows · OPEN 2 → 2 / 25 · RISK 1 → 2 · TAKEN 1 ·
CLOSED 22 · PROMOTED 6.**

**The bound does not move: M1 spent, 1 of ≤ 4. This round ships no DDL**,
consumes no reserve, adds no dependency. Next free ADR **0047**. Re-tallied with
`tests/lint/process.test.ts`'s own parser, never by eye:

```
COVERAGE rows: 290 {"green":259,"review":9,"pending":22}
OWED rows: 33 cap: 25 {"CLOSED":22,"RISK":2,"TAKEN":1,"PROMOTED":6,"OPEN":2}
```

## D9 · ADR-0045 is stamped `accepted`, and 9B may start

**The stamp records that Q-A…Q-F were RULED, not that a round was held**
(ADR-0042's wording; the distinction matters more here, round 32's review having
never been held at all). **Q-G is not ADR-0045's** — this round's kickoff raised
it, D7 rules it, its home is this ADR. With D1…D6 ruled, ADR-0006's default is
discharged and **9B's build may start**: its own fresh session, from `main` after
this PR merges, `OW-28`'s unit FIRST (ADR-0044 D1, Tier 2). **This PR merges
nothing and fixes nothing — the owner is sole merge authority, no session merges
its own work, and the merge is `--no-ff`.**
