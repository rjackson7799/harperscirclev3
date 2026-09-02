# Round-27 findings — slice 7C, Documents + People & roles, the sensitive-pair app increment

**Landed verbatim, before anything is argued** (the `5faccc4` precedent,
restated at ADR-0023 and ADR-0025). Nothing in this file is a disposition.
Every finding below is its lens's own text, reproduced as written, with the
severity and confidence that lens holds — including where the dispositions
session may go on to dispute them. Six lenses ran (Tier 1; the plan-gate Q3
ruling permits 3–8, at least one from a different model family than the
author): **R1–R4 and R6 on Opus, R5 on Sonnet — all six on a model other
than the author's** (the build sessions ran on Fable). Each lens's own
numbering is preserved (`R<n>/F-<m>`), findings are most-severe-first
WITHIN each lens, and each lens's header separates what IT verified from
what it took on trust. The dispositions — accept or decline, each WITH the
argument — are the next session's and their own ADR (**ADR-0038**).
**Nothing was fixed here**, and **no finding below needs DDL**: every
closure named is an app-layer edit, a test or leg assertion, a manifest
value, or a docs/coverage correction. The migration bound stays **NONE**
and M6 closes UNCONSUMED, undisturbed by this round.

> **Reviewed:** slice 7C (C1–C6), branch `slice/7c-sensitive-pair` @
> `55d4810` (the docs head; evidence head **`ccd854b`**), base `main` @
> `18c362d`. PR **#34**, read from the public API at review time: open,
> base `main`, head `slice/7c-sensitive-pair` @ `55d48106…`, **not
> merged**, 24 commits / 68 files, `[DO NOT MERGE without owner sign-off]`
> in the title.
> **Independently verified (the integrating session):** the docs-only rule
> (`git diff --name-only ccd854b..HEAD -- . ':(exclude)docs'` empty) and
> the per-directory tree binding measured by `rev-parse` — `supabase/` and
> `scripts/` byte-identical to base through the docs head; `app/ lib/
> components/ e2e/ tests/` byte-identical evidence→docs; the 22-commit
> red→green record with the fence-first commit `1473775`; the gate tallies
> read from the teed vault logs, never `$?` (r3 `52 passed / 5 failed`,
> 16.9m; r4 `56 passed / 1 failed`, 22.0m; r5 `57 passed (17.3m)` with no
> failed line) — D11's table verbatim; vitest `run.json` 99 files / 1315
> passed / 0 failed; pgTAP `Files=69, Tests=1809, PASS`; concurrency
> `82/82 concurrency assertions passed`; the owed ledger's 23 rows = 6
> OPEN + 15 CLOSED + 1 TAKEN + 1 RISK; **eighteen** coverage rows moved at
> the close-out commit, measured by command — the packet's count is right
> and the commit message's "nineteen" is the error, exactly as the packet
> discloses; and R4/F-1's grep re-run by this session against the blob at
> `ccd854b` and **confirmed** (`app/(app)/[circle]/timeline/[event]/page.tsx`
> renders the string, and the file is untouched by 7C).
> **Taken on trust:** the runs themselves — this leg is read-only and
> nothing was re-run: reset exact 74, lint/typecheck/build solo exit 0,
> gitleaks 571, the r1/r2 run narratives, the retained r3/r4 traces'
> contents, and every tally beyond the log lines quoted above.
> **Verdict:** **approve nothing yet — hold for dispositions. Zero
> BLOCKERs; 16 MAJOR / 21 MINOR / 5 OBS across six lenses, none needing
> DDL. The authorization core held everywhere it was attacked — the
> depths, the step-up binding, the ceiling, revocation, the byte path's
> referent — but one packet sentence is falsified on the tree (R4/F-1),
> two CLOSED owed rows are short on their time half (R5/F-1 against
> OW-07/OW-19), and three green coverage rows rest on assertions that
> cannot fail their titles (R6/F-1..F-5).**

## The three recurring shapes (the round's work, said once)

1. **A packet, ADR or coverage sentence the tree falsifies or outruns.**
   R4/F-1 (D8's *"gone from the tree"* — the string renders live at the
   evidence head, and RCP-02's green cell repeats it); R4/F-3 (the log's
   undisclosed 300-row cap against PPL-04's *"subtracts nothing"* and the
   page's own *"Everything"*); R2/F-2 (ADR-0034 D7's derived-audience
   ruling — `hc.document_audience_derived` has zero callers); R5/F-1
   (OW-07/OW-19 CLOSED while the ingress read runs unbounded outside
   `withRouteBudget`); R6/F-5/F-6 (the audit manifest's a11y claims for
   pages no leg visits, and five cited leg titles that do not exist).
2. **A scanner or leg that pins the fixture, not the property** — round
   18's highest-yield class, at scale. R1/F-1/F-2/F-3 (the byte-path
   fence's literal-name greps, negative controls on one predicate of
   four, each with an ESLint-legal bypass); R6/F-1/F-2/F-3/F-4 (four
   assertions satisfiable with the behaviour absent, three backing green
   rows); R3/F-5 (send-again's declared-and-unused mock); R2/F-7 (Q-A's
   narrowing pinned by nothing at any layer).
3. **A named DB refusal flattened into a catch-all or a dead end on the
   new surfaces.** R2/F-1 (`audience_refused` during a GET render replaces
   the whole detail page with "couldn't load" — the r3 mechanism at a
   second call site, with AC-DOC-6's refusal half carrying no app-layer
   evidence); R3/F-1 (a definer no-op announced as *"Changed. It's
   written in the family's log"*); R3/F-2 (every step-up failure marker
   swallowed by query-string composition); R3/F-4 + R4/F-5 (a freeze
   rendered as *"Nothing"* on the adjust matrix); R2/F-3/F-4 (step-up and
   revoke dead ends answered only by *"That couldn't be done just now."*).

## Findings, most severe first — per lens, each lens's numbering preserved

### R1 — the byte-path fence and the machine-read path (model: Opus)
> **Independently verified:** `tests/lint/byte-path-fence.test.ts` in full, every predicate and every control read line by line; `app/api/artifact/[id]/route.ts` in full (both the main path and `servePage`); `lib/db/service-role.ts` in full (all four exports); `eslint.config.mjs` in full, block by block, resolving which fence patterns apply to which glob; `tests/lint/db-fence.test.ts`; `scripts/check-service-role-containment.mjs`; `lib/storage/artifacts.ts`'s export list and its byte-returning readers; `proxy.ts` and its matcher; `components/review/MachineReadText.tsx`; the `dfbf70c` extraction diff against `ReviewScreen.tsx` (byte-for-byte); the viewer half of `app/(app)/[circle]/documents/[document]/page.tsx`; `app/api/upload/tus/[[...id]]/route.ts` in full; `lib/pipeline/mime.ts`; the viewer assertions in `tests/routes/document-detail.test.ts` and `tests/app/review-screen.test.tsx`; the DOC-02 and A11Y-11 legs and the PPL-03 revoke leg in `e2e/documents.spec.ts` / `e2e/people.spec.ts`; the full `18c362d..ccd854b` name list (64 files — `proxy.ts` is the only one outside `app/lib/components/e2e/tests`); `find app/api -name '*.ts'`; the absence of `next/image`, `<Image`, `'use server'`, `download=`, `url(` in `app/globals.css`, any Next byte-producing file convention (`opengraph-image`/`twitter-image`/`icon`/`apple-icon`/`sitemap`/`robots`/`manifest.ts`), and any non-`.ts` file under the scanned roots; `createSignedUrls`' existence and signature in the installed `@supabase/storage-js`.
> **Taken on trust:** every tally — the r5 57/57 gate, vitest 1315/99, pgTAP, concurrency, lint/typecheck/build exit codes, gitleaks; that the fence's 8 cases pass at this head (I ran nothing); that `hc.visible_at`, `hc.log_artifact_read` and `mime_detected`'s writers behave as the DB layer's round-24 review found; the exact severity `@next/next/no-img-element` carries in the installed `eslint-config-next` (the package is exports-mapped and I could not read the flat config file — marked CONTINGENT in F-5).
> **Verdict:** The fence's referent is genuinely clean and its one-route assertion is real, but three of its four predicates are literal-name greps that ship no negative control, and each has a concrete, ESLint-legal bypass — so the file proves the tree it was written against rather than the property its titles claim; the machine-read component is a faithful single-source extraction that inherits one pre-existing dishonest classification the ADR now newly claims as correct.

#### R1 findings, most severe first

##### R1/F-1 — MAJOR — `asServiceRole()` is one of three exported doors to the same credential, and the fence pins the identifier rather than the module, so a one-line re-export inside `lib/db/**` — where every import fence is explicitly `off` — returns the full service-role client to the whole tree with all five assertions green.
**Confidence.** High. Every line quoted is read at `ccd854b`. Not contingent.
**Where.** `tests/lint/byte-path-fence.test.ts` — `CALLS_SERVICE_ROLE`, first `it`; `lib/db/service-role.ts` — `asServiceRole`/`asStoragePlane`/`serviceCredential`; `eslint.config.mjs` — `fenceServiceRole`, `hc/db-fences-lib-db`, `hc/db-fences-artifact-route`; `scripts/check-service-role-containment.mjs`.
**Claim under test.** ADR-0037 D1: *"the sanctioned `asServiceRole()` consumer is ONE FILE by filesystem scan — closing the hole the ESLint allowlist glob leaves (a second `route.ts` inside `app/api/artifact/**` would import the credential legally)"*. The fence's own header: *"a second consumer of the service-role credential that returns bytes without the route's evidence-before-bytes order (§1.3)"*.
**What I found.** The predicate is a literal identifier followed by a paren:

```ts
const CALLS_SERVICE_ROLE = /\basServiceRole\s*\(/;
...
expect(filesMatching(CALLS_SERVICE_ROLE, [DEFINING_MODULE])).toEqual([SANCTIONED_ROUTE]);
```

Three things make that narrower than the sentence above it.

1. **The module has two other doors to the same secret.** `lib/db/service-role.ts` exports `serviceCredential()` (`const key = process.env.SUPABASE_SERVICE_ROLE_KEY; ... return key;`) and `asStoragePlane()` (`createClient(url, key, …); return client.storage;`) — same env var, same privilege. Neither identifier appears in any of the four predicates.
2. **`lib/db/**` has no import fence at all.** `eslint.config.mjs`, last block: `{ name: "hc/db-fences-lib-db", files: ["lib/db/**"], rules: { "no-restricted-imports": "off" } }`. And `fenceServiceRole`'s group is the single path `["**/db/service-role"]`, so a *new* module under `lib/db/` is in no group and is importable from anywhere.
3. **The repo already knows this bypass exists.** `scripts/check-service-role-containment.mjs`'s own header: *"ESLint import rules are bypassable by re-export, dynamic import, or constructing a client elsewhere; the credential name is not."* That grep asserts the string `SUPABASE_SERVICE_ROLE_KEY` appears only in `lib/db/service-role.ts` — which a re-export leaves untouched.

A fourth, smaller edge: the first assertion excludes `DEFINING_MODULE` **wholesale**, so a byte-returning helper added to `lib/db/service-role.ts` itself is invisible to it, and `lib/db/**` may import anything.

And the second assertion — `app/api/artifact/` holds exactly one route file — filters on `/\/route\.tsx?$/`, so it closes route siblings but **not** a non-route helper inside the same allowlisted glob. `hc/db-fences-artifact-route` drops both `fenceServiceRole` and `fenceStoragePlane` for `app/api/artifact/**`, and nothing fences *importing* `@/app/api/artifact/[id]/helpers`.

**Failure scenario.** Add `lib/db/bytes.ts`:

```ts
import { asServiceRole as sr } from './service-role';
export const svc = sr;
```

Then, from any page, component, `lib/hc/**` wrapper or route: `import { svc } from '@/lib/db/bytes'; const c = svc(); await c.storage.from('artifacts').download(key);`.
- Fence assertion 1: the tree contains `sr`, `svc`, and `asServiceRole` *without* a following paren on the import line — no match outside the sanctioned route. Green.
- Assertions 2–5: untouched. Green.
- ESLint: `@/lib/db/bytes` is in no restricted group. Clean.
- Containment grep: the env-var name never left `lib/db/service-role.ts`. OK.

Result: a service-role PostgREST + storage client reachable from member-facing code, bypassing RLS entirely — the §1.2 containment the module's own doc-comment calls "layered so no single bypass works". The `asStoragePlane` variant needs no re-export at all: inside `app/api/artifact/[id]/` a plain helper file may import it legally today.

