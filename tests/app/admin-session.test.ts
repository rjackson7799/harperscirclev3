import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthApiError } from '@supabase/supabase-js';
import { readAdminSession } from '@/lib/auth/admin-session';

const sub = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const exp = 2000000000;
const claims = () => ({ sub, session_id: sid, aal: 'aal2', exp });
const auth = {
  getSession: vi.fn(), getClaims: vi.fn(), getUser: vi.fn(),
};
const client = { auth } as unknown as SupabaseClient;

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } }, error: null });
  auth.getClaims.mockResolvedValue({ data: { claims: claims() }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: sub, factors: [{ status: 'verified' }] } }, error: null });
});

it('binds both verifications to the same token and returns only allowlisted identity fields', async () => {
  auth.getClaims.mockResolvedValue({ data: { claims: { ...claims(), email: 'private', metadata: 'private' } } });
  expect(await readAdminSession(client)).toEqual({ kind: 'verified-session', identity: claims() });
  expect(auth.getClaims).toHaveBeenCalledWith('synthetic-token');
  expect(auth.getUser).toHaveBeenCalledWith('synthetic-token');
});

it('denies a missing session before verification', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await readAdminSession(client)).toEqual({ kind: 'denied' });
  expect(auth.getClaims).not.toHaveBeenCalled();
});

it.each([
  { sub: 'not-an-id' }, { session_id: '' }, { session_id: 7 },
  { aal: 'aal1' }, { exp: 1 }, { exp: '2000000000' },
])('denies invalid verified claims %j', async (change) => {
  auth.getClaims.mockResolvedValue({ data: { claims: { ...claims(), ...change } }, error: null });
  expect(await readAdminSession(client)).toEqual({ kind: 'denied' });
});

it('denies a live user that differs from the verified token subject', async () => {
  auth.getUser.mockResolvedValue({ data: { user: { id: sid, factors: [{ status: 'verified' }] } } });
  expect(await readAdminSession(client)).toEqual({ kind: 'denied' });
});

it.each([{ factors: undefined }, { factors: [] }, { factors: [{ status: 'unverified' }] }])('denies absent verified factors %j', async ({ factors }) => {
  auth.getUser.mockResolvedValue({ data: { user: { id: sub, factors } } });
  expect(await readAdminSession(client)).toEqual({ kind: 'denied' });
});

it.each(['getSession', 'getClaims', 'getUser'] as const)('normalizes a thrown %s failure', async (method) => {
  auth[method].mockRejectedValue(new Error('private provider details'));
  expect(await readAdminSession(client)).toEqual({ kind: 'unavailable' });
});

it('denies an explicit invalid-token answer even when claims accompany it', async () => {
  auth.getClaims.mockResolvedValue({ data: { claims: claims() }, error: new AuthApiError('private', 401, 'bad_jwt') });
  expect(await readAdminSession(client)).toEqual({ kind: 'denied' });
});

it('retains retry semantics for rate limiting', async () => {
  auth.getUser.mockResolvedValue({ error: new AuthApiError('private', 429, 'over_request_rate_limit') });
  expect(await readAdminSession(client)).toEqual({ kind: 'unavailable' });
});
