# Round 33 — the review packet for 9B: Home

**Tier 2** — ruled DOWN from the fail-closed default at the slice-9 plan gate
(Q1), and **not lowered and not raised mid-slice**. `OW-28`'s unit is Tier 2 by
ADR-0044 D1, matching.

## SETTLED, except —

The following are **ruled** and are not this round's to re-open. A dissent
against any of them is a dissent, filed as one; it is not a finding
(`CLAUDE.md`, *Authority*).

- **That Home is 9B, Tier 2, and that day one is built BEFORE the router** —
  slice-9 plan Q1. The order is why HOME-01's absence set is worth anything.
- **That `OW-28`'s unit rides FIRST, before the day-one card, and that
  VALIDATION IS NOT ITS FIX** — ADR-0044 D1. The crafted `target_ref` is
  perfectly well-formed; the repair is display.
- **That a block whose read returns nothing renders NOTHING — never a zero,
  never a heading — and that the day-one card is shown only to a caller whose
  arrivals read SUCCEEDS AND RETURNS ZERO** — plan Q5. (A dissent about what
  that produces for a `care_circle` member is filed as Q-D, as a dissent.)
- **That recent activity is a descending, small-limit read, proven against a
  fixture larger than the cap** — plan Q5 point 3, the OW-26 class.
- **That `HOME-06` is never green in this slice and the four `gate` rows do not
  move** — plan Q6, Q9.
- **That the browser gate's HOME is a Vercel STAGING deployment, and that 9B
  MAY CLOSE with browser evidence outstanding** — ADR-0046 D7a/D7b. See *The
  gate is UNRUN* below, which is where this round's honesty is owed.
- **That the burn-down quota is a ceiling on growth, not a floor on work** —
  plan Q7.
- **That `OW-33` is NOT 9B's** — ADR-0046 D2.

Everything below this line is open to attack.

---

## The heads, and the binding between them

**Evidence head: `38fceca`.** Every product claim in this document belongs to
that commit and to no other.

**Base: `origin/main` = `aae90d2`** (PR #49, `--no-ff`, parents `e1fd0ae` +
`1846404`), re-verified by a fetch at the branch point.

Every commit above the evidence head touches `docs/` only:

```
643e31f docs(9B): the ledgers at the 9B head
457dab0 docs(9B): OW-05's leg-integrity pass
```

…plus this packet, ADR-0047 and the PR body. **`git diff --name-only 38fceca
HEAD` is docs-only.**

## What to attack, in the order a reviewer will find it cheapest

1. **The composition, for a leak.** Home is the surface with the widest
   audience and it composes seven reads across nine domains. Every block reads
   what its destination surface reads; every block renders nothing when its
   read is empty. The place to push is the **day-one branch**: Q5 makes it a
   fact about the CALLER, and Q-D below is this session's own dissent about
   what the ruling's literal words produce under RLS.
2. **`OW-28`'s repair, for a gap between the words and the post.** The panels
   name the four parts; the hidden `target_ref` beneath them is asserted in the
   route suite. Read them together — the panel's words and the posted ref must
   describe the same grant, and no test asserts that in ONE place.
3. **The read reshaping, for a widening.** The ids are chosen by a cheap query
   over the base table and the expensive select runs for those ids. The claim
   is that **RLS decides visibility on the base table exactly as it does for
   the full read, so nothing widens**. That claim is the one to test.
4. **The p95, for a lie.** It was measured, it breached, the breach is in the
   red commit, and the fix was re-measured on the same fixture with the same
   harness. Two of the four reads remain over PRF-06's DB-level tripwire and
   the packet says so rather than rounding it away (Q-A).
5. **The absence sets**, HOME-01's and HOME-03's. They are the assertions most
   easily satisfied by a page that renders nothing at all; the positive
   controls are in the same file and should be read beside them.

## The evidence, exactly

