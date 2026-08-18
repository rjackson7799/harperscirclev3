import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ceilingCopy } from '@/lib/permissions/tiers';

// ============================================================================
// A5 · The invitee door (PRD §4.1.4–§4.1.5; TSD §5.10; AC-AUTH-11).
//
//   - The accept screen shows which circle, who invited them, which
//     subject(s), and the plain-language ceiling BEFORE asking for
//     anything — the ceiling text renders ABOVE any form or button, from
//     THE one module (AC-AUTH-8's other screen).
//   - AC-AUTH-11: signed in as a different identity ⇒ NO accept control;
//     forced re-authentication as the invited address.
//   - Expired and used tokens get the same §4.1.7 treatment: who invited
//     them, ask for a new one, no account created.
//   - The submit accepts as the session identity and lands by tier:
//     family → the Timeline; care circle → their tasks (§4.1.4 rule 4).
// ============================================================================

const invites = {
  describeInvite: vi.fn(),
  acceptInvite: vi.fn(),
  createInvite: vi.fn(),
};
vi.mock('@/lib/hc/invites', () => invites);

const getClaims = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims } }),
}));

const TOKEN = 'a'.repeat(64);
const PENDING = {
  state: 'pending' as const,
  invite_id: 'i-1',
  circle_id: 'c-1',
  circle_name: "Nell's circle",
  inviter_name: 'Sarah Chen',
  invited_email: 'dan@example.com',
  tier: 'family' as const,
  subject_names: ['Nell'],
};

async function renderAccept(): Promise<string> {
  const { default: Page } = await import('@/app/(auth)/accept/[token]/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ token: TOKEN }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: null, error: null });
  invites.describeInvite.mockResolvedValue(PENDING);
});

describe('A5 · the ceiling comes before anything is asked', () => {
  it('circle, inviter, subjects and the module ceiling render ABOVE any form or link-button', async () => {
    const html = await renderAccept();
    expect(html).toContain("Nell's circle");
    expect(html).toContain('Sarah Chen');
    expect(html).toContain('Nell');
    const ceiling = ceilingCopy('family', { person: 'you', subjectNames: ['Nell'] });
    const escaped = ceiling.replace(/'/g, '&#x27;');
    expect(html).toContain(escaped);
    const ceilingAt = html.indexOf(escaped);
    const firstAsk = html.search(/<form|<a [^>]*class="button/);
    expect(ceilingAt).toBeGreaterThan(-1);
    expect(firstAsk).toBeGreaterThan(ceilingAt);
  });
});

describe('A5 · session states', () => {
  it('no session: create-account (token variant) and sign-in paths, nothing editable about the address', async () => {
    const html = await renderAccept();
    expect(html).toContain(`/create-account?invite=${TOKEN}`);
    expect(html).toContain('/sign-in?next=%2Faccept%2F' + TOKEN);
    expect(html).toContain('dan@example.com');
    expect(html).not.toContain('name="email"');
  });

  it('signed in as the invited address: the accept control renders', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u-1', email: 'dan@example.com', role: 'authenticated' } },
      error: null,
    });
    const html = await renderAccept();
    expect(html).toContain(`/accept/${TOKEN}/submit`);
    expect(html.toLowerCase()).toContain('accept');
  });

  it('AC-AUTH-11 — a different identity gets NO accept control and a forced re-auth as the invited address', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u-2', email: 'other@example.com', role: 'authenticated' } },
      error: null,
    });
    const html = await renderAccept();
    expect(html).not.toContain(`/accept/${TOKEN}/submit`);
    expect(html).toContain('dan@example.com');
    expect(html).toContain('/sign-in?next=%2Faccept%2F' + TOKEN);
  });

  it('case difference in the address is NOT a different identity (citext binding)', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u-1', email: 'Dan@Example.COM', role: 'authenticated' } },
      error: null,
    });
    const html = await renderAccept();
    expect(html).toContain(`/accept/${TOKEN}/submit`);
  });
});

describe('A5 · dead tokens (§4.1.7)', () => {
  it.each(['expired', 'used', 'revoked'] as const)('%s: who invited, ask for a new one, no form', async (state) => {
    invites.describeInvite.mockResolvedValue({ ...PENDING, state });
    const html = await renderAccept();
    expect(html).toContain('Sarah Chen');
    expect(html.toLowerCase()).toContain('ask');
    expect(html).not.toContain(`/accept/${TOKEN}/submit`);
    expect(html).not.toContain('/create-account?invite=');
  });

  it('an unknown token is one neutral shape', async () => {
    invites.describeInvite.mockResolvedValue(null);
    const html = await renderAccept();
    expect(html.toLowerCase()).toContain('no longer valid');
  });
});

describe('A5 · the accept submit lands by tier', () => {
  function post(): Request {
    return new Request(`http://local.test/accept/${TOKEN}/submit`, { method: 'POST' });
  }

  it('family lands on the Timeline', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u-1', email: 'dan@example.com', role: 'authenticated' } },
      error: null,
    });
    invites.acceptInvite.mockResolvedValue({ circle_id: 'c-1', tier: 'family' });
    const { POST } = await import('@/app/(auth)/accept/[token]/submit/route');
    const res = await POST(post(), { params: Promise.resolve({ token: TOKEN }) });
    expect(invites.acceptInvite).toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/c-1/timeline');
  });

  it('care circle lands on their tasks', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u-3', email: 'aide@example.com', role: 'authenticated' } },
      error: null,
    });
    invites.acceptInvite.mockResolvedValue({ circle_id: 'c-1', tier: 'care_circle' });
    const { POST } = await import('@/app/(auth)/accept/[token]/submit/route');
    const res = await POST(post(), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.headers.get('location')).toContain('/c-1/tasks');
  });

  it('a refused acceptance (replay, freeze, mismatch) answers the §4.1.7 screen, creating nothing', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u-1', email: 'dan@example.com', role: 'authenticated' } },
      error: null,
    });
    invites.acceptInvite.mockRejectedValue(new Error('invite_refused'));
    const { POST } = await import('@/app/(auth)/accept/[token]/submit/route');
    const res = await POST(post(), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain(`/accept/${TOKEN}`);
  });
});