**Why the tests miss it.** `tests/lint/db-fence.test.ts` drives ESLint over *virtual* paths with inline source (`messagesFor`), so it proves the rule fires on the literal specifier `@/lib/db/service-role` and nothing about a re-exporting module. The byte-path fence is the belt meant to catch what ESLint cannot, and it greps a name rather than the module's import graph. The three belts fail in the same direction: identifier, specifier, env-var name — none of them the *consumer set of the module*.
**What would close it.** In `byte-path-fence.test.ts`, pin the module's importers instead of one identifier: match `/from\s+['"][^'"]*db\/service-role['"]/` (plus the `import(...)` form) across the walked tree and assert the importer set is exactly `{app/api/artifact/[id]/route.ts, lib/storage/artifacts.ts, lib/auth/gotrue-admin.ts}`; and add an exact-set pin on `lib/db/service-role.ts`'s own export names so a fourth door cannot appear unannounced. **No DDL.**

##### R1/F-2 — MAJOR — "no route besides the sanctioned one streams a storage body to a client" is asserted by two literal idioms borrowed from the sanctioned route itself; the storage plane's byte-returning readers are not among them, and three route globs may legally import them.
**Confidence.** High. Not contingent.
**Where.** `tests/lint/byte-path-fence.test.ts` — `STREAMS_STORAGE_BODY`, fourth `it`; `lib/storage/artifacts.ts` — `downloadObject`, `readStagedObject`, `readArtifactBytes`, `storageAuthHeaders`; `eslint.config.mjs` — `hc/db-fences-storage-consumers`, `hc/db-fences-worker-routes`.
**Claim under test.** ADR-0037 D1: *"no other route streaming a storage body"*. The test's own title: *"no route besides the sanctioned one streams a storage body to a client"*.
**What I found.** The assertion is:

```ts
const STREAMS_STORAGE_BODY = /\bfetchStorageWithin\s*\(|\bupstream\.body\b/;
...
const streamingRoutes = filesMatching(STREAMS_STORAGE_BODY).filter((file) =>
  /\/route\.tsx?$/.test(file)
);
expect(streamingRoutes).toEqual([SANCTIONED_ROUTE]);
```

Both alternatives are idioms of the file being pinned — `fetchStorageWithin` is the helper *only this route* calls, and `upstream` is *this route's* local variable name. Nothing about the pattern generalises to "streams a storage body".

The bytes have another door that needs neither idiom. `lib/storage/artifacts.ts` exports `downloadObject(key): Promise<{ bytes: Uint8Array; contentType: string } | null>` (`asStoragePlane().from(ARTIFACTS).download(key)`), plus `readStagedObject` and `readArtifactBytes`, plus `storageAuthHeaders(): { authorization; apikey }` returning the raw credential for direct `fetch`. And `eslint.config.mjs` deliberately admits that module to three route globs — `hc/db-fences-storage-consumers` (`app/api/inbound/**`, `app/api/upload/**`) and `hc/db-fences-worker-routes` (`app/api/worker/**`) both omit `fenceStoragePlane`, because those are the pipeline's *write* surfaces. Nothing distinguishes a write consumer from a read-and-return consumer.

**Failure scenario.** Add `app/api/upload/preview/route.ts`:

```ts
import { downloadObject } from '@/lib/storage/artifacts';
export async function GET(req: Request) {
  const o = await downloadObject(new URL(req.url).searchParams.get('key')!);
  return new Response(o!.bytes, { headers: { 'content-type': o!.contentType } });
}
```

All five fence assertions stay green: no `asServiceRole(`, no `createSignedUrl`, no `fetchStorageWithin(`, no `upstream.body`, no `getPublicUrl`; `app/api/artifact/` still holds one route file. `npm run lint` is clean by construction. The result is a second byte path with **none** of §1.3's six steps — no session read, no `hc.visible_at ≥ view`, no independent `scan_verdict = 'clean'` gate (so a quarantined file is releasable), no `hc.log_artifact_read` entry before bytes move, no `private, no-store`, and arbitrary cross-circle key addressing. That is exactly *"a thumbnail route"* — the first temptation the fence's own header (`byte-path-fence.test.ts:4-7`) names as its reason for existing.

**Why the tests miss it.** `db-fence.test.ts` pins the ESLint config and asserts the *permission* ("a worker route may use the storage module") — which is correct and intended. The byte-path fence is the only artefact positioned to catch a permitted importer that returns the bytes, and its predicate names two strings that occur in exactly one file today. No leg or unit test enumerates the callers of the byte-returning readers.
**What would close it.** Add an assertion that enumerates the importers of `lib/storage/artifacts`'s byte-returning readers (`downloadObject`, `readStagedObject`, `readArtifactBytes`) and of `storageAuthHeaders` to an exact set, or scan every `app/api/**/route.ts` for co-occurrence of a `lib/storage` import with a `new Response(`/`Response.json(` constructed from its result. **No DDL.**

##### R1/F-3 — MAJOR — `/\bcreateSignedUrl\b/` cannot match `createSignedUrls`, the batch method the installed storage client ships; a signed URL minted through it and handed to a browser is precisely the unrevocable read the `getPublicUrl` assertion exists to forbid, and it passes all five assertions.
**Confidence.** High. The regex semantics are certain (`\b` between `l` and `s` is not a boundary — both are word characters) and I verified the method exists in the installed package rather than assuming it.
**Where.** `tests/lint/byte-path-fence.test.ts` — `MINTS_SIGNED_URL`, third and fifth `it`, and the controls block; `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:785`.
**Claim under test.** ADR-0037 D1: *"plus `createSignedUrl` in exactly that file … `getPublicUrl` nowhere, comment-carved with controls (traps §9)"*. The fifth test's title: *"getPublicUrl appears nowhere in the product tree — a public URL is an unrevocable read"*.
**What I found.**

```ts
const MINTS_SIGNED_URL = /\bcreateSignedUrl\b/;
```

and, in the installed dependency:

```ts
async createSignedUrls(
  paths: string[],
  expiresIn: number,
  options?: { download?: string | boolean; cacheNonce?: string }
): Promise<{ data: { error; path; signedURL; signedUrl }[] ... }>
```

The trailing `s` is a word character, so the pattern's closing `\b` fails and the plural form is invisible to the scanner. The plural form returns the same bearer-in-the-URL credential the singular one does.

Separately, and compounding it: of the four predicates, only `CALLS_SERVICE_ROLE` has real controls (`it('control: a real call is caught; a comment mention is carved out')` and `it('control: a URL inside a string survives line-comment carving')`). `MINTS_SIGNED_URL` has one *positive* control against the real file and no negative one; `STREAMS_STORAGE_BODY` and `PUBLIC_URL` have **no control at all**. Traps §9's "ships positive and negative controls" is satisfied for one predicate in four — which is exactly why the `s` was never noticed.

**Failure scenario.** In any file under `app/api/{inbound,upload,worker,artifact}/**` or `lib/storage/**` (all ESLint-legal today):

```ts
const { data } = await asStoragePlane().from('artifacts').createSignedUrls([key], 3600);
return Response.json({ url: data![0].signedUrl });
```

The browser now holds a URL that reads the private page for a full hour: it survives revocation (the §1.3 re-check never runs again), it is cacheable by any intermediary, it is copy-pasteable out of the family, and it carries no access-log entry. Fence result: assertion 1 green (no `asServiceRole(`), assertion 3 green (`createSignedUrls` does not match `createSignedUrl`), assertion 4 green (the route returns JSON, not a body — no `upstream.body`, no `fetchStorageWithin(`), assertion 5 green (the file names no `getPublicUrl`). The property test 5's title asserts — *no unrevocable read* — is now false while test 5 passes.

**Why the tests miss it.** The pattern's word boundary, and the missing negative control for that pattern. Nothing else in the tree enumerates signed-URL minting.
**What would close it.** `/\bcreateSignedUrls?\b/`, and a negative control per predicate — for this one, `expect(MINTS_SIGNED_URL.test('createSignedUrls([k], 60)')).toBe(true)`; for `PUBLIC_URL` and `STREAMS_STORAGE_BODY`, the equivalent planted-string cases traps §9 requires. **No DDL.**

##### R1/F-4 — MINOR — the machine-read sibling renders a claim about STORAGE out of answers that are not about storage: every authorization refusal and every non-timeout storage error on the `&text=1` path becomes "No machine-read text is stored for this page."
**Confidence.** High on the mechanism; medium on the weight, because (b) below is arguably forced by 404 ≡ 403 while (a) is not. CONTINGENT on nothing I did not read — but note the route is byte-identical to base (it is not in the 61-file diff); this is pre-existing behaviour that ADR-0037 D10 newly *claims* as correct and that 7C newly ships on a second surface.
**Where.** `app/api/artifact/[id]/route.ts` — `servePage`'s two `if (wantText) return notFound();` branches, and every `notFound()` on the §1.3 path; `components/review/MachineReadText.tsx` — the `res.status === 404` arm and the `'absent'` sentence; rendered at `app/(app)/[circle]/documents/[document]/page.tsx` (`<MachineReadText …/>` per page) and in `ReviewScreen.tsx`.
**Claim under test.** ADR-0037 D10: *"a toggle that fetches through the fence and CLASSIFIES — absent/empty/failed each said"*. And the route's own comment: *"telling a person their machine-read text is 'not stored' because a socket stalled is the harm this finding is about."*
**What I found.** The component maps status to sentence with one branch:

```ts
if (res.status === 404) return { kind: 'absent' };
if (!res.ok) return { kind: 'failed' };
```
→ `<p className="micro-meta">No machine-read text is stored for this page.</p>`

The route feeds 404 into that arm from three different kinds of fact:

```ts
const { data, error } = signed;
if (error || !data?.signedUrl) {
  if (wantText) return notFound();
```
```ts
if (!upstream.ok) {
  if (wantText) return notFound();
```

plus every §1.3 refusal (`read.kind !== 'signed-in'`, `!artifact`, `scan_verdict !== 'clean'`, `!rendition`, `pageNo > page_count`).

The asymmetry is the finding. On the **image** half the route splits exactly these two facts and says so at length — `renditionPageMissing` (503: *"permanent and repairable"*) versus `storageTimeout` (504: *"transient and retryable"*), because *"collapsing the two would tell the screen to say 'page 3 is missing' about a page that is not missing, and this route does not guess."* On the **text** half, only the *stall* was split out (ROUND-18 F-1's fix, at `if (!signed) return storageTimeout(pageNo)`); a storage answer of `500`, a `createSignedUrl` error that is not a budget overrun, or a bucket/credential fault all still collapse into the 404 that the screen renders as a positive statement about what is stored.

**Failure scenario.**
(a) Storage answers `503` for `…/p003.txt` during an incident. `upstream.ok` is false, `wantText` is true, the route returns 404, and a daughter reading her mother's discharge summary is told *"No machine-read text is stored for this page."* — for a page whose transcript exists and whose image beside it renders fine (the image half takes `renditionPageMissing`/`storageTimeout` and says so). She is the exact reader §6.9 and A11Y-11 exist for: the one who cannot read the image.
(b) Marisol's grant is revoked while her viewer is open (the AC-PPL-4 scenario `e2e/people.spec.ts` drives). She clicks the toggle; the route re-runs steps 1–3 from live tables and answers the one 404; the panel asserts a storage fact from an authorization answer. Here a *differentiated status* would be the oracle §1.3 forbids, so the honest correction is the sentence, not the status.

**Why the tests miss it.** `tests/routes/artifact.test.ts`'s sibling describe drives these branches from a mocked storage client — so the mapping under test **is** the shipped mapping, and no case compares the resulting sentence to the underlying fact. `tests/routes/document-detail.test.ts`'s sibling case asserts only the label count, the toggle class and `expect(html).not.toContain('text=1')`. No e2e leg drives the sibling under a storage fault; the DOC-02 leg drives only the happy path.
**What would close it.** On the text path, take the image path's own split: a storage answer that is not "object not found" becomes 503/504 rather than 404 — the branch is past every gate, so naming it leaks nothing by the route's own argument in `renditionPageMissing`'s doc-comment — and reword the `'absent'` sentence so it does not assert a storage fact the client cannot know (e.g. "No machine-read text is available for this page."). **No DDL.**

##### R1/F-5 — OBS — D1's next/image prohibition is pinned per-surface, not by the fence that D1 credits with it, while the project's ESLint config makes `<Image>` the lint-blessed default and `_next/image` is explicitly exempt from the proxy's new `no-store` stamp.
**Confidence.** Medium — the substance is verified, but the exact severity `@next/next/no-img-element` carries is CONTINGENT: `eslint-config-next` is exports-mapped and I could not read its flat config to confirm error-vs-warn. The two `eslint-disable-next-line` comments in the tree are themselves evidence the rule fires.
**Where.** `tests/lint/byte-path-fence.test.ts` (the absence); `app/(app)/[circle]/documents/[document]/page.tsx` and `components/review/ReviewScreen.tsx` (the two suppressions); `tests/routes/document-detail.test.ts` and `tests/app/review-screen.test.tsx` (the actual pins); `proxy.ts` — `proxyConfig.matcher`.
**Claim under test.** ADR-0037 D1: *"The viewer renders every page as `<img src=…>` (the plain-`<img>` ruling carried from ReviewScreen: next/image's optimizer would BE a second byte path and a second retention surface)."*
**What I found.** The claim as written is **true and pinned** — I checked before reporting. `tests/routes/document-detail.test.ts` collects every `src` in the rendered page and requires each to start with `/api/artifact/${ARRIVAL}?page=`, which a `<Image>` (rendering `src="/_next/image?url=%2Fapi%2Fartifact…"`) would fail; `tests/app/review-screen.test.tsx` does the `toContain` equivalent. `next/image` and `<Image` appear nowhere in `app/` or `components/` except in the two explanatory comments.

What is missing is generality, in the one file D1 names. The fence — the artefact D1 credits with the property, and the artefact whose charter is to close what ESLint leaves open — has five assertions and none of them mentions `next/image`. Here ESLint does not merely leave a hole: `@next/next/no-img-element` pushes into it. Both existing call sites carry `{/* eslint-disable-next-line @next/next/no-img-element */}`, so in this repo the *permitted* form requires a suppression and the *forbidden* form is what the linter recommends. And `proxy.ts`'s matcher — new to 7C only in its `cache-control` stamp — excludes the optimizer explicitly: `'/((?!_next/static|_next/image|favicon.ico|…).*)'`, so optimizer-served bytes would carry neither the proxy's `private, no-store` nor the route's, on top of landing in the optimizer's on-disk cache.
**Failure scenario.** A future surface renders artifact pages (a print view, a timeline thumbnail). Its author writes `<Image src={`/api/artifact/${id}?page=${n}`} …/>` because that is what lint asks for. Private page bytes now travel `/_next/image`, are written to the image cache keyed by URL and shared across viewers, and reach the browser with no `no-store` from either layer. Nothing in the fence reds; the per-page pins in `document-detail.test.ts` and `review-screen.test.tsx` do not cover a page they were not written for.
**Why the tests miss it.** Both existing pins are per-render assertions inside per-surface unit files. There is no tree-wide assertion.
**What would close it.** One line in the file that already exists: assert `next/image` / `<Image` appears nowhere under `app/` and `components/` (the walked roots and the comment-carving are already there). **No DDL.**

#### R1 confirmations

- **The one-route assertion is real, and the walk is self-proving.** `find app/api/artifact -type f` returns exactly `app/api/artifact/[id]/route.ts`. The second assertion filters `file.startsWith('app/api/artifact/')` over a *recursive* `walk`, so a nested `app/api/artifact/thumb/route.ts` reds too — I traced the generator rather than assuming. And because assertions 1 and 3 require `walk` to *find* a file four levels deep, a walk that silently stopped at the top level would go red, not vacuously green. That is the one axis on which this fence cannot assert its own fixture.
- **`getPublicUrl` really is nowhere** in `app/`, `lib/`, `components/` — independently grepped, not taken from the assertion. No public-bucket URL construction anywhere: the only `NEXT_PUBLIC_SUPABASE_URL` reads outside `lib/db/` are the TUS upstream base and `lib/storage/artifacts.ts:153`, and the only `/storage/v1/` paths are the resumable-upload family.
- **`createSignedUrl` (singular) is in exactly one file and both call sites consume it in-function.** Read, not inferred: `:219` and `:319` each feed `data.signedUrl` straight into `fetchStorageWithin` within the same `answer`/`servePage` frame. No redirect to a signed URL, no signed URL in any response body, header or log line.
- **The TUS proxy does not echo bytes.** `proxyResponse` returns `new Response(null, { status: upstream.status, headers })` over a whitelisted `FORWARD_RESPONSE_HEADERS` set, and rewrites `location` into a server-signed same-origin continuation target after `isResumableUpstream` validation. There is no `GET` handler. The credential rides `storageAuthHeaders()` outbound only.
- **No second byte-producing surface of any other shape.** No `opengraph-image`, `twitter-image`, `icon`, `apple-icon`, `sitemap`, `robots` or `manifest.ts` anywhere under `app/`; no `'use server'` server action in the tree; no `download` attribute; no `url()` in `app/globals.css`; no `<a href>` to a storage host. The only artifact-route consumers in the product tree are the viewer's `<img>` (`documents/[document]/page.tsx:285`), `ReviewScreen`'s `pageUrl` (`:152`), `MachineReadText`'s `fetch` (`:41`), and the two pre-existing inbox "Open the original" anchors — all the same route.
- **"never a raw `&text=1` navigation" is true.** The only occurrence of `text=1` in shipped code is `MachineReadText.tsx:41`; every other hit in `app/`, `lib/`, `components/` is a comment. `tests/routes/document-detail.test.ts:221` pins `expect(html).not.toContain('text=1')`.
- **§6.9's exact label is by construction, and the extraction left no divergent copy.** I diffed `components/review/ReviewScreen.tsx` across `18c362d..ccd854b`: the whole `MachineTextResult` type, the component and the five sentences are deleted there and re-added in `MachineReadText.tsx` character-for-character (the only delta is one added comment paragraph naming 7C C2/C6). `ReviewScreen.tsx` now imports it and renders `<MachineReadText arrivalId={arrivalId} page={page} />`. The literal `machine-read — may contain errors` occurs exactly once in shipped code. D10's "ONE component, both surfaces" is verified, not asserted.
- **The classification's other three arms are honest.** `!res.ok` → `'failed'` → "couldn't be loaded right now" covers the 503 session-unavailable and both 504s; a thrown/aborted `res.text()` lands in `.catch` → `'failed'`; an empty-after-`trim` 200 → `'empty'` → "couldn't produce reliable text", which is the truthful reading of a low-confidence transcript. Only the 404 arm (F-4) over-claims.
- **The byte path cannot serve a script-executing content type.** `lib/pipeline/mime.ts`'s `sniffMime` returns a closed set — pdf / jpeg / png / gif / tiff / zip / json / text-plain / octet-stream — never `text/html` or `image/svg+xml`, and it is the source of *both* `mime_detected` and the stored object's content type (`app/api/worker/[stage]/route.ts:139` → `writeArtifactObject(…, contentType)`). So the route's `artifact.mime_detected ?? upstream.headers.get('content-type')` fallback is safe, and the absence of `X-Content-Type-Options: nosniff` and `Content-Disposition` on the one path is not an active hazard. CONTINGENT on the store stage being the only writer of `mime_detected` — I read the worker's call sites, not the DDL.
- **The proxy's `private, no-store` stamp is real and unit-pinned**, and Q-D's split is stated in the leg's own comment rather than hidden: `tests/app/proxy.test.ts`'s new case covers both the signed-in and signed-out pass-through, and `e2e/people.spec.ts`'s PPL-03 leg asserts the header on the artifact response — where caching actually bites — while saying in-file why the page half rests on the unit pin.

#### R1 recorded dissents and observations

- **OBS — the scan's coverage boundary is stated but leaves `proxy.ts` outside it.** `ROOTS = ['app', 'lib', 'components']`, and the file's `Scope:` paragraph names only workers and scripts as the deliberate exclusion. `proxy.ts` lives at the repo root, is the *only* non-`app/lib/components/e2e/tests` file 7C touched, and is a file that can return a body. Non-`.ts`/`.tsx` files under the three roots are also invisible (`/\.(ts|tsx)$/`), while `eslint.config.mjs`'s own fence block covers `**/*.mjs` — so `.mjs` is an expected file type here. Neither is exploited today (the only non-TS files under the roots are `app/favicon.ico` and `app/globals.css`), and the scope is declared rather than concealed. Recorded, not filed.
- **OBS — the A11Y-11 leg's title outruns its assertion.** *"…the machine-read sibling reachable by keyboard as native text is"* is asserted as `await toggle.focus(); await page.keyboard.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'true')`. A run in which the sibling fetch failed would render *"The machine-read text couldn't be loaded right now."*, keep `aria-expanded="true"`, and pass axe — green with no machine-read text reachable at all. The property is genuinely covered by the DOC-02 leg in the same spec (`pre.review-machine-text` must contain `/Wound care|Discharge/`), so this is a title-scope observation and not a coverage gap. Worth noting only because it is the same shape as ROUND-18 F-5, which this component's own doc-comment memorialises.
- **Not a finding — settled.** D12.1 / Q-A (a document share reaches the row, not the arrival's bytes) is a plan- and DB-authority matter, and `can_view` staying the arrival's view×5 is what makes the fenced route's step 2 coherent. From the byte-path lens it is *correct*: the share-holder never reaches the byte path at all, which is why `e2e/documents.spec.ts`'s share leg can assert her 404 on the derived task. No dissent.
- **Observation on the shape of this fence, offered to the round rather than as a defect.** F-1, F-2 and F-3 are one failure repeated: four predicates, each a literal string lifted from the file being pinned, and controls for one of them. The file's own header cites traps §9 — *"the predicate ships positive and negative controls"* — and ADR-0026's *"if it can be a scanner, a manifest, or an exact-set assertion, it must be."* An exact-set assertion over the *importers of the fenced module* and over the *callers of the byte-returning readers* is available, mechanical, and would survive every bypass above; a name grep survives none of them. The fence is worth keeping and worth strengthening in the same commit.

### R2 — the Documents detail's three depths, the list, and the three writes (model: Opus)
> **Independently verified:** every line of `lib/hc/documents.ts`, `app/(app)/[circle]/documents/[document]/page.tsx`, the three submit routes, `app/(app)/[circle]/documents/page.tsx`, and the three test files; `lib/http/page-budget.ts`, `lib/auth/gate.ts`, `extractionsFor` (`lib/hc/review.ts`), `readableRendition` (`lib/hc/artifacts.ts`), `components/review/ReviewScreen.tsx`'s facts branch, `app/account/step-up/submit/route.ts` and `app/(app)/[circle]/people/[member]/grant/submit/route.ts` (the cookie's other writer); and, from `supabase/migrations`, the settled substrate the app reads — `hc.visible_at` (`20260816120006:44`), `documents_select` (`20260815230002:299`), `hc.document_references` / `hc.shares_for` / `hc.recategorize_document` / `hc.document_audience` / `hc.document_audience_derived` / `hc.revoke_share` / `hc.circle_people` (`20260829120005`), `hc.document_audience` M3 (`20260829120003`), `hc.share_object` + `hc.consume_step_up` (`20260818120002`), `hc.extractions_for` (`20260824120002`), `hc.tier_defaults` (`20260818120003`). The 7C documents legs in `e2e/documents.spec.ts` were read only where a finding needed them.
> **Taken on trust:** I ran NOTHING — no gate, no vitest, no psql, no dev server. The r5 57/57 tally, the vitest 1315/99, the byte-path fence's own green, the a11y legs, the tree-binding measurements, and PRD/TSD section text (I read the plan, ADR-0033/0034/0036/0037 and the packet; I did not read PRD §4.3 or TSD §3.4 themselves — where I lean on them I say so). The DB layer is settled; I read it only to check the app's use of it.
> **Verdict:** the three depths hold, `extractionsFor` is genuinely fenced, and the r3 fix is real and really pinned — but re-categorisation is OFFERED for target domains the database will always refuse (AC-DOC-6's "and not offered", the BINDING C2 row), and the refusal it produces is the r3 dishonesty repeated verbatim at a second call site; the preview also drops the derived audience that ADR-0034 D7 says the preview names, and that narrowing is not in D12.

#### R2 findings, most severe first

##### R2/F-1 — MAJOR — Re-categorise is offered for every other category regardless of the actor's manage on the DESTINATION domain, and the database's named `audience_refused` is rendered as "We couldn't load this document just now." — the whole detail page, lost.
**Confidence.** High. Every line is read; the only thing not observed is a live run.
**Where.** `app/(app)/[circle]/documents/[document]/page.tsx` — the `doc.can_manage` manage-reads block (the `Promise.all` with `documentAudience`) and the Category section's radio list; `lib/hc/documents.ts#documentAudience`; the gate is `hc.document_audience` (`supabase/migrations/20260829120005_round24_m5_reads.sql:1531-1538`). e2e leg by title: "re-categorise: the audience named before the move, the move landing with its markers (DOC-03, AC-DOC-6)".
**Claim under test.** Plan `docs/review/slice-7-plan.md`, the 7C table, C2 (BINDING): *"**Re-categorise**: `document_audience` renders the exact before-and-after audience by name … explicit confirmation, then `recategorize_document`; **refused (and not offered) unless the member holds manage on both domains (AC-DOC-6)**."* And ADR-0037 D2: *"at `manage` it gains … re-categorise with the exact before-and-after audience named FIRST."*
**What I found.** The page's only authorization input is one boolean:

```
hc.visible_at(hc.ctx(), d.subject_id, d.taint, d.taint_resolved,
              'document', d.id, null) >= 'manage' as can_manage
```

— manage over the document's **current** taint. Nothing in the row read, and nothing anywhere in `lib/hc/documents.ts`, tells the page which domains the actor manages. The offer is therefore unconditional:

```
{DOC_CATEGORIES.filter((c) => c !== doc!.category).map((c) => (
  <label key={c}><input type="radio" name="move" value={c} required /> …
```

The database gate is strictly stronger — `hc.document_audience` and `hc.recategorize_document` carry the same two-clause test:

```
if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                 'document', p_document, null) < 'manage'
   or not ((v_ctx -> 'subjects' -> v_doc.subject_id::text -> 'manage')
           @> to_jsonb(array[hc.own_domain('document', p_category, null, null)])) then
  raise exception 'audience_refused' using errcode = 'P0001';
```

so the *preview* raises before the person ever reaches a confirm button. The page's manage block folds that named raise into a catch-all:

```
} catch (err) {
  if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
  console.error(`document: manage read failed: ${(err as Error).message}`);
  return loadFailed(next, false);
}
```

`loadFailed` **replaces the entire page** with *"We couldn't load this document just now. Nothing has been lost — try again in a moment."* The shares list and the share control are discarded with it, because they are in the same `Promise.all`. This is the r3 catch's mechanism at a second call site: D2 says *"THE ROW DECIDES FIRST now"* — the fix was applied to the references read alone, not to the class, and `?e=refused`'s honest marker (which the page already renders as *"That couldn't be done just now."*) is never reached because the refusal happens during a GET render, not a POST.
**Failure scenario.** Concrete, and reachable through 7C's own C4 surface. Sarah (coordinator) uses `/[circle]/people/[member]` to raise Dan (family) to `manage` on `health` for Nell; Dan keeps the family defaults elsewhere (`hc.tier_defaults`: `documents: log`, nothing on `finances`). Dan opens the medical discharge summary. `d.taint = {health}` and Dan manages health → `can_manage` is true → the Category section renders with six radios: Medications, Insurance, Legal, Financial, Labs, Other. **Every one of them** is a domain he does not manage (`health` is excluded as the current category's twin only for Medical; Medications/Labs are health, so those three work — Insurance, Financial, Legal and Other do not). He checks Financial, clicks "Preview the move", and the page he was reading is gone, replaced by "We couldn't load this document just now." "Try again" returns him to the document, where the same control invites the same failure. The same happens to any coordinator whose `finances` grant was lowered by another coordinator — the C4 adjust matrix's whole purpose.
**Why the tests miss it.** `tests/routes/document-detail.test.ts` mocks `documentAudience` to a resolved value in every case (`docsHc.documentAudience.mockResolvedValue([])` in `beforeEach`, and one row in the re-categorise case) — there is no rejecting-audience case at all, so the catch-all is never exercised. `tests/hc/documents.test.ts` DOES drive the refusal live — *"the move is refused without manage on BOTH domains, and nothing changes"* — but only through `recategorizeDocument` (the POST wrapper), never through `documentAudience` (the GET the page actually makes first), and never through the page. The e2e leg's title claims AC-DOC-6, but it drives only the founder — a coordinator with manage×5 — so the permitted path is all that is asserted; ask of that leg "what would this assertion do if the refusal half were absent?" and the answer is: pass. AC-DOC-6's refusal half has **no app-layer evidence at any level**.
**What would close it.** No DDL. `hc.circle_people` already returns `levels` for the caller herself (`20260829120005:1752`: `when v_coord or m.id = v_me.id then hc.member_levels_frozen(...)`), and `lib/hc/people#circlePeople` is already wired — the grant route reads `person.levels?.[subjectId]?.[domain]` from it. Filter `DOC_CATEGORIES` to categories whose `categoryDomain(c)` the caller holds at `manage` for `doc.subject_id`, and — belt and braces, because a grant can change between render and click — give the audience read its own catch that redirects to `?e=refused` (the marker and its copy already exist) instead of `loadFailed`.

##### R2/F-2 — MAJOR — The re-categorisation confirmation names the document's audience but not the DERIVED objects whose holders change level, which ADR-0034 D7 rules the preview names; `hc.document_audience_derived` has zero callers anywhere in the tree, and the narrowing is not in D12.
**Confidence.** High on the mechanism (the function exists, is gated identically, and is called by nothing); medium on the severity, which turns on how ADR-0034 D7's "the preview" is read — CONTINGENT on PRD §4.3.2's exact words, which I did not read.
**Where.** `app/(app)/[circle]/documents/[document]/page.tsx` — the Category section's sentence (`gainedNames` / `lostNames` / `changedNames`); `lib/hc/documents.ts` (no wrapper exists); `supabase/migrations/20260829120005_round24_m5_reads.sql:1571+` `hc.document_audience_derived`.
**Claim under test.** ADR-0033 R1/F-3, ruled and dispositioned: ADR-0034 D7's table row reads *"**the preview and the entry NAME the derived objects whose holders change level**"* with `document_audience_derived` cited as the artifact — the finding it closed being *"the recategorise path moves descendants the preview never named."* ADR-0037 D12 enumerates the narrowings 7C took; this is not among them.
**What I found.** `grep -rn "document_audience_derived" lib app components tests e2e` returns **nothing**. The only hits in the repo are the migration that creates it and ADR-0034's own disposition row. The shipped confirmation is built from `documentAudience` alone:

```
{gainedNames.length > 0 ? ` ${gainedNames.join(' and ')} will be able to see it.` : ''}
{lostNames.length > 0 ? ` ${lostNames.join(' and ')} will no longer be able to see it.` : ''}
{changedNames.length > 0 ? ` What ${changedNames.join(' and ')} can see changes.` : ''}
{audience.length === 0 ? ' No one gains or loses access.' : ''}
```

— and `hc.document_audience`'s `where r.before <> r.after` is over the **document** only. The move itself does propagate: `hc.recategorize_document` snapshots `v_derived_before` over the recursive `provenance_edges` walk and writes the derived holders into the `audience_changed` entry, and `hc.reclassify_taint` moves every descendant's taint. So the record is honest and the person confirming is not. Worse, `' No one gains or loses access.'` is rendered whenever the document audience is empty — a positive assurance that can be false while a task holder is about to lose her task.
**Failure scenario.** The share/unshare leg's own fixture shape. Marisol (care_circle) holds an open task derived from the discharge summary via `provenance_edges` (`task → document`), taint `{schedule,health}`. Sarah moves the document Medical → Financial. `hc.document_audience` reports the document's audience (Dan loses sight). The screen says *"This moves it out of health into finances. Dan will no longer be able to see it."* — or, if Dan does not exist, *"No one gains or loses access."* `hc.reclassify_taint` then recomputes the task to `{schedule,finances}` and Marisol's level on a task she is holding changes, unannounced. `hc.document_audience_derived`, gated by the identical predicate so it discloses nothing new, would have named it before the click.
**Why the tests miss it.** Nothing at any layer asks for it: `tests/routes/document-detail.test.ts` asserts only the three document-audience sentences; `tests/hc/documents.test.ts`'s audience case asserts Ruth/Lena/Marisol's document levels; the pgTAP half (068:32, 36–37 per ADR-0034) proves the DB function and the log entry, not the surface. DOC-03's coverage cell claims the app half green for "the preview renders the EXACT audience by name and direction" — true of the document audience, silent on the derived half, so the row does not over-claim but the ruling is quietly unmet.
**What would close it.** No DDL — the function exists and is granted to `authenticated`. Add a `documentAudienceDerived` wrapper beside `documentAudience`, race it in the same `Promise.all` under `move`, and render one more sentence naming the holders and their objects. If the round instead rules that ADR-0034 D7's "preview" meant the DB preview only, then 7C must name this as a narrowing in ADR-0037 D12 with a coverage row, not leave it unsaid.

##### R2/F-3 — MINOR — The share control treats the mere PRESENCE of the `hc-step-up` cookie as a live confirmation, so a `raise_grant` token minted by the People adjust flow makes the page offer "Share it with X" with no password, and the share then dead-ends at "That couldn't be done just now."
**Confidence.** High on the mechanism; the DB refuses correctly, so this is honesty, not authorization.
**Where.** `app/(app)/[circle]/documents/[document]/page.tsx` — `const stepUp = (await cookies()).get(STEP_UP_COOKIE)?.value ?? null;` and the `shareTarget ? (stepUp ? … )` branch; `app/account/step-up/submit/route.ts:55-58`; `app/(app)/[circle]/people/[member]/grant/submit/route.ts`.
**Claim under test.** ADR-0037 D2: *"share behind the §5.7 step-up bound to `document:<id>`"*; the packet's Q-A framing and the plan's C2 *"share with one member through `share_object` behind step-up"*.
**What I found.** The binding is real and server-side — `hc.share_object` calls `hc.consume_step_up(p_step_up_token, 'share_object', p_object_type||':'||p_object_id, v_actor)`, and `consume_step_up`'s UPDATE matches on `operation` and `target_ref`, so a token minted for document A cannot share document B and a `raise_grant` token cannot share anything. **The page's check is not the binding.** One cookie name, `hc-step-up`, carries tokens for both operations (`account/step-up/submit` writes it for whatever `operation` the form posted; the grant route reads the same name for `raise_grant`), the token is opaque to the page, and the page tests only `?.value ?? null`.
**Failure scenario.** Sarah starts a raise on `/[circle]/people/[member]`, is bounced to the step-up form, enters her password. `/account/step-up/submit` mints a `raise_grant` token bound to `member:subject:domain` and sets `hc-step-up` for 300 s. She abandons the raise (navigates away without submitting — the grant route is what clears the cookie). Within five minutes she opens a document, picks Marisol, clicks "Share this document" → `?share=<marisol>`. The page sees the cookie and renders **phase 2** — the §4.3.5 paragraph and "Share it with Marisol" — with no password prompt. She clicks it; `hc.share_object` refuses on the operation mismatch; the route clears the cookie and redirects to `?e=refused`, which `noticeFor` renders as *"That couldn't be done just now."* She is given no reason and no path: the honest marker `e=step-up` ("Sharing needs a fresh confirmation that it is you") exists in `noticeFor` and is unreachable from here. The same happens with a live `share_object` token minted for a *different* document.
**Why the tests miss it.** `tests/routes/document-detail.test.ts` sets `stepUpCookie = 'tok'` — an opaque string — and asserts phase 2 renders and that the wrapper receives `'tok'`; the test cannot distinguish "a token for this share" from "any string". The e2e share leg mints the right token through the real screens, so it never sees a foreign one. Ask of the phase-2 test "what would this assertion do if the page checked nothing about the token?" — exactly what it does now: pass.
**What would close it.** No DDL. Either name the cookie per operation (`hc-step-up-share` / `hc-step-up-raise`) or set a readable companion cookie carrying `operation` + `target_ref` and require it to equal `share_object` / `document:<id>` before rendering phase 2. Cheaper still, and worth doing regardless: have `share/submit` redirect to `${back}?share=${memberId}&e=step-up` (its own existing shape for a missing token) rather than `?e=refused`, so a stale token returns the person to the confirm form instead of a dead end.

##### R2/F-4 — MINOR — "Unshare" is rendered for assignment-created shares that `hc.revoke_share` refuses by ruling, and the always-failing click is answered with the same opaque "That couldn't be done just now."
**Confidence.** High.
**Where.** `app/(app)/[circle]/documents/[document]/page.tsx` — the `shares.map(...)` form; `app/(app)/[circle]/documents/[document]/unshare/submit/route.ts`; `hc.revoke_share` (`20260829120005:1005-1010`).
**Claim under test.** Plan C2 (BINDING): *"who it has been shared with, and **unshare in one action** (M4 `shares_for`, M3 `revoke_share`, logged)"*; ADR-0037 D12 does not name this as a narrowing.
**What I found.** `hc.revoke_share` carries ADR-0033 D19.2:

```
if v_share.created_by_assignment_of is not null
   and exists (select 1 from public.tasks t
               where t.id = v_share.created_by_assignment_of
                 and t.deleted_at is null and t.status = 'open'
                 and t.owner_member_id = v_share.member_id) then
  raise exception 'revoke_refused' using errcode = 'P0001';
```

The page renders an Unshare button for every row `hc.shares_for` returns, and it already reads the discriminating column — `{s.created_by_assignment_of ? ' · came with a task' : ''}` — but uses it only as a label. `shares_for` returns the task id and not the task's status, so the page cannot tell a KEPT share (revocable) from a live assignment's (refused) without another read; it does not attempt to, and it does not say the path either.
**Failure scenario.** A coordinator assigns Marisol a task through the 7B assign flow with the discharge summary shared (path 2). She opens the document; "Shared with" lists *"Marisol — shared by Sarah · 30 Aug · came with a task"* with an Unshare button. She clicks it. `revoke_refused` → `?e=refused` → *"That couldn't be done just now."* The button will never work while the task is open, and nothing on screen names `unassign` as the door. §4.3.5's "revocable in one action" is displayed as true and is false for this row.
**Why the tests miss it.** `tests/routes/document-detail.test.ts`'s share fixture sets `created_by_assignment_of: null`, and its refusal case mocks a generic `revoke_refused` at the route, so the *offer* is never questioned. `tests/hc/documents.test.ts` creates the share through `shareDocument`, never through an assignment. The e2e leg unshares a directly-created share. The pgTAP half (066:68) proves the DB refusal — which is exactly why the surface offering it is the defect.
**What would close it.** No DDL, but it needs a status the app can see. Cheapest honest fix without touching the definer: render the row's Unshare only when `created_by_assignment_of` is null, and for the others say in words that the share came with an open task and is withdrawn by unassigning it, linking `/[circle]/tasks/[created_by_assignment_of]`. (Widening `hc.shares_for` to carry the task's live status would be a slice-8 DDL question — it is not needed for the honest surface.)

##### R2/F-5 — MINOR — Under the server-side subject filter the list renders *"Nothing filed yet."* — a sentence that is false whenever the circle has documents for another subject — and the subject filter is one-way: its own nav disappears when it is active.
**Confidence.** High.
**Where.** `app/(app)/[circle]/documents/page.tsx` — `rows.length === 0 ? <p className="meta">Nothing filed yet.</p>`, `subjectsSeen` (computed from the already-narrowed `rows`), and the "All" href `` `${next}?${keepSubject.slice(1)}` ``; `lib/hc/documents.ts#documentsFor` (`if (filter.subject !== undefined && !UUID_RE.test(filter.subject)) return [];`).
**Claim under test.** Plan C1 (BINDING): *"by category (the seven of §4.3.2) **and by subject** … a count that is post-filter; *"Nothing filed yet."*"*. `tests/routes/documents-list.test.ts`'s own header states the contract: *"empty: 'Nothing filed yet.' — **true whenever nothing is FILED**, even while something has arrived."* Coverage DOC-01 repeats it. The OW-20 / R5/F-2 precedent (plan B1) is the neighbouring discipline: *"read `error` and render an error state, never an empty one."*
**What I found.** The category filter is client-side and has its own honest sentence — `filtered.length === 0 ? <p className="meta">Nothing in this view.</p>`. The **subject** filter is server-side (`documentsFor(claims, circle, { subject })`), so it empties `rows` itself, and `rows.length === 0` is the only branch that guards the global sentence. A malformed `?subject=` empties it before the database is touched. Separately, `subjectsSeen = [...new Map(rows.map((r) => [r.subject_id, r])).values()]` is derived from the narrowed rows, so with a subject active `subjectsSeen.length === 1`, the `subjectsSeen.length > 1` guard hides the subject nav, and the "All (N)" link deliberately preserves `keepSubject` — no control on the page clears the filter.
**Failure scenario.** Nell has four documents, Marcus one. A reader clicks the "Marcus" chip → `?subject=<marcus>`: the subject nav vanishes, and the only route back to Nell is the shell nav's Documents entry or editing the URL. If Marcus's one document is later re-categorised out of her reach (or the link was bookmarked, or the id is stale), the same URL renders *"Nothing filed yet."* over a circle of four filed documents — with no chips, so nothing on the page contradicts it.
**Why the tests miss it.** `tests/routes/documents-list.test.ts` has exactly one subject case — *"a subject filter narrows server-side — the ONE fetch carries it"* — and it asserts only that `documentsFor` was **called with** `{ subject: NELL }`; it never renders an empty result under a filter, and it never asserts a way back. The empty-state case mocks `documentsFor` to `[]` with **no** searchParams, so the sentence is only ever seen where it is true. The e2e list leg asserts the filled shape by design (D12.2).
**What would close it.** No DDL. Track whether a subject filter is active and render "Nothing in this view." (the sentence already on the page) rather than "Nothing filed yet." when it is; render the subject nav from a subject list that is not the filtered rows (or always render a "Everyone" chip whose href drops `subject`), and drop `keepSubject` from the "All" category link or add a separate clear-filter control.

##### R2/F-6 — MINOR — At `view`, a document with no extracted fields renders no "What we read out of it" section and says nothing — while the sibling surface built from the same component in this same slice says *"No fields were read from this document."*
**Confidence.** Medium — the mechanism is certain; whether the silence is a defect rests on the design spec's empty-state rule, which I did not read (CONTINGENT).
**Where.** `app/(app)/[circle]/documents/[document]/page.tsx` — `{doc.can_view && facts.length > 0 ? (…) : null}` and `{doc.can_view && rendition ? (…) : null}`; the precedent is `components/review/ReviewScreen.tsx:240-242`.
**Claim under test.** ADR-0037 D2: *"at `view` … it gains the pages … with the machine-read sibling per page … and the facts with citation and the risk_class word"*; D10: *"a toggle that fetches through the fence and CLASSIFIES — absent/empty/failed **each said**."*
**What I found.** D10's classify-and-say discipline was carried across for the machine-read sibling (one component, both surfaces) but not one level up. `ReviewScreen` renders `{facts.length === 0 ? <p className="meta">No fields were read from this document.</p> : null}`; the document detail renders nothing at all. `readableRendition` returns null for "not-rendered, foreign, deleted, revoked and below-cliff alike" (its own comment), so a null manifest likewise erases the viewer with no sentence. The neighbouring subject page argues its silence explicitly (`people/subject/[subject]/page.tsx:30`: *"view there are none, and no facts-shaped hole implies them"*) — the document detail argues nothing.
**Failure scenario.** A filed document from which extraction produced no fields (or whose facts `extractions_select` filters to zero for this reader). A reader at `view` sees the summary card, the pages, and then nothing — indistinguishable from the page having failed to load that section, and indistinguishable in shape from a `summary` reader's page except for the pages themselves. On the review screen, the same arrival says so in words.
**Why the tests miss it.** `tests/routes/document-detail.test.ts`'s view block always mocks one fact and a two-page rendition; the summary block asserts the **absence** of "what we read", so a can_view reader with zero facts is in neither case. The e2e detail leg drives a real pipeline document that has facts.
**What would close it.** No DDL — copy the ReviewScreen sentence (and one for an absent rendition) into the `can_view` branch, and pin an empty-facts case in `tests/routes/document-detail.test.ts`.

##### R2/F-7 — MINOR — D12.1's narrowing — the very claim Q-A asks the round to ratify — is asserted by no test at any layer: nothing anywhere checks that a document share-holder gets the row **without** the pages or the facts.
**Confidence.** High.
**Where.** `tests/hc/documents.test.ts` — *"the grantee's NEXT query reads THIS document — and the OTHER health document stays invisible (AC-DOC-5)"*; e2e leg by title: "share / unshare: one document to the caregiver — her context sees IT and not a task derived from it; unshare is one action and her next look loses it (DOC-04, AC-DOC-5, AC-PERM-10)".
**Claim under test.** ADR-0037 D12.1: *"A document share does not extend to the arrival's bytes or facts. The share-holder reads the document ROW (title, category, dates, sentences); `can_view` stays the ARRIVAL's view×5, which an object share on the document does not satisfy."*
**What I found.** The behaviour is correct (see Q-A below) — and untested. The live case asserts `documentById` is non-null, checks the title, and checks the *other* health document is still null; it never reads `shared!.can_view` or `shared!.can_manage`, both of which are on the object it already holds. The e2e leg asserts `marisol.page.locator('main')` contains the title and that the derived **task** 404s; it does not assert `main img` count is 0, nor the absence of `MACHINE_READ_LABEL`, though the summary half of the DOC-02 leg does exactly those assertions for Dan and the pattern was there to copy. So if `can_view` were ever computed from the `'document'` object instead of the `'arrival'` object — a one-token edit in `documentById` that rung 5 of `hc.visible_at` would silently satisfy for every share-holder — every test in the tree stays green and every share-holder gains the pages and the facts.
**Failure scenario.** Not a live defect: a regression trap on the exact narrowing the round is being asked to accept. The ACCEPT recommended for Q-A rests on behaviour that nothing pins.
**Why the tests miss it.** By omission — both tests stop at "she can read it" and never ask "how much of it".
**What would close it.** No DDL. Two lines in `tests/hc/documents.test.ts` (`expect(shared!.can_view).toBe(false); expect(shared!.can_manage).toBe(false);`) and two in the e2e share leg mirroring the DOC-02 summary assertions (`main img` count 0, no `MACHINE_READ_LABEL`) from Marisol's live context.

#### R2 confirmations

- **The three depths hold, and `extractionsFor` is genuinely fenced.** `readableRendition` and `extractionsFor` are both inside `if (doc.can_view)`; no `Promise.all`, conditional or error path reaches them otherwise. `can_view` is `hc.visible_at(..., hc.all_domains(), true, 'arrival', d.artifact_arrival_id, null) >= 'view'` — byte-identical in predicate to `hc.extractions_for`'s own in-function gate (`20260824120002:631-632`), so the page's gate and the definer's cannot disagree. The viewer, the facts and `MachineReadText` render only under `doc.can_view`; every `src` on the page is `/api/artifact/<arrival>?page=N` and the test proves it by enumerating **all** `src` attributes, not by a containment check — a genuinely strong assertion.
- **No disabled control at `summary`.** The summary rendering is header, meta line, `summary_text`, source, approver — every control (`Share this document`, the category radios, `Unshare`) is inside a `doc.can_manage` branch, and there is no `disabled` attribute anywhere in the file. The e2e leg asserts `dan.page.locator('main [disabled]').count() === 0` from a real summary context.
- **The r3 fix is real and the pin bites.** The row read runs alone in its own `try`; `if (!doc) notFound()` is outside any catch; `withPageBudget` re-throws everything that is not `AnswerBudgetExceeded`, so `NEXT_NOT_FOUND` propagates. I checked the pin against the pre-fix shape: with the row and references in one `Promise.all` inside one `try`, a rejected references read with a null row lands in the catch and returns `loadFailed` — the test's `rejects.toThrow('NEXT_NOT_FOUND')` would fail. The pin asserts the behaviour, not the fixture. And `documents_select` (`20260815230002:299`) requires `>= 'summary'` while `hc.document_references` gates at `>= 'summary'` too, so a row the page obtained can no longer meet a refusing references read except across a concurrent re-categorisation.
- **Hidden, foreign, deleted and nonexistent are one shape.** `documentById` returns null in one way (`r.rows.length === 1 ? … : null`), RLS decides, and the live test drives it from Marisol's hidden context.
- **The step-up binding is enforced server-side against the posted document id.** `hc.share_object` refuses a null token outright and consumes through `hc.consume_step_up(token, 'share_object', 'document:'||p_object_id, v_actor)`, matching `operation` and `target_ref` in the atomic UPDATE. A token minted for document A cannot share document B; a token minted for another operation cannot share at all. The app passes the path's `documentId` (UUID-validated) as the same value. F-3 is about the page's *offer*, not this gate.
- **The TOCTOU on re-categorise genuinely closes.** The preview writes `expected_category={doc.category}` into a hidden input read from the same row that produced the sentence; the route refuses a category outside the seven before the wrapper; `hc.recategorize_document` re-reads `FOR UPDATE` under the circle's advisory lock and raises the named `document_changed` **after** the authorization gate (so a caller the gate refuses learns nothing about the category), and the route maps that one name to its own `?e=changed` marker with copy that tells the person to check the category. The live test drives the stale-expectation refusal.
- **One RLS-true fetch on the list, counts post-filter.** `documentsFor` is called once; `counts` and `filtered` are both computed over the same `rows`; the vitest asserts `toHaveBeenCalledTimes(1)` in the filtered case, which is the assertion that matters. "Add a document" is an `<a href="/[circle]/upload">`, never an input, and the e2e leg follows it to a real file input. The in-flight row's label comes from `hc.product_state(a.id)` in the query itself and links to the Care Inbox.
- **The category→domain map is pinned LIVE.** `tests/hc/documents.test.ts` loops all seven categories against `hc.own_domain('document', $1, null, null)` and compares `c:domain` strings — it would go red on any drift, in either direction.
- **`change` is exhaustive.** `hc.document_audience` emits exactly `gained` / `lost` / `changed`; the page's three filters plus the `audience.length === 0` sentence cover the space, so no member in the audience can be silently dropped from the confirmation. (The derived audience is F-2, a different set.)
- **No shipped surface says "documents" where the map says finances** (Q-C detail below).

#### R2 answers to assigned pointed questions

**Q-A.** **RATIFY the recommendation (ACCEPT as the §4.3.5 reading for Phase 1), and the tension in the packet dissolves once the code is read — but the ACCEPT should carry F-7's pin as a condition.**

The apparent contradiction — "extractionsFor is never called below `can_view`" versus "the share-holder reads … sentences" — is not a contradiction, because the *sentences are not extractions*. The summary/view line is drawn between **tables** (`lib/hc/documents.ts`'s own header, citing §3.4): `documents.summary_text` is a column on the document ROW, and the extractions live in `public.extractions` behind the arrival's gate. Tracing it exactly:

1. `hc.visible_at` rung 5 — *"An object share widens ONE named object to 'view'"* — fires on `p_object_type = 'document'`, so a share-holder's level on the **document** becomes `greatest(ladder(...), 'view')`. `documents_select` needs `>= 'summary'`, so her `select` on `public.documents` now returns the row, with every column on it: title, category, `filed_at`, `approved_at`, `approver_display_name`, and `summary_text` — the three sentences.
2. `can_view` in the same row read asks `hc.visible_at(..., hc.all_domains(), true, **'arrival'**, d.artifact_arrival_id, null) >= 'view'`. Rung 5 tests `p_ctx -> 'shares' -> 'arrival'`, which does not contain the arrival id — a document share is on the document. So she falls to rung 4 (care_circle ceiling → hidden) or rung 6 (the ladder over all five domains). `can_view` is **false**, and `readableRendition` and `extractionsFor` are therefore never called for her. Both statements are true simultaneously.
3. `can_manage` asks the document object with the document's taint; rung 5 caps her at `view`, which is below `manage`, so no share control, no re-categorise, no share list.
4. What she actually sees, then: the header title, the subject label, the category word, the filed date, `summary_text`, "Who approved it — Approved by X · date", and "Where it came from". Her arrival row is RLS-filtered, so the source resolves null and reads *"Its arrival is not yours to open"* — honest and dead-link-free. References render only if `hc.document_references` returns rows at or above `log` **from her own context**, which for a caregiver with no domain reach is nothing.

So D2 and D12.1 agree, and the surface matches D12.1's enumeration with one addition D12.1 does not list: **the approver's name and the approval date** are on the row and are shown to her. That is right by AC-DOC-3 and by §3.4's table line, but D12.1's sentence "title, category, dates, sentences" understates it — I would amend the D12.1 text to "title, category, dates, the sentences, and who approved it and when" rather than leave the enumeration incomplete beside AC-DOC-5.

The dissent-shaped part: I would not ACCEPT without R2/F-7's two-line pin. The ACCEPT is a statement about behaviour that no test asserts, and the single edit that would break it (`'document'` for `'arrival'` in `documentById`'s `can_view` expression) is silently satisfied by rung 5 for every share-holder in the system. Ratifying an unpinned narrowing on the sensitive pair is how it stops being true.

**Q-C.** **RATIFY: the ADR binds, a one-line PRD erratum at sign-off, no code change — and the app layer is clean.**

The live pin is real and stronger than "asserts the ADR's ruling": `tests/hc/documents.test.ts`'s *"the category→domain module agrees with hc.own_domain for all seven — pinned live, the tiers.ts discipline"* loops **all seven** categories and compares `` `${c}:${docsLib.categoryDomain(c)}` `` against `hc.own_domain('document', $1::hc.doc_category, null, null)` — so `insurance: 'finances'` in `lib/hc/documents.ts:48` cannot drift from `20260815230005:71` in either direction, and the assertion would fail if the constant were edited *or* if the DB map moved. The ADR-0005 cite rides in two comments (`lib/hc/documents.ts:40`, and the move case's *"insurance → finances is ADR-0005's ruling (hc.own_domain, `20260815230005:71`), standing since 1B"*) and the move case additionally asserts the consequence live: `expect(moved!.taint).toEqual(['finances'])`. That is the ruling asserted, with the cite beside it — strictly, the cite is a comment and the *ruling* is what the assertion holds, which is the right way round.

