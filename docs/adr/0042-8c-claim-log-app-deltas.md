# ADR-0042 — Slice 8C: Claim's surface, and the access log's cursor — deltas as built, and the round-30 packet

**Status:** **`accepted` — 2026-09-03.** Stamped at slice 8's close-out
(ADR-0043 D1), which ruled Q-A…Q-G in `docs/review/slice-8-dispositions.md`.
**Q-F ⚠ DEPARTS into a row**: the FRZ-13 carve-out is ruled **read-only by
intent**, so a claim through it is a defect and not an allowance — carried by
**FRZ-17** (`pending`, never green) and **OW-27** (`OPEN`), with a NAMED
M-slot for slice 9's bound; the close-out also narrows Q-F's own adjacent
worry — `complete_task`, `snooze_task` and `assign_task` are **not** exposed,
because each raises `freeze_active` before it reaches its level test, so
`hc.claim_task` is the only task-family write definer the carve-out reaches
(ADR-0043 D2). **Q-G ⚠ DEPARTS in method**: leg-audit F3's narrowing is ruled
into SRCH-04's cell and the leg title is left standing, a code change being
out of a docs-only session's reach (ADR-0043 D4). **`accepted` records that
the questions were RULED, not that round 30 was held — it was NOT** (ADR-0043
D6). Ruled by the close-out session on the owner's standing instruction in
`docs/review/slice-8-closeout-kickoff.md`; ratified by the owner at the
close-out merge. *Originally, and unchanged beneath this stamp:* the 8C build
record, put to round 30 (**Tier 2**, ruled
at the plan gate, Q1: this one document plus one dispositions table, one
reviewer session attacking the three places named below).
**Branch:** `slice/8c-claim-log-app`, from `origin/main` @ `d9b96ef` (PR #41,
8B, merged 2026-09-03 — round 29 did NOT run, as round 28 did not before it;
**ADR-0040 and ADR-0041 are both `proposed` and unstamped, with Q-A…Q-G open
in each**). Unit 1 is built to ADR-0040's RECOMMENDED answers where they bear
on it — Q-A, Q-B, Q-C and Q-G — and says so at each site; the rulings stay the
owner's, and slice 8's close-out must stamp both ADRs.
**Date:** 2026-09-03. **Evidence head:** `2f2c509` — every commit past it
docs-only (`git diff --name-only 2f2c509..HEAD -- . ':(exclude)docs'` empty).
**Scope:** the plan's "### 8C" three units verbatim, the claim route and its
leg FIRST. **Migrations: NONE — 2 of ≤ 4 stands.** M3 was reserved for
round-28 dispositions, which have not happened; M4 closed UNCONSUMED at 8B.
`supabase/` untouched. **Dependencies: 0 runtime, 0 dev** (the reserve
UNSPENT). `lib/ai/` untouched; `PROMPT_VERSION` does not move. Nothing is
production-activated.
**Authority:** the plan (the "### 8C" units; Q1, Q3(b), Q5, Q6) → PRD §4.5.1,
§4.6.5, §7.4, §7.5 → TSD §7.4 → ADR-0040 D1–D4 (the definer 8C is a surface
for) → ADR-0038 D3 (R4/F-3 remedy (a), owed as OW-26) → ADR-0033 D19 /
ADR-0028 D15 → `docs/coverage.md`.

---

## The commits (red → green per unit, the signature in every red)

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| the kickoff (docs-only, FIRST) | — | `a476858` | 90 lines by the process test's split, at the cap |
| U1 the claim — surface, route, log sentence | `d513a9b` | `d2d08f3` | 4 files failed / 6 tests. `No "mayClaim" export is defined on the "@/lib/hc/tasks" mock` (whole file); `entries with no gated file behind them: /[circle]/tasks/[task]/claim/submit`; `Cannot find package '…/claim/submit/route'` ×2; `scanned surfaces vs the pinned set: expected [ …(22) ] to deeply equal [ …(23) ]`; and ×2 `expected '<strong>Marisol</strong> · task claim…' to contain 'took an unassigned task'`, received **`Marisol · task claimed · Marisol · Nell · September 3`** |
| U2 OW-26, the log's cursor | `e2dbd4b` | `4b064bd` | 2 files failed / 16 tests. Live: **`Error: the walk did not terminate`** ×2, `expected false to be true`, `expected [ { seq: 328, …(12) }, …(49) ] to deeply equal []`; page: the read is `(claims, CIRCLE, 301)` with no fourth argument ×8, no pager href ×2, `the page must say something about itself: expected '' not to be ''`, `expected null not to be null` |
| U3 the batched Tier-3 pass | — | `d90cd51`, `878ebf2`; the leg fix `2f2c509` | a reading, not a test — and it found one (D11) |

