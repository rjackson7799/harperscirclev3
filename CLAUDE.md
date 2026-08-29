@AGENTS.md

# Harper's Circle — standing charter

Permanent rules. A kickoff brief restates none of this; it names only what is
new to its own slice and points here.

@docs/process/traps.md

## Authority

- **The repo is authoritative.** The Obsidian vault holds pointers and
  cross-project distillations only.
- Order: **PRD/TSD → ADRs bind → `docs/coverage.md` is authoritative per
  assertion.** A requirement spanning layers is split into one assertion per
  layer, never claimed green at a layer that cannot prove it.
- **A settled ruling is not a finding.** File a dissent, not a defect.
- **`pending` never counts as green.**

## Merge

- **The owner is sole merge authority.** No session merges its own work.
- **A merge commit, never a squash** (`--no-ff`) — the red signatures are part
  of the record. When `main` is unmoved git will offer a fast-forward; `--no-ff`
  is what stops it.
- Every PR title carries `[DO NOT MERGE without owner sign-off]`.
- `main` stays green.
- A finding blocks merge unless its row shows **either** an applied artifact
  plus a named test **or** an explicit accepted-risk ruling with a coverage row.
  **An unanswered pointed question defaults to NOT PLANNED, and the build does
  not start.** (ADR-0006)

## Bounds

- **The migration bound does not exist until the plan gate sets it.** Reserves
  are NAMED, not blank. Anything past the bound is a recorded owner amendment,
  made *before a line is written*.
- **Shipped migrations are never edited.** Recovery is forward-fix, never a
  down-migration. Changes are appends, with pgTAP exact-set pins re-pinned in
  the same commit.
- **Every dependency is argued WITH its licence**, re-verified from the
  installed manifest, with the command's output pasted into the red commit that
  adds it.
- **A reserve is consumed only with its ruling quoted in the commit.** A reserve
  not consumed closes UNCONSUMED — the bound closes at what was spent.
- **An accepted risk is an owner ruling plus a never-green coverage row** carrying
  the exposure; the ledger holds it as `RISK(row)` and nothing turns it green.
- The **owed ledger is `docs/owed.md`**, capped at **25 OPEN**. A round may not
  close above the cap. Excess is FIXED, TAKEN into the current slice against a
  named unit, or KILLED with a reason — carrying is not a third option.

## Review depth

**Review depth is set by what a defect would cost to fix in production — a
migration and a backfill, or an edit.** The tier is declared at the plan gate
and is itself an owner ruling. Full rule and the ritual: `docs/process/slice.md`.

- **Tier 1 (deep)** — ships a migration, changes RLS or a policy, touches
  `lib/ai/`, writes to the access log or ledger, or handles auth, provenance or
  money.
- **Tier 2 (standard)** — durable side effects, no schema change: workers,
  routes, state machines, storage.
- **Tier 3 (shallow)** — UI composition, copy, styling, timeout constants,
  test-only changes. Reviewed in one batched pass per slice, not per increment.

**The tier is ruled per increment.** The owner may raise one mid-round, on the
record, before a line is written; **a tier is never lowered mid-slice.**

Findings land **VERBATIM** in a committed file before anything is argued. Build
red→green per unit, with the failure signature in the red commit message.

## Gates

- **G9 and G3 stand.** Fixtures only. **CI is KEYLESS.** The eval harness is the
  only path ever run against a real credential. Never real family data; never a
  real document to a provider.
- **G4 and G7 still block.** Nothing is production-activated.
- Browser legs are **local-gate only** — CI does not run Playwright, so no CI
  run can upgrade local gate evidence.
- **G12 is the final gate, not the first check** — a structural accessibility
  failure found at G12 is a redesign, not a fix. Build the legs into the surface.

## Skill preconditions

- `claude-api` **before any change under `lib/ai/`** — it stands for every
  session touching that directory.
- `supabase:supabase-postgres-best-practices` before authoring any DDL.
- `vercel:nextjs` and the `node_modules/next/dist/docs/` guides before route
  work.
