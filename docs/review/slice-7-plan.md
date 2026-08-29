# Slice 7 — The four destinations: the slice plan

**Status:** **PLANNED — RULED. Q1–Q6 SETTLED 2026-08-28 at the plan
gate** (rulings recorded verbatim below; **every recommendation
accepted** — the slice-5 `561a105` / slice-6 pattern, third time). The
7A build (M1 `task_assignment` FIRST) runs in its own fresh session on
`slice/7-destinations` **after the refreshed `chore/process-retune` PR is
owner-merged (Q3)**; 7B and 7C follow at their own kickoffs. **An
unanswered question would have defaulted to NOT PLANNED; none was left
unanswered.** Written 2026-08-28 in the planning session against `main` @ **`7fdca4e`**
(PR #22, the round-23 markers), whose CI run `33241803339` is **green**.
Four PRs landed on `main` today in sequence — #19 `3c39e23` (the last five
owed rows of ADR-0023 D17), #20 `2a652bd` (R2/F-3's residue,
`PROMPT_VERSION` hc-6b-2 → hc-6b-3), #21 `7b203b2` (round 23, ADR-0031,
owner-ratified), #22 `7fdca4e` (dated markers at the nine falsified sites) —
all merge commits. **The slice-5B queue is CLOSED**: ADR-0023 D17 counted by
ROW at `7fdca4e` under D25's rule, with the parser first reproduced against
D25's own tally at `4f7a9d7` (28·38·21·19·3·2·1·1 = 113, exact) before it was
trusted:

> **113 rows · 67 FIXED · 21 NOTED · 19 ACCEPTED-NOTE · 0 OWED · 3 OWNER
> (R6/F-1, R7/F-1, R8/F-3) · 2 ACCEPTED · 1 DECLINED-and-ACCEPTED (R7/F-6)**

The `OWED` class is empty for the first time since round 16. Slice 7's
review is **round 24**; the next free ADR number is **0032**.

