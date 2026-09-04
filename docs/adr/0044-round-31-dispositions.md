# ADR-0044 — Round 31's dispositions: the commissioned adversarial pass over 8A's M1 and M2

**Status:** proposed — put to the owner as round 31's dispositions. **Docs-only,
Tier 3 as a change**; **the cap taken is Tier 1's 150.** The table, every
argument and the mechanical reconciliation live where tables live,
`docs/review/round-31-dispositions.md`. **Branch:** `docs/round-31-dispositions`
from `origin/main` @ `34b5c78` — VERIFIED as a merge commit whose second parent
is `7662898` (PR #46), this leg's entry condition. **Date:** 2026-09-03.
**Authority:** CLAUDE.md → `docs/process/slice.md` →
`docs/review/slice-9-plan.md` Q1–Q9 (SETTLED 2026-09-03) → ADR-0043 D6 →
`docs/review/round-31-findings.md`, landed VERBATIM. **Ruled by** this session
on the owner's standing instruction — *"go with your best recommendation for
each open item"*; **the owner ratifies by merging the PR that carries this
file.** **No code, migration, test or dependency. Nothing production-activated.**

**`FIXED` was not available to this session** and no row claims it: **OWED 4 ·
ACCEPTED-NOTE 3 · NOTED 4 · DECLINED 1 · FIXED 0 · OWNER 0** across ten rows,
counted with a command. **And obey this before reading further:** Tier 1's *3–8
lenses, at least one from a different model family than the author* is **MET —
by one reviewer taking six passes, not six reviewers.** The model-family clause,
the only one buying independence, is satisfied once: M1 and M2 are Claude Fable
5.1's (`Co-Authored-By` on `0e780f8`, `05faed4`), round 31 is Claude Opus 5.

## D1 — F-1 (MAJOR): the confirmation surface names nothing it confirms

Both *Raise access* panels name the **grantee** and nothing else, so a
coordinator following a crafted same-origin link confirms with her password a
subject, domain and level neither screen named. **M2 made this sharper, not
safer. Severity RATIFIED at MAJOR.** Four things to obey:

1. **`OWED`, home 9B, its unit ordered FIRST, before the day-one card** — not
   9A, ruled *"M1 plus its pgTAP pair. Nothing else"* (Q1), and not a third
   increment. **Slice 9 does not ship Home while the confirmation surface it
   already has cannot be read.** The order costs nothing: the fix touches
   nothing Home touches, so Q1's day-one-then-router order is untouched.
2. **The unit is Tier 2, ruled DOWN from the fail-closed Tier-1 default** — an
   auth **surface**, no auth **decision**: no gate, no token composition, no
   definer, no route logic moves. **Tier 3 REFUSED** — a batched close-out pass
   cannot review the repair of a MAJOR confirmation defect. **9B stays Tier 2,
   so the split rule is untouched and no tier is lowered mid-slice.**
3. **It earns its OWN coverage row, `STP-04` — not an amendment to STP-03**,
   whose stated assertion is DB-shaped and TRUE. The shape is FRZ-17's:
   `pending`, never green until the words land, carrying the exposure meanwhile.
4. **Validation is NOT the fix and does not close the row** — the crafted
   `target_ref` is perfectly well-formed. **The repair is display.**

**Carried as:** **STP-04** `pending` · **OW-28** `OPEN`, its condition naming
the words, `rl=hidden`, and a test asserting them **both ways** — the honest
path AND a crafted `rs`/`rd`/`rl`.

## D2 — F-2 (MAJOR): STP-03 stays green; its evidence citation was wrong

`071:4` carries the `STP-03:` label, is cited FIRST, and **passes identically
with M2's level suffix removed** — proven live with the control in the same
rolled-back transaction; `071:10` is the same shape. **RULED: `ACCEPTED-NOTE ·
OWED`. The row does not move**, standing on `071:7`, `:9` and `:11`. **STP-03 is
AMENDED BY MARKER, never rewritten: read its pgTAP evidence as leading with
`071:9`.**

**The repair rides 9A in its OWN commit, not folded into M1's** — Q1's *"nothing
else"* names no surface, no route, no component, of which a pgTAP file is none.
**Its evidence must be a PROBE, not a passing test:** each relabelled case run
once against a rolled-back `hc.set_grant` with the suffix removed, **the RED
pasted into the commit** (the `064` pattern). **OW-29**.

## D3 — F-3 (MINOR): the invariant is pinned, and its red is free

`hc.claim_task` is the **only** `hc.*` write definer admitting below `manage`,
so FRZ-13's read-only carve-out held **by threshold coincidence, never by
construction**; 9A's guard closes the instance and pins nothing.
**RULED: `OWED`** — ADR-0026 binds. A catalog-driven `pg_proc` assertion: every
`hc.*` `SECURITY DEFINER` reaching `hc.visible_at(` **and writing** must test
`public.freezes`, with the **exempt set PINNED** — a body-text heuristic only
behind that pin. Home **`002_definer_invariants.sql`**, so the pgTAP file count
stays **71** as Q2 requires. **Written BEFORE M1's guard and inside M1's own
commit it is RED on `hc.claim_task` itself and M1 turns it green**; added
after, it is born green and proves nothing. **OW-30**.

## D4 — F-4 (MINOR): two cases, and the remedy the charter forbids

**RULED: `OWED`** — two fixture rows and two cases in `070_task_claim.sql`
(`cancelled`, soft-deleted), whose `plan(40)` 9A re-pins anyway. **Round 31's
alternative remedy — *"narrow M1's header"* — is UNAVAILABLE:** `20260903120001`
is shipped and shipped migrations are never edited. The correction rides slice
9's **new** M1 header, stating the refusal set exactly — `done`, `cancelled`,
soft-deleted, nonexistent. **OW-31**.

## D5 — The dissent stands recorded, and is answered without re-ruling anything

Round 31 dissents from the ruling that STP-03's app half flipped (ADR-0043 D1).
**A settled ruling is not a finding, and that ruling STANDS:** the app genuinely
*composes and confirms* the four parts, on the standard every other app half was
flipped on. **Nothing un-greens because a question was ruled.** But **what the
dissent is right about is ADR-0040 D6's words, and a gloss is amendable where a
verdict is not.** D6 claims the level *"is now also in the
sentence the database matches"*; there is no sentence — the password is offered
**bound to** the four parts without being offered **for** anything a reader can
see. **RULED: `ACCEPTED-NOTE` — UPHELD as to D6's words, NOT as to STP-03's
status.** ADR-0040 gains a head index and one marker at D6, its prose untouched
beneath (the ADR-0037 shape). **No owner amendment is put, because none is
needed:** nothing in ADR-0043 must move for the record to become true, and the
dissent's substance is carried by `STP-04`.

## D6 — The reserve, DECLINED into UNCONSUMED, and the bound

Round 31 names one thing that would consume **M2**: ruling that F-1 needs a
**database-side** guarantee. **DECLINED**, and round 31 recommends against it
too — **no database guarantee can make a panel legible**, and the mechanism buys
a design to avoid printing three words already imported into the file.

- **M2 — reserved and NAMED for a DDL fix arising from this pass — closes
  UNCONSUMED.** No finding needs DDL: F-1 rendering, F-2/F-4 test-only, F-3 a
  catalog assertion.
- **M3 — reserved for the round-31/32/33 dispositions — is NOT consumed
  either**: this is that round and it needs none. It holds for rounds 32/33.
- **M1 and M4 untouched. Spent: 0 of ≤ 4. Expected close: 1 of ≤ 4**, as Q2
  ruled. **This round amends no bound and asks to amend none.**

## D7 — What moved in the ledgers, and what deliberately did not

**Nothing turns green because a finding was disposed.** Counted with
`tests/lint/process.test.ts`'s own parser, never by eye:

| | Before (`34b5c78`) | After | Why |
|---|---|---|---|
| rows | 281 | **282** | `STP-04` opened |
| green | 258 | **258** | **unchanged** |
| review | 9 | **9** | unchanged |
| pending | 14 | **15** | `STP-04`, never green |
| `owed.md` OPEN | 1 / 25 | **5 / 25** | `OW-28`–`OW-31` |

**One cell AMENDED WITH A MARKER, never rewritten:** STP-03 (D2 and D5).
`docs/owed.md`'s tally line is corrected from `TAKEN 2 · CLOSED 17` to the
parser's `TAKEN 1 · CLOSED 18` — **a fact, not a verdict** — discharging the
plan's Q7 observation, which had assigned it to 9A's docs commit.

**The burn-down quota.** Q7 expected slice 9 to open **0**; it opens **4**, and
that expectation is corrected here, not at the close-out. **Not a violation** —
every row names a unit inside slice 9, so the slice opens 4, closes 5 with
`OW-27`, and `OPEN` goes 1 → 5 → **0** across it (the arithmetic is in the
table). **A pass that opens nothing has bought nothing.**

**NOT claimed:** product evidence re-earned (8A `4d166c0` stands as merged) · a
gate re-run · a finding fixed · `FRZ-17`/`OW-27` moved, they are 9A's ·
ADR-0043's rulings, Q1–Q9 or STP-03's status word moved · a held review of 9A or
9B, **rounds 32 and 33 being still to come** · G4/G7 block · G9 OPEN · G3 open ·
G12-01 `pending` at `gate` · LOG-03 never green · SIG-01 not absorbed · PRs #35
(ADR-0039) and #36 open. **9A's kickoff is its own fresh session.**
