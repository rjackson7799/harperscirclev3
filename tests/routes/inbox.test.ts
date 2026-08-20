import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// B6 · The Care Inbox surface (slice-4 plan B6; UXA-01 flips with the Q6
// disposition; PRD §4.2.2/§4.2.8; §8.6 empty states):
//
//   - the arrivals list renders the PRODUCT states (M4's vocabulary) —
//     the state machine IS the product surface;
//   - the §5.3 verdict is SHOWN, never just stored: verified /
//     unverified · we couldn't confirm this came from them / the
//     lookalike's own copy;
//   - held mail carries the accept-sender release and the 30-day expiry
//     warning; duplicates carry the two resolutions (never
//     auto-discarded); the member window carries cancel;
//   - the 4-hour "reading is delayed" notice (§4.11/§13.1);
//   - the first-run empty state shows the forwarding address — the ONE
//     §8.6 exception, owned by this surface.
//
// Test class: MOCKED ROUTE CONTRACT (render shapes + submit routes);
// the live authority is tests/hc/inbox.test.ts and the B9 gate leg.
// ============================================================================

const session = { liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ from, auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const inbox = {
  acceptSender: vi.fn(),
  cancelArrival: vi.fn(),
  resolveDuplicate: vi.fn(),
  productStates: vi.fn(),
};
vi.mock('@/lib/hc/inbox', () => inbox);

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

type Row = Record<string, unknown>;
let parents: Row[] = [];
let children: Row[] = [];
let subjects: Row[] = [];

function chain(result: Row[]) {
  const p = Promise.resolve({ data: result, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
    proxy[m] = vi.fn(() => proxy);
  }
  proxy.then = p.then.bind(p);
  proxy.catch = p.catch.bind(p);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  inbox.productStates.mockResolvedValue(new Map());
  parents = [];
  children = [];
  subjects = [];
  from.mockImplementation((table: string) => {
    if (table === 'subjects') return chain(subjects);
    if (table === 'arrivals') {
      // first arrivals call = parents, second = children
      const call = from.mock.calls.filter((c) => c[0] === 'arrivals').length;
      return chain(call <= 1 ? parents : children);
    }
    return chain([]);
  });
});

async function renderInbox(): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/inbox/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }) }),
  );
}

