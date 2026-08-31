import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// A7 · Account (PRD §4.1.6, narrowed by the kickoff to: global sign-out
// with its access-log entry [AC-AUTH-10 — the log half is a recorded DDL
// finding, see the build ADR] and the verify-email state + resend), plus
// A8's step-up re-auth submit — the THIRD and last password path the app
// exposes (ADR-0013 F1): consult before GoTrue, record either outcome,
// mint the §5.7 token from the FRESH session only.
// ============================================================================

const throttleMock = {
  consultThrottle: vi.fn(),
  recordFailure: vi.fn(async () => {}),
  noteSuspiciousAttempts: vi.fn(async () => {}),
  recordSuccess: vi.fn(async () => {}),
};
vi.mock('@/lib/hc/throttle', () => throttleMock);

const stepUp = { mintStepUp: vi.fn() };
vi.mock('@/lib/hc/step-up', () => stepUp);

const members = {
  removeMember: vi.fn(),
  revokeSessionsForAccount: vi.fn(async () => {}),
};
vi.mock('@/lib/hc/members', () => members);

// B8: APP-09b's app half — the sign-out route writes the signed_out
// entry through the request-role channel before the GoTrue kill.
const accountsHc = {
  bootstrapAccount: vi.fn(async () => {}),
  unconfirmEmail: vi.fn(async () => {}),
  abortAccountCreation: vi.fn(async () => {}),
  logSignOut: vi.fn(async () => ({ logged: 0 })),
};
vi.mock('@/lib/hc/accounts', () => accountsHc);

// 7B B1 · OW-18: the activation pass offered again rides lib/hc/ingest.
const ingest = { activateForwardingAfterVerification: vi.fn() };
vi.mock('@/lib/hc/ingest', () => ingest);

const signOut = vi.fn(async () => ({ error: null }));
const signInWithPassword = vi.fn();
const getClaims = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { signOut, signInWithPassword, getClaims, getUser }, from }),
}));

function post(path: string, body: Record<string, string> = {}): Request {
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

function fakeSession(sub: string, email: string) {
  const payload = Buffer.from(
    JSON.stringify({ sub, email, role: 'authenticated', aal: 'aal1' }),
  ).toString('base64url');
  return { access_token: `h.${payload}.s`, refresh_token: 'r' };
}

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({
    data: { claims: { sub: 'u-1', email: 'sarah@example.com', role: 'authenticated' } },
    error: null,
  });
  throttleMock.consultThrottle.mockResolvedValue({ failures: 0, wait_seconds: 0 });
  accountsHc.logSignOut.mockResolvedValue({ logged: 0 });
});

describe('A7 · the account screen', () => {
  it('shows the verified state and the resend control when unverified', async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { email: 'sarah@example.com', email_verified_at: null, display_name: 'Sarah' },
          }),
        }),
      }),
    });
    const { default: Page } = await import('@/app/account/page');
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html.toLowerCase()).toContain('verify');
    expect(html).toContain('/verify-email/submit');
    expect(html).toContain('/account/sign-out-everywhere');
  });

  it('a verified account shows no resend nag', async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              email: 'sarah@example.com',
              email_verified_at: '2026-08-18T00:00:00Z',
              display_name: 'Sarah',
            },
          }),
        }),
      }),
    });
    const { default: Page } = await import('@/app/account/page');
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain('/verify-email/submit');
  });

  // 7B B1 · OW-18 (ADR-0028 D15 item 4): "Everything is on" is claimed only
  // when the activation pass ran; when it did not, the page says what is on,
  // what is not, and offers the pass again.
  function verifiedAccount() {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { email: 'sarah@example.com', email_verified_at: '2026-08-18T00:00:00Z', display_name: 'Sarah' },
          }),
        }),
      }),
    });
  }

  it('?verified=1 alone still says everything is on', async () => {
    verifiedAccount();
    const { default: Page } = await import('@/app/account/page');
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ verified: '1' }) }));
    expect(html).toContain('Everything is on.');
    expect(html).not.toContain('/account/activate-forwarding/submit');
  });

  it('?verified=1&forwarding=failed never says everything is on — it says what did not finish and offers the pass again', async () => {
    verifiedAccount();
    const { default: Page } = await import('@/app/account/page');
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ verified: '1', forwarding: 'failed' }) }),
    );
    expect(html).not.toContain('Everything is on.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Your email is verified.');
    expect(html).toContain("didn&#x27;t finish");
    expect(html).toContain('/account/activate-forwarding/submit');
  });

  it('?forwarding=on confirms the pass ran', async () => {
    verifiedAccount();
    const { default: Page } = await import('@/app/account/page');
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ forwarding: 'on' }) }));
    expect(html).toContain('The forwarding addresses are on.');
  });
});

describe('7B B1 · the activation pass, offered again (OW-18)', () => {
  it('runs the idempotent pass on the live claims and lands on forwarding=on', async () => {
    ingest.activateForwardingAfterVerification.mockResolvedValueOnce({ activated: 1 });
    const { POST } = await import('@/app/account/activate-forwarding/submit/route');
    const res = await POST(post('/account/activate-forwarding/submit'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account?forwarding=on');
    expect(ingest.activateForwardingAfterVerification).toHaveBeenCalledTimes(1);
    expect(ingest.activateForwardingAfterVerification.mock.calls[0][0]).toMatchObject({ sub: 'u-1' });
  });

  it('a pass that fails lands back on the honest marker, never on "everything is on"', async () => {
    ingest.activateForwardingAfterVerification.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));
    const { POST } = await import('@/app/account/activate-forwarding/submit/route');
    const res = await POST(post('/account/activate-forwarding/submit'));
    expect(res.headers.get('location')).toBe('/account?verified=1&forwarding=failed');
  });
});

