# Third-party review packet — round 13: slice 4B, the ingestion app increment

> **STATUS: COMPLETE — the evidence block is whole.** The recorded
> local-gate run is GREEN at the evidence head `d6a6a22`: **24 passed
> (8.1 m)** — walkthrough 11/11 + a11y 5/5 + the B9 ingestion leg
> 8/8, `--trace on`, conforming instrument from a fresh clean-leg
> reset. Every "B9 LIVE" citation and the §4 coverage flips are
> bound. The path here is disclosed in full below: the gate found
> four REAL product defects across five runs (defects 4–7, each
> fixed red→green at a new SHA) and the run history at every SHA is
> recorded with nothing hidden (defects 8–10).

**Prepared:** 2026-08-19 at the close of the 4B build session;
completed 2026-08-20 by the host-reboot follow-up session that
recorded the gate (and fixed the four browser-truth findings below,
red→green each).
**Branch:** `slice/4b-app-ingestion` (PR to follow), base `main` @
`3195713` (CI run 77, 32328541057, green — confirmed via the public
API, anonymous, BEFORE branching; the regress terminates there per the
standing rule).
**Authority:** `docs/review/slice-4-plan.md` (PLANNED–RULED; Q1–Q7
SETTLED verbatim — the build executed on those rulings, no new plan
gate) → ADR-0018 WITH its addendum (the inherited round-12
obligations) → TSD §5.2–§5.4, §4.3–§4.6, §1.3/§1.4/§2.12/§3.11 as
amended by annexes A5/A6/A9 → ADR-0006 → the ops runbooks.
**The dispositions ADR for this build:** ADR-0019 (Proposed — this
round ratifies or amends it; the plan's "ADR-0018 (4B)" slot was
consumed by round-12 — renumbered, not reused).

## Addendum-first: the head ledger (the round-8 rule, from the start)

