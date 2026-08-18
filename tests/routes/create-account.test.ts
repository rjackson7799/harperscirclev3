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
const resend = vi.fn(async () => ({ data: {}, error: null }));
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { signUp, resend } }),
}));

const accounts = {
  bootstrapAccount: vi.fn(async () => {}),
  unconfirmEmail: vi.fn(async () => {}),
};
vi.mock('@/lib/hc/accounts', () => accounts);

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

  it('fresh: un-confirm strictly before the accounts bootstrap, with the typed name', async () => {
    signUp.mockResolvedValueOnce({
      data: { user: FRESH_USER, session: { access_token: 'a.b.c', refresh_token: 'r' } },
      error: null,
    });
    await POST(post({ name: 'Sarah Chen', email: 'fresh@x.y', password: 'long-enough-pw' }));

    expect(accounts.unconfirmEmail).toHaveBeenCalledWith(FRESH_USER.id);
    expect(accounts.bootstrapAccount).toHaveBeenCalledWith(FRESH_USER.id, 'Sarah Chen');
    const unconfirmOrder = accounts.unconfirmEmail.mock.invocationCallOrder[0];
    const bootstrapOrder = accounts.bootstrapAccount.mock.invocationCallOrder[0];
    expect(unconfirmOrder).toBeLessThan(bootstrapOrder);
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
