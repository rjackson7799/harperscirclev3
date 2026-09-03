# 8C · OW-05, the leg-integrity quota for slice 8's close-out

**OW-05 is recurring, not one-time**: eight legs per close-out, each read
**title and coverage citation against its ACTUAL assertions**, with findings
recorded *whether or not they move a verdict*. Explicitly not a scanner
(ADR-0027 D17 item 5; `docs/process/slice.md` §1).

This is **slice 8's instance, and it covers all three increments** — the
slice-8 plan's *"### 8C"* unit 3. The arithmetic of that coverage is worth
stating rather than implying:

| Increment | e2e legs it added | Audited here |
|---|---|---|
| **8A** (claim DB, M1–M2) | **none** — a migrations-and-pgTAP increment, whose evidence is 070's forty assertions and concurrency case 55 | n/a, and that zero is a fact rather than an omission |
| **8B** (search) | 6, all in `e2e/search.spec.ts` | 6 |
| **8C** (claim's surface, the log's cursor) | 2 — one in `e2e/record.spec.ts`, one in `e2e/people.spec.ts` | 2 |

Eight legs, the quota exactly. **The 8C pair is audited by the increment
that wrote them**, which is deliberate: 7E's audit records that *"an
increment that rewrites legs and then audits other legs has audited nothing
about itself."*

Legs are cited **by title** (traps §5). Every assertion below was read at
the 8C head, not from memory. Findings are numbered F1… and each says
whether it moves a verdict.

---

## 1. `search.spec` — "search leak: at summary a body-only term renders the SAME shape as a term present nowhere; a title term finds the document with a snippet cut from title + summary (SRCH-03, AC-DOC-4)"

- **Cell:** SRCH-03, `green` at 8B.
- **What it asserts.** A positive control FIRST — the coordinator finds
  `metoprolol`, so the summary member's emptiness is the filter and not an
  absence. Then `shapeOf()` renders `main`'s `innerHTML` with the search term
  itself neutralised to `TERM`, and asserts the body-only term and a term
  present nowhere produce **byte-identical markup**. That is a genuine
  same-shape assertion, not a pair of negative greps. An OCR-only term joins
  the same equality. The title term then matches through `tsv_summary`, the
  `<mark>` reads `discharge`, and the snippet contains neither `metoprolol`
  nor `warfarin`.
- **F1 — OBSERVATION, does not move the verdict.** The clause *"a snippet cut
  from **title + summary**"* is proven only on its **title** half. `discharge`
  is in the document's title, so a snippet cut from the title ALONE satisfies
  every assertion here; nothing requires a word that exists only in the
  summary to appear. The discriminating half — that the snippet is not cut
  from the **body** — is proven, with body words present to leak, and that is
  SRCH-03's substance. A term unique to the summary would close the clause
  structurally; not planned here, named for the next search increment.

## 2. `search.spec` — "search at view: the body snippet marks the term as <mark> structure and the OCR text is findable at weight D, never above a title (SRCH-05)"

- **Cell:** SRCH-05, `green` at 8B.
- **What it asserts.** Exactly one `<mark>` whose text is the term; the
  snippet's `innerHTML` carries neither `<b>` nor an escaped `&lt;b&gt;`, so
  the default `ts_headline` markup cannot have survived as either markup or
  text; the snippet contains real body text (`metoprolol 25mg daily`), so the
  structure claim is made over a snippet that actually came from the body.
  For `warfarin`: two links, and the **order** is asserted — the title-weight
  document first, the OCR one second.
- **F2 — OBSERVATION, does not move the verdict.** *"findable at weight D"*
  borrows a storage-layer word for a behaviour a browser cannot see: what is
  asserted is *findable, and ranked below a title*, which is the observable
  consequence and the right one for this layer. Weight D itself is pinned
  where it is decidable (the `tsv` construction and `tests/hc/search.test.ts`).
  The title would be more honest as *"findable, never above a title"*.

## 3. `search.spec` — "search for the caregiver: her assigned task and nothing else — the field renders outside the nav's courtesy (SRCH-03, AC-TASK-5)"

- **Cell:** SRCH-03, `green` at 8B.
- **What it asserts.** Both halves of the title, each discriminating. The
  nav's Documents link is absent (count 0) AND the search field is visible on
  the same screen — so *"outside the nav's courtesy"* is a contrast, not an
  assertion about one element. Then: exactly ONE task row, its href her own
  assigned task, the other open task's href absent, and the documents and
  timeline sections absent by count. A health term returns the empty copy
  with no `.record-list`.