| Purpose | SHA | Tree relationship | Status |
|---|---|---|---|
| Base (main, the 4B kickoff) | `3195713` | — | CI green (run 77, 32328541057) |
| B1 red / green | `15f82ab` / `d1e2e56` | +tests/mail · +lib/mail/inbound.ts | unit green (23) |
| B2 red / green | `283a0ac` / `9e080eb` | +tests/{hc/ingest,routes/inbound-postmark} · +webhook, lib/hc/ingest, the storage plane (asStoragePlane + lib/storage), lib/mail/outbound, the fence extension | unit green (53) |
| B3 red / green | `bbdbf97` / `4f31f22` | +tests/{routes/upload,hc/upload} + tus-js-client 4.3.1 (the Q4 dep) · +mint/completion routes, the upload surface | unit green (13) |
| B4 red / green | `92ce23c` / `2bc252c` | +tests/{scan,pipeline,routes/worker-stage,hc/workers}; messages gain channel · +/api/worker/[stage], lib/scan/scanner.ts, lib/pipeline/mime.ts, lib/hc/workers.ts | unit green (73 incl. neighbors) |
| B5 red / green | `fc179a0` / `994c229` | +tests/{routes/relay,routes/nightly,hc/relay}; cron + claim-primitive pins · +relay/nightly routes, the §11.5 byte purge, vercel.json crons, docs/ops/ingestion-deploy.md | unit green (48 incl. neighbors) |
| B6 red / green | `62d92f2` / `534c0d5` | +tests/{hc/inbox,routes/inbox} · +the Care Inbox + 3 submit routes, lib/hc/inbox.ts, FWD-01 wiring at confirm, nav entries | unit green (16) |
| B7 red / green | `495574e` / `ab3be08` | +tests/{routes/artifact,hc/artifacts} · +/api/artifact/[id], lib/db/evidentiary.ts, lib/hc/artifacts.ts, asServiceRole() implemented | unit green (25 incl. fence pins) |
| B8 red / green | `42370e6` / `8c25859` | maintenance/circle/founder-door/create-account/account re-pins + tests/db/runtime-credential.test.ts · the four conversions, the two-op shrink, HC_MAINTENANCE_DB_URL, the local hc_runtime flip, APP-09b's call | unit green (434 full) |
| B9 spec | `0fbe403` | +e2e/ingestion.spec.ts + the gate-protocol doc (a spec is not a run) | the first gate run at this head found ONE product defect — the fix below |
| B9-fix red / green | `27431bb` / `53479bd` | the FWD-01 dead-confirm-path finding pinned · signUp + both resends carry emailRedirectTo → /confirm (emailLinkOrigin hoisted; the reset route deduped onto it) | the gate leg's finding, LAYER 1 of 3 — defect 4 below |
| Docs staging | `5eb28a5` | `docs/` only (this packet's first draft, ADR-0019, the coverage flips under a banner) | superseded by this revision |
| FWD-01 layers 2+3 red / red / green | `05100f0` · `d530911` / **`3bfe6eb`** | the allow-list pin (GoTrue DROPS un-listed redirects silently) · the token_hash pin (the default template's #fragment shape never reaches a server route) · the custom confirmation template + `additional_redirect_urls` + NEXT_PUBLIC_SITE_URL config-first | FWD-01 GREEN IN THE BROWSER (gate run: 17 passed; found the dead upload button) — defect 4 |
| Upload transport red / red / green | `97667ec` · `6ba2ec9` / **`fa1ded2`** | the dev-origin 403 pinned (allowedDevOrigins) · the TUS-proxy pin (the pinned storage build ignores x-signature on /upload/resumable) · the same-origin TUS proxy with expiring HMAC grants (ADR-0019 D16) | the upload leg GREEN (gate run: 21 passed; found the unresolvable child duplicate) — defects 5–6 |
| Child duplicate red / green | `d9eddcc` / **`d6a6a22`** | a mailed duplicate (a CHILD arrival) had the §4.7 label with NO affordance · the resolutions render per duplicate_suspected child, bound to the child's id | defect 7 below |
| **Evidence head** | **`d6a6a22`** | the LAST commit that moves `app/ lib/ components/ tests/ e2e/ supabase/` | **complete evidence block below recorded at exactly this SHA** |
| Review head | the docs-only commits after `d6a6a22` (the finalized coverage flips, ADR-0019 D16 + the D12/D14 amendments, this packet, the round-13 kickoff) | `docs/` only — the per-directory binding transfers the evidence | this packet's final SHA is the PR head |

**Per-directory tree binding (ADR-0015 F12), at `d6a6a22`:**

```
app        50420dca7b9fb7b21f2e26d48e76f986820f8a8b   MOVED (webhook, upload + the TUS proxy, workers, relay, nightly, inbox + the child-dup resolutions, artifact, sign-out, confirm, setup submits, the mail redirects)
lib        569fdc9e720d8b3f012f13e5fc11c7384d2b21c2   MOVED (mail, scan, pipeline, storage + the HMAC grants, hc/{ingest,upload,workers,inbox,artifacts,accounts,circle,invites,security-actions}, db/{maintenance,evidentiary,service-role,request-role}, auth/redirect, format/dates)
components e083c9dc9b08ed9b69110661dc7adb573f1054bc   MOVED (nav manifest: Care Inbox + Add a document)
tests      f8bd135af3f8d8df3e27fa9fd416a0dcc01f9541   MOVED (18 new files; 9 re-pinned)
e2e        938662fca374fdc2733f7b0f71fce853f9405b69   MOVED (ingestion.spec.ts; the confirm-link regexes widened in all three specs)
supabase   30759912c75815b213f036a4eaef268b01d696ce   MOVED — config.toml + templates/ ONLY; the schema subtrees below carry the bound's proof
scripts    e3670b3f6dfc1588134df7a410a078ac390f0a79   UNCHANGED vs main 3195713

supabase/migrations  3b761d6a126894c1fa0316bd3c9d4eef034bd138  UNCHANGED vs main 3195713
supabase/tests       76f777fec11165e3f736c4e384ee54a72ba1987e  UNCHANGED vs main 3195713
supabase/seed.sql    3174ae6a2f39ae2cec27ef18fc189a0bc2a0128e  UNCHANGED vs main 3195713
```

The UNCHANGED hashes are this increment's central structural claims:
**4B is app-only — the spent ≤ 8 migration bound was never
approached** (`supabase/migrations`, the pgTAP suite at 51 files and
the seed all byte-identical to main; the parent tree moves ONLY at
auth config + one mail template — the FWD-01 delivery chain's
`additional_redirect_urls` rows and the token_hash confirmation
template, app-plane concerns with zero DDL) and the two-session
concurrency suite is untouched at 38 cases (`scripts/`). Any commit
after `d6a6a22` that moves a non-docs tree voids this packet's
evidence and forces a re-run.

## What round 13 reviews

4B is the APP HALF of slice 4 (the Q1 ruling): every route, adapter,
worker, scheduler and surface over the 4A substrate round 12 already
reviewed. The §5.3 verdict chain with its adversarial fixtures (B1);
the §5.2 webhook applying the §5.4 bounce/drop table with acceptance
durable BEFORE the 200 (B2); the TUS upload path under M7's
zero-policy posture (B3); the stage workers + the zero-dep clamd
INSTREAM adapter (B4); RLY-01's relay and scheduler family including
the inherited §11.5 quarantine byte purge (B5, ADR-0018 F2
discharged); the Care Inbox under Q6's ratified disposition (B6); the
§1.3 artifact route — RLS-10 at HTTP depth, 049 having pre-discharged
NOTHING (B7, ADR-0018 Q-G); the credential split applied with
HC_DB_URL → hc_runtime (B8); and the E2E ingestion leg with EICAR
live (B9). Dependencies: exactly `tus-js-client` (Q4); the dev-dep
reserve untouched. NOTHING is production-activated: the Q7 seam holds
(gated arrivals rest at `extracting`; extract/interpret messages are
deferred, never consumed), no real forwarding address exists at any
provider, and activation stays G4/G7-gated.

## The units (B1–B9, in build order)

| # | Unit | What landed | Tests |
|---|---|---|---|
| B1 | `lib/mail/inbound.ts` | The §5.3 chain IN ORDER: provider fields first and the chain STOPS there; authserv-id-anchored A-R bound ABOVE the first foreign Received hop; ARC never authenticates (Q5); display name never read; blank config fails closed; the G7 adversarial openers (forged A-R below a foreign hop; suffix/hyphen lookalike authserv-ids); parseInbound → the neutral §4.1 shape; auth detail clamped under the 16 KB bound | tests/mail/inbound.test.ts (24) |
| B2 | `/api/inbound/postmark` | Signature timing-safe from POSTMARK_INBOUND_SECRET (503 unset — never open; 401 unsigned); resolve with drift blocked VISIBLE; the §5.4 table (aligned bounce naming the capacity limit; unauthenticated DROPPED for every over-* reason — Q-i; attachments/file-size ride the same table; monthly ceiling notifies, never turns); verdict stored VERBATIM with the M3 lookalike override; parent+children ONE hc_pipeline transaction; bytes staged durably BEFORE the 200; enqueue; post-response eager fire. Plumbing: lib/hc/ingest, the storage plane (D1), lib/mail/outbound (the one §5.4 bounce template) | tests/routes/inbound-postmark.test.ts (19) · tests/hc/ingest.test.ts (10, live) |
| B3 | The upload path | Mint: session at getUser truth → right-to-ingest FIRST (manage over the all-domain taint — the D6 ruling; ghost/unauthorized ONE 404) → an expiring HMAC grant over ONE subject-scoped staging key, honored by the same-origin TUS proxy on every hop (D16 — the gate replaced the x-signature sketch; M7's zero-policy posture intact and proven by its refusal). Completion: rights RE-CHECKED, bytes MEASURED, sha computed, the arrival keyed to THIS attempt, restaged for store, enqueued. The surface: slice-3 components, server-filtered subjects, tus-js-client (6 MB chunks, resume) | tests/routes/upload.test.ts (13, incl. the proxy pins) · tests/hc/upload.test.ts (3, live) |
| B4 | Workers + scanner | `/api/worker/[stage]` (store·scan·gate), each claim → COMMIT → work → finalize; store: staged bytes → sniffed mime (content beats declaration) → the exact content-addressed key; scan: cache FIRST (a known-infected sha quarantines without scanning — X1 at work), four states never collapsed, UNAVAILABLE never finalized early (D5), infected moved to the no-read-grant bucket; gate: uploads pass, strangers hold, channel lineage with fail-closed unknowns (D3/D4); the Q7 seam deferred via set_vt; per-message isolation; `lib/scan/scanner.ts` zero-dep INSTREAM (byte-level wire pins) | tests/routes/worker-stage.test.ts (21) · tests/scan/scanner.test.ts (6) · tests/pipeline/mime.test.ts (4) · tests/hc/workers.test.ts (3, live) |
| B5 | RLY-01 + schedulers | The per-minute relay (drain → enqueue-with-lineage → ack EXACTLY what was sent; failed enqueues re-deliver on the 300 s window; stale rows acked without a send; 4B stages fired once each, extract never); the nightly route (taint sweep · cache expiry · held-mail expiry · **the §11.5 quarantine BYTE purge at 7 days — ADR-0018 F2's named owner, discharged, with its deploy row**); the security-actions sweep on M1's claim primitive (BAT-05 app half); vercel.json crons pinned; docs/ops/ingestion-deploy.md | tests/routes/relay.test.ts (8) · tests/routes/nightly.test.ts (3) · tests/hc/relay.test.ts (2, live — the A.5 halves) · re-pins in worker/vercel-cron tests |
| B6 | The Care Inbox | Labels from hc.product_state (the state machine IS the surface); the §5.3 verdict SHOWN (verified / unverified · we couldn't confirm / the lookalike's own copy); held mail with accept-sender (address or domain) + the 30-day expiry warning; §4.7's two resolutions, no third, bound to the SUSPECTED row — duplicate CHILDREN resolvable under their parent (the gate find, defect 7); the §4.5 cancel window; the §13.1 4-hour delay notice; the §8.6 first-run exception (the forwarding address IS the content); Q6's binds literal (D12); FWD-01's app half at the confirm route (D14); nav entries | tests/routes/inbox.test.ts (12) · tests/hc/inbox.test.ts (5, live) |
| B7 | `/api/artifact/[id]` | The §1.3 six steps: ONE byte-identical 404 (no-session/ghost/unauthorized/not-clean/quarantined — 404 ≡ 403); steps 1+2 as one RLS-true query; the INDEPENDENT clean gate; the 30 s signed URL created AND consumed server-side, bytes streamed, no storage URL ever browser-side; private/no-store + Range both ways; EVIDENCE BEFORE BYTES on the new evidentiary boundary (D7). The ONE sanctioned full asServiceRole() consumer | tests/routes/artifact.test.ts (8) · tests/hc/artifacts.test.ts (4, live — chain intact) |
| B8 | The credential split | The four call-sites onto M1's definers (claims-keyed; describe on the ANON channel); createCircleFromSetup carries the step-1 relationship (BAT-03); maintenance.ts = EXACTLY the two auth.* ops on HC_MAINTENANCE_DB_URL; the LOCAL flip real (request-role default, .env, playwright env → hc_runtime_login); APP-09b's call (log BEFORE the kill; never refuses sign-out); the runbook's INHERIT correction (D8) | tests/db/maintenance.test.ts (4) · tests/db/runtime-credential.test.ts (6, live probes) · circle/founder-door/create-account/account re-pins |
| B9 | The E2E ingestion leg | e2e/ingestion.spec.ts (8 tests): founder → verified → forwarding ACTIVE with its §5.1 entry · the TUS upload to 'Reading' · the artifact stream + read entry + the ghost's 404 bytes · the signed synthetic webhook → held VISIBLE with the verdict copy → accept releases in one transaction · **EICAR quarantined ≠ scan_unavailable LIVE** with the evidence row retained-unexpiring and the bytes in quarantine · the duplicate resolved by a person with ONE relay pass finishing to extracting (RLY-01 end-to-end) · cancel · the Q6 cliff from a live family-tier session (zero rows, no affordance, the artifact answering the ghost's exact bytes). The protocol doc gains the clamd prerequisite | the local gate (below) |

## Red→green history

Twenty-eight commits: one red→green pair per unit B1–B8, the B9
authoring commit, then FOUR red→green chains driven by the recorded
gate's findings (the FWD-01 delivery chain across three layers, the
dev-origin 403, the TUS transport, the child duplicate — the ledger
above). Every red commit's message carries its failure signatures;
each browser-truth fix was proven headlessly at its layer before a
recorded run was spent on it (single-test pre-flights with `-g`
filters, per the flake policy's budget discipline).

## Defects found and handled inside the increment

1. **The runbook's bare-login probe was wrong (found by B8's red).**
   `docs/ops/runtime-db-credentials.md` said the bare `hc_runtime_login`
   probe "must be refused" — but hc_runtime's memberships are INHERIT,
   so the grant resolves and the probe RESOLVES WITH ZERO ROWS (RLS
   with no identity), which is the actual containment argument. The
   runbook row is corrected; the local stand-ins run in CI
   (tests/db/runtime-credential.test.ts); whether NOINHERIT should
   tighten this is offered as Q-vi. ADR-0019 D8.
2. **The segfault trap nearly re-dialled.** The first draft of the
   runtime-credential suite probed hc.log by CALLING it (a
   function-ACL denial — the recorded PG17-image segfault). Re-shaped
   catalog-based (has_function_privilege) before the red commit ever
   ran against the stack; recorded here because the trap keeps
   earning its place in the kickoffs.
3. **A once-mock leak in the account suite** (the anonymous sign-out
   test queued a getClaims value the short-circuited path never
   consumed, poisoning the next test) — test-harness noise, fixed in
   the B8 green commit; no product implication.
4. **FWD-01's delivery chain was dead in THREE independent layers —
   the B9 leg's headline finding, each layer red-pinned before its
   fix (`27431bb`→`53479bd` · `05100f0`+`d530911`→`3bfe6eb`).**
   Layer 1: no `emailRedirectTo` ever rode signUp or the resends, so
   the /confirm route (where B6 wired the §5.1 activation pass) never
   ran on the signup path — `forwarding_active_at` stayed null after
   a real mail click while the walkthrough's mirror assertion still
   passed (GoTrue itself flips email_confirmed_at). Fixed by
   `emailLinkOrigin` (config-first `NEXT_PUBLIC_SITE_URL`, blank-env
   honestly unconfigured; the reset route deduped onto it). Layer 2:
   GoTrue's redirect allow-list DROPS un-listed URLs SILENTLY — the
   fixed redirect STILL never arrived until `additional_redirect_urls`
   carried the `/confirm*` rows; the deploy checklist gained the
   production row, because an un-listed production URL reproduces the
   defect with no error anywhere. Layer 3: the DEFAULT confirmation
   template links the implicit-flow `#fragment` token shape, which no
   server route ever sees — a custom template now sends `token_hash`
   (the documented server-side verification shape). Each layer alone
   leaves activation silently dead; each was proven headlessly (DB
   depth, then raw HTTP, then the live mail body) before a recorded
   run was spent. Config pins hold all three
   (tests/config/auth-config.test.ts). ADR-0019 D14 as amended.
5. **The upload button was dead in the browser: Next 16's cross-origin
   dev protection 403'd the hydration chunks** when the test browser
   used `127.0.0.1` against a `localhost`-origin dev server (found in
   the retained trace's console: `_next/static` 403). Red-pinned
   (`97667ec`), fixed with `allowedDevOrigins` — a dev-only concern by
   definition (tests/config/next-config.test.ts). ADR-0019 D16.
6. **The pinned storage build IGNORES x-signature on the resumable
   endpoint** — the browser's TUS request evaluated as plain
   `authenticated` and M7's zero-policy posture refused it (the 403
   was the storage plane WORKING). Red-pinned (`6ba2ec9`), rebuilt as
   the same-origin TUS proxy (`fa1ded2`): expiring HMAC grants
   verified on every hop, the service credential never leaving the
   server, Location rewritten, upstream pinned to the resumable
   family. ADR-0019 D16; the coverage UPL-01 row re-worded.
7. **A mailed duplicate was unresolvable (the final gate finding, at
   fa1ded2's 21-passed run).** The inbox lists PARENT arrivals and a
   mailed duplicate is a CHILD: the rollup label said "Looks like a
   duplicate" while the §4.7 resolutions rendered only off the parent
   row's state — nothing to click, ever, for any mailed duplicate.
   Red-pinned (`d9eddcc`), fixed (`d6a6a22`): the resolutions render
   for every duplicate_suspected child under its parent's row, bound
   to the CHILD's arrival id. ADR-0019 D12 as amended.
8. **Infrastructure transients, classified from retained output, each
   cleared on its single permitted re-run:** the first gate attempt
   (at `0fbe403`) failed on ECONNREFUSED at Mailpit — container
   healthy, NO host port binding (the WinNAT episode's tail; stack
   recreated), 16/16 once repaired; one a11y-fence vitest timeout at
   75 s under full-suite parallel load (6/6 isolated); one db-fence
   vitest timeout at 60 s under the same load at `d6a6a22` (13/13
   isolated in 15 s; the full suite re-run 442/442); one production
   build failure on a half-written generated file
   (`.next/dev/types/*`, left by a killed dev server — cleared by
   removing `.next`, clean rebuild; generated output, not source).
   And the host memory-pressure episode at `d6a6a22`'s first
   conforming gate run: 23 of 24 passed, then the Q6 cliff leg — the
   only test no earlier run had ever reached — timed out at invite
   creation. The retained trace shows the submit's 303 SUCCEEDING
   after 95.8 s server-side (no refusal anywhere), the whole run
   uniformly ~3× slower than `fa1ded2`'s (9.3 m vs 5.9 m; the
   walkthrough's IDENTICAL invite steps passed in the same run at
   15 s vs 5.1 s), host available RAM under 1 GB, and a
   `pg_blocking_pids` sampler EMPTY across a full reproduction — no
   lock, no product path. Root cause: the stack was running FULL, not
   lean — PowerShell splits an unquoted `-x studio,meta,…` list into
   separate arguments and every exclusion silently fails (the ops
   runbook now says to quote it). Reproduction after the lean
   restart: the complete ingestion file 8/8 in 2.4 m, cliff leg
   included — the code passes the moment the host isn't thrashing.
9. **The build host's Docker engine destabilized after the WinNAT
   repair** (the elevated winnat restart freed the swallowed 543xx
   ports but the engine then failed five times across the closing
   hours of 2026-08-19 — container APIs answering 500 on `_ping`,
   kill events undelivered, one `db reset` interrupted by a session
   restart leaving the recorded empty-DB state; at `53479bd` this
   manifested as GoTrue hanging host-wide, raw curl included). None
   is a repo defect. The host reboot on 2026-08-20 resolved it fully:
   every run after the reboot executed without an engine fault.
10. **Instrument disclosures (recorded because the flake policy runs
    on trust in the instrument):** (a) at `53479bd`, the second gate
    attempt was briefly launched against a PRODUCTION `next start`
    server to route around the engine instability — a deviation from
    the recorded instrument (`npm run dev` via playwright's
    webServer); it was recognized, REVERTED, and that SHA recorded as
    RED under the two-consecutive-failures rule rather than excused.
    (b) At `d6a6a22`, the first recorded-run launch skipped the
    protocol's clean-leg reset (the stack carried pre-flight state);
    it was ABORTED before any result and does not count as a run.
    The runs that count at this SHA are the two conforming ones in
    the gate history below: the memory-pressure failure (defect 8,
    classified by reproduction) and the permitted re-run.

## Deviations and as-built decisions offered to this round

ADR-0019 carries the full set (D1–D16). The reviewer's fastest path:
D2 (staging, not provider fetch-back — acceptance is rows AND bytes),
D3/D4 (message lineage; the gate as a MAIL guard), D5 (the
never-finalize-unavailable retry posture), D6 (the upload level
ruling), D7 (the evidentiary boundary), D8 (the split as-built), D9
(the bounce table's alignment rule), D10 (the §4.3/§1.3 tension), D15
(named gaps: the revoke-sender surface, the monthly-ceiling
notification surface, the §13.2 measurement harness), D16 (the
same-origin TUS proxy — the transport deviation from the plan's B3
sketch, Q-vii below) and the D12/D14 amendments the gate findings
forced (the child-duplicate bind; the three-layer delivery chain).

## Verification evidence (recorded at `d6a6a22`, the evidence head)

- **Clean-leg reset:** `supabase db reset` → **exact 54 == files**
  (verify-migration-state) — run at `fa1ded2` before the CI-shaped
  suites and AGAIN at `d6a6a22` before the recorded gate (post-reset
  kong restart per the runbook); seed provisioned `hc_runtime_login`;
  both buckets from cold.
- **pgTAP:** **1363/1363 across 51 files, Result: PASS** — recorded at
  `3bfe6eb` and binding at the head by the F12 transfer rule: the
  `supabase/` tree hash (`3075991…`) is BYTE-IDENTICAL across
  `3bfe6eb` → `fa1ded2` → `d6a6a22`, and the schema subtrees are
  byte-identical to main. Teed: `pgtap-4b-head.log`.
- **Concurrency:** **63/63 across 38 cases** — same transfer argument
  (`scripts/` byte-identical to main at every head). Teed:
  `concurrency-4b-head.log`. First run, no re-runs.
- **db:verify:** clean under `--fail-on warning`.
- **vitest:** **442/442 across 53 files** at `d6a6a22` (was 279/35 at
  base: +163 assertions across 18 new files, 9 files re-pinned),
  against the freshly reset stack. One db-fence timeout under
  full-suite parallel load on the first run (defect 8; 13/13 isolated
  in 15 s); the single permitted re-run: all 442.
- **Local gate (F12: moved trees ⇒ full re-run) — the run history at
  every SHA, no run hidden:** `0fbe403`: 16 passed (walkthrough 11 +
  a11y 5) + the B9 leg's FWD-01 layer-1 finding (defect 4).
  `53479bd`: **RED** — two consecutive failed runs (host-wide GoTrue
  hang, then an incomplete fix compounded by the disclosed instrument
  deviation, defect 10a). `3bfe6eb`: 17 passed — FWD-01 GREEN in the
  browser; found the dead upload button (defect 5). `fa1ded2`: 21
  passed — the upload/artifact/EICAR/held legs all live; found the
  unresolvable child duplicate (defect 7). `d6a6a22` run 1: 23 of 24 —
  the cliff leg (the only test no earlier run had reached) timed out
  under host memory pressure (defect 8: classified by retained trace
  AND reproduction — the ingestion file then passed 8/8 in 2.4 m on
  the lean stack before the re-run was spent). `d6a6a22` run 2, the
  permitted re-run after classification: **24 passed (8.1 m) —
  walkthrough 11/11 + a11y 5/5 + ingestion 8/8, `--trace on`, fresh
  clean-leg reset, lean stack, 2026-08-20.** Retained artifacts:
  `gate-4b.log` + `test-results/` traces, copied vault-side
  (04-evidence/gate-d6a6a22-2026-08-20).
- **lint · typecheck · production build:** clean at `d6a6a22`.
- **gitleaks:** **251 commits scanned, no leaks found** (the identical
  digest-pinned image CI runs; the gate-config demo secrets in
  playwright.config.ts are local-stack values by construction).
- **check-service-role-containment / check-exposed-schemas:** both OK,
  exit 0.
- **Upgrade leg:** NO MIGRATION INCREMENT EXISTS —
  `supabase/migrations` is byte-identical to main (`3b761d6…`, the
  F12 subtree hash), so the merge-base migration set IS the head's;
  the CI job's rehearsal reduces to the clean leg already recorded,
  and CI runs it on the pushed branch regardless (recorded in the
  kickoff once the run completes — pending never counts as green).
- **Dependencies:** exactly `tus-js-client@4.3.1` added (Q4-approved,
  pinned); the dev-dep reserve untouched; `npm audit` at install: 0
  vulnerabilities.

## Pointed questions for round 13 (recommended answers inline)

**Q-i — The capacity bounce's alignment qualifier (ADR-0019 D9).**
§5.4's capacity row says "bounce with the limit in plain words" with no
alignment qualifier; as built, UNAUTHENTICATED mail is dropped for
every over-* reason including capacity — the table's own backscatter
reasoning does not stop at the capacity bound. **Recommend: ratify
as-built** and reconcile §5.4's capacity row in a TSD annex line with
this round's dispositions. Alternative: bounce unauthenticated
capacity refusals — a backscatter channel at the product's most
attacker-reachable address.

**Q-ii — §4.3's "downloadable with the reason stated" vs §1.3's clean
gate (ADR-0019 D10).** For scan_unavailable/scan_inconclusive, §4.3
promises a download with the reason; §1.3 (and the plan's B7 row,
AC-INBOX-15) gates the artifact route on clean, independently. Built
to §1.3: every non-clean read refuses in the one 404 shape; the inbox
states the reason. **Recommend: ratify §1.3 as the letter and
reconcile §4.3's sentence in the same annex** — if the product later
wants unchecked-but-honest downloads, that is a deliberate carve-out
with its own warning surface, never a quiet route widening.

**Q-iii — The evidentiary boundary (ADR-0019 D7).** hc.log is
hc_internal-only and M5 shipped 'artifact_read' with no definer; the
ONE append rides the maintenance identity assuming hc_internal
(001's documented exemption), in a new module under the
maintenance-boundary discipline, leaving BAT-02's two-op pin intact.
**Recommend: accept as the A2-disciplined interim** and queue
`hc.log_artifact_read` as a definer candidate for the next DB-opening
slice's batch.

**Q-iv — The storage-plane fence extension (ADR-0019 D1).** The A2
allowlist grew to three entries (artifact route · gotrue-admin · the
storage plane), exactly the growth ADR-0018 F2 sanctioned, each pinned
in tests/lint/db-fence.test.ts. **Recommend: confirm** the fence
architecture as recorded.

**Q-v — The store worker reads staging, not the provider (ADR-0019
D2).** §1.6's swap-cost row sketched raw-MIME retrieval from the
provider; as built, the webhook stages bytes durably BEFORE its 200
and the store worker consumes staging — acceptance survives a
provider-retention gap, and the synthetic webhook exercises the
identical path the live one takes. **Recommend: ratify** with an annex
touch on the §1.6 row (the swap-cost's expensive half shrinks).

**Q-vi — hc_runtime's INHERIT membership (ADR-0019 D8; defect 1).**
The corrected containment argument is: zero direct grants, RLS-empty
without an identity, auth.*/hc.log unreachable — probed in CI. A
NOINHERIT login would also make the bare-credential read fail
outright, at the cost of a role-attribute change (DDL — the owner's
bound-amendment queue, never this slice). **Recommend: accept the
corrected probes; owner decides whether NOINHERIT joins the next
batch.**

**Q-vii — The upload transport and the FWD-01 delivery chain as
rebuilt by the gate (ADR-0019 D16; the D14 amendment).** The plan's
B3 row sketched the storage signed-upload token; the pinned storage
build ignores it on the resumable endpoint, and the shipped transport
is the same-origin TUS proxy under expiring HMAC grants (defect 6 —
strictly narrower exposure: the service credential never leaves the
server, no storage URL reaches the browser, the CORS class is
structurally gone). The confirmation-mail chain likewise ships as
config: the `/confirm*` allow-list rows, the token_hash template, and
`NEXT_PUBLIC_SITE_URL` — with the production allow-list row on the
deploy checklist because its absence fails SILENTLY (defect 4).
**Recommend: ratify both as-built**; the alternative (waiting on an
upstream storage build that honors x-signature on /upload/resumable)
re-opens a browser-facing storage URL for no capability gain.

## Files

New: `lib/mail/{inbound,outbound}.ts` · `lib/scan/scanner.ts` ·
`lib/pipeline/mime.ts` · `lib/storage/artifacts.ts` (incl. the HMAC
grants) · `lib/hc/{ingest,upload,workers,inbox,artifacts}.ts` ·
`lib/db/evidentiary.ts` · `lib/format/dates.ts` ·
`app/api/inbound/postmark` · `app/api/upload/{token,complete}` ·
`app/api/upload/tus/[[...id]]` (the same-origin proxy) ·
`app/api/worker/[stage]` · `app/api/worker/{relay,nightly}` ·
`app/api/artifact/[id]` · `app/(app)/[circle]/{upload,inbox}` (+3
submit routes) · `e2e/ingestion.spec.ts` ·
`supabase/templates/confirmation.html` (the token_hash mail) ·
`docs/ops/ingestion-deploy.md` ·
`docs/adr/0019-4b-app-ingestion-deltas.md` · 18 test files · this
packet · the round-13 kickoff.
Modified: `lib/db/{maintenance,service-role,request-role}.ts` (the
split; the narrower planes) · `lib/hc/{accounts,circle,invites,
security-actions}.ts` (the conversions; the claim adoption) ·
`app/account/sign-out-everywhere` (APP-09b) · `app/(auth)/confirm`
(FWD-01) · `app/(auth)/create-account/submit` + `app/setup/step/{2,3}/
submit` (claims + relationship) · `app/api/worker/security-actions`
(the claim primitive) · `app/setup/complete/page.tsx` +
`lib/setup/steps.tsx` (FORWARDING_DOMAIN one home) ·
`components/shell/nav-manifest.ts` · `eslint.config.mjs` (the fences) ·
`vercel.json` (crons) · `next.config.ts` (allowedDevOrigins) ·
`supabase/config.toml` (the /confirm* allow-list rows + the template
binding — auth config, zero DDL) · `playwright.config.ts` +
`.env.example` (the split env + gate config + NEXT_PUBLIC_SITE_URL) ·
`docs/ops/{runtime-db-credentials,e2e-local-gate,ingestion-deploy}.md`
· `docs/coverage.md` (the §4 flips; RLY-01, UXA-01, RLS-10, APP-09b)
· 9 re-pinned test files.
Untouched: **`supabase/migrations`, `supabase/tests`,
`supabase/seed.sql` and `scripts/`** — the subtree hashes above are
the proof; the migration bound stays spent at 8 of ≤ 8 with nothing
added.
