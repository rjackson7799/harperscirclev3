# Round 20 — the OWNER BRIEF: what you are actually being asked, in plain words

**This document rules on nothing.** It is a translation, not a decision. Every
item below is still **PUT · NOT RULED** (ADR-0027 D21, ADR-0028 D14). Nothing
here adopts a proposal, and reading it changes no record.

**Who this is for.** A reader who does not carry round 20's context. The
packet (`round-20-signoff-packet.md`) and the audit
(`round-20-signoff-attack.md`) are complete and correct, but they are written
for someone already inside the argument. This is the same eleven questions
written for someone who is not.

---

## First: what "sign-off" is, and what is actually at stake

Slice 6B has been reviewed across rounds 18, 19 and 20. Those reviews produced
**nine findings** (things that were wrong) and a record of what was done about
each. That record lives in two documents, ADR-0027 and ADR-0028.

Both are marked `proposed`. **`proposed` means "written down but not agreed
to."** Sign-off is you reading the record and saying *"yes, this is what
happened"* — or *"no, change this part."* Until you do, the slice does not
merge.

**Three things are true right now, and they matter:**

1. **The 38-leg browser test suite is GREEN** — all 38 passed, at commit
   `1066e2d`. This is the first time in the slice's history. It used to be the
   thing blocking sign-off. **It no longer is.**
2. **CI is GREEN** at the current commit `c92877b`, on both events, including a
   build step that had never run before and passed at 17 seconds.
3. **Nothing else is blocking except your decision.**

**What is NOT at stake:** none of these questions changes any code, activates
anything, touches the database, or affects a real family. Nothing is in
production. The nine findings were already fixed (or partly fixed) rounds ago.
**You are ratifying a written record of work that is already done.**

**What IS at stake:** whether the record is accurate. A previous session found
five defects *in the record itself* — mostly counting errors — and proposes
corrections. Your job is to accept or reject those corrections.

---

## The vocabulary, once

You reply with one of these per item. They come from ADR-0025.

| Word | Means |
|---|---|
| **RATIFIED AS WRITTEN** | Agreed, exactly as the document says |
| **RATIFIED AS CORRECTED** | Agreed, with the factual/arithmetic corrections applied |
| **RATIFIED AS AMENDED** | Agreed, but with a change of substance stated |
| **RATIFIED AS SHIPPED** | Agreed as the document carries it, warts included |
| **UPHELD IN FULL** | The session's judgement stands; not reversed |
| **REJECTED** | No |
| **TAKEN** | Not decided now; carried forward as a live question |
| **ADOPTED** | A new convention is now in force |
| **NOT PLANNED** | Not being done this round |

You may also just write *"as proposed"* for any item, or *"defer"*, and that is
a real answer.

---

## The eleven items

Each one gives you: what it is, what yes means, what no means, and the risk of
getting it wrong in each direction.

---

### A1 — Fix the arithmetic in the round-18 tally

**What it is.** ADR-0027 says: *"9 ACCEPTED · 9 FIXED · 0 DECLINED, with 2
carrying a declared remainder."* The audit found that sentence is wrong in
both halves. Four findings carry a remainder, not two — and the count of two
was itself inconsistent, including one finding's leftover work while excluding
another's identical leftover work. Separately, one finding is counted as
`FIXED` even though its own section heading says *"FIXED in part."*

**"Declared remainder" means:** the document itself admits part of the job
wasn't finished.

**Yes (RATIFIED AS CORRECTED)** — the *nine findings* stand untouched; only the
summary sentence gets fixed. **No finding becomes unfixed. No code changes.**

**No (RATIFIED AS WRITTEN)** — the record keeps a summary sentence that
contradicts its own table.

> **Recommendation: RATIFIED AS CORRECTED.** This is bookkeeping. The
> underlying facts are not in dispute and the audit verified them
> independently. Risk of saying yes: essentially zero. Risk of saying no: the
> record carries a known-wrong number forever.

---

### A2 — One test row says "passes" but the coverage table says "pending"

**What it is.** A test called UXA-03 met its pass condition. Two places in
ADR-0027 say the coverage row *"MOVES"* (i.e. goes green). A third place says
*"no row is flipped on this round's authority."* The actual coverage file says
`pending`. **The document contradicts itself.**

**Yes (RATIFIED AS AMENDED)** — the conservative reading wins: delete the words
*"and the row MOVES"*, keep *"UXA-03 passes"*. The test did pass; the table
just doesn't get repainted at a sign-off.

**Important:** under a standing rule (ADR-0025 S16.7), **no coverage row can
flip at a sign-off, and a `pending` row cannot move at all.** So UXA-03 stays
`pending` no matter what you rule. The only question is whether the document
stops claiming otherwise.

> **Recommendation: RATIFIED AS AMENDED.** It is the only executable reading —
> the other one describes something the rules forbid. Risk either way: low, but
> "no" leaves a self-contradiction in the record.

---

### A3 — The test suite's own disposition

