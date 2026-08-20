# Third-party review packet — round 13: slice 4B, the ingestion app increment

> **STATUS: ONE EVIDENCE LEG OUTSTANDING.** Every CI-shaped leg below is
> recorded green at the evidence head. The RECORDED local-gate run
> (walkthrough 11 + a11y 5 + the B9 ingestion leg) is OUTSTANDING: the
> build host's Docker engine became unstable after a WinNAT repair
> (five engine failures across the closing hours — the full narrative
> is defects 4–6 below) and the flake policy leaves exactly one
> permitted run at this SHA, which must not be spent on a failing
> host. **The round-13 review MUST NOT START until a follow-up session
> (after a host reboot) records that run and replaces this banner with
> the result.** Every "B9 LIVE" citation and the §4 coverage flips
> bind only once that run passes.

**Prepared:** 2026-08-19, at the close of the 4B build session.
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
| B9-fix red / green | `27431bb` / **`53479bd`** | the FWD-01 dead-confirm-path finding pinned · signUp + both resends carry emailRedirectTo → /confirm (emailLinkOrigin hoisted; the reset route deduped onto it) | the gate leg's finding, closed — defect 4 below |
| **Evidence head** | **`53479bd`** | the LAST commit that moves `app/ lib/ components/ tests/ e2e/` | **complete evidence block below recorded at exactly this SHA** |
| Review head | the docs-only commits after `53479bd` (coverage flips, ADR-0019, this packet, the round-13 kickoff) | `docs/` only — the per-directory binding transfers the evidence | this packet's final SHA is the PR head |

**Per-directory tree binding (ADR-0015 F12), at `53479bd`:**

```
app        4dfd921327423f12a0a8399ddf53844d4b7229fc   MOVED (webhook, upload, workers, relay, nightly, inbox, artifact, sign-out, confirm, setup submits, the B9-fix mail redirects)
lib        c86258de0d8f7a94be2c6baf674462da285556f6   MOVED (mail, scan, pipeline, storage, hc/{ingest,upload,workers,inbox,artifacts,accounts,circle,invites,security-actions}, db/{maintenance,evidentiary,service-role,request-role}, auth/redirect)
components e083c9dc9b08ed9b69110661dc7adb573f1054bc   MOVED (nav manifest: Care Inbox + Add a document)
tests      8773244036ca84e1d33ee5d2c4c00e97484aa68e   MOVED (17 new files; 9 re-pinned)
e2e        8557aad494f060109801ba25add53ea857f18c60   MOVED (ingestion.spec.ts; onboarding/a11y byte-identical)
supabase   1c389476ea5c6e8426b01198f086d0cb6f8a54c5   UNCHANGED vs main 3195713
scripts    e3670b3f6dfc1588134df7a410a078ac390f0a79   UNCHANGED vs main 3195713
```

