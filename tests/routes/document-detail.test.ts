import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7C C2 · /[circle]/documents/[document] and the three writes (PRD §4.3.2–
// §4.3.5; TSD §1.3; DOC-02/03/04 app halves; AC-DOC-3/5/6; settled item 2).
//
//   · at `summary` the detail is a list of SENTENCES: title · category ·
//     dates · the three sentences · the source (arrival LINKED when visible) ·
//     the approver and when — and NO viewer, NO facts, NO control implying
//     either, and NO disabled control anywhere (the design spec's "no greyed
//     items": a disabled control implies the artifact exists in a form this
//     person could be shown);
//   · at `view` the SAME page gains the pages — every byte through
//     GET /api/artifact/[arrival]?page=N, the ONE path — with the
//     machine-read sibling reachable per page (&text=1) labelled with §6.9's
//     exact string, and the facts with citation and the risk_class word;
//   · at `manage` it gains who it has been shared with (granter named),
//     unshare in ONE action, share behind the §5.7 step-up bound to
//     document:<id> with §4.3.5's rules said on screen, and re-categorise
//     with the exact before-and-after audience named BEFORE the move and the
//     preview binding the move (expected_category);
//   · references: everything in the record that references it — LINKED when
//     visible, counted-never-named when not.
//
// Test class: MOCKED ROUTE CONTRACT (the live authority:
// tests/hc/documents.test.ts and the C6 documents legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const docsHc = {
  documentById: vi.fn(),
  documentReferences: vi.fn(),
  documentShares: vi.fn(),
  documentAudience: vi.fn(),
  shareCandidates: vi.fn(),
  shareDocument: vi.fn(),
  unshareDocument: vi.fn(),
  recategorizeDocument: vi.fn(),
};
vi.mock('@/lib/hc/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/documents')>('@/lib/hc/documents');
  return { ...actual, ...docsHc };
});

const artifactsHc = { readableRendition: vi.fn() };
vi.mock('@/lib/hc/artifacts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/artifacts')>('@/lib/hc/artifacts');
  return { ...actual, ...artifactsHc };
});

const reviewHc = { extractionsFor: vi.fn() };
vi.mock('@/lib/hc/review', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/review')>('@/lib/hc/review');
  return { ...actual, ...reviewHc };
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
const DOC = '66666666-0000-4000-8000-000000000006';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const TASK = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const EVENT = 'bbbbbbbb-0000-4000-8000-0000000000b1';
const MARISOL = '44444444-0000-4000-8000-000000000005';
const SHARE = 'cccccccc-0000-4000-8000-0000000000c1';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const DETAIL = {
  id: DOC,
  circle_id: CIRCLE,
  subject_id: NELL,
  subject_name: 'Nell',
  title: 'Discharge summary · Jul 12',
  category: 'medical',
  summary_text:
    'Nell was discharged after observation. Wound care continues twice daily. Follow-up is booked.',
  artifact_arrival_id: ARRIVAL,
  filed_at: '2026-07-12T15:00:00Z',
  approved_at: '2026-07-12T15:00:00Z',
  approver_display_name: 'Sarah',
  taint: ['health'],
  taint_resolved: true,
  can_view: false,
  can_manage: false,
  source: {
    arrival_id: ARRIVAL,
    channel: 'email',
    sender_display_name: 'Riverbend Cardiology',
    sender_address: 'records@riverbend.example',
    received_at: '2026-07-12T09:00:00Z',
  },
};

async function renderPage(sp: Record<string, string> = {}) {
  const { default: Page } = await import('@/app/(app)/[circle]/documents/[document]/page');
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ circle: CIRCLE, document: DOC }),
      searchParams: Promise.resolve(sp),
    }),
  );
}

function postTo(path: string, body: Record<string, string>) {
  const form = new URLSearchParams(body);
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(stepUpCookie ? { cookie: `hc-step-up=${stepUpCookie}` } : {}),
    },
    body: form.toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stepUpCookie = null;
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  docsHc.documentById.mockResolvedValue({ ...DETAIL });
  docsHc.documentReferences.mockResolvedValue([]);
  docsHc.documentShares.mockResolvedValue([]);
  docsHc.documentAudience.mockResolvedValue([]);
  docsHc.shareCandidates.mockResolvedValue([]);
  artifactsHc.readableRendition.mockResolvedValue(null);
  reviewHc.extractionsFor.mockResolvedValue([]);
});

