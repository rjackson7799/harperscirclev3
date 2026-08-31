import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7C C4 · /[circle]/people/[member] — adjust, revoke, and the honest limit
// (PRD §4.6.3, §4.6.4; PPL-02/03/05's app halves; AC-PERM-5, AC-PPL-4/6).
//
//   · the matrix lives HERE, behind the adjust action: per subject, per
//     domain, radios whose words come from the ONE phrase module; LOWERING
//     posts directly; RAISING goes through the §5.7 step-up bound to
//     member:subject:domain — the definer consumes, the route clears;
//   · the care-circle ceiling is shown AS a ceiling: nothing above
//     hc.tier_defaults('care_circle') is OFFERED, no other domain is
//     offered at all, and the ceiling sentence renders from the one tiers
//     module (the DB refuses regardless — PPL-02's "never offered above");
//   · revoke: the EXISTING remove route, the coordinator's keep-share
//     option, THE SENTENCE — "a file already downloaded to someone's
//     device cannot be recalled" — in those words, at the moment of
//     revocation, and the channels this slice does not reach NAMED;
//   · contribution: plain counts and lists — no chart, no bar, no
//     percentage anywhere on the surface (AC-PPL-6, over the rendered
//     tree);
//   · a non-coordinator constructing the URL by hand gets the one 404.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority:
// tests/hc/people.test.ts and the C6 people legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const peopleHc = {
  circlePeople: vi.fn(),
  sharesForMember: vi.fn(),
  contributionFor: vi.fn(),
  setGrant: vi.fn(),
};
vi.mock('@/lib/hc/people', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/people')>('@/lib/hc/people');
  return { ...actual, ...peopleHc };
});

const tasksHc = { myMembership: vi.fn() };
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

let stepUpCookie: string | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'hc-step-up' && stepUpCookie ? { name, value: stepUpCookie } : undefined,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const NELL = '22222222-0000-4000-8000-000000000002';
const ME = '44444444-0000-4000-8000-000000000004';
const RUTH_M = '44444444-0000-4000-8000-000000000006';
const MARISOL_M = '44444444-0000-4000-8000-000000000005';
const SHARE = 'cccccccc-0000-4000-8000-0000000000c1';
const TASK = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const base = {
  account_id: null,
  slice: null,
  subject_id: null,
  custodian_member_id: null,
  custodian_name: null,
  joined_at: '2026-08-01T10:00:00Z',
  invite_id: null,
  invite_expires_at: null,
  invite_status: null,
  levels: null,
};

const PEOPLE = [
  {
    ...base,
    kind: 'subject',
    member_id: '44444444-0000-4000-8000-000000000008',
    display_name: 'Nell',
    tier: 'coordinator',
    subject_id: NELL,
    custodian_name: 'Sarah',
    levels: { [NELL]: { memories: 'manage', health: 'manage', schedule: 'manage', documents: 'manage', finances: 'manage' } },
  },
  {
    ...base,
    kind: 'member',
    member_id: RUTH_M,
    display_name: 'Ruth',
    tier: 'family',
    levels: { [NELL]: { health: 'summary', schedule: 'summary' } },
  },
  {
    ...base,
    kind: 'member',
    member_id: MARISOL_M,
    display_name: 'Marisol',
    tier: 'care_circle',
    levels: { [NELL]: { schedule: 'summary' } },
  },
];

async function renderPage(memberId: string, sp: Record<string, string> = {}) {
  const { default: Page } = await import('@/app/(app)/[circle]/people/[member]/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE, member: memberId }),
      searchParams: Promise.resolve(sp),
    }),
  );
}

function postTo(path: string, body: Record<string, string>) {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(stepUpCookie ? { cookie: `hc-step-up=${stepUpCookie}` } : {}),
    },
    body: new URLSearchParams(body).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stepUpCookie = null;
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  tasksHc.myMembership.mockResolvedValue({ id: ME, tier: 'coordinator' });
  peopleHc.circlePeople.mockResolvedValue(PEOPLE.map((r) => ({ ...r })));
  peopleHc.sharesForMember.mockResolvedValue([]);
  peopleHc.contributionFor.mockResolvedValue({
    owns_now: [{ id: TASK, title: 'Call the pharmacy' }],
    completed_count: 3,
    last_active: '2026-08-30T10:00:00Z',
  });
});

