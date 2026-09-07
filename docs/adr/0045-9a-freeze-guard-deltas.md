# ADR-0045 — Slice 9A: the freeze guard — deltas as built, and the round-32 packet

**Status:** **`accepted` — 2026-09-06.** Stamped at round 32's rulings
(ADR-0046 D9), which ruled **Q-A…Q-F all AS RECOMMENDED** — Q-A the exemption
kept (D1), Q-B recorded not fixed and opening **`OW-33`** (D2), Q-C the four
raises left as they are (D3), Q-D the marker standing (D4), Q-E `OW-32`'s
acceptance rewritten as a **SUBSET** condition naming the nine files (D5), Q-F
`FRZ-17` left single-layer (D6). **None departs from its recommendation.**
**`accepted` records that the questions were RULED, not that a round was
held** — round 32's review was never held; the owner merged this packet
directly (ADR-0046). **Q-G is not this ADR's**: round 32's kickoff raised it
and ADR-0046 D7 rules it, re-homing the browser gate to a **Vercel staging
deployment** and flipping `OW-32` to **`RISK(GATE-01)`**, so 9B may close with
browser evidence outstanding. With Q-A…Q-F ruled, ADR-0006's NOT PLANNED
default is discharged and **the 9B build may start.**
**Branch:** `slice/9-freeze-guard`, from `origin/main` @ `1eab0e5` (PR #47,
round 31's dispositions, merged `--no-ff` 2026-09-04; parents `34b5c78` and
`d801778`). Base re-verified unmoved by a fetch at the packet's assembly.
**Date:** 2026-09-06. **Evidence head:** `efc2164` — every commit past it is
docs-only (`git diff --name-only efc2164 HEAD` is six paths, all under
`docs/`).
**Tier:** **1** — 9A ships a migration and changes a `SECURITY DEFINER` body.
Ruled at the slice-9 plan gate, Q1/Q2, and not lowered.
**Scope:** the plan's "### 9A" verbatim — *M1 plus its pgTAP pair. Nothing
else* (Q1) — plus the three round-31 repairs ADR-0044 homed here (D2, D3, D4).
**Migrations: ONE — M1, `20260904120001_claim_task_freeze_guard`. The bound
stands at 1 of ≤ 4.** M2 closed UNCONSUMED at round 31's dispositions
(ADR-0044 D6); M3 is held for rounds 32/33; M4 is NAMED for 9B. **No reserve
was consumed beyond M1 and its ruling is quoted below.**
**Dependencies: 0 runtime, 0 dev** — `package.json` and the lockfile are
byte-identical to base. `lib/ai/` is byte-identical to base; `PROMPT_VERSION`
does not move. Nothing is production-activated.
**Authority:** slice-9 plan Q1–Q3 and the **Q10** owner amendment → ADR-0043 D2
(which opened FRZ-17 and OW-27) → ADR-0044 D2/D3/D4/D6 (round 31's
dispositions) → ADR-0042 Q-F / ADR-0040 Q-A → PRD §7.5, §4.5.1 → TSD §11.1 row
9 → `docs/coverage.md` FRZ-17, TSK-05, STP-03, FRZ-13.
**The packet:** `docs/review/round-32-packet.md`.

---

## What ADR-0044 left, and what 9A did with it

ADR-0044 ruled round 31's four findings and homed five owed rows. Four of them
were 9A's. **All four are `CLOSED(efc2164)`; the fifth was never 9A's.**

| Row | ADR-0044 | Home ruled | State at `efc2164` |
|---|---|---|---|
| `OW-27` | ADR-0043 D2 (earlier) | 9A / M1 | **CLOSED(`efc2164`)** |
| `OW-28` | D1 (F-1) | **9B**, its unit ordered FIRST | **OPEN — untouched, and rightly** |
| `OW-29` | D2 (F-2) | 9A, its OWN commit | **CLOSED(`efc2164`)** |
| `OW-30` | D3 (F-3) | 9A, inside M1's commit, RED first | **CLOSED(`efc2164`)** |
| `OW-31` | D4 (F-4) | 9A, inside M1's commit | **CLOSED(`efc2164`)** |

