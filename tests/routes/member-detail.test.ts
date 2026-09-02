import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { stepUpFor } from '@/lib/auth/step-up-cookie';
import { DOMAINS, GRANT_LEVELS, LEVEL_RANK } from '@/lib/permissions/phrases';

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
/** 7D · R2/F-3: the companion that says what the token is FOR. */
let stepUpForCookie: string | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === 'hc-step-up') return stepUpCookie ? { name, value: stepUpCookie } : undefined;
      if (name === 'hc-step-up-for')
        return stepUpForCookie ? { name, value: stepUpForCookie } : undefined;
      return undefined;
    },
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
/** 7D · R2/F-3: what a token minted for THIS raise is for. */
const RAISE_FOR = stepUpFor('raise_grant', `${RUTH_M}:${NELL}:health`);

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
      ...(stepUpCookie
        ? {
            cookie: [
              `hc-step-up=${stepUpCookie}`,
              ...(stepUpForCookie ? [`hc-step-up-for=${stepUpForCookie}`] : []),
            ].join('; '),
          }
        : {}),
    },
    body: new URLSearchParams(body).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stepUpCookie = null;
  stepUpForCookie = null;
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
  // 7D · R3/F-7 + R4/F-6. The page re-declared DOMAINS and LEVELS — a third
  // and a fourth copy of a list whose ONE source is the pinned module. These
  // read the module and assert the RENDERED offer against it, so a surface
  // and the ladder it offers from cannot drift without a red here.
  it('the offer IS the module: exactly DOMAINS gets a field and exactly GRANT_LEVELS a radio — nothing re-typed, nothing extra offered', async () => {
    const html = await renderPage(RUTH_M);
    const domains = [...html.matchAll(/name="domain" value="([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(domains)].sort()).toEqual([...DOMAINS].sort());
    const levels = [...html.matchAll(/name="level"[^>]*value="([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(levels)].sort()).toEqual([...GRANT_LEVELS].sort());
  });
  // ---------------------------------------------------------------------
  // 7D · R3/F-4 + R4/F-5 — ONE defect, filed by two lenses from two sides.
  //
  // hc.circle_people's own contract is "null, not hidden, so 'not yours to
  // know' and 'he has none' cannot be confused". Under a freeze the definer
  // emits a NULL inner map for that subject. This page collapsed it with
  // `?? 'hidden'`, so the matrix stated every level as *Nothing* — a false
  // statement about access, on the surface whose entire job is stating
  // access — and then classified the LOWER that is the remedy as a RAISE,
  // demanding the password friction hc.set_grant deliberately refuses to
  // impose on revocation.
  //
  // R4 adds the type: PersonRow.levels was
  // Record<string, Record<string,string>> | null where the definer emits
  // Record<string, Record<string,string> | null> | null — so the type gave
  // a future caller no warning at all.
  // ---------------------------------------------------------------------
  it("a level that is not the caller's to know renders as its OWN sentence — never as *Nothing*, and never with radios that would post a guess", async () => {
    peopleHc.circlePeople.mockResolvedValue(
      PEOPLE.map((r) => (r.member_id === RUTH_M ? { ...r, levels: { [NELL]: null } } : { ...r })),
    );
    const html = await renderPage(RUTH_M);
    // no offer at all for that subject: nothing to submit, so nothing to
    // misclassify on the way back
    expect(html).not.toContain('name="level"');
    expect(html).not.toContain('>Nothing<');
    // and it SAYS so, rather than rendering an empty matrix that reads as
    // "he has none"
    expect(html).toMatch(/can&#x27;t say|cannot say|isn&#x27;t shown here/i);
  });

  it('a null inner map does not throw — Object.keys over it was the crash R4/F-5 names', async () => {
    peopleHc.circlePeople.mockResolvedValue(
      PEOPLE.map((r) => (r.member_id === RUTH_M ? { ...r, levels: { [NELL]: null } } : { ...r })),
    );
    await expect(renderPage(RUTH_M)).resolves.toBeTypeOf('string');
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


  // ---------------------------------------------------------------------
  // 7D · R3/F-3 — `rs` is the one raise param with neither set- nor
  // shape-validation, and it is concatenated RAW into the posted `next`. A
  // crafted same-origin link therefore makes this page render the green
  // "Changed. It's written in the family's log" immediately after the
  // coordinator proves her identity, with nothing changed and nothing
  // logged. Nothing WIDENS — the route's own UUID_RE and consume_step_up's
  // exact match both refuse — so this is honesty, not authorization. But a
  // false assertion on the access-control surface at the moment of
  // re-authentication is exactly the harm C4/C5 exist to prevent.
  // ---------------------------------------------------------------------
  it('a crafted rs cannot smuggle a marker into the posted next — the whole Raise section refuses a subject id that is not one', async () => {
    const html = await renderPage(RUTH_M, {
      rs: `${NELL}&changed=1`,
      rd: 'health',
      rl: 'view',
    });
    expect(html).not.toContain('changed=1');
    expect(html).not.toContain('Raise access');
  });


  it('the no-op marker is READ by the page, and it does not claim the log (R3/F-1, D3’s standing rule)', async () => {
    const html = await renderPage(RUTH_M, { unchanged: '1' });
    expect(html).toMatch(/already/i);
    expect(html).not.toContain("written in the family&#x27;s log");
  });
  it('a well-formed rs still renders the section, and the next it posts carries exactly the three raise params', async () => {
    const html = await renderPage(RUTH_M, { rs: NELL, rd: 'health', rl: 'view' });
    expect(html).toContain('Raise access');
    const next = /name="next" value="([^"]+)"/.exec(html)![1].replace(/&amp;/g, '&');
    const q = new URL(next, 'http://127.0.0.1:3000').searchParams;
    expect([...q.keys()].sort()).toEqual(['rd', 'rl', 'rs']);
    expect(q.get('rs')).toBe(NELL);
  });

  // 7D · R2/F-3, the same defect on this surface: one cookie name held
  // whatever was minted last, and this page read its presence as proof.
  it("a token minted for a SHARE is not confirmation of a raise — the page asks for the password rather than offering Raise it", async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = stepUpFor('share_object', 'document:66666666-0000-4000-8000-000000000006');
    const html = await renderPage(RUTH_M, { rs: NELL, rd: 'health', rl: 'view' });
    expect(html).toContain('action="/account/step-up/submit"');
    expect(html).not.toContain('Raise it');
  });

  it('a raise token for a DIFFERENT subject or domain is not confirmation of this one', async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = stepUpFor('raise_grant', `${RUTH_M}:${NELL}:finances`);
    const html = await renderPage(RUTH_M, { rs: NELL, rd: 'health', rl: 'view' });
    expect(html).toContain('action="/account/step-up/submit"');
    expect(html).not.toContain('Raise it');
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
  // 7D · R3/F-7. The route held a FOURTH copy of both lists. Derived from
  // the module now, and driven here across the module's own values so a
  // divergence is a red rather than a silently narrower surface.
  it('every domain the module names reaches the definer, and every level it names is accepted (the sets are DERIVED)', async () => {
    peopleHc.setGrant.mockResolvedValue({ changed: true });
    const POST = await grantRoute();
    for (const domain of DOMAINS) {
      peopleHc.setGrant.mockClear();
      const res = await POST(
        postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
          subject_id: NELL,
          domain,
          level: 'hidden',
        }),
        ctx,
      );
      expect(res.headers.get('location')).toContain('changed=1');
      expect(peopleHc.setGrant).toHaveBeenCalledWith(CLAIMS, RUTH_M, NELL, domain, 'hidden', null);
    }
  });

  it('a LOWER to any level the module names posts straight through; only a RAISE is bounced', async () => {
    // Ruth is `summary` on health, so hidden and log are lowers and view and
    // manage are raises — the ladder's own arithmetic, read from the module.
    peopleHc.setGrant.mockResolvedValue({ changed: true });
    const POST = await grantRoute();
    for (const level of GRANT_LEVELS) {
      peopleHc.setGrant.mockClear();
      const res = await POST(
        postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
          subject_id: NELL,
          domain: 'health',
          level,
        }),
        ctx,
      );
      const lower = LEVEL_RANK[level] <= LEVEL_RANK.summary;
      expect(res.headers.get('location')).toContain(lower ? 'changed=1' : 'e=step-up');
      expect(peopleHc.setGrant).toHaveBeenCalledTimes(lower ? 1 : 0);
    }
  });
  // 7D · R3/F-4. The write path's half: an unknowable level cannot be
  // compared, so the route must not GUESS the direction. Guessing `hidden`
  // made every change look like a raise and charged a lower a password.
  it("a level the caller cannot read is not guessed at: the route posts through and lets hc.set_grant decide, rather than charging a LOWER the raise's password", async () => {
    peopleHc.setGrant.mockResolvedValue({ changed: true });
    peopleHc.circlePeople.mockResolvedValue(
      PEOPLE.map((r) => (r.member_id === RUTH_M ? { ...r, levels: { [NELL]: null } } : { ...r })),
    );
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'log',
      }),
      ctx,
    );
    expect(res.headers.get('location')).not.toContain('e=step-up');
    expect(peopleHc.setGrant).toHaveBeenCalledTimes(1);
  });


  const ctx = { params: Promise.resolve({ circle: CIRCLE, member: RUTH_M }) };
  async function grantRoute() {
    return (await import('@/app/(app)/[circle]/people/[member]/grant/submit/route')).POST;
  }
  // ---------------------------------------------------------------------
  // 7D · R3/F-1 — the page says a thing happened that did not.
  //
  // hc.set_grant's no-op arm returns `'changed', false` and WRITES NOTHING:
  // no grant row, no log entry, no token demanded. This route discarded the
  // return and redirected `?changed=1`, and the page rendered "Changed.
  // It's written in the family's log, with both levels." as a role="status".
  // Two false statements on the two surfaces the slice exists to make
  // honest, reachable by the single interaction the pre-checked form
  // invites - and reachable with NO misclick at all when a peer coordinator
  // raises the level between the e=step-up bounce and the click.
  // ---------------------------------------------------------------------
  it('a no-op is not reported as a change: the definer says changed:false and the route carries that, not a cheerful default', async () => {
    peopleHc.setGrant.mockResolvedValue({
      member_id: RUTH_M,
      subject_id: NELL,
      domain: 'health',
      before: 'summary',
      after: 'summary',
      changed: false,
    });
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'summary',
      }),
      ctx,
    );
    const q = new URL(res.headers.get('location')!, 'http://127.0.0.1:3000').searchParams;
    expect(q.get('changed')).toBeNull();
    expect(q.get('unchanged')).toBe('1');
  });

  it('a real change still says so', async () => {
    peopleHc.setGrant.mockResolvedValue({
      member_id: RUTH_M,
      subject_id: NELL,
      domain: 'health',
      before: 'summary',
      after: 'log',
      changed: true,
    });
    const POST = await grantRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/people/${RUTH_M}/grant/submit`, {
        subject_id: NELL,
        domain: 'health',
        level: 'log',
      }),
      ctx,
    );
    expect(res.headers.get('location')).toContain('changed=1');
  });


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
    stepUpForCookie = RAISE_FOR;
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
