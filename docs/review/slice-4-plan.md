# Slice 4 — Ingestion: the slice plan

**Status:** **PLANNED — RULED. Q1–Q7 SETTLED 2026-08-18 at the plan
gate** (rulings recorded verbatim below; every recommendation
accepted). The 4A build (M1 the R8 batch FIRST) runs in its own fresh
session on `slice/4-ingestion`. Written 2026-08-18 in the planning
session; main confirmed at `2fc6e9b` (clean, in sync with origin) with
CI green at both the slice-3 merge commit `91f90cc` (run 62,
32224259849) and the docs follow-up `2fc6e9b` (run 63, 32224544413) —
the public API, checked first per the kickoff. The plan itself landed
docs-only at `18520e0`, **CI green on main — run 64, 32226627138,
SUCCESS** (public API, confirmed in-session).

**Authority:** TSD §11.1 row 4 ("Upload + forwarding address, the state
machine, scan, quotas, sender auth — arrivals exist and are visible
before anything reads them") → TSD §4 whole + §5.1–§5.4 + §2.4, §2.12,
§1.3/§1.4/§1.9, §3.10/§3.11, as amended by annexes A5/A6 (the 1C
as-built state is normative) → PRD §4.2, §8.4, §8.9, §13.1–§13.4 →
**ADR-0015 R8 (the batched bound amendment is this slice's HARD entry
criterion — migration 1, before any slice-4 work)** and standing rules
F12 (per-directory tree binding) / F14 (probe re-run on any upgrade) →
ADR-0007/0008 (the 1C design record; scope ruling M1: the operational
pipeline is production-disabled until RLY-01 lands — it lands here) →
ADR-0006 (owner sole merge authority) → `docs/coverage.md` row
conventions → `docs/ops/{security-actions-worker,
runtime-db-credentials, e2e-local-gate}.md`.

**Branch:** `slice/4-ingestion` (branched from main @ `2fc6e9b` or later
docs-only) — red→green per unit, failure signatures in every red
commit, merge commit never squash.

**THE HARD ENTRY CRITERION (ADR-0015 R8).** Slice 4 opens the DB, so
its **migration 1 is the batched bound amendment** — the five R8 items,
specified below as M1 — before any slice-4-proper work. APP-09b flips
only when the batch lands (its app half in 4B). `unconfirmEmail` and
`revokeAuthSessions` stay on the maintenance identity regardless (they
write `auth.*`, ungrantable from migrations on this image — the
recorded trap).

**Migration bound (Q3):** **≤ 8** (M1 the batch + M2–M7 planned + M8
reserved for round-12 dispositions — the slice-2/1C precedent). Shipped
migrations are never edited; transition-graph and seed-table changes
are appends with their pgTAP exact-set pins re-pinned in the same
commit (the 2A M6 pattern).

**Dependency bound:** **ONE argued runtime dependency** — `tus-js-client`
(Q4; §2.12's resumable uploads are a PRD §13.4 requirement, not an
optimisation). Everything else is zero-dep by design: the Postmark
inbound payload is JSON parsed directly (no SDK), the ClamAV adapter
speaks clamd's INSTREAM protocol over TCP (~50 lines), pgmq is SQL.
Dev-dependencies: none anticipated; **one reserved slot** for review
dispositions (the slice-3 precedent). Anything past this is an
owner-approved bound amendment.

**Skills gates (build sessions):** `supabase:supabase-postgres-best-practices`
**before any DDL authoring** (M1 included) · `vercel:nextjs` (and the
AGENTS.md `node_modules/next/dist/docs/` guides) before route/scaffold
work · `frontend-design` only if the inbox surface needs components the
slice-3 system lacks (it should not — compose, don't invent).

**HonuVault `patterns/` check — done in planning.** The applicable
`#portable` entries are largely THIS project's own 1C promotions, and
the machinery embodying them is already in the tree — reuse, don't
reinvent: [[transition-allowlist-as-data]] ·
[[sweep-revalidate-under-lock]] · [[claim-ack-outbox]] ·
[[idempotency-requires-identity]] · [[authorize-under-the-lock]] ·
[[two-session-concurrency-test-layer]] ·
[[catalog-based-privilege-closure-tests]] ·
[[canonical-contact-key-rate-limiting]] (quota/sender keys canonicalise
the way `hc.contact_key` does — case/whitespace variants share one
budget) · [[replica-mode-disables-fk-cascades]] (test harness).
Promotion candidate at slice completion: the zero-dep clamd INSTREAM
scanner adapter + EICAR gate leg, and/or the runtime-credential-split
runbook (M1 items 2+4), as `#portable`.

---

## What exists (do not rebuild) — verified against the tree

The 1C ruling (ADR-0008 M1) said it exactly: **the database
state-machine substrate is complete; the operational pipeline is not.**
Slice 4 is mostly the app layer over a DB core that already exists.

- **The whole 1C state machine, green:** `arrivals` / `arrival_events`
  / `pipeline_leases` / `known_senders` / `extractions` /
  `pipeline_outbox`; `hc.reason_codes`, `hc.stage_budgets` (store 2 ·
  scan 4 · gate 50 · extract 3 · interpret 3), `hc.arrival_transitions`
  (the closed §4.3 exit graph, exact-set pinned — ING-10);
  `hc.advance_arrival` (six outcomes, cancelled-before-fence),
  `hc.claim_stage` (durable attempt counter, exhaustion in-claim),
  `hc.create_arrival` (idempotent-with-identity — ING-11; P5 caps;
  channels closed), `hc.cancel_arrival`, the finalizers
  (`finalize_extraction`/`finalize_interpretation`) with owner-only
  lease-bound write halves, `hc.create_manual_proposal` (MNL-01
  SHIPPED), outbox claim/ack (OBX-01), `hc.sweeper_pass`
  (revalidate-under-lock — SWP-01), freeze parking (FRZ-15), the
  R-rule on every writer, ING-02/03 read policies (fail-closed
  all-domain taint; `auth_detail`/`current_lease_id` out of the column
  grant; `hc.arrival_auth_detail` at view).
- **2A's sender surfaces, green (SND-02):** `hc.accept_sender` /
  `hc.revoke_sender`, held-mail release via a real gate lease + CAS
  edge + outbox re-queue, 30-day expiry of unaccepted stranger mail —
  **DB halves only; the member-facing surfaces land here (4B).**
- **Extensions already installed (M001):** `pg_trgm` (the §5.3
  lookalike check) and `pgmq` (§1.4's queue) — no extension DDL needed.
- **Forwarding columns exist:** `subjects.forwarding_local_part`
  (citext, unique, ADR-0011 form, written by `hc.create_circle`) and
  `subjects.forwarding_active_at` (null ⇒ not provisioned at the MTA —
  the §5.1/AC-AUTH-3 absence mechanism). **No activation path exists** —
  nothing flips `forwarding_active_at`; that is M5 + 4B.
- **The 2B/3 app layer:** the four §1.7 factories (`asPipeline` ready
  for workers), the request-role channel and maintenance boundary
  (both fenced to `lib/hc`), the security-actions worker route +
  vercel.json cron precedent, the §8 design system + shell +
  components (the inbox composes these), the local-gate protocol with
  the a11y leg.
- **Verified ABSENT (the gap this slice fills):** no store/scan write
  halves — `hc.create_arrival` accepts intake metadata but **nothing
  can write `storage_key`/`content_sha256`/`mime_detected` or
  `scan_verdict`/`scan_at`** (grep-verified; stage workers hold no
  UPDATE on arrivals by design) · no `scan_results` cache · no
  `hc.product_state`/`state_label` (PST-01 pending) · no quota
  machinery · no duplicate-detection machinery (ING-10 notes §4.7
  edges "append with their machinery") · no Storage buckets, no
  storage policies · **no routes but one**: `app/api/` holds only
  `worker/security-actions` — no inbound webhook, no upload, no
  artifact route (RLS-10 pending), no `worker/[stage]` · no
  `lib/{mail,scan}` adapters · no worker runtime/scheduler/relay
  (RLY-01 pending).
- **The maintenance module as the batch expects it:**
  `lib/db/maintenance.ts` exports exactly six ops — `insertAccountRow`,
  `setAccountSlice`, `updateOpeningContext`, `describeInviteByToken`
  (the four clean conversion candidates) + `unconfirmEmail`,
  `revokeAuthSessions` (the two `auth.*` ops that stay).
- **The regression net this slice must not dent:** 46 migrations exact
  · pgTAP **1134/1134 across 43 files** · concurrency **55/55 across
  32 cases** (teed) · vitest **279/279 across 35 files** · local gate
  **16/16** (walkthrough 11/11 + a11y 5/5) · lint/typecheck/build
  clean · `supabase/` tree hash `53a8517…` unchanged since `fe2aed6`.

---

## Migration 1 — the ADR-0015 R8 batch (the spec)

One migration, `r8_bound_amendment`, five items, **before any slice-4
work**. pgTAP file 043 lands red-first against every item; the 002
definer/grant inventories, INV-14 two-way snapshot and DEF rows
re-pinned in the same commit.

1. **The sign-out access-log half (APP-09b, R1).**
   `hc.log_event_types` gains `signed_out`; `hc.log_sign_out()` —
   SECURITY DEFINER, authenticated EXECUTE, zero parameters (actor =
   `hc.uid()`, nothing spoofable) — writes the §5.5 entry (domain-less,
   per live membership; exact scoping red→green at build — the TSD
   names the entry, not its scoping). The app call is 4B; APP-09b flips
   there, both halves referenced.
2. **The four maintenance-definer conversions (R3).**
   `hc.create_account(p_display_name)` (authenticated; inserts the
   caller's OWN row, kind `member`, keyed `hc.uid()` — no target
   parameter) · `hc.describe_invite(p_token)` (anon + authenticated;
   token-keyed, DEF-10 one-shape refusal — the pre-auth accept screen's
   read) · `hc.set_slice(p_slice)` (authenticated, own row) ·
   `hc.set_opening_context(p_circle, p_context)` (authenticated; the
   founder's own in-setup circle with the ADR-0015 F7 zero-row
   postcondition now IN-FUNCTION — a forged/stale/foreign id refuses
   loudly). `lib/db/maintenance.ts` shrinks to the two `auth.*` ops;
   the four call-sites move onto the request-role channel in 4B; the
   ESLint fence and its tests re-pin the shrunken surface.
3. **The step-1 relationship column (R2 — the owner names the table,
   Q2).** Recommended home: **`circle_members.relationship`** (text,
   bounded ≤ 120, nullable for pre-existing rows) on the founder's
   membership row, written by `hc.create_circle` — signature gains
   `p_relationship` (create-or-replace; the 2B carry already delivers
   both step-1 answers to the create_circle moment, so the write is
   the one line ADR-0015 F1 promised). Alternatives at Q2.
4. **The dedicated lower-privilege runtime role (R3).** `hc_runtime` —
   NOLOGIN, member of `anon` + `authenticated` (the SET ROLE channel)
   and NOTHING else; pgTAP pins the privilege inventory two-way
   (INV-14 pattern). Hosted: `HC_DB_URL` flips to a dedicated LOGIN
   credential IN ROLE `hc_runtime` at deploy
   (`docs/ops/runtime-db-credentials.md` gains the provisioning +
   verification row); local: a login credential provisioned by seed,
   never by migration (no secrets in DDL). After the flip the request
   path's blast radius is the enumerated surface; the maintenance
   credential remains only behind the two-op module.
5. **The worker claim/lease primitive (round-10 F9's DB half).**
   `hc.claim_security_actions(p_limit)` — hc_pipeline-only; claims the
   oldest unclaimed pending rows (`claimed_until = now() + 5 min`,
   `FOR UPDATE SKIP LOCKED`), so concurrent sweeps are disjoint by
   construction rather than safe-by-idempotence alone;
   `hc.complete_security_action` unchanged; the sweep route adopts it
   in 4B. Concurrency case: two claims, disjoint rows, no row starved.

---

## The increment — unit map (4A DB → round 12 → merge; 4B app → round 13, per Q1)

### 4A — the database increment (migrations M1–M8, bound ≤ 8)

| # | File | Contents | Spec |
|---|---|---|---|
| M1 | `r8_bound_amendment` | The batch, as specified above. | ADR-0015 R8 |
| M2 | `stage_write_halves` | The store/scan outcome writers the substrate deliberately lacks, in the §4.5/D9 shape (transition-gated, one transaction, owner-only lease-bound write halves): `hc.finalize_store(p_arrival, p_lease, p_storage_key, p_sha256, p_mime_detected, p_byte_size)` — gates `received → stored` (verifies the content-addressed key shape `circle/<circle>/arrival/<arrival>/<sha256>` and re-checks the P5 caps against measured bytes) with `store_failed` as the honest nothing-was-kept edge; `hc.finalize_scan(p_arrival, p_lease, p_verdict, p_detail)` — gates `stored → scanned \| quarantined \| scan_unavailable \| scan_inconclusive`, writes `scan_verdict`/`scan_at`; `public.scan_results` (sha256 → verdict cache; doubles as PRD §11.5's 7-day malware hash+verdict retention with an expiry sweep leg); pgmq queue creation (`pgmq.create`) for the pipeline work items. | §4.3, §4.5; A5/A6 |
| M3 | `quotas_lookalike` | §5.4 as data + arithmetic: `hc.quota_limits` seeded (per-circle and per-sender messages/hour and /day, attachment count, file size, total inbound bytes, monthly processing ceiling — PRD §13.3 values seeded as PROVISIONAL operational hypotheses, the BGT-01 precedent) · `hc.check_quota(p_circle, p_sender, …)` computing over `arrivals` via the existing indexes, returning an ENUMERATED outcome (`ok · over_sender · over_circle · over_capacity`) so the webhook can apply the §5.4 bounce/drop table without re-deriving policy · the monthly-ceiling notify-not-fail signal · `hc.sender_lookalike(p_circle, p_domain)` — pg_trgm similarity against the circle's live `known_senders` domains (a near-miss is MORE suspicious, → `'lookalike'`). Quota keys canonicalise case-blind (the contact-key pattern). | §5.4, §5.3 |
| M4 | `product_state` | PST-01: `hc.state_rank` + `hc.state_label` (the family-facing vocabulary, PRD §4.2.2) + `hc.product_state(p_arrival)` — a parent reports its least-advanced live child (the A.4 parent-rollup oracle, asserted with deleted/cancelled-child edges); authenticated EXECUTE, DEF-10 shape for nonexistent/unauthorized. | §4.4; A.4 |
| M5 | `forwarding_activation` | `hc.activate_forwarding(p_subject)` — flips `forwarding_active_at` only when the founder's email is verified (the postgres-owned mirror, the AC-AUTH-4 pattern), idempotent, writes the §5.1 access-log entry; `hc.log_event_types` appends: `forwarding_activated`, `artifact_read` (the §1.3 step-6 entry the artifact route needs). Deactivation on subject/circle deletion stays with the deletion surface (DEL-01, later slice — named, not dropped). | §5.1, §1.3 |
| M6 | `duplicates_stage1` | §4.7 point 1 (the exact-sha check against non-deleted arrivals in the circle — the same file forwarded twice; stage-2's key-field match is slice 5): `hc.arrival_transitions` appends the `duplicate_suspected` edges (post-scan human-wait entry + the two resolution exits), ING-10's exact-set pin re-pinned same commit · `hc.detect_duplicate` in the scan finalizer's transaction · `hc.resolve_duplicate(p_arrival, p_resolution)` — member surface, manage-gated like cancel, R-rule lock, DEF-10; `different` resumes to the gate; `same_thing` terminalizes as `nothing_filed` reason `duplicate_of_arrival` (the attach-as-additional-source outcome needs a filed document — refined with slices 5/6, never auto-discarded either way). | §4.7; PRD §8.9 |
| M7 | `storage_buckets` | `artifacts` + `quarantine` buckets (private; content-addressed keys; the §2.12 shapes) with the §3.11 posture asserted in catalog terms: ZERO `authenticated` policies on `artifacts` (the absence IS the mechanism — only the artifact route's service-role client reads), no read grant for ANY role on `quarantine`; size caps at the bucket level where the platform supports them. `exports` waits for its slice. | §2.12, §3.11 |
| M8 | *(reserved)* | Round-12 dispositions/fixes — the 1D/2A precedent. | — |

**4A test plan:** pgTAP 043–049 (one file per migration; negative,
replay, refusal-shape and mutation cases; privilege closure stays
catalog-based — the segfault trap); concurrency additions (teed):
security-actions claim disjointness · resolve_duplicate vs a freeze
committing mid-wait (R-rule) · finalize_store/finalize_scan vs
cancellation (the ING-08 orphan-row class extended to the new
finalizers) · quota check under concurrent intake. CI:
verify-migration-state exact counts updated (46 → 46+N); upgrade leg
green (merge-base worktree → `migration up` → both suites); db:verify
clean under `--fail-on warning`.

### 4B — the app increment

| # | Unit | Contents | Spec |
|---|---|---|---|
| B1 | `lib/mail/inbound.ts` | The Postmark adapter: payload → sender-auth verdict per the §5.3 chain IN ORDER — (1) the provider's out-of-band SPF/DKIM/DMARC fields from a signature-verified payload, (2) where a header must be read, an `Authentication-Results` bearing OUR configured `authserv-id` exactly, bound to the trusted hop, (3) incoming A-R strip/rename posture documented at the MTA config, (4) ARC per Q5's ruling. Display name NEVER an input to the verdict; lookalike via M3. Fixture suite includes forged-A-R and lookalike cases (G7's adversarial set starts here). | §5.3 |
| B2 | `/api/inbound/postmark` | The §5.2 six steps literally: verify signature → resolve local part (no match = defence-in-depth 550 path) → M3 quota check applying the §5.4 bounce/drop table (aligned ⇒ readable bounce; unauthenticated ⇒ DROPPED, never bounced — no backscatter; capacity ⇒ bounce with everything else still working) → evaluate verdict, store verbatim → `hc.create_arrival` parent + one child per attachment in ONE transaction (bounds: 20/50 MB/200 pages — the P5 caps already refuse) → enqueue + eager worker fire, return 200 BEFORE any processing (§13.1: acceptance ≠ processing). | §5.2, §5.4, §4.6 |
| B3 | Upload | TUS token mint route (server-minted, subject-scoped, expiring; the right-to-ingest check against the caller's grants — level decided from PRD §4.2 at build, red-first) → resumable client upload (`tus-js-client`, Q4) → completion computes sha, calls `hc.create_arrival` (channel `upload`) → eager store worker. The upload surface composes slice-3 components under the §8.3 shell. | §2.12, §1.8; PRD §13.4 |
| B4 | Workers + scanner | `/api/worker/[stage]` for store · scan · gate, each the §4.3 sequence exactly: `claim_stage` → COMMIT → external work → finalize (M2's finalizers; the gate uses the existing SND-01 machinery). `lib/scan/scanner.ts`: clamd INSTREAM over TCP, `clean \| infected \| unavailable \| inconclusive`, nothing persisted provider-side (the §1.6 constraint that ruled out hosted scanners); `scan_results` cache-hit path skips the scanner. Key/auth posture per the security-actions precedent (timing-safe, 503-when-unset). | §4.3, §1.6 |
| B5 | RLY-01 — the relay + schedulers | The outbox relay (`hc.outbox_drain` → pgmq enqueue → `hc.outbox_ack`; a crash between drain and ack re-delivers — OBX-01's contract, now exercised end-to-end) · the sweeper scheduler (`hc.sweeper_pass` per minute; `hc.run_taint_sweep` nightly — the OPS-01/D6 ruling, now real) · vercel.json gains the crons (paid-plan requirement already recorded) · the security-actions sweep adopts M1's claim primitive. The A.5 worker-layer halves (kill-before-transition, outbox-loss recovery) run as tests here. **RLY-01 flips; the production-disabled ruling (ADR-0008 M1) lifts for store/scan/gate.** | §1.4, §4.11; ADR-0009 D6 |
| B6 | The inbox surface | The arrivals list under the UXA-01 ruling (Q6): product-state labels via M4, the §5.3 verdict SHOWN (`verified` / `unverified · we couldn't confirm this came from them`), held-mail with accept-sender / release (the 2A SND-02 DB halves get their member surfaces), cancel, duplicate resolution, the 30-day expiry warning, the 4-hour "reading is delayed" notice (§4.11). Composes slice-3 components; empty states per §8.6. **UXA-01 flips with its disposition recorded.** | §4.4, §5.3–§5.4; ADR-0008 M4 |
| B7 | The artifact route | `/api/artifact/[id]` — the §1.3 six steps: RLS-scoped row (no row ⇒ 404, indistinguishable) → `visible_at ≥ view` → `scan_verdict = 'clean'` independently (AC-INBOX-15 — a pipeline bug cannot expose an unscanned file) → service-role signed URL created and consumed server-side, bytes streamed, never surfaced → `private, no-store`, Range supported → `artifact_read` access-log entry (M5's event type). The ONE sanctioned `asServiceRole` consumer outside the migration runner — the A2 fence allowlist finally earns its slot. **RLS-10 flips** (pre-revocation URL fails; 404 ≡ 403). | §1.3, §3.11; A.2 |
| B8 | The credential split, applied | The four converted call-sites move onto M1's definers through the request-role channel; `lib/db/maintenance.ts` shrinks to `unconfirmEmail` + `revokeAuthSessions`; fence tests re-pin; sign-out calls `hc.log_sign_out` (**APP-09b flips**); `HC_DB_URL` → `hc_runtime` locally + the deploy-checklist row. | ADR-0015 R1/R3 |
| B9 | E2E ingestion leg | `e2e/ingestion.spec.ts` under the local-gate protocol: founder uploads (TUS) → arrival visible, honest states through store/scan/gate → synthetic Postmark webhook POST (fixtures, signed) from an unknown sender → `held_unknown_sender` visible → accept sender → release → gate passes · the EICAR quarantine path (clamd container in the gate stack; `quarantined` ≠ `scan_unavailable` demonstrated) · cancel · duplicate suspect + resolve · artifact route streams the clean original; a second member below the cliff sees nothing (Q6's matrix probed live). The 11-step walkthrough + a11y leg stay the regression instrument, re-run unchanged. | §11.4-4 (partial); ADR-0015 R6 |

**The inter-slice seam, stated (Q7):** through slice 4 the pipeline
runs `arrive → store → scan → gate`. A gated arrival advances to
`extracting` and RESTS there — its label says the honest thing, the
relay enqueues work nothing consumes yet, and the extract/interpret
workers are slice 5's (§11.1 row 5 "needs slice 4's arrivals").
Nothing is production-activated regardless: no real forwarding address
exists before the G4 activation path runs against a real deploy, and
G7 blocks activation until its abuse set is demonstrated. The deploy
checklist (`docs/ops/security-actions-worker.md` + a new
`docs/ops/ingestion-deploy.md` if review wants it separate) grows:
Postmark server + webhook secret + provisioning credential · clamd
endpoint · pipeline worker key · the pgmq/cron rows · the `hc_runtime`
credential flip + role-flag verification.

---

## Test surface

**pgTAP (CI):** 043–049 per the 4A table — the batch inventory re-pins
(002/INV-14/DEF), the new finalizers' orphan-row and refusal cases, the
quota arithmetic table, product_state rollup oracle, duplicate edges
against the ING-10 exact-set, storage-catalog absences.
**Concurrency (CI, teed):** claim disjointness · resolve-vs-freeze ·
finalize-vs-cancel · quota-vs-intake.

**vitest (CI):** mocked route contracts for webhook (six-step order,
bounce/drop table, byte-identical acceptance before processing),
upload/token, workers (claim→commit→work→finalize order; scanner
adapter states), artifact route (404-shape, clean-gate, no-store,
allowlist) · live-DB integration for the definers, quotas,
product_state, claim primitive · the fence re-pins (maintenance module
shrunk; service-role allowlist + artifact route). The four-class
taxonomy labels every row — a mocked call-order assertion is never
described as live-authority proof.

**Local gate (browser truth):** the B9 ingestion leg joins
`docs/ops/e2e-local-gate.md` (protocol doc gains the clamd container
prerequisite); walkthrough 11/11 + a11y 5/5 re-run UNCHANGED at every
head whose `app/ lib/ e2e/ supabase/` trees move (F12).

**What stays out, named:** extraction/interpretation and stage-2
duplicates (slice 5) · conflict outcomes CNF-01 and the review screen
incl. A11Y-07 (slice 6) · A11Y-08 (5/6) · SIG-01 (the worker runtime
now exists, but the KMS key + ledger store are deploy-level — stays
pending, not quietly absorbed) · FRZ-16b, RLS-11b, SHR-02, DEL-01,
ADM-01 (their slices) · G12-01 (gate).

## Coverage rows to open (docs/coverage.md gains "## 4 — ingestion")

| ID | Assertion (compressed) | Layer | Status at slice end |
|---|---|---|---|
| BAT-01 | `signed_out` event type + `hc.log_sign_out` (zero-parameter, actor = uid) | pgTAP | green (4A) |
| BAT-02 | The four maintenance ops are definers on request-role authority; the maintenance module holds exactly the two `auth.*` ops (fence-pinned) | pgTAP + app | green (4B) |
| BAT-03 | Step-1 relationship durably persisted at the owner-named table, written in `create_circle`'s transaction (F1 closure) | pgTAP + app | green |
| BAT-04 | `hc_runtime` holds exactly anon/authenticated membership, two-way pinned; deploy row recorded | pgTAP + review | green |
| BAT-05 | Security-actions claim/lease: concurrent sweeps disjoint, no starvation | pgTAP + multi-session | green |
| STO-01 | Store stage: content-addressed write-once, `store_failed` = nothing kept, finalizer transition-gated | pgTAP + app | green |
| SCN-01 | Scan: four verdicts distinct and never collapsed; cache = 7-day retention; quarantine unreleasable; EICAR live in the gate | pgTAP + app + e2e | green |
| QTA-01 | §5.4 quotas + the bounce/drop table (aligned bounce · unauthenticated drop · capacity bounce with everything else working; nothing deleted to make room) | pgTAP + app | green |
| SAU-01 | §5.3 verdict chain: provider-fields-first, authserv-id-anchored, strip posture, ARC per Q5, lookalike MORE suspicious, display name never matched, verdict shown | app + review | green |
| DUP-01 | Stage-1 duplicates: suspect + human resolution, never auto-discarded | pgTAP + app | green |
| FWD-01 | Activation: verified-only flip + §5.1 log entry; inactive = 550-by-absence (provider provisioning = deploy checklist) | pgTAP + app | green |
| INB-01 | The webhook: six steps in order, accepts-before-processing, parent+children one transaction | app | green |
| UPL-01 | TUS upload: server-minted subject-scoped token, right-to-ingest checked, resume works | app + e2e | green |
| PST-01 | *(flip)* product_state + parent rollup live | pgTAP | green |
| RLY-01 | *(flip)* relay + schedulers as workers; A.5 worker halves; production-disabled ruling lifted for store/scan/gate | worker | green |
| UXA-01 | *(flip)* the inbox gate disposition per Q6, surface built to it | review | review |
| RLS-10 | *(flip)* artifact-route 404 indistinguishability; pre-revocation URL fails | HTTP | green |
| APP-09b | *(flip)* AC-AUTH-10's access-log half — both halves referenced | app | green |

---

## Owner decisions — SETTLED 2026-08-18 (the plan-gate rulings)

The owner ruled on the seven batched questions at the plan gate,
2026-08-18, in the planning session. Recorded verbatim; the build
executes on these:

- **Q1 — SETTLED:** **4A/4B split** — 4A (M1–M8 DB, incl. the R8
  batch) → round-12 review → merge; then 4B (app B1–B9) → round-13.
  The 2A/2B cadence.
- **Q2 — SETTLED:** The R2 table is **`circle_members`** —
  `circle_members.relationship` on the founder's membership row,
  written inside `hc.create_circle`'s transaction.
- **Q3 — SETTLED:** Migration bound **≤ 8** (M1 the batch + M2–M7
  planned + M8 reserved for round-12 dispositions).
- **Q4 — SETTLED:** **`tus-js-client` approved** — the one argued
  runtime dependency; everything else zero-dep; the dev-dep reserve
  slot unchanged.
- **Q5 — SETTLED:** **ARC validation deferred to a pre-activation G7
  hardening item.** Interim: provider-verdict-first +
  authserv-id-anchored parsing; alignment-broken mail lands
  `held_unknown_sender` — fail-closed to a human; G7 re-examines
  before any real forwarding address activates.
- **Q6 — SETTLED:** **The UXA-01 disposition ratified as presented**
  (the four M4 conditions answered: manage-×5 inbox audience ·
  no below-cliff processing affordance, the pinned cliff is the
  recorded fail-closed choice · the coordinator-diagnosis guarantee as
  a requirement on any future coordinator-minting path ·
  `hc.share_object` on the arrival as the named disclosure channel).
  UXA-01 flips to review-green with this disposition; B6 builds to it.
- **Q7 — SETTLED:** **The inter-slice seam accepted as stated** —
  gated arrivals rest at `extracting` with an honest label until
  slice 5's workers; production activation stays G4/G7-gated.

The questions as put to the owner (with the recommendations that were
accepted) are preserved below for the record.

## Owner decisions needed — the batched questions (the round-10 pattern)

**Q1 — Increment split.** **Recommended: 4A (M1–M8 + tests) → round-12
review → merge; then 4B (B1–B9) → round-13** — the 2A/2B cadence. The
DB half carries the R8 batch (a privilege-model change that deserves
isolated scrutiny) and reviews cleanly alone; no 4B unit is needed to
green 4A's rows. Alternative: single increment — rejected by the
precedent that put the credential split in this slice at all.

**Q2 — The R2 table (the ruling ADR-0015 reserved for you).** Where
does the step-1 relationship live? **Recommended:
`circle_members.relationship`** on the founder's membership row,
written inside `hc.create_circle` — it generalises to every future
member (People & roles renders relationships eventually), keeps the
fact next to the actor it describes, and the write is the one line F1
promised. Alternatives: `circles.founder_relationship` (circle-level;
dies the day anyone else's relationship matters) ·
`accounts.relationship` (global; wrong scope — the answer is about
THIS circle's subjects, and the `accounts.slice` precedent doesn't
transfer because slice really is account-global).

**Q3 — The migration bound.** **Recommended: ≤ 8** — M1 the batch +
M2–M7 planned + M8 reserve, the slice-2 shape. Every planned migration
is named above with its contents; anything past the bound is a
recorded owner amendment before a line is written.

**Q4 — The one runtime dependency.** `tus-js-client` for §2.12's
resumable uploads (PRD §13.4 "interrupted upload resumes" is a stated
requirement; hand-rolling TUS is invented wheels). **Recommended:
approve.** Everything else stays zero-dep (Postmark JSON direct, clamd
INSTREAM hand-rolled, pgmq is SQL). Alternative: plain non-resumable
upload now, TUS later — retrofit waste against a named requirement.

**Q5 — ARC validation scope (the G7 question the read surfaced).**
Cryptographic ARC-chain validation against a trusted-sealer list
(§5.3's forwarded-mail rescue) needs a real mail-auth library — a
heavyweight dependency for one clause. **Recommended: defer ARC to a
pre-activation G7 hardening item.** Slice 4 ships provider-verdict +
authserv-id-anchored parsing; forwarded mail that breaks alignment
lands `held_unknown_sender` — **fail-closed to a human**, which is the
product's stated posture for everything unproven, and G7 re-examines
before any real forwarding address activates. Cost: more held mail in
the interim, zero real users affected. Alternative: take `mailauth`
now as a second runtime dep.

**Q6 — The UXA-01 disposition (round-7 M4's conditions, answered).**
**Recommended reading:** (1) the inbox is the manage-×5 audience by
design — the same audience that can approve (proposals already read at
manage-over-drafted-taint; the arrival list is its antechamber);
(2) below-cliff members get NO processing affordance — "an item is
processing" IS existence, and the cliff (manage on 4 of 5 ⇒ zero rows,
pinned 027:31) is the fail-closed choice recorded, not an accident to
paper over; (3) the coordinator-diagnosis guarantee: every coordinator
today holds manage×5 by construction (founders; 2A invites mint
family/care only) — recorded as a REQUIREMENT any future
coordinator-minting path must satisfy or re-open this ruling; (4) the
share-based disclosure flow = `hc.share_object` on the arrival (exists
since 1B/1C) is the named channel for showing one item below the
cliff. Ratifying this flips UXA-01 to review-green with the
disposition recorded.

**Q7 — The inter-slice seam.** Gated arrivals rest at `extracting`
(honest label) until slice 5's workers; the relay enqueues to a queue
nothing consumes yet; production activation stays gated (G4/G7) so no
family ever sees the seam. **Recommended: accept as stated** — the
alternative (holding the gate's exit closed until slice 5) would mean
re-editing the transition graph twice and showing held-forever states
the §5.3 copy doesn't mean.

---

## Completion recipe (per increment) + gate cadence

**Per unit:** red commit with the failure signature in the message →
green → the unit's tests join the suite. **At each increment head:**
clean-leg reset exact-N (46 + M at 4A) · pgTAP all green · concurrency
all green (teed) · db:verify clean under `--fail-on warning` · upgrade
leg green · vitest all green (count recorded exactly) · local gate:
walkthrough 11/11 + a11y 5/5 UNCHANGED (+ the B9 leg at 4B) under the
protocol · lint/typecheck/production build clean · gitleaks clean ·
coverage rows flipped with refs, pendings annotated, never early ·
ADR-0017 (4A deltas incl. the batch as-built + any TSD annex) /
ADR-0018 (4B) · review packet in the round-8 shape (head ledger from
the start, one-SHA evidence block, per-directory tree binding per
ADR-0015 F12, pointed questions with recommended answers).

**The gate cadence, each leg its own fresh session:** this plan → owner
rulings on Q1–Q7 (recorded verbatim in this plan as SETTLED) → 4A build
red→green (M1 FIRST) → round-12 packet → third-party review →
dispositions ADR → owner sign-off → merge (never squash) → 4B build →
round-13 → dispositions → sign-off → merge. Standing constraints
throughout: main stays green · DDL only within the owner-approved
bound, shipped migrations never edited · never real family data · the
dependency bound above · browser legs local-gate only ·
`supabase:supabase-postgres-best-practices` before any DDL authoring ·
G12 still blocks the first non-founder invitee (design-conformance §4
watch items untouched by this slice).
