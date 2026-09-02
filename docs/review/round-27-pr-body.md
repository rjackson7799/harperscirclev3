# [DO NOT MERGE without owner sign-off] Slice 7C — Documents + People & roles, the sensitive-pair app increment

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash — `git merge --no-ff`.** An unanswered item defaults to NOT MERGED. This body was refreshed at the **round-27 sign-off leg, 2026-09-02**; the body as it stood when the packet was put (2026-08-30, *"Round 27 has not run"*) is preserved unaltered below the rule, because a PR body is the round's narrative and a narrative is amended, never rewritten (ADR-0025 D6).

## Round 27 has RUN, is RULED, its fixes have LANDED, and the gate is GREEN

**Head `833fede`** (docs-only) · **evidence head `bb40021`** · base `origin/main` @ `18c362d` · every commit past `bb40021` is docs-only (`git diff --name-only bb40021..HEAD -- . ':(exclude)docs'` is empty), so the gate at `bb40021` proves this tree. CI: success at `bb40021` and at `833fede` (per-step conclusions read from the public API; no tally is ever quoted from CI).

### The verdicts — ADR-0038, RATIFIED AS PUT 2026-08-31, all eleven ballot items

Six lenses (R1–R4 and R6 on Opus, R5 on Sonnet — none on the author's model), **42 findings landed verbatim** (`docs/review/round-27-findings.md`): **MAJOR 16 · MINOR 21 · OBS 5 · BLOCKER 0**, none needing DDL. Every row argued in `docs/review/round-27-dispositions.md`; what a future session must obey is `docs/adr/0038-round-27-dispositions.md`.

**The tally, re-derived at this head with D7's own command** (`grep -E '^\| R[1-6]/F-[0-9]+ \| (MAJOR|MINOR|OBS) \|' … | awk -F'|' '{gsub(/ /,"",$5); print $5}' | sort | uniq -c`): **42 rows · ACCEPTED 40 · ACCEPTED-NOTE 1 (R4/F-9) · NOTED 1 (R3/F-8, closed by R2/F-3's fix) · FIXED 0 · OWED 0 · DECLINED 0 · OWNER 0.** By home: **7D 23 · 7E 17 · 7E+docs 1 (R6/F-8) · docs 1 (R4/F-9).** Severity by the same command: 16 / 21 / 5, agreeing with the findings doc's headings.

- **Q-A RATIFIED, conditioned** — a document share reaches the ROW, not the arrival's bytes or facts (§4.3.5, Phase 1). Conditions met: R2/F-7's pins land from a share-holder's context (7E `3f261a3`); ADR-0037 D12.1's enumeration amended. Share-includes-bytes stays slice-8 DDL.
- **Q-B FIX FIRST, then ACCEPT the narrowed claim** — no episode page exists and RCP-02 does not owe one; the episode receipt link now carries the widened `subjectId` and lands on the right subject's thread (7D U12).
- **Q-C RATIFIED** — insurance → finances; the PRD erratum landed at **three** sites, not one (§4.3.2 and two rows of the §7.2 table), each marked with the prior wording preserved.
- **Q-D RATIFIED, R5/F-2 folded in** — the dev/prod cache-control split as PPL-03 states it; `proxy.ts`'s unstamped early return fixed (7D U1); the hosted-runtime question rides OW-09.
- **Q-E RATIFIED, OW-25 WIDENED** to trace retention on green runs — discharged at `bb40021` (below).
- **Q-F: the read is complete; UXA-04's flip conditioned on the log's window disclosure** — the disclosure landed (7D U13), and the row flips at exactly that head.
- **The `db:verify` / upgrade-leg NOT-RUN re-rule RATIFIED** — both exercise DDL; 7C ships none.

The docs-only verdict commit (`bd99f34`) moved only what a verdict may touch: coverage green 249 → 241 · review 9 → 17 (eight rows to `review`, five narrowed); owed OPEN 6 → 7 (OW-24, OW-25 in as TAKEN, OW-26 OPEN); ADR-0037 a head index plus seven markers, nothing rewritten; the PRD erratum. **OW-07 and OW-19 stand `CLOSED(f1cfc33)`** — R5 confirmed their own acceptance conditions; the ingress read was a sixth hop neither named, carried by OW-24.

### 7E — Tier 3, the batched leg-and-scanner pass · 14 commits `bd99f34..2bdae46`

