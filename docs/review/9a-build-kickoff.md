# 9A — the freeze guard, Tier 1. The build.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. Commit this brief as `docs/review/9a-build-kickoff.md` FIRST, then
the docs-only ledger + coverage commit, then M1 red→green.

## STATE — settled, do not redo

- **PR #47's merge IS the entry condition — VERIFY, never assume.** Branch from
  `origin/main` after a fetch: **`slice/9-freeze-guard`**. Confirm `main` =
  **`1eab0e5`**, a merge commit whose **second parent is `d801778`**, before
  writing a line. If not, STOP. (CI on `main` was `in_progress` at the merge —
  confirm that run went green; `34b5c78` before it was success.)
- **Slice 9 is RULED (plan Q1–Q9) and round 31 is DISPOSED (ADR-0044)** — do not
  re-argue either. You are the **build**, not a round; round 32 reviews you.
- **9A is Tier 1 and rides alone: M1 plus its pgTAP pair. Nothing else — no
  surface, no route, no component.** Tier 1 RULED at the plan gate (Q1), not
  assumed. Evidence is the full closure set **plus the browser gate,
  UNCONDITIONALLY** — ADR-0033 D19.14 says a kickoff may not narrow it, and this
  one does not.
- **M1 = `claim_task_freeze_guard`**, a `create or replace` over
  `hc.claim_task(p_task uuid)` restating the body with the explicit `state in
  ('open','unresolved')` test against `public.freezes` that `assign_task`,
  `complete_task` and `snooze_task` each already carry — **placed where theirs
  are, BEFORE the level test, so no cap can lower it.** `security definer set
  search_path = ''`, plus the owner/revoke/grant trio restated in the same
  migration (the 2A M8 way). Closes `FRZ-17` + `OW-27` (ADR-0043 D2).
- Ledgers as they stand: coverage **282 · green 258 · review 9 · pending 15**;
  owed **OPEN 5 / 25** — OW-27 (yours), **OW-29/30/31 (yours)**, OW-28 (9B's).
  Migrations **76 → 77**; **pgTAP files stay 71** (M1's cases append to `070`,
  whose `plan(40)` is re-pinned in the same commit). Next free ADR **0045**
  (`0039` claimed by unmerged PR #35).
- **Bound ≤ 4, already partly closed:** M1 is yours · **M2 CLOSED UNCONSUMED**
  (ADR-0044 D6 — no round-31 finding needed DDL) · **M3 reserved** for rounds
  32/33's dispositions · **M4 reserved and NAMED** for 9B's measured p95 breach.
  **Spend M1 only.**
- NOT activated: G4/G7 block · G9 OPEN · G3 open · G12-01 `pending` at `gate`.
  PRs #35 and #36 open, neither yours.

## THE FIRST COMMIT — docs-only, quoting the rulings

Before any SQL: `docs/coverage.md` gains the **`## 9 — Home`** section with
**HOME-01…HOME-06 and A11Y-13** exactly as the plan's *"Coverage rows to open"*
table words them (HOME-06 `pending` at `gate`, never green this slice; the rest
`pending` 9B). **`FRZ-17` gets NO new row** — it exists, and flips at your head.
`docs/owed.md`: **OW-27 → `TAKEN(9A/M1)`** (plan Q3) and **OW-29, OW-30, OW-31 →
`TAKEN(9A/…)`** (ADR-0044 D2/D3/D4), quoting each ruling. **OW-28 stays OPEN —
it is 9B's.** **Do NOT re-correct `owed.md`'s tally line**: ADR-0044 D7 already
moved it to `TAKEN 1 · CLOSED 18` and discharged the plan's Q7 observation.

## THE THREE OWED ITEMS THAT RIDE THIS INCREMENT

1. **OW-30 rides M1's OWN commit, and its RED comes first.** A catalog-driven
   `pg_proc` assertion — every `hc.*` `SECURITY DEFINER` reaching
   `hc.visible_at(` **and writing** must test `public.freezes` — with the
   **exempt set PINNED**, home `002_definer_invariants.sql` (so the file count
   stays 71). **Written BEFORE the guard it is RED on `hc.claim_task` itself,
   and M1 is what turns it green.**
2. **OW-31 rides M1's commit too:** two fixture rows and two cases in `070` — a
   `cancelled` task and a soft-deleted one, each refused in the ONE shape — and
   **your M1 header states the refusal set exactly** (`done`, `cancelled`,
   soft-deleted, nonexistent). Narrowing 8A's shipped header is UNAVAILABLE.
3. **OW-29 rides 9A in its OWN SEPARATE commit, never folded into M1's.** Move
   the `STP-03:` label onto a case that discriminates (`071:7` or `:9`); rebuild
   case 4 to mint the **three-part** `member:subject:health` and post `manage`;
   re-lead STP-03's citation with `071:9`; re-pin `071`'s `plan(n)`. **Its
   evidence must be a PROBE, not a passing test** — each relabelled case run
   once against a rolled-back `hc.set_grant` with the suffix removed, **the RED
   pasted into the commit** (the `064` pattern).

## WHERE TO PUSH HARDEST

1. **The pgTAP pair is two cases, and the CONTROL is half of it** (plan Q3): a
   carve-out coordinator REFUSED under an **`unresolved`** freeze **and** her
   READ through the carve-out still resolving, in the same file. `070` opens its
   freeze with the `state` default `'open'` — that default is exactly why four
   merged rounds missed FRZ-17.
2. **Guard placement, not guard presence.** Above the level test, never after;
   `hc.visible_at` applies FRZ-13's cap as `least(…)`, so a guard below it is
   the same defect wearing a fix.
3. **Restate every later ALTER in the replaced body.** A `create or replace`
   that drops the owner or the EXECUTE grants is a privilege regression, and
   `002`'s exact-set pins are what catch it.

## ⏸ AT THE CLOSURE EVIDENCE AT ONE DECLARED HEAD, STOP

Full closure set + the browser gate. Then the **round-32 packet** is its own
fresh session, and **9B** after it.
