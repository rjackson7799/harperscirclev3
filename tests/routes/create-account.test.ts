import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// A3 · POST /create-account/submit — non-enumeration byte-identity
// (TSD §5.5 "Never enumerate accounts"; PRD §4.1.7).
//
// The design (recorded in docs/ops/auth-config-parity.md): users are
// created through the admin API with email_confirm:false so verification
// stays real while sign-in stays open. The route's response NEVER mints a
// session and NEVER branches visibly on prior existence — both outcomes
// answer with the same redirect to sign-in, where the ordinary sign-in
// POST (already byte-uniform) completes the flow. The distinction §5.5
// wants delivered by email rides GoTrue's mails, not this response.
//
// Contract:
//   1. Validation (name present, password ≥ 10, plain language) happens
//      BEFORE any admin call, so a validation answer is existence-free
//      by construction.
//   2. created vs already-exists → byte-identical responses; the
//      verification-mail request is issued in BOTH branches so even the
//      outbound call pattern does not branch.
//   3. The accounts row is bootstrapped ONLY for a genuinely new user,
//      with the display name the person typed.
// ============================================================================

const admin = {
  createUnverifiedUser: vi.fn(),
  sendVerificationEmail: vi.fn(async () => {}),
};
vi.mock('@/lib/auth/gotrue-admin', () => admin);

const accounts = { bootstrapAccount: vi.fn(async () => {}) };
vi.mock('@/lib/hc/accounts', () => accounts);

async function snapshot(res: Response) {
  const headers = [...res.headers.entries()]
    .filter(([k]) => k !== 'date')
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

describe('A3 · validation precedes any admin call', () => {
  it('a 9-char password answers in plain language and never reaches GoTrue', async () => {
    const res = await POST(post({ name: 'Sarah', email: 'a@b.c', password: 'short-pw9' }));
    expect(admin.createUnverifiedUser).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    const location = res.headers.get('location')!;
    expect(location).toContain('e=password-length');
  });

  it('a missing name answers the same way', async () => {
    const res = await POST(post({ name: '', email: 'a@b.c', password: 'long-enough-pw' }));
    expect(admin.createUnverifiedUser).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
  });
});

describe('A3 · created vs already-exists: one response', () => {
  it('byte-identical redirects, verification mail requested in both branches', async () => {
    admin.createUnverifiedUser.mockResolvedValueOnce({
      created: true,
      userId: '22222222-2222-4222-8222-222222222222',
    });
    const fresh = await snapshot(
      await POST(post({ name: 'Sarah', email: 'fresh@x.y', password: 'long-enough-pw' })),
    );

    admin.createUnverifiedUser.mockResolvedValueOnce({ created: false });
    const exists = await snapshot(
      await POST(post({ name: 'Sarah', email: 'taken@x.y', password: 'long-enough-pw' })),
    );

    expect(fresh).toEqual(exists);
    expect(admin.sendVerificationEmail).toHaveBeenCalledTimes(2);
    expect(fresh.status).toBe(303);
  });

  it('the accounts row is bootstrapped only for the genuinely new user, with the typed name', async () => {
    admin.createUnverifiedUser.mockResolvedValueOnce({
      created: true,
      userId: '22222222-2222-4222-8222-222222222222',
    });
    await POST(post({ name: 'Sarah Chen', email: 'fresh@x.y', password: 'long-enough-pw' }));
    expect(accounts.bootstrapAccount).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'Sarah Chen',
    );

    accounts.bootstrapAccount.mockClear();
    admin.createUnverifiedUser.mockResolvedValueOnce({ created: false });
    await POST(post({ name: 'Sarah Chen', email: 'taken@x.y', password: 'long-enough-pw' }));
    expect(accounts.bootstrapAccount).not.toHaveBeenCalled();
  });

  it('no session is minted by this route: no Set-Cookie either branch', async () => {
    admin.createUnverifiedUser.mockResolvedValueOnce({ created: true, userId: '3' });
    const res = await POST(post({ name: 'S', email: 'f@x.y', password: 'long-enough-pw' }));
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