**What it is.** Confirming three things about the 38-leg browser suite: the
green result counts as evidence **about the product** (not merely that the
tests work); 7 of the 38 legs have been read line-by-line and **31 have not**,
which stays an open obligation; and there is **no automated scanner** checking
the legs — a human has to.

**Yes (RATIFIED AS WRITTEN)** — plus one consequence gets recorded: two items
that were waiting on a full-gate result (UXA-01 and RLS-10) now have it.
**This is not a row flip and no cell changes colour.**

**No** — you'd be disputing that a green suite tells you anything about the
product, which is a strange position to hold.

> **Recommendation: RATIFIED AS WRITTEN.** The 38 denominator was proved by
> running `playwright test --list`, not by counting strings, so the ratios rest
> on solid ground.

---

### A4 — Two corrected counts, and a new citation rule

**What it is.** Two parts.

*Part one:* ADR-0026 undercounted something; ADR-0027 corrected it to **nine
fetch call sites, seven awaited and two eager**. The audit re-checked this at
the exact cited lines and it is the strongest-verified number in the round.

*Part two, the new bit:* ADR-0026 and ADR-0027 **both** number their sections
D1–D2x, and **ten numbers collide.** Worse, `ADR-0027 F-2` and `ADR-0028 F-2`
are *different findings with the same name*. Someone already got this wrong
once (a citation says `ADR-0027 D5` where it means `ADR-0026 D5`). The proposal
is a rule: **every cross-document citation must carry its document number.**

**Yes (RATIFIED AS CORRECTED + ADOPTED)** — count confirmed, rule in force for
new text. Old text is left alone.

> **Recommendation: yes to both.** The citation rule costs nothing and prevents
> a class of error that has already occurred. Risk: none.

---

### A5 — A session did two things it wasn't asked to do

**What it is.** The round-18 session was asked to diagnose one problem and
*consider* a CI gap. It went further: it diagnosed the problem **and** added a
CI step with a zero-warnings assertion. That is more than was asked, and the
document flags it as yours to reverse.

**Yes (UPHELD IN FULL)** — the extra work stands.

**No (REVERSED)** — the CI step comes out.

> **Recommendation: UPHELD IN FULL — and there is now new evidence for it.**
> When this item was written, its own honesty note said *"the CI step has never
> actually run."* **It has now run.** It executed for the first time at commit
> `c92877b` and passed in 17 seconds on both events. The thing the session was
> being cautious about has been observed working. Risk of yes: very low.

---

### A6 — Should we pre-authorise a database change for the next slice?

**What it is.** One leftover item might need a schema change (a `DDL`
migration) to close properly. Schema changes are rationed: **7 of a maximum 7
are already spent.** The question is whether to grant extra headroom now for
slice 7.

**The thing that matters:** the leftover item offers **two** exits, and only
one needs a database change. The other exit is simply *ruling that the small
risk window is acceptable* — which costs nothing. **Nobody has assessed that
cheaper exit yet.**

**Yes (amendment granted)** — headroom authorised for slice 7. Costs nothing
today; the budget just gets bigger later.

**No (REJECTED at this sign-off; TAKEN as a slice-7 question)** — decide it
when someone has actually scoped what the change would be.

> **Recommendation: REJECTED here, TAKEN for slice 7 — but hold this loosely.**
> The packet itself flags this as its weakest recommendation and says you
> should feel least bound by it. Ruling the other way is cheap: it authorises a
> database change *at slice 7*, not now. **This is the one item where "as
> proposed" deserves a second thought rather than a nod.**

---

### B2 — A bug was misclassified, and its count is wrong

**What it is.** When the login server hiccups, the app tells the family
**"you have been signed out"** — even though they haven't been. It was first
recorded as a *test-harness* problem. Round 19 reclassified it as a **real
product defect**, and ruled out the leading alternative explanation (token
rotation) using a preserved trace.

Round 20 counted every place this happens and found the original count wrong:
the record says *"twenty call sites: twelve pages redirect, eight routes
refuse."* The truth is **21 call sites**, splitting **3 / 5 / 2 / 1 / 10** —
a different shape entirely, not just a different number.

**Yes (RATIFIED AS CORRECTED)** — the reclassification stands, the rotation
theory stays refuted, the enumeration is corrected.

> **Recommendation: RATIFIED AS CORRECTED.** The 21-site matrix is the most
> thoroughly-evidenced work in the round, and it makes the finding *stronger*,
> not weaker — 18 of 21 sites show this behaviour and **not one is a test
> fixture**, which is exactly the ground the reclassification rested on. Risk
> of yes: low. **See X1 — the disposition move is a separate question.**

---

### B3 — Where the slowdown actually is

**What it is.** A page sometimes stalls. Round 18 blamed one thing; round 19
overturned that and said the cause is elsewhere — specifically *not* the
database reads, *not* the signed-URL hop, and *not* the sign-out bug above.

**The catch, stated up front:** the instrument built to prove this — a ledger
that records where time goes — **has still never fired during a real stall.**
Three attempts at round 20 narrowed the conditions without succeeding. So the
overturning is *the best available reading of the evidence*, not a confirmed
mechanism.

**Yes (RATIFIED AS AMENDED)** — accepted as a localisation claim, with that
caveat recorded in those words rather than buried.

