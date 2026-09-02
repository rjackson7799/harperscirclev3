import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { stepUpFor } from '@/lib/auth/step-up-cookie';

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
  documentAudienceDerived: vi.fn(),
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

// 7D · R2/F-1: the page's authorization input for the category OFFER —
// hc.circle_people already hands the caller her own levels.
const peopleHc = { circlePeople: vi.fn() };
vi.mock('@/lib/hc/people', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/people')>('@/lib/hc/people');
  return { ...actual, ...peopleHc };
});

const tasksHc = { myMembership: vi.fn() };
vi.mock('@/lib/hc/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/tasks')>('@/lib/hc/tasks');
  return { ...actual, ...tasksHc };
});

const reviewHc = { extractionsFor: vi.fn() };
vi.mock('@/lib/hc/review', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hc/review')>('@/lib/hc/review');
  return { ...actual, ...reviewHc };
});

let stepUpCookie: string | null = null;
// 7D · R2/F-3: the companion that says what the token is FOR. Defaults to
// this document's own share so the pre-existing cases read unchanged.
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
const DOC = '66666666-0000-4000-8000-000000000006';
const ARRIVAL = '55555555-0000-4000-8000-000000000005';
const TASK = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const EVENT = 'bbbbbbbb-0000-4000-8000-0000000000b1';
const MARISOL = '44444444-0000-4000-8000-000000000005';
const SHARE = 'cccccccc-0000-4000-8000-0000000000c1';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };
const ME_M = '44444444-0000-4000-8000-000000000004';
const ALL_MANAGE = {
  memories: 'manage',
  health: 'manage',
  schedule: 'manage',
  documents: 'manage',
  finances: 'manage',
};
/** 7D · R2/F-3: what a token minted for THIS document's share is for. */
const SHARE_FOR = stepUpFor('share_object', `document:${DOC}`);

