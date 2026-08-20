import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// A3 · POST /create-account/submit — non-enumeration byte-identity
// (TSD §5.5 "Never enumerate accounts"; PRD §4.1.2, §4.1.7).
//
// The settled verification model (probed against the live GoTrue and
// recorded in docs/ops/auth-config-parity.md): this GoTrue gates the
// password grant on email confirmation UNCONDITIONALLY, so the only way
// an unverified founder can hold a session — "setup is never blocked on
// checking mail" — is the signup-minted one. Therefore:
//
//   fresh    → public signUp (autoconfirm mints the session) → the
//              boundary IMMEDIATELY un-confirms auth.users (autoconfirm's
//              lie corrected where 2A's mirror reads truth — AC-AUTH-4
//              stays real) → accounts bootstrap (AFTER the un-confirm, so
//              the insert mirror reads NULL) → verification mail.
//   existing → GoTrue answers user_already_exists; nothing is written.
//
// Both branches answer the SAME status + Location + body. The one channel
// that necessarily differs is Set-Cookie (the fresh branch carries its
// session; GoTrue's confirmation-gate binary forces the choice between
// this and blocking setup on mail) — recorded as the §5.5 deviation in
// the parity doc and the build ADR, re-seen at round 10.
//
// Contract:
//   1. Validation (name present, password ≥ 10, plain language) happens
//      BEFORE any GoTrue call.
//   2. fresh vs exists → identical status/Location/body; the
//      verification-mail request is issued in BOTH branches.
//   3. Writes only on fresh — un-confirm strictly BEFORE the accounts
//      bootstrap (the mirror-order invariant), then the mail.
// ============================================================================

const signUp = vi.fn();
const resend = vi.fn(
  async (): Promise<{ data: unknown; error: unknown }> => ({ data: {}, error: null }),
);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { signUp, resend } }),
}));

const accounts = {
  bootstrapAccount: vi.fn(async () => {}),
  unconfirmEmail: vi.fn(async () => {}),
  abortAccountCreation: vi.fn(async () => {}),
};
vi.mock('@/lib/hc/accounts', () => accounts);

const invites = { describeInvite: vi.fn() };
vi.mock('@/lib/hc/invites', () => invites);

async function snapshot(res: Response) {
  const headers = [...res.headers.entries()]
    .filter(([k]) => k !== 'date' && k !== 'set-cookie')
    .sort(([a], [b]) => a.localeCompare(b));
  return { status: res.status, headers, body: await res.text() };
}

function post(body: Record<string, string>): Request {
  return new Request('http://local.test/create-account/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

let POST: (req: Request) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ POST } = await import('@/app/(auth)/create-account/submit/route'));
});

describe('A3 · validation precedes any GoTrue call', () => {
  it('a 9-char password answers in plain language and never reaches GoTrue', async () => {
    const res = await POST(post({ name: 'Sarah', email: 'a@b.c', password: 'short-pw9' }));
    expect(signUp).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=password-length');
  });

  it('a missing name answers the same way', async () => {
    const res = await POST(post({ name: '', email: 'a@b.c', password: 'long-enough-pw' }));
    expect(signUp).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
  });
});

