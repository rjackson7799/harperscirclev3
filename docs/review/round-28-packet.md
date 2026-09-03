# Third-party review packet — round 28: the built slice 8A, claim + the level-bound step-up, the database increment

**Read this file first, top to bottom.** The head ledger is at the top by
design, the tree binding is stated per directory and was measured by command,
and every evidence leg below was produced at ONE declared head. **A packet
cannot name its own SHA**, so the last row of the ledger is a RULE, checkable
at any future head. **The spine of this packet is
`docs/adr/0040-8a-claim-db-deltas.md`** — the deltas ADR (`Status:
proposed`), whose D1–D9 carry the build's full argument. This packet states
the evidence exactly and puts the seven pointed questions to the round.

**SETTLED, except what this packet puts.** The slice-8 plan is RULED (Q1–Q7,
2026-09-02): the tier is **T1** (Q1); the migration bound is **≤ 4** with M1
and M2 planned, M3 reserved for this round's dispositions and M4 reserved and
NAMED (Q2); **M2 is the consumed reserve** — ADR-0038 D6 item 2 TAKEN, its
ruling quoted in `05faed4` (Q3(a)); **`hc.claim_task` requires `view`**,
refuses an owned task, and creates no share and no instruction (Q2 —
*"summary-may-claim and zero-DDL are rejected"*); the thirteen coverage rows
and the ledger's seven exits are the plan's consequence 2, applied by the
build's FIRST commit; the browser gate is unconditional (ADR-0033 D19.14).
Rounds 24–27 are CLOSED (ADR-0033/0034/0036/0038). None of that is open
here. A settled ruling is not a finding — file a dissent.

---

## Head ledger — from the start

| Purpose | SHA | Tree relationship |
|---|---|---|
| Base | `ccb4804` | `origin/main` — PR #39 (`chore/preflight-dev-lock`, the Q7 precondition), one Tier-3 merge past the plan's `d583f0c`; `supabase/`, `lib/`, `app/`, `e2e/` byte-identical to the `bb40021` evidence head |
| Evidence head | `4d166c0` | **the last commit that moved a non-docs tree** — the red→green pairs for M1, M2 and M2's app half, the concurrency case, the docs-only intake commit that precedes them all |
| Docs head | every commit after `4d166c0` | ADR-0040, `docs/coverage.md` (the close-out flip), this packet, the PR body, the round kickoff — **docs-only, by the rule below** |

**The rule that replaces a SHA:** every commit after the evidence head is
docs-only. Verify it — do not take it:

```
git diff --name-only 4d166c0..HEAD -- . ':(exclude)docs'
```

returning **empty**. Per-directory tree binding, measured with
`git rev-parse <sha>^{tree}:<dir>`: **base → evidence head**, `supabase/`
moved (two migrations, two pgTAP files, four re-pinned pgTAP files),
`scripts/` moved (`concurrency/run.mjs`: case 55, cases 29/31 re-pinned),
`app/` moved (two files under `people/[member]`), `lib/` moved (one
docstring), `tests/` moved (`hc/people`, `routes/member-detail`,
`routes/document-detail`); **`e2e/`, `components/` byte-identical to base**
— no leg was added or changed, the gate's 58 are the 58 the base had.

**Documents that moved BEFORE the evidence head and are part of the
evidence tree:** `docs/review/8a-build-kickoff.md` (`cb1505d`),
`docs/coverage.md` § 8 and `docs/owed.md` (`4bdbdbd` — the ruled intake,
thirteen rows `pending`, OPEN 7 → 0 / 25). **After it:**
`docs/adr/0040-8a-claim-db-deltas.md` (new), `docs/coverage.md` (the flip:
TSK-05, STP-03; three amendment markers), `docs/review/round-28-packet.md`,
`docs/review/round-28-pr-body.md`, `docs/review/round-28-kickoff.md`.

---

## What 8A is