The two UNCHANGED hashes are this increment's central structural
claims: **4B is app-only — the spent ≤ 8 migration bound was never
approached** (`supabase/` byte-identical, shipped migrations untouched,
pgTAP suite untouched at 51 files) and the two-session concurrency
suite is untouched at 38 cases (`scripts/`). Any commit after
`0fbe403` that moves a non-docs tree voids this packet's evidence and
forces a re-run.

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
| B3 | The upload path | Mint: session at getUser truth → right-to-ingest FIRST (manage over the all-domain taint — the D6 ruling; ghost/unauthorized ONE 404) → a signed upload token for ONE subject-scoped staging key on the resumable endpoint (x-signature — M7's zero-policy posture intact). Completion: rights RE-CHECKED, bytes MEASURED, sha computed, the arrival keyed to THIS attempt, restaged for store, enqueued. The surface: slice-3 components, server-filtered subjects, tus-js-client (6 MB chunks, resume) | tests/routes/upload.test.ts (10) · tests/hc/upload.test.ts (3, live) |
| B4 | Workers + scanner | `/api/worker/[stage]` (store·scan·gate), each claim → COMMIT → work → finalize; store: staged bytes → sniffed mime (content beats declaration) → the exact content-addressed key; scan: cache FIRST (a known-infected sha quarantines without scanning — X1 at work), four states never collapsed, UNAVAILABLE never finalized early (D5), infected moved to the no-read-grant bucket; gate: uploads pass, strangers hold, channel lineage with fail-closed unknowns (D3/D4); the Q7 seam deferred via set_vt; per-message isolation; `lib/scan/scanner.ts` zero-dep INSTREAM (byte-level wire pins) | tests/routes/worker-stage.test.ts (21) · tests/scan/scanner.test.ts (6) · tests/pipeline/mime.test.ts (4) · tests/hc/workers.test.ts (3, live) |
| B5 | RLY-01 + schedulers | The per-minute relay (drain → enqueue-with-lineage → ack EXACTLY what was sent; failed enqueues re-deliver on the 300 s window; stale rows acked without a send; 4B stages fired once each, extract never); the nightly route (taint sweep · cache expiry · held-mail expiry · **the §11.5 quarantine BYTE purge at 7 days — ADR-0018 F2's named owner, discharged, with its deploy row**); the security-actions sweep on M1's claim primitive (BAT-05 app half); vercel.json crons pinned; docs/ops/ingestion-deploy.md | tests/routes/relay.test.ts (8) · tests/routes/nightly.test.ts (3) · tests/hc/relay.test.ts (2, live — the A.5 halves) · re-pins in worker/vercel-cron tests |
| B6 | The Care Inbox | Labels from hc.product_state (the state machine IS the surface); the §5.3 verdict SHOWN (verified / unverified · we couldn't confirm / the lookalike's own copy); held mail with accept-sender (address or domain) + the 30-day expiry warning; §4.7's two resolutions, no third; the §4.5 cancel window; the §13.1 4-hour delay notice; the §8.6 first-run exception (the forwarding address IS the content); Q6's binds literal (D12); FWD-01's app half at the confirm route (D14); nav entries | tests/routes/inbox.test.ts (11) · tests/hc/inbox.test.ts (5, live) |
| B7 | `/api/artifact/[id]` | The §1.3 six steps: ONE byte-identical 404 (no-session/ghost/unauthorized/not-clean/quarantined — 404 ≡ 403); steps 1+2 as one RLS-true query; the INDEPENDENT clean gate; the 30 s signed URL created AND consumed server-side, bytes streamed, no storage URL ever browser-side; private/no-store + Range both ways; EVIDENCE BEFORE BYTES on the new evidentiary boundary (D7). The ONE sanctioned full asServiceRole() consumer | tests/routes/artifact.test.ts (8) · tests/hc/artifacts.test.ts (4, live — chain intact) |
| B8 | The credential split | The four call-sites onto M1's definers (claims-keyed; describe on the ANON channel); createCircleFromSetup carries the step-1 relationship (BAT-03); maintenance.ts = EXACTLY the two auth.* ops on HC_MAINTENANCE_DB_URL; the LOCAL flip real (request-role default, .env, playwright env → hc_runtime_login); APP-09b's call (log BEFORE the kill; never refuses sign-out); the runbook's INHERIT correction (D8) | tests/db/maintenance.test.ts (4) · tests/db/runtime-credential.test.ts (6, live probes) · circle/founder-door/create-account/account re-pins |
| B9 | The E2E ingestion leg | e2e/ingestion.spec.ts (8 tests): founder → verified → forwarding ACTIVE with its §5.1 entry · the TUS upload to 'Reading' · the artifact stream + read entry + the ghost's 404 bytes · the signed synthetic webhook → held VISIBLE with the verdict copy → accept releases in one transaction · **EICAR quarantined ≠ scan_unavailable LIVE** with the evidence row retained-unexpiring and the bytes in quarantine · the duplicate resolved by a person with ONE relay pass finishing to extracting (RLY-01 end-to-end) · cancel · the Q6 cliff from a live family-tier session (zero rows, no affordance, the artifact answering the ghost's exact bytes). The protocol doc gains the clamd prerequisite | the local gate (below) |

## Red→green history

Seventeen commits, one red→green pair per unit B1–B8 plus the B9
authoring commit — the ledger above. Every red commit's message
carries its failure signatures; the B9 spec commit records that a
spec is not a run (the gate below is the run).

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
4. **The B9 gate leg's product finding (real, fixed red→green
   `27431bb` → `53479bd`).** GoTrue's DEFAULT confirmation link
   self-verifies at the API and redirects to the site ROOT — the
   /confirm route, where B6 wired the §5.1 forwarding-activation pass,
   never ran on the signup path, so `forwarding_active_at` stayed null
   after a real mail click (the walkthrough's mirror assertion still
   passed: GoTrue itself flips email_confirmed_at). Verified at DB
   depth before fixing (the same claims activate cleanly via psql —
   the DB machinery was never wrong). Fix: signUp and BOTH signup
   resends carry `emailRedirectTo = <origin>/confirm?flow=signup`
   under the reset flow's config-first origin rule (hoisted to
   `emailLinkOrigin`, blank-env honestly unconfigured, the reset route
   deduped onto it); the mail link's shape is unchanged and the
   walkthrough stayed byte-identical. THIS IS THE B9 LEG EARNING ITS
   KEEP: a browser-truth defect no mocked layer could see.
