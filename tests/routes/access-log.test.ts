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
  object_type: null,
  detail: {},
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
  // ── 7E · R4/F-8 (ADR-0038, ACCEPTED · TAKEN(7E)) ───────────────────────
  // The denial now CARRIES an object name. Before this the fixture had no
  // object_type and no detail, so the test below - titled "NEVER an object
  // name" - could not fail for naming one: there was nothing to name. It is
  // LOG-02's app-layer evidence, and it could not fail.
  //
  // `object_id` is deliberately absent: LOG_SELECT in lib/hc/people.ts does
  // not project it at all, so it cannot reach a page. That is a stronger
  // guarantee than a negative assertion and the reason none is written for
  // it here - the projection pin belongs with the SQL, not the render.
  object_type: 'document',
  detail: {
    title: 'Riverbend cardiology discharge summary · 12 Jul',
    category: 'medical',
  },
  collapsed_count: 7,
  occurred_at: '2026-08-29T10:00:00Z',
};

/** The object name the denial carries and the page must never print. */
const DENIED_OBJECT_NAME = DENIAL.detail.title;

/** The BODY of the one `@media print` block, brace-balanced, so an
 *  assertion cannot reach past its closing brace into the rest of the
 *  stylesheet. R4/F-8: the old `/@media print[\s\S]*\.left-nav/` did
 *  exactly that — `.log-entries` sits two lines BELOW the block. */
