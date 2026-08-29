# ADR-0033 — round-24 dispositions: the other-family lens (R6), independently re-verified

**Status: PUT, NOT RULED.** Proposed on evidence, awaiting owner sign-off.
**No verdict has moved and nothing in the tree has been changed by this
commit.** Verdicts move in a second commit, after sign-off, each carrying a
pointer back here — the ADR-0025 D6 precedent, as rounds 21, 22 and 23 did.

**Head:** `slice/7-destinations` = `2d5e1ae` (evidence head `4cc3aa0`).
**Base:** `main` = `da51c00`. **Branch:** `docs/round-24-dispositions`.

**Scope — read this before the ballot.** This ADR disposes of **lens R6
only**: the other-family lens, six findings and eight question answers. The
**38 findings of lenses R1–R5** in `docs/review/round-24-findings.md` are
NOT dispositioned here and still owe a ruling before PR #26 merges. This
document is deliberately partial and says so; a later commit on this branch
adds R1-R5, or a separate ADR does. Do not read an empty row as a clean one.

**And R6 corroborates rather than adds (D2a):** ruling R6 does not rule the
in-house rows it agrees with. The verdicts still have to attach to R1-R5's
addresses, which is why D11 puts them as consolidations.

---

## Context — the lens the record said was uncommissioned

`docs/review/round-24-findings.md:91` records that the owner *"may commission
the other-family lens with `references/review-brief.md`"*. Round 24 landed
with five lenses and that sixth one unfilled, and the findings document's
own question grid shows the cost: Q-B, Q-C, Q-E and Q-H each carry at least
one lens answering *"outside"*.

The lens has now been commissioned and returned. It reviewed
`slice/7-destinations` @ `3c396c4` against base `main` @ `da51c00`, with
evidence head `4cc3aa0`, and its verdict is **request changes** — one
BLOCKER, four MAJORs and one MODERATE *"should be ruled and corrected before
merge."*

It is registered as **R6**, continuing R1–R5's numbering. Its findings are
`R6/F-1` … `R6/F-6`.

**The review is current on code.** `git diff --name-only 3c396c4..2d5e1ae`
returns `docs/review/round-24-findings.md` and nothing else, so the one
commit added after the lens read the tree is docs-only. Nothing it examined
has moved.

---

## D1 — how the re-verification was done

Every finding below was re-derived **independently of the lens's prose**,
from the function bodies at the evidence head `4cc3aa0`, before its argument
was accepted. The method was the rounds-21-to-23 method: read the predicate,
not the summary; name the site; and treat every figure in the incoming text
as a checkable prediction rather than a fact.

**Nothing was executed.** No migration was applied, no pgTAP file was run,
no `npm` script was invoked, and the shared database was not reset. Every
statement below is a property of the SQL text at `4cc3aa0`, read with
`git show`. Where a claim depends on runtime behaviour rather than on the
text, the ballot says so.

**All six findings CONFIRM.** Not one was refuted, and all three of the
lens's recorded dissents hold (D9).

**They are corroborations, not discoveries.** Every one of R6's six findings
restates a defect lenses R1-R5 had already found and probed, and the
round's own corroboration map
(`docs/review/round-24-findings.md:128-136`) names each cluster. That is
not a deduction from R6's value — it is the opposite. R6 reached the same
six **independently, from a different model family, with no access to the
in-house probes**, which is the strongest evidence this round has that the
six are real rather than an artefact of one house style. D2a maps them.

The lens's structural claims were checked first, because a lens that
mis-describes the tree is not yet worth reading:

| Claim | Measured | Verdict |
|---|---|---|
| non-docs diff `4cc3aa0..3c396c4` empty | 0 files | holds |
| evidence diff = 4 migrations + `run.mjs` + **7** SQL test files | 001, 002, 007, 066–069 | holds |
| 73 migrations in tree | 73 | holds |
| 69 pgTAP files in tree | 69 | holds |
| `package.json` did not move | 0 files in diff | holds |
| no pre-7A migration edited | confirmed | holds |

---

## D2a — R6 against R1-R5: six findings, six existing clusters

Mapped against the corroboration map at
`docs/review/round-24-findings.md:128-136`. **R6 opened no new defect
class.** Every row below is a second (or fourth) independent arrival at a
defect already on the round's books.

