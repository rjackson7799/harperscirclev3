# ADR-0035 — Slice 7B: Tasks + Timeline, the record app increment — deltas as built, and the round-26 packet

**Status:** proposed — the 7B build record, put to round 26 (Tier 2: this one
document plus one dispositions table, one reviewer session).
**Branch:** `slice/7b-record-app`, from `origin/main` @ `7d2d395` (PR #30, the
7B kickoff — one docs-only merge past the `abb0398` the kickoff named; nothing
under `app/`, `lib/`, `e2e/` or `supabase/` moved between them).
**Date:** 2026-08-30. **Tier:** T2, ruled at the plan gate (Q3).
**Scope:** the plan's "### 7B" table verbatim — B1 the floors and the gate,
B2 Tasks, B3 Timeline, B4 the legs, the manifest, the receipt's first two
links, the budget. **Migrations: NONE** (M6 closes UNCONSUMED; nothing under
`supabase/` moved). **Dependencies: 0 runtime, 0 dev** (13 / 15, the reserve
UNSPENT). `PROMPT_VERSION` does not move. Nothing is production-activated.
**Authority:** the plan (B-rows BINDING) → PRD §4.0, §4.4, §4.5, §7.3–§7.6 →
TSD §2.7, §3.5–§3.6, §5.7, §8.6–§8.7 → ADR-0027 D17 / ADR-0028 D8, D15 as
placed by Q4 → ADR-0033 D19 (the functions 7B calls) → `docs/coverage.md`.
*(Length: past the kickoff's 150-line target — D11's verbatim four-run gate
record and its evidence grew it, and that record is the one thing this round
must not receive compressed.)*

---

## The commits (red → green per unit, the signature in every red)

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| B1 OW-01 `tests/hc/review.test.ts` | — | `6027e7a` | test-only; its first run found the wrapper's comment claiming zero rows where `hc.extractions_for` raises `extraction_refused` |
| B1 OW-02 the row boundary | `fbe8ffc` | `6cb0f38` | `TS2578 Unused '@ts-expect-error'` · `TS2558 Expected 0 type arguments` |
| B1 OW-17 the scanner's class | `755beb5` | `f0d34a2` | 6 failed / 9 passed — every new spelling unmatched |
| B1 OW-11/15/18 the gate | `e4385cf` | `0a8bafc` | 24 failed / 29 passed — ten pages `NEXT_REDIRECT /sign-in?next=…`, five routes 303, proxy 200, `/confirm` link-expired on a fault |
| B1 OW-20 the floors | `9a2bf95` | `6afffb7` | 8 failed / 2 passed — `select 'id, title, due_on, state'` · `'id, title, happened_on'`; no alert on a refused read |
| B2 `lib/hc/tasks` | `f6413d7` | `9ac205c` | `Cannot find package '@/lib/hc/tasks'` |
| B2 the surfaces | `4c243dc` | `7933e24` | 25 failed — the pages and routes absent; the list against the floor |
| B3 `lib/hc/timeline` | `21524a3` | `3b96491` | `Cannot find package '@/lib/hc/timeline'` |
| B3 the surfaces | `767b457` | `3c3c6fb` | 25 failed; `TS2307` ×4 |
| B4 legs, receipt, pins | — | `c8234c0`, `cb256a9` | test/leg additions; the receipt's link change pinned in `tests/routes/arrival.test.ts` |

Order note: `21524a3` (B3's module red) precedes `7933e24` (B2's surface green)
in history — the B3 module test was written while B2's surfaces were finishing.
No unit is claimed green ahead of its red.

---

## D1 — B1: the gate's third outcome reaches every site, and the 503 comes from the proxy

