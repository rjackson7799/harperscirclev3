# Slice 8 — the dispositions for rounds 28, 29 and 30, at one close-out

**The table ADR-0043 binds to.** Twenty-one pointed questions, each quoted as
it was put, each with a verdict. Rounds 28 (8A, Tier 1), 29 (8B, Tier 2) and
30 (8C, Tier 2) were none of them held; slice 8 merged on its packets. This is
the close-out that stamps them.

**Who ruled, so it is not inferred later.** Every verdict below was reached by
**the close-out session** (Claude Opus 5, 2026-09-03) on the owner's standing
instruction in `docs/review/slice-8-closeout-kickoff.md` — *"Every ADR carries
its own recommended answer; accepting a recommendation is a ruling and is
recorded as one."* **The owner ratifies by merging the PR that carries this
file**, and until that merge nothing here is settled. Three verdicts DEPART
from the ADR's own recommended answer and are marked **⚠ DEPARTS** so the
owner reads them before the rest: **28/Q-A**, **30/Q-F**, **30/Q-G**.

Verdict vocabulary is the skill's: `FIXED` · `OWED` · `OWNER` ·
`ACCEPTED-NOTE` · `DECLINED` · `NOTED`. Compound verdicts are legal.

---

## Round 28 — ADR-0040, slice 8A (claim + the level-bound step-up). Tier 1.

| # | The question, as put | Verdict | The ruling |
|---|---|---|---|
| **28/Q-A** ⚠ DEPARTS | *"the freeze unnamed on a claim — one shape through `visible_at` (D2)"*. Recommended: *"ACCEPT as ruled; 8C's surface says the freeze from `hc.circle_people`'s `frozen`, not from the refusal."* | **ACCEPTED-NOTE · with the mechanism OWED (OW-27 / FRZ-17)** | The **refusal STRING is accepted as ruled**: collapsing eleven refusals to one `claim_refused` keeps the refusal from being an oracle for the circle's state, and 070:32–35 proves a member at `view`, a member at `manage` and a stranger meet one string under a freeze, the very same call landing once it lifts. **The recommendation's second clause is WITHDRAWN** — 8C established (ADR-0042 D2) that `hc.circle_people` carries no `frozen` column and that a freeze is `visible_at` rung 2, so the task never reaches a page and there is nothing for a surface to say. **And the MECHANISM is not accepted.** Routing the freeze through rung 2 *alone* is exactly what leaves `claim_task` reachable under the FRZ-13 carve-out (30/Q-F): its three siblings — `assign_task` (`20260829120001`), `complete_task` and `snooze_task` (`20260829120002`) — each carry an explicit `state in ('open','unresolved')` test against `public.freezes` that never consults `grant_vectors`, and `claim_task` carries none. The string stands; the missing guard is carried by **FRZ-17** and **OW-27** |
| **28/Q-B** | *"*hers already* refuses rather than no-ops (D4)"*. Recommended: *"ACCEPT — a claim is a transition from nobody's."* | **ACCEPTED** (as recommended) | `set_grant` and `assign_task` absorb a same-state call silently because a §5.7 race can produce one; no analogous race reaches `claim_task`, which takes one argument and names nobody. A claim is a transition **from unowned**, and 070:13–14 pins hers-already refused with moving held work left to `unassign` + `assign` at `manage`. 8C offers the control only on an unassigned task (ADR-0042 D2), so the case is a hand-built request and refusing it is right |
| **28/Q-C** | *"a caregiver claims a task shared to her BY NAME, because the share already gives `view` (D1)"*. Recommended: *"ACCEPT — it is the plan's rule applied, not an extension."* | **ACCEPTED** (as recommended) | Rung 5 widens one named object to `view`, and `view` claims. Three things make this not a widening: she could already read the task, the share was a coordinator's explicit act, and the claim mints no second share — asserted as SET EQUALITY at 070:23–24, where the existing share stays the only row with `created_by_assignment_of` null. Nor does ownership buy her reach: `complete_task`'s holder bar is `summary`, which her `view` already cleared |
| **28/Q-D** | *"the binding REPLACED: the three-part token refused outright, no compatibility arm (D5)"*. Recommended: *"ACCEPT — nothing is production-activated, so no in-flight token exists."* | **ACCEPTED** (as recommended) | A compatibility arm accepting `member:subject:domain` would be precisely round 27's R3 dissent 1 — *"a crafted link that raises the level a coordinator THINKS she confirmed"* — preserved as a fallback. 071:9 pins the pre-8A shape raising nothing and 071:4–6 pin the mismatched token refused **and left unconsumed**, so the confirmation she gave is still hers to spend on what she confirmed. No in-flight token can exist: a live deployment would need the mint site shipped in the same release as the migration, and G4/G7 block |
| **28/Q-E** | *"the case-55 commit's tally measured at M1, the head's re-run the record (D8)"*. Recommended: *"ACCEPT the head's runs as the record; the commit's tally is true of the tree it ran against."* | **ACCEPTED** (as recommended) · **ACCEPTED-NOTE** | The record is the head's two runs at `4d166c0` — 83/83 on the clean leg and 83/83 on the upgraded database. The case-55 commit's 83/83 was measured on the **M1-only** database because cases 29 and 31 mint `raise_grant` targets that M2 changes; it is true of the tree it ran against and stays on the record with that tree named. Both numbers keep their trees; neither is retracted |
| **28/Q-F** | *"STP-03's app half — built and driven, recorded not flipped (D6, D9.2)"*. Recommended: *"rule the app half green on the leg inside the complete run — or say what more it needs."* | **ACCEPTED** (as recommended) — **the app half is FLIPPED** | The evidence exists at a declared, merged head and is named: `tests/routes/member-detail.test.ts` 28/28 (the two positive pins that went red, the four negatives), `tests/hc/people.test.ts` live 16/16, and the PPL-02 leg driving a raise through the mint site inside the **complete 58/58 gate run at `4d166c0`**. That is the same standard every other app half in this file was flipped on. **No status word moves** — STP-03 is already `green` on its pgTAP half — so nothing turns green because a question was ruled; what changes is that the `app` half of its declared `pgTAP + app` layer is now CLAIMED rather than merely recorded, which is the honest state for a row that was green with half its layer unclaimed. Cell AMENDED WITH A MARKER |
| **28/Q-G** | *"`task_claimed` renders generically until 8C words it (D9.1)"*. Recommended: *"ACCEPT — the entry is complete in the database; the wording is the surface's."* | **ACCEPTED** (as recommended) · **DISCHARGED at 8C** | Right when written and now moot. The entry was always complete in the database — actor, target, object, subject (070:8–9) — and the wording was the surface's to find. 8C found it (ADR-0042 D5): *"**Marisol** took an unassigned task in Nell's record"*, the claimant named ONCE, against the generic renderer's `Marisol · task claimed · Marisol` which told the reader neither that she took it nor that it was handed to her. TSK-05's app and e2e halves are green at `2f2c509` |

