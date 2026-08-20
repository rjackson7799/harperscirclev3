# Round 13 — third-party review findings (slice 4B, the ingestion app increment; verbatim)

> Reviewed: the round-13 packet at evidence head `d6a6a22` (base `main` @
> `3195713`; PR/docs head `cfd97b5`). CI confirmed first, per the brief,
> via the anonymous public API: run **79** (`head_sha cfd97b5`,
> the docs/PR head) — completed, **success**; run **77**
> (`head_sha 3195713`, base `main`) — completed, **success**. The F12
> per-directory binding at `d6a6a22` reproduces exactly (below), so the
> evidence transfers to the docs head.
>
> Verdict: **approve with findings — one HIGH I would fix before merge.**
> The HIGH is a real access-control bypass in the same-origin TUS proxy
> that falsifies a load-bearing ADR-0019 D16 containment claim (“pins the
> upstream to the storage resumable family”); it is reachable by any
> authenticated, ingest-capable member. Two LOWs follow (one a real but
> deploy-precondition-defended narrowing of the §5.3 hop binding, one a
> stale-docstring drift). Everything else in the packet I could
> re-verify held: the §5.3 chain, the §5.4 table, the worker discipline,
> the artifact route’s one-404, the credential split, and the Q6 inbox
> all do what the packet says.
>
> Dispositions (ADR-0019 ratification/amendment) are the next session’s,
> per ADR-0006 — these findings land first, verbatim.

---

## What was independently verified (the ground the findings stand on)

- **CI at the heads:** runs 79 (`cfd97b5`, success) and 77 (`3195713`,
  success), ids/SHAs/conclusions confirmed against the public API — not
  finding #1.
- **The F12 binding, at `d6a6a22`:** `git ls-tree` over all seven
  directories matches the packet’s hashes exactly — `app 50420dca…`,
  `lib 569fdc9e…`, `components e083c9dc…`, `tests f8bd135a…`,
  `e2e 938662fc…`, `supabase 30759912…`, `scripts e3670b3f…`.
  **`supabase/migrations 3b761d6a…`, `supabase/tests 76f777fe…`,
  `supabase/seed.sql 3174ae6a…` and `scripts e3670b3f…` are byte-identical
  to `main` @ `3195713`** — the app-only claim and the spent-at-8
  migration bound both hold structurally. The `supabase/` tree moves ONLY
  at `config.toml` (the `/confirm*` redirect row + the confirmation
  template binding) and the new `supabase/templates/confirmation.html` —
  `git diff 3195713 d6a6a22 -- supabase` is exactly those two files, **zero
  DDL**. `git diff d6a6a22..cfd97b5` touches `docs/` only (six files).
- **Dependencies:** `git diff 3195713 d6a6a22 -- package.json` adds exactly
  one line — `tus-js-client@4.3.1` (Q4-approved, pinned). The dev-dep
  reserve is untouched.
- **The §5.3 chain (`lib/mail/inbound.ts`), read whole:** provider
  out-of-band fields are read first and the chain STOPS there (217–240);
  the header path accepts only an `Authentication-Results` bearing our
  configured `authserv-id`, full-token case-insensitive, sitting above the
  first foreign `Received` hop (246–280); ARC never authenticates (285–294);
  `FromFull.Name` is never an input to any verdict; `auth_detail` is clamped
  (124–128). The one gap I found in this file is finding 2.
- **The §5.4 webhook (`app/api/inbound/postmark/route.ts`):** the signature
  is timing-safe and 503-when-unset (82–88); durability is rows AND bytes
  before the 200 — `createEmailArrivals` then `stageIntakeObject` for parent
  and every child, THEN `enqueuePipeline`, THEN 200 (162–199); the §5.4
  table drops unauthenticated over-* mail (200, never bounced) and bounces
  only DMARC-aligned senders (127–150); the lookalike answer overrides the
  stored verdict (152–159). The child→attachment index mapping is 1:1 and
  correct (`created.childIds[i]` ↔ `msg.attachments[i]`).
