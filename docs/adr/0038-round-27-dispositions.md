# ADR-0038 — round-27 dispositions: the 42 rows ruled, and the six questions PUT

**Status: PUT, NOT RULED.** Awaiting owner sign-off. **No verdict has moved** —
`docs/coverage.md`, `docs/owed.md`, ADR-0037 and the PRD are untouched; no code,
test, leg or manifest is changed. Verdicts move in a second commit after
sign-off, each pointing back here (ADR-0025 D6, as rounds 21–25 did). **Head:**
`slice/7c-sensitive-pair` @ `7e28e32`; evidence head **`ccd854b`**; base
`origin/main` @ `18c362d`; PR **#34** open, `[DO NOT MERGE without owner
sign-off]`.

**This ADR holds only what a future session must obey.** The 42 verdicts with
their arguments, the re-verification record, the questions' reasoning, the exact
coverage-cell text and the ledger rows are
`docs/review/round-27-dispositions.md`; the findings, verbatim, are
`docs/review/round-27-findings.md` — **16 MAJOR / 21 MINOR / 5 OBS, 0 BLOCKER**,
none needing DDL.

## D1 — the pointed questions, ruled (Q-F is D2)

- **Q-A — RATIFY, conditioned.** A document share reaches the ROW, not the
  arrival's bytes or facts: the §4.3.5 reading for Phase 1, noted beside
  AC-DOC-5. **Conditions:** (1) R2/F-7's pins land — the nearest existing pin is
  a `summary` member *by grant*, whom rung 5 never lifts, so it does not
  discriminate; (2) D12.1's enumeration is amended to *"title, category, dates,
  the sentences, and who approved it and when"*. Share-includes-bytes stays
  slice-8 DDL.
- **Q-B — FIX FIRST, then ACCEPT the narrowed claim.** The policy half is
  ratified: no episode page exists and RCP-02 does not owe one. But the link drops
  the `subjectId` `receiptLine` was widened in this diff to carry, landing a
  multi-subject circle on the founding subject's thread. Land the two-line fix,
  then accept with mechanisms 2–3 (dispositions §6) named in RCP-02.
- **Q-C — RATIFY.** The ADR binds; a one-line PRD erratum at sign-off; no code
  change.
- **Q-D — RATIFY, with R5/F-2 folded in.** Accept the dev/prod cache-control
  split as PPL-03's cell states it; the hosted-runtime question rides OW-09.
  `proxy.ts:30` returns before the stamp at `:67` when the Supabase env vars are
  unset, and no gate run can reach it: one line, fixed in 7D, named in the cell.
- **Q-E — RATIFY, with OW-25's condition WIDENED.** The teed log and tally stand
  as the r5 record. The item must cover **trace retention on green runs**, not
  only the reporter and JSON path: `trace: 'retain-on-failure'` means a
  config-borne green run keeps no per-test traces by design, so a reporter-only
  condition reintroduces this round's gap at the next green.
- **The packet's open re-rule — RATIFIED.** `db:verify` and the upgrade leg stay
  NOT RUN at `ccd854b`: both exercise DDL, 7C ships none, `supabase/` and
  `scripts/` are byte-identical to base by measured tree hash, and the clean-leg
  reset at exact 74 with pgTAP on it is the migration-state evidence.

## D2 — Q-F / UXA-04: the read is complete; the flip is conditioned and is NOT here

The copy is faithful to the PRD's words at every enumerated home (dispositions
§6). **The row does not flip at this head.** Its condition is R4/F-3 item 1 — the
log's *"Everything done with the record … it prints exactly the entries below"*
over an undisclosed 300-row cap — and discharging it is a copy change in `app/`,
which moves the evidence head and costs the gate (D5). UXA-04 stays `pending`,
its cell recording the read and naming the condition; the flip takes effect at
the head where the disclosure lands green. **`pending` never counts as green**,
and a conditioned flip written as a flip is how that rule gets lost. Read items
2–4 are observations, not work.

## D3 — the ledger: no row reopened, no row rewritten

**OW-07 and OW-19 stand `CLOSED(f1cfc33)`.** Read against their own acceptance
conditions rather than the packet's prose, both are CONFIRMED by R5 itself, and
R5/F-1's ingress read is a **sixth** hop neither row named. What is falsified is
*evidence text* — OW-19's *"with every hop raced"*, and DOC-05's identical words
— amended by a struck-and-preserved marker, never a rewrite (ADR-0025 D6).

Three rows in, none out: **OW-24** (the ingress read's time bound,
`TAKEN(7C/7D)`); **OW-25** (Q-E's item, `TAKEN(7C/7E)`, so the closure gate's own
record is config-borne); **OW-26** (the log's cursor — R4/F-3's remedy (a), not
producible here, `OPEN`, home slice 8). **OPEN 6 → 7 / 25**; burn-down holds —
slice 7 opens 3 against 13 closed, requirement 8. **R3/F-6 and R6/F-5 are ruled
FIXED-IN-INCREMENT, not owed**: a ledger row for a one-line scanner edit, or for
three unaudited pages while C6 binds, is the loophole the cap closes. **OW-05
stays `TAKEN`**, recurring; R6 audited 12 legs against a quota of 8.

## D4 — coverage: eight rows to `review`, five narrowed, one unchanged

`green → review`: **RCP-02, DOC-01, DOC-03, DOC-05, PPL-01, PPL-04, A11Y-10,
A11Y-11** — each carries a clause with no assertion that can fail, or one the
tree falsifies. `green`, narrowed: **DOC-02** (the fence proves the tree at this
head, not the property its titles claim), **LOG-01** and **LOG-02** (green on
their pgTAP layer; the 7C app-half addenda struck back), **PPL-03** (extended
with R5/F-2). **UXA-04** stays `pending` per D2. Exact text: dispositions §4;
every row is restored, in the words the fix earns, at the fix increment's
close-out. Two corrections to the findings doc's own list of touched rows:
**DOC-02 is touched** where the doc lists it untouched (R1/F-1/F-2/F-3/F-5 land
on the fence claims its cell quotes), and **DOC-01 is not "title only"** —
R2/F-5 falsifies its *Nothing filed yet.* clause.

## D5 — the cost, and the order: 7E then 7D, one gate at the final head

**The tier does not move.** 7C is Tier 1 and a tier is never lowered mid-slice.
The split rule forbids one increment holding both a T1 and a T3 unit, so the work
is two: **7E — Tier 3**, the slice's batched leg-and-scanner pass, test/leg/
manifest/pin work only (18 rows); **7D — Tier 1**, the product surfaces (23 rows,
22 distinct fixes). **Fail closed:** any item whose tier must be argued sits in
7D until the owner rules it down, on the record, before a line is written.

**Both cost the gate.** Every accepted fix touches `app/ lib/ components/ e2e/
tests/` — including R4/F-7's comment-only edit, which is the cost rule working as
designed — so the evidence head moves past `ccd854b` and the browser gate is
unconditional (ADR-0033 D19.14): red→green per unit with the signature in every
red, **one complete gate run at the FINAL head** (not one per increment),
`--trace=on` never `--trace on`, through preflight, exit 5 once after a commit
acknowledged and re-run. Only docs-only verdicts cost nothing — cell rewrites,
ADR-0037 amendments, the PRD erratum, the ledger rows.

**7E runs first**, so 7D's fixes land under legs that can fail; expect real reds
there, handled in-increment — **unless one needs DDL, at which point it stops and
goes to the slice-8 plan gate.** **Recommended: PR #34 does not merge until both
increments land and that gate runs green** (dispositions §3 for the alternative,
not recommended).

## D6 — what does NOT move

**No DDL, and the bound does not move.** Migrations stay **NONE** (5 of ≤ 6);
**M6 closes UNCONSUMED**. Three items need DDL and are **named and stopped** for
the slice-8 plan gate, uncosted here: `hc.shares_for` carrying the assignment
task's live status (R2/F-4's wider form — the honest surface does not need it); a
level-bound step-up `target_ref`, since `hc.set_grant` computes it (R3's dissent
1); share-includes-bytes, if Q-A is ruled the other way. `PROMPT_VERSION` unmoved
· dependencies 0 · G4/G7 still block · nothing production-activated.

## D7 — the tally, derived by command

> **42 rows · ACCEPTED 40 · ACCEPTED-NOTE 1 · NOTED 1 · FIXED 0 · OWED 0 ·
> DECLINED 0 · OWNER 0.** By home: **7D 23 · 7E 17 · 7E+docs 1 · docs 1.**
> Severity, unrestated: **MAJOR 16 · MINOR 21 · OBS 5.**

Counted by the commands in dispositions §2, reconciled three ways — verdicts
against the prose above, severities against the findings doc's headings, the
ledger against the cap. **No row is `FIXED`**: a pre-merge round proposes
verdicts, not completions. Two remedies are **DECLINED in part** (R1/F-4, R2/F-2).

## D8 — the ballot

1. **Q-A RATIFIED**, on R2/F-7's pins and D12.1's amended enumeration.
2. **Q-B: fix first, then ACCEPT the narrowed claim**, mechanisms 2–3 in RCP-02.
3. **Q-C RATIFIED**; the PRD erratum lands at sign-off.
4. **Q-D RATIFIED**, R5/F-2 folded into PPL-03 and fixed in 7D.
5. **Q-E RATIFIED**, OW-25 opened with the trace condition widened.
6. **Q-F: the read is complete; UXA-04 stays `pending`.**
7. **The db:verify / upgrade-leg NOT-RUN re-rule RATIFIED.**
8. **The 42 verdicts as dispositions §2 proposes** (40/1/1/0 FIXED).
9. **The ledger as D3 rules it**; **10.** the coverage as D4 lists it.
11. **Two increments, 7E then 7D, one gate at the final head; PR #34 held.**

Any item not accepted is struck here rather than silently dropped, and D5's scope re-derived.
