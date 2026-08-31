import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ============================================================================
// 7B B1 · THE PAGE GATE UNDER AN AUTH OUTAGE — GTE-01 (ADR-0028 D8 item 2 /
// OW-11; D15 item 1 / OW-15). Round-19 F-2's PRODUCT half: `liveSessionClaims`
// flattened `readLiveSession`'s `unavailable` to `null`, and null is the shape
// of "there is no session". D15 counted 21 sites — 3 refuse with a status ·
// 10 pages redirect to /sign-in · 5 form routes redirect exactly as the pages
// do · 1 layout degrades · 2 do not gate — so an auth server that stalled, a
// gateway that 502'd and a rate limit each signed a family out of their own
// record during an availability incident. Not one site was a fixture.
//
// THIS FILE DRIVES EVERY ONE OF THOSE SITES with the third outcome and asserts
// the honest answer per shape:
//   · a PAGE renders the unavailable state (role="alert", the retry sentence,
//     a "try again" link to its own path) and NEVER throws the sign-in
//     redirect;
//   · a FORM ROUTE answers 503 with `retry-after` and `private, no-store` as
//     an HTML page a person can read — never a 303 to /sign-in;
//   · the LAYOUT degrades (renders the chrome without the user chip);
//   · `signed-out` is the CONTROL: the redirect the pages and routes took
//     before is exactly the redirect they take now.
//
// AND THE SET IS PINNED TO THE FILESYSTEM BOTH WAYS, the audit-manifest
// discipline (R5/F-6): every app/**/page.tsx, route.ts and layout.tsx that
// imports the gate appears here — as a driven case, or as an honest pointer to
// the file that drives it — so a 7B/7C page that inherits the gate FAILS
// VITEST until it is listed. "Before B2 adds pages" is a test, not a hope.
//
// Test class: MOCKED ROUTE CONTRACT over the REAL gate helpers; only the
// session read and the cookie store are mocked.
// ============================================================================

const session = { readLiveSession: vi.fn(), liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

// No app router exists under renderToStaticMarkup: the redirect becomes a
// throw we can name, and the client-side hooks the shell uses are stubbed.
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/',
  useRouter: () => ({ refresh: () => {} }),
}));

