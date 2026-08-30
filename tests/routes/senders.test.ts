import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 5B B8 · The known-senders member surface (slice-5 plan B8; ADR-0019 D15;
// SND-03's app half).
//
// hc.revoke_sender shipped at 4A with no way for a member to reach it — the
// list it operates on had no read at all. 5A M1's hc.list_known_senders is
// that read; this is the pair, composed from slice-3 components, on its own
// page linked from the Care Inbox.
//
// NOT in the left nav, deliberately: NAV_MANIFEST lists only live primary
// routes and tests/design/shell.test.tsx pins the exact set, so adding a sixth
// item would change the shell and the a11y surface for a management screen
// that belongs beside the thing it manages. The inbox is where a sender is
// accepted; it is where the list of accepted senders belongs.
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const inbox = {
  listKnownSenders: vi.fn(),
  revokeSender: vi.fn(),
};
vi.mock('@/lib/hc/inbox', () => inbox);

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const SENDER = {
  id: 'sender-1',
  address: 'records@cardiology.example',
  domain: null,
  accepted_by: CLAIMS.sub,
  accepted_by_name: 'Ada Founder',
  accepted_at: '2026-07-12T09:30:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  inbox.listKnownSenders.mockResolvedValue([SENDER]);
  inbox.revokeSender.mockResolvedValue({ revoked: true });
});

async function renderSenders(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/senders/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe('6B B6 · the ?e=revoke marker is READ and rendered (R5/F-7)', () => {
  it('a refused revocation says so instead of silently re-listing', async () => {
    const html = await renderSenders({ e: 'revoke' });
    expect(html).toContain('couldn&#x27;t be removed');
  });
});

describe('5B B8 · the list says who accepted each sender, and when', () => {
  it('renders the address, the accepting member and the date', async () => {
    const html = await renderSenders();
    expect(html).toContain('records@cardiology.example');
    expect(html).toContain('Ada Founder');
    expect(html).toContain('July 12');
  });

  it('a domain-wide trust reads as a domain, not as an address', async () => {
    inbox.listKnownSenders.mockResolvedValueOnce([
      { ...SENDER, id: 'sender-2', address: null, domain: 'cardiology.example' },
    ]);
    const html = await renderSenders();
    expect(html).toContain('cardiology.example');
    expect(html).toMatch(/everyone at/i);
  });

  it('each row carries its own revoke, bound to that sender', async () => {
    const html = await renderSenders();
    expect(html).toContain('/senders/revoke/submit');
    expect(html).toContain('value="sender-1"');
  });

  it('the empty state says what the list IS, and never that the world is empty', async () => {
    inbox.listKnownSenders.mockResolvedValueOnce([]);
    const html = await renderSenders();
    expect(html).toContain('empty-state');
    // §8.6's rule and the Q6 fail-closed posture: the sentence is about what
    // THIS caller has done, never a claim about what exists. A refusal and an
    // genuinely empty list must read the same from outside.
    expect(html).toMatch(/you have not accepted any senders/i);
    expect(html).not.toMatch(/there are no senders|this circle has no senders/i);
  });

  it('a refusal renders as an honest empty view, never a stack trace', async () => {
    inbox.listKnownSenders.mockRejectedValueOnce(new Error('sender_refused'));
    const html = await renderSenders();
    expect(html).toContain('Known senders');
    expect(html).not.toContain('sender_refused');
  });
});

describe('5B B8 · the revoke submit route', () => {
  async function post(body: Record<string, string>): Promise<Response> {
    const { POST } = await import('@/app/(app)/[circle]/senders/revoke/submit/route');
    return POST(
      new Request('http://local.test/c/senders/revoke/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
  }

  it('revokes and redirects back — RELATIVE, never absolute (the cookie trap)', async () => {
    const res = await post({ sender_id: 'sender-1' });
    expect(inbox.revokeSender).toHaveBeenCalledWith(CLAIMS, 'sender-1');
    expect(res.status).toBe(303);
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith('/')).toBe(true);
    expect(location).toContain('/senders');
  });

  it('no session ⇒ sign-in, and nothing is revoked', async () => {
    session.readLiveSession.mockResolvedValueOnce({ kind: 'signed-out' });
    const res = await post({ sender_id: 'sender-1' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(inbox.revokeSender).not.toHaveBeenCalled();
  });

  it('a missing id never reaches the definer', async () => {
    const res = await post({});
    expect(res.status).toBe(303);
    expect(inbox.revokeSender).not.toHaveBeenCalled();
  });

  it('a refusal redirects with an error marker, never a 500', async () => {
    inbox.revokeSender.mockRejectedValueOnce(new Error('sender_refused'));
    const res = await post({ sender_id: 'sender-1' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=');
  });
});
