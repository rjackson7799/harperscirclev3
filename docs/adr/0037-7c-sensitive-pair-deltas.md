# ADR-0037 — Slice 7C: Documents + People & roles, the sensitive-pair app increment — deltas as built, and the round-27 packet

**Status:** proposed — the 7C build record, put to round 27 (**Tier 1**: the
full closure set, ruled at the plan gate, Q3; the browser gate unconditional,
D19.14).
**Branch:** `slice/7c-sensitive-pair`, from `origin/main` @ `18c362d` (PR #33,
the ADR-0036 round-26 rulings — the entry condition's discharge; two docs-only
merges past the `e0a0a3c` evidence base).
**Date:** 2026-08-31. **Evidence head:** `ccd854b` — every commit past it
docs-only.
**Scope:** the plan's "### 7C" table verbatim — C2 the fence FIRST then the
detail and the bounds, C1 the list, C3 People + the tier-aware nav, C4
adjust/revoke/contribution, C5 the log + the subject's page + RCP-02, C6 the
legs, the manifest, the copy. **Migrations: NONE** (5 of ≤ 6 stands; M6's
named window closes UNCONSUMED; nothing under `supabase/` moved).
**Dependencies: 0 runtime, 0 dev** (13/15; the reserve UNSPENT through a
fourth slice). `PROMPT_VERSION` does not move. Nothing is production-activated.
**Authority:** the plan (C-rows BINDING) → PRD §4.3, §4.6, §7.5–§7.6 → TSD
§1.3, §3.4, §3.11, §5.7–§5.8, §6.9 → ADR-0032/0033 (the 7A functions) →
ADR-0036 (round 26's rulings: Q-B's OW-23 homed here; TSK-03/04 held to THIS
gate) → `docs/coverage.md`.

---

## AMENDED BY ROUND 27 — the head index (ADR-0038, RATIFIED 2026-08-31)

**Nothing below is rewritten.** Round 27 found seven sentences in this ADR that
the tree falsifies or outruns; the original prose stands and each site carries a
marker. This index is the whole list, so a later reader cannot miss one.

| Site | What round 27 found | Finding |
|---|---|---|
| **D1** | The fence's GUARANTEE is narrower than the sentence claims. Four literal-name predicates, three shipping no control; it survives none of a re-export from `lib/db/**`, `createSignedUrls` (the plural escapes the word boundary), a byte-returning reader in `lib/storage/artifacts`, or `next/image`. Its REFERENT is clean — that was re-verified | R1/F-1, F-2, F-3, F-5 |
| **D3** | *"every hop raced"* is false for the ingress read: `boundedJsonText`'s `req.text()` runs BEFORE `withRouteBudget` opens on both upload routes. OW-07 and OW-19 still stand CLOSED — this is a sixth hop neither named — and it is carried by OW-24 | R5/F-1 |
| **D5** | *"hidden HAS no word"* is a MODULE-scoped property, not a tree-wide one: `people/log/page.tsx` and the adjust matrix both word it, correctly. And the line does not NAME a hidden domain but does not conceal that one exists — non-mention is weaker than non-inference, and it is harmless only because `hc.circle_people` guards member levels | R4/F-9 and R4's dissent |
| **D7** | *"stamps `private, no-store` on every pass-through"* has one uncovered branch: `proxy.ts:30` returns before the stamp at `:67` when the Supabase env vars are unset. Q-D ratified with this folded into PPL-03's cell; the one-line fix lands at 7D | R5/F-2 |
| **D8** | *"'opens in an upcoming update' is gone from the tree"* is **FALSE** at the evidence head — the string renders at `app/(app)/[circle]/timeline/[event]/page.tsx:137`, on a file 7C never touched, and a comment at `inbox/[arrival]/page.tsx:284` asserts its absence. Separately, the episode receipt link drops the `subjectId` `receiptLine` carries. And the C5 subject page shipped at `/[circle]/people/subject/[subject]`, not the plan's `/[circle]/people/[subject]` — a necessary disambiguation, unrecorded until now | R4/F-1, F-2, and R4's dissent |
| **D10** | *"absent/empty/failed each said"* holds for three arms of four. The 404 arm renders a claim about STORAGE out of answers that are not about storage — every authorization refusal and every non-timeout storage error becomes *"No machine-read text is stored for this page."* | R1/F-4 |
| **D12.1** | The enumeration understates: the row also carries the approver's name and the approval date, and the page shows them. Amended by Q-A to *"title, category, dates, the sentences, and who approved it and when"* | Q-A, R2's answer |

