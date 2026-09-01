# Round-27 dispositions — the 42 rows, each with its argument

**Companion to ADR-0038**, which holds only what a future session must obey.
This file holds the per-finding verdicts, the exact replacement text for every
coverage cell a verdict touches, and the ledger rows. It moves nothing: no
verdict, cell, ledger row or line of code has been edited in the commit that
lands this file (ADR-0033 D10's rule, applied again).

**Head:** `slice/7c-sensitive-pair` @ `7e28e32`, evidence head **`ccd854b`**,
base `origin/main` @ `18c362d`. PR **#34** open, `[DO NOT MERGE without owner
sign-off]`. Findings: `docs/review/round-27-findings.md` — **42 rows, 16 MAJOR
/ 21 MINOR / 5 OBS, 0 BLOCKER**, re-tallied here by command.

---

## 1 — How these 42 were dispositioned, and what was re-verified

The ADR-0033 D12 method, stated the same way: **not all 42 were re-verified at
predicate level**, and a disposition that claims more verification than it did
is the defect ADR-0023 D25 was written about.

**Re-verified independently at the site, against the blob at `ccd854b`
(`git show ccd854b:<path>` / `git grep … ccd854b`), never the working tree:**

| Row(s) | What was checked | Result |
|---|---|---|
| R4/F-1 | `git grep "opens in an upcoming update" ccd854b -- app components lib` | **CONFIRMS**, and finds a SECOND site the lens did not name: `app/(app)/[circle]/inbox/[arrival]/page.tsx:284` carries the comment *"nothing 'opens in an upcoming update' any more"* — the tree asserts the absence twice while the string renders at `timeline/[event]/page.tsx:137`. `git diff --stat 18c362d..ccd854b` on that file is empty |
| R2/F-2 | `git grep "document_audience_derived" ccd854b -- app lib components tests e2e` | **CONFIRMS** — zero callers |
| R3/F-6 | `RECORD_TREES` at `tests/lint/answer-budget.test.ts:23-27` | **CONFIRMS** — `tasks`, `timeline`, `documents`; no `people` |
| R4/F-3 | `lib/hc/people.ts:126` `Math.min(Math.max(limit,1),500)`; `people/log/page.tsx:110` `accessLog(claims, circle, 300)`; `:121-122` *"Everything done with the record … it prints exactly the entries below"* | **CONFIRMS** on all three |
| R1/F-3 | `MINTS_SIGNED_URL = /\bcreateSignedUrl\b/` (fence:67); `node -e` on the boundary → `false` against `createSignedUrls([k], 60)`; `createSignedUrls` at `@supabase/storage-js/src/packages/StorageFileApi.ts:785` | **CONFIRMS** — and that `STREAMS_STORAGE_BODY`/`PUBLIC_URL` ship no control (fence:102-119 shows controls for `CALLS_SERVICE_ROLE` only) |
| R3/F-1 | `hc.set_grant`'s no-op arm (`20260818120004:105-110`, `'changed', false`); the route's `budget.race(setGrant(…))` at `:78` and unconditional `?changed=1` at `:84` | **CONFIRMS** — the return value is discarded |
| R5/F-1 | `upload/token`: `boundedJsonText` `:40`, `withRouteBudget` `:56`. `upload/complete`: `:51` and `:74` | **CONFIRMS** — the read precedes the budget on both |
| R5/F-2 | `proxy.ts:30` `if (!url || !key) return response;` vs the stamp at `:67` | **CONFIRMS** |
| R2/F-1 | `documents/[document]/page.tsx` — four `catch` arms at `:169/:180/:195/:216`, each `→ loadFailed(next, false)`; `documentAudience` raced at `:212` inside the fourth | **CONFIRMS** |
| R6/F-1 | `e2e/people.spec.ts:461-465` — `ArrowDown`, then `expect(focusedValue.length).toBeGreaterThan(0)`; nothing read before the press | **CONFIRMS** |
| R6/F-2 | `e2e/documents.spec.ts:384-387` — `waitForURL(/\?moved=1/)`, `toContainText('written in the family')`, `toContainText('Financial')` | **CONFIRMS** |
| R6/F-3 | `e2e/people.spec.ts:285-286` — `main table` = 0, `main input[type="checkbox"]` = 0 | **CONFIRMS** |
| R6/F-4 | `e2e/people.spec.ts:281` — `toContainText('custodian')`, the label word | **CONFIRMS** |
| R6/F-5 | `git diff --stat 18c362d..ccd854b -- e2e/` touches three files, `a11y.spec.ts` NOT among them; the shell pass iterates `timeline`, `tasks`, `invite`, `/account` (`a11y.spec.ts:331-335`); `grep -c expectTouchTargets` = **0** in both new specs | **CONFIRMS**, both halves — including that the 7C surfaces are held to axe's 24×24 floor, not the project's 44 px |
| R6/F-6 | The five cited titles in `e2e/audit-manifest.ts:37,65,69,72,78` against `grep "^  test(" ` in both specs | **CONFIRMS** all five |
| R3/F-2, R3/F-3 | `people/[member]/page.tsx:198` `value={\`${next}?${raise}\`}`; step-up route `:35/:40/:47` `\`${next}?e=…\``; `raiseSubject` unvalidated at `:138` vs `raiseDomain`/`raiseLevel` at `:139-143` | **CONFIRMS** both |
| R2/F-7 | `tests/hc/documents.test.ts` — the ONLY `can_view`/`can_manage` assertions are `:229-230` (the coordinator, true/true) and `:247-248` (**Ruth**, a `summary` member by GRANT, false/false) | **CONFIRMS, and sharpens it.** The sibling pin does not discriminate: rung 5 lifts only the *share-holder*, and Ruth's document level is `summary` either way — so the one-token `'document'`-for-`'arrival'` edit leaves `:247-248` green. The narrowing Q-A is asked to ratify is pinned by nothing |

**Every one of those CONFIRMS.** No row below is accepted on a claim that failed
checking. Two findings were *sharpened* by the re-check (R4/F-1's second site,
R2/F-7's non-discriminating sibling) and one coverage row the findings doc lists
as untouched is in fact touched (**DOC-02** — §4 below).

**Taken on the lens's word** (argued, sited, internally consistent, not
re-derived here): every claim about a run — the r1–r5 gate narratives and
tallies, vitest/pgTAP/concurrency/gitleaks numbers, the retained r3/r4 traces;
R1's tree-wide absence greps (`getPublicUrl`, `next/image`, `'use server'`, the
Next file conventions) and its `18c362d..ccd854b` byte-identity diff of
`ReviewScreen.tsx`; R3's reading of `hc.consume_step_up`/`hc.mint_step_up`
internals and the pgTAP STP-01/02 pins; R4's reading of `hc.receipt_for`,
`hc.member_levels_frozen` and `access_log_select`; R5's seven-auth-submit grep
and the `hc.remove_member` keep-shares scoping; R6's leg arithmetic
(45 + 12 = 57) and its reading of the eight legs carrying no finding.

**Nothing was run.** No gate, no vitest, no pgTAP, no stack command, no dev
server. This leg is read-only by its own charter and stops at the gate.

---

## 2 — The verdicts

