import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

// ============================================================================
// 7B B1 · GET /confirm never claims success for a pass that did not run —
// OW-18 (ADR-0028 D15 item 4), GTE-01's second sentence.
//
// The route lands every emailed auth link, establishes the session, and then
// runs the ONE lifecycle effect that rides here: the founder's verification
// activates the forwarding addresses (4B B6 / FWD-01). At `:45` it read the
// session through the two-outcome gate, so an auth-server fault after a
// successful verification became `null`, the activation pass was SKIPPED,
// and the person landed on `/account?verified=1` — "Everything is on" — with
// nothing on. A one-shot effect, lost silently.
//
// The same class one step earlier: `ok = !error` on verifyOtp treated a dead
// socket as an expired link. The token is NOT consumed by a fault, so the
// honest answer is a retry of the same link; "link expired" sends the person
// to resend one that still works.
//
// The three outcomes, read:
//   · verification FAULT (retryable / 5xx / 429 / a throw) ⇒ 503, retry-after,
//     private no-store, "try again" to THIS url — the token stands;
//   · verification REFUSED (an authentication answer) ⇒ link-expired, as before;
//   · verified: the claims come from the session GoTrue just handed back
//     (decodeTrustedAccessToken — the same server-to-server trust the step-up
//     route uses), so no second round-trip can go unavailable; when GoTrue
//     returns no session the live read runs and `unavailable` ⇒ a retry,
//     never `?verified=1`;
//   · the activation pass THROWS ⇒ `/account?verified=1&forwarding=failed` —
//     verified is true, "everything is on" is not, and the account page says so.
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { verifyOtp, exchangeCodeForSession, getUser: vi.fn(), getClaims: vi.fn() } }),
}));

const session = { readLiveSession: vi.fn(), liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

const ingest = { activateForwardingAfterVerification: vi.fn() };
vi.mock('@/lib/hc/ingest', () => ingest);

const SUB = '33333333-0000-4000-8000-000000000003';
function fakeSession() {
  const payload = Buffer.from(
    JSON.stringify({ sub: SUB, email: 'sarah@example.com', role: 'authenticated', aal: 'aal1' }),
  ).toString('base64url');
  return { access_token: `h.${payload}.s`, refresh_token: 'r' };
}

async function get(query: string): Promise<Response> {
  const { GET } = await import('@/app/(auth)/confirm/route');
  return GET(new Request(`http://local.test/confirm?${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ingest.activateForwardingAfterVerification.mockResolvedValue({ activated: 1 });
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: { sub: SUB } });
  session.liveSessionClaims.mockResolvedValue({ sub: SUB });
});

describe('OW-18 · the verification step reads its own three outcomes', () => {
  it('verified with a session ⇒ the activation pass runs on the claims GoTrue just handed back, then verified=1', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: SUB }, session: fakeSession() }, error: null });
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account?verified=1');
    expect(ingest.activateForwardingAfterVerification).toHaveBeenCalledTimes(1);
    expect(ingest.activateForwardingAfterVerification.mock.calls[0][0]).toMatchObject({ sub: SUB });
    // No second round-trip: the live read was never needed.
    expect(session.readLiveSession).not.toHaveBeenCalled();
  });

  it('the PKCE code path is the same contract', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ data: { session: fakeSession() }, error: null });
    const res = await get('code=xyz');
    expect(res.headers.get('location')).toBe('/account?verified=1');
    expect(ingest.activateForwardingAfterVerification).toHaveBeenCalledTimes(1);
  });

  it('REFUSED (an authentication answer) ⇒ link-expired, as before', async () => {
    verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
    });
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/sign-in?e=link-expired');
    expect(ingest.activateForwardingAfterVerification).not.toHaveBeenCalled();
  });

  it('a FAULT during verification ⇒ 503 retry to THIS link — the token stands, and "expired" would have been a lie', async () => {
    verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('fetch failed', 0),
    });
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.text();
    expect(body).toContain('href="/confirm?token_hash=abc&amp;type=signup"');
    expect(body).not.toContain('sign-in');
    expect(ingest.activateForwardingAfterVerification).not.toHaveBeenCalled();
  });

  it('a THROW out of verifyOtp is a fault too — 503, never link-expired', async () => {
    verifyOtp.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(503);
  });

  it('the recovery flow lands on the new-password form and runs no activation', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: SUB }, session: fakeSession() }, error: null });
    const res = await get('token_hash=abc&type=recovery&flow=recovery');
    expect(res.headers.get('location')).toBe('/reset/confirm');
    expect(ingest.activateForwardingAfterVerification).not.toHaveBeenCalled();
  });
});

describe('OW-18 · verified, but the pass did not run — never verified=1 alone', () => {
  it('GoTrue returned no session and the live read is UNAVAILABLE ⇒ 503 retry to /account, activation not run, success not claimed', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: SUB }, session: null }, error: null });
    session.readLiveSession.mockResolvedValueOnce({ kind: 'unavailable', why: 'AuthApiError 502: bad gateway' });
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(await res.text()).toContain('href="/account"');
    expect(ingest.activateForwardingAfterVerification).not.toHaveBeenCalled();
  });

  it('GoTrue returned no session and the live read says SIGNED OUT ⇒ sign in first, no success claimed', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: SUB }, session: null }, error: null });
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/sign-in?next=%2Faccount');
    expect(ingest.activateForwardingAfterVerification).not.toHaveBeenCalled();
  });

  it('GoTrue returned no session and the live read is signed in ⇒ the pass runs on THOSE claims', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: SUB }, session: null }, error: null });
    const res = await get('token_hash=abc&type=signup');
    expect(res.headers.get('location')).toBe('/account?verified=1');
    expect(ingest.activateForwardingAfterVerification).toHaveBeenCalledTimes(1);
  });

  it('the activation pass THROWS ⇒ verified=1&forwarding=failed — the page says what is on and what is not', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: SUB }, session: fakeSession() }, error: null });
    ingest.activateForwardingAfterVerification.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));
    const res = await get('token_hash=abc&type=signup');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account?verified=1&forwarding=failed');
  });
});