describe('A7/B8 · sign out everywhere (AC-AUTH-10 — BOTH halves)', () => {
  it("writes the signed_out access-log entry BEFORE GoTrue's global kill, then lands on sign-in", async () => {
    const order: string[] = [];
    accountsHc.logSignOut.mockImplementationOnce(async () => {
      order.push('log');
      return { logged: 1 };
    });
    signOut.mockImplementationOnce(async () => {
      order.push('signOut');
      return { error: null };
    });
    const { POST } = await import('@/app/account/sign-out-everywhere/route');
    const res = await POST(post('/account/sign-out-everywhere'));
    expect(order).toEqual(['log', 'signOut']);
    expect(accountsHc.logSignOut).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u-1' }),
    );
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/sign-in');
  });

  it('a failed log entry never blocks the sign-out itself (sign-out is never refused)', async () => {
    accountsHc.logSignOut.mockRejectedValueOnce(new Error('channel down'));
    const { POST } = await import('@/app/account/sign-out-everywhere/route');
    const res = await POST(post('/account/sign-out-everywhere'));
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(res.status).toBe(303);
  });

  it('an anonymous request still signs out quietly — no log, no refusal', async () => {
    // getUser null short-circuits liveSessionClaims before getClaims runs,
    // so only the user probe is queued (a leaked once-mock would poison
    // the next test's claims read).
    getUser.mockResolvedValueOnce({
      data: { user: null as unknown as { id: string } },
      error: null,
    });
    const { POST } = await import('@/app/account/sign-out-everywhere/route');
    const res = await POST(post('/account/sign-out-everywhere'));
    expect(accountsHc.logSignOut).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
  });
});

describe('A8 · step-up re-auth — the third F1 password path', () => {
  it('consults the throttle BEFORE GoTrue; a positive wait short-circuits', async () => {
    throttleMock.consultThrottle.mockResolvedValue({ failures: 6, wait_seconds: 30 });
    const { POST } = await import('@/app/account/step-up/submit/route');
    const res = await POST(
      post('/account/step-up/submit', {
        password: 'x'.repeat(12),
        operation: 'share_object',
        target_ref: 'doc:1',
        next: '/somewhere',
      }),
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('e=throttled');
  });

  it('failure records + notes and answers the uniform shape', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });
    const { POST } = await import('@/app/account/step-up/submit/route');
    const res = await POST(
      post('/account/step-up/submit', {
        password: 'wrong-wrong-1',
        operation: 'share_object',
        target_ref: 'doc:1',
      }),
    );
    expect(throttleMock.recordFailure).toHaveBeenCalled();
    expect(throttleMock.noteSuspiciousAttempts).toHaveBeenCalled();
    expect(stepUp.mintStepUp).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('e=nomatch');
  });

  it('success records identity-bound, mints from the FRESH session claims, and hands the token by cookie', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: fakeSession('u-1', 'sarah@example.com') },
      error: null,
    });
    stepUp.mintStepUp.mockResolvedValue({ token: 'e'.repeat(64), expires_at: 'x' });
    const { POST } = await import('@/app/account/step-up/submit/route');
    const res = await POST(
      post('/account/step-up/submit', {
        password: 'right-right-1',
        operation: 'share_object',
        target_ref: 'doc:1',
        next: '/c-1/documents',
      }),
    );
    expect(throttleMock.recordSuccess).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ sub: 'u-1' }),
    );
    expect(stepUp.mintStepUp).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u-1' }),
      'share_object',
      'doc:1',
    );
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('e'.repeat(64));
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(res.headers.get('location')).toContain('/c-1/documents');
  });
});

describe('A8 · remove-member wiring (AC-PERM-3, §5.8 sessions row)', () => {
  it('removal returns the account and the route revokes its sessions immediately', async () => {
    members.removeMember.mockResolvedValue({ account_id: 'gone-1' });
    const { POST } = await import('@/app/(app)/[circle]/members/[member]/remove/route');
    const res = await POST(post('/c-1/members/m-1/remove'), {
      params: Promise.resolve({ circle: 'c-1', member: 'm-1' }),
    });
    expect(members.removeMember).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u-1' }),
      'm-1',
      undefined,
    );
    expect(members.revokeSessionsForAccount).toHaveBeenCalledWith('gone-1');
    expect(res.status).toBe(303);
  });

  it('a refusal (last coordinator, non-coordinator) revokes nothing', async () => {
    members.removeMember.mockRejectedValue(new Error('remove_refused'));
    const { POST } = await import('@/app/(app)/[circle]/members/[member]/remove/route');
    const res = await POST(post('/c-1/members/m-1/remove'), {
      params: Promise.resolve({ circle: 'c-1', member: 'm-1' }),
    });
    expect(members.revokeSessionsForAccount).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('e=refused');
  });
});