Vocabulary is the skill's: `FIXED` · `OWED` · `OWNER` · `ACCEPTED-NOTE` ·
`DECLINED` · `NOTED`, compound where compound is honest. **No row is proposed
`FIXED`** — not one fix has been written, and a pre-merge round proposes
verdicts, not completions (ADR-0033 D10). Accepted rows are `TAKEN` to a named
unit in the live slice, which is what keeps them off the `docs/owed.md` cap
(the ledger's own `TAKEN(slice/unit)` rule) while still giving each one the
blocking artifact ADR-0006 requires.

**The two homes**, split by the tiering rule and its split rule
(`CLAUDE.md`, `docs/process/slice.md` §1):

- **7E — Tier 3**, the slice's batched leg-and-scanner pass: test, leg,
  manifest and pin work only. `git revert` restores the prior product.
- **7D — Tier 1**, the product surfaces: authorization display, the step-up
  and grant path, the receipt claims, the accountability copy, the bounded
  ingress. **Fail closed** — any item whose tier must be argued sits here
  until the owner rules it down, on the record, before a line is written.

Both carry the unconditional browser gate (ADR-0033 D19.14). **7E runs first**,
so 7D's product fixes land under legs that can fail — see ADR-0038 §5.

### R1 — the byte-path fence and the machine-read path

| Finding | Sev | Verdict | Home | The argument |
|---|---|---|---|---|
| R1/F-1 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | The referent is clean — R1's own confirmations establish that by tree-wide grep, and we did not contradict them. What is wrong is the *guarantee*: `CALLS_SERVICE_ROLE` greps an identifier where D1's sentence claims a module's consumer set, and `lib/db/**` carries `no-restricted-imports: "off"`, so a two-line re-export returns the credential to the whole tree with all five assertions green. The repo's own containment script says this out loud (*"ESLint import rules are bypassable by re-export"*). ADR-0026 — *if it can be an exact-set assertion, it must be* — decides the remedy: pin the **importers** of `lib/db/service-role` and that module's **export names** to exact sets. Test-only, hence 7E |
| R1/F-2 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Same failure, second predicate: `fetchStorageWithin(`/`upstream.body` are two idioms of the one file being pinned, and `lib/storage/artifacts`'s byte-returning readers (`downloadObject`, `readStagedObject`, `readArtifactBytes`, `storageAuthHeaders`) are admitted to three route globs by design. A `app/api/upload/preview/route.ts` returning `o.bytes` passes all five assertions and has none of §1.3's six steps. That is *"a thumbnail route"* — the temptation the fence's own header names as its reason for existing. Remedy: enumerate the readers' importers to an exact set |
| R1/F-3 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified: `\b` between `l` and `s` is not a boundary, `createSignedUrls` exists in the installed client, and a signed URL minted through it survives revocation, caches, and leaves the family — the exact unrevocable read assertion 5 exists to forbid, while assertion 5 passes. Compounding it, one predicate of four ships controls; traps §9 requires them per predicate. `/\bcreateSignedUrls?\b/` plus a negative control per predicate |
| R1/F-4 | MINOR | **ACCEPTED IN PART · DECLINED IN PART · TAKEN(7D)** | 7D | **Accepted:** the sentence. *"No machine-read text is stored for this page."* asserts a storage fact the client cannot know, and the image half of the same route splits `renditionPageMissing` from `storageTimeout` at length precisely because *"this route does not guess."* Accepted too: on the text path, a storage answer that is not object-not-found becomes 503/504, matching the image half. **Declined:** differentiating the status on the **authorization** branches (the lens's own case (b), the revocation scenario) — that would be the oracle §1.3 forbids, and R1 says so itself. So: reword the sentence for every arm; split the status only where the fact is a storage fact. Pre-existing code, newly *claimed* by ADR-0037 D10 and newly shipped on a second surface — which is what makes it 7C's to answer. D10 amended (§4) |
| R1/F-5 | OBS | **ACCEPTED · TAKEN(7E)** | 7E | Filed as an observation and accepted as one line, because the tree is actively hostile here: `@next/next/no-img-element` makes `<Image>` the lint-blessed default, both permitted call sites carry suppressions, and `proxy.ts`'s matcher exempts `_next/image` from the new `no-store` stamp — so the *forbidden* form is what the linter recommends and it lands outside both cache-control layers. The per-surface pins are real; the tree-wide assertion is missing from the one file D1 credits with it |

### R2 — the Documents detail's three depths, the list, and the three writes

| Finding | Sev | Verdict | Home | The argument |
|---|---|---|---|---|
| R2/F-1 | MAJOR | **ACCEPTED · TAKEN(7D)** | 7D | The round's most serious product row. Plan C2 is BINDING and says *"refused **(and not offered)** unless the member holds manage on both domains"*; the page's only authorization input is `can_manage` over the document's **current** taint, so every other category is offered unconditionally, and the DB's named `audience_refused` lands in a catch-all that returns `loadFailed` — the whole detail page, shares list and share control gone, replaced by *"We couldn't load this document just now."* This is the r3 defect's mechanism at a second call site: D2's *"THE ROW DECIDES FIRST now"* was applied to the references read, not to the class. The remedy needs no DDL — `hc.circle_people` already returns the caller's own `levels` and `lib/hc/people#circlePeople` is already wired. Both halves accepted: filter `DOC_CATEGORIES` by the caller's manage on `categoryDomain(c)`, **and** give the audience read its own catch redirecting to the existing `?e=refused` marker, because a grant can move between render and click. **AC-DOC-6's refusal half has no app-layer evidence at any level** — the leg drives the founder, manage×5 — so DOC-03's cell changes (§4) |
| R2/F-2 | MAJOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified: `hc.document_audience_derived` has zero callers in `app lib components tests e2e`. ADR-0034 D7 ruled *"the preview and the entry NAME the derived objects whose holders change level"* and cited that function as the artifact; the entry does, the preview does not. The lens offers the alternative — rule D7's *"preview"* to have meant the DB preview only — and we **decline** it: D7 was closing a finding whose text was *"the recategorise path moves descendants the preview never named"*, and reading "preview" as the DB function makes the disposition close nothing. The sharp edge is *" No one gains or loses access."*, a positive assurance rendered whenever the document audience is empty while a task holder is about to lose her task. The function exists, is granted to `authenticated`, and is gated by the identical predicate, so it discloses nothing new: a wrapper, one `Promise.all` slot, one sentence |
| R2/F-3 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | The binding itself is sound and server-side — `hc.consume_step_up` matches `operation` and `target_ref`, and R3's confirmations establish it independently. The defect is that the *page* treats cookie presence as confirmation, so a live `raise_grant` token renders "Share it with Marisol" with no password and the click dead-ends at *"That couldn't be done just now."* while the honest `e=step-up` copy exists and is unreachable. Both remedies accepted: distinguish the operation (per-operation cookie name or a readable companion carrying `operation` + `target_ref`), and — worth doing regardless — have `share/submit` redirect to `?share=…&e=step-up` rather than `?e=refused`. **R3/F-8 closes with this row** |
| R2/F-4 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | `hc.revoke_share` refuses a live assignment-created share by ADR-0033 D19.2 ruling; the page renders Unshare for every row `shares_for` returns and already reads the discriminating column — *"· came with a task"* — using it only as a label. §4.3.5's *"revocable in one action"* is displayed as true and is false for that row, and nothing on screen names `unassign` as the door. Accepted at the app layer: render Unshare only where `created_by_assignment_of` is null, and say in words what withdraws the others, linking the task. **DECLINED here, named for the slice-8 plan gate:** widening `hc.shares_for` to carry the task's live status — that is DDL, the honest surface does not need it, and the bound does not move in a dispositions round |
| R2/F-5 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | *"Nothing filed yet."* is guarded only by `rows.length === 0`, and the subject filter empties `rows` server-side — so the sentence is false over a circle of four filed documents, with the subject nav hidden (it is derived from the already-narrowed rows) so nothing on the page contradicts it. A malformed `?subject=` empties it before the database is touched. The neighbouring discipline is OW-20's own ruling — *read `error` and render an error state, never an empty one* — and the page already carries the honest sentence for the client-side filter (*"Nothing in this view."*). Accepted with the way back: a subject list not derived from the filtered rows, and an "All" link that drops `subject`. **This falsifies a clause of DOC-01's assertion column** — the findings doc scoped DOC-01 to R6/F-7 and "title only"; it is not title-only (§4) |
| R2/F-6 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | Marked CONTINGENT by the lens on a design spec it did not read, and we do not need that spec to settle it: D10's own discipline for this slice is *"absent/empty/failed **each said**"*, and the sibling surface built from the same component in this same slice says *"No fields were read from this document."* Two surfaces, one slice, one component, two different answers to the same fact — the inconsistency is the defect regardless of which answer the spec prefers. The neighbouring subject page argues its silence explicitly; this page argues nothing. Copy the ReviewScreen sentence into the `can_view` branch (and one for an absent rendition) and pin an empty-facts case |
| R2/F-7 | MINOR | **ACCEPTED · TAKEN(7E)** | 7E | **A condition on Q-A's ratification**, and re-verification strengthened it: the only two `can_view`/`can_manage` assertions in `tests/hc/documents.test.ts` are the coordinator's (true/true) and Ruth's — a `summary` member **by grant**, not a share-holder. Rung 5 lifts only the share-holder, and Ruth's document level is `summary` either way, so the single-token `'document'`-for-`'arrival'` edit leaves that case green while every share-holder in the system gains the pages and the facts. Ratifying an unpinned narrowing on the sensitive pair is how it stops being true. Four lines: two in `tests/hc/documents.test.ts`, two in the e2e share leg mirroring DOC-02's summary negatives |

### R3 — the step-up consumers, adjust, and send-again

| Finding | Sev | Verdict | Home | The argument |
|---|---|---|---|---|
| R3/F-1 | MAJOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified at both ends: `hc.set_grant` returns `'changed', false` and writes nothing; the route discards the return and redirects `?changed=1`; the page renders *"Changed. It's written in the family's log, with both levels."* as a `role="status"`. Two false statements on the two surfaces the slice exists to make honest, reachable by the single interaction the pre-checked form invites — and reachable with no misclick at all when a peer coordinator raises the level between the `e=step-up` bounce and the click. The quality question settles it: delete the definer's no-op arm and every existing assertion still passes. Read `changed`, and give the no-op its own honest marker and copy |
| R3/F-2 | MAJOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified: the page posts `next` = `${next}?${raise}` and all three step-up failure arms append `?e=…` by string concatenation, so `rl` parses as `view?e=nomatch`, the page's own set-validation drops it, the entire *Raise access* section disappears and `sp.e` is undefined — a mistyped password returns the coordinator to a page indistinguishable from one she navigated to herself. Five attempts and `hc.auth_throttle` locks her out with `wait=N` discarded by the same mechanism, so the lockout is invisible too. This violates D3's standing rule (*every `e=slow` marker READ by its page*) in its general form. Accepted at the **shared** site — compose with `URL`/`URLSearchParams` in the step-up route — because 7B's assign page and 7C's document-share form carry the same collision; one fix, three consumers |
| R3/F-3 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified: `rs` is the one raise param with neither set- nor shape-validation, and it is concatenated raw into the posted `next`. A crafted same-origin link makes the member page render the green *"Changed. It's written in the family's log"* immediately after the coordinator proves her identity, with nothing changed and nothing logged. Nothing widens (the route's `UUID_RE` and `consume_step_up`'s exact match both refuse), so this is honesty, not authorization — but a false assertion on the access-control surface at the moment of re-authentication is exactly the harm C4/C5 exist to prevent. `UUID_RE` on `rs`, and `URLSearchParams` with R3/F-2 |
| R3/F-4 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | **One defect with R4/F-5, found by two lenses.** `hc.circle_people`'s own contract is *"null, not hidden, so 'not yours to know' and 'he has none' cannot be confused"*, and both consumers collapse it with `?? 'hidden'`. Under a freeze the matrix states every level as *Nothing* — false about access, on the surface whose job is stating access — and then classifies the **lower** that is the remedy as a raise, demanding the password friction `hc.set_grant` deliberately refuses to impose on revocation. The People list gets the same value right, so the two 7C surfaces disagree. CONTINGENT on a freeze being reachable (no app caller today), which is why it is MINOR and not more; it is accepted anyway because the next slice's findings surface makes it reachable |
| R3/F-5 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | D4's property that matters — *revoke lands BEFORE the redirect, so no window exists in which the old token is alive and the coordinator believes it retired* — rests entirely on reading the source: reorder the two statements and every test in the tree still passes. The declared-and-unused `retireInvite` mock is the tell. Second half accepted too: `hc.revoke_invite` carries no expiry term, so a pending invite posted to `again/submit` is killed while the landing says *"The expired invite was withdrawn."* Add the route test (revoke-then-redirect, the refused and slow arms), and either gate on `invite_status === 'expired'` or make the copy true. `?resend=1` as unauthenticated state (R3's observation 4) rides the same commit |
| R3/F-6 | MINOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified: `RECORD_TREES` gained `documents` and not `people`. Every one of the six files under `app/(app)/[circle]/people` carries a budget **today** — the STATE is right and the GUARANTEE is missing, so deleting `withRouteBudget` from the grant route breaks no test. **Ruled FIX, not OWED**, against the findings doc's listing of it as an owed candidate: it is one array element in the commit that already touches the file, and an owed row for a one-line scanner edit is the loophole the cap exists to close |
| R3/F-7 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | **Clusters with R4/F-6** — one map, two lenses. `LEVEL_RANK` is the only map in the phrases module with a security consequence and the only one with no live pin; the enum pin covers key *sets* and never ordering, while `LEVEL_RANK` decides both what the care ceiling offers and whether a step-up token is demanded. Fail-closed at the DB in every constructible case, which is why it is MINOR — but D6 claims the ceiling *"offers NOTHING above itself"* and that claim rides an unpinned ladder. Assert the ranks against `enum_range` order, narrow the type, and derive the page's and route's `DOMAINS`/`LEVELS` from the pinned module rather than re-declaring them a third and fourth time. In 7D because deriving the constants is product code on the grant path |
| R3/F-8 | OBS | **NOTED · closed by R2/F-3's fix** | 7D | Filed as an observation and correctly so: nothing widens, the token is opaque to the app by design, and the sequence fails closed. It is the same mechanism as R2/F-3 seen from the other consumer — one cookie name for three operations — and the per-operation distinction R2/F-3 buys closes it, including the *"burns her unrelated step-up"* half, since the page would no longer render the wrong form. Recorded so the next round does not re-derive it as new |

### R4 — the phrases module, People surfaces, nav, subject page, and the log

| Finding | Sev | Verdict | Home | The argument |
|---|---|---|---|---|
| R4/F-1 | MAJOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified at the declared evidence head, and the round's cleanest falsification: D8 and RCP-02's **green** cell both assert *"opens in an upcoming update" is gone from the tree*, and it renders live at `timeline/[event]/page.tsx:137` on a file 7C never touched — while `inbox/[arrival]/page.tsx:284` asserts its absence in a comment. **The distinction that protects the row:** RCP-02's *assertion* is about **receipt** links, and the timeline event page's provenance block is not a receipt link — so the assertion does not fall on this finding; the **evidentiary sentence appended to it** is false and must go, and the pins named as its evidence (three `not.toMatch` against the *arrival* page's markup) could never have observed another route's HTML. Two remedies accepted: link the document (`d.id` is in hand at the exact line that says the page does not exist) and add the `tests/lint/` scanner ADR-0026 requires, comment-carved per traps §9. The scanner rides 7D with the product change it guards |
| R4/F-2 | MAJOR | **ACCEPTED · TAKEN(7D)** | 7D | **Q-B's subject.** The policy half is ratified — no episode page exists and RCP-02 does not owe one — but at `ccd854b` the link drops the `subjectId` that `receiptLine` was widened **in this diff** to carry, and `timeline/page.tsx` then defaults to `subjects[0]`, the founding subject. Two subjects and one episode is all it takes: the receipt says the object was created and points at someone else's thread. The pin's title carries the two-part claim and its body asserts the href alone. Accepted as the two-line fix (`?subject=${subjectId}`, an `id` on the episode `<section>`, a `#episode-<id>` fragment); mechanisms 2 (receipt-row predicate vs member-event predicate) and 3 (`listEvents`' oldest-300 window) are recorded as named narrowings in RCP-02's cell — see Q-B in ADR-0038 |
| R4/F-3 | MAJOR | **ACCEPTED · TAKEN(7D) + OWED(OW-26)** | 7D | Re-verified on all three sites. The surface that calls itself *"Everything done with the record"* and promises *"it prints exactly the entries below"* is `order by seq desc limit 300` with no cursor, no count and no disclosure, while PPL-04's green cell says it *"subtracts nothing"* and `accessLog`'s docstring says it *"simply orders what the policy already decided."* The failure is specific and load-bearing: `seq` 1 is the **custodianship declaration**, the §7.5 row the whole subject page rests on, and it is the first row dropped — invisible from the surface that shows it, because that page reads it with a separate `order by seq asc limit 1`. **Both remedies, split by what evidence this slice can produce:** the disclosure is accepted and TAKEN to 7D (the lead paragraph, the print projection, PPL-04's parenthetical, LOG-01's app half and the docstring); the cursor — the honest fix for an accountability surface, and not producible here — is **OWED as OW-26**, home slice 8. **This is the condition on UXA-04** (Q-F item 1) |
| R4/F-4 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified: exactly one rendered href to `/[circle]/people/log` exists in the whole app, on the subject page; the only path to the subject page is a receipt for an approved profile fact. So the reachable route to the printable record §4.6.5 promises is *have an arrival whose approved proposals include a profile fact* → *open its receipt* → two clicks. Both e2e legs `goto` the URL directly, so they prove the pages render and never that a person can arrive. Accepted with the leg change: a link from the People list (and the subject cards linked to their own pages), plus a leg that **clicks** rather than `goto`s. The lens flags that this is Tier-3 in cost while stranding a Tier-1 accountability artifact; the charter settles it — the tier is per increment, never lowered mid-slice, and 7C is Tier 1 |
| R4/F-5 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | **The same defect as R3/F-4**, filed independently from the other side, which is itself the evidence that the null-vs-hidden collapse is not a one-surface slip. R4 adds the type: `PersonRow.levels` is `Record<string, Record<string,string>> \| null` where the definer emits `Record<string, Record<string,string> \| null> \| null`, so the type gives a future caller no warning and `Object.keys(row.levels[sid])` throws. Widen the type, branch the matrix on a null inner map, render the frozen state as its own sentence with no radios. Fail-closed is already right on the write path; it is the display that asserts a false fact |
| R4/F-6 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | **Clusters with R3/F-7.** R4 adds the typing half: `Record<string, number>` means an absent key is a silent `undefined` at the type level, `n > undefined` is `false`, and a raise is misclassified as a lower with `stepUpToken: null`. Today both keys exist and the DB refuses regardless — but the thing that would fail first if the enum grew is `LEVEL_WORD`'s pin, in another file, on another assertion, and nothing states the invariant `LEVEL_RANK` must satisfy. Narrow the type so an omission is a compile error; assert ranks strictly increasing along `enum_range`'s own order |
| R4/F-7 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | The receipt section's comment says documents and profile facts *"say plainly their surface opens later"* and *"RCP-02 stays pending"*, sixty lines above the 7C comment that says the opposite and beside a green RCP-02. In a tree where ADR-0026 makes comments first-class and every scanner carves them out, a comment that contradicts a coverage cell is what a later reader will believe — the named failure is a slice-8 session "restoring" the honest-limit sentence. Accepted with the second site the re-check found (`:284`, which asserts R4/F-1's string is gone). **Worth stating plainly: a comment-only edit still moves the evidence head and still costs the unconditional gate.** That is the cost rule working as designed, not an argument against the fix |
| R4/F-8 | OBS | **ACCEPTED · TAKEN(7E)** | 7E | Filed as OBS; accepted at MINOR weight because **LOG-02's app half cites the first of these pins as its evidence**. The `DENIAL` fixture carries no `object_type`, no `object_id` and no `detail`, and there is not one `not.toContain` — the test cannot fail for naming an object because no object name is ever put where the page could reach it. The print assertion's `[\s\S]*` spans the whole stylesheet, so it passes against a print block containing `.log-entries { display: none }` — precisely the failure its title names. **Read with R6/F-10, this escalates:** R6 excused PPL-04's leg on the ground that AC-PPL-7 is *"genuinely covered by `tests/routes/access-log.test.ts`"*, and R4 shows that pin cannot fail. Neither lens could see the pair. **AC-PPL-7 has no discriminating app-layer evidence at any level**, and PPL-04's and LOG-02's cells change accordingly (§4) |
| R4/F-9 | OBS | **ACCEPTED-NOTE** | docs | No code. The claim *"a hidden domain is simply not mentioned"* is literally true and the filter is careful — it excludes `hidden` **and** any unworded future level, so nothing unworded can reach a sentence. What D5 presents as non-inference is only non-mention: `view` on five renders *"sees everything"*, `view` on four with one hidden renders the enumerated form, and a reader who knows the five-domain taxonomy subtracts. It is harmless **today** only because `hc.circle_people` guards member levels with `v_coord or m.id = v_me.id` — a property of the definer's guard, not of `plainLine`, that stops holding the day a levels map reaches a third reader. Record the distinction in D5 so the next slice does not read the claim wider than it is |
| R4/F-10 | OBS | **ACCEPTED · TAKEN(7E)** | 7E | The pin is the strongest single assertion in the increment and it never exercises the shape the DB emits: `hc.member_levels` never returns `{}` for a subject key — it writes all five domains with `'hidden'` spelled out — and the per-subject `null` that `member_levels_frozen` emits is not in the file at all. The all-hidden map reaches the same branch, so nothing is *wrong*; the live shape and D5's central case (one hidden among four worded) are simply untested. Three cases, in the file R4/F-6 already opens |

