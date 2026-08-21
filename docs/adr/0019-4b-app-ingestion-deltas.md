# ADR-0019 — 4B as-built: the app half of ingestion (B1–B9)

**Status:** RATIFIED IN FULL as of the round-14 dispositions (2026-08-20).
Round 13 ratified everything it examined as amended, with ONE carve-out:
D16's transport-containment half stayed AMENDED, not ratified — round-13
finding 1 (HIGH), a real code defect in the same-origin TUS proxy (the
upstream "pin" was a bypassable `startsWith` prefix check and the grant
did not bind to the forwarded target), falsified D16's "pins the upstream
to the storage resumable family" as then built. That carve-out is now
LIFTED: the fix landed in its own build session (`bdb7045`, app-layer
only, red→green, fresh gate — ADR-0006) and the round-14 re-review
(`docs/review/round-14-rereview.md`, landed at `a73a43b`) confirms it
resolves finding 1 in full — both gaps closed on two enforcement layers,
§13.4 resume preserved, NO new findings — so **D16's transport-containment
half moves AMENDED → RATIFIED as fixed and re-reviewed at round 14.**
The dispositions — one HIGH (now resolved), two LOW, and the pointed
questions Q-i…Q-vii — are recorded in "Round-13 findings and dispositions"
below, with the round-14 resolution and its two non-defect observations;
Q-i/Q-ii/Q-v carry TSD annex A10 (the §5.4/§4.3/§1.6 reconciliations).
NO DDL was required by anything here — finding 1 was an app-layer fix —
so the migration bound stays spent at **8 of ≤ 8**. Owner sign-off and
merge are each their own session after these dispositions (ADR-0006;
MERGE COMMIT, never squash — the owner is the sole merge authority).
**Deciders:** the round-13 review session; the round-14 re-review and
dispositions sessions (owner ratifies at sign-off).
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

*(Round 13 — finding 2 (LOW), the hop-binding precondition RECORDED: the
header path's trusted-hop window degenerates to the WHOLE header list when
the payload carries no foreign `Received` line (`lib/mail/inbound.ts:248`
— `firstForeignReceived` initialises to `headers.length`), so an A-R
matching our authserv-id is accepted on POSITION alone, not on a proven
trusted-hop boundary. Defended in the live path — Step 1's out-of-band
provider fields fire first and the header path is never reached; where it
is reached, the trusted MTA prepends its own genuine A-R at the top,
returned first, shadowing any forgery below. The residual is exactly the
case where the Step-3 MTA A-R strip/emit guarantee — the deploy-checklist
row this module already defers to (`:25–30`) — is already violated.
**Recorded precondition:** the header path is trustworthy only under that
Step-3 MTA A-R guarantee and carries no independent defence when no
foreign hop is present. The code-tightening alternative — require a
genuine trusted-hop `Received` present AND the accepted A-R strictly above
the first foreign hop before honouring a header-parsed verdict — stays
available as a future hardening; docs-or-code, owner's call, no live
defect today. See "Round-13 findings and dispositions".)*

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