And one row opened that ADR-0044 did not foresee: **`OW-32`**, the deferred
browser gate, created by the owner's **Q10** amendment on 2026-09-06. The
ledger runs **OPEN 1 → 2 / 25**.

---

## D1 — M1: the guard, and its placement is the whole fix

`20260904120001_claim_task_freeze_guard`, a `create or replace` over
`hc.claim_task(p_task uuid)` in a **new** migration. `20260903120001` is
untouched. Migrations **76 → 77**; pgTAP files stay **71**, as slice-9 plan Q2
requires.

The reserve is consumed with its ruling quoted, per `CLAUDE.md`, *Bounds*
(slice-9 plan **Q3**, SETTLED):

> *"IN, as M1, with the two-case pgTAP pair — the refusal under an `unresolved`
> freeze AND the control proving her carve-out READ still resolves.
> `OW-27 → TAKEN(9A/M1)`. Carrying is not a third option and the row is
> `pending`, never green, until both land."*

The product change is nine lines at `:138–140`, reading **straight from
`public.freezes`** and never through `hc.grant_vectors`, placed **ABOVE** the
level test at `:155`.

**The placement is not a detail; it is the fix.** `hc.visible_at` applies the
carve-out cap as its final step — `least(result, cap)` — and `hc.grant_vectors`
(`20260815230009`) hands a coordinator who is *not* the objected-to member
`frozen = false` and `cap = 'view'` under an `unresolved` freeze. `view` is
exactly this function's admission floor. **A guard below the level test is
therefore dead code for the one caller it exists for**: she passes the level
test and is never asked. Above it, no cap can lower it and no vector can reach
it.

The owner/revoke/grant trio is restated in the same migration (the 2A M8 way):
a `create or replace` keeps the owner and the ACL, but a migration relying on
that leaves a definer's privileges implicit, and `002:1/:3/:5/:6` are the
exact-set pins that would otherwise catch a regression a slice late.

**`007_freeze.sql:52` — a shipped exact-set pin — caught the build.** M1 makes
`claim_task` the twentieth hc function referencing `public.freezes`; the first
pass missed the re-pin and the full `test:db` went red on it (71 files, 1,871
tests, one failure, test 52). M1's commit was **amended** to carry the re-pin
rather than landing it separately, so **no commit in this history is red on a
shipped exact-set pin**, satisfying `CLAUDE.md`, *Bounds*: *"pgTAP exact-set
pins re-pinned in the same commit"*.

**The raise stays `claim_refused`.** FRZ-17's condition is the sibling *test*,
not the sibling *raise*; 8A ruled the freeze deliberately unnameable here and
`070:32–34` pins the ONE shape. See **Q-C**.

## D2 — `002:21–22`: the invariant, written RED before the guard

`plan(20) → plan(22)`, discharging `OW-30` with ADR-0044 D3 quoted in the row:

> *"Written BEFORE M1's guard and inside M1's own commit it is RED on
> `hc.claim_task` itself and M1 turns it green; added after, it is born green
> and proves nothing."*

**Test 21** — over `pg_proc`: every `hc.*` `SECURITY DEFINER` whose body reaches
`hc.visible_at(` **and** writes must also test `public.freezes`, with the
exempt set **pinned by name beside its reason**. The RED signature: *have* the
eight-name set carrying `claim_task`, *want* the seven without it — **the one
extra name being the guard's own function, before the guard existed.**

**Test 22** — the exemptions are not a bare list: six of the seven are exempt
because they gate at `< 'manage'`, which FRZ-13's `view` cap can never satisfy,
and that is **asserted rather than assumed**, because *"true by coincidence of
thresholds"* is precisely the defect FRZ-17 was.