## Round 29 — ADR-0041, slice 8B (Search, the surface). Tier 2.

| # | The question, as put | Verdict | The ruling |
|---|---|---|---|
| **29/Q-A** | *"The select list carries the row's title beside §7.2's five columns."* Recommended: *"ACCEPT as the second named departure, recorded in the same one-line erratum at sign-off."* | **ACCEPTED** (as recommended) · **FIXED** (the erratum lands here) | A result needs link text, and the title discloses nothing the snippet does not: it is weight A of `tsv_summary`, so it is inside the text the vector was built from at **every** level — a `summary` caller matching on a title is already reading that title. The plan's words were *"nothing else changed"*, which is why it was named rather than absorbed. **The TSD §7.2 erratum lands in this close-out**, naming both departures in one line |
| **29/Q-B** | *"The hint is always under the field, not revealed on first focus."* Recommended: *"ACCEPT; a focus-only reveal is client behaviour §7.4 refuses."* | **ACCEPTED** (as recommended) | §7.4 admits no client behaviour on this surface, and the alternatives are a script or a `:focus-within` trick that hides a description from the paint until it is needed. The always-visible line is also the better accessibility answer: an `aria-describedby` target that is painted is one a screen-reader user and a sighted user meet at the same moment. PRD §4.7.3's *"first-open hint under the field"* is honestly read as *under the field* |
| **29/Q-C** | *"The page echoes the term in its context line."* Recommended: *"ACCEPT — text, escaped, never composed; strike it if the round reads it as a composition."* | **ACCEPTED** (as recommended) | Not a composition. *Results for "q"* restates what the person typed, in one place, as React-escaped TEXT — proven with `<img src=x onerror=1>` — and `tests/lint/search-surface-fence.test.ts` pins `dangerouslySetInnerHTML` absent from the three surface files **and** pins the product tree's set of such sites as an EXACT SET. §4.7.3's absences are about the *results* (no total, no count of withheld, no prose answer); echoing the query composes nothing across them |
| **29/Q-D** | *"The share leg fixtures the `object_shares` row."* Recommended: *"ACCEPT with DOC-04's leg as the screen's proof; or OWE a screen-driven variant."* | **ACCEPTED** (as recommended) · **no ledger row** | Two different assertions, each with its own leg. DOC-04's leg proves the share **screen mints the row**; this leg proves **search honours a row that exists**, and driving the screen again inside `search.spec` would re-prove DOC-04 at the cost of gate minutes on a host that finished at 0.76 GiB free. No owed row: nothing is left owing, and an item here would be a wish |
| **29/Q-E** | *"STX/ETX as sentinels: 'cannot occur in document text' is a property of the writers … plus the module's strip-on-stray, not a database constraint."* Recommended: *"ACCEPT; a `check` refusing C0 controls in the text columns would be DDL."* | **ACCEPTED** (as recommended) · **ACCEPTED-NOTE** on the wording | Accepted, and the defence is worth stating precisely because the ADR's own phrasing invites the weaker reading: **the surface does not rest on C0 controls being absent.** It rests on `splitHeadline`, which degrades an unbalanced sentinel to plain text and drops a stray one, so a document that somehow carried STX renders as text rather than as structure. The writer property is defence in depth, not the invariant. A `check` constraint would be DDL and would buy nothing the module does not already guarantee |
| **29/Q-F** | *"The rank tie-break: §7.2 orders documents by rank alone (kept verbatim); tasks and events add `, id`."* Recommended: *"ACCEPT."* | **ACCEPTED** (as recommended) · **NOTED** | Keeping §7.2 byte-verbatim in FROM / WHERE / ORDER / LIMIT is worth more than symmetry — it is what makes the departures nameable at all. Tasks and events have no spec text to keep, so a deterministic order is free there. **Noted for the day search gains paging:** documents ordered by rank alone can swap tied rows between renders, which is invisible at `limit 20` with no pager and no count, and would not be the moment paging arrives. No row — no paging is planned |
| **29/Q-G** | *"The 250 ms PAGE tripwire flickered once per prf06 run on a different page leg each time … every search scan leg passing both times."* Recommended: *"NOTE it as round 8's cold-or-contended pattern, no row and no ledger item — or OWE a quiet-host cold+warm pass."* | **NOTED** (as recommended) · **no row, no ledger item** | Round 8 saw the same leg at 243 ms warm and 280–329 ms cold and ruled the excursions inside PRD §13.2's 1.5 s page budget on a cold or contended host. These are that: a **different** leg each run (`page_timeline`/mx 571 → 197 ms; `page_docs`/mx 52 → 270 ms), every other page leg at 10–102 ms p95, and run 1 overlapped a typecheck on the same 8 GB host. No DDL moved since 8A, the page legs are 1D's `visible_at` over rows the caller cannot see, and a search index would not touch them — so they are **not M4's condition**, and M4 closes UNCONSUMED on the search legs, which passed their bounds in both runs |