describe('B6 · the list renders product states and the §5.3 verdict', () => {
  it('labels come from hc.product_state; verdicts render verified / unverified / lookalike copy', async () => {
    parents = [
      {
        id: 'a-ok',
        state: 'extracting',
        channel: 'email',
        sender_address: 'front-desk@cardiology.org',
        sender_display_name: 'Front Desk',
        auth_result: 'authenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
      {
        id: 'a-held',
        state: 'held_unknown_sender',
        channel: 'email',
        sender_address: 'nurse@stranger.example',
        sender_display_name: 'A Nurse',
        auth_result: 'unauthenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - 2 * HOURS).toISOString(),
      },
      {
        id: 'a-lk',
        state: 'held_unknown_sender',
        channel: 'email',
        sender_address: 'desk@cardio1ogy.org',
        sender_display_name: null,
        auth_result: 'lookalike',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - 2 * HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(
      new Map([
        ['a-ok', 'Reading'],
        ['a-held', 'Held · unknown sender'],
        ['a-lk', 'Held · unknown sender'],
      ]),
    );
    const html = await renderInbox();
    expect(html).toContain('Care Inbox');
    expect(html).toContain('Reading');
    expect(html).toContain('Held · unknown sender');
    expect(html).toContain('verified');
    expect(html).toContain('we couldn&#x27;t confirm this came from them');
    expect(html).toContain('closely resembles a sender this circle trusts');
    // display name is display only — shown next to the address, never a verdict
    expect(html).toContain('front-desk@cardiology.org');
  });

  it('held mail carries the accept-sender release and the 30-day expiry warning', async () => {
    parents = [
      {
        id: 'a-held',
        state: 'held_unknown_sender',
        channel: 'email',
        sender_address: 'nurse@stranger.example',
        sender_display_name: null,
        auth_result: 'unauthenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - 25 * DAYS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-held', 'Held · unknown sender']]));
    const html = await renderInbox();
    expect(html).toContain('action="/' + CIRCLE + '/inbox/accept-sender/submit"');
    expect(html).toContain('value="nurse@stranger.example"');
    expect(html).toMatch(/expires/i);
  });

  it('a duplicate suspect renders BOTH resolutions and no third option', async () => {
    parents = [
      {
        id: 'a-dup',
        state: 'duplicate_suspected',
        channel: 'email',
        sender_address: 'front-desk@cardiology.org',
        sender_display_name: null,
        auth_result: 'authenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-dup', 'Looks like a duplicate']]));
    const html = await renderInbox();
    expect(html).toContain('value="different"');
    expect(html).toContain('value="same_thing"');
    expect(html).not.toMatch(/discard/i);
  });

  it('the member window renders cancel; a clean original links through the artifact route', async () => {
    parents = [
      {
        id: 'a-ok',
        state: 'extracting',
        channel: 'upload',
        sender_address: null,
        sender_display_name: null,
        auth_result: null,
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-ok', 'Reading']]));
    const html = await renderInbox();
    expect(html).toContain('action="/' + CIRCLE + '/inbox/cancel/submit"');
    expect(html).toContain('href="/api/artifact/a-ok"');
  });

  it('items over the 4-hour queue-age bound surface the reading-is-delayed notice (§13.1)', async () => {
    parents = [
      {
        id: 'a-old',
        state: 'stored',
        channel: 'upload',
        sender_address: null,
        sender_display_name: null,
        auth_result: null,
        scan_verdict: null,
        received_at: new Date(Date.now() - 5 * HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-old', 'Checking']]));
    const html = await renderInbox();
    expect(html).toMatch(/reading is delayed/i);
  });

  it('the first-run empty state shows the forwarding address — the one §8.6 exception', async () => {
    subjects = [
      {
        id: 's-1',
        first_name: 'Nell',
        forwarding_local_part: 'nell.a7f3k2',
        forwarding_active_at: new Date().toISOString(),
      },
    ];
    const html = await renderInbox();
    expect(html).toContain('nell.a7f3k2@harperscircle.app');
  });

  it('an inactive address says WHY it is not live yet, never pretends', async () => {
    subjects = [
      {
        id: 's-1',
        first_name: 'Nell',
        forwarding_local_part: 'nell.a7f3k2',
        forwarding_active_at: null,
      },
    ];
    const html = await renderInbox();
    expect(html).toMatch(/verif/i); // activates after the founder's email verification
  });
});

describe('B6 · the submit routes ride the wrappers with relative PRG redirects', () => {
  function post(path: string, fields: Record<string, string>): Request {
    const body = new URLSearchParams(fields);
    return new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  it('accept-sender: address mode and domain mode, then back to the inbox', async () => {
    inbox.acceptSender.mockResolvedValue({ sender_id: 'k-1', released_count: 1 });
    const { POST } = await import('@/app/(app)/[circle]/inbox/accept-sender/submit/route');
    const res = await POST(
      post(`/${CIRCLE}/inbox/accept-sender/submit`, {
        address: 'nurse@stranger.example',
        mode: 'address',
      }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox?accepted=1`);
    expect(inbox.acceptSender).toHaveBeenCalledWith(CLAIMS, CIRCLE, {
      address: 'nurse@stranger.example',
    });

    await POST(
      post(`/${CIRCLE}/inbox/accept-sender/submit`, {
        address: 'nurse@stranger.example',
        mode: 'domain',
      }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(inbox.acceptSender).toHaveBeenLastCalledWith(CLAIMS, CIRCLE, {
      domain: 'stranger.example',
    });
  });

  it('a refusal (freeze, non-coordinator) lands back with an error marker, one shape', async () => {
    inbox.acceptSender.mockRejectedValueOnce(new Error('freeze_active'));
    const { POST } = await import('@/app/(app)/[circle]/inbox/accept-sender/submit/route');
    const res = await POST(
      post(`/${CIRCLE}/inbox/accept-sender/submit`, { address: 'x@y.example', mode: 'address' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox?e=accept`);
  });

  it('cancel and resolve ride their wrappers the same way', async () => {
    inbox.cancelArrival.mockResolvedValue({ arrival_id: 'a-1', state: 'cancelled' });
    const cancel = await import('@/app/(app)/[circle]/inbox/cancel/submit/route');
    const res1 = await cancel.POST(
      post(`/${CIRCLE}/inbox/cancel/submit`, { arrival_id: 'a-1' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res1.headers.get('location')).toBe(`/${CIRCLE}/inbox?cancelled=1`);
    expect(inbox.cancelArrival).toHaveBeenCalledWith(CLAIMS, 'a-1');

    inbox.resolveDuplicate.mockResolvedValue({ arrival_id: 'a-2', resolution: 'same_thing' });
    const resolve = await import('@/app/(app)/[circle]/inbox/resolve/submit/route');
    const res2 = await resolve.POST(
      post(`/${CIRCLE}/inbox/resolve/submit`, { arrival_id: 'a-2', resolution: 'same_thing' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res2.headers.get('location')).toBe(`/${CIRCLE}/inbox?resolved=1`);
    expect(inbox.resolveDuplicate).toHaveBeenCalledWith(CLAIMS, 'a-2', 'same_thing');
  });

  it('no session ⇒ straight to sign-in, nothing called', async () => {
    session.liveSessionClaims.mockResolvedValue(null);
    const { POST } = await import('@/app/(app)/[circle]/inbox/cancel/submit/route');
    const res = await POST(
      post(`/${CIRCLE}/inbox/cancel/submit`, { arrival_id: 'a-1' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(inbox.cancelArrival).not.toHaveBeenCalled();
  });
});