- **The worker layer (`app/api/worker/[stage]`, `lib/hc/workers.ts`):** claim
  → COMMIT (standalone statement) → work → finalize throughout; the worker
  never finalizes `unavailable` (`processScan` returns
  `scan_unavailable_retry`, D5) and never invents a verdict; lineage fails
  closed (`resolveCircle` → bytes-missing; the gate falls to the sender
  question on null/unknown channel, 180–192). The retry story is the
  sweeper re-list on lease expiry (`sweeperPass.requeue`), consistent with
  the acked-but-unfinalized posture.
- **The artifact route (`app/api/artifact/[id]/route.ts`):** one 404 shape
  for no-session/no-row/non-clean (46–53); evidence before bytes, a failed
  log refusing the read (56–66); the 30 s signed URL created AND consumed
  server-side, the response carrying our headers over a discarded storage
  URL, `mime_detected` preferred over the storage guess (69–99). A UUID
  guard fronts the RLS query (`lib/hc/artifacts.ts:29`).
- **The credential split (B8):** `serviceCredential()` / `asServiceRole()` /
  `asStoragePlane()` / `asGoTrueAdmin()` all live in the one
  `lib/db/service-role.ts` (the containment grep’s single file);
  `lib/db/maintenance.ts` holds exactly the two `auth.*` ops on
  `HC_MAINTENANCE_DB_URL`; the evidentiary append assumes `hc_internal` for
  one statement with the actor’s display name read in the same transaction
  (`lib/db/evidentiary.ts:57–85`); `HC_DB_URL` authenticates as the runtime
  login on the request-role channel (`lib/db/request-role.ts:56–73`). The
  ESLint fence pins `lib/storage/**` to `app/api/{inbound,worker,upload,
  artifact}/**` (`eslint.config.mjs:37–39`). `tests/db/runtime-credential.test.ts`
  is a live-DB integration test and probes `hc.log` unreachability
  **catalog-based** (`has_function_privilege`, 84–91) — the segfault trap
  is not re-dialled; the bare-login zero-rows containment (INHERIT) is
  pinned honestly (52–62).
- **The Q6 inbox (`app/(app)/[circle]/inbox/page.tsx`):** parents read via
  RLS-scoped PostgREST (the cliff delivers zero rows below manage-×5);
  `productStates` uses savepoint-per-id and omits refusals — no error-shape
  oracle (`lib/hc/inbox.ts:63–82`); the §4.7 resolutions render for every
  `duplicate_suspected` CHILD bound to the CHILD’s id (213–232, the defect-7
  fix); the verdict line is display-only and never joins the display name
  (63–70).
- **FWD-01 config pins:** `tests/config/auth-config.test.ts` parses the real
  `config.toml` and template (not mocks) — the `/confirm*` allow-list row,
  the `token_hash` template with `type=signup`/`flow=signup`, and
  `emailLinkOrigin`’s config-first rule (`lib/auth/redirect.ts:22–31`) all
  bind. The `config.toml` diff carries the two rows and zero DDL, as claimed.
- **The DB byte cap is authoritative on MEASURED bytes for BOTH channels:**
  `hc.finalize_store` re-checks `p_byte_size between 1 and 52428800`
  (`supabase/migrations/20260818200002_stage_write_halves.sql:75`), which
  the store worker calls with the measured length — so the webhook’s
  provider-declared `ContentLength` pre-check is redundant defence, not the
  enforcement boundary. No email-path cap gap exists.

**What I could not verify from here, stated plainly:** the local gate run
itself (24 passed, the traces vault-side), pgTAP 1363/1363, concurrency
63/63, vitest 442/442 — these are recorded evidence and ride the F12
hashes I did verify; CI run 79 re-demonstrates lint/typecheck/build/scanners
at the pushed head. The upstream Supabase Storage endpoint’s exact
behaviour under the finding-1 request (below) I reasoned about and
partially reproduced locally (the URL-normalisation half), but did not
drive against a live storage container in this session.

---

## Findings