| Instrument | Result |
|---|---|
| **vitest** | **1,603 / 1,603 in 544 files**, 281.96 s (`.vitest/run.json`). 9A's head was 1,563; the 40 are this slice's. |
| **lint** | clean, whole tree, exit 0 |
| **typecheck** | clean |
| **production build** | clean, exit 0; `/[circle]` present in `routes-manifest.json` |
| **gitleaks** | the CI image, digest-pinned, full history: **709 commits scanned, no leaks found** |
| **CI on `main` @ `aae90d2`** | **GREEN** — run `34082125537` re-run and `success`, discharging the kickoff's ECR-transient item |
| **CI on this PR head** | **GREEN** — runs 34089257750 (5m18s) and 34089265516 (5m33s), both pass. The only annotation is the Node 20 deprecation on actions/checkout@v4, setup-node@v4 and upload-artifact@v4 — plan **Q8**, ruled to its OWN chore PR and explicitly not slice 9’s |
| **page p95 (§13.2)** | **628 ms** at 2,021 events · 501 tasks · 302 arrivals — p50 431 · p99 758 · max 932; target 1.5 s, ceiling 3 s held at all 150 requests |
| **Home's reads (PRF-06's 250 ms tripwire)** | `recentEvents` 104 · `upcomingEvents` 53 · `myOpenTasks` 399 · `latestEventPerSubject` 657 ms — **two over it, recorded, Q-A** |
| **browser gate** | **NOT RUN.** See below. |
| **DDL** | none. The DB legs stand at 9A's figures and are **not** restated as re-earned. |

## The gate is UNRUN, and this is where the honesty is owed

**ADR-0046 D7a re-homes the gate to a Vercel staging deployment**, which does
not exist yet — standing it up is the owner's task, recorded at round 32.
**D7b permits 9B to close with browser evidence outstanding.** So the legs this
slice wrote — `people.spec`'s STP-04 leg and `a11y.spec`'s A11Y-13 leg — are
**written and unrun**, and five coverage rows stay `pending` because of it.

**The host was measured, not assumed.** At the 9B head, `preflight --for e2e`:

```
OK     ports    3000 and 8787 free
WARN   clamd    3310 closed — `docker start hc_clamd`
OK     stack    54341/54342/54344 open
WARN   memory   0.36 GiB free — BELOW the 1.20 GiB floor
VERDICT: BLOCKED (5)
```

Windows' own counter minutes later: **570 MB free of 7,931 MB**, with 19.8 GB
committed. `hc_clamd` is down and would want ~1 GiB of that.

**The gate was not forced, and that was a decision.** Overriding preflight at a
third of the floor produces legs dying on spawn rather than on assertions — a
red that traps §1 forbids diagnosing as anything — at the cost of a wiped
`test-results/` and a destabilised stack a peer session shares. **Nothing in
this packet claims a leg passed, and no document here says 9A's surfaces were
re-proven.**

## What is NOT claimed

- **No browser evidence.** Nothing rendered was seen in a browser at this head.
- **No DB evidence beyond 9A's.** This slice ships no DDL; `db:reset`,
  `test:db` and `test:concurrency` were not run and their figures are not
  restated.
- **AC-HOME-2 is not proven** — `HOME-06` is `gate`, and no instrument here can
  prove *"a member can tell in five seconds what needs them"*.
- **The p95 is one fixture on one host.** 2,021 events · 501 tasks · 302
  arrivals, local, warm. It is a measurement, not a production figure.
- **The two instruments disagree** — the whole page (628 ms) answers faster
  than the slowest single read the serial harness reports (657 ms). Both are
  recorded as measured; neither was adjusted to fit the other.

## The pointed questions

They are ADR-0047 **D9**, and they are put there rather than duplicated here so
one text carries them: **Q-A** the DB-level tripwire residual · **Q-B** the
resume router · **Q-C** whether `STP-04` flips on its app half · **Q-D** the
day-one branch for a `care_circle` member, filed as a dissent with **no
recommendation** · **Q-E** the two leg gaps the audit found · **Q-F** whether
9B is reviewed or ruled.

**An unanswered pointed question defaults to NOT PLANNED (ADR-0006).**

## The ledgers, re-tallied with the process test's own parser

```
COVERAGE rows: 290 {"green":260,"review":9,"pending":21}
OWED rows: 33 cap: 25 {"CLOSED":23,"RISK":2,"TAKEN":1,"PROMOTED":6,"OPEN":1}
```

**One row flips: `HOME-05`.** The bound closes at **1 of ≤ 4** with **M4
UNCONSUMED**. `OW-28` closes; `OW-05` stays `TAKEN` with slice 9's pass
discharged (`docs/review/9b-leg-audit.md`, eight legs, three findings, none
moving a verdict) and its stale arithmetic re-derived: **68 legs in 9 files**.

**This PR merges nothing and fixes nothing.** The owner is sole merge
authority, no session merges its own work, and the merge is `--no-ff`.
