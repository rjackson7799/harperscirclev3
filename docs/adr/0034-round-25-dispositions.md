# ADR-0034 — round-25 dispositions: the forty-two round-24 rows, re-verified at `986ef6e` and PUT for ruling

**Status: RULED — OWNER SIGN-OFF 2026-08-30. All eleven ballot items
RATIFIED AS PUT** (the owner: *"proceed with best recommendation for the 11
ballot items"*).

The verdicts have moved in the commit that stamps this line. **All
forty-two `OWED` rows of ADR-0033** — D13's thirty-six, each cell rewritten
with a pointer to its section here, and the six R6 rows carried in D14's
cluster column, the original verdict struck and preserved — now read `FIXED`
at `986ef6e`.

The post-ruling tally was **re-derived from the rewritten table**, not
asserted from D12: D13 counts **36 FIXED · 0 OWED · 0 OWNER · 2 NOTED = 38**,
D14 carries the six R6 rows `FIXED` — **42 FIXED · 0 OWED · 0 OWNER ·
2 NOTED = 44**, the `OWED` class empty. D12's self-check is satisfied by
measurement rather than by intent. **ADR-0033 and the tree now agree.**

**Discharged with it:** ADR-0033 D20's *"it merges nothing"* — PR #26 may
merge once #27, #28 and this PR are in, in the owner's hands (`--no-ff`,
the SHA stamped back).

*(The paragraph below is the ballot as it was PUT, preserved unaltered.)*

~~**Status: PUT, NOT RULED.**~~ Proposed on evidence, awaiting owner sign-off.
**No verdict in ADR-0033 has moved** — the thirty-six `OWED` rows of D13 and
the six R6 rows ruled through D2–D7/D19 all still read `OWED`. They move in a
second commit, after sign-off, each carrying a pointer back here — the
ADR-0025 D6 precedent, as rounds 21, 22 and 23 did.