On the second half — no shipped surface says "documents" where the map says finances. A full-tree grep for `insurance` across `app/ lib/ components/ e2e/ tests/` returns only: the two `CATEGORY_LABEL` maps (`'Insurance'` — a category label, not a domain word), the styleguide fixture badge, the three `lib/ai/` category enums, `lib/extraction/fields.ts`'s comment, and `lib/hc/documents.ts`'s own map plus its ADR-0005 comment. The only place a domain **word** reaches a person is the re-categorisation sentence, and it is composed from `categoryDomain()` — so an insurance document reads *"This moves it out of health into finances."*, matching PRD §4.3.2's own example sentence and never the prose's "documents". The erratum is a PRD-side edit only; nothing in the app or the tests changes.

#### R2 recorded dissents and observations

- **Not a finding, a settled ruling (dissent noted, not filed):** the "In the record" section renders at `summary` depth, so a summary reader sees *"A task you can't see"*. That is ADR-0033 D2's count-never-name, decided in the definer (`hc.document_references`'s `where x.level >= 'log'` floor and its paired `case when x.level >= x.need`), and the page merely renders what the DB returns. It does sit in slight tension with settled item 2's *"nothing that implies more"* — a count is a disclosure that something exists — but that tension was ruled at round 24 and belongs in the ADR, not here.
- **The unshare route does not scope `share_id` to the document in the path.** `unshareDocument(claims, shareId)` passes the share id alone; `hc.revoke_share` authorizes by "the granter, or a live coordinator of the circle" and never consults the object. So a coordinator who holds any share id can revoke it by POSTing to any `/[circle]/documents/[anyDoc]/unshare/submit` — including a share on a task, an episode, or a document in a domain she cannot see. The DB gate is the settled one (round 24, D19.1/D19.2) and the app opens no door the DB closes, so this is not a defect; the observable app-layer consequence is that the redirect then renders *"Unshared. They lose it from their next look at the record."* on a document that had nothing to do with the revoked share. Cheap hardening if the round wants it: pass the document id and refuse when `result.object_id !== documentId`.
- **The recategorise and unshare routes never check that the path's `circle` owns the path's `document`.** The circle segment is used only to build the redirect. No authorization consequence (the definers resolve the object themselves), but a mismatched pair lands the person on a 404 after a successful write.
- **`shareCandidates` offers the caller herself.** `hc.circle_people` filtered to `kind = 'member'` with no exclusion of `v_me`; `tests/hc/documents.test.ts` names this deliberate ("a rendering choice, not a permission"). `hc.share_object` would happily insert a self-share, which is inert but shows up in the shares list and the log. Worth one line of `filter` if the round agrees it is noise.
- **`?subject=` is interpolated into hrefs unencoded** (`keepSubject = &subject=${subject}`). React escapes attribute values so this is not injection, and `documentsFor` UUID-validates before the DB — recorded only because F-5's empty-state consequence rides on the same unvalidated pass-through.
- **The e2e leg titled "re-categorise: … (DOC-03, AC-DOC-6)" claims an AC whose refusal half it does not exercise** (it drives the founder, manage×5). Folded into F-1's "why the tests miss it", recorded here because the title→assertion gap is the pattern the round is asked to hunt: read alone, the leg title reads as evidence for AC-DOC-6 entire.