### 1. HIGH — the TUS proxy’s upstream allowlist is a prefix check that path normalisation defeats, and the grant does not bind to the forwarded target; any valid upload grant drives service-credentialed requests to arbitrary storage endpoints

ADR-0019 D16 states the same-origin proxy “**pins the upstream to the
storage resumable family**” and the module header repeats it
(`app/api/upload/tus/[[...id]]/route.ts:16`, and D16 at
`docs/adr/0019-4b-app-ingestion-deltas.md:268–269`). The code does not
hold that pin. Two independent gaps compound:

**(a) The upstream allowlist is a bare `startsWith`.** On the write hops
the target URL is decoded straight from the client-controlled path segment
and validated only by prefix:

```
upstreamUrl = Buffer.from(encoded, 'base64url').toString('utf8');           // :127
if (!upstreamUrl.startsWith(`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`))  // :132
  return 404;
const upstream = await fetch(upstreamUrl, init);                            // :144 (service creds)
```

base64url contains no `/`, so an entire attacker-chosen URL — dot-segments
included — travels as one catch-all segment and survives the check.
`fetch` then normalises the dots away and hits a different path. I
reproduced the whole step locally:

```
evil = "http://127.0.0.1:54341/storage/v1/upload/resumable/../../object/list/artifacts"
enc  = base64url(evil)              // no '/', '+' or '='  → one path segment
decoded === evil                    // true
decoded.startsWith(<resumable base>) // true   ← allowlist passes
new URL(decoded).pathname           // "/storage/v1/object/list/artifacts"  ← what fetch actually requests
```

So the “resumable family” pin is bypassable to any `/storage/v1/…` path on
the storage host, carrying `Authorization: Bearer <service key>`
(`storageAuthHeaders()`), method `HEAD` or `PATCH`. The service credential
bypasses all storage RLS by design and M7 ships zero storage policies, so
there is no second gate behind it.

**(b) The grant does not bind to the forwarded target.** `verifyUploadGrant`
takes only `(key, grant)` (`lib/storage/artifacts.ts:65–74`); on `PATCH`/`HEAD`
the `key` is a client-supplied `x-hc-key` header that is **never checked
against `upstreamUrl`** (`route.ts:118–120`). A grant minted for the
caller’s own staging key (`app/api/upload/token/route.ts:40–46`, TTL 2 h)
therefore authorises a request to *any* target the caller names. The
“one grant, one staging key … gates EVERY hop” claim (`route.ts:11–13`)
holds only for the value the honest client happens to echo; it is not
enforced against where the bytes go.

**Reachability / who:** any authenticated member with the right to ingest
for any subject in any circle they belong to — they mint a real grant via
`/api/upload/token`, then issue `PATCH`/`HEAD` to
`/api/upload/tus/<base64url(any storage URL)>` with that grant and their own
`x-hc-key`. No cross-tenant secret is needed to trigger the bypass; the
allowlist escape (a) needs no victim id at all.

**Impact, scoped honestly.** `proxyResponse` returns `new Response(null, …)`
and copies only whitelisted TUS headers (`route.ts:82–95`), so the response
**body is discarded** — this is not a byte-read primitive, and `GET` is not
proxied. What it is: (i) the D16 containment invariant is false — the
service credential reaches arbitrary same-host storage-API paths, not the
resumable family; (ii) a cross-tenant existence/metadata oracle via
`HEAD` status + the whitelisted `upload-offset`/`upload-length`/
`upload-expires` headers; (iii) `PATCH` to non-resumable storage endpoints
on the service credential — bounded by whatever those endpoints accept, but
outside any gate the design intends. Even absent gap (a), gap (b) alone
lets a valid grant append to / probe any resumable upload whose id is
learned. This is the exact “the fence/containment pin proves nothing about
the route’s own runtime discipline” caveat round 12 attached to RLS-10
(ADR-0018 Q-G), landing on the write path.