**Head:** `fix/round-24-m5` = **`986ef6e`** (PR #28), eleven commits past
`slice/7-destinations` = `2d5e1ae` (PR #26). **ADR-0033** = `a6bc1e0` (PR #27,
RULED 2026-08-29). **Branch:** `docs/round-25-reverification` — the fix head
with PR #27 merged in, so the ruling and the code it rules on sit on one
branch; it targets `slice/7-destinations` and contains #27 and #28.

---

## Context — the fix session, and why this round is same-day

ADR-0033 closed with **42 OWED · 0 OWNER · 2 NOTED · 0 FIXED = 44** and D20's
first sentence: *"It fixes nothing. All 42 `OWED` rows are unwritten."* The
build session of 2026-08-29/30 then wrote them — cluster A at `d7d5e63`, and
ten more commits through `986ef6e` — and, correctly, moved no verdict. So D13
now asserts `OWED` for forty-two rows the tree has fixed: ADR-0030's condition,
recurring on schedule. The remedy is the same as rounds 21–23: a round close
enough behind the work to rule while the evidence is one `git show` away.

Every fix is a function body in **M5** (`20260829120005_round24_m5_reads.sql`),
a test, or a document. **No schema DDL**; the 7A bound stays **4 of ≤ 6**.
Two functions were re-created because their *signature* moved
(`recategorize_document` gained `p_expected_category`, the 2-argument form
dropped; `document_audience` gained a sixth column), three were added
(`document_taint_walk_under`, `document_audience_derived`,
`member_levels_frozen`) — all under D20's *"satisfiable in a function body"*,
recorded here so the next lens does not re-derive them as DDL.

---

## D1 — how the re-verification was done

As rounds 21–23 did: **the property each finding asserts, at its site, in the
code at `986ef6e` — never the commit message claiming a fix.** Every row below
names its site as an M5 `file:line` at the head, the assertion that pins it by
test number, and the RED the session observed *before* the body was applied
and the GREEN after. Both were measured on the live stack, teed; the logs and
both gate runs' `test-results/` are preserved vault-side
(`projects/harpers-circle/04-evidence/round-24-gate-986ef6e/`).

One thing said plainly: **this ADR was written by the build session itself.**
The sites were re-read at the head by `grep -n` against the committed files,
not recalled; the RED/GREEN figures are copied from the teed logs, not from
memory. It is still the author checking the author's work. D14 asks the owner
to treat the ballot accordingly and the next lens to re-drive D3's list.

The tally instrument is mechanical: D13's Verdict column counted at `a6bc1e0`
gives **36 `OWED` + 2 `NOTED` = 38** in-house rows; the six R6 rows carry
their verdicts in D2–D7's `PROPOSED` lines and D19, all `OWED` at sign-off —
**42 OWED · 2 NOTED = 44**, which is D17's published figure. It is run again
against the rewritten table in the sign-off commit.

**Closure evidence at `986ef6e`** (D19.14's gate included): clean-leg reset
**74 migrations exact** · pgTAP **69 files PASS**, Σ plan(N) = 1,809 ·
concurrency **82/82** (54 cases; cases 52 and 51 rebuilt, 54 new) · vitest
**982 / 79** · browser gate **run 1: 31/38** — seven `Test timeout of 120000ms
exceeded` on `page.goto`/`waitForURL`, no product assertion failed, host free
memory 0.09 GB of 7.74, classified infrastructure from the retained traces —
**run 2: 38/38** in 14.9 min, each of the seven passing in 14 s–1.2 m · CI
`checks` green at the head.

---

## D2 — Cluster A: existence disclosed at `hidden` by the M4 reads (`d7d5e63`)

| Row | Property | Site at `986ef6e` | Pin | RED → GREEN |
|---|---|---|---|---|
| **R4/F-1** BLOCKER, **R1/F-1**, **R6/F-1** | `document_references` emits no row below `log` | M5 `:85` `where x.level >= 'log'` | 069:18 (task vanishes, fact counted-unnamed, event named), 069:20 (zero rows for the share-holder) | M5 applied, tests untouched → 069:18/:20 **RED**; rewritten → 29/29 |
| **R4/F-2** | `shares_for_member` takes the floor for every reader but the holder herself (D19.9) | M5 `:194` `(v_self or coalesce(x.level,'hidden') >= 'log')` | 069:28 (holder keeps her row, rationale corrected), 069:29 new (same list, two callers, two strings) | same run |
| **R4/F-5** | `shares_for` excludes a removed member (D19.12) | M5 `:134` `m.removed_at is null` | 069 green; 002 20/20 | same run |

**PROPOSED: R4/F-1, R1/F-1, R6/F-1, R4/F-2, R4/F-5 `OWED` → `FIXED`.**

---

## D3 — Cluster B: a coordinator's KEPT share survives the task's next cycles (`78d366f`)

| Row | Property | Site | Pin | RED → GREEN |
|---|---|---|---|---|
| **R1/F-2**, **R2/F-1**, **R6/F-2** | both revoke loops keyed on the former holder — `and sh.member_id = v_former` | M5 `:423` (reassign), `:683` (unassign) | 066:53–60 — cycles to Ruth, Dan, Ruth again; the kept share survives 55/56/58, is absent from the log and reaches Lena's context 57; **066:60 pins the consequence**: her own next cycle ends it | 066 **56/60**, RED at exactly 55–58 (`55 have Ruth/1/false` …) → 60/60 |
| same | harness case 52(b) proves the sequence with a **second person** | `run.mjs:3222`, Ruth at `:3277` | case 52b | **1/2** with `shares=document:false,document:false,task:false,task:false` — the string the old assertion *expected* → 2/2 |
| **R3/F-2** | 066:30/:40's document half is the share's | 066 path-2 sites name the POA (`{documents}`, no grant) | 066:30 `1/1/1/financial,legal,medical`, 066:40 | old 066 with the kept share revoked by hand → 40 **still passed** `0/1`; new 066, same injection → `0/0` |

**Recorded, not ruled.** D3 of ADR-0033 called 52(b)'s by-hand revoke *"the
exact state that exposes the defect"* — true for R6's marker-clearing remedy;
under the ruled (R1) remedy the same-member cycle revokes a kept share either
way, so 52(b) needed a second person to discriminate. R2's own text
(`findings:346`) had noted it.

**PROPOSED: R1/F-2, R2/F-1, R3/F-2, R6/F-2 `OWED` → `FIXED`.**

---

## D4 — Cluster C: the guards, and "the ORIGINAL is the work" (`7e4790d`)

| Row | Property | Site | Pin | RED → GREEN |
|---|---|---|---|---|
| **R2/F-4**, **R6/F-6** | an instruction row is never `p_task` to assign or unassign | M5 `:300` (assign), `:611` (unassign) | 066:62, 066:63 | `have {"path":"plain",…}` → `assign_refused` |
| **R1/F-4**, **R2/F-5** | D19.4: completing an original cancels its instructions; completing an instruction completes the original with the instruction's actor | M5 `:834–` (complete_task's bridge), `:842` | 066:64 `done/1/cancelled`, 066:65 `done/true/done/true`, 066:66 two entries, the original's naming the instruction | `have NULL` (no `instructions_closed`/`original_task_id`) → green |
| **R2/F-7** | D19.6: completion revokes the assignment's shares | same body, the revoke loop keyed as cluster B | 066:69 `done/2/0/2` | `have NULL` → green |
| **R6/F-5**, **R2/F-10** | D19.2: `revoke_share` refuses a live assignment's share; a kept one stays revocable | M5 `:993` | 066:68 `revoke_refused` with the share standing; 066:70–71 the kept share revoked | `have {"share_id":…}` (the revoke succeeded) → green |
| **R2/F-8** | the original's open instructions close on every assignment | M5 `:436` (the loop left `if v_former is not null`) | 066:72 `plain/1/cancelled` after `remove_member`'s effect by hand | `have NULL` → green |
| **R3/F-5** (test only) | the post-condition's second arm and the assignee shapes are driven | — | 066:73–74 (unresolved lineage: refused, token unconsumed, no share), 066:75 (subject-member row, removed member) | pins; green both ways |

R1/F-3's parts (b) and (c) are these rows; part (a) is D7.

**PROPOSED: R2/F-4, R6/F-6, R1/F-4, R2/F-5, R2/F-7, R6/F-5, R2/F-10, R2/F-8, R3/F-5 `OWED` → `FIXED`.**

---

## D5 — Cluster E: the freeze is named to MEMBERS (`4f9fde3`)

| Row | Property | Site | Pin | RED → GREEN |
|---|---|---|---|---|
| **R1/F-6**, **R2/F-3** | a live-membership-in-this-circle check precedes `freeze_active` in all four writers (`set_grant`'s order) | M5 `:315` (assign), `:808` (complete), `:1104` (snooze), `:1227` (recategorize) | 066:76 (a stranger and a removed member, existing and nonexistent: one shape), 066:77 (a member still meets `freeze_active`), 067:31–32, 068:30 | 066 `have freeze_active/freeze_active/assign_refused` · 067 `have freeze_active/complete_refused/complete_refused` · 068 `have freeze_active/recategorize_refused` — each `have` *is* the two-shape oracle → all green |

**Residual, recorded in M5's header, not a row:** a live *member* holding
nothing on the object still meets `freeze_active` for an existing id and the
generic refusal for a nonexistent one (R1/F-6's probe P2a). Under a freeze
`hc.visible_at` is hidden for everyone, so the object-level authorisation
cannot precede the freeze without ignoring it; the ruling took `set_grant`'s
shape, whose authorisation is membership and tier. The owner may want a
sentence on it in a later round.

**PROPOSED: R1/F-6, R2/F-3 `OWED` → `FIXED`.**

---

## D6 — Clusters D and G: the objected-to member; the no-context gate (`9fbbba4`)

| Row | Property | Site | Pin | RED → GREEN |
|---|---|---|---|---|
| **R1/F-5** (D19.1, R6's Q-F) | the member any open/unresolved freeze names as `objected_to` is refused by `unassign_task` and `revoke_share`; others still reduce | M5 `:614`, `:970` | 066:78–81 (Priya refused twice, Sarah permitted twice) | `have {"task_id":…,"former_owner_name":"Ruth"…}` and a successful revoke → green |
| **R3/F-1**, **R6/F-4** (D19.7) | "context on the subject" = at least one deliberate `log`-or-higher grant, asked of the assignee's ladder | M5 `:354` | 066:82 (Omar, path 2, refused), 066:83 (nothing written; `circle_people` hidden ×5 agrees with the database), 066:84 (one `log` grant is context — the control) | `have {"path":"share",…,"share_ids":[…]}` → green |

D19.1 names `remove_member` only as the owner's observation; it is untouched.

**PROPOSED: R1/F-5, R3/F-1, R6/F-4 `OWED` → `FIXED`.**

---

## D7 — The M3 audience cluster: F, D19.3, D19.5, D19.10 (`21fa51b`)

| Row | Property | Site | Pin | RED → GREEN |
|---|---|---|---|---|
| **R2/F-2**, **R6/F-3** (cluster F) | the BEFORE flag is kept apart from the after flag | M5 `:1275` `v_resolved_before := v_doc.taint_resolved` | 068:38–39 — an unresolved move: lost **empty**, gained Lena,Ruth, `audience_before` Kim,Sarah | probe on the old bodies: `have Dan,Priya/Lena,Ruth/Kim,Sarah` — three people "lost" a document the same entry says they never had → green |
| **R2/F-6** (D19.5) | the preview binds the move: `p_expected_category`, `document_changed` after the gate; the 2-arg form dropped | M5 `:1259`; the `drop function` above it | 068:35 (stale category refused, nothing moves); 068:2 re-pinned; harness case 51 (`run.mjs:3186/:3191`) — the racing coordinator's confirmation refused, never folded into a no-op | the edited 068 on the old bodies: every 3-arg call `42883` — the honest shape of a signature move; case 51 was a RUNNER ERROR until moved → 39/39, 82/82 |
| **R4/F-3** (D19.10) | below coordinator, only gained/lost: both levels NULL, `change` carries the direction | M5 `:1542` `v_coord`, the sixth column | 068:33 `Priya:NULL>NULL:lost` for Dan; 068:34 the same fact with levels for Sarah | `42703 column a.change does not exist` → green |
| **R1/F-3** (a, D19.3; b and c in D4) | the preview and the entry NAME the derived objects whose holders change level | M5 `:1424` `document_taint_walk_under`, `:1574` `document_audience_derived`, `:1375`/`:1383` `derived` in the entry and the return | 068:32 `task:Book the first physio session:Dan:manage>hidden:lost`; 068:36–37 the move's return and entry name it, and Dan's next query shows him 0 of a task he still holds (R1/F-3's C5, on the record) | `42883 document_audience_derived does not exist` → green |

**PROPOSED: R2/F-2, R6/F-3, R2/F-6, R4/F-3, R1/F-3 `OWED` → `FIXED`.**

---

## D8 — The M4 cluster: D19.8, D19.11 (`fce1258`)

| Row | Property | Site | Pin | RED → GREEN |
|---|---|---|---|---|
| **R3/F-7** (D19.8) | outstanding invites are ABSENT under any freeze; 069:15's `kind <> 'invite'` exclusion gone | M5 `:1769` `and not v_frozen` | 069:15 `9/9/0` | `have 11/11/2` (the two invites listed *pending* under the freeze) → green |
| **R4/F-4** (D19.11) | levels frozen PER SUBJECT: a narrowed finding blanks that subject alone | M5 `:1742`/`:1753` `member_levels_frozen`; 007 re-pinned at nineteen (`986ef6e`) | 069:30 `manage/NULL/7/7`, 069:31 `0/true/true` | `have NULL` (every level blanked) → green |

**PROPOSED: R3/F-7, R4/F-4 `OWED` → `FIXED`.**

---

## D9 — The test-only rows (`cae8d4c`)

| Row | What the suite now does | Pin |
|---|---|---|
| **R3/F-3** | `unassign_task`'s manage bar has its negatives — the holder at view and a sibling at summary refused | 066:85 |
| **R3/F-4** | the four `f(a)::text \|\| f(b)::text` composites are two `call_as` results joined outside the statement, expecting the refusal twice | 066:47, 066:49, 067:28, 068:27 |
| **R3/F-6** | 068:16 also reads `search_text_full is not null and tsv_full is not null` after the move — the rebuild, not the policy's row | 068:16 |
| **R3/F-8** | 001's event-type pin is the exact 27-element set (the 002 pattern) | 001:251 |

Pins of standing behaviour, green on first run as pins are; each now goes red
for the removal R3 drove by hand. **PROPOSED: R3/F-3, R3/F-4, R3/F-6, R3/F-8
`OWED` → `FIXED`.**

---

## D10 — R2/F-9: the race the lens could not observe, observed (`0bab2ea`)

Site M5 `:498` — the two path-2 inserts in an exception block, `unique_violation`
→ `assign_refused`, the whole call (token burn included) rolled back. Pin:
harness **case 54** (`run.mjs:3352`): S2 shares through `share_object` and holds
the transaction; S1 assigns by path 2 and blocks on `object_shares_live`; S2
commits. RED: `err=23505:duplicate key value violates unique constraint
"object_shares_live"` — the mechanism R2 rated medium-confidence, *"not
observed"*. GREEN: `assign_refused`, owner null, Lena's one share is S2's, no
entry, one token burnt. **PROPOSED: R2/F-9 `OWED` → `FIXED`.**

---

## D11 — The docs rows (`ca29fc3`)

| Row | Corrected at | To |
|---|---|---|
| **R5/F-1** | ADR-0032 D4 `:80`; packet `:114` | the freeze pair is **066:51–52**; the unassign-under-freeze leg is 52 |
| **R5/F-3** | packet `:116`, `:125–126`, `:175` | five `->>` errors; six pins / nineteen re-pin events, "001 twice"; `supabase/tests ×7` |
| **R5/F-4** | `round-24-pr-body.md:14` **and PR #26's live body** | the two counted-never-named reads named; `shares_for` described as it is |
| **R5/F-6** | packet `:252` | **five** already existed (SHR-02, RCP-02, A11Y-09/10/11); 26 − 5 = 21 |
| **R4/F-6** (D19.13) | M4 header (comment only) and ADR-0032 D7 | `accounts.slice` declared **as a widening**, intended (§4.6.1) |
| **R5/F-5** (D19.15) | ADR-0032 `:9` | the Q2 table *"as ruled"*, D6's shared gate ratified |
| **R5/F-2** (D19.14) | `slice.md` step 6; the slice skill's `packet.md`; kickoff `:60` marked superseded on one line (90-line cap kept, `process.test.ts` 29/29) | **the gate is unconditional for Tier 1** — and it ran (D1) |

**PROPOSED: R5/F-1, R5/F-3, R5/F-4, R5/F-6, R4/F-6, R5/F-5, R5/F-2 `OWED` → `FIXED`.**

---

## D12 — the tally, re-derived

Counted mechanically over ADR-0033's rows at `a6bc1e0` — D13's Verdict column
(36 `OWED`, 2 `NOTED`) plus the six R6 rows ruled `OWED` through D2–D7/D19 —
never carried forward from D17:

**Before this round:** `OWED 42 · OWNER 0 · NOTED 2 · FIXED 0 = 44`

**After D2–D11:** `OWED 0 · OWNER 0 · NOTED 2 · FIXED 42 = 44`

**Self-check:** D2 5 + D3 4 + D4 9 + D5 2 + D6 3 + D7 5 + D8 2 + D9 4 + D10 1 +
D11 7 = **42**; the residual `OWED` set must be **EMPTY**; the two `NOTED` rows
(R3/F-9, R5/F-7) must not move; any member left in `OWED` means a ruling went
astray and D12 is re-derived rather than adjusted.

---

## D13 — what does NOT move

No coverage row flips (ADR-0025 S16.7) · no `pending` row moves · **NO
schema DDL**, migrations **74 exact**, bound **4 of ≤ 6** · ADR-0023 closed at
0 `OWED` and untouched · the two `NOTED` rows · **nothing is
production-activated**. Three residuals are **recorded, not rows**: cluster
E's member-with-nothing two-shape (D5); D19.1's `remove_member` observation
(D6); cluster B's same-person consequence, pinned at 066:60 for the owner to
see (D3).

**Recorded corrections to ADR-0033's own text**, for the next lens: D3's
52(b) sentence (D3 above); D16's function-body row predates D19 and omits the
rulings it unblocked, two of which are signature moves; R2/F-6's harness
consequence (case 51) was unnamed; 007's freeze-referent pin is not in D16's
test list and caught D and M4 in CI.

---

## D14 — the ballot

1. **Cluster A** — R4/F-1, R1/F-1, R6/F-1, R4/F-2, R4/F-5 `OWED` → `FIXED` (D2).
2. **Cluster B** — R1/F-2, R2/F-1, R3/F-2, R6/F-2 → `FIXED` (D3), with the
   52(b) correction recorded.
3. **Cluster C** — R2/F-4, R6/F-6, R1/F-4, R2/F-5, R2/F-7, R6/F-5, R2/F-10,
   R2/F-8, R3/F-5 → `FIXED` (D4).
4. **Cluster E** — R1/F-6, R2/F-3 → `FIXED` (D5), the P2a residual recorded.
5. **Clusters D and G** — R1/F-5, R3/F-1, R6/F-4 → `FIXED` (D6).
6. **The M3 audience cluster** — R2/F-2, R6/F-3, R2/F-6, R4/F-3, R1/F-3 →
   `FIXED` (D7), the two signature moves ratified as "function body" under D20.
7. **The M4 cluster** — R3/F-7, R4/F-4 → `FIXED` (D8).
8. **The test-only rows** — R3/F-3, R3/F-4, R3/F-6, R3/F-8 → `FIXED` (D9).
9. **R2/F-9** → `FIXED` (D10).
10. **The docs rows** — R5/F-1, R5/F-3, R5/F-4, R5/F-6, R4/F-6, R5/F-5, R5/F-2
    → `FIXED` (D11), the gate having run (D1).
11. **The re-derived tally** (D12) as the record's new arithmetic — an `OWED`
    class of zero — and D20's *"it merges nothing"* discharged: PR #26 may
    merge once #27, #28 and this PR are in.

On sign-off a second commit rewrites all forty-two verdicts in ADR-0033 —
D13's thirty-six rows and the six R6 `PROPOSED` lines — each to
`**FIXED** (ADR-0034 Dn, \`986ef6e\`)`, and re-runs the mechanical count. If
any item is not accepted its rows stay `OWED` and D12 is re-derived rather
than adjusted.
