# Third-party review packet — round 27: the built slice 7C, Documents + People & roles, the sensitive-pair app increment

**Read this file first, top to bottom.** The head ledger is at the top by
design, the tree binding is stated per directory and was measured by command,
and every evidence leg below was produced at ONE declared head. **A packet
cannot name its own SHA**, so the last row of the ledger is a RULE, checkable
at any future head. **The spine of this packet is
`docs/adr/0037-7c-sensitive-pair-deltas.md`** — the deltas ADR
(`Status: proposed`), whose D1–D12 carry the build's full argument. This
packet reproduces its gate record (D11) uncompressed, states the evidence
exactly, and puts the six pointed questions to the round verbatim.

**SETTLED, except what this packet puts.** The slice-7 plan is RULED (Q1–Q6,
2026-08-28); round 24 is ruled and ratified (ADR-0033/0034); round 26 closed
by owner ruling (ADR-0036, PR #33) — its Q-A…Q-H are rulings, not findings,
and **TSK-03/04's hold was discharged on exactly its Q-H condition** (below).
The tier is **T1** (plan-gate ruling, Q3); the browser gate is unconditional
(ADR-0033 D19.14). The migration bound closed at **5 of ≤ 6** at 7A/7B; 7C
ships **no migration** and M6's named window **closes UNCONSUMED**. None of
that is open here. A settled ruling is not a finding — file a dissent.

---

## Head ledger — from the start

| Purpose | SHA | Tree relationship |
|---|---|---|
| Base | `18c362d` | `origin/main` — PR #33, the ADR-0036 round-26 rulings; the entry condition's discharge (two docs-only merges past the `e0a0a3c` evidence base) |
| Evidence head | `ccd854b` | **the last commit that moved a non-docs tree** — 22 commits from base (the red→green pairs, the refactor, the legs, the four gate-repair commits) |
| Docs head | every commit after `ccd854b` | ADR-0037, `docs/coverage.md` (the close-out flip), this packet, the PR body — **docs-only, by the rule below** |

**The rule that replaces a SHA:** every commit after the evidence head is
docs-only. Verify it — do not take it:

```
git diff --name-only ccd854b..HEAD -- . ':(exclude)docs'
```

returning **empty** (it returned empty when this packet was written, and the
packet's own commit keeps it true). Per-directory tree binding, measured with
`git rev-parse <sha>^{tree}:<dir>`:

- **Evidence head → docs head:** `app/` · `lib/` · `components/` ·
  `supabase/` · `e2e/` · `tests/` · `scripts/` all **byte-identical**;
  `docs/` moved. Every leg below therefore binds at the docs head.
- **Base → evidence head:** `supabase/` and `scripts/` **byte-identical to
  base** — no migration, no pgTAP file, no concurrency case moved; `app/`,
  `lib/`, `components/`, `e2e/`, `tests/` moved — the app increment.

**Documents that moved after the evidence head:**
`docs/adr/0037-7c-sensitive-pair-deltas.md` (new), `docs/coverage.md` (the
close-out flip, counted below), `docs/review/round-27-packet.md` (this file),
`docs/review/round-27-pr-body.md`. `docs/owed.md` moved **before** the
evidence head (`ed95c14` — the four C2 bounds rows CLOSED with their
evidence) and is part of the evidence tree.

---

## What 7C is

The plan's "### 7C" table verbatim: **C2 the fence FIRST** then the detail
and the bounds · **C1** the list · **C3** People + the tier-aware nav ·
**C4** adjust/revoke/contribution · **C5** the log + the subject's page +
RCP-02 · **C6** the legs, the manifest, the copy. The sensitive pair is the
two surfaces where a defect is a disclosure: Documents (bytes and facts) and
People & roles (who may see what, said in plain language).

**Migrations: NONE** — 5 of ≤ 6 stands; M6's named window closes UNCONSUMED;
`supabase/` is byte-identical to base (measured above). **Dependencies: 0
runtime, 0 dev** (13/15; the dev reserve UNSPENT through a fourth slice).
`PROMPT_VERSION` `hc-6b-3` does not move; no unit touches `lib/ai/`.
**Nothing is production-activated** — G4/G7 block, G9 stays OPEN, G3 open,
the band allowlist EMPTY, SIG-01 NOT absorbed.

**Authority:** the plan (C-rows BINDING) → PRD §4.3, §4.6, §7.5–§7.6 → TSD
§1.3, §3.4, §3.11, §5.7–§5.8, §6.9 → ADR-0032/0033 (the 7A functions) →
ADR-0036 (round 26's rulings: Q-B's OW-23 homed here; TSK-03/04 held to THIS
gate) → `docs/coverage.md`.

---

## The commits (red → green per unit, the signature in every red)

| Unit | Red | Green | Failure signature in the red |
|---|---|---|---|
| C2 the fence | — | `1473775` | test-only, the B1 OW-01 shape: 8/8 on the untouched tree — the point is that it passed BEFORE the viewer existed |
| C2 `lib/hc/documents` | `9dcadf1` | `28d3440` | `Cannot find package '@/lib/hc/documents'` — 17 skipped |
| C2 the detail + 3 writes | `6caf25c` | `fa71ebe` | `Cannot find package '@/app/(app)/[circle]/documents/[document]/page'` — 17 failed |
| C2 the bounds (OW-07/16/19/23) | `e30589a` | `f1cfc33` | 10 failed / 26 passed — every bound named and missing |
| C1 the list | `a21b8c2` | `34c1b80` | `documentsFor is not a function` · the page package missing — 12 failed |
| C3 People + phrases + nav | `1f41b43` | `a194c62` | three packages missing — 11 failed, 11 skipped |
| C4 adjust/revoke/contribution | `ccb2aa1` | `e225fe3` | `setGrant is not a function` · the member page missing — 17 failed |
| C5 log/subject/receipt | `be99476` | `539c46e` | `accessLog is not a function` · "opens in an upcoming update" still on the tree — 15 failed |
| C6 machine-read extraction | — | `dfbf70c` | refactor: ONE component, both surfaces |
| C6 the legs (57 total) | — | `a449282` | spec additions + proxy no-store + registries |
| C6 gate repairs | — | `4a77abe` `1d7fc36` `acbf0bd` `ccd854b` | each carries its run's verbatim mechanism — the gate record below |

---

## The deltas — ADR-0037 D1–D10, D12, the spine

Read them there in full; what each one is:

- **D1 — the byte path, asserted before the viewer existed.**
  `tests/lint/byte-path-fence.test.ts` was the FIRST commit: one
  `asServiceRole()` consumer by filesystem scan (closing the hole the ESLint
  allowlist glob leaves), `createSignedUrl` in exactly that file, no other
  route streaming a storage body, `getPublicUrl` nowhere — comment-carved
  with controls (traps §9). The viewer renders plain `<img>` pages through
  `/api/artifact/[arrival]?page=N` (next/image's optimizer would BE a second
  byte path).
- **D2 — one detail page, three depths, and the r3 catch.** `can_view` (the
  arrival's view×5, REV-01's one resolution) and `can_manage` asked of
  `hc.visible_at` once, in the row read; `extractionsFor` never called below
  `can_view`; at `summary` sentences with NO disabled control. Gate r3
  caught the one dishonesty the unit tests structurally could not: a hidden
  document's parallel references read answered 200 "couldn't load" instead
  of the one 404 — **the row decides FIRST** now, pinned in
  `tests/routes/document-detail.test.ts`.
- **D3 — the bounds landed where the waits are** (OW-07/16/19/23
  CLOSED(`f1cfc33`)): 4 KiB ingress caps answering 413 before any parse,
  `withRouteBudget` with every hop raced, the TUS creation's pre-read
  `Upload-Length` refusal, the five upload-path fetches each time-bounded,
  all SEVEN auth submits inside the budget (D6 said five; the disk holds
  seven — the class is held, the OW-17 precedent, said in the scanner),
  every `e=slow` marker READ by its page.
- **D4 — send again is a NEW invite.** The request role holds NO grant on
  `public.invites`; `retireInvite` revokes through `hc.revoke_invite` (the
  wrapper's first caller); the fresh invite rides the ONE create path with
  its subject scope consciously re-chosen — a narrowing, named.
- **D5 — the plain line, from one module.** `lib/permissions/phrases` maps
  exactly `hc.access_level` MINUS `hidden` to words — hidden HAS no word by
  design, so an unworded level can never leak into a sentence — pinned LIVE
  against the enum and `hc.tier_defaults`. Null is "not yours to know" and
  renders NOTHING. Both settled limits are SAID on the surface.
- **D6 — adjust: `rs/rd/rl`, because `safeNext` refuses a colon.** Lower
  posts straight through; a raise rides the `hc-step-up` cookie bound to
  `member:subject:domain`, consumed by `hc.set_grant`. Gate r3's catch: the
  colon-joined `?raise=` param was refused by `safeNext` (':' is
  scheme-shaped) — three params now, validated against the domain/level
  sets. The care-circle ceiling comes from the ONE tiers module and the DB
  refuses regardless (driven live WITH a valid token).
- **D7 — revocation, and the honesty of the cached-responses channel.**
  AC-PPL-4's letter driven over REAL promoted bytes; *"a file already
  downloaded to someone's device cannot be recalled"* in those words; the
  unreached channels NAMED on screen. `proxy.ts` stamps `private, no-store`
  on every pass-through (unit-pinned); the artifact route says it for itself
  and the LEG asserts it there — but the DEV server rewrites page headers
  after the proxy, so the page half rests on the unit pin plus the prod
  default. **Q-D.**
- **D8 — every receipt link resolves (RCP-02), and the log prints itself.**
  Documents to THEIR page; profile facts to the subject's page (Q4(b)'s
  Phase-1 home); an episode to the Timeline where its wrapper renders
  (**Q-B**); *"opens in an upcoming update"* is GONE from the tree. The log
  renders who · what · whom · subject · domain · when with both levels,
  denials collapsed and never naming an object, and PRINTS as the same
  filtered read.
- **D9 — the nav follows access, and the tier crosses the boundary, not the
  entries.** `navFor(tier)` computed client-side from the same module the
  vitest pins drive (gate r1's lesson: a function-valued `href` cannot cross
  the RSC boundary); unknown falls OPEN — hiding is a courtesy, the surfaces
  refuse for themselves, the hand-built adjust URL the one 404 from a live
  context.
- **D10 — the machine-read sibling is ONE component on both surfaces**,
  extracted from ReviewScreen verbatim: a toggle that fetches through the
  fence and CLASSIFIES — absent/empty/failed each said — never a raw
  `&text=1` navigation; §6.9's exact label everywhere, by construction.
- **D12 — narrowings and observations, named.** (1) A document share
  reaches the document ROW, not the arrival's bytes or facts — the
  DATABASE's standing REV-01 model rendered truthfully, **Q-A**. (2) The
  list's empty-state sentence is the vitest contract's; the e2e leg asserts
  the filled shape (a leg needing emptiness has a hidden precondition).
  (3) `insurance → finances` is ADR-0005's ruling where PRD §4.3.2's prose
  says documents — **Q-C**. (4) Contribution counts are RLS-true — over
  what the READER may see. (5) One `.vitest` forks-worker transient shape,
  recorded, re-run once, clean.

---

## THE GATE at `ccd854b` — five runs, every stop named, r5 COMPLETE GREEN 57/57 (D11, nothing compressed)

The gate is **57 legs** (45 + the 5 documents legs + the 7 people legs —
`e2e/documents.spec.ts`, `e2e/people.spec.ts`, new at `a449282`).
`docker stats hc_clamd` ≈ 0 % and its reload complete before every run;
`NODE_OPTIONS=--max-old-space-size=1536` throughout; both specs carry 420 s
in-file per-leg budgets.

| Run | Head | Tally | What stopped it (verbatim class, from the teed log and retained traces) |
|---|---|---|---|
| r1 | `ed95c14` | INTERRUPTED | every circle page: `Functions cannot be passed directly to Client Components` — the layout passed `entries` (function-valued `href`) across the RSC boundary; stopped with the mechanism named, orphans killed |
| r2 | `1d7fc36` | 24/24 of a SUBSET — **not a gate result** | `npm run test:e2e -- --trace on` split, and `on` became a positional FILE FILTER matching exactly the three specs with "on" in their names (onboarding, ingestion, extraction); recorded as a mis-invocation, `--trace=on` thereafter |
| r3 | `1d7fc36` | **52/57**, 16.9 min | five reds, five mechanisms: the hidden-document 200 (PRODUCT — D2); the two axe calls missing a11y.spec's CONTRAST_EXEMPT (leg); the colon-joined raise param refused by safeNext (D6); the page cache-control assertion reading what the dev server rewrites (leg — D7). Traces retained |
| r4 | `acbf0bd` | **56/57**, 22.0 min | ONE red, one mechanism: axe `target-size` — bare inline action links at 16 px, a REAL WCAG 2.2 failure; `.action-link` joined the 44 px floor and the enumerated touch-targets pin. Trace retained |
| r5 | `ccd854b` | **57/57 GREEN, 17.3 min** | nothing. One evidence note, said rather than hidden: with the `--reporter=list,json` override the per-test traces were not retained for the green run — the teed log and its tally are the run record; the JSON reporter env-file never materialised in any run (**Q-E**) |

**No leg was ever re-run to green**: every red between runs has a commit
whose message carries its mechanism (`4a77abe`, `1d7fc36`, `acbf0bd`,
`ccd854b`), and r5 is one complete run at one head. One product defect
crossed the whole gate history — r3's hidden-document 200 — and it is fixed
with its pin, not argued.

---

## Verification evidence (local, ONE declared head: `ccd854b`)

Complete summary lines, no grep-filtered chains. Tallies read from output
text and the JSON `run.json`, never from `$?` (traps §4).

- **Clean-leg reset exact 74** — `verify-migration-state` exact; no 7C
  migration exists, so the clean leg IS the 74-migration state.
- **pgTAP 69 files, Σ 1,809, PASS** (14 s), teed.
- **Concurrency 82/82** (54 cases), teed — case 1's `40P01`s are PLT-02's
  deliberate repro.
- **vitest 1315 / 99 files by run** (`.vitest/run.json` at the evidence
  head, re-measured AFTER the gate-repair commits added their pins;
  1168/90 at the base — 7C adds 9 files, 147 tests). An earlier full-suite
  invocation hit the recorded forks-worker transient shape (exit 255 with
  `run.json` success:true, zero failures) — re-run once, clean (D12.5).
- **The browser gate: the D11 table above** — r5 COMPLETE GREEN **57/57**,
  17.3 min, at exactly this head.
- **lint solo exit 0** · **typecheck solo exit 0** (one generated-file
  casualty of the killed dev server, regenerated by the build) ·
  **production build solo exit 0**.
- **gitleaks** (the CI-identical digest-pinned container): **571 commits
  scanned, no leaks found**.
- **Owed:** OW-07/16/19/23 **CLOSED(`f1cfc33`)**; **OPEN 6/25** (OW-08, 09,
  10, 12, 13, 14 — all plan-named NOT-THIS-SLICE or owner-track) · TAKEN 1
  (OW-05's standing Tier-3 quota) · RISK 1 (LOG-03) · CLOSED 15; the
  re-tally **29/29 mechanical** (`tests/lint/process.test.ts` inside the
  vitest run).
- **NOT run at this head, said plainly:** `db:verify` and the upgrade leg —
  both exist to exercise DDL, and 7C ships none; `supabase/` is
  byte-identical to base by tree hash (the ledger above), so the clean-leg
  reset at exact 74 plus pgTAP on it are the migration-state evidence. If
  the round rules otherwise, both run at the dispositions head.
- **Artifacts, vault-side** (`projects/harpers-circle/04-evidence/round-27-gate-ccd854b/`):
  the five teed run logs (`7c-gate-r1..r5.log`), r3/r4 failure traces and
  screenshots preserved before any re-run, the `.vitest/run.json` pair.

---

## Coverage rows — counted by command, not by eye

**Eighteen rows moved** in `docs/coverage.md` at the close-out commit
(measured: 18 changed table rows; the close-out commit message says
"nineteen" — the measured count is the record, the round-16 lesson applied).

- **Sixteen rows read green on the observed run:** DOC-01, DOC-02, DOC-05,
  PPL-01…PPL-05, NAV-01 (the 7C composition half completing the row),
  RCP-02, A11Y-10, A11Y-11 flip; DOC-03 and DOC-04 complete — their pgTAP
  halves were 7A's, their app halves land here; **TSK-03 and TSK-04 flip on
  exactly ADR-0036 Q-H's condition** — their leg passed inside the COMPLETE
  57/57 run at the 7C head, never early.
- **LOG-01 and LOG-02** gain appended surface halves (PPL-04's page renders
  what `access_log_select` decided — adds nothing, subtracts nothing).
- **UXA-04 stays `pending`** until THIS round reads the copy (Q-F; homes
  below). **LOG-03 is never green** — the accepted-risk row, carried by
  OW-04's `RISK(LOG-03)`.

## UXA-04's copy homes — what the round reads, where it lives

Every member-facing string 7C ships, by file:

- `lib/permissions/phrases.ts` — the plain-language words and phrases for
  every level (hidden deliberately unworded), the ONE module every People
  sentence draws from.
- `app/(app)/[circle]/people/page.tsx` — the list: the plain line before
  any matrix, the §7.5 custodian framing (never "authority"), both stated
  limits, the invite copy (`Invited · expires …` / `Invite expired · send
  again`).
- `app/(app)/[circle]/people/[member]/page.tsx` — the adjust matrix's
  wording, the revocation copy: *"a file already downloaded to someone's
  device cannot be recalled"* with the unreached channels named
  (notifications, exports — RLS-11b/DEL-01), and contribution's honest
  words (*"Hasn't been active yet."*).
- `app/(app)/[circle]/people/subject/[subject]/page.tsx` — the
  custodianship declaration, said the smaller true way (Q4(b), Q-E's rule:
  rendered where D4's log×5 bound shows it, claimed nowhere it doesn't).
- `app/(app)/[circle]/people/log/page.tsx` — the log's sentences: who ·
  what · whom · subject · domain · when, both levels, denials collapsed and
  never naming an object; the print projection.
- `app/(app)/[circle]/documents/[document]/page.tsx` — the
  re-categorisation confirmation (the exact audience by name and direction,
  the domain move in §4.3.2's words), the share/unshare copy (§4.3.5's
  rules said on screen), §6.9's exact machine-read label.
- `app/(app)/[circle]/documents/page.tsx` — *"Nothing filed yet."*, the
  in-flight upload row wearing `hc.product_state`'s §4.2.2 label.
- The `app/(auth)/*` pages that read their `e=slow` marker — sign-in,
  create-account, reset, reset/confirm, accept/[token], wasnt-me — the
  honest-overrun auth copy (OW-23, R5/F-7).

---

## Pointed questions for round 27 (recommended answers inline — an unanswered question defaults to NOT PLANNED)

**Q-A · A document share reaches the ROW, not the arrival's pages or facts**
(D12.1 — the DB's standing REV-01 model: `can_view` stays the ARRIVAL's
view×5, which an object share on the document does not satisfy; the
share-holder reads title, category, dates, sentences). **Recommended: ACCEPT
as the §4.3.5 reading for Phase 1** ("the one discharge instruction" = the
filed document at its summary depth) and note it beside AC-DOC-5; if the
owner wants share-includes-bytes, that is a slice-8 DDL question, not an app
fix.

**Q-B · An episode's receipt link resolves to the Timeline**, where its
wrapper renders — no episode page exists and none was promised.
**Recommended: ACCEPT**; RCP-02's "resolves to the created object" is met by
the surface that renders it.

**Q-C · PRD §4.3.2's prose maps Insurance to documents; the shipped
ADR-0005 map (and everything built on it) says finances.** The live test
asserts the ADR's ruling with the cite. **Recommended: a one-line PRD
erratum at sign-off; the ADR binds.**

**Q-D · The dev server rewrites page `cache-control` after the proxy**, so
the pages' `private, no-store` rests on the unit pin + the prod default
while the LEG asserts it on the artifact path (where caching bites).
**Recommended: ACCEPT with the split stated in PPL-03's cell** (as written);
a hosted-runtime header observation rides OW-09's owner track.

**Q-E · r5's per-test traces were not retained** (the reporter override)
and `PLAYWRIGHT_JSON_OUTPUT_FILE` never produced its file in any run.
**Recommended: accept the teed log + tally as the r5 record** (r3/r4
failure traces ARE retained), and open a small T3 owed item to put
`reporter` and the JSON path INTO `playwright.config.ts` so the next gate's
record is config-borne, not flag-borne. This is the one owed row this round
is expected to write.

**Q-F · UXA-04: read the copy.** The People & roles sentences, the
revocation copy and the re-categorisation confirmation are ON the surfaces —
the homes are enumerated above. The row flips (or the findings land) at this
round, as the row says.

---

## What is NOT claimed

- Search (AC-DOC-1/4's search halves) and claim/self-assignment — slice 8
  (ADR-0036 Q-D).
- The notification and export channels (RLS-11b / DEL-01) — said on the
  revocation screen, not reached.
- An episode page (Q-B names the resolution that exists instead).
- A hosted runtime under an auth fault (OW-09, owner track); the hosted
  cache-control observation rides it (Q-D).
- `db:verify` and the upgrade leg at this head — no DDL to exercise; said
  in the evidence section, the round's to re-rule.
- r5 per-test traces (Q-E — the teed log and tally are the run record).
- The OW-05 Tier-3 leg-integrity quota — a round-close artifact, not a
  packet artifact; its standing TAKEN row is unchanged here.
- G4/G7 still block · G9 OPEN · G3 open · the band allowlist EMPTY ·
  SIG-01 NOT absorbed · `PROMPT_VERSION` `hc-6b-3` unmoved · nothing
  production-activated.
- UXA-04 — pending until this round reads it (Q-F).
- LOG-03 — never green, by ruling.

---

## Addendum — auditability block

- **Local evidence:** produced at `ccd854b`'s tree, quoted verbatim above;
  the docs commits after it move no directory any leg binds to (tree
  binding, measured).
- **PR:** opened from this session as `[DO NOT MERGE without owner
  sign-off] Slice 7C — Documents + People & roles, the sensitive-pair app
  increment`, base `main`, head `slice/7c-sensitive-pair`; body checked in
  at `docs/review/round-27-pr-body.md`. The head SHA and commit count are
  read from the API at the moment they matter, never from this file (the
  round-17 F-4 lesson). GitHub's "Able to merge" is mechanical — not
  ADR-0006 satisfied.
- **Pins:** no drift — Supabase CLI as pinned, image
  `public.ecr.aws/supabase/postgres:17.6.1.106`, Node 22.15.0.
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs supabase/migrations` ·
  `npm run test:db` · `npm run test:concurrency` (teed) · `npm run
  test:e2e -- --trace=on` (NEVER `--trace on` — r2) · `npm run test:app` ·
  `npm run lint` · `npm run typecheck` · `npm run build` · gitleaks via the
  digest-pinned image with `--log-opts` from the primary repo.
- **CI:** no run number lives in this packet (round-17). CI is KEYLESS and
  does not run Playwright — the 57-leg gate is LOCAL evidence only, and no
  CI run can upgrade it. `gh` stays UNAUTHENTICATED for the reviewer:
  per-step conclusions are readable, suite tallies are not. A "Start local
  Postgres" `toomanyrequests` failure is the ECR Public anonymous quota,
  never a repo defect — re-run later.
- **Next leg after this packet:** the round-27 review — Tier 1, fresh
  session, findings landed VERBATIM (`docs/review/round-27-findings.md`)
  before anything is argued. Then dispositions, owner sign-off, merge
  commit never squash.
