# ADR-0040 — Slice 8A: claim + the level-bound step-up, the database increment — design decisions and deltas as built

**Status:** proposed — the 8A build record, put to round 28 (**Tier 1**, ruled
at the plan gate, Q1; the browser gate unconditional, ADR-0033 D19.14).
**Branch:** `slice/8-claim-db`, from `origin/main` @ `ccb4804` (PR #39,
`chore/preflight-dev-lock`, the Q7 precondition — one Tier-3 merge past the
plan's `d583f0c`; `supabase/`, `lib/`, `app/` and `e2e/` byte-identical to
the `bb40021` evidence head there).
**Date:** 2026-09-03. **Evidence head:** `4d166c0` — every commit past it
docs-only.
**Scope:** two migrations `20260903120001`–`120002` (**M1 `task_claim` · M2
`step_up_level_binding`**, the plan's Q2 table as ruled; **M2 is the
consumed reserve, its ruling quoted in its commit** — Q3(a), SETTLED
2026-09-02); **M3 stays reserved** for the round-28 dispositions; **M4 stays
reserved and NAMED** for a search index on a MEASURED PRF-06 breach at the
8B head. **The bound stands at 2 of ≤ 4.** Authority order: the plan (M-rows
BINDING) → PRD §4.5.1, §4.6.3, §6.5, §7.3 → TSD §3.6, §5.7 → ADR-0036 Q-D
(claim ruled to slice 8) and ADR-0038 D6 item 2 (the level, named and
stopped for this gate) → `docs/coverage.md` row conventions. The narrative
is the packet's (`docs/review/round-28-packet.md`); this file holds the
decisions. **Zero dependencies added. Nothing is production-activated.**

---

## The commits (red → green per unit, the signature in every red)

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| the kickoff · the ruled intake (docs-only, FIRST) | — | `cb1505d` · `4bdbdbd` | coverage § 8's thirteen rows `pending`; `docs/owed.md` OPEN 7 → **0 / 25** (Q3(b), Q6); `process.test.ts` 29/29 |
| M1 `task_claim` | `63558eb` | `0e780f8` | 28 of 40: `42883 function hc.claim_task(unknown) does not exist` ×19; the catalog cases false on zero rows; `task_claimed` absent |
| concurrency 55 | — | `24d6271` | teed, **83/83 on the M1-only database** (D8 fact 1) |
| M2 `step_up_level_binding` | `7f8a332` | `05faed4` | 4 of 14: case 7 `have: grant_refused / want: summary` (a four-part token against a three-part composition); case 9 `have: view / want: grant_refused` — the pre-8A shape STILL RAISED, R3's dissent verbatim |
| M2's app half — the mint site | `8a81b22` | `4d166c0` | 2 of 28: the page's hidden `target_ref` three parts; the route bouncing a four-part-bound token (`setGrant` never called) |

---

## D1 — M1: the claim sits at `view`, on the claimant's OWN vectors, as the task STANDS

`hc.claim_task(p_task)` takes **one argument**. It asks
`hc.visible_at(hc.ctx(), subject, taint, taint_resolved, 'task', task,
owner_member_id)` — the caller's own context, read under the per-circle
lock, with the task's **current** holder (null, for the task this function
is for) — and refuses below `view` (070:12, 16–20). Two consequences the
plan's row already carries and the tests drive as pairs: **a care-circle
member meets rung 4 exactly as `tasks_select` puts it to her today** —
hidden unless a named share already widens the one object, in which case
rung 5 gives `view` and view claims (070:21–22, 25); and **the level
decides, not the person** — Kim at `view` on `{schedule}` claims the
`{schedule}` task and is refused the `{schedule,health}` one beside it from
her own ladder (070:17–18), Omar with context on Marcus alone claims
Marcus's task and not Nell's (070:19–20). `summary` does not claim (070:16):
the plan's Q2, *"summary-may-claim … rejected"* — summary is a title, view
is the task. **Why this sits below `manage` and `assign_task` does not:** a
claim moves work to the READER; §4.5.6's taint collision cannot arise, so
nothing an instruction row or a named share exists to bridge is bridged.

## D2 — M1: refusals are ONE shape, the freeze included — a ruled departure from `assign_task` and `complete_task`

Eleven refusals — hers already, owned-by-another asked by `manage`,
`summary`, a non-reader by ladder, no context on the subject, the care
ceiling, someone else's, done, an instruction row (ADR-0033 cluster C), a
nonexistent id, a stranger — collapse to **one distinct string**,
`claim_refused`, joined OUTSIDE the statement (070:31). **The freeze is not
named.** `assign_task` and `complete_task` raise `freeze_active` to members
(ADR-0032 D4, ADR-0033 cluster E); `claim_task` refuses under a freeze in
the same one shape, because the freeze reaches it through `hc.visible_at`
rung 2 alone — the plan's row M1, *"refused under freeze through the same
one function"*, and the kickoff's *"a frozen circle in ONE shape"*. A member
at `view`, a member at `manage` and a stranger meet one string under the
freeze (070:32–34); the freeze lifted, the very same call lands (070:35), so
it was the freeze and nothing else. The consequence is 8C's: the surface
says a freeze from what it already knows (`hc.circle_people` carries
`frozen`), not from the refusal. **Q-A.**