**The loose writer heuristic earned its keep on the first run.** "Writes" is
direct DML **or** a call to `hc.log`, and that second clause caught
**`hc.log_artifact_read`** — the second function in the tree admitting below
`manage`, which **no finding had named**. It is pinned exempt **by argument,
not by threshold** (see **Q-A**), and it is the seventh name.

## D3 — `070:41–45`: the pair with its control, and the refusal set stated exactly

`plan(40) → plan(45)`, cases **APPENDED, never inserted**, so 1–40 keep their
numbers and TSK-05's citations stay true. Two fixture rows added and the exact
task count re-pinned **13 → 15 at both sites in the same commit**.

`41–42` discharge `OW-31`: a `cancelled` task and a soft-deleted one, each
refused in the ONE shape. **Both passed on arrival**, which is exactly what
ADR-0044 D4 claimed, and this ADR states that impact as weak rather than
inflating it — the correction is that M1's header now states the refusal set
exactly (eight arms), while the shipped `20260903120001` keeps its over-wide
wording because shipped migrations are never edited.

`43–45` discharge `OW-27` and flip `FRZ-17`. **`44` is the control and is half
the pair**: her READ through the carve-out must still resolve at exactly
`view`, or a fixture that accidentally *closed* her rather than carving her out
makes `43` pass for the wrong reason — the FRZ-17 defect class recurring inside
its own test. **44 was green before the guard existed**, which is what made 43
a guard failure and not a broken fixture.

Why four merged rounds missed this: `070`'s existing freeze cases open with
`insert into public.freezes (circle_id) values (…)` and `state` **defaults to
`'open'`** (`20260815200005:20`), so the `unresolved` path was exercised
nowhere for this function.

## D4 — `071`: the relabel, evidenced by a PROBE

`plan(14) → plan(15)`, its OWN commit (`efc2164`), never folded into M1's, per
ADR-0044 D2. Cases **APPENDED**, so `071:9`, `:10`, `:11` are the same cases
D2's marker and STP-03's cell already cite.

Case 4 **rebuilt** to mint the pre-8A THREE-part `member:subject:health` and
post `manage` — the shipped body refuses it, the suffix-less body **allows**
it, and that is the escalation the row exists to forbid. Cases 7, 9, 11 gain
the `STP-03:` label; case 10 now **says** it does not discriminate; case 15 is
the displaced assertion, appended and unlabelled.

**The evidence is a probe and not a passing test** (the `064` pattern):
`hc.set_grant` replaced inside the file's own `begin … rollback` with
`pg_get_functiondef` minus M2's level suffix, the probe **refusing to arm**
unless the suffix appears exactly once. RED `not ok 4, 5, 6, 8, 9, 14` with
`ok 10, ok 15`; control, the same file unprobed, `1..15`, 0 failed.

**And the second probe is the finding.** Cases 7 and 11 stayed green under the
whole-file probe and were nearly recorded as non-discriminating. They
discriminate — it is a **cascade**: once 4 and 9 stop refusing they succeed,
raising `health` to `manage` and `schedule` to `view`, so 7's and 11's posts
become **lowers**, and a lower needs no token (`071:13`). Probed from the
fixture instead, both are refused with the suffix gone and both land with it
intact. **That trap is now recorded in `071`'s own header**, because a reader
running the obvious probe would otherwise conclude from a cascade that two true
cases prove nothing — which is round 31 F-2's own defect, one level up.

`STP-03` is **AMENDED BY MARKER, never rewritten, and its status word does not
move.** See **Q-D**.

## D5 — the ledgers, re-tallied mechanically

**Exactly one coverage row moves.** `FRZ-17`: `pending → green`, Slice cell
`8 → 9` → **`9A`**, on both halves of its own GREEN WHEN, its cell saying which
is which. **289 rows unchanged · green 258 → 259 · review 9 → 9 · pending
22 → 21.**

