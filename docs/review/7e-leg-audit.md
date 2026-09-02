# 7E · OW-05, the leg-integrity quota for this close-out

**OW-05 is recurring, not one-time**: eight legs per close-out, each read
**title and coverage citation against its ACTUAL assertions**, with findings
recorded *whether or not they move a verdict*.

**Round 27's quota is already discharged by the review itself** — ADR-0038 D3:
*"R6 audited 12 legs against a quota of 8."* This record is the **7E
close-out's** instance, and it deliberately does not re-audit R6's twelve.
It audits **the eight legs 7E changed**, because a leg-and-scanner pass is
exactly where new title↔assertion drift gets introduced, and an increment that
rewrites legs and then audits *other* legs has audited nothing about itself.

Legs are cited **by title** (traps §5). Every assertion below was read at
`HEAD` after the 7E commits, not from memory.

---

## 1. `people.spec` — "people: subjects as people with custodians named; the plain line before any matrix (PPL-01, AC-PPL-2/3)"

- **Cell:** PPL-01, `review`, "Re-greens at 7E".
- **After 7E:** the no-matrix claim is asserted against the shape the matrix
  actually has — `input[name="level"]` = 0 and `form[action*="/grant/submit"]`
  = 0 — at both layers, alongside the pre-existing table/checkbox counts.
  "custodians named" is asserted as the contiguous clause
  `custodian:\s*People Founder`, plus `not.toContainText('named at setup')`.
- **FINDING (residual, does not move the verdict).** In the e2e fixture the
  custodian *is* the founder, so the custodian name is also a member card's
  display name. Tying the name to the slot with a contiguous-clause regex
  closes the gap R6/F-4 names, but a name that is no member's would close it
  structurally. The **unit half now uses one** (`Vivian Okonkwo`), and carries
  a negative case where no custodian resolves. Provisioning a second member
  purely to hold custodianship in the browser leg is **NOT PLANNED here** —
  named for 7D or slice 8.

## 2. `people.spec` — "the access log rendered and printed (PPL-04, AC-PPL-5/7)"

- **Cell:** PPL-04, `review`, "Re-greens at 7D/7E".
- **After 7E:** seven denials are seeded through `hc.log_denied` — the one
  denial writer, so the collapse window and the hash chain are real — and the
  leg asserts the whole sentence, anchored:

  ```
  /^People Founder tried to open something in Nell.s finances · 7 times · .+$/
  ```

  Actor, the UNNAMED phrase, subject, domain, the collapsed count, the date —
  and nothing else, so an object name inserted anywhere in the sentence fails
  it. The print check gained its **control**: the nav is asserted visible on
  screen *before* print is emulated.

- **CORRECTION to this record (2026-09-01, same increment).** The paragraph
  above first read *"the leg asserts … that the sentence names no domain"*.
  That described an assertion this increment **removed**, and it was wrong in
  the same way the leg was: `not.toContainText(/finances/i)` contradicted
  AC-PPL-5, whose sentence is *who did what, to whom, on which subject, **in
  which domain**, when*. The domain belongs there; the OBJECT is what must
  never appear. The browser leg failed on exactly that in run 1 and the
  assertion was replaced before the leg commit (`c6b8d4c`) — but this record
  was written before the run and kept the stale wording through its own
  commit (`36c3858`). A record naming an assertion the code does not make is
  the very defect R6/F-6 is about, so it is corrected here rather than left
  to be found again.
- **FINDING (recorded, does not move a verdict).** `hc.log_denied` passes a
  null object, so a denial row **cannot** carry an object name. The e2e clause
  is therefore about *rendering*, and the discriminating "would not print one
  if it were present" case is the unit half's (R4/F-8, fixture now carries
  `object_type` + `detail.title`). **AC-PPL-7's app-layer evidence is the
  PAIR**; neither half alone discharges it, and the cells should say so.

## 3. `people.spec` — "A11Y-10: the plain line first; the matrix keyboard-operable; meaning never by colour; the printed log readable — at 390px"

