import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// A3 · The recovery path (TSD §5.5 row 3; §5.6; ADR-0013 F1).
//
//   - The request POST answers byte-identically whether or not the address
//     has an account (GoTrue silent-skips; the route surfaces nothing) and
//     is NEVER throttle-gated: AC-AUTH-12 forbids blocking the email reset
//     path, so no consult happens here.
//   - The confirm POST (a live recovery session) sets the password and
//     records reset_completed AS the proven user — the identity-bound
//     success recorder, which clears the throttle for the holder.
// ============================================================================

const throttleMock = {
  consultThrottle: vi.fn(),
  recordFailure: vi.fn(async () => {}),
  noteSuspiciousAttempts: vi.fn(async () => {}),
  recordSuccess: vi.fn(async () => {}),
};
vi.mock('@/lib/hc/throttle', () => throttleMock);

const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();
const getClaims = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { resetPasswordForEmail, updateUser, getClaims } }),
}));

async function snapshot(res: Response) {
  const headers = [...res.headers.entries()]
    .filter(([k]) => k !== 'date')
    .sort(([a], [b]) => a.localeCompare(b));
  return { status: res.status, headers, body: await res.text() };
}

function post(path: string, body: Record<string, string>): Request {
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

describe('A3 · POST /reset/submit — byte-identical, never throttle-gated', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import('@/app/(auth)/reset/submit/route'));
  });

  it('the recovery redirect comes from configuration, never the request (reset-poisoning refusal)', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.harperscircle.example';
    try {
      resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
      await POST(post('/reset/submit', { email: 'real@x.y' }));
      expect(resetPasswordForEmail).toHaveBeenCalledWith('real@x.y', {
        redirectTo: 'https://app.harperscircle.example/confirm?flow=recovery',
      });
    } finally {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  });

  it('without configuration, a non-local request origin is NOT trusted into the mail link', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const req = new Request('https://attacker-forged.example/reset/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'real@x.y' }).toString(),
    });
    await POST(req);
    const [, options] = resetPasswordForEmail.mock.calls[0] as unknown as [
      string,
      { redirectTo?: string } | undefined,
    ];
    expect(options?.redirectTo ?? '').not.toContain('attacker-forged.example');
  });

  it('account and ghost answer with identical bytes', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const holder = await snapshot(await POST(post('/reset/submit', { email: 'real@x.y' })));

    resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { message: 'For security purposes...', status: 429 },
    });
    const ghost = await snapshot(await POST(post('/reset/submit', { email: 'ghost@x.y' })));

    expect(holder).toEqual(ghost);
    expect(holder.status).toBe(303);
    expect(throttleMock.consultThrottle).not.toHaveBeenCalled();
  });
});

describe('A3 · POST /reset/confirm/submit — records reset_completed as the user', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import('@/app/(auth)/reset/confirm/submit/route'));
  });

  it('with a live recovery session: password set, identity-bound record, redirect on', async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: { sub: '66666666-6666-4666-8666-666666666666', email: 'real@x.y', role: 'authenticated' },
      },
      error: null,
    });
    updateUser.mockResolvedValue({ data: { user: {} }, error: null });

    const res = await POST(post('/reset/confirm/submit', { password: 'new-password-1' }));
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
    expect(throttleMock.recordSuccess).toHaveBeenCalledTimes(1);
    const [kind, claims] = throttleMock.recordSuccess.mock.calls[0] as unknown as [
      string,
      { sub?: string },
    ];
    expect(kind).toBe('reset_completed');
    expect(claims.sub).toBe('66666666-6666-4666-8666-666666666666');
    expect(res.status).toBe(303);
  });

  it('a short password answers in plain language before any write', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'x', role: 'authenticated' } },
      error: null,
    });
    const res = await POST(post('/reset/confirm/submit', { password: 'niner-pw9' }));
    expect(updateUser).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('e=password-length');
  });

  it('without a session the confirm refuses to the request form', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'no session' } });
    const res = await POST(post('/reset/confirm/submit', { password: 'new-password-1' }));
    expect(updateUser).not.toHaveBeenCalled();
    expect(throttleMock.recordSuccess).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/reset');
  });
});
