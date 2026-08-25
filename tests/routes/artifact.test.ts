import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// B7 · GET /api/artifact/[id] — the §1.3 six steps, literally (RLS-10
// flips; AC-PERM-2; AC-INBOX-15; AC-PPL-4): the ONE sanctioned
// asServiceRole consumer outside the migration runner.
//
//   1+2. session → the RLS-scoped read at ≥ view. NO ROW ⇒ 404 — and
//        the 404 is BYTE-IDENTICAL across no-session / nonexistent /
//        unauthorized / not-clean: 404 ≡ 403, no oracle.
//   3.   scan_verdict = 'clean' checked INDEPENDENTLY — a pipeline bug
//        cannot expose an unscanned file.
//   4.   the service-role signed URL (30 s) is created AND consumed
//        server-side; bytes stream back through this route; the
//        browser never receives a storage URL.
//   5.   Cache-Control: private, no-store; Range requests supported.
//   6.   the artifact_read access-log entry is written BEFORE bytes
//        move; a failed entry refuses the read (evidence before
//        bytes, §10.5).
//
// Test class: MOCKED ROUTE CONTRACT; the live halves are
// tests/hc/artifacts.test.ts and the B9 gate leg (pre-revocation URL
// fails, live).
// ============================================================================

const session = { liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: vi.fn(async () => ({}) as unknown),
}));

const artifacts = {
  readableArtifact: vi.fn(),
  readableRendition: vi.fn(),
  logArtifactRead: vi.fn(),
};
vi.mock('@/lib/hc/artifacts', () => artifacts);

