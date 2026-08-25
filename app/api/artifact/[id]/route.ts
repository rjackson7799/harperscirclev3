import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { logArtifactRead, readableArtifact, readableRendition } from '@/lib/hc/artifacts';
import { asServiceRole } from '@/lib/db/service-role';
import { promotedPageKey, promotedPageTextKey, type PageExt } from '@/lib/pipeline/page-keys';
import { fetchStorageWithin } from '@/lib/storage/fetch';

/**
 * GET /api/artifact/[id] — the §1.3 six steps, literally (slice-4 plan
 * B7; RLS-10 flips here; AC-PERM-2; AC-INBOX-15; AC-PPL-4). The ONE
 * sanctioned full asServiceRole() consumer outside the migration
 * runner — the A2 fence allowlist finally earns its slot. 049
 * pre-discharged NOTHING of RLS-10 (ADR-0018 Q-G): this route's own
 * discipline is the proof, at HTTP depth.
 *
 *   1. session → the RLS-scoped read. No row ⇒ 404, indistinguishable.
 *   2. hc.visible_at(...) ≥ view for the artifact itself (one query
 *      with step 1 — lib/hc/artifacts.readableArtifact).
 *   3. scan_verdict = 'clean', INDEPENDENTLY — a pipeline bug cannot
 *      expose an unscanned file; quarantined is not releasable by any
 *      read path. Every refusal on this route is the SAME 404 bytes:
 *      404 ≡ 403, no oracle, and a pre-revocation URL fails because
 *      every request re-runs steps 1–3 from live tables (AC-PPL-4).
 *   4. A 30-second service-role signed URL, created AND consumed
 *      server-side — it exists only inside this function's memory for
 *      one fetch; the bytes stream back through this route and the
 *      browser never receives a storage URL.
 *   5. Cache-Control: private, no-store. Range passes through.
 *   6. The artifact_read access-log entry — EVIDENCE BEFORE BYTES: the
 *      entry lands before the stream starts, and a failed entry
 *      refuses the read (§10.5's evidentiary posture). 5B B8: it rides
 *      5A M1's hc.log_artifact_read, which re-proves steps 1–2
 *      IN-FUNCTION, so the trail's authorization no longer depends on
 *      this route remembering to check first.
 */

function notFound(): Response {
  return new Response('not found', {
    status: 404,
    headers: { 'cache-control': 'private, no-store' },
  });
}

/**
 * 6B B2 (R4/F-6): a page the MANIFEST names that storage does not hold is
 * REPORTED, never 404'd. This branch is reachable only past every gate — the
 * caller is authorized, the artifact is clean, the manifest is theirs to
 * read — so the report leaks nothing; what it does is turn permanent partial
 * promotion from an invisible 404 into a named, repairable state the review
 * screen can say out loud ("page 3 of this document is missing").
 */
function renditionPageMissing(page: number): Response {
  return Response.json(
    { error: 'rendition_page_missing', page },
    { status: 503, headers: { 'cache-control': 'private, no-store' } },
  );
}

/**
 * 6B close-out F5 (ADR-0026 D18): storage did not answer in time. This is a
 * DIFFERENT fact from rendition_page_missing — that one says the manifest
 * names a page storage does not hold, which is permanent and repairable;
 * this one says the page is very likely there and the read stalled, which is
 * transient and retryable. Collapsing the two would tell the screen to say
 * "page 3 is missing" about a page that is not missing, and this route does
 * not guess. Like that report, this branch is reachable only past every gate
 * — authorized caller, clean artifact, their own manifest — so naming it
 * leaks nothing.
 */
