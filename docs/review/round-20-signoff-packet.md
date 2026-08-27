# Round 20 — the sign-off PACKET: the 21-site matrix, the proposed rulings, the proposed corrected tally

**THIS DOCUMENT RATIFIES NOTHING AND RULES ON NOTHING.** It is the material an
owner needs in order to rule, assembled so that each proposal can be accepted,
amended or refused on its own. ADR-0027 remains
`proposed — BLOCKED at sign-off`; ADR-0028 remains `proposed`. **Neither Status
line is touched by this packet**, and no `docs/coverage.md` cell is touched by
it either.

Every ruling below sits under §2, whose heading is
**`DRAFT — PROPOSED FOR OWNER RULING`**. No section of this document is named
for the owner, because a section titled "owner sign-off" containing a session's
own proposals is a false historical record.

**Companion documents.** `docs/review/round-20-signoff-attack.md` is the audit
that produced the defects ruled on here — 11 claims HELD, 5 confirmed record
defects, 1 confirmed contradiction. **Nothing in it is re-derived here.** This
packet consumes it.

---

## 0. State re-verified at the head of this session, not inherited

The audit's §1.9 requires the docs-only claim be re-checked immediately before
the owner decision rather than carried forward. It was:

| Check | Result |
|---|---|
| `git rev-parse --abbrev-ref HEAD` | `slice/6b-care-inbox-app` |
| Branch head | `384c3d2` |
| `main` | `b0cc2b6` — **UNMOVED** |
| Commits unpushed | **28 ahead of `origin`, deliberately unpushed** |
| `git diff --name-only 1066e2d..HEAD` outside `docs/` | **EMPTY** |

Two files have changed since the gate head, both under `docs/`:
`docs/adr/0028-…` and `docs/review/round-20-signoff-attack.md`.
**The GREEN 38/38 gate at `1066e2d` (run `r5`) therefore still proves this
head.**

### The citation convention this packet adopts before it says anything else

The audit's DEFECT 4 established that ADR-0026 and ADR-0027 both number
sections `D1`–`D2x`, that ten numbers collide, and that the ambiguity has
already propagated one document forward. **The same hazard exists for finding
numbers, and it is sharper**: `ADR-0027 F-2` is the OCR helper validating the
branch that does not run (its D4). `ADR-0028 F-2` is the session gate rendering
an outage as a sign-out (its D1). **They are different findings with the same
name, and §1 of this packet is about one of them.**

Every cross-document reference below is therefore written
`ADR-00nn Dn` / `ADR-00nn F-n`, never bare.

---

## 1. THE BEHAVIOURAL MATRIX — all 21 session call sites

**Why this exists.** ADR-0028 D1 (`:103`) claims *"Twenty call sites read that
null as the signed-out answer — twelve pages redirect to `/sign-in`, eight
routes refuse."* The audit's DEFECT 3 settled that the count is **21**, and
that the document defines no exclusion. It also declared the verdict impact
**NOT established**, and named this matrix as what settles it.

### 1.1 How each column was derived

- **Enumeration:** `liveSessionClaims(` / `readLiveSession(` over `app/`, one
  call per file — 21 files, 21 calls. The two `lib/auth/session.ts`
  occurrences are the definition sites and are excluded, as ADR-0028's own
  wording ("call sites") requires.
- **Signed-out / unavailable response:** read from the branch each site takes,
  at the site, not inferred from the surface type.
- **Timeout bound:** `lib/db/user.ts` passes **no `fetch` override and no
  `AbortSignal`** to `createServerClient`, so nothing bounds the auth hop
  except an explicit budget at the call site. `maxDuration` is exported by
  exactly one route in the tree and it is not one of these 21.
- **Expected policy:** proposed, not derived — this column is argument, and it
  is the column the owner is being asked to rule on.

### 1.2 The gate contract splits 3 / 18, and the split is clean

| Contract | Outcomes | Sites |
|---|---|---|
| `readLiveSession` | `signed-in` · `signed-out` · **`unavailable`** | **3** |
| `liveSessionClaims` | claims · `null` (unavailable collapses into `null`, logged) | **18** |

3 + 18 = 21. **The three that take the three-outcome contract are exactly the
three ADR-0028 D1's fix table names**, and `sessionUnavailable` is imported by
exactly those three files.

### 1.3 The matrix

Policy codes are defined in §1.4. `→ /sign-in` is the framework-issued
redirect from `next/navigation`'s `redirect()`; **this code asserts no status
for it**, so none is claimed here. `303` is `redirect303`
(`lib/auth/http.ts:8`), which does assert one.