## D3 — M1: no share, no instruction, no row — asserted as SET EQUALITY, not as the absence of an insert

The plan's safety argument is that a claim *creates no object share and
writes no `written_for_member_id` instruction*. 070 does not argue it: it
snapshots every `object_shares` row and every instruction row before the
first claim and asserts `set_eq` against those snapshots after the headline
claim (070:10–11), after the shared-task claim — the one place a share might
plausibly be minted or marked, and the existing share stays the ONLY share
with `created_by_assignment_of` null (070:23–24) — and again after every
path, five claims and every refusal and a freeze opened and lifted
(070:36–37); the task count is exact throughout (070:5, 38). The function
takes no member, no instruction text, no document and no token, so the
paths do not exist to be taken (070:1; 002's inventory pins the one
signature).

## D4 — M1: a claimed task is a HANDED task to every other writer, and `task_claimed` is its own event

The write is the three assignment columns `assign_task` writes —
`owner_member_id = the claimant's member row`, `assigned_by = her own
account`, `assigned_at` — and nothing else (070:7). So `assign_task`
reassigns a claimed task and names the claimant as the FORMER holder
(070:39), `complete_task` sees her as the holder exactly as it sees a
handed one (070:40), and `unassign_task` / `remove_member` need no new arm.
The log entry is **`task_claimed`**, the claimant as actor AND target
(070:8) — distinct from `task_assigned` so the log can tell *handed to you*
from *you took it* (AC-TASK-2's human actor either way); no `task_assigned`,
`task_reassigned` or `object_shared` is written by any path (070:9).
**Hers already is NOT a quiet no-op** (070:13): the plan's row refuses any
owned task, and moving held work is `unassign` + `assign`, which stays
`manage`'s (070:14). **Q-B.** The AI has no path: `hc_pipeline` holds no
EXECUTE (070:3; 002).

## D5 — M2: the level is the fourth part, and the binding is REPLACED, not widened

`hc.set_grant`'s consume target is now `member:subject:domain:level` —
`20260818120008`'s F2 body byte-for-byte, extracted from the file, with ONE
composition changed and ownership plus grants restated (071:1–3; 002). A
token minted to raise health to `summary` does not consume against a post
of `manage` for the same triple (071:4); the refused token is left
**unconsumed** — the exact match never touched the row, so the confirmation
she gave is still hers to spend on what she confirmed (071:5), and the
grant and the log are untouched (071:6); the same token then raises to
`summary` (071:7–8, 14). **The pre-8A three-part shape no longer raises
anything** (071:9) and `view` cannot buy `manage` (071:10). This is R3's
dissent 1 (round 27), covered: *"a crafted link that raises the level a
coordinator THINKS she confirmed"* is now refused by the database whatever
the URL carries. Everything else holds by re-pin — a LOWER demands no
token (071:13), the ceiling and the freeze precede the token (038:15–17,
21), the two-session cases (concurrency 29, 31). **Q-D.**

## D6 — M2: the mint site composes the same four parts; the round-trip stays `rs/rd/rl`

`people/[member]/page.tsx` offers the password FOR
`member:subject:domain:level` (the hidden `target_ref` the step-up submit
mints against) and reads the companion cookie against the same four parts
before it offers *Raise it*; `grant/submit/route.ts` confirms the cookie
against the same string before it hands the token to `hc.set_grant` — a
token FOR another level is not bound, not sent, not burned, the 7D R3/F-8
posture one part wider (`tests/routes/member-detail.test.ts`: the two
positive pins that went red, the four negatives). The three-param
round-trip (`rs/rd/rl`, never a colon-joined triple — `safeNext` refuses
`:`, the r3 gate catch) is unchanged; the level was always in the URL, and
what changed is that it is now also in the sentence the database matches.
`lib/hc/step-up.ts` did not need to move: the mint wrapper passes the
`target_ref` it is handed, and the site that composes it is the one that
knows the level. The PPL-02 leg drives this path in the browser inside the
closure gate. **Q-F.**

## D7 — Suite re-pins forced by the increment (all same-commit)

| Pin | Moved | Migration |
|---|---|---|
| `001` `hc.log_event_types` exact set | 27 → **28** (`task_claimed`) | M1 |
| `002` function inventory | +1 (`claim_task(p_task uuid)`) | M1 |
| `002` SECURITY DEFINER set | eighty-four → **eighty-five** | M1 |
| `002` EXECUTE grant set | +1 (`claim_task`/`authenticated`; `hc_pipeline` gains nothing) | M1 |
| `038` the five `raise_grant` mint targets + header + two descriptions | `…:domain` → `…:domain:level` | M2 |
| `041` the fixture raise | `:health` → `:health:view` | M2 |
| concurrency 29, 31 (GRT-01's multi-session half) | `:health` → `:health:view` | M2 |
| `tests/hc/people.test.ts` the live raise and the ceiling raise | `:health:summary`, `:schedule:view` | M2 |
| `036_step_up` | **unchanged** — its four `target_ref` pins are `document:` and proposal targets, none a `raise_grant`; the kickoff's trap was checked and found not to bite | — |

Every one was caught by the suite before the migration existed or by the
re-pin run after it. Ordering trap in 002: `claim_stage` < `claim_task` <
`close_extraction_run`.

## D8 — The bound, the regression net, and four environment facts

**2 of ≤ 4 at this head; M3 and M4 reserved.** The tree moves **74 → 76
migrations / 69 → 71 pgTAP files / 54 → 55 concurrency cases**.

| Leg | At base `ccb4804` (evidence `bb40021`) | At the 8A evidence head `4d166c0` |
|---|---|---|
| migrations (clean leg, exact) | 74 | **76** |
| pgTAP | 69 files, Σ 1,809 | **71 files, Σ 1,863** (by run) |
| concurrency (teed) | 82/82 across 54 cases | **83/83 across 55 cases** |
| `db:verify --fail-on warning` | NOT RUN since 7A (ADR-0038's re-rule) | **clean — *No schema errors found*** |
| upgrade leg | NOT RUN since 7A | **green — 74 → `migration up` → 76, then **1,863 PASS + 83/83 on the UPGRADED database**** |
| vitest | 1436 across 101 files | **1439 across 101 files** (by run) |
| lint · typecheck · production build | clean | **exit 0 / exit 0 / exit 0 (78 routes, compiled in 21.4 s)** |
| gitleaks | clean | **651 commits scanned, no leaks found** |
| local browser gate | 58/58 in 8 files, 1,766 s | **58/58 in 8 files, 1,284 s — 0 unexpected · 0 flaky · 0 skipped** |

Recorded so they are not rediscovered: **(1)** the concurrency harness ran
on the **M1-only** database before M2 was applied, because cases 29 and 31
mint `raise_grant` tokens whose targets change with M2 — the case-55 commit
records 83/83 at M1, and the closure re-run at the head is the record;
**(2)** `041` run single-file on the SHARED database aborted at 1/8 on a
one-row subquery over `public.outbound_mail` that met 36 rows of harness
residue — drift, not a defect (traps §7), and clean on the reset leg;
**(3)** `scripts/preflight.mjs` blocks once after every commit (exit 5, a
moved HEAD) and a report-only re-run acknowledges it — each stack command
in this build ran through it; **(4)** the host sat at ~440 MiB free with
the stack lean while the DB legs ran — the gate's 1.2 GiB floor (Q7) is
measured before the gate and stated in the packet.

## D9 — Narrowings and what is NOT claimed, named

1. **TSK-05 flips at the pgTAP layer only.** Its app and e2e halves are
   8C's (the plan's Q1: `slice/8c-claim-log-app`, round 30); no surface
   offers a claim yet, and the log page renders `task_claimed` through its
   generic sentence — 8C words it. **Q-G.**
2. **STP-03 flips at the pgTAP layer.** The row's layer is `pgTAP + app`;
   the app half is BUILT (D6) and driven by the PPL-02 leg inside the
   closure gate, and is recorded in the cell, not claimed as the flip — the
   kickoff's *"flipped at the pgTAP layer only, never early"*; the round
   rules whether the leg inside the complete run is the app half's flip.
   **Q-F.**
3. **The freeze is unnamed on a claim** (D2) — a ruled shape, recorded here
   so 8C does not re-derive it as a defect.
4. **GRT-01, STP-01 and STP-02 are amended, never rewritten:** their cells
   say `member:subject:domain` and now carry a marker that the binding is
   `member:subject:domain:level` since M2, with 071 as the pin.
5. **No in-flight token exists** — asserted by ruling (nothing is
   production-activated), and the old shape is refused rather than
   tolerated (071:9). A live deployment would need a mint-site deploy in
   the same release as the migration; there is none.
6. **M3 and M4 close UNCONSUMED unless their named conditions arise**;
   anything past ≤ 4 is a recorded owner amendment before a line is
   written. `PROMPT_VERSION` `hc-6b-3` unmoved; `lib/ai/` untouched;
   dependencies 0 (13/15 dev, the reserve UNSPENT); G4/G7 block; G9 OPEN;
   the band allowlist EMPTY; SIG-01 NOT absorbed; G12-01 `pending` at
   `gate`.

---

## Questions for round 28 (the packet carries the recommended answers)

**Q-A** the freeze unnamed on a claim — one shape through `visible_at`
(D2) · **Q-B** *hers already* refuses rather than no-ops (D4) · **Q-C** a
caregiver claims a task shared to her BY NAME, because the share already
gives `view` (D1) · **Q-D** the binding REPLACED: the three-part token
refused outright, no compatibility arm (D5) · **Q-E** the case-55 commit's
tally measured at M1, the head's re-run the record (D8) · **Q-F** STP-03's
app half — built and driven, recorded not flipped (D6, D9.2) · **Q-G**
`task_claimed` renders generically until 8C words it (D9.1).