function chain(): Record<string, unknown> {
  const p = Promise.resolve({ data: [], error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle']) {
    proxy[m] = () => proxy;
  }
  proxy.then = p.then.bind(p);
  proxy.catch = p.catch.bind(p);
  return proxy;
}
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({
    from: () => chain(),
    auth: { getUser: vi.fn(), getClaims: vi.fn(), signOut: vi.fn() },
  }),
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const TASK = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const MEMBER = '44444444-0000-4000-8000-000000000005';
const EVENT = 'eeeeeeee-0000-4000-8000-0000000000e1';
const DOCUMENT = '66666666-0000-4000-8000-000000000006';
const UNAVAILABLE = { kind: 'unavailable', why: 'AuthRetryableFetchError: fetch failed' } as const;
const SIGNED_OUT = { kind: 'signed-out' } as const;

type PageProps = Record<string, unknown>;
// Each page declares its own props shape; the table carries them untyped and
// the call site widens, so one loader type fits every page.
type PageModule = { default: (p: never) => Promise<unknown> };
type RouteModule = { POST: (r: Request, c: never) => Promise<Response> };
type PageFn = (p: PageProps) => Promise<unknown>;
type RouteFn = (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Entry =
  | { kind: 'page'; next: string; load: () => Promise<PageModule>; props: PageProps }
  | { kind: 'layout'; load: () => Promise<PageModule>; props: PageProps }
  | { kind: 'route'; next: string; load: () => Promise<RouteModule>; params: Record<string, string> }
  | { kind: 'elsewhere'; where: string };

const params = (p: Record<string, string>) => Promise.resolve(p);
const sp = (s: Record<string, string> = {}) => Promise.resolve(s);

/** Every site that gates a live session, keyed by route — the D15 twenty-one,
 *  minus the two that do not gate (invite/submit, members/remove read
 *  getClaims directly and are named in lib/auth/gate.ts). */
const GATED: Record<string, Entry> = {
  // ---- the ten pages ------------------------------------------------------
  '/[circle]/inbox': {
    kind: 'page',
    next: `/${CIRCLE}/inbox`,
    load: () => import('@/app/(app)/[circle]/inbox/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  '/[circle]/inbox/[arrival]': {
    kind: 'page',
    next: `/${CIRCLE}/inbox/${ARRIVAL}`,
    load: () => import('@/app/(app)/[circle]/inbox/[arrival]/page'),
    props: { params: params({ circle: CIRCLE, arrival: ARRIVAL }), searchParams: sp() },
  },
  '/[circle]/invite': {
    kind: 'page',
    next: `/${CIRCLE}/invite`,
    load: () => import('@/app/(app)/[circle]/invite/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  '/[circle]/senders': {
    kind: 'page',
    next: `/${CIRCLE}/senders`,
    load: () => import('@/app/(app)/[circle]/senders/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  '/[circle]/tasks': {
    kind: 'page',
    next: `/${CIRCLE}/tasks`,
    load: () => import('@/app/(app)/[circle]/tasks/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  '/[circle]/timeline': {
    kind: 'page',
    next: `/${CIRCLE}/timeline`,
    load: () => import('@/app/(app)/[circle]/timeline/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  '/[circle]/upload': {
    kind: 'page',
    next: `/${CIRCLE}/upload`,
    load: () => import('@/app/(app)/[circle]/upload/page'),
    props: { params: params({ circle: CIRCLE }) },
  },
  // ---- 7B B2: the pages the pin demanded the moment they existed ---------
  '/[circle]/tasks/[task]': {
    kind: 'page',
    next: `/${CIRCLE}/tasks/${TASK}`,
    load: () => import('@/app/(app)/[circle]/tasks/[task]/page'),
    props: { params: params({ circle: CIRCLE, task: TASK }), searchParams: sp() },
  },
  '/[circle]/tasks/[task]/assign': {
    kind: 'page',
    next: `/${CIRCLE}/tasks/${TASK}/assign?member=${MEMBER}`,
    load: () => import('@/app/(app)/[circle]/tasks/[task]/assign/page'),
    props: { params: params({ circle: CIRCLE, task: TASK }), searchParams: sp({ member: MEMBER }) },
  },
  // ---- 7C C1/C2: the pin demanded these the moment they existed -----------
  '/[circle]/documents': {
    kind: 'page',
    next: `/${CIRCLE}/documents`,
    load: () => import('@/app/(app)/[circle]/documents/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  '/[circle]/documents/[document]': {
    kind: 'page',
    next: `/${CIRCLE}/documents/${DOCUMENT}`,
    load: () => import('@/app/(app)/[circle]/documents/[document]/page'),
    props: { params: params({ circle: CIRCLE, document: DOCUMENT }), searchParams: sp() },
  },
  '/[circle]/people': {
    kind: 'page',
    next: `/${CIRCLE}/people`,
    load: () => import('@/app/(app)/[circle]/people/page'),
    props: { params: params({ circle: CIRCLE }), searchParams: sp() },
  },
  // ---- 7B B3 --------------------------------------------------------------
  '/[circle]/timeline/[event]': {
    kind: 'page',
    next: `/${CIRCLE}/timeline/${EVENT}`,
    load: () => import('@/app/(app)/[circle]/timeline/[event]/page'),
    props: { params: params({ circle: CIRCLE, event: EVENT }), searchParams: sp() },
  },
  '/account': {
    kind: 'page',
    next: '/account',
    load: () => import('@/app/account/page'),
    props: { searchParams: sp() },
  },
  '/setup': {
    kind: 'page',
    next: '/setup',
    load: () => import('@/app/setup/page'),
    props: {},
  },
  '/setup/complete': {
    kind: 'page',
    next: '/setup',
    load: () => import('@/app/setup/complete/page'),
    props: { searchParams: sp({ circle: CIRCLE }) },
  },
  // ---- the layout that degrades ------------------------------------------
  'layout /[circle]': {
    kind: 'layout',
    load: () => import('@/app/(app)/[circle]/layout'),
    props: { params: params({ circle: CIRCLE }), children: 'CHILD-MARKER' },
  },
  // ---- the five form routes ----------------------------------------------
  '/[circle]/inbox/accept-sender/submit': {
    kind: 'route',
    next: `/${CIRCLE}/inbox`,
    load: () => import('@/app/(app)/[circle]/inbox/accept-sender/submit/route'),
    params: { circle: CIRCLE },
  },
  '/[circle]/inbox/cancel/submit': {
    kind: 'route',
    next: `/${CIRCLE}/inbox`,
    load: () => import('@/app/(app)/[circle]/inbox/cancel/submit/route'),
    params: { circle: CIRCLE },
  },
  '/[circle]/inbox/resolve/submit': {
    kind: 'route',
    next: `/${CIRCLE}/inbox`,
    load: () => import('@/app/(app)/[circle]/inbox/resolve/submit/route'),
    params: { circle: CIRCLE },
  },
  '/[circle]/inbox/[arrival]/decide/submit': {
    kind: 'route',
    next: `/${CIRCLE}/inbox/${ARRIVAL}`,
    load: () => import('@/app/(app)/[circle]/inbox/[arrival]/decide/submit/route'),
    params: { circle: CIRCLE, arrival: ARRIVAL },
  },
  '/[circle]/senders/revoke/submit': {
    kind: 'route',
    next: `/${CIRCLE}/senders`,
    load: () => import('@/app/(app)/[circle]/senders/revoke/submit/route'),
    params: { circle: CIRCLE },
  },
  // The pin demanded this one the moment it existed: the activation pass
  // offered again (OW-18's account-page half) is a sixth form route.
  '/account/activate-forwarding/submit': {
    kind: 'route',
    next: '/account',
    load: () => import('@/app/account/activate-forwarding/submit/route'),
    params: {},
  },
  // ---- 7B B2: the four task writes ---------------------------------------
  '/[circle]/tasks/[task]/assign/submit': {
    kind: 'route',
    next: `/${CIRCLE}/tasks/${TASK}`,
    load: () => import('@/app/(app)/[circle]/tasks/[task]/assign/submit/route'),
    params: { circle: CIRCLE, task: TASK },
  },
  '/[circle]/tasks/[task]/unassign/submit': {
    kind: 'route',
    next: `/${CIRCLE}/tasks/${TASK}`,
    load: () => import('@/app/(app)/[circle]/tasks/[task]/unassign/submit/route'),
    params: { circle: CIRCLE, task: TASK },
  },
  '/[circle]/tasks/[task]/complete/submit': {
    kind: 'route',
    next: `/${CIRCLE}/tasks/${TASK}`,
    load: () => import('@/app/(app)/[circle]/tasks/[task]/complete/submit/route'),
    params: { circle: CIRCLE, task: TASK },
  },
  '/[circle]/tasks/[task]/snooze/submit': {
    kind: 'route',
    next: `/${CIRCLE}/tasks/${TASK}`,
    load: () => import('@/app/(app)/[circle]/tasks/[task]/snooze/submit/route'),
    params: { circle: CIRCLE, task: TASK },
  },
  '/[circle]/timeline/add/submit': {
    kind: 'route',
    next: `/${CIRCLE}/timeline`,
    load: () => import('@/app/(app)/[circle]/timeline/add/submit/route'),
    params: { circle: CIRCLE },
  },
  // ---- 7C C2: the three document writes -----------------------------------
  '/[circle]/documents/[document]/share/submit': {
    kind: 'route',
    next: `/${CIRCLE}/documents/${DOCUMENT}`,
    load: () => import('@/app/(app)/[circle]/documents/[document]/share/submit/route'),
    params: { circle: CIRCLE, document: DOCUMENT },
  },
  '/[circle]/documents/[document]/unshare/submit': {
    kind: 'route',
    next: `/${CIRCLE}/documents/${DOCUMENT}`,
    load: () => import('@/app/(app)/[circle]/documents/[document]/unshare/submit/route'),
    params: { circle: CIRCLE, document: DOCUMENT },
  },
  '/[circle]/documents/[document]/recategorize/submit': {
    kind: 'route',
    next: `/${CIRCLE}/documents/${DOCUMENT}`,
    load: () => import('@/app/(app)/[circle]/documents/[document]/recategorize/submit/route'),
    params: { circle: CIRCLE, document: DOCUMENT },
  },
  '/[circle]/people/invites/[invite]/again/submit': {
    kind: 'route',
    next: `/${CIRCLE}/people`,
    load: () => import('@/app/(app)/[circle]/people/invites/[invite]/again/submit/route'),
    params: { circle: CIRCLE, invite: '77777777-0000-4000-8000-000000000007' },
  },
  // ---- the three that already answer a status, and the two special routes --
  '/api/artifact/[id]': { kind: 'elsewhere', where: 'tests/routes/artifact.test.ts — 503 session_unavailable, never 404' },
  '/api/upload/token': { kind: 'elsewhere', where: 'tests/routes/upload.test.ts — 503, never 401' },
  '/api/upload/complete': { kind: 'elsewhere', where: 'tests/routes/upload.test.ts — 503, never 401' },
  '/confirm': { kind: 'elsewhere', where: 'tests/routes/confirm.test.ts — a retry, never success (OW-18)' },
  '/account/sign-out-everywhere': {
    kind: 'elsewhere',
    where: 'tests/routes/account.test.ts — sign-out is never refused; the log entry is skipped, the kill proceeds',
  },
};

// ---------------------------------------------------------------------------
// The pin: every gated file on disk is a key here, and every key is on disk.
// ---------------------------------------------------------------------------
const GATE_IMPORT = /from '@\/lib\/auth\/(session|gate)'/;

function gatedOnDisk(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (name !== 'page.tsx' && name !== 'route.ts' && name !== 'layout.tsx') continue;
      if (!GATE_IMPORT.test(readFileSync(full, 'utf8'))) continue;
      const rel = relative(root, dir).split(sep).filter(Boolean);
      const segments = rel.filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));
      const route = '/' + segments.join('/');
      out.push(name === 'layout.tsx' ? `layout ${route}` : route);
    }
  };
  walk(root);
  return out.sort();
}

describe('GTE-01 · the gated set is PINNED to the filesystem both ways', () => {
  const onDisk = gatedOnDisk(join(process.cwd(), 'app'));
  const listed = Object.keys(GATED).sort();

  it('every file that imports the gate is driven here, or points at the file that drives it', () => {
    const missing = onDisk.filter((r) => !(r in GATED));
    expect(
      missing,
      `gated routes with no entry in tests/app/page-gate.test.ts (add them, with their unavailable case): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('nothing is listed that does not gate on disk', () => {
    const stale = listed.filter((r) => !onDisk.includes(r));
    expect(stale, `entries with no gated file behind them: ${stale.join(', ')}`).toEqual([]);
  });

  it('the D15 enumeration holds on disk, plus 7B and 7C C2: ten + three + one pages, five + one + five + three form routes, one layout', () => {
    const kinds = Object.values(GATED).map((e) => e.kind);
    expect(kinds.filter((k) => k === 'page').length).toBe(16);
    expect(kinds.filter((k) => k === 'route').length).toBe(15);
    expect(kinds.filter((k) => k === 'layout').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The cases.
// ---------------------------------------------------------------------------
function post(path: string): Request {
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ arrival_id: ARRIVAL, address: 'x@y.example', mode: 'address' }).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

for (const [route, entry] of Object.entries(GATED)) {
  if (entry.kind === 'elsewhere') continue;

  describe(`GTE-01 · ${route}`, () => {
    if (entry.kind === 'page') {
      it('unavailable ⇒ RENDERS the state — role="alert", the retry sentence, "try again" to its own path — and never the sign-in redirect', async () => {
        session.readLiveSession.mockResolvedValue(UNAVAILABLE);
        session.liveSessionClaims.mockResolvedValue(null);
        const Page = (await entry.load()).default as unknown as PageFn;
        const html = renderToStaticMarkup((await Page(entry.props)) as never);
        expect(html).toContain('role="alert"');
        expect(html).toContain("We couldn&#x27;t check your sign-in just now.");
        expect(html).toContain(`href="${entry.next}"`);
        // The state SAYS "your sign-in"; what it must never carry is the
        // redirect's path.
        expect(html).not.toContain('/sign-in');
      });

      it('signed-out ⇒ the SAME redirect as before (the control)', async () => {
        session.readLiveSession.mockResolvedValue(SIGNED_OUT);
        session.liveSessionClaims.mockResolvedValue(null);
        const Page = (await entry.load()).default as unknown as PageFn;
        await expect(Page(entry.props)).rejects.toThrow(
          `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(entry.next)}`,
        );
      });
    }

    if (entry.kind === 'layout') {
      it('unavailable ⇒ the chrome renders around the children, with no user chip and no redirect', async () => {
        session.readLiveSession.mockResolvedValue(UNAVAILABLE);
        session.liveSessionClaims.mockResolvedValue(null);
        const Layout = (await entry.load()).default as unknown as PageFn;
        const html = renderToStaticMarkup((await Layout(entry.props)) as never);
        expect(html).toContain('CHILD-MARKER');
        // The state SAYS "your sign-in"; what it must never carry is the
        // redirect's path.
        expect(html).not.toContain('/sign-in');
      });
    }

    if (entry.kind === 'route') {
      it('unavailable ⇒ 503 with retry-after and private, no-store, as a page a person can read — never a 303 to /sign-in', async () => {
        session.readLiveSession.mockResolvedValue(UNAVAILABLE);
        session.liveSessionClaims.mockResolvedValue(null);
        const POST = (await entry.load()).POST as unknown as RouteFn;
        const res = await POST(post(route), { params: params(entry.params) });
        expect(res.status).toBe(503);
        expect(res.headers.get('retry-after')).toBe('5');
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        expect(res.headers.get('content-type')).toContain('text/html');
        const body = await res.text();
        expect(body).toContain("We couldn't check your sign-in just now.");
        expect(body).toContain(`href="${entry.next}"`);
        expect(body).not.toContain('/sign-in');
      });

      it('signed-out ⇒ 303 to /sign-in with next (the control)', async () => {
        session.readLiveSession.mockResolvedValue(SIGNED_OUT);
        session.liveSessionClaims.mockResolvedValue(null);
        const POST = (await entry.load()).POST as unknown as RouteFn;
        const res = await POST(post(route), { params: params(entry.params) });
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe(`/sign-in?next=${encodeURIComponent(entry.next)}`);
      });
    }
  });
}

describe('GTE-01 · the two-outcome gate is gone', () => {
  it('lib/auth/session exports no liveSessionClaims — an outage can no longer be read as a sign-out by name', async () => {
    const real = await vi.importActual<Record<string, unknown>>('@/lib/auth/session');
    expect('liveSessionClaims' in real).toBe(false);
    expect(typeof real.readLiveSession).toBe('function');
  });

  it('no file under app/ imports or calls liveSessionClaims (comment lines carved out — a scanner matches its own prose)', () => {
    const offenders: string[] = [];
    const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name)) {
          const hit = readFileSync(full, 'utf8')
            .split('\n')
            .some((line) => !COMMENT_LINE.test(line) && /\bliveSessionClaims\b/.test(line));
          if (hit) offenders.push(relative(process.cwd(), full));
        }
      }
    };
    walk(join(process.cwd(), 'app'));
    expect(offenders).toEqual([]);
  });
});
