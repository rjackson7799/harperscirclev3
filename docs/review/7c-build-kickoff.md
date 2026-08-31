# Build — slice 7, increment 7C (Documents + People & roles, the sensitive-pair app increment), round 27

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md`. Invoke the
`slice` skill — leg: **build**. Only what is below is new.

## ENTRY CONDITION — round 26 (ADR-0006: an unanswered pointed question defaults to NOT PLANNED, and the build does not start)

7B merged at `e0a0a3c` (PR #31) with **round 26 UNRUN**. ADR-0035 carries
**eight pointed questions Q-A…Q-H with recommended answers**; two touch 7C
directly (Q-B: the auth forms' budget, recommended a ledger row homed C2;
Q-D: claim — no DDL exists and M6's window is closed, recommended slice 8).
Before a 7C line is written the owner **commissions round 26** (its kickoff
stands) or **rules the eight on the record** in a docs commit — TSK-03/04's
flips, the gate's disposition (Q-H) and RCP-01's rewrite (Q-F) included.

## STATE — settled, do not redo

- Branch `slice/7c-sensitive-pair`: create it from `origin/main` @
  **`e0a0a3c`** — PR #31, **7B merged 2026-08-31** (merge commit, parents
  `7d2d395` + `33cf5a3`); 74 migrations, 69 pgTAP files; evidence head
  `716cd49`, every commit past it docs-only.
- Rounds 24–25 CLOSED · round 26 as above · **7C's review is round 27** —
  `docs/coverage.md` already says 26/27.
- Tier **T1** (Q3, plan-gate ruled): the byte path, step-up, revocation and
  grants — full T1 closure set, the browser gate unconditional (D19.14).
- Bounds: migrations **NONE** (5 of ≤ 6 spent; M6's named window ACCEPTED,
  it closes UNCONSUMED; nothing under `supabase/` moves — claim's DDL would
  be a recorded owner amendment, not a reserve). Dependencies **0 runtime**
  (13/15 dev, reserve UNSPENT). `PROMPT_VERSION` hc-6b-3 does not move.
- Evidence at `e0a0a3c`: reset exact **74** · pgTAP **69, Σ 1,809** ·
  concurrency **82/82** · vitest **1168/90 by run** · the gate is **45
  legs** and was NOT claimed green at 7B's head (ADR-0035 D11: 43/45 twice,
  ZERO product failures, every miss a named host mechanism). New legs count
  against 45; `NODE_OPTIONS=--max-old-space-size=1536` is what keeps
  `next dev` alive on this host.
- Coverage flips here: DOC-01..05, PPL-01..05, **RCP-02** (every receipt
  link resolves, documents and profile facts included), A11Y-10/11, LOG-01/
  02's app halves, NAV-01's composition half. UXA-04 is **read at round 27**.
- `docs/owed.md`: OW-07, OW-16, OW-19 are TAKEN(7C/C2) — flipped
  `CLOSED(sha)` by the build; quota measured at close.
- NOT activated, unchanged: G4/G7 block · G9 OPEN · G3 open · band allowlist
  EMPTY · SIG-01 NOT absorbed · G12-01 pending (nav tier-awareness, C3).

## THE TASK

**C2's FENCE FIRST**: the byte path asserted before a viewer exists — ONE
consumer of `asServiceRole()`, no second route that returns bytes, pinned by
a fence test; then the viewer through `GET /api/artifact/[arrival]?page=N`
(+ `&text=1`, §6.9's exact label). Then **C1** Documents list, **C3** People
list + tier-aware nav, **C4** adjust/revoke/the honest limit, **C5** the
access log + the subject's page, **C6** legs, manifest, copy — the plan's
"### 7C" table, verbatim (`docs/review/slice-7-plan.md`).

The sensitive legs: the viewer page-by-page with the machine-read sibling ·
share behind step-up and unshare in one action, from the grantee's live
context · re-categorise naming the exact before/after audience ·
**revocation with a URL issued BEFORE the revoke** (fetch as Dan, revoke
Dan, re-fetch from his live context → the one 404) and §4.6.3's sentence in
those words · the plain line per subject from ONE module before any matrix,
which never offers above the care ceiling · the printable log filtered by
the reader's access · A11Y-10/11 built INTO the surfaces.

## WHERE TO PUSH HARDEST

1. **The byte path stays ONE path** — no viewer shortcut, no second
   `asServiceRole()` consumer, `private, no-store` on every 7C page.
2. **Revocation from the revoked member's LIVE context** — sessions, the
   pre-revocation URL, shares; what this slice does not reach, SAID.
3. **The sentence is true**: AC-PPL-1's plain line holds for reads, search,
   presence and the log, and is drawn not to promise notifications.

## SLICE-SPECIFIC TRAPS

- `tests/app/page-gate.test.ts` pins every gated file BOTH WAYS — each new
  page/route fails vitest until listed with its `unavailable` case; same for
  `AUDIT_MANIFEST` legs, and `tests/lint/answer-budget.test.ts`'s
  `RECORD_TREES` must gain the documents/people trees.
- A new input type must join the enumerated 44px CSS rule AND
  `tests/design/touch-targets.test.ts` (the `file`/`date` precedent).
- The `hc-step-up` cookie consumer pattern is the assign route's; the
  custodianship log rows CARRY `subject_id` (visible at `log`×5 — Q-E).
- Per-leg e2e budgets: record.spec 300 s, reject-all 420 s — budget
  provisioning-heavy specs in-file; the gate needs a REAL `node_modules`.

## ⏸ AT THE GATE, STOP

Next leg: the **round-27 review** (Tier 1 — full packet, fresh sessions),
owner sign-off, merge commit never squash. **STOP at the gate.**