5. **Two infrastructure transients, classified from retained output,
   each cleared on its single permitted re-run:** the first gate
   attempt failed on ECONNREFUSED at Mailpit — the container was
   healthy but had NO host port binding (the WinNAT port-exclusion
   episode's tail; stack recreated) — with the walkthrough/a11y legs
   passing 16/16 once repaired; and one a11y-fence vitest timeout at
   75 s under full-suite parallel load (6/6 isolated).
6. **The build host's Docker engine destabilized after the WinNAT
   repair** (the session opened on a rebooted machine whose dynamic
   port exclusions had swallowed the 543xx stack; the elevated winnat
   restart freed the ports but the engine then failed five times over
   the closing hours — container APIs answering 500 on `_ping`, kill
   events undelivered, one `db reset` interrupted by a session
   restart leaving the recorded empty-DB state). At 53479bd's first
   gate run this manifested as GoTrue hanging host-wide (raw curl,
   not just the app). Every failure was classified from retained
   output; none is a repo defect. The remediation is a host reboot,
   outside the session's authority — hence the banner.

## Deviations and as-built decisions offered to this round

ADR-0019 carries the full set (D1–D15). The reviewer's fastest path:
D2 (staging, not provider fetch-back — acceptance is rows AND bytes),
D3/D4 (message lineage; the gate as a MAIL guard), D5 (the
never-finalize-unavailable retry posture), D6 (the upload level
ruling), D7 (the evidentiary boundary), D8 (the split as-built), D9
(the bounce table's alignment rule), D10 (the §4.3/§1.3 tension), D15
(named gaps: the revoke-sender surface, the monthly-ceiling
notification surface, the §13.2 measurement harness).

## Verification evidence (recorded at `0fbe403`, the evidence head)

- **Clean-leg reset:** `supabase db reset` → **exact 54 == files**
  (verify-migration-state), run twice at the head (once before the DB
  suites, once before the gate); seed provisioned `hc_runtime_login`;
  both buckets from cold.
- **pgTAP:** **1363/1363 across 51 files, Result: PASS** — UNCHANGED
  from the 4A merge (the suite did not move; `supabase/` is
  byte-identical to main). Teed: `pgtap-4b-head.log`.
- **Concurrency:** **63/63 across 38 cases** — UNCHANGED (no new
  cases; `scripts/` byte-identical to main). Teed:
  `concurrency-4b-head.log`. First run, no re-runs.
- **db:verify:** clean under `--fail-on warning`.
- **vitest:** **434/434 across 52 files** (was 279/35 at base: +155
  assertions across 17 new files, 8 files re-pinned), run against the
  freshly reset stack. First run green; no forks-worker transients
  this session.
- **Local gate (F12: app/lib/components/tests/e2e moved ⇒ full re-run):**
  **OUTSTANDING — see the banner.** What IS recorded: at `0fbe403` the
  first repaired run passed the full regression instrument —
  **walkthrough 11/11 + a11y 5/5 (16 passed)** — and the B9 leg's first
  test surfaced the REAL product defect fixed as `53479bd` (defect 4).
  At `53479bd`, run 1 failed on GoTrue being unreachable host-wide
  (classified infrastructure from raw curl — no product path involved;
  defect 6), leaving one permitted run under the flake policy ("two
  consecutive failed gate runs at one SHA = RED"). That run happens
  first thing in a follow-up session after a host reboot:
  `docs/ops/e2e-local-gate.md` prerequisites (the clamd container now
  carries a persistent `hc_clamav_db` volume) → `npx playwright test
  --trace on` → replace the banner and this line with the result →
  finalize the §4 flips → THEN the review.
- **lint · typecheck · production build:** clean.
- **gitleaks:** **240 commits scanned, no leaks found** (the identical
  digest-pinned image CI runs; the gate-config demo secrets in
  playwright.config.ts are local-stack values by construction).
- **check-service-role-containment / check-exposed-schemas:** both OK,
  exit 0.
- **Upgrade leg:** NO MIGRATION INCREMENT EXISTS — `supabase/` is
  byte-identical to main (`1c38947…`, the F12 hash), so the merge-base
  migration set IS the head's; the CI job's rehearsal reduces to the
  clean leg already recorded, and CI runs it on the pushed branch
  regardless (recorded in the kickoff once the run completes — pending
  never counts as green).
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

## Files

New: `lib/mail/{inbound,outbound}.ts` · `lib/scan/scanner.ts` ·
`lib/pipeline/mime.ts` · `lib/storage/artifacts.ts` ·
`lib/hc/{ingest,upload,workers,inbox,artifacts}.ts` ·
`lib/db/evidentiary.ts` · `app/api/inbound/postmark` ·
`app/api/upload/{token,complete}` · `app/api/worker/[stage]` ·
`app/api/worker/{relay,nightly}` · `app/api/artifact/[id]` ·
`app/(app)/[circle]/{upload,inbox}` (+3 submit routes) ·
`e2e/ingestion.spec.ts` · `docs/ops/ingestion-deploy.md` ·
`docs/adr/0019-4b-app-ingestion-deltas.md` · 17 test files · this
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
`vercel.json` (crons) · `playwright.config.ts` + `.env.example` (the
split env + gate config) · `docs/ops/{runtime-db-credentials,
e2e-local-gate}.md` · `docs/coverage.md` (the §4 flips; RLY-01, UXA-01,
RLS-10, APP-09b) · 8 re-pinned test files.
Untouched: **`supabase/` and `scripts/`** — the tree hashes above are
the proof; the migration bound stays spent at 8 of ≤ 8 with nothing
added.
