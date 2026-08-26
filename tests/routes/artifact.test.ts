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

// ============================================================================
// 6B close-out · F5 (ADR-0026 D18) — STORAGE THAT NEVER ANSWERS IS BOUNDED.
//
// Gate run r6 at 5457eaa came back 37/1. The one was
// e2e/review.spec.ts:407 (REV-02), and the REV-02 behaviour under test was
// CORRECT throughout: the trace shows POST /decide/submit answering 303 in
// 4.64 s to ?refused=version&proposal=<the very proposal the leg bumped>,
// and the redirect landing 200 in 385 ms. The leg still failed, because
// GET /api/artifact/<id>?page=1 on the re-rendered screen NEVER ANSWERED —
// status -1, all timings -1, outstanding for the remaining ~106 s — so the
// page never reached `load` and waitForURL (which waits for `load` by
// default) timed out. The route had awaited storage with no AbortSignal and
// no timeout; it logged nothing, because it was blocked inside the await
// rather than in either error branch.
//
// What a person would have seen is the thing this codebase refuses to ship:
// a review screen spinning forever with no state and nothing said out loud.
// §6.8's whole posture — "Couldn't read it", "Needs a password", the
// four-state scan proof — is that the screen NAMES what went wrong. An
// indefinite wait is the one answer it is not allowed to give.
//
// These are the r6 finding pinned BEFORE the fix exists. The first two fail
// by HANGING against the unbounded route, which is precisely the defect.
// ============================================================================
describe('6B close-out F5 · a stalled storage read becomes a named state, never a hang', () => {
  const RENDITION = { page_count: 2, page_exts: ['png', 'jpg'] };
  const NEVER = () => new Promise<Response>(() => {});
  const SENTINEL = 120_000; // the browser-gate leg's own budget

  /** Answer, or the marker that the route out-waited an entire gate leg. */
  async function answerWithin(req: Request): Promise<Response | 'HUNG'> {
    const answered = route.GET(req, ctx);
    const raced = Promise.race([
      answered,
      new Promise<'HUNG'>((r) => setTimeout(() => r('HUNG'), SENTINEL)),
    ]);
    await vi.advanceTimersByTimeAsync(SENTINEL);
    return raced;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('?page=N is BOUNDED — it answers rather than awaiting storage forever', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockImplementationOnce(NEVER);
    expect(await answerWithin(getPage('1'))).not.toBe('HUNG');
  });

  it('the bounded answer is NAMED — storage_timeout, not a silent 404 or a rendition_page_missing it is not', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockImplementationOnce(NEVER);
    const res = await answerWithin(getPage('1'));
    expect(res).not.toBe('HUNG');
    const answer = res as Response;
    expect(answer.status).toBe(504);
    expect(await answer.json()).toEqual({ error: 'storage_timeout', page: 1 });
    expect(answer.headers.get('cache-control')).toBe('private, no-store');
  });

  it('the main byte path is bounded too, and keeps its ONE 404 shape (404 ≡ 403)', async () => {
    fetchMock.mockImplementationOnce(NEVER);
    const res = await answerWithin(get());
    expect(res).not.toBe('HUNG');
    expect((res as Response).status).toBe(404);
  });

  it('a storage read that DOES answer is not delayed and leaves no timer behind', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200 }));
    const res = await route.GET(getPage('1'), ctx);
    expect(res.status).toBe(200);
    // A bound that outlives its own request would keep the process awake.
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ============================================================================
// 6B close-out · F6 (ADR-0026 D20) — THE BOUND F5 DREW WAS IN THE WRONG PLACE.
//
// Gate run r7 at 7ecc81b came back 36/2. F5's own leg went GREEN (leg 35,
// REV-02, 12.2 s against r6's 120 s timeout), and leg 38 — A11Y-08 / OCR-01,
// which PASSED at r6 in 8.6 s — went red on `.review-machine-text` never
// appearing. The preserved trace (%TEMP%\claude\r7-failures\) shows why:
//
//   404  GET  17552ms  /api/artifact/b4cf239a…?page=1
//   -1   GET       -1  /api/artifact/b4cf239a…?page=1&text=1   NEVER ANSWERED
//
// THE DISCRIMINATOR: if that hang had been inside the fetch F5 bounded, it
// would have ANSWERED — the text path returns notFound() on timeout, so a 404
// at ~10 s. It never answered at all. The hang is UPSTREAM of the bound. The
// 404 that took 17.5 s corroborates: that path returns before any fetch, so
// 17.5 s was spent in the DB reads and the signed-URL hop ahead of it.
//
// So F5's fix is correct and INCOMPLETE. It bounded the two `fetch` calls,
// which is what the gate had found. But
// `asServiceRole().storage.from('artifacts').createSignedUrl(key, 30)` is
// itself an outbound HTTP call, and readableArtifact / readableRendition /
// logArtifactRead are three more network round-trips. The class was never
// "unbounded fetch" — it is UNBOUNDED NETWORK CALL IN A ROUTE A PERSON IS
// WAITING ON, and bounding the visible half is exactly the partial fix
// ADR-0026 already warns about: reasonable, precedented, and still a guess.
//
// AND PER-CALL BOUNDS DO NOT COMPOSE. Eight awaits at ten seconds each is
// eighty seconds of spinner, every one of them "within bounds". The number a
// person experiences is the SUM, so the budget has to be shared — which is
// what the last case here pins, and what no per-call bound can satisfy.
//
// These are the r7 finding pinned BEFORE the fix exists. Seven fail by HANGING
// outright; the last is still unanswered at 20 s.
//
// The SESSION read is here for the same reason and was found the same way:
// liveSessionClaims is two auth-server round-trips (getUser, then getClaims)
// and it is the FIRST thing this route does, so a stall there is precisely the
// "never answered" shape leg 38 recorded — before the route even knows who is
// asking.
// ============================================================================
describe('6B close-out F6 · every await in the route is inside ONE answer budget', () => {
  const RENDITION = { page_count: 2, page_exts: ['png', 'jpg'] };
  const NEVER = () => new Promise<never>(() => {});

  /**
   * The budget this route must answer within, stated HERE rather than
   * imported: the test says what the contract is and the code has to meet it.
   * A number the test reads back out of the code under test pins nothing.
   */
  const BUDGET = 15_000;
  /** One second past it — close enough that these cases pin the contract, not
   *  merely "eventually". F5's cases used the gate leg's own 120 s, which
   *  proves the hang is gone but would accept an eighty-second answer. */
  const OVER_BUDGET = BUDGET + 1_000;

  function getText(page: string): Request {
    return new Request(`http://local.test/api/artifact/${ARRIVAL}?page=${page}&text=1`, {
      method: 'GET',
    });
  }

  /** Answer, or the marker that the route out-waited an entire gate leg. */
  async function answerWithin(req: Request, ms = OVER_BUDGET): Promise<Response | 'HUNG'> {
    const answered = route.GET(req, ctx);
    const raced = Promise.race([
      answered,
      new Promise<'HUNG'>((r) => setTimeout(() => r('HUNG'), ms)),
    ]);
    await vi.advanceTimersByTimeAsync(ms);
    return raced;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a stalled SESSION read is bounded — the route answers before it knows who is asking', async () => {
    session.liveSessionClaims.mockImplementationOnce(NEVER);
    const res = await answerWithin(get());
    expect(res).not.toBe('HUNG');
    // ROUND-18 F-1: it is NOT the 404 any more. A session the route could not
    // READ in time is not a session that does not exist, and the difference is
    // the only thing the caller needs: whether to try again.
    expect((res as Response).status).toBe(504);
    expect(artifacts.readableArtifact).not.toHaveBeenCalled();
  });

  it('a stalled RLS read is bounded — and is a TIMEOUT, not the absence 404 (round-18 F-1)', async () => {
    artifacts.readableArtifact.mockImplementationOnce(NEVER);
    const res = await answerWithin(get());
    expect(res).not.toBe('HUNG');
    expect((res as Response).status).toBe(504);
    expect(await (res as Response).json()).toEqual({ error: 'read_timeout' });
  });

  it('a stalled MANIFEST read is bounded — the page path answers, it does not spin', async () => {
    artifacts.readableRendition.mockImplementationOnce(NEVER);
    const res = await answerWithin(getPage('1'));
    expect(res).not.toBe('HUNG');
    expect((res as Response).status).toBe(504);
    expect(await (res as Response).json()).toEqual({ error: 'read_timeout' });
  });

  it('a stalled access-log write is bounded — evidence before bytes, and NO bytes move', async () => {
    artifacts.logArtifactRead.mockImplementationOnce(NEVER);
    const res = await answerWithin(get());
    expect(res).not.toBe('HUNG');
    // Its existing shape: a trail that cannot be confirmed refuses the read.
    expect((res as Response).status).toBe(500);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a stalled signed-URL hop on the PAGE path is storage_timeout, NOT rendition_page_missing', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    createSignedUrl.mockImplementationOnce(NEVER);
    const res = await answerWithin(getPage('1'));
    expect(res).not.toBe('HUNG');
    const answer = res as Response;
    // F5's distinction, applied one call earlier: 503 says the manifest names
    // a page storage does not hold — permanent, repairable. This says the page
    // is very likely there and the hop stalled — transient, retryable.
    expect(answer.status).toBe(504);
    expect(await answer.json()).toEqual({ error: 'storage_timeout', page: 1 });
    expect(answer.headers.get('cache-control')).toBe('private, no-store');
  });

  it('a stalled signed-URL hop on the MAIN byte path keeps the ONE 404 shape', async () => {
    createSignedUrl.mockImplementationOnce(NEVER);
    const res = await answerWithin(get());
    expect(res).not.toBe('HUNG');
    expect((res as Response).status).toBe(404);
  });

  it('a stalled signed-URL hop on the MACHINE-READ sibling is a TIMEOUT — the screen must not say "not stored" (round-18 F-1)', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    createSignedUrl.mockImplementationOnce(NEVER);
    const res = await answerWithin(getText('1'));
    expect(res).not.toBe('HUNG');
    // The sibling is not manifest-promised, so its ABSENCE is rightly the ONE
    // 404 — and the screen renders that as "No machine-read text is stored for
    // this page." A STALL is a different fact and must not borrow that
    // sentence: MachineReadText maps 404 → 'absent' and every other non-ok →
    // 'failed', which says "couldn't be loaded right now". F-1's harm is
    // exactly the sentence, so the fix is exactly here.
    expect((res as Response).status).toBe(504);
    expect(await (res as Response).json()).toEqual({ error: 'storage_timeout', page: 1 });
  });

  it('FOUR awaits each answering inside its own bound STILL answer within the shared budget', async () => {
    // Nine seconds is "slow, but inside any per-call bound this codebase would
    // pick". Four of them in series is 36 s — and every one of them is within
    // bounds. 20 s sits deliberately BETWEEN the 15 s budget and that 36 s, so
    // this case can only pass if the budget is SHARED across the awaits rather
    // than restarted at each one. It is the case a per-call bound cannot pass.
    const slow = <T>(v: T) => () => new Promise<T>((r) => setTimeout(() => r(v), 9_000));
    artifacts.readableArtifact.mockImplementationOnce(slow(ROW));
    artifacts.readableRendition.mockImplementationOnce(slow(RENDITION));
    artifacts.logArtifactRead.mockImplementationOnce(slow(undefined));
    createSignedUrl.mockImplementationOnce(
      slow({ data: { signedUrl: 'http://storage.internal/signed/abc' }, error: null }),
    );

    // Past the budget, nowhere near the 36 s four separate bounds would allow.
    const res = await answerWithin(getPage('1'), 20_000);
    expect(res).not.toBe('HUNG');
    // The budget lands mid-flight in the SECOND await — the manifest read,
    // which started at 9 s and would have returned at 18 s — so the answer is
    // that read's named state, which since round-18 F-1 is the timeout rather
    // than the absence 404. Which await gets cut is incidental; that the route
    // answers at all by 20 s is the whole finding.
    expect((res as Response).status).toBe(504);
  });

  it('a stalled storage READ on the machine-read sibling is a timeout too — the same sentence, the same fix', async () => {
    artifacts.readableRendition.mockResolvedValueOnce(RENDITION);
    fetchMock.mockImplementationOnce(NEVER);
    const res = await answerWithin(getText('1'));
    expect(res).not.toBe('HUNG');
    // The signed-URL hop and the byte read are the same fact to a person: the
    // text did not arrive because a read stalled, NOT because none is stored.
    expect((res as Response).status).toBe(504);
    expect(await (res as Response).json()).toEqual({ error: 'storage_timeout', page: 1 });
  });

  it('an overrun says READ_TIMEOUT wherever it happens — one name for one fact', async () => {
    // The three DB/session reads gate every path, so their overrun has to
    // carry one name rather than three shapes decided by which URL was asked.
    for (const stall of [
      () => session.liveSessionClaims.mockImplementationOnce(NEVER),
      () => artifacts.readableArtifact.mockImplementationOnce(NEVER),
    ]) {
      vi.resetAllMocks();
      session.liveSessionClaims.mockResolvedValue(CLAIMS);
      artifacts.readableArtifact.mockResolvedValue(ROW);
      artifacts.logArtifactRead.mockResolvedValue(undefined);
      stall();
      const res = await answerWithin(get());
      expect(res).not.toBe('HUNG');
      expect((res as Response).status).toBe(504);
      expect(await (res as Response).json()).toEqual({ error: 'read_timeout' });
      expect((res as Response).headers.get('cache-control')).toBe('private, no-store');
    }
  });

  it('THE NO-ORACLE CONTROL: the timeout is decided by the CLOCK, so it cannot answer "does this exist?"', async () => {
    // §1.3's 404 ≡ 403 exists so a caller learns nothing from the shape of a
    // refusal. A timeout is not an authorization answer, and this pins that it
    // never becomes one: the row that EXISTS and the row that does NOT answer
    // byte-identically once the read overruns, because the read never
    // completed and the route has nothing to be an oracle WITH.
    const seen: string[] = [];
    for (const row of [ROW, null]) {
      vi.resetAllMocks();
      session.liveSessionClaims.mockResolvedValue(CLAIMS);
      artifacts.readableArtifact.mockImplementation(
        () => new Promise(() => {}) as unknown as Promise<typeof row>,
      );
      const res = (await answerWithin(get())) as Response;
      seen.push(`${res.status} ${await res.text()}`);
    }
    expect(seen[0]).toBe(seen[1]);
  });

  it('and ABSENCE still keeps the ONE 404 — the fix separates two facts, it does not merge them', async () => {
    vi.resetAllMocks();
    session.liveSessionClaims.mockResolvedValue(CLAIMS);
    artifacts.readableArtifact.mockResolvedValue(null);
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(404);
  });

  it('a healthy request leaves NO timer behind — on the main byte path too', async () => {
    const res = await route.GET(get(), ctx);
    expect(res.status).toBe(200);
    // A budget that outlives its own request is a handle that keeps the
    // process awake — the same trap F5's own timer had to be cleared out of.
    expect(vi.getTimerCount()).toBe(0);
  });
});
