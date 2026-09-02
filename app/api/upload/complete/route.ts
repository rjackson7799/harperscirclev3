import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { asUser } from '@/lib/db/user';
import { readLiveSession } from '@/lib/auth/session';
import { sessionUnavailable } from '@/lib/http/session-unavailable';
import { withRouteBudget } from '@/lib/http/page-budget';
import { boundedJsonText } from '@/lib/http/bounded-json';
import { canIngestForSubject, createUploadArrival } from '@/lib/hc/upload';
import { enqueuePipeline } from '@/lib/hc/ingest';
import {
  downloadObject,
  removeObject,
  stageIntakeObject,
  uploadKeyScope,
  verifyUploadTarget,
} from '@/lib/storage/artifacts';

/** The P5 per-file cap (PRD §13.3), re-checked against MEASURED bytes. */
const FILE_BYTES_MAX = 52428800;

/**
 * POST /api/upload/complete — §2.12's completion (slice-4 plan B3):
 * rights RE-CHECKED at write time (a grant lowered mid-upload bites,
 * the §4.9 principle), the staged bytes measured (the declared size
 * never grandfathers the real one), the sha computed, the
 * upload-channel arrival created, the bytes re-staged under the store
 * worker's intake contract, and the work enqueued. The eager store fire
 * rides after() — acceptance never waits on processing.
 *
 * The client passes the SERVER-SIGNED continuation target (round-13
 * finding 1), not a raw upload id: it is the source of truth for WHERE
 * the bytes landed. On a §13.4 resume the bytes sit under the ORIGINAL
 * attempt's staging key, so keying completion off a freshly-minted id
 * would miss them — the signed target reconciles that, and its key is
 * bound to the caller's re-checked circle + subject.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  // ROUND-19 F-2. Completion runs after the bytes are already staged, so a
  // false "sign in first" here throws away an upload that SUCCEEDED — the
  // person is sent to a sign-in screen holding a document the server has.
  const read = await readLiveSession(supabase);
  if (read.kind === 'unavailable') {
    console.error(`upload/complete: ${read.why}`);
    return sessionUnavailable();
  }
  if (read.kind !== 'signed-in') return new Response('sign in first', { status: 401 });
  const claims = read.claims;

  // 7C C2 (OW-19): completion is a person's wait; it answers inside the
  // route budget like every other one.
  //
  // 7D · OW-24 (ADR-0038 R5/F-1): the ingress read is inside the budget now,
  // for the same reason as the mint route — the size cap held, the time bound
  // did not exist, and a body that never ends parked completion outside every
  // guarantee this route makes. See app/api/upload/token/route.ts.
  return withRouteBudget(
    async (budget) => {
      // 7C C2 (OW-19): the ingress cap, BEFORE any parse or probe.
      const text = await budget.race(boundedJsonText(req), 'boundedJsonText');
      if (text === null) return new Response('too large', { status: 413 });

      let subjectId: string;
      let token: string;
      try {
        const body = JSON.parse(text) as { subject_id?: unknown; token?: unknown };
        if (
          typeof body.subject_id !== 'string' ||
          !body.subject_id ||
          typeof body.token !== 'string' ||
          !body.token
        ) {
          return new Response('malformed', { status: 400 });
        }
        subjectId = body.subject_id;
        token = body.token;
      } catch {
        return new Response('malformed', { status: 400 });
      }

      const right = await budget.race(canIngestForSubject(claims, subjectId), 'canIngestForSubject');
      if (!right) return new Response('not found', { status: 404 });

      const target = verifyUploadTarget(token);
      if (!target) return new Response('malformed', { status: 400 });
      const scope = uploadKeyScope(target.key);
      if (!scope || scope.circleId !== right.circle_id || scope.subjectId !== subjectId) {
        return new Response('not found', { status: 404 });
      }
      const stagingKey = target.key;

      const staged = await budget.race(downloadObject(stagingKey), 'downloadObject');
      if (!staged) {
        return Response.json({ refused: 'upload_missing' }, { status: 400 });
      }
      if (staged.bytes.byteLength < 1 || staged.bytes.byteLength > FILE_BYTES_MAX) {
        return Response.json({ refused: 'over_file_size' }, { status: 400 });
      }

      const sha256 = createHash('sha256').update(staged.bytes).digest('hex');
      const { arrivalId } = await budget.race(
        createUploadArrival({
          circleId: right.circle_id,
          subjectId,
          byteSize: staged.bytes.byteLength,
          mimeDeclared: staged.contentType || null,
          uploadId: scope.uploadId,
        }),
        'createUploadArrival',
      );

      // The store worker's staging contract; idempotent on completion retry.
      await budget.race(
        stageIntakeObject(right.circle_id, arrivalId, staged.bytes, staged.contentType),
        'stageIntakeObject',
      );
      await budget.race(removeObject(stagingKey), 'removeObject');
      await budget.race(enqueuePipeline(right.circle_id, [arrivalId], 'upload'), 'enqueuePipeline');

      const origin = new URL(req.url).origin;
      after(async () => {
        const key = process.env.HC_WORKER_KEY;
        if (!key) return; // the sweeper is the recovery story
        // 7C C2 (OW-07 site 5): the eager fire is time-bounded — a hung
        // worker socket must not pin this handle open; the sweeper is
        // still the recovery story.
        await fetch(`${origin}/api/worker/store`, {
          method: 'POST',
          headers: { 'x-worker-key': key },
          signal: AbortSignal.timeout(10_000),
        }).catch(() => {
          // A dropped eager fire is a delay, never a loss (§1.4).
        });
      });

      return Response.json({
        arrival_id: arrivalId,
        sha256,
        byte_size: staged.bytes.byteLength,
      });
    },
    () => Response.json({ refused: 'slow' }, { status: 504 }),
  );
}