| R6 | In-house cluster it corroborates | Note |
|---|---|---|
| F-1 BLOCKER | **R1/F-1** (MAJOR), **R4/F-1** (BLOCKER), **R4/F-2** (MAJOR) — *"Existence disclosed at `hidden` by the M4 reads"* | R4/F-1 already carries BLOCKER. R6 agrees on severity and mechanism |
| F-2 MAJOR | **R1/F-2**, **R2/F-1** (both MAJOR), **R3/F-2** | *"All three cite case 52(b)'s manual revoke as the tree's own evidence"* — R6 makes four |
| F-3 MAJOR | **R2/F-2** — the unresolved-document `lost` list | was a **single-lens** MAJOR; R6 makes it two |
| F-4 MAJOR | **R3/F-1** — the unreachable no-context gate | was a **single-lens** MAJOR; R6 makes it two |
| F-5 MAJOR | **R1/F-3, R1/F-4, R2/F-4, R2/F-5, R2/F-8, R2/F-10, R3/F-5** — *"the post-condition is point-in-time"* | R6 isolates `revoke_share` as the cleanest instance |
| F-6 MODERATE | same cluster — *"the instruction row is an unguarded target"* | R6 rates it MODERATE where the cluster rates parts MAJOR |
| Q-F dissent | **R1/F-5** | two lenses, independently |
| dissent 1 | **R5/F-3** (MINOR), and R1's `×7` correction at `:156` | see D9 |

**What this changes about the ballot.** Two findings that were *single-lens*
MAJORs — R2/F-2 and R3/F-1 — are now corroborated across families. Under the
round's own consolidation rule, R6's rows should be **ruled together with
the in-house rows they agree with, one verdict per cluster with both
addresses named**, rather than as a separate class of six. D11 puts them
that way.

---

## D2 — R6/F-1 (BLOCKER): `hidden` discloses existence and type in M4's two readers

**The property under test.** `hidden` means no existence disclosure *"in any
surface, in any count"*; `log` is the first rung permitted to reveal that an
object is there. A reader below `log` must not learn that an object exists.

**Verified at `4cc3aa0`:**

- `supabase/migrations/20260829120004_record_reads.sql:234`
  (`hc.document_references`) — the projection is
  `join lateral hc.object_label_at(v_ctx, r.otype, r.oid) x on true`, an
  INNER join, and `hc.object_label_at` (`:98`) applies **no level filter at
  all**: it returns a row for any existing, undeleted object. The select
  emits `r.otype` **unconditionally** and suppresses only `object_id` and
  `label`, under `case when x.level >= x.need`.
- `:362` (`hc.shares_for_member`) — the identical shape: `sh.object_type` is
  emitted unconditionally, `object_id` and `label` are nulled together.
- `hc.access_level` is `('hidden','log','summary','view','manage')` and
  `x.need` is `'summary'` for document/task/timeline_event/episode
  (`'view'` for profile_fact). So `level >= need` is false for **both**
  `hidden` and `log`, and the two are handled identically — which is
  precisely the conflation.

**The disclosure is real, not theoretical.** `hc.ladder`
(`20260815200002_enums_and_pure_fns.sql:59`) resolves by **set containment**:
`p_taint <@ hc.dom(p_s -> 'log')`. A caller holding no grant at all on one
domain of a multi-domain taint fails containment at every rung and lands on
`hidden`, not `log`.

**The suite asserts the defect as correct.** This is the part that makes it a
BLOCKER rather than a patch:

- `supabase/tests/069_record_reads.sql`, assertion **18** — Priya reads a
  medical document at health `summary`; the derived task carries
  `{schedule,health}` and she holds **no schedule**. Her level is therefore
  `hidden`. The assertion nonetheless expects
  `task:NULL:false:false,…,profile_fact:NULL:false:false` and its own message
  reads *"both are reported as existing and neither is named nor handed to
  her."*
- assertion **20** — Ruth reads the document through a NAMED SHARE at
  `view`, and every derived object is *"counted and not named, because a
  share never propagates"* — `task:false,timeline_event:false,profile_fact:false`.
- assertion **28** — the same for Kim on an unresolved-lineage document
  hidden from her by rung 3, *"her own share is reported as existing."*

R6 cited 18 and 28; R1/R4 cited 18 and 20. **All three pin it**, and the fix
has to rewrite 18, 20 and 28 together.