### R5 — the bounds, the remove route, and the cache-control split

| Finding | Sev | Verdict | Home | The argument |
|---|---|---|---|---|
| R5/F-1 | MAJOR | **ACCEPTED · TAKEN(7D) + OW-24** | 7D | Re-verified on both routes: `boundedJsonText` at `:40`/`:51`, `withRouteBudget` at `:56`/`:74`. `req.text()` carries no timeout, no `AbortSignal` and no `budget.race`, and it resolves only when the stream ends — so a chunked body with no `Content-Length`, dribbled a byte at a time, neither 413s nor 504s. The size guarantee is genuinely real (the post-read length check catches a lying or absent header); the time guarantee is false for this hop. **And the ledger ruling this forces is NOT "reopen":** re-read against the rows' own acceptance conditions, OW-07's (*"each of the five carries a bound (time and size) with a test that names it"*) and OW-19's (*"a content-length/JSON-size cap and an AnswerBudget on both; a per-file pre-read bound"*) are each **CONFIRMED by R5 itself** and stay CLOSED — the ingress read is a **sixth** hop neither row named. What is falsified is *evidence text*: OW-19's *"with every hop raced"* and DOC-05's identical words. Markers on those, and the new work carried by **OW-24** |
| R5/F-2 | MINOR | **ACCEPTED · TAKEN(7D)** | 7D | Re-verified: `proxy.ts:30` returns before the stamp at `:67`. The existing negative-case test exercises exactly this branch and asserts only status and that `getClaims` was not called; `playwright.config.ts` sets both env vars unconditionally, so no gate run can ever reach it. R5's own likelihood argument is accepted — without those vars the app is not functional enough to serve a coherent sensitive page — which is why it is MINOR. It is accepted anyway because D7's claim is *"every pass-through"*, the fix is one line, and Q-D's ratification rests on that claim. Folded into PPL-03's cell per Q-D |

