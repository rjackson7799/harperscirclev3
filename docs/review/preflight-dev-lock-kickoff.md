# Build kickoff — `chore/preflight-dev-lock` (slice 8, Q7 · Tier 3 · no round)

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`); the ritual is `docs/process/slice.md`; invoke the
`slice` skill (leg: build). Only what is below is new. The contract is
`docs/review/slice-8-plan.md`: §"The two round-27 host traps (Q7)" and the
Q7 ruling under "Owner decisions — SETTLED 2026-09-02".

## STATE — settled, do not redo

- `main` @ `d583f0c` — PR #38, the slice-8 plan RULED, merged `--no-ff`
  2026-09-02. Code is byte-identical to the evidence head `bb40021`.
  `git fetch`, then branch `chore/preflight-dev-lock` from `origin/main`.
- Q7 SETTLED: both round-27 host traps become PREFLIGHT, no `traps.md`
  eviction (the file sits at its 215 cap), one small Tier-3 PR, owner-merged
  BEFORE the 8A build kickoff. This is that PR.
- Tier 3, ruled: no round, no packet, no findings doc, no deltas ADR; read in
  8C's batched Tier-3 pass. Evidence: lint · typecheck · vitest counted by
  run · CI green · the live demonstration (task 5) in the PR body. The
  58-leg gate is NOT re-run for a check that runs before the gate.
- Bounds: migrations 0 (`supabase/` untouched) · dependencies 0. `lib/ai/`,
  `app/`, `lib/`, `e2e/` untouched. NOT docs-only — say so in the PR body.
- PR #35 and #36 were open at the merge; neither touches this. A peer's
  untracked `docs/review/slice-5b-queue-kickoff.md` is in the tree.

## THE TASK

`scripts/preflight.mjs` (297 lines): findings via `add(level, check,
detail)`, levels `OK` / `WARN` / `BLOCK:n`, exit = the max BLOCK code, the
override `HC_PREFLIGHT_FORCE="reason"`. Two checks, their tests, two doc
lines, one PR. Red→green per unit, the failure signature in the red commit.

1. **`devlock` — BLOCK on a live peer `next dev`, e2e leg only.** Next 16.3.1
   writes `.next/dev/lock` as JSON `{ pid, hostname, appUrl, … }`
   (`node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js:154-162`)
   and refuses a second `next dev` in this directory on ANY port — a peer
   on 3100 killed the 7D gate while preflight said SAFE. Read, parse; if the
   pid is live (`alive(pid)` exists — signal 0) refuse in the lease's shape,
   `BLOCK:3`, NAMING pid and appUrl; a dead pid, an absent file or corrupt
   JSON is `OK devlock stale`. Beside the ports check, gated on the e2e leg
   the way `needs.free` is. `next build` locks `.next/lock` — leave it alone.
2. **`memory` — WARN, never BLOCK.** Print free physical memory against a
   NAMED floor: a constant whose comment cites its source (the 7D gate
   finished only with ~1.2 GB free; four runs died below it with ZERO
   product assertions failing) and says what `os.freemem()` measures on
   win32. A WARN because the host's condition is the owner's call.
3. **Tests.** Preflight has NO test today. Extract the pure parts —
   `parseDevLock(text)`, `devLockVerdict(info, isAlive)`,
   `memoryVerdict(freeBytes, floor)` — into a module the script imports, and
   drive them from vitest with a fixture lock: live pid → BLOCK naming pid +
   appUrl · dead pid → stale OK · absent / corrupt → OK · free below / above
   the floor → WARN / OK with the number in the text. One negative control
   per branch (traps §9).
4. **`docs/ops/e2e-local-gate.md`, two lines only.** Prerequisites:
   `NODE_OPTIONS=--max-old-space-size=1536` keeps `next dev` alive on this
   host. The gate run: PRESERVE `.gate/e2e-run.json` before ANY re-run — a
   dying run clobbers it. Do not refresh the rest (its stale migration count
   is 8A's). Allowed, not required: preflight rotates the previous record
   aside itself — then the line says so.
5. **The live demonstration, pasted verbatim into the PR body.** With a peer
   `next dev --port 3100` in this directory, `npm run preflight -- --for e2e`
   prints the BLOCK naming that pid and `http://localhost:3100`; stopped,
   SAFE. The demo peer itself refuses to start if another `next dev` holds
   `.next/dev/lock` — check before blaming the code.
6. Commit this kickoff as `docs/review/preflight-dev-lock-kickoff.md` (the
   lint caps kickoffs at 90 lines). PR title: `chore(preflight): the Next 16
   dev-lock refusal and the free-memory WARN [DO NOT MERGE without owner
   sign-off]`. Body: what changed, the demo output, vitest by run, CI.

## WHERE TO PUSH HARDEST

- **A stale lock must never block.** Dead pid, corrupt file, absent file —
  all OK. A false BLOCK on 8A's gate is the round-27 failure inverted.
- **A live pid that is no longer a `next dev`** (pid reuse after a crash).
  State what the check does then and why that is acceptable, in the comment.
- **No shell call for process facts** (traps §9): `alive()` is signal 0; keep it.

## SLICE-SPECIFIC TRAPS

- Preflight's HEAD check blocks ONCE after every commit; a re-run
  acknowledges. Two sessions share this tree and one Supabase stack.
- `.next/` is git-ignored: the fixture lock lives in the test, never on disk.

## ⏸ AT THE GATE, STOP

Open the PR, paste link + title + full body into chat, and STOP. The owner
merges `--no-ff`. The next leg, the **8A build kickoff** on `slice/8-claim-db`
(the docs-only ledger + coverage commit first, then M1 FIRST), is
regenerated against post-merge `origin/main` in its own fresh session.