| # | Site | Surface | Signed-out | Unavailable | Timeout bound | Policy |
|---|---|---|---|---|---|---|
| 1 | `app/(app)/[circle]/inbox/page.tsx:152` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 2 | `app/(app)/[circle]/inbox/[arrival]/page.tsx:55` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 3 | `app/(app)/[circle]/invite/page.tsx:31` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 4 | `app/(app)/[circle]/senders/page.tsx:40` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 5 | `app/(app)/[circle]/tasks/page.tsx:22` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 6 | `app/(app)/[circle]/timeline/page.tsx:24` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 7 | `app/(app)/[circle]/upload/page.tsx:23` | page | `→ /sign-in?next=` | **same** | none | P3 |
| 8 | `app/account/page.tsx:20` | page | `→ /sign-in?next=%2Faccount` | **same** | none | P3 |
| 9 | `app/setup/page.tsx:15` | page | `→ /sign-in?next=%2Fsetup` | **same** | none | P3 |
| 10 | `app/setup/complete/page.tsx:28` | page | `→ /sign-in?next=%2Fsetup` | **same** | none | P3 |
| 11 | `app/(app)/[circle]/layout.tsx:23` | **layout** | **shell renders, no user in TopBar** | **same** | none | **P4** |
| 12 | `app/(app)/[circle]/inbox/[arrival]/decide/submit/route.ts:37` | route (form) | **`303` → `/sign-in?next=`** | **same** | none | P3b |
| 13 | `app/(app)/[circle]/inbox/accept-sender/submit/route.ts:21` | route (form) | **`303` → `/sign-in?next=`** | **same** | none | P3b |
| 14 | `app/(app)/[circle]/inbox/cancel/submit/route.ts:17` | route (form) | **`303` → `/sign-in?next=`** | **same** | none | P3b |
| 15 | `app/(app)/[circle]/inbox/resolve/submit/route.ts:18` | route (form) | **`303` → `/sign-in?next=`** | **same** | none | P3b |
| 16 | `app/(app)/[circle]/senders/revoke/submit/route.ts:21` | route (form) | **`303` → `/sign-in?next=`** | **same** | none | P3b |
| 17 | `app/(auth)/confirm/route.ts:45` | route (**non-gating**) | **proceeds; `303` → `/account?verified=1`** | **same — activation silently skipped** | none | **P5a** |
| 18 | `app/account/sign-out-everywhere/route.ts:23` | route (**non-gating**) | **proceeds; `303` → `/sign-in?bye=1`** | **same — audit entry skipped** | none | **P5b** |
| 19 | `app/api/upload/token/route.ts:29` | route (API) | **`401` `sign in first`** | **`503 session_unavailable`** | **none** | **P2** |
| 20 | `app/api/upload/complete/route.ts:40` | route (API) | **`401` `sign in first`** | **`503 session_unavailable`** | **none** | **P2** |
| 21 | `app/api/artifact/[id]/route.ts:156` | route (API) | **`404`** (the ONE 404, no-oracle) | **`503 session_unavailable`** | **15 s shared `AnswerBudget` → `504 read_timeout`** | **P1** |

**Totals.** 10 `page.tsx` · 1 `layout.tsx` · 10 `route.ts` = 21.
By signed-out behaviour: **15 redirect** (10 pages + 5 form routes),
**1 degrades**, **2 proceed**, **3 refuse with a status**.
By unavailable behaviour: **18 identical to signed-out**, **3 distinct**.
By bound: **1 bounded**, **20 unbounded**.

### 1.4 The proposed policy classes

- **P1 — distinguish and bound.** All three states distinct, and the wait is
  bounded. **MET at exactly one site of 21.**
- **P2 — distinguish; the bound is OWED.** The three states are distinct and
  ADR-0028 D1's fix is real here. But the auth hop carries **no budget**, so a
  stall still hangs for as long as it hangs — it merely ends in `503` instead
  of `401`. **The 24.3-second call in the `r2` trace that started this whole
  finding was `POST /api/upload/token`, and that route is still unbounded.**
- **P3 — gate; the distinction is OWED.** A fault must not read as a sign-out.
  The honest move on `unavailable` is a retryable state that preserves the
  URL, not a redirect that discards it.
- **P3b — P3, and the POST body is discarded.** At all five form routes the
  gate returns **before `formFields(req)` is read**, and `303` sends the
  browser to a `GET`. An availability blip therefore silently drops a care
  decision the person had already made — approve or reject a proposal, cancel
  an arrival, resolve a duplicate, revoke a sender.
- **P4 — not a gate at all.** Site 11 never redirects and never refuses; it
  reads `claims?.email` for the top bar and renders regardless.
  **Correct as-is, and it must never be counted among "pages that redirect."**
- **P5a — non-gating side effect, one-shot, and NOT correct as-is.** See §1.6.
- **P5b — non-gating side effect, already ruled, correct as-is.** See §1.6.

