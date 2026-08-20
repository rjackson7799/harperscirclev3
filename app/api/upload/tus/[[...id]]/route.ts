import { storageAuthHeaders, verifyUploadGrant } from '@/lib/storage/artifacts';

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
 * The upstream upload id (itself a URL path) travels base64url-encoded
 * as our path segment; the client echoes the staging key in x-hc-key on
 * follow-up hops so the grant can bind to it (the create hop reads the
 * key from TUS upload-metadata instead — both are grant-verified, so a
 * mismatched echo simply refuses).
 */

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

function proxyResponse(upstream: Response): Response {
  const headers = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const location = upstream.headers.get('location');
  if (location) {
    // The upstream upload id is a URL path of its own; encode it whole.
    const id = Buffer.from(location).toString('base64url');
    headers.set('location', `/api/upload/tus/${id}`);
  }
  return new Response(null, { status: upstream.status, headers });
}

/** The creation hop: the key comes from TUS upload-metadata. */
export async function POST(req: Request): Promise<Response> {
  const grant = req.headers.get('x-hc-grant');
  const key = metadataObjectName(req);
  if (!grant || !key || !verifyUploadGrant(key, grant)) return grantRefused();

  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: forwardHeaders(req),
    body: req.body,
    duplex: 'half', // undici requires it for streamed bodies
  };
  const upstream = await fetch(upstreamBase(), init);
  return proxyResponse(upstream);
}

async function forwardToUpload(
  req: Request,
  ctx: { params: Promise<{ id?: string[] }> },
  method: 'PATCH' | 'HEAD',
): Promise<Response> {
  const grant = req.headers.get('x-hc-grant');
  const key = req.headers.get('x-hc-key');
  if (!grant || !key || !verifyUploadGrant(key, grant)) return grantRefused();

  const { id } = await ctx.params;
  const encoded = id?.[0];
  if (!encoded) return new Response('not found', { status: 404 });
  let upstreamUrl: string;
  try {
    upstreamUrl = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return new Response('not found', { status: 404 });
  }
  // Never proxy anywhere but the storage resumable family.
  if (!upstreamUrl.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`)) {
    return new Response('not found', { status: 404 });
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: forwardHeaders(req),
  };
  if (method === 'PATCH') {
    init.body = req.body;
    init.duplex = 'half'; // undici requires it for streamed bodies
  }
  const upstream = await fetch(upstreamUrl, init);
  return proxyResponse(upstream);
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