**Disposition wanted:** treat as a code defect to fix before merge, not a
ratification. The minimal shape: parse `upstreamUrl` with `new URL(...)` and
validate the **normalised** `origin` + `pathname` prefix (reject any
resolved path outside `/storage/v1/upload/resumable/…`), AND bind the grant
to the target — e.g. verify the grant against the upstream object the id
resolves to, so `x-hc-key` cannot be a free-floating token. Add a route test
that a valid grant + a `..`-bearing / foreign-path id is refused (the
current `tests/routes/upload.test.ts` PATCH case mocks `verifyUploadGrant`
to `true` and asserts only that the Location-named id is forwarded — it
cannot catch this). Until fixed, ADR-0019 D16’s “pins the upstream to the
storage resumable family” should not be ratified as-built.

### 2. LOW — the §5.3 header-path hop binding degenerates to “all headers” when the payload carries no foreign `Received` line

The trusted-hop binding sets the A-R search window to everything above the
first `Received` line that is NOT the trusted hop
(`lib/mail/inbound.ts:246–280`). `firstForeignReceived` initialises to
`headers.length` (`:248`), so when there is **no foreign `Received` at all**
— e.g. a message submitted directly to the trusted MTA — the window becomes
the entire header list and the code accepts the first `Authentication-Results`
matching our `authserv-id` wherever it sits, rather than one provably added
by trusted infrastructure. The stated invariant (“an A-R below a foreign hop
travelled with the message — refused”, `:26–29`) is not what runs in that
case; position alone decides.

In practice this is defended, which is why it is LOW and not higher: for the
live provider Step 1 (out-of-band provider fields) fires first and the
header path is never reached; and where it is reached, the trusted MTA
prepends its own genuine A-R at the top, which is returned first and shadows
any forgery below it. The residual exposure is exactly the case where the
trusted MTA fails to emit an A-R bearing our `authserv-id` while a forged one
is present and no foreign hop was recorded — i.e. the Step-3 MTA
strip/emit posture (the deploy-checklist row the module itself defers to,
`:25–30`) is already violated. So this is a “the code adds no second layer
here” note, not a standalone bypass.

**Disposition wanted:** either record the precondition explicitly in D11
(the header path is trustworthy only under the Step-3 MTA A-R guarantee, and
carries no independent defence when no foreign hop is present), or tighten
the code to require a real hop boundary (a genuine trusted-hop `Received`
present AND the accepted A-R strictly above the first foreign hop) before
honouring a header-parsed verdict. Docs-or-code, owner’s call; no live defect
today.

### 3. LOW — a shipped docstring still describes the retired x-signature transport, contradicting the as-built proxy and D16

`app/(app)/[circle]/upload/upload-form.tsx:18–22` still tells the reader the
browser does a “tus upload straight to the storage resumable endpoint with
the token in **x-signature** — the browser never holds a credential wider
than this one key.” That is precisely the transport the B9 gate retired
(defect 6): the shipped path is the same-origin proxy with `x-hc-grant`/
`x-hc-key` (the inline comment at `:71–72` is correct, and the code sends no
`x-signature`). A reader trusting the header comment would misread the whole
UPL-01 security model.

**Disposition wanted:** correct the docstring to the proxy/HMAC-grant
transport (or delete the stale half). Docs-only; noted here because
docstrings are the review surface the packet leans on and this one
contradicts D16.

---

## The pointed questions (Q-i … Q-vii)

**Q-i — the capacity bounce’s alignment qualifier (D9): CONFIRM ratify
as-built.** Verified in `app/api/inbound/postmark/route.ts:119–150`:
unauthenticated over-* mail (capacity included) is dropped with a 200 and no
send; only DMARC-aligned senders are bounced, and a send failure never turns
a refusal into a retry (`:138–143`, `lib/mail/outbound.ts`). The
backscatter argument holds at the product’s most attacker-reachable address.
Reconcile §5.4’s capacity row in the dispositions annex, as recommended.

**Q-ii — §4.3 “downloadable with the reason” vs §1.3’s clean gate (D10):
CONFIRM ratify §1.3 as the letter.** The route refuses everything non-clean
in the one 404 shape (`app/api/artifact/[id]/route.ts:53`) and the inbox
states the reason. Any future unchecked-but-honest download is a deliberate
carve-out with its own warning surface, never a quiet widening — agreed;
reconcile §4.3’s sentence in the same annex.

