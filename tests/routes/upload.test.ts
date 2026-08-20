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
// Test class: MOCKED ROUTE CONTRACT. The live right-to-ingest probe is
// tests/hc/upload.test.ts; resume-under-interruption is the B9 browser
// leg (tus is the client's protocol, not this route's).
// ============================================================================

const session = { liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({ asUser: vi.fn(async () => ({}) as unknown) }));

const upload = {
  canIngestForSubject: vi.fn(),
  createUploadArrival: vi.fn(),
};
vi.mock('@/lib/hc/upload', () => upload);

const ingest = { enqueuePipeline: vi.fn() };
vi.mock('@/lib/hc/ingest', () => ingest);

const storage = {
  uploadStagingKey: vi.fn(
    (c: string, s: string, u: string) => `intake/upload/${c}/${s}/${u}`,
  ),
  createUploadToken: vi.fn(),
  downloadObject: vi.fn(),
  stageIntakeObject: vi.fn(),
  removeObject: vi.fn(),
};
vi.mock('@/lib/storage/artifacts', () => storage);

const afterCallbacks: Array<() => unknown> = [];
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    afterCallbacks.push(fn);
  },
}));

const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };
const SUBJECT = '22222222-0000-4000-8000-000000000002';
const CIRCLE = '11111111-0000-4000-8000-000000000001';
const WORKER_KEY = 'w'.repeat(48);

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

const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => new Response('ok'));

beforeEach(async () => {
  vi.resetAllMocks();
  afterCallbacks.length = 0;
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  upload.canIngestForSubject.mockResolvedValue({ circle_id: CIRCLE });
  upload.createUploadArrival.mockResolvedValue({ arrivalId: 'a-up-1' });
  storage.uploadStagingKey.mockImplementation(
    (c: string, s: string, u: string) => `intake/upload/${c}/${s}/${u}`,
  );
  storage.createUploadToken.mockResolvedValue({ token: 'signed-token' });
  storage.downloadObject.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3, 4]),
    contentType: 'application/pdf',
  });
  storage.stageIntakeObject.mockResolvedValue(undefined);
  storage.removeObject.mockResolvedValue(undefined);
  ingest.enqueuePipeline.mockResolvedValue(undefined);
  savedEnv.HC_WORKER_KEY = process.env.HC_WORKER_KEY;
  savedEnv.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.HC_WORKER_KEY = WORKER_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54341';
  vi.stubGlobal('fetch', fetchMock);
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
    session.liveSessionClaims.mockResolvedValueOnce(null);
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(401);
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
    expect(storage.createUploadToken).not.toHaveBeenCalled();
  });

  it('nonexistent and unauthorized subjects answer ONE 404 shape (DEF-10), token never minted', async () => {
    upload.canIngestForSubject.mockResolvedValueOnce(null);
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
    expect(storage.createUploadToken).not.toHaveBeenCalled();
  });

  it('a malformed body answers 400 before any probe', async () => {
    const res = await tokenRoute.POST(post('/api/upload/token', { nope: true }));
    expect(res.status).toBe(400);
    expect(upload.canIngestForSubject).not.toHaveBeenCalled();
  });

  it('mints a subject-scoped staging key + signed token + the resumable endpoint', async () => {
    const res = await tokenRoute.POST(post('/api/upload/token', { subject_id: SUBJECT }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upload.bucket).toBe('artifacts');
    expect(body.upload.key).toMatch(
      new RegExp(`^intake/upload/${CIRCLE}/${SUBJECT}/[0-9a-f-]{36}$`),
    );
    expect(body.upload.token).toBe('signed-token');
    expect(body.upload.endpoint).toBe('http://127.0.0.1:54341/storage/v1/upload/resumable');
    expect(upload.canIngestForSubject).toHaveBeenCalledWith(CLAIMS, SUBJECT);
    const [key] = storage.createUploadToken.mock.calls[0];
    expect(key).toBe(body.upload.key);
  });
});

describe('B3 · the completion route — rights re-checked, bytes measured, arrival created', () => {
  const UPLOAD_ID = '44444444-0000-4000-8000-000000000004';
  const body = { subject_id: SUBJECT, upload_id: UPLOAD_ID };

  it('no live session ⇒ 401', async () => {
    session.liveSessionClaims.mockResolvedValueOnce(null);
    const res = await completeRoute.POST(post('/api/upload/complete', body));
    expect(res.status).toBe(401);
  });

  it('rights are RE-CHECKED at completion (a grant lowered mid-upload bites)', async () => {
    upload.canIngestForSubject.mockResolvedValueOnce(null);
    const res = await completeRoute.POST(post('/api/upload/complete', body));
    expect(res.status).toBe(404);
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });

  it('nothing staged under the token ⇒ 400, no arrival', async () => {
    storage.downloadObject.mockResolvedValueOnce(null);
    const res = await completeRoute.POST(post('/api/upload/complete', body));
    expect(res.status).toBe(400);
    expect(upload.createUploadArrival).not.toHaveBeenCalled();
  });

  it('measured bytes over the P5 cap refuse BEFORE any arrival exists', async () => {
    storage.downloadObject.mockResolvedValueOnce({
      bytes: new Uint8Array(52428801),
      contentType: 'application/pdf',
    });
    const res = await completeRoute.POST(post('/api/upload/complete', body));
    expect(res.status).toBe(400);
    expect(upload.createUploadArrival).not.toHaveBeenCalled();
  });

  it('creates the upload-channel arrival keyed to THIS upload attempt, restages for store, enqueues', async () => {
    const res = await completeRoute.POST(post('/api/upload/complete', body));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.arrival_id).toBe('a-up-1');
    // sha256 of [1,2,3,4]
    expect(out.sha256).toBe('9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
    expect(out.byte_size).toBe(4);

    const [input] = upload.createUploadArrival.mock.calls[0];
    expect(input).toMatchObject({
      circleId: CIRCLE,
      subjectId: SUBJECT,
      byteSize: 4,
      mimeDeclared: 'application/pdf',
      uploadId: UPLOAD_ID,
    });

    // the store worker's staging contract: bytes land under the arrival
    const stage = storage.stageIntakeObject.mock.calls[0];
    expect(stage[0]).toBe(CIRCLE);
    expect(stage[1]).toBe('a-up-1');
    // the upload staging object is cleaned up
    expect(storage.removeObject).toHaveBeenCalledWith(
      `intake/upload/${CIRCLE}/${SUBJECT}/${UPLOAD_ID}`,
    );
    expect(ingest.enqueuePipeline).toHaveBeenCalledWith(CIRCLE, ['a-up-1'], 'upload');
  });

  it('the eager store fire rides after() — strictly post-response', async () => {
    const res = await completeRoute.POST(post('/api/upload/complete', body));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    for (const cb of afterCallbacks) await cb();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe('http://local.test/api/worker/store');
  });
});
