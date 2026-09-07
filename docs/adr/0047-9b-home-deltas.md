# ADR-0047 — Slice 9B: Home — deltas as built, and the round-33 packet

**Status:** proposed — awaiting round 33.
**Branch:** `slice/9b-home`, from `origin/main` @ `aae90d2` (PR #49, round 32's
rulings, merged `--no-ff` 2026-09-07; parents `e1fd0ae` and `1846404`). The
base was re-verified by a fetch at the branch point and `aae90d2^{tree}` was
confirmed equal to `1846404^{tree}`.
**Date:** 2026-09-07. **Evidence head:** `38fceca` — every commit past it is
docs-only (`docs/review/9b-leg-audit.md`, `docs/coverage.md`, `docs/owed.md`).
**Tier:** **2**, ruled DOWN from the fail-closed default at the slice-9 plan
gate (Q1) and **not lowered, not raised, mid-slice**. `OW-28`'s unit is Tier 2
by ADR-0044 D1, matching.
**Scope:** `OW-28`'s unit FIRST (ADR-0044 D1), then the plan's four units —
the day-one card, the router, the nav entry and the routing, bounds and a11y.
**Migrations: NONE. The bound closes at 1 of ≤ 4 — M1 spent at 9A; M2 CLOSED
UNCONSUMED at round 31; M3 held for the rounds; M4 CLOSES UNCONSUMED**, its
named condition measured and not met (D5).
**Dependencies: 0 runtime, 0 dev** — `package.json` and the lockfile are
byte-identical to base. `lib/ai/` is byte-identical to base and has **no
import path to this surface**, walked transitively and asserted (D3).
**Authority:** slice-9 plan Q1, Q2, Q5, Q6, Q7, Q9 → ADR-0044 D1 (`OW-28`) →
ADR-0046 D5/D7 (the gate's home and `OW-32`'s subset condition) → PRD §4.7,
§4.1.4 rule 4, §13.2 → `docs/coverage.md` HOME-01…HOME-06, A11Y-13, STP-04.
**The packet:** `docs/review/round-33-packet.md`.

---

## D1 · What shipped, in the order the plan ruled

`OW-28`'s unit first, then day one, then the router, then the nav and the
routing, then bounds and a11y. Every unit is red→green with the failure
signature in the red commit.

| # | Unit | Red | Green |
|---|---|---|---|
| 0 | **`OW-28`** — both *Raise access* panels name what they confirm | `a769500` | `c83eb80` |
| 1 | **The day-one card** | `34fcf60` | `7e7f71d` |
| 2 | **The router** — the five §4.7.2 blocks | `dde6d6d` | `b43c7f7` |
| 3 | **The nav entry and the routing** | `f3024ec` | `deaf86b` |
| 4 | **Bounds and a11y** — and a MEASURED breach | `33954c6` | `38fceca` |

**Units 1 and 2 are one increment and the order was load-bearing**, exactly as
Q1 ruled: HOME-01's *"and nothing else"* went green against a tree where the
router did not exist, and it is still green — unchanged, in the same file —
after the router landed. Written the other way round it would have been an
author's list of what to exclude from a page that already had everything.

## D2 · `OW-28`: the repair is DISPLAY, and validation was not the fix

Both panels now render the four parts the token binds and `hc.set_grant`
matches: the grantee, the **subject by display name**, `DOMAIN_LABEL[rd]`, and
`LEVEL_WORD[rl]` with `LEVEL_PHRASE` as the long form — all from the ONE phrase
module, never re-typed. `rl=hidden` reads as **the revocation it is** (heading
*Remove access*, button *Remove it*, level *nothing at all*), and the narrowing
is the compiler's: `LEVEL_WORD` has no `hidden` key, because `hidden` is row
absence.

A subject the page **cannot name** is not confirmed blind — no form, no
`target_ref`, and a sentence saying so. That is display, not validation: the
crafted `target_ref` was always perfectly well-formed, which is why ADR-0044 D1
ruled validation out as the fix, and none was added.