- **Cell:** A11Y-10, `review`, "Re-greens at 7E".
- **After 7E:** the keyboard clause reads the checked value **before**
  `ArrowDown` and asserts **movement** (`focusedValue !== before`) **and
  selection** (`:checked` follows focus), and pins the radiogroup itself
  (every radio shares `name="level"`). The colour clause gained its first
  assertion: an exact-set check of each radio's rendered word against
  `LEVEL_OPTION_WORD`.
- **FINDING (recorded, does not move a verdict).** The *printed log readable*
  clause here still has **no control** — the same `isVisible()` weakness
  R6/F-10 found in PPL-04. It is not a second defect of the same property
  (PPL-04 now controls it), but this leg's own clause remains one-shot.
  Worth a control at the next pass; not taken here, to keep 7E inside its
  ruled scope.

## 4. `documents.spec` — "documents list: rows at the member's own level, counts post-filter over the rendered tree; Add a document is an ingestion (DOC-01, AC-DOC-2)"

- **Cell:** DOC-01, `review`, "Re-greens at 7D/7E".
- **After 7E:** a second document is fixtured **outside** the filtered
  category, so `all > filtered` and the post-filter claim is read where it can
  fail; the caption is read as the `p.meta` whose WHOLE text is a bare count
  (`/^\d+ documents?$/`) and asserted with an **anchored** `^N documents?$`,
  closing the `"12 documents"` ⊃ `"2 documents"` hole. The narrowing of which
  element is read was itself a run-1 red: a `/document/` filter resolved to
  `<p class="meta">Add a document</p>`. And
  Dan reads the list **once** from his own context, which is the first
  discriminating case for *"at the member's own level"*.
- **No finding.** Title and assertions agree.

## 5. `documents.spec` — "re-categorise: the audience named before the move, the move landing with its markers (DOC-03, AC-DOC-6)"

- **Cell:** DOC-03, `review`, "Re-greens at 7D/7E".
- **After 7E:** Dan's read is asserted **200 before** and **404 after**, and
  the post-state is asserted as *"Move it out of Financial"* — which can only
  render if the document is in financial.
- **FINDING (recorded, does not move a verdict).** The title's *"with its
  markers"* is still not this leg's: the `document_changed` /
  `audience_changed` markers are asserted in the unit and pgTAP halves. The
  cell already scopes the leg correctly; the **title over-claims** relative to
  what the leg alone proves. Retitling is a leg change and is left for the
  increment that next opens the file.

## 6. `documents.spec` — "share / unshare: one document to the caregiver — her context sees IT and not a task derived from it; unshare is one action and her next look loses it (DOC-04, AC-DOC-5, AC-PERM-10)"

- **Cell:** DOC-04, `green` (the only one of the eight not in `review`).
- **After 7E:** two negatives added from the share-holder's live context —
  the viewer section count and the image count, both zero — mirroring DOC-02's
  summary negatives. Without them the leg passed with the viewer open.
- **No finding.** The addition strengthens an already-green row; R2/F-7's
  live-DB pin is the half that discriminates, and it was verified by mutation.

## 7. `documents.spec` — "A11Y-11: the viewer at 390px — axe clean, alt text on every page, the machine-read sibling reachable by keyboard as native text is"

- **Cell:** A11Y-11, `review`, "Re-greens at 7E when the leg asserts the
  transcribed text".
- **After 7E:** it asserts the transcribed text — `pre.review-machine-text`
  contains the words the page carries — after `Enter`, so the clause no longer
  holds when the sibling 404s, fails or returns empty.
- **FINDING (records a docs item for close-out).** R6/F-8's record half is
  applied in the audit manifest, but **the A11Y-11 coverage row's CLAIM column
  still reads *"page navigation by keyboard through the ONE artifact route"***
  — the struck clause. The amendment note records the strike; the claim text
  above it does not. A cell rewrite, owed at close-out, not a leg change.

## 8. `a11y.spec` — "the 7C surfaces: the documents list, the people list, the subject page and the access log, audited at 390px" *(new in 7E)*