**Two narrowings D12 does not name, ruled at round 27 and added here:**
**(8)** the re-categorisation preview names the DOCUMENT audience only —
`hc.document_audience_derived` has zero callers, so ADR-0034 D7's ruling that the
preview names the derived objects is UNMET (R2/F-2, accepted, fixed at 7D, not
re-read as a narrowing); **(9)** AC-DOC-6's refusal half has no app-layer
evidence at any level — the offer is unfiltered and `audience_refused` is
flattened into `loadFailed` (R2/F-1).

The verdicts and their arguments: `docs/review/round-27-dispositions.md`. The
rulings: `docs/adr/0038-round-27-dispositions.md`.

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
| C6 gate repairs | — | `4a77abe` `1d7fc36` `acbf0bd` `ccd854b` | each carries its run's verbatim mechanism — D11 |

## D1 — the byte path was asserted before the viewer existed, and stayed one path

> **AMENDED (ADR-0038, round 27):** the REFERENT is clean and re-verified; the FENCE's guarantee is narrower than this section claims — see the head index, R1/F-1/F-2/F-3/F-5. Exact-set importer pins land at 7E.

`tests/lint/byte-path-fence.test.ts` (the FIRST commit): the sanctioned
`asServiceRole()` consumer is ONE FILE by filesystem scan — closing the hole
the ESLint allowlist glob leaves (a second `route.ts` inside
`app/api/artifact/**` would import the credential legally) — plus
`createSignedUrl` in exactly that file, no other route streaming a storage
body, `getPublicUrl` nowhere, comment-carved with controls (traps §9). The
viewer renders every page as `<img src="/api/artifact/[arrival]?page=N">`
(the plain-`<img>` ruling carried from ReviewScreen: next/image's optimizer
would BE a second byte path and a second retention surface).

## D2 — one detail page, three depths, and the r3 catch

`can_view` (the arrival's view×5 — REV-01's one M2/M5-unified resolution)
and `can_manage` are asked of `hc.visible_at` itself, once, in the row read;
`extractionsFor` is never called below `can_view`. At `summary` the page is
a list of sentences with NO disabled control (settled item 2). **Gate r3
caught the one dishonesty the unit tests structurally could not**: with the
row and `hc.document_references` read in parallel, a hidden document's
`references_refused` landed in the catch-all and answered 200 "couldn't
load" instead of the one 404. THE ROW DECIDES FIRST now, and the pin is
`tests/routes/document-detail.test.ts` (a rejecting references read with a
null row is still `NEXT_NOT_FOUND`).

## D3 — the bounds landed where the waits are (OW-07/16/19/23 CLOSED at f1cfc33)

> **AMENDED (ADR-0038, round 27):** *"every hop raced"* is false for the ingress read (R5/F-1). OW-07/OW-16/OW-19/OW-23 all stand CLOSED; the sixth hop is OW-24.

Both upload routes: a 4 KiB ingress cap answering 413 BEFORE any parse or
probe, and `withRouteBudget` with every hop raced. The TUS creation refuses
a missing or over-cap `Upload-Length` before a byte lands — the per-file
pre-read bound. The five upload-path fetches each carry a named time bound.
`budget.ts`'s localisation sentence is MARKED with the round-20 qualifier,
never rewritten. All SEVEN auth submits answer inside `withRouteBudget`
(D6 said five; the disk holds seven — the class is held, the OW-17
precedent, said in the scanner), every `e=slow` marker READ by its page
(R5/F-7); create-account's overrun runs the round-10 compensation before
surfacing; wasnt-me's kill absorbs its own overrun deliberately (the kill
is durably owed; done=1 stays the truthful answer).

## D4 — send again is a NEW invite, and the invites table stayed definer-only

The request role holds NO grant on `public.invites` (the token hash lives
there), so the old invite's subject scope is not the app's to copy.
`retireInvite` revokes through `hc.revoke_invite` — the wrapper's first
caller — and the coordinator lands on the EXISTING invite form prefilled
with address and tier; the fresh invite rides the ONE create path with its
subjects consciously re-chosen, the token shown once through the same 120 s
cookie mechanism. A narrowing, named: the original invite's subject scope
is re-chosen rather than copied.

## D5 — the plain line, from one module, with hidden deliberately unworded

> **AMENDED (ADR-0038, round 27):** *"hidden HAS no word"* is module-scoped, not tree-wide, and non-mention is not non-inference (R4/F-9 — ACCEPTED-NOTE, no code).

`lib/permissions/phrases` maps exactly `hc.access_level` MINUS `hidden` to
words and phrases — hidden HAS no word by design, so an unworded level can
never leak into a sentence — pinned LIVE against the enum and
`hc.tier_defaults` (the tiers.ts discipline). The line groups by level and
names domains only when mixed; a hidden domain is simply not mentioned;
null is "not yours to know" and renders NOTHING. Both settled limits are
SAID on the surface.

## D6 — adjust: rs/rd/rl, because safeNext refuses a colon