describe('A3 · created vs already-exists: one visible response', () => {
  const FRESH_USER = { id: '22222222-2222-4222-8222-222222222222' };

  it('identical status/Location/body; verification mail requested in both branches', async () => {
    signUp.mockResolvedValueOnce({
      data: { user: FRESH_USER, session: { access_token: 'a.b.c', refresh_token: 'r' } },
      error: null,
    });
    const fresh = await snapshot(
      await POST(post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' })),
    );

    signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'User already registered', status: 422, code: 'user_already_exists' },
    });
    const exists = await snapshot(
      await POST(post({ name: 'Sarah', email: 'taken@x.y', password: 'long-enough-pw' })),
    );

    expect(fresh).toEqual(exists);
    expect(fresh.status).toBe(303);
    expect(resend).toHaveBeenCalledTimes(2);
  });

  it('the verification link lands on OUR /confirm (B9 fix: FWD-01 rides it) — signUp and resend both carry the redirect', async () => {
    // Found by the B9 gate leg: GoTrue's default confirmation link
    // self-verifies at the API and redirects to the site ROOT — the
    // /confirm route (and the forwarding-activation pass on it) never
    // ran. The reset flow's config-first origin rule applies verbatim:
    // local loopback falls back to the request origin; elsewhere the
    // redirect comes from NEXT_PUBLIC_SITE_URL or is omitted (a
    // neutered link, never a poisoned one).
    signUp.mockResolvedValueOnce({
      data: { user: FRESH_USER, session: { access_token: 'a.b.c', refresh_token: 'r' } },
      error: null,
    });
    await POST(post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' }));
    const [signUpArgs] = signUp.mock.calls[0] as unknown as [
      { options?: { emailRedirectTo?: string } },
    ];
    expect(signUpArgs.options?.emailRedirectTo).toBe('http://local.test/confirm?flow=signup');
    const [resendArgs] = resend.mock.calls[0] as unknown as [
      { options?: { emailRedirectTo?: string } },
    ];
    expect(resendArgs.options?.emailRedirectTo).toBe('http://local.test/confirm?flow=signup');
  });

  it('fresh: un-confirm strictly before the accounts bootstrap, with the typed name', async () => {
    signUp.mockResolvedValueOnce({
      data: { user: FRESH_USER, session: { access_token: 'a.b.c', refresh_token: 'r' } },
      error: null,
    });
    await POST(post({ name: 'Sarah Chen', email: 'fresh@x.y', password: 'long-enough-pw' }));

    expect(accounts.unconfirmEmail).toHaveBeenCalledWith(FRESH_USER.id);
    // B8: the bootstrap rides hc.create_account as the fresh session's
    // OWN claims — no target parameter exists to aim elsewhere.
    expect(accounts.bootstrapAccount).toHaveBeenCalledWith(
      expect.objectContaining({ sub: FRESH_USER.id }),
      'Sarah Chen',
    );
    const unconfirmOrder = accounts.unconfirmEmail.mock.invocationCallOrder[0];
    const bootstrapOrder = accounts.bootstrapAccount.mock.invocationCallOrder[0];
    expect(unconfirmOrder).toBeLessThan(bootstrapOrder);
  });

  it('invite variant: the address comes from the TOKEN server-side; a submitted email is ignored (§4.1.4)', async () => {
    invites.describeInvite.mockResolvedValue({
      state: 'pending',
      invited_email: 'dan@example.com',
    });
    signUp.mockResolvedValueOnce({
      data: { user: FRESH_USER, session: { access_token: 'a.b.c', refresh_token: 'r' } },
      error: null,
    });
    const token = 'b'.repeat(64);
    const res = await POST(
      post({
        name: 'Dan',
        email: 'attacker-chosen@evil.example',
        password: 'long-enough-pw',
        invite: token,
      }),
    );
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'dan@example.com' }),
    );
    expect(res.headers.get('location')).toContain(`/accept/${token}`);
  });

  it('invite variant: a dead token creates nothing and lands on the accept screen', async () => {
    invites.describeInvite.mockResolvedValue({ state: 'expired', invited_email: 'x@y.z' });
    const token = 'c'.repeat(64);
    const res = await POST(
      post({ name: 'Dan', email: 'ignored@x.y', password: 'long-enough-pw', invite: token }),
    );
    expect(signUp).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain(`/accept/${token}`);
  });

  it('exists: nothing is written', async () => {
    signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'User already registered', status: 422, code: 'user_already_exists' },
    });
    await POST(post({ name: 'Sarah', email: 'taken@x.y', password: 'long-enough-pw' }));
    expect(accounts.unconfirmEmail).not.toHaveBeenCalled();
    expect(accounts.bootstrapAccount).not.toHaveBeenCalled();
  });
});

describe('A3 · partial-commit compensation (round-10 finding 6)', () => {
  const FRESH_USER = { id: '33333333-3333-4333-8333-333333333333' };
  const FRESH_SIGNUP = {
    data: { user: FRESH_USER, session: { access_token: 'a.b.c', refresh_token: 'r' } },
    error: null,
  };

  it('an un-confirm failure aborts the half-made account and answers a retry shape', async () => {
    signUp.mockResolvedValueOnce(FRESH_SIGNUP);
    accounts.unconfirmEmail.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' }));
    // The compensating delete unwinds signUp: no falsely-confirmed user survives.
    expect(accounts.abortAccountCreation).toHaveBeenCalledWith(FRESH_USER.id);
    expect(accounts.bootstrapAccount).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=retry');
  });

  it('a bootstrap failure likewise aborts — no live session without its account row', async () => {
    signUp.mockResolvedValueOnce(FRESH_SIGNUP);
    accounts.bootstrapAccount.mockRejectedValueOnce(new Error('accounts insert failed'));
    const res = await POST(post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' }));
    expect(accounts.abortAccountCreation).toHaveBeenCalledWith(FRESH_USER.id);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=retry');
  });

  it('when the abort itself also fails, the route fails LOUDLY — the residual state is operational, never silent', async () => {
    signUp.mockResolvedValueOnce(FRESH_SIGNUP);
    accounts.unconfirmEmail.mockRejectedValueOnce(new Error('db down'));
    accounts.abortAccountCreation.mockRejectedValueOnce(new Error('gotrue down too'));
    await expect(
      POST(post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' })),
    ).rejects.toThrow();
  });

  it('a resend refusal is surfaced to the server log — never to the response shape', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      signUp.mockResolvedValueOnce(FRESH_SIGNUP);
      resend.mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } });
      const res = await POST(
        post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' }),
      );
      expect(spy).toHaveBeenCalled();
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toContain('/setup');
      expect(res.headers.get('location')).not.toContain('e=');
    } finally {
      spy.mockRestore();
    }
  });
});
