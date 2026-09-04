# Round 31 — dispositions

**The table for `docs/adr/0044-round-31-dispositions.md`.** The ADR holds only
what a future session must obey; every verdict, its argument and its
reconciliation are here (ADR-0038's split, and the `slice` skill's).

**Branch:** `docs/round-31-dispositions`, from `origin/main` @ `34b5c78` —
**VERIFIED** as a merge commit whose second parent is `7662898` (PR #46, round
31's findings), which is this leg's entry condition. **Date:** 2026-09-03.
**Docs-only.** No code, no migration, no test is written here, so **`FIXED` is
not available to this session** — the repairs are 9A's and 9B's.

**Source:** `docs/review/round-31-findings.md`, landed VERBATIM at `7662898`.
Four findings, two MAJOR, two MINOR; four recorded observations; one dissent
against a settled ruling. **This session disposes; it does not re-review.**
Two citations were re-anchored at this head before being repeated in a binding
record (LINE NUMBERS DRIFT — traps §5): `people/[member]/page.tsx`:238–265 is
the *Raise access* section and `DOMAIN_LABEL`/`LEVEL_WORD` are imported at :17
and :20 and used only in the matrix at :296/:306; `071`:176–177 and :206–207
are cases 4 and 10 with the `STP-03:` label on the first. Both hold exactly.

---

## The lenses, and what Tier 1's requirement actually got

Round 31 asks that this be said in the disposition rather than left to be
misread later, and it is right to ask. **Six lenses, ONE reviewer, one
sitting.** L1–L6 are six distinct passes by a single reviewer, not six
independent reviewers, and the findings are numbered `F-<m>` in one sequence
because of it. Tier 1's requirement is *3–8 distinct lenses, at least one from
a different model family than the author*: the lens count is met six times
over, and the **model-family** clause — the only clause that buys independence
— is met once and exactly once. M1 and M2 were authored by Claude Fable 5.1
(the `Co-Authored-By` trailers on `0e780f8` and `05faed4`); round 31 is Claude
Opus 5. **Recorded so that no later session reads six reviewers into that
file.** The requirement is MET. It was not met at round 28, which is why this
round exists (ADR-0043 D6, slice-9 plan Q4).

---

## The dispositions

`F-*` are findings · `D-*` a dissent against a settled ruling · `O-*` recorded
observations · `R-*` a recommendation ruled on. Compound verdicts are legal.

| # | Sev | In one line | Verdict | Home |
|---|---|---|---|---|
| **F-1** | MAJOR | The *Raise access* panels name the **grantee only** — no subject, no domain, no level — so the password is given for a sentence nobody wrote, and M2 made the app and the database agree with new precision about exactly that unseen value | **OWED · ACCEPTED-NOTE** | `OW-28` → **9B, unit ordered FIRST**; `STP-04` opened `pending`, never green until it lands |
| **F-2** | MAJOR | `071`:4 carries the `STP-03:` label, is cited FIRST in STP-03's cell, and passes identically with M2's suffix removed — proven live with the control in the same rolled-back transaction; `071`:10 is the same shape | **ACCEPTED-NOTE · OWED** | STP-03 **AMENDED BY MARKER**, the row stays green on 071:7/9/11; `OW-29` → **9A, its own commit** |
| **F-3** | MINOR | Nothing pins *no write definer admits at or below the FRZ-13 cap*; `hc.claim_task` is the only `hc.*` write definer below `manage`, so "read-only carve-out" held by threshold coincidence, not by construction | **OWED** | `OW-30` → **9A, inside M1's commit** |
| **F-4** | MINOR | M1's header claims a **deleted** task refuses and `070` builds none; `cancelled` refuses and is named nowhere | **OWED** | `OW-31` → **9A, inside M1's commit** |
| **D-1** | — | Round 31 dissents from the ruling that STP-03's **app half** flipped (ADR-0043 D1 / D5, round 28 Q-F): the evidence proves the app *composes and confirms* the four parts, never that it *shows* them | **ACCEPTED-NOTE** | **The flip STANDS.** ADR-0040 **D6** amended by marker; the substance carried by `STP-04` |
| **O-1** | — | `/account/step-up/submit` mints against an entirely unvalidated `target_ref` (`route.ts`:32), no coordinator check, no shape check | **NOTED** | Defensible and the honest posture — recorded because it is the mechanism F-1 rides |
| **O-2** | — | A raise token survives a same-level no-op: `set_grant` returns `changed:false` before demanding anything, so the token stays live to its 5-minute expiry | **NOTED** | Not a defect. Recorded so it is not re-derived as one |
| **O-3** | — | `071` exercises no freeze at all, though STP-03's cell cites it | **NOTED** | Justified — 038's raise cases were re-pinned in the same commit and carry it |
| **O-4** | — | `isGrantLevel` accepts `hidden`, so a crafted `rl=hidden` renders the *Raise access* panel for what is a **revocation** | **NOTED** | Harmless — the definer decides — but it is the same missing-words surface, and its repair is **inside `OW-28`'s acceptance condition**. No separate row |
| **R-1** | — | Round 31's alternative: rule that F-1's fix must include a **database-side** guarantee — binding the token to something the coordinator demonstrably saw — which would consume **M2** | **DECLINED** | Argued below. **M2 closes UNCONSUMED** |

**Findings: 4.** Verdict instances across all ten rows: **OWED 4 ·
ACCEPTED-NOTE 3 · NOTED 4 · DECLINED 1 · FIXED 0 · OWNER 0.** Counted with a
command, not by eye (the re-tally, below) — **and the command corrected this
sentence twice before it was committed**, which is the whole reason the step
exists: it was drafted as *"eleven rows"* and *"OWED 5"*.

---

## The arguments, where a verdict needs one

### F-1 — why OWED into 9B, ordered first, and why it earns a row of its own

**Severity RATIFIED at MAJOR**, neither raised nor lowered. It is not a
BLOCKER: nothing is production-activated (G4/G7 block), the actor must already
be a coordinator of that circle, the grant is written to the access log with
both levels (AC-PERM-5), the care ceiling still binds structurally even against
a valid token, and a lower needs no token so it is reversible. It is not MINOR:
it defeats the *purpose* of the one control §5.7 exists to provide. A
confirmation surface that cannot be read is not a confirmation.

**Not 9A.** 9A is ruled *"M1 plus its pgTAP pair. Nothing else. No surface, no
route, no component"* (slice-9 plan Q1, SETTLED). F-1's repair is a surface;
its evidence is a rendered-tree assertion and a browser leg, which is 9B's
shape and not the pgTAP increment's. Widening 9A here would also put a
person-facing unit inside a Tier-1 migration increment for no gain.

**Not its own increment.** A third increment buys a session, a tier argument
and a kickoff for a three-expression rendering change on a surface 9B's tier
already covers.

**9B, and FIRST.** This is what *"the fix precedes a new surface"* means:
slice 9 does not ship Home — the surface with the widest audience — while the
confirmation surface it already has cannot be read. The order is free: F-1
touches `people/[member]/page.tsx` and nothing Home touches, so Q1's
load-bearing **day-one-then-router** order inside Home is untouched.

**Its tier: Tier 2, matching 9B, ruled DOWN from the fail-closed default and
recorded as a ruling.** `docs/process/slice.md` §1 makes a unit whose tier must
be argued Tier 1 until it is ruled down, and this one must be argued: the panel
*is* the §5.7 confirmation surface, and "handles auth" is a first-YES trigger.
Ruled **down to Tier 2** because the change touches an auth *surface* and no
auth *decision* — no gate, no token composition, no definer, no route logic
moves; the diff is what a person reads. **Tier 3 is refused**, and this is the
load-bearing half: Tier 3 buys one batched single-lens pass at close-out, which
is the wrong instrument for the repair of a MAJOR confirmation defect — 9B's
own Q1 argument, applied to the unit that most needs it. **9B as a whole stays
Tier 2, so the split rule is not touched**, and no tier is lowered mid-slice.

**A row of its own — `STP-04`, and not an amendment to STP-03.** STP-03's
stated assertion is DB-shaped (*a token minted for `summary` does not consume
against a post of `manage`*) and it is TRUE. What F-1 falsifies is a different
claim — that the coordinator is shown what she is confirming — which STP-03
never made. Folding the two into one cell would blur a true assertion with a
false one. The honest shape is the **FRZ-17 shape**: a new row carrying the
assertion that does not hold, `pending`, never green until the fix lands,
carrying the exposure meanwhile. It is also what makes the gap visible to the
next consumer of §5.7, which O-1 says will inherit the mechanism.

**Validation is refused as the fix, explicitly.** Shape-validating `target_ref`
at the mint route is worth doing on its own merits and **does not close this**:
the crafted `target_ref` is perfectly well-formed. The repair is display.

### F-2 — the row stays green; the evidence citation is what was wrong

STP-03 is **not** unsupported and its status does not move. `071`:7, :9 and :11
each flip when M2's suffix is removed, and :9 — the three-part token that no
longer raises — is the case that proves the binding was *replaced, not widened*
(ADR-0040 D5 / Q-D). What is wrong is that **the case the row is named after,
and cites first, is the one that proves nothing**: a four-part token mismatches
a three-part composition with or without M2. A reader auditing STP-03 by
following its first citation lands on a case with no discriminating power, and
a future regression of the suffix leaves cases 4 and 10 green under their
`STP-03:` titles while three unrelated-looking cases go red.

**AMENDED BY MARKER, never rewritten** (ADR-0025 D6): STP-03's cell keeps every
word it has and gains a marker recording that its evidence leads with a
non-discriminating case, that the discrimination lives at 071:7/9/11, and that
the repair is `OW-29`.

**The test repair rides 9A — its own commit inside the increment, not folded
into M1's.** It belongs in slice 9 at all because 9A is the **only** increment
in this slice that touches the pgTAP layer (9B is app + e2e), and round 32 —
9A's review, 3–8 lenses — is the right instrument for reading a discrimination
repair. Q1's *"nothing else"* names *no surface, no route, no component*; a
pgTAP file is none of the three, so this is inside the letter of the ruling and
not a widening of it. It is a **separate commit** so that M1's guard commit
stays a readable red→green over one function.

**And its own evidence must be a probe, not an assertion.** A relabelled case
that merely passes proves exactly what round 31 caught case 4 proving: nothing.
The acceptance condition therefore requires each relabelled case run once
against a **rolled-back** `hc.set_grant` with the suffix removed, with the RED
output pasted into the commit — the `064` pattern round 31 itself used, and the
control is what makes it evidence.

### F-3 — the invariant is pinned, and its red is free

ADR-0026's rule is binding doctrine — *if it can be a scanner, a manifest, or
an exact-set assertion, it must be* — and this is exactly that shape. 9A's
guard closes the instance FRZ-17 names and pins nothing; the next write definer
gated at `>= 'view'` reruns the same reasoning with no test in its way.

**The red→green is free and rides M1's own commit, which is why it goes there
rather than after it.** The catalog assertion, written **before** M1's guard,
is RED on `hc.claim_task` itself — the one function in the tree that violates
the invariant today — and **M1 is what turns it green.** That is a genuine
red→green with the failure signature in the red commit, at zero extra cost, and
it is a better shape than adding the assertion afterwards where it is born
green. **Home: `002_definer_invariants.sql`**, where exact-set definer pins
already live, so the pgTAP file count stays **71** exactly as the plan requires.

### F-4 — and the half of round 31's remedy that the charter forbids

Round 31 offers two closers: two cases in `070`, **or** narrowing M1's header.
**The second is not available**: `20260903120001` is a shipped migration and
shipped migrations are never edited (CLAUDE.md). The correction rides the
header of slice 9's **new** M1 — which is a `create or replace` over the same
function and therefore restates the contract anyway — stating the refusal set
exactly (`done`, `cancelled`, soft-deleted, nonexistent) rather than restating
the over-wide claim. Both halves are in `OW-31`'s acceptance condition. The
cost is near zero: 9A already re-pins `070`'s `plan(40)` in the same commit.

### D-1 — the dissent stands recorded, and it is ANSWERED without re-ruling

**A settled ruling is not a finding.** ADR-0043 D1 ruled STP-03's app half
flipped, and **that ruling STANDS.** It is defensible against the row's own
stated assertion: the app genuinely *composes and confirms* the four parts, and
that is what "the app binds the level" means. Nothing un-greens because a
question was ruled, any more than something greens because one was.

**What the dissent is right about is not the row's status — it is ADR-0040
D6's words.** D6 says the level *"is now also in the sentence the database
matches"*, and D6 opens by saying the site *"offers the password FOR
`member:subject:domain:level`"*. There is no sentence, and the password is
offered *bound to* those four parts without being offered *for* anything a
reader can see. **That gloss is what F-1 falsifies, and a gloss is amendable
where a verdict is not.** ADR-0040 therefore gains a **head index and one
marker at D6**, the ADR-0037 shape — the original prose untouched beneath it.

So: **the dissent is UPHELD as to D6's words, NOT upheld as to STP-03's
status**, and its substance is carried where substance belongs — `STP-04`,
never green until a coordinator can read what she is confirming. **No owner
amendment is put**, because none is needed: nothing in ADR-0043 has to move for
the record to become true.

### R-1 — DECLINED, and the reserve therefore closes UNCONSUMED

Round 31 names one thing that would consume M2: ruling that F-1 needs a
database-side guarantee rather than a rendering change — binding the token to
something the coordinator demonstrably saw. **DECLINED**, and round 31
recommends against it too. The defect is on the confirmation surface and the
repair belongs there; **no database guarantee can make a panel legible**, and
the design it would require (a server-issued nonce over rendered text, or a
signed display commitment) is a new mechanism bought to avoid printing three
words that are already imported into the file. The four-part binding M2 shipped
is sound; F-1 is the half of R3's dissent that was never about the database.

---

## The M-slots, ruled in words

- **M2 — reserved and NAMED for a DDL fix arising from this pass — closes
  UNCONSUMED.** No finding in round 31 needs DDL: F-1 is app-layer rendering,
  F-2 and F-4 are test-only, F-3's closer is a catalog assertion. R-1, the only
  route to consuming it, is DECLINED above. *A reserve not consumed closes
  UNCONSUMED, and the bound closes at what was spent.*
- **M3 — reserved for the round-31/32/33 dispositions — is NOT consumed by
  round 31 either.** This is the dispositions round and it needs no migration.
  M3 stays reserved for rounds 32 and 33 on its own named condition.
- **M1 and M4 are untouched by this round.** M1 is 9A's, planned. M4 is
  reserved and NAMED for a Home read definer on a MEASURED p95 breach.
- **Spent today: 0 of ≤ 4.** Expected close remains **1 of ≤ 4** (M1), exactly
  as the plan gate ruled. **Nothing here amends the bound**, and nothing in this
  round asks to.

---

## The re-tally — mechanical, before ratifying

Round 16 shipped an ADR whose prose and table disagreed, with two rows reading
OWED for fixes that had landed; it has recurred three times since (R3/F-9,
R6/F-6, R8/F-1). Counted here with commands, at this head.

**1 · The verdict column, counted — not read.** The instrument splits the
verdict cell on `·` and matches whole verdicts, so `ACCEPTED-NOTE` cannot be
miscounted as `NOTED`; it reads `docs/coverage.md` and `docs/owed.md` with
`tests/lint/process.test.ts`'s **own** `cells`/`statusOf`/`ASSERTION_ID`,
copied character-for-character (a paraphrased `statusOf` reads 244/13 where the
file holds 258/14). Output at the head this round ratifies:

```
== disposition table ==
rows: 10 | F-1 F-2 F-3 F-4 D-1 O-1 O-2 O-3 O-4 R-1
findings (F-*): 4
MAJOR: 2 MINOR: 2
  FIXED: 0
  OWED: 4
  OWNER: 0
  ACCEPTED-NOTE: 3
  DECLINED: 1
  NOTED: 4
```

**The number that matters is `FIXED: 0`**, which it must be: this session
writes no code, so a `FIXED` row would be a claim with nothing behind it.

**2 · Prose against table.** Four findings; two MAJOR (F-1, F-2), two MINOR
(F-3, F-4); **zero FIXED, zero OWNER**; **four** OWED instances, **one ledger
row each** (F-1, F-2's repair, F-3, F-4 — O-4 rides `OW-28` and opens no row of
its own). Three ACCEPTED-NOTEs (F-1's coverage row, F-2's marker, D-1's
marker). One DECLINED (R-1). The paragraphs above say the same, and no
paragraph claims a verdict the table does not — **after two corrections the
count forced**, recorded rather than quietly applied.

**3 · Every OWED row against `docs/owed.md`.** Four new rows, `OW-28`–`OW-31`,
each `OPEN`, each with an acceptance condition, each naming a home in a live
slice. **None of them is already closed** — none describes work that exists at
`34b5c78`: `tests/routes/member-detail.test.ts` still holds only
`expect(html).toContain('Raise access')`; `071`:176 still carries the
`STP-03:` label; no `pg_proc` freeze-invariant assertion exists in
`002_definer_invariants.sql`; `070` still builds no `cancelled` and no
soft-deleted task. That is the round-16 defect checked for by name.

**4 · The cap.** `OPEN` **1 → 5 / 25**. The round closes below the cap.

**5 · Coverage, with `process.test.ts`'s own parser** (`statusOf` copied
exactly, `STATUS_IDX` from the header, `cell.replace(/\*\*/g,'').split(/[\s—(]/)[0]`):