Both tests pass today. Correcting the code turns them red, so this cannot be
a quiet fix: the `hidden`/`log` line has to be ruled and 069 rewritten in the
same act.

**No DDL.** Filter rows below `log`; keep the unnamed, count-only projection
for `log <= level < need`, which is what the `:267` comment
(*"counted, never named"*) already intends.

**PROPOSED: ACCEPT the finding; RULE the line as the lens states it —
`hidden` yields no row at all, `log` yields the unnamed row — and FIX both
readers plus 069:18 and 069:28 before merge.**

---

## D3 — R6/F-2 (MAJOR): a kept share is revoked by a later assignment cycle

**The property under test.** *"Unassign revokes exactly its own shares"*, and
a coordinator may explicitly keep one (SHR-02, the `remove_member`
precedent).

**Verified at `4cc3aa0`, `supabase/migrations/20260829120001_task_assignment.sql`:**

- `:558` — unassign revokes
  `where sh.created_by_assignment_of = p_task and sh.revoked_at is null and
  not (sh.id = any (v_keep))`. The kept row survives, and **nothing clears
  its `created_by_assignment_of`** — it still carries this task's id.
- `:333` — the reassign path revokes
  `where sh.created_by_assignment_of = p_task and sh.revoked_at is null`,
  with **no keep list**. The design comment at `:79` states the intent
  plainly: *"no keep list on a reassign — the new person gets their own
  act."*

So the marker means "created by *an* assignment of this task", not "created
by *this* assignment cycle", and the reassign loop cannot tell a live cycle's
share from a previous cycle's deliberately retained one.

**Failure path, at the predicate level.** Assign T to Lena by path 2;
unassign keeping Lena's document share; assign T to Ruth; reassign T to Dan.
The reassign's `update` matches Lena's kept row and revokes it, logging an
`object_share_revoked` naming her — an access reduction nobody asked for.

**Why the suite misses it.** `066:38-41` checks immediate survival only. The
concurrency harness is more pointed: `scripts/concurrency/run.mjs`, case 52
part (b), executes
`update public.object_shares set revoked_at = now() where id = $1` between
the two cycles, commented *"The kept document share from (a) is revoked first
so this assignment can create its own."* The exact state that exposes the
defect is cleared by hand before the second cycle starts.