Test, leg, manifest and pin work only; no product line. **R1/F-1..F-3, F-5** — the byte-path fence pins the *property*, not the tree it was written against · **R3/F-6** — the people tree joins `RECORD_TREES` and the set is pinned · **R2/F-7** — the sensitive pair checked live from a SHARE-HOLDER, not a member by grant · **R4/F-8, R4/F-10** — LOG-02's app-layer evidence can now fail; the record's emitted shapes pinned where LIVE is pinned · **R6/F-1..F-10** — the legs assert what their titles claim; seven manifest citations named no leg that exists, now every citation names a real leg · **OW-25** — `reporter: [['list'], ['json', …]]` and `trace: 'on'` into `playwright.config.ts`, the disk cost accepted and named. One new leg — the 7C surfaces audited at 390 px — takes the gate **57 → 58**. `docs/review/7e-leg-audit.md`: eight legs (the ones 7E itself changed) audited title-against-assertion, six findings recorded, none moving a verdict; F-a and F-b handed to 7D rather than fixed, because both live in shared provisioning and a tier is never lowered mid-slice.

### 7D — Tier 1, the product surfaces · 31 commits `2bdae46..bb40021` · 16 units · 23 rows, 22 distinct fixes

Red → green per unit, the failure signature in every red commit; the rows in the subjects re-derive the same 23 D7 homes to 7D (R1/F-4 · R2/F-1..F-6 · R3/F-1..F-5, F-7, F-8 · R4/F-1..F-7 · R5/F-1, F-2).

| Unit | Rows | What landed |
|---|---|---|
| U1 | R5/F-2 · R5/F-1 + OW-24 | the proxy's early return stamps; `boundedJsonText` moved INSIDE `withRouteBudget` on both upload routes and raced — a body that never ends takes the route's own 504 |
| U2 | R3/F-7 · R4/F-6 | one `LEVEL_RANK`, typed, pinned to `enum_range` order, derived once |
| U3 | R3/F-4 · R4/F-5 | `null` is a third answer, not a level — the type, the frozen sentence, both consumers |
| U4 | R3/F-2 · R3/F-3 | the step-up round-trip composed with `URLSearchParams`; `rs` shape-checked |
| U5 | R3/F-1 | the definer's `changed` is read; a no-op says so instead of "Changed" |
| U6 | R2/F-3 · R3/F-8 | one step-up cookie per operation; `share/submit` bounces to `?share=…&e=step-up` |
| U7 | R2/F-1 | the category offer filtered by the caller's manage; the audience read's own catch |
| U8 | R2/F-2 | the re-categorisation preview names the derived objects too |
| U9 | R2/F-4 | Unshare offered only where it is one action; the words that withdraw the rest |
| U10 | R2/F-6 · R1/F-4 | the viewer's two silences said; the text path splits a storage fact from a refusal |
| U11 | R2/F-5 | the subject nav survives its own filter — no more *Nothing filed yet.* over four filed documents |
| U12 | R4/F-1 · R4/F-2 · R4/F-7 | every receipt destination resolves (the provenance link, the episode's subject and fragment); a scanner says so |
| U13 | R4/F-3 | the access log discloses which entries it is not showing (the cursor is OW-26) |
| U14 | R4/F-4 | the printable record has a door, and a leg walks through it |
| U15 | R3/F-5 | send-again: expired only, refused before the revoke, no claim from a query param |
| U16 | F-a | `e2e/a11y.spec.ts` carries ONE per-file budget (300 s), ruled at the 7D kickoff, not `workers: 1` |

**Not in 7D, deliberately:** the three DDL items (D6) and OW-26's cursor; the 7E residuals (a second custodian in the browser fixture, A11Y-10's printed-log control, the DOC-03 leg retitle) — none is one of the 23 ruled rows. **F-b** (an invite → create-account provisioning hang seen once in a targeted run) is an UNREPRODUCED TRANSIENT, not claimed as diagnosed, and did not recur in the complete run.

### The gate — ONE complete run at the FINAL head `bb40021`

`.gate/e2e-run.json`: **expected 58 · unexpected 0 · flaky 0 · skipped 0 · 1,766 s · 58 specs**, started 2026-09-02 09:12 UTC. Produced by `npm run test:e2e` — a bare `playwright test` through `scripts/preflight.mjs` (`VERDICT: SAFE`), **no CLI override** — the tally read from that JSON, never from console text. **58 traces retained for 58 legs, including every green one**, which is Q-E's widened clause and what `retain-on-failure` could never have produced. Unconditional for Tier 1 (ADR-0033 D19.14) and it covers **both** increments: 7E closed without a run, so this is the browser evidence for 7E and 7D together. `docs/review/7d-close-out.md` is the run's record.

