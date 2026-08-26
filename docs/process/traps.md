# Standing traps for this tree

Permanent, project-wide, and **not slice-specific**. Imported by `CLAUDE.md`, so
it is in context every session. Every one of these was paid for once; none is
theoretical.

A kickoff brief does not restate any of this. It names only what is new to its
own slice, and points here.

**The eviction rule — this file is capped at 215 lines and the cap is enforced
by `tests/lint/process.test.ts`.** Adding a trap requires either removing one,
or showing that the one removed is now enforced by a scanner, a hook, or a test.
Retired traps go to §10 with the thing that replaced them.

Without this the file becomes the next `round-18-kickoff.md` within four slices,
and the whole point was to stop paying that. The cap is not a style preference —
it is the pressure that pushes traps toward automation.

---

## 1. Diagnosis discipline

**"The environment is unwell" is the most comfortable diagnosis available and
must be the LAST reached for.** Before using it, diff the tree against the last
run that PASSED and count what the logs say NOW versus THEN: **a signal that
changed with the code outranks a resource number that was already true
yesterday.** This host *is* memory-bounded (7.7 GB, ~0.4 GB free with Docker
up), which is exactly why the excuse is always available.

**A failure that will not reproduce is an UNREPRODUCED TRANSIENT, never claimed
as diagnosed.** Two that are never repo defects: `toomanyrequests` on CI's
"Start local Postgres" (ECR Public anonymous quota — re-run later), and a
forks-worker spawn failure under vitest load (infrastructure — re-run once).

**A product failure is never re-run to green: it is a finding.** A failed leg is
re-run at most once, and only after classifying it from the retained trace.

---

## 2. Two sessions share one working tree AND one Supabase stack

`db:reset`, `test:db`, `test:e2e` and `test:concurrency` are **GLOBAL**. They
destroy a peer session's in-flight run with no error on either side.

Before any of them, check for a live peer and a moved HEAD. Run
`node scripts/preflight.mjs`; it refuses and names the conflict. `--force` is the
deliberate override.

- Check the peer `node.exe` **command line**, not just the image name — Adobe
  Creative Cloud ships a `node.exe` and is a known false positive.
  `Get-CimInstance Win32_Process -Filter "name='node.exe'"`.
- **Stage EXPLICIT paths. Never `git add -A`** — it sweeps the peer's
  in-progress files into your commit.
- A dev server left running by a peer is **REUSED** by Playwright *without* the
  config's env block.
- **Never poll a PID with `tasklist` + grep** — it reports "exited" for a
  demonstrably live process. Use `Get-Process -Id`.
- After an **interrupted** gate, kill the orphans before re-running: stopping
  Playwright kills the parent and its `webServer` children survive. While a run
  is alive those same processes are *not* orphans — check the Playwright PID
  first.

---

## 3. Environment for the harnesses

**`.env.local` is not the gate's environment.** It leaves `HC_WORKER_KEY` and
`CRON_SECRET` EMPTY and carries no service credential. An empty worker key means
`503 worker disabled`, and arrivals sit at `extracting` forever.

`playwright.config.ts`'s `webServer` block is the source of truth for standalone
harnesses — **minus `HC_DB_URL`**, which in `.env.local` is a restricted runtime
login and yields `permission denied for schema auth` (42501).

**Stack ports are 5434x**, not the 5432x defaults: api 54341, db 54342, studio
54343, Mailpit 54344, pooler 54349. After a reboot, WinNAT exclusion ranges can
eat the 543xx block — an elevated `winnat` restart plus `supabase stop/start`
recreates it.

A stale `scripts/ai-fixture-server.mjs --port 8787` blocks `test:e2e` at startup
**by design** — better than silently answering from the BLIND partition.
Identify it by start time before killing it.

---

## 4. Reading gate output

**A tee masks the exit code.** `playwright | tee` exits 0 when the suite is red.
Read the tally from the OUTPUT text, never from `$?`. CI already guards this with
`set -o pipefail` before every tee; the local gate does not, which is why the
rule exists.

**A run with no `N passed` tally is NOT a gate result.**

**NEVER GREP THE PLAYWRIGHT STATUS MARK — IT IS NOT A FIXED CHARACTER.** From
`node_modules/playwright/lib/runner/index.js:4616-4618`:

```js
DOES_NOT_SUPPORT_UTF8_IN_TERMINAL =
  process.platform === "win32" && process.env.TERM_PROGRAM !== "vscode" && !process.env.WT_SESSION;
NEGATIVE_STATUS_MARK = DOES_NOT_SUPPORT_UTF8_IN_TERMINAL ? "x" : "✘";
```

