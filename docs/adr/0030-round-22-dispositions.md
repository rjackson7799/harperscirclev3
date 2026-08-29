# ADR-0030 — round-22 dispositions: the two rows slice-6B's own fixes made stale

**Status: RULED — OWNER SIGN-OFF 2026-08-28. All three ballot items
RATIFIED AS PUT.**

The verdicts have moved. **Two rows** in ADR-0023 D17 were rewritten in the
commit that stamps this line — R4/F-12 and R7/F-4, both `OWED` → `FIXED` —
each carrying a pointer back here, the ADR-0025 D6 precedent.

The post-ruling tally was **re-derived from the rewritten table**, not
asserted from D4:

> 61 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 6 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

with the residue exactly **R2/F-2 · R2/F-3 · R2/F-4 · R2/F-6 · R2/F-12 ·
R7/F-5** — the 5 distinct items of Step 4, and nothing else. D4's
self-check is satisfied by measurement rather than by intent.

**D17 and the tree now agree.** Every row the tree has fixed reads FIXED,
and every row reading OWED names work that is genuinely outstanding.

**AMENDED (round-23 follow-up, 2026-08-28).** The sentence above was true at `cfaa7d8` and false from `3c39e23` (PR #19, the same day) until ADR-0031's sign-off at `7b203b2`, when it became true again — with an `OWED` class of zero. Recorded so the next reader does not take it as standing for longer than it stood. The prose above is preserved exactly as written.

*(The line below is the ballot as it was PUT, preserved unaltered.)*

~~**Status: PUT, NOT RULED.**~~ Proposed on evidence, awaiting owner sign-off.
**No verdict in ADR-0023 D17 has moved.** They move in a second commit,
after sign-off, each carrying a pointer back here — the ADR-0025 D6
precedent, as round 21 did.

**Head:** `main` = `8dd982a`. **Branch:** `docs/round-22-dispositions`.

---

## Context — a two-row round, opened deliberately and early

Round 21 ruled 31 stale `OWED` rows and left the queue at 8. Within the
hour, two of those 8 were fixed and merged:

| Row | Fixed by | Merged |
|---|---|---|
| **R4/F-12** | the `profile_fact` NOT NULL guard | `d72b90a` (PR #15) |
| **R7/F-4** | the email citation geometry | `8dd982a` (PR #16) |

Both were build sessions. Neither moved a verdict, correctly — ADR-0025 D6
reserves that for a round. So D17 now asserts `OWED` for two rows the tree
has fixed.

**This round exists because that is exactly how the last backlog started.**
D24's tally went stale one commit after it was written and sat for four
rounds; the 31 rows ruled at round 21 went stale across a whole slice. In
both cases nothing was wrong with the work — what was missing was a round
close enough behind it to rule. Two rows is small enough that batching it
into a later round would be defensible and cheap. It is being taken now
anyway, while the evidence is one `git show` away, because "we will fold
it into the next one" is the first move of every drift this project has
had to unwind.

There is also a practical reason. The next session works Step 4 against
D17. It should open on a table that agrees with the tree, not one it has
to reason around.

---

## D1 — how the re-verification was done

The same discipline as round 21: **the property each finding asserts, at
its site, in the code — never the commit message claiming a fix.** A merged
PR is not evidence that a defect is gone; it is evidence that someone said
so.

**Not taken: the browser gate.** Both changes carried a 38/38 gate before
merge, and CI is green on `8dd982a` including the full DB leg set. Nothing
here changes code, so there is nothing new to gate.

---

## D2 — R4/F-12: a `profile_fact` cannot reach approval with a NULL required column

**The property:** a `profile_fact` proposal whose `field` or `value` is
null must be dropped before it is drafted, because
`public.profile_facts` declares both `NOT NULL` and `hc.approve_proposal`
would otherwise raise a raw `23502` in front of a person.

**Verified at `main`:**

- `lib/ai/interpret.ts:148-150` — `field` and `value` are read *before* the
  guard, and the guard reads
  `(!domain || !DOMAINS.has(domain) || !field || !value)`.
- `supabase/migrations/20260815230002_record_tables.sql:204-205` — the
  columns it protects: `field text not null`, `value jsonb not null`.
- The refusal is a **counted drop**, matching the `domain` guard beside it:
  one malformed proposal does not cost the whole publication.
- `scripts/ai-fixture-server.mjs:222` — `HC-FIXTURE-NULLFIELD` drives it,
  with a deliberately VALID domain so the proposal clears the older guard
  and lands on this one.
- `tests/ai/adapter.test.ts` — the leg exists and was proven red before
  green; the `domain` guard, previously untested, is now covered too.

**Recorded: the fix exceeds the row.** R4/F-12 names `field`. `value`
carries the identical defect to the identical place, and the owner ruled
the class rather than the instance on 2026-08-27. Ruling this row FIXED
therefore ratifies slightly more than the row asked for, and says so.

**PROPOSED: `OWED` → `FIXED`.**

---

## D3 — R7/F-4: email labels are the band the renderer paints

**The property:** an email label's geometry must be the region §6.3
actually paints, so that citation accuracy measures a reader rather than a
convention.

**Verified at `main`, by measurement:**

- **23 of 23** email labels equal `emailLineBand(i)` computed from the
  renderer's own constants (1212 × 1568, margin 96, line box 40).
  Before the fix: **0 of 23** landed.
- The discarded full-bleed form (`x = 0`, `w = 1`) appears on **no** email
  label.
- `lib/pipeline/render.ts:550-574` exports `EMAIL_LAYOUT`,
  `emailLineBand` and `emailWrappedLines`; `tests/eval/corpus.test.ts:493`
  recomputes every label **from those exports**, locating each value by the
  rendition's own wrapping. The corpus builder restates the layout because
  it cannot import TS behind `server-only` — that leg is what stops the
  restatement drifting.
- CI green on `8dd982a` runs that leg with real wrapping, which is the
  check this session's arithmetic cannot make on its own.

**What this does NOT do, restated so the row is not over-read:** it removes
an arithmetic ceiling. Three banded fields could not reach
`CITATION_FLOOR` for any reader; now every field ceilings at 1.0. **Nothing
is signed. G9 stays OPEN**, and a blind run remains an unauthorised spend.

**PROPOSED: `OWED` → `FIXED`.**

---

## D4 — the tally, re-derived

Counted by row over D17's Verdict column at a named head, with the parser
validated against ADR-0023 D25's published tally before it is trusted —
the instrument that failed on its first pass at round 21.

**At `8dd982a`, before this round:**

> 59 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 8 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

**After the rulings in D2 and D3:**

> 61 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 6 OWED · 3 OWNER · 2 ACCEPTED ·
> 1 DECLINED-and-ACCEPTED = **113**

**Self-check:** the 6 residual `OWED` rows must be exactly

> R2/F-2 · R2/F-3 · R2/F-4 · R2/F-6 · R2/F-12 · R7/F-5

— **5 distinct items** once R2/F-6 = R7/F-5 collapses, all adapter- or
harness-layer, none member-facing, none needing DDL. That is Step 4's
entire scope.

---

## D5 — what does NOT move

No coverage row flips (ADR-0025 S16.7) · no `pending` row moves · **NO
DDL**, migrations 69 exact, budget 7 of ≤ 7 SPENT · G4 and G7 block · **G9
OPEN** · `BAND_ARTIFACT_ALLOWLIST` EMPTY · RCP-02 pending tagged 7 ·
SIG-01 NOT absorbed · no real family data · **NOTHING IS
PRODUCTION-ACTIVATED.**

---

## D6 — the ballot

1. **R4/F-12 `OWED` → `FIXED`** (D2), noting the fix covers `value` as well
   as the `field` the row names.
2. **R7/F-4 `OWED` → `FIXED`** (D3), noting it lifts a ceiling and signs
   nothing.
3. **The re-derived tally** (D4) as the record's new arithmetic.

On sign-off a second commit moves both D17 verdicts, each carrying a
pointer here. If either is not accepted it stays `OWED` and D4 is
re-derived rather than adjusted.
