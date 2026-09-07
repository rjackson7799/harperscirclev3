# 9B · OW-05, the leg-integrity quota for slice 9's close-out

**OW-05 is recurring, not one-time**: eight legs per close-out, each read
**title and coverage citation against its ACTUAL assertions**, findings
recorded *whether or not they move a verdict*. Explicitly not a scanner
(ADR-0027 D17 item 5; `docs/process/slice.md` §1). Slice 9's plan (Q7) rules
that this pass runs **whether or not slice 9 has a Tier-3 increment**, and
that OW-05's arithmetic is **re-derived here rather than restated**.

Legs are cited **by title** (traps §5). Every assertion below was read at the
9B head. **No leg here was RUN**: the browser gate's home is a Vercel staging
deployment (ADR-0046 D7a) and this host cannot meet preflight's floor, so this
is an audit of what the legs SAY against what they ASSERT — which is what the
quota asks for — and nothing here claims a leg passed.

| Increment | e2e legs it added | Audited here |
|---|---|---|
| **9A** (freeze guard, M1) | **none** — a migrations-and-pgTAP increment, whose evidence is `070`'s cases and `002`'s catalog pin. That zero is a fact, not an omission | n/a |
| **9B** (Home, and OW-28's unit) | **2** — one in `people.spec` (STP-04), one in `a11y.spec` (A11Y-13) | 2 |
| The backlog | — | 6, chosen where 9B's changes land: the completion screen, the resume router, and the landing rule 9B deliberately did NOT repoint |

Eight legs, the quota exactly. **The 9B pair is audited by the increment that
wrote them** — 7E's rule, kept: *"an increment that rewrites legs and then
audits other legs has audited nothing about itself."*

---

## 1. `people.spec` — "a crafted raise link names what it would grant — the subject, the domain and the level, on the password panel and again on the one that spends the token (STP-04, AC-PERM-5)" *(new in 9B)*

**Asserts:** the confirm section, located by `section:has(h2#confirm-raise)`,
contains *Nell*, *finances* and *full access* BEFORE the password is typed;
the password input is present; after the real step-up it contains *Raise it*
and the same three words again; and on `rl=hidden` it contains *health & care*
and */nothing at all/i* with **zero** *Raise it* controls.

**Title against assertions: TRUE, and narrower than it looks.** The leg grants
nothing — it never clicks *Raise it* — and the title says *"names what it
would grant"*, not *"grants"*. That is deliberate: the words are STP-04's
assertion, and a leg that also spent the token would leave Dan holding
finances-manage for every later leg in a shared cast.

**Observation (moves no verdict):** the leg proves the words on both panels
but not that the panels' words MATCH the hidden `target_ref` posted beneath
them. The route-level suite does that (`tests/routes/member-detail.test.ts`
pins `target_ref` to `member:subject:domain:level`), so the pair is covered
between the two layers rather than in one.

## 2. `a11y.spec` — "A11Y-13: Home audited in both states — the day-one card and the router — at 390px, headed and keyboard-operable" *(new in 9B)*

**Asserts:** `auditRoute` twice — axe at WCAG 2.2 AA with contrast on, the
44 px touch-target floor, no horizontal scroll — once on a circle with no
arrivals and once after an arrival and a filed row exist; the day-one absences
(no `ul`/`ol`/checkbox, no `h2`, exactly one `h1`); every
`section[aria-labelledby]` naming an element that exists; *Recent activity*
and *approved by* present as the positive control; each block heading link
takes focus; and Home present in the nav.

**Title against assertions: TRUE.** *"at 390px"* is carried by the file's
`test.use({ viewport: PHONE })` (`a11y.spec.ts`:206, `PHONE = 390×844`), which
this leg inherits — checked rather than assumed, because a title claiming a
viewport the leg does not set is exactly this quota's quarry.

**Observation:** *"keyboard-operable"* is proven as **focusability**
(`.focus()` then `toBeFocused()`), not as a Tab traversal in DOM order. The
A11Y-09 leg is the file's traversal instrument; this leg does not duplicate
it, and the title's claim is the weaker one it can support.

## 3. `onboarding.spec` — "steps 3–4 and the completion screen (AC-AUTH-2/5; ADR-0011)"

**Asserts:** the step-4 indicator; both ADR-0011 forwarding addresses by
pattern; the §7.5 custodianship phrase; the unverified state's *Verify your
email* and **zero** invite links; and AC-AUTH-5's absences (*checklist*,
*local resources*).

**Title against assertions: TRUE.**

**F1 (observation, moves no verdict).** 9B U3 gives this screen a NEW PRIMARY
control — *Go to Nell's circle*, into Home — and this leg says nothing about
it. Nothing it asserts became false, so no verdict moves; what is true is that
the screen's most prominent affordance now has **no browser coverage**. Its
route-level cover is `tests/routes/setup-complete.test.ts`, which is where 9B
put it. Recorded here so the gap is visible rather than discovered later.

## 4. `onboarding.spec` — "abandon after step 2, return → resume at step 3 with the circle intact (AC-AUTH-9)"

**Asserts:** `/setup` → `**/setup/step/3?circle=<id>` and the *Step 3 of 4*
indicator.

**Title against assertions: TRUE**, and precisely scoped: it is the
`hasCircle && openingContext = []` branch of `resumeStep`.