**The two received lines above are the whole of what 8C is for.**
`Marisol · task claimed · Marisol` is ADR-0040 Q-G reproduced — the claimant
named twice, telling the reader neither that she took the task nor that it was
handed to her, which is the only distinction the event type exists to carry.
`the walk did not terminate` is R4/F-3: with no cursor every page returns the
same newest rows, so `seq` 1 is not on page two, it is unreachable.

---

## D1 — `can_view` is the DEFINER'S OWN expression, on the row RLS already returned

`TaskRow` gains `can_view`, computed in `TASK_SELECT` beside the `can_manage`
that was already there:

```sql
hc.visible_at(hc.ctx(), t.subject_id, t.taint, t.taint_resolved,
              'task', t.id, t.owner_member_id) >= 'view' as can_view
```

Same `ctx`, same taint, and **the owner as the row STANDS** — argument for
argument what `hc.claim_task` evaluates in-function. It is one more expression
in a query that was already running: **no second read, no second code path,
and no probe.** The surface and the database cannot hold different opinions
about who may claim, because they are asking the same question of the same
row in the same statement.

`tests/hc/tasks.test.ts` — *"can_view carries the definer's OWN floor onto the
row, and it is not can_manage"* — asserts `can_view` true and `can_manage`
false on the same row for Nadia, then claims successfully. `view`, not
`manage`, is the whole point of where 8A put the claim.

## D2 — `mayClaim` is the definer's gates in the definer's order, and NOTHING else — the freeze included, by not being there

```
me !== null · status === 'open' · written_from_task_id === null ·
owner_member_id === null · can_view
```

Five arms, each one of `hc.claim_task`'s own, and **no sixth**. A surface that
refuses MORE than the function does hides work a person is entitled to take,
and no test would ever see it — so the predicate is exported, driven as a
table (`tests/routes/task-claim.test.ts`), driven over the rendered tree, and
driven live against the definer's own verdict as an AGREEMENT in both
directions.

**The freeze needs no arm, and this is a correction to ADR-0040 D2's aside.**
D2 says the consequence is 8C's: *"the surface says a freeze from what it
already knows (`hc.circle_people` carries `frozen`)"*. Two things are off.
First, `hc.circle_people` does not carry a `frozen` column — it emits a NULL
`levels` map, outer for a circle-wide freeze and inner per frozen subject, and
a null is also *"not yours to know"*, so it discriminates only for the
caller's own row. Second and decisive: **a freeze is `hc.visible_at` rung 2,
which returns `hidden`**, so under a freeze `tasks_select` does not return the
task at all and there is no page on which to say anything. The freeze is
honoured — no control, because `can_view` is false — and it is never NAMED,
because the surface that would name it does not render. **No second read was
added to say a word that cannot be said.** *(Q-A below.)*

## D3 — the route reads NO form; the claim carries nothing else

`POST /[circle]/tasks/[task]/claim/submit` inside `withRouteBudget`, listed in
`RECORD_SURFACES` and driven by `page-gate.test.ts` (17 form routes now, was
16). It parses no body: `hc.claim_task` takes one argument and cannot name
anyone else, and a field here would be the beginning of the path ADR-0040 D3
pins shut by SET EQUALITY at the database. The unit test reads the rendered
form and asserts it contains no `<input>`, `<select>` or `<textarea>`; the
route test asserts `claimTask` is called with `(claims, taskId)` and nothing
more; the live test snapshots every share and every instruction row in the
circle before and after and asserts **set equality**, and the browser leg
re-reads both counts from the database rather than inferring them from the
screen.

## D4 — the refusal NAMES what the page can see; the generic sentence is the LAST arm

8A collapsed eleven refusals into one string so the refusal would not become
an oracle for the circle's state (ADR-0040 D2). The consequence for a surface
is not "say nothing useful" — it is **decide before rendering, and on the way
back read the row again**. The control renders only where `mayClaim` held, so
a refusal that arrives here is a RACE, and the page has just re-read the task:

| What the row now says | What the page says |
|---|---|
| owned by me | `That task is already yours.` |
| owned by someone else | `Ruth took that on first.` |
| `done` | `That task was marked done before you took it on.` |
| `cancelled` | `That task was closed before you took it on.` |
| none of these | `That couldn't be taken on just now. Please try again.` |

The generic sentence is the fifth arm, for a cause the surface genuinely
cannot know — not the first, and not the only. Success is `It's yours now.`

