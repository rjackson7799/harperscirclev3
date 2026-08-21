# Round 14 — re-review of the finding-1 fix (slice 4B; the same-origin TUS proxy containment)

> Re-reviewed: the round-13 finding-1 (HIGH) fix as landed on
> `slice/4b-app-ingestion`, head **`7a5418c`** (`7a5418cc45a74fe142eeb2fb2cc8fdef1e207d21`),
> base `main` @ `3195713`. This is the ADR-0006 re-review step: the fix is
> already committed and pushed; dispositions (D16 ratification, UPL-01 flip),
> owner sign-off, and merge are the SEPARATE sessions that follow. This
> session lands its findings and stops at the verdict — it does NOT ratify,
> flip coverage, or merge.
>
> **Verdict: the fix resolves round-13 finding 1 in full — both gaps closed,
> §13.4 resume preserved, app-layer only, no DDL. No new findings. Two
> observations are recorded for the disposition session (neither is a defect).**
> On this re-review, ADR-0019 D16's transport-containment half is eligible to
> ratify and UPL-01 to flip green at the next session.

---

## What was independently verified (not trusted from the packet)

- **CI at the head:** run **32449603661** (`CI`, `head_sha 7a5418cc…`,
  the full 40-char SHA) — completed, **success**, confirmed against the
  anonymous public API. Not a finding; the required green.
- **App-only / no DDL — checked against the tree, not asserted.**
  `git rev-parse HEAD:supabase/migrations` = `3b761d6a…` is **byte-identical**
  to `main` @ `3195713` (same hash). The whole `supabase/` tree moves only at
  `config.toml` + the new `templates/confirmation.html` — the FWD-01 (D14)
  config/template work already verified at round 13, **zero DDL**. The
  migration bound stays spent at **8 of ≤ 8**. Any future DDL need would STOP
  for an owner bound-amendment; nothing here needs one.
- **The fix's file set is app-layer only.** The code fix (`bdb7045`) touches
  exactly six files — `lib/storage/artifacts.ts`,
  `app/api/upload/tus/[[...id]]/route.ts`, `app/api/upload/complete/route.ts`,
  `app/api/upload/token/route.ts`, `app/(app)/[circle]/upload/upload-form.tsx`,
  `tests/routes/upload.test.ts` — no `supabase/`, no other tree. `7a5418c` is
  test-only (dodging the service-role containment grep on a literal env name).
  `5f3bee6` is docs-only (no `supabase/` files).
- **The mandated route test, re-run here (not just recorded):**
  `tests/routes/upload.test.ts` — **19 passed / 19**, locally, this session.
  The suite mocks ONLY the storage-plane I/O; the grant HMAC, the target
  signature, the key-scope parse and the normalised-URL validation all run
  for real, so the bypass tests can actually catch the finding.

---

## The fix, re-verified against the code

Round-13 finding 1 was two compounding gaps. Both are closed, and the client
was re-read to prove the resume constraint is honoured.

### gap (a) — the upstream "pin" is no longer a bypassable prefix check

The old defect was a bare `upstreamUrl.startsWith(<resumable base>)` over a
value base64url-decoded straight from the client path segment, which `../`
normalisation defeats. As fixed, the client no longer supplies the fetch URL
at all, and the validation is now normalisation-safe on two independent layers:

- **The create hop forwards to a fixed, server-derived base.** `POST`
  fetches `upstreamBase()` (`NEXT_PUBLIC_SUPABASE_URL + /storage/v1/upload/resumable`)
  — never a client-decoded URL (`route.ts:126,59-63`). The client's only
  create-hop inputs are the grant, the TUS `objectName` (which the grant must
  verify against), and the body. The base64url-URL injection vector is gone.
- **`isResumableUpstream()` validates the NORMALISED URL** — `new URL()`
  resolves `../` before an `origin` **and** `pathname` check
  (`artifacts.ts:146-162`). A `…/resumable/../../object/list/…` target
  resolves to `/storage/v1/object/list/…` and is rejected on its true
  pathname. The `startsWith('/storage/v1/upload/resumable/')` (note the
  trailing slash) plus the exact-match branch admit no `resumableEVIL`
  sibling, and the `origin` compare defeats userinfo/host tricks
  (`http://storage@evil/…` → origin `evil`, rejected).
- **Two enforcement points.** `proxyResponse` validates the upstream
  `Location` before it will sign it (502 otherwise, `route.ts:105-107`), and
  `verifyUploadTarget` re-validates `isResumableUpstream(parsed.u)` on the way
  back in (`artifacts.ts:123`) — so even a server bug that signed a bad URL
  cannot be driven to a foreign endpoint. Both bypass tests (raw `..` id;
  validly-signed-but-normalises-outside target) return 404 with storage never
  contacted.

### gap (b) — the grant now binds to the forwarded target

The forwarded target is no longer a free-floating client value. On the create
hop the server SIGNS the upstream Location together with the staging key
(`signUploadTarget`, HMAC keyed by the fenced service credential) and rewrites
`Location` to `/api/upload/tus/<signed-target>` (`route.ts:100-110`). Every
write hop (`forwardToUpload`, PATCH/HEAD) then:

1. requires a grant that verifies against the client `x-hc-key`
   (`verifyUploadGrant`, `route.ts:137`);