const DETAIL = {
  id: DOC,
  circle_id: CIRCLE,
  subject_id: NELL,
  subject_name: 'Nell',
  subject_seq: 1,
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
      ...(stepUpCookie
        ? {
            cookie: [
              `hc-step-up=${stepUpCookie}`,
              ...(stepUpForCookie ? [`hc-step-up-for=${stepUpForCookie}`] : []),
            ].join('; '),
          }
        : {}),
    },
    body: form.toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stepUpCookie = null;
  stepUpForCookie = null;
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  docsHc.documentById.mockResolvedValue({ ...DETAIL });
  docsHc.documentReferences.mockResolvedValue([]);
  docsHc.documentShares.mockResolvedValue([]);
  docsHc.documentAudience.mockResolvedValue([]);
  docsHc.documentAudienceDerived.mockResolvedValue([]);
  docsHc.shareCandidates.mockResolvedValue([]);
  artifactsHc.readableRendition.mockResolvedValue(null);
  reviewHc.extractionsFor.mockResolvedValue([]);
  // A coordinator by default: manage on all five, so the pre-existing
  // manage cases read exactly as they did.
  tasksHc.myMembership.mockResolvedValue({ id: ME_M, tier: 'coordinator' });
  peopleHc.circlePeople.mockResolvedValue([
    {
      kind: 'member',
      member_id: ME_M,
      account_id: CLAIMS.sub,
      display_name: 'Sarah',
      tier: 'coordinator',
      slice: null,
      is_subject: false,
      subject_id: null,
      custodian_member_id: null,
      custodian_name: null,
      joined_at: '2026-08-01T10:00:00Z',
      invite_id: null,
      invite_expires_at: null,
      invite_status: null,
      levels: { [NELL]: ALL_MANAGE },
    },
  ]);
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

  it('a HIDDEN document is the SAME 404 even while the references read would refuse — the row decides first (gate r3)', async () => {
    docsHc.documentById.mockResolvedValue(null);
    docsHc.documentReferences.mockRejectedValue(new Error('references_refused'));
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

  it('the machine-read sibling is reachable per page through the ONE shared control, §6.9 label EXACTLY — a toggle that classifies, never a dead link', async () => {
    const html = await renderPage();
    const toggles = html.match(/machine-read — may contain errors/g) ?? [];
    expect(toggles.length).toBe(2); // one per page
    expect(html).toContain('review-machine-text-toggle');
    expect(html).not.toContain('text=1'); // no raw navigation to the sibling
  });

  it('the facts render with the citation page and the risk_class WORD', async () => {
    const html = await renderPage();
    expect(html).toContain('July 12, 2026');
    expect(html).toContain('high');
    expect(html).toMatch(/page\s*1/i);
  });
});


  // ---------------------------------------------------------------------
  // 7D · R2/F-6 — one component, one slice, two different answers.
  //
  // D10's discipline for this slice is "absent / empty / failed EACH SAID".
  // The sibling surface built from the same component in this same slice
  // says "No fields were read from this document." — this one argues
  // NOTHING: the facts section simply does not render, and neither does
  // the viewer when the rendition is absent. The neighbouring subject page
  // argues its silence explicitly.
  //
  // Marked CONTINGENT by the lens on a design spec it had not read; the
  // spec is not needed to settle it. Two surfaces, one component, two
  // answers to the same fact IS the defect, whichever answer a spec
  // prefers.
  // ---------------------------------------------------------------------
  it('at view with NO facts, the page says so — the ReviewScreen sentence, verbatim, because it is the same component and the same slice', async () => {
    docsHc.documentById.mockResolvedValue({ ...DETAIL, can_view: true });
    artifactsHc.readableRendition.mockResolvedValue({ page_count: 1, page_exts: ['png'] });
    reviewHc.extractionsFor.mockResolvedValue([]);
    const html = await renderPage();
    expect(html).toContain('No fields were read from this document.');
  });

  it('at view with NO rendition, the page says THAT too — a different fact, its own sentence', async () => {
    docsHc.documentById.mockResolvedValue({ ...DETAIL, can_view: true });
    artifactsHc.readableRendition.mockResolvedValue(null);
    reviewHc.extractionsFor.mockResolvedValue([]);
    const html = await renderPage();
    expect(html).toMatch(/isn&#x27;t ready yet|not ready/i);
    // and it is not confused with the facts sentence
    expect(html).toContain('No fields were read from this document.');
  });

  it('below view neither sentence appears — an absence is only said where the person could have seen the thing (settled item 2)', async () => {
    const html = await renderPage();
    expect(html).not.toContain('No fields were read from this document.');
    expect(html).not.toMatch(/isn&#x27;t ready yet/i);
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
    stepUpForCookie = SHARE_FOR;
    const html = await renderPage({ share: MARISOL });
    expect(html).toContain(`action="/${CIRCLE}/documents/${DOC}/share/submit"`);
    expect(html).toContain(`value="${MARISOL}"`);
    expect(html).toMatch(/one document.*one person/i);
    expect(html).toMatch(/never the domain/i);
    expect(html).toMatch(/nothing derived|never .*derived/i);
  });
  // ---------------------------------------------------------------------
  // 7D · R2/F-3 (+ R3/F-8, which closes with it).
  //
  // The §5.7 binding is real and server-side: hc.consume_step_up matches
  // BOTH operation and target_ref, so a token cannot cross. What crossed was
  // the APP'S BELIEF — one cookie name, `hc-step-up`, holding whatever was
  // minted last, and three surfaces reading its mere presence as proof. A
  // coordinator holding a live `raise_grant` token opened a document and was
  // shown "Share it with Marisol" with no password, and the click dead-ended
  // at "That couldn't be done just now." while the honest e=step-up copy sat
  // unreachable. The route then CLEARED the cookie, burning an unrelated
  // step-up over a refusal the database had consumed nothing for.
  // ---------------------------------------------------------------------
  it("a token minted for another operation is not confirmation here — the page offers the PASSWORD, not the share it cannot complete", async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = stepUpFor('raise_grant', `${MARISOL}:${NELL}:health`);
    const html = await renderPage({ share: MARISOL });
    expect(html).toContain('action="/account/step-up/submit"');
    expect(html).not.toContain(`action="/${CIRCLE}/documents/${DOC}/share/submit"`);
  });

  it('a token minted for ANOTHER DOCUMENT is not confirmation either — the target_ref is half the binding', async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = stepUpFor('share_object', 'document:99999999-0000-4000-8000-000000000099');
    const html = await renderPage({ share: MARISOL });
    expect(html).toContain('action="/account/step-up/submit"');
    expect(html).not.toContain(`action="/${CIRCLE}/documents/${DOC}/share/submit"`);
  });

  it('a token with NO companion at all is not confirmation — fail closed', async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = null;
    const html = await renderPage({ share: MARISOL });
    expect(html).toContain('action="/account/step-up/submit"');
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
  // ---------------------------------------------------------------------
  // 7D · R2/F-1 — the round's most serious product row.
  //
  // Plan C2 is BINDING: a re-categorise is "refused (AND NOT OFFERED) unless
  // the member holds manage on both domains". This page's only authorization
  // input was `can_manage` over the document's CURRENT taint, so every other
  // category was offered unconditionally — and the database's named
  // `audience_refused` landed in the manage block's catch-all, which returns
  // loadFailed: the whole detail page, the shares list and the share control
  // gone, replaced by "We couldn't load this document just now."
  //
  // This is the r3 defect's mechanism at a second call site. D2's "THE ROW
  // DECIDES FIRST now" was applied to the references read, not to the class.
  //
  // The remedy needs no DDL: hc.circle_people already returns the caller's
  // own `levels`, and lib/hc/people#circlePeople is already wired.
  // ---------------------------------------------------------------------
  const HEALTH_ONLY = {
    memories: 'hidden',
    health: 'manage',
    schedule: 'hidden',
    documents: 'view',
    finances: 'view',
  };

  function callerHolds(levels: Record<string, string> | null) {
    tasksHc.myMembership.mockResolvedValue({ id: ME_M, tier: 'family' });
    peopleHc.circlePeople.mockResolvedValue([
      {
        kind: 'member',
        member_id: ME_M,
        account_id: CLAIMS.sub,
        display_name: 'Sarah',
        tier: 'family',
        slice: null,
        is_subject: false,
        subject_id: null,
        custodian_member_id: null,
        custodian_name: null,
        joined_at: '2026-08-01T10:00:00Z',
        invite_id: null,
        invite_expires_at: null,
        invite_status: null,
        levels: { [NELL]: levels },
      },
    ]);
  }


  // ---------------------------------------------------------------------
  // 7D · R2/F-4 — "revocable in one action", displayed as true where it is
  // false.
  //
  // hc.revoke_share REFUSES a live assignment-created share (ADR-0033 D19.2
  // ruling; unassign is the door, PRD §4.5.6). The page rendered Unshare for
  // every row hc.shares_for returned — and it already READ the
  // discriminating column, using "· came with a task" as a LABEL and
  // nothing more. So §4.3.5's promise was displayed as true for a row where
  // the button cannot work, and nothing on screen named the way out.
  // ---------------------------------------------------------------------
  it('a share that came with a task offers NO Unshare — the button that cannot work is not rendered', async () => {
    docsHc.documentShares.mockResolvedValue([
      {
        share_id: SHARE,
        member_id: MARISOL,
        display_name: 'Marisol',
        tier: 'care_circle',
        granted_by: CLAIMS.sub,
        granter_name: 'Sarah',
        granted_at: '2026-08-30T10:00:00Z',
        created_by_assignment_of: TASK,
      },
    ]);
    const html = await renderPage();
    expect(html).not.toContain('Unshare');
    expect(html).not.toContain(`value="${SHARE}"`);
  });

  it('and it says in WORDS what withdraws it, with the task linked — the door named, not just the wall', async () => {
    docsHc.documentShares.mockResolvedValue([
      {
        share_id: SHARE,
        member_id: MARISOL,
        display_name: 'Marisol',
        tier: 'care_circle',
        granted_by: CLAIMS.sub,
        granter_name: 'Sarah',
        granted_at: '2026-08-30T10:00:00Z',
        created_by_assignment_of: TASK,
      },
    ]);
    const html = await renderPage();
    expect(html).toContain(`href="/${CIRCLE}/tasks/${TASK}"`);
    expect(html).toMatch(/came with a task/i);
    expect(html).toMatch(/taking the task back|unassign/i);
  });

  it('an ordinary share still unshares in ONE action — the promise holds where it is true', async () => {
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
    const html = await renderPage();
    expect(html).toContain('Unshare');
    expect(html).toContain(`value="${SHARE}"`);
  });
  it('the category offer is AUTHORIZED: only categories whose domain the caller manages are offered — never the whole enum', async () => {
    callerHolds(HEALTH_ONLY);
    const html = await renderPage();
    // health: medications and labs (medical is the current category)
    expect(html).toContain('value="medications"');
    expect(html).toContain('value="labs"');
    // finances and documents are held at `view`, so nothing there is offered
    expect(html).not.toContain('value="financial"');
    expect(html).not.toContain('value="insurance"');
    expect(html).not.toContain('value="legal"');
    expect(html).not.toContain('value="other"');
  });

  it('a hand-built ?move= into a domain the caller does not manage previews NOTHING — not offered means not previewed', async () => {
    callerHolds(HEALTH_ONLY);
    const html = await renderPage({ move: 'financial' });
    expect(docsHc.documentAudience).not.toHaveBeenCalled();
    expect(html).not.toMatch(/Move it to Financial/);
  });

  it('a caller whose levels are not knowable is offered nothing at all — fail closed, never the whole enum', async () => {
    callerHolds(null);
    const html = await renderPage();
    expect(html).not.toContain('name="move"');
  });

  it("the audience read has its own catch: the DB's named refusal lands on ?e=refused, NOT on loadFailed swallowing the whole page", async () => {
    docsHc.documentAudience.mockRejectedValue(new Error('audience_refused'));
    await expect(renderPage({ move: 'financial' })).rejects.toThrow(
      `NEXT_REDIRECT /${CIRCLE}/documents/${DOC}?e=refused`,
    );
  });


  // ---------------------------------------------------------------------
  // 7D · R2/F-2 — the preview names the DOCUMENT audience, and ADR-0034 D7
  // ruled that "the preview and the entry NAME the derived objects whose
  // holders change level", citing hc.document_audience_derived as the
  // artifact. The entry does. The preview did not: re-verified, that
  // function had ZERO callers in app, lib, components, tests and e2e.
  //
  // The sharp edge is the SENTENCE. "No one gains or loses access." is a
  // positive assurance, rendered whenever the DOCUMENT audience is empty —
  // including while a task holder is about to lose her task.
  //
  // The function exists, is granted to `authenticated`, and is gated by the
  // IDENTICAL predicate as hc.document_audience, so it discloses nothing
  // new: a wrapper, one Promise.all slot, one sentence.
  // ---------------------------------------------------------------------
  it("the derived objects are NAMED: a task holder about to lose her task is said, not covered by 'No one gains or loses access.'", async () => {
    docsHc.documentAudience.mockResolvedValue([]);
    docsHc.documentAudienceDerived.mockResolvedValue([
      {
        object_type: 'task',
        object_id: TASK,
        label: 'Call the pharmacy',
        holder_member_id: MARISOL,
        holder_name: 'Marisol',
        before: 'view',
        after: 'hidden',
        change: 'lost',
      },
    ]);
    const html = await renderPage({ move: 'financial' });
    expect(docsHc.documentAudienceDerived).toHaveBeenCalledWith(
      expect.anything(),
      DOC,
      'financial',
    );
    expect(html).toContain('Marisol');
    expect(html).toContain('Call the pharmacy');
    expect(html).not.toContain('No one gains or loses access.');
  });

  it("the assurance survives only when BOTH answers are empty — that is the whole of what it may claim", async () => {
    docsHc.documentAudience.mockResolvedValue([]);
    docsHc.documentAudienceDerived.mockResolvedValue([]);
    const html = await renderPage({ move: 'financial' });
    expect(html).toContain('No one gains or loses access.');
  });

  it('a derived row the caller may not name is counted, never named — the definer nulls the label and the page must not invent one', async () => {
    docsHc.documentAudience.mockResolvedValue([]);
    docsHc.documentAudienceDerived.mockResolvedValue([
      {
        object_type: 'task',
        object_id: TASK,
        label: null,
        holder_member_id: MARISOL,
        holder_name: 'Marisol',
        before: null,
        after: null,
        change: 'lost',
      },
    ]);
    const html = await renderPage({ move: 'financial' });
    expect(html).not.toContain('No one gains or loses access.');
    expect(html).toMatch(/Marisol/);
  });

  it('the derived read shares the audience read\'s catch: its refusal is the same ?e=refused, not a broken page', async () => {
    docsHc.documentAudienceDerived.mockRejectedValue(new Error('audience_refused'));
    await expect(renderPage({ move: 'financial' })).rejects.toThrow(
      `NEXT_REDIRECT /${CIRCLE}/documents/${DOC}?e=refused`,
    );
  });
  it('a refusal on the shares or candidates read still fails the page — only the audience read is narrowed', async () => {
    docsHc.documentShares.mockRejectedValue(new Error('boom'));
    const html = await renderPage();
    expect(html).toMatch(/couldn&#x27;t load this document/i);
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
  it("R3/F-8: a token for another operation is not sent to the definer and is NOT BURNED — her unrelated step-up survives, and she is asked for the password instead", async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = stepUpFor('raise_grant', `${MARISOL}:${NELL}:health`);
    const POST = await shareRoute();
    const res = await POST(
      postTo(`/${CIRCLE}/documents/${DOC}/share/submit`, { member_id: MARISOL }),
      ctx,
    );
    expect(docsHc.shareDocument).not.toHaveBeenCalled();
    const q = new URL(res.headers.get('location')!, 'http://127.0.0.1:3000').searchParams;
    expect(q.get('e')).toBe('step-up');
    expect(q.get('share')).toBe(MARISOL);
    expect(res.headers.get('set-cookie')).toBeNull();
  });


  it('share with the token: the wrapper gets it, the cookie is cleared, the page re-opens shared', async () => {
    stepUpCookie = 'tok';
    stepUpForCookie = SHARE_FOR;
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
    stepUpForCookie = SHARE_FOR;
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
