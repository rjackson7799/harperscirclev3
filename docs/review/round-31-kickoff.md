# Round 31 — the commissioned adversarial pass over 8A's M1 and M2.

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**review** — read `references/review-brief.md`, write the shape in
`references/findings.md`. Only what is below is new. Commit this brief as
`docs/review/round-31-kickoff.md` FIRST.

## STATE — settled, do not redo

- **PR #45's merge IS the entry condition — VERIFY, never assume** (a first
  attempt stopped dead here: the brief asserted the merge, `gh pr view 45`
  said `OPEN`). Branch from `origin/main` after a fetch: **`review/round-31`**.
  **Confirm `main`'s tip is a merge commit whose second parent is `77e3135`
  before writing a line** — if not, STOP: this leg has no entry condition.
- **Slice 9 is RULED.** `docs/review/slice-9-plan.md` reads `PLANNED — RULED`;
  **Q1–Q9 SETTLED 2026-09-03, nine as put, zero departures.** **Q4 is what
  commissions this pass** — read the plan's *Owner decisions* Q4 and its
  "The commissioned adversarial pass" section. **Do not re-argue either.**
- **You are round 31, and you review NOTHING of slice 9.** Your target is
  **8A's M1 and M2 as merged**, byte-identical at `7cf16ec` and at your head:
  `supabase/migrations/20260903120001_task_claim.sql` (M1) ·
  `20260903120002_step_up_level_binding.sql` (M2) ·
  `supabase/tests/070_task_claim.sql` · `071_step_up_level.sql` ·
  `docs/adr/0040-8a-claim-db-deltas.md`.
- **Why this round exists, in one line:** ADR-0040 was stamped from its own
  author's recommended answers, so a Tier-1 increment was reviewed by nobody.
  ADR-0043 D6 filed that as a dissent; Q4 ruled it IN rather than carried.
- Ledgers, NOT this session's and not to be touched: coverage **281 · green
  258 · review 9 · pending 14**; owed **OPEN 1 / 25** (OW-27).
- Bound **≤ 4**, now in force: M1 planned (the FRZ-17 freeze guard — **9A's,
  not yours**) · **M2 reserved and NAMED for a DDL fix arising from THIS
  pass** · M3 dispositions · M4 conditional. Migrations **76**, pgTAP **71**.
  Next free ADR **0044** (`0039` claimed by unmerged PR #35).
- NOT activated: G4/G7 block · G9 OPEN · G3 open · SIG-01 NOT absorbed ·
  G12-01 `pending` at `gate` · LOG-03 never green. PRs #35 and #36 open,
  neither this session's.

## THE TASK — findings, VERBATIM. Fix nothing.

Produce `docs/review/round-31-findings.md`, **landed verbatim before anything
is argued**, then ⏸ STOP. Dispositions are their own leg (**ADR-0044**, Tier
1's form) and 9A's build is a third. **This session applies no fix, moves no
coverage row, moves no ledger row, and edits no migration** — shipped
migrations are never edited; recovery is forward-fix.

Tier 1's requirement is **3–8 lenses, each distinct, at least one from a
different model family than the author.** Its going unmet is the entire reason
this round was commissioned. **Name each lens and say what it was pointed at.**

**If a finding needs DDL, say so and stop** (ritual §4 item 7). The slot is
already reserved and NAMED — **M2** — so saying it costs the slice nothing.
What costs is a DDL finding arriving *after* 9A has replaced `hc.claim_task`.

## WHERE TO PUSH HARDEST

1. **M2, hardest of all.** It is a `create or replace` over **`hc.set_grant`**
   (`20260903120002_step_up_level_binding.sql:57`) that **REPLACED A SHIPPED
   COMPOSITION**; it is **auth**, Tier 1's own trigger category; and its only
   reader has ever been its author. The four-part step-up binding is the
   specific thing nobody outside that author has read.
2. **M1's neighbourhood already yielded one defect.** A single sitting over
   8A's SQL produced FRZ-17 — a MAJOR that four merged rounds, a green 66/66
   gate, 71 pgTAP files and 1,863 assertions did not see. **FRZ-17 itself is
   already ruled and is 9A's M1: restating it is NOT a finding.** Ask what
   ELSE the same reasoning error reached. The error is the header comment
   *"the freeze is rung 2 and needs no name of its own"*, not the line it
   produced.
3. **The pgTAP pair is a subject, not an instrument.** `070` and `071` are
   what you review, not what you trust: a case passing while asserting less
   than its name claims is the round-18 class, and no other round sees these.

## TRAPS

- **This kickoff is capped at 90 lines.** Stage EXPLICIT paths, never
  `git add -A` — untracked peer files sit in the shared tree.
- **Drive the WRITE paths with ZERO writes and no `db:reset`:**
  `supabase/tests/064_round17_dispositions.sql`'s `pg_temp` helper pattern
  inside `begin … rollback`, with **the CONTROL in the same transaction** —
  that is what makes a result a defect rather than a guess. Never read fixture
  ids back through RLS as the probed user, and assert privilege closure **from
  the catalog, never by calling as a denied role** (the PG17 segfault).

## ⏸ AT THE FINDINGS FILE, STOP

Fix nothing, argue nothing, merge nothing. **Then, each in its OWN fresh
session:** round 31's dispositions (ADR-0044) → **9A's build kickoff**
(`slice/9-freeze-guard`; the docs-only ledger + coverage commit FIRST, then M1
red→green) → **9B's**.