### 1.5 What the matrix shows that the count error did not

**The count error is the least of it.** Three things only a per-site read
surfaces:

1. **"Eight routes refuse" is wrong in kind, not only in number.** Of ten
   routes, **three** refuse with a status. **Five redirect exactly as pages
   do** — a page redirect is not a route refusal, and these five have been
   filed on the wrong side of that line. **Two do not gate at all.**
2. **The remainder ADR-0028 D1 declares is 18 sites, not 12.** Its OWED
   paragraph and ADR-0028 D8 item 2 both say *"the twelve PAGE gates."* The
   two-outcome contract is taken by **18** sites in **five** behavioural
   classes, and D8 item 2 as written **does not cover the five form routes or
   the confirm route at all**. This understates the owed work by half and
   mis-describes its shape.
3. **The site where the stall was measured is still unbounded** (P2, above).
   ADR-0027 D17 item 3 — F-1's composition limit — is not an abstraction about
   35 call sites sharing a pool. It has a named, concrete instance here.

**One observation, labelled as inference and NOT measured here.** Every
`(app)/[circle]/*` page request renders site 11 *and* one of sites 1–7, so it
performs **two** `readLiveSession` calls, each of which is two auth-server
round-trips. That follows from the App Router rendering a layout and its page
on the same request; **no measurement in this round observed it**, and it is
recorded as a question for ADR-0027 D17 item 3 rather than as a finding.

### 1.6 The two sites the brief anticipated might differ — and they differ from *each other*

**Site 18, `account/sign-out-everywhere` — correct as-is, ratify.** On
`unavailable` the `signed_out` audit entry is skipped and the global sign-out
proceeds. The file's own header (`:15-18`) already rules exactly this: *"Sign-
out is never refused … the member's control over their own sessions outranks
the trail's completeness."* **This is the one site of 21 where collapsing
`unavailable` into `signed-out` is the right behaviour**, and it is right
because someone argued it at the site in advance.

**Site 17, `(auth)/confirm` — NOT correct as-is, and this is new.** On
`unavailable`, `activateForwardingAfterVerification` is skipped, and the person
is redirected to `/account?verified=1` — told they are verified, while the
lifecycle moment that verification exists to trigger did not happen.

- The function has **exactly one call site in the tree** — this one. `grep`
  over `app/`, `lib/`, `tests/` returns the import, the call, and the
  definition. **No worker, cron, or admin path re-runs it.**
- The route reaches line 45 only after `verifyOtp` or
  `exchangeCodeForSession` has **consumed the token**. There is no replay.
- The function is idempotent and selects `forwarding_active_at is null`, so a
  later call *would* succeed. **There is no later call.**

**Nothing is logged that says the activation did not happen.** The `catch` at
`:47` does not fire, because `liveSessionClaims` returns `null` on
`unavailable` rather than throwing; what reaches the log is the generic
`session: the live session could not be READ` line, which does not name the
consequence. **A founder's forwarding addresses stay inactive, silently, with
no retry path** — recorded here because the matrix is what surfaced it and no
document in the round carries it.

### 1.7 DOES ADR-0028 F-2's DISPOSITION MOVE? — Yes, and not for the reason the count suggested

Two questions, deliberately kept apart:

**(a) Does the count error alone move it? NO.** Every element of
*"ACCEPTED, mechanism AMENDED, the leading candidate REFUTED, and FIXED"*
survives the correction untouched. The mechanism is right and the matrix makes
it **stronger**, not weaker: 18 of 21 sites read a fault as a sign-out, and
**not one of them is a fixture** — which is precisely the ground on which
ADR-0028 D1 amended the classification from instrument to product. The
refutation of refresh-token rotation rests on the preserved `r2` trace and is
untouched. The fix is real and correct at all three sites it names. **A wrong
enumeration of a correct mechanism is a record defect.**

**(b) Does the matrix move it? YES — from FIXED to FIXED IN PART.** Not
because of the count, but because the matrix makes the **declared remainder
measurable**, and ADR-0028 D1 declares one in its own OWED paragraph: *"The
twelve PAGE gates still render an outage as a sign-in redirect. Same harm."*

The argument is **consistency**, and it is the strongest ground available:

> §3 below proposes demoting ADR-0027's F-1, F-3 and F-4 to **FIXED IN PART**
> for carrying declared remainders of their own fixes. ADR-0028 F-2 carries a
> declared remainder of its own fix, in the same shape, stated in the same
> document that claims the fix. **It would be incoherent to demote three
> findings for that shape and leave a fourth at FIXED.**

And the matrix shows the remainder is **larger than the document says**: 18
sites, not 12; five of them discard a person's already-made decision (P3b);
one of them loses a one-shot lifecycle side effect with no signal (P5a); and
the two sites that *were* fixed are still unbounded (P2).

