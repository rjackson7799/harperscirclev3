# 7E/7D close-out — the gate, and what it moved

**Head `bb40021`** on `slice/7c-sensitive-pair`; PR **#34** open and held,
`[DO NOT MERGE without owner sign-off]`. Entry: ADR-0038 **D5**, RULED with
owner sign-off 2026-08-31.

## The gate — ONE complete run at the FINAL head

```
PREFLIGHT  slice/7c-sensitive-pair @ bb40021  for=e2e  2026-09-02
VERDICT: SAFE
58 passed (29.4m)
```

`.gate/e2e-run.json`: **expected 58 · unexpected 0 · flaky 0 · skipped 0 ·
1766 s · 58 specs**. Produced by `npm run test:e2e` — a bare
`playwright test` through `scripts/preflight.mjs`, **no CLI override** — and
the tally is read from that JSON, never from console text (traps §4).

Unconditional per ADR-0033 D19.14, and it covers **both** increments: 7E
closed without one, so this run is the browser evidence for 7E and 7D
together.

**Four earlier attempts are recorded, not hidden.** None was a gate result;
every failure carried a named infrastructure signature and **not one product
assertion failed** across them: `spawn UNKNOWN` (errno -4094, Windows unable
to create a process), `Jest worker encountered 2 child process exceptions`,
`ERR_CONNECTION_REFUSED` after the dev server died, `ERR_INSUFFICIENT_RESOURCES`,
`AuthRetryableFetchError 504`, and `Connection terminated unexpectedly` when
Docker restarted the stack mid-run. The host is memory-bounded and traps §1
names that as the LAST diagnosis to reach for; it was reached for only after
reading each trace, and `next build` compiling **78 routes** clean at this
head is what cleared the product each time. The green run followed the
owner closing ~1.15 GB of applications — no config change, so the gate
proves exactly what every previous round's gate proved.

## Closure evidence at this head

| Check | Result |
|---|---|
| `eslint` | exit 0 |
| `next typegen && tsc --noEmit` | exit 0 |
| `vitest` | **1409 passed · 100 files · 0 failed** (baseline 1341) |
| `next build` | **78 routes**, compiled successfully |
| browser gate | **58/58**, JSON-borne |

## What moved

**`docs/coverage.md` — 267 rows · green 241 → 250 · review 17 → 9 ·
pending 9 → 8** (re-derived by the process test's own parser).

Eight rows re-greened in the words their fixes earned — RCP-02, DOC-01,
DOC-03, DOC-05, PPL-01, PPL-04, A11Y-10, A11Y-11 — plus LOG-01's app half
re-earned in *narrower* words and PPL-03's one-line stamp landed. **A11Y-11's
CLAIM column** had still carried the clause struck at round 27; the strike is
applied to the claim itself here, because a record that says one thing above
and another below is the defect R6/F-6 is about.

**UXA-04 flips `pending` → `green`.** ADR-0038 D2 set the terms exactly —
*"the flip takes effect at the head where the disclosure lands green"* — and
this is that head. `pending` never counted as green, and the row did not move
until the copy did.

**`docs/owed.md` — OPEN 7 / 25 · TAKEN 3 → 1 · RISK 1 · CLOSED 15 → 17.**

- **OW-24 CLOSED(bb40021)** — the ingress read answers inside the route's own
  `AnswerBudget` on both upload routes, with a route test driving a body whose
  `text()` never resolves; DOC-05 no longer asserts *"every hop raced"* flatly.
- **OW-25 CLOSED(bb40021)** — config-borne reporter and JSON path, and Q-E's
  WIDENED clause met: **58 traces retained for 58 legs, including every green
  one**, which `retain-on-failure` could never have produced.
- **OW-26 stays OPEN**, home slice 8: the log's cursor. Only the disclosure
  landed here.
- **OW-05's counter advances 7 → 19 of 38** by **R6's twelve**. 7E's own eight
  are recorded and deliberately NOT added: several are the same legs read again
  *after* 7E rewrote them, which answers *did the fix hold?* and is not another
  slice of the backlog.

## What does NOT move, and is still owed

- **The bound holds.** Migrations **NONE** (5 of ≤ 6); **M6 closes
  UNCONSUMED**; dependencies 0; `PROMPT_VERSION` unmoved; G4/G7 still block.
- **The three DDL items stay named and stopped** for the slice-8 plan gate
  (D6): `hc.shares_for` carrying the assignment task's live status; a
  level-bound step-up `target_ref`; share-includes-bytes.
- **Residuals named and not closed**, each in its own cell: PPL-01's browser
  custodian is still the founder; A11Y-10's printed-log clause still has no
  control; DOC-03's leg title still over-claims *"with its markers"*.

## A trap this round paid for

**Next 16 refuses a second `next dev` in the same directory regardless of
port.** A peer session's server on 3100 kills the gate before a single leg
runs, while `scripts/preflight.mjs` reports SAFE — its port check knows only
3000 and 8787. Not added to `docs/process/traps.md`, which is at its 215-line
cap and takes a trap only against an eviction or a scanner; named here for
the owner's ruling.