## D5 — `task_claimed` gets its sentence (ADR-0040 Q-G, answered by building it)

> **Marisol** took an unassigned task in Nell's record · 3 September

The claimant named ONCE, as the person who acted; no object named (the entry
carries no title and this page invents none, LOG-02); no pronoun. The leg
asserts a claim and a hand-over do not read the same, which is the distinction
`task_claimed` exists for (ADR-0040 D4).

## D6 — where the control renders, and why the list carries it on ONE filter

Task detail always, where `mayClaim`. The Tasks list on the **`Unassigned`**
filter only: that filter is the shelf of work nobody has taken, so taking work
is what it is for; `Mine`, `Overdue` and `All` send a person to the row's own
page. `mayClaim` still decides per row inside the filter — the filter says
"unassigned", the predicate says whether SHE may. Both surfaces post to the
same route and land on the task, which is where a person can see that it
became hers. *(Q-B below.)*

## D7 — the cursor, and the three properties that make a walk trustworthy

`accessLog(claims, circleId, limit, before?)` — `before` is a `seq` to read
strictly back from, applied INSIDE the policy-filtered read and never over it.

1. **`seq` is per-circle, gapless and UNIQUE** (`unique (circle_id, seq)`,
   `20260815200006`), so `seq < before` under `order by seq desc` is a total
   order: no tie to break, no row visited twice, none skipped.
2. **The cursor cannot widen what the policy narrowed.** The live leg walks
   the circle as the coordinator and asserts the walk EQUALS the single
   500-row read, ordered and duplicate-free; then walks it as the caregiver
   and asserts her result is a strict SUBSET still carrying no health
   `grant_changed` entry. LOG-01, held page by page at the app layer.
3. **A cursor past the end is the EMPTY page** — how a walk terminates rather
   than wrapping.

A non-`seq` cursor (NaN, negative, zero, float, `1e9999`, `12; drop table`) is
**no cursor at all** and yields the first page — never an error, never a 500.
Six spellings driven.

## D8 — four states, said in words, with NO count and NO total

The lead paragraph is `.log-disclosure` and has four states: the whole log /
the newest of several / the middle / the beginning. **"Everything done with
the record" is said only where it is true** — a single page with nothing
behind it.

**`The most recent 300` is gone.** The window size was worth saying while it
was a ceiling on what could be reached; it is now a page size, and saying it
would be quantifying the record for no purpose. §7.4 is asserted, not
asserted-about: what the page says about itself **contains no digit**, and the
whole page matches no `most recent 300|of \d|page \d|\d+ entries`.

**There is no "Newer" link, deliberately.** A backward cursor needs `seq > n`
read ascending and reversed — a second ordering to keep honest — to duplicate
what the browser's Back button already does exactly. The page offers the way
home instead, from any depth. *(Q-C below.)*

## D9 — the printed projection IS the page

`.log-pager` joins the print-hidden chrome: a printed link is a dead link.
`.log-disclosure` does not, so a printed copy of ANY page carries the sentence
saying which page it is. Both halves are asserted with their CONTROL first —
entries and disclosure visible on screen BEFORE print is emulated — because
`isVisible()` answers false for a non-existent element as readily as a hidden
one (R6/F-10).

## D10 — three of 7D's R4/F-3 legs are REPLACED, not extended, and that is the fix landing

This is the one place a reviewer should check that nothing was weakened.

| 7D asserted | Now | Why |
|---|---|---|
| *"Older entries … are not shown here yet"* | gone | It was true and is now FALSE: they are one page back. |
| *"the unqualified promise is withdrawn where it is false"* (of `prints exactly the entries below`) | the promise stands on every page | With a cursor each page prints its own set and the pages reach the whole log, so the sentence is true everywhere. |
| *"most recent 300"* | no digit at all | §7.4 forbids a count anywhere; the number stopped being a limit. |