**F2 (observation, moves no verdict).** `resumeStep`'s OTHER branch —
`hasCircle && openingContext ≠ []` → step 4, the branch a founder hits on
EVERY return after finishing setup — has no browser leg at all. 9B U3 names
this as the destination it deliberately did not repoint (repointing it amends
AC-AUTH-9, which is a ruling and not a build decision), so the gap and the
open question now sit in the same place. `tests/setup/founder-door.test.ts`
pins all three branches at the unit layer.

## 5. `onboarding.spec` — "the custodianship declarations are the circle log's first rows (AC-AUTH-6)"

**Asserts:** the first two `access_log` rows for the circle, by `seq`, are
`custodianship_declared`, the first at `seq: '1'`.

**Title against assertions: TRUE.** *"first rows"* is proven by `order by seq
limit 2` plus the `seq = 1` anchor, which is what makes it a claim about
POSITION rather than about presence. Clean.

## 6. `review.spec` — "below-cliff: the summary-×5 member sees the row, the state, and ONE line (AC-INBOX-8 live)"

**Asserts:** on `/[circle]/inbox/<arrival>` as a summary-×5 member, the main
region contains *fuller access*; and does NOT contain *What we read*, *What we
propose*, `.review-grid`, `button.review-fact`, `.review-proposal`, or a link
to the artifact route; the artifact route itself answers 404.

**F3 (observation, and the one a reviewer should weigh).** The title claims
three things and the leg asserts one and a half. *"ONE line"* is proven
(*fuller access*, plus the absence set). **The STATE is never asserted** — no
`product_state` label is checked — and **the ROW is never asserted either**:
the leg navigates STRAIGHT to the detail URL and never loads
`/[circle]/inbox`, so *"sees the row"* is a claim about a list this leg does
not visit. Nothing here is false; the title is simply wider than its
assertions, which is the round-18 class this quota exists to find. The remedy
is two lines (visit the list, assert the row and its label) or a narrower
title, and it belongs to whoever owns AC-INBOX-8's leg next — **not** to a
build session quietly rewriting a merged increment's leg (8C's own rule).

## 7. `onboarding.spec` — "invitee: ceiling before anything, create account with the address fixed, land on the Timeline (AC-AUTH-7 shape, §4.1.4)"

**Asserts:** the ceiling sentence, the circle, the inviter and the subject
before any ask; that the email field is ABSENT on the invited create-account
screen; and `waitForURL('**/<circle>/timeline')` with *Timeline* rendered.

**Title against assertions: TRUE**, and this leg is why 9B's landing decision
was checkable rather than a matter of taste: PRD §4.1.4 rule 4 says *"Family
lands on the Timeline… nobody lands on Home"*, and this leg is that rule's
live pin. 9B repointed the founder's post-setup destination and left this one
alone; had it repointed the accept route, THIS leg is what would have gone
red. Clean, and recorded as the positive control.

## 8. `extraction.spec` — "a refusal lands `Couldn't read it` — and the artifact stays viewable (§6.8)"

**Asserts:** the arrival reaches `extract_failed` (never `proposals_ready`);
the `arrival_events` reason code is `provider_refusal`; the inbox says
*Couldn't read it*; the body does NOT match `/unsafe/i`; and
`/api/artifact/<id>` answers **200**.

**Title against assertions: TRUE, and the leg proves MORE than it says.** The
reason-code assertion and the *never told it was unsafe* absence are the two
strongest claims in it and neither is in the title. Under-claiming is the safe
direction and no verdict moves, but a title that named them would make the leg
findable by a reviewer looking for §6.8's discretion rule. Clean.

---

## Tally

**Eight legs audited. Three findings recorded (F1, F2, F3), none moving a
verdict; five legs clean.** F3 is the one to weigh: a title claiming a row and
a state the leg never visits. F1 and F2 are coverage GAPS created or exposed
by 9B's own changes, and both are named where the change is, not filed as new
ledger rows — ADR-0038 D3 is explicit that a row for work this small is the
loophole the cap exists to close.

## The arithmetic, re-derived rather than restated (plan Q7)

`docs/owed.md`'s OW-05 acceptance still reads *"8 legs per close-out — 24 of
the 31 by slice end"* against a denominator of **38**. Both numbers are stale.

**Counted at the 9B head, from the files:** **68 legs in 9 files** —
`onboarding` 11 · `a11y` 11 · `people` 9 · `ingestion` 8 · `review` 7 ·
`search` 6 · `record` 6 · `extraction` 5 · `documents` 5. It was 66 in 9 files
at 9A's head; 9B's two are the difference.

**And the covered count cannot be stated as a fraction honestly.** The passes
overlap by construction: R6's twelve and 7E's eight are partly the same legs
read twice — deliberately, to answer *did the fix hold?* — and 8C's eight
include its own two. Adding them would inflate the numerator; the record
carries the passes, not a set of distinct titles.

**Recommended, and left as a recommendation because a build session may not
amend a ledger row's acceptance condition:** OW-05's acceptance should carry a
**list of audited leg TITLES** rather than a running count — or, better, the
list becomes a manifest a test can read (ADR-0026: *if it can be a scanner, a
manifest, or an exact-set assertion, it must be*), so the fraction stops being
arithmetic nobody can reproduce. Until then the honest statement is the one
this file makes: **eight legs this close-out, named above, out of 68 on
disk.**