- **No finding.** Title and assertions agree; the counts are over the
  rendered tree, and the negatives name specific hrefs rather than words.

## 4. `search.spec` — "search after a share: the one named document widens, never the task derived from it nor the sibling (SRCH-03, AC-PERM-6)"

- **Cell:** SRCH-03, `green` at 8B.
- **What it asserts.** Three states, which is what makes it evidence: BEFORE
  the share the document is absent from her results; AFTER, exactly one
  document row, and it resolves (`GET` 200 from her own context); after the
  share is revoked her next look loses it again. The two negatives are the
  ones AC-PERM-6 is about — the task DERIVED from the document, and the
  SIBLING document — asserted by href, not by word.
- **No finding.** This is the strongest leg of the six: the revocation half
  means a leak that persisted after revoke would fail it, and the resolve
  check means the widened link is real rather than rendered.

## 5. `search.spec` — "search copy and bounds: the four §4.7.3 strings verbatim; an over-cap term is refused with the empty copy, never an error; no total, no autocomplete, no suggestion list (SRCH-04, SRCH-06)"

- **Cell:** SRCH-04 and SRCH-06, `green` at 8B.
- **What it asserts.** The one-subject placeholder verbatim; the hint
  verbatim; the empty copy verbatim, twice. An over-cap term (201 chars):
  status **200** and the same empty copy — refused as a search, never as an
  error. The absences over the rendered tree: no `[autocomplete]`, no
  `datalist`/`listbox`/`combobox`/`aria-autocomplete`; no `N results`, no
  `showing`; `main`'s children are exactly `{header, section}`. Every result
  link resolves 200.
- **F3 — FINDING (MINOR). The title says FOUR §4.7.3 strings; the leg asserts
  THREE.** PRD §4.7.3 names four: the one-subject placeholder, **the
  two-subject placeholder `Search the record`**, the empty result, and the
  first-open hint. The two-subject placeholder is never exercised in the
  browser — the search fixture's circle has one subject, so the branch is
  unreachable from this leg.