**Proposed: ADR-0028 D6's F-2 row moves `ACCEPTED … FIXED` →
`ACCEPTED … FIXED IN PART`.** The disposition moves. The *finding* is upheld
in full and its amendment is ratified — see §2.2 item 2.

---

## 2. DRAFT — PROPOSED FOR OWNER RULING

**Everything in this section is a proposal from this session.** None of it is
ruled, and none of it has been acted on. Vocabulary is ADR-0025's:
**RATIFIED AS WRITTEN / AS CORRECTED / AS AMENDED / AS SHIPPED · UPHELD IN
FULL · TAKEN · REJECTED · ADOPTED.**

### 2.1 ADR-0027 D20 — items 1 through 6

#### Item 1 — the nine dispositions in ADR-0027 D15

> *"nine ACCEPTED, nine FIXED, two carrying a declared remainder, one with its
> recommendation amended."*

**Proposed: RATIFIED AS CORRECTED.**

The nine dispositions themselves stand — **9 ACCEPTED · 0 DECLINED is exactly
right**, and the audit's §1.4 confirmed the F-n → D-section map is correct in
all nine with the severity distribution reconciling at 2 + 5 + 2. What does not
stand is the **tally sentence**, which the audit found wrong in both halves
(DEFECT 1) and over-counting `FIXED` against ADR-0027 D7's own heading
(DEFECT 2, compounded by DEFECT 5).

The corrected arithmetic is §3. **This is a bookkeeping correction, not a
re-litigation of any finding** — no finding's *substance* moves, and nothing
that was fixed becomes unfixed.

#### Item 2 — RULING 5 and the Q1–Q5 rulings in ADR-0027 D12

**Proposed: RATIFIED AS AMENDED.**