**`docs/owed.md`:** OW-27, OW-29, OW-30, OW-31 → `CLOSED(efc2164)` — the head
OW-27's own acceptance cell names and the one head where all four artifacts
exist together. **TAKEN 5 → 1 · CLOSED 18 → 22.** `OW-32` opens, **OPEN 1 → 2 /
25**.

Counted with `tests/lint/process.test.ts`'s own parser (`ASSERTION_ID` filter,
`STATUS_IDX = 6`), copied and run at the docs head, **never by eye**:

```
COVERAGE rows: 289 {"green":259,"review":9,"pending":21}
OWED rows: 32 cap: 25 {"CLOSED":22,"RISK":1,"TAKEN":1,"PROMOTED":6,"OPEN":2}
```

`npx vitest run tests/lint/process.test.ts` — **29 passed (29)**.

## D6 — the browser gate is DEFERRED, and this ADR says so where it cannot be missed

Slice-9 plan **Q10**, owner amendment, 2026-09-06, made **before** this packet
was assembled: **the 66-leg browser gate is NOT run at the 9A head** and is
deferred into **9B's** run. `docs/owed.md` **OW-32** carries the debt;
acceptance is the 66 legs green in 9 files at the 9B head, tally read from
`.gate/e2e-run.json`.

The one run there is — 2026-09-04, **66 legs, 62 passed · 4 unexpected · 0
flaky · 0 skipped** — is **RED and classified as host starvation on four
supports**, none of them a bare resource number: no `app/`, `components/` or
`lib/` file differs from the green run; the 62 legs green in both runs cost a
uniform **1.55×**; the one assertion failure is timing, with **no 500 in 1,662
requests** and an HTTP 200 after 34.3 s rendering the app's own
budget-exhaustion fallback; and `hc_clamd` is ruled out at 0.01 % CPU with no
reload in the window. Its record and all four traces are preserved outside the
repo.

**This round did not re-run it and did not re-diagnose it.** The one permitted
re-run (traps §1) is UNSPENT. The host cannot meet preflight's 1.20 GiB floor
with a session open: 534 MB free on a fresh boot with the stack up and
`hc_clamd` down, against a 1,229 MB floor, `hc_clamd` alone holding 1,001 MB.

**Nothing in this ADR may be read as saying 9A's surfaces were re-proven.**
9A edits none of them, and its evidence is pgTAP and catalog. See **Q-E**.

## D7 — what is NOT claimed

The packet carries the full list; the two items that bear on a ruling are
repeated here so a reader of this ADR alone is not misled.

- **The browser gate is UNRUN** (D6), and **gitleaks was not run locally** at
  `efc2164` — it is a CI step, and no CI evidence is claimed for anything in
  this increment. The structural bound is that `app/`, `components/`, `lib/`,
  `tests/`, `scripts/` and every root file are **byte-identical to base**, and
  the two directories that moved hold one migration and four pgTAP files.
- **`FRZ-17` is green at the pgTAP layer only** and claims no app or e2e half.
  See **Q-F**.

---

## The pointed questions

Six. Each carries the author's recommendation, so the reviewer has something
specific to disagree with. **An unanswered question defaults to NOT PLANNED**
(ADR-0006).

### Q-A · `hc.log_artifact_read` is exempt from the freeze invariant BY ARGUMENT, not by threshold. Ruled right, or ruled a defect?

It admits at `>= 'view'` and it writes; it is now the only such hc definer in
the tree with no freeze test — the shape FRZ-17 was. Its only write is an
`hc.log` audit append recording a read that was **permitted** by the carve-out.

**RECOMMENDED: keep the exemption as pinned, with its argument in the file.** A
freeze suspends interactive *access*; it has never suspended the *record* of
access. Refusing this write would not prevent the read — it would make the read
**unlogged**, which is strictly worse for the accountability the carve-out
depends on.