- **Does it move SRCH-04's verdict? No.** The fourth string has real
  evidence at the unit layer, in four places
  (`tests/design/search-field.test.tsx` — *"two subjects: `Search the
  record`"*, plus the read-fails and older-shape cases — and
  `tests/hc/search.test.ts`'s `placeholderFor`). SRCH-04's layer cell is
  `app + e2e` and the app half carries it. **What is wrong is the TITLE**: a
  reviewer grepping *"four strings verbatim"* would credit the browser leg
  with evidence it does not hold. That is exactly the class round 18 found
  and this quota exists to catch. Recommended: the title reads *"three of the
  four §4.7.3 strings verbatim (the two-subject placeholder at the unit
  layer)"*, or the fixture gains a second subject. **Not changed here** — 8B
  is merged and this is a settled increment's leg; it is a finding for round
  30 to disposition, not a build-session edit.

## 6. `search.spec` — "A11Y-12: the search field labelled and keyboard-reachable, results as headed groups, emphasis as <mark> not colour alone, at 390px"

- **Cell:** A11Y-12, `green` at 8B.
- **What it asserts.** Tab from the page top reaches `name="q"` within eight
  stops, with the accessible name read through `getByRole('searchbox', { name:
  'Search' })` — so the name comes from the bound label and not the
  placeholder — and Enter submits. Every `section[aria-labelledby]` has a
  visible `h2` with the matching id. The `<mark>`'s **computed** font weight
  ≥ 600 and its decoration contains `underline`, which is the "not colour
  alone" claim made structurally rather than asserted in prose. axe clean at
  390 px, the 44 px floor on the field and every result link, no horizontal
  scroll.
- **No finding.** The one thing to keep visible is that axe runs with a
  NAMED exemption (`CONTRAST_EXEMPT` = `.section-label`, `.micro-meta`); the
  coverage cell says so, so it is a declared narrowing and not a silent one.

## 7. `record.spec` — "claim: a view-level member takes an unassigned task from her own screen, and no control is offered where the function would refuse (TSK-05, AC-TASK-1/2)" — **8C**

- **Cell:** TSK-05, app and e2e halves, flipped at this close-out.
- **What it asserts.** From Dan's own context: the control present on the
  `Unassigned` filter for an unassigned task and ABSENT for one he already
  holds; the claim pressed through the real button; `It's yours now.`; the
  holder now Dan; the control gone from the page that offered it; the task on
  his `Mine` list. Then, read from the DATABASE rather than inferred from the
  screen, zero shares and zero instruction rows for that task. Then the
  caregiver: no claim form anywhere on her Unassigned list, and a hand-built
  `POST` to the route refused (`e=claim`) with the holder unmoved. Finally
  the family's log carries *took an unassigned task* naming Dan.
- **F4 — OBSERVATION, does not move the verdict.** *"a view-level member"* is
  established BY FIXTURE (a grant `update` to `view`) and never asserted in
  the leg. It fails closed — at `summary` the control does not render and the
  leg reds on its first assertion — but it does not by itself distinguish
  `view` from `manage`. That discrimination is proven live and explicitly, in
  `tests/hc/tasks.test.ts` — *"can_view carries the definer's OWN floor onto
  the row, and it is not can_manage"*, which asserts `can_view` true and
  `can_manage` false on the same row before claiming. **The pair is the
  evidence**, and TSK-05's cell says so.
- **F5 — OBSERVATION, does not move the verdict.** *"no control is offered
  where the function would refuse"* is proven in the browser for two refusal
  shapes of five — already hers, and the care-circle ceiling. Done, cancelled
  and instruction rows are proven over the RENDERED TREE at the unit layer
  (`tests/routes/task-claim.test.ts`, a case each) and against the live
  definer (`tests/hc/tasks.test.ts`, the instruction row and the summary
  member each asserted as an AGREEMENT between `mayClaim` and the definer's
  own verdict). Driving all five through a browser would cost four more
  provisions for no new information; recorded as the deliberate split it is.

## 8. `people.spec` — "the access log reaches every entry: the cursor walks past 300 rows to the custodianship declaration, and each page prints itself (LOG-04, AC-PPL-5)" — **8C**

- **Cell:** LOG-04, flipped at this close-out; LOG-01's app half amended to
  point here.
- **What it asserts.** 320 circle-level entries seeded through `hc.log`
  itself, so seq and the hash chain are the product's own. Arrived at by
  CLICKING from People & roles, not by `goto`. The page does not claim to be
  everything; what it says about itself carries no digit (§7.4). Then the
  walk: press *Older entries* until there is none, refusing to revisit a URL
  already seen, requiring every page to carry entries, and asserting the walk
  terminates inside twenty pages. The last page's last entry names the
  custodian, and the disclosure says this is the beginning. Then back to the
  most recent by the link that says so, with `before=` gone from the URL.
- **F6 — DEFECT FOUND BY THIS PASS, FIXED PRE-GATE (`2f2c509`), not filed.**
  The title says *"each page prints itself"*; the print check ran only on the
  page the walk lands on. A print assertion made once at the end of a walk is
  not that claim. It is now a `printsItself()` helper run on the FIRST page
  and again on the last, with its control intact — entries and disclosure
  asserted visible on screen BEFORE print is emulated, because `isVisible()`
  answers false for a non-existent element as readily as a hidden one
  (R6/F-10). Fixed rather than filed because the leg had not shipped.
- **F7 — OBSERVATION, does not move the verdict.** *"reaches every entry"* is
  proven in the browser as REACHABILITY (the walk terminates, never revisits,
  every page carries rows, seq 1's row is on the last page). It is not proven
  there as EXHAUSTIVENESS. That half is the unit leg's, and it is asserted as
  set equality: `tests/hc/people.test.ts` — *"the WALK and the policy agree
  exactly: paging adds nothing and subtracts nothing"* — walks the circle in
  pages of 100 and asserts the ordered result EQUALS the single 500-row read
  with no duplicates, then walks it again as the caregiver and asserts her
  result is a strict subset still carrying no health `grant_changed` entry.
  **The pair is the evidence and neither half alone discharges LOG-04.**

---

## Tally

**Eight legs audited. Seven findings recorded: one MINOR (F3), one defect
found and fixed pre-gate (F6), five observations (F1, F2, F4, F5, F7). No
verdict moves.**

**F3 is the one a reviewer should weigh**, because it is a title that credits
a leg with evidence it does not hold — the round-18 class. It is left for
round 30 to disposition rather than edited here: `e2e/search.spec.ts` is a
merged increment's file, and a build session quietly rewriting a shipped
leg's title is how an audit trail stops being one.

**The backlog.** OW-05's row records 19 of 38 legs covered before this pass,
with 7E's own eight recorded separately for the same reason this record notes
its 8C pair. Slice 8's eight are these; the row's arithmetic is updated at the
close-out, not here.