**No** — the older, already-contradicted explanation stands.

> **Recommendation: RATIFIED AS AMENDED.** Ratifying "our best current reading,
> explicitly not yet confirmed" is honest and useful. Risk of yes: low, because
> the amendment says out loud what is unproven.

---

### B4 — A note that has gone stale

**What it is.** ADR-0028 notes that ADR-0027 is still blocked. **True when
written; the reason has since evaporated** — the gate is green.

**Yes (RATIFIED AS SHIPPED, condition DISCHARGED)** — the sentence stands as a
true statement about its own moment, with a marker recording that its condition
is now discharged.

> **Recommendation: yes.** This has largely been handled already: the three
> stale sentences now carry markers at their sites with the original wording
> preserved (ADR-0027 D21, ADR-0028 D14). This item just ratifies that
> treatment. Risk: none.

---

### X1 — Should the sign-out bug be downgraded from "fixed" to "partly fixed"?

**This rides on B2 but is a separate act. You can say yes to B2 and no to X1.**

**What it is.** The sign-out bug is currently recorded as **FIXED**. The fix
was real and correct at the three places it touched. **But the same document
admits a leftover:** *"The twelve PAGE gates still render an outage as a
sign-in redirect. Same harm."* And the new matrix shows the leftover is
**larger** than admitted — 18 sites, not 12.

**The argument for downgrading is consistency:** item X2 below proposes
demoting three *other* findings to "partly fixed" for having exactly this
shape of leftover. Demoting three and leaving a fourth alone would be
incoherent.

**Yes** — the row moves to `FIXED IN PART`.
**No** — it stays `FIXED`, and X2's demotions need a distinguishing reason.

> **Recommendation: yes, IF you also say yes to X2.** These two travel
> together. **Saying yes to X1 while saying no to X2 removes X1's only stated
> reason** — do not split them that way. Saying no to both is coherent and
> conservative.

---

### X2 — The corrected tally, and a distinction that does not exist yet

**What it is.** Following from A1. To count correctly, the proposal introduces
a distinction that **appears nowhere in the documents today**:

| Kind of leftover | Meaning | Verdict |
|---|---|---|
| **Fix remainder** | Part of the fix was never built | **FIXED IN PART** |
| **Verification remainder** | The fix is complete; nobody has *watched* it work | **FIXED**, observation owed |

Applying it: three findings have unbuilt pieces (→ partly fixed), one has only
an unwatched consequence (→ stays fixed). New tally: **6 FIXED · 3 FIXED IN
PART = 9. All 9 ACCEPTED · 0 DECLINED.**

The arithmetic checks: 6 + 3 = 9 = the finding count = the accepted count, and
each of the four leftovers already has an acceptance condition written down.

**Yes** — tally corrected, distinction adopted.
**No** — A1's correction still applies, but the counting method stays undefined.

> **Recommendation: yes.** The distinction is real and the current confusion
> exists precisely because the two kinds were collapsed. It also matches the
> shape ADR-0025 already used. **One honesty note:** the shape is borrowed
> voluntarily — the branch that formalises it (`chore/process-retune`) is
> **unmerged and NOT binding**, and its own ledger says so. Adopting it is a
> choice, not compliance.

---

## What happens after you rule

1. A session records your rulings — one entry per item, in the ADR each belongs
   to, under a heading naming **round 20** and **the ruling**. Where a ruling
   differs from the packet's proposal, the ruling is recorded and the proposal
   is left standing in the packet as the proposal it was.
2. Superseded sentences get a **marker at the site** with the original wording
   preserved. **Never a rewrite.**
3. Status lines are stamped **only for what you actually ratified**.
4. That commit is pushed, and **CI must be confirmed green at that new SHA on
   both events** before ratification is effective — because CI cannot be green
   at a commit that does not exist yet.
5. **Merge is your own separate session.** You are sole merge authority, and it
   is a **merge commit, never a squash** (ADR-0006). `main` has not moved, so
   git will offer a fast-forward — `--no-ff` is what stops it.

## What is NOT affected by any answer you give

No code changes. No database changes (**69 migrations exact, budget 7 of 7
spent**). No coverage row flips — **UXA-03 stays `pending` whatever you rule
about it "passing."** G4 and G7 still block; G9 stays open; the slice-5B queue
stays at **39 OWED**. No real family data is involved. **Nothing is
production-activated.**

## The three items that stay OWED regardless

These need a *separate* word from you, because they require touching code, and
touching code voids the green browser gate that currently proves this head:

1. **`lib/auth/session.ts:32-33`** carries the same wrong enumeration as B2 —
   in a code comment.
2. **`lib/http/budget.ts`** carries the sentence B3 contradicts; it needs a
   marker.
3. **`tests/lint/timestamp-boundary.test.ts`** closes 3 spellings of a pattern
   with **at least 8** members; the claim overstates it.

Each is a comment-or-docs edit inside a code file. They need **either** a
session that can re-run the 38-leg gate afterwards, **or** your explicit ruling
that a comment-only edit is acceptable without one.