**Authority:** TSD §11.1 row 7 (*"The four destinations — Documents,
Timeline, Tasks, People & roles. Written by slice 6's approvals; People &
roles makes the permission model visible"*) → **PRD §4.3–§4.6 whole**
(§4.3.8 AC-DOC-1…6, §4.4.5 AC-TL-1…4, §4.5.7 AC-TASK-1…7, §4.6.6
AC-PPL-1…7) → **PRD §7 whole** (§7.2 five domains, §7.3 five levels, §7.4
three tiers, §7.6 taint, §7.8 AC-PERM-1…11) → **PRD §4.0** (nav composition
follows access; hiding is never the mechanism) → **TSD §3.3–§3.6** (`hc.visible_at`,
the level→table map, `log`, object shares and why they stop), §2.5 (the
record), §2.8 (the access log), §2.12/§3.11 (storage), §1.3 (the artifact
read), §5.7/§5.8/§5.10 (step-up, revocation across every channel, invites),
§8.7 (the a11y build requirements), **Appendix A.1–A.4** → **G8, G12, G9 and
G3** (§11.2) → **ADR-0031** (round 23: the `OWED` class empty) → ADR-0027 D17
items 1–8 and D22 item 6 (*"REJECTED at this sign-off · TAKEN as a slice-7
scoping question"*) → ADR-0028 D8 and D15 → ADR-0026 (the 6B as-built
record) → **ADR-0006** (owner sole merge authority; merge commit never
squash) → ADR-0025 D6 (*a session records, a round rules*) → `docs/coverage.md`
row conventions → `docs/ops/{ai-provider, e2e-local-gate,
ingestion-deploy, runtime-db-credentials, security-actions-worker}.md`.

**Branches (Q1):** `slice/7-destinations` for 7A (branched from `main` @
`7fdca4e` or later docs-only), `slice/7b-record-app` for 7B and
`slice/7c-documents-people-app` for 7C, each at its own kickoff — the
4A/4B, 5A/5B, 6A/6B naming, extended to a third increment for the reason
Q1 argues. Red→green per unit, the failure signature in every red commit
message, merge commit never squash.

---

## 0. What this slice is, stated before it is planned

**§11.1 row 7 is the first slice in which a family member READS the
record rather than the inbox.** Six slices have moved bytes, drafted
intentions and — since 6B — committed them; not one has shown a person
what the record now holds, who else can see it, or let them act on a task
without a review screen in front of them. Four consequences govern every
decision below.

1. **The writes are shipped; the reads are not — and two of the "live"
   reads are not live.** `documents`, `tasks`, `timeline_events`,
   `episodes` and `profile_facts` have had member-readable policies since
   1B (`20260815230002`: `>= summary`, `profile_facts` at `>= view`).
   `hc.receipt_for` (6A M5) resolves every destination through those very
   predicates. But the two pages the receipt links to — the *"honest
   floors"* the slice-6 plan and RCP-01's cell call *"live RLS reads"* —
   **select columns that do not exist**: `tasks/page.tsx:27` reads
   `state` (the column is `status`); `timeline/page.tsx:29` reads `title,
   happened_on` (the columns are `summary` and `occurred_on`/`local_at`/
   `instant`). PostgREST answers `42703`, both pages discard `error` and
   destructure `{ data }` only, and **both render their empty sentence
   unconditionally** — *"Nothing assigned to you right now."* / *"Nothing on
   the timeline yet."* — for a family with forty tasks. `e2e/review.spec.ts:273-276`
   asserts only that `GET /[circle]/tasks` returns 200, and
   `tests/design/migration.test.tsx:111` mocks the rows by hand with the
   wrong names. **Measured this session against the shipped DDL, not
   inherited.** No verdict moves here (ADR-0025 D6); the fact is recorded,
   and it is 7B's FIRST unit.
2. **People & roles is where the permission model stops being pgTAP rows
   and becomes a sentence a person reads.** §7's five domains, five levels
   and three tiers are enforced today at the row (`hc.visible_at`, the
   003 truth table, 017's twenty ordered pairs, `hc.presence` at `log`).
   The screen must render **only what the policies enforce**: direct
   reads, search (RLS-11a green), presence, the receipt, the access log —
   and **must not** promise the two channels A.3 has not yet reached: the
   send-time notification check and export (**RLS-11b, pending, slice
   2+**). *"Summary only"* is a sentence about reads; the plan draws the
   screen to that line and says so on it.
3. **Documents is the most sensitive material through the ONE byte path.**
   `GET /api/artifact/[id]` (6B B2) is the only route that ever returns a
   byte: session under a 15 s budget → RLS-scoped row → `hc.visible_at ≥
   view` × all five → **clean gate, independently** → **evidence before
   bytes** (`hc.log_artifact_read`, re-proving steps 1–2 in-function) →
   a 30 s service-role URL created and consumed server-side → streamed
   `private, no-store`. Pages ride the same route (`?page=N`, `&text=1`).
   **No second byte path, ever** — the Documents viewer is a consumer of
   that route and the fence test asserts it stays the only one.
4. **The AI is not in this slice.** Every model-facing input is covered by
   `hc-6b-3+ff1435280a36f8eb`; no unit here touches `lib/ai/`, so the pair
   does not move and the G9 blind run stays free to submit (Q6). A signed
   band changes nothing on these four surfaces, by construction (Q4 of the
   slice-6 gate: the band is a property of the calibration, never stored on
   the fact — the destinations render approved objects).

---

## THE HARD GATES — G8, G12, G9 and G3, and how this slice builds under them

**G8 (§7.6, Appendix A.3) is the gate this slice makes visible.** Twenty
ordered pairs are generated from one rule and green at the row (RLS-07,
017:1–5; RLS-11a for search). What slice 7 adds is a *screen* for every
channel A.4 names as an existence oracle that a destination surface
renders: **counts** (Tasks' `Mine · Unassigned · Overdue · All` are
post-filter, never "3 of 11"), **subject-labelled rows** (a hidden object
contributes to no count on any tab), **receipts** (already count-never-name),
**reclassified objects** (Documents' re-categorisation is an audience
change computed and named *before* the move commits — AC-DOC-6), and the
**access log** (denials name the actor and domain, never the object —
LOG-02, green DB-side; the surface renders it). Every pgTAP-green G8 row
gains a rendered-tree assertion at the surface that would leak it.

**G12 is the final gate, not the first check** (§8.7). Slice 7 builds two
of the four surfaces G12-01 is verified on — permissions and document
rendering — and, per the A11Y-07 precedent, **the a11y legs are part of
each increment's definition of done** rather than a follow-up (Q5). The
pinned audit manifest (`e2e/audit-manifest.ts`, 22 entries) grows
mechanically: `tests/design/audit-manifest.test.ts` derives the route set
from the filesystem and fails vitest on every new `page.tsx` until it
names its leg. G12-01 stays `pending` at `gate` — it closes at the gate,
before the first non-founder invitee, not at a green row.

**G9 and G3 stand, and nothing here depends on them.** The G9 gate is
OPEN, `BAND_ARTIFACT_ALLOWLIST` is EMPTY, all-high-risk is the shipping
mode. The owner track runs in parallel — G3's four written terms, then the
BLIND run against `hc-6b-3+ff1435280a36f8eb` (G9-1's sequencing condition
is marked MET at `ai-provider.md:105`). **Slice 7 must not move
`configurationHash()`**: after the first submitted batch a hash move costs
a paid re-run (§6.10, G9-4), and *the name bumps whenever the hash moves*
(ruled three times — ask, never invent). No unit in this plan touches
`lib/ai/`; the constraint is stated so a build session does not
"tidy" something there.

**G4 and G7 still block. Nothing is production-activated.** No real
family data; fixtures only; CI KEYLESS; browser legs LOCAL-gate only.

---

## Migration bound (Q2): **≤ 6** (M1–M4 planned, M5 + M6 reserved and NAMED)

**ADR-0027 D22 item 6 rejected a budget amendment at the round-20 sign-off
and TOOK the question for this gate**, with the owner's reason: *"the
zero-DDL exit has never been evaluated"*. It is evaluated here, twice — once
for D17 item 4 (the only inherited item that might need DDL) and once for
the four surfaces as a whole.

**What the four surfaces genuinely need in the database — verified
against `supabase/migrations` at `7fdca4e`, 69 files exact:**

| Need | What is shipped | Gap |
|---|---|---|
| **Assign / reassign / unassign a task** (PRD §4.5.6, TSD §3.6, AC-TASK-2/6/7; **SHR-02** `pending` since 1D, cell reads *"hc.assign_task / unassign revokes assignment-created shares"*) | `tasks.owner_member_id`, `assigned_by`, `assigned_at`, `written_for_member_id`; `object_shares.created_by_assignment_of`; `task_unassigned` event type; `hc.remove_member` unassigns as a side effect | **`hc.assign_task` and `hc.unassign_task` do not exist** — zero hits across `supabase/`, `lib/`, `app/`. `authenticated` holds SELECT only on `tasks`; `hc.revise_object`'s task allowlist is `title, detail, due_on, due_zone` (`20260825120001:34`). **No path, at any layer, lets a person assign, claim, complete or snooze a task today.** |
| **Complete, snooze** (PRD §4.5.3–§4.5.4, §4.6.4) | `status`, `completed_by/at`, `snooze_count` columns | No writer. Same allowlist. |
| **Re-categorise a document** (PRD §4.3.2 — *"an authorization change, not a filing preference"*; AC-DOC-6) | `documents.category`, `taint`; `hc.sync_search_content`; `audience_changed` event type registered | No function computes the before/after audience or moves category + taint + search rows in one transaction. `revise_object` allows `title, summary_text` only. |
| **Unshare one document in one action** (PRD §4.3.5, §4.6.3's table; AC-DOC-5) | `hc.share_object` (step-up bound, STP-02); `object_shares.revoked_at` is set only inside `hc.remove_member` and the security-notice path | **No member-facing revoke.** |
| **"Everything in the record that references it"** (PRD §4.3.4); **"who it has been shared with"** (§4.3.4/§4.3.5, on the document AND the person) | `provenance_edges`, `object_shares` | Both tables carry **`hc_internal` policies only** (`20260815230003:92-102`). A member cannot read either; the app cannot compose these from RLS. |
| **The People list — every person, tier, and what they can see per subject** (PRD §4.6.1, AC-PPL-2/3); pending and expired invites (§4.6.2) | `circle_members_select` (live members), **`access_grants_select_own`** (a member's OWN rows only), `invites` with zero request-path privilege, `hc.tier_defaults`, CIR-03 subject-member rows | A coordinator cannot read another member's grants through RLS; nobody can list invites. |
| **Adjust, revoke, invite, revoke-invite** | `hc.set_grant` (raise needs step-up; lower does not; GRT-01), `hc.remove_member` (GRT-02) + `POST /[circle]/members/[member]/remove`, `hc.create_invite` / `hc.revoke_invite` (IVT-01; the revoke wrapper has **no caller**) | **Nothing** — app only. |
| **The access log, filtered, printable** (§4.6.5, AC-PPL-5/7) | `access_log_select` (round-8 form, LOG-01), `hc.log_denied` collapse (LOG-02) | **Nothing** — app only (a print stylesheet). |
| **Manual timeline event** (§4.4.3) | `hc.create_manual_proposal` (MNL-01, narrowed at 6A M6 to `view` × five) + `hc.approve_proposal` | **Nothing** — app composes the two calls as one action for a member who can. |
| **`documents.summary_text` at `summary` or `view`** (TSD §11.3, line 2760: *"one table split to reverse, cheaper to decide now than after slice 7"*) | Written at `summary` since `20260815230002:58`; readable by `documents_select` at `>= summary`; the family ceiling copy *"Nell's timeline, and how she's doing"* (PRD §4.1.5) is written against it | **Decide now: KEEP at `summary`** (TSD §3.4's recorded reading). Reversing is a table split (summary onto a `view`-table beside `document_search_content`) plus a search-vector change, for no PRD sentence that asks for it. The Documents surface is drawn to that line: at `summary` a person sees title, category, dates and the three sentences — **not the artifact, not the extractions, and no disabled control implying them**. |

**The planned migrations, each with what it closes:**

| # | File | Contents | Closes |
|---|---|---|---|
| M1 | `task_assignment` | **`hc.assign_task(p_task, p_member, p_instruction text default null, p_share_document uuid default null, p_step_up_token text default null)`** — TSD §3.6's two explicit human paths when the assignee cannot clear the task's taint (computed in-function from the assignee's OWN vectors, never the caller's): path 1 writes a `written_for_member_id` task with **taint = `{schedule}` only** and its own provenance (*written by Sarah, for Marisol, from a task she can't see*); path 2 creates `object_shares` for the task AND the named document together, both `created_by_assignment_of = task`, requiring the §5.7 step-up bound to `share_object` (the existing binding — sharing an object is a step-up operation). A plain assignment to a member who CAN clear the taint needs neither. **The AI has no path into this function** (§6.5). Refusals in one shape. **`hc.unassign_task(p_task, p_keep_share_ids uuid[] default null)`** closes the written instruction and revokes every share carrying `created_by_assignment_of = task` unless a coordinator keeps it (AC-TASK-7). Reassign = unassign + assign in one transaction, re-running the whole check. New event types `task_assigned`, `task_reassigned`; the existing `task_unassigned`. Every assignment has a human actor in the log (AC-TASK-2). | **SHR-02 flips at the pgTAP layer** (its app half at 7B); AC-TASK-6/7's DB half |
| M2 | `task_lifecycle` | **`hc.complete_task(p_task)`** — the owner (a `view`-level member *"can complete work assigned to them"*, §7.3) or `manage` on the taint; writes `status = 'done'`, `completed_by/at`; completed tasks are never deleted (§4.5.3). **`hc.snooze_task(p_task, p_due_on, p_due_zone)`** — moves the date, `snooze_count + 1`, a revision row with the actor (§4.5.4: *by whom and how many times*). Event types `task_completed`, `task_snoozed`. The `hc.revise_object` allowlist is **not** widened — `status` and `owner_member_id` stay unaddressable through the generic patch. | AC-TASK-1's second half; §4.6.4's counts become true facts |
| M3 | `document_audience` | **`hc.document_audience(p_document, p_category)`** — a coordinator-readable preview: for the proposed category, every live member whose visibility of this document changes, with name and before/after level (the sentence *"This moves it out of finances. Dan and Ruth will be able to see it."* is rendered from this and nothing else). **`hc.recategorize_document(p_document, p_category)`** — refused unless the caller holds `manage` on BOTH the source and the destination domain (PRD §4.3.2's fourth rule); rewrites `category` and `taint`, rebuilds `tsv_summary` and the `document_search_content` row **in the same transaction** (§4.3.6's synchronous-index rule; `hc.sync_search_content` exists), and logs **`audience_changed`** with both audiences. There are no outstanding signed URLs to revoke — the byte path never issues one (§1.3). **`hc.revoke_share(p_share_id)`** — the granter or a coordinator; sets `revoked_at`; logs `object_share_revoked` (exists). | AC-DOC-5/6, AC-PERM-10's revoke half |
| M4 | `record_reads` | Three **definer reads**, each filtered per row by `hc.visible_at` and each count-never-name (the `hc.receipt_for` pattern, 063): **`hc.circle_people()`** — every live member and subject-member of the caller's circle with tier, declared slice, custodian (for subjects), and **per-subject per-domain level**, plus pending/expired invites for coordinators only; **`hc.document_references(p_document)`** — the tasks, events and facts whose provenance graph reaches the document, each at the caller's own level of the destination; **`hc.shares_for(p_object_type, p_object_id)`** and **`hc.shares_for_member(p_member)`** — live object shares, visible on both the object and the person. `provenance_edges` and `object_shares` keep their `hc_internal`-only policies; the read is the function. | PRD §4.3.4, §4.3.5, §4.6.1; AC-PPL-2/3 |
| M5 | *(reserved)* | Round-24 dispositions — the standing precedent since 2A. | — |
| M6 | *(reserved, NAMED)* | **ADR-0027 D17 item 4's DDL exit, contingent on Q2.** F-3's residue: the artifact route's abandonment check cannot cover the commit round-trip of the `artifact_read` entry, so one round-trip's worth of refused reads can be recorded as reads. The DDL exit is a column marking an unconfirmed entry (two-phase). **Recommended instead: rule the one-round-trip window ACCEPTED** — the log then errs toward *over*-reporting a read a family member did not complete, which is the safe direction for a log whose purpose is to show who saw what — with a `coverage.md` row carrying the exposure (never green). If ruled so, **M6 closes UNCONSUMED and the bound closes at 5 of ≤ 6.** | ADR-0027 D17 item 4, D22 item 6 |

**The zero-DDL alternative, priced honestly.** With no migration, the
four surfaces READ and two of them cannot WRITE: Timeline is complete
(manual events ride `create_manual_proposal`); People & roles is complete
for adjust/revoke/invite but **cannot list what other members can see**
(`access_grants_select_own`) and cannot list invites; Tasks is a list a
caregiver cannot act on — no claim, complete, snooze or assignment, so
AC-TASK-1/2/5/6/7 stay unmet and **SHR-02 stays `pending` a fourth slice
running**; Documents cannot re-categorise (AC-DOC-6 unmet), cannot unshare
(AC-DOC-5's *"revocable in one action"* unmet), and cannot show references
or shares. **RCP-02 CAN close under zero DDL** — links resolve to pages —
which is exactly why the zero-DDL exit is tempting and exactly why it is
the wrong bar: §11.1 row 7 says *"written by slice 6's approvals"*, and a
task nobody can hand to a sibling is not the work board PRD §4.5 describes.

**Bound: ≤ 6.** M1–M4 planned, M5 reserved for round 24, M6 reserved and
NAMED for D17 item 4's DDL exit, consumed only with the Q2 ruling quoted in
the commit. Expected close: **5 of ≤ 6** if Q2 rules the window accepted — **and Q2 so
ruled (SETTLED 2026-08-28): the window is ACCEPTED and M6 closes UNCONSUMED.**
Anything past the bound is a recorded owner amendment before a line is
written; **shipped migrations are never edited.** The tree moves **69 →
74** (or 75) migrations and **65 → 70** (or 71) pgTAP files, one per
consumed slot (066–070). `supabase:supabase-postgres-best-practices` was
loaded before this section was written and stands for the 7A build: every
new function `security definer set search_path = ''`, owner `hc_internal`,
EXECUTE revoked from `public/anon/hc_pipeline/hc_admin` and granted to
`authenticated` alone (002 pins both on every migration); privilege closure
asserted from the catalog, never by calling as a denied role (the segfault
trap); reads that scan `tasks`/`documents` ride the existing partial
indexes (`tasks_page`, `documents_page`, `timeline_events_page` —
`20260816120006:102-106`) and any new predicate that would not is a PRF-06
tripwire question, measured, not assumed.

---

## Dependency bound: **0 runtime additions expected; the dev reserve stays UNSPENT**

`package.json` at `7fdca4e`: **13 runtime / 15 dev**, verified. Nothing in
the four surfaces needs a package: the viewer consumes the artifact route,
the print path is a `@media print` stylesheet, dates render through the
existing formatters, counts are plain (design spec §7). **If a build
session finds it needs one, it is an owner ruling with the licence read
from the installed manifest and the command's output pasted into the red
commit** (ADR-0023 D24's rule) — never a build decision. The bound is
stated as zero so that "we added one small thing" cannot pass unnoticed.

---

## The process check for THIS slice — `chore/process-retune` (Q3)

**Measured this session, not inherited.** The branch exists locally at
`116f80c` and **not on `origin`** (`git branch -r` does not list it). Its
base is `1066e2d` (round 19/20) — six merges behind `main`. Its own
`docs/process/slice.md` says *"In force from slice 7. Slice 6B finishes
under the rules it started with"*; every record since round 18 says
*"UNMERGED and NOT BINDING"* (ADR-0027 D22, ADR-0031, the queue triage).
This plan neither adopts it silently nor ignores it.

**What it is — 15 files, +1,660 / −4:** a tracked `CLAUDE.md` charter
(82 lines) importing `docs/process/traps.md` (208), `docs/process/slice.md`
(188 — the tiering rule, the split rule, the 15-step ritual, the bounds
table), `docs/owed.md` (127 — the live ledger, cap 25 OPEN, **its ledger
table is EMPTY and its intake note still says D17 = 39**, which is now 0),
`.claude/skills/slice/*` (five templates), **`scripts/preflight.mjs`
(195) wired as `predb:reset` / `pretest:db` / `pretest:concurrency` /
`pretest:e2e` hooks in `package.json`** — a behaviour change to every
stack-level command — **and `tests/lint/process.test.ts` (356 lines, 26
tests) which runs in CI under `test:app`** and un-ignores `CLAUDE.md` /
`AGENTS.md` (they are gitignored at `main` today). **It is not a docs-only
PR**, and the kickoff's *"merge it FIRST, as a docs PR"* framing is wrong on
that point; it is a process-and-tooling PR.

**A trial merge onto `7fdca4e` was taken in a scratch worktree
(`trial/retune-merge`, deleted after): zero conflicts, and its
`tests/lint/process.test.ts` passes 26/26 against the merged tree.** So
adoption is mechanically cheap; what it costs is ceremony change, and what
it needs first is a refresh — the owed ledger populated with the LIVE owed
set at `7fdca4e` (ADR-0027 D17 items 1–8; ADR-0028 D8 items 1, 2, 3, 5,
5a and D15 items 1–5) and its intake note corrected — before it binds
anything.

**What in it changes THIS plan's ceremony, if adopted:**

| Retune rule | Effect on slice 7 |
|---|---|
| **Tier per increment, an owner ruling at the plan gate** (fail closed: an argued tier is Tier 1) | Declared here as recommendations: **7A Tier 1** (ships migrations, writes the access log); **7B Tier 2** (durable side effects through shipped definer functions, no schema change; UI composition on two surfaces); **7C Tier 1** (Documents walks the byte path and writes an audience change; People & roles writes grants — *auth*). A tier is never lowered mid-slice. |
| **The split rule** — no increment holds a Tier 1 and a Tier 3 unit | Q1's three-way split is this rule applied: 7B is the Tier 2/3 pair, 7C the Tier 1 pair. |
| **Tier 2 collapses steps 8–13** into one deltas doc + one dispositions table; **Tier 3 is batched** once per slice | Round 25 (7B) is one reviewer session and a table, not an ADR; the Tier-3 copy/styling of all three increments is read once at close-out, against the two things a gate cannot see (legs asserting less than their titles — the leg-integrity quota, D17 item 5 — and copy drifted from spec). |
| **Owed intake as a plan-gate bound**; `docs/owed.md` live, cap 25, burn-down quota | Q4's table becomes ledger rows: TAKEN(7B/…) or OPEN with an acceptance condition; the quota (*closes at least as many as it opens, plus five*) is measured at slice close. |
| **Kickoffs ≤ 90 lines**; **Tier-1 dispositions ADR targets 150 lines** | Binds the 7A/7B/7C build kickoffs and ADR-0033. |
| **Preflight before every stack command** | Every build session's `db:reset` / `test:*` runs `scripts/preflight.mjs` first — the two-session trap becomes mechanical. |

**If deferred or dropped:** this plan runs under the standing ceremony
exactly as slice 6 did — a full round per increment (24, 25, 26), the
two-commit dispositions round (PUT → SIGN-OFF) plus a separate markers PR
(ADR-0031 / PR #22 are the freshest template), and the owed items tracked
in this document's Q4 table and in coverage rows rather than a ledger.

---

## What exists (do not rebuild) — verified against the tree this session

**Shipped and load-bearing:**

- **The permission kernel.** `hc.visible_at` in its PRF-06 form
  (`20260816120006:44`): six ordered clauses then the FRZ-13 cap; the 003
  truth table; `hc.ladder` as jsonb containment; `hc.all_domains()`;
  `hc.presence` at `log` (PRS-01). Tiers `coordinator | family |
  care_circle`; `hc.tier_defaults` (`20260818120003:82`) — family gets
  health/schedule/memories `summary`, documents `log`, **finances no row
  (hidden)**; care_circle gets schedule `summary` only; coordinator
  manage × five. `lib/permissions/tiers.ts` is the ONE ceiling module
  (AC-AUTH-8), snapshot-pinned to `hc.tier_defaults` at 037:390–394.
- **Subjects as people.** `circle_members` rows with `account_id null`,
  `subject_id` set and `custodian_member_id` named (CIR-03, CIR-04:
  manage × five on their own record); attach-parent-login is one UPDATE
  (CIR-06). **AC-PPL-3 is a render, not a build.**
- **Grants, revocation, invites, step-up.** `hc.set_grant` (coordinator
  only; RAISE requires a §5.7 token bound to `member:subject:domain`,
  LOWER never; care-circle capped structurally; `grant_changed` logged
  with both levels — GRT-01, AC-PERM-5). `hc.remove_member` (one
  transaction under the R-rule lock: grants deleted, live shares revoked
  unless explicitly kept, OPEN tasks unassigned and logged, last live
  coordinator refused — GRT-02) + `POST /[circle]/members/[member]/remove`
  which then kills sessions (`lib/hc/members.ts`) — the route's own header
  says *"The People surface arrives with slice 7; until then this is the
  wiring the E2E drives"*, and onboarding leg 29 (AC-PERM-3) drives it.
  `hc.create_invite` / `hc.revoke_invite` / `hc.accept_invite` /
  `hc.describe_invite` (IVT-01…03); the invite page and the one-time link
  page exist; **`revokeInvite` has a wrapper and no caller.**
  `hc.share_object` requires a live bound token (STP-02); the step-up mint
  route exists at `/account/step-up/submit`.
- **The access log, readable.** `access_log_select` in its round-8 form
  (LOG-01): circle-level domain-less entries to every live member (the
  freeze trail stays readable), subject entries at `>= log` on the
  entry's domain, no-domain entries failing closed to all-domains;
  `hc.log_denied` collapses repeated denials and never names the object
  (LOG-02, AC-PPL-7). **AC-PPL-5's DB half is green; its surface does not
  exist.**
- **The record tables and their reads.** Policies at `>= summary`
  (`profile_facts` at `>= view`); `documents.summary_text` written by the
  approve path; `documents.category` ∈ the seven PRD §4.3.2 categories;
  `timeline_events.kind` ∈ `medical | care | admin | memory`; the three
  temporal shapes under `temporal_shape`; `tasks.status ∈ open | done |
  cancelled`; the page indexes. `hc.revise_object` (REV-01) for title /
  detail / due date / summary edits with a revision row.
- **The receipt and the byte path.** `hc.receipt_for` (RCP-01) resolving
  each destination through its own policy predicate, counted-never-named;
  the receipt rendered at `inbox/[arrival]/page.tsx:240-279` with
  **section-level** links (`/[circle]/tasks`, `/[circle]/timeline` — no
  per-object route exists anywhere) and the sentence *"its page opens in an
  upcoming update"* for documents, profile facts and episodes.
  `GET /api/artifact/[id]` with `?page=N` and `&text=1`; `arrival_renditions`
  (6A M4) read at `view` × five; OCR siblings (OCR-01).
- **Manual entry.** `hc.create_manual_proposal` (MNL-01; narrowed at 6A
  M6 to `view` × five), consumed by nothing in `app/` yet.
- **The shell.** `components/shell/nav-manifest.ts` — six entries (Care
  Inbox, Add a document, Tasks, Invite; Timeline; Account), *"live routes
  only"*. No Documents, no People. `LeftNav` renders groups only when they
  have a live entry — PRD §4.0's *"no greyed items, no coming soon"* is
  already the mechanism.

**Verified ABSENT — the gap this slice fills:**

- **No Documents route at all.** Nothing under `app/` or `lib/` reads
  `public.documents`. No People route. `circle_members` is read by nothing
  in `app/`, `components/`, `lib/hc/`. `hc.set_grant` and `hc.share_object`
  have **zero app callers**.
- **No per-object route for any record type.** `/[circle]/tasks/[task]`,
  `/[circle]/timeline/[event]`, `/[circle]/documents/[document]`,
  `/[circle]/people/[member]` — none.
- **No task write of any kind by a member** (the Q2 table). No document
  re-categorisation, no unshare.
- **No member-readable provenance graph, no member-readable share list, no
  cross-member grant read** (M4's reason).
- **The two floors cannot render a row** (§0 point 1).

**The regression net this slice must not dent (evidence at `7fdca4e`,
verified this session by discovery, not by re-run):** migrations **69
exact** · pgTAP **65 files** · vitest **953 tests across 78 files**
(`vitest list --json`; the kickoff's own-run figure, ALL PASSING with the
stack up) · browser gate **38 legs in 5 files** (`playwright test --list`;
11.9 min on a quiet host per the kickoff) · CI green on every head today ·
`PROMPT_VERSION_NAME = 'hc-6b-3'` (`lib/ai/config.ts:221`), `PINNED =
'ff1435280a36f8eb'` (`tests/ai/adapter.test.ts:497`).

---

## THE THINGS THAT MUST BE SETTLED BEFORE A SCREEN IS DRAWN

### 1 — What "Summary only" is allowed to promise (People & roles)

PRD §4.6.1's sentence — *"Nell: full · Marcus: summary only"* — is the
truth the family reads, and §4.6.6 AC-PPL-2 says it comes before any
checkbox. It must be rendered from **one module** mapping the five levels
to five phrases (the `tiers.ts` discipline, extended: the level words and
the grants they describe cannot drift apart because the same module
renders both), and it must describe **what the policies enforce**:

| Level | The phrase describes | Enforced today by |
|---|---|---|
| `manage` | can see and change everything in the domain | write functions' `>= 'manage'` at write time (§3.7) |
| `view` | sees everything, including the documents themselves; cannot approve | `extractions_select`, the artifact route, `profile_facts` at `>= view` |
| `summary` | titles, categories, dates, the three-sentence summary; **not the document, not what was read from it** | the `summary`/`view` line drawn between TABLES (§3.4) |
| `log` | that things exist and when they changed, nothing more | `hc.presence` only (§3.5) |
| `hidden` | nothing — and nothing implies the domain exists | clause 6 of `hc.visible_at`; counts post-filter |

**Two honest limits the screen states rather than hides.** (1) The
notification and export channels are **not yet enforced** (RLS-11b
`pending`, slice 2+; no notification or export surface exists), so the
phrase says what a person *sees in the record*, never *"will never hear
about"*. (2) The subject-member rows render as people holding the highest
access to their own record *"with no account attached and their custodian
named beside them"* — the §7.5 custodianship framing, verbatim, and never
the word *authority*.

### 2 — The Documents surface at `summary` is a list of sentences, not a viewer

At `summary` a member reaches `documents` (title, category, dates,
`summary_text`) and **nothing else** (§3.4). The detail page at `summary`
renders those four things, the source (channel, sender, date — the arrival
row is summary-readable), the approver and time (AC-DOC-3), and **no
viewer, no "what we read", no disabled control** — a disabled control
implies the artifact exists in a form this person could be shown, which is
exactly the implication `hidden` forbids one level down and the design
spec's *"no greyed items"* forbids everywhere. At `view` the same page
gains the pages and the facts, through the ONE route.

### 3 — Assignment across a taint boundary is decided at the point of selection

PRD §4.5.5: *"Reassigning to a member who cannot see the subject the task
belongs to is refused at the point of selection with a plain reason; the
person is not offered."* §4.5.6: when the person can see the subject but
not the task's taint, the interface says so **at that moment** and offers
exactly two paths. Both need the assignee's visibility of THIS task
computed for someone other than the caller — which is what
`hc.circle_people()`'s per-subject per-domain levels give the app
(min over the task's taint), and what `hc.assign_task` re-checks
in-function so the interface's answer and the database's cannot disagree.
**The AI never writes the instruction** (§6.5): path 1's text is typed by
the assigner, and there is no field the app pre-fills.

### 4 — The page gate renders an outage as a sign-in, and 7B adds pages to it

`liveSessionClaims` (`lib/auth/session.ts:143-152`) flattens `unavailable`
to `null`; **10 pages** redirect to `/sign-in` on an auth-server fault
(ADR-0028 D8 item 2; the "twelve" is the wrong enumeration the same ADR's
D15 corrected to **21 sites: 3 refuse with a status · 10 pages redirect ·
5 form routes redirect · 1 layout degrades · 2 do not gate**). Slice 7 adds
at least six pages that would inherit the same gate. **7B B1 fixes the gate
once, before any new page uses it**: pages render *"the record can't be
reached right now — try again"* (a 503 with `retry-after`, `private,
no-store`) on `unavailable` and redirect only on `signed-out`;
`app/(auth)/confirm/route.ts:45` stops answering `?verified=1` when the
activation pass never ran (D15 item 4); the enumeration comment at
`session.ts:32-33` and `:138-141` is corrected (D15 item 1).

---

## The inherited obligations, priced — not folded (Q4)

Each item's current state was **re-verified at the site this session**
(file:line quoted in the build kickoff), not carried from the record. Home
means the unit that takes it; NOT THIS SLICE means named here with its
reason and its standing home.

| Item | Verified state at `7fdca4e` | Priced | Home |
|---|---|---|---|
| **AC-INBOX-5 / AC-INBOX-13 — multi-attachment group review** (slice-6 exclusion: *"a named row in the slice-7 plan's inherited-obligations batch"*) | Parent + N children shape live; no group flow; rows `pending` | A composition over the review screen: N children reviewed as one flow with one receipt at the end — a 6B-B7-sized unit, its reader the Care Inbox, not the record | **NOT THIS SLICE, put to the owner as Q4(a).** Its reader is the inbox; folding it into a destinations slice is how the destinations get bent. Recommended home: a Care Inbox increment (6C) sequenced before slice 8, or slice 7's optional fourth increment if the owner wants it sooner. Rows stay `pending`, never green on the arrival shape |
| **RCP-02 — AC-INBOX-9 in full** (coverage.md:486, `pending` tagged 7) | The receipt links section-level to `/tasks` and `/timeline`; names documents, profile facts and episodes with *"its page opens in an upcoming update"* | Per-object routes for tasks, events and documents; a Phase-1 home for profile facts — **PRD §3.3 puts the Person profile in Phase 2** (*"profile facts accumulate in Phase 1 as extractions; the surface that presents them follows"*), so the criterion's *"including … profile facts"* has no Phase-1 target unless one is named | **7B** (tasks, events resolve to the object) → **7C** (documents; **profile facts on the subject's own People & roles entry at `view`** — the minimal true target, Q4(b)). **RCP-02 flips at 7C**, not before |
| **ADR-0028 D15 item 1** — `lib/auth/session.ts:32-33` wrong enumeration | Present verbatim, no marker; repeated at `:138-141` | A comment correction inside the gate fix | **7B B1** (the gate is rewritten there; no separate gate re-run) |
| **D15 item 2** — `lib/http/budget.ts` contradicted sentence MARKED | `ROUND-19 F-1` marker present at `:16-17` (predates the ruling); the round-20 qualifier *"UNCONFIRMED IN THE RUNNING APP"* is **absent** — `:52-55` still states the new localisation as fact | A dated comment | **7C** (the artifact route is Documents' route; the marker lands in the increment that touches the file, so no comment-only gate re-run is needed) |
| **D15 item 3** — `tests/lint/timestamp-boundary.test.ts` 3 of ≥ 8 spellings | Regex is a three-branch alternation (`:52-59`); `:113-114` still claims three is the class | Extend the scanner to the class (`.toString()`, `toISOString` on a `_at`, `Date(` wrapping, JSON round-trips, template-literal fragments, `+ ""` variants…); the new surfaces render dates on every row, so the class matters here | **7B B1** |
| **D15 item 4** — `app/(auth)/confirm/route.ts:45` one-shot effect lost on `unavailable` | Present; `liveSessionClaims` → `null` → activation skipped → `?verified=1` success page | Read the three outcomes; on `unavailable` render a retry, never success | **7B B1** (same mechanism as the gate fix) |
| **D15 item 5** — `api/upload/token` + `api/upload/complete` unbounded | Both `await req.json()` with no size/`content-length` bound, no answer budget; `complete` bounds only MEASURED staged bytes post-download; the 24.3 s `r2` call was `upload/token` | A `content-length` / JSON-size cap and an `AnswerBudget` on both; the upload channel gains a per-file pre-read bound like the mail path's | **7C** (PRD §4.3.7: *"uploading from Documents is an ingestion"* — Documents walks straight into these routes) |
| **ADR-0028 D8 item 1** — render + OCR off the request process | Ruled NOT PLANNED at round 20 (*gate first*); no line exists | An execution-model change to the pipeline | **NOT THIS SLICE** — owner-held; home: its own increment, with D13's harness as its prerequisite |
| **D8 item 2** — page gates render an outage as sign-in | 10 pages (measured) | The gate fix | **7B B1**, above |
| **D8 item 3** — the starvation sample is one sample | Unchanged | A heartbeat across the window | **NOT THIS SLICE** — with item 1 |
| **D8 item 5** — leg 38 under genuine load | Passed `r3`/`r5`, failed `r6`/`r7`/`r2` | Observation, not work | **Every 7B/7C gate run records leg 38's duration and outcome** (the D13 table's shape); never re-run to green |
| **D8 item 5a** — the `HopCost` ledger seen firing | Never; D13 names the reproduction (concurrent in-process render + OCR overlapping an authenticated artifact read) and the harness it needs | The harness | **NOT THIS SLICE** — owner track / item 1's prerequisite; named |
| **ADR-0027 D17 item 1** — no `tests/hc/review.test.ts` | Confirmed: 10 files in `tests/hc/`, none loads `@/lib/hc/review`; two route tests mock it out | A live-module test of the `tests/hc/inbox.test.ts` kind | **7B B1** (*first item, per the review*) |
| **D17 item 2** — F-4's row-boundary typing | `RequestRoleQuery.query` still returns `Promise<QueryResult>` with `rows: any[]` | Generic `q.query<R>`; the two escapes fail to compile | **7B B1** — before the new surfaces add reads on top of it |
| **D17 item 3** — F-1's composition limit (35 `withRequestRole` sites, one budget) | 35 sites across 12 `lib/hc` modules, counted; the artifact route the only budgeted surface | A ruling on which surfaces a person waits on carry a budget | **7B/7C**: **every destination page and every route they POST to carries an `AnswerBudget`**; the ruling for the rest (pipeline, workers, auth forms) is recorded in the 7B deltas ADR |
| **D17 item 4** — F-3's residue (the only DDL candidate) | Unchanged | Q2 | **Q2** (M6 reserved and NAMED; recommended: accept the window) |
| **D17 item 5** — the leg-integrity pass, 31 of 38 remain | 7 of 38 read | Reading, not code | **The batched Tier-3 pass if Q3 adopts the retune (a fixed quota per pass until the backlog clears); otherwise 8 legs read at each of the three close-outs** — 24 of the 31 by slice end either way |
| **D17 item 6** — A11Y-07's conditional half | `if (factCount > 1)` guard still skips | An assertion | **7B** (the leg work) |
| **D17 item 7** — the nine unbounded outbound fetches | Nine confirmed at the cited lines; **the tree's own split (7 awaited / 2 eager, `lib/storage/fetch.ts:21-33`, ratified at ADR-0027 D22 item 4) is wrong at the site**: `postmark/route.ts:211` and `upload/complete/route.ts:103` both sit inside `after(async () => …)`, so the split is **5 awaited / 4 eager**. Recorded here; no verdict moves (ADR-0025 D6) | Bound the five on the upload path (the two client calls, the two TUS hops, `upload/complete`'s fire); name the four others | **7C** takes the upload-path five. **NOT THIS SLICE**: `lib/mail/outbound.ts:39` (slice 11's channel), `postmark/route.ts:211`, `worker/relay/route.ts:116`, `worker/[stage]/route.ts:109` (the pipeline's) |
| **D17 item 8** — F-2's deployment consequence UNOBSERVED | No hosted runtime looked at | Owner time | **NOT THIS SLICE** — owner track; named |
| **D17 items 9–10** | RCP-02 (above); the 5B queue is CLOSED | — | Today's work, done |

---

## The increment — the split, argued (Q1)

### The case for ONE app increment, stated at its strongest

Four surfaces, one permission model, one shell, one round. 6A/6B held on
the tree facts that the app layer could not close the loop; here the DB
gap (Q2) is real but small, and one app increment after it would put the
receipt's four destinations in front of a reviewer together, so RCP-02 is
judged once. Two rounds, not three.

### What the tree says — and what 6B cost

- **The DB gap is real, so a DB increment is not optional.** `hc.assign_task`
  does not exist, and neither does any member write to a task, any
  audience change, any unshare, or any member-readable view of grants,
  shares or provenance. Every one of those is decidable from the spec
  alone against the shipped DDL — the opposite of the mistake ADR-0023
  D15 Q-E warns about. **7A first.**
- **The four surfaces are two pairs with different oracles.** Tasks and
  Timeline are *compositions over shipped definer functions and RLS reads*:
  filters, detail pages, assignment through M1/M2, manual events through
  `create_manual_proposal`. Their review is falsification against fixed
  functions. Documents and People & roles are *the security posture made
  visible*: the byte path, an audience change that is an authorization
  change, grants raised under step-up, revocation with its honest limit
  stated, the access log printed. Their review is the G8 red-team at the
  screen, and it wants its own lens.
- **6B was 20,001 insertions across 135 files in one increment, and its
  round ran from 18 through 23** — five rounds, three of them
  bookkeeping on a queue that a single review could not close. Slice 7's
  app surface is at least as wide as 6B's (four surfaces, six or more new
  routes, three write flows with confirmations). One app increment repeats
  the shape that cost five rounds.
- **The receipt does not need all four to land together.** RCP-02's letter
  needs documents and profile facts; tasks and events resolving to their
  objects at 7B is progress the receipt can show immediately, and the row
  stays `pending` until 7C — pending never counts as green.

### Why not four increments

One surface per increment buys three extra rounds for surfaces whose
oracle is the same (Tasks and Timeline share the gate fix, the row
rendering, the subject labelling and the provenance line; Documents and
People & roles share the step-up flow, the confirmation shape and the
access-log rendering). The pairs are the natural seams; singles are
ceremony.

### The condition under which two increments would have been right

If Q3 defers the retune AND the owner prefers one wide app round over two
narrower ones, 7B and 7C collapse into one — with this plan's B/C tables
preserved as the unit order, and with the record noting it chose 6B's
shape knowingly. The recommendation is against it.

### 7A — the database increment (M1–M6, bound ≤ 6) — Tier 1

The Q2 table above, in order: **M1 `task_assignment` FIRST** (SHR-02, the
oldest pending row this slice can reach — the 5A/6A "inherited FIRST"
precedent), M2 `task_lifecycle`, M3 `document_audience`, M4
`record_reads`; M5 reserved for round 24; M6 reserved and NAMED for Q2.

**7A test plan.** pgTAP **066–069** (070/071 only if M5/M6 are consumed),
one file per migration — refusal shapes, replay, privilege closure
catalog-based (the segfault trap). The named cases:

- **M1's two paths, driven both ways** — an assignee who can clear the
  taint is assigned plainly; one who cannot is refused unless path 1 or 2
  is chosen; path 1 writes a `{schedule}`-tainted task visible to a
  care-circle member at `summary` and leaves the original invisible to
  her (AC-TASK-6, 003's rung 4); path 2 creates both shares together and
  refuses without the bound step-up token; **unassign revokes exactly the
  assignment's shares and no other** (AC-TASK-7, SHR-02 both ways —
  a kept share survives, a foreign share is untouched); reassign re-runs
  the check; the AI role holds no EXECUTE.
- **M2** — the owner completes at `view`; a non-owner at `summary` is
  refused; snooze moves the date and increments the count with a revision
  row naming the actor; a completed task stays readable.
- **M3** — `document_audience` names exactly the members whose level
  changes and nobody else; `recategorize_document` refused without manage
  on BOTH domains; category, taint, `tsv_summary` and the search-content
  row move in one transaction (the A.3 `health → documents` worked example,
  017's shape) and the `audience_changed` entry carries both audiences;
  `revoke_share` by the granter and by a coordinator; by anyone else, one
  refusal shape.
- **M4** — `circle_people` shows a coordinator every member's levels and a
  family member the same list (existence of members is circle-level);
  invites appear for coordinators only; a frozen circle returns the
  members and no levels; `document_references` counts-never-names a
  destination the caller cannot see (063's discipline); `shares_for` on an
  object the caller cannot see returns nothing, not an empty shape.

**Concurrency (CI, teed — the standing transient protocol):** assign vs
remove_member on the same member ⇒ one wins, the other refuses in one
shape · two coordinators re-categorising one document ⇒ one audience
change, one log entry · unassign racing a coordinator's keep ⇒ the kept
share's state is the committed one · a freeze committing mid-assignment
(the R-rule).

**CI:** `verify-migration-state` exact counts 69 → 69+N · upgrade leg
green · `db:verify` clean under `--fail-on warning`.

### 7B — the record app increment: Tasks + Timeline — Tier 2

| # | Unit | Contents | Spec |
|---|---|---|---|
| B1 | **The floors made honest, and the gate fixed — FIRST** | The two pages select the columns that exist (`status`; `summary`, the temporal shape), **read `error` and render an error state, never an empty one** (R5/F-2's lesson, applied to the two places it was not), every row subject-labelled (AC-TL-4 — *"no unlabelled state"*), every row carrying its `ProvenanceLine` (design spec §7: *a fact without a visible source is a bug*). **The page gate**: `liveSessionClaims`'s `unavailable` stops collapsing to `null`; the ten pages and five form routes render/answer *unavailable* rather than redirecting (D8 item 2), `confirm/route.ts` stops claiming success (D15 item 4), the enumeration comments corrected (D15 item 1). **`tests/hc/review.test.ts`** (D17 item 1) and the **generic row boundary** (D17 item 2) land before any new read is written on top of them. `timestamp-boundary` extended to the class (D15 item 3). | PRD §4.0, §4.4.1; ADR-0028 D8/D15; ADR-0027 D17 |
| B2 | **Tasks** | The list with `Mine · Unassigned · Overdue · All` and by subject — **counts post-filter, asserted over the rendered tree** (A.4's *count* oracle; AC-TASK-5's *"including in filters, counts"*); `/[circle]/tasks/[task]` — what · who owns it · when due · **where it came from, linked** (the arrival when visible; named by kind and never linked when not — the receipt's discipline) · who created and when · completion with who and when (AC-TASK-4). **Assign / reassign** through M1 with §4.5.6's flow: the person who cannot see the subject *is not offered* (§4.5.5); the person who can but cannot clear the taint gets the sentence at that moment and **exactly two paths, both explicit, both human** — the typed instruction (never pre-filled) or the named share with both objects in one confirmation, the share behind step-up. **Complete, snooze** (M2; the count shown), **unassign** with a coordinator's keep option (AC-TASK-7). Empty states per tier: *"Nothing open."* for a coordinator; **a caregiver's first open is never blank** — one sentence naming who to expect tasks from (§4.5.5). 390 px. | PRD §4.5 whole; TSD §3.6 |
| B3 | **Timeline** | The thread per subject with a switch and a labelled combined view (**nothing merges silently**); filters by kind (`medical · care · admin` — **`memory` never renders as an empty filter**, §4.4.1) and date range; `/[circle]/timeline/[event]` — the source resolved: AI-created events show the arrival, the extraction and the approver; manual events show the person and the date (AC-TL-2). **Add by hand** (§4.4.3: subject, date, kind, one line, optional linked document) as ONE action for a member who holds `view` × five (MNL-01's narrowing): `create_manual_proposal` then `approve_proposal`, the receipt shown; anyone below the cliff does not see the control. **Episodes render as wrappers if they exist and never conceal their events** (AC-TL-3) — drafting episodes is the interpretation pass's work and is NAMED OUT below. The creation entry is the first row of every timeline (§4.4.4). | PRD §4.4 whole |
| B4 | **The legs, the manifest, and the receipt's first two links** | `/[circle]/tasks/[task]` and `/[circle]/timeline/[event]` join `AUDIT_MANIFEST` (the test forces it); a11y legs for the two surfaces (Q5: A11Y-09 — filters and the assign flow fully keyboard-operable, subject labels never by colour alone, at 390 px and desktop); A11Y-07's guard becomes an assertion (D17 item 6); the receipt's task and event links move from section-level to **the object itself** (`receiptLine` at `inbox/[arrival]/page.tsx:257,264`); `e2e/review.spec.ts:273-276` asserts the task is ON the page, not only that the page is 200; an `AnswerBudget` on every 7B page and POST (D17 item 3's ruling as code). Nav: no change (Tasks and Timeline are live entries already). | §8.7; ADR-0023 R5/F-6; ADR-0027 D17 |

### 7C — the sensitive-pair app increment: Documents + People & roles — Tier 1

| # | Unit | Contents | Spec |
|---|---|---|---|
| C1 | **Documents, the list** | `/[circle]/documents` by category (the seven of §4.3.2) and by subject, at the member's own level: at `summary`, title · category · dates · the three sentences and **nothing that implies more** (settled item 2); a count that is post-filter; *"Nothing filed yet."*; **"Add a document" leads to the existing upload page — uploading from Documents is an ingestion, never a bypass** (AC-DOC-2), and an arrival in flight appears as an `Arrived` row that leads to the Care Inbox (§4.3.7). `documents` joins `NAV_MANIFEST` under THE RECORD. | PRD §4.3.1, §4.3.2, §4.3.7 |
| C2 | **Documents, the detail — through the ONE byte path** | `/[circle]/documents/[document]`: the document itself, rendered page by page **through `GET /api/artifact/[arrival]?page=N`** (and `&text=1` for the machine-read sibling, labelled with §6.9's exact string) — **a fence test asserts no second consumer of `asServiceRole()` and no second route that returns bytes**; *what we read out of it* through `hc.extractions_for` at `view` × five, each fact with its citation and `risk_class` word; where it came from (channel, sender, date, the arrival — linked when visible); who approved and when (AC-DOC-3); **everything else in the record that references it** (M4 `document_references`, count-never-name); **who it has been shared with, and unshare in one action** (M4 `shares_for`, M3 `revoke_share`, logged); **share** with one member through `share_object` behind step-up, with the §4.3.5 rules said on screen (one object, one person, never the domain, never derived objects). **Re-categorise**: `document_audience` renders the exact before-and-after audience by name — *"This moves it out of finances. Dan and Ruth will be able to see it."* — explicit confirmation, then `recategorize_document`; refused (and not offered) unless the member holds manage on both domains (AC-DOC-6). **The upload routes bounded** (D15 item 5) and the five upload-path fetches bounded (D17 item 7). `budget.ts`'s round-20 qualifier marker (D15 item 2). | PRD §4.3.3–§4.3.5; TSD §1.3, §3.11, §6.9 |
| C3 | **People & roles, the list** | `/[circle]/people`: every person — members, **subjects as people holding the highest access to their own records, no account attached, custodian named beside them** (AC-PPL-3, the §7.5 sentence verbatim), pending invites as `Invited · expires Friday` and expired ones as `Invite expired · send again` (the `revokeInvite` wrapper finally gets a caller; *send again* is a new invite, never a resurrected token) — name, avatar in their assigned accent, role, declared slice, and **the plain-language line per subject, from ONE module, before any matrix** (AC-PPL-2; settled item 1, with its two stated limits). Read through M4 `circle_people`. **Nav composition follows access**: a caregiver's nav is `Tasks · Account`; a summary family member's is `Timeline · Documents · People · Account` — a courtesy, asserted, never the mechanism (§4.0, §7.7). `people` joins `NAV_MANIFEST`. | PRD §4.6.1, §4.6.2, §4.0; PRD §7.5 |
| C4 | **Adjust, revoke, and the honest limit** | `/[circle]/people/[member]`: the matrix behind an *adjust* action — per subject, per domain, `set_grant`; **raising goes through the step-up screen that exists** (`/account/step-up`), lowering does not; the care-circle ceiling is shown as a ceiling (never offered above `hc.tier_defaults('care_circle')`); every change appears in the access log with actor, target, subject, domain, both levels (AC-PERM-5 — rendered, since GRT-01 already writes it). **Revoke**: `remove_member` through the existing route, with the coordinator's keep-share option, and the sentence **"a file already downloaded to someone's device cannot be recalled"**, in those words, at the moment of revocation (§4.6.3). **AC-PPL-4's channels, each its own leg where this slice reaches it**: sessions (onboarding leg 29 exists) · **document access with a URL issued BEFORE the revocation** (a new leg: fetch `/api/artifact/[id]?page=1` as Dan, revoke Dan, re-fetch the same URL from Dan's live context → the one 404) · cached responses (`private, no-store` asserted on every 7C page) · object shares (revoked with the grant unless kept — GRT-02, rendered). **Not reached here and said so**: background jobs, queued notifications, generated exports (RLS-11b, DEL-01 — their slices). **Contribution** (§4.6.4): what they own now, what they completed, last active — plain counts and lists, **no chart, no bar, no percentage, asserted over the rendered tree** (AC-PPL-6). | PRD §4.6.3, §4.6.4, §4.6.6; TSD §5.7, §5.8 |
| C5 | **The access log, and the subject's page** | `/[circle]/people/log`: the coordinator's read of `access_log` (LOG-01 filters it by the reader's own access — the surface adds nothing and asserts it subtracts nothing), every entry *who did what, to whom, on which subject, in which domain, when*; denials collapsed and never naming the object (LOG-02, rendered — AC-PPL-7); **printable** (`@media print`; the printed projection is the same filtered read). **The subject's entry** `/[circle]/people/[subject]` carries the custodianship declaration (the first row of the circle's log) and **the profile facts at `view`** — the Phase-1 home for the receipt's *"filed to the profile"* link (Q4(b)). **RCP-02 flips green here**: every receipt link resolves to the created object, documents and profile facts included. | PRD §4.6.5, §7.5, AC-INBOX-9 |
| C6 | **The legs, the manifest, the copy** | Every new `page.tsx` in `AUDIT_MANIFEST` with its leg; a11y legs (Q5: A11Y-10 — People & roles: the plain line first, the matrix keyboard-operable, meaning never by colour; A11Y-11 — the Documents viewer: page navigation by keyboard, the machine-read sibling reachable, at 390 px); **the People & roles sentences and the revocation copy read at round 26** (UXA-04, the UXA-01/02/03 pattern — `pending` until read); an `AnswerBudget` on every 7C page and POST. | §8.7, §8.6 |

**The inter-slice seam, stated honestly.** **Entry:** 6B's approvals
write the record and the receipt names four destinations, two of them
linked at section level. **Exit:** every destination is a surface a
person reads and, where §4 says so, acts on; the receipt's every link
resolves to the object; a family can add a caregiver and see, in a
sentence, that she cannot see the bank statements (AC-PPL-1 — the
sentence is true of reads, search, presence and the log; the notification
and export channels remain RLS-11b's and are said to be). **Search (slice
8) is not here**: AC-DOC-1's *"answered in under ten seconds"* is met by
browsing by category in this slice and by search in the next; AC-DOC-4 and
AC-TL-1's search halves are slice 8's rows. **Production activation remains
G4/G7-gated throughout.**

---

## Test surface

**pgTAP (CI):** 066–069 (+070/071), one file per consumed migration — M1's
two paths both ways with the care-circle rung and SHR-02's revoke-exactly
cases; M2's owner/non-owner and snooze revision; M3's both-domains
refusal, one-transaction move and both-audience entry; M4's
count-never-name and coordinator-only invites. Privilege closure
catalog-based throughout.

**Concurrency (CI, teed):** the four named 7A cases. Tee always; case-1
`40P01`s are the deliberate repro.

**vitest (CI):** the two floors' error-vs-empty distinction driven by an
injected query error (and a rendered row from a fixture whose column names
are the DDL's, not invented) · the gate's three outcomes at a page, a form
route and `confirm` · `tests/hc/review.test.ts` and the generic row
boundary (the two escapes fail to compile — a type-level test) · the
timestamp class extended · **a rendered-tree assertion per A.4 oracle a
surface renders**: post-filter counts on every Tasks tab, no chart/bar/%
anywhere on People & roles, the plain line before any matrix, the
`memory` filter absent · the level→phrase module pinned to
`hc.tier_defaults` the way `tiers.ts` is · **the byte-path fence**: no
second `asServiceRole()` consumer, no second bytes route ·
`hc.assign_task` / `unassign_task` / `complete_task` / `snooze_task` /
`recategorize_document` / `revoke_share` / `circle_people` /
`document_references` / `shares_for` against the live DB · every
`AnswerBudget` site present (a scan, with a positive control) · the nav
composition per tier · fence re-pins (`lib/hc`, storage plane, `lib/eval/blind`)
unchanged and asserted. The four-class taxonomy labels every row.

**Local gate (browser truth, LOCAL-only — never CI):** `e2e-local-gate.md`
gains the **record legs** (7B) and the **documents/people legs** (7C), each
new total stated exactly against **38**: **tasks** — a coordinator assigns
to a sibling in two taps; the sibling opens it and its source resolves ·
**cross-taint assignment** — the caregiver is not offered where she cannot
see the subject; where she can, the sentence and the two paths; path 1
lands her a task she can read and the original stays invisible from her
live context · **complete / snooze** with the count · **unassign** withdraws
the share (checked from her context) · **timeline** — two subjects, the
switch, the combined view labelled; a manual event added and its
provenance shown; the creation entry first · **documents** — the list at
`summary` shows sentences and no viewer (a summary-only member's live
context); at `view` the pages render through the artifact route; the
machine-read sibling reachable · **re-categorise** — the audience named
before the move, the log entry after · **share / unshare** — one document
to the caregiver; her context sees it and not a task derived from it
(AC-PERM-10 at the screen); unshare in one action · **people** — the list
with subjects as people and custodians named; the plain line; a raise
through step-up; a lower without; **revoke with the pre-revocation URL
leg** (AC-PPL-4's document row) · **the access log** rendered and printed
(a print-media snapshot leg) · **A11Y-09/10/11** · plus **walkthrough
11/11 + a11y 7/7 + ingestion 8/8 + extraction 5/5 + review 7/7 UNCHANGED**
at every head whose `app/ lib/ e2e/ supabase/` trees move, the new total
stated exactly (R7/F-11's lesson).

**The two-session trap governs every one of these** — check for a peer
`node.exe` and a moved HEAD before any stack-level command; `db:reset`,
`test:db`, `test:e2e` and `test:concurrency` are GLOBAL. `hc_clamd`'s
signature reload starves the pool mid-gate: `docker logs hc_clamd --since
20m` and `docker stats hc_clamd` before a gate, and RE-RUN before concluding
red. A failed leg is a single `x  N`; preserve `test-results/` before any
peer run.

---

## Coverage rows to open (`docs/coverage.md` gains "## 7 — the four destinations")

| ID | Assertion (compressed) | Layer | Slice | Status at slice end |
|---|---|---|---|---|
| SHR-02 | *(flip — pending since 1D, retagged 2+ → 7)* `hc.assign_task` / `unassign_task`: unassign revokes exactly the assignment-created shares unless a coordinator keeps them | pgTAP + app + e2e | **7A/7B** | green |
| TSK-01 | Assignment across a taint boundary: the person who cannot see the subject is not offered; the person who cannot clear the taint gets the sentence and exactly two explicit human paths; path 1 is `{schedule}`-tainted with its own provenance and the original stays invisible; the AI holds no path (AC-TASK-2/6) | pgTAP + app + e2e | 7A/7B | green |
| TSK-02 | Complete and snooze with attribution; completed tasks never deleted; the snooze count shown; every write has a human actor in the log (AC-TASK-2) | pgTAP + app | 7A/7B | green |
| TSK-03 | The list and detail: `Mine · Unassigned · Overdue · All` + subject, counts post-filter over the rendered tree; every task shows a source that resolves or is named-never-linked (AC-TASK-4/5) | app + e2e | 7B | green |
| TSK-04 | Empty states per tier — a caregiver's first open is never blank (§4.5.5) | app + e2e | 7B | green |
| TLN-01 | The thread: per subject with a labelled combined view, kind and date filters, `memory` never an empty filter; every event shows its source (AI: arrival + extraction + approver; manual: person + date) (AC-TL-2/4) | app + e2e | 7B | green |
| TLN-02 | Manual events as ONE action for a `view`×5 member through `create_manual_proposal` + `approve_proposal`, provenanced *entered by that person, on that date*; below the cliff no control | app + e2e | 7B | green |
| TLN-03 | Episodes never conceal their member events; drafting them is NOT this slice (AC-TL-3 render half) | app | 7B | green (render half) |
| GTE-01 | The page gate's three outcomes: `unavailable` renders unavailable (503, retry-after, no-store) at every page and form route, never a sign-in; `confirm` never claims success for a pass that did not run | app + e2e | 7B | green |
| DOC-01 | The list by category and subject at the member's own level: at `summary` sentences only, no viewer and no control implying one; count post-filter; *Nothing filed yet.*; upload from Documents is an ingestion (AC-DOC-2) | app + e2e | 7C | green |
| DOC-02 | The detail: pages through the ONE byte path (fence-tested: no second `asServiceRole()` consumer, no second bytes route); facts at `view`×5 with citations and the `risk_class` word; source, approver, time (AC-DOC-3); references and shares count-never-name | app + e2e | 7C | green |
| DOC-03 | Re-categorisation is an audience change: the exact before/after audience named before the move; refused unless manage on both domains; category, taint, index and the log entry in one transaction (AC-DOC-6; A.3 `health → documents`) | pgTAP + app + e2e | 7A/7C | green |
| DOC-04 | Scoped sharing and unshare in one action: one object, one person, never the domain, never derived objects — checked from the grantee's live context (AC-DOC-5, AC-PERM-10) | pgTAP + app + e2e | 7A/7C | green |
| DOC-05 | The upload routes bounded at ingress (size, budget) and the five upload-path fetches bounded (D15 item 5, D17 item 7) | app | 7C | green |
| PPL-01 | The list: every person, subjects as people with custodians named (AC-PPL-3), invites pending/expired, **the plain-language line per subject before any matrix from ONE module pinned to `hc.tier_defaults`** (AC-PPL-2), with its two stated limits | app + e2e | 7C | green |
| PPL-02 | Adjust: per subject per domain; raise through step-up, lower without; the care-circle ceiling never offered above; every change rendered in the log with both levels (AC-PERM-5 surface half) | app + e2e | 7C | green |
| PPL-03 | Revoke: sessions, the pre-revocation document URL, cached responses, object shares — each its own leg; the honest limit in the PRD's words; the channels this slice does not reach NAMED (AC-PPL-4 partial, said so) | e2e | 7C | green (four channels); RLS-11b/DEL-01 hold the rest |
| PPL-04 | The access log rendered and printable; filtered by the reader's access by construction; denials never name the object (AC-PPL-5 surface half, AC-PPL-7) | app + e2e | 7C | green |
| PPL-05 | Contribution as plain counts — no chart, bar or percentage anywhere on the surface, asserted over the rendered tree (AC-PPL-6) | app | 7C | green |
| NAV-01 | Nav composition follows access per tier (caregiver: Tasks · Account; summary family: Timeline · Documents · People · Account); hiding is a courtesy, the URL constructed by hand is refused by the gate | app + e2e | 7B/7C | green |
| RCP-02 | *(flip — pending tagged 7 since 6B)* AC-INBOX-9 in full: every receipt link resolves to the created object, documents and profile facts included | app + e2e | **7** | **green (7C)** |
| A11Y-09 | Tasks/Timeline: filters and the assign flow keyboard-operable end to end; subject labels never by colour alone; 390 px and desktop | e2e | **7** | green (7B) |
| A11Y-10 | People & roles: the plain line first; the matrix keyboard-operable; meaning never by colour; the printed log readable | e2e | **7** | green (7C) |
| A11Y-11 | The Documents viewer: page navigation by keyboard; the machine-read sibling reachable as native text is; 390 px | e2e | **7** | green (7C) |
| UXA-04 | The People & roles sentences, the revocation copy and the re-categorisation confirmation read at round 26 | review | 7C | **pending** until read |
| LOG-03 | *(the accepted exposure — Q2 SETTLED)* the `artifact_read` entry's commit round-trip: one round-trip's worth of refused reads may be recorded as reads — over-reporting a read, never under-reporting one; **ACCEPTED at the slice-7 gate, no DDL, M6 unconsumed** (ADR-0027 D17 item 4, D22 item 6) | ruling | 7A | **never green** — an accepted-risk row carrying the exposure |

**Rows that do NOT move:** RLS-11b (`pending`, 2+ — the notification and
export channels; this slice says so on the screen), FRZ-16b, DEL-01,
ADM-01, SIG-01 (still NOT absorbed, fourth slice running), G12-01 (`gate`),
AC-INBOX-5/13 (no row flips on a shape that is not built). **No row flips
outside a ruling; pending never counts as green.**

---

## What stays out, NAMED — the exclusion list

Nothing below is forgotten, and none of it is quietly absorbed. Each has a
home.

- **Search (§11.1 row 8; PRD §4.3.6, §4.7.3)** — content search across
  documents, timeline and tasks, permission-filtered before ranking and
  snippeting, post-filter counts, no autocomplete. **Why:** its machinery
  is 1D's (DSC-01, RLS-11a) and its surface needs records to search;
  AC-DOC-1's search half, AC-DOC-4 and AC-TL-1's *"through search"* are
  slice 8's rows. **Home:** slice 8.
- **Home (row 9), Admin (row 10), Notifications (row 11 — PRD §4.8's
  eight emails, the revocation notice's send-time check, §4.6.3's *"who is
  told"*).** RLS-11b's notification channel stays `pending` and the People
  & roles sentence is drawn not to promise it.
- **Export and deletion (G5, G6; DEL-01, FRZ-16b), the admin wrappers
  (ADM-01), the `exports` bucket.** The revocation table's *"exports
  already generated"* row has nothing to revoke yet and says so.
- **Episode DRAFTING** (PRD §4.4.2's threading — *"an episode is a
  proposal like any other"*). The interpretation pass (slice 5) drafts
  tasks, events, documents, facts and conflicts and does not draft
  episodes; 7B renders episodes that exist and never conceals their events.
  **Home:** a slice-5 seam item, put to the owner when the corpus carries
  an episode case; it is not a destination-surface question.
- **The Person profile as a surface** — PRD §3.3, Phase 2. The subject's
  People & roles entry carries the profile facts at `view` so the receipt's
  link resolves (Q4(b)); the structured profile of PRD §5 is not built.
- **Multi-attachment group review (AC-INBOX-5/13)** — priced in Q4, its
  reader the Care Inbox, its home a Care Inbox increment; rows stay
  `pending`.
- **ADR-0028 D8 items 1, 3, 5a** (render + OCR off the request process,
  the heartbeat, the ledger seen firing) — owner-held; D13's harness is
  their prerequisite. **D17 item 8** (a hosted runtime looked at) — owner
  track. **Four of the nine unbounded fetches** (mail, postmark inbound,
  the two worker fires) — the pipeline's and slice 11's, not a destination
  surface's.
- **Parent login** (CIR-06 is one UPDATE; no surface), **time-boxed shares**
  (Phase 4), **caregiver ingestion** (Phase 2), **Memories / Family Album**
  (the CONNECTION group does not render — a decision, not a stub).
- **The >25 MB single-use download path** (TSD §1.3's reserved allowance,
  `artifact_grants`) — not built, not needed: the viewer streams pages
  through the route.
- **SIG-01** — the runtime exists; the KMS key and ledger store are
  deploy-level. Stays `pending`, still not absorbed, fourth slice running.
- **The G3 activation rows, the G9 blind run and its sign-off, the two G4
  deploy rows and G7's hardening set** — deploy-level and owner-track,
  untouched by this slice (Q6).
- **Anything under `lib/ai/`** — by constraint, not by omission: the hash
  must not move.

---

## G12 per increment (Q5)

`e2e/audit-manifest.ts` is pinned to the filesystem both ways; every
`page.tsx` this slice adds fails vitest until its leg is named. What the
audit list gains:

| Increment | New routes in the manifest | Legs | Rows |
|---|---|---|---|
| **7A** | none | none (no surface) | none |
| **7B** | `/[circle]/tasks/[task]`, `/[circle]/timeline/[event]` | a11y.spec: *"the record surfaces: tasks and timeline, list and detail, audited at 390px"* (axe WCAG 2.2 AA with contrast on, touch targets, no horizontal scroll); a keyboard leg for the filters and the assign flow — **A11Y-09** | A11Y-09 opens `pending` tagged 7 at the gate, flips green at 7B |
| **7C** | `/[circle]/documents`, `/[circle]/documents/[document]`, `/[circle]/people`, `/[circle]/people/[member]`, `/[circle]/people/[subject]`, `/[circle]/people/log` | a11y.spec: *"the documents family"* and *"the people family"* audited at 390 px; keyboard legs for the viewer's page navigation (**A11Y-11**) and for the plain-line-then-matrix flow (**A11Y-10**); a print-media leg for the log | A11Y-10, A11Y-11 open `pending` tagged 7, flip at 7C |

**G12-01 stays `pending` at `gate`.** Slice 7 completes two of the four
surfaces the gate is verified on (permissions, document rendering); the
gate is the owner's audit against the BUILT surface before the first
non-founder invitee, with its named watch items (1.4.11 boundary,
`CONTRAST_EXEMPT` uses, avatar initials, nav tier-awareness) — and the
nav's tier-awareness is exactly what NAV-01 renders, so G12-01's fourth
watch item becomes checkable here.

---

## The owner track, in parallel — and why the plan does not depend on it (Q6)

**Sequence:** G3's four written terms (G3-1…4 on `ai-provider.md`, per
workspace) → the BLIND run — `node scripts/ts-run.mjs scripts/eval/run.ts
--submit` then `--collect <batch>` — against **`hc-6b-3+ff1435280a36f8eb`**
(G9-1's sequencing condition MET, recorded 2026-08-28) → the owner reads
the per-field precision/recall against `g9-corpus-spec.md` §6 and signs
the bands in an ADR (G9-2) → the manifest digest into `BAND_ARTIFACT_ALLOWLIST`
in the same commit (G9-3) → G9-4 holds the pair.

**Nothing in the four destinations needs a signed band.** They render
approved objects — a task, an event, a document, a fact — none of which
carries a band (slice-6 Q4: *"no band is ever stored on a fact"*). What a
signed band would change, per surface, so it is not rediscovered:

| Surface | With `uncalibrated` / `all_high` (today) | With a signed band | Difference |
|---|---|---|---|
| Tasks, Timeline | Provenance line; no confidence shown | The same | **None** — a destination shows where a thing came from, not how sure the model was |
| Documents detail, *"what we read out of it"* | Each fact with citation and its `risk_class` word; **no band word** | The review screen would show `medium`/`low` per field at review time; the destination still shows the fact as approved, with its citation | **None on this surface.** If the owner ever wants *"read under calibration X"* shown, it is the run's `(model_id, prompt_version)` already on the extraction — a label, not a build |
| People & roles | — | — | **None** |

**The one thing slice 7 must do for the owner track is nothing:** no
change under `lib/ai/`, so `configurationHash()` and `PROMPT_VERSION` stay
`hc-6b-3+ff1435280a36f8eb` and a submitted batch stays shippable.

---

## Owner decisions — SETTLED 2026-08-28 (the plan-gate rulings)

The owner ruled on the six batched questions at the plan gate, 2026-08-28,
in session. **Every recommendation was accepted as written.** Recorded
verbatim — the option label the owner selected, quoted exactly; the build
executes on these. The questions as put, with the alternatives that were
rejected, are preserved below for the record (the slice-5 `561a105` /
slice-6 pattern).

- **Q1 — SETTLED:** *"7A → 7B → 7C, three increments (Recommended)"* —
  7A DB (M1–M6) → round 24; 7B Tasks + Timeline → round 25; 7C Documents +
  People & roles → round 26. Branches `slice/7-destinations`,
  `slice/7b-record-app`, `slice/7c-documents-people-app`. Taken on the
  three tree facts, not on precedent: no member write to a task exists at
  any layer, the two pairs have different oracles, and 6B's shape cost five
  rounds.
- **Q2 — SETTLED:** *"≤ 6; accept the one-round-trip window (Recommended)"*
  — M1 `task_assignment` · M2 `task_lifecycle` · M3 `document_audience` ·
  M4 `record_reads` · M5 reserved for round-24 dispositions · M6 reserved
  and NAMED for ADR-0027 D17 item 4's DDL exit, **and that exit is not
  taken: the one-round-trip window is ACCEPTED**, carried by LOG-03 as a
  never-green exposure row, so **M6 closes UNCONSUMED and the bound closes
  at 5 of ≤ 6.** `documents.summary_text` stays at `summary`. Anything past
  the bound is a recorded owner amendment before a line is written; shipped
  migrations are never edited.
- **Q3 — SETTLED:** *"ADOPT — refreshed PR, merged before the 7A kickoff
  (Recommended)"* — `chore/process-retune` is adopted at this gate: its own
  PR, refreshed onto `main` (the owed ledger populated with the live owed
  set at `7fdca4e`, the intake note corrected from "D17 = 39" to 0), pushed
  to `origin`, owner-merged **before** the 7A build kickoff — and recorded
  as NOT docs-only (the four `pre*` preflight hooks, the CI lint test, the
  un-ignored `CLAUDE.md`/`AGENTS.md`). **Tiers, ruled here: 7A Tier 1 ·
  7B Tier 2 · 7C Tier 1.** A tier is never lowered mid-slice. Round 25
  collapses to the Tier-2 shape; the Tier-3 pass is batched at close-out
  and carries D17 item 5's leg quota; `docs/owed.md` is the live ledger
  under the 25-OPEN cap.
- **Q4 — SETTLED:** *"Ratify as a block: (a) group review NOT in slice 7,
  home a Care Inbox increment; (b) profile facts on the subject's People &
  roles entry at view, RCP-02 closes at 7C (Recommended)"* — the priced
  table stands as placed: D15 items 1, 3, 4 and D8 item 2 and D17 items 1,
  2, 6 at 7B B1; D15 items 2, 5 and D17 item 7's upload-path five at 7C;
  D17 item 3 as the per-page budget ruling; item 5 as the quota; D8 items
  1, 3, 5a and D17 item 8 NOT THIS SLICE, named with their homes.
  AC-INBOX-5/13 stay `pending`, home a Care Inbox increment (6C) before
  slice 8. **RCP-02 flips green at 7C**, in full.
- **Q5 — SETTLED:** *"Open A11Y-09/10/11 pending tagged 7, flip inside
  their increments; G12-01 stays pending (Recommended)"* — the three rows
  open `pending` tagged **7** in `docs/coverage.md` in this PR (the A11Y-07
  precedent: built INTO each surface), A11Y-09 flipping at 7B and
  A11Y-10/11 at 7C; the audit manifest grows mechanically; **G12-01 stays
  `pending` at `gate`.**
- **Q6 — SETTLED:** *"Record as stated: parallel track, no lib/ai change in
  slice 7, a signed band changes nothing on the four surfaces
  (Recommended)"* — the owner track (G3 terms → the BLIND run against
  `hc-6b-3+ff1435280a36f8eb` → signed bands → allowlist in the same commit)
  runs in parallel and nothing here depends on it; **no unit in slice 7
  touches `lib/ai/`**, so the hash cannot move; the per-surface table stands
  so the answer is not rediscovered.

**Four consequences of the rulings, recorded so nothing is inferred
later:**

1. **The migration bound is expected to close at 5 of ≤ 6.** M6 is not
   consumed because Q2 took the zero-DDL exit for D17 item 4. A build
   session that finds it needs M6 anyway is finding something this gate
   did not foresee — an owner amendment with its reason stated, not a slot
   that was always going to be spent.
2. **The retune PR is a PRECONDITION of the 7A kickoff, not of this plan.**
   This plan lands docs-only on `main` first; the refreshed retune lands
   second; 7A's kickoff is written against both. Until the retune is
   merged, the tiers above are recorded rulings with no mechanism behind
   them — they bind when it lands.
3. **Two coverage rows move in this PR and no verdict does.** SHR-02 is
   re-tagged `2+ (tasks surface)` → **7** (its function is 7A M1, its
   surface 7B B2; still `pending`), and A11Y-09/10/11 open `pending`
   tagged 7. No row changes colour. The two "live floors" finding (§0
   point 1) is recorded here and in 7B B1; RCP-01's cell is NOT rewritten
   by this session — a session records, a round rules (ADR-0025 D6), and
   round 24's packet carries it.
4. **Nothing here activates anything.** G4/G7 block, G9 stays OPEN,
   `BAND_ARTIFACT_ALLOWLIST` stays EMPTY, SIG-01 is NOT absorbed, no real
   family data, no credential in CI or the gate, and the pair
   `hc-6b-3+ff1435280a36f8eb` does not move.

---

## The questions as put to the owner — preserved for the record

**All six were SETTLED on 2026-08-28 and every recommendation was
accepted; the rulings are above.** This section is kept unchanged from the
pre-gate draft — the recommendations as they were argued, and the
alternatives as they were rejected — so a future reader can see what the
owner was choosing between rather than only what was chosen.

**The standing rule, which did not have to be exercised here:** an unanswered question defaults to NOT PLANNED, and
the build does not start. Each question carries the recommendation the
build would execute on, and names the alternative and why it was not
recommended.

**Q1 — The split.** **Recommended: THREE increments — 7A (DB, M1–M6) →
round 24 → merge; 7B (Tasks + Timeline) → round 25; 7C (Documents +
People & roles) → round 26.** On three tree facts, not on precedent:
(1) `hc.assign_task` does not exist and no member write to a task exists
at any layer, no audience change, no unshare, no member-readable view of
another member's grants, of shares or of provenance — so a DB increment is
not optional; (2) the four surfaces are two pairs with different oracles —
compositions over shipped functions (Tasks, Timeline) and the security
posture made visible (Documents, People & roles) — and the second pair
wants the G8 lens on its own; (3) 6B's one-increment shape (135 files,
rounds 18–23) is the cost being avoided. **Alternative: 7A → one app
increment (all four)** — defensible if the owner prefers one wide round
over two narrower ones; it repeats 6B's shape knowingly. **Alternative:
zero DDL, one app increment** — rejected in Q2. Branches
`slice/7-destinations`, `slice/7b-record-app`, `slice/7c-documents-people-app`.

**Q2 — The migration bound. Recommended: ≤ 6** — M1 `task_assignment` ·
M2 `task_lifecycle` · M3 `document_audience` · M4 `record_reads` · M5
reserved for round-24 dispositions · **M6 reserved and NAMED for ADR-0027
D17 item 4's DDL exit** — and **recommended with it: rule the one-round-trip
window ACCEPTED** (the log errs toward over-reporting a read; a never-green
coverage row carries the exposure), so **M6 closes UNCONSUMED at 5 of ≤ 6**.
**`documents.summary_text` stays at `summary`** (TSD §3.4's recorded
reading; the family ceiling copy is written against it; reversing is a
table split for no sentence that asks for it). **The zero-DDL alternative,
priced:** the four surfaces read and two cannot write — no assignment,
claim, completion or snooze (AC-TASK-1/2/5/6/7 unmet, SHR-02 pending a
fourth slice), no re-categorisation (AC-DOC-6), no unshare (AC-DOC-5), no
list of what others can see; RCP-02 would still close, which is why it is
the wrong bar. Anything past the bound is a recorded owner amendment
before a line is written; shipped migrations are never edited.

**Q3 — `chore/process-retune`. Recommended: ADOPT at this gate — as its
own PR, refreshed onto `main` first (the owed ledger populated with the
live owed set at `7fdca4e`, its intake note corrected from "D17 = 39" to
0, rebased or merged from `7fdca4e`), pushed to `origin`, merged by the
owner BEFORE the 7A build kickoff — with the owner told plainly that it
is NOT a docs-only PR** (four `pre*` hooks in `package.json` that run
`scripts/preflight.mjs` before every stack command; `tests/lint/process.test.ts`
in CI; `CLAUDE.md`/`AGENTS.md` un-ignored). Measured: zero conflicts on a
trial merge onto `7fdca4e`, its 26 tests green there. What it changes for
this plan is stated in the process-check section: tiers per increment
(**7A Tier 1 · 7B Tier 2 · 7C Tier 1**, declared as an owner ruling here),
the Tier-2 collapse for round 25, the batched Tier-3 pass at close-out
(with D17 item 5's leg quota), owed intake as a bound, `docs/owed.md`
live under the cap. **Alternative: DEFER to slice 8** — this plan runs
under the standing ceremony (three full rounds, the two-commit
dispositions round, the separate markers PR) and the retune is revisited
with a slice's more evidence; cheaper today, and the round-18-to-23 cost
is repeated. **Alternative: DROP** — recorded as available; nothing in
the tree depends on it.

**Q4 — The inherited obligations, placed. Recommended: the table as
priced, ratified as a block, with two sub-rulings:** **(a)** multi-attachment
group review is **NOT in slice 7** — its reader is the inbox; home a Care
Inbox increment (6C) before slice 8, or slice 7's optional fourth
increment if the owner wants it sooner; AC-INBOX-5/13 stay `pending`.
**(b)** the profile facts' Phase-1 home is **the subject's own People &
roles entry at `view`**, so RCP-02 closes at 7C in full — the alternative
is RCP-02 `pending` a fourth slice on a Phase-2 surface. The five D15 code
items land inside the increments that touch their files (1, 3, 4 at 7B
B1; 2, 5 at 7C), so no comment-only gate re-run is needed; D8 item 2 is
7B B1; D8 items 1, 3, 5a and D17 item 8 are NOT THIS SLICE, named with
their homes; D17 items 1, 2, 6 at 7B B1, item 3 as the per-page budget
ruling, item 5 as the quota, item 7's upload-path five at 7C.

**Q5 — G12 per increment. Recommended: A11Y-09 (7B), A11Y-10 and A11Y-11
(7C) open `pending` tagged 7 at this gate and flip inside their
increments** — built INTO each surface (the A11Y-07 precedent: a
structural failure found at G12 *"is a redesign, not a fix"*); the audit
manifest grows mechanically by every new `page.tsx`; **G12-01 stays
`pending` at `gate`.** **Alternative: no new rows, the existing a11y leg
families extended silently** — rejected: a row is what makes a leg's
absence visible.

**Q6 — The owner track. Recommended: recorded as stated** — the sequence
G3 terms → BLIND run against `hc-6b-3+ff1435280a36f8eb` → signed bands →
allowlist in the same commit; **no unit in slice 7 touches `lib/ai/`**,
stated as a constraint so the hash cannot move for free; and the
per-surface answer that a signed band changes **nothing** on the four
destinations, recorded so it is not rediscovered. There is no alternative
to put; the question is whether the record says it.

---

## Completion recipe (per increment) + gate cadence

**Per unit:** a red commit carrying **the failure signature in the
message** → green → the unit's tests join the suite. No unit is "done"
without both commits in the history.

**At each increment head:** clean-leg reset exact-N (69 + M at 7A) ·
pgTAP all green with the count recorded exactly · concurrency all green
(**teed**) · `db:verify` clean under `--fail-on warning` · upgrade leg
green · vitest all green (count recorded exactly, by run, not by
discovery) · **local gate: walkthrough 11/11 + a11y 7/7 + ingestion 8/8 +
extraction 5/5 + review 7/7 UNCHANGED, plus the new legs — the new total
stated exactly, never as "unchanged"** · `docker logs hc_clamd` and
`docker stats` read BEFORE the gate, leg 38's duration recorded ·
lint/typecheck/production build clean, each run SOLO · gitleaks clean ·
coverage rows flipped with refs and pendings annotated, **never early** ·
the deltas ADR (**ADR-0032** for 7A, numbered as the cadence produces
them) · a review packet in the round-8 shape: head ledger from the start,
a one-SHA evidence block from the DECLARED head, per-directory tree
binding, the ledger's last row naming every document that moved after the
evidence head, pointed questions with recommended answers — **or, under
the retune, the Tier-2 collapse for 7B.**

**The gate cadence, each leg its own fresh session (ADR-0006):** this plan
→ **owner rulings on Q1–Q6** (recorded verbatim here, status → RULED) →
**the refreshed `chore/process-retune` PR, owner-merged (Q3 SETTLED)** → 7A build red→green
(**M1 FIRST**) → round-24 packet → third-party review → dispositions
(ADR-0033) → owner sign-off → **merge (never squash)** → 7B build (**B1
FIRST** — the floors and the gate) → round 25 → dispositions → sign-off →
merge → 7C build (**C2's fence FIRST** — the byte path asserted before a
viewer exists) → round 26 → dispositions → sign-off → merge.

**Standing constraints throughout.** Repo authoritative, the vault holds
pointers (`projects/harpers-circle/00-index/status.md` is dated 2026-08-23
and six rounds stale; refresh the pointer after this plan lands, not
before) · **main stays green** · DDL only within the bound, **shipped
migrations never edited** · **every dependency argued WITH its licence,
verified from the installed manifest** · **never real family data; under
G9/G3 never a real document to a provider: fixtures only, CI KEYLESS, the
eval harness the sole real-key path** · browser legs **LOCAL-gate only** ·
`supabase:supabase-postgres-best-practices` **before any DDL authoring** ·
**`claude-api` before ANY change under `lib/ai/` — and this slice makes
none** · `vercel:nextjs` and the AGENTS.md `node_modules/next/dist/docs/`
guides **before route work** · `frontend-design` only if a surface needs a
primitive the slice-3 system lacks — **compose, don't invent** (design
spec §5's card, pill, avatar, legend; §7's plain counts and human dates) ·
**pending never counts as green** · G12 still blocks the first non-founder
invitee · G4's deploy rows and G7's hardening set stand · **owner sole
merge authority, merge commit never squash** · **a session records, a
round rules** — no verdict moves in a build session.

**The transient protocol, unchanged and still binding.** A vitest failure
under load that will not reproduce is an **UNREPRODUCED TRANSIENT**, never
claimed as diagnosed. A "Start local Postgres" `toomanyrequests` CI failure
is the ECR Public anonymous quota. Never interrupt a `db:reset`; a
post-reset Kong 502 is `docker restart supabase_kong_HarpersCirclev3`.
Line endings: the working tree is CRLF, the blob is LF, `* text=auto` —
measure with node, assert as a property, say which side.

---

## What this planning session measured against the kickoff

Every figure in the kickoff was treated as a prediction. **All of these
reproduced exactly at `7fdca4e`:** `main` = `7fdca4e`; the four PRs and
their SHAs; migrations 69; pgTAP 65; package.json 13/15; `PROMPT_VERSION_NAME`
hc-6b-3 and the pin `ff1435280a36f8eb`; vitest 953 tests / 78 files (by
discovery); 38 gate legs in 5 files (by discovery); D17 = 113 · 67 · 21 ·
19 · 0 · 3 · 2 · 1 (by row, parser validated against D25's tally); CI
green at `7fdca4e` (run `33241803339`); the vault status dated 2026-08-23;
`chore/process-retune` local-only; the nine unbounded fetches; the 35
`withRequestRole` sites; the 9 pending coverage rows; RCP-02 the only row
tagged 7.

**Three things the record carries that the tree contradicts, recorded
here, no verdict moved:**

1. **"Tasks and Timeline are live RLS reads"** (slice-6 plan; RCP-01's
   cell; the receipt's own comment). The two pages select columns that do
   not exist and render their empty state unconditionally. The links
   resolve to pages that cannot render a row. → 7B B1.
2. **"Twelve page gates"** (ADR-0028 D8 item 2, `session.ts:32-33`,
   `:138-141`). Ten pages redirect; D15 already corrected the enumeration
   to 21 sites and the code comments did not follow. → 7B B1.
3. **"Seven awaited and two eager"** (`lib/storage/fetch.ts:21-33`;
   ADR-0027 D22 item 4). Two of the "awaited" sit inside `after(...)`;
   the split is five and four. The count of nine holds.

**One thing the kickoff got wrong:** `chore/process-retune` is not a
docs-only PR (Q3). And one it left open that the tree answers: profile
facts have no Phase-1 surface by PRD §3.3 (Q4(b)).