**The test asserts the WORDS, both ways** — six cases, RED first: the honest
path, the spend panel repeating them, a **crafted** `rs`/`rd`/`rl` rendering
*finances* and *full access* on both panels, `rl=hidden`, and the unnameable
subject. `OW-28` closes `CLOSED(c83eb80)`. **`STP-04` stays `pending`** on its
e2e half — see D6.

## D3 · Home's composition, and the three rules it is built on

**Q5, implemented as ruled.** Every block renders from its destination
surface's own read; a block whose read returns nothing renders **nothing** —
never a zero, never a heading; and the **day-one card is shown only to a caller
whose arrivals read SUCCEEDS AND RETURNS ZERO**. A read that failed is not a
read that returned nothing. A router with nothing in it renders one honest line
of its own.

**AC-HOME-3, both halves.** No number on Home is model-computed: the fence is
tested by walking the transitive import graph from `app/(app)/[circle]/page.tsx`
and asserting no `lib/ai` module is reachable, with a positive control that the
walk actually walked; and the rendered tree carries no `svg`, `canvas`,
`progress`, `meter`, `progressbar`, percent sign, chart, score, trend, average
or *"out of"*.

**The OW-26 class, proven closed rather than asserted.** Recent activity is a
descending, small-limit read of its own. `tests/hc/timeline.test.ts` inserts
**310 events** against the live stack and removes them again: `listEvents`
returns exactly 300 ascending, and **not one** of the four rows `recentEvents`
returns is reachable from that page. On any fixture smaller than the cap the
two agree and the assertion proves nothing, which is why the fixture is bigger
than the cap.

## D4 · The nav, and the one destination this slice did NOT repoint

Home is the first entry in `nav-manifest.ts` and is in **every tier's** list.
The argument is on the record beside the code: the router is the surface with
the widest audience and each of its blocks renders only what its own caller can
see — a caregiver's Home is her tasks and nothing else — so hiding it from a
tier would hide a surface that person is entitled to, which is the opposite of
what the courtesy is for. NAV-01 keeps its shape.

**The founder's post-setup destination is repointed**: the completion screen
now leads into the circle at Home, with *Invite someone* demoted to secondary.
On day one Home is that screen's own job continued.

**The accepted-invite landing is NOT repointed, and the reason is the PRD.**
§4.1.4 rule 4: *"Family lands on the Timeline. Care circle lands on their
assigned tasks. Nobody lands on an empty dashboard and nobody lands on Home."*
The PRD binds ahead of any build convenience; `tests/routes/accept.test.ts`
keeps both pins, and the leg audit records the live pin as the positive
control.

**The resume router is NOT repointed either.** `resumeStep` derives the
furthest step from durable state and there is no completion flag to derive
*"finished"* from, so a founder returning through `/` still resumes to setup
step 4. Repointing it amends **AC-AUTH-9**, which is a ruling and not a build
decision — Q-B below.

## D5 · The p95 was MEASURED, it BREACHED, and the breach was a read SHAPE

HOME-05 says the p95 is measured at the 9B head, never asserted. It was, at
**2,021 timeline events · 501 tasks · 302 arrivals** — a fixture comparable to
PRF-06's own — with the production build under `next start`, a signed-in
founder, and 150 warm timed requests:

| | p50 | p95 | p99 | max | verdict |
|---|---|---|---|---|---|
| **First measurement** | 1787 ms | **2797 ms** | 4713 ms | 5452 ms | **BREACH** of §13.2's 1.5 s target, and of the 3 s ceiling |
| **After the fix** | 431 ms | **628 ms** | 758 ms | 932 ms | **WITHIN** §13.2; ceiling held at every request |

