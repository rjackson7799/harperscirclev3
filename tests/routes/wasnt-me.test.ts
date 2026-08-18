import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// A3 · The "this wasn't me" surface (TSD §5.11; WMN-01; ADR-0013 F3).
//
//   - GET renders the confirmation page and does NOTHING else: corporate
//     mail scanners pre-fetch links, so no call that could consume or
//     destroy happens on a render.
//   - Destruction happens ONLY on the explicit POST: execute_wasnt_me
//     consumes and durably enqueues the owed kill; the route then
//     performs the GoTrue admin kill IMMEDIATELY and marks the action
//     complete (the F3 outbox posture — a crash between those two leaves
//     a pending row the worker sweep retries; never a consumed token
//     with live sessions).
//   - Refusals are neutral: an invalid, expired or replayed token gets
//     "no longer valid" — nothing about accounts.
// ============================================================================

// killAllSessionsAndForceReset lives with the security-action wrappers:
// it needs the maintenance boundary (DB session revocation — the probed
// local GoTrue exposes no per-user admin logout endpoint) plus the
// service-fenced password rotation, and lib/hc is the one place the
// fences let both meet.
const security = {
  executeWasntMe: vi.fn(),
  completeSecurityAction: vi.fn(async () => {}),
  killAllSessionsAndForceReset: vi.fn(async () => {}),
  pendingSecurityActions: vi.fn(async () => []),
};
vi.mock('@/lib/hc/security-actions', () => security);
const admin = { killAllSessionsAndForceReset: security.killAllSessionsAndForceReset };

function post(body: Record<string, string>): Request {
  return new Request('http://local.test/wasnt-me/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

let POST: (req: Request) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ POST } = await import('@/app/(auth)/wasnt-me/submit/route'));
});

describe('A3 · GET renders without touching the token', () => {
  it('the page component invokes no security call', async () => {
    const { default: Page } = await import('@/app/(auth)/wasnt-me/page');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const element = await Page({
      searchParams: Promise.resolve({ token: 'a'.repeat(64) }),
    });
    const html = renderToStaticMarkup(element);
    expect(security.executeWasntMe).not.toHaveBeenCalled();
    expect(admin.killAllSessionsAndForceReset).not.toHaveBeenCalled();
    // The page must post the explicit confirmation, not link it.
    expect(html).toContain('method="post"');
    expect(html.toLowerCase()).toContain('end every signed-in session');
  });
});

describe('A3 · POST is the only destruction path, and it is immediate', () => {
  it('executes, kills sessions right after commit, then marks completion', async () => {
    security.executeWasntMe.mockResolvedValue({
      account_id: '44444444-4444-4444-8444-444444444444',
      action_id: '55555555-5555-4555-8555-555555555555',
    });
    const res = await POST(post({ token: 'a'.repeat(64) }));
    expect(security.executeWasntMe).toHaveBeenCalledWith('a'.repeat(64));
    expect(admin.killAllSessionsAndForceReset).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
    );
    expect(security.completeSecurityAction).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
    );
    // Ordering: kill strictly before completion is marked.
    const killOrder = admin.killAllSessionsAndForceReset.mock.invocationCallOrder[0];
    const completeOrder = security.completeSecurityAction.mock.invocationCallOrder[0];
    expect(killOrder).toBeLessThan(completeOrder);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('done=1');
  });

  it('a GoTrue outage leaves the action pending (the worker sweep owns the retry) and still answers', async () => {
    security.executeWasntMe.mockResolvedValue({ account_id: 'a', action_id: 'b' });
    admin.killAllSessionsAndForceReset.mockRejectedValueOnce(new Error('gotrue down'));
    const res = await POST(post({ token: 'b'.repeat(64) }));
    expect(security.completeSecurityAction).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('done=1');
  });

  it('an invalid, expired or replayed token answers neutrally — nothing about accounts', async () => {
    security.executeWasntMe.mockRejectedValue(new Error('wasnt_me_refused'));
    const res = await POST(post({ token: 'c'.repeat(64) }));
    expect(admin.killAllSessionsAndForceReset).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=link-invalid');
  });
});
