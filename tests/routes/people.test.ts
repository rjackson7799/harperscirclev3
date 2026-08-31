import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7C C3 · /[circle]/people — the list (PRD §4.6.1, §4.6.2, §7.5; PPL-01's
// app half; AC-PPL-2/3; settled item 1 with its TWO stated limits) — and
// the tier-aware nav (NAV-01's composition half).
//
//   · the plain-language line per subject comes BEFORE any matrix — this
//     page holds NO matrix, no checkbox, no per-domain table at all; the
//     matrix lives behind the adjust action (C4);
//   · limit (1) is SAID on screen: the lines describe what a person sees
//     in the record — reads, search, presence, the log — and never promise
//     the notification or export channels (RLS-11b pending);
//   · limit (2): subjects render as people holding the highest access to
//     their own record, no account attached, the CUSTODIAN named beside
//     them — the §7.5 framing, and never the word "authority";
//   · a null levels map is "not yours to know" — NO line renders, and
//     nothing implies one exists;
//   · invites: `Invited · expires …` pending, `Invite expired` with ONE
//     send-again form — a new invite, never a resurrected token;
//   · the nav composition is a COURTESY asserted per tier: a caregiver's
//     nav is Tasks · Account; a family member's is Timeline · Documents ·
//     People · Account; a coordinator's carries everything.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority:
// tests/hc/people.test.ts, tests/permissions/phrases.test.ts, the C6 legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const peopleHc = {
  circlePeople: vi.fn(),
  resendInvite: vi.fn(),
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
const SUBJECT_M = '44444444-0000-4000-8000-000000000008';
const INVITE = '77777777-0000-4000-8000-000000000007';
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

const ROWS = [
  {
    ...base,
    kind: 'subject',
    member_id: SUBJECT_M,
    display_name: 'Nell',
    tier: 'coordinator',
    subject_id: NELL,
    custodian_member_id: ME,
    custodian_name: 'Sarah',
    levels: { [NELL]: { memories: 'manage', health: 'manage', schedule: 'manage', documents: 'manage', finances: 'manage' } },
  },
  {
    ...base,
    kind: 'member',
    member_id: ME,
    display_name: 'Sarah',
    tier: 'coordinator',
    slice: 'The paperwork',
    levels: { [NELL]: { memories: 'manage', health: 'manage', schedule: 'manage', documents: 'manage', finances: 'manage' } },
  },
  {
    ...base,
    kind: 'member',
    member_id: RUTH_M,
    display_name: 'Ruth',
    tier: 'family',
    levels: { [NELL]: { health: 'summary', schedule: 'summary', memories: 'summary', documents: 'log' } },
  },
  { ...base, kind: 'member', member_id: MARISOL_M, display_name: 'Marisol', tier: 'care_circle' },
  {
    ...base,
    kind: 'invite',
    member_id: null,
    display_name: 'aunt@example.invalid',
    tier: 'family',
    invite_id: INVITE,
    invite_expires_at: '2026-09-04T10:00:00Z',
    invite_status: 'pending',
  },
  {
    ...base,
    kind: 'invite',
    member_id: null,
    display_name: 'helper@example.invalid',
    tier: 'care_circle',
    invite_id: '77777777-0000-4000-8000-000000000008',
    invite_expires_at: '2026-08-20T10:00:00Z',
    invite_status: 'expired',
  },
];

async function renderPage() {
  const { default: Page } = await import('@/app/(app)/[circle]/people/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  peopleHc.circlePeople.mockResolvedValue(ROWS.map((r) => ({ ...r })));
  tasksHc.myMembership.mockResolvedValue({ id: ME, tier: 'coordinator' });
});

describe('the list — the plain line before any matrix, and NO matrix here at all', () => {
  it('every member renders name, role and the plain line per subject; the page holds no checkbox and no per-domain table', async () => {
    const html = await renderPage();
    expect(html).toContain('Sarah');
    expect(html).toContain('Ruth');
    expect(html).toContain('Marisol');
    expect(html).toMatch(/Nell:/);
    expect(html).not.toContain('<table');
    expect(html).not.toContain('type="checkbox"');
  });

  it("a null levels map renders NO line — 'not yours to know' implies nothing", async () => {
    tasksHc.myMembership.mockResolvedValue({ id: RUTH_M, tier: 'family' });
    peopleHc.circlePeople.mockResolvedValue([
      ROWS[2],
      { ...base, kind: 'member', member_id: MARISOL_M, display_name: 'Marisol', tier: 'care_circle' },
    ]);
    const html = await renderPage();
    const marisolChunk = html.slice(html.indexOf('Marisol'));
    expect(marisolChunk).not.toMatch(/Nell:/);
  });

  it('limit (1) is SAID: the lines cover the record — never the notification or export channels', async () => {
    const html = await renderPage();
    expect(html).toMatch(/what each person can see in the record/i);
    expect(html).toMatch(/notification|notified/i);
  });

  it('limit (2): a subject is a person holding the highest access to their own record, no account attached, custodian NAMED — and never the word "authority"', async () => {
    const html = await renderPage();
    expect(html).toMatch(/highest access to their own record/);
    expect(html).toMatch(/no account/i);
    expect(html).toMatch(/[Cc]ustodian/);
    expect(html).toContain('Sarah');
    expect(html).not.toMatch(/authority/i);
  });

  it('a coordinator sees an adjust link per member; the matrix lives THERE, not here', async () => {
    const html = await renderPage();
    expect(html).toContain(`href="/${CIRCLE}/people/${RUTH_M}"`);
  });

  it('a non-coordinator gets no adjust links and no invites section', async () => {
    tasksHc.myMembership.mockResolvedValue({ id: RUTH_M, tier: 'family' });
    peopleHc.circlePeople.mockResolvedValue(ROWS.filter((r) => r.kind !== 'invite'));
    const html = await renderPage();
    expect(html).not.toContain(`href="/${CIRCLE}/people/${MARISOL_M}"`);
    expect(html).not.toMatch(/Invited/);
  });
});

describe('invites — pending, expired, and send-again as a NEW invite', () => {
  it('pending renders `Invited · expires …`; expired renders `Invite expired` with ONE send-again form', async () => {
    const html = await renderPage();
    expect(html).toMatch(/Invited · expires/);
    expect(html).toMatch(/Invite expired/);
    expect(html).toContain(
      `action="/${CIRCLE}/people/invites/77777777-0000-4000-8000-000000000008/again/submit"`,
    );
    expect(html).toMatch(/Send again/);
  });
});

describe('NAV-01 · the composition half — a courtesy asserted per tier, never the mechanism', () => {
  it('a caregiver’s nav is Tasks · Account', async () => {
    const { navFor } = await import('@/components/shell/nav-manifest');
    expect(navFor('care_circle').map((e) => e.key)).toEqual(['tasks', 'account']);
  });

  it('a family member’s nav is Timeline · Documents · People · Account', async () => {
    const { navFor } = await import('@/components/shell/nav-manifest');
    expect(navFor('family').map((e) => e.key)).toEqual(['timeline', 'documents', 'people', 'account']);
  });

  it('a coordinator’s nav carries everything, people and documents included', async () => {
    const { navFor } = await import('@/components/shell/nav-manifest');
    const keys = navFor('coordinator').map((e) => e.key);
    for (const k of ['inbox', 'upload', 'tasks', 'invite', 'timeline', 'documents', 'people', 'account']) {
      expect(keys).toContain(k);
    }
  });

  it('an unknown tier falls back to the full manifest — hiding is a courtesy, and a failed read must never hide a surface someone is entitled to', async () => {
    const { navFor, NAV_MANIFEST } = await import('@/components/shell/nav-manifest');
    expect(navFor(null)).toEqual(NAV_MANIFEST);
  });
});