**Four earlier attempts at this head, said plainly.** None was a gate result — no attempt produced an `N passed` tally — and **not one product assertion failed across them**. Each failure carried a named infrastructure signature: `spawn UNKNOWN` (errno -4094, Windows unable to create a process) · `Jest worker encountered 2 child process exceptions` · `ERR_CONNECTION_REFUSED` after the dev server died · `ERR_INSUFFICIENT_RESOURCES` · `AuthRetryableFetchError 504` · `Connection terminated unexpectedly` when Docker restarted the stack mid-run. "The environment is unwell" is traps §1's LAST diagnosis; it was reached for only after reading each trace, and `next build` compiling 78 routes clean at this head is what cleared the product each time. The green run followed the owner closing ~1.15 GB of applications — **no config change**, so this gate proves exactly what every previous round's gate proved. No leg was ever re-run to green.

### Closure at `bb40021`

| Check | Result |
|---|---|
| `eslint` | exit 0 |
| `next typegen && tsc --noEmit` | exit 0 |
| `vitest` | **1409 passed · 100 files · 0 failed** (1315 / 99 at `ccd854b`) |
| `next build` | **78 routes**, compiled successfully |
| browser gate | **58 / 58**, JSON-borne, traces retained |
| `tests/lint` | **146 / 146**, re-run at `833fede` by the sign-off session (`process.test.ts` holds the ledger) |

**The DB layer's evidence stands from `ccd854b`**: `supabase/` and `scripts/` are byte-identical to base by tree hash at `833fede` (`5d7737c…`, `864c416…` — measured), so the clean-leg reset at **exact 74**, pgTAP **69 files Σ 1,809** and concurrency **82/82** teed at `ccd854b` prove the same trees; `db:verify` and the upgrade leg stay NOT RUN by the ratified re-rule. Gitleaks: CI runs it keyless on every push and is green at both heads.

### Coverage and the ledger — re-tallied by command at `833fede`

**`docs/coverage.md`: 267 rows · green 250 · review 9 · pending 8** (the process test's own parser, run here). Eight rows re-greened in the words their fixes earned — **RCP-02, DOC-01, DOC-03, DOC-05, PPL-01, PPL-04, A11Y-10, A11Y-11** — plus LOG-01's app half re-earned in *narrower* words and PPL-03's one-line stamp; A11Y-11's CLAIM column now carries the clause round 27 struck. **UXA-04 `pending` → `green`** on exactly ADR-0038 D2's condition, at the head where the disclosure landed. The nine `review` rows are the same nine as at base `18c362d` (DEF-12, VIS-09, PLT-04, MUT-01/02/03, UPG-01, UXA-01, DS-08 — none of them slice 7's); the eight `pending` all predate slice 7 (FRZ-16b, RLS-11b, SIG-01, DEL-01, ADM-01, G12-01, UXA-03, LOG-03 — the last never green by ruling, OW-04). **Against base, the whole of slice 7C: green 235 → 250 · pending 23 → 8 · review 9 → 9** — every 7B/7C row that opened `pending` has closed `green` on a leg inside a complete run, none early.

**`docs/owed.md`: OPEN 7 / 25 · TAKEN 1 · RISK 1 · CLOSED 17 · 26 rows**, prose and table agreeing, every `CLOSED(sha)` resolvable, every OPEN row with an acceptance condition — all checked by `tests/lint/process.test.ts`. **OW-24 CLOSED(`bb40021`)** — the ingress read answers inside the route's own budget on both upload routes, a route test driving a body whose `text()` never resolves · **OW-25 CLOSED(`bb40021`)** — config-borne reporter, JSON path and `trace: 'on'`, proven by this run · **OW-26 OPEN**, home slice 8 — the log's cursor; only the disclosure landed · **OW-05 advances 7 → 19 of 38** by R6's twelve; 7E's own eight are recorded and deliberately NOT added, because several are the same legs read again after 7E rewrote them. Burn-down holds: slice 7 opened 3 against 13 closed.

### What does NOT move, and what stays owed

**The bound holds.** Migrations **NONE** (5 of ≤ 6; 74 on disk) · **M6 closes UNCONSUMED** · dependencies **0** (13/15 dev, the reserve unspent) · `PROMPT_VERSION` `hc-6b-3` unmoved · G4/G7 still block · G9 OPEN, the band allowlist EMPTY, SIG-01 NOT absorbed · nothing production-activated.

