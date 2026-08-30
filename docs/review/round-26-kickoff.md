# Round 26 — the 7B review (Tasks + Timeline, the record app increment)

Tier **T2** (plan Q3, ruled): **one reviewer session**, findings landed
VERBATIM in `docs/review/round-26-findings.md` before a word is argued, then
**one dispositions TABLE** (`docs/review/round-26-dispositions.md`), owner
sign-off, owner merge (`--no-ff`, never squash). Traps and authority order
are auto-loaded; the ritual is `docs/process/slice.md`. A settled ruling is a
dissent, not a finding. `pending` never counts as green.

## What you are reviewing

- Branch `slice/7b-record-app`, head `716cd49` — evidence at that ONE head
  in ADR-0035's evidence block and the checked-in PR body
  (`docs/review/round-26-pr-body.md`); the PR is the one opened from this
  branch, `[DO NOT MERGE without owner sign-off]` in its title.
- The record: `docs/adr/0035-7b-record-app-deltas.md` is the deltas doc AND
  the collapsed packet — commits red→green with signatures, ten decisions,
  seven pointed questions (Q-A…Q-G) with recommended answers. An unanswered
  pointed question defaults to NOT PLANNED (ADR-0006).
- Coverage flips at this round: TSK-03/04, TLN-01/02/03, GTE-01, A11Y-09,
  NAV-01's 7B half, and the app halves of TSK-01/02 and SHR-02. RCP-02 stays
  pending (7C). `docs/owed.md`: nine rows flipped `CLOSED(sha)` by the build.
- NOT in scope: `supabase/` (unmoved; M6 closed UNCONSUMED), `lib/ai/`
  (untouched; `PROMPT_VERSION` hc-6b-3), G4/G7/G9/G3 (all stand).

## The three places the build names against itself — attack these first

1. **The gate's third outcome (B1; ADR-0035 D1/D2/D3).** `liveSessionClaims`
   is deleted; pages render `unavailable`, routes and `proxy.ts` answer 503;
   `/confirm` classifies faults. The 503 for a PAGE comes from the proxy, and
   the page's own residual renders at 200 — is that split honest, and is
   GTE-01's "app + e2e" satisfied by a unit table plus the proxy running
   under the 45-leg gate (Q-A)? The classifier (`session-outcome.ts`) is now
   load-bearing in two runtimes — read it against supabase-js's error taxonomy.
2. **The point of selection (B2; D7).** `lib/hc/tasks#selectionFor`
   re-derives `hc.assign_task`'s gate (D19.7 + the ladder) in TypeScript over
   `hc.circle_people` levels. The live test drives both directions once each
   way — find the input where the two arithmetics disagree (unresolved
   lineage, empty taint, a subject-member row, a removed member, levels the
   caller is not given).
3. **What the Timeline infers (B3; D4/D5).** A manual event is detected as
   *proposal present, arrival absent* (approve_proposal writes
   `source_arrival_id = null` for manual payloads), and the creation entry is
   visible only at `log`×5 on its subject (the declaration carries a
   `subject_id`, contrary to the M9 header's comment). Both are inferences
   from DB behaviour the DB does not name — check them against the
   migrations, not against this branch's own tests.

## Where else a defect would hide

- The crossing screen's step-up: the `hc-step-up` cookie's first consumer —
  scope, clearing, the `task:<id>+document:<id>` binding, a stale cookie.
- Counts post-filter: the chip count vs the rendered tree under every
  filter × subject combination; the Done section's exclusion from counts.
- The row boundary (OW-02) and the widened timestamp scanner (OW-17): find a
  spelling that still crosses; `due_on`'s `::text` casts in SQL.
- The record legs' fixture concessions (replica-role arrivals/tasks) — argued
  in-file; check nothing they bypass is what the leg claims to prove.
- The 300 s per-leg budget on `e2e/record.spec.ts` (Q-G) and the a11y legs'
  fixtured rows — is anything passing only because of its fixture?

## Mechanics

- Findings file: severity BLOCKER/MAJOR/MODERATE/MINOR/LOW/OBS, one row per
  finding, file:line at the head you read (cite e2e legs BY TITLE).
- You are read-only: no fixes, no reruns to green; a product failure is a
  finding. Verify counts by running vitest/pgTAP if you wish — never
  `db:reset`/`test:e2e` without the preflight scripts (a peer session may
  hold the stack).
- The dispositions table (T2): one row per finding — FIXED(sha) / OWED(ledger
  row) / KILLED(reason) / NOTED — plus the seven Q answers, then the owner
  ballot.

**STOP after the dispositions table and the ballot: owner sign-off and the
merge are the owner's.**
