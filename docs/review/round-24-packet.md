# Third-party review packet — round 24: the built slice 7A, the four destinations' database increment

**Read this file first, top to bottom.** The head ledger is at the top by
design, the tree binding is stated per directory, and every evidence leg
below was produced at ONE declared head. **A packet cannot name its own SHA**,
so the last row of the ledger is a RULE, checkable at any future head.

**SETTLED, except what this packet puts.** The slice-7 plan is RULED
(Q1–Q6, 2026-08-28); the process retune binds (PR #24); the tier is T1; the
migration bound is ≤ 6 with M5 reserved and M6 named-and-not-taken; the
one-round-trip window is ACCEPTED (LOG-03). None of that is open here.

---

## Head ledger — from the start

| Purpose | SHA | Tree relationship |
|---|---|---|
| Base | `da51c00` | `origin/main` — PR #25, the 7A kickoff; one docs-only merge past the `ba80ec0` the kickoff named |
| Evidence head | `4cc3aa0` | **the last commit that moved a non-docs tree** — nine build commits from base (four red→green pairs + the concurrency cases) |
| Docs head | the commit after `4cc3aa0` | ADR-0032, `docs/coverage.md` § 7, `docs/owed.md` OW-04, this packet, the PR body and the round-24 kickoff — **docs-only** |

**The rule that replaces a SHA:** every commit after the evidence head is
docs-only. Verify it — do not take it:

```
git diff --name-only 4cc3aa0..HEAD -- . ':(exclude)docs'
```

returning **empty**. Per-directory tree binding between the evidence head
and the docs head: `supabase/` unchanged · `scripts/` unchanged · `app/`
unchanged · `lib/` unchanged · `e2e/` unchanged · `tests/` unchanged ·
`docs/` moved. So every leg below binds at the docs head.

**Documents that moved after the evidence head:**
`docs/adr/0032-7a-destinations-db-deltas.md` (new), `docs/coverage.md`
(the `## 7` section; SHR-02 flipped at the pgTAP layer), `docs/owed.md`
(OW-04's LOG-03 fact), `docs/review/round-24-packet.md` (this file),
`docs/review/round-24-pr-body.md`, `docs/review/round-24-kickoff.md`.

---

## What 7A is

§11.1 row 7's four surfaces are "written by slice 6's approvals". 7A is the
half that lets a person ACT on them, and five gaps were verified against the
tree before a line was written:

1. **No path, at any layer, let a person assign, claim, complete or snooze a
   task.** `authenticated` holds SELECT alone on `tasks`; `revise_object`'s
   allowlist is `title, detail, due_on, due_zone`; `owner_member_id` was
   written only by `remove_member`'s side effect (clearing it).
2. **Nothing computed the audience of a category move** — who gains, who
   loses — and nothing moved category and taint together.
3. **A share could be revoked only inside `remove_member`** and the
   security-notice path: "revocable in one action" had no action.
4. **A coordinator could not read another member's grants**
   (`access_grants_select_own`) and nobody could list invites.
5. **`provenance_edges` and `object_shares` had no member-facing read.**

**Nothing is production-activated.** G4/G7 block, G9 stays OPEN,
`BAND_ARTIFACT_ALLOWLIST` stays EMPTY, SIG-01 is NOT absorbed (fourth slice
running), no credential exists in CI or the gate, `PROMPT_VERSION`
`hc-6b-3+ff1435280a36f8eb` does not move. **Zero dependencies were added**,
runtime or dev.

---

## Migration map — 4 of the ≤ 6 plan bound (Q2)

| # | File | What it does |
|---|---|---|
| M1 | `20260829120001_task_assignment` | `hc.assign_task` / `hc.unassign_task`; `tasks.written_from_task_id`; the claim machinery widened by the instruction's exact shape (`tasks_internal_write_instruction`, one branch in `hc.assert_claimed`) |
| M2 | `20260829120002_task_lifecycle` | `hc.complete_task` / `hc.snooze_task` + the owner-only `hc.may_act_on_task` |
| M3 | `20260829120003_document_audience` | `hc.document_audience` / `hc.recategorize_document` / `hc.revoke_share` + two owner-only halves |
| M4 | `20260829120004_record_reads` | `hc.circle_people(circle)` / `hc.document_references` / `hc.shares_for` / `hc.shares_for_member` + two owner-only halves; **no policy moves** |
| M5 | *(reserved)* | round-24 dispositions — the standing precedent since 2A |
| M6 | *(reserved, NAMED)* | **closes UNCONSUMED** — Q2 ruled the one-round-trip window ACCEPTED; LOG-03 carries it |

The tree moves **69 → 73 migrations / 65 → 69 pgTAP files / 49 → 53
concurrency cases**. Event types 23 → 27. `hc` functions +16 (11 definers,
5 owner-only halves). No shipped migration was edited; `assert_claimed`'s
body was replaced in the 2A M8 way with its attributes restated.

---

## Red→green history (each red commit names its failure signatures)

| Commit | Leg |
|---|---|
| `c0e9fe4` | **red M1** — 45 of 50; `42883 hc.assign_task(…)` ×18, `42703 column t.written_from_task_id` ×6 |
| `c1b7f7b` | **green M1** — 066 at 52 of 52 (plan 50 → 52: two reads moved out of `call_as`, the table holds no `authenticated` grant) |
| `dfa68d5` | **red M2** — 28 of 29; `42883` on both |
| `69ccfea` | **green M2** — 067 at 30 of 30 |
| `d5a2c98` | **red M3** — 27 of 29; `42883` on all three |
| `fa057d6` | **green M3** — 068 at 29 of 29 |
| `443930a` | **red M4** — 9 of 9 RUN; the run aborted at case 10 on the test's own unset `t.s2`; **the message's "27 of 28" is overstated and corrected in `fcc322b`** |
| `fcc322b` | **green M4** — 069 at 28 of 28 |
| `4cc3aa0` | the four concurrency cases (50–53), teed 81/81 |

---

## Defects found and handled inside the slice

**1. A dropped SECURITY DEFINER, caught by 002.** M1's `create or replace
function hc.assert_claimed()` was first written without `security definer`;
`20260815230010` had ALTERed it on (deferred triggers fire as the committing
role). 002 test 3 went red on the count and the diff named it; restated with
owner and revokes in the same commit (ADR-0032 D2).

**2. `unassign_task` refused under a freeze.** The first body authorized on
`hc.visible_at` alone, which is hidden for everyone under a freeze, so a
coordinator could not reduce reach mid-freeze — the opposite of
`remove_member`. 066:50 caught it; the coordinator door was added (D4).

**3. Four `->>` precedence errors and one InitPlan ordering error in the
tests' own probes** (067:17/22, 068:13/21/22, 067:22 split) — the functions
were right, the probes were not; each fixed in its green commit and named
there.

**4. The 069 red run aborted on its own fixture** (an unset setting) — the
message overstates the run; corrected on the record in `fcc322b` and
ADR-0032 D10. The fixed test's red state was not re-measured.

**5. Thirteen exact-set re-pins, every one caught by the suite** (ADR-0032
D9): 001 once, 002 four sets across four migrations, 007 four times.

---

## Verification evidence (local, ONE declared head: `4cc3aa0`)

Complete summary lines, no grep-filtered chains. Every leg was produced at
`4cc3aa0`'s tree; the docs commits after it move no directory any leg binds
to.

- **Clean leg:** `npm run db:reset` → `node scripts/verify-migration-state.mjs
  supabase/migrations` → `migration state exact: 73 applied ==
  supabase/migrations` → `npm run test:db` → `All tests successful.
  Files=69, Tests=1761 … Result: PASS` → `npm run test:concurrency` (teed) →
  `81/81 concurrency assertions passed`, zero `NOT OK` (case 1's `40P01`s
  are the deliberate PLT-02 repro) → `npm run db:verify` → `No schema errors
  found` under `--fail-on warning`.
- **Upgrade leg (the `ci.yml` rehearsal, run locally through the preflight
  runner):** worktree @ `da51c00` → base reset → verifier exact **69 == 69**
  → `npx supabase migration up` (exactly the four 7A migrations, in order)
  → verifier exact **73 == 73** → `test:db` `Files=69, Tests=1761 … PASS` →
  `test:concurrency` **81/81** — against the UPGRADED database; worktree
  removed.
- **vitest:** `Test Files 79 passed (79) · Tests 982 passed (982)` — 7A
  authors no app unit. **Re-run at the docs head** for
  `tests/lint/process.test.ts` (the coverage, owed and kickoff invariants):
  `Test Files 79 passed (79) · Tests 982 passed (982)`. That docs-head run
  is the THIRD attempt and the two before it are recorded, not diagnosed:
  attempt 1 HUNG after ~40 files (no tally; the vitest main and one forks
  worker were still alive ten minutes later and were killed as orphans);
  attempt 2 reported `1 failed | 78 passed`, `972 passed | 10 skipped` —
  `tests/hc/ingest.test.ts`'s `beforeAll` (live-DB fixtures) timed out at
  10 000 ms. Classified before the third run: the file alone passes
  **10/10 in 2.24 s**, the database and `hc_clamd` were idle (0.2 % / 0.02 %
  CPU), `pg_stat_activity` held five connections. **UNREPRODUCED TRANSIENTS
  — a hang and a hook timeout under load — not claimed as diagnosed** (the
  6A precedent, ADR-0024 D12).
- **lint · typecheck:** clean, each run solo.
- **Production build:** `✓ Compiled successfully`, **zero `Can't resolve`**
  (the ADR-0027 D11 assertion) — run in the primary tree detached at
  `4cc3aa0`, because Turbopack refuses a worktree's `node_modules` junction
  (*"Symlink [project]/node_modules is invalid, it points out of the
  filesystem root"*); the tree built is `4cc3aa0`'s by construction.
- **gitleaks** (the digest-pinned image `ci.yml` uses): `505 commits
  scanned` · `no leaks found` — from the primary repo with `--log-opts`
  naming the branch; against a worktree the same image scans **0 commits**
  (its `.git` is a pointer the container cannot follow).
- **Local browser gate (LOCAL-only, never CI): 38 legs — NOT RUN at this
  head.** None of `app/`, `lib/`, `e2e/` moved (`git diff --name-only
  da51c00..4cc3aa0` is `supabase/migrations` ×4, `supabase/tests` ×8,
  `scripts/concurrency/run.mjs`, and nothing else); the kickoff's exit rule
  binds the gate to those three directories. `supabase/` DID move, and the
  6A precedent ran the gate on that ground — **Q-G puts the choice to the
  round rather than letting the build pick.** The total is stated exactly:
  38, last run 38/38 at `3c39e23`.

No transient was observed in any DB, lint, build or scan leg above; the two
vitest transients at the docs head are recorded in the vitest bullet.

---

## Pointed questions for round 24 (recommended answers inline)

**Q-A · The holder completes and snoozes at `summary`, where PRD §7.3 names
`view`.** The care ceiling IS `summary` and a caregiver's slice is her
assigned tasks; a `view` bar leaves every task handed to a caregiver, and
every path-1 instruction, readable and never finishable, and the family
default unable to close a task handed to a sibling (AC-TASK-1). A
non-holder below manage is refused whatever her level (067:6–7, 27).
**Recommended: RATIFY the holder-at-summary line** and record it against
§7.3 as the as-built reading.

**Q-B · `hc.circle_people(circle)` where the plan writes `()`.** A person may
belong to several circles (§8.12); a no-argument form would merge lists or
pick one. **Recommended: RATIFY the circle argument** — the surface is a
page of one circle.

**Q-C · Other members' levels are NULL for a non-coordinator.** §4.6.1's
plain line is "the truth the family reads", but `access_grants_select_own`
has said since 1A that a member reads her own grants; the build failed
closed: a coordinator reads everyone's, a family member her own and the
subjects' standing (069:11–12). **Recommended: CONFIRM**, and let 7C decide
whether the People page for a non-coordinator shows names without levels.

**Q-D · Two `audience_changed` entries per move.** The person's (both
audiences by name, gained/lost) and the taint machinery's (actor
"Reclassification", the taint sets) — because the move reuses the ONE
shrinking path rather than re-implementing it (068:19). **Recommended: keep
both at 7A; at M5 either suppress the machinery's inside this call or
leave it as the recompute's own record** — the author leans to leaving it.

**Q-E · `shares_for` lists an object's shares for a MANAGE-holder only, and
returns zero rows below.** §4.3.4 puts "who it has been shared with, and a
control to unshare" on the document detail; the list of who else can read
a thing is treated as the manage-holder's control surface, not a `view`
reader's fact. **Recommended: CONFIRM** — the 7C detail page renders the
list only where the control exists.

**Q-F · Reduction under a freeze.** `unassign_task` lets a live coordinator
reduce under a freeze (`visible_at` is hidden for everyone, so the
coordinator check is the only door — `remove_member`'s shape); `revoke_share`
checks no freeze at all; `assign_task` and `recategorize_document` refuse
with the named signature. **Recommended: RATIFY** — containment never
blocks reduction, and widening never proceeds under one.

**Q-G · The browser gate was not run at a head where `supabase/` moved.**
The kickoff binds the gate to `app/ lib/ e2e/`; the 6A precedent ran it on
`supabase/` alone and it was RED for suite reasons, three runs, no code
channel. The DDL here adds a column to `tasks` and functions the app does
not call; the existing pages' reads are unchanged. **Recommended: ACCEPT
the kickoff's rule for 7A, and have 7B's first gate run — which must happen
anyway — stand as the browser evidence over this DDL.** If the round rules
otherwise, the gate runs at the dispositions head.

**Q-H · Claim (self-assignment) is absent.** PRD §4.5.1 lists "Claims"; no
7A function lets a member below manage assign a task to herself. The plan's
Q2 row does not name it and the build failed closed. **Recommended: rule
it at M5 as `assign_task(task, own member)` permitted at `view` on the
task when nobody holds it** — §7.3's `view` completes work assigned to her;
taking on nobody's work is the smaller act — or defer it to 7B's plan.

---

## Coverage rows

`docs/coverage.md` gains `## 7 — the four destinations` with **twenty-one
rows opening** (the plan's table, minus the four that already existed).
Only what this layer proves is flipped: the pgTAP halves of **TSK-01,
TSK-02, DOC-03, DOC-04** are green with their app halves named as owed;
**SHR-02 flips at the pgTAP layer** (line 205, pending since 1D). Everything
app-shaped is `pending` tagged 7B/7C. **RCP-02 and A11Y-09/10/11 do not
move.** **LOG-03 opens `pending` and is never green** — the accepted-risk
row Q2 ruled for; OW-04 in `docs/owed.md` now names it as opened.

---

## What is NOT claimed

- No app surface, no route, no e2e leg — 7B/7C.
- The browser gate at this head (Q-G).
- Claim / self-assignment (Q-H); the AI has no path into any of it.
- A non-coordinator's view of others' levels (Q-C).
- `hc.document_audience` on unresolved lineage is read as "resolved after
  the move" — an unresolved document opening up is reported as an audience
  change; the recompute is what makes it true.
- The instruction task left open by `remove_member`'s own unassign (it
  clears the original's holder and leaves the instruction row open and
  unowned, surfacing for the coordinator) — recorded, not changed.
- M5 is unspent; nothing here forecloses its content.

---

## Addendum — auditability block

- **Local evidence:** at `4cc3aa0`'s tree, quoted verbatim above.
- **PR:** opened from the build session as `[DO NOT MERGE without owner
  sign-off] …`, base `main`, head `slice/7-destinations`; the head SHA and
  commit count are read from the API at the moment they matter, never from
  this file (the round-17 F-4 lesson). GitHub's "Able to merge" is
  mechanical — no conflicts, not ADR-0006 satisfied.
- **Pins:** no drift — Supabase CLI as pinned, image
  `public.ecr.aws/supabase/postgres:17.6.1.106`, Node 22.15.0.
- **Commands per leg:** `npm run db:reset` · `node
  scripts/verify-migration-state.mjs supabase/migrations` · `npm run
  test:db` · `npm run test:concurrency` (teed) · `npm run db:verify` · the
  upgrade leg per `ci.yml` through `scripts/preflight.mjs` · `npm run
  test:app` · `npm run lint` · `npm run typecheck` · `npm run build` ·
  gitleaks via the digest-pinned image with `--log-opts`.
- **A standing transient to expect in CI:** a "Start local Postgres"
  `toomanyrequests` failure is the ECR Public anonymous quota, never a repo
  defect — re-run later.
- **CI does not run the browser gate**, and `gh` stays UNAUTHENTICATED for
  the reviewer: per-step conclusions are readable, suite tallies are not.
