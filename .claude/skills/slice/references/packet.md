# The review packet

Path: `docs/review/round-N-packet.md`. Scope it to **what changed since the last
stamped review, plus what the next step depends on** — a packet, not a corpus.
Open with an explicit *"SETTLED, except…"* preamble so the reviewer cannot
re-open ruled ground.

## Evidence at ONE declared head

State the evidence head and the docs head. If they differ, carry the evidence
forward with a **per-directory tree binding** — name the directories that are
byte-identical to base and the ones that moved, and show that every commit after
the evidence head touches `docs/` only:

```
git diff --name-only <evidence-head>..HEAD    # must be docs/ only
git rev-parse <evidence-head>^{tree}:app      # etc., per directory
```

Never write "unchanged" for a tally. **State it exactly**, every time.

## The closure evidence set, scaled by tier

| | T1 | T2 | T3 |
|---|---|---|---|
| clean-leg reset at exact migration count | ✓ | if DDL | — |
| pgTAP, count recorded exactly | ✓ | if DDL | — |
| concurrency (teed) | ✓ | if DDL | — |
| `db:verify --fail-on warning` | ✓ | if DDL | — |
| upgrade leg | ✓ | if DDL | — |
| vitest, count exact | ✓ | ✓ | ✓ |
| local browser gate, **new total stated exactly** | ✓ | if person-facing | ✓ |
| lint · typecheck · production build | ✓ | ✓ | ✓ |
| gitleaks | ✓ | ✓ | ✓ |
| coverage rows flipped (never early) | ✓ | ✓ | ✓ |

## What CI can and cannot prove

CI does **not** run Playwright — the browser gate is local evidence only, and no
CI run can upgrade it. `gh` stays UNAUTHENTICATED: per-step conclusions are
readable, **suite tallies are not**. Never quote a tally from CI.

**Do not put a CI run number in the packet.** It goes stale the moment it is
committed — a round-17 finding.

## The pointed questions

Five to seven, each naming a concrete edge the author genuinely does not know
the answer to. Attach the author's own recommendation to each so the reviewer
can disagree with something specific.

An unanswered pointed question defaults to **NOT PLANNED**, and the build does
not start.

## What is NOT claimed

A named list. This is where an honest packet earns its reviewer's trust — and
where the OWED rows for this round are first written down.

## The PR

Title carries `[DO NOT MERGE without owner sign-off]`. Body is checked into the
tree at `docs/review/round-N-pr-body.md`, so the text the PR carries is diffable.