## Round 30 — ADR-0042, slice 8C (claim's surface, the log's cursor). Tier 2.

| # | The question, as put | Verdict | The ruling |
|---|---|---|---|
| **30/Q-A** | *"ADR-0040 D2's aside … is **not built, and D2's premise is corrected**."* Recommended: *"ACCEPT the correction and let ADR-0040's Q-A be ruled with it in view; no second read to say an unsayable word."* | **ACCEPTED** (as recommended) — ruled **with 28/Q-A**, one subject in two ADRs | The correction is right on both counts and is adopted: `hc.circle_people` emits a NULL `levels` map, not a `frozen` boolean, and a null is also *"not yours to know"*; and a freeze is `visible_at` rung 2, so under one `tasks_select` returns nothing and there is no page on which to name it. The freeze is **honoured and unsayable**, not skipped. Adding a second read to say a word that cannot be said would have been the wrong fix. See **28/Q-A** for what this does *not* excuse — the missing explicit guard in the definer |
| **30/Q-B** | *"The list control is on the `Unassigned` filter ONLY, and both surfaces land on the task detail rather than returning to the list."* Recommended: *"ACCEPT — a `?from=` return parameter is a redirect surface for a convenience."* | **ACCEPTED** (as recommended) | The `Unassigned` filter is the shelf of work nobody has taken, so taking work is what it is for; `Mine`, `Overdue` and `All` send a person to the row's own page. `mayClaim` still decides per row **inside** the filter, so the filter is a shelf and not a permission. Landing on the task is where *"it became hers"* is legible, and a `?from=` parameter would add a redirect surface — `safeNext` territory — for a convenience |
| **30/Q-C** | *"No 'Newer entries' link; the page offers 'The most recent entries' from any depth and relies on Back."* Recommended: *"ACCEPT — or OWE a bidirectional cursor if the round wants paging independent of browser history."* | **ACCEPTED** (as recommended) · **no ledger row** | A backward cursor needs `seq > n` read ascending and reversed — a **second ordering to keep honest**, and the first one is what makes the walk trustworthy (D7's three properties). It would duplicate what Back already does exactly. Nobody is stranded: the way home is offered from any depth, and *"Everything done with the record"* survives only on a single page with nothing behind it |
| **30/Q-D** | *"The claim's browser leg raises Dan to `view` BY FIXTURE and does not assert the level; the `view`-vs-`manage` discrimination is proven live in `tests/hc/tasks.test.ts`."* Recommended: *"ACCEPT as the declared pair (leg audit F4)."* | **ACCEPTED** (as recommended) | The pair is the evidence and each half does what its layer can. The live unit leg asserts the discrimination that matters — `can_view` **true** with `can_manage` **false** on the same row, then the claim lands — which is the whole point of where 8A put the floor. The browser leg's job is different: that the control renders for a real session and the POST lands. Already declared in TSK-05's cell |
| **30/Q-E** | *"'No control where the function would refuse' is proven in the browser for two refusal shapes of five; the other three are proven over the rendered tree and against the live definer."* Recommended: *"ACCEPT (F5) — four more browser provisions buy no new information."* | **ACCEPTED** (as recommended) | `mayClaim` is exported and driven three ways — as a table, over the rendered tree, and live against the definer's own verdict as an **agreement in both directions**. The third is the one that matters, because the risk `mayClaim` carries is disagreeing with `claim_task`, not failing to render. Three more browser provisions would re-prove the predicate through a slower instrument, on a host that finished the gate at 0.76 GiB free |
| **30/Q-F** ⚠ DEPARTS | *"`hc.claim_task` admits at `visible_at >= 'view'` … **A carve-out coordinator can therefore TAKE A TASK while the circle is under an unresolved freeze** … Recommended: rule whether the carve-out is read-only by intent."* | **OWED — FRZ-17 (coverage, never green) + OW-27 (`OPEN`)** | **The carve-out is READ-ONLY BY INTENT, and `claim_task` writing through it is a defect, not an allowance.** See the analysis below — this row is the summary. Three independent sources settle intent, and a fourth narrowing is this session's: the exposure is **one function, not a family**. No DDL here; the fix is a migration in a NAMED M-slot of slice 9's bound. **Nothing turns green** |
| **30/Q-G** ⚠ DEPARTS (in method) | *"Leg-audit F3 (the *'four §4.7.3 strings'* title) is left for this round rather than edited in a merged increment's file."* Recommended: *"ACCEPT that placement and disposition the title here."* | **ACCEPTED** (placement) · **FIXED — the narrowing is ruled INTO THE CELL; the title is NOT edited** | The placement is right and the audit was right to leave it. Of the kickoff's two alternatives — *"Fix the title, or rule the narrowing into the cell — not both"* — **the cell is taken**, and the departure is that the title is left standing rather than corrected. Why: editing `e2e/search.spec.ts` is a code change in a docs-only session that re-runs no gate, and `AUDIT_MANIFEST` cites the leg BY TITLE (traps §5), so the edit is two files plus a twenty-minute gate to have a run behind the new citation. `docs/coverage.md` is authoritative **per assertion**, so the narrowing recorded there is the one a reviewer is bound by, and it is the half this session can actually make true. **SRCH-04's cell is AMENDED WITH A MARKER**: the browser leg renders THREE of §4.7.3's four strings; the two-subject placeholder `Search the record` is unreachable from this leg (the fixture's circle has one subject) and is proven at the unit layer in four places. ADR-0006-legal as an applied artifact plus named tests. **No ledger row** — the assertion is fully covered, so an owed item would be a wish whose only acceptance condition is *"if anyone edits this file"*. The correction the audit recommends is recorded for the next increment that touches the spec |