The numbers are pasted into the red commit, as Q2 requires of a breach. **The
cause was a shape, not a bound.** Each read wrapped `EVENT_SELECT` and ordered
the wrapper, so the database computed five joins, a lateral and a `jsonb_agg`
over linked documents for **every event in the circle** before sorting and
taking four; and Home asked `listTasks` for 200 rows, each carrying two
`hc.visible_at` calls, to render at most four. The ids are now chosen by a
cheap query over the base table — the row policy decides visibility exactly as
it does for the full read, so **nothing widens** — and the expensive select runs
for those few ids alone.

**M4 CLOSES UNCONSUMED**, and the reason is process as much as arithmetic. The
reserve is for reads that are RLS-true, app-side and cannot hold; these could,
and spending the slot on a shape would have wasted it. Consuming M4 would also
ship a migration inside a **Tier-2** increment — a migration is a Tier-1
trigger, and only the owner may raise a tier, on the record, before a line is
written.

**The residual, recorded and not fixed:** `latestEventPerSubject` p95 **657 ms**
and `myOpenTasks` **399 ms** are over PRF-06's **250 ms** DB-level page
tripwire at this fixture size (`scripts/bench/home-reads-p95.ts`, 25 warm runs
each, nearest-rank p95, the real wrappers). Two cheaper shapes for the first
were tried and rejected on their own evidence — a per-subject lateral on the
indexed `approved_at` **timed out** (57014, inside `visible_at`), and ordering
by filed time instead of event time is a change of **meaning**. **Q-A** puts it
to the owner.

**And the two instruments disagree, which is stated rather than smoothed:** the
whole page — seven reads in parallel, the gate, the render — answers at p95
628 ms, **below** the slowest single read the serial harness reports. Both
numbers are recorded as measured.

## D6 · What is green, what is not, and the browser gate

**One coverage row flips and only one can: `HOME-05`.** Its two layers, app and
bench, are both this session's to earn and both were earned. **290 rows · green
259 → 260 · review 9 → 9 · pending 22 → 21**, re-tallied with
`tests/lint/process.test.ts`'s own parser.

**HOME-01, HOME-02, HOME-04, A11Y-13 and STP-04 stay `pending`.** Each carries
an `app + e2e` layer; every app half is earned at this head and every leg is
**written**; none has run. **ADR-0046 D7a** re-homes the gate to a Vercel
staging deployment, and this host measured **0.36 GiB free against preflight's
1.20 GiB floor** at the 9B head, with `hc_clamd` down (3310 closed) and its own
~1 GiB still to pay. **D7b permits 9B to CLOSE with that evidence outstanding
— it does not permit a row to go green without it**, and *pending never counts
as green*. **No document here says 9A's surfaces were re-proven.**

**The gate was not forced.** Preflight BLOCKED at a third of the floor;
overriding it would have produced legs dying on spawn rather than on
assertions — a red that traps §1 forbids diagnosing as anything, at the cost of
a wiped `test-results/` and a destabilised host a peer session shares. The
measurement is the honest answer, and it is D7b's own scenario.

**`HOME-03` is `app + review`**: its fence half is earned here and its review
half is round 33's to give. **`HOME-06` does not move** — `gate`, never green
in this slice (Q6). **`GATE-01` is never green and nothing here touches it.**

## D7 · The rest of the closure set

**vitest 1,603 / 1,603 in 544 files** (`.vitest/run.json`, 281.96 s; 1,563 at
9A's head, and the 40 are this slice's). **lint** clean, whole tree, exit 0.
**typecheck** clean. **Production build** clean, exit 0, with `/[circle]` in
`routes-manifest.json`. **gitleaks** — the CI image, digest-pinned, over the
full history: **709 commits scanned, no leaks found.** **CI on `main` @
`aae90d2` is GREEN**: the documented ECR transient was re-run (`34082125537`)
and came back `success`, which discharges the kickoff's standing item.

