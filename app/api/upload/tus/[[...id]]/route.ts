import {
  isResumableUpstream,
  signUploadTarget,
  storageAuthHeaders,
  uploadKeyScope,
  verifyUploadGrant,
  verifyUploadTarget,
} from '@/lib/storage/artifacts';

/**
 * The same-origin TUS proxy (4B B9; §2.12/§3.11; UPL-01) — the §1.3
 * artifact route's proxy discipline, mirrored for WRITES: the pinned
 * local storage build ignores the x-signature signed-upload token on
 * its resumable endpoint (the B9 finding: it evaluated the browser's
 * tus request as `authenticated` and M7's zero-policy posture refused
 * it — correctly), so the resumable protocol now rides our own origin:
 *
 *   - The MINT's server-minted, subject-scoped, EXPIRING HMAC grant
 *     gates EVERY hop (create, chunk, offset probe) — one grant, one
 *     staging key, verified timing-safe against the service-keyed HMAC.
 *   - Upstream, requests carry the service plane's credential, which
 *     never leaves the server; downstream, Location is rewritten so no
 *     storage URL ever reaches the browser.
 *   - Same-origin by construction: the entire CORS/dev-origin class
 *     the gate exposed cannot recur here.
 *
 * The forwarded target is CONTAINED (round-13 finding 1). On the create
 * hop the server validates the upstream Location against the normalised
 * storage resumable family (`isResumableUpstream` — `../` cannot escape a
 * `new URL()` origin+pathname check) and hands the browser a SERVER-SIGNED
 * continuation target (`signUploadTarget`), never a raw base64url URL a
 * client could forge. Every write hop re-verifies that signature and binds
 * it to the caller's grant: the target's circle must equal the grant key's
 * circle (`x-hc-key`), so a valid grant can drive only its own circle's
 * uploads. §13.4 resume survives — the fresh grant on a resumed attempt
 * shares the circle of the original target, and the signature never expires.
 */

/** The P5 per-file cap (PRD §13.3), enforced here at CREATION off the
 *  declared Upload-Length — the pre-read bound (7C C2, OW-19): an
 *  over-cap file is refused before a byte lands, and a client that does
 *  not declare a length is refused fail-closed (tus-js-client always
 *  declares it for a File). Completion's measured-bytes check remains
 *  the backstop for a declaration that lied. */
const FILE_BYTES_MAX = 52428800;

/** 7C C2 (OW-07 sites 3–4): the per-hop time bound on the upstream
 *  fetch. A hop carries at most one chunk (upload-form's CHUNK_SIZE);
 *  120 s clears that at well under dial-up throughput, and a storage
 *  plane slower than that is an outage, not a wait. */
const UPLOAD_HOP_TIMEOUT_MS = 120_000;

const FORWARD_REQUEST_HEADERS = [
  'tus-resumable',
  'upload-length',
  'upload-metadata',
  'upload-offset',
  'content-type',
  'upload-defer-length',
  'upload-checksum',
];

const FORWARD_RESPONSE_HEADERS = [
  'tus-resumable',
  'upload-offset',
  'upload-length',
  'upload-expires',
  'tus-version',
  'tus-extension',
  'tus-max-size',
];

function upstreamBase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('tus proxy: NEXT_PUBLIC_SUPABASE_URL must be set');
  return `${url}/storage/v1/upload/resumable`;
}

function metadataObjectName(req: Request): string | null {
  const meta = req.headers.get('upload-metadata');
  if (!meta) return null;
  for (const pair of meta.split(',')) {
    const [name, value] = pair.trim().split(' ');
    if (name === 'objectName' && value) {
      try {
        return Buffer.from(value, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
  }
  return null;
}

function grantRefused(): Response {
  return new Response('forbidden', { status: 403 });
}

function forwardHeaders(req: Request): Headers {
  const headers = new Headers(storageAuthHeaders());
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

function proxyResponse(upstream: Response, key: string): Response {
  const headers = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const location = upstream.headers.get('location');
  if (location) {
    // Never hand the browser a raw storage URL: validate the upstream
    // Location against the normalised resumable family, then sign it into
    // a continuation target bound to this staging key (finding 1).
    if (!isResumableUpstream(location)) {
      return new Response('bad gateway', { status: 502 });
    }
    const target = signUploadTarget(location, key);
    headers.set('location', `/api/upload/tus/${target}`);
  }
  return new Response(null, { status: upstream.status, headers });
}

/** The creation hop: the key comes from TUS upload-metadata. */
export async function POST(req: Request): Promise<Response> {
  const grant = req.headers.get('x-hc-grant');
  const key = metadataObjectName(req);
  if (!grant || !key || !verifyUploadGrant(key, grant)) return grantRefused();

  // The pre-read bound: the declared length gates the file BEFORE a byte
  // lands; absent or unparseable declarations are refused fail-closed.
  const declared = Number(req.headers.get('upload-length') ?? NaN);
  if (!Number.isFinite(declared) || declared < 1 || declared > FILE_BYTES_MAX) {
    return new Response('too large', { status: 413 });
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: forwardHeaders(req),
    body: req.body,
    duplex: 'half', // undici requires it for streamed bodies
    signal: AbortSignal.timeout(UPLOAD_HOP_TIMEOUT_MS),
  };
  const upstream = await fetch(upstreamBase(), init);
  return proxyResponse(upstream, key);
}

async function forwardToUpload(
  req: Request,
  ctx: { params: Promise<{ id?: string[] }> },
  method: 'PATCH' | 'HEAD',
): Promise<Response> {
  const grant = req.headers.get('x-hc-grant');
  const key = req.headers.get('x-hc-key');
  if (!grant || !key || !verifyUploadGrant(key, grant)) return grantRefused();
  const scope = uploadKeyScope(key);
  if (!scope) return grantRefused();

  const { id } = await ctx.params;
  const encoded = id?.[0];
  if (!encoded) return new Response('not found', { status: 404 });

  // The target is a server-signed continuation reference, never a
  // client-forgeable URL (finding 1). Verify the signature, then BIND it
  // to the caller's grant: the target's circle must be the grant's circle.
  const target = verifyUploadTarget(encoded);
  if (!target) return new Response('not found', { status: 404 });
  const targetScope = uploadKeyScope(target.key);
  if (!targetScope || targetScope.circleId !== scope.circleId) {
    return new Response('not found', { status: 404 });
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: forwardHeaders(req),
    signal: AbortSignal.timeout(UPLOAD_HOP_TIMEOUT_MS),
  };
  if (method === 'PATCH') {
    init.body = req.body;
    init.duplex = 'half'; // undici requires it for streamed bodies
  }
  const upstream = await fetch(target.url, init);
  return proxyResponse(upstream, target.key);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id?: string[] }> },
): Promise<Response> {
  return forwardToUpload(req, ctx, 'PATCH');
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ id?: string[] }> },
): Promise<Response> {
  return forwardToUpload(req, ctx, 'HEAD');
}

/** TUS preflight/feature probe — answered locally; same-origin anyway. */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'tus-resumable': '1.0.0',
      'tus-version': '1.0.0',
      'tus-extension': 'creation',
    },
  });
}