describe('the detail at summary — a list of sentences, not a viewer (settled item 2)', () => {
  it('renders title, category, the sentences, the source with the arrival linked, the approver and when — and neither viewer nor control', async () => {
    const html = await renderPage();
    expect(html).toContain('Discharge summary · Jul 12');
    expect(html).toContain('Medical');
    expect(html).toContain('Wound care continues twice daily.');
    expect(html).toContain('Riverbend Cardiology');
    expect(html).toContain(`href="/${CIRCLE}/inbox/${ARRIVAL}"`);
    expect(html).toContain('Sarah');
    // no viewer, no "what we read", no share, no re-categorise, and no
    // disabled control implying any of them
    expect(html).not.toContain('<img');
    expect(html).not.toContain('machine-read');
    expect(html).not.toContain('/api/artifact/');
    expect(html).not.toContain('Share this document');
    expect(html).not.toContain('Re-categorise');
    expect(html).not.toContain('disabled');
  });

  it('the extractions read is NEVER made below can_view — a throw there is a page defect, not "no facts"', async () => {
    await renderPage();
    expect(reviewHc.extractionsFor).not.toHaveBeenCalled();
    expect(artifactsHc.readableRendition).not.toHaveBeenCalled();
  });

  it('an unknown document is the one 404', async () => {
    docsHc.documentById.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('the detail at view — the pages through the ONE byte path, the sibling labelled with §6.9 exact words', () => {
  beforeEach(() => {
    docsHc.documentById.mockResolvedValue({ ...DETAIL, can_view: true });
    artifactsHc.readableRendition.mockResolvedValue({ page_count: 2, page_exts: ['png', 'png'] });
    reviewHc.extractionsFor.mockResolvedValue([
      {
        field: 'discharge_date',
        value: 'July 12, 2026',
        confidence: 0.98,
        risk_class: 'high',
        citation: { page: 1, bbox: [0.1, 0.1, 0.4, 0.2] },
        model_id: 'm',
        prompt_version: 'hc-6b-3',
      },
    ]);
  });

  it('every page renders through GET /api/artifact/[arrival]?page=N — and through nothing else', async () => {
    const html = await renderPage();
    expect(html).toContain(`src="/api/artifact/${ARRIVAL}?page=1"`);
    expect(html).toContain(`src="/api/artifact/${ARRIVAL}?page=2"`);
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of srcs) {
      expect(src.startsWith(`/api/artifact/${ARRIVAL}?page=`)).toBe(true);
    }
  });

  it('the machine-read sibling is reachable per page and carries §6.9 label EXACTLY', async () => {
    const html = await renderPage();
    expect(html).toContain(`href="/api/artifact/${ARRIVAL}?page=1&amp;text=1"`);
    expect(html).toContain('machine-read — may contain errors');
  });

  it('the facts render with the citation page and the risk_class WORD', async () => {
    const html = await renderPage();
    expect(html).toContain('July 12, 2026');
    expect(html).toContain('high');
    expect(html).toMatch(/page\s*1/i);
  });
});

describe('references — linked when visible, counted never named', () => {
  it('a visible task links to its page; a visible event to its page; an invisible referent is a count with no name and no link', async () => {
    docsHc.documentReferences.mockResolvedValue([
      { object_type: 'task', object_id: TASK, label: 'Follow the discharge instructions', visible: true },
      { object_type: 'timeline_event', object_id: EVENT, label: 'Discharged home', visible: true },
      { object_type: 'task', object_id: null, label: null, visible: false },
    ]);
    const html = await renderPage();
    expect(html).toContain(`href="/${CIRCLE}/tasks/${TASK}"`);
    expect(html).toContain('Follow the discharge instructions');
    expect(html).toContain(`href="/${CIRCLE}/timeline/${EVENT}"`);
    expect(html).toMatch(/task you can(&#x27;|')t see/i);
  });
});

describe('the detail at manage — shares, unshare in one action, share behind step-up, re-categorise with the audience named first', () => {
  beforeEach(() => {
    docsHc.documentById.mockResolvedValue({ ...DETAIL, can_view: true, can_manage: true });
    artifactsHc.readableRendition.mockResolvedValue({ page_count: 1, page_exts: ['png'] });
    docsHc.documentShares.mockResolvedValue([
      {
        share_id: SHARE,
        member_id: MARISOL,
        display_name: 'Marisol',
        tier: 'care_circle',
        granted_by: CLAIMS.sub,
        granter_name: 'Sarah',
        granted_at: '2026-08-30T10:00:00Z',
        created_by_assignment_of: null,
      },
    ]);
    docsHc.shareCandidates.mockResolvedValue([
      { member_id: MARISOL, display_name: 'Marisol', tier: 'care_circle' },
    ]);
  });

  it('who it has been shared with, granter named, and unshare is ONE form with the share id', async () => {
    const html = await renderPage();
    expect(html).toContain('Marisol');
    expect(html).toContain('Sarah');
    expect(html).toContain(`action="/${CIRCLE}/documents/${DOC}/unshare/submit"`);
    expect(html).toContain(`value="${SHARE}"`);
  });

  it('share, phase 1: no live token — the step-up form bound to share_object + document:<id>', async () => {
    const html = await renderPage({ share: MARISOL });
    expect(html).toContain('action="/account/step-up/submit"');
    expect(html).toContain('value="share_object"');
    expect(html).toContain(`value="document:${DOC}"`);
  });

  it('share, phase 2: the token is live — the confirmation states §4.3.5 rules and posts the share', async () => {
    stepUpCookie = 'tok';
    const html = await renderPage({ share: MARISOL });
    expect(html).toContain(`action="/${CIRCLE}/documents/${DOC}/share/submit"`);
    expect(html).toContain(`value="${MARISOL}"`);
    expect(html).toMatch(/one document.*one person/i);
    expect(html).toMatch(/never the domain/i);
    expect(html).toMatch(/nothing derived|never .*derived/i);
  });

  it('re-categorise: the preview names the exact before-and-after audience BEFORE the move and binds it', async () => {
    docsHc.documentAudience.mockResolvedValue([
      {
        member_id: MARISOL,
        display_name: 'Marisol',
        tier: 'care_circle',
        before: 'summary',
        after: 'hidden',
        change: 'lost',
      },
    ]);
    const html = await renderPage({ move: 'financial' });
    expect(docsHc.documentAudience).toHaveBeenCalledWith(expect.anything(), DOC, 'financial');
    expect(html).toMatch(/moves it out of health/i);
    expect(html).toMatch(/Marisol will no longer be able to see it/);
    expect(html).toContain(`action="/${CIRCLE}/documents/${DOC}/recategorize/submit"`);
    expect(html).toContain('name="category" value="financial"');
    expect(html).toContain('name="expected_category" value="medical"');
  });
});

describe('the three writes', () => {
  async function shareRoute() {
    return (await import('@/app/(app)/[circle]/documents/[document]/share/submit/route')).POST;
  }
  async function unshareRoute() {
    return (await import('@/app/(app)/[circle]/documents/[document]/unshare/submit/route')).POST;
  }
  async function recategorizeRoute() {
    return (await import('@/app/(app)/[circle]/documents/[document]/recategorize/submit/route'))
      .POST;
  }
  const ctx = { params: Promise.resolve({ circle: CIRCLE, document: DOC }) };

  it('share without a live token bounces to the step-up phase, calling nothing', async () => {
    const POST = await shareRoute();
    const res = await POST(postTo(`/${CIRCLE}/documents/${DOC}/share/submit`, { member_id: MARISOL }), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=step-up');
    expect(docsHc.shareDocument).not.toHaveBeenCalled();
  });

  it('share with the token: the wrapper gets it, the cookie is cleared, the page re-opens shared', async () => {
    stepUpCookie = 'tok';
    docsHc.shareDocument.mockResolvedValue({ object_type: 'document', object_id: DOC, member_id: MARISOL });
    const POST = await shareRoute();
    const res = await POST(postTo(`/${CIRCLE}/documents/${DOC}/share/submit`, { member_id: MARISOL }), ctx);
    expect(docsHc.shareDocument).toHaveBeenCalledWith(CLAIMS, DOC, MARISOL, 'tok');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('shared=1');
    expect(res.headers.get('set-cookie')).toContain('hc-step-up=;');
  });

  it('a refused share clears the token and says so without leaking the reason', async () => {
    stepUpCookie = 'tok';
    docsHc.shareDocument.mockRejectedValue(new Error('share_refused'));
    const POST = await shareRoute();
    const res = await POST(postTo(`/${CIRCLE}/documents/${DOC}/share/submit`, { member_id: MARISOL }), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=refused');
    expect(res.headers.get('set-cookie')).toContain('hc-step-up=;');
  });

  it('unshare is one action; a refusal is one shape', async () => {
    docsHc.unshareDocument.mockResolvedValue({ share_id: SHARE });
    const POST = await unshareRoute();
    const res = await POST(postTo(`/${CIRCLE}/documents/${DOC}/unshare/submit`, { share_id: SHARE }), ctx);
    expect(docsHc.unshareDocument).toHaveBeenCalledWith(CLAIMS, SHARE);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('unshared=1');

    docsHc.unshareDocument.mockRejectedValue(new Error('revoke_refused'));
    const res2 = await POST(postTo(`/${CIRCLE}/documents/${DOC}/unshare/submit`, { share_id: SHARE }), ctx);
    expect(res2.headers.get('location')).toContain('e=refused');
  });

  it('re-categorise: the move the person confirmed; a changed source is e=changed; a refusal e=refused', async () => {
    docsHc.recategorizeDocument.mockResolvedValue({ document_id: DOC, category: 'financial', domain: 'finances', changed: true });
    const POST = await recategorizeRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/documents/${DOC}/recategorize/submit`, {
        category: 'financial',
        expected_category: 'medical',
      }),
      ctx,
    );
    expect(docsHc.recategorizeDocument).toHaveBeenCalledWith(CLAIMS, DOC, 'financial', 'medical');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('moved=1');

    docsHc.recategorizeDocument.mockRejectedValue(new Error('document_changed'));
    const res2 = await POST(
      postTo(`/${CIRCLE}/documents/${DOC}/recategorize/submit`, {
        category: 'financial',
        expected_category: 'medical',
      }),
      ctx,
    );
    expect(res2.headers.get('location')).toContain('e=changed');
  });

  it('a category outside the seven never reaches the wrapper', async () => {
    const POST = await recategorizeRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/documents/${DOC}/recategorize/submit`, {
        category: 'secrets',
        expected_category: 'medical',
      }),
      ctx,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('e=refused');
    expect(docsHc.recategorizeDocument).not.toHaveBeenCalled();
  });
});