function printBlock(css: string): string {
  const at = css.indexOf('@media print');
  if (at < 0) throw new Error('no @media print block in the stylesheet');
  const start = css.indexOf('{', at);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error('unbalanced @media print block');
}

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

  it('a denial renders its collapsed count and NEVER an object name — with an object name present to leak (R4/F-8)', async () => {
    const html = await renderLog();
    expect(html).toContain('Dan');
    expect(html).toMatch(/7/);
    expect(html).toMatch(/tried to open something/i);
    // The fixture carries an object name and a category; neither may reach
    // the page. Render `e.detail.title` in the access_denied branch and this
    // is the assertion that fails — before, nothing did.
    expect(html).not.toContain(DENIED_OBJECT_NAME);
    expect(html).not.toContain('Riverbend');
    // …and the phrase stays the UNNAMED one, which is the whole promise.
    expect(html).toMatch(/tried to open something/i);
  });

  // ---------------------------------------------------------------------
  // 8C U1 · ADR-0040 D9.1 / Q-G: `task_claimed` "renders generically until
  // 8C words it". Generically means `humanize()` — "task claimed" — with
  // the actor appended AND the target appended, and on a claim those are
  // the SAME PERSON, so the log read "Marisol · task claimed · Marisol".
  // The entry exists precisely so the log can tell HANDED TO YOU from YOU
  // TOOK IT (ADR-0040 D4), and a sentence that names the claimant twice
  // tells the reader neither. It gets its own arm here.
  // ---------------------------------------------------------------------
  const CLAIMED = {
    seq: 42,
    event_type: 'task_claimed',
    actor_display_name: 'Marisol',
    target_name: 'Marisol',
    subject_id: NELL,
    subject_name: 'Nell',
    domain: null,
    level_before: null,
    level_after: null,
    object_type: 'task',
    detail: {},
    collapsed_count: 1,
    occurred_at: '2026-09-03T10:00:00Z',
  };

  it('a claim reads as a claim — the claimant named ONCE, and never as a hand-over (ADR-0040 D4, Q-G)', async () => {
    peopleHc.accessLog.mockResolvedValue([CLAIMED]);
    const html = await renderLog();
    const entry = /<li>(.*?)<\/li>/s.exec(html)?.[1] ?? '';
    expect(entry).toContain('took an unassigned task');
    expect(entry).toContain('Nell');
    // The generic renderer's shape is gone: no `humanize()` output, and the
    // claimant is not printed a second time as the target of her own act.
    expect(entry).not.toContain('task claimed');
    expect((entry.match(/Marisol/g) ?? []).length).toBe(1);
  });

  it('a hand-over and a claim do not read the same — the distinction the event type exists for', async () => {
    peopleHc.accessLog.mockResolvedValue([
      CLAIMED,
      { ...CLAIMED, seq: 41, event_type: 'task_assigned', actor_display_name: 'Sarah', target_name: 'Marisol' },
    ]);
    const html = await renderLog();
    const [claimed, assigned] = [...html.matchAll(/<li>(.*?)<\/li>/gs)].map((m) => m[1]);
    expect(claimed).toContain('took an unassigned task');
    expect(assigned).not.toContain('took an unassigned task');
  });


  // ---------------------------------------------------------------------
  // 7D · R4/F-3 — "Everything done with the record … it prints exactly the
  // entries below", over `order by seq desc limit 300` with no cursor, no
  // count and no disclosure. PPL-04's green cell says the surface
  // "subtracts nothing" and accessLog's docstring says it "simply orders
  // what the policy already decided."
  //
  // The failure is specific and load-bearing: `seq` 1 is the CUSTODIANSHIP
  // DECLARATION, the §7.5 row the whole subject page rests on, and it is
  // the FIRST row dropped — invisible from the surface that shows it,
  // because the subject page reads it with a separate `order by seq asc
  // limit 1`.
  //
  // Only the DISCLOSURE lands here. The cursor is the honest fix for an
  // accountability surface and is not producible in this increment: it is
  // OWED as OW-26, home slice 8.
  // ---------------------------------------------------------------------
  it('the page reads one MORE than it shows, so it can know whether it is showing everything', async () => {
    await renderLog();
    expect(peopleHc.accessLog).toHaveBeenCalledWith(expect.anything(), CIRCLE, 301);
  });

  it('inside the window, the promise is kept and unqualified — "exactly the entries below" is true here', async () => {
    peopleHc.accessLog.mockResolvedValue([ENTRY, DENIAL]);
    const html = await renderLog();
    expect(html).toMatch(/prints exactly the entries below/);
    expect(html).not.toMatch(/most recent 300/i);
  });

  it('past the window it SAYS SO, names what is missing, and shows exactly 300 — not 301', async () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ ...ENTRY, seq: 400 - i }));
    peopleHc.accessLog.mockResolvedValue(many);
    const html = await renderLog();
    expect(html).toMatch(/most recent 300/i);
    expect(html).toMatch(/older entries/i);
    // the custodianship declaration is the first row dropped, and the
    // surface that shows it must not imply it was never there
    expect(html).toMatch(/set up|earliest|custodian/i);
    expect((html.match(/<li>/g) ?? []).length).toBe(300);
    // and the unqualified promise is withdrawn where it is false
    expect(html).not.toMatch(/prints exactly the entries below/);
  });

  it('the disclosure survives PRINTING — it is not chrome, and the print block does not hide it', async () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ ...ENTRY, seq: 400 - i }));
    peopleHc.accessLog.mockResolvedValue(many);
    const html = await renderLog();
    const disclosure = /<p class="meta"[^>]*>[^<]*most recent 300/i.exec(html);
    expect(disclosure).not.toBeNull();
    const css = readFileSync('app/globals.css', 'utf8');
    const printBlock = css.slice(css.indexOf('@media print'));
    const body = printBlock.slice(printBlock.indexOf('{'), printBlock.indexOf('}', printBlock.indexOf('display: none')));
    expect(body).not.toMatch(/\.meta\b/);
  });
  it('the page is printable: the print block hides the chrome INSIDE its own braces, and never the entries (R4/F-8)', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const block = printBlock(css);
    // The chrome, hidden — each selector named, and INSIDE the block. The
    // old form was /@media print[\s\S]*\.left-nav/, which spans the whole
    // stylesheet: it matches a `.left-nav` written anywhere below the block,
    // and passes just as well against a print block that hides the entries.
    for (const sel of ['.left-nav', '.topbar', '.back-link', 'button', '.record-controls']) {
      expect(block, `the print block hides ${sel}`).toContain(sel);
    }
    expect(block).toMatch(/display:\s*none/);
    // And the entries NOT hidden — the half the title claims and the old
    // assertion never checked. Every display:none rule in the block is read,
    // and none of them may reach the log.
    const hiddenRules = block
      .split('}')
      .filter((rule) => /display:\s*none/.test(rule))
      .join(' ');
    expect(hiddenRules).not.toMatch(/\.log-entries/);
    expect(hiddenRules).not.toMatch(/\bmain\b/);
    // The block knows about the entries and keeps them deliberately.
    expect(block).toMatch(/\.log-entries li[\s\S]*break-inside/);
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