### R6 — legs versus titles

| Finding | Sev | Verdict | Home | The argument |
|---|---|---|---|---|
| R6/F-1 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified: nothing is read before `ArrowDown` and nothing is compared after it; `expect(focusedValue.length).toBeGreaterThan(0)` is satisfied by the radio `.focus()` put there on the previous line. Give the radios unique `name`s and the radiogroup is destroyed, the arrow key does nothing, and the leg stays green with a matrix that is not keyboard-operable. A11Y-10's cell claims *"arrow-key movement through the level radios"* in those words. Read the checked value before, assert movement **and** selection after |
| R6/F-2 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified: both post-click assertions are independent of whether the category changed — *"written in the family"* is driven by the redirect's `?moved=1` alone, and *"Financial"* renders in the move radio list precisely **because** the document is still Medical. A redirect built before a rolled-back write passes both, with Dan still seeing the document. DOC-03's green cell cites this leg by title as its e2e half. Assert the post-state (the Card meta line, or *"Move it out of Financial"*), and add the audience proof the leg already set up — Dan's 404 |
| R6/F-3 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified: `main table` = 0 and `main input[type="checkbox"]` = 0, and the matrix four files away is `<form>` → `<label>` → `<input type="radio" name="level">` — neither a table nor a checkbox. The unit half has the identical gap, so **nothing in the tree asserts the absence of the shape the matrix has**. Paste the member page's block onto the list and both halves stay green while PPL-01's *"the list page holds no matrix at all"* is false on the shipped surface. Assert `input[name="level"]` and `form[action*="/grant/submit"]` counts at both layers |
| R6/F-4 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified: the assertion is `toContainText('custodian')` — the label word, which renders beside the `?? 'named at setup'` fallback whether or not a custodian resolved; the unit half's `toContain('Sarah')` matches a member card the same render emits. Neither ties a name to the slot, so AC-PPL-3 — whose entire point is that a subject has a **named** custodian — is unproven while PPL-01 is green. The sibling subject-page leg gets it right only by accident of conditional rendering. Assert the whole clause, with a custodian name that is no member's display name |
| R6/F-5 | MAJOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified in both halves: `e2e/a11y.spec.ts` is not in the 7C diff and its shell pass iterates four routes, none of them Documents; `expectTouchTargets` appears **zero** times in either new spec. So `/[circle]/documents` has no browser accessibility coverage at all, `/people/subject/[subject]` never sees axe, `/people/log` is visited only for a visibility check — and the three pages that *are* audited are held to axe's 24×24 `target-size` floor rather than the project's own 44 px. **Ruled FIX, not the manifest's OWED option**, against the findings doc's listing of it as an owed candidate: C6 is BINDING, the manifest is the artifact a reviewer reads to check C6, and this round has already seen a real 44 px failure on exactly the `.action-link` class the Documents list carries three of (the r4 catch). An OWED claim would leave three shipped pages unaudited while the evidence says that class of defect is live here |
| R6/F-6 | MINOR | **ACCEPTED · TAKEN(7E)** | 7E | Re-verified all five: two are substantive, not cosmetic — the documents-list citation still describes the *pre-build* leg and promises *"Nothing filed yet."*, which D12.2 explicitly moved to vitest, and the A11Y-11 citation names a claim no leg makes. `npx playwright test -g "<manifest title>"` returns zero legs, which reads identically to "the leg was deleted", defeating the exact method (title against assertion) that found round 18's class and this round's five. Paste the exact titles and — ADR-0026 — extend `audit-manifest.test.ts` to assert each quoted fragment appears verbatim in some `e2e/*.spec.ts`. The TSK-03/04 coverage citation drift R6 records falls to the same fix |
| R6/F-7 | MINOR | **ACCEPTED · TAKEN(7E)** | 7E | Three mechanisms, all real: only the founder is driven, so *"at the member's own level"* has no discriminating case; the count is read only where `filtered === rows`, so the actual pre-filter defect is invisible; and `toContainText` is a substring match over all of `main`, so *"12 documents"* contains *"2 documents"*. MINOR because `tests/routes/documents-list.test.ts` genuinely carries the row — the **title** over-claims. Visit `?category=medical`, use an anchored regex, read the list once from Dan's context |
| R6/F-8 | MINOR | **ACCEPTED · TAKEN(7E) + ACCEPTED-NOTE** | 7E + docs | Two halves. The leg half is accepted: `MachineReadText`'s `toggle()` sets `aria-expanded` before and independently of the fetch, so the assertion holds when the sibling 404s, fails or returns empty — and the failure sentence is itself inside `CONTRAST_EXEMPT`. Assert the transcribed text after `Enter`. The row half is accepted as a **record correction, not work**: the viewer stacks its pages with no pager, no next/previous and no page list, so *"page navigation by keyboard through the ONE artifact route"* has no target and never did; strike the clause with a one-line note rather than build a pager to satisfy a sentence |
| R6/F-9 | MINOR | **ACCEPTED · TAKEN(7E)** | 7E | The clause has no assertion behind it at all — only a comment. axe cannot stand in: 1.4.1 is not machine-checkable and is not in the rule set axe runs, and `CONTRAST_EXEMPT` narrows what it sees further. Restyle the levels as swatches with the word in a `title` and nothing in the suite fails while A11Y-10 stays green with meaning carried by colour alone. One assertion — an exact-set check of the rendered level words against `LEVEL_OPTION_WORD` |
| R6/F-10 | MINOR | **ACCEPTED · TAKEN(7E)** | 7E | Both halves accepted. The leg cites AC-PPL-7 and seeds no denial. `Locator.isVisible()` is a non-retrying one-shot that returns `false` for a **non-existent** element as readily as a hidden one, and the leg establishes no control — rename the nav's class and the leg reports that the print sheet hides chrome it never saw. R6 excused the first half on the ground that `tests/routes/access-log.test.ts` covers AC-PPL-7; **R4/F-8 shows that pin cannot fail**, so with R4/F-8 this row is the second half of a single conclusion neither lens reached: AC-PPL-7 has no discriminating app-layer evidence. Seed the denial, assert the collapsed count with no object name, add the print control |