*(Round 13 — finding 1 (HIGH), the transport-containment AMENDMENT: the
clause "**pins the upstream to the storage resumable family**" is FALSE
as-built. The pin is a bare `startsWith` prefix check over a base64url-
decoded client segment that `../` normalisation defeats
(`app/api/upload/tus/[[...id]]/route.ts:127,132`, `fetch` at `:144`
carrying `storageAuthHeaders()`'s service credential), and the grant binds
only to a client-supplied `x-hc-key`, never to the forwarded target
(`route.ts:118`; `verifyUploadGrant`, `lib/storage/artifacts.ts:65`) — so
any ingest-capable member drives the service credential to arbitrary
same-host `/storage/v1/…` paths on HEAD/PATCH. The same-origin DIRECTION,
the server-held credential, and the Location rewrite STAND (Q-vii, ratified
as strictly better than re-opening a browser-facing storage URL); the
CONTAINMENT half did NOT as then built. Fixed in finding
1's own build session — normalised `origin`+`pathname` validation AND a
grant-to-target binding that preserves PRD §13.4 resume through an explicit
server-side continuation design — red→green, fresh gate, BEFORE merge.
**Round 14 (2026-08-20): the re-review confirms the fix resolves the
finding in full (`docs/review/round-14-rereview.md`) — the
transport-containment half is RATIFIED as fixed and re-reviewed, and the
pin sentence above is TRUE of the tree again.** See
"Round-13 findings and dispositions".)*

## Round-13 findings and dispositions

The round-13 packet (`docs/review/round-13-packet.md`, evidence head
`d6a6a22`) drew a commissioned third-party review AND an owner-commissioned
external second-opinion pass. Both returned **approve with findings — do
NOT merge until the HIGH is fixed and re-reviewed**, and converged
file-for-file on one HIGH and two LOWs. The findings landed VERBATIM at
`docs/review/round-13-findings.md` (commits `7f23d66` + `d742c08`) BEFORE
any disposition, per the standing rule; each was then re-verified against
the tree in this session before disposition. Every disposition here is
DOCS-ONLY — no migration, no test, no non-docs tree move — so the packet's
F12 per-directory binding transfers the full `d6a6a22` evidence block to
this head unchanged, and the migration bound stays spent at **8 of ≤ 8**.

| # | Severity | Finding (compressed; the verbatim text is the findings file) | Disposition |
|---|---|---|---|
| 1 | **HIGH** | The same-origin TUS proxy pins the upstream with a bare `startsWith` prefix check that base64url + `../` normalisation defeats (`route.ts:127,132,144`), and `verifyUploadGrant` binds only to a client-supplied `x-hc-key` never checked against the forwarded target (`route.ts:118`; `lib/storage/artifacts.ts:65`) — any ingest-capable member drives service-credentialed HEAD/PATCH to arbitrary same-host `/storage/v1/…` paths, falsifying D16's "pins the upstream to the storage resumable family" | **NOT ratified as-built — a code defect fixed before merge.** D16's transport-containment half is AMENDED (the marker above); the fix is its OWN build session (red→green, fresh gate, ADR-0006). Carries the resume-remediation constraint (below). App-layer only — no DDL. **Round 14: RESOLVED — fixed (`bdb7045`) + re-reviewed clean (`a73a43b`); the transport-containment half RATIFIED as fixed. Two non-defect observations recorded (the re-review + dispositions update below)** |
| 2 | low | The §5.3 header-path hop binding degenerates to "all headers" when the payload carries no foreign `Received` line (`inbound.ts:248,261`), so position alone decides — defended by the Step-3 MTA A-R strip/emit precondition | **Accepted, docs-only.** D11 amended in place to record the precondition explicitly (the marker under D11); the code-tightening alternative stays available as a future hardening, not this slice. No live defect today |
| 3 | low | A shipped docstring in `upload-form.tsx:16–22` still describes the retired `x-signature` transport, contradicting the as-built proxy and D16 | **Accepted; folded into finding 1's build session.** The docstring lives in a NON-DOCS tree (`app/`); correcting it in this docs-only session would void the F12 evidence and force a re-gate for zero behavioural value (the round-12 F4 argument). The inline comment at `:69–72` already states the correct proxy/`x-hc-grant` transport, so no reader following the code is misled; finding 1's fix touches this same file, so the docstring correction rides that red→green |

### Finding 1 — the disposition in full (the HIGH)

Re-verified against the tree this session. `route.ts:132` is a bare
`upstreamUrl.startsWith(<resumable base>)` over a value base64url-decoded
straight from the client path segment (`:127`); base64url carries no `/`,
so an attacker-chosen URL with `../` dot-segments survives the prefix
check as one catch-all segment and `fetch` (`:144`, carrying the service
credential via `forwardHeaders` → `storageAuthHeaders()`) normalises the
dots away to a DIFFERENT `/storage/v1/…` path. Independently,
`verifyUploadGrant(key, grant)` (`lib/storage/artifacts.ts:65–74`) binds
the HMAC to `key` alone — `route.ts:118–120` reads `key` from the client's
`x-hc-key` and never checks it against `upstreamUrl`. Impact is bounded
(the response body is discarded — `route.ts:82–95`; `GET` is not proxied)
but real: broken access control on the highest-privilege credential — a
cross-tenant existence/metadata oracle via `HEAD` status + the whitelisted
`upload-offset`/`upload-length`/`upload-expires` headers, and `PATCH` to
non-resumable storage endpoints outside any gate the design intends. This
is exactly the round-12 Q-G caveat ("the fence/containment pin proves
nothing about the route's own RUNTIME discipline", ADR-0018) landing on
the write path — and Q-iv carries it forward.

**Disposition: treat as a code defect, fix before merge — not a
ratification.** The minimal shape (both passes converged): parse
`upstreamUrl` with `new URL(...)` and validate the NORMALISED `origin` +
`pathname` against the resumable prefix (reject any resolved path outside
`/storage/v1/upload/resumable/…`), AND bind the grant to the forwarded
target so `x-hc-key` cannot be a free-floating token; add a route test
that a valid grant + a `..`-bearing / foreign-path id is REFUSED (the
current `tests/routes/upload.test.ts` PATCH case mocks
`verifyUploadGrant → true` and cannot catch this). App-layer only — NO
DDL, the migration bound is untouched.

**The resume-remediation constraint the fix MUST NOT trip over (verified
against the client this session).** Current resume (PRD §13.4, the B9
hospital-corridor leg) DEPENDS on the absence of target binding: `start()`
mints a FRESH `upload_id`/`key`/`grant` on every invocation
(`app/(app)/[circle]/upload/upload-form.tsx:54–65`), then
`resumeFromPreviousUpload(previous[0])` (`:94`) points that fresh grant at
the PREVIOUS attempt's upstream resource (keyed to the OLD staging key). So
resume PATCH hops today carry a new grant against an old upstream and
succeed only because nothing binds the two. A naïve "the grant's key must
equal the object the id resolves to" fix would therefore BREAK resume, not
merely tighten it. A correct fix needs an explicit server-side continuation
design that re-authorises the EXISTING upstream upload for the caller AND
reconciles completion, which today keys off the freshly-minted `upload_id`
(`app/api/upload/complete/route.ts:53`). Tightening the comparison alone is
insufficient and would regress a stated capability. **This constraint is
BINDING on finding 1's build session.**

**Build-session update (2026-08-20) — finding 1 FIXED, red→green (ADR-0006;
this is NOT the ratification).** The fix landed app-layer only, no DDL (the
migration bound stays spent at **8 of ≤ 8**). The forwarded target is no
longer a client-forgeable `base64url(upstreamUrl)`: the create hop validates
the upstream Location against the NORMALISED storage resumable family
(`isResumableUpstream` — `new URL()` resolves `../` before the origin +
pathname check, so gap (a)'s prefix escape is closed) and returns a
SERVER-SIGNED continuation target (`signUploadTarget`/`verifyUploadTarget`,
HMAC keyed by the fenced service credential, non-expiring by design —
session freshness lives on the grant). Every write hop re-verifies that
signature and binds it to the caller's grant by CIRCLE
(`circleOf(x-hc-key) === circleOf(target.key)`, gap (b)), which is stable
across a resume re-mint, so §13.4 resume survives. Completion consumes the
same signed target and reconciles the bytes at the ORIGINAL staging key.
Finding 3's stale `x-signature` docstring was corrected in the same file
family. Red→green was watched: the mandated route test — a valid grant + a
`..`-bearing raw id — returned 201 (forwarded) before the fix, 404 after
(`tests/routes/upload.test.ts`). A fresh full local gate is GREEN at this
head — **24 passed** (walkthrough 11 + a11y 5 + ingestion 8, incl. the
UPL-01 live upload → store → scan → gate leg and EICAR quarantine), with the
CI-shaped suites green (upload 19/19, `test:app` 431/431, typecheck, lint).
**D16's transport-containment half stays AMENDED, NOT ratified, and UPL-01
stays BLOCKED** (`docs/coverage.md`): both turn on the re-review of this fix
(finding 1's bypass test + resume proof) and owner sign-off — the next two
sessions in the ADR-0006 cadence.

**Re-review + dispositions update (2026-08-20) — finding 1 RESOLVED; D16
RATIFIED in full; UPL-01 GREEN.** The round-14 re-review
(`docs/review/round-14-rereview.md`, landed at `a73a43b`; CI green at that
head, run 32450417228) verified the fix against the tree — not the packet —
and re-ran the mandated route suite (19/19). Gap (a) is closed: the client
no longer supplies the fetch URL at all (the create hop forwards the fixed
server-derived resumable base) and `isResumableUpstream()` validates the
`new URL()`-NORMALISED origin + pathname at BOTH enforcement points (before
the server will sign a Location, and again on the way back in via
`verifyUploadTarget`). Gap (b) is closed: the forwarded target is a
server-signed unforgeable HMAC token bound to the caller's grant by circle
on every write hop and by circle+subject with a live `canIngestForSubject`
re-check at completion. Cross-circle replay is refused on both routes;
cross-subject within a circle is not exploitable (the target is unforgeable
and minted only under mint-time subject authorisation, with subject
identity re-enforced at completion); the non-expiring target is inert
without a fresh < 2 h grant; §13.4 resume is preserved (circle-stable bind;
completion reconciles at the ORIGINAL staging key) — proven by test and by
re-reading the client. **No new findings.** Two OBSERVATIONS recorded for
the record — neither a defect, neither a change request:

1. *The write-hop grant→target bind is deliberately CIRCLE-level*, looser
   than completion's circle+subject bind. Sound as built: the write hop is
   the "continue an upload I already own" operation, proven by possession
   of the unforgeable target (issued only to the subject-authorised
   creator), with the circle as an additional coarse guard and subject
   identity enforced at the two ends that matter — the mint and completion.
   Tightening the write hop to subject level stays available as a future
   hardening; it is not required and would not change the reachable
   surface.
2. *The signed continuation target is signed, not encrypted.* Its base64url
   payload is client-readable and reveals the upstream storage resumable
   URL and the staging key — both inert without the server-held service
   credential (storage keeps zero policies on the resumable endpoint,
   M7/049), and the caller already knows its own staging key. Accepted
   property, not a change request.

Accordingly: **D16's transport-containment half moves AMENDED → RATIFIED
(as fixed and re-reviewed at round 14), and UPL-01 flips green**
(`docs/coverage.md`, citing `bdb7045` + `a73a43b` as the evidence). Still
no DDL anywhere in the fix or its dispositions — the migration bound stays
spent at **8 of ≤ 8**, and this dispositions commit is docs-only, so the
F12 app-tree binding holds. The remaining ADR-0006 sessions are owner
sign-off, then merge (MERGE COMMIT, never squash; the owner is the sole
merge authority).

### The pointed questions Q-i … Q-vii — dispositions

Honouring the reviewers' recommended answers where they survived
interrogation (both passes concurred; Q-iv carries the round-12
runtime-discipline caveat; Q-vii's transport half rides finding 1).

| Q | Delta | Disposition |
|---|---|---|
| Q-i | D9 | **Ratified as-built.** Unauthenticated over-* mail (capacity included) is DROPPED with a 200 and no send; only DMARC-aligned senders are bounced — the backscatter argument holds at the product's most attacker-reachable address, and a send failure never turns a refusal into a retry. §5.4's capacity row reconciled in TSD annex A10 |
| Q-ii | D10 | **Ratified §1.3 as the letter.** The route refuses everything non-clean in the one 404 shape (`app/api/artifact/[id]/route.ts:53`); the inbox states the reason. Any future unchecked-but-honest download is a deliberate carve-out with its own warning surface, never a quiet widening. §4.3's sentence reconciled in TSD annex A10 |
| Q-iii | D7 | **Accepted as the A2-disciplined interim.** One named op assuming `hc_internal` for a single statement, actor display-name read in the same transaction, the two-op maintenance pin untouched. `hc.log_artifact_read` queued as a definer candidate for the next DB-opening slice |
| Q-iv | D1 | **Fence architecture CONFIRMED, with the round-12 caveat carried forward.** The ESLint allowlist is the three entries claimed and the containment grep holds — but the import fence and the single-file grep prove nothing about the proxy's RUNTIME discipline, and finding 1 is exactly a runtime-discipline defect on that same storage plane. Confirm the fence; it does NOT cover the proxy's request handling |
| Q-v | D2 | **Ratified.** The webhook stages durably before its 200 and the store worker reads `readStagedObject`; acceptance survives a provider-retention gap and the synthetic webhook exercises the identical path the live one takes. §1.6's swap-cost row annex-touched in TSD annex A10 |
| Q-vi | D8 | **Corrected probes accepted; NOINHERIT is the owner's DDL call.** Zero direct grants, RLS-empty without an identity, `auth.*`/`hc.log` unreachable — pinned live and catalog-based (`tests/db/runtime-credential.test.ts`; the segfault trap avoided). NOINHERIT is a role-attribute change (DDL) for the owner's bound-amendment queue, never this slice |
| Q-vii | D16 | **Direction ratified; "pins the upstream to the storage resumable family" NOT ratified as-built — see finding 1.** The same-origin proxy is the right call and strictly better than re-opening a browser-facing storage URL; the FWD-01 config chain (the `/confirm*` allow-list rows, the `token_hash` template, `NEXT_PUBLIC_SITE_URL`) is verified and config-first. But the transport's central containment claim is false as written — D16's ratification of the transport is CONDITIONAL on finding 1's fix. *(Round 14: the condition is satisfied — fixed and re-reviewed clean; the transport ratifies in full)* |

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
  completed · STO/SCN/QTA/SAU/DUP/FWD/INB's 4B halves green.
  *(Round 13: UPL-01 is the ONE exception — its transport half carries
  finding 1 (HIGH), so the row is BLOCKED, not green (`docs/coverage.md`);
  the mint / right-to-ingest / completion halves held. It flips green only
  after finding 1's fix + re-review, never as `pending`. Round 14: that
  condition is met — fixed (`bdb7045`), re-reviewed clean (`a73a43b`) —
  and UPL-01 is GREEN.)*
- Round 13's dispositions are RECORDED above (finding 1 HIGH amends D16's
  transport-containment half; findings 2–3 low; Q-i…Q-vii ratified per the
  reviewers' recommendations, Q-iv with the runtime-discipline caveat,
  Q-vii's transport half riding finding 1). Q-i/Q-ii/Q-v carry TSD annex
  A10; the two G4 deploy verification rows (payload fields, strip posture)
  and the D8 NOINHERIT note stand as recorded owner-queue obligations.
- No DDL is required by any disposition — finding 1 is an app-layer fix —
  so the migration bound stays **spent at 8 of ≤ 8**; the dispositions are
  docs-only and the packet's F12 evidence transfers to this head. The gate
  cadence (ADR-0006, each its own session): finding 1's fix (a code change,
  red→green, a fresh local gate) → re-review → owner sign-off → merge
  (MERGE COMMIT, never squash). The owner is the sole merge authority.
- Round 14 (2026-08-20): the fix and its re-review are DONE — finding 1
  RESOLVED with no new findings, the two non-defect observations recorded
  (the disposition-in-full's re-review update), D16 ratified in full,
  UPL-01 green. The remaining ADR-0006 sessions are owner sign-off, then
  merge.
