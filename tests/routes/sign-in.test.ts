import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// A3 · POST /sign-in/submit — the F1 password path (ADR-0013; TSD §5.5–§5.6;
// PRD §4.1.7).
//
// The contract, in order:
//   1. hc.auth_throttle is consulted BEFORE GoTrue sees the password; a
//      positive wait answers with §4.1.7's copy elements (level copy, the
//      wait, a reset link) and GoTrue is never called. The throttle is
//      existence-blind by 2A construction, so the throttled response
//      cannot be an oracle.
//   2. A failed verification records hc.record_auth_failure AND drives
//      the §5.11 notice path (note_suspicious_attempts), then answers
//      with ONE response — byte-identical whether the account exists
//      with a wrong password or does not exist at all, and echoing
//      nothing GoTrue said.
//   3. A successful verification records hc.record_auth_success AS the
//      proven user (claims from the session, no identifier) and
//      redirects.
// ============================================================================

const throttleMock = {
  consultThrottle: vi.fn(),
  recordFailure: vi.fn(async () => {}),
  noteSuspiciousAttempts: vi.fn(async () => {}),
  recordSuccess: vi.fn(async () => {}),
};
vi.mock('@/lib/hc/throttle', () => throttleMock);

const signInWithPassword = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { signInWithPassword } }),
}));

async function snapshot(res: Response) {
  const headers = [...res.headers.entries()]
    .filter(([k]) => k !== 'date')
    .sort(([a], [b]) => a.localeCompare(b));
  return { status: res.status, headers, body: await res.text() };
}

function post(body: Record<string, string>): Request {
  return new Request('http://local.test/sign-in/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

// A minimal, realistic GoTrue session payload (server-to-server trusted).
function fakeSession(sub: string, email: string) {
  const payload = Buffer.from(
    JSON.stringify({ sub, email, role: 'authenticated', session_id: 'sess-1', aal: 'aal1' }),
  ).toString('base64url');
  return { access_token: `h.${payload}.s`, refresh_token: 'r' };
}

let POST: (req: Request) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  throttleMock.consultThrottle.mockResolvedValue({ failures: 0, wait_seconds: 0 });
  ({ POST } = await import('@/app/(auth)/sign-in/submit/route'));
});

describe('A3 · throttle consult precedes GoTrue', () => {
  it('a positive wait short-circuits: §4.1.7 copy elements, GoTrue never called', async () => {
    throttleMock.consultThrottle.mockResolvedValue({ failures: 6, wait_seconds: 25 });
    const res = await POST(post({ email: 'a@b.c', password: 'x'.repeat(10) }));
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(throttleMock.recordFailure).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    const location = res.headers.get('location')!;
    expect(location).toContain('e=throttled');
    expect(location).toContain('wait=25');
  });

  it('the throttled response is identical whether or not the account exists (the DB answer is the only input)', async () => {
    throttleMock.consultThrottle.mockResolvedValue({ failures: 6, wait_seconds: 25 });
    const forGhost = await snapshot(await POST(post({ email: 'ghost@x.y', password: 'p'.repeat(12) })));
    const forHolder = await snapshot(await POST(post({ email: 'real@x.y', password: 'p'.repeat(12) })));
    expect(forGhost).toEqual(forHolder);
  });
});

describe('A3 · failure: one byte-identical response, outcome recorded', () => {
  it('wrong-password and no-such-account produce identical bytes and both record + note', async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' },
    });
    const wrongPw = await snapshot(await POST(post({ email: 'real@x.y', password: 'wrongwrong1' })));

    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'invalid grant: no such user', status: 400, code: 'user_not_found' },
    });
    const noUser = await snapshot(await POST(post({ email: 'ghost@x.y', password: 'wrongwrong1' })));

    expect(wrongPw).toEqual(noUser);
    expect(throttleMock.recordFailure).toHaveBeenCalledTimes(2);
    expect(throttleMock.noteSuspiciousAttempts).toHaveBeenCalledTimes(2);
    expect(throttleMock.recordSuccess).not.toHaveBeenCalled();
  });

  it('the failure redirect carries no GoTrue text and offers the reset path', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'secret-internal-detail', status: 400 },
    });
    const res = await POST(post({ email: 'a@b.c', password: 'wrongwrong1' }));
    const location = res.headers.get('location')!;
    expect(location).not.toContain('secret');
    expect(location).toContain('e=nomatch');
  });
});

describe('A3 · success: identity-bound recording, then the redirect', () => {
  it('records success AS the session user and redirects to /setup', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: fakeSession('11111111-1111-4111-8111-111111111111', 'real@x.y') },
      error: null,
    });
    const res = await POST(post({ email: 'real@x.y', password: 'rightright1' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/setup');
    expect(throttleMock.recordSuccess).toHaveBeenCalledTimes(1);
    const [kind, claims] = throttleMock.recordSuccess.mock.calls[0] as unknown as [
      string,
      { sub?: string },
    ];
    expect(kind).toBe('success');
    expect(claims.sub).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('honours a same-origin relative next target and refuses absolute or scheme-relative ones', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: fakeSession('11111111-1111-4111-8111-111111111111', 'real@x.y') },
      error: null,
    });
    const good = await POST(post({ email: 'real@x.y', password: 'rightright1', next: '/accept/tok123' }));
    expect(good.headers.get('location')).toContain('/accept/tok123');

    const evil = await POST(
      post({ email: 'real@x.y', password: 'rightright1', next: 'https://evil.example/x' }),
    );
    expect(evil.headers.get('location')).not.toContain('evil.example');

    const schemeRelative = await POST(
      post({ email: 'real@x.y', password: 'rightright1', next: '//evil.example/x' }),
    );
    expect(schemeRelative.headers.get('location')).not.toContain('evil.example');
  });
});