- **RULING 5** (ADR-0025's F-1 → FIXED) — **RATIFIED AS WRITTEN.** The audit's
  §1.8 resolved the apparent migration/`supabase/` contradiction: migration
  `20260825120001_payload_contract.sql` landed in `39fcf17`, an ancestor of
  `bc3bc85`, so it predates the diff base. **69 migrations exact at both
  heads, zero files moved under `supabase/`.**
- **Q1, Q2, Q4, Q5** — **RATIFIED AS WRITTEN.** Q4's move from QUEUED to
  DIAGNOSED rests on ADR-0027 D10's ESLint cost-class claim, which the audit
  verified at case-level granularity (§1.10) after a file-level check nearly
  produced a false finding against it.
- **Q3 / UXA-03** — **AMENDED.** This is the audit's one confirmed
  contradiction. ADR-0027 D12 and D15 both say the row *"MOVES"*; ADR-0027 D16
  says *"No row is flipped to green on this round's authority"* and omits
  UXA-03 from its seven-row table; **`docs/coverage.md:491` carries
  `pending`.**

  **Proposed amendment: ADR-0027 D16 is right and the wording in D12 and D15 is
  wrong.** Strike *"and the row MOVES"* / *"and the row moves"*; keep
  **"Q3/UXA-03 passes"** — the exit condition the review itself attached is
  met, and that is a true and useful statement. **UXA-03's cell stays
  `pending`.**

  This is the conservative reading and it is also the only executable one:
  round 15's rule (ADR-0025 S16.7) is that **no coverage row flips at a
  sign-off**, and a `pending` row cannot move at all. D20 item 2 asks the owner
  to ratify *"including UXA-03 passing"* — under this amendment that phrase
  becomes true as written, because it says *passing*, not *moved*.

#### Item 3 — the suite disposition in ADR-0027 D13

**Proposed: RATIFIED AS WRITTEN, with one consequence recorded.**

The 38-leg denominator was proven by **discovery** rather than by counting
strings — `npx playwright test --list` returns `Total: 38 tests in 5 files`
(audit §1.7) — so every ratio in D13 (3/38, 7/38, 31 remaining) rests on sound
footing. The green gate is product evidence, not instrument trust; the one-time
leg-integrity pass stays a standing obligation; **there is explicitly no
scanner.**

**The consequence:** the gate is now GREEN 38/38 at `1066e2d`, which upgrades
exactly two *"full-gate result stays owed"* clauses — **UXA-01 and RLS-10** —
from targeted-run evidence to gate evidence. **This is not a row flip and no
cell changes colour.** It is not executed by this packet; it is recorded as a
consequence for whoever records the rulings.

#### Item 4 — ADR-0026 as corrected by ADR-0027 D8 and D9

**Proposed: RATIFIED AS CORRECTED — and a convention ADOPTED alongside it.**

ADR-0027 D9's correction is the strongest-verified number in the round: **nine
fetch call sites, seven awaited and two eager, at the exact cited lines**, with
the two `lib/storage/fetch.ts` occurrences correctly excluded (audit §1.3).
ADR-0027 D8's correction of both documents' understated headlines holds.

**ADOPTED, and this is the round's own addition:** every cross-ADR citation
carries its document number — `ADR-0026 D5`, never bare `D5`. The audit's
DEFECT 4 found the mis-cite at `ADR-0028:364` (*"ADR-0027 D5"* where the
PowerShell lesson is **ADR-0026 D5**), and established that this is a
structural hazard rather than a slip: ten section numbers collide between
ADR-0026 and ADR-0027, and `D5`, `D15` and `D17` are each used for both
documents *within ADR-0027*. **§0 of this packet shows the hazard extends to
finding numbers too** — `ADR-0027 F-2` and `ADR-0028 F-2` are different
findings.

Correcting `ADR-0028:364` is a documentation edit and is safe. **Correcting the
bare citations already inside ADR-0027 is not proposed** — under the amendment
rule the existing prose is preserved, and the convention binds new text.

#### Item 5 — that ADR-0027 D10 and D11 exceed what was asked

**Proposed: UPHELD IN FULL — neither is reversed.**

D10's diagnosis verifies at the granularity it was actually claimed at
(audit §1.10), and the count is exact: two test files construct an `ESLint`
instance and load `eslint-config-next`, with 6 and 34 cases. D11's CI step plus
zero-warning assertion is corroborated by ADR-0027 D19's clean build, run
precisely so the step would go green on arrival.

**One honesty note attached rather than smuggled past:** the CI step itself has
**never run**, because the branch is deliberately unpushed. Its green-on-arrival
is *predicted* from a local `build`, not observed. **That observation is the
owner's very next leg** (§5), and it is the reason ratification is effective
only once CI is confirmed.

> **AMENDED AT ROUND 20 — "NEVER RUN" WAS TRUE WHEN WRITTEN AND IS NOW
> FALSE.** The honesty note above is preserved exactly as written; it was
> true at the head that carried this packet. The branch has since been
> **pushed** (`origin/slice/6b-care-inbox-app` == `c92877b`) and CI has run
> at that SHA on both events — **#165 `push` and #166 `pull_request`, both
> `success`**. ADR-0027 D11’s step, `Build, and ZERO resolution warnings`,
> **executed for the first time and passed, 17 s on each event** (step 19 of
> 21). Its green-on-arrival is no longer *predicted* — it is **observed**.
> The upgrade leg ran 39 s / 38 s, so it genuinely rehearsed the increment
> rather than taking the `HEAD == base` early exit. **This discharges the
> observation, not the ratification:** item 5’s proposed verdict remains a
> proposal and is **NOT RULED**.

#### Item 6 — whether ADR-0027 D17 item 4 warrants a migration-budget amendment

> F-3's residue: close the commit round-trip window with two-phase commit or a
> column marking an unconfirmed entry — **DDL** — or rule that a one-round-trip
> window is accepted.

**Proposed: REJECTED as an amendment at this sign-off; TAKEN as a slice-7
scoping question.** This is the item on which this session's recommendation is
weakest-held, and the owner should feel least bound by it.

Three reasons to hold:

1. **The zero-DDL exit has never been evaluated.** ADR-0027 D17 item 4 offers
   two exits and only one needs DDL. *"A ruling records that a one-round-trip
   window is accepted"* costs no migration budget, and **nobody has yet
   assessed it**. Granting DDL headroom before assessing the exit that needs
   none spends authority to buy something that may not be needed.
2. **The budget is 7 of ≤ 7 SPENT and 69 migrations is exact.** An amendment
   at a sign-off would reopen a closed budget in the session least equipped to
   scope what it would be spent on.
3. **ADR-0027 D20 item 6's own wording** — *"this round deliberately did not
   ask"* — records that the round declined to make the case. Ratifying an
   amendment nobody argued for would be the sign-off supplying the argument.

**The owner may reasonably rule the other way**, and the cost of doing so is
low: the amendment would authorise DDL at slice 7, not now.

### 2.2 ADR-0028 D10 — items 2 through 4

**Item 1 is not proposed on.** It was put to the owner and **RULED NOT PLANNED
this round, gate first** (ADR-0028 D11). Nothing here reopens it, and no line
of that architecture change exists.

#### Item 2 — the amendment of ADR-0028 F-2 from instrument to product, and the refutation of the rotation candidate

**Proposed: RATIFIED AS CORRECTED — and the disposition MOVES to FIXED IN
PART.**

- **The amendment — RATIFIED.** F-2 is a **PRODUCT** defect. §1's matrix
  strengthens this: **18 of 21 sites** read an auth-server fault as a
  sign-out, and **there is no fixture anywhere in that mechanism**. Any family,
  on any auth-server hiccup, is told they are signed out of their own record.
- **The refutation of refresh-token rotation — RATIFIED.** It rests on the
  preserved `r2` trace on two independent grounds — a signed-in shell served
  `200` six seconds *before* the `401` (and a revoked session family cannot
  un-revoke), and the refused call took **24.3 seconds**, which is not how a
  revocation answers. Nothing in this packet touches it.
- **CORRECTED — the enumeration.** *"Twenty call sites … twelve pages redirect,
  eight routes refuse"* → **21 call sites; 3 refuse with a status; 5 form
  routes redirect exactly as pages do; 2 do not gate at all; 1 layout
  degrades; 10 pages redirect.** The correction lands at `ADR-0028:103` **and
  at `ADR-0028` D8 item 2**, whose scope is understated by half.
- **MOVED — the disposition.** `ACCEPTED … FIXED` → **`ACCEPTED … FIXED IN
  PART`**, on the consistency ground argued at §1.7(b).

**⚠ The same wrong sentence is in product code**, at `lib/auth/session.ts:32-33`
(*"Twenty call sites read it that way: twelve pages redirect to /sign-in and
eight routes refuse"*). **This packet does not touch it**, because touching
`lib/` voids the docs-only claim that makes the green gate at `1066e2d`
evidence for this head. It is recorded as OWED in §4.

#### Item 3 — the overturning of the stall's localisation (ADR-0028 D3)

**Proposed: RATIFIED AS AMENDED.**

The overturning is ratified **as a localisation claim about the mechanism** —
that the stall is not the DB reads, not the signed-URL hop, and not F-2 — with
two amendments stated at the front rather than buried:

1. **It remains UNCONFIRMED IN THE RUNNING APP.** The `HopCost` ledger the
   round landed for exactly this purpose **has still never fired on a live
   stall** (ADR-0028 D8 item 5a; three attempts at round 20 narrowed the
   reproduction condition without discharging it). ADR-0028 D11 records this as
   corroborating the hold on D10 item 1 — **it equally qualifies the
   localisation it was built to confirm.** Ratifying the overturning is
   ratifying the best available reading of the evidence, not a confirmed
   mechanism, and it should be recorded in those words.
2. **The contradicted sentence in `lib/http/budget.ts` is MARKED, never
   rewritten** — the ADR-0025 amendment rule, per audit §5.2: a marker at the
   site with the original prose preserved. **This is product code and this
   packet does not touch it.** OWED, §4.

**Not proposed, and named rather than smuggled past:** ADR-0028 D3's
measurements are **not reproduced** anywhere in round 20, deliberately — the
scratchpad harnesses are gone and rebuilding them without a manifest would
produce numbers without reproducing the causal conditions (audit §6). Any
future attempt that cannot control service versions, warm-up, sample count,
concurrency, pool-state reset and variance must report **"method
corroborated"**, never *"measurement reproduced."*

#### Item 4 — the note that ADR-0027 is still `proposed — BLOCKED at sign-off`

**Proposed: RATIFIED AS SHIPPED, with the condition recorded as DISCHARGED.**

The note is **true of round 19** exactly as written, and it ratifies as the
document carries it. What has changed is not the sentence but its **condition**:

| Site | What it says | Status |
|---|---|---|
| `ADR-0027` Status line | *"the 38-leg browser gate at `4f242f5` came back RED"* | **true of `4f242f5`** |
| `ADR-0027` D20 item 7 | *"nothing to ratify at this head"* | **true of `4f242f5`** |
| `ADR-0028:432` | *"and the 6B slice does not merge"* | **true of `r3`** |

All three had their condition discharged by the **GREEN 38/38 gate at
`1066e2d`** (run `r5`, corroborated four ways). Under the amendment rule each
takes **a marker at its site with the original prose preserved — never a
rewrite.**

**The Status lines are NOT touched by this packet.** Stamping them is the
owner's act, and §5 states why it cannot precede CI.

---

## 3. THE PROPOSED CORRECTED TALLY

**What ADR-0027 D15 currently says:**

> *"**Tally: 9 ACCEPTED · 9 FIXED · 0 DECLINED**, with **2 carrying a declared
> remainder** (F-3's commit-round-trip residue; F-4's row-boundary typing) and
> **1 fixed with its recommendation amended** (F-7)."*

**Why it fails.** The audit settled both halves. Four rows carry a remainder by
the table's own wording, not two; and the count of two **includes F-4's `OWED`
remainder while excluding F-1's identically-labelled `OWED` remainder**, so it
is not 2 under *either* reading — 1 if OWED items are excluded, 4 if included.
Separately, `9 FIXED` counts ADR-0027 F-4, whose own section heading reads
*"ACCEPTED and **FIXED in part, OWED in part**."*

### 3.1 The missing distinction, stated

The audit found that **no distinction between "declared remainder" and "OWED"
is stated anywhere in the document.** Proposed, because the corrected tally
cannot be written without it:

- **A fix remainder** — part of the fix itself was not made. → **FIXED IN
  PART.**
- **A verification remainder** — the fix is whole; its consequence has not been
  observed. → **FIXED**, with the observation OWED.

These are different facts and collapsing them is what produced the wrong count.

### 3.2 The proposed row-by-row classification

| # | Current | Remainder the row itself declares | Kind | **Proposed** |
|---|---|---|---|---|
| **F-1** | ACCEPTED · FIXED | *"the composition limit **OWED**"* (D17 item 3) | **fix** | **ACCEPTED · FIXED IN PART** |
| **F-2** | ACCEPTED · FIXED | *"deployment consequence remains **unobserved**, as bounded"* (D17 item 8) | **verification** | **ACCEPTED · FIXED** |
| F-3 | ACCEPTED · FIXED | *"**narrowed, not closed**"* (D17 item 4) | **fix** | **ACCEPTED · FIXED IN PART** |
| F-4 | ACCEPTED · FIXED | *"the row-boundary typing **OWED**"* (D17 item 2) — **and DEFECT 5** | **fix** | **ACCEPTED · FIXED IN PART** |
| F-5 | ACCEPTED · FIXED | — | — | **ACCEPTED · FIXED** |
| F-6 | ACCEPTED · FIXED | — | — | **ACCEPTED · FIXED** |
| F-7 | ACCEPTED · rec. AMENDED · FIXED | — | — | **ACCEPTED · rec. AMENDED · FIXED** |
| F-8 | ACCEPTED · FIXED | — | — | **ACCEPTED · FIXED** |
| F-9 | ACCEPTED · FIXED | — | — | **ACCEPTED · FIXED** |

**F-2 is the row that decides the whole shape.** It is the only one of the four
whose remainder is *not* a piece of missing fix — ADR-0027 D17 item 8 says
*"Done when: a hosted runtime has been looked at. No local instrument can close
this."* Nothing is unbuilt; something is unseen. **It stays FIXED**, and that
is why the four remainders do not become four demotions.

**F-4 carries the correction DEFECT 5 forces.** The phrase *"FIXED for the
syntactic class"* overstates even the partial claim: the rule at
`tests/lint/timestamp-boundary.test.ts:52-59` closes **three** spellings, and
at least **five more** were evaluated — not reasoned about — and produce the
byte-identical string the file's own comment says causes the §2.7 refusal
(`'' + x`, `x.toString()`, `[x].join('')`, `''.concat(x)`, `` `${x ?? ''}` ``).
**Proposed wording: "FIXED for three named spellings; the class has at least
eight members" — narrowed, not closed**, which is the phrasing ADR-0027 D3
already uses about F-3. **F-4 is not demoted further than FIXED IN PART**: the
corpus scan is empty, no shipped site uses a missed spelling, and the rule
holds the corpus today. The defect is in the **claim**, not in behaviour.

### 3.3 The proposed tally

Stated in ADR-0025's single-axis form, so it is directly comparable to the
precedent — *"3 FIXED · 1 FIXED IN PART · 1 OWED · 1 ACCEPTED · 1 ACCEPTED-NOTE
= 7"*:

> **Tally: 6 FIXED · 3 FIXED IN PART = 9. All 9 ACCEPTED · 0 DECLINED.**
>
> **Four rows carry a declared remainder** — F-1, F-2, F-3, F-4 — of which
> **three are fix remainders** (F-1, F-3, F-4, each now FIXED IN PART) and
> **one is a verification remainder** (F-2, which stays FIXED because the fix
> is whole and only its consequence is unobserved).
>
> **One fixed with its recommendation amended** (F-7).

**Arithmetic checks.** 6 + 3 = 9 = the finding count = the ACCEPTED count. ✓
0 DECLINED, unchanged. ✓ Four remainders, matching the four rows the table's
own wording declares. ✓ Every one of the four has an acceptance condition
already in ADR-0027 D17 — items 3, 8, 4 and 2 respectively. ✓ **No finding is
wholly OWED**: every one of the nine received at least a partial fix, which is
why the ADR-0025 precedent's `OWED` and `ACCEPTED-NOTE` classes are unused
here rather than forced.

### 3.4 The consequence for ADR-0028 D6

ADR-0028 D6 **carries no tally sentence** — it is a three-row table — so it has
no arithmetic defect to correct. But its F-2 row inherits both changes:

> **`ADR-0028 F-2` — ACCEPTED, mechanism AMENDED, candidate REFUTED, FIXED IN
> PART** — with the remainder corrected from *"the twelve PAGE gates"* to
> **the eighteen two-outcome sites, in five behavioural classes** (§1.3).

`ADR-0028 F-1` and `F-3` are unchanged by this packet.

---

## 4. WHAT REMAINS OWED

**New, surfaced by this packet:**

1. **`lib/auth/session.ts:32-33` carries the wrong enumeration** — the same
   *"Twenty call sites … twelve pages … eight routes refuse"* sentence, in
   product code. **Not touched here**: editing `lib/` voids the docs-only claim
   that makes the green gate at `1066e2d` evidence for this head. Needs a
   session that can re-run the gate, or an explicit owner ruling that a
   comment-only edit is acceptable without one.
2. **The contradicted sentence in `lib/http/budget.ts`** must be **marked**
   with its original prose preserved (§2.2 item 3). Same constraint, same
   reason.
3. **`app/(auth)/confirm/route.ts:45` silently loses a one-shot lifecycle side
   effect** on `unavailable` (§1.6). No document in the round carries this.
   *Done when:* the activation is retried, recorded for a later pass, or a
   ruling accepts the loss with its reasoning at the site.
4. **`api/upload/token` and `api/upload/complete` classify correctly but are
   unbounded** (§1.4, P2). The 24.3-second call in the `r2` trace was
   `upload/token`, and it is still unbounded. This is a named instance of
   ADR-0027 D17 item 3, not a new item.
5. **ADR-0028 D8 item 2 must be re-scoped** from *"the twelve PAGE gates"* to
   the eighteen two-outcome sites in five behavioural classes. **This changes
   the size and shape of an OWED item**, and is the one place where DEFECT 3
   has substantive rather than clerical effect.
6. **The timestamp rule closes 3 of ≥ 8 spellings** (DEFECT 5). `tests/` is not
   touched here for the same docs-only reason. Belongs with ADR-0027 D17
   item 2.

**Carried forward unchanged:** ADR-0027 D17 items 1–10 · ADR-0028 D8 items
1, 2 (re-scoped per above), 3, 5, 5a, 6, 7 · **the slice-5B queue at 39 OWED**.

**Deliberately NOT taken here:** ADR-0028 D3's measurements (§2.2 item 3) ·
any coverage row · any Status line · any DDL · any push, merge or gate re-run.

---

## 5. ⏸ AT THE GATE — what this packet stops short of, and why

**The next legs are the owner's, in this order:**

1. **Push the branch.** 28 commits, deliberately unpushed. The owner is sole
   merge authority and pushing is the owner's call.
2. **Confirm CI green at that exact SHA — both `push` and `pull_request`
   events**, read anonymously (`gh` is UNAUTHENTICATED here). ADR-0027 D11's
   CI step has never actually run (§2.1 item 5).
3. **Issue the rulings.**
4. **Only then** does a session record them and stamp the Status lines.

**Why the order cannot be compressed.** CI cannot be green at a head the
sign-off commit has not created yet. **Ratification is therefore effective only
after CI is confirmed at the head that CARRIES the rulings** — or must be
recorded as conditional until it is. *"Docs-only"* is **not** *"cannot affect
CI"*: process lint reads documentation, and this packet adds a document.

**Standing, unmoved by anything above.** G4 and G7 still block · G9 STAYS OPEN ·
`BAND_ARTIFACT_ALLOWLIST` EMPTY · slice-5B queue 39 OWED · RCP-02 pending
tagged 7 · SIG-01 NOT absorbed · migrations **69 exact**, budget **7 of ≤ 7
SPENT** · no real family data · `main` unmoved at `b0cc2b6` · PR #12 open, NOT
merged · **NOTHING IS PRODUCTION-ACTIVATED.**

## 6. What this packet does NOT do

- It **ratifies nothing** and **rules on nothing.** Every verdict in §2 and §3
  is a proposal.
- It does not touch either **Status line**.
- It does not touch **`docs/coverage.md`**. No row flips at a sign-off
  (round 15's rule, ADR-0025 S16.7), and no `pending` row moves.
- It does not touch **product, test, config, migration or gate-harness code** —
  which is what keeps the green 38/38 gate at `1066e2d` valid for this head.
  Three of the six owed items in §4 are owed *because* of this constraint.
- It does not **push, merge, or re-run the browser gate.** The permitted re-run
  is spent and a re-run can only lose a green.
- It does not **re-derive** anything the audit settled, and it does not
  reproduce ADR-0028 D3's measurements.
- It treats `chore/process-retune` as **NOT binding** — its own ledger says the
  amendment does not take effect by being written there, and its `slice.md`
  says it is in force from slice 7. The re-tally shape in §3 is adopted
  **voluntarily**, from the ratified ADR-0025 precedent on this branch, and is
  labelled as such.
