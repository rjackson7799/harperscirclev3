# Slice 9B — Home. Tier 2, round 33.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. Commit this brief as `docs/review/9b-build-kickoff.md` FIRST.

## STATE — settled, do not redo, do not re-argue

- **`main` = `aae90d2`** — PR #49 merged `--no-ff` 2026-09-07 (parents
  `e1fd0ae` + `1846404`). Branch from `origin/main` AFTER a fetch.
- **CI on `aae90d2` is RED and it is NOT a defect — do not re-diagnose it.**
  Run `34082125537`, step 8 *"Start local Postgres"*, `toomanyrequests: Rate
  exceeded` on `public.ecr.aws/supabase/realtime` — the ECR quota traps §1
  names. Steps 9–21 never ran. The PR-head run `34081476383` ran the FULL
  suite green and **`aae90d2^{tree}` EQUALS `1846404^{tree}`**. **Re-run
  (`gh run rerun 34082125537`) and confirm green before this slice closes.**
- **Round 32 is RULED and MERGED** — ADR-0046 rules Q-A…Q-G, ADR-0045 stamped
  `accepted`. ADR-0006's NOT PLANNED default is discharged: **9B may start.**
  Round 32's review was never held, and that is on the record.
- **9A is CLOSED — do not rebuild it, do not re-earn its evidence.** Code head
  `efc2164`, migrations **77**, pgTAP **71 files Σ 1,871**, vitest **1,563**.
- Ledgers, by `tests/lint/process.test.ts`'s own parser, never by eye: coverage
  **290 · green 259 · review 9 · pending 22**; owed **33 rows · OPEN 2 / 25 ·
  RISK 2 · TAKEN 1 · CLOSED 22 · PROMOTED 6**.
- **The HOME rows ALREADY EXIST.** 9A's first docs commit opened HOME-01…
  HOME-05 and A11Y-13 `pending`, so **this slice opens no coverage row — it
  flips them.** HOME-06 is Slice `gate` and never green in this slice (Q6).
- Bound **M1 spent, 1 of ≤ 4** · M2 CLOSED UNCONSUMED · M3 held · **M4 is
  YOURS and NAMED**: one composed Home read definer, consumed **ONLY on a
  MEASURED page-p95 breach at the 9B head** (PRD §13.2's 1.5 s / 3 s, or
  PRF-06's 250 ms tripwire) **with the numbers pasted into the red commit**.
  Expected **UNCONSUMED**. Next free ADR **0047**.

## THE GATE RULE CHANGED AT ROUND 32 — READ BEFORE PLANNING EVIDENCE

Every earlier document says 9B's browser gate is MANDATORY and discharges
`OW-32`. **ADR-0046 D7 replaced that, and it is the newer ruling.**

- **D7a — the gate's HOME is a Vercel STAGING deployment**, not this host.
  `OW-32`'s acceptance is the nine files' 66 legs green there as a **SUBSET**
  of a larger run — your legs raise the total, and a run green EXCEPT in one
  of those nine does not discharge it.
- **D7b — 9B MAY CLOSE WITH BROWSER EVIDENCE OUTSTANDING.** `OW-32` is
  **`RISK(GATE-01)`**, not `OPEN`, and **`GATE-01` is a never-green coverage
  row**. Nothing you do turns it green.
- **This is permission to CLOSE, not permission to SKIP.** Attempt the gate.
  The host ceiling is real — 534 MB free against a 1,229 MB floor, `hc_clamd`
  alone 1,001 MB — and if it cannot run, **say so with the measurement**.
  Never re-run a product failure to green; never claim a leg you did not see
  pass. G9/G3 stand; CI is KEYLESS and never runs Playwright.

## THE TASK — Tier 2, ruled at the plan gate and never lowered mid-slice

**`OW-28`'s unit is FIRST, before the day-one card** (ADR-0044 D1). Both
*Raise access* panels on the member page must name what they confirm — the
subject, `DOMAIN_LABEL[rd]`, `LEVEL_WORD[rl]` — and **the test asserts the
WORDS, both ways**, including a **crafted** `rs`/`rd`/`rl` rendering the same
three words it would grant. `rl=hidden` renders as the revocation it is.
**Validation is NOT the fix** and does not close the row: the crafted
`target_ref` is perfectly well-formed. `STP-04` carries the exposure until it
lands.

Then the plan's four units — and **units 1 and 2 are ONE increment in this
order, the order being load-bearing**:

1. **The day-one card** — one instruction, the forwarding address, both
   addresses labelled on a two-subject circle, **and nothing else**, asserted
   as ABSENCES against a tree where the router does not yet exist.
2. **The router** — the five §4.7.2 blocks, each from its destination surface's
   own read, each rendering **nothing** when its read is empty (never a zero,
   never a heading). **HOME-01's "nothing else" must survive its arrival.**
3. **The nav entry and the routing** — Home in `nav-manifest.ts`, its tier
   courtesy, the post-setup destination repointed.
4. **Bounds and a11y** — one `withPageBudget`, the measured p95, `A11Y-13`.

Build **red→green per unit, the failure signature in the red commit message**.
**`lib/ai/` has NO import path to this surface, and HOME-03 fence-tests that.**
Recent activity is a **descending, small-limit read** proven against a fixture
larger than the cap — never the tail of an ascending `limit 300` (the OW-26
class). 9B may hold Tier 3 units; the split rule forbids T1+T3, not T2+T3.

## ⏸ AT THE PACKET, STOP

Assemble `docs/review/round-33-packet.md`, the deltas ADR, and the PR titled
`[DO NOT MERGE without owner sign-off]`. **Fix nothing; merge nothing.** The
owner is sole merge authority.