2. requires the id segment to be a validly-signed target
   (`verifyUploadTarget`, `route.ts:148`) — a client cannot forge one (HMAC
   over the server-held service credential);
3. binds the two by circle: `uploadKeyScope(target.key).circleId` must equal
   `uploadKeyScope(x-hc-key).circleId` (`route.ts:150-153`).

The target URL a hop fetches is `target.url` (server-signed), never a client
string. The cross-circle test (valid target for circle A + valid grant for
circle B) returns 404, storage never contacted.

### The two adversarial questions the brief posed — resolved

- **Can a valid signed target be replayed cross-tenant?**
  *Cross-circle:* no — the write hop's circle bind and completion's circle+subject
  bind both refuse it (tested on both routes). *Cross-subject WITHIN a circle:*
  the write hop's bind is circle-level (looser than completion's), but this is
  not exploitable: the target is an **unforgeable** HMAC token issued only to
  the creator of that upload, and creating an upload for another subject's
  staging key requires a grant for that key, which `/api/upload/token` mints
  only after `canIngestForSubject` passes for that subject
  (`upload.ts:20-38` — `hc.visible_at(…, s.id, all_domains, true) >= 'manage'`,
  on the request-role channel). So a caller can only ever hold targets for
  uploads it was already authorised to create; the coarser write-hop bind
  grants no reach the caller did not already have. Subject-level tightness is
  enforced at the two ends that matter — the mint and completion.
- **Does completion's circle+subject binding hold?** Yes. `complete/route.ts`
  re-checks `canIngestForSubject` at write time (§4.9 — a lowered grant bites,
  tested), then requires `scope.circleId === right.circle_id` **and**
  `scope.subjectId === subjectId` against the signed target
  (`complete/route.ts:57-65`), downloads the bytes at the target's ORIGINAL
  staging key, and keys the arrival to `scope.uploadId`. A foreign-circle
  token is refused before any download (tested).
- **Is the non-expiring target a concern given the grant TTL?** No. The target
  is an identity binding, not a bearer capability: it is inert without a fresh
  (<2 h) grant re-checked on every hop, and a fresh grant can be minted only by
  re-passing `canIngestForSubject`. A revoked member cannot resume. The signed
  target's payload is readable (base64url, signed-not-encrypted) and exposes the
  upstream storage URL + staging key, but both are inert without the service
  credential, which never leaves the server (Observation 2 below).

### §13.4 resume — proven, not assumed

The client (`upload-form.tsx`) mints a FRESH key/grant on every `start()`
(`:57-68`), then `findPreviousUploads()` → `resumeFromPreviousUpload(previous[0])`
(`:105-108`) resumes the ORIGINAL upstream; `onSuccess` extracts the signed
target from `tusUpload.url` (`:94-100`) and completion reconciles the bytes at
the original staging key. The write-hop bind is circle-level precisely so this
survives: the fresh grant and the old target share the circle, and the
signature never expires. The route test proves it directly — a fresh grant for
a NEW key in the SAME circle drives the OLD target (HEAD → 200, fetch hits the
original upstream). Completion downloads the original key (tested:
`downloadObject` called with the target's key, arrival keyed to the target's
uploadId), so a resumed attempt's bytes are reconciled where they actually
live, not under the discarded fresh id.

---

## Observations for the disposition session (neither is a defect)

1. **The write-hop grant→target bind is circle-level, looser than completion's
   circle+subject bind.** This is sound as-built, but the trust argument rests
   on the target being unforgeable AND issued only to the subject-authorised
   creator (mint-time `canIngestForSubject`), with subject identity re-enforced
   at completion — not on per-hop subject enforcement. The disposition should
   record that the write hop is deliberately the "continue an upload I already
   own" operation, proven by possession of the unforgeable target, with the
   circle as an additional coarse guard. Tightening the write hop to subject
   level is available as a future hardening but is not required and would not
   change the reachable surface.

2. **The signed continuation target is signed, not encrypted.** Its base64url
   payload is client-readable and reveals the upstream storage resumable URL
   and the staging key. Both are inert without the server-held service
   credential (storage keeps zero policies on the resumable endpoint, M7/049),
   and the caller already knows its own staging key, so no capability leaks.
   Recorded as an accepted property, not a change request.

---

## Verdict

**Approve — round-13 finding 1 is resolved.** gap (a) (the normalisation-defeated
prefix pin) and gap (b) (the unbound grant) are both closed, on two enforcement
layers, and the code no longer lets any client value reach the service-credentialed
`fetch`. The resume-remediation constraint the round-13 passes made binding is
honoured: §13.4 resume is preserved by the circle-stable bind and the
non-expiring signed target, and completion reconciles at the original staging
key — proven by test and by re-reading the client. The change is app-layer only;
`supabase/migrations` is byte-identical to `main`, so the migration bound stays
spent at 8 of ≤ 8. CI is green at the head, and the mandated bypass/resume/
completion tests re-run green here (19/19).

No new findings. Two observations recorded above for the disposition session.

Per ADR-0006 the remaining steps are each their own session: **dispositions**
(ADR-0019 D16's transport-containment half ratifies; UPL-01 flips green in
`docs/coverage.md` — this re-review is the gate that unblocks both, but this
session performs neither), then **owner sign-off**, then **merge** (MERGE
COMMIT, never squash; the owner is the sole merge authority).
