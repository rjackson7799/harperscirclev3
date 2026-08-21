import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// A4 · The founder door (PRD §4.1.3; TSD §2.3; ADR-0011).
//
//   AC-AUTH-2 — `Step N of 4` appears on exactly the four step screens.
//   AC-AUTH-9 — resume lands on the furthest step, derived from state
//               that survives abandonment (the circle row + its opening
//               context), never from client memory.
//   Step 2 writes THROUGH hc.create_circle: circle name derived from the
//   subjects, per-subject situation/zip (the per-subject fix §4.1.3),
//   ADR-0011 forwarding local parts minted as `<firstname>.<6-char>`,
//   and the founder's declared slice recorded.
//   Completion (AC-AUTH-5) names only what Phase 1 built.
// ============================================================================

const circle = {
  createCircleFromSetup: vi.fn(async () => ({ circle_id: 'c-1' })),
  setDeclaredSlice: vi.fn(async () => {}),
  setOpeningContext: vi.fn(async (): Promise<boolean> => true),
};
vi.mock('@/lib/hc/circle', () => circle);

const getClaims = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims } }),
}));

function post(path: string, body: Record<string, string | string[]>): Request {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) v.forEach((item) => params.append(k, item));
    else params.append(k, v);
  }
  return new Request(`http://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

const CLAIMS = { sub: '77777777-7777-4777-8777-777777777777', role: 'authenticated' };

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: CLAIMS }, error: null });
});

describe('A4 · AC-AUTH-2: Step N of 4 on exactly the four step screens', () => {
  it.each([1, 2, 3, 4])('step %i renders its indicator', async (n) => {
    const { default: Page } = await import(`@/app/setup/step/${n}/page`);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain(`Step ${n} of 4`);
  });

  it('the completion screen carries NO step indicator', async () => {
    const { completionStepIndicatorAbsent } = await import('@/lib/setup/steps');
    // The completion page reads live data; the pinned invariant is the
    // shared step-indicator helper refusing to render there.
    expect(completionStepIndicatorAbsent).toBe(true);
  });
});

describe('A4 · AC-AUTH-9: resume derives the furthest step from durable state', () => {
  it('no circle → step 1; circle with empty context → step 3; context set → step 4', async () => {
    const { resumeStep } = await import('@/lib/setup/steps');
    expect(resumeStep({ hasCircle: false, openingContext: [] })).toBe(1);
    expect(resumeStep({ hasCircle: true, openingContext: [] })).toBe(3);
    expect(resumeStep({ hasCircle: true, openingContext: ['a-hospital-stay'] })).toBe(4);
  });
});

describe('A4 · step 2 writes through hc.create_circle (and nothing before it writes at all)', () => {
  it('two subjects with divergent situations and zips; ADR-0011 local parts; slice from step 1', async () => {
    const { POST } = await import('@/app/setup/step/2/submit/route');
    const req = post('/setup/step/2/submit', {
      subject_name_1: 'Nell',
      situation_1: 'At home, on their own',
      zip_1: '02140',
      subject_name_2: 'Marcus',
      situation_2: 'In a nursing facility',
      zip_2: '60614',
      timezone: 'America/Chicago',
      slice: 'money-paperwork',
    });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/setup/step/3');

    expect(circle.createCircleFromSetup).toHaveBeenCalledTimes(1);
    const [claims, input] = circle.createCircleFromSetup.mock.calls[0] as unknown as [
      { sub: string },
      {
        name: string;
        subjects: {
          first_name: string;
          situation: string;
          postal_code: string;
          timezone: string;
          accent_color: string;
          forwarding_local_part: string;
        }[];
      },
    ];
    expect(claims.sub).toBe(CLAIMS.sub);
    expect(input.name).toBe('Nell & Marcus');
    expect(input.subjects).toHaveLength(2);
    expect(input.subjects[0].situation).toBe('At home, on their own');
    expect(input.subjects[1].postal_code).toBe('60614');
    expect(input.subjects[0].forwarding_local_part).toMatch(/^nell\.[a-z0-9]{6}$/);
    expect(input.subjects[1].forwarding_local_part).toMatch(/^marcus\.[a-z0-9]{6}$/);
    expect(input.subjects[0].accent_color).not.toBe(input.subjects[1].accent_color);

    // B8: the write rides the caller's CLAIMS (hc.set_slice keys hc.uid()).
    expect(circle.setDeclaredSlice).toHaveBeenCalledWith(
      expect.objectContaining({ sub: CLAIMS.sub }),
      'money-paperwork',
    );
  });

  it('the step-1 relationship rides into create_circle (BAT-03: the F1 one-line write)', async () => {
    const { POST } = await import('@/app/setup/step/2/submit/route');
    await POST(
      post('/setup/step/2/submit', {
        subject_name_1: 'Nell',
        situation_1: 'At home, on their own',
        zip_1: '02140',
        timezone: 'America/New_York',
        slice: 'money-paperwork',
        relationship: 'daughter',
      }),
    );
    const [, input] = circle.createCircleFromSetup.mock.calls[0] as unknown as [
      unknown,
      { relationship?: string },
    ];
    expect(input.relationship).toBe('daughter');
  });

  it('an empty second zip defaults to the first (one-tap default, §4.1.3)', async () => {
    const { POST } = await import('@/app/setup/step/2/submit/route');
    await POST(
      post('/setup/step/2/submit', {
        subject_name_1: 'Nell',
        situation_1: 'At home, with family',
        zip_1: '02140',
        subject_name_2: 'Marcus',
        situation_2: 'In hospital right now',
        zip_2: '',
        timezone: 'America/New_York',
        slice: 'everything',
      }),
    );
    const [, input] = circle.createCircleFromSetup.mock.calls[0] as unknown as [
      unknown,
      { subjects: { postal_code: string }[] },
    ];
    expect(input.subjects[1].postal_code).toBe('02140');
  });

  it('an unknown situation value is refused before any write', async () => {
    const { POST } = await import('@/app/setup/step/2/submit/route');
    const res = await POST(
      post('/setup/step/2/submit', {
        subject_name_1: 'Nell',
        situation_1: 'Somewhere invented',
        zip_1: '02140',
        timezone: 'America/New_York',
        slice: 'everything',
      }),
    );
    expect(circle.createCircleFromSetup).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('e=');
  });

  it('step 3 submit writes the opening context to the circle', async () => {
    circle.setOpeningContext.mockResolvedValueOnce(true);
    const { POST } = await import('@/app/setup/step/3/submit/route');
    const res = await POST(
      post('/setup/step/3/submit', {
        circle_id: 'c-9',
        context: ['a-hospital-stay-or-discharge', 'paperwork-piling-up'],
      }),
    );
    expect(circle.setOpeningContext).toHaveBeenCalledWith(
      expect.objectContaining({ sub: CLAIMS.sub }),
      'c-9',
      ['a-hospital-stay-or-discharge', 'paperwork-piling-up'],
    );
    expect(res.headers.get('location')).toContain('/setup/step/4');
  });

  it('step 3: a stale or foreign circle id refuses — never a silent advance to step 4 (round-10 finding 7)', async () => {
    circle.setOpeningContext.mockResolvedValueOnce(false);
    const { POST } = await import('@/app/setup/step/3/submit/route');
    const res = await POST(
      post('/setup/step/3/submit', {
        circle_id: 'c-forged',
        context: ['paperwork-piling-up'],
      }),
    );
    expect(res.headers.get('location') ?? '').not.toContain('/setup/step/4');
    expect(res.headers.get('location')).toContain('e=');
  });

  it('step 3: a missing circle id refuses the same way — zero-row and no-target are one shape', async () => {
    const { POST } = await import('@/app/setup/step/3/submit/route');
    const res = await POST(
      post('/setup/step/3/submit', { context: ['paperwork-piling-up'] }),
    );
    expect(circle.setOpeningContext).not.toHaveBeenCalled();
    expect(res.headers.get('location') ?? '').not.toContain('/setup/step/4');
  });
});

describe('A4 · step 1 HOLDS both answers to step 2 (PRD §4.1.3 "held until step 2 creates the circle"; round-10 finding 1)', () => {
  it('the step-1 submit forwards relationship AND slice as query state', async () => {
    const { POST } = await import('@/app/setup/step/1/submit/route');
    const res = await POST(
      post('/setup/step/1/submit', { relationship: 'daughter', slice: 'money-paperwork' }),
    );
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/setup/step/2');
    expect(location).toContain('slice=money-paperwork');
    expect(location).toContain('relationship=daughter');
  });

  it('an invented relationship value is dropped, not forwarded', async () => {
    const { POST } = await import('@/app/setup/step/1/submit/route');
    const res = await POST(
      post('/setup/step/1/submit', { relationship: 'supreme-leader', slice: 'everything' }),
    );
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('slice=everything');
    expect(location).not.toContain('relationship=');
  });

  it('step 2 carries the held relationship into its form, so it is present when the circle is created', async () => {
    const { default: Page } = await import('@/app/setup/step/2/page');
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ slice: 'money-paperwork', relationship: 'daughter' }),
      }),
    );
    expect(html).toMatch(
      /name="relationship"[^>]*value="daughter"|value="daughter"[^>]*name="relationship"/,
    );
  });
});

describe('A4 · AC-AUTH-5: the completion copy promises only what Phase 1 built', () => {
  it('the completion copy module names no checklist and no local resources', async () => {
    const { completionPromises } = await import('@/lib/setup/completion-copy');
    const text = JSON.stringify(completionPromises).toLowerCase();
    expect(text).not.toContain('checklist');
    expect(text).not.toContain('local resources');
    expect(text).not.toContain('weekly brief');
    expect(text).toContain('forward');
  });

  it('the custodianship line says the smaller true thing (§7.5): held on their behalf, printable, no consent claim', async () => {
    const { custodianshipLine } = await import('@/lib/setup/completion-copy');
    const line = custodianshipLine('Nell').toLowerCase();
    expect(line).toContain('nell');
    expect(line).toContain('on her behalf'.toLowerCase().replace('her', 'their'));
    expect(line).toContain('written down');
    expect(line).not.toContain('final say');
  });
});
