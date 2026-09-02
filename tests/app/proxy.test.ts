import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

// ============================================================================
// A2 · proxy.ts — the §1.7 middleware session-refresh pass (Next 16 names
// it proxy). The behavioural half (rotation against live GoTrue) belongs to
// the E2E walkthrough; this pins the contract shape so the file cannot
// silently stop matching or stop exporting.
//
// 7B B1 · GTE-01 (OW-11): THE PROXY IS WHERE A PAGE'S 503 COMES FROM. A
// Server Component cannot set a response status — its honest moves are a
// render, a redirect, notFound and the two auth interrupts — so a page under
// an auth outage renders the unavailable state at 200. The proxy runs BEFORE
// the page, already talks to the auth server for every request it matches
// (getClaims verifies the local HS256 token through getUser), and CAN answer:
// when that read FAULTS — a dead socket, a 5xx, a 429 — it answers the 503
// with `retry-after` and `private, no-store` for the request it observed the
// fault on, in the same words the page would render. An authentication
// ANSWER (no session, a 401) passes through: the page decides, exactly as
// before. The classifier is the gate's own (lib/auth/session-outcome.ts).
// ============================================================================

const getClaims = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  saved.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  saved.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54341';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function run(path: string): Promise<Response> {
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`http://127.0.0.1:3000${path}`));
}

describe('A2 · proxy.ts exports the Next 16 proxy contract', () => {
  it('exports proxy() and a matcher that skips static assets', async () => {
    const mod = await import('@/proxy');
    expect(typeof mod.proxy).toBe('function');
    const matcher: string[] = mod.proxyConfig.matcher;
    expect(Array.isArray(matcher)).toBe(true);
    expect(matcher.join(' ')).toContain('_next/static');
  });
});

describe('GTE-01 · the proxy answers the 503 a page cannot', () => {
  it('a live session passes through (200, no retry-after)', async () => {
    getClaims.mockResolvedValueOnce({ data: { claims: { sub: 'u1' } }, error: null });
    const res = await run('/c-1/tasks');
    expect(res.status).toBe(200);
    expect(res.headers.get('retry-after')).toBeNull();
  });

  it('every pass-through is `private, no-store` — §4.6.3\'s cached-responses channel (7C C4, PPL-03): a revoked member\'s cached page must not outlive the revocation', async () => {
    getClaims.mockResolvedValueOnce({ data: { claims: { sub: 'u1' } }, error: null });
    const res = await run('/c-1/documents');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // the signed-out pass-through carries it too — auth pages are user-scoped
    getClaims.mockResolvedValueOnce({ data: null, error: null });
    const anon = await run('/sign-in');
    expect(anon.headers.get('cache-control')).toBe('private, no-store');
  });

  it('NO session passes through — the page owns the sign-in redirect, exactly as before', async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: null });
    expect((await run('/c-1/tasks')).status).toBe(200);
    getClaims.mockResolvedValueOnce({ data: null, error: new AuthSessionMissingError() });
    expect((await run('/c-1/tasks')).status).toBe(200);
  });

  it('an authentication ANSWER (401) passes through — it is the page that decides', async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: new AuthApiError('bad jwt', 401, 'bad_jwt') });
    expect((await run('/c-1/tasks')).status).toBe(200);
  });

  it('a FAULT reading the session ⇒ 503, retry-after 5, private no-store, a readable page with "try again" to the same url', async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError('fetch failed', 0) });
    const res = await run('/c-1/tasks?filter=mine');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain("We couldn't check your sign-in just now.");
    expect(body).toContain('href="/c-1/tasks?filter=mine"');
    expect(body).not.toContain('/sign-in');
  });

  it('a 502 from the gateway, a 429, and a THROW are faults too', async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: new AuthApiError('bad gateway', 502, undefined) });
    expect((await run('/c-1/inbox')).status).toBe(503);
    getClaims.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('over_request_rate_limit', 429, 'over_request_rate_limit'),
    });
    expect((await run('/c-1/inbox')).status).toBe(503);
    getClaims.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await run('/c-1/inbox')).status).toBe(503);
  });

  it('with no auth config at all the proxy stays out of the way (the pre-existing contract)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await run('/c-1/tasks');
    expect(res.status).toBe(200);
    expect(getClaims).not.toHaveBeenCalled();
    // 7D R5/F-2 (Q-D RATIFIED): staying out of the way is about the SESSION
    // read, never about the stamp. PPL-03's claim is 'every pass-through',
    // and this early return is a pass-through — the one this test already
    // stood over while asserting only the status and the absent call.
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