describe('the matrix — per subject per domain, words from the ONE module, lowering direct, raising through step-up', () => {
  it('renders the matrix for a family member with the current level checked and every level offered', async () => {
    const html = await renderPage(RUTH_M);
    expect(html).toContain('Ruth');
    expect(html).toContain(`action="/${CIRCLE}/people/${RUTH_M}/grant/submit"`);
    expect(html).toMatch(/health &amp; care/);
    expect(html).toContain('value="manage"');
    expect(html).toContain('value="hidden"');
    // the current level is the checked radio (React SSR emits `checked`
    // before `value`)
    expect(html).toMatch(/checked[^>]*value="summary"/);
  });

  it('the care-circle ceiling: nothing above it is OFFERED, no other domain is offered, and the ceiling sentence renders', async () => {
    const html = await renderPage(MARISOL_M);
    expect(html).toMatch(/ceiling/i);
    // schedule offered only up to summary
    expect(html).not.toContain('value="view"');
    expect(html).not.toContain('value="manage"');
    // no adjust controls for domains outside the ceiling
    expect(html).not.toMatch(/health &amp; care[\s\S]*value="summary"/);
  });

  it('a non-coordinator constructing the URL by hand gets the one 404', async () => {
    tasksHc.myMembership.mockResolvedValue({ id: RUTH_M, tier: 'family' });
    await expect(renderPage(MARISOL_M)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('an unknown member is the same 404', async () => {
    await expect(renderPage('44444444-0000-4000-8000-0000000000ff')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});

describe('revoke — the honest limit in those words, at the moment of revocation', () => {
  it('the remove confirmation carries THE SENTENCE verbatim, the keep-share options, and posts to the EXISTING route', async () => {
    peopleHc.sharesForMember.mockResolvedValue([
      {
        share_id: SHARE,
        object_type: 'document',
        object_id: '66666666-0000-4000-8000-000000000006',
        label: 'Discharge summary · Jul 12',
        visible: true,
        granted_by: CLAIMS.sub,
        granter_name: 'Sarah',
        granted_at: '2026-08-30T10:00:00Z',
        created_by_assignment_of: null,
      },
    ]);
    const html = await renderPage(RUTH_M, { remove: '1' });
    expect(html).toContain('a file already downloaded to someone&#x27;s device cannot be recalled');
    expect(html).toContain(`action="/${CIRCLE}/members/${RUTH_M}/remove"`);
    expect(html).toContain('name="keep_share_ids"');
    expect(html).toContain(`value="${SHARE}"`);
    // the channels this slice does not reach, NAMED
    expect(html).toMatch(/notification/i);
    expect(html).toMatch(/export/i);
  });

  it('without ?remove=1 the sentence is not yet on screen — it belongs to the moment of revocation', async () => {
    const html = await renderPage(RUTH_M);
    expect(html).not.toContain('cannot be recalled');
    expect(html).toMatch(/Remove/);
  });
});

describe('contribution — plain counts, no chart, no bar, no percentage (AC-PPL-6)', () => {
  it('owns-now list, completed count and last active render as text; nothing chart-shaped exists in the tree', async () => {
    const html = await renderPage(RUTH_M);
    expect(html).toContain('Call the pharmacy');
    expect(html).toMatch(/3/);
    expect(html).not.toContain('%');
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('<svg');
    expect(html).not.toMatch(/chart|bar-|leaderboard/i);
  });

  it('never active renders as the honest words, not a fake date', async () => {
    peopleHc.contributionFor.mockResolvedValue({ owns_now: [], completed_count: 0, last_active: null });
    const html = await renderPage(RUTH_M);
    expect(html).toMatch(/hasn&#x27;t been active yet|not been active/i);
  });
});

describe('the grant write', () => {
  const ctx = { params: Promise.resolve({ circle: CIRCLE, member: RUTH_M }) };
  async function grantRoute() {
    return (await import('@/app/(app)/[circle]/people/[member]/grant/submit/route')).POST;
  }

  it('a LOWER posts straight through — no token demanded', async () => {
    peopleHc.setGrant.mockResolvedValue({});
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'log',
      }),
      ctx,
    );
    expect(peopleHc.setGrant).toHaveBeenCalledWith(CLAIMS, RUTH_M, NELL, 'health', 'log', null);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('changed=1');
  });

  it('a RAISE without the token bounces to the step-up phase, calling nothing', async () => {
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'view',
      }),
      ctx,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=step-up');
    // three params, never a colon-joined triple — safeNext refuses ':'
    expect(res.headers.get('location')).toContain(`rs=${NELL}`);
    expect(res.headers.get('location')).toContain('rd=health');
    expect(res.headers.get('location')).toContain('rl=view');
    expect(peopleHc.setGrant).not.toHaveBeenCalled();
  });

  it('a RAISE with the token hands it to the definer and clears the cookie either way', async () => {
    stepUpCookie = 'tok';
    peopleHc.setGrant.mockResolvedValue({});
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'view',
      }),
      ctx,
    );
    expect(peopleHc.setGrant).toHaveBeenCalledWith(CLAIMS, RUTH_M, NELL, 'health', 'view', 'tok');
    expect(res.headers.get('set-cookie')).toContain('hc-step-up=;');
    expect(res.headers.get('location')).toContain('changed=1');

    peopleHc.setGrant.mockRejectedValue(new Error('grant_refused'));
    const res2 = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'view',
      }),
      ctx,
    );
    expect(res2.headers.get('location')).toContain('e=refused');
    expect(res2.headers.get('set-cookie')).toContain('hc-step-up=;');
  });

  it('an unknown domain or level never reaches the wrapper', async () => {
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'secrets',
        level: 'all',
      }),
      ctx,
    );
    expect(res.headers.get('location')).toContain('e=refused');
    expect(peopleHc.setGrant).not.toHaveBeenCalled();
  });
});