**Q-iii — the evidentiary boundary (D7): ACCEPT as the A2-disciplined
interim.** `lib/db/evidentiary.ts` is one named op assuming `hc_internal`
for a single statement, actor display-name read in the same transaction,
`lib/db/maintenance.ts`’s two-op pin untouched. Queue
`hc.log_artifact_read` as a definer candidate for the next DB-opening slice,
as recommended.

**Q-iv — the storage-plane fence extension (D1): CONFIRM the fence
architecture, with the round-12 caveat carried forward.** The ESLint
allowlist is the three entries claimed and the containment grep holds
(`eslint.config.mjs:24,31–39`; `lib/db/service-role.ts`). One note, the same
one ADR-0018 Q-G attached to 049: the import fence and the single-file grep
prove nothing about the proxy’s *runtime* discipline — and finding 1 is
exactly a runtime-discipline defect on that same storage plane. Confirm the
fence; do not read it as covering the proxy’s request handling.

**Q-v — the store worker reads staging, not the provider (D2): RATIFY.**
Verified: the webhook stages durably before its 200 and `processStore` reads
`readStagedObject` (`app/api/worker/[stage]/route.ts:80–95`); the synthetic
webhook exercises the identical path. Acceptance survives a provider-retention
gap. Annex-touch the §1.6 swap-cost row as recommended.

**Q-vi — hc_runtime’s INHERIT membership (D8): ACCEPT the corrected probes;
NOINHERIT is the owner’s DDL call.** The corrected containment argument —
zero direct grants, RLS-empty without an identity, `auth.*`/`hc.log`
unreachable — is pinned live and catalog-based in
`tests/db/runtime-credential.test.ts` (the segfault trap avoided). NOINHERIT
is a role-attribute change (DDL) and belongs in the owner’s bound-amendment
queue, never this slice.

**Q-vii — the upload transport and the FWD-01 delivery chain (D16 + the D14
amendment): ratify the DIRECTION, but NOT “pins the upstream to the storage
resumable family” as-built — see finding 1.** The same-origin proxy is the
right call and is strictly better than re-opening a browser-facing storage
URL; the FWD-01 config chain (the `/confirm*` allow-list rows, the
`token_hash` template, `NEXT_PUBLIC_SITE_URL`) is verified and correctly
config-first with the silent-failure rows on the deploy checklist
(`tests/config/auth-config.test.ts`; `lib/auth/redirect.ts`). But the
transport’s central containment claim is false as written (finding 1): the
upstream pin is bypassable and the grant does not bind to the target. Ratify
the approach and the FWD-01 chain; make D16’s ratification of the transport
conditional on finding 1’s fix.

---

## Verdict

Approve with findings — **one HIGH I would fix before merge** (finding 1:
the TUS proxy’s allowlist prefix-check bypass plus the unbound grant, which
falsifies ADR-0019 D16’s “pins the upstream to the storage resumable
family” and gives any ingest-capable member service-credentialed reach to
arbitrary same-host storage endpoints — bounded by a discarded response
body and HEAD/PATCH, but real broken access control on the highest-privilege
credential), and two LOWs (the §5.3 no-foreign-hop degeneration, defended by
the Step-3 MTA precondition; the stale x-signature docstring). Everything
else the packet claims reproduces: the app-only F12 binding and the spent
migration bound are byte-exact, the sole dependency is `tus-js-client`, and
the §5.3 chain, §5.4 table, worker discipline, artifact one-404, credential
split and Q6 inbox each do what they say. Q-i–Q-vi survive interrogation as
recommended (Q-iv with the runtime-discipline caveat); Q-vii’s direction is
right but its transport-containment half rides finding 1. No DDL is required
by anything above — finding 1 is an app-layer fix — so the migration bound
stays spent at 8 of ≤ 8. Per ADR-0006 the dispositions (ADR-0019
ratified/amended, with finding 1 resolved), owner sign-off, and merge are
each their own session.
