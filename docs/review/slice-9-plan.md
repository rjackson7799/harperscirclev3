# Slice 9 — Home: the slice plan

**Status: PLANNED — RULED. Q1–Q9 SETTLED 2026-09-03 at the plan gate, every
recommendation accepted as put** — the owner's words: *"go with your best
recommendation for each open item"* — recorded under *Owner decisions* below,
each with its consequence. **Nine ruled AS PUT, zero departures; nothing in
slice 9 is NOT PLANNED.** ADR-0006's default — *an unanswered question is NOT
PLANNED and the build does not start* — did not have to be exercised: the
rulings brief arrived with its owner block blank, this session put the nine
back rather than read a blank either way, and the words above are the answer.
The rulings were recorded on `docs/slice-9-rulings`, branched from
`origin/main` @ **`ad9d058`** (PR #44, a true merge commit, parents `7cf16ec`
+ `37ff3fe`; CI on `main` at that SHA confirmed SUCCESS). Nothing here is a
finding: slice 8's close-out ruled twenty-one questions and stamped
ADR-0040/0041/0042 `accepted`, and where this plan disagrees with a settled
ruling it files a **dissent** and says so.

Written at `docs/slice-9-plan` @ `500ee9e`, branched from `origin/main` @
**`7cf16ec`** (PR #43, a true merge commit, parents `7ef2a69` + `56e8b36`).
Every number below was measured this session against that tree, with the
parser named where one exists. Docs-only: this PR writes no coverage row and
no ledger row — those are the first build commit's, per the slice-8
precedent.

---

## 0. What this slice is, stated before it is planned

Slice 9 is **Home** — TSD §11.1 row 9, *"Day-one card, then the router. Last,
because it summarises everything before it"*; PRD §4.7. It is the last
person-facing surface of the record: after it, Phase 1 has Admin (slice 10)
and Notifications (slice 11) and nothing else.

**Home is a router, not a dashboard** (PRD §4.7 preamble). Its job is to send
you to the one thing that matters right now. That is the whole product
argument, and it is also the whole risk argument, because a router *names
things*. Every other surface answers one question about one domain. Home
answers *"what needs you?"* across all of them at once — so a permission
mistake on Home is a **composition** across nine surfaces rather than a single
bad read, and it is visible on the screen a family opens first.

**Two things are inherited and neither is Home.** `FRZ-17`/`OW-27` is a real
defect found at slice 8's close-out whose fix is DDL, and ADR-0043 D6 files a
dissent recommending that slice 9 open with a commissioned adversarial pass
over 8A's merged M1 and M2. Both are ruled below, in the bound, rather than
carried.

**Four criteria, and they do not share a layer.** AC-HOME-4 is **already
green** — `SRCH-04`, flipped at 8B, and it is not re-earned here. AC-HOME-1
and AC-HOME-3 are provable over the rendered tree. **AC-HOME-2 (*"a member can
tell in five seconds what needs them"*) is provable by nothing in this repo**
— PRD §1446 and TSD §11.4 both name it a moderated protocol, five
participants, PRD Appendix B. It gets a row that is never green in this
slice, not silence.

---

## THE HARD GATES — how this slice builds under them

`G4` and `G7` still block: nothing is production-activated, no forwarding
address is real, no invite is sent. **Home therefore renders a forwarding
address that does not yet accept mail**, and the day-one copy must be true
under that condition — it already is, because §5.1's address exists in the
record from setup and its *activation* is what G4 gates.

`G9` OPEN and `G3` open: **the AI layer has no path to Home.** That is not a
build constraint to be honoured carefully, it is AC-HOME-3's whole mechanism
(TSD §2210: *"No number on Home is model-computed — the AI layer has no path
to Home"*), and it is fence-testable rather than argued.

`G12` is the final gate and **a structural accessibility failure found there
is a redesign, not a fix.** Home is grids of cards over a `main + rail`
(`design_spec` §4) and its legs are built into the surface, not added after —
`A11Y-13` below.

`G2`/`G8` (permission and derived-data red-team) are the gates Home's
composition rule answers to. It composes; it must not widen.

---

## What exists — do not rebuild. Verified against the tree this session.

- **No `app/(app)/[circle]/page.tsx`.** Home does not exist. The circle root
  is an unrouted path today; `app/page.tsx` redirects by session (`/setup` or
  `/sign-in`) and `app/setup/complete/page.tsx` sends the founder to
  `/{circle}/invite`.
- **The shell is built.** `app/(app)/[circle]/layout.tsx` renders `TopBar` +
  `LeftNav` + `Shell`, already carries the §4.7.3 search field and its
  subject-dependent placeholder, and already degrades on `unavailable`.
  **`components/shell/nav-manifest.ts` has no Home entry** — slice 9 adds one,
  and `navFor()`'s tier courtesy must be ruled for it.
- **Every read Home needs already exists in `lib/hc/`**, RLS-true, through the
  request-role channel: `productStates` (arrivals/inbox), `listTasks` +
  `myMembership` + `circleSubjects` (tasks), `listEvents` with `from`/`to`
  date bounds and `subject: 'all'` (what's coming), `circlePeople` and
  `profileFactsFor` (how each subject is), `accessLog` (recent activity).
  **`lib/hc/timeline.ts`'s `EVENT_SELECT` is app-side SQL over RLS-true
  relations** — so a descending "most recent filings" read is an app change,
  **not DDL**. This is what makes the migration bound as small as it is.
- **`hc.circle_people` carries `frozen`** (`20260829120004`, replaced by
  `20260829120005`) — Home can say a circle is frozen from what it already
  knows, exactly as 8C's surface does.
- `AnswerBudget` / `withPageBudget` exist (`lib/http/page-budget.ts`) and
  `tests/lint/answer-budget.test.ts` holds every page to them.

---

## THE THINGS THAT MUST BE SETTLED BEFORE A SCREEN IS DRAWN

### 1 — A block whose read returns nothing renders NOTHING, never a zero

PRD §4.7.2 gives Home five blocks. Each is an aggregate or a top-item name
over a domain, and **the caller's reach differs per domain**: a `care_circle`
member holds Tasks and nothing else; a `family` member holds Timeline,
Documents and People; only a coordinator holds everything.

The rule, one sentence covering all five: **every Home block is rendered from
the SAME RLS-true read its destination surface uses, and a block whose read
returns nothing renders nothing at all — not a zero, not an empty state, not
a heading.**

A rendered `0` is not neutral. *"What needs review: 0"* shown to a member who
cannot see the Care Inbox tells her the inbox is empty, which is a claim about
rows she is not entitled to enumerate — the A.3 derived-data class, on the
surface with the widest audience. The absence of the block claims nothing.

This also *is* AC-HOME-1's *"and nothing else"*, which is why one rule buys
both: a day-one circle has five empty reads, so all five blocks disappear, and
what is left is the instruction and the address.

### 2 — The day-one branch is chosen by a read the caller can actually make

AC-HOME-1's condition is *"a circle with no arrivals"* — a fact about the
**circle**. The reads available to Home are facts about **what the caller can
see**. Those are not the same fact, and conflating them is a leak.

If Home branches on *"the arrivals read returned zero"*, a `care_circle`
member on a busy, established circle sees the day-one card — telling her, by
inference, that she cannot see arrivals, and showing her an instruction
addressed to somebody else (the day-one card's job is *get the family to
forward something*, which is the coordinator's job, not hers).

**Ruling recommended: the day-one card is shown only to a caller whose
arrivals read SUCCEEDS AND RETURNS ZERO.** Every other caller gets the router.
A router whose blocks are all empty renders one honest line of its own —
*"Nothing here needs you right now."* — and never the day-one card. That is
one new string and it closes the channel.

### 3 — "Recent activity" must not be the tail of an ascending `limit 300`

`listEvents` orders `sort_at asc` with `limit 300`. Taking the tail of that
for *"the last few filings"* is correct on a small circle and **silently wrong
on a circle past 300 events** — the most recent filings are exactly the rows
the cap drops. This is `OW-26`'s defect class (a limit with no cursor on the
surface whose purpose is to show the recent thing), one slice after it was
fixed for the access log.

**Recommended: Home's recent-activity read is its own descending, small-limit
read** — an app-side change to `lib/hc/timeline.ts`, no DDL — and the
assertion is driven against a fixture with more events than the cap, never
against a fixture where ascending and descending agree.

### 4 — Every number on Home is a COUNT of rows the caller can see

AC-HOME-3 forbids two different things: a number *computed by the AI*, and a
number *presented as an assessment of the parent*. The first is fence-testable
(`lib/ai/` has no path to the surface). The second is a copy-and-composition
rule: Home shows counts and names, never a derived index, never a trend,
never a ratio. PRD §4.7.2's exclusion list — *"metrics, charts, scores,
progress, or any number the family did not put there themselves"* — is the
authority, and it is asserted as **absences over the rendered tree**, the
`SRCH-04` shape that has already worked once.

### 5 — Five blocks in one page means one budget, not five

Home is the first surface that composes five independent reads. `OW-03`'s
ruling (every destination page inside an `AnswerBudget`) applies, and the
honest slow answer is the overrun's rendering. **One `withPageBudget` around
the whole composition**, not one per block: five budgets that each pass while
the page takes six seconds is the failure the budget exists to prevent.

PRD §13.2 puts a record surface at **p95 1.5 s, ceiling 3 s**; PRF-06's
DB-level page tripwire is 250 ms. Home's p95 is **measured at the 9B head**,
not asserted.

---

## Migration bound (Q2 — SETTLED 2026-09-03): **≤ 4** — M1 planned; M2, M3, M4 reserved and NAMED

**Bounds are FRESH.** Slice 8 closed at **2 of ≤ 4** with M3 and M4
UNCONSUMED; that bound is spent and closed and does not carry. **The migration
bound does not exist until this gate sets it.**

**Migrations on disk: 76** (`supabase/migrations`, counted this session).
**pgTAP files: 71** (`supabase/tests`, `000`–`071` with `065` unused), Σ
**1,863** at 8A's `4d166c0`.

| # | File | Contents | Closes |
|---|---|---|---|
| **M1** | `claim_task_freeze_guard` | **`create or replace function hc.claim_task(p_task uuid)`** restating the body with the explicit `if exists (select 1 from public.freezes f where f.circle_id = v_task.circle_id and f.state in ('open','unresolved')) then raise exception 'freeze_active'` test that `assign_task`, `complete_task` and `snooze_task` each already carry — placed where theirs are, **before** the level test, so no cap can lower it. `language plpgsql security definer set search_path = ''`, and `alter function … owner to hc_internal` plus the `revoke`/`grant` pair **restated in the same migration** (the 2A M8 way). **NO SHIPPED MIGRATION IS EDITED.** | `FRZ-17` · `OW-27` · ADR-0043 D2 |
| **M2** | *(reserved, NAMED)* | **A DDL fix arising from round 31's commissioned adversarial pass over 8A's M1 and M2** (Q4). Consumed only with the finding quoted in the commit. Without this slot a DDL finding against `hc.set_grant` stops the slice for an owner amendment — **naming it is what makes ruling the pass IN cost nothing.** | ADR-0043 D6 |
| **M3** | *(reserved)* | **Round-31/32/33 dispositions** — the standing precedent since 2A. Consumed only by a round's ruling. | — |
| **M4** | *(reserved, NAMED)* | **One composed Home read definer, consumed ONLY on a MEASURED page-p95 breach at the 9B head** against PRD §13.2 (1.5 s target / 3 s ceiling) or PRF-06's 250 ms page tripwire, **with the measured numbers pasted into the red commit.** The five reads are RLS-true and app-side today and are expected to hold; if they do not, the exit is an append, never an edit. If they do, **M4 closes UNCONSUMED.** | PRD §13.2 · PRF-06's breach clause |

**Expected close: 1 of ≤ 4.** M2, M3 and M4 close UNCONSUMED unless their
named conditions arise; **a reserve not consumed closes UNCONSUMED and the
bound closes at what was spent.** Anything past ≤ 4 is a recorded owner
amendment **made before a line is written**.

The tree moves **76 → 77** migrations and **71 pgTAP files unchanged** (M1's
cases are appended to the existing `070_task_claim.sql`, whose `plan(40)` is
re-pinned in the same commit); `072` and beyond only on a consumed reserve.
`supabase:supabase-postgres-best-practices` is loaded **before any DDL is
authored** and stands for the whole 9A build; privilege closure is asserted
**from the catalog, never probed by calling as a denied role** (the PG17
ACL-denial segfault); the reset is clean-leg at the exact new count.

**The zero-DDL alternative, priced honestly.** With no migration, slice 9
still ships Home in full — its reads all exist. What it does not ship is the
`FRZ-17` fix, and `OW-27` is the one row in the ledger with a named home and
an acceptance condition that is pure DDL. Deferring it makes it the thing the
owed ledger exists to stop. **The zero-DDL exit is available and is not
recommended.**

---

## Dependency bound: **0 runtime additions; the dev reserve stays UNSPENT**

`package.json` at `7cf16ec`: **13 runtime · 15 dev**, unchanged from slice 8.

Home composes existing reads into existing components. It needs no date
library (timezone handling is already in `lib/hc/timeline.ts`'s
`occurred_on`/`iana_zone`/`is_floating` triple), no chart library (charts are
excluded by PRD §4.7.2 and by `design_spec` §7), and no state library.
**Every dependency is argued WITH its licence, re-verified from the installed
manifest, with the command's output pasted into the red commit that adds it**
— and slice 9 expects to add none.

---

## The increments, the split, and the tiers (Q1 — SETTLED 2026-09-03)

### The split rule, applied

**An increment may not contain both a Tier 1 unit and a Tier 3 unit.** M1 is a
migration and therefore Tier 1 by the first trigger. Home's copy is Tier 3 by
the last. They cannot ride together, which settles the shape before any
judgment is involved:

### 9A — the freeze guard — **Tier 1**

M1 plus its pgTAP pair. Nothing else. No surface, no route, no component.

Tier 1 by three independent triggers: it **ships a migration**, it **changes a
definer body**, and it is a **freeze/permission guard**. Review is 3–8 lenses,
at least one from a different model family than the author. Evidence is the
full closure set **plus the browser gate, unconditionally** — a migration
replacing a definer body is person-facing through the approve path the gate
exercises, and a kickoff may not narrow this (ADR-0033 D19.14).

Small on purpose. This increment is roughly forty lines of SQL and two pgTAP
cases, and it is Tier 1 anyway, because the tier is set by what a defect
costs in production and not by size.

### 9B — Home — **Tier 2**, ruled DOWN from the fail-closed default

**This tier has to be argued, so by `docs/process/slice.md` §1 it is Tier 1
until the owner rules it down.** The argument, both ways, on the record:

*For Tier 3:* Home ships no migration, changes no RLS policy, touches no
definer, writes nothing, touches no `lib/ai/`, and `git revert` restores the
prior product exactly — there is no prior Home. By the letter of the trigger
table it is UI composition.

*For Tier 2:* Home's defect class is **not** a style slip. It is a read leak
across nine domains on the surface with the widest audience, and Tier 3 buys
**no per-increment review at all** — one batched single-lens pass at
close-out, which is the wrong instrument for a permission composition. §4.7.2
also makes Home the surface where a `0` is a claim about invisible rows.

**Recommended: Tier 2.** One session, attacking the three places the build
names against itself; closure set plus the browser gate, because Home is
person-facing. Not Tier 1, because Tier 1's cost is bought for irreversibility
— a migration and a backfill — and Home's worst defect is fixed with an edit
and a leg. Not Tier 3, because the batched pass cannot see a composition.
**This is the owner's call and the fail-closed default is Tier 1.**

**9B may hold Tier 3 units** (copy, styling) — the split rule forbids T1+T3,
not T2+T3.

### Day one and the router: ONE increment, in this order

They are two states of one page, not two pages. Splitting them ships a
component that renders one branch and cannot render the other, and the day-one
branch is defined by **absence** (*"no grid of empty cards, no '0 documents ·
0 tasks · 0 events', no onboarding checklist"*) — an absence is only
assertable against the same component that renders the presence.

**But the units are ordered, and the order is load-bearing.** Day one is built
**first**, red→green, and its *"and nothing else"* assertion goes green
against a tree where the router does not exist yet. Then the router lands and
**that same assertion must survive it.** Built in the other order, "nothing
else" is written against a page that already has everything, by an author who
knows what to exclude.

### 9B's units

1. **The day-one card** — one instruction, the forwarding address, both
   addresses labelled on a two-subject circle, and nothing else.
2. **The router** — the five §4.7.2 blocks, each from its destination's own
   read, each disappearing when its read is empty.
3. **The nav entry and the routing** — Home in `nav-manifest.ts`, its tier
   courtesy ruled, and the post-setup destination repointed.
4. **Bounds and a11y** — one `withPageBudget`, the measured p95, `A11Y-13`.

---

## Coverage rows to open

`docs/coverage.md` gains **`## 9 — Home (9A: the freeze guard, Tier 1, round
32 · 9B: Home, Tier 2, round 33 — slice-9 plan Q1–Q9; PRD §4.7; TSD §11.1 row
9)`**.

Measured this session with `tests/lint/process.test.ts`'s own parser: **281
rows · green 258 · review 9 · pending 14**, and **no row's ID begins
`HOME-`**. The 14 `pending` are FRZ-16b, RLS-11b, SIG-01, DEL-01, ADM-01,
G12-01, UXA-03, LOG-03, GRP-01, DEP-01, EXE-01, EXE-02, BND-01, **FRZ-17**.

| ID | Assertion (compressed) | Layer | Slice | Status at slice end |
|---|---|---|---|---|
| **HOME-01** | Day one: on a circle with no arrivals Home renders **one instruction and the forwarding address and NOTHING ELSE** — asserted as ABSENCES over the rendered tree (no card grid, no `0`, no onboarding checklist, no empty-state heading); a two-subject circle renders **both** addresses, labelled by name. The assertion survives the router's arrival (AC-HOME-1; PRD §4.7.1) | app + e2e | 9B | green |
| **HOME-02** | The router's composition is RLS-true and widens nothing: every block is rendered from its **destination surface's own read**, a block whose read returns nothing renders **nothing** (never a zero, never a heading), and the day-one card is shown **only** to a caller whose arrivals read succeeds and returns zero — a caller who cannot enumerate arrivals gets the router and its honest empty line (AC-PERM-1's composition half; A.3's channel set) | app + e2e | 9B | green |
| **HOME-03** | **No number on Home is model-computed or an assessment**: every number is a count of rows the caller can see; `lib/ai/` has no import path to the surface, **fence-tested**; no chart, score, trend, ratio or progress indicator in the rendered tree (AC-HOME-3; PRD §4.7.2's exclusion list; TSD §2210) | app + review | 9B | green |
| **HOME-04** | The five §4.7.2 blocks, their order and their copy: how each subject is (name, where they are, the most recent thing on their record — recorded, never assessed) · what needs review (the count, plain, top item named) · my open tasks with dates · what's coming (dated items already in the record, **not a calendar**) · recent activity (the last few filings, **who approved them**). **Recent activity is a descending, small-limit read** proven against a fixture larger than the cap — never the tail of an ascending `limit 300` (PRD §4.7.2; the OW-26 class) | app + e2e | 9B | green |
| **HOME-05** | Latency and bounds: the whole composition inside **ONE** `AnswerBudget`, the overrun rendering the honest slow answer; a **measured** page p95 recorded at the 9B head against PRD §13.2 (1.5 s / 3 s) and PRF-06's 250 ms page tripwire | app + bench | 9B | green |
| **HOME-06** | *(never green in this slice)* AC-HOME-2 — *"a member can tell in five seconds what needs them"* — is verified by the **moderated protocol**: PRD Appendix B, a seeded synthetic circle, five participants. No instrument in this repo can prove it, and this row exists so that absence is visible rather than silent (PRD §1446; TSD §11.4) | review | **gate** | **pending** |
| **A11Y-13** | Home audited: landmark structure and headed blocks, the day-one card reachable and labelled, emphasis not conveyed by colour alone, 390 px and keyboard — **built into the surface, not added after** (§8.7; G12 is a redesign if found late) | e2e | 9B | green |

**`FRZ-17` does not get a new row.** It exists, `pending`, Slice cell `8 → 9`,
and **flips green at 9A** when M1 and its pgTAP pair land — its Slice cell
moving to `9A` at the flip. `OW-27` closes with the same SHA.

**Why HOME-01 is green-able although TSD §11.4 lists AC-HOME-1 as carrying no
TSD mechanism.** §11.4's note says there is nothing *for the schema or the
architecture* to enforce — it classes AC-HOME-1 with *"interface copy and
composition"*. That is true and is not a claim that nothing can test it: an
assertion over the **rendered tree** is exactly the layer that can prove *"one
instruction, the address, and nothing else"*, and `SRCH-04` already proves an
absence set of the same shape. Recorded here because a reviewer checking
§11.4 against this table would otherwise read HOME-01 as an overclaim.

**Rows that do NOT move:** RLS-11b, FRZ-16b, DEL-01, ADM-01, **SIG-01 (still
NOT absorbed, and slice 9 does not absorb it)**, UXA-03, GRP-01, LOG-03 (never
green by ruling), **G12-01, DEP-01, EXE-01, EXE-02, BND-01** (Slice `gate`,
never green in this slice — Q9). **SRCH-04 stays green and AC-HOME-4 is NOT
re-earned by this slice.** No row flips outside a ruling; **`pending` never
counts as green.**

**All rows above are written by 9A's FIRST docs-only commit, quoting the
owner's rulings — not by this PR.**

---

## What stays out, NAMED — the exclusion list

An unlisted surface is out of scope by construction; these are listed so that
nothing here is quietly absorbed later.

- **Metrics, charts, scores, progress, or any number the family did not put
  there themselves** — PRD §4.7.2, by decision, not by omission.
- **Calendar sync.** *"What's coming"* is dated items already in the record.
  Phase 1 has no calendar.
- **Retrieval-augmented Q&A and any prose answer** — §4.7.3, already excluded
  and already asserted green at `SRCH-04`.
- **The marketing surface** (`(marketing)`, TSD §1.7). `app/page.tsx` keeps
  redirecting by session.
- **Admin** (slice 10) and **Notifications** (slice 11).
- **`SIG-01`** — the head-signing worker. No worker runtime exists; not this
  slice.
- **PR #35 (ADR-0039) and PR #36** — both open, neither this slice's, and
  ADR **0039 stays claimed by PR #35**. Slice 9's ADRs start at **0044**.
- **The G12 whole-surface audit** — Q9.

---

## The owed ledger, and the arithmetic (Q7 — SETTLED 2026-09-03)

Re-derived this session with `tests/lint/process.test.ts`'s own parser at
`7cf16ec`: **27 rows · OPEN 1 / 25 · TAKEN 1 · RISK 1 · PROMOTED 6 · CLOSED
18.** The single OPEN row is **OW-27**; the single TAKEN row is **OW-05**.

**Slice 9's intake:**

- **OW-27 → `TAKEN(9A/M1)`**, applied by 9A's first docs commit under the
  OW-04 precedent (a plan-gate ruling is sufficient authority for a ledger
  *status* change; no verdict moves — ADR-0025 D6). It closes
  `CLOSED(<sha>)` when M1 and its pgTAP pair land.
- **OW-05 → `TAKEN(9/Tier-3 pass)`.** The quota is recurring and the leg
  backlog is not clear. Slice 9's pass audits the next **8** legs at the 9B
  close-out. It runs **whether or not slice 9 has a Tier-3 increment** — the
  quota attaches to the slice's close-out, not to a Tier-3 unit.

**The burn-down quota is arithmetically unsatisfiable this slice, and that is
a success condition.** The rule is *"each slice closes at least as many items
as it opens, plus five"*. Slice 9 plans to open **0** and can therefore be
asked to close **5** — but the ledger holds only **two** rows that are not
already `CLOSED`, `RISK` or `PROMOTED`, and one of them (OW-05) is a standing
recurring quota that never closes. **The maximum achievable is 1.**

This is not a defect in slice 9; it is the quota meeting the end of the queue
it was written to drain. It opened at 6 OPEN on 2026-08-29 against a queue
that had been 50 deep. **Nothing enforces the quota mechanically** — the
scanner checks the cap (≤ 25), the acceptance condition and the status
vocabulary, and not the quota — so without a ruling here slice 9 would
silently violate its own rule and no test would say so.

**Recommended reading, put as Q7:** the quota is a **ceiling on growth, not a
floor on work**. It is MET when the OPEN count does not rise and no row is
carried; where the closable population is smaller than *opens + 5*, it is
**satisfied by exhaustion**, recorded as such at the close. Slice 9 opens 0,
closes 1, and ends at **OPEN 0 / 25** if no round opens a row.

**One observation, recorded and moving no verdict.** The slice-8 close-out's
own re-derivation in `docs/owed.md` reads *"27 rows · OPEN 1 / 25 · TAKEN 2 ·
RISK 1 · CLOSED 17 · PROMOTED 6"*. The parser says **TAKEN 1 · CLOSED 18**:
`OW-26` is `CLOSED(2f2c509)` and `OW-05` is the only `TAKEN` row. Both
versions total 27 and **the OPEN count — the only one the cap enforces — is
right**, so nothing failed. It is the round-16 shape in miniature (a document
disagreeing with its own table) and it is recorded here rather than corrected
silently; the correction is a **fact**, not a verdict, and rides 9A's docs
commit.

**A second observation, for the same commit.** `OW-05`'s acceptance condition
reads *"8 legs per close-out — 24 of the 31 by slice end"* against a
denominator of 38 legs. The gate is now **66 legs in 9 files**. The quota is
sound; **its arithmetic is stale** and should be re-derived at the 9B
close-out rather than restated.

---

## The commissioned adversarial pass (Q4 — SETTLED 2026-09-03)

**ADR-0043 D6 files a dissent, not a block:** *"Three merged increments were
attacked by nobody… ruling a Tier-1 increment from its own author's
recommended answers is not the deep review the tier exists to require."* It
recommends slice 9 open with a commissioned adversarial pass over 8A's **M1
and M2 — M2 especially**, the four-part step-up binding nobody outside its
author has read.

**Recommended: IN.** The evidence for it is the dissent's own session: **one
sitting over 8A's SQL produced FRZ-17** — a MAJOR defect that four merged
rounds, a green 66/66 gate, 71 pgTAP files and 1,863 assertions did not see —
**and corrected ADR-0042's adjacent-risk note in the safe direction.** That is
one real defect per one adversarial reading of this increment. M2 is
untested by that experience: it is a `create or replace` over `hc.set_grant`
that **replaced a shipped composition**, it is auth (Tier 1's own trigger
category), and its only reader has been its author.

**Shape, so it is a round and not an informal read:**

- It is **round 31**, slice 9's first. It reviews **8A's M1 and M2 as merged**
  at `main` @ `7cf16ec` — `20260903120001`, `20260903120002`, `070`, `071`,
  and ADR-0040. Findings land **VERBATIM** as
  `docs/review/round-31-findings.md` before anything is argued.
- **Its own session, a different leg, and a different model family from 8A's
  author** — that is Tier 1's review requirement, and the pass exists
  precisely because it was not met.
- It runs **BEFORE 9A's build**, and 9A does not start until its findings are
  landed. The reason is arithmetic, not ceremony: **9A edits
  `hc.claim_task`.** A finding against M1 arriving *before* the guard ships
  rides M1 at zero cost; arriving *after*, it costs a second migration slot
  and a second red→green cycle over a function that was just replaced.
- **Its DDL exit is M2** (reserved, NAMED, above). Slice ritual §4 item 7
  tells a reviewer *"if a finding needs DDL, say so and stop"* — naming the
  slot in advance is what keeps that from stopping the slice.
- Dispositions are a **full ADR (0044)**, Tier 1's form.
- Rounds then run **32** (9A) and **33** (9B).

**What ruling it OUT would mean, stated plainly so the choice is real:** 8A's
M1 and M2 stay merged, unattacked, with ADR-0040 stamped `accepted` on its
author's recommended answers, and the record continues to say a Tier-1
increment was reviewed by nobody. Nothing is production-activated, so the
exposure is bounded; the cost is one session either way.

---

## G12 and the accessibility floor (Q9 — SETTLED 2026-09-03)

**`G12-01` stays `pending` at Slice `gate`.** Its instrument is a WCAG 2.2 AA
audit of the **built** surface against `design-conformance.md` §4, including
the four named watch items (1.4.11 boundary · `CONTRAST_EXEMPT` uses · avatar
initials · nav tier-awareness). Slice 10 (Admin) and slice 11 (Notifications)
still add surface, so an audit run now would be an audit of an incomplete
product, and flipping the row would claim a review nobody held.

What slice 9 does instead is build the legs in: **`A11Y-13`** covers Home's
own structure at the increment that writes it, which is the whole point of
*"G12 is the final gate, not the first check."* The plan records that
**G12-01's audit becomes schedulable at slice 11's plan gate**, when the last
person-facing surface exists.

**The four `gate` rows — DEP-01, EXE-01, EXE-02, BND-01 — do not move.** Each
is a promoted ledger row whose instrument is a deployment, a harness or
another slice's increment. None is slice 9's, and no instrument in slice 9
can produce their evidence.

---

## The CI actions bump (Q8 — SETTLED 2026-09-03)

`.github/workflows/ci.yml` pins `actions/checkout@v4`,
`actions/setup-node@v4` and `actions/upload-artifact@v4`. GitHub is forcing
these onto Node 24 as Node 20 leaves the runners. **Non-blocking today** — CI
on `main` at `7cf16ec` went SUCCESS.

**Recommended: its own chore PR, Tier 3, not slice 9's** — the
`chore/preflight-dev-lock` precedent (PR #39). Two reasons, both structural:

1. **This plan's PR is docs-only and that is a property worth keeping.**
   `docs/coverage.md`, `docs/owed.md`, `docs/adr/` and `docs/TSD.md` are read
   by `tests/lint/process.test.ts` and by no other test in the tree, so a
   docs-only change is **fully verified by one test file**. A workflow edit is
   verified only by a CI run — a different instrument, on a different clock.
2. **The split rule forbids the 9A case outright** (a T3 unit in a T1
   increment), and folding it into 9B buys a workflow change a Tier-2 review
   that cannot assess it.

The chore PR is small, independently revertable, and its evidence is one green
CI run on the PR itself.

---

## Completion recipe, per increment

**9A (Tier 1)** — `supabase:supabase-postgres-best-practices` loaded before
any DDL · pgTAP cases appended to `070_task_claim.sql` and **RED before M1
exists**, with the failure signature in the red commit · `plan(40)` re-pinned
in the same commit · clean-leg `db:reset` at the **exact** count 77 · pgTAP
green with the count recorded exactly · concurrency green and **teed** ·
`db:verify --fail-on warning` clean · upgrade leg green · vitest recorded
exactly · **the browser gate, unconditionally, with its new total stated
exactly and never as "unchanged"** · lint/typecheck/production build clean ·
gitleaks clean · `FRZ-17` flipped and `OW-27` closed with the SHA.

**The pgTAP pair, specified** — this is `OW-27`'s acceptance condition and it
is two cases, not one:

1. **The refusal.** A freeze inserted with **`state = 'unresolved'`** and an
   `objected_to_member_id` that is **not** the coordinator under test — 070's
   existing freeze uses `insert into public.freezes (circle_id)` and `state`
   defaults to `'open'` (`20260815200005`:20), which is why cases 32–35 never
   reach this path. The carve-out coordinator's claim raises `freeze_active`.
2. **The control, in the same file.** Her **READ through the carve-out still
   resolves** — `hc.visible_at` via `hc.ctx_for(her)` still answers `view`
   under that same unresolved freeze. Without this case the guard could be
   satisfied by breaking FRZ-13's carve-out entirely, and the file would not
   notice.

**9B (Tier 2)** — closure set plus the browser gate (Home is person-facing) ·
the measured p95 at the head · `A11Y-13`'s legs · the batched Tier-3 pass
with **OW-05's 8-leg quota** discharged and its denominator re-derived · new
gated pages **added to `tests/app/page-gate.test.ts`'s `GATED` map with their
`unavailable` case**, and its hard-coded totals updated in the same commit —
the map is pinned to the filesystem **both ways** and asserts `pages === 20`,
`routes === 17`, `layout === 1` today, so Home's page fails vitest until both
the entry and the count move.

**Gate cadence.** The browser gate runs at each increment head. It is a
**local gate only** — CI does not run Playwright, so no CI run can upgrade
local gate evidence. Read the tally from `.gate/e2e-run.json`, **never** from
console text.

---

## What this planning session measured against the kickoff

Every state claim in the kickoff was re-derived, not copied:

- `origin/main` = **`7cf16ec`**, a true merge commit, parents `7ef2a69` +
  `56e8b36`. **Confirmed.**
- Coverage **281 · green 258 · review 9 · pending 14**. **Confirmed** with the
  process test's own parser.
- Owed **OPEN 1 / 25**. **Confirmed** — with the `TAKEN`/`CLOSED` discrepancy
  above, which does not touch the OPEN count.
- Next free ADR **0044**; `0039` claimed by unmerged PR #35. **Confirmed** —
  `docs/adr/` holds `0043` as its highest and no `0039`.
- Migrations **76**, pgTAP **71**. **Confirmed** by count.
- **No `HOME-` row exists.** **Confirmed.**
- `FRZ-17`/`OW-27` **verified from source, not from the ADR**:
  `20260815230009`:96–98 (`unres_carved` → `cap = 'view'`, `frozen` false) ·
  :249–250 (`hc.visible_at`'s final `least`, *"FRZ-13: the read-only cap"*) ·
  `20260903120001`:115–117 (the `>= 'view'` floor) and its header comment
  *"the freeze is rung 2 and needs no name of its own"*, which is the
  reasoning error itself · `20260829120001`:256 and `20260829120002`:126, :205
  (the three siblings' explicit `state in ('open','unresolved')` tests) ·
  `070_task_claim.sql`:461 (the `state`-defaulted, therefore `open`, freeze).
  **The defect reproduces on paper at `7cf16ec` and the plan does not rest on
  ADR-0043's word for it.**
- **Not measured, and named as such:** no gate was run, no `db:reset`, no
  pgTAP execution — this is a docs-only session and the stack was not touched.
  8A/8B/8C's merged evidence is **not re-earned**.
- **Not staged:** two untracked files were present in the shared working tree
  at the start of this session (`.github/SECURITY.md`,
  `docs/review/slice-5b-queue-kickoff.md`). Neither is this session's and
  neither was staged — explicit paths only, never `git add -A`.

---

## Owner decisions — SETTLED 2026-09-03 (the plan-gate rulings)

The owner ruled on the nine questions at the plan gate, 2026-09-03, in
session. **Every recommendation was accepted as put: nine ruled AS PUT, zero
departures.** The owner's words, quoted exactly and applying to all nine:
*"go with your best recommendation for each open item"* — the slice-8 short
form, recorded in `docs/owed.md` as *"the planner's best recommendation
ratified by the owner's words"* and used there for Q6's per-row verdicts.

**The rulings brief arrived with its `OWNER — ANSWER HERE` block blank, and
this session did not fill it.** The brief's own rule — *"a question left blank
is NOT PLANNED by ADR-0006 — say so deliberately if that is the intent"* —
forbids reading a blank in either direction, so the session put the nine back
to the owner and wrote no ruling until the words above came back. That is the
slice-8 precedent exercised a second time: a first slice-8 rulings session on
2026-09-02 *"found every ruling line blank, stopped without editing, and put
the seven back."* **ADR-0006's default was therefore never exercised, and
nothing in slice 9 is NOT PLANNED.**

**Who chose what, so it is not inferred later.** The owner chose the *form* —
delegation to the planner's best recommendation — and by those words ratified
the nine recommended answers as the ruling. The *content* of each is the
planning session's, argued in the body above and preserved UNCHANGED below,
with the alternatives it rejected still visible. Where a ruling departed from
its recommendation it would sit beneath the recommendation it replaces, which
stays visible (ADR-0025 D6; ADR-0043's *amended with markers, never
rewritten*). **There are none, so no marker of that kind appears anywhere in
this file.**

### The tally

| Q | Subject | Ruled | As put? |
|---|---|---|---|
| **Q1** | Increments, the split, the tiers | Two increments — **9A Tier 1**, **9B Tier 2** (ruled DOWN); day one first | **AS PUT** |
| **Q2** | The migration bound | **≤ 4** — M1 planned, M2/M3/M4 reserved; expected close **1 of ≤ 4** | **AS PUT** |
| **Q3** | FRZ-17 / OW-27 | **IN, as M1**, with the two-case pgTAP pair; `OW-27 → TAKEN(9A/M1)` | **AS PUT** |
| **Q4** | The commissioned adversarial pass | **IN, as round 31**, before 9A's build; DDL exit = M2 | **AS PUT** |
| **Q5** | Home's composition rule | Empty read renders **nothing**, never a zero; day-one card on a succeeding zero read | **AS PUT** |
| **Q6** | AC-HOME-2, AC-HOME-1's provability | **HOME-06 `pending` at `gate`**, never green this slice; HOME-01 green-able | **AS PUT** |
| **Q7** | The burn-down quota | A **ceiling on growth, not a floor on work**; satisfied by exhaustion | **AS PUT** |
| **Q8** | The CI actions bump | **Its own chore PR, Tier 3**, not slice 9's | **AS PUT** |
| **Q9** | G12-01 and the four `gate` rows | **None of them moves**; Home's a11y built in as `A11Y-13` | **AS PUT** |

**Nine ruled as put. Zero departed.** The prose below and the table above say
the same thing, and neither claims a departure the other does not: because
there are none, the bound, the tiers, the round numbers and the coverage list
in the body above **stand exactly as written** and no downstream tracing was
required. Had any ruling departed, the trace through those four would have
ridden this same commit.

### The rulings, with their consequences

- **Q1 — SETTLED:** *"go with your best recommendation"* → **two increments.
  9A = the freeze guard, Tier 1. 9B = Home, Tier 2, ruled DOWN from the
  fail-closed Tier-1 default** on the argument recorded above. **Day one and
  the router in ONE increment, day one built FIRST**, its *"and nothing else"*
  assertion going green against a tree where the router does not yet exist and
  surviving the router's arrival. **9B may hold Tier-3 units** (copy, styling)
  — the split rule forbids T1+T3, not T2+T3. *Consequence:* the split rule is
  satisfied by construction — M1 is Tier 1 and rides alone. Review is **3–8
  lenses for 9A, at least one from a different model family than the author**,
  and **one session for 9B**, attacking the three places the build names
  against itself; the browser gate runs at both heads and is **unconditional
  for 9A** (ADR-0033 D19.14 — a kickoff may not narrow it). **A tier is never
  lowered mid-slice**; the owner may raise one on the record before a line is
  written. 9A's branch is `slice/9-freeze-guard`; 9B's is named at its own
  kickoff. The one-increment and Tier-3 alternatives are rejected.
- **Q2 — SETTLED:** → **the migration bound is ≤ 4.** M1 `claim_task_freeze_guard`
  planned · M2 reserved and NAMED for a DDL fix arising from round 31 · M3
  reserved for round-31/32/33 dispositions · M4 reserved and NAMED for one
  composed Home read definer, consumed **ONLY on a MEASURED page-p95 breach at
  the 9B head** with the numbers pasted into the red commit. **Expected close:
  1 of ≤ 4.** *Consequence:* **the bound now exists** — it did not until this
  gate set it, and slice 8's closed bound of 2 of ≤ 4 does not carry. The tree
  moves **76 → 77** migrations with **pgTAP files unchanged at 71** (M1's cases
  append to `070_task_claim.sql`, whose `plan(40)` is re-pinned in the same
  commit); `072` and beyond only on a consumed reserve. **A reserve not
  consumed closes UNCONSUMED and the bound closes at what was spent.**
  Anything past ≤ 4 is a recorded owner amendment **made before a line is
  written**. The zero-DDL alternative, priced above, is rejected.
- **Q3 — SETTLED:** → **FRZ-17 / OW-27 is IN, as M1**, with the two-case pgTAP
  pair: the refusal under an **`unresolved`** freeze **and** the control
  proving her carve-out READ still resolves. **`OW-27 → TAKEN(9A/M1)`.**
  *Consequence:* the ledger status change rides **9A's FIRST docs-only
  commit** under the OW-04 precedent — a plan-gate ruling is sufficient
  authority for a ledger *status* change and **no verdict moves** (ADR-0025
  D6) — quoting this ruling. **`FRZ-17` gets no new coverage row:** it exists,
  `pending`, Slice cell `8 → 9`, and flips green at 9A when M1 and its pair
  land, its Slice cell moving to `9A` at the flip; `OW-27` closes
  `CLOSED(<sha>)` with the same SHA. Until both land the row is **`pending`,
  and `pending` never counts as green**. Carrying was not a third option.
- **Q4 — SETTLED:** → **the commissioned adversarial pass is IN, as round
  31** — ADR-0043 D6's dissent, discharged rather than carried. It reviews
  **8A's M1 and M2 as merged** at `main` @ `7cf16ec`, in **its own session, a
  different leg, and a different model family from 8A's author**, findings
  landed **VERBATIM** as `docs/review/round-31-findings.md` before anything is
  argued, dispositions a full ADR (**0044**), **DDL exit = M2**. It runs
  **BEFORE 9A's build**, and 9A does not start until its findings are landed.
  *Consequence:* the round numbering is fixed — **31** (the commissioned pass)
  → **32** (9A) → **33** (9B), which is what `docs/coverage.md`'s new § 9
  heading will say. **The pass may be run from `main` @ `ad9d058` without
  re-basing its claim:** `git diff --name-only 7cf16ec ad9d058` returns
  exactly `docs/review/slice-9-plan-kickoff.md` and
  `docs/review/slice-9-plan.md`, so `20260903120001_task_claim.sql`,
  `20260903120002_step_up_level_binding.sql`, `070_task_claim.sql`,
  `071_step_up_level.sql` and `0040-8a-claim-db-deltas.md` are **byte-identical
  at both SHAs** — verified this session, not assumed. Ruling it OUT would
  have left a Tier-1 increment reviewed by nobody; that alternative is
  rejected.
- **Q5 — SETTLED:** → **every block renders from its destination surface's own
  RLS-true read, and a block whose read returns nothing renders NOTHING —
  never a zero, never a heading.** The **day-one card is shown only to a caller
  whose arrivals read succeeds and returns zero**; every other caller — the
  one who cannot enumerate arrivals included — gets the router, and a router
  with five empty blocks renders **one honest line of its own**. **Recent
  activity is a descending, small-limit read**, proven against a fixture larger
  than the cap. *Consequence:* this is the assertion text of **HOME-02** and
  **HOME-04**, both opening at 9B; the forbidden shape is named — the tail of
  an ascending `limit 300`, the OW-26 class. A `0` on Home would be a claim
  about invisible rows, which is why the rule is *nothing*, not *zero*.
- **Q6 — SETTLED:** → **`HOME-06` opens at Slice `gate`, `pending`, and is
  never green in this slice.** AC-HOME-2 — *"a member can tell in five seconds
  what needs them"* — is verified by the moderated protocol of PRD Appendix B
  (a seeded synthetic circle, five participants) and **no instrument in this
  repo can prove it**; the row exists so the gap is visible rather than silent.
  **`HOME-01` does open green-able**, over the rendered tree, with the reason
  recorded against TSD §11.4 so it does not read as an overclaim. *Consequence:*
  `docs/coverage.md` gains **§ 9** with **seven rows — HOME-01…HOME-06 and
  A11Y-13** — taking it from **281 to 288** before any round moves a row.
  Re-derived this session with `tests/lint/process.test.ts`'s own parser at
  `ad9d058`: **281 rows · green 258 · review 9 · pending 14 · 0 unparsed**, the
  fourteen being FRZ-16b, RLS-11b, SIG-01, DEL-01, ADM-01, G12-01, UXA-03,
  LOG-03, GRP-01, DEP-01, EXE-01, EXE-02, BND-01, FRZ-17, and **no row's ID
  begins `HOME-`**. **All seven rows are written by 9A's FIRST docs-only
  commit, quoting these rulings — not by this PR.**
- **Q7 — SETTLED:** → **the burn-down quota is a ceiling on growth, not a
  floor on work.** It is **MET when the OPEN count does not rise and no row is
  carried**, and where the closable population is smaller than *opens + 5* it
  is **satisfied by exhaustion**, recorded as such at the close. Slice 9 opens
  **0** and closes **1**, ending at **OPEN 0 / 25** if no round opens a row.
  **`OW-05 → TAKEN(9/Tier-3 pass)`** — the quota is recurring, the leg backlog
  is not clear, and slice 9's pass audits the next **8** legs at the 9B
  close-out, **running whether or not slice 9 has a Tier-3 increment**.
  *Consequence, and the placement confirmed this session:* the quota is the
  **second bullet of `docs/owed.md` §Rules** (`docs/owed.md:43-45`, read at
  `ad9d058`) — it is **neither a coverage assertion nor a ledger status**, so
  no coverage row and no status-vocabulary change carries it, and **the plan's
  homing of the edit in 9A's FIRST docs-only commit holds unchanged.** The
  amendment is a **reading added beneath the rule, not a rewrite of it**: the
  sentence *"each slice closes at least as many items as it opens, plus five"*
  survives verbatim and this ruling sits under it. **Nothing enforces the quota
  mechanically** — the scanner checks the cap (≤ 25), the acceptance condition
  and the status vocabulary, and not the quota — so this ruling is the only
  thing that makes slice 9's arithmetic legible instead of a silent violation.
  The two observations ride the same commit **as facts, not verdicts**: the
  slice-8 close-out note's *"TAKEN 2 · CLOSED 17"* against the parser's
  **TAKEN 1 · CLOSED 18** (re-derived here: **27 rows · OPEN 1 · TAKEN 1 ·
  RISK 1 · PROMOTED 6 · CLOSED 18** — both versions total 27 and the OPEN
  count, the only one the cap enforces, is right), and OW-05's acceptance
  condition reading *"24 of the 31"* against a stale denominator of 38 legs
  where the gate is now **66 legs in 9 files**, to be re-derived at the 9B
  close-out rather than restated.
- **Q8 — SETTLED:** → **the CI actions bump gets its own chore PR, Tier 3, and
  it is not slice 9's.** *Consequence, naming the session and the timing the
  brief asks for:* it is **not this session's, not 9A's and not 9B's**. It is
  **its own fresh session on its own `chore/` branch, in the PR #39
  (`chore/preflight-dev-lock`) shape** — small, independently revertable,
  evidence one green CI run on the PR itself, merged `--no-ff` by the owner,
  who is sole merge authority. **It blocks nothing in slice 9 and slice 9
  blocks nothing in it:** CI on `main` @ `ad9d058` is **SUCCESS** (confirmed
  this session, not assumed) and the bump is non-blocking until GitHub retires
  Node 20 on the runners. The precedent landed PR #39 **before** the 8A
  kickoff and the same order is the natural one here — before 9A, alongside or
  after round 31 — but **the owner schedules it, and nothing in slice 9 waits
  on it.** What it may **not** do is ride 9A (the split rule forbids a T3 unit
  in a T1 increment outright) or 9B (a Tier-2 review cannot assess a workflow
  change), and folding it into this PR would cost the docs-only property that
  makes this PR **fully verified by one test file**.
- **Q9 — SETTLED:** → **none of the five `gate` rows moves.** **`G12-01` stays
  `pending` at Slice `gate`** — slices 10 (Admin) and 11 (Notifications) still
  add surface, so an audit run now would audit an incomplete product and
  flipping the row would claim a review nobody held; **its audit becomes
  schedulable at slice 11's plan gate**, recorded here so it is not lost.
  **DEP-01, EXE-01, EXE-02 and BND-01 stay `pending`** — each is a promoted
  ledger row whose instrument is a deployment, a harness or another slice's
  increment, and no instrument in slice 9 produces their evidence.
  *Consequence:* slice 9 builds the legs in instead, as **`A11Y-13`**, at the
  increment that writes the surface — *"G12 is the final gate, not the first
  check"*, and a structural accessibility failure found at G12 is a redesign,
  not a fix. The silent-extension alternative is rejected.

### What this ruling puts in force, and what it does not

**In force from this merge:** the migration bound **≤ 4** · the tiers **9A
Tier 1, 9B Tier 2** · the round numbers **31 → 32 → 33** · the increment order
**round 31 before 9A, day one before the router** · `OW-27`'s and `OW-05`'s
takes · the seven § 9 coverage rows and the Q7 reading, **both as instructions
to 9A's first docs-only commit, not as writes made here**.

**Deliberately NOT written by this session,** per the brief and the slice-8
precedent: **no coverage row, no ledger row, no ADR-0044, no code, no gate,
no `db:reset`.** `docs/coverage.md` and `docs/owed.md` are untouched at
**281 · 258 · 9 · 14** and **OPEN 1 / 25**; 8A/8B/8C's merged evidence is not
re-earned. Two untracked files sat in the shared working tree throughout
(`.github/SECURITY.md`, `docs/review/slice-5b-queue-kickoff.md`); neither is
this session's and neither was staged — explicit paths only, never
`git add -A`.

**Still not activated, unchanged by these rulings:** G4 and G7 block · G9 is
OPEN · G3 is open · `SIG-01` is NOT absorbed and slice 9 does not absorb it ·
`G12-01` is `pending` at `gate` · `LOG-03` is never green by ruling. **Nothing
in this plan authorises a line of code**; the build begins at 9A's own kickoff,
after round 31.

**Markers applied to the body, and nothing else.** The six section headings
that carry a Q number are stamped `— SETTLED 2026-09-03`, in the slice-8
plan's shape, so a later reader cannot mistake a ruled section for an open
one. **No word of the body was changed** — the stamps are additive and a diff
shows it. The whole diff removes exactly **twelve** lines, counted with
`git diff -U0 | grep '^-'` and not by eye: the status paragraph's **three**,
which this leg is instructed to move; the **three** more that the surviving
sentence *"Nothing here is a finding…"* occupied, re-flowed because the new
status text joined it mid-line — its words unchanged, only its line breaks
moved; and the **six** headings the stamps replace. Everything else in this
file is an insertion.

---

## The questions as put to the owner

**Q1 — The increments, the split, and the tiers.**
*Recommended:* **two increments. 9A = the freeze guard, Tier 1. 9B = Home,
Tier 2** — ruled DOWN from the fail-closed Tier-1 default, on the argument
above. Day one and the router in **one** increment, day one built **first**.
9B may hold Tier-3 units (copy, styling); the split rule forbids T1+T3 only.

**Q2 — The migration bound.**
*Recommended:* **≤ 4.** M1 planned (the freeze guard); M2 reserved and NAMED
(a DDL fix from round 31's pass); M3 reserved (round dispositions, the
standing precedent); M4 reserved and NAMED (one composed Home read definer, on
a **measured** p95 breach only). **Expected close: 1 of ≤ 4.**

**Q3 — FRZ-17 / OW-27: into the bound, or amended out?**
*Recommended:* **IN, as M1**, with the two-case pgTAP pair — the refusal under
an **`unresolved`** freeze **and** the control proving her carve-out READ
still resolves. `OW-27 → TAKEN(9A/M1)`. Carrying is not a third option and
the row is `pending`, never green, until both land.

**Q4 — The commissioned adversarial pass over 8A's M1 and M2 (ADR-0043 D6).**
*Recommended:* **IN, as round 31**, against `main` @ `7cf16ec`, its own
session, a different model family from 8A's author, **before 9A's build**,
findings verbatim, dispositions in ADR-0044, DDL exit = M2. Rounds 32 and 33
then run 9A and 9B.

**Q5 — Home's composition rule, and the day-one branch.**
*Recommended:* **every block renders from its destination surface's own
RLS-true read; a block whose read returns nothing renders NOTHING — never a
zero.** The **day-one card is shown only to a caller whose arrivals read
succeeds and returns zero**; every other caller gets the router, and a router
with five empty blocks renders one honest line of its own. Recent activity is
a **descending, small-limit** read, proven against a fixture larger than the
cap.

**Q6 — AC-HOME-2, and AC-HOME-1's provability.**
*Recommended:* **HOME-06 opens at Slice `gate`, `pending`, never green in this
slice** — AC-HOME-2 is a moderated protocol (five participants, PRD Appendix
B) and no instrument here can prove it; the row exists so the gap is visible.
**HOME-01 does open green-able**, over the rendered tree, and the reason is
recorded against TSD §11.4 so it does not read as an overclaim.

**Q7 — The burn-down quota, which slice 9 cannot satisfy.**
*Recommended:* rule the quota a **ceiling on growth, not a floor on work** —
MET when OPEN does not rise and nothing is carried, and **satisfied by
exhaustion** where the closable population is smaller than *opens + 5*. Slice
9 opens 0 and closes 1, ending at **OPEN 0 / 25**. The reading is recorded in
`docs/owed.md`'s Rules by 9A's docs commit, with the two observations above
(the `TAKEN`/`CLOSED` miscount and OW-05's stale denominator) as **facts, not
verdicts**.

**Q8 — The CI actions bump.**
*Recommended:* **its own chore PR, Tier 3**, not slice 9's — keeping this PR
docs-only and therefore fully verified by one test file, and keeping a
workflow change out of a T1 increment.

**Q9 — G12-01 and the four `gate` rows.**
*Recommended:* **none of them moves.** G12-01 stays `pending` at `gate`, its
audit schedulable at slice 11's plan gate when the last surface exists; slice
9 builds Home's own legs in as **A11Y-13**. DEP-01, EXE-01, EXE-02 and BND-01
stay `pending` — no instrument in slice 9 produces their evidence.

---

## ⏸ AT THE PR, STOP

This PR is **docs-only** and merges nothing. **The owner is sole merge
authority; no session merges its own work**, and the merge is `--no-ff`.

The owner rules Q1–Q9. The rulings are recorded **verbatim** in this file as an
*Owner decisions* section and the status line moves to **`PLANNED — RULED`**.
**An unanswered question defaults to NOT PLANNED and the build does not
start** (ADR-0006).

Then, in this order and each in **its own fresh session**:

1. **Round 31** — the commissioned adversarial pass over 8A's M1 and M2, if
   ruled IN (Q4). Findings verbatim; then its dispositions.
2. **9A's build kickoff** — `slice/9-freeze-guard` from post-merge
   `origin/main`; the docs-only ledger + coverage commit **first**, then M1
   red→green.
3. **9B's build kickoff** — Home, day one before the router.

**Nothing in this plan authorises a line of code.**