---

## 30/Q-F in full — the one ruling that opens a row

**Verified from the source this session, not taken from the ADR.**

**1. The carve-out reaches `claim_task`, exactly as ADR-0042 says.**
`hc.grant_vectors` (`20260815230009`) emits, for a coordinator who is **not**
the named objected-to member while a freeze is `unresolved`: `frozen = false`
(via `unres_closed`), `cap = 'view'` (via `unres_carved`). `hc.visible_at`
returns `least(<clauses 1–6>, coalesce(cap, 'manage'))`, so she resolves to at
most `view`. `hc.claim_task` admits at `>= 'view'` (`20260903120001`) and has
no other freeze test. She can take a task while the circle is frozen.

**2. The carve-out is read-only BY INTENT.** Three independent sources, none
of them an inference:

- The migration's own header, line 4: *"The unresolved **read-only** carve-out"*.
- FRZ-13's coverage row, its opening words: *"Unresolved **read-only**
  carve-out"*.
- Structural, and decisive: `cap` is applied as `least()` — it can only lower —
  and the three sibling task-write definers each carry an **explicit** freeze
  test that never consults `grant_vectors` and so cannot be lowered by a cap:
  `assign_task` (`20260829120001`, *"no new grants under any freeze"*),
  `complete_task` and `snooze_task` (`20260829120002`), all three
  `exists (select 1 from public.freezes f where f.circle_id = … and f.state in
  ('open','unresolved'))` → `freeze_active`. The intent that **no write
  happens under any freeze** is written out three times.

