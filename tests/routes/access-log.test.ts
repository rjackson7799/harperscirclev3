import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// 7C C5 · /[circle]/people/log and /[circle]/people/subject/[subject]
// (PRD §4.6.5, §7.5; PPL-04's app half; AC-PPL-5/7; LOG-01/02's app halves;
// Q4(b) — the subject page is the Phase-1 home for "filed to the profile").
//
//   · the log renders WHO did WHAT, to WHOM, on WHICH subject, in WHICH
//     domain, WHEN — the surface adds nothing and subtracts nothing: the
//     filtering is access_log_select's (LOG-01), asserted at the module,
//     never re-implemented here;
//   · a denial row renders its collapsed count and NEVER an object name
//     (LOG-02 — the entry cannot name one, and the surface must not
//     invent one);
//   · PRINTABLE: the printed projection is the SAME filtered read — the
//     print stylesheet hides the chrome, never adds data;
//   · the subject's page: the custodianship declaration where it is
//     visible (log×5 — D4), NEVER a claim that there is none where it
//     isn't; the profile facts at view with the risk_class word.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority:
// tests/hc/people.test.ts and the C6 legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const peopleHc = {
  accessLog: vi.fn(),
  custodianshipDeclaration: vi.fn(),
  profileFactsFor: vi.fn(),
  circlePeople: vi.fn(),
};
vi.mock('@/lib/hc/people', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/people')>('@/lib/hc/people');
  return { ...actual, ...peopleHc };
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
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const ENTRY = {
  seq: 41,
  event_type: 'grant_changed',
  actor_display_name: 'Sarah',
  target_name: 'Ruth',
  subject_id: NELL,
  subject_name: 'Nell',
  domain: 'health',
  level_before: 'summary',
  level_after: 'log',
  collapsed_count: 1,
  occurred_at: '2026-08-30T10:00:00Z',
};

const DENIAL = {
  seq: 40,
  event_type: 'access_denied',
  actor_display_name: 'Dan',
  target_name: null,
  subject_id: NELL,
  subject_name: 'Nell',
  domain: 'finances',
  level_before: null,
  level_after: null,
  collapsed_count: 7,
  occurred_at: '2026-08-29T10:00:00Z',
};

async function renderLog() {
  const { default: Page } = await import('@/app/(app)/[circle]/people/log/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE }),
      searchParams: Promise.resolve({}),
    }),
  );
}

async function renderSubject(subject: string) {
  const { default: Page } = await import('@/app/(app)/[circle]/people/subject/[subject]/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE, subject }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  peopleHc.accessLog.mockResolvedValue([ENTRY, DENIAL]);
  peopleHc.custodianshipDeclaration.mockResolvedValue({
    seq: 1,
    event_type: 'custodianship_declared',
    actor_display_name: 'Sarah',
    detail: { subject_name: 'Nell' },
    occurred_at: '2026-08-01T10:00:00Z',
  });
  peopleHc.profileFactsFor.mockResolvedValue([
    {
      id: 'cccccccc-0000-4000-8000-0000000000f1',
      field: 'date_of_birth',
      value: '1941-03-02',
      risk_class: 'high',
      approver_display_name: 'Sarah',
      approved_at: '2026-08-20T10:00:00Z',
    },
  ]);
  peopleHc.circlePeople.mockResolvedValue([
    {
      kind: 'subject',
      member_id: 's1',
      display_name: 'Nell',
      tier: 'coordinator',
      subject_id: NELL,
      custodian_name: 'Sarah',
      levels: null,
      slice: null,
      account_id: null,
      custodian_member_id: null,
      joined_at: '2026-08-01T10:00:00Z',
      invite_id: null,
      invite_expires_at: null,
      invite_status: null,
      is_subject: true,
    },
  ]);
});

describe('the access log — who did what, to whom, on which subject, in which domain, when', () => {
  it('an entry renders all five parts, with both levels where the event carries them', async () => {
    const html = await renderLog();
    expect(html).toContain('Sarah');
    expect(html).toContain('Ruth');
    expect(html).toContain('Nell');
    expect(html).toMatch(/health/i);
    expect(html).toMatch(/summary/);
    expect(html).toMatch(/log|activity/);
  });

  it('a denial renders its collapsed count and NEVER an object name — and there is none to leak', async () => {
    const html = await renderLog();
    expect(html).toContain('Dan');
    expect(html).toMatch(/7/);
    expect(html).toMatch(/tried to open something/i);
  });

  it('the page is printable: the print stylesheet exists and hides the chrome, never the entries', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    expect(css).toContain('@media print');
    expect(css).toMatch(/@media print[\s\S]*\.left-nav/);
  });
});

describe("the subject's page — the declaration where visible, the facts at view", () => {
  it('renders the custodianship declaration (the first row of the log) and the custodian framing', async () => {
    const html = await renderSubject(NELL);
    expect(html).toContain('Nell');
    expect(html).toMatch(/custodian/i);
    expect(html).toMatch(/written down|written in/i);
  });

  it('the profile facts render with the risk_class WORD and the approver', async () => {
    const html = await renderSubject(NELL);
    expect(html).toMatch(/date of birth/i);
    expect(html).toContain('1941-03-02');
    expect(html).toContain('high');
    expect(html).toContain('Sarah');
  });

  it('below the declaration bound: NO claim that there is none (D4 — the page renders it where shown and says nothing where not)', async () => {
    peopleHc.custodianshipDeclaration.mockResolvedValue(null);
    const html = await renderSubject(NELL);
    expect(html).not.toMatch(/no declaration|nothing declared/i);
  });

  it('a member at summary sees the page without facts and without a facts-shaped hole', async () => {
    peopleHc.profileFactsFor.mockResolvedValue([]);
    const html = await renderSubject(NELL);
    expect(html).toContain('Nell');
    expect(html).not.toMatch(/date of birth/i);
    expect(html).not.toContain('disabled');
  });

  it('an unknown subject is the one 404', async () => {
    peopleHc.circlePeople.mockResolvedValue([]);
    await expect(renderSubject('22222222-0000-4000-8000-00000000ffff')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
