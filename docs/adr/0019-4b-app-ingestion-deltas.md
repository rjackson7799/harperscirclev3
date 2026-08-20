# ADR-0019 — 4B as-built: the app half of ingestion (B1–B9)

**Status:** Proposed — round 13 ratifies or amends it.
**Deciders:** the 4B build session (owner ratifies at the round-13 gate).
**Context:** Slice 4B built the app half of ingestion on `slice/4b-app-ingestion`
per the SETTLED plan (`docs/review/slice-4-plan.md`, Q1–Q7 verbatim; no
new plan gate) and ADR-0018 WITH its addendum (the inherited round-12
obligations). The numbering note first: the plan's "ADR-0018 (4B)" slot
was consumed by the round-12 dispositions — this ADR is **ADR-0019,
renumbered, not reused**. 4B is APP-ONLY: `supabase/` is byte-identical
to main (the F12 hash in the round-13 packet is the proof); the spent
≤ 8 migration bound was never approached. Dependencies: exactly
`tus-js-client` (Q4-approved), the dev-dep reserve untouched.

Each delta below is an as-built decision the plan left open, a recorded
deviation, or a named gap — offered to round 13 with its argument.

## D1 — The storage plane: the A2 allowlist grew as ADR-0018 F2 sanctioned

M7 shipped ZERO `storage.objects` policies (049 pins the absence), so
every byte in either bucket moves on the service credential's storage
surface — the webhook's staging, the store worker's content-addressed
writes, the quarantine move, the §11.5 byte purge, upload staging, the
artifact route's signed URL. F2's sanction ("a service-role storage
client under the A2 allowlist discipline") is executed as ONE fenced
module: `lib/storage/artifacts.ts` over `asStoragePlane()` (the
gotrue-admin same-credential-narrower-shape precedent: the storage API
alone, never PostgREST data reads). The ESLint fence restricts the
module to `app/api/{inbound,worker,upload,artifact}/**`; lib/hc may not
touch bytes; the credential name still lives in exactly one file (the
containment grep unchanged). The FULL client (`asServiceRole()`,
implemented at B7 from the 2B stub) has exactly one consumer: the
artifact route.

## D2 — Intake staging: acceptance is rows AND bytes; the store worker reads staging, not the provider

§13.1's 99.9 % acceptance cannot survive a 200 whose bytes exist only
in the provider's retention, so the webhook stages every part durably
(`intake/<circle>/<arrival>`) BEFORE answering 200, and upload
completion stages the same way. The store worker therefore reads
staging — a recorded deviation from §1.6's "raw-MIME retrieval"
sketch: no provider fetch-back exists, the swap-cost row's expensive
half shrinks, and a synthetic (fixture) webhook exercises the identical
path the live one takes. Staging lives until SCAN's definitive exit
(scan needs the bytes; unavailable retries need them too): clean /
inconclusive remove it, infected removes it after the quarantine move.
Re-staging is idempotent (one key per arrival; the content-addressed
final key is write-once by construction).

## D3 — Message lineage: channel and circle ride the queue; ack is ARCHIVE

`hc_pipeline` deliberately cannot read `arrivals`, so the worker layer's
facts ride the work item: `{circle_id, arrival_id, stage, channel}`.
Workers ack by `pgmq.archive`, deliberately — the archive (whose SELECT
M2 granted) is the lineage store: a bare relay/sweeper-originated
message recovers `channel`/`circle_id` from the oldest archived intake
message (`lookupLineage`). Unknown lineage FAILS CLOSED: the gate falls
back to the sender question (AC-INBOX-7 outranks upload convenience —
a doubly-degraded upload could land held, honestly labelled), and
store/scan report bytes-missing so exhaustion terminalizes with its
stated reason.

## D4 — The gate is a MAIL guard; uploads pass without a sender probe

The transition graph carries no channel condition, so the WORKER is the
gate's brain: channel `upload` advances `scanned → extracting` with a
null reason; email (or unknown lineage) asks `hc.sender_recognised`.
One softening recorded: a gate claim answering `invalid_state` is
absorbed with a warn, not raised as the §4.2 defect signal — the scan
worker enqueues gate work speculatively (it cannot see whether the
clean verdict landed `scanned` or `duplicate_suspected`), so a
duplicate's gate message arriving at a non-gate state is an expected
shape, not a stale-worker defect.

## D5 — Scan retry posture: the worker never finalizes 'unavailable'

§4.3's "3 retries over 30 min, then scan_unavailable" is implemented by
the MACHINERY, not by the worker: an unavailable adapter answer acks
the message without finalizing, the open lease expires on its 600 s
wall clock, the sweeper re-lists, and claim-exhaustion (budget 4) lands
`scan_unavailable` with `scan_budget_exhausted`. `finalize_scan
('unavailable')` therefore has no app caller — the worker never burns
the terminal state on attempt 1, and no budget constant is duplicated
app-side. INCONCLUSIVE is different: the scanner ANSWERED (an ERROR
reply — e.g. the INSTREAM size limit), that answer is a fact about the
bytes, and it finalizes immediately as its own state. The four states
never collapse (A9's reconciled contract; the adapter is
`lib/scan/scanner.ts`, zero-dep INSTREAM over TCP, nothing persisted
provider-side).

## D6 — The upload right-to-ingest level: manage over the all-domain taint

The plan left the level to "PRD §4.2 at build, red-first". Ruled here:
**manage over the fail-closed all-domain taint** — the approve/cancel/
resolve bar and Q6's audience argument (who can approve can ingest; an
uploader can always see what they uploaded; below-cliff members get no
affordance and no oracle — the probe's zero-row shape covers
nonexistent, unauthorized and below-cliff alike). The mint checks it;
completion RE-CHECKS it (§4.9's write-time principle).

## D7 — The evidentiary boundary: artifact_read without a definer

M5 shipped the `artifact_read` event type with no definer, and `hc.log`
is hc_internal-only (the hash chain is the definer family's). The write
path is `lib/db/evidentiary.ts` — ONE named operation on the
maintenance connection identity assuming `hc_internal` for one
statement (`grant hc_internal to postgres` is 001's documented
exemption), display name read in the same transaction, fenced to
lib/hc like the maintenance boundary. BAT-02's letter is untouched:
`lib/db/maintenance.ts` holds exactly the two auth.* ops. The route
enforces EVIDENCE BEFORE BYTES: the entry lands before the stream and a
failed entry refuses the read (§10.5). Standing candidate for the next
DB-opening slice: `hc.log_artifact_read(p_arrival)` as an
authenticated definer with in-function authorization, retiring this
boundary.

## D8 — The B8 split as-built: HC_MAINTENANCE_DB_URL, and the INHERIT correction

The four converted call-sites ride the request-role channel;
`HC_DB_URL` now authenticates as the runtime login (locally the
seed-provisioned `hc_runtime_login` — dev, vitest's dedicated pin file
and the walkthrough all run with production's blast-radius shape); the
maintenance identity moved to its own var, `HC_MAINTENANCE_DB_URL`
(the two-op module + the evidentiary append and NOTHING else ride it).
One runbook correction recorded: the hosted verification's bare-login
probe expected a privilege refusal, but `hc_runtime`'s memberships are
INHERIT, so the grant resolves and the honest probe is **zero rows**
(RLS with no identity), plus the auth.*/hc.log unreachability probes —
`tests/db/runtime-credential.test.ts` runs the local stand-ins in CI.
NOINHERIT membership would tighten this and is left as a round-13
question (it is a role attribute change — DDL, hence an owner matter).

## D9 — The §5.4 table as-built: unauthenticated mail is NEVER bounced, capacity included

The letter of §5.4's capacity row says "bounce with the limit in plain
words" without an alignment qualifier, but the table's own reasoning —
"bouncing forged mail sends our reply to the forged victim" — does not
stop applying at the capacity bound. As built: aligned ⇒ bounce (the
capacity text names the limit and says everything else keeps working);
unauthenticated ⇒ DROPPED for every over-* reason, capacity included.
Attachment-count and per-file-size breaches ride the same table (they
are quota dimensions). Response plumbing: drop = 200-nothing-stored
(the provider retries nothing, no backscatter channel exists at all);
unknown/inactive recipient = 403 blocked (visible drift, the provider
stops retrying); the bounce SEND is env-gated (`POSTMARK_SERVER_TOKEN`
unset ⇒ recorded 'unsent' — pre-activation no real sender can be owed
one) and a send failure never turns a refusal into a retry loop.
Offered to round 13 as a pointed question (packet Q-i).

## D10 — §4.3's "downloadable with the reason stated" vs §1.3's clean gate

§4.3 says `scan_unavailable`/`scan_inconclusive` artifacts are
"downloadable with the reason stated"; §1.3 step 3 (and the B7 plan
row, AC-INBOX-15) gates the artifact route on `scan_verdict = 'clean'`
INDEPENDENTLY. Built to §1.3's letter: the route refuses everything
non-clean in the one 404 shape; the inbox states the reason. The
tension is real and flagged (packet Q-ii): if the product wants
unchecked-but-honest downloads, that is a deliberate later carve-out
with its own warning surface, never a quiet route widening.

## D11 — The §5.3 chain as-built (Q5's interim), and the adapter's honest bounds

Provider out-of-band verdict fields are read FIRST and the chain STOPS
there (a forged in-MIME header can never rescue or manufacture a
verdict); the header path accepts only an `Authentication-Results`
bearing OUR authserv-id (full-token, case-insensitive — a domain) that
sits ABOVE the first foreign `Received` line with the trusted hop
present (trace headers are prepended; an A-R below a foreign hop
travelled with the message). ARC never authenticates (Q5: deferred to
pre-activation G7); alignment is relaxed-mode approximated as
suffix-match without a public-suffix list (zero-dep; strictly narrower
for multi-label public suffixes; G7 revisits with ARC). Two deploy
verification rows carry the honest unknowns: the live payload's
verdict-field NAMES, and the provider's A-R strip posture
(`docs/ops/ingestion-deploy.md`). The lookalike answer OVERRIDES the
stored result (a DMARC-passing lookalike domain is more suspicious,
not less) and the inbox shows it its own copy.

## D12 — UXA-01's binds as rendered

The inbox is the manage-×5 audience by the RLS cliff, and the empty
state shows THIS CALLER'S view without asserting the world is empty —
copy chosen so "an item is processing" never leaks by negation. The
first-run empty state is the recorded §8.6 exception: the forwarding
address IS the content, inactive addresses say why. The verdict line
is display-only prose; the display name never joins it. Q6's four
conditions bind as ratified; `hc.share_object` remains the named
below-cliff disclosure channel (no new surface pretends otherwise).
One bind sharpened by browser truth (the B9 gate's find at fa1ded2):
the inbox lists PARENT arrivals, and a mailed duplicate is a CHILD —
the rollup label said "Looks like a duplicate" while the §4.7
resolutions rendered only off the parent row's state, so no mailed
duplicate was ever resolvable. As built, the resolutions render for
every `duplicate_suspected` CHILD under its parent's row, bound to the
CHILD's arrival id; §4.7's letter (two human outcomes, never
auto-discarded) requires the affordance wherever the state is.

## D13 — RLY-01 as-built: one relay route, one nightly route, the Q7 seam mechanics

The per-minute relay drains the outbox (claim → enqueue-with-lineage →
ack EXACTLY what was enqueued; a failed enqueue stays unacked for the
300 s re-delivery — OBX-01 end-to-end, live in the B9 leg), converts
the sweeper's advisory requeue listing into work, and eager-fires each
4B stage present once. Extract/interpret messages are DEFERRED
(`pgmq.set_vt`, +1 h), never consumed, never lost — slice 5's workers
will read them; a stale outbox row (state moved past every entry) is
acked without a send. The nightly route runs the four isolated legs:
`run_taint_sweep` (OPS-01/D6 made real) · `expire_scan_results` ·
`expire_held_mail` · the §11.5 quarantine BYTE purge at 7 days
(`purgeQuarantineOlderThan` — F2's named owner; hash+verdict retained
forever, the X1 row untouched). The security-actions sweep adopted
M1's claim primitive (BAT-05's app half). The production-disabled
ruling (ADR-0008 M1) lifts for store/scan/gate; production ACTIVATION
stays G4/G7-gated — no real forwarding address exists anywhere.

## D14 — FWD-01's app half rides email verification

The confirm route runs an idempotent activation pass over the caller's
visible inactive subjects after a successful verification —
per-subject quiet refusals (activation's own gates decide: live
coordinator, the founder-verified mirror, no live freeze), never a
reason to fail the verification. Live in the B9 leg: the address is
inactive before the mail click, active with its §5.1 log entry after.
Provider-side route creation stays the deploy checklist's.

The B9 gate found the delivery chain dead in THREE independent layers,
each red-pinned before its fix: (1) no `emailRedirectTo` ever rode the
sign-up/resend calls — `emailLinkOrigin()` now supplies
`NEXT_PUBLIC_SITE_URL` config-first (blank = unset) with a
loopback-origin fallback, and every auth mail sender shares it; (2)
GoTrue's redirect allow-list DROPS un-listed URLs SILENTLY — the local
config carries the `/confirm*` rows and the deploy checklist gained the
production row (an un-listed production URL would reproduce the defect
with no error anywhere); (3) the default confirmation template links
the implicit-flow `#fragment` shape, which a server route never sees —
a custom template now sends `token_hash` (the documented server-side
verification shape) and the confirm route verifies it. Each layer
alone leaves activation silently dead; config pins hold all three
(`tests/config/auth-config.test.ts`).

## D15 — Named gaps, recorded not dropped

- **The revoke-sender SURFACE**: `known_senders` has no request-path
  read and 4B may not add DDL; `hc.revoke_sender` remains callable
  machinery with no member surface. Needs a list/describe read — a
  definer candidate for the next DB-opening slice.
- **The monthly-ceiling coordinator notification**: the §4.2.8 signal
  is computed (M3), surfaced in the webhook's response and logged; the
  member-facing notification waits for §5.9's templates (its slice).
  Never a refusal either way.
- **The §13.2 eager-path p95**: the chain is eager-fire end-to-end,
  but no measurement harness exists in 4B; the 60 s arrival→proposals
  budget is slice 5's to measure (extract/interpret are its workers).

## D16 — The same-origin TUS proxy: UPL-01's transport as-built

The plan's upload sketch assumed the storage signed-upload token
(`x-signature`) authorizes the resumable protocol; the pinned local
storage build IGNORES that header on `/upload/resumable` and evaluated
the browser's TUS request as plain `authenticated` — which M7's
zero-policy posture refused. Correctly: the refusal was the storage
plane doing its job. As built, the resumable protocol rides OUR origin
(the §1.3 proxy discipline, mirrored for writes):
`app/api/upload/tus/[[...id]]` verifies a server-minted, expiring HMAC
grant (over exactly one staging key + expiry, keyed by the service
credential via `serviceCredential()` — the containment grep's
single-module rule holds) on EVERY hop, forwards upstream on the
service credential (which never leaves the server), pins the upstream
to the storage resumable family, and rewrites `Location` so no storage
URL reaches the browser. The whole CORS/dev-origin class is
structurally gone — same-origin by construction. The gate also caught
Next 16's cross-origin dev protection 403ing hydration chunks when the
test browser used `127.0.0.1` against a `localhost` dev server:
`allowedDevOrigins` is pinned (`tests/config/next-config.test.ts`),
a dev-only concern by definition.

## Consequences

- The pipeline runs `arrive → store → scan → gate` end-to-end under
  browser truth; gated arrivals REST at `extracting` with the honest
  label (Q7). Nothing is production-activated. Browser truth earned
  its keep: the gate found four product defects no unit depth had
  (the three-layer FWD-01 delivery chain, the dev-origin hydration
  403, the x-signature/resumable incompatibility, the unresolvable
  child duplicate) — each fixed red→green.
- The A2 allowlist is: artifact route (full client) · gotrue-admin ·
  the storage plane module. The channel fences gained the evidentiary
  boundary. Every extension is pinned in
  `tests/lint/db-fence.test.ts`.
- The coverage flips recorded with this build: APP-09b · RLY-01 ·
  UXA-01 (review-green with the Q6 disposition) · RLS-10 · BAT-02/03
  completed · STO/SCN/QTA/SAU/DUP/FWD/INB/UPL-01's 4B halves.
- Round 13 inherits three pointed questions from these deltas (packet
  Q-i/Q-ii plus the D8 NOINHERIT note) and the two G4 deploy
  verification rows (payload fields, strip posture).
