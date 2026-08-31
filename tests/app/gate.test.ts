import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// 7B B1 · lib/auth/gate — the two helpers every page and form route gate
// through (GTE-01; OW-11). readLiveSession is mocked to each of its three
// outcomes; what is under test is that neither helper can drop the third.
//
// Test class: MOCKED CONTRACT.
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };
const supabase = {} as SupabaseClient;
const req = new Request('http://local.test/c-1/inbox/cancel/submit', { method: 'POST' });

let said: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  said = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void said.push(a.join(' ')));
});

describe('gatePage — a Server Component with three outcomes', () => {
  it('signed-in hands the claims on, with `sub` typed present', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-in', claims: CLAIMS });
    const { gatePage } = await import('@/lib/auth/gate');
    const gate = await gatePage(supabase, '/c-1/tasks');
    expect(gate.kind).toBe('signed-in');
    expect(gate.kind === 'signed-in' && gate.claims.sub).toBe(CLAIMS.sub);
  });

  it('signed-out REDIRECTS to sign-in with next — the redirect the pages always took', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const { gatePage } = await import('@/lib/auth/gate');
    await expect(gatePage(supabase, '/c-1/tasks')).rejects.toThrow('NEXT_REDIRECT /sign-in?next=%2Fc-1%2Ftasks');
  });

  it('unavailable is RETURNED as a state, never redirected — and the fault is written down with its site', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'unavailable', why: 'AuthApiError 502: bad gateway' });
    const { gatePage } = await import('@/lib/auth/gate');
    const gate = await gatePage(supabase, '/c-1/tasks');
    expect(gate).toEqual({ kind: 'unavailable', why: 'AuthApiError 502: bad gateway' });
    // The INSTRUMENT half of F-2: r2 could not say which of the two happened,
    // because nothing was written down. A gate must never have to guess again.
    expect(said.join('\n')).toContain('/c-1/tasks');
    expect(said.join('\n')).toContain('bad gateway');
  });
});

describe('gateRoute — a form route with three outcomes', () => {
  it('signed-in hands the claims on', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-in', claims: CLAIMS });
    const { gateRoute } = await import('@/lib/auth/gate');
    const gate = await gateRoute(supabase, req, '/c-1/inbox');
    expect(gate.kind === 'signed-in' && gate.claims.sub).toBe(CLAIMS.sub);
  });

  it('signed-out is a 303 to sign-in with next, RELATIVE (the cookie trap)', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const { gateRoute } = await import('@/lib/auth/gate');
    const gate = await gateRoute(supabase, req, '/c-1/inbox');
    expect(gate.kind).toBe('refused');
    const res = gate.kind === 'refused' ? gate.response : null;
    expect(res?.status).toBe(303);
    expect(res?.headers.get('location')).toBe('/sign-in?next=%2Fc-1%2Finbox');
  });

  it('unavailable is a 503 page — retry-after, private no-store, "try again" to next — never a sign-in', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'unavailable', why: 'AuthRetryableFetchError: fetch failed' });
    const { gateRoute } = await import('@/lib/auth/gate');
    const gate = await gateRoute(supabase, req, '/c-1/inbox');
    expect(gate.kind).toBe('refused');
    const res = gate.kind === 'refused' ? gate.response : null;
    expect(res?.status).toBe(503);
    expect(res?.headers.get('retry-after')).toBe('5');
    expect(res?.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res?.text()) ?? '';
    expect(body).toContain('href="/c-1/inbox"');
    expect(body).not.toContain('/sign-in');
    expect(said.join('\n')).toContain('fetch failed');
  });
});

describe('the 503 page cannot be steered off-origin', () => {
  it('a protocol-relative or absolute next falls back to /', async () => {
    const { sessionUnavailablePage } = await import('@/lib/http/session-unavailable');
    expect(await sessionUnavailablePage('//evil.example/x').text()).toContain('href="/"');
    expect(await sessionUnavailablePage('https://evil.example/x').text()).toContain('href="/"');
    expect(await sessionUnavailablePage('/c-1/tasks?f=mine&x="y"').text()).toContain(
      'href="/c-1/tasks?f=mine&amp;x=&quot;y&quot;"',
    );
  });
});