`liveSessionClaims` is **deleted**, not deprecated. `lib/auth/gate.ts` gives
pages `gatePage` (signed-out redirects *inside* the gate; `unavailable` comes
back as a state) and routes `gateRoute` (signed-out → 303; `unavailable` → the
503 page); neither can drop the third outcome by construction, and
`tests/app/page-gate.test.ts` drives every gated file on disk with all three
and pins the set both ways — a 7C page fails vitest until listed. **A Server
Component cannot set a status** (its moves are render, redirect, `notFound`,
the auth interrupts), so the 503 + `retry-after` + `private, no-store` is
answered by `proxy.ts`, which already reads the session per matched request
(`getClaims` verifies the HS256 token through `getUser`) and classifies a
fault with the gate's own classifier (`lib/auth/session-outcome.ts`, pure,
shared); an authentication answer passes through — the page decides, as
before. The page's own residual renders `components/ui/SessionUnavailable` at
200: the same sentence, `role="alert"`, "try again" to its own path. One set
of headers (`lib/http/session-unavailable.ts`): JSON for the three API
routes, HTML for people. The layout degrades; `sign-out-everywhere` skips the
log entry on a fault and says so — sign-out is never refused.

## D2 — GTE-01's e2e half is stated as a bound, not claimed

No local instrument fakes an auth-server outage under a browser without
stopping GoTrue on the shared stack, which the traps forbid mid-gate. The
outage shape is driven at every site by the vitest table (16 driven, 5
pointed at their own files); the 45-leg gate exercises the proxy's
pass-through on every request. The live observation of a hosted runtime under
an auth fault is OW-09's owner track and is **not** claimed here. **Q-A**
below puts the row's wording to the round.

## D3 — `/confirm` reads its own three outcomes; the retry for a one-shot link is the pass, offered again