**3. The exposure is ONE function, not a family — this narrowing is new.**
ADR-0042 flags as *"adjacent and NOT verified by this session"* that
*"`complete_task`'s holder bar is `summary`, which a `view` cap also clears."*
**It does not clear it, because it is never reached**: `complete_task` raises
`freeze_active` *before* it calls `hc.may_act_on_task`. Same for
`snooze_task` and `assign_task`. `hc.claim_task` is the **only** task-family
write definer the carve-out reaches, and it is reachable precisely because
ADR-0040 D2 routed its freeze through `visible_at` rung 2 alone (**28/Q-A**).
The two questions are one defect seen twice.

**4. What is NOT proven, and why no test caught it.** `070_task_claim.sql`
opens its freeze with `insert into public.freezes (circle_id) values (…)` —
`state` defaults to `'open'` (`20260815200005`:20). Every one of 070:32–35 is
an **open** freeze. The `unresolved` carve-out path is exercised nowhere for
`claim_task`. TSK-05's cell says *"a FROZEN circle … refused in ONE shape"*
unqualified; **it is amended with a marker narrowing that to an OPEN freeze**,
and stays green on the pgTAP evidence it actually has.

**5. What bounds it today** — stated so the row is not read as larger than it
is. Nothing is production-activated (G4/G7 block). The actor must already be a
coordinator of the circle and not the objected-to member. The write is confined
to the three assignment columns plus one `task_claimed` entry — ADR-0040 D4,
with no share and no instruction row by any path, asserted as SET EQUALITY
(070:10–11, 23–24, 36–38) — and it is reversible by `unassign_task`. **It is
bounded by no test**, which is what FRZ-17 carries.

**6. The disposition.** A fix is DDL and this session ships none.

- **`docs/coverage.md` § 8 — FRZ-17, `pending`, never green** until the guard
  lands, carrying the exposure.
- **`docs/owed.md` — OW-27, `OPEN`** (the ledger goes 0 → **1 of 25**), whose
  acceptance condition names the artifact and its proof: `hc.claim_task` gains
  the same explicit `state in ('open','unresolved')` test its three siblings
  carry, and a pgTAP case pins a carve-out coordinator refused under an
  `unresolved` freeze while her READ through the carve-out still works.
- **A NAMED M-slot in slice 9's migration bound**, set at slice 9's plan gate —
  this session cannot set another slice's bound, and the row is what makes the
  plan gate read it.

Not `RISK(row)`: an accepted risk is one nothing turns green, and this one is
meant to be fixed.

---

## The dissent this close-out files

**Not a finding — a recommendation to the owner, filed where it cannot be
lost.** Ruling a **Tier 1** increment from its own author's recommended answers
is not the deep review the tier exists to require. The charter sets review
depth by what a defect costs in production — *a migration and a backfill* — and
8A shipped two migrations, one of them the step-up token binding, which is
auth and provenance.

**This session is the evidence.** One sitting of reading 8A's SQL produced
**FRZ-17**, a real defect in M1 that three build sessions and two packet passes
did not name, and corrected ADR-0042's own adjacent-risk note in the safe
direction. A finding rate above zero in the first hour is a poor argument for
stopping.

**Recommended:** slice 9 opens with a commissioned adversarial pass over 8A's
**M1 and M2**, before its own build. **M2 especially** — the four-part step-up
binding replaced a shipped composition and nobody outside its author has looked
at it. FRZ-17 is the named entry point. This is the owner's call at slice 9's
plan gate, and the close-out does not block on it.