### R3 — the step-up consumers, adjust, and send-again (model: Opus)
> **Independently verified:** read whole, at `ccd854b` — `app/(app)/[circle]/people/[member]/page.tsx`, `.../[member]/grant/submit/route.ts`, `.../people/invites/[invite]/again/submit/route.ts`, `.../people/page.tsx`, `.../people/log/page.tsx`, `lib/hc/people.ts`, `lib/permissions/phrases.ts`, `lib/permissions/tiers.ts`, `lib/auth/redirect.ts` (`safeNext`), `lib/auth/http.ts` (`redirect303`), `app/account/step-up/submit/route.ts`, `lib/hc/step-up.ts`, `app/(app)/[circle]/invite/page.tsx`, `app/(app)/[circle]/invite/submit/route.ts`; the assign route's consumer pattern (`app/(app)/[circle]/tasks/[task]/assign/page.tsx` step-up form) and the document-share form as the two sibling consumers. From `supabase/migrations` (unchanged, read as the enforcement authority): `hc.set_grant`, `hc.mint_step_up`, `hc.consume_step_up`, `hc.tier_defaults`, `hc.create_invite`, `hc.revoke_invite`, `hc.accept_invite`, `hc.circle_people` + `hc.member_levels` + `hc.member_levels_frozen`, `hc.shares_for_member`. Tests read whole: `tests/hc/people.test.ts`, `tests/routes/member-detail.test.ts`, `tests/routes/people.test.ts`, `tests/permissions/phrases.test.ts`, the `tests/lint/answer-budget.test.ts` diff, the `tests/app/page-gate.test.ts` entries for both new routes, and `e2e/people.spec.ts` (all seven leg titles; the *adjust* leg body line by line). No script, test, or stack command was run.
> **Taken on trust:** that `supabase/` is byte-identical to `18c362d` (brief's assertion, not re-diffed); the D11 gate tallies and that leg *"adjust: a raise through step-up, a lower without; the care ceiling never offered above (PPL-02, AC-PERM-5)"* passed green at r5 — no run performed; that pgTAP STP-01/02 pin `hc.consume_step_up`'s cross-operation and cross-target refusals (not read — the app-side binding I did verify by construction); `hc.visible_at`'s ladder and `hc.remove_member`'s grant/share teardown (other lenses); `myMembership`'s tier being the caller's true tier; GoTrue's password verification inside `/account/step-up/submit`.
> **Verdict:** D6's raise gate holds exactly where it must — the app's raise/lower arithmetic is advisory, `hc.set_grant` re-decides against the live `access_grants` row and re-binds the token to `member:subject:domain`, so no forged `rs/rd/rl`, no TOCTOU-stale "lower", and no replayed or cross-bound cookie moves a level — but the SURFACE tells two things the database never said (a no-op reported as *"written in the family's log, with both levels"*, and every step-up failure swallowed into silence), and D4's send-again ships with no behavioural test at any layer.

#### R3 findings, most severe first

##### R3/F-1 — MAJOR — the grant route reports `changed=1` for a post the definer treated as a quiet no-op, so the surface asserts a log entry that AC-PERM-5's writer deliberately did not write
**Confidence.** High; not contingent — both halves are on the disk I read.
**Where.** `app/(app)/[circle]/people/[member]/grant/submit/route.ts` — `POST`, the success arm; `app/(app)/[circle]/people/[member]/page.tsx` — `noticeFor`; `supabase/migrations/20260818120004_grants_revocation.sql` — `hc.set_grant`'s no-op arm. e2e leg *"adjust: a raise through step-up, a lower without; the care ceiling never offered above (PPL-02, AC-PERM-5)"*.
**Claim under test.** Plan C4 (BINDING): *"every change appears in the access log with actor, target, subject, domain, both levels (AC-PERM-5 — rendered, since GRT-01 already writes it)"*. Route header: *"The ceiling, the coordinator gate and the log entry with both levels are all the definer's."*
**What I found.** `hc.set_grant` short-circuits before any logging:

```
  if p_level = v_before then
    -- a quiet no-op: nothing changes, nothing logs, no token demanded
    return jsonb_build_object('member_id', p_member_id, ..., 'changed', false);
  end if;
```

The route discards that return value entirely:

```
        await budget.race(setGrant(claims, memberId, subjectId, domain, level, token), 'setGrant');
      ...
      const res = redirect303(req, `${back}?changed=1`);
```

and the page turns `changed=1` into a `role="status"` assertion:

```
  if (sp.changed === '1') return { kind: 'status' as const, text: "Changed. It's written in the family's log, with both levels." };
```

`setGrant`'s signature returns `Promise<unknown>` and no caller reads `changed`.
**Failure scenario.** Sarah opens `/{circle}/people/{ruth}`. The matrix renders every domain's radio with `defaultChecked={l === current}`, so *health* already shows `summary` checked. She clicks the **Change** button under *schedule* (or under *health*) without moving a radio — the one interaction the pre-checked form invites. The post carries `level = current`; `raising` is false, no token is demanded, `hc.set_grant` returns `changed:false` and writes nothing to `access_log`. She is redirected to `?changed=1` and reads **"Changed. It's written in the family's log, with both levels."** She then opens `/{circle}/people/log` — the entry is not there. Two false statements on the two surfaces the slice exists to make honest. The same path is reached without any misclick when a peer coordinator raises the level between her `e=step-up` bounce and her *Raise it* click: `raising` recomputes false, the token goes unused, the definer no-ops, and the screen still says the change was logged.
**Why the tests miss it.** `tests/routes/member-detail.test.ts` → *"a LOWER posts straight through — no token demanded"* posts `health: 'log'` against a fixture whose current level is `summary` — always a real change — and mocks `setGrant` to resolve `{}`, a value with no `changed` field, so the test could not distinguish the two outcomes even if the route inspected it. `tests/hc/people.test.ts` exercises `hc.set_grant`'s changing arms only; no test at any layer posts `level === current`. The e2e adjust leg always `.check()`s a different radio before clicking. Ask the quality question: if the definer's no-op arm were deleted, every existing assertion would still pass.
**What would close it.** No DDL. Read `setGrant`'s returned jsonb and redirect to `?changed=1` only when `changed === true`, with a distinct honest marker (and page copy) for the no-op — plus a route test posting `level === current` against a mock returning `{changed:false}`, and a live test asserting `access_log` gained no row.

##### R3/F-2 — MAJOR — every failure of the raise's step-up round-trip is swallowed: `/account/step-up/submit` appends `?e=…` to a `next` that already carries a query, so the marker lands inside `rl`, the raise section disappears and the coordinator is told nothing
**Confidence.** High for the mechanism (pure string composition, both sides read); the browser-observed silence is CONTINGENT on nothing beyond Next's standard `searchParams` parsing of a duplicated `?`.
**Where.** `app/(app)/[circle]/people/[member]/page.tsx` — the step-up form's `<input type="hidden" name="next" …>`; `app/account/step-up/submit/route.ts` — the `e=missing` / `e=throttled` / `e=nomatch` arms; `lib/auth/http.ts` — `redirect303`. e2e leg *"adjust: a raise through step-up, a lower without; the care ceiling never offered above (PPL-02, AC-PERM-5)"* (happy path only).
**Claim under test.** ADR-0037 D6: *"a raise rides the `hc-step-up` cookie (the assign route's consumer pattern) … three params now, validated against the domain/level sets."* D3's standing rule, R5/F-7: *"every `e=slow` marker READ by its page."*
**What I found.** The page posts a `next` that already has a query string:

```
                  <input type="hidden" name="next" value={`${next}?${raise}`} />
```

with `next = "/${circle}/people/${memberId}"` and `raise = "rs=…&rd=…&rl=…"`. `safeNext` passes it (a leading `/`, no `:`, no `\`). Every failure arm of the step-up route then does:

```
  if (!password || !operation) {
    return redirect303(req, `${next}?e=missing`);
  }
  ...
    return redirect303(req, `${next}?e=throttled&wait=${throttle.wait_seconds}`);
  ...
    return redirect303(req, `${next}?e=nomatch`);
```

producing `Location: /{circle}/people/{member}?rs=S&rd=health&rl=view?e=nomatch`. The second `?` is a legal query character, so `rl` parses as `"view?e=nomatch"`, and the page's own validation drops it:

```
      const raiseLevel =
        typeof sp.rl === 'string' && (LEVELS as readonly string[]).includes(sp.rl) ? sp.rl : null;
```

`raiseLevel` is null → `raise` is null → the whole `Raise access` section is not rendered; `sp.e` is `undefined` → `noticeFor` returns null.
**Failure scenario.** Sarah selects *view* on Nell's finances for Ruth, clicks **Change**, is bounced to `?…&e=step-up` and reads *"Raising access needs a fresh confirmation that it is you."* She mistypes her password. She is returned to the member page with **no message, no password field, and no raise section** — indistinguishable from having navigated there herself. Nothing tells her the password was wrong, and she must re-drive the matrix to find out. Repeat it five times and `hc.auth_throttle` locks her out; the `e=throttled&wait=N` copy that would say *how long* is discarded by the same mechanism, so the lockout is invisible too.
**Why the tests miss it.** No unit test drives `/account/step-up/submit`'s failure arms with a 7C `next`; `tests/routes/member-detail.test.ts` never renders the page with a mangled `rl`. The e2e leg types `PASSWORD` (the correct one) and asserts only `toBeVisible()` on *Raise it* — a green run proves the success path and says nothing about the other three. Precedent, said honestly: 7B's assign page already posts `next` with a query (`const here = \`${back}/assign?member=…\``), so the collision class is inherited, not invented here — but 7C is where it lands on the §5.7 grant path, and 7C's document-share form (`value={\`${next}?share=${shareTarget.member_id}\`}`) carries it too.
**What would close it.** No DDL. Either make the step-up route compose its marker with `URL`/`URLSearchParams` instead of string concatenation (one shared fix for all three consumers), or have each caller pass a `next` with no query and carry the raise in the cookie's `target_ref` round-trip. Pin it with a route test asserting the `nomatch` Location parses back to `rl=view` plus `e=nomatch`, and a page test asserting the notice renders.

##### R3/F-3 — MINOR — `rs` is the one raise param left unvalidated and it is interpolated UN-ENCODED into the step-up `next`, so a crafted link makes the member page assert *"Changed. It's written in the family's log"* right after the coordinator types her password
**Confidence.** High for the mechanism; medium for exploit value — it needs the coordinator to follow a crafted same-origin link and enter her password, and it gains no access.
**Where.** `app/(app)/[circle]/people/[member]/page.tsx` — `raiseSubject` / `raise` / the step-up form's `next`.
**Claim under test.** ADR-0037 D6: *"three params now, validated against the domain/level sets."*
**What I found.** Two of the three are validated against their sets; the subject is not, and is not shape-checked either:

```
      const raiseSubject = typeof sp.rs === 'string' ? sp.rs : null;
      const raiseDomain =
        typeof sp.rd === 'string' && DOMAINS.includes(sp.rd as Domain) ? sp.rd : null;
      const raiseLevel =
        typeof sp.rl === 'string' && (LEVELS as readonly string[]).includes(sp.rl) ? sp.rl : null;
      const raise =
        raiseSubject && raiseDomain && raiseLevel
          ? `rs=${raiseSubject}&rd=${raiseDomain}&rl=${raiseLevel}`
          : null;
```

`raiseSubject` is concatenated raw into `raise`, and `raise` raw into the posted `next` (F-2's line). Nothing URL-encodes it, so an `&` inside `rs` becomes a parameter separator in the destination the step-up route redirects to. (React escapes the attribute, so there is no markup injection, and `safeNext` still forbids `:`/`\`/`//`, so the destination cannot leave the origin or change path — only gain query params.)
**Failure scenario.** Sarah opens `/{circle}/people/{ruth}?rs=zz%26changed=1&rd=health&rl=view`. The page renders the *Raise access* password form with `next = /{circle}/people/{ruth}?rs=zz&changed=1&rd=health&rl=view`. She enters her password; a real `raise_grant` token is minted and bound to `ruth:zz:health`; she is redirected to that `next` and reads the green status **"Changed. It's written in the family's log, with both levels."** — with nothing changed, nothing logged, and a live step-up cookie sitting on a subject id that does not exist. The route would refuse the follow-up post (`UUID_RE` rejects `zz`) and the DB would refuse anyway (`consume_step_up` matches `target_ref` exactly), so no access moves — the defect is the false assertion on the access-control surface at the exact moment she proved her identity.
**Why the tests miss it.** `tests/routes/member-detail.test.ts` renders the page only with `{}` and `{remove:'1'}`; no test passes a hostile `rs`. The e2e legs only follow URLs the route itself emitted (where `subjectId` is already `UUID_RE`-validated).
**What would close it.** No DDL. Validate `rs` with the same `UUID_RE` the route uses, and build the query with `URLSearchParams` rather than template concatenation. Pin with a render test asserting a non-UUID `rs` renders no raise section.

##### R3/F-4 — MINOR — the matrix reads `levels === null` ("not yours to know" / frozen) as `hidden`, so under a freeze it would state every level as *Nothing* and force a password step-up on the lower that is the remedy
**Confidence.** High for the code path; the whole finding is CONTINGENT on a freeze existing — I grepped `app/` and `lib/` for `freezes` / `freeze_active` / `request_freeze` and found **no** app caller, so the state is reachable today only by direct DB action or by a later slice's findings surface.
**Where.** `app/(app)/[circle]/people/[member]/page.tsx` — the matrix's `current`; `app/(app)/[circle]/people/[member]/grant/submit/route.ts` — the route's `current`; `lib/hc/people.ts` — the `PersonRow.levels` doc comment; `supabase/migrations/20260829120005_round24_m5_reads.sql` — `hc.circle_people` / `hc.member_levels_frozen`.
**Claim under test.** `hc.circle_people`'s own contract (M4 header): *"null, not hidden, so 'not yours to know' and 'he has none' cannot be confused."* And `hc.set_grant`'s recorded asymmetry: *"LOWERING never does [require a token] — revocation must not be gated on re-auth friction."*
**What I found.** Both consumers collapse the two states with `??`:

```
                  const current = person.levels?.[s.subject_id ?? '']?.[d] ?? 'hidden';
```
```
        current = person.levels?.[subjectId]?.[domain] ?? 'hidden';
```

`hc.circle_people` sets `levels` to null under a circle-wide freeze (`v_frozen_all`) and `hc.member_levels_frozen` nulls the entry of any subject a narrowed unresolved finding names. The page has no freeze awareness and renders no freeze notice. Note the People **list** handles the same null correctly — `subjectLines` returns `[]` and `plainLine(null)` returns `''` — so the two 7C surfaces disagree about the same value.
**Failure scenario.** An unresolved finding is raised against Nell. Sarah opens `/{circle}/people/{ruth}` to execute it. Ruth holds `manage` on health; the matrix shows **Nothing** checked for every domain — a false statement about access on the surface whose job is stating access. Sarah selects *sees everything* (view) to lower her: the route computes `current='hidden'`, `LEVEL_RANK['view'] > 0`, classifies the LOWER as a raise, and bounces her to `e=step-up` for a password — friction the DB deliberately refuses to impose on revocation. If instead she selects *full access* (a genuine raise), the definer answers `freeze_active`, which the route flattens to `?e=refused` → *"That change couldn't be made just now."* — the freeze never named.
**Why the tests miss it.** The `member-detail` fixture's `base.levels` is `null` but all three PEOPLE rows override it, and no test renders the member page or posts to the grant route for a member whose `levels` is null. `tests/routes/people.test.ts` does have *"a null levels map renders NO line"* — for the list only. `tests/hc/people.test.ts` creates no freeze.
**What would close it.** No DDL. Distinguish `levels == null` (or a null subject entry) from an absent domain: render the frozen state as its own sentence with no radios rather than as *Nothing*, and have the route refuse rather than guess when the baseline is unknown. Pin with a render test for a null-levels member and a route test asserting the unknown baseline is not silently treated as `hidden`.

##### R3/F-5 — MINOR — send-again (D4) has no behavioural test at any layer; the declared `retireInvite` mock in `tests/routes/people.test.ts` is never used, and the route will retire a LIVE invite while the landing copy says the expired one was withdrawn
**Confidence.** High — the absence is mechanical and the copy is verbatim.
**Where.** `app/(app)/[circle]/people/invites/[invite]/again/submit/route.ts`; `app/(app)/[circle]/invite/page.tsx` — the `resend` notice; `tests/routes/people.test.ts` — the unused mock; `supabase/migrations/20260818120003_invites_lifecycle.sql` — `hc.revoke_invite`.
**Claim under test.** ADR-0037 D4: *"`retireInvite` revokes through `hc.revoke_invite` — the wrapper's first caller — and the coordinator lands on the EXISTING invite form prefilled with address and tier."* Plan C3: *"expired ones as `Invite expired · send again`."*
**What I found.** `tests/routes/people.test.ts` declares the mock and never touches the route:

```
const peopleHc = {
  circlePeople: vi.fn(),
  retireInvite: vi.fn(),
};
```

`retireInvite` is never referenced again in that file; there is no `again/submit` describe block, no assertion that revoke precedes the redirect, and no assertion on the prefill URL's shape or `encodeURIComponent`. `tests/app/page-gate.test.ts` lists the route but only proves its auth gate. `e2e/people.spec.ts` has seven legs and none of them is a send-again. The only coverage anywhere is the `retireInvite` **wrapper** in `tests/hc/people.test.ts`. Separately, `hc.revoke_invite`'s predicate carries no expiry term —

```
   where i.id = p_invite_id
     and i.accepted_at is null
     and i.revoked_at is null
     and exists (select 1 from public.circle_members m … and m.tier = 'coordinator')
```

— while the surface offers the control only on the non-pending branch, and the landing page states the outcome unconditionally: *"The expired invite was withdrawn."*
**Failure scenario.** A coordinator posts (or a stale/hand-built form posts) `again/submit` with a **pending** invite id: the live token is killed, the invitee's link stops working, and she is told *"The expired invite was withdrawn."* about an invite that had four days left. More importantly for the round: because nothing at the route layer is pinned, the D4 property that matters — *revoke lands BEFORE the redirect, so no window exists in which the old token is alive and the coordinator believes it retired* — rests entirely on reading the source. Reorder those two statements and every test in the tree still passes.
**Why the tests miss it.** Named above: the route has no test, only a gate entry and an unused mock.
**What would close it.** No DDL. Add a route test (revoke called, then the prefill Location; refused and slow arms), and either gate the route on `invite_status === 'expired'` from `hc.circle_people` or make the landing copy say what actually happened. The unused `retireInvite` mock is itself the tell and should either be driven or deleted.

##### R3/F-6 — MINOR — the AnswerBudget enumerated pin gained `documents` but not `people`, so the slice's largest new tree sits outside the scanner C6 says holds the class
**Confidence.** High; mechanical.
**Where.** `tests/lint/answer-budget.test.ts` — `RECORD_TREES`.
**Claim under test.** Plan C6 (BINDING): *"an `AnswerBudget` on every 7C page and POST."* ADR-0026: *"if it can be a scanner, a manifest, or an exact-set assertion, it must be."*
**What I found.** The diff adds one tree:

```
-const RECORD_TREES = ['app/(app)/[circle]/tasks', 'app/(app)/[circle]/timeline'];
+const RECORD_TREES = [
+  'app/(app)/[circle]/tasks',
+  'app/(app)/[circle]/timeline',
+  'app/(app)/[circle]/documents',
+];
```

`app/(app)/[circle]/people` is absent. I checked all six files under that tree by hand: every one carries `withPageBudget(` or `withRouteBudget(` today, so the STATE is correct — it is the GUARANTEE that is missing. `people/log`, `people/subject/[subject]`, `people/[member]`, `people/[member]/grant/submit` and `people/invites/[invite]/again/submit` are all unscanned.
**Failure scenario.** Slice 8 adds `app/(app)/[circle]/people/…/search/page.tsx` without a budget. `tasks`, `timeline` and `documents` still scan clean, the suite is green, and the C4/C5 surfaces silently lose the class the row promised. Equally, deleting `withRouteBudget` from the grant route today breaks no test.
**Why the tests miss it.** The scanner is the test; its enumeration is the gap.
**What would close it.** No DDL. Add `'app/(app)/[circle]/people'` to `RECORD_TREES` in the same commit that adds the tree.

##### R3/F-7 — MINOR — the ceiling filter and the raise/lower arithmetic ride `LEVEL_RANK` and two hand-written enum literals, none of which is pinned to the live enums the sibling constants in the same module are pinned to
**Confidence.** High; fail-closed at the DB in every case I could construct, which is why this is MINOR and not more.
**Where.** `lib/permissions/phrases.ts` — `LEVEL_RANK`; `app/(app)/[circle]/people/[member]/page.tsx` — `DOMAINS`, `LEVELS`, `optionsFor`; `app/(app)/[circle]/people/[member]/grant/submit/route.ts` — `DOMAINS`, `LEVELS`; `tests/permissions/phrases.test.ts`.
**Claim under test.** ADR-0037 D6: *"The care-circle ceiling comes from the ONE tiers module, offers NOTHING above itself and no other domain."* D5: the phrases module is *"pinned LIVE against the enum and `hc.tier_defaults`."*
**What I found.** The live pin covers key SETS only:

```
    expect(Object.keys(phrases.LEVEL_WORD).sort()).toEqual(worded);
    expect(Object.keys(phrases.LEVEL_PHRASE).sort()).toEqual(worded);
    expect(Object.keys(phrases.DOMAIN_LABEL).sort()).toEqual(enumDomains);
```

Nothing asserts `LEVEL_RANK`'s **ordering** against `enum_range(null::hc.access_level)`, and `LEVEL_RANK` is what decides both what the matrix offers —

```
      const optionsFor = (d: Domain) =>
        LEVELS.filter((l) => (ceiling ? LEVEL_RANK[l] <= LEVEL_RANK[ceiling.get(d) ?? 'hidden'] : true));
```

— and whether a post is a raise (`LEVEL_RANK[level] > LEVEL_RANK[current]`). The two `DOMAINS`/`LEVELS` literals are re-declared independently in the page and the route (and a third time as `ALL_DOMAINS` in `phrases.ts`, a fourth as the `Domain` type in `tiers.ts`), and the route's `DOMAINS` Set is the app's only domain validation before the DB.
**Failure scenario.** A sixth rung is added to `hc.access_level` between `summary` and `view` (the enum is append-ordered, but `enum_range` order is what `>` compares). `LEVEL_RANK` still ranks the old five, so `optionsFor` computes the care ceiling against a stale ladder and can OFFER a rung above `hc.tier_defaults('care_circle')` — the exact thing plan C4 says must never be offered. The DB refuses it (`p_level > v_cap`), so nothing widens; the surface promises something it cannot deliver, and the phrases suite stays green because it only checks key sets.
**Why the tests miss it.** `tests/permissions/phrases.test.ts` never reads the enum's order. `tests/routes/member-detail.test.ts`'s ceiling test asserts `not.toContain('value="view"')` against today's rank table, so it moves with the bug.
**What would close it.** No DDL. Assert `Object.entries(LEVEL_RANK)` sorted by rank equals `['hidden', ...enum_range order]` in the live phrases test, and derive the route's/page's `DOMAINS`/`LEVELS` from the pinned module rather than re-declaring them.

##### R3/F-8 — OBS — the member page decides which raise form to show on the mere PRESENCE of an `hc-step-up` cookie, so a step-up minted for a different operation produces a generic refusal and burns both step-ups
**Confidence.** High for the sequence; OBS because nothing widens and the token itself is opaque to the app by design.
**Where.** `app/(app)/[circle]/people/[member]/page.tsx` — `const stepUp = (await cookies()).get(STEP_UP_COOKIE)?.value ?? null;` and the `{stepUp ? <Raise it form> : <password form>}` branch; `app/(app)/[circle]/people/[member]/grant/submit/route.ts` — `clearStepUp`.
**What I found.** One cookie name serves three operations (`raise_grant`, `share_object`, `share_document`); only `hc.consume_step_up` can tell them apart, and the route clears the cookie on the refusal path as well as the success path.
**Failure scenario.** Sarah starts a document share (`/documents/{D}` → password → cookie bound to `share_object` / `document:D`, 300 s), then navigates to People before completing it and raises Ruth's health. The page sees a cookie and renders **Raise it** rather than the password prompt; the route posts the share token to `hc.set_grant`; `consume_step_up` fails on the operation mismatch; the coordinator gets *"That change couldn't be made just now."* with no reason, **and** her unrelated share step-up is cleared out from under her. Fail-closed and low-harm — recorded because it is the one place the app reasons about a token it cannot inspect.

#### R3 confirmations

- **Forging `rs/rd/rl` (attack 1a/1d).** The route validates all three before any DB call — `UUID_RE.test(subjectId) && DOMAINS.has(domain) && LEVELS.has(level)`, else `?e=refused` — and `hc.set_grant` re-derives the binding itself as `p_member_id::text || ':' || p_subject_id::text || ':' || p_domain::text`, matching the page's `target_ref` exactly. `hc.consume_step_up` matches on `token_hash`, `account_id`, `operation` **and** `target_ref is not distinct from p_target_ref`, so a token minted for M1/S1/D1 cannot raise S2, D2 or M2. The app never verifies the binding and does not need to: it is not a checkpoint the attacker can pass. A non-coordinator who mints her own `raise_grant` token (`hc.mint_step_up` is granted to `authenticated` and takes any operation from the CHECK list) still hits `hc.set_grant`'s live-coordinator-of-the-target's-circle test and gets `grant_refused`.
- **TOCTOU on lower-vs-raise (attack 1b).** Decided server-side, in the same request, from `circlePeople` — never at render time and never from the client. More importantly the decision is *advisory*: `hc.set_grant` re-reads `v_before` from `public.access_grants` under `pg_advisory_xact_lock(hashtext('taint:'||circle))` and demands the token itself. I constructed the stale-lower case (render at `view`, peer lowers to `log`, post `summary` with no token): the DB sees `summary > log`, finds `p_step_up_token is null`, and refuses. Every divergence between the app's arithmetic and the definer's resolves toward refusal.
- **Replay and expiry (attack 1c).** `hc.consume_step_up` is the atomic conditional `UPDATE … where … expires_at > now() and consumed_at is null returning token_hash` — of two racers exactly one wins, and a second presentation of the same token updates zero rows. The mint enforces a ≤ 300 s `amr` freshness, `expires_at = now() + 5 minutes`, and the cookie is `Max-Age=300; HttpOnly; SameSite=Lax`. The route clears the cookie on **both** the success and the refusal arm of a raise (`return raising ? clearStepUp(res) : res;` in both places), and `tests/routes/member-detail.test.ts` pins both.
- **The care-circle ceiling, both halves (attack 2).** The surface: `TIERS.care_circle.defaultGrants` is `[{schedule, summary}]`, so `offeredDomains` collapses to `['schedule']` and `optionsFor('schedule')` to `hidden|log|summary` — no other domain and nothing above `summary` is rendered, and the ceiling sentence comes from the same module. The DB: `if v_target.tier = 'care_circle'` caps against `hc.tier_defaults('care_circle')` and raises `grant_refused` above it. **And the live test is honest** — I checked the ordering question specifically: `hc.set_grant` evaluates the ceiling *before* the token check, so I asked what `tests/hc/people.test.ts` → *"the care-circle ceiling holds in the DATABASE: a raise above it is refused even with a valid token"* would do if the ceiling were removed. The token it mints is correctly bound (`${member.marisol}:${nell}:schedule`, operation `raise_grant`, fresh `amr`) and the seeded baseline is `summary`, so without the cap the token would be consumed and the grant would land at `view` — the test would fail. It discriminates. No non-care tier is offered above a bound the plan states: the plan states a ceiling only for care_circle, and `family`/`coordinator` correctly get the full ladder (`hc.tier_defaults('family')` is a starting point, not a cap — PRD §7.4 / the invite copy *"You can raise this any time"*).
- **Send-again: the old token is dead (attack 3a).** `retireInvite` awaits `select hc.revoke_invite($1)` **before** returning the prefill, and the route awaits `retireInvite` before its `redirect303`. `hc.revoke_invite` stamps `revoked_at`, and `hc.accept_invite`'s single-use conditional UPDATE carries `and i.revoked_at is null and i.expires_at > now()` — a retired token updates zero rows and the whole transaction aborts. Nothing in `app/(auth)/accept/[token]` can consume it.
- **Send-again cannot silently widen scope (attack 3b).** The invite page prefills only `invited_email` (`defaultValue`) and `tier` (`defaultChecked`); the `subject_ids` checkboxes render **unchecked**, and `hc.create_invite` refuses an empty subject array — so the coordinator must tick them herself. The token still rides the `hc-invite-token` cookie (`Max-Age=120; HttpOnly; SameSite=Lax; Path=/{circle}/invite`), never a URL, through the one create path. D4's *"the request role holds NO grant on `public.invites`"* is true on the disk: `invites_lifecycle` grants select/insert/update to `hc_internal` only, and `retireInvite` reads the address and tier out of `hc.circle_people`, not the table. (Recorded as an observation below: the old scope is not *shown*, so the re-choice is conscious but uninformed.)
- **Send-again authorization and the race (attack 3c/3d).** Coordinator-only twice over: `hc.circle_people` emits invite rows only under `where v_coord …`, so a non-coordinator's `retireInvite` finds zero rows and throws `invite_refused` before `hc.revoke_invite` is reached; and `hc.revoke_invite` re-checks the live-coordinator `exists(...)` inside its own UPDATE. `tests/hc/people.test.ts` proves the pair and asserts `revoked_at` is still null afterwards. Two concurrent send-agains cannot produce two live tokens: the second `hc.revoke_invite` matches zero rows (`revoked_at is null` fails), raises, and the route answers `?e=refused` without ever reaching the prefill.
- **The adjust matrix and AC-PERM-5's write path (attack 4).** The current level is the `defaultChecked` radio (`defaultChecked={l === current}`); the option words come from `LEVEL_WORD`/`DOMAIN_LABEL` (the ONE module) and the ceiling sentence from `TIERS.care_circle.ceiling`. The write goes **through** `hc.set_grant` — `lib/hc/people.ts`'s `setGrant` issues exactly `select hc.set_grant($1,$2,$3::hc.domain,$4::hc.access_level,$5)` and no route touches `public.access_grants` — so the log entry with both levels is the definer's, and `app/(app)/[circle]/people/log/page.tsx` renders it as *"X changed what Y can see of Z's health: summary → activity only · date"*, both levels present. `tests/hc/people.test.ts` asserts `{b:'summary', a:'log'}` straight out of `access_log`. (The one hole in this is F-1: the no-op that logs nothing and is still announced as logged.)
- **The one 404.** `if (!person || me?.tier !== 'coordinator') notFound();` — an unknown member, a subject row and a non-coordinator's hand-built URL are one shape, pinned by two tests and by the NAV-01 leg. The grant route holds no coordinator check of its own, correctly leaving it to the definer; I checked for an enumeration oracle in the differing `e=step-up` vs `e=refused` Locations and found none that `hc.circle_people` does not already hand every member.

#### R3 recorded dissents and observations

1. **Not a defect, a design consequence worth the round's eye:** the step-up token binds `member:subject:domain` but **not the level**. A token minted to raise Ruth's health to `summary` will consume against a post of `manage` for the same triple, because the level travels in the URL (`rl`) rather than in `target_ref`. The app cannot fix this alone — `hc.set_grant` computes `target_ref` itself — so if the owner wants level-bound step-up it is a slice-8 DDL question, not an app fix. I record it because F-3 shows `rs` is attacker-shapeable and `rl` is only set-validated: a crafted link that raises the level a coordinator *thinks* she confirmed is the shape this binding does not cover.
2. `hidden` gets a word in two places outside the ONE module that deliberately refuses it one — `LEVEL_OPTION_WORD = { ...LEVEL_WORD, hidden: 'Nothing' }` on the matrix and `levelWord()`'s `level === 'hidden' ? 'nothing'` on the log. Both are arguably necessary (a radio and a `before → after` sentence need a token for the floor), but D5's claim is *"hidden HAS no word by design, so an unworded level can never leak into a sentence"* and the log renders `nothing → activity only` in a sentence. D5 is another lens's; recorded, not filed.
3. The re-choice of subject scope on send-again is conscious but **uninformed**: the coordinator is never shown which records the retired invite covered, while the **tier** — the thing that sets the ceiling — *is* prefilled. The asymmetry means "send again" can cover more records than the invitee was originally offered, with no screen ever naming the difference. D4 calls this *"a narrowing, named"*, which reads as a narrowing of the delivered feature rather than of the scope; the plan's C3 row says only *"send again is a new invite, never a resurrected token"*, which is satisfied. Dissent, not a finding.
4. `?resend=1` is unauthenticated state on the invite page: navigating to `/{circle}/invite?resend=1` renders *"The expired invite was withdrawn."* when nothing was withdrawn. Self-inflicted only; noted beside F-5 rather than filed separately.
5. `?rl=hidden` is accepted by the page's validation, so a hand-built URL renders a section headed **Raise access** whose copy reads *"This raises what X can see"* for a change that deletes the grant. The route never emits `rl=hidden` (`LEVEL_RANK['hidden'] > n` is never true), so this is reachable only by hand.
6. The `hc-step-up` cookie carries no `Secure` attribute (`app/account/step-up/submit/route.ts`, unchanged by this increment) — consistent with the repo's other cookies and with local http dev, and G4/G7 keep production unactivated, so it is not 7C's to fix. Recorded so it is not re-derived as new.
7. `tests/routes/member-detail.test.ts`'s fixture gives Ruth a partial levels map (`{health, schedule}`) where `hc.member_levels` returns **all five domains explicit with `hidden` spelled out**. The `?? 'hidden'` in the page absorbs the difference, so nothing breaks — but the plan's test surface asks for *"a rendered row from a fixture whose column names are the DDL's, not invented"*, and this fixture's *shape* is not the definer's. Cosmetic; recorded.

### R4 — the phrases module, People surfaces, nav, subject page, and the log (model: Opus)
> **Independently verified:** every file in my lens read whole at `ccd854b` — `lib/permissions/phrases.ts`, `lib/permissions/tiers.ts` (the type source), `lib/hc/people.ts`, the four People pages (`people/page.tsx`, `people/[member]/page.tsx`, `people/log/page.tsx`, `people/subject/[subject]/page.tsx`), `people/[member]/grant/submit/route.ts`, `components/shell/nav-manifest.ts`, `components/shell/LeftNav.tsx`, `app/(app)/[circle]/layout.tsx`, the receipt half of `inbox/[arrival]/page.tsx`, and (as the receipt's declared destinations) `timeline/page.tsx` + `timeline/[event]/page.tsx` + `lib/hc/timeline.ts#listEvents`. Tests read whole: `tests/permissions/phrases.test.ts`, `tests/routes/people.test.ts`, `tests/routes/access-log.test.ts`, the 7C diffs of `tests/routes/arrival.test.ts`, `tests/design/shell.test.tsx`, `tests/app/page-gate.test.ts`, and the leg titles + bodies of `e2e/people.spec.ts` legs 5–7. DB side, read from `supabase/migrations` to check the surfaces add/subtract nothing: `hc.circle_people`, `hc.member_levels`, `hc.member_levels_frozen` (`20260829120005`), `access_log_select` (`20260817120001`), `hc.receipt_for` (`20260824120005`), `arrivals.subject_id not null` (`20260815230001:20`). Tree-wide greps run against the blob at `ccd854b` (`git grep … ccd854b`), never the working tree. `app/globals.css`'s `@media print` block read in full.
> **Taken on trust:** every gate tally and every e2e outcome (I ran nothing — READ-ONLY). `hc.set_grant`'s behaviour under a freeze (F-5's blast radius is CONTINGENT on it). `hc.visible_at`'s internals. The documents detail page's own read gate (F-1's fix-safety argument is CONTINGENT on it matching `hc.receipt_for`'s `>= summary`). The C2/C4 surfaces beyond the phrases/levels call sites I was told to trace.
> **Verdict:** The phrases module is the cleanest thing in the increment and D5/D9 survive attack intact — but D8 does not: *"opens in an upcoming update" is GONE from the tree* is false at the declared evidence head and the surviving instance is now a lie about a page 7C shipped; the episode receipt link cannot render its object in a multi-subject circle; and the log's undisclosed 300-row cap falsifies PPL-04's *"subtracts nothing"* on the one surface whose whole purpose is being a complete record.

#### R4 findings, most severe first

##### R4/F-1 — MAJOR — *"opens in an upcoming update"* is NOT gone from the tree: it survives as a live rendered sentence that 7C's own Documents page made false, and both D8 and RCP-02's green cell assert its absence
**Confidence.** high; not contingent. Verified by `git grep` against the blob at the declared evidence head, not the working tree.
**Where.** `app/(app)/[circle]/timeline/[event]/page.tsx:137` — the `Linked to` block of the event provenance `<dl>`. Claim sites: `docs/adr/0037-7c-sensitive-pair-deltas.md` D8; `docs/review/round-27-packet.md` D8; `docs/coverage.md:489` (RCP-02, **green**). Pins that cannot see it: `tests/routes/arrival.test.ts` — "a document destination links to THE DOCUMENT ITSELF (RCP-02)", "a profile fact links to the subject's page…", "an episode resolves to the Timeline, where its wrapper renders…".
**Claim under test.** D8: *"**"opens in an upcoming update"* is gone from the tree."* RCP-02's cell: *"…and *"its page opens in an upcoming update"* is GONE from the tree (`tests/routes/arrival.test.ts`, the three new pins)."*
**What I found.** `git grep -n "opens in an upcoming update" ccd854b -- app components lib` returns one live rendered string:
```tsx
{event.linked_documents.map((d) => (
  <span key={d.id}>
    <strong>{d.title}</strong> — its page opens in an upcoming update.{' '}
  </span>
))}
```
`git diff --stat 18c362d..ccd854b -- "app/(app)/[circle]/timeline/[event]/page.tsx"` is **empty** — 7C never touched the file. The coverage cell quotes the phrase in the *exact* form that survives (*"its page opens in an upcoming update"*), and names as its evidence three pins that render only `inbox/[arrival]/page` and therefore cannot observe another route's HTML. `linked_documents` is built in `lib/hc/timeline.ts` as `jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title))` over `public.documents` under RLS — so `d.id` is in hand at the exact line that says the page does not exist, and `/[circle]/documents/[document]` shipped in this slice (C2, `tests/app/page-gate.test.ts` now pins it).
**Failure scenario.** A family member opens a timeline event that was extracted from a discharge summary. The provenance block names the document and tells her *"its page opens in an upcoming update."* She has a receipt for that same document one screen away in the Care Inbox that links straight to `/[circle]/documents/<id>`, which loads. The product contradicts itself about whether a shipped surface exists, and withholds a link it is holding the id for.
**Why the tests miss it.** Nothing asserts the string's tree-wide absence. The three new pins are `expect(html).not.toMatch(/opens in an upcoming update/i)` against the *arrival* page's markup only. `tests/lint/` has no scanner for the phrase, and ADR-0026's *"if it can be a scanner… it must be"* is exactly the rule that would have caught it. No e2e leg opens a timeline event that has a linked document.
**What would close it.** No DDL. One line: replace the `<strong>` with `<a href={`/${circle}/documents/${d.id}`}>` (the same shape `receiptLine` now uses), plus a `tests/lint/` scanner asserting the phrase appears nowhere under `app/`, `components/`, `lib/` — comment-carved per traps §9. If the owner instead rules the timeline link out of scope, D8 and RCP-02's cell must both stop claiming the string is gone; the cell is green on an evidentiary sentence a `git grep` falsifies.

##### R4/F-2 — MAJOR — the episode receipt link resolves to the Timeline's DEFAULT thread, not the episode's subject: in a multi-subject circle it lands the reader where the wrapper cannot render, and the pin's title claims the half it does not assert
**Confidence.** high for the multi-subject mechanism (deterministic, no scale needed); medium for the two secondary mechanisms below. CONTINGENT on nothing — every line is in this diff or in `lib/hc/timeline.ts` at the evidence head.
**Where.** `app/(app)/[circle]/inbox/[arrival]/page.tsx:300-306` (the `episode` branch of `receiptLine`); `app/(app)/[circle]/timeline/page.tsx:182-186` (the subject default); `lib/hc/timeline.ts#listEvents` (`order by sort_at asc … limit 300`); `app/(app)/[circle]/timeline/page.tsx#Thread`; `supabase/migrations/20260824120005_receipt.sql` (the episode visibility predicate). Pin: `tests/routes/arrival.test.ts` — "an episode resolves to the Timeline, where its wrapper renders — a resolving link, never a dead one".
**Claim under test.** D8 / Q-B: *"an episode to the Timeline **where its wrapper renders**"*; Q-B's recommended answer: *"RCP-02's 'resolves to the created object' is met by the surface that renders it."*
**What I found.** The link is bare, and drops the subject the function already has in hand:
```tsx
if (r.object_type === 'episode') {
  return (<><a href={`/${circle}/timeline`}>{r.label}</a> — filed as an episode; it wraps its events on the Timeline.{corrected}</>);
}
```
`receiptLine(r, circle, subjectId)` was widened *in this diff* precisely so the profile-fact branch could reach `/people/subject/${subjectId}` — the episode branch two lines below ignores it. The Timeline then chooses its own subject:
```tsx
const subjectParam = requested === 'all' && subjects.length > 1
  ? 'all'
  : (subjects.find((s) => s.id === requested)?.id ?? subjects[0]?.id ?? 'all');
```
With no `?subject=`, `requested` is `''`, so the page renders **`subjects[0]`** — the founding subject's thread. Two further divergences compound it: (a) the wrapper renders only around events already in the read — `Thread` groups *consecutive rows sharing an episode* and emits nothing when the episode contributes no row — while `hc.receipt_for` grants `visible` on `hc.visible_at(…, 'episode', e.id, …) >= 'summary'` over the *episode's own* `subject_id`/`taint`; the episode row and its member events are two different predicates. (b) `listEvents` is `order by sort_at asc nulls last … limit 300` — the **oldest** 300; a freshly filed episode in a circle past that count is outside the window. The link also carries no fragment, and the wrapper `<section>` has a `key` and an `aria-label` but no `id`, so no anchor is even available.
**Failure scenario.** A circle with two subjects (Nell and Arthur — `subjects.length > 1` is an explicitly handled state; `SubjectLabel`/`subject_seq` exist for it). An arrival about Arthur is approved with an episode proposal, "The hospital week". The receipt renders the link, `visible: true`. The coordinator clicks it and lands on **Nell's** thread. Arthur's episode is not on the page at all. The receipt said the object was created and pointed at a surface that does not contain it.
**Why the tests miss it.** The pin's title carries the two-part claim; its body asserts one part: `expect(html).toContain(`href="/${CIRCLE}/timeline"`)` — a string match on the receipt page's own markup. It never renders the Timeline, so "where its wrapper renders" is asserted by the title alone. `e2e/people.spec.ts` has no episode leg, and the review legs' fixture is single-subject, so `subjects[0]` is trivially right there.
**What would close it.** No DDL. `href={`/${circle}/timeline?subject=${subjectId}`}` — `subjectId` is already the parameter — plus an `id` on the episode `<section>` and `#episode-<id>` on the link; and either a leg that follows the link in a two-subject circle, or an honest narrowing recorded in RCP-02's cell (see my Q-B answer). Note the first two mechanisms are independent: fixing the subject param does not fix the receipt-visible / event-invisible divergence.

##### R4/F-3 — MAJOR — the access log is capped at 300 rows with no disclosure, while the page calls itself "Everything" and PPL-04's green cell says the surface "subtracts nothing" and merely "orders what the policy decided"
**Confidence.** high; not contingent.
**Where.** `lib/hc/people.ts#accessLog`; `app/(app)/[circle]/people/log/page.tsx:110` and its lead paragraph at `:120-123`; `docs/coverage.md:561` (PPL-04, **green**) and `:247` (LOG-01's app half).
**Claim under test.** Plan C5 (BINDING): *"LOG-01 filters it by the reader's own access — **the surface adds nothing and asserts it subtracts nothing**"*. PPL-04's cell: *"the filter IS `access_log_select` (the surface adds nothing and subtracts nothing — `lib/hc/people#accessLog` **orders** what the policy decided)"*. `lib/hc/people.ts:107-112`'s own docstring repeats it: *"this read simply orders what the policy already decided."*
**What I found.** It does not simply order:
```ts
`${LOG_SELECT}
  where l.circle_id = $1
  order by l.seq desc
  limit $2`,
[circleId, Math.min(Math.max(limit, 1), 500)],
```
and the page calls it `accessLog(claims, circle, 300)`. There is no pagination control, no `?before=` cursor, no count, and no sentence saying a cap exists. The copy immediately above the list is:
> *"Everything done with the record, filtered to what you can see. Print this page for a copy the family can hold — **it prints exactly the entries below**."*
"filtered to what you can see" names the *policy* filter and is honest about it; "Everything" and "a copy the family can hold" are then false the moment the reader's visible history exceeds 300 rows. Reachability is not marginal: `access_log` accumulates artifact reads (`hc.log_artifact_read`), record reads (`20260829120004`), every grant change, every arrival decision, and denial rows that collapse only per (actor, subject, domain) per hour.
**Failure scenario.** A circle six months in. The coordinator prints the family's log for a probate meeting, believing she has printed the record. The custodianship declaration — `seq` 1, the *first* row of the log, and the row §7.5 makes load-bearing — is the first thing dropped by `order by seq desc limit 300`. The printed artifact silently omits the beginning of the record while asserting completeness. (The subject page's separate `custodianshipDeclaration` query is `order by seq asc limit 1` and is unaffected — which is why the omission is invisible from the surface that shows it.)
**Why the tests miss it.** `tests/hc/people.test.ts` calls `accessLog(…, 200)` and asserts row content, never the cap or its disclosure. `tests/routes/access-log.test.ts` mocks `accessLog` entirely, so the limit is never in the frame. The e2e leg asserts `entries.count()` is `> 0` on a fresh fixture. Nothing in the round can observe a >300-row circle.
**What would close it.** No DDL. Either (a) drop the cap and paginate with a cursor on `seq`, or (b) keep it and say it — *"the most recent 300 entries"* in the lead paragraph and on the print projection — and rewrite PPL-04's parenthetical, LOG-01's app half and `accessLog`'s docstring so none of the three still says "subtracts nothing" / "simply orders". (b) is a copy fix plus three cell edits; (a) is the honest one for an accountability surface.

##### R4/F-4 — MINOR — the family's log and the subject's page are unreachable from the People surface: no in-app link exists from `/people` or `/people/[member]` to either
**Confidence.** high; verified by exhaustive grep over `app/`, `components/`, `e2e/`.
**Where.** `app/(app)/[circle]/people/page.tsx` (no `/people/log` href, and subject cards carry no href at all); `app/(app)/[circle]/people/[member]/page.tsx` (hrefs: `next`, `/tasks/<id>`, `?remove=1`, `/people` — nothing else); `components/shell/nav-manifest.ts` (`people` only). e2e legs: "the access log rendered and printed (PPL-04, AC-PPL-5/7)" and "the subject's page: the custodianship declaration and the profile facts at view (Q4(b), RCP-02's profile link)".
**Claim under test.** Plan C5 (BINDING): *"`/[circle]/people/log`: **the coordinator's read** of `access_log`"*; PRD §4.6.5 by way of AC-PPL-5/7 and PPL-04's *"rendered and printable"*.
**What I found.** `grep -rn "people/log" app/ components/ e2e/` yields exactly one rendered href in the whole app — on the *subject* page:
```tsx
<a className="action-link" href={`/${circle}/people/log`}>the family&apos;s log</a> can be printed for them
```
and `grep -rn "people/subject" app/ components/ e2e/` yields exactly one — the profile-fact branch of `receiptLine`. So the reachable path to the printable log is: *have an arrival whose approved proposals include a profile fact* → *open its receipt* → *click "filed to the profile"* → *click "the family's log"*. The People list renders subject names as bare `<strong>` and offers a coordinator only "Adjust what they can see". A coordinator who wants the log has no way to find it.
**Failure scenario.** The coordinator, on `/people`, wants the printable record §4.6.5 promises her. There is no control on the page, none on any member's page, and none in the nav. She would have to know the URL.
**Why the tests miss it.** Both e2e legs `await f.page.goto(...)` the URL directly (`e2e/people.spec.ts:401`, `:428`) — they prove the page renders, never that a user can arrive at it. `tests/routes/people.test.ts` asserts the adjust href and the absence of a matrix; it never asks what the page links to.
**What would close it.** No DDL. A `.action-link` to `/[circle]/people/log` on the People list (and the subject cards linked to their own pages), plus a leg that *clicks* rather than `goto`s. This is Tier 3 in cost and, per the charter, would be reviewed in the batched pass — but the surface it strands is a Tier 1 accountability artifact.

##### R4/F-5 — MINOR — a subject-narrowed freeze reaches the app as a JSON `null` inner map; the People list handles it correctly, the adjust matrix conflates it with `hidden` and pre-checks "Nothing" for every domain
**Confidence.** high on the mechanism and the render; CONTINGENT on `hc.set_grant`'s freeze behaviour for the blast radius (I did not read it — READ-ONLY, and it is C4's lens).
**Where.** `supabase/migrations/20260829120005_round24_m5_reads.sql#hc.member_levels_frozen`; `lib/hc/people.ts:32-34` (the `PersonRow.levels` type); `app/(app)/[circle]/people/[member]/page.tsx:216`; `app/(app)/[circle]/people/[member]/grant/submit/route.ts:64`; contrast `app/(app)/[circle]/people/page.tsx:72-80`.
**Claim under test.** D5: *"null is 'not yours to know' and renders NOTHING"*; `lib/permissions/phrases.ts:64-66`: *"Null is 'not yours to know' … the line is EMPTY and the surface renders nothing, implying nothing."*
**What I found.** The definer distinguishes the two cases precisely — `hc.member_levels` writes `coalesce(g.level, 'hidden')` for **every** domain explicitly, and `hc.member_levels_frozen` replaces a frozen subject's whole inner object with SQL `null`:
```sql
case when exists (select 1 from public.freezes f
                  where f.circle_id = p_circle and f.state = 'unresolved'
                    and f.subject_id = e.key::uuid)
     then null else e.value end
```
so the wire carries `{"<subject>": null}`. `subjectLines` gets this right by accident of `plainLine`'s defensive signature: `plainLine(null)` → `''` → `.filter(Boolean)` → no line. The adjust matrix does not:
```tsx
const current = person.levels?.[s.subject_id ?? '']?.[d] ?? 'hidden';
…
<input type="radio" name="level" value={l} defaultChecked={l === current} />
<span>{LEVEL_OPTION_WORD[l]}</span>   // LEVEL_OPTION_WORD = { ...LEVEL_WORD, hidden: 'Nothing' }
```
`?.[d]` on `null` yields `undefined`, `?? 'hidden'` turns it into a level, and `'Nothing'` is pre-checked for all five domains. There is no freeze notice on the page. Note also that `PersonRow.levels: Record<string, Record<string, string>> | null` does not model the inner null the definer emits — the truth is `Record<string, Record<string, string> | null> | null` — so the type gives a future caller no warning; anything doing `Object.keys(row.levels[sid])` throws.
**Failure scenario.** An unresolved freeze narrowed to Nell. The coordinator opens `/people/<ruth>` and reads that Ruth currently has **Nothing** on every one of Nell's five domains. Ruth in fact holds `summary` on health. The coordinator, believing Ruth has nothing, either leaves a grant she meant to remove or submits a "raise" (the submit route computes the same `'hidden'` and demands a step-up) that the DB then refuses with `?e=refused` → *"That couldn't be done just now."* — a refusal that names neither the freeze nor the reason.
**Why the tests miss it.** `tests/routes/member-detail.test.ts` and `tests/routes/people.test.ts` mock `circlePeople`; neither fixture contains a per-subject `null` inner map, so the shape the definer emits under a freeze is never exercised at the route layer. `tests/hc/people.test.ts`'s live cases do not open a freeze. The freeze semantics are pinned DB-side (ADR-0033 D19.11) — the app-side rendering of them is not.
**What would close it.** No DDL. Widen `PersonRow.levels` to `Record<string, Record<string, string> | null> | null`, then branch at the matrix: a `null` inner map renders the subject's card as frozen and offers no radios, rather than pre-checking "Nothing". Fail-closed is already correct on the *write* path (`grant/submit` demands a step-up); it is the *display* that asserts a false fact.

##### R4/F-6 — MINOR — `LEVEL_RANK` is the only map in the phrases module with a security consequence and the only one with no live pin, typed `Record<string, number>` so neither TypeScript nor a test would catch a missing key
**Confidence.** high on the gap; medium on exploitability (the enum-growth path is caught indirectly, by a *different* assertion in a *different* file).
**Where.** `lib/permissions/phrases.ts:50-56`; `tests/permissions/phrases.test.ts` (pins `LEVEL_WORD`, `LEVEL_PHRASE`, `DOMAIN_LABEL` against `enum_range`; never `LEVEL_RANK`); consumers `app/(app)/[circle]/people/[member]/grant/submit/route.ts:69` and `app/(app)/[circle]/people/[member]/page.tsx:156`.
**Claim under test.** D5: *"pinned LIVE against the enum and `hc.tier_defaults`"* — asserted of the module.
**What I found.** The pin is genuinely live and genuinely good — `select enum_range(null::hc.access_level)::text[]`, then `expect(Object.keys(phrases.LEVEL_WORD).sort()).toEqual(worded)` — this is not a hardcoded list, and a grown enum fails it. But it covers three maps and not the fourth. `LEVEL_RANK` is declared `Record<string, number>`, not `Record<AccessLevel | 'hidden', number>`, so an absent key is a silent `undefined` at the type level too. The consumer that decides whether a step-up token is required is:
```ts
const raising = LEVEL_RANK[level] > LEVEL_RANK[current];
```
`n > undefined` is `false` — a raise misclassified as a lower, and `hc.set_grant` called with `stepUpToken: null`. Today `level` is validated against a local `LEVELS` set and `current` defaults to `'hidden'`, so both keys exist and the code is correct; the DB refuses regardless. The gap is that nothing *states* the invariant `LEVEL_RANK` must satisfy, and the thing that would fail first if the enum grew is `LEVEL_WORD`'s pin, which is not about ranks.
**Failure scenario.** `hc.access_level` gains a level in a later slice and `LEVEL_WORD`/`LEVEL_PHRASE` are updated (the failing test names them) while `LEVEL_RANK` is not. A coordinator raises a member to the new level from `hidden`: `LEVEL_RANK[new]` is `undefined`, `raising` is `false`, no step-up is demanded, and `hc.set_grant` is called with a null token — the app-side half of the §5.7 re-authentication silently stops applying.
**Why the tests miss it.** No assertion mentions `LEVEL_RANK`. The e2e "adjust" leg drives one raise and one lower over the *current* enum.
**What would close it.** No DDL. Two lines in `tests/permissions/phrases.test.ts`: assert `Object.keys(LEVEL_RANK).sort()` equals the full live `enum_range` (hidden included), and that the ranks are strictly increasing along the enum's own order. Narrow the type to `Record<AccessLevel | 'hidden', number>` so an omission is a compile error.

##### R4/F-7 — MINOR — the receipt section's comment still says documents and profile facts "open later" and that "RCP-02 stays pending", directly above the code that resolves them and beside a green RCP-02 row
**Confidence.** high; not contingent.
**Where.** `app/(app)/[circle]/inbox/[arrival]/page.tsx:200-204`.
**Claim under test.** `docs/coverage.md:489` — RCP-02 **green**; D8's *"every receipt link resolves"*.
**What I found.**
```tsx
// §4.2.4: what went where. Links RESOLVE for tasks and timeline
// (both surfaces are live); documents and profile facts are NAMED
// and say plainly their surface opens later — never a dead link,
// never a silent omission (RCP-02 stays pending; SIG-01 precedent).
```
Every clause after the first is now false, and the parenthetical asserts a coverage state this slice inverted. It sits sixty lines above the 7C comment that says the opposite. In a tree where ADR-0026 makes comments first-class and traps §9 requires scanners to carve them out, a comment that contradicts a green coverage cell is the kind of thing a later reader will believe.
**Failure scenario.** A slice-8 session reads the receipt section, believes RCP-02 is still pending, and re-plans work that shipped — or, worse, "restores" the honest-limit sentence the comment describes.
**Why the tests miss it.** Comments are not asserted. `tests/routes/arrival.test.ts` reads rendered HTML.
**What would close it.** No DDL. Rewrite the comment to match the code below it. Pairs with F-1's scanner.

##### R4/F-8 — OBS — three pins whose titles carry claims their bodies do not assert
**Confidence.** high.
**Where.** `tests/routes/access-log.test.ts` — "a denial renders its collapsed count and NEVER an object name — and there is none to leak" and "the page is printable: the print stylesheet exists and hides the chrome, never the entries"; `tests/routes/arrival.test.ts` — "an episode resolves to the Timeline, where its wrapper renders" (already counted at F-2).
**Claim under test.** LOG-02's app half (`docs/coverage.md:248`) cites the first of these as its evidence.
**What I found.** (a) The `DENIAL` fixture carries no `object_type`, no `object_id` and no `detail` at all, and the three assertions are `toContain('Dan')`, `toMatch(/7/)`, `toMatch(/tried to open something/i)` — there is not one `not.toContain`. The test cannot fail for naming an object because no object name is ever put where the page could reach it. (The *code* is clean — see my confirmations — but the pin LOG-02's cell rests on proves nothing about it.) (b) `expect(css).toMatch(/@media print[\s\S]*\.left-nav/)` — `[\s\S]*` spans the whole stylesheet, so `.left-nav` need only appear *somewhere after* the first `@media print` in the file; the same assertion passes against a print block containing `.log-entries { display: none }`, which is precisely the failure the title names. `.log-entries` is never mentioned.
**Why it matters.** Highest-yield class: a green row whose named test checks less than the row claims.
**What would close it.** No DDL. Give the denial fixture an `object_type: 'document'` and a `detail: { title: 'Nell colonoscopy results.pdf' }`, then assert `expect(html).not.toContain('colonoscopy')`. Anchor the print regex to the block (`/@media print\s*\{[^}]*\.left-nav/`) and add a positive assertion that `.log-entries` is not hidden in it.

##### R4/F-9 — OBS — `plainLine` does not *name* a hidden domain but does *disclose* it, by omission from a closed set of five; harmless in today's composition, and the composition is the only thing making it harmless
**Confidence.** high on the mechanism; the "harmless today" half is CONTINGENT on `hc.circle_people`'s guard staying where it is.
**Where.** `lib/permissions/phrases.ts:68-90`; `supabase/migrations/20260829120005…#hc.member_levels` and `#hc.circle_people`.
**Claim under test.** D5: *"The line groups by level and names domains only when mixed; **a hidden domain is simply not mentioned**."*
**What I found.** The claim is literally true and the code is careful — the filter `level !== 'hidden' && level in LEVEL_WORD` excludes both `hidden` *and* any unworded future level, so nothing unworded can reach a sentence and `undefined` can never be interpolated. But the *unenumerated* form is reachable only through one branch:
```ts
if (present.length === ALL_DOMAINS.length && present.every((d) => levels[d] === first)) return LEVEL_WORD[first];
```
so `view` on five domains renders `"sees everything"` while `view` on four with one `hidden` renders `"sees everything: memories, health & care, schedule, documents"`. `hc.member_levels` writes all five domains explicitly, so `present` is always a subset of a fixed five-element set. A reader who knows the taxonomy subtracts and gets the hidden domain by name. Non-mention is a weaker property than non-inference, and the ADR presents it as the latter.
**Why it is an OBS and not a finding.** Every reader of a non-null levels map today is either the coordinator (entitled to all of it) or the member reading her **own** row — `hc.circle_people` guards member levels with `v_coord or m.id = v_me.id`. Subject rows are ungated but hold manage×5 and are not adjustable (`grant/submit` matches `kind === 'member'`). So there is no unentitled reader to leak to. That is a property of the definer's guard, not of `plainLine`, and it stops holding the day a levels map is handed to a third reader.
**What would close it.** Nothing now. Record the distinction in D5 so the next slice does not read the claim wider than it is: *the line does not name a hidden domain; it does not conceal that one exists.*

##### R4/F-10 — OBS — the phrases pin never exercises the shape the DB actually emits
**Confidence.** high.
**Where.** `tests/permissions/phrases.test.ts` — "no grants at all is its own honest phrase, and null (not yours to know) is empty".
**What I found.** The test pins `plainLine({})` and `plainLine(null)`/`plainLine(undefined)`. `hc.member_levels` never emits `{}` for a subject key — it emits all five domains with `'hidden'` written in. The all-hidden map reaches the same `present.length === 0` branch, so the assertion is not wrong, but the *live* shape is untested and so is the shape D5's central claim is about: a map with **one** `hidden` among four worded levels. The two `hc.tier_defaults` cases that stand in for it (family, care_circle) happen to omit whole domains rather than mix one in. And the per-subject `null` that `member_levels_frozen` emits (F-5) is not in this file at all.
**What would close it.** No DDL. Three cases: an all-`hidden` map, a four-of-five map asserting the fifth's label is absent, and `plainLine(null)` reached through a `{subject: null}` entry the way the surface reaches it.

#### R4 confirmations

- **`lib/permissions/phrases.ts` is clean against attack 1.** No caller can put `hidden` or an unworded level into a sentence: `plainLine` filters on `typeof level === 'string' && level !== 'hidden' && level in LEVEL_WORD`, so an unknown future level fails closed to non-mention rather than to `undefined` or a throw. `null`/`undefined` return `''` before any lookup. There is no code path in which `LEVEL_WORD[x]` is interpolated without `x` having been membership-tested.
- **The enum pin is genuinely LIVE, not a hardcoded list.** `select enum_range(null::hc.access_level)::text[]`, `expect(enumLevels).toContain('hidden')`, then `Object.keys(LEVEL_WORD).sort()` and `Object.keys(LEVEL_PHRASE).sort()` against the enum **minus** hidden; `DOMAIN_LABEL` the same against `hc.domain`. A level added to the enum fails this test rather than reaching a sentence unworded. This is the strongest single assertion in the increment.
- **The `hidden` path and the `null` path are distinct on the wire and distinguished at the People list.** `hc.member_levels` writes the string `'hidden'`; `hc.member_levels_frozen` writes JSON `null`. `subjectLines` renders a word for the first (or omits it) and nothing at all for the second. Only the adjust matrix conflates them (F-5).
- **The log's `detail` JSON never reaches the DOM or the RSC payload.** `entryLine` reads `event_type`, `actor_display_name`, `target_name`, `subject_name`, `domain`, `level_before/after`, `collapsed_count`, `occurred_at` — never `e.detail` and never `e.object_type`. `Card`, `Button` and `PageHeader` carry no `'use client'`, so no `LogEntry` crosses the RSC boundary as a prop; nothing is serialized. LOG-02's no-object-name property holds in the code (its *pin* does not test it — F-8).
- **The log's filter is `access_log_select` and the surface adds nothing.** The policy's three arms (circle-level domain-less to every live member; domained-but-subjectless requiring ≥log on every live subject with an empty set staying dark; subject entries at ≥log on the entry's domain, a no-domain subject entry failing closed to all domains) are the whole filter. The app adds only `where l.circle_id = $1` — necessary, since the policy admits any circle in `ctx->'circles'` — and an ordering. It **subtracts** via `limit` (F-3).
- **Print is one render path.** There is no `@media print` branch in React, no print route, no separate read. `app/globals.css:1136-1147` hides `.left-nav, .topbar, .back-link, button, .record-controls` and adds only `break-inside: avoid` to `.log-entries li`. The printed projection is definitionally the same filtered read. The widened shell pin is sound: `medias.every(m => prefers-reduced-motion || print)` **and** `medias.some(m => /width/.test(m)) === false` — print is admitted without admitting a viewport query.
- **The custodianship declaration is honest in both directions (D8, Q-E's bound).** `custodianshipDeclaration` is a separate `order by seq asc limit 1` read under the same policy; the page renders `{declaration ? … : null}` and emits no alternative branch. Where the log×5 bound hides it there is no section, no placeholder and no claim that none exists — pinned both live (`custodianshipDeclaration(claimsOf('ruth'), …)` is null) and mocked (`expect(html).not.toMatch(/no declaration|nothing declared/i)`). The profile-facts section is guarded the same way (`facts.length > 0`), leaving no facts-shaped hole.
- **D9 holds exactly as stated.** `app/(app)/[circle]/layout.tsx` hands `<LeftNav circle={circle} tier={tier} />` — a string; `LeftNav` computes `entries ?? navFor(tier)` client-side from `components/shell/nav-manifest.ts`, the same module `tests/routes/people.test.ts` drives. The three ruled compositions match the plan's C3 row verbatim, and the e2e leg asserts Marisol's and Dan's live navs as **exact arrays**, not supersets. The tier is a per-request RSC read (`myMembership` inside the layout, no `use cache`, no `unstable_cache`, and `asUser()` forces the segment dynamic) — no stale or cacheable source.
- **Unknown-falls-OPEN does not strand an ungated surface.** Every key `navFor` can emit resolves to a page now present in `tests/app/page-gate.test.ts`'s filesystem-pinned `GATED` set, including all six routes 7C added; `/[circle]/people/[member]` refuses a non-coordinator in code (`if (!person || me?.tier !== 'coordinator') notFound()`) and the leg drives Marisol's hand-built URL to a live 404.
- **`grant/submit`'s `?? 'hidden'` default is fail-CLOSED.** A missing or null current level ranks 0, so any real target ranks higher, `raising` is true, and a step-up token is demanded. `LEVEL_RANK[level]` is safe because `level` is validated against a local `LEVELS` set first. (The *display* built on the same default is not — F-5; the *type* that permits an unpinned key is F-6.)
- **The profile-fact receipt link cannot produce `/subject/null`.** `arrivals.subject_id` is `uuid not null` (`20260815230001:20`), so `row.subject_id` is always a real id and the widened `receiptLine(r, circle, subjectId)` signature is safe.
- **The subject page's 404 is the one shape.** Unknown, foreign, deleted and not-yours-to-see all arrive as "no matching subject row from `hc.circle_people`" → `notFound()`. No existence oracle.
- **`hc.receipt_for`'s counted-never-named discipline is preserved by the new branches.** `visible` gates before any of the four typed branches; the `!r.visible` branch still renders type-only. The `document` branch guards on `r.object_id` exactly as `task` and `timeline_event` do.

#### R4 answers to assigned pointed questions

**Q-B.** **DISSENT — qualified.** I ratify the *policy*: no episode page exists, none was promised, and RCP-02 does not owe one. Resolving an episode to the surface that renders it is the right Phase-1 answer, and I would not ask for an episode route.

But the recommended answer is *"RCP-02's 'resolves to the created object' is met by the surface that renders it"*, and at `ccd854b` the implementation does not meet even that weaker standard unconditionally — it meets a still weaker one: *resolves to a surface that renders episodes*. Three mechanisms, in order of how easily they bite (F-2 carries the code):

1. **The link drops the subject the function is holding.** `href={`/${circle}/timeline`}` with no `?subject=`, while `receiptLine`'s third parameter — added in this very diff so the profile-fact branch could use it — is the arrival's `subject_id`. `timeline/page.tsx` then defaults to `subjects[0]`, the **founding** subject. In any circle with more than one subject, an episode belonging to a non-founding subject lands the reader on someone else's thread. This needs no scale, no freeze and no unusual grant: two subjects and one episode.
2. **The receipt's predicate and the wrapper's predicate are different questions.** `hc.receipt_for` grants `visible` on the *episode row* (`visible_at(… 'episode', e.id …) >= 'summary'`); `Thread` emits a wrapper only where at least one *member event* survives the reader's own timeline read. An episode visible to a reader whose member events are not is a receipt link to a page that shows her nothing of the object.
3. **`listEvents` is `order by sort_at asc … limit 300`** — the oldest 300, no cursor. The newest episode in a mature circle is outside the window the bare link opens.

The distinction that matters for the ruling: *"resolves"* can mean "returns 200" or "puts the created object in front of the reader". The packet's own words — *"the surface that renders it"* — commit to the second, and the pin's title (*"where its wrapper renders"*) commits to it again while asserting only the href. If the round accepts, it should accept the *first* reading explicitly and say so in RCP-02's cell, because the cell currently claims the second.

My recommendation: **fix rather than rule.** `?subject=${subjectId}` plus an `id` on the episode `<section>` and a `#episode-<id>` fragment is a two-line change that closes mechanism 1 outright and makes 2 and 3 visible instead of silent (the reader lands on the right thread and, at worst, does not find the wrapper — rather than being sent to the wrong subject entirely). Then ACCEPT Q-B on the narrowed claim, with mechanisms 2 and 3 recorded as named narrowings in RCP-02's cell — *an episode resolves to its subject's thread; where its member events are not the reader's to see, or fall outside the thread's window, the wrapper does not render* — which is honest and, unlike the current cell, true.

#### R4 recorded dissents and observations

- **D5's "hidden HAS no word" is a property of the module, not of the product's sentences.** Two surfaces re-word `hidden` outside `lib/permissions/phrases.ts`, neither covered by its pin: `people/log/page.tsx:45` (`level === 'hidden' ? 'nothing'`) and `people/[member]/page.tsx:83` (`LEVEL_OPTION_WORD = { ...LEVEL_WORD, hidden: 'Nothing' }`). Both are *correct* — a coordinator must be able to select "Nothing", and a log entry recording a lower-to-hidden must be able to say what it lowered to, on a row the reader already clears ≥log for. Not a defect. But D5 as written reads as a tree-wide property, and the round should record that it is a module-scoped one. Related: `levelWord`'s `?? level` fallback would render a raw enum token into a family-readable sentence if the enum grew — caught today only because `LEVEL_WORD`'s live pin fails first, in another file, on another assertion.
- **The log's `?? level` and `?? 'record'` fallbacks conflate `null` and `hidden` deliberately and correctly.** `levelWord(null)` → `''` → `|| 'nothing'`, and `levelWord('hidden')` → `'nothing'`. In the log's semantics "no prior grant row" *is* hidden, so the conflation is the honest rendering. Flagging it only because attack 1 asked me to distinguish the two paths everywhere: this is the one place they are legitimately the same.
- **The plan's C5 row names the subject page as `/[circle]/people/[subject]`; it shipped at `/[circle]/people/subject/[subject]`.** A necessary disambiguation — `[member]` already occupies that slot, and a subject id posted at `/people/<id>` correctly 404s (`rows.find(r => r.kind === 'member' …)`). The right call. Not named in ADR-0037 or the packet, and a BINDING C-row moved; it belongs in D8 as a one-line narrowing.
- **`/[circle]/people` renders the full roster to a `care_circle` member who types the URL** — subject names, custodians, the subjects' own plain lines, every member's name, tier and slice. `hc.circle_people` deliberately permits it (the `v_coord or m.id = v_me.id` guard covers member *levels*, not the rows, and subject rows carry levels unconditionally), so this is the DB's standing model rendered faithfully and I file no defect. But D9's justification for unknown-falls-OPEN is *"the surfaces refuse for themselves"*, and for this surface the refusal is the courtesy — the nav — and nothing else. The claim is true of `/people/[member]` (a live 404, driven by the leg) and not true of `/people`. Worth one clause of precision in D9 rather than a rule change.
- **`tests/routes/people.test.ts`'s default fixture encodes a state `hc.circle_people` cannot return:** the reader is a coordinator (`myMembership → tier: 'coordinator'`) while Marisol's row carries `levels: null`. As coordinator the definer would hand back her levels. Harmless — the assertions it supports do not depend on it — but the mocked contract drifts from the live shape, which is how the F-5 class gets missed.
- **`f.risk_class` renders raw on the subject page** (`· {f.risk_class} ·` → "high"). The test asserts `toContain('high')`, and the e2e leg the same. It reads acceptably for `high`/`low`; it is an unmapped enum token in a family-facing sentence, and the one place on my surfaces where §8.2's voice is carried by the database rather than by copy. Q-F material for the round's UXA-04 read, not a defect.
- **Print hides `.back-link` but not `.action-link`.** The subject page's "the family's log" link and the People list's "Adjust what they can see" links print as underlined text. Cosmetic; noting it because `.action-link` joined `.back-link` in the touch-target pin at `ccd854b` and did not join it here.

### R5 — the bounds, the remove route's keep-shares contract, and the cache-control split (model: Sonnet)
> **Independently verified:** `lib/http/bounded-json.ts`, `lib/http/budget.ts`, `lib/http/page-budget.ts`, both upload routes, `app/api/upload/tus/[[...id]]/route.ts`, `app/(app)/[circle]/upload/upload-form.tsx`, all seven auth submit routes + their six pages (verify-email has none — its overrun and its `e=unverified` success path both land on sign-in's page, which reads `e=slow`), `app/(app)/[circle]/members/[member]/remove/route.ts`, `lib/hc/members.ts`'s `removeMember` wrapper, `proxy.ts`, `tests/app/proxy.test.ts`, `tests/routes/upload.test.ts`, `tests/lint/answer-budget.test.ts`, `playwright.config.ts`, and — read only to close out the keep-shares question, not to review as new DDL — the unchanged `hc.remove_member` body in `supabase/migrations/20260818120004_grants_revocation.sql` (confirmed byte-identical to base by the packet's own tree-hash claim; I did not re-verify that hash myself, see Taken on trust).
> **Taken on trust:** the packet's `git diff --name-only ccd854b..HEAD` docs-only claim and the per-directory tree-hash claims (not re-run); r3's observed dev-server `no-cache, must-revalidate` rewrite (not reproduced — no dev server was started, per the read-only constraint); the gate tallies and trace-retention narrative in D11.
> **Verdict:** OW-23 and the remove-route keep-shares contract hold as claimed; OW-16 holds; OW-19 and OW-07 hold on SIZE but not on TIME — the ingress-cap read on both upload routes is an unbounded wait outside any `AnswerBudget`, which the CLOSED rows' own acceptance text says cannot happen. Q-D and Q-E both ratify, with one additional gap (F-2) the packet didn't name.

#### R5 findings, most severe first

##### R5/F-1 — MAJOR — the upload routes' 4 KiB ingress read has no time bound and runs entirely outside `withRouteBudget`, so a slow body neither 413s nor 504s — it just hangs
**Confidence.** High.
**Where.** `lib/http/bounded-json.ts:11-16` (`boundedJsonText`); `app/api/upload/token/route.ts:40-52`; `app/api/upload/complete/route.ts:51-70`. No e2e leg exercises this path (it is a vitest-only claim).
**Claim under test.** OW-19 CLOSED(f1cfc33): "both routes cap ingress at 4 KiB … 413 BEFORE any parse or probe" and "answer inside `withRouteBudget` with every hop raced." OW-07 CLOSED(f1cfc33): "`withRouteBudget` with every hop raced." The route's own comment (`upload/complete/route.ts:72-73`): "completion is a person's wait; it answers inside the route budget like every other one."
**What I found.** In both routes, `const text = await boundedJsonText(req);` (token:40, complete:51) runs *before* `return withRouteBudget(...)` opens (token:56, complete:74). `boundedJsonText` itself (`bounded-json.ts:11-16`) is:
```
const declared = Number(req.headers.get('content-length') ?? '0');
if (declared > UPLOAD_JSON_MAX) return null;
const text = await req.text();
return text.length > UPLOAD_JSON_MAX ? null : text;
```
`req.text()` carries no timeout, no `AbortSignal`, and no participation in any `AnswerBudget.race(...)`. It resolves only when the stream ends (or the socket closes). The size guarantee is real — `text.length > UPLOAD_JSON_MAX` catches a body whose declared `content-length` lied or was omitted, so an oversized body genuinely never reaches `JSON.parse` — but the *time* guarantee ("answers inside the route budget… every hop raced") is false for this hop: it isn't raced against anything, and it happens before the 15 s (token) / 60 s (complete) `AnswerBudget` object even exists.
**Failure scenario.** An authenticated caller (both routes gate on `readLiveSession` first, so a live session cookie is the only prerequisite — not a stronger bar) issues `POST /api/upload/token` with `Transfer-Encoding: chunked` and no `Content-Length` header, then dribbles the body at, say, one byte per ten seconds. `declared` reads `0` (header absent) and passes the `> 4096` check trivially; `req.text()` then blocks indefinitely — no 413, no 504, ever — regardless of the 15 s/60 s numbers the packet advertises, because those numbers govern a budget that has not opened yet. The connection (and the Node request-handling capacity it occupies) is held open for as long as the caller wants.
**Why the tests miss it.** `tests/routes/upload.test.ts`'s over-cap case (`OVER_CAP = 'x'.repeat(8_192)`, `rawPost(...)`) builds the body as a plain string on a `new Request(...)`, which resolves synchronously in memory — the constructed request never streams, so `req.text()` never has an opportunity to hang, and the test cannot distinguish "checked before any byte lands" from "checked only after every byte has already landed, however long that takes."
**What would close it.** Pure app-layer: move the ingress read inside the route's own `AnswerBudget` (e.g. `budget.race(boundedJsonText(req), 'ingest')`) or give the read its own short, independent deadline (a manual `ReadableStream` reader loop with a byte cap AND a per-chunk/overall timeout) before `JSON.parse`. No DDL.

##### R5/F-2 — MINOR — `proxy.ts` has one pass-through branch that is never stamped `private, no-store`, and neither the unit pin nor the e2e gate can see it
**Confidence.** High that the branch exists and is unstamped; low likelihood of real-world exposure (see below).
**Where.** `proxy.ts:28-30`; the negative case in `tests/app/proxy.test.ts:115-120` ("with no auth config at all the proxy stays out of the way"); `playwright.config.ts:56-58` (the e2e `webServer` env, which always sets both vars, so this branch never fires under gate conditions).
**Claim under test.** D7/ADR-0037: "`proxy.ts` stamps `private, no-store` on every pass-through (unit-pinned)." Q-D's recommendation rests on this being true for every non-artifact, non-503 response.
**What I found.** `proxy.ts:28-30`:
```
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) return response;
```
This returns `response` (a bare `NextResponse.next({ request })`) before the `response.headers.set('cache-control', 'private, no-store')` at line 67 ever runs. It is the one pass-through path the "every pass-through" claim does not cover.
**Failure scenario.** Any deployment window in which `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset — a misconfigured environment, a partial env rollout — serves every matched route with no cache-control stamp from the proxy at all, and (per D7) the page's own header in that condition rests on nothing but the prod default.
**Why the tests miss it.** The existing negative-case test (`tests/app/proxy.test.ts:115-120`) asserts only `res.status).toBe(200)` and `getClaims).not.toHaveBeenCalled()` — it exercises exactly this branch and never asserts (or denies) a cache-control header, so the branch is covered for "does the proxy get out of the way" but not for "is the response still safe to cache." The e2e gate cannot see it either: `playwright.config.ts`'s `webServer` env block sets both vars unconditionally, so this branch cannot fire during any recorded gate run.
**What would close it.** Trivial app-layer fix: stamp the header before the early return too, or restructure so the stamp is unconditional. I did not find this scenario realistically exploitable for *disclosure* — without those two env vars essentially every Server Component that reads Supabase would itself fail before producing a coherent sensitive page — which is why this is MINOR rather than MAJOR: the gap is real against the letter of "every pass-through," but the app is not functional enough in that state to make a cached sensitive page the live risk. No DDL.

#### R5 confirmations

- **OW-19 (size half): CONFIRMED.** Both upload routes refuse any body whose *actual* text exceeds 4 KiB with 413 before `JSON.parse` runs, including the case where the declared `content-length` header lies or is absent (`bounded-json.ts:15`, the post-read length check) — an oversized JSON body is never parsed, matching the letter of "413 before any parse." **OW-19 (timing half): FOUND SHORT — see F-1.**
- **OW-19 (TUS pre-read bound): CONFIRMED.** `app/api/upload/tus/[[...id]]/route.ts:136-139` refuses on creation whenever `Upload-Length` is missing, non-numeric, or over `FILE_BYTES_MAX` (52428800) — `!Number.isFinite(declared)` catches both an absent header and a client using TUS's Upload-Defer-Length extension (which omits `Upload-Length` entirely): the route fails closed, not open. No hole for defer-length. `tests/routes/upload.test.ts` pins both the over-cap and the missing-header case, and both assert `fetchMock` was never called — the upstream truly is never contacted before the size check.
- **OW-07 (the five named hops): CONFIRMED** for the four I could directly inspect (client mint 15 s, client completion 60 s in `upload-form.tsx:63,139`; both TUS hops 120 s via `AbortSignal.timeout(UPLOAD_HOP_TIMEOUT_MS)` in `app/api/upload/tus/[[...id]]/route.ts:146,180`; the eager `after()` fire 10 s in `upload/complete/route.ts:125`) and for every `budget.race(...)` call inside the two upload routes' `withRouteBudget` bodies. **OW-07 (the ingress-read hop): FOUND SHORT — see F-1** — the body read is a real wait a caller experiences and it carries no bound of any kind, which is a narrower miss than the five named sites but still contradicts "every hop raced."
- **OW-16: CONFIRMED.** `lib/http/budget.ts:52-55` carries the ROUND-20 QUALIFIER block with the exact string `UNCONFIRMED IN THE RUNNING APP`, marked rather than rewritten; `tests/lint/answer-budget.test.ts:100-103` pins the literal string.
- **OW-23: CONFIRMED.** All seven auth submit routes on disk (`sign-in`, `create-account`, `reset`, `reset/confirm`, `accept/[token]`, `wasnt-me`, `verify-email`) answer inside `withRouteBudget` (grepped all seven; each redirects to its own `?e=slow` on overrun, and `verify-email`'s overrun deliberately redirects into `sign-in`'s `?e=slow` rather than a page of its own, since none exists). Six of the seven have a `page.tsx`; each of those six reads `e === 'slow'` and renders copy (`app/(auth)/{sign-in,create-account,reset,reset/confirm,accept/[token]}/page.tsx` and `wasnt-me/page.tsx` all grep-match `slow`). `create-account/submit/route.ts:87-100` genuinely runs `abortAccountCreation` before rethrowing an `AnswerBudgetExceeded` that lands after `signUp` succeeded — the round-10 compensation runs first, matching the ADR's sentence exactly. `wasnt-me/submit/route.ts:35-43` genuinely swallows a post-token overrun in its own `catch {}` with `done=1` still returned, matching "absorbs its own overrun deliberately" in mechanism, not just in name. The scanner's positive control (`expect(submits.length).toBeGreaterThanOrEqual(7)`, `tests/lint/answer-budget.test.ts:86`) is a genuine dynamic filesystem walk of `app/(auth)` — it would fail, not silently pass, if a submit route were deleted or moved.
- **The remove route's keep-shares contract: CONFIRMED,** including the exact question the brief asked about scoping. `app/(app)/[circle]/members/[member]/remove/route.ts:29-34` collects every `keep_share_ids` value via `form.getAll(...)`, and for each value additionally splits on `,` — so a repeated-checkbox POST *and* the old single comma-joined field both parse into the same array, and an empty selection yields `undefined` (no forced keeping when the coordinator checked nothing). The app performs **zero** validation of which ids are legitimate; that scoping is entirely the unchanged `hc.remove_member` SQL function (`supabase/migrations/20260818120004_grants_revocation.sql:230-237`, read only to verify this existing, un-diffed behavior — 7C ships no migration): "every named id must be this member's live share, or **the whole call refuses**" (an `exists` check against `object_shares` scoped to `sh.member_id = p_member_id`). A crafted `keep_share_ids` naming a share belonging to another member or circle cannot be kept — the entire removal is refused (fails closed, not silently ignored), which the app's `catch` turns into `?e=refused`. Keeping cannot be forced beyond what the DB independently verifies belongs to the removed member.
- **Q-D's cache-control split, artifact half: CONFIRMED.** `app/api/artifact/[id]/route.ts` stamps `private, no-store` on every response shape (200, 503, 504) at lines 42, 57, 75, 104, 251, 364; `e2e/ingestion.spec.ts:378` and `e2e/people.spec.ts:378` both assert it on the actual bytes-fetch, which the people leg's own comment (`e2e/people.spec.ts:372-377`) correctly identifies as "the one URL whose caching could outlive a revocation" — the leg asserts where caching actually bites, honestly, and says in its own comment why it does not also assert on the page response.
- **Q-D's unit pin: CONFIRMED it would catch a dropped stamp** on the normal path — `tests/app/proxy.test.ts:68-76` asserts `private, no-store` on both a signed-in and a signed-out pass-through — but see F-2 for the one branch it does not cover.
- **Q-E's premise: CONFIRMED.** `playwright.config.ts` sets no `reporter:` key anywhere, and no `PLAYWRIGHT_JSON_OUTPUT_FILE` path is configured in the file or its `webServer` env blocks — the JSON record for any run is necessarily flag-borne (a CLI override), never config-borne, exactly as D11/Q-E states.

#### R5 answers to assigned pointed questions

**Q-D.** Ratify the packet's recommendation — accept the dev/prod split as stated in PPL-03's cell, with the hosted-runtime header question riding OW-09. The artifact-route half is solidly confirmed (every response shape stamped, asserted where caching bites) and the unit pin genuinely guards the page-proxy half against a dropped stamp on the normal path. One addition, not a dissent: F-2 shows the "every pass-through" half of the claim has one real (if low-likelihood) gap the packet did not name — a missing-env-config branch that returns before the stamp and that neither the unit test nor the e2e gate can see. I'd ask that this be folded into the same PPL-03 cell or a one-line note rather than left for a future round to rediscover, since it costs nothing to fix and nothing to say plainly now that it's found.

**Q-E.** Ratify. `playwright.config.ts` confirms the premise cleanly: no `reporter` is configured, and no JSON output path exists anywhere in the file, so any run's machine-readable record is necessarily a property of the command line that invoked it, not the repo. Accepting the teed log + tally as the r5 record is reasonable given r3/r4's failure traces ARE retained and the mechanism of each red is independently named in commit messages. On the second half of the question: yes, the new owed item's acceptance condition should explicitly cover trace retention on green runs, not just the reporter/JSON path. The base config's `trace: 'retain-on-failure'` (line 26) means a config-borne, unoverridden run — the exact thing the owed item proposes to produce — would retain *no* per-test traces on an all-green run by design; if the acceptance condition only asks for a config-borne reporter/JSON path and says nothing about trace mode, the next "complete GREEN" run reintroduces exactly the evidentiary gap r5 is now excusing, just with a JSON tally sitting next to zero traces instead of a teed log sitting next to zero traces. The item should either pin `trace: 'on'` (accepting the disk cost) or say explicitly, on the record, that a green run is expected to carry no per-test traces and name why that is acceptable.

#### R5 recorded dissents and observations

- **OBS.** OW-19's scanner (`tests/lint/answer-budget.test.ts:93-98`) checks a fixed two-element array of file paths rather than walking `app/api/upload/**` the way OW-23's scanner walks `app/(auth)/**`. This matches OW-19's own letter ("both routes" — a closed, named pair) rather than a class, so it is not a defect against the row as written; I note it only because a third JSON-ingesting upload-adjacent route added in a later slice would not be caught by this scanner the way a new auth submit route would be caught by OW-23's. I grepped for any other 7C-shipped route reading `.json()` or going through `boundedJsonText`/`req.json()` and found none beyond the two upload routes and `upload-form.tsx` itself (the client); `app/api/inbound/postmark/route.ts` also reads `.json()` but is byte-identical to base across the 7C diff (`git diff 18c362d..ccd854b --stat -- app/api/inbound/postmark/route.ts` returns empty) — pre-existing, out of scope here. Not a finding, just a note for whoever extends the upload surface next.

### R6 — legs versus titles: the 12 new e2e legs and the manifests (model: Opus)
> **Independently verified:** the leg count (`test(` at `ccd854b` across `e2e/*.spec.ts` = 9+5+5+8+11+7+5+7 = **57**; at `18c362d` = **45**; 45 + 5 documents + 7 people = 57 — the packet's arithmetic holds); `git diff 18c362d..ccd854b --name-only -- e2e/` touches exactly `audit-manifest.ts`, `documents.spec.ts`, `people.spec.ts` — **`e2e/record.spec.ts` is byte-unmodified**, so the TSK-03/04 leg (`e2e/record.spec.ts` — "tasks: assign in two taps; the sibling's source resolves; counts over the rendered tree; a caregiver's first open never blank (TSK-03, TSK-04, AC-TASK-1/4/5)") is the same leg 7B shipped and the ADR-0036 Q-H discharge is not undermined by a 7C edit; `e2e/a11y.spec.ts` is likewise unmodified, which is what makes R6/F-5 provable; every assertion in both new specs read line by line against the surface it drives (`app/(app)/[circle]/documents/**`, `app/(app)/[circle]/people/**`, `components/review/MachineReadText.tsx`, `components/shell/{LeftNav,nav-manifest}`, `app/globals.css` `@media print`); `tests/app/page-gate.test.ts` (all 6 new pages + 5 new form routes listed, filesystem-pinned both ways, hard counts 19/16/1); `tests/design/{touch-targets,audit-manifest,shell}.test.ts(x)`; `lib/permissions/tiers.ts` (`care_circle.defaultGrants = [{schedule, summary}]` — which is what makes the ceiling assertions discriminate); `playwright.config.ts` (`workers: 1`, no `fullyParallel` — declared order is real order).
> **Taken on trust:** everything about the RUN. I did not and could not execute anything — no gate, no vitest, no browser, no stack. That the 57/57 at `ccd854b` happened, its timings, and the r3/r4 red mechanisms are ADR-0037 D11's record, vault-side; I read the specs, not the logs. Also taken on trust: that `documentsFor`/`circlePeople`/`accessLog` return what their unit tests mock them to return over the live DB, and that the fixture inserts in both specs actually landed (a failed insert throws, so this is a weak trust). Where a finding depends on run-time DOM shape I say so and mark it CONTINGENT.
> **Verdict:** the gate's 57 is real arithmetic and four of the twelve legs are genuinely load-bearing — but **five of the twelve carry titles their assertions cannot back**, three of them backing GREEN coverage rows: A11Y-10's "matrix keyboard-operable" asserts nothing about movement, DOC-03's "the move landing" is satisfied by a redirect parameter and a radio label, PPL-01's "no matrix" and "custodians named" both check shapes the product does not use — and `AUDIT_MANIFEST`, the C6-binding artifact, claims a11y coverage for three new pages that no leg visits.

#### R6 findings, most severe first

##### R6/F-1 — MAJOR — A11Y-10's "the matrix keyboard-operable" is asserted by a check that passes whether or not the arrow key moved anything.
**Confidence.** High. Not contingent — the assertion is a pure predicate on `activeElement.value.length`.
**Where.** `e2e/people.spec.ts` — leg "A11Y-10: the plain line first; the matrix keyboard-operable; meaning never by colour; the printed log readable — at 390px"; the surface is `app/(app)/[circle]/people/[member]/page.tsx` (the `optionsFor(d).map(...)` radio block).
**Claim under test.** The leg title: *"the matrix keyboard-operable"*. `docs/coverage.md` A11Y-10, green cell: *"**arrow-key movement through the level radios**"*; assertion column: *"the adjust matrix keyboard-operable"*.
**What I found.** The whole keyboard half is three statements:
```ts
await scheduleForm.locator('input[name="level"]:checked').focus();
await page.keyboard.press('ArrowDown');
const focusedValue = await page.evaluate(
  () => (document.activeElement as HTMLInputElement | null)?.value ?? '',
);
expect(focusedValue.length).toBeGreaterThan(0);
```
Nothing captures the value *before* the key press; nothing compares before to after; nothing asserts the newly-focused radio is `:checked`. Every level radio on the page carries a non-empty `value` (`hidden|log|summary|view|manage`), so the assertion is satisfied by the radio that was focused in the line above it. The in-file comment claims *"move the selection with the arrow keys"* — the code never checks that it moved.
**Failure scenario.** Give each radio a unique `name` (e.g. `name={`level-${d}`}`) or render the levels as `type="checkbox"`. The radiogroup is destroyed, `ArrowDown` does nothing at all, focus stays exactly where `.focus()` put it, `document.activeElement.value` is still `"summary"`, `4 > 0`, and the leg is **green with a matrix that is not keyboard-operable**. The only state this assertion can fail in is one where focus lands on a non-input (`activeElement.value === undefined → ''`) — i.e. it tests `.focus()`, not the arrow key.
**Why the tests miss it.** It *is* the test: the leg is the sole browser check of keyboard operation on the matrix, and its predicate is "an input with a value is focused", not "the selection moved". `e2e/a11y.spec.ts`'s A11Y-09 leg (the record surfaces) is a different surface and was not touched by 7C.
**What would close it.** Read the checked value before the press, then assert both movement and selection: `const before = await scheduleForm.locator('input[name="level"]:checked').inputValue(); … expect(after).not.toBe(before); await expect(scheduleForm.locator(`input[name="level"][value="${after}"]`)).toBeChecked();`. Leg-only edit — **no DDL**.

##### R6/F-2 — MAJOR — DOC-03's "the move landing with its markers": both post-move assertions pass with no move having landed.
**Confidence.** High. The vacuity is provable from the page source; the only contingency is the exact DOM text, which I read directly.
**Where.** `e2e/documents.spec.ts` — leg "re-categorise: the audience named before the move, the move landing with its markers (DOC-03, AC-DOC-6)"; surface `app/(app)/[circle]/documents/[document]/page.tsx` (`noticeFor`, and the `move ? … : <form method="get">` branch).
**Claim under test.** The leg title: *"**the move landing** with its markers"*. `docs/coverage.md` DOC-03, green cell cites this leg by title as the e2e half of a row green on `pgTAP + app + e2e`.
**What I found.** Everything after the confirm click is:
```ts
await f.page.click('button:has-text("Move it to Financial")');
await f.page.waitForURL(/\?moved=1/);
await expect(f.page.locator('main')).toContainText('written in the family');
await expect(f.page.locator('main')).toContainText('Financial');
```
Both assertions are independent of whether the category changed:
- *"written in the family"* comes from `noticeFor`: `if (sp.moved === '1') return { … text: "Moved. The change and who it reaches are written in the family's log." }`. It is driven by the **redirect's query parameter**, nothing else.
- *"Financial"* — when `sp.move` is absent the page renders the else branch, `DOC_CATEGORIES.filter((c) => c !== doc.category).map(... <span>{CATEGORY_LABEL[c]}</span>)`. If the document is **still `medical`**, `financial` survives that filter and `<span>Financial</span>` renders in the move radio list. The word is on the page either way.

The leg never re-reads the category from the Card meta line (`… · {CATEGORY_LABEL[doc.category]} · filed …`), never checks the `Field` label (`Move it out of {CATEGORY_LABEL[doc.category]}`), and never checks Dan — the member the preview named as losing sight — actually lost it.
**Failure scenario.** `recategorize/submit` redirects `303 → ?moved=1` while the write no-ops or rolls back (an `expected_category` mismatch answered with the success marker instead of `?e=changed`; an RPC that returns without writing; a transaction that rolls back after the redirect is built). The page then renders category **Medical**, notice *"Moved. …"*, and *"Financial"* as a radio option. Both `expect`s pass. Dan still sees the document. **Green, with the audience change that DOC-03 is entirely about not having happened.**
**Why the tests miss it.** It is the test. DOC-03's other halves are real (068:6–22 pgTAP; `tests/routes/document-detail.test.ts` for the `expected_category` binding), but the row's e2e clause reads *"the move landing"* and the browser leg is the only thing standing behind that phrase over a live stack.
**What would close it.** Assert the post-state, not the marker: `await expect(f.page.locator('main .card p.meta').first()).toContainText('Financial')` **or** `await expect(f.page.locator('main')).toContainText('Move it out of Financial')`; ideally add the audience proof the leg already set up — `expect((await dan.page.request.get(`/${f.circleId}/documents/${docId}`)).status()).toBe(404)`. Leg-only — **no DDL**.

##### R6/F-3 — MAJOR — PPL-01's "no matrix on the list" checks for `<table>` and `type="checkbox"`; the product's matrix is neither.
**Confidence.** High. Both the leg and its unit twin were read; the matrix's real shape was read from the member page.
**Where.** `e2e/people.spec.ts` — leg "people: subjects as people with custodians named; the plain line before any matrix (PPL-01, AC-PPL-2/3)"; cross-reference `tests/routes/people.test.ts` — "every member renders name, role and the plain line per subject; the page holds no checkbox and no per-domain table". Surfaces: `app/(app)/[circle]/people/page.tsx` (must have no matrix) and `app/(app)/[circle]/people/[member]/page.tsx` (has it).
**Claim under test.** Leg title: *"the plain line **before any matrix**"*. `docs/coverage.md` PPL-01 assertion column: *"the plain-language line per subject **before any matrix**"*; green cell: *"rendered BEFORE any matrix, and **the list page holds no matrix at all**"*.
**What I found.** The leg's "no matrix" assertion is exactly two counts:
```ts
expect(await f.page.locator('main table').count()).toBe(0);
expect(await f.page.locator('main input[type="checkbox"]').count()).toBe(0);
```
The matrix, as actually built, is neither. `people/[member]/page.tsx` renders it as `<form>` per domain containing `<Field><div className="choice-list"><label><input type="radio" name="level" value={l}/>…`. There is no `<table>` and no checkbox anywhere in it. The unit half has the identical gap: `expect(html).not.toContain('<table'); expect(html).not.toContain('type="checkbox"');` — so **nothing in the tree asserts the absence of the shape the matrix has**.
**Failure scenario.** Paste the member page's `offeredDomains.map(...)` block into `people/page.tsx` — a five-domain, five-level radio matrix per member, with `Change` buttons, rendered above the plain line. `main table` = 0. `main input[type="checkbox"]` = 0. The leg passes, the unit test passes, and PPL-01's *"the list page holds no matrix at all"* is false on the shipped surface.
**Why the tests miss it.** Both halves were written against a hypothetical matrix (a permissions table with checkboxes) rather than against the one C4 built four files away. The leg's negative is a textbook "selector that never exists under any behaviour".
**What would close it.** Assert against the real shape: `expect(await f.page.locator('main input[name="level"]').count()).toBe(0)` and `expect(await f.page.locator('main form[action*="/grant/submit"]').count()).toBe(0)` — plus the same two in `tests/routes/people.test.ts`. Test-only — **no DDL**.

##### R6/F-4 — MAJOR — PPL-01's "custodians named" is asserted by a label word that renders unconditionally, and by a name that appears elsewhere on the page.
**Confidence.** High for the e2e half (the fallback string is in the source); high for the unit half (the fixture puts `Sarah` on a second card).
**Where.** `e2e/people.spec.ts` — leg "people: subjects as people with custodians named; the plain line before any matrix (PPL-01, AC-PPL-2/3)"; cross-reference `tests/routes/people.test.ts` — "limit (2): a subject is a person holding the highest access to their own record, no account attached, custodian NAMED — and never the word \"authority\"". Surface `app/(app)/[circle]/people/page.tsx`.
**Claim under test.** Leg title: *"subjects as people **with custodians named**"*. `docs/coverage.md` PPL-01 assertion column: *"every person, subjects as people with **custodians named (AC-PPL-3)**"*.
**What I found.** The page renders the custodian slot with a fallback:
```tsx
· custodian: {s.custodian_name ?? 'named at setup'}
```
The e2e assertion is `await expect(f.page.locator('main')).toContainText('custodian');` — the literal label word, which is on the page whether or not a custodian resolved. The unit assertion is `expect(html).toMatch(/[Cc]ustodian/); expect(html).toContain('Sarah');` — and `Sarah` is *also* `ROWS[1].display_name`, a member card the same render emits (the sibling test asserts `toContain('Sarah')` for exactly that reason). Neither half ties a name to the custodian slot.
**Failure scenario.** `circlePeople` stops resolving `custodian_name` (a join drops, a column renames, an RLS narrowing blanks it). Every subject card reads *"custodian: named at setup"*. The e2e leg passes on the word `custodian`; the unit test passes on the word `Custodian` and on Sarah's own member card. AC-PPL-3 — the §7.5 framing whose whole point is that a subject has a **named** custodian — is unproven and PPL-01 is green.
**Why the tests miss it.** They assert the label, not the binding. The leg's own sibling on the subject page (`the subject's page: …`) gets this right by accident: there the custodian clause is *conditionally rendered* (`{subject.custodian_name ? <> by {…} (custodian)</> : null}`), so `toContainText('custodian')` there does prove a name resolved.
**What would close it.** `await expect(f.page.locator('main')).toContainText('custodian: People Founder')` in the leg; in the unit test use a custodian name that is **not** any member's display name and assert the whole clause. Test-only — **no DDL**.

##### R6/F-5 — MAJOR — `AUDIT_MANIFEST` claims a11y coverage for three of the six new 7C pages that no leg gives them; C6's binding requirement is met in form and not in substance.
**Confidence.** High. `e2e/a11y.spec.ts` is byte-unmodified in `18c362d..ccd854b`, so its audited-route lists are exactly what I read.
**Where.** `e2e/audit-manifest.ts` — the entries for `/[circle]/documents`, `/[circle]/people/subject/[subject]`, `/[circle]/people/log`; cross-reference `e2e/a11y.spec.ts` leg "the (app) shell routes and account, audited at 390px" and `e2e/people.spec.ts` leg "A11Y-10: …".
**Claim under test.** `docs/review/slice-7-plan.md` C6 (BINDING): *"Every new `page.tsx` in `AUDIT_MANIFEST` **with its leg**"*. The manifest's own header states what a leg means: *"naming the browser leg that audits it (**axe at WCAG 2.2 AA with contrast on, the 390 px pass, touch targets, no horizontal scroll — a11y.spec.ts's auditRoute**), or carrying an honest redirect-only / OWED claim instead"*.
**What I found.** Three claims are false or unmet:
1. `/[circle]/documents`: *"… audited inside the a11y shell pass at 390px when the spec lands (C6)"*. The a11y shell leg iterates exactly `[`/${circle}/timeline`, `/${circle}/tasks`, `/${circle}/invite`, '/account']` and **7C did not touch `a11y.spec.ts`**. The documents-list leg in `documents.spec.ts` runs no axe, no touch-target measurement, no overflow check, and sets no 390 px viewport (the file has no `test.use({ viewport })`). **The Documents list has zero browser accessibility coverage** — and it carries three `.action-link`s, the exact class whose 16 px target-size failure r4 caught on the *other* surfaces.
2. `/[circle]/people/subject/[subject]`: *"audited inside the people 390px pass (C6)"*. The A11Y-10 leg's 390 px context visits `/people`, `/people/{member}` and `/people/log` — never `/people/subject/{id}`. No axe, ever, on that page.
3. `/[circle]/people/log`: is visited at 390 px by A11Y-10, but only for `expect(await page.locator('.log-entries li').first().isVisible()).toBe(true)`. No axe, no touch targets, no overflow.

Separately, even the three pages that *are* audited get a weaker audit than the manifest's stated standard: `axeViolations()` in both new specs replicates a11y.spec's axe builder but **not** `expectTouchTargets()` (the DOM-measured 44 px floor that catches anchors-styled-as-buttons and label-wrapped radios) and only `documents.spec`'s A11Y-11 plus `people.spec`'s A11Y-10-on-`/people` check horizontal scroll (`/people/{member}` and the log page get neither). The 7C surfaces are therefore held to axe's WCAG 2.2 **24×24** `target-size` floor, not the project's own 44 px floor.
**Failure scenario.** Exactly the R5/F-6 scenario the manifest was created for: `/[circle]/senders` shipped a render throw because no browser visited it. A contrast regression, a 30 px control, or a render throw on `/[circle]/documents` or `/[circle]/people/subject/[subject]` ships green — and the reviewer who checks C6 by reading the manifest is told those pages are audited.
**Why the tests miss it.** `tests/design/audit-manifest.test.ts` asserts only `expect(claim.leg).toBeTruthy()` and `expect(typeof claim.leg).toBe('string')`. The values are, in the file's own words, *"claims a round can check against the specs"* — the mechanism deliberately defers to a human, and this round is that human.
**What would close it.** Either add the three paths to an `auditRoute`-equivalent pass (the honest fix: extend `a11y.spec.ts`'s shell leg with `/${circle}/documents`, and A11Y-10 with axe + `expectTouchTargets` + overflow on `/people/log` and `/people/subject/{id}`), or rewrite the three manifest values as `OWED:` claims naming the unit that lands them — the manifest's own third option. Test/manifest only — **no DDL**.

##### R6/F-6 — MINOR — the manifest cites five leg titles verbatim, and none of the five exists.
**Confidence.** High — string comparison.
**Where.** `e2e/audit-manifest.ts` — `DOCS_DETAIL_LEG` and the entries for `/[circle]/documents`, `/[circle]/people`, `/[circle]/people/[member]`, `/[circle]/people/subject/[subject]`.
**Claim under test.** The manifest's contract: *"naming the browser leg that audits it … a test title in `e2e/`"*, and traps.md §5: *"CITE E2E LEGS BY TITLE."*
**What I found.** Every cited title differs from the shipped one:

| manifest says | the leg is actually titled |
|---|---|
| `"documents list: by category and subject at the member's own level, counts post-filter; Nothing filed yet.; Add a document is an ingestion (DOC-01, AC-DOC-2)"` | `documents list: rows at the member’s own level, counts post-filter over the rendered tree; Add a document is an ingestion (DOC-01, AC-DOC-2)` |
| `keyboard: "A11Y-11: page navigation by keyboard; the machine-read sibling reachable as native text is; 390px"` | `A11Y-11: the viewer at 390px — axe clean, alt text on every page, the machine-read sibling reachable by keyboard as native text is` |
| `"A11Y-10: … the printed log readable"` | `A11Y-10: … the printed log readable — at 390px` |
| `"adjust: … the care ceiling never offered above (PPL-02)"` | `adjust: … the care ceiling never offered above (PPL-02, AC-PERM-5)` |
| `"the subject's page: …"` (straight apostrophes) | `the subject’s page: …` (curly) |

The first two are not cosmetic: the documents-list citation still describes the *pre-build* leg (it promises `Nothing filed yet.`, which ADR-0037 D12.2 explicitly moved to vitest), and the A11Y-11 citation names a leg whose claim ("page navigation by keyboard") no leg makes — see R6/F-8.
**Failure scenario.** A reviewer or a future round runs `npx playwright test -g "<manifest title>"` to check a C6 claim and gets **zero legs**, which reads identically to "the leg was deleted". Round 18's two-legs-checking-less-than-their-titles was found precisely by comparing titles to assertions; a title index that does not match the tree defeats that method.
**Why the tests miss it.** `tests/design/audit-manifest.test.ts` never compares `claim.leg` to any string in `e2e/*.spec.ts`.
**What would close it.** Paste the exact titles (they are one `git grep "test('"` away), and — since ADR-0026 says if it can be a scanner it must be — extend `audit-manifest.test.ts` to extract quoted `spec — "…"` fragments from each claim and assert each appears verbatim in some `e2e/*.spec.ts`. Test/manifest only — **no DDL**.

##### R6/F-7 — MINOR — DOC-01's list leg proves neither half of its own title: only the founder is driven, and the count is read only in the view where post-filter and pre-filter are identical.
**Confidence.** High for the mechanism; the row's substance is unit-backed, which is why this is MINOR not MAJOR.
**Where.** `e2e/documents.spec.ts` — leg "documents list: rows at the member’s own level, counts post-filter over the rendered tree; Add a document is an ingestion (DOC-01, AC-DOC-2)"; surface `app/(app)/[circle]/documents/page.tsx`.
**Claim under test.** The title: *"rows **at the member's own level**, counts **post-filter** over the rendered tree"*. `docs/coverage.md` DOC-01 assertion column: *"The list by category and subject at the member's own level … count post-filter"*.
**What I found.** Three things:
- The leg drives **only `f.page`** — the founder, a coordinator with manage on everything. `theMember(browser, 'dan')` is never called in this leg. No second level is ever observed, so "at the member's own level" has no discriminating case; for a full-access reader every level renders the same list.
- The count is read once, on `/{circle}/documents` with **no `?category=`**, where the page computes `const filtered = category ? rows.filter(...) : rows` — i.e. `filtered === rows`. A page that captioned the list with `rows.length` instead of `filtered.length` (the actual "pre-filter count" defect) is indistinguishable here. The one URL that would discriminate (`?category=medical` with a second category present) is never visited.
- The comparison itself is loose: `await expect(f.page.locator('main')).toContainText(`${rows} document${rows === 1 ? '' : 's'}`)` is a **substring** match over all of `main`, which also contains the tab captions `All (N)` and `Medical (M)`. `"12 documents"` contains `"2 documents"`; `"11 documents"` contains `"1 document"`. A count off by a leading digit passes.
**Failure scenario.** The caption is changed to `{rows.length} document…` (pre-filter). Green. Or the caption drifts to `1{n} documents` through a formatting bug. Green.
**Why the tests miss it.** The row's real cover is `tests/routes/documents-list.test.ts` (*"the tab counts AND the rows computed over exactly what RLS returned"*), which the coverage cell names — so DOC-01 does not fall. The leg's **title** is what over-claims.
**What would close it.** Visit `?category=medical` once and assert `filtered.length` there against the rendered `.record-list > li` count; use `toHaveText`/an exact regex (`new RegExp(`\\b${rows} documents?\\b`)`) rather than a bare substring; and read the list once from Dan's live context for the "own level" clause. Leg-only — **no DDL**.

##### R6/F-8 — MINOR — A11Y-11's row claims "page navigation by keyboard through the ONE artifact route"; there is no page navigation and no leg asserts any, and the keyboard half proves state, not reach.
**Confidence.** High that nothing asserts it; the "there is nothing to navigate" reading is the charitable one and I state it as such.
**Where.** `e2e/documents.spec.ts` — leg "A11Y-11: the viewer at 390px — axe clean, alt text on every page, the machine-read sibling reachable by keyboard as native text is"; surface `app/(app)/[circle]/documents/[document]/page.tsx` (`<ol className="document-pages">`) and `components/review/MachineReadText.tsx`.
**Claim under test.** `docs/coverage.md` A11Y-11 assertion column: *"The Documents viewer (slice 7): **page navigation by keyboard through the ONE artifact route**; the machine-read sibling reachable exactly as native text is; at 390px"* — row **green**.
**What I found.** The viewer renders every page as a stacked `<li><img …><p>Page N</p><MachineReadText/></li>`; there is **no pager, no next/previous control, no page list** — so "page navigation by keyboard" has no target, and the leg asserts none. That is defensible as design, but the row's assertion column still carries the clause and the row is green; the manifest compounds it by naming a leg titled *"A11Y-11: page navigation by keyboard; …"* that does not exist (R6/F-6).
Second, the keyboard assertion is:
```ts
await toggle.focus();
await page.keyboard.press('Enter');
await expect(toggle).toHaveAttribute('aria-expanded', 'true');
```
`MachineReadText`'s `toggle()` sets `setExpanded(next)` *before and independently of* the fetch, so `aria-expanded="true"` is true even when the sibling fetch 404s, fails, or returns empty. The title says *"reachable **as native text is**"* — the text being reached is proven only by mouse, in the DOC-02 leg (`await expect(f.page.locator('pre.review-machine-text')).toContainText(/Wound care|Discharge/)`).
**Failure scenario.** The `&text=1` fetch regresses to a 404 for OCR'd pages. A11Y-11 still passes (`aria-expanded="true"`, `.micro-meta` "No machine-read text is stored for this page." — which is itself **excluded from the axe run** by `CONTRAST_EXEMPT`). The keyboard path reaches a toggle that reveals nothing.
**Why the tests miss it.** The two halves are split across two legs and neither closes the loop by keyboard.
**What would close it.** In A11Y-11, after `Enter`, assert the text: `await expect(page.locator('pre.review-machine-text')).toContainText(/Wound care|Discharge/)`. And either strike "page navigation by keyboard" from A11Y-11's assertion column with a one-line note that the viewer stacks its pages, or add the pager the clause presumes. Leg + coverage wording — **no DDL**.

##### R6/F-9 — MINOR — A11Y-10's title clause "meaning never by colour" has no assertion behind it at all.
**Confidence.** High.
**Where.** `e2e/people.spec.ts` — leg "A11Y-10: the plain line first; **the matrix keyboard-operable; meaning never by colour**; the printed log readable — at 390px".
**Claim under test.** `docs/coverage.md` A11Y-10 assertion column: *"… **meaning never by colour**; the printed access log readable"* — row **green (7C C6)**, citing this leg.
**What I found.** The only thing near the claim is a comment — *"meaning carried by the checked state and its WORD, never by colour alone"* — with no `expect` under it. `axeViolations()` cannot stand in: axe has no "information conveyed by colour alone" rule (1.4.1 is not machine-checkable and is not in the WCAG rule set axe runs), and the `.section-label` / `.micro-meta` exclusions further narrow what it sees. The nearest genuine evidence is the surface itself — `<label><input type="radio" …/><span>{LEVEL_OPTION_WORD[l]}</span></label>` renders the word — but the leg never reads a word.
**Failure scenario.** The level options are restyled to swatches (`<span className="level-dot level-summary"/>`) with the word dropped to a `title`. Nothing in the suite fails; A11Y-10 stays green with meaning carried by colour alone.
**Why the tests miss it.** A three-clause title with two clauses tested. This is precisely round 18's category.
**What would close it.** One assertion: `await expect(scheduleForm.locator('label').first()).toContainText(/Nothing|Activity|Summary|Everything|Manage/)` — or an exact-set check of the rendered level words against `LEVEL_OPTION_WORD`. Leg-only — **no DDL**.

##### R6/F-10 — MINOR — PPL-04's leg cites AC-PPL-7 and asserts nothing about denials; its "the chrome hides" check would also pass on a selector that never existed.
**Confidence.** High for both halves.
**Where.** `e2e/people.spec.ts` — leg "the access log rendered and printed (PPL-04, **AC-PPL-5/7**)"; surface `app/(app)/[circle]/people/log/page.tsx` (`entryLine`'s `access_denied` branch) and `app/globals.css` `@media print`.
**Claim under test.** The title's `AC-PPL-7`; `docs/coverage.md` PPL-04: *"denials never name the object (… **AC-PPL-7**)"*.
**What I found.** The leg seeds no denial and asserts nothing about one — no collapsed count, no absence of an object name. It asserts `entries.count() > 0`, `main` contains `People Founder` (honest: `TopBar` shows the **email**, not the display name, and sits outside `<main>` — so this can only come from `entryLine`'s `actor_display_name`), and then:
```ts
await f.page.emulateMedia({ media: 'print' });
expect(await f.page.locator('nav.left-nav').isVisible()).toBe(false);
expect(await entries.first().isVisible()).toBe(true);
```
`emulateMedia` **is** applied before the assertion (good — that trap is avoided), but `Locator.isVisible()` is a non-retrying one-shot that returns `false` for a **non-existent** element as readily as for a hidden one, and the leg never establishes the control (that `nav.left-nav` was visible *before* the switch). The print rule it is meant to prove is `@media print { .left-nav, .topbar, .back-link, button, .record-controls { display: none !important } }`.
**Failure scenario.** The nav's class is renamed, or the log page is moved out of the `(app)/[circle]` layout: `nav.left-nav` does not exist, `isVisible()` returns `false`, the leg passes and reports that the print sheet hides chrome it never saw. Separately, a regression that let `entryLine` render an object name on an `access_denied` row would not fail anything in this leg.
**Why the tests miss it.** AC-PPL-7 is genuinely covered by `tests/routes/access-log.test.ts` (the coverage cell says so), so PPL-04 does not fall — the **title** claims an AC the leg does not touch, and the print check lacks its control.
**What would close it.** Add the control (`expect(await f.page.locator('nav.left-nav').isVisible()).toBe(true)` before `emulateMedia`, or `await expect(nav).toBeHidden()` after asserting it existed), and either seed one `access_denied` row and assert the collapsed count with no object name, or drop `/7` from the title. Leg-only — **no DDL**.

#### R6 confirmations
All twelve new legs are accounted for; the eight not carrying a finding above are honest, and the four strongest are named first.

- **"share / unshare: one document to the caregiver — her context sees IT and not a task derived from it; unshare is one action and her next look loses it (DOC-04, AC-DOC-5, AC-PERM-10)"** — the best leg in the increment, and the one the brief's item (d) was aimed at. `before`, the post-share read, the derived-task probe and `after` all go through **`marisol.page` / `marisol.page.request`**, the memoized context object created at provisioning — the same authenticated context on both sides of the revocation, never a fresh one. The 404 → 200 → 404 sequence around a share and a one-action unshare cannot be produced by a no-op. The step-up wait is also correct and deliberately so: `button:has-text("Share it with Marisol")` renders **only** under `shareTarget && stepUp` (the pre-step-up branch renders `Confirm it's you` instead), so the `toBeVisible()` cannot be satisfied by the stale pre-step-up page — the leg-33 trap is genuinely avoided, not merely commented about.
- **"revoke: the pre-revocation URL leg with the honest limit in the PRD’s words (PPL-03, AC-PPL-4)"** — the sensitive leg, and it is honest. `artifactUrl` is captured once and fetched **twice from Petra's own live context** (`petra.page.request.get`), 200 then 404, with the revocation in between driven through the real screen; `expect(preFetch.headers()['cache-control']).toBe('private, no-store')` is an exact match on the one URL whose caching could outlive a revocation; the copy assertion matches the page's `someone&apos;s` byte-for-byte; `waitForURL(/removed=1/)` cannot match the pre-click `?remove=1` (the extra `d`), so there is no stale-URL match; and `petra.page.goto(...)` + `waitForURL(/\/sign-in/)` fails if the redirect does not happen (the `goto` has already settled the redirect). Petra is a dedicated member, so no other leg's cast is removed under it.
- **"nav follows access — a caregiver’s nav is Tasks · Account, a family member’s is Timeline · Documents · People · Account; the hand-built URL is refused regardless (NAV-01)"** — `expect(hrefs).toEqual([...])` is an **exact-array** assertion in both directions, over two different live contexts, and it matches `navFor()`'s three compositions exactly; a nav that fell open to the full manifest (`navFor`'s unknown-tier branch) fails it. `marisol.page.request.get(/people/${dan.memberId})` → 404 is a real refusal (`if (!person || me?.tier !== 'coordinator') notFound()`), from her live context, not a fresh one.
- **"adjust: a raise through step-up, a lower without; the care ceiling never offered above (PPL-02, AC-PERM-5)"** — all three clauses discriminate. The lower is proven by `waitForURL(/\?changed=1/)` succeeding where a step-up would have produced `e=step-up`; the raise is proven by the opposite (`waitForURL(/e=step-up/)`), the password round-trip, and a **post-state** check (`toBeChecked()` on `summary`) rather than a marker; the ceiling counts are real negatives — `TIERS.care_circle.defaultGrants = [{ domain: 'schedule', level: 'summary' }]`, so `optionsFor` legitimately emits no `view`/`manage` radio and `offeredDomains` legitimately omits `health`, and removing the ceiling filter makes all three counts non-zero. No stale-URL pairing anywhere in it.
- **"documents detail: sentences at summary with no viewer and no control; at view the pages through the artifact route with the machine-read sibling (DOC-02)"** — honest on both depths. `waitForResponse` is armed **before** the `goto` and requires `status() === 200` on `/api/artifact/{arrival}?page=1`, so the byte path is proven, not assumed; the machine-read half opens the toggle and asserts the **transcribed words** (`/Wound care|Discharge/`) out of `pre.review-machine-text`, which is the OCR of glyphs the leg itself painted onto the uploaded PNG — a fixture cannot fake that round trip. Dan's summary half is driven from **his** memoized context and its four negatives (`section[aria-labelledby="the-document"]` = 0, `main img` = 0, no machine-read label, no `Share this document`, no `[disabled]`) each correspond to a branch that genuinely renders under `can_view` / `can_manage`. Its one weak clause is scale, recorded as an observation below.
- **"the subject’s page: the custodianship declaration and the profile facts at view (Q4(b), RCP-02’s profile link)"** — honest. Here `toContainText('custodian')` **does** prove naming (the clause is conditionally rendered: `{subject.custodian_name ? <> by {…} (custodian)</> : null}`), and `'custodian'` lowercase is not a substring of `'Custodianship declared'` (capital C), so the two assertions are independent. `'high'` appears nowhere else on this page (I checked every string it renders), so the `risk_class` word is really being read. `Custodianship declared` renders only when the declaration row is visible.
- **"documents list: … Add a document is an ingestion (DOC-01, AC-DOC-2)"** (the ingestion clause only — the rest is R6/F-7) — this half is real: the control is asserted to be `main a[href="/{circle}/upload"]`, the navigation is driven, and `input[type="file"]` is asserted **on the destination**, so an in-place uploader on the Documents page fails it. The pre-click URL (`/{circle}/documents`) cannot match `**/upload`, so there is no stale-URL match.
- **"the access log rendered and printed (PPL-04, AC-PPL-5/7)"** (the rendered half — the rest is R6/F-10) — `.log-entries li` count > 0 plus `People Founder` in `main` is a genuine read of `entryLine`'s `actor_display_name`: the `TopBar` chip carries `read.claims.email` (`people.founder.{stamp}@example.com`), not the display name, and sits outside `<main>`, so the assertion cannot be satisfied by chrome.
- **The two flipped held rows, TSK-03/04** — `git diff 18c362d..ccd854b -- e2e/` touches only `audit-manifest.ts`, `documents.spec.ts` and `people.spec.ts`. `e2e/record.spec.ts` — which holds "tasks: assign in two taps; the sibling’s source resolves; counts over the rendered tree; a caregiver’s first open never blank (TSK-03, TSK-04, AC-TASK-1/4/5)" — is **byte-unmodified** across the increment. 7C did not touch the leg whose passing discharges the ADR-0036 Q-H hold; the discharge rests only on the run, which is D11's record and outside my reach.
- **The count** — 57 = 45 + 12, verified at both heads by counting `test(` across `e2e/*.spec.ts`: `a11y 9 · extraction 5 · ingestion 8 · onboarding 11 · record 5 · review 7` = 45 at `18c362d`; plus `documents 5 · people 7` = 57 at `ccd854b`. No `test.skip`, no `test.only`, no loop-generated legs. The packet's arithmetic is exactly right.
- **The page-gate filesystem pin** — honest and complete. All six new 7C pages and all five new form routes are entries, the walk over `app/**` for `from '@/lib/auth/(session|gate)'` fails both ways on an unlisted or stale file, and the hard counts (`19` pages / `16` routes / `1` layout) give a second, independent tripwire. This is the one 7C manifest whose positive control I could verify by construction.

#### R6 recorded dissents and observations
- **Not filed, per D12.2.** The list leg does not assert *"Nothing filed yet."*, and it should not: ADR-0037 D12.2 rules it to the vitest contract because *"a shared circle accumulates, and a leg needing emptiness has a hidden precondition (ADR-0026 D19's class)"*. Settled, and correctly so.
- **Scale, not honesty.** `provisionDocument` paints a single 1240×900 PNG, so `d.pageCount` is 1 and DOC-02's *"every page renders through the ONE byte path"* / *"ONE control per page"* and A11Y-11's *"alt text on every page"* are each proven over exactly one page. The assertions are correctly written as counts against `pageCount`, so they would scale — but no multi-page artifact ever drives them. Worth a two-page source next time; not a defect today.
- **DOC-04's derived-task probe has no positive control.** `expect((await marisol.page.request.get(`/${f.circleId}/tasks/${taskId}`)).status()).toBe(404)` does discriminate against share-propagation (propagation would make it 200), so it is not vacuous — but nothing in the leg establishes that this task URL is reachable by *anyone*. A fixture task that is invisible by construction (a missing index row, a wrong path shape) would make the 404 unconditional and the AC-PERM-10 clause silently free. One line — the founder fetching the same URL and getting 200 — would close it. Below MINOR because 069:20 and 066:32–39 carry the claim at the DB layer.
- **The axe exclusion is broader than its name, inherited verbatim.** `CONTRAST_EXEMPT = ['.section-label', '.micro-meta']` is applied as `builder.exclude(selector)`, which removes those subtrees from **every** WCAG rule, not just `color-contrast`. In A11Y-11 that silently exempts all four of `MachineReadText`'s own result states (`Reading…`, the empty/absent/failed sentences — every one a `.micro-meta`), which is the very component the leg's title is about. This is a11y.spec's settled pattern replicated verbatim (and G12 re-audits each use), so I file a **dissent, not a defect**: the honest form is `builder.disableRules(['color-contrast']).exclude(…)` on a second pass, or `withRules`-scoping the exemption, so that a missing-name or role violation inside an exempted node still reports. The r4 `target-size` catch proves the exclusions did not swallow the action links, which is the case that mattered most.
- **The ceiling's "no other domain" is checked for one domain.** The adjust leg asserts `form:has(input[name="domain"][value="health"])` count 0. `care_circle` offers only `schedule`, so a bug that leaked `finances` or `memories` while still hiding `health` would pass. `tests/routes/member-detail.test.ts` carries PPL-02's app half; an exact-set assertion on the rendered `input[name="domain"]` values would make the leg say what its title says.
- **Coverage citation drift on TSK-03/04.** The rows cite the leg as `"tasks: assign in two taps; the sibling's source resolves; counts over the rendered tree; a caregiver's first open never blank"` — the real title is that plus `(TSK-03, TSK-04, AC-TASK-1/4/5)` and uses curly apostrophes. Recognisable, so not a finding; but it is the same class as R6/F-6 and the same one-line fix would catch both.
- **`workers: 1` and no `fullyParallel`** means declared order is real order, so I checked order-dependence explicitly: every leg in both files calls its own memoized provisions (`theFounder` / `theMember` / `theDocument` / `theArrival`), the revoke leg owns a dedicated member (Petra), the re-categorise leg owns a dedicated fixture document, and the adjust leg returns Dan's health grant to the family default before it ends. I found **no hidden precondition of the ADR-0026 D19 class** in either new spec — the D8 "runnable by title" claim holds as written.

## Answers to the pointed questions (the round's, drawing on the lens answers above)

**Q-A — RATIFY, conditioned.** ACCEPT as the §4.3.5 reading for Phase 1,
noted beside AC-DOC-5. The packet's apparent tension dissolves once the
code is read (R2's Q-A answer, in full above): the share-holder's
"sentences" are `documents.summary_text` — a column on the row rung 5
unlocks — not extractions; `can_view` stays the ARRIVAL's view×5, which a
document share does not satisfy, so `extractionsFor` and the viewer never
run for her. Both D2 and D12.1 are simultaneously true. Two conditions:
(1) R2/F-7's pins land — the narrowing is currently asserted by **no test
at any layer**, and the one-token edit that would break it (`'document'`
for `'arrival'` in `documentById`'s `can_view`) is silently satisfied by
rung 5 for every share-holder; (2) D12.1's enumeration is amended to
"title, category, dates, the sentences, and who approved it and when" —
the row shows the approver, and the enumeration should not understate
beside AC-DOC-5. Share-includes-bytes stays a slice-8 DDL question.

**Q-B — QUALIFIED DISSENT: fix, then accept the narrowed claim.** The
policy half is ratified — no episode page exists, none was promised, and
RCP-02 does not owe one. But at `ccd854b` the recommendation's own words
("met by the surface that renders it") are not met unconditionally: the
link drops the subject `receiptLine` is holding, so in a multi-subject
circle the reader lands on the DEFAULT subject's thread where the wrapper
cannot render (R4/F-2, with two further mechanisms: the receipt's
episode-row predicate vs the wrapper's member-event predicate, and
`listEvents`' oldest-300 window). The round's recommendation is R4's:
land the two-line fix (`?subject=${subjectId}` plus an `id` on the
episode section and a fragment on the link), then ACCEPT with RCP-02's
cell carrying the two remaining narrowings in words. Accepting as-recommended
without the fix would green a cell on the weaker reading ("resolves to a
surface that renders episodes") that its own text does not state.

**Q-C — RATIFY.** The ADR binds; a one-line PRD erratum at sign-off; no
code change. R2 verified the live pin loops **all seven** categories
against `hc.own_domain` and fails on drift in either direction, and that
no shipped surface says "documents" where the map says finances — the
only domain word a person reads is composed from `categoryDomain()` and
renders "finances", matching §4.3.2's own example sentence.

**Q-D — RATIFY, with one fold-in.** Accept the dev/prod split as stated
in PPL-03's cell; the hosted-runtime header observation rides OW-09. R5
confirmed the artifact route stamps `private, no-store` on every response
shape and the PPL-03 leg asserts it on the one URL whose caching could
outlive a revocation — where caching actually bites. One addition the
packet did not name: `proxy.ts`'s missing-env early return passes through
unstamped (R5/F-2) and neither the unit pin nor any gate condition can
see it — fold it into the same cell or fix it (the stamp costs one line),
rather than leaving it for a future round to rediscover.

**Q-E — RATIFY, with the owed item's acceptance condition widened.** The
teed log + tally stand as the r5 record (r3/r4 failure traces ARE
retained, and every red between runs has a commit naming its mechanism).
Open the one expected T3 owed item — reporter and JSON path INTO
`playwright.config.ts` — but R5's condition must ride it: the base
config's `trace: 'retain-on-failure'` means a config-borne, unoverridden
run retains **no traces on an all-green run by design**, so an item that
names only the reporter/JSON path reintroduces exactly this round's
evidentiary gap at the next complete green. Either pin `trace: 'on'`
(accepting the disk cost) or record, on the record, that a green run
carries no per-test traces and why that is acceptable.

**Q-F — see the UXA-04 section below.**

**The packet's open re-rule (its evidence section, "yours to re-rule"):
RATIFIED.** `db:verify` and the upgrade leg stay NOT RUN at this head.
Both exist to exercise DDL; 7C ships none, `supabase/` and `scripts/` are
byte-identical to base by measured tree hash, and the clean-leg reset at
exact 74 plus pgTAP on it are the migration-state evidence. Requiring the
two legs at the dispositions head would add nothing to what the tree hash
already proves.

## Q-F — UXA-04, the copy read (this round's row; homes as enumerated in the packet)

**Verdict: the copy is faithful to the PRD's words at every enumerated
home, and the row can flip at dispositions once one sentence is amended
or ruled.** Read against PRD §7.5, §4.6.1, §4.6.3, §4.3.2, TSD §6.9 and
§8.6 (the data-display standard), by the integrating session, with the
lens findings above carrying the defects:

- **§7.5's framing holds, verbatim in shape, and "authority" appears on
  no surface.** The People list: *"holds the highest access to their own
  record, with no account attached · custodian: …"*. The subject page:
  *"This is X's record, held on their behalf by Y (custodian). Everything
  done with it is written down — the family's log can be printed for them
  today."* — the smaller true way, exactly as ruled.
- **The honest limit is in the PRD's exact words at the moment of
  revocation**, with the unreached channels named (background jobs,
  notifications, exports). *"Background jobs re-check access when they
  run"* is §4.6.3's own table row — the copy states the PRD's design,
  not more than this slice proves; recorded as an observation, not a
  defect.
- **§4.3.2's move sentence ships in its shape with names and both
  directions** (*"This moves it out of X into Y. … will be able to see
  it. … will no longer be able to see it."*), explicit confirmation, and
  an honest way out (*"Keep it where it is"*). The stale-preview marker
  says the true thing (*"This document changed while you were looking at
  it."*).
- **§4.3.5's rules are said on the share screen in one sentence** (one
  document, one person, never the domain, never anything derived); the
  unshare notice's next-look semantics matches DOC-04's contract.
- **§6.9's label is character-exact** (*"machine-read — may contain
  errors"*) through the ONE component on both surfaces; absent and failed
  are distinct sentences (their remaining dishonesty under storage faults
  is R1/F-4, a route matter, not copy).
- **The auth overrun copy is honest** on every page that reads `e=slow`
  (*"That took too long to answer. Nothing is lost — try again."*), and
  §8.6's rules hold across the set: counts plain, dates human, empty
  states a sentence, provenance visible (approver and date on the detail;
  facts with citation and `risk_class` word).

**The copy defects, all carried by lens findings above — not renumbered
here:**

1. **The log page's lead sentence is the one UXA-04 string that is false
   at scale** — *"Everything done with the record … it prints exactly the
   entries below"* over an undisclosed 300-row cap (R4/F-3; caught
   independently in this session's read). The row should not flip while
   it stands unamended: either the cap is disclosed in the sentence and
   the print projection, or the cap goes.
2. *"custodian: named at setup"* — a claim-shaped hedge rendered when no
   custodian resolves (the fallback R6/F-4 shows the tests cannot see).
   AC-AUTH-6 makes the state unreachable in a well-formed circle; copy
   hygiene, not a leak.
3. `risk_class` renders as a raw enum token in a family-facing sentence
   on the subject page (R4's observation) — reads acceptably for
   high/low; the one place §8.2's voice is carried by the database rather
   than by copy.
4. OBS: the list's limit sentence names reads, search and the log but
   drops "presence" from the four channels AC-PPL-1's sentence names — an
   understatement, in the safe direction.

**Recommendation on the row:** flip UXA-04 at dispositions **conditioned
on item 1** (R4/F-3's disclosure or the cap's removal); items 2–4 are
observations for the record.

## Confirmations — clean areas, named

- **The head ledger, tree bindings, PR state and every quoted tally
  verified** (the header above). The five-run gate record is consistent
  with the teed logs: no leg re-run to green, each red carrying its
  mechanism in a commit.
- **The byte path's referent is clean today** (R1): one route file, the
  walk self-proving, `getPublicUrl` nowhere, `createSignedUrl` consumed
  in-function only, the TUS proxy echoes no bytes, no second
  byte-producing surface of any shape, "never a raw `&text=1`
  navigation" true, §6.9's extraction byte-identical on both surfaces.
  The fence's PREDICATES are the findings; its referent is not.
- **The three depths hold and `extractionsFor` is genuinely fenced**
  (R2): no ordering, parallelism or error path reaches facts, pages or
  the sibling below `can_view`; no disabled control at summary; the r3
  fix is real and its pin would fail on the pre-fix shape; hidden,
  foreign, deleted and nonexistent are one 404; the share step-up is
  bound server-side to the posted document id; the re-categorise TOCTOU
  genuinely closes on `expected_category`.
- **The step-up core holds** (R3): forged `rs/rd/rl` die at
  `hc.consume_step_up`'s exact-match binding; the lower-vs-raise
  arithmetic is advisory and the definer re-decides under the advisory
  lock; replay loses the atomic-update race; the care ceiling holds on
  both halves and its live test discriminates (the token would land
  without the cap); send-again's old token is dead before the redirect,
  the fresh invite's subjects render unchecked, and the create path
  refuses an empty set; the one 404 covers the member page.
- **The phrases module is the cleanest thing in the increment** (R4): no
  caller can put `hidden` or an unworded level into a sentence; the enum
  pin is genuinely live — the strongest single assertion in the
  increment; the log renders no `detail` JSON and no object name; print
  is one render path; D9 holds exactly as stated with the tier a
  per-request read and exact-array nav assertions; the custodianship
  declaration is honest in both directions.
- **OW-16 and OW-23 hold as claimed** (R5): the round-20 qualifier
  marked, all seven auth submits inside `withRouteBudget` with every
  `e=slow` marker read, create-account's compensation before surfacing,
  wasnt-me's absorb in mechanism not just name, the scanner's positive
  control a real filesystem walk. The keep-shares contract holds
  including the scoping question: both parse forms land, and a crafted
  id fails the WHOLE removal closed at `hc.remove_member`.
- **The gate's arithmetic and the flipped holds** (R6): 57 = 45 + 12
  counted at both heads; `e2e/record.spec.ts` byte-unmodified, so
  TSK-03/04's ADR-0036 Q-H discharge is undisturbed by any 7C edit; the
  page-gate filesystem pin honest both ways with hard counts; no hidden
  precondition of the ADR-0026 D19 class in either new spec. The four
  strongest legs — share/unshare, revoke, nav, adjust — are genuinely
  load-bearing, each named with its discriminating mechanism in R6's
  confirmations.

## Recorded dissents and observations (session-level; each lens's own stand above)

- **The count, re-tallied by command:** 42 lens findings — 16 MAJOR, 21
  MINOR, 5 OBS, 0 BLOCKER (R1: 3/1/1 · R2: 2/5/0 · R3: 2/5/1 · R4:
  3/4/3 · R5: 1/1/0 · R6: 5/5/0). The disposition ADR's re-tally must
  reconcile against these numbers and against the `#####` heading count
  in this file.
- **Green rows touched by findings, for the disposition session's
  ledger:** DOC-03 (R6/F-2, R2/F-1), PPL-01 (R6/F-3/F-4), A11Y-10
  (R6/F-1/F-9), A11Y-11 (R6/F-8), PPL-04 (R4/F-3, R6/F-10, R4/F-8),
  LOG-01's app half (R4/F-3), RCP-02 (R4/F-1/F-2), DOC-05 (R5/F-1),
  DOC-01 (R6/F-7 — title only; the row's unit half stands), DOC-02/PPL-02/
  PPL-03/PPL-05/NAV-01/TSK-03/TSK-04 untouched by any finding.
- **Owed rows touched:** OW-07 and OW-19 (R5/F-1 — the time half of both
  CLOSED rows' acceptance text); the one new T3 item Q-E expected (with
  R5's widened condition); candidates the dispositions session may open
  from R3/F-6 (the `people` tree into the AnswerBudget scanner) and
  R6/F-5 (the three unaudited pages) if not fixed outright.
- **Dissents recorded by lenses, kept distinct from defects:** R1's
  scanner-shape observation (exact-set importer pins over name greps);
  R2's count-never-name-at-summary tension (ruled at round 24 — dissent,
  not defect) and four route-hygiene observations; R3's level-unbound
  step-up token (a slice-8 DDL question if the owner wants it), the
  two `hidden`-words-outside-the-module notes, and the uninformed
  re-choice of invite scope; R4's non-mention-vs-non-inference
  distinction on `plainLine`, the `/people`-roster-to-care-circle
  precision on D9, and the plan's C5 subject-page path moved
  (`/people/subject/[subject]` — a necessary disambiguation that belongs
  in D8 as a one-line narrowing); R6's CONTRAST_EXEMPT dissent (the
  exclusion removes whole subtrees from every axe rule, not just
  contrast — a11y.spec's settled pattern, filed as dissent).
- **This file is the record; nothing in it was fixed.** Next leg:
  **dispositions (ADR-0038)** in a fresh session, then owner sign-off —
  the owner is sole merge authority; a merge commit, never a squash.

⏸ **STOP at the gate.**
