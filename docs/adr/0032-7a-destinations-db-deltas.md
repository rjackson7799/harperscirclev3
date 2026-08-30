# ADR-0032 — Slice 7A: the four destinations, database increment — design decisions and deltas as built

**Status:** proposed — the 7A build record, put to round 24.
**Branch:** `slice/7-destinations`, from `origin/main` @ `da51c00` (PR #25,
the 7A kickoff — one docs-only merge past the `ba80ec0` the kickoff named;
nothing under `supabase/`, `lib/` or `app/` moved between them).
**Date:** 2026-08-29. **Tier:** T1, ruled at the plan gate (Q3).
**Scope:** four migrations `20260829120001`–`120004` (M1–M4 of the ≤ 6
bound, the plan's Q2 table as ruled — with the departures recorded in D5, D6
and D7, and D6's shared preview/move gate RATIFIED at ADR-0033 D19.15 over the
BINDING row's "coordinator-readable preview"); **M5 stays reserved** for the round-24
dispositions; **M6 closes UNCONSUMED** (Q2: the window ACCEPTED, LOG-03 opens
never green). Authority order: the plan (M-rows BINDING) → TSD §3.5–§3.7,
§2.6, §7.1 → PRD §4.3, §4.5, §4.6, §7.3–§7.6 → ADR-0027/0028's inherited
items as placed by Q4 → `docs/coverage.md` row conventions. The narrative —
what stood in the way, the red→green history — is the packet's
(`docs/review/round-24-packet.md`); this file holds the decisions.
**Zero dependencies added. Nothing is production-activated.**

---

## The commits

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| M1 `task_assignment` | `c0e9fe4` | `c1b7f7b` | 45 of 50: `42883 hc.assign_task(…)` ×18 · `42703 column t.written_from_task_id` ×6 |
| M2 `task_lifecycle` | `dfa68d5` | `69ccfea` | 28 of 29: `42883` on both functions |
| M3 `document_audience` | `d5a2c98` | `fa057d6` | 27 of 29: `42883` on all three |
| M4 `record_reads` | `443930a` | `fcc322b` | 9 of 9 RUN: `42883 hc.circle_people(…)` — **the run aborted at case 10 on the test's own unset `t.s2`**; the message's "27 of 28" is corrected in the green commit (D10) |
| concurrency 50–53 | — | `4cc3aa0` | teed, 81/81 |

---

## D1 — M1: the assignee's taint from HER OWN vectors, as she meets the policy

`hc.assign_task` asks `hc.visible_at(hc.ctx_for(assignee), …, 'task', id,
p_owner_member = the assignee)` — never the caller's context, and with the
assignee as owner so rung 4's own-task exception answers for a caregiver
exactly as `tasks_select` will. No context on the subject ⇒ refused, no path
offered (§4.5.5). Clears the taint at ≥ summary ⇒ plain, and a path supplied
there is REFUSED — path 1 would otherwise be a task-creation channel around
`hc.approve_proposal`. Cannot clear ⇒ exactly one of §4.5.6's two paths.
**The post-condition is in the function**: after the writes the assignee's
live vectors are re-read and the task — or the instruction — must be visible
to her at summary, or the whole call rolls back (066:24). This is what makes
7B's sentence, rendered from `hc.circle_people`, unable to disagree with the
write.

## D2 — M1: the written instruction is a ROW, not an EDGE

Path 1 writes a new `tasks` row: the typed sentence as title, NOTHING of the
original (066:15), `taint = {schedule}`, `written_for` + the new
`written_from_task_id` (circle-consistent FK, indexed, the pair a CHECK so
half an instruction is unrepresentable, 066:20), approved by the writer, no
arrival and no proposal. Not a `provenance_edges` row: `hc.link_provenance`
grows the child by the parent's surplus and would put `{health}` straight
back on the copy. The ORIGINAL is assigned to her too and keeps its taint —
the assignment is a fact on the original, the instruction is what she reads
(066:17). The 1B claim machinery is widened by exactly the pair + no source:
`tasks_internal_write_instruction` (also pinning the taint) and one branch
in `hc.assert_claimed`. **002 caught the replacement body created WITHOUT
the SECURITY DEFINER `20260815230010` had ALTERed onto it** (deferred
triggers fire as the committing role); restated in the same commit. Rule: a
replaced trigger body carries every attribute a later migration ALTERed on.

## D3 — M1: path 2's token is bound to the PAIR; unassign revokes exactly its own

`share_object` + `task:<id>+document:<id>`: a token minted for one object
cannot be spent on two (066:26–27), nor a pair token on either alone. A live
FOREIGN share on either object is neither duplicated nor adopted (066:34),
which is what lets `unassign_task` revoke exactly its own — SHR-02 both ways
(066:35–41). Reassign revokes the prior assignment's shares and closes its
instruction in one transaction (066:31); a keep list is a coordinator's, and
every kept id must be this assignment's live share (066:43–44).

## D4 — M1/M3: reduction under a freeze is permitted; widening refuses, named

`assign_task` and `recategorize_document` refuse under a freeze with the
NAMED `freeze_active` (they can widen who reads). `unassign_task` lets a
**live coordinator** reduce under one — `visible_at` is hidden for everyone,
so the coordinator check is the only door, exactly `remove_member`'s and
`set_grant`'s lower arm — and `revoke_share` checks no freeze (066:51–52,
068:28–29; the earlier "066:49–50" were red-leg numbers — ADR-0033 R5/F-1). 007's freeze-referent set grew eleven → seventeen.

## D5 — M2: the holder completes at `summary`, and the line is argued