function storageTimeout(page: number): Response {
  return Response.json(
    { error: 'storage_timeout', page },
    { status: 504, headers: { 'cache-control': 'private, no-store' } },
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) return notFound();

  // Steps 1+2 — one RLS-true query; zero rows is the one shape.
  const artifact = await readableArtifact(claims, id);
  if (!artifact) return notFound();

  // Step 3 — the independent clean gate (AC-INBOX-15).
  if (artifact.scan_verdict !== 'clean' || !artifact.storage_key) return notFound();

  // 6B B2: ?page=N serves the promoted rendering through this SAME route —
  // same gates above, same evidence discipline below, no second byte path.
  // 6B B9: &text=1 serves §6.9's machine-read sibling the same way.
  const search = new URL(req.url).searchParams;
  const pageParam = search.get('page');
  if (pageParam !== null) {
    return servePage(claims, id, artifact.circle_id, pageParam, search.get('text') === '1');
  }

  // Step 6 runs BEFORE bytes move: no trail, no read.
  try {
    await logArtifactRead({ claims, arrivalId: id });
  } catch (err) {
    console.error(`artifact: access-log write failed: ${(err as Error).message}`);
    return new Response('unavailable', { status: 500 });
  }

  // Step 4 — the signed URL lives and dies server-side.
  const { data, error } = await asServiceRole()
    .storage.from('artifacts')
    .createSignedUrl(artifact.storage_key, 30);
  if (error || !data?.signedUrl) {
    console.error(`artifact: signed url refused: ${error?.message ?? 'no url'}`);
    return notFound();
  }

  const range = req.headers.get('range');
  let upstream: Response;
  try {
    upstream = await fetchStorageWithin(data.signedUrl, {
      headers: range ? { range } : undefined,
    });
  } catch (err) {
    // F5: a storage read that stalls or refuses answers in the shape this
    // path already gives an unreachable storage — the ONE 404, never a leaky
    // body and never a request the caller waits out.
    console.error(`artifact: storage read of ${id} failed: ${(err as Error).message}`);
    return notFound();
  }
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
    console.error(`artifact: storage answered ${upstream.status}`);
    return notFound();
  }

  // Step 5 — stream through; the caller sees our headers, never storage's.
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'accept-ranges': 'bytes',
    'content-type':
      artifact.mime_detected ??
      upstream.headers.get('content-type') ??
      'application/octet-stream',
  });
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

/**
 * The promoted page (6B B2). Reached only past steps 1–3; from here:
 *   · the MANIFEST is the contract (6A M4): the page number must be one it
 *     names and the extension comes from it — a fact, never a default
 *     (R3/F-8). No manifest, a page outside it, or a malformed number all
 *     answer the ONE 404 shape — indistinguishable from every other
 *     refusal, and the manifest itself is read RLS-true so it cannot become
 *     an oracle.
 *   · evidence before bytes, unchanged: every page view writes its
 *     artifact_read entry through hc.log_artifact_read before a byte moves.
 *   · a manifest-named page ABSENT from storage is REPORTED (R4/F-6),
 *     never served as a ghost — see renditionPageMissing above.
 */
async function servePage(
  claims: Parameters<typeof logArtifactRead>[0]['claims'],
  arrivalId: string,
  circleId: string,
  pageParam: string,
  wantText = false,
): Promise<Response> {
  if (!/^\d{1,3}$/.test(pageParam)) return notFound();
  const pageNo = Number(pageParam);
  if (pageNo < 1) return notFound();

  const rendition = await readableRendition(claims, arrivalId);
  if (!rendition || pageNo > rendition.page_count) return notFound();
  const ext = rendition.page_exts[pageNo - 1] as PageExt | undefined;
  if (ext !== 'png' && ext !== 'jpg') return notFound();

  // Evidence before bytes — the same §1.3 step 6 the original rides.
  try {
    await logArtifactRead({ claims, arrivalId });
  } catch (err) {
    console.error(`artifact: access-log write failed: ${(err as Error).message}`);
    return new Response('unavailable', { status: 500 });
  }

  // 6B B9 · §6.9's machine-read sibling, through this same fence. The
  // sibling is NOT manifest-promised — only image-only sources have one —
  // so its ABSENCE is the ordinary 404 shape, never the
  // rendition_page_missing report: a page with no machine-read text is not
  // a partial promotion, and the one shape stays one shape.
  const key = wantText
    ? promotedPageTextKey(circleId, arrivalId, pageNo)
    : promotedPageKey(circleId, arrivalId, pageNo, ext);
  const { data, error } = await asServiceRole().storage.from('artifacts').createSignedUrl(key, 30);
  if (error || !data?.signedUrl) {
    if (wantText) return notFound();
    console.error(
      `artifact: promoted page ${pageNo} of ${arrivalId} refused by storage: ${error?.message ?? 'no url'}`,
    );
    return renditionPageMissing(pageNo);
  }
  let upstream: Response;
  try {
    upstream = await fetchStorageWithin(data.signedUrl);
  } catch (err) {
    // F5: the machine-read sibling is not manifest-promised, so its failure
    // stays the ordinary 404 — one shape, as everywhere else on this route.
    // The PAGE, which the manifest does promise, gets the named state.
    if (wantText) return notFound();
    console.error(
      `artifact: promoted page ${pageNo} of ${arrivalId}: ${(err as Error).message}`,
    );
    return storageTimeout(pageNo);
  }
  if (!upstream.ok) {
    if (wantText) return notFound();
    console.error(`artifact: promoted page ${pageNo} of ${arrivalId} answered ${upstream.status}`);
    return renditionPageMissing(pageNo);
  }

  const headers = new Headers({
    'cache-control': 'private, no-store',
    'content-type': wantText
      ? 'text/plain; charset=utf-8'
      : ext === 'jpg'
        ? 'image/jpeg'
        : 'image/png',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  return new Response(upstream.body, { status: 200, headers });
}