### The re-tally, by command

Count the verdict column, never by eye (round 16). Every number below was
produced by the command beside it and pasted back, not asserted.

**A row-count anchored on the ID alone is WRONG here** — §1's re-verification
table starts rows with the same IDs and `grep -c '^| R[1-6]/F-'` reports **59**.
The verdict rows are the ones whose second cell is a severity:

```
D=docs/review/round-27-dispositions.md
grep -cE '^\| R[1-6]/F-[0-9]+ \| (MAJOR|MINOR|OBS) \|' $D                 # 42
grep -c '| \*\*ACCEPTED · TAKEN(7D)\*\*' $D                               # 19
grep -c '| \*\*ACCEPTED · TAKEN(7E)\*\*' $D                               # 17
grep -c '| \*\*ACCEPTED · TAKEN(7D) + ' $D                                #  2
grep -c '| \*\*ACCEPTED · TAKEN(7E) + ' $D                                #  1
grep -c '| \*\*ACCEPTED IN PART' $D                                       #  1
grep -c '| \*\*ACCEPTED-NOTE\*\*' $D                                      #  1
grep -c '| \*\*NOTED · ' $D                                               #  1
                                                                # 19+17+2+1+1+1+1 = 42
grep -E '^\| R[1-6]/F-[0-9]+ \| (MAJOR|MINOR|OBS) \|' $D \
  | awk -F'|' '{gsub(/ /,"",$5); print $5}' | sort | uniq -c     # 7D 23 · 7E 17
                                                                # · 7E+docs 1 · docs 1
```