**No DDL** on the lens's preferred fix: `created_by_assignment_of` is already
nullable (a foreign share carries it null — `:59`, and *"a foreign share
never matches"* at `:554`), so "keep" can clear the marker and convert the
row into an independent share. DDL would be needed only if the product must
retain both original-assignment provenance *and* a distinct active-cycle
identity — which is a product question, not a defect.

**PROPOSED: ACCEPT; FIX by clearing the marker on keep; extend 066 with a
second-cycle case and stop case 52(b) from clearing the state it should be
testing.**

---

## D4 — R6/F-3 (MAJOR): the audience log can contradict itself on an unresolved move

**The property under test.** A person's `audience_changed` entry carries
truthful before/after audiences and a truthful `gained`/`lost`.

**Verified at `4cc3aa0`,
`supabase/migrations/20260829120003_document_audience.sql`:**

- `:272` — after recomputation,
  `select d.taint, d.taint_resolved into v_taint_after, v_doc.taint_resolved`
  **overwrites** `v_doc.taint_resolved` with the after-state value.
- `:285-286` — the after-audience call is
  `hc.document_audience_rows(p_document, v_taint_before, v_doc.taint_resolved,
  v_taint_after, v_doc.taint_resolved)`: the **same variable** is passed as
  both the before-flag (argument 3) and the after-flag (argument 5). `r.before`
  is therefore computed with the *after*-state resolved flag, and `lost` is
  derived from it — `filter (where r.before > 'hidden' and r.after = 'hidden')`.
- `:255` — `v_before`, by contrast, was built **before** the overwrite, with
  the true original flag.

One log entry can therefore omit a person from `audience_before` while naming
that same person in `lost`. Rung 3 of `hc.visible_at` is what makes this
reachable: unresolved lineage is `manage`-on-all-five or `hidden`, so
resolving a document during recategorisation flips a whole class of readers
from `hidden` to visible, and the before-state computed with the after-flag
misattributes them.

**Why the suite misses it.** `068` moves only resolved documents; the
unresolved fixture in `069` is read but never recategorised.

**No DDL.** Preserve a separate `v_resolved_before` and pass the true flags;
add an unresolved-move case to 068.

**PROPOSED: ACCEPT; FIX as stated.**

---

## D5 — R6/F-4 (MAJOR): the "no context on the subject" refusal is unreachable

**The property under test.** `assign_task`'s documented branch — *"No context
on the subject at all ⇒ refused, no path offered (PRD §4.5.5)"* — must fire
for an assignee with no access context on the subject.

**Verified at `4cc3aa0`:**

- `20260829120001_task_assignment.sql:281` — the guard is
  `if v_ctx_a -> 'subjects' -> v_task.subject_id::text is null then raise`.
- `20260815200007_ctx.sql:45` — `hc.grant_vectors` is
  `from public.circle_members m join public.subjects s on s.circle_id =
  m.circle_id …` with the grants attached by **`left join lateral`** whose
  aggregates are `coalesce(…, '[]'::jsonb)`. Every live member therefore gets
  a subject entry for every live subject in their circle, **with empty grant
  arrays when they hold nothing**.
- `ctx_for` (`20260815230009_freeze_carveout_presence.sql:168`) builds
  `'subjects'` directly from `grant_vectors`.

The subject key is thus never null for a live member of the subject's
circle — and `:242-249` has already refused any assignee who is not one
(`m.circle_id = v_task.circle_id and m.removed_at is null and m.account_id is
not null`). The branch is dead for exactly the population it names.

**What follows from it.** With empty vectors `hc.ladder` returns `hidden`, so
`visible_at < 'summary'` and control reaches the path-2 arm; clause 5 of
`visible_at` then widens the two named objects to `view`, the post-condition
passes, and a member with no deliberate grant anywhere on the subject holds
the task. The refusal that was supposed to stop this never had a chance to.

**Why the suite misses it.** `066:12` asserts only the generic
`assign_refused`, which the instruction path can also raise later for a
different reason (the assignee cannot see `{schedule}`); it does not prove
which branch fired. No zero-grant path-2 case exists.

**This one needs a ruling before it can be fixed.** "Context on the subject"
has to be *defined* before it can be tested. The lens proposes *at least one
deliberate `log`-or-higher grant*. That is a product question about who may
be handed work at all, and D5 does not presume it.

**No DDL** either way.

**PROPOSED: ACCEPT the mechanism as CONFIRMED; RULE the replacement
predicate; then FIX and test it independently of the path-specific
post-condition.**

---

## D6 — R6/F-5 (MAJOR): `revoke_share` can strand an assigned, invisible task

**The property under test.** *"An assignment never yields a task its holder
cannot see"* (AC-TASK-5), as a standing invariant rather than a momentary
one.

**Verified at `4cc3aa0`,
`20260829120003_document_audience.sql:317` (`hc.revoke_share`):** the body
checks the actor, takes the circle advisory lock, re-reads `for update`, and
authorises *the granter or a live coordinator*. It then executes
`update public.object_shares set revoked_at = v_now where id = p_share_id`.

There is **no** test of `created_by_assignment_of`, **no** re-check of the
holder's remaining visibility, and **no** unassignment. The post-condition
exists only inside `assign_task` (`:79`, *"asserted from the assignee's LIVE
vectors after the writes"*), so it is true at the instant of assignment and
never afterwards.

Revoking the assignment-created **task** share while leaving the document
share live leaves the member as `owner_member_id` of a task she can no longer
read. Shares do not propagate, so nothing restores the path.

**Why the suite misses it.** `066` verifies the immediate post-condition;
`068` verifies share revocation in general. No test composes the two.

**Recorded, related.** The same body carries the freeze behaviour the lens
dissents on at Q-F: `:351` comments *"No freeze check: revocation reduces
reach"*, and `:353` admits the granter as well as any live coordinator. D8
carries that question.

**No DDL.** Three options — refuse standalone revocation of a live
assignment-created share, route it through unassignment, or establish another
visibility path in the same transaction — and choosing among them is a
product decision, so D6 puts the finding, not the remedy.

**PROPOSED: ACCEPT; RULE which of the three remedies; FIX before merge.**

---

## D7 — R6/F-6 (MODERATE): instruction rows are assignable

**The property under test.** *"The assignment is a fact on the original; the
instruction is what she reads"* — the instruction is a derived artefact, not
an independently assignable task.

**Verified at `4cc3aa0`,
`20260829120001_task_assignment.sql`:** neither `hc.assign_task` nor
`hc.unassign_task` rejects a `p_task` whose `written_from_task_id` is
non-null. Across both bodies the column appears only in the
instruction-closing loops (`:349`, `:577`) and the insert column list
(`:368`); it is never a guard. The pair is constrained only to
co-nullity — `:125`,
`check ((written_from_task_id is null) = (written_for_member_id is null))`.

An instruction is therefore accepted anywhere an ordinary task id is. A
coordinator may unassign the instruction while the invisible original stays
assigned, or assign it onward so `owner_member_id` and `written_for_member_id`
name different people — after which unassigning the original cancels the
instruction regardless of who now holds it.

**Why the suite misses it.** `066` never passes an instruction row as `p_task`
to another lifecycle function.

**No DDL.** Refuse both operations on rows with a non-null
`written_from_task_id`, or define linked lifecycle semantics explicitly.

**PROPOSED: ACCEPT; FIX by refusing, unless the owner wants linked
semantics defined instead.**

---

## D8 — the eight pointed questions, with R6 added

R6's answers, set against the R1–R5 grid at
`docs/review/round-24-findings.md:117-124`. **R6 fills four of the gaps** the
missing lens left (Q-B, Q-C, Q-E, Q-H each had at least one `outside`).

| Q | R6's answer | Effect on the grid |
|---|---|---|
| Q-A | RATIFY | joins a clean sweep — now unanimous among all who answered |
| Q-B | RATIFY | fills a gap; R1, R4, R5 already RATIFY. No dissent anywhere |
| Q-C | CONFIRM, **with a 7C constraint**: the UI must render null as *undisclosed*, never as an actual hidden grant | fills a gap and adds a carry-forward obligation |
| Q-D | RATIFY as a record, **with two riders**: consumers must not count both entries as two human recategorisations, and R6/F-3 still requires the human entry to be corrected | consistent with R2/R3's "CONFIRM as a record"; the rider is new |
| Q-E | CONFIRM | fills a gap; joins R1, R3, R5 |
| Q-F | **DISSENT IN PART** — reduction under a freeze is reasonable containment, but the doors admit any live coordinator, and `revoke_share` admits the granter, even where that person may be the objected-to actor | **corroborates R1's DISSENT IN PART (R1/F-5)** independently. Two lenses now dissent on the same point |
| Q-G | **DISSENT** — run the existing 38-leg browser gate once before merge rather than defer the only end-to-end observation to 7B, because `supabase/` moved and a global trigger body was replaced | hardens R5's "DISSENT on the record". R1/R3 ACCEPT, R2/R4 DEFER as outside |
| Q-H | **DISSENT unless explicitly deferred** — "claims" is an express Tasks requirement; omission does not silently remove it | **converges exactly with R5**, whose answer was already *"DEFER to an explicit owner ruling in ADR-0033"* |

**The two that now carry cross-lens dissent — Q-F and Q-G — are the ones
this ADR most needs ruled.** Q-H is not a defect claim: R6 states it becomes
a merge defect only if the owner purports to complete the Tasks action
contract *without* explicitly deferring it. An explicit deferral discharges
it.

---

## D9 — the lens's recorded dissents, checked

R6 recorded three observations outside its findings. They were checked like
everything else.

1. **"The packet says the evidence diff contains eight SQL test files; it
   contains seven." — CONFIRMED, with the referent named.**
   `docs/review/round-24-packet.md:175` reads *"`supabase/migrations` ×4,
   `supabase/tests` ×8, `scripts/concurrency/run.mjs`, and nothing else"*.
   The diff holds **seven** (001, 002, 007, 066–069), so `×8` is wrong and
   R6 is right.

   **This ADR first recorded the opposite, and was wrong to.** The claim was
   searched for as the word "eight" and as "8 sql"; the packet writes it as
   `×8`, so the search missed it and the dissent was written up as having no
   referent. It has one. The erroneous disposition is corrected here rather
   than preserved, because this ballot has not been ruled and a wrong row
   must not go to sign-off.

   R6 is the **third** arrival: **R5/F-3** (MINOR) already names
   `round-24-packet.md:175` among four non-reproducing counts, and **R1**
   carries the same correction at `round-24-findings.md:156`
   (*"the tree binding is `supabase/tests ×7`, not `×8`"*).
   **PROPOSED: ACCEPTED, and consolidated into R5/F-3's verdict** rather
   than ruled separately.
2. **"The full execution tallies were not independently reproduced."** —
   accurate and already the packet's own position; `round-24-findings.md:593`
   records the same limit for R1–R5. **PROPOSED: RECORD, no action.**
3. **"Preview and execution remain separate calls with no version binding …
   7C must not imply that a previously rendered audience preview is a
   transactionally guaranteed confirmation."** — not raised as a defect and
   not treated as one. **PROPOSED: RECORD as a 7C constraint**, alongside
   Q-C's.

---

## D10 — what does NOT move

- **No verdict moves in this commit.** Nothing in `docs/coverage.md`,
  `docs/owed.md` or ADR-0032 has been edited, and no `ADR-0023 D17` row is
  touched — that table is closed at 0 `OWED` and is not in scope.
- **No code, migration or test has been changed.** Every remedy above is
  described, none applied.
- **No DDL is proposed.** All six fixes are function-body, test or
  application-logic changes; the 7A bound stays 4 of ≤ 6 with M5 reserved.
  If the owner prefers the provenance-preserving remedy for R6/F-2, that
  choice — and only that one — would need DDL and a stated amendment first.
- **Lenses R1–R5 are not dispositioned.** Their 38 findings still owe a
  ruling before PR #26 merges. See the scope note at the head of this file.
- **PR #26 stays unmerged.** R6's verdict is *request changes*, and two of
  its six findings cannot be fixed until the owner rules (D5, D6).

---

## D11 — the ballot

1. **R6/F-1 (BLOCKER) ACCEPTED** (D2), and the `hidden`/`log` line RULED as
   the lens states it: below `log`, no row; at `log`, the unnamed row. Fixed
   in both readers, with `069:18` and `069:28` rewritten in the same commit.
2. **R6/F-2 (MAJOR) ACCEPTED** (D3), fixed by clearing
   `created_by_assignment_of` when a share is kept, with a second-cycle test
   and case 52(b) amended to stop clearing the state under test.
3. **R6/F-3 (MAJOR) ACCEPTED** (D4), fixed by preserving the true
   before-state resolved flag, with an unresolved-move case added to 068.
4. **R6/F-4 (MAJOR) ACCEPTED** (D5) — *and the subject-context predicate
   RULED*. The lens proposes "at least one deliberate `log`-or-higher grant";
   this ballot asks the owner to affirm or replace it.
5. **R6/F-5 (MAJOR) ACCEPTED** (D6) — *and the remedy RULED* among: refuse
   standalone revocation of a live assignment-created share; route it through
   unassignment; or re-establish visibility in the same transaction.
6. **R6/F-6 (MODERATE) ACCEPTED** (D7), fixed by refusing assignment and
   unassignment of instruction rows — unless linked lifecycle semantics are
   preferred and defined.
7. **Q-F RULED** (D8) — two lenses now dissent in part. Either the freeze
   doors narrow to exclude the objected-to actor, or the departure from
   *"all interactive access suspended"* is recorded as owner-ruled, with a
   test for the objected-to member.
8. **Q-G RULED** (D8) — run the 38-leg browser gate once before merge, or
   record an owned deferral to 7B against R5/F-2's and R6's dissent.
9. **Q-H RULED** (D8) — add self-claim in M5, or record an explicit, owned
   deferral to 7B. R5 and R6 converge on asking for exactly this.
10. **Q-A, Q-B, Q-C, Q-D, Q-E RATIFIED/CONFIRMED as R6 answers them** (D8),
    carrying Q-C's and Q-D's riders forward as 7C constraints.
11. **R6's first recorded dissent ACCEPTED and CONSOLIDATED into R5/F-3**
    (D9) — `round-24-packet.md:175` does say `supabase/tests ×8` and the
    true count is seven. R6 is the third lens to find it, after R5/F-3 and
    R1. The other two dissents RECORDED, one as a 7C constraint.

On sign-off, a second commit records the accepted verdicts and opens the fix
work; the fixes themselves land on PR #26 before it merges, since R6's
verdict is *request changes*. If any item is not accepted, it is struck from
the fix list here rather than silently dropped, and the scope note in D10 is
re-derived rather than adjusted.