**Named and stopped for the slice-8 plan gate**, uncosted here: `hc.shares_for` carrying the assignment task's live status (R2/F-4's wider form); a level-bound step-up `target_ref` (R3's dissent 1); share-includes-bytes (if Q-A is ever ruled the other way). Also slice 8's by earlier ruling: search and claim/self-assignment (ADR-0036 Q-D), OW-26. **Residuals recorded, not owed**, each in its own cell: PPL-01's browser custodian is still the founder; A11Y-10's printed-log clause has no control; DOC-03's leg title over-claims *"with its markers"*.

### For the owner's ruling — named here, not ruled

Two host traps this round paid for, neither yet in `docs/process/traps.md` (at its 215-line cap; a row costs an eviction or a scanner):

1. **Next 16 refuses a second `next dev` in the same directory regardless of port** (`.next/dev/lock`). A peer's server on 3100 killed the gate before a leg ran while `scripts/preflight.mjs` reported SAFE — its port check knows only 3000 and 8787.
2. **This host completes a 58-leg gate only with ~1.2 GB free**: the owner closes VS Code / Chrome / ChatGPT; `NODE_OPTIONS=--max-old-space-size=1536`; `hc_clamd` healthy near 0 % CPU first. A dying run clobbers `.gate/e2e-run.json` — preserve it before any re-run.

### Where the evidence lives

`.gate/e2e-run.json` and `test-results/` (58 traces, 152 MB) are untracked on the host and are wiped by ANY Playwright run, a peer's included; the sign-off session copied them, with `.vitest/run.json` and the close-out, to the vault at `projects/harpers-circle/04-evidence/round-27-gate-bb40021/`. The `ccd854b` set is at `04-evidence/round-27-gate-ccd854b/`.

### After the merge

The owner merges `--no-ff` and the merge SHA is stamped back into ADR-0038 (ritual step 15). Then the **slice-8 plan gate**, its own fresh session, from post-merge `origin/main` — intake: the three DDL items, OW-26, search and claim/self-assignment.

---

*(The body as it stood when the packet was put, 2026-08-30, preserved unaltered below. Its "Round 27 has not run", its 57-leg gate and its `ccd854b` evidence head are that day's true record, superseded above.)*

# [DO NOT MERGE without owner sign-off] Slice 7C — Documents + People & roles, the sensitive-pair app increment

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash.** An unanswered item defaults to NOT MERGED. **Round 27 has not run**; the packet is `docs/review/round-27-packet.md` (Tier 1 — the full closure set), and the deltas ADR that is its spine is `docs/adr/0037-7c-sensitive-pair-deltas.md` (`Status: proposed`).

### What this branch delivers

The plan's "### 7C" table verbatim (`docs/review/slice-7-plan.md`), from `origin/main` @ `18c362d` (PR #33, the ADR-0036 round-26 rulings — the entry condition's discharge), red→green per unit with the failure signature in every red commit. **Migrations: NONE** (5 of ≤ 6 stands; M6 closes UNCONSUMED; `supabase/` byte-identical to base by tree hash). **Dependencies: 0** (13/15 dev, the reserve UNSPENT through a fourth slice). `PROMPT_VERSION` hc-6b-3 does not move. Nothing is production-activated.

- **C2 — the fence FIRST, then the detail and the bounds.** `tests/lint/byte-path-fence.test.ts` committed before the viewer existed: ONE `asServiceRole()` consumer by filesystem scan, `createSignedUrl` in exactly that file, no second bytes route, `getPublicUrl` nowhere. One detail page, three depths decided by `hc.visible_at` in the row read — at `summary` sentences with NO disabled control; a hidden document is the one 404 with THE ROW DECIDING FIRST (the r3 gate catch, pinned). The bounds: 4 KiB ingress caps answering 413 before any parse, `withRouteBudget` with every hop raced, the TUS creation's pre-read `Upload-Length` refusal, the five upload-path fetches time-bounded, all SEVEN auth submits budgeted with every `e=slow` marker read by its page — **OW-07/16/19/23 CLOSED(`f1cfc33`)**.
- **C1 — the list.** ONE RLS-true fetch, tab counts and rows over exactly what RLS returned; *Nothing filed yet.*; "Add a document" is a LINK to the existing upload page — an ingestion, never an input; an in-flight upload wears `hc.product_state`'s §4.2.2 label.
- **C3 — People + the plain line + the tier-aware nav.** The plain-language line per subject from ONE module (`lib/permissions/phrases`, pinned LIVE against `hc.access_level` and `hc.tier_defaults`; hidden deliberately has NO word) rendered before any matrix; both settled limits SAID on screen; send-again RETIRES the old token through `hc.revoke_invite` and the fresh invite rides the ONE create path, its subject scope consciously re-chosen. `navFor(tier)` composed client-side from the same module the vitest pins drive (the r1 gate catch: a function cannot cross the RSC boundary); unknown falls OPEN — the surfaces refuse for themselves.
- **C4 — adjust / revoke / contribution.** Lower posts straight through; a raise rides the `hc-step-up` cookie as three `rs/rd/rl` params (`safeNext` refuses a colon — the r3 catch), consumed by `hc.set_grant`; the care ceiling never offered above itself, the DB refusing regardless (driven live WITH a valid token). Revocation: the pre-revocation artifact URL from a dedicated member's live context becomes the one 404; *"a file already downloaded to someone's device cannot be recalled"* in those words; the unreached channels NAMED. Contribution as plain counts, RLS-true, nothing chart-shaped in the rendered tree.
- **C5 — the log, the subject's page, RCP-02.** Every entry a sentence with both levels; denials collapsed, never naming an object; the filter IS `access_log_select`; PRINTS as the same filtered read. Every receipt link now RESOLVES — a document to ITS page, a profile fact to the subject's page (Q4(b)'s Phase-1 home), an episode to the Timeline where its wrapper renders — and *"opens in an upcoming update"* is GONE from the tree.
- **C6 — the legs, the manifest, the copy.** The gate grows 45 → **57** (5 documents legs + 7 people legs); the machine-read sibling is ONE component on both surfaces (§6.9's exact label, a toggle that classifies, never a dead link); A11Y-10/11 built into the surfaces.

**Coverage:** eighteen rows moved at close-out — DOC-01..05, PPL-01..05, NAV-01, RCP-02, A11Y-10/11 green; DOC-03/04 complete their 7A halves; **TSK-03/04 flip on exactly ADR-0036 Q-H's condition** (their leg inside the complete 57/57 run at the 7C head, never early); LOG-01/02 gain appended surface halves. UXA-04 stays pending until round 27 reads the copy (homes enumerated in the packet); LOG-03 never green. **`docs/owed.md`: OPEN 6/25 · TAKEN 1 · RISK 1 · CLOSED 15; re-tally 29/29 mechanical.**

### Evidence, at ONE declared head — `ccd854b`

Every commit past it is docs-only (`git diff --name-only ccd854b..HEAD -- . ':(exclude)docs'` returns empty; per-directory tree binding measured in the packet). Clean-leg reset **exact 74** · pgTAP **69 files, Σ 1,809, PASS** (teed) · concurrency **82/82** (teed) · vitest **1315 / 99 files by run** (1168/90 at the base; one recorded forks-worker transient, re-run once) · lint / typecheck / production build **solo, exit 0** · gitleaks (CI-identical container) **571 commits, no leaks** · evidence vault-side at `04-evidence/round-27-gate-ccd854b/`.

**The gate — five runs, every stop named, said plainly (ADR-0037 D11).** r1 INTERRUPTED (the RSC functions-as-props layout error, mechanism named, orphans killed) · r2 a recorded mis-invocation (`--trace on` split into a positional file filter — not a gate result) · r3 **52/57** (five reds, five mechanisms — ONE product defect, the hidden-document 200, fixed with its pin) · r4 **56/57** (one REAL WCAG 2.2 target-size failure — `.action-link` born, joined to the enumerated touch-targets pin) · **r5 COMPLETE GREEN 57/57, 17.3 min, at `ccd854b`**. No leg was ever re-run to green; every red between runs has a commit carrying its mechanism; r3/r4 failure traces retained (r5's per-test traces were not — Q-E, said rather than hidden).

### What is NOT claimed

Search and claim/self-assignment (slice 8, ADR-0036 Q-D) · the notification and export channels (RLS-11b/DEL-01 — named on the revocation screen) · an episode page (Q-B) · a hosted runtime under an auth fault (OW-09; the cache-control observation rides it, Q-D) · `db:verify` and the upgrade leg at this head (no DDL to exercise — said in the packet, the round's to re-rule) · r5 per-test traces (Q-E) · UXA-04 until read (Q-F) · G4/G7 block, G9 OPEN, the band allowlist EMPTY, SIG-01 NOT absorbed.

### The six pointed questions (recommended answers in ADR-0037 and the packet)

Q-A a document share reaches the ROW, not the arrival's bytes or facts (the REV-01 model — accept for Phase 1, or slice-8 DDL) · Q-B the episode receipt link lands on the Timeline · Q-C insurance→finances, a one-line PRD erratum (ADR-0005 binds) · Q-D page cache-control in dev rides the proxy unit pin + prod default; the leg asserts the artifact path · Q-E the r5 trace/reporter record → one T3 owed item to make it config-borne · Q-F UXA-04 read at this round.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