By first token (the ADR-0023 D17 parser's rule — a compound verdict counts by
its first token): **ACCEPTED 40 · ACCEPTED-NOTE 1 · NOTED 1 · FIXED 0 · OWED 0
· DECLINED 0 · OWNER 0 = 42.**

By home, as the command reports it: **7D 23 · 7E 17 · 7E+docs 1 · docs 1 = 42.**
7D's 23 carries **22 distinct fixes** — R3/F-8 is homed there because R2/F-3's
fix is what closes it, not because it is work of its own.

By severity, unchanged from the lenses — the severity is the reviewer's and no
row's was restated. Both sides of this were counted:

```
grep -oE '^##### R[1-6]/F-[0-9]+ — (MAJOR|MINOR|OBS)' docs/review/round-27-findings.md \
  | awk '{print $4}' | sort | uniq -c        # MAJOR 16 · MINOR 21 · OBS 5
grep -oE '^\| R[1-6]/F-[0-9]+ \| (MAJOR|MINOR|OBS) \|' $D \
  | awk '{print $4}' | sort | uniq -c        # MAJOR 16 · MINOR 21 · OBS 5
```

**They agree**, and both reconcile with the heading count
`grep -c '^##### R' docs/review/round-27-findings.md` = **42** and with the
per-lens breakdown R1 `3/1/1` · R2 `2/5/0` · R3 `2/5/1` · R4 `3/4/3` ·
R5 `1/1/0` · R6 `5/5/0`.

**Three OBS rows were accepted at working weight** and one was not, each with
its reason above: R1/F-5, R4/F-8 and R4/F-10 are accepted because a one-line
closure exists and, for R4/F-8, because a green row cites the pin; R4/F-9 is
`ACCEPTED-NOTE` because there is nothing to close; R3/F-8 is `NOTED` because
another row's fix closes it.

---

## 3 — What does NOT move

- **No verdict moves in this commit.** `docs/coverage.md`, `docs/owed.md`,
  ADR-0037 and the PRD are untouched. §4 and §5 hold the exact replacement
  text so the sign-off commit is mechanical rather than interpretive.
- **No code, migration, test, leg or manifest has been changed.** Every remedy
  above is described; none is applied.
- **No DDL is proposed and the bound does not move.** Migrations stay **NONE**
  (5 of ≤ 6); **M6 closes UNCONSUMED** unless a later plan gate consumes it.
  Three items would need DDL and are named-and-stopped for the **slice-8 plan
  gate**, not costed here: `hc.shares_for` carrying the assignment task's live
  status (R2/F-4's wider form); a level-bound step-up `target_ref` (R3's
  dissent 1); share-includes-bytes, if the owner wants Q-A the other way.
- **No row is proposed `FIXED`.** Not one of the 42 fixes is written.
- **PR #34 stays unmerged**, and the recommendation is that it stays unmerged
  until 7E and 7D land and one complete gate runs green at the final head —
  ADR-0038 §5.

---

## 4 — Coverage cells, with the exact text

Thirteen rows. Eight are proposed **`green` → `review`**; five keep `green`
with narrowed evidence; one stays `pending`. Every one is restored — in the
words the fix earns — at the fix increment's close-out.