Verification errors are classified: an authentication answer is
`link-expired` as before; a fault is a 503 retry of *this* link (a fault
consumes nothing). The claims come from the session GoTrue just handed back
(`decodeTrustedAccessToken`, the step-up route's trust), so no second
round-trip can go unavailable; with no session returned, the live read runs
and `unavailable` is a retry to `/account`, never `?verified=1`. An
activation pass that throws lands `?verified=1&forwarding=failed`, and the
account page says what is on, what is not, and offers the idempotent pass
through **one route the plan did not list**,
`/account/activate-forwarding/submit` — the consequence of "renders a retry,
never success" for an effect whose link cannot be replayed. The filesystem
pin demanded its entry the moment it existed.

## D4 — the creation entry's visibility is the log's own rule

`hc.create_circle` writes each custodianship declaration as a **subject**
entry with no domain (its `subject_id` is set, contrary to the M9 header's
"its row does not exist yet"), so `access_log_select` fails it closed to all
five domains: a member at `log` or above on every domain of that subject sees
the first row; a family default (finances hidden) does not.
`tests/hc/timeline.test.ts` pins both sides — found by its first live run.
The page renders the entry where it is shown and never claims there is none.
**Q-E** puts the bound to the round.

## D5 — a manual event has no source arrival, by construction

`hc.approve_proposal` writes `source_arrival_id = null` for a `manual`
payload (`20260824120006:514`); the manual arrival exists but the event does
not cite it. `lib/hc/timeline` therefore reads *proposal present, arrival
absent* as `manual` — the provenance line "Entered by *person* on *date of
entry*" comes from `approved_by` / `approved_at`, which is PRD §4.4.3's own
sentence. The first targeted run asserted the event's date there and the
product was right (cb256a9).

## D6 — OW-03's ruling for the rest

Every 7B page renders inside `withPageBudget` and every 7B POST inside
`withRouteBudget` (`lib/http/page-budget.ts`); `tests/lint/answer-budget.test.ts`
holds the record trees to it. **Ruled here for the rest:** the pipeline
workers, the nightly sweep, the relay and the inbound webhook are machine
callers with their own retry contracts (the queue's, Postmark's) — a person
never waits on them, and a budget there would re-create D20's misplaced bound.
The five auth submit routes are a person's wait and carry no budget at 7B;
**Q-B** puts where they land.

## D7 — the point of selection agrees with the database, and where it cannot know

`lib/hc/tasks#selectionFor` computes D19.7's gate (≥ one deliberate
`log`-or-higher grant ⇒ offered) and `hc.visible_at`'s rungs 3 and 6
(unresolved lineage ⇒ manage ×5; else the ladder over the taint at ≥ summary
⇒ can see) over `hc.circle_people`'s levels — driven both ways live: hidden
×5 not offered *and* refused; one `log` grant offered *and* path 2 through.
Levels a non-coordinator assigner is not given are **null, never hidden**
(ADR-0032 D7, Q-C's rider): the candidate is offered and the definer decides
on submit, the refusal one marker. Path 2's step-up rides the `hc-step-up`
cookie into the assign route, bound to `task:<id>+document:<id>`, consumed by
the definer, cleared either way.

## D8 — narrowings, named

The Timeline defaults to the **founding subject's** thread, not "the subject
you were last looking at" — a Server Component cannot remember that without a
cookie route (**Q-C**). The add form offers the on-screen thread's documents
(no JS; the zone follows the subject server-side). Nav unchanged (the plan's
B4 row); NAV-01's 7B half is the gate refusing a hand-constructed URL from a
live context. Counts are post-filter within the subject scope; "overdue" uses
the viewer's UTC day as the common floor across subjects.

## D9 — Claim (ADR-0033 Q-H) is still deferred

No 7A function lets a member below manage assign a task to herself and 7B
ships no DDL, so no claim control exists. A coordinator hands a task to
herself through assign. **Q-D** puts the landing.

## D10 — the host, and what was not diagnosed

Targeted runs (never gate results) at `c8234c0`: run 1 died at webServer
start (`0xC0000409`); run 2 in the runner (`Committing semi space failed` at
a 62 MB heap; a `fork` refused with `STATUS_COMMITMENT_LIMIT`); run 3 BLOCKED
by preflight — run 2's `next dev` and fixture server were orphans on
3000/8787, the traps §2 shape, identified by command line and killed; run 4
2/5 (two 120 s timeouts at final assertions; one wrong expectation, D5); run
5 5/5 in 229 s under the spec's 300 s per-leg budget (**Q-G**). The host sat
at 66–300 MB physical / 0.16–1.1 GB commit free throughout, with three peer
`claude` and two `ChatGPT` processes resident. Recorded, not diagnosed.

## D11 — THE GATE AT `18fbdba`: four complete runs, zero product failures, and no single 45/45 — said plainly

The gate is **45 legs** (38 + the 5 record legs + 2 a11y legs). Four full
runs at the head, `docker stats hc_clamd` ≈ 0 % and no signature reload
before each; every leg that ran, PASSED, in every run:

| Run | Tally | What stopped it (from the retained artifacts, verbatim class) |
|---|---|---|
| 1 | 11 passed, then 30 × `ERR_CONNECTION_REFUSED` at 0–4 s | `next dev` died ~5.5 min in; every later "failure" is the dead socket |
| 2 | 30 passed (the full walkthrough), then the same cascade | the same kill, 13 min in |
| 3 (`NODE_OPTIONS=--max-old-space-size=1536`) | **43/45**, 19.3 min | tasks leg: Chromium `ERR_INSUFFICIENT_RESOURCES` on a `goto`; reject-all: 245 s timeout (its cost scales with fixture; each tap is two dev-mode loads) |
| 4 (same cap) | **43/45**, 17.4 min | tasks leg: 300 s timeout inside member provisioning; reject-all: the loop met the **Next dev overlay** — `Runtime Error: spawn UNKNOWN` — the dev server's compile workers had OOM'd (`[WebServer] FATAL ERROR: Committing semi space failed` in the teed log), saw zero reject buttons, and the state assertion caught it |

The union of runs 3 and 4 covers 45/45 — and a union is not a gate result.
Under the flake policy's own sentence (two consecutive failed runs at one
SHA), **the gate is not claimed green at `18fbdba`**. What is claimed: every
one of the 45 legs passed at this head in run 3 or run 4; no product
assertion failed in any of the four runs; every stop carries its mechanism
from the retained trace or the `[WebServer]` log — never "the environment is
unwell" bare. The two legs no single run kept were then run BY TITLE at the
final head: **tasks PASSED alone in 68 s**; **reject-all was NOT observed
green at the 7B head** — 245 s (its whole 240 s budget, twice: gate r3 and a
targeted run), the dev overlay (r4), and finally a Chromium
`ERR_INSUFFICIENT_RESOURCES` at 85 s even with its budget raised to 420 s
(the T3 commit `716cd49`) and the host otherwise idle. Three stops, three
named mechanisms, zero product assertions failed; the leg last ran green at
the round-24 gate (`986ef6e`). **Q-H** puts the gate's disposition to the
round.