- **Cell:** none of its own.
- **What it asserts:** `auditRoute` — axe at WCAG 2.2 AA with contrast on, the
  **44 px** touch-target floor (not axe's 24×24), and no horizontal scroll —
  over `/[circle]/documents`, `/[circle]/people`,
  `/[circle]/people/subject/[subject]` and `/[circle]/people/log`, with a
  positive control that the audits ran over real rows and over the
  `.action-link` class the round-27 44 px catch landed on. It names its own
  `test.setTimeout(300_000)` rather than inheriting the file's 120 s default —
  see F-a below, which is why.
- **FINDING (recorded, for close-out).** The leg has **no coverage row of its
  own**; it strengthens A11Y-10, A11Y-11 and C6, and is named in the audit
  manifest for four routes. Whether C6 wants a row of its own is a close-out
  question, not a 7E one.

---

## Tally

**Eight legs audited. Six findings recorded, none moving a verdict**: two
residual gaps named and left (1, 3), two scope clarifications for the cells
(2, 5), one docs item owed at close-out (7), one open close-out question (8).
Two legs clean (4, 6).

**No new ledger row.** Every finding here is either an artifact of a cell that
already says *"re-greens at 7E/7D"*, or a named residual inside a row already
open — and ADR-0038 D3 is explicit that a ledger row for work this small is
the loophole the cap exists to close.

## A note for close-out, on the counter

`docs/owed.md`'s OW-05 row still reads *"has covered 7 of 38 legs; 31
remain"* — it reflects neither R6's twelve nor these eight, because the
counter advances at close-out, not per increment.

**These eight must not be added to R6's twelve as if they were disjoint.**
Several are the same legs, read a second time *after* 7E rewrote them — which
answers a different question (did the fix hold?) and is not another slice of
the 38-leg backlog. The backlog figure the close-out should carry forward is
**R6's audit**; this record is the 7E pass's own integrity check on itself.

---

## Findings for 7D, from running the legs

7D runs **one complete gate at the final head** (ADR-0038 D5). These two were
observed during 7E's three targeted runs and are handed over rather than
fixed: both live in shared provisioning helpers, which is not a Tier-3
leg-and-scanner change, and **a tier is never lowered mid-slice**.

### F-a · `e2e/a11y.spec.ts` is marginal at its 120 s default on this host

The file sets no per-test timeout. Its legs provision through memoized
`ensureAccount` / `ensureCircle`, and **a failure restarts the worker, which
discards the memo and re-provisions** — traps §4's documented cascade,
observed directly:

| leg (untouched by 7E) | run 1 | run 2 | run 3 |
|---|---|---|---|
| the (app) shell routes and account | 116 s | 25 s | 25 s |
| the record surfaces: tasks and timeline | 48 s | **timeout 124 s** | 26 s |
| A11Y-09: the filters and the assign flow | 37 s | **timeout 125 s** | 51 s |
| keyboard: sign-in is fully operable | 25 s | **timeout 123 s** | 10 s |

Run 2 failed four legs and burned five workers (w0→w4); run 3 ran the same
file **10/10 green on ONE worker in about four minutes**. The spread is not
in the assertions — every run-2 failure was inside provisioning, not a
product check.

**7E's own new leg carries `test.setTimeout(300_000)` for exactly this
reason.** The rest of the file is left alone deliberately: raising timeouts
across legs 7E did not touch would be an unruled change to the gate's own
budget, and the honest options (a per-file budget like `documents.spec`'s
420 s, or `workers: 1` for this spec) are **7D's call at its plan gate**, not
a Tier-3 pass's.

### F-b · the invite → create-account provisioning path hangs intermittently

Twice, in two different specs, on the same shape:

- **run 1**, `people.spec` `provisionMember` — hung 421 s at
  `waitForURL('**/accept/**')`; the retained snapshot shows the founder still
  on *"Hand them this link"*.
- **run 2**, `documents.spec` `provisionMember` — hung 425 s at
  `page.fill('input[name="name"]')` after clicking
  `a[href*="/create-account?invite="]`.

Both passed on re-run, so each is an **UNREPRODUCED TRANSIENT and is not
claimed as diagnosed** (traps §1). But it is the same helper shape failing in
two files, and a complete gate runs every leg once with `retries=0` — so 7D
should expect it and classify from the trace rather than re-run to green.

**Related, and 7E's own doing:** R6/F-7 requires the documents list to be read
from a member's context, so `documents list` — the FIRST leg in its file —
now provisions Dan, a cost DOC-02 used to carry. The fix needs it; the
placement is worth knowing when reading that leg's duration (136 s green in
run 3).