The database half of slice 8 — the two things the record could not yet do:
**take a task for yourself** (PRD §4.5.1's *"Claims"*, owed since ADR-0032 D8
recorded that 7A failed closed and ADR-0036 Q-D ruled it here), and **bind
the level into the step-up** (ADR-0038 D6 item 2, round-27 R3's dissent 1:
*"a token minted to raise Ruth's health to summary will consume against a
post of manage for the same triple"*). One function added, one function
body replaced, one event type, one composition at the mint site. Search —
the slice's other half — is 8B's and touches nothing here.

- **M1 `hc.claim_task(p_task)`** — one argument; the caller takes an
  unassigned, open task for herself at `>= view` through `hc.visible_at` on
  her OWN vectors, as the task STANDS; owned (even hers), `summary`, a
  non-reader, done, an instruction row, a stranger and a **frozen circle**
  refused in ONE shape; the three assignment columns written; `task_claimed`
  logged with the claimant as actor; no share, no instruction, no row — as
  set equality; the AI has no path. (ADR-0040 D1–D4.)
- **M2 `hc.set_grant`** — `target_ref` composed as
  `member:subject:domain:level`; the mint site composes the same four parts;
  the pre-8A three-part token is refused, not tolerated; the refused token
  is left unconsumed. (D5–D6.)
- **The ruled intake, FIRST and docs-only** — coverage § 8's thirteen rows
  opened `pending`; `docs/owed.md` OPEN 7 → **0 / 25** by OW-26
  `TAKEN(8C/unit 2)` and six `PROMOTED` exits, each quoting its ruling.

---

## The commits (red → green per unit, the signature in every red)

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| the kickoff · the ruled intake (docs-only) | — | `cb1505d` · `4bdbdbd` | `process.test.ts` 29/29 — thirteen rows found, OPEN 0 agrees with the table |
| M1 `task_claim` (070) | `63558eb` | `0e780f8` | 28 of 40: `42883 function hc.claim_task(unknown) does not exist` ×19; catalog cases false on zero rows; `task_claimed` absent; 001/002 re-pinned in the green |
| concurrency 55 | — | `24d6271` | teed, 83/83 — on the M1-only database (ADR-0040 D8 fact 1) |
| M2 `step_up_level_binding` (071) | `7f8a332` | `05faed4` | 4 of 14: case 7 `have: grant_refused / want: summary`; case 9 `have: view / want: grant_refused` — the pre-8A shape STILL RAISED; 038/041/harness/people.test re-pinned in the green, the Q3(a) ruling quoted |
| M2's app half — the mint site | `8a81b22` | `4d166c0` | 2 of 28: the page's hidden `target_ref` three parts; the route bouncing a four-part-bound token (`setGrant` never called) |

---

## The deltas — ADR-0040 D1–D9, the spine

**D1** the claim sits at `view`, on the claimant's OWN vectors, as the task
STANDS — a caregiver meets rung 4 exactly as `tasks_select` puts it to her;
the level decides, not the person (070's pairs) · **D2** refusals are ONE
shape, the freeze INCLUDED — a ruled departure from `assign_task` and
`complete_task`, which name `freeze_active` to members (**Q-A**) · **D3** no
share, no instruction, no row — SET EQUALITY against snapshots after every
path, never the absence of an insert · **D4** a claimed task is a HANDED
task to every other writer; `task_claimed` is its own event; *hers already*
refuses (**Q-B**) · **D5** the level is the fourth part and the binding is
REPLACED, not widened; the refused token stays unconsumed (**Q-D**) · **D6**
the mint site composes the same four parts; `rs/rd/rl` unchanged; the
PPL-02 leg drives it inside the gate (**Q-F**) · **D7** the re-pins, all
same-commit (001 +1, 002 ×3, 038 ×5, 041, harness 29/31, `people.test`;
036 checked and UNCHANGED) · **D8** the bound at 2 of ≤ 4, the regression
net, four environment facts (**Q-E**) · **D9** narrowings: TSK-05's app and
e2e halves are 8C's; STP-03's app half built and recorded, not flipped;
`task_claimed` renders generically until 8C words it (**Q-G**).

---

## Verification evidence (local, ONE declared head: `4d166c0`)

Complete summary lines, no grep-filtered chains. Tallies read from output
text and the JSON records, never from `$?` (traps §4). Every stack command
ran through `scripts/preflight.mjs` (`VERDICT: SAFE` after the one
acknowledge per commit).

- **Clean-leg reset exact 76** — `verify-migration-state`: *76 applied ==
  supabase/migrations*.
- **pgTAP 71 files, Σ 1,863, PASS** (`Files=71, Tests=1863 … Result:
  PASS`, 16 s) — 1,809 + 070's 40 + 071's 14.
- **Concurrency 83/83** across 55 cases, teed — case 1's `40P01`s are
  PLT-02's deliberate repro; case 55 is this increment's.
- **`db:verify --fail-on warning`: clean** — *No schema errors found* —
  the first run since 7A.
- **The upgrade leg: green** — a detached worktree at base `ccb4804`, reset
  to exact **74**, `supabase migration up` from this tree to exact **76**,
  then **1,863 PASS and 83/83 on the UPGRADED database** — the first run
  since 7A.
- **vitest 1439 across 101 files** (`.vitest/run.json`, by run).
- **lint solo exit 0 · typecheck solo exit 0 · production build solo
  exit 0 — 78 routes, compiled in 21.4 s.**
- **gitleaks** (the CI-identical digest-pinned container, from the primary
  repo): **651 commits scanned, no leaks found**.
- **The browser gate: 58/58 in 8 files, 1,284 s — 0 unexpected · 0 flaky · 0 skipped** — `.gate/e2e-run.json`, config-borne, a bare
  `playwright test` through the preflight runner, no CLI override; the
  runner rotated the previous record aside first (PR #39). Unconditional
  for Tier 1; the 58 legs are the base's 58 — `e2e/` is byte-identical.
  Host at launch: 241 MiB before preflight, 0.49 GiB at preflight's own read — BELOW the floor, and the run completed regardless free against the 1.2 GiB floor (Q7's WARN),
  `hc_clamd` started fresh ~60 s before launch, idle at 0.01 % CPU / 1.0 GiB, no reload line in 20 m.
- **Owed:** **OPEN 0 / 25** · TAKEN 2 (OW-05's standing quota, OW-26 to
  8C) · RISK 1 (LOG-03) · CLOSED 17 · PROMOTED 6 · 26 rows; the re-tally
  mechanical (`tests/lint/process.test.ts` inside the vitest run).
- **Artifacts, session-side:** the teed logs for every leg (`closure-*.log`,
  the two harness runs, the RED/GREEN single-file pgTAP runs) in the
  session scratchpad; `.gate/e2e-run.json` and `test-results/` on the host
  until the next Playwright run, a peer's included — copy before re-running.

---

## Coverage rows — counted by command, not by eye

**`docs/coverage.md`: 280 rows · green 252 · review 9 · pending 19** (the process test's own parser, run at the
docs head). Base `ccb4804`: 267 rows · green 250 · review 9 · pending 8.

- **Thirteen rows opened `pending` at `4bdbdbd`** (the plan's consequence
  2), before M1 — TSK-05, STP-03, SRCH-03..06, A11Y-12, LOG-04, GRP-01,
  DEP-01, EXE-01, EXE-02, BND-01.
- **Two rows flip at this head, at the pgTAP layer only:** TSK-05 (app and
  e2e halves owed to 8C) and STP-03 (its app half built, recorded, not
  claimed — Q-F). Eleven stay `pending` exactly as opened.
- **Three rows amended, never rewritten:** GRT-01, STP-01, STP-02 carry a
  marker that the raise binding is four parts since M2; their 2A wording
  stands.
- **No row flips outside a ruling; pending never counts as green.** LOG-03
  never green (OW-04's `RISK`); G12-01 `pending` at `gate`.

---

## Pointed questions for round 28 (recommended answers inline — an unanswered question defaults to NOT PLANNED)

**Q-A · The freeze is UNNAMED on a claim.** `assign_task` and
`complete_task` raise `freeze_active` to members (ADR-0032 D4, ADR-0033
cluster E); `claim_task` refuses under a freeze in the ONE shape, through
`hc.visible_at` rung 2 alone (070:32–35). The plan's row M1 says *"refused
under freeze through the same one function"* and the kickoff *"a frozen
circle in ONE shape"*. **Recommended: ACCEPT as ruled**; 8C's surface says
the freeze from `hc.circle_people`'s `frozen`, not from the refusal.

**Q-B · *Hers already* REFUSES rather than no-ops.** `set_grant` and
`assign_task` absorb a same-state call silently (`changed: false`);
`claim_task` refuses any owned task, its holder's included (070:13). The
plan: *"refused if owner_member_id is not null"*. **Recommended: ACCEPT** —
a claim is a transition from nobody's, and 8C offers the control only on an
unassigned task, so the case is a hand-built request.

**Q-C · A caregiver claims a task shared to her BY NAME** (070:22, 25):
rung 5 gives `view`, and view claims. She could already read it, the share
was a coordinator's explicit act, and the claim creates no second share.
**Recommended: ACCEPT** — it is the plan's rule applied, not an extension.

**Q-D · The binding is REPLACED, with no compatibility arm.** A three-part
token is refused outright (071:9). **Recommended: ACCEPT** — nothing is
production-activated, so no in-flight token exists; a compatibility arm
would be the oracle R3 described, kept.

**Q-E · Two harness tallies.** The case-55 commit records 83/83 measured on
the M1-only database (cases 29/31 still minting three-part targets); the
closure re-ran 83/83 at the head with the four-part targets, twice (clean
leg and upgraded). **Recommended: ACCEPT the head's runs as the record**;
the commit's tally is true of the tree it ran against.

**Q-F · STP-03's app half.** The row is `pgTAP + app`. The app half is
BUILT (the mint site, `tests/routes/member-detail.test.ts` 28/28,
`tests/hc/people.test.ts` live) and the PPL-02 leg drove a raise through
it inside the complete gate at this head. The kickoff says *"flipped at the
pgTAP layer only, never early"*, so the cell records the app half and does
not claim it. **Recommended: rule the app half green on the leg inside the
complete run** — or say what more it needs.

**Q-G · `task_claimed` has no bespoke sentence yet.** The access-log page
renders event types generically; 8C words the claim's sentence with the
claim's surface. **Recommended: ACCEPT** — the entry is complete in the
database (actor, target, object, subject); the wording is the surface's.

---

## What is NOT claimed

- A claim SURFACE, a claim leg, and the log's sentence for it — 8C
  (`slice/8c-claim-log-app`, round 30). TSK-05 is green at the pgTAP layer
  only.
- STP-03's app half as the row's flip — built, driven, recorded; Q-F.
- Search — every SRCH row, A11Y-12 — 8B (round 29). M4 stays reserved and
  NAMED for a MEASURED PRF-06 breach at the 8B head.
- OW-26's cursor (LOG-04) — 8C unit 2; the ledger row is `TAKEN(8C/unit 2)`.
- The four `gate` rows (DEP-01, EXE-01, EXE-02, BND-01) — never green in
  this slice, by the Q6 ruling; G4/G7 still block.
- GRP-01 — 6C, `pending` on the arrival shape alone.
- A named freeze on a claim (Q-A); a no-op on *hers already* (Q-B).
- G9 OPEN · G3 open · the band allowlist EMPTY · SIG-01 NOT absorbed ·
  `PROMPT_VERSION` `hc-6b-3` unmoved · `lib/ai/` untouched · nothing
  production-activated.
- LOG-03 — never green, by ruling.

---

## Addendum — auditability block

- **Local evidence:** produced at `4d166c0`'s tree, quoted verbatim above;
  the docs commits after it move no directory any leg binds to.
- **PR:** opened from this session as `[DO NOT MERGE without owner
  sign-off] Slice 8A — claim + the level-bound step-up, the database
  increment`, base `main`, head `slice/8-claim-db`; body checked in at
  `docs/review/round-28-pr-body.md`. The head SHA and commit count are read
  from the API at the moment they matter, never from this file.
- **Pins:** no drift — Supabase CLI as pinned, Node 22.15.0; no dependency
  moved (0 runtime, 13/15 dev).
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs supabase/migrations` ·
  `npm run test:db` · `npm run test:concurrency` (teed) · `npm run
  db:verify` · the upgrade leg (a detached worktree at base, `supabase db
  reset --workdir`, then `supabase migration up` through the preflight
  runner, then both suites) · `npm run test:app` · `npm run lint` ·
  `npm run typecheck` · `npm run build` · gitleaks via the digest-pinned
  image from the primary repo · `NODE_OPTIONS=--max-old-space-size=1536
  npm run test:e2e`.
- **CI:** no run number lives in this packet. CI is KEYLESS and does not
  run Playwright — the gate is LOCAL evidence only, and no CI run can
  upgrade it. `gh` stays UNAUTHENTICATED for the reviewer: per-step
  conclusions are readable, suite tallies are not. A "Start local Postgres"
  `toomanyrequests` failure is the ECR Public anonymous quota, never a repo
  defect — re-run later.
- **Next leg after this packet:** the round-28 review — Tier 1, 3–8 lenses,
  at least one from a different model family than the author, fresh
  session, findings landed VERBATIM (`docs/review/round-28-findings.md`)
  before anything is argued. Then dispositions (ADR-0041, or M3 if DDL is
  needed), owner sign-off, merge commit never squash. **8B does not wait
  for this merge; 8C does.**
