import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { canIngestForSubject, createUploadArrival } from '@/lib/hc/upload';
import { enqueuePipeline } from '@/lib/hc/ingest';
import {
  downloadObject,
  removeObject,
  stageIntakeObject,
  uploadStagingKey,
} from '@/lib/storage/artifacts';

/** The P5 per-file cap (PRD §13.3), re-checked against MEASURED bytes. */
const FILE_BYTES_MAX = 52428800;

/**
 * POST /api/upload/complete — §2.12's completion (slice-4 plan B3):
 * rights RE-CHECKED at write time (a grant lowered mid-upload bites,
 * the §4.9 principle), the staged bytes measured (the declared size
 * never grandfathers the real one), the sha computed, the
 * upload-channel arrival created keyed to THIS attempt, the bytes
 * re-staged under the store worker's intake contract, and the work
 * enqueued. The eager store fire rides after() — acceptance never
 * waits on processing.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) return new Response('sign in first', { status: 401 });

  let subjectId: string;
  let uploadId: string;
  try {
    const body = (await req.json()) as { subject_id?: unknown; upload_id?: unknown };
    if (
      typeof body.subject_id !== 'string' ||
      !body.subject_id ||
      typeof body.upload_id !== 'string' ||
      !body.upload_id
    ) {
      return new Response('malformed', { status: 400 });
    }
    subjectId = body.subject_id;
    uploadId = body.upload_id;
  } catch {
    return new Response('malformed', { status: 400 });
  }

  const right = await canIngestForSubject(claims, subjectId);
  if (!right) return new Response('not found', { status: 404 });

  const stagingKey = uploadStagingKey(right.circle_id, subjectId, uploadId);
  const staged = await downloadObject(stagingKey);
  if (!staged) {
    return Response.json({ refused: 'upload_missing' }, { status: 400 });
  }
  if (staged.bytes.byteLength < 1 || staged.bytes.byteLength > FILE_BYTES_MAX) {
    return Response.json({ refused: 'over_file_size' }, { status: 400 });
  }

  const sha256 = createHash('sha256').update(staged.bytes).digest('hex');
  const { arrivalId } = await createUploadArrival({
    circleId: right.circle_id,
    subjectId,
    byteSize: staged.bytes.byteLength,
    mimeDeclared: staged.contentType || null,
    uploadId,
  });

  // The store worker's staging contract; idempotent on completion retry.
  await stageIntakeObject(right.circle_id, arrivalId, staged.bytes, staged.contentType);
  await removeObject(stagingKey);
  await enqueuePipeline(right.circle_id, [arrivalId]);

  const origin = new URL(req.url).origin;
  after(async () => {
    const key = process.env.HC_WORKER_KEY;
    if (!key) return; // the sweeper is the recovery story
    await fetch(`${origin}/api/worker/store`, {
      method: 'POST',
      headers: { 'x-worker-key': key },
    }).catch(() => {
      // A dropped eager fire is a delay, never a loss (§1.4).
    });
  });

  return Response.json({
    arrival_id: arrivalId,
    sha256,
    byte_size: staged.bytes.byteLength,
  });
}