Under bare conhost a failed leg is `x`; under Windows Terminal (`WT_SESSION`
set) or VS Code it is `✘`. **The same command in two terminals prints two
different characters**, so a grep-based tally is not merely wrong, it is
*intermittently* wrong — which is worse. Read the tally from the JSON reporter
(`PLAYWRIGHT_JSON_OUTPUT_FILE`), never from console text.

Detail and tally appear only after the last leg. `retries=0`, so a failure
restarts the worker and re-provisions the founder, and cascading failures
over-report.

**Targeted runs are never gate results.** Neither is a leg re-run in isolation.

---

## 5. Legs, and what they actually assert

**LINE NUMBERS DRIFT — three times in slice 6 alone. CITE E2E LEGS BY TITLE.**
If a document must carry a number, re-verify it at the final head. Four of the
fourteen line citations in `docs/coverage.md` are already stale.

**A leg that passes only on the first run after a reset is not a passing leg** —
it has a hidden precondition. When a leg fails on a re-run having passed before,
check whether the FIXTURE accumulated before blaming the code, and **do not
`db:reset` before a run meant to PROVE such a fix.**

**A navigation that looks redundant may be load-bearing.** Leg 33's `goto`
clears the previous iteration's `?decided=1`; remove it and the next
`waitForURL` matches the STALE url and returns immediately — green while
checking nothing.

`waitForURL` **defaults to `waitUntil:'load'`**. On a timeout there, read the
network log for a request with status `-1` BEFORE suspecting the route.

---

## 6. Evidence

**PRESERVE `test-results/` BEFORE ANY RE-RUN.** Playwright wipes it at the start
of every run — including a *peer session's* run. In round 19 the only surviving
record of a RED gate had to be copied to a scratchpad directory seventy seconds
before a peer run destroyed it.

Parse a trace's `*.network` plus `resources/<sha1>` for real status codes and
response bodies.

---

## 7. Postgres and the local stack

- Run `test:db` only on a clean `db:reset`, or 031/039/041/053 fail with "Bad
  plan" parse errors that are **drift, not defects**.
- **Never interrupt a `db:reset`** — an interrupted one leaves an EMPTY database.
- A post-reset Kong 502 on auth → `docker restart supabase_kong_HarpersCirclev3`.
- `hc_clamd` dies on a Docker restart; `docker start hc_clamd` revives it (the
  local gate needs it — wait for "socket found, clamd started").
- **A function-ACL denial SEGFAULTS this PG17 image.** Privilege closure is
  therefore CATALOG-BASED, never probed by calling as a denied role.
- `citext` operators die under `search_path=''` and fall back to
  case-*sensitive* comparison — silently.
- Nested `$$` in a DO block needs a tagged quote whose tag does not appear
  inside the block, comments included.
- **Tee `test:concurrency` ALWAYS** — case 1's `40P01`s are the deliberate
  PLT-02 repro, not a failure.

---

## 8. Text editing on this host

- **MEASURE LINE ENDINGS WITH NODE ONLY.** Git Bash's `grep`, `sed` and `od`
  strip `\r`, disagree with each other, and disagree with the truth. Repo
  *source* is pure LF; `docs/coverage.md` is wholly CRLF; **line endings are
  mixed WITHIN single files** (`docs/adr/0023-*.md` holds 1183 CRLF and 192 LF).
  Fresh worktrees check out CRLF. Git's "LF will be replaced by CRLF" warning on
  commit is autocrlf noise.
- **Assert the match count before writing any exact-string replacement.**
- **Bash heredocs truncate past ~130 lines**, reporting a misleading
  `unexpected EOF` at a line inside your own content, with nothing written.
  Write the file, then count the lines.
- `grep -P` is UNAVAILABLE in this locale.
- PowerShell: **`git commit -F <file>`, never `-m`.**
- `MSYS_NO_PATHCONV=1` for `docker -v` in Git Bash.

---

## 9. Scanners are first-class code

**A SCANNER MATCHES ITS OWN COMMENTS.** Every scanner here carves out comment
lines and ships negative tests. ADR-0026: *if it can be a scanner, a manifest,
or an exact-set assertion, it must be* — which applies to this file too.
Anything here that becomes mechanically checkable moves to `tests/lint/` and is
deleted from §1–§8, with its replacement named in §10.

`tasklist /FI` **fails when invoked through Git Bash** — MSYS rewrites `/FI` to
a path. Call process tools with `execFileSync`, never through a shell.

---

## 10. Retired — now mechanical

A trap leaves this file only when something else enforces it. Each row names its
replacement, so the eviction rule cannot be used to quietly drop a lesson.

| Retired trap | Now enforced by |
|---|---|
| _(none yet — the first entries arrive as `tests/lint/process.test.ts` and `scripts/preflight.mjs` land)_ | |