### Q-B · The invariant's `reads hc.visible_at` clause is UNDER-inclusive, and that direction is not argued anywhere

`002:21` argues its *writer* clause is loose in the safe direction. **It makes
no such argument for the reader clause, and cannot:** a future definer that
obtains its level from a helper, a view, or a definer of its own — never typing
`hc.visible_at(` — writes at `view` and falls outside the rule **silently**,
which is the exact failure mode OW-30 was opened to end. The fix is test-only
(no DDL, no bound) but needs its own red.

**RECOMMENDED: record the residual, do not fix it here.** Open an owed row
against a named later unit — acceptance being an extension of `002:21`'s reader
clause, or a second assertion pinning the set of hc definers that resolve a
level at all. Fixing it inside round 32's dispositions would be a fix in a
session that owes none.

### Q-C · The four task-write definers now DISAGREE about naming the freeze. Stable, or an inconsistency to close?

`assign_task`, `complete_task` and `snooze_task` raise `freeze_active`.
`claim_task` raises `claim_refused`, because 8A ruled the freeze unnameable
here and `070:32–34` pins the ONE shape. A member who cannot claim learns
nothing; the same member trying to complete learns the circle is frozen.

**RECOMMENDED: leave it. The test is the fix; the string is unchanged.**
FRZ-17 asks for the sibling *test*, not the sibling *raise*, and adopting
`freeze_active` would un-green three merged TSK-05 assertions to buy a reader
an oracle 8A explicitly refused her. `claim_task` is also the only one of the
four reachable from below `manage`, so the asymmetry tracks a real difference.

### Q-D · ADR-0044 D2 said STP-03's citation is "re-led with `071:9`". It was AMENDED BY MARKER instead. Is a marker enough?

The row is untouched above the marker, which instructs the reader to re-order
the evidence. A top-down reader still meets the old lead first. The ruling said
"re-led"; the implementation says "told how to re-lead".

**RECOMMENDED: the marker is sufficient and should stand.** Rewriting a green
row's evidence cell inside a build session is the edit class the
amend-by-marker convention exists to prevent — a row's history is the record of
what each slice shipped. If round 32 disagrees, the re-lead is a
dispositions-session edit and not a 9A one.

### Q-E · `OW-32`'s acceptance names "the 66 legs green in 9 files at the 9B head" — but 9B ADDS legs, so that run cannot report 66

9B ships HOME-01…HOME-05 and A11Y-13, each landing legs. Its gate will report
**more** than 66 in **more** than 9 files. Read literally the row can never be
satisfied by the run it names; read loosely it is satisfied by any green run,
which is not an acceptance condition at all.

**RECOMMENDED: rule it a SUBSET condition and write that into the row** — *the
nine files carrying 9A's 66 legs are all green within 9B's run, whose own total
is higher by 9B's new legs.* The nine files and their 66 legs are enumerable at
`efc2164` today, so the condition stays checkable. Whoever rules this should
also state that a 9B run green **except** in one of those nine files does
**not** discharge `OW-32`.

### Q-F · `FRZ-17` is green on pgTAP alone. Does the guard owe an app or e2e half?

FRZ-17's Layer cell is `pgTAP` only, while TSK-05 — the same function's
contract — carries app and e2e halves from 8C. The charter splits a requirement
spanning layers into one assertion per layer.

**RECOMMENDED: pgTAP is the whole of it; the row stays single-layer.** The
route calls the definer and receives the ONE refusal shape TSK-05's app half
already asserts over the rendered tree; a route-level case would assert the
definer twice. A reviewer who disagrees should name the **rendered** difference
an app case would catch — and if there is one, it belongs to 9B's gate and to
`OW-32`, not to a second FRZ-17 half.

---

## ⏸ AT THE PR, STOP

This PR merges nothing. The review is its own fresh session and its findings
land **VERBATIM** before anything is argued. **The owner is sole merge
authority; no session merges its own work**, and the merge is `--no-ff`.