**No DDL, so the DB legs stand at 9A's figures and are not restated as if
re-earned.** `docs/review/9b-leg-audit.md` discharges **OW-05**'s quota — eight
legs, three findings, none moving a verdict — and re-derives its stale
arithmetic: **68 legs in 9 files**, against a cell that still says 38.

## D8 · The ledger moves

`docs/owed.md`: **`OW-28` → `CLOSED(c83eb80)`**; `OW-05` stays `TAKEN` with
slice 9's pass discharged. **33 rows · OPEN 2 → 1 / 25 · RISK 2 · TAKEN 1 ·
CLOSED 22 → 23 · PROMOTED 6.** The burn-down quota by Q7's reading: slice 9
opened 2 and closed 5, the OPEN count did not rise and no row was carried —
**MET**, and now *satisfied by exhaustion*. The one row still OPEN is `OW-33`,
whose two-round escalation clock round 33 is the first of.

**Next free ADR: 0048.**

## D9 · The pointed questions for round 33

**An unanswered pointed question defaults to NOT PLANNED (ADR-0006), and the
build does not start.** These are put with recommendations except where a
recommendation would be a session promoting its own preference into a ruling.

**Q-A — `latestEventPerSubject` and `myOpenTasks` sit over PRF-06's 250 ms
DB-level page tripwire (657 ms and 399 ms at 2,021 events), while the PAGE is
within §13.2 at 628 ms. Is that a breach to pay for, and with what?**
*Recommended:* **record it and do NOT pay for it in this slice.** §13.2 — the
budget HOME-05 names first — is met with room; the tripwire is a 1D bound whose
own instrument is `prf06.mjs`'s fixture, not this one; and the only remedies
left are DDL (an index, or M4's composed definer), which would make this
increment Tier 1 after the fact. If the owner wants it paid, the honest shape
is a **new** increment at Tier 1 with its own kickoff, not a migration folded
into a Tier-2 head.

**Q-B — the resume router still sends a founder who has finished setup back to
setup step 4. Repoint it?**
*Recommended:* **yes, but not here.** It amends AC-AUTH-9's *"furthest step"*
derivation and needs a durable completion signal to derive *"finished"* from —
a ruling plus a small unit, not a build decision. The leg audit's F2 records
that this branch has no browser coverage at all.

**Q-C — `STP-04`'s own GREEN WHEN names *a test asserting the words both ways*,
and that test is green; its Layer cell says `app + e2e` and the leg is written
but unrun. Flip, or hold?**
*Recommended:* **hold.** *Pending never counts as green*, and a row whose layer
names e2e should not go green on an app half — but the row's two halves now
disagree in print, and the round should say which governs rather than leaving a
reader to choose.

**Q-D — the day-one branch is a fact about the CALLER, as Q5 ruled — and on a
busy circle a `care_circle` member's arrivals read succeeds and returns ZERO,
so she sees the day-one card. Is that the intended reading?**
*No recommendation, deliberately.* Q5's own argument names this harm (*"telling
her, by inference, that she cannot see arrivals"*) and its ruling's literal
words produce it, because RLS answers *zero rows*, not *refused*. This session
implemented the ruling as written rather than improving it — **a settled ruling
is not a finding** — and files this as the dissent the charter asks for. The
exits are the owner's: read Q5 as written, add a second condition (a tier or a
visible-subject test), or rule the card coordinator-only.

**Q-E — the completion screen's new primary control has no browser leg (audit
F1), and the *below-cliff* leg claims a row and a state it never visits (F3).
Fix in 9B, or leave to their owners?**
*Recommended:* **leave.** Both are leg work on merged or unrun surfaces, and a
build session quietly rewriting a shipped leg's title is how an audit trail
stops being one.

**Q-F — round 32's review was never held, and this packet is round 33's. Is 9B
reviewed, or ruled?**
*No recommendation.* It is the owner's call and the record should say which
happened, as ADR-0046 said it for round 32.