**What R4/F-3 actually forbade is intact and asserted harder**: the surface
never claims to show more than it shows (the "Everything" sentence is now
gated on *one page with nothing behind it*, a stricter condition than 7D's),
and the disclosure still survives printing. The RED commit `e2dbd4b` carries
this table in prose so the change is legible in the history and not only here.

## D11 — the OW-05 pass, and the defect it found in 8C's own leg

`docs/review/8c-leg-audit.md`. Eight legs, the quota exactly, covering all
three increments: **8A contributed no e2e legs** (a migrations-and-pgTAP
increment — that zero is a fact, not an omission), 8B six, 8C two. The 8C pair
is audited by the increment that wrote them, per 7E's rule.

**Seven findings, no verdict moved.** One MINOR (F3: `search copy and bounds`
titles *"the four §4.7.3 strings verbatim"* and asserts three — ADR-0041
already DECLARED the narrowing, so what survives is a title contradicting the
ADR beneath it; round 30's to disposition, not a build session's to edit in a
merged increment's file). One DEFECT found and **fixed pre-gate** (`2f2c509`):
8C's own LOG-04 leg said *"each page prints itself"* and checked only the
landing page. Five observations, each naming where the other half of the claim
lives.

The record also carries a correction to itself: F3 was first written as a
finding against an undeclared gap, and reading ADR-0041's *"What is NOT
claimed"* corrected it. The correction is left visible.

## D12 — the gate, and the host

**66 legs in 9 files** (was 64; `record.spec` 5 → 6, `people.spec` 7 → 8),
confirmed by `playwright test --list` before the run. No new spec file, and no
new a11y row: Q5's citation shape puts the claim leg inside the two task
entries of `AUDIT_MANIFEST` — not in `RECORD_LEG`, which the timeline routes
share and which has no claim to make — and the submit route has no `page.tsx`,
so it never enters that pin at all.

Preflight reported **0.76 GiB free at the run**, below the 1.20 GiB floor the
58-leg gate finished with. The owner closed Chrome and ChatGPT before the run
on request; VS Code could not be closed because it hosts the session. The
outcome is recorded below exactly as the JSON reporter gives it.

---

## Evidence at ONE declared head — `2f2c509`

- **Head:** `2f2c509` on `slice/8c-claim-log-app`; every commit past it
  docs-only (verified with `git diff --name-only 2f2c509..HEAD -- .
  ':(exclude)docs'` — empty).
- **Tree binding** (`git diff --stat d9b96ef..2f2c509`): **17 files, +1,393 /
  −78** — `lib/hc/tasks.ts` (+80), `lib/hc/people.ts` (+31),
  `app/(app)/[circle]/tasks/[task]/claim/submit/route.ts` (44),
  `app/(app)/[circle]/tasks/[task]/page.tsx` (+51),
  `app/(app)/[circle]/tasks/page.tsx` (+15),
  `app/(app)/[circle]/people/log/page.tsx` (+120), `app/globals.css` (+16),
  `e2e/record.spec.ts` (+76), `e2e/people.spec.ts` (+100),
  `e2e/audit-manifest.ts` (+13), six test files, the kickoff.
  **Nothing under `supabase/` or `lib/ai/`.**
- **DB legs: NOT RUN — no DDL moved.** Reset exact 76 · pgTAP 71 files
  Σ 1,863 · concurrency 83/83 · `db:verify` clean stand at 8A's `4d166c0`
  (ADR-0040 D8). **M3 and M4 both closed UNCONSUMED; the bound closes at 2
  of ≤ 4.**
- **vitest:** `npm run test:app` — **1,563 passed / 1,563 across 106 files, by
  run** (`.vitest/run.json`; 8B's head: 1,508 / 105). The new file:
  `tests/routes/task-claim.test.ts`.
- **lint / typecheck / production build, each solo:** exit 0 / exit 0 / exit 0
  — `/[circle]/tasks/[task]/claim/submit` present in the build's route list.
- **gitleaks** (the CI-identical, digest-pinned container): **668 commits
  scanned, 10.44 MB, no leaks found.**
- **The gate:** D12 — **66/66 in 9 files, 1,228 s, 0 unexpected · 0 flaky · 0 skipped**, exit 0 (`.gate/e2e-run.json`, config-borne, no CLI override; the tally read from the JSON reporter, never from console text). The two new legs: *"claim: a view-level member takes an unassigned task from her own screen…"* 47.1 s and *"the access log reaches every entry: the cursor walks past 300 rows…"* 7.8 s. **Leg 38** (OW-13’s standing observation, carried at no cost since OW-25 made the reporter config-borne): *AC-PERM-3: removal closes the sessions channel* — **passed, 11.0 s**.
- **Coverage:** TSK-05's app and e2e halves and LOG-04 flip green at this head
  on legs inside the complete run; **LOG-01's app half is AMENDED WITH A
  MARKER pointing at LOG-04, never rewritten** — every sentence it had stays,
  including *"what is still owed is the CURSOR"*, because the record of what
  was owed is the point; what the marker adds is that the owing is discharged
  and LOG-04 is where the assertion now lives.
- **The re-tally.** Counted with the process test's OWN parser, not by eye: **280 rows · green 258 · review 9 · pending 13** — exactly 8B's 280 / 257 / 9 / 14 with LOG-04 moved from `pending` to `green` and nothing else touched. Reconciled three ways per the ritual: the table against this prose; every ledger row against `docs/owed.md` (OW-26 the only move, `TAKEN(8C/unit 2)` → `CLOSED(2f2c509)`); and the ledger's open count against the cap — **OPEN 0 / 25**. `npm run test:app`'s `tests/lint/process.test.ts` 29/29 checks the last two mechanically.

## Pointed questions, with recommended answers (the packet, collapsed)

- **Q-A** ADR-0040 D2's aside — *"the surface says a freeze from what
  `hc.circle_people` carries"* — is **not built, and D2's premise is
  corrected** (D2 above): `circle_people` carries a NULL, not a `frozen`
  boolean, and a freeze is `visible_at` rung 2, so the task never reaches the
  page. Recommended: ACCEPT the correction and let ADR-0040's Q-A be ruled
  with it in view; no second read to say an unsayable word.
- **Q-B** The list control is on the `Unassigned` filter ONLY, and both
  surfaces land on the task detail rather than returning to the list.
  Recommended: ACCEPT — a `?from=` return parameter is a redirect surface for
  a convenience, and landing on the task is where "it became hers" is legible.
- **Q-C** No "Newer entries" link; the page offers "The most recent entries"
  from any depth and relies on Back for one-page-newer. Recommended: ACCEPT —
  or OWE a bidirectional cursor if the round wants paging independent of
  browser history.
- **Q-D** The claim's browser leg raises Dan to `view` BY FIXTURE and does not
  assert the level; the `view`-vs-`manage` discrimination is proven live in
  `tests/hc/tasks.test.ts`. Recommended: ACCEPT as the declared pair (leg
  audit F4).
- **Q-E** *"No control where the function would refuse"* is proven in the
  browser for two refusal shapes of five; the other three are proven over the
  rendered tree and against the live definer. Recommended: ACCEPT (F5) — four
  more browser provisions buy no new information.
- **Q-F — READ THIS ONE FIRST; it is a database question this build may not
  touch.** `hc.claim_task` admits at `visible_at >= 'view'`. FRZ-13's freeze
  carve-out (`hc.grant_vectors`, `20260815230009`) sets `cap = 'view'` for
  exactly one person: **a coordinator who is NOT the objected-to member, while
  a freeze is `unresolved`.** `visible_at` applies the cap as a `least()`, so
  it lowers her to `view` rather than to `hidden` — and `view` is precisely
  the claim's floor. **A carve-out coordinator can therefore TAKE A TASK while
  the circle is under an unresolved freeze**, which the carve-out exists to
  let her *read* through, not write through.
  8A's pgTAP proves the refusal under an **open** freeze (070:32–35, then
  lifted at :35) and does not exercise the `unresolved` carve-out; nothing
  8C built changes this, because the surface asks the definer's own question
  and gets the definer's own answer — `mayClaim` is `true` here precisely
  because `claim_task` would succeed. Adjacent and NOT verified by this
  session: `complete_task`'s holder bar is `summary`, which a `view` cap also
  clears. **8C ships no DDL, so this is recorded, not fixed.** Recommended:
  rule whether the carve-out is read-only by intent. If it is, this is a
  coverage row plus an M-slot in a later slice (a `frozen`-aware guard in the
  write definers), never a build-session edit; if it is not, it is a
  documented allowance and wants a pgTAP pin saying so.
- **Q-G** Leg-audit F3 (the *"four §4.7.3 strings"* title) is left for this
  round rather than edited in a merged increment's file. Recommended: ACCEPT
  that placement and disposition the title here.

## What is NOT claimed

The `cap`-vs-freeze question at the database (Q-F — recorded, no DDL) · a
freeze NAMED on a claim surface (D2: unsayable, not skipped) · a bidirectional
log cursor (Q-C) · the claim's remaining three refusal shapes driven in a
browser (Q-E) · a `view`-level assertion inside the browser leg (Q-D) · the
`search copy and bounds` title (Q-G, round 30's) · TSK-05's pgTAP half, which
was green at 8A and is NOT re-earned here · the four `gate` rows, GRP-01,
SIG-01 (still NOT absorbed), G12-01 · **ADR-0040 and ADR-0041, both still
`proposed` and unstamped with Q-A…Q-G open in each — slice 8's close-out must
stamp both, and that is the owner's call, not this session's** · G4/G7 block,
G9 OPEN, G3 open, the band allowlist EMPTY. Nothing is production-activated.
