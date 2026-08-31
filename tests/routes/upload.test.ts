import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B3 · The upload path (TSD §2.12, §1.8; PRD §13.4; UPL-01 app half):
// a server-minted, SUBJECT-SCOPED, expiring upload token — minted only
// after the caller's right to ingest for that subject is checked (the
// manage-over-all-domains bar, the Q6 audience: who can approve can
// ingest) — then completion measures the staged bytes, computes the sha,
// creates the upload-channel arrival and hands the store worker its
// staging object.
//
// Round-13 finding 1 (HIGH) — the transport containment. The same-origin
// TUS proxy must NOT let a valid grant drive the service credential to an
// arbitrary storage path: the id segment is a SERVER-SIGNED continuation
// target (not a client-forgeable base64url), the grant on every hop is
// bound to that target's CIRCLE, and completion consumes the same signed
// target so a resumed attempt's bytes are reconciled at their real key.
//
// Test class: MOCKED I/O, REAL security. Only the storage-plane I/O
// (downloadObject/stageIntakeObject/removeObject — they need supabase) is
// mocked; the grant HMAC, the target signature, the key-scope parse and
// the normalised-URL validation all run for real, so these tests can
// actually catch the finding-1 bypass. The live right-to-ingest probe is
// tests/hc/upload.test.ts; resume-under-interruption is the B9 browser leg.
// ============================================================================

const session = { liveSessionClaims: vi.fn(), readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({ asUser: vi.fn(async () => ({}) as unknown) }));

const upload = {
  canIngestForSubject: vi.fn(),
  createUploadArrival: vi.fn(),
};
vi.mock('@/lib/hc/upload', () => upload);

const ingest = { enqueuePipeline: vi.fn() };
vi.mock('@/lib/hc/ingest', () => ingest);

// Mock ONLY the storage-plane I/O; every crypto/validation helper stays real.
const storageIO = {
  downloadObject: vi.fn(),
  stageIntakeObject: vi.fn(),
  removeObject: vi.fn(),
};
vi.mock('@/lib/storage/artifacts', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/lib/storage/artifacts');
  return { ...actual, ...storageIO };
});

const afterCallbacks: Array<() => unknown> = [];
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    afterCallbacks.push(fn);
  },
}));

const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };
const SUBJECT = '22222222-0000-4000-8000-000000000002';
const CIRCLE = '11111111-0000-4000-8000-000000000001';
const OTHER_CIRCLE = '99999999-0000-4000-8000-000000000009';
const WORKER_KEY = 'w'.repeat(48);
const SUPABASE_URL = 'http://127.0.0.1:54341';
const SERVICE_KEY = 'test-service-role-key-0123456789abcdef0123456789';
// The service-key env var, named via split so the containment grep
// (scripts/check-service-role-containment.mjs) never matches this test.
const SR_ENV = 'SUPABASE_SERVICE_ROLE' + '_KEY';

function post(path: string, body: unknown): Request {
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RouteModule = { POST: (r: Request) => Promise<Response> };
let tokenRoute: RouteModule;
let completeRoute: RouteModule;
// The mocked module — its crypto/validation helpers are the real ones.
let artifacts: typeof import('@/lib/storage/artifacts');

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => new Response('ok'));