---

## Evidence at ONE declared head — `716cd49`

`git diff --name-only 18fbdba..716cd49` is two TEST files (the fence-form
type pin `396c44f`; reject-all's T3 budget `716cd49`): nothing under `app/`,
`lib/`, `components/` or `supabase/` moved after the gate runs' head.

- Clean-leg reset **exact 74** · `verify-migration-state` exact.
- pgTAP **69 files, Σ 1,809, PASS** (17 s wallclock), teed.
- Concurrency **82/82** (54 cases), teed — case 1's `40P01`s are PLT-02's
  deliberate repro.
- `db:verify --fail-on warning` **clean**.
- vitest **1168 / 90 files by run** (`.vitest/run.json`; 982/79 at the base —
  7B adds 11 files, 186 tests). Upgrade leg: no 7B migration exists; the
  clean leg IS the 74-migration state, and CI's upgrade leg runs keyless on
  push.
- **The gate: D11's table** — four complete runs at `18fbdba`, 43/45 twice,
  zero product failures, every miss a named host mechanism; tasks green BY
  TITLE at `396c44f` (68 s); reject-all not observed green at the 7B head
  (D11; Q-H). A11Y-08 — the OW-13 leg-38 shape — **passed in both complete
  runs, 18 s (r3)**; per-leg durations retained in the run JSONs.
- lint solo **exit 0** (one fence hit at `18fbdba` — the type pin's static
  import — fixed as `396c44f`, recorded) · typecheck solo **exit 0** ·
  production build solo **exit 0**.
- gitleaks, the CI-identical digest-pinned container: **547 commits scanned,
  no leaks found**.
- Artifacts: teed logs, the JSON reporter file per run, and every preserved
  `test-results/` (traces for all four gate runs and every targeted run) —
  copied vault-side per the evidence convention.

---

## Pointed questions, with recommended answers (the packet, collapsed)

- **Q-A** GTE-01 reads "app + e2e". The e2e half at 7B is the proxy running under
  the 45-leg gate; the outage itself is unit-driven at every site. Recommended:
  ACCEPT the row green with the bound as written in its cell, the hosted
  observation staying OW-09's.
- **Q-B** The five auth submit routes carry no answer budget. Recommended: open
  a ledger row, home 7C C2 beside OW-19's upload bounds.
- **Q-C** The Timeline defaults to the founding subject. Recommended: ACCEPT;
  a cookie-backed "last looked at" is a 7C-or-later nicety, not a row.
- **Q-D** Claim / self-assignment (Q-H). Recommended: M6 at 7C or slice 8, as
  the owner prefers; not owed to 7B.
- **Q-E** The creation entry is visible at `log` ×5 on the subject, so a family
  default does not see the first row of the thread. Recommended: ACCEPT as the
  log's rule; if §4.4.4 is read as universal, that is a 1A ruling, not an app fix.
- **Q-F** RCP-01's "live RLS reads" cell is round 26's to rewrite (ADR-0025 D6).
- **Q-G** `e2e/record.spec.ts` sets a 300 s per-leg budget. Recommended: ACCEPT
  as the provisioning-heavy spec's own bound, recorded in the file.
- **Q-H** The gate at the head (D11): 43/45 twice, zero product failures, every
  miss a named host mechanism, the two residual legs observed green by title.
  Recommended: the round reads the four runs and the owner rules whether the
  gate stands for this merge or a fifth run on a quieter host is required
  before sign-off — the build does not rule it (OW-13's discipline: never
  re-run to green; leg durations recorded in the D13 shape).

## What is NOT claimed

Claim (D9) · a live auth-outage observation (D2) · budgets on the auth forms
(D6) · tier-aware nav composition (7C C6) · Documents and People pages — the
receipt still says plainly where those open (RCP-02 stays pending) · A11Y-10/11
· episode drafting · the vault pointer (refreshed after the merge, not before).