| Row | Status | The clause that goes | What replaces it |
|---|---|---|---|
| **RCP-02** | green → **review** | *"and *"its page opens in an upcoming update"* is GONE from the tree (`tests/routes/arrival.test.ts`, the three new pins)"* | The assertion stands: receipt links resolve. The evidentiary sentence is struck — the string renders at `timeline/[event]/page.tsx:137` and the three pins read only the arrival page's markup (R4/F-1). Add Q-B's narrowing verbatim: *"an episode resolves to its SUBJECT's thread; where its member events are not the reader's to see, or fall outside `listEvents`' oldest-300 window, the wrapper does not render"* (R4/F-2). Re-greens when R4/F-1 and R4/F-2 land |
| **DOC-01** | green → **review** | *"incl. *Nothing filed yet.* whenever nothing is FILED"*, and the e2e clause *"rows at the member's own level, counts post-filter over the rendered tree"* | The sentence is false under an active subject filter, which empties `rows` server-side (R2/F-5); the leg drives only the founder and reads the count only where `filtered === rows`, by substring (R6/F-7). The unit half stands and is strong. **The findings doc scoped this row to "title only" — it is not**; R2/F-5 lands on the assertion column |
| **DOC-02** | **green**, narrowed | *"fence-tested: no second `asServiceRole()` consumer, no second bytes route"* → *"one `asServiceRole()` consumer by FILE, one route under `app/api/artifact/`, `createSignedUrl` nowhere else"* | The product claims hold and were independently verified by R1's tree-wide greps. What narrows is the *guarantee*: the fence proves the tree **at this head** by four literal-name predicates, three of them without controls, and does not survive a re-export, `createSignedUrls`, a byte-returning reader, or `next/image` (R1/F-1/F-2/F-3/F-5). Say that in the cell. **This row is touched and the findings doc lists it as untouched** |
| **DOC-03** | green → **review** | *"the preview renders the EXACT audience by name and direction"*, and the e2e clause *"the move landing with its markers"* | The preview names the DOCUMENT audience and not the derived objects ADR-0034 D7 ruled it names (R2/F-2); AC-DOC-6's refusal half has no app-layer evidence and the offer is unfiltered (R2/F-1); both post-move assertions pass with no move (R6/F-2). The pgTAP half (068) is untouched and stays green |
| **DOC-05** | green → **review** | *"answer inside `withRouteBudget` with every hop raced"* | The ingress read runs before the budget opens and is raced against nothing (R5/F-1). The size half — 4 KiB cap, 413 before parse, the TUS `Upload-Length` refusal — is CONFIRMED and stays. Carried by **OW-24** |
| **LOG-01** | **green** (pgTAP layer) | the app-half addendum *"asserts it subtracts nothing"* | It subtracts, by `order by seq desc limit 300` (R4/F-3). The row's layer is pgTAP/1D and stays green on it; the 7C app-half claim is struck back and re-earned at the fix head |
| **LOG-02** | **green** (pgTAP layer) | the app-half addendum *"a denial row renders its collapsed count and never an object name … (`tests/routes/access-log.test.ts`)"* | The **code** is clean — `entryLine` reads neither `e.detail` nor `e.object_type`, and nothing crosses the RSC boundary (R4's confirmation). The **pin** cannot fail: the fixture carries no object to leak and there is not one `not.toContain` (R4/F-8). With R6/F-10, AC-PPL-7 has no discriminating app-layer evidence at any level |
| **PPL-01** | green → **review** | *"the list page holds no matrix at all"* and *"custodians named"* | Both are asserted by shapes the product does not use (`<table>`, `type="checkbox"`) and by a label word that renders unconditionally beside a `?? 'named at setup'` fallback (R6/F-3, R6/F-4), at both the e2e and unit layers |
| **PPL-03** | **green**, extended | — | Add Q-D's fold-in: *"`proxy.ts`'s missing-env early return passes through UNSTAMPED (R5/F-2); the branch is unreachable under gate conditions because `playwright.config.ts` sets both vars, and the app is not functional in that state — fixed in 7D, one line"* |
| **PPL-04** | green → **review** | *"the surface adds nothing and subtracts nothing — `lib/hc/people#accessLog` orders what the policy decided"* and the AC-PPL-7 clause | The 300-row cap subtracts, undisclosed, on the surface that says *"Everything"* and *"it prints exactly the entries below"* — with `seq` 1, the custodianship declaration, first to go (R4/F-3). The denial clause has no discriminating evidence (R4/F-8 + R6/F-10) and the print check lacks its control (R6/F-10) |
| **A11Y-10** | green → **review** | *"arrow-key movement through the level radios"* and *"meaning never by colour"* | Neither has an assertion that can fail: the first is satisfied by the `.focus()` on the line above (R6/F-1), the second by nothing at all (R6/F-9). The other two clauses — the plain line first, the printed log readable — hold, and the row's r3/r4 history stays in the cell as written |
| **A11Y-11** | green → **review** | *"page navigation by keyboard through the ONE artifact route"* | The viewer stacks its pages with no pager, so the clause has no target and never did — struck as a record correction with a one-line note, not built to (R6/F-8). The sibling half re-greens when the leg asserts the transcribed text rather than `aria-expanded` |
| **UXA-04** | **pending** (unchanged) | — | Record the round's read: *"read at round 27 (ADR-0038 §Q-F): faithful to §7.5, §4.6.1, §4.6.3, §4.3.2, §6.9 and §8.6 at every enumerated home; 'authority' on no surface. FLIPS when R4/F-3 item 1 lands — the log's 'Everything … prints exactly the entries below' disclosed or the cap removed. Items 2–4 recorded as observations"*. **It cannot flip here**: the condition is a copy change in `app/`, which moves the evidence head and costs the gate |

---

## 5 — The ledger

Three rows in, none out. **OPEN 6 → 7 / 25.** TAKEN 1 → 3 · RISK 1 · CLOSED 15
· 23 rows → 26. The burn-down quota holds: slice 7 opens **3** and has closed
**13** (7B: OW-01/02/03/06/11/15/17/18/20; 7C: OW-07/16/19/23), against a
requirement of 3 + 5 = 8.

**No row is reopened and none is rewritten.** OW-07 and OW-19 keep
`CLOSED(f1cfc33)` — re-read above, both acceptance conditions are CONFIRMED by
R5 itself — and each gains a struck-and-preserved marker pointing here, per
ADR-0025 D6's *amend, never rewrite*. What was falsified is OW-19's **evidence
text**, not its condition.

| ID | Origin | Sev | Claim | Acceptance condition | Status |
|---|---|---|---|---|---|
| **OW-24** | ADR-0038 (R5/F-1) | MAJOR | `boundedJsonText`'s `req.text()` runs before `withRouteBudget` opens on both upload routes and is raced against nothing: a chunked body with no `Content-Length`, dribbled, neither 413s nor 504s. A **sixth** hop, named by neither OW-07 (whose five all carry bounds) nor OW-19 (whose size cap holds) | The ingress read answers inside the route's own `AnswerBudget`, or carries its own independent deadline, on both routes — with a route test that a slow or chunked body is refused in bounded time; and OW-19's evidence text plus DOC-05's cell stop saying *"every hop raced"* until it is true | `TAKEN(7C/7D)` |
| **OW-25** | ADR-0038 (Q-E; ADR-0037 D11) | n/a | The gate's machine-readable record is flag-borne: `playwright.config.ts` sets no `reporter` and no JSON path, and its `trace: 'retain-on-failure'` means a config-borne green run retains **no** per-test traces by design | `reporter` and the JSON output path are IN `playwright.config.ts`, **and** the trace question is settled on the record — either `trace: 'on'` is pinned with the disk cost accepted, or the config states that a green run carries no per-test traces and why that is acceptable. Discharged by a gate run whose JSON record is produced with no CLI override | `TAKEN(7C/7E)` |
| **OW-26** | ADR-0038 (R4/F-3, remedy (a)) | MAJOR | The access log is one `order by seq desc limit 300` with no cursor and no count; `seq` 1 is §7.5's custodianship declaration and is the first row dropped, on the surface whose purpose is a complete printable record | The log reaches every entry the reader may see — a `seq` cursor or equivalent — the printed projection reaches the same set, and a test drives a circle past 300 rows | `OPEN`, home slice 8 |

**OW-25 lands in 7E deliberately**, before the closure gate, so that gate's own
record is config-borne rather than flag-borne — the item discharges itself on
the run it enables. If the fix increments are not approved, OW-25 falls back to
`OPEN` and the ledger reads **8 / 25**, still under cap.

**OW-05 is not closed and stays `TAKEN(7/Tier-3 pass)`** — it is recurring by
its own acceptance condition. Recorded toward it: R6 audited **12** legs
title-against-assertion this round, against the standing quota of 8, and found
five wanting.

---

## 6 — The six pointed questions, with the argument

ADR-0038 D1 carries the rulings; this section carries why. Each ruling is PUT
for owner ratification, not self-ruled.

**Q-A — RATIFY, conditioned.** The packet's apparent contradiction —
*"`extractionsFor` is never called below `can_view`"* against *"the share-holder
reads … sentences"* — is not one, because **the sentences are not extractions**.
The line is drawn between TABLES: `documents.summary_text` is a column on the
document ROW that rung 5 unlocks (`documents_select` needs `>= 'summary'`);
extractions live in `public.extractions` behind the arrival's gate. Traced:
rung 5 fires on `p_object_type = 'document'`, so her level on the **document**
becomes `greatest(ladder(…), 'view')`; `can_view` asks the same function about
the **arrival**, whose id is not in `p_ctx -> 'shares' -> 'arrival'`, so she
falls to rung 4 or 6 and `can_view` is false — `readableRendition` and
`extractionsFor` are never called for her. `can_manage` asks the document object
and rung 5 caps her at `view`, below `manage`, so no controls. D2 and D12.1 are
simultaneously true.

The two conditions are not decoration. **(1)** The narrowing is asserted by no
test at any layer, and this session's re-check makes that sharper than the lens
put it: the only `can_view`/`can_manage` assertions in `tests/hc/documents.test.ts`
are `:229-230` (the coordinator) and `:247-248` (**Ruth**, `summary` **by
grant**). Rung 5 lifts only the *share-holder*, and Ruth's document level is
`summary` either way — so the single-token `'document'`-for-`'arrival'` edit in
`documentById` leaves `:247-248` green while every share-holder in the system
gains the pages and the facts. **(2)** D12.1 enumerates *"title, category,
dates, sentences"*; the row also carries `approver_display_name` and
`approved_at` and the page shows them. That is right by AC-DOC-3, and an
enumeration that understates beside AC-DOC-5 is the kind of narrowing that gets
read as exhaustive later.

**Q-B — fix, then accept the narrowed claim.** *"Resolves"* can mean "returns
200" or "puts the created object in front of the reader". The packet's own words
— *"the surface that renders it"* — and the pin's title — *"where its wrapper
renders"* — both commit to the second, while the pin's body asserts only the
href. At `ccd854b` the implementation meets a third, weaker reading: *resolves
to a surface that renders episodes*. Three mechanisms, ordered by how easily
they bite: the link drops `subjectId` and `timeline/page.tsx` defaults to
`subjects[0]`, so two subjects and one episode is enough to land the reader on
someone else's thread; the receipt's predicate is the **episode row** while the
wrapper's is **member events surviving the reader's own timeline read**; and
`listEvents` is `order by sort_at asc … limit 300`, the *oldest* 300, so the
newest episode in a mature circle is outside the window. The two-line fix closes
mechanism 1 outright and makes 2 and 3 visible rather than silent — the reader
lands on the right thread and at worst does not find the wrapper. Accepting
as-recommended without it would green RCP-02 on a reading its own cell does not
state.

**Q-C — RATIFY.** The live pin is stronger than "asserts the ADR's ruling": it
loops **all seven** categories, comparing `` `${c}:${categoryDomain(c)}` ``
against `hc.own_domain('document', $1, null, null)`, so `insurance: 'finances'`
cannot drift in either direction — the assertion would fail if the constant
moved *or* if the DB map did. The move case additionally asserts the consequence
live (`expect(moved!.taint).toEqual(['finances'])`). The ADR-0005 cite rides in
two comments; strictly, the cite is a comment and the *ruling* is what the
assertion holds, which is the right way round. On the second half: a full-tree
grep for `insurance` returns only the two `CATEGORY_LABEL` maps (a category
label, not a domain word), the styleguide fixture, the three `lib/ai/` enums, a
`lib/extraction/fields.ts` comment, and the map itself — the only domain **word**
a person reads is composed from `categoryDomain()`. The erratum is PRD-side
only; nothing in the app or the tests changes.

**Q-D — RATIFY, R5/F-2 folded in.** The artifact half is solidly confirmed:
`private, no-store` on every response shape (200, 503, 504), and the PPL-03 leg
asserts it on the pre-revocation artifact URL — where caching actually bites —
with the leg's own comment saying why it does not also assert on the page
response. The unit pin genuinely guards the page-proxy half on the normal path,
signed-in and signed-out. The fold-in is not a dissent: D7's claim is *"every
pass-through"*, and `proxy.ts:30` is one pass-through that returns before the
stamp. It is MINOR because without those env vars essentially every Server
Component reading Supabase fails before producing a coherent sensitive page — a
cached sensitive page is not the live risk. It is fixed anyway because it is one
line and Q-D's ratification rests on the claim being true as written.

**Q-E — RATIFY, condition widened.** The premise is confirmed cleanly:
`playwright.config.ts` sets no `reporter` key and no JSON output path anywhere,
so any run's machine-readable record is necessarily a property of the command
line that invoked it. The teed log plus tally is a reasonable r5 record given
that r3/r4's failure traces **are** retained and each red's mechanism is named
in its own commit. The widening is the load-bearing part: the base config's
`trace: 'retain-on-failure'` (line 26) means the very thing OW-25 proposes to
produce — a config-borne, unoverridden run — retains **no** per-test traces on
an all-green run *by design*. An item that names only the reporter and JSON path
therefore reintroduces exactly the gap r5 is being excused for, one round later,
with a JSON tally sitting beside zero traces instead of a teed log sitting
beside zero traces. Either `trace: 'on'` is pinned with the disk cost accepted,
or the config says on the record that a green run carries no per-test traces and
why that is acceptable.

**Q-F — the read is complete; the flip is conditioned and is not here.** §2 of
ADR-0038 carries the ruling. The copy defects are all carried by lens findings
and are not renumbered: item 1 is R4/F-3 (the condition); item 2 is the
`?? 'named at setup'` hedge R6/F-4 shows the tests cannot see, unreachable in a
well-formed circle by AC-AUTH-6 — copy hygiene, not a leak; item 3 is
`risk_class` rendering as a raw enum token in a family-facing sentence, the one
place §8.2's voice is carried by the database rather than by copy; item 4 is the
list's limit sentence dropping "presence" from AC-PPL-1's four channels — an
understatement, in the safe direction.

**The packet's open re-rule — RATIFIED.** `db:verify` and the upgrade leg stay
NOT RUN at `ccd854b`. Both exist to exercise DDL; 7C ships none; `supabase/` and
`scripts/` are byte-identical to base by measured tree hash; the clean-leg reset
at exact 74 and pgTAP on it are the migration-state evidence. Requiring the two
legs at the dispositions head would add nothing the tree hash does not already
prove.