Lower posts straight through; a raise rides the `hc-step-up` cookie
(the assign route's consumer pattern) bound to `member:subject:domain` and
consumed by `hc.set_grant`. **Gate r3's catch**: the colon-joined
`?raise=subject:domain:level` in the step-up `next` was refused by
`safeNext` (':' is scheme-shaped) and the founder landed on `/account` —
three params now, validated against the domain/level sets. The care-circle
ceiling comes from the ONE tiers module, offers NOTHING above itself and no
other domain, and the DB refuses regardless (driven live WITH a valid
token).

## D7 — revocation, and the honesty of the cached-responses channel

> **AMENDED (ADR-0038, round 27):** one pass-through is unstamped — `proxy.ts:30`'s missing-env early return (R5/F-2). Q-D ratified with this folded into PPL-03.

The revoke leg is AC-PPL-4's letter: the artifact URL fetched by a
DEDICATED member before, the removal through the EXISTING route wearing
*"a file already downloaded to someone's device cannot be recalled"* in
those words, the SAME URL from her live context the one 404, her sessions
dead, the unreached channels NAMED on the screen. Cached responses,
honestly: `proxy.ts` stamps `private, no-store` on every pass-through
(pinned in `tests/app/proxy.test.ts`), the artifact route says it for
itself and the LEG asserts it there — but the DEV server rewrites page
headers after the proxy (r3 read `no-cache, must-revalidate`), so the page
half rests on the unit pin plus the prod default. **Q-D below.** The
remove route now collects every `keep_share_ids` value (one checkbox per
share); the old comma contract still parses and leg 29 is undisturbed.

## D8 — every receipt link resolves (RCP-02), and the log prints itself

> **AMENDED (ADR-0038, round 27):** *"gone from the tree"* is FALSE (R4/F-1); the episode link drops its subject (R4/F-2, Q-B: fix then accept narrowed); and the subject page's shipped path is a narrowing this ADR never named. See the head index.

Documents to THEIR page; profile facts to the subject's page (Q4(b)'s
Phase-1 home — custodianship framing said the smaller true way, the
declaration rendered where D4's log×5 bound shows it and NOTHING claimed
where it doesn't, Q-E's rule); an episode to the Timeline where its wrapper
renders (**Q-B below** — no episode page exists and none was promised);
*"opens in an upcoming update"* is gone from the tree. The log renders who
· what · whom · subject · domain · when with both levels, denials collapsed
and never naming an object, and PRINTS as the same filtered read
(`@media print` hides chrome and adds nothing — the shell pin widened for
it: print is not a viewport query).

## D9 — the nav follows access, and the tier crosses the boundary, not the entries

`navFor(tier)`: care_circle Tasks · Account; family Timeline · Documents ·
People · Account; coordinator everything; unknown falls OPEN (hiding is a
courtesy; the surfaces refuse for themselves — the hand-built adjust URL is
the one 404, driven from Marisol's live context). **Gate r1's lesson**:
`NavEntry.href` is a function and cannot cross the RSC boundary as a prop —
the layout hands the client nav the TIER string and the composition is
computed client-side from the same module the vitest pins drive.

## D10 — the machine-read sibling is ONE component on both surfaces

> **AMENDED (ADR-0038, round 27):** the 404 arm asserts a storage fact from non-storage answers (R1/F-4 — sentence ACCEPTED, the status split DECLINED for the authorization branches, which would be the oracle §1.3 forbids).

Extracted from ReviewScreen verbatim (the F-5 label history kept): a toggle
that fetches through the fence and CLASSIFIES — absent/empty/failed each
said — never a raw `&text=1` navigation that would land a born-digital
page on a bare 404. §6.9's exact label everywhere it appears, by
construction.

## D11 — THE GATE AT `ccd854b`: five runs, every stop named, and r5 COMPLETE GREEN 57/57

The gate is **57 legs** (45 + the 5 documents legs + the 7 people legs).
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

No leg was ever re-run to green: every red between runs has a commit whose
message carries its mechanism, and r5 is one complete run at one head.

## D12 — narrowings and observations, named

> **AMENDED (ADR-0038, round 27):** D12.1's enumeration is amended (Q-A), and two unnamed narrowings — (8) and (9) — are added in the head index.

1. **A document share does not extend to the arrival's bytes or facts.** The
   share-holder reads the document ROW (title, category, dates, sentences);
   `can_view` stays the ARRIVAL's view×5, which an object share on the
   document does not satisfy. This is the DATABASE's standing model (the
   REV-01 gate), rendered truthfully — **Q-A puts it to the round.**
