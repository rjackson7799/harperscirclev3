import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ceilingCopy } from '@/lib/permissions/tiers';

// ============================================================================
// A5 · The invite screen (PRD §4.1.5; TSD §5.10 — AC-AUTH-8's first
// screen). The inviter chooses address, tier, subject(s), optional note;
// under the tier selector, its ceiling in plain words FROM THE MODULE.
// Issuance is coordinator-only and verification-gated in-function
// (AC-AUTH-4); the screen surfaces refusals, never pre-judges them.
// Slice-2 delivery is the copy-link path (plan design note 3): the token
// renders exactly once, from a short-lived cookie, never from a URL.
// ============================================================================

const invites = {
  createInvite: vi.fn(),
  describeInvite: vi.fn(),
  acceptInvite: vi.fn(),
};
vi.mock('@/lib/hc/invites', () => invites);

const getClaims = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims, getUser }, from }),
}));

const cookieGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet, getAll: () => [], set: () => {} }),
  headers: async () => new Headers({ host: '127.0.0.1:3000' }),
}));

const CIRCLE = 'c-1';
const CLAIMS = { sub: 'u-1', role: 'authenticated', email: 'sarah@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: CLAIMS }, error: null });
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: async () => ({
          data: [
            { id: 's-1', first_name: 'Nell' },
            { id: 's-2', first_name: 'Marcus' },
          ],
        }),
      }),
    }),
  });
});

describe('A5 · the invite screen states both ceilings from the module', () => {
  it('renders address, tiers with module ceilings (person: they), subject choices, note', async () => {
    const { default: Page } = await import('@/app/(app)/[circle]/invite/page');
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ circle: CIRCLE }),
        searchParams: Promise.resolve({}),
      }),
    );
    const family = ceilingCopy('family', { person: 'they', subjectNames: ['Nell', 'Marcus'] });
    const care = ceilingCopy('care_circle', { person: 'they', subjectNames: ['Nell', 'Marcus'] });
    expect(html).toContain(family.replace(/'/g, '&#x27;'));
    expect(html).toContain(care.replace(/'/g, '&#x27;').replace(/—/g, '—'));
    expect(html).toContain('name="invited_email"');
    expect(html).toContain('name="subject_ids"');
    expect(html).toContain('name="note"');
    expect(html).toContain('Nell');
    expect(html).toContain('Marcus');
  });
});

describe('A5 · issuance', () => {
  function post(body: Record<string, string | string[]>): Request {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else params.append(k, v);
    }
    return new Request(`http://local.test/${CIRCLE}/invite/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  }

  it('creates through hc.create_invite and hands the token to the created view via a short-lived cookie, never the URL', async () => {
    invites.createInvite.mockResolvedValue({
      invite_id: 'i-1',
      token: 'd'.repeat(64),
      expires_at: new Date().toISOString(),
    });
    const { POST } = await import('@/app/(app)/[circle]/invite/submit/route');
    const res = await POST(post({ invited_email: 'dan@example.com', tier: 'family', subject_ids: ['s-1'] }), {
      params: Promise.resolve({ circle: CIRCLE }),
    });
    expect(invites.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u-1' }),
      expect.objectContaining({
        circle_id: CIRCLE,
        invited_email: 'dan@example.com',
        tier: 'family',
        subject_ids: ['s-1'],
      }),
    );
    expect(res.status).toBe(303);
    const location = res.headers.get('location')!;
    expect(location).toContain('/invite/created');
    expect(location).not.toContain('d'.repeat(64));
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('d'.repeat(64));
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('max-age');
  });

  it('a refusal (unverified, non-coordinator, freeze) returns to the form with one shape', async () => {
    invites.createInvite.mockRejectedValue(new Error('invite_refused'));
    const { POST } = await import('@/app/(app)/[circle]/invite/submit/route');
    const res = await POST(post({ invited_email: 'x@y.z', tier: 'family', subject_ids: ['s-1'] }), {
      params: Promise.resolve({ circle: CIRCLE }),
    });
    expect(res.headers.get('location')).toContain('e=refused');
  });

  it('the created view renders the accept link from the cookie exactly, marked one-time', async () => {
    cookieGet.mockReturnValue({ value: 'd'.repeat(64) });
    const { default: Created } = await import('@/app/(app)/[circle]/invite/created/page');
    const html = renderToStaticMarkup(
      await Created({ params: Promise.resolve({ circle: CIRCLE }) }),
    );
    expect(html).toContain(`/accept/${'d'.repeat(64)}`);
    expect(html.toLowerCase()).toContain('once');
  });
});
