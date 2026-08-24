import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { logArtifactRead, readableArtifact } from '@/lib/hc/artifacts';
import { asServiceRole } from '@/lib/db/service-role';

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
  const upstream = await fetch(data.signedUrl, {
    headers: range ? { range } : undefined,
  });
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