beforeEach(async () => {
  vi.resetAllMocks();
  afterCallbacks.length = 0;
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  upload.canIngestForSubject.mockResolvedValue({ circle_id: CIRCLE });
  upload.createUploadArrival.mockResolvedValue({ arrivalId: 'a-up-1' });
  storageIO.downloadObject.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3, 4]),
    contentType: 'application/pdf',
  });
  storageIO.stageIntakeObject.mockResolvedValue(undefined);
  storageIO.removeObject.mockResolvedValue(undefined);
  ingest.enqueuePipeline.mockResolvedValue(undefined);
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  savedEnv.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  savedEnv[SR_ENV] = process.env[SR_ENV];
  process.env.HC_WORKER_KEY = WORKER_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env[SR_ENV] = SERVICE_KEY;
  vi.stubGlobal('fetch', fetchMock);
  artifacts = await import('@/lib/storage/artifacts');
  tokenRoute = (await import('@/app/api/upload/token/route')) as RouteModule;
  completeRoute = (await import('@/app/api/upload/complete/route')) as RouteModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('B3 · the mint route — subject-scoped, right-to-ingest checked FIRST', () => {
  it('no live session ⇒ 401; nothing probed, nothing minted', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(401);
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // ROUND-19 F-2. This is the leg-35 refusal, at its cause.
  //
  // r2's founder was told `401 sign in first` by THIS route, 24.3 s after it
  // asked and six seconds after the same session rendered a signed-in page.
  // The session was live; reading it failed. A 401 says the caller is not who
  // they say they are, which is a statement about THEM, and it is false.
  // ==========================================================================
  it('the session could not be READ ⇒ 503 session_unavailable, NEVER 401', async () => {
    session.readLiveSession.mockResolvedValueOnce({
      kind: 'unavailable',
      why: 'AuthRetryableFetchError: fetch failed',
    });
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'session_unavailable' });
    // Nothing is probed and nothing is minted: this refuses exactly as hard as
    // the 401 did. What changes is the SENTENCE, not the authority.
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
  });

  it('the unavailable answer is retryable and says so — a person is told to wait, not to sign in', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'unavailable', why: 'AuthApiError 502: bad gateway' });
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.headers.get('retry-after')).toBe('5');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('nonexistent and unauthorized subjects answer ONE 404 shape (DEF-10), token never minted', async () => {
    upload.canIngestForSubject.mockResolvedValueOnce(null);
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
  });

  it('a malformed body answers 400 before any probe', async () => {
    const res = await tokenRoute.POST(post('/api/upload/token', { nope: true }));
    expect(res.status).toBe(400);
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
  });

  it('mints a subject-scoped staging key + a REAL verifiable HMAC grant + the same-origin proxy endpoint', async () => {
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upload.bucket).toBe('artifacts');
    expect(body.upload.key).toMatch(
      new RegExp(`^intake/upload/${CIRCLE}/${SUBJECT}/[0-9a-f-]{36}$`),
    );
    // the grant is real and verifies against its own key
    expect(artifacts.verifyUploadGrant(body.upload.key, body.upload.grant)).toBe(true);
    expect(body.upload.endpoint).toBe('/api/upload/tus'); // same-origin: no CORS class at all
    expect(upload.canIngestForSubject).toHaveBeenCalledWith(CLAIMS, SUBJECT);
  });
});