| | Before (`34b5c78`) | After | Why |
|---|---|---|---|
| rows | 281 | **282** | `STP-04` opened |
| green | 258 | **258** | **unchanged** |
| review | 9 | **9** | unchanged |
| pending | 14 | **15** | `STP-04`, never green |
| `owed.md` OPEN | 1 / 25 | **5 / 25** | `OW-28`–`OW-31` |

**NOTHING TURNS GREEN BECAUSE A FINDING WAS DISPOSED.** The only row that moves
opens `pending`, and two green cells gain markers without moving: **STP-03**
(F-2's evidence correction and a pointer to `STP-04`) and nothing else. **No
row flips.** `pending` never counts as green.

---

## The burn-down quota, since this round breaks the plan's arithmetic

Slice 9's plan (Q7, SETTLED) expected to open **0** ledger rows and ruled the
quota *a ceiling on growth, not a floor on work*, satisfied by exhaustion. This
round opens **4**, so the expectation is wrong and is corrected here rather
than left to be discovered at the close-out.

It is not a violation. **The quota is a slice-level reading, and slice 9 still
ends at zero**: it opens 4 (`OW-28`–`OW-31`) and closes 5 (those four plus
`OW-27`, slice 8's), every one against a named unit inside slice 9 — three in
9A, one in 9B. `OPEN` goes 1 → 5 → **0** across the slice, so the ceiling on
growth is met and the floor is satisfied by exhaustion exactly as Q7 ruled.

**And a slice that commissions an adversarial pass and opens nothing has bought
nothing.** Q4's whole argument for round 31 was *one real defect per one
adversarial reading of this increment*. Four rows are the pass working.

---

## What is NOT claimed

No product evidence re-earned · no gate re-run (8A's `4d166c0` stands as
merged) · no code, migration, test or fixture written · no finding fixed ·
`FRZ-17` and `OW-27` untouched, they are 9A's · ADR-0043's rulings unmoved,
Q1–Q9 unmoved, `STP-03`'s status word unmoved · the migration bound unamended ·
G4/G7 block · G9 OPEN · G3 open · G12-01 `pending` at `gate` · LOG-03 never
green · SIG-01 not absorbed · PR #35 (ADR-0039) and PR #36 open, neither this
session's, and slice 9's ADRs still start at **0044**.

⏸ **STOP at the two artifacts.** 9A's build kickoff is its own fresh session.