PRD §7.3 says `view` "can complete work assigned to them". The holder acts
at any level at which she sees the task as its holder (≥ summary); a
manage-holder acts for anyone. The care ceiling IS `summary` and a
caregiver's slice is her assigned tasks (§7.4): a `view` bar leaves every
task handed to a caregiver — and every path-1 instruction, which exists so
she can ACT — readable and never finishable, and the family default
(`schedule: summary`) unable to close a task handed to a sibling, AC-TASK-1's
own sentence. A non-holder below manage is refused whatever her level
(067:6–7, 27). **Q-A.** Snooze moves forward only; one revision per snooze
names the actor (§4.5.4).

## D6 — M3: the ONE shrinking path is reused, and the log has two entries

`hc.recategorize_document` rewrites `category` with `title, summary_text` in
its SET list so the 1D builders rebuild `tsv_summary` and the dsc row in the
same transaction (§4.3.6), then calls `hc.reclassify_taint` — the only
shrinking path since 1B M5 — which recomputes the document and every
descendant under the row-scoped marker; `completed:false` rolls the category
back with it. Driven both ways at 068:12/16; the derived task moves with the
document (068:15). The person's `audience_changed` entry carries both
audiences BY NAME plus gained/lost; `reclassify_taint` writes its own beside
it as it always has (068:19). **Q-D.** The preview and the move share one
gate: manage over the document as it stands AND on the destination domain.

## D7 — M4: `circle_people(circle)`, levels fail closed, `shares_for` at manage

The plan writes `hc.circle_people()`; the built signature takes the circle
(a person may belong to several, §8.12; the surface is a page of one).
Levels are the GRANT levels, every domain explicit with `hidden` spelled
out; a frozen circle returns people and no levels. A coordinator reads
everyone's levels; any other member her own and the subjects' standing, NULL
for the rest — null, not hidden (069:12). `shares_for` lists an object's
shares for a MANAGE-holder and returns zero rows, never an error, for the
unmanageable and the nonexistent alike (069:22); `shares_for_member` for a
coordinator or the person herself. `document_references` and
`shares_for_member` are counted-never-named through each object's OWN
policy predicate (`hc.object_label_at`); AC-PERM-10 falls out at the read
(069:20). No policy moved. **Q-B, Q-C, Q-E.** One DECLARED widening: every
member's `accounts.slice` is returned to every member of the circle, which
`accounts_select_self` alone would refuse — `slice` IS a People-list fact (PRD
§4.6.1), and the widening is intended (ADR-0033 D19.13, R4/F-6).

## D8 — Claim (self-assignment) is NOT provided

PRD §4.5.1 lists "Claims"; no 7A function lets a member below manage assign
a task to herself. The plan's Q2 row does not name it and §7.3's `view`
"cannot change others' items" is silent on nobody's items; the build failed
closed. **Q-H: rule for M5 or 7B.**

## D9 — Suite re-pins forced by the increment (all same-commit)

| Pin | Moved | Migration |
|---|---|---|
| `001` `hc.log_event_types` count | 23 → **27** | M1, M2 |
| `002` function inventory | +16 (11 definers + 5 owner-only halves) | M1–M4 |
| `002` SECURITY DEFINER set | seventy-two → **eighty-three** | M1–M4 |
| `002` EXECUTE grant set | +11, all `authenticated`; `hc_pipeline` gains nothing | M1–M4 |
| `002` hc_internal policy list | one hundred three → **one hundred four** | M1 |
| `007` freeze-referent set | eleven → **seventeen** | M1–M4 |

Every one was caught by the suite, including D2's dropped definer. Ordering
traps: `assert_*` < `assign_task`; `document_*` < `dom(`; `reca` < `rece`;
`share_object` < `shares_for`.

## D10 — The bound, the regression net, and three environment facts

**4 of ≤ 6 at this head; expected 5 of ≤ 6 once M5 carries the round-24
dispositions; M6 UNCONSUMED.** The tree moves **69 → 73 migrations / 65 → 69
pgTAP files / 49 → 53 concurrency cases**.

| Leg | At `main` `da51c00` | At the 7A evidence head `4cc3aa0` |
|---|---|---|
| migrations (clean leg, exact) | 69 | **73** |
| pgTAP | 1,622 across 65 files (by discovery) | **1,761 across 69 files** (by run) |
| concurrency (teed) | 75/75 across 49 cases | **81/81 across 53 cases** |
| `db:verify --fail-on warning` | clean | **clean** |
| upgrade leg | green | **green** — 69 → `migration up` → 73, then **1,761 + 81/81 on the UPGRADED database** |
| vitest | 982 across 79 files | **982 across 79 files** (7A authors no app unit) |
| lint · typecheck · production build | clean | **clean**, zero `Can't resolve` |
| gitleaks | clean | **clean** — 505 commits, no leaks |
| local browser gate | 38/38 at `3c39e23` | **38 legs, NOT RUN at this head** — none of `app/ lib/ e2e/` moved; `supabase/` did (Q-G) |

Recorded so they are not rediscovered: (1) the build ran in the primary
tree detached at `4cc3aa0` — Turbopack refuses a worktree's `node_modules`
junction ("points out of the filesystem root"); (2) gitleaks against a
worktree scans **0 commits** (its `.git` is a pointer the container cannot
follow) — run from the primary repo with `--log-opts` naming the branch;
(3) 069's red message overstates its run (the table above); the fixed
test's red state rests on the same `42883` signature, not re-measured.

---

## Questions for round 24 (the packet carries the recommended answers)

**Q-A** the holder at `summary` (D5) · **Q-B** `circle_people(circle)` (D7) ·
**Q-C** others' levels null for non-coordinators (D7) · **Q-D** two
`audience_changed` entries per move (D6) · **Q-E** `shares_for` at manage,
zero rows below (D7) · **Q-F** reduction under a freeze (D4) · **Q-G** the
browser gate not run where `supabase/` moved (D10) · **Q-H** claim absent (D8).
