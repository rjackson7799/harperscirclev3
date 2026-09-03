# Build — slice 8, increment 8B (Search, the surface), round 29

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); ritual `docs/process/slice.md`; `slice` skill, leg
**build**. Only what is below is new. The contract is `docs/review/slice-8-plan.md`:
"What exists", "THE THINGS THAT MUST BE SETTLED" 1–6, "### 8B", *Owner decisions*.

## STATE — settled, do not redo

- Branch `slice/8b-search-app`: `git fetch`, create it from `origin/main` @
  **`189e06c`** — PR #40 (8A) merged 2026-09-03 (merge commit, parents `ccb4804`
  + `319a472`); CI green there. 76 migrations, 71 pgTAP files, 58 gate legs.
- **Round 28 did NOT run** — the owner merged 8A on its packet (the round-26
  shape). ADR-0040 stays `proposed`, unstamped; its Q-A…Q-G are the owner's, in
  a docs session; none touches search and **8B does not wait** (Q1). OPEN: PR #35
  (claims ADR-0039), PR #36. Next free ADR **0041** (0042 if round 28 takes it).
- Tier **T2** (Q1): the Tier-2 collapse — ONE deltas doc, ONE review session
  (round 29) attacking the three places named below; the gate runs (person-facing).
- Bounds: migrations **2 of ≤ 4** spent · M3 reserved for round-28 dispositions
  · **M4 NAMED: a search index ONLY on a MEASURED PRF-06 breach at the 8B head,
  numbers pasted into the red commit; else UNCONSUMED.** No other DDL exists for
  8B. Dependencies **0 runtime** (reserve UNSPENT). `lib/ai/` untouched.
- Evidence at `4d166c0` (main's code): reset exact **76** · pgTAP **71, Σ 1,863**
  · concurrency **83/83** · gate **58/58** (1,284 s) · vitest **1439/101 by run**
  · `db:verify` clean · upgrade leg green. Coverage 280 · green 252 · review 9
  · pending 19 (SRCH-03..06, A11Y-12 among them). `docs/owed.md` **0 OPEN**.
- NOT activated: G4/G7 block · G9 OPEN · G3 open · band allowlist EMPTY ·
  SIG-01 NOT absorbed · G12-01 pending at `gate`.

## THE TASK

Commit this kickoff as `docs/review/8b-build-kickoff.md`. Then the plan's
"### 8B" five units verbatim, **the module and the leak leg FIRST**:

1. **`lib/hc/search.ts`** — three reads, ONE `withRequestRole`, `limit 20` each,
   `circle_id` explicit; documents = the §7.2 query with explicit `StartSel`/
   `StopSel` sentinels that cannot occur in document text (Q4(1)), nothing else
   changed; tasks and timeline single-vector; rows carry kind, id, subject id,
   category, rank, the SPLIT snippet parts. **No total, no parameter for one.**
2. **`components/shell/SearchField.tsx`** — a GET form to `/[circle]/search` in
   `TopBar`'s slot; the placeholder from the WIDENED `myMembership` query (Q4(2),
   never a second call; `Search the record` on failure); the hint verbatim; no
   autocomplete attribute, no suggestion list, no client fetch — asserted as
   absences. NOT in `NAV_MANIFEST` (§6): it renders for every member.
3. **`app/(app)/[circle]/search/page.tsx`** inside `withPageBudget`; `q` capped
   at ingress, refused with the empty copy, never an error (Q4(4)); grouped by
   kind, **labelled by subject**, each result a link; 20 per kind, an empty group
   renders nothing; `<mark>` built by React, `dangerouslySetInnerHTML` nowhere,
   fence-tested. In `page-gate.test.ts` both ways, `RECORD_SURFACES`, the manifest.
4. **`e2e/search.spec.ts`** — the leak leg first (`summary` + body-only term =
   the same rendered SHAPE as a term present nowhere); `view` gets the snippet
   and the OCR hit; the caregiver gets her assigned tasks and nothing else
   (AC-TASK-5); a share widens the one object and nothing derived; the empty
   copy; A11Y-12 at 390 px and keyboard. Per-file budget; never `workers: 1`.
5. **The measurement**: a page p95 at the 8B head against PRD §13.2 and the
   `prf06.mjs` legs re-run on the 8B fixture — **a number in the deltas doc**; a
   breach is M4's condition and nothing else is.

Exit: closure at ONE head (T2: vitest exact · the gate, its new total stated
exactly · lint/typecheck/build · gitleaks; DB legs only if M4 is consumed) ·
SRCH-03..06 and A11Y-12 flipped on legs inside the COMPLETE run, never early ·
the deltas ADR (`Status: proposed`) · PR `[DO NOT MERGE without owner sign-off]`.
The TSD §7.2 erratum lands at round-29 sign-off (consequence 4), not here.

## WHERE TO PUSH HARDEST

1. **Leakproof, from a LIVE context**: one RLS-true read per relation, no second
   path; body-only-at-`summary` and nothing are the same rendered tree; the
   care ceiling and the one-object share hold in search.
2. **Structure, never markup**: sentinels split in the module, emphasis built
   by React, the fence scanner; `ocr_text` at weight D never outranks a title.
3. **Absences over the rendered tree**: no total, no withheld count, no
   autocomplete, no spelling correction, no prose answer, no composition; no
   `hc.log()` call and no event type (Q4(3)).

## SLICE-SPECIFIC TRAPS

- `RECORD_SURFACES` is an EXACT set (7E) and `audit-manifest.test.ts` derives
  routes from the filesystem: the new page fails vitest until it is a decision.
- `q` has no body to bound — cap its length; `websearch_to_tsquery` never raises.
- The gate completed at 241 MiB free at 8A; 1.2 GiB is still the documented
  floor; `NODE_OPTIONS=--max-old-space-size=1536`; `hc_clamd` is UP — check
  `docker stats` first. New legs join 58; state the total exactly.

## ⏸ AT THE GATE, STOP

Next leg: **round 29** (Tier 2 — one review session, the three places above),
the dispositions table, owner sign-off, merge commit never squash. 8C
(`slice/8c-claim-log-app`) may run in parallel from `189e06c`. **STOP at the gate.**
