# Round 32 — the review packet for 9A: the freeze guard

**Tier 1** — 9A ships a migration and changes a `SECURITY DEFINER` body.

## SETTLED, except —

The following are **ruled** and are not this round's to re-open. A dissent
against any of them is a dissent, filed as one; it is not a finding
(`CLAUDE.md`, *Authority*).

- **That the FRZ-13 carve-out reaching `hc.claim_task` is a DEFECT and not an
  allowance** — ADR-0043 D2, ruling ADR-0042 Q-F with ADR-0040 Q-A. The
  carve-out is read-only *by intent* on three independent sources. `OW-27`.
- **That the remedy is an explicit `state in ('open','unresolved')` test inside
  `hc.claim_task`, landed as a NAMED M-slot of slice 9's bound** — slice-9 plan
  Q3, SETTLED. Not a change to `hc.grant_vectors`, not a change to
  `hc.visible_at`.
- **That the exposure is bounded to ONE function** — `assign_task`,
  `complete_task` and `snooze_task` each raise before their level test
  (ADR-0043 D2, answering ADR-0042's own "adjacent and NOT verified" note).
- **That 9A rides alone: M1 plus its pgTAP pair, nothing else** — slice-9 plan
  Q1. Home is 9B's.
- **That the `071` relabel rides 9A in its OWN commit, and that its evidence
  must be a PROBE and not a passing test** — ADR-0044 D2.
- **That the `002` catalog pin is written BEFORE the guard, inside M1's commit,
  so it is RED on `hc.claim_task` itself** — ADR-0044 D3. The ordering is the
  ruling, not a preference.
- **That `20260903120001` is NOT edited** — shipped migrations are never
  edited; the correction rides the new M1's header (ADR-0044 D4).
- **That the browser gate is DEFERRED into 9B's run** — slice-9 plan **Q10**,
  owner amendment 2026-09-06, carried by `docs/owed.md` **OW-32**. See
  *The gate is UNRUN* below, which is where this round's honesty is owed.
- **That `STP-03` stays GREEN and its status word does not move** — ADR-0044
  D2. `OW-29` is its evidence citation, not its truth.

Everything below this line is open to attack.

---

## The heads, and the binding between them

**Evidence head: `efc2164`.** Every product claim in this document belongs to
that commit and to no other.

**Docs head: this commit**, on `slice/9-freeze-guard`, five commits above the
evidence head. **Base: `origin/main` = `1eab0e5`**, re-verified unmoved by a
fetch at the packet's assembly — `git merge-base HEAD origin/main` is
`1eab0e5` exactly.

Every commit above the evidence head touches `docs/` only:

```
$ git diff --name-only efc2164 HEAD
docs/coverage.md
docs/owed.md
docs/review/9a-gate-kickoff.md
docs/review/9a-gate-rerun-kickoff.md
docs/review/round-32-kickoff.md
docs/review/slice-9-plan.md
```

And the per-directory tree binding, base → evidence → docs head. **Five of the
seven directories are byte-identical to BASE at both heads** — not merely
"unchanged since the evidence head", which is the weaker claim:

| Directory | `1eab0e5` (base) | `efc2164` (evidence) | `HEAD` (docs) |
|---|---|---|---|
| `app/` | `0c8f438…` | `0c8f438…` **= base** | `0c8f438…` **= base** |
| `components/` | `69c57d1…` | `69c57d1…` **= base** | `69c57d1…` **= base** |
| `lib/` | `b7366bb…` | `b7366bb…` **= base** | `b7366bb…` **= base** |
| `tests/` | `061d02d…` | `061d02d…` **= base** | `061d02d…` **= base** |
| `scripts/` | `bbf0440…` | `bbf0440…` **= base** | `bbf0440…` **= base** |
| `supabase/` | `4330110…` | `7935a45…` MOVED | `7935a45…` **frozen at evidence** |
| `docs/` | `ec99680…` | `a59d0ec…` MOVED | `ecd532a…` MOVED |

`git diff --name-only 1eab0e5 HEAD` outside `docs/` and `supabase/` is **empty**
— no root file, no `package.json`, no lockfile, no config. **9A is one
migration, four pgTAP files and documents.** That is also the first support
under the deferred gate: there is no browser surface at this head that differs
from the one 8C's gate proved.

---

## What changed

Four files under `supabase/`, in three commits, red → green per unit.

| Unit | Red | Green | The failure signature in the red |
|---|---|---|---|
| the kickoff (docs-only, FIRST) | — | `8f6b8e5` | 90 lines by the process test's own `split(/\r?\n/)`, exactly AT the cap |
| the ledger + coverage docs commit (docs-only) | — | `c248972` | coverage gains `## 9 — Home` (282 → 289); `OW-27/29/30/31` OPEN → TAKEN |
| **M1** — `002:21–22` the invariant, `070:41–45` the cases | `71e3bad` | `5bd2b7b` | `002`: `not ok 21` — *have* the eight-name set carrying `claim_task`, *want* the seven without it, **`hc.claim_task` the ONE extra name**. `070`: `not ok 43 … have: c5d4685f-04c9-423b-bee5-d77c7b4ff729` (her member row) `want: ERROR:P0001:claim_refused`, with `not ok 45` as its consequence and **44 green already** |
| **the `071` relabel**, its OWN commit | probe RED, in-message | `efc2164` | `not ok 4, 5, 6, 8, 9, 14` with **`ok 10, ok 15`** — the two non-discriminating cases passing exactly as round 31 said they would |

### 1 · `20260904120001_claim_task_freeze_guard` — the guard (FRZ-17 / OW-27)

A `create or replace` over `hc.claim_task(p_task uuid)` in a **new** migration.
`20260903120001` is untouched and stays the record of what 8A shipped and why.
Migrations **76 → 77**; pgTAP files stay **71**.

The whole product change is nine lines, at `:138–140` against a level test at
`:155`:

```sql
if exists (select 1 from public.freezes f
           where f.circle_id = v_task.circle_id
             and f.state in ('open', 'unresolved')) then
  raise exception 'claim_refused' using errcode = 'P0001';
end if;
```

Read **straight from `public.freezes`** and never through `hc.grant_vectors`.
The owner/revoke/grant trio is restated in the same migration (the 2A M8 way),
because a `create or replace` keeps the owner and the ACL and a migration that
leans on that leaves a definer's privileges implicit — `002:1/:3/:5/:6` are the
exact-set pins that would otherwise catch a regression a slice late.

The header additionally states the refusal set **exactly** (OW-31): no actor ·
no accounts row · nonexistent · soft-deleted · `done` · `cancelled` · frozen ·
an instruction row · below `view` · already held · no live member row. **Eight
arms, one string, and nothing in the string tells them apart.**

`007_freeze.sql:52` is a shipped exact-set pin over the hc functions whose
bodies reference `public.freezes`, and M1 makes `claim_task` the twentieth.
**It caught the build.** The first pass missed the re-pin and the full
`test:db` went red on it — 71 files, 1,871 tests, one failure, `007_freeze.sql`
test 52. M1's commit was amended to carry the re-pin rather than landing it
separately, so **no commit in this history is red on a shipped exact-set pin**,
and the commit message says so plainly.

### 2 · `002_definer_invariants.sql:21–22` — the invariant, not the instance (OW-30)

`plan(20) → plan(22)`. A catalog-driven assertion over `pg_proc`: **every `hc.*`
`SECURITY DEFINER` whose body reaches `hc.visible_at(` AND writes must also
test `public.freezes`, with the exempt set pinned BY NAME beside its reason.**
Test 22 then asserts that six of the seven exemptions really do gate at
`< 'manage'` — *asserted, not assumed, because "true by coincidence of
thresholds" is exactly the defect*.

Written before the guard and **RED on `hc.claim_task` itself**, which is the
whole value of the row and is why it rides a tests-only commit.

### 3 · `070_task_claim.sql:41–45` — the pair, and its control (FRZ-17, OW-31)

`plan(40) → plan(45)`, cases **APPENDED, never inserted**, so 1–40 keep their
numbers and `docs/coverage.md` TSK-05's citations stay true. Two fixture rows
(`t_cancelled`, `t_deleted`) and the exact task count re-pinned **13 → 15 at
both sites in the same commit**.

- **41–42** (OW-31): a `cancelled` task and a soft-deleted one, each refused in
  the ONE shape. `t_deleted` differs from `t_plain` in exactly one column, so
  its refusal is `deleted_at` and nothing else.
- **43** the defect, live: under an `unresolved` freeze naming Dan, Sarah — a
  coordinator who is **not** the objected-to member, `manage` ×5, `frozen =
  false`, capped at `view` — is refused. Before M1 she **took the task while the
  circle was frozen**.
- **44 THE CONTROL, and it is half the pair**: her READ through the carve-out
  must still resolve at exactly `view`. Without it, a fixture that accidentally
  *closed* her rather than carving her out makes 43 pass for the wrong reason —
  the FRZ-17 defect class recurring inside its own test. **44 was green before
  the guard existed**, which is what made 43 a guard failure and not a broken
  fixture.
- **45** the lift: the freeze deleted, the very same call lands.

Why four merged rounds missed it: cases 32–35 open their freeze with
`insert into public.freezes (circle_id) values (…)` and `state` **defaults to
`'open'`** (`20260815200005:20`), so the `unresolved` path was exercised
nowhere for this function.

### 4 · `071_step_up_level.sql` — the relabel (OW-29)

`plan(14) → plan(15)`, cases **APPENDED**, so `071:9`, `:10` and `:11` are the
same cases ADR-0044 D2's marker and `docs/coverage.md` STP-03 already cite.
Case 4 **rebuilt** to mint the pre-8A THREE-part `member:subject:health` and
post `manage`; cases 7, 9 and 11 given the `STP-03:` label; case 10 now
**saying** it does not discriminate; case 15 the displaced assertion, appended
and unlabelled, its title stating it is true with or without M2.

---

## What it asserts, and what it does not

**FRZ-17** flips `pending → green`, Slice cell `8 → 9` → **`9A`**, on both
halves of its own GREEN WHEN, and its cell says which is which. That is the
**only** row that moves: **289 rows unchanged · green 258 → 259 · review 9 → 9
· pending 22 → 21**.

`docs/owed.md`: **OW-27, OW-29, OW-30, OW-31 → `CLOSED(efc2164)`** — the head
OW-27's own acceptance cell names (*"earned at the 9A head"*) and the one head
where all four artifacts exist together. **TAKEN 5 → 1 · CLOSED 18 → 22.**
`OW-32` opens `OPEN`, taking the ledger **1 → 2 / 25**.

Both re-tallied at the docs head with `tests/lint/process.test.ts`'s own
parser (`ASSERTION_ID` filter, `STATUS_IDX = 6`), copied and run, **never by
eye**:

```
COVERAGE rows: 289 {"green":259,"review":9,"pending":21}
OWED rows: 32 cap: 25 {"CLOSED":22,"RISK":1,"TAKEN":1,"PROMOTED":6,"OPEN":2}
```

`npx vitest run tests/lint/process.test.ts` — **29 passed (29)**.

**`STP-03` does not move**, and neither does `STP-04`/`OW-28`, which are 9B's.

---

## THE BROWSER GATE IS UNRUN. IT DID NOT PASS.

**Say it plainly, because a reviewer must not have to notice it: the 66-leg
browser gate was NOT run at `efc2164`, and no statement anywhere in this packet
or in the ledgers claims that 9A's surfaces were re-proven.**

This is an **owner ruling**, not an omission: slice-9 plan **Q10**, an amendment
to a ruled plan made on the record on 2026-09-06 and **before this packet was
assembled**. 9A's kickoff ordered the gate *unconditionally*, citing ADR-0033
D19.14 (*a kickoff may not narrow the evidence set*), so deferring it required
exactly this. The gate moves into **9B's** run over the same nine files at a
later head. The debt is `docs/owed.md` **OW-32**, `OPEN`, whose acceptance
condition is **the 66 legs green in 9 files at the 9B head**, tally read from
`.gate/e2e-run.json`.

### The one run there is, classified and attached

2026-09-04, at `efc2164`, read from `.gate/e2e-run.json`:

**66 legs · 9 files · 3,197 s — 62 passed · 4 unexpected · 0 flaky · 0
skipped.**

| Leg (by title) | 8C green | This run | Shape |
|---|---|---|---|
| `a11y` — record surfaces at 390 px | 15 s | 302 s | timeout, budget 300 s |
| `documents` — DOC-02 machine-read sibling | 10 s | 425 s | timeout, budget 420 s |
| `documents` — DOC-04 share / unshare | 55 s | 421 s | timeout, budget 420 s |
| `record` — TSK-01 cross-taint | 28 s | 63 s | assertion on `main` |

**Ruled host starvation, on four supports, none of them a bare resource
number** — and per traps §1 *the environment is unwell* is the last diagnosis
reached for, so each support is a signal that changed with the code or a
control:

1. **No browser surface differs from the green run.** `git diff 1eab0e5..efc2164`
   touches no `app/`, no `components/`, no `lib/` file — the tree table above is
   the same fact stated per directory.
2. **The 62 legs green in BOTH runs cost 976 s then and 1,515 s now — a uniform
   1.55×.** A product defect does not slow the legs it does not touch.
3. **The one assertion failure is timing, not wrong content.** No 500 in 1,662
   requests; the assign page returned **HTTP 200 after 34.3 s** and rendered the
   app's own budget-exhaustion fallback — graceful degradation, observed.
4. **`hc_clamd` is ruled OUT** — 0.01 % CPU and no signature reload in the
   window (traps §7's known starver, checked rather than assumed).

What differed: 8C's run had the precondition met (~1.2 GiB freed); this one ran
against VS Code 751 MB + ChatGPT 211 + WebView2 172 + Chrome 164 + Notion 100,
free memory reached **158 MB**, and Windows itself failed a `Get-Process` with
`800705af`, the commit-charge limit.

**The record and all four failing traces are preserved** outside the repo, in
the 2026-09-04 session's scratchpad under `gate-efc2164/`; `.gate/` holds the
rotated copy. **This packet does not re-diagnose that run and did not re-run
it** — the one permitted re-run (traps §1) is UNSPENT, and the host cannot meet
preflight's 1.20 GiB floor with a session open: measured on a fresh boot with
the stack up and `hc_clamd` down, **534 MB free against a 1,229 MB floor**, with
`hc_clamd` alone holding 1,001 MB.

---

## The closure evidence set — Tier 1, stated exactly

Everything below was earned at `efc2164`. No number here is written
"unchanged".

| Leg | Result at `efc2164` |
|---|---|
| clean-leg `db:reset` at exact migration count | **77** migrations, exact |
| pgTAP | **71 files · Σ 1,871 PASS** |
| concurrency (teed) | **83 / 83** |
| `db:verify --fail-on warning` | clean |
| upgrade leg | M1 applied forward onto the live stack via `preflight --for db -- supabase migration up` at `5bd2b7b`, then the from-scratch reset above |
| vitest | **1,563 / 1,563** in **106** files |
| lint · typecheck · production build | clean |
| gitleaks | ⛔ **NOT RUN LOCALLY at this head, and NOT claimed.** It is a CI step (`.github/workflows`, digest-pinned) and no 9A commit records a local run. See *What is NOT claimed* item 12 |
| **local browser gate** | ⛔ **UNRUN — deferred by owner ruling (Q10), carried by `OW-32`.** The one run is the classified red above: 66 legs, 62 passed / 4 unexpected |
| coverage rows flipped | exactly one — FRZ-17, at the closing docs commit, never early |

**Migration bound: M1 spent, 1 of ≤ 4.** M2 CLOSED UNCONSUMED (ADR-0044 D6) ·
M3 held for rounds 32/33 · M4 NAMED for 9B. **Nothing else was consumed and no
reserve was spent.** Next free ADR **0045**.

**Dependencies: 0 runtime, 0 dev.** `package.json` and the lockfile are
byte-identical to base. `lib/ai/` is byte-identical to base; `PROMPT_VERSION`
does not move. **Nothing is production-activated** — G4 and G7 block, G9 is
OPEN, G3 is open, G12-01 stays `pending` at `gate`.

**No CI run number appears in this packet** (a round-17 finding), and no tally
is quoted from CI — CI does not run Playwright, and the browser gate is local
evidence only.

---

## What a reviewer should attack first

Three places, in this order.

### 1 · THE GUARD'S PLACEMENT — above the level test, and why below it is the same defect wearing a fix

The guard is at `:138–140`. The level test is at `:155`. **A guard placed below
the level test would never be consulted for the one caller it exists for.**
`hc.visible_at` applies the carve-out cap as its FINAL step — `least(result,
cap)` — and `hc.grant_vectors` hands a non-objected-to coordinator `cap =
'view'` under an `unresolved` freeze. `view` is exactly this function's
admission floor. So she passes the level test, and a guard sitting after it is
dead code for her. **Above it, no cap can lower the guard and no vector can
reach it, because it reads `public.freezes` and nothing else.**

Attack: is the placement argument *actually* airtight for every path into the
function — including the `for update` re-read above it and the advisory lock?
Is there an ordering between the status check, the freeze test and the
instruction-row test that changes which refusal a caller earns? (They all
raise the same string, so ordering is unobservable to a caller by design —
which is itself worth attacking.)

### 2 · `002:21`'s INVARIANT AND ITS EXEMPT SET — where `log_artifact_read` is exempt BY ARGUMENT, not by threshold

Six of the seven exemptions are exempt because they gate at `< 'manage'`, which
FRZ-13's `view` cap can never satisfy — **and test 22 asserts that rather than
assuming it.**

**The seventh is different and is the one to attack.** `hc.log_artifact_read`
admits at `>= 'view'` and it writes. It was found by the loose writer heuristic
on the first run — **no finding had named it**; it is the second function in the
tree admitting below `manage`. It is pinned exempt with this argument:

> *its only write is an `hc.log` audit append recording a read that was
> **PERMITTED**. Refusing it under a freeze would not prevent the read; it would
> make the read **UNLOGGED**, which is worse. The carve-out exists so a
> coordinator can still read, and this is the row that says she did.*

That is an **argument**, not a threshold, and it is the softest joint in the
increment. If round 32 disputes it, it is an argument to be ruled — see Q-A.

The heuristics are deliberately loose because **over-inclusion is the safe
direction**: a function wrongly called a writer merely has to appear on the
list or test freezes, while one wrongly called a reader disappears from the
rule SILENTLY. See Q-B, which is where I think that reasoning is incomplete.

### 3 · THE `071` RELABEL — whose evidence is a PROBE, not a passing test

ADR-0044 D2 ruled that a relabelled case which merely passes repeats the
defect. So the evidence is the `064` pattern: `hc.set_grant` replaced **inside
the file's own `begin … rollback`** with `pg_get_functiondef` minus M2's level
suffix — `create or replace` is transactional, so the shipped definer returns
with the rollback — and **the probe refuses to arm unless the suffix appears
exactly once**, so it cannot silently prove nothing.

```
NOTICE: PROBE ARMED: hc.set_grant now composes THREE parts
1..15
not ok 4  <- SUCCEEDS instead. The escalation, live.
not ok 5, 6, 8
not ok 9  <- SUCCEEDS instead.
not ok 14
ok 10, ok 15   <- the two NON-discriminating cases, exactly as round 31 said
# Looks like you failed 6 tests of 15
   (control: the same file unprobed is 1..15, 0 failed)
```

**And the second probe is the finding.** In that run cases 7 and 11 stayed
GREEN and were nearly written down as non-discriminating. They discriminate:
it is a **CASCADE**. Once 4 and 9 stop refusing they SUCCEED, which raises
`health` to `manage` and `schedule` to `view`; 7's and 11's posts are then
**LOWERS**, and a lower demands no token (071:13). Probed from the FIXTURE
instead, with the control in the same shape:

```
CONTROL (suffix intact):  case 7 => summary   case 11 => view
PROBE   (suffix removed): case 7 => grant_refused   case 11 => grant_refused
```

That trap is now recorded in `071`'s own header, because a future reader
running the obvious whole-file probe would otherwise conclude from a cascade
that two true cases prove nothing — **which is round 31 F-2's own defect, one
level up.**

Attack: is the probe's arming guard strong enough? Is `pg_get_functiondef`
minus a literal the right way to build the counterfactual body, or does it
admit a body that differs in more than the one thing under test?

---

## The pointed questions

Six. Each names a concrete edge the author does not know the answer to, and
each carries the author's own recommendation so the reviewer has something
specific to disagree with. **An unanswered pointed question defaults to NOT
PLANNED** (ADR-0006), and the 9B build does not start.

### Q-A · Is `hc.log_artifact_read`'s exemption right, or should it test freezes anyway?

It is the one exemption that is not a threshold. The argument is that refusing
an audit append under a freeze does not prevent the read — the read is already
permitted by the carve-out — it only makes the read **unlogged**, and the log
is the thing the carve-out is supposed to be accountable through.

The counter-argument is real: it is a `SECURITY DEFINER` that writes, admitting
at `view`, and it is now the *only* such function in the tree with no freeze
test — precisely the shape FRZ-17 was.

**Recommendation: KEEP THE EXEMPTION as pinned, with its argument in the file.**
A freeze suspends interactive *access*; it has never suspended the record of
access, and PRD §7.5's "no write under any freeze" is about acts that widen or
change the record, of which an append saying who read what is neither.

### Q-B · The invariant's `reads hc.visible_at` clause is UNDER-inclusive, and unlike the writer clause that direction is not argued

`002:21` selects on `prosrc like '%hc.visible_at(%'`. The file argues that the
*writer* half is loose in the safe direction — over-inclusion costs a list
entry, under-inclusion is silent. **It does not make that argument for the
reader half, and cannot: the reader half is the under-inclusive one.** A future
definer that obtains its level from a helper, from a view, or from a
`security definer` of its own — never typing `hc.visible_at(` — writes at
`view` and **falls outside the rule entirely, silently**, which is exactly the
failure mode this row was opened to end.

The fix is test-only (no DDL, no bound) but it needs its own red, and widening
the clause without care risks a heuristic that fires on unrelated functions.

**Recommendation: the residual is REAL and should be recorded, not fixed here.**
Open an owed row against a named later unit, acceptance being an extension of
`002:21`'s reader clause (or a second assertion pinning the set of hc definers
that resolve a level at all). Doing it inside round 32's dispositions would be
a fix in a session that owes no fixes.

### Q-C · The four task-write definers now DISAGREE about naming the freeze. Is that stable?

`assign_task`, `complete_task` and `snooze_task` raise `freeze_active` from
their explicit test. `hc.claim_task` raises `claim_refused` — 8A ruled the
freeze deliberately unnameable here, and `070:32–34` **pins** the one shape: *a
member at view, a member at manage and a stranger meet ONE string … the refusal
is not an oracle for the circle's state.*

So a member who cannot claim learns nothing, while the same member trying to
complete learns the circle is frozen. That may be an inconsistency worth
closing, or it may be exactly right — claim is the only one of the four
reachable from below `manage`.

**Recommendation: LEAVE IT. The test is the fix; the string is unchanged.**
FRZ-17's condition asks for the *test* its siblings carry, not their *raise*.
Adopting `freeze_active` would un-green three merged TSK-05 assertions to buy a
reader an oracle 8A explicitly refused her.

### Q-D · ADR-0044 D2 said STP-03's citation is "re-led with 071:9". The cell was AMENDED BY MARKER instead. Is a marker enough?

The row is untouched above the marker and the marker instructs the reader to
*read its pgTAP evidence as leading with `071:9`, then `:4`, `:7` and `:11`*.
A reader going top-down still meets the old lead first and only then learns to
re-order. The ruling's words were "re-led"; the implementation is "told how to
re-lead". That gap is small, and it is not nothing.

**Recommendation: the MARKER IS SUFFICIENT and should stand.** Rewriting a
green row's evidence cell in a build session is the edit class the
amend-by-marker convention exists to prevent (a row's history is the record of
what each slice shipped). If round 32 disagrees, the re-lead is a
dispositions-session edit, not a 9A one.

### Q-E · `OW-32`'s acceptance condition says "the 66 legs green in 9 files at the 9B head" — but 9B ADDS Home legs, so that run will not be 66

9B ships HOME-01…HOME-05 and A11Y-13, every one of which lands legs. Its gate
run will report a number **larger** than 66 in **more** than 9 files. Read
literally, `OW-32` can then never be satisfied by the run it names; read
loosely, it is satisfiable by any run that happens to be green, which is not an
acceptance condition at all.

**Recommendation: READ IT AS A SUBSET CONDITION, and say so explicitly in the
row rather than leaving it to inference** — *the nine files carrying 9A's 66
legs are all green within 9B's run, whose own total is higher by 9B's new
legs.* The nine files and their 66 legs are enumerable at `efc2164` today, so
the condition is checkable rather than rhetorical. Whoever rules this should
also say whether a 9B run that is green **except** in one of those nine files
discharges `OW-32` (it must not).

### Q-F · `FRZ-17` is green on pgTAP alone. Does the guard owe an app or e2e half?

FRZ-17's Layer cell is `pgTAP` and nothing else, while TSK-05 — the same
function's contract — carries app and e2e halves from 8C. The charter splits a
requirement spanning layers into one assertion per layer, so a reader may
reasonably ask why the freeze half stops at the database.

**Recommendation: pgTAP IS THE WHOLE OF IT, and the row should stay
single-layer.** The route calls the definer and receives the ONE refusal shape
that TSK-05's app half already asserts over the rendered tree; a route-level
case would assert the definer twice and prove nothing the pgTAP pair does not.
The reviewer who disagrees should say which *rendered* difference an app case
would catch — because if there is one, it belongs to 9B's gate and to `OW-32`,
not to a second FRZ-17 half.

---

## What is NOT claimed

This is the list an honest packet owes, and it is where this round's live debt
is written down.

1. **The browser gate did not run at `efc2164`.** No surface in `app/`,
   `components/` or `lib/` was re-proven at this head. `OW-32`, `OPEN`.
2. **The one gate run there is was RED** — 62 passed / 4 unexpected. It is
   *classified*, not passing, and this packet did not re-run or re-diagnose it.
   The one permitted re-run is UNSPENT.
3. **No CI evidence is claimed for anything.** CI does not run Playwright; no
   run number and no tally from CI appears here.
4. **`FRZ-17` has no app half and no e2e half** and does not claim one — see
   Q-F.
5. **`070:41–42` passed on arrival.** They pin a documentation claim 8A's
   header made that the file never constructed; they are not a regression that
   was live. ADR-0044 D4 stated that impact as weak and this packet does not
   inflate it.
6. **The `071` relabel turns nothing green.** `STP-03`'s status word does not
   move; the relabel repairs its *evidence citation*, not its truth.
7. **`002:21` does not catch a write definer that reaches its level by any
   route other than calling `hc.visible_at(` directly** — the residual in Q-B,
   named here rather than left implicit.
8. **`OW-28` / `STP-04` are untouched.** They are 9B's, its unit ordered FIRST,
   and nothing in 9A bears on them.
9. **`20260903120001` still carries its over-wide header** ("*a done or deleted
   or nonexistent task*"). It is shipped and shipped migrations are never
   edited; the exact refusal set lives in the new M1's header and in this
   packet, not in a correction to the old file.
10. **Nothing is production-activated.** G4 and G7 block, G9 is OPEN, G3 is
    open, G12-01 stays `pending` at `gate`, and the seven `## 9 — Home` rows
    stay `pending` — they are 9B's, and HOME-06 is never green in this slice.
11. **No reserve was consumed beyond M1.** M2 closed UNCONSUMED; M3 and M4 are
    untouched. The bound stands at **1 of ≤ 4**.
12. **gitleaks was not run locally at `efc2164`** and is not claimed as part of
    this increment's evidence. It is a CI step and CI evidence is claimed for
    nothing here (item 3). The bounding fact is structural rather than a scan:
    `app/`, `components/`, `lib/`, `tests/`, `scripts/` and every root file are
    **byte-identical to base**, and the two directories that moved contain one
    SQL migration and four pgTAP files, all of which appear in full in this
    packet's diff. Whether that discharges the Tier-1 gitleaks leg or leaves a
    debt is the reviewer's to say.

---

## ⏸ AT THE PR, STOP

This PR merges nothing. **The review is its own fresh session**, and its
findings land **VERBATIM** in `docs/review/round-32-findings.md` before
anything is argued. **The owner is sole merge authority; no session merges its
own work**, and the merge is `--no-ff`.