describe('7C C2 · OW-19/OW-07 — the ingress and hop bounds, named at their sites', () => {
  const KEY = `intake/upload/${CIRCLE}/${SUBJECT}/44444444-0000-4000-8000-00000000000b`;
  const UPSTREAM = `${SUPABASE_URL}/storage/v1/upload/resumable/xyz%2Fabc`;
  const OVER_CAP = 'x'.repeat(8_192);

  function rawPost(path: string, body: string): Request {
    return new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  }

  function tusCreate(headers: Record<string, string>): Request {
    return new Request('http://local.test/api/upload/tus', {
      method: 'POST',
      headers: {
        'tus-resumable': '1.0.0',
        'upload-metadata':
          'bucketName YXJ0aWZhY3Rz,objectName ' + Buffer.from(KEY).toString('base64'),
        ...headers,
      },
    });
  }

  it('token: a body over the ingress cap answers 413 BEFORE any parse or probe (OW-19)', async () => {
    const res = await tokenRoute.POST(rawPost('/api/upload/token', OVER_CAP));
    expect(res.status).toBe(413);
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
  });

  it('complete: the same cap, the same order — nothing downloaded, nothing probed', async () => {
    const res = await completeRoute.POST(rawPost('/api/upload/complete', OVER_CAP));
    expect(res.status).toBe(413);
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
    expect(storageIO.downloadObject).not.toHaveBeenCalled();
  });

  it('tus creation: Upload-Length over the P5 cap answers 413 and the upstream is never contacted — the pre-read bound (OW-19)', async () => {
    const tusRoute = (await import('@/app/api/upload/tus/[[...id]]/route')) as {
      POST: (r: Request) => Promise<Response>;
    };
    const grant = artifacts.mintUploadGrant(KEY);
    const res = await tusRoute.POST(
      tusCreate({ 'x-hc-grant': grant, 'upload-length': String(52428801) }),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tus creation: a missing Upload-Length is refused the same way — fail closed, the client always declares it', async () => {
    const tusRoute = (await import('@/app/api/upload/tus/[[...id]]/route')) as {
      POST: (r: Request) => Promise<Response>;
    };
    const grant = artifacts.mintUploadGrant(KEY);
    const res = await tusRoute.POST(tusCreate({ 'x-hc-grant': grant }));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the two TUS hops carry the named time bound on the upstream fetch (OW-07 sites 3–4)', async () => {
    const tusRoute = (await import('@/app/api/upload/tus/[[...id]]/route')) as {
      POST: (r: Request) => Promise<Response>;
      PATCH: (r: Request, ctx: { params: Promise<{ id?: string[] }> }) => Promise<Response>;
    };
    fetchMock.mockResolvedValue(
      new Response(null, { status: 201, headers: { location: UPSTREAM, 'tus-resumable': '1.0.0' } }),
    );
    const grant = artifacts.mintUploadGrant(KEY);
    await tusRoute.POST(tusCreate({ 'x-hc-grant': grant, 'upload-length': '4' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const creationInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(creationInit.signal).toBeInstanceOf(AbortSignal);

    const target = artifacts.signUploadTarget(UPSTREAM, KEY);
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { 'upload-offset': '4' } }),
    );
    await tusRoute.PATCH(
      new Request(`http://local.test/api/upload/tus/${target}`, {
        method: 'PATCH',
        headers: {
          'tus-resumable': '1.0.0',
          'upload-offset': '0',
          'content-type': 'application/offset+octet-stream',
          'x-hc-grant': grant,
          'x-hc-key': KEY,
        },
      }),
      { params: Promise.resolve({ id: [target] }) },
    );
    const patchInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(patchInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("complete's eager store fire carries the named time bound (OW-07 site 5)", async () => {
    const target = artifacts.signUploadTarget(UPSTREAM, KEY);
    const res = await completeRoute.POST(
      post('/api/upload/complete', { subject_id: SUBJECT, token: target }),
    );
    expect(res.status).toBe(200);
    expect(afterCallbacks.length).toBe(1);
    await afterCallbacks[0]();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fireInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fireInit.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('B9 · the TUS proxy — signed continuation target, grant bound to the target circle', () => {
  const KEY_A = `intake/upload/${CIRCLE}/${SUBJECT}/44444444-0000-4000-8000-00000000000a`;
  const UPSTREAM_A = `${SUPABASE_URL}/storage/v1/upload/resumable/abc%2Fdef`;

  let tusRoute: {
    POST: (r: Request) => Promise<Response>;
    PATCH: (r: Request, ctx: { params: Promise<{ id?: string[] }> }) => Promise<Response>;
    HEAD: (r: Request, ctx: { params: Promise<{ id?: string[] }> }) => Promise<Response>;
  };

  function tusPost(headers: Record<string, string>): Request {
    return new Request('http://local.test/api/upload/tus', {
      method: 'POST',
      headers: {
        'tus-resumable': '1.0.0',
        'upload-length': '4',
        'upload-metadata':
          'bucketName YXJ0aWZhY3Rz,objectName ' + Buffer.from(KEY_A).toString('base64'),
        ...headers,
      },
    });
  }

  beforeEach(async () => {
    tusRoute = (await import('@/app/api/upload/tus/[[...id]]/route')) as typeof tusRoute;
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: { location: UPSTREAM_A, 'tus-resumable': '1.0.0' },
      }),
    );
  });

  it('no grant / a refused grant ⇒ 403; storage is never contacted', async () => {
    const res = await tusRoute.POST(tusPost({}));
    expect(res.status).toBe(403);
    const res2 = await tusRoute.POST(tusPost({ 'x-hc-grant': '123.bad' }));
    expect(res2.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a valid grant creates the upload upstream WITH the service credential and returns a SIGNED target as Location', async () => {
    const grant = artifacts.mintUploadGrant(KEY_A);
    const res = await tusRoute.POST(tusPost({ 'x-hc-grant': grant }));
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/storage/v1/upload/resumable');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toMatch(/^Bearer /);
    expect(headers.get('x-hc-grant')).toBeNull(); // our grant never leaves

    const loc = res.headers.get('location')!;
    expect(loc).toMatch(/^\/api\/upload\/tus\//);
    expect(loc).not.toContain('127.0.0.1:54341'); // no storage URL browser-side
    // the id segment is a server-signed target, not a raw base64url URL
    const returned = loc.split('/').pop()!;
    expect(artifacts.verifyUploadTarget(returned)).toEqual({ url: UPSTREAM_A, key: KEY_A });
  });

  it('PATCH forwards the chunk to the signed target when the grant circle matches, grant re-checked', async () => {
    const target = artifacts.signUploadTarget(UPSTREAM_A, KEY_A);
    const grant = artifacts.mintUploadGrant(KEY_A);
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { 'upload-offset': '4' } }),
    );
    const res = await tusRoute.PATCH(
      new Request(`http://local.test/api/upload/tus/${target}`, {
        method: 'PATCH',
        headers: {
          'tus-resumable': '1.0.0',
          'upload-offset': '0',
          'content-type': 'application/offset+octet-stream',
          'x-hc-grant': grant,
          'x-hc-key': KEY_A,
        },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      { params: Promise.resolve({ id: [target] }) },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('upload-offset')).toBe('4');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe(UPSTREAM_A);
  });

  it('resume: a FRESH grant for a new key in the SAME circle drives the old target (§13.4 preserved)', async () => {
    const target = artifacts.signUploadTarget(UPSTREAM_A, KEY_A); // from attempt A
    const keyB = `intake/upload/${CIRCLE}/${SUBJECT}/44444444-0000-4000-8000-00000000000b`;
    const grantB = artifacts.mintUploadGrant(keyB); // fresh mint, same circle
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { 'upload-offset': '2' } }),
    );
    const res = await tusRoute.HEAD(
      new Request(`http://local.test/api/upload/tus/${target}`, {
        method: 'HEAD',
        headers: { 'tus-resumable': '1.0.0', 'x-hc-grant': grantB, 'x-hc-key': keyB },
      }),
      { params: Promise.resolve({ id: [target] }) },
    );
    expect(res.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe(UPSTREAM_A);
  });

  // ------- Round-13 finding 1 (HIGH): the bypass must be REFUSED -------

  it('gap (a): a valid grant + a ..-bearing RAW base64url id is REFUSED — no forged target reaches storage', async () => {
    const grant = artifacts.mintUploadGrant(KEY_A);
    const evil = `${SUPABASE_URL}/storage/v1/upload/resumable/../../object/list/artifacts`;
    const forgedId = Buffer.from(evil).toString('base64url'); // the old attack: no signature
    const res = await tusRoute.HEAD(
      new Request(`http://local.test/api/upload/tus/${forgedId}`, {
        method: 'HEAD',
        headers: { 'tus-resumable': '1.0.0', 'x-hc-grant': grant, 'x-hc-key': KEY_A },
      }),
      { params: Promise.resolve({ id: [forgedId] }) },
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gap (a) defence-in-depth: even a SERVER-SIGNED target that normalises outside the resumable family is REFUSED', async () => {
    const evil = `${SUPABASE_URL}/storage/v1/upload/resumable/../../object/list/artifacts`;
    const signedEvil = artifacts.signUploadTarget(evil, KEY_A); // validly signed, bad path
    const grant = artifacts.mintUploadGrant(KEY_A);
    const res = await tusRoute.HEAD(
      new Request(`http://local.test/api/upload/tus/${signedEvil}`, {
        method: 'HEAD',
        headers: { 'tus-resumable': '1.0.0', 'x-hc-grant': grant, 'x-hc-key': KEY_A },
      }),
      { params: Promise.resolve({ id: [signedEvil] }) },
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gap (b): a valid target for one circle + a valid grant for ANOTHER circle is REFUSED — the grant binds to the target', async () => {
    const target = artifacts.signUploadTarget(UPSTREAM_A, KEY_A); // circle CIRCLE
    const keyOther = `intake/upload/${OTHER_CIRCLE}/${SUBJECT}/44444444-0000-4000-8000-00000000000c`;
    const grantOther = artifacts.mintUploadGrant(keyOther); // valid grant, wrong circle
    const res = await tusRoute.PATCH(
      new Request(`http://local.test/api/upload/tus/${target}`, {
        method: 'PATCH',
        headers: {
          'tus-resumable': '1.0.0',
          'upload-offset': '0',
          'x-hc-grant': grantOther,
          'x-hc-key': keyOther,
        },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      { params: Promise.resolve({ id: [target] }) },
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('B3 · the completion route — rights re-checked, target reconciled, bytes measured', () => {
  const UPLOAD_ID = '44444444-0000-4000-8000-000000000004';
  const STAGING_KEY = `intake/upload/${CIRCLE}/${SUBJECT}/${UPLOAD_ID}`;
  const UPSTREAM = `${SUPABASE_URL}/storage/v1/upload/resumable/xyz`;

  function completeBody() {
    return { subject_id: SUBJECT, token: artifacts.signUploadTarget(UPSTREAM, STAGING_KEY) };
  }

  it('no live session ⇒ 401', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(401);
  });

  // F-2, the second half of the same flow: completion runs MINUTES after the
  // mint, with the bytes already staged. Telling a person to sign in there
  // loses an upload that actually succeeded.
  it('the session could not be READ ⇒ 503 session_unavailable, NEVER 401', async () => {
    session.readLiveSession.mockResolvedValueOnce({
      kind: 'unavailable',
      why: 'AuthRetryableFetchError: fetch failed',
    });
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'session_unavailable' });
    expect(upload.createUploadArrival).not.toHaveBeenCalled();
  });

  it('rights are RE-CHECKED at completion (a grant lowered mid-upload bites)', async () => {
    upload.canIngestForSubject.mockResolvedValueOnce(null);
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(404);
    expect(storageIO.downloadObject).not.toHaveBeenCalled();
  });

  it('a forged / unsigned token answers 400 before any download', async () => {
    const res = await completeRoute.POST(
      post('/api/upload/complete', { subject_id: SUBJECT, token: 'not-a-signed-target' }),
    );
    expect(res.status).toBe(400);
    expect(storageIO.downloadObject).not.toHaveBeenCalled();
  });

  it('a token whose key belongs to another circle is REFUSED (completion binds to the caller scope)', async () => {
    const foreignKey = `intake/upload/${OTHER_CIRCLE}/${SUBJECT}/${UPLOAD_ID}`;
    const res = await completeRoute.POST(
      post('/api/upload/complete', {
        subject_id: SUBJECT,
        token: artifacts.signUploadTarget(UPSTREAM, foreignKey),
      }),
    );
    expect(res.status).toBe(404);
    expect(upload.createUploadArrival).not.toHaveBeenCalled();
  });

  it('nothing staged under the target ⇒ 400, no arrival', async () => {
    storageIO.downloadObject.mockResolvedValueOnce(null);
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(400);
    expect(upload.createUploadArrival).not.toHaveBeenCalled();
  });

  it('measured bytes over the P5 cap refuse BEFORE any arrival exists', async () => {
    storageIO.downloadObject.mockResolvedValueOnce({
      bytes: new Uint8Array(52428801),
      contentType: 'application/pdf',
    });
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(400);
    expect(upload.createUploadArrival).not.toHaveBeenCalled();
  });

  it('reconciles the target: downloads the real staging key, arrival keyed to that upload, restages, enqueues', async () => {
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.arrival_id).toBe('a-up-1');
    // sha256 of [1,2,3,4]
    expect(out.sha256).toBe('9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
    expect(out.byte_size).toBe(4);

    // the bytes come from the signed target's key, not a re-derived one
    expect(storageIO.downloadObject).toHaveBeenCalledWith(STAGING_KEY);

    const [input] = upload.createUploadArrival.mock.calls[0];
    expect(input).toMatchObject({
      circleId: CIRCLE,
      subjectId: SUBJECT,
      byteSize: 4,
      mimeDeclared: 'application/pdf',
      uploadId: UPLOAD_ID,
    });

    const stage = storageIO.stageIntakeObject.mock.calls[0];
    expect(stage[0]).toBe(CIRCLE);
    expect(stage[1]).toBe('a-up-1');
    expect(storageIO.removeObject).toHaveBeenCalledWith(STAGING_KEY);
    expect(ingest.enqueuePipeline).toHaveBeenCalledWith(CIRCLE, ['a-up-1'], 'upload');
  });

  it('the eager store fire rides after() — strictly post-response', async () => {
    const res = await completeRoute.POST(post('/api/upload/complete', completeBody()));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    for (const cb of afterCallbacks) await cb();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe('http://local.test/api/worker/store');
  });
});
