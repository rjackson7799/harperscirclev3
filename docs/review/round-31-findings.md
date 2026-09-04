# Round 31 — findings

> **Reviewed:** 8A's M1 and M2 **as merged**, plus their pgTAP pair and ADR-0040
> — branch `review/round-31` @ `1389973`, base `main` @ `de0e3b6` (the merge of
> PR #45, second parent `77e3135`). The five targets are byte-identical at
> `7cf16ec` and at this head; blob ids asserted, not inferred: `3847ccd` (M1)
> · `5c1ccc5` (M2) · `cc8b87a` (070) · `05279ea` (071) · `11d4b40` (ADR-0040).
> **Independently verified:** M2's "byte-for-byte" provenance claim, by diffing
> the shipped `20260818120008` body against the replacement; the whole
> mint→store→consume→compose path for the four-part step-up binding, read at
> every hop; the level and domain enum orders and the app-side vocabularies;
> `access_grants`' uniqueness; the `assigned_by` column's semantics against
> `assign_task`'s write; the role graph and both functions' catalog closure;
> **and, executed live against the stack in a single rolled-back transaction
> with the control beside it, whether 071's STP-03-labelled case discriminates
> at all.**
> **Taken on trust:** every suite tally at the merged heads (66/66 gate,
> pgTAP 71 Σ 1,863, concurrency 83/83, vitest 1,563/106) — none re-run here;
> `hc.log`'s body; the PPL-02 browser leg's recorded pass; ADR-0043's rulings.
> **Verdict:** **approve with findings — two MAJOR.** Neither needs DDL. The
> migration is sound and its byte-provenance claim is true; the defects are in
> what the increment *claims to have closed* (F-1) and in the single case that
> carries the coverage row's name (F-2). **M2's reserved slot is NOT consumed
> by this round.**

## The lenses, and what each was pointed at

Tier 1 asks for 3–8 distinct lenses, at least one from a different model family
than the author. **Provenance, stated plainly rather than assumed:** M1 and M2
were both authored by **Claude Fable 5.1** (the `Co-Authored-By` trailer on
`0e780f8` and `05faed4`); this review is **Claude Opus 5** — a different model
family, so the requirement is met on the one lens the rule actually cares about.
The remaining lenses are one reviewer's distinct passes, not distinct models,
and are numbered `F-<m>` in a single sequence accordingly. **Say that in the
disposition rather than reading six independent reviewers into this file.**

| Lens | Pointed at | Yield |
|---|---|---|
| **L1 · byte-provenance** | M2's claim to be `20260818120008`'s F2 body byte-for-byte, with one composition changed | confirmed clean |
| **L2 · mint/consume symmetry** | the four-part string at every hop: `page.tsx` → `/account/step-up/submit` → `hc.mint_step_up` → `step_up_tokens.target_ref` → `hc.consume_step_up` → `hc.set_grant` | **F-1** |
| **L3 · test discrimination** | 070 and 071 as subjects: *what would this assertion do if the behaviour were simply absent?* — run as a live control/probe | **F-2** |
| **L4 · freeze-reasoning generalisation** | M1's header comment *"the freeze is rung 2 and needs no name of its own"* — not FRZ-17, but what else that reasoning reaches | **F-3** |
| **L5 · catalog & privilege closure** | ownership, `search_path`, EXECUTE, the role graph, the 002 exact-set pins, for both functions | confirmed clean |
| **L6 · predicate & column semantics** | M2's unfiltered `access_grants` reads/writes, M1's `assigned_by`/`owner_member_id` writes, uuid-case handling, the status vocabulary | confirmed clean + **F-4** |

## What was independently verified

**M2 is what it says it is.** Extracting `20260818120008`:245–382 and
`20260903120002`:57–198 and diffing them yields exactly one hunk: the
`hc.consume_step_up` target gains `|| ':' || p_level::text`, plus a three-line
comment. Nothing else in the body moved. The charter's "shipped migrations are
never edited" holds — `20260818120008` is untouched, and the replaced body
restates its owner and grants the 2A M8 way.

**The DB half of the binding genuinely works.** Live, in a rolled-back
transaction: a token minted for `member:subject:health:summary` is refused
against a post of `manage` and returns `summary` when posted for `summary`.

**Enums and vocabularies agree.** `hc.access_level` is
`('hidden','log','summary','view','manage')` and `GRANT_LEVELS` in
`lib/permissions/phrases.ts:58` is the same five in the same order;
`hc.domain`'s five match `DOMAINS`. So `p_level::text` and the app's form value
compose the same fourth part. `access_grants` carries `unique (member_id,
subject_id, domain)` (`20260815200004`:29), so M2's circle-unfiltered reads and
writes address exactly one row.

**M1 writes the columns it claims.** `tasks.assigned_by` is
`uuid references public.accounts(id)` (`20260815230002`:120), and both
`hc.assign_task` (`20260829120005`:453) and `hc.claim_task`
(`20260903120001`:139) write the actor's **account** id there — no
account-vs-member confusion. `owner_member_id` is written from the member row
looked up in the task's own circle, which the composite FK requires.

---

## Findings, most severe first

### F-1 — MAJOR — M2 made the app and the database agree perfectly about a level the coordinator is never shown, and then declared R3's dissent closed

**Lens.** L2 — mint/consume symmetry.
**Confidence.** High. Every hop read from source at this head; the database half
executed live. Not CONTINGENT — the whole path is in the repository.

**Where.** `app/(app)/[circle]/people/[member]/page.tsx:238-265` (the *Raise
access* section), against the claims in
`supabase/migrations/20260903120002_step_up_level_binding.sql:36-48`,
`supabase/tests/071_step_up_level.sql:14-17`, and ADR-0040 **D6**.

**Claim under test.** M2's header: *"The mint site composes the same four parts
… so what the coordinator confirmed and what the database will honour are the
same sentence, level included."* 071's header goes further and quotes R3 to
close it: *"a crafted link that raises the level a coordinator THINKS she
confirmed is the shape this binding does not cover — **now it is covered**."*
ADR-0040 D6: *"what changed is that it is now also in the sentence the database
matches."*

**What I found.** There is no sentence. Stripping tags and JSX expressions from
the *Raise access* section leaves exactly this literal text:

> `<EXPR>` can see. It takes effect at once and it's written in the family's
> log, with both levels. · Raise it · Raising access needs a fresh confirmation
> that it's you. · Confirm it's you

The one expression is `person.display_name` — the **grantee**. Mechanically
confirmed over lines 238–265: `DOMAIN_LABEL` **absent**, `LEVEL_WORD` **absent**,
`LEVEL_OPTION_WORD` **absent**, the subject's `display_name` **absent**. The
panel that asks for the password names **no subject, no domain, and no level**.
All three arrive as `sp.rs` / `sp.rd` / `sp.rl` and go straight into the hidden
`target_ref` at :256 — set-validated only, never displayed.

R3's dissent had two halves. M2 closed the half where a token for one level is
spent on another. The half R3 actually described — *the level a coordinator
**thinks** she confirmed* — is untouched, and the four-part binding makes it
**worse-shaped, not better**: the app and the database now agree with each other
with new precision about a value chosen by whoever wrote the URL.

**Failure scenario.** Sarah is a coordinator. She follows a same-origin link:

`/{circle}/people/{danMemberId}?rs={nellSubjectId}&rd=finances&rl=manage`

1. `raiseSubject/raiseDomain/raiseLevel` all pass their set/shape checks, so the
   *Raise access* section renders (:238).
2. It says *"Raising access needs a fresh confirmation that it's you."* She
   types her password and submits to `/account/step-up/submit`, which takes
   `target_ref` from the form **unvalidated** (`route.ts:32`) and mints against
   `dan:nell:finances:manage`.
3. She is returned to `next` — the same crafted URL. `stepUpConfirms` now
   matches, so *Raise it* renders (:241–251). It says *"This raises what Dan can
   see."*
4. She clicks. `set_grant` composes the identical four parts, the token matches,
   and **Dan holds `manage` on Nell's finances.**

Two clicks and a password, and nothing on either screen said *finances* or
*manage*. Two amplifiers: `rs` need only be a subject **in the circle** —
`set_grant`:110–113 never asks whether the *actor* can see it — so the raise can
name a subject the page would never have listed for her; and the level may be
any of the five, on any of the five domains, for any non-`care_circle` member.

**Why the tests miss it.** They assert the section's **presence**, never its
words: `tests/routes/member-detail.test.ts` has exactly
`expect(html).toContain('Raise access')` and its negation, and nothing anywhere
asserts the level, domain or subject is rendered. The suite already reasons
about crafted links on this very surface — *"a crafted rs cannot smuggle a
marker into the posted next"* — but only for the marker-honesty harm from 7D
R3/F-3, never for the confirmation harm. The PPL-02 browser leg (by title:
*"adjust: a raise through step-up, a lower without; the care ceiling never
offered above (PPL-02, AC-PERM-5)"*) drives the **honest** path, where the
coordinator picked the level on the matrix herself a moment earlier — so the
missing words are invisible to it by construction.

**What would close it. NO DDL.** Render the four parts in the two panels that
ask for and spend the confirmation: the subject's name, `DOMAIN_LABEL[rd]` and
`LEVEL_WORD[rl]` — the vocabularies are already imported into this file — so the
password is asked for a sentence the coordinator can read, and *Raise it*
repeats it. Validating `target_ref`'s shape at the mint route is worth doing but
**does not fix this**: the crafted `target_ref` is perfectly well-formed. The
fix is display, not validation.

---

### F-2 — MAJOR — the one 071 case that carries the `STP-03:` label passes identically with M2 deleted

**Lens.** L3 — test discrimination. This is the round-18 class, and it is
mechanically proven rather than argued.
**Confidence.** High — executed, with the control in the same transaction.

**Where.** `supabase/tests/071_step_up_level.sql:176-177` (case 4), and
`:206-207` (case 10) by the same mechanism.

**Claim under test.** Case 4's own title: *"**STP-03**: a token minted to raise
health to SUMMARY does not consume against a post of MANAGE for the same
member:subject:domain — the level is the fourth part of what the definer
matches."* STP-03's coverage cell leads its evidence with `(071:4)`.

**What I found.** Case 4 does not test the level binding. It tests that a
**four-part token fails against a three-part composition** — which is true
whether or not M2's suffix exists. I removed only `|| ':' || p_level::text` from
`hc.set_grant`, inside `begin … rollback`, with the shipped body's answers taken
first in the same transaction:

| leg | shipped M2 | M2's suffix removed |
|---|---|---|
| case-4 equivalent — minted `…:health:summary`, **post `manage`** | `ERROR:P0001:grant_refused` | **`ERROR:P0001:grant_refused`** — identical |
| case-7 equivalent — minted `…:summary`, **post `summary`** | `summary` | `ERROR:P0001:grant_refused` — differs |

The transaction rolled back; `pg_get_functiondef` confirms the live
`hc.set_grant` still composes four parts. **Case 4 is green on evidence that
does not exist.** Case 10 (*"a token for VIEW cannot post MANAGE"*) is the same
shape: a four-part token against a three-part composition mismatches anyway.

The file as a whole still discriminates — cases **7**, **9** and **11** each
flip when the suffix is removed, and case 9 (the three-part token) is the real
proof that the binding was *replaced, not widened*. So STP-03 is not
unsupported. What is wrong is that **the assertion the row is named after, and
cited first, is the one that proves nothing**, and a reader auditing STP-03 by
following its first citation lands on it.

**Failure scenario.** A future change reverts or breaks the level suffix — a
refactor of the composition, a call site passing the wrong argument. Cases 4 and
10 stay green and keep their STP-03 titles. Only 7, 9 and 11 go red, and none of
them carries the row's name, so the triage reads as "three unrelated raise cases
failed" rather than "STP-03 has regressed".

**What would close it. NO DDL — test-only.** Move the `STP-03:` label onto a
case that discriminates (case 7 or 9), and make case 4 discriminate by minting a
token whose target_ref is the **three-part** `member:subject:health` *and*
posting `manage`: under M2 that refuses; with the suffix removed it **succeeds**,
which is the escalation the row exists to forbid. Re-order STP-03's evidence
citation to lead with 071:9.

---

### F-3 — MINOR — nothing pins the invariant FRZ-17 violated, so 9A's fix closes the instance and leaves the class open

**Lens.** L4 — the reasoning error, generalised. **FRZ-17 itself is ruled and is
not restated here**; this is about what the same reasoning reaches next.
**Confidence.** Medium-high. The enumeration is complete for migrations at this
head; the forward half is by construction.

**Where.** `supabase/migrations/20260903120001_task_claim.sql:114` — the header
comment *"the freeze is rung 2 and needs no name of its own"* — and the absence
of any assertion of the invariant it assumed.

**What I found.** I enumerated the `hc.visible_at` threshold at every write
definer in the tree. **Every one of them gates at `< 'manage'`** —
`approve_proposal`, `revise_object`, `share_object`, the arrival cancel,
`reclassify`/`recategorize`, `manual_entry`. `hc.claim_task` at `< 'view'` is
**the only write definer in the schema admitting below `manage`.**

That is the whole mechanism. FRZ-13's carve-out caps a non-objected-to
coordinator at exactly `'view'` (`20260815230009`:96–98), and every write
happened to require `manage`, so "read-only cap" was true **by coincidence of
thresholds, never by construction**. M1 introduced the first write at `view` and
the coincidence ended. The header comment is the moment that was assumed rather
than checked.

9A's M1 gives `claim_task` the explicit `state in ('open','unresolved')` test
its three siblings carry. That closes the instance. It does not record the
invariant — *no write definer may admit at or below the FRZ-13 cap without its
own freeze test* — anywhere a future increment would trip over.

**Failure scenario.** A later slice adds a write definer gated at `>= 'view'` —
entirely plausible; 8C already built `can_view` surfaces around exactly this
threshold — and routes its freeze through `visible_at` on the same reasoning.
FRZ-17 recurs, and once again no pgTAP file, no gate and no scanner sees it,
because the only guard in the tree is one hand-written `if` in one function.

**What would close it. NO DDL.** ADR-0026's own rule applies — *if it can be a
scanner, a manifest, or an exact-set assertion, it must be*. A catalog-driven
pgTAP assertion over `pg_proc`, in the same commit as 9A's M1: every `hc.*`
`SECURITY DEFINER` whose body contains `visible_at(` and a write statement must
also contain a `public.freezes` test — with the exact set of exempt functions
pinned, so adding one is a deliberate edit. That is test-only and fits inside
9A's existing M1 commit without touching the bound.

---

### F-4 — MINOR — M1's header claims two refusals 070 never constructs

**Lens.** L6 — predicate and vocabulary.
**Confidence.** High for the gap; deliberately low for the impact.

**Where.** `20260903120001_task_claim.sql:37-38` — *"a done **or deleted** or
nonexistent task"* — against `supabase/tests/070_task_claim.sql`.

**What I found.** `tasks.status` is `text ... check (status in
('open','done','cancelled'))` (`20260815230002`:122) and M1 refuses on
`v_task.status <> 'open'`, so `cancelled` refuses too — and is named nowhere in
M1's header or 070's contract. Conversely M1's header claims a **deleted** task
refuses, and 070 builds no soft-deleted task at all: the thirteen fixture rows
carry no `deleted_at`. The nearest case is `t_none`, a random uuid.

**Failure scenario.** Weak, and I say so rather than inflating it: both paths
run through predicates (`deleted_at is null`, `status <> 'open'`) that `t_done`
and `t_none` already exercise from the same two statements, so a regression
would very likely take a tested case with it. The exposure is a documentation
claim wider than its evidence, on a row whose freeze claim has **already** been
narrowed once by marker for exactly this reason.

**What would close it. NO DDL — test-only.** Two fixture rows and two cases in
070: a `cancelled` task and a soft-deleted one, each refused in the one shape;
or narrow M1's header to what 070 proves. TSK-05's cell already carries the
8C app-half evidence for `cancelled` over the rendered tree, so the pgTAP layer
is the only gap.

---

## Confirmations — checked, and clean

Named explicitly so silence is never ambiguous.

- **M2's byte-for-byte provenance** — the single-hunk diff above. The claim is
  true as written.
- **The replaced body restates every later ALTER.** Owner `hc_internal`,
  `search_path = ''`, EXECUTE revoked from `public, anon, hc_pipeline,
  hc_admin` and granted to `authenticated` alone — and 071:1–3 asserts it from
  the catalog, never by calling as a denied role. The PG17 ACL-segfault trap is
  respected in both test files.
- **The role graph holds no back door.** Only `hc_internal`, `hc_pipeline` and
  `hc_admin` exist; there is no `hc_runtime`; no request-path role is a member
  of a definer owner. `002_definer_invariants.sql` pins both `claim_task` (:69,
  :431) and `set_grant` (:183, :351) in its exact set with `authenticated`.
- **`hc_pipeline` has no path to a claim** — 070:3, catalog-based. AC-TASK-2
  holds.
- **M2's circle-unfiltered `access_grants` predicates are safe** — `unique
  (member_id, subject_id, domain)`, and the member and subject are both proven
  to sit in the target's circle before the read. No cross-circle or
  cross-subject match is reachable.
- **The `hidden`/insert/update three-arm write is exhaustive** against
  `v_before`, and the `hidden` arm deletes rather than storing a level, which is
  the tier-defaults representation GRT-01 describes.
- **Token consumption is last in the raise arm**, after the care ceiling and the
  freeze — so a ceiling refusal leaves the token unspent, which is what
  GRT-01's *"binds structurally even against a valid token"* requires, and 071:5
  proves the mismatch case.
- **A LOWER's freeze exemption is deliberate**, not an oversight: the freeze
  test sits inside `if p_level > v_before`, and `20260818120004`:24 records the
  ruling that a freeze *permits* lowers so an upheld finding can be executed.
- **M1's lock discipline is correct.** Discovery reads `circle_id` unlocked (a
  task never changes circles), then the advisory lock, then the row re-read
  `for update` and `hc.ctx()` evaluated **after** the lock, so a second claimant
  serialises and re-reads an owned row. 070:15 is the serial half.
- **Uppercase-uuid path is closed, and not by luck worth relying on.** `UUID_RE`
  is case-insensitive in both the page and the submit route, and Postgres
  renders `uuid::text` lowercase, so a crafted uppercase `rs` would compose a
  target the definer can never match. It never gets there: `rows.find(r =>
  r.member_id === memberId)` and `person.levels?.[subjectId]` are exact string
  comparisons against lowercase DB values, so the page 404s and the route
  refuses first. Fails closed — recorded because it is one identity comparison
  away from being an availability defect.
- **070's set-equality discipline is real.** Shares and instruction rows are
  snapshotted into temp tables and compared with `set_eq` before/after every
  path and once at the end (070:10–11, 23–24, 36–38), never as the absence of an
  INSERT. ADR-0040 D3 is honoured exactly as written.
- **070:28's instruction-row case discriminates** — `t_instr` is `open`, unowned
  and readable by Lena at `view`, so without `written_from_task_id is not null`
  the claim would succeed. Likewise 070:27 (`t_done`) and 070:31's eleven-way
  join outside the statement.

## Answers to ADR-0040's pointed questions

All seven were ruled at slice 8's close-out (ADR-0043). **A settled ruling is
not a finding**, so these are ratifications and one dissent, not defects.

- **Q-A** (the freeze unnamed on a claim, one shape through `visible_at`) —
  **ratified as ruled**, and the departure recorded at ADR-0040:5 is the right
  call: 070:34 shows view, manage and a stranger meeting one string. Note only
  that the *reason* the shape held is now known to be threshold coincidence, not
  design — see F-3.
- **Q-B** (*hers already* refuses rather than no-ops) — **ratified.** 070:13
  proves it, and the asymmetry with `set_grant`'s silent same-level no-op is
  justified: a no-op grant writes nothing, whereas a no-op claim would have to
  decide whether to re-stamp `assigned_at`.
- **Q-C** (`view`, not `summary`) — **ratified.** The claimant is the reader;
  070:16–20 drives it as ordered pairs, which is the strongest shape in either
  file.
- **Q-D** (the binding REPLACED, no compatibility arm) — **ratified, and it is
  the best-evidenced decision in M2.** 071:9 is the case that actually proves
  it, which is why F-2 recommends STP-03 cite it first.
- **Q-E** (case-55's tally measured at M1) — **not re-verified**; taken on
  trust, no opinion offered.
- **Q-F** (STP-03's app half flipped at the close-out) — **DISSENT, recorded as
  a dissent and not filed as a defect.** The evidence named in the cell —
  `member-detail.test.ts` 28/28, `people.test.ts` 16/16, the PPL-02 leg — proves
  the app *composes and confirms* the four parts. It does not prove the app
  *shows* them, and D6's "the same sentence" is the claim F-1 falsifies. The
  row's stated assertion is DB-shaped and stands; the app half's warrant is
  narrower than D6's words. Slice 9's disposition may prefer to amend the cell
  by marker rather than move the status word — the row was already green on its
  pgTAP half, so nothing turns on it.
- **Q-G** (`task_claimed` gets its own sentence in 8C) — **ratified**; 8C built
  it, out of this round's scope.

## Recorded dissents and observations

1. **`/account/step-up/submit` mints against an entirely unvalidated
   `target_ref`** (`route.ts:32`) with no check that the caller is a coordinator
   or that the string is well-formed. This is defensible — the authorization is
   `consume_step_up`'s exact match, and `lib/auth/step-up-cookie.ts` says
   plainly that the companion cookie *"is NOT a security control"* — and it is
   the honest posture. Recorded because it is the mechanism F-1 rides, and
   because the *next* consumer of §5.7 that needs a different target shape will
   inherit it.
2. **A raise token survives a same-level no-op.** `set_grant` returns
   `changed:false` before demanding anything, so a token bound to
   `member:subject:domain:level` stays live to its 5-minute expiry if that level
   is already held. The route never sends a token in that case, so nothing is
   burned and nothing is exposed; bounded by the four-part binding and the
   window. Not a defect — recorded so it is not re-derived as one.
3. **071 tests no freeze at all.** Justified — 038's raise cases were re-pinned
   in the same commit and carry it — but a reader auditing STP-03 from 071 alone
   will not find the `freeze_active` arm exercised anywhere in the file that the
   row cites.
4. **The `LEVEL_OPTION_WORD` map renders `hidden` as *Nothing*** on the matrix,
   and `isGrantLevel` accepts `hidden`, so a crafted `rl=hidden` renders the
   *Raise access* panel for what is actually a revocation. Harmless —
   `set_grant` refuses to charge a lower for a token and the definer decides —
   but it is the same missing-words surface as F-1, and one more reason the fix
   there is to name the level.

## The DDL verdict — stated, per ritual §4 item 7

**No finding in this round needs DDL.** F-1 is app-layer rendering, F-2 and F-4
are test-only, and F-3's closer is a catalog assertion that fits inside 9A's
existing M1 commit. **M2 — the slot reserved and NAMED for a DDL fix arising
from this pass — is NOT consumed by round 31**, and on these findings it should
close **UNCONSUMED**, leaving the bound at whatever 9A's M1 spends.

The one thing that would change that: if the disposition rules F-1's fix must
include a database-side guarantee rather than a rendering change — for instance
binding the token to something the coordinator demonstrably saw — that is a
different design and it would need the slot. **This review does not recommend
that.** The confirmation surface is where the defect is, and it is where the
repair belongs.

⏸ **STOP.** Nothing here is fixed, argued or merged. Dispositions are ADR-0044's,
in their own session.