2. The Documents list's empty-state sentence is the vitest contract's
   (`documents-list.test.ts`); the e2e list leg asserts the filled shape — a
   shared circle accumulates, and a leg needing emptiness has a hidden
   precondition (ADR-0026 D19's class).
3. `insurance → finances` is ADR-0005's ruling (hc.own_domain,
   `20260815230005:71`) where PRD §4.3.2's PROSE says documents — the ADR
   binds and the live test asserts it with the cite; flagged for a PRD
   erratum, not a fix (**Q-C**).
4. Contribution counts are RLS-true — over what the READER may see — the
   only honest count a filtered surface can show.
5. `.vitest` first-invocation exit 255 with `run.json` success:true and
   zero failures: the recorded forks-worker transient shape; re-run once,
   clean tally (1312/1312).

---

## Evidence at ONE declared head — `ccd854b`

`git diff --name-only ccd854b..HEAD` at close-out is docs-only
(`docs/coverage.md`, `docs/owed.md`, `docs/adr/0037…`).

- Clean-leg reset **exact 74** · `verify-migration-state` exact.
- pgTAP **69 files, Σ 1,809, PASS** (14 s), teed — no 7C migration exists;
  the clean leg IS the 74-migration state.
- Concurrency **82/82** (54 cases), teed — case 1's `40P01`s are PLT-02's
  deliberate repro.
- vitest **1315 / 99 files by run** (`.vitest/run.json` at the evidence
  head, re-measured AFTER the gate-repair commits added their pins;
  1168/90 at the base — 7C adds 9 files, 147 tests). An earlier full-suite
  invocation: one recorded forks-worker transient (D12.5).
- **The gate: D11's table** — r5 COMPLETE GREEN **57/57** at `ccd854b`,
  17.3 min; the two ADR-0036-held rows (TSK-03/04) flipped on exactly the
  condition the ruling named.
- lint solo **exit 0** · typecheck solo **exit 0** (one generated-file
  casualty of the killed dev server, regenerated by the build) · production
  build solo **exit 0**.
- gitleaks, the CI-identical digest-pinned container: **571 commits
  scanned, no leaks found**.
- Owed: OW-07/16/19/23 **CLOSED(f1cfc33)**; OPEN **6/25** unchanged;
  re-tally 29/29 mechanical.
- Artifacts: the teed run logs (`7c-gate-r1..r5.log`), r3/r4 failure traces
  and screenshots preserved before any re-run, the `.vitest/run.json` pair —
  copied vault-side per the evidence convention.

---

## Pointed questions, with recommended answers (the packet, collapsed)

- **Q-A** A document share reaches the ROW, not the arrival's pages or
  facts (D12.1 — the DB's standing REV-01 model). Recommended: ACCEPT as
  the §4.3.5 reading for Phase 1 ("the one discharge instruction" = the
  filed document at its summary depth) and note it beside AC-DOC-5; if the
  owner wants share-includes-bytes, that is a slice-8 DDL question, not an
  app fix.
- **Q-B** An episode's receipt link resolves to the Timeline, where its
  wrapper renders — no episode page exists and none was promised.
  Recommended: ACCEPT; RCP-02's "resolves to the created object" is met by
  the surface that renders it.
- **Q-C** PRD §4.3.2's prose maps Insurance to documents; the shipped
  ADR-0005 map (and everything built on it) says finances. Recommended: a
  one-line PRD erratum at sign-off; the ADR binds.
- **Q-D** The dev server rewrites page `cache-control` after the proxy, so
  the pages' `private, no-store` rests on the unit pin + the prod default
  while the LEG asserts it on the artifact path (where caching bites).
  Recommended: ACCEPT with the split stated in PPL-03's cell (as written);
  a hosted-runtime header observation rides OW-09's owner track.
- **Q-E** r5's per-test traces were not retained (the reporter override)
  and `PLAYWRIGHT_JSON_OUTPUT_FILE` never produced its file in any run.
  Recommended: accept the teed log + tally as the r5 record (r3/r4 failure
  traces ARE retained), and open a small T3 item to put `reporter` and the
  JSON path INTO `playwright.config.ts` so the next gate's record is
  config-borne, not flag-borne.
- **Q-F** UXA-04: the People & roles sentences, the revocation copy and the
  re-categorisation confirmation are ON the surfaces for the round to read
  (the plain-line words, the §7.5 subject framing, the honest limit, the
  audience sentence, e=slow's auth copy) — read at round 27, as the row
  says.

## What is NOT claimed

Search (AC-DOC-1/4's search halves — slice 8) · claim/self-assignment
(slice 8, ADR-0036 Q-D) · the notification and export channels (RLS-11b /
DEL-01 — said on the revocation screen) · an episode page · a hosted
runtime under an auth fault (OW-09) · G4/G7 still block, G9 OPEN, G3 open,
the band allowlist EMPTY, SIG-01 NOT absorbed · `PROMPT_VERSION` `hc-6b-3`
unmoved · UXA-04 pending until read.