const createSignedUrl = vi.fn();
vi.mock('@/lib/db/service-role', () => ({
  asServiceRole: () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const ROW = {
  circle_id: '11111111-0000-4000-8000-000000000001',
  subject_id: '22222222-0000-4000-8000-000000000002',
  storage_key: 'circle/c/arrival/a/deadbeef',
  scan_verdict: 'clean',
  mime_detected: 'application/pdf',
  byte_size: 4,
};

type RouteModule = {
  GET: (r: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};
let route: RouteModule;

const fetchMock = vi.fn();

function get(headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test/api/artifact/${ARRIVAL}`, { method: 'GET', headers });
}
function getPage(page: string): Request {
  return new Request(`http://local.test/api/artifact/${ARRIVAL}?page=${page}`, { method: 'GET' });
}
const ctx = { params: Promise.resolve({ id: ARRIVAL }) };

beforeEach(async () => {
  vi.resetAllMocks();
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  artifacts.readableArtifact.mockResolvedValue(ROW);
  artifacts.readableRendition.mockResolvedValue(null);
  artifacts.logArtifactRead.mockResolvedValue(undefined);
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'http://storage.internal/signed/abc' },
    error: null,
  });
  fetchMock.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': '4' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  route = (await import('@/app/api/artifact/[id]/route')) as RouteModule;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('B7 · one 404, byte-identical — 404 ≡ 403 (AC-PERM-2; RLS-10)', () => {
  it('no session / nonexistent / unauthorized / not-clean all answer the SAME bytes', async () => {
    const bodies: string[] = [];
    const statuses: number[] = [];

    session.liveSessionClaims.mockResolvedValueOnce(null);
    let res = await route.GET(get(), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    artifacts.readableArtifact.mockResolvedValueOnce(null); // ghost OR revoked: one shape upstream
    res = await route.GET(get(), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    artifacts.readableArtifact.mockResolvedValueOnce({ ...ROW, scan_verdict: 'inconclusive' });
    res = await route.GET(get(), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    artifacts.readableArtifact.mockResolvedValueOnce({ ...ROW, scan_verdict: null });
    res = await route.GET(get(), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    expect(statuses).toEqual([404, 404, 404, 404]);
    expect(new Set(bodies).size).toBe(1);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(artifacts.logArtifactRead).not.toHaveBeenCalled();
  });

  it('quarantined is REFUSED the same way — not releasable by any read path (AC-INBOX-15)', async () => {
    artifacts.readableArtifact.mockResolvedValueOnce({ ...ROW, scan_verdict: 'infected' });
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('B7 · the signed URL is server-consumed; bytes stream through the route', () => {
  it('creates a 30 s signed URL, fetches it server-side, and answers private/no-store', async () => {
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(ROW.storage_key, 30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe('http://storage.internal/signed/abc');

    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('the browser never receives a storage URL — no redirect, no location header', async () => {
    const res = await route.GET(get(), ctx);
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).not.toBe(302);
  });

  it('Range requests pass through both ways (206 + content-range)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([2, 3]), {
        status: 206,
        headers: {
          'content-type': 'application/pdf',
          'content-range': 'bytes 1-2/4',
          'content-length': '2',
        },
      }),
    );
    const res = await route.GET(get({ range: 'bytes=1-2' }), ctx);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 1-2/4');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).range).toBe('bytes=1-2');
  });

  it('an unreachable or refused storage answer is a 404-shaped refusal, never a leaky 500 body', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// 6B B2 · ?page=N — the promoted rendering, served through the SAME route,
// the SAME gates and the SAME evidence discipline (no second byte path; the
// fence stays uniform). The page's extension comes from the MANIFEST (6A M4)
// — a fact, never a guess (R3/F-8) — and a page the manifest names that
// storage does not hold is REPORTED, not 404'd (R4/F-6): detection is what
// makes partial promotion repairable, and the screen says "page 3 is
// missing" instead of serving a citation to a ghost.
// ============================================================================
describe('6B B2 · ?page=N serves the promoted rendering through the same fence', () => {
  const RENDITION = { page_count: 2, page_exts: ['png', 'jpg'] };

  it('streams the named page with the MANIFEST extension and content-type', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '2' },
      }),
    );
    const res = await route.GET(getPage('2'), ctx);
    expect(res.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(
      `render/circle/${ROW.circle_id}/arrival/${ARRIVAL}/p002.jpg`,
      30,
    );
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('evidence before bytes holds for pages exactly as for the original', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    const order: string[] = [];
    artifacts.logArtifactRead.mockImplementationOnce(async () => {
      order.push('log');
    });
    fetchMock.mockImplementationOnce(async () => {
      order.push('fetch');
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    const res = await route.GET(getPage('1'), ctx);
    expect(res.status).toBe(200);
    expect(order).toEqual(['log', 'fetch']);
  });

  it('no manifest, a page outside it, and a malformed page all answer the ONE 404 shape', async () => {
    const ghost = await (async () => {
      artifacts.readableArtifact.mockResolvedValueOnce(null);
      return (await route.GET(get(), ctx)).text();
    })();

    const bodies: string[] = [];
    const statuses: number[] = [];

    artifacts.readableRendition.mockResolvedValueOnce(null); // not rendered / not visible
    let res = await route.GET(getPage('1'), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    artifacts.readableRendition.mockResolvedValueOnce(RENDITION); // page 3 of 2
    res = await route.GET(getPage('3'), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    res = await route.GET(getPage('0'), ctx); // not a page number
    statuses.push(res.status);
    bodies.push(await res.text());

    res = await route.GET(getPage('abc'), ctx);
    statuses.push(res.status);
    bodies.push(await res.text());

    expect(statuses).toEqual([404, 404, 404, 404]);
    expect(new Set([...bodies, ghost]).size).toBe(1);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('unauthorized answers the ghost WITHOUT touching the manifest — no oracle through ?page', async () => {
    artifacts.readableArtifact.mockResolvedValueOnce(null);
    const res = await route.GET(getPage('1'), ctx);
    expect(res.status).toBe(404);
    expect(artifacts.readableRendition).not.toHaveBeenCalled();
    expect(artifacts.logArtifactRead).not.toHaveBeenCalled();
  });

  it('a page the manifest names that storage lacks is REPORTED, not 404’d (R4/F-6)', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const res = await route.GET(getPage('1'), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'rendition_page_missing', page: 1 });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('a signed-URL refusal for a manifest-named page is the same honest report', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const res = await route.GET(getPage('2'), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'rendition_page_missing', page: 2 });
  });

  it('the original (no page parameter) is byte-for-byte unchanged by the feature', async () => {
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(ROW.storage_key, 30);
    expect(artifacts.readableRendition).not.toHaveBeenCalled();
  });
});

describe('B7 · evidence before bytes (§1.3 step 6; §10.5)', () => {
  it('the artifact_read entry is written BEFORE the stream starts', async () => {
    const order: string[] = [];
    artifacts.logArtifactRead.mockImplementationOnce(async () => {
      order.push('log');
    });
    fetchMock.mockImplementationOnce(async () => {
      order.push('fetch');
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    });
    await route.GET(get(), ctx);
    expect(order).toEqual(['log', 'fetch']);
    // 5B B8: the call SHRANK. hc.log_artifact_read resolves the circle, the
    // subject and the actor's display name itself, in-function, under its own
    // authorization — so passing them from the route would be passing values
    // the definer ignores, which reads like a contract and is decoration.
    const [logged] = artifacts.logArtifactRead.mock.calls[0];
    expect(logged).toEqual({ claims: CLAIMS, arrivalId: ARRIVAL });
  });

  it('a failed access-log write refuses the read — no bytes without a trail', async () => {
    artifacts.logArtifactRead.mockRejectedValueOnce(new Error('log unavailable'));
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 6B B9 · §6.9's machine-read text through the SAME fence: ?page=N&text=1
// serves the pNNN.txt sibling — same gates, same manifest contract, same
// evidence-before-bytes, no second byte path and no new privileged consumer
// (the A2 fence allowlist does not move). The sibling is NOT
// manifest-promised — only image-only sources have one — so its ABSENCE is
// the ordinary 404 shape, never the rendition_page_missing report: a page
// with no machine-read text is not a partial promotion.
// ============================================================================
describe('6B B9 · ?page=N&text=1 — the machine-read sibling through the fence', () => {
  const RENDITION = { page_count: 2, page_exts: ['png', 'jpg'] };

  function getText(page: string): Request {
    return new Request(`http://local.test/api/artifact/${ARRIVAL}?page=${page}&text=1`, {
      method: 'GET',
    });
  }

  it('serves the sibling as utf-8 text, no-store, keyed to the reserved stem', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockResolvedValueOnce(new Response('Amoxicillin 500 mg', { status: 200 }));
    const res = await route.GET(getText('1'), ctx);
    expect(res.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(
      `render/circle/${ROW.circle_id}/arrival/${ARRIVAL}/p001.txt`,
      30,
    );
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.text()).toBe('Amoxicillin 500 mg');
  });

  it('an EMPTY sibling serves as an empty 200 — "couldn’t read reliably" is the screen’s sentence to say', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const res = await route.GET(getText('2'), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('an ABSENT sibling is the one 404 shape — not image-only is not a partial promotion', async () => {
    const ghost = await (async () => {
      artifacts.readableArtifact.mockResolvedValueOnce(null);
      return (await route.GET(get(), ctx)).text();
    })();

    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const res = await route.GET(getText('1'), ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(ghost);
  });

  it('the manifest still gates: a page outside it answers 404 before any key is built', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    const res = await route.GET(getText('3'), ctx);
    expect(res.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('evidence before bytes holds for the text exactly as for the pages', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    const order: string[] = [];
    artifacts.logArtifactRead.mockImplementationOnce(async () => {
      order.push('log');
    });
    fetchMock.mockImplementationOnce(async () => {
      order.push('fetch');
      return new Response('text', { status: 200 });
    });
    const res = await route.GET(getText('1'), ctx);
    expect(res.status).toBe(200);
    expect(order).toEqual(['log', 'fetch']);
  });
});
