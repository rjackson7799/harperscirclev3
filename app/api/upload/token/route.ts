import { randomUUID } from 'node:crypto';
import { asUser } from '@/lib/db/user';
import { readLiveSession } from '@/lib/auth/session';
import { sessionUnavailable } from '@/lib/http/session-unavailable';
import { withRouteBudget } from '@/lib/http/page-budget';
import { boundedJsonText } from '@/lib/http/bounded-json';
import { canIngestForSubject } from '@/lib/hc/upload';
import { mintUploadGrant, uploadStagingKey } from '@/lib/storage/artifacts';

/**
 * POST /api/upload/token — the §2.12 mint (slice-4 plan B3; UPL-01):
 * a server-minted, SUBJECT-SCOPED, expiring upload authorization,
 * minted only after the caller's right to ingest for that subject is
 * checked (manage over the all-domain taint — who can approve can
 * ingest). The token authorizes exactly one staging key on the storage
 * resumable endpoint (x-signature), which is what keeps M7's
 * zero-policy posture intact: the browser never holds a credential
 * wider than one expiring key.
 *
 * The session gate is getUser truth (readLiveSession — AC-AUTH-10:
 * a killed session bites within seconds). Nonexistent and unauthorized
 * subjects answer ONE 404 shape (DEF-10).
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await asUser();
  // ROUND-19 F-2: three outcomes, not two. A session that could not be READ is
  // not a session that does not exist — r2 refused this founder with `401 sign
  // in first` 24.3 s after asking, about a session that had rendered a
  // signed-in page six seconds earlier. The 401 stays exactly as strict for
  // the answer it is actually for.
  const read = await readLiveSession(supabase);
  if (read.kind === 'unavailable') {
    console.error(`upload/token: ${read.why}`);
    return sessionUnavailable();
  }
  if (read.kind !== 'signed-in') return new Response('sign in first', { status: 401 });
  const claims = read.claims;

  // 7C C2 (OW-19): a person waits on this mint; it answers inside the
  // route budget like every other wait.
  //
  // 7D · OW-24 (ADR-0038 R5/F-1): THE INGRESS READ IS INSIDE THE BUDGET NOW.
  // OW-19's cap is a SIZE guarantee and it holds — the declared
  // content-length first, then the actual text as the backstop for a body
  // that lied or never declared. What it never gave was a TIME guarantee:
  // `req.text()` resolves only when the stream ENDS, so a chunked body with
  // no Content-Length, dribbled a byte at a time, sat here forever — outside
  // the budget it was supposed to be bounded by, because the read ran before
  // `withRouteBudget` opened. Raced here, it takes the route's own overrun.
  return withRouteBudget(
    async (budget) => {
      // 7C C2 (OW-19): the ingress cap, BEFORE any parse or probe.
      const text = await budget.race(boundedJsonText(req), 'boundedJsonText');
      if (text === null) return new Response('too large', { status: 413 });

      let subjectId: string;
      try {
        const body = JSON.parse(text) as { subject_id?: unknown };
        if (typeof body.subject_id !== 'string' || !body.subject_id) {
          return new Response('malformed', { status: 400 });
        }
        subjectId = body.subject_id;
      } catch {
        return new Response('malformed', { status: 400 });
      }

      const right = await budget.race(canIngestForSubject(claims, subjectId), 'canIngestForSubject');
      if (!right) return new Response('not found', { status: 404 });

      const uploadId = randomUUID();
      const key = uploadStagingKey(right.circle_id, subjectId, uploadId);
      // The server-minted, subject-scoped, EXPIRING grant (§2.12): an HMAC
      // over exactly this staging key. The same-origin TUS proxy verifies
      // it on every hop (B9: the local storage build ignores x-signature
      // on its resumable endpoint, so the proxy is the mechanism).
      const grant = mintUploadGrant(key);

      // Completion reconciles off the server-signed continuation target the
      // proxy returns (finding 1), not an id echoed by the client — so the
      // mint hands back only what the browser drives the upload with.
      return Response.json({
        upload: {
          bucket: 'artifacts',
          key,
          grant,
          endpoint: '/api/upload/tus',
        },
      });
    },
    () => Response.json({ refused: 'slow' }, { status: 504 }),
  );
}
